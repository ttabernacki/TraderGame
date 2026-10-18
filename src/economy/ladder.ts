/**
 * The price ladder's stock caps (BUILD_PLAN B3).
 *
 * The core price formula is untouched. What moves is how much of a thing a port
 * holds and how much it will take:
 *
 *  - Staples (wine, oil, wheat, salt: cheap by the ton) are capped in tons, at four
 *    times the load of the hull class one above the ones that call there. That is
 *    deep enough that the hold, not the town, is the limit for every hull in the
 *    class, so a bigger hull earns in proportion.
 *  - Dense goods (a ton of pepper is five hundred cruzados, a ton of pearls fifty
 *    thousand) can never be limited by the hold; they are limited by what the
 *    people holding them will part with in a season. That is a sum of money for
 *    the whole port, set by the region it is in and shared among the dense goods
 *    it trades. A lot of them is a fortune to a small ship and a modest part of
 *    a great ship's cargo, and the seas a hull can reach pay what they pay.
 */
import type { Good } from './goods';
import { GOODS } from './goods';
import type { PortDef } from '../world/ports';
import { regionOf, type Region } from './trade';

/** Tons: four times the hold of the next hull class up from the ones that call at a place this size. */
export const LOT_TONS: Record<PortDef['size'], number> = {
  anchorage: 4 * 30, village: 4 * 45, town: 4 * 105, city: 4 * 205, emporium: 4 * 400,
};

/**
 * Cruzados of profit a whole port will give a visiting captain in dense goods in a
 * season, by region, spread over the dense goods it trades. This is where the
 * tier ladder's bands for the dearer seas live.
 */
export const PORT_PROFIT: Record<Region, number> = {
  europe: 1200, atlantic: 1200, maghreb: 1200, guinea: 2200, brazil: 3400, kongo: 3400, cape: 3400,
  swahili: 5400, arabia: 6800, india: 7800, east: 7800,
};

/**
 * Goods worth less than this per ton of hold (cruzados at Lisbon) are staples:
 * the tons cap alone binds, so on them the hold is the limit.
 */
export const STAPLE_DENSITY = 30;

/** A dense lot's margin per unit, as a fraction of its Lisbon price, on the lanes that pay (0.4 to 2). */
export const MARGIN_PER_LISBON = 1.2;

/** The least a lot is, as a fraction of the full lot for its size and region. */
export const SHARE_FLOOR = 0.3;

export const isStaple = (g: Good): boolean => g.lisbon / Math.max(g.bulk, 1e-4) <= STAPLE_DENSITY;

const denseSums = new Map<string, number>();
/** The sum of the dense-goods levels a port produces (or wants), cached: the port's definition never changes. */
function denseSum(def: PortDef, kind: 'produces' | 'wants'): number {
  const key = `${def.id}:${kind}`;
  let s = denseSums.get(key);
  if (s === undefined) {
    s = 0;
    for (const g of GOODS) if (!isStaple(g)) s += def[kind][g.id] ?? 0;
    denseSums.set(key, Math.max(s, 0.5));
  }
  return denseSums.get(key)!;
}

/**
 * Units a port will hold (kind 'produces') or take (kind 'wants') of a good,
 * at `level` (its abundance or its hunger, 0 to 1) and `scale` (roads and the like).
 */
export function lotUnits(def: PortDef, g: Good, kind: 'produces' | 'wants', level: number, scale = 1): number {
  const wealth = SHARE_FLOOR + (1 - SHARE_FLOOR) * Math.min((0.5 + def.wealth) / 1.5, 1.2);
  const lvl = SHARE_FLOOR + (1 - SHARE_FLOOR) * Math.min(Math.max(level, 0), 1);
  const byTons = (LOT_TONS[def.size] * lvl * wealth * scale) / Math.max(g.bulk, 1e-4);
  if (isStaple(g)) return byTons;
  // The port's money for dense goods, shared among the ones it trades in proportion to level.
  const byMoney = (PORT_PROFIT[regionOf(def.id)] * wealth * scale * (Math.max(level, 0) / denseSum(def, kind)))
    / (MARGIN_PER_LISBON * Math.max(g.lisbon, 0.01));
  return Math.min(byTons, byMoney);
}
