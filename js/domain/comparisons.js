// ══════════════════════════════════════════════════════════════════
//  comparisons.js — مقارنات زمنية (MoM, QoQ, YoY)
// ══════════════════════════════════════════════════════════════════
import { DB, APP_SETTINGS } from '../state.js';
import { N2, toEGP, baseCur } from '../core/utils.js';
import { calcTotals } from './calc.js';

const CREDIT = ['إيداع', 'تحويل وارد', 'رصيد افتتاحي', 'عائد شهادة', 'أرباح'];

// ══════════════════════ إحصاءات فترة ══════════════════════

/**
 * يُرجع إحصاءات فترة [start, end].
 */
export function periodStats(start, end) {
  const txns = DB.bankTxns.filter(t => t.date >= start && t.date <= end);

  let income = 0, expense = 0;
  const incomeByCat = {}, expenseByCat = {};

  txns.forEach(t => {
    const amt = N2(t.amount);
    const cat = t.category || 'غير مصنف';
    if (CREDIT.includes(t.type)) {
      income += amt;
      incomeByCat[cat] = (incomeByCat[cat] || 0) + amt;
    } else {
      expense += amt;
      expenseByCat[cat] = (expenseByCat[cat] || 0) + amt;
    }
  });

  // دخل إضافي من التوزيعات
  DB.dividends
    .filter(d => d.date >= start && d.date <= end)
    .forEach(d => {
      income += N2(d.amount);
      incomeByCat['أرباح أسهم'] = (incomeByCat['أرباح أسهم'] || 0) + N2(d.amount);
    });

  return {
    start, end,
    income, expense, net: income - expense,
    txnCount: txns.length,
    incomeByCat, expenseByCat,
    avgIncome: txns.length ? income / txns.length : 0
  };
}

// ══════════════════════ إحصاءات شهرية ══════════════════════

/**
 * يُرجع مصفوفة بإحصاءات كل شهر لآخر N شهر.
 */
export function monthlyStats(monthsBack = 12) {
  const now = new Date();
  const result = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    const stats = periodStats(start, end);
    result.push({
      month: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString('ar-EG', { month: 'short', year: '2-digit' }),
      ...stats
    });
  }
  return result;
}

// ══════════════════════ مقارنة فترتين ══════════════════════

function compareMetric(label, current, previous, inverse = false) {
  const delta = current - previous;
  const pct = previous !== 0 ? (delta / Math.abs(previous)) * 100 : (current > 0 ? 100 : 0);
  return {
    label, current, previous, delta, pct,
    // inverse=true يعني: الزيادة سيئة (مثل المصروفات)
    isPositive: inverse ? delta < 0 : delta > 0,
    isNegative: inverse ? delta > 0 : delta < 0
  };
}

function dateRange(offsetMonths, spanMonths = 1) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - offsetMonths - spanMonths + 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - offsetMonths + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label: start.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })
  };
}

/**
 * مقارنة الشهر الحالي بالشهر الماضي (MoM).
 */
export function getMoM() {
  const curr = dateRange(0, 1);
  const prev = dateRange(1, 1);
  const cStats = periodStats(curr.start, curr.end);
  const pStats = periodStats(prev.start, prev.end);

  return {
    title: 'MoM — الشهر الحالي مقارنة بالماضي',
    currentLabel: curr.label,
    previousLabel: prev.label,
    metrics: [
      compareMetric('الدخل', cStats.income, pStats.income, false),
      compareMetric('المصروفات', cStats.expense, pStats.expense, true),
      compareMetric('صافي التوفير', cStats.net, pStats.net, false)
    ],
    current: cStats,
    previous: pStats
  };
}

/**
 * مقارنة السنة الحالية بالسنة الماضية (YoY).
 */
