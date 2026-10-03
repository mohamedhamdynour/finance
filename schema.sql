-- ══════════════════════════════════════════════════════════════════════
--  محفظة مالية — Schema v2 (Multi-user + Triggers + Soft Delete + Audit)
--  Supabase / PostgreSQL
--  ⚠️ يحذف كل الجداول القديمة ويعيد البناء. للبيانات التجريبية فقط.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 0) تنظيف ───────────────────────────────────────────────────────
drop view  if exists v_bank_balances cascade;
drop table if exists audit_log              cascade;
drop table if exists debt_payments          cascade;
drop table if exists debts                  cascade;
drop table if exists recurring_transactions cascade;
drop table if exists dividends              cascade;
drop table if exists certificates           cascade;
drop table if exists metal_prices           cascade;
drop table if exists metal_transactions     cascade;
drop table if exists stock_prices           cascade;
drop table if exists stock_transactions     cascade;
drop table if exists bank_transactions      cascade;
drop table if exists banks                  cascade;
drop table if exists exchange_rates         cascade;
drop table if exists portfolio_snapshots    cascade;
drop table if exists financial_goals        cascade;
drop table if exists app_settings           cascade;

-- ─── 1) دوال مساعدة ─────────────────────────────────────────────────

-- 1a) تحديث updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- 1b) Soft delete: DELETE → UPDATE deleted_at
create or replace function soft_delete_row()
returns trigger language plpgsql as $$
begin
  execute format('update %I set deleted_at = now() where id = $1', TG_TABLE_NAME)
    using old.id;
  return null;
end; $$;

-- 1c) Cascade soft delete: عند أرشفة بنك، أرشِف حركاته
create or replace function cascade_soft_delete_bank()
returns trigger language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update bank_transactions set deleted_at = new.deleted_at
      where bank_id = new.id and deleted_at is null;
  end if;
  return new;
end; $$;

-- 1d) إعادة حساب أرصدة بنك (bulk UPDATE بـ window function)
create or replace function recompute_bank(p_bank_id bigint)
returns void
language plpgsql security definer as $$
declare
  v_running numeric := 0;
begin
  with running as (
    select id,
           sum(case when type in ('إيداع','تحويل وارد','رصيد افتتاحي','عائد شهادة','أرباح')
                    then amount else -amount end)
             over (order by date asc, id asc
                   rows between unbounded preceding and current row) as bal
      from bank_transactions
     where bank_id = p_bank_id and deleted_at is null
  )
  update bank_transactions bt
     set balance_after = r.bal
    from running r
   where bt.id = r.id and bt.balance_after is distinct from r.bal;

  select coalesce(sum(case when type in ('إيداع','تحويل وارد','رصيد افتتاحي','عائد شهادة','أرباح')
                           then amount else -amount end), 0)
    into v_running
    from bank_transactions
   where bank_id = p_bank_id and deleted_at is null;

  update banks set balance = v_running where id = p_bank_id;
end; $$;

-- 1e) Trigger: بعد أي تغيير في bank_transactions، أعد حساب البنك
create or replace function trg_recompute_bank()
returns trigger language plpgsql as $$
begin
  if current_setting('app.recomputing', true) = 'on' then
    return coalesce(new, old);
  end if;
  perform set_config('app.recomputing', 'on', true);

  if tg_op = 'DELETE' then
    perform recompute_bank(old.bank_id);
  elsif tg_op = 'UPDATE' and old.bank_id is distinct from new.bank_id then
    perform recompute_bank(old.bank_id);
    perform recompute_bank(new.bank_id);
  else
    perform recompute_bank(new.bank_id);
  end if;

  perform set_config('app.recomputing', 'off', true);
  return coalesce(new, old);
end; $$;

