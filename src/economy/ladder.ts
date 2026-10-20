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
import { MONOPOLY, fairsAt, FAIRS, regionOf, type Region } from './trade';
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
  swahili: 900, arabia: 1300, india: 2200, east: 2200,
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
  const byMoney = ((kind === 'produces' ? PORT_PROFIT : PORT_DEMAND)[regionOf(def.id)] * wealth * scale * Math.max(level, 0) * (g.id === 'ouro' && kind === 'produces' && regionOf(def.id) === 'guinea' ? GOLD_LOT : 1) * (kind === 'produces' && hasDeepTier(def, g) ? SPICE_FIRST_LOT.share : 1))
    / (MARGIN_PER_LISBON * Math.max(g.lisbon, 0.01));
  // The autumn sale at Lisbon: the Flemish and German houses (the Fuggers, the Welsers, Antwerp's factors) come for the Casa's
  // spice with money to spare, so the quay's money cap does not bind: Lisbon takes what the quay can handle, and more in the sale.
  if (kind === 'wants' && autumnGood(def, g)) return Math.max(byTons * AUTUMN_SALE.depth, parcel);
  return Math.max(Math.min(byTons, byMoney), parcel);
}

// ---------------------------------------------------------------------------
// The second tier (docs/BALANCE.md, "The deeper lots of Malabar")
// ---------------------------------------------------------------------------
//
// The first lot of a spice at an Indian or Eastern port is what the Casa's factor and the Crown-scale
// traders keep for a visiting captain: money-capped (PORT_PROFIT), the same for a barcha and for a Nau.
// Behind it stand the big merchant houses' godowns, the Gujarati, Chinese and Arab warehouses and, in
// the harvest, the wholesale season. That stock is sold only to a buyer who can carry and pay for it,
// and dearer: the first ton of it leaves a carrier DEEP_PRICE.perTon cruzados under what the good
// fetches at home, and the price climbs to the full return by the bottom of the pool. A great hold
// works down the pool until nothing pays; a small one never reaches the dear end. The order of the
// price curve is in `Markets.slippage(quantity, stock, lot, curve)`.

/**
 * Where there is a deeper tier, the first lot of spice is only what the Casa's factor and the Crown-scale traders keep for a visiting
 * captain: this share of the port's money cap. The rest of what the port holds is behind it (DEEP_TONS).
 */
export const SPICE_FIRST_LOT = { share: 0.23 };
/** Tons a year the carrying polity can spare, order of magnitude (world/lanes reads the same table). */
export const POLITY_KT: Record<string, number> = { gujarat: 12000, calicut: 8000, kilwa: 2000, malindi: 1000, hormuz: 5000, aden: 5000, malacca: 8000 };
/** The same, for the polities the lanes did not need to name: the Malabar and Deccan houses. */
const HOUSE_KT: Record<string, number> = { ...POLITY_KT, cochin: 7000, kolathiri: 5000, bijapur: 6000, vijayanagara: 6000, kotte: 3000 };
/** The regions with a second tier: the Malabar and Deccan coast, Ceylon and Malacca. Everywhere else the first lot is all there is. */
export const DEEP_REGIONS: ReadonlySet<Region> = new Set<Region>(['india', 'east']);
/**
 * Tons of one good the houses of a port hold in their godowns, at level 1 in a port of wealth 1 whose polity carries 8,000 kt a year
 * (Calecute, Malacca): the houses of a bigger polity (Gujarat) hold more, a smaller one less, a port's wealth and prosperity scale it as
 * they scale everything else, and the harvest fair opens it. `cap` is the most any port ever holds of one good: a godown, not a country.
 */
export const DEEP_TONS = { house: 240, cap: 70 };
/**
 * The houses price their godowns like a freight rate: `homeReturn` is the most a unit fetches a captain on a Portuguese quay (the
 * Casa's hunger at its keenest, less the dealer's spread; the Casa's own cut of the King's goods is not in it), and the first unit
 * of the deep lot costs that less `perTon` cruzados a ton of hold: the margin a carrier keeps on the first ton he lifts, the same
 * whatever the good, so a hold of ginger and a hold of cinnamon pay alike. It is the first ton only: the price climbs to the full
 * return by the bottom of the pool, the margin on the last ton is nothing, and that is where a great hold stops buying.
 * `floor` is the least multiple of the quote the deep lot ever costs.
 */
export const DEEP_PRICE = { perTon: 58, floor: 1.15 };
/**
 * The curve (multiples of the quoted ask) for a deep lot, given what a unit of the good fetches now on the best Portuguese quay
 * (`homeReturn`: the houses write to Lisbon, Porto and Lagos and know what they pay, today). The Casa's own cut of the King's
 * goods is not in it.
 */
export function deepCurve(ask: number, g: Good, homeReturn: number): { base: number; rise: number } {
  const margin = Math.max(0, Math.min(DEEP_PRICE.perTon * g.bulk, homeReturn - ask));
  return { base: Math.max(DEEP_PRICE.floor, (homeReturn - margin) / Math.max(ask, 0.01)), rise: margin / Math.max(ask, 0.01) };
}
/** A deep pool in the wholesale season (the pepper harvest, the clove ships) and out of it. */
export const DEEP_SEASON = { inSeason: 1.35, out: 0.85 };

/** Whether the houses of this port keep a deeper pool of this good: the spices, but not the King's pepper (the Casa buys that itself). */
export const hasDeepTier = (def: PortDef, g: Good): boolean =>
  DEEP_REGIONS.has(regionOf(def.id)) && g.category === 'spice' && !MONOPOLY.includes(g.id);

/**
 * Units of a spice the merchant houses of a port will sell to a buyer who can lift them, over and above the first lot.
 * 0 where there is no second tier (every port outside India and the East, the King's pepper, and everything that is not a spice).
 */
export function deepUnits(def: PortDef, g: Good, level: number, month: number, worth = def.wealth): number {
  if (!hasDeepTier(def, g) || level <= 0) return 0;
  const wealth = SHARE_FLOOR + (1 - SHARE_FLOOR) * Math.min((0.5 + worth) / 1.5, 1.2);
  const kt = HOUSE_KT[polityOfPort(def.id)?.id ?? ''] ?? 5000;
  const houses = Math.min(Math.max(kt / 8000, 0.5), 1.5);
  // The wholesale season: the harvest fair of the port (the pepper harvest, the clove ships), if it has one for this good.
  const fairGood = FAIRS.some((f) => f.ports.includes(def.id) && f.goods[g.id]?.ask !== undefined);
  const season = !fairGood ? 1 : fairsAt(def.id, month).some((f) => f.goods[g.id]?.ask !== undefined) ? DEEP_SEASON.inSeason : DEEP_SEASON.out;
  return Math.floor(Math.min(DEEP_TONS.house * wealth * level * houses * season, DEEP_TONS.cap) / Math.max(g.bulk, 1e-4));
}

/**
 * The autumn sale at Lisbon (trade.ts FAIRS 'lisbon-spices'): the Flemish and German houses come for the Casa's spice, so Lisbon
 * takes this many times the lot of any good the sale is for. Without it the first cargo of a great hold would sink the price
 * of the quay it is sold on: supply is deep now, so the home market has to be.
 */
export const AUTUMN_SALE = { depth: 3 };
const autumnGood = (def: PortDef, g: Good): boolean => FAIRS.some((f) => f.ports.includes(def.id) && f.goods[g.id]?.bid !== undefined);
