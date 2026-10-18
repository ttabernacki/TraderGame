/**
 * Load-time resolvers for systems cut in Phase A3 (docs/CUTS.md). Each takes the
 * raw saved field, settles whatever was in flight into the live game, and drops
 * the field. They run from Game.deserialize and must be idempotent on saves that
 * no longer carry the old field.
 */
import type { Game } from './state';
import { UPGRADE_BY_ID, fitsHull, slotFittings, type SlotId } from '../ship/upgrades';
import { OLD_FITTING } from '../ship/oldFittings';
import { good, unitOf } from '../economy/goods';
import { PORTS, anchorageOf, portDef } from '../world/ports';
import { haversine } from '../core/math';
import { trimToHold } from './stores';

/** Full price of each level of each estate holding, as the old estate sold them. */
const HOLDING_COST: Record<string, number[]> = {
  casa: [3000, 5500, 9500], quinta: [4200], engenho: [6500], senhorio: [15000],
};

/**
 * estate.ts is gone. Holdings convert to purse at the price paid; income and
 * returns accrued but unpaid are paid out; a voyage outfitted but not yet home is
 * refunded its stake; unread letters go to the log. A lordship survives as
 * `g.lordship` (the King's Offer ending reads it).
 */
export function migrateEstate(g: Game, old: any): void {
  if (!old || typeof old !== 'object') return;
  let gold = 0;
  for (const [id, level] of Object.entries(old.holdings ?? {}) as [string, number][]) {
    const costs = HOLDING_COST[id] ?? [];
    for (let i = 0; i < Math.min(Number(level) || 0, costs.length); i++) gold += costs[i];
  }
  gold += Number(old.accrued) || 0;
  for (const o of old.outfits ?? []) if (!o.outcome) gold += Number(o.stake) || 0;
  gold = Math.round(gold);
  if (gold > 0) {
    g.crown.gold += gold;
    g.logEvent('trade', `Your affairs at home have been wound up and paid over: ${gold} cruzados.`, true);
  }
  for (const n of old.news ?? []) g.logEvent('trade', String(n), true);
  if (old.lordship && !g.lordship) g.lordship = String(old.lordship);
}

/** Port, by the ids of the goods-delivery errands cut in A3 (portCharacter.ts used to hold them). */
const OLD_PORT_QUESTS: Record<string, string> = {
  'funchal-wheat': 'funchal', 'benin-coral': 'ugoton', 'kongo-tools': 'mpinda', 'melinde-horses': 'melinde',
};

/**
 * PortQuest goods-delivery errands are gone. The only state they had was the set
 * of those already done, which is simply dropped. An errand still open (never
 * done) where the captain is docked is cancelled with one log line; nothing is
 * refunded, because nothing was ever taken before delivery.
 */
export function cancelPortQuests(g: Game, done: string[] | undefined): void {
  const at = g.dockedAt;
  if (!at) return;
  const finished = new Set(done ?? []);
  const open = Object.entries(OLD_PORT_QUESTS).find(([id, port]) => port === at && !finished.has(id));
  if (open) g.logEvent('note', 'The town’s errand for goods is withdrawn; nobody here is asking any more.', true);
}

/** Pieces cut in A3, folded into the Gift Table (meal, hall) and the Case (linguist). */
const FOLDED_PIECES = new Set(['meal', 'hall', 'linguist']);

/**
 * A Meal, Hall or Linguist piece still open in a save is settled neutrally: a
 * half-grade outcome with no marks, measures or Book entries, so the court
 * neither thinks better nor worse of the captain. The finished ones stay in the
 * ledger as history. One log line says so.
 */
export function settleFoldedPieces(g: Game): void {
  let n = 0;
  for (const run of g.diplomacy.pieces.runs) {
    if (run.outcome || !FOLDED_PIECES.has(run.pieceId)) continue;
    run.outcome = { grade: 'half', line: 'The matter was let drop', t: g.clock.t };
    n++;
  }
  if (n) g.logEvent('contact', `${n === 1 ? 'An audience matter' : `${n} audience matters`} left open at court ${n === 1 ? 'was' : 'were'} let drop, with no offence taken.`, true);
}

/**
 * B3: eighty upgrades became twenty-four fittings in six slots. A save written
 * with the old tree has its work mapped to the nearest fitting in each slot
 * (OLD_FITTING), the heaviest in a slot winning; what has no berth any more is
 * paid back at half what it cost. Instruments are never dropped: every old
 * navigation work maps to an instruments fitting, and a ship with three of them
 * (or the Casa's charts) gets the best one. One log line says what happened.
 */
