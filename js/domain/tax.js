// ══════════════════════════════════════════════════════════════════
//  tax.js — حسابات الضرائب (أرباح رأسمالية + توزيعات)
// ══════════════════════════════════════════════════════════════════
import { DB, APP_SETTINGS } from '../state.js';
import { N2 } from '../core/utils.js';
import { getHoldings } from './calc.js';

// القوانين الافتراضية (مصر — 2024)
const DEFAULTS = {
  stockCapitalGainsRate: 0,      // معفاة حاليًا (EGX)
  stockDividendRate: 10,         // 10% على التوزيعات
  certInterestRate: 0,           // معفاة (شهادات ادخارية)
  bankInterestRate: 20,          // 20% على فوائد البنوك (تقديري)
  exemptThreshold: 0,            // حد الإعفاء
  currency: 'EGP'
};

export function getTaxSettings() {
  return { ...DEFAULTS, ...(APP_SETTINGS.tax || {}) };
}

export function saveTaxSettings(cfg) {
  APP_SETTINGS.tax = { ...getTaxSettings(), ...cfg };
}

// ══════════════════════ ضريبة أرباح رأس المال ══════════════════════

/**
 * يحسب الضريبة على صفقات البيع.
 * @param {string} fromDate
 * @param {string} toDate
 */
export function capitalGainsTax(fromDate, toDate) {
  const cfg = getTaxSettings();
  const rate = N2(cfg.stockCapitalGainsRate) / 100;

  const sales = DB.stockTxns.filter(t =>
    t.type === 'بيع' && t.date >= fromDate && t.date <= toDate
  );

  const rows = sales.map(t => {
    const profit = N2(t.profit);
    const tax = profit > 0 ? profit * rate : 0;
    return {
      id: t.id,
      date: t.date,
      symbol: t.symbol,
      name: t.name,
      quantity: N2(t.quantity),
      sellPrice: N2(t.price),
      net: N2(t.net),
      profit,
      taxable: profit > 0,
      tax
    };
  });

  const totals = {
    salesCount: rows.length,
    totalProceeds: rows.reduce((a, r) => a + r.net, 0),
    totalProfit: rows.filter(r => r.profit > 0).reduce((a, r) => a + r.profit, 0),
    totalLoss: rows.filter(r => r.profit < 0).reduce((a, r) => a + r.profit, 0),
    totalTax: rows.reduce((a, r) => a + r.tax, 0),
    netProfit: rows.reduce((a, r) => a + r.profit, 0)
  };
  totals.effectiveRate = totals.totalProceeds > 0
    ? (totals.totalTax / totals.totalProceeds) * 100 : 0;

  return { rows, totals, rate: cfg.stockCapitalGainsRate, fromDate, toDate };
}

// ══════════════════════ ضريبة التوزيعات ══════════════════════

export function dividendTax(fromDate, toDate) {
  const cfg = getTaxSettings();
  const rate = N2(cfg.stockDividendRate) / 100;

  const divs = DB.dividends.filter(d => d.date >= fromDate && d.date <= toDate);

  const rows = divs.map(d => ({
    id: d.id,
    date: d.date,
    symbol: d.symbol,
    gross: N2(d.amount),
    tax: N2(d.amount) * rate,
    net: N2(d.amount) * (1 - rate)
  }));

  return {
    rows, rate: cfg.stockDividendRate,
    totals: {
      count: rows.length,
      grossTotal: rows.reduce((a, r) => a + r.gross, 0),
      taxTotal: rows.reduce((a, r) => a + r.tax, 0),
      netTotal: rows.reduce((a, r) => a + r.net, 0)
    },
    fromDate, toDate
  };
}

// ══════════════════════ ضريبة فوائد الشهادات/البنوك ══════════════════════

export function interestTax(fromDate, toDate) {
  const cfg = getTaxSettings();
  const certRate = N2(cfg.certInterestRate) / 100;

  // عوائد الشهادات المُصرَّفة
  const certPayouts = DB.bankTxns.filter(t =>
    t.type === 'عائد شهادة' && t.date >= fromDate && t.date <= toDate
  );

  const rows = certPayouts.map(t => {
    const gross = N2(t.amount);
    const bank = DB.banks.find(b => b.id === t.bank_id);
    return {
      id: t.id,
      date: t.date,
      source: bank?.name || 'شهادة',
      type: 'شهادة ادخارية',
      gross,
      tax: gross * certRate,
      net: gross * (1 - certRate)
    };
  });

  return {
    rows, rate: cfg.certInterestRate,
    totals: {
      count: rows.length,
      grossTotal: rows.reduce((a, r) => a + r.gross, 0),
      taxTotal: rows.reduce((a, r) => a + r.tax, 0),
      netTotal: rows.reduce((a, r) => a + r.net, 0)
    },
    fromDate, toDate
  };
}

// ══════════════════════ التقرير السنوي الشامل ══════════════════════

export function annualTaxReport(year) {
  const fromDate = `${year}-01-01`;
  const toDate = `${year}-12-31`;

  const capGains = capitalGainsTax(fromDate, toDate);
  const divs = dividendTax(fromDate, toDate);
  const interest = interestTax(fromDate, toDate);

  const totalTax = capGains.totals.totalTax + divs.totals.taxTotal + interest.totals.taxTotal;

  return {
    year,
    capitalGains: capGains,
    dividends: divs,
    interest,
    totalTax,
    breakdown: [
      { label: 'ضريبة أرباح رأس المال (بيع الأسهم)', value: capGains.totals.totalTax, rate: capGains.rate, color: 'var(--blue)' },
      { label: 'ضريبة التوزيعات', value: divs.totals.taxTotal, rate: divs.rate, color: 'var(--purple)' },
      { label: 'ضريبة عوائد الشهادات', value: interest.totals.taxTotal, rate: interest.rate, color: 'var(--gold)' }
    ]
  };
}

export function availableYears() {
  const years = new Set();
  DB.stockTxns.forEach(t => years.add(t.date.slice(0, 4)));
  DB.dividends.forEach(d => years.add(d.date.slice(0, 4)));
  DB.bankTxns.forEach(t => { if (t.type === 'عائد شهادة') years.add(t.date.slice(0, 4)); });
  return [...years].sort().reverse();
}
