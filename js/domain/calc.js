// ══════════════════════════════════════════════════════════════════
//  calc.js — كل حسابات المحفظة (نقية، بدون DOM)
// ══════════════════════════════════════════════════════════════════
import { DB } from '../state.js';
import { N2, toEGP } from '../core/utils.js';

// ─── أسعار ─────────────────────────────────────────────────────
export function getStockPrice(sym) {
  const p = DB.stockPrices.find(x => x.symbol === sym);
  return p ? N2(p.current_price) : 0;
}

export function getMetalPrice(type) {
  const p = DB.metalPrices.find(x => x.metal_type === type);
  return p ? N2(p.price_per_gram) : 0;
}

// ─── حيازات الأسهم (بمتوسط تكلفة مرجّح) ────────────────────────
export function getHoldings(marketFilter) {
  const h = {};
  const txns = (marketFilter && marketFilter !== 'ALL')
    ? DB.stockTxns.filter(t => (t.market || 'EGX') === marketFilter)
    : DB.stockTxns;

  [...txns]
    .sort((a, b) => a.date > b.date ? 1 : a.date < b.date ? -1 : a.id - b.id)
    .forEach(t => {
      if (!h[t.symbol]) {
        h[t.symbol] = {
          name: t.name,
          type: t.sec_type || 'سهم',
          qty: 0,
          totalCost: 0,
          market: t.market || 'EGX',
          currency: t.price_currency || 'EGP'
        };
      }
      if (t.type === 'شراء') {
        h[t.symbol].qty = +(h[t.symbol].qty + N2(t.quantity)).toFixed(6);
        h[t.symbol].totalCost = +(h[t.symbol].totalCost + N2(t.net)).toFixed(4);
      } else if (t.type === 'بيع') {
        const avg = h[t.symbol].qty > 0 ? h[t.symbol].totalCost / h[t.symbol].qty : 0;
        const soldQty = Math.min(N2(t.quantity), h[t.symbol].qty);
        h[t.symbol].qty = +(h[t.symbol].qty - soldQty).toFixed(6);
        h[t.symbol].totalCost = +(h[t.symbol].totalCost - avg * soldQty).toFixed(4);
        if (h[t.symbol].qty < 0.0001) {
          h[t.symbol].qty = 0;
          h[t.symbol].totalCost = 0;
        }
      }
    });

  Object.values(h).forEach(v => {
    v.avgPrice = v.qty > 0.0001 ? v.totalCost / v.qty : 0;
  });

  return Object.fromEntries(Object.entries(h).filter(([, v]) => v.qty > 0.0001));
}

// ─── حيازات المعادن (مفتاح مركّب "type|title") ─────────────────
export function getMetalHoldings() {
  const h = {};
  [...DB.metalTxns]
    .sort((a, b) => a.date > b.date ? 1 : a.date < b.date ? -1 : a.id - b.id)
    .forEach(t => {
      const metalType = t.metal_type || 'معدن';
      const metalTitle = t.notes && t.notes.trim() ? t.notes.trim() : '';
      const key = metalTitle ? metalType + '|' + metalTitle : metalType;

      if (!h[key]) {
        h[key] = {
          metal_type: metalType,
          title: metalTitle,
          weight: 0,
          totalCost: 0,
          transactions: []
        };
      }
      if (t.op === 'شراء') {
        h[key].weight += N2(t.weight);
        h[key].totalCost += N2(t.net);
        h[key].transactions.push(t.id);
      } else if (t.op === 'بيع') {
        const avg = h[key].weight > 0 ? h[key].totalCost / h[key].weight : 0;
        const sw = Math.min(N2(t.weight), h[key].weight);
        h[key].weight -= sw;
        h[key].totalCost -= avg * sw;
        if (h[key].weight < 0.0001) {
          h[key].weight = 0;
          h[key].totalCost = 0;
        }
      }
    });

  Object.values(h).forEach(v => {
    v.avgPrice = v.weight > 0.0001 ? v.totalCost / v.weight : 0;
  });

  return Object.fromEntries(Object.entries(h).filter(([, v]) => v.weight > 0.0001));
}

