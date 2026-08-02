import * as THREE from 'three';
import { suggestedQuality } from './hardware.js';

const STORAGE_KEY = 'last-shift-graphics';

export const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];

export const QUALITY_PRESETS = {
    low: {
        label: 'Low',
        pixelRatio: 0.65,
        cameraFar: 16,
        fogDensity: 0.11,
        renderDistance: 8,
        collisionDistance: 10,
        characterDraw: 8,
        ambient: 0.9,
        hemi: 0.3,
        fillIntensity: 8,
        fillDistance: 8,
        flashlightIntensity: 22,
        flashlightDistance: 10,
        toneMapping: THREE.NoToneMapping,
        exposure: 1,
        monsterAiEvery: 3,
        gunVisible: true,
        collisionLite: true,
        antialias: false
    },
    medium: {
        label: 'Medium',
        pixelRatio: 0.9,
        cameraFar: 24,
        fogDensity: 0.075,
        renderDistance: 14,
        collisionDistance: 14,
        characterDraw: 12,
        ambient: 0.85,
        hemi: 0.35,
        fillIntensity: 10,
        fillDistance: 10,
        flashlightIntensity: 28,
        flashlightDistance: 14,
        toneMapping: THREE.NoToneMapping,
        exposure: 1,
        monsterAiEvery: 2,
        gunVisible: true,
        collisionLite: false,
        antialias: false
    },
    high: {
        label: 'High',
        pixelRatio: 1.25,
        cameraFar: 36,
        fogDensity: 0.05,
        renderDistance: 20,
        collisionDistance: 18,
        characterDraw: 18,
        ambient: 0.8,
        hemi: 0.4,
        fillIntensity: 12,
        fillDistance: 12,
        flashlightIntensity: 34,
        flashlightDistance: 16,
        toneMapping: THREE.ACESFilmicToneMapping,
        exposure: 1.05,
        monsterAiEvery: 1,
        gunVisible: true,
        collisionLite: false,
        antialias: true
    },
    ultra: {
        label: 'Ultra',
        pixelRatio: 2,
        cameraFar: 52,
        fogDensity: 0.035,
        renderDistance: 30,
        collisionDistance: 24,
        characterDraw: 24,
        ambient: 0.75,
        hemi: 0.45,
        fillIntensity: 14,
        fillDistance: 14,
        flashlightIntensity: 42,
        flashlightDistance: 18,
        toneMapping: THREE.ACESFilmicToneMapping,
        exposure: 1.12,
        monsterAiEvery: 1,
        gunVisible: true,
        collisionLite: false,
        antialias: true
    }
};

/** Soften settings only on weak phones — strong mobiles keep High/Ultra power. */
export function tunePresetForDevice(preset, qualityId, hw) {
    const p = { ...preset };
    if (!hw?.isMobile) return p;

    const weak = hw.tier === 'low';
    const mid = hw.tier === 'medium';

    if (weak) {
        if (qualityId === 'low' || qualityId === 'medium') {
            p.pixelRatio = Math.min(p.pixelRatio, 0.5);
            p.cameraFar = Math.min(p.cameraFar, 14);
            p.renderDistance = Math.min(p.renderDistance, 7);
            p.characterDraw = Math.min(p.characterDraw, 7);
            p.monsterAiEvery = Math.max(p.monsterAiEvery, 3);
            p.gunVisible = false;
            p.collisionLite = true;
            p.antialias = false;
        }
    } else if (mid) {
        if (qualityId === 'low') {
            p.pixelRatio = Math.min(p.pixelRatio, 0.65);
            p.gunVisible = false;
            p.collisionLite = true;
        }
        // medium/high/ultra on mid phones: keep most power, mild caps
        p.pixelRatio = Math.min(p.pixelRatio, qualityId === 'ultra' ? 1.5 : 1.15);
        p.antialias = qualityId === 'ultra' || qualityId === 'high';
    } else {
        // high-tier phone — use nearly full GPU
        p.pixelRatio = Math.min(p.pixelRatio, window.devicePixelRatio || 2);
        p.gunVisible = true;
        p.collisionLite = qualityId === 'low';
        p.monsterAiEvery = qualityId === 'low' ? 2 : 1;
        p.antialias = qualityId === 'high' || qualityId === 'ultra';
    }
    return p;
}

