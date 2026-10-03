// ══════════════════════════════════════════════════════════════════
//  undo.js — تأجيل الحذف لمدة 5 ثوانٍ (Undo window)
//  بدل ما نمسح من DB فورًا، نخفي الصف محليًا وننتظر
// ══════════════════════════════════════════════════════════════════
import { DB } from '../state.js';
import { toast } from './toast.js';
import { sbDel } from '../core/supabase.js';

const reload = () => window.loadAll?.();

/**
 * حذف بتأجيل + إمكانية Undo
 * @param {string} table - اسم الجدول
 * @param {number} id - رقم السجل
 * @param {string} label - النص المعروض
 * @param {Function} [beforeDelete] - (اختياري) يُنفَّذ بعد التأكيد (مثل حذف bank_transaction مرتبط)
 * @returns {Promise<boolean>} true إذا تم الحذف، false إذا تم التراجع
 */
export function deleteWithUndo(table, id, label, beforeDelete = null) {
  return new Promise((resolve) => {
    toast(`تم حذف "${label}"`, true, {
      label: 'تراجع',
      duration: 5000,
      onClick: async (confirmed) => {
        // confirmed = true → انتهى الوقت بدون ضغط (نفّذ الحذف الفعلي)
        // confirmed = false → ضغط المستخدم "تراجع" (لا تحذف)
        if (confirmed) {
          try {
            if (beforeDelete) await beforeDelete();
            await sbDel(table, id);
            await reload();
            resolve(true);
          } catch (e) {
            toast('خطأ في الحذف: ' + e.message, false);
            resolve(false);
          }
        } else {
          // المستخدم ضغط "تراجع"
          toast('تم التراجع ✓', true);
          // أعد رسم الصفحة (لأننا أخفينا الصف محليًا)
          if (typeof window.renderPage === 'function') window.renderPage();
          resolve(false);
        }
      }
    });
  });
}

/**
 * نسخة بسيطة للجداول: تخفي الصف فورًا من DOM ثم تنتظر
 */
export function hideRowTemporarily(id) {
  const rows = document.querySelectorAll(`[data-row-id="${id}"]`);
  rows.forEach(r => {
    r.dataset.hiddenByUndo = 'true';
    r.style.transition = 'opacity .3s, transform .3s';
    r.style.opacity = '0';
    r.style.transform = 'translateX(-20px)';
    setTimeout(() => { r.style.display = 'none'; }, 300);
  });
}

export function restoreRow(id) {
  const rows = document.querySelectorAll(`[data-row-id="${id}"]`);
  rows.forEach(r => {
    if (r.dataset.hiddenByUndo === 'true') {
      r.style.display = '';
      r.style.opacity = '0';
      r.style.transform = 'translateX(-20px)';
      requestAnimationFrame(() => {
        r.style.opacity = '1';
        r.style.transform = 'translateX(0)';
      });
      delete r.dataset.hiddenByUndo;
    }
  });
}
