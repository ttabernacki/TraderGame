import { clamp } from '../core/math';
import { HULL_BY_ID, hullSpeedKnots, type HullClass, type MastSpec, type RigKind } from './hull';
import { deriveHull, initialSails, polarSpeed, stepShip, type DynamicState, type ShipTuning } from './physics';
import { POLARS, POLAR_BETA_STEP, POLAR_WINDS } from './polars';
import { RIG_PROFILES, optimalTrim, sailForce } from './rig';

/**
 * A ship drawn to the captain's own lines, and built at the Ribeira das Naus.
 *
 * Every hull in the game is already a handful of numbers — length, beam, draft,
 * displacement, and each mast's area, height and place along the keel — and the
 * physics and the model both read nothing else. So a design is those numbers,
 * chosen, and everything a ship is follows from them by the same rules the
 * stock hulls obey: tonnage and hold from her volume, canvas from her
 * displacement, men from both, stiffness from her beam against her depth.
 * The rules were fitted to the six stock hulls, so a design that copies one of
 * them comes out as that ship, give or take the yard's reckoning.
 *
 * What the table shows is measured, not guessed: how close she points is found
 * by summing the drive of her masts exactly as `Game.noGoAngle` does, and her
 * speeds and her heel are run through `stepShip`, the integrator that sails her.
 */

export type Timber = 'oak' | 'pine';
export type Fastening = 'trenail' | 'iron';
export type Paint = 'natural' | 'red' | 'black' | 'ochre';
export type SailDevice = 'cross' | 'plain';

export interface ShipDesign {
  name: string;
  /** Waterline length, metres. */
  lwl: number;
  /** Length over beam. */
  beamRatio: number;
  /** Draft, metres. */
  draft: number;
  /** 0 flush-decked, 1 a castle at each end like a carrack's. */
  castles: number;
  /** Fore to aft. */
  masts: RigKind[];
  /** A topsail over the main course, when the main is square. */
  topsail: boolean;
  /** Canvas against what a hull her size would ordinarily carry. */
  canvas: number;
  timber: Timber;
  fastening: Fastening;
  paint: Paint;
  device: SailDevice;
}

export const DESIGN_LIMITS = {
  lwl: [13, 36], beamRatio: [2.5, 4.2], draft: [1.3, 5], castles: [0, 1], canvas: [0.7, 1.4],
} as const;

export function defaultDesign(name = 'Nossa Senhora'): ShipDesign {
  return {
    name, lwl: 21, beamRatio: 3.2, draft: 2.3, castles: 0.35,
    masts: ['square', 'lateen', 'lateen'], topsail: false, canvas: 1,
    timber: 'oak', fastening: 'trenail', paint: 'natural', device: 'cross',
  };
}

const MAST_NAMES: Record<number, string[]> = {
  1: ['Mainmast'],
  2: ['Mainmast', 'Mizzen'],
  3: ['Foremast', 'Mainmast', 'Mizzen'],
  4: ['Foremast', 'Mainmast', 'Mizzen', 'Contramezena'],
};
const STATIONS: Record<number, number[]> = {
  1: [0.05], 2: [0.1, -0.55], 3: [0.64, 0.03, -0.64], 4: [0.66, 0.16, -0.36, -0.72],
};
const SHARES: Record<number, number[]> = {
  1: [1], 2: [0.66, 0.34], 3: [0.31, 0.53, 0.16], 4: [0.27, 0.45, 0.17, 0.11],
};
const MAIN_INDEX: Record<number, number> = { 1: 0, 2: 0, 3: 1, 4: 1 };

/** How high the centre of effort of a sail this size stands, fitted to the stock rigs. */
function ceHeightFor(area: number, draft: number): number {
  return 0.85 * Math.sqrt(area) + 1.2 + draft * 0.5;
}

