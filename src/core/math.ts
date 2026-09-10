export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** Metres in a nautical mile. */
export const NM = 1852;
/** Mean Earth radius in metres. */
export const EARTH_R = 6371000;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Move `cur` toward `target` by at most `maxDelta`. */
export function approach(cur: number, target: number, maxDelta: number): number {
  const d = target - cur;
  if (Math.abs(d) <= maxDelta) return target;
  return cur + Math.sign(d) * maxDelta;
}

/** Wrap to [0, 360). */
export function wrap360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Wrap to (-180, 180]. */
export function wrap180(deg: number): number {
  let r = wrap360(deg);
  if (r > 180) r -= 360;
  return r;
}

/** Smallest signed turn from `a` to `b`, in (-180, 180]. */
export function angleDelta(a: number, b: number): number {
  return wrap180(b - a);
}

/** Angular interpolation across the 0/360 seam. */
export function lerpAngle(a: number, b: number, t: number): number {
  return wrap360(a + angleDelta(a, b) * t);
}

export function sind(deg: number): number {
  return Math.sin(deg * DEG);
}

export function cosd(deg: number): number {
  return Math.cos(deg * DEG);
}

export function tand(deg: number): number {
  return Math.tan(deg * DEG);
}

export function asind(x: number): number {
  return Math.asin(clamp(x, -1, 1)) * RAD;
}

export function acosd(x: number): number {
  return Math.acos(clamp(x, -1, 1)) * RAD;
}

export function atan2d(y: number, x: number): number {
  return Math.atan2(y, x) * RAD;
}

// ---------------------------------------------------------------------------
// Geodesy
// ---------------------------------------------------------------------------

export interface LatLon {
  lat: number;
  lon: number;
}

/** Metres per degree of longitude at a given latitude. */
export function metresPerDegLon(lat: number): number {
  return (EARTH_R * DEG) * Math.max(cosd(lat), 1e-6);
}

/** Metres per degree of latitude (spherical approximation). */
export const METRES_PER_DEG_LAT = EARTH_R * DEG;

/**
 * Advance a position by a distance along a rhumb line (constant bearing).
 * Period navigators sailed rhumb lines, not great circles, so this is the
 * correct integrator for the ship's motion.
 */
export function rhumbStep(from: LatLon, bearingDeg: number, distM: number): LatLon {
  const dLatRad = (distM * cosd(bearingDeg)) / EARTH_R;
  const lat2 = from.lat + dLatRad * RAD;

  // Meridional parts difference; falls back to the mean-latitude form near due east/west.
  const latR1 = from.lat * DEG;
  const latR2 = lat2 * DEG;
  const dPsi = Math.log(
    Math.tan(Math.PI / 4 + latR2 / 2) / Math.tan(Math.PI / 4 + latR1 / 2),
  );
  const q = Math.abs(dPsi) > 1e-11 ? (latR2 - latR1) / dPsi : Math.cos(latR1);
  const dLonRad = (distM * sind(bearingDeg)) / (EARTH_R * (Math.abs(q) < 1e-9 ? 1e-9 : q));

  return {
    lat: clamp(lat2, -85, 85),
    lon: wrap180(from.lon + dLonRad * RAD),
  };
}

/** Great-circle distance in metres. */
export function haversine(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = wrap180(b.lon - a.lon) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    cosd(a.lat) * cosd(b.lat) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(clamp(s, 0, 1)));
}

/** Initial great-circle bearing from `a` to `b`, degrees true. */
export function bearingTo(a: LatLon, b: LatLon): number {
  const dLon = wrap180(b.lon - a.lon) * DEG;
  const y = Math.sin(dLon) * cosd(b.lat);
  const x = cosd(a.lat) * sind(b.lat) - sind(a.lat) * cosd(b.lat) * Math.cos(dLon);
  return wrap360(Math.atan2(y, x) * RAD);
}

/**
 * Local east-north-up offset in metres of `p` relative to `origin`.
 * Accurate for the tens of kilometres we render around the ship.
 */
export function toENU(origin: LatLon, p: LatLon): { e: number; n: number } {
  return {
    e: wrap180(p.lon - origin.lon) * metresPerDegLon(origin.lat),
    n: (p.lat - origin.lat) * METRES_PER_DEG_LAT,
  };
}

/** Inverse of {@link toENU}. */
export function fromENU(origin: LatLon, e: number, n: number): LatLon {
  return {
    lat: origin.lat + n / METRES_PER_DEG_LAT,
    lon: wrap180(origin.lon + e / metresPerDegLon(origin.lat)),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatLat(lat: number): string {
  const h = lat >= 0 ? 'N' : 'S';
  const a = Math.abs(lat);
  const d = Math.floor(a);
  const m = (a - d) * 60;
  return `${d}° ${m.toFixed(1).padStart(4, '0')}' ${h}`;
}

export function formatLon(lon: number): string {
  const h = lon >= 0 ? 'E' : 'W';
  const a = Math.abs(lon);
  const d = Math.floor(a);
  const m = (a - d) * 60;
  return `${d}° ${m.toFixed(1).padStart(4, '0')}' ${h}`;
}

const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

/** Nearest of the sixteen compass points. */
export function compassPoint(deg: number): string {
  const i = Math.round(wrap360(deg) / 22.5) % 16;
  return COMPASS_POINTS[i];
}

export function formatBearing(deg: number): string {
  return `${wrap360(deg).toFixed(0).padStart(3, '0')}° ${compassPoint(deg)}`;
}
