import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import { nearestShore } from '../world/landmass';
import type { Game } from './state';

/**
 * Things that happen on a passage.
 *
 * A voyage to India is three months of open water. The sailing itself carries
 * the first week and then the sea is the same sea, and without incident the
 * player is watching a number on a log line change slowly. These are the events
 * that make a passage a story: signs of land days before the land, a strange
 * sail on the horizon, fresh fish, a leak, a squall in the middle watch, the
 * flux going through the fo'c'sle.
 *
 * Two kinds. Most simply happen — they are reported, they take their effect,
 * and the ship sails on. A few put a decision to the captain and stop the clock
 * until he makes it, and those are deliberately rare: an interruption every few
 * minutes is not tension, it is a nuisance.
 */

export type Severity = 'note' | 'warning' | 'grave';

export interface SeaChoice {
  label: string;
  /** What this course of action would mean, shown under the label. */
  detail: string;
  /** Carry it out. Returns what goes in the log. */
  resolve: (g: Game) => string;
  /** A hail's term (game/terms.ts): parley, search, pass, gift, licence, toll or stop. For the falsifier and the card. */
  term?: string;
}

export interface SeaEvent {
  id: string;
  title: string;
  text: string;
  severity: Severity;
  choices?: SeaChoice[];
  /**
   * The numbers the scene was built on — whether she will claw off, how long
   * until the flood, the odds of a boarding — for the officers to argue from.
   * See game/counsel. Never shown.
   */
  facts?: Record<string, number>;
  /** A question put at the chart table rather than something happening on deck. */
  council?: boolean;
  /** The man behind a hail (D7): shown as a compact line under the title. */
  who?: { name: string; home: string; errand: string; read: string };
}

/** Everything an event needs to know about the ship's situation. */
export interface EventContext {
  g: Game;
  rng: Rng;
  /** Nautical miles to the nearest land. */
  shoreNm: number;
  /** Absolute latitude, which stands in for the climate. */
  absLat: number;
  windKnots: number;
  waveHeight: number;
  speedKnots: number;
  daysOut: number;
  night: boolean;
  /** True when the crew have gone long enough without fresh food to care. */
  crewNeedsFood: boolean;
  /** How hard it is raining, 0 to 1. A doldrum squall is mostly this. */
  rain: number;
  /** The doubt in the reckoned latitude, in minutes. */
  doubtNm: number;
}

interface SeaEventDef {
  id: string;
  /**
   * Mean days between occurrences while the gate is open. A voyage should turn
   * up something to talk about every few days, not every watch.
   */
  everyDays: number;
  gate: (c: EventContext) => boolean;
  build: (c: EventContext) => SeaEvent;
}

const day = (c: EventContext) => !c.night;

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

