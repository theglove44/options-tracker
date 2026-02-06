import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyValueEffect,
  mapTastytradeTransactionToCsvRow,
  normalizeAction,
  parseOptionSymbol,
} from '../src/lib/tastytradeApi.js';

test('normalizeAction and applyValueEffect normalize API primitives', () => {
  assert.equal(normalizeAction('Buy to Open'), 'BUY_TO_OPEN');
  assert.equal(normalizeAction(' sell-to-close '), 'SELL_TO_CLOSE');

  assert.equal(applyValueEffect('10', 'Credit'), 10);
  assert.equal(applyValueEffect('10', 'Debit'), -10);
  assert.equal(applyValueEffect('-10', 'Debit'), -10);
});

test('parseOptionSymbol parses tastytrade option symbols', () => {
  const parsed = parseOptionSymbol('TSLA  251219P00380000');
  assert.ok(parsed);
  assert.equal(parsed.underlying, 'TSLA');
  assert.equal(parsed.expirationDate, '12/19/25');
  assert.equal(parsed.strikePrice, 380);
  assert.equal(parsed.callOrPut, 'PUT');
});

test('mapTastytradeTransactionToCsvRow maps transaction fields to CSV schema', () => {
  const row = mapTastytradeTransactionToCsvRow({
    'executed-at': '2025-11-28T14:32:13+0000',
    'transaction-type': 'Trade',
    'transaction-sub-type': 'Buy to Close',
    action: 'Buy to Close',
    symbol: 'TSLA  251219P00380000',
    'instrument-type': 'Equity Option',
    description: 'Bought 1 TSLA 12/19/25 Put 380.00 @ 4.79',
    value: 479,
    'value-effect': 'Debit',
    quantity: 1,
    price: 4.79,
    commission: 0,
    'commission-effect': 'Debit',
    'regulatory-fees': 0.12,
    'regulatory-fees-effect': 'Debit',
    'clearing-fees': 0,
    'clearing-fees-effect': 'Debit',
    'proprietary-index-option-fees': 0,
    'proprietary-index-option-fees-effect': 'Debit',
    'net-value': 479.12,
    'net-value-effect': 'Debit',
    'order-id': 419537648,
    currency: 'USD',
    'underlying-symbol': 'TSLA',
  });

  assert.equal(row.Action, 'BUY_TO_CLOSE');
  assert.equal(row.Value, '-479');
  assert.equal(row['Average Price'], '-4.79');
  assert.equal(row.Fees, '-0.12');
  assert.equal(row.Total, '-479.12');
  assert.equal(row['Expiration Date'], '12/19/25');
  assert.equal(row['Strike Price'], '380');
  assert.equal(row['Call or Put'], 'PUT');
  assert.equal(row['Order #'], '419537648');
});
