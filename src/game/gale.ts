import { angleDelta, clamp, wrap180, wrap360 } from '../core/math';
import { polarAt } from '../ship/polars';
import { isLand } from '../world/landmass';
import { shiftAll } from '../crew/hands';
import type { SeaEvent } from './seaEvents';
import type { Game } from './state';

/**
 * A gale, and the thing a gale does to a ship that has land under her lee.
 *
 * The weather in this game has been a real simulation from the start — moving
 * systems, a circulation, a sea that builds — and the player's entire share in
 * it has been one decision, taken once, by the watch: shorten canvas. Everything
 * else is a die rolled against the canvas she is carrying. A storm has never
 * asked a captain a question.
 *
 * The question a storm actually asked was almost always the same one, and it is
 * the defining terror of the whole age of sail: *there is land to leeward*. A
 * ship cannot sail into the wind's eye. In forty knots she can barely sail at
 * all. So a gale that sets onto a coast puts a hard sum in front of the
 * quarterdeck — how fast she is driving down on it, how much she can claw back
 * to windward in the time, and what may be thrown away to change either number
 * — and every answer costs something. Ships were lost on that sum for four
 * hundred years, and the men aboard could see it coming for a day and a half.
 *
 * Nothing here is invented arithmetic. What she will make to windward comes out
 * of the same polar table the strange sail is chased with, and her drift comes
 * out of the wind that is actually blowing, so a lateen caravel really can beat
 * off a lee shore that would put a carrack on the beach — which is the reason
 * the caravel existed.
 */

export interface GaleState {
  /** Ship-time the blow began, so one gale is one story. */
  startT: number;
  /** Which beats have been played, so each is played once per gale. */
  seen: string[];
  /** Cargo hove overboard this gale, in tons. */
  jettisoned: number;
  /** She is lying to it rather than sailing. */
  hoveTo: boolean;
}

/** Above this she is not sailing, she is surviving. */
export const GALE_KNOTS = 32;

/** What she can actually do about a coast under her lee, in the honest numbers. */
export interface LeeShore {
  /** Nautical miles to the beach. */
  distNm: number;
  /** True bearing of the land. */
  bearing: number;
  /** How fast the wind is setting her down on it, knots. */
  driftKnots: number;
  /** The best she can make directly away from it, knots, under storm canvas. */
  offKnots: number;
  /** Hours before she is in the surf if nothing changes. Infinity if she is clawing off. */
  hours: number;
}

/**
 * The sum, done the way the master would do it.
 *
 * Two things set her down on the beach and only one of them is obvious. The
 * obvious one is that she cannot point: she has to make her offing on a course
 * forty or fifty degrees off the direction she needs. The other is leeway —
 * every sailing ship is pushed bodily sideways as well as driven forward, it is
 * an *angle* and not a speed, and in a gale under short canvas with a high
 * freeboard it is fifteen to twenty degrees. Add that to a close-hauled course
 * and a great deal of what looks like progress to windward is going straight
 * into the bay.
 *
 * On top of it, the wind raises a surface current of its own at roughly three
 * per cent of its speed, which nothing can be done about at all.
 *
 * The through-water speed is the polar table at the wind that is actually
 * blowing, and that table already has storm canvas in it — `prudentCanvas` has
 * her down to a third of her rig at thirty-four knots and to a seventh at
 * forty-four — so nothing further is taken off it here.
 */