-- ─── 2) banks ────────────────────────────────────────────────────────
create table banks (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null,
  bank_code    text,
  account_no   text,
  type         text not null default 'جاري'
                 check (type in ('جاري','توفير','استثماري','بورصة','كاش')),
  currency     text not null default 'EGP' check (length(currency) between 2 and 5),
  balance      numeric(18,4) not null default 0,
  min_balance  numeric(18,4) not null default 0 check (min_balance >= 0),
  color        text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  notes        text,
  is_active    boolean not null default true,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_banks_user   on banks(user_id) where deleted_at is null;
create index idx_banks_active on banks(user_id, is_active) where deleted_at is null;
create trigger trg_banks_updated before update on banks
  for each row execute function set_updated_at();
create trigger trg_banks_softdel before delete on banks
  for each row execute function soft_delete_row();
create trigger trg_banks_cascade after update on banks
  for each row when (new.deleted_at is not null and old.deleted_at is null)
  execute function cascade_soft_delete_bank();

-- ─── 3) bank_transactions ────────────────────────────────────────────
create table bank_transactions (
  id                 bigint generated always as identity primary key,
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bank_id            bigint not null references banks(id) on delete cascade,
  type               text not null check (type in
                       ('إيداع','سحب','تحويل وارد','تحويل صادر',
                        'رصيد افتتاحي','عائد شهادة','أرباح')),
  amount             numeric(18,4) not null check (amount > 0),
  balance_after      numeric(18,4),
  date               date not null default current_date,
  notes              text,
  category           text,
  linked_transfer_id bigint references bank_transactions(id) on delete set null,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now()
);
create index idx_btxn_user_bank on bank_transactions(user_id, bank_id) where deleted_at is null;
create index idx_btxn_date      on bank_transactions(user_id, date desc) where deleted_at is null;
create index idx_btxn_linked    on bank_transactions(linked_transfer_id) where linked_transfer_id is not null;
create trigger trg_btxn_recompute after insert or update or delete on bank_transactions
  for each row execute function trg_recompute_bank();

-- ─── 4) stock_transactions ───────────────────────────────────────────
create table stock_transactions (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bank_id             bigint references banks(id) on delete set null,
  bank_transaction_id bigint references bank_transactions(id) on delete set null,
  type                text not null check (type in ('شراء','بيع')),
  symbol              text not null check (length(symbol) between 1 and 20),
  name                text,
  sec_type            text default 'سهم',
  market              text default 'EGX',
  price_currency      text default 'EGP',
  quantity            numeric(18,4) not null check (quantity > 0),
  price               numeric(18,4) not null default 0 check (price >= 0),
  total               numeric(18,4) not null default 0,
  commission          numeric(18,4) not null default 0 check (commission >= 0),
  commission_fixed    numeric(18,4) not null default 0 check (commission_fixed >= 0),
  net                 numeric(18,4) not null default 0,
  profit              numeric(18,4),
  date                date not null default current_date,
  notes               text,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now()
);
create index idx_stxn_user      on stock_transactions(user_id) where deleted_at is null;
create index idx_stxn_user_sym  on stock_transactions(user_id, symbol) where deleted_at is null;
create index idx_stxn_user_date on stock_transactions(user_id, date desc) where deleted_at is null;
create index idx_stxn_bank      on stock_transactions(bank_id) where bank_id is not null;
create trigger trg_stxn_softdel before delete on stock_transactions
  for each row execute function soft_delete_row();

-- ─── 5) stock_prices (PK مركّب) ──────────────────────────────────────
create table stock_prices (
  symbol        text not null,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text,
  sec_type      text,
  current_price numeric(18,4) not null default 0 check (current_price >= 0),
  updated_at    timestamptz not null default now(),
  primary key (symbol, user_id)
);
create trigger trg_sprices_updated before update on stock_prices
  for each row execute function set_updated_at();

-- ─── 6) metal_transactions ───────────────────────────────────────────
create table metal_transactions (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bank_id             bigint references banks(id) on delete set null,
  bank_transaction_id bigint references bank_transactions(id) on delete set null,
  op                  text not null check (op in ('شراء','بيع')),
  metal_type          text not null,
  currency            text default 'EGP',
  weight              numeric(18,4) not null check (weight > 0),
  price_per_gram      numeric(18,4) not null check (price_per_gram >= 0),
  total               numeric(18,4) not null default 0,
  manufacturing       numeric(18,4) not null default 0 check (manufacturing >= 0),
  commission_fixed    numeric(18,4) not null default 0 check (commission_fixed >= 0),
  cashback            numeric(18,4) not null default 0 check (cashback >= 0),
  net                 numeric(18,4) not null default 0,
  date                date not null default current_date,
  notes               text,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now()
);
create index idx_mtxn_user      on metal_transactions(user_id) where deleted_at is null;
create index idx_mtxn_user_type on metal_transactions(user_id, metal_type) where deleted_at is null;
create index idx_mtxn_user_date on metal_transactions(user_id, date desc) where deleted_at is null;
create trigger trg_mtxn_softdel before delete on metal_transactions
  for each row execute function soft_delete_row();

