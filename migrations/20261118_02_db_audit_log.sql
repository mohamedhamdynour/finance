-- =====================================================================
-- Audit log على مستوى قاعدة البيانات (لا يمكن تزويره من المتصفح).
-- جدول جديد db_audit_log + trigger عام على كل جداول public. يحتاج تشغيل migration 01 أولاً.
-- لتشغيله على الجداول المستقبلية: أعد تشغيل الجزء الأخير.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.db_audit_log (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL DEFAULT auth.uid(),
  table_name  text NOT NULL,
  row_id      text,
  action      text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS db_audit_log_user_time_idx ON public.db_audit_log (user_id, created_at DESC);

ALTER TABLE public.db_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_read_own" ON public.db_audit_log;
CREATE POLICY "audit_read_own" ON public.db_audit_log FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.db_audit_log FROM anon, authenticated;
GRANT SELECT ON public.db_audit_log TO authenticated;      -- قراءة فقط: لا إدراج ولا تعديل ولا حذف من العميل

CREATE OR REPLACE FUNCTION public.fn_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec jsonb := to_jsonb(COALESCE(NEW, OLD));
BEGIN
  INSERT INTO public.db_audit_log (user_id, table_name, row_id, action, old_data, new_data)
  VALUES (
    COALESCE((rec->>'user_id')::uuid, auth.uid()),
    TG_TABLE_NAME, rec->>'id', TG_OP,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END $$;

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables
           WHERE schemaname = 'public' AND tablename <> 'db_audit_log' LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit ON public.%I', t.tablename);
    EXECUTE format('CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_audit()', t.tablename);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
