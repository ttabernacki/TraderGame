import { NM, cosd, wrap180, type LatLon } from '../core/math';
import { coastVertexKeysInBox, coastVerticesNear, type CoastVertex } from '../world/landmass';
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

/** What one survey pass added to the chart. */
export interface SurveyResult {
  /** Coast nobody had drawn before. */
  fresh: CoastVertex[];
  /** Coast that was drawn wrong and is now drawn better. */
  corrected: number;
  /** Nautical miles of coastline this pass accounts for. */
  milesTaken: number;
  /** Total error taken out of the chart, in miles. */
  improvedNm?: number;
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

  /**
   * What a Portuguese pilot already has on his chart at the start of the
   * campaign — and, much more importantly, how wrong it is.
   *
   * The coast from Flanders to the Gulf of Guinea had been sailed for sixty
   * years by 1482, so it is on the chart. But it is on the chart the way a
   * chart of 1482 actually had it: the *latitudes* are good, because every
   * pilot on that coast carried a quadrant and the regimento, and the
   * *longitudes* are badly out, because nobody on earth could measure one. Real
   * charts of the period stretch Africa east-west by tens of leagues, and the
   * further from Lisbon the worse it gets, because the error is cumulative down
   * the coast.
   *
   * This is not decoration. Drawing the known world accurately meant there was
   * nothing for a surveyor to do until he passed the equator — a fortnight of
   * sailing before the game's central activity started. Drawing it the way it
   * really was gives the player work from the first morning: the coast he can
   * see is not where his chart says it is, and every landfall he makes on a
   * place he knows lets him put a piece of it right.
   */
  private seedKnownWorld(): void {
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
            this.points.set(key, seededPoint(key, v));
          }
        }
      }
    }

    // The ports carry the same distortion as the coast they sit on: a place
    // you have heard of is not a place whose position you know.
    for (const p of PORTS) {
      if (!p.known) continue;
      const at = anchorageOf(p);
      const d = seededError(at.lat, at.lon);
      this.ports.set(p.id, {
        id: p.id,
        lat: at.lat + d.dLat,
        lon: at.lon + d.dLon,
        visited: false, traded: false, t: 0,
      });
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
  ): SurveyResult {
    if (rangeNm <= 0) return { fresh: [], corrected: 0, milesTaken: 0 };
    const seen = coastVerticesNear(truePos, rangeNm);
    const newly: CoastVertex[] = [];
    let corrected = 0;
    let improvedNm = 0;

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
      if (!existing) {
        newly.push(v);
      } else if (existing.errorNm - errNm > 3) {
        // Coast that was on the chart in the wrong place and is now in the
        // right one. This is most of what a pilot on this route actually did,
        // and it has to be worth something or the inherited chart is scenery.
        corrected++;
        improvedNm += existing.errorNm - errNm;
      }
      this.points.set(key, { key, lat: plottedLat, lon: plottedLon, errorNm: errNm, land: v.land, t });
    }
    return {
      fresh: newly,
      corrected,
      // Roughly how much coast this pass accounts for. Six miles a vertex is
      // the spacing of the ring data.
      milesTaken: (newly.length + corrected) * 6,
      improvedNm,
    };
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

  /**
   * How much of the *route* is drawn, and drawn well.
   *
   * Measured against the coast between Portugal and India rather than against
   * every vertex on the globe — a figure that read forty-nine per cent before
   * the player had left the Tagus, because Europe is half the world's coastline
   * and none of it is what this voyage is about. A point only counts once it is
   * drawn within twenty miles of where it really is, so inheriting somebody
   * else's stretched chart is not the same as having surveyed it.
   */
  coverage(): number {
    if (ROUTE_VERTICES === 0) return 0;
    let good = 0;
    for (const p of this.points.values()) {
      if (!isRouteVertex(p.key)) continue;
      if (p.errorNm <= 20) good++;
    }
    return good / ROUTE_VERTICES;
  }

  /** Vertices drawn at all, whether well or badly. */
  drawn(): number {
    return this.points.size;
  }

  /** How well one stretch of coast is drawn, for the chart's own shading. */
  qualityAt(key: string): number {
    const p = this.points.get(key);
    if (!p) return 0;
    return Math.max(0, 1 - p.errorNm / 90);
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

/**
 * The distortion in an inherited chart at a given place.
 *
 * Latitude is nearly right — a quadrant and the regimento do that. Longitude is
 * out by an amount that grows with the distance from Lisbon down the coast,
 * because every pilot's error was added to the last man's and nobody could ever
 * check one. At Cape Verde that is a few leagues; at the Gulf of Guinea it is
 * the better part of a degree and a half, which is what actually happened.
 */
function seededError(lat: number, lon: number): { dLat: number; dLon: number } {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;

  // A cumulative westward drift, growing with the distance south of Lisbon.
  //
  // This is the shape a real error of this kind has. Nobody measured a
  // longitude; each pilot laid off his day's run from the last man's position,
  // and every mile of error he made stayed in the chart for the man after him.
  // So the further down the coast you go the further the paper is from the
  // world, and it goes *one way* — the whole of Guinea slid west together —
  // rather than scattering. Near Lisbon it is a mile or two; at Mina it is the
  // better part of a degree and a half, which is what the charts of the period
  // actually show.
  const south = Math.min(Math.max((38.7 - lat) / 36, 0), 1.35);
  const drift = -south * 1.35;
  const wobble = (hash(key + 'x') - 0.5) * (0.16 + south * 0.34);
  return {
    // Latitude is nearly right: every pilot on that coast carried a quadrant.
    dLat: (hash(key) - 0.5) * 0.09,
    dLon: drift + wobble,
  };
}

function seededPoint(key: string, v: CoastVertex): ChartedPoint {
  const d = seededError(v.lat, v.lon);
  const lat = v.lat + d.dLat;
  const lon = v.lon + d.dLon;
  return {
    key, lat, lon,
    errorNm: Math.hypot(d.dLat * 60, d.dLon * 60 * cosd(v.lat)),
    land: v.land,
    t: 0,
  };
}

/**
 * The coast the carreira actually runs along: the western and eastern shores of
 * Africa, Arabia and India. Iberia, the Baltic and the Americas are not what
 * this voyage is measured by.
 */
const ROUTE_VERTEX_KEYS = coastVertexKeysInBox(-40, 40, -30, 100);
const ROUTE_VERTICES = ROUTE_VERTEX_KEYS.size;

function isRouteVertex(key: string): boolean {
  return ROUTE_VERTEX_KEYS.has(key);
}

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
