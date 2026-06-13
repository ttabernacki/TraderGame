import type { GameState, CityId } from "./types";

// Fog of prices: you only see a market's live state while one of your
// caravans is in the city. Every day a caravan spends somewhere, its factor
// files a report; elsewhere you trade on stale intelligence.

export function hasPresence(state: GameState, cityId: CityId): boolean {
  return state.caravans.some((c) => c.cityId === cityId);
}

export function snapshotCity(state: GameState, cityId: CityId) {
  const market = state.markets[cityId];
  if (!market) return;
  state.intel[cityId] = {
    prices: { ...market.prices },
    stock: { ...market.stock },
    date: { ...state.date },
  };
}

export function tickIntelDay(state: GameState) {
  for (const c of state.caravans) {
    if (c.cityId) snapshotCity(state, c.cityId);
  }
}
