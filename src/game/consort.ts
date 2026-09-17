import {
  NM, bearingTo, clamp, haversine, rhumbStep, wrap180, wrap360, type LatLon,
} from '../core/math';
import { isLand, nearestShore } from '../world/landmass';
import { polarAt } from '../ship/polars';
import { hullClass } from '../ship/hull';
import { anchorageOf, portDef } from '../world/ports';
import type { Rng } from '../core/rng';
import type { Game } from './state';
import { bestCourse } from './encounter';

/**
 * The consort.
 *
 * Nobody sailed this route alone. Gama had four sail, Cabral thirteen, Dias two
 * and a store-ship, and the reason is not redundancy in the modern sense — it is
 * that a ship on this coast could not be recovered by anybody but her consort.
 * If you lost your rudder off the Cape there was no second chance and no port to
 * limp to; there was another Portuguese hull within signalling distance, or
 * there was nothing. The whole enterprise was built on that arrangement, and a
 * game about the carreira in which the player is always the only ship on the
 * water has quietly removed the thing the period was organised around.
 *
 * So: a second ship, under your orders, sailed by the same polars as yours and
 * as subject to the weather. She is not a follower that teleports along behind.
 * She has a hull, which is slower or faster than yours on different points of
 * sail; a captain, who has opinions; a crew who eat; and cargo, which is really
 * lost when she is. Keeping company with her costs you speed, because the fleet
 * goes at the pace of the slowest ship and that is the oldest complaint in the
 * service. Letting her out of sight is how you lose her.
 *
 * Everything interesting about her comes from that tension. A player who orders
 * her to keep close station will make a slower passage than he would alone. A
 * player who lets her range ahead will find things sooner and will sometimes
 * find them without her.
 */

/** What she has been told to do. */
export type Station =
  /** In company, within signalling distance, matching your pace. */
  | 'company'
  /** Ranging ahead and to windward, looking. Out of signal much of the time. */
  | 'scout'
  /** Sent to a port, to wait there or to carry the cargo home. */
  | 'detached'
  /** Brought to, alongside, for the boats to pass between. */
  | 'alongside';

export type CaptainTemper =
  /** Does exactly what he is told, including when it is wrong. */
  | 'obedient'
  /** Keeps his station in anything. The one you want off a lee shore. */
  | 'seamanlike'
  /** Presses on. Will range further than ordered and find things first. */
  | 'bold'
  /** Thinks he should have had your commission, and is not subtle about it. */
  | 'rival'
  /** Frightened of the southern ocean and of you, in that order. */
  | 'timid';

export const TEMPERS: Record<CaptainTemper, {
  label: string;
  line: string;
  /** How far past his orders he will range, as a multiplier on the station. */
  range: number;
  /** Chance a day that he does something you did not order. */
  wilful: number;
  /** How well he handles her, 0-1, which is speed and damage both. */
  skill: number;
}> = {
  obedient: {
    label: 'Obedient', range: 1, wilful: 0.01, skill: 0.5,
    line: 'Does what the signal says and nothing else, which is restful and is '
      + 'occasionally the wrong thing done promptly.',
  },
  seamanlike: {
    label: 'Seamanlike', range: 1, wilful: 0.02, skill: 0.85,
    line: 'Has been doing this since before you had a ship. Keeps his station in '
      + 'weather that would scatter a fleet.',
  },
  bold: {
    label: 'Bold', range: 1.6, wilful: 0.12, skill: 0.7,
    line: 'Ranges further than he is told and sees more than you do. One day he '
      + 'will not come back from it.',
  },
  rival: {
    label: 'Ambitious', range: 1.35, wilful: 0.16, skill: 0.75,
    line: 'Believes the commission should have been his, and is keeping his own '
      + 'reckoning against yours to prove it.',
  },
  timid: {
    label: 'Cautious', range: 0.7, wilful: 0.08, skill: 0.45,
    line: 'Hauls off the land at the first cast of the lead and has to be called '
      + 'back. He will still be afloat when better men are not.',
  },
};

export interface Consort {
  name: string;
  hullId: string;
  captain: string;
  temper: CaptainTemper;
  pos: LatLon;
  heading: number;
  speedKnots: number;
  /** 0-1. Below about 0.35 she is in real trouble. */
  condition: number;
  crew: number;
  /** Tons of the lading she is carrying, which is lost with her. */
  cargoTons: number;
  /** Days of water aboard her. */
  water: number;
  station: Station;
  /** Miles she is ordered to keep, for `company` and `scout`. */
  offingNm: number;
  /** Where she was sent, for `detached`. */
  boundFor?: string;
  /** Simulated seconds she is due back, for `detached`. */
  dueBack?: number;
  /** True while she is out of sight and unaccounted for. */
  lost: boolean;
  /** How long she has been out of sight, in simulated seconds. */
  missingSince?: number;
  /** His opinion of you, 0-1. Decides whether he obeys when it is hard. */
  regard: number;
}

