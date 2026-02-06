import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateCapital, isZeroDTE, parseCSV, processTradeRows, safeFloat } from '../src/lib/tradeProcessing.js';

test('safeFloat parses values safely', () => {
  assert.equal(safeFloat('$1,234.56'), 1234.56);
  assert.equal(safeFloat(''), 0);
  assert.equal(safeFloat(null), 0);
  assert.equal(safeFloat('not-a-number'), 0);
});

test('parseCSV handles quoted fields', () => {
  const csv = 'Date,Action,Notes\n2026-01-01,OPEN,"with, comma"';
  const rows = parseCSV(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Notes, 'with, comma');
});

test('processTradeRows builds closed strategies and preserves P&L math', () => {
  const rows = [
    {
      Date: '2026-01-01',
      Type: 'Money Movement',
      'Sub Type': 'Deposit',
      Value: '10000',
    },
    {
      Date: '2026-01-01',
      Action: 'SELL_TO_OPEN',
      Type: 'Trade',
      'Sub Type': '',
      Quantity: '-1',
      Value: '120',
      Total: '120',
      Fees: '1',
      Commissions: '0',
      'Strike Price': '5000',
      'Average Price': '1.2',
      'Expiration Date': '2026-01-15',
      Symbol: 'SPX 011526C05000000',
      'Underlying Symbol': 'SPX',
      'Call or Put': 'CALL',
      'Order #': 'A1',
    },
    {
      Date: '2026-01-02',
      Action: 'BUY_TO_CLOSE',
      Type: 'Trade',
      'Sub Type': '',
      Quantity: '1',
      Value: '-40',
      Total: '-40',
      Fees: '1',
      Commissions: '0',
      'Strike Price': '5000',
      'Average Price': '0.4',
      'Expiration Date': '2026-01-15',
      Symbol: 'SPX 011526C05000000',
      'Underlying Symbol': 'SPX',
      'Call or Put': 'CALL',
      'Order #': 'A2',
    },
  ];

  const { initialBalance, strategies } = processTradeRows(rows);
  assert.equal(initialBalance, 10000);
  assert.equal(strategies.length, 1);

  const [strategy] = strategies;
  assert.equal(strategy.status, 'CLOSED');
  assert.equal(strategy.totalPL, 80);
  assert.equal(strategy.fees, 2);
  assert.equal(strategy.strategyName, 'Short Call');
  assert.equal(isZeroDTE(strategy), false);
});

test('estimateCapital handles common strategy structures', () => {
  const longCall = {
    legs: [{ action: 'BUY_TO_OPEN', type: 'CALL', costBasis: -250, strike: 4200, quantity: 1 }],
  };
  assert.equal(estimateCapital(longCall), 250);

  const shortPut = {
    legs: [{ action: 'SELL_TO_OPEN', type: 'PUT', costBasis: 180, strike: 120, quantity: 2 }],
  };
  assert.equal(estimateCapital(shortPut), 24000);

  const creditSpread = {
    legs: [
      { action: 'BUY_TO_OPEN', type: 'CALL', costBasis: -120, strike: 110, quantity: 1 },
      { action: 'SELL_TO_OPEN', type: 'CALL', costBasis: 80, strike: 100, quantity: 1 },
    ],
  };
  assert.equal(estimateCapital(creditSpread), 1000);
});
