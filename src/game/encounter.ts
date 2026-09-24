import { NM, bearingTo, clamp, haversine, rhumbStep, wrap180, wrap360, type LatLon } from '../core/math';
import { PORTS, anchorageOf, portsNear } from '../world/ports';
import { isLand } from '../world/landmass';
import { polarAt, polarNoGo } from '../ship/polars';
import { hullClass } from '../ship/hull';
import type { Rng } from '../core/rng';
import type { Game } from './state';

/**
 * A strange sail.
 *
 * Everything else in this game happens to the ship: the weather, the coast, the
 * men, the office in Lisbon. This is the one thing that happens to her that is
 * *someone else's ship* — another hull, sailed by the same physics, with her
 * own errand and her own opinion about whether she wants to be spoken to.
 *
 * The point of it is not a fight. Almost none of these end in one. The point is
 * that the Atlantic in the 1480s was not empty and was not free: João II had
 * declared the whole Guinea trade a royal monopoly and instructed his captains
 * to throw interlopers into the sea, and the Castilians went anyway, and both
 * crowns knew perfectly well what the other was doing. A sail on the horizon
 * off Mina is a political fact before it is anything else, and what a captain
 * does about it is reported at the Casa.
 *
 * The chase is where the sailing model finally has to be understood rather than
 * merely operated. A caravela latina lies four points off the wind and a nau
 * lies six, and a nau squared away before it is the faster ship — so you escape
 * a carrack by hauling your wind and you escape a caravel by running off, and
 * getting that the wrong way round means she is alongside in three hours. None
 * of that is written on a card anywhere. It is in `polars.ts`, which is the
 * table the integrator produces, which is the same integrator that sails your
 * own ship.
 */

export type Nation = 'portuguese' | 'castilian' | 'genoese' | 'moorish' | 'french';

export type Business =
  /** Honest freight between known ports. */
  | 'trader'
  /** Homeward from Mina with the King's gold aboard. */
  | 'guineaman'
  /** In the monopoly without a licence, and knows it. */
  | 'interloper'
  /** Out of Salé or Larache, and hunting. */
  | 'corsair'
  /** Off the banks, and a long way from anywhere. */
  | 'fisher'
  /** Dismasted, or out of water, or both. */
  | 'distressed';

/** What she means to do about you. */
export type Intent = 'unaware' | 'hold' | 'avoid' | 'close' | 'hunt';

/** What you have told the watch to do about her. */
export type ChaseOrder = 'hold' | 'close' | 'avoid';

/**
 * What a career's worth of meetings at sea came to.
 *
 * Counted because the epilogue is the only place the game ever tells a player
 * what sort of captain he turned out to be, and "took four ships and left one
 * dismasted crew where he found them" is a harder fact about a man than any
 * number of cruzados.
 */
export interface SeaRecord {
  /** Sails raised from the masthead, whatever came of them. */
  sighted: number;
  /** Ships actually spoken. */
  spoken: number;
  /** Ships taken by boarding. */
  prizes: number;
  /** Boardings beaten off. */
  repulsed: number;
  /** Ships in distress helped. */
  succoured: number;
  /** Ships in distress left where they were. */
  abandoned: number;
  /** Times you bought your way out of a corsair. */
  ransoms: number;
}

export function newSeaRecord(): SeaRecord {
  return { sighted: 0, spoken: 0, prizes: 0, repulsed: 0, succoured: 0, abandoned: 0, ransoms: 0 };
}

export interface Stranger {
  hullId: string;
  nation: Nation;
  business: Business;
  /** Her name, once you are near enough to read it off her stern. */
  name: string;
  master: string;
  pos: LatLon;
  heading: number;
  speedKnots: number;
  intent: Intent;
  /** 0 to 1: how much of her the masthead has made out. */
  read: number;
  guns: number;
  hands: number;
  /** Ship-time she was raised. */
  sightedT: number;
  /** Set when the meeting has been played, so it is played once. */
  spoken: boolean;
  /** She has made you out and formed an opinion. */
  awareT: number | null;
  /** She is the other captain's ship. See progression/rivalEvents. */
  rival?: boolean;
  /** A course she is making for on her own account, sailed as well as she can. */
  course?: number;
}

