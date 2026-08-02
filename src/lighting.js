import * as THREE from 'three';

export const LOW_SPEC = true; // always prefer smooth over fancy lighting on this map

export function configureRenderer(renderer) {
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(1);
    renderer.info.autoReset = true;
}

export function configureAtmosphere(scene) {
    const fogColor = new THREE.Color(0x090c12);
    scene.background = fogColor;
    scene.fog = new THREE.FogExp2(fogColor, 0.07);
}

export class LightingRig {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.fixtures = [];
        this.lightning = { timer: 8, energy: 0 };
    }

    build(level) {
        this.level = level;
        const spawn = level.spawn || { x: 0, y: 0, z: 0 };
        const floorY = spawn.y || 0;
        const ceiling = level.ceilingHeight || 2.8;

        // Flat fill — MeshBasic map materials do not need many lights.
        this.ambient = new THREE.AmbientLight(0x6a7382, 0.85);
        this.scene.add(this.ambient);

        this.hemi = new THREE.HemisphereLight(0x7a8799, 0x1a1510, 0.35);
        this.hemi.position.set(0, floorY + ceiling, 0);
        this.scene.add(this.hemi);

        this.moon = null;

        const fill = new THREE.PointLight(0xdce8ff, 10, 10, 2);
        fill.position.set(spawn.x, floorY + ceiling - 0.3, spawn.z);
        this.scene.add(fill);
        this.fixtures.push({ light: fill, base: 10 });

        this.buildFlashlight();
        return this;
    }

    buildFlashlight() {
        // PointLight is far cheaper than SpotLight for this scene.
        const beam = new THREE.PointLight(0xfff2d6, 0, 14, 1.4);
        beam.position.set(0, 0, -0.4);
        this.camera.add(beam);
        this.flashlight = { beam, on: false, baseAmbient: 0.85 };
    }

    setFlashlight(on, battery = 1) {
        this.flashlight.on = on;
        const power = on ? Math.max(0.2, battery) : 0;
        this.flashlight.beam.intensity = power * 28;
        if (this.ambient) {
            this.ambient.intensity = on
                ? this.flashlight.baseAmbient + 0.35 * power
                : this.flashlight.baseAmbient;
        }
    }

    update() {
        // No per-frame flicker / lightning — saves CPU on weak GPUs.
    }
}
