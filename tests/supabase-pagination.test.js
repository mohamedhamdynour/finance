import test from 'node:test';
import assert from 'node:assert/strict';
import { sbGetAll } from '../js/core/supabase.js';
import { conn } from '../js/state.js';

test('sbGetAll fetches all pages instead of silently truncating at one response', async () => {
  const oldFetch = globalThis.fetch;
  const oldUrl = conn.SB_URL;
  const oldKey = conn.SB_KEY;
  const oldSession = conn.authSession;
  const requests = [];
  const pages = [
    [{ id: 1 }, { id: 2 }],
    [{ id: 3 }]
  ];
  conn.SB_URL = 'https://example.supabase.co';
  conn.SB_KEY = 'test-public-key';
  conn.authSession = null;
  globalThis.fetch = async (_url, init) => {
    requests.push({ range: init.headers.Range, rangeUnit: init.headers['Range-Unit'] });
    const index = requests.length - 1;
    return {
      status: 200,
      ok: true,
      json: async () => pages[index] || []
    };
  };
  try {
    const rows = await sbGetAll('banks', '?order=id', 2);
    assert.deepEqual(rows, [{ id: 1 }, { id: 2 }, { id: 3 }]);
    assert.deepEqual(requests, [
      { range: '0-1', rangeUnit: 'items' },
      { range: '2-3', rangeUnit: 'items' }
    ]);
  } finally {
    globalThis.fetch = oldFetch;
    conn.SB_URL = oldUrl;
    conn.SB_KEY = oldKey;
    conn.authSession = oldSession;
  }
});

test('sbGetAll rejects unsafe or invalid page sizes', async () => {
  await assert.rejects(() => sbGetAll('banks', '', 0), RangeError);
  await assert.rejects(() => sbGetAll('banks', '', 1001), RangeError);
});
