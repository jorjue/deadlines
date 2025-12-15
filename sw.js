const CACHE_NAME = 'deadlines-shell-v2';
const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        );
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;

    // GET以外は触らない
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // 自分のオリジンだけ扱う（外部はそのまま）
    if (url.origin !== self.location.origin) return;

    // HTMLは「ネット優先（更新反映）」→失敗時キャッシュ
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req).then((res) => {
                const copy = res.clone();
                caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
                return res;
            }).catch(() => caches.match('./index.html'))
        );
        return;
    }

    // CSS/JS/アイコンなどは「キャッシュ優先」
    event.respondWith(
        caches.match(req).then((cached) => cached || fetch(req))
    );
});
