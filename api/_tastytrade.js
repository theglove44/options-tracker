import { createHash } from 'node:crypto';
import https from 'node:https';

const DEFAULT_BASE_URL = 'https://api.tastytrade.com';
const MAX_TRANSACTION_PAGES = 200;
const TRANSACTION_PAGE_SIZE = 2000;
const TOKEN_PATH_CANDIDATES = ['/oauth/token', '/oauth2/token'];
const TOKEN_REQUEST_MODES = [
  { key: 'json_with_client', contentType: 'application/json', authMode: 'body_client_and_secret' },
  { key: 'json_secret_only', contentType: 'application/json', authMode: 'body_secret_only' },
  { key: 'form_with_client', contentType: 'application/x-www-form-urlencoded', authMode: 'body_client_and_secret' },
  { key: 'form_basic_auth', contentType: 'application/x-www-form-urlencoded', authMode: 'basic_auth' },
];

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

const parseErrorText = (text = '') => {
  if (!text) return '';
  const titleMatch = text.match(/<title>([^<]+)<\/title>/i);
  const h1Match = text.match(/<h1>([^<]+)<\/h1>/i);
  return (titleMatch?.[1] || h1Match?.[1] || text).trim();
};

const postWithHttps = async (url, headers, body) => new Promise((resolve, reject) => {
  const request = https.request(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Length': Buffer.byteLength(body),
      Connection: 'close',
    },
  }, (response) => {
    let responseBody = '';
    response.on('data', (chunk) => {
      responseBody += chunk;
    });
    response.on('end', () => {
      resolve({
        statusCode: response.statusCode || 0,
        headers: response.headers || {},
        body: responseBody,
      });
    });
  });

  request.on('error', (error) => reject(error));
  request.write(body);
  request.end();
});

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

