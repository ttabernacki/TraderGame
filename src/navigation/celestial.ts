import { DEG, RAD, acosd, asind, atan2d, clamp, cosd, sind, wrap360 } from '../core/math';
import { daysFromEpoch } from '../core/clock';

export interface Star {
  name: string;
  /** Right ascension at J2000, in hours. */
  ra: number;
  /** Declination at J2000, in degrees. */
  dec: number;
  mag: number;
  /** Constellation or asterism the star belongs to, for the sky view. */
  group?: string;
}

/**
 * The navigational stars, at J2000. Precession is applied for the campaign
 * epoch below, which matters: over five centuries the sky moves enough that
 * Polaris in 1500 stood three and a half degrees off the pole and circled it.
 */
export const STARS: Star[] = [
  { name: 'Sirius', ra: 6.752, dec: -16.716, mag: -1.46, group: 'Canis Maior' },
  { name: 'Canopus', ra: 6.399, dec: -52.696, mag: -0.72, group: 'Argo' },
  { name: 'Arcturus', ra: 14.261, dec: 19.182, mag: -0.05, group: 'Boötes' },
  { name: 'Rigil Kentaurus', ra: 14.660, dec: -60.834, mag: -0.27, group: 'Centaurus' },
  { name: 'Vega', ra: 18.615, dec: 38.784, mag: 0.03, group: 'Lyra' },
  { name: 'Capella', ra: 5.278, dec: 45.998, mag: 0.08, group: 'Auriga' },
  { name: 'Rigel', ra: 5.242, dec: -8.202, mag: 0.12, group: 'Orion' },
  { name: 'Procyon', ra: 7.655, dec: 5.225, mag: 0.34, group: 'Canis Minor' },
  { name: 'Achernar', ra: 1.629, dec: -57.237, mag: 0.46, group: 'Eridanus' },
  { name: 'Betelgeuse', ra: 5.919, dec: 7.407, mag: 0.50, group: 'Orion' },
  { name: 'Hadar', ra: 14.064, dec: -60.373, mag: 0.61, group: 'Centaurus' },
  { name: 'Altair', ra: 19.846, dec: 8.868, mag: 0.77, group: 'Aquila' },
  { name: 'Acrux', ra: 12.443, dec: -63.099, mag: 0.77, group: 'Cruzeiro do Sul' },
  { name: 'Aldebaran', ra: 4.599, dec: 16.509, mag: 0.85, group: 'Taurus' },
  { name: 'Antares', ra: 16.490, dec: -26.432, mag: 0.96, group: 'Scorpius' },
  { name: 'Spica', ra: 13.420, dec: -11.161, mag: 0.97, group: 'Virgo' },
  { name: 'Pollux', ra: 7.755, dec: 28.026, mag: 1.14, group: 'Gemini' },
  { name: 'Fomalhaut', ra: 22.961, dec: -29.622, mag: 1.16, group: 'Piscis Austrinus' },
  { name: 'Deneb', ra: 20.690, dec: 45.280, mag: 1.25, group: 'Cygnus' },
  { name: 'Mimosa', ra: 12.795, dec: -59.689, mag: 1.25, group: 'Cruzeiro do Sul' },
  { name: 'Regulus', ra: 10.140, dec: 11.967, mag: 1.35, group: 'Leo' },
  { name: 'Adhara', ra: 6.977, dec: -28.972, mag: 1.50, group: 'Canis Maior' },
  { name: 'Castor', ra: 7.577, dec: 31.888, mag: 1.58, group: 'Gemini' },
  { name: 'Shaula', ra: 17.560, dec: -37.104, mag: 1.62, group: 'Scorpius' },
  { name: 'Gacrux', ra: 12.519, dec: -57.113, mag: 1.63, group: 'Cruzeiro do Sul' },
  { name: 'Bellatrix', ra: 5.418, dec: 6.350, mag: 1.64, group: 'Orion' },
  { name: 'Elnath', ra: 5.438, dec: 28.608, mag: 1.65, group: 'Taurus' },
  { name: 'Miaplacidus', ra: 9.220, dec: -69.717, mag: 1.68, group: 'Argo' },
  { name: 'Alnilam', ra: 5.604, dec: -1.202, mag: 1.69, group: 'Orion' },
  { name: 'Alnair', ra: 22.137, dec: -46.961, mag: 1.74, group: 'Grus' },
  { name: 'Alnitak', ra: 5.679, dec: -1.943, mag: 1.77, group: 'Orion' },
  { name: 'Alioth', ra: 12.900, dec: 55.960, mag: 1.77, group: 'Carro' },
  { name: 'Dubhe', ra: 11.062, dec: 61.751, mag: 1.79, group: 'Carro' },
  { name: 'Mirfak', ra: 3.405, dec: 49.861, mag: 1.79, group: 'Perseus' },
  { name: 'Wezen', ra: 7.140, dec: -26.393, mag: 1.84, group: 'Canis Maior' },
  { name: 'Kaus Australis', ra: 18.403, dec: -34.385, mag: 1.85, group: 'Sagittarius' },
  { name: 'Avior', ra: 8.375, dec: -59.510, mag: 1.86, group: 'Argo' },
  { name: 'Alkaid', ra: 13.792, dec: 49.313, mag: 1.86, group: 'Carro' },
  { name: 'Sargas', ra: 17.622, dec: -42.998, mag: 1.87, group: 'Scorpius' },
  { name: 'Menkalinan', ra: 5.995, dec: 44.947, mag: 1.90, group: 'Auriga' },
  { name: 'Atria', ra: 16.811, dec: -69.028, mag: 1.91, group: 'Triangulum Australe' },
  { name: 'Alhena', ra: 6.629, dec: 16.399, mag: 1.93, group: 'Gemini' },
  { name: 'Peacock', ra: 20.427, dec: -56.735, mag: 1.94, group: 'Pavo' },
  { name: 'Polaris', ra: 2.530, dec: 89.264, mag: 1.98, group: 'Ursa Minor' },
  { name: 'Mirzam', ra: 6.378, dec: -17.956, mag: 1.98, group: 'Canis Maior' },
  { name: 'Alphard', ra: 9.460, dec: -8.659, mag: 1.98, group: 'Hydra' },
  { name: 'Hamal', ra: 2.119, dec: 23.462, mag: 2.00, group: 'Aries' },
  { name: 'Diphda', ra: 0.726, dec: -17.987, mag: 2.04, group: 'Cetus' },
  { name: 'Nunki', ra: 18.921, dec: -26.297, mag: 2.05, group: 'Sagittarius' },
  { name: 'Menkent', ra: 14.111, dec: -36.370, mag: 2.06, group: 'Centaurus' },
  { name: 'Alpheratz', ra: 0.140, dec: 29.091, mag: 2.06, group: 'Pegasus' },
  { name: 'Mirach', ra: 1.162, dec: 35.621, mag: 2.06, group: 'Andromeda' },
  { name: 'Kochab', ra: 14.845, dec: 74.156, mag: 2.08, group: 'Guardas' },
  { name: 'Pherkad', ra: 15.345, dec: 71.834, mag: 3.05, group: 'Guardas' },
  { name: 'Rasalhague', ra: 17.582, dec: 12.560, mag: 2.08, group: 'Ophiuchus' },
  { name: 'Algol', ra: 3.136, dec: 40.956, mag: 2.09, group: 'Perseus' },
  { name: 'Almach', ra: 2.065, dec: 42.330, mag: 2.10, group: 'Andromeda' },
  { name: 'Denebola', ra: 11.818, dec: 14.572, mag: 2.11, group: 'Leo' },
  { name: 'Navi', ra: 0.945, dec: 60.717, mag: 2.15, group: 'Cassiopeia' },
  { name: 'Muhlifain', ra: 12.692, dec: -48.960, mag: 2.20, group: 'Centaurus' },
  { name: 'Naos', ra: 8.060, dec: -40.003, mag: 2.21, group: 'Argo' },
  { name: 'Aspidiske', ra: 9.285, dec: -59.275, mag: 2.21, group: 'Argo' },
  { name: 'Suhail', ra: 9.133, dec: -43.433, mag: 2.21, group: 'Argo' },
  { name: 'Alphecca', ra: 15.578, dec: 26.715, mag: 2.22, group: 'Corona' },
  { name: 'Mizar', ra: 13.399, dec: 54.925, mag: 2.23, group: 'Carro' },
  { name: 'Sadr', ra: 20.371, dec: 40.257, mag: 2.23, group: 'Cygnus' },
  { name: 'Eltanin', ra: 17.943, dec: 51.489, mag: 2.23, group: 'Draco' },
  { name: 'Mintaka', ra: 5.533, dec: -0.299, mag: 2.23, group: 'Orion' },
  { name: 'Schedar', ra: 0.675, dec: 56.537, mag: 2.24, group: 'Cassiopeia' },
  { name: 'Caph', ra: 0.153, dec: 59.150, mag: 2.27, group: 'Cassiopeia' },
  { name: 'Dschubba', ra: 16.005, dec: -22.622, mag: 2.29, group: 'Scorpius' },
  { name: 'Larawag', ra: 16.836, dec: -34.293, mag: 2.29, group: 'Scorpius' },
  { name: 'Merak', ra: 11.031, dec: 56.382, mag: 2.37, group: 'Carro' },
  { name: 'Izar', ra: 14.750, dec: 27.074, mag: 2.37, group: 'Boötes' },
  { name: 'Enif', ra: 21.736, dec: 9.875, mag: 2.38, group: 'Pegasus' },
  { name: 'Girtab', ra: 17.708, dec: -39.030, mag: 2.39, group: 'Scorpius' },
  { name: 'Ankaa', ra: 0.438, dec: -42.306, mag: 2.40, group: 'Phoenix' },
  { name: 'Phecda', ra: 11.897, dec: 53.695, mag: 2.44, group: 'Carro' },
  { name: 'Sabik', ra: 17.173, dec: -15.725, mag: 2.43, group: 'Ophiuchus' },
  { name: 'Scheat', ra: 23.063, dec: 28.083, mag: 2.44, group: 'Pegasus' },
  { name: 'Alderamin', ra: 21.310, dec: 62.586, mag: 2.45, group: 'Cepheus' },
  { name: 'Aludra', ra: 7.402, dec: -29.303, mag: 2.45, group: 'Canis Maior' },
  { name: 'Markab', ra: 23.079, dec: 15.205, mag: 2.49, group: 'Pegasus' },
  { name: 'Gienah', ra: 12.263, dec: -17.542, mag: 2.58, group: 'Corvus' },
  { name: 'Zubeneschamali', ra: 15.283, dec: -9.383, mag: 2.61, group: 'Libra' },
  { name: 'Unukalhai', ra: 15.738, dec: 6.426, mag: 2.63, group: 'Serpens' },
  { name: 'Sheratan', ra: 1.911, dec: 20.808, mag: 2.64, group: 'Aries' },
  { name: 'Phact', ra: 5.661, dec: -34.074, mag: 2.65, group: 'Columba' },
  { name: 'Kaus Media', ra: 18.350, dec: -29.828, mag: 2.70, group: 'Sagittarius' },
  { name: 'Nihal', ra: 5.470, dec: -20.759, mag: 2.81, group: 'Lepus' },
  { name: 'Rasalgethi', ra: 17.244, dec: 14.390, mag: 3.35, group: 'Hercules' },
];

