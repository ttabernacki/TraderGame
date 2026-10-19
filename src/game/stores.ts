/**
 * Stores in tons (BUILD_PLAN B3).
 *
 * Provisions stay in the crew as days (water, biscuit, meat, wine, fresh), the
 * way every consumer already reads them; this module says what they weigh and
 * where they stow. They share the hold with the cargo: a ship that victuals for
 * a long passage carries less to sell. Spares (timber, cordage, canvas) are one
 * more thing in the hold, 1 to 2 t for a full set.
 *
 * Rate: 0.005 t per man-day of a full set of stores. A 24-man crew for 150 days
 * is 18 t.
 */
import { clamp } from '../core/math';
import { haversine, NM } from '../core/math';
import type { CrewState } from '../crew/crew';
import type { PortDef } from '../world/ports';
import type { Game } from './state';
import { daysToMark } from './passage';
import { roadPlan } from '../progression/road';

/** Tons per man per day of each store; the five sum to 0.005. */
export const STORE_TONS = { water: 0.0018, biscuit: 0.0010, saltMeat: 0.0009, wine: 0.0009, fresh: 0.0004 } as const;

/** Tons of a full set of spares (timber, cordage, canvas) for a hull with this much hold. */
export function sparesSetTons(hold: number): number {
  return clamp(1 + hold / 400, 1, 2);
}

/** The most days a slider offers. */
export const MAX_WATER_DAYS = 200;
export const MAX_VICTUAL_DAYS = 240;

/** What a ship is loading: days of water, days of victuals, and a fraction of a full set of spares. */
export interface StoresPlan { water: number; victuals: number; spares: number }

/** Victuals are the biscuit, meat and wine that go together; the bread sets the days. */
export function planOf(crew: CrewState): StoresPlan {
  const p = crew.provisions;
  return {
    water: Math.round(p.water),
    victuals: Math.round(Math.min(p.biscuit, p.saltMeat / 0.9)),
    spares: crew.spares ?? 0,
  };
}

/** Tons of food and water aboard. */
export function foodTons(crew: CrewState, fxStorage = 1): number {
  const p = crew.provisions;
  const days = p.water * STORE_TONS.water + p.biscuit * STORE_TONS.biscuit + p.saltMeat * STORE_TONS.saltMeat
    + p.wine * STORE_TONS.wine + p.fresh * STORE_TONS.fresh;
  return Math.max(0, days) * Math.max(crew.complement, 1) * fxStorage;
}

export function sparesTons(crew: CrewState, hold: number): number {
  return clamp(crew.spares ?? 0, 0, 1) * sparesSetTons(hold);
}

export function storesTons(crew: CrewState, hold: number, fxStorage = 1): number {
  return foodTons(crew, fxStorage) + sparesTons(crew, hold);
}

/** Tons a plan would weigh (fresh food at what the port will put aboard is left out: it is a few days). */
export function planTons(plan: StoresPlan, complement: number, hold: number, fxStorage = 1): number {
  const perMan = plan.water * STORE_TONS.water + plan.victuals * (STORE_TONS.biscuit + STORE_TONS.saltMeat * 0.9 + STORE_TONS.wine * 0.7)
    + 18 * STORE_TONS.fresh;
  return perMan * complement * fxStorage + clamp(plan.spares, 0, 1) * sparesSetTons(hold);
}

/** Cruzados per man-day for water and for victuals at a port with full availability. */
const WATER_RATE = 0.0042;
const VICTUAL_RATE = 0.0078;
/** A full set of spares at a port with a proper yard, for a 30 t hull; larger ships cost more. */
const SPARES_SET_COST = 70;

/** What it costs to bring the ship up to a plan here (nothing for what she already has). */
export function planCost(def: PortDef, g: Game, plan: StoresPlan): number {
  const have = planOf(g.crew);
  const men = Math.max(g.crew.count, 1);
  const avail = clamp(def.refit, 0.05, 1);
  const water = Math.max(0, plan.water - have.water) * men * WATER_RATE;
  const food = Math.max(0, plan.victuals - have.victuals) * men * VICTUAL_RATE;
  const spares = Math.max(0, plan.spares - have.spares) * SPARES_SET_COST * (g.ship.baseHull.hold / 30) ** 0.6;
  return Math.ceil((water + food + spares) / avail);
}

