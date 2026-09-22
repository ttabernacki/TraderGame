import {
  METRES_PER_DEG_LAT, NM, clamp, cosd, metresPerDegLon, rhumbStep, wrap180, wrap360,
  type LatLon,
} from '../core/math';
import { Rng } from '../core/rng';
import {
  ALMANAC_BY_ID, COMPASS_BY_ID, INSTRUMENT_BY_ID, SPEED_BY_ID, sightError, type Almanac,
} from './instruments';
import {
  latitudeFromMeridianStar, latitudeFromNoonSun, magneticVariation, polarisSight,
  precess, solarDeclination, starPosition, sunPosition, STARS,
} from './celestial';

export interface TraverseEntry {
  /** Simulated time the entry was made. */
  t: number;
  /** Compass course steered, degrees magnetic. */
  course: number;
  /** Distance run in that period, nautical miles. */
  distance: number;
  windFrom: number;
  windKnots: number;
  remark?: string;
}

export interface Fix {
  t: number;
  latitude: number;
  method: string;
  /** One-sigma error of the observation, degrees. */
  sigma: number;
  body: string;
}

export interface NavigatorKit {
  altitude: string;
  speed: string;
  almanac: string;
  compass: string;
}

/**
 * The pilot's reckoning.
 *
 * This holds the position the navigator believes he is at, which is not the
 * position he is at. The gap between them is the whole game: it opens whenever
 * a current sets him sideways, whenever the helmsman wanders, whenever the
 * compass lies about north, and it closes only in latitude and only when he can
 * see a heavenly body. Longitude, in this century, is never recovered at all.
 */
export class Navigator {
  /** Where the pilot reckons the ship to be. */
  estimated: LatLon;
  /** Accumulated one-sigma uncertainty, in nautical miles. */
  sigmaLat = 2;
  sigmaLon = 2;

  /** Miles run since anything corrected the reckoning. */
  milesSinceFix = 0;
  /** Simulated seconds of the last observation or landfall. */
  lastFixT = 0;

  traverse: TraverseEntry[] = [];
  fixes: Fix[] = [];

  kit: NavigatorKit = {
    altitude: 'quadrante',
    speed: 'olho',
    almanac: 'regimento-norte',
    compass: 'agulha',
  };

  /** Set once the pilot has been taught to allow for leeway. */
  leewayAllowance = 0;

  /**
   * How fast the reckoning goes wrong, against an ordinary pilot's rate.
   *
   * A captain who keeps the board himself — every heave of the log entered,
   * every course change timed — is not more accurate per observation, he simply
   * makes fewer small errors between them. So this scales the systematic errors
   * and the growth of doubt together, and leaves every sight alone.
   */
  driftScale = 1;

  private rng: Rng;
  private accumCourse = 0;
  private accumDist = 0;
  private accumWeight = 0;
  private lastEntryT = 0;
  /** Slowly-varying steering bias, so error is systematic rather than white noise. */
  private helmBias = 0;
  private logBias = 1;

  constructor(start: LatLon, seed = 1234) {
    this.estimated = { ...start };
    this.rng = new Rng(seed ^ 0xa11ce);
    this.helmBias = this.rng.normal(0, 1);
    this.logBias = 1 + this.rng.normal(0, 0.03);
  }

  get altitudeInstrument() { return INSTRUMENT_BY_ID.get(this.kit.altitude)!; }
  get speedInstrument() { return SPEED_BY_ID.get(this.kit.speed)!; }
  get almanac() { return ALMANAC_BY_ID.get(this.kit.almanac)!; }
  get compass() { return COMPASS_BY_ID.get(this.kit.compass)!; }

