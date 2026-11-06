# PetersWeb Solutions admin and inquiry-email setup

## Current production state

The admin dashboard’s first- and second-wave features are deployed on Vercel. The second-wave Supabase migration has already been run successfully. Existing inquiry/project records and stages are preserved. **Do not rerun** `supabase-schema.sql`, `supabase-admin-enhancements-migration.sql`, or `supabase-expenses-migration.sql` on the existing production project.

Valid public-form submissions are stored in the Supabase `inquiries` table and appear in the admin Inbox. The email-notification enhancement in this source package is a separate update: it will send email only after the updated source is deployed and the Resend settings below are configured.

## What the inquiry-email update does

After a valid inquiry is saved to Supabase, the Vercel API sends two separate transactional emails through Resend:

1. **Business notification** to `INQUIRY_NOTIFY_EMAIL`, with the inquiry details and a link to the admin Inbox. Replying to that message goes to the visitor.
2. **Visitor acknowledgment** to the email entered in the form. Replying to that message goes to the business inbox.

The acknowledgment copy is: “Thank you for reaching out to PetersWeb Solutions! We’ve received your inquiry. We’ll be in touch by email or phone so we can discuss how we can help.”

The inquiry is saved before email is attempted. If email delivery is not configured or the provider is temporarily unavailable, the record remains in the admin Inbox and the visitor sees that an automatic confirmation could not be sent. The form does not send marketing emails.

## Enable email delivery for the existing live site

No Bash or command-line steps are needed. You will need access to Resend, the DNS settings for `peterswebsolutions.com`, and the Vercel project.

### 1. Verify the sender domain with Resend

1. Create/sign in to a Resend account at <https://resend.com>.
2. In Resend, open **Domains → Add Domain** and add `peterswebsolutions.com` for the sender `admin@peterswebsolutions.com`.
3. Copy the DNS records Resend displays and add them at the provider that manages the domain’s DNS. Use the record names and values exactly as shown; leave existing website records unchanged.
4. **Do not delete or replace existing MX records** used by the `admin@peterswebsolutions.com` mailbox. If Resend shows a record that conflicts with an existing record, pause before changing DNS and get help reviewing it.
5. Wait for Resend to show the domain as **Verified**. DNS verification can take some time.

Resend requires a verified sender domain. It also recommends sending from a subdomain for reputation separation; if you prefer a subdomain instead, pause before proceeding because the sender address and Vercel value will need to match it. See Resend’s [domain setup guide](https://resend.com/docs/add-a-domain) and [sender-address guide](https://resend.com/docs/knowledge-base/how-do-I-create-an-email-address-or-sender-in-resend).

### 2. Create a Resend API key

1. In Resend, open **API Keys** and create a key that has permission to send email (use the narrowest available permission).
2. Copy it for the next step. Keep it private: **do not send it in chat, put it in GitHub, or add it to website JavaScript.**

### 3. Add the settings to Vercel

1. Open Vercel and select project `project-e7yjm`.
2. Go to **Settings → Environment Variables**.
3. Add these three **Production** variables:

   | Name | Value |
   |---|---|
   | `RESEND_API_KEY` | The private API key from Resend |
   | `INQUIRY_NOTIFY_EMAIL` | `admin@peterswebsolutions.com` |
   | `INQUIRY_FROM_EMAIL` | `PetersWeb Solutions <admin@peterswebsolutions.com>` |

4. Save the variables. If a value changes, redeploy so the Production function receives the updated settings.

These inquiry-email settings are separate from `ADMIN_EMAIL`, which only controls who may sign in to `/admin/`. Keep all Supabase and Resend secret keys server-side in Vercel; never add them to HTML, browser JavaScript, GitHub, or chat.

### 4. Upload and deploy the source update

1. Download and extract `petersweb-website-source-admin-inquiry-email.zip`.
2. In the connected GitHub repository, choose **Add file → Upload files**.
3. Upload the extracted files and folders to the repository root, preserving their folder structure. Do not upload the ZIP as one file.
4. Commit the changes to `main` and wait for the Vercel Production deployment to show **Ready**.

No Supabase migration is required for inquiry email delivery.

### 5. Test both emails

1. Submit one test inquiry on the live website using an email address you can check.
2. Confirm the inquiry appears once in `/admin/` → **Inbox**.
3. Confirm the notification reaches `admin@peterswebsolutions.com` and the visitor address receives the acknowledgment. Check Spam/Junk if either message is missing.
4. In Resend, check the email logs for accepted, delivered, bounced, or rejected status. A provider-accepted send is not a guarantee that the recipient’s mailbox placed it in Inbox.

## Existing admin behavior

- **Project stages:** Inbox, Standby, On-going, Finished, and Finished Projects with monthly payments. A completed project moves to the monthly-payment destination only when it has at least one unpaid Monthly payment row.
- **Permanent deletion:** deleting a client/project permanently removes its inquiry, payment schedule, domain details, and admin notes. Linked expense entries remain but are unlinked. Expense rows have a separate permanent-delete confirmation.
- **Monthly Expenses:** dated one-time entries and recurring monthly bills. Marking a recurring bill Paid creates the next month’s Unpaid row. Expense rows count in their due/expense month whether Paid or Unpaid.
- **Project Statistics:** retains the current-month summary and compares all available months. Income is payments received in that month; receivables are unpaid scheduled payments due in that month; expenses include all rows dated in that month; profit is income minus those expenses; inquiry and finished-project counts use their submission and recorded completion months.
- **Domain reminders:** renewal reminders remain in-dashboard only; they do not send email or SMS. They are separate from public inquiry emails.

## Fresh-project setup reference only

For a brand-new Supabase project only:

1. Run `supabase-schema.sql` in Supabase **SQL Editor**.
2. Create the single admin account under **Authentication → Users**; keep public sign-ups disabled.
3. In Vercel **Settings → Environment Variables**, configure Production values for `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `ADMIN_EMAIL`.
4. Keep the Supabase secret/service-role key server-side in Vercel.

Do not use this fresh-project section to reset or recreate the existing production database.

## Security and privacy notes

- The browser never receives Supabase or Resend secret keys. Admin API calls require a Supabase Auth session for the configured admin email.
- The business notification email contains form details so the business can reply; the visitor acknowledgment confirms receipt and includes a reference number.
- Inquiry data remains stored in Supabase even when email delivery fails. Check the admin Inbox as the record of truth.
- Payment and expense records are manual bookkeeping only. Never enter card/bank details, email passwords, or registrar/hosting passwords in the form or dashboard.
- Review the Privacy Policy to ensure it matches the business’s actual email-provider, retention, and communication practices.
