import * as THREE from 'three';
import { Level, mapInfo } from './src/level.js';
import { LightingRig, configureRenderer, configureAtmosphere } from './src/lighting.js';
import { createMonster } from './src/characters.js';
import { loadModels, assets } from './src/models.js';
import { createLaserGun, updateGun, showLaserBeam } from './src/gun.js';
import { Audio } from './src/audio.js';
import {
    QUALITY_PRESETS,
    loadSavedQuality,
    nextQuality,
    applyQuality,
    createRendererOptions,
    fitRendererToScreen
} from './src/graphics.js';
import { isTouchDevice, setupTouchControls } from './src/touchControls.js';
import {
    registerClientCache,
    downloadAssetsToClient,
    describeClientRuntime
} from './src/clientRuntime.js';
import {
    detectHardware,
    engagePerformanceMode,
    releasePerformanceMode,
    enterGameDisplayMode
} from './src/hardware.js';

const MODEL_LABELS = {
    building: 'map',
    crawler: 'monster',
    gun: 'gun'
};

const EYE_HEIGHT = 1.68;
const WALK_SPEED = 2.6;
const RUN_SPEED = 4.9;
const BATTERY_DRAIN = 1.15;
const MONSTER_REVEAL_DELAY = 30;
const LASER_RANGE = 22;
const LASER_DAMAGE = 34;
const LASER_COOLDOWN = 0.28;

let renderer, scene, camera, level, lighting, gun;
const audio = new Audio();
const timer = new THREE.Timer();
const raycaster = new THREE.Raycaster();
const screenCentre = new THREE.Vector2(0, 0);
const muzzleWorld = new THREE.Vector3();
const hitPoint = new THREE.Vector3();
const facingDir = new THREE.Vector3();
const torsoPoint = new THREE.Vector3();
const toTarget = new THREE.Vector3();
const _fwd = new THREE.Vector3(0, 0, -1);

const input = { forward: false, back: false, left: false, right: false, run: false };

const player = {
    position: new THREE.Vector3(0, EYE_HEIGHT, 0),
    yaw: 0,
    pitch: 0,
    health: 100,
    fear: 0,
    stamina: 100,
    bob: 0,
    battery: 100,
    flashlightOn: false,
    hasKey: false,
    spareBatteries: 0,
    hurtCooldown: 0
};

const state = {
    started: false,
    paused: false,
    dead: false,
    complete: false,
    heartTimer: 0,
    elapsed: 0,
    playTime: 0,
    monstersReleased: false,
    monstersHidden: false,
    frameCount: 0,
    perfEnabled: false,
    perfFrames: 0,
    perfLast: 0,
    perfFps: 0,
    quality: 'medium',
    characterDraw: 12,
    monsterAiEvery: 2,
    collisionLite: false,
    isMobile: false,
    awaitingLandscape: false,
    hardware: null
};
const monsters = [];
const ui = {};
let touchControls = null;
let perfHandles = null;

function cacheUI() {
    for (const id of [
        'health-fill', 'battery-fill', 'stamina-fill', 'objective-text', 'heartbeat-overlay',
        'damage-flash', 'start-screen', 'chapter-end', 'death-screen', 'pause-screen',
        'interact-prompt', 'battery-count', 'crosshair', 'start-button', 'monster-toggle',
        'graphics-toggle', 'perf-hud', 'start-graphics', 'pause-graphics', 'rotate-overlay'
    ]) {
        ui[id] = document.getElementById(id);
    }
}

function isLandscape() {
    return window.matchMedia('(orientation: landscape)').matches
        || window.innerWidth > window.innerHeight;
}

function updateLandscapeGate() {
    if (!state.isMobile || !ui['rotate-overlay']) return;
    // Only block once they try to play / are in-game — start screen stays readable.
    const needRotate = !isLandscape() && (state.started || state.awaitingLandscape);
    ui['rotate-overlay'].classList.toggle('visible', needRotate);
    document.body.classList.toggle('portrait-blocked', needRotate);

    if (state.awaitingLandscape && isLandscape() && !state.started) {
        state.awaitingLandscape = false;
        beginGame();
    }
}

async function requestLandscape() {
    try {
        const orient = screen.orientation;
        if (orient?.lock) {
            await orient.lock('landscape');
            return;
        }
    } catch {
        // Browsers often require fullscreen + gesture; overlay covers the rest.
    }
    try {
        const el = document.documentElement;
        if (el.requestFullscreen) await el.requestFullscreen();
        const orient = screen.orientation;
        if (orient?.lock) await orient.lock('landscape');
    } catch {
        // User can rotate manually — overlay stays until landscape.
    }
}

function graphicsContext() {
    return {
        renderer,
        camera,
        scene,
        level,
        lighting,
        gun,
        isMobile: state.isMobile,
        hardware: state.hardware
    };
}

function setGraphicsQuality(id, { announce = true } = {}) {
    if (!QUALITY_PRESETS[id]) return;
    state.quality = id;
    const preset = applyQuality(id, graphicsContext());
    state.characterDraw = preset.characterDraw;
    state.monsterAiEvery = preset.monsterAiEvery;
    state.collisionLite = Boolean(preset.collisionLite);
    syncGraphicsUI();
    if (announce) {
        const tip = state.isMobile && !preset.gunVisible ? ' (gun hidden for FPS)' : '';
        flashPrompt(`Graphics: ${preset.label}${tip}`);
    }
}

