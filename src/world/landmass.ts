import { LANDMASSES, type Landmass } from './coastlines';
import { clamp, cosd, METRES_PER_DEG_LAT, NM, wrap180, type LatLon } from '../core/math';

interface Segment {
  aLat: number; aLon: number;
  bLat: number; bLon: number;
  land: number;
}

interface PreparedLand {
  def: Landmass;
  ring: number[];
  minLat: number; maxLat: number;
  minLon: number; maxLon: number;
}

/**
 * Uniform lat/lon grid over every coastline segment. Cells are one degree,
 * which keeps the per-query candidate set tiny even though the ring data spans
 * the whole Old World.
 */
const CELL = 1;
const cells = new Map<number, Segment[]>();
const prepared: PreparedLand[] = [];

function cellKey(latIdx: number, lonIdx: number): number {
  return (latIdx + 200) * 100000 + (lonIdx + 400);
}

function insertSegment(seg: Segment): void {
  const lat0 = Math.floor(Math.min(seg.aLat, seg.bLat) / CELL);
  const lat1 = Math.floor(Math.max(seg.aLat, seg.bLat) / CELL);
  const lon0 = Math.floor(Math.min(seg.aLon, seg.bLon) / CELL);
  const lon1 = Math.floor(Math.max(seg.aLon, seg.bLon) / CELL);
  for (let la = lat0; la <= lat1; la++) {
    for (let lo = lon0; lo <= lon1; lo++) {
      const k = cellKey(la, lo);
      let list = cells.get(k);
      if (!list) cells.set(k, (list = []));
      list.push(seg);
    }
  }
}

let built = false;

function build(): void {
  if (built) return;
  built = true;
  for (let li = 0; li < LANDMASSES.length; li++) {
    const def = LANDMASSES[li];
    const r = def.ring;
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (let i = 0; i < r.length; i += 2) {
      minLat = Math.min(minLat, r[i]); maxLat = Math.max(maxLat, r[i]);
      minLon = Math.min(minLon, r[i + 1]); maxLon = Math.max(maxLon, r[i + 1]);
    }
    prepared.push({ def, ring: r, minLat, maxLat, minLon, maxLon });

    const n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      insertSegment({
        aLat: r[i * 2], aLon: r[i * 2 + 1],
        bLat: r[j * 2], bLon: r[j * 2 + 1],
        land: li,
      });
    }
  }
}

/** True if the position falls inside any landmass ring. */
export function isLand(p: LatLon): boolean {
  build();
  return landIndexAt(p) >= 0;
}

/** Index into {@link LANDMASSES} of the landmass containing `p`, or -1. */
export function landIndexAt(p: LatLon): number {
  build();
  for (let i = 0; i < prepared.length; i++) {
    const L = prepared[i];
    if (p.lat < L.minLat || p.lat > L.maxLat || p.lon < L.minLon || p.lon > L.maxLon) continue;
    if (pointInRing(L.ring, p.lat, p.lon)) return i;
  }
  return -1;
}

function pointInRing(r: number[], lat: number, lon: number): boolean {
  let inside = false;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = r[i * 2], xi = r[i * 2 + 1];
    const yj = r[j * 2], xj = r[j * 2 + 1];
    if ((yi > lat) !== (yj > lat)) {
      const t = (lat - yi) / (yj - yi);
      if (lon < xi + t * (xj - xi)) inside = !inside;
    }
  }
  return inside;
}

export interface ShoreInfo {
  /** Metres to the nearest coastline segment. */
  distance: number;
  /** True bearing from the query point toward that segment. */
  bearing: number;
  /** Index into {@link LANDMASSES}, or -1 when nothing is within the search radius. */
  land: number;
  /** Negative when the query point is inside a landmass. */
  signed: number;
}

const NO_SHORE: ShoreInfo = { distance: Infinity, bearing: 0, land: -1, signed: Infinity };

/**
 * Nearest coastline within `searchNm` nautical miles. Distances are computed on
 * a local tangent plane, which is exact enough at these ranges.
 */
