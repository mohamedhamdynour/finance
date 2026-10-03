// ══════════════════════════════════════════════════════════════════
//  main.js — نقطة الدخول وربط الوحدات
// ══════════════════════════════════════════════════════════════════

// ─── 1) Core ────────────────────────────────────────────────────
import { DB, UI, APP_SETTINGS, CHARTS, conn, editCtx, marketCtx } from './state.js';
import { N2, fmt, fmtN, pct, today, baseCur, escapeHtml, toEGP, periodStart } from './core/utils.js';
import { sbGet, sbPost, sbPatch, sbDel, sbUpsert, sbRpc, sbPatchBy } from './core/supabase.js';
import {
  initAuthGate, connectSupabase, disconnectSupabase, doLogin, doSignup, doLogout,
  setAuthTab, setAuthSuccessHandler, isAuthenticated, getCurrentUser
} from './core/auth.js';
import { openGlobalSearch, closeGlobalSearch } from './ui/search.js';
import {
  loadAppSettings, persistAppSettings, populateAllCurrencySelects,
  updateCurrencyLabels, renderSettings, renderSchemaAlert,
  addSettingsCurrency, renameSettingsCurrency, removeSettingsCurrency,
  saveGeneralSettings, saveGoldApiKey, populateMetalTypeSelect, onMetalTypeChange
} from './core/settings.js';
import { showAllSkeletons, hideAllSkeletons } from './ui/skeleton.js';
import { saveCache, loadCache, applyCacheToDB, clearCache, cacheInfo } from './core/cache.js';
import { ensureChartLoaded } from './ui/charts.js';
import { installNetworkIndicator, setupNetworkToasts } from './ui/network-indicator.js';
import { isOnline } from './core/network.js';
import * as installmentsPage from './ui/pages/installments.js';
import * as rebalancingPage from './ui/pages/rebalancing.js';
import * as riskPage from './ui/pages/risk.js';
import * as forecastPage from './ui/pages/forecast.js';
import { installAttachmentHandlers } from './ui/attachments.js';
import { attachmentsCount } from './domain/attachments.js';

// ─── 2) UI Shared ──────────────────────────────────────────────
import { toast, installToastGlobal } from './ui/toast.js';
import { destroyChart } from './ui/charts.js';
import {
  kpi, svgIcon, typeTag, populateSelect, previewBox,
  getCertAlerts, updateBadges,
  setBankSort, setBankTxnFilter, switchBankTab, setStockMarket,
  setPeriodFromSelect, applyGlobalCustomRange,
  getReportPeriodBounds
} from './ui/shared.js';
import {
  openModal, closeModal,
  updateDepPreview, updateWitPreview, updateTransferPreview,
  updateBuyPreview, updateSellPreview, updateMetalBuyPreview, updateMetalSellPreview,
  updateCertPreview, updateCertBreakPreview,
  setCertPayoutMode, setBulkCertMode, setDividendMode
} from './ui/modals.js';
import { updateNotificationBell, toggleNotifications } from './ui/notifications.js';
import { saveEdit } from './ui/save-edit.js';

// ─── 3) Domain ──────────────────────────────────────────────────
import { calcTotals, nextRecDate } from './domain/calc.js';

// ─── 4) Pages ───────────────────────────────────────────────────
import * as banksPage from './ui/pages/banks.js';
import * as stocksPage from './ui/pages/stocks.js';
import * as metalsPage from './ui/pages/metals.js';
import * as certsPage from './ui/pages/certs.js';
import * as debtsPage from './ui/pages/debts.js';
import * as recurringPage from './ui/pages/recurring.js';
import * as goalsPage from './ui/pages/goals.js';
import * as pricesPage from './ui/pages/prices.js';
import * as dashboardPage from './ui/pages/dashboard.js';
import * as heatmapPage from './ui/pages/heatmap.js';
import * as reportsPage from './ui/pages/reports.js';
import * as zakatPage from './ui/pages/zakat.js';

