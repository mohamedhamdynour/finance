// ══════════════════════════════════════════════════════════════════
//  utils.js — دوال مساعدة (تنسيق، تواريخ، عملات، ألوان)
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

// ─── أرقام وتنسيق ──────────────────────────────────────────────
export const N2 = v => (isNaN(+v) ? 0 : +v);

export const fmtN = (v, d = 2) => new Intl.NumberFormat('ar-EG', {
  minimumFractionDigits: d,
  maximumFractionDigits: d
}).format(N2(v));

// ─── العملة الأساسية ───────────────────────────────────────────
export const baseCur = () => (APP_SETTINGS && APP_SETTINGS.base_currency) || 'EGP';

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
export const today = () => new Date().toISOString().slice(0, 10);

export const periodStart = (p) => {
  if (p === 'custom') return UI.customFrom || '2000-01-01';
  if (p === 'all') return '2000-01-01';
  const d = new Date();
  if (p === '3m') d.setMonth(d.getMonth() - 3);
  else if (p === '6m') d.setMonth(d.getMonth() - 6);
  else if (p === '1y') d.setFullYear(d.getFullYear() - 1);
  else if (p === '2y') d.setFullYear(d.getFullYear() - 2);
  else if (p === '3y') d.setFullYear(d.getFullYear() - 3);
  else if (p === '5y') d.setFullYear(d.getFullYear() - 5);
  return d.toISOString().slice(0, 10);
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

// يحوّل أي مبلغ إلى العملة الأساسية عبر EGP كنقطة ارتكاز
export const toEGP = (amt, cur) => {
  const amtInEGP = N2(amt) * getRate(cur || 'EGP');
  const bc = baseCur();
  if (bc === 'EGP') return amtInEGP;
  const baseRate = getRate(bc);
  return baseRate > 0 ? amtInEGP / baseRate : amtInEGP;
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

// ─── مساعدات جديدة (لم تكن موجودة قبل) ─────────────────────────

// تهريب نص المستخدم قبل وضعه في innerHTML (منع XSS)
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

// تأخير تنفيذ الدالة (للبحث الحيّ مثلاً)
export const debounce = (fn, ms = 250) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

// تنقية مُعرّف HTML (يُستخدم في id حقول أسعار المعادن)
export const encodeID = s => String(s).replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');