  /**
   * Advance the reckoning. Everything passed in is what the ship is really
   * doing; what comes out is what the pilot writes down.
   */
  integrate(
    dt: number,
    truePos: LatLon,
    trueHeading: number,
    speedThroughWaterKnots: number,
    trueLeeway: number,
    windFrom: number,
    windKnots: number,
    skill: number,
    t: number,
  ): void {
    if (dt <= 0) return;

    // The helmsman does not hold the course exactly, and his error drifts.
    this.helmBias += this.rng.normal(0, 0.02) * Math.sqrt(dt / 60);
    this.helmBias = clamp(this.helmBias, -3, 3);
    const steerError = this.helmBias * this.compass.error * (1.25 - skill * 0.5) * this.driftScale;

    // The compass points at magnetic north, and nobody has a chart of variation.
    const variation = magneticVariation(truePos.lat, truePos.lon);
    // A skilled pilot notices the discrepancy between compass and pole star and
    // allows for part of it; an unskilled one has no idea it exists.
    const variationCorrected = variation * clamp(skill * 0.75, 0, 0.8);
    const believedCourse = wrap360(trueHeading + steerError - (variation - variationCorrected));

    // The log over-reads or under-reads, consistently.
    this.logBias += this.rng.normal(0, 0.004) * Math.sqrt(dt / 3600);
    const believedSpeed = Math.max(
      0,
      Math.abs(speedThroughWaterKnots) * (1 + (this.logBias - 1) * this.driftScale) *
        (1 + this.rng.normal(0, this.speedInstrument.error * 0.35 * this.driftScale)),
    );

    // Leeway is visible in the wake, so a good pilot allows for some of it.
    const allowed = trueLeeway * clamp(this.leewayAllowance * skill, 0, 0.9);
    const reckonedCourse = wrap360(believedCourse + allowed);

    const distM = believedSpeed * NM * (dt / 3600);
    if (distM > 0) this.estimated = rhumbStep(this.estimated, reckonedCourse, distM);

    // Uncertainty grows with distance run. Longitude grows faster because it is
    // never corrected, and because an unknown current is mostly an east-west
    // error on the classic Atlantic tracks.
    //
    // Accumulated as *variance per mile run*, not as the sum of squares of each
    // step's contribution. Those are only the same thing when the step is the
    // whole run. This is called every physics step, a step is a thousandth of a
    // mile, and hypot(2, 0.000035) is 2 — so written the other way the doubt
    // never grew at all. Measured before the change: twenty days out, the pilot
    // was a hundred and thirty miles wrong and the display still read plus or
    // minus two minutes. The entire reason to take a sight had been quietly
    // switched off.
    //
    // Variance growing linearly with distance is also the correct model: this is
    // a random walk in the errors of the log, the compass and the helmsman, and
    // a random walk's variance goes as its length.
    const runNm = distM / NM;
    const drift = this.driftScale * this.driftScale;
    this.sigmaLat = Math.sqrt(this.sigmaLat * this.sigmaLat + runNm * LAT_DRIFT * drift);
    this.sigmaLon = Math.sqrt(this.sigmaLon * this.sigmaLon + runNm * LON_DRIFT * drift);
    this.milesSinceFix += runNm;

    this.accumCourse += reckonedCourse * runNm;
    this.accumDist += runNm;
    this.accumWeight += runNm;

    // The pilot rules a line on the traverse board at the end of each watch.
    if (t - this.lastEntryT >= 4 * 3600 && this.accumWeight > 0.01) {
      this.traverse.push({
        t,
        course: wrap360(this.accumCourse / this.accumWeight),
        distance: this.accumDist,
        windFrom,
        windKnots,
      });
      if (this.traverse.length > 400) this.traverse.shift();
      this.accumCourse = 0;
      this.accumDist = 0;
      this.accumWeight = 0;
      this.lastEntryT = t;
    }
  }

  /** Apply a latitude observation, which corrects latitude and nothing else. */
  applyLatitude(lat: number, sigmaDeg: number, method: string, body: string, t: number): void {
    const sigmaNm = sigmaDeg * 60;
    // Weighted blend of the reckoning and the observation.
    const wObs = 1 / (sigmaNm * sigmaNm + 1e-6);
    const wDr = 1 / (this.sigmaLat * this.sigmaLat + 1e-6);
    const blended = (lat * wObs + this.estimated.lat * wDr) / (wObs + wDr);

    this.estimated.lat = blended;
    this.sigmaLat = Math.sqrt(1 / (wObs + wDr));
    // An observed latitude also settles the longitude a little, because half of
    // what makes the reckoning wrong — a bad log line, a wandering helmsman —
    // puts her out in both at once, and finding one out tells the pilot
    // something about the other. Only a little: this is not a longitude.
    this.sigmaLon = Math.max(this.sigmaLon * 0.88, 1.2);
    this.lastFixT = t;
    this.milesSinceFix = 0;
    this.fixes.push({ t, latitude: lat, method, sigma: sigmaDeg, body });
    if (this.fixes.length > 200) this.fixes.shift();
  }

