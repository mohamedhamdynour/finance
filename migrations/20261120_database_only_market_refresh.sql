-- Database-only preferences and delayed market refresh support.
-- Safe to run on existing Supabase projects.
alter table if exists public.stock_prices
  add column if not exists market text default 'EGX';

comment on column public.stock_prices.updated_at is
  'Last persisted market price update; used for the 12-hour refresh window.';