export function leeShore(g: Game): LeeShore | null {
  const s = g.sounding;
  if (s.shoreDistNm > 60) return null;
  const w = g.weatherNow.wind;
  // Only a shore the wind is setting her onto. Land to windward is scenery.
  const onshore = Math.cos((angleDelta(wrap360(w.from + 180), s.shoreBearing) * Math.PI) / 180);
  if (onshore < 0.25) return null;

  const bodily = w.speed * 0.03 * onshore;
  const away = wrap360(s.shoreBearing + 180);
  const lee = leewayDegrees(g, w.speed);

  let offKnots = -Infinity;
  for (let h = 0; h < 360; h += 2) {
    const beta = wrap180(w.from - h);
    const through = polarAt(g.ship.hull.id, w.speed, Math.abs(beta));
    // Her track is her heading pushed to leeward by the leeway angle, so the
    // course made good is always further from the wind's eye than the course
    // steered — which is exactly the difference that loses ships.
    const track = wrap360(h + (beta >= 0 ? -lee : lee));
    const made = through * Math.cos((wrap180(away - track) * Math.PI) / 180);
    offKnots = Math.max(offKnots, made);
  }
  offKnots -= bodily;

  return {
    distNm: s.shoreDistNm,
    bearing: s.shoreBearing,
    driftKnots: bodily,
    offKnots,
    hours: offKnots >= 0 ? Infinity : s.shoreDistNm / Math.max(-offKnots, 0.05),
  };
}

/**
 * How far to leeward of her course she is actually going, in degrees.
 *
 * Grows with the wind, because the sail area that resists it is being taken in
 * while the windage of hull and rigging is not. A deep-draught hull grips the
 * water better and makes less of it, which is the one thing a carrack has in
 * her favour here and is nothing like enough.
 */
function leewayDegrees(g: Game, windKnots: number): number {
  const base = clamp(4 + (18 * (windKnots - 20)) / 28, 3, 24);
  const grip = clamp(1.35 - g.ship.hull.draft / 5.2, 0.62, 1.15);
  const laden = clamp(g.ship.cargoTons / Math.max(g.ship.holdCapacity, 1), 0, 1);
  return base * grip * (1 + laden * 0.18);
}

/**
 * How much better she claws with that much weight out of her.
 *
 * Not because a light ship points higher — she does not, she makes rather more
 * leeway — but because of the reason ships were actually started in a gale: a
 * deep-laden hull is pressed down, buries her bow in every sea, and has to be
 * eased of canvas long before a light one does. Lightened she will *bear* sail
 * that she could not bear before, and bearing sail is the whole of clawing off.
 *
 * So the load is taken off the wind rather than off the leeway: a ship relieved
 * of half her cargo works as though the gale were several knots less than it
 * is, which is exactly what the men at the lee ports were buying.
 */
function clawWithout(g: Game, lee: LeeShore, tonsOver: number): number {
  const hold = Math.max(g.ship.holdCapacity, 1);
  const relief = clamp(tonsOver / hold, 0, 1) * 11;
  if (relief < 0.2) return lee.offKnots;
  const real = g.weatherNow.wind.speed;
  const w = g.weatherNow.wind as { from: number; speed: number };
  w.speed = Math.max(GALE_KNOTS - 4, real - relief);
  const eased = leeShore(g)?.offKnots ?? lee.offKnots;
  w.speed = real;
  // She cannot be better off than she would be in a flat calm, and the
  // lightening never makes her worse.
  return Math.max(lee.offKnots, eased);
}

// -----------------------------------------------------------------------------

function hoursWord(h: number): string {
  if (!Number.isFinite(h)) return 'she is holding her own';
  if (h < 2) return 'less than two hours';
  if (h < 6) return `about ${Math.round(h)} hours`;
  if (h < 30) return `${Math.round(h)} hours`;
  return `${(h / 24).toFixed(1)} days`;
}

/**
 * The first beat: it is coming on to blow, and there is still a choice.
 *
 * Deliberately offered while she is still sailing. A decision taken when the
 * sea is already breaking over her is not a decision.
 */
