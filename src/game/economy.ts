import type { City, CityMarket, GoodId, GameState, CityId } from "./types";
import { GOODS, GOOD_BY_ID, ALL_GOOD_IDS } from "../data/goods";
import { CITY_BY_ID } from "../data/cities";

// Reference stock for a city of 20,000 souls. Larger cities hold deeper
// markets: the same purchase moves prices far less in Antwerp than in Basel.
export const BASE_REFERENCE_STOCK = 60;

export function cityScale(city: City): number {
  return Math.min(2.6, Math.max(0.5, city.population / 20000));
}

export function refStock(city: City): number {
  return BASE_REFERENCE_STOCK * cityScale(city);
}

// Manufactured goods consume an input good from the same city's market.
// Production stalls when the input runs dry — hauling inputs to industrial
// towns is a business of its own.
export const PRODUCTION_CHAINS: Partial<Record<GoodId, { input: GoodId; ratio: number }>> = {
  cloth: { input: "wool", ratio: 1.5 },
  weapons: { input: "iron", ratio: 1.5 },
  beer: { input: "grain", ratio: 0.6 },
};

// Seasonal production: harvest goods concentrate the year's output in a few
// months. Multipliers average to roughly 1 across the calendar.
export function prodSeasonMult(good: GoodId, month: number): number {
  switch (good) {
    case "grain": return month === 8 || month === 9 ? 4.5 : 0.2;
    case "wine": return month === 9 || month === 10 ? 4.5 : 0.25;
    case "wool": return month === 5 || month === 6 ? 3.2 : 0.45;
    default: return 1;
  }
}

export function consSeasonMult(good: GoodId, month: number): number {
  const winter = month === 12 || month === 1 || month === 2;
  const festive = month === 10 || month === 11 || month === 12;
  if (good === "grain" && winter) return 1.15;
  if ((good === "beer" || good === "wine") && festive) return 1.25;
  return 1;
}

export function computePrice(goodId: GoodId, stock: number, ref: number): number {
  const base = GOOD_BY_ID[goodId].basePrice;
  const soft = ref * 0.13;
  const ratio = (ref + soft) / (stock + soft);
  const mult = Math.max(0.4, Math.min(3.0, Math.pow(ratio, 0.85)));
  return Math.max(1, Math.round(base * mult));
}

export function initMarket(city: City): CityMarket {
  const stock: Record<GoodId, number> = {} as Record<GoodId, number>;
  const prices: Record<GoodId, number> = {} as Record<GoodId, number>;
  const priceHistory: Record<GoodId, number[]> = {} as Record<GoodId, number[]>;
  const ref = refStock(city);
  for (const g of GOODS) {
    const prod = city.produces[g.id] ?? 0;
    const cons = city.consumes[g.id] ?? 0;
    let s = ref;
    if (prod > 0 && prod >= cons) s = ref * 1.4;
    else if (prod === 0 && cons > 0) s = ref * 0.5;
    stock[g.id] = s;
    prices[g.id] = computePrice(g.id, s, ref);
    priceHistory[g.id] = [prices[g.id]];
  }
  return { cityId: city.id, stock, prices, priceHistory };
}

export function tickEconomyDay(state: GameState) {
  const month = state.date.month;
  for (const city of state.cities) {
    const market = state.markets[city.id];
    const ref = refStock(city);

    // 1. Raw production (goods without an input chain).
    for (const goodId of ALL_GOOD_IDS) {
      if (PRODUCTION_CHAINS[goodId]) continue;
      const prod = city.produces[goodId] ?? 0;
      if (prod > 0) market.stock[goodId] += prod * prodSeasonMult(goodId, month);
    }

    // 2. Chained production, limited by input availability.
    for (const goodId of ALL_GOOD_IDS) {
      const chain = PRODUCTION_CHAINS[goodId];
      if (!chain) continue;
      const prod = city.produces[goodId] ?? 0;
      if (prod <= 0) continue;
      const maxByInput = market.stock[chain.input] / chain.ratio;
      const made = Math.min(prod, maxByInput);
      if (made <= 0) continue;
      market.stock[chain.input] -= made * chain.ratio;
      market.stock[goodId] += made;
    }

    // 3. Civilian consumption, with demand elasticity: when a good grows
    //    scarce the populace rations it, so consumption tapers instead of
    //    driving stock to a hard zero. This keeps a small living buffer
    //    (and thus meaningful price movement) at pure-consumer cities.
    for (const goodId of ALL_GOOD_IDS) {
      const cons = city.consumes[goodId] ?? 0;
      if (cons <= 0) continue;
      const scarcityFloor = ref * 0.18;
      const s = market.stock[goodId];
      const ration = s >= scarcityFloor ? 1 : Math.max(0, s / scarcityFloor);
      const draw = cons * consSeasonMult(goodId, month) * ration;
      market.stock[goodId] = Math.max(0, s - draw);
    }

    // 4. Background restock toward reference. Pulls harder on the scarce side
    //    than the glut side so consumer cities settle at a low-but-nonzero
    //    buffer while producers can still build large seasonal surpluses.
    for (const goodId of ALL_GOOD_IDS) {
      const s = market.stock[goodId];
      const k = s < ref ? 0.01 : 0.003;
      market.stock[goodId] = s + (ref - s) * k;
      market.prices[goodId] = computePrice(goodId, market.stock[goodId], ref);
    }
  }

  // Monthly price history sample.
  if (state.date.day === 1) {
    for (const city of state.cities) {
      const market = state.markets[city.id];
      for (const goodId of ALL_GOOD_IDS) {
        const hist = market.priceHistory[goodId];
        hist.push(market.prices[goodId]);
        if (hist.length > 24) hist.shift();
      }
    }
  }
}

export interface TradeResult {
  units: number;
  gold: number; // total gold moved: spent if buying, earned if selling
}

// Executes a trade unit-by-unit against the moving price curve, so large
// orders in shallow markets pay for their own impact. Stops early on price
// limit, empty treasury (buy), or exhausted market stock (buy).
// Caller is responsible for cargo capacity and cargo mutation.
export function executeTrade(
  state: GameState,
  cityId: CityId,
  goodId: GoodId,
  mode: "buy" | "sell",
  maxUnits: number,
  priceLimit?: number,
): TradeResult {
  const city = CITY_BY_ID[cityId];
  const market = state.markets[cityId];
  if (!city || !market || maxUnits <= 0) return { units: 0, gold: 0 };
  const ref = refStock(city);
  let units = 0;
  let gold = 0;
  while (units < maxUnits) {
    const p = market.prices[goodId];
    if (mode === "buy") {
      if (priceLimit !== undefined && p > priceLimit) break;
      if (state.treasury < p) break;
      if (market.stock[goodId] < 1) break;
      state.treasury -= p;
      market.stock[goodId] -= 1;
      gold += p;
    } else {
      if (priceLimit !== undefined && p < priceLimit) break;
      state.treasury += p;
      market.stock[goodId] += 1;
      gold += p;
    }
    units += 1;
    market.prices[goodId] = computePrice(goodId, market.stock[goodId], ref);
  }
  return { units, gold };
}

export function priceTrend(market: CityMarket, goodId: GoodId): "up" | "down" | "flat" {
  const h = market.priceHistory[goodId];
  if (h.length < 2) return "flat";
  const prev = h[h.length - 2];
  const cur = market.prices[goodId];
  if (cur > prev * 1.04) return "up";
  if (cur < prev * 0.96) return "down";
  return "flat";
}
