// Simple health check - no auth, just validates the function runs
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  
  // Check if required env vars exist (don't expose values)
  const envStatus = {
    TASTYTRADE_REFRESH_TOKEN: Boolean(process.env.TASTYTRADE_REFRESH_TOKEN),
    TASTYTRADE_CLIENT_ID: Boolean(process.env.TASTYTRADE_CLIENT_ID),
    TASTYTRADE_CLIENT_SECRET: Boolean(process.env.TASTYTRADE_CLIENT_SECRET),
    TASTYTRADE_API_BASE_URL: process.env.TASTYTRADE_API_BASE_URL || '(not set, using default)',
  };
  
  const allCredsSet = envStatus.TASTYTRADE_REFRESH_TOKEN 
    && envStatus.TASTYTRADE_CLIENT_ID 
    && envStatus.TASTYTRADE_CLIENT_SECRET;

  return res.status(200).json({
    status: allCredsSet ? 'ready' : 'missing_credentials',
    env: envStatus,
    timestamp: new Date().toISOString(),
  });
}
