import { Fragment, useMemo, useState } from 'react';
import {
  BarChart3,
  Brain,
  CloudDownload,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  LayoutDashboard,
  LoaderCircle,
  PieChart,
  Search,
  Target,
  Upload,
} from 'lucide-react';
import AIInsights from './components/AIInsights';
import { formatCurrency, formatDate } from './lib/formatters';
import {
  computeStats,
  filterStrategies,
  getContextData,
  getPLPerStrategyData,
  getPLPerSymbolData,
} from './lib/tradeAnalytics';
import {
  mapTastytradeTransactionsToRows,
} from './lib/tastytradeApi';
import { parseCSV, processTradeRows } from './lib/tradeProcessing';

const VIEWS = [
  { id: 'home', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'zero-dte', label: '0DTE', icon: Target },
  { id: 'pl-per-symbol', label: 'By Symbol', icon: BarChart3 },
  { id: 'pl-per-strategy', label: 'By Strategy', icon: PieChart },
  { id: 'ai-insights', label: 'AI Insights', icon: Brain },
];

const STATUS_FILTERS = ['ALL', 'OPEN', 'CLOSED'];

const cn = (...classes) => classes.filter(Boolean).join(' ');

const StatCard = ({ label, value, tone = 'neutral', subLabel }) => (
  <article className="surface-card p-4 sm:p-5">
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
    <p
      className={cn(
        'mt-2 text-2xl font-semibold tracking-tight',
        tone === 'positive' && 'text-emerald-600',
        tone === 'negative' && 'text-rose-600',
        tone === 'neutral' && 'text-slate-900',
      )}
    >
      {value}
    </p>
    {subLabel ? <p className="mt-1 text-xs text-slate-500">{subLabel}</p> : null}
  </article>
);

const FilterControls = ({ filter, onFilterChange, symbolFilter, onSymbolFilterChange }) => (
  <section className="surface-card p-4">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => onFilterChange(status)}
            className={cn(
              'rounded-lg px-3 py-2 text-xs font-semibold tracking-[0.08em] transition',
              filter === status
                ? 'bg-teal-500 text-white shadow'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            {status}
          </button>
        ))}
      </div>

      <label className="relative block w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={symbolFilter}
          onChange={(event) => onSymbolFilterChange(event.target.value)}
          placeholder="Filter by ticker symbol"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
          type="text"
        />
      </label>
    </div>
  </section>
);