// ─── إجماليات المحفظة ──────────────────────────────────────────
export function calcTotals() {
  const h = getHoldings();
  const mh = getMetalHoldings();

  const totalBanks = DB.banks.reduce((a, b) => a + toEGP(N2(b.balance), b.currency), 0);

  const stocksVal = Object.entries(h).reduce(
    (a, [s, v]) => a + v.qty * (getStockPrice(s) || v.avgPrice), 0);
  const stocksCost = Object.values(h).reduce((a, v) => a + v.totalCost, 0);

  // ملاحظة: استخدام metal_type الحقيقي بدل المفتاح المركّب
  const metalsVal = Object.entries(mh).reduce((a, [k, v]) => {
    const baseType = (v.metal_type || k.split('|')[0]).trim();
    return a + v.weight * (getMetalPrice(baseType) || v.avgPrice);
  }, 0);
  const metalsCost = Object.values(mh).reduce((a, v) => a + v.totalCost, 0);

  const certsTotal = DB.certs.reduce((a, c) => a + N2(c.amount), 0);
  const certsInterest = DB.certs.reduce((a, c) => a + N2(c.total_interest), 0);
  const certsPaid = DB.certs.reduce((a, c) => a + N2(c.interest_paid), 0);

  const divTotal = DB.dividends.reduce((a, d) => a + N2(d.amount), 0);

  const debtsOwed = DB.debts
    .filter(d => d.type === 'دين علي')
    .reduce((a, d) => a + N2(d.remaining), 0);
  const debtsOwing = DB.debts
    .filter(d => d.type === 'دين لي')
    .reduce((a, d) => a + N2(d.remaining), 0);

  const grand = totalBanks + stocksVal + metalsVal + certsTotal;

  const pnlStocks = stocksVal - stocksCost;
  const pnlMetals = metalsVal - metalsCost;
  const totalPnl = pnlStocks + pnlMetals + certsPaid + divTotal;

  return {
    h, mh,
    totalBanks, stocksVal, stocksCost, metalsVal, metalsCost,
    certsTotal, certsInterest, certsPaid, divTotal,
    debtsOwed, debtsOwing,
    pnlStocks, pnlMetals, totalPnl,
    grand
  };
}

