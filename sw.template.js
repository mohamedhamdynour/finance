/* sw.template.js — Service Worker بنسخة (versioned) + تحديث آمن.
 * ⚠️ لم أرَ sw.js الحالي عندك. قارن قبل الاستبدال، وعدّل PRECACHE بأسماء ملفاتك الفعلية (مثلاً ملفات js/).
 * كل ما تعدّل أي ملف ثابت، غيّر VERSION. */
const VERSION = 'v2026-11-18-1';
const CACHE = 'portfolio-' + VERSION;
const PRECACHE = [
  './', 'index.html', 'style.css', 'manifest.json', 'icon.svg', 'icon-maskable.svg',
  'vendor/supabase-js-2.118.0.umd.js',
  'js/lib/auto-paginate.js', 'js/lib/performance.js', 'js/lib/a11y.js',
  // TODO: ضيف باقي ملفات js/ هنا
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));   // لا skipWaiting تلقائي
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('portfolio-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                    // Supabase والأسعار والـ CDN: مباشرة من الشبكة، لا تُخزَّن أبداً
  if (req.mode === 'navigate') {                                       // الصفحة: الشبكة أولاً، ثم الكاش
    e.respondWith(fetch(req).then((r) => { caches.open(CACHE).then((c) => c.put('index.html', r.clone())); return r; }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => {                      // الملفات الثابتة: الكاش + تحديث في الخلفية
    const net = fetch(req).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone())); return r; }).catch(() => hit);
    return hit || net;
  }));
});

/* في التطبيق (مرة واحدة):
 * navigator.serviceWorker.register('sw.js').then((reg) => {
 *   reg.addEventListener('updatefound', () => {
 *     const nw = reg.installing;
 *     nw.addEventListener('statechange', () => {
 *       if (nw.state === 'installed' && navigator.serviceWorker.controller) {
 *         if (confirm('يوجد تحديث جديد. تحديث الآن؟')) { nw.postMessage('SKIP_WAITING'); }
 *       }
 *     });
 *   });
 *   let reloaded = false;
 *   navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
 * });
 */
