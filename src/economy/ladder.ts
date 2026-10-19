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
 * season, by region, spread over the dense goods it trades. The Portuguese
 * and Moroccan side is small on purpose (a coaster's cargo is wine and oil, not
 * silver); the figures climb with the distance from home to the Indian Ocean
 * and fall back in India, where the Casa's share and the long road home eat the
 * rest. Tuned with scripts/econ.ts --ladder.
 */
export const PORT_PROFIT: Record<Region, number> = {
  europe: 210, atlantic: 210, maghreb: 210, guinea: 750, brazil: 5500, kongo: 5500, cape: 5500,
  swahili: 5000, arabia: 10900, india: 6300, east: 6300,
};

/**
 * The same, for what a port will buy: demand. Europe is the end of the line for
 * everything the Carreira brings home, so Lisbon and the ports that buy from it
 * want far more than they sell; elsewhere a port takes about as much as it gives.
 */
export const PORT_DEMAND: Record<Region, number> = {
  europe: 9000, atlantic: 1050, maghreb: 1050, guinea: 5600, brazil: 8800, kongo: 8800, cape: 8800,
  swahili: 9600, arabia: 9000, india: 7200, east: 7200,
};

/**
 * Goods worth less than this per ton of hold (cruzados at Lisbon) are staples:
 * the tons cap alone binds, so on them the hold is the limit.
 */
export const STAPLE_DENSITY = 30;

/** A dense lot's margin per unit, as a fraction of its Lisbon price, on the lanes that pay (0.4 to 2). */
export const MARGIN_PER_LISBON = 1.2;

/** The trade parcel a port always has of any dense good it trades: this many units, or this much Lisbon value, whichever is less. */
export const PARCEL_UNITS = 10;
export const PARCEL_VALUE = 60;

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
  // Whatever a port's money, it keeps a trade parcel of the cheap things (brass,
  // beads, cloth) so that barter and presents are never short: a few hundred
  // cruzados' worth at most.
  const parcel = Math.min(PARCEL_UNITS, PARCEL_VALUE / Math.max(g.lisbon, 0.01)) * (SHARE_FLOOR + (1 - SHARE_FLOOR) * Math.min(Math.max(level, 0), 1));
  // The port's money for dense goods, shared among the ones it trades in proportion to level.
  const byMoney = ((kind === 'produces' ? PORT_PROFIT : PORT_DEMAND)[regionOf(def.id)] * wealth * scale * (Math.max(level, 0) / denseSum(def, kind)))
    / (MARGIN_PER_LISBON * Math.max(g.lisbon, 0.01));
  return Math.max(Math.min(byTons, byMoney), parcel);
}