// ─── إجماليات فترة محددة (للتقارير) ────────────────────────────
export function calcTotalsForPeriod(pStart, pEnd) {
  const CREDIT = ['إيداع', 'تحويل وارد', 'رصيد افتتاحي', 'عائد شهادة', 'أرباح'];
  const pe = pEnd || new Date().toISOString().slice(0, 10);

  // ─── الحيازات في نهاية الفترة ───
  const h = {};
  [...DB.stockTxns]
    .filter(t => t.date <= pe)
    .sort((a, b) => a.date > b.date ? 1 : a.date < b.date ? -1 : a.id - b.id)
    .forEach(t => {
      if (!h[t.symbol]) h[t.symbol] = {
        name: t.name, type: t.sec_type || 'سهم',
        qty: 0, totalCost: 0, market: t.market || 'EGX',
        currency: t.price_currency || 'EGP'
      };
      if (t.type === 'شراء') {
        h[t.symbol].qty += N2(t.quantity);
        h[t.symbol].totalCost += N2(t.net);
      } else if (t.type === 'بيع') {
        const avg = h[t.symbol].qty > 0 ? h[t.symbol].totalCost / h[t.symbol].qty : 0;
        const sq = Math.min(N2(t.quantity), h[t.symbol].qty);
        h[t.symbol].qty -= sq;
        h[t.symbol].totalCost -= avg * sq;
        if (h[t.symbol].qty < 0.001) {
          h[t.symbol].qty = 0;
          h[t.symbol].totalCost = 0;
        }
      }
    });
  Object.values(h).forEach(v => {
    v.avgPrice = v.qty > 0.001 ? v.totalCost / v.qty : 0;
  });
  const hF = Object.fromEntries(Object.entries(h).filter(([, v]) => v.qty > 0.001));

  // ─── المعادن في نهاية الفترة ───
  const mh = {};
  [...DB.metalTxns]
    .filter(t => t.date <= pe)
    .sort((a, b) => a.date > b.date ? 1 : a.date < b.date ? -1 : a.id - b.id)
    .forEach(t => {
      const key = (t.notes?.trim()) ? t.metal_type + '|' + t.notes.trim() : t.metal_type;
      if (!mh[key]) mh[key] = {
        metal_type: t.metal_type,
        title: (t.notes || '').trim(),
        weight: 0, totalCost: 0
      };
      if (t.op === 'شراء') {
        mh[key].weight += N2(t.weight);
        mh[key].totalCost += N2(t.net);
      } else {
        const avg = mh[key].weight > 0 ? mh[key].totalCost / mh[key].weight : 0;
        const sw = Math.min(N2(t.weight), mh[key].weight);
        mh[key].weight -= sw;
        mh[key].totalCost -= avg * sw;
        if (mh[key].weight < 0.001) {
          mh[key].weight = 0;
          mh[key].totalCost = 0;
        }
      }
    });
  Object.values(mh).forEach(v => {
    v.avgPrice = v.weight > 0.001 ? v.totalCost / v.weight : 0;
  });
  const mhF = Object.fromEntries(Object.entries(mh).filter(([, v]) => v.weight > 0.001));

  // ─── الحركات خلال الفترة ───
  const bTxns = DB.bankTxns.filter(t => t.date >= pStart && t.date <= pe);
  const sTxns = DB.stockTxns.filter(t => t.date >= pStart && t.date <= pe);
  const mTxns = DB.metalTxns.filter(t => t.date >= pStart && t.date <= pe);
  const divs = DB.dividends.filter(t => t.date >= pStart && t.date <= pe);
  const certPayouts = bTxns.filter(t => t.type === 'عائد شهادة');

  // ─── قيم نهاية الفترة ───
  const stocksVal = Object.entries(hF).reduce(
    (a, [s, v]) => a + v.qty * (getStockPrice(s) || v.avgPrice), 0);
  const stocksCost = Object.values(hF).reduce((a, v) => a + v.totalCost, 0);
  const metalsVal = Object.entries(mhF).reduce(
    (a, [k, v]) => a + v.weight * (getMetalPrice(v.metal_type || k.split('|')[0]) || v.avgPrice), 0);
  const metalsCost = Object.values(mhF).reduce((a, v) => a + v.totalCost, 0);

  const totalBanks = DB.banks.reduce((a, b) => a + toEGP(N2(b.balance), b.currency), 0);

  const certsInPeriod = DB.certs.filter(c => c.issued_date <= pe);
  const certsTotal = certsInPeriod.reduce((a, c) => a + N2(c.amount), 0);
  const certsInterest = certsInPeriod.reduce((a, c) => a + N2(c.total_interest), 0);
  const certsPaid = certPayouts.reduce((a, t) => a + N2(t.amount), 0);
  const divTotal = divs.reduce((a, d) => a + N2(d.amount), 0);

  const realizedStockPnl = sTxns
    .filter(t => t.type === 'بيع')
    .reduce((a, t) => a + N2(t.profit), 0);

  const stockBought = sTxns
    .filter(t => t.type === 'شراء')
    .reduce((a, t) => a + N2(t.net), 0);

  const cashIn = bTxns
    .filter(t => CREDIT.includes(t.type))
    .reduce((a, t) => a + N2(t.amount), 0);

  const cashOut = bTxns
    .filter(t => !CREDIT.includes(t.type))
    .reduce((a, t) => a + N2(t.amount), 0);

  const grand = totalBanks + stocksVal + metalsVal + certsTotal;
  const pnlStocks = stocksVal - stocksCost;
  const pnlMetals = metalsVal - metalsCost;
  const totalPnl = pnlStocks + pnlMetals + certsPaid + divTotal;

  const debtsOwed = DB.debts
    .filter(d => d.type === 'دين علي')
    .reduce((a, d) => a + N2(d.remaining), 0);
  const debtsOwing = DB.debts
    .filter(d => d.type === 'دين لي')
    .reduce((a, d) => a + N2(d.remaining), 0);

  return {
    h: hF, mh: mhF, grand,
    totalBanks, stocksVal, stocksCost, metalsVal, metalsCost,
    certsTotal, certsInterest, certsPaid, divTotal,
    pnlStocks, pnlMetals, totalPnl,
    debtsOwed, debtsOwing,
    realizedStockPnl, stockBought,
    cashIn, cashOut,
    txnCount: bTxns.length + sTxns.length + mTxns.length,
    periodStart: pStart, periodEnd: pe
  };
}

// ─── فوائد الشهادات ────────────────────────────────────────────
export function calcAccruedInterest(cert) {
  const now = new Date();
  const issued = new Date(cert.issued_date);
  const mat = new Date(cert.maturity_date);
  if (now >= mat) return N2(cert.total_interest);
  const elapsed = Math.max(0, (now - issued) / 86400000);
  const total = Math.max(1, (mat - issued) / 86400000);
  return N2(cert.total_interest) * elapsed / total;
}

