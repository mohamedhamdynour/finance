// ══════════════════════════════════════════════════════════════════
//  utils.js — دوال مساعدة
// ══════════════════════════════════════════════════════════════════
import { DB, UI, APP_SETTINGS } from '../state.js';

// ─── ثوابت ─────────────────────────────────────────────────────
export const BANK_PALETTE = [
  '#3b82f6','#0d9488','#d97706','#7c3aed','#e11d48','#0891b2',
  '#16a34a','#ea580c','#6366f1','#ec4899','#14b8a6','#f59e0b'
];

export const MARKET_COLORS = {
  'EGX':'badge-blue','TADAWUL':'badge-green','ADX':'badge-teal',
  'NYSE':'badge-purple','NASDAQ':'badge-purple','CRYPTO':'badge-gold'
};

export const MARKET_NAMES = {
  'EGX':'مصر','TADAWUL':'السعودية','ADX':'الإمارات',
  'NYSE':'NYSE','NASDAQ':'NASDAQ','CRYPTO':'كريبتو'
};

export const CURRENCY_LABELS = {
  EGP:'الجنيه المصري', SAR:'ريال سعودي', AED:'درهم إماراتي',
  USD:'دولار أمريكي', EUR:'يورو', GBP:'جنيه إسترليني',
  KWD:'دينار كويتي', QAR:'ريال قطري', BHD:'دينار بحريني',
  OMR:'ريال عماني', JOD:'دينار أردني'
};

// ─── أرقام وتنسيق ──────────────────────────────────────────────
export const N2 = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const fmtN = (v, d = 2) => new Intl.NumberFormat('ar-EG', {
  minimumFractionDigits: d,
  maximumFractionDigits: d
}).format(N2(v));

// ─── العملة الأساسية ───────────────────────────────────────────
export const baseCur = () => (APP_SETTINGS && APP_SETTINGS.base_currency) || 'EGP';

// ✅ جديد: الاسم الكامل للعملة الأساسية
export const baseCurName = () => {
  const c = (APP_SETTINGS.currencies || []).find(x => x.code === baseCur());
  return c ? c.name : baseCur();
};

export const fmt = (v, cur) => fmtN(v) + ' ' + (cur || baseCur());

export const fmtK = (v) => {
  const a = Math.abs(N2(v));
  if (a >= 1e6) return (N2(v) / 1e6).toFixed(1) + 'M ' + baseCur();
  if (a >= 1e3) return (N2(v) / 1e3).toFixed(1) + 'K ' + baseCur();
  return fmt(v);
};

// ─── نسب ───────────────────────────────────────────────────────
export const pct = (v, t) => t && N2(t) > 0 ? ((N2(v) / N2(t)) * 100).toFixed(1) + '%' : '0%';
export const pctN = (v, t) => t && N2(t) > 0 ? (N2(v) / N2(t)) * 100 : 0;

// ─── تواريخ ────────────────────────────────────────────────────
// Use local calendar dates. toISOString() uses UTC and can return yesterday/tomorrow
// relative to the user's local date, which can misclassify financial transactions.
const localISODate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
};

export const today = () => localISODate(new Date());

const shiftMonthsClamped = (date, months) => {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
};

const shiftYearsClamped = (date, years) => {
  const d = new Date(date);
  const day = d.getDate();
  const month = d.getMonth();
  d.setDate(1);
  d.setFullYear(d.getFullYear() + years);
  d.setMonth(month);
  const lastDay = new Date(d.getFullYear(), month + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
};

export const periodStart = (p) => {
  if (p === 'custom') return UI.customFrom || '2000-01-01';
  if (p === 'all') return '2000-01-01';
  const d = new Date();
  if (p === '3m') return localISODate(shiftMonthsClamped(d, -3));
  if (p === '6m') return localISODate(shiftMonthsClamped(d, -6));
  if (p === '1y') return localISODate(shiftYearsClamped(d, -1));
  if (p === '2y') return localISODate(shiftYearsClamped(d, -2));
  if (p === '3y') return localISODate(shiftYearsClamped(d, -3));
  if (p === '5y') return localISODate(shiftYearsClamped(d, -5));
  return localISODate(d);
};

export const periodEnd = (p) => p === 'custom' ? (UI.customTo || today()) : today();

export const filterByPeriod = (arr, p, dateField = 'date') => {
  const s = periodStart(p), e = periodEnd(p);
  return arr.filter(r => r[dateField] >= s && r[dateField] <= e);
};

// ─── إشارات وتصنيفات ───────────────────────────────────────────
export const sign = v => N2(v) >= 0 ? '+' : '';
export const cls = v => N2(v) >= 0 ? 'pos' : 'neg';

// ─── العملات والصرف ────────────────────────────────────────────
export const currencyCodes = () => (APP_SETTINGS.currencies || []).map(c => c.code);

export const currencyName = (code) => {
  const c = APP_SETTINGS.currencies.find(x => x.code === code);
  return c ? c.name : code;
};

export const getRate = (cur) => {
  if (!cur || cur === 'EGP') return 1;
  const r = DB.exchangeRates.find(x => x.currency === cur);
  return r ? N2(r.rate) : 1;
};

/**
 * ✅ يحوّل مبلغاً بعملة معينة إلى EGP مباشرة (نقطة الارتكاز الثابتة)
 * — استخدمها عند حفظ/قراءة snapshots وإحصائيات تاريخية
 */
export const toEGPRaw = (amt, cur) => {
  if (!cur || cur === 'EGP') return N2(amt);
  return N2(amt) * getRate(cur);
};

/**
 * يحوّل مبلغاً من عملة إلى العملة الأساسية المختارة حالياً
 * (يستخدم EGP كنقطة ارتكاز داخلية)
 */
export const toEGP = (amt, cur) => {
  const amtInEGP = toEGPRaw(amt, cur);
  const bc = baseCur();
  if (bc === 'EGP') return amtInEGP;
  const baseRate = getRate(bc);
  return baseRate > 0 ? amtInEGP / baseRate : amtInEGP;
};

/**
 * ✅ يحوّل مبلغاً من EGP إلى عملة معينة (للعرض)
 */
export const fromEGP = (egpAmt, targetCur) => {
  if (!targetCur || targetCur === 'EGP') return N2(egpAmt);
  const rate = getRate(targetCur);
  return rate > 0 ? N2(egpAmt) / rate : N2(egpAmt);
};

// ─── ألوان البنوك ──────────────────────────────────────────────
export const getBankColor = (bankId) => {
  const b = DB.banks.find(x => x.id === bankId);
  if (!b) return '#3b82f6';
  if (b.color && b.color.startsWith('#')) return b.color;
  const sum = [...b.name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return BANK_PALETTE[Math.abs(sum) % BANK_PALETTE.length];
};

export const bankColorDot = (bankId, size = 8) => {
  const c = getBankColor(bankId);
  return `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:${c};flex-shrink:0;margin-left:3px"></span>`;
};

// ─── مساعدات ───────────────────────────────────────────────────
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

export const debounce = (fn, ms = 250) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

export const encodeID = s => String(s).replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');
