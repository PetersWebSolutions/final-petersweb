-- PetersWeb Solutions admin dashboard schema
-- Run this in Supabase Dashboard > SQL Editor for a fresh project.
-- For an existing production project, do not run this fresh-project schema.
-- Apply the relevant migrations in order instead: the first-wave
-- supabase-admin-enhancements-migration.sql, then
-- supabase-expenses-migration.sql for the expense table.
-- The browser does not access this table directly. Vercel Functions use the
-- server-only secret key after verifying the single configured admin login.

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stage text not null default 'inbox'
    check (stage in ('inbox', 'standby', 'ongoing', 'finished', 'finished_monthly')),
  is_read boolean not null default false,

  -- Original inquiry form fields
  name text not null,
  business text not null,
  business_type text not null,
  package_interest text not null,
  current_website text not null default '',
  email text not null,
  phone text not null,
  message text not null,
  consent boolean not null default true,
  source text not null default '',

  -- Admin-managed project and payment details
  agreed_package text,
  total_price numeric(12,2) check (total_price is null or total_price >= 0),
  addons jsonb not null default '[]'::jsonb
    check (jsonb_typeof(addons) = 'array'),
  payments jsonb not null default '[]'::jsonb
    check (jsonb_typeof(payments) = 'array'),
  domain_name text not null default '',
  domain_provider text not null default '',
  domain_renewal_date date,
  domain_email text not null default '',
  admin_notes text not null default '',

  -- Used for calendar-month project statistics; existing records are not backfilled.
  ongoing_at timestamptz,
  completed_at timestamptz
);

create index if not exists inquiries_stage_created_idx
  on public.inquiries (stage, created_at desc);
create index if not exists inquiries_unread_idx
  on public.inquiries (is_read, created_at desc)
  where stage = 'inbox';
create index if not exists inquiries_domain_renewal_idx
  on public.inquiries (domain_renewal_date)
  where domain_renewal_date is not null;

-- Manual business expense ledger and recurring monthly bill entries.
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

-- Keep direct browser access closed. Admin and public form requests go through
-- Vercel Functions; the secret key is stored only in Vercel environment
-- variables and is never sent to the browser.
alter table public.inquiries enable row level security;
revoke all on table public.inquiries from anon, authenticated;
grant all on table public.inquiries to service_role;

alter table public.business_expenses enable row level security;
revoke all on table public.business_expenses from anon, authenticated;
grant all on table public.business_expenses to service_role;
