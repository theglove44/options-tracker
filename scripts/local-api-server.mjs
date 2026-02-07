#!/usr/bin/env node
import http from 'node:http';
import { URL } from 'node:url';
import { fetchAccountsViaRefreshToken, fetchTransactionsViaRefreshToken } from '../api/_tastytrade.js';

const DEFAULT_PORT = 8787;
const port = Number(process.env.LOCAL_API_PORT || DEFAULT_PORT);

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
};

const sendNotFound = (res) => sendJson(res, 404, { error: 'Not found' });

const server = http.createServer(async (req, res) => {
  if (!req.url) return sendNotFound(res);

  const requestUrl = new URL(req.url, `http://${req.headers.host || `localhost:${port}`}`);

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (requestUrl.pathname === '/api/tastytrade/accounts') {
    try {
      const accounts = await fetchAccountsViaRefreshToken();
      return sendJson(res, 200, { data: accounts });
    } catch (error) {
      return sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Failed to load accounts',
      });
    }
  }

  if (requestUrl.pathname === '/api/tastytrade/transactions') {
    const accountNumber = requestUrl.searchParams.get('accountNumber') || '';
    const startDate = requestUrl.searchParams.get('startDate') || undefined;
    const endDate = requestUrl.searchParams.get('endDate') || undefined;

    if (!accountNumber) {
      return sendJson(res, 400, { error: 'accountNumber query parameter is required' });
    }

    try {
      const transactions = await fetchTransactionsViaRefreshToken({
        accountNumber,
        startDate,
        endDate,
      });
      return sendJson(res, 200, { data: transactions });
    } catch (error) {
      return sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Failed to load transactions',
      });
    }
  }

  return sendNotFound(res);
});

server.listen(port, () => {
  console.log(`[local-api] listening on http://localhost:${port}`);
});
