// ══════════════════════════════════════════════════════════════════
//  pages/debts.js — الديون والالتزامات
// ══════════════════════════════════════════════════════════════════
import { DB } from '../../state.js';
import { N2, fmt, pctN, today, escapeHtml } from '../../core/utils.js';
import { sbPost, sbPatch, sbDel } from '../../core/supabase.js';
import { toast } from '../toast.js';
import { kpi, svgIcon, populateSelect } from '../shared.js';
import { openModal, closeModal } from '../modals.js';
import { calcTotals } from '../../domain/calc.js';

const reload = () => window.loadAll?.();

export function renderDebts() {
  const T = calcTotals();
  document.getElementById('debt-kpis').innerHTML =
    kpi('ديون عليّ', fmt(T.debtsOwed), 'مجموع الالتزامات', 'var(--red)', svgIcon('<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78"/>')) +
    kpi('ديون لي', fmt(T.debtsOwing), 'مجموع المستحقات لي', 'var(--green)', svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>')) +
    kpi('صافي الوضع', fmt(T.debtsOwing - T.debtsOwed), 'لي × عليّ', T.debtsOwing >= T.debtsOwed ? 'var(--green)' : 'var(--red)', svgIcon('<line x1="12" y1="1" x2="12" y2="23"/>')) +
    kpi('عدد الالتزامات', DB.debts.length, 'إجمالي العقود', 'var(--muted)', svgIcon('<circle cx="12" cy="12" r="10"/>'));

  if (!DB.debts.length) {
    document.getElementById('debts-list').innerHTML = `<div class="empty-state" style="padding:48px;text-align:center;color:var(--muted)"><p>لا توجد ديون أو التزامات</p></div>`;
    document.getElementById('debts-payments-log').innerHTML = '';
    return;
  }

  document.getElementById('debts-list').innerHTML = DB.debts.map(d => {
    const now = new Date(), due = d.due_date ? new Date(d.due_date) : null;
    const isOverdue = due && now > due && N2(d.remaining) > 0;
    const daysLeft = due ? Math.ceil((due - now) / 86400000) : null;
    const pctPaid = N2(d.amount) > 0 ? pctN(N2(d.amount) - N2(d.remaining), N2(d.amount)) : 0;
    const payments = DB.debtPayments.filter(p => p.debt_id === d.id);
    const stripColor = isOverdue ? 'var(--red)' : d.type === 'دين علي' ? 'var(--gold)' : 'var(--green)';
    return `<div class="debt-card${isOverdue ? ' overdue' : ''}" style="border-top:3px solid ${stripColor};padding-top:13px">
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-weight:800;font-size:15px">${escapeHtml(d.name)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px">${escapeHtml(d.party || '')} • ${escapeHtml(d.type)}${d.rate > 0 ? ' • فائدة ' + d.rate + '%' : ''}</div>
        </div>
        <div style="text-align:left">
          <div style="font-size:20px;font-weight:900;color:${d.type === 'دين علي' ? 'var(--red)' : 'var(--green)'}">${fmt(d.remaining)}</div>
          <div style="font-size:11px;color:var(--muted)">من أصل ${fmt(d.amount)}</div>
        </div>
      </div>
      <div class="prog-wrap lg" style="margin-bottom:10px"><div class="prog-bar" style="width:${Math.min(pctPaid, 100)}%;background:${pctPaid >= 100 ? 'var(--green)' : 'var(--teal)'}"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:10px;flex-wrap:wrap;gap:4px">
        <span>مدفوع: ${pctPaid.toFixed(0)}%</span>
        ${d.start_date ? `<span>البداية: ${d.start_date}</span>` : ''}
        ${d.due_date ? `<span style="${isOverdue ? 'color:var(--red);font-weight:700' : ''}">الاستحقاق: ${d.due_date}${daysLeft !== null ? ' (' + Math.abs(daysLeft) + (daysLeft < 0 ? ' يوم مضى' : ' يوم متبقي') + ')' : ''}</span>` : ''}
        ${payments.length ? `<span>${payments.length} دفعة</span>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-xs btn-success" onclick="openDebtPay(${d.id})">دفعة</button>
        <button class="btn btn-xs btn-outline" onclick="editDebt(${d.id})">تعديل</button>
        <button class="btn btn-xs btn-danger" onclick="deleteDebt(${d.id})">حذف</button>
      </div>
      ${d.notes ? `<div style="font-size:11px;color:var(--muted);margin-top:8px;padding-top:8px;border-top:.5px solid var(--border)">${escapeHtml(d.notes)}</div>` : ''}
    </div>`;
  }).join('');

  // سجل الدفعات
  const logEl = document.getElementById('debts-payments-log');
  if (DB.debtPayments.length) {
    logEl.innerHTML = `<div class="card" style="margin-top:16px">
      <div class="card-header"><div class="card-title">سجل الدفعات</div></div>
      <div class="card-body no-pad"><div class="table-wrap"><table>
        <thead><tr><th>التاريخ</th><th>الدين</th><th>المبلغ</th><th>الحساب</th><th>ملاحظات</th><th></th></tr></thead>
        <tbody>${[...DB.debtPayments].sort((a, b) => b.date > a.date ? 1 : -1).map(p => {
          const debt = DB.debts.find(d => d.id === p.debt_id);
          const bank = DB.banks.find(b => b.id === p.bank_id);
          return `<tr><td>${p.date}</td><td style="font-weight:700">${escapeHtml(debt?.name || '—')}</td><td class="td-num pos" style="direction:ltr">${fmt(p.amount)}</td><td class="muted">${bank ? escapeHtml(bank.name) : '—'}</td><td class="muted">${escapeHtml(p.notes || '—')}</td><td><button class="btn-icon danger" onclick="deleteDebtPayment(${p.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button></td></tr>`;
        }).join('')}</tbody>
      </table></div></div>
    </div>`;
  } else logEl.innerHTML = '';
}

export function openDebtPay(debtId) {
  populateSelect('edp-bank', '<option value="">— لا يوجد —</option>');
  document.getElementById('edp-debt').innerHTML = DB.debts.map(d => `<option value="${d.id}" ${d.id === debtId ? 'selected' : ''}>${escapeHtml(d.name)} | متبقي: ${fmt(d.remaining)}</option>`).join('');
  document.getElementById('edp-date').value = today();
  document.getElementById('edp-amount').value = '';
  document.getElementById('edp-notes').value = '';
  openModal('modal-debt-pay');
}

export async function saveDebt() {
  const id = document.getElementById('edebt-id').value;
  const name = document.getElementById('edebt-name').value.trim();
  const party = document.getElementById('edebt-party').value.trim();
  const type = document.getElementById('edebt-type').value;
  const rate = N2(document.getElementById('edebt-rate').value);
  const amount = N2(document.getElementById('edebt-amount').value);
  const remaining = N2(document.getElementById('edebt-remaining').value) || amount;
  const start = document.getElementById('edebt-start').value || today();
  const due = document.getElementById('edebt-due').value;
  const bankId = +document.getElementById('edebt-bank').value || null;
  const notes = document.getElementById('edebt-notes').value.trim();
  if (!name || !amount) return alert('أكمل البيانات');
  try {
    if (id) {
      await sbPatch('debts', id, { name, party, type, rate, amount, remaining, start_date: start, due_date: due || null, bank_id: bankId, notes });
    } else {
      await sbPost('debts', [{ name, party, type, rate, amount, remaining, start_date: start, due_date: due || null, bank_id: bankId, notes }]);
    }
    closeModal('modal-debt-add');
    document.getElementById('edebt-id').value = '';
    toast('تم الحفظ'); await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

export function editDebt(id) {
  const d = DB.debts.find(x => x.id === id);
  if (!d) return;
  document.getElementById('edebt-id').value = d.id;
  document.getElementById('edebt-name').value = d.name;
  document.getElementById('edebt-party').value = d.party || '';
  document.getElementById('edebt-type').value = d.type;
  document.getElementById('edebt-rate').value = d.rate || 0;
  document.getElementById('edebt-amount').value = d.amount;
  document.getElementById('edebt-remaining').value = d.remaining;
  document.getElementById('edebt-start').value = d.start_date || today();
  document.getElementById('edebt-due').value = d.due_date || '';
  document.getElementById('edebt-notes').value = d.notes || '';
  const bankSel = document.getElementById('edebt-bank');
  if (bankSel) bankSel.value = d.bank_id || '';
  document.getElementById('modal-debt-title').textContent = 'تعديل الدين';
  openModal('modal-debt-add');
}

export async function saveDebtPayment() {
  const debtId = +document.getElementById('edp-debt').value;
  const amount = N2(document.getElementById('edp-amount').value);
  const dt = document.getElementById('edp-date').value || today();
  const bankId = +document.getElementById('edp-bank').value || null;
  const notes = document.getElementById('edp-notes').value.trim();
  if (!debtId || !amount) return alert('أكمل البيانات');
  const debt = DB.debts.find(d => d.id === debtId);
  if (!debt) return alert('الدين غير موجود');
  if (amount > N2(debt.remaining) + 0.01) return alert(`المبلغ أكبر من المتبقي (${fmt(debt.remaining)})`);
  try {
    const newRemaining = Math.max(0, +(N2(debt.remaining) - amount).toFixed(4));
    let btId = null;
    if (bankId) {
      const bank = DB.banks.find(b => b.id === bankId);
      if (!bank) return alert('الحساب غير موجود');
      if (debt.type === 'دين علي') {
        if (N2(bank.balance) < amount) return alert('الرصيد غير كافٍ');
        const bt = await sbPost('bank_transactions', [{ bank_id: bankId, type: 'سحب', amount, date: dt, notes: 'سداد دين: ' + debt.name, category: 'سداد دين' }]);
        btId = bt?.[0]?.id || null;
      } else {
        const bt = await sbPost('bank_transactions', [{ bank_id: bankId, type: 'إيداع', amount, date: dt, notes: 'استرداد دين: ' + debt.name, category: 'استرداد دين' }]);
        btId = bt?.[0]?.id || null;
      }
    }
    await sbPost('debt_payments', [{ debt_id: debtId, bank_id: bankId, amount, date: dt, notes, bank_transaction_id: btId }]);
    await sbPatch('debts', debtId, { remaining: newRemaining });
    closeModal('modal-debt-pay');
    toast('تم تسجيل الدفعة'); await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

export async function deleteDebtPayment(id) {
  const p = DB.debtPayments.find(x => x.id === id);
  if (!p || !confirm('حذف هذه الدفعة؟ سيتم عكس أثرها')) return;
  try {
    const debt = DB.debts.find(d => d.id === p.debt_id);
    if (p.bank_transaction_id) { try { await sbDel('bank_transactions', p.bank_transaction_id); } catch (e) {} }
    await sbDel('debt_payments', id);
    if (debt) {
      const restored = debt.type === 'دين علي' ? N2(debt.remaining) + N2(p.amount) : N2(debt.remaining) - N2(p.amount);
      await sbPatch('debts', debt.id, { remaining: Math.max(0, +restored.toFixed(4)) });
    }
    toast('تم الحذف'); await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

export async function deleteDebt(id) {
  if (!confirm('حذف هذا الدين؟')) return;
  try { await sbDel('debts', id); toast('تم الحذف'); await reload(); }
  catch (e) { toast('خطأ: ' + e.message, false); }
}
