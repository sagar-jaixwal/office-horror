// Pure client runtime. Host only delivers bytes; WebGL runs in the visitor browser.

export const CLIENT_ASSET_URLS = [
    { url: '/models/garden_crawler.glb', label: 'monster', heavy: true },
    { url: '/models/nerf_gun.glb', label: 'gun', heavy: true },
    { url: '/models/the_heilwald_loophole_randolphs_office.glb', label: 'map', heavy: true },
    { url: '/music/gun/media_man_uk-lazer-gun-432285.mp3', label: 'laser sfx', heavy: false },
    { url: '/music/sound/moster_sound.mp3', label: 'monster sfx', heavy: false },
    {
        url: '/music/background%20music/Resident%20Evil%204%20OST%20-%20Garrador%20%5BX70DwhWz0Lw%5D.mp3',
        label: 'music',
        heavy: true
    },
    { url: '/draco/gltf/draco_decoder.wasm', label: 'decoder', heavy: false },
    { url: '/draco/gltf/draco_wasm_wrapper.js', label: 'decoder', heavy: false },
    { url: '/draco/gltf/draco_decoder.js', label: 'decoder', heavy: false }
];

const DEFAULT_TIMEOUT_MS = 45000;

export function fetchWithTimeout(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { credentials: 'same-origin', signal: controller.signal })
        .finally(() => clearTimeout(timer));
}

/** Register SW after first load so it does not compete with the loading screen. */
export function registerClientCache({ deferMs = 0 } = {}) {
    if (!('serviceWorker' in navigator)) {
        return Promise.resolve({ ok: false, reason: 'unsupported' });
    }

    const run = () => navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => ({ ok: true, reg }))
        .catch((error) => {
            console.warn('[client] service worker not registered', error);
            return { ok: false, reason: error.message };
        });

    if (deferMs > 0) {
        return new Promise((resolve) => {
            setTimeout(() => run().then(resolve), deferMs);
        });
    }
    return run();
}

/**
 * Optional warm-up download.
 * Mobile should pass { skipHeavy: true } so GLBs/music are not downloaded twice.
 */
export async function downloadAssetsToClient(onProgress, { skipHeavy = false } = {}) {
    const list = CLIENT_ASSET_URLS.filter((a) => (skipHeavy ? !a.heavy : true));
    const total = list.length || 1;
    let done = 0;

    // Sequential: clearer progress + less tunnel congestion on phones.
    for (const asset of list) {
        onProgress?.(done / total, asset.label, asset.url);
        try {
            const res = await fetchWithTimeout(asset.url, { timeoutMs: DEFAULT_TIMEOUT_MS });
            if (res.ok) await res.arrayBuffer();
            else console.warn('[client] asset HTTP', res.status, asset.url);
        } catch (error) {
            console.warn('[client] asset download failed', asset.url, error);
        }
        done += 1;
        onProgress?.(done / total, asset.label, asset.url);
    }

    return { total, done };
}

export function withTimeout(promise, ms, label = 'operation') {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function describeClientRuntime() {
    return {
        mode: 'browser-client',
        note: 'Game logic and WebGL run on the visitor device. Host only serves files.',
        hardware: 'visitor-gpu-cpu',
        hostRole: 'file-server-only'
    };
}
