// ══════════════════════════════════════════════════════════════════
//  Service Worker — محفظتي المالية
//  استراتيجية:
//    • ملفات ثابتة (HTML/CSS/JS/أيقونات) → cache-first + تحديث خلفي
//    • استدعاءات Supabase و APIs خارجية → network-only (لا تُخزَّن)
//    • عند انقطاع الشبكة → تُخدَّم الملفات الثابتة من الكاش
// ══════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'v2.5.0';
const CACHE_NAME = 'portfolio-' + CACHE_VERSION;

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg',
  './js/main.js',
  './js/state.js',
  './js/core/utils.js',
  './js/core/supabase.js',
  './js/core/auth.js',
  './js/core/settings.js',
  './js/domain/calc.js',
  './js/ui/toast.js',
  './js/ui/shared.js',
  './js/ui/modals.js',
  './js/ui/charts.js',
  './js/ui/undo.js',
  './js/ui/skeleton.js'
];

// ─── Install: pre-cache app shell ────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // addAll يفشل لو ملف واحد مش موجود — نستخدم Promise.allSettled
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] skip cache', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate: احذف الكاشات القديمة ─────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k.startsWith('portfolio-') && k !== CACHE_NAME)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch: التوجيه حسب نوع الطلب ───────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;

  // لا نتعامل إلا مع GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) APIs خارجية → network-only (بدون كاش نهائيًا)
  const externalHosts = [
    'supabase.co',
    'goldapi.io',
    'open.er-api.com',
    'cdnjs.cloudflare.com',
    'unpkg.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
  ];
  if (externalHosts.some(h => url.hostname.includes(h))) {
    // اسمح للشبكة تتعامل معه بشكل طبيعي
    return;
  }

  // 2) نفس الأصل → cache-first مع تحديث في الخلفية
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        const fetchPromise = fetch(req)
          .then(res => {
            // خزّن نسخة محدّثة (فقط لو الاستجابة صالحة)
            if (res && res.status === 200 && res.type === 'basic') {
              const clone = res.clone();
              caches.open(CACHE_NAME).then(c => c.put(req, clone));
            }
            return res;
          })
          .catch(() => cached);

        // أعطِ المستخدم النسخة المخزّنة فورًا لو موجودة
        return cached || fetchPromise;
      })
    );
  }
});

// ─── رسائل من الصفحة (مثل "skip waiting") ──────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
