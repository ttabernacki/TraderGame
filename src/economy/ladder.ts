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
import type { PortDef } from '../world/ports';
import { fairsAt, FAIRS, regionOf, type Region } from './trade';
import { polityOfPort } from '../diplomacy/polities';

/** Tons: four times the hold of the next hull class up from the ones that call at a place this size. */
export const LOT_TONS: Record<PortDef['size'], number> = {
  anchorage: 4 * 30, village: 4 * 45, town: 4 * 105, city: 4 * 205, emporium: 4 * 400,
};

/**
 * Cruzados of profit a port will give a visiting captain in each dense good it
 * holds, in a season, by region (at wealth 1, level 1). The Portuguese and
 * Moroccan side is small on purpose (a coaster's cargo is wine and oil, not
 * silver); the figures climb with the distance from home, through the Swahili
 * coast and Arabia (kept low so a Nau still lands in its band), to India and the
 * East, where the Carreira pays: a single lane about 3,000, a Malabar tour many
 * times that. Tuned with scripts/econ.ts --ladder.
 */
export const PORT_PROFIT: Record<Region, number> = {
  europe: 70, atlantic: 70, maghreb: 70, guinea: 300, brazil: 550, kongo: 550, cape: 550,
  swahili: 900, arabia: 1300, india: 2900, east: 2900,
};

/**
 * The same, for what a port will buy: demand. Europe is the end of the line for
 * everything the Carreira brings home, so it is set above anything one hold can
 * supply (the supply caps then bind); elsewhere a port takes about as much as it gives.
 */
export const PORT_DEMAND: Record<Region, number> = {
  europe: 12000, atlantic: 350, maghreb: 350, guinea: 1800, brazil: 2900, kongo: 2900, cape: 2900,
  swahili: 3200, arabia: 3000, india: 4000, east: 4000,
};

/**
 * What a far market takes of the cheap bulk goods a ship brings from Portugal, as a
 * fraction of the tons the size of its town would suggest. India has rice and
 * dates of its own; a cask of Lisbon oil is a curiosity there, not a cargo, so a
 * hold of it must not out-earn a hold of pepper at the end of the longest road.
 */
export const STAPLE_DEMAND: Partial<Record<Region, number>> = { swahili: 0.4, arabia: 0.12, india: 0.08, east: 0.08 };

/**
 * Goods worth less than this per ton of hold (cruzados at Lisbon) are staples:
 * the tons cap alone binds, so on them the hold is the limit.
 */
export const STAPLE_DENSITY = 30;

/** A dense lot's margin per unit, as a fraction of its Lisbon price, on the lanes that pay (0.4 to 2). */
export const MARGIN_PER_LISBON = 1.2;

/** The trade parcel a port always has of any dense good it trades: this many units, or this much Lisbon value, whichever is less. */
export const PARCEL_UNITS = 6;
export const PARCEL_VALUE = 36;

/** The least a lot is, as a fraction of the full lot for its size and region. */
export const SHARE_FLOOR = 0.3;

/**
 * The Mina gold is the Atlantic's prize (the Casa takes its share of it at Lisbon): a
 * Guinea port that holds gold holds a good deal more than the region's other goods.
 */
export const GOLD_LOT = 1.6;

export const isStaple = (g: Good): boolean => g.lisbon / Math.max(g.bulk, 1e-4) <= STAPLE_DENSITY;

/**
 * Units a port will hold (kind 'produces') or take (kind 'wants') of a good,
 * at `level` (its abundance or its hunger, 0 to 1) and `scale` (roads and the like).
 */
export function lotUnits(def: PortDef, g: Good, kind: 'produces' | 'wants', level: number, scale = 1, worth = def.wealth): number {
  // `worth` is the port's wealth now: its constant wealth times its prosperity (world/tick); P = 1 is the constant.
  const wealth = SHARE_FLOOR + (1 - SHARE_FLOOR) * Math.min((0.5 + worth) / 1.5, 1.2);
  const lvl = SHARE_FLOOR + (1 - SHARE_FLOOR) * Math.min(Math.max(level, 0), 1);
  const byTons = (LOT_TONS[def.size] * lvl * wealth * scale) / Math.max(g.bulk, 1e-4);
  if (isStaple(g)) return kind === 'wants' ? byTons * (STAPLE_DEMAND[regionOf(def.id)] ?? 1) : byTons;
  // Whatever a port's money, it keeps a trade parcel of the cheap things (brass,
  // beads, cloth) so that barter and presents are never short: a few hundred
  // cruzados' worth at most.
  const parcel = Math.min(PARCEL_UNITS, PARCEL_VALUE / Math.max(g.lisbon, 0.01)) * (SHARE_FLOOR + (1 - SHARE_FLOOR) * Math.min(Math.max(level, 0), 1));
  // The port's money for dense goods, per good in proportion to its level.
  const byMoney = ((kind === 'produces' ? PORT_PROFIT : PORT_DEMAND)[regionOf(def.id)] * wealth * scale * Math.max(level, 0) * (g.id === 'ouro' && kind === 'produces' && regionOf(def.id) === 'guinea' ? GOLD_LOT : 1))
    / (MARGIN_PER_LISBON * Math.max(g.lisbon, 0.01));
  return Math.max(Math.min(byTons, byMoney), parcel);
}