/** How far a signal carries, which is what "in company" actually means. */
export function signalRangeNm(g: Game): number {
  // Flags by day at about four miles; a gun and a light further, but not much.
  // Weather closes it right down, which is exactly when it matters.
  const vis = g.weatherNow.visibility;
  const night = g.clock.hour < 5.5 || g.clock.hour > 19;
  return clamp(Math.min(vis, night ? 3 : 7), 0.5, 7);
}

/** The station she is trying to hold, in miles, given her orders. */
export function orderedOffing(c: Consort): number {
  switch (c.station) {
    case 'alongside': return 0.15;
    case 'company': return clamp(c.offingNm, 0.3, 6);
    case 'scout': return clamp(c.offingNm, 4, 40) * TEMPERS[c.temper].range;
    default: return 0;
  }
}

/**
 * Sail her.
 *
 * She is steered by the same `bestCourse` the strange sail is chased with, at
 * an aim point derived from her station rather than from a chase — but the
 * important part is what she does when she *cannot* hold it. A consort to
 * windward of you in a blow cannot simply be commanded into position; she can
 * only sail the courses her hull allows, and if the fleet's two hulls disagree
 * about what those are, the fleet comes apart. That is not a failure of this
 * function. That is the thing being modelled.
 */
export function sailConsort(g: Game, c: Consort, dt: number): void {
  if (c.station === 'detached') { sailDetached(g, c, dt); return; }

  const w = g.weatherNow.wind;
  const me = g.ship.state.pos;
  const want = orderedOffing(c);

  // Where she is trying to be: on the quarter for company, up to windward and
  // ahead for a scout. Station is kept relative to the flagship's head, so the
  // fleet turns together instead of her cutting across your bow.
  const bearingOfStation = c.station === 'scout'
    ? wrap360(g.ship.state.heading - 25 * Math.sign(wrap180(w.from - g.ship.state.heading) || 1))
    : wrap360(g.ship.state.heading + 150);
  const stationPoint = rhumbStep(me, bearingOfStation, want * NM);

  const toStation = bearingTo(c.pos, stationPoint);
  const offNm = haversine(c.pos, stationPoint) / NM;

  // Close it if she is out of position, otherwise match the flagship's course.
  // The tolerance is what stops her sawing at the helm for ever over a cable's
  // length, which is the same lesson the coast-following order had to learn.
  const slack = Math.max(0.4, want * 0.25);
  const aim = offNm > slack ? toStation : g.ship.state.heading;

  const skill = TEMPERS[c.temper].skill * (0.6 + c.regard * 0.4);
  const best = bestCourse(c.hullId, w.from, w.speed, aim);
  c.heading = turnToward(c.heading, best.heading, dt, c.hullId);

  // What she can do, and what she chooses to do, are different numbers.
  //
  // The first version had one: her polar speed times a handling penalty and a
  // damage penalty, both always below one. That quietly made station-keeping
  // impossible — an identical hull under a consort was permanently three per
  // cent slower than the flagship, so the gap grew without bound and a ship
  // ordered to keep a mile was measured holding forty. The error was modelling
  // a fleet as two ships sailing independently. A fleet is not that.
  //
  // What actually happens is that the ship astern of her station crowds sail
  // and the ship in station shortens to match her leader, which is why a
  // convoy makes the speed of its slowest member and not less. So: pressing,
  // she gets everything her hull and her damage allow; in station, she matches
  // the flagship and no more. A consort who genuinely cannot keep up then
  // falls behind for a real reason — her hull, or the damage in her — and that
  // is the case the player is asked about.
  const potential = polarAt(c.hullId, w.speed, Math.abs(wrap180(w.from - c.heading)))
    * (0.45 + c.condition * 0.55);
  c.speedKnots = offNm > slack
    ? potential * (0.88 + skill * 0.12)
    : Math.min(potential * (0.78 + skill * 0.22), Math.max(g.physics.speedKnots, 0));

  // She will not sail herself ashore.
  const next = rhumbStep(c.pos, c.heading, c.speedKnots * NM * (dt / 3600));
  if (isLand(next) || nearestShore(next, 8).distance / NM < 0.4) {
    c.heading = wrap360(c.heading + 40);
    return;
  }
  c.pos = next;
}

