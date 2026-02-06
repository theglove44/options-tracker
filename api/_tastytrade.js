import { createHash } from 'node:crypto';

const DEFAULT_BASE_URL = 'https://api.tastytrade.com';
const MAX_TRANSACTION_PAGES = 200;
const TRANSACTION_PAGE_SIZE = 2000;

const normalizeBaseUrl = (baseUrl) => (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');

const extractItems = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

const extractPagination = (payload) => payload?.pagination || payload?.data?.pagination || null;

const parseApiError = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    if (payload?.error?.message) return payload.error.message;
    if (payload?.error_description) return payload.error_description;
    if (payload?.error_code) return payload.error_code;
    if (payload?.message) return payload.message;
  }
  const text = await response.text().catch(() => '');
  if (text) {
    const titleMatch = text.match(/<title>([^<]+)<\/title>/i);
    const h1Match = text.match(/<h1>([^<]+)<\/h1>/i);
    const summary = titleMatch?.[1] || h1Match?.[1];
    if (summary) return summary.trim();
  }
  return `HTTP ${response.status}`;
};

const requestJson = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const parsedMessage = await parseApiError(response);
    throw new Error(`HTTP ${response.status}: ${parsedMessage}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Unexpected non-JSON response from tastytrade API.');
  }
  return response.json();
};

const sanitizeEnvValue = (value) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  const normalized = sanitizeEnvValue(value);
  if (!normalized) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return normalized;
};

const loadConfig = () => ({
  baseUrl: normalizeBaseUrl(process.env.TASTYTRADE_API_BASE_URL),
  clientId: requireEnv('TASTYTRADE_CLIENT_ID'),
  clientSecret: requireEnv('TASTYTRADE_CLIENT_SECRET'),
  refreshToken: requireEnv('TASTYTRADE_REFRESH_TOKEN'),
});

const fingerprint = (value) => createHash('sha256').update(value).digest('hex').slice(0, 12);

const buildRefreshTokenCandidates = (refreshToken) => {
  const candidates = new Set([refreshToken]);

  try {
    const decoded = decodeURIComponent(refreshToken);
    if (decoded && decoded !== refreshToken) {
      candidates.add(decoded);
    }
  } catch {
    // keep original only
  }

  if (refreshToken.includes(' ')) {
    candidates.add(refreshToken.replace(/ /g, '+'));
  }

  return [...candidates];
};

const buildBaseUrlCandidates = (configuredBaseUrl) => {
  const normalizedConfigured = normalizeBaseUrl(configuredBaseUrl);
  const candidates = new Set([normalizedConfigured]);

  if (normalizedConfigured.includes('api.tastytrade.com')) {
    candidates.add('https://api.tastyworks.com');
  }

  if (normalizedConfigured.includes('api.tastyworks.com')) {
    candidates.add('https://api.tastytrade.com');
  }

  return [...candidates];
};

const exchangeRefreshToken = async ({ baseUrl, clientId, clientSecret, refreshToken }) => {
  const callTokenEndpoint = async ({ oauthBaseUrl, useBasicAuth, refreshTokenCandidate }) => {
    const url = new URL('/oauth/token', oauthBaseUrl);
    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', refreshTokenCandidate);
    if (!useBasicAuth) {
      body.set('client_id', clientId);
      body.set('client_secret', clientSecret);
    }

    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (useBasicAuth) {
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      headers.Authorization = `Basic ${credentials}`;
    }

    try {
      const payload = await requestJson(url.toString(), {
        method: 'POST',
        headers,
        body: body.toString(),
      });
      return { payload, error: null };
    } catch (error) {
      return {
        payload: null,
        error: error instanceof Error ? error.message : 'Unknown OAuth token error',
      };
    }
  };

  const refreshTokenCandidates = buildRefreshTokenCandidates(refreshToken);
  const baseUrlCandidates = buildBaseUrlCandidates(baseUrl);
  const failures = [];

  for (const oauthBaseUrl of baseUrlCandidates) {
    for (const refreshTokenCandidate of refreshTokenCandidates) {
      const postResult = await callTokenEndpoint({
        oauthBaseUrl,
        useBasicAuth: false,
        refreshTokenCandidate,
      });
      if (postResult.payload) {
        const accessToken = postResult.payload?.access_token
          || postResult.payload?.data?.access_token
          || postResult.payload?.data?.['access-token'];
        if (!accessToken) throw new Error('OAuth token response missing access token.');
        return { accessToken, resolvedBaseUrl: oauthBaseUrl };
      }

      const basicResult = await callTokenEndpoint({
        oauthBaseUrl,
        useBasicAuth: true,
        refreshTokenCandidate,
      });
      if (basicResult.payload) {
        const accessToken = basicResult.payload?.access_token
          || basicResult.payload?.data?.access_token
          || basicResult.payload?.data?.['access-token'];
        if (!accessToken) throw new Error('OAuth token response missing access token.');
        return { accessToken, resolvedBaseUrl: oauthBaseUrl };
      }

      failures.push(
        `oauth_base=${oauthBaseUrl} token_fp=${fingerprint(refreshTokenCandidate)} `
        + `post_error=${postResult.error} basic_error=${basicResult.error}`,
      );
    }
  }

  throw new Error(
    `OAuth refresh failed using both client auth modes. `
    + `baseUrl=${baseUrl}. attempts=${failures.length}. `
    + `${failures.join(' | ')}. `
    + `client_id_fp=${fingerprint(clientId)} client_id_len=${clientId.length}. `
    + `client_secret_fp=${fingerprint(clientSecret)} client_secret_len=${clientSecret.length}. `
    + `refresh_fp=${fingerprint(refreshToken)} refresh_len=${refreshToken.length}.`,
  );
};

const requestAccountJson = async ({ baseUrl, accessToken, path, params = {} }) => {
  const url = new URL(path, baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    url.searchParams.set(key, String(value));
  });

  return requestJson(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });
};

export const fetchAccountsViaRefreshToken = async () => {
  const config = loadConfig();
  const { accessToken, resolvedBaseUrl } = await exchangeRefreshToken(config);
  const payload = await requestAccountJson({
    baseUrl: resolvedBaseUrl,
    accessToken,
    path: '/customers/me/accounts',
  });

  return extractItems(payload)
    .map((item) => ({
      accountNumber: item?.['account-number']
        || item?.account?.['account-number']
        || item?.accountNumber
        || '',
      nickname: item?.nickname
        || item?.account?.nickname
        || item?.account?.['account-type-name']
        || '',
      isClosed: Boolean(item?.['is-closed'] || item?.account?.['is-closed']),
    }))
    .filter((item) => item.accountNumber)
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
};

export const fetchTransactionsViaRefreshToken = async ({ accountNumber, startDate, endDate }) => {
  if (!accountNumber) throw new Error('accountNumber is required.');

  const config = loadConfig();
  const { accessToken, resolvedBaseUrl } = await exchangeRefreshToken(config);
  const items = [];
  let pageOffset = 0;

  for (let page = 0; page < MAX_TRANSACTION_PAGES; page += 1) {
    const payload = await requestAccountJson({
      baseUrl: resolvedBaseUrl,
      accessToken,
      path: `/accounts/${encodeURIComponent(accountNumber)}/transactions`,
      params: {
        sort: 'Asc',
        'per-page': TRANSACTION_PAGE_SIZE,
        'page-offset': pageOffset,
        'start-date': startDate,
        'end-date': endDate,
      },
    });

    const batch = extractItems(payload);
    items.push(...batch);

    const pagination = extractPagination(payload);
    const totalPages = Number(pagination?.['total-pages'] ?? pagination?.totalPages);
    const hasTotalPages = Number.isFinite(totalPages) && totalPages > 0;
    const hasNextLink = Boolean(pagination?.['next-link'] || pagination?.nextLink);

    if (hasTotalPages) {
      if (pageOffset + 1 >= totalPages) break;
      pageOffset += 1;
      continue;
    }

    if (hasNextLink) {
      pageOffset += 1;
      continue;
    }

    if (batch.length < TRANSACTION_PAGE_SIZE) break;
    pageOffset += 1;
  }

  return items;
};