// ---------------------------------------------------------------------------
// The second tier (BALANCE.md, "The deeper lots of Malabar")
// ---------------------------------------------------------------------------
//
// The first lot of a dense good at an Indian or Eastern port is what the Casa's factor and the
// Crown-scale traders hold for a visiting captain: money-capped (PORT_PROFIT), the same for a
// barcha and for a Nau. Behind it stand the big merchant houses' godowns, the Gujarati, Chinese
// and Arab warehouses and, in the harvest, the whole wholesale season. That stock is not shown to
// a man with a hold of forty tons and a purse to match; it is sold only to a buyer who can
// carry and pay for it, and dearer: the first unit of it costs DEEP_PRICE.base times the quote
// and the price climbs by DEEP_PRICE.rise by the bottom of the pool (Markets.slippage).

/** Tons a year the carrying polity can spare, order of magnitude (world/lanes reads the same table). */
export const POLITY_KT: Record<string, number> = { gujarat: 12000, calicut: 8000, kilwa: 2000, malindi: 1000, hormuz: 5000, aden: 5000, malacca: 8000 };
/** The same, for the polities the lanes did not need to name: the Malabar and Deccan houses. */
const HOUSE_KT: Record<string, number> = { ...POLITY_KT, cochin: 7000, kolathiri: 5000, bijapur: 6000, vijayanagara: 6000, kotte: 3000 };
/** What the houses of a region will sell a buyer who can lift it, in profit at the quote, per good (wealth 1, level 1, 8,000 kt polity). */
export const DEEP_PROFIT: Partial<Record<Region, number>> = { india: 9000, east: 9000 };
/** The price of the deep lot, as a multiple of the quoted ask: dearer at the top of the pool, dearer still at the bottom. */
export const DEEP_PRICE = { base: 1.6, rise: 1.6 };
/** A deep pool in the wholesale season (the pepper harvest, the clove ships) and out of it. */
export const DEEP_SEASON = { inSeason: 1.35, out: 0.85 };

/**
 * The same, for what the buyers behind the first lot will take at Lisbon: the Flemish and German houses (the Fuggers, the Welsers,
 * Antwerp's factors) who come for the autumn sale of the Casa's spice. A great hold of pepper has somewhere to go, at a worse price.
 */
export const DEEP_DEMAND: Partial<Record<Region, number>> = { europe: 20000 };
/** What those buyers pay: the first unit beyond the first lot fetches 1/base of the quoted bid, and a deep pool fully sold 1/(base+rise). */
export const DEEP_BID = { base: 1.3, rise: 1.5 };

/**
 * Units of a dense good the merchant houses of a port will sell (kind 'produces') or take (kind 'wants') to a buyer
 * who can lift them, over and above the first lot. 0 where there is no second tier.
 */
export function deepUnits(def: PortDef, g: Good, level: number, month: number, worth = def.wealth, kind: 'produces' | 'wants' = 'produces'): number {
  const money = (kind === 'produces' ? DEEP_PROFIT : DEEP_DEMAND)[regionOf(def.id)];
  if (!money || isStaple(g) || level <= 0) return 0;
  const wealth = SHARE_FLOOR + (1 - SHARE_FLOOR) * Math.min((0.5 + worth) / 1.5, 1.2);
  const kt = HOUSE_KT[polityOfPort(def.id)?.id ?? ''] ?? 5000;
  const houses = kind === 'wants' ? 1 : Math.min(Math.max(kt / 8000, 0.5), 1.5);
  // The wholesale season: the harvest fair of the port (what is sold) or the autumn sale (what is bought), if it has one for this good.
  const side = kind === 'produces' ? 'ask' : 'bid';
  const fairGood = FAIRS.some((f) => f.ports.includes(def.id) && f.goods[g.id]?.[side] !== undefined);
  const season = !fairGood ? 1 : fairsAt(def.id, month).some((f) => f.goods[g.id]?.[side] !== undefined) ? DEEP_SEASON.inSeason : DEEP_SEASON.out;
  return Math.floor((money * wealth * level * houses * season) / (MARGIN_PER_LISBON * Math.max(g.lisbon, 0.01)));
}
