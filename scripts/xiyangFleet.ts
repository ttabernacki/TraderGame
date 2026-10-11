/**
 * The fleet in the game: sail the flagship out of Changle toward Champa and watch the consorts.
 * CAMPAIGN=xiyang npx esbuild scripts/xiyangFleet.ts --bundle --platform=node --format=cjs --outfile=/tmp/xf.cjs && CAMPAIGN=xiyang node /tmp/xf.cjs
 */
import { Game } from '../src/game/state';
import { slotError } from '../src/fleet/formation';

let bad = 0;
const check = (name: string, ok: boolean, extra = ''): void => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) bad++; };

for (const scale of [2, 5, 7]) {
  const g = new Game(3, 'xiyang');
  g.mode = 'sailing';
  g.dockedAt = 'changle';
  g.weighAnchor();
  // Offshore, clear of the land the clock slows down near.
  g.ship.state.pos = { lat: 24.2, lon: 120.9 };
  g.setDestinationPort('vijaya');
  g.clock.scaleIndex = scale;
  let maxErr = 0, maxDist = 0, nan = false, minSpeed = 99;
  for (let i = 0; i < 6000; i++) {
    g.update(0.05);
    const f = g.fleet!.formation;
    if (!f) continue;
    for (const c of f.consorts) {
      if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) nan = true;
      maxDist = Math.max(maxDist, Math.hypot(c.x - (g.fleet as any).fx, c.y - (g.fleet as any).fy));
    }
    if (i > 3000) {
      const fl = { x: (g.fleet as any).fx, y: (g.fleet as any).fy, hdg: (g.fleet as any).lastHdg ?? 0, spd: g.physics.groundKnots * 0.514 };
      for (const c of f.consorts) maxErr = Math.max(maxErr, slotError(fl, c));
    }
    minSpeed = Math.min(minSpeed, g.physics.groundKnots);
  }
  const sailed = g.nav.estimated;
  check(`scale ${scale}: no NaN in the fleet`, !nan);
  check(`scale ${scale}: every ship within a cable of her place once settled`, maxErr < 185.2, `(${maxErr.toFixed(0)} m)`);
  check(`scale ${scale}: the whole fleet stays within three miles of the flag`, maxDist < 5600, `(${maxDist.toFixed(0)} m)`);
  console.log(`   flagship at ${g.ship.state.pos.lat.toFixed(2)}, ${g.ship.state.pos.lon.toFixed(2)}; fleet limit ${Number.isFinite(g.fleet!.limitMs) ? (g.fleet!.limitMs / 0.514).toFixed(1) + ' kn' : 'none'}; settled error ${maxErr.toFixed(0)} m; day ${g.clock.formatDate()} ${sailed.lat.toFixed(1)}`);
}
// A save carries the fleet.
{
  const g = new Game(4, 'xiyang');
  const h = Game.deserialize(g.serialize());
  check('the fleet and the campaign survive a save', h.campaign === 'xiyang' && h.fleet?.ships.length === g.fleet?.ships.length);
}
// Orders: the shape and spacing change, and the ships sail to their new places rather than jumping.
{
  const g = new Game(6, 'xiyang');
  g.mode = 'sailing'; g.dockedAt = 'changle'; g.weighAnchor();
  g.ship.state.pos = { lat: 24.2, lon: 120.9 };
  g.clock.scaleIndex = 6;
  for (let i = 0; i < 400; i++) g.update(0.05);
  const f = g.fleet!;
  const before = f.formation!.consorts.map((c) => ({ x: c.x, y: c.y }));
  const said = g.fleetOrder('shape');
  check('the shape order is answered', /line abreast/.test(said) && f.shape === 'line', said);
  const after = f.formation!.consorts.map((c) => ({ x: c.x, y: c.y }));
  check('a new formation is not a jump', before.every((b, i) => Math.hypot(b.x - after[i].x, b.y - after[i].y) < 1));
  let maxStep = 0;
  for (let i = 0; i < 200; i++) {
    const p0 = f.formation!.consorts.map((c) => ({ x: c.x, y: c.y }));
    g.update(0.05);
    const dt = g.clock.scale * 0.05;
    f.formation!.consorts.forEach((c, k) => { maxStep = Math.max(maxStep, Math.hypot(c.x - p0[k].x, c.y - p0[k].y) / Math.max(dt, 1e-6)); });
  }
  check('ships sail to their new places at ship speeds', maxStep < 14, `(${maxStep.toFixed(1)} m/s)`);
  const t0 = g.fleetOrder('together');
  check('keep-together toggles the master\u2019s hold', !f.keepTogether && /press on/.test(t0));
}
process.exit(bad ? 1 : 0);
