// ══════════════════════════════════════════════════════════════════
//  forecast.js — توقعات مالية (pure math, no DOM)
// ══════════════════════════════════════════════════════════════════
import { DB, APP_SETTINGS } from '../state.js';
import { N2, toEGP, periodStart } from '../core/utils.js';
import { calcTotals } from './calc.js';

// ══════════════════════ حساب المعدلات الشهرية ══════════════════════

/**
 * يحسب معدل الدخل والمصروف الشهري من آخر N شهر.
 * @param {number} monthsBack - عدد الأشهر للرجوع (افتراضي 6)
 */
export function monthlyRates(monthsBack = 6) {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const startStr = startDate.toISOString().slice(0, 10);
  const nowStr = now.toISOString().slice(0, 10);

  // الفئات الداخلة/الخارجة
  const CREDIT = ['إيداع', 'تحويل وارد', 'رصيد افتتاحي', 'عائد شهادة', 'أرباح'];

  const txns = DB.bankTxns.filter(t => t.date >= startStr && t.date <= nowStr);

  let totalIn = 0, totalOut = 0;
  const byCategory = { in: {}, out: {} };

  txns.forEach(t => {
    const amount = toEGP(N2(t.amount), 'EGP'); // نفترض الحركات بالعملة الأساسية
    const cat = t.category || 'أخرى';
    if (CREDIT.includes(t.type)) {
      totalIn += amount;
      byCategory.in[cat] = (byCategory.in[cat] || 0) + amount;
    } else {
      totalOut += amount;
      byCategory.out[cat] = (byCategory.out[cat] || 0) + amount;
    }
  });

  // دخل إضافي من الأرباح الموزعة + عوائد الشهادات المصروفة
  DB.dividends.filter(d => d.date >= startStr && d.date <= nowStr).forEach(d => {
    totalIn += toEGP(N2(d.amount), 'EGP');
    byCategory.in['أرباح أسهم'] = (byCategory.in['أرباح أسهم'] || 0) + N2(d.amount);
  });

  const avgIn = totalIn / monthsBack;
  const avgOut = totalOut / monthsBack;
  const avgNet = avgIn - avgOut;

  // قائمة الدخل/الخروج من الأعلى للأقل
  const topIn = Object.entries(byCategory.in).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topOut = Object.entries(byCategory.out).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return {
    monthsBack,
    startDate: startStr,
    endDate: nowStr,
    avgIn, avgOut, avgNet,
    totalIn, totalOut,
    txnsCount: txns.length,
    topIn, topOut
  };
}

// ══════════════════════ توليد التوقعات ══════════════════════

/**
 * يتنبأ بالرصيد بعد N شهر.
 * @param {number} months - عدد الأشهر المستقبلية
 * @param {object} opts - { monthlyContribution, expectedReturn }
 */
export function forecastBalance(months, opts = {}) {
  const current = calcTotals().grand;
  const rates = monthlyRates(opts.monthsBack || 6);

  // المعدل الشهري: إما من البيانات الفعلية أو من المساهمة المخصصة
  const monthlyNet = opts.monthlyContribution !== undefined
    ? N2(opts.monthlyContribution)
    : rates.avgNet;

  // العائد الشهري المتوقع (سنوي / 12)
  const annualReturn = N2(opts.expectedReturn) || 0;
  const monthlyReturn = annualReturn / 12 / 100;

  // التوقعات
  const projections = [];
  let balance = current;
  const today = new Date();

  for (let i = 0; i <= months; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const dateStr = d.toISOString().slice(0, 10);
    projections.push({
      month: i,
      date: dateStr,
      label: d.toLocaleDateString('ar-EG', { month: 'short', year: '2-digit' }),
      balance,
      contribution: i === 0 ? 0 : monthlyNet,
      growth: i === 0 ? 0 : balance * monthlyReturn
    });
    // الشهر التالي
    balance = balance * (1 + monthlyReturn) + monthlyNet;
  }

  return {
    current,
    months,
    rates,
    monthlyNet,
    monthlyReturn,
    annualReturn,
    projections
  };
}

// ══════════════════════ أهداف مالية — وقت الوصول ══════════════════════

/**
 * يحسب كم شهر تحتاج للوصول إلى هدف معين.
 * @param {number} targetAmount
 * @param {object} opts
 */
export function monthsToTarget(targetAmount, opts = {}) {
  const current = calcTotals().grand;
  const rates = monthlyRates(opts.monthsBack || 6);
  const monthlyNet = opts.monthlyContribution !== undefined
    ? N2(opts.monthlyContribution)
    : rates.avgNet;
  const monthlyReturn = (N2(opts.expectedReturn) || 0) / 12 / 100;

  if (current >= targetAmount) return { reached: true, months: 0, date: new Date().toISOString().slice(0, 10) };
  if (monthlyNet <= 0 && monthlyReturn <= 0) return { reached: false, months: null, impossible: true };

  let balance = current;
  let months = 0;
  const MAX_MONTHS = 600; // 50 سنة

  while (balance < targetAmount && months < MAX_MONTHS) {
    balance = balance * (1 + monthlyReturn) + monthlyNet;
    months++;
  }

  if (months >= MAX_MONTHS) return { reached: false, months: null, impossible: true };

  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return {
    reached: false,
    months,
    date: d.toISOString().slice(0, 10),
    finalBalance: balance
  };
}

/**
 * ملخص تنبؤات الأهداف الحالية.
 */
export function forecastGoals(opts = {}) {
  const results = [];
  DB.goals.forEach(g => {
    const res = monthsToTarget(N2(g.target), opts);
    results.push({ goal: g, ...res });
  });
  return results;
}