function syncGraphicsUI() {
    const label = QUALITY_PRESETS[state.quality]?.label || 'Medium';
    if (ui['graphics-toggle']) {
        ui['graphics-toggle'].textContent = `Graphics: ${label}`;
    }
    for (const panelId of ['start-graphics', 'pause-graphics']) {
        const panel = ui[panelId];
        if (!panel) continue;
        for (const btn of panel.querySelectorAll('[data-quality]')) {
            btn.classList.toggle('active', btn.dataset.quality === state.quality);
        }
    }
}

function cycleGraphicsQuality() {
    setGraphicsQuality(nextQuality(state.quality));
}

async function init() {
    cacheUI();

    state.hardware = detectHardware();
    state.isMobile = state.hardware.isMobile || isTouchDevice();
    if (state.isMobile) document.body.classList.add('touch-mode');
    console.info('[hardware]', state.hardware);

    scene = new THREE.Scene();
    configureAtmosphere(scene);
    timer.connect(document);

    state.quality = loadSavedQuality(state.hardware);
    const initialPreset = QUALITY_PRESETS[state.quality] || QUALITY_PRESETS.medium;

    camera = new THREE.PerspectiveCamera(
        65,
        window.innerWidth / window.innerHeight,
        0.15,
        initialPreset.cameraFar
    );
    camera.rotation.order = 'YXZ';
    scene.add(camera);

    // Ask the browser for the discrete / high-performance GPU + optional AA on High/Ultra.
    const rendererOpts = createRendererOptions(state.hardware, state.quality);
    try {
        renderer = new THREE.WebGLRenderer(rendererOpts);
    } catch {
        renderer = new THREE.WebGLRenderer({
            antialias: false,
            powerPreference: 'high-performance',
            depth: true,
            stencil: false
        });
    }
    configureRenderer(renderer, {
        pixelRatio: Math.min(initialPreset.pixelRatio, window.devicePixelRatio || 1)
    });
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    fitRendererToScreen(
        renderer,
        camera,
        Math.min(initialPreset.pixelRatio, window.devicePixelRatio || 1)
    );

    // Host only serves files. Avoid double-downloading heavy assets on mobile /
    // port-share (that made the loading button look frozen at 0%).
    if (state.isMobile) {
        ui['start-button'].textContent = 'WARMING DECODER…';
        await downloadAssetsToClient((fraction, label) => {
            ui['start-button'].textContent =
                `PREP ${Math.round(fraction * 100)}% (${label || 'assets'})`;
        }, { skipHeavy: true });
    } else {
        ui['start-button'].textContent = 'DOWNLOADING 0%';
        await downloadAssetsToClient((fraction, label) => {
            ui['start-button'].textContent =
                `DOWNLOADING ${Math.round(fraction * 100)}% — ${label || 'assets'}`;
        }, { skipHeavy: false });
    }

    await loadModels((fraction, name) => {
        const label = MODEL_LABELS[name] || name || 'model';
        const pct = Math.round(fraction * 100);
        ui['start-button'].textContent = `LOADING ${label.toUpperCase()} ${pct}%`;
    }, {
        sequential: state.isMobile,
        timeoutMs: state.isMobile ? 90000 : 60000
    });

    ui['start-button'].textContent = 'BUILDING LEVEL…';
    level = new Level(scene).build();
    // spawn.y is the floor; player.position.y is eye height above that floor.
    player.position.set(level.spawn.x, level.spawn.y + EYE_HEIGHT, level.spawn.z);
    player.yaw = level.spawn.heading;
    level.freeIfStuck(player.position);
    camera.position.copy(player.position);

    lighting = new LightingRig(scene, camera).build(level);
    gun = createLaserGun(camera);
    scene.add(gun.beam);

    setGraphicsQuality(state.quality, { announce: false });

    prepareMonsters();
    setupEventListeners();
    setupMobileControls();
    updateLandscapeGate();
    updateUI();
    exposeDebugHooks();

    ui['start-button'].textContent = state.isMobile ? 'TAP TO ENTER (LANDSCAPE)' : 'ENTER THE OFFICE';
    ui['start-button'].disabled = false;

    // Cache for next visit only after the game is ready (won't stall first load).
    registerClientCache({ deferMs: 2500 });

    // ?perf=1 shows live draw calls / triangles / FPS.
    if (new URLSearchParams(location.search).has('perf') && ui['perf-hud']) {
        ui['perf-hud'].style.display = 'block';
        state.perfEnabled = true;
        state.perfFrames = 0;
        state.perfLast = performance.now();
        state.perfFps = 0;
    }

    renderer.setAnimationLoop(frame);
}

