import type { GameState, Warehouse, GoodId, CityId } from "./types";
import { ALL_GOOD_IDS } from "../data/goods";
import { CITY_BY_ID } from "../data/cities";
import { pushLog } from "./log";

export const WAREHOUSE_RENT_COST = 1200;
export const WAREHOUSE_CAPACITY = 200;

function emptyGoods(): Record<GoodId, number> {
  const g = {} as Record<GoodId, number>;
  for (const id of ALL_GOOD_IDS) g[id] = 0;
  return g;
}

export function hasWarehouse(state: GameState, cityId: CityId): boolean {
  return state.warehouses[cityId] !== undefined;
}

export function rentWarehouse(state: GameState, cityId: CityId): Warehouse | null {
  if (hasWarehouse(state, cityId)) return state.warehouses[cityId];
  if (state.treasury < WAREHOUSE_RENT_COST) return null;
  state.treasury -= WAREHOUSE_RENT_COST;
  const wh: Warehouse = { cityId, goods: emptyGoods(), capacity: WAREHOUSE_CAPACITY };
  state.warehouses[cityId] = wh;
  pushLog(state, `Leased a warehouse in ${CITY_BY_ID[cityId]?.name ?? cityId} for ${WAREHOUSE_RENT_COST}ɡ. Your factor now reports its market daily.`, "event");
  return wh;
}

export function warehouseUnits(wh: Warehouse): number {
  let n = 0;
  for (const id of ALL_GOOD_IDS) n += wh.goods[id];
  return n;
}

export function warehouseSpace(wh: Warehouse): number {
  return Math.max(0, wh.capacity - warehouseUnits(wh));
}

// Move goods caravan -> warehouse. Returns units actually moved.
export function depositToWarehouse(
  state: GameState,
  caravanId: string,
  cityId: CityId,
  goodId: GoodId,
  qty: number,
): number {
  const caravan = state.caravans.find((c) => c.id === caravanId);
  const wh = state.warehouses[cityId];
  if (!caravan || !wh) return 0;
  const have = caravan.cargo[goodId] ?? 0;
  const moved = Math.min(qty, have, warehouseSpace(wh));
  if (moved <= 0) return 0;
  caravan.cargo[goodId] = have - moved;
  wh.goods[goodId] += moved;
  return moved;
}

// Move goods warehouse -> caravan. Returns units actually moved.
export function withdrawFromWarehouse(
  state: GameState,
  caravanId: string,
  cityId: CityId,
  goodId: GoodId,
  qty: number,
  caravanSpace: number,
): number {
  const caravan = state.caravans.find((c) => c.id === caravanId);
  const wh = state.warehouses[cityId];
  if (!caravan || !wh) return 0;
  const have = wh.goods[goodId];
  const moved = Math.min(qty, have, caravanSpace);
  if (moved <= 0) return 0;
  wh.goods[goodId] = have - moved;
  caravan.cargo[goodId] = (caravan.cargo[goodId] ?? 0) + moved;
  return moved;
}
