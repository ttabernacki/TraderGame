import {
  METRES_PER_DEG_LAT, NM, clamp, cosd, metresPerDegLon, rhumbStep, wrap180, wrap360,
  type LatLon,
} from '../core/math';
import { Rng } from '../core/rng';
import {
  ALMANAC_BY_ID, COMPASS_BY_ID, INSTRUMENT_BY_ID, SPEED_BY_ID, sightError,
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
    const steerError = this.helmBias * this.compass.error * (1.25 - skill * 0.5);

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
      Math.abs(speedThroughWaterKnots) * this.logBias *
        (1 + this.rng.normal(0, this.speedInstrument.error * 0.35)),
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
    this.sigmaLat = Math.sqrt(this.sigmaLat * this.sigmaLat + runNm * LAT_DRIFT);
    this.sigmaLon = Math.sqrt(this.sigmaLon * this.sigmaLon + runNm * LON_DRIFT);
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

  /** Landfall on a charted feature is the only thing that fixes longitude. */
  applyLandfall(known: LatLon, t: number): void {
    this.estimated = { ...known };
    this.sigmaLat = 0.6;
    this.sigmaLon = 1.2;
    this.lastFixT = t;
    this.milesSinceFix = 0;
    this.fixes.push({ t, latitude: known.lat, method: 'Landfall', sigma: 0.02, body: 'the land' });
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
): SightOpportunity[] {
  const out: SightOpportunity[] = [];
  const sun = sunPosition(truePos.lat, truePos.lon, dayFromEpoch, hourLocal, dayOfYear);
  const overcast = cloud > 0.72;
  const hazy = visibility < 3;

  const nearNoon = Math.abs(hourLocal - 12) < 0.85;
  out.push({
    body: 'sun',
    label: 'Meridian altitude of the sun',
    altitude: sun.altitude,
    azimuth: sun.azimuth,
    available: sun.altitude > 6 && nearNoon && !overcast && !hazy,
    reason: sun.altitude <= 6
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

/** Uncertainty ellipse for the chart, in degrees. */
export function uncertaintyDegrees(nav: Navigator): { lat: number; lon: number } {
  return {
    lat: nav.sigmaLat / 60,
    lon: nav.sigmaLon / 60 / Math.max(cosd(nav.estimated.lat), 0.2),
  };
}

export { METRES_PER_DEG_LAT, metresPerDegLon };
