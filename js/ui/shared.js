// ══════════════════════════════════════════════════════════════════
//  shared.js — دوال مساعدة للـ UI (KPIs، قوائم، تنسيقات جدول)
// ══════════════════════════════════════════════════════════════════
import { DB, UI, CHARTS, marketCtx } from '../state.js';
import { N2, fmt, fmtN, pct, periodStart, periodEnd, getBankColor, escapeHtml } from '../core/utils.js';

// ─── KPI Card ──────────────────────────────────────────────────
export function kpi(label, value, sub, color, icon, trend = null) {
  const trendHtml = trend !== null
    ? `<div class="kpi-trend ${trend >= 0 ? 'up' : 'down'}"><svg viewBox="0 0 24 24"><polyline points="${trend >= 0 ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}"/></svg>${Math.abs(trend).toFixed(1)}%</div>`
    : '';
  return `<div class="kpi" style="border-right:3px solid ${color}">
    <div class="kpi-accent" style="background:${color}"></div>
    <div class="kpi-header">
      <div class="kpi-icon" style="background:${color}18;color:${color}">${icon}</div>
      ${trendHtml}
    </div>
    <div class="kpi-label">${escapeHtml(label)}</div>
    <div class="kpi-value" style="color:${color}">${value}</div>
    ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
  </div>`;
}

