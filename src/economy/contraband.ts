import { clamp } from '../core/math';
import { good } from './goods';
import { CASA_SHARE, MONOPOLY, regionOf } from './trade';
import type { PortDef } from '../world/ports';
import { onMonth, type WorldHost } from '../world/tick';

/**
 * The King's goods as a loop (BUILD_PLAN D1, monopoly): pepper, gold, malagueta and ivory.
 *
 * A captain sells them to the Casa at the Casa's price (`CASA_SHARE` of the market), or he runs
 * them elsewhere, to a buyer who is not the King, at 1.4 to 2.2 times what the Casa would have
 * paid. Every run puts heat on the origin the goods came from (a unit-load is 600 cruzados at the
 * Casa's price). When the heat on the road crosses a line, the weigh-house at Lisbon notices
 * (a word), fines (a share of what was run) or seizes (the Crown's goods still aboard, and the fine, and
 * standing).
 *
 * Heat is not a clock. It comes off by what the captain does: a gift presented at a court, a copy of a
 * price sheet sold, a favour done for a man of standing, a parcel declared at the weigh-house, a
 * promise kept, a chart given to the Crown. Each is worth a little and no more than three points
 * a month can be had that way. Time itself takes off only what is below the notice line (a tenth
 * of a point a month), so a captain with a cargo's worth of heat on him who goes to ground for ten
 * years comes out with the same heat on him that he went in with. (Devil's advocate loop #3.)
 */

export interface HeatState {
  /** Origin (a region) to heat. */
  byOrigin: Record<string, number>;
  /** Value run since the last inspection, at the Casa's price. */
  value: number;
  /** Ship-time of the last inspection, and of the last word of warning. */
  inspected: number;
  warned: number;
  /** The port each Crown good aboard was last bought at, by good. */
  origin: Record<string, string>;
  /** Cooling used in the current 30 days. */
  window: { t: number; used: number };
}

export function newHeat(): HeatState {
  return { byOrigin: {}, value: 0, inspected: -1e12, warned: -1e12, origin: {}, window: { t: 0, used: 0 } };
}

export const HEAT_UNIT = 600;
export const NOTICE = 4;
export const FINE = 8;
export const FORFEIT = 14;
/** Points of heat that activity can take off in 30 days. */
export const COOL_CAP = 3;
/** Heat that time takes off a month, below the notice line only. */
export const FLOOR_DECAY = 0.1;
/** The price a run sale pays, in times what the Casa would have paid. */
export const RUN_PREMIUM: [number, number] = [1.4, 2.2];

export function heatOf(h: HeatState | undefined | null): HeatState {
  return h ?? newHeat();
}

export function totalHeat(h: HeatState): number {
  let n = 0;
  for (const v of Object.values(h.byOrigin)) n += v;
  return n;
}

/** The Ledger tags that cool the weigh-house's interest, and by how much a point of magnitude is worth. */
export const COOLING: Record<string, number> = {
  'gift.great': 2, 'gift.plain': 1, 'fact.sold': 1.5, 'parcel.carried': 1.5, 'parcel.redeemed': 2.5,
  'promise.kept': 1, 'chart.shared': 2,
};

/** Is this a run? A King's good sold where the Casa is not the buyer. */
export function isRun(def: PortDef, goodId: string, hasLicence: boolean): boolean {
  return MONOPOLY.includes(goodId) && !hasLicence && def.people !== 'portuguese';
}

/** What a run sale pays per unit at a port: 1.4 to 2.2 times the Casa's price, richer buyers paying more. */
export function runPrice(def: PortDef, goodId: string, wealth = def.wealth): number {
  const premium = RUN_PREMIUM[0] + (RUN_PREMIUM[1] - RUN_PREMIUM[0]) * clamp((wealth - 0.3) / 0.6, 0, 1);
  return good(goodId).lisbon * CASA_SHARE * premium;
}

