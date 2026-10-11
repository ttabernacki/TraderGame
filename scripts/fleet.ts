/**
 * Checks for the fleet-sailing engine. Run: npx esbuild scripts/fleet.ts --bundle --platform=node --format=cjs --outfile=/tmp/fleet.cjs && node /tmp/fleet.cjs
 * Targets (docs/DESIGN.md): on a steady course no consort is more than a cable from its slot at any clock rate;
 * the drawn speed of a consort relative to the flag stays under about 3 m/s; a tack ripples through forty ships
 * in under a minute; a slow class drops astern when the flagship will not wait; frame time stays tiny.
 */
import { CABLE, fleetSpeedCap, newFleet, slotError, stepFleet, type Flag, type HullClass } from '../src/fleet/formation';

let bad = 0;
const check = (name: string, ok: boolean, extra = ''): void => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) bad++; };
const FAST: HullClass = { id: 'war', speedFactor: 1, turnRate: 4 };
const TREASURE: HullClass = { id: 'treasure', speedFactor: 1, turnRate: 3.2 };
const HORSE: HullClass = { id: 'horse', speedFactor: 0.8, turnRate: 2.8 };
const forty = (): HullClass[] => Array.from({ length: 40 }, (_, i) => (i % 5 === 0 ? FAST : i % 5 === 4 ? HORSE : TREASURE));

function run(classes: HullClass[], dt: number, seconds: number, steer?: (t: number, flag: Flag) => void, keep = true) {
  const flag: Flag = { x: 0, y: 0, hdg: 0.3, spd: 6 };
  const fleet = newFleet(flag, classes, 'crescent', 'close');
  fleet.keepTogether = keep;
  // Start at the speed the master will hold, so the test measures the steady state and not the start.
  flag.spd = fleetSpeedCap(fleet, 6);
  for (const c of fleet.consorts) c.spd = flag.spd;
  fleet.history = [{ t: 0, f: { ...flag } }];
  let seed = 7; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (const c of fleet.consorts) { c.x += (rnd() - 0.5) * 600; c.y += (rnd() - 0.5) * 600; }
  let maxErr = 0, maxRel = 0;
  for (let t = 0; t < seconds; t += dt) {
    steer?.(t, flag);
    flag.spd = fleetSpeedCap(fleet, 6);
    flag.x += Math.sin(flag.hdg) * flag.spd * dt; flag.y += Math.cos(flag.hdg) * flag.spd * dt;
    const before = fleet.consorts.map((c) => ({ x: c.x, y: c.y }));
    stepFleet(fleet, flag, dt, 6);
    if (t > 0) {
      for (let i = 0; i < fleet.consorts.length; i++) {
        const c = fleet.consorts[i];
        if (t > 2400) maxErr = Math.max(maxErr, slotError(flag, c));
        // Drawn speed relative to the flag over this step.
        const rel = Math.hypot((c.x - before[i].x) - Math.sin(flag.hdg) * flag.spd * dt, (c.y - before[i].y) - Math.cos(flag.hdg) * flag.spd * dt) / dt;
        maxRel = Math.max(maxRel, rel);
      }
    }
  }
  return { fleet, flag, maxErr, maxRel };
}

// A steady course at a frame, a second, a watch-hour step and a half-minute step.
for (const dt of [1 / 60, 1, 10, 60]) {
  const r = run(forty(), dt, 5 * 3600);
  check(`steady course, dt ${dt.toFixed(3)} s: every ship within a cable`, r.maxErr <= CABLE, `(max ${r.maxErr.toFixed(0)} m)`);
  check(`steady course, dt ${dt.toFixed(3)} s: relative speed under 3 m/s`, r.maxRel <= 3, `(max ${r.maxRel.toFixed(2)} m/s)`);
}

// A full tack: the order ripples through a forty-ship crescent in under a minute of game time.
{
  const classes = forty();
  const flag: Flag = { x: 0, y: 0, hdg: 0.3, spd: 6 };
  const fleet = newFleet(flag, classes, 'crescent', 'close');
  const dt = 0.5;
  for (let t = 0; t < 900; t += dt) { flag.x += Math.sin(flag.hdg) * 6 * dt; flag.y += Math.cos(flag.hdg) * 6 * dt; stepFleet(fleet, flag, dt, 6); }
  const target = flag.hdg + Math.PI / 2;
  let turnedAt = -1;
  const t0 = fleet.t;
  for (let t = 0; t < 240; t += dt) {
    // The flagship comes round at 3 degrees a second.
    flag.hdg = Math.min(target, flag.hdg + (3 * Math.PI / 180) * dt);
    flag.x += Math.sin(flag.hdg) * 6 * dt; flag.y += Math.cos(flag.hdg) * 6 * dt;
    stepFleet(fleet, flag, dt, 6);
    const all = fleet.consorts.every((c) => Math.abs(Math.atan2(Math.sin(c.hdg - target), Math.cos(c.hdg - target))) < 10 * Math.PI / 180);
    if (all && turnedAt < 0) turnedAt = fleet.t - t0;
  }
  check('a tack ripples through forty ships in under a minute', turnedAt > 0 && turnedAt < 60, `(${turnedAt.toFixed(0)} s)`);
}

// The slow class: held together by the master, or left astern if he presses on.
{
  const held = run(forty(), 10, 4 * 3600, undefined, true);
  check('keeping together, the horse ships keep their place', held.maxErr <= CABLE, `(max ${held.maxErr.toFixed(0)} m, flag ${held.flag.spd.toFixed(2)} m/s)`);
  const pressed = run(forty(), 10, 4 * 3600, undefined, false);
  const worst = Math.max(...pressed.fleet.consorts.map((c) => slotError(pressed.flag, c)));
  check('pressing on, the slow class drops out of sight astern', worst > 3000, `(${worst.toFixed(0)} m after four hours)`);
}

// Cost: forty ships at frame rate.
{
  const flag: Flag = { x: 0, y: 0, hdg: 0.3, spd: 6 };
  const fleet = newFleet(flag, forty(), 'crescent', 'close');
  const t0 = process.hrtime.bigint();
  const N = 20000;
  for (let i = 0; i < N; i++) { flag.x += 0.1; stepFleet(fleet, flag, 1 / 60, 6); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  check('forty ships cost far under a millisecond a frame', ms < 0.2, `(${(ms * 1000).toFixed(1)} µs)`);
}
process.exit(bad ? 1 : 0);
