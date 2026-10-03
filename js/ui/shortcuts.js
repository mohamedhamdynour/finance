// ══════════════════════════════════════════════════════════════════
//  shortcuts.js — اختصارات لوحة المفاتيح
// ══════════════════════════════════════════════════════════════════
import { UI } from '../state.js';
import { toast } from './toast.js';
import { openGlobalSearch } from './search.js';

// ══════════════════ Install ══════════════════

export function installShortcuts() {
  document.addEventListener('keydown', handleKeydown);
  console.log('[shortcuts] installed — اضغط ? لعرض القائمة');
}

// ══════════════════ Helpers ══════════════════

function isInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

// ══════════════════ Main handler ══════════════════

function handleKeydown(e) {
  const ctrl = e.ctrlKey || e.metaKey;
  const key = (e.key || '').toLowerCase();

  // ─── Esc: أغلق أي modal/panel مفتوح ───
  if (e.key === 'Escape') {
    const openOverlay = document.querySelector('.overlay.open');
    if (openOverlay) {
      e.preventDefault();
      openOverlay.classList.remove('open');
      return;
    }
    const searchOverlay = document.getElementById('global-search-overlay');
    if (searchOverlay) {
      e.preventDefault();
      searchOverlay.remove();
      return;
    }
    const shortcutsHelp = document.getElementById('shortcuts-help');
    if (shortcutsHelp) {
      e.preventDefault();
      shortcutsHelp.remove();
      return;
    }
    const openPanel = document.querySelector('.notif-panel.open');
    if (openPanel) {
      e.preventDefault();
      openPanel.classList.remove('open');
      return;
    }
  }

  // ─── داخل input/textarea: تجاهل باقي الاختصارات (ما عدا Ctrl+K) ───
  if (isInputFocused() && !(ctrl && key === 'k')) return;

  // ─── Ctrl + K: البحث الشامل ───
  if (ctrl && key === 'k') {
    e.preventDefault();
    openGlobalSearch();
    return;
  }

  // ─── Ctrl + S: تحديث البيانات (منع حفظ الصفحة) ───
  if (ctrl && key === 's' && !e.shiftKey) {
    e.preventDefault();
    if (typeof window.loadAll === 'function') {
      window.loadAll();
      toast('تم التحديث');
    }
    return;
  }

  // ─── Ctrl + N: إيداع سريع ───
  if (ctrl && key === 'n') {
    e.preventDefault();
    if (UI.activePage !== 'banks') {
      if (typeof window.nav === 'function') window.nav('banks');
      setTimeout(() => { if (typeof window.openModal === 'function') window.openModal('modal-dep'); }, 250);
    } else {
      if (typeof window.openModal === 'function') window.openModal('modal-dep');
    }
    return;
  }

  // ─── Ctrl + D: لوحة التحكم ───
  if (ctrl && key === 'd' && !e.shiftKey) {
    e.preventDefault();
    if (typeof window.nav === 'function') window.nav('dashboard');
    return;
  }

  // ─── Ctrl + B: الحسابات البنكية ───
  if (ctrl && key === 'b' && !e.shiftKey) {
    e.preventDefault();
    if (typeof window.nav === 'function') window.nav('banks');
    return;
  }

  // ─── Ctrl + Shift + S: صفحة الأسهم ───
  if (ctrl && e.shiftKey && key === 's') {
    e.preventDefault();
    if (typeof window.nav === 'function') window.nav('stocks');
    return;
  }

  // ─── Ctrl + Shift + M: صفحة المعادن ───
  if (ctrl && e.shiftKey && key === 'm') {
    e.preventDefault();
    if (typeof window.nav === 'function') window.nav('metals');
    return;
  }

  // ─── Ctrl + Shift + C: الشهادات ───
  if (ctrl && e.shiftKey && key === 'c') {
    e.preventDefault();
    if (typeof window.nav === 'function') window.nav('certs');
    return;
  }

  // ─── Ctrl + Shift + D: الديون ───
  if (ctrl && e.shiftKey && key === 'd') {
    e.preventDefault();
    if (typeof window.nav === 'function') window.nav('debts');
    return;
  }

  // ─── Ctrl + Shift + R: صفحة التقارير ───
  if (ctrl && e.shiftKey && key === 'r') {
    e.preventDefault();
    if (typeof window.nav === 'function') window.nav('reports');
    return;
  }

  // ─── Ctrl + Shift + Z: صفحة الزكاة ───
  if (ctrl && e.shiftKey && key === 'z') {
    e.preventDefault();
    if (typeof window.nav === 'function') window.nav('zakat');
    return;
  }

  // ─── Ctrl + , : الإعدادات ───
  if (ctrl && (e.key === ',' || key === ',')) {
    e.preventDefault();
    if (typeof window.nav === 'function') window.nav('settings');
    return;
  }

  // ─── Ctrl + L: تسجيل الخروج ───
  if (ctrl && key === 'l') {
    e.preventDefault();
    if (typeof window.doLogout === 'function') window.doLogout();
    return;
  }

  // ─── Ctrl + / : الوضع الليلي ───
  if (ctrl && e.key === '/') {
    e.preventDefault();
    if (typeof window.toggleDark === 'function') window.toggleDark();
    return;
  }

  // ─── ? : قائمة الاختصارات ───
  if (e.key === '?' || (e.shiftKey && e.key === '/')) {
    e.preventDefault();
    showShortcutsHelp();
    return;
  }
}

