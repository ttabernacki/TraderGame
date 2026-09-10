import { NM, cosd, wrap180, type LatLon } from '../core/math';
import { LANDMASSES, coastVerticesNear, type CoastVertex } from '../world/landmass';
import { PORTS, anchorageOf, type PortDef } from '../world/ports';

export interface ChartedPoint {
  /** Landmass and vertex this represents. */
  key: string;
  /** Where the pilot drew it, which is where he thought he was when he saw it. */
  lat: number;
  lon: number;
  /** How far off the drawing is, in nautical miles. Never shown to the player. */
  errorNm: number;
  land: number;
  t: number;
}

export interface ChartedPort {
  id: string;
  lat: number;
  lon: number;
  visited: boolean;
  traded: boolean;
  t: number;
}

export interface Placename {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: 'cape' | 'bay' | 'river' | 'island' | 'shoal' | 'note';
  t: number;
}

export interface TrackPoint {
  lat: number;
  lon: number;
  t: number;
}

/**
 * The ship's chart.
 *
 * Everything on it is drawn at the position the pilot reckoned he occupied when
 * he saw it. His reckoning is wrong, so his chart is wrong, and because he has
 * no way to measure longitude the error he builds into it is permanent. Sail
 * the same coast twice by different reckonings and you will draw it twice, in
 * two places. This is not a bug in the chart; it is what every chart of this
 * period actually was.
 */
export class Chart {
  points = new Map<string, ChartedPoint>();
  ports = new Map<string, ChartedPort>();
  places: Placename[] = [];
  track: TrackPoint[] = [];

  private lastTrackT = -1e9;
  private nextPlaceId = 1;

  constructor() {
    this.seedKnownWorld();
  }

  /** What a Portuguese pilot already has on his chart at the start of the campaign. */
  private seedKnownWorld(): void {
    // The coast from Flanders to the Gulf of Guinea was well known by 1482, so it
    // is charted accurately. Everything beyond is blank paper.
    const seedBoxes = [
      { latMin: 30, latMax: 56, lonMin: -32, lonMax: 5 },
      { latMin: 3, latMax: 32, lonMin: -30, lonMax: 12 },
    ];
    for (const box of seedBoxes) {
      const stepLat = 1.6;
      const stepLon = 1.6;
      for (let lat = box.latMin; lat <= box.latMax; lat += stepLat) {
        for (let lon = box.lonMin; lon <= box.lonMax; lon += stepLon) {
          for (const v of coastVerticesNear({ lat, lon }, 70)) {
            const key = `${v.land}:${v.index}`;
            if (this.points.has(key)) continue;
            // Even the well-charted parts carry the errors of earlier pilots.
            const err = 0.06;
            this.points.set(key, {
              key,
              lat: v.lat + (hash(key) - 0.5) * err,
              lon: v.lon + (hash(key + 'x') - 0.5) * err * 2.2,
              errorNm: err * 60,
              land: v.land,
              t: 0,
            });
          }
        }
      }
    }

    for (const p of PORTS) {
      if (!p.known) continue;
      const at = anchorageOf(p);
      this.ports.set(p.id, { id: p.id, lat: at.lat, lon: at.lon, visited: false, traded: false, t: 0 });
    }
  }