export function getYoY() {
  const curr = dateRange(0, 12);
  const prev = dateRange(12, 12);
  const cStats = periodStats(curr.start, curr.end);
  const pStats = periodStats(prev.start, prev.end);

  return {
    title: 'YoY — آخر 12 شهر مقارنة بالـ 12 السابقة',
    currentLabel: curr.label + ' → الآن',
    previousLabel: prev.label + ' → ' + curr.label,
    metrics: [
      compareMetric('الدخل', cStats.income, pStats.income, false),
      compareMetric('المصروفات', cStats.expense, pStats.expense, true),
      compareMetric('صافي التوفير', cStats.net, pStats.net, false)
    ],
    current: cStats,
    previous: pStats
  };
}

/**
 * مقارنة ربع سنوية (QoQ).
 */
export function getQoQ() {
  const now = new Date();
  const currentQStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const currentQEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);

  const prevQStart = new Date(currentQStart.getFullYear(), currentQStart.getMonth() - 3, 1);
  const prevQEnd = new Date(currentQStart.getFullYear(), currentQStart.getMonth(), 0);

  const cStats = periodStats(currentQStart.toISOString().slice(0, 10), currentQEnd.toISOString().slice(0, 10));
  const pStats = periodStats(prevQStart.toISOString().slice(0, 10), prevQEnd.toISOString().slice(0, 10));

  const qNum = Math.floor(now.getMonth() / 3) + 1;
  return {
    title: 'QoQ — الربع الحالي مقارنة بالربع الماضي',
    currentLabel: `Q${qNum} ${now.getFullYear()}`,
    previousLabel: `Q${qNum - 1 || 4} ${qNum === 1 ? now.getFullYear() - 1 : now.getFullYear()}`,
    metrics: [
      compareMetric('الدخل', cStats.income, pStats.income, false),
      compareMetric('المصروفات', cStats.expense, pStats.expense, true),
      compareMetric('صافي التوفير', cStats.net, pStats.net, false)
    ],
    current: cStats,
    previous: pStats
  };
}

// ══════════════════════ مقارنة حسب الفئة ══════════════════════

/**
 * يقارن الفئات بين فترتين.
 */
export function categoryComparison(start1, end1, start2, end2) {
  const p1 = periodStats(start1, end1);
  const p2 = periodStats(start2, end2);

  const allCats = new Set([
    ...Object.keys(p1.incomeByCat),
    ...Object.keys(p1.expenseByCat),
    ...Object.keys(p2.incomeByCat),
    ...Object.keys(p2.expenseByCat)
  ]);

  const results = [];
  allCats.forEach(cat => {
    const i1 = p1.incomeByCat[cat] || 0;
    const i2 = p2.incomeByCat[cat] || 0;
    const e1 = p1.expenseByCat[cat] || 0;
    const e2 = p2.expenseByCat[cat] || 0;

    if (i1 > 0 || i2 > 0) {
      results.push({
        category: cat,
        type: 'دخل',
        current: i1, previous: i2,
        delta: i1 - i2,
        pct: i2 > 0 ? ((i1 - i2) / i2) * 100 : (i1 > 0 ? 100 : 0),
        isPositive: i1 >= i2
      });
    }
    if (e1 > 0 || e2 > 0) {
      results.push({
        category: cat,
        type: 'مصروف',
        current: e1, previous: e2,
        delta: e1 - e2,
        pct: e2 > 0 ? ((e1 - e2) / e2) * 100 : (e1 > 0 ? 100 : 0),
        isPositive: e1 <= e2  // تقليل المصروف إيجابي
      });
    }
  });

  return results
    .filter(r => r.current > 0.01 || r.previous > 0.01)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/**
 * يُرجع أفضل 5 تغييرات وأسوأ 5.
 */
export function topChanges(comparison, type) {
  const filtered = type ? comparison.filter(c => c.type === type) : comparison;
  const sorted = [...filtered].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return {
    improvements: sorted.filter(c => c.isPositive).slice(0, 5),
    declines: sorted.filter(c => !c.isPositive).slice(0, 5)
  };
}
