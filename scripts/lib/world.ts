/**
 * `econ.ts --world`: the 24-month world with nobody in it, and the prosperity falsifiers.
 *
 *  - no port goes to zero stock, prices stay in band;
 *  - across seeds, no port ends pinned at a prosperity bound in more than 20% of runs;
 *  - a funded quay raises P, with diminishing returns by level, by P and by port size;
 *  - a shock lowers P, and it recovers;
 *  - the worlds' shocks (plague, famine, war) move the ports they name.
 */
import { GOODS, good } from '../../src/economy/goods';
import { PORTS, portDef } from '../../src/world/ports';
import {
  MONTH, P_MAX, P_MIN, civicGain, fundedCivic, portState, prosperityOf, prosperityShock, tickWorld,
} from '../../src/world/tick';
import { makeHost } from './worldHost';

const SEEDS = Number(process.env.WORLD_SEEDS ?? 20);
const MONTHS = 24;
const PRICE_BAND = 8; // x Lisbon: a base of 4 under a doubling shock.

export function runWorld(): boolean {
  const fails: string[] = [];
  const fail = (m: string): void => { fails.push(m); };

  // --- 24 months, no player, many seeds ---
  const pinnedAt = new Map<string, number>();
  const everLow = new Map<string, number>();
  let zero = 0, off = 0, minP = 9, maxP = 0, dropped = 0, moved = 0;
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
        if (P > 1.2) moved++;
        if (P < 0.9) dropped++;
        for (const l of h.markets.listings(p.id, t, 0, 0)) {
          const g = good(l.goodId);
          if (l.local && l.stock <= 0) zero++;
          if (!(l.ask > 0) || !(l.bid > 0) || l.ask > g.lisbon * PRICE_BAND || l.bid > g.lisbon * PRICE_BAND) off++;
        }
      }
    }
    for (const p of PORTS) {
      const P = prosperityOf(h, p.id);
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

  if (fails.length) { console.log('WORLD FAILED:\n  ' + fails.join('\n  ')); return false; }
  console.log('WORLD PASSED');
  return true;
}
void MONTH;