  /**
   * Landfall on a charted feature is the only thing that fixes longitude — and
   * it fixes it no better than the chart has it, which is the point.
   *
   * `sigmaLonNm` is the doubt in the chart's own longitude for the place he has
   * made, so a port he has run down a dozen times gives him a good departure
   * and one he has only read about gives him a bad one.
   */
  applyLandfall(known: LatLon, t: number, sigmaLonNm = 1.2, sigmaLatNm = 0.6): void {
    this.estimated = { ...known };
    // The latitude doubt is an argument now, and the reason is the worst bug
    // this navigation model has had.
    //
    // It used to be hard-set to 0.6 miles by every landfall, including one
    // where the pilot had just named the wrong headland. Identifying a
    // landfall is allowed to throw the reckoning hundreds of miles — that is
    // the whole mechanism and it stays — but setting the doubt to nothing
    // while doing it meant the chart drew an error circle the size of a full
    // stop around a position that was two hundred miles wrong, and the player
    // was never given one signal that anything had happened. He sailed on
    // confidently, the coast appeared to have moved, and the only thing that
    // ever put it right was blundering into a port.
    //
    // A pilot who has just moved his board a long way on the strength of a
    // hill he likes the look of is not thereby certain, and the board should
    // say so. Being wrong is the game; being wrong with no way to find out is
    // not.
    this.sigmaLat = clamp(sigmaLatNm, 0.6, 90);
    this.sigmaLon = clamp(sigmaLonNm, 1.2, 90);
    this.lastFixT = t;
    this.milesSinceFix = 0;
    this.fixes.push({ t, latitude: known.lat, method: 'Landfall', sigma: 0.02, body: 'the land' });
  }

  /**
   * A position recalled from the pilot's own book.
   *
   * Recognising a patch of bottom he has been over before is a fix, but it is
   * only ever as good as the board that wrote the page. This used to assert
   * the page's position outright with three miles of confidence — a flat
   * three miles, whatever the reckoning had been doing on the day — and that
   * is the bug that threw a ship out of São Jorge da Mina and left the coast
   * of Africa several hundred miles to the west of her. The cast she made
   * coming in, on a board two hundred miles out, was read straight back to
   * her on the way out as though it were a landfall.
   *
   * So it is blended rather than asserted, on the page's own doubt against
   * the board's. A page written when the pilot was two hundred miles out
   * barely moves a board he has just fixed in harbour; a good page corrects
   * a bad board almost entirely. Returns the miles the board moved.
   */
  rememberedFix(at: LatLon, doubtNm: number, t: number): number {
    const wObs = 1 / (doubtNm * doubtNm + 1e-6);
    const wLat = 1 / (this.sigmaLat * this.sigmaLat + 1e-6);
    const wLon = 1 / (this.sigmaLon * this.sigmaLon + 1e-6);
    const from = { ...this.estimated };

    this.estimated.lat = (at.lat * wObs + this.estimated.lat * wLat) / (wObs + wLat);
    // Longitude through the short way round, so a page either side of the
    // meridian is not averaged the long way about the world.
    this.estimated.lon = wrap180(this.estimated.lon
      + (wrap180(at.lon - this.estimated.lon) * wObs) / (wObs + wLon));
    this.sigmaLat = Math.sqrt(1 / (wObs + wLat));
    this.sigmaLon = Math.sqrt(1 / (wObs + wLon));
    this.lastFixT = t;
    this.milesSinceFix = 0;

    const movedNm = Math.hypot(
      (this.estimated.lat - from.lat) * 60,
      wrap180(this.estimated.lon - from.lon) * 60 * cosd(from.lat),
    );
    this.fixes.push({
      t, latitude: this.estimated.lat, method: 'The book',
      sigma: this.sigmaLat / 60, body: 'the ground',
    });
    if (this.fixes.length > 200) this.fixes.shift();
    return movedNm;
  }

