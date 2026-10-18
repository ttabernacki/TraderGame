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
import { LOT_TONS, PORT_PROFIT } from '../src/economy/ladder';
import { PORTS, anchorageOf } from '../src/world/ports';
import { GOODS } from '../src/economy/goods';
import { HULL_CLASSES } from '../src/ship/hull';
import { haversine, NM } from '../src/core/math';
import { CASA_SHARE, MONOPOLY, regionOf, type Region } from '../src/economy/trade';

const args = process.argv.slice(2);
// Tuning hooks for sweeps: PP='{"europe":900}' and LT='{"city":600}' override the caps for one run.
if (process.env.PP) Object.assign(PORT_PROFIT, JSON.parse(process.env.PP));
if (process.env.LT) Object.assign(LOT_TONS, JSON.parse(process.env.LT));
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
const REF = hull('nau-pequena'); // 140 t burthen, 105 t of hold
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

const byPair = new Map<string, Lane[]>();
for (const l of lanes) { const k = l.from + '>' + l.to; (byPair.get(k) ?? byPair.set(k, []).get(k)!).push(l); }

// ---------------------------------------------------------------------------
// The price ladder (BUILD_PLAN B3): net per voyage on the lanes a hull can reach.
// ---------------------------------------------------------------------------
// Net, not gross: the load is what the hold has left after the stores for the
// voyage (0.005 t per man-day, game/stores), the buying and selling both pay the
// market's slippage on a big order (Markets.slippage), the Casa keeps its share
// of the King's goods at Lisbon, and the crew's victuals are paid for.
const REACH: Record<string, Region[]> = {
  'barcha': ['europe', 'atlantic', 'maghreb'],
  'caravela-latina': ['europe', 'atlantic', 'maghreb', 'guinea'],
  'caravela-redonda': ['europe', 'atlantic', 'maghreb', 'guinea', 'kongo', 'cape', 'brazil'],
  'nau-pequena': ['europe', 'atlantic', 'maghreb', 'guinea', 'kongo', 'cape', 'brazil', 'swahili'],
  'nau': ['europe', 'atlantic', 'maghreb', 'guinea', 'kongo', 'cape', 'brazil', 'swahili', 'arabia'],
  'nau-da-india': ['europe', 'atlantic', 'maghreb', 'guinea', 'kongo', 'cape', 'brazil', 'swahili', 'arabia', 'india', 'east'],
};
// Net per voyage band and voyages to buy the next hull, from BUILD_PLAN B3.
const BANDS: Record<string, [number, number, string]> = {
  'barcha': [120, 220, '3'], 'caravela-latina': [300, 500, '3'], 'caravela-redonda': [500, 800, '3-4'],
  'nau-pequena': [1200, 1800, '3-4'], 'nau': [2500, 3500, '4'], 'nau-da-india': [6000, 9000, '4-6'],
};
const KNOTS_DAY = 4.5 * 24;
/** Crew wages, cruzados per man per month (game/wages). */
const WAGE_PER_MAN_MONTH = 5;
const slip = (q: number, avail: number) => (avail <= 0 ? 1 : 1 + Math.min(1, q / avail) ** 2 * 0.55);
function voyageDays(nm: number): number { return 2 * (nm / KNOTS_DAY) + 12; }
interface PairNet { net: number; storeT: number; goods: string[] }
/** One voyage on a pair of ports with a mixed cargo, best profit per ton first. */
function pairNet(ls: Lane[], h: { crewFull: number; hold: number; tons: number }): PairNet {
  const days = voyageDays(ls[0].nm);
  const storeT = 0.005 * h.crewFull * days;
  let room = Math.max(0, cap(h) - storeT), total = 0;
  const goods: string[] = [];
  for (const l of [...ls].sort((a, b) => b.margin / b.bulk - a.margin / a.bulk)) {
    const units = Math.floor(Math.min(l.stock, l.appetite, room / l.bulk));
    if (units <= 0) continue;
    const casa = l.to === 'lisboa' && MONOPOLY.includes(l.g) ? CASA_SHARE : 1;
    const bid = l.margin + l.ask;
    const net = (units * bid * casa) / slip(units, l.appetite) - units * l.ask * slip(units, l.stock);
    if (net <= 0) continue;
    room -= units * l.bulk;
    total += net;
    goods.push(l.g);
  }
  return { net: total - days * h.crewFull * (0.012 + WAGE_PER_MAN_MONTH / 30), storeT, goods };
}
const tiers = HULLS.map((h, i) => {
  const ok = new Set(REACH[h.id]);
  const rs = [...byPair.entries()]
    .filter(([, ls]) => ok.has(regionOf(ls[0].from)) && ok.has(regionOf(ls[0].to)))
    .map(([k, ls]) => ({ k, ...pairNet(ls, h) }))
    .sort((a, b) => b.net - a.net);
  const best = rs[0];
  const nets = rs.map((r) => r.net).filter((n) => n > 0).sort((a, b) => a - b);
  const next = HULLS[i + 1];
  return { h, best, median: pct(nets, 0.5), p90: pct(nets, 0.9), voyages: next ? next.cost / best.net : null };
});

