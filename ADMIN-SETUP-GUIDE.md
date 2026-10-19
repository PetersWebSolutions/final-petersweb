# PetersWeb Solutions admin dashboard setup and upgrade guide

## Current live setup

The production site is connected to Supabase and the admin dashboard has been verified live. This guide describes the dashboard and how to apply the next enhancement release safely. That release is not live until its database migration is run and its source files are uploaded to GitHub and deployed by Vercel.

## Dashboard behavior

- **Admin Log In** appears only in the website footer. `/admin/` is marked `noindex` and has no public sign-up.
- **Inbox** shows new inquiries and an in-app unread badge. Opening an inquiry marks it read. The badge refreshes while the dashboard is open; there are no email, SMS, or push alerts.
- **Standby Projects** keeps all submitted form details. **On-going Projects** includes project, payment, and domain details.
- **Finished Projects** is for completed projects paid in full. **Finished Projects with monthly payments** is for completed projects with an unpaid Monthly payment scheduled. The dashboard does not automatically reclassify existing records.
- **Search** filters across client records by business name, paid-in-full status, and domain renewal date due within 30 days or overdue.
- **Project Statistics** uses the current calendar month: inquiries by submission date; On-going by date moved into that stage; finished projects by completion date (either completed stage); income by recorded receipt date; receivables by unpaid scheduled due date.
- Domain renewals due in the next 30 days, including overdue dates, appear as an in-dashboard alert while signed in. This is not an email or SMS alarm.
- Payment rows hold a due date, type (Down payment, Installment, Final payment, or Monthly), amount, whether the amount counts against the agreed project balance or is a separate monthly fee, Due/Paid status, and received date. Only paid project-balance entries reduce the agreed package balance; monthly income includes all recorded receipts. Marking a Monthly row paid creates the next month's due row. Remove the generated future row if that monthly series should stop.
- The mobile number is a `tel:` link in the inquiry details. The domain email is optional. Record the provider, renewal date, and email address only—never passwords or payment-card/bank details.

## Apply enhancements to the existing live project

The existing Supabase table, admin user, and Vercel environment variables are already configured. **Do these steps in order.** They preserve current records and do not reclassify the existing Finished project.

### 1. Run the database migration first

1. Open the Supabase project and choose **SQL Editor → New query**.
2. Open `supabase-admin-enhancements-migration.sql` from the updated source package and copy its full contents into the query.
3. Click **Run**. A successful result may say “Success. No rows returned.”
4. This adds optional domain provider/renewal fields, stage support, and timestamps used by statistics. It does not delete or move existing records. Stage dates are not guessed or backfilled, so monthly stage statistics start accumulating after this migration.

Do not run the fresh-project `supabase-schema.sql` over this already-configured project; use the migration file above.

### 2. Upload the updated source to GitHub

1. Extract the updated source ZIP on your computer.
2. In the connected GitHub repository, choose **Add file → Upload files**.
3. Upload the extracted files and folders to the repository root, preserving their folder structure; do not upload the ZIP as a single file.
4. Commit the upload to `main`. Vercel will start a Production deployment. The current Supabase environment variables should remain in Vercel and do not need to be re-entered.
5. Wait for the deployment to show **Ready**, then open `https://www.peterswebsolutions.com/admin/` and sign in.

### 3. Verify

1. Confirm the added Monthly, Search, and Project Statistics navigation items are present.
2. Test an inquiry submission and confirm it appears in Inbox.
3. In an existing or test project, save a domain provider/date and verify the renewal reminder appears when the date is within 30 days. Use an optional domain email or leave it blank.
4. Test payment rows with non-sensitive amounts only. Do not use real payment credentials. Confirm a paid Monthly row creates a next-month due row and that the statistics reflect the receipt/due date.

## Fresh-project setup reference

For a brand-new Supabase project only:

1. Run `supabase-schema.sql` in Supabase **SQL Editor**.
2. Create the single admin account under **Authentication → Users**; keep public sign-ups disabled.
3. In Vercel **Settings → Environment Variables**, configure Production values for `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `ADMIN_EMAIL`.
4. Keep the secret/service-role key server-side in Vercel. Never place secrets in HTML, JavaScript, GitHub, or chat. The code accepts the legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` names as an alternative.

## Security and privacy notes

- The browser never receives the Supabase secret/service-role key. Private dashboard API calls require a Supabase Auth session for the configured admin email.
- Client records include names, email addresses, mobile numbers, inquiry text, and, when managed as projects, package/payment details and domain provider, renewal date, name, and email address.
- Payment records are manual bookkeeping only; the dashboard does not process or verify payments. Never enter card/bank details, email passwords, or registrar/hosting passwords.
- Renewal reminders and the Inbox badge are in-app only. No email or text notification integration is included.
- Review the updated Privacy Policy and confirm it accurately describes the business's actual retention and practices.
