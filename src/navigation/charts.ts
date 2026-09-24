import { NM, clamp, cosd, wrap180, type LatLon } from '../core/math';
import {
  LANDMASSES, coastSegmentsNear, coastVertexByKey, coastVertexKeysInBox, coastVerticesNear,
  type CoastVertex,
} from '../world/landmass';
import { PORTS, anchorageOf, type PortDef } from '../world/ports';

export interface ChartedPoint {
  /** Landmass and vertex this represents. */
  key: string;
  /**
   * Where the chart puts it. Not where it is: this is the pilot's drawing,
   * built from his reckonings and amended every time a fix tells him how far
   * out he was. It converges on the truth; it does not start there.
   */
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
  /**
   * How far the drawing is from the real coast, in miles. Nobody aboard knows
   * this figure; it is kept for the Casa's reckoning of how much of the route
   * is well drawn, and for tests.
   */
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
 * The ship's chart: the pilot's understanding of where the coast and the towns
 * are. Three things are kept apart in this game and must never be confused:
 *
 * - the *ground truth* — the real coast and towns, in world/landmass and
 *   world/ports — which never moves;
 * - the *reckoning* — where the pilot believes the ship is, with its ellipse of
 *   doubt, in navigation/navigator;
 * - and this, the *chart* — where he believes everything else is.
 *
 * The chart starts from the Casa's inherited sheets, which are good near
 * Lisbon and increasingly wrong down the coast of Africa. Coast the pilot
 * raises himself is laid down where his reckoning says it is: the bearing and
 * distance off the masthead are good, so what goes on the paper is the true
 * coast carried by whatever error the reckoning has at that moment. Every
 * sighting is weighted by how good the reckoning was and blended with what the
 * sheet already had.
 *
 * When a fix tells the pilot how far out his reckoning had drifted — a town
 * entered, a sight, the lead against the book — the coast he drew since the
 * last fix is amended by the same error, distributed back along the leg the
 * way a traverse is closed. Entering a town fixes the town exactly, and the
 * coast within sight of it, and bends the surrounding stretch to agree, so the
 * paper stays one sensible coastline and draws closer to the truth with every
 * voyage.
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