function makingScene(g: Game): SeaEvent {
  const w = g.weatherNow;
  const dest = g.destination;
  return {
    id: 'gale:making',
    title: 'It is coming on to blow',
    severity: 'warning',
    text: `The glass has been falling since the middle watch and the swell has gone long and `
      + `oily and is running from a different quarter than the wind. ${w.wind.speed.toFixed(0)} `
      + `knots and building, and the sky to windward is the colour of a bruise.\n\n`
      + `The master has the topsails off her already and is waiting to be told what she is to do `
      + `about it. There are three things she can do and every one of them costs something.`,
    choices: [
      {
        label: 'Heave to and let it go by',
        detail: 'Safest. A day or two of the passage thrown away, and the sea may not take it.',
        resolve: (gg) => {
          gg.gale.hoveTo = true;
          const days = gg.rng.range(0.8, 2.2);
          gg.clock.t += days * 86400;
          gg.crew.fatigue = clamp(gg.crew.fatigue + 0.08, 0, 1);
          return `Main topsail to the mast, helm a-lee, and she lies to it with the sea coming `
            + `under her instead of over her. ${days.toFixed(1)} days gone out of the passage and `
            + `hardly a rope started. The watch below got some sleep, which they will not get `
            + `again this week.`;
        },
      },
      {
        label: 'Run before it',
        detail: dest
          ? 'Fast, and downwind. Where it puts her is the question nobody can answer yet.'
          : 'Fast, downwind, and a long way from wherever you were going.',
        resolve: (gg) => {
          const hours = gg.rng.range(10, 30);
          const w2 = gg.weatherNow.wind;
          const run = polarAt(gg.ship.hull.id, Math.min(w2.speed, 34), 170) * 0.8 * hours;
          gg.ship.state.pos = stepDownwind(gg, run);
          gg.nav.estimated = stepDownwind(gg, run * gg.rng.range(0.85, 1.15));
          gg.clock.t += hours * 3600;
          gg.crew.morale = clamp(gg.crew.morale + 0.03, 0, 1);
          gg.nav.sigmaLon += run * 0.12;
          return `Squared away before it under a goose-winged course, and she ran like a frightened `
            + `horse for ${hours.toFixed(0)} hours — ${run.toFixed(0)} miles of it, most of them `
            + `in the wrong direction. Nothing carried away. The pilot has lost the run of the `
            + `board and says so, which is better than a pilot who has lost it and does not.`;
        },
      },
      {
        label: 'Hold your course, close-reefed',
        detail: 'Keep the passage. She will be worked hard and something may go.',
        resolve: (gg) => {
          const hours = gg.rng.range(12, 26);
          gg.clock.t += hours * 3600;
          gg.crew.fatigue = clamp(gg.crew.fatigue + 0.2, 0, 1);
          shiftAll(gg.hands, -0.04);
          if (gg.rng.chance(0.42)) {
            gg.ship.damage(gg.rng.range(0.05, 0.16));
            return `${hours.toFixed(0)} hours of it with the weather rigging bar-taut and everybody `
              + `on deck. She kept the course and she paid for it: the topsides are working, there `
              + `is water over the cabin sole, and both watches are on the pumps.`;
          }
          return `${hours.toFixed(0)} hours of it, close-reefed, with green water coming in over `
            + `the weather bow every third sea. She took it, and the course is kept, and the `
            + `boatswain has gone round every deadeye on the ship twice.`;
        },
      },
    ],
  };
}