  /**
   * A position line by the lead.
   *
   * The lead does not give a position. It gives a *distance from the coast*,
   * and the coast is a line, so what comes out is a line parallel to the shore
   * with the ship somewhere on it. That corrects the reckoning across the coast
   * and tells it nothing at all along the coast — which off Africa is almost
   * pure longitude, and is therefore the one correction the century otherwise
   * has no way to make.
   *
   * `shoreBearing` is the direction of the land from the ship. The correction
   * runs along that axis and nowhere else: a ship that finds herself ten miles
   * further off than she reckoned moves ten miles *away from the coast*, and
   * her doubt shrinks in that direction only. The doubt she carries up and down
   * the coast is untouched, because nothing she has just done bears on it.
   */
  applySounding(
    shoreBearing: number, measuredOffNm: number, believedOffNm: number,
    sigmaNm: number, t: number, note: string,
  ): { movedNm: number } {
    const rad = Math.PI / 180;
    // Unit vector from the ship toward the land, in north and east.
    const cN = Math.cos(shoreBearing * rad);
    const eE = Math.sin(shoreBearing * rad);

    // Positive means she is further off than the reckoning had her, so she must
    // move away from the land.
    const delta = measuredOffNm - believedOffNm;

    // The reckoning's own doubt resolved onto that axis. A ship whose error is
    // all in longitude, closing a coast that runs north and south, has all of
    // its doubt on this axis and the sounding is worth a great deal to her; the
    // same ship closing a coast that runs east and west learns almost nothing.
    const varAxis = this.sigmaLat * this.sigmaLat * cN * cN
      + this.sigmaLon * this.sigmaLon * eE * eE;
    const varObs = sigmaNm * sigmaNm;
    const k = varAxis / (varAxis + varObs);
    const move = k * delta;

    this.estimated.lat -= (move * cN) / 60;
    this.estimated.lon = wrap180(
      this.estimated.lon - (move * eE) / 60 / Math.max(cosd(this.estimated.lat), 0.2),
    );

    // Variance on the axis after the observation, spread back over the two
    // components in proportion to how much of each the axis was made of.
    const after = 1 / (1 / Math.max(varAxis, 1e-9) + 1 / Math.max(varObs, 1e-9));
    const shrink = Math.sqrt(after / Math.max(varAxis, 1e-9));
    this.sigmaLat *= 1 + (shrink - 1) * cN * cN;
    this.sigmaLon *= 1 + (shrink - 1) * eE * eE;
    this.sigmaLat = Math.max(this.sigmaLat, 0.5);
    this.sigmaLon = Math.max(this.sigmaLon, 0.5);

    this.lastFixT = t;
    this.fixes.push({
      t, latitude: this.estimated.lat, method: 'By the lead', sigma: sigmaNm / 60, body: note,
    });
    if (this.fixes.length > 200) this.fixes.shift();
    return { movedNm: Math.abs(move) };
  }

  /**
   * Longitude by lunar distance.
   *
   * The one thing in the game nobody else in 1482 can do — the method was not
   * published for another two and a half centuries — so it is deliberately the
   * most expensive node on any tree. It wants a clear moon, it takes hours of
   * working, and it comes out to a quarter of a degree. That is fifteen miles
   * of longitude where the alternative is sixty or a hundred, and it turns the
   * open Atlantic from a thing you survive into a thing you cross on purpose.
   */
  applyLongitude(lon: number, sigmaNm: number, t: number): void {
    const wObs = 1 / (sigmaNm * sigmaNm + 1e-6);
    const wDr = 1 / (this.sigmaLon * this.sigmaLon + 1e-6);
    this.estimated.lon = wrap180((lon * wObs + this.estimated.lon * wDr) / (wObs + wDr));
    this.sigmaLon = Math.sqrt(1 / (wObs + wDr));
    this.lastFixT = t;
    this.fixes.push({ t, latitude: this.estimated.lat, method: 'Lunar distance', sigma: sigmaNm / 60, body: 'the moon' });
    if (this.fixes.length > 200) this.fixes.shift();
  }

  /** Error between the reckoning and the truth, in nautical miles. */
  errorNm(truePos: LatLon): { lat: number; lon: number; total: number } {
    const dLat = (this.estimated.lat - truePos.lat) * 60;
    const dLon = wrap180(this.estimated.lon - truePos.lon) * 60 * cosd(truePos.lat);
    return { lat: dLat, lon: dLon, total: Math.hypot(dLat, dLon) };
  }
}

/**
 * Variance added per mile run, in square nautical miles.
 *
 * Tuned against the error the simulation actually produces, not guessed: a
 * hundred-mile day takes the pilot from two miles of doubt to seventeen, a week
 * puts him at forty-six and a fortnight at sixty-five, against a true error
 * measured over the same passages of sixty to a hundred. He stays a little more
 * confident than he has any right to be, which is correct — every pilot on this
 * route was — but no longer by the factor of three that made the figure
 * meaningless.
 *
 * It also has to sit in the right place against the instruments, or the whole
 * loop dies. A quadrant and the rule of the Guards are worth about sixty miles
 * on a moving deck; the reckoning passes that in the second week, which is when
 * the pilot starts asking for the pole star. A better instrument and better
 * tables each move that day earlier, and they multiply, so both are worth
 * buying and neither is sufficient alone.
 */
const LAT_DRIFT = 3.0;
const LON_DRIFT = 5.5;

export type SightBody = 'sun' | 'polaris' | 'cruzeiro' | 'star';