// ══════════════════════════════════════════════════════════════════
//  Theme
// ══════════════════════════════════════════════════════════════════
const SUN_PATH = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
const MOON_PATH = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';

function toggleDark() {
  document.body.classList.toggle('dark');
  const dk = document.body.classList.contains('dark');
  document.querySelectorAll('select,input').forEach(s => s.style.colorScheme = dk ? 'dark' : 'light');
  localStorage.setItem('darkMode', dk ? '1' : '0');
  const iconPath = dk ? SUN_PATH : MOON_PATH;
  ['dark-icon', 'topbar-dark-icon'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = iconPath;
  });
  const dt = document.getElementById('dark-text');
  if (dt) dt.textContent = dk ? 'نهاري' : 'ليلي';
  setTimeout(() => renderPage(), 50);
}

function initDarkMode() {
  if (localStorage.getItem('darkMode') === '1') {
    document.body.classList.add('dark');
    document.querySelectorAll('select,input').forEach(s => s.style.colorScheme = 'dark');
    ['dark-icon', 'topbar-dark-icon'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = SUN_PATH;
    });
    const dt = document.getElementById('dark-text');
    if (dt) dt.textContent = 'نهاري';
  }
  const savedPeriod = localStorage.getItem('globalPeriod') || '1y';
  UI.globalPeriod = savedPeriod;
  const ps = document.getElementById('global-period-select');
  if (ps) ps.value = savedPeriod;
}

// ══════════════════════════════════════════════════════════════════
//  Sidebar + Navigation
// ══════════════════════════════════════════════════════════════════
function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('collapsed');
}

const PAGE_TITLES = {
  dashboard: ['لوحة التحكم', 'نظرة شاملة على محفظتك'],
  banks: ['الحسابات البنكية', 'إدارة أرصدتك وحركاتك'],
  stocks: ['الأسهم والصناديق', 'تتبع حيازاتك وأرباحك'],
  metals: ['المعادن الثمينة', 'الذهب والفضة والبلاتين'],
  certs: ['الشهادات الادخارية', 'عوائدك الثابتة'],
  debts: ['الديون والالتزامات', 'ما عليك وما لك'],
  recurring: ['العمليات المتكررة', 'أتمتة معاملاتك'],
  goals: ['الأهداف المالية', 'خططك المستقبلية'],
  prices: ['تحديث الأسعار', 'أسعار السوق الحالية'],
  reports: ['التقارير والتحليل', 'تحليل شامل لمحفظتك'],
  zakat: ['الزكاة', 'حساب الزكاة الشرعية'],
  settings: ['الإعدادات', 'ضبط متغيرات المحفظة'],
  installments: ['الأقساط والالتزامات المقسّمة', 'تتبع أقساطك ودفعاتك'],
  rebalancing: ['إعادة توازن المحفظة', 'قارن توزيعك الحالي بالمستهدف'],
  risk: ['تحليل المخاطر', 'قياس كمي لمخاطر محفظتك'],
  forecast: ['التوقعات المالية', 'تنبؤ بمستقبل محفظتك'],

};

function nav(page) {
  Object.keys(CHARTS).forEach(k => { if (k.startsWith(UI.activePage)) destroyChart(k); });
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
  UI.activePage = page;
  const titles = PAGE_TITLES[page] || [page, ''];
  document.getElementById('topbar-title').textContent = titles[0];
  document.getElementById('topbar-sub').textContent = titles[1];
  renderPage();
}

