# Bulk Email Sender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a credential-free, Vercel-deployable bulk email website: one static
HTML page (manual + CSV recipient entry, client-side history) backed by one stateless
serverless function that sends a single SMTP message per call.

**Architecture:** Static `index.html` + client-side ES module (`app.js`) drives the
whole flow in the browser — CSV parsing, per-recipient merge-field rendering, progress
loop, `localStorage` history. It calls `/api/send` once per recipient; that function is
a thin, stateless wrapper around a core `sendMail` function that takes SMTP credentials
supplied by the *caller* (typed into the form each session) and never persists or logs
them. No database, no env-var secrets, no scheduling.

**Tech Stack:** Plain HTML/CSS + browser-native ES modules (no bundler, no build step),
Node.js on Vercel serverless functions, `nodemailer` for SMTP, Node's built-in
`node:test` runner for unit tests (no test framework dependency).

## Global Constraints

- No API keys, passwords, or SMTP credentials are ever hardcoded, stored in `.env`, or
  written to any file in this repo. Credentials are supplied by the site's user, per
  session, and forwarded to `/api/send` over HTTPS only.
- No server-side persistence (no database, no filesystem writes) — Vercel functions are
  ephemeral; contact history lives in the browser's `localStorage` only.
- No scheduling/"send later" — every send happens as an immediate, in-browser loop.
- File-picker cancellation (`<input type="file">` with no `change` event) must never
  produce an error state or a stuck "loading" UI.
- Every pure function (CSV parsing, merge rendering, history formatting, core SMTP send)
  must be usable identically from Node tests and from the browser — same file, no
  transpilation.
- Node.js >= 18 assumed (for `node:test`, `node:assert`, native `fetch`).

---

## File Structure

```
email-outreach/
  package.json          # type: module, nodemailer dependency, npm test script
  index.html             # the page: form, recipient rows, CSV upload, progress, history
  app.js                 # client-side orchestration: wires lib/* to the DOM
  lib/
    csvParse.js          # parseCsv(text) -> {rows, errors, validCount, totalCount}
    mergeRender.js        # renderTemplate(template, data) -> string
    historyStore.js       # loadHistory/appendHistory/historyToCsv, storage injected
    sendMail.js            # sendMail({smtp, message, transportFactory}) -> {ok, ...}
  api/
    send.js                # Vercel function: thin wrapper around lib/sendMail.js
  tests/
    csvParse.test.js
    mergeRender.test.js
    historyStore.test.js
    sendMail.test.js
    send.handler.test.js
  README.md               # setup + the "open questions for the client" list
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `README.md`
- Test: none (verified by running the test script with zero test files, then again after Task 2 adds one)

**Interfaces:**
- Produces: `npm test` command that all later tasks' tests run under; ESM (`"type": "module"`) used by every subsequent file.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "bulk-email-sender",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  },
  "dependencies": {
    "nodemailer": "^6.9.14"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd ~/Projects/email-outreach && npm install`
Expected: `nodemailer` and its transitive deps installed, `node_modules/` and
`package-lock.json` created.

- [ ] **Step 3: Create `README.md`**

```markdown
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
```

- [ ] **Step 4: Commit**

No git repo for this project (by request) — skip commit steps throughout this plan.
Each task's "done" signal is its test command passing, not a commit.

---

### Task 2: `lib/csvParse.js`

**Files:**
- Create: `lib/csvParse.js`
- Test: `tests/csvParse.test.js`

**Interfaces:**
- Produces: `parseCsv(text: string) -> { rows: Array<{email: string, [col: string]: string}>, errors: Array<{line: number, reason: string}>, validCount: number, totalCount: number }`
  - `rows[i]` always has a lowercase `email` key plus one key per other CSV column
    (lowercased header names), used later by `mergeRender`'s `renderTemplate`.
  - A CSV with no `email` column produces `rows: []` and a single error explaining that.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/csvParse.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../lib/csvParse.js';

test('parses a valid CSV with extra merge columns', () => {
  const csv = 'email,name,company\nsam@example.com,Sam,Acme\npat@example.com,Pat,Globex';
  const result = parseCsv(csv);
  assert.equal(result.totalCount, 2);
  assert.equal(result.validCount, 2);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.rows[0], { email: 'sam@example.com', name: 'Sam', company: 'Acme' });
  assert.deepEqual(result.rows[1], { email: 'pat@example.com', name: 'Pat', company: 'Globex' });
});

