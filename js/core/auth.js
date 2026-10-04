// ══════════════════════════════════════════════════════════════════
//  auth.js — تدفق المصادقة (login / signup / logout / session)
//  يستخدم callback handler بدل استيراد loadAll (منع الدوران)
// ══════════════════════════════════════════════════════════════════
import { conn } from '../state.js';
import { friendlyError } from './errors.js';
import { initFromStorage, connect, disconnect } from './supabase.js';
import { clearCache } from './cache.js';

// ─── callback يُسجِّله main.js ليُشغّل loadAll بعد نجاح الدخول ──
let _onAuthSuccess = null;
export function setAuthSuccessHandler(fn) { _onAuthSuccess = fn; }

// ─── DOM helpers (شاشة الدخول فقط) ────────────────────────────
export function showAuthError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

export function setAuthTab(tab) {
  document.getElementById('auth-tab-login')?.classList.toggle('active', tab === 'login');
  document.getElementById('auth-tab-signup')?.classList.toggle('active', tab === 'signup');
  document.getElementById('auth-form-login')?.classList.toggle('hidden', tab !== 'login');
  document.getElementById('auth-form-signup')?.classList.toggle('hidden', tab !== 'signup');
  showAuthError('auth-error', '');
}

export function showAuthLoading(on) {
  document.getElementById('auth-loading')?.classList.toggle('hidden', !on);
  document.getElementById('auth-step-connect')?.classList.toggle('hidden', on || !!conn.SB_URL);
  document.getElementById('auth-step-login')?.classList.toggle('hidden', on || !conn.SB_URL);
}

// ─── الخطوة 1: الاتصال بمشروع Supabase ────────────────────────
export async function connectSupabase() {
  const url = document.getElementById('conn-url').value.trim().replace(/\/+$/, '');
  const key = document.getElementById('conn-key').value.trim();
  showAuthError('conn-error', '');

  if (!url || !/^https:\/\/.+\.supabase\.co$/.test(url)) {
    return showAuthError('conn-error', 'أدخل رابط Supabase صحيح (مثال: https://xxxx.supabase.co)');
  }
  if (!key || key.length < 20) {
    return showAuthError('conn-error', 'أدخل المفتاح العام (anon key) الصحيح');
  }

  try {
    await connect(url, key);
  } catch (e) {
    return showAuthError('conn-error', 'تعذّر الاتصال: ' + e.message);
  }
  document.getElementById('auth-step-connect').classList.add('hidden');
  document.getElementById('auth-step-login').classList.remove('hidden');
}

// ─── فصل الاتصال ──────────────────────────────────────────────
export function disconnectSupabase() {
  if (!confirm('هتحتاج تدخل رابط ومفتاح Supabase تاني. متابعة؟')) return;
  disconnect();
  document.getElementById('conn-url').value = '';
  document.getElementById('conn-key').value = '';
  document.getElementById('auth-step-login').classList.add('hidden');
  document.getElementById('auth-step-connect').classList.remove('hidden');
}

// ─── إنشاء حساب ───────────────────────────────────────────────
export async function doSignup() {
  const username = document.getElementById('signup-username').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const password2 = document.getElementById('signup-password2').value;
  showAuthError('auth-error', '');

  if (!username) return showAuthError('auth-error', 'أدخل اسم المستخدم');
  if (!email) return showAuthError('auth-error', 'أدخل البريد الإلكتروني');
  if (!password || password.length < 6) return showAuthError('auth-error', 'كلمة المرور 6 أحرف على الأقل');
  if (password !== password2) return showAuthError('auth-error', 'كلمتا المرور غير متطابقتين');

  showAuthLoading(true);
  try {
    const { data, error } = await conn.supabaseClient.auth.signUp({
      email, password, options: { data: { username } }
    });
    if (error) throw error;
    if (data.session) {
      conn.authSession = data.session;
      await onAuthed();
    } else {
      showAuthLoading(false);
      showAuthError('auth-error', 'تم إنشاء الحساب — تحقق من بريدك الإلكتروني لتأكيد الحساب قبل الدخول (أو عطّل "Confirm email" من إعدادات Supabase Auth).');
      setAuthTab('login');
    }
  } catch (e) {
    showAuthLoading(false);
    showAuthError('auth-error', friendlyError(e) || 'تعذّر إنشاء الحساب');
  }
}

// ─── تسجيل الدخول ─────────────────────────────────────────────
export async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  showAuthError('auth-error', '');

  if (!email || !password) return showAuthError('auth-error', 'أدخل البريد وكلمة المرور');

  showAuthLoading(true);
  try {
    const { data, error } = await conn.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    conn.authSession = data.session;
    await onAuthed();
  } catch (e) {
    showAuthLoading(false);
    showAuthError('auth-error', friendlyError(e) || 'بيانات الدخول غير صحيحة');
  }
}

// ─── تسجيل الخروج ─────────────────────────────────────────────
export async function doLogout() {
  if (!confirm('تسجيل الخروج؟')) return;
  try { if (conn.supabaseClient) await conn.supabaseClient.auth.signOut(); } catch (e) {}
  try { await clearCache(); } catch (e) {}
  localStorage.removeItem('viewingContextUid');
  conn.authSession = null;
  location.reload();
}

// ─── ما بعد نجاح الدخول: إظهار الواجهة + استدعاء المعالج ───────
export async function onAuthed() {
  document.getElementById('auth-gate')?.classList.add('hidden');
  document.getElementById('main-app')?.classList.remove('hidden');
  const uEl = document.getElementById('sidebar-username');
  if (uEl) uEl.textContent = conn.authSession?.user?.user_metadata?.username || conn.authSession?.user?.email || '';

  if (_onAuthSuccess) {
    try {
      await _onAuthSuccess();
    } catch (e) {
      console.error('onAuthSuccess handler failed:', e);
    }
  }
}

// ─── تهيئة البوابة (يُستدعى في بداية التطبيق) ──────────────────
export async function initAuthGate() {
  initFromStorage();
  if (!conn.SB_URL || !conn.SB_KEY) {
    document.getElementById('auth-step-connect')?.classList.remove('hidden');
    return;
  }
  document.getElementById('conn-url').value = conn.SB_URL;
  document.getElementById('conn-key').value = conn.SB_KEY;

  try {
    conn.supabaseClient = window.supabase.createClient(conn.SB_URL, conn.SB_KEY);
    const { data } = await conn.supabaseClient.auth.getSession();
    if (data?.session) {
      conn.authSession = data.session;
      conn.supabaseClient.auth.onAuthStateChange((_event, session) => {
        conn.authSession = session;
      });
      await onAuthed();
      return;
    }
  } catch (e) { /* المتابعة إلى شاشة الدخول */ }

  document.getElementById('auth-step-login')?.classList.remove('hidden');
}

// ─── مساعد: هل المستخدم مسجَّل دخول؟ ──────────────────────────
export const isAuthenticated = () => !!conn.authSession;
export const getCurrentUser = () => conn.authSession?.user || null;
