/* The Last Shift — runtime cache only.
 * Do NOT precache large GLBs/MP3s on install (that races the loading screen on
 * mobile / port-share). Cache assets the first time the page requests them.
 */
const CACHE = 'last-shift-assets-v3';

self.addEventListener('install', (event) => {
    // Activate immediately; no bulky precache.
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

function isGameAsset(url) {
    const path = url.pathname;
    return (
        path.startsWith('/models/')
        || path.startsWith('/music/')
        || path.startsWith('/draco/')
        || path.endsWith('.glb')
        || path.endsWith('.mp3')
        || path.endsWith('.wasm')
    );
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    let url;
    try {
        url = new URL(req.url);
    } catch {
        return;
    }
    if (url.origin !== self.location.origin) return;

    // Never intercept Vite HMR / module graph in dev.
    if (
        url.pathname.startsWith('/@')
        || url.pathname.startsWith('/node_modules/')
        || url.pathname.startsWith('/src/')
        || url.search.includes('t=')
        || url.search.includes('v=')
    ) {
        return;
    }

    if (!isGameAsset(url)) return;

    event.respondWith(
        caches.open(CACHE).then(async (cache) => {
            const hit = await cache.match(req, { ignoreSearch: true });
            if (hit) return hit;
            try {
                const res = await fetch(req);
                if (res && res.ok) cache.put(req, res.clone());
                return res;
            } catch (err) {
                if (hit) return hit;
                throw err;
            }
        })
    );
});