// ══════════════════ نافذة قائمة الاختصارات ══════════════════

export function showShortcutsHelp() {
  // إزالة إن كانت مفتوحة
  const existing = document.getElementById('shortcuts-help');
  if (existing) { existing.remove(); return; }

  const sections = [
    {
      title: 'التنقل السريع',
      items: [
        ['Ctrl + D', 'لوحة التحكم'],
        ['Ctrl + B', 'الحسابات البنكية'],
        ['Ctrl + Shift + S', 'الأسهم والصناديق'],
        ['Ctrl + Shift + M', 'المعادن الثمينة'],
        ['Ctrl + Shift + C', 'الشهادات الادخارية'],
        ['Ctrl + Shift + D', 'الديون والالتزامات'],
        ['Ctrl + Shift + R', 'التقارير والتحليل'],
        ['Ctrl + Shift + Z', 'الزكاة'],
        ['Ctrl + ,', 'الإعدادات'],
      ]
    },
    {
      title: 'العمليات السريعة',
      items: [
        ['Ctrl + K', 'البحث الشامل'],
        ['Ctrl + N', 'إيداع سريع'],
        ['Ctrl + S', 'تحديث البيانات'],
      ]
    },
    {
      title: 'عام',
      items: [
        ['Ctrl + /', 'تبديل الوضع الليلي/النهاري'],
        ['Ctrl + L', 'تسجيل الخروج'],
        ['Esc', 'إغلاق النافذة الحالية'],
        ['?', 'عرض هذه القائمة'],
      ]
    }
  ];

  const overlay = document.createElement('div');
  overlay.id = 'shortcuts-help';
  overlay.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(7,12,24,.65);
    z-index: 100000;
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    backdrop-filter: blur(6px);
    animation: fadeUp .15s ease;
  `;

  overlay.innerHTML = `
    <div style="
      background: var(--surface);
      border-radius: 18px;
      padding: 26px 24px;
      max-width: 560px;
      width: 100%;
      max-height: 88vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,.5);
      border: .5px solid var(--border);
      animation: modalIn .2s ease;
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:10px;background:var(--blue-l);color:var(--blue);display:flex;align-items:center;justify-content:center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <line x1="6" y1="8" x2="6" y2="8"/><line x1="10" y1="8" x2="10" y2="8"/>
              <line x1="14" y1="8" x2="14" y2="8"/><line x1="18" y1="8" x2="18" y2="8"/>
              <line x1="6" y1="12" x2="6" y2="12"/><line x1="10" y1="12" x2="10" y2="12"/>
              <line x1="14" y1="12" x2="14" y2="12"/><line x1="18" y1="12" x2="18" y2="12"/>
              <line x1="8" y1="16" x2="16" y2="16"/>
            </svg>
          </div>
          <div>
            <div style="font-size:16px;font-weight:900;color:var(--text)">اختصارات لوحة المفاتيح</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">وفّر وقتك في التنقل والعمليات</div>
          </div>
        </div>
        <button onclick="document.getElementById('shortcuts-help').remove()" 
                style="background:transparent;border:none;cursor:pointer;color:var(--muted);padding:6px;font-size:22px;line-height:1;border-radius:8px;transition:.15s;font-family:inherit"
                onmouseover="this.style.background='var(--surface2)'"
                onmouseout="this.style.background='transparent'">×</button>
      </div>

      ${sections.map(sec => `
        <div style="margin-bottom:20px">
          <div style="font-size:10.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">${sec.title}</div>
          <div style="display:flex;flex-direction:column;gap:4px">
            ${sec.items.map(([k, v]) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:var(--surface2);border-radius:8px">
                <span style="font-size:12.5px;font-weight:700;color:var(--text)">${v}</span>
                <kbd style="background:var(--surface);border:.5px solid var(--border2);border-radius:6px;padding:5px 10px;font-family:'SF Mono','Courier New',monospace;font-size:11px;font-weight:700;color:var(--text);direction:ltr;min-width:110px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,.05)">${k}</kbd>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}

      <div style="margin-top:12px;padding-top:14px;border-top:.5px solid var(--border);font-size:11px;color:var(--muted);text-align:center">
        اضغط <kbd style="background:var(--surface2);border:.5px solid var(--border2);border-radius:4px;padding:2px 6px;font-family:monospace;font-size:10.5px">?</kbd> في أي وقت لعرض هذه القائمة
      </div>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}
