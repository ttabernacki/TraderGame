import { tidalRange, tideHeight } from '../world/currents';
import type { LatLon } from '../core/math';

/**
 * The tide, as the master knows it rather than as the water does it.
 *
 * The tide has been in this simulation from the start and has never once been
 * mentioned to the player. It is not decoration: `depthAt` has `tideHeight`
 * added to it on every step, so the water under the keel off Lisbon rises and
 * falls three metres twice a day and in the Bay of Cambay it moves eight, and
 * the inshore current reverses with it. A player who groups his soundings, runs
 * a bar, or takes the ground has been playing against all of that blind.
 *
 * Worse, the lead line treats it as *noise*: `castLead` carries a fixed
 * `tideSigma` described in its own comment as "a tide nobody has allowed for".
 * Nobody had allowed for it because nobody could find out what it was doing.
 *
 * Every pilot of the period could. He carried the establishment of the port —
 * the hour of high water at full and change of the moon — and the age of the
 * moon, and from those two numbers and a rule of thumb he had the state of the
 * tide to within half an hour. That is what this file is: the same
 * `tideHeight` curve the water is running on, read out in the words a master
 * would use.
 */

export type TideState = 'flood' | 'ebb' | 'high' | 'low';

export interface TideRead {
  /** Mean range here, metres. Below about a metre it is not worth a word. */
  range: number;
  /** Height above mean level right now, metres: positive is more water. */
  height: number;
  /** Rising, falling, or near the turn. */
  state: TideState;
  /** Hours to the next high water. */
  toHigh: number;
  /** Hours to the next low water. */
  toLow: number;
  /** Springs or neaps, 0 to 1, where 1 is the biggest tides of the month. */
  springs: number;
  /** How the master would say it. */
  word: string;
}

/** A semi-diurnal cycle, in seconds. The same period the water is using. */
const PERIOD = 44712;

/**
 * Hours to the next time the tide is at the given signed fraction of its swing,
 * found by walking the same curve the water runs on rather than by inverting it.
 *
 * Deliberately a search and not algebra: the height is the product of a sine
 * and a slow spring-neap term, and solving that in closed form would be a
 * second expression that could drift out of step with the first. Twelve minutes
 * a step over one cycle is thirty-seven samples, which costs nothing and cannot
 * disagree with the water.
 */
function hoursUntil(p: LatLon, t: number, want: 'high' | 'low'): number {
  const step = 720;
  let best = 0;
  let bestH = want === 'high' ? -Infinity : Infinity;
  for (let d = 0; d <= PERIOD; d += step) {
    const h = tideHeight(p, t + d);
    if (want === 'high' ? h > bestH : h < bestH) { bestH = h; best = d; }
  }
  return best / 3600;
}

export function readTide(at: LatLon, t: number): TideRead | null {
  const range = tidalRange(at);
  if (range < 1) return null;
  const height = tideHeight(at, t);
  // Which way it is going, from the curve itself a few minutes either side.
  const rising = tideHeight(at, t + 600) > height;
  const springs = 0.7 + 0.3 * Math.cos((2 * Math.PI * t) / (29.53 * 86400));
  const toHigh = hoursUntil(at, t, 'high');
  const toLow = hoursUntil(at, t, 'low');

  // Near the turn, which is when a ship crosses a bar and when she is got off
  // the ground.
  const swing = (range / 2) * springs;
  const near = Math.abs(height) > swing * 0.86;
  const state: TideState = near ? (height > 0 ? 'high' : 'low') : rising ? 'flood' : 'ebb';

  const quarter = Math.abs(height) / Math.max(swing, 0.01);
  const how = quarter > 0.86 ? '' : quarter > 0.45 ? 'three-quarter ' : quarter > 0.2 ? 'half ' : 'first of the ';
  const word = state === 'high'
    ? `High water${springs > 0.9 ? ', and springs' : ''}`
    : state === 'low'
      ? `Low water${springs > 0.9 ? ', and springs' : ''}`
      : `${how}${state}`.replace(/^(\w)/, (c) => c.toUpperCase());

  return { range, height, state, toHigh, toLow, springs, word };
}

/** Hours and minutes, the way a tide is given. */
export function tideClock(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m >= 60 ? `${h + 1}h00` : `${h}h${String(m).padStart(2, '0')}`;
}

/**
 * The pilot on the tide, once, the first time she is somewhere it matters.
 *
 * The same device as the volta do mar and the monsoon: the player is told, in
 * words, a thing that is already true of the water and that he has no way of
 * discovering by looking at the screen.
 */
export function pilotOnTheTide(r: TideRead): string {
  return 'The pilot: "Mind the tide here, senhor. It makes and takes '
    + `${r.range.toFixed(1)} metres twice a day in this water, and every sounding you get is `
    + 'that much of a lie unless you know what the water is doing when you get it. It is '
    + `${r.word.toLowerCase()} now, and high water in ${tideClock(r.toHigh)}."`;
}

/**
 * What the state of the tide does to a ship that has taken the ground.
 *
 * The whole difference between an embarrassment and a disaster, and it is not a
 * die: a ship that touches on a rising tide is lifted off by the water that put
 * her on, and one that touches at the top of a spring tide has twelve hours of
 * falling water ahead of her and will be sitting on her bilge in the middle of
 * it with her own weight working her apart. Every master knew which of the two
 * he was in within about a minute of the shock.
 */
export function groundingOutlook(r: TideRead | null): {
  easy: boolean;
  hours: number;
  text: string;
} {
  if (!r) {
    return {
      easy: true,
      hours: 0,
      text: 'There is no tide here worth the name. She will come off when she is hauled off '
        + 'and not before, and she is in no worse danger for waiting.',
    };
  }
  // Flood, or dead low water — at the bottom of the tide the only way the
  // water can go is up, and she is guaranteed to float on the next of it.
  if (r.state === 'flood' || r.state === 'low') {
    return {
      easy: true,
      hours: Math.max(0.5, Math.min(r.toHigh, 4)),
      text: `The tide is making. She went on with the water rising under her, which is the best `
        + `way there is to go aground: another ${tideClock(r.toHigh)} of flood and she will lift `
        + 'off the ground by herself with the kedge barely taking a strain.',
    };
  }
  return {
    easy: false,
    hours: r.toHigh,
    text: `The tide is falling${r.springs > 0.9 ? ', and it is springs' : ''}. She went on at `
      + `${r.word.toLowerCase()} with ${tideClock(r.toLow)} of ebb still to run, and there will `
      + `be ${((r.range / 2) * r.springs * 1.7).toFixed(1)} metres less water round her before `
      + `there is any more. She will take the ground, lie over on her bilge, and every hour she `
      + `is there her own weight is working her. High water is not until ${tideClock(r.toHigh)}.`,
  };
}