/** What she is, as the physics sees her. */
export function hullFromDesign(d: ShipDesign, id: string): HullClass {
  const L = clamp(d.lwl, DESIGN_LIMITS.lwl[0], DESIGN_LIMITS.lwl[1]);
  const B = L / clamp(d.beamRatio, DESIGN_LIMITS.beamRatio[0], DESIGN_LIMITS.beamRatio[1]);
  const D = clamp(d.draft, DESIGN_LIMITS.draft[0], DESIGN_LIMITS.draft[1]);
  const c = clamp(d.castles, 0, 1);
  const V = L * B * D;
  const displacement = Math.round(V * (390 + 0.135 * V) * (1 + 0.05 * c) * (d.timber === 'pine' ? 0.93 : 1));
  const tons = Math.max(10, Math.round(V * (0.215 + 0.00003 * V)));
  const hold = Math.max(6, Math.round(tons * (0.6 + 0.25 * Math.min(1, tons / 400)) * (1 - 0.03 * c)));

  const n = clamp(d.masts.length, 1, 4);
  const rigs = d.masts.slice(0, n);
  const total = clamp(d.canvas, DESIGN_LIMITS.canvas[0], DESIGN_LIMITS.canvas[1]) * 0.12 * Math.pow(displacement, 2 / 3);
  // A topsail is part of the canvas, not extra to it.
  const topsail = d.topsail && rigs[MAIN_INDEX[n]] === 'square';
  const courses = topsail ? total / (1 + 0.29 * SHARES[n][MAIN_INDEX[n]]) : total;
  const masts: MastSpec[] = rigs.map((rig, i) => {
    const area = Math.round(courses * SHARES[n][i]);
    return { name: MAST_NAMES[n][i], rig, area, ceHeight: +ceHeightFor(area, D).toFixed(1), station: STATIONS[n][i] };
  });
  const main = masts[MAIN_INDEX[n]];
  if (topsail) {
    masts.splice(MAIN_INDEX[n] + 1, 0, {
      name: 'Gávea do grande', rig: 'square', area: Math.round(main.area * 0.29),
      ceHeight: +(main.ceHeight * 1.35).toFixed(1), station: main.station,
    });
  }
  const area = masts.reduce((s, m) => s + m.area, 0);
  const lateenFrac = masts.filter((m) => m.rig === 'lateen').reduce((s, m) => s + m.area, 0) / area;

  const crewFull = Math.round(0.5 * 1.45 * Math.pow(tons, 0.75) + 0.5 * area / 9.5);
  const slender = L / B;
  const strength = clamp(
    (0.1 + 0.135 * Math.log(tons)) * (d.timber === 'pine' ? 0.88 : 1) * (d.fastening === 'iron' ? 1.04 : 1)
    * clamp(1 - Math.max(0, slender - 3.3) * 0.12, 0.8, 1) + 0.04 * c,
    0.4, 0.99);
  const handiness = clamp(1.25 - L * 0.027 + 0.18 * lateenFrac - 0.08 * c, 0.3, 0.95);
  const gmScale = Math.pow((B / D) / 2.8, 0.7) * (1.075 - 0.15 * c);
  // The Ribeira's price for a hull this size, and a tenth over for building to
  // somebody's own drawings.
  const cost = Math.round((tons * (14 + tons * 0.035) + area * 0.5)
    * (d.timber === 'oak' ? 1.05 : 0.85) * (d.fastening === 'iron' ? 1.08 : 1) * 1.1);

  return {
    id,
    name: d.name,
    english: 'Built to your own lines',
    tons, lwl: +L.toFixed(1), beam: +B.toFixed(2), draft: +D.toFixed(2), displacement,
    masts, hold, crewMin: Math.max(4, Math.round(crewFull * 0.5)), crewFull,
    strength: +strength.toFixed(3), handiness: +handiness.toFixed(3),
    cost, standing: Math.max(0, Math.round((tons - 40) * 1.05)),
    blurb: `Laid down at the Ribeira das Naus to your own lines: ${tons} tonéis, ${masts.length} `
      + `${masts.length === 1 ? 'mast' : 'masts'}, ${d.timber === 'oak' ? 'oak' : 'pine'}-built.`,
    castles: c, gmScale: +gmScale.toFixed(3),
    sparStrain: +Math.pow(Math.max(1, d.canvas), 4).toFixed(2), paint: d.paint, device: d.device, custom: true,
  };
}

/** Days on the stocks. A nau was the better part of a year. */
export function buildDays(h: HullClass): number {
  return Math.round(50 + h.tons * 0.45 * (h.strength > 0.85 ? 1.1 : 1));
}