/** The most the hold can give to stores: what is free now, plus what the stores already take. */
export function roomForStores(g: Game): number {
  return Math.max(0, g.ship.holdCapacity - g.ship.reservedTons - g.ship.cargoTons);
}

/** Largest water days that fit alongside the other two sliders as set. */
export function fitPlan(g: Game, plan: StoresPlan): StoresPlan {
  const hold = g.ship.holdCapacity;
  const fx = g.ship.effects.storage;
  const room = roomForStores(g);
  const out: StoresPlan = {
    water: clamp(Math.round(plan.water), 0, MAX_WATER_DAYS + g.ship.effects.water),
    victuals: clamp(Math.round(plan.victuals), 0, MAX_VICTUAL_DAYS),
    spares: clamp(plan.spares, 0, 1),
  };
  // Spares give way last, then victuals, then water: a ship goes short of timber before she goes short of water.
  for (let guard = 0; guard < 3000 && planTons(out, g.crew.complement, hold, fx) > room + 1e-6; guard++) {
    if (out.victuals > 0 && out.victuals >= out.water * 1.1) out.victuals -= 1;
    else if (out.water > 0) out.water -= 1;
    else if (out.victuals > 0) out.victuals -= 1;
    else if (out.spares > 0) out.spares = Math.max(0, out.spares - 0.05);
    else break;
  }
  return out;
}

/**
 * Take the plan aboard. Levels may go up or down; what is landed is not
 * refunded. Returns what was actually loaded and what it cost.
 */
export function loadPlan(g: Game, plan: StoresPlan, discount = 1): { plan: StoresPlan; cost: number; tons: number } {
  const def = g.portHere;
  const fit = fitPlan(g, plan);
  const cost = def ? Math.round(planCost(def, g, fit) * discount) : 0;
  const p = g.crew.provisions;
  p.water = fit.water;
  p.biscuit = fit.victuals;
  p.saltMeat = fit.victuals * 0.9;
  p.wine = fit.victuals * 0.7;
  p.fresh = Math.max(p.fresh, 18 * (def ? clamp(def.refit * 1.4, 0.15, 1.4) : 0.5));
  g.crew.spares = fit.spares;
  g.crew.daysWithoutFresh = 0;
  g.crown.gold -= cost;
  g.syncStores();
  return { plan: fit, cost, tons: g.ship.storesTons };
}

/** Remember the loading she sailed with, for "same as last leg". */
export function recordLeg(g: Game): void {
  g.crew.lastStores = planOf(g.crew);
}

/** Days the next leg is expected to take, from the laid course or the next stop on the road. */
export function expectedLegDays(g: Game): number | null {
  const laid = daysToMark(g);
  if (laid !== null) return laid;
  const here = g.ship.state.pos;
  const next = roadPlan(g)
    .filter((s) => !s.here && s.nm > 40)
    .sort((a, b) => a.nm - b.nm)[0];
  if (!next) return null;
  return haversine(here, next.at) / NM / (4 * 24) * 1.15;
}

/** The pilot's loading: the leg's days with a quarter in hand and a fortnight over, whatever the leg. */
export function recommendedPlan(g: Game): StoresPlan {
  const days = expectedLegDays(g);
  const need = days === null ? 45 : Math.ceil(days * 1.25 + 14);
  // Beyond the Line the pilot wants water for longer than the food: the casks go first.
  return fitPlan(g, { water: need + 10, victuals: need, spares: need > 40 ? 0.6 : 0.4 });
}

/** After a change of hull or hold: stores that no longer stow beside the cargo are landed. */
export function trimToHold(g: Game): void {
  const have = planOf(g.crew);
  const fit = fitPlan(g, have);
  if (fit.water < have.water) g.crew.provisions.water = fit.water;
  if (fit.victuals < have.victuals) {
    g.crew.provisions.biscuit = fit.victuals;
    g.crew.provisions.saltMeat = fit.victuals * 0.9;
    g.crew.provisions.wine = fit.victuals * 0.7;
  }
  if (fit.spares < have.spares) g.crew.spares = fit.spares;
  g.syncStores();
}

/** Crew wages, cruzados per man per month (B3 upkeep; scripts/econ.ts uses the same figure). */
export const WAGE_PER_MAN_MONTH = 4;