function renderPage() {
  const p = UI.activePage;
  try {
    if (p === 'dashboard') dashboardPage.renderDashboard();
    else if (p === 'banks') banksPage.renderBanks();
    else if (p === 'stocks') stocksPage.renderStocks();
    else if (p === 'metals') metalsPage.renderMetals();
    else if (p === 'certs') certsPage.renderCerts();
    else if (p === 'debts') debtsPage.renderDebts();
    else if (p === 'installments') installmentsPage.renderInstallments();
    else if (p === 'rebalancing') rebalancingPage.renderRebalancing();
    else if (p === 'recurring') recurringPage.renderRecurring();
    else if (p === 'goals') goalsPage.renderGoals();
    else if (p === 'prices') pricesPage.renderPrices();
    else if (p === 'reports') reportsPage.renderReports();
    else if (p === 'risk') riskPage.renderRisk();
    else if (p === 'zakat') zakatPage.renderZakat();
    else if (p === 'forecast') forecastPage.renderForecast();
    else if (p === 'settings') renderSettings();
  } catch (e) {
    console.error('renderPage error on page [' + p + ']:', e);
    toast('خطأ في عرض الصفحة: ' + e.message, false);
  }
}

// ══════════════════════════════════════════════════════════════════
//  Snapshots
// ══════════════════════════════════════════════════════════════════
async function saveSnapshot() {
  const t = calcTotals();
  const snap = {
    snapshot_date: today(),
    total_banks: t.totalBanks, total_stocks: t.stocksVal,
    total_metals: t.metalsVal, total_certs: t.certsTotal,
    grand_total: t.grand
  };
  try { await sbUpsert('portfolio_snapshots', snap); } catch (e) {}
}

// ══════════════════════════════════════════════════════════════════
//  Integrity check (مبسّطة — trigger يتولى الرصيد)
// ══════════════════════════════════════════════════════════════════
async function runIntegrityCheck() {
  let fixed = 0;
  const bankTxnIds = new Set(DB.bankTxns.map(t => t.id));
  const bankIds = new Set(DB.banks.map(b => b.id));

  // 1-3) مراجع بنكية معطوبة في الأسهم/المعادن/الشهادات
  for (const t of DB.stockTxns) {
    if (t.bank_transaction_id && !bankTxnIds.has(t.bank_transaction_id)) {
      try { await sbPatch('stock_transactions', t.id, { bank_transaction_id: null }); fixed++; } catch (e) {}
    }
  }
  for (const t of DB.metalTxns) {
    if (t.bank_transaction_id && !bankTxnIds.has(t.bank_transaction_id)) {
      try { await sbPatch('metal_transactions', t.id, { bank_transaction_id: null }); fixed++; } catch (e) {}
    }
  }
  for (const c of DB.certs) {
    if (c.bank_transaction_id && !bankTxnIds.has(c.bank_transaction_id)) {
      try { await sbPatch('certificates', c.id, { bank_transaction_id: null }); fixed++; } catch (e) {}
    }
  }
  // 4) حركات بنكية لبنوك غير موجودة
  for (const t of DB.bankTxns.filter(t => !bankIds.has(t.bank_id))) {
    try { await sbDel('bank_transactions', t.id); fixed++; } catch (e) {}
  }
  // 5) linked_transfer_id معطوب
  for (const t of DB.bankTxns) {
    if (t.linked_transfer_id && !bankTxnIds.has(t.linked_transfer_id)) {
      try { await sbPatch('bank_transactions', t.id, { linked_transfer_id: null }); fixed++; } catch (e) {}
    }
  }
  if (fixed > 0) { console.log('[Integrity] fixed', fixed); await loadAll(); }
  else console.log('[Integrity] all checks passed');
}

