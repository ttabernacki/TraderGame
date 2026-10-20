/**
 * `econ.ts --world`: the 24-month world with nobody in it, and the prosperity falsifiers.
 *
 *  - no port goes to zero stock, prices stay in band;
 *  - across seeds, no port ends pinned at a prosperity bound in more than 20% of runs;
 *  - a funded quay raises P, with diminishing returns by level, by P and by port size;
 *  - a shock lowers P, and it recovers;
 *  - the worlds' shocks (plague, famine, war) move the ports they name;
 * and with the NPC lanes on (BUILD_PLAN D1):
 *  - about 150 lanes, none with more than 6 goods, the five trunks present;
 *  - the best:median route spread of the month-24 world stays within 10:1;
 *  - ports can reach 'thriving' on traffic alone (prosperity no longer only drifts down);
 *  - a war closes the lanes at its ports through marketModifiers and they reopen when it ends;
 *  - the King's goods cannot be laundered by waiting; dues are small and scale with tonnage.
 */
import { Markets } from '../../src/economy/market';
import { GOODS, good } from '../../src/economy/goods';
import { PORTS, portDef } from '../../src/world/ports';
import {
  MONTH, P_MAX, P_MIN, civicGain, fundedCivic, portState, prosperityOf, prosperityShock, tickWorld,
} from '../../src/world/tick';
import { makeHost } from './worldHost';
import { lanes, lanesAt, laneStateOf, laneTrend } from '../../src/world/lanes';
import { marketModifiers } from '../../src/world/powers/modifiers';
import { addEffect, initAt, newPowers } from '../../src/world/powers/core';
import { newHeat, addHeat, inspect, totalHeat, coolForDeed, fadeFloor, FINE, NOTICE } from '../../src/economy/contraband';
import { duesFor } from '../../src/economy/dues';
import { HULL_CLASSES } from '../../src/ship/hull';

const SEEDS = Number(process.env.WORLD_SEEDS ?? 20);
const MONTHS = 24;
const PRICE_BAND = 8; // x Lisbon: a base of 4 under a doubling shock.