// -----------------------------------------------------------------------------
// Who is where

const SHIP_NAMES: Record<Nation, string[]> = {
  portuguese: ['São Cristóvão', 'Santa Maria da Graça', 'Bérrio', 'São Miguel', 'Espírito Santo',
    'Nossa Senhora da Conceição', 'São Paulo', 'Santa Clara'],
  castilian: ['Niña', 'La Gallega', 'San Sebastián', 'Santa Cruz', 'La Trinidad', 'San Antón'],
  genoese: ['Santa Caterina', 'La Superba', 'San Giorgio', 'La Fortuna'],
  moorish: ['Al-Fath', 'Rih al-Bahr', 'Bab al-Nasr', 'Al-Ghazi'],
  french: ['Marie de Dieppe', 'La Pensée', 'Le Sacre', 'La Bonne Aventure'],
};

const MASTERS: Record<Nation, string[]> = {
  portuguese: ['Fernão Gomes', 'Gonçalo Coelho', 'Rui de Sequeira', 'João Afonso de Aveiro',
    'Pero Escobar', 'Álvaro Esteves'],
  castilian: ['Pedro de Covides', 'Alonso de Palos', 'Diego Sánchez de Cádiz', 'Juan Boscán'],
  genoese: ['Bartolomeo Grimaldi', 'Antonio Doria', 'Nicoloso Spinola'],
  moorish: ['Sidi Muhammad al-Zarruq', 'Ali ben Yusuf', 'Umar al-Tanji'],
  french: ['Jean Cousin', 'Guillaume de Sores', 'Robert Estienne'],
};

export const NATION_NAME: Record<Nation, string> = {
  portuguese: 'Portuguese',
  castilian: 'Castilian',
  genoese: 'Genoese',
  moorish: 'Moorish',
  french: 'French',
};

/** The people id each flag answers to, for the relations they share. */
export const NATION_PEOPLE: Record<Nation, string> = {
  portuguese: 'portuguese',
  castilian: 'castilian',
  genoese: 'castilian',
  moorish: 'moor',
  french: 'castilian',
};

/**
 * How much shipping there is where she is.
 *
 * Trade goes between places, so the water is busy near the places and empty
 * between them, and a hundred miles south of the last of them it is empty in a
 * way no water in Europe has been for a thousand years. This returns roughly
 * "sails per week within sight", which is a number a period seaman would have
 * recognised: two or three a day in the Gulf of Cádiz, one a month off Arguim,
 * and none at all below the frontier.
 */
export function trafficAt(at: LatLon): number {
  let busy = 0;
  for (const p of PORTS) {
    if (!p.known) continue;
    const d = haversine(at, anchorageOf(p)) / NM;
    // A port's shipping thins out with the square of the distance from it; a
    // rich one reaches further.
    const reach = 90 + p.wealth * 520 + (p.size === 'city' || p.size === 'emporium' ? 260 : 0);
    busy += (0.12 + p.wealth) * Math.exp(-((d / reach) ** 2));
  }
  // The Gulf of Cádiz and the approaches to the Strait carry everybody's
  // shipping, not just the shipping of the ports in them.
  const iberia = Math.exp(-(((at.lat - 36) / 6) ** 2) - (((wrap180(at.lon) + 8) / 7) ** 2));
  return clamp(busy + iberia * 0.9, 0, 4);
}

