// ══════════════════════════════════════════════════════════════════
//  supabase.js — طبقة الاتصال بـ Supabase (بلا أي منطق UI)
//  مسؤول عن: قراءة/حفظ رابط ومفتاح المشروع، إرسال الطلبات، RPC
// ══════════════════════════════════════════════════════════════════
import { conn } from '../state.js';

const STORAGE_KEYS = { url: 'sb_url', key: 'sb_key' };

// ─── تحميل القيم من localStorage عند بدء التطبيق ──────────────
export function initFromStorage() {
  conn.SB_URL = localStorage.getItem(STORAGE_KEYS.url) || '';
  conn.SB_KEY = localStorage.getItem(STORAGE_KEYS.key) || '';
}

// ─── ترويسات الطلبات (تستخدم access_token إن وُجد) ────────────
export function authHeaders() {
  const token = conn.authSession?.access_token || conn.SB_KEY;
  return {
    'Content-Type': 'application/json',
    'apikey': conn.SB_KEY,
    'Authorization': 'Bearer ' + token,
    'Prefer': 'return=representation'
  };
}

// ─── الطلب الأساسي ─────────────────────────────────────────────
export async function api(path, method = 'GET', body = null) {
  const r = await fetch(conn.SB_URL + '/rest/v1/' + path, {
    method,
    headers: authHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(j.message || j.hint || ('HTTP ' + r.status));
    err.code = j.code;
    err.status = r.status;
    throw err;
  }
  return j;
}

// ─── اختصارات CRUD ─────────────────────────────────────────────
export const sbGet = (t, q = '') => api(t + q);
export const sbPost = (t, b) => api(t, 'POST', b);
export const sbPatch = (t, id, b) => api(t + '?id=eq.' + id, 'PATCH', b);
export const sbDel = (t, id) => api(t + '?id=eq.' + id, 'DELETE');

// ─── Upsert (INSERT مع merge-duplicates) ──────────────────────
export async function sbUpsert(t, b) {
  const r = await fetch(conn.SB_URL + '/rest/v1/' + t, {
    method: 'POST',
    headers: { ...authHeaders(), 'Prefer': 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify(b)
  });
  const j = await r.json();
  if (!r.ok) {
    const e = new Error(j.message || JSON.stringify(j));
    e.code = j.code;
    throw e;
  }
  return j;
}

// ─── استدعاء دالة Postgres (RPC) ──────────────────────────────
export async function sbRpc(fn, args) {
  const r = await fetch(conn.SB_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(args || {})
  });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message || j?.hint || JSON.stringify(j));
  return j;
}

// ─── PATCH بفلتر مخصص (للجداول بدون عمود id) ──────────────────
// مثال: sbPatchBy('app_settings', 'user_id=eq.' + uid, { value: {...} })
export async function sbPatchBy(t, filter, b) {
  const r = await fetch(conn.SB_URL + '/rest/v1/' + t + '?' + filter, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(b)
  });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message || JSON.stringify(j));
  return j;
}

// ─── إنشاء العميل (supabase-js) ────────────────────────────────
export function createClient(url, key) {
  if (!window.supabase) throw new Error('مكتبة supabase-js غير محمّلة');
  return window.supabase.createClient(url, key);
}

// ─── حفظ الاتصال في الذاكرة + localStorage ─────────────────────
export async function connect(url, key) {
  conn.SB_URL = url;
  conn.SB_KEY = key;
  localStorage.setItem(STORAGE_KEYS.url, url);
  localStorage.setItem(STORAGE_KEYS.key, key);
  conn.supabaseClient = createClient(url, key);
  return conn.supabaseClient;
}

// ─── مسح الاتصال ───────────────────────────────────────────────
export function disconnect() {
  localStorage.removeItem(STORAGE_KEYS.url);
  localStorage.removeItem(STORAGE_KEYS.key);
  conn.SB_URL = '';
  conn.SB_KEY = '';
  conn.supabaseClient = null;
  conn.authSession = null;
}

// ─── POST "متسامح" مع الأعمدة الجديدة ──────────────────────────
// إذا فشلت العملية لأن عمودًا جديدًا غير موجود، يُعاد المحاولة بدونه
export async function sbPostResilient(table, body, optionalFields) {
  try {
    return await sbPost(table, body);
  } catch (e) {
    const msg = e.message || '';
    const isMissingColumn = /column|schema cache|PGRST204/i.test(msg)
      && optionalFields.some(f => msg.includes(f));
    if (isMissingColumn) {
      console.warn(`[${table}] missing column(s) [${optionalFields.join(', ')}] — retrying without them.`);
      const stripped = body.map(row => {
        const r = { ...row };
        optionalFields.forEach(f => delete r[f]);
        return r;
      });
      const result = await sbPost(table, stripped);
      window.__schemaWarnings = window.__schemaWarnings || new Set();
      optionalFields.forEach(f => window.__schemaWarnings.add(table + '.' + f));
      return result;
    }
    throw e;
  }
}
