import { clamp, lerpAngle, lerp, smoothstep, wrap360, type LatLon } from '../core/math';
import { fbm1 } from '../core/rng';

export interface Wind {
  /** True direction the wind blows FROM, degrees. */
  from: number;
  /** Speed in knots. */
  speed: number;
}

/**
 * Planetary wind belts, keyed by latitude relative to the Intertropical
 * Convergence Zone. Positive entries are north of it. Directions are the
 * meteorological "from" convention.
 *
 * These are the belts that made Portuguese ocean sailing possible: the north-east
 * trades carry you down to Guinea, and because you cannot beat back up against
 * them you stand far out to the north-west until you reach the westerlies and
 * run home. That manoeuvre is the volta do mar.
 */
const BELTS: { y: number; from: number; speed: number; steadiness: number }[] = [
  { y: -60, from: 288, speed: 34, steadiness: 0.55 },
  { y: -48, from: 280, speed: 28, steadiness: 0.60 },
  { y: -40, from: 274, speed: 22, steadiness: 0.58 },
  { y: -34, from: 262, speed: 14, steadiness: 0.45 },
  { y: -30, from: 200, speed: 6, steadiness: 0.20 },
  { y: -26, from: 142, speed: 10, steadiness: 0.55 },
  { y: -20, from: 122, speed: 15, steadiness: 0.86 },
  { y: -12, from: 116, speed: 15, steadiness: 0.90 },
  { y: -5, from: 112, speed: 12, steadiness: 0.80 },
  { y: -1.5, from: 90, speed: 3, steadiness: 0.10 },
  { y: 1.5, from: 90, speed: 3, steadiness: 0.10 },
  { y: 5, from: 68, speed: 12, steadiness: 0.80 },
  { y: 12, from: 62, speed: 15, steadiness: 0.90 },
  { y: 20, from: 52, speed: 15, steadiness: 0.86 },
  { y: 26, from: 40, speed: 10, steadiness: 0.55 },
  { y: 30, from: 350, speed: 6, steadiness: 0.20 },
  { y: 34, from: 248, speed: 13, steadiness: 0.45 },
  { y: 42, from: 258, speed: 18, steadiness: 0.58 },
  { y: 52, from: 266, speed: 21, steadiness: 0.60 },
  { y: 62, from: 262, speed: 19, steadiness: 0.55 },
];

/**
 * Latitude of the ITCZ for a given day. It follows the thermal equator north in
 * boreal summer and south in boreal winter.
 */
export function itczLatitude(dayOfYear: number): number {
  return 4 + 6 * Math.sin((2 * Math.PI * (dayOfYear - 100)) / 365);
}

function sampleBelts(y: number): { from: number; speed: number; steadiness: number } {
  if (y <= BELTS[0].y) return { ...BELTS[0] };
  const last = BELTS[BELTS.length - 1];
  if (y >= last.y) return { ...last };
  for (let i = 0; i < BELTS.length - 1; i++) {
    const a = BELTS[i], b = BELTS[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = smoothstep(a.y, b.y, y);
      return {
        from: lerpAngle(a.from, b.from, t),
        speed: lerp(a.speed, b.speed, t),
        steadiness: lerp(a.steadiness, b.steadiness, t),
      };
    }
  }
  return { ...last };
}

/** Region mask for the monsoon-dominated Indian Ocean. */
function monsoonMask(p: LatLon): number {
  const lonMask = smoothstep(34, 48, p.lon) * (1 - smoothstep(96, 112, p.lon));
  const latMask = smoothstep(-24, -10, p.lat) * (1 - smoothstep(24, 32, p.lat));
  return lonMask * latMask;
}

/**
 * Monsoon phase: +1 at the height of the south-west monsoon (July), -1 at the
 * height of the north-east monsoon (January).
 */
export function monsoonPhase(dayOfYear: number): number {
  return Math.sin((2 * Math.PI * (dayOfYear - 105)) / 365);
}

export function monsoonName(dayOfYear: number): string {
  const m = monsoonPhase(dayOfYear);
  if (m > 0.35) return 'South-west monsoon';
  if (m < -0.35) return 'North-east monsoon';
  return m >= 0 ? 'Monsoon turning to the south-west' : 'Monsoon turning to the north-east';
}

