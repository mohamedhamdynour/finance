// ══════════════════════════════════════════════════════════════════
//  toast.js — إشعارات + Undo Action button
// ══════════════════════════════════════════════════════════════════

let _toastTimer = null;

export function toast(msg, ok = true, action = null) {
  const t = document.getElementById('toast');
  if (!t) {
    console[ok ? 'log' : 'warn']('[toast]', msg);
    if (action?.onClick) action.onClick(true);
    return;
  }

  // console log دائمًا للتشخيص
  console.log('[toast]', ok ? '✓' : '✗', msg, action ? '| action=' + action.label : '');

  const icon = t.querySelector('svg');
  const msgEl = document.getElementById('toast-msg');
  if (msgEl) msgEl.textContent = msg;

  // احذف عناصر قديمة
  t.querySelector('.toast-progress')?.remove();
  t.querySelector('.toast-action-btn')?.remove();

  t.className = 'toast show ' + (ok ? 'ok' : 'err');
  if (action) t.classList.add('with-action');

  if (icon) {
    icon.innerHTML = ok
      ? '<polyline points="20 6 9 17 4 12"/>'
      : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
  }

  const duration = action?.duration || (action ? 5000 : 3000);
  let actionTaken = false;

  // زر Undo
  if (action?.label && action.onClick) {
    const btn = document.createElement('button');
    btn.className = 'toast-action-btn';
    btn.textContent = action.label;
    btn.onclick = (e) => {
      e.stopPropagation();
      actionTaken = true;
      clearTimeout(_toastTimer);
      t.classList.remove('show');
      setTimeout(() => {
        try { action.onClick(false); } catch (err) { console.error('undo action:', err); }
      }, 200);
    };
    t.appendChild(btn);

    // Progress bar
    const bar = document.createElement('div');
    bar.className = 'toast-progress';
    bar.style.transition = 'width ' + duration + 'ms linear';
    bar.style.width = '100%';
    t.appendChild(bar);
    requestAnimationFrame(() => { bar.style.width = '0%'; });
  }

  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    t.classList.remove('show');
    if (action?.onClick && !actionTaken) {
      try { action.onClick(true); } catch (err) { console.error('toast finalize:', err); }
    }
  }, duration);
}

export function installToastGlobal() {
  window.toast = toast;
}
