// ══════════════════════════════════════════════════════════════════
//  auto-recurring.js — تطبيق تلقائي للعمليات المتكررة المستحقة
//  يُشغَّل مرة واحدة عند فتح التطبيق (بعد login)
// ══════════════════════════════════════════════════════════════════
import { DB, conn } from '../state.js';
import { N2, today } from '../core/utils.js';
import { sbPost, sbPatch } from '../core/supabase.js';
import { nextRecDate } from './calc.js';
import { toast } from '../ui/toast.js';

const LAST_RUN_KEY = 'autoRecurringLastRun';
const reload = () => window.loadAll?.({ silent: true });

/**
 * يطبّق كل العمليات المتكررة المستحقة.
 * @param {boolean} force - تجاهل تخزين "آخر تشغيل" (للتشغيل اليدوي)
 * @returns {Promise<{applied:number, failed:Array, skipped:boolean}>}
 */
export async function autoApplyRecurring(force = false) {
  // تحقق هل نُفّذت اليوم
  const todayStr = today();
  const lastRun = localStorage.getItem(LAST_RUN_KEY);
  if (!force && lastRun === todayStr) {
    return { applied: 0, failed: [], skipped: true };
  }

  // فقط للمستخدم المسجّل
  const uid = conn.authSession?.user?.id;
  if (!uid) return { applied: 0, failed: [], skipped: true };

  // لا نطبق إذا كان الجهاز offline
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { applied: 0, failed: [], skipped: true };
  }

  const due = DB.recurring.filter(r => {
    if (!r.bank_id) return false;
    return nextRecDate(r) <= todayStr;
  });

  if (!due.length) {
    localStorage.setItem(LAST_RUN_KEY, todayStr);
    return { applied: 0, failed: [], skipped: false };
  }

  let applied = 0;
  const failed = [];

  for (const r of due) {
    try {
      await applyOne(r);
      applied++;
    } catch (e) {
      console.warn(`[auto-recurring] فشل تطبيق "${r.name}":`, e.message);
      failed.push({ name: r.name, reason: e.message });
    }
  }

  // سجّل التشغيل
  localStorage.setItem(LAST_RUN_KEY, todayStr);

  // أعد تحميل البيانات (silent) إذا نجح شيء
  if (applied > 0) await reload();

  return { applied, failed, skipped: false };
}

/**
 * يطبّق عملية واحدة فقط.
 */
async function applyOne(r) {
  const bank = DB.banks.find(b => b.id === r.bank_id);
  if (!bank) throw new Error('الحساب البنكي غير موجود');

  let iterations = 0;
  const MAX_ITER = 60; // حد أقصى 60 دفعة (5 سنوات للمتكرر الشهري)

  while (nextRecDate(r) <= today() && iterations < MAX_ITER) {
    if (r.type === 'سحب' && N2(bank.balance) < N2(r.amount)) {
      throw new Error(`الرصيد غير كافٍ بعد ${iterations} دفعة`);
    }

    const next = nextRecDate(r);
    await sbPost('bank_transactions', [{
      bank_id: r.bank_id,
      type: r.type,
      amount: N2(r.amount),
      date: next,
      notes: r.name + ' (تلقائي)',
      category: 'متكرر - تلقائي'
    }]);

    await sbPatch('recurring_transactions', r.id, { last_applied: next });

    // حدّث الكائن محلياً للحلقة التالية
    r.last_applied = next;

    // خصم/إضافة للرصيد المحلي (لأن الـ trigger يُحدّث DB)
    if (r.type === 'سحب') {
      bank.balance = N2(bank.balance) - N2(r.amount);
    } else {
      bank.balance = N2(bank.balance) + N2(r.amount);
    }

    iterations++;
  }
}

/**
 * إظهار إشعار بالنتيجة.
 */
export function notifyAutoRecurringResult(result) {
  if (result.skipped) return;
  if (result.applied === 0 && result.failed.length === 0) return;

  if (result.applied > 0 && result.failed.length === 0) {
    toast(`تم تطبيق ${result.applied} عملية متكررة تلقائياً ✓`, true);
  } else if (result.applied > 0 && result.failed.length > 0) {
    toast(`تم تطبيق ${result.applied} من ${result.applied + result.failed.length} (فشل: ${result.failed.length})`, false);
  } else if (result.failed.length > 0) {
    toast(`تعذّر تطبيق ${result.failed.length} عملية متكررة — تحقق من الأرصدة`, false);
  }
}
