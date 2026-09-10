export interface AltitudeInstrument {
  id: string;
  name: string;
  english: string;
  /** One-sigma error in degrees on a steady deck. */
  baseError: number;
  /** How badly a seaway degrades it, 0-1. Big instruments swing more. */
  motionSensitivity: number;
  /** Can it be used on the sun without blinding the observer? */
  solarSafe: boolean;
  cost: number;
  standing: number;
  blurb: string;
}

export const ALTITUDE_INSTRUMENTS: AltitudeInstrument[] = [
  {
    id: 'quadrante', name: 'Quadrante', english: 'Mariner\'s quadrant',
    baseError: 1.1, motionSensitivity: 0.95, solarSafe: false, cost: 0, standing: 0,
    blurb: 'A quarter circle with a plumb line. On land it is accurate to a fraction of a degree; on a pitching deck the plumb bob swings and you are guessing.',
  },
  {
    id: 'astrolabio', name: 'Astrolábio náutico', english: 'Mariner\'s astrolabe',
    baseError: 0.85, motionSensitivity: 0.7, solarSafe: true, cost: 90, standing: 10,
    blurb: 'A heavy brass ring cut away to spill the wind, hung from the thumb. Three men are wanted: one to hold, one to sight, one to read.',
  },
  {
    id: 'balestilha', name: 'Balestilha', english: 'Cross-staff',
    baseError: 0.5, motionSensitivity: 0.5, solarSafe: false, cost: 140, standing: 40,
    blurb: 'Slide the cross until it spans horizon and star together. Quick, accurate, and it will ruin your eyes if you point it at the sun for twenty years.',
  },
  {
    id: 'balestilha-sombra', name: 'Balestilha de sombra', english: 'Back-staff',
    baseError: 0.26, motionSensitivity: 0.38, solarSafe: true, cost: 340, standing: 120,
    blurb: 'You stand with your back to the sun and bring its shadow down to the horizon. Safe for the eyes and steadier in a seaway.',
  },
  {
    id: 'sextante', name: 'Sextante', english: 'Sextant',
    baseError: 0.06, motionSensitivity: 0.16, solarSafe: true, cost: 1400, standing: 420,
    blurb: 'Mirrors bring the body down to the horizon and hold it there however the ship rolls. A device a century ahead of its time, and worth a small estate.',
  },
];

export const INSTRUMENT_BY_ID = new Map(ALTITUDE_INSTRUMENTS.map((i) => [i.id, i]));

export interface SpeedInstrument {
  id: string;
  name: string;
  english: string;
  /** Multiplicative one-sigma error on speed through the water. */
  error: number;
  cost: number;
  standing: number;
  blurb: string;
}

export const SPEED_INSTRUMENTS: SpeedInstrument[] = [
  {
    id: 'olho', name: 'Estimativa', english: 'Judgement by eye',
    error: 0.16, cost: 0, standing: 0,
    blurb: 'The pilot watches the water go by and names a figure. He is usually optimistic.',
  },
  {
    id: 'holandes', name: 'Barquinha holandesa', english: 'Dutchman\'s log',
    error: 0.09, cost: 25, standing: 5,
    blurb: 'Throw a chip in at the bow, walk aft, count. Crude, but it is a measurement rather than an opinion.',
  },
  {
    id: 'barquinha', name: 'Barquinha e ampulheta', english: 'Chip log and glass',
    error: 0.045, cost: 110, standing: 45,
    blurb: 'A weighted board on a line knotted at even intervals, streamed against a running sandglass. Count the knots that go out and you have your speed.',
  },
];

export const SPEED_BY_ID = new Map(SPEED_INSTRUMENTS.map((i) => [i.id, i]));

export interface Almanac {
  id: string;
  name: string;
  /** Residual error in the declination tables, degrees. */
  declinationError: number;
  /** Whether the tables extend south of the equator. */
  southern: boolean;
  cost: number;
  standing: number;
  blurb: string;
}

/**
 * Without tables, an altitude is only a number. The Portuguese solar tables were
 * a state secret and the reason a pilot could find his latitude off Guinea when
 * nobody else could.
 */
export const ALMANACS: Almanac[] = [
  {
    id: 'nenhum', name: 'No tables', declinationError: 3.5, southern: false, cost: 0, standing: 0,
    blurb: 'You are working from memory and the rule of thumb. It shows.',
  },
  {
    id: 'regimento-norte', name: 'Regimento do Norte', declinationError: 1.1, southern: false,
    cost: 40, standing: 0,
    blurb: 'The rule of the North Star, with the corrections for the Guards. Useless once the pole star sets.',
  },
  {
    id: 'regimento-sol', name: 'Regimento do Astrolábio e do Quadrante', declinationError: 0.3,
    southern: true, cost: 220, standing: 60,
    blurb: 'Declination tables for every day of the year, computed at Lisbon. The single most valuable object aboard, and it must never leave the ship.',
  },
  {
    id: 'almanach', name: 'Almanach Perpetuum', declinationError: 0.1, southern: true,
    cost: 600, standing: 200,
    blurb: 'Zacuto\'s tables, corrected and extended. Good to a tenth of a degree, which is ten miles of latitude.',
  },
];

export const ALMANAC_BY_ID = new Map(ALMANACS.map((a) => [a.id, a]));

export interface CompassGrade {
  id: string;
  name: string;
  /** One-sigma steering error in degrees. */
  error: number;
  cost: number;
  blurb: string;
}

export const COMPASSES: CompassGrade[] = [
  { id: 'agulha', name: 'Agulha de marear', error: 3.2, cost: 0, blurb: 'A magnetised needle on a card in a wooden bowl. It wanders when she heels.' },
  { id: 'agulha-suspensa', name: 'Agulha suspensa', error: 1.6, cost: 70, blurb: 'Gimballed in a binnacle, so it stays level however she rolls.' },
  { id: 'agulha-fina', name: 'Agulha fina de Flandres', error: 0.8, cost: 260, blurb: 'Flemish work, a finer card and a truer pivot.' },
];

export const COMPASS_BY_ID = new Map(COMPASSES.map((c) => [c.id, c]));

/**
 * Actual one-sigma error of a sight, given the instrument, the state of the sea,
 * the observer, and what is being observed.
 *
 * Calibrated so a novice with a quadrant on a moderate day is out by something
 * like a degree and a half — a hundred miles, which is roughly what these
 * instruments were worth at sea — while an expert with a sextant is good to a
 * few miles.
 */
export function sightError(
  inst: AltitudeInstrument,
  waveHeight: number,
  skill: number,
  isSun: boolean,
): number {
  const motion = 1 + inst.motionSensitivity * Math.min(waveHeight, 8) * 0.30;
  const hand = 1.35 - skill * 0.6;
  const glare = isSun && !inst.solarSafe ? 1.25 : 1;
  return inst.baseError * motion * hand * glare;
}
