import { NM, cosd, wrap180, type LatLon } from '../core/math';
import {
  coastSegmentsNear, coastVertexKeysInBox, coastVerticesNear, type CoastVertex,
} from '../world/landmass';
import { PORTS, anchorageOf, type PortDef } from '../world/ports';

export interface ChartedPoint {
  /** Landmass and vertex this represents. */
  key: string;
  /** Where the pilot drew it, which is where he thought he was when he saw it. */
  lat: number;
  lon: number;
  /**
   * The weight behind the drawn position, separately for each coordinate, in
   * inverse square miles — the sum of the confidence of every sighting that has
   * gone into it.
   *
   * Two numbers rather than one because latitude and longitude were not known
   * the same way and did not improve at the same rate. A quadrant gives a
   * latitude to a few miles on the first morning; a longitude is a guess at the
   * day's run laid off from the last guess, and the only thing that ever
   * improved one was running the same water again by a different reckoning and
   * splitting the difference. So a coast's latitude firms up in one pass and its
   * longitude takes a career, which is the shape of every chart of the period.
   */
  wLat: number;
  wLon: number;
  /** How many separate sightings have gone into it. Zero for inherited coast. */
  passes: number;
  /** When it was last taken a sighting of, so one slow pass is not twenty. */
  obsT: number;
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
  /** Confidence behind each coordinate, as for a charted point. */
  wLat: number;
  wLon: number;
  /** How many separate reckonings have gone into it. */
  passes: number;
}

export interface Placename {
  id: string;
  name: string;
  /** Where it was written, by the reckoning of the day it was written. */
  lat: number;
  lon: number;
  kind: 'cape' | 'bay' | 'river' | 'island' | 'shoal' | 'note';
  t: number;
  /** The charted vertex it hangs off, so the name moves when the coast does. */
  anchorKey?: string;
  dLat?: number;
  dLon?: number;
}