test('skips invalid email rows but keeps the valid ones, and reports skipped count', () => {
  const csv = 'email,name\nsam@example.com,Sam\nnot-an-email,Bad\n,Empty';
  const result = parseCsv(csv);
  assert.equal(result.totalCount, 3);
  assert.equal(result.validCount, 1);
  assert.equal(result.errors.length, 2);
  assert.equal(result.rows[0].email, 'sam@example.com');
});

test('empty file produces zero rows and zero errors, not a crash', () => {
  const result = parseCsv('');
  assert.deepEqual(result, { rows: [], errors: [], validCount: 0, totalCount: 0 });
});

test('missing email column produces a clear error and no rows', () => {
  const csv = 'name,company\nSam,Acme';
  const result = parseCsv(csv);
  assert.equal(result.rows.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].reason, /email column/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/csvParse.test.js` (or `node --test tests/csvParse.test.js`)
Expected: FAIL — `Cannot find module '../lib/csvParse.js'`

- [ ] **Step 3: Write the implementation**

```javascript
// lib/csvParse.js
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCsv(text) {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: [], validCount: 0, totalCount: 0 };
  }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const emailIdx = header.indexOf('email');

  if (emailIdx === -1) {
    return {
      rows: [],
      errors: [{ line: 1, reason: 'No "email column" found in the CSV header row.' }],
      validCount: 0,
      totalCount: 0,
    };
  }

  const rows = [];
  const errors = [];
  const dataLines = lines.slice(1);

  dataLines.forEach((line, i) => {
    const cells = line.split(',').map((c) => c.trim());
    const email = (cells[emailIdx] || '').toLowerCase();

    if (!EMAIL_RE.test(email)) {
      errors.push({ line: i + 2, reason: `"${cells[emailIdx] || ''}" is not a valid email address.` });
      return;
    }

    const row = { email };
    header.forEach((col, colIdx) => {
      if (col === 'email') return;
      row[col] = cells[colIdx] !== undefined ? cells[colIdx] : '';
    });
    rows.push(row);
  });

  return { rows, errors, validCount: rows.length, totalCount: dataLines.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/csvParse.test.js`
Expected: PASS (4 tests passing, 0 failing)

---

### Task 3: `lib/mergeRender.js`

**Files:**
- Create: `lib/mergeRender.js`
- Test: `tests/mergeRender.test.js`

**Interfaces:**
- Consumes: a `row` object shaped like `parseCsv`'s `rows[i]` (lowercase keys).
- Produces: `renderTemplate(template: string, data: Record<string,string>) -> string`
  — replaces `{column}` (case-insensitive key lookup) with `data[column]`; any
  placeholder whose key isn't present in `data` is left in the output verbatim, so a
  typo like `{compnay}` stays visible instead of silently disappearing.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/mergeRender.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate } from '../lib/mergeRender.js';

test('substitutes known merge fields', () => {
  const out = renderTemplate('Hi {name}, from {company}', { name: 'Sam', company: 'Acme' });
  assert.equal(out, 'Hi Sam, from Acme');
});

test('leaves unknown placeholders untouched so typos are visible', () => {
  const out = renderTemplate('Hi {name}, re: {compnay}', { name: 'Sam', company: 'Acme' });
  assert.equal(out, 'Hi Sam, re: {compnay}');
});

test('is case-insensitive on the placeholder key', () => {
  const out = renderTemplate('Hi {Name}', { name: 'Sam' });
  assert.equal(out, 'Hi Sam');
});

test('handles a template with no placeholders', () => {
  const out = renderTemplate('Hello there', { name: 'Sam' });
  assert.equal(out, 'Hello there');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/mergeRender.test.js`
Expected: FAIL — `Cannot find module '../lib/mergeRender.js'`

- [ ] **Step 3: Write the implementation**

```javascript
// lib/mergeRender.js
export function renderTemplate(template, data) {
  const lowerData = {};
  for (const key of Object.keys(data)) {
    lowerData[key.toLowerCase()] = data[key];
  }

  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const lookupKey = key.toLowerCase();
    return Object.prototype.hasOwnProperty.call(lowerData, lookupKey) ? lowerData[lookupKey] : match;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/mergeRender.test.js`
Expected: PASS (4 tests passing, 0 failing)

---

### Task 4: `lib/historyStore.js`

**Files:**
- Create: `lib/historyStore.js`
- Test: `tests/historyStore.test.js`

**Interfaces:**
- Consumes: a `storage`-shaped object with `getItem(key)` and `setItem(key, value)`
  (matches the browser's `window.localStorage` API; tests inject an in-memory fake).
- Produces:
  - `loadHistory(storage) -> Array<{email, name, subject, sentAt, status}>`
  - `appendHistory(storage, records: Array<{...}>) -> void`
  - `historyToCsv(records: Array<{...}>) -> string`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/historyStore.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadHistory, appendHistory, historyToCsv } from '../lib/historyStore.js';

function makeFakeStorage() {
  const store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = value; },
  };
}

