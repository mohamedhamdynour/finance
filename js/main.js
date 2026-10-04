// ══════════════════════════════════════════════════════════════════
//  main.js — نقطة الدخول والمنسّق العام
// ══════════════════════════════════════════════════════════════════

// ─── 1) Core ────────────────────────────────────────────────────
import { DB, UI, APP_SETTINGS, CHARTS, conn, editCtx, marketCtx } from './state.js';
import { N2, fmt, fmtN, fmtK, pct, today, baseCur, escapeHtml, toEGP, fromEGP, toEGPRaw, getRate, periodStart, getBankColor } from './core/utils.js';
import { sbGet, sbPost, sbPatch, sbDel, sbUpsert, sbRpc, sbPatchBy } from './core/supabase.js';
import {
  initAuthGate, connectSupabase, disconnectSupabase, doLogin, doSignup, doLogout,
  setAuthTab, setAuthSuccessHandler, isAuthenticated, getCurrentUser
} from './core/auth.js';
import {
  loadAppSettings, persistAppSettings, populateAllCurrencySelects,
  updateCurrencyLabels, renderSettings, renderSchemaAlert,
  addSettingsCurrency, renameSettingsCurrency, removeSettingsCurrency,
  saveGeneralSettings, saveGoldApiKey, populateMetalTypeSelect, onMetalTypeChange
} from './core/settings.js';
import { saveCache, loadCache, applyCacheToDB, clearCache, cacheInfo } from './core/cache.js';
import { isOnline, onNetworkChange } from './core/network.js';
import { trySendDailySummary, sendUrgentAlerts } from './domain/telegram.js';
import { installTelegramHandlers } from './ui/telegram-setup.js';

// ─── 2) UI Shared ──────────────────────────────────────────────
import { toast, installToastGlobal } from './ui/toast.js';
import { destroyChart, ensureChartLoaded } from './ui/charts.js';
import {
  kpi, svgIcon, typeTag, populateSelect, previewBox,
  getCertAlerts, updateBadges,
  setBankSort, setBankTxnFilter, switchBankTab, setStockMarket,
  setPeriodFromSelect, applyGlobalCustomRange, getReportPeriodBounds
} from './ui/shared.js';
import {
  openModal, closeModal,
  updateDepPreview, updateWitPreview, updateTransferPreview,
  updateBuyPreview, updateSellPreview,
  updateMetalBuyPreview, updateMetalSellPreview,
  updateCertPreview, updateCertBreakPreview,
  setCertPayoutMode, setBulkCertMode, setDividendMode
} from './ui/modals.js';
import { updateNotificationBell, toggleNotifications } from './ui/notifications.js';
import { saveEdit } from './ui/save-edit.js';
import { showAllSkeletons, hideAllSkeletons } from './ui/skeleton.js';
import { installShortcuts } from './ui/shortcuts.js';
import { openGlobalSearch, closeGlobalSearch } from './ui/search.js';
import { installNetworkIndicator, setupNetworkToasts } from './ui/network-indicator.js';
import { installAttachmentHandlers } from './ui/attachments.js';
import { installDetectorHandlers } from './ui/recurring-detector.js';
import { installLoanCalcHandlers } from './ui/loan-calc.js';
import { openCSVImport, installCSVHandlers } from './ui/csv-import.js';

// ─── 3) Domain ──────────────────────────────────────────────────
import { calcTotals, nextRecDate, getHoldings, getMetalHoldings, getStockPrice, getMetalPrice } from './domain/calc.js';
import { autoApplyRecurring, notifyAutoRecurringResult } from './domain/auto-recurring.js';
import { processMaturedCerts, detectMaturedCerts } from './domain/cert-maturation.js';
import { extractText, parseReceipt } from './domain/ocr.js';

// ─── 4) Pages ───────────────────────────────────────────────────
import * as banksPage from './ui/pages/banks.js';
import * as stocksPage from './ui/pages/stocks.js';
import * as metalsPage from './ui/pages/metals.js';
import * as certsPage from './ui/pages/certs.js';
import * as debtsPage from './ui/pages/debts.js';
import * as installmentsPage from './ui/pages/installments.js';
import * as recurringPage from './ui/pages/recurring.js';
import * as goalsPage from './ui/pages/goals.js';
import * as pricesPage from './ui/pages/prices.js';
import * as dashboardPage from './ui/pages/dashboard.js';
import * as heatmapPage from './ui/pages/heatmap.js';
import * as reportsPage from './ui/pages/reports.js';
import * as zakatPage from './ui/pages/zakat.js';
import * as riskPage from './ui/pages/risk.js';
import * as rebalancingPage from './ui/pages/rebalancing.js';
import * as forecastPage from './ui/pages/forecast.js';
import * as comparisonsPage from './ui/pages/comparisons.js';
import * as taxPage from './ui/pages/tax.js';
import * as auditPage from './ui/pages/audit.js';

