# PetersWeb Solutions website

A mobile-first website for PetersWeb Solutions, with package details, portfolio previews, FAQs, testimonials, legal pages, and a client inquiry form.

## Hosting and inquiry handling

The static website is hosted on Vercel. The root `server.py` is only a local development server; Vercel does not run it as a persistent server. The site includes Vercel Python functions under `api/` that save inquiry submissions to Supabase, plus a private admin dashboard at `/admin/`.

The dashboard uses Supabase Auth for its single admin and keeps the Supabase secret key server-side in Vercel. Do not commit real API keys or passwords. The dashboard does not process payments.

## Admin dashboard

The project pipeline includes Inbox, Standby, On-going, Finished (paid in full), and Finished Projects with monthly payments. Finished projects can be moved into the monthly-payment destination when an unpaid Monthly payment is scheduled. Every client/project row has a permanent-delete action with an irreversible-deletion confirmation. Deleting a project preserves its linked expense entries but unlinks them.

Search supports business name, paid-in-full status, and upcoming/overdue domain renewal. Project Statistics retains a current-month summary and adds an all-available-months comparison table for income, receivables, profit, expenses, inquiries, and finished projects. Income counts actual payment receipts; receivables count unpaid scheduled project payments; expenses count all ledger rows in their due/expense month, including unpaid expenses; profit is income minus those expenses. Inquiry and finished-project counts use their submission and completion months.

Monthly Expenses supports dated one-time entries and recurring monthly bills, with description, category, amount, due/expense date, Paid/Unpaid status, and optional client/project association. Marking a recurring bill Paid creates the next month's Unpaid entry; delete a future entry to stop the series. Expense rows are manual bookkeeping; the dashboard does not process or verify payments.

Domain data includes provider, renewal date, and an optional domain email address. The renewal reminder is shown in the dashboard within 30 days of the due date (including overdue renewals); no email/SMS reminder integration is configured. Payment rows record due/received status, payment type, amount, due/received dates, and whether the amount applies to the project balance or a separate monthly fee. Marking a Monthly project payment paid schedules the next month.

## Supabase setup and upgrade

For a new Supabase project, run [`supabase-schema.sql`](supabase-schema.sql). For the existing production project, the first-wave migration [`supabase-admin-enhancements-migration.sql`](supabase-admin-enhancements-migration.sql) has already been run. Before deploying the second-wave expense features, run the separate [`supabase-expenses-migration.sql`](supabase-expenses-migration.sql), then upload the updated source to GitHub so Vercel can deploy it. Do not rerun the first-wave migration or fresh-project schema on the existing database. Follow [`ADMIN-SETUP-GUIDE.md`](ADMIN-SETUP-GUIDE.md) for GUI-based steps.

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
- `assets/js/admin.js` — dashboard, pipeline, search, reminders, payment schedule, expenses, and statistics.
- `api/inquiries.py` — validated public form submission endpoint.
- `api/admin.py` — protected single-admin dashboard API.
- `pws_backend.py` — shared Vercel function helpers.
- `supabase-schema.sql` — schema for a fresh Supabase project, including business expenses.
- `supabase-admin-enhancements-migration.sql` — first-wave migration, already run for the existing live database.
- `supabase-expenses-migration.sql` — second-wave migration for Monthly Expenses; run before deploying the second-wave code.
- `ADMIN-SETUP-GUIDE.md` — GUI-based Supabase and Vercel setup/upgrade steps.
- `server.py` — local static server and local inquiry storage.
- `privacy.html`, `terms.html`, `404.html`, `robots.txt` — legal/supporting pages and crawler rules.

## Current package prices shown on the site

- Basic — ₱1,999 initial payment plus ₱499/month for six months.
- Pro — ₱8,999 one-time.
- Business — ₱14,999 one-time.

Admin users enter the final agreed project total and payments manually; these prices are not automatically treated as a client quotation.