/** The largest ship the Ribeira will lay down for you, by act. */
export function tonsAllowed(act: number): number {
  return act >= 4 ? 520 : act >= 3 ? 290 : act >= 2 ? 160 : 80;
}

const TUNE: ShipTuning = { fouling: 1, crewFactor: 1, seamanship: 0.6, keel: 1, integrity: 1 };

/** How close her whole rig will lie, summed mast by mast as `Game.noGoAngle` does. */
function noGoOf(h: HullClass): number {
  for (let beta = 5; beta <= 90; beta += 1) {
    let drive = 0;
    for (const m of h.masts) {
      const p = RIG_PROFILES[m.rig];
      drive += sailForce(10, beta, optimalTrim(beta, p), m.area, p).drive;
    }
    if (drive > 0) return clamp(beta + 7, 20, 88);
  }
  return 88;
}

/** Her heel at full canvas with a strong breeze on the beam. */
function heelOf(h: HullClass, windKnots: number): number {
  const dh = deriveHull(h);
  const state: DynamicState = {
    pos: { lat: 0, lon: 0 }, heading: 0, yawRate: 0, surge: 1, sway: 0, heel: 0, rudder: 0,
    sails: initialSails(h),
  };
  const beta = 80;
  for (let i = 0; i < state.sails.length; i++) {
    const p = RIG_PROFILES[h.masts[i].rig];
    state.sails[i].set = 1;
    state.sails[i].side = -1;
    state.sails[i].trim = optimalTrim(beta, p);
  }
  const env = { windFrom: beta, windKnots, currentToward: 0, currentKnots: 0, waveHeight: 0.02 * windKnots * windKnots };
  for (let step = 0; step < 220; step++) {
    state.heading = 0; state.yawRate = 0;
    stepShip(state, h, dh, env, TUNE, 1);
  }
  return Math.abs(state.heel);
}

export interface DesignReport {
  hull: HullClass;
  noGo: number;
  hullSpeed: number;
  reach12: number;
  run20: number;
  heel20: number;
  days: number;
  warnings: string[];
}

/** What the draughtsman tells you about her before a timber is cut. */
export function assessDesign(d: ShipDesign, act: number): DesignReport {
  const hull = hullFromDesign(d, 'draught');
  const dh = deriveHull(hull);
  const reach12 = polarSpeed(hull, dh, 12, 100, TUNE);
  const run20 = polarSpeed(hull, dh, 20, 150, TUNE);
  const heel20 = heelOf(hull, 20);
  const warnings: string[] = [];
  if (heel20 > 32) warnings.push('Crank: with all plain sail set she will lie down on her beam ends in a strong breeze.');
  else if (heel20 > 22) warnings.push('Tender: she will want canvas off her early, or she will lie over and sail on her side.');
  if (d.canvas > 1.22) warnings.push('Heavily sparred: pressed hard, she will carry away her masts.');
  if (d.draft > 3.9) warnings.push('She draws a great deal: she must anchor well out, and is no ship for rivers or bars.');
  if (hull.lwl / hull.beam > 3.55) warnings.push('Long and lean: fast, but she will work and leak in a heavy sea.');
  if (hull.tons > tonsAllowed(act)) warnings.push(`The Ribeira will not lay down more than ${tonsAllowed(act)} tonéis for you yet.`);
  return {
    hull, noGo: noGoOf(hull), hullSpeed: hullSpeedKnots(hull),
    reach12, run20, heel20, days: buildDays(hull), warnings,
  };
}

/** Her polar table, from the integrator, as scripts/genpolars.ts makes the stock ones. */
export function polarTable(h: HullClass): number[][] {
  const dh = deriveHull(h);
  return POLAR_WINDS.map((w) => {
    const line: number[] = [];
    for (let beta = 0; beta <= 180; beta += POLAR_BETA_STEP) line.push(Number(polarSpeed(h, dh, w, beta, TUNE).toFixed(2)));
    return line;
  });
}

/** Make a built hull known to everything that looks hulls up by id. */
export function registerHull(h: HullClass, polar: number[][]): void {
  HULL_BY_ID.set(h.id, h);
  POLARS[h.id] = polar;
}

export function isCustomHull(id: string): boolean {
  return id.startsWith('custom-');
}

