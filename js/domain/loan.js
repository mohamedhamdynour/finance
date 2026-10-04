// ══════════════════════════════════════════════════════════════════
//  loan.js — حسابات القروض والرهون (pure math)
// ══════════════════════════════════════════════════════════════════
import { N2 } from '../core/utils.js';

/**
 * يحسب القسط الشهري لقرض بفائدة.
 * الصيغة: M = P × r × (1+r)^n / ((1+r)^n − 1)
 * @param {number} principal - المبلغ الأصلي
 * @param {number} annualRatePct - الفائدة السنوية %
 * @param {number} months - عدد الأشهر
 * @returns {object}
 */
export function calcLoan(principal, annualRatePct, months) {
  const P = N2(principal);
  const annualRate = N2(annualRatePct) / 100;
  const n = Math.floor(N2(months));

  if (P <= 0 || n <= 0) return null;

  // لو الفائدة 0 → قسط ثابت
  if (annualRate === 0) {
    const monthly = P / n;
    return {
      monthlyPayment: monthly,
      totalPayment: P,
      totalInterest: 0,
      principal: P,
      months: n,
      schedule: buildSchedule(P, 0, n, monthly)
    };
  }

  const r = annualRate / 12;
  const factor = Math.pow(1 + r, n);
  const monthly = P * r * factor / (factor - 1);
  const totalPayment = monthly * n;
  const totalInterest = totalPayment - P;

  return {
    monthlyPayment: monthly,
    totalPayment,
    totalInterest,
    principal: P,
    months: n,
    annualRate,
    monthlyRate: r,
    schedule: buildSchedule(P, r, n, monthly)
  };
}

/**
 * يبني جدول السداد (amortization schedule).
 */
function buildSchedule(principal, monthlyRate, months, monthlyPayment) {
  const schedule = [];
  let balance = principal;

  for (let i = 1; i <= months; i++) {
    const interest = monthlyRate > 0 ? balance * monthlyRate : 0;
    const principalPaid = monthlyPayment - interest;
    balance = Math.max(0, balance - principalPaid);

    schedule.push({
      month: i,
      payment: +monthlyPayment.toFixed(2),
      interest: +interest.toFixed(2),
      principal: +principalPart.toFixed(2),
      balance: +balance.toFixed(2)
    });
  }
  return schedule;
}

/**
 * يحسب عدد الأشهر للوصول لهدف مدخرات.
 * @param {number} targetAmount - الهدف
 * @param {number} monthlySave - الادخار الشهري
 * @param {number} annualReturnPct - العائد السنوي %
 * @param {number} initial - المبلغ الحالي
 */
export function monthsToGoal(targetAmount, monthlySave, annualReturnPct, initial = 0) {
  const target = N2(targetAmount);
  const monthly = N2(monthlySave);
  const monthlyRate = N2(annualReturnPct) / 12 / 100;
  let balance = N2(initial);
  let months = 0;

  if (balance >= target) return { months: 0, reached: true };

  while (balance < target && months < 1200) {
    balance = balance * (1 + monthlyRate) + monthly;
    months++;
  }

  return {
    months,
    reached: true,
    finalBalance: balance
  };
}

/**
 * يعيد سيناريوهات مختلفة لقرض (فائدة مختلفة، مدد مختلفة).
 */
export function loanScenarios(principal, baseRate) {
  const rates = [baseRate - 3, baseRate - 1, baseRate, baseRate + 2, baseRate + 5].filter(r => r > 0);
  const durations = [12, 24, 36, 48, 60, 84, 120];

  return durations.map(months => {
    const row = { months, label: formatMonths(months), byRate: {} };
    rates.forEach(rate => {
      const loan = calcLoan(principal, rate, months);
      row.byRate[rate] = loan ? loan.monthlyPayment : 0;
    });
    return row;
  });
}

export function formatMonths(m) {
  if (m < 12) return m + ' شهر';
  const y = Math.floor(m / 12);
  const r = m % 12;
  return y + ' سنة' + (r > 0 ? ' و ' + r + ' شهر' : '');
}
