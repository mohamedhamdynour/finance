const { test } = require('node:test');
const assert = require('node:assert');
const P = require('../js/lib/performance.js');
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('xirr: استثمار واحد سنة كاملة بربح 10% => 10%', () => {
  close(P.xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 1100 }]), 0.10, 1e-4);
});
test('xirr: قيمة معروفة (مثال Excel الكلاسيكي)', () => {
  // Excel XIRR docs example: 0.373362535
  const r = P.xirr([
    { date: '2008-01-01', amount: -10000 }, { date: '2008-03-01', amount: 2750 },
    { date: '2008-10-30', amount: 4250 }, { date: '2009-02-15', amount: 3250 }, { date: '2009-04-01', amount: 2750 },
  ]);
  close(r, 0.373362535, 1e-6);
});
test('xirr: خسارة => سالب', () => {
  assert.ok(P.xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 800 }]) < 0);
});
test('xirr: إشارة واحدة => null', () => {
  assert.equal(P.xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: -5 }]), null);
});
test('twr: الإيداع الكبير لا يُحسب ربح', () => {
  // يوم 1: 1000. يوم 2: أودعت 1000 والقيمة 2000 (عائد صفر). يوم 3: 2200 (+10%)
  const r = P.twr([{ date: '2026-01-01', value: 1000, flow: 0 }, { date: '2026-01-02', value: 2000, flow: 1000 }, { date: '2026-01-03', value: 2200, flow: 0 }]);
  close(r.total, 0.10);
});
test('twr: بدون تدفقات = value الأخير/الأول - 1', () => {
  const r = P.twr([{ date: '2026-01-01', value: 100 }, { date: '2026-01-02', value: 105 }, { date: '2026-01-03', value: 110.25 }]);
  close(r.total, 0.1025);
});
test('realReturn: 30% اسمي مع 25% تضخم', () => close(P.realReturn(0.30, 0.25), 0.04));
test('fxAttribution: أصل +10% بعملته والعملة +20% مقابل الجنيه', () => {
  const a = P.fxAttribution(0.10, 0.20);
  close(a.total, 0.32); close(a.fxEffect, 0.22);
});
test('weightedAvgCost: العمولة تدخل التكلفة والربح المحقق صحيح', () => {
  const r = P.weightedAvgCost([
    { type: 'buy', qty: 100, price: 10, fee: 10 },   // تكلفة 1010
    { type: 'buy', qty: 100, price: 12, fee: 10 },   // +1210 => 2220 على 200 => 11.1
    { type: 'sell', qty: 50, price: 15, fee: 5 },    // صافي 745 - 555 = 190
  ]);
  close(r.avgCost, 11.1); close(r.realized, 190); close(r.qty, 150); close(r.costBasis, 1665);
});
test('weightedAvgCost: بيع أكبر من المملوك => error', () => {
  assert.ok(P.weightedAvgCost([{ type: 'buy', qty: 1, price: 1 }, { type: 'sell', qty: 2, price: 1 }]).error);
});