if (LADDER) {
  console.log('\nPrice ladder, net per voyage on the lanes each hull can reach (stores in tons, slippage, Casa share)');
  console.log(`${id('hull', 18)}${'price'.padStart(7)}${'hold'.padStart(6)}${'net best'.padStart(10)}${'median'.padStart(8)}${'p90'.padStart(8)}${'vy next'.padStart(9)}  band (net / voyages)    best lane`);
  for (const t of tiers) {
    const [lo, hi, vy] = BANDS[t.h.id];
    const b = t.best;
    console.log(`${id(t.h.id, 18)}${f(t.h.cost).padStart(7)}${f(cap(t.h)).padStart(6)}${f(b.net).padStart(10)}${f(t.median).padStart(8)}${f(t.p90).padStart(8)}${(t.voyages === null ? '-' : t.voyages.toFixed(1)).padStart(9)}  ${String(lo + '-' + hi + ' / ' + vy).padEnd(22)}${b.k} (${b.goods.slice(0, 4).join(',')}; stores ${b.storeT.toFixed(1)} t)`);
  }
}

const bigVsSmall = bestRes.get(BIG.id)!.profit / bestRes.get(REF.id)!.profit;
console.log(`\n${cap(BIG)} t / ${cap(REF)} t earnings on best lane: ${bigVsSmall.toFixed(2)}x`);
console.log(`${cap(BIG)} t / ${cap(REF)} t on the median lane (${medianLane.g} ${medianLane.from}->${medianLane.to}): ${(load(medianLane, cap(BIG)).profit / load(medianLane, cap(REF)).profit).toFixed(2)}x`);

// A voyage carries more than one good. Mixed cargo on one pair of ports: fill the
// hold in order of profit per ton, each good up to what the origin holds and the
// destination takes. Dense lots (stock-capped in money) go in first, staples fill
// what is left, and that is where a bigger hull earns more.
function pairProfit(ls: Lane[], hold: number): number {
  let room = hold, total = 0;
  for (const l of [...ls].sort((a, b) => b.margin / b.bulk - a.margin / a.bulk)) {
    const u = Math.min(l.stock, l.appetite, room / l.bulk);
    if (u <= 0) continue;
    room -= u * l.bulk;
    total += u * l.margin;
  }
  return total;
}
const pairs = [...byPair.entries()].map(([k, ls]) => ({ k, ls, ref: pairProfit(ls, cap(REF)), big: pairProfit(ls, cap(BIG)) })).filter((p) => p.ref > 0);
pairs.sort((a, b) => a.ref - b.ref);
const bestPair = pairs.reduce((a, b) => (b.big > a.big ? b : a));
const medPair = pairs[Math.floor(pairs.length / 2)];
const mixBest = bestPair.big / bestPair.ref, mixMed = medPair.big / medPair.ref;
console.log(`Mixed cargo, ${pairs.length} port pairs: best pair ${bestPair.k} ${f(bestPair.ref)} -> ${f(bestPair.big)} (${mixBest.toFixed(2)}x); median pair ${medPair.k} ${f(medPair.ref)} -> ${f(medPair.big)} (${mixMed.toFixed(2)}x)`);
const pairAsc = pairs.map((p) => p.ref);
console.log(`pair profit at ${cap(REF)} t: median ${f(medPair.ref)}  p90 ${f(pct(pairAsc, 0.9))}  top ${f(pairAsc[pairAsc.length - 1])}`);

