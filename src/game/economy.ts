import type { City, CityMarket, GoodId, GameState } from "./types";
import { GOODS, GOOD_BY_ID, ALL_GOOD_IDS } from "../data/goods";

export const REFERENCE_STOCK = 60;

export function initMarket(city: City): CityMarket {
  const stock: Record<GoodId, number> = {} as Record<GoodId, number>;
  const prices: Record<GoodId, number> = {} as Record<GoodId, number>;
  const priceHistory: Record<GoodId, number[]> = {} as Record<GoodId, number[]>;
  for (const g of GOODS) {
    const prod = city.produces[g.id] ?? 0;
    const cons = city.consumes[g.id] ?? 0;
    // Initial stock weighted toward producers.
    let s = REFERENCE_STOCK;
    if (prod > cons) s = REFERENCE_STOCK * 1.5;
    else if (cons > prod && prod === 0) s = REFERENCE_STOCK * 0.4;
    stock[g.id] = s;
    prices[g.id] = computePrice(g.id, s);
    priceHistory[g.id] = [prices[g.id]];
  }
  return { cityId: city.id, stock, prices, priceHistory };
}

export function computePrice(goodId: GoodId, stock: number): number {
  const base = GOOD_BY_ID[goodId].basePrice;
  // Multiplier between ~0.45 and ~2.5 based on stock vs reference.
  const ratio = (REFERENCE_STOCK + 8) / (stock + 8);
  const mult = Math.max(0.45, Math.min(2.5, Math.pow(ratio, 0.85)));
  return Math.max(1, Math.round(base * mult));
}

const SMOOTH_DAYS = 30;

export function tickEconomy(state: GameState, days: number) {
  for (const city of state.cities) {
    const market = state.markets[city.id];
    for (const goodId of ALL_GOOD_IDS) {
      const prod = city.produces[goodId] ?? 0;
      const cons = city.consumes[goodId] ?? 0;
      const net = prod - cons;
      let stock = market.stock[goodId] + net * days;
      // Mild drift toward reference to avoid runaway accumulation.
      const drift = (REFERENCE_STOCK - stock) * 0.002 * days;
      stock += drift;
      stock = Math.max(0, stock);
      market.stock[goodId] = stock;
      market.prices[goodId] = computePrice(goodId, stock);
    }
  }
  // Append to price history once per ~SMOOTH_DAYS.
  const totalDays = state.date.year * 372 + state.date.month * 31 + state.date.day;
  if (Math.floor(totalDays / SMOOTH_DAYS) !== Math.floor((totalDays - days) / SMOOTH_DAYS)) {
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

export function priceTrend(market: CityMarket, goodId: GoodId): "up" | "down" | "flat" {
  const h = market.priceHistory[goodId];
  if (h.length < 2) return "flat";
  const prev = h[h.length - 2];
  const cur = market.prices[goodId];
  if (cur > prev * 1.04) return "up";
  if (cur < prev * 0.96) return "down";
  return "flat";
}
