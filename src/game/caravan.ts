import type { Caravan, GameState, City, GoodId } from "./types";
import { CITY_BY_ID, cityDistanceKm } from "../data/cities";
import { pushLog } from "./log";

// Caravan travels at ~30 km/day overland (mules + carts on the Empire's roads).
const CARAVAN_KM_PER_DAY = 30;

export function makeStartingCaravans(homeCityId: string): Caravan[] {
  return [
    {
      id: "caravan-1",
      name: "Erste Kompagnie",
      capacity: 40,
      cargo: {},
      speed: CARAVAN_KM_PER_DAY,
      status: "idle",
      cityId: homeCityId,
      fromCityId: null,
      toCityId: null,
      travelProgress: 0,
      travelDuration: 0,
    },
    {
      id: "caravan-2",
      name: "Zweite Kompagnie",
      capacity: 40,
      cargo: {},
      speed: CARAVAN_KM_PER_DAY,
      status: "idle",
      cityId: homeCityId,
      fromCityId: null,
      toCityId: null,
      travelProgress: 0,
      travelDuration: 0,
    },
  ];
}

export function caravanCargoUnits(c: Caravan): number {
  let n = 0;
  for (const k of Object.keys(c.cargo) as GoodId[]) n += c.cargo[k] ?? 0;
  return n;
}

export function dispatchCaravan(state: GameState, caravanId: string, toCityId: string) {
  const caravan = state.caravans.find((c) => c.id === caravanId);
  if (!caravan || caravan.status !== "idle" || !caravan.cityId) return;
  if (caravan.cityId === toCityId) return;
  const from = CITY_BY_ID[caravan.cityId];
  const to = CITY_BY_ID[toCityId];
  if (!from || !to) return;
  const km = cityDistanceKm(from, to);
  const days = Math.max(1, Math.round(km / caravan.speed));
  caravan.status = "traveling";
  caravan.fromCityId = from.id;
  caravan.toCityId = to.id;
  caravan.cityId = null;
  caravan.travelProgress = 0;
  caravan.travelDuration = days;
  pushLog(state, `${caravan.name} departs ${from.name} for ${to.name} (${Math.round(km)} km, ~${days} days).`, "info");
}

export function tickCaravans(state: GameState, days: number) {
  for (const c of state.caravans) {
    if (c.status !== "traveling") continue;
    c.travelProgress += days;
    if (c.travelProgress >= c.travelDuration) {
      // Arrived.
      c.status = "idle";
      c.cityId = c.toCityId;
      c.fromCityId = null;
      c.toCityId = null;
      c.travelProgress = 0;
      c.travelDuration = 0;
      const city = c.cityId ? CITY_BY_ID[c.cityId] : null;
      if (city) pushLog(state, `${c.name} arrives at ${city.name}.`, "info");
    }
  }
}

export function travelKmAndDays(fromId: string, toId: string, speed: number) {
  const from = CITY_BY_ID[fromId];
  const to = CITY_BY_ID[toId];
  if (!from || !to) return { km: 0, days: 0 };
  const km = cityDistanceKm(from, to);
  return { km, days: Math.max(1, Math.round(km / speed)) };
}

export function caravanCurrentPos(c: Caravan): { fromId: string; toId: string; t: number } | null {
  if (c.status !== "traveling" || !c.fromCityId || !c.toCityId) return null;
  const t = c.travelDuration <= 0 ? 1 : Math.min(1, c.travelProgress / c.travelDuration);
  return { fromId: c.fromCityId, toId: c.toCityId, t };
}

export function caravanCityResolved(c: Caravan): City | null {
  if (c.cityId) return CITY_BY_ID[c.cityId] ?? null;
  return null;
}
