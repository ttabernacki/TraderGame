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
import { LOT_TONS, STAPLE_DEMAND, PORT_DEMAND, PORT_PROFIT, isStaple } from '../src/economy/ladder';
import { PORTS, anchorageOf } from '../src/world/ports';
import { GOODS } from '../src/economy/goods';
import { HULL_CLASSES } from '../src/ship/hull';
import { haversine, NM } from '../src/core/math';
import { CASA_SHARE, MONOPOLY, regionOf, type Region } from '../src/economy/trade';

const args = process.argv.slice(2);
// Tuning hooks for sweeps: PP='{"europe":900}' and LT='{"city":600}' override the caps for one run.
if (process.env.PP) Object.assign(PORT_PROFIT, JSON.parse(process.env.PP));
if (process.env.PD) Object.assign(PORT_DEMAND, JSON.parse(process.env.PD));
if (process.env.SD) Object.assign(STAPLE_DEMAND, JSON.parse(process.env.SD));
if (process.env.LT) Object.assign(LOT_TONS, JSON.parse(process.env.LT));
const LADDER = args.includes('--ladder');
const CHECK = args.includes('--check');
// --burthen: use the headline burthen (tons: 140/260/480, the design team's convention)
// instead of the real cargo hold (hold: 105/205/400, what the game enforces).
const BURTHEN = args.includes('--burthen');
const cap = (h: { hold: number; tons: number }) => (BURTHEN ? h.tons : h.hold);
const MAX_SPREAD = 10;
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
let TRACE = false;
const KNOTS_DAY = 4.5 * 24;
/** Crew wages, cruzados per man per month (game/wages). */
const WAGE_PER_MAN_MONTH = Number(process.env.WAGE ?? 4);
const slip = (q: number, avail: number) => (avail <= 0 ? 1 : 1 + Math.min(1, q / avail) ** 2 * 0.55);
function voyageDays(nm: number): number { return 2 * (nm / KNOTS_DAY) + 12; }
interface PairNet { net: number; storeT: number; goods: string[]; out: number; back: number }
/** One leg with a mixed cargo, best profit per ton first; returns the money and the goods. */
function legNet(ls: Lane[], h: { crewFull: number; hold: number; tons: number }, storeT: number): { total: number; goods: string[] } {
  let room = Math.max(0, cap(h) - storeT), total = 0;
  const goods: string[] = [];
  for (const l of [...ls].sort((a, b) => b.margin / b.bulk - a.margin / a.bulk)) {
    const units = Math.floor(Math.min(l.stock, l.appetite, room / l.bulk));
    if (units <= 0) continue;
    const casa = l.to === 'lisboa' && MONOPOLY.includes(l.g) ? CASA_SHARE : 1;
    const bid = l.margin + l.ask;
    const net = (units * bid * casa) / slip(units, l.appetite) - units * l.ask * slip(units, l.stock);
    if (net <= 0) continue;
    if (TRACE) console.log(`  ${l.from}>${l.to} ${l.g}: ${units} units (stock ${Math.round(l.stock)}, appetite ${Math.round(l.appetite)}) ask ${l.ask.toFixed(1)} bid ${bid.toFixed(1)} net ${Math.round(net)}`);
    room -= units * l.bulk;
    total += net;
    goods.push(l.g);
  }
  return { total, goods };
}
/**
 * A voyage is out and home again on a pair of ports: a cargo each way, the
 * stores for both legs and the port days between, and the crew's wages for all of it.
 */
function pairNet(a: string, b: string, h: { crewFull: number; hold: number; tons: number }): PairNet {
  const out = byPair.get(a + '>' + b) ?? [], back = byPair.get(b + '>' + a) ?? [];
  const nm = (out[0] ?? back[0]).nm;
  const days = voyageDays(nm);
  const storeT = 0.005 * h.crewFull * days;
  const o = legNet(out, h, storeT), r = legNet(back, h, storeT);
  return { net: o.total + r.total - days * h.crewFull * (0.012 + WAGE_PER_MAN_MONTH / 30), storeT, goods: [...o.goods.slice(0, 3), '|', ...r.goods.slice(0, 3)], out: o.total, back: r.total };
}
/**
 * A tour: out from Lisbon to the first stop, along the coast to the others (5 port
 * days and a short hop each), home with one cargo made from what every stop holds.
 * The destination's appetite is shared across the stops, so Lisbon cannot be sold
 * the same pepper three times. This is how a Nau da India is actually loaded: one
 * Cochim yard does not fill 400 t.
 */
