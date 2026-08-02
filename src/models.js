import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeStaticByMaterial } from './merge.js';

// Characters are normalised to a known height. The building is normalised by
// door height so rooms feel human-scale rather than Sketchfab-unit scale.
export const MODEL_SOURCES = {
    // Larva man with Mixamo walk cycle — used for all hunter monsters.
    larva: {
        url: 'models/larva_man-walking.glb',
        kind: 'character',
        targetHeight: 1.85,
        preRotate: null,
        faceOffset: 0
    },
    gun: {
        url: 'models/nerf_gun.glb',
        kind: 'prop',
        // Viewmodel size — about forearm length in front of the camera.
        targetLength: 0.38
    },
    building: {
        url: 'models/the_heilwald_loophole_randolphs_office.glb',
        kind: 'map',
        // Doors in the source sit ~9 units tall; 2.15m is a real door.
        targetDoorHeight: 2.15,
        nativeDoorHeight: 9
    }
};

export const assets = { models: {}, loaded: false, failures: [] };

const _box = new THREE.Box3();

function skinnedBounds(object) {
    const bounds = new THREE.Box3().makeEmpty();
    object.updateMatrixWorld(true);
    object.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        if (child.isSkinnedMesh) {
            child.computeBoundingBox();
            _box.copy(child.boundingBox);
        } else {
            if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
            _box.copy(child.geometry.boundingBox);
        }
        _box.applyMatrix4(child.matrixWorld);
        bounds.union(_box);
    });
    return bounds;
}

function prepareMeshes(root, { castShadow = true, cheapTextures = false } = {}) {
    root.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = castShadow;
        child.receiveShadow = false;
        if (child.isSkinnedMesh) child.frustumCulled = false;
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
            if (!material) continue;
            if (material.map) {
                material.map.colorSpace = THREE.SRGBColorSpace;
                if (cheapTextures) {
                    material.map.anisotropy = 1;
                    material.map.generateMipmaps = true;
                    material.map.minFilter = THREE.LinearMipmapLinearFilter;
                    material.map.magFilter = THREE.LinearFilter;
                }
            }
            if (material.emissiveMap) material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
            // Strip expensive maps up-front for the building.
            if (cheapTextures) {
                material.normalMap = null;
                material.roughnessMap = null;
                material.metalnessMap = null;
                material.aoMap = null;
                material.metalness = 0;
                material.roughness = 1;
            }
            if (material.transparent || /glass|glow/i.test(material.name || '')) {
                material.depthWrite = material.opacity >= 0.95;
            }
        }
    });
}

function normaliseCharacter(gltf, spec) {
    const oriented = new THREE.Group();
    const content = gltf.scene;
    oriented.add(content);

    if (spec.preRotate) content.rotation.set(...spec.preRotate);
    const bounds = skinnedBounds(content);

    const size = bounds.getSize(new THREE.Vector3());
    const scale = spec.targetHeight / (size.y || 1);
    const centre = bounds.getCenter(new THREE.Vector3());

    content.scale.setScalar(scale);
    content.position.set(-centre.x * scale, -bounds.min.y * scale, -centre.z * scale);
    if (spec.faceOffset) content.rotation.y += spec.faceOffset;

    prepareMeshes(oriented);
    oriented.updateMatrixWorld(true);
    return { oriented, nativeHeight: size.y, scale };
}

function normaliseProp(gltf, spec) {
    const oriented = new THREE.Group();
    const content = gltf.scene;
    oriented.add(content);

    content.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(content);
    const size = bounds.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z) || 1;
    const scale = (spec.targetLength || 0.4) / longest;
    const centre = bounds.getCenter(new THREE.Vector3());

    content.scale.setScalar(scale);
    content.position.set(-centre.x * scale, -bounds.min.y * scale, -centre.z * scale);

    prepareMeshes(oriented, { castShadow: false, cheapTextures: true });
    mergeStaticByMaterial(oriented, { skip: /$^/ }); // merge all static gun pieces
    oriented.updateMatrixWorld(true);
    return { oriented, nativeHeight: size.y, scale };
}