export const EVENTS: SeaEventDef[] = [
  // Cut A3: birds, weed, fish, rainwater and ambergris are no longer events; their
  // lines live on as ambient barks (progression/barks: ambientAtSea).

  // --- The crew ------------------------------------------------------------
  {
    id: 'cask',
    everyDays: 9,
    gate: (c) => c.g.crew.provisions.water > 12 && c.daysOut > 6,
    build: () => ({
      id: 'cask', severity: 'warning',
      title: 'The cooper reports',
      text: 'Two casks in the ground tier are foul — the water in them is black and stinking, and it has been for some time. It goes over the side.',
    }),
  },
  {
    id: 'flux',
    everyDays: 14,
    gate: (c) => c.absLat < 22 && c.daysOut > 12 && c.g.crew.count > 6,
    build: () => ({
      id: 'flux', severity: 'warning',
      title: 'Sickness forward',
      text: 'The flux is in the fo\'c\'sle. Four men down and the rest looking at them.',
    }),
  },

  // --- The ship ------------------------------------------------------------
  {
    id: 'leak',
    everyDays: 13,
    gate: (c) => c.g.ship.condition.hull < 0.94 || c.waveHeight > 3,
    build: () => ({
      id: 'leak', severity: 'warning',
      title: 'She is making water',
      text: 'The carpenter has found it: a seam working open abaft the mainmast, low down, where nobody can get at it without shifting cargo.',
      choices: [
        {
          label: 'Shift the cargo and get at it',
          detail: 'A day lost and the hold in chaos, but the seam properly caulked.',
          resolve: (g) => {
            g.clock.t += 86400 * 0.8;
            g.ship.repair(0.09);
            g.crew.fatigue = clamp(g.crew.fatigue + 0.12, 0, 1);
            return 'Broke out the after hold, got at the seam and caulked it properly. A long day of it, and the hands are used up, but she is tight again.';
          },
        },
        {
          label: 'Fother a sail over it and press on',
          detail: 'An hour\'s work. It will hold — for a while.',
          resolve: (g) => {
            g.ship.repair(0.03);
            g.ship.condition.leak += 0.25;
            return 'Fothered a spare topsail over the place from outboard. It has slowed her making water, and that is all that can be said for it.';
          },
        },
        {
          label: 'Put more hands on the pumps',
          detail: 'Nothing is mended, and the pumps are manned in both watches.',
          resolve: (g) => {
            g.pumpEffort = clamp(g.pumpEffort + 0.22, 0, 0.7);
            g.crew.morale = clamp(g.crew.morale - 0.05, 0, 1);
            return 'Nothing done about the seam. The pumps are manned in both watches and the hands know what that means.';
          },
        },
      ],
    }),
  },
  {
    id: 'squall',
    everyDays: 5,
    // Only when the weather actually has one coming.
    //
    // This used to fire on any wind over nine knots, so the card announced a
    // black squall a quarter of an hour away on a fine day with no squall
    // within two hundred miles, and the real doldrum squalls the weather does
    // simulate arrived with nothing said about them. The decision the card
    // offers — shorten down, or hold on — is worth keeping; it just has to be
    // about the squall that is really there.
    gate: (c) => c.windKnots > 9 && c.g.ship.canvasSet > 0.3
      && c.g.weatherNow.storm?.kind === 'squall' && c.g.weatherNow.stormDistanceNm < 40,
    build: (c) => ({
      id: 'squall', severity: 'warning',
      title: 'A squall to windward',
      text: `A black squall coming up fast on the ${signBearing(c)} quarter, and it will be aboard in a quarter of an hour.`,
      choices: [
        {
          label: 'Shorten down now',
          detail: 'Lose a little way. Risk nothing.',
          resolve: (g) => {
            // Handed, not ordered: when it has blown through, the watch make
            // sail again to whatever she was carrying before.
            g.handSail(0.35);
            return 'Handed everything but a rag of the main before it struck. It came on hard and passed in twenty minutes, and she never felt it.';
          },
        },
        {
          label: 'Carry on and hold what she has',
          detail: 'Keep the ground you are making. She may not like it.',
          resolve: (g) => {
            const luck = g.rng.next();
            if (luck > 0.45) {
              g.crew.morale = clamp(g.crew.morale + 0.05, 0, 1);
              return 'Held on through it with everything set. She lay down to her rail and went through the squall like a knife, and the hands cheered her. Nothing carried away.';
            }
            const idx = g.rng.int(0, g.ship.state.sails.length - 1);
            g.ship.damageMast(idx, g.rng.range(0.2, 0.6));
            g.crew.morale = clamp(g.crew.morale - 0.08, 0, 1);
            return `Held on too long. The squall took the ${g.ship.hull.masts[idx].name.toLowerCase()} aback and split the canvas from head to foot before it could be got in.`;
          },
        },
      ],
    }),
  },

  // --- Other ships ---------------------------------------------------------
  //
  // There used to be a card here called 'A sail!' which rolled a die three ways
  // — a friendly caravel, a Genoese, or a corsair — and told you which you had
  // got. Strange sails are simulated now: one is generated with a nation, a
  // business and an intent, she is chased or avoided on the polars with a real
  // closing speed, and what she turns out to be is discovered by speaking her.
  // A card that decides the same question with one call to the random number
  // generator is not a second helping of that; it is a worse copy of it, and
  // firing every eight days it was the more common of the two. Removed.

  // --- Windfalls and losses ------------------------------------------------
  {
    id: 'wreck',
    everyDays: 70,
    gate: (c) => c.shoreNm > 25 && day(c),
    build: (c) => ({
      id: 'wreck', severity: 'warning',
      title: 'Wreckage',
      text: `Timber going past on the ${signBearing(c)} beam — a whole section of deck with the fastenings still in it, and after it a spar, and a hatch cover. Whatever she was, she has been down some days.`,
    }),
  },
  {
    id: 'soldiersWind',
    everyDays: 7,
    gate: (c) => c.windKnots > 10 && c.windKnots < 24 && c.speedKnots > 5,
    build: () => ({
      id: 'soldiersWind', severity: 'note',
      title: 'A soldier\u0027s wind',
      text: 'Free wind, an easy sea, and she is running off the miles without a hand touching a sheet. Days like this are what the whole trade is for.',
    }),
  },

  // --- Blue water ----------------------------------------------------------
  // The table used to be gated almost entirely on being near a shore or on a
  // crew state that rarely arrives, so a ninety-day passage produced two
  // events, both squalls. These are the ones that happen where there is nothing
  // to see, which is where a voyage most needs something to happen.
  {
    id: 'crossing',
    everyDays: 400,
    gate: (c) => c.absLat < 1.2 && c.g.crown.landmarksFound.has('equator'),
    build: () => ({
      id: 'crossing', severity: 'note',
      title: 'Crossing the line',
      text: 'The boatswain has rigged a tub on the main deck and every man who has not crossed '
        + 'before is being ducked in it, shaved with a barrel hoop and made to pay his footing in '
        + 'wine. It has taken the whole afternoon. It is the first time anyone has laughed in a '
        + 'fortnight.',
      choices: [
        {
          label: 'Let them have their day',
          detail: 'An afternoon of the passage, and worth it.',
          resolve: (g) => {
            g.clock.t += 5 * 3600;
            g.crew.morale = clamp(g.crew.morale + 0.16, 0, 1);
            g.crew.unrest = clamp(g.crew.unrest - 0.3, 0, 2);
            g.crew.provisions.wine = Math.max(0, g.crew.provisions.wine - 4);
            return 'Hove to for the afternoon and let the whole thing run its course. Four arrobas '
              + 'of wine gone and the ship a different ship afterwards.';
          },
        },
        {
          label: 'Half an hour and back to work',
          detail: 'Keeps the passage moving.',
          resolve: (g) => {
            g.crew.morale = clamp(g.crew.morale + 0.04, 0, 1);
            return 'Half an hour of it, and the boatswain piped them back to work with the tub '
              + 'still full. They took it well enough. They noticed.';
          },
        },
      ],
    }),
  },
  {
    id: 'becalmed',
    everyDays: 3.2,
    gate: (c) => c.windKnots < 5.5 && c.daysOut > 2,
    build: () => ({
      id: 'becalmed', severity: 'warning',
      title: 'Not a breath',
      text: 'Another day of it. The sails slat against the masts, the water is like oil, and the hands have run out of things to say to one another.',
    }),
  },
  {
    id: 'overboard',
    everyDays: 34,
    gate: (c) => c.waveHeight > 2.4 && c.g.crew.count > 5,
    build: (c) => ({
      id: 'overboard', severity: 'grave',
      title: 'Man overboard',
      // One of the men the captain knows, where there is one left to lose. The
      // card used to pick a name out of a list of four that belonged to nobody,
      // so the man who went off the yard was a stranger with a Portuguese name
      // and the fo'c'sle the game keeps was untouched by it.
      text: `${overboardMan(c)} went off the yard in the dark and is astern of us somewhere in ${c.waveHeight.toFixed(1)} metres of sea.`,
      choices: [
        {
          label: 'Heave to and search',
          detail: 'Hours lost. In this sea, probably for nothing.',
          resolve: (g) => {
            g.clock.t += 86400 * 0.2;
            if (g.rng.chance(0.3)) {
              g.crew.morale = clamp(g.crew.morale + 0.16, 0, 1);
              return 'Hove to and put the boat over in a sea that had no business taking a boat. Found him at the third pass, half drowned and swearing. The hands would follow you anywhere now.';
            }
            // And when he is not found he is dead, which the card used not to
            // do: it said 'Nothing' and left the man on the muster roll.
            g.killHands(1, 'Went off the yard at night and was not found.');
            g.crew.morale = clamp(g.crew.morale + 0.04, 0, 1);
            return 'Hove to and searched until the light went. Nothing. But they saw that we tried, and that is worth something to men who go aloft in the dark.';
          },
        },
        {
          label: 'Note it in the book and hold your course',
          detail: 'Keep the ground you have made. They will remember.',
          resolve: (g) => {
            g.killHands(1, 'Went off the yard at night, and the ship did not turn back.');
            g.crew.morale = clamp(g.crew.morale - 0.18, 0, 1);
            g.crew.unrest = clamp(g.crew.unrest + 0.15, 0, 2);
            return 'Held our course. It was the right decision and every man aboard knows it, and not one of them will look at me.';
          },
        },
      ],
    }),
  },

  // --- Judgements in blue water ---------------------------------------------
  //
  // Three decisions that can only happen out of sight of land, because a
  // fifty-day passage was measured putting five questions to the captain in
  // total and four of them were the same squall. There are only so many
  // judgements in the table and a blue-water day was eligible for almost none
  // of them, which is not a pacing problem — it is not having written the
  // content the pacing was meant to deal out.
  {
    id: 'nightloom',
    everyDays: 7,
    // Something ahead in the dark. The oldest decision at sea.
    gate: (c) => c.night && c.speedKnots > 2 && c.shoreNm < 300,
    build: (c) => ({
      id: 'nightloom', severity: 'warning',
      title: 'Something ahead in the dark',
      text: `The lookout has something broad on the ${signBearing(c)} bow \u2014 a loom, or a line `
        + 'of white water, or nothing at all. It is too dark to say and there is no moon until the '
        + 'middle watch.',
      choices: [
        {
          label: 'Heave to until it is light',
          detail: 'A night lost. Nothing hit.',
          resolve: (g) => {
            g.handSail(0.15);
            g.clock.t += 3600 * g.rng.range(4, 7);
            return 'Backed the main topsail and lay to until the light came, and what the lookout '
              + 'had was a squall line going away to the west. A night for nothing, which is what '
              + 'most careful nights are for.';
          },
        },
        {
          label: 'Stand on, with the lead going',
          detail: 'Keep the ground. Find out the hard way if he was right.',
          resolve: (g) => {
            if (g.rng.chance(0.78)) {
              g.crew.morale = clamp(g.crew.morale + 0.04, 0, 1);
              return 'Stood on with a man in the chains all night and never found a bottom. '
                + 'Whatever he saw, it was not there by morning.';
            }
            g.ship.condition.hull = clamp(g.ship.condition.hull - g.rng.range(0.04, 0.12), 0.1, 1);
            g.ship.condition.leak = clamp(g.ship.condition.leak + g.rng.range(0.1, 0.3), 0, 3);
            g.crew.morale = clamp(g.crew.morale - 0.12, 0, 1);
            return 'Stood on, and struck something in the dark that we never saw \u2014 a reef or a '
              + 'baulk of timber. She is making water forward and the carpenter is at it now.';
          },
        },
      ],
    }),
  },

];

