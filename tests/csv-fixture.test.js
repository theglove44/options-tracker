import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCSV, processTradeRows } from '../src/lib/tradeProcessing.js';

test('sample CSV can be parsed and processed end-to-end', () => {
  const csvPath = resolve(process.cwd(), 'tasty.csv');
  const raw = readFileSync(csvPath, 'utf8');
  const rows = parseCSV(raw);
  const { initialBalance, strategies } = processTradeRows(rows);

  assert.ok(rows.length > 0);
  assert.ok(strategies.length > 0);
  assert.ok(Number.isFinite(initialBalance));

  const closed = strategies.filter((strategy) => strategy.status === 'CLOSED');
  assert.ok(closed.length > 0);
  assert.ok(closed.every((strategy) => Number.isFinite(strategy.totalPL)));
});
