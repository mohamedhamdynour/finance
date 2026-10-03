// ══════════════════════════════════════════════════════════════════
//  pages/certs.js — الشهادات الادخارية + المرفقات + Undo
// ══════════════════════════════════════════════════════════════════
import { DB } from '../../state.js';
import { N2, fmt, fmtN, pct, today, sign, cls, escapeHtml, baseCur, toEGP } from '../../core/utils.js';
import { sbPost, sbPatch, sbDel } from '../../core/supabase.js';
import { toast } from '../toast.js';
import { deleteWithUndo } from '../undo.js';
import { kpi, svgIcon, populateSelect, getCertAlerts } from '../shared.js';
import { openModal, closeModal } from '../modals.js';
import { calcTotals, calcAccruedInterest, getCertPayoutSchedule } from '../../domain/calc.js';
import { renderAttachmentsSection } from '../attachments.js';
import { attachmentsCount } from '../../domain/attachments.js';

const reload = () => window.loadAll?.();

// ══════════════════ Render ══════════════════

export function renderCerts() {
  const T = calcTotals();
  const { certsTotal, grand } = T;
  const alerts = getCertAlerts();
  const totalInt = DB.certs.reduce((a, c) => a + N2(c.total_interest), 0);
  const totalPaid = DB.certs.reduce((a, c) => a + N2(c.interest_paid), 0);
  const todayAccrued = DB.certs.reduce((a, c) => a + calcAccruedInterest(c), 0);

  document.getElementById('cert-kpis').innerHTML =
    kpi('إجمالي الشهادات', fmt(certsTotal), pct(certsTotal, grand) + ' من المحفظة', 'var(--purple)', svgIcon('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>')) +
    kpi('مستحق حتى اليوم', fmt(todayAccrued), (todayAccrued / Math.max(1, totalInt) * 100).toFixed(1) + '% من الإجمالي', 'var(--blue)', svgIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>')) +
    kpi('إجمالي الفوائد', fmt(totalInt), 'على مدى المدد كاملة', 'var(--green)', svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>')) +
    kpi('فوائد تم صرفها', fmt(totalPaid), (totalPaid / Math.max(1, totalInt) * 100).toFixed(1) + '% من الإجمالي', 'var(--teal)', svgIcon('<polyline points="20 6 9 17 4 12"/>')) +
    kpi('فوائد متبقية', fmt(totalInt - totalPaid), 'لم يتم صرفها بعد', 'var(--gold)', svgIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>')) +
    kpi('تستحق قريباً', alerts.soon.length + alerts.expired.length, alerts.expired.length ? 'منتهية: ' + alerts.expired.length : 'خلال 30 يوم', alerts.expired.length ? 'var(--red)' : 'var(--gold)', svgIcon('<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>'));

  // ─── التنبيهات ───
  let alertsHtml = '';
  if (alerts.expired.length) {
    alertsHtml += `<div class="alert alert-danger">
      <div class="alert-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
      <div class="alert-content">
        <div class="alert-title">شهادات منتهية (${alerts.expired.length})</div>
        <div class="alert-body">${alerts.expired.map(c => escapeHtml(c.name) + ' — منذ ' + Math.abs(c.daysLeft) + ' يوم').join(' · ')}</div>
      </div>
    </div>`;
  }
  if (alerts.soon.length) {
    alertsHtml += `<div class="alert alert-warn">
      <div class="alert-icon"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></div>
      <div class="alert-content">
        <div class="alert-title">تستحق خلال 30 يوم</div>
        <div class="alert-body">${alerts.soon.map(c => escapeHtml(c.name) + ': ' + c.daysLeft + ' يوم').join(' | ')}</div>
      </div>
    </div>`;
  }
  document.getElementById('cert-alerts').innerHTML = alertsHtml;

  // ─── البطاقات ───
  const now = new Date();
  document.getElementById('cert-cards').innerHTML = DB.certs.length ? DB.certs.map(c => {
    const mat = new Date(c.maturity_date);
    const days = Math.ceil((mat - now) / 86400000);
    const isExpired = days < 0, isSoon = days >= 0 && days <= 30;
    const periodsMap = { 'سنوي': N2(c.duration), 'شهري': N2(c.duration) * 12, 'أسبوعي': N2(c.duration) * 52, 'يومي': N2(c.duration) * 365 };
    const periods = periodsMap[c.payout_type || 'سنوي'] || N2(c.duration);
    const perPeriod = periods > 0 ? N2(c.total_interest) / periods : 0;
    const remaining = Math.max(0, N2(c.total_interest) - N2(c.interest_paid));
    const accrued = calcAccruedInterest(c);
    const paidPct = N2(c.total_interest) > 0 ? Math.min(100, N2(c.interest_paid) / N2(c.total_interest) * 100) : 0;
    const statusColor = isExpired ? 'var(--red)' : isSoon ? 'var(--gold)' : 'var(--purple)';
    const statusLabel = isExpired ? 'منتهية' : isSoon ? days + ' يوم للاستحقاق' : 'نشطة';
    const attCount = attachmentsCount('certificates', c.id);

    return `<div class="info-card">
      <div class="info-card-strip" style="background:${statusColor}"></div>
      <div class="info-card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="min-width:0">
            <div style="font-weight:800;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(c.name)}</div>
            <div style="font-size:10.5px;color:var(--muted)">${escapeHtml(c.bank_name || '—')} • ${escapeHtml(c.payout_type || 'سنوي')}</div>
          </div>
          <span class="badge" style="background:${statusColor}22;color:${statusColor};font-weight:800;white-space:nowrap">${statusLabel}</span>
        </div>

        <div>
          <div style="font-size:20px;font-weight:900;color:var(--purple)">${fmt(c.amount)}</div>
          <div style="font-size:11px;color:var(--muted)">فائدة ${c.rate}% • ${c.duration} سنة (${c.issued_date} → ${c.maturity_date})</div>
        </div>

        <div>
          <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted);margin-bottom:3px">
            <span>عائد مُصرف: ${paidPct.toFixed(0)}%</span><span>متبقي: ${fmt(remaining)}</span>
          </div>
          <div class="prog-wrap"><div class="prog-bar" style="width:${paidPct}%;background:var(--teal)"></div></div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;color:var(--muted);background:var(--surface2);border-radius:8px;padding:8px">
          <div>مستحق حتى اليوم<div style="color:var(--blue);font-weight:700">${fmt(accrued)}</div></div>
          <div>العائد الدوري<div style="color:var(--green);font-weight:700">${fmt(perPeriod)}</div></div>
          <div>عائد مُصرف<div style="color:var(--teal);font-weight:700">${fmt(c.interest_paid)}</div></div>
          <div>إجمالي الفائدة<div style="color:var(--green);font-weight:700">+${fmt(c.total_interest)}</div></div>
        </div>

        ${attCount > 0 ? `
          <div style="display:flex;align-items:center;gap:6px;padding-top:8px;border-top:.5px solid var(--border);font-size:11px;color:var(--muted)">
            📎 ${attCount} مرفق
          </div>` : ''}
      </div>
      <div class="info-card-footer">
        <button class="btn btn-xs btn-success" onclick="openCertPayout(${c.id})" title="صرف عائد">صرف عائد</button>
        <button class="btn-icon" onclick="openCertAttachments(${c.id})" title="المرفقات" style="${attCount > 0 ? 'color:var(--purple)' : ''}">
          <svg viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        </button>
        <button class="btn-icon edit" onclick="editCert(${c.id})" title="تعديل">
          <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon danger" onclick="deleteCert(${c.id})" title="حذف">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
        </button>
      </div>
    </div>`;
  }).join('') : `<div class="empty-state" style="padding:48px;text-align:center;color:var(--muted);grid-column:1/-1">
    <p>لا توجد شهادات مسجلة</p>
    <button class="btn btn-primary" style="margin-top:14px" onclick="openModal('modal-cert-add')">
      <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      إضافة أول شهادة
    </button>
  </div>`;
}

// ══════════════════ Actions ══════════════════

export async function saveCert() {
  const id = document.getElementById('ecert-id').value;
  const name = document.getElementById('ecert-name').value.trim();
  const bank_name = document.getElementById('ecert-bank-name').value.trim();
  const amount = N2(document.getElementById('ecert-amount').value);
  const currency = document.getElementById('ecert-currency')?.value || baseCur();
  const rate = N2(document.getElementById('ecert-rate').value);
  const duration = N2(document.getElementById('ecert-dur').value);
  const issued = document.getElementById('ecert-date').value || today();
  const payout_type = document.getElementById('ecert-payout').value;
  const bankId = +document.getElementById('ecert-bank').value;

  if (!name || !amount || !rate) return alert('أكمل البيانات: الاسم والمبلغ والفائدة');

  const mat = new Date(issued);
  mat.setFullYear(mat.getFullYear() + duration);
  const maturity_date = mat.toISOString().slice(0, 10);
  const total_interest = +(amount * rate / 100 * duration).toFixed(4);

  try {
    if (id) {
      const orig = DB.certs.find(c => c.id === +id);
      await sbPatch('certificates', id, {
        name, bank_name, amount, currency, rate, duration,
        issued_date: issued, maturity_date, total_interest, payout_type
      });
      // حدّث الحركة البنكية المرتبطة (المبلغ/التاريخ)
      if (orig?.bank_transaction_id && (N2(orig.amount) !== amount || orig.issued_date !== issued)) {
        await sbPatch('bank_transactions', orig.bank_transaction_id, {
          amount, date: issued, notes: 'شراء شهادة: ' + name
        });
      }
      closeModal('modal-cert-add');
      document.getElementById('ecert-id').value = '';
      toast('تم التعديل');
    } else {
      if (!bankId) return alert('اختر الحساب البنكي لخصم قيمة الشهادة منه');
      const bank = DB.banks.find(b => b.id === bankId);
      if (!bank) return alert('الحساب غير موجود');
      const bankCur = bank.currency || 'EGP';
      if (currency !== bankCur) return alert(`عملة الشراء (${currency}) لا تطابق عملة الحساب (${bankCur}).`);
      if (toEGP(N2(bank.balance), bankCur) < toEGP(amount, bankCur)) {
        return alert('الرصيد غير كافٍ: ' + fmt(bank.balance) + ' ' + bankCur);
      }
      const bt = await sbPost('bank_transactions', [{
        bank_id: bankId, type: 'سحب', amount, date: issued,
        notes: 'شراء شهادة: ' + name, category: 'شهادة ادخارية'
      }]);
      await sbPost('certificates', [{
        bank_id: bankId, name, bank_name, amount, currency, rate, duration,
        issued_date: issued, maturity_date, total_interest, payout_type,
        interest_paid: 0, bank_transaction_id: bt?.[0]?.id || null
      }]);
      closeModal('modal-cert-add');
      document.getElementById('ecert-id').value = '';
      toast('تم إضافة الشهادة');
    }
    await reload();
  } catch (e) {
    console.error('saveCert:', e);
    toast('خطأ: ' + e.message, false);
  }
}

export function editCert(id) {
  const c = DB.certs.find(x => x.id === id);
  if (!c) return;
  document.getElementById('ecert-id').value = c.id;
  document.getElementById('ecert-name').value = c.name;
  document.getElementById('ecert-bank-name').value = c.bank_name || '';
  document.getElementById('ecert-amount').value = c.amount;
  document.getElementById('ecert-rate').value = c.rate;
  document.getElementById('ecert-dur').value = c.duration;
  document.getElementById('ecert-payout').value = c.payout_type || 'سنوي';
  document.getElementById('ecert-date').value = c.issued_date;
  document.getElementById('modal-cert-title').textContent = 'تعديل الشهادة';
  populateSelect('ecert-bank');
  document.getElementById('cert-preview').innerHTML = '';
  setTimeout(() => {
    document.getElementById('ecert-bank').value = c.bank_id || '';
    if (typeof window.updateCertPreview === 'function') window.updateCertPreview();
  }, 50);
  openModal('modal-cert-add');
}

// ✅ Undo: حذف شهادة
export async function deleteCert(id) {
  const cert = DB.certs.find(c => c.id === id);
  if (!cert) return;
  const label = cert.name;
  await deleteWithUndo('certificates', id, label, async () => {
    // احذف الحركة البنكية المرتبطة
    if (cert.bank_transaction_id) {
      try { await sbDel('bank_transactions', cert.bank_transaction_id); } catch (e) {}
    }
  });
}

// ─── كسر شهادة ───

export async function doCertBreak() {
  const certId = +document.getElementById('ecb-cert').value;
  const dt = document.getElementById('ecb-date').value || today();
  const fee = N2(document.getElementById('ecb-fee').value);
  const bankId = +document.getElementById('ecb-bank').value;
  const notes = document.getElementById('ecb-notes')?.value || '';
  const cert = DB.certs.find(c => c.id === certId);
  if (!cert) return alert('اختر شهادة');
  if (!bankId) return alert('اختر حساباً بنكياً');

  const now = new Date(dt), issued = new Date(cert.issued_date), mat = new Date(cert.maturity_date);
  const isEarly = now < mat;
  const daysHeld = Math.max(0, Math.ceil((now - issued) / 86400000));
  const totalDays = Math.max(1, Math.ceil((mat - issued) / 86400000));
  const earnedInterest = isEarly ? +(N2(cert.total_interest) * daysHeld / totalDays).toFixed(4) : N2(cert.total_interest);
  const remainingInterest = Math.max(0, earnedInterest - N2(cert.interest_paid));
  const refund = Math.max(0, N2(cert.amount) + remainingInterest - fee);

  if (!confirm(`كسر شهادة "${cert.name}"؟\nالمبلغ المسترد: ${fmt(refund)}`)) return;

  const bank = DB.banks.find(b => b.id === bankId);
  if (!bank) return alert('الحساب غير موجود');

  try {
    const notesFull = `كسر شهادة: ${cert.name} | أصل: ${fmt(cert.amount)} | فائدة: ${fmt(remainingInterest)} | رسوم: ${fmt(fee)}${notes ? ' | ' + notes : ''}${isEarly ? ' | كسر مبكر' : ''}`;
    await sbPost('bank_transactions', [{
      bank_id: bankId, type: 'إيداع', amount: refund, date: dt,
      notes: notesFull, category: 'كسر شهادة'
    }]);
    if (cert.bank_transaction_id) {
      try { await sbDel('bank_transactions', cert.bank_transaction_id); } catch (e) {}
    }
    await sbDel('certificates', certId);
    closeModal('modal-cert-break');
    toast('تم كسر الشهادة');
    await reload();
  } catch (e) {
    console.error('doCertBreak:', e);
    toast('خطأ: ' + e.message, false);
  }
}

// ─── صرف عائد ───

export async function doCertPayout() {
  const certId = +document.getElementById('ecp-cert-id').value;
  const bankId = +document.getElementById('ecp-bank').value;
  const mode = document.querySelector('input[name="ecp-mode"]:checked')?.value || 'single';
  const cert = DB.certs.find(c => c.id === certId);
  if (!cert) return alert('الشهادة غير موجودة');
  if (!bankId) return alert('اختر حساباً بنكياً');

  if (mode === 'schedule') {
    const sched = getCertPayoutSchedule(cert);
    if (!sched.unpaidPeriods.length) return alert('لا توجد دفعات مستحقة');
    try {
      let runningPaid = N2(cert.interest_paid);
      for (const p of sched.unpaidPeriods) {
        runningPaid = +(runningPaid + p.amount).toFixed(4);
        await sbPost('bank_transactions', [{
          bank_id: bankId, type: 'عائد شهادة', amount: p.amount, date: p.date,
          notes: 'عائد شهادة: ' + cert.name + ' | دفعة رقم ' + p.period,
          category: 'عائد شهادة'
        }]);
      }
      await sbPatch('certificates', certId, { interest_paid: runningPaid });
      closeModal('modal-cert-payout');
      toast(`تم تسجيل ${sched.unpaidPeriods.length} دفعة`);
      await reload();
    } catch (e) {
      console.error('doCertPayout(schedule):', e);
      toast('خطأ: ' + e.message, false);
    }
    return;
  }

  const amount = N2(document.getElementById('ecp-amount').value);
  const dt = document.getElementById('ecp-date').value || today();
  if (!amount || amount <= 0) return alert('أدخل مبلغ العائد');
  const remaining = Math.max(0, N2(cert.total_interest) - N2(cert.interest_paid));
  if (amount > remaining + 0.01) return alert(`المبلغ أكبر من المتاح (${fmt(remaining)})`);

  try {
    await sbPost('bank_transactions', [{
      bank_id: bankId, type: 'عائد شهادة', amount, date: dt,
      notes: 'عائد شهادة: ' + cert.name, category: 'عائد شهادة'
    }]);
    await sbPatch('certificates', certId, {
      interest_paid: +(N2(cert.interest_paid) + amount).toFixed(4)
    });
    closeModal('modal-cert-payout');
    toast('تم صرف العائد');
    await reload();
  } catch (e) {
    console.error('doCertPayout:', e);
    toast('خطأ: ' + e.message, false);
  }
}

// ─── صرف جماعي ───

export async function doBulkCertPayout() {
  const mode = document.querySelector('input[name="bcp-mode"]:checked')?.value || 'single';
  const checked = [...document.querySelectorAll('.bcp-check:checked')].map(el => +el.dataset.cert);
  if (!checked.length) return alert('اختر شهادة على الأقل');

  let done = 0, skipped = [];
  try {
    if (mode === 'single') {
      const dt = document.getElementById('bcp-date').value || today();
      for (const certId of checked) {
        const cert = DB.certs.find(c => c.id === certId); if (!cert) continue;
        const amount = N2(document.querySelector(`.bcp-amount[data-cert="${certId}"]`)?.value);
        if (!amount || amount <= 0) { skipped.push(cert.name); continue; }
        if (!cert.bank_id) { skipped.push(cert.name + ' (بدون حساب)'); continue; }
        await sbPost('bank_transactions', [{
          bank_id: cert.bank_id, type: 'عائد شهادة', amount, date: dt,
          notes: 'عائد شهادة: ' + cert.name, category: 'عائد شهادة'
        }]);
        await sbPatch('certificates', certId, {
          interest_paid: +(N2(cert.interest_paid) + amount).toFixed(4)
        });
        done++;
      }
    } else {
      for (const certId of checked) {
        const cert = DB.certs.find(c => c.id === certId); if (!cert) continue;
        const sched = getCertPayoutSchedule(cert);
        if (!sched.unpaidPeriods.length) continue;
        if (!cert.bank_id) { skipped.push(cert.name + ' (بدون حساب)'); continue; }
        let runningPaid = N2(cert.interest_paid);
        for (const p of sched.unpaidPeriods) {
          runningPaid = +(runningPaid + p.amount).toFixed(4);
          await sbPost('bank_transactions', [{
            bank_id: cert.bank_id, type: 'عائد شهادة', amount: p.amount, date: p.date,
            notes: 'عائد شهادة: ' + cert.name + ' | دفعة ' + p.period,
            category: 'عائد شهادة'
          }]);
        }
        await sbPatch('certificates', certId, { interest_paid: runningPaid });
        done++;
      }
    }
    closeModal('modal-bulk-cert-payout');
    toast(`تم لـ ${done} شهادة${skipped.length ? ' — تخطّي: ' + skipped.join(', ') : ''}`);
    await reload();
  } catch (e) {
    console.error('doBulkCertPayout:', e);
    toast('خطأ: ' + e.message, false);
  }
}

// ══════════════════ المرفقات ══════════════════

export function openCertAttachments(certId) {
  const cert = DB.certs.find(c => c.id === certId);
  if (!cert) return;

  const html = renderAttachmentsSection('certificates', certId);

  document.getElementById('edit-modal-title').innerHTML = '📎 مرفقات: ' + escapeHtml(cert.name);
  document.getElementById('edit-modal-body').innerHTML = `
    <div style="padding:10px 12px;background:var(--surface2);border-radius:var(--radius-sm);margin-bottom:12px;font-size:12px;color:var(--muted)">
      أرفق صورة الشهادة الورقية أو العقد بصيغة PDF لمراجعتها لاحقاً.
    </div>
    ${html}
  `;
  // اخفِ زر الحفظ (لأن هذه نافذة عرض فقط)
  const saveBtn = document.getElementById('edit-modal-save-btn');
  if (saveBtn) saveBtn.style.display = 'none';

  openModal('modal-edit');
}
