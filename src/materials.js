import * as THREE from 'three';

// Every surface in the game is textured from a canvas drawn at runtime, so the
// project stays asset-free while still avoiding flat untextured plastic looks.

const sourceCache = new Map();

function drawTexture(name, size, draw) {
    if (sourceCache.has(name)) return sourceCache.get(name);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    draw(canvas.getContext('2d'), size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    texture.colorSpace = THREE.SRGBColorSpace;
    sourceCache.set(name, texture);
    return texture;
}

// Clones share the underlying canvas but carry their own repeat/offset, which is
// what lets one drawing tile correctly across surfaces of very different sizes.
export function texture(name, repeatX = 1, repeatY = 1) {
    const base = PAINTERS[name](name);
    const clone = base.clone();
    clone.needsUpdate = true;
    clone.repeat.set(repeatX, repeatY);
    return clone;
}

function speckle(ctx, size, count, colors, maxSize = 2) {
    for (let i = 0; i < count; i++) {
        ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
        const s = 0.5 + Math.random() * maxSize;
        ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
    }
}

function blotches(ctx, size, count, color, minR, maxR) {
    for (let i = 0; i < count; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = minR + Math.random() * (maxR - minR);
        const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, color);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
}

const PAINTERS = {
    carpet: (n) => drawTexture(n, 256, (ctx, s) => {
        ctx.fillStyle = '#2b2e34';
        ctx.fillRect(0, 0, s, s);
        speckle(ctx, s, 26000, ['#22252a', '#33373e', '#3b4048', '#1c1e22'], 1.6);
        blotches(ctx, s, 14, 'rgba(20,14,10,0.35)', 10, 46);
    }),

    // Large soft stains give away the tile boundary badly on long wall runs, so
    // the grime here is kept fine-grained and the variation is vertical streaks.
    wallPaint: (n) => drawTexture(n, 512, (ctx, s) => {
        ctx.fillStyle = '#8d8a80';
        ctx.fillRect(0, 0, s, s);
        speckle(ctx, s, 42000, ['#949187', '#85827a', '#9b988e', '#7e7b73'], 1.4);
        for (let i = 0; i < 200; i++) {
            ctx.fillStyle = `rgba(60,54,44,${0.015 + Math.random() * 0.035})`;
            ctx.fillRect(Math.random() * s, 0, 1 + Math.random() * 4, s);
        }
        blotches(ctx, s, 26, 'rgba(52,44,32,0.1)', 6, 22);
    }),

    concrete: (n) => drawTexture(n, 256, (ctx, s) => {
        ctx.fillStyle = '#4a4a4d';
        ctx.fillRect(0, 0, s, s);
        speckle(ctx, s, 20000, ['#414144', '#535356', '#5b5b5e', '#37373a'], 2);
        blotches(ctx, s, 18, 'rgba(24,24,26,0.4)', 8, 50);
    }),

    ceilingTile: (n) => drawTexture(n, 256, (ctx, s) => {
        ctx.fillStyle = '#b9b8b0';
        ctx.fillRect(0, 0, s, s);
        speckle(ctx, s, 22000, ['#b0afa7', '#c2c1b9', '#a8a79f'], 1.5);
        blotches(ctx, s, 6, 'rgba(90,72,40,0.35)', 14, 52);
        ctx.strokeStyle = '#6f6e68';
        ctx.lineWidth = 3;
        ctx.strokeRect(0, 0, s, s);
        ctx.beginPath();
        ctx.moveTo(s / 2, 0);
        ctx.lineTo(s / 2, s);
        ctx.moveTo(0, s / 2);
        ctx.lineTo(s, s / 2);
        ctx.stroke();
    }),

    wood: (n) => drawTexture(n, 256, (ctx, s) => {
        ctx.fillStyle = '#4a3524';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 220; i++) {
            ctx.strokeStyle = `rgba(${28 + Math.random() * 60},${18 + Math.random() * 40},${8 + Math.random() * 26},0.5)`;
            ctx.lineWidth = 0.5 + Math.random() * 2.5;
            const y = Math.random() * s;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(s * 0.3, y + Math.random() * 8 - 4, s * 0.7, y + Math.random() * 8 - 4, s, y);
            ctx.stroke();
        }
    }),

    restroomTile: (n) => drawTexture(n, 256, (ctx, s) => {
        ctx.fillStyle = '#6e7276';
        ctx.fillRect(0, 0, s, s);
        const cell = s / 4;
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                ctx.fillStyle = (x + y) % 2 ? '#797d81' : '#63676b';
                ctx.fillRect(x * cell + 1.5, y * cell + 1.5, cell - 3, cell - 3);
            }
        }
        blotches(ctx, s, 10, 'rgba(30,34,26,0.45)', 6, 26);
    }),

    metal: (n) => drawTexture(n, 128, (ctx, s) => {
        ctx.fillStyle = '#54585d';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 400; i++) {
            ctx.fillStyle = `rgba(${90 + Math.random() * 50},${94 + Math.random() * 50},${100 + Math.random() * 50},0.25)`;
            ctx.fillRect(0, Math.random() * s, s, 0.6);
        }
        blotches(ctx, s, 12, 'rgba(88,44,18,0.4)', 4, 18);
    }),

    // Storm outside the windows. Kept dark so the lightning flash has somewhere to go.
    nightSky: (n) => drawTexture(n, 256, (ctx, s) => {
        const grd = ctx.createLinearGradient(0, 0, 0, s);
        grd.addColorStop(0, '#0b1020');
        grd.addColorStop(0.55, '#141c33');
        grd.addColorStop(1, '#1d2438');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, s, s);
        blotches(ctx, s, 18, 'rgba(60,72,110,0.25)', 20, 90);
        for (let i = 0; i < 900; i++) {
            ctx.strokeStyle = `rgba(150,175,215,${0.05 + Math.random() * 0.18})`;
            ctx.lineWidth = 0.6;
            const x = Math.random() * s;
            const y = Math.random() * s;
            const len = 6 + Math.random() * 22;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 2, y + len);
            ctx.stroke();
        }
    }),

    skin: (n) => drawTexture(n, 128, (ctx, s) => {
        ctx.fillStyle = '#b9a08d';
        ctx.fillRect(0, 0, s, s);
        speckle(ctx, s, 4000, ['#c4ab97', '#ad9482', '#a8887a'], 1.6);
        blotches(ctx, s, 10, 'rgba(120,60,50,0.25)', 6, 24);
    }),

    rottenFlesh: (n) => drawTexture(n, 128, (ctx, s) => {
        ctx.fillStyle = '#9aa08c';
        ctx.fillRect(0, 0, s, s);
        speckle(ctx, s, 6000, ['#8d9380', '#a6ab97', '#7c8270'], 2);
        blotches(ctx, s, 22, 'rgba(70,20,16,0.5)', 5, 26);
        blotches(ctx, s, 14, 'rgba(30,40,20,0.45)', 4, 18);
    }),

    paleFlesh: (n) => drawTexture(n, 128, (ctx, s) => {
        ctx.fillStyle = '#cfc3b6';
        ctx.fillRect(0, 0, s, s);
        speckle(ctx, s, 5000, ['#d8ccc0', '#c1b4a6', '#b6a496'], 1.8);
        blotches(ctx, s, 16, 'rgba(130,40,40,0.35)', 4, 20);
        for (let i = 0; i < 40; i++) {
            ctx.strokeStyle = 'rgba(90,30,34,0.35)';
            ctx.lineWidth = 0.8;
            const x = Math.random() * s;
            const y = Math.random() * s;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.random() * 30 - 15, y + Math.random() * 30 - 15);
            ctx.stroke();
        }
    }),

    shirt: (n) => drawTexture(n, 128, (ctx, s) => {
        ctx.fillStyle = '#dfe3e8';
        ctx.fillRect(0, 0, s, s);
        speckle(ctx, s, 3000, ['#d3d7dc', '#e8ecf1'], 1.2);
        blotches(ctx, s, 6, 'rgba(80,20,16,0.22)', 6, 26);
    })
};

export function surface(name, { repeat = [1, 1], color = 0xffffff, roughness = 0.9, metalness = 0.05, bump = 0.02 } = {}) {
    const map = texture(name, repeat[0], repeat[1]);
    const material = new THREE.MeshStandardMaterial({ map, color, roughness, metalness });
    if (bump > 0) {
        material.bumpMap = map;
        material.bumpScale = bump;
    }
    return material;
}
