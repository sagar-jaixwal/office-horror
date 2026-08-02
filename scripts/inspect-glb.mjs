// Prints the structure of a .glb: animation clips, skins, materials and the
// world-space bounding box, which is what we need to know before wiring a model
// into the game (scale, origin and which way it faces).
import { readFileSync } from 'node:fs';

function readGlbJson(path) {
    const buffer = readFileSync(path);
    if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} is not a GLB`);
    let offset = 12;
    while (offset < buffer.length) {
        const chunkLength = buffer.readUInt32LE(offset);
        const chunkType = buffer.readUInt32LE(offset + 4);
        const start = offset + 8;
        if (chunkType === 0x4e4f534a) {
            return JSON.parse(buffer.subarray(start, start + chunkLength).toString('utf8'));
        }
        offset = start + chunkLength;
    }
    throw new Error('No JSON chunk found');
}

// glTF stores TRS per node; compose them to place each mesh in scene space.
function composeMatrix(node) {
    if (node.matrix) return node.matrix.slice();
    const [tx, ty, tz] = node.translation || [0, 0, 0];
    const [qx, qy, qz, qw] = node.rotation || [0, 0, 0, 1];
    const [sx, sy, sz] = node.scale || [1, 1, 1];

    const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
    const xx = qx * x2, xy = qx * y2, xz = qx * z2;
    const yy = qy * y2, yz = qy * z2, zz = qz * z2;
    const wx = qw * x2, wy = qw * y2, wz = qw * z2;

    return [
        (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
        (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
        (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
        tx, ty, tz, 1
    ];
}

function multiply(a, b) {
    const out = new Array(16).fill(0);
    for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
            out[col * 4 + row] =
                a[row] * b[col * 4] +
                a[4 + row] * b[col * 4 + 1] +
                a[8 + row] * b[col * 4 + 2] +
                a[12 + row] * b[col * 4 + 3];
        }
    }
    return out;
}

function transformPoint(m, [x, y, z]) {
    return [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14]
    ];
}

function inspect(path) {
    const gltf = readGlbJson(path);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let triangles = 0;
    let skinnedMeshes = 0;

    const visit = (nodeIndex, parentMatrix) => {
        const node = gltf.nodes[nodeIndex];
        const world = multiply(parentMatrix, composeMatrix(node));

        if (node.mesh !== undefined) {
            if (node.skin !== undefined) skinnedMeshes += 1;
            for (const primitive of gltf.meshes[node.mesh].primitives) {
                const position = gltf.accessors[primitive.attributes.POSITION];
                if (primitive.indices !== undefined) triangles += gltf.accessors[primitive.indices].count / 3;
                else triangles += position.count / 3;
                if (!position.min || !position.max) continue;
                // Corners of the local AABB, so rotated nodes are measured correctly.
                for (let corner = 0; corner < 8; corner++) {
                    const local = [
                        corner & 1 ? position.max[0] : position.min[0],
                        corner & 2 ? position.max[1] : position.min[1],
                        corner & 4 ? position.max[2] : position.min[2]
                    ];
                    const world3 = transformPoint(world, local);
                    for (let axis = 0; axis < 3; axis++) {
                        min[axis] = Math.min(min[axis], world3[axis]);
                        max[axis] = Math.max(max[axis], world3[axis]);
                    }
                }
            }
        }
        for (const child of node.children || []) visit(child, world);
    };

    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const scene = gltf.scenes[gltf.scene ?? 0];
    for (const root of scene.nodes) visit(root, identity);

    const round = (n) => Math.round(n * 1000) / 1000;

    console.log(`\n=== ${path} ===`);
    console.log(`generator      : ${gltf.asset?.generator || 'unknown'}`);
    console.log(`nodes/meshes   : ${gltf.nodes.length} nodes, ${(gltf.meshes || []).length} meshes, ${Math.round(triangles)} triangles`);
    console.log(`skins          : ${(gltf.skins || []).length} (${skinnedMeshes} skinned mesh nodes)`);
    if (gltf.skins?.length) {
        gltf.skins.forEach((skin, i) => console.log(`  skin ${i}: ${skin.joints.length} joints`));
    }
    console.log(`materials      : ${(gltf.materials || []).map((m) => m.name || '(unnamed)').join(', ') || 'none'}`);
    console.log(`textures       : ${(gltf.textures || []).length}, images: ${(gltf.images || []).length}`);
    console.log(`bounds min     : [${min.map(round).join(', ')}]`);
    console.log(`bounds max     : [${max.map(round).join(', ')}]`);
    console.log(`size (X,Y,Z)   : [${[0, 1, 2].map((a) => round(max[a] - min[a])).join(', ')}]`);
    console.log(`animations     : ${(gltf.animations || []).length}`);
    for (const [i, clip] of (gltf.animations || []).entries()) {
        const durations = clip.samplers.map((s) => gltf.accessors[s.input].max?.[0] ?? 0);
        console.log(`  [${i}] "${clip.name || '(unnamed)'}"  ${clip.channels.length} channels, ${round(Math.max(0, ...durations))}s`);
    }
    console.log(`root nodes     : ${scene.nodes.map((n) => gltf.nodes[n].name || `node${n}`).join(', ')}`);
}

for (const path of process.argv.slice(2)) inspect(path);
