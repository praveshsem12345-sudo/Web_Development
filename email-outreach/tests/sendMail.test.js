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

test('maps EAUTH errors to a fixed generic message, even when raw error carries the password', async () => {
  const fakeTransportFactory = () => ({
    sendMail: async () => {
      const err = new Error(`auth failed for user with pass ${smtp.pass}`);
      err.code = 'EAUTH';
      // Simulate a real nodemailer auth-failure error, which can carry the
      // raw base64 AUTH PLAIN/LOGIN payload (containing the password) on
      // properties besides .message.
      err.response = `535 5.7.8 Auth failed: ${Buffer.from(`\0${smtp.user}\0${smtp.pass}`).toString('base64')}`;
      err.responseCode = 535;
      err.command = 'AUTH PLAIN';
      throw err;
    },
  });
  const result = await sendMail({ smtp, message, transportFactory: fakeTransportFactory });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'SMTP authentication failed. Check your email address and app password.');
  assert.ok(!result.error.includes(smtp.pass), 'error must not contain the SMTP password');
  assert.ok(!result.error.includes(Buffer.from(smtp.pass).toString('base64')), 'error must not contain a base64-encoded password');
});

test('maps connection errors (ECONNECTION/ETIMEDOUT/ESOCKET) to a fixed generic message', async () => {
  for (const code of ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET']) {
    const fakeTransportFactory = () => ({
      sendMail: async () => {
        const err = new Error(`connection error detail for ${smtp.pass}`);
        err.code = code;
        throw err;
      },
    });
    const result = await sendMail({ smtp, message, transportFactory: fakeTransportFactory });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'Could not connect to the SMTP server. Check the host and port.');
    assert.ok(!result.error.includes(smtp.pass), 'error must not contain the SMTP password');
  }
});

test('falls back to a fixed generic message for unknown/uncoded errors, leaking nothing', async () => {
  const fakeTransportFactory = () => ({
    sendMail: async () => {
      const err = new Error(`some unexpected server text containing ${smtp.pass}`);
      err.response = `unexpected response with ${smtp.pass}`;
      throw err;
    },
  });
  const result = await sendMail({ smtp, message, transportFactory: fakeTransportFactory });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Failed to send email.');
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