// ══════════════════════════════════════════════════════════════════
//  Icon helpers
// ══════════════════════════════════════════════════════════════════
const ICON = {
  sun:    '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  moon:   '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>',
  help:   '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  code:   '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  copy:   '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
  bell:   '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  speaker:'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/>',
  check:  '<polyline points="20 6 9 17 4 12"/>',
  x:      '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
};

const svg = (path, size = 16, extra = '') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${path}</svg>`;

// ══════════════════════════════════════════════════════════════════
//  Theme
// ══════════════════════════════════════════════════════════════════
function toggleDark() {
  document.body.classList.toggle('dark');
  const dk = document.body.classList.contains('dark');
  document.querySelectorAll('select,input').forEach(s => s.style.colorScheme = dk ? 'dark' : 'light');
  localStorage.setItem('darkMode', dk ? '1' : '0');
  const iconPath = dk ? ICON.sun : ICON.moon;
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
      if (el) el.innerHTML = ICON.sun;
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
  dashboard:     ['لوحة التحكم',        'نظرة شاملة على محفظتك'],
  banks:         ['الحسابات البنكية',   'إدارة أرصدتك وحركاتك'],
  stocks:        ['الأسهم والصناديق',   'تتبع حيازاتك وأرباحك'],
  metals:        ['المعادن الثمينة',    'الذهب والفضة والبلاتين'],
  certs:         ['الشهادات الادخارية', 'عوائدك الثابتة'],
  debts:         ['الديون والالتزامات', 'ما عليك وما لك'],
  installments:  ['الأقساط',            'الالتزامات المقسَّطة'],
  recurring:     ['العمليات المتكررة',  'أتمتة معاملاتك'],
  goals:         ['الأهداف المالية',    'خططك المستقبلية'],
  forecast:      ['التوقعات',           'تنبؤ بمستقبل محفظتك'],
  risk:          ['تحليل المخاطر',      'قياس كمي للمخاطر'],
  rebalancing:   ['إعادة التوازن',      'طابق توزيعك مع المستهدف'],
  comparisons:   ['المقارنات الزمنية',  'تحليل الأداء بمرور الوقت'],
  prices:        ['تحديث الأسعار',      'أسعار السوق الحالية'],
  reports:       ['التقارير والتحليل',  'تحليل شامل لمحفظتك'],
  zakat:         ['الزكاة',             'حساب الزكاة الشرعية'],
  tax:           ['الضرائب',            'ضريبة الأرباح والتوزيعات'],
  audit:         ['سجل التغييرات',      'كل التعديلات على البيانات'],
  settings:      ['الإعدادات',          'ضبط متغيرات المحفظة']
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
    else if (p === 'recurring') recurringPage.renderRecurring();
    else if (p === 'goals') goalsPage.renderGoals();
    else if (p === 'forecast') forecastPage.renderForecast();
    else if (p === 'risk') riskPage.renderRisk();
    else if (p === 'rebalancing') rebalancingPage.renderRebalancing();
    else if (p === 'comparisons') comparisonsPage.renderComparisons();
    else if (p === 'prices') pricesPage.renderPrices();
    else if (p === 'reports') reportsPage.renderReports();
    else if (p === 'zakat') zakatPage.renderZakat();
    else if (p === 'tax') taxPage.renderTax();
    else if (p === 'audit') auditPage.renderAudit();
    else if (p === 'settings') {
  renderSettings();
  // عرض اسم المستخدم الحالي
  const uEl = document.getElementById('st-current-user');
  if (uEl) {
    uEl.textContent = conn.authSession?.user?.user_metadata?.username
      || conn.authSession?.user?.email
      || 'غير معروف';
  }
  setTimeout(renderPushStatus, 100);
}
  } catch (e) {
    console.error('renderPage error on page [' + p + ']:', e);
    toast('خطأ في عرض الصفحة: ' + e.message, false);
  }
}

// ══════════════════════════════════════════════════════════════════
//  Help & SQL Modals
// ══════════════════════════════════════════════════════════════════
function openHelpModal() {
  const titleEl = document.getElementById('edit-modal-title');
  const bodyEl = document.getElementById('edit-modal-body');
  const saveBtn = document.getElementById('edit-modal-save-btn');
  if (!titleEl || !bodyEl) return;

  titleEl.innerHTML = svg(ICON.help, 18) + ' دليل الاستخدام';
  saveBtn.style.display = 'none';

  bodyEl.innerHTML = `
    <div style="line-height:1.9;font-size:13px;color:var(--text)">
      <section style="margin-bottom:18px">
        <h3 style="font-size:14px;font-weight:900;margin-bottom:8px;color:var(--blue);display:flex;align-items:center;gap:6px">
          ${svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>', 16)}
          ما هو هذا التطبيق؟
        </h3>
        <p style="color:var(--muted)">نظام شخصي لإدارة محفظتك المالية بالكامل من المتصفح. يعمل مباشرة مع قاعدة بياناتك على Supabase بدون أي خادم وسيط.</p>
      </section>

      <section style="margin-bottom:18px">
        <h3 style="font-size:14px;font-weight:900;margin-bottom:8px;color:var(--green);display:flex;align-items:center;gap:6px">
          ${svg('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>', 16)}
          الميزات الرئيسية
        </h3>
        <ul style="color:var(--muted);padding-right:20px;margin:0">
          <li>تتبع الحسابات البنكية والحركات بالتفصيل</li>
          <li>إدارة حيازات الأسهم والصناديق مع حساب الأرباح والخسائر</li>
          <li>تتبع المعادن الثمينة (ذهب، فضة، ...) بالوزن والسعر</li>
          <li>الشهادات الادخارية مع استرداد تلقائي عند الاستحقاق</li>
          <li>الديون والأقساط مع التنبيهات التلقائية</li>
          <li>التحليل: المخاطر، التوقعات، المقارنات الزمنية</li>
          <li>حساب الزكاة الشرعية والضرائب</li>
          <li>تصدير Excel و PDF للتقارير</li>
          <li>عمل بدون إنترنت (PWA) مع مزامنة تلقائية</li>
          <li>متعدد العملات مع تحويل تلقائي</li>
        </ul>
      </section>

      <section style="margin-bottom:18px">
        <h3 style="font-size:14px;font-weight:900;margin-bottom:8px;color:var(--gold);display:flex;align-items:center;gap:6px">
          ${svg(ICON.check, 16)}
          كيف تبدأ؟
        </h3>
        <ol style="color:var(--muted);padding-right:20px;margin:0">
          <li>سجّل حسابك ثم سجّل دخولك</li>
          <li>افتح صفحة "الحسابات البنكية" وأضف أول حساب</li>
          <li>أضف الحركات أو استوردها من كشف CSV</li>
          <li>أضف أسهمك، معادنك، شهاداتك تدريجياً</li>
          <li>حدّث الأسعار دورياً من صفحة "تحديث الأسعار"</li>
        </ol>
      </section>

      <section style="margin-bottom:18px">
        <h3 style="font-size:14px;font-weight:900;margin-bottom:8px;color:var(--purple);display:flex;align-items:center;gap:6px">
          ${svg('<rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6" y2="8"/>', 16)}
          اختصارات لوحة المفاتيح
        </h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px">
          ${[
            ['Ctrl + K', 'البحث الشامل'],
            ['Ctrl + N', 'إيداع سريع'],
            ['Ctrl + D', 'لوحة التحكم'],
            ['Ctrl + B', 'الحسابات البنكية'],
            ['Ctrl + /', 'الوضع الليلي'],
            ['?', 'هذه القائمة']
          ].map(([k, v]) => `
            <div style="display:flex;justify-content:space-between;padding:5px 10px;background:var(--surface2);border-radius:6px;color:var(--muted)">
              <span>${v}</span>
              <kbd style="font-family:monospace;direction:ltr;color:var(--text);font-weight:700">${k}</kbd>
            </div>
          `).join('')}
        </div>
      </section>

      <section>
        <h3 style="font-size:14px;font-weight:900;margin-bottom:8px;color:var(--teal);display:flex;align-items:center;gap:6px">
          ${svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', 16)}
          الخصوصية والأمان
        </h3>
        <ul style="color:var(--muted);padding-right:20px;margin:0">
          <li>بياناتك محفوظة على مشروع Supabase الخاص بك</li>
          <li>كل مستخدم يرى بياناته فقط (RLS مُفعَّلة)</li>
          <li>لا يتم إرسال أي بيانات لأي جهة خارجية</li>
          <li>يمكنك تصدير نسخة احتياطية في أي وقت</li>
        </ul>
      </section>
    </div>
  `;

  openModal('modal-edit');
}

async function openSqlModal() {
  const titleEl = document.getElementById('edit-modal-title');
  const bodyEl = document.getElementById('edit-modal-body');
  const saveBtn = document.getElementById('edit-modal-save-btn');
  if (!titleEl || !bodyEl) return;

  titleEl.innerHTML = svg(ICON.code, 18) + ' كود قاعدة البيانات الكامل';
  saveBtn.style.display = 'none';
  bodyEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--muted)">
    <div>جاري تحميل الكود...</div>
  </div>`;

  openModal('modal-edit');

  try {
    const res = await fetch('schema.sql?v=' + Date.now());
    if (!res.ok) throw new Error('تعذّر تحميل ملف schema.sql');
    const sql = await res.text();

    bodyEl.innerHTML = `
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:12px;line-height:1.7;padding:12px;background:var(--blue-l);border-radius:8px;border-right:3px solid var(--blue)">
        <strong style="color:var(--blue)">الخطوات:</strong>
        <ol style="margin:6px 18px 0;padding:0">
          <li>افتح مشروعك في supabase.com</li>
          <li>اذهب إلى SQL Editor ← New query</li>
          <li>الصق الكود التالي وشغّله (Run)</li>
        </ol>
      </div>
      <div style="position:relative;margin-bottom:12px">
        <button class="btn btn-primary btn-sm" onclick="window.__copySqlContent()" style="position:absolute;top:10px;left:10px;z-index:2">
          ${svg(ICON.copy, 13)}
          نسخ الكود
        </button>
      </div>
      <pre id="sql-content" class="sql-preview">${escapeHtml(sql)}</pre>
      <div class="form-hint" style="margin-top:10px;text-align:center">
        ملاحظة: تشغيل الكود يحذف الجداول القديمة ويعيد إنشاءها. خذ نسخة احتياطية أولاً.
      </div>
    `;
  } catch (e) {
    bodyEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--red)">
      <div style="font-weight:700">فشل التحميل: ${escapeHtml(e.message)}</div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:8px">تأكد من وجود ملف <code>schema.sql</code> في جذر المشروع</div>
    </div>`;
  }
}

function installHelpAndSqlHandlers() {
  window.openHelpModal = openHelpModal;
  window.openSqlModal = openSqlModal;
  window.__copySqlContent = () => {
    const el = document.getElementById('sql-content');
    if (!el) return;
    const text = el.textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('تم نسخ كود SQL ✓'))
        .catch(() => fallbackCopy(text));
    } else fallbackCopy(text);
  };
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('تم نسخ كود SQL ✓'); }
    catch (e) { toast('فشل النسخ', false); }
    ta.remove();
  }
}

// ══════════════════════════════════════════════════════════════════
//  Push Notifications
// ══════════════════════════════════════════════════════════════════
async function renderPushStatus() {
  const el = document.getElementById('push-status');
  if (!el) return;

  try {
    const push = await import('./core/push.js');
    const { isPushSupported, isPushConfigured, getPermissionState, getCurrentSubscription } = push;

    if (!isPushSupported()) {
      el.innerHTML = `<div style="padding:10px;background:var(--red-l);color:var(--red-d);border-radius:8px;font-size:12px">الإشعارات غير مدعومة في هذا المتصفح</div>`;
      return;
    }
    if (!isPushConfigured()) {
      el.innerHTML = `<div style="padding:12px;background:var(--gold-l);color:var(--gold-d);border-radius:8px;font-size:12px;line-height:1.7">
        <strong>يحتاج الإعداد:</strong>
        <div style="margin-top:4px">أضف VAPID Public Key في <code>js/core/push.js</code> لتفعيل الإشعارات</div>
      </div>`;
      return;
    }

    const perm = getPermissionState();
    const sub = await getCurrentSubscription();

    if (perm === 'denied') {
      el.innerHTML = `<div style="padding:10px;background:var(--red-l);color:var(--red-d);border-radius:8px;font-size:12px">تم رفض الإذن — أعد التفعيل من إعدادات المتصفح</div>`;
    } else if (sub) {
      el.innerHTML = `<div style="padding:10px 14px;background:var(--green-l);color:var(--green-d);border-radius:8px;font-size:12px;display:flex;align-items:center;gap:8px">
        ${svg(ICON.check, 14)} <span>الإشعارات مفعّلة على هذا الجهاز</span>
      </div>`;
    } else {
      el.innerHTML = `<div style="padding:10px;background:var(--surface2);color:var(--muted);border-radius:8px;font-size:12px">لم يتم التفعيل بعد</div>`;
    }
  } catch (e) {
    console.warn('[push-status]', e.message);
    el.innerHTML = '';
  }
}

function installPushHandlers() {
  window.__pushEnable = async () => {
    try {
      const { subscribeToPush } = await import('./core/push.js');
      await subscribeToPush();
      toast('تم تفعيل الإشعارات ✓');
      renderPushStatus();
    } catch (e) {
      toast('خطأ: ' + e.message, false);
      renderPushStatus();
    }
  };

  window.__pushDisable = async () => {
    try {
      const { unsubscribeFromPush } = await import('./core/push.js');
      await unsubscribeFromPush();
      toast('تم تعطيل الإشعارات');
      renderPushStatus();
    } catch (e) { toast('خطأ: ' + e.message, false); }
  };

  window.__pushTest = async () => {
    try {
      const { sendTestNotification } = await import('./core/push.js');
      await sendTestNotification();
      toast('تم الإرسال — تحقق من شريط الإشعارات');
    } catch (e) { toast('خطأ: ' + e.message, false); }
  };
}

// ══════════════════════════════════════════════════════════════════
//  Snapshots
// ══════════════════════════════════════════════════════════════════
async function saveSnapshot() {
  // ✅ نحفظ دائماً بـ EGP (نقطة الارتكاز الثابتة داخلية)
  const EGP = 'EGP';
  const rate = (cur) => cur === 'EGP' ? 1 : (DB.exchangeRates.find(x => x.currency === cur)?.rate || 1);

  const totalBanksEGP = DB.banks.reduce((a, b) => {
    return a + N2(b.balance) * rate(b.currency || 'EGP');
  }, 0);

  const h = getHoldings();
  const stocksValEGP = Object.entries(h).reduce((a, [s, v]) => {
    const cp = getStockPrice(s) || v.avgPrice;
    return a + v.qty * cp;
  }, 0);

  const mh = getMetalHoldings();
  const metalsValEGP = Object.entries(mh).reduce((a, [k, v]) => {
    const bt = (v.metal_type || k.split('|')[0]).trim();
    const cp = getMetalPrice(bt) || v.avgPrice;
    return a + v.weight * cp;
  }, 0);

  const activeCerts = DB.certs.filter(c => !c.matured_at && c.maturity_date > today());
  const certsTotalEGP = activeCerts.reduce((a, c) => a + N2(c.amount), 0);

  const snap = {
    snapshot_date: today(),
    total_banks: totalBanksEGP,
    total_stocks: stocksValEGP,
    total_metals: metalsValEGP,
    total_certs: certsTotalEGP,
    grand_total: totalBanksEGP + stocksValEGP + metalsValEGP + certsTotalEGP
  };
  try { await sbUpsert('portfolio_snapshots', snap); } catch (e) {}
}

// ══════════════════════════════════════════════════════════════════
//  Integrity Check
// ══════════════════════════════════════════════════════════════════
async function runIntegrityCheck() {
  let fixed = 0;
  const bankTxnIds = new Set(DB.bankTxns.map(t => t.id));
  const bankIds = new Set(DB.banks.map(b => b.id));

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
  for (const t of DB.bankTxns.filter(t => !bankIds.has(t.bank_id))) {
    try { await sbDel('bank_transactions', t.id); fixed++; } catch (e) {}
  }
  for (const t of DB.bankTxns) {
    if (t.linked_transfer_id && !bankTxnIds.has(t.linked_transfer_id)) {
      try { await sbPatch('bank_transactions', t.id, { linked_transfer_id: null }); fixed++; } catch (e) {}
    }
  }

  if (fixed > 0) { console.log('[Integrity] fixed', fixed); await loadAll(); }
  else console.log('[Integrity] all checks passed');
}

// ══════════════════════════════════════════════════════════════════
//  loadAll
// ══════════════════════════════════════════════════════════════════
async function loadAll(opts = {}) {
  const silent = opts.silent === true;
  const useCache = opts.useCache !== false;

  if (useCache) {
    const cache = await loadCache();
    if (cache) {
      applyCacheToDB(cache.data);
      try {
        renderPage();
        updateNotificationBell();
        const t = calcTotals();
        const st = document.getElementById('sidebar-total');
        if (st) st.textContent = fmt(t.grand);
        const se = document.getElementById('sidebar-sync');
        if (se) se.innerHTML = '<span class="sync-dot"></span> تحديث...';
      } catch (e) { console.warn('[loadAll] cache render failed:', e.message); }
    } else if (!silent) {
      showAllSkeletons();
    }
  } else if (!silent) {
    showAllSkeletons();
  }

  try {
    const syncEl = document.getElementById('sidebar-sync');
    if (syncEl && !useCache) syncEl.innerHTML = '<span class="sync-dot"></span> جاري التحميل...';

    const [
      banks, bankTxns, stockTxns, stockPrices, metalTxns, metalPrices,
      certs, dividends, recurring, goals, exRates, snapshots, debts, debtPayments,
      installments, installmentPayments, attachments
    ] = await Promise.all([
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
      sbGet('attachments', '?order=created_at.desc&deleted_at=is.null').catch(() => [])
    ]);

    Object.assign(DB, {
      banks, bankTxns, stockTxns, stockPrices, metalTxns, metalPrices,
      certs, dividends, recurring, goals,
      exchangeRates: exRates, snapshots, debts, debtPayments,
      installments, installmentPayments, attachments
    });

    const validBankIds = new Set(banks.map(b => b.id));
    DB.bankTxns = DB.bankTxns.filter(t => validBankIds.has(t.bank_id));

    if (!UI.activeBankId && banks.length) UI.activeBankId = banks[0].id;
    else if (UI.activeBankId && UI.activeBankId !== 'ALL' && !validBankIds.has(+UI.activeBankId) && banks.length)
      UI.activeBankId = banks[0].id;

    saveCache();
    await saveSnapshot();
    updateBadges();
    renderPage();
    updateNotificationBell();
    hideAllSkeletons();

    const t = calcTotals();
    const st = document.getElementById('sidebar-total');
    if (st) st.textContent = fmt(t.grand);

    setTimeout(runIntegrityCheck, 3000);

    const ps = document.getElementById('global-period-select');
    if (ps && UI.globalPeriod) ps.value = UI.globalPeriod;
    if (syncEl) syncEl.innerHTML = '<span class="sync-dot"></span> آخر تحديث: ' + new Date().toLocaleTimeString('ar-EG');

  } catch (e) {
    console.error('loadAll error:', e);
    hideAllSkeletons();
    const msg = e.message || 'خطأ غير معروف';

    if (!isOnline()) toast('لا يوجد اتصال — التطبيق يعمل من الكاش', false);
    else toast('خطأ في الاتصال: ' + msg, false);

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
    const tables = ['banks','bank_transactions','stock_transactions','stock_prices','metal_transactions','metal_prices','certificates','dividends','recurring_transactions','financial_goals','exchange_rates','portfolio_snapshots','debts','debt_payments','installments','installment_payments'];
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
    if (!confirm('سيتم مسح البيانات الحالية واستبدالها. متابعة؟')) return;
    const order = ['financial_goals','recurring_transactions','dividends','debt_payments','debts','installment_payments','installments','certificates','metal_transactions','stock_transactions','bank_transactions','exchange_rates','stock_prices','metal_prices','portfolio_snapshots','banks'];
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
//  Auth success handler
// ══════════════════════════════════════════════════════════════════
async function onAuthSuccess() {
  await loadAppSettings();
  populateAllCurrencySelects();
  updateCurrencyLabels();
  await loadAll();

  // معالجة الشهادات المنتهية
  setTimeout(async () => {
    try {
      const result = await processMaturedCerts(false);
      if (result.processed > 0) {
        toast(`تم استرداد ${result.processed} شهادة منتهية ✓`, true);
        setTimeout(() => loadAll({ silent: true }), 500);
      }
    } catch (e) { console.warn('[cert-maturation]', e.message); }
  }, 2000);

  // تطبيق العمليات المتكررة
  setTimeout(async () => {
    try {
      const result = await autoApplyRecurring(false);
      notifyAutoRecurringResult(result);
    } catch (e) { console.warn('[auto-recurring]', e.message); }
  }, 3000);

  ensureChartLoaded();
  pricesPage.autoFetchExchangeRates(false);
  pricesPage.autoFetchMetalPrices(false);

    // Telegram — الملخص اليومي + التنبيهات الطارئة
  setTimeout(async () => {
    try {
      await trySendDailySummary();
      await sendUrgentAlerts();
    } catch (e) { console.warn('[telegram] auto-send failed:', e.message); }
  }, 5000);
}

// ══════════════════════════════════════════════════════════════════
//  OCR
// ══════════════════════════════════════════════════════════════════
function installOcrHandler() {
  window.__ocrScan = async (input, modalPrefix) => {
    const file = input.files?.[0];
    if (!file) return;

    const prefixMap = { wit: 'ew', dep: 'ed' };
    const realPrefix = prefixMap[modalPrefix] || modalPrefix;

    const progressEl = document.getElementById(`ocr-progress-${modalPrefix}`);
    if (progressEl) {
      progressEl.style.display = 'block';
      progressEl.textContent = 'جاري تحميل محرك الاستخراج...';
    }

    try {
      const text = await extractText(file, pct => {
        if (progressEl) progressEl.textContent = `جاري التحليل... ${pct.toFixed(0)}%`;
      });

      const parsed = parseReceipt(text);
      console.log('[OCR] Extracted:', parsed);

      const amountEl = document.getElementById(`${realPrefix}-amount`);
      const dateEl = document.getElementById(`${realPrefix}-date`);
      const notesEl = document.getElementById(`${realPrefix}-notes`);

      let filled = 0;
      if (parsed.amount && amountEl) { amountEl.value = parsed.amount.toFixed(2); filled++; }
      if (parsed.date && dateEl) { dateEl.value = parsed.date; filled++; }
      if (parsed.merchant && notesEl) { notesEl.value = parsed.merchant; filled++; }

      if (progressEl) {
        if (filled === 0) progressEl.innerHTML = `<span style="color:var(--gold)">لم يُتعرف على بيانات — املأ الحقول يدوياً</span>`;
        else progressEl.innerHTML = `<span style="color:var(--green)">تم استخراج ${filled} حقل</span>`;
        setTimeout(() => { progressEl.style.display = 'none'; }, 5000);
      }

      if (modalPrefix === 'wit' && typeof window.updateWitPreview === 'function') window.updateWitPreview();
      if (modalPrefix === 'dep' && typeof window.updateDepPreview === 'function') window.updateDepPreview();

    } catch (e) {
      console.error('[OCR] failed:', e);
      if (progressEl) progressEl.innerHTML = `<span style="color:var(--red)">خطأ: ${escapeHtml(e.message)}</span>`;
    } finally {
      input.value = '';
    }
  };
}

// ══════════════════════════════════════════════════════════════════
//  exposeGlobals — كل الدوال التي يُستدعى إليها من HTML أو من وحدات أخرى
// ══════════════════════════════════════════════════════════════════
function exposeGlobals() {
  // Core
  Object.assign(window, {
    loadAll, renderPage, nav, toggleSidebar, toast,
    toggleDark, setPeriodFromSelect, applyGlobalCustomRange,
    toggleNotifications, openModal, closeModal,
    initAuthGate, connectSupabase, disconnectSupabase,
    doLogin, doSignup, doLogout, setAuthTab,
    openGlobalSearch, closeGlobalSearch
  });

  // === Render functions (يحتاجها shared.js و shortcuts.js) ===
    // === Render functions (يحتاجها shared.js و shortcuts.js) ===
  Object.assign(window, {
    renderBanks: banksPage.renderBanks,
    renderBankTable: banksPage.renderBankTable,
    renderStocks: stocksPage.renderStocks,
    renderMetals: metalsPage.renderMetals,
    renderCerts: certsPage.renderCerts,
    renderDividends: stocksPage.renderDividends,
    renderRecurring: recurringPage.renderRecurring,
    renderGoals: goalsPage.renderGoals,
    renderPrices: pricesPage.renderPrices,
    renderReports: reportsPage.renderReports,
    renderDashboard: dashboardPage.renderDashboard,
    renderRecent: dashboardPage.renderRecent,
    renderStockHeatmap: heatmapPage.renderStockHeatmap,
    renderZakat: zakatPage.renderZakat,
    renderSettings,
    // ← 8 إضافات جديدة:
    renderDebts: debtsPage.renderDebts,
    renderInstallments: installmentsPage.renderInstallments,
    renderForecast: forecastPage.renderForecast,
    renderRisk: riskPage.renderRisk,
    renderRebalancing: rebalancingPage.renderRebalancing,
    renderComparisons: comparisonsPage.renderComparisons,
    renderTax: taxPage.renderTax,
    renderAudit: auditPage.renderAudit
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

  // Modal previews
  Object.assign(window, {
    updateDepPreview, updateWitPreview, updateTransferPreview,
    updateBuyPreview, updateSellPreview,
    updateMetalBuyPreview, updateMetalSellPreview,
    updateCertPreview, updateCertBreakPreview,
    setCertPayoutMode, setBulkCertMode, setDividendMode,
    onMetalTypeChange
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
    setStockMarket
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
    openCertAttachments: certsPage.openCertAttachments,
    openCertPayout: (id) => import('./ui/modals.js').then(m => m.openCertPayout(id)),
    openBulkCertPayout: () => import('./ui/modals.js').then(m => m.openBulkCertPayout()),
    processMaturedCertsNow: async () => {
      const r = await processMaturedCerts(true);
      if (r.processed > 0) {
        toast(`تم استرداد ${r.processed} شهادة ✓`);
        await loadAll({ silent: true });
      } else {
        toast('لا توجد شهادات منتهية بحاجة للاسترداد');
      }
      return r;
    }
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

  // Recurring
  Object.assign(window, {
    saveRecurring: recurringPage.saveRecurring,
    editRecurring: recurringPage.editRecurring,
    deleteRecurring: recurringPage.deleteRecurring,
    applyRecurring: recurringPage.applyRecurring,
    applyAllRecurring: recurringPage.applyAllRecurring,
    setRecurringFilter: recurringPage.setRecurringFilter,
    applyAllRecurringNow: async () => {
      const result = await autoApplyRecurring(true);
      notifyAutoRecurringResult(result);
      return result;
    }
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
    exportExcel: async () => {
      const { exportExcel: fn } = await import('./core/excel.js');
      return fn();
    },
    updateReportCurrencyCard: reportsPage.updateReportCurrencyCard
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

  // Rebalancing
  Object.assign(window, {
    saveRebalanceTargets: rebalancingPage.saveRebalanceTargets,
    updateRebalanceSum: rebalancingPage.updateRebalanceSum,
    renderRebalanceCalculator: rebalancingPage.renderRebalanceCalculator
  });

  // Forecast
  Object.assign(window, {
    saveForecastSettings: forecastPage.saveForecastSettings
  });

  // Comparisons
  Object.assign(window, {
    __setCmpTab: comparisonsPage.setCmpTab
  });

  // Settings
  Object.assign(window, {
    saveGeneralSettings,
    addSettingsCurrency,
    exportBackup,
    importBackup,
    saveEdit,
    clearCache,
    cacheInfo,
    saveCache,
    openCSVImport
  });

    // ✅ للتشخيص من Console
  window.__DEBUG__ = {
    DB,
    UI,
    APP_SETTINGS,
    conn,
    baseCur,
    fmt,
    fmtN,
    calcTotals: () => import('./domain/calc.js').then(m => m.calcTotals()),
    toEGP,
    fromEGP,
    getRate
  };
  // Settings helpers
  window.__renameSettingsCurrency = renameSettingsCurrency;
  window.__removeSettingsCurrency = removeSettingsCurrency;
  window.__populateMetalTypeSelect = populateMetalTypeSelect;
}

// ══════════════════════════════════════════════════════════════════
//  Boot
// ══════════════════════════════════════════════════════════════════
installToastGlobal();
initDarkMode();
installHelpAndSqlHandlers();
installPushHandlers();
installOcrHandler();
exposeGlobals();
installShortcuts();
installNetworkIndicator();
setupNetworkToasts();
installAttachmentHandlers();
installDetectorHandlers();
installLoanCalcHandlers();
installCSVHandlers();
installTelegramHandlers();
auditPage.installAuditHandlers();
taxPage.installTaxHandlers();

setAuthSuccessHandler(onAuthSuccess);
initAuthGate();

if ('serviceWorker' in navigator && !navigator.serviceWorker.controller) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
  });
}

console.log('[main] Portfolio Pro bootstrapped');