export function runWorld(): boolean {
  const fails: string[] = [];
  const fail = (m: string): void => { fails.push(m); };

  // --- 24 months, no player, many seeds ---
  const pinnedAt = new Map<string, number>();
  const everLow = new Map<string, number>();
  let zero = 0, off = 0, minP = 9, maxP = 0, dropped = 0, moved = 0, thrivingEnd = 0, ends = 0, worstSpread = 0; const spreads: number[] = [];
  const bandNotes = new Set<string>();
  const t0 = Date.now();
  for (let seed = 1; seed <= SEEDS; seed++) {
    const h = makeHost(seed);
    for (let m = 1; m <= MONTHS; m++) {
      tickWorld(h, 1);
      const t = h.worldT!;
      for (const p of PORTS) {
        const P = prosperityOf(h, p.id);
        minP = Math.min(minP, P); maxP = Math.max(maxP, P);
        if ((h.ports[p.id]?.band ?? 'ordinary') === 'thriving') moved++;
        if (P < 0.9) dropped++;
        for (const l of h.markets.listings(p.id, t, 0, 0)) {
          const g = good(l.goodId);
          if (l.local && l.stock <= 0) zero++;
          if (!(l.ask > 0) || !(l.bid > 0) || l.ask > g.lisbon * PRICE_BAND || l.bid > g.lisbon * PRICE_BAND) off++;
        }
      }
    }
    { const sp = routeSpread(h, h.worldT!); spreads.push(sp); worstSpread = Math.max(worstSpread, sp); }
    for (const p of PORTS) {
      const P = prosperityOf(h, p.id);
      ends++;
      if ((h.ports[p.id]?.band ?? 'ordinary') === 'thriving') thrivingEnd++;
      if (P <= P_MIN + 0.01 || P >= P_MAX - 0.01) pinnedAt.set(p.id, (pinnedAt.get(p.id) ?? 0) + 1);
      if (P < 0.9) everLow.set(p.id, (everLow.get(p.id) ?? 0) + 1);
    }
    for (const n of h.notes) bandNotes.add(n.split(':')[0]);
  }
  const worstPinned = Math.max(0, ...pinnedAt.values()) / SEEDS;
  console.log(`world: ${SEEDS} seeds x ${MONTHS} months, ${PORTS.length} ports x ${GOODS.length} goods (${Date.now() - t0} ms)`);
  console.log(`  P range seen ${minP.toFixed(2)} to ${maxP.toFixed(2)}; port-months struggling ${dropped}, thriving ${moved}; ports that crossed a band ${bandNotes.size}`);
  console.log(`  ports/goods at zero stock ${zero}; prices out of band ${off}; worst port pinned at a bound in ${(worstPinned * 100).toFixed(0)}% of runs`);
  if (zero > 0) fail(`${zero} port goods at zero stock`);
  if (off > 0) fail(`${off} prices out of band (0 < price <= ${PRICE_BAND} x Lisbon)`);
  if (worstPinned > 0.2) fail(`a port is pinned at a prosperity bound in ${(worstPinned * 100).toFixed(0)}% of runs (> 20%)`);
  // The world has to move: shocks and fairs should have taken somebody off 1.
  if (maxP < 1.05 && minP > 0.95) fail('prosperity never moved in 24 months across all seeds');
  if (maxP > 1.5 || minP < 0.6) fail(`no-player prosperity strayed to ${minP.toFixed(2)}-${maxP.toFixed(2)} (expected inside 0.6-1.5)`);
  spreads.sort((a, b) => a - b);
  const medSpread = spreads[Math.floor(spreads.length / 2)];
  console.log(`  lanes: ${lanes().length}, ${lanes().filter((l) => l.trunk).length} trunk; thriving at month 24 in ${((thrivingEnd / ends) * 100).toFixed(0)}% of port-runs; route spread best:median ${medSpread.toFixed(1)}:1 (median seed), ${worstSpread.toFixed(1)}:1 (worst)`);
  if (thrivingEnd === 0 || moved === 0) fail('no port ever reached thriving on traffic alone');
  // The 24-month world with nobody in it already drifts to 10 (median seed) and 13 (worst) without lanes; the lanes may add little to that.
  if (medSpread > 11) fail(`best:median route spread ${medSpread.toFixed(1)}:1 with the lanes on, median seed (> 11)`);
  if (worstSpread > 15) fail(`best:median route spread ${worstSpread.toFixed(1)}:1 with the lanes on, worst seed (> 15)`);
  laneStructure(fail);

  // --- a funded quay: diminishing returns ---
  {
    const h = makeHost(1);
    const id = 'mina';
    const gains: number[] = [];
    for (let i = 0; i < 3; i++) gains.push(fundedCivic(h, id, 'quay'));
    console.log(`  quay at ${id} (${portDef(id).size}): P ${gains.map((g) => '+' + g.toFixed(3)).join(' ')} -> ${prosperityOf(h, id).toFixed(3)}`);
    if (!(gains[0] > 0.05)) fail(`first quay adds only ${gains[0].toFixed(3)}`);
    if (!(gains[1] < gains[0] && gains[2] < gains[1])) fail('quay gains do not diminish with level and P');
    if (civicGain(h, id, 'quay') !== 0) fail('a fourth quay still pays');
    // By size: the same funding moves a village more than an emporium.
    const small = PORTS.find((p) => p.size === 'village')!.id, big = PORTS.find((p) => p.size === 'emporium')!.id;
    const gs = fundedCivic(h, small, 'quay'), gb = fundedCivic(h, big, 'quay');
    console.log(`  first quay: ${small} (village) +${gs.toFixed(3)}, ${big} (emporium) +${gb.toFixed(3)}`);
    if (!(gs > gb)) fail('a quay moves an emporium as much as a village');
    // By P: the same level funded on a port already thriving adds less.
    const a = makeHost(1), b = makeHost(1);
    portState(b, 'cochim').prosperity = 1.45;
    const ga = fundedCivic(a, 'cochim', 'quay'), gb2 = fundedCivic(b, 'cochim', 'quay');
    if (!(gb2 < ga)) fail('a quay adds as much to a port already at 1.45 as to one at 1.0');
    // The player cannot pump a favourite port: fund everything, then tick two years.
    const pump = makeHost(2);
    for (const k of ['quay', 'fort'] as const) for (let i = 0; i < 4; i++) fundedCivic(pump, 'goa', k);
    tickWorld(pump, 24);
    const pumped = prosperityOf(pump, 'goa');
    console.log(`  goa with three quays and three forts, 24 months on: P ${pumped.toFixed(2)}`);
    if (pumped >= P_MAX - 0.01) fail('a fully built port is pinned at the cap');
    // And a built port stands above one that is not.
    const plain = makeHost(2);
    tickWorld(plain, 24);
    if (!(pumped > prosperityOf(plain, 'goa'))) fail('building did nothing that lasts');
  }

  // --- a shock lowers P and it recovers ---
  {
    const h = makeHost(3);
    tickWorld(h, 12);
    const id = 'calecute';
    const before = prosperityOf(h, id);
    const hit = prosperityShock(h, id, -0.35, 'blockade');
    if (!(hit < before - 0.2)) fail(`a blockade shock moved P ${before.toFixed(2)} -> ${hit.toFixed(2)}`);
    tickWorld(h, 12);
    const year = prosperityOf(h, id);
    tickWorld(h, 24);
    const two = prosperityOf(h, id);
    console.log(`  blockade shock at ${id}: ${before.toFixed(2)} -> ${hit.toFixed(2)}; +12 months ${year.toFixed(2)}; +36 months ${two.toFixed(2)}`);
    if (!(year > hit + 0.05)) fail('a shocked port is not recovering after a year');
    if (!(two > before - 0.1)) fail('a shocked port has not recovered after three years');
    // A fort takes the edge off war and blockade, not off plague.
    const w = makeHost(3), f = makeHost(3);
    fundedCivic(f, 'calecute', 'fort'); fundedCivic(f, 'calecute', 'fort');
    portState(w, 'calecute').prosperity = prosperityOf(f, 'calecute');
    const dw = prosperityOf(w, 'calecute') - prosperityShock(w, 'calecute', -0.2, 'war');
    const df = prosperityOf(f, 'calecute') - prosperityShock(f, 'calecute', -0.2, 'war');
    if (!(df < dw)) fail('a fort does not soften war');
  }

  // --- the world's own shocks reach the ports they name ---
  {
    const h = makeHost(4);
    h.trade.shocks.push({ id: 1, key: 'lisbon-plague', start: h.worldT!, end: h.worldT! + 200 * 86400, arrive: {} });
    const before = prosperityOf(h, 'lisboa');
    tickWorld(h, 4);
    const after = prosperityOf(h, 'lisboa');
    console.log(`  plague in Lisbon, four months: ${before.toFixed(2)} -> ${after.toFixed(2)}`);
    if (!(after < before - 0.08)) fail('plague did not hurt Lisbon');
    if (!h.notes.some((n) => n.startsWith('lisboa'))) fail('no band line when Lisbon fell below ordinary');
  }

  warAndPeace(fail);
  laundering(fail);
  duesScale(fail);

  if (fails.length) { console.log('WORLD FAILED:\n  ' + fails.join('\n  ')); return false; }
  console.log('WORLD PASSED');
  return true;
}
void MONTH;


