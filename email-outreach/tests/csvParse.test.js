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
