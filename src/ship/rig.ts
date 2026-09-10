import { DEG, clamp, lerp, smoothstep, wrap180 } from '../core/math';
import type { RigKind } from './hull';

export interface RigProfile {
  /**
   * How close to the centreline the sail can be trimmed, in degrees. This single
   * number is why a lateen caravel can beat to windward and a square-rigged nau
   * cannot: yards will not brace closer than about sixty degrees, so a square
   * sail simply has no useful angle of attack when the wind is forward.
   */
  minTrim: number;
  maxTrim: number;
  clMax: number;
  stallAoA: number;
  cd0: number;
  aspect: number;
  /** Seconds for a full crew to shift the sail onto the other tack. */
  shiftTime: number;
  /** Efficiency multiplier when the wind is well aft. */
  runFactor: number;
  /** Seconds to take in or make sail across the full range. */
  handleTime: number;
}

export const RIG_PROFILES: Record<RigKind, RigProfile> = {
  lateen: {
    minTrim: 8, maxTrim: 82,
    clMax: 1.55, stallAoA: 22, cd0: 0.09, aspect: 3.2,
    // Tacking a lateen means dipping the whole enormous yard around the forward
    // side of the mast. It is slow, it needs every hand, and in a seaway it is
    // genuinely dangerous.
    shiftTime: 105, runFactor: 0.72, handleTime: 45,
  },
  square: {
    minTrim: 58, maxTrim: 90,
    clMax: 1.15, stallAoA: 30, cd0: 0.12, aspect: 1.5,
    shiftTime: 38, runFactor: 1.18, handleTime: 60,
  },
};

export interface SailCoefficients {
  cl: number;
  cd: number;
}

/**
 * Lift and drag for a sail at a given angle of attack. Attached flow up to the
 * stall, then a blend into flat-plate behaviour, which is what a sail actually
 * does once it is broadside to the wind and working purely as a drag device.
 */
export function sailCoefficients(aoaDeg: number, p: RigProfile): SailCoefficients {
  let a = wrap180(aoaDeg);
  const sign = a < 0 ? -1 : 1;
  a = Math.abs(a);

  // Past ninety degrees the flow attaches on the other face of the sail.
  let fold = 1;
  if (a > 90) { a = 180 - a; fold = -1; }

  const attachedCd = p.cd0 + (p.clMax * p.clMax) / (Math.PI * p.aspect * 0.85);

  let cl: number;
  let cd: number;
  if (a <= p.stallAoA) {
    cl = p.clMax * Math.sin((Math.PI / 2) * (a / p.stallAoA));
    cd = p.cd0 + (cl * cl) / (Math.PI * p.aspect * 0.85);
  } else {
    const t = smoothstep(p.stallAoA, 90, a);
    const plateCl = Math.sin(2 * a * DEG) * 1.05;
    const plateCd = 0.08 + 1.9 * Math.sin(a * DEG) ** 2;
    cl = lerp(p.clMax, plateCl, t);
    cd = lerp(attachedCd, plateCd, t);
  }

  return { cl: cl * sign * fold, cd };
}

export interface SailForce {
  /** Force along the hull axis, newtons. Positive drives her ahead. */
  drive: number;
  /** Force abeam, newtons. Positive is to starboard. */
  side: number;
  /** Angle of attack actually achieved, degrees. */
  aoa: number;
  luffing: boolean;
  stalled: boolean;
  /** Aerodynamic force magnitude, for spar-loading checks. */
  load: number;
}

const AIR_DENSITY = 1.225;

/**
 * Resolve one sail into hull-axis forces.
 *
 * `beta` is the apparent wind angle off the bow: zero is dead ahead, positive
 * means the wind is on the starboard side. `trim` is the angle of the sail's
 * chord from the centreline; the sail always sets to leeward.
 */
export function sailForce(
  apparentSpeed: number,
  beta: number,
  trim: number,
  area: number,
  p: RigProfile,
): SailForce {
  if (area <= 0 || apparentSpeed <= 0.01) {
    return { drive: 0, side: 0, aoa: 0, luffing: true, stalled: false, load: 0 };
  }

  const absBeta = Math.abs(beta);
  const tack = beta >= 0 ? 1 : -1;
  const aoa = absBeta - trim;

  const { cl, cd } = sailCoefficients(aoa, p);

  // Well aft, a square course draws better than a lateen and a lateen blankets
  // itself and rolls. Fold that in as an efficiency on the driving component.
  const aftFactor = lerp(1, p.runFactor, smoothstep(110, 170, absBeta));

  const q = 0.5 * AIR_DENSITY * apparentSpeed * apparentSpeed;
  const lift = q * area * cl;
  const drag = q * area * cd;

  const sinB = Math.sin(absBeta * DEG);
  const cosB = Math.cos(absBeta * DEG);

  const drive = (lift * sinB - drag * cosB) * aftFactor;
  // The side force always acts to leeward, which is away from the wind's side.
  const sideMag = lift * cosB + drag * sinB;
  const side = -tack * sideMag;

  return {
    drive,
    side,
    aoa,
    luffing: aoa < 2.5,
    stalled: aoa > p.stallAoA + 8,
    load: Math.hypot(lift, drag),
  };
}

/**
 * Trim that extracts the most drive at the current apparent wind angle. Used by
 * the crew's automatic trim and to show the player how far off they are.
 */
export function optimalTrim(beta: number, p: RigProfile): number {
  const absBeta = Math.abs(beta);
  // Search rather than solve: the objective is not convex once the sail stalls.
  let best = p.minTrim;
  let bestDrive = -Infinity;
  for (let t = p.minTrim; t <= p.maxTrim; t += 1) {
    const f = sailForce(10, absBeta, t, 100, p);
    if (f.drive > bestDrive) { bestDrive = f.drive; best = t; }
  }
  return clamp(best, p.minTrim, p.maxTrim);
}

const POINTS_OF_SAIL: { limit: number; name: string }[] = [
  { limit: 30, name: 'In irons' },
  { limit: 55, name: 'Close-hauled' },
  { limit: 75, name: 'Close reach' },
  { limit: 105, name: 'Beam reach' },
  { limit: 155, name: 'Broad reach' },
  { limit: 181, name: 'Running' },
];

export function pointOfSail(beta: number): string {
  const a = Math.abs(beta);
  for (const p of POINTS_OF_SAIL) if (a < p.limit) return p.name;
  return 'Running';
}

export function tackName(beta: number): string {
  if (Math.abs(beta) < 5) return '';
  return beta > 0 ? 'starboard tack' : 'port tack';
}