// ─── SVG Icon shortcut ────────────────────────────────────────
export function svgIcon(paths, w = 17) {
  return `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

// ─── Type Tag (badge حسب نوع الحركة) ──────────────────────────
export function typeTag(type) {
  const m = {
    'إيداع': 'tag-dep', 'سحب': 'tag-wit',
    'تحويل وارد': 'tag-tr', 'تحويل صادر': 'tag-wit',
    'رصيد افتتاحي': 'tag-init',
    'شراء': 'tag-buy', 'بيع': 'tag-sell',
    'أرباح': 'tag-div', 'عائد شهادة': 'tag-div'
  };
  return `<span class="tag ${m[type] || 'tag-open'}">${escapeHtml(type)}</span>`;
}

// ─── Bank <option> HTML ───────────────────────────────────────
export function bankOptHtml(b) {
  if (b.is_active === false) return '';
  const cur = b.currency || 'EGP';
  const color = getBankColor(b.id);
  return `<option value="${b.id}" data-color="${color}">⬤ ${escapeHtml(b.name)}${b.bank_code ? ' (' + escapeHtml(b.bank_code) + ')' : ''} | ${fmtN(N2(b.balance), 2)} ${escapeHtml(cur)}</option>`;
}

export function bankOptHtmlAll(b) {
  const cur = b.currency || 'EGP';
  return `<option value="${b.id}">${b.is_active === false ? '[مؤرشف] ' : ''}${escapeHtml(b.name)}${b.bank_code ? ' (' + escapeHtml(b.bank_code) + ')' : ''} | ${fmtN(N2(b.balance), 2)} ${escapeHtml(cur)}</option>`;
}

// ─── Certificate <option> HTML ────────────────────────────────
export function certOptHtml(c) {
  return `<option value="${c.id}">${escapeHtml(c.name)} — ${escapeHtml(c.bank_name || '')} | ${fmt(c.amount)}</option>`;
}

// ─── Populate a <select> with banks ───────────────────────────
export function populateSelect(id, extra = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = (extra || '') + DB.banks.map(bankOptHtml).join('');
  const applyColor = () => {
    const c = getBankColor(+el.value);
    if (+el.value) {
      el.style.borderRightColor = c;
      el.style.borderRightWidth = '3px';
    } else {
      el.style.borderRightColor = '';
      el.style.borderRightWidth = '';
    }
  };
  el.removeEventListener('change', el._colorFn);
  el._colorFn = applyColor;
  el.addEventListener('change', applyColor);
  applyColor();
}

// ─── Preview Box (تستخدمه كل النماذج) ─────────────────────────
export function previewBox(rows, color = 'var(--green-l)', borderColor = 'var(--green)') {
  const visible = rows.filter(Boolean);
  return `<div class="preview-box" style="border-color:${borderColor};margin-top:10px">${
    visible.map((r, i) => `<div class="preview-row${i === visible.length - 1 ? ' total' : ''}"><span class="preview-label">${escapeHtml(r[0])}</span><span class="preview-val" style="${r[2] || ''}">${r[1]}</span></div>`).join('')
  }</div>`;
}

// ─── Cert Alerts (شهادات قريبة/منتهية) ────────────────────────
export function getCertAlerts() {
  const now = new Date(), soon = [], expired = [];
  DB.certs.forEach(c => {
    const mat = new Date(c.maturity_date);
    const days = Math.ceil((mat - now) / 86400000);
    if (days < 0) expired.push({ ...c, daysLeft: days });
    else if (days <= 30) soon.push({ ...c, daysLeft: days });
  });
  return { soon, expired };
}

// ─── Badge counts في القائمة الجانبية ─────────────────────────
export function updateBadges() {
  const { soon, expired } = getCertAlerts();
  const total = soon.length + expired.length;
  ['nb-cert', 'nb-dash'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (total > 0) {
      el.style.display = 'flex';
      el.textContent = total;
      el.className = 'nav-badge' + (expired.length ? ' ' : 'warn ');
    } else el.style.display = 'none';
  });
}

// ─── ترتيب البنوك ─────────────────────────────────────────────
export function setBankSort(dir) {
  UI.bankSort = dir;
  if (typeof window.renderBanks === 'function') window.renderBanks();
}

// ─── فلتر حركات البنك ─────────────────────────────────────────
export function setBankTxnFilter(v) {
  UI.bankTxnFilter = v;
  if (typeof window.renderBankTable === 'function') window.renderBankTable();
}

// ─── تبديل تبويب البنك ────────────────────────────────────────
export function switchBankTab(id) {
  UI.activeBankId = id;
  UI.bankTxnFilter = 'ALL';
  document.querySelectorAll('#bank-tabs .tab').forEach(t => {
    t.classList.toggle('active', t.dataset.bankTab === String(id));
  });
  if (typeof window.renderBankTable === 'function') window.renderBankTable();
}

// ─── تبديل سوق الأسهم ─────────────────────────────────────────
export function setStockMarket(market, el) {
  marketCtx.activeStockMarket = market;
  document.querySelectorAll('#page-stocks .tab[data-market]').forEach(t => {
    t.classList.toggle('active', t.dataset.market === market);
  });
  if (typeof window.renderStocks === 'function') window.renderStocks();
}

// ─── فترة التقارير ─────────────────────────────────────────────
export function getReportPeriodBounds() {
  const p = UI.globalPeriod || '1y';
  if (p === 'custom' && UI.customFrom && UI.customTo) return { pStart: UI.customFrom, pEnd: UI.customTo };
  return { pStart: periodStart(p), pEnd: periodEnd(p) };
}

// ─── اختيار الفترة العامة من الأعلى ───────────────────────────
export function setPeriodFromSelect(p) {
  UI.globalPeriod = p;
  localStorage.setItem('globalPeriod', p);
  const customEl = document.getElementById('global-custom-range');
  if (customEl) customEl.classList.toggle('hidden', p !== 'custom');
  if (p !== 'custom' && typeof window.renderPage === 'function') window.renderPage();
}

export function applyGlobalCustomRange() {
  const from = document.getElementById('global-date-from').value;
  const to = document.getElementById('global-date-to').value;
  if (!from || !to) return alert('اختر تاريخ البداية والنهاية');
  if (from > to) return alert('تاريخ البداية لازم يكون قبل تاريخ النهاية');
  UI.customFrom = from;
  UI.customTo = to;
  UI.globalPeriod = 'custom';
  if (typeof window.renderPage === 'function') window.renderPage();
}

// ─── تنسيق مبلغ بنكي (يستخدم عملة الحساب) ────────────────────
export function fmtBankAmt(amount, bankId) {
  const bank = DB.banks.find(b => b.id === bankId);
  const cur = bank?.currency || 'EGP';
  return `${new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(+amount || 0)} ${cur}`;
}

// ─── Insights Card (أفضل/أسوأ أداء) ───────────────────────────
export function renderInsightsCard(items, label, colorFn, valueFn, nameFn) {
  if (!items.length) return '';
  const sorted = [...items].sort((a, b) => valueFn(b) - valueFn(a));
  const best = sorted[0], worst = sorted[sorted.length - 1];
  return `<div class="card" style="margin-bottom:16px">
    <div class="card-header"><div class="card-title">تحليل الأداء — ${escapeHtml(label)}</div></div>
    <div class="card-body" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
      <div style="padding:12px;background:var(--green-l);border-radius:10px;border:.5px solid rgba(13,148,136,.2)">
        <div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;margin-bottom:6px">أفضل أداء</div>
        <div style="font-weight:900;font-size:15px;color:var(--green)">${escapeHtml(nameFn(best))}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:3px">${typeof valueFn(best) === 'number' ? (valueFn(best) >= 0 ? '+' : '') + valueFn(best).toFixed(2) + '%' : valueFn(best)}</div>
      </div>
      <div style="padding:12px;background:var(--red-l);border-radius:10px;border:.5px solid rgba(225,29,72,.2)">
        <div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;margin-bottom:6px">أحتاج مراجعة</div>
        <div style="font-weight:900;font-size:15px;color:var(--red)">${escapeHtml(nameFn(worst))}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:3px">${typeof valueFn(worst) === 'number' ? (valueFn(worst) >= 0 ? '+' : '') + valueFn(worst).toFixed(2) + '%' : valueFn(worst)}</div>
      </div>
      ${sorted.map(item => `<div style="padding:10px;background:var(--surface2);border-radius:8px;display:flex;justify-content:space-between;align-items:center"><span style="font-weight:700;font-size:12px">${escapeHtml(nameFn(item))}</span><span style="font-weight:800;font-size:13px;color:${colorFn(item)}">${(valueFn(item) >= 0 ? '+' : '') + valueFn(item).toFixed(1)}%</span></div>`).join('')}
    </div>
  </div>`;
}

// ─── معرفة الصفحة الحالية ─────────────────────────────────────
export function activeMarket() {
  return marketCtx.activeStockMarket || 'ALL';
}