function exposeDebugHooks() {
    if (!import.meta.env?.DEV) return;
    window.__debug = {
        forceResume: () => {
            state.paused = false;
            state.started = true;
            ui['start-screen'].style.display = 'none';
        },
        releaseMonsters: () => releaseMonsters(),
        shoot: () => shootLaser(),
        setFlashlight: (on) => {
            player.flashlightOn = on;
            lighting.setFlashlight(on, player.battery / 100);
        },
        teleport: (x, z, yaw = player.yaw) => {
            player.position.set(x, player.position.y, z);
            level.snapToGround(player.position);
            player.yaw = yaw;
            camera.position.copy(player.position);
        },
        poseMonster: (index, distance) => {
            const monster = monsters[index];
            if (!monster) return;
            for (const other of monsters) {
                if (other === monster) continue;
                other.frozen = true;
                other.container.position.set(other.container.position.x, -20, other.container.position.z);
            }
            monster.container.position.set(player.position.x, 0, player.position.z - distance);
            const floor = level.groundAt(monster.container.position.x, monster.container.position.z);
            monster.container.position.y = floor ?? level.spawn.y;
            monster.container.rotation.y = Math.PI;
            monster.frozen = true;
            monster.active = true;
            monster.dead = false;
            monster.container.visible = true;
            monster.rig.root.rotation.x = 0;
            player.yaw = 0;
            player.pitch = 0;
        },
        stats: () => ({
            map: mapInfo(level),
            playTime: state.playTime,
            monstersReleased: state.monstersReleased,
            monsters: monsters.map((m) => ({
                kind: m.kind, active: m.active, dead: m.dead, health: m.health
            })),
            models: Object.fromEntries(
                Object.entries(assets.models).map(([name, entry]) => [
                    name,
                    `${entry.triangles} tris, scale x${entry.scale}`
                ])
            ),
            modelFailures: assets.failures,
            spawn: level.spawn,
            floorUnderPlayer: level.groundAt(player.position.x, player.position.z),
            playerY: player.position.y,
            collisionMeshes: level.collisionMeshes.length,
            activeColliders: level.activeColliders.length,
            visibleChunks: level.renderChunks.filter((c) => c.mesh.visible).length,
            interactables: level.interactables.length,
            fixtures: lighting.fixtures.length,
            drawCalls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            quality: state.quality,
            hardware: state.hardware,
            runtime: describeClientRuntime(),
            playerBlocked: level.isBlocked(player.position.x, player.position.z, 0.34)
        }),
        setQuality: (id) => setGraphicsQuality(id)
    };
}

function prepareMonsters() {
    // Three hunters — only the first is released at 30s; the next appear after each kill.
    const specs = [
        { kind: 'acidMouth', waypoint: 0 },
        { kind: 'stalker', waypoint: 2 },
        { kind: 'ceilingCrawler', waypoint: 4 }
    ];

    for (const spec of specs) {
        const rig = createMonster(spec.kind);
        const container = new THREE.Group();
        container.visible = false;
        container.add(rig.root);
        scene.add(container);

        const monster = {
            kind: spec.kind,
            rig,
            container,
            waypoint: spec.waypoint,
            phase: Math.random() * Math.PI * 2,
            mode: 'chase',
            dropProgress: 0,
            growlTimer: 2 + Math.random() * 4,
            // Fast enough to close distance; wall-slide keeps them pressing in.
            profile: {
                ...rig.profile,
                speed: Math.max(1.8, rig.profile.speed * 1.35),
                chase: Math.max(3.4, (rig.profile.chase || 2) * 1.55),
                sight: Math.max(40, rig.profile.sight || 12)
            },
            health: 100,
            active: false,
            dead: false,
            frozen: false,
            stuckTimer: 0,
            sidestep: 1
        };

        container.traverse((child) => {
            if (child.isMesh) child.userData.monsterRef = monster;
        });

        monsters.push(monster);
    }
}

function activateMonster(monster, spot) {
    monster.container.position.set(spot.x, spot.y, spot.z);
    monster.rig.root.rotation.x = 0;
    // Hunt immediately — do not wait for line-of-sight in this maze.
    monster.mode = 'chase';
    monster.active = true;
    monster.dead = false;
    monster.frozen = false;
    monster.health = 100;
    monster.stuckTimer = 0;
    monster.sidestep = Math.random() < 0.5 ? 1 : -1;
    monster.growlTimer = 1.5 + Math.random() * 2;
    monster.container.visible = !state.monstersHidden;
    monster.container.rotation.y = Math.atan2(
        player.position.x - spot.x,
        player.position.z - spot.z
    );
}

function releaseMonsters() {
    if (state.monstersReleased) return;
    state.monstersReleased = true;

    const first = monsters[0];
    if (first) {
        const spots = findRevealSpots(1, []);
        activateMonster(first, spots[0]);
    }

    audio.scare();
    flashPrompt('Something is in the office with you.');
    setObjective('Objective: Survive — more are coming');
}

function spawnNextMonster() {
    const next = monsters.find((m) => !m.active && !m.dead);
    if (!next) return false;

    const occupied = monsters
        .filter((m) => m.active && !m.dead)
        .map((m) => ({ x: m.container.position.x, z: m.container.position.z }));
    const spots = findRevealSpots(1, occupied);
    activateMonster(next, spots[0]);

    const remaining = monsters.filter((m) => !m.active && !m.dead).length;
    audio.scare();
    flashPrompt(remaining > 0
        ? `${next.profile.name} arrived. ${remaining} still waiting...`
        : `${next.profile.name} arrived. Last one.`);
    return true;
}

