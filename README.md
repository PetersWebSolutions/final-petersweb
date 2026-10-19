# PetersWeb Solutions website

A mobile-first website for PetersWeb Solutions, with package details, portfolio previews, FAQs, testimonials, privacy/terms pages, and a client inquiry form.

## Hosting and inquiry handling

The static website is hosted on Vercel. The root `server.py` is only a local development server; Vercel does not run it as a persistent server. This source now includes Vercel Python functions under `api/` that save inquiry submissions to Supabase, plus a private admin dashboard at `/admin/`.

The inquiry API and admin dashboard will not store or display client data until a Supabase project, table, single admin user, and Vercel Production environment variables have been configured. Follow [`ADMIN-SETUP-GUIDE.md`](ADMIN-SETUP-GUIDE.md) and run [`supabase-schema.sql`](supabase-schema.sql) in the Supabase SQL Editor. Do not commit real API keys or passwords.

The website form currently collects full name, business name/category, package interest, optional current website, email, mobile number, message, and contact consent. After a lead becomes a project, the admin dashboard can record the agreed package and total, add-ons, payment amounts, stage, domain name, and domain email address. The dashboard does not process payments or store passwords.

## Local development

Run the local static site and JSONL inquiry server with:

```bash
python3 server.py
```

Then open <http://localhost:8000>. Local inquiries are saved under `data/` (git-ignored). The Vercel API functions use Supabase and are separate from this local JSONL workflow.

## Main project files

- `index.html` — public website and footer-only Admin Log In link.
- `admin/index.html` — private sign-in and four-stage dashboard interface.
- `assets/css/styles.css` — public site styling.
- `assets/css/admin.css` — responsive admin styling.
- `assets/js/main.js` — public site interactions and inquiry form behavior.
- `assets/js/admin.js` — admin dashboard interface.
- `api/inquiries.py` — validated public form submission endpoint.
- `api/admin.py` — protected single-admin dashboard API.
- `pws_backend.py` — shared Vercel function helpers.
- `supabase-schema.sql` — Supabase database table and access restrictions.
- `ADMIN-SETUP-GUIDE.md` — GUI-based Supabase and Vercel configuration steps.
- `server.py` — local static server and local inquiry storage.
- `privacy.html`, `terms.html`, `404.html`, `robots.txt` — legal/supporting pages and crawler rules.

## Current package prices shown on the site

- Basic — ₱1,999 initial payment plus ₱499/month for six months.
- Pro — ₱8,999 one-time.
- Business — ₱14,999 one-time.

Admin users enter the final agreed project total and payments manually; these prices are not automatically treated as a client quotation.
