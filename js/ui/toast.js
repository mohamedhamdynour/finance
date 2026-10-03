// ══════════════════════════════════════════════════════════════════
//  toast.js — إشعارات + Action button (Undo) + progress bar
// ══════════════════════════════════════════════════════════════════

let _toastTimer = null;
let _currentAction = null;

/**
 * يعرض إشعارًا عابرًا.
 * @param {string} msg - النص
 * @param {boolean} ok - نجاح/خطأ
 * @param {{label:string, onClick:Function, duration?:number}} [action]
 *        إجراء اختياري (زر + callback + مدة)
 */
export function toast(msg, ok = true, action = null) {
  const t = document.getElementById('toast');
  if (!t) {
    console[ok ? 'log' : 'warn']('[toast]', msg);
    if (action?.onClick) action.onClick(true);
    return;
  }

  const icon = t.querySelector('svg');
  const msgEl = document.getElementById('toast-msg');
  if (msgEl) msgEl.textContent = msg;

  // احذف أي progress bar قديم
  t.querySelector('.toast-progress')?.remove();

  // التصنيف
  t.className = 'toast show ' + (ok ? 'ok' : 'err');

  // الأيقونة
  if (icon) {
    icon.innerHTML = ok
      ? '<polyline points="20 6 9 17 4 12"/>'
      : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
  }

  // احذف أي زر قديم
  t.querySelector('.toast-action-btn')?.remove();
  _currentAction = null;

  // زر Undo إن وُجد
  const duration = action?.duration || 5000;
  if (action?.label && action.onClick) {
    t.classList.add('with-action');
    const btn = document.createElement('button');
    btn.className = 'toast-action-btn';
    btn.textContent = action.label;
    btn.onclick = (e) => {
      e.stopPropagation();
      clearTimeout(_toastTimer);
      t.classList.remove('show');
      try { action.onClick(false); } catch (err) { console.error('undo action:', err); }
    };
    t.appendChild(btn);

    // Progress bar
    const bar = document.createElement('div');
    bar.className = 'toast-progress';
    bar.style.width = '100%';
    t.appendChild(bar);
    setTimeout(() => { bar.style.width = '0%'; }, 10);
  } else {
    t.classList.remove('with-action');
  }

  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    t.classList.remove('show');
    // إذا لم يُضغط زر Undo، نفّذ action.onClick(true) (= "أكّد الحذف")
    if (action?.onClick && _currentAction !== 'clicked') {
      try { action.onClick(true); } catch (err) { console.error('toast finalize:', err); }
    }
    _currentAction = null;
  }, duration);
}

export function installToastGlobal() {
  window.toast = toast;
}