const J2000_DAYS = daysFromEpoch(2000, 1, 1);

/**
 * Precess a star to the campaign epoch. Five centuries is enough to move the
 * sky visibly, and the whole Polaris problem depends on getting this right.
 */
export function precess(star: Star, year: number): { ra: number; dec: number } {
  const T = year - 2000;
  const raDeg = star.ra * 15;
  const dRaSec = (3.075 + 1.336 * sind(raDeg) * Math.tan(clamp(star.dec, -88, 88) * DEG)) * T;
  const dDecArcsec = 20.04 * cosd(raDeg) * T;
  return {
    ra: (star.ra + dRaSec / 3600 + 24) % 24,
    dec: clamp(star.dec + dDecArcsec / 3600, -90, 90),
  };
}

/** Greenwich mean sidereal time in hours. */
export function gmst(dayFromEpoch: number, hourUT: number): number {
  const d = dayFromEpoch - J2000_DAYS + (hourUT - 12) / 24;
  return ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
}

/** Local sidereal time in hours. */
export function lst(dayFromEpoch: number, hourUT: number, lon: number): number {
  return ((gmst(dayFromEpoch, hourUT) + lon / 15) % 24 + 24) % 24;
}

/**
 * Apparent solar declination in degrees. Positive in the northern summer.
 *
 * This single number is the whole basis of finding a latitude by the sun, and
 * the tables of it that the Portuguese carried were a state secret.
 */
