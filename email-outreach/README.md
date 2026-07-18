# Bulk Email Sender

Send one message to many recipients — manual entry or CSV upload — from a single
static page. Deploys to Vercel with zero configuration.

## How credentials work

This app never stores or ships any email credentials. Whoever uses the site types in
their own SMTP host, port, username, and password (e.g. a Gmail address + an [App
Password](https://myaccount.google.com/apppasswords)) each time they use it. Those
credentials are held in the browser tab only and sent straight through to the sending
step — never written to disk, a database, or a log, on either the browser or server
side.

## Running locally

```
npm install
npx vercel dev
```

## Deploying

```
npx vercel deploy
```

No environment variables are required for this app to function — the person using the
site supplies their own SMTP credentials in the form.

## Open questions for whoever is actually using this site (not answered by this build)

1. **Which SMTP provider/account will be used** (Gmail, Outlook, a business mailbox)?
   The in-app hint assumes a Gmail App Password; if a different provider is used, the
   host/port fields still work but the hint text may need adjusting.
2. **Roughly how many recipients per send, and have they had prior contact?** Gmail
   SMTP caps around 500 sends/day and flags accounts that send identical mail to
   strangers at volume. If the real need is larger, cold, B2B-style outreach, a
   dedicated email service (with a verified sending domain and unsubscribe handling)
   is the right next step — this build intentionally does not include that.
3. **Is any message here commercial/marketing?** If so, CAN-SPAM/GDPR require a working
   unsubscribe mechanism and a physical mailing address in the footer. This build does
   not include either since they depend on details of the sender's business.
