// ══════════════════════════════════════════════════════════════════
//  pages/installments.js — الأقساط والالتزامات المقسّمة
// ══════════════════════════════════════════════════════════════════
import { DB, editCtx } from '../../state.js';
import { N2, fmt, fmtN, escapeHtml, today } from '../../core/utils.js';
import { sbPost, sbPatch, sbDel } from '../../core/supabase.js';
import { toast } from '../toast.js';
import { deleteWithUndo } from '../undo.js';
import { kpi, svgIcon, populateSelect } from '../shared.js';
import { openModal, closeModal } from '../modals.js';
import { installmentProgress, installmentsSummary } from '../../domain/calc.js';

const reload = () => window.loadAll?.();

// ══════════════════ Render ══════════════════

export function renderInstallments() {
  const s = installmentsSummary();

  document.getElementById('inst-kpis').innerHTML =
    kpi('إجمالي الأقساط', fmt(s.totalAmount), `${s.totalCount} التزام مُقسّط`, 'var(--blue)', svgIcon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>')) +
    kpi('مدفوع', fmt(s.totalPaid), s.totalAmount > 0 ? ((s.totalPaid / s.totalAmount) * 100).toFixed(1) + '%' : '0%', 'var(--green)', svgIcon('<polyline points="20 6 9 17 4 12"/>')) +
    kpi('متبقي', fmt(s.totalRemaining), `${s.activeCount} قسط نشط`, 'var(--gold)', svgIcon('<line x1="12" y1="1" x2="12" y2="23"/>')) +
    kpi('مستحق خلال 30 يوم', fmt(s.nextMonthDue), s.overdueCount > 0 ? `${s.overdueCount} متأخر` : 'لا يوجد متأخر', s.overdueCount > 0 ? 'var(--red)' : 'var(--teal)', svgIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'));

  const list = DB.installments.slice().sort((a, b) => {
    const pa = installmentProgress(a), pb = installmentProgress(b);
    if (pa.completed !== pb.completed) return pa.completed ? 1 : -1;
    if (pa.next.isOverdue !== pb.next.isOverdue) return pa.next.isOverdue ? -1 : 1;
    return (pa.next.date || '') > (pb.next.date || '') ? 1 : -1;
  });

  document.getElementById('inst-list').innerHTML = list.length
    ? list.map(inst => renderInstallmentCard(inst)).join('')
    : `<div class="empty-state" style="padding:48px;text-align:center;color:var(--muted);grid-column:1/-1">
        <p>لا توجد أقساط مسجلة</p>
        <button class="btn btn-primary" style="margin-top:14px" onclick="openModal('modal-installment-add')">
          <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          إضافة أول قسط
        </button>
      </div>`;

  // سجل الدفعات (آخر 100)
  const recentPayments = [...DB.installmentPayments]
    .filter(p => !p.deleted_at)
    .sort((a, b) => b.date > a.date ? 1 : -1)
    .slice(0, 100);

  const logEl = document.getElementById('inst-payments-log');
  if (recentPayments.length) {
    logEl.innerHTML = `<div class="card" style="margin-top:16px">
      <div class="card-header"><div class="card-title">سجل الدفعات (آخر ${recentPayments.length})</div></div>
      <div class="card-body no-pad"><div class="table-wrap"><table>
        <thead><tr><th>التاريخ</th><th>القسط</th><th>المبلغ</th><th>الحساب</th><th>ملاحظات</th><th></th></tr></thead>
        <tbody>${recentPayments.map(p => {
          const inst = DB.installments.find(i => i.id === p.installment_id);
          const bank = DB.banks.find(b => b.id === p.bank_id);
          return `<tr data-row-id="${p.id}">
            <td>${p.date}</td>
            <td style="font-weight:700">${escapeHtml(inst?.name || '—')}</td>
            <td class="td-num pos" style="direction:ltr">${fmt(p.amount)}</td>
            <td class="muted">${bank ? escapeHtml(bank.name) : '—'}</td>
            <td class="muted">${escapeHtml(p.notes || '—')}</td>
            <td class="td-actions">
              <button class="btn-icon danger" onclick="deleteInstallmentPayment(${p.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div></div>
    </div>`;
  } else {
    logEl.innerHTML = '';
  }
}

function renderInstallmentCard(inst) {
  const prog = installmentProgress(inst);
  const { pct, paidCount, paidAmount, remaining, remainingCount, completed, next } = prog;
  const bank = DB.banks.find(b => b.id === inst.bank_id);

  // لون الحالة
  let statusColor = 'var(--blue)';
  let statusLabel = 'نشط';
  let statusBg = 'var(--blue-l)';

  if (completed) {
    statusColor = 'var(--green)';
    statusLabel = '✓ مكتمل';
    statusBg = 'var(--green-l)';
  } else if (next.isOverdue) {
    statusColor = 'var(--red)';
    statusLabel = `متأخر ${Math.abs(next.daysLeft)} يوم`;
    statusBg = 'var(--red-l)';
  } else if (next.daysLeft !== null && next.daysLeft <= 7) {
    statusColor = 'var(--gold)';
    statusLabel = `خلال ${next.daysLeft} يوم`;
    statusBg = 'var(--gold-l)';
  }

  const freqLabel = { monthly: 'شهري', weekly: 'أسبوعي', quarterly: 'ربع سنوي', yearly: 'سنوي' }[inst.frequency] || inst.frequency;

  return `<div class="info-card">
    <div class="info-card-strip" style="background:${statusColor}"></div>
    <div class="info-card-body">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="min-width:0">
          <div style="font-weight:800;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(inst.name)}</div>
          <div style="font-size:10.5px;color:var(--muted)">${escapeHtml(inst.party || '—')} • ${escapeHtml(freqLabel)}</div>
        </div>
        <span class="badge" style="background:${statusBg};color:${statusColor};font-weight:800;white-space:nowrap">${statusLabel}</span>
      </div>

      <div>
        <div style="font-size:22px;font-weight:900;color:var(--text)">${fmt(inst.installment_amount)}<span style="font-size:11px;color:var(--muted);font-weight:600;margin-right:6px">/ ${freqLabel}</span></div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">المتبقي: <strong>${remainingCount} من ${inst.installments_count}</strong> قسط</div>
      </div>

      <div>
        <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted);margin-bottom:4px">
          <span>مدفوع: ${fmt(paidAmount)}</span>
          <span>${pct.toFixed(0)}%</span>
        </div>
        <div class="prog-wrap"><div class="prog-bar" style="width:${pct}%;background:${completed ? 'var(--green)' : statusColor}"></div></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;color:var(--muted);background:var(--surface2);border-radius:8px;padding:8px">
        <div>الإجمالي<div style="color:var(--text);font-weight:700">${fmt(inst.total_amount)}</div></div>
        <div>المتبقي<div style="color:${statusColor};font-weight:700">${fmt(remaining)}</div></div>
        <div>دفعات<div style="color:var(--text);font-weight:700">${paidCount} / ${inst.installments_count}</div></div>
        <div>الدفعة القادمة<div style="color:${statusColor};font-weight:700">${next.date ? next.date : '—'}</div></div>
      </div>

      ${bank ? `<div style="font-size:10.5px;color:var(--muted);display:flex;align-items:center;gap:4px;padding-top:8px;border-top:.5px solid var(--border)">
        <span style="width:7px;height:7px;border-radius:50%;background:${bank.color || '#3b82f6'}"></span>
        ${escapeHtml(bank.name)}
      </div>` : ''}
    </div>
    <div class="info-card-footer">
      ${!completed ? `<button class="btn btn-xs btn-success" onclick="openInstallmentPay(${inst.id})">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        سداد دفعة
      </button>` : ''}
      <button class="btn-icon edit" onclick="editInstallment(${inst.id})" title="تعديل"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="btn-icon danger" onclick="deleteInstallment(${inst.id})" title="حذف"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
    </div>
  </div>`;
}

// ══════════════════ Actions ══════════════════

export async function saveInstallment() {
  const id = document.getElementById('einst-id').value;
  const name = document.getElementById('einst-name').value.trim();
  const party = document.getElementById('einst-party').value.trim();
  const total_amount = N2(document.getElementById('einst-total').value);
  const installments_count = Math.floor(N2(document.getElementById('einst-count').value));
  const installment_amount = N2(document.getElementById('einst-amount').value);
  const frequency = document.getElementById('einst-freq').value;
  const start_date = document.getElementById('einst-start').value || today();
  const bank_id = +document.getElementById('einst-bank').value || null;
  const notes = document.getElementById('einst-notes').value.trim();

  if (!name) return alert('أدخل اسم القسط');
  if (!total_amount || total_amount <= 0) return alert('أدخل المبلغ الإجمالي');
  if (!installments_count || installments_count < 1) return alert('عدد الأقساط غير صحيح');
  if (!installment_amount || installment_amount <= 0) return alert('أدخل قيمة القسط');

  try {
    if (id) {
      await sbPatch('installments', id, {
        name, party, total_amount, installments_count, installment_amount,
        frequency, start_date, bank_id, notes
      });
      toast('تم التعديل');
    } else {
      await sbPost('installments', [{
        name, party, total_amount, installments_count, installment_amount,
        frequency, start_date, bank_id, notes
      }]);
      toast('تم إضافة القسط');
    }
    closeModal('modal-installment-add');
    document.getElementById('einst-id').value = '';
    await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

export function editInstallment(id) {
  const inst = DB.installments.find(x => x.id === id);
  if (!inst) return;
  document.getElementById('einst-id').value = inst.id;
  document.getElementById('einst-name').value = inst.name;
  document.getElementById('einst-party').value = inst.party || '';
  document.getElementById('einst-total').value = inst.total_amount;
  document.getElementById('einst-count').value = inst.installments_count;
  document.getElementById('einst-amount').value = inst.installment_amount;
  document.getElementById('einst-freq').value = inst.frequency || 'monthly';
  document.getElementById('einst-start').value = inst.start_date;
  document.getElementById('einst-notes').value = inst.notes || '';
  populateSelect('einst-bank', '<option value="">— لا يوجد —</option>');
  setTimeout(() => { document.getElementById('einst-bank').value = inst.bank_id || ''; }, 50);
  document.getElementById('modal-installment-title').textContent = 'تعديل القسط';
  openModal('modal-installment-add');
}

export async function deleteInstallment(id) {
  const inst = DB.installments.find(x => x.id === id);
  if (!inst) return;
  const label = inst.name;
  await deleteWithUndo('installments', id, label, async () => {
    // أرشِف كل دفعاته (soft delete)
    const payments = DB.installmentPayments.filter(p => p.installment_id === id);
    for (const p of payments) {
      try { await sbPatch('installment_payments', p.id, { deleted_at: new Date().toISOString() }); } catch (e) {}
    }
  });
}

// ─── دفع قسط ───

export function openInstallmentPay(instId) {
  const inst = DB.installments.find(x => x.id === instId);
  if (!inst) return;
  const prog = installmentProgress(inst);

  document.getElementById('eip-inst-id').value = inst.id;
  document.getElementById('eip-amount').value = inst.installment_amount;
  document.getElementById('eip-date').value = today();
  document.getElementById('eip-notes').value = '';

  populateSelect('eip-bank', '<option value="">— لا يوجد —</option>');
  if (inst.bank_id) setTimeout(() => { document.getElementById('eip-bank').value = inst.bank_id; }, 50);

  document.getElementById('eip-info').innerHTML = `
    <div style="font-weight:800;font-size:14px;margin-bottom:8px">${escapeHtml(inst.name)}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div style="padding:8px;background:var(--blue-l);border-radius:8px;text-align:center">
        <div style="font-size:10px;color:var(--muted)">الدفعة الحالية</div>
        <div style="font-weight:900;font-size:16px;color:var(--blue)">${prog.paidCount + 1} / ${inst.installments_count}</div>
      </div>
      <div style="padding:8px;background:var(--gold-l);border-radius:8px;text-align:center">
        <div style="font-size:10px;color:var(--muted)">المتبقي</div>
        <div style="font-weight:900;font-size:16px;color:var(--gold)">${fmt(prog.remaining)}</div>
      </div>
    </div>
    <div style="margin-top:8px;font-size:11px;color:var(--muted);padding:6px;background:var(--surface2);border-radius:6px;text-align:center">
      الدفعة القادمة: <strong>${prog.next.date || '—'}</strong>
      ${prog.next.isOverdue ? `<span style="color:var(--red);font-weight:700"> (متأخر ${Math.abs(prog.next.daysLeft)} يوم)</span>` : ''}
    </div>
  `;

  openModal('modal-installment-pay');
}

export async function saveInstallmentPayment() {
  const instId = +document.getElementById('eip-inst-id').value;
  const amount = N2(document.getElementById('eip-amount').value);
  const dt = document.getElementById('eip-date').value || today();
  const bankId = +document.getElementById('eip-bank').value || null;
  const notes = document.getElementById('eip-notes').value.trim();

  if (!instId || !amount || amount <= 0) return alert('أدخل مبلغ صحيح');
  const inst = DB.installments.find(x => x.id === instId);
  if (!inst) return alert('القسط غير موجود');

  try {
    let btId = null;
    // اخصم من البنك كسحب
    if (bankId) {
      const bank = DB.banks.find(b => b.id === bankId);
      if (!bank) return alert('الحساب غير موجود');
      if (N2(bank.balance) < amount) return alert(`الرصيد غير كافٍ: ${fmt(bank.balance)} ${bank.currency || 'EGP'}`);
      const bt = await sbPost('bank_transactions', [{
        bank_id: bankId, type: 'سحب', amount, date: dt,
        notes: `دفعة قسط: ${inst.name}`,
        category: 'سداد قسط'
      }]);
      btId = bt?.[0]?.id || null;
    }

    await sbPost('installment_payments', [{
      installment_id: instId,
      bank_id: bankId,
      bank_transaction_id: btId,
      amount, date: dt, notes
    }]);

    closeModal('modal-installment-pay');
    toast('تم تسجيل الدفعة');
    await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

export async function deleteInstallmentPayment(id) {
  const p = DB.installmentPayments.find(x => x.id === id);
  if (!p) return;
  const inst = DB.installments.find(i => i.id === p.installment_id);
  const label = inst ? `دفعة ${inst.name}` : 'دفعة';
  await deleteWithUndo('installment_payments', id, label, async () => {
    if (p.bank_transaction_id) {
      try { await sbDel('bank_transactions', p.bank_transaction_id); } catch (e) {}
    }
  });
}

// ─── حساب تلقائي لقيمة القسط ───

export function autoCalcInstallmentAmount() {
  const total = N2(document.getElementById('einst-total').value);
  const count = Math.floor(N2(document.getElementById('einst-count').value));
  if (total > 0 && count > 0) {
    document.getElementById('einst-amount').value = (total / count).toFixed(2);
  }
}
