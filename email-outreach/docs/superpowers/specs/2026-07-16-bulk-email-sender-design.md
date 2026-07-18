# Bulk Email Sender — Design

## Context

Client-facing deliverable: a website that lets a sender dispatch one message to many
recipients, entered manually or via CSV upload. Deploys to Vercel. Built from a found,
orphaned Flask template (`Email Dispatcher.html`) that referenced a backend which never
existed — dead `{{ url_for(...) }}` tags, calls to `/api/schedule`/`/api/jobs` with no
server behind them.

Client's actual volume/audience is unknown (builder is delivering this to someone else,
not using it themselves). Design is deliberately conservative and credential-free rather
than tuned to a guessed use case. See "Open questions for the client" at the end.

## Requirements

- Recipients via manual entry (repeatable rows) and CSV bulk upload.
- Per-recipient merge fields driven by whatever columns the CSV has (not fixed to
  name/company).
- Sending credentials belong to whoever runs the site, never to the codebase. No key,
  password, or secret ships in the repo.
- Contacted-address history stored client-side (browser), with an explicit export option.
  No permission dialog for writing it — the browser already grants that; a prompt here
  only adds friction. The one moment a real OS-level consent dialog happens is the CSV
  **download**, which the browser handles itself.
- Graceful handling of upload edge cases — specifically: cancelling the native file
  picker must not throw or show an error, since `<input type="file">` fires no event at
  all on cancel.
- No persistent server-side state. Vercel functions are stateless/ephemeral by design;
  fighting that (e.g. writing SQLite files) would silently lose data between invocations.

## Architecture

**Two pieces:**

1. **Static/front-end page** (adapted from the existing HTML) — form, CSV parsing,
   progress UI, history panel. Keeps the existing visual design (starfield background,
   glass-panel styling) since it was already well executed.
2. **One serverless function**, `/api/send` — accepts one recipient + credentials +
   rendered message per call, sends via SMTP, returns success/failure. Stateless: it
   holds nothing after the response is sent, logs no credentials, persists nothing.

**Why per-recipient calls instead of one server-side loop:** Vercel functions have a
timeout (60s+ depending on plan). A single function sending 200 emails sequentially
risks hitting that ceiling mid-batch, silently losing the tail of the list with no
per-recipient result. Looping in the browser and calling `/api/send` once per recipient
sidesteps the timeout entirely and gives real per-recipient status (sent/failed) instead
of an opaque batch result.

**Why SMTP, not an ESP (Resend/SendGrid/SES):** unknown volume and audience. SMTP works
with credentials the client already has (a Gmail app password, an existing mailbox) —
no domain purchase, no DNS records, no provider signup, no approval wait. If real volume
later turns out to be needed, that's an adapter swap, not a rewrite (see Non-goals).

**Why no database:** history belongs to the browser (`localStorage`), not the server,
per the client's original request that contact history stay local and out of central
storage. A serverless function has no durable local disk to put a database on anyway.

### Data flow

```
Browser                                  Vercel Function (/api/send)
--------                                  ---------------------------
1. User enters SMTP creds (session only,
   never sent anywhere until step 4)
2. User adds recipients: manual rows
   and/or CSV upload → parsed into
   [{email, ...merge columns}, ...]
3. Message template rendered per-
   recipient client-side ({name},
   {company}, any CSV column)
4. For each recipient, sequentially:
      POST {smtp creds, to, subject,
            body} ------------------->  Connect to SMTP host, send,
                                          disconn"ect, return {ok|error}
      <---- {status} --------------    (nothing persisted, nothing logged)
   Update progress bar + per-row status
5. On batch completion: append sent
   addresses + timestamp to
   localStorage history
6. "Download history as CSV" available
   any time — triggers browser's native
   file-save, not a custom permission
   flow
```

### Components

