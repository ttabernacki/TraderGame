import { clamp } from '../core/math';
import type { Officer, OfficerRole } from '../crew/crew';
import type { SeaEvent } from './seaEvents';
import type { Game } from './state';

/**
 * The wardroom's opinion, put to the captain before he commits.
 *
 * Every hard decision in the game used to arrive as a card with three options
 * and nobody's view of them, which wasted the best-written part of the game —
 * six men with histories and voices — on story beats that fired and went away.
 * This puts them at the captain's elbow at the moments that matter. Each man
 * says what he would do and why, in his own terms: the pilot about the water,
 * the master about the ship, the clerk about the King's cargo, the surgeon
 * about the men.
 *
 * And they are sometimes wrong. How often is his ability: a good pilot reads a
 * lee shore right nearly every time, and an indifferent one talks just as
 * confidently and is wrong one time in three. His temperament decides which
 * way he is wrong — a cautious man wants to heave to, the Crown's clerk will
 * never throw cargo over — so a captain who listens learns, over a voyage,
 * which of them to trust about what. Nothing on the card says which is which.
 */

export interface Counsel {
  /** The man's name. */
  who: string;
  /** His office aboard, in English. */
  office: string;
  /** What he says. */
  says: string;
  /** Index of the choice he backs, if any of them. */
  backs: number | null;
}

type Voice = OfficerRole;

/** One man's argument for one course. */
type Argument = Partial<Record<Voice, string>>;

interface Rule {
  /** Who speaks, in order of how much the question is his. At most three do. */
  voices: Voice[];
  /** The course the situation actually calls for, as a pattern on the choice labels. */
  right: (g: Game, e: SeaEvent) => RegExp;
  /** Which way each man goes when he reads it wrong. */
  bias: Partial<Record<Voice, RegExp>>;
  /** What each man says for each course, keyed by the same patterns. */
  args: [RegExp, Argument][];
}

const OFFICE: Record<Voice, string> = {
  piloto: 'pilot', mestre: 'master', contramestre: 'boatswain', escrivao: 'clerk',
  cirurgiao: 'surgeon', capelao: 'chaplain', lingua: 'interpreter', degredado: 'degredado',
};

// Patterns, named once so the rules below read as sentences.
const HEAVE_TO = /^Heave to/;
const RUN = /^Run before/;
const HOLD = /^Hold your course/;
const CLAW = /^Claw off/;
const START = /^Start the cargo/;
const ANCHOR = /^Anchor/;
const LIGHTEN = /^Lighten her/;
const KEDGE = /^Lay out a kedge/;
const LIE = /^Let her lie/;
const CAULK = /^Shift the cargo/;
const FOTHER = /^Fother/;
const PUMPS = /^Put more hands/;
const SHORTEN = /^Shorten down/;
const CARRY = /^Carry on/;
const SEARCH = /^Heave to and search/;
const STAND_ON_NOTE = /^Note it in the book/;
const LAY_TO = /^Heave to until/;
const STAND_LEAD = /^Stand on, with the lead/;
const AMEND = /^Amend the reckoning/;
const KEEP_BOARD = /^Hold the reckoning/;
const FIGHT = /^Fight her/;
const BUY_OFF = /^Buy her off/;
const SUCCOUR = /^Go alongside/;
const WATER_GO = /^Give her water/;
const STAND = /^Stand on$/;
const TAKE = /^Take her/;
const WARN = /^Warn him off/;
const LET_ALONE = /^Let him alone/;
const CATCH_RAIN = /^Spread the sails/;
const LET_RAIN = /^Let it rain/;
const INSHORE = /^Stand in/;
const OFFING = /^Keep your offing/;

