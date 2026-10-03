// ══════════════════════════════════════════════════════════════════
//  state.js — الحالة العامة للتطبيق (بدون أي منطق)
//  أي وحدة أخرى تستورد منها ما تحتاجه. لا تستورد هي أي شيء.
// ══════════════════════════════════════════════════════════════════

// ─── البيانات المُحمَّلة من قاعدة البيانات ───────────────────────
export const DB = {
  banks: [],
  bankTxns: [],
  stockTxns: [],
  stockPrices: [],
  metalTxns: [],
  metalPrices: [],
  certs: [],
  dividends: [],
  recurring: [],
  goals: [],
  exchangeRates: [],
  snapshots: [],
  debts: [],
  debtPayments: [],
  installments: [],
  installmentPayments: []
};

// ─── حالة الواجهة (UI) ─────────────────────────────────────────
export const UI = {
  activePage: 'dashboard',
  activeBankId: null,
  globalPeriod: '1y',
  customFrom: null,
  customTo: null,
  bankSort: 'desc',
  bankTxnFilter: 'ALL',
  recurringFilter: 'ALL'
};

// ─── مراجع الرسوم البيانية ─────────────────────────────────────
export const CHARTS = {};

// ─── إعدادات التطبيق (يُحمَّل من قاعدة البيانات أو localStorage) ─
export const APP_SETTINGS = {
  exchange_name: '',
  base_currency: 'EGP',
  currencies: [
    { code: 'EGP', name: 'الجنيه المصري' },
    { code: 'USD', name: 'دولار أمريكي' },
    { code: 'SAR', name: 'ريال سعودي' },
    { code: 'AED', name: 'درهم إماراتي' },
    { code: 'EUR', name: 'يورو' },
    { code: 'GBP', name: 'جنيه إسترليني' }
  ],
  goldapi_key: '',
  zakat: {
    start_date: null,
    gold_price: null,
    silver_price: null,
    basis: 'gold',
    include: {},
    history: []
  },
  rebalancing: {
    targets: { banks: 25, stocks: 45, metals: 20, certs: 10 },
    threshold: 5
  },
    forecast: {
    horizon: 12,
    expectedReturn: 15,
    monthsBack: 6,
    monthlyContribution: null
  },
};

// ─── حالة الاتصال والمصادقة ────────────────────────────────────
// نستخدم كائنًا قابلاً للتعديل لأن ES Modules تمنع إعادة التصدير المباشر
export const conn = {
  SB_URL: '',
  SB_KEY: '',
  supabaseClient: null,
  authSession: null,
  settingsBackend: 'local'
};

// ─── سياق التعديل الحالي (generic edit modal) ──────────────────
export const editCtx = { table: null, id: null };

// ─── سوق الأسهم النشط ─────────────────────────────────────────
export const marketCtx = { activeStockMarket: 'ALL' };
