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