function findRevealSpots(count, occupied = []) {
    const spots = [];
    // Close enough to reach you, far enough not to spawn on top of you.
    const minDist = 7;
    const maxDist = 14;
    const sectorOffset = Math.random() * Math.PI * 2;
    // Prefer evenly spaced sectors so each wave lands in a different direction.
    const attempts = Math.max(96, count * 48);

    for (let i = 0; i < attempts && spots.length < count; i++) {
        const sector = (spots.length + i * 0.37) / Math.max(count, 1);
        const ang = sectorOffset + sector * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const dist = minDist + Math.random() * (maxDist - minDist);
        const x = player.position.x + Math.sin(ang) * dist;
        const z = player.position.z + Math.cos(ang) * dist;
        if (!level.isWalkable(x, z, 0.45)) continue;
        const y = level.groundAt(x, z);
        if (y === null) continue;
        if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 7)) continue;
        if (occupied.some((s) => Math.hypot(s.x - x, s.z - z) < 7)) continue;
        spots.push({ x, y, z });
    }

    // Wider fallback search if walkable sampling was sparse.
    for (let i = 0; i < 60 && spots.length < count; i++) {
        const ang = sectorOffset + (i / 60) * Math.PI * 2;
        const dist = 8 + (i % 5) * 3;
        const x = player.position.x + Math.sin(ang) * dist;
        const z = player.position.z + Math.cos(ang) * dist;
        if (!level.isWalkable(x, z, 0.4)) continue;
        const y = level.groundAt(x, z);
        if (y === null) continue;
        if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 5)) continue;
        spots.push({ x, y, z });
    }

    while (spots.length < count) {
        const ang = sectorOffset + spots.length * ((Math.PI * 2) / Math.max(count, 1));
        spots.push({
            x: player.position.x + Math.sin(ang) * 14,
            y: level.spawn.y,
            z: player.position.z + Math.cos(ang) * 14
        });
    }
    return spots;
}

function setupMobileControls() {
    touchControls = setupTouchControls({
        isPlaying,
        input,
        player,
        onShoot: () => shootLaser(),
        onInteract: () => interact(),
        onFlashlight: () => toggleFlashlight(),
        onPause: () => pauseGame()
    });
}

function pauseGame() {
    if (!state.started || state.dead || state.complete || state.paused) return;
    state.paused = true;
    ui['pause-screen'].style.display = 'flex';
    audio.pauseMusic();
    touchControls?.hide();
    releasePerformanceMode(perfHandles);
    perfHandles = null;
    if (!state.isMobile) document.exitPointerLock?.();
}

function resumeGame() {
    if (!state.started || state.dead || state.complete) return;
    state.paused = false;
    ui['pause-screen'].style.display = 'none';
    audio.resumeMusic();
    engagePerformanceMode().then((h) => { perfHandles = h; });
    if (state.isMobile) {
        touchControls?.show();
        enterGameDisplayMode();
    } else {
        document.body.requestPointerLock();
    }
}

function setupEventListeners() {
    document.getElementById('start-button').addEventListener('click', beginGame);
    document.getElementById('retry-button').addEventListener('click', () => window.location.reload());
    ui['monster-toggle'].addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleMonsterVisibility();
        // Keep playing — re-lock if the click stole focus from the canvas.
        if (!state.isMobile && state.started && !state.paused && !state.dead && !state.complete) {
            document.body.requestPointerLock();
        }
    });

    document.addEventListener('keydown', (event) => {
        switch (event.code) {
            case 'KeyW': case 'ArrowUp': input.forward = true; break;
            case 'KeyS': case 'ArrowDown': input.back = true; break;
            case 'KeyA': case 'ArrowLeft': input.left = true; break;
            case 'KeyD': case 'ArrowRight': input.right = true; break;
            case 'ShiftLeft': case 'ShiftRight': input.run = true; break;
            case 'KeyE': interact(); break;
            case 'KeyH':
                if (!event.repeat) toggleMonsterVisibility();
                break;
            case 'KeyG':
                if (!event.repeat) cycleGraphicsQuality();
                break;
            case 'KeyF':
                if (!event.repeat) toggleFlashlight();
                event.preventDefault();
                break;
            case 'Space':
                if (!event.repeat) shootLaser();
                event.preventDefault();
                break;
            default: break;
        }
    });

    document.addEventListener('keyup', (event) => {
        switch (event.code) {
            case 'KeyW': case 'ArrowUp': input.forward = false; break;
            case 'KeyS': case 'ArrowDown': input.back = false; break;
            case 'KeyA': case 'ArrowLeft': input.left = false; break;
            case 'KeyD': case 'ArrowRight': input.right = false; break;
            case 'ShiftLeft': case 'ShiftRight': input.run = false; break;
            default: break;
        }
    });

    document.addEventListener('mousemove', (event) => {
        if (!isPlaying() || state.isMobile) return;
        player.yaw -= event.movementX * 0.0022;
        player.pitch -= event.movementY * 0.0022;
        player.pitch = THREE.MathUtils.clamp(player.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    });

    renderer.domElement.addEventListener('mousedown', (event) => {
        if (!state.started || state.dead || state.complete || state.isMobile) return;
        if (document.pointerLockElement !== document.body) {
            document.body.requestPointerLock();
            return;
        }
        // Left or right mouse button fires; interact stays on E.
        if (event.button === 0 || event.button === 2) {
            event.preventDefault();
            shootLaser();
        }
    });

    renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
    document.addEventListener('contextmenu', (event) => {
        if (document.pointerLockElement === document.body) event.preventDefault();
    });

    ui['pause-screen'].addEventListener('click', (event) => {
        // Don't resume when clicking a graphics button.
        if (event.target.closest('[data-quality]')) return;
        if (state.paused) resumeGame();
    });

    ui['graphics-toggle']?.addEventListener('click', (event) => {
        event.stopPropagation();
        cycleGraphicsQuality();
    });

    for (const panelId of ['start-graphics', 'pause-graphics']) {
        ui[panelId]?.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-quality]');
            if (!btn) return;
            event.stopPropagation();
            setGraphicsQuality(btn.dataset.quality);
        });
    }

    document.addEventListener('pointerlockchange', () => {
        // Mobile uses its own pause button — pointer lock is desktop-only.
        if (state.isMobile) return;
        const locked = document.pointerLockElement === document.body;
        state.paused = state.started && !locked && !state.dead && !state.complete;
        ui['pause-screen'].style.display = state.paused ? 'flex' : 'none';
        if (state.paused) audio.pauseMusic();
        else if (state.started && !state.dead && !state.complete) audio.resumeMusic();
    });

    const refitViewport = () => {
        applyQuality(state.quality, graphicsContext());
        updateLandscapeGate();
    };

    window.addEventListener('resize', () => {
        refitViewport();
    });

    // Mobile browsers lie about size during rotate — refit several times.
    window.addEventListener('orientationchange', () => {
        refitViewport();
        setTimeout(refitViewport, 50);
        setTimeout(refitViewport, 200);
        setTimeout(() => {
            refitViewport();
            if (state.isMobile && state.started && isLandscape() && !state.paused) {
                touchControls?.show();
            }
        }, 400);
    });

    window.visualViewport?.addEventListener('resize', () => {
        refitViewport();
    });

    ui['rotate-overlay']?.addEventListener('click', () => {
        requestLandscape();
        setTimeout(refitViewport, 100);
        setTimeout(refitViewport, 350);
    });

    // Prevent iOS rubber-band / pull-to-refresh while playing.
    document.addEventListener('touchmove', (event) => {
        if (state.started && !state.paused) event.preventDefault();
    }, { passive: false });
}

