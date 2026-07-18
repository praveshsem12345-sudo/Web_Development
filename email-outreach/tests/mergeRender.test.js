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
