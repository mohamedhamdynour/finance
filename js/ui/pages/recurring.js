// ══════════════════════════════════════════════════════════════════
//  pages/recurring.js — العمليات المتكررة
// ══════════════════════════════════════════════════════════════════
import { DB, UI } from '../../state.js';
import { N2, fmt, today, escapeHtml } from '../../core/utils.js';
import { sbPost, sbPatch, sbDel } from '../../core/supabase.js';
import { toast } from '../toast.js';
import { kpi, svgIcon, populateSelect } from '../shared.js';
import { openModal, closeModal } from '../modals.js';
import { nextRecDate } from '../../domain/calc.js';
import { renderDetectorSection } from '../recurring-detector.js';
import { attachmentsCount } from '../../domain/attachments.js';

const reload = () => window.loadAll?.();

export function setRecurringFilter(v) { UI.recurringFilter = v; renderRecurring(); }

export function renderRecurring() {
  const freqLabel = { monthly: 'شهري', weekly: 'أسبوعي', yearly: 'سنوي' };
  const freqMonthlyFactor = { monthly: 1, weekly: 4.345, yearly: 1 / 12 };
  const typeIcons = {
    'إيداع': '<path d="M12 5v14M5 12l7 7 7-7"/>',
    'سحب': '<path d="M12 19V5M5 12l7-7 7 7"/>'
  };
  const now = today();
  const items = DB.recurring.map(r => {
    const next = nextRecDate(r);
    const daysUntil = Math.ceil((new Date(next) - new Date(now)) / 86400000);
    const isDue = next <= now;
    return { ...r, next, daysUntil, isDue };
  });

 const detectorEl = document.getElementById('recurring-detector');
  if (detectorEl) {
    try {
      detectorEl.innerHTML = renderDetectorSection();
    } catch (e) {
      console.warn('[detector] failed:', e.message);
      detectorEl.innerHTML = '';
    }
  }
  
  const dueCount = items.filter(i => i.isDue).length;
  const monthlyTotal = items.filter(i => i.type === 'إيداع').reduce((a, i) => a + N2(i.amount) * (freqMonthlyFactor[i.freq] || 1), 0)
    - items.filter(i => i.type === 'سحب').reduce((a, i) => a + N2(i.amount) * (freqMonthlyFactor[i.freq] || 1), 0);

  document.getElementById('recurring-kpis').innerHTML =
    kpi('عمليات نشطة', items.length, 'إجمالي العمليات المتكررة', 'var(--teal)', svgIcon('<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>')) +
    kpi('مستحق الآن', dueCount, dueCount > 0 ? 'يحتاج تطبيق' : 'كل شيء محدَّث', 'var(--gold)', svgIcon('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>')) +
    kpi('الأثر الشهري الصافي', fmt(monthlyTotal), 'على أساس شهري', monthlyTotal >= 0 ? 'var(--green)' : 'var(--red)', svgIcon('<line x1="12" y1="1" x2="12" y2="23"/>'));

  const filterDefs = [
    { key: 'ALL', label: 'الكل', count: items.length },
    { key: 'DUE', label: 'مستحق الآن', count: dueCount },
    { key: 'إيداع', label: 'إيداعات', count: items.filter(i => i.type === 'إيداع').length },
    { key: 'سحب', label: 'سحوبات', count: items.filter(i => i.type === 'سحب').length }
  ];
  document.getElementById('recurring-filter-tabs').innerHTML = filterDefs.map(f =>
    `<div class="tab ${UI.recurringFilter === f.key ? 'active' : ''}" onclick="setRecurringFilter('${f.key}')">${escapeHtml(f.label)} (${f.count})</div>`
  ).join('');

  let filtered = items;
  if (UI.recurringFilter === 'DUE') filtered = items.filter(i => i.isDue);
  else if (UI.recurringFilter === 'إيداع' || UI.recurringFilter === 'سحب') filtered = items.filter(i => i.type === UI.recurringFilter);
  filtered.sort((a, b) => a.next < b.next ? -1 : 1);

  if (!filtered.length) {
    document.getElementById('recurring-cards').innerHTML = `<div class="empty-state" style="padding:48px;text-align:center;color:var(--muted);grid-column:1/-1"><p>لا توجد عمليات متكررة</p></div>`;
    return;
  }

  document.getElementById('recurring-cards').innerHTML = filtered.map(r => {
    const isIn = r.type === 'إيداع';
    const bank = DB.banks.find(b => b.id === r.bank_id);
    const statusBadge = r.isDue
      ? `<span class="badge" style="background:var(--green-l);color:var(--green);font-weight:800">مستحق الآن</span>`
      : r.daysUntil <= 3 ? `<span class="badge" style="background:var(--gold-l);color:var(--gold);font-weight:800">خلال ${r.daysUntil} يوم</span>`
      : `<span class="badge badge-gray">بعد ${r.daysUntil} يوم</span>`;
    return `<div class="info-card">
      <div class="info-card-strip" style="background:${isIn ? 'var(--green)' : 'var(--red)'}"></div>
      <div class="info-card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="display:flex;align-items:center;gap:8px;min-width:0">
            <span style="width:34px;height:34px;border-radius:9px;background:${isIn ? 'var(--green-l)' : 'var(--red-l)'};color:${isIn ? 'var(--green)' : 'var(--red)'};display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${typeIcons[r.type] || ''}</svg></span>
            <div style="min-width:0">
              <div style="font-weight:800;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.name)}</div>
              <div style="font-size:10.5px;color:var(--muted)">${escapeHtml(freqLabel[r.freq] || r.freq)}</div>
            </div>
          </div>
          ${statusBadge}
        </div>
        <div style="font-size:20px;font-weight:900;color:${isIn ? 'var(--green)' : 'var(--red)'}">${isIn ? '+' : '-'}${fmt(r.amount)}</div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted)">
          <span>${bank ? escapeHtml(bank.name) : '— بدون حساب —'}</span>
          <span>القادم: ${r.next}</span>
        </div>
      </div>
      <div class="info-card-footer">
        <button class="btn btn-xs ${r.isDue ? 'btn-success' : 'btn-outline'}" onclick="applyRecurring(${r.id})" ${!r.isDue ? 'disabled' : ''}>تطبيق</button>
        <button class="btn-icon edit" onclick="editRecurring(${r.id})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn-icon danger" onclick="deleteRecurring(${r.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
      </div>
    </div>`;
  }).join('');
}