const StrategyRow = ({ strategy, expanded, onToggle }) => (
  <article className="surface-card overflow-hidden">
    <button
      type="button"
      onClick={() => onToggle(strategy.id)}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
    >
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2">
          <p className="truncate text-base font-semibold text-slate-900">{strategy.underlying}</p>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
              strategy.status === 'CLOSED' && strategy.totalPL >= 0 && 'bg-emerald-100 text-emerald-700',
              strategy.status === 'CLOSED' && strategy.totalPL < 0 && 'bg-rose-100 text-rose-700',
              strategy.status !== 'CLOSED' && 'bg-amber-100 text-amber-700',
            )}
          >
            {strategy.status}
          </span>
        </div>
        <p className="truncate text-sm text-slate-500">
          {strategy.strategyName}
          {strategy.isRolled ? ' • Rolled' : ''}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Opened {formatDate(strategy.dateOpen)}{strategy.dateClosed ? ` • Closed ${formatDate(strategy.dateClosed)}` : ''}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <p className={cn('text-sm font-semibold', strategy.totalPL >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
          {formatCurrency(strategy.totalPL)}
        </p>
        {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </div>
    </button>

    {expanded ? (
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
        <div className="grid gap-2">
          {strategy.legs.map((leg, index) => (
            <div key={`${leg.contractId}-${index}`} className="flex items-center justify-between text-xs text-slate-600">
              <span>
                {leg.quantity}x {leg.action} {leg.strike} {leg.type}
              </span>
              <span>{formatCurrency(leg.openPrice)}</span>
            </div>
          ))}
        </div>
      </div>
    ) : null}
  </article>
);

const SymbolPerformanceView = ({ plPerSymbolData }) => {
  const [expandedSymbols, setExpandedSymbols] = useState({});

  const toggleSymbol = (symbol) => {
    setExpandedSymbols((prev) => ({
      ...prev,
      [symbol]: !prev[symbol],
    }));
  };

  const totalNet = plPerSymbolData.reduce((sum, item) => sum + item.plAfterFees, 0);
  const totalClosed = plPerSymbolData.reduce((sum, item) => sum + item.closedStrategies, 0);
  const positiveSymbols = plPerSymbolData.filter((item) => item.plAfterFees > 0).length;
  const hitRate = plPerSymbolData.length > 0 ? (positiveSymbols / plPerSymbolData.length) * 100 : 0;

  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Net P&L" value={formatCurrency(totalNet)} tone={totalNet >= 0 ? 'positive' : 'negative'} />
        <StatCard label="Winning Symbols" value={`${hitRate.toFixed(1)}%`} />
        <StatCard label="Closed Strategies" value={totalClosed} />
      </div>

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                <th className="w-10 px-4 py-3" />
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3 text-right">Gross P&L</th>
                <th className="px-4 py-3 text-right">Fees</th>
                <th className="px-4 py-3 text-right">Net P&L</th>
                <th className="px-4 py-3 text-right">Win %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {plPerSymbolData.map((item) => (
                <Fragment key={item.symbol}>
                  <tr className="cursor-pointer hover:bg-slate-50" onClick={() => toggleSymbol(item.symbol)}>
                    <td className="px-4 py-3 text-slate-500">
                      {expandedSymbols[item.symbol] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{item.symbol}</td>
                    <td className={cn('px-4 py-3 text-right', item.plBeforeFees >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{formatCurrency(item.plBeforeFees)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{formatCurrency(item.totalFees)}</td>
                    <td className={cn('px-4 py-3 text-right font-semibold', item.plAfterFees >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{formatCurrency(item.plAfterFees)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700">
                      {item.closedStrategies > 0 ? `${((item.winningStrategies / item.closedStrategies) * 100).toFixed(0)}%` : '0%'}
                    </td>
                  </tr>

                  {expandedSymbols[item.symbol] ? (
                    <tr className="bg-slate-50">
                      <td colSpan={6} className="px-4 py-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Trade Log</p>
                        <div className="space-y-2">
                          {[...item.strategies].sort((a, b) => b.dateOpen - a.dateOpen).map((strategy) => (
                            <div key={strategy.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                              <span className="text-slate-700">
                                {formatDate(strategy.dateOpen)} • {strategy.strategyName}
                              </span>
                              <span className={strategy.totalPL >= 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-rose-600'}>
                                {formatCurrency(strategy.totalPL)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {plPerSymbolData.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No closed symbol data yet.</div> : null}
      </div>
    </section>
  );
};

const StrategyPerformanceView = ({ strategyTypeData }) => {
  const totalClosedStrategies = strategyTypeData.reduce((sum, item) => sum + item.strategyCount, 0);
  const totalPLBeforeFees = strategyTypeData.reduce((sum, item) => sum + item.plBeforeFees, 0);
  const totalFees = strategyTypeData.reduce((sum, item) => sum + item.totalFees, 0);
  const totalPLAfterFees = strategyTypeData.reduce((sum, item) => sum + item.plAfterFees, 0);

  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Gross P&L" value={formatCurrency(totalPLBeforeFees)} tone={totalPLBeforeFees >= 0 ? 'positive' : 'negative'} subLabel={`${totalClosedStrategies} closed strategies`} />
        <StatCard label="Fees Paid" value={formatCurrency(totalFees)} />
        <StatCard label="Net P&L" value={formatCurrency(totalPLAfterFees)} tone={totalPLAfterFees >= 0 ? 'positive' : 'negative'} />
      </div>

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                <th className="px-4 py-3">Strategy Type</th>
                <th className="px-4 py-3 text-right">Count</th>
                <th className="px-4 py-3 text-right">Win %</th>
                <th className="px-4 py-3 text-right">Gross P&L</th>
                <th className="px-4 py-3 text-right">Fees</th>
                <th className="px-4 py-3 text-right">Net P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {strategyTypeData.map((item) => (
                <tr key={item.strategyType} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">{item.strategyType}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{item.strategyCount}</td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {item.strategyCount > 0 ? `${((item.winningStrategies / item.strategyCount) * 100).toFixed(0)}%` : '0%'}
                  </td>
                  <td className={cn('px-4 py-3 text-right', item.plBeforeFees >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{formatCurrency(item.plBeforeFees)}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{formatCurrency(item.totalFees)}</td>
                  <td className={cn('px-4 py-3 text-right font-semibold', item.plAfterFees >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{formatCurrency(item.plAfterFees)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {strategyTypeData.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No closed strategy data yet.</div> : null}
      </div>
    </section>
  );
};

const TastytradeImportPanel = ({
  accountNumber,
  onAccountNumberChange,
  accountOptions,
  onLoadAccounts,
  isLoadingAccounts,
  onImport,
  isImporting,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  errorMessage,
  statusMessage,
}) => (
  <section className="rounded-2xl border border-slate-200 bg-white/70 p-4 sm:p-5">
    <div className="space-y-1">
      <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-slate-600">Connect Tastytrade</h2>
      <p className="text-xs text-slate-500">Authentication is handled server-side via Vercel environment variables. No client secrets are exposed in the browser.</p>
    </div>

    <form className="mt-4 space-y-3" onSubmit={onImport}>
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Account Number</span>
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
            type="text"
            list="tastytrade-accounts"
            placeholder="5WT00001"
            value={accountNumber}
            onChange={(event) => onAccountNumberChange(event.target.value)}
          />
          <datalist id="tastytrade-accounts">
            {accountOptions.map((account) => (
              <option key={account.accountNumber} value={account.accountNumber}>
                {account.nickname ? `${account.accountNumber} (${account.nickname})` : account.accountNumber}
              </option>
            ))}
          </datalist>
        </label>

        <button
          type="button"
          onClick={onLoadAccounts}
          disabled={isLoadingAccounts || isImporting}
          className={cn(
            'mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition',
            isLoadingAccounts || isImporting
              ? 'cursor-not-allowed opacity-60'
              : 'hover:border-slate-400 hover:bg-slate-50',
          )}
        >
          {isLoadingAccounts ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          Load Accounts
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Start Date (optional)</span>
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
            type="date"
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">End Date (optional)</span>
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
            type="date"
            value={endDate}
            onChange={(event) => onEndDateChange(event.target.value)}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={isImporting || isLoadingAccounts}
        className={cn(
          'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition',
          isImporting || isLoadingAccounts ? 'cursor-not-allowed opacity-70' : 'hover:bg-slate-700',
        )}
      >
        {isImporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
        {isImporting ? 'Importing Transactions...' : 'Import Transactions from API'}
      </button>
    </form>

    {errorMessage ? <p className="mt-3 text-sm text-rose-600">{errorMessage}</p> : null}
    {statusMessage ? <p className="mt-3 text-sm text-emerald-600">{statusMessage}</p> : null}
  </section>
);

const EmptyState = ({ onUpload, apiImportPanel }) => (
  <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-10 sm:px-6">
    <section className="surface-card relative w-full overflow-hidden p-8 sm:p-12">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-teal-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-indigo-200/40 blur-3xl" />

      <div className="relative z-10 space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
          <CircleDollarSign className="h-4 w-4 text-teal-600" />
          Options Tracker
        </div>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Upload your broker CSV or import transactions from Tastytrade.</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
          This refactored workspace keeps your current calculations intact while making analysis, filtering, and strategy breakdowns easier to use.
        </p>
        <div className="grid gap-4 lg:grid-cols-[auto_1fr] lg:items-start">
          <label className="inline-flex h-fit cursor-pointer items-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition hover:bg-teal-500">
            <Upload className="h-4 w-4" />
            Upload CSV
            <input type="file" accept=".csv" className="hidden" onChange={onUpload} />
          </label>
          {apiImportPanel}
        </div>
      </div>
    </section>
  </main>
);

export default function App() {
  const [tradeData, setTradeData] = useState(null);
  const [expandedStrategies, setExpandedStrategies] = useState({});
  const [filter, setFilter] = useState('ALL');
  const [symbolFilter, setSymbolFilter] = useState('');
  const [currentView, setCurrentView] = useState('home');
  const [initialBalance, setInitialBalance] = useState(0);
  const [showApiPanel, setShowApiPanel] = useState(false);
  const [accountNumber, setAccountNumber] = useState(import.meta.env.VITE_TASTYTRADE_ACCOUNT_NUMBER || '');
  const [accountOptions, setAccountOptions] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [apiStatus, setApiStatus] = useState('');

  const ingestRows = (rows) => {
    const { strategies, initialBalance: parsedInitialBalance } = processTradeRows(rows);
    setTradeData(strategies);
    setInitialBalance(parsedInitialBalance);
    setExpandedStrategies({});
    setCurrentView('home');
  };

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== 'string') return;
      const rows = parseCSV(text);
      ingestRows(rows);
      setApiError('');
      setApiStatus('Loaded CSV successfully.');
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const requestServerApi = async (path) => {
    const response = await fetch(path, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `Request failed with status ${response.status}`);
    }
    return payload;
  };

  const handleLoadAccounts = async () => {
    setIsLoadingAccounts(true);
    setApiError('');
    setApiStatus('');

    try {
      const payload = await requestServerApi('/api/tastytrade/accounts');
      const accounts = Array.isArray(payload?.data) ? payload.data : [];
      const openAccounts = accounts.filter((item) => !item.isClosed);
      setAccountOptions(openAccounts);

      if (!accountNumber && openAccounts.length === 1) {
        setAccountNumber(openAccounts[0].accountNumber);
      }

      setApiStatus(openAccounts.length > 0
        ? `Loaded ${openAccounts.length} account${openAccounts.length === 1 ? '' : 's'}.`
        : 'No open accounts returned for this token.');
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Unable to load accounts.');
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  const handleApiImport = async (event) => {
    event.preventDefault();

    if (!accountNumber.trim()) {
      setApiError('Account number is required.');
      setApiStatus('');
      return;
    }

    setIsImporting(true);
    setApiError('');
    setApiStatus('');

    try {
      const query = new URLSearchParams({ accountNumber: accountNumber.trim() });
      if (startDate) query.set('startDate', startDate);
      if (endDate) query.set('endDate', endDate);

      const payload = await requestServerApi(`/api/tastytrade/transactions?${query.toString()}`);
      const transactions = Array.isArray(payload?.data) ? payload.data : [];

      const rows = mapTastytradeTransactionsToRows(transactions);
      ingestRows(rows);
      setShowApiPanel(false);
      setApiStatus(`Imported ${rows.length} transaction rows from account ${accountNumber.trim()}.`);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Unable to import transactions.');
    } finally {
      setIsImporting(false);
    }
  };

  const currentContextData = useMemo(
    () => getContextData(tradeData, currentView),
    [tradeData, currentView],
  );

  const stats = useMemo(
    () => computeStats(currentContextData, currentView, initialBalance),
    [currentContextData, currentView, initialBalance],
  );

  const filteredData = useMemo(
    () => filterStrategies(currentContextData, filter, symbolFilter),
    [currentContextData, filter, symbolFilter],
  );

  const plPerSymbolData = useMemo(() => getPLPerSymbolData(tradeData), [tradeData]);
  const strategyTypeData = useMemo(() => getPLPerStrategyData(tradeData), [tradeData]);

  const toggleStrategy = (id) => {
    setExpandedStrategies((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const apiImportPanel = (
    <TastytradeImportPanel
      accountNumber={accountNumber}
      onAccountNumberChange={setAccountNumber}
      accountOptions={accountOptions}
      onLoadAccounts={handleLoadAccounts}
      isLoadingAccounts={isLoadingAccounts}
      onImport={handleApiImport}
      isImporting={isImporting}
      startDate={startDate}
      onStartDateChange={setStartDate}
      endDate={endDate}
      onEndDateChange={setEndDate}
      errorMessage={apiError}
      statusMessage={apiStatus}
    />
  );

  if (!tradeData) {
    return <EmptyState onUpload={handleFileUpload} apiImportPanel={apiImportPanel} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-100 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
        <header className="surface-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Trading Control Center</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Options Tracker</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-500">
              <Upload className="h-4 w-4" />
              Import New CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label>
            <button
              type="button"
              onClick={() => setShowApiPanel((prev) => !prev)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              <CloudDownload className="h-4 w-4" />
              {showApiPanel ? 'Hide API Import' : 'Import from API'}
            </button>
          </div>
        </header>

        {showApiPanel ? apiImportPanel : null}

        <nav className="surface-card overflow-x-auto p-2">
          <div className="flex min-w-max gap-2">
            {VIEWS.map((view) => {
              const Icon = view.icon;
              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setCurrentView(view.id)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition',
                    currentView === view.id
                      ? 'bg-slate-900 text-white shadow'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {view.label}
                </button>
              );
            })}
          </div>
        </nav>

        {(currentView === 'home' || currentView === 'zero-dte') && stats ? (
          <main className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Current Balance" value={formatCurrency(stats.currentBalance)} />
              <StatCard
                label="Realized P&L"
                value={formatCurrency(stats.closedPLAfterFees)}
                tone={stats.closedPLAfterFees >= 0 ? 'positive' : 'negative'}
              />
              <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} />
              <StatCard label="Average ROC" value={`${stats.avgROC.toFixed(2)}%`} />
              <StatCard label="Avg Days in Trade" value={stats.avgDuration.toFixed(1)} subLabel={currentView === 'zero-dte' ? '0DTE only' : 'excluding 0DTE'} />
              <StatCard label="Avg Capital at Risk" value={formatCurrency(stats.avgCapital)} />
              <StatCard label="Average Win" value={formatCurrency(stats.avgWin)} tone="positive" />
              <StatCard label="Average Loss" value={formatCurrency(stats.avgLoss)} tone="negative" />
            </div>

            <FilterControls
              filter={filter}
              onFilterChange={setFilter}
              symbolFilter={symbolFilter}
              onSymbolFilterChange={setSymbolFilter}
            />

            <section className="space-y-3">
              {filteredData.map((strategy) => (
                <StrategyRow
                  key={strategy.id}
                  strategy={strategy}
                  expanded={!!expandedStrategies[strategy.id]}
                  onToggle={toggleStrategy}
                />
              ))}

              {filteredData.length === 0 ? (
                <div className="surface-card p-8 text-center text-sm text-slate-500">
                  No strategies match the selected filters.
                </div>
              ) : null}
            </section>
          </main>
        ) : null}

        {currentView === 'pl-per-symbol' ? (
          <main>
            <SymbolPerformanceView plPerSymbolData={plPerSymbolData} />
          </main>
        ) : null}

        {currentView === 'pl-per-strategy' ? (
          <main>
            <StrategyPerformanceView strategyTypeData={strategyTypeData} />
          </main>
        ) : null}

        {currentView === 'ai-insights' ? (
          <main>
            <AIInsights tradeData={tradeData} />
          </main>
        ) : null}

        <footer className="mt-auto surface-card flex flex-wrap items-center justify-between gap-2 p-4 text-xs text-slate-500">
          <p>Start: {formatCurrency(initialBalance)}</p>
          <p>Return: {stats ? `${stats.returnPercentage.toFixed(2)}%` : '0.00%'}</p>
          <p>Open Positions: {stats ? stats.openCount : 0}</p>
        </footer>
      </div>
    </div>
  );
}
