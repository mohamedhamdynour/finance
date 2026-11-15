import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeShortcutParam, supportedShortcutActions } from '../js/pwa/shortcut-bridge.js';

test('shortcut parser accepts only allowlisted actions and strips query data from the URL', () => {
  const result = consumeShortcutParam('https://example.test/finance/?shortcut=add-income&amount=1200&note=private#app');
  assert.equal(result.found, true);
  assert.equal(result.action, 'add-income');
  assert.equal(result.cleanUrl, '/finance/#app');
});

test('unknown shortcut actions are rejected and removed from the URL', () => {
  const result = consumeShortcutParam('https://example.test/finance/?shortcut=delete-everything&account=123');
  assert.equal(result.found, true);
  assert.equal(result.action, null);
  assert.equal(result.cleanUrl, '/finance/');
});

test('ordinary app URLs are not modified when no shortcut is present', () => {
  const result = consumeShortcutParam('https://example.test/finance/?view=reports#summary');
  assert.equal(result.found, false);
  assert.equal(result.action, null);
  assert.equal(result.cleanUrl, '/finance/?view=reports#summary');
});

test('shortcut allowlist exposes only supported non-payload actions', () => {
  assert.deepEqual(supportedShortcutActions, [
    'dashboard', 'net-worth', 'upcoming-liabilities', 'reports',
    'add-income', 'add-expense', 'transfer', 'backup', 'reminders'
  ]);
});
