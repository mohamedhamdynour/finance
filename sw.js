// ══════════════════════════════════════════════════════════════════
//  Service Worker — محفظتي المالية
//  استراتيجية:
//    • ملفات ثابتة (HTML/CSS/JS/أيقونات) → cache-first + تحديث خلفي
//    • استدعاءات Supabase و APIs خارجية → network-only (لا تُخزَّن)
//    • عند انقطاع الشبكة → تُخدَّم الملفات الثابتة من الكاش
// ══════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'v4.5.0';
const CACHE_NAME = 'portfolio-' + CACHE_VERSION;

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg',
  './schema.sql',
  './js/main.js',
  './js/state.js',
  './js/core/utils.js',
  './js/core/supabase.js',
  './js/core/auth.js',
  './js/core/settings.js',
  './js/core/network.js',
  './js/core/cache.js',
  './js/core/push.js',
  './js/core/excel.js',
  './js/domain/calc.js',
  './js/domain/risk.js',
  './js/domain/forecast.js',
  './js/domain/tax.js',
  './js/domain/comparisons.js',
  './js/domain/csv-import.js',
  './js/domain/ocr.js',
  './js/domain/loan.js',
  './js/domain/attachments.js',
  './js/domain/auto-recurring.js',
  './js/domain/recurring-detector.js',
  './js/domain/cert-maturation.js',
  './js/ui/toast.js',
  './js/ui/charts.js',
  './js/ui/shared.js',
  './js/ui/modals.js',
  './js/ui/notifications.js',
  './js/ui/save-edit.js',
  './js/ui/skeleton.js',
  './js/ui/undo.js',
  './js/ui/search.js',
  './js/ui/shortcuts.js',
  './js/ui/network-indicator.js',
  './js/ui/attachments.js',
  './js/ui/recurring-detector.js',
  './js/ui/loan-calc.js',
  './js/ui/csv-import.js',
  './js/ui/pages/dashboard.js',
  './js/ui/pages/banks.js',
  './js/ui/pages/stocks.js',
  './js/ui/pages/metals.js',
  './js/ui/pages/certs.js',
  './js/ui/pages/debts.js',
  './js/ui/pages/installments.js',
  './js/ui/pages/recurring.js',
  './js/ui/pages/goals.js',
  './js/ui/pages/prices.js',
  './js/ui/pages/reports.js',
  './js/ui/pages/zakat.js',
  './js/ui/pages/risk.js',
  './js/ui/pages/rebalancing.js',
  './js/ui/pages/forecast.js',
  './js/ui/pages/comparisons.js',
  './js/ui/pages/tax.js',
  './js/ui/pages/audit.js',
  './js/ui/pages/settings-page.js',
  './js/ui/pages/heatmap.js',
  './js/domain/sharing.js',
'./js/ui/sharing-setup.js',
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

// ══════════════════ Push Notifications ══════════════════

self.addEventListener('push', event => {
  console.log('[SW] Push received');
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }

  const title = data.title || 'محفظتي';
  const options = {
    body: data.body || 'لديك إشعار جديد',
    icon: './icon.svg',
    badge: './icon.svg',
    tag: data.tag || 'portfolio-notification',
    data: { url: data.url || './' },
    requireInteraction: data.requireInteraction === true,
    vibrate: [100, 50, 100]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
// ─── رسائل من الصفحة (مثل "skip waiting") ──────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
