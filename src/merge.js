import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// Merge static meshes that share a material into one draw call each.
// Skinned meshes, doors, and transparent/glass pieces are left alone.
export function mergeStaticByMaterial(root, { skip = /door|glass|glow|checkpoint/i } = {}) {
    root.updateMatrixWorld(true);

    const buckets = new Map();
    const remove = [];

    root.traverse((child) => {
        if (!child.isMesh || child.isSkinnedMesh || !child.geometry) return;
        if (Array.isArray(child.material)) return;

        const mat = child.material;
        if (!mat) return;
        const name = mat.name || child.name || '';
        if (skip.test(name)) return;
        if (mat.transparent && (mat.opacity ?? 1) < 0.98) return;

        const key = mat.uuid;
        if (!buckets.has(key)) buckets.set(key, { material: mat, meshes: [] });
        buckets.get(key).meshes.push(child);
    });

    let mergedCount = 0;
    for (const { material, meshes } of buckets.values()) {
        if (meshes.length < 2) continue;

        const geos = [];
        for (const mesh of meshes) {
            const geo = mesh.geometry.clone();
            geo.applyMatrix4(mesh.matrixWorld);
            // Drop UVs/attrs that don't match the first geometry — mergeGeometries
            // requires identical attribute sets.
            geos.push(geo);
            remove.push(mesh);
        }

        // Only merge geometries with matching attribute layouts.
        const attrs = new Set(Object.keys(geos[0].attributes));
        const compatible = geos.filter((g) => {
            const keys = Object.keys(g.attributes);
            return keys.length === attrs.size && keys.every((k) => attrs.has(k));
        });
        if (compatible.length < 2) {
            for (const g of geos) g.dispose();
            // Undo remove for this bucket.
            for (const mesh of meshes) {
                const idx = remove.indexOf(mesh);
                if (idx >= 0) remove.splice(idx, 1);
            }
            continue;
        }

        const merged = BufferGeometryUtils.mergeGeometries(compatible, false);
        for (const g of geos) g.dispose();
        if (!merged) continue;

        merged.computeBoundingSphere();
        merged.computeBoundingBox();
        const mesh = new THREE.Mesh(merged, material);
        mesh.name = `merged_${material.name || 'mat'}`;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        root.add(mesh);
        mergedCount += 1;
    }

    for (const mesh of remove) {
        mesh.parent?.remove(mesh);
        mesh.geometry?.dispose();
    }

    return mergedCount;
}
