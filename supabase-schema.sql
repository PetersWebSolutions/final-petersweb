-- PetersWeb Solutions admin dashboard schema
-- Run this in Supabase Dashboard > SQL Editor after creating a project.
-- The browser does not access this table directly. Vercel Functions use the
-- server-only service key after verifying the single configured admin login.

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stage text not null default 'inbox'
    check (stage in ('inbox', 'standby', 'ongoing', 'finished')),
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
  domain_email text not null default '',
  admin_notes text not null default ''
);

create index if not exists inquiries_stage_created_idx
  on public.inquiries (stage, created_at desc);
create index if not exists inquiries_unread_idx
  on public.inquiries (is_read, created_at desc)
  where stage = 'inbox';

-- Keep direct browser access closed. Admin and public form requests go through
-- Vercel Functions; the service-role key is stored only in Vercel environment
-- variables and is never sent to the browser.
alter table public.inquiries enable row level security;
revoke all on table public.inquiries from anon, authenticated;
grant all on table public.inquiries to service_role;
