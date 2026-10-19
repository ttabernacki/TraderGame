import { NM, cosd, haversine, wrap180, type LatLon } from '../core/math';
import { coastVerticesNear, type CoastVertex } from '../world/landmass';
import { AGREED_W, type Chart } from './charts';
import type { Game } from '../game/state';

/**
 * Chart grade (B4): how well a stretch of coast is known, in four words.
 *
 *   0 Rumour    drawn on hearsay: nobody has run it and the Casa's word is thin
 *   1 Sketch    run once, or the Casa's word for it, but the pilot's own fixes do not yet agree
 *   2 Surveyed  the pilot's reckonings agree about where it is (or the Casa's sheet is firm there)
 *   3 Sounded   surveyed, and the bottom is in the book: your own casts, or a pilot's bought soundings
 *
 * Derived, never captured: it reads only what the Chart already holds (passes
 * and standing per point), the soundings already kept (`soundedGround`, the
 * rutter's sounding notes). It uses the same test as the chart table's ink
 * (AGREED_W), never the drawing's real error, which nobody aboard can know.
 * More data can only raise a grade, never lower it.
 */

export type Grade = 0 | 1 | 2 | 3;
export const GRADE_WORD: Record<Grade, string> = { 0: 'Rumour', 1: 'Sketch', 2: 'Surveyed', 3: 'Sounded' };
/** Coast stripe on the chart, one colour per grade. */
export const GRADE_COLOUR: Record<Grade, string> = {
  0: 'rgba(150, 138, 118, 0.75)', 1: 'rgba(201, 162, 74, 0.8)', 2: 'rgba(74, 138, 106, 0.8)', 3: 'rgba(47, 111, 163, 0.85)',
};
export const GRADE_REACH_NM = 80;
const SOUNDING_REACH_NM = 45;

/** What the book has by way of soundings: stretches with a radius. */
export interface SoundingAnchor { lat: number; lon: number; nm: number }

export function soundingAnchors(g: Pick<Game, 'soundedGround' | 'rutter'>): SoundingAnchor[] {
  const out: SoundingAnchor[] = g.soundedGround.map((s) => ({ lat: s.lat, lon: s.lon, nm: s.nm }));
  for (const e of g.rutter.entries) {
    for (const n of e.notes) {
      if (n.fact?.tag === 'sounding' && n.fact.lat !== undefined && n.fact.lon !== undefined) {
        out.push({ lat: n.fact.lat, lon: n.fact.lon, nm: SOUNDING_REACH_NM });
      }
    }
  }
  return out;
}

/** Grade from the data itself: points held, passes, standing, soundings. */
export function gradeOf(passes: number, wLon: number, sounded: boolean): Grade {
  const base: Grade = wLon >= AGREED_W ? 2 : passes > 0 ? 1 : 0;
  if (!sounded) return base;
  return base === 2 ? 3 : base === 1 ? 2 : 1;
}

export function vertexGrade(chart: Chart, v: { land: number; index: number; lat: number; lon: number }, anchors: SoundingAnchor[]): Grade {
  const p = chart.points.get(`${v.land}:${v.index}`);
  const sounded = anchors.some((a) => haversine(v, a) / NM <= a.nm);
  if (!p) return gradeOf(0, 0, sounded);
  return gradeOf(p.passes, p.wLon, sounded);
}

export interface WaterGrade { grade: Grade; coastal: boolean }

function nearest(pos: LatLon, vs: CoastVertex[]): CoastVertex {
  let best = vs[0], bd = Infinity;
  for (const v of vs) {
    const d = Math.hypot((v.lat - pos.lat) * 60, wrap180(v.lon - pos.lon) * 60 * cosd(pos.lat));
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

/** The grade of the coast nearest a position, and whether there is a coast within reach at all. */
export function waterAt(g: Game, pos: LatLon, anchors = soundingAnchors(g)): WaterGrade {
  const vs = coastVerticesNear(pos, GRADE_REACH_NM);
  if (vs.length === 0) return { grade: 0, coastal: false };
  return { grade: vertexGrade(g.chart, nearest(pos, vs), anchors), coastal: true };
}

export const gradeAt = (g: Game, pos: LatLon): Grade => waterAt(g, pos).grade;

/** `(1 - 0.5 * grade / 3)`: what later lanes multiply their risk by. 1 for no grade, 0.5 for fully sounded. */
export const riskMultiplier = (grade: number): number => 1 - 0.5 * grade / 3;

/**
 * Risk multiplier for a lane: the mean grade of the coastal stretches along it
 * (open water has no coast to know and counts as a rumour).
 */
export function laneRisk(g: Game, from: LatLon, to: LatLon, samples = 24): number {
  const anchors = soundingAnchors(g);
  let sum = 0, n = 0;
  for (let i = 0; i <= samples; i++) {
    const f = i / samples;
    const pos = { lat: from.lat + (to.lat - from.lat) * f, lon: wrap180(from.lon + wrap180(to.lon - from.lon) * f) };
    const w = waterAt(g, pos, anchors);
    if (w.coastal) { sum += w.grade; n++; }
  }
  return riskMultiplier(n === 0 ? 0 : sum / n);
}
