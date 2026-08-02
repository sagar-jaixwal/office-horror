import * as THREE from 'three';
import { hasModel, instantiate } from './models.js';

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

function makeProceduralBody(root) {
    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x1a1e24, metalness: 0.75, roughness: 0.35
    });
    const accentMat = new THREE.MeshStandardMaterial({
        color: 0x2a3340, metalness: 0.6, roughness: 0.4,
        emissive: 0x143a55, emissiveIntensity: 0.35
    });
    const glowMat = new THREE.MeshStandardMaterial({
        color: 0x1affc8, emissive: 0x1affc8, emissiveIntensity: 2.2,
        metalness: 0.2, roughness: 0.3
    });

    root.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.34), bodyMat));

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.032, 0.28, 10), accentMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.28);
    root.add(barrel);

    const tip = new THREE.Object3D();
    tip.position.set(0, 0.01, -0.42);
    root.add(tip);

    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.04, 8), glowMat);
    glow.rotation.x = Math.PI / 2;
    tip.add(glow);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), bodyMat);
    grip.position.set(0, -0.12, 0.06);
    grip.rotation.x = 0.35;
    root.add(grip);

    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.06), accentMat);
    sight.position.set(0, 0.08, -0.05);
    root.add(sight);

    return tip;
}

function attachNerfModel(root) {
    const instance = instantiate('gun');
    if (!instance) return null;

    const model = instance.root;
    // Source longest axis is X; yaw so the barrel faces camera-forward (-Z).
    model.rotation.y = -Math.PI / 2;
    model.position.set(0, -0.06, 0.02);
    root.add(model);

    model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = false;
        child.receiveShadow = false;
        child.frustumCulled = false;
        const apply = (mat) => {
            if (!mat || mat.isMeshBasicMaterial) return mat;
            const basic = new THREE.MeshBasicMaterial({
                color: mat.color?.clone() || new THREE.Color(0xcccccc),
                map: mat.map || null,
                fog: false,
                name: mat.name
            });
            if (mat.map) basic.map.colorSpace = THREE.SRGBColorSpace;
            return basic;
        };
        child.material = Array.isArray(child.material)
            ? child.material.map(apply)
            : apply(child.material);
    });

    root.updateMatrixWorld(true);
    _box.setFromObject(model);
    _box.getSize(_size);
    _box.getCenter(_center);

    const tip = new THREE.Object3D();
    // Muzzle sits at the forward (most negative Z) end of the oriented model.
    tip.position.set(_center.x, _center.y + _size.y * 0.05, _box.min.z - 0.01);
    root.add(tip);
    return tip;
}

// First-person laser pistol parented to the camera.
export function createLaserGun(camera) {
    const root = new THREE.Group();
    // Build off-camera first so muzzle tip math stays in root-local space.
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);

    const tip = hasModel('gun') ? attachNerfModel(root) : makeProceduralBody(root);

    root.position.set(0.28, -0.24, -0.45);
    root.rotation.set(0.08, -0.1, 0.04);
    camera.add(root);

    const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 1, 6),
        new THREE.MeshBasicMaterial({
            color: 0x4dffd0,
            transparent: true,
            opacity: 0.85,
            depthWrite: false
        })
    );
    beam.visible = false;
    beam.frustumCulled = false;

    const muzzleFlash = new THREE.PointLight(0x4dffd0, 0, 4, 2);
    tip.add(muzzleFlash);

    return {
        root,
        tip,
        beam,
        muzzleFlash,
        cooldown: 0,
        recoil: 0,
        restRotationX: root.rotation.x,
        restPositionZ: root.position.z
    };
}

const _mid = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export function updateGun(gun, dt) {
    gun.cooldown = Math.max(0, gun.cooldown - dt);
    gun.recoil = Math.max(0, gun.recoil - dt * 8);
    gun.root.rotation.x = gun.restRotationX - gun.recoil * 0.18;
    gun.root.position.z = gun.restPositionZ + gun.recoil * 0.04;
    gun.muzzleFlash.intensity = gun.recoil * 18;
    if (gun.beam.visible) {
        gun.beam.material.opacity = Math.max(0, gun.beam.material.opacity - dt * 4);
        if (gun.beam.material.opacity <= 0.05) gun.beam.visible = false;
    }
}

export function showLaserBeam(gun, from, to) {
    const length = from.distanceTo(to);
    if (length < 0.05) return;

    gun.beam.visible = true;
    gun.beam.material.opacity = 0.9;
    gun.beam.scale.set(1, length, 1);

    _mid.copy(from).add(to).multiplyScalar(0.5);
    gun.beam.position.copy(_mid);

    const dir = to.clone().sub(from).normalize();
    _quat.setFromUnitVectors(_up, dir);
    gun.beam.quaternion.copy(_quat);
}