/** Heat on the origin of the goods run. Returns the heat added. */
export function addHeat(h: HeatState, goodId: string, qty: number, unitValue: number): number {
  const origin = h.origin[goodId];
  const region = origin ? regionOf(origin) : 'unknown';
  const value = qty * unitValue;
  const add = value / HEAT_UNIT;
  h.byOrigin[region] = (h.byOrigin[region] ?? 0) + add;
  h.value += value;
  return add;
}

/** Take heat off for something done. Takes it off the hottest origin first; returns what came off. */
export function coolBy(h: HeatState, points: number, t: number): number {
  if (t - h.window.t >= 30 * 86400) h.window = { t, used: 0 };
  let left = Math.min(points, COOL_CAP - h.window.used);
  let took = 0;
  while (left > 1e-9) {
    const top = Object.entries(h.byOrigin).sort((a, b) => b[1] - a[1])[0];
    if (!top || top[1] <= 0) break;
    const d = Math.min(top[1], left);
    h.byOrigin[top[0]] = top[1] - d;
    if (h.byOrigin[top[0]] < 0.01) delete h.byOrigin[top[0]];
    left -= d; took += d;
  }
  h.window.used += took;
  h.value = Math.max(0, h.value - took * HEAT_UNIT);
  return took;
}

/** A Ledger entry cools heat if its tag is one that does. Returns what came off. */
export function coolForDeed(h: HeatState, tag: string, magnitude: number, t: number): number {
  const w = COOLING[tag];
  if (!w || totalHeat(h) <= 0) return 0;
  return coolBy(h, w * clamp(0.5 + magnitude, 0.5, 1.5), t);
}

/** Months pass: time takes off only the part of each origin's heat that is below the notice line. */
export function fadeFloor(h: HeatState, months = 1): void {
  for (const k of Object.keys(h.byOrigin)) {
    if (h.byOrigin[k] >= NOTICE) continue;
    h.byOrigin[k] = Math.max(0, h.byOrigin[k] - FLOOR_DECAY * months);
    if (h.byOrigin[k] <= 0.005) delete h.byOrigin[k];
  }
  if (totalHeat(h) <= 0) h.value = 0;
}

onMonth((host: WorldHost) => { if (host.heat) fadeFloor(host.heat, 1); });

export type Inspection =
  | { level: 0 }
  | { level: 1; text: string }
  | { level: 2 | 3; fine: number; forfeit: boolean; standing: number; text: string };

/**
 * The weigh-house at Lisbon looks at the heat the captain is carrying. `rng` is a number in [0,1) from the
 * game's generator. Level 1 is a word (at most once in 60 days); 2 a fine of 20 to 60% of what was run; 3 the
 * fine and the Crown's goods aboard. An inspection takes the heat down by half (a matter settled) or, if it
 * seized, by three-fifths.
 */
export function inspect(h: HeatState, t: number, rng: number, audit = 1): Inspection {
  const heat = totalHeat(h);
  if (heat < NOTICE) return { level: 0 };
  if (heat < FINE) {
    if (t - h.warned < 60 * 86400) return { level: 0 };
    h.warned = t;
    return { level: 1, text: 'A clerk at the weigh-house has been asking where the pepper and the gold of your last voyages went. He is polite about it.' };
  }
  const forfeit = heat >= FORFEIT;
  const share = clamp(0.2 + 0.4 * ((heat - FINE) / (FORFEIT - FINE)) + (rng - 0.5) * 0.1, 0.2, 0.6) * audit;
  const fine = Math.round(h.value * share);
  const standing = forfeit ? 20 : 8;
  const keep = forfeit ? 0.4 : 0.5;
  for (const k of Object.keys(h.byOrigin)) { h.byOrigin[k] *= keep; if (h.byOrigin[k] < 0.05) delete h.byOrigin[k]; }
  h.value = Math.round(h.value * keep);
  h.inspected = t;
  return {
    level: forfeit ? 3 : 2, fine, forfeit, standing,
    text: forfeit
      ? 'The Casa’s officers were on the quay with a notary before the lines were fast. The King’s goods aboard are seized, the fine is entered, and the name is in a book.'
      : 'The weigh-house has made up its books against yours, and the difference is a fine.',
  };
}

