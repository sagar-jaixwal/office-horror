// Turns raw Sketchfab downloads in assets-src/ (and public gun source) into
// runtime models in public/models/: metalrough conversion, mesh simplify,
// texture resize, and Draco compression for faster Vite loads.
//
//   npm run models
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets-src');
const out = join(root, 'public', 'models');
const tmp = join(root, 'node_modules', '.cache', 'models');

mkdirSync(out, { recursive: true });
mkdirSync(tmp, { recursive: true });

const cli = (...args) => execFileSync('npx', ['gltf-transform', ...args], { stdio: 'inherit', cwd: root });
const mb = (path) => `${(statSync(path).size / 1e6).toFixed(2)} MB`;

const jobs = [
    {
        name: 'office_worker.glb',
        source: join(src, 'the_character_of_an_office_worker.glb'),
        steps: [],
        draco: true
    },
    {
        name: 'garden_crawler.glb',
        source: join(src, 'garden_crawler.glb'),
        steps: [
            // Aggressive simplify for mobile WebGL (skinned mesh is expensive).
            ['simplify', '--ratio', '0.12', '--error', '0.004'],
            ['resize', '--width', '512', '--height', '512']
        ],
        draco: true
    },
    {
        name: 'the_heilwald_loophole_randolphs_office.glb',
        source: join(src, 'the_heilwald_loophole_randolphs_office.glb'),
        steps: [],
        draco: true
    },
    {
        // Only rebuild from assets-src — never re-simplify the already-optimized public file.
        name: 'nerf_gun.glb',
        source: join(src, 'nerf_gun.glb'),
        steps: [
            ['simplify', '--ratio', '0.04', '--error', '0.005'],
            ['resize', '--width', '512', '--height', '512']
        ],
        draco: true
    }
];

for (const job of jobs) {
    const input = job.source;
    if (!existsSync(input)) {
        console.warn(`skip ${job.name}: missing ${input}`);
        continue;
    }

    console.log(`\n--- ${job.name} (${mb(input)})`);

    let current = join(tmp, `${job.name}.0.glb`);
    try {
        cli('metalrough', input, current);
    } catch {
        copyFileSync(input, current);
    }

    job.steps.forEach(([command, ...args], index) => {
        const next = join(tmp, `${job.name}.${index + 1}.glb`);
        cli(command, current, next, ...args);
        current = next;
    });

    const destination = join(out, job.name);
    if (job.draco) {
        cli('draco', current, destination);
    } else {
        cli('copy', current, destination);
    }
    console.log(`--> public/models/${job.name} (${mb(destination)})`);
}

rmSync(tmp, { recursive: true, force: true });