-- ─── 7) metal_prices (PK مركّب) ─────────────────────────────────────
create table metal_prices (
  metal_type     text not null,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  price_per_gram numeric(18,4) not null default 0 check (price_per_gram >= 0),
  updated_at     timestamptz not null default now(),
  primary key (metal_type, user_id)
);
create trigger trg_mprices_updated before update on metal_prices
  for each row execute function set_updated_at();

-- ─── 8) certificates ─────────────────────────────────────────────────
create table certificates (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bank_id             bigint references banks(id) on delete set null,
  bank_transaction_id bigint references bank_transactions(id) on delete set null,
  name                text not null,
  bank_name           text,
  amount              numeric(18,4) not null check (amount > 0),
  currency            text default 'EGP',
  rate                numeric(9,4) not null check (rate >= 0 and rate <= 100),
  duration            numeric(6,2) not null default 1 check (duration > 0),
  issued_date         date not null,
  maturity_date       date not null,
  payout_type         text not null default 'سنوي'
                        check (payout_type in ('سنوي','شهري','أسبوعي','يومي')),
  total_interest      numeric(18,4) not null default 0,
  interest_paid       numeric(18,4) not null default 0 check (interest_paid >= 0),
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  constraint certs_maturity_after_issue check (maturity_date > issued_date)
);
create index idx_certs_user     on certificates(user_id) where deleted_at is null;
create index idx_certs_maturity on certificates(user_id, maturity_date) where deleted_at is null;
create trigger trg_certs_softdel before delete on certificates
  for each row execute function soft_delete_row();

-- ─── 9) dividends ────────────────────────────────────────────────────
create table dividends (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symbol              text not null,
  amount              numeric(18,4) not null check (amount > 0),
  date                date not null default current_date,
  bank_id             bigint references banks(id) on delete set null,
  bank_transaction_id bigint references bank_transactions(id) on delete set null,
  notes               text,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now()
);
create index idx_div_user on dividends(user_id) where deleted_at is null;
create trigger trg_div_softdel before delete on dividends
  for each row execute function soft_delete_row();

-- ─── 10) recurring_transactions ──────────────────────────────────────
create table recurring_transactions (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null,
  type         text not null check (type in ('إيداع','سحب')),
  freq         text not null default 'monthly' check (freq in ('weekly','monthly','yearly')),
  amount       numeric(18,4) not null check (amount > 0),
  bank_id      bigint references banks(id) on delete set null,
  start_date   date not null default current_date,
  last_applied date,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index idx_rec_user on recurring_transactions(user_id) where deleted_at is null;
create trigger trg_rec_softdel before delete on recurring_transactions
  for each row execute function soft_delete_row();

-- ─── 11) financial_goals ─────────────────────────────────────────────
create table financial_goals (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  target     numeric(18,4) not null check (target > 0),
  category   text not null default 'all'
               check (category in ('all','banks','stocks','metals','certs')),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_goals_user on financial_goals(user_id) where deleted_at is null;
create trigger trg_goals_softdel before delete on financial_goals
  for each row execute function soft_delete_row();

-- ─── 12) exchange_rates (PK مركّب) ───────────────────────────────────
create table exchange_rates (
  currency   text not null,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rate       numeric(18,6) not null check (rate > 0),
  updated_at timestamptz not null default now(),
  primary key (currency, user_id)
);
create trigger trg_xrates_updated before update on exchange_rates
  for each row execute function set_updated_at();

-- ─── 13) portfolio_snapshots (PK مركّب) ──────────────────────────────
create table portfolio_snapshots (
  snapshot_date date not null,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  total_banks   numeric(18,4) not null default 0,
  total_stocks  numeric(18,4) not null default 0,
  total_metals  numeric(18,4) not null default 0,
  total_certs   numeric(18,4) not null default 0,
  grand_total   numeric(18,4) not null default 0,
  primary key (snapshot_date, user_id)
);