  /**
   * Record whatever the lookout can see, drawn relative to the pilot's reckoned
   * position rather than the true one.
   */
  survey(
    truePos: LatLon,
    reckoned: LatLon,
    rangeNm: number,
    t: number,
    cartography: number,
  ): CoastVertex[] {
    if (rangeNm <= 0) return [];
    const seen = coastVerticesNear(truePos, rangeNm);
    const newly: CoastVertex[] = [];

    const dLat = reckoned.lat - truePos.lat;
    const dLon = wrap180(reckoned.lon - truePos.lon);

    for (const v of seen) {
      const key = `${v.land}:${v.index}`;
      const existing = this.points.get(key);

      // The nearer the land and the better the cartographer, the better the
      // relative survey, but the whole sheet is still displaced by the pilot's
      // own positional error.
      const distNm = Math.hypot(
        (v.lat - truePos.lat) * 60,
        wrap180(v.lon - truePos.lon) * 60 * cosd(truePos.lat),
      );
      const relativeErr = (0.02 + distNm * 0.004) * (1.4 - cartography);
      const plottedLat = v.lat + dLat + (hash(key + t) - 0.5) * relativeErr;
      const plottedLon = v.lon + dLon + (hash(key + 'y' + t) - 0.5) * relativeErr * 1.6;
      const errNm = Math.hypot(
        (plottedLat - v.lat) * 60,
        wrap180(plottedLon - v.lon) * 60 * cosd(v.lat),
      );

      // Only redraw if this pass is a better survey than the last one.
      if (existing && existing.errorNm <= errNm) continue;
      if (!existing) newly.push(v);
      this.points.set(key, { key, lat: plottedLat, lon: plottedLon, errorNm: errNm, land: v.land, t });
    }
    return newly;
  }

  /** Note the ship's position on the chart, as the pilot reckons it. */
  logTrack(reckoned: LatLon, t: number): void {
    if (t - this.lastTrackT < 3 * 3600) return;
    this.lastTrackT = t;
    this.track.push({ lat: reckoned.lat, lon: reckoned.lon, t });
    if (this.track.length > 3000) this.track.shift();
  }

  chartPort(def: PortDef, reckoned: LatLon, truePos: LatLon, t: number, visited: boolean): boolean {
    const existing = this.ports.get(def.id);
    if (existing && existing.visited) {
      if (visited) existing.visited = true;
      return false;
    }
    const at = anchorageOf(def);
    // Plotted relative to the pilot's reckoning, like everything else.
    const lat = at.lat + (reckoned.lat - truePos.lat);
    const lon = at.lon + wrap180(reckoned.lon - truePos.lon);
    this.ports.set(def.id, {
      id: def.id, lat, lon, visited, traded: existing?.traded ?? false, t,
    });
    return !existing;
  }

  addPlace(name: string, kind: Placename['kind'], reckoned: LatLon, t: number): Placename {
    const p: Placename = {
      id: `pl${this.nextPlaceId++}`,
      name, kind,
      lat: reckoned.lat, lon: reckoned.lon,
      t,
    };
    this.places.push(p);
    return p;
  }

  removePlace(id: string): void {
    this.places = this.places.filter((p) => p.id !== id);
  }

  /** Proportion of the world's coastline this chart covers. */
  coverage(): number {
    return TOTAL_COAST_VERTICES > 0 ? this.points.size / TOTAL_COAST_VERTICES : 0;
  }

  /** Mean drawing error across the chart, in nautical miles. */
  meanError(): number {
    if (this.points.size === 0) return 0;
    let s = 0;
    for (const p of this.points.values()) s += p.errorNm;
    return s / this.points.size;
  }

  serialize(): unknown {
    return {
      points: [...this.points.values()],
      ports: [...this.ports.values()],
      places: this.places,
      track: this.track,
    };
  }

  static deserialize(data: any): Chart {
    const c = Object.create(Chart.prototype) as Chart;
    c.points = new Map((data.points ?? []).map((p: ChartedPoint) => [p.key, p]));
    c.ports = new Map((data.ports ?? []).map((p: ChartedPort) => [p.id, p]));
    c.places = data.places ?? [];
    c.track = data.track ?? [];
    (c as any).lastTrackT = -1e9;
    (c as any).nextPlaceId = (c.places.length ?? 0) + 1;
    return c;
  }
}

const TOTAL_COAST_VERTICES = LANDMASSES.reduce((s, l) => s + l.ring.length / 2, 0);

/**
 * How far the lookout can see land, allowing for the height of the masthead and
 * the curvature of the earth, capped by the weather.
 */
export function sightingRangeNm(mastHeightM: number, visibilityNm: number, landHeightM = 300): number {
  const horizon = 2.08 * (Math.sqrt(Math.max(mastHeightM, 1)) + Math.sqrt(Math.max(landHeightM, 1)));
  return Math.min(horizon, visibilityNm * 1.6);
}

function hash(s: string | number): number {
  const str = String(s);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export { NM };
