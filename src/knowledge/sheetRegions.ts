/**
 * The regions a survey sheet is cut by (BUILD_PLAN D3).
 *
 * A sheet is a region's chart data at the grade the captain holds it. The regions follow the road, west
 * Africa to Malabar, because a pilot's survey is a stretch of coast run and the Casa, the Rua Nova and the
 * other captain all buy by the stretch. Pure data: no Game, no Chart, so the rival (progression/rival.ts)
 * can read them without a cycle.
 */

export interface SheetRegion {
  id: string;
  name: string;
  latMin: number; latMax: number; lonMin: number; lonMax: number;
  /** How much a stretch of this coast is worth to a buyer, against the Guinea run at 1. */
  weight: number;
}

export const SHEET_REGIONS: SheetRegion[] = [
  { id: 'algarve', name: 'Portugal and the Algarve', latMin: 36, latMax: 44, lonMin: -11, lonMax: -5, weight: 0.4 },
  { id: 'islands', name: 'Madeira and the Canaries', latMin: 26.5, latMax: 33.5, lonMin: -19, lonMax: -12.5, weight: 0.5 },
  { id: 'maghreb', name: 'The Moroccan and Saharan coast', latMin: 21, latMax: 36, lonMin: -18, lonMax: -4, weight: 0.8 },
  { id: 'guinea', name: 'Guinea, Senegal to Benin', latMin: 3, latMax: 21, lonMin: -18, lonMax: 12, weight: 1.4 },
  { id: 'kongo', name: 'Kongo and Angola', latMin: -18, latMax: 3, lonMin: 5, lonMax: 16, weight: 1.3 },
  { id: 'cape', name: 'The Cape and the south coast', latMin: -36, latMax: -18, lonMin: 14, lonMax: 34, weight: 1.6 },
  { id: 'swahili', name: 'The Swahili coast', latMin: -26, latMax: 12, lonMin: 32, lonMax: 52, weight: 1.5 },
  { id: 'arabia', name: 'Arabia and Socotra', latMin: 9, latMax: 26, lonMin: 40, lonMax: 60, weight: 0.9 },
  { id: 'malabar', name: 'The Malabar coast', latMin: 8, latMax: 22, lonMin: 68, lonMax: 80, weight: 1.5 },
];

export const REGION_BY_ID = new Map(SHEET_REGIONS.map((r) => [r.id, r]));

/**
 * The region his working coast has got to, by latitude. The rival is a man working down the Atlantic side
 * of Africa, so only those regions can be where his frontier is.
 */
export function regionAtFrontier(lat: number): string {
  if (lat > 36) return 'algarve';
  if (lat > 21) return 'maghreb';
  if (lat > 3) return 'guinea';
  if (lat > -18) return 'kongo';
  return 'cape';
}

/** The region a point is in, or the nearest by box centre when it is in none. */
export function regionOfPoint(lat: number, lon: number): string {
  let best = SHEET_REGIONS[0], bd = Infinity;
  for (const r of SHEET_REGIONS) {
    if (lat >= r.latMin && lat <= r.latMax && lon >= r.lonMin && lon <= r.lonMax) return r.id;
    const d = Math.hypot(lat - (r.latMin + r.latMax) / 2, lon - (r.lonMin + r.lonMax) / 2);
    if (d < bd) { bd = d; best = r; }
  }
  return best.id;
}

/**
 * Storm and silting. A coast changes: a bar shifts, a river mouth silts, a headland is shaved. Each region
 * has, in each year, a fixed small chance that it did, decided by the seed alone, so a sheet's age is the
 * count of such changes since it was drawn. Deterministic per seed and the same on every load.
 */
export const CHANGE_CHANCE = 0.14;
export const FIRST_YEAR = 1482;

export function changed(seed: number, region: string, year: number): boolean {
  let h = 2166136261 ^ (seed | 0);
  const s = `${region}|${year}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h >>> 0) % 10000) / 10000 < CHANGE_CHANCE;
}

/** How many changes the region has had up to and including `year`. */
export function epochAt(seed: number, region: string, year: number): number {
  let n = 0;
  for (let y = FIRST_YEAR; y <= year; y++) if (changed(seed, region, y)) n++;
  return n;
}

/** What one buyer holds of one region: the level it was drawn at and the region's epoch when it was handed over. */
export interface Holding { level: number; epoch: number; t: number }

/** Each change since the sheet was drawn takes this much off what the holder can steer by. */
export const AGE_PER_CHANGE = 0.5;

export function effectiveLevel(h: Holding | undefined, epochNow: number): number {
  if (!h) return 0;
  return Math.max(0, h.level - AGE_PER_CHANGE * Math.max(0, epochNow - h.epoch));
}
