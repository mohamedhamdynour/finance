// ══════════════════════════════════════════════════════════════════
//  undo.js — حذف بتأجيل 5 ثوانٍ + زر تراجع
// ══════════════════════════════════════════════════════════════════
import { toast } from './toast.js';
import { sbDel } from '../core/supabase.js';

const reload = () => window.loadAll?.();

export function deleteWithUndo(table, id, label, beforeDelete = null) {
  return new Promise((resolve) => {
    console.log('[undo] حذف مؤجل:', table, id, label);

    toast(`تم حذف "${label}" — يمكنك التراجع`, true, {
      label: '↶ تراجع',
      duration: 5000,
      onClick: async (finalize) => {
        console.log('[undo] onClick:', finalize ? 'FINALIZE (حذف فعلي)' : 'UNDO (إلغاء)');
        if (finalize) {
          try {
            if (beforeDelete) await beforeDelete();
            await sbDel(table, id);
            await reload();
            resolve(true);
          } catch (e) {
            toast('خطأ: ' + e.message, false);
            resolve(false);
          }
        } else {
          toast('تم التراجع ✓', true);
          if (typeof window.renderPage === 'function') window.renderPage();
          resolve(false);
        }
      }
    });
  });
}
