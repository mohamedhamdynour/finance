// ══════════════════════════════════════════════════════════════════
//  pages/goals.js — الأهداف المالية
// ══════════════════════════════════════════════════════════════════
import { DB, editCtx } from '../../state.js';
import { N2, fmt, pctN, escapeHtml } from '../../core/utils.js';
import { sbPost, sbPatch, sbDel } from '../../core/supabase.js';
import { toast } from '../toast.js';
import { openModal, closeModal } from '../modals.js';
import { calcTotals } from '../../domain/calc.js';

const reload = () => window.loadAll?.();

export function renderGoals() {
  const T = calcTotals();
  if (!DB.goals.length) {
    document.getElementById('goals-list').innerHTML = `<div class="empty-state" style="padding:48px;text-align:center;color:var(--muted)"><p>لا توجد أهداف مالية</p></div>`;
    return;
  }
  const catLabels = { all: 'كل المحفظة', banks: 'البنوك', stocks: 'الأسهم', metals: 'المعادن', certs: 'الشهادات' };
  document.getElementById('goals-list').innerHTML = DB.goals.map(g => {
    let cur = T.grand;
    if (g.category === 'banks') cur = T.totalBanks;
    else if (g.category === 'stocks') cur = T.stocksVal;
    else if (g.category === 'metals') cur = T.metalsVal;
    else if (g.category === 'certs') cur = T.certsTotal;
    const p = Math.min(pctN(cur, g.target), 100);
    const rem = Math.max(0, N2(g.target) - cur);
    const goalColor = p >= 100 ? 'var(--green)' : p >= 70 ? 'var(--teal)' : 'var(--purple)';
    return `<div class="goal-card" style="border-top:3px solid ${goalColor};padding-top:13px">
      <div class="goal-header">
        <div><div class="goal-name">${escapeHtml(g.name)}</div><div class="goal-meta">${escapeHtml(catLabels[g.category] || g.category)}</div></div>
        <div style="text-align:left"><div class="goal-pct">${p.toFixed(1)}%</div><div class="goal-stats">${fmt(cur)} / ${fmt(g.target)}</div></div>
      </div>
      <div class="prog-wrap lg" style="margin-bottom:8px"><div class="prog-bar" style="width:${p}%;background:${goalColor}"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted)">
        <span>${p < 100 ? 'متبقي ' + fmt(rem) : 'تم تحقيق الهدف!'}</span>
        <div style="display:flex;gap:4px">
          <button class="btn-icon edit" onclick="editGoal(${g.id})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn-icon danger" onclick="deleteGoal(${g.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

export async function saveGoal() {
  const name = document.getElementById('egoal-name').value.trim();
  const target = N2(document.getElementById('egoal-target').value);
  const cat = document.getElementById('egoal-cat').value;
  if (!name || !target) return alert('أكمل البيانات');
  try {
    await sbPost('financial_goals', [{ name, target, category: cat }]);
    closeModal('modal-goal-add');
    toast('تم الحفظ'); await reload();
  } catch (e) { toast('خطأ: ' + e.message, false); }
}

export async function deleteGoal(id) {
  if (!confirm('حذف هذا الهدف؟')) return;
  try { await sbDel('financial_goals', id); toast('تم الحذف'); await reload(); }
  catch (e) { toast('خطأ: ' + e.message, false); }
}

export function editGoal(id) {
  const g = DB.goals.find(x => x.id === id);
  if (!g) return;
  editCtx.table = 'financial_goals';
  editCtx.id = id;
  document.getElementById('edit-modal-title').innerHTML = 'تعديل الهدف المالي';
  document.getElementById('edit-modal-body').innerHTML = `
    <div class="form-group"><label class="form-label">اسم الهدف</label><input class="form-control" id="edt-goal-name" value="${escapeHtml(g.name)}"></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">المبلغ المستهدف</label><input class="form-control" type="number" id="edt-goal-target" value="${g.target}"></div>
      <div class="form-group"><label class="form-label">الفئة</label><select class="form-control" id="edt-goal-cat">
        <option value="all" ${g.category === 'all' ? 'selected' : ''}>كل المحفظة</option>
        <option value="banks" ${g.category === 'banks' ? 'selected' : ''}>البنوك</option>
        <option value="stocks" ${g.category === 'stocks' ? 'selected' : ''}>الأسهم</option>
        <option value="metals" ${g.category === 'metals' ? 'selected' : ''}>المعادن</option>
        <option value="certs" ${g.category === 'certs' ? 'selected' : ''}>الشهادات</option>
      </select></div>
    </div>`;
  openModal('modal-edit');
}
