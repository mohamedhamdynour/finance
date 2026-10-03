// ══════════════════════════════════════════════════════════════════
//  notifications.js — لوحة الإشعارات (Bell + Panel)
// ══════════════════════════════════════════════════════════════════
import { DB } from '../state.js';
import { N2, baseCur, escapeHtml, today } from '../core/utils.js';
import { calcTotals, nextRecDate } from '../domain/calc.js';

export function buildNotifications() {
  const notes = [];
  const now = new Date();
  const T = calcTotals();

  DB.certs.forEach(c => {
    const mat = new Date(c.maturity_date);
    const days = Math.ceil((mat - now) / 86400000);
    if (days < 0) notes.push({ type: 'danger', icon: 'alert-circle', title: 'شهادة منتهية', body: `${escapeHtml(c.name)} انتهت منذ ${Math.abs(days)} يوم` });
    else if (days <= 30) notes.push({ type: 'warn', icon: 'clock', title: 'شهادة قريبة الاستحقاق', body: `${escapeHtml(c.name)} تستحق خلال ${days} يوم` });
    const rem = Math.max(0, +c.total_interest - (+c.interest_paid));
    if (rem / Math.max(1, +c.total_interest) > 0.8 && days > 0) notes.push({ type: 'info', icon: 'dollar-sign', title: 'عائد شهادة مستحق', body: `${escapeHtml(c.name)}: عائد متبقي ${rem.toFixed(0)} ${baseCur()}` });
  });

  DB.banks.filter(b => +b.min_balance > 0 && +b.balance < +b.min_balance).forEach(b => {
    notes.push({ type: 'warn', icon: 'credit-card', title: 'رصيد منخفض', body: `${escapeHtml(b.name)}: الرصيد ${b.balance} أقل من الحد الأدنى ${b.min_balance}` });
  });

  DB.debts.filter(d => d.due_date && new Date(d.due_date) < now && +d.remaining > 0).forEach(d => {
    const daysLate = Math.ceil((now - new Date(d.due_date)) / 86400000);
    notes.push({ type: 'danger', icon: 'alert-triangle', title: 'دين/التزام متأخر', body: `${escapeHtml(d.name)}: متأخر ${daysLate} يوم | متبقي ${(+d.remaining).toFixed(0)} ${baseCur()}` });
  });

  DB.debts.filter(d => d.due_date && +d.remaining > 0).forEach(d => {
    const days = Math.ceil((new Date(d.due_date) - now) / 86400000);
    if (days > 0 && days <= 30) notes.push({ type: 'warn', icon: 'calendar', title: 'موعد سداد قريب', body: `${escapeHtml(d.name)}: يستحق خلال ${days} يوم` });
  });

  DB.recurring.filter(r => nextRecDate(r) <= today()).forEach(r => {
    notes.push({ type: 'info', icon: 'refresh-cw', title: 'عملية متكررة مستحقة', body: `${escapeHtml(r.name)} (${escapeHtml(r.type)}) بقيمة ${r.amount} ${baseCur()}` });
  });

  const { pnlStocks, pnlMetals, stocksCost, metalsCost } = T;
  if (stocksCost > 0 && pnlStocks / stocksCost < -0.15) notes.push({ type: 'warn', icon: 'trending-down', title: 'خسارة في الأسهم', body: `خسارة ${(pnlStocks / stocksCost * 100).toFixed(1)}%` });
  if (metalsCost > 0 && pnlMetals / metalsCost < -0.10) notes.push({ type: 'warn', icon: 'trending-down', title: 'خسارة في المعادن', body: `خسارة ${(pnlMetals / metalsCost * 100).toFixed(1)}%` });
  return notes;
}

export function updateNotificationBell() {
  const notes = buildNotifications();
  const bell = document.getElementById('notif-bell');
  const badge = document.getElementById('notif-badge');
  if (!bell) return;
  if (notes.length > 0) {
    badge.style.display = 'flex';
    badge.textContent = notes.length > 9 ? '9+' : notes.length;
    badge.style.background = notes.some(n => n.type === 'danger') ? 'var(--red)' : 'var(--gold)';
  } else badge.style.display = 'none';
}

export function toggleNotifications() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  document.querySelectorAll('.notif-panel').forEach(p => p.classList.remove('open'));
  if (!isOpen) { panel.classList.add('open'); renderNotifications(); }
}

const ICON_PATHS = {
  'alert-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'dollar-sign': '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
  'credit-card': '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  'alert-triangle': '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  'calendar': '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  'refresh-cw': '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>',
  'trending-down': '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>'
};

export function renderNotifications() {
  const notes = buildNotifications();
  const container = document.getElementById('notif-list');
  if (!container) return;
  const colors = { danger: 'var(--red)', warn: 'var(--gold)', info: 'var(--blue)' };
  const bgs = { danger: 'var(--red-l)', warn: 'var(--gold-l)', info: 'var(--blue-l)' };
  container.innerHTML = notes.length
    ? notes.map(n => `<div style="display:flex;gap:10px;padding:10px 14px;border-bottom:.5px solid var(--border);align-items:flex-start">
        <div style="width:30px;height:30px;border-radius:8px;background:${bgs[n.type]};color:${colors[n.type]};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[n.icon] || ''}</svg>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:800;color:${colors[n.type]};margin-bottom:2px">${n.title}</div>
          <div style="font-size:11px;color:var(--muted);line-height:1.4">${n.body}</div>
        </div>
      </div>`).join('')
    : `<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">لا توجد تنبيهات حالياً</div>`;
}

// إغلاق اللوحة عند النقر خارجها
document.addEventListener('click', e => {
  const panel = document.getElementById('notif-panel');
  const bell = document.getElementById('notif-bell');
  if (panel && bell && !panel.contains(e.target) && !bell.contains(e.target)) panel.classList.remove('open');
});
