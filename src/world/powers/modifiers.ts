import { GOODS } from '../../economy/goods';
import { TRUNK } from '../../progression/road';
import { activeEffects, powerOfName } from './core';
import { FRONTS } from './data';
import { declareReader, declaredReaders } from './readers';
import { FRONT_IDS, type PowersState } from './types';
import { polityOfPort } from '../../diplomacy/polities';

/**
 * `marketModifiers(port, t)`: the ONLY interface between the Powers and the economy (BUILD_PLAN C2, D1).
 *
 * Powers never edit a price. A war, an embargo, a cartaz or a Front's stage is turned into multipliers on
 * what a port sells (stock), wants (appetite), asks and bids (price) and charges (dues), and the markets
 * apply them (economy/market `listings`). With nothing in force it returns the shared IDENTITY and the
 * economy computes exactly what it computed before this existed.
 *
 * Wars and embargoes close the LANE. They never close a trunk port to the flagship: there the ship is
 * let in at a toll (dear to buy, cheap to sell, dues doubled) and the reason is told. A port off the
 * trunk that is closed is closed.
 */

export interface MarketMods {
  priceMult: Record<string, number>;
  stockMult: Record<string, number>;
  appetiteMult: Record<string, number>;
  duesMult: number;
  /** The market is shut to this ship. Never true for a trunk port. */
  closed: boolean;
  /** The lane is shut: NPC traffic and the Lines do not run (D1 reads this). */
  laneClosed: boolean;
  /** Why, in the Book's voice; '' when nothing is in force. */
  reason: string;
  /** All the reasons, one per cause. */
  reasons: string[];
}

export const IDENTITY: MarketMods = Object.freeze({
  priceMult: Object.freeze({}), stockMult: Object.freeze({}), appetiteMult: Object.freeze({}),
  duesMult: 1, closed: false, laneClosed: false, reason: '', reasons: Object.freeze([]) as unknown as string[],
}) as MarketMods;

/** A closed lane on the trunk: scarce at the source, poor at the sink, and the harbour charges for the risk. */
export const TOLL = { price: 1.25, stock: 0.4, appetite: 0.6, dues: 2 };

const GOOD_IDS = GOODS.map((g) => g.id);
const trunk = new Set(TRUNK);

export { declareReader, declaredReaders };
declareReader('modifiers.stage');
declareReader('modifiers.dues');

function mulInto(into: Record<string, number>, goods: Record<string, number> | undefined): void {
  if (!goods) return;
  for (const [g, m] of Object.entries(goods)) {
    if (g === '*') for (const id of GOOD_IDS) into[id] = (into[id] ?? 1) * m;
    else into[g] = (into[g] ?? 1) * m;
  }
}

/** Dues a Power's regard sets at its own ports: a dead zone around indifference, so a stranger pays the ordinary. */
export function duesFromAttitude(att: number): number {
  if (att <= -0.3) return 1 + (-att - 0.3) * 0.5;
  if (att >= 0.5) return 1 - (att - 0.5) * 0.4;
  return 1;
}

function closeLane(m: MarketMods, port: string): void {
  m.laneClosed = true;
  if (!trunk.has(port)) { m.closed = true; return; }
  // Let in at a toll: the lane is shut, the road is not.
  for (const id of GOOD_IDS) {
    m.priceMult[id] = (m.priceMult[id] ?? 1) * TOLL.price;
    m.stockMult[id] = (m.stockMult[id] ?? 1) * TOLL.stock;
    m.appetiteMult[id] = (m.appetiteMult[id] ?? 1) * TOLL.appetite;
  }
  m.duesMult *= TOLL.dues;
  m.reasons.push('The lane is shut; the ship is let in at a toll.');
}

export function marketModifiers(port: string, t: number, st?: PowersState | null): MarketMods {
  if (!st) return IDENTITY;
  const effects = activeEffects(st, t).filter((e) => e.ports.includes(port));
  const stageFx = [];
  for (const id of FRONT_IDS) {
    const stage = st.fronts[id].stage;
    for (const fx of FRONTS[id].effects) {
      if (!fx.ports.includes(port) || stage < fx.minStage || (fx.maxStage !== undefined && stage > fx.maxStage)) continue;
      stageFx.push({ fx, front: id });
    }
  }
  // Attitude: the dues a Power's own ports ask of a captain it has made up its mind about.
  const pol = polityOfPort(port);
  const owner = pol ? powerOfName(pol.id) : null;
  const dues0 = owner ? duesFromAttitude(st.powers[owner].attitude) : 1;
  if (effects.length === 0 && stageFx.length === 0 && dues0 === 1) return IDENTITY;

  const m: MarketMods = { priceMult: {}, stockMult: {}, appetiteMult: {}, duesMult: dues0, closed: false, laneClosed: false, reason: '', reasons: [] };
  if (dues0 !== 1 && owner) {
    m.reasons.push(dues0 > 1 ? 'The court here has not forgiven what you did, and the dues say so.' : 'The court here remembers you kindly, and the dues are lighter.');
  }
  for (const e of effects) {
    mulInto(m.priceMult, e.price);
    mulInto(m.stockMult, e.stock);
    mulInto(m.appetiteMult, e.appetite);
    m.duesMult *= e.duesMult ?? 1;
    m.reasons.push(e.reason);
    if (e.closes) closeLane(m, port);
  }
  for (const { fx } of stageFx) {
    mulInto(m.priceMult, fx.price);
    mulInto(m.stockMult, fx.stock);
    mulInto(m.appetiteMult, fx.appetite);
    m.duesMult *= fx.duesMult ?? 1;
    m.reasons.push(fx.line);
    if (fx.closes) closeLane(m, port);
  }
  m.reason = m.reasons[0] ?? '';
  return m;
}

/** What a market multiplier says for one good. */
export const multOf = (table: Record<string, number>, goodId: string): number => table[goodId] ?? 1;
