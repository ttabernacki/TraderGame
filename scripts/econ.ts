/**
 * Economy regression harness (BUILD_PLAN A2). A measurement, not a test:
 * exits 0 always, except under --check.
 *
 *   npx esbuild scripts/econ.ts --bundle --platform=node --format=cjs --outfile=/tmp/econ.cjs && node /tmp/econ.cjs [--ladder] [--check] [--burthen]
 *
 * Method: every ordered port pair, every good; first sale, single good,
 * relation 0, trade skill 0, markets refreshed 400 days, Crown share ignored.
 * Units per route = min(town stock, destination appetite, hold / bulk).
 */
import { Markets } from '../src/economy/market';
import { PORTS, anchorageOf } from '../src/world/ports';
import { GOODS } from '../src/economy/goods';
import { HULL_CLASSES } from '../src/ship/hull';
import { haversine, NM } from '../src/core/math';

const args = process.argv.slice(2);
const LADDER = args.includes('--ladder');
const CHECK = args.includes('--check');
// --burthen: use the headline burthen (tons: 140/260/480, the design team's convention)
// instead of the real cargo hold (hold: 105/205/400, what the game enforces).
const BURTHEN = args.includes('--burthen');
const cap = (h: { hold: number; tons: number }) => (BURTHEN ? h.tons : h.hold);
const MAX_SPREAD = 8;
const MIN_BIG_VS_SMALL = 2.2;

const T = 86400 * 400;
const m = new Markets(1);
type L = ReturnType<Markets['listings']>[number];
const book = new Map<string, Map<string, L>>();
for (const p of PORTS) {
  m.refresh(p.id, T);
  book.set(p.id, new Map(m.listings(p.id, T, 0, 0).map((l) => [l.goodId, l])));
}

// Stock hulls only: the galleon is gated behind unobtainable standing.
const HULLS = HULL_CLASSES.filter((h) => h.standing < 1e8).sort((a, b) => a.cost - b.cost);
const hull = (id: string) => HULLS.find((h) => h.id === id)!;
const REF = hull('nau-pequena'); // 140 t
const BIG = hull('nau-da-india'); // 480 t

interface Lane { g: string; from: string; to: string; nm: number; margin: number; bulk: number; stock: number; appetite: number; ask: number }
interface Route extends Lane { units: number; cost: number; profit: number }

const lanes: Lane[] = [];
for (const a of PORTS) for (const b of PORTS) {
  if (a.id === b.id) continue;
  const nm = haversine(anchorageOf(a), anchorageOf(b)) / NM;
  for (const g of GOODS) {
    const la = book.get(a.id)!.get(g.id), lb = book.get(b.id)!.get(g.id);
    if (!la || !lb || !la.local || la.stock <= 0 || lb.appetite <= 0) continue;
    const margin = lb.bid - la.ask;
    if (margin <= 0) continue;
    lanes.push({ g: g.id, from: a.id, to: b.id, nm, margin, bulk: g.bulk, stock: la.stock, appetite: lb.appetite, ask: la.ask });
  }
}
const load = (l: Lane, hold: number): Route => {
  const units = Math.min(l.stock, l.appetite, hold / l.bulk);
  return { ...l, units, cost: units * l.ask, profit: units * l.margin };
};
const routesFor = (hold: number) => lanes.map((l) => load(l, hold)).sort((x, y) => y.profit - x.profit);
const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const stats = (rs: Route[]) => {
  const asc = rs.map((r) => r.profit).sort((a, b) => a - b);
  const median = pct(asc, 0.5), top = asc[asc.length - 1];
  return { n: rs.length, median, p90: pct(asc, 0.9), p99: pct(asc, 0.99), top, ratio: top / median };
};
const f = (n: number) => Math.round(n).toLocaleString('en-US');
const id = (s: string, w: number) => s.padEnd(w);

const ref = routesFor(cap(REF));
const s = stats(ref);
console.log(`Economy harness: ${PORTS.length} ports, ${GOODS.length} goods, refresh 400 d, relation 0, skill 0, first sale, no Crown share`);
console.log(`Reference hold: ${REF.name} ${cap(REF)} t`);
console.log(`profitable single-good routes: ${s.n}`);
console.log(`profit  median ${f(s.median)}  p90 ${f(s.p90)}  p99 ${f(s.p99)}  top ${f(s.top)}`);
console.log(`best:median ratio ${s.ratio.toFixed(1)}`);

