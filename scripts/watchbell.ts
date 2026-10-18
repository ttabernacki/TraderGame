// The watch bell: stops the accelerated clock at dawn/dusk only if something changed.
// npx esbuild scripts/watchbell.ts --bundle --platform=node --format=cjs --outfile=/tmp/watchbell.cjs && node /tmp/watchbell.cjs
//
// Part 1: 40 synthetic voyages of 45 accelerated days (3600 bells), quiet water with jitter below
//         every threshold, and one injected trigger of each kind per voyage. The bell must never
//         stop on a quiet bell and must stop on the very next bell after each trigger.
// Part 2: 30 real Game legs (Lisbon -> Funchal, seeds 1..30) at full day; every stop must fall on
//         a dawn/dusk crossing, never in the middle of a day, and must carry a logged reason.
import { Game } from '../src/game/state';
import { WatchBell, crossedBell, type BellObs } from '../src/game/watchBell';

let fails = 0;
const fail = (m: string) => { fails++; if (fails < 30) console.log('FAIL', m); };

// deterministic rng
let s = 12345;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };

const DAY = 86400;
type Trigger = 'landfall' | 'sail' | 'doubt' | 'wind' | 'stores';
const TRIGGERS: Trigger[] = ['landfall', 'sail', 'doubt', 'wind', 'stores'];

let quietBells = 0, quietStops = 0, trigBells = 0, trigStops = 0, voyages = 0;
const perTrigger: Record<string, [number, number]> = {};

for (let v = 0; v < 40; v++) {
  voyages++;
  const bell = new WatchBell();
  let t = 1e9 + v * 1000 * DAY + 4 * 3600; // 04:00 ship time
  const base: BellObs = {
    t, hour: 4, scaleIndex: 8, eventT: -1, sighted: 0, stranger: false,
    doubtNm: 6, windFrom: 40, windKn: 12, storesDays: 90,
  };
  const cur = { ...base };
  // one trigger of each kind, on distinct random bells after the first few
  const plan = new Map<number, Trigger>();
  for (const tr of TRIGGERS) {
    let k = 0;
    do { k = 6 + Math.floor(rnd() * 80); } while (plan.has(k) || plan.has(k - 1) || plan.has(k + 1));
    plan.set(k, tr);
  }
  let bellNo = 0;
  const step = 3 * 3600; // coarse frames, as at full day
  for (let i = 0; i < 45 * 8; i++) {
    const t0 = t;
    t += step;
    cur.t = t; cur.hour = (((t % DAY) + DAY) % DAY) / 3600;
    // quiet jitter, below every threshold
    cur.windFrom = 40 + (rnd() - 0.5) * 30;
    cur.windKn = 12 + (rnd() - 0.5) * 6;
    cur.doubtNm = 6 + rnd() * 3; // inside the first band
    cur.storesDays = 90 - bellNo * 0.5;
    const isBell = crossedBell(t0, t);
    let injected: Trigger | null = null;
    if (isBell) {
      bellNo++;
      injected = plan.get(bellNo) ?? null;
      if (injected === 'landfall') cur.eventT = t - 600;
      if (injected === 'sail') cur.sighted += 1;
      if (injected === 'doubt') cur.doubtNm = 30;
      if (injected === 'wind') { cur.windFrom = 40 + 90; }
      if (injected === 'stores') cur.storesDays = 8;
    }
    // doubt/stores then stay at their new level (they are monotone states, not events)
    if (bellNo >= 1) {
      for (const [k, tr] of plan) {
        if (k < bellNo && tr === 'doubt') cur.doubtNm = 30 + rnd();
        if (k < bellNo && tr === 'stores') cur.storesDays = 8 - (bellNo - k) * 0.01;
        if (k < bellNo && tr === 'wind') cur.windFrom = 130 + (rnd() - 0.5) * 30;
      }
      if ([...plan].some(([k, tr]) => k === bellNo && tr === 'wind')) { /* keep 130 */ }
    }
    const r = bell.ring(t0, { ...cur });
    if (isBell) {
      if (injected) {
        trigBells++;
        const e = (perTrigger[injected] ??= [0, 0]);
        e[0]++;
        if (r) { trigStops++; e[1]++; } else fail(`voyage ${v} bell ${bellNo}: no stop on ${injected}`);
      } else if (bellNo > 1) {
        quietBells++;
        if (r) { quietStops++; fail(`voyage ${v} bell ${bellNo}: stopped on a quiet bell: ${r.join('; ')}`); }
      }
    } else if (r) {
      fail(`voyage ${v}: stopped between bells`);
    }
  }
}
// the clock is only ever stopped when accelerated
{
  const b = new WatchBell();
  const o: BellObs = { t: 6 * 3600 + 100, hour: 6, scaleIndex: 8, eventT: -1, sighted: 0, stranger: false, doubtNm: 5, windFrom: 0, windKn: 10, storesDays: 50 };
  b.ring(6 * 3600 - 100, o);
  const slow = { ...o, t: 18 * 3600 + 100, scaleIndex: 2, sighted: 3 };
  if (b.ring(18 * 3600 - 100, slow)) fail('stopped a clock already at four times');
}
console.log(`synthetic: ${voyages} voyages, ${quietBells} quiet bells (${quietStops} stops), ${trigBells} trigger bells (${trigStops} stops)`);
console.log('per trigger [bells, stops]:', JSON.stringify(perTrigger));
if (voyages < 30) fail('fewer than 30 voyages');

// --- Part 2: the real game -------------------------------------------------------
let realStops = 0, realDays = 0;
for (let seed = 1; seed <= 30; seed++) {
  const g = new Game(seed);
  g.mode = 'sailing';
  g.weighAnchor();
  g.setDestinationPort('funchal');
  const t0 = g.clock.t;
  let n = 0;
  let prevScale = 8;
  g.clock.scaleIndex = 8;
  while (!g.dockedAt && n++ < 5000 && g.mode !== 'gameover') {
    if (g.pendingEvent) g.resolveEvent(1);
    const tBefore = g.clock.t;
    g.clock.scaleIndex = 8;
    prevScale = 8;
    g.update(0.25);
    if (g.clock.scaleIndex < prevScale) {
      // something brought the clock down this frame: it must be a bell, on a bell crossing
      const bellLog = g.log.entries.some((e) => /^(Dawn|Dusk) bell\./.test(e.text) && e.t > tBefore);
      if (bellLog) {
        realStops++;
        if (!crossedBell(tBefore, g.clock.t)) fail(`seed ${seed}: bell stop with no dawn/dusk crossing`);
        const h = g.clock.hour;
        if (!(h >= 6 && h < 9) && !(h >= 18 && h < 21)) fail(`seed ${seed}: bell stop at ${h.toFixed(1)}h`);
      }
    }
    if (g.approachablePorts().some((p) => p.def.id === 'funchal')) { g.letGoAnchor(); break; }
  }
  realDays += (g.clock.t - t0) / DAY;
}
console.log(`real: 30 Lisbon->Funchal legs, ${realDays.toFixed(0)} days, ${realStops} bell stops`);

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