export function nearestShore(p: LatLon, searchNm = 60): ShoreInfo {
  build();
  const radiusDeg = searchNm / 60;
  const mLon = METRES_PER_DEG_LAT * Math.max(cosd(p.lat), 1e-6);

  let bestSq = Infinity;
  let bestE = 0, bestN = 0, bestLand = -1;

  const lat0 = Math.floor((p.lat - radiusDeg) / CELL);
  const lat1 = Math.floor((p.lat + radiusDeg) / CELL);
  const lonSpan = radiusDeg / Math.max(cosd(p.lat), 0.2);
  const lon0 = Math.floor((p.lon - lonSpan) / CELL);
  const lon1 = Math.floor((p.lon + lonSpan) / CELL);

  const seen = new Set<Segment>();
  for (let la = lat0; la <= lat1; la++) {
    for (let lo = lon0; lo <= lon1; lo++) {
      const list = cells.get(cellKey(la, lo));
      if (!list) continue;
      for (const s of list) {
        if (seen.has(s)) continue;
        seen.add(s);

        const ax = wrap180(s.aLon - p.lon) * mLon;
        const ay = (s.aLat - p.lat) * METRES_PER_DEG_LAT;
        const bx = wrap180(s.bLon - p.lon) * mLon;
        const by = (s.bLat - p.lat) * METRES_PER_DEG_LAT;

        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        const t = lenSq > 0 ? clamp(-(ax * dx + ay * dy) / lenSq, 0, 1) : 0;
        const px = ax + dx * t, py = ay + dy * t;
        const dSq = px * px + py * py;
        if (dSq < bestSq) {
          bestSq = dSq;
          bestE = px; bestN = py; bestLand = s.land;
        }
      }
    }
  }

  if (bestLand < 0) return NO_SHORE;
  const dist = Math.sqrt(bestSq);
  const inside = landIndexAt(p) >= 0;
  return {
    distance: dist,
    bearing: (Math.atan2(bestE, bestN) * 180) / Math.PI,
    land: bestLand,
    signed: inside ? -dist : dist,
  };
}

/**
 * Water depth in metres. Modelled as a continental shelf that shoals toward the
 * coast: a steep near-shore ramp, a shelf, then the abyssal plain. Good enough
 * to make a lee shore genuinely dangerous and to let the lead line mean
 * something when closing with land.
 */
export function depthAt(p: LatLon, shore?: ShoreInfo): number {
  const s = shore ?? nearestShore(p, 90);
  if (s.land < 0) return 4200;
  if (s.signed <= 0) return -1;

  const nm = s.distance / NM;
  if (nm < 0.5) return 3 + nm * 14;
  if (nm < 3) return 10 + (nm - 0.5) * 12;
  if (nm < 12) return 40 + (nm - 3) * 6;
  if (nm < 35) return 94 + (nm - 12) * 8;
  if (nm < 70) return 278 + (nm - 35) * 60;
  return Math.min(4200, 2378 + (nm - 70) * 40);
}

/**
 * Height of land above sea level at a point inside a landmass, tapering up from
 * the coast so rendered terrain meets the water cleanly.
 */
export function elevationAt(p: LatLon, shore?: ShoreInfo): number {
  const s = shore ?? nearestShore(p, 90);
  if (s.land < 0 || s.signed > 0) return 0;
  const inlandNm = s.distance / NM;
  const peak = LANDMASSES[s.land].relief;
  const rise = 1 - Math.exp(-inlandNm / 14);
  const ridging =
    0.72 +
    0.28 * Math.sin(p.lat * 2.7 + p.lon * 1.9) * Math.cos(p.lon * 3.1 - p.lat * 1.3);
  return peak * rise * ridging * 0.55;
}

export interface CoastVertex {
  /** Stable identity: landmass index and vertex index within its ring. */
  land: number;
  index: number;
  lat: number;
  lon: number;
}

/**
 * Coastline vertices within `nm` nautical miles, used for charting what the
 * lookout can actually see from the masthead.
 */
export function coastVerticesNear(p: LatLon, nm: number): CoastVertex[] {
  build();
  const out: CoastVertex[] = [];
  const radiusDeg = nm / 60;
  const lonSpan = radiusDeg / Math.max(cosd(p.lat), 0.2);
  for (let li = 0; li < prepared.length; li++) {
    const L = prepared[li];
    if (p.lat + radiusDeg < L.minLat || p.lat - radiusDeg > L.maxLat) continue;
    if (p.lon + lonSpan < L.minLon || p.lon - lonSpan > L.maxLon) continue;
    const r = L.ring;
    for (let i = 0; i < r.length; i += 2) {
      const lat = r[i], lon = r[i + 1];
      const dLat = (lat - p.lat) * 60;
      const dLon = wrap180(lon - p.lon) * 60 * cosd(p.lat);
      if (Math.hypot(dLat, dLon) <= nm) {
        out.push({ land: li, index: i / 2, lat, lon });
      }
    }
  }
  return out;
}

/** Name of a landmass by index. */
export function landName(index: number): string {
  return LANDMASSES[index]?.name ?? 'Unknown land';
}

export { LANDMASSES };