// ══════════════════════════════════════════════════════════════════
//  loadAll — نقطة التحميل المركزية
// ══════════════════════════════════════════════════════════════════
async function loadAll(opts = {}) {
  if (!isOnline()) {
  console.log('[loadAll] الجهاز غير متصل — تم استخدام الكاش');
  const cache = await loadCache();
  if (cache) {
    applyCacheToDB(cache.data);
    renderPage();
    updateNotificationBell();
    const syncEl = document.getElementById('sidebar-sync');
    if (syncEl) syncEl.innerHTML = '<span class="sync-dot err"></span> غير متصل — عرض من الكاش';
  }
  hideAllSkeletons();
  return;
}
  
  const silent = opts.silent === true; // بدون skeletons (عند التحديث السريع)
  const useCache = opts.useCache !== false; // استخدم الكاش افتراضياً

  // ─── 1) عرض البيانات من الكاش فوراً (إن وُجد) ───
  if (useCache) {
    const cache = await loadCache();
    if (cache) {
      applyCacheToDB(cache.data);
      // عرض فوري بدون انتظار الشبكة
      try {
        renderPage();
        updateNotificationBell();
        const t = calcTotals();
        const sidebarTotal = document.getElementById('sidebar-total');
        if (sidebarTotal) sidebarTotal.textContent = fmt(t.grand);
        const syncEl = document.getElementById('sidebar-sync');
        if (syncEl) syncEl.innerHTML = '<span class="sync-dot"></span> تحديث...';
      } catch (e) {
        console.warn('[loadAll] cache render failed:', e.message);
      }
    } else if (!silent) {
      showAllSkeletons();
    }
  } else if (!silent) {
    showAllSkeletons();
  }

  // ─── 2) تحميل من الشبكة (في الخلفية أو للأمام) ───
  try {
    const syncEl = document.getElementById('sidebar-sync');
    if (syncEl && !useCache) syncEl.innerHTML = '<span class="sync-dot"></span> جاري التحميل...';

    const [banks, bankTxns, stockTxns, stockPrices, metalTxns, metalPrices,
       certs, dividends, recurring, goals, exRates, snapshots, debts, debtPayments,
       installments, installmentPayments] =
  await Promise.all([
    sbGet('banks', '?order=id&deleted_at=is.null'),
    sbGet('bank_transactions', '?order=date.desc,id.desc&deleted_at=is.null'),
    sbGet('stock_transactions', '?order=date.asc,id.asc&deleted_at=is.null'),
    sbGet('stock_prices', '?order=symbol'),
    sbGet('metal_transactions', '?order=date.asc,id.asc&deleted_at=is.null'),
    sbGet('metal_prices', '?order=metal_type'),
    sbGet('certificates', '?order=issued_date.asc&deleted_at=is.null'),
    sbGet('dividends', '?order=date.desc&deleted_at=is.null'),
    sbGet('recurring_transactions', '?order=id&deleted_at=is.null'),
    sbGet('financial_goals', '?order=id&deleted_at=is.null'),
    sbGet('exchange_rates', '?order=currency'),
    sbGet('portfolio_snapshots', '?order=snapshot_date.asc&limit=500'),
    sbGet('debts', '?order=id&deleted_at=is.null'),
    sbGet('debt_payments', '?order=date.desc&deleted_at=is.null'),
    sbGet('installments', '?order=id&deleted_at=is.null'),
    sbGet('installment_payments', '?order=date.desc&deleted_at=is.null'),
    sbGet('attachments', '?order=created_at.desc&deleted_at=is.null'),
  ]);

    DB.banks = banks;
    DB.bankTxns = bankTxns;
    DB.stockTxns = stockTxns;
    DB.stockPrices = stockPrices;
    DB.metalTxns = metalTxns;
    DB.metalPrices = metalPrices;
    DB.certs = certs;
    DB.dividends = dividends;
    DB.recurring = recurring;
    DB.goals = goals;
    DB.exchangeRates = exRates;
    DB.snapshots = snapshots;
    DB.debts = debts;
    DB.debtPayments = debtPayments;
    DB.installments = installments;
    DB.installmentPayments = installmentPayments;
    DB.attachments = attachments;
    // استبعد الحركات المرتبطة ببنوك محذوفة
    const validBankIds = new Set(banks.map(b => b.id));
    DB.bankTxns = DB.bankTxns.filter(t => validBankIds.has(t.bank_id));

    if (!UI.activeBankId && banks.length) UI.activeBankId = banks[0].id;
    else if (UI.activeBankId && UI.activeBankId !== 'ALL' && !validBankIds.has(+UI.activeBankId) && banks.length)
      UI.activeBankId = banks[0].id;

    // ─── 3) حفظ في الكاش ───
    saveCache(); // بدون await (لا نبطئ الواجهة)

    await saveSnapshot();
    updateBadges();
    renderPage();
    updateNotificationBell();
    hideAllSkeletons();

    const t = calcTotals();
    const sidebarTotal = document.getElementById('sidebar-total');
    if (sidebarTotal) sidebarTotal.textContent = fmt(t.grand);

    setTimeout(runIntegrityCheck, 3000);

    const ps = document.getElementById('global-period-select');
    if (ps && UI.globalPeriod) ps.value = UI.globalPeriod;
    if (syncEl) syncEl.innerHTML = '<span class="sync-dot"></span> آخر تحديث: ' + new Date().toLocaleTimeString('ar-EG');

  } catch (e) {
    console.error('loadAll error:', e);
    hideAllSkeletons();
    const msg = e.message || 'خطأ غير معروف';
    if (!isOnline()) {
    toast('لا يوجد اتصال — التطبيق يعمل من الكاش', false);
    } else {
    toast('خطأ في الاتصال: ' + msg, false);
    }

    const syncEl = document.getElementById('sidebar-sync');
    if (syncEl) syncEl.innerHTML = '<span class="sync-dot err"></span> ' + msg.slice(0, 40);

    const content = document.getElementById('main-content');
    if (content && !document.getElementById('global-error-banner')) {
      const errDiv = document.createElement('div');
      errDiv.id = 'global-error-banner';
      errDiv.style = 'background:var(--red-l);border:.5px solid var(--red);border-radius:var(--radius);padding:14px 18px;margin-bottom:16px;color:var(--red-d);font-size:13px;font-weight:700;display:flex;justify-content:space-between;align-items:center';
      errDiv.innerHTML = `<span>فشل الاتصال بقاعدة البيانات: ${escapeHtml(msg)}</span>
        <button onclick="window.loadAll({useCache:false})" style="background:var(--red);color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit;font-weight:700">إعادة المحاولة</button>`;
      content.insertBefore(errDiv, content.firstChild);
    }
  }
}

