<!-- الصق هذه الأقسام في README.md. استبدل قسم "🔐 الأمان" القديم بالكامل. -->

## 🔐 الأمان

| الطبقة | الآلية |
|---|---|
| المصادقة | Supabase Auth (بريد + كلمة مرور) |
| التفويض | Row Level Security لكل جدول: `user_id = auth.uid()` (ملف `migrations/20261118_01_rls_per_user.sql`) |
| التسجيل | **عطّل "Allow new users to sign up"** بعد إنشاء حسابك |
| سجل التغييرات | Triggers على مستوى قاعدة البيانات (`migrations/20261118_02_db_audit_log.sql`) |
| المكتبات | `supabase-js` مثبّتة محلياً في `vendor/` بنسخة محددة |
| `anon key` | عام بالتصميم، والحماية الفعلية هي RLS |
| `service_role key` | ⚠️ لا يوضع في الواجهة أبداً |

> السياسات القديمة `USING (true)` كانت تسمح لأي حساب مسجّل بقراءة كل البيانات. لا تستخدمها.

## 🗄 تشغيل الـ migrations
1. خذ نسخة احتياطية (زر "نسخ" في التطبيق).
2. في Supabase → SQL Editor شغّل بالترتيب: `20261118_01_rls_per_user.sql` ثم `20261118_02_db_audit_log.sql`.
3. قبل الأولى: غيّر `owner_email` لبريدك.

## 🧪 الاختبارات
```bash
node --test tests/*.test.js
```
تُشغَّل تلقائياً عبر GitHub Actions (`.github/workflows/ci.yml`).

## 📄 الترخيص
MIT — انظر ملف `LICENSE`.

<!-- قسم "هيكل المشروع" و"الجداول (15)" يجب تحديثهما من الواقع:
     شغّل: tree -L 2 -I node_modules    وقائمة الجداول: select tablename from pg_tables where schemaname='public'; -->
