const FRIENDLY = {
  '23505': 'هذا السجل موجود بالفعل (تكرار)',
  '23503': 'مرجع غير موجود (Foreign key)',
  '23514': 'قيمة غير مسموح بها (Constraint)',
  'PGRST116': 'لا يوجد سجل مطابق',
  'PGRST204': 'عمود غير موجود في قاعدة البيانات — حدّث الـ schema',
  'auth/invalid-credential': 'بيانات الدخول غير صحيحة',
  'auth/email-already-in-use': 'البريد مسجَّل مسبقًا',
};

export function friendlyError(e) {
  if (!e) return 'حدث خطأ غير معروف';
  const code = e.code || '';
  if (FRIENDLY[code]) return FRIENDLY[code];
  // PostgREST errors
  if (e.message) {
    if (e.message.includes('duplicate key')) return 'السجل موجود بالفعل';
    if (e.message.includes('violates foreign key')) return 'مرجع غير موجود';
    if (e.message.includes('violates check constraint')) return 'القيمة غير مسموح بها';
    if (e.message.includes('JWT expired')) return 'انتهت الجلسة — أعد تسجيل الدخول';
    return e.message.slice(0, 200);
  }
  return 'حدث خطأ غير متوقع';
}

export function handleError(e, context = '') {
  console.error(`[${context}]`, e);
  if (window.Sentry && process.env.NODE_ENV === 'production') {
    window.Sentry.captureException(e, { tags: { context } });
  }
  const msg = friendlyError(e);
  if (window.toast) window.toast(msg, false);
  return msg;
}