/** The second beat, and the only one that has ever actually killed anybody. */
function leeShoreScene(g: Game, lee: LeeShore): SeaEvent {
  const w = g.weatherNow.wind;
  const holding = lee.offKnots >= 0;
  const cargo = g.ship.cargoTons;
  const over = Math.min(cargo, Math.max(4, Math.round(cargo * 0.45)));
  const lightened = clawWithout(g, lee, over);
  const deepM = g.sounding.depth;
  const fathoms = deepM / 1.8288;

  return {
    id: 'gale:leeshore',
    title: 'A lee shore',
    severity: 'grave',
    text: `Land on the ${compassish(lee.bearing)} and the wind blowing straight onto it at `
      + `${w.speed.toFixed(0)} knots.\n\n`
      + `The master has it in chalk on the deck and everybody forward has already worked it out `
      + `for themselves. ${lee.distNm.toFixed(0)} miles to the beach. She is being set down on it `
      + `bodily at ${lee.driftKnots.toFixed(1)} knots whatever she does, and the best she will `
      + `make to windward under what canvas she can carry is `
      + `${(lee.offKnots + lee.driftKnots).toFixed(1)}. `
      + `${holding
        ? 'That is enough. It is not enough by very much, and it assumes nothing carries away.'
        : `That leaves her losing ${(-lee.offKnots).toFixed(1)} knots of it, and ${hoursWord(lee.hours)} before she is in the surf.`}\n\n`
      + `Nobody on this deck has to be told what that means. Two of them have seen it happen to `
      + `somebody else.`,
    choices: [
      {
        label: 'Claw off. Carry everything she will bear.',
        detail: holding
          ? 'She will do it if the gear holds. Press her and the gear is what goes.'
          : `On these numbers she does not make it. Press her anyway and hope the wind shifts.`,
        resolve: (gg) => clawOff(gg, lee, lee.offKnots, false),
      },
      ...(cargo > 3 ? [{
        label: `Start the cargo. ${over} tons over the side.`,
        detail: `Lighter she makes ${(lightened + lee.driftKnots).toFixed(1)} knots to windward `
          + `instead of ${(lee.offKnots + lee.driftKnots).toFixed(1)}. It is somebody's money and `
          + 'it may be the King’s.',
        resolve: (gg: Game) => {
          const thrown = gg.heaveCargoOverboard(over);
          gg.gale.jettisoned += thrown;
          const better = clawWithout(gg, lee, thrown);
          const out = clawOff(gg, lee, better, true);
          return `${thrown.toFixed(0)} tons through the lee ports, and it took an hour and a half `
            + `with the ship on her beam ends and the men working in water to their waists. `
            + `${out}`;
        },
      }] : []),
      ...(deepM < 44 && deepM > 5 ? [{
        label: 'Anchor, and ride it out',
        detail: `${fathoms.toFixed(0)} fathoms. Every anchor she has, and pray the ground holds.`,
        resolve: (gg: Game) => anchorIt(gg, lee),
      }] : []),
    ],
  };
}

/** Beating off it, or not. */
function clawOff(g: Game, lee: LeeShore, offKnots: number, lightened: boolean): string {
  // Whether she gets out is decided by the sum and then by how long she is in
  // it, which is where seamanship and a sound hull enter: a gale is hours of
  // holding on and the thing that loses the ship is gear carrying away.
  const margin = offKnots;
  const hours = clamp(lee.distNm / Math.max(Math.abs(margin), 0.4), 2, 30);
  g.clock.t += hours * 3600;
  g.crew.fatigue = clamp(g.crew.fatigue + 0.3, 0, 1);
  shiftAll(g.hands, -0.06);

  // Something carrying away while she is beating off a beach is how it
  // actually happens. Pressing her hard for hours is the risk.
  const gearGone = g.rng.chance(clamp(0.1 + hours * 0.022 - g.ship.condition.hull * 0.1, 0.05, 0.7));
  const effective = margin - (gearGone ? Math.abs(margin) * 0.9 + 0.3 : 0);

  if (effective > 0) {
    // She is actually out. Without moving her the card resolved a crisis and
    // left the ship in exactly the position that caused it, with the land still
    // eight miles under her lee and the gale still blowing.
    offshore(g, lee, lee.distNm * 1.8 + 6);
    g.crew.morale = clamp(g.crew.morale + 0.1, 0, 1);
    shiftAll(g.hands, 0.14);
    g.galeRecord.clawedOff++;
    return `${hours.toFixed(0)} hours of it, board on board, with the land never more than `
      + `${Math.max(0.5, lee.distNm * 0.35).toFixed(0)} miles under her lee and every man aboard `
      + `counting it. ${gearGone
        ? 'The fore topmast went in the middle of it and they got her round on the other tack under a storm staysail, which should not have worked and did. '
        : ''}By the morning watch the land is a smudge astern and she is in blue water.`
      + `${lightened ? ' It was the cargo that did it and everybody knows it was the cargo.' : ''}`;
  }

  // She does not weather it. This is not instant death: a ship driven ashore in
  // the age of sail usually struck, and what happened next depended on the
  // ground and on whether anybody kept their head.
  // Whether she is lost outright, or strikes and is got off.
  //
  // Dominated by the state of the hull, deliberately. A ship that has been kept
  // up strikes, pounds, and comes off with her false keel gone and her people
  // alive — that is what almost always happened, and it is a punishment, not an
  // ending. The ship that breaks her back on the second sea is the one that was
  // already half a wreck before the gale found her, and losing her is then the
  // bill for a career of not repairing anything.
  const hull = g.ship.condition.hull;
  const survives = g.rng.next() < clamp(0.45 + hull * 0.42 + g.crew.morale * 0.13, 0.25, 0.97);
  g.galeRecord.driven++;
  if (survives) {
    // Off the reef and into whatever water there is outside it.
    offshore(g, lee, Math.max(2, lee.distNm * 0.5));
    const lost = g.rng.int(1, 6);
    g.killHands(lost, 'Drowned when she struck.');
    g.ship.damage(g.rng.range(0.25, 0.5));
    const tons = g.heaveCargoOverboard(g.ship.cargoTons * g.rng.range(0.3, 0.7));
    g.crew.morale = clamp(g.crew.morale - 0.3, 0, 1);
    shiftAll(g.hands, -0.3);
    g.clock.t += g.rng.range(4, 12) * 86400;
    return `She would not weather it. ${gearGone ? 'The gear went first and that was that. ' : ''}`
      + `She struck on an outlying reef at about four in the morning, beam on, and lay there `
      + `pounding for two tides.\n\nThey got her off. ${lost === 1 ? 'One man' : `${lost} men`} `
      + `drowned, ${tons.toFixed(0)} tons of cargo gone, her false keel gone, and she is making `
      + `water faster than the pumps like her. The nearest place she can be repaired is a long `
      + `way from here.`;
  }
  g.wreckHer();
  return `She would not weather it, and at some point in the middle watch the question stopped `
    + `being whether she would and became where she would strike.\n\nShe went on at the top of a `
    + `sea and broke her back on the second one. What is left of the company got ashore over the `
    + `wreck in the grey of the morning and stood on a beach in a country none of them can name, `
    + `watching the rest of her come to pieces in the surf.`;
}