function tourNet(stops: string[], h: { crewFull: number; hold: number; tons: number }): PairNet {
  const first = byPair.get('lisboa>' + stops[0]) ?? [];
  const nm = (first[0] ?? byPair.get(stops[0] + '>lisboa')![0]).nm;
  const days = voyageDays(nm) + 5 * (stops.length - 1);
  const storeT = 0.005 * h.crewFull * days;
  const o = legNet(first, h, storeT);
  const homeLanes = stops.flatMap((x) => byPair.get(x + '>lisboa') ?? []);
  let room = Math.max(0, cap(h) - storeT), total = 0;
  const sold = new Map<string, number>(), goods: string[] = [];
  for (const l of [...homeLanes].sort((a, b) => b.margin / b.bulk - a.margin / a.bulk)) {
    const left = l.appetite - (sold.get(l.g) ?? 0);
    const units = Math.floor(Math.min(l.stock, left, room / l.bulk));
    if (units <= 0) continue;
    const casa = MONOPOLY.includes(l.g) ? CASA_SHARE : 1;
    const bid = l.margin + l.ask, was = sold.get(l.g) ?? 0;
    const net = (units * bid * casa) / slip(was + units, l.appetite) - units * l.ask * slip(units, l.stock);
    if (net <= 0) continue;
    sold.set(l.g, was + units);
    room -= units * l.bulk; total += net; goods.push(l.g);
  }
  return { net: o.total + total - days * h.crewFull * (0.012 + WAGE_PER_MAN_MONTH / 30), storeT, goods: [...o.goods.slice(0, 3), '|', ...goods.slice(0, 4)], out: o.total, back: total };
}
const undirected = (() => {
  const seen = new Set<string>(), out: [string, string][] = [];
  for (const k of byPair.keys()) {
    const [x, y] = k.split('>');
    const key = x < y ? x + '>' + y : y + '>' + x;
    if (!seen.has(key)) { seen.add(key); out.push([x < y ? x : y, x < y ? y : x]); }
  }
  return out;
})();
const tiers = HULLS.map((h, i) => {
  const ok = new Set(REACH[h.id]);
  const rs = undirected
    .filter(([x, y]) => ok.has(regionOf(x)) && ok.has(regionOf(y)))
    .map(([x, y]) => ({ k: `${x}<>${y}`, ...pairNet(x, y, h) }))
    .sort((a, b) => b.net - a.net);
  const best = rs[0];
  const nets = rs.map((r) => r.net).filter((n) => n > 0).sort((a, b) => a - b);
  const next = HULLS[i + 1];
  return { h, best, median: pct(nets, 0.5), p90: pct(nets, 0.9), voyages: next ? next.cost / best.net : null };
});

// Reward for the risk: the long, dangerous run must out-earn the short safe one, same hull.
const ATL = new Set<Region>(['europe', 'atlantic', 'maghreb']);
const FAR = new Set<Region>(['india', 'east']);
const BIGH = HULLS[HULLS.length - 1];
// The Malabar tours: a full Nau da India is loaded at two or three ports on one coast.
const TOURS = [['cochim', 'cananor'], ['cochim', 'calecute'], ['cochim', 'calecute', 'cananor'], ['calecute', 'cananor']];
const bigNet = (x: string, y: string) => pairNet(x, y, BIGH).net;
const atlNets = undirected.filter(([x, y]) => ATL.has(regionOf(x)) && ATL.has(regionOf(y))).map(([x, y]) => bigNet(x, y)).filter((n) => n > 0).sort((a, b) => a - b);
const CORE = ['calecute', 'cochim', 'cananor', 'goa', 'diu', 'cambaia', 'columbo', 'malaca'];
const indiaRound = [
  ...CORE.map((x) => ({ k: `lisboa<>${x}`, net: bigNet('lisboa', x) })),
  ...TOURS.map((t) => ({ k: 'lisboa>' + t.join('+'), net: tourNet(t, BIGH).net })),
].sort((a, b) => a.net - b.net);
const cochimTours = TOURS.filter((t) => t.includes('cochim')).map((t) => tourNet(t, BIGH).net).sort((a, b) => a - b);
const tourNets = TOURS.map((t) => tourNet(t, BIGH).net).sort((a, b) => a - b);
const medIndia = tourNets[Math.floor(tourNets.length / 2)];
const medAtl = pct(atlNets, 0.5), medCochim = cochimTours[Math.floor(cochimTours.length / 2)];
const riskX = medCochim / Math.max(medAtl, 1);

