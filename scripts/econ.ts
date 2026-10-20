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
import { LOT_TONS, STAPLE_DEMAND, PORT_DEMAND, PORT_PROFIT, DEEP_PRICE, DEEP_SEASON, DEEP_TONS, AUTUMN_SALE, SPICE_FIRST_LOT, isStaple } from '../src/economy/ladder';
import { PORTS, anchorageOf } from '../src/world/ports';
import { GOODS } from '../src/economy/goods';
import { HULL_CLASSES } from '../src/ship/hull';
import { haversine, NM } from '../src/core/math';
import { CASA_SHARE, MONOPOLY, regionOf, type Region } from '../src/economy/trade';
import { runWorld } from './lib/world';
import { TUNE } from '../src/world/lanes';
import { duesFor } from '../src/economy/dues';
import { roadMiles, TRUNK } from '../src/progression/road';
import { STORE_TONS, sparesSetTons } from '../src/game/stores';
import { portDef } from '../src/world/ports';

const args = process.argv.slice(2);
// Tuning hooks for sweeps: PP='{"europe":900}' and LT='{"city":600}' override the caps for one run.
if (process.env.PP) Object.assign(PORT_PROFIT, JSON.parse(process.env.PP));
if (process.env.PD) Object.assign(PORT_DEMAND, JSON.parse(process.env.PD));
if (process.env.SD) Object.assign(STAPLE_DEMAND, JSON.parse(process.env.SD));
if (process.env.DPR) Object.assign(DEEP_PRICE, JSON.parse(process.env.DPR));
if (process.env.DT) DEEP_TONS.house = Number(process.env.DT);
if (process.env.LC) DEEP_TONS.cap = Number(process.env.LC);
if (process.env.FL) SPICE_FIRST_LOT.share = Number(process.env.FL);
if (process.env.AS) AUTUMN_SALE.depth = Number(process.env.AS);
if (process.env.DS) Object.assign(DEEP_SEASON, JSON.parse(process.env.DS));
if (process.env.LT) Object.assign(LOT_TONS, JSON.parse(process.env.LT));
if (process.env.LANES) Object.assign(TUNE, JSON.parse(process.env.LANES));
if (args.includes('--world')) {
  // The 24-month no-player world sim and the prosperity falsifiers (BUILD_PLAN C1). Separate from the ladder pass.
  process.exit(runWorld() ? 0 : 1);
}
const LADDER = args.includes('--ladder');
const CHECK = args.includes('--check');
// --burthen: use the headline burthen (tons: 140/260/480, the design team's convention)
// instead of the real cargo hold (hold: 105/205/400, what the game enforces).
const BURTHEN = args.includes('--burthen');
const cap = (h: { hold: number; tons: number }) => (BURTHEN ? h.tons : h.hold);
const MAX_SPREAD = 10;
const MIN_BIG_VS_SMALL = 2.2;

const T = 86400 * (400 + Number(process.env.TOFF ?? 0));
type L = ReturnType<Markets['listings']>[number];
/** Every port's listings at time t, markets refreshed to it, relation 0, skill 0. */
function bookAt(t: number): Map<string, Map<string, L>> {
  const mk = new Markets(1), out = new Map<string, Map<string, L>>();
  for (const p of PORTS) {
    mk.refresh(p.id, t);
    out.set(p.id, new Map(mk.listings(p.id, t, 0, 0).map((l) => [l.goodId, l])));
  }
  return out;
}
const book = bookAt(T);

// Stock hulls only: the galleon is gated behind unobtainable standing.
const HULLS = HULL_CLASSES.filter((h) => h.standing < 1e8).sort((a, b) => a.cost - b.cost);
const hull = (id: string) => HULLS.find((h) => h.id === id)!;
const REF = hull('nau-pequena'); // 140 t burthen, 105 t of hold
const BIG = hull('nau-da-india'); // 480 t

interface Lane { g: string; from: string; to: string; nm: number; margin: number; bulk: number; stock: number; appetite: number; ask: number; lot?: number; curve?: { base: number; rise: number } }
interface Route extends Lane { units: number; cost: number; profit: number }

