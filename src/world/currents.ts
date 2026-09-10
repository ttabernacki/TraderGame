import { clamp, smoothstep, wrap360, type LatLon } from '../core/math';
import { monsoonPhase } from './wind';

export interface Current {
  /** True direction the water sets TOWARD, degrees. */
  toward: number;
  /** Drift in knots. */
  knots: number;
}

/**
 * Named ocean currents as directed bands. A current sets a ship bodily sideways
 * without any indication on deck, so these are the main reason dead reckoning
 * drifts from the truth — and the reason a chart drawn from dead reckoning is
 * wrong in ways the navigator cannot see.
 */
interface Band {
  name: string;
  latMin: number; latMax: number;
  lonMin: number; lonMax: number;
  toward: number;
  knots: number;
  /** Falloff in degrees at the edges of the band. */
  feather: number;
  /** When set, strength follows the monsoon and may reverse. */
  monsoonal?: boolean;
  reversing?: boolean;
}

const BANDS: Band[] = [
  // North Atlantic gyre, clockwise.
  { name: 'Canary Current', latMin: 12, latMax: 33, lonMin: -22, lonMax: -8, toward: 200, knots: 0.8, feather: 3 },
  { name: 'North Equatorial Current', latMin: 6, latMax: 19, lonMin: -60, lonMax: -18, toward: 278, knots: 0.7, feather: 3 },
  { name: 'Equatorial Counter-Current', latMin: 3, latMax: 8, lonMin: -30, lonMax: 5, toward: 92, knots: 0.9, feather: 1.5 },
  { name: 'Guinea Current', latMin: 1, latMax: 7, lonMin: -12, lonMax: 9, toward: 95, knots: 1.5, feather: 1.5 },
  { name: 'Gulf Stream', latMin: 26, latMax: 42, lonMin: -80, lonMax: -55, toward: 50, knots: 2.6, feather: 3 },
  { name: 'North Atlantic Drift', latMin: 40, latMax: 56, lonMin: -50, lonMax: -12, toward: 70, knots: 0.7, feather: 4 },
  { name: 'Portugal Current', latMin: 33, latMax: 44, lonMin: -18, lonMax: -8, toward: 190, knots: 0.5, feather: 2.5 },

  // South Atlantic gyre, anticlockwise.
  { name: 'South Equatorial Current', latMin: -18, latMax: -1, lonMin: -35, lonMax: 8, toward: 282, knots: 0.9, feather: 3 },
  { name: 'Brazil Current', latMin: -38, latMax: -12, lonMin: -50, lonMax: -35, toward: 200, knots: 1.2, feather: 3 },
  { name: 'South Atlantic Current', latMin: -48, latMax: -36, lonMin: -45, lonMax: 15, toward: 88, knots: 1.0, feather: 4 },
  { name: 'Benguela Current', latMin: -34, latMax: -14, lonMin: 5, lonMax: 17, toward: 340, knots: 0.9, feather: 3 },

  // Southern Ocean.
  { name: 'West Wind Drift', latMin: -58, latMax: -44, lonMin: -60, lonMax: 120, toward: 90, knots: 1.4, feather: 4 },

  // Indian Ocean. The Agulhas is genuinely lethal: a two-to-four knot set south
  // along a coast where the westerlies blow against it and raise freak seas.
  { name: 'Agulhas Current', latMin: -37, latMax: -26, lonMin: 26, lonMax: 34, toward: 218, knots: 3.0, feather: 2 },
  { name: 'Mozambique Current', latMin: -25, latMax: -12, lonMin: 33, lonMax: 44, toward: 200, knots: 1.6, feather: 2 },
  { name: 'South Equatorial Current', latMin: -20, latMax: -8, lonMin: 44, lonMax: 100, toward: 275, knots: 0.9, feather: 3 },
  { name: 'Somali Current', latMin: -4, latMax: 12, lonMin: 42, lonMax: 55, toward: 40, knots: 3.2, feather: 2.5, monsoonal: true, reversing: true },
  { name: 'Monsoon Drift', latMin: 2, latMax: 20, lonMin: 55, lonMax: 92, toward: 80, knots: 1.1, feather: 3, monsoonal: true, reversing: true },
];

