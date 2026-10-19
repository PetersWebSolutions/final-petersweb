# PetersWeb Solutions admin dashboard setup

This feature adds a private dashboard to the existing Vercel site. It is not active until the Supabase project, database, admin account, and Vercel environment variables are configured.

## Dashboard behavior

- **Admin Log In** appears only in the website footer. `/admin/` is marked `noindex` and has no public sign-up.
- **Inbox** shows new client inquiries and an in-app badge for unread items. Opening an inquiry marks it read. The badge refreshes while the dashboard is open; no email, SMS, or push alerts are configured.
- **Standby Projects** keeps the submitted form details and can move a record to On-going.
- **On-going Projects** can move to Finished and includes admin-managed package, agreed total, add-ons, payment entries, balance, domain, and domain email address.
- **Finished Projects** keeps the client and project details, payment status, remaining balance, domain, and domain email address.
- The payment ledger records amounts entered by the admin. It does not process or verify payments. Do not enter card/bank information, email passwords, or registrar/hosting passwords.

## Important before setup

The current live site is static. Its old `server.py` only runs for local development and does not run on Vercel. Until this backend is configured and deployed, submissions from the live site will not be saved to the dashboard. Existing submissions are not imported automatically; only inquiries submitted after the Supabase-backed endpoint is live will appear.

## 1. Create a Supabase project

1. Sign in to Supabase and create a new project under your account.
2. Choose a strong database password and store it safely; it is not needed in this site’s Vercel environment variables.
3. Choose the closest available region to your clients.

## 2. Create the database table

1. Open the Supabase project.
2. Choose **SQL Editor** and start a new query.
3. Open `supabase-schema.sql` from this source package, copy its contents, and paste them into the SQL Editor.
4. Run the query. It creates the `inquiries` table, enables Row Level Security, and grants direct browser roles no access to client records.

## 3. Create the one admin login

1. In Supabase, open **Authentication → Users**.
2. Add/invite the one admin user using the email that will be set as `ADMIN_EMAIL` in Vercel.
3. Set a strong unique password using Supabase’s account flow. Never put the password in this repository or send it in chat.
4. Keep public sign-ups disabled. Only the admin account should be able to sign in.

## 4. Add server-only Supabase settings in Vercel

In Vercel, open the `project-e7yjm` project, then **Settings → Environment Variables**. Add these for **Production**:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | The project URL from Supabase’s **Connect** or API settings |
| `SUPABASE_PUBLISHABLE_KEY` | The Supabase publishable key (`sb_publishable_...`) |
| `SUPABASE_SECRET_KEY` | The Supabase secret key (`sb_secret_...`) — server-side only |
| `ADMIN_EMAIL` | The exact email for the single admin account |

The code also accepts Supabase’s legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` variable names if those are the keys your project provides. The secret/service-role key must stay in Vercel’s server-side environment variables; never add it to HTML, JavaScript, GitHub, or a public `.env` file.

## 5. Deploy and verify

1. Commit/upload the updated source to the connected GitHub repository. Vercel will deploy the `/api` Python functions from the project root; keep Framework Preset **Other**, root directory `./`, and the build command blank.
2. Wait for the deployment to show **Ready**.
3. Open the site footer and choose **Admin Log In**. Sign in with the admin account created in Supabase.
4. Confirm the dashboard opens. Then submit a controlled test inquiry and verify it appears in Inbox. If you need to remove test data, use Supabase **Table Editor → inquiries**; deletion is not a public website feature.

## Security and privacy notes

- The browser never receives the Supabase secret/service-role key. Private dashboard API calls require a signed-in Supabase Auth session for the configured admin email.
- Client records include names, email addresses, mobile numbers, inquiry text, and, when managed as projects, package/payment/domain details. Review the updated Privacy Policy before launch and confirm it accurately describes the business’s actual retention and practices.
- The dashboard stores the domain email address only, not its password. Payment entries are manual bookkeeping only.
- The Inbox badge is in-app only. No email or text notification integration is included.
