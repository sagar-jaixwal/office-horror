# The Last Shift — Full Game Documentation

Horror first-person game set in Randolph’s office. Players explore, manage a flashlight battery, open doors, find a key, and survive wave-spawned monsters while armed with a laser / Nerf viewmodel.

---

## 1. High-level overview

| Item | Detail |
|------|--------|
| **Game title** | The Last Shift |
| **Genre** | Horror FPS / survival exploration |
| **Platform** | Web browser (desktop + mobile) |
| **Architecture** | 100% **client-side** — host only serves files; WebGL runs on the visitor’s CPU/GPU |
| **Engine** | **Three.js** (not Unity / Godot / Unreal) |
| **Bundler / dev server** | **Vite** |
| **Language** | JavaScript (ES modules) |

There is **no game server**. Port-share / Wi‑Fi hosting only downloads assets to the player’s device.

---

## 2. Technology stack

### Runtime (player’s browser)

| Technology | Version / role |
|------------|----------------|
| **Three.js** | `^0.185.1` — 3D scene, camera, meshes, lights, fog, raycasting, animation mixers |
| **WebGL / WebGL2** | GPU rendering via Three.js `WebGLRenderer` |
| **GLTFLoader** | Loads `.glb` models |
| **DRACOLoader** | Decodes Draco-compressed meshes (`public/draco/gltf/`) |
| **SkeletonUtils.clone** | Clones skinned monsters with independent skeletons |
| **BufferGeometryUtils** | Merges same-material static meshes (fewer draw calls) |
| **HTMLAudioElement** | Laser SFX, monster SFX, looping BGM |
| **Web Audio API** | Procedural fallback SFX (footsteps, UI clicks, heartbeat) |
| **Service Worker** | `public/sw.js` — caches models/audio/draco after first visit |
| **Wake Lock API** | Keeps screen awake while playing (when allowed) |
| **Fullscreen + Screen Orientation** | Mobile landscape play |
| **Pointer Lock API** | Desktop mouse look |
| **Touch events** | Mobile virtual joystick + look pad + action buttons |
| **localStorage** | Saves graphics quality preset |

### Build / tooling (developer machine)

| Tool | Role |
|------|------|
| **Vite** `^8.2.0` | Dev server, HMR, production build to `dist/` |
| **gltf-transform** (`@gltf-transform/cli`) | Convert / simplify / resize / Draco-compress models |
| **Puppeteer** (`puppeteer-core`) | Smoke tests (`npm run smoke`) |
| **Node.js** | Scripts under `scripts/` |

### What is *not* used

- No React / React Three Fiber  
- No Babylon.js  
- No Unity / Godot / Unreal  
- No backend, database, or multiplayer server  
- No physics engine (custom raycast collision instead)

---

## 3. Project structure

```
office-horror/
├── index.html              # UI, HUD, start/pause/death screens, touch controls, CSS
├── game.js                 # Main loop, player, combat, monsters, input wiring
├── vite.config.js          # Vite host/build config
├── package.json
├── GAME_DOCUMENTATION.md   # This file
├── README.md
├── public/
│   ├── models/             # Runtime GLBs
│   ├── music/              # MP3 SFX + BGM
│   ├── draco/              # Draco WASM decoders
│   └── sw.js               # Service worker (runtime cache)
├── src/
│   ├── level.js            # Map, collision, doors, streaming, spawn
│   ├── models.js           # GLB load / normalize / instantiate
│   ├── characters.js       # Monster rigs (GLB crawler + procedural fallback)
│   ├── gun.js              # FPS viewmodel + laser beam
│   ├── lighting.js         # Renderer setup, fog, flashlight
│   ├── audio.js            # Music + SFX
│   ├── graphics.js         # Low/Medium/High/Ultra presets
│   ├── hardware.js         # GPU/CPU detection, wake lock, fullscreen
│   ├── touchControls.js    # Mobile on-screen controls
│   ├── clientRuntime.js    # Asset download helpers, SW register
│   ├── merge.js            # Mesh merge by material
│   ├── materials.js        # Procedural canvas textures (fallback surfaces)
│   └── floorplan.js        # Legacy floorplan helpers (mostly unused after map GLB)
├── assets-src/             # Original Sketchfab downloads (source for prepare-models)
└── scripts/
    ├── prepare-models.mjs  # Optimize GLBs → public/models
    ├── inspect-glb.mjs     # Print GLB stats
    └── smoke.mjs           # Automated browser smoke test
```

