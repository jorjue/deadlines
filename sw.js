const CACHE_NAME = 'deadlines-shell-v5';

const INDEX_URL = new URL('./index.html', self.registration.scope).toString();

// APP_SHELLには実在するファイルを入れる
const APP_SHELL = [
    './index.html',
    './style.css',
    './app.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-512-maskable.png',
    './icons/apple-touch-icon.png',
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

    // GET以外は触らない（POSTなどを壊さない）
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // 同一オリジンだけ対象（外部CDN等は任せる）
    if (url.origin !== self.location.origin) return;

    // ① ページ遷移（HTML）は network-first（更新されやすい）
    if (req.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const fresh = await fetch(req);
                const cache = await caches.open(CACHE_NAME);
                cache.put(req, fresh.clone());
                return fresh;
            } catch (e) {
                const cached = await caches.match(req);
                return cached || caches.match(INDEX_URL);
            }
        })());
        return;
    }


    // ② 静的アセットは stale-while-revalidate（速い＋更新も入る）
    const isStatic =
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.png') ||
        url.pathname.endsWith('.svg') ||
        url.pathname.endsWith('.ico') ||
        url.pathname.endsWith('.webmanifest');

    if (isStatic) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(req);

            const fetchAndUpdate = fetch(req)
                .then((res) => {
                    // res.ok 以外はキャッシュしない（404等を保存しない）
                    if (res && res.ok) cache.put(req, res.clone());
                    return res;
                })
                .catch(() => null);

            // キャッシュがあれば即返し、裏で更新
            return cached || (await fetchAndUpdate) || cached;
        })());
        return;
    }

    // ③ それ以外は今まで通り（軽く network-first でもOK）
    event.respondWith((async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
    })());
});