function normaliseMap(gltf, spec) {
    const oriented = new THREE.Group();
    const content = gltf.scene;
    oriented.add(content);

    // Sketchfab already baked a +90° X rotation into the root matrix; three.js
    // applies it, so the model stands Y-up by the time we measure.
    content.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(content);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = (spec.targetDoorHeight || 2.15) / (spec.nativeDoorHeight || size.y * 0.15);
    const centre = bounds.getCenter(new THREE.Vector3());

    content.scale.setScalar(scale);
    // Pin the main floor (source Y≈0 after Sketchfab rotation) to world y=0.
    // Source floor sits near Y=-20 for basements; the playable floor is ~0.
    const floorY = 0;
    content.position.set(
        -centre.x * scale,
        -floorY * scale,
        -centre.z * scale
    );

    prepareMeshes(oriented, { castShadow: false, cheapTextures: true });
    // Collapse same-material static pieces into fewer draw calls.
    mergeStaticByMaterial(oriented);
    oriented.updateMatrixWorld(true);

    const finalBounds = new THREE.Box3().setFromObject(oriented);
    return {
        oriented,
        nativeHeight: size.y,
        scale,
        bounds: finalBounds,
        size: finalBounds.getSize(new THREE.Vector3())
    };
}

function createLoader() {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    // Copied from three/examples/jsm/libs/draco into public/draco/.
    draco.setDecoderPath('/draco/gltf/');
    loader.setDRACOLoader(draco);
    return loader;
}

function storeModel(name, kind, payload) {
    assets.models[name] = { ...payload, kind };
}

async function loadOneModel(loader, name, spec) {
    const gltf = await loader.loadAsync(spec.url);
    if (spec.kind === 'map') {
        const result = normaliseMap(gltf, spec);
        storeModel(name, 'map', {
            prototype: result.oriented,
            animations: [],
            triangles: countTriangles(gltf.scene),
            nativeHeight: Math.round(result.nativeHeight * 1000) / 1000,
            scale: Math.round(result.scale * 10000) / 10000,
            bounds: result.bounds,
            size: result.size
        });
        return;
    }
    if (spec.kind === 'prop') {
        const { oriented, nativeHeight, scale } = normaliseProp(gltf, spec);
        storeModel(name, 'prop', {
            prototype: oriented,
            animations: [],
            triangles: countTriangles(gltf.scene),
            nativeHeight: Math.round(nativeHeight * 1000) / 1000,
            scale: Math.round(scale * 10000) / 10000
        });
        return;
    }
    const { oriented, nativeHeight, scale } = normaliseCharacter(gltf, spec);
    storeModel(name, 'character', {
        prototype: oriented,
        animations: gltf.animations || [],
        triangles: countTriangles(gltf.scene),
        nativeHeight: Math.round(nativeHeight * 1000) / 1000,
        scale: Math.round(scale * 10000) / 10000
    });
}

/**
 * @param {(fraction: number, name: string) => void} onProgress
 * @param {{ sequential?: boolean, timeoutMs?: number }} [options]
 */
export async function loadModels(onProgress, options = {}) {
    const sequential = Boolean(options.sequential);
    const timeoutMs = options.timeoutMs ?? 60000;
    const loader = createLoader();
    const entries = Object.entries(MODEL_SOURCES);
    let done = 0;

    const runOne = async ([name, spec]) => {
        onProgress?.(done / entries.length, name);
        try {
            const task = loadOneModel(loader, name, spec);
            if (timeoutMs > 0) {
                await Promise.race([
                    task,
                    new Promise((_, reject) => {
                        setTimeout(() => reject(new Error(`timeout loading ${name}`)), timeoutMs);
                    })
                ]);
            } else {
                await task;
            }
        } catch (error) {
            assets.failures.push(`${name}: ${error.message}`);
            console.warn(`[models] failed to load ${spec.url}`, error);
        } finally {
            done += 1;
            onProgress?.(done / entries.length, name);
        }
    };

    if (sequential) {
        for (const entry of entries) await runOne(entry);
    } else {
        await Promise.all(entries.map(runOne));
    }

    assets.loaded = true;
    return assets;
}

function countTriangles(object) {
    let total = 0;
    object.traverse((child) => {
        const geometry = child.geometry;
        if (!geometry) return;
        total += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
    });
    return Math.round(total);
}

export function hasModel(name) {
    return Boolean(assets.models[name]);
}

export function instantiate(name) {
    const entry = assets.models[name];
    if (!entry) return null;
    // Maps are unique and heavy — use the prototype directly. Characters need
    // a skinned clone so each instance animates on its own skeleton. Props are
    // light enough to deep-clone once for the viewmodel.
    if (entry.kind === 'map') {
        return { root: entry.prototype, animations: [] };
    }
    if (entry.kind === 'prop') {
        return { root: entry.prototype.clone(true), animations: [] };
    }
    const root = cloneSkinned(entry.prototype);
    return { root, animations: entry.animations };
}

export function findBone(root, ...prefixes) {
    let match = null;
    root.traverse((child) => {
        if (match || !child.isBone) return;
        const name = child.name;
        const bare = name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name;
        if (prefixes.some((prefix) => name.startsWith(prefix) || bare.startsWith(prefix))) {
            match = child;
        }
    });
    return match;
}
