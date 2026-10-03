// ══════════════════════════════════════════════════════════════════
//  errors.js — معالجة أخطاء موحّدة
// ══════════════════════════════════════════════════════════════════

// ترجمة أكواد PostgREST وSupabase Auth إلى رسائل عربية
const FRIENDLY_ERRORS = {
  // Postgres
  '23505': 'هذا السجل موجود بالفعل (تكرار)',
  '23503': 'مرجع غير موجود (Foreign key)',
  '23514': 'قيمة غير مسموح بها (Constraint)',
  '23502': 'حقل مطلوب مفقود',
  // PostgREST
  'PGRST116': 'لا يوجد سجل مطابق',
  'PGRST204': 'عمود غير موجود في قاعدة البيانات — حدّث الـ schema',
  'PGRST301': 'انتهت الجلسة أو غير مُصرَّح',
  // Supabase Auth
  'auth/invalid-credential': 'بيانات الدخول غير صحيحة',
  'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة',
  'auth/user-not-found': 'لا يوجد حساب بهذا البريد',
  'auth/wrong-password': 'كلمة المرور غير صحيحة',
  'auth/email-already-in-use': 'البريد مسجَّل مسبقًا',
  'auth/weak-password': 'كلمة المرور ضعيفة (6 أحرف على الأقل)',
  'auth/too-many-requests': 'محاولات كثيرة — انتظر قليلاً',
  'auth/network-request-failed': 'تعذّر الاتصال — تحقق من الإنترنت',
};

/**
 * يحوّل أي خطأ إلى رسالة عربية مفيدة للمستخدم.
 * @param {Error|object} e - الخطأ
 * @returns {string}
 */
export function friendlyError(e) {
  if (!e) return 'حدث خطأ غير معروف';
  if (typeof e === 'string') return e;

  // كود مباشر
  const code = e.code || e.error?.code || '';
  if (FRIENDLY_ERRORS[code]) return FRIENDLY_ERRORS[code];

  // رسالة نصية من PostgREST/Supabase
  const msg = e.message || e.error?.message || '';
  if (msg) {
    if (/duplicate key/i.test(msg)) return 'السجل موجود بالفعل';
    if (/violates foreign key/i.test(msg)) return 'مرجع غير موجود';
    if (/violates check constraint/i.test(msg)) return 'القيمة غير مسموح بها';
    if (/violates not-null/i.test(msg)) return 'حقل مطلوب مفقود';
    if (/JWT expired|invalid JWT/i.test(msg)) return 'انتهت الجلسة — أعد تسجيل الدخول';
    if (/password/i.test(msg) && /invalid/i.test(msg)) return 'بيانات الدخول غير صحيحة';
    if (/email/i.test(msg) && /already/i.test(msg)) return 'البريد مسجَّل مسبقًا';
    if (/rate limit/i.test(msg)) return 'محاولات كثيرة — انتظر قليلاً';
    if (/network|fetch/i.test(msg)) return 'تعذّر الاتصال بالشبكة';
    // احتفظ بالرسالة (مقتطعة) لتفيد في التشخيص
    return msg.slice(0, 200);
  }

  return 'حدث خطأ غير متوقع';
}

/**
 * يعالج الخطأ: يسجّله في الـ console + يترجمه + يعرضه للمستخدم.
 * @param {Error|object} e
 * @param {string} context - اسم الدالة/العملية (للتسجيل)
 * @returns {string} الرسالة العربية
 */
export function handleError(e, context = '') {
  console.error(`[${context}]`, e);

  // إرسال إلى Sentry إن وُجد لاحقًا
  if (typeof window !== 'undefined' && window.Sentry && window.__ENV__ === 'production') {
    try { window.Sentry.captureException(e, { tags: { context } }); } catch (_) {}
  }

  const msg = friendlyError(e);

  // استدعاء toast إن كان متاحًا (سيُستورد لاحقًا بدون dependency مباشر)
  if (typeof window !== 'undefined' && typeof window.toast === 'function') {
    window.toast(msg, false);
  }

  return msg;
}