if (args.includes('--pair')) {
  // --pair <a> <b> [hull index 0-5]: the goods of one voyage, leg by leg.
  const i = args.indexOf('--pair'); TRACE = true;
  const r = pairNet(args[i + 1], args[i + 2], HULLS[Number(args[i + 3] ?? 5)]);
  TRACE = false;
  console.log(`net ${f(r.net)} out ${f(r.out)} back ${f(r.back)}`);
}
if (LADDER) {
  console.log('\nPrice ladder, net per voyage on the lanes each hull can reach (stores in tons, slippage, Casa share)');
  console.log(`${id('hull', 18)}${'price'.padStart(7)}${'hold'.padStart(6)}${'net best'.padStart(10)}${'median'.padStart(8)}${'p90'.padStart(8)}${'vy next'.padStart(9)}  band (net / voyages)    best lane`);
  for (const t of tiers) {
    const [lo, hi, vy] = BANDS[t.h.id];
    const b = t.best;
    console.log(`${id(t.h.id, 18)}${f(t.h.cost).padStart(7)}${f(cap(t.h)).padStart(6)}${f(b.net).padStart(10)}${f(t.median).padStart(8)}${f(t.p90).padStart(8)}${(t.voyages === null ? '-' : t.voyages.toFixed(1)).padStart(9)}  ${String(lo + '-' + hi + ' / ' + vy).padEnd(22)}${b.k} (${b.goods.slice(0, 4).join(',')}; stores ${b.storeT.toFixed(1)} t)`);
  }
}

console.log(`\nIndia round trips, ${BIGH.id} ${cap(BIGH)} t, out and home: typical (median of the Malabar tours) ${f(medIndia)}; best of all ${f(indiaRound[indiaRound.length - 1].net)}  best ${f(indiaRound[indiaRound.length - 1].net)} (${indiaRound[indiaRound.length - 1].k})  worst ${f(indiaRound[0].net)}  n ${indiaRound.length} (Lisbon <> 8 Carreira ports, and ${TOURS.length} Malabar tours)`);
for (const t of TOURS) { const r = tourNet(t, BIGH); console.log(`  tour lisboa > ${t.join(' + ')} > lisboa: ${f(r.net)}  out ${f(r.out)} back ${f(r.back)}  stores ${r.storeT.toFixed(0)} t  ${r.goods.join(',')}`); }
console.log(`  3-port Malabar tour by hull: ` + HULLS.map((h) => `${h.id} ${f(tourNet(TOURS[2], h).net)} (${h.crewFull} men, hold ${cap(h)} t)`).join('; '));
console.log(`Risk reward, ${BIGH.id}: median net of the Cochim tours ${f(medCochim)} (n ${cochimTours.length}) vs Atlantic coastal pairs ${f(medAtl)} (n ${atlNets.length}) = ${riskX.toFixed(2)}x; the Lisbon <> Cochim pair alone ${f(bigNet('lisboa', 'cochim'))}`);
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
// A pair of dense goods is money-bound at every hull from a caravela up; the pair that tests the hold is the best one that carries bulk.
const bulkPairs = pairs.filter((p) => p.ls.some((l) => isStaple(GOODS.find((g) => g.id === l.g)!) && Math.min(l.stock, l.appetite) * l.bulk > cap(REF)));
pairs.sort((a, b) => a.ref - b.ref);
const bestPair = bulkPairs.reduce((a, b) => (b.big > a.big ? b : a));
const bestAny = pairs.reduce((a, b) => (b.big > a.big ? b : a));
const medPair = pairs[Math.floor(pairs.length / 2)];
const mixBest = bestPair.big / bestPair.ref, mixMed = medPair.big / medPair.ref;
console.log(`Mixed cargo, ${pairs.length} port pairs; the best of all, ${bestAny.k}, is money-bound (${f(bestAny.ref)} -> ${f(bestAny.big)}); best pair that carries bulk (${bulkPairs.length}): ${bestPair.k}`);
console.log(`Mixed cargo, best bulk pair ${bestPair.k} ${f(bestPair.ref)} -> ${f(bestPair.big)} (${mixBest.toFixed(2)}x); median pair ${medPair.k} ${f(medPair.ref)} -> ${f(medPair.big)} (${mixMed.toFixed(2)}x)`);
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

