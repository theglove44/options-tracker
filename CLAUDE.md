# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Options Trade Tracker** is a React + Vite web application for analyzing options trading performance. It processes broker CSV exports (TastyTrade format) to visualize trading strategies, track P&L, and generate performance analytics.

### Key Features
- CSV import and parsing for broker transaction data
- Strategy identification (Iron Condors, Vertical Spreads, Strangles, etc.)
- Multi-view dashboard: home, 0DTE trades, P&L per symbol, P&L per strategy type, AI insights
- Handles complex trade lifecycle: opens, rolls, expirations, assignments, cash settlements
- Comprehensive metrics: win rate, average duration, ROC, buying power estimation

## Development Commands

```bash
# Start dev server with HMR
npm run dev

# Build for production
npm run build

# Lint code
npm lint

# Preview production build
npm run preview
```

## Architecture

### Core Data Flow

1. **CSV Import** → `parseCSV()` in App.jsx parses broker CSV format
2. **Data Cleaning** → Normalizes dates, quantities, and financial values
3. **Event Grouping** → Groups trades by order ID or contract + timestamp
4. **Inventory Tracking** → FIFO matching of opening and closing legs
5. **Strategy Detection** → Names and categorizes based on legs (1-leg = simple, 2-leg = vertical spread, 4-leg = iron condor)
6. **View Rendering** → Different data views consume processed `tradeData`

### Key Data Structures

**Strategy Object:**
```javascript
{
  id: string,                    // OrderId or AUTO-{timestamp}
  dateOpen: Date,
  dateClosed: Date,
  underlying: string,            // e.g., "SPX"
  status: 'OPEN' | 'PARTIAL' | 'CLOSED',
  strategyName: string,          // Auto-named (with " (Rolled)" suffix if applicable)
  legs: Leg[],                   // Array of option legs
  totalPL: number,               // P&L after fees
  fees: number,                  // Total commissions/fees (negative)
  isRolled: boolean,
  orderIds: string[]
}
```

**Leg Object:**
```javascript
{
  contractId: string,            // `{underlying}-{expiration}-{strike}-{type}`
  type: 'CALL' | 'PUT',
  action: 'BUY' | 'SELL',
  quantity: number,
  openPrice: number,
  strike: number,
  expiration: Date,
  openDate: Date,
  costBasis: number,
  remainingQty: number,          // For tracking partial closes
  closedDetails: ClosedDetail[]  // History of closes
}
```

### Complex Processing

**Inventory Matching (Phase 1 & 2):**
- Phase 1 closes legs first using FIFO matching against inventory
- Phase 2 opens new positions, either as new strategies or rolls to existing ones
- Handles special cases: cash-settled positions (SPX), expirations, assignments, exercises

**Special Cases:**
- **Cash Settled Positions**: SPX and similar contracts report two simultaneous rows (Removal + Cash Settled). Processed in priority order to capture P&L correctly.
- **Rolls**: When both open and close happen in same event, mark `isRolled=true` and reuse the same strategy ID
- **0DTE Detection**: Identified by underlying (SPX, XSP, RUT, /ES) and same-day open/close

**Capital Estimation** (`estimateCapital()`):
- Long-only: sum of costBasis
- Vertical spreads: debit paid or max width × 100 × qty
- Iron condors: max width × 100 × qty
- Cash-secured puts: strike × 100 × qty
- Naked calls: conservative estimate (20% of strike)

### Views

1. **Home/0DTE Dashboard**: Filtered strategy list with stats (win rate, avg duration, ROC)
2. **P&L per Symbol**: Grouped by underlying with win rates
3. **P&L per Strategy Type**: Aggregated by strategy name (Iron Condor, Vertical Call Spread, etc.)
4. **AI Insights**: External component (AIInsights.jsx)

### State Management

- **tradeData**: Main processed array of strategies
- **expandedStrategies**: Tracks which strategies are expanded in the table
- **currentView**: Currently displayed dashboard view
- **filter/symbolFilter**: UI filters for status and symbol
- **stats**: Memoized calculations from currentContextData

## Code Patterns

### Formatting & Utility Functions
- `formatCurrency()`: Intl.NumberFormat for USD display
- `formatDate()`: toLocaleDateString for date display
- `safeFloat()`: Safely converts CSV strings to numbers, handling currency symbols and commas
- `getBadgeColor()`: Returns Tailwind color classes based on P&L sign

### CSV Parsing
Custom CSV parser handles quoted values and commas within fields. Removes BOM if present.

### Tailwind & Styling
- Dark theme: slate-900 background, slate-100 text
- Status colors: emerald (positive), rose (negative), slate/indigo (neutral)
- Lucide icons for UI elements
- Responsive grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`

## Important Implementation Details

- **P&L Calculation**: `totalPL` already includes fees (negative), so "Net P&L (After Fees)" = totalPL directly
- **Closed Details Storage**: Each leg tracks its close history separately, enabling partial closes and multiple close events
- **Date Handling**: Uses Date objects internally, formatted for display only
- **Filtered Data**: `currentContextData` includes view-specific filtering (0DTE only in that view)
- **ESLint**: Configured with React hooks and refresh plugins; unused variables allowed if uppercase (component names)

## File Structure

```
src/
├── App.jsx           # Main app, all logic and views
├── components/
│   └── AIInsights.jsx # Separate AI analysis view
├── main.jsx          # React root
├── index.css         # Global styles
├── App.css           # App-specific styles
└── tailwind.css      # Tailwind directives
```

## TastyTrade API Authentication

### Critical: User-Agent Header Required
TastyTrade's nginx proxy returns `401 Authorization Required` for **any** request missing a `User-Agent` header. This affects Node.js `fetch` and `https.request` which don't set one by default (unlike `curl` or `axios`). The 401 comes from nginx before reaching the API, making it look like an invalid token error.

All HTTP requests in `api/_tastytrade.js` include `User-Agent: options-tracker/1.0` via the `USER_AGENT` constant.

### OAuth Token Exchange
- **Endpoint:** `POST https://api.tastytrade.com/oauth/token`
- **Content-Type:** `application/x-www-form-urlencoded`
- **Body params:** `grant_type=refresh_token`, `refresh_token`, `client_id`, `client_secret`
- **Access tokens expire in 900 seconds (15 min)**

### Auth Flow
1. `resolveAccessToken()` first tries the `@tastytrade/api` SDK (uses axios, sets User-Agent automatically)
2. Falls back to manual OAuth via `postWithHttps` (sets User-Agent explicitly)
3. Last resort: static `TASTYTRADE_ACCESS_TOKEN` env var (short-lived, dev-only)

### Required Environment Variables
```
TASTYTRADE_REFRESH_TOKEN=<jwt refresh token>
TASTYTRADE_CLIENT_ID=<uuid>
TASTYTRADE_CLIENT_SECRET=<hex string>
TASTYTRADE_API_BASE_URL=https://api.tastytrade.com
```

### SDK Note
The `@tastytrade/api` SDK's `ProdConfig.baseUrl` is `https://api.tastyworks.com` (old domain). The code overrides this with the configured `TASTYTRADE_API_BASE_URL`.

## Testing & Validation

- `repro_issue.js` and `verify_metrics.js` in project root (utility scripts, not part of build)
- `tasty.csv` is sample data for manual testing
