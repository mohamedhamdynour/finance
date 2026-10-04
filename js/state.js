// ══════════════════════════════════════════════════════════════════
//  state.js — الحالة العامة للتطبيق
//  مسؤولية واحدة: تعريف الحاويات المشتركة (DB, UI, APP_SETTINGS, ...)
//  لا يستورد أي شيء — يُستورد فقط.
// ══════════════════════════════════════════════════════════════════

// ─── البيانات المُحمَّلة من قاعدة البيانات ────────────────────────
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
  installmentPayments: [],
  attachments: []
};

// ─── حالة الواجهة ──────────────────────────────────────────────
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

// ─── إعدادات التطبيق (يُحمَّل من قاعدة البيانات أو localStorage) ──
export const APP_SETTINGS = {
  exchange_name: '',
  base_currency: 'EGP',       // ← يمكن تغييرها من الإعدادات
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
  tax: {
    stockCapitalGainsRate: 0,
    stockDividendRate: 10,
    certInterestRate: 0,
    bankInterestRate: 20,
    exemptThreshold: 0
  },
  comparisons: {
    defaultTab: 'mom'
  }
};

// ─── حالة الاتصال والمصادقة ─────────────────────────────────────
export const conn = {
  SB_URL: '',
  SB_KEY: '',
  supabaseClient: null,
  authSession: null,
  settingsBackend: 'local',
  viewingUserId: null,
  viewingRole: null
};

// ─── سياق التعديل الحالي (Generic Edit Modal) ──────────────────
export const editCtx = { table: null, id: null };

// ─── السوق النشط في صفحة الأسهم ────────────────────────────────
export const marketCtx = { activeStockMarket: 'ALL' };
