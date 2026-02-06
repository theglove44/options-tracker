import { fetchTransactionsViaRefreshToken } from '../_tastytrade.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { accountNumber, startDate, endDate } = req.query || {};
  if (!accountNumber || typeof accountNumber !== 'string') {
    return res.status(400).json({ error: 'accountNumber query parameter is required' });
  }

  try {
    const transactions = await fetchTransactionsViaRefreshToken({
      accountNumber,
      startDate: typeof startDate === 'string' ? startDate : undefined,
      endDate: typeof endDate === 'string' ? endDate : undefined,
    });

    return res.status(200).json({ data: transactions });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load transactions',
    });
  }
}