export interface SightOpportunity {
  body: SightBody;
  label: string;
  /** True altitude of the body right now. */
  altitude: number;
  azimuth: number;
  available: boolean;
  reason?: string;
  /** Name of the star, when the body is a star. */
  star?: string;
  /**
   * Minutes until the sun is on the meridian, as the pilot reckons it.
   *
   * He is not guessing: he had yesterday's noon and he knows roughly how far
   * the ship has run since, so he can say within a few minutes when to be at
   * the rail. Without this the player has no way to know when to start and the
   * meridian hunt becomes a clicking exercise — which is not the thing it is
   * supposed to be about. It is deliberately approximate.
   */
  minutesToNoon?: number;
}

export interface SightOutcome {
  ok: boolean;
  message: string;
  latitude?: number;
  sigma?: number;
  /** Raw altitude as measured, including the observer's error. */
  measured?: number;
  method?: string;
}

/**
 * What the navigator could shoot right now. The point of this list is that most
 * of the time the answer is "nothing useful": the sun is not on the meridian,
 * the pole star has set, the horizon is lost in haze, or it is overcast.
 */
export function sightOpportunities(
  truePos: LatLon,
  dayFromEpoch: number,
  hourLocal: number,
  dayOfYear: number,
  year: number,
  cloud: number,
  visibility: number,
  /**
   * The books aboard.
   *
   * Optional only so that older callers still compile; every caller that has a
   * ship should pass it. Without it this function answers "can you see it",
   * which is half the question — the other half is whether there is anything
   * aboard to turn the altitude into a latitude, and a player was finding that
   * out only after he had gone through the whole business of taking the sight.
   * A pilot knows what is in his chest before he goes to the rail.
   */
  almanac?: Almanac,
): SightOpportunity[] {
  const out: SightOpportunity[] = [];
  const sun = sunPosition(truePos.lat, truePos.lon, dayFromEpoch, hourLocal, dayOfYear);
  const overcast = cloud > 0.72;
  const hazy = visibility < 3;

  const nearNoon = Math.abs(hourLocal - 12) < 0.85;

  // When she will be highest, found by looking rather than by formula: sample
  // the altitude forward and back and take the turn. Cheap, and it cannot
  // disagree with the ephemeris the sight itself is worked from.
  let bestH = hourLocal;
  let bestAlt = -99;
  for (let h = 10.5; h <= 13.5; h += 1 / 60) {
    const a = sunPosition(truePos.lat, truePos.lon, dayFromEpoch, h, dayOfYear).altitude;
    if (a > bestAlt) { bestAlt = a; bestH = h; }
  }
  const minutesToNoon = Math.round((bestH - hourLocal) * 60);

  // Whether the books aboard can turn a solar altitude into a latitude at all.
  //
  // The Regimento do Norte — which is what a captain starts with, and which is
  // what a caravel of 1482 actually carried — is a rule for the pole star and
  // contains no solar declination whatever. Taking the sun with it gives you a
  // number and nothing else. That was already true and was only said *after*
  // the sight had been worked, which is the wrong end of the ritual.
  const southernSky = truePos.lat < 0;
  const noSolar = almanac ? almanac.solarError === null : false;
  const noSouthern = almanac ? southernSky && !almanac.southern : false;

  out.push({
    body: 'sun',
    label: 'Meridian altitude of the sun',
    altitude: sun.altitude,
    azimuth: sun.azimuth,
    minutesToNoon,
    available: sun.altitude > 6 && nearNoon && !overcast && !hazy && !noSolar && !noSouthern,
    reason: noSolar
      ? 'No solar tables aboard — the Regimento do Norte is a rule for the pole star and '
        + 'has no declination of the sun in it. Take the North Star instead, or buy the '
        + 'tables at Lisbon.'
      : noSouthern
        ? 'Your tables do not run south of the line. Take a southern star, or buy tables '
          + 'that go below the equator.'
        : sun.altitude <= 6
          ? 'The sun is not high enough'
          : !nearNoon
            ? 'It wants local noon; wait until she bears due north or south'
            : overcast
              ? 'Overcast — no sun to be had'
              : hazy
                ? 'The horizon is lost in haze'
                : undefined,
  });

  const pole = polarisSight(truePos.lat, truePos.lon, dayFromEpoch, hourLocal, year);
  const night = sun.altitude < -8;
  out.push({
    body: 'polaris',
    label: 'Altitude of the North Star',
    altitude: pole.altitude,
    azimuth: 0,
    available: pole.visible && night && !overcast && !hazy,
    reason: !pole.visible
      ? 'The pole star is below the horizon. You are south of it now.'
      : !night
        ? 'Too much daylight to see it'
        : overcast
          ? 'Overcast'
          : hazy
            ? 'The horizon is lost in haze'
            : undefined,
  });

  const acrux = STARS.find((s) => s.name === 'Acrux')!;
  const cross = starPosition(acrux, truePos.lat, truePos.lon, dayFromEpoch, hourLocal, year);
  out.push({
    body: 'cruzeiro',
    label: 'The Southern Cross on the meridian',
    altitude: cross.altitude,
    azimuth: cross.azimuth,
    available:
      cross.altitude > 5 && night && !overcast && !hazy &&
      (Math.abs(wrap180(cross.azimuth - 180)) < 12 || Math.abs(wrap180(cross.azimuth)) < 12),
    reason: cross.altitude <= 5
      ? 'The Cross is not above the horizon here'
      : !night
        ? 'Too much daylight'
        : overcast
          ? 'Overcast'
          : 'The Cross is not yet upright on the meridian',
  });

  // Any bright star crossing the meridian will give a latitude.
  let bestStar: { s: typeof STARS[number]; alt: number; az: number } | null = null;
  for (const s of STARS) {
    if (s.mag > 1.6) continue;
    const h = starPosition(s, truePos.lat, truePos.lon, dayFromEpoch, hourLocal, year);
    if (h.altitude < 12 || h.altitude > 84) continue;
    const offMeridian = Math.min(
      Math.abs(wrap180(h.azimuth - 180)),
      Math.abs(wrap180(h.azimuth)),
    );
    if (offMeridian > 8) continue;
    if (!bestStar || h.altitude > bestStar.alt) bestStar = { s, alt: h.altitude, az: h.azimuth };
  }
  out.push({
    body: 'star',
    label: bestStar ? `Meridian altitude of ${bestStar.s.name}` : 'A star on the meridian',
    altitude: bestStar?.alt ?? 0,
    azimuth: bestStar?.az ?? 0,
    star: bestStar?.s.name,
    available: !!bestStar && night && !overcast && !hazy,
    reason: !bestStar
      ? 'No bright star stands on the meridian at a useful altitude'
      : !night
        ? 'Too much daylight'
        : overcast
          ? 'Overcast'
          : 'The horizon is lost in haze',
  });

  return out;
}

