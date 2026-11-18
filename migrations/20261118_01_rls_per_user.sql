-- =====================================================================
-- RLS لكل مستخدم: يضيف user_id لكل جداول public ويستبدل سياسات USING(true)
-- ⚠️ خد نسخة احتياطية أولاً (زر "نسخ" في التطبيق + Supabase Database > Backups).
-- ⚠️ غيّر owner_email تحت لبريدك. الصفوف القديمة هتتنسب لحسابك.
-- ⚠️ لو عندك جداول فيها UNIQUE على عمود واحد (مثل ticker أو currency)، راجع الملاحظة في آخر الملف.
-- آمن لإعادة التشغيل (idempotent).
-- =====================================================================
DO $$
DECLARE
  owner_email constant text := 'PUT_YOUR_EMAIL_HERE';      -- <== غيّرها
  owner_id uuid;
  t record;
  p record;
BEGIN
  SELECT id INTO owner_id FROM auth.users WHERE lower(email) = lower(owner_email);
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد مستخدم بالبريد % — صحّح البريد أو سجّل حسابك أولاً', owner_email;
  END IF;

  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE', t.tablename);
    EXECUTE format('UPDATE public.%I SET user_id = %L WHERE user_id IS NULL', t.tablename, owner_id);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id SET NOT NULL', t.tablename);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (user_id)', t.tablename || '_user_id_idx', t.tablename);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);

    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t.tablename LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t.tablename);
    END LOOP;

    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t.tablename);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t.tablename);
    EXECUTE format($f$CREATE POLICY "owner_all" ON public.%I FOR ALL TO authenticated
                     USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()))$f$, t.tablename);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ملاحظة: لو أي جدول فيه UNIQUE/PRIMARY KEY على عمود لوحده (مثلاً stock_prices.ticker أو
-- exchange_rates.currency أو app_settings.key) وبتستخدم upsert onConflict عليه، فالأفضل
-- تحويله لـ UNIQUE (user_id, <العمود>) وتغيير onConflict في الكود. لمستخدم واحد مش ضروري.
--
-- بعد التشغيل: Authentication > Sign In / Providers > عطّل "Allow new users to sign up".