function bandWeight(b: Band, p: LatLon): number {
  const latW =
    smoothstep(b.latMin - b.feather, b.latMin + b.feather, p.lat) *
    (1 - smoothstep(b.latMax - b.feather, b.latMax + b.feather, p.lat));
  const lonW =
    smoothstep(b.lonMin - b.feather, b.lonMin + b.feather, p.lon) *
    (1 - smoothstep(b.lonMax - b.feather, b.lonMax + b.feather, p.lon));
  return latW * lonW;
}

/** Combined surface current at a position, summed as vectors across all bands. */
export function currentAt(p: LatLon, dayOfYear: number): Current {
  let e = 0;
  let n = 0;
  const phase = monsoonPhase(dayOfYear);

  for (const b of BANDS) {
    const w = bandWeight(b, p);
    if (w < 0.005) continue;

    let toward = b.toward;
    let knots = b.knots * w;

    if (b.monsoonal) {
      if (b.reversing && phase < 0) {
        // The north-east monsoon drives these currents the other way.
        toward = wrap360(toward + 180);
        knots *= 0.55;
      }
      knots *= 0.45 + 0.55 * Math.abs(phase);
    }

    const r = (toward * Math.PI) / 180;
    e += Math.sin(r) * knots;
    n += Math.cos(r) * knots;
  }

  const knots = Math.hypot(e, n);
  if (knots < 1e-4) return { toward: 0, knots: 0 };
  return { toward: wrap360((Math.atan2(e, n) * 180) / Math.PI), knots };
}

/**
 * Name of the dominant current, for the pilot's remarks once the player has
 * enough skill to recognise a set.
 */
export function dominantCurrentName(p: LatLon): string | null {
  let best: Band | null = null;
  let bestW = 0.15;
  for (const b of BANDS) {
    const w = bandWeight(b, p) * b.knots;
    if (w > bestW) { bestW = w; best = b; }
  }
  return best ? best.name : null;
}

/**
 * Semi-diurnal tide. Range is small in open water and large in the estuaries
 * and shelf seas where it matters — crossing a river bar at the wrong state of
 * tide is how ships were lost.
 */
export function tideHeight(p: LatLon, t: number): number {
  const range = tidalRange(p);
  // Two lunar cycles a day, with the phase offset by longitude so high water
  // sweeps around the world rather than happening everywhere at once.
  const period = 44712; // seconds in a mean lunar semi-diurnal cycle
  const phase = (t / period) * 2 * Math.PI - (p.lon * Math.PI) / 180;
  // Spring and neap modulation over the synodic month.
  const springs = 0.7 + 0.3 * Math.cos((2 * Math.PI * t) / (29.53 * 86400));
  return (range / 2) * springs * Math.sin(phase);
}

/** Mean tidal range in metres. */
export function tidalRange(p: LatLon): number {
  let r = 0.6;
  // Iberian and Moroccan Atlantic coast.
  if (p.lat > 27 && p.lat < 46 && p.lon > -12 && p.lon < -5) r = 3.2;
  // The Guinea coast and the bight.
  if (p.lat > -2 && p.lat < 8 && p.lon > -18 && p.lon < 10) r = 1.6;
  // Bay of Cambay: famously enormous, up to eleven metres.
  if (p.lat > 19 && p.lat < 24 && p.lon > 68 && p.lon < 74) r = 8.0;
  // Mozambique Channel.
  if (p.lat > -26 && p.lat < -11 && p.lon > 32 && p.lon < 46) r = 3.4;
  // Rio de la Plata and the Patagonian shelf.
  if (p.lat > -50 && p.lat < -33 && p.lon > -70 && p.lon < -55) r = 5.5;
  return r;
}

/**
 * Tidal stream near the coast, which runs with the flood and against the ebb.
 * Only meaningful inshore, so it is scaled down with distance from land.
 */
export function tidalStream(p: LatLon, t: number, shoreDistNm: number): Current {
  if (shoreDistNm > 25) return { toward: 0, knots: 0 };
  const range = tidalRange(p);
  const period = 44712;
  const phase = (t / period) * 2 * Math.PI - (p.lon * Math.PI) / 180;
  // Streams lead the height curve by a quarter cycle: maximum rate at mid-tide.
  const rate = Math.cos(phase) * range * 0.28 * (1 - smoothstep(4, 25, shoreDistNm));
  const axis = 20 + p.lat * 3 + p.lon * 5;
  return {
    toward: wrap360(rate >= 0 ? axis : axis + 180),
    knots: clamp(Math.abs(rate), 0, 4),
  };
}
