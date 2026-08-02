import * as THREE from 'three';
import { surface } from './materials.js';
import { instantiate, hasModel, findBone } from './models.js';

// Characters come from one of two places: the supplied .glb models when they
// loaded, or the procedural rigs below as a fallback. Both expose the same
// shape so the game loop does not care which it is holding:
//
//   { root, height, joints{...}, update(dt), setLocomotion(phase, intensity) }

const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _matrix = new THREE.Matrix4();

// A joint records its rest orientation plus the hinge axes expressed in its
// parent's space. Working in axis-angle around a captured axis means the same
// animation code drives a hand-built pivot and an arbitrarily-oriented Mixamo
// bone without needing to know either one's local axis convention.
function makeJoint(node, root) {
    if (!node) return null;
    const parent = node.parent || root;
    parent.updateWorldMatrix(true, false);
    _matrix.copy(parent.matrixWorld).invert();

    const axis = (x, y, z) => new THREE.Vector3(x, y, z)
        .transformDirection(root.matrixWorld)
        .transformDirection(_matrix)
        .normalize();

    return {
        node,
        rest: node.quaternion.clone(),
        pitch: axis(1, 0, 0),   // forward/back swing
        yaw: axis(0, 1, 0),     // twist
        roll: axis(0, 0, 1)     // side to side
    };
}

function bend(joint, angle, axis = 'pitch') {
    if (!joint) return;
    _quat.setFromAxisAngle(joint[axis], angle);
    joint.node.quaternion.copy(joint.rest).premultiply(_quat);
}

function bendTwo(joint, pitchAngle, rollAngle) {
    if (!joint) return;
    _quat.setFromAxisAngle(joint.pitch, pitchAngle);
    joint.node.quaternion.copy(joint.rest).premultiply(_quat);
    _quat.setFromAxisAngle(joint.roll, rollAngle);
    joint.node.quaternion.premultiply(_quat);
}

let SHARED = null;

function shared() {
    if (SHARED) return SHARED;
    SHARED = {
        skin: surface('skin', { roughness: 0.86, metalness: 0, bump: 0.012 }),
        pale: surface('paleFlesh', { roughness: 0.72, metalness: 0.02, bump: 0.02 }),
        rotten: surface('rottenFlesh', { roughness: 0.9, metalness: 0.02, bump: 0.03 }),
        shirt: surface('shirt', { roughness: 0.85, bump: 0.01 }),
        trousers: new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.92 }),
        shoe: new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.6 }),
        tie: new THREE.MeshStandardMaterial({ color: 0x2b3a63, roughness: 0.7 }),
        hair: new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 1 }),
        maw: new THREE.MeshStandardMaterial({ color: 0x120608, roughness: 1 }),
        tooth: new THREE.MeshStandardMaterial({ color: 0xd8cfbb, roughness: 0.5 }),
        sinew: new THREE.MeshStandardMaterial({ color: 0x6e1f22, roughness: 0.55, metalness: 0.1 })
    };
    return SHARED;
}

// ---------------------------------------------------------------------------
// Shared behaviour
// ---------------------------------------------------------------------------

function applyWalkCycle(rig, phase, intensity) {
    const { joints } = rig;
    const swing = Math.sin(phase) * 0.62 * intensity;
    const counter = -swing;

    bend(joints.leftThigh, swing);
    bend(joints.rightThigh, counter);
    bend(joints.leftShin, -Math.max(0, -Math.sin(phase - 0.6)) * 0.95 * intensity);
    bend(joints.rightShin, -Math.max(0, Math.sin(phase - 0.6)) * 0.95 * intensity);

    bend(joints.leftArm, counter * 0.55);
    bend(joints.rightArm, swing * 0.55);
    bend(joints.leftForearm, -Math.abs(counter) * 0.5 - 0.12);
    bend(joints.rightForearm, -Math.abs(swing) * 0.5 - 0.12);

    bend(joints.spine, Math.sin(phase * 2) * 0.03 * intensity, 'yaw');
    rig.root.position.y = rig.groundY + Math.abs(Math.sin(phase)) * 0.03 * intensity;
}