/**
 * One altitude in a meridian session.
 */
export interface MeridianReading {
  /** Local hour it was taken at. */
  hour: number;
  /** What the observer read off the instrument, with all his error in it. */
  observed: number;
  /** What the altitude actually was, kept for scoring the session. */
  truth: number;
}

export interface MeridianResult extends SightOutcome {
  /** Readings that went into it. */
  count?: number;
  /** True when the sun was seen to rise and then fall, so noon was caught. */
  bracketed?: boolean;
  /** Highest altitude observed, which is the meridian altitude if bracketed. */
  peak?: number;
  /** The working, line by line, for the screen. */
  working?: string[];
}

/**
 * Work a meridian altitude from a series of observations.
 *
 * Local noon is not a moment anybody is told: it is the moment the sun stops
 * climbing, and the only way to find it is to keep measuring until it does. So
 * the sight is a hunt rather than a guess. Take too few altitudes and you stop
 * while the sun is still rising, and your latitude is wrong in a direction you
 * cannot detect from the figures — which is the single most instructive mistake
 * in the whole of celestial navigation and is why this is worth playing at all.
 *
 * Accuracy comes from two places, and they pull against each other. Every extra
 * reading averages down the observer's hand, so the scatter of the set is a
 * better estimate of the truth than any one of them. But every reading costs
 * minutes of a window that is not very wide, and the sun waits for nobody.
 *
 * The scatter also *reports itself*: three altitudes that agree closely are
 * evidence that all three are good, and one that disagrees with two others is
 * visibly the rogue. A pilot with three readings knows how much to trust them.
 * A pilot with one never does.
 */
