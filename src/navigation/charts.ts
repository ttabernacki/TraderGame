import { NM, cosd, wrap180, type LatLon } from '../core/math';
import {
  coastSegmentsNear, coastVertexByKey, coastVertexKeysInBox, coastVerticesNear,
  type CoastVertex,
} from '../world/landmass';
import { PORTS, anchorageOf, type PortDef } from '../world/ports';

export interface ChartedPoint {
  /** Landmass and vertex this represents. */
  key: string;
  /** Where it is. The chart does not lie about the world. */
  lat: number;
  lon: number;
  /**
   * How well established this stretch is, separately for each coordinate, in
   * inverse square miles — the sum of what every sighting of it was worth.
   *
   * Not a doubt about where the coast is: the chart has that right. It is how
   * much surveying stands behind the stretch, and it is what the firm and
   * dashed coastlines on the chart table are read off. Latitude firms up in a
   * pass because a quadrant settles it; longitude takes many, because what a
   * pilot brings to it is only ever the day's run laid off from the last guess.
   */
  wLat: number;
  wLon: number;
  /** How many separate sightings have gone into it. Zero for inherited coast. */
  passes: number;
  /** When it was last taken a sighting of, so one slow pass is not twenty. */
  obsT: number;
  /** Kept at nought: the chart is drawn true. Retained so old saves load. */
  errorNm: number;
  /**
   * When this captain first put it on paper, for coast nobody had drawn
   * before him. Unset for the Casa's inherited coast and for copied sheets.
   * The chart table inks it differently while it is fresh.
   */
  born?: number;
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
  /** Where the thing named actually is. */
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
  /** Coast the Casa only had hearsay for, now run in person. */
  corrected: number;
  /** Coast that had been run before and has now been run again. */
  confirmed: number;
  /** Nautical miles of coastline this pass accounts for. */
  milesTaken: number;
  /** Miles of that hearsay coast turned into survey. */
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
 * The chart is the world, drawn true. Coast, towns and named places sit where
 * they actually are and they never move.
 *
 * This used to plot everything at the position the pilot reckoned he occupied
 * when he saw it, so that a bad reckoning built a bad chart and the paper
 * carried the error for ever. It is what a chart of 1482 really was, and as a
 * thing to play it was miserable: the coastline, the towns and the ship all
 * slid about relative to one another depending on where the reckoning happened
 * to be and what the lead had last said, and a player had nothing fixed to
 * think against. A man can be lost. The world cannot.
 *
 * So the one thing allowed to be wrong is the ship's own position: `Navigator`
 * still carries a reckoning that drifts, and the chart still draws her where
 * she *thinks* she is. What the chart records about the world is simply true,
 * and what it tracks about each stretch is how well the pilot knows it —
 * whether he has run it himself or only has the Casa's word for it — which is
 * knowledge, not geometry, and is what the firm and dashed coastlines mean.
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
   * campaign, and how much of it he has actually seen.
   *
   * The coast from Flanders to the Gulf of Guinea had been sailed for sixty
   * years by 1482, so it is on the chart — drawn true, like everything else
   * here. What marks it out from coast he has run himself is `passes`, which
   * is nought: the Casa's word for it, drawn faint and broken, worth something
   * to steer by and not worth staking the ship on. Running it in person is
   * what turns it firm, and that is the surveyor's work.
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

