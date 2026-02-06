import { createElement, useMemo } from 'react';
import { AlertTriangle, Brain, Calendar, CheckCircle2, Clock3, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { formatCurrency } from '../lib/formatters';

const InsightCard = ({ icon, title, value, tone = 'neutral', hint }) => (
  <article className="surface-card p-5">
    <div className="mb-3 flex items-center justify-between">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p>
      {createElement(icon, {
        className: tone === 'positive'
          ? 'h-4 w-4 text-emerald-500'
          : tone === 'negative'
            ? 'h-4 w-4 text-rose-500'
            : 'h-4 w-4 text-slate-500',
      })}
    </div>
    <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
    {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
  </article>
);

const computeAnalysis = (tradeData) => {
  if (!tradeData || tradeData.length === 0) return null;

  const closedTrades = tradeData.filter((trade) => trade.status === 'CLOSED');
  const winningTrades = closedTrades.filter((trade) => trade.totalPL > 0);
  const losingTrades = closedTrades.filter((trade) => trade.totalPL <= 0);

  const totalPL = closedTrades.reduce((sum, trade) => sum + trade.totalPL, 0);
  const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;

  const dayPerformance = {};
  closedTrades.forEach((trade) => {
    if (!trade.dateOpen) return;
    const dateObj = trade.dateOpen instanceof Date ? trade.dateOpen : new Date(trade.dateOpen);
    if (Number.isNaN(dateObj.getTime())) return;

    const day = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    if (!dayPerformance[day]) dayPerformance[day] = { total: 0, count: 0, wins: 0 };
    dayPerformance[day].total += trade.totalPL;
    dayPerformance[day].count += 1;
    if (trade.totalPL > 0) dayPerformance[day].wins += 1;
  });

  let bestDay = { day: 'N/A', avg: -Infinity };
  let worstDay = { day: 'N/A', avg: Infinity };

  Object.entries(dayPerformance).forEach(([day, stats]) => {
    const avg = stats.total / stats.count;
    if (avg > bestDay.avg) bestDay = { day, avg, ...stats };
    if (avg < worstDay.avg) worstDay = { day, avg, ...stats };
  });

  const zeroDTE = closedTrades.filter((trade) => {
    if (!trade.dateOpen || !trade.dateClosed) return false;
    const open = trade.dateOpen instanceof Date ? trade.dateOpen : new Date(trade.dateOpen);
    const close = trade.dateClosed instanceof Date ? trade.dateClosed : new Date(trade.dateClosed);
    if (Number.isNaN(open.getTime()) || Number.isNaN(close.getTime())) return false;
    return open.toDateString() === close.toDateString();
  });
  const swing = closedTrades.filter((trade) => !zeroDTE.includes(trade));

  const zeroDTEPL = zeroDTE.reduce((sum, trade) => sum + trade.totalPL, 0);
  const swingPL = swing.reduce((sum, trade) => sum + trade.totalPL, 0);

  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, trade) => sum + trade.totalPL, 0) / winningTrades.length
    : 0;
  const avgLoss = losingTrades.length > 0
    ? Math.abs(losingTrades.reduce((sum, trade) => sum + trade.totalPL, 0) / losingTrades.length)
    : 0;
  const riskRewardRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin;

  return {
    totalPL,
    winRate,
    bestDay,
    worstDay,
    zeroDTECount: zeroDTE.length,
    zeroDTEPL,
    swingCount: swing.length,
    swingPL,
    avgWin,
    avgLoss,
    riskRewardRatio,
    totalTrades: closedTrades.length,
  };
};

export default function AIInsights({ tradeData }) {
  const analysis = useMemo(() => {
    try {
      return { data: computeAnalysis(tradeData), error: null };
    } catch (error) {
      return { data: null, error: error.message };
    }
  }, [tradeData]);

  if (analysis.error) {
    return (
      <div className="surface-card p-6">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Analysis error
          </div>
          <p className="text-sm">{analysis.error}</p>
        </div>
      </div>
    );
  }

  if (!tradeData) return <div className="surface-card p-6 text-sm text-slate-500">Upload a CSV file to generate insights.</div>;
  if (!analysis.data) return <div className="surface-card p-6 text-sm text-slate-500">Analyzing trade patterns...</div>;

  const {
    totalPL,
    winRate,
    bestDay,
    worstDay,
    zeroDTECount,
    zeroDTEPL,
    swingCount,
    swingPL,
    avgWin,
    avgLoss,
    riskRewardRatio,
    totalTrades,
  } = analysis.data;

  return (
    <section className="space-y-5">
      <header className="surface-card flex items-center justify-between p-5">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Brain className="h-5 w-5 text-teal-600" />
            AI Trade Insights
          </h2>
          <p className="mt-1 text-sm text-slate-500">Pattern recognition across closed strategies and trade behavior.</p>
        </div>
        <p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{totalTrades} closed trades</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <InsightCard
          icon={TrendingUp}
          title="Net P&L"
          value={formatCurrency(totalPL)}
          tone={totalPL >= 0 ? 'positive' : 'negative'}
          hint={totalPL >= 0 ? 'Strategy set is net profitable.' : 'Strategy set is in drawdown.'}
        />
        <InsightCard icon={CheckCircle2} title="Win Rate" value={`${winRate.toFixed(1)}%`} tone={winRate >= 50 ? 'positive' : 'negative'} />
        <InsightCard icon={Scale} title="Risk / Reward" value={`1:${riskRewardRatio.toFixed(2)}`} tone={riskRewardRatio >= 1 ? 'positive' : 'negative'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="surface-card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Timing Profile</h3>
          <div className="space-y-3 text-sm text-slate-700">
            <p className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-teal-600" />
              Best day: <span className="font-semibold text-slate-900">{bestDay.day}</span>
              <span className="text-slate-500">({Number.isFinite(bestDay.avg) ? formatCurrency(bestDay.avg) : '$0.00'} avg)</span>
            </p>
            <p className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-rose-500" />
              Weak day: <span className="font-semibold text-slate-900">{worstDay.day}</span>
              <span className="text-slate-500">({Number.isFinite(worstDay.avg) ? formatCurrency(worstDay.avg) : '$0.00'} avg)</span>
            </p>
          </div>
        </article>

        <article className="surface-card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Duration Split</h3>
          <div className="space-y-3 text-sm text-slate-700">
            <p className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-teal-600" />
              0DTE: <span className="font-semibold text-slate-900">{zeroDTECount}</span>
              <span className={zeroDTEPL >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{formatCurrency(zeroDTEPL)}</span>
            </p>
            <p className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-indigo-500" />
              Swing: <span className="font-semibold text-slate-900">{swingCount}</span>
              <span className={swingPL >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{formatCurrency(swingPL)}</span>
            </p>
          </div>
        </article>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="surface-card p-5">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Average Winner</h3>
          <p className="text-2xl font-semibold text-emerald-600">{formatCurrency(avgWin)}</p>
        </article>
        <article className="surface-card p-5">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Average Loser</h3>
          <p className="text-2xl font-semibold text-rose-600">{formatCurrency(avgLoss)}</p>
        </article>
      </div>
    </section>
  );
}