function attachCommon(rig) {
    rig.groundY = rig.root.position.y || 0;

    rig.setLocomotion = (phase, intensity) => {
        if (rig.clipDriven) {
            // Walk clip is in-place; sync playback speed to chase intensity.
            if (rig.action) {
                const moving = intensity > 0.05;
                rig.action.paused = !moving;
                if (moving) rig.action.timeScale = 0.75 + intensity * 0.85;
            }
            return;
        }
        applyWalkCycle(rig, phase, intensity);
    };

    rig.update = (dt) => {
        rig.mixer?.update(dt);
        // Walk clips often include pelvis root motion — pin XZ so the capsule
        // (container) owns world movement and the mesh does not drift sideways.
        if (rig.hipsLock) {
            const hips = rig.hipsLock.node;
            hips.position.x = rig.hipsLock.x;
            hips.position.z = rig.hipsLock.z;
        }
    };

    rig.lookAround = (amount) => {
        bend(rig.joints.neck || rig.joints.head, amount, 'yaw');
    };

    return rig;
}

// ---------------------------------------------------------------------------
// GLB-backed characters
// ---------------------------------------------------------------------------

function mapHumanoidBones(root) {
    // Mixamo (Hips/LeftArm, mixamorig:*) and UE-style (pelvis/upperarm_l) naming.
    return {
        hips: findBone(root, 'Hips', 'pelvis'),
        spine: findBone(root, 'Spine2', 'Spine1', 'spine_03', 'spine_02'),
        neck: findBone(root, 'Neck', 'neck_01'),
        head: findBone(root, 'head_1', 'Head_'),
        leftArm: findBone(root, 'LeftArm', 'upperarm_l'),
        rightArm: findBone(root, 'RightArm', 'upperarm_r'),
        leftForearm: findBone(root, 'LeftForeArm', 'lowerarm_l'),
        rightForearm: findBone(root, 'RightForeArm', 'lowerarm_r'),
        leftThigh: findBone(root, 'LeftUpLeg', 'thigh_l'),
        rightThigh: findBone(root, 'RightUpLeg', 'thigh_r'),
        leftShin: findBone(root, 'LeftLeg', 'calf_l'),
        rightShin: findBone(root, 'RightLeg', 'calf_r')
    };
}

// SkeletonUtils.clone shares materials between instances, so any per-character
// recolouring has to work on copies. Both models name their materials usefully
// (Wolf3D_Skin, Wolf3D_Outfit_Top, ...) which is what lets a monster variant
// treat flesh and clothing differently.
function recolour(root, transform) {
    root.traverse((child) => {
        if (!child.isMesh) return;
        const apply = (material) => {
            const copy = material.clone();
            transform(copy, copy.name || material.name || '');
            return copy;
        };
        child.material = Array.isArray(child.material)
            ? child.material.map(apply)
            : apply(child.material);
    });
}

function buildGlbCharacter(modelName, { height, clip } = {}) {
    const instance = instantiate(modelName);
    if (!instance) return null;

    const root = new THREE.Group();
    root.add(instance.root);
    root.updateMatrixWorld(true);

    // Unlit skins are much cheaper than full PBR on skinned hunters.
    instance.root.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = false;
        child.receiveShadow = false;
        const apply = (mat) => {
            if (!mat || mat.isMeshBasicMaterial) return mat;
            const basic = new THREE.MeshBasicMaterial({
                color: mat.color?.clone() || new THREE.Color(0x888888),
                map: mat.map || null,
                fog: true,
                name: mat.name
            });
            mat.dispose?.();
            return basic;
        };
        child.material = Array.isArray(child.material)
            ? child.material.map(apply)
            : apply(child.material);
    });

    const bones = mapHumanoidBones(root);
    const joints = {};
    for (const [name, bone] of Object.entries(bones)) joints[name] = makeJoint(bone, root);

    const rig = { root, model: instance.root, joints, height: height || 1.8, isGlb: true };

    if (bones.hips) {
        rig.hipsLock = {
            node: bones.hips,
            x: bones.hips.position.x,
            z: bones.hips.position.z
        };
    }

    if (instance.animations.length) {
        const found = (clip && instance.animations.find((a) => a.name === clip))
            || instance.animations.find((a) => /walk/i.test(a.name))
            || instance.animations[0];
        rig.mixer = new THREE.AnimationMixer(instance.root);
        rig.action = rig.mixer.clipAction(found);
        rig.action.play();
        rig.clipDriven = true;
    }

    return attachCommon(rig);
}

// ---------------------------------------------------------------------------
// Procedural fallback rig
// ---------------------------------------------------------------------------

function jointedSegment(length, radiusTop, radiusBottom, material) {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(radiusBottom, Math.max(0.01, length - radiusBottom * 2), 4, 10),
        material
    );
    mesh.position.y = -length / 2;
    mesh.scale.x = radiusTop / radiusBottom;
    mesh.castShadow = true;
    pivot.add(mesh);
    return pivot;
}