function toggleMonsterVisibility() {
    state.monstersHidden = !state.monstersHidden;
    ui['monster-toggle'].textContent = state.monstersHidden ? 'Show Monsters' : 'Hide Monsters';
    ui['monster-toggle'].classList.toggle('hidden-mode', state.monstersHidden);

    for (const monster of monsters) {
        if (state.monstersHidden || monster.dead || !monster.active) {
            monster.container.visible = false;
        } else {
            monster.container.visible = true;
        }
    }

    flashPrompt(state.monstersHidden ? 'Monsters hidden.' : 'Monsters visible.');
}

function beginGame() {
    if (state.isMobile && !isLandscape()) {
        state.awaitingLandscape = true;
        updateLandscapeGate();
        requestLandscape();
        return;
    }

    state.awaitingLandscape = false;
    ui['start-screen'].style.display = 'none';
    ui['rotate-overlay']?.classList.remove('visible');
    state.started = true;
    state.paused = false;
    state.playTime = 0;
    state.monstersReleased = false;
    audio.start();

    // Push OS / browser toward sustained GPU + unlocked refresh while playing.
    engagePerformanceMode().then((h) => { perfHandles = h; });
    enterGameDisplayMode();

    const tier = state.hardware?.tier || 'medium';
    // Refit after fullscreen/landscape so we never keep a half-width portrait canvas.
    applyQuality(state.quality, graphicsContext());
    setTimeout(() => applyQuality(state.quality, graphicsContext()), 100);
    setTimeout(() => applyQuality(state.quality, graphicsContext()), 350);

    if (state.isMobile) {
        requestLandscape();
        touchControls?.show();
        updateLandscapeGate();
        flashPrompt(`Using your ${tier.toUpperCase()} GPU tier — Graphics: ${QUALITY_PRESETS[state.quality]?.label}`);
    } else {
        document.body.requestPointerLock();
        flashPrompt(`Hardware tier ${tier.toUpperCase()} — Graphics: ${QUALITY_PRESETS[state.quality]?.label}`);
    }
    setObjective('Objective: Explore — something arrives in 30 seconds');
}

function isPlaying() {
    if (state.isMobile && !isLandscape()) return false;
    return state.started && !state.paused && !state.dead && !state.complete;
}

function shootLaser() {
    if (!isPlaying() || !gun || gun.cooldown > 0) return;

    gun.cooldown = LASER_COOLDOWN;
    gun.recoil = 1;
    audio.laser();

    gun.tip.getWorldPosition(muzzleWorld);
    raycaster.setFromCamera(screenCentre, camera);
    raycaster.far = LASER_RANGE;

    facingDir.copy(_fwd).applyQuaternion(camera.quaternion);
    let best = null;
    let bestDist = Infinity;

    for (const monster of monsters) {
        if (!monster.active || monster.dead) continue;
        // Aim at torso height — skinned mesh raycasts are unreliable.
        torsoPoint.copy(monster.container.position);
        torsoPoint.y += 1.1;
        toTarget.copy(torsoPoint).sub(camera.position);
        const dist = toTarget.length();
        if (dist > LASER_RANGE || dist < 0.4) continue;
        toTarget.multiplyScalar(1 / dist);
        if (facingDir.dot(toTarget) < 0.9) continue;

        // Blocked by map geometry?
        raycaster.set(camera.position, toTarget);
        raycaster.far = dist - 0.2;
        const wallHits = raycaster.intersectObjects(level.colliderList(), false);
        const blocked = wallHits.some((hit) => {
            if (!hit.face) return true;
            hitPoint.copy(hit.face.normal)
                .transformDirection(hit.object.matrixWorld)
                .normalize();
            return Math.abs(hitPoint.y) < 0.55;
        });
        if (blocked) continue;

        if (dist < bestDist) {
            bestDist = dist;
            best = monster;
            hitPoint.copy(torsoPoint);
        }
    }

    let end;
    if (best) {
        end = hitPoint;
        damageMonster(best, LASER_DAMAGE);
        audio.hit();
    } else {
        raycaster.setFromCamera(screenCentre, camera);
        raycaster.far = LASER_RANGE;
        const wallHits = raycaster.intersectObjects(level.colliderList(), false);
        if (wallHits.length) {
            end = wallHits[0].point;
        } else {
            end = hitPoint.copy(camera.position).addScaledVector(facingDir, LASER_RANGE);
        }
    }

    showLaserBeam(gun, muzzleWorld, end);
}

