-- PetersWeb admin dashboard enhancements (safe/idempotent migration)
-- Run this in the existing Supabase project BEFORE deploying the updated admin code.
-- Adds optional domain renewal/provider details, monthly-finish stage support,
-- and timestamps for calendar-month project statistics. Existing inquiry data
-- and payment records are preserved; stage dates are intentionally not guessed.

begin;

alter table public.inquiries
  add column if not exists domain_provider text not null default '',
  add column if not exists domain_renewal_date date,
  add column if not exists ongoing_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.inquiries
  drop constraint if exists inquiries_stage_check;

alter table public.inquiries
  add constraint inquiries_stage_check
  check (stage in ('inbox', 'standby', 'ongoing', 'finished', 'finished_monthly'));

create index if not exists inquiries_domain_renewal_idx
  on public.inquiries (domain_renewal_date)
  where domain_renewal_date is not null;

commit;