export async function saveRecurring() {
  const id = document.getElementById('erec-id').value;
  const name = document.getElementById('erec-name').value.trim();
  const type = document.getElementById('erec-type').value;
  const freq = document.getElementById('erec-freq').value;
  const amount = N2(document.getElementById('erec-amount').value);
  const bankId = +document.getElementById('erec-bank').value || null;
  const start = document.getElementById('erec-start').value || today();
  if (!name || !amount) return alert('أكمل البيانات');
  try {
    if (id) await sbPatch('recurring_transactions', id, { name, type, freq, amount, bank_id: bankId, start_date: start });
    else await sbPost('recurring_transactions', [{ name, type, freq, amount, bank_id: bankId, start_date: start }]);
    closeModal('modal-recurring-add');
    document.getElementById('erec-id').value = '';
    toast('تم الحفظ'); await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

export function editRecurring(id) {
  const r = DB.recurring.find(x => x.id === id);
  if (!r) return;
  document.getElementById('erec-id').value = r.id;
  document.getElementById('erec-name').value = r.name;
  document.getElementById('erec-type').value = r.type;
  document.getElementById('erec-freq').value = r.freq;
  document.getElementById('erec-amount').value = r.amount;
  document.getElementById('erec-start').value = r.start_date;
  const bankSel = document.getElementById('erec-bank');
  if (bankSel) bankSel.value = r.bank_id || '';
  document.getElementById('modal-rec-title').textContent = 'تعديل العملية المتكررة';
  openModal('modal-recurring-add');
}

async function applyRecurringCore(r, next) {
  const bank = DB.banks.find(b => b.id === r.bank_id);
  if (!bank) throw new Error('الحساب غير موجود لعملية: ' + r.name);
  if (r.type === 'سحب' && N2(bank.balance) < N2(r.amount)) throw new Error('الرصيد غير كافٍ لعملية: ' + r.name);
  await sbPost('bank_transactions', [{ bank_id: r.bank_id, type: r.type, amount: r.amount, date: next, notes: r.name + ' (متكرر)', category: 'متكرر' }]);
  await sbPatch('recurring_transactions', r.id, { last_applied: next });
}

export async function applyRecurring(id) {
  const r = DB.recurring.find(x => x.id === id);
  if (!r) return;
  const next = nextRecDate(r);
  if (next > today()) return alert('موعد التطبيق القادم: ' + next);
  if (!r.bank_id) return alert('لا يوجد حساب مرتبط');
  if (!confirm(`تطبيق "${r.name}" بمبلغ ${fmt(r.amount)} بتاريخ ${next}؟`)) return;
  try { await applyRecurringCore(r, next); toast('تم التطبيق'); await reload(); }
  catch (e) { toast('خطأ: ' + e.message, false); }
}

export async function applyAllRecurring() {
  const due = DB.recurring.filter(r => nextRecDate(r) <= today() && r.bank_id);
  if (!due.length) return alert('لا توجد عمليات مستحقة');
  if (!confirm(`تطبيق ${due.length} عملية متكررة؟`)) return;
  let done = 0, failed = [];
  for (const r of due) {
    try { await applyRecurringCore(r, nextRecDate(r)); done++; }
    catch (e) { failed.push(r.name + ': ' + e.message); }
  }
  toast(failed.length ? `تم ${done} من ${due.length} (فشل: ${failed.length})` : `تم ${done} عملية`);
  await reload();
}

export async function deleteRecurring(id) {
  if (!confirm('حذف هذه العملية المتكررة؟')) return;
  try { await sbDel('recurring_transactions', id); toast('تم الحذف'); await reload(); }
  catch (e) { toast('خطأ: ' + e.message, false); }
}
