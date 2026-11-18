/**
 * auto-paginate.js — يمنع القص الصامت عند 1000 صف في Supabase/PostgREST.
 *
 * الاستخدام (سطر واحد بعد createClient):
 *   const sb = withAutoPagination(supabase.createClient(URL, KEY));
 *
 * يعمل فقط على استعلامات SELECT (GET) اللي مفيهاش limit/range/single/head.
 * أي استعلام فيه limit أو range أو single يتنفذ كما هو.
 * ملاحظة: لو غيّرت "Max rows" في Supabase لقيمة أقل من pageSize، قلّل pageSize.
 */
(function (root) {
  'use strict';

  function isSkippable(b, signal) {
    const sp = b.url && b.url.searchParams;
    if (!sp) return true;                                   // نسخة غير متوقعة: لا تتدخل
    if (b.method && b.method !== 'GET') return true;        // insert/update/upsert/delete
    for (const k of sp.keys()) {                            // limit/offset (وللجداول المرتبطة)
      if (k === 'limit' || k === 'offset' || k.endsWith('.limit') || k.endsWith('.offset')) return true;
    }
    const accept = b.headers && (typeof b.headers.get === 'function' ? b.headers.get('Accept') : b.headers['Accept']);
    if (accept && String(accept).indexOf('vnd.pgrst.object') !== -1) return true;  // single()/maybeSingle()
    if (b.__noAutoPage) return true;
    return false;
  }

  async function fetchAllPages(b, origThen, opts) {
    const sp = b.url.searchParams;
    const pageSize = opts.pageSize;
    let addedOrder = false;
    if (!sp.has('order') && opts.defaultOrder) { sp.set('order', opts.defaultOrder + '.asc'); addedOrder = true; }

    const run = (offset) => {
      sp.set('limit', String(pageSize));
      sp.set('offset', String(offset));
      return origThen.call(b, (r) => r, (e) => { throw e; });
    };

    let all = [];
    let first = null;
    for (let offset = 0; offset < opts.maxRows; offset += pageSize) {
      let res = await run(offset);
      if (res.error && addedOrder && offset === 0 && (res.error.code === '42703' || res.error.code === 'PGRST100')) {
        sp.delete('order'); addedOrder = false;             // الجدول مفيهوش عمود id
        res = await run(offset);
      }
      if (res.error) return res;
      if (first === null) first = res;
      const rows = Array.isArray(res.data) ? res.data : [];
      all = all.concat(rows);
      if (rows.length < pageSize) break;
      if (offset + pageSize >= opts.maxRows) {
        return Object.assign({}, first, { data: all, error: { message: 'auto-paginate: تجاوز maxRows=' + opts.maxRows, code: 'AUTOPAGE_LIMIT' } });
      }
    }
    sp.delete('limit'); sp.delete('offset');
    return Object.assign({}, first, { data: all });
  }

  function patchBuilder(b, opts) {
    if (!b || typeof b.then !== 'function' || b.__autoPaged) return b;
    const origThen = Object.getPrototypeOf(b).then;
    b.__autoPaged = true;
    b.then = function (onFul, onRej) {
      const p = isSkippable(b) ? origThen.call(b, (r) => r, (e) => { throw e; }) : fetchAllPages(b, origThen, opts);
      return p.then(onFul, onRej);
    };
    return b;
  }

  function withAutoPagination(client, options) {
    const opts = Object.assign({ pageSize: 1000, maxRows: 200000, defaultOrder: 'id' }, options || {});
    const origFrom = client.from.bind(client);
    client.from = function (table) {
      const qb = origFrom(table);
      const origSelect = qb.select.bind(qb);
      qb.select = function () { return patchBuilder(origSelect.apply(null, arguments), opts); };
      return qb;
    };
    return client;
  }

  root.withAutoPagination = withAutoPagination;
  if (typeof module !== 'undefined' && module.exports) module.exports = { withAutoPagination };
})(typeof window !== 'undefined' ? window : globalThis);