function damageMonster(monster, amount) {
    monster.health -= amount;
    // Brief flash toward red.
    monster.rig.root.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
            if (!mat.emissive) continue;
            mat.userData.prevEmissive = mat.emissiveIntensity;
            mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 0, 1.8);
        }
    });
    setTimeout(() => {
        monster.rig.root.traverse((child) => {
            if (!child.isMesh || !child.material) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const mat of mats) {
                if (mat.userData.prevEmissive !== undefined) {
                    mat.emissiveIntensity = mat.userData.prevEmissive;
                }
            }
        });
    }, 90);

    if (monster.health <= 0) killMonster(monster);
}

function killMonster(monster) {
    monster.dead = true;
    monster.active = false;
    monster.container.visible = false;
    flashPrompt(`${monster.profile.name} dropped.`);
    audio.scare();

    // Bring in the next hunter at a fresh distant spot.
    if (spawnNextMonster()) {
        setObjective('Objective: Survive — another one is hunting you');
        return;
    }

    if (monsters.every((m) => m.dead)) {
        setObjective('Objective: All clear — grab the key and leave');
    }
}

function toggleFlashlight() {
    if (!state.started || state.dead || state.complete) return;
    if (player.battery <= 0 && !player.flashlightOn) {
        audio.locked();
        return;
    }
    player.flashlightOn = !player.flashlightOn;
    lighting.setFlashlight(player.flashlightOn, player.battery / 100);
    audio.click();
}

function interact() {
    if (!isPlaying()) return;

    raycaster.setFromCamera(screenCentre, camera);
    raycaster.far = 3.2;
    const hits = raycaster.intersectObjects(level.interactables, true);

    if (hits.length > 0) {
        const data = hits[0].object.userData;

        if (data.type === 'key') {
            player.hasKey = true;
            level.group.remove(level.keyItem);
            if (level.keyGlow) level.keyGlow.visible = false;
            removeInteractable(level.keyItem);
            audio.pickup();
            setObjective('Objective: Unlock the exit door and get out');
            return;
        }

        if (data.type === 'battery') {
            const cell = hits[0].object;
            player.spareBatteries += 1;
            level.group.remove(cell);
            removeInteractable(cell);
            audio.pickup();
            updateUI();
            return;
        }

        if (data.type === 'mapDoor') {
            const door = data.door || hits[0].object.userData.door;
            if (door?.open) {
                flashPrompt('Door is already open.');
                return;
            }
            if (level.openDoor(door)) {
                audio.unlock();
                flashPrompt('Door opened.');
            }
            return;
        }

        if (data.type === 'exit') {
            if (player.hasKey) completeChapter();
            else {
                audio.locked();
                flashPrompt('The deadbolt is locked. You need the key.');
            }
            return;
        }
    }

    if (player.spareBatteries > 0 && player.battery < 60) {
        player.spareBatteries -= 1;
        player.battery = 100;
        lighting.setFlashlight(player.flashlightOn, 1);
        audio.click();
        flashPrompt('Battery replaced.');
        updateUI();
    }
}

function removeInteractable(object) {
    const index = level.interactables.indexOf(object);
    if (index >= 0) level.interactables.splice(index, 1);
}

let promptTimer = 0;
function flashPrompt(text) {
    ui['interact-prompt'].textContent = text;
    ui['interact-prompt'].style.opacity = '1';
    promptTimer = 2.4;
}

function setObjective(text) {
    ui['objective-text'].textContent = text;
}

