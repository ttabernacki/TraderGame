import { clamp } from '../../core/math';
import { Rng } from '../../core/rng';
import { FRONTS } from './data';
import { pointsOf } from './core';
import type { Parcel, PowersState } from './types';

/**
 * The Traffic's own bookkeeping: the people a captain has been asked to carry, and what became of them.
 *
 * The Traffic is never a good and never a price. It reaches the economy through the stage effects in
 * data.ts (sugar, gold, dues) and through THIS: a typed cargo that the price list cannot see. A Parcel
 * takes room in the hold (`Ship.passengerTons`), pays freight on landing, and is a count of people with a
 * name for the ones the captain asks after. The clerk's word is "parcel"; nothing the captain reads says it
 * of a person except the clerk.
 *
 * Numbers are the game's: 0.25 t a person (INVENTED: a figure for a hold, not a sourced one), and a
 * passage's loss of a person in forty or so for every month at sea (INVENTED, and kept low and plain: the
 * sources for the coastal passages of this period are thin; the real losses were not smaller).
 */

export const TONS_EACH = 0.25;
export const LOSS_PER_DAY = 1 / 1200;

export const trafficStage = (st: PowersState): number => st.fronts.traffic.stage;
export const trafficPoints = (st: PowersState): number => pointsOf(st.fronts.traffic);

export function parcelsAboard(st: PowersState): Parcel[] {
  return st.parcels.filter((p) => p.status === 'aboard');
}

export const aboardTons = (st: PowersState): number => parcelsAboard(st).reduce((s, p) => s + p.alive * p.tons / Math.max(1, p.n), 0);

/** The stage's plain line for the Book: what the captain lives in. */
export function trafficLine(st: PowersState): string {
  const f = st.fronts.traffic;
  const d = FRONTS.traffic.stages[f.stage - 1];
  return `${FRONTS.traffic.name}: ${d.name}. ${d.line}`;
}

/** How many of a parcel survive `days` at sea, drawn from the parcel's own seed so that the answer does not change when asked twice. */
export function survivors(seed: number, p: Parcel, days: number): number {
  const rng = Rng.fromString(`parcel:${seed}:${p.id}`);
  let alive = p.n;
  const q = clamp(days * LOSS_PER_DAY, 0, 0.5);
  for (let i = 0; i < p.n; i++) if (rng.chance(q)) alive--;
  return alive;
}

export function takeParcel(st: PowersState, o: { from: string; to: string; n: number; freight: number; by: string; t: number }): Parcel {
  const p: Parcel = {
    id: st.nextId++, from: o.from, to: o.to, n: o.n, alive: o.n, tons: o.n * TONS_EACH,
    freight: o.freight, taken: o.t, status: 'aboard', by: o.by,
  };
  st.parcels.push(p);
  return p;
}