// Pearls from Ormuz to Cambay: the hop that was 66,000 in one leg.
const pearls = lanes.find((l) => l.g === 'perolas' && l.from === 'ormuz' && l.to === 'cambaia');
if (pearls) {
  const gross = load(pearls, cap(BIG)).profit;
  console.log(`Ormuz -> Cambay pearls, one leg: ${f(gross)} gross at ${cap(BIG)} t (was 66,175)`);
}

// Ports at zero stock, and prices out of band, over every port and good.
let zero = 0, off = 0;
for (const p of PORTS) for (const g of GOODS) {
  const l = book.get(p.id)!.get(g.id);
  if (!l) continue;
  if (l.local && l.stock <= 0) zero++;
  if (!(l.ask > 0) || !(l.bid > 0) || l.bid > g.lisbon * 4 || l.ask > g.lisbon * 4) off++;
}
console.log(`ports/goods at zero stock: ${zero}; prices out of band: ${off}`);

if (args.includes('--json')) {
  console.log('JSON ' + JSON.stringify({
    ratio: s.ratio, bigVsSmall, mixBest, mixMed, median: s.median, top: s.top,
    tiers: tiers.map((t) => ({ id: t.h.id, net: Math.round(t.best.net), vy: t.voyages, lane: t.best.k })),
  }));
}

if (CHECK) {
  const fails: string[] = [];
  if (s.ratio > MAX_SPREAD) fails.push(`best:median ${s.ratio.toFixed(1)} > ${MAX_SPREAD}`);
  if (bigVsSmall < MIN_BIG_VS_SMALL) fails.push(`${cap(BIG)} t earns ${bigVsSmall.toFixed(2)}x the ${cap(REF)} t on the best lane (< ${MIN_BIG_VS_SMALL}x)`);
  if (mixBest < MIN_BIG_VS_SMALL) fails.push(`mixed cargo, best pair: ${cap(BIG)} t earns ${mixBest.toFixed(2)}x the ${cap(REF)} t (< ${MIN_BIG_VS_SMALL}x)`);
  if (mixMed < 1.4) fails.push(`mixed cargo, median pair: ${cap(BIG)} t earns ${mixMed.toFixed(2)}x the ${cap(REF)} t (< 1.4x)`);
  for (const t of tiers) {
    const [lo, hi] = BANDS[t.h.id];
    if (t.best.net < lo * 0.9 || t.best.net > hi * 1.1) fails.push(`${t.h.id} nets ${f(t.best.net)} per voyage, band ${lo}-${hi}`);
    if (t.voyages !== null && (t.voyages < 2 || t.voyages > 6.5)) fails.push(`${t.h.id} buys the next hull in ${t.voyages.toFixed(1)} voyages (2-6.5)`);
  }
  if (zero > 0) fails.push(`${zero} port goods at zero stock`);
  if (off > 0) fails.push(`${off} prices out of band`);
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

if (args.includes('--mid')) {
  // Lanes around the median at the reference hold: why are they small?
  const n = ref.length, m = Math.floor(n / 2);
  console.log('\nLanes around the median (reference hold): good from to units stock appetite margin bound-by');
  for (const r of ref.slice(m - 12, m + 12)) {
    const by = r.units === r.stock ? 'stock' : r.units === r.appetite ? 'appetite' : 'hold';
    console.log(`${id(r.g, 11)}${id(r.from, 13)}${id(r.to, 13)}${f(r.units).padStart(6)} stock ${f(r.stock).padStart(6)} app ${f(r.appetite).padStart(6)} m ${r.margin.toFixed(1).padStart(6)} ${by.padStart(8)} ${f(r.profit).padStart(6)}`);
  }
  const bound = { stock: 0, appetite: 0, hold: 0 };
  for (const r of ref) bound[r.units === r.stock ? 'stock' : r.units === r.appetite ? 'appetite' : 'hold']++;
  console.log('bound by', JSON.stringify(bound));
}