-- ─── 14) debts ───────────────────────────────────────────────────────
create table debts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  party      text,
  type       text not null check (type in ('دين علي','دين لي')),
  rate       numeric(9,4) not null default 0 check (rate >= 0 and rate <= 100),
  amount     numeric(18,4) not null check (amount > 0),
  remaining  numeric(18,4) not null check (remaining >= 0),
  start_date date,
  due_date   date,
  bank_id    bigint references banks(id) on delete set null,
  notes      text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint debt_remaining_le_amount check (remaining <= amount + 0.01)
);
create index idx_debts_user on debts(user_id) where deleted_at is null;
create index idx_debts_due  on debts(user_id, due_date) where deleted_at is null and remaining > 0;
create trigger trg_debts_softdel before delete on debts
  for each row execute function soft_delete_row();

-- ─── 15) debt_payments ───────────────────────────────────────────────
create table debt_payments (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  debt_id             bigint not null references debts(id) on delete cascade,
  bank_id             bigint references banks(id) on delete set null,
  bank_transaction_id bigint references bank_transactions(id) on delete set null,
  amount              numeric(18,4) not null check (amount > 0),
  date                date not null default current_date,
  notes               text,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now()
);
create index idx_dpay_user on debt_payments(user_id) where deleted_at is null;
create index idx_dpay_debt on debt_payments(debt_id) where deleted_at is null;
create trigger trg_dpay_softdel before delete on debt_payments
  for each row execute function soft_delete_row();

-- ─── 16) app_settings (PK = user_id) ─────────────────────────────────
create table app_settings (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger trg_settings_updated before update on app_settings
  for each row execute function set_updated_at();

-- ─── 17) audit_log ───────────────────────────────────────────────────
create table audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  table_name text not null,
  record_id  bigint,
  action     text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data   jsonb,
  new_data   jsonb,
  changed_at timestamptz not null default now()
);
create index idx_audit_user_time on audit_log(user_id, changed_at desc);

create or replace function audit_trigger()
returns trigger
language plpgsql security definer as $$
begin
  insert into audit_log (user_id, table_name, record_id, action, old_data, new_data)
  values (
    coalesce(new.user_id, old.user_id),
    TG_TABLE_NAME,
    coalesce(new.id, old.id),
    TG_OP,
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end; $$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'banks','bank_transactions','stock_transactions','metal_transactions',
    'certificates','dividends','debts','debt_payments',
    'recurring_transactions','financial_goals'
  ])
  loop
    execute format(
      'create trigger trg_%I_audit after insert or update or delete on %I for each row execute function audit_trigger();',
      t, t
    );
  end loop;
end $$;

-- ─── 18) RPCs ────────────────────────────────────────────────────────

-- 18a) تحويل ذرّي (يدعم عملات مختلفة عبر p_to_amount)
create or replace function transfer_funds(
  p_from_id   bigint,
  p_to_id     bigint,
  p_amount    numeric,
  p_to_amount numeric default null,
  p_fee       numeric default 0,
  p_date      date    default current_date,
  p_notes     text    default ''
) returns void
language plpgsql security definer as $$
declare
  v_from_balance numeric;
  v_from_txn_id  bigint;
  v_to_txn_id    bigint;
  v_uid          uuid := auth.uid();
  v_to_amt       numeric;