// ══════════════════════════════════════════════════════════════════
//  Backup
// ══════════════════════════════════════════════════════════════════
async function exportBackup() {
  try {
    const tables = ['banks','bank_transactions','stock_transactions','stock_prices','metal_transactions','metal_prices','certificates','dividends','recurring_transactions','financial_goals','exchange_rates','portfolio_snapshots','debts','debt_payments'];
    const data = {};
    for (const t of tables) data[t] = await sbGet(t, '?order=id');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'portfolio_backup_' + today() + '.json';
    a.click();
    toast('تم تصدير النسخة الاحتياطية');
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

async function importBackup(input) {
  const file = input.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!confirm('سيتم مسح البيانات الحالية. متابعة؟')) return;
    const order = ['financial_goals','recurring_transactions','dividends','debt_payments','debts','certificates','metal_transactions','stock_transactions','bank_transactions','exchange_rates','stock_prices','metal_prices','portfolio_snapshots','banks'];
    for (const table of order) {
      if (!data[table]) continue;
      const ex = await sbGet(table, '?select=id');
      for (const row of ex) { try { await sbDel(table, row.id); } catch (e) {} }
      if (data[table].length) await sbPost(table, data[table]);
    }
    toast('تم الاستيراد بنجاح');
    await loadAll();
  } catch (e) { toast('خطأ في الاستيراد: ' + e.message, false); }
  input.value = '';
}