/** The flags that could plausibly be in this water, with weights. */
function flagsAt(g: Game, at: LatLon): { nation: Nation; business: Business; w: number }[] {
  const lat = at.lat;
  const near = portsNear(at, 700)[0];
  const people = near?.def.people ?? null;
  // South of Cape Bojador is the monopoly, and the monopoly is the story.
  const inGuinea = lat < 26 && wrap180(at.lon) < 0;
  const deepGuinea = lat < 14;
  const out: { nation: Nation; business: Business; w: number }[] = [];

  out.push({ nation: 'portuguese', business: 'trader', w: inGuinea ? 1.1 : 3.4 });
  if (inGuinea) out.push({ nation: 'portuguese', business: 'guineaman', w: 2.6 });
  if (!inGuinea) out.push({ nation: 'portuguese', business: 'fisher', w: 1.1 });

  // Castile. Everywhere north of the line legitimately; south of it, never
  // legitimately, and the further south the more certainly a deliberate act.
  out.push({ nation: 'castilian', business: inGuinea ? 'interloper' : 'trader', w: inGuinea ? 1.5 : 1.6 });
  if (deepGuinea) out.push({ nation: 'french', business: 'interloper', w: 0.5 });

  // Genoa and Florence financed half of this and sailed on everybody's
  // licences, which is why a Genoese hull off Guinea is awkward rather than
  // criminal.
  out.push({ nation: 'genoese', business: 'trader', w: inGuinea ? 0.5 : 1.1 });

  // The Maghreb, which is a trading coast and a hunting coast depending on who
  // is aboard and how far you are from a gun.
  if (lat > 20 && lat < 38) {
    out.push({ nation: 'moorish', business: 'trader', w: people === 'moor' ? 2.2 : 0.9 });
    // A friendly sultan's galleys keep his coast, and the corsairs know whose
    // friend you are.
    const ally = g.alliedWatersAt(at.lat, at.lon);
    out.push({ nation: 'moorish', business: 'corsair', w: (lat > 28 ? 1.1 : 0.35) * (ally ? 0.3 : 1) });
  }

  // Somebody in trouble, anywhere, and more likely the worse the weather has
  // been and the further from help she is.
  out.push({
    nation: g.rng.chance(0.7) ? 'portuguese' : 'castilian',
    business: 'distressed',
    w: 0.5 + clamp(g.weatherNow.waveHeight / 6, 0, 1),
  });
  return out;
}

/** What sort of hull that errand is sailed in. */
function hullFor(business: Business, nation: Nation, rng: Rng): string {
  switch (business) {
    case 'corsair':
      return rng.chance(0.7) ? 'caravela-latina' : 'caravela-redonda';
    case 'fisher':
      return rng.chance(0.6) ? 'barcha' : 'caravela-latina';
    case 'guineaman':
      return rng.chance(0.55) ? 'caravela-redonda' : 'nau-pequena';
    case 'interloper':
      return rng.chance(0.5) ? 'caravela-latina' : 'caravela-redonda';
    case 'distressed':
      return rng.pick(['caravela-latina', 'caravela-redonda', 'nau-pequena']);
    default:
      return nation === 'moorish'
        ? rng.pick(['barcha', 'caravela-latina'])
        : rng.pick(['caravela-latina', 'caravela-redonda', 'nau-pequena', 'nau']);
  }
}

/** What she does about a strange sail, before she knows anything about you. */
function intentFor(business: Business, rng: Rng): Intent {
  switch (business) {
    case 'corsair': return 'hunt';
    case 'interloper': return 'avoid';
    case 'distressed': return 'close';
    case 'guineaman': return rng.chance(0.55) ? 'avoid' : 'hold';
    case 'fisher': return 'hold';
    default: return rng.chance(0.4) ? 'close' : 'hold';
  }
}

/**
 * Raise a sail, somewhere out on the edge of what the masthead can see.
 *
 * She is put down at a real bearing and a real range and sails from there under
 * her own orders. Nothing about the meeting is decided here.
 */
export function raiseASail(g: Game, rangeNm: number): Stranger | null {
  const at = g.ship.state.pos;
  const opts = flagsAt(g, at);
  const total = opts.reduce((s, o) => s + o.w, 0);
  if (total <= 0) return null;
  let roll = g.rng.next() * total;
  let choice = opts[opts.length - 1];
  for (const o of opts) { roll -= o.w; if (roll <= 0) { choice = o; break; } }

  const hullId = hullFor(choice.business, choice.nation, g.rng);
  const hull = hullClass(hullId);
  // Not dead ahead and not dead astern: a sail raised right on the bow is
  // either a collision or a non-event, and the interesting ones are the ones
  // on a converging course a long way off.
  const bearing = wrap360(g.ship.state.heading + g.rng.range(-115, 115));
  const pos = rhumbStep(at, bearing, rangeNm * NM);

  return {
    hullId,
    nation: choice.nation,
    business: choice.business,
    name: g.rng.pick(SHIP_NAMES[choice.nation]),
    master: g.rng.pick(MASTERS[choice.nation]),
    pos,
    heading: wrap360(g.rng.range(0, 360)),
    speedKnots: 0,
    intent: choice.business === 'distressed' ? 'hold' : intentFor(choice.business, g.rng),
    read: 0,
    guns: choice.business === 'corsair' ? g.rng.int(2, 6)
      : choice.business === 'guineaman' ? g.rng.int(2, 8)
        : g.rng.int(0, 4),
    hands: Math.round(hull.crewMin + g.rng.range(0, hull.crewFull - hull.crewMin)),
    sightedT: g.clock.t,
    spoken: false,
    awareT: null,
  };
}

