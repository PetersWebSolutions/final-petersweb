# PetersWeb Solutions website

A mobile-first website for PetersWeb Solutions, with package details, portfolio previews, FAQs, testimonials, legal pages, and a client inquiry form.

## Hosting and inquiry handling

The static website is hosted on Vercel. The root `server.py` is only a local development server; Vercel does not run it as a persistent server. The site includes Vercel Python functions under `api/` that save inquiry submissions to Supabase, plus a private admin dashboard at `/admin/`.

The dashboard uses Supabase Auth for its single admin and keeps the Supabase secret key server-side in Vercel. Do not commit real API keys or passwords. The dashboard does not process payments or store credentials.

## Admin dashboard

The pipeline contains Inbox, Standby, On-going, Finished (paid in full), and Finished Projects with monthly payments. Search supports business name, paid-in-full status, and upcoming/overdue domain renewal. Project Statistics summarizes the current calendar month: inquiries submitted, projects moved to On-going, completed projects, actual payment receipts, and scheduled unpaid payments due.

Domain data includes provider, renewal date, and an optional domain email address. The renewal reminder is shown in the dashboard within 30 days of the due date (including overdue renewals); no email/SMS reminder integration is configured. Payment rows record due/received status, payment type, amount, due/received dates, and whether the amount applies to the project balance or a separate monthly fee. Marking a Monthly row paid schedules the next month; remove that next due row to stop the series.

## Supabase setup and upgrade

For a new Supabase project, run [`supabase-schema.sql`](supabase-schema.sql). For the already-configured production project, run [`supabase-admin-enhancements-migration.sql`](supabase-admin-enhancements-migration.sql) **before** uploading the enhancement source to GitHub. The migration preserves records and does not guess historical stage dates. Follow [`ADMIN-SETUP-GUIDE.md`](ADMIN-SETUP-GUIDE.md) for GUI-based steps.

The website form collects full name, business name/category, package interest, optional current website, email, mobile number, message, and contact consent. When an inquiry becomes a project, admins may record the agreed package and total, add-ons, scheduled/received payments, stage, domain provider/renewal date/name, optional domain email, and internal notes. Do not store passwords, payment-card/bank credentials, or other login credentials.

## Local development

Run the local static site and JSONL inquiry server with:

```bash
python3 server.py
```

Then open <http://localhost:8000>. Local inquiries are saved under `data/` (git-ignored). The Vercel API functions use Supabase and are separate from this local JSONL workflow; the local server does not provide the protected admin API.

## Main project files

- `index.html` — public website and footer-only Admin Log In link.
- `admin/index.html` — private sign-in and admin dashboard interface.
- `assets/css/styles.css` — public site styling.
- `assets/css/admin.css` — responsive admin styling.
- `assets/js/main.js` — public site interactions and inquiry form behavior.
- `assets/js/admin.js` — dashboard, pipeline, search, reminders, payment schedule, and statistics.
- `api/inquiries.py` — validated public form submission endpoint.
- `api/admin.py` — protected single-admin dashboard API.
- `pws_backend.py` — shared Vercel function helpers.
- `supabase-schema.sql` — schema for a fresh Supabase project.
- `supabase-admin-enhancements-migration.sql` — non-destructive migration for the configured project.
- `ADMIN-SETUP-GUIDE.md` — GUI-based Supabase and Vercel setup/upgrade steps.
- `server.py` — local static server and local inquiry storage.
- `privacy.html`, `terms.html`, `404.html`, `robots.txt` — legal/supporting pages and crawler rules.

## Current package prices shown on the site

- Basic — ₱1,999 initial payment plus ₱499/month for six months.
- Pro — ₱8,999 one-time.
- Business — ₱14,999 one-time.

Admin users enter the final agreed project total and payments manually; these prices are not automatically treated as a client quotation.
