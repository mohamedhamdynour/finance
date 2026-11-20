import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DB } from '../js/state.js';
import { getHoldings, getMetalHoldings } from '../js/domain/calc.js';

beforeEach(() => { DB.stockTxns = []; DB.metalTxns = []; });
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, a + ' != ' + b);
const buy = (id, date, quantity, net, symbol = 'ETEL') => ({ id, date, type: 'شراء', symbol, name: symbol, quantity, net });
const sell = (id, date, quantity, net, symbol = 'ETEL') => ({ id, date, type: 'بيع', symbol, name: symbol, quantity, net });

test('الأسهم: متوسط التكلفة المرجح بالعمولة (net) بعد شراءين وبيع جزئي', () => {
  DB.stockTxns = [buy(1, '2026-01-01', 100, 1010), buy(2, '2026-02-01', 100, 1210), sell(3, '2026-03-01', 50, 745)];
  const h = getHoldings().ETEL;
  close(h.qty, 150); close(h.totalCost, 1665); close(h.avgPrice, 11.1);
});

test('الأسهم: الترتيب بالتاريخ لا بترتيب الإدخال', () => {
  DB.stockTxns = [sell(3, '2026-03-01', 50, 745), buy(2, '2026-02-01', 100, 1210), buy(1, '2026-01-01', 100, 1010)];
  close(getHoldings().ETEL.qty, 150);
});

test('الأسهم: بيع الكل يشيل السهم من الحيازات', () => {
  DB.stockTxns = [buy(1, '2026-01-01', 10, 100), sell(2, '2026-01-02', 10, 120)];
  assert.equal(getHoldings().ETEL, undefined);
});

test('الأسهم: بيع أكتر من المملوك لا يعمل كمية سالبة (يُقص للمتاح)', () => {
  DB.stockTxns = [buy(1, '2026-01-01', 10, 100), sell(2, '2026-01-02', 25, 300)];
  assert.equal(getHoldings().ETEL, undefined); // موثّق: السلوك الحالي يقص بدل ما يرفض
});

test('الأسهم: فلتر السوق', () => {
  DB.stockTxns = [{ ...buy(1, '2026-01-01', 10, 100), market: 'EGX' }, { ...buy(2, '2026-01-01', 5, 500, 'AAPL'), market: 'NYSE' }];
  assert.deepEqual(Object.keys(getHoldings('NYSE')), ['AAPL']);
});

test('المعادن: متوسط التكلفة وبيع جزئي', () => {
  DB.metalTxns = [
    { id: 1, date: '2026-01-01', op: 'شراء', metal_type: 'ذهب 24', weight: 10, net: 10000, notes: '' },
    { id: 2, date: '2026-02-01', op: 'بيع', metal_type: 'ذهب 24', weight: 4, net: 4400, notes: '' },
  ];
  const h = getMetalHoldings()['ذهب 24'];
  close(h.weight, 6); close(h.totalCost, 6000); close(h.avgPrice, 1000);
});

test('المعادن: الملاحظة تفصل القطع (سبيكة/خاتم) في حيازات مستقلة', () => {
  DB.metalTxns = [
    { id: 1, date: '2026-01-01', op: 'شراء', metal_type: 'ذهب 21', weight: 5, net: 5000, notes: 'خاتم' },
    { id: 2, date: '2026-01-02', op: 'شراء', metal_type: 'ذهب 21', weight: 5, net: 4500, notes: 'سبيكة' },
  ];
  assert.equal(Object.keys(getMetalHoldings()).length, 2);
});
