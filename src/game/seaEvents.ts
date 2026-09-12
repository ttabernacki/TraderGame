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
}

export interface SeaEvent {
  id: string;
  title: string;
  text: string;
  severity: Severity;
  choices?: SeaChoice[];
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

const EVENTS: SeaEventDef[] = [
  // --- Signs of the land ---------------------------------------------------
  {
    id: 'birds',
    everyDays: 1.1,
    gate: (c) => c.shoreNm < 140 && c.shoreNm > 8 && day(c),
    build: (c) => {
      const kind = c.rng.pick([
        'A flight of boobies went over, all on the same course',
        'Terns fishing round the ship, and they do not sleep at sea',
        'A gannet came aboard and would not be driven off',
        'Land birds — small ones, brown, not sea birds at all',
      ]);
      const bearing = signBearing(c);
      return {
        id: 'birds', severity: 'note',
        title: 'Signs from the lookout',
        text: `${kind}, heading ${bearing}. There is land that way, and not far.`,
      };
    },
  },
  {
    id: 'weed',
    everyDays: 1.4,
    gate: (c) => c.shoreNm < 90 && day(c),
    build: (c) => ({
      id: 'weed', severity: 'note',
      title: 'Signs from the lookout',
      text: c.rng.pick([
        'Weed going past in rafts, still green — it has not been long in the water.',
        'A branch went by with leaves on it, and after it a bundle of reeds.',
        'The water has changed colour: greener than it was, and the lead finds a bottom.',
        'A cane float, cut and bound by hands. Someone made that.',
      ]),
    }),
  },

  // --- The crew ------------------------------------------------------------
  {
    id: 'fish',
    everyDays: 2.6,
    gate: (c) => c.speedKnots < 7,
    build: (c) => {
      const catchDays = c.rng.range(1.4, 4.5);
      return {
        id: 'fish', severity: 'note',
        title: 'Fresh meat',
        text: c.rng.pick([
          `The hands took a shoal of dorado under the bow — ${catchDays.toFixed(0)} days of fresh meat for all hands.`,
          `A turtle taken asleep on the surface, and turtle is as good as beef.`,
          `Flying fish came aboard in the night by the dozen. The cook has them all.`,
        ]),
        choices: undefined,
      };
    },
  },
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
    gate: (c) => c.windKnots > 9 && c.g.ship.canvasSet > 0.3,
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
  {
    id: 'sail',
    everyDays: 8,
    gate: (c) => c.shoreNm < 320 && day(c),
    build: (c) => ({
      id: 'sail', severity: 'note',
      title: 'A sail!',
      text: `A sail on the ${signBearing(c)} horizon, hull down, standing across your course. No colours that anyone can make out at this distance.`,
      choices: [
        {
          label: 'Close her and speak her',
          detail: 'News, perhaps. Or trouble.',
          resolve: (g) => {
            g.clock.t += 86400 * 0.25;
            const roll = g.rng.next();
            if (roll > 0.7) {
              g.crown.gold += 40;
              g.crew.morale = clamp(g.crew.morale + 0.09, 0, 1);
              return 'A Portuguese caravel homeward bound from the Mina. They gave us news of the coast, a cask of wine, and forty cruzados for carrying letters to Lisbon.';
            }
            if (roll > 0.3) {
              g.crew.morale = clamp(g.crew.morale + 0.05, 0, 1);
              return 'A Genoese, bound for the Canaries, as surprised to see us as we were to see him. An hour of shouting across the water and we each went our way.';
            }
            g.ship.damage(g.rng.range(0.03, 0.09));
            g.crew.morale = clamp(g.crew.morale - 0.12, 0, 1);
            return 'A corsair out of Salé, and he had the weather gauge. We ran, and he chased us until dark and put two shot through the topsides before he gave it up.';
          },
        },
        {
          label: 'Haul off and let her go',
          detail: 'Nothing gained. Nothing risked.',
          resolve: (g) => {
            g.crew.morale = clamp(g.crew.morale - 0.02, 0, 1);
            return 'Hauled off two points and let her go over the horizon. She may have been a friend. There is no telling now.';
          },
        },
      ],
    }),
  },

  // --- Windfalls and losses ------------------------------------------------
  {
    id: 'ambergris',
    everyDays: 130,
    gate: (c) => c.shoreNm > 40 && day(c) && c.speedKnots < 8,
    build: () => ({
      id: 'ambergris', severity: 'note',
      title: 'Something in the water',
      text: 'A grey waxy mass floating on the swell, the size of a barrel, and the stink of it carries half a cable downwind. Ambergris — worth more by weight than anything in the hold.',
      choices: [
        {
          label: 'Put the boat over and take it aboard',
          detail: 'An hour, in this sea, and the boat is at some risk.',
          resolve: (g) => {
            g.clock.t += 86400 * 0.08;
            if (g.rng.chance(0.85)) {
              const worth = Math.round(g.rng.range(140, 420));
              g.crown.gold += worth;
              g.crew.morale = clamp(g.crew.morale + 0.14, 0, 1);
              return `Got the boat over and the whole mass aboard, stinking to heaven and worth ${worth} cruzados to the apothecaries of Lisbon. The hands are in a very good humour.`;
            }
            g.crew.morale = clamp(g.crew.morale - 0.04, 0, 1);
            return 'The boat was half swamped getting to it and the mass broke apart in their hands. We have a bucket of it and a wet boat\u0027s crew.';
          },
        },
        {
          label: 'Leave it. There is a passage to make',
          detail: 'A fortune, probably. And an hour.',
          resolve: () => 'Held our course and watched a small fortune go astern on the swell. There will be others. There are never others.',
        },
      ],
    }),
  },
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
  // --- Another ship --------------------------------------------------------
  {
    id: 'strangesail',
    everyDays: 20,
    gate: (c) => c.shoreNm < 420 && day(c) && c.absLat < 36,
    build: (c) => ({
      id: 'strangesail', severity: 'note',
      title: 'A sail on the horizon',
      text: `A sail ${signBearing(c)} — lateen, low in the water, working up along the coast. `
        + 'She has seen you and has not run, which means either that she is friendly or that '
        + 'she does not think you are worth running from.',
      choices: [
        {
          label: 'Close her and speak her',
          detail: 'A stranger who has sailed this coast knows things you do not.',
          resolve: (g) => {
            g.clock.t += 4 * 3600;
            const lead = g.hearFromStranger();
            if (lead) {
              return 'Hove to within hail for the better part of an afternoon, and between the '
                + `pilot's Arabic and your interpreter's guesswork got something out of her `
                + 'master worth writing in the book. It is in the log.';
            }
            g.crew.morale = clamp(g.crew.morale + 0.02, 0, 1);
            return 'Spoke her for an hour. Salt fish, a little water, and nothing said that you '
              + 'did not already know. The hands enjoyed seeing another ship, which is worth '
              + 'something on its own.';
          },
        },
        {
          label: 'Show her your guns and stand on',
          detail: 'Costs nothing. Teaches nothing.',
          resolve: (g) => {
            g.crew.morale = clamp(g.crew.morale + 0.01, 0, 1);
            return 'Ran out the two bombards for form\u2019s sake and stood on. She altered away '
              + 'and was hull down inside the hour.';
          },
        },
        {
          label: 'Avoid her entirely',
          detail: 'Loses a few hours to weather. Nobody knows you were here.',
          resolve: (g) => {
            g.clock.t += 2 * 3600;
            return 'Hauled off to windward until she was out of sight. Whoever she was, she has '
              + 'nothing to report about a Portuguese ship in this water.';
          },
        },
      ],
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
    id: 'sargasso',
    everyDays: 30,
    gate: (c) => c.shoreNm > 200 && c.absLat > 18 && c.absLat < 38 && day(c),
    build: () => ({
      id: 'sargasso', severity: 'note',
      title: 'Weed as far as the eye carries',
      text: 'She is sailing through a meadow. Yellow weed in rafts to the horizon, with small '
        + 'crabs in it and a smell of the shore, and no land within four hundred miles. The hands '
        + 'have decided it means shallow water and are not to be talked out of it.',
    }),
  },
  {
    id: 'phosphor',
    everyDays: 16,
    gate: (c) => c.night && c.speedKnots > 2.5,
    build: () => ({
      id: 'phosphor', severity: 'note',
      title: 'Fire in the water',
      text: 'The whole of her wake is burning cold green, and every fish that crosses it leaves a '
        + 'streak like a falling star. The watch below have come up to look at it. Nobody has any '
        + 'idea what it is.',
    }),
  },
  {
    id: 'sailhulldown',
    everyDays: 18,
    gate: (c) => day(c),
    build: (c) => ({
      id: 'sailhulldown', severity: 'note',
      title: 'A sail, hull down',
      text: `Topsails on the ${signBearing(c)} horizon and nothing else of her. She is there for `
        + 'two hours and gone by the afternoon watch, and whoever she was she never came near '
        + 'enough to speak. The ship talks about very little else for a day.',
    }),
  },
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
    id: 'argument',
    everyDays: 22,
    gate: (c) => c.daysOut > 8 && c.shoreNm > 60,
    build: (c) => ({
      id: 'argument', severity: 'note',
      title: 'An argument on the fo\u2019c\u2019sle',
      text: c.rng.pick([
        'Two men are betting a week\u2019s wine on how far south she is, and the pilot has been '
          + 'asked to settle it and has declined. The figures being shouted are three degrees apart.',
        'The cooper is telling anyone who will listen that the sun is standing higher every noon '
          + 'and that this means something. He is right, and he cannot say what.',
        'A dispute about whether the water changes colour at the line. It has been going on since '
          + 'the forenoon watch and has begun to involve the chaplain.',
      ]),
    }),
  },
  {
    id: 'dolphins',
    everyDays: 9,
    gate: (c) => day(c) && c.speedKnots > 3,
    build: () => ({
      id: 'dolphins', severity: 'note',
      title: 'Under the bow',
      text: 'Dolphins on the bow wave, a dozen of them, holding station without appearing to move '
        + 'and going faster than the ship. Half the watch is forward looking at them and the '
        + 'boatswain has given up saying anything about it.',
    }),
  },

  // --- The sea itself ------------------------------------------------------
  {
    id: 'whale',
    everyDays: 5.5,
    gate: (c) => day(c),
    build: (c) => ({
      id: 'whale', severity: 'note',
      title: 'The watch on deck',
      text: c.rng.pick([
        'Whales blowing to leeward, a dozen of them, going the other way.',
        'A great fish followed the ship all morning and the hands are uneasy about it.',
        'Porpoises playing under the bow for an hour, which the old hands say is a good sign.',
      ]),
    }),
  },
  {
    id: 'stelmo',
    everyDays: 20,
    gate: (c) => c.night && c.windKnots > 22,
    build: () => ({
      id: 'stelmo', severity: 'note',
      title: 'Corpo santo',
      text: 'St Elmo\'s fire on the mastheads in the middle watch, pale and cold and burning without heat. The whole ship\'s company on deck, and every man of them praying.',
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
      text: `${c.rng.pick(['Gonçalo Aires', 'Pero Dias', 'Fernão Vaz', 'Estêvão Lopes'])} went off the yard in the dark and is astern of us somewhere in ${c.waveHeight.toFixed(1)} metres of sea.`,
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
            g.crew.morale = clamp(g.crew.morale + 0.04, 0, 1);
            return 'Hove to and searched until the light went. Nothing. But they saw that we tried, and that is worth something to men who go aloft in the dark.';
          },
        },
        {
          label: 'Note it in the book and hold your course',
          detail: 'Keep the ground you have made. They will remember.',
          resolve: (g) => {
            g.crew.count = Math.max(1, g.crew.count - 1);
            g.crew.deaths += 1;
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
    id: 'rainwater',
    everyDays: 2.2,
    // The payoff for the doldrums. A thunder squall is a water cask, and the
    // belt stops being only a tax the moment a crew can want one.
    gate: (c) => c.rain > 0.35 && c.g.crew.provisions.water < 70,
    build: (c) => ({
      id: 'rainwater', severity: 'note',
      title: 'Rain',
      text: 'It is coming down in rods and the scuppers are running fresh. '
        + `There is ${c.g.crew.provisions.water.toFixed(0)} days\u2019 water in the ground tier.`,
      choices: [
        {
          label: 'Spread the sails and catch it',
          detail: 'The casks go back up. She lies still while it is done.',
          resolve: (g) => {
            const got = g.rng.range(6, 16);
            g.crew.provisions.water = Math.min(120, g.crew.provisions.water + got);
            g.handSail(0.2);
            g.clock.t += 3600 * g.rng.range(2, 5);
            g.crew.morale = clamp(g.crew.morale + 0.05, 0, 1);
            return `Unbent the spritsail and spread every awning we had, and filled ${got.toFixed(0)} days\u2019 `
              + 'water in an afternoon. The men stood in it with their mouths open like boys.';
          },
        },
        {
          label: 'Let it rain and keep her going',
          detail: 'Hold the ground you are making.',
          resolve: () => 'Let it rain on us and held on. The casks are no fuller and we are ten miles further south.',
        },
      ],
    }),
  },
  {
    id: 'pilotdoubt',
    everyDays: 9,
    // The pilot says the reckoning has gone wrong, and he is sometimes right.
    gate: (c) => c.doubtNm > 16 && c.daysOut > 5 && c.shoreNm > 60,
    build: (c) => {
      const out = c.rng.range(0.4, 1.6) * (c.rng.chance(0.5) ? 1 : -1);
      return {
        id: 'pilotdoubt', severity: 'warning',
        title: 'The pilot is not happy',
        text: 'The pilot has been over the traverse board twice and says the reckoning is out. '
          + `He wants to shift her ${Math.abs(out * 60).toFixed(0)} miles to the `
          + `${out > 0 ? 'north' : 'south'} on the strength of the way she has been carrying her helm. `
          + 'He may be right. He has been wrong before.',
        choices: [
          {
            label: 'Amend the reckoning as he says',
            detail: 'Trust the man who has been watching her all passage.',
            resolve: (g) => {
              // He is right about as often as a good pilot was: most of the
              // time, and the rest of the time he has made it worse.
              const right = g.rng.chance(0.62);
              g.nav.estimated.lat += right ? out : -out * 0.8;
              // The doubt barely moves either way, because nothing has been
              // *observed*: an amended reckoning is still a reckoning, and if
              // this bought back confidence the way a sight does it would be a
              // quadrant that needs no clear sky and no tables.
              g.nav.sigmaLat = Math.max(4, g.nav.sigmaLat * (right ? 0.88 : 1.25));
              return right
                ? 'Shifted her as he asked. Pricked off fresh from the new position and the whole '
                  + 'board sits better for it.'
                : 'Shifted her as he asked, and something in the set of his mouth afterwards says '
                  + 'he is no longer certain either.';
            },
          },
          {
            label: 'Hold the reckoning as it stands',
            detail: 'The board is the board. Take a sight and settle it properly.',
            resolve: (g) => {
              g.crew.morale = clamp(g.crew.morale - 0.03, 0, 1);
              return 'Told him the board stands until something better than a feeling comes along. '
                + 'He said nothing, which is what he does instead of arguing.';
            },
          },
        ],
      };
    },
  },
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
  if (g.daysSinceDecision > 4.5) {
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

  if (g.daysSinceEvent > 1.8) {
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
    case 'fish': {
      const gained = g.rng.range(1.4, 4.5);
      p.fresh += gained;
      // Credit for what was actually caught, and less than one for one. A
      // dozen bonito is a good dinner for a ship's company; it is not a cure
      // for two months of salt meat, and treating it as two days of credit per
      // day of food meant a lucky afternoon's fishing wiped out the scurvy
      // clock entirely and the disease never happened.
      g.crew.daysWithoutFresh = Math.max(0, g.crew.daysWithoutFresh - gained * 0.6);
      g.crew.morale = clamp(g.crew.morale + 0.05, 0, 1);
      break;
    }
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
    case 'whale':
    case 'stelmo':
      g.crew.morale = clamp(g.crew.morale + 0.02, 0, 1);
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