begin
  if p_from_id = p_to_id then raise exception 'لا يمكن التحويل لنفس الحساب'; end if;
  if p_amount <= 0         then raise exception 'المبلغ غير صحيح'; end if;

  select balance into v_from_balance from banks
   where id = p_from_id and user_id = v_uid and deleted_at is null
   for update;
  if not found then raise exception 'الحساب المُرسِل غير موجود'; end if;
  if v_from_balance < p_amount + coalesce(p_fee,0) then
    raise exception 'الرصيد غير كافٍ: المتاح % / المطلوب %',
      v_from_balance, p_amount + coalesce(p_fee,0);
  end if;

  v_to_amt := coalesce(p_to_amount, p_amount);

  insert into bank_transactions (bank_id, type, amount, date, notes, category, user_id)
  values (p_from_id, 'تحويل صادر', p_amount, p_date, p_notes, 'تحويل', v_uid)
  returning id into v_from_txn_id;

  if coalesce(p_fee,0) > 0 then
    insert into bank_transactions (bank_id, type, amount, date, notes, category, user_id)
    values (p_from_id, 'سحب', p_fee, p_date, 'رسوم تحويل', 'رسوم', v_uid);
  end if;

  insert into bank_transactions (bank_id, type, amount, date, notes, category, user_id, linked_transfer_id)
  values (p_to_id, 'تحويل وارد', v_to_amt, p_date, p_notes, 'تحويل', v_uid, v_from_txn_id)
  returning id into v_to_txn_id;

  update bank_transactions set linked_transfer_id = v_to_txn_id where id = v_from_txn_id;
end; $$;

-- 18b) أرشفة بنك + حركاته
create or replace function delete_bank_cascade(p_bank_id bigint)
returns void language plpgsql security definer as $$
declare v_uid uuid := auth.uid();
begin
  update bank_transactions set deleted_at = now()
   where bank_id = p_bank_id and user_id = v_uid and deleted_at is null;
  update banks set deleted_at = now()
   where id = p_bank_id and user_id = v_uid;
end; $$;

-- 18c) ملخّص المحفظة (نداء واحد)
create or replace function get_portfolio_summary()
returns jsonb language sql security definer stable as $$
  with b as (
    select coalesce(sum(balance),0) as total_banks,
           jsonb_agg(jsonb_build_object(
             'id',id,'name',name,'balance',balance,
             'currency',currency,'color',color,
             'type',type,'is_active',is_active
           ) order by id) as banks
      from banks where user_id = auth.uid() and deleted_at is null
  ),
  c as (
    select coalesce(sum(amount),0) as total_certs,
           coalesce(sum(interest_paid),0) as certs_paid,
           count(*) as cert_count
      from certificates where user_id = auth.uid() and deleted_at is null
  ),
  d as (
    select coalesce(sum(case when type='دين علي' then remaining else 0 end),0) as owed,
           coalesce(sum(case when type='دين لي' then remaining else 0 end),0) as owing
      from debts where user_id = auth.uid() and deleted_at is null
  )
  select jsonb_build_object(
    'total_banks', b.total_banks,
    'total_certs', c.total_certs,
    'certs_paid',  c.certs_paid,
    'cert_count',  c.cert_count,
    'debts_owed',  d.owed,
    'debts_owing', d.owing,
    'banks', b.banks
  )
  from b, c, d;
$$;

-- ─── 19) View مساعد ──────────────────────────────────────────────────
create or replace view v_bank_balances as
  select b.id, b.user_id, b.name, b.currency, b.balance as stored_balance,
         coalesce(sum(case when bt.type in ('إيداع','تحويل وارد','رصيد افتتاحي','عائد شهادة','أرباح')
                           then bt.amount else -bt.amount end), 0) as computed_balance
    from banks b
    left join bank_transactions bt
      on bt.bank_id = b.id and bt.deleted_at is null
   where b.deleted_at is null
   group by b.id, b.user_id, b.name, b.currency, b.balance;

-- ─── 20) RLS ─────────────────────────────────────────────────────────
do $$
declare t text;
begin
  for t in select unnest(array[
    'banks','bank_transactions','stock_transactions','stock_prices',
    'metal_transactions','metal_prices','certificates','dividends',
    'recurring_transactions','financial_goals','exchange_rates',
    'portfolio_snapshots','debts','debt_payments','app_settings','audit_log'
  ])
  loop
    execute format('alter table %I enable row level security;', t);

    execute format('drop policy if exists %I on %I;', t||'_select_own', t);
    execute format('drop policy if exists %I on %I;', t||'_write_own',  t);

    execute format(
      'create policy %I on %I for select to authenticated using (auth.uid() = user_id);',
      t||'_select_own', t
    );
    execute format(
      'create policy %I on %I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);',
      t||'_write_own', t
    );
  end loop;
end $$;

-- audit_log للقراءة فقط (INSERT عبر trigger SECURITY DEFINER)
drop policy if exists audit_log_write_own on audit_log;

-- ✅ انتهى