function updatePlayer(dt) {
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;

    const wantsRun = input.run && player.stamina > 1 && (input.forward || input.back || input.left || input.right);
    const speed = wantsRun ? RUN_SPEED : WALK_SPEED;

    player.stamina = THREE.MathUtils.clamp(
        player.stamina + (wantsRun ? -22 : 13) * dt, 0, 100
    );

    const forwardAxis = Number(input.forward) - Number(input.back);
    const strafeAxis = Number(input.right) - Number(input.left);
    const moving = forwardAxis !== 0 || strafeAxis !== 0;

    if (moving) {
        const length = Math.hypot(forwardAxis, strafeAxis);
        const sinYaw = Math.sin(player.yaw);
        const cosYaw = Math.cos(player.yaw);
        const dx = (-sinYaw * forwardAxis + cosYaw * strafeAxis) / length * speed * dt;
        const dz = (-cosYaw * forwardAxis - sinYaw * strafeAxis) / length * speed * dt;
        level.resolveMovement(player.position, dx, dz, 0.34);

        player.bob += dt * (wantsRun ? 13 : 8.5);
        if (Math.sin(player.bob) > 0.985) audio.footstep();
    } else {
        player.bob += dt * 1.6;
    }

    // Keep feet on the mesh floor; unstick less often on mobile lite collision.
    if (moving) {
        level.snapToGround(player.position);
        const unstickMask = state.collisionLite ? 15 : 7;
        if ((state.frameCount & unstickMask) === 0) {
            level.freeIfStuck(player.position, 0.34);
        }
    } else if (!state.collisionLite && (state.frameCount & 15) === 0) {
        level.depenetrate(
            player.position,
            0.34,
            player.position.y - level.eyeHeight + 1.0
        );
    }

    const streamMask = state.collisionLite ? 3 : 1;
    if ((state.frameCount & streamMask) === 0) {
        level.updateStreaming(player.position.x, player.position.z);
    }

    const bobAmount = moving ? (wantsRun ? 0.055 : 0.032) : 0.008;
    camera.position.set(
        player.position.x,
        player.position.y + Math.sin(player.bob) * bobAmount,
        player.position.z
    );

    if (player.flashlightOn) {
        player.battery = Math.max(0, player.battery - BATTERY_DRAIN * dt);
        if (player.battery <= 0) {
            player.flashlightOn = false;
            lighting.setFlashlight(false, 0);
            flashPrompt('The flashlight dies.');
        } else {
            lighting.setFlashlight(true, player.battery / 100);
        }
    }

    player.hurtCooldown = Math.max(0, player.hurtCooldown - dt);
}

function updateMonsters(dt, elapsed) {
    if (!state.monstersReleased) return;

    const playerPos = player.position;

    for (const monster of monsters) {
        if (!monster.active || monster.dead || state.monstersHidden) {
            monster.container.visible = false;
            continue;
        }

        const pos = monster.container.position;
        const distance = Math.hypot(playerPos.x - pos.x, playerPos.z - pos.z);

        if (monster.frozen) {
            monster.rig.update(dt);
            monster.container.visible = true;
            continue;
        }

        // Always attack the player. Line-of-sight fails constantly in this office,
        // so requiring it left monsters stuck on dead patrol routes.
        monster.mode = 'chase';
        const speed = monster.profile.chase;
        const targetX = playerPos.x;
        const targetZ = playerPos.z;

        const beforeX = pos.x;
        const beforeZ = pos.z;
        steer(monster, targetX, targetZ, speed, dt);
        const moved = Math.hypot(pos.x - beforeX, pos.z - beforeZ);

        if (moved < speed * dt * 0.18) {
            monster.stuckTimer += dt;
            // Soft unstick toward the player when wedged on props / corners.
            if (monster.stuckTimer > 0.35) {
                level.unstickGround(pos, 0.3, targetX, targetZ);
                monster.sidestep *= -1;
            }
            // Hard hop if still jammed — prevents forever-stuck on desks/walls.
            if (monster.stuckTimer > 0.9) {
                level.hopToward(pos, targetX, targetZ, 0.3, 1.8 + Math.random());
                monster.stuckTimer = 0.2;
            }
        } else {
            monster.stuckTimer = Math.max(0, monster.stuckTimer - dt * 2.5);
            // Keep gently clearing shallow overlaps even while moving.
            if ((state.frameCount & 7) === 0) {
                level.depenetrate(pos, 0.3, pos.y + 1.0);
            }
        }

        const desiredYaw = Math.atan2(targetX - pos.x, targetZ - pos.z);
        let delta = desiredYaw - monster.container.rotation.y;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        monster.container.rotation.y += delta * Math.min(1, dt * 7);

        monster.phase += dt * speed * 3.4;
        const onScreen = distance < state.characterDraw;
        monster.container.visible = onScreen;
        if (onScreen) {
            monster.rig.update(dt);
            monster.rig.setLocomotion(monster.phase, 1.55);
        }

        if (distance < 10) {
            player.fear = Math.min(100, player.fear + 28 * dt);
            monster.growlTimer -= dt;
            if (monster.growlTimer <= 0) {
                audio.growl();
                monster.growlTimer = 3 + Math.random() * 4;
            }
        }

        if (distance < 1.5 && player.hurtCooldown <= 0) {
            player.health -= 24;
            player.fear = 100;
            player.hurtCooldown = 1.1;
            audio.scare();
            triggerDamageFlash();
            if (player.health <= 0) die(monster.profile.name);
        }
    }

    player.fear = Math.max(0, player.fear - 9 * dt);
}

function steer(monster, targetX, targetZ, speed, dt) {
    const pos = monster.container.position;
    const dx = targetX - pos.x;
    const dz = targetZ - pos.z;
    const distance = Math.hypot(dx, dz) || 1;
    const stepX = (dx / distance) * speed * dt;
    const stepZ = (dz / distance) * speed * dt;
    // Slimmer capsule so desks/door frames don't snag as easily.
    const radius = 0.28;
    const opts = {
        eyeHeight: 1.0,
        fromEye: false,
        floorsOnly: true,
        alwaysDepenetrate: true
    };

    const beforeX = pos.x;
    const beforeZ = pos.z;
    level.resolveMovement(pos, stepX, stepZ, radius, opts);

    // Wall-follow: try many angles so monsters slide around objects toward you.
    if (Math.hypot(pos.x - beforeX, pos.z - beforeZ) < speed * dt * 0.2) {
        const side = monster.sidestep || 1;
        const heading = Math.atan2(dx, dz);
        const angles = [0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, Math.PI * 0.5, -Math.PI * 0.5]
            .map((a) => a * side);
        for (const offset of angles) {
            const ang = heading + offset;
            const sx = Math.sin(ang) * speed * dt * 1.05;
            const sz = Math.cos(ang) * speed * dt * 1.05;
            const bx = pos.x;
            const bz = pos.z;
            level.resolveMovement(pos, sx, sz, radius, opts);
            if (Math.hypot(pos.x - bx, pos.z - bz) > 0.012) break;
        }
    }
}

