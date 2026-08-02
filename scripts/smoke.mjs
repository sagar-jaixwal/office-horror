// Headless smoke test against the Heilwald building map.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const gameUrl = process.env.GAME_URL || 'http://localhost:5183/?lowspec=1';
const OUT = new URL('../.smoke/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    protocolTimeout: 240000,
    args: [
        '--no-sandbox',
        '--enable-unsafe-swiftshader',
        '--use-gl=angle',
        '--use-angle=swiftshader'
    ]
});

const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540 });

const problems = [];
const record = (line) => {
    problems.push(line);
    process.stdout.write(`${line}\n`);
};
page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') record(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => record(`[pageerror] ${err.message}\n${err.stack}`));
page.on('requestfailed', (req) => record(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`));

async function ready() {
    await page.waitForFunction(
        () => Boolean(window.__debug) && !document.getElementById('start-button').disabled,
        { timeout: 180000 }
    );
    await page.evaluate(() => {
        window.__debug.forceResume();
        window.__debug.setFlashlight(true);
    });
}

await page.goto(gameUrl, { waitUntil: 'domcontentloaded' });
await ready();

const shots = [
    ['01-spawn', () => {
        const s = window.__debug.stats().spawn;
        window.__debug.teleport(s.x, s.z, 0);
    }],
    ['02-monster-acid', () => window.__debug.poseMonster(0, 3.4)],
    ['03-monster-crawler', () => window.__debug.poseMonster(1, 3.4)],
    ['04-look-around', () => {
        const s = window.__debug.stats().spawn;
        window.__debug.teleport(s.x, s.z, Math.PI * 0.5);
    }]
];

for (const [name, setup] of shots) {
    await ready();
    await page.evaluate(setup);
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: `${OUT}${name}.png` });
    process.stdout.write(`captured ${name}\n`);
}

await ready();
console.log('stats:', JSON.stringify(await page.evaluate(() => window.__debug.stats()), null, 2));

await browser.close();

if (problems.length) {
    console.log('\n--- PROBLEMS ---');
    for (const p of problems) console.log(p);
    process.exitCode = 1;
} else {
    console.log('\nNo console errors, warnings or failed requests.');
}
