import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSettingsForCloud } from '../js/core/settings.js';

test('cloud settings payload excludes provider secrets without mutating local settings', () => {
  const local = {
    base_currency: 'EGP',
    goldapi_key: 'goldapi-secret-value',
    telegram: {
      enabled: true,
      bot_token: 'telegram-secret-token',
      chat_id: '123456',
      daily_summary: true
    }
  };
  const safe = sanitizeSettingsForCloud(local);
  assert.equal(Object.hasOwn(safe, 'goldapi_key'), false);
  assert.equal(Object.hasOwn(safe.telegram, 'bot_token'), false);
  assert.equal(safe.telegram.chat_id, '123456');
  assert.equal(safe.telegram.enabled, true);
  assert.equal(local.goldapi_key, 'goldapi-secret-value');
  assert.equal(local.telegram.bot_token, 'telegram-secret-token');
  assert.equal(JSON.stringify(safe).includes('secret'), false);
});

test('cloud settings sanitizer tolerates missing optional settings', () => {
  assert.deepEqual(sanitizeSettingsForCloud(null), {});
  assert.deepEqual(sanitizeSettingsForCloud({ base_currency: 'EGP' }), { base_currency: 'EGP' });
});