export function workMeridian(
  nav: Navigator,
  readings: MeridianReading[],
  truePos: LatLon,
  dayOfYear: number,
  sunBoreSouth: boolean,
  t: number,
  rng: Rng,
): MeridianResult {
  if (readings.length === 0) {
    return { ok: false, message: 'No altitude was taken.' };
  }
  const alm = nav.almanac;
  if (alm.solarError === null) {
    return {
      ok: false,
      message:
        'You have the altitudes and they tell you nothing. The Regimento do Norte is a rule for '
        + 'the pole star; there is no declination of the sun in it for this day or any other.',
    };
  }
  if (truePos.lat < 0 && !alm.southern) {
    return {
      ok: false,
      message: 'Your tables do not run south of the line. Without a declination you cannot turn '
        + 'an altitude into a latitude.',
    };
  }

  // The meridian altitude is the highest one observed.
  let peakIdx = 0;
  for (let i = 1; i < readings.length; i++) {
    if (readings[i].observed > readings[peakIdx].observed) peakIdx = i;
  }
  const peak = readings[peakIdx].observed;

  // Was the sun seen to turn? Only if something was measured on each side of
  // the highest reading. Without that you stopped while she was still rising.
  const bracketed = peakIdx > 0 && peakIdx < readings.length - 1;

  // How much the set disagrees with itself, near the top. This is the pilot's
  // own evidence about his own accuracy and it is the honest sigma.
  const near = readings.filter((r) => peak - r.observed < 0.9);
  const mean = near.reduce((s, r) => s + r.observed, 0) / near.length;
  const scatter = near.length > 1
    ? Math.sqrt(near.reduce((s, r) => s + (r.observed - mean) ** 2, 0) / (near.length - 1))
    : 0;

  const inst = nav.altitudeInstrument;
  // Averaging down: n readings of independent hand error are worth sqrt(n).
  const handSigma = Math.max(scatter, inst.baseError * 0.5) / Math.sqrt(readings.length);

  const trueDec = solarDeclination(dayOfYear);
  const tableDec = trueDec + rng.normal(0, alm.solarError);
  const lat = latitudeFromNoonSun(peak, tableDec, sunBoreSouth);
  const sigma = Math.hypot(handSigma, alm.solarError, bracketed ? 0 : 0.35);

  nav.applyLatitude(lat, sigma, 'Meridian sun', 'the sun', t);

  const zenith = 90 - peak;
  const working = [
    `${readings.length} altitude${readings.length === 1 ? '' : 's'} taken, the greatest ${peak.toFixed(2)}\u00b0`,
    `Zenith distance  90\u00b0 \u2212 ${peak.toFixed(2)}\u00b0 = ${zenith.toFixed(2)}\u00b0`,
    `Declination this day, from the tables  ${tableDec >= 0 ? 'N' : 'S'} ${Math.abs(tableDec).toFixed(2)}\u00b0`,
    `Latitude  ${zenith.toFixed(2)}\u00b0 ${sunBoreSouth ? '\u2212' : '+'} ${Math.abs(tableDec).toFixed(2)}\u00b0 `
      + `= ${Math.abs(lat).toFixed(2)}\u00b0 ${lat >= 0 ? 'N' : 'S'}`,
    near.length > 1
      ? `The top ${near.length} agree to within ${(scatter * 60).toFixed(0)}\u2032, so the sight is worth about ${(sigma * 60).toFixed(0)}\u2032`
      : 'One altitude only. Nothing to check it against.',
  ];

  return {
    ok: true,
    latitude: lat,
    sigma,
    measured: peak,
    method: 'Meridian sun',
    count: readings.length,
    bracketed,
    peak,
    working,
    message: bracketed
      ? `You saw her turn. Latitude by observation ${Math.abs(lat).toFixed(2)}\u00b0 ${lat >= 0 ? 'N' : 'S'}.`
      : 'She was still rising when you stopped. What you have is the altitude at the moment you '
        + 'gave up, which is lower than the meridian altitude — so the zenith distance is too '
        + 'great and the latitude comes out further from the sun than the ship really is. There '
        + 'is nothing in the figures to tell you so.',
  };
}

/**
 * Take a sight.
 *
 * `aimError` is how far the player's own reading was off the true altitude, in
 * degrees, which comes from the sighting interface. That is added to the error
 * of the instrument, the observer, and the tables.
 */
