let SB_URL = localStorage.getItem('sb_url') || '';
let SB_KEY = localStorage.getItem('sb_key') || '';
let authSession = null;
export let supabaseClient = null;

export function getSession() { return authSession; }
export function setSession(s) { authSession = s; }

function authHeaders() {
  const token = authSession?.access_token || SB_KEY;
  return {
    'Content-Type': 'application/json',
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + token,
    'Prefer': 'return=representation',
  };
}

export async function api(path, method = 'GET', body = null, extraHeaders = {}) {
  const r = await fetch(SB_URL + '/rest/v1/' + path, {
    method,
    headers: { ...authHeaders(), ...extraHeaders },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(j.message || j.hint || `HTTP ${r.status}`);
    err.code = j.code;
    err.status = r.status;
    throw err;
  }
  return j;
}

export const sbGet    = (t, q = '') => api(t + q);
export const sbPost   = (t, b)    => api(t, 'POST', b);
export const sbPatch  = (t, id, b)=> api(`${t}?id=eq.${id}`, 'PATCH', b);
export const sbDel    = (t, id)   => api(`${t}?id=eq.${id}`, 'DELETE');
export const sbUpsert = (t, b)    => api(t, 'POST', b, { 'Prefer': 'return=representation,resolution=merge-duplicates' });
export const sbRpc    = (fn, args) => api(`rpc/${fn}`, 'POST', args);