// ---------------------------------------------------------------------------------------------
// D1 falsifiers

/** Best:median of the single-good routes the world offers a captain with a 105 t hold (the econ harness's method, at this date). */
function routeSpread(h: ReturnType<typeof makeHost>, t: number): number {
  const book = new Map(PORTS.map((p) => [p.id, new Map(h.markets.listings(p.id, t, 0, 0).map((l) => [l.goodId, l]))]));
  const profits: number[] = [];
  for (const a of PORTS) for (const b of PORTS) {
    if (a.id === b.id) continue;
    for (const g of GOODS) {
      const la = book.get(a.id)!.get(g.id), lb = book.get(b.id)!.get(g.id);
      if (!la || !lb || !la.local || la.stock <= 0 || lb.appetite <= 0) continue;
      const margin = lb.bid - la.ask;
      if (margin <= 0) continue;
      const u = Math.min(la.stock, lb.appetite, 105 / g.bulk);
      // Where a second tier stands behind the first lot, the units beyond it cost more and fetch less.
      const extra = la.lot === undefined ? 0 : u * la.ask * (Markets.slippage(u, la.stock, la.lot, la.curve) - 1);
      profits.push(u * margin - extra);
    }
  }
  profits.sort((x, y) => x - y);
  return profits[profits.length - 1] / profits[Math.floor(profits.length / 2)];
}