// ---------------------------------------------------------------------------
// Rolling
// ---------------------------------------------------------------------------

/**
 * Decide whether anything happened in the last `days`, and if so what.
 *
 * Each event carries its own mean interval, and over a short step the chance of
 * it firing is that interval turned into a probability. Nothing fires within a
 * cooling-off period of the last one, so a quiet passage stays quiet and a bad
 * day does not turn into five events in a row.
 */
export function rollSeaEvent(g: Game, days: number): SeaEvent | null {
  if (days <= 0 || g.anchored || g.dockedAt) return null;

  const pos = g.ship.state.pos;
  const shore = nearestShore(pos);
  const hour = g.clock.hour;
  const c: EventContext = {
    g,
    rng: g.rng,
    shoreNm: shore.distance / 1852,
    absLat: Math.abs(pos.lat),
    windKnots: g.weatherNow.wind.speed,
    waveHeight: g.weatherNow.waveHeight,
    speedKnots: Math.abs(g.physics.speedKnots),
    daysOut: g.daysSincePort,
    night: hour < 5 || hour > 20,
    crewNeedsFood: g.crew.daysWithoutFresh > 5,
    rain: g.weatherNow.rain,
    doubtNm: g.nav.sigmaLat,
  };

  const open = EVENTS.filter((e) => !g.recentEvents.includes(e.id) && e.gate(c));
  if (open.length === 0) return null;

  // Shuffled, because the loop below returns the first event whose die comes
  // up and the list is in the order somebody wrote them in. Unshuffled, an
  // event near the top with a short interval wins every race it is entered in:
  // measured over fifty days at sea, three kinds fired in total and the squall
  // — fifth in the table, once every five days — was four of the six. The
  // table is a set of things that can happen, not a priority order.
  for (let i = open.length - 1; i > 0; i--) {
    const j = Math.floor(g.rng.next() * (i + 1));
    [open[i], open[j]] = [open[j], open[i]];
  }

  for (const def of open) {
    if (!g.rng.chance(days / def.everyDays)) continue;
    const event = def.build(c);
    applyBaseEffect(g, event.id);
    return event;
  }

  // The pacing floor.
  //
  // Every event in this table is a die roll, and a run of bad rolls on a long
  // passage is not "quiet", it is nothing happening for a fortnight — measured,
  // a ninety-day crossing produced two events in total. A voyage is a story and
  // a story cannot have a fortnight of blank pages in it. So once she has gone
  // long enough without anything, the next thing that *could* happen, does. The
  // gates still hold: this only ever fires something that was already possible
  // where she is and in the weather she has.
  //
  // Two clocks, because they are two different kinds of emptiness. Atmosphere —
  // birds, dolphins, fire in the water — keeps the passage from being blank.
  // Decisions are what make it a voyage, and going a fortnight without being
  // asked anything is the failure that matters, so the floor reaches for one
  // of those first once it has been long enough. Nine days was the first
  // setting and it is far too slack: a player asked for a judgement once a week
  // and a half is watching a passage, not sailing one.
  if (g.daysSinceDecision > 10) {
    // Not the rarities. A once-a-voyage find like the ambergris is worth
    // something because it is rare; having the floor reach for it four times in
    // three months turns a windfall into a chore.
    const asks = open.filter((e) => {
      if (e.everyDays > 45) return false;
      const built = e.build(c);
      return built.choices && built.choices.length > 0;
    });
    if (asks.length > 0) {
      const def = g.rng.pick(asks);
      const event = def.build(c);
      applyBaseEffect(g, event.id);
      return event;
    }
  }

  if (g.daysSinceEvent > 3.5) {
    const quiet = open.filter((e) => e.everyDays < 60);
    if (quiet.length > 0) {
      const def = g.rng.pick(quiet);
      const event = def.build(c);
      applyBaseEffect(g, event.id);
      return event;
    }
  }
  return null;
}

