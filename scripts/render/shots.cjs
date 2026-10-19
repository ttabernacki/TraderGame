/*
 * Deterministic render harness. Usage:
 *   node scripts/render/shots.cjs <outDir> <label> [scenes=a,b] [tier=medium] [legacy=0|1] [w=960] [h=540] [cam=chase] [hull=nau]
 * Bundles shots.ts with esbuild, loads it from file:// in swiftshader chromium, saves PNGs
 * <outDir>/<scene>-<label>.png and prints renderer.info stats as JSON lines.
 * Needs playwright-core: NODE_PATH=/tmp/sc/vis/node_modules
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
const args = Object.fromEntries(process.argv.slice(4).map((a) => a.split('=')));
const [outDir, label] = [process.argv[2], process.argv[3]];
const root = path.resolve(__dirname, '../..');
const build = process.env.SHOTS_BUILD || '/tmp/render-harness';
fs.mkdirSync(build, { recursive: true }); fs.mkdirSync(outDir, { recursive: true });
execSync(`npx esbuild scripts/render/shots.ts --bundle --format=iife --platform=browser --outfile=${build}/shots.js --log-level=error`, { cwd: root, stdio: 'inherit' });
fs.copyFileSync(path.join(__dirname, 'index.html'), build + '/index.html');
(async () => {
  const w = +(args.w || 960), h = +(args.h || 540);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--headless=old'] });
  let p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text().slice(0, 400)); });
  await p.goto('file://' + build + '/index.html');
  await p.evaluate((o) => window.setup(o), { w, h });
  const scenes = (args.scenes || 'noon').split(',');
  for (const s of scenes) {
    if (args.seq === '1') { await p.close(); p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 }); p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message)); await p.goto('file://' + build + '/index.html'); await p.evaluate((o) => window.setup(o), { w, h }); }
    const opts = { tier: args.tier, legacy: args.legacy === '1', cam: args.cam, hull: args.hull, sign: args.sign ? +args.sign : 1, frames: args.frames ? +args.frames : undefined, n: args.n ? +args.n : undefined, w, h, yawRate: args.yaw ? +args.yaw : 0, pitchRate: args.pitch ? +args.pitch : 0 };
    const fn = args.seq === '1' ? 'seq' : 'shoot';
    if (fn === 'seq' && args.ref === '1') {
      // ground truth: the same sequence at 3x, from a fresh page so the water starts from the same state
      const p2 = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await p2.goto('file://' + build + '/index.html');
      await p2.evaluate((o) => window.setup(o), { w, h });
      const refd = await p2.evaluate(([s, o]) => window.seq(s, o), [s, { ...opts, refOnly: true }]);
      opts.refLuma = refd.luma; await p2.close();
    }
    const stats = await p.evaluate(([s, o, fn]) => window[fn](s, o), [s, opts, fn]);
    await p.locator('#c').screenshot({ path: path.join(outDir, `${s}-${label}.png`), timeout: 240000 });
    console.log(JSON.stringify({ scene: s, label, ...stats }));
  }
  if (errs.length) console.log('ERRORS', [...new Set(errs)].slice(0, 10));
  await b.close();
})();