// -----------------------------------------------------------------------------
// Sailing her

/**
 * The course that gets her where she wants to go fastest, given what she can do.
 *
 * Not "point at it": a ship that wants to go to windward cannot, so she has to
 * pick the tack that pays, and a ship running away from something to windward
 * of her should square away rather than try to cross ahead. Both fall out of
 * maximising made-good along the desired line over every heading she could
 * steer, which is the same calculation a master does by eye.
 */
export function bestCourse(
  hullId: string, windFrom: number, windKnots: number, toward: number,
): { heading: number; speed: number } {
  let bestHeading = toward;
  let bestVmg = -Infinity;
  let speedAt = 0;
  for (let h = 0; h < 360; h += 5) {
    const beta = Math.abs(wrap180(windFrom - h));
    const s = polarAt(hullId, windKnots, beta);
    const vmg = s * Math.cos((wrap180(toward - h) * Math.PI) / 180);
    if (vmg > bestVmg) { bestVmg = vmg; bestHeading = h; speedAt = s; }
  }
  return { heading: bestHeading, speed: speedAt };
}

/** Sail her for `dt` seconds under her own orders. */
export function sailStranger(g: Game, s: Stranger, dt: number): void {
  const w = g.weatherNow.wind;
  const me = g.ship.state.pos;
  const toMe = bearingTo(s.pos, me);
  const away = wrap360(toMe + 180);

  let want: number;
  switch (s.intent) {
    case 'close':
    case 'hunt': want = toMe; break;
    case 'avoid': want = away; break;
    default: want = s.course ?? s.heading; break;
  }

  if ((s.intent === 'hold' || s.intent === 'unaware') && s.course === undefined) {
    // She is on her own passage and is not thinking about you at all — but she
    // still cannot sail into the wind's eye, so a holding course inside her
    // no-go is the one she would actually be on.
    const beta = Math.abs(wrap180(w.from - s.heading));
    const noGo = polarNoGo(s.hullId, w.speed);
    if (beta < noGo) {
      want = wrap360(w.from - Math.sign(wrap180(w.from - s.heading) || 1) * noGo);
    }
    s.heading = turnToward(s.heading, want, dt, s.hullId);
    s.speedKnots = polarAt(s.hullId, w.speed, Math.abs(wrap180(w.from - s.heading)));
  } else {
    const best = bestCourse(s.hullId, w.from, w.speed, want);
    s.heading = turnToward(s.heading, best.heading, dt, s.hullId);
    s.speedKnots = polarAt(s.hullId, w.speed, Math.abs(wrap180(w.from - s.heading)));
  }

  // A ship that cannot be sailed is not sailed.
  if (s.business === 'distressed') s.speedKnots *= 0.25;

  // She keeps off the beach, like anybody would. Without this a ship holding
  // her course past a headland sails up it and is drawn standing in a field.
  const next = rhumbStep(s.pos, s.heading, s.speedKnots * NM * (dt / 3600));
  if (isLand(next)) {
    s.heading = wrap360(s.heading + 35);
    return;
  }
  s.pos = next;
}

/** She comes round at a rate her hull allows, not instantly. */
function turnToward(from: number, to: number, dt: number, hullId: string): number {
  const rate = 4 + hullClass(hullId).handiness * 10; // degrees a minute
  const max = (rate * dt) / 60;
  const d = wrap180(to - from);
  return wrap360(from + clamp(d, -max, max));
}

