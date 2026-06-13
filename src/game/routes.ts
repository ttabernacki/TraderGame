import type { GameState, Caravan, TradeRoute, RouteStop } from "./types";
import { executeTrade } from "./economy";
import { caravanCargoUnits, dispatchCaravan } from "./caravan";
import { CITY_BY_ID } from "../data/cities";
import { GOOD_BY_ID } from "../data/goods";
import { pushLog } from "./log";

let routeSeq = 1;

export function createRoute(state: GameState): TradeRoute {
  const route: TradeRoute = {
    id: `route-${routeSeq}`,
    name: `Route ${routeSeq}`,
    stops: [],
  };
  routeSeq += 1;
  state.routes.push(route);
  return route;
}

export function deleteRoute(state: GameState, routeId: string) {
  state.routes = state.routes.filter((r) => r.id !== routeId);
  for (const c of state.caravans) {
    if (c.routeId === routeId) {
      c.routeId = null;
      c.routeStopIndex = 0;
      c.loadingDays = 0;
      if (c.status === "loading") c.status = "idle";
    }
  }
}

export function assignCaravanToRoute(state: GameState, caravanId: string, routeId: string | null) {
  const caravan = state.caravans.find((c) => c.id === caravanId);
  if (!caravan) return;
  caravan.routeId = routeId;
  caravan.routeStopIndex = 0;
  caravan.loadingDays = 0;
  if (caravan.status === "loading") caravan.status = "idle";
  if (!routeId) return;
  const route = state.routes.find((r) => r.id === routeId);
  if (!route) return;
  // If the caravan already sits at one of the stops, start the circuit there.
  if (caravan.cityId) {
    const idx = route.stops.findIndex((s) => s.cityId === caravan.cityId);
    if (idx >= 0) caravan.routeStopIndex = idx;
  }
}

export function routeIsRunnable(route: TradeRoute): boolean {
  return route.stops.length >= 2;
}

export function caravansOnRoute(state: GameState, routeId: string): Caravan[] {
  return state.caravans.filter((c) => c.routeId === routeId);
}

const LOADING_DAYS = 1;

export function tickRoutesDay(state: GameState) {
  for (const caravan of state.caravans) {
    if (!caravan.routeId || caravan.status === "traveling") continue;
    const route = state.routes.find((r) => r.id === caravan.routeId);
    if (!route || !routeIsRunnable(route)) continue;
    if (caravan.routeStopIndex >= route.stops.length) caravan.routeStopIndex = 0;
    const stop = route.stops[caravan.routeStopIndex];

    if (caravan.cityId !== stop.cityId) {
      // Just assigned or stop list changed: head to the current stop.
      dispatchCaravan(state, caravan.id, stop.cityId, true);
      continue;
    }

    if (caravan.status === "idle") {
      caravan.status = "loading";
      caravan.loadingDays = LOADING_DAYS;
      continue;
    }

    // status === "loading"
    caravan.loadingDays -= 1;
    if (caravan.loadingDays > 0) continue;
    executeStopOrders(state, caravan, stop, route);
    caravan.status = "idle";
    caravan.routeStopIndex = (caravan.routeStopIndex + 1) % route.stops.length;
    const next = route.stops[caravan.routeStopIndex];
    if (next.cityId !== caravan.cityId) {
      dispatchCaravan(state, caravan.id, next.cityId, true);
    }
  }
}

function executeStopOrders(state: GameState, caravan: Caravan, stop: RouteStop, route: TradeRoute) {
  const parts: string[] = [];

  // Sells first to free capacity and raise cash for the buys.
  for (const order of stop.orders) {
    if (order.mode !== "sell") continue;
    const have = caravan.cargo[order.goodId] ?? 0;
    const maxUnits = order.qty === "all" ? have : Math.min(have, order.qty);
    const res = executeTrade(state, stop.cityId, order.goodId, "sell", maxUnits, order.limit);
    if (res.units > 0) {
      caravan.cargo[order.goodId] = have - res.units;
      parts.push(`sold ${res.units} ${GOOD_BY_ID[order.goodId].name} (+${res.gold}ɡ)`);
    }
  }

  for (const order of stop.orders) {
    if (order.mode !== "buy") continue;
    const space = caravan.capacity - caravanCargoUnits(caravan);
    if (space <= 0) break;
    const maxUnits = order.qty === "all" ? space : Math.min(space, order.qty);
    const res = executeTrade(state, stop.cityId, order.goodId, "buy", maxUnits, order.limit);
    if (res.units > 0) {
      caravan.cargo[order.goodId] = (caravan.cargo[order.goodId] ?? 0) + res.units;
      parts.push(`bought ${res.units} ${GOOD_BY_ID[order.goodId].name} (−${res.gold}ɡ)`);
    }
  }

  if (parts.length > 0) {
    const cityName = CITY_BY_ID[stop.cityId]?.name ?? stop.cityId;
    pushLog(state, `${caravan.name} [${route.name}] in ${cityName}: ${parts.join(", ")}.`, "trade");
  }
}
