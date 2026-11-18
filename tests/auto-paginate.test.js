const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../vendor/supabase-js-2.118.0.umd.js'), 'utf8'));
const { withAutoPagination } = require('../js/lib/auto-paginate.js');

const SERVER_MAX = 1000; // نفس الإعداد الافتراضي في Supabase
function makeClient(rowsByTable, calls) {
  const mockFetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const table = url.pathname.split('/').pop();
    calls.push(url.search);
    const all = rowsByTable[table] || [];
    const order = url.searchParams.get('order');
    if (order && order.startsWith('nocol.')) {
      return new Response(JSON.stringify({ code: '42703', message: 'column does not exist' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const off = Number(url.searchParams.get('offset') || 0);
    const lim = Math.min(Number(url.searchParams.get('limit') || SERVER_MAX), SERVER_MAX);
    const slice = all.slice(off, off + lim);
    return new Response(JSON.stringify(slice), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return supabase.createClient('http://localhost:54321', 'anon', { global: { fetch: mockFetch }, auth: { persistSession: false } });
}
const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, amount: 1 }));

test('بدون الشيم: القص عند 1000 صف (يثبت المشكلة)', async () => {
  const calls = [];
  const sb = makeClient({ t: rows(2500) }, calls);
  const { data, error } = await sb.from('t').select('*');
  assert.equal(error, null);
  assert.equal(data.length, 1000);
});

test('مع الشيم: يرجّع كل الـ 2500 صف بدون تكرار', async () => {
  const calls = [];
  const sb = withAutoPagination(makeClient({ t: rows(2500) }, calls));
  const { data, error } = await sb.from('t').select('*');
  assert.equal(error, null);
  assert.equal(data.length, 2500);
  assert.equal(new Set(data.map((r) => r.id)).size, 2500);
  assert.equal(data.reduce((s, r) => s + r.amount, 0), 2500);
  assert.equal(calls.length, 3);
});

test('عدد صفوف = مضاعف pageSize بالظبط (2000) لا يفقد ولا يكرر', async () => {
  const sb = withAutoPagination(makeClient({ t: rows(2000) }, []));
  const { data } = await sb.from('t').select('*');
  assert.equal(data.length, 2000);
});

test('جدول صغير: طلب واحد فقط', async () => {
  const calls = [];
  const sb = withAutoPagination(makeClient({ t: rows(10) }, calls));
  const { data } = await sb.from('t').select('*');
  assert.equal(data.length, 10);
  assert.equal(calls.length, 1);
});

test('limit/range الصريحة تُحترم', async () => {
  const sb = withAutoPagination(makeClient({ t: rows(2500) }, []));
  const a = await sb.from('t').select('*').limit(5);
  assert.equal(a.data.length, 5);
  const b = await sb.from('t').select('*').range(0, 9);
  assert.equal(b.data.length, 10);
});

test('filters و order المستخدم تعمل مع الشيم', async () => {
  const sb = withAutoPagination(makeClient({ t: rows(1500) }, []));
  const { data, error } = await sb.from('t').select('*').order('id', { ascending: false });
  assert.equal(error, null);
  assert.equal(data.length, 1500);
});

test('await مرتين على نفس الاستعلام لا يكسر', async () => {
  const sb = withAutoPagination(makeClient({ t: rows(1200) }, []));
  const q = sb.from('t').select('*');
  const r1 = await q;
  const r2 = await q;
  assert.equal(r1.data.length, 1200);
  assert.equal(r2.data.length, 1200);
});
