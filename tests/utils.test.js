import test from 'node:test';
import assert from 'node:assert/strict';
import { N2, today, periodStart, periodEnd, toEGP, fromEGP, getRate } from '../js/core/utils.js';
import { DB, APP_SETTINGS, UI } from '../js/state.js';

test('N2 normalizes non-finite values without allowing Infinity into calculations', () => {
  assert.equal(N2('12.5'), 12.5);
  assert.equal(N2('not-a-number'), 0);
  assert.equal(N2(Number.NaN), 0);
  assert.equal(N2(Number.POSITIVE_INFINITY), 0);
  assert.equal(N2(Number.NEGATIVE_INFINITY), 0);
});

test('today returns the local calendar date in YYYY-MM-DD format', () => {
  const d = new Date();
  const expected = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  assert.equal(today(), expected);
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
});

test('period range helpers return valid local date strings', () => {
  for (const period of ['3m', '6m', '1y', '2y', '3y', '5y', 'all', 'custom']) {
    UI.customFrom = '2026-01-01';
    UI.customTo = '2026-01-31';
    assert.match(periodStart(period), /^\d{4}-\d{2}-\d{2}$/);
    assert.match(periodEnd(period), /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.equal(periodStart('custom'), '2026-01-01');
  assert.equal(periodEnd('custom'), '2026-01-31');
  UI.customFrom = null;
  UI.customTo = null;
});

test('currency conversion round-trips using the configured exchange rate', () => {
  DB.exchangeRates = [{ currency: 'USD', rate: 50 }];
  APP_SETTINGS.base_currency = 'EGP';
  assert.equal(toEGP(2, 'USD'), 100);
  assert.equal(fromEGP(100, 'USD'), 2);
  DB.exchangeRates = [];
});