function triggerDamageFlash() {
    ui['damage-flash'].style.opacity = '1';
    setTimeout(() => { ui['damage-flash'].style.opacity = '0'; }, 120);
}

function updateAtmosphere(dt) {
    state.heartTimer -= dt;
    const intensity = player.fear / 100;
    if (state.heartTimer <= 0 && intensity > 0.12) {
        audio.heartbeat(0.4 + intensity);
        state.heartTimer = 1.15 - intensity * 0.65;
    }
    ui['heartbeat-overlay'].style.opacity = String(intensity * 0.85);

    if (promptTimer > 0) {
        promptTimer -= dt;
        if (promptTimer <= 0) ui['interact-prompt'].style.opacity = '0';
    }
}

function updateInteractPrompt() {
    if (promptTimer > 0) return;
    raycaster.setFromCamera(screenCentre, camera);
    raycaster.far = 3.2;
    const hits = raycaster.intersectObjects(level.interactables, true);
    if (hits.length > 0) {
        const type = hits[0].object.userData.type;
        const keyHint = state.isMobile ? '[USE]' : '[E]';
        const label = type === 'key' ? `Take the office key  ${keyHint}`
            : type === 'battery' ? `Take battery  ${keyHint}`
                : type === 'mapDoor' ? (hits[0].object.userData.door?.open ? 'Door open' : `Open door  ${keyHint}`)
                    : player.hasKey ? `Unlock the door  ${keyHint}` : `Locked  ${keyHint}`;
        ui['interact-prompt'].textContent = label;
        ui['interact-prompt'].style.opacity = '1';
    } else {
        ui['interact-prompt'].style.opacity = '0';
    }
}

function updateUI() {
    ui['health-fill'].style.width = `${Math.max(0, player.health)}%`;
    ui['battery-fill'].style.width = `${player.battery}%`;
    ui['stamina-fill'].style.width = `${player.stamina}%`;
    ui['battery-count'].textContent = `x${player.spareBatteries}`;
}

function die(cause) {
    state.dead = true;
    audio.pauseMusic();
    touchControls?.hide();
    releasePerformanceMode(perfHandles);
    perfHandles = null;
    document.exitPointerLock?.();
    document.getElementById('death-cause').textContent = cause + ' found you.';
    ui['death-screen'].style.display = 'flex';
}

function completeChapter() {
    state.complete = true;
    audio.pauseMusic();
    audio.unlock();
    touchControls?.hide();
    releasePerformanceMode(perfHandles);
    perfHandles = null;
    document.exitPointerLock?.();
    setTimeout(() => { ui['chapter-end'].style.display = 'flex'; }, 900);
}

function frame() {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    const elapsed = timer.getElapsed();
    state.elapsed = elapsed;
    state.frameCount += 1;

    if (isPlaying()) {
        state.playTime += dt;
        if (!state.monstersReleased && state.playTime >= MONSTER_REVEAL_DELAY) {
            releaseMonsters();
        }
        touchControls?.tick(dt);
        updatePlayer(dt);
        // Throttle monster AI by graphics preset (low = every 3rd frame).
        const aiEvery = Math.max(1, state.monsterAiEvery | 0);
        if (state.frameCount % aiEvery === 0) updateMonsters(dt * aiEvery, elapsed);
        if ((state.frameCount & 3) === 0) updateInteractPrompt();
        updateAtmosphere(dt);
        if ((state.frameCount & 3) === 0) updateUI();
    } else if (level && (state.frameCount & 7) === 0) {
        level.updateStreaming(player.position.x, player.position.z);
    }

    if (gun) updateGun(gun, dt);

    if (level?.keyItem?.parent && !player.hasKey) {
        const dx = level.keyItem.position.x - player.position.x;
        const dz = level.keyItem.position.z - player.position.z;
        const near = (dx * dx + dz * dz) < 225;
        level.keyItem.visible = near;
        if (level.keyGlow) level.keyGlow.visible = near;
        if (near && (state.frameCount & 1) === 0) {
            level.keyItem.rotation.y = elapsed * 1.2;
            level.keyItem.position.y = level.keyItem.userData.baseY + Math.sin(elapsed * 2) * 0.03;
            if (level.keyGlow) level.keyGlow.position.y = level.keyItem.position.y;
        }
    }

    renderer.render(scene, camera);

    if (state.perfEnabled) {
        state.perfFrames += 1;
        const now = performance.now();
        if (now - state.perfLast >= 500) {
            state.perfFps = Math.round((state.perfFrames * 1000) / (now - state.perfLast));
            state.perfFrames = 0;
            state.perfLast = now;
            ui['perf-hud'].textContent =
                `FPS ${state.perfFps}\n` +
                `draw ${renderer.info.render.calls}\n` +
                `tris ${renderer.info.render.triangles}\n` +
                `geoms ${renderer.info.memory.geometries}`;
        }
    }
}

window.addEventListener('load', () => {
    init().then(() => {
        setObjective('Objective: Explore the office — hunters arrive in 30 seconds');
    });
});
