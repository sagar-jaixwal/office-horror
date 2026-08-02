// Turns the raw Sketchfab downloads in assets-src/ into the runtime models in
// public/models/.  Two things make this necessary:
//
//  * Both exports describe their materials only with KHR_materials_pbrSpecular-
//    Glossiness, which three.js dropped. Without conversion every character
//    renders as untextured white.
//  * The crawler ships at 187k triangles and 12 MB, which is far more than a
//    game with several of them on screen can afford on integrated graphics.
//
//   npm run models
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
        source: 'the_character_of_an_office_worker.glb',
        // 17k triangles already; only the material workflow needs fixing.
        steps: []
    },
    {
        name: 'garden_crawler.glb',
        source: 'garden_crawler.glb',
        // No webp step: it lands the textures behind a required EXT_texture_webp
        // that leaves the creature untextured white, and only saved 0.07 MB.
        steps: [
            ['simplify', '--ratio', '0.3', '--error', '0.002'],
            ['resize', '--width', '1024', '--height', '1024']
        ]
    }
];

for (const job of jobs) {
    const input = join(src, job.source);
    console.log(`\n--- ${job.source} (${mb(input)})`);

    let current = join(tmp, `${job.name}.0.glb`);
    cli('metalrough', input, current);

    job.steps.forEach(([command, ...args], index) => {
        const next = join(tmp, `${job.name}.${index + 1}.glb`);
        cli(command, current, next, ...args);
        current = next;
    });

    const destination = join(out, job.name);
    cli('copy', current, destination);
    console.log(`--> public/models/${job.name} (${mb(destination)})`);
}

rmSync(tmp, { recursive: true, force: true });