| Component | Responsibility | Notes |
|---|---|---|
| `index.html` (+ inline CSS/JS, adapted from existing file) | Form, recipient rows, CSV upload, progress, history panel | Reuse starfield + glass-panel visuals; remove scheduling UI (date/time fields, ledger-as-scheduler framing) |
| `csvParse` (client-side JS) | Parse uploaded CSV into recipient objects; surface per-row errors without blocking valid rows | Pure function, unit-testable in isolation |
| `mergeRender` (client-side JS) | Substitute `{column}` placeholders in subject/body per recipient | Pure function; unrecognized placeholders left visibly unrendered rather than silently blanked, so a typo like `{compnay}` is obvious before send, not after |
| `historyStore` (client-side JS) | Read/write `localStorage` history; export to CSV | Wraps `localStorage` behind functions so the storage mechanism could change later without touching callers |
| `api/send.js` (Vercel function) | One SMTP send per invocation | No logging of credentials or message bodies; scrub before any thrown error is returned to the client |

### Error handling

- **Cancelled file picker**: no `change` event fires; the upload button never enters a
  loading state until a `change` event with `files.length > 0` actually arrives. No
  error path is reached because none is entered.
- **Empty or malformed CSV**: parsed rows with no valid email are excluded and counted;
  the UI reports "12 of 15 rows valid, 3 skipped" rather than failing the whole upload
  or silently dropping the count.
- **Per-recipient send failure** (bad address, SMTP auth failure, rate limit): captured
  as a row-level status, does not stop the batch. SMTP auth failure specifically (wrong
  password) is detected on the *first* send and stops the batch early with one clear
  message, rather than repeating the same auth error 200 times.
- **Network failure calling `/api/send`**: treated as a per-recipient failure, retryable
  by re-running just the failed rows (UI keeps them selected after a batch completes).

### Testing

- `csvParse` and `mergeRender`: pure functions, unit tests with valid/invalid/edge-case
  CSV content (empty file, missing email column, extra columns, header-only file).
- File-input cancel behavior: manual QA check (simulating a real cancel via automated
  test is unreliable across browsers), explicitly called out in the QA pass before
  handoff.
- `api/send.js`: unit-testable with a fake SMTP transport injected; no real network
  calls in the test suite, no real credentials anywhere in test fixtures.

## Non-goals (explicitly out of scope, and why)

- **No credentials, API keys, or domain configuration shipped in the code** — this is a
  deliverable handed to someone else; anything shipped in the repo is now a liability
  the builder doesn't control after handoff.
- **No scheduling** ("send later") — the original found template implied this, but it
  requires either an always-on server to persist SMTP credentials until fire time, or a
  cron-triggered Vercel function with credentials stored server-side. Both conflict with
  "credentials belong to the client, never to the code." If the client needs scheduling
  later, that's a distinct project with a real credential-storage design, not an add-on.
- **No ESP integration, deliverability tooling, or suppression-list enforcement** —
  appropriate for a known high-volume cold-outreach use case, but the actual use case
  here is unknown. Building it now would be solving a problem that may not exist while
  adding real complexity (domain auth, warm-up pacing, legal suppression requirements)
  that may not apply.
- **No login/auth on the site itself** — since the function is stateless and holds no
  standing credentials of its own, an unauthenticated visitor can at most send email
  using credentials *they* type in themselves. There is no shared secret to protect.
  (If the client's SMTP account has real sending limits they care about, that's between
  them and their mail provider, not something this app needs to gate.)

## Open questions for the client (to pass along, not guessed at here)

1. What SMTP provider/account will actually be used (Gmail, Outlook, a business
   mailbox)? Confirms the "app password" framing in the UI hint is still correct.
2. Roughly how many recipients per send, and are they people who've had prior contact?
   Determines whether Gmail-style SMTP limits (~500/day) are workable or whether a real
   ESP is needed later.
3. Is this used for any commercial/marketing message? If so, they need an unsubscribe
   mechanism and a physical mailing address in the footer to meet CAN-SPAM/GDPR — both
   out of scope for this build since they depend on legal specifics of their business.