const readOptionalEnv = (name) => {
  const value = process.env[name];
  if (!value || !value.trim()) return undefined;
  const normalized = sanitizeEnvValue(value);
  return normalized || undefined;
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

const normalizeScopeValue = (value) => {
  if (!value) return undefined;
  const normalized = value
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
  return normalized || undefined;
};

const parseJwtPayload = (token) => {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return null;

  const base64 = parts[1]
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');

  try {
    const decoded = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

const loadConfig = () => {
  const baseUrl = normalizeBaseUrl(process.env.TASTYTRADE_API_BASE_URL);
  const accessToken = readOptionalEnv('TASTYTRADE_ACCESS_TOKEN');
  const oauthScopes = normalizeScopeValue(process.env.TASTYTRADE_OAUTH_SCOPES || '');

  if (accessToken) {
    return {
      baseUrl,
      accessToken,
      oauthScopes,
      clientId: undefined,
      clientSecret: undefined,
      refreshToken: undefined,
    };
  }

  return {
    baseUrl,
    clientId: requireEnv('TASTYTRADE_CLIENT_ID'),
    clientSecret: requireEnv('TASTYTRADE_CLIENT_SECRET'),
    refreshToken: requireEnv('TASTYTRADE_REFRESH_TOKEN'),
    accessToken: undefined,
    oauthScopes,
  };
};

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

const buildScopeCandidates = ({ configuredScopes, refreshToken }) => {
  const candidates = new Set();
  if (configuredScopes) candidates.add(configuredScopes);

  const payload = parseJwtPayload(refreshToken);
  const inferredScope = normalizeScopeValue(typeof payload?.scope === 'string' ? payload.scope : '');
  if (inferredScope) candidates.add(inferredScope);

  candidates.add('');
  return [...candidates];
};

const getOAuthPayloadAccessToken = (payload) => payload?.access_token
  || payload?.data?.access_token
  || payload?.data?.['access-token'];

const buildTokenRequestBody = ({
  contentType,
  authMode,
  refreshTokenCandidate,
  scopeCandidate,
  clientId,
  clientSecret,
}) => {
  const tokenRequest = {
    grant_type: 'refresh_token',
    refresh_token: refreshTokenCandidate,
  };

  if (scopeCandidate) {
    tokenRequest.scope = scopeCandidate;
  }

  if (authMode === 'body_client_and_secret') {
    tokenRequest.client_id = clientId;
    tokenRequest.client_secret = clientSecret;
  } else if (authMode === 'body_secret_only') {
    tokenRequest.client_secret = clientSecret;
  }

  if (contentType === 'application/json') {
    return JSON.stringify(tokenRequest);
  }

  const body = new URLSearchParams();
  Object.entries(tokenRequest).forEach(([key, value]) => {
    body.set(key, value);
  });
  return body.toString();
};

const callTokenEndpoint = async ({
  oauthBaseUrl,
  oauthPath,
  refreshTokenCandidate,
  scopeCandidate,
  tokenRequestMode,
  clientId,
  clientSecret,
}) => {
  const url = new URL(oauthPath, oauthBaseUrl);
  const headers = {
    Accept: 'application/json',
    'Content-Type': tokenRequestMode.contentType,
  };

  if (tokenRequestMode.authMode === 'basic_auth') {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    headers.Authorization = `Basic ${credentials}`;
  }

  const body = buildTokenRequestBody({
    contentType: tokenRequestMode.contentType,
    authMode: tokenRequestMode.authMode,
    refreshTokenCandidate,
    scopeCandidate,
    clientId,
    clientSecret,
  });

  try {
    const response = await postWithHttps(url, headers, body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      const contentType = String(response.headers['content-type'] || '');
      let parsedMessage = '';
      if (contentType.includes('application/json')) {
        try {
          const payload = JSON.parse(response.body);
          parsedMessage = payload?.error?.message
            || payload?.error_description
            || payload?.error_code
            || payload?.message
            || '';
        } catch {
          parsedMessage = '';
        }
      }
      if (!parsedMessage) {
        parsedMessage = parseErrorText(response.body) || `HTTP ${response.statusCode}`;
      }
      throw new Error(`HTTP ${response.statusCode}: ${parsedMessage}`);
    }

    let payload = null;
    try {
      payload = JSON.parse(response.body);
    } catch {
      throw new Error('OAuth token endpoint returned non-JSON success response.');
    }

    return { payload, error: null };
  } catch (error) {
    return {
      payload: null,
      error: error instanceof Error ? error.message : 'Unknown OAuth token error',
    };
  }
};

const exchangeRefreshToken = async ({
  baseUrl,
  clientId,
  clientSecret,
  refreshToken,
  oauthScopes,
}) => {

  const refreshTokenCandidates = buildRefreshTokenCandidates(refreshToken);
  const baseUrlCandidates = buildBaseUrlCandidates(baseUrl);
  const scopeCandidates = buildScopeCandidates({
    configuredScopes: oauthScopes,
    refreshToken,
  });
  const failures = [];

  for (const oauthBaseUrl of baseUrlCandidates) {
    for (const refreshTokenCandidate of refreshTokenCandidates) {
      for (const oauthPath of TOKEN_PATH_CANDIDATES) {
        for (const scopeCandidate of scopeCandidates) {
          for (const tokenRequestMode of TOKEN_REQUEST_MODES) {
            const tokenResult = await callTokenEndpoint({
              oauthBaseUrl,
              oauthPath,
              refreshTokenCandidate,
              scopeCandidate,
              tokenRequestMode,
              clientId,
              clientSecret,
            });

            if (tokenResult.payload) {
              const accessToken = getOAuthPayloadAccessToken(tokenResult.payload);
              if (!accessToken) throw new Error('OAuth token response missing access token.');
              return { accessToken, resolvedBaseUrl: oauthBaseUrl };
            }

            failures.push(
              `oauth_base=${oauthBaseUrl} oauth_path=${oauthPath} mode=${tokenRequestMode.key} `
              + `scope=${scopeCandidate || '(none)'} token_fp=${fingerprint(refreshTokenCandidate)} `
              + `error=${tokenResult.error}`,
            );
          }
        }
      }
    }
  }

  const failurePreview = failures.slice(0, 8).join(' | ');
  throw new Error(
    `OAuth refresh failed across all request modes. `
    + `baseUrl=${baseUrl}. attempts=${failures.length}. `
    + `${failurePreview}. `
    + `client_id_fp=${fingerprint(clientId)} client_id_len=${clientId.length}. `
    + `client_secret_fp=${fingerprint(clientSecret)} client_secret_len=${clientSecret.length}. `
    + `refresh_fp=${fingerprint(refreshToken)} refresh_len=${refreshToken.length}. `
    + `configured_scope=${oauthScopes || '(none)'}.`,
  );
};

const resolveAccessToken = async (config) => {
  if (config.accessToken) {
    return {
      accessToken: config.accessToken,
      resolvedBaseUrl: config.baseUrl,
      source: 'direct_access_token',
    };
  }

  return {
    ...(await exchangeRefreshToken({
      baseUrl: config.baseUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: config.refreshToken,
      oauthScopes: config.oauthScopes,
    })),
    source: 'oauth_refresh',
  };
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
  const { accessToken, resolvedBaseUrl, source } = await resolveAccessToken(config);
  let payload;
  try {
    payload = await requestAccountJson({
      baseUrl: resolvedBaseUrl,
      accessToken,
      path: '/customers/me/accounts',
    });
  } catch (error) {
    if (source === 'direct_access_token' && error instanceof Error && error.message.startsWith('HTTP 401')) {
      throw new Error(
        'TASTYTRADE_ACCESS_TOKEN is unauthorized or expired. Generate a new access token and update this env var.',
      );
    }
    throw error;
  }

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
  const { accessToken, resolvedBaseUrl, source } = await resolveAccessToken(config);
  const items = [];
  let pageOffset = 0;

  try {
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
  } catch (error) {
    if (source === 'direct_access_token' && error instanceof Error && error.message.startsWith('HTTP 401')) {
      throw new Error(
        'TASTYTRADE_ACCESS_TOKEN is unauthorized or expired. Generate a new access token and update this env var.',
      );
    }
    throw error;
  }

  return items;
};