export function solarDeclination(dayOfYear: number): number {
  const orbit = (360 / 365.24) * (dayOfYear + 10);
  const equationOfCentre = 1.914 * sind((360 / 365.24) * (dayOfYear - 2));
  return asind(sind(-23.44) * cosd(orbit + equationOfCentre));
}

/** Equation of time in minutes: apparent solar time minus mean solar time. */
export function equationOfTime(dayOfYear: number): number {
  const b = (2 * Math.PI * (dayOfYear - 81)) / 364;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

export interface Horizontal {
  altitude: number;
  azimuth: number;
}

function toHorizontal(hourAngleDeg: number, dec: number, lat: number): Horizontal {
  const sinAlt = sind(lat) * sind(dec) + cosd(lat) * cosd(dec) * cosd(hourAngleDeg);
  const altitude = asind(sinAlt);
  const cosAz = (sind(dec) - sind(altitude) * sind(lat)) / (cosd(altitude) * cosd(lat) + 1e-9);
  let azimuth = acosd(cosAz);
  if (sind(hourAngleDeg) > 0) azimuth = 360 - azimuth;
  return { altitude, azimuth: wrap360(azimuth) };
}

/** Where the sun stands, given the true position and time. */
export function sunPosition(
  lat: number, lon: number, _dayFromEpoch: number, hourLocal: number, dayOfYear: number,
): Horizontal {
  // Local mean time is what the ship's sandglass keeps; convert to a real hour
  // angle through the longitude and the equation of time.
  const hourUT = hourLocal - lon / 15;
  const dec = solarDeclination(dayOfYear);
  const eot = equationOfTime(dayOfYear) / 60;
  const localApparent = hourUT + lon / 15 + eot;
  const hourAngle = (localApparent - 12) * 15;
  return toHorizontal(hourAngle, dec, lat);
}

/** Where a star stands. */
export function starPosition(
  star: Star, lat: number, lon: number, dayFromEpoch: number, hourLocal: number, year: number,
): Horizontal {
  const p = precess(star, year);
  const hourUT = hourLocal - lon / 15;
  const localSidereal = lst(dayFromEpoch, hourUT, lon);
  const hourAngle = (localSidereal - p.ra) * 15;
  return toHorizontal(hourAngle, p.dec, lat);
}

/** The moon, good enough for lighting the sea and nothing else. */
export function moonPosition(
  lat: number, lon: number, dayFromEpoch: number, hourLocal: number,
): Horizontal & { phase: number } {
  const d = dayFromEpoch - J2000_DAYS + (hourLocal - lon / 15) / 24;
  const meanLon = wrap360(218.316 + 13.176396 * d);
  const meanAnom = wrap360(134.963 + 13.064993 * d);
  const meanDist = wrap360(93.272 + 13.229350 * d);
  const eclLon = meanLon + 6.289 * sind(meanAnom);
  const eclLat = 5.128 * sind(meanDist);
  const obl = 23.44;
  const dec = asind(sind(eclLat) * cosd(obl) + cosd(eclLat) * sind(obl) * sind(eclLon));
  const ra = atan2d(
    sind(eclLon) * cosd(obl) - Math.tan(eclLat * DEG) * sind(obl),
    cosd(eclLon),
  ) / 15;
  const localSidereal = lst(dayFromEpoch, hourLocal - lon / 15, lon);
  const hourAngle = (localSidereal - ((ra % 24) + 24) % 24) * 15;
  const h = toHorizontal(hourAngle, dec, lat);
  const sunLon = wrap360(280.46 + 0.9856474 * d);
  const phase = (1 - cosd(wrap360(eclLon - sunLon))) / 2;
  return { ...h, phase };
}

/**
 * Polaris in this era does not sit on the pole. It circles it at a radius that
 * shrinks century by century, so its altitude is only your latitude twice a
 * night. The Regimento do Norte gave a correction keyed to the position of the
 * Guards — the two bright stars of the Little Bear — and a navigator who cannot
 * read the Guards will be wrong by up to three and a half degrees, which is two
 * hundred nautical miles.
 */
export function polarisOffset(year: number): number {
  const p = precess(STARS.find((s) => s.name === 'Polaris')!, year);
  return 90 - p.dec;
}

export interface PolarisSight {
  /** The raw altitude a navigator would measure. */
  altitude: number;
  /** Correction to apply to reach latitude, degrees. */
  correction: number;
  /** Clock position of the Guards, 0-11, as the regimento describes it. */
  guardHour: number;
  /** False once Polaris drops below the horizon. */
  visible: boolean;
}

export function polarisSight(
  lat: number, lon: number, dayFromEpoch: number, hourLocal: number, year: number,
): PolarisSight {
  const polaris = STARS.find((s) => s.name === 'Polaris')!;
  const h = starPosition(polaris, lat, lon, dayFromEpoch, hourLocal, year);
  const kochab = STARS.find((s) => s.name === 'Kochab')!;
  const kp = precess(kochab, year);
  const localSidereal = lst(dayFromEpoch, hourLocal - lon / 15, lon);
  const guardAngle = wrap360((localSidereal - kp.ra) * 15);
  return {
    altitude: h.altitude,
    correction: lat - h.altitude,
    guardHour: Math.round(guardAngle / 30) % 12,
    visible: h.altitude > 0.5,
  };
}

/**
 * Latitude from a meridian altitude of the sun. The navigator must know whether
 * the sun bore north or south of him at noon, which is the part that catches
 * people out on the equator.
 */
export function latitudeFromNoonSun(altitude: number, declination: number, sunBoreSouth: boolean): number {
  const zenith = 90 - altitude;
  return sunBoreSouth ? declination + zenith : declination - zenith;
}

/** Latitude from any star on the meridian. */
export function latitudeFromMeridianStar(altitude: number, dec: number, boreSouth: boolean): number {
  const zenith = 90 - altitude;
  return boreSouth ? dec + zenith : dec - zenith;
}

/** Local apparent time from the sun's hour angle. Longitude remains unknowable. */
export function localApparentTime(sunAltitude: number, azimuth: number, lat: number, dec: number): number {
  const cosH = (sind(sunAltitude) - sind(lat) * sind(dec)) / (cosd(lat) * cosd(dec) + 1e-9);
  const H = acosd(cosH);
  const signed = azimuth > 180 ? -H : H;
  return 12 + signed / 15;
}

/** Time of sunrise and sunset in local apparent hours. */
export function daylight(lat: number, dayOfYear: number): { rise: number; set: number; length: number } {
  const dec = solarDeclination(dayOfYear);
  const cosH = -Math.tan(lat * DEG) * Math.tan(dec * DEG);
  if (cosH <= -1) return { rise: 0, set: 24, length: 24 };
  if (cosH >= 1) return { rise: 12, set: 12, length: 0 };
  const H = acosd(cosH) / 15;
  return { rise: 12 - H, set: 12 + H, length: 2 * H };
}

/**
 * Magnetic variation. There were no reliable charts of it in this period, and
 * it is the single largest hidden error in a compass course. This is a coarse
 * dipole-plus-anomaly model, which is roughly what the real field looked like
 * across the Atlantic and Indian Oceans around 1500.
 */
export function magneticVariation(lat: number, lon: number): number {
  const dipole = 12 * sind(lon + 20) * cosd(lat * 0.65);
  const atlantic = -9 * Math.exp(-(((lon + 30) / 34) ** 2)) * cosd(lat * 0.9);
  const african = 6 * Math.exp(-(((lon - 18) / 26) ** 2)) * sind(lat * 1.1);
  const indian = 5 * Math.exp(-(((lon - 72) / 30) ** 2)) * sind((lat - 6) * 1.2);
  return clamp(dipole + atlantic + african + indian, -32, 32);
}

export { RAD };