export function loadSavedQuality(hw = null) {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && QUALITY_PRESETS[saved]) return saved;
    } catch {
        // ignore
    }
    return suggestedQuality(hw);
}

export function saveQuality(id) {
    try {
        localStorage.setItem(STORAGE_KEY, id);
    } catch {
        // ignore
    }
}

export function nextQuality(id) {
    const index = QUALITY_ORDER.indexOf(id);
    return QUALITY_ORDER[(index + 1) % QUALITY_ORDER.length];
}

export function createRendererOptions(hw, qualityId = 'medium') {
    const preset = QUALITY_PRESETS[qualityId] || QUALITY_PRESETS.medium;
    const wantAA = Boolean(preset.antialias) && (hw?.useFullGpu || qualityId === 'ultra' || qualityId === 'high');
    return {
        antialias: wantAA,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: false,
        stencil: false,
        depth: true,
        alpha: false,
        desynchronized: true,
        preserveDrawingBuffer: false
    };
}

/** Full-screen canvas size that survives mobile rotate (portrait → landscape). */
export function getViewportSize() {
    const vv = window.visualViewport;
    // Prefer visualViewport on mobile browsers (accounts for URL bar / rotate).
    const w = Math.max(1, Math.floor(vv?.width || window.innerWidth || 1));
    const h = Math.max(1, Math.floor(vv?.height || window.innerHeight || 1));
    return { w, h };
}

/**
 * Resize drawing buffer + CSS so the WebGL view always fills the device screen.
 * (updateStyle:false previously left portrait CSS width after rotate → half black.)
 */
export function fitRendererToScreen(renderer, camera, pixelRatio = 1) {
    if (!renderer) return getViewportSize();
    const { w, h } = getViewportSize();
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(Math.min(pixelRatio, dpr));
    // true = also update canvas style width/height (critical after orientation change)
    renderer.setSize(w, h, true);
    const el = renderer.domElement;
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.display = 'block';
    if (camera) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    return { w, h };
}

/**
 * Apply a quality preset to the live renderer / camera / level / lights.
 */
export function applyQuality(id, ctx) {
    let preset = QUALITY_PRESETS[id] || QUALITY_PRESETS.medium;
    preset = tunePresetForDevice(preset, id, ctx.hardware);

    const { renderer, camera, scene, level, lighting, gun } = ctx;

    if (renderer) {
        renderer.toneMapping = preset.toneMapping;
        renderer.toneMappingExposure = preset.exposure;
        fitRendererToScreen(renderer, camera, preset.pixelRatio);
    } else if (camera) {
        const { w, h } = getViewportSize();
        camera.far = preset.cameraFar;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    if (camera) {
        camera.far = preset.cameraFar;
        camera.updateProjectionMatrix();
    }

    if (scene?.fog) {
        scene.fog.density = preset.fogDensity;
    }

    if (level) {
        level.renderDistance = preset.renderDistance;
        level.collisionDistance = preset.collisionDistance;
        level.collisionLite = Boolean(preset.collisionLite);
        if (camera) {
            level.updateStreaming(camera.position.x, camera.position.z, true);
        }
    }

    if (lighting) {
        if (lighting.ambient) lighting.ambient.intensity = preset.ambient;
        if (lighting.hemi) lighting.hemi.intensity = preset.hemi;
        if (lighting.flashlight) {
            lighting.flashlight.baseAmbient = preset.ambient;
            lighting.flashlight.beam.distance = preset.flashlightDistance;
            lighting.flashlight.intensityScale = preset.flashlightIntensity;
            if (lighting.flashlight.on) {
                lighting.setFlashlight(true, 1);
            }
        }
        for (const fixture of lighting.fixtures || []) {
            fixture.light.intensity = preset.fillIntensity;
            fixture.light.distance = preset.fillDistance;
            fixture.base = preset.fillIntensity;
        }
    }

    if (gun?.root) {
        gun.root.visible = preset.gunVisible;
    }

    saveQuality(id);
    return preset;
}