function eyes(head, color, intensity, spacing, radius) {
    const material = new THREE.MeshStandardMaterial({
        color: 0x090909, emissive: color, emissiveIntensity: intensity, roughness: 0.3
    });
    for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 8), material);
        eye.position.set(side * spacing, 0.015, 0.095);
        head.add(eye);
    }
}

function maw(head, { width, height, depth, teeth, y }) {
    const m = shared();
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), m.maw);
    mouth.position.set(0, y, 0.085);
    head.add(mouth);
    for (let i = 0; i < teeth; i++) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 4), m.tooth);
        tooth.position.set(-width / 2 + 0.012 + (i / Math.max(1, teeth - 1)) * (width - 0.024), y + height / 2 - 0.012, 0.1);
        tooth.rotation.x = Math.PI;
        head.add(tooth);
        const lower = tooth.clone();
        lower.position.y = y - height / 2 + 0.012;
        lower.rotation.x = 0;
        head.add(lower);
    }
}

function buildProceduralHumanoid(config = {}) {
    const m = shared();
    const {
        height = 1.8,
        skinMaterial = m.skin,
        torsoMaterial = m.shirt,
        legMaterial = m.trousers,
        armLengthScale = 1,
        legLengthScale = 1,
        hunch = 0,
        thin = 1,
        headTilt = 0,
        eyeColor = 0x000000,
        eyeGlow = 0,
        teeth = 0,
        mouthSize = 0.09,
        tie = false,
        hair = true
    } = config;

    const s = height / 1.8;
    const root = new THREE.Group();

    const thighLength = 0.44 * s * legLengthScale;
    const shinLength = 0.44 * s * legLengthScale;

    const hips = new THREE.Group();
    hips.position.y = thighLength + shinLength + 0.06 * s;
    root.add(hips);

    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.3 * s * thin, 0.2 * s, 0.2 * s * thin), legMaterial);
    pelvis.castShadow = true;
    hips.add(pelvis);

    const spine = new THREE.Group();
    spine.position.y = 0.1 * s;
    spine.rotation.x = hunch;
    hips.add(spine);

    const torsoHeight = 0.58 * s;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42 * s * thin, torsoHeight, 0.24 * s * thin), torsoMaterial);
    torso.position.y = torsoHeight / 2;
    torso.castShadow = true;
    spine.add(torso);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.46 * s * thin, 0.22 * s, 0.26 * s * thin), torsoMaterial);
    chest.position.y = torsoHeight - 0.08 * s;
    chest.castShadow = true;
    spine.add(chest);

    if (tie) {
        const knot = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.06 * s, 0.03 * s), m.tie);
        knot.position.set(0, torsoHeight - 0.02 * s, 0.135 * s * thin);
        spine.add(knot);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.34 * s, 0.02 * s), m.tie);
        blade.position.set(0, torsoHeight - 0.24 * s, 0.135 * s * thin);
        spine.add(blade);
    }

    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.06 * s, 0.1 * s, 8), skinMaterial);
    neckMesh.position.y = torsoHeight + 0.05 * s;
    spine.add(neckMesh);

    const neck = new THREE.Group();
    neck.position.y = torsoHeight + 0.1 * s;
    neck.rotation.z = headTilt;
    spine.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.115 * s, 14, 12), skinMaterial);
    head.scale.set(0.92, 1.12, 1);
    head.position.y = 0.11 * s;
    head.castShadow = true;
    neck.add(head);

    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.13 * s, 0.07 * s, 0.11 * s), skinMaterial);
    jaw.position.set(0, -0.055 * s, 0.03 * s);
    head.add(jaw);

    if (hair) {
        const cap = new THREE.Mesh(
            new THREE.SphereGeometry(0.118 * s, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
            m.hair
        );
        cap.position.y = 0.012 * s;
        head.add(cap);
    }
    eyes(head, eyeColor, eyeGlow, 0.055 * s, eyeGlow > 0 ? 0.024 * s : 0.02 * s);
    maw(head, {
        width: mouthSize * s,
        height: 0.05 * s * (teeth ? 1.8 : 1),
        depth: 0.05 * s,
        teeth,
        y: -0.055 * s
    });

    const shoulderY = torsoHeight - 0.04 * s;
    const limbs = {};
    for (const [side, sign] of [['left', -1], ['right', 1]]) {
        const upper = jointedSegment(0.31 * s * armLengthScale, 0.055 * s, 0.05 * s, torsoMaterial);
        upper.position.set(sign * 0.25 * s * thin, shoulderY, 0);
        spine.add(upper);

        const fore = jointedSegment(0.29 * s * armLengthScale, 0.05 * s, 0.042 * s, skinMaterial);
        fore.position.y = -0.31 * s * armLengthScale;
        upper.add(fore);

        const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.11 * s, 0.045 * s), skinMaterial);
        hand.position.y = -0.29 * s * armLengthScale - 0.045 * s;
        hand.castShadow = true;
        fore.add(hand);

        const thigh = jointedSegment(thighLength, 0.08 * s, 0.07 * s, legMaterial);
        thigh.position.set(sign * 0.1 * s, -0.06 * s, 0);
        hips.add(thigh);

        const shin = jointedSegment(shinLength, 0.065 * s, 0.055 * s, legMaterial);
        shin.position.y = -thighLength;
        thigh.add(shin);

        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09 * s, 0.06 * s, 0.22 * s), m.shoe);
        foot.position.set(0, -shinLength - 0.02 * s, 0.05 * s);
        foot.castShadow = true;
        shin.add(foot);

        limbs[`${side}Arm`] = upper;
        limbs[`${side}Forearm`] = fore;
        limbs[`${side}Thigh`] = thigh;
        limbs[`${side}Shin`] = shin;
    }

    root.updateMatrixWorld(true);

    const joints = {};
    for (const [name, node] of Object.entries({ hips, spine, neck, head, ...limbs })) {
        joints[name] = makeJoint(node, root);
    }

    return attachCommon({ root, joints, height, scale: s, isGlb: false, spineNode: spine });
}