/** The profitable lanes (good, origin, destination) between every pair of ports in a book. */
function lanesOf(bk: Map<string, Map<string, L>>): Lane[] {
  const out: Lane[] = [];
  for (const a of PORTS) for (const b of PORTS) {
    if (a.id === b.id) continue;
    const nm = haversine(anchorageOf(a), anchorageOf(b)) / NM;
    for (const g of GOODS) {
      const la = bk.get(a.id)!.get(g.id), lb = bk.get(b.id)!.get(g.id);
      if (!la || !lb || !la.local || la.stock <= 0 || lb.appetite <= 0) continue;
      const margin = lb.bid - la.ask;
      if (margin <= 0) continue;
      out.push({ g: g.id, from: a.id, to: b.id, nm, margin, bulk: g.bulk, stock: la.stock, appetite: lb.appetite, ask: la.ask, lot: la.lot, curve: la.curve });
    }
  }
  return out;
}
const pairsOf = (ls: Lane[]): Map<string, Lane[]> => {
  const out = new Map<string, Lane[]>();
  for (const l of ls) { const k = l.from + '>' + l.to; (out.get(k) ?? out.set(k, []).get(k)!).push(l); }
  return out;
};
const lanes: Lane[] = lanesOf(book);
const load = (l: Lane, hold: number): Route => {
  const units = Math.min(l.stock, l.appetite, hold / l.bulk);
  // Where a deeper pool stands behind the first lot (Malabar and the East) the units beyond the lot cost more.
  const extra = l.lot === undefined ? 0 : units * l.ask * (Markets.slippage(units, l.stock, l.lot, l.curve) - 1);
  return { ...l, units, cost: units * l.ask + extra, profit: units * l.margin - extra };
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

let byPair = pairsOf(lanes);

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
let curHull = '';
const TTON = () => !!process.env.TT && process.env.TT === curHull;
const KNOTS_DAY = 4.5 * 24;
/** Crew wages, cruzados per man per month (game/wages). */
const WAGE_PER_MAN_MONTH = Number(process.env.WAGE ?? 4);
const slip = (q: number, avail: number) => Markets.slippage(q, avail);
function voyageDays(nm: number): number { return 2 * (nm / KNOTS_DAY) + 12; }
/** Port dues at the calls of a voyage (economy/dues): none at a Portuguese quay. */
const callDues = (ports: string[], h: { tons: number }): number => ports.reduce((sum, id) => sum + duesFor(portDef(id), h.tons).dues, 0);
interface PairNet { net: number; storeT: number; goods: string[]; out: number; back: number }
/**
 * Fill a hold from a set of lanes the way a rational captain would: ton by ton, from whichever lane's next lot pays most
 * per ton of hold, until nothing pays or the hold is full. The price climbs with the size of an order (Markets.slippage: a
 * first lot, then a dearer deeper pool) and the buyer's bid falls with what he is sold (Markets.slippage), so a lot is
 * the best of its sizes, not the largest. Lanes that end in the same market for the same good (the stops of a tour) share
 * that market's appetite. `sold` carries what has already been sold of each good there (tours).
 */
function fillCargo(ls: Lane[], room0: number, sold = new Map<string, number>()): { total: number; goods: string[] } {
  let room = room0, total = 0;
  const goods: string[] = [];
  const took = new Map<Lane, number>();
  const dead = new Set<Lane>();
  const casaOf = (l: Lane) => (l.to === 'lisboa' && MONOPOLY.includes(l.g) ? CASA_SHARE : 1);
  const revenue = (l: Lane, total: number) => (total <= 0 ? 0 : (total * (l.margin + l.ask) * casaOf(l)) / slip(total, l.appetite));
  const cost = (l: Lane, u: number) => (u <= 0 ? 0 : u * l.ask * Markets.slippage(u, l.stock, l.lot, l.curve));
  for (;;) {
    let pick: { l: Lane; step: number; gain: number; per: number } | null = null;
    for (const l of ls) {
      if (dead.has(l)) continue;
      const u = took.get(l) ?? 0, S = sold.get(l.g) ?? 0;
      const umax = Math.floor(Math.min(l.stock, l.appetite - S, room / l.bulk));
      const left = Math.min(Math.floor(l.stock) - u, Math.floor(l.appetite - S), Math.floor(room / l.bulk));
      if (left <= 0 || umax <= 0) { dead.add(l); continue; }
      // A lane with one tier is a lot taken whole or not at all (as before); one with a deeper pool behind it is taken by degrees.
      const tiered = l.lot !== undefined;
      const step = tiered ? Math.max(1, Math.min(left, Math.ceil(0.4 / l.bulk))) : left;
      const gain = revenue(l, S + step) - revenue(l, S) - (cost(l, u + step) - cost(l, u));
      const per = gain / (step * l.bulk);
      if (gain <= 0) { dead.add(l); continue; }
      if (!pick || per > pick.per) pick = { l, step, gain, per };
    }
    if (!pick) break;
    const { l, step, gain } = pick;
    took.set(l, (took.get(l) ?? 0) + step);
    sold.set(l.g, (sold.get(l.g) ?? 0) + step);
    room -= step * l.bulk;
    total += gain;
    if (!goods.includes(l.g)) goods.push(l.g);
  }
  if (TTON()) for (const [l, u] of took) console.log(`   ${l.from}>${l.to} ${l.g}: ${u} of ${Math.round(l.stock)} (lot ${l.lot === undefined ? '-' : Math.round(l.lot)}) app ${Math.round(l.appetite)} ask ${l.ask.toFixed(1)} bid ${(l.margin + l.ask).toFixed(1)} t ${(u * l.bulk).toFixed(1)}`);
  if (TTON()) console.log(`   == total ${Math.round(total)} tons ${[...took].reduce((a, [l, u]) => a + u * l.bulk, 0).toFixed(1)} room ${room0.toFixed(0)}`);
  return { total, goods };
}
/** One leg with a mixed cargo; returns the money and the goods. */
function legNet(ls: Lane[], h: { crewFull: number; hold: number; tons: number }, storeT: number): { total: number; goods: string[] } {
  const r = fillCargo(ls, Math.max(0, cap(h) - storeT));
  if (TRACE) console.log(`  leg: ${r.goods.join(',')} net ${Math.round(r.total)}`);
  return r;
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
  return { net: o.total + r.total - days * h.crewFull * (0.012 + WAGE_PER_MAN_MONTH / 30) - callDues([a, b, a], h), storeT, goods: [...o.goods.slice(0, 3), '|', ...r.goods.slice(0, 3)], out: o.total, back: r.total };
}
/**
 * A tour: out from Lisbon to the first stop, along the coast to the others (5 port
 * days and a short hop each), home with one cargo made from what every stop holds.
 * The destination's appetite is shared across the stops, so Lisbon cannot be sold
 * the same pepper three times. This is how a Nau da India is actually loaded: one
 * Cochim yard does not fill 400 t.
 */
/** The Portuguese quays a Carreira ship can come home to. */
const HOME_PORTS = PORTS.filter((p) => p.people === 'portuguese').map((p) => p.id);
function tourNet(stops: string[], h: { crewFull: number; hold: number; tons: number }, over: { days?: number; storeT?: number; home?: string } = {}): PairNet {
  const first = byPair.get('lisboa>' + stops[0]) ?? [];
  const nm = (first[0] ?? byPair.get(stops[0] + '>lisboa')![0]).nm;
  const days = over.days ?? voyageDays(nm) + 5 * (stops.length - 1);
  const storeT = over.storeT ?? 0.005 * h.crewFull * days;
  const o = legNet(first, h, storeT);
  const home = over.home ?? 'lisboa';
  // The King's goods are sold at the Casa's scales in Lisbon and nowhere else.
  const homeLanes = stops.flatMap((x) => byPair.get(x + '>' + home) ?? []).filter((l) => home === 'lisboa' || !MONOPOLY.includes(l.g));
  const { total, goods } = fillCargo(homeLanes, Math.max(0, cap(h) - storeT));
  return { net: o.total + total - days * h.crewFull * (0.012 + WAGE_PER_MAN_MONTH / 30) - callDues(['lisboa', ...stops, home], h), storeT, goods: [...o.goods.slice(0, 3), '|', ...goods.slice(0, 4)], out: o.total, back: total };
}
/** A tour home to whichever Portuguese quay pays best that month (the second tier is priced to the best of them). */
function tourBest(stops: string[], h: { crewFull: number; hold: number; tons: number }, over: { days?: number; storeT?: number } = {}): PairNet {
  let best: PairNet | null = null;
  for (const home of HOME_PORTS) {
    if (!stops.some((x) => byPair.has(x + '>' + home))) continue;
    const r = tourNet(stops, h, { ...over, home });
    if (!best || r.net > best.net) best = r;
  }
  return best ?? tourNet(stops, h, over);
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
  ...TOURS.map((t) => ({ k: 'lisboa>' + t.join('+'), net: tourBest(t, BIGH).net })),
].sort((a, b) => a.net - b.net);
const cochimTours = TOURS.filter((t) => t.includes('cochim')).map((t) => tourBest(t, BIGH).net).sort((a, b) => a - b);
const tourNets = TOURS.map((t) => tourBest(t, BIGH).net).sort((a, b) => a - b);
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
for (const t of TOURS) { const r = tourBest(t, BIGH); console.log(`  tour lisboa > ${t.join(' + ')} > home: ${f(r.net)}  out ${f(r.out)} back ${f(r.back)}  stores ${r.storeT.toFixed(0)} t  ${r.goods.join(',')}`); }
console.log(`  3-port Malabar tour by hull: ` + HULLS.map((h) => `${h.id} ${f(tourBest(TOURS[2], h).net)} (${h.crewFull} men, hold ${cap(h)} t)`).join('; '));
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
    // (units beyond a first lot cost more: Markets.slippage)
    total += u * l.margin - (l.lot === undefined ? 0 : u * l.ask * (Markets.slippage(u, l.stock, l.lot, l.curve) - 1));
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

// ---------------------------------------------------------------------------
// India by hull: can a small hull run the Carreira? (BUILD_PLAN D1, the small-hull question)
// ---------------------------------------------------------------------------
// BALANCE.md noted a caravela redonda earns what a Nau da India does on a Malabar tour, because spices are
// money-capped per port, so the hold never binds. Is that a flaw, or does the stores-in-tons rule (game/stores)
// already keep small hulls off the road? Measured here with the real sailed distance (road.ts roadMiles, the Lines'
// pace per hull), the real stores rule (0.005 t a man-day, spares 1-2 t) and dues, two ways: every ton of stores
// for the whole round trip carried from Lisbon (the harshest reading), and a pilot's loading for the longest leg
// between two ports on the road (Benguela - Moçambique) with the stores renewed at each port, which is how the
// game plays it.
const PACE_NM_DAY: Record<string, number> = { barcha: 120, 'caravela-latina': 115, 'caravela-redonda': 110, 'nau-pequena': 104, nau: 100, 'nau-da-india': 98 };
const anch = (id: string) => anchorageOf(portDef(id));
const GRAND = ['cochim', 'coulao', 'calecute', 'cananor', 'goa', 'chaul'];
interface IndiaRow { days: number; wholeT: number; legT: number; wholeNet: number; legNet: number }
function indiaByHull(stops: string[], h: (typeof HULLS)[number]): IndiaRow {
  curHull = stops.length === 3 ? h.id : '';
  const pace = PACE_NM_DAY[h.id] ?? 100;
  const out = roadMiles(anch('lisboa'), anch(stops[0]));
  let hop = 0;
  for (let i = 1; i < stops.length; i++) hop += (haversine(anch(stops[i - 1]), anch(stops[i])) / NM) * 1.25;
  // The trunk's eleven calls each way cost three days apiece; the stops on the coast five.
  const days = (2 * out + hop) / pace + 2 * 3 * (TRUNK.length - 2) + 5 * stops.length + 10;
  const spares = 0.6 * sparesSetTons(h.hold);
  const perManDay = STORE_TONS.water + STORE_TONS.biscuit + STORE_TONS.saltMeat * 0.9 + STORE_TONS.wine * 0.7 + 18 * STORE_TONS.fresh / days;
  const wholeT = perManDay * h.crewFull * days + spares;
  let longest = 0;
  for (let i = 2; i < TRUNK.length; i++) longest = Math.max(longest, roadMiles(anch(TRUNK[i - 1]), anch(TRUNK[i])));
  const need = Math.ceil((longest / pace) * 1.25 + 14);
  const legT = (STORE_TONS.water * (need + 10) + (STORE_TONS.biscuit + STORE_TONS.saltMeat * 0.9 + STORE_TONS.wine * 0.7) * need + 18 * STORE_TONS.fresh) * h.crewFull + spares;
  return {
    days, wholeT, legT,
    wholeNet: tourBest(stops, h, { days, storeT: wholeT }).net,
    legNet: tourBest(stops, h, { days, storeT: legT }).net,
  };
}
const india3 = Object.fromEntries(HULLS.map((h) => [h.id, indiaByHull(TOURS[2], h)]));
const indiaG = Object.fromEntries(HULLS.map((h) => [h.id, indiaByHull(GRAND, h)]));
if (args.includes('--india-hulls') || CHECK) {
  const row = (t: Record<string, IndiaRow>, h: (typeof HULLS)[number]) => {
    const r = t[h.id];
    return `${id(h.id, 18)}${f(cap(h)).padStart(6)}${f(r.days).padStart(6)}${r.wholeT.toFixed(1).padStart(9)}${r.legT.toFixed(1).padStart(8)}${f(r.wholeNet).padStart(10)}${f(r.legNet).padStart(10)}`;
  };
  const head = `${id('hull', 18)}${'hold'.padStart(6)}${'days'.padStart(6)}${'stores*'.padStart(9)}${'/leg'.padStart(8)}${'net*'.padStart(10)}${'net/leg'.padStart(10)}`;
  console.log(`\nIndia by hull, real sailed days and the stores rule (* = every ton of stores for the round trip carried from Lisbon; /leg = a pilot's loading renewed at each port; dues and wages in)`);
  console.log(`3-port Malabar tour (${TOURS[2].join(', ')}):\n${head}`);
  for (const h of HULLS) console.log(row(india3, h));
  console.log(`Grand tour (${GRAND.join(', ')}):\n${head}`);
  for (const h of HULLS) console.log(row(indiaG, h));
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
  // (This one runs the simplified voyage days of the ladder, ~100 fewer than the real sailed days below, which carry the 12,000 ceiling.)
  if (medIndia < 6000 || medIndia > 14500) fails.push(`typical India round trip nets ${f(medIndia)} (band 6,000-14,500 at ladder days)`);
  if (pearls && (load(pearls, cap(BIG)).profit > 6000 || load(pearls, cap(BIG)).profit < 800)) fails.push('Ormuz->Cambay pearls out of the 800-6,000 band (was 66,175, then 372)');
  // The Carreira's goods are the top lanes again: spice, silk, pearls, gems, ambergris, camphor from the Indian Ocean.
  const CARREIRA = new Set(['pimenta', 'gengibre', 'canela', 'cravo', 'noz', 'maca', 'cardamomo', 'seda', 'perolas', 'pedras', 'ambar', 'canfora']);
  const top20 = ref.slice(0, 20).filter((r) => CARREIRA.has(r.g) && ['india', 'east', 'arabia'].includes(regionOf(r.from))).length;
  console.log(`top 20 single-good lanes that are Indian Ocean spice, silk, pearls or gems: ${top20}`);
  // (Was >= 14 before the second tier: the Carreira's depth is now in the deep lots a great hold lifts, which a 105 t reference lane
  // cannot show, and the peak single lane is held to the 10:1 spread; the tours below carry the arc.)
  if (top20 < 8) fails.push(`only ${top20} of the 20 best lanes are the Carreira's goods from the Indian Ocean (>= 8)`);
  // The small-hull question (D1): the stores-in-tons rule does NOT keep a small hull off the Indies. Pinned so that it
  // is not forgotten: only the barcha and the latina cannot carry a round trip's stores from Lisbon (they must renew
  // them at the ports of the road, which is what the trunk is for); a redonda's loading for the longest leg is a fifth
  // of her hold. What keeps her from out-earning a Nau da India is the second tier of lots (economy/ladder), asserted below.
  const red = HULLS.find((x) => x.id === 'caravela-redonda')!, barcha = HULLS.find((x) => x.id === 'barcha')!, lat = HULLS.find((x) => x.id === 'caravela-latina')!;
  if (india3[barcha.id].wholeT <= barcha.hold) fails.push(`the barcha can carry the round trip's stores (${india3[barcha.id].wholeT.toFixed(1)} of ${barcha.hold} t): the stores rule was supposed to limit her`);
  if (india3[lat.id].wholeT < lat.hold * 0.85) fails.push('the latina has room for cargo after a round trip\'s stores: the stores rule changed');
  if (india3[red.id].legT > red.hold * 0.25) fails.push(`a redonda's stores for the longest leg are ${india3[red.id].legT.toFixed(1)} t of ${red.hold}: they now bind`);
  const bigI = india3[BIGH.id], redI = india3[red.id];
  console.log(`India small-hull question: redonda ${f(redI.legNet)} vs Nau da India ${f(bigI.legNet)} a tour with the stores renewed at the ports (${(redI.legNet / bigI.legNet).toFixed(2)}x); stores for the longest leg ${redI.legT.toFixed(1)} of ${red.hold} t`);
  if (bigI.legNet < 6000 || bigI.legNet > 12000) fails.push(`a Nau da India's Malabar tour at real sailed days nets ${f(bigI.legNet)} (band 6,000-12,000)`);
  // The second tier (economy/ladder, docs/BALANCE.md): on the Malabar tour, stores renewed at the ports, real sailed days, wages and
  // dues in, net must climb with the hull, the biggest at least 1.8x a redonda, the small hulls must still come home with a profit
  // (a worse bet, not a closed road), and the order must hold in the harvest (this book) and out of it (200 days on).
  const savedPairs = byPair;
  byPair = pairsOf(lanesOf(bookAt(T + 200 * 86400)));
  const off3 = Object.fromEntries(HULLS.map((h) => [h.id, indiaByHull(TOURS[2], h)]));
  byPair = savedPairs;
  for (const [label, tbl] of [['harvest', india3], ['out of season', off3]] as const) {
    const nets = HULLS.map((h) => tbl[h.id].legNet);
    console.log(`Malabar tour net by hull, ${label}: ` + HULLS.map((h, i) => `${h.id} ${f(nets[i])}`).join(', ') + `; Nau da India / redonda ${(nets[5] / nets[2]).toFixed(2)}x`);
    HULLS.forEach((h, i) => { if (i > 0 && nets[i] <= nets[i - 1]) fails.push(`Malabar tour (${label}): ${h.id} nets ${f(nets[i])}, no more than the ${HULLS[i - 1].id} (${f(nets[i - 1])})`); });
    if (nets[5] < 1.8 * nets[2]) fails.push(`Malabar tour (${label}): the Nau da India nets ${f(nets[5])}, ${(nets[5] / nets[2]).toFixed(2)}x a redonda (< 1.8x)`);
    if (nets[5] < 6000 || nets[5] > 13000) fails.push(`Malabar tour (${label}): the Nau da India nets ${f(nets[5])} (6,000-13,000)`);
    for (let i = 0; i < 3; i++) if (nets[i] < 1000) fails.push(`Malabar tour (${label}): the ${HULLS[i].id} nets ${f(nets[i])}: the small hulls must still profit on the Indies`);
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
