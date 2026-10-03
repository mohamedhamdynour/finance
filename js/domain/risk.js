// ══════════════════════════════════════════════════════════════════
//  risk.js — حسابات مخاطر المحفظة (pure math, no DOM)
// ══════════════════════════════════════════════════════════════════
import { DB } from '../state.js';
import { N2, toEGP } from '../core/utils.js';
import { calcTotals, getHoldings, getMetalHoldings, getStockPrice, getMetalPrice } from './calc.js';

// ══════════════════════ إحصاءات أساسية ══════════════════════

export function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const sq = arr.reduce((a, b) => a + Math.pow(b - m, 2), 0);
  return Math.sqrt(sq / (arr.length - 1));
}

export function percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const idx = (sortedArr.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

// ══════════════════════ HHI (مؤشر التركيز) ══════════════════════

/**
 * Herfindahl-Hirschman Index — مقياس تركيز.
 * 0 = تنويع كامل، 10000 = أصل واحد فقط.
 */
export function hhi(weights) {
  return weights.reduce((a, w) => a + (w * 100) * (w * 100), 0);
}

export function hhiLabel(hhiValue) {
  if (hhiValue < 1000) return { label: 'متنوع جداً', color: 'var(--green)' };
  if (hhiValue < 1800) return { label: 'متنوع', color: 'var(--teal)' };
  if (hhiValue < 2500) return { label: 'متوسط التركيز', color: 'var(--gold)' };
  if (hhiValue < 5000) return { label: 'مركّز', color: 'var(--orange)' };
  return { label: 'مركّز جداً', color: 'var(--red)' };
}

// ══════════════════════ تحليل التركيز ══════════════════════

export function concentrationAnalysis() {
  const T = calcTotals();
  const h = getHoldings();
  const mh = getMetalHoldings();
  const grand = T.grand;
  if (grand <= 0) return { assets: [], byCategory: [], hhi: 0, maxAsset: null, top3Pct: 0 };

  const assets = [];

  // بنوك
  DB.banks.forEach(b => {
    const val = toEGP(N2(b.balance), b.currency);
    if (val > 0) assets.push({ type: 'بنك', symbol: b.name, value: val, color: '#1a56db' });
  });
  // أسهم
  Object.entries(h).forEach(([sym, v]) => {
    const val = v.qty * (getStockPrice(sym) || v.avgPrice);
    if (val > 0) assets.push({ type: 'سهم', symbol: sym, value: val, color: '#0d9488' });
  });
  // معادن
  Object.entries(mh).forEach(([key, v]) => {
    const bt = (v.metal_type || key.split('|')[0]).trim();
    const val = v.weight * (getMetalPrice(bt) || v.avgPrice);
    if (val > 0) assets.push({ type: 'معدن', symbol: bt + (v.title ? ' — ' + v.title : ''), value: val, color: '#d97706' });
  });
  // شهادات
  DB.certs.forEach(c => {
    const val = N2(c.amount);
    if (val > 0) assets.push({ type: 'شهادة', symbol: c.name, value: val, color: '#7c3aed' });
  });

  assets.forEach(a => { a.weight = a.value / grand; });
  assets.sort((a, b) => b.weight - a.weight);

  const weights = assets.map(a => a.weight);
  const hhiValue = hhi(weights);
  const maxAsset = assets[0] || null;
  const top3Pct = assets.slice(0, 3).reduce((a, x) => a + x.weight * 100, 0);

  const byCategory = [
    { key: 'بنوك', label: 'البنوك والنقد', value: T.totalBanks, color: '#1a56db' },
    { key: 'أسهم', label: 'الأسهم والصناديق', value: T.stocksVal, color: '#0d9488' },
    { key: 'معادن', label: 'المعادن الثمينة', value: T.metalsVal, color: '#d97706' },
    { key: 'شهادات', label: 'الشهادات الادخارية', value: T.certsTotal, color: '#7c3aed' }
  ].map(c => ({ ...c, weight: grand > 0 ? c.value / grand : 0 }))
   .filter(c => c.value > 0)
   .sort((a, b) => b.value - a.value);

  return { assets, byCategory, hhi: hhiValue, maxAsset, top3Pct, grand };
}

// ══════════════════════ درجة التنويع (0-100) ══════════════════════

export function diversificationScore() {
  const { assets, byCategory, hhi: hhiVal } = concentrationAnalysis();
  if (!assets.length) return { score: 0, breakdown: {} };

  // 1) تنويع ضمن الفئات (40%)
  const catScore = Math.min(100, byCategory.length * 25); // 4 فئات = 100

  // 2) عدد الأصول (30%) — 20 أصل = 100
  const assetScore = Math.min(100, assets.length * 5);

  // 3) HHI معكوس (30%) — HHI منخفض = تنويع أعلى
  const hhiScore = Math.max(0, Math.min(100, 100 - (hhiVal / 100))); // HHI 10000 → 0

  const score = catScore * 0.4 + assetScore * 0.3 + hhiScore * 0.3;

  return {
    score: Math.round(score),
    breakdown: {
      categories: { score: Math.round(catScore), weight: 40, count: byCategory.length },
      assets:     { score: Math.round(assetScore), weight: 30, count: assets.length },
      hhi:        { score: Math.round(hhiScore), weight: 30, value: Math.round(hhiVal) }
    }
  };
}

// ══════════════════════ المخاطر التاريخية (من snapshots) ══════════════════════

export function historicalRisk() {
  const snaps = [...DB.snapshots].sort((a, b) => a.snapshot_date > b.snapshot_date ? 1 : -1);
  if (snaps.length < 5) return { hasData: false, count: snaps.length, needed: 5 };

  const returns = [];
  for (let i = 1; i < snaps.length; i++) {
    const prev = N2(snaps[i - 1].grand_total);
    const curr = N2(snaps[i].grand_total);
    if (prev > 0) returns.push((curr - prev) / prev);
  }

  if (returns.length < 4) return { hasData: false, count: returns.length, needed: 4 };

  const dailyMean = mean(returns);
  const dailyStd = stdDev(returns);
  const annualMean = dailyMean * 252;
  const annualStd = dailyStd * Math.sqrt(252);

  // Sharpe (risk-free = 0.20 سنوياً كافتراض للسوق المصري)
  const riskFree = 0.20;
  const sharpe = annualStd > 0 ? (annualMean - riskFree) / annualStd : 0;

  // Sortino (downside deviation فقط)
  const negativeReturns = returns.filter(r => r < 0);
  const downsideStd = negativeReturns.length > 1
    ? Math.sqrt(negativeReturns.reduce((a, r) => a + r * r, 0) / negativeReturns.length) * Math.sqrt(252)
    : 0;
  const sortino = downsideStd > 0 ? (annualMean - riskFree) / downsideStd : 0;

  // Max Drawdown
  let peak = N2(snaps[0].grand_total);
  let maxDrawdown = 0;
  let maxDrawdownStart = snaps[0].snapshot_date;
  let maxDrawdownEnd = snaps[0].snapshot_date;
  let currentPeakDate = snaps[0].snapshot_date;
  snaps.forEach(s => {
    const val = N2(s.grand_total);
    if (val > peak) { peak = val; currentPeakDate = s.snapshot_date; }
    const drawdown = peak > 0 ? (val - peak) / peak : 0;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownStart = currentPeakDate;
      maxDrawdownEnd = s.snapshot_date;
    }
  });

  // Value at Risk (95% one-day) — parametric
  const var95 = -(dailyMean - 1.645 * dailyStd); // قيمة موجبة = الخسارة المتوقعة
  const currentValue = N2(snaps[snaps.length - 1].grand_total);
  const var95Value = var95 * currentValue;

  // CVaR / Expected Shortfall (95%) — متوسط الخسائر الأكبر من VaR
  const sortedReturns = [...returns].sort((a, b) => a - b);
  const cutoffIdx = Math.max(0, Math.floor(returns.length * 0.05));
  const tailReturns = sortedReturns.slice(0, Math.max(1, cutoffIdx));
  const cvar95 = -mean(tailReturns);
  const cvar95Value = cvar95 * currentValue;

  return {
    hasData: true,
    count: snaps.length,
    returns: returns.length,
    dailyMean, dailyStd, annualMean, annualStd,
    sharpe, sortino, riskFree,
    maxDrawdown, maxDrawdownStart, maxDrawdownEnd,
    var95, var95Value, cvar95, cvar95Value,
    currentValue
  };
}