test('loadHistory returns an empty array when nothing has been stored yet', () => {
  const storage = makeFakeStorage();
  assert.deepEqual(loadHistory(storage), []);
});

test('appendHistory adds records and loadHistory reads them back', () => {
  const storage = makeFakeStorage();
  appendHistory(storage, [{ email: 'sam@example.com', name: 'Sam', subject: 'Hi', sentAt: '2026-07-16T10:00:00Z', status: 'sent' }]);
  appendHistory(storage, [{ email: 'pat@example.com', name: 'Pat', subject: 'Hi', sentAt: '2026-07-16T10:01:00Z', status: 'failed' }]);

  const history = loadHistory(storage);
  assert.equal(history.length, 2);
  assert.equal(history[0].email, 'sam@example.com');
  assert.equal(history[1].status, 'failed');
});

test('historyToCsv produces a header row plus one row per record', () => {
  const csv = historyToCsv([
    { email: 'sam@example.com', name: 'Sam', subject: 'Hi', sentAt: '2026-07-16T10:00:00Z', status: 'sent' },
  ]);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'email,name,subject,sentAt,status');
  assert.equal(lines[1], 'sam@example.com,Sam,Hi,2026-07-16T10:00:00Z,sent');
});

test('historyToCsv on an empty list still returns just the header', () => {
  const csv = historyToCsv([]);
  assert.equal(csv.trim(), 'email,name,subject,sentAt,status');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/historyStore.test.js`
Expected: FAIL — `Cannot find module '../lib/historyStore.js'`

- [ ] **Step 3: Write the implementation**

```javascript
// lib/historyStore.js
const STORAGE_KEY = 'bulkEmailHistory';

export function loadHistory(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendHistory(storage, records) {
  const existing = loadHistory(storage);
  const combined = existing.concat(records);
  storage.setItem(STORAGE_KEY, JSON.stringify(combined));
}

const CSV_COLUMNS = ['email', 'name', 'subject', 'sentAt', 'status'];

export function historyToCsv(records) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const record of records) {
    lines.push(CSV_COLUMNS.map((col) => record[col] ?? '').join(','));
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/historyStore.test.js`
Expected: PASS (4 tests passing, 0 failing)

---

### Task 5: `lib/sendMail.js`

**Files:**
- Create: `lib/sendMail.js`
- Test: `tests/sendMail.test.js`

**Interfaces:**
- Consumes: `nodemailer` (real default), or an injected fake `transportFactory` in
  tests.
- Produces: `sendMail({ smtp, message, transportFactory? }) -> Promise<{ ok: true, messageId: string } | { ok: false, error: string }>`
  - `smtp: { host, port, secure, user, pass }`
  - `message: { to, subject, text }`
  - Never includes `smtp.pass` in a returned/thrown error string.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/sendMail.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendMail } from '../lib/sendMail.js';

const smtp = { host: 'smtp.example.com', port: 587, secure: false, user: 'me@example.com', pass: 'super-secret-pass' };
const message = { to: 'sam@example.com', subject: 'Hi', text: 'Hello Sam' };

test('returns ok:true with a messageId on successful send', async () => {
  const fakeTransportFactory = () => ({
    sendMail: async () => ({ messageId: 'abc123' }),
  });
  const result = await sendMail({ smtp, message, transportFactory: fakeTransportFactory });
  assert.deepEqual(result, { ok: true, messageId: 'abc123' });
});

test('returns ok:false with a scrubbed error on failure, never leaking the password', async () => {
  const fakeTransportFactory = () => ({
    sendMail: async () => { throw new Error(`auth failed for user with pass ${smtp.pass}`); },
  });
  const result = await sendMail({ smtp, message, transportFactory: fakeTransportFactory });
  assert.equal(result.ok, false);
  assert.ok(!result.error.includes(smtp.pass), 'error must not contain the SMTP password');
});

test('passes smtp auth and message fields through to the transport', async () => {
  let receivedConfig;
  let receivedMessage;
  const fakeTransportFactory = (config) => {
    receivedConfig = config;
    return {
      sendMail: async (msg) => {
        receivedMessage = msg;
        return { messageId: 'xyz' };
      },
    };
  };
  await sendMail({ smtp, message, transportFactory: fakeTransportFactory });
  assert.equal(receivedConfig.host, 'smtp.example.com');
  assert.equal(receivedConfig.auth.user, 'me@example.com');
  assert.equal(receivedMessage.to, 'sam@example.com');
  assert.equal(receivedMessage.subject, 'Hi');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sendMail.test.js`
Expected: FAIL — `Cannot find module '../lib/sendMail.js'`

- [ ] **Step 3: Write the implementation**

```javascript
// lib/sendMail.js
import nodemailer from 'nodemailer';

function defaultTransportFactory(config) {
  return nodemailer.createTransport(config);
}

export async function sendMail({ smtp, message, transportFactory = defaultTransportFactory }) {
  const transport = transportFactory({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  try {
    const result = await transport.sendMail({
      from: smtp.user,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    return { ok: true, messageId: result.messageId };
  } catch (err) {
    const scrubbed = String(err.message || err).split(smtp.pass).join('[redacted]');
    return { ok: false, error: scrubbed };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/sendMail.test.js`
Expected: PASS (3 tests passing, 0 failing)

---

### Task 6: `api/send.js`

**Files:**
- Create: `api/send.js`
- Test: `tests/send.handler.test.js`

**Interfaces:**
- Consumes: `sendMail` from `lib/sendMail.js` (Task 5).
- Produces: `createHandler(sendMailImpl) -> (req, res) => Promise<void>`, and a default
  export (`export default createHandler(sendMail)`) that Vercel invokes directly at
  `/api/send`. Request body shape: `{ smtp: {...}, to, subject, text }`. Response:
  `200 {ok:true, messageId}` / `502 {ok:false, error}` / `400 {ok:false, error}` for a
  malformed request / `405` for non-POST.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/send.handler.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/send.js';

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test('rejects non-POST requests with 405', async () => {
  const handler = createHandler(async () => ({ ok: true, messageId: 'x' }));
  const req = { method: 'GET', body: {} };
  const res = makeRes();
  await handler(req, res);
  assert.equal(res.statusCode, 405);
});

test('rejects a request missing required fields with 400', async () => {
  const handler = createHandler(async () => ({ ok: true, messageId: 'x' }));
  const req = { method: 'POST', body: { smtp: { host: 'x' } } };
  const res = makeRes();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
});

test('returns 200 and the send result on success', async () => {
  const handler = createHandler(async () => ({ ok: true, messageId: 'abc' }));
  const req = {
    method: 'POST',
    body: {
      smtp: { host: 'smtp.example.com', port: 587, secure: false, user: 'me@example.com', pass: 'x' },
      to: 'sam@example.com',
      subject: 'Hi',
      text: 'Hello',
    },
  };
  const res = makeRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, messageId: 'abc' });
});

test('returns 502 when the underlying send fails', async () => {
  const handler = createHandler(async () => ({ ok: false, error: 'auth failed' }));
  const req = {
    method: 'POST',
    body: {
      smtp: { host: 'smtp.example.com', port: 587, secure: false, user: 'me@example.com', pass: 'x' },
      to: 'sam@example.com',
      subject: 'Hi',
      text: 'Hello',
    },
  };
  const res = makeRes();
  await handler(req, res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/send.handler.test.js`
Expected: FAIL — `Cannot find module '../api/send.js'`

- [ ] **Step 3: Write the implementation**

```javascript
// api/send.js
import { sendMail } from '../lib/sendMail.js';

export function createHandler(sendMailImpl) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    const { smtp, to, subject, text } = req.body || {};

    if (!smtp || !smtp.host || !smtp.user || !smtp.pass || !to) {
      res.status(400).json({ ok: false, error: 'Missing required fields' });
      return;
    }

    const result = await sendMailImpl({ smtp, message: { to, subject, text } });
    res.status(result.ok ? 200 : 502).json(result);
  };
}

export default createHandler(sendMailWrapper);

async function sendMailWrapper({ smtp, message }) {
  return sendMail({ smtp, message });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/send.handler.test.js`
Expected: PASS (4 tests passing, 0 failing)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: All test files pass (csvParse, mergeRender, historyStore, sendMail,
send.handler) — the whole backend/logic layer is now covered with zero real network
calls and zero real credentials anywhere in the test run.

---

### Task 7: `index.html` + `app.js` — the page itself

**Files:**
- Create: `index.html`
- Create: `app.js`
- Test: manual QA checklist (below) — no automated test, per the design doc's
  testing section, since simulating a real native file-picker cancel is unreliable
  across headless test environments.

**Interfaces:**
- Consumes: `parseCsv` (Task 2), `renderTemplate` (Task 3), `loadHistory` /
  `appendHistory` / `historyToCsv` (Task 4), and calls `POST /api/send` (Task 6) once
  per recipient.

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bulk Email Sender</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #050507;
    --surface: rgba(24, 24, 27, 0.65);
    --text-main: #F4F4F5;
    --text-muted: #A1A1AA;
    --border: rgba(255, 255, 255, 0.1);
    --border-focus: rgba(255, 255, 255, 0.3);
    --primary: #FFFFFF;
    --primary-text: #09090B;
    --primary-hover: #E4E4E7;
    --danger: #F87171;
    --danger-bg: rgba(239, 68, 68, 0.15);
    --success: #34D399;
    --success-bg: rgba(16, 185, 129, 0.15);
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    --font-mono: 'JetBrains Mono', ui-monospace, monospace;
    --radius-sm: 8px;
    --radius-md: 16px;
    --shadow-sm: 0 4px 24px -4px rgba(0, 0, 0, 0.5);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text-main);
    font-family: var(--font-sans);
    min-height: 100vh;
    line-height: 1.5;
  }
  .office { max-width: 1180px; margin: 0 auto; padding: 3rem 1.5rem 5rem; }
  .masthead { margin-bottom: 3rem; text-align: center; }
  .masthead h1 { font-size: 2.5rem; font-weight: 600; margin: 0.5rem 0; }
  .subtitle { color: var(--text-muted); }
  .desk { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(340px, 1fr); gap: 2.5rem; align-items: start; }
  @media (max-width: 880px) { .desk { grid-template-columns: 1fr; } }
  .glass-panel {
    background: var(--surface);
    backdrop-filter: blur(16px);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    padding: 2rem;
  }
  .field { margin-bottom: 1.25rem; display: flex; flex-direction: column; gap: 0.4rem; }
  .field-row.two-up { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
  @media (max-width: 520px) { .field-row.two-up { grid-template-columns: 1fr; } }
  .field label { font-size: 0.85rem; color: var(--text-muted); }
  .field input, .field textarea {
    font-family: var(--font-sans);
    font-size: 0.95rem;
    padding: 0.7rem 0.8rem;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-main);
  }
  .field input:focus, .field textarea:focus {
    outline: none;
    border-color: var(--border-focus);
  }
  .hint { font-size: 0.8rem; color: #71717A; margin: -0.5rem 0 1.25rem; }
  .manifest-rows { display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 1rem; }
  .manifest-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.6rem; }
  .manifest-row input {
    font-size: 0.9rem;
    padding: 0.55rem 0.7rem;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-main);
  }
  .ghost-btn, .stamp-btn, .remove-row {
    cursor: pointer;
    border-radius: var(--radius-sm);
    font-weight: 500;
  }
  .ghost-btn {
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    color: var(--text-main);
    font-size: 0.85rem;
    padding: 0.5rem 0.85rem;
  }
  .ghost-btn:hover { background: rgba(255,255,255,0.08); }
  .remove-row {
    background: none; border: none; color: #52525B; font-size: 1.1rem; padding: 0.2rem 0.5rem;
  }
  .remove-row:hover { color: var(--danger); }
  .stamp-btn {
    width: 100%;
    padding: 0.9rem;
    background: var(--primary);
    color: var(--primary-text);
    border: none;
    font-size: 1rem;
    margin-top: 0.5rem;
  }
  .stamp-btn:hover { background: var(--primary-hover); }
  .stamp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .form-error { color: var(--danger); font-size: 0.85rem; min-height: 1.2em; margin-top: 0.75rem; }
  .form-note { color: var(--success); font-size: 0.85rem; min-height: 1.2em; margin-top: 0.75rem; }
  .progress-track {
    height: 8px;
    background: rgba(255,255,255,0.08);
    border-radius: 4px;
    overflow: hidden;
    margin: 1rem 0;
    display: none;
  }
  .progress-fill { height: 100%; background: var(--primary); width: 0%; transition: width 0.2s ease; }
  .recipient-status-list { list-style: none; margin: 0.5rem 0 0; padding: 0; font-family: var(--font-mono); font-size: 0.78rem; max-height: 220px; overflow-y: auto; }
  .recipient-status-list li { padding: 0.3rem 0; color: var(--text-muted); display: flex; justify-content: space-between; gap: 0.5rem; }
  .recipient-status-list li.r-sent { color: var(--success); }
  .recipient-status-list li.r-failed { color: var(--danger); }
  .ledger-empty { color: var(--text-muted); text-align: center; padding: 2rem 0; font-size: 0.9rem; }
  .history-row { display: flex; justify-content: space-between; font-size: 0.85rem; padding: 0.5rem 0; border-bottom: 1px solid var(--border); }
  .history-row:last-child { border-bottom: none; }
  h2 { font-size: 1.15rem; margin: 0 0 1.25rem; }
</style>
</head>
<body>

<div class="office">
  <header class="masthead">
    <span class="hint">Bulk Email Sender</span>
    <h1>Send one message to many people</h1>
    <p class="subtitle">Add recipients by hand or upload a CSV. Your email credentials stay in this browser tab only.</p>
  </header>

  <main class="desk">
    <section class="glass-panel" aria-labelledby="form-heading">
      <h2 id="form-heading">New send</h2>

      <form id="send-form" novalidate>
        <div class="field-row two-up">
          <div class="field">
            <label for="smtp_host">SMTP host</label>
            <input type="text" id="smtp_host" required placeholder="smtp.gmail.com">
          </div>
          <div class="field">
            <label for="smtp_port">Port</label>
            <input type="number" id="smtp_port" required placeholder="587" value="587">
          </div>
        </div>
        <div class="field-row two-up">
          <div class="field">
            <label for="smtp_user">Your email address</label>
            <input type="email" id="smtp_user" required placeholder="you@gmail.com" autocomplete="username">
          </div>
          <div class="field">
            <label for="smtp_pass">App password</label>
            <input type="password" id="smtp_pass" required placeholder="16-character app password" autocomplete="current-password">
          </div>
        </div>
        <p class="hint">For Gmail: Google Account &rarr; Security &rarr; 2-Step Verification &rarr; App passwords. Nothing here is saved anywhere — you'll re-enter it next time.</p>

        <div class="field">
          <label for="subject">Subject</label>
          <input type="text" id="subject" placeholder="A message for you">
        </div>
        <div class="field">
          <label for="message_template">Message</label>
          <textarea id="message_template" rows="4" required placeholder="Hi {name}, ..."></textarea>
          <span class="hint">Use <code>{name}</code>, <code>{company}</code>, or any column name from your CSV as a placeholder.</span>
        </div>

        <div class="field">
          <label>Recipients</label>
          <div id="recipient-rows" class="manifest-rows"></div>
          <button type="button" id="add-recipient" class="ghost-btn">+ Add recipient</button>
        </div>

        <div class="field">
          <label for="csv-upload">Or upload a CSV (must include an "email" column)</label>
          <input type="file" id="csv-upload" accept=".csv,text/csv">
          <span id="csv-status" class="hint"></span>
        </div>

        <button type="submit" class="stamp-btn" id="send-btn">Send</button>
        <p id="form-error" class="form-error" role="alert"></p>
        <p id="form-note" class="form-note" role="status"></p>

        <div class="progress-track" id="progress-track">
          <div class="progress-fill" id="progress-fill"></div>
        </div>
        <ul class="recipient-status-list" id="recipient-status-list"></ul>
      </form>
    </section>

    <aside class="glass-panel" aria-labelledby="history-heading">
      <h2 id="history-heading">Send history</h2>
      <div id="history-empty" class="ledger-empty">No sends yet.</div>
      <div id="history-list"></div>
      <button type="button" id="download-history" class="ghost-btn" style="margin-top:1rem; display:none;">Download history as CSV</button>
    </aside>
  </main>
</div>

<script type="module" src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `app.js`**

```javascript
// app.js
import { parseCsv } from './lib/csvParse.js';
import { renderTemplate } from './lib/mergeRender.js';
import { loadHistory, appendHistory, historyToCsv } from './lib/historyStore.js';

const rowsContainer = document.getElementById('recipient-rows');
const addBtn = document.getElementById('add-recipient');
const form = document.getElementById('send-form');
const errorEl = document.getElementById('form-error');
const noteEl = document.getElementById('form-note');
const sendBtn = document.getElementById('send-btn');
const csvInput = document.getElementById('csv-upload');
const csvStatus = document.getElementById('csv-status');
const progressTrack = document.getElementById('progress-track');
const progressFill = document.getElementById('progress-fill');
const statusList = document.getElementById('recipient-status-list');
const historyEmpty = document.getElementById('history-empty');
const historyList = document.getElementById('history-list');
const downloadBtn = document.getElementById('download-history');

let csvRecipients = [];

function addRecipientRow(email = '', name = '') {
  const row = document.createElement('div');
  row.className = 'manifest-row';
  row.innerHTML = `
    <input type="email" class="r-email" placeholder="recipient@example.com" value="${email}">
    <input type="text" class="r-name" placeholder="Name (optional)" value="${name}">
    <button type="button" class="remove-row" aria-label="Remove">&times;</button>
  `;
  row.querySelector('.remove-row').addEventListener('click', () => row.remove());
  rowsContainer.appendChild(row);
}

addBtn.addEventListener('click', () => addRecipientRow());
addRecipientRow();

// File-picker cancel handling: no 'change' event fires on cancel, so there is
// nothing to guard against directly — the important rule is that no loading
// state is entered until a change event with a real file arrives.
csvInput.addEventListener('change', () => {
  const file = csvInput.files && csvInput.files[0];
  if (!file) {
    // Defensive: some browsers fire change with an empty FileList in edge cases.
    csvRecipients = [];
    csvStatus.textContent = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const { rows, errors, validCount, totalCount } = parseCsv(String(reader.result));
    csvRecipients = rows;
    if (totalCount === 0) {
      csvStatus.textContent = 'That file had no data rows.';
    } else {
      csvStatus.textContent = `${validCount} of ${totalCount} rows valid` + (errors.length ? `, ${errors.length} skipped.` : '.');
    }
  };
  reader.onerror = () => {
    csvStatus.textContent = 'Could not read that file.';
  };
  reader.readAsText(file);
});

function collectManualRecipients() {
  return Array.from(rowsContainer.querySelectorAll('.manifest-row'))
    .map((row) => ({
      email: row.querySelector('.r-email').value.trim().toLowerCase(),
      name: row.querySelector('.r-name').value.trim(),
    }))
    .filter((r) => r.email.length > 0);
}

function allRecipients() {
  const manual = collectManualRecipients();
  const seen = new Set(manual.map((r) => r.email));
  const fromCsv = csvRecipients.filter((r) => !seen.has(r.email));
  return manual.concat(fromCsv);
}

async function sendOne(smtp, recipient, subjectTemplate, bodyTemplate) {
  const subject = renderTemplate(subjectTemplate, recipient);
  const text = renderTemplate(bodyTemplate, recipient);
  try {
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ smtp, to: recipient.email, subject, text }),
    });
    const data = await res.json();
    return { ...data, email: recipient.email, name: recipient.name || '', subject };
  } catch (err) {
    return { ok: false, error: 'Network error reaching /api/send', email: recipient.email, name: recipient.name || '', subject };
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  noteEl.textContent = '';

  const smtp = {
    host: document.getElementById('smtp_host').value.trim(),
    port: Number(document.getElementById('smtp_port').value),
    secure: Number(document.getElementById('smtp_port').value) === 465,
    user: document.getElementById('smtp_user').value.trim(),
    pass: document.getElementById('smtp_pass').value,
  };
  const subjectTemplate = document.getElementById('subject').value.trim();
  const bodyTemplate = document.getElementById('message_template').value;
  const recipients = allRecipients();

  if (!smtp.host || !smtp.user || !smtp.pass) {
    errorEl.textContent = 'Fill in SMTP host, your email address, and the app password.';
    return;
  }
  if (!bodyTemplate.trim()) {
    errorEl.textContent = 'Write a message before sending.';
    return;
  }
  if (recipients.length === 0) {
    errorEl.textContent = 'Add at least one recipient, by hand or via CSV.';
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';
  progressTrack.style.display = 'block';
  progressFill.style.width = '0%';
  statusList.innerHTML = '';

  const results = [];
  let stoppedEarly = false;

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const result = await sendOne(smtp, recipient, subjectTemplate, bodyTemplate);
    results.push(result);

    const li = document.createElement('li');
    li.className = result.ok ? 'r-sent' : 'r-failed';
    li.textContent = `${recipient.email} — ${result.ok ? 'sent' : result.error || 'failed'}`;
    statusList.appendChild(li);

    progressFill.style.width = `${Math.round(((i + 1) / recipients.length) * 100)}%`;

    // If the very first send fails on what looks like an auth problem, stop
    // rather than repeating the same failure for every remaining recipient.
    if (i === 0 && !result.ok && /auth/i.test(result.error || '')) {
      stoppedEarly = true;
      errorEl.textContent = `Stopped after the first send failed: ${result.error}`;
      break;
    }
  }

  const sentRecords = results
    .filter((r) => r.ok)
    .map((r) => ({ email: r.email, name: r.name, subject: r.subject, sentAt: new Date().toISOString(), status: 'sent' }));
  const failedRecords = results
    .filter((r) => !r.ok)
    .map((r) => ({ email: r.email, name: r.name, subject: r.subject, sentAt: new Date().toISOString(), status: 'failed' }));

  appendHistory(window.localStorage, sentRecords.concat(failedRecords));
  renderHistory();

  if (!stoppedEarly) {
    const sentCount = sentRecords.length;
    const failedCount = failedRecords.length;
    noteEl.textContent = `Done: ${sentCount} sent, ${failedCount} failed.`;
  }

  document.getElementById('smtp_pass').value = '';
  sendBtn.disabled = false;
  sendBtn.textContent = 'Send';
});

