import { fetchAccountsViaRefreshToken } from '../_tastytrade.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const accounts = await fetchAccountsViaRefreshToken();
    return res.status(200).json({ data: accounts });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load accounts',
    });
  }
}