const RULES: Record<string, Rule> = {
  'gale:making': {
    voices: ['piloto', 'mestre', 'contramestre'],
    right: (g) => {
      // No sea room to run in, or a ship that will not stand being driven:
      // lie to it. Otherwise it is a question of how much she can take.
      if (g.sounding.shoreDistNm < 70) return HEAVE_TO;
      if (g.ship.condition.hull < 0.7 || g.crew.fatigue > 0.55) return HEAVE_TO;
      if (g.ship.baseHull.strength >= 0.8) return HOLD;
      return RUN;
    },
    bias: { piloto: HEAVE_TO, mestre: HOLD, contramestre: HEAVE_TO },
    args: [
      [HEAVE_TO, {
        piloto: 'Lie to it. I know roughly where we are and I would like to go on knowing — '
          + 'running blind before a gale is how a reckoning is lost.',
        mestre: 'Heave her to. She has been worked hard enough this passage and I do not like '
          + 'what I heard from the seams in the last blow.',
        contramestre: 'The hands are done in, sir. Heave to and give them a watch below, or '
          + 'there will be nobody fit to go aloft when it matters.',
      }],
      [RUN, {
        piloto: 'Run. There is sea room all round us for a hundred leagues and I would rather '
          + 'find her again on the chart than find her on her beam ends.',
        mestre: 'Square away and let her run. She is a flyer off the wind and she will take no '
          + 'harm going with it.',
        contramestre: 'Run her, sir. The men would rather be going somewhere, even the wrong way.',
      }],
      [HOLD, {
        piloto: 'Hold the course. Every hour hove to is an hour of set I cannot account for.',
        mestre: 'She will take it close-reefed. She was built for worse than this, and we have '
          + 'a passage to make.',
        contramestre: 'Hold on, sir. I will have every deadeye looked at twice. She will stand it.',
      }],
    ],
  },

  'gale:leeshore': {
    voices: ['mestre', 'piloto', 'escrivao'],
    right: (_g, e) => {
      const f = e.facts ?? {};
      if (f.holding) return CLAW;
      if (f.lightHolds && hasChoice(e, START)) return START;
      if (hasChoice(e, ANCHOR)) return ANCHOR;
      return hasChoice(e, START) ? START : CLAW;
    },
    bias: { mestre: CLAW, piloto: ANCHOR, escrivao: CLAW },
    args: [
      [CLAW, {
        mestre: 'Claw off. She has it in her if the gear holds, and I will answer for the gear.',
        piloto: 'Claw off while there is still room to do it. The ground here is foul and I '
          + 'would not trust an anchor in it.',
        escrivao: 'Whatever is done, the cargo stays in her. It is entered in the King’s '
          + 'book, and I will have to account for every quintal of it.',
      }],
      [START, {
        mestre: 'Start the cargo. Lighter, she will look up a point and a half, and that point '
          + 'and a half is the difference.',
        piloto: 'Lighten her. On these numbers she goes ashore as she is, and I have done the '
          + 'numbers twice.',
        escrivao: 'If it must go over, let it be entered that it went for the ship. I will '
          + 'write it so. The Casa has seen this before.',
      }],
      [ANCHOR, {
        mestre: 'Let go everything we have and ride it out. She will not claw off this.',
        piloto: 'Anchor. It is good holding here — sand and shell, I had it on the lead an hour '
          + 'ago — and she will lie to it better than she will sail off it.',
        escrivao: 'Anchor, and keep the ship and the cargo both. The King loses nothing that way.',
      }],
    ],
  },

  aground: {
    voices: ['mestre', 'piloto', 'escrivao'],
    right: (g, e) => {
      const f = e.facts ?? {};
      if (g.ship.condition.hull < 0.6 && hasChoice(e, LIGHTEN)) return LIGHTEN;
      if ((f.hours ?? 12) > 9 && hasChoice(e, LIGHTEN)) return LIGHTEN;
      return KEDGE;
    },
    bias: { mestre: KEDGE, piloto: LIE, escrivao: KEDGE },
    args: [
      [LIGHTEN, {
        mestre: 'Lighten her and get her off on this tide. Every hour she lies here she is '
          + 'working her own seams open.',
        piloto: 'The flood will not be enough for hours. Lighten her now while the hands are '
          + 'fresh.',
        escrivao: 'If cargo goes over the side I shall need your hand on the entry, captain.',
      }],
      [KEDGE, {
        mestre: 'A kedge out astern and the whole company at the capstan. She will come off on '
          + 'the flood.',
        piloto: 'The water is making soon enough. Lay out the kedge and wait for it.',
        escrivao: 'Wait for the water. There is no call to be throwing the King’s goods '
          + 'into the sea for a few hours’ tide.',
      }],
      [LIE, {
        mestre: 'Let her lie. Fighting the ground on a falling tide does more harm than sitting '
          + 'on it.',
        piloto: 'Let her sit. The bottom here is soft and she will float of her own accord.',
        escrivao: 'Let her lie, and nothing is lost that has to be written down.',
      }],
    ],
  },

  leak: {
    voices: ['mestre', 'contramestre', 'escrivao'],
    right: (g) => (g.daysSincePort > 40 || g.ship.condition.hull < 0.75 ? CAULK : FOTHER),
    bias: { mestre: CAULK, contramestre: PUMPS, escrivao: FOTHER },
    args: [
      [CAULK, {
        mestre: 'Break out the hold and caulk it properly. A seam that starts once starts again, '
          + 'and next time it will be in weather.',
        contramestre: 'Give me a day and the hold and I will have her tight.',
        escrivao: 'If the hold is broken out I shall have to count it all again. But do it '
          + 'if it must be done.',
      }],
      [FOTHER, {
        mestre: 'Fother it and press on. We are near enough a port to have it done properly there.',
        contramestre: 'A sail over it will hold. It always holds long enough.',
        escrivao: 'Fother it. The cargo stays stowed and nothing is disturbed.',
      }],
      [PUMPS, {
        mestre: 'Pump her. It is not making enough to be worth a day.',
        contramestre: 'The pumps, sir. The men can stand it for a week.',
        escrivao: 'The pumps. It costs the King nothing.',
      }],
    ],
  },

  squall: {
    voices: ['mestre', 'contramestre'],
    right: (g) => (g.ship.canvasSet > 0.6 || g.ship.condition.hull < 0.8 ? SHORTEN : CARRY),
    bias: { mestre: CARRY, contramestre: SHORTEN },
    args: [
      [SHORTEN, {
        mestre: 'Hand it now, before it strikes. It is twenty minutes of our time against a '
          + 'topmast.',
        contramestre: 'Let me get the hands up now, sir, not when it is on us.',
      }],
      [CARRY, {
        mestre: 'She will carry it. She has carried worse and she is making good way.',
        contramestre: 'Hold on, sir. The men want to see her go through it.',
      }],
    ],
  },

  overboard: {
    voices: ['capelao', 'contramestre', 'piloto'],
    right: (g) => (g.weatherNow.waveHeight < 3.5 ? SEARCH : STAND_ON_NOTE),
    bias: { capelao: SEARCH, contramestre: SEARCH, piloto: STAND_ON_NOTE },
    args: [
      [SEARCH, {
        capelao: 'We turn back for him. Whatever it costs, the men must see that we turn back.',
        contramestre: 'Let me have the boat, sir. He was one of mine.',
        piloto: 'Heave to. In this sea there is a chance, and I will mark where he went.',
      }],
      [STAND_ON_NOTE, {
        capelao: 'I will say the office for him. God forgive us, a boat in this sea is two more '
          + 'drowned.',
        contramestre: 'There is no boat that will live in that, sir. I will not ask men to go.',
        piloto: 'He is gone, captain. A boat in this sea is more men lost.',
      }],
    ],
  },

  nightloom: {
    voices: ['piloto', 'mestre'],
    right: (g) => (g.nav.sigmaLon > 25 || g.sounding.shoreDistNm < 30 ? LAY_TO : STAND_LEAD),
    bias: { piloto: LAY_TO, mestre: STAND_LEAD },
    args: [
      [LAY_TO, {
        piloto: 'Heave to until the light. I am not sure enough of where we are to put her at '
          + 'something I cannot see.',
        mestre: 'Lie to. A night lost is a night. A ship lost is the voyage.',
      }],
      [STAND_LEAD, {
        piloto: 'Stand on. There is no land within a day of us by the board, and the lead will '
          + 'tell us long before anything else does.',
        mestre: 'Stand on with a man in the chains. That lookout sees breakers in every cloud.',
      }],
    ],
  },

  pilotdoubt: {
    voices: ['mestre', 'escrivao'],
    right: (g) => (g.nav.sigmaLat > 20 ? AMEND : KEEP_BOARD),
    bias: { mestre: AMEND, escrivao: KEEP_BOARD },
    args: [
      [AMEND, {
        mestre: 'Let him shift it. He has been watching her carry her helm all passage and so '
          + 'have I. She has been falling off.',
        escrivao: 'Amend it, and I shall note that the pilot asked for it.',
      }],
      [KEEP_BOARD, {
        mestre: 'Hold it. A feeling is not a sight, and he will have his sight at noon.',
        escrivao: 'The board is what is written. I would not change a written thing on a '
          + 'feeling.',
      }],
    ],
  },

  rainwater: {
    voices: ['cirurgiao', 'mestre'],
    right: (g) => (g.crew.provisions.water < 40 ? CATCH_RAIN : LET_RAIN),
    bias: { cirurgiao: CATCH_RAIN, mestre: LET_RAIN },
    args: [
      [CATCH_RAIN, {
        cirurgiao: 'Catch it. The water in the casks is going green, and this is clean.',
        mestre: 'Spread everything. We do not know when we will next water.',
      }],
      [LET_RAIN, {
        cirurgiao: 'We have water enough. Keep her going and have them on shore the sooner.',
        mestre: 'Keep her going. We are well found for water and this breeze will not last.',
      }],
    ],
  },

  'hail:corsair': {
    voices: ['contramestre', 'escrivao', 'capelao'],
    right: (_g, e) => ((e.facts?.odds ?? 0.4) > 0.55 ? FIGHT : BUY_OFF),
    bias: { contramestre: FIGHT, escrivao: BUY_OFF, capelao: BUY_OFF },
    args: [
      [FIGHT, {
        contramestre: 'We can hold them on the gangway, sir. The men are ready for it and they '
          + 'would rather fight than pay.',
        escrivao: 'Fight her. I have the Crown’s money in my charge and I will not see it '
          + 'handed to a Moor in a basket.',
        capelao: 'God is with those who defend what is theirs. I will be on the deck with them.',
      }],
      [BUY_OFF, {
        contramestre: 'Pay him, sir. Sixty men who do this for their living against ours — I '
          + 'would not.',
        escrivao: 'Pay. It is the ordinary arrangement, and it is cheaper than a ship.',
        capelao: 'Pay him and spare the men. There is no honour in burying them for money.',
      }],
    ],
  },

  'hail:distressed': {
    voices: ['capelao', 'mestre', 'cirurgiao'],
    right: (g) => (g.crew.provisions.water > 45 ? SUCCOUR : WATER_GO),
    bias: { capelao: SUCCOUR, mestre: WATER_GO, cirurgiao: SUCCOUR },
    args: [
      [SUCCOUR, {
        capelao: 'We go to them. That is the whole of it.',
        mestre: 'Give me three days and the spare spar and I will have her sailing.',
        cirurgiao: 'There will be men over there who need me more than ours do. Take me across.',
      }],
      [WATER_GO, {
        capelao: 'Water at least. We cannot leave them with nothing.',
        mestre: 'Give her water and go. Three days and our spare spar is more than we can spare.',
        cirurgiao: 'Water, and go. Our own casks will not last three days of that.',
      }],
      [STAND, {
        capelao: 'God forgive me, captain, there is nothing we can do for them.',
        mestre: 'Stand on. We are not fit to carry another ship’s company.',
        cirurgiao: 'We cannot take on their sick. Stand on.',
      }],
    ],
  },

  'hail:interloper': {
    voices: ['escrivao', 'contramestre', 'capelao'],
    right: (_g, e) => (hasChoice(e, TAKE) && (e.facts?.odds ?? 0.5) > 0.6 ? TAKE : WARN),
    bias: { escrivao: TAKE, contramestre: TAKE, capelao: WARN },
    args: [
      [TAKE, {
        escrivao: 'Your commission is plain, captain. I shall have to write down what you do '
          + 'about her either way.',
        contramestre: 'Say the word, sir. She has half our men and none of our spirit.',
        capelao: 'The King has ordered it, and the Holy Father drew the line.',
      }],
      [WARN, {
        escrivao: 'Warn him off. A fight costs men and ship, and Lisbon will count those too.',
        contramestre: 'Let him go, sir. He will not come back south of the line in a hurry.',
        capelao: 'Let him go. They are Christians and they are poor seamen a long way from home.',
      }],
      [LET_ALONE, {
        escrivao: 'He is none of our business without a commission. Let him be.',
        contramestre: 'Leave him, sir.',
        capelao: 'Leave him be.',
      }],
    ],
  },

  newcoast: {
    voices: ['piloto', 'mestre', 'lingua'],
    right: (g) => (g.weatherNow.wind.speed > 22 || g.ship.condition.hull < 0.7 ? OFFING : INSHORE),
    bias: { piloto: INSHORE, mestre: OFFING, lingua: INSHORE },
    args: [
      [INSHORE, {
        piloto: 'Stand in and run it close. A coast seen from ten leagues off is a coast '
          + 'drawn by guesswork.',
        mestre: 'Take her in. It is fine weather for it, and we will never have it better.',
        lingua: 'Take us in close. Where there is smoke there are people, and where there are '
          + 'people there is a tongue to learn.',
      }],
      [OFFING, {
        piloto: 'Keep the offing. We do not know this ground and I would not put her on it in '
          + 'the dark.',
        mestre: 'Keep her off. This wind will set us on it, and an unknown coast has no '
          + 'harbours we know of.',
        lingua: 'Keep off until we see who lives here. Not every beach wants visitors.',
      }],
    ],
  },
};