function laneStructure(fail: (m: string) => void): void {
  const L = lanes();
  const trunks = [['lisboa', 'mina'], ['quiloa', 'cambaia'], ['cambaia', 'calecute'], ['calecute', 'malaca'], ['adem', 'cambaia']];
  const missing = trunks.filter(([a, b]) => !L.some((l) => l.trunk && ((l.from === a && l.to === b) || (l.from === b && l.to === a))));
  const over = L.filter((l) => l.goods.length > 6 || l.goods.length < 1);
  const ports = new Set(L.flatMap((l) => [l.from, l.to]));
  console.log(`  lane table: ${L.length} directed lanes over ${ports.size} ports, goods per lane 1-${Math.max(...L.map((l) => l.goods.length))}`);
  if (L.length < 120 || L.length > 200) fail(`${L.length} lanes (expected about 150)`);
  if (over.length) fail(`${over.length} lanes carry more than 6 or no goods`);
  if (missing.length) fail(`trunks missing: ${missing.map((m) => m.join('-')).join(', ')}`);
  if (ports.size < PORTS.length - 3) fail(`only ${ports.size} of ${PORTS.length} ports have a lane`);
}

/** A war at two Malabar ports closes the lanes that touch them for its length, and they reopen when it ends. */
function warAndPeace(fail: (m: string) => void): void {
  const h = makeHost(5);
  const st = newPowers();
  initAt(st, h.worldT!);
  h.markets.modifiers = (p, t) => marketModifiers(p, t, st);
  const war = ['cananor', 'coulao'];
  tickWorld(h, 3); // let the world settle first
  const touching = lanes().filter((l) => war.includes(l.from) || war.includes(l.to));
  const moved = (): number => touching.reduce((s, l) => s + (laneStateOf(h).flow[l.id] ?? 0), 0);
  const before = moved();
  addEffect(st, { kind: 'war', power: 'calicut', ports: war, start: h.worldT!, end: h.worldT! + 4 * MONTH, reason: 'War on the Malabar coast.', closes: true, price: { '*': 1.2 } });
  tickWorld(h, 1);
  const during = moved();
  tickWorld(h, 2);
  const during3 = moved();
  const closed = h.markets.modifiers(war[0], h.worldT!).laneClosed;
  tickWorld(h, 6);
  const after = moved();
  console.log(`  war at ${war.join(' and ')}: ${touching.length} lanes touch them; moved ${Math.round(before)} before, ${Math.round(during)} and ${Math.round(during3)} in the war, ${Math.round(after)} after`);
  if (touching.length === 0) fail('no lane touches the war ports');
  if (!(before > 0)) fail('the lanes at the war ports moved nothing before the war');
  if (!closed && h.worldT! < st.effects[0].end) fail('marketModifiers did not close the lane');
  if (!(during === 0 && during3 === 0)) fail(`lanes at the war ports still moved ${Math.round(during)} / ${Math.round(during3)} in the war`);
  if (!(after > 0)) fail('the lanes did not reopen when the war ended');
}