/** Persistent coastal wind regimes that override the zonal belts near shore. */
function coastalBias(p: LatLon): { from: number; speed: number; weight: number } | null {
  // Portuguese trade winds ("nortada") down the Iberian and Moroccan coast.
  if (p.lat > 26 && p.lat < 44 && p.lon > -14 && p.lon < -5.5) {
    return { from: 15, speed: 15, weight: 0.55 };
  }
  // Benguela: relentless south-easterly along the desert coast of Namibia.
  if (p.lat > -30 && p.lat < -12 && p.lon > 8 && p.lon < 17) {
    return { from: 168, speed: 16, weight: 0.6 };
  }
  // The Guinea coast sits under the monsoonal south-westerly off the Atlantic.
  if (p.lat > 2 && p.lat < 9 && p.lon > -8 && p.lon < 10) {
    return { from: 215, speed: 9, weight: 0.5 };
  }
  return null;
}

export interface WindSample extends Wind {
  /** 0 fickle, 1 rock steady. Drives how fast the wind wanders. */
  steadiness: number;
  /** Convenience flag for the doldrum band. */
  doldrums: boolean;
}

/**
 * Prevailing wind at a place and time, before local weather is applied.
 * `t` is simulated seconds, used to wander the wind slowly and believably.
 */
export function prevailingWind(p: LatLon, dayOfYear: number, t: number): WindSample {
  const y = p.lat - itczLatitude(dayOfYear);
  const belt = sampleBelts(y);

  let from = belt.from;
  let speed = belt.speed;
  let steadiness = belt.steadiness;

  const mm = monsoonMask(p);
  if (mm > 0.01) {
    const phase = monsoonPhase(dayOfYear);
    let mFrom: number;
    let mSpeed: number;
    let mSteady: number;
    if (phase > 0.2) {
      // South-west monsoon: the season that carries a fleet from Malindi to India.
      const s = smoothstep(0.2, 0.9, phase);
      mFrom = lerp(250, 222, s);
      mSpeed = lerp(12, 30, s);
      mSteady = lerp(0.6, 0.92, s);
    } else if (phase < -0.2) {
      // North-east monsoon: the return season.
      const s = smoothstep(-0.2, -0.9, phase);
      mFrom = lerp(30, 48, s);
      mSpeed = lerp(9, 18, s);
      mSteady = lerp(0.6, 0.88, s);
    } else {
      // The turning of the monsoon: calms, thunderstorms, and no way to make ground.
      mFrom = phase >= 0 ? 160 : 320;
      mSpeed = 5;
      mSteady = 0.15;
    }
    from = lerpAngle(from, mFrom, mm);
    speed = lerp(speed, mSpeed, mm);
    steadiness = lerp(steadiness, mSteady, mm);
  }

  const coast = coastalBias(p);
  if (coast) {
    from = lerpAngle(from, coast.from, coast.weight);
    speed = lerp(speed, coast.speed, coast.weight * 0.8);
  }

  // Slow wander. Unsteady regimes swing much further and much faster.
  const hours = t / 3600;
  const wanderRate = lerp(0.06, 0.012, steadiness);
  const spatial = p.lat * 0.31 + p.lon * 0.17;
  const dirNoise = fbm1(hours * wanderRate + spatial, 3, 11);
  const spdNoise = fbm1(hours * wanderRate * 1.4 + spatial + 50, 3, 27);

  from = wrap360(from + dirNoise * lerp(85, 14, steadiness));
  speed = Math.max(0, speed * (1 + spdNoise * lerp(0.7, 0.25, steadiness)));

  const doldrums = Math.abs(y) < 3.5 && mm < 0.5;
  if (doldrums) speed = Math.min(speed, 6) * (0.4 + 0.6 * Math.abs(dirNoise));

  return { from, speed, steadiness, doldrums };
}

/** Beaufort force for a wind speed in knots. */
export function beaufort(knots: number): number {
  const limits = [1, 3, 6, 10, 16, 21, 27, 33, 40, 47, 55, 63];
  for (let i = 0; i < limits.length; i++) if (knots < limits[i]) return i;
  return 12;
}

const BEAUFORT_NAMES = [
  'Calm', 'Light air', 'Light breeze', 'Gentle breeze', 'Moderate breeze',
  'Fresh breeze', 'Strong breeze', 'Near gale', 'Gale', 'Strong gale',
  'Storm', 'Violent storm', 'Hurricane',
];

export function beaufortName(knots: number): string {
  return BEAUFORT_NAMES[beaufort(knots)];
}

/**
 * Significant wave height in metres for a fully developed sea. Calibrated so a
 * fresh breeze raises about two metres and a whole gale about eight, which is
 * what the Beaufort tables give.
 */
export function seaState(knots: number): number {
  return clamp(0.00556 * knots * knots, 0.12, 16);
}