/** Scenes that belong to one family share its counsel. */
function ruleFor(id: string): Rule | null {
  return RULES[id] ?? null;
}

function hasChoice(e: SeaEvent, p: RegExp): boolean {
  return (e.choices ?? []).some((c) => p.test(c.label));
}

function indexOf(e: SeaEvent, p: RegExp): number {
  return (e.choices ?? []).findIndex((c) => p.test(c.label));
}

/** A number from 0 to 1 that is the same every time for the same man and question. */
function steady(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** How likely this man is to read this situation right. */
function judgement(o: Officer): number {
  const trait = o.trait ?? '';
  return clamp(0.34 + o.ability * 0.6
    + (trait === 'veteran' ? 0.08 : 0)
    + (trait === 'ambitious' || trait === 'proud' ? -0.05 : 0), 0.3, 0.95);
}

/** What the wardroom says about this decision. Empty when nobody has a view. */
export function counselFor(g: Game, e: SeaEvent, askedT: number): Counsel[] {
  const rule = ruleFor(e.id);
  if (!rule || !e.choices || e.choices.length < 2) return [];
  const right = rule.right(g, e);
  const aboard = g.crew.officers.filter((o) => o.alive && !o.ashoreAt);
  const out: Counsel[] = [];
  for (const voice of rule.voices) {
    if (out.length >= 3) break;
    const o = aboard.find((x) => x.role === voice);
    if (!o) continue;
    const readsIt = steady(`${e.id}:${o.id}:${Math.floor(askedT / 3600)}`) < judgement(o);
    let pick = readsIt ? right : (rule.bias[voice] ?? right);
    // When his bias happens to be the right course, being wrong means backing
    // something else — so a biased man is not accidentally always right.
    if (!readsIt && pick.source === right.source) {
      const other = rule.args.map(([p]) => p).find((p) => p.source !== right.source && hasChoice(e, p));
      if (other) pick = other;
    }
    if (!hasChoice(e, pick)) pick = right;
    const arg = rule.args.find(([p]) => p.source === pick.source)?.[1];
    const says = arg?.[voice];
    if (!says) continue;
    out.push({ who: o.name, office: OFFICE[voice], says, backs: indexOf(e, pick) });
  }
  return out;
}
