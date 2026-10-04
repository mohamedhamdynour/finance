-- Non-destructive migration for sharing security, optional tables, and safe backup restore.

create table if not exists portfolio_members (
  id             bigint generated always as identity primary key,
  owner_user_id  uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid references auth.users(id) on delete cascade,
  member_email   text not null,
  role           text not null default 'viewer' check (role in ('viewer','editor')),
  status         text not null default 'pending' check (status in ('pending','accepted','revoked')),
  accepted_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint portfolio_member_not_self check (owner_user_id is distinct from member_user_id)
);
create unique index if not exists ux_portfolio_members_owner_email on portfolio_members(owner_user_id, member_email);
create unique index if not exists ux_portfolio_members_owner_member on portfolio_members(owner_user_id, member_user_id) where member_user_id is not null;
create index if not exists idx_portfolio_members_member_status on portfolio_members(member_user_id, status);

create table if not exists installments (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bank_id             bigint references banks(id) on delete set null,
  name                text not null,
  party               text,
  total_amount        numeric(18,4) not null check (total_amount > 0),
  installments_count  integer not null check (installments_count > 0),
  installment_amount  numeric(18,4) not null check (installment_amount > 0),
  frequency           text not null default 'monthly' check (frequency in ('weekly','monthly','quarterly','yearly')),
  start_date          date not null default current_date,
  notes               text,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_installments_user on installments(user_id) where deleted_at is null;

create table if not exists installment_payments (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  installment_id      bigint not null references installments(id) on delete cascade,
  bank_id             bigint references banks(id) on delete set null,
  bank_transaction_id bigint references bank_transactions(id) on delete set null,
  amount              numeric(18,4) not null check (amount > 0),
  date                date not null default current_date,
  notes               text,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists idx_installment_payments_user on installment_payments(user_id) where deleted_at is null;

create table if not exists attachments (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_table text not null check (parent_table in ('certificates','debts','installments')),
  parent_id    bigint not null,
  file_name    text not null,
  file_size    bigint not null check (file_size >= 0),
  mime_type    text not null,
  storage_path text not null unique,
  notes        text,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_attachments_user_parent on attachments(user_id, parent_table, parent_id) where deleted_at is null;

alter table certificates add column if not exists matured_at timestamptz;
alter table certificates add column if not exists matured_amount numeric(18,4);

create or replace function can_read_portfolio(p_owner_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    auth.uid() = p_owner_user_id
    or exists (
      select 1
      from portfolio_members pm
      where pm.owner_user_id = p_owner_user_id
        and pm.member_user_id = auth.uid()
        and pm.status = 'accepted'
    );
$$;

create or replace function can_edit_portfolio(p_owner_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    auth.uid() = p_owner_user_id
    or exists (
      select 1
      from portfolio_members pm
      where pm.owner_user_id = p_owner_user_id
        and pm.member_user_id = auth.uid()
        and pm.status = 'accepted'
        and pm.role = 'editor'
    );
$$;

create or replace function accept_pending_invites()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'يجب تسجيل الدخول';
  end if;
  if v_email = '' then
    return 0;
  end if;

  update portfolio_members
     set member_user_id = v_uid,
         status = 'accepted',
         accepted_at = now(),
         updated_at = now()
   where lower(member_email) = v_email
     and status = 'pending'
     and member_user_id is null;
  get diagnostics v_count = row_count;

  return coalesce(v_count, 0);
end;
$$;

create or replace function import_backup_payload(p_payload jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  t text;
  row_json jsonb;
  cols text;
begin
  if v_uid is null then
    raise exception 'يجب تسجيل الدخول';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'تنسيق النسخة الاحتياطية غير صالح';
  end if;

  foreach t in array array[
    'attachments','installment_payments','installments','debt_payments','debts',
    'dividends','certificates','metal_transactions','stock_transactions',
    'bank_transactions','recurring_transactions','financial_goals','portfolio_snapshots',
    'exchange_rates','stock_prices','metal_prices','banks'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from %I where user_id = $1', t) using v_uid;
    end if;
  end loop;

  foreach t in array array[
    'banks','stock_prices','metal_prices','exchange_rates','portfolio_snapshots',
    'financial_goals','recurring_transactions','stock_transactions','metal_transactions',
    'certificates','dividends','debts','debt_payments','installments',
    'installment_payments','attachments','bank_transactions'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    if jsonb_typeof(coalesce(p_payload -> t, '[]'::jsonb)) <> 'array' then
      raise exception 'تنسيق غير صالح للجدول: %', t;
    end if;

    select string_agg(quote_ident(column_name), ',')
      into cols
      from information_schema.columns
     where table_schema = 'public'
       and table_name = t
       and is_generated = 'NEVER'
       and column_name not in ('created_at','updated_at');

    if cols is null then
      continue;
    end if;

    for row_json in
      select jsonb_set(value - 'id' - 'created_at' - 'updated_at', '{user_id}', to_jsonb(v_uid), true)
      from jsonb_array_elements(coalesce(p_payload -> t, '[]'::jsonb))
    loop
      execute format(
        'insert into %I (%s) select %s from jsonb_populate_record(null::%I, $1)',
        t, cols, cols, t
      ) using row_json;
    end loop;
  end loop;
end;
$$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'banks','bank_transactions','stock_transactions','stock_prices',
    'metal_transactions','metal_prices','certificates','dividends',
    'recurring_transactions','financial_goals','exchange_rates',
    'portfolio_snapshots','debts','debt_payments',
    'installments','installment_payments','attachments'
  ])
  LOOP
    execute format('alter table %I enable row level security;', t);

    execute format('drop policy if exists %I on %I;', t||'_select_shared', t);
    execute format('drop policy if exists %I on %I;', t||'_insert_shared', t);
    execute format('drop policy if exists %I on %I;', t||'_update_shared', t);
    execute format('drop policy if exists %I on %I;', t||'_delete_shared', t);

    execute format(
      'create policy %I on %I for select to authenticated using (can_read_portfolio(user_id));',
      t||'_select_shared', t
    );
    execute format(
      'create policy %I on %I for insert to authenticated with check (can_edit_portfolio(user_id));',
      t||'_insert_shared', t
    );
    execute format(
      'create policy %I on %I for update to authenticated using (can_edit_portfolio(user_id)) with check (can_edit_portfolio(user_id));',
      t||'_update_shared', t
    );
    execute format(
      'create policy %I on %I for delete to authenticated using (can_edit_portfolio(user_id));',
      t||'_delete_shared', t
    );
  END LOOP;
END $$;

alter table if exists portfolio_members enable row level security;
drop policy if exists portfolio_members_owner_select on portfolio_members;
drop policy if exists portfolio_members_member_select on portfolio_members;
drop policy if exists portfolio_members_owner_insert on portfolio_members;
drop policy if exists portfolio_members_owner_update on portfolio_members;
drop policy if exists portfolio_members_owner_delete on portfolio_members;
drop policy if exists portfolio_members_member_delete on portfolio_members;

create policy portfolio_members_owner_select on portfolio_members
  for select to authenticated
  using (owner_user_id = auth.uid());

create policy portfolio_members_member_select on portfolio_members
  for select to authenticated
  using (
    member_user_id = auth.uid()
    or lower(member_email) = lower(coalesce(auth.jwt()->>'email', ''))
  );

create policy portfolio_members_owner_insert on portfolio_members
  for insert to authenticated
  with check (
    owner_user_id = auth.uid()
    and role in ('viewer','editor')
    and status in ('pending','accepted','revoked')
  );

create policy portfolio_members_owner_update on portfolio_members
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (
    owner_user_id = auth.uid()
    and role in ('viewer','editor')
    and status in ('pending','accepted','revoked')
  );

create policy portfolio_members_owner_delete on portfolio_members
  for delete to authenticated
  using (owner_user_id = auth.uid());

create policy portfolio_members_member_delete on portfolio_members
  for delete to authenticated
  using (member_user_id = auth.uid());
