export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Dynamic import to catch module-level errors
    const { fetchAccountsViaRefreshToken } = await import('../_tastytrade.js');
    const accounts = await fetchAccountsViaRefreshToken();
    return res.status(200).json({ data: accounts });
  } catch (error) {
    // Catch absolutely everything
    const errorMessage = error instanceof Error 
      ? `${error.name}: ${error.message}` 
      : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error('Accounts endpoint error:', errorMessage, errorStack);
    
    return res.status(500).json({
      error: errorMessage,
      stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
    });
  }
}
