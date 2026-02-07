# Options Trade Tracker

A React-based analytics dashboard for options trading performance. Import trades from TastyTrade (CSV export or live API) and get instant visibility into strategy performance, P&L breakdowns, win rates, and more.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

### Data Import
- **CSV Upload** - Import TastyTrade broker CSV exports directly in the browser
- **Live API Import** - Connect to TastyTrade via OAuth and pull transaction history in real time
- Automatic data normalization for dates, quantities, and financial values

### Strategy Detection
Trades are automatically grouped and classified into named strategies:

| Legs | Strategy |
|------|----------|
| 1 | Naked Call, Naked Put, Long Call, Long Put, Cash-Secured Put |
| 2 | Vertical Call Spread, Vertical Put Spread, Strangle, Straddle |
| 4 | Iron Condor, Iron Butterfly |

Rolls are detected when an open and close occur in the same event, preserving strategy continuity.

### Analytics Dashboard
Five dedicated views for analyzing performance:

- **Dashboard** - Overview with stats cards, filterable strategy table, win rate, average duration, and ROC
- **0DTE** - Filtered view for same-day expiration trades (SPX, XSP, RUT, /ES)
- **By Symbol** - P&L aggregated per underlying with per-symbol win rates
- **By Strategy** - P&L aggregated by strategy type (Iron Condor, Vertical Spread, etc.)
- **AI Insights** - AI-powered analysis of trading patterns and risk metrics

### Trade Lifecycle Tracking
- FIFO inventory matching for opening and closing legs
- Partial close tracking with per-leg close history
- Special handling for cash-settled positions (SPX), expirations, assignments, and exercises
- Buying power estimation per strategy type

---

## Quick Start

### Prerequisites
- Node.js 20+
- npm

### Install and Run

```bash
git clone https://github.com/theglove44/options-tracker.git
cd options-tracker
npm install
npm run dev
```

Open the URL shown in the terminal. Upload a TastyTrade CSV to start analyzing trades immediately.

---

## TastyTrade API Setup

To import transactions directly from TastyTrade, you need OAuth credentials.

### 1. Get Your Credentials

Generate a refresh token, client ID, and client secret from the [TastyTrade Developer Portal](https://developer.tastytrade.com).

### 2. Create a `.env` File

```bash
TASTYTRADE_REFRESH_TOKEN=<your-jwt-refresh-token>
TASTYTRADE_CLIENT_ID=<your-client-uuid>
TASTYTRADE_CLIENT_SECRET=<your-hex-secret>
TASTYTRADE_API_BASE_URL=https://api.tastytrade.com

# Optional: prefill account number in the UI
VITE_TASTYTRADE_ACCOUNT_NUMBER=5WT00001
```

### 3. Start with API Routes

```bash
npm run dev:local
```

This starts both the Vite dev server and a local API server on port 8787. The Vite dev server proxies `/api/*` requests to the local API server automatically.

### 4. Import Transactions

1. Click **Import from API** in the app
2. Click **Load Accounts** to fetch your TastyTrade accounts
3. Select an account, optionally set a date range
4. Click **Import Transactions from API**

Imported transactions are converted to the same internal format as CSV imports, so all analytics work identically regardless of import method.

---

## Development

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (CSV import only, no API routes) |
| `npm run dev:local` | Start Vite + local API server (full functionality) |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run token:access` | Generate a short-lived access token from refresh credentials |

### Dev Modes

**`npm run dev`** - Frontend only. CSV upload works, API routes do not. Use this when you only need to work on the UI or trade processing logic.

**`npm run dev:local`** - Full stack. Automatically generates a fresh access token from your refresh credentials, starts a local API server on port 8787, and starts Vite with a proxy. Use this when working on API integration or testing the full import flow.

---

## Architecture

### Project Structure

```
options-tracker/
├── api/
│   ├── _tastytrade.js              # OAuth token exchange + TastyTrade API client
│   └── tastytrade/
│       ├── accounts.js             # GET /api/tastytrade/accounts (Vercel function)
│       └── transactions.js         # GET /api/tastytrade/transactions (Vercel function)
├── scripts/
│   ├── dev-local.sh                # Local dev startup (token gen + servers)
│   ├── get-access-token.sh         # Standalone token generation
│   └── local-api-server.mjs        # Local API server (port 8787)
├── src/
│   ├── App.jsx                     # Main app component + all views
│   ├── components/
│   │   └── AIInsights.jsx          # AI-powered trade analysis view
│   └── lib/
│       ├── formatters.js           # Currency and date formatting
│       ├── tastytradeApi.js        # Transaction-to-row mapping + option symbol parsing
│       ├── tradeAnalytics.js       # Stats computation, filtering, P&L aggregation
│       └── tradeProcessing.js      # CSV parsing, FIFO matching, strategy detection
└── vite.config.js                  # Vite config with API proxy
```

### Data Flow

```
TastyTrade CSV / API Response
        │
        ▼
   Parse & Normalize
   (parseCSV / mapTastytradeTransactionsToRows)
        │
        ▼
   Process Trade Rows
   (processTradeRows)
        │
        ├── Group by order ID / contract + timestamp
        ├── FIFO inventory matching (open → close)
        ├── Strategy detection (leg count + type analysis)
        └── Roll detection (simultaneous open + close)
        │
        ▼
   Strategy Objects
   (id, legs, P&L, fees, status, dates)
        │
        ▼
   Analytics & Views
   (computeStats, getPLPerSymbolData, getPLPerStrategyData)
```

### Authentication Flow

```
resolveAccessToken()
    │
    ├── 1. Try @tastytrade/api SDK (axios, auto User-Agent)
    │       POST /oauth/token with refresh_token
    │
    ├── 2. Fallback: manual HTTPS request
    │       POST /oauth/token (form-urlencoded, explicit User-Agent)
    │
    └── 3. Last resort: static TASTYTRADE_ACCESS_TOKEN env var
```

> **Important:** TastyTrade's nginx proxy requires a `User-Agent` header on all requests. Node.js `fetch` and `https.request` don't set one by default. All requests in `_tastytrade.js` include `User-Agent: options-tracker/1.0`.

---

## Deployment

### Vercel

This project is designed for deployment on Vercel. The `api/` directory contains serverless functions that handle TastyTrade API communication server-side.

1. Connect your GitHub repo to Vercel
2. Set environment variables in Vercel project settings:
   - `TASTYTRADE_REFRESH_TOKEN`
   - `TASTYTRADE_CLIENT_ID`
   - `TASTYTRADE_CLIENT_SECRET`
   - `TASTYTRADE_API_BASE_URL` = `https://api.tastytrade.com`
   - `VITE_TASTYTRADE_ACCOUNT_NUMBER` (optional)
3. Deploy

All OAuth credentials stay server-side. The frontend only receives account lists and transaction data.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Tailwind CSS 3, Lucide Icons |
| Build | Vite 7 |
| API Client | `@tastytrade/api` SDK (axios), Node.js `https` fallback |
| Deployment | Vercel Serverless Functions |
| Dev Tooling | ESLint, PostCSS, Autoprefixer |

---

## License

MIT