  /**
   * Everything drawn since the reckoning was last corrected, and how far along
   * the leg each was drawn, so that the next fix can amend it. See `amend`.
   */
  leg: LegObs[] = [];

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
   * years by 1482, so it is on the chart — drawn as the Casa has it, close to
   * right near Lisbon and further out the further south (see seededError).
   * What marks it out from coast he has run himself is `passes`, which is
   * nought: the Casa's word for it, drawn faint and broken, worth something to
   * steer by and not worth staking the ship on. Running it in person is what
   * corrects it and turns it firm, and that is the surveyor's work.
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
      const e = seededError(at.lat, at.lon);
      this.ports.set(p.id, {
        id: p.id,
        lat: at.lat + e.dLat, lon: at.lon + e.dLon,
        visited: false, traded: false, t: 0,
        wLat: SEEDED_W_LAT, wLon: SEEDED_W_LON, passes: 0,
      });
    }
  }

  /**
   * Record whatever the lookout can see.
   *
   * The bearing and distance of a headland off the masthead are good; where the
   * pilot puts the ship is not. So what goes on the paper is the real coast
   * carried by the reckoning's error of the moment — `reckoned - truePos` —
   * blended with what the sheet already had, on the weight the reckoning's
   * doubt is worth. `legNm` is how far the ship has run since the reckoning was
   * last corrected, so the next fix can amend this sighting in proportion.
   */
  survey(
    truePos: LatLon,
    reckoned: LatLon,
    rangeNm: number,
    t: number,
    cartography: number,
    sigmaLatNm = 12,
    sigmaLonNm = 30,
    legNm = 0,
    legNmLat = legNm,
  ): SurveyResult {
    if (rangeNm <= 0) return { fresh: [], corrected: 0, confirmed: 0, milesTaken: 0 };
    const seen = coastVerticesNear(truePos, rangeNm);
    const milesTaken = this.creditCoastRun(truePos, rangeNm);
    const newly: CoastVertex[] = [];
    let corrected = 0;
    let confirmed = 0;
    let improvedNm = 0;
    const errLat = reckoned.lat - truePos.lat;
    const errLon = wrap180(reckoned.lon - truePos.lon);
    const moved = new Map<string, { dLat: number; dLon: number }>();

    for (const v of seen) {
      const key = `${v.land}:${v.index}`;
      const existing = this.points.get(key);

      // One slow pass along a coast is one sighting of each headland on it, not
      // the eighty the running survey would otherwise record between breakfast
      // and dark.
      if (existing && existing.passes > 0 && t - existing.obsT < 12 * 3600) continue;

      const distNm = Math.hypot(
        (v.lat - truePos.lat) * 60,
        wrap180(v.lon - truePos.lon) * 60 * cosd(truePos.lat),
      );
      // A headland taken close aboard by a good cartographer is a better piece
      // of survey than one raised half hull-down by a bad one — and the small
      // error in his bearing and distance goes on the paper too.
      const relNm = (1.2 + distNm * 0.24) * (1.4 - cartography);
      const nLat = hashNormal(key, t, 1) * relNm * 0.5 / 60;
      const nLon = hashNormal(key, t, 2) * relNm * 0.5 / 60 / Math.max(cosd(v.lat), 0.2);
      const obs = { lat: v.lat + errLat + nLat, lon: v.lon + errLon + nLon };
      const wLat = 1 / (sigmaLatNm * sigmaLatNm + relNm * relNm + 0.25);
      const wLon = Math.min(
        1 / (sigmaLonNm * sigmaLonNm + relNm * relNm + 0.25), PASS_W_LON);

      if (!existing) {
        newly.push(v);
        const pt: ChartedPoint = {
          key, lat: obs.lat, lon: obs.lon,
          wLat, wLon, passes: 1, obsT: t,
          errorNm: 0,
          land: v.land, t, born: t,
        };
        pt.errorNm = drawnErrorNm(pt, v);
        this.points.set(key, pt);
        this.leg.push({ key, port: false, atLat: legNmLat, atLon: legNm, openLat: true, openLon: true, shareLat: 1, shareLon: 1 });
        continue;
      }

      const wasHearsay = existing.passes === 0;
      const shareLat = wLat / (existing.wLat + wLat);
      const shareLon = wLon / (existing.wLon + wLon);
      const before = { lat: existing.lat, lon: existing.lon };
      existing.lat += (obs.lat - existing.lat) * shareLat;
      existing.lon = wrap180(existing.lon + wrap180(obs.lon - existing.lon) * shareLon);
      existing.wLat = Math.min(existing.wLat + wLat, WEIGHT_CAP);
      existing.wLon = Math.min(existing.wLon + wLon, WEIGHT_CAP);
      existing.passes++;
      existing.obsT = t;
      existing.t = t;
      existing.errorNm = drawnErrorNm(existing, v);
      this.leg.push({ key, port: false, atLat: legNmLat, atLon: legNm, openLat: true, openLon: true, shareLat, shareLon });
      moved.set(key, { dLat: existing.lat - before.lat, dLon: wrap180(existing.lon - before.lon) });

      if (wasHearsay) {
        corrected++;
        improvedNm += SEGMENT_NM;
      } else if (existing.passes > 1) {
        confirmed++;
      }
    }
    if (newly.length > 0 || moved.size > 0) this.relaxHearsay();
    return { fresh: newly, corrected, confirmed, milesTaken, improvedNm };
  }

  /**
   * Close the traverse.
   *
   * A fix has just moved the reckoning by (dLat, dLon): that is how far out it
   * had drifted. The error did not appear all at once; it grew along the leg
   * from nothing at the last fix to the whole of it now. So everything drawn on
   * this leg is moved by the same correction, in proportion to how far along
   * the leg it was drawn and how much its own sighting counted for on the
   * paper. Then the leg is closed and the next one begins from here.
   */
  amend(c: { dLat: number; dLon: number; legLat: number; legLon: number; lat: boolean; lon: boolean }): void {
    const moved = new Map<string, { dLat: number; dLon: number }>();
    for (const o of this.leg) {
      let mLat = 0, mLon = 0;
      if (c.lat && o.openLat) {
        mLat = c.dLat * (c.legLat <= 0 ? 1 : Math.min(1, o.atLat / c.legLat)) * o.shareLat;
        o.openLat = false;
      }
      if (c.lon && o.openLon) {
        mLon = c.dLon * (c.legLon <= 0 ? 1 : Math.min(1, o.atLon / c.legLon)) * o.shareLon;
        o.openLon = false;
      }
      if (mLat === 0 && mLon === 0) continue;
      if (o.port) {
        const cp = this.ports.get(o.key);
        if (!cp || cp.visited) continue;
        cp.lat += mLat;
        cp.lon = wrap180(cp.lon + mLon);
        continue;
      }
      const pt = this.points.get(o.key);
      if (!pt) continue;
      pt.lat += mLat;
      pt.lon = wrap180(pt.lon + mLon);
      const v = coastVertexByKey(o.key);
      if (v) pt.errorNm = drawnErrorNm(pt, v);
      const had = moved.get(o.key);
      moved.set(o.key, { dLat: (had?.dLat ?? 0) + mLat, dLon: (had?.dLon ?? 0) + mLon });
    }
    this.leg = this.leg.filter((o) => o.openLat || o.openLon);
    if (moved.size > 0) this.relaxHearsay();
  }

  /**
   * At anchor off a town that has told you where you are.
   *
   * The pilot stands in a known place and takes the bearings of everything in
   * sight, which puts the near coast right; and the coast beyond it, which he
   * drew on worse reckonings, is bent to meet it, less and less with distance
   * and less where it was already well established. The town sits on its coast
   * again, and the coast either side runs into it.
   */
  settleAround(at: LatLon, t: number, nearNm = 45, farNm = 240): void {
    let sLat = 0, sLon = 0, n = 0;
    const touched = new Set<string>();
    for (const v of coastVerticesNear(at, nearNm)) {
      const key = `${v.land}:${v.index}`;
      const d = Math.hypot((v.lat - at.lat) * 60, wrap180(v.lon - at.lon) * 60 * cosd(at.lat));
      const rel = 1 + d * 0.06;
      const w = Math.min(1 / (rel * rel), WEIGHT_CAP);
      let pt = this.points.get(key);
      if (!pt) {
        pt = { key, lat: v.lat, lon: v.lon, wLat: w, wLon: w, passes: 1, obsT: t, errorNm: 0, land: v.land, t, born: t };
        this.points.set(key, pt);
        touched.add(key);
        continue;
      }
      const kLat = w / (pt.wLat + w), kLon = w / (pt.wLon + w);
      const dLat = (v.lat - pt.lat) * kLat;
      const dLon = wrap180(v.lon - pt.lon) * kLon;
      pt.lat += dLat; pt.lon = wrap180(pt.lon + dLon);
      pt.wLat = Math.min(pt.wLat + w, WEIGHT_CAP);
      pt.wLon = Math.min(pt.wLon + w, WEIGHT_CAP);
      pt.passes = Math.max(pt.passes, 1);
      pt.errorNm = drawnErrorNm(pt, v);
      sLat += dLat; sLon += dLon; n++;
      touched.add(key);
    }
    if (n === 0) return;
    const mLat = sLat / n, mLon = sLon / n;
    // The rubber sheet: the same shift, tapering out, for everything around.
    for (const pt of this.points.values()) {
      if (touched.has(pt.key)) continue;
      const d = Math.hypot((pt.lat - at.lat) * 60, wrap180(pt.lon - at.lon) * 60 * cosd(at.lat));
      if (d >= farNm) continue;
      const taper = d <= nearNm ? 1 : 1 - (d - nearNm) / (farNm - nearNm);
      const k = taper * resistance(pt.wLon);
      pt.lat += mLat * k;
      pt.lon = wrap180(pt.lon + mLon * k);
      const v = coastVertexByKey(pt.key);
      if (v) pt.errorNm = drawnErrorNm(pt, v);
    }
    for (const cp of this.ports.values()) {
      if (cp.visited) continue;
      const d = Math.hypot((cp.lat - at.lat) * 60, wrap180(cp.lon - at.lon) * 60 * cosd(at.lat));
      if (d >= farNm) continue;
      const taper = d <= nearNm ? 1 : 1 - (d - nearNm) / (farNm - nearNm);
      const k = taper * resistance(cp.wLon);
      cp.lat += mLat * k;
      cp.lon = wrap180(cp.lon + mLon * k);
    }
    this.relaxHearsay();
  }

  /**
   * Keep the coastline one line.
   *
   * The issued sheet is hearsay: where it runs into coast the pilot has drawn
   * himself it would otherwise kink, because the two disagree. So each stretch
   * of the issued sheet is drawn from the Casa's own error blended toward the
   * error of the nearest surveyed coast either side of it along the shore —
   * wholly beside it, fading out over a few hundred miles. Derived afresh each
   * time rather than pushed, so it never accumulates; and it follows every
   * correction to the surveyed coast automatically.
   */
  private relaxHearsay(): void {
    const byLand = new Map<number, ChartedPoint[]>();
    for (const p of this.points.values()) {
      let arr = byLand.get(p.land);
      if (!arr) byLand.set(p.land, (arr = []));
      arr.push(p);
    }
    for (const [land, pts] of byLand) {
      const ringLen = LANDMASSES[land]?.ring.length ? LANDMASSES[land].ring.length / 2 : 0;
      if (ringLen === 0) continue;
      const byIdx = new Map<number, ChartedPoint>();
      for (const p of pts) byIdx.set(Number(p.key.slice(p.key.indexOf(':') + 1)), p);
      for (const [idx, p] of byIdx) {
        if (!isHearsay(p)) continue;
        const v = coastVertexByKey(p.key);
        if (!v) continue;
        const base = seededError(v.lat, v.lon);
        let sw = 0, sLat = 0, sLon = 0;
        for (const dir of [1, -1]) {
          for (let k = 1; k <= RELAX_REACH; k++) {
            const q = byIdx.get((((idx + dir * k) % ringLen) + ringLen) % ringLen);
            if (!q || isHearsay(q)) continue;
            const qv = coastVertexByKey(q.key);
            if (!qv) break;
            const w = Math.exp(-k / RELAX_SCALE);
            sw += w;
            sLat += (q.lat - qv.lat) * w;
            sLon += wrap180(q.lon - qv.lon) * w;
            break;
          }
        }
        const W = Math.min(1, sw);
        const dLat = sw > 0 ? base.dLat * (1 - W) + (sLat / sw) * W : base.dLat;
        const dLon = sw > 0 ? base.dLon * (1 - W) + (sLon / sw) * W : base.dLon;
        p.lat = v.lat + dLat;
        p.lon = wrap180(v.lon + dLon);
        p.errorNm = drawnErrorNm(p, v);
      }
    }
  }

  /**
   * How far the drawn coast is displaced from the real one, hereabouts: the
   * chart's own error near a point of the real world. Used to read the chart
   * where the game needs to ask it a geometric question — how far off the
   * charted coast is the reckoning? — without a separate polyline model.
   * The chart's errors are smooth, so locally it is one displacement.
   */
  localOffset(atTrue: LatLon, radiusNm = 150): { dLat: number; dLon: number } | null {
    let sLat = 0, sLon = 0, sw = 0;
    for (const v of coastVerticesNear(atTrue, radiusNm)) {
      const pt = this.points.get(`${v.land}:${v.index}`);
      if (!pt) continue;
      const d = Math.hypot((v.lat - atTrue.lat) * 60, wrap180(v.lon - atTrue.lon) * 60 * cosd(atTrue.lat));
      const w = 1 / (1 + (d / 30) ** 2);
      sLat += (pt.lat - v.lat) * w;
      sLon += wrap180(pt.lon - v.lon) * w;
      sw += w;
    }
    if (sw <= 0) return null;
    return { dLat: sLat / sw, dLon: sLon / sw };
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
   * and means he has nothing to steer for. Where it is on the chart is his
   * belief, and is right only once he has been there.
   */
  believedPort(id: string): ChartedPort | null {
    return this.ports.get(id) ?? null;
  }

  /**
   * Draw a port, or note that you have been there again.
   *
   * Entered (`visited`), the town has told the pilot where he is, so it goes
   * on the paper where it is and stays there. Merely sighted, it goes where the
   * reckoning puts it — the true town carried by the reckoning's error — and
   * is amended with the rest of the leg at the next fix.
   */
  chartPort(
    def: PortDef, reckoned: LatLon, truePos: LatLon, t: number, visited: boolean,
    sigmaLatNm = 12, sigmaLonNm = 30, legNm = 0, legNmLat = legNm,
  ): boolean {
    const existing = this.ports.get(def.id);
    const at = anchorageOf(def);

    if (visited) {
      if (!existing) {
        this.ports.set(def.id, {
          id: def.id, lat: at.lat, lon: at.lon, visited: true, traded: false, t,
          wLat: WEIGHT_CAP, wLon: WEIGHT_CAP, passes: 1,
        });
        return true;
      }
      existing.lat = at.lat;
      existing.lon = at.lon;
      existing.wLat = WEIGHT_CAP;
      existing.wLon = WEIGHT_CAP;
      existing.passes = (existing.passes ?? 0) + 1;
      existing.visited = true;
      existing.t = t;
      return false;
    }

    const obs = {
      lat: at.lat + (reckoned.lat - truePos.lat),
      lon: wrap180(at.lon + wrap180(reckoned.lon - truePos.lon)),
    };
    const wLat = 1 / (sigmaLatNm * sigmaLatNm + 1);
    const wLon = Math.min(1 / (sigmaLonNm * sigmaLonNm + 1), PASS_W_LON);

    if (!existing) {
      this.ports.set(def.id, {
        id: def.id, lat: obs.lat, lon: obs.lon, visited: false, traded: false, t,
        wLat, wLon, passes: 1,
      });
      this.leg.push({ key: def.id, port: true, atLat: legNmLat, atLon: legNm, openLat: true, openLon: true, shareLat: 1, shareLon: 1 });
      return true;
    }
    if (existing.visited) { existing.t = t; return false; }
    const shareLat = wLat / ((existing.wLat ?? SEEDED_W_LAT) + wLat);
    const shareLon = wLon / ((existing.wLon ?? SEEDED_W_LON) + wLon);
    existing.lat += (obs.lat - existing.lat) * shareLat;
    existing.lon = wrap180(existing.lon + wrap180(obs.lon - existing.lon) * shareLon);
    existing.wLat = Math.min((existing.wLat ?? SEEDED_W_LAT) + wLat, WEIGHT_CAP);
    existing.wLon = Math.min((existing.wLon ?? SEEDED_W_LON) + wLon, WEIGHT_CAP);
    existing.passes = (existing.passes ?? 0) + 1;
    existing.t = t;
    this.leg.push({ key: def.id, port: true, atLat: legNmLat, atLon: legNm, openLat: true, openLon: true, shareLat, shareLon });
    return false;
  }

  /**
   * A town somebody has told you about: on the chart where they said, which is
   * within `errNm` of where it is, and moved only by going there.
   */
  hearOfPort(def: PortDef, errNm: number, t: number, seed = 0): void {
    if (this.ports.has(def.id)) return;
    const at = anchorageOf(def);
    const a = hashNormal(def.id, seed, 3), b = hashNormal(def.id, seed, 4);
    this.ports.set(def.id, {
      id: def.id,
      lat: at.lat + (a * errNm * 0.6) / 60,
      lon: wrap180(at.lon + (b * errNm) / 60 / Math.max(cosd(at.lat), 0.2)),
      visited: false, traded: false, t,
      wLat: 1 / (errNm * errNm * 0.36 + 1), wLon: 1 / (errNm * errNm + 1), passes: 0,
    });
  }

  /**
   * Write a name on the chart, pinned to the piece of coast it belongs to.
   *
   * A name is not a position, it is a *place* — that headland, the one we
   * watered at — so it hangs off the nearest charted vertex rather than
   * floating on a pair of numbers. `at` is where the thing actually is.
   */
  addPlace(name: string, kind: Placename['kind'], at: LatLon, t: number): Placename {
    // Pinned to the real headland it names, and drawn wherever the chart has
    // that headland — so the name moves with the coast when the coast is
    // amended, and never floats off it.
    let anchorKey: string | undefined;
    let dLat = 0, dLon = 0, best = Infinity;
    for (const v of coastVerticesNear(at, 70)) {
      const key = `${v.land}:${v.index}`;
      if (!this.points.has(key)) continue;
      const d = Math.hypot(
        (v.lat - at.lat) * 60,
        wrap180(v.lon - at.lon) * 60 * cosd(at.lat),
      );
      if (d < best) {
        best = d;
        anchorKey = key;
        dLat = at.lat - v.lat;
        dLon = wrap180(at.lon - v.lon);
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
    // His sheet is as wrong as his reckonings were, and all of a piece.
    const eLat = (hashNormal('copy', Math.round(centre.lat * 100 + centre.lon), 5) * accuracyNm * 0.5) / 60;
    const eLon = (hashNormal('copy', Math.round(centre.lat * 100 + centre.lon), 6) * accuracyNm) / 60;
    let gained = 0;
    const moved = new Map<string, { dLat: number; dLon: number }>();
    for (const v of coastVerticesNear(centre, rangeNm)) {
      const key = `${v.land}:${v.index}`;
      const have = this.points.get(key);
      // Nothing to gain from a sheet no better than what you already hold.
      if (have && have.wLon >= w) continue;
      const obs = { lat: v.lat + eLat, lon: v.lon + eLon / Math.max(cosd(v.lat), 0.2) };
      if (have) {
        const kLat = w / (have.wLat + w), kLon = w / (have.wLon + w);
        const before = { lat: have.lat, lon: have.lon };
        have.lat += (obs.lat - have.lat) * kLat;
        have.lon = wrap180(have.lon + wrap180(obs.lon - have.lon) * kLon);
        have.wLat = Math.min(Math.max(have.wLat, w), WEIGHT_CAP);
        have.wLon = Math.min(Math.max(have.wLon, w), WEIGHT_CAP);
        have.t = t;
        have.errorNm = drawnErrorNm(have, v);
        moved.set(key, { dLat: have.lat - before.lat, dLon: wrap180(have.lon - before.lon) });
      } else {
        const pt: ChartedPoint = {
          key, lat: obs.lat, lon: obs.lon, wLat: w, wLon: w, passes: 0, obsT: -1e9,
          errorNm: 0, land: v.land, t,
        };
        pt.errorNm = drawnErrorNm(pt, v);
        this.points.set(key, pt);
      }
      gained++;
    }
    if (gained > 0) this.relaxHearsay();
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
      v: 3,
      leg: this.leg,
      points: [...this.points.values()]
        // Anything the pilot has touched, including hearsay coast that was
        // bent to meet a correction: only the untouched issued sheet is
        // regenerated on load.
        .filter((p) => p.passes > 0 || p.t > 0 || !isIssued(p))
        .map((p) => [
          p.key, r6(p.lat), r6(p.lon), r(p.wLat, 6), r(p.wLon, 6),
          p.passes, Math.round(p.obsT), r(p.errorNm, 3), p.land, Math.round(p.t),
          p.born !== undefined ? Math.round(p.born) : 0,
        ]),
      ports: [...this.ports.values()]
        .filter((p) => p.passes > 0 || p.visited || p.traded || p.t > 0)
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

    // What is on the paper stays on the paper: the chart is the pilot's, and
    // a save keeps his drawing as he left it. Only bookkeeping is refreshed.
    for (const [key, pt] of c.points) {
      const v = coastVertexByKey(key);
      if (!v) { c.points.delete(key); continue; }
      pt.errorNm = drawnErrorNm(pt, v);
    }
    // A town once entered is where it is.
    for (const cp of c.ports.values()) {
      if (!cp.visited) continue;
      const def = PORTS.find((q) => q.id === cp.id);
      if (!def) continue;
      const at = anchorageOf(def);
      cp.lat = at.lat;
      cp.lon = at.lon;
    }
    // Names written against the coast as it was drawn before names were pinned
    // to the real headland: re-pin them.
    if (!(data.v >= 3)) {
      for (const pl of c.places) {
        if (!pl.anchorKey) continue;
        const v = coastVertexByKey(pl.anchorKey);
        if (!v) { pl.anchorKey = undefined; continue; }
        pl.dLat = pl.lat - v.lat;
        pl.dLon = wrap180(pl.lon - v.lon);
      }
    }
    c.leg = Array.isArray(data.leg) ? data.leg.filter((o: LegObs) => o.atLon !== undefined) : [];

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
const SEEDED_W_LON = 1 / (35 * 35);

/** Median spacing of the coastline ring's vertices, for crediting survey. */
const SEGMENT_NM = 47;

function seededPoint(key: string, v: CoastVertex): ChartedPoint {
  const e = seededError(v.lat, v.lon);
  const pt: ChartedPoint = {
    key, lat: v.lat + e.dLat, lon: v.lon + e.dLon,
    wLat: SEEDED_W_LAT, wLon: SEEDED_W_LON, passes: 0, obsT: -1e9,
    errorNm: 0,
    land: v.land,
    t: 0,
  };
  pt.errorNm = drawnErrorNm(pt, v);
  return pt;
}

/**
 * The distortion in the Casa's inherited sheets at a given place, in degrees.
 *
 * Latitude is nearly right — a quadrant and the regimento do that. Longitude is
 * out by an amount that grows with the distance from Lisbon down the coast,
 * because every pilot's error was added to the last man's and nobody could ever
 * check one: a few leagues at the Canaries, a degree and more in the Gulf of
 * Guinea. Smooth, so the inherited coast is one plausible coastline, just not
 * quite the real one; and a pure function of place, so the untouched sheet is
 * never saved.
 */
export function seededError(lat: number, lon: number): { dLat: number; dLon: number } {
  const south = clamp((38.5 - lat) / 34, 0, 1);
  const wave = Math.sin(lat * 0.21 + 0.7) * 0.35 + Math.sin(lat * 0.057 + lon * 0.04) * 0.25;
  // About a third of a degree at Arguim and half a degree at Mina: the coast
  // the Casa sent a ship to every year is known roughly, not well.
  const dLon = 0.03 + south * (0.55 + wave * 0.3);
  const dLat = (0.02 + south * 0.12) * Math.sin(lat * 0.13 + 1.9);
  return { dLat, dLon };
}

/** Whether a point still stands exactly where the issued sheet drew it. */
function isIssued(p: ChartedPoint): boolean {
  const v = coastVertexByKey(p.key);
  if (!v) return true;
  const e = seededError(v.lat, v.lon);
  return Math.abs(p.lat - (v.lat + e.dLat)) < 1e-6 && Math.abs(wrap180(p.lon - (v.lon + e.dLon))) < 1e-6;
}

/** How much a stretch bends to meet a town that has just been fixed, near it. */
function resistance(wLon: number): number {
  return 1 / (1 + wLon / AGREED_W);
}

/** Miles between where the chart draws a vertex and where it is. */
function drawnErrorNm(pt: { lat: number; lon: number }, v: CoastVertex): number {
  return Math.hypot((pt.lat - v.lat) * 60, wrap180(pt.lon - v.lon) * 60 * cosd(v.lat));
}

/** A deterministic standard-normal-ish number from a key and a time. */
function hashNormal(key: string, t: number, salt: number): number {
  let h = 2166136261 ^ salt;
  const s = `${key}|${Math.round(t)}|${salt}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  const u1 = ((h >>> 0) % 100000 + 0.5) / 100000;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  const u2 = ((h >>> 0) % 100000 + 0.5) / 100000;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** One sighting drawn on the current leg, awaiting the next fix. */
export interface LegObs {
  key: string;
  port: boolean;
  /** Miles into each coordinate's leg when it was drawn. */
  atLat: number;
  atLon: number;
  /** Still waiting on a fix in that coordinate. */
  openLat: boolean;
  openLon: boolean;
  /** How much this sighting counted for in the drawn position, per coordinate. */
  shareLat: number;
  shareLon: number;
}

/** How far along the shore surveyed coast pulls the issued sheet toward it, in ring vertices. */
const RELAX_REACH = 10;
const RELAX_SCALE = 3;

/** Coast known only from the issued sheet: never run, copied or corrected. */
function isHearsay(p: ChartedPoint): boolean {
  return p.passes === 0 && p.wLon <= SEEDED_W_LON * 1.0001;
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