/** Detached: she is making her own passage to a port, out of the player's hands. */
function sailDetached(g: Game, c: Consort, dt: number): void {
  if (!c.boundFor) return;
  const w = g.weatherNow.wind;
  const to = anchorageOf(portDef(c.boundFor));
  const best = bestCourse(c.hullId, w.from, w.speed, bearingTo(c.pos, to));
  c.heading = turnToward(c.heading, best.heading, dt, c.hullId);
  c.speedKnots = polarAt(c.hullId, w.speed, Math.abs(wrap180(w.from - c.heading)))
    * (0.78 + TEMPERS[c.temper].skill * 0.22) * (0.45 + c.condition * 0.55);
  const next = rhumbStep(c.pos, c.heading, c.speedKnots * NM * (dt / 3600));
  if (isLand(next)) { c.heading = wrap360(c.heading + 40); return; }
  c.pos = next;
}

/** She comes round at a rate her hull allows, not instantly. */
function turnToward(from: number, to: number, dt: number, hullId: string): number {
  const rate = 4 + hullClass(hullId).handiness * 10;
  const max = rate * (dt / 60);
  const d = wrap180(to - from);
  return wrap360(from + clamp(d, -max, max));
}

// ---------------------------------------------------------------------------
// Where she is, in words
// ---------------------------------------------------------------------------

export interface ConsortReport {
  inSight: boolean;
  distNm: number;
  bearing: number;
  /** One line for the head-up display. */
  line: string;
  /** What her captain would say if you could hear him. */
  state: string;
  worrying: boolean;
}

export function consortReport(g: Game, c: Consort): ConsortReport {
  const distNm = haversine(g.ship.state.pos, c.pos) / NM;
  const bearing = bearingTo(g.ship.state.pos, c.pos);
  const range = signalRangeNm(g);
  const inSight = distNm <= Math.max(range, 12) && !c.lost;

  if (c.station === 'detached') {
    return {
      inSight: false, distNm, bearing, worrying: false,
      line: `${c.name} — detached for ${portDef(c.boundFor ?? 'lisboa').name}`,
      state: `She parted company and is making her own passage. Nothing more will be `
        + 'heard of her until she is reported in.',
    };
  }
  if (c.lost) {
    return {
      inSight: false, distNm, bearing, worrying: true,
      line: `${c.name} — not in sight`,
      state: 'She is not in sight and has not been since the weather came on. She may be '
        + 'anywhere within a day\'s sail, and she may be looking for you.',
    };
  }

  const cond = c.condition > 0.8 ? 'sound'
    : c.condition > 0.55 ? 'making some water'
      : c.condition > 0.35 ? 'in a bad way' : 'barely swimming';
  return {
    inSight,
    distNm,
    bearing,
    worrying: c.condition < 0.5 || distNm > range * 1.5 || c.water < 12,
    line: `${c.name} — ${distNm < 0.7 ? 'alongside' : `${distNm.toFixed(1)} miles`}`
      + `, ${cond}`,
    state: distNm > range
      ? `She is ${distNm.toFixed(0)} miles off — beyond signalling. `
        + `${c.captain} is on his own judgement until she closes.`
      : `In company at ${distNm.toFixed(1)} miles, ${cond}. ${c.crew} aboard, `
        + `${c.water.toFixed(0)} days of water.`,
  };
}

// ---------------------------------------------------------------------------
// Getting one
// ---------------------------------------------------------------------------

const SHIP_NAMES = [
  'São Gabriel', 'São Rafael', 'Bérrio', 'São Cristóvão', 'São Pantaleão',
  'Santa Clara', 'Espírito Santo', 'São Miguel', 'Anunciada', 'São Jorge',
  'Flor de la Mar', 'Santiago', 'Nossa Senhora da Ajuda',
];

const CAPTAIN_NAMES = [
  'Nicolau Coelho', 'Paulo da Gama', 'Gonçalo Álvares', 'Pero de Ataíde',
  'Sancho de Tovar', 'Diogo Dias', 'Vasco de Ataíde', 'Aires Gomes',
  'Simão de Miranda', 'Nuno Leitão', 'Duarte Pacheco', 'Fernão Soares',
];

/** A ship and a man to command her, for the Crown to give you or for you to hire. */
export function makeConsort(rng: Rng, hullId: string, at: LatLon, heading: number): Consort {
  const tempers: CaptainTemper[] = ['obedient', 'seamanlike', 'bold', 'rival', 'timid'];
  const hull = hullClass(hullId);
  return {
    name: rng.pick(SHIP_NAMES),
    hullId,
    captain: rng.pick(CAPTAIN_NAMES),
    temper: rng.pick(tempers),
    pos: { ...at },
    heading,
    speedKnots: 0,
    condition: clamp(0.82 + rng.normal(0, 0.08), 0.5, 1),
    crew: Math.round(hull.crewFull * (0.8 + rng.next() * 0.2)),
    cargoTons: 0,
    water: 120,
    station: 'company',
    offingNm: 1.2,
    lost: false,
    // He does not know you yet. What he thinks of you is earned at sea.
    regard: clamp(0.5 + rng.normal(0, 0.1), 0.25, 0.75),
  };
}