---

## 4. 3D assets (models)

| Asset | Path | Use in game |
|-------|------|-------------|
| **Heilwald office** | `public/models/the_heilwald_loophole_randolphs_office.glb` | Main level / building |
| **Garden crawler** | `public/models/garden_crawler.glb` | Monster (skinned + Idle clip) |
| **Nerf gun** | `public/models/nerf_gun.glb` | FPS viewmodel |
| **Office worker** | `public/models/office_worker.glb` | Present on disk; not used in current gameplay loop |

### Model pipeline

1. Sources live in `assets-src/`  
2. `npm run models` runs **gltf-transform**: metalrough → simplify → resize textures → **Draco**  
3. Output written to `public/models/`  
4. Runtime load via `GLTFLoader` + `DRACOLoader`

Crawler is heavily simplified for mobile (~23k tris). Gun and building are also Draco-compressed.

---

## 5. Audio assets

| File | Path | Trigger |
|------|------|---------|
| Laser shot | `public/music/gun/media_man_uk-lazer-gun-432285.mp3` | Shoot |
| Monster | `public/music/sound/moster_sound.mp3` | Growl / scare / reveal |
| BGM | `public/music/background music/Resident Evil 4 OST - Garrador [X70DwhWz0Lw].mp3` | Loops after Enter |

Procedural Web Audio covers footsteps, UI clicks, pickup, heartbeat when MP3s aren’t used.

---

## 6. Core gameplay systems

### Player

- First-person camera (`PerspectiveCamera`, YXZ rotation)  
- Move: WASD / arrows / touch stick  
- Look: mouse (pointer lock) / touch drag on right side  
- Sprint + stamina  
- Health + fear (heartbeat overlay)  
- Flashlight + battery drain / pickup batteries  
- Interact: doors, key, exit (`E` or **USE**)  
- Laser gun: left/right click, Space, or **FIRE**

### Level (`src/level.js`)

- Loads Heilwald GLB as the map  
- Scales by door height to human scale  
- **Distance streaming**: hide far chunks  
- **Raycast collision**: walls/floors via mesh probes  
- Doors: open with E (visual fade/swing; door meshes don’t block)  
- Spawn from green checkpoint / walkable sampling  
- Key, exit door marker, scatter batteries  
- Monster helpers: `unstickGround`, `hopToward` if jammed on props  

### Monsters (`src/characters.js` + `game.js`)

- Up to **3** hunters (Acid Mouth → Stalker → Ceiling Crawler)  
- Appear after **~30 seconds**  
- Next monster spawns when the previous is killed  
- Always **chase** the player (no LOS requirement)  
- Wall-slide + unstick + hop so they don’t stay stuck on furniture  
- Damage on contact; laser kills in a few hits  

### Gun (`src/gun.js`)

- Nerf GLB parented to camera (procedural pistol fallback)  
- Recoil, muzzle flash, cyan laser beam  
- Aim-cone hit vs monster torso  

### Lighting (`src/lighting.js`)

- Unlit / MeshBasic-friendly office materials for performance  
- Ambient + hemisphere + fill point light  
- Flashlight = camera PointLight  
- Exponential fog (`FogExp2`)  

### Graphics quality (`src/graphics.js`)

| Preset | Intent |
|--------|--------|
| **Low** | Weak devices / ThinkPad integrated GPU |
| **Medium** | Balanced |
| **High** | Strong GPU, AA, longer draw distance |
| **Ultra** | Max DPI (up to device pixel ratio), farthest view |

Saved in `localStorage` key `last-shift-graphics`.

### Hardware detection (`src/hardware.js`)

- Reads GPU string, CPU cores, device memory, DPR  
- Suggests quality tier automatically  
- Wake lock + fullscreen/landscape on play  

### Mobile (`src/touchControls.js` + `index.html`)

- Landscape gate (“Rotate your phone”)  
- Left: move stick  
- Right: look pad  
- Buttons: Fire, Use, Light, Run, Pause  
- Responsive HUD  

---

## 7. Controls

### Desktop

