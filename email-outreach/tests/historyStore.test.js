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

test('historyToCsv quotes a subject field containing a comma', () => {
  const csv = historyToCsv([
    { email: 'sam@example.com', name: 'Sam', subject: 'Hi, welcome to the team', sentAt: '2026-07-16T10:00:00Z', status: 'sent' },
  ]);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'email,name,subject,sentAt,status');
  assert.equal(lines[1], 'sam@example.com,Sam,"Hi, welcome to the team",2026-07-16T10:00:00Z,sent');
});

test('historyToCsv escapes double quotes in a name field by doubling them', () => {
  const csv = historyToCsv([
    { email: 'sam@example.com', name: 'He said "hi"', subject: 'Hi', sentAt: '2026-07-16T10:00:00Z', status: 'sent' },
  ]);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'email,name,subject,sentAt,status');
  assert.equal(lines[1], 'sam@example.com,"He said ""hi""",Hi,2026-07-16T10:00:00Z,sent');
});
