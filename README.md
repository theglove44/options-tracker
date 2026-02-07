# Options Tracker

Analyze options performance from either:

- A Tastytrade CSV export
- Direct Tastytrade API transactions (server-side OAuth via Vercel Functions)

## Development

```bash
npm install
npm run dev
```

## Secure API Import Setup (Vercel)

Set these as Vercel environment variables (Project Settings -> Environment Variables):

```bash
# Preferred immediate fallback (skips refresh exchange):
TASTYTRADE_ACCESS_TOKEN=...

# OAuth refresh flow (used when TASTYTRADE_ACCESS_TOKEN is not set):
TASTYTRADE_REFRESH_TOKEN=...
TASTYTRADE_CLIENT_ID=...
TASTYTRADE_CLIENT_SECRET=...
TASTYTRADE_API_BASE_URL=https://api.tastytrade.com
```

Optional frontend-only prefill:

```bash
VITE_TASTYTRADE_ACCOUNT_NUMBER=5WT00001
```

Then in the app:

1. Click `Import from API`
2. Optionally click `Load Accounts`
3. Choose an account and import transactions

The imported transactions are converted to the same internal row schema as the CSV flow, so all existing analytics remain unchanged.

## Local Development with API Routes

- `npm run dev` runs the Vite frontend only (CSV flow works, API routes do not).
- `npm run dev:local` runs both frontend and `/api/*` functions locally via Vercel CLI.

### Local Run (No Hosted Vercel Required)

1. Export your OAuth credentials in the same shell:

```bash
export TASTYTRADE_REFRESH_TOKEN=...
export TASTYTRADE_CLIENT_ID=...
export TASTYTRADE_CLIENT_SECRET=...
```

2. Generate a short-lived access token:

```bash
export TASTYTRADE_ACCESS_TOKEN="$(npm run -s token:access)"
```

3. Start the app locally with API routes:

```bash
npm run dev:local
```

4. Open the local URL shown in the terminal and use `Load Accounts` / `Import Transactions from API`.

Notes:
- `TASTYTRADE_ACCESS_TOKEN` expires quickly. Re-run step 2 when API calls start returning unauthorized.
- You can still use CSV upload anytime if API auth is unavailable.