| Input | Action |
|-------|--------|
| W A S D / Arrows | Move |
| Mouse | Look (pointer lock) |
| Shift | Sprint |
| Left / Right click / Space | Shoot |
| F | Flashlight |
| E | Interact / open door |
| H | Hide / show monsters |
| G | Cycle graphics |
| Esc | Pause (release pointer) |

### Mobile

| Control | Action |
|---------|--------|
| Left stick | Move (outer ring sprints) |
| Drag right side | Look |
| Fire | Shoot (hold to repeat) |
| Use | Interact |
| Light | Flashlight |
| Run | Hold sprint |
| Pause | Pause menu |

---

## 8. Objectives / win & lose

1. Explore the office after Enter  
2. After 30s, monsters begin hunting  
3. Find the **office key**  
4. Reach the **exit** and unlock it  
5. **Death**: monster contact drains health to 0  
6. **Win**: chapter-end screen after escaping  

---

## 9. How rendering & performance work

1. Vite serves HTML/JS/GLB/MP3  
2. Browser downloads + (optionally) caches via service worker  
3. Three.js builds a scene graph and runs `renderer.setAnimationLoop(frame)`  
4. Each frame: input → movement/collision → monster AI → gun → `renderer.render`  
5. Quality preset changes pixel ratio, fog, draw distance, AI throttle, gun visibility  

**Important:** A “strong phone” still runs this through **browser WebGL**, which is heavier than a native Unity/Unreal build of the same scene.

---

## 10. Scripts & commands

```bash
npm install          # Install dependencies
npm run dev          # Start Vite (default port from config / CLI)
npm run build        # Production bundle → dist/
npm run preview      # Preview production build
npm run models       # Optimize assets-src → public/models
npm run smoke        # Puppeteer smoke test
```

Useful URL flags:

| Flag | Effect |
|------|--------|
| `?perf=1` | On-screen FPS / draw calls / triangles |
| `?lowspec=1` | Used by smoke tests (if wired) |

Debug (dev only): `window.__debug` — teleport, pose monsters, stats, set quality.

---

## 11. Networking / sharing

| Role | Machine |
|------|---------|
| File server (`npm run dev` / port-share) | Your ThinkPad / host |
| Download assets | Visitor’s browser |
| Run game logic + WebGL | **Visitor’s CPU/GPU** |

Sharing a link does **not** run the game on the host GPU.

---

## 12. UI screens (`index.html`)

- Start screen (story, controls, graphics picker)  
- Pause screen  
- Death screen  
- Chapter complete  
- HUD: vitals, breath, torch, objective, crosshair  
- Touch overlay + rotate-to-landscape overlay  
- Client-runtime note (runs on your device)  

---

## 13. Third-party / content notes

- Map / character GLBs originated from **Sketchfab**-style exports (processed with gltf-transform)  
- Background track: **Resident Evil 4 OST — Garrador** (ensure you have rights if you distribute publicly)  
- Laser SFX: `media_man_uk-lazer-gun-432285`  

---

## 14. Quick architecture diagram

```
┌─────────────────┐     HTTP files      ┌──────────────────────────┐
│  Host (Vite)    │ ──────────────────► │  Visitor browser         │
│  ThinkPad / PC  │   GLB, MP3, JS      │                          │
└─────────────────┘                     │  Three.js WebGL scene    │
                                        │  Player + Level + AI     │
                                        │  Audio + Touch/Mouse     │
                                        │  → THEIR CPU / GPU       │
                                        └──────────────────────────┘
```

---

## 15. Module responsibility cheat-sheet

| File | Responsibility |
|------|----------------|
| `game.js` | Game loop, state, combat, monster waves, wiring |
| `level.js` | Map, collision, doors, streaming, spawn/loot |
| `characters.js` | Monster mesh/rig construction |
| `models.js` | Asset loading & normalization |
| `gun.js` | Viewmodel + laser VFX |
| `audio.js` | Music & sound effects |
| `lighting.js` | Lights, fog, renderer flags |
| `graphics.js` | Quality presets & viewport fit |
| `hardware.js` | Device tier detection & performance mode |
| `touchControls.js` | Mobile controls |
| `clientRuntime.js` | Prefetch / SW registration |
| `merge.js` | Draw-call reduction via geometry merge |
| `sw.js` | Offline/runtime asset cache |

---

*Generated for the office-horror / The Last Shift codebase. Update this file when adding major systems or assets.*
