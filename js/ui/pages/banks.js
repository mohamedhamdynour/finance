// ══════════════════════════════════════════════════════════════════
//  pages/banks.js — الحسابات البنكية + Undo
// ══════════════════════════════════════════════════════════════════
import { DB, UI, editCtx } from '../../state.js';
import { N2, fmt, fmtN, pct, today, getBankColor, toEGP, escapeHtml, sign, cls, periodStart } from '../../core/utils.js';
import { sbPost, sbPatch, sbDel, sbRpc } from '../../core/supabase.js';
import { toast } from '../toast.js';
import { deleteWithUndo } from '../undo.js';
import { kpi, svgIcon, typeTag, populateSelect, fmtBankAmt } from '../shared.js';
import { openModal, closeModal } from '../modals.js';
import { calcTotals } from '../../domain/calc.js';

const reload = () => window.loadAll?.();

// ══════════════════ Render ══════════════════

export function renderBanks() {
  const T = calcTotals();
  const { totalBanks, grand } = T;
  const baseBalances = DB.banks.filter(b => (b.currency || 'EGP') === 'EGP').reduce((a, b) => a + N2(b.balance), 0);
  const fgn = totalBanks - baseBalances;
  const pStart = periodStart(UI.globalPeriod || '1y');
  const periodTxns = DB.bankTxns.filter(t => t.date >= pStart);
  const totalDeposits = periodTxns.filter(t => ['إيداع','تحويل وارد','رصيد افتتاحي','عائد شهادة'].includes(t.type)).reduce((a, t) => a + N2(t.amount), 0);
  const totalWithdrawals = periodTxns.filter(t => ['سحب','تحويل صادر'].includes(t.type)).reduce((a, t) => a + N2(t.amount), 0);
  const lowBal = DB.banks.filter(b => N2(b.min_balance) > 0 && N2(b.balance) < N2(b.min_balance)).length;

  document.getElementById('bank-kpis').innerHTML =
    kpi('إجمالي الأرصدة', fmt(totalBanks), pct(totalBanks, grand) + ' من المحفظة', 'var(--teal)', svgIcon('<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>')) +
    kpi('عدد الحسابات', DB.banks.length, '', 'var(--blue)', svgIcon('<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>')) +
    kpi('أرصدة بـ EGP', fmt(baseBalances), 'EGP', 'var(--green)', svgIcon('<circle cx="12" cy="12" r="10"/>')) +
    (fgn > 0 ? kpi('عملات أجنبية (محوّلة)', fmt(fgn), 'محوّلة إلى EGP', 'var(--gold)', svgIcon('<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>')) : '') +
    kpi('إجمالي الإيداعات', fmt(totalDeposits), 'في الفترة المحددة', 'var(--green)', svgIcon('<path d="M12 5v14M5 12l7 7 7-7"/>')) +
    kpi('إجمالي السحوبات', fmt(totalWithdrawals), 'في الفترة المحددة', 'var(--red)', svgIcon('<path d="M12 19V5M5 12l7-7 7 7"/>')) +
    (lowBal > 0 ? kpi('حسابات دون الحد', lowBal, 'تحتاج انتباهاً', 'var(--gold)', svgIcon('<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>')) : '');

  const activeBanksList = DB.banks.filter(b => b.is_active !== false).sort((a, b) => {
    const av = toEGP(N2(a.balance), a.currency || 'EGP'), bv = toEGP(N2(b.balance), b.currency || 'EGP');
    return UI.bankSort === 'asc' ? av - bv : bv - av;
  });
  const archivedBanksList = DB.banks.filter(b => b.is_active === false);

  const renderCard = (b, archived = false) => {
    const balEGP = toEGP(N2(b.balance), b.currency || 'EGP');
    const isLow = N2(b.min_balance) > 0 && N2(b.balance) < N2(b.min_balance);
    const isNeg = N2(b.balance) < 0;
    const bankColor = getBankColor(b.id);
    const typeColors = { جاري: 'var(--blue)', توفير: 'var(--green)', استثماري: 'var(--purple)', بورصة: 'var(--gold)', كاش: 'var(--teal)' };
    const typeBg = { جاري: 'var(--blue-l)', توفير: 'var(--green-l)', استثماري: 'var(--purple-l)', بورصة: 'var(--gold-l)', كاش: 'var(--teal-l)' };
    const typeIcons = {
      جاري: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
      توفير: '<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20a1 1 0 001 1h2v-2h3v2h3v-2h1c.5 0 1-.5 1-1v-2.3c1-.5 1.7-1.2 2-1.7h1v-4h-1a5.5 5.5 0 00-1.5-3.5L21 5h-2z"/>',
      استثماري: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
      بورصة: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
      كاش: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>'
    };
    const share = totalBanks > 0 ? Math.max(0, Math.min(100, balEGP / totalBanks * 100)) : 0;
    return `<div class="info-card type-${b.type}${isLow ? ' warn' : ''}${isNeg ? ' danger' : ''}${archived ? ' bank-archived' : ''}">
      <div class="info-card-strip" style="background:linear-gradient(90deg,${bankColor},${bankColor}55)"></div>
      <div class="info-card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="display:flex;align-items:center;gap:8px;min-width:0">
            <span style="width:34px;height:34px;border-radius:9px;background:${bankColor}22;color:${bankColor};display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${typeIcons[b.type] || typeIcons['جاري']}</svg></span>
            <div style="min-width:0">
              <div style="font-weight:800;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(b.name)}</div>
              <div style="font-size:10.5px;color:var(--muted)">${escapeHtml(b.bank_code || '')}${b.account_no ? ' • ' + escapeHtml(b.account_no) : ''}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
            ${archived ? '<span class="badge badge-gray">مؤرشف</span>' : ''}
            <span class="badge" style="background:${typeBg[b.type] || 'var(--surface2)'};color:${typeColors[b.type] || 'var(--muted)'}">${escapeHtml(b.type)}</span>
          </div>
        </div>
        <div>
          <div style="font-size:22px;font-weight:900;color:${isNeg ? 'var(--red)' : isLow ? 'var(--gold)' : 'var(--text)'}">${fmtN(N2(b.balance), 2)}<span style="font-size:12px;font-weight:700;color:var(--muted);margin-right:5px">${escapeHtml(b.currency || 'EGP')}</span></div>
          ${b.currency && b.currency !== 'EGP' ? `<div style="font-size:11px;color:var(--muted)">≈ ${fmt(balEGP)}</div>` : ''}
        </div>
        <div>
          <div style="height:4px;background:var(--surface2);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${share}%;background:${bankColor};border-radius:2px"></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
            <span style="font-size:10px;color:var(--muted)">${share.toFixed(1)}% من إجمالي البنوك</span>
          </div>
        </div>
        ${b.notes ? `<div style="font-size:10.5px;color:var(--muted);padding-top:8px;border-top:.5px solid var(--border)">${escapeHtml(b.notes)}</div>` : ''}
      </div>
      <div class="info-card-footer">
        ${!archived ? `<button class="btn btn-xs btn-success" onclick="quickDep(${b.id})">+</button>
        <button class="btn btn-xs btn-gold" onclick="quickWit(${b.id})">-</button>` : ''}
        <button class="btn-icon" onclick="toggleBankStatus(${b.id})" style="color:${archived ? 'var(--green)' : 'var(--muted)'}">
          ${archived ? '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>'}
        </button>
        <button class="btn-icon edit" onclick="editBank(${b.id})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn-icon danger" onclick="deleteBank(${b.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
      </div>
    </div>`;
  };
  let cardsHtml = activeBanksList.map(b => renderCard(b, false)).join('');
  if (archivedBanksList.length) {
    cardsHtml += `<div style="grid-column:1/-1;padding:8px 0;font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.8px;border-top:.5px solid var(--border);margin-top:4px">الحسابات المؤرشفة (${archivedBanksList.length})</div>`;
    cardsHtml += archivedBanksList.map(b => renderCard(b, true)).join('');
  }
  document.getElementById('bank-cards').innerHTML = cardsHtml || `<div class="empty-state"><p>لا توجد حسابات</p></div>`;

  const activeBanks = DB.banks.filter(b => b.is_active !== false);
  const archivedBanks = DB.banks.filter(b => b.is_active === false);
  const totalBanksEGP = activeBanks.reduce((a, b) => a + toEGP(N2(b.balance), b.currency || 'EGP'), 0);
  document.getElementById('bank-tabs').innerHTML =
    `<div class="tab ${UI.activeBankId === 'ALL' ? 'active' : ''}" data-bank-tab="ALL" onclick="switchBankTab('ALL')" style="display:flex;align-items:center;gap:5px;font-weight:800">كل الحسابات <span style="opacity:.7;font-weight:400">(${fmt(totalBanksEGP)})</span></div>` +
    [...activeBanks, ...archivedBanks].map(b => {
      const dot = `<span style="width:7px;height:7px;border-radius:50%;background:${getBankColor(b.id)};flex-shrink:0;display:inline-block"></span>`;
      return `<div class="tab ${b.id === UI.activeBankId ? 'active' : ''} ${b.is_active === false ? 'bank-archived' : ''}" data-bank-tab="${b.id}" onclick="switchBankTab(${b.id})" style="display:flex;align-items:center;gap:5px">${dot}${escapeHtml(b.name)}${b.is_active === false ? ' (مؤرشف)' : ''}</div>`;
    }).join('');

  renderBankTable();
}