if (args.includes('--pairs')) {
  const h = BIG;
  const all = undirected.map(([x, y]) => ({ k: `${x}<>${y}`, x, y, ...pairNet(x, y, h) }));
  const indian = all.filter((r) => ['india', 'east'].includes(regionOf(r.x)) || ['india', 'east'].includes(regionOf(r.y))).sort((a, b) => b.net - a.net).slice(0, 8);
  console.log('\nTop India-lane voyages (out and home) for the ' + h.id + ':');
  for (const r of indian) console.log(`${id(r.k, 26)}${f(r.net).padStart(8)} out ${f(r.out).padStart(6)} back ${f(r.back).padStart(6)}  ${r.goods.join(',')}`);
  console.log('\nTop voyages overall:');
  for (const r of all.sort((a, b) => b.net - a.net).slice(0, 10)) console.log(`${id(r.k, 26)}${f(r.net).padStart(8)} out ${f(r.out).padStart(6)} back ${f(r.back).padStart(6)}  ${r.goods.join(',')}`);
}

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
  // The median-lane test is run on staple lanes: a dense good (pearls, silk, pepper) is never hold-bound,
  // so the median lane of all goods cannot scale with the hold (see docs/BALANCE.md, B3 findings).
  const FARR = new Set<Region>(['swahili', 'arabia', 'india', 'east']);
  const stapleLanes = lanes.filter((l) => isStaple(GOODS.find((g) => g.id === l.g)!) && !FARR.has(regionOf(l.to)));
  const stapleRef = stapleLanes.map((l) => load(l, cap(REF))).sort((a, b) => a.profit - b.profit);
  const sm = stapleRef[Math.floor(stapleRef.length / 2)];
  const medX = load(sm, cap(BIG)).profit / load(sm, cap(REF)).profit;
  console.log(`median staple lane (${sm.g} ${sm.from}->${sm.to}): ${cap(BIG)} t earns ${medX.toFixed(2)}x the ${cap(REF)} t`);
  if (medX < 1.4) fails.push(`median staple lane: ${medX.toFixed(2)}x (< 1.4x)`);
  // Tiers: the three dearer hulls must sit in their band (+-15%); the three small ones within a factor of two
  // (their lanes carry the trade parcels, which A2 could not see), and the order must climb.
  tiers.forEach((t, i) => {
    const [lo, hi] = BANDS[t.h.id];
    // Tiers 1-3 carry Lisbon's and Arzila's trade parcels and cheap-staple margins that the price formula fixes: up to 2x, 1.5x and 1.15x the band; below, 0.5x.
    const tol = [1.0, 0.5, 0.15, 0.15, 0.15, 0.15][i];
    const lowTol = i >= 3 ? 0.15 : 0.5;
    // The Nau da India's band is a floor: the long run is where the exceptional voyage lives (typical is checked below).
    const top = i === tiers.length - 1;
    if (t.best.net < lo * (1 - lowTol) || (!top && t.best.net > hi * (1 + tol))) fails.push(`${t.h.id} nets ${f(t.best.net)} per voyage, band ${lo}-${hi}${top ? ' (floor)' : ''}`);
    if (i > 0 && t.best.net <= tiers[i - 1].best.net) fails.push(`${t.h.id} does not out-earn the hull below`);
    if (t.voyages !== null && (t.voyages < 1.5 || t.voyages > 6.5)) fails.push(`${t.h.id} buys the next hull in ${t.voyages.toFixed(1)} voyages (1.5-6.5)`);
  });
  if (riskX < 3) fails.push(`risk reward: Cochim voyages ${f(medCochim)} vs Atlantic coastal ${f(medAtl)} = ${riskX.toFixed(2)}x (< 3x)`);
  if (medIndia < 6000 || medIndia > 12000) fails.push(`typical India round trip nets ${f(medIndia)} (band 6,000-12,000)`);
  if (pearls && (load(pearls, cap(BIG)).profit > 6000 || load(pearls, cap(BIG)).profit < 800)) fails.push('Ormuz->Cambay pearls out of the 800-6,000 band (was 66,175, then 372)');
  // The Carreira's goods are the top lanes again: spice, silk, pearls, gems, ambergris, camphor from the Indian Ocean.
  const CARREIRA = new Set(['pimenta', 'gengibre', 'canela', 'cravo', 'noz', 'maca', 'cardamomo', 'seda', 'perolas', 'pedras', 'ambar', 'canfora']);
  const top20 = ref.slice(0, 20).filter((r) => CARREIRA.has(r.g) && ['india', 'east', 'arabia'].includes(regionOf(r.from))).length;
  console.log(`top 20 single-good lanes that are Indian Ocean spice, silk, pearls or gems: ${top20}`);
  if (top20 < 14) fails.push(`only ${top20} of the 20 best lanes are the Carreira's goods from the Indian Ocean (>= 14)`);
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

if (args.includes('--regions')) {
  const by = new Map<string, number[]>();
  for (const r of ref) { const k = regionOf(r.from); (by.get(k) ?? by.set(k, []).get(k)!).push(r.profit); }
  console.log('\nSingle-good lanes by source region (reference hold): n, median, p90, max');
  for (const [k, v] of by) { v.sort((a, b) => a - b); console.log(`${id(k, 10)}${String(v.length).padStart(5)}${f(pct(v, 0.5)).padStart(7)}${f(pct(v, 0.9)).padStart(7)}${f(v[v.length - 1]).padStart(7)}`); }
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