console.log('\nTop 20 routes (reference hold):');
console.log(`${id('good', 14)}${id('from', 14)}${id('to', 14)}${'nm'.padStart(7)}${'units'.padStart(8)}${'cost'.padStart(9)}${'profit'.padStart(9)}`);
for (const r of ref.slice(0, 20)) {
  console.log(`${id(r.g, 14)}${id(r.from, 14)}${id(r.to, 14)}${f(r.nm).padStart(7)}${f(r.units).padStart(8)}${f(r.cost).padStart(9)}${f(r.profit).padStart(9)}`);
}

// Lanes are fixed (good, from, to) so each hull is compared on the same lane.
const bigRoutes = routesFor(cap(BIG));
const bestLane = bigRoutes[0];
const medianLane = ref[Math.floor(ref.length / 2)];
const perHull = (lane: Lane, label: string) => {
  console.log(`\nPer-hull earnings, ${label}: ${lane.g} ${lane.from} -> ${lane.to} (${f(lane.nm)} nm, stock ${f(lane.stock)}, appetite ${f(lane.appetite)})`);
  console.log(`${id('hull', 20)}${'hold'.padStart(6)}${'units'.padStart(8)}${'cost'.padStart(9)}${'profit'.padStart(9)}`);
  const out = new Map<string, Route>();
  for (const h of HULLS) {
    const r = load(lane, cap(h));
    out.set(h.id, r);
    console.log(`${id(h.id, 20)}${f(cap(h)).padStart(6)}${f(r.units).padStart(8)}${f(r.cost).padStart(9)}${f(r.profit).padStart(9)}`);
  }
  return out;
};
const bestRes = perHull(bestLane, 'best lane (at the largest hull)');
perHull(medianLane, 'median lane (at the reference hull)');

if (LADDER) {
  const targets: Record<string, string> = {
    'barcha': '120-220 / 3', 'caravela-latina': '300-500 / 3', 'caravela-redonda': '500-800 / 3-4',
    'nau-pequena': '1200-1800 / 3-4', 'nau': '2500-3500 / 4', 'nau-da-india': '6000-9000 / 4-6',
  };
  console.log('\nPrice ladder (net = gross profit per voyage; no dues, upkeep or wages)');
  console.log(`${id('hull', 18)}${'price'.padStart(7)}${'hold'.padStart(6)}${'best'.padStart(9)}${'median'.padStart(9)}${'vy best'.padStart(9)}${'vy med'.padStart(9)}   B3 target (net / voyages)`);
  HULLS.forEach((h, i) => {
    const rs = routesFor(cap(h)), st = stats(rs);
    const next = HULLS[i + 1];
    const vb = next ? (next.cost / st.top).toFixed(1) : '-';
    const vm = next ? (next.cost / st.median).toFixed(1) : '-';
    console.log(`${id(h.id, 18)}${f(h.cost).padStart(7)}${f(cap(h)).padStart(6)}${f(st.top).padStart(9)}${f(st.median).padStart(9)}${vb.padStart(9)}${vm.padStart(9)}   ${targets[h.id] ?? '-'}`);
  });
}

const bigVsSmall = bestRes.get(BIG.id)!.profit / bestRes.get(REF.id)!.profit;
console.log(`\n${cap(BIG)} t / ${cap(REF)} t earnings on best lane: ${bigVsSmall.toFixed(2)}x`);
if (CHECK) {
  const fails: string[] = [];
  if (s.ratio > MAX_SPREAD) fails.push(`best:median ${s.ratio.toFixed(1)} > ${MAX_SPREAD}`);
  if (bigVsSmall < MIN_BIG_VS_SMALL) fails.push(`${cap(BIG)} t earns ${bigVsSmall.toFixed(2)}x the ${cap(REF)} t on the best lane (< ${MIN_BIG_VS_SMALL}x)`);
  if (fails.length) { console.log('CHECK FAILED:\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('CHECK PASSED');
}

if (args.includes('--lane')) {
  // --lane <from> <to>: every good on one pair, at the reference hold and the largest.
  const i = args.indexOf('--lane');
  const [fr, to] = [args[i + 1], args[i + 2]];
  for (const l of lanes.filter((x) => x.from === fr && x.to === to)) {
    console.log(`${l.g}: ref ${f(load(l, cap(REF)).profit)}  big ${f(load(l, cap(BIG)).profit)}  stock ${f(l.stock)}`);
  }
}
