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
  /** A yearly swing in strength: times (1 + amp · cos) about the peak day. */
  seasonal?: { peakDoy: number; amp: number };
}

/**
 * Speeds are the long-run mean surface drift a ship would feel, from the
 * pilot-chart and drifter climatologies, not the peak in the core of a jet: a
 * band here is hundreds of miles wide, and a ship crossing it meets the mean.
 * Several of these were once set at their peaks and summed where they
 * overlapped, which put two and a half knots of set against every ship
 * leaving Mina and a knot and a half across the whole South Atlantic.
 */
const BANDS: Band[] = [
  // North Atlantic gyre, clockwise.
  { name: 'Canary Current', latMin: 12, latMax: 33, lonMin: -22, lonMax: -8, toward: 200, knots: 0.45, feather: 3 },
  { name: 'North Equatorial Current', latMin: 8, latMax: 20, lonMin: -60, lonMax: -18, toward: 278, knots: 0.5, feather: 3 },
  // The counter-current runs east under the doldrums, strongest from July to
  // November and all but gone from the eastern Atlantic in the spring.
  { name: 'Equatorial Counter-Current', latMin: 3, latMax: 9, lonMin: -35, lonMax: -10, toward: 90, knots: 0.6, feather: 1.5, seasonal: { peakDoy: 225, amp: 0.7 } },
  // The Guinea Current hugs the coast from Cape Palmas into the Bight: about
  // a knot in the summer, half that in the winter, and a narrow ribbon — the
  // South Equatorial Current is setting the other way a degree or two south.
  { name: 'Guinea Current', latMin: 3.2, latMax: 6.5, lonMin: -9, lonMax: 8, toward: 92, knots: 0.8, feather: 1, seasonal: { peakDoy: 190, amp: 0.4 } },
  { name: 'Gulf Stream', latMin: 26, latMax: 40, lonMin: -80, lonMax: -60, toward: 45, knots: 1.6, feather: 2.5 },
  { name: 'North Atlantic Drift', latMin: 42, latMax: 56, lonMin: -50, lonMax: -12, toward: 65, knots: 0.35, feather: 4 },
  // The Azores Current: the gyre's return flow east along 34-36°N, weak but
  // real, and fair for a ship coming home.
  { name: 'Azores Current', latMin: 33, latMax: 37, lonMin: -40, lonMax: -14, toward: 95, knots: 0.25, feather: 2 },
  // Measured by the Casa's pilots at a quarter-knot or so, and not the half
  // this once had; with the Canary Current laid under it that summed to a knot
  // setting her south on every approach to Lisbon.
  { name: 'Portugal Current', latMin: 33, latMax: 44, lonMin: -18, lonMax: -8, toward: 190, knots: 0.2, feather: 2.5 },

  // South Atlantic gyre, anticlockwise. The equatorial current is fast in a
  // narrow band either side of the line and slack further south.
  { name: 'South Equatorial Current', latMin: -5, latMax: 2, lonMin: -35, lonMax: 5, toward: 275, knots: 0.8, feather: 2 },
  { name: 'South Equatorial Current', latMin: -18, latMax: -5, lonMin: -35, lonMax: 8, toward: 285, knots: 0.4, feather: 3 },
  { name: 'Brazil Current', latMin: -38, latMax: -12, lonMin: -50, lonMax: -36, toward: 200, knots: 0.6, feather: 3 },
  { name: 'South Atlantic Current', latMin: -46, latMax: -36, lonMin: -45, lonMax: 15, toward: 85, knots: 0.4, feather: 4 },
  { name: 'Benguela Current', latMin: -34, latMax: -15, lonMin: 6, lonMax: 17, toward: 335, knots: 0.45, feather: 3 },
  // Down the coast of Angola the other way, warm and weak, to meet the
  // Benguela at the front off Cabo Frio.
  { name: 'Angola Current', latMin: -16, latMax: -5, lonMin: 9, lonMax: 14, toward: 175, knots: 0.35, feather: 1.5 },

  // Southern Ocean.
  { name: 'West Wind Drift', latMin: -58, latMax: -44, lonMin: -60, lonMax: 120, toward: 90, knots: 0.8, feather: 4 },

  // Indian Ocean. The Agulhas is genuinely dangerous: two knots and more set
  // south along the shelf edge, with the westerlies blowing against it and
  // raising freak seas. Averaged across the band here; the core runs faster.
  { name: 'Agulhas Current', latMin: -37, latMax: -27, lonMin: 27, lonMax: 33, toward: 222, knots: 2.0, feather: 1.5 },
  // The Mozambique Channel is eddies more than a current; the mean set is
  // south, and about a knot down its western side.
  { name: 'Mozambique Current', latMin: -25, latMax: -12, lonMin: 34, lonMax: 42, toward: 200, knots: 0.8, feather: 2 },
  { name: 'South Equatorial Current', latMin: -18, latMax: -8, lonMin: 45, lonMax: 100, toward: 272, knots: 0.6, feather: 3 },
  // Up the Swahili coast from Cape Delgado to Malindi, all the year round:
  // the current that carried da Gama north to Mombasa.
  { name: 'East African Coastal Current', latMin: -11, latMax: -2, lonMin: 38, lonMax: 43, toward: 20, knots: 1.2, feather: 1.5 },
  { name: 'Somali Current', latMin: -2, latMax: 12, lonMin: 43, lonMax: 55, toward: 35, knots: 3.0, feather: 2.5, monsoonal: true, reversing: true },
  { name: 'Monsoon Drift', latMin: 2, latMax: 20, lonMin: 55, lonMax: 92, toward: 80, knots: 0.8, feather: 3, monsoonal: true, reversing: true },
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

    if (b.seasonal) {
      knots *= Math.max(0, 1 + b.seasonal.amp * Math.cos((2 * Math.PI * (dayOfYear - b.seasonal.peakDoy)) / 365));
    }
    if (b.monsoonal) {
      if (b.reversing && phase < 0) {
        // The north-east monsoon drives these currents the other way, and
        // more weakly: the Somali Current runs a knot south in winter where
        // it runs three or four north in the south-west monsoon.
        toward = wrap360(toward + 180);
        knots *= 0.4;
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