// ══════════════════════ تنبيهات المخاطر ══════════════════════

export function riskAlerts() {
  const alerts = [];
  const { byCategory, maxAsset, hhi: hhiVal } = concentrationAnalysis();
  const T = calcTotals();

  // 1) فئة واحدة > 60%
  const dominantCat = byCategory.find(c => c.weight > 0.6);
  if (dominantCat) {
    alerts.push({
      severity: 'high',
      title: `تركيز عالٍ في ${dominantCat.label}`,
      body: `${(dominantCat.weight * 100).toFixed(1)}% من محفظتك في فئة واحدة — يُفضَّل التنويع بين فئتين على الأقل`
    });
  } else {
    const catOver50 = byCategory.find(c => c.weight > 0.5);
    if (catOver50) {
      alerts.push({
        severity: 'medium',
        title: `تركيز متوسط في ${catOver50.label}`,
        body: `${(catOver50.weight * 100).toFixed(1)}% من محفظتك في فئة واحدة`
      });
    }
  }

  // 2) أصل واحد > 25%
  if (maxAsset && maxAsset.weight > 0.25) {
    alerts.push({
      severity: maxAsset.weight > 0.4 ? 'high' : 'medium',
      title: `أصل واحد يستحوذ على ${(maxAsset.weight * 100).toFixed(1)}%`,
      body: `${maxAsset.type}: ${maxAsset.symbol} — يُفضَّل ألا يتجاوز 20-25% من المحفظة`
    });
  }

  // 3) سيولة منخفضة (نقد < 5%)
  const cashPct = T.grand > 0 ? T.totalBanks / T.grand : 0;
  if (cashPct < 0.05 && T.grand > 0) {
    alerts.push({
      severity: 'medium',
      title: 'سيولة منخفضة',
      body: `النقد يشكّل ${(cashPct * 100).toFixed(1)}% فقط — قد تحتاج سيولة للطوارئ`
    });
  }

  // 4) تركيز عالٍ (HHI > 2500)
  if (hhiVal > 2500) {
    alerts.push({
      severity: 'medium',
      title: 'تركيز مرتفع في قليل من الأصول',
      body: `مؤشر HHI = ${Math.round(hhiVal)} — تنويعك محدود نسبياً`
    });
  }

  // 5) لا يوجد شهادات (دخل ثابت)
  if (T.certsTotal === 0 && T.grand > 100000) {
    alerts.push({
      severity: 'low',
      title: 'لا يوجد دخل ثابت',
      body: 'شهادات ادخارية توفر استقراراً وتقلل تقلب المحفظة'
    });
  }

  // 6) لا يوجد معادن (تحوّط ضد التضخم)
  if (T.metalsVal === 0 && T.grand > 100000) {
    alerts.push({
      severity: 'low',
      title: 'لا يوجد تحوّط ضد التضخم',
      body: 'المعادن الثمينة (خصوصاً الذهب) تحمي القوة الشرائية'
    });
  }

  return alerts;
}

// ══════════════════════ توزيع PnL حسب الفئة ══════════════════════

export function pnlByCategory() {
  const T = calcTotals();
  return [
    { key: 'stocks', label: 'الأسهم', value: T.pnlStocks, cost: T.stocksCost, color: '#0d9488' },
    { key: 'metals', label: 'المعادن', value: T.pnlMetals, cost: T.metalsCost, color: '#d97706' },
    { key: 'certs',  label: 'الشهادات (مُصرَّف)', value: T.certsPaid, cost: T.certsTotal, color: '#7c3aed' },
    { key: 'divs',   label: 'توزيعات الأرباح', value: T.divTotal, cost: 0, color: '#0891b2' }
  ].map(x => ({
    ...x,
    pct: x.cost > 0 ? (x.value / x.cost) * 100 : null
  }));
}
