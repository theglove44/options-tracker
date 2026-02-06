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
  return text || `HTTP ${response.status}`;
};

const requestJson = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Unexpected non-JSON response from tastytrade API.');
  }
  return response.json();
};

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
};

const loadConfig = () => ({
  baseUrl: normalizeBaseUrl(process.env.TASTYTRADE_API_BASE_URL),
  clientId: requireEnv('TASTYTRADE_CLIENT_ID'),
  clientSecret: requireEnv('TASTYTRADE_CLIENT_SECRET'),
  refreshToken: requireEnv('TASTYTRADE_REFRESH_TOKEN'),
});

const exchangeRefreshToken = async ({ baseUrl, clientId, clientSecret, refreshToken }) => {
  const url = new URL('/oauth/token', baseUrl);
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', refreshToken);
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);

  const payload = await requestJson(url.toString(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const accessToken = payload?.access_token || payload?.data?.access_token || payload?.data?.['access-token'];
  if (!accessToken) throw new Error('OAuth token response missing access token.');
  return accessToken;
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
  const accessToken = await exchangeRefreshToken(config);
  const payload = await requestAccountJson({
    baseUrl: config.baseUrl,
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
  const accessToken = await exchangeRefreshToken(config);
  const items = [];
  let pageOffset = 0;

  for (let page = 0; page < MAX_TRANSACTION_PAGES; page += 1) {
    const payload = await requestAccountJson({
      baseUrl: config.baseUrl,
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
