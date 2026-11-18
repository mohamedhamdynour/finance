/**
 * a11y.js — يصلّح إمكانية الوصول (Accessibility) بدون تعديل كل HTML يدوياً.
 * أضفه في آخر <body>: <script src="js/lib/a11y.js" defer></script>
 * يعالج: div/span بـ onclick (لوحة مفاتيح + role)، أزرار أيقونة بدون اسم، حقول بدون label،
 * رسائل الخطأ (aria-live)، ورابط الصفحة النشطة (aria-current). ويراقب العناصر المرسومة ديناميكياً.
 * ⚠️ حل انتقالي. الحل الأمثل: استبدل div الـ onclick بـ <button> فعلياً.
 */
(function () {
  'use strict';
  const NATIVE = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/;

  function fixClickable(el) {
    if (NATIVE.test(el.tagName) || el.dataset.a11y) return;
    el.dataset.a11y = '1';
    if (!el.hasAttribute('role')) el.setAttribute('role', el.classList.contains('tab') || el.classList.contains('auth-tabs') ? 'tab' : 'button');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    el.addEventListener('keydown', function (e) {
      if (e.target !== el) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); el.click(); }
    });
  }

  function fixName(el) {
    if (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) return;
    const text = (el.textContent || '').trim();
    const title = el.getAttribute('title');
    if (!text && title) {
      el.setAttribute('aria-label', title);
      el.querySelectorAll('svg').forEach((s) => s.setAttribute('aria-hidden', 'true'));
    }
  }

  function fixField(el) {
    if (el.type === 'hidden' || el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) return;
    if (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) return;
    if (el.closest('label')) return;
    const name = el.getAttribute('placeholder') || el.getAttribute('title');
    if (name) el.setAttribute('aria-label', name);
  }

  function fixErrors(root) {
    root.querySelectorAll('.auth-error, [id$="-error"]').forEach((el) => {
      if (!el.hasAttribute('role')) { el.setAttribute('role', 'alert'); el.setAttribute('aria-live', 'polite'); }
    });
  }

  function fixCurrent(root) {
    root.querySelectorAll('.nav-item').forEach((el) => {
      if (el.classList.contains('active')) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
  }

  function scan(root) {
    root = root && root.querySelectorAll ? root : document;
    root.querySelectorAll('[onclick]').forEach(fixClickable);
    if (root !== document && root.hasAttribute && root.hasAttribute('onclick')) fixClickable(root);
    root.querySelectorAll('button, [role="button"]').forEach(fixName);
    root.querySelectorAll('input, select, textarea').forEach(fixField);
    fixErrors(root);
    fixCurrent(document);
  }

  let queued = false;
  function schedule() {
    if (queued) return; queued = true;
    (window.requestAnimationFrame || setTimeout)(function () { queued = false; scan(document); });
  }

  function init() {
    scan(document);
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { scan };
})();