export function renderBankTable() {
  const CREDIT = ['إيداع','تحويل وارد','رصيد افتتاحي','عائد شهادة','أرباح'];
  const isAll = UI.activeBankId === 'ALL';
  const theadEl = document.getElementById('bank-txns-thead');

  const buildFilters = (txns) => {
    const counts = {};
    txns.forEach(t => { counts[t.type] = (counts[t.type] || 0) + 1; });
    const defs = [{ key: 'ALL', label: 'الكل', count: txns.length }];
    Object.keys(counts).sort((a, b) => counts[b] - counts[a]).forEach(t => defs.push({ key: t, label: t, count: counts[t] }));
    const el = document.getElementById('bank-txn-filters');
    if (el) el.innerHTML = defs.map(f =>
      `<button class="btn btn-xs ${UI.bankTxnFilter === f.key ? 'btn-primary' : 'btn-outline'}" onclick="setBankTxnFilter('${f.key.replace(/'/g, "\\'")}')">${escapeHtml(f.label)} <span style="opacity:.7">(${f.count})</span></button>`
    ).join('');
  };

  if (isAll) {
    const activeBanksList = DB.banks.filter(b => b.is_active !== false);
    const totalEGP = activeBanksList.reduce((a, b) => a + toEGP(N2(b.balance), b.currency || 'EGP'), 0);
    document.getElementById('bank-table-title').innerHTML = `<span style="display:inline-flex;align-items:center;gap:7px"><strong>كل الحسابات (${activeBanksList.length})</strong><span style="color:var(--muted)">|</span><span style="font-weight:900">${fmt(totalEGP)}</span></span>`;
    if (theadEl) theadEl.innerHTML = `<tr><th>التاريخ</th><th>الحساب</th><th>النوع</th><th>الفئة</th><th>المبلغ</th><th>ملاحظات</th><th></th></tr>`;
    let txns = DB.bankTxns.slice();
    txns = txns.filter(t => t.date >= periodStart(UI.globalPeriod || '1y') && t.date <= today());
    buildFilters(txns);
    if (UI.bankTxnFilter !== 'ALL') txns = txns.filter(t => t.type === UI.bankTxnFilter);
    txns.sort((a, b) => b.date > a.date ? 1 : b.date < a.date ? -1 : b.id - a.id);

    document.getElementById('bank-txns-tbody').innerHTML = txns.length ? txns.map(t => {
      const b = DB.banks.find(x => x.id === t.bank_id);
      const isIn = CREDIT.includes(t.type);
      const bColor = b ? getBankColor(b.id) : 'var(--muted)';
      const noteLines = (t.notes || '').split('\n');
      return `<tr data-row-id="${t.id}" style="border-right:2px solid ${bColor}22">
        <td style="font-size:12px">${t.date}</td>
        <td>${b ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px"><span style="width:8px;height:8px;border-radius:50%;background:${bColor};flex-shrink:0"></span>${escapeHtml(b.name)}</span>` : '<span class="muted">— محذوف —</span>'}</td>
        <td>${typeTag(t.type)}</td>
        <td>${t.category ? `<span class="badge badge-gray" style="font-size:9.5px">${escapeHtml(t.category)}</span>` : ''}</td>
        <td class="td-num ${isIn ? 'pos' : 'neg'}" style="direction:ltr;font-weight:700">${isIn ? '+' : '-'}${fmtBankAmt(t.amount, t.bank_id)}</td>
        <td style="max-width:180px"><div style="font-size:11.5px">${escapeHtml(noteLines[0] || '—')}</div>${noteLines.length > 1 ? `<div style="font-size:10px;color:var(--muted);margin-top:2px">${escapeHtml(noteLines.slice(1).join(' | '))}</div>` : ''}</td>
        <td class="td-actions">
          <button class="btn-icon edit" onclick="editBankTxn(${t.id})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn-icon danger" onclick="deleteBankTxn(${t.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">لا توجد عمليات في الفترة</td></tr>`;
    return;
  }

  if (theadEl) theadEl.innerHTML = `<tr><th>التاريخ</th><th>النوع</th><th>الفئة</th><th>المبلغ</th><th>الرصيد بعد</th><th>ملاحظات</th><th></th></tr>`;
  const bank = DB.banks.find(b => b.id === UI.activeBankId);
  if (!bank) { document.getElementById('bank-txns-tbody').innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">اختر حساباً</td></tr>`; return; }
  const bankColor = getBankColor(bank.id), cur = bank.currency || 'EGP';
  document.getElementById('bank-table-title').innerHTML = `<span style="display:inline-flex;align-items:center;gap:7px"><span style="width:12px;height:12px;border-radius:50%;background:${bankColor};flex-shrink:0"></span><strong style="color:${bankColor}">${escapeHtml(bank.name)}</strong>${bank.bank_code ? `<span class="badge badge-gray">${escapeHtml(bank.bank_code)}</span>` : ''}<span style="color:var(--muted)">|</span><span style="font-weight:900;color:${bankColor}">${fmtN(N2(bank.balance), 2)} ${escapeHtml(cur)}</span></span>`;
  let txns = DB.bankTxns.filter(t => t.bank_id === UI.activeBankId);
  txns = txns.filter(t => t.date >= periodStart(UI.globalPeriod || '1y') && t.date <= today());
  buildFilters(txns);
  if (UI.bankTxnFilter !== 'ALL') txns = txns.filter(t => t.type === UI.bankTxnFilter);

  document.getElementById('bank-txns-tbody').innerHTML = txns.length ? txns.map(t => {
    const isIn = CREDIT.includes(t.type);
    const noteLines = (t.notes || '').split('\n');
    return `<tr data-row-id="${t.id}" style="border-right:2px solid ${bankColor}22">
      <td style="font-size:12px">${t.date}</td><td>${typeTag(t.type)}</td>
      <td>${t.category ? `<span class="badge badge-gray" style="font-size:9.5px">${escapeHtml(t.category)}</span>` : ''}</td>
      <td class="td-num ${isIn ? 'pos' : 'neg'}" style="direction:ltr;font-weight:700">${isIn ? '+' : '-'}${fmtBankAmt(t.amount, t.bank_id)}</td>
      <td class="td-num" style="direction:ltr;font-weight:900;color:${bankColor}">${fmtBankAmt(t.balance_after, t.bank_id)}</td>
      <td style="max-width:200px"><div style="font-size:11.5px">${escapeHtml(noteLines[0] || '—')}</div>${noteLines.length > 1 ? `<div style="font-size:10px;color:var(--muted);margin-top:2px">${escapeHtml(noteLines.slice(1).join(' | '))}</div>` : ''}</td>
      <td class="td-actions">
        <button class="btn-icon edit" onclick="editBankTxn(${t.id})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn-icon danger" onclick="deleteBankTxn(${t.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">لا توجد عمليات في الفترة</td></tr>`;
}

// ══════════════════ Actions ══════════════════

export async function saveBank() {
  const id = document.getElementById('eb-id').value;
  const name = document.getElementById('eb-name').value.trim();
  const bank_code = document.getElementById('eb-code').value.trim();
  const type = document.getElementById('eb-type').value;
  const currency = (document.getElementById('eb-currency').value.trim() || 'EGP').toUpperCase();
  const account_no = document.getElementById('eb-account').value.trim();
  const min_balance = N2(document.getElementById('eb-min').value);
  const opening = N2(document.getElementById('eb-opening').value);
  const notes = document.getElementById('eb-notes').value.trim();
  const color = document.getElementById('eb-color')?.value || '#3b82f6';
  const is_active = document.getElementById('eb-active')?.checked !== false;
  if (!name) return alert('أدخل اسم البنك');
  try {
    if (id) {
      await sbPatch('banks', id, { name, bank_code, type, currency, account_no, min_balance, notes, color, is_active });
      toast('تم تعديل الحساب');
    } else {
      const res = await sbPost('banks', [{ name, bank_code, type, currency, account_no, min_balance, notes, color, is_active: true }]);
      if (opening > 0 && res?.[0]?.id) {
        await sbPost('bank_transactions', [{ bank_id: res[0].id, type: 'رصيد افتتاحي', amount: opening, date: today(), notes: 'رصيد افتتاحي' }]);
      }
      toast('تم إضافة الحساب');
    }
    closeModal('modal-add-bank'); await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

export function editBank(id) {
  const b = DB.banks.find(x => x.id === id);
  if (!b) return;
  document.getElementById('eb-id').value = b.id;
  document.getElementById('eb-name').value = b.name;
  document.getElementById('eb-code').value = b.bank_code || '';
  document.getElementById('eb-type').value = b.type;
  const bCurSel = document.getElementById('eb-currency');
  if (bCurSel) {
    bCurSel.value = b.currency || 'EGP';
    if (b.currency && ![...bCurSel.options].some(o => o.value === b.currency)) {
      bCurSel.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(b.currency)}">${escapeHtml(b.currency)} (غير مُدرج)</option>`);
      bCurSel.value = b.currency;
    }
  }
  document.getElementById('eb-account').value = b.account_no || '';
  document.getElementById('eb-min').value = b.min_balance || 0;
  document.getElementById('eb-opening').value = b.balance;
  document.getElementById('eb-notes').value = b.notes || '';
  const colorEl = document.getElementById('eb-color');
  if (colorEl) colorEl.value = b.color || '#3b82f6';
  const activeEl = document.getElementById('eb-active');
  if (activeEl) activeEl.checked = b.is_active !== false;
  document.getElementById('modal-add-bank-title').textContent = 'تعديل الحساب';
  openModal('modal-add-bank');
}

export async function toggleBankStatus(id) {
  const b = DB.banks.find(x => x.id === id);
  if (!b) return;
  const newStatus = b.is_active === false;
  const msg = newStatus ? `تفعيل حساب "${b.name}"؟` : `أرشفة حساب "${b.name}"؟`;
  if (!confirm(msg)) return;
  try {
    await sbPatch('banks', id, { is_active: newStatus });
    toast(newStatus ? 'تم التفعيل' : 'تم الأرشفة');
    await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

// ✅ Undo: حذف بتأجيل + زر تراجع
export async function deleteBank(id) {
  const b = DB.banks.find(x => x.id === id);
  if (!b) return;
  await deleteWithUndo('banks', id, b.name, async () => {
    // قبل الحذف الفعلي: أرشِف كل حركات البنك
    try {
      const txns = DB.bankTxns.filter(t => t.bank_id === id);
      for (const t of txns) {
        await sbPatch('bank_transactions', t.id, { deleted_at: new Date().toISOString() });
      }
    } catch (e) {
      console.warn('فشل أرشفة الحركات:', e);
    }
  });
}

export async function doDeposit() {
  const editId = document.getElementById('ed-txn-id')?.value;
  const bid = +document.getElementById('ed-bank').value;
  const amt = N2(document.getElementById('ed-amount').value);
  const dt = document.getElementById('ed-date').value || today();
  const notes = document.getElementById('ed-notes')?.value || '';
  const cat = document.getElementById('ed-category')?.value || '';
  if (!amt || amt <= 0) return alert('أدخل مبلغ صحيح');
  if (!bid) return alert('اختر حساباً');
  try {
    if (editId) {
      await sbPatch('bank_transactions', editId, { amount: amt, date: dt, notes, category: cat });
      toast('تم التعديل');
    } else {
      await sbPost('bank_transactions', [{ bank_id: bid, type: 'إيداع', amount: amt, date: dt, notes, category: cat }]);
      toast('تم الإيداع');
    }
    closeModal('modal-dep');
    document.getElementById('ed-txn-id').value = '';
    await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

export async function doWithdraw() {
  const editId = document.getElementById('ew-txn-id')?.value;
  const bid = +document.getElementById('ew-bank').value;
  const amt = N2(document.getElementById('ew-amount').value);
  const dt = document.getElementById('ew-date').value || today();
  const notes = document.getElementById('ew-notes')?.value || '';
  const cat = document.getElementById('ew-category')?.value || '';
  if (!amt || amt <= 0) return alert('أدخل مبلغ صحيح');
  if (!bid) return alert('اختر حساباً');
  const bank = DB.banks.find(b => b.id === bid);
  if (!bank) return alert('الحساب غير موجود');
  if (editId) {
    const oldTxn = DB.bankTxns.find(t => t.id === +editId);
    const availableBal = oldTxn && oldTxn.bank_id === bid ? N2(bank.balance) + N2(oldTxn.amount) : N2(bank.balance);
    if (availableBal < amt) return alert('الرصيد غير كافٍ: ' + fmt(availableBal));
  } else if (N2(bank.balance) < amt) return alert('الرصيد غير كافٍ: ' + fmt(bank.balance));
  try {
    if (editId) {
      await sbPatch('bank_transactions', editId, { amount: amt, date: dt, notes, category: cat });
      toast('تم التعديل');
    } else {
      await sbPost('bank_transactions', [{ bank_id: bid, type: 'سحب', amount: amt, date: dt, notes, category: cat }]);
      toast('تم السحب');
    }
    closeModal('modal-wit');
    document.getElementById('ew-txn-id').value = '';
    await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

export async function doTransfer() {
  const fromId = +document.getElementById('etr-from').value;
  const toId = +document.getElementById('etr-to').value;
  const amt = N2(document.getElementById('etr-amount').value);
  const fee = N2(document.getElementById('etr-fee')?.value || 0);
  const dt = document.getElementById('etr-date').value || today();
  const notes = document.getElementById('etr-notes')?.value || '';
  if (!fromId || !toId) return alert('اختر الحسابين');
  if (fromId === toId) return alert('الحسابان متطابقان');
  if (!amt || amt <= 0) return alert('أدخل مبلغ صحيح');
  const from = DB.banks.find(b => b.id === fromId), to = DB.banks.find(b => b.id === toId);
  if (!from || !to) return alert('أحد الحسابين غير موجود');
  const fromCur = from.currency || 'EGP', toCur = to.currency || 'EGP';

  let toAmt = amt;
  if (fromCur !== toCur) {
    const egpAmount = N2(amt) * (fromCur === 'EGP' ? 1 : (DB.exchangeRates.find(x => x.currency === fromCur)?.rate || 1));
    toAmt = toCur === 'EGP' ? egpAmount : egpAmount / (DB.exchangeRates.find(x => x.currency === toCur)?.rate || 1);
    toAmt = +N2(toAmt).toFixed(4);
  }
  try {
    await sbRpc('transfer_funds', {
      p_from_id: fromId, p_to_id: toId,
      p_amount: amt, p_to_amount: toAmt,
      p_fee: fee, p_date: dt, p_notes: notes
    });
    closeModal('modal-transfer');
    toast('تم التحويل بنجاح');
    await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

// ✅ Undo: حذف حركة بنكية
export async function deleteBankTxn(id) {
  const txn = DB.bankTxns.find(t => t.id === id);
  if (!txn) return;
  const label = (txn.notes || '').split('\n')[0] || txn.type;
  await deleteWithUndo('bank_transactions', id, label, async () => {
    // احذف الحركة المرتبطة إن وُجدت
    if (txn.linked_transfer_id) {
      try { await sbDel('bank_transactions', txn.linked_transfer_id); } catch (e) {}
    }
  });
}

export function editBankTxn(id) {
  const t = DB.bankTxns.find(x => x.id === id);
  if (!t) return;
  editCtx.table = 'bank_transactions';
  editCtx.id = id;
  const bank = DB.banks.find(b => b.id === t.bank_id);
  const isDeposit = ['إيداع','تحويل وارد','رصيد افتتاحي','عائد شهادة'].includes(t.type);
  const catOpts = isDeposit
    ? '<option value="">— اختر —</option><option value="مرتب">مرتب</option><option value="عائد استثماري">عائد استثماري</option><option value="مكافأة">مكافأة</option><option value="أرباح أسهم">أرباح أسهم</option><option value="عائد شهادة">عائد شهادة</option><option value="تحويل">تحويل وارد</option><option value="أخرى - إيداع">أخرى</option>'
    : '<option value="">— اختر —</option><option value="مصروفات منزلية">مصروفات منزلية</option><option value="فواتير">فواتير</option><option value="تعليم">تعليم</option><option value="صحة">صحة</option><option value="استثمار">استثمار</option><option value="تحويل صادر">تحويل صادر</option><option value="سداد دين">سداد دين</option><option value="أخرى - سحب">أخرى</option>';
  document.getElementById('edit-modal-title').textContent = 'تعديل حركة بنكية';
  document.getElementById('edit-modal-body').innerHTML = `
    <div style="padding:10px 12px;background:var(--surface2);border-radius:var(--radius-sm);margin-bottom:12px;font-size:12px">
      الحساب: <strong>${escapeHtml(bank?.name || '—')}</strong> | العملة: <strong style="color:var(--blue)">${escapeHtml(bank?.currency || 'EGP')}</strong>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">التاريخ</label><input class="form-control" type="date" id="edt-date" value="${t.date}"></div>
      <div class="form-group"><label class="form-label">النوع</label>
        <select class="form-control" id="edt-type">
          <option ${t.type === 'إيداع' ? 'selected' : ''}>إيداع</option>
          <option ${t.type === 'سحب' ? 'selected' : ''}>سحب</option>
          <option ${t.type === 'تحويل وارد' ? 'selected' : ''}>تحويل وارد</option>
          <option ${t.type === 'تحويل صادر' ? 'selected' : ''}>تحويل صادر</option>
          <option ${t.type === 'عائد شهادة' ? 'selected' : ''}>عائد شهادة</option>
          <option ${t.type === 'رصيد افتتاحي' ? 'selected' : ''}>رصيد افتتاحي</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label class="form-label">المبلغ (${escapeHtml(bank?.currency || 'EGP')})</label><input class="form-control" type="number" step="0.01" id="edt-amount" value="${t.amount}"></div>
    <div class="form-group"><label class="form-label">الفئة</label><select class="form-control" id="edt-cat">${catOpts}</select></div>
    <div class="form-group"><label class="form-label">ملاحظات</label><textarea class="form-control" id="edt-notes" rows="3" style="resize:vertical">${escapeHtml(t.notes || '')}</textarea></div>
    <div class="form-hint">الرصيد بعد العملية يُحسب تلقائياً عند الحفظ</div>
  `;
  setTimeout(() => { const cs = document.getElementById('edt-cat'); if (cs && t.category) cs.value = t.category; }, 0);
  openModal('modal-edit');
}