export function calcNextPayoutDate(cert) {
  const now = new Date();
  const issued = new Date(cert.issued_date);
  const mat = new Date(cert.maturity_date);
  if (now >= mat) return null;
  const payout = cert.payout_type || 'سنوي';
  const periodDays = { 'يومي': 1, 'أسبوعي': 7, 'شهري': 30.4375, 'سنوي': 365.25 }[payout] || 365.25;
  const elapsedDays = (now - issued) / 86400000;
  const completedPeriods = Math.floor(Math.max(0, elapsedDays) / periodDays);
  const nextDate = new Date(issued.getTime() + (completedPeriods + 1) * periodDays * 86400000);
  return nextDate <= mat ? nextDate : mat;
}

// ─── جدول دفعات الشهادة ────────────────────────────────────────
export function getCertPayoutSchedule(cert) {
  const payout = cert.payout_type || 'سنوي';
  const periodDays = { 'يومي': 1, 'أسبوعي': 7, 'شهري': 30.4375, 'سنوي': 365.25 }[payout] || 365.25;
  const issued = new Date(cert.issued_date);
  const maturity = new Date(cert.maturity_date);
  const totalDays = Math.max(1, (maturity - issued) / 86400000);
  const totalPeriods = Math.ceil(totalDays / periodDays);
  const perPeriod = N2(cert.total_interest) / Math.max(1, totalPeriods);
  const elapsedDays = (new Date() - issued) / 86400000;
  const completedPeriods = Math.min(totalPeriods, Math.floor(Math.max(0, elapsedDays) / periodDays));
  const alreadyPaid = N2(cert.interest_paid);
  const alreadyPaidPeriods = perPeriod > 0 ? Math.round(alreadyPaid / perPeriod) : 0;

  const unpaidPeriods = [];
  for (let i = alreadyPaidPeriods + 1; i <= completedPeriods; i++) {
    const dueDate = new Date(issued.getTime() + i * periodDays * 86400000);
    const isLast = i === totalPeriods;
    let amt = perPeriod;
    if (isLast) {
      const paidSoFar = perPeriod * (i - 1);
      amt = Math.max(0, N2(cert.total_interest) - paidSoFar);
    }
    unpaidPeriods.push({
      period: i,
      date: dueDate.toISOString().slice(0, 10),
      amount: +amt.toFixed(4)
    });
  }

  return {
    payout, periodDays, totalPeriods, perPeriod,
    completedPeriods, alreadyPaidPeriods, unpaidPeriods
  };
}

// ─── تواريخ متكررة ─────────────────────────────────────────────
export function nextRecDate(r) {
  const last = r.last_applied ? new Date(r.last_applied) : new Date(r.start_date);
  const next = new Date(last);
  if (r.freq === 'monthly') next.setMonth(next.getMonth() + 1);
  else if (r.freq === 'weekly') next.setDate(next.getDate() + 7);
  else if (r.freq === 'yearly') next.setFullYear(next.getFullYear() + 1);
  return next.toISOString().slice(0, 10);
}

// ─── حوليات الزكاة (هجري) ──────────────────────────────────────
const ymdLocal = d => d.getFullYear() + '-'
  + String(d.getMonth() + 1).padStart(2, '0') + '-'
  + String(d.getDate()).padStart(2, '0');

export function hijriParts(ds) {
  const p = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
    year: 'numeric', month: 'numeric', day: 'numeric'
  }).formatToParts(new Date(ds + 'T12:00:00'));
  const g = t => +String(p.find(x => x.type === t).value).replace(/\D/g, '');
  return { y: g('year'), m: g('month'), d: g('day') };
}

export function hijriLabel(ds) {
  if (!ds) return '';
  return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
    year: 'numeric', month: 'long', day: 'numeric'
  }).format(new Date(ds + 'T12:00:00'));
}

export function addHijriYear(ds) {
  const hp = hijriParts(ds);
  const start = new Date(ds + 'T12:00:00');
  for (let i = 350; i <= 360; i++) {
    const c = ymdLocal(new Date(start.getTime() + i * 86400000));
    const p = hijriParts(c);
    if (p.y === hp.y + 1 && p.m === hp.m && p.d === hp.d) return c;
  }
  return ymdLocal(new Date(start.getTime() + 354 * 86400000));
}