// ---------------------------------------------------------------------------
// Public constructors
// ---------------------------------------------------------------------------

function buildLarvaMonster({ height, tint, profile }) {
    const glb = hasModel('larva') && buildGlbCharacter('larva', {
        height,
        clip: 'Armature|Armature|mixamo.com|Layer0'
    });
    if (!glb) return null;
    if (tint != null) {
        recolour(glb.root, (material) => {
            material.color.setHex(tint);
        });
    }
    glb.profile = profile;
    return glb;
}

// Larva-man walk GLB with colour / speed variants so the three hunters feel distinct.
export function createMonster(kind) {
    const m = shared();

    if (kind === 'acidMouth') {
        const glb = buildLarvaMonster({
            height: 1.95,
            tint: 0x6c7a45,
            profile: { speed: 0.95, chase: 1.95, sight: 12, name: 'The Acid Mouth' }
        });
        if (glb) return glb;
        const rig = buildProceduralHumanoid({
            height: 1.78, skinMaterial: m.rotten, torsoMaterial: m.rotten, legMaterial: m.rotten,
            armLengthScale: 1.12, thin: 1.25, hunch: 0.55,
            eyeColor: 0x9dff5a, eyeGlow: 2.6, teeth: 9, mouthSize: 0.14, hair: false
        });
        rig.profile = { speed: 0.95, chase: 1.95, sight: 12, name: 'The Acid Mouth' };
        return rig;
    }

    if (kind === 'stalker') {
        const glb = buildLarvaMonster({
            height: 1.85,
            tint: 0x3a2a28,
            profile: { speed: 1.05, chase: 2.35, sight: 13, name: 'The Stalker' }
        });
        if (glb) return glb;
        const rig = buildProceduralHumanoid({
            height: 1.7, skinMaterial: m.pale, torsoMaterial: m.rotten, legMaterial: m.pale,
            armLengthScale: 1.25, thin: 1.05, hunch: 0.35,
            eyeColor: 0xffaa33, eyeGlow: 3.2, teeth: 7, mouthSize: 0.12, hair: false
        });
        rig.profile = { speed: 1.05, chase: 2.35, sight: 13, name: 'The Stalker' };
        return rig;
    }

    // ceilingCrawler and any unknown kind — pale larva.
    const glb = buildLarvaMonster({
        height: 1.75,
        tint: 0x9aa3a6,
        profile: { speed: 1.1, chase: 2.85, sight: 14, name: 'The Ceiling Crawler' }
    });
    if (glb) return glb;
    const rig = buildProceduralHumanoid({
        height: 1.55, skinMaterial: m.sinew, torsoMaterial: m.rotten, legMaterial: m.sinew,
        armLengthScale: 1.6, legLengthScale: 1.35, thin: 0.7, hunch: -0.5,
        eyeColor: 0xff3b2f, eyeGlow: 4, teeth: 6, mouthSize: 0.1, hair: false
    });
    rig.profile = { speed: 1.1, chase: 2.85, sight: 14, name: 'The Ceiling Crawler' };
    return rig;
}
