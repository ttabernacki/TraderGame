import { clamp } from '../core/math';
import type { Officer } from '../crew/crew';
import { officerTitle, traitDef } from '../progression/officers';
import type { SeaEvent } from './seaEvents';
import type { Game } from './state';

/**
 * The quarterdeck.
 *
 * Sea events are things the sea does. These are things the men do, and they are
 * the ones that ought to be remembered, because they have a name attached and
 * because the captain's answer is a judgement about a person rather than about
 * weather.
 *
 * Every one of them costs something either way. Backing an officer costs you
 * with the rest, overruling him costs you with him, and a man whose loyalty has
 * gone is worth less of whatever he is good at — which is how a captain who
 * always takes the safe answer arrives off the Cape with a pilot who no longer
 * volunteers what he sees.
 */

interface Context {
  g: Game;
  o: Officer;
  /** Days at sea since the last port. */
  daysOut: number;
}

interface OfficerEventDef {
  id: string;
  /** Mean days between occurrences while the gate stands open. */
  everyDays: number;
  /** Which men can raise this. */
  who: (c: Context) => boolean;
  build: (c: Context) => SeaEvent;
}

/** Move a man's regard for his captain, and remember why. */
function regard(o: Officer, delta: number, why: string): void {
  o.loyalty = clamp(o.loyalty + delta, 0, 1);
  o.memory = [why, ...(o.memory ?? [])].slice(0, 6);
}

/** Every officer aboard except the one raising the matter. */
function others(g: Game, o: Officer): Officer[] {
  return g.crew.officers.filter((x) => x.alive && !x.ashoreAt && x.id !== o.id);
}

const has = (c: Context, trait: string) => c.o.trait === trait;