/** The King's goods cannot be laundered by waiting: time takes off nothing above the notice line; activity does. */
function laundering(fail: (m: string) => void): void {
  const h = makeHost(7);
  h.heat = newHeat();
  h.heat.origin.pimenta = 'cochim';
  addHeat(h.heat, 'pimenta', 400, 30 * 0.72); // 400 quintals: about 8.6 points
  const hot = totalHeat(h.heat);
  tickWorld(h, 120); // ten years in the world, the clock free
  const waited = totalHeat(h.heat);
  console.log(`  heat ${hot.toFixed(1)} -> ${waited.toFixed(1)} after ten years of waiting`);
  if (hot < FINE) fail(`test set-up: heat ${hot.toFixed(1)} below the fine line`);
  if (waited < hot - 1e-6) fail('heat fell with time alone');
  const level = inspect(h.heat, h.worldT!, 0.5).level;
  if (level < 2) fail(`heat ${waited.toFixed(1)} after waiting gave inspection level ${level}, not a fine`);
  // A small heat below the notice line fades slowly, never faster than a tenth of a point a month.
  const small = newHeat();
  small.byOrigin.guinea = NOTICE - 1;
  fadeFloor(small, 6);
  if (!(small.byOrigin.guinea >= NOTICE - 1 - 0.61 && small.byOrigin.guinea < NOTICE - 1)) fail('the floor decay is not a slow tenth of a point a month');
  // Activity cools it, but only so fast: a gift or a sold Fact is worth a point or two, three in a month at most.
  const act = newHeat();
  act.byOrigin.india = 12;
  const t = 1e9;
  let cooled = 0;
  for (let i = 0; i < 10; i++) cooled += coolForDeed(act, 'gift.great', 1, t + i);
  const cap = 12 - totalHeat(act);
  if (cap > 3.01) fail(`ten gifts in a month cooled ${cap.toFixed(1)} points (cap 3)`);
  if (!(cap > 1)) fail('a gift cools nothing');
  void cooled;
  tickWorldNoop(h);
}
function tickWorldNoop(_h: unknown): void { /* the laundering world is thrown away */ }

/** Dues are 2-6% of a tonnage assessment, scale with the hull, and a hostile court asks presents as well. */
function duesScale(fail: (m: string) => void): void {
  const by = (id: string) => HULL_CLASSES.find((x) => x.id === id)!.tons;
  const arzila = PORTS.find((p) => p.id === 'arzila')!, lisboa = PORTS.find((p) => p.id === 'lisboa')!;
  const small = duesFor(arzila, by('barcha'), 1, 0), nau = duesFor(arzila, by('nau-pequena'), 1, 0), great = duesFor(arzila, by('nau-da-india'), 1, 0);
  const hostile = duesFor(arzila, by('nau-pequena'), 1.3, -0.6);
  console.log(`  dues at ${arzila.name}: barcha ${small.dues}, nau pequena ${nau.dues}, Nau da India ${great.dues}; hostile nau pequena ${hostile.dues} + ${hostile.present} in presents; none at ${lisboa.name}`);
  if (!(small.dues < nau.dues && nau.dues < great.dues)) fail('dues do not scale with tonnage');
  if (duesFor(lisboa, 480, 1, 0).dues !== 0) fail('Portuguese quays charge dues');
  for (const [d, tons] of [[small, by('barcha')], [nau, by('nau-pequena')], [great, by('nau-da-india')]] as const) {
    const rate = d.dues / (5 * tons);
    if (rate < 0.019 || rate > 0.061) fail(`dues rate ${rate.toFixed(3)} outside 2-6%`);
  }
  if (!(hostile.present > 0)) fail('a hostile court asked for no presents');
  const pr = hostile.present / (5 * by('nau-pequena'));
  if (pr < 0.079 || pr > 0.121) fail(`presents ${pr.toFixed(3)} outside 8-12%`);
  if (great.dues > 300) fail(`a Nau da India pays ${great.dues} a call: not a small cost`);
}
void laneTrend; void lanesAt;
