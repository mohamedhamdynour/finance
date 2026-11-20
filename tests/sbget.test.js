import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import { conn } from '../js/state.js';
import { sbGet, PAGE_SIZE } from '../js/core/supabase.js';

// محاكاة PostgREST: حد أقصى 1000 صف، دعم order/limit/offset، وترتيب غير مستقر للمتعادلين
// (زي Postgres الحقيقي لما الترتيب مش حتمي) عشان نثبت إن فك التعادل بـ id ضروري.
let tables, requests;
function mockServer(url) {
  const u = new URL(url);
  const table = u.pathname.split('/').pop();
  requests.push({ table, search: u.search });
  let rows = [...(tables[table] || [])];
  const uid = u.searchParams.get('user_id');
  if (uid) rows = rows.filter((r) => r.user_id === uid.replace('eq.', ''));
  const order = (u.searchParams.get('order') || '').split(',').filter(Boolean).map((o) => {
    const [col, dir] = o.split('.'); return { col, desc: dir === 'desc' };
  });
  const seed = requests.length; // كل طلب يرجّع المتعادلين بترتيب مختلف
  rows.sort((a, b) => {
    for (const { col, desc } of order) {
      if (a[col] !== b[col]) return (a[col] > b[col] ? 1 : -1) * (desc ? -1 : 1);
    }
    return ((a.id * 7919 + seed) % 13) - ((b.id * 7919 + seed) % 13) || 0;
  });
  const offset = Number(u.searchParams.get('offset') || 0);
  const limit = Math.min(Number(u.searchParams.get('limit') || 1000), 1000);
  return rows.slice(offset, offset + limit);
}

beforeEach(() => {
  requests = []; tables = {};
  conn.SB_URL = 'http://localhost'; conn.SB_KEY = 'k'; conn.authSession = null; conn.viewingUserId = null;
  globalThis.fetch = async (url) => {
    const body = mockServer(url);
    return { ok: true, status: 200, json: async () => body };
  };
});
const mk = (n, f = (i) => ({})) => Array.from({ length: n }, (_, i) => ({ id: i + 1, date: '2026-01-' + String((i % 5) + 1).padStart(2, '0'), ...f(i) }));

test('2500 صف بتواريخ متكررة: كلهم يرجعوا بدون تكرار ولا فقد', async () => {
  tables.bank_transactions = mk(2500);
  const rows = await sbGet('bank_transactions', '?order=date.desc&deleted_at=is.null');
  assert.equal(rows.length, 2500);
  assert.equal(new Set(rows.map((r) => r.id)).size, 2500);
});

test('إضافة id كفاصل تعادل في الترتيب', async () => {
  tables.bank_transactions = mk(1500);
  await sbGet('bank_transactions', '?order=date.desc');
  assert.match(requests[0].search, /order=date\.desc%2Cid\.asc|order=date\.desc,id\.asc/);
});

test('ترتيب فيه id بالفعل لا يتغير', async () => {
  tables.stock_transactions = mk(1200);
  await sbGet('stock_transactions', '?order=date.asc,id.asc');
  assert.ok(!/id\.asc.*id\.asc/.test(decodeURIComponent(requests[0].search)));
});

test('عدد صفوف = ضعف الصفحة بالظبط', async () => {
  tables.debts = mk(2 * PAGE_SIZE);
  assert.equal((await sbGet('debts', '?order=id')).length, 2000);
});

test('جدول صغير: طلب واحد', async () => {
  tables.banks = mk(12);
  const rows = await sbGet('banks', '?order=id');
  assert.equal(rows.length, 12);
  assert.equal(requests.length, 1);
});

test('limit صريح يُحترم ولا يُرقَّم', async () => {
  tables.audit_log = mk(3000);
  const rows = await sbGet('audit_log', '?order=changed_at.desc&limit=500');
  assert.equal(rows.length, 500);
  assert.equal(requests.length, 1);
});

test('portfolio_snapshots (بدون id): 1500 يوم كاملين وبدون id في الترتيب', async () => {
  tables.portfolio_snapshots = Array.from({ length: 1500 }, (_, i) => ({ snapshot_date: new Date(Date.UTC(2022, 0, 1 + i)).toISOString().slice(0, 10), id: i + 1 }));
  const rows = await sbGet('portfolio_snapshots', '?order=snapshot_date.asc');
  assert.equal(rows.length, 1500);
  assert.ok(!requests[0].search.includes('id.asc'));
});

test('فلتر المحفظة المشتركة (user_id) يفضل مطبّق على كل صفحة', async () => {
  conn.authSession = { user: { id: 'me' } }; conn.viewingUserId = 'owner';
  tables.bank_transactions = mk(1100, () => ({ user_id: 'owner' })).concat(mk(50, () => ({ user_id: 'me' })).map((r) => ({ ...r, id: r.id + 5000 })));
  const rows = await sbGet('bank_transactions', '?order=id');
  assert.equal(rows.length, 1100);
  assert.ok(requests.every((r) => r.search.includes('user_id=eq.owner')));
});
