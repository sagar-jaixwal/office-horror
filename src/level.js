import * as THREE from 'three';
import { hasModel, instantiate, assets } from './models.js';

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _up = new THREE.Vector3(0, 1, 0);

// Heilwald building GLB with mesh collision. Player height is always snapped to
// the floor underfoot — the old fixed y=1.68 left you floating in the attic.
export class Level {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.colliders = [];
        this.sightBlockers = [];
        this.interactables = [];
        this.collisionMeshes = [];
        this.floorMeshes = [];
        this.renderChunks = [];
        this.activeColliders = [];
        this.activeFloors = [];
        this.renderDistance = 12;
        // Keep structural walls in the collider set even when far visually.
        this.collisionDistance = 16;
        this._streamX = Infinity;
        this._streamZ = Infinity;
        this._lastFloor = null;
        this._normal = new THREE.Vector3();
        this.keyItem = null;
        this.keyGlow = null;
        this.exitDoor = null;
        this.doors = [];
        this.spawn = { x: 0, y: 0, z: 0, heading: 0 };
        this.patrolLoop = [];
        this.ceilingHeight = 2.8;
        this.eyeHeight = 1.68;
        this.bounds = new THREE.Box3();
        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = 80;
        scene.add(this.group);
    }

    build() {
        if (!hasModel('building')) {
            console.warn('[level] building GLB missing — empty level');
            return this;
        }

        const { root } = instantiate('building');
        this.root = root;
        this.group.add(root);

        root.updateMatrixWorld(true);
        this.bounds.setFromObject(root);
        const size = this.bounds.getSize(new THREE.Vector3());
        this.ceilingHeight = Math.min(3.2, Math.max(2.4, size.y * 0.18));

        root.traverse((child) => {
            if (!child.isMesh) return;
            if (!child.geometry.boundingSphere) child.geometry.computeBoundingSphere();

            child.castShadow = false;
            child.receiveShadow = false;
            child.frustumCulled = true;
            child.matrixAutoUpdate = false;
            child.updateMatrix();

            const name = materialName(child);
            const isFloor = /carpet|floor|tile|dirt|concrete_floor/i.test(name);
            const isDoor = /door/i.test(name);
            const isGlass = /glass/i.test(name);
            // Paintings, papers, plants etc. cost draw-calls for no gameplay.
            const isDecor = /painting|document|plant|cardboard|cork|trash|leather|cloth|drawer|locker|checkpoint|interface|green_checkpoint/i.test(name);

            // Downgrade PBR → unlit. Biggest frame-time win on this map.
            child.material = cheapifyMaterials(child.material);

            if (isDecor || isGlass) {
                child.visible = false;
                return;
            }

            const box = new THREE.Box3().setFromObject(child);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const radius = Math.max(size.x, size.z) * 0.5;
            const alwaysVisible = isFloor && radius > 8;

            this.renderChunks.push({
                mesh: child,
                x: center.x,
                z: center.z,
                radius,
                alwaysVisible,
                collides: !isDoor,
                isFloor
            });

            if (isFloor) this.floorMeshes.push(child);

            if (isDoor) {
                const door = {
                    mesh: child,
                    open: false,
                    baseOpacity: Array.isArray(child.material)
                        ? (child.material[0]?.opacity ?? 1)
                        : (child.material?.opacity ?? 1)
                };
                child.userData = { type: 'mapDoor', door, interactable: true };
                this.doors.push(door);
                this.interactables.push(child);
                return;
            }

            // Double-sided so raycasts still hit after grazing into a thin wall.
            for (const mat of Array.isArray(child.material) ? child.material : [child.material]) {
                if (mat) mat.side = THREE.DoubleSide;
            }

            this.collisionMeshes.push(child);
        });

        // Prefer dedicated floor meshes for ground snaps; fall back to everything.
        if (this.floorMeshes.length === 0) this.floorMeshes = this.collisionMeshes;

        this.pickSpawn();
        this.buildPatrol();
        this.placeExitMarker();
        this.scatterBatteries();
        this.updateStreaming(this.spawn.x, this.spawn.z, true);
        return this;
    }

    // Show only map pieces near the player. Far chunks stay off the GPU.
    updateStreaming(px, pz, force = false) {
        const moved = Math.hypot(px - this._streamX, pz - this._streamZ);
        if (!force && moved < 1.5) return;

        this._streamX = px;
        this._streamZ = pz;
        this.activeColliders.length = 0;
        this.activeFloors.length = 0;

        const renderLimit = this.renderDistance;
        const collideLimit = this.collisionDistance;

        for (const chunk of this.renderChunks) {
            const reach = Math.hypot(chunk.x - px, chunk.z - pz) - chunk.radius;
            const show = chunk.alwaysVisible || reach < renderLimit;
            chunk.mesh.visible = show;

            if (!chunk.collides) continue;
            // Collision stays active even if the mesh is culled from rendering,
            // otherwise nearby walls drop out and the player walks through them.
            const collide = reach < collideLimit || chunk.isFloor || chunk.radius > 10;
            if (collide) {
                this.activeColliders.push(chunk.mesh);
                if (chunk.isFloor) this.activeFloors.push(chunk.mesh);
            }
        }

        if (this.activeFloors.length === 0) {
            this.activeFloors = this.floorMeshes.filter((m) => m.visible);
        }
        if (this.activeColliders.length === 0) {
            this.activeColliders = this.collisionMeshes.filter((m) => m.visible);
        }
    }

    colliderList() {
        return this.activeColliders.length ? this.activeColliders : this.collisionMeshes;
    }

    floorList() {
        return this.activeFloors.length ? this.activeFloors : this.floorMeshes;
    }

    openDoor(door) {
        if (!door || door.open) return false;
        door.open = true;

        const apply = (material) => {
            const copy = material.clone();
            copy.transparent = true;
            copy.depthWrite = false;
            copy.opacity = 0.2;
            return copy;
        };
        door.mesh.material = Array.isArray(door.mesh.material)
            ? door.mesh.material.map(apply)
            : apply(door.mesh.material);

        door.mesh.rotation.y += Math.PI * 0.5;
        door.mesh.position.y += 0.02;
        door.mesh.matrixAutoUpdate = true;
        door.mesh.updateMatrixWorld(true);
        return true;
    }

    // True only when the capsule is clearly inside geometry (not merely near a wall).
    isEmbedded(x, z, radius = 0.34, height = null) {
        const h = height ?? ((this._lastFloor ?? this.spawn.y) + 1.0);
        // Tight radius: standing against a wall should NOT count as stuck.
        if (!this.isBlocked(x, z, radius * 0.45, h)) return false;
        let hits = 0;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dz] of dirs) {
            const hit = this.probe(x, z, dx, dz, radius * 0.55, h);
            if (hit && hit.distance < radius * 0.45) hits += 1;
        }
        return hits >= 2;
    }

    // If the player is embedded in geometry, push them to open space.
    freeIfStuck(position, radius = 0.34) {
        const height = (this._lastFloor ?? this.spawn.y) + 1.0;
        if (!this.isEmbedded(position.x, position.z, radius, height)) {
            // Soft push out of shallow overlaps without teleporting.
            return this.depenetrate(position, radius, height);
        }

        for (let step = 0; step < 24; step++) {
            const ang = (step / 24) * Math.PI * 2;
            for (const dist of [0.35, 0.7, 1.2, 2.0, 3.2]) {
                const nx = position.x + Math.sin(ang) * dist;
                const nz = position.z + Math.cos(ang) * dist;
                if (this.isBlocked(nx, nz, radius, height)) continue;
                const floor = this.groundAt(nx, nz, position.y + 1.5);
                if (floor === null) continue;
                position.x = nx;
                position.z = nz;
                position.y = floor + this.eyeHeight;
                return true;
            }
        }
        return false;
    }

    // Nudge out of shallow wall overlaps along probe normals.
    depenetrate(position, radius, height) {
        let pushX = 0;
        let pushZ = 0;
        let any = false;
        const dirs = 8;
        for (let i = 0; i < dirs; i++) {
            const ang = (i / dirs) * Math.PI * 2;
            const dx = Math.sin(ang);
            const dz = Math.cos(ang);
            const hit = this.probe(position.x, position.z, dx, dz, radius + 0.04, height);
            if (!hit || hit.distance >= radius) continue;
            const push = (radius - hit.distance) + 0.02;
            pushX -= dx * push;
            pushZ -= dz * push;
            any = true;
        }
        if (!any) return false;
        position.x += pushX;
        position.z += pushZ;
        return true;
    }

    // Downward cast. Returns the highest walkable hit below `fromY`, or null.
    groundAt(x, z, fromY = null) {
        const top = fromY ?? ((this._lastFloor ?? this.spawn.y) + 3.5);
        _origin.set(x, top, z);
        this.raycaster.set(_origin, _down);
        this.raycaster.far = 8;

        const hits = this.raycaster.intersectObjects(this.floorList(), false);
        for (const hit of hits) {
            if (hit.face) {
                const normal = hit.face.normal.clone()
                    .transformDirection(hit.object.matrixWorld)
                    .normalize();
                if (normal.y < 0.45) continue;
            }
            this._lastFloor = hit.point.y;
            return hit.point.y;
        }

        const all = this.raycaster.intersectObjects(this.colliderList(), false);
        for (const hit of all) {
            if (hit.face) {
                const normal = hit.face.normal.clone()
                    .transformDirection(hit.object.matrixWorld)
                    .normalize();
                if (normal.y < 0.45) continue;
            }
            this._lastFloor = hit.point.y;
            return hit.point.y;
        }
        return null;
    }

    // Standing room: floor underfoot and clear space at chest height.
    isWalkable(x, z, radius = 0.4) {
        const floor = this.groundAt(x, z);
        if (floor === null) return false;
        // Need headroom — reject attic crawlspaces and wedged spots.
        const ceiling = this.ceilingAt(x, z, floor + 0.2);
        if (ceiling !== null && ceiling - floor < 1.6) return false;
        if (this.isBlocked(x, z, radius, floor + 1.0)) return false;
        return true;
    }

    ceilingAt(x, z, fromY) {
        _origin.set(x, fromY, z);
        this.raycaster.set(_origin, _up);
        this.raycaster.far = 6;
        const hits = this.raycaster.intersectObjects(this.colliderList(), false);
        for (const hit of hits) {
            if (hit.face) {
                const normal = hit.face.normal.clone()
                    .transformDirection(hit.object.matrixWorld)
                    .normalize();
                // Ceiling faces down.
                if (normal.y > -0.35) continue;
            }
            return hit.point.y;
        }
        return null;
    }

    pickSpawn() {
        const centre = this.bounds.getCenter(new THREE.Vector3());
        const size = this.bounds.getSize(new THREE.Vector3());
        const candidates = [];

        // Checkpoint first, then a grid across the map interior.
        let checkpoint = null;
        this.root.traverse((child) => {
            if (checkpoint || !child.isMesh) return;
            if (/checkpoint|green/i.test(materialName(child))) checkpoint = child;
        });
        if (checkpoint) {
            const box = new THREE.Box3().setFromObject(checkpoint);
            const c = box.getCenter(new THREE.Vector3());
            candidates.push({ x: c.x, z: c.z, prefer: 2 });
            for (let a = 0; a < 8; a++) {
                const ang = (a / 8) * Math.PI * 2;
                candidates.push({
                    x: c.x + Math.sin(ang) * 1.8,
                    z: c.z + Math.cos(ang) * 1.8,
                    prefer: 3
                });
            }
        }

        const stepX = Math.max(2.5, size.x / 10);
        const stepZ = Math.max(2.5, size.z / 12);
        for (let x = this.bounds.min.x + 3; x < this.bounds.max.x - 3; x += stepX) {
            for (let z = this.bounds.min.z + 3; z < this.bounds.max.z - 3; z += stepZ) {
                const dist = Math.hypot(x - centre.x, z - centre.z);
                candidates.push({ x, z, prefer: dist < size.z * 0.15 ? 1 : 0 });
            }
        }

        let best = null;
        for (const spot of candidates) {
            if (!this.isWalkable(spot.x, spot.z, 0.45)) continue;
            const floor = this.groundAt(spot.x, spot.z);
            const ceiling = this.ceilingAt(spot.x, spot.z, floor + 0.15);
            const headroom = ceiling === null ? 3 : ceiling - floor;
            // Main floor rooms beat crawlspaces and basements.
            const score = spot.prefer * 10 + headroom * 2 + floor;
            if (!best || score > best.score) {
                best = { x: spot.x, y: floor, z: spot.z, score, headroom };
            }
        }

        if (best) {
            this.spawn = { x: best.x, y: best.y, z: best.z, heading: Math.PI };
            this.ceilingHeight = Math.min(3.4, Math.max(2.2, best.headroom * 0.92));
        } else {
            const floor = this.groundAt(centre.x, centre.z) ?? 0;
            this.spawn = { x: centre.x, y: floor, z: centre.z, heading: 0 };
        }
    }

    buildPatrol() {
        const points = [];
        const size = this.bounds.getSize(new THREE.Vector3());
        const centre = this.bounds.getCenter(new THREE.Vector3());
        const ring = [
            [this.spawn.x + 4, this.spawn.z],
            [this.spawn.x, this.spawn.z - 4],
            [this.spawn.x - 4, this.spawn.z],
            [this.spawn.x, this.spawn.z + 4],
            [centre.x + Math.min(6, size.x * 0.15), centre.z],
            [centre.x, centre.z - Math.min(6, size.z * 0.12)]
        ];
        for (const [x, z] of ring) {
            if (!this.isWalkable(x, z, 0.4)) continue;
            const y = this.groundAt(x, z) ?? this.spawn.y;
            points.push({ x, y, z });
        }
        if (points.length === 0) {
            points.push({ x: this.spawn.x + 2, y: this.spawn.y, z: this.spawn.z });
        }
        this.patrolLoop = points;
    }

    placeExitMarker() {
        const spot = this.findClearSpot(this.spawn.x, this.spawn.z, 8, 18)
            || { x: this.spawn.x + 6, z: this.spawn.z - 6, y: this.spawn.y };
        const keySpot = this.findClearSpot(this.spawn.x, this.spawn.z, 3, 10)
            || { x: this.spawn.x + 2, z: this.spawn.z - 3, y: this.spawn.y };

        const door = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 2.2, 0.12),
            new THREE.MeshStandardMaterial({
                color: 0x3a2a22,
                emissive: 0x5a1208,
                emissiveIntensity: 0.55,
                roughness: 0.7
            })
        );
        door.position.set(spot.x, spot.y + 1.1, spot.z);
        door.userData = { type: 'exit', interactable: true };
        this.group.add(door);
        this.interactables.push(door);
        this.exitDoor = door;

        const key = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.02, 0.22),
            new THREE.MeshStandardMaterial({
                color: 0xc9a227,
                metalness: 0.85,
                roughness: 0.35,
                emissive: 0x6a4a10,
                emissiveIntensity: 0.8
            })
        );
        key.position.set(keySpot.x, keySpot.y + 0.95, keySpot.z);
        key.userData = { type: 'key', interactable: true, baseY: keySpot.y + 0.95 };
        this.group.add(key);
        this.interactables.push(key);
        this.keyItem = key;

        const glow = new THREE.PointLight(0xffc45a, 4, 3.5, 2);
        glow.position.copy(key.position);
        this.group.add(glow);
        this.keyGlow = glow;
    }

    findClearSpot(nearX, nearZ, minDist, maxDist) {
        for (let i = 0; i < 48; i++) {
            const ang = (i / 48) * Math.PI * 2;
            const dist = minDist + (i % 5) * ((maxDist - minDist) / 5);
            const x = nearX + Math.sin(ang) * dist;
            const z = nearZ + Math.cos(ang) * dist;
            if (!this.isWalkable(x, z, 0.4)) continue;
            return { x, z, y: this.groundAt(x, z) };
        }
        return null;
    }

    scatterBatteries() {
        const geometry = new THREE.CylinderGeometry(0.035, 0.035, 0.11, 10);
        const material = new THREE.MeshStandardMaterial({
            color: 0x1c2a1a, emissive: 0x2f7a24, emissiveIntensity: 1.1, roughness: 0.4, metalness: 0.5
        });
        const offsets = [[2.2, 1.4], [-2.5, 2.0], [3.5, -2.2], [-1.5, -3.0]];
        for (const [ox, oz] of offsets) {
            const x = this.spawn.x + ox;
            const z = this.spawn.z + oz;
            if (!this.isWalkable(x, z, 0.3)) continue;
            const y = this.groundAt(x, z) ?? this.spawn.y;
            const cell = new THREE.Mesh(geometry, material);
            cell.rotation.z = Math.PI / 2;
            cell.position.set(x, y + 0.09, z);
            cell.userData = { type: 'battery', interactable: true };
            this.group.add(cell);
            this.interactables.push(cell);
        }
    }

    // Horizontal wall probe. Ignores floor/ceiling hits so walking works.
    probe(x, z, dx, dz, distance, height) {
        const colliders = this.colliderList();
        if (colliders.length === 0) return null;
        _origin.set(x, height, z);
        _dir.set(dx, 0, dz);
        if (_dir.lengthSq() < 1e-8) return null;
        _dir.normalize();
        this.raycaster.set(_origin, _dir);
        this.raycaster.far = distance;
        const hits = this.raycaster.intersectObjects(colliders, false);
        for (const hit of hits) {
            if (hit.face) {
                this._normal.copy(hit.face.normal)
                    .transformDirection(hit.object.matrixWorld)
                    .normalize();
                if (Math.abs(this._normal.y) > 0.55) continue;
            }
            return hit;
        }
        return null;
    }

    isBlocked(x, z, radius = 0.34, height = null) {
        const h = height ?? ((this._lastFloor ?? this.spawn.y) + 1.0);
        // 8 directions catch diagonal walls / corners the 4-cardinal test missed.
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            const hit = this.probe(x, z, Math.sin(ang), Math.cos(ang), radius + 0.08, h);
            if (hit && hit.distance < radius) return true;
        }
        // Second height stops stepping under/over thin wall slabs.
        const h2 = h - 0.45;
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            const hit = this.probe(x, z, Math.sin(ang), Math.cos(ang), radius + 0.08, h2);
            if (hit && hit.distance < radius) return true;
        }
        return false;
    }

    resolveMovement(position, dx, dz, radius = 0.34, options = {}) {
        const eyeHeight = options.eyeHeight ?? this.eyeHeight;
        // When false, `position.y` is the floor (monsters); otherwise eye height (player).
        const fromEye = options.fromEye !== false;
        const total = Math.hypot(dx, dz);
        if (total < 1e-6) return;

        // Sub-step so a fast frame cannot tunnel through thin wallpaper planes.
        const maxStep = Math.max(0.08, radius * 0.7);
        const steps = Math.max(1, Math.ceil(total / maxStep));
        const sx = dx / steps;
        const sz = dz / steps;
        for (let i = 0; i < steps; i++) {
            this._resolveMovementStep(position, sx, sz, radius, eyeHeight, fromEye);
        }
        this.depenetrate(
            position,
            radius,
            (fromEye ? position.y - eyeHeight : position.y) + 1.0
        );
        if (fromEye) this.snapToGround(position);
        else {
            const floor = this.groundAt(position.x, position.z, position.y + 2);
            if (floor !== null) position.y = floor;
        }
    }

    _resolveMovementStep(position, dx, dz, radius, eyeHeight, fromEye) {
        const eye = fromEye ? position.y : position.y + eyeHeight;
        const floorGuess = fromEye ? eye - eyeHeight : position.y;
        const height = floorGuess + 1.0;

        const tryMove = (mx, mz) => {
            const dist = Math.hypot(mx, mz);
            if (dist < 1e-6) return false;

            const hit = this.probe(position.x, position.z, mx, mz, dist + radius + 0.05, height);
            let moveX = mx;
            let moveZ = mz;
            if (hit) {
                const allowed = hit.distance - radius - 0.02;
                if (allowed <= 0.001) return false;
                if (allowed < dist) {
                    const scale = allowed / dist;
                    moveX *= scale;
                    moveZ *= scale;
                }
            }

            const nx = position.x + moveX;
            const nz = position.z + moveZ;
            if (this.isBlocked(nx, nz, radius, height)) return false;

            const floor = this.groundAt(nx, nz, eye + 1.2);
            if (floor === null) return false;
            if (floor - floorGuess > 0.45) return false;
            if (floorGuess - floor > 1.8) return false;

            position.x = nx;
            position.z = nz;
            position.y = fromEye ? floor + eyeHeight : floor;
            return true;
        };

        if (!tryMove(dx, dz)) {
            if (!tryMove(dx, 0)) tryMove(0, dz);
        }
    }

    snapToGround(position) {
        const floor = this.groundAt(position.x, position.z, position.y + 2);
        if (floor === null) return;
        position.y = floor + this.eyeHeight;
    }

    hasLineOfSight(ax, az, bx, bz) {
        const dx = bx - ax;
        const dz = bz - az;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.2) return true;
        const ay = (this.groundAt(ax, az) ?? 0) + 1.4;
        const hit = this.probe(ax, az, dx, dz, distance, ay);
        return !hit || hit.distance >= distance - 0.15;
    }
}