function renderHistory() {
  const history = loadHistory(window.localStorage);
  historyList.innerHTML = '';
  if (history.length === 0) {
    historyEmpty.style.display = 'block';
    downloadBtn.style.display = 'none';
    return;
  }
  historyEmpty.style.display = 'none';
  downloadBtn.style.display = 'inline-block';
  history.slice().reverse().slice(0, 50).forEach((record) => {
    const row = document.createElement('div');
    row.className = 'history-row';
    row.innerHTML = `<span>${escapeHtml(record.email)}</span><span>${escapeHtml(record.status)}</span>`;
    historyList.appendChild(row);
  });
}

downloadBtn.addEventListener('click', () => {
  const csv = historyToCsv(loadHistory(window.localStorage));
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'send-history.csv';
  a.click();
  URL.revokeObjectURL(url);
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

renderHistory();
```

- [ ] **Step 3: Manual QA checklist**

Run: `npx vercel dev` from `~/Projects/email-outreach`, open the printed local URL, and
walk through each case:

1. **Cancel the CSV file picker** (click "Choose file", then Cancel/Esc) — expect: no
   error text appears, no stuck loading state, `csv-status` stays empty.
2. **Upload an empty CSV file** — expect: "That file had no data rows."
3. **Upload a CSV with a mix of valid/invalid emails** — expect: "`N` of `M` rows
   valid, `K` skipped."
4. **Submit with zero recipients** — expect: inline error, no network call made.
5. **Submit with a real Gmail address + a deliberately wrong app password**, one
   recipient — expect: the send fails, the failure reason is shown, and the app
   password field is cleared afterward regardless of success/failure.
6. **Submit with correct credentials to 2–3 real test addresses you control** — expect:
   progress bar fills, each recipient shows "sent", and the history panel on the right
   updates immediately after.
7. **Reload the page** — expect: history panel still shows the previous sends (proves
   `localStorage` persistence survives a reload, not just the same session).
8. **Click "Download history as CSV"** — expect: the browser's native file-save flow
   triggers (this is the one real permission moment in the app), and the downloaded
   file opens with a header row plus one row per past send.
9. **Use a `{merge_field}` in the message that isn't in your CSV/manual rows** (e.g.
   `{title}` when no `title` column exists) — expect: it appears literally as
   `{title}` in the sent message rather than vanishing, so the mistake is visible.

- [ ] **Step 4: Confirm the whole test suite still passes**

Run: `npm test`
Expected: all prior tests (Tasks 2–6) still pass; Task 7 has no automated tests by
design (see Files/Test above).

---

## Self-Review Notes

- **Spec coverage:** manual entry ✅ (Task 7), CSV bulk upload ✅ (Task 2 + 7),
  arbitrary CSV-column merge fields ✅ (Task 3 keys off whatever `parseCsv` extracts),
  credential-free repo ✅ (Global Constraints + Task 1 README + Task 6 handler takes
  `smtp` from the request body, never from env), client-side history with export ✅
  (Task 4 + 7), file-cancel edge case handled without error ✅ (Task 7 Step 2 comment +
  QA check 1), no server persistence ✅ (no database anywhere in the file structure),
  no scheduling ✅ (omitted entirely, per Non-goals).
- **Placeholder scan:** no TBD/TODO markers; every step has runnable code.
- **Type consistency:** `parseCsv` row shape (`{email, ...cols}`) is the same shape
  `renderTemplate`'s `data` argument expects and the same shape `app.js` builds from
  both manual rows and CSV rows before calling `sendOne`. `historyStore`'s record shape
  (`email, name, subject, sentAt, status`) matches exactly between `appendHistory`
  calls in `app.js` and the `CSV_COLUMNS` in `historyToCsv`. `sendMail`'s `{ok, ...}`
  return shape matches what `api/send.js`'s handler and `app.js`'s `sendOne` both read.