/** Every anchor she has, and the holding ground decides it. */
function anchorIt(g: Game, lee: LeeShore): string {
  const ground = g.sounding.depth < 28 ? 0.62 : 0.4;
  const easing = clamp(1 - (g.weatherNow.wind.speed - GALE_KNOTS) / 26, 0.15, 1);
  g.clock.t += g.rng.range(12, 30) * 3600;
  g.crew.fatigue = clamp(g.crew.fatigue + 0.22, 0, 1);
  if (g.rng.next() < ground * easing + 0.18) {
    g.galeRecord.rodeItOut++;
    g.crew.morale = clamp(g.crew.morale + 0.08, 0, 1);
    shiftAll(g.hands, 0.1);
    return `Both bowers and the sheet anchor, veered to the clinch, and she snubbed and sheered `
      + `and yawed at them all night with the land a mile and a half astern and the cables `
      + `groaning in the hawse. The ground held.\n\nIn the morning the wind had gone round two `
      + `points and the sea was down enough to get the anchors, and it had taken four men to do `
      + `what one man does in a harbour.`;
  }
  // Dragging, and now she is closer with no anchors left.
  g.ship.damage(g.rng.range(0.05, 0.15));
  const worse: LeeShore = { ...lee, distNm: Math.max(0.6, lee.distNm * 0.4) };
  return `Both bowers down and she brought up, and held for six hours, and then at about two in `
    + `the morning she began to walk. You can feel a ship drag through the deck. They cut the `
    + `cables and made sail with the land a mile under her lee and nothing left to anchor `
    + `with.\n\n${clawOff(g, worse, lee.offKnots, false)}`;
}

/**
 * Put her that many miles to windward of the land, and move the pilot's
 * reckoning with her — badly, because nobody kept a board through that.
 */