    // The ports a Portuguese pilot has heard of are on the chart, where they
    // are. What he does not have is the having-been-there, which is `passes`.
    for (const p of PORTS) {
      if (!p.known) continue;
      const at = anchorageOf(p);
      this.ports.set(p.id, {
        id: p.id,
        lat: at.lat, lon: at.lon,
        visited: false, traded: false, t: 0,
        wLat: SEEDED_W_LAT, wLon: SEEDED_W_LON, passes: 0,
      });
    }
  }

  /**
   * Record whatever the lookout can see.
   *
   * The coast goes down where it is. What a pass adds is not a position — the
   * position was never in doubt — but standing: each sighting is weighted by
   * what it is worth, the pilot's own doubt at that moment and how far off the
   * land was, and it is the accumulated weight that decides whether a stretch
   * is drawn firm or left as the Casa's hearsay.
   */
  survey(
    truePos: LatLon,
    // Kept in the signature: the reckoning no longer places anything on the
    // chart, and callers have no reason to be rewritten for that.
    _reckoned: LatLon,
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

    for (const v of seen) {
      const key = `${v.land}:${v.index}`;
      const existing = this.points.get(key);

      // One slow pass along a coast is one sighting of each headland on it, not
      // the eighty the running survey would otherwise record between breakfast
      // and dark.
      if (existing && existing.passes > 0 && t - existing.obsT < 12 * 3600) continue;

      // Drawn where it is. The pilot's own doubt no longer displaces the
      // coastline — it decides how much this sighting is *worth*, which is how
      // firm the stretch ends up being drawn, and nothing else.
      const distNm = Math.hypot(
        (v.lat - truePos.lat) * 60,
        wrap180(v.lon - truePos.lon) * 60 * cosd(truePos.lat),
      );
      // A headland taken close aboard by a good cartographer is a better piece
      // of survey than one raised half hull-down by a bad one.
      const relNm = (1.2 + distNm * 0.24) * (1.4 - cartography);
      const wLat = 1 / (sigmaLatNm * sigmaLatNm + relNm * relNm + 0.25);
      const wLon = Math.min(
        1 / (sigmaLonNm * sigmaLonNm + relNm * relNm + 0.25), PASS_W_LON);

      if (!existing) {
        newly.push(v);
        this.points.set(key, {
          key, lat: v.lat, lon: v.lon,
          wLat, wLon, passes: 1, obsT: t,
          errorNm: 0,
          land: v.land, t, born: t,
        });
        continue;
      }

      // Coast that was on the chart only on the Casa's say-so, and has now
      // been run in person. That is what the Casa paid a surveyor for: not
      // moving a coastline, which nobody could verify, but replacing hearsay
      // with a pilot who has been there and will put his name to it.
      const wasHearsay = existing.passes === 0;

      existing.lat = v.lat;
      existing.lon = v.lon;
      existing.wLat = Math.min(existing.wLat + wLat, WEIGHT_CAP);
      existing.wLon = Math.min(existing.wLon + wLon, WEIGHT_CAP);
      existing.passes++;
      existing.obsT = t;
      existing.t = t;
      existing.errorNm = 0;

      if (wasHearsay) {
        corrected++;
        improvedNm += SEGMENT_NM;
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
    // By segment, not by vertex. The ring's vertices are a median of forty-odd
    // miles apart, so a ship twenty-five miles off a coast that has been on
    // European charts for sixty years very often has no vertex inside her
    // horizon at all — and the landfall was then announced as a discovery of
    // somewhere nobody had ever seen, off Morocco.
    for (const seg of coastSegmentsNear(at, rangeNm)) {
      const p = this.points.get(`${seg.land}:${seg.aIndex}`);
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
   * Where a port is, if this chart has heard of it at all.
   *
   * Returns null for a place he has never heard of, which is the honest answer
   * and means he has nothing to steer for — that part of the model stays: a
   * chart can be *missing* a place, it just cannot be wrong about one.
   */
  believedPort(id: string): ChartedPort | null {
    return this.ports.get(id) ?? null;
  }

  /**
   * Draw a port, or note that you have been there again.
   *
   * The town goes on the chart where the town is. What a visit adds is the
   * record of having made it — which is what the Casa buys, and what tells a
   * player at a glance which of these places he has actually seen.
   */
  chartPort(
    def: PortDef, _reckoned: LatLon, _truePos: LatLon, t: number, visited: boolean,
    sigmaLatNm = 12, sigmaLonNm = 30,
  ): boolean {
    const existing = this.ports.get(def.id);
    const at = anchorageOf(def);

    // What this visit is worth as survey. The position is not in question —
    // the town is where the town is — so this only records that a pilot has
    // now been there and what his fixes were worth when he was.
    const wLat = visited ? 1 / 0.25 : 1 / (sigmaLatNm * sigmaLatNm + 1);
    const wLon = Math.min(1 / (sigmaLonNm * sigmaLonNm + 1), PASS_W_LON);

    if (!existing) {
      this.ports.set(def.id, {
        id: def.id, lat: at.lat, lon: at.lon, visited, traded: false, t,
        wLat, wLon, passes: 1,
      });
      return true;
    }

    existing.lat = at.lat;
    existing.lon = at.lon;
    existing.wLat = Math.min((existing.wLat ?? SEEDED_W_LAT) + wLat, WEIGHT_CAP);
    existing.wLon = Math.min((existing.wLon ?? SEEDED_W_LON) + wLon, WEIGHT_CAP);
    existing.passes = (existing.passes ?? 0) + 1;
    existing.visited = existing.visited || visited;
    existing.t = t;
    return false;
  }

  /**
   * Write a name on the chart, pinned to the piece of coast it belongs to.
   *
   * A name is not a position, it is a *place* — that headland, the one we
   * watered at — so it hangs off the nearest charted vertex rather than
   * floating on a pair of numbers. `at` is where the thing actually is.
   */
  addPlace(name: string, kind: Placename['kind'], at: LatLon, t: number): Placename {
    let anchorKey: string | undefined;
    let dLat = 0, dLon = 0, best = Infinity;
    for (const q of this.points.values()) {
      const d = Math.hypot(
        (q.lat - at.lat) * 60,
        wrap180(q.lon - at.lon) * 60 * cosd(at.lat),
      );
      if (d < best) {
        best = d;
        anchorKey = q.key;
        dLat = at.lat - q.lat;
        dLon = wrap180(at.lon - q.lon);
      }
    }
    // Further off than that and it is not a name for anything on this coast.
    if (best > 70) { anchorKey = undefined; dLat = 0; dLon = 0; }

    const p: Placename = {
      id: `pl${this.nextPlaceId++}`,
      name, kind,
      lat: at.lat, lon: at.lon,
      anchorKey, dLat, dLon,
      t,
    };
    this.places.push(p);
    return p;
  }

  /** Where a name sits: on the piece of coast it was given to. */
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
  /**
   * Somebody else's sheet, copied onto yours.
   *
   * This is not surveying and it must not feel like it. What a copied sheet
   * gives you is *coast you have never seen*, laid down in one afternoon —
   * which is worth having, is how most of what Portugal knew travelled, and is
   * exactly why the Casa forbade it and why a sheet of the Mina coast was
   * worth killing for.
   *
   * It is deliberately weaker than running the coast yourself: a copy is
   * entered at a fixed modest standing and with no passes against it, so it
   * draws as hearsay until you have been there, and one honest pass of your
   * own counts for more than any number of copies.
   *
   * Returns the number of vertices the copy actually added or improved.
   */
  copyFrom(centre: LatLon, rangeNm: number, accuracyNm: number, t: number): number {
    const w = 1 / (accuracyNm * accuracyNm + 0.25);
    let gained = 0;
    for (const v of coastVerticesNear(centre, rangeNm)) {
      const key = `${v.land}:${v.index}`;
      const have = this.points.get(key);
      // Nothing to gain from a sheet no better than what you already hold.
      if (have && have.wLon >= w) continue;
      if (have) {
        have.lat = v.lat;
        have.lon = v.lon;
        have.wLat = Math.min(Math.max(have.wLat, w), WEIGHT_CAP);
        have.wLon = Math.min(Math.max(have.wLon, w), WEIGHT_CAP);
        have.t = t;
      } else {
        this.points.set(key, {
          key, lat: v.lat, lon: v.lon, wLat: w, wLon: w, passes: 0, obsT: -1e9,
          errorNm: 0, land: v.land, t,
        });
      }
      gained++;
    }
    return gained;
  }

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

  /**
   * Write out the chart the player has *made*, not the one he was issued.
   *
   * The inherited chart is seven hundred-odd points, and it was the whole
   * weight of a save file: a hundred and thirty-six kilobytes of a hundred and
   * fifty-four, before a single mile had been sailed. None of it was worth
   * keeping, because none of it is a choice or an outcome — `seededError` is a
   * pure function of latitude and longitude with no run-time seed in it, so
   * every untouched point can simply be drawn again on load and comes back
   * bit-for-bit identical. What is worth keeping is the handful of points the
   * captain has been near enough to correct, which is what the surveying is
   * for, and which is a few dozen points even after years at sea.
   *
   * So the seeded points are dropped and regenerated, and only the ones with a
   * pass on them are written. Positions are rounded to six decimals — about
   * four inches, which is a good deal finer than a quadrant — because the other
   * eleven digits of a double are noise that was costing a third of the file.
   */
  serialize(): unknown {
    return {
      // `v: 2` marks the compact form. Without it the loader assumes the old
      // whole-chart dump, which still reads correctly.
      v: 2,
      points: [...this.points.values()]
        .filter((p) => p.passes > 0 || p.t > 0)
        .map((p) => [
          p.key, r6(p.lat), r6(p.lon), r(p.wLat, 6), r(p.wLon, 6),
          p.passes, Math.round(p.obsT), r(p.errorNm, 3), p.land, Math.round(p.t),
          p.born !== undefined ? Math.round(p.born) : 0,
        ]),
      ports: [...this.ports.values()]
        .filter((p) => p.passes > 0 || p.visited || p.traded)
        .map((p) => [
          p.id, r6(p.lat), r6(p.lon), p.visited ? 1 : 0, p.traded ? 1 : 0,
          Math.round(p.t), r(p.wLat, 6), r(p.wLon, 6), p.passes,
        ]),
      places: this.places,
      track: this.track.map((t: any) => ({ ...t, lat: r6(t.lat), lon: r6(t.lon) })),
      seen: [...this.seen.entries()],
    };
  }

  static deserialize(data: any): Chart {
    // Draw the issued chart again, then lay the captain's own work over it.
    const c = new Chart();
    if (data.v >= 2) {
      for (const a of data.points ?? []) {
        c.points.set(a[0], {
          key: a[0], lat: a[1], lon: a[2], wLat: a[3], wLon: a[4],
          passes: a[5], obsT: a[6], errorNm: a[7], land: a[8], t: a[9],
          born: a[10] ? a[10] : undefined,
        });
      }
      for (const a of data.ports ?? []) {
        c.ports.set(a[0], {
          id: a[0], lat: a[1], lon: a[2], visited: !!a[3], traded: !!a[4],
          t: a[5], wLat: a[6], wLon: a[7], passes: a[8],
        });
      }
    } else {
      // A chart saved before the weights existed is one man's opinion with no
      // record of how he came by it, so it is loaded as exactly that. Older
      // saves carry the whole chart, seeded points included, and replace it.
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
    }
    c.places = data.places ?? [];
    c.track = data.track ?? [];
    c.seen = new Map(data.seen ?? []);

    // Every save written before the chart drew the world true carries a coast
    // and a set of towns displaced by whatever the reckoning was doing the day
    // each was drawn. Snap them all home on load, so a voyage in progress
    // stops having Africa in two places. What the save is still allowed to
    // keep is the *knowledge* — passes, weights, coverage — which is the part
    // the pilot really earned.
    for (const [key, pt] of c.points) {
      const v = coastVertexByKey(key);
      if (!v) { c.points.delete(key); continue; }
      pt.lat = v.lat;
      pt.lon = v.lon;
      pt.errorNm = 0;
    }
    for (const cp of c.ports.values()) {
      const def = PORTS.find((q) => q.id === cp.id);
      if (!def) continue;
      const at = anchorageOf(def);
      cp.lat = at.lat;
      cp.lon = at.lon;
    }
    // A name hangs off a vertex by an offset taken when it was written, and
    // that offset was measured against a displaced coast. Re-hang it.
    for (const pl of c.places) {
      if (!pl.anchorKey) continue;
      const v = coastVertexByKey(pl.anchorKey);
      if (!v) { pl.anchorKey = undefined; continue; }
      const drawn = c.points.get(pl.anchorKey);
      if (!drawn) continue;
      pl.dLat = pl.lat - drawn.lat;
      pl.dLon = wrap180(pl.lon - drawn.lon);
    }

    (c as any).lastTrackT = -1e9;
    (c as any).nextPlaceId = (c.places.length ?? 0) + 1;
    return c;
  }
}

/** Round to `d` decimals, dropping the trailing noise of a double. */
function r(n: number, d: number): number {
  if (!Number.isFinite(n)) return 0;
  const m = 10 ** d;
  return Math.round(n * m) / m;
}

/** Six decimals of a degree is about four inches. Nothing here needs more. */
function r6(n: number): number {
  return r(n, 6);
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
/**
 * The ceiling on how well established a stretch may get, as a weight, so that
 * standing accumulates toward a limit rather than without bound.
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
 * The most one pass is ever worth in longitude: twelve miles.
 *
 * A longitude is a guess at the day's run laid off from the last guess, and no
 * single arrival at a place is better evidence of where the place is than
 * that, whatever figure the board happens to be carrying. Without this cap one
 * reckoning claiming six miles of accuracy — which a run of noon sights used
 * to manufacture out of nothing; see Navigator.applyLatitude — outweighed a
 * seeded chart honestly claiming seventy-five by two orders of magnitude, and
 * dragged a port bodily across the Gulf of Guinea on one visit while the coast
 * either side of it stayed put.
 *
 * The consensus this model is built on needs many passes disagreeing in
 * different directions. It does not survive any one of them being taken as
 * gospel.
 */
const PASS_W_LON = 1 / (12 * 12);


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
/** What the Casa's inherited word for a coast is worth, before you go there. */
const SEEDED_W_LAT = 1 / (5 * 5);
const SEEDED_W_LON = 1 / (55 * 55);

/** Median spacing of the coastline ring's vertices, for crediting survey. */
const SEGMENT_NM = 47;

function seededPoint(key: string, v: CoastVertex): ChartedPoint {
  return {
    key, lat: v.lat, lon: v.lon,
    wLat: SEEDED_W_LAT, wLon: SEEDED_W_LON, passes: 0, obsT: -1e9,
    errorNm: 0,
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


export { NM };