// ══════════════════════════════════════════════════════════════════
//  Auth success handler — يُستدعى بعد نجاح الدخول
// ══════════════════════════════════════════════════════════════════
async function onAuthSuccess() {
  await loadAppSettings();
  populateAllCurrencySelects();
  updateCurrencyLabels();
  await loadAll();
  
  // تحميل Chart.js بعد فتح التطبيق (في الخلفية)
  ensureChartLoaded();
  
  pricesPage.autoFetchExchangeRates(false);
  pricesPage.autoFetchMetalPrices(false);
}

// ══════════════════════════════════════════════════════════════════
//  تعريض كل الدوال على window (لتعمل مع onclick في HTML)
// ══════════════════════════════════════════════════════════════════
function exposeGlobals() {
  // Core
  Object.assign(window, {
    loadAll, renderPage, nav, toggleSidebar, toast,
    toggleDark, setPeriodFromSelect, applyGlobalCustomRange,
    toggleNotifications, openModal, closeModal,
    initAuthGate, connectSupabase, disconnectSupabase,
    doLogin, doSignup, doLogout, setAuthTab
  });

  // Banks
  Object.assign(window, {
    saveBank: banksPage.saveBank,
    editBank: banksPage.editBank,
    toggleBankStatus: banksPage.toggleBankStatus,
    deleteBank: banksPage.deleteBank,
    doDeposit: banksPage.doDeposit,
    doWithdraw: banksPage.doWithdraw,
    doTransfer: banksPage.doTransfer,
    deleteBankTxn: banksPage.deleteBankTxn,
    editBankTxn: banksPage.editBankTxn,
    setBankSort, setBankTxnFilter, switchBankTab
  });

  // Modals: previews + quick actions
  Object.assign(window, {
    updateDepPreview, updateWitPreview, updateTransferPreview,
    updateBuyPreview, updateSellPreview,
    updateMetalBuyPreview, updateMetalSellPreview,
    updateCertPreview, updateCertBreakPreview,
    setCertPayoutMode, setBulkCertMode, setDividendMode,
    onMetalTypeChange
  });

  Object.assign(window, {
  saveRebalanceTargets: rebalancingPage.saveRebalanceTargets,
  updateRebalanceSum: rebalancingPage.updateRebalanceSum,
  renderRebalanceCalculator: rebalancingPage.renderRebalanceCalculator
});
  // Stocks
  Object.assign(window, {
    doBuy: stocksPage.doBuy,
    doSell: stocksPage.doSell,
    autoFillStock: stocksPage.autoFillStock,
    editStockTxn: stocksPage.editStockTxn,
    deleteStockTxn: stocksPage.deleteStockTxn,
    addMoreStock: stocksPage.addMoreStock,
    saveDividend: stocksPage.saveDividend,
    editDividend: stocksPage.editDividend,
    deleteDividend: stocksPage.deleteDividend,
    setStockMarket,
    renderStockHeatmap: heatmapPage.renderStockHeatmap
  });

  // Metals
  Object.assign(window, {
    doMetalBuy: metalsPage.doMetalBuy,
    doMetalSell: metalsPage.doMetalSell,
    deleteMetalTxn: metalsPage.deleteMetalTxn,
    editMetalTxn: metalsPage.editMetalTxn,
    addMoreMetal: metalsPage.addMoreMetal
  });

  // Certs
  Object.assign(window, {
    saveCert: certsPage.saveCert,
    editCert: certsPage.editCert,
    deleteCert: certsPage.deleteCert,
    doCertBreak: certsPage.doCertBreak,
    doCertPayout: certsPage.doCertPayout,
    doBulkCertPayout: certsPage.doBulkCertPayout,
    openCertPayout: (id) => import('./ui/modals.js').then(m => m.openCertPayout(id)),
    openBulkCertPayout: () => import('./ui/modals.js').then(m => m.openBulkCertPayout())
  });

  // Debts
  Object.assign(window, {
    saveDebt: debtsPage.saveDebt,
    editDebt: debtsPage.editDebt,
    deleteDebt: debtsPage.deleteDebt,
    saveDebtPayment: debtsPage.saveDebtPayment,
    deleteDebtPayment: debtsPage.deleteDebtPayment,
    openDebtPay: debtsPage.openDebtPay
  });

  // Recurring
  Object.assign(window, {
    saveRecurring: recurringPage.saveRecurring,
    editRecurring: recurringPage.editRecurring,
    deleteRecurring: recurringPage.deleteRecurring,
    applyRecurring: recurringPage.applyRecurring,
    applyAllRecurring: recurringPage.applyAllRecurring,
    setRecurringFilter: recurringPage.setRecurringFilter
  });

  // Goals
  Object.assign(window, {
    saveGoal: goalsPage.saveGoal,
    editGoal: goalsPage.editGoal,
    deleteGoal: goalsPage.deleteGoal
  });

  // Prices
  Object.assign(window, {
    saveStockPrices: pricesPage.saveStockPrices,
    saveMetalPrices: pricesPage.saveMetalPrices,
    saveExchangeRate: pricesPage.saveExchangeRate,
    autoFetchExchangeRates: pricesPage.autoFetchExchangeRates,
    autoFetchMetalPrices: pricesPage.autoFetchMetalPrices,
    removeOrphanStock: pricesPage.removeOrphanStock,
    saveGoldApiKey
  });

  // Reports
  Object.assign(window, {
    exportPDF: reportsPage.exportPDF,
    updateReportCurrencyCard: reportsPage.updateReportCurrencyCard,
    renderRecent: dashboardPage.renderRecent
  });

  // Zakat
  Object.assign(window, {
    openZakatPay: zakatPage.openZakatPay,
    doZakatPay: zakatPage.doZakatPay,
    previewZakatHijri: zakatPage.previewZakatHijri,
    saveZakatSettings: zakatPage.saveZakatSettings,
    autofillZakatPrices: zakatPage.autofillZakatPrices,
    toggleZakatInclude: zakatPage.toggleZakatInclude,
    deleteZakatRecord: zakatPage.deleteZakatRecord
  });

  // Settings page
  Object.assign(window, {
    saveGeneralSettings,
    addSettingsCurrency,
    renderSettings,
    exportBackup,
    importBackup,
    saveEdit
  });

  Object.assign(window, {
  clearCache,
  cacheInfo,
  saveCache
  });


  // Installments
Object.assign(window, {
  saveInstallment: installmentsPage.saveInstallment,
  editInstallment: installmentsPage.editInstallment,
  deleteInstallment: installmentsPage.deleteInstallment,
  openInstallmentPay: installmentsPage.openInstallmentPay,
  saveInstallmentPayment: installmentsPage.saveInstallmentPayment,
  deleteInstallmentPayment: installmentsPage.deleteInstallmentPayment,
  autoCalcInstallmentAmount: installmentsPage.autoCalcInstallmentAmount
});
  // Settings helpers (تُستدعى من innerHTML بـ window.__)
  window.__DB__ = DB;   // لفتح المرفقات
  saveForecastSettings: forecastPage.saveForecastSettings,
  window.__renameSettingsCurrency = renameSettingsCurrency;
  window.__removeSettingsCurrency = removeSettingsCurrency;
  window.__populateMetalTypeSelect = populateMetalTypeSelect;
  window.openGlobalSearch = openGlobalSearch;
  window.closeGlobalSearch = closeGlobalSearch;
  
}

// ══════════════════════════════════════════════════════════════════
//  Boot
// ══════════════════════════════════════════════════════════════════
installToastGlobal();
initDarkMode();
exposeGlobals();
setAuthSuccessHandler(onAuthSuccess);
initAuthGate();

// تسجيل Service Worker (احتياط لو ما اتسجلش من HTML)
if ('serviceWorker' in navigator && !navigator.serviceWorker.controller) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
  });
}
installNetworkIndicator();
setupNetworkToasts();
installAttachmentHandlers();

console.log('[main] Portfolio Pro bootstrapped');