function offshore(g: Game, lee: LeeShore, miles: number): void {
  const away = wrap360(lee.bearing + 180);
  const p = g.ship.state.pos;
  const dLat = (miles * Math.cos((away * Math.PI) / 180)) / 60;
  const dLon = (miles * Math.sin((away * Math.PI) / 180))
    / (60 * Math.max(Math.cos((p.lat * Math.PI) / 180), 1e-6));
  const next = { lat: clamp(p.lat + dLat, -70, 70), lon: p.lon + dLon };
  if (isLand(next)) return;
  g.ship.state.pos = next;
  g.nav.estimated = {
    lat: g.nav.estimated.lat + dLat * g.rng.range(0.6, 1.3),
    lon: g.nav.estimated.lon + dLon * g.rng.range(0.5, 1.5),
  };
  g.nav.sigmaLat += miles * 0.12;
  g.nav.sigmaLon += miles * 0.3;
  g.sounding.shoreDistNm = Math.min(999, g.sounding.shoreDistNm + miles);
}

function compassish(deg: number): string {
  const p = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return p[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/**
 * Where running before it puts her.
 *
 * Walked in ten-mile steps rather than jumped, and stopped at the first one
 * that would put her on the land — because running before a gale *towards* a
 * coast is precisely the situation this is about, and a ship teleported into
 * the middle of Africa is not a dramatic outcome, it is a bug.
 */
function stepDownwind(g: Game, miles: number): { lat: number; lon: number } {
  const toward = wrap360(g.weatherNow.wind.from + 180);
  let p = { ...g.ship.state.pos };
  const step = 10;
  for (let run = 0; run < miles; run += step) {
    const leg = Math.min(step, miles - run);
    const next = {
      lat: clamp(p.lat + (leg * Math.cos((toward * Math.PI) / 180)) / 60, -70, 70),
      lon: p.lon + (leg * Math.sin((toward * Math.PI) / 180))
        / (60 * Math.max(Math.cos((p.lat * Math.PI) / 180), 1e-6)),
    };
    if (isLand(next)) break;
    p = next;
  }
  return p;
}

// -----------------------------------------------------------------------------

export interface GaleRecord {
  weathered: number;
  clawedOff: number;
  rodeItOut: number;
  driven: number;
}

export function newGaleRecord(): GaleRecord {
  return { weathered: 0, clawedOff: 0, rodeItOut: 0, driven: 0 };
}

export function newGale(): GaleState {
  return { startT: -1e9, seen: [], jettisoned: 0, hoveTo: false };
}

/**
 * Whether the weather has a question for the quarterdeck.
 *
 * The lee shore outranks the making of the gale, because by the time there is
 * land under her lee the question of whether to heave to has been answered by
 * the situation.
 */
export function rollGaleScene(g: Game): SeaEvent | null {
  if (g.anchored || g.dockedAt) return null;
  const w = g.weatherNow.wind;
  if (w.speed < GALE_KNOTS) return null;

  // A doldrum thunder squall is not a gale.
  //
  // The weather model already knows the difference and this did not read it:
  // squalls below nine degrees peak anywhere up to forty-five knots, last
  // between half an hour and three, and are eight miles across. Firing "the
  // glass has been falling since the middle watch" at one of those produced a
  // gale every nineteen days on the Guinea run, which is the wettest, least
  // gale-swept water on the route and is also the whole of the early game.
  // Measured after this: the Cape blows hardest, as it should.
  //
  // A cyclone is emphatically not excluded. A tropical revolving storm off
  // Guinea in the season is exactly the crisis this is for.
  const storm = g.weatherNow.storm;
  if (storm && storm.kind === 'squall') return null;
  // Nor a gust in otherwise ordinary weather with no system behind it at all.
  if (!storm && g.weatherNow.waveHeight < 3.5) return null;

  // A new blow, or the same one still on us.
  if (g.clock.t - g.gale.startT > 3 * 86400) {
    g.gale = newGale();
    g.gale.startT = g.clock.t;
    g.galeRecord.weathered++;
  }

  const lee = leeShore(g);
  if (lee && lee.distNm < 34 && !g.gale.seen.includes('leeshore')) {
    g.gale.seen.push('leeshore');
    return leeShoreScene(g, lee);
  }
  if (!g.gale.seen.includes('making')) {
    g.gale.seen.push('making');
    return makingScene(g);
  }
  return null;
}
