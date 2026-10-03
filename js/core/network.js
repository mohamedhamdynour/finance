// ══════════════════════════════════════════════════════════════════
//  network.js — كشف حالة الشبكة + إعادة محاولة ذكية
// ══════════════════════════════════════════════════════════════════

// ══════════════════ حالة الشبكة ══════════════════

const state = {
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  lastError: null,
  lastSuccessAt: null,
  retryIn: 0
};

export function isOnline() { return state.online; }
export function getNetworkState() { return { ...state }; }

// ══════════════════ مراقبة حالة الشبكة ══════════════════

const listeners = new Set();

export function onNetworkChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach(fn => { try { fn({ ...state }); } catch (e) {} });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    state.online = true;
    state.retryIn = 0;
    console.log('[network] ✓ متصل');
    notify();
  });
  window.addEventListener('offline', () => {
    state.online = false;
    console.log('[network] ✗ غير متصل');
    notify();
  });
}

// ══════════════════ تصنيف الأخطاء ══════════════════

export function isNetworkError(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('failed to fetch')) return true;
  if (msg.includes('network')) return true;
  if (msg.includes('load failed')) return true;
  if (msg.includes('timeout')) return true;
  if (err.name === 'TypeError' && msg.includes('fetch')) return true;
  return false;
}

export function isRetryableError(err) {
  if (isNetworkError(err)) return true;
  if (!err.status) return false;
  // 5xx → retryable, 429 → retryable
  if (err.status >= 500) return true;
  if (err.status === 429) return true;
  // 4xx → not retryable (خطأ في الطلب)
  return false;
}

// ══════════════════ Retry Wrapper ══════════════════

export async function retryWithBackoff(fn, options = {}) {
  const maxAttempts = options.maxAttempts || 3;
  const baseDelay = options.baseDelay || 400; // ms
  const maxDelay = options.maxDelay || 5000;
  const onRetry = options.onRetry; // (attempt, err, delayMs) => void

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      state.lastSuccessAt = Date.now();
      state.lastError = null;
      return result;
    } catch (e) {
      lastErr = e;
      state.lastError = { message: e.message, ts: Date.now() };

      // لا تعيد المحاولة لو خطأ غير قابل للإعادة
      if (!isRetryableError(e)) throw e;

      // آخر محاولة → ارمِ الخطأ
      if (attempt >= maxAttempts) throw e;

      // Exponential backoff: 400, 800, 1600 ms + random jitter
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay) + Math.random() * 200;

      state.retryIn = delay;
      console.warn(`[network] retry ${attempt}/${maxAttempts - 1} في ${delay.toFixed(0)}ms...`, e.message);
      notify();
      if (onRetry) onRetry(attempt, e, delay);

      await new Promise(r => setTimeout(r, delay));
      state.retryIn = 0;
    }
  }
  throw lastErr;
}

// ══════════════════ معالج تلقائي للحالة ══════════════════

export function markOnline() { state.online = true; notify(); }
export function markOffline() { state.online = false; notify(); }
