# حزمة الإصلاحات — Portfolio Pro (18 Nov 2026)

## ترتيب التطبيق (مهم)
1. **نسخة احتياطية**: زر "نسخ" في التطبيق + Supabase → Database → Backups.
2. انسخ للريبو: `vendor/`, `js/lib/`, `tests/`, `migrations/`, `.github/`, `LICENSE`.
3. عدّل `<head>` حسب `HEAD-SNIPPET.html` (يشيل unpkg ويضيف SRI والخط والـ a11y).
4. في الكود بعد `createClient`: `const sb = withAutoPagination(supabase.createClient(...))` ثم استخدم `sb`.
5. شغّل `node --test tests/*.test.js` محلياً (لازم 17 نجاح).
6. شغّل migration 01 (بعد تغيير `owner_email`) ثم 02 في SQL Editor.
7. اختبر التطبيق: تسجيل دخول، إضافة عملية، قراءة الأرصدة. لو فيه `permission denied` راجع الـ upsert/onConflict (ملاحظة آخر ملف 01).
8. Supabase → Authentication → عطّل "Allow new users to sign up".
9. حدّث `README.md` من `README-PATCH.md`، وقارن `sw.template.js` بـ `sw.js` الحالي قبل الاستبدال.

## الحالة بعد الحزمة
| المشكلة | الحالة |
|---|---|
| unpkg بدون تثبيت/SRI | ✅ اتقفلت (نسخة 2.118.0 محلية + SRI) |
| غياب LICENSE | ✅ اتقفلت (تأكد من اسم صاحب الحقوق) |
| RLS `USING(true)` | ✅ migration جاهز (SQL اتفحص syntax فقط، **لم يُشغَّل على Supabase حقيقي**) |
| قص 1000 صف | ✅ شيم اتختبر على mock بحد 1000 (لكن لازم تستخدم `sb` في كل الاستدعاءات) |
| XIRR/TWR/Real/FX/Cost basis | ✅ مكتبة اتختبرت (XIRR طابق مثال Excel الرسمي). ❌ **لم تُربط بالواجهة**: لا أعرف دوال العرض عندك |
| Audit log على DB | ✅ migration جاهز (جدول جديد: وجّه صفحة "سجل التغييرات" ليقرأ `db_audit_log`) |
| Accessibility | 🟡 حل انتقالي بالـ shim (اتختبر على jsdom). الأمثل تحويل div إلى button |
| الخط وtheme-color | ✅ في HEAD-SNIPPET |
| CI + اختبارات | ✅ workflow جاهز |
| Service Worker بنسخة | 🟡 قالب فقط (لم أرَ sw.js الحالي) |
| README | 🟡 أقسام الأمان/الترخيص جاهزة. قسم الهيكل والجداول يحتاج `tree` من عندك |
| inline `onclick` → event delegation + CSP | ❌ يحتاج `index.html` كامل و`js/` |
| `apple-touch-icon` PNG | ❌ حوّل `icon.svg` لـ PNG 180×180 بنفسك (مش عندي الملف) |
| صحة حسابات الأسهم/المعادن/الزكاة/الضرائب/الأرصدة | ❌ **مستحيل أتأكد بدون `js/`** |
| PR المفتوح | ❌ قرارك |
