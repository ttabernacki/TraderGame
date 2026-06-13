import type { Caravan, GameState, GoodId } from "./types";
import { CITY_BY_ID, cityDistanceKm } from "../data/cities";
import { pushLog } from "./log";

// Caravan travels at ~30 km/day overland (mules + carts on the Empire's roads).
const CARAVAN_KM_PER_DAY = 30;
const WINTER_SPEED_MULT = 0.7;

export const CARAVAN_HIRE_COST = 600;

const ORDINALS = [
  "Erste", "Zweite", "Dritte", "Vierte", "Fünfte",
  "Sechste", "Siebte", "Achte", "Neunte", "Zehnte",
];

function caravanName(index: number): string {
  if (index < ORDINALS.length) return `${ORDINALS[index]} Kompagnie`;
  return `Kompagnie ${index + 1}`;
}

function makeCaravan(index: number, cityId: string): Caravan {
  return {
    id: `caravan-${index + 1}`,
    name: caravanName(index),
    capacity: 40,
    cargo: {},
    speed: CARAVAN_KM_PER_DAY,
    status: "idle",
    cityId,
    fromCityId: null,
    toCityId: null,
    travelProgress: 0,
    travelDuration: 0,
    routeId: null,
    routeStopIndex: 0,
    loadingDays: 0,
  };
}

export function makeStartingCaravans(homeCityId: string): Caravan[] {
  return [makeCaravan(0, homeCityId), makeCaravan(1, homeCityId)];
}

export function hireCaravan(state: GameState, cityId: string): Caravan | null {
  if (state.treasury < CARAVAN_HIRE_COST) return null;
  state.treasury -= CARAVAN_HIRE_COST;
  const caravan = makeCaravan(state.caravans.length, cityId);
  state.caravans.push(caravan);
  const city = CITY_BY_ID[cityId];
  pushLog(state, `${caravan.name} hired in ${city?.name ?? cityId} for ${CARAVAN_HIRE_COST}ɡ.`, "event");
  return caravan;
}

export function caravanCargoUnits(c: Caravan): number {
  let n = 0;
  for (const k of Object.keys(c.cargo) as GoodId[]) n += c.cargo[k] ?? 0;
  return n;
}

export function dispatchCaravan(state: GameState, caravanId: string, toCityId: string, quiet = false) {
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
  if (!quiet) {
    pushLog(state, `${caravan.name} departs ${from.name} for ${to.name} (${Math.round(km)} km, ~${days} days).`, "info");
  }
}

export function tickCaravansDay(state: GameState) {
  const m = state.date.month;
  const speedMult = m === 12 || m === 1 || m === 2 ? WINTER_SPEED_MULT : 1;
  for (const c of state.caravans) {
    if (c.status !== "traveling") continue;
    c.travelProgress += speedMult;
    if (c.travelProgress >= c.travelDuration) {
      c.status = "idle";
      c.cityId = c.toCityId;
      c.fromCityId = null;
      c.toCityId = null;
      c.travelProgress = 0;
      c.travelDuration = 0;
      const city = c.cityId ? CITY_BY_ID[c.cityId] : null;
      // Route caravans arrive quietly; their stop trades produce the log line.
      if (city && !c.routeId) pushLog(state, `${c.name} arrives at ${city.name}.`, "info");
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