export function migrateFittings(g: Game): void {
  const old = g.ship.upgrades.filter((id) => !UPGRADE_BY_ID.has(id));
  if (old.length === 0) return;
  const kept = g.ship.upgrades.filter((id) => UPGRADE_BY_ID.has(id));
  const hullId = g.ship.hullId;
  const want = new Map<string, Set<string>>(); // slot -> candidate new ids
  const navOld = old.filter((id) => {
    const to = OLD_FITTING[id]?.[0];
    return to && UPGRADE_BY_ID.get(to)?.slot === 'instruments';
  });
  for (const id of old) {
    const to = OLD_FITTING[id]?.[0];
    const u = to ? UPGRADE_BY_ID.get(to) : undefined;
    if (!u) continue;
    if (!want.has(u.slot)) want.set(u.slot, new Set());
    want.get(u.slot)!.add(u.id);
  }
  if (navOld.length >= 3) want.get('instruments')!.add('cartas-casa');
  const chosen: string[] = [];
  for (const [slot, ids] of want) {
    if (kept.some((id) => UPGRADE_BY_ID.get(id)?.slot === slot)) continue;
    const ladder = slotFittings(slot as SlotId);
    const top = Math.max(...[...ids].map((id) => ladder.findIndex((u) => u.id === id)));
    // The heaviest that was asked for and that the hull can take, else the next one down.
    for (let i = top; i >= 0; i--) {
      if (fitsHull(ladder[i], hullId)) { chosen.push(ladder[i].id); break; }
    }
  }
  const fitted = kept.concat(chosen);
  g.ship.upgrades = fitted;
  const struck = old.filter((id) => {
    const to = OLD_FITTING[id]?.[0];
    return !to || !chosen.includes(to);
  });
  const refund = Math.round(struck.reduce((s, id) => s + (OLD_FITTING[id]?.[1] ?? 0), 0) * 0.5);
  if (refund > 0) g.crown.gold += refund;
  g.ship.applyRigConversion();
  g.ship.refreshDerived();
  const names = chosen.map((id) => UPGRADE_BY_ID.get(id)!.english).join('; ');
  g.logEvent('note',
    `The yard has re-measured her fitting-out into six berths${names ? `: ${names}` : ''}.`
    + `${refund > 0 ? ` Work that no longer has a berth was taken out and paid back at half price, ${refund} cruzados.` : ''}`, true);
}

/**
 * B3: stores now weigh tons and share the hold with the cargo. A save whose
 * cargo, officers' chests and stores together exceed the hold has its surplus
 * cargo sold at the port she is in, or the nearest, cheapest per ton first, and
 * one log line says so. Idempotent: a ship that fits is left alone.
 */
export function settleStoresOverflow(g: Game): void {
  const over = () => g.ship.cargoTons + g.ship.reservedTons + g.ship.storesTons - g.ship.holdCapacity;
  if (over() <= 0.001) return;
  let port = g.dockedAt;
  if (!port) {
    let best = Infinity;
    for (const p of PORTS) {
      const d = haversine(g.ship.state.pos, anchorageOf(p));
      if (d < best) { best = d; port = p.id; }
    }
  }
  if (!port) return;
  const listings = g.markets.listings(port, g.clock.t, 0, 0, g.ship.cargo.map((l) => l.goodId));
  const lots = [...g.ship.cargo].sort((a, b) => good(a.goodId).lisbon / good(a.goodId).bulk - good(b.goodId).lisbon / good(b.goodId).bulk);
  let tons = 0, gold = 0;
  const parts: string[] = [];
  for (const lot of lots) {
    const excess = over();
    if (excess <= 0.001) break;
    const gd = good(lot.goodId);
    const qty = Math.min(lot.quantity, Math.ceil(excess / gd.bulk));
    const bid = listings.find((l) => l.goodId === lot.goodId)?.bid ?? gd.lisbon * 0.3;
    const got = g.ship.removeCargo(lot.goodId, qty);
    tons += got * gd.bulk;
    gold += got * bid * 0.9;
    parts.push(`${Math.round(got)} ${unitOf(gd, got)} of ${gd.english.toLowerCase()}`);
  }
  gold = Math.round(gold);
  g.crown.gold += gold;
  trimToHold(g);
  if (parts.length) {
    g.logEvent('trade',
      `Her hold was measured again with the stores in it, and would not take all of the cargo. `
      + `${parts.join(', ')} (${tons.toFixed(1)} tons) went ashore at ${portDef(port).name} for ${gold} cruzados.`, true);
  }
}