export function takeSight(
  nav: Navigator,
  opportunity: SightOpportunity,
  truePos: LatLon,
  dayFromEpoch: number,
  hourLocal: number,
  dayOfYear: number,
  year: number,
  waveHeight: number,
  skill: number,
  aimError: number,
  t: number,
  rng: Rng,
): SightOutcome {
  if (!opportunity.available) {
    return { ok: false, message: opportunity.reason ?? 'The sight cannot be taken.' };
  }

  const inst = nav.altitudeInstrument;
  const instSigma = sightError(inst, waveHeight, skill, opportunity.body === 'sun');
  const observed = opportunity.altitude + rng.normal(0, instSigma) + aimError;

  const alm = nav.almanac;
  const southern = truePos.lat < 0;

  if (opportunity.body === 'sun') {
    if (alm.solarError === null) {
      return {
        ok: false,
        message:
          'You have the altitude and it tells you nothing. The Regimento do Norte is a rule for '
          + 'the pole star; there is no declination of the sun in it for this day or any other. '
          + 'You want the solar tables, and they are sold at Lisbon.',
      };
    }
    if (southern && !alm.southern) {
      return {
        ok: false,
        message:
          'You have the altitude, but your tables do not run south of the line. Without a declination for this day you cannot turn it into a latitude.',
      };
    }
    const trueDec = solarDeclination(dayOfYear);
    const tableDec = trueDec + rng.normal(0, alm.solarError);
    const sunBoreSouth = opportunity.azimuth > 90 && opportunity.azimuth < 270;
    const lat = latitudeFromNoonSun(observed, tableDec, sunBoreSouth);
    const sigma = Math.hypot(instSigma, alm.solarError, Math.abs(aimError) * 0.5);
    nav.applyLatitude(lat, sigma, 'Meridian sun', 'the sun', t);
    return {
      ok: true, latitude: lat, sigma, measured: observed, method: 'Meridian sun',
      message: `Altitude ${observed.toFixed(1)}°, declination ${tableDec >= 0 ? 'N' : 'S'} ${Math.abs(tableDec).toFixed(1)}°. Latitude by observation ${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}.`,
    };
  }

  if (opportunity.body === 'polaris') {
    const pole = polarisSight(truePos.lat, truePos.lon, dayFromEpoch, hourLocal, year);
    // Applying the Regimento's correction for the Guards needs the book. It does
    // not need to be a great pilot: the whole purpose of that book was that an
    // ordinary man could use it, which is why every ship on the Guinea run
    // carried one. Gating it behind a skill the player does not start with made
    // the starting almanac decorative — he was handed a rule he could not read.
    // Skill now decides how *well* he reads it, not whether he can.
    const canCorrect = alm.declinationError < 2;
    const readError = alm.declinationError * (1.6 - skill * 0.8);
    const correction = canCorrect
      ? pole.correction + rng.normal(0, readError)
      : rng.normal(0, 0.4);
    const lat = observed + correction;
    const sigma = Math.hypot(instSigma, canCorrect ? readError : 2.4, Math.abs(aimError) * 0.5);
    nav.applyLatitude(lat, sigma, 'North Star', 'the pole star', t);
    return {
      ok: true, latitude: lat, sigma, measured: observed, method: 'North Star',
      message: canCorrect
        ? `Altitude ${observed.toFixed(1)}°. Guards at the ${guardWord(pole.guardHour)}; correction ${correction >= 0 ? '+' : ''}${correction.toFixed(1)}°. Latitude ${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}.`
        : `Altitude ${observed.toFixed(1)}°, taken for the latitude. You have no rule for the Guards, so this may be wrong by three degrees either way.`,
    };
  }

  const starName = opportunity.body === 'cruzeiro' ? 'Acrux' : opportunity.star;
  const star = STARS.find((s) => s.name === starName);
  if (!star) return { ok: false, message: 'No such star is in your rutter.' };

  if (!alm.southern && star.dec < -20) {
    return {
      ok: false,
      message: 'Your tables give no declination for the southern stars. The altitude tells you nothing.',
    };
  }

  const p = precess(star, year);
  const tableDec = p.dec + rng.normal(0, alm.declinationError * 0.5);
  const boreSouth = opportunity.azimuth > 90 && opportunity.azimuth < 270;
  const lat = latitudeFromMeridianStar(observed, tableDec, boreSouth);
  const sigma = Math.hypot(instSigma, alm.declinationError * 0.5, Math.abs(aimError) * 0.5);
  const label = opportunity.body === 'cruzeiro' ? 'Southern Cross' : star.name;
  nav.applyLatitude(lat, sigma, label, star.name, t);
  return {
    ok: true, latitude: lat, sigma, measured: observed, method: label,
    message: `${star.name} on the meridian at ${observed.toFixed(1)}°. Latitude ${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}.`,
  };
}

function guardWord(hour: number): string {
  const words = [
    'head', 'north-east', 'east', 'south-east', 'right arm', 'south',
    'feet', 'south-west', 'west', 'north-west', 'left arm', 'north',
  ];
  return words[hour % 12];
}

export { METRES_PER_DEG_LAT, metresPerDegLon };