/**
 * What she decides about you, once she has had a look.
 *
 * Neither ship knows the other's flag at ten miles. What the masthead has is a
 * rig and a size, and at that range the only questions anybody can answer are
 * "is she bigger than us" and "is she coming this way" — which is exactly what
 * both masters decide on.
 */
export function strangerThinks(g: Game, s: Stranger, rangeNm: number): void {
  if (s.awareT !== null) return;
  // She sees you when you would see her, allowing for her being lower or
  // higher out of the water than you.
  const herMast = hullClass(s.hullId).masts[0]?.ceHeight ?? 10;
  if (rangeNm > 8 + herMast * 0.5) return;
  s.awareT = g.clock.t;

  const mine = g.ship.hull;
  const hers = hullClass(s.hullId);
  const outgunned = mine.tons > hers.tons * 1.6 || g.ship.effects.guns >= 6;

  switch (s.business) {
    case 'corsair':
      // A corsair takes weak ships and leaves strong ones, which is the whole
      // of the trade.
      s.intent = outgunned || (g.alliedWatersAt(s.pos.lat, s.pos.lon) && g.rng.chance(0.6)) ? 'avoid' : 'hunt';
      break;
    case 'interloper':
      s.intent = 'avoid';
      break;
    case 'guineaman':
      // The King's gold runs from everybody until it knows who they are.
      s.intent = 'avoid';
      break;
    case 'distressed':
      s.intent = 'hold';
      break;
    default:
      s.intent = g.rng.chance(0.45) ? 'close' : 'hold';
      break;
  }
}

/** How much of her the masthead has made out, which grows as the range closes. */
export function readOf(rangeNm: number): number {
  return clamp(1 - (rangeNm - 1.2) / 11, 0, 1);
}

/** What the lookout can honestly say about her at this range. */
export function describeStranger(s: Stranger, rangeNm: number, bearingOffBow: number): string {
  const hull = hullClass(s.hullId);
  const side = bearingOffBow >= 0 ? 'starboard' : 'port';
  const points = Math.round(Math.abs(bearingOffBow) / 11.25);
  const where = points === 0 ? 'right ahead'
    : points >= 15 ? 'right astern'
      : points === 8 ? `broad on the ${side} beam`
        : `${points} point${points === 1 ? '' : 's'} on the ${side} ${points > 8 ? 'quarter' : 'bow'}`;

  if (s.read < 0.25) {
    return `A sail ${where}, hull down. Nothing of her but the canvas.`;
  }
  if (s.read < 0.55) {
    const rig = hull.masts.length === 1 ? 'a single mast'
      : hull.masts.length === 2 ? 'two masts'
        : `${hull.masts.length} masts`;
    const size = hull.tons > 120 ? 'a big ship' : hull.tons > 55 ? 'a caravel or thereabouts' : 'something small';
    return `${size.charAt(0).toUpperCase() + size.slice(1)}, ${rig}, ${where} at ${rangeNm.toFixed(0)} miles.`;
  }
  if (s.read < 0.85) {
    return `A ${hull.english.toLowerCase()}, ${where}, ${rangeNm.toFixed(1)} miles. `
      + 'She is hull up now and there are men on her rail.';
  }
  return `${s.name}, a ${hull.name} under ${NATION_NAME[s.nation]} colours, `
    + `${where} at ${rangeNm < 1 ? `${Math.round(rangeNm * 10)} cables` : `${rangeNm.toFixed(1)} miles`}.`;
}

/** What she appears to be doing, in the words the watch would use. */
export function strangerIntentText(s: Stranger, closingKnots: number): string {
  if (s.read < 0.3) return closingKnots > 0.4 ? 'She is nearing.' : 'She is drawing away.';
  switch (s.intent) {
    case 'hunt': return 'She has altered towards us and is carrying everything she has.';
    case 'close': return 'She has put her helm up and is standing towards us.';
    case 'avoid': return 'She has hauled off. Whatever she is, she does not want to be spoken to.';
    case 'hold': return 'She holds her course and takes no notice of us.';
    default: return 'She has not seen us.';
  }
}
