import type { GameState, CityId } from "./types";

// Fog of prices: you only see a market's live state while you have a presence
// there — a caravan in the city, or a permanent warehouse. Every day a
// presence files a report; elsewhere you trade on stale intelligence.

export function hasPresence(state: GameState, cityId: CityId): boolean {
  if (state.warehouses[cityId]) return true;
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
  for (const cityId of Object.keys(state.warehouses)) {
    snapshotCity(state, cityId);
  }
}