/** What one survey pass added to the chart. */
export interface SurveyResult {
  /** Coast nobody had drawn before. */
  fresh: CoastVertex[];
  /** Coast that was drawn wrong and is now drawn better. */
  corrected: number;
  /** Coast that had been run before and has now been run again. */
  confirmed: number;
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
  /**
   * How much of each stretch of coast has been run in sight of, as a span
   * along the segment between two ring vertices.
   *
   * Kept apart from `points`, which is what gets drawn. A pilot is paid for
   * miles of coast run, and the miles are a property of the line between the
   * points rather than of the points themselves — the ring vertices are a
   * median of forty-seven miles apart, so counting them and multiplying was
   * out by an order of magnitude in both directions at once.
   */
  seen = new Map<string, { t0: number; t1: number }>();
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
        ...seededWeights(d.dLat, d.dLon, at.lat), passes: 0,
      });
    }
  }

  /**
   * Record whatever the lookout can see, drawn relative to the pilot's reckoned
   * position rather than the true one, and averaged in with what the chart
   * already says.
   *
   * The averaging is the whole of how a chart of this period got better, and it
   * is worth being exact about why. One pass down a coast draws it wherever the
   * pilot's reckoning happened to be that day — sixty miles east on one voyage,
   * forty west on the next, because a dead-reckoned longitude is a guess and the
   * guesses fall on both sides. No single pass can tell you which of them is
   * wrong. But lay a second pass over the first and split the difference, and a
   * third over that, and the errors that fall either way cancel while the coast
   * itself does not move. That is a consensus, arrived at with no instrument
   * capable of measuring the thing being agreed on, and it is how the Casa's
   * chart of Guinea was built: not by one man getting it right, but by forty
   * men getting it wrong in different directions.
   *
   * Each sighting is weighted by what it is worth — the pilot's own doubt at
   * that moment, and how far off the land was — so a landfall taken an hour
   * after a good sun sight moves the chart, and a bearing taken at the end of
   * three weeks of blue water hardly moves it at all.
   */
  survey(
    truePos: LatLon,
    reckoned: LatLon,
    rangeNm: number,
    t: number,
    cartography: number,
    sigmaLatNm = 12,
    sigmaLonNm = 30,
  ): SurveyResult {
    if (rangeNm <= 0) return { fresh: [], corrected: 0, confirmed: 0, milesTaken: 0 };
    const seen = coastVerticesNear(truePos, rangeNm);
    const milesTaken = this.creditCoastRun(truePos, rangeNm);
    const newly: CoastVertex[] = [];
    let corrected = 0;
    let confirmed = 0;
    let improvedNm = 0;

    const dLat = reckoned.lat - truePos.lat;
    const dLon = wrap180(reckoned.lon - truePos.lon);

    for (const v of seen) {
      const key = `${v.land}:${v.index}`;
      const existing = this.points.get(key);

      // One slow pass along a coast is one sighting of each headland on it, not
      // the eighty the running survey would otherwise record between breakfast
      // and dark. Without this a ship could sit hove to off a cape and average
      // her own single opinion into a certainty.
      if (existing && existing.passes > 0 && t - existing.obsT < 12 * 3600) continue;

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

      // What this one sighting is worth, against what is already drawn.
      const relNm = relativeErr * 60;
      const wLat = 1 / (sigmaLatNm * sigmaLatNm + relNm * relNm + 0.25);
      const wLon = 1 / (sigmaLonNm * sigmaLonNm + relNm * relNm + 0.25);

      if (!existing) {
        newly.push(v);
        this.points.set(key, {
          key, lat: plottedLat, lon: plottedLon,
          wLat, wLon, passes: 1, obsT: t,
          errorNm: errorOf(plottedLat, plottedLon, v),
          land: v.land, t,
        });
        continue;
      }

      const before = existing.errorNm;
      const lat = (existing.lat * existing.wLat + plottedLat * wLat) / (existing.wLat + wLat);
      const lon = existing.lon
        + (wrap180(plottedLon - existing.lon) * wLon) / (existing.wLon + wLon);
      existing.lat = lat;
      existing.lon = lon;
      // Capped, so that no amount of agreement makes a chart drawn by eye
      // better than about half a mile, and so a stretch drawn a hundred times
      // can still be moved by a hundred-and-first pass that disagrees.
      existing.wLat = Math.min(existing.wLat + wLat, WEIGHT_CAP);
      existing.wLon = Math.min(existing.wLon + wLon, WEIGHT_CAP);
      existing.passes++;
      existing.obsT = t;
      existing.t = t;
      existing.errorNm = errorOf(lat, lon, v);

      if (before - existing.errorNm > 3) {
        // Coast that was on the chart in the wrong place and is now in the
        // right one. This is most of what a pilot on this route actually did,
        // and it has to be worth something or the inherited chart is scenery.
        corrected++;
        improvedNm += before - existing.errorNm;
      } else if (existing.passes > 1) {
        confirmed++;
      }
    }
    return { fresh: newly, corrected, confirmed, milesTaken, improvedNm };
  }

  /**
   * How much coast this pass has brought into sight that had not been seen
   * before, in nautical miles.
   *
   * Coverage is tracked as a span along each segment rather than as a count of
   * anything, so running the same headland twice credits nothing the second
   * time, and creeping along a two-hundred-mile stretch credits it a few miles
   * at a time as it comes into view — which is what surveying a coast is.
   */
  private creditCoastRun(at: LatLon, rangeNm: number): number {
    let miles = 0;
    for (const seg of coastSegmentsNear(at, rangeNm)) {
      const key = `${seg.land}:${seg.aIndex}`;
      const had = this.seen.get(key);
      if (!had) {
        this.seen.set(key, { t0: seg.t0, t1: seg.t1 });
        miles += (seg.t1 - seg.t0) * seg.lengthNm;
        continue;
      }
      // The union of two spans is only a span when they touch, which they do
      // whenever she is coasting. A disjoint second look extends the nearer
      // end rather than being counted twice.
      const t0 = Math.min(had.t0, seg.t0);
      const t1 = Math.max(had.t1, seg.t1);
      const grew = (t1 - t0) - (had.t1 - had.t0);
      if (grew > 0) {
        had.t0 = t0;
        had.t1 = t1;
        miles += grew * seg.lengthNm;
      }
    }
    return miles;
  }

  /**
   * Whether the coast now in sight was already on the chart before `before`.
   *
   * The cutoff matters: the running survey draws whatever the lookout can see
   * every quarter of an hour, so by the time anybody asks "do we know this
   * coast" the answer is always yes — we drew it forty seconds ago. Asking
   * about the chart as it stood an hour back gives the honest answer.
   */
  knewCoastNear(at: LatLon, rangeNm: number, before: number): boolean {
    for (const v of coastVerticesNear(at, rangeNm)) {
      const p = this.points.get(`${v.land}:${v.index}`);
      if (p && p.t <= before) return true;
    }
    return false;
  }

  /** Note the ship's position on the chart, as the pilot reckons it. */
  logTrack(reckoned: LatLon, t: number): void {
    if (t - this.lastTrackT < 3 * 3600) return;
    this.lastTrackT = t;
    this.track.push({ lat: reckoned.lat, lon: reckoned.lon, t });
    if (this.track.length > 3000) this.track.shift();
  }

  /**
   * Where the chart says a port is, which is not where it is.
   *
   * This is what a pilot steers for and what he fixes himself by when he gets
   * there, so it has to be askable. Returns null for a place he has never
   * heard of, which is the honest answer and means he has nothing to steer for.
   */
  believedPort(id: string): ChartedPort | null {
    return this.ports.get(id) ?? null;
  }

  /**
   * Draw a port, or agree a little more with what is already drawn.
   *
   * A port is charted the way a coast is: the latitude a quadrant gives is
   * taken almost at face value, and the longitude is one more opinion averaged
   * into the opinions already on the paper. Visiting Arguim for the fifth time
   * does not tell you where Arguim is; visiting it for the fifth time by five
   * different reckonings does.
   */
  chartPort(
    def: PortDef, reckoned: LatLon, truePos: LatLon, t: number, visited: boolean,
    sigmaLatNm = 12, sigmaLonNm = 30,
  ): boolean {
    const existing = this.ports.get(def.id);
    const at = anchorageOf(def);
    // Plotted relative to the pilot's reckoning, like everything else.
    const lat = at.lat + (reckoned.lat - truePos.lat);
    const lon = at.lon + wrap180(reckoned.lon - truePos.lon);

    // A landing puts the latitude beyond argument — the quadrant is ashore and
    // steady and there is all day to use it — and does nothing whatever for the
    // longitude, which is still only the day's run laid off from the last
    // guess. That asymmetry is the whole reason ports of this period are drawn
    // in the right parallel and the wrong meridian.
    const wLat = visited ? 1 / 0.25 : 1 / (sigmaLatNm * sigmaLatNm + 1);
    const wLon = 1 / (sigmaLonNm * sigmaLonNm + 1);

    if (!existing) {
      this.ports.set(def.id, {
        id: def.id, lat, lon, visited, traded: false, t,
        wLat, wLon, passes: 1,
      });
      return true;
    }

    const eLat = existing.wLat ?? 1 / 25;
    const eLon = existing.wLon ?? 1 / 900;
    existing.lat = (existing.lat * eLat + lat * wLat) / (eLat + wLat);
    existing.lon = existing.lon + (wrap180(lon - existing.lon) * wLon) / (eLon + wLon);
    existing.wLat = Math.min(eLat + wLat, WEIGHT_CAP);
    existing.wLon = Math.min(eLon + wLon, WEIGHT_CAP);
    existing.passes = (existing.passes ?? 0) + 1;
    existing.visited = existing.visited || visited;
    existing.t = t;
    return false;
  }

  /**
   * Write a name on the chart, pinned to the piece of coast it belongs to.
   *
   * A name is not a position, it is a *place* — that headland, the one we
   * watered at — and when the chart later agrees that the headland is thirty
   * miles further west than we drew it, the name has to go with it. Recording
   * the reckoned latitude and longitude alone left every cape a captain ever
   * named floating in open water the moment his own survey improved, which is
   * the one thing a chart is not allowed to do to a pilot.
   */
  addPlace(name: string, kind: Placename['kind'], reckoned: LatLon, t: number): Placename {
    let anchorKey: string | undefined;
    let dLat = 0, dLon = 0, best = Infinity;
    for (const q of this.points.values()) {
      const d = Math.hypot(
        (q.lat - reckoned.lat) * 60,
        wrap180(q.lon - reckoned.lon) * 60 * cosd(reckoned.lat),
      );
      if (d < best) {
        best = d;
        anchorKey = q.key;
        dLat = reckoned.lat - q.lat;
        dLon = wrap180(reckoned.lon - q.lon);
      }
    }
    // Further off than that and it is not a name for anything on this coast.
    if (best > 70) { anchorKey = undefined; dLat = 0; dLon = 0; }

    const p: Placename = {
      id: `pl${this.nextPlaceId++}`,
      name, kind,
      lat: reckoned.lat, lon: reckoned.lon,
      anchorKey, dLat, dLon,
      t,
    };
    this.places.push(p);
    return p;
  }

  /** Where a name sits now, which is wherever the coast it names has got to. */
  placeAt(p: Placename): LatLon {
    if (!p.anchorKey) return { lat: p.lat, lon: p.lon };
    const a = this.points.get(p.anchorKey);
    if (!a) return { lat: p.lat, lon: p.lon };
    return { lat: a.lat + (p.dLat ?? 0), lon: a.lon + (p.dLon ?? 0) };
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

  /**
   * What the pilot can honestly say about his own chart: how much of it he has
   * been to, and how much of that his own reckonings agree about.
   *
   * Deliberately not the drawing error, which is the one figure nobody aboard
   * could have. A man knows how many times he has run a coast. He does not know
   * whether he has it right.
   */
  agreement(): { hearsay: number; run: number; agreed: number } {
    let hearsay = 0, run = 0, agreed = 0;
    for (const p of this.points.values()) {
      if (p.passes <= 0) hearsay++;
      else if (p.wLon >= AGREED_W) agreed++;
      else run++;
    }
    return { hearsay, run, agreed };
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
      seen: [...this.seen.entries()],
    };
  }

  static deserialize(data: any): Chart {
    const c = Object.create(Chart.prototype) as Chart;
    // A chart saved before the weights existed is one man's opinion with no
    // record of how he came by it, so it is loaded as exactly that.
    c.points = new Map((data.points ?? []).map((p: ChartedPoint) => [p.key, {
      ...p,
      wLat: p.wLat ?? SEEDED_W_LAT,
      wLon: p.wLon ?? SEEDED_W_LON,
      passes: p.passes ?? (p.t > 0 ? 1 : 0),
      obsT: p.obsT ?? (p.t ?? -1e9),
    }]));
    c.ports = new Map((data.ports ?? []).map((p: ChartedPort) => [p.id, {
      ...p,
      wLat: p.wLat ?? SEEDED_W_LAT,
      wLon: p.wLon ?? SEEDED_W_LON,
      passes: p.passes ?? (p.visited ? 1 : 0),
    }]));
    c.places = data.places ?? [];
    c.track = data.track ?? [];
    c.seen = new Map(data.seen ?? []);
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

/**
 * The most a chart drawn by eye from a moving deck is ever allowed to be worth,
 * as a weight. Half a mile, which is finer than any of the instruments.
 */
const WEIGHT_CAP = 1 / (0.5 * 0.5);

/**
 * When a stretch of coast counts as settled: a longitude the pilot's own
 * reckonings agree on to within about eighteen miles.
 *
 * Which on this coast is three or four honest passes from a good departure, and
 * a career's worth from a bad one — near Lisbon a single run does it, and off
 * Guinea it takes a decade, because the doubt a pilot carries down there is
 * what he is drawing with. That gradient is the chart of 1482.
 */
export const AGREED_W = 1 / (18 * 18);

/**
 * What the inherited chart counts for when a fresh sighting disagrees with it.
 *
 * Not one number for the whole sheet, because the Casa's chart was not one
 * document of one quality. The Portuguese coast and the islands had been worked
 * by hundreds of men for sixty years and were as good as anything in Europe;
 * the Gulf of Guinea was four voyages' worth of guesses and the Casa knew it.
 * So the weight follows the error the seeding actually put in: home waters are
 * drawn firm and take real evidence to shift, and Guinea is hearsay that one
 * honest pass will move most of the way.
 *
 * A latitude anywhere is worth more than a longitude anywhere, because a
 * quadrant is an instrument and a day's run is an opinion.
 */
function seededWeights(dLatDeg: number, dLonDeg: number, lat: number):
{ wLat: number; wLon: number } {
  const eLat = Math.abs(dLatDeg) * 60;
  const eLon = Math.abs(dLonDeg) * 60 * cosd(lat);
  return { wLat: 1 / (eLat * eLat + 4), wLon: 1 / (eLon * eLon + 9) };
}

/** What a chart saved before any of this was recorded is taken to be worth. */
const SEEDED_W_LAT = 1 / (5 * 5);
const SEEDED_W_LON = 1 / (55 * 55);

function errorOf(lat: number, lon: number, v: { lat: number; lon: number }): number {
  return Math.hypot((lat - v.lat) * 60, wrap180(lon - v.lon) * 60 * cosd(v.lat));
}

function seededPoint(key: string, v: CoastVertex): ChartedPoint {
  const d = seededError(v.lat, v.lon);
  const lat = v.lat + d.dLat;
  const lon = v.lon + d.dLon;
  const w = seededWeights(d.dLat, d.dLon, v.lat);
  return {
    key, lat, lon,
    wLat: w.wLat, wLon: w.wLon, passes: 0, obsT: -1e9,
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