/**
 * The effect an event has whether or not the captain is asked about it. Events
 * that put a choice to him do their real work in the choice; this is for the
 * ones that simply happen.
 */
function applyBaseEffect(g: Game, id: string): void {
  const p = g.crew.provisions;
  switch (id) {
    case 'cask':
      p.water = Math.max(0, p.water - g.rng.range(4, 9));
      g.crew.morale = clamp(g.crew.morale - 0.04, 0, 1);
      break;
    case 'flux':
      g.crew.sickness = clamp(g.crew.sickness + g.rng.range(0.06, 0.14), 0, 1);
      g.crew.morale = clamp(g.crew.morale - 0.05, 0, 1);
      break;
    case 'becalmed':
      g.crew.morale = clamp(g.crew.morale - 0.035, 0, 1);
      g.crew.unrest = clamp(g.crew.unrest + 0.04, 0, 2);
      break;
    case 'soldiersWind':
      g.crew.morale = clamp(g.crew.morale + 0.045, 0, 1);
      g.crew.fatigue = clamp(g.crew.fatigue - 0.05, 0, 1);
      break;
    case 'wreck':
      g.crew.morale = clamp(g.crew.morale - 0.05, 0, 1);
      break;
    default:
      break;
  }
}

/** Roughly where the thing was seen, for flavour. */
function signBearing(c: EventContext): string {
  return c.rng.pick(['weather', 'lee', 'starboard', 'larboard', 'northern', 'southern']);
}

/**
 * Who went over the side.
 *
 * One of the named men where there is one — the whole reason the fo'c'sle is
 * written down is so that a loss has somebody in it — and an unnamed hand from
 * forward otherwise, which is honest: a captain did not know every man on a nau.
 */
function overboardMan(c: EventContext): string {
  const live = c.g.hands.filter((h) => h.alive && h.aboard);
  if (live.length > 0) {
    const h = live[Math.floor(c.rng.next() * live.length)];
    return `${h.name}, of ${h.from},`;
  }
  return 'One of the hands';
}
