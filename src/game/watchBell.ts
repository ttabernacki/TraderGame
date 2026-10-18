import { enduranceDays } from '../crew/crew';
import type { Game } from './state';

/**
 * The watch bell.
 *
 * While the clock is wound on past four times, it stops only at dawn and dusk
 * (ship time), and only if something changed since the last bell. An empty day
 * runs straight through. The bell never speeds the clock up and never touches
 * a player already at four times or slower.
 *
 * What counts as a change:
 *  - land raised, a discovery, or a stranger spoken of in the log since the last bell
 *  - the reckoning's doubt climbing into a worse band (10 / 25 / 50 miles)
 *  - the wind veering 45 degrees or more, or freshening/dying by two Beaufort-ish steps
 *  - stores crossing a low threshold (20 / 10 / 5 days of endurance)
 */

/** Everything the bell looks at, as plain numbers, so it can be tested without a Game. */
export interface BellObs {
  t: number;
  hour: number;
  scaleIndex: number;
  /** Time of the latest landfall/discovery/contact in the log (monotonic). */
  eventT: number;
  /** Strangers sighted, ever (monotonic). */
  sighted: number;
  /** A stranger is in company now. */
  stranger: boolean;
  /** Reckoning doubt in miles (the larger axis). */
  doubtNm: number;
  windFrom: number;
  windKn: number;
  /** Days the stores will last. */
  storesDays: number;
}

export const DOUBT_BANDS = [10, 25, 50];
export const STORES_BANDS = [5, 10, 20];
const WIND_SHIFT_DEG = 45;
const WIND_STEP_KN = 8;

const band = (v: number, edges: number[]) => edges.filter((e) => v >= e).length;
const storesBand = (d: number) => STORES_BANDS.filter((e) => d < e).length;
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** Why the bell would stop, comparing this moment with the last bell. Empty = nothing. */
export function bellReasons(prev: BellObs, now: BellObs): string[] {
  const why: string[] = [];
  if (now.eventT > prev.eventT || now.sighted > prev.sighted) why.push('land or a sail has been raised');
  else if (now.stranger && !prev.stranger) why.push('a stranger is in company');
  if (band(now.doubtNm, DOUBT_BANDS) > band(prev.doubtNm, DOUBT_BANDS)) {
    why.push(`the pilot's doubt has grown to ${now.doubtNm.toFixed(0)} miles`);
  }
  if (angDiff(now.windFrom, prev.windFrom) >= WIND_SHIFT_DEG
      || Math.abs(now.windKn - prev.windKn) >= WIND_STEP_KN) {
    why.push('the wind has changed');
  }
  if (storesBand(now.storesDays) > storesBand(prev.storesDays)) {
    why.push(`stores down to ${Math.max(0, Math.floor(now.storesDays))} days`);
  }
  return why;
}

/** True if the clock moved across 06:00 or 18:00 ship time between t0 and t1. */
export function crossedBell(t0: number, t1: number): boolean {
  if (t1 <= t0) return false;
  // Bells fall at 6h and 18h of each day: every 12 hours, offset by 6.
  const k = (t: number) => Math.floor((t - 6 * 3600) / (12 * 3600));
  return k(t1) > k(t0);
}

/**
 * The bell's memory: the observation at the last bell. Pure; the Game hook
 * below feeds it. `ring` returns the reasons the clock should stop, or null.
 */
export class WatchBell {
  last: BellObs | null = null;

  ring(t0: number, now: BellObs): string[] | null {
    const accelerated = now.scaleIndex > 2;
    if (!crossedBell(t0, now.t)) return null;
    const prev = this.last;
    // A bell struck while the clock is slow is a baseline, not a stop: nothing
    // is owed to a player who is watching.
    this.last = now;
    if (!accelerated || !prev) return null;
    const why = bellReasons(prev, now);
    return why.length ? why : null;
  }
}

export function observe(g: Game): BellObs {
  const w = g.weatherNow.wind;
  return {
    t: g.clock.t,
    hour: g.clock.hour,
    scaleIndex: g.clock.scaleIndex,
    eventT: g.log.entries.reduce(
      (m, e) => (e.kind === 'landfall' || e.kind === 'discovery' || e.kind === 'contact') && e.t > m ? e.t : m, -1e18),
    sighted: g.seaRecord.sighted,
    stranger: g.encounter !== null,
    doubtNm: Math.max(g.nav.sigmaLat, g.nav.sigmaLon),
    windFrom: w.from,
    windKn: w.speed,
    storesDays: enduranceDays(g.crew, g.ration),
  };
}

const bells = new WeakMap<Game, WatchBell>();

/** The one hook. Call after the clock has advanced by simDt. */
export function ringWatchBell(g: Game, simDt: number): void {
  if (g.dockedAt || g.anchored) return;
  let bell = bells.get(g);
  if (!bell) { bell = new WatchBell(); bells.set(g, bell); }
  const t1 = g.clock.t;
  const t0 = t1 - simDt;
  if (!crossedBell(t0, t1)) return;
  const why = bell.ring(t0, observe(g));
  if (!why) return;
  g.clock.scaleIndex = 2;
  const dawn = g.clock.hour < 12;
  g.logEvent('note', `${dawn ? 'Dawn' : 'Dusk'} bell. ${why.join('; ')}. The clock is down to four times.`);
  g.pushAlert(`${dawn ? 'Dawn' : 'Dusk'} bell — ${why[0]}.`, 'note');
}
