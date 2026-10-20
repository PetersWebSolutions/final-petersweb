-- PetersWeb Solutions: Monthly Expenses feature migration
-- Run this once in Supabase SQL Editor before deploying the second-wave admin code.
-- It adds private expense storage without changing inquiry/project records.

begin;

create table if not exists public.business_expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  description text not null check (length(description) between 1 and 160),
  category text not null default '' check (length(category) <= 80),
  amount numeric(12,2) not null check (amount >= 0),
  expense_date date not null,
  expense_type text not null default 'one_time'
    check (expense_type in ('one_time', 'monthly')),
  status text not null default 'due'
    check (status in ('due', 'paid')),
  paid_date date,
  series_id text not null default '',
  generated_from text not null default '',
  inquiry_id uuid references public.inquiries(id) on delete set null,
  check ((status = 'paid' and paid_date is not null)
      or (status = 'due' and paid_date is null))
);

create index if not exists business_expenses_date_idx
  on public.business_expenses (expense_date desc);
create index if not exists business_expenses_status_date_idx
  on public.business_expenses (status, expense_date);
create index if not exists business_expenses_series_idx
  on public.business_expenses (series_id, expense_date);

alter table public.business_expenses enable row level security;
revoke all on table public.business_expenses from anon, authenticated;
grant all on table public.business_expenses to service_role;

commit;
