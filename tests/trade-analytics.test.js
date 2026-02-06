import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeStats,
  filterStrategies,
  getContextData,
  getPLPerStrategyData,
  getPLPerSymbolData,
} from '../src/lib/tradeAnalytics.js';

const sampleStrategies = [
  {
    id: 's1',
    status: 'CLOSED',
    totalPL: 100,
    fees: -4,
    dateOpen: new Date('2026-01-06T10:00:00Z'),
    dateClosed: new Date('2026-01-08T10:00:00Z'),
    underlying: 'AAPL',
    strategyName: 'Long Call',
    legs: [{ action: 'BUY_TO_OPEN', type: 'CALL', costBasis: -100, strike: 200, quantity: 1 }],
  },
  {
    id: 's2',
    status: 'CLOSED',
    totalPL: -50,
    fees: -2,
    dateOpen: new Date('2026-01-09T10:00:00Z'),
    dateClosed: new Date('2026-01-09T14:00:00Z'),
    underlying: 'SPX',
    strategyName: 'Long Call (Rolled)',
    legs: [{ action: 'BUY_TO_OPEN', type: 'CALL', costBasis: -100, strike: 5100, quantity: 1 }],
  },
  {
    id: 's3',
    status: 'OPEN',
    totalPL: 20,
    fees: -1,
    dateOpen: new Date('2026-01-10T10:00:00Z'),
    underlying: 'AAPL',
    strategyName: 'Short Put',
    legs: [{ action: 'SELL_TO_OPEN', type: 'PUT', costBasis: 75, strike: 180, quantity: 1 }],
  },
];

test('getContextData filters 0DTE view correctly', () => {
  const zeroDTEContext = getContextData(sampleStrategies, 'zero-dte');
  assert.equal(zeroDTEContext.length, 1);
  assert.equal(zeroDTEContext[0].id, 's2');

  const homeContext = getContextData(sampleStrategies, 'home');
  assert.equal(homeContext.length, 3);
});

test('computeStats returns expected metrics', () => {
  const context = getContextData(sampleStrategies, 'home');
  const stats = computeStats(context, 'home', 1000);

  assert.equal(stats.closedPLAfterFees, 50);
  assert.equal(stats.currentBalance, 1050);
  assert.equal(stats.winRate, 50);
  assert.equal(stats.openCount, 1);
  assert.equal(stats.avgDuration, 2);
  assert.equal(stats.zeroDTEPL, -50);
  assert.equal(stats.avgWin, 100);
  assert.equal(stats.avgLoss, 50);
  assert.equal(stats.avgROC, 25);
  assert.equal(stats.returnPercentage, 5);
});

test('filterStrategies applies status and symbol filters', () => {
  const context = getContextData(sampleStrategies, 'home');
  const closedOnly = filterStrategies(context, 'CLOSED', '');
  assert.equal(closedOnly.length, 2);

  const aaplOnly = filterStrategies(context, 'ALL', 'aa');
  assert.equal(aaplOnly.length, 2);
});

test('aggregation helpers group symbol and strategy data', () => {
  const symbolData = getPLPerSymbolData(sampleStrategies);
  assert.equal(symbolData.length, 2);
  assert.equal(symbolData[0].symbol, 'AAPL');
  assert.equal(symbolData[0].plAfterFees, 100);

  const strategyData = getPLPerStrategyData(sampleStrategies);
  assert.equal(strategyData.length, 1);
  assert.equal(strategyData[0].strategyType, 'Long Call');
  assert.equal(strategyData[0].strategyCount, 2);
  assert.equal(strategyData[0].plAfterFees, 50);
});
