// Probe the visitor's GPU/CPU so we can push High/Ultra on strong devices
// and keep Low only when the hardware is actually weak.

export function detectHardware() {
    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 4; // GB, Chrome/Android mainly
    const dpr = window.devicePixelRatio || 1;
    const isMobile = matchMedia('(pointer: coarse)').matches
        || ('ontouchstart' in window)
        || (navigator.maxTouchPoints > 0);

    let gpu = 'unknown';
    let webgl2 = false;
    let maxTexture = 0;

    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2', { powerPreference: 'high-performance' })
            || canvas.getContext('webgl', { powerPreference: 'high-performance' });
        if (gl) {
            webgl2 = typeof WebGL2RenderingContext !== 'undefined'
                && gl instanceof WebGL2RenderingContext;
            maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
            const info = gl.getExtension('WEBGL_debug_renderer_info');
            if (info) {
                gpu = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || 'unknown');
            } else {
                gpu = String(gl.getParameter(gl.RENDERER) || 'unknown');
            }
            const lose = gl.getExtension('WEBGL_lose_context');
            lose?.loseContext();
        }
    } catch {
        // ignore probe failures
    }

    const gpuLower = gpu.toLowerCase();
    const isIntegrated = /uhd graphics|hd graphics|iris\(r\) graphics|iris graphics|mali-4|adreno \(tm\) [3-5]|powervr|apple gpu/.test(gpuLower)
        && !/rtx|gtx|radeon rx|geforce|adreno \(tm\) [6-9]|adreno \(tm\) 7|mali-g[7-9]|apple m[1-9]|xclipse/.test(gpuLower);

    const isHighGpu = /rtx|gtx 16|gtx 20|gtx 30|gtx 40|radeon rx|geforce|adreno \(tm\) [6-9]|adreno \(tm\) 7|mali-g7|mali-g8|mali-g9|apple m[1-9]|xclipse|immortalis/.test(gpuLower)
        || (!isIntegrated && maxTexture >= 8192 && cores >= 6);

    const isMidGpu = /adreno \(tm\) 6|mali-g5|mali-g6|iris xe|uhd graphics 6|apple gpu/.test(gpuLower)
        || (cores >= 6 && memory >= 6);

    let tier = 'low';
    if (isHighGpu && cores >= 6 && memory >= 6) tier = 'ultra';
    else if (isHighGpu || (isMidGpu && memory >= 4)) tier = 'high';
    else if (isMidGpu || cores >= 4) tier = 'medium';
    else tier = 'low';

    // Strong phones (flagships) should not be forced to Low forever.
    if (isMobile && tier === 'ultra') tier = 'high';
    if (isMobile && memory <= 3) tier = 'low';
    if (isMobile && memory <= 4 && tier === 'high') tier = 'medium';

    return {
        cores,
        memory,
        dpr,
        isMobile,
        gpu,
        webgl2,
        maxTexture,
        isIntegrated,
        tier, // 'low' | 'medium' | 'high' | 'ultra'
        useFullGpu: tier === 'high' || tier === 'ultra'
    };
}

/** Map hardware tier → default graphics preset id. */
export function suggestedQuality(hw) {
    if (!hw) return 'medium';
    if (hw.tier === 'ultra') return 'ultra';
    if (hw.tier === 'high') return 'high';
    if (hw.tier === 'medium') return 'medium';
    return 'low';
}

/**
 * Keep the screen awake and tip the OS toward performance while playing.
 * Best-effort — browsers may ignore these.
 */
export async function engagePerformanceMode() {
    const handles = { wakeLock: null };

    try {
        if (navigator.wakeLock?.request) {
            handles.wakeLock = await navigator.wakeLock.request('screen');
            handles.wakeLock.addEventListener?.('release', () => {
                handles.wakeLock = null;
            });
        }
    } catch {
        // Not allowed without gesture / unsupported.
    }

    try {
        // Hint Chrome that this tab is a game (reduces background throttling risk).
        if ('scheduling' in navigator && navigator.scheduling?.isInputPending) {
            // no-op probe — presence alone is fine
        }
    } catch {
        // ignore
    }

    return handles;
}

export async function releasePerformanceMode(handles) {
    try {
        await handles?.wakeLock?.release?.();
    } catch {
        // ignore
    }
}

export async function enterGameDisplayMode() {
    try {
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) {
            await el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
        }
    } catch {
        // ignore
    }

    try {
        if (screen.orientation?.lock) {
            await screen.orientation.lock('landscape').catch(() => {});
        }
    } catch {
        // ignore
    }
}
