// ══════════════════════════════════════════════════════════════════
//  toast.js — إشعارات عابرة + ربط تلقائي مع handleError
// ══════════════════════════════════════════════════════════════════

let _toastTimer = null;

/**
 * يعرض إشعارًا عابرًا أسفل الشاشة.
 * @param {string} msg - النص
 * @param {boolean} ok - true للنجاح، false للخطأ
 */
export function toast(msg, ok = true) {
  const t = document.getElementById('toast');
  if (!t) {
    // لا يوجد DOM → على الأقل اطبع في الـ console
    console[ok ? 'log' : 'warn']('[toast]', msg);
    return;
  }
  const icon = document.querySelector('.toast svg');
  const msgEl = document.getElementById('toast-msg');
  if (msgEl) msgEl.textContent = msg;

  t.className = 'toast show ' + (ok ? 'ok' : 'err');
  if (icon) {
    icon.innerHTML = ok
      ? '<polyline points="20 6 9 17 4 12"/>'
      : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
  }

  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

/**
 * يربط toast مع window ليتمكن errors.js من استدعائه بدون import.
 * يجب استدعاؤها مرة واحدة في بداية التطبيق.
 */
export function installToastGlobal() {
  window.toast = toast;
}
