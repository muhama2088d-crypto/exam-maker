// ═══════════════════════════════════════════
// Service Worker — نسخة محسّنة للأوفلاين
// ═══════════════════════════════════════════
const CACHE_NAME = 'exam-maker-v9.3';   // ⬅️ رقم مهم! كل تحديث غيّره
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

// مهلة انتظار الشبكة: إذا ما ردّت خلال هالمدة، نستخدم الكاش
const NETWORK_TIMEOUT = 3500;

// ── تثبيت: خزّن الملفات (كل ملف لحاله حتى لا يفشل الكل) ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        PRECACHE.map(url =>
          cache.add(url).catch(err => console.warn('فشل تخزين:', url, err))
        )
      );
    })
  );
  // ⚠️ لا نستدعي skipWaiting هون — ننتظر المستخدم يضغط "تحديث"
});

// ── تفعيل: امسح النسخ القديمة ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── استقبل رسالة من الصفحة: "سيطر الآن" ──
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('network-timeout')), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      err => { clearTimeout(timer); reject(err); }
    );
  });
}

// ── جلب الملفات ──
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;

  const isHTML = request.headers.get('accept') &&
                 request.headers.get('accept').includes('text/html');

  // HTML: الشبكة أولاً (مع مهلة) — وإلا الكاش
  if (isHTML) {
    event.respondWith((async () => {
      try {
        const response = await withTimeout(fetch(request), NETWORK_TIMEOUT);
        if (response && response.ok) {
          const clone = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, clone)));
          return response;
        }
        throw new Error('bad-response');
      } catch (err) {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        const fallback = await caches.match('./index.html', { ignoreSearch: true });
        if (fallback) return fallback;
        return new Response(
          '<html dir="rtl" lang="ar"><meta charset="utf-8"><body style="font-family:sans-serif;text-align:center;padding:40px">' +
          '<h2>التطبيق غير محفوظ بعد</h2><p>افتح التطبيق مرة واحدة وأنت متصل بالإنترنت حتى يعمل بدون نت.</p></body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  // الباقي: الكاش أولاً
  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const clone = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, clone)));
      }
      return response;
    } catch (err) {
      return new Response('', { status: 404 });
    }
  })());
});
