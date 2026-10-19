import { clamp } from '../core/math';
import { polityOfPort } from '../diplomacy/polities';
import type { PortDef } from '../world/ports';

/**
 * Port dues and presents (BUILD_PLAN D1).
 *
 * A harbour charges a ship for the call, by her burthen. The assessment is 5 cruzados a ton and the
 * rate 2 to 6% of it by the temper of the court that owns the quay (a mercantile court asks least, a
 * warlike one most), so a 140-ton nau pays about 20 to 40 cruzados to lie at a foreign quay and a Nau
 * da India twice that to four times that. `marketModifiers` can raise or lower it (`duesMult`: a war,
 * a registry, a court that has not forgiven you, or remembers you kindly). Portuguese quays do not
 * charge the King's own ships. Where the court is hostile (it has made up its mind against the
 * captain, or the dues have been raised on his account) the officials expect a present as well: 8 to
 * 12% of the same assessment.
 */

export const ASSESS_PER_TON = 5;
export const DUES_RATE: Record<string, number> = { mercantile: 0.02, pious: 0.03, wary: 0.04, proud: 0.05, warlike: 0.06 };
export const PRESENT_RATE: [number, number] = [0.08, 0.12];
/** Dues multiplier past which a court counts as hostile, and the regard below which a town does. */
export const HOSTILE_DUES = 1.15;
export const HOSTILE_REGARD = -0.3;

export interface Dues {
  dues: number;
  present: number;
  hostile: boolean;
  /** One plain line for the Book, or '' when nothing was charged. */
  line: string;
}

const NONE: Dues = { dues: 0, present: 0, hostile: false, line: '' };

/** What a call costs. `hullTons` is the hull's burthen; `mult` is `marketModifiers(...).duesMult`; `regard` the town's, -1 to 1. */
export function duesFor(def: PortDef, hullTons: number, mult = 1, regard = 0): Dues {
  if (def.people === 'portuguese') return NONE;
  const temper = polityOfPort(def.id)?.temper ?? 'wary';
  const rate = DUES_RATE[temper] ?? 0.04;
  const assess = ASSESS_PER_TON * hullTons;
  const dues = Math.round(rate * assess * mult);
  const hostile = mult >= HOSTILE_DUES || regard <= HOSTILE_REGARD;
  const pr = PRESENT_RATE[0] + (PRESENT_RATE[1] - PRESENT_RATE[0]) * clamp((-regard - 0.3) / 0.7, 0, 1);
  const present = hostile ? Math.round(pr * assess) : 0;
  if (dues <= 0 && present <= 0) return NONE;
  return {
    dues, present, hostile,
    line: present > 0
      ? `Port dues at ${def.name}: ${dues} cruzados, and ${present} more in presents, which the harbour officials do not call a charge.`
      : `Port dues at ${def.name}: ${dues} cruzados.`,
  };
}