function materialName(mesh) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materials.map((m) => m?.name || '').join(' ');
}

// MeshStandardMaterial + many lights is what tanks the frame rate on this
// office GLB. Unlit materials with the diffuse map keep the look, drop the cost.
function cheapifyMaterials(material) {
    const list = Array.isArray(material) ? material : [material];
    const out = list.map((mat) => {
        if (!mat) return mat;
        if (mat.isMeshBasicMaterial) return mat;

        const basic = new THREE.MeshBasicMaterial({
            color: mat.color ? mat.color.clone() : new THREE.Color(0x888888),
            map: mat.map || null,
            transparent: Boolean(mat.transparent || (mat.opacity != null && mat.opacity < 0.99)),
            opacity: mat.opacity ?? 1,
            side: mat.side ?? THREE.FrontSide,
            fog: true,
            name: mat.name
        });

        if (mat.emissive && mat.emissiveIntensity > 0.15) {
            basic.color.lerp(mat.emissive, Math.min(0.55, mat.emissiveIntensity * 0.35));
        }

        // Drop heavy maps the unlit shader will not use.
        if (mat.normalMap) mat.normalMap = null;
        if (mat.roughnessMap) mat.roughnessMap = null;
        if (mat.metalnessMap) mat.metalnessMap = null;
        if (mat.aoMap) mat.aoMap = null;
        if (mat.emissiveMap) mat.emissiveMap = null;
        mat.dispose?.();
        return basic;
    });
    return Array.isArray(material) ? out : out[0];
}

export function mapInfo(level) {
    const entry = assets.models.building;
    if (!entry) return null;
    return {
        triangles: entry.triangles,
        scale: entry.scale,
        size: entry.size ? [entry.size.x, entry.size.y, entry.size.z].map((n) => Math.round(n * 10) / 10) : null,
        chunks: level?.renderChunks?.length ?? 0,
        visibleChunks: level?.renderChunks?.filter((c) => c.mesh.visible).length ?? 0,
        activeColliders: level?.activeColliders?.length ?? 0
    };
}
