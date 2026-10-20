# PetersWeb Solutions admin dashboard setup and upgrade guide

## Current production status

The first-wave admin enhancements have been uploaded to GitHub and Vercel reported the latest `main` deployment as **Ready / Production**. The first-wave Supabase migration has already been run successfully. The second-wave features below are **not live** until the separate expense migration is run and the updated source is uploaded and deployed.

The second-wave release preserves existing inquiries and stages. It does not automatically move the existing Finished project or alter its payment schedule.

## Second-wave dashboard behavior

- **Finished Projects → Finished Projects with monthly payments:** a completed project can be moved to the monthly-payment destination when it has at least one unpaid Monthly payment row. The destination is for completed projects with a Monthly amount still due. To return a fully paid project to Finished, clear or remove due scheduled payments first.
- **Permanent deletion:** each client/project row has a Delete action. The confirmation names the record, explains that the deletion cannot be undone, and offers **Yes, delete permanently** or **Cancel**. Deleting a client/project removes its inquiry, payment schedule, domain details, and admin notes. Any linked expense entries remain in Monthly Expenses and are unlinked from the deleted project. Expense entries have their own permanent-delete confirmation; deleting one recurring month does not delete other months in its series.
- **Monthly Expenses:** add dated one-time ledger entries or recurring monthly bills. Each entry has a description, category, amount, due/expense date, Paid/Unpaid status, and optional link to a client/project. Marking a recurring monthly bill Paid creates the next month's Unpaid row. Delete that future row to stop the series. Expense rows are dated by their due/expense date; Paid/Unpaid status does not change which month they count in.
- **Project Statistics:** current-month cards are retained, and the all-available-months comparison table includes income, receivables, profit, expenses, inquiry count, and finished-project count. It includes months with recorded history and scheduled future due dates.
  - Income = project payments actually received in that month.
  - Receivables = unpaid scheduled project payments due in that month.
  - Expenses = all expense rows dated in that month, including Unpaid entries.
  - Profit = income minus those recorded expenses.
  - Inquiries = submissions received in that month.
  - Finished projects = projects completed in that month, where a completion date is recorded. Historical dates are not guessed or backfilled.
- Domain renewal reminders remain in-dashboard only. The dashboard does not send email, SMS, or push notifications and does not process or verify payments.

## Apply the second-wave upgrade to the existing live project

The Supabase project, admin user, Vercel variables, and first-wave migration are already configured. **Do these steps in order.** No Bash or command-line steps are needed.

### 1. Run the new expenses migration first

1. Open the Supabase project and choose **SQL Editor → New query**.
2. Open `supabase-expenses-migration.sql` from the updated source package.
3. Copy the full contents into the SQL Editor and click **Run**.
4. A successful result may say **“Success. No rows returned.”**

Run this new migration only once. **Do not rerun** `supabase-admin-enhancements-migration.sql`, and do not run the fresh-project `supabase-schema.sql` over the existing production database. The new migration creates private expense storage and leaves all existing project records and stages unchanged.

### 2. Upload the updated source to GitHub

1. Download and extract the updated source ZIP.
2. In the connected GitHub repository, choose **Add file → Upload files**.
3. Upload the extracted files and folders to the repository root, preserving their folder structure. Do not upload the ZIP as a single file.
4. Commit the upload to `main`. Vercel should start a Production deployment. The current Supabase environment variables should remain in Vercel and do not need to be re-entered.
5. Wait for Vercel to show **Ready**, then open `https://www.peterswebsolutions.com/admin/` and sign in.

### 3. Verify safely

1. Confirm the **Monthly Expenses** navigation and the all-month comparison table are present.
2. Add a small test one-time expense. Confirm it appears in the ledger and in the matching month's Expenses and Profit figures. Delete the test entry if appropriate.
3. Create a test recurring monthly bill with a due date and amount. Mark it Paid and confirm the next month's Unpaid row appears. Delete that future row if you do not want to keep the test series.
4. Optionally link a test expense to a project and verify the project name appears. Deleting a client/project keeps its expense entries but removes the project link.
5. For a safe stage-transfer test, use a test project and add an unpaid Monthly payment row before moving it from Finished to Finished Projects with monthly payments. Do not alter the existing Finished project unless you intend to.
6. Test permanent deletion only with a disposable test inquiry/project. A confirmed deletion cannot be undone.
7. Check the statistics for a month with known entries. Expenses count in their due/expense month even if still Unpaid; profit equals received income minus all expense entries dated in that month.

## Fresh-project setup reference

For a brand-new Supabase project only:

1. Run `supabase-schema.sql` in Supabase **SQL Editor**. It now includes the private expenses table as well as inquiries.
2. Create the single admin account under **Authentication → Users**; keep public sign-ups disabled.
3. In Vercel **Settings → Environment Variables**, configure Production values for `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `ADMIN_EMAIL`.
4. Keep the secret/service-role key server-side in Vercel. Never place secrets in HTML, JavaScript, GitHub, or chat. The code accepts the legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` names as an alternative.

## Security and privacy notes

- The browser never receives the Supabase secret/service-role key. Private dashboard API calls require a Supabase Auth session for the configured admin email.
- Client records include names, email addresses, mobile numbers, inquiry text, and, when managed as projects, package/payment details and domain provider, renewal date, name, and email address. Expense records include descriptions, categories, amounts, dates, status, and an optional project link.
- Payment and expense records are manual bookkeeping only; the dashboard does not process or verify payments. Never enter card/bank details, email passwords, or registrar/hosting passwords.
- Renewal reminders and the Inbox badge are in-app only. No email or text notification integration is included.
- Review the Privacy Policy and confirm it accurately describes the business's actual retention and practices.