const EVENTS: OfficerEventDef[] = [
  // --- The pilot who wants to turn back ------------------------------------
  {
    id: 'turnback',
    everyDays: 26,
    who: (c) => (c.o.role === 'piloto' || c.o.role === 'mestre')
      && c.g.beyondTheKnown && c.daysOut > 22
      && (has(c, 'timid') || c.g.crew.morale < 0.45),
    build: (c) => ({
      id: 'turnback',
      title: `${c.o.name} asks to speak with you`,
      severity: 'warning',
      text: `Your ${officerTitle(c.o).toLowerCase()} comes aft with his hat in his hand and says `
        + 'what half the ship has been saying forward: that no Portuguese has been in this water, '
        + 'that the stores will not last a return from further on, and that a captain who turns '
        + 'back with a chart is better thought of than one who does not come back at all.',
      choices: [
        {
          label: 'Hear him out, and stand on regardless',
          detail: 'He has said his piece and been listened to. The ship goes south.',
          resolve: (g) => {
            regard(c.o, -0.06, 'was heard out and overruled south of the known world');
            g.crew.morale = clamp(g.crew.morale - 0.02, 0, 1);
            return `${c.o.name} was heard out at length, thanked, and told the course stands. `
              + 'He went forward without another word, which is not the same as agreement.';
          },
        },
        {
          label: 'Tell him plainly to keep his opinions',
          detail: 'Ends it now. He will not raise it again, or anything else.',
          resolve: (g) => {
            regard(c.o, -0.22, 'was told before the watch to keep his opinions to himself');
            g.crew.unrest = clamp(g.crew.unrest + 0.12, 0, 2);
            g.crew.morale = clamp(g.crew.morale - 0.05, 0, 1);
            return `${c.o.name} was told, in front of the watch, that the working of this ship `
              + 'is not a matter for a council. He has not spoken since except to give orders.';
          },
        },
        {
          label: 'Promise to put about at the next headland',
          detail: 'Buys the ship’s heart, and you will be held to it.',
          resolve: (g) => {
            regard(c.o, 0.16, 'was given his word that she would put about');
            g.crew.morale = clamp(g.crew.morale + 0.09, 0, 1);
            g.crew.unrest = clamp(g.crew.unrest - 0.25, 0, 2);
            for (const x of others(g, c.o)) regard(x, 0.03, 'saw the captain give his word');
            return 'You gave your word that she would go about at the next cape worth naming. '
              + 'It went round the ship in an hour. They will remember it either way.';
          },
        },
      ],
    }),
  },

  // --- The boatswain and the flogging --------------------------------------
  {
    id: 'flogging',
    everyDays: 30,
    who: (c) => c.o.role === 'contramestre' && c.g.crew.morale < 0.6 && c.daysOut > 12,
    build: (c) => ({
      id: 'flogging',
      title: 'A matter of discipline',
      severity: 'warning',
      text: `${c.o.name} has a man at the mainmast who was found asleep in the middle watch, `
        + 'with the ship under all plain sail and land somewhere to leeward. He wants two dozen '
        + 'at the capstan bar and he wants the ship to watch it.',
      choices: [
        {
          label: 'Let him have his two dozen',
          detail: 'The ship is run tighter. The fo’c’sle is sullen for a week.',
          resolve: (g) => {
            regard(c.o, 0.12, 'was backed over the man asleep on watch');
            g.crew.unrest = clamp(g.crew.unrest - 0.18, 0, 2);
            g.crew.morale = clamp(g.crew.morale - 0.06, 0, 1);
            return 'Two dozen at the capstan bar with the ship\u2019s company mustered. Nobody '
              + 'has slept on watch since, and nobody has said much either.';
          },
        },
        {
          label: 'A dozen, and the matter closed',
          detail: 'Neither of them gets what he wanted.',
          resolve: (g) => {
            regard(c.o, -0.03, 'halved his sentence');
            g.crew.unrest = clamp(g.crew.unrest - 0.08, 0, 2);
            g.crew.morale = clamp(g.crew.morale - 0.015, 0, 1);
            return 'A dozen, and the man back in his watch by eight bells. The boatswain thinks '
              + 'you soft and the fo’c’sle thinks you fair, which is the usual result.';
          },
        },
        {
          label: 'Stop his wine a week and no more',
          detail: 'The hands will love you. The boatswain will remember.',
          resolve: (g) => {
            regard(c.o, -0.18, 'let a man off before the whole ship');
            g.crew.morale = clamp(g.crew.morale + 0.07, 0, 1);
            g.crew.unrest = clamp(g.crew.unrest + 0.1, 0, 2);
            return 'His wine stopped a week, and that was the end of it. The boatswain rigged '
              + 'the grating down again without being told and has been very correct since.';
          },
        },
      ],
    }),
  },

  // --- The clerk and the Crown's books -------------------------------------
  {
    id: 'books',
    everyDays: 40,
    who: (c) => c.o.role === 'escrivao' && c.g.ventures.some((v) => !v.delivered && !v.failed),
    build: (c) => ({
      id: 'books',
      title: `${c.o.name} has been through the cargo book`,
      severity: 'note',
      text: 'The Crown’s clerk points out, correctly and in writing, that a quantity of the '
        + 'cargo aboard is carried on private charter and not on the King’s account, and asks '
        + 'whether he is to enter it as such in the book that goes to the Casa da Guiné.',
      choices: [
        {
          label: 'Enter it. Every cask.',
          detail: 'Honest books. The Crown takes its share of the freight.',
          resolve: (g) => {
            regard(c.o, 0.18, 'had the private freight entered honestly');
            const cut = Math.round(g.ventures.reduce((s, v) => s + (v.delivered ? 0 : v.fee), 0) * 0.12);
            g.crown.gold -= cut;
            g.crown.standing += 4;
            g.crown.lifetimeStanding += 4;
            return `Every cask entered under its owner’s name. ${cut} cruzados of freight will `
              + 'go to the Crown, and the Casa will hear that this ship keeps a straight book.';
          },
        },
        {
          label: 'Tell him it is ship’s stores',
          detail: 'Keeps the freight. If it is ever discovered it is a hanging matter.',
          resolve: (g) => {
            regard(c.o, -0.2, 'made him write a lie into the King’s book');
            g.crew.morale = clamp(g.crew.morale + 0.01, 0, 1);
            return 'He wrote what he was told, and drew a small mark beside it that he thinks '
              + 'you did not see.';
          },
        },
        {
          label: 'Offer him a share of the freight',
          detail: 'Buys his silence, and his opinion of you.',
          resolve: (g) => {
            const bribe = 60;
            g.crown.gold -= bribe;
            regard(c.o, 0.05, 'bought him with a share of the freight');
            return `${bribe} cruzados to the clerk, and the entry reads as you would wish. He took `
              + 'it readily, which tells you something about him and something about what he '
              + 'expects of captains.';
          },
        },
      ],
    }),
  },

  // --- The interpreter's request -------------------------------------------
  {
    id: 'shorepartry',
    everyDays: 34,
    who: (c) => (c.o.role === 'lingua' || c.o.role === 'degredado')
      && c.g.sounding.shoreDistNm < 25 && c.daysOut > 6,
    build: (c) => ({
      id: 'shorepartry',
      title: `${c.o.name} wants to be put ashore`,
      severity: 'note',
      text: 'There is smoke over the trees and a canoe put out this morning and thought better of '
        + `it. ${c.o.name} says that if he is landed alone and unarmed he will be taken to whoever `
        + 'rules here, and that in a month he will have the language and the trade of the place. '
        + 'He also says, without being asked, that he may not be alive in a month.',
      choices: [
        {
          label: 'Put him ashore',
          detail: 'Costs you the man aboard. May be worth a kingdom.',
          resolve: (g) => {
            c.o.ashoreAt = g.dockedAt ?? 'coast';
            c.o.ashoreSince = g.clock.t;
            regard(c.o, 0.2, 'was trusted to go ashore alone');
            g.crew.morale = clamp(g.crew.morale - 0.02, 0, 1);
            return `${c.o.name} went over the side into the boat with a bag of hawks’ bells and `
              + 'a red cap, and walked up the beach without looking back at the ship.';
          },
        },
        {
          label: 'Not here. Not yet.',
          detail: 'Keeps him aboard and useful.',
          resolve: () => {
            regard(c.o, -0.05, 'was kept aboard when he asked to be landed');
            return 'He was told this was not the place. He looked at the smoke for a long while '
              + 'after the ship stood on.';
          },
        },
      ],
    }),
  },

  // --- The chaplain --------------------------------------------------------
  {
    id: 'massrequest',
    everyDays: 42,
    who: (c) => c.o.role === 'capelao' && (c.g.crew.morale < 0.5 || c.g.crew.scurvy > 0.2),
    build: (c) => ({
      id: 'massrequest',
      title: `${c.o.name} asks for the ship`,
      severity: 'note',
      text: 'The chaplain wants the ship hove to for a whole afternoon: a mass said properly on '
        + 'the main deck, the awning rigged, the wine issued, and every man off duty who can '
        + 'stand. He says the ship’s company is in a bad way and that it is not only the '
        + 'scurvy.',
      choices: [
        {
          label: 'Heave to. Say the mass.',
          detail: 'Half a day’s run lost. The ship is a different ship after it.',
          resolve: (g) => {
            regard(c.o, 0.18, 'was given the ship for a whole afternoon');
            g.crew.morale = clamp(g.crew.morale + 0.14, 0, 1);
            g.crew.unrest = clamp(g.crew.unrest - 0.35, 0, 2);
            g.crew.fatigue = clamp(g.crew.fatigue - 0.15, 0, 1);
            g.clock.t += 5 * 3600;
            return 'Hove to under a backed foresail from noon until the first dog watch, awning '
              + 'rigged, wine issued, and the whole company on the main deck. Five hours of the '
              + 'passage gone and every one of them worth it.';
          },
        },
        {
          label: 'He may say it at the change of the watch',
          detail: 'The forms observed, the ship kept moving.',
          resolve: (g) => {
            regard(c.o, -0.02, 'was given the change of the watch instead of the afternoon');
            g.crew.morale = clamp(g.crew.morale + 0.04, 0, 1);
            return 'Mass said at the change of the watch with the ship under way and the men in '
              + 'two minds about whether they were attending it.';
          },
        },
      ],
    }),
  },

  // --- The ambitious man's proposal ----------------------------------------
  {
    id: 'ambition',
    everyDays: 45,
    who: (c) => has(c, 'ambitious') && c.daysOut > 30,
    build: (c) => ({
      id: 'ambition',
      title: `${c.o.name} makes a proposal`,
      severity: 'note',
      text: `Your ${officerTitle(c.o).toLowerCase()} has been keeping a book of his own — courses, `
        + 'soundings, the set of the current, the look of every headland. He offers to hand it over '
        + 'entire, and to swear to whatever account of the voyage you care to give in Lisbon, if '
        + 'you will speak for him at the Casa when you get home.',
      choices: [
        {
          label: 'Take the book, and give your word',
          detail: 'A better chart, and a debt you will be expected to pay.',
          resolve: (g) => {
            regard(c.o, 0.25, 'promised to speak for him at the Casa');
            g.crown.standing += 8;
            g.crown.lifetimeStanding += 8;
            g.nav.sigmaLat = Math.max(2, g.nav.sigmaLat * 0.7);
            g.nav.sigmaLon = Math.max(4, g.nav.sigmaLon * 0.75);
            return 'His book came aft that evening and it is better than yours. Whatever else he '
              + 'is, he can observe. You have promised him a word at the Casa da Guiné and he has '
              + 'written that down too.';
          },
        },
        {
          label: 'The book is the King’s. Take it.',
          detail: 'Legally unanswerable. He will not forget it.',
          resolve: (g) => {
            regard(c.o, -0.3, 'took his private book from him by right');
            g.nav.sigmaLat = Math.max(2, g.nav.sigmaLat * 0.78);
            g.nav.sigmaLon = Math.max(4, g.nav.sigmaLon * 0.82);
            for (const x of others(g, c.o)) regard(x, -0.04, 'saw a man’s private book taken');
            return 'Every observation made aboard a Crown ship is the Crown’s, and he knew it '
              + 'before he asked. The book is in your cabin. He has not been aft since.';
          },
        },
        {
          label: 'Let him keep it, and say nothing to Lisbon',
          detail: 'Costs you nothing now.',
          resolve: () => {
            regard(c.o, 0.04, 'let him keep his own book');
            return 'He keeps his book. One day it will be read in Lisbon by somebody, and your '
              + 'name will be in it exactly as he found you.';
          },
        },
      ],
    }),
  },

  // --- Wine ----------------------------------------------------------------
  {
    id: 'winetheft',
    everyDays: 38,
    who: (c) => has(c, 'drunk') && c.daysOut > 15,
    build: (c) => ({
      id: 'winetheft',
      title: 'Short in the wine',
      severity: 'warning',
      text: `The steward has the casks eleven arrobas short of the book, and the ship knows quite `
        + `well where it went. ${c.o.name} is at his post, and has been at his post, and is not `
        + 'entirely at his post.',
      choices: [
        {
          label: 'Break him before the ship',
          detail: 'Loses you an officer. Gains you a rule everyone can see.',
          resolve: (g) => {
            regard(c.o, -0.4, 'was broken before the ship over the wine');
            c.o.ability = clamp(c.o.ability - 0.1, 0.05, 1);
            g.crew.unrest = clamp(g.crew.unrest - 0.15, 0, 2);
            g.crew.morale = clamp(g.crew.morale - 0.03, 0, 1);
            return `${c.o.name} disrated before the ship’s company and his wine stopped for the `
              + 'voyage. He does his work. He does not do a hand’s turn beyond it.';
          },
        },
        {
          label: 'Take him aside',
          detail: 'Between the two of you, which is where he would rather have it.',
          resolve: () => {
            regard(c.o, 0.14, 'took him aside over the wine rather than breaking him');
            c.o.trait = 'steady';
            return 'A quarter of an hour in the great cabin with the door shut, and nobody else '
              + 'aboard knows what was said. He has been dry since, and careful, and he knows '
              + 'exactly what he owes you.';
          },
        },
      ],
    }),
  },
];

/**
 * Roll for something happening on the quarterdeck. Deliberately rarer than the
 * sea events — a captain who is asked to judge his officers every week is
 * running a court, not a ship.
 */
export function rollOfficerEvent(g: Game, days: number): SeaEvent | null {
  if (days <= 0 || g.dockedAt) return null;
  const aboard = g.crew.officers.filter((o) => o.alive && !o.ashoreAt);
  if (aboard.length === 0) return null;

  for (const def of EVENTS) {
    if (g.recentEvents.includes(def.id)) continue;
    for (const o of aboard) {
      const c: Context = { g, o, daysOut: g.daysSincePort };
      if (!def.who(c)) continue;
      if (!g.rng.chance(days / def.everyDays)) break;
      return def.build(c);
    }
  }
  return null;
}

/** What this man would say about the captain, for the crew screen. */
export function officerOpinion(o: Officer): string {
  const t = traitDef(o.trait);
  const memory = o.memory?.[0];
  if (memory) return `Remembers that the captain ${memory}.`;
  return t?.blurb ?? 'Does his work and keeps his own counsel.';
}
