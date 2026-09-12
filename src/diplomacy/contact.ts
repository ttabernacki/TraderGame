import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { good, GIFT_GOODS } from '../economy/goods';
import { people, type People } from '../world/peoples';
import { portDef, type PortDef } from '../world/ports';
import { hasInterpreterFor, type CrewState } from '../crew/crew';

export type MoveId =
  | 'signs' | 'interpreter' | 'letter' | 'gift' | 'display' | 'respect'
  | 'promise' | 'faith' | 'padrao' | 'factory' | 'exclusive' | 'demand' | 'depart';

export interface Move {
  id: MoveId;
  label: string;
  description: string;
  /** Once used, it cannot be used again in this audience. */
  once: boolean;
}

export const MOVES: Move[] = [
  { id: 'signs', label: 'Speak by signs', description: 'Point, mime, and hope. Better than silence, and a great deal worse than words.', once: false },
  { id: 'interpreter', label: 'Send forward your interpreter', description: 'Have a man who speaks their tongue put the case properly.', once: true },
  { id: 'letter', label: 'Present the King\'s letter', description: 'Deliver the sealed letter from Dom João, addressed to whatever Christian prince might be found.', once: true },
  { id: 'gift', label: 'Offer gifts', description: 'Lay out presents from the hold. Choose carefully: what delights one court insults another.', once: false },
  { id: 'display', label: 'Show what you carry', description: 'Open the hold and let them see the trade you propose.', once: true },
  { id: 'respect', label: 'Observe their custom', description: 'Uncover, remove your shoes, wait to be called, accept what is offered. Costs nothing but pride.', once: true },
  { id: 'promise', label: 'Pledge a yearly return', description: 'Offer a standing arrangement rather than a single cargo.', once: true },
  { id: 'faith', label: 'Speak of your faith', description: 'A dangerous subject and sometimes the only door that opens.', once: true },
  { id: 'padrao', label: 'Ask leave to set a padrão', description: 'Request permission to raise a stone pillar bearing the arms of Portugal.', once: true },
  { id: 'exclusive', label: 'Ask for exclusive trade', description: 'Propose that they deal with Portugal and with no other nation.', once: true },
  { id: 'factory', label: 'Ask leave for a feitoria', description: 'Request ground to build a warehouse and leave men behind to hold it.', once: true },
  { id: 'demand', label: 'Run out the guns', description: 'Stop asking. Lay the ship broadside to the town and say what you require. It works, and it is remembered for ever.', once: true },
  { id: 'depart', label: 'Take your leave', description: 'End the audience and see where matters stand.', once: false },
];

export interface Relations {
  /** Regard for you personally, -1 to 1. */
  regard: number;
  /** Whether they have granted permission to trade. */
  mayTrade: boolean;
  exclusive: boolean;
  factory: boolean;
  padrao: boolean;
  /** Whether first contact has happened at all. */
  met: boolean;
  /** Times you have called here. */
  visits: number;
  /** Simulated time the factory here was last settled up. */
  factorySettled?: number;
}

export function newRelations(p: People): Relations {
  return {
    regard: p.disposition,
    mayTrade: false, exclusive: false, factory: false, padrao: false,
    met: false, visits: 0,
  };
}

export interface AudienceState {
  portId: string;
  peopleId: string;
  /** Their appetite for what you propose, 0-100. */
  interest: number;
  /** Their distrust of your intentions, 0-100. */
  suspicion: number;
  /** Whether you can make yourself understood at all, 0-1. */
  comprehension: number;
  used: Set<MoveId>;
  log: { speaker: 'you' | 'them' | 'narrator'; text: string }[];
  concluded: boolean;
  outcome?: AudienceOutcome;
  /** Gifts already laid out, by good id. */
  giftsGiven: Record<string, number>;
  giftValue: number;
  /** Set when the guns settled it instead of the conversation. */
  forced?: boolean;
}

export interface AudienceOutcome {
  mayTrade: boolean;
  exclusive: boolean;
  factory: boolean;
  padrao: boolean;
  regardDelta: number;
  summary: string;
  hostile: boolean;
}

export interface AudienceContext {
  crew: CrewState;
  diplomacy: number;
  hasKingsLetter: boolean;
  hasPadraoAboard: boolean;
  /** The player's standing with the Crown, which makes bolder asks plausible. */
  standing: number;
  /**
   * The captain's own road through Diplomacy.
   *
   * The two are a real fork rather than two flavours of the same thing. Treaty
   * gets you an exclusive that holds even where the old trade is established
   * and even where the room is suspicious — the slow, expensive way, and the
   * only way to a coast that goes on trading with you. Force gets you the same
   * access in one move, and costs the regard of that coast permanently, which
   * closes every future audience there and sours its neighbours.
   */
  canTreaty?: boolean;
  canForce?: boolean;
  canFeitoria?: boolean;
  relations: Relations;
  rng: Rng;
}

/**
 * An audience with a ruler.
 *
 * The central difficulty is the one the Portuguese actually ran into. Trinkets
 * that delighted a village on the Guinea coast were an insult at a court that
 * had been trading with China for three hundred years. When Vasco da Gama sent
 * his present ashore at Calicut — striped cloth, scarlet hoods, hats, coral,
 * sugar, oil and honey — the Zamorin's factors laughed at it and told him the
 * poorest merchant from Mecca gave more, and refused to forward it to the
 * palace at all.
 */
export function beginAudience(def: PortDef, ctx: AudienceContext): AudienceState {
  const p = people(def.people);
  const interpreter = hasInterpreterFor(ctx.crew, p.language);

  // Arabic was the lingua franca of the whole Indian Ocean, so a man who has it
  // can make himself understood from Sofala to Malacca.
  const arabicBridge =
    p.rivalNetwork && hasInterpreterFor(ctx.crew, 'Árabe') ? 0.55 : 0;

  const comprehension = interpreter
    ? clamp(0.55 + interpreter.ability * 0.45, 0, 1)
    : Math.max(arabicBridge, 0.12);

  const state: AudienceState = {
    portId: def.id,
    peopleId: p.id,
    interest: 12 + ctx.relations.regard * 20 + ctx.relations.visits * 4,
    suspicion: clamp(28 - ctx.relations.regard * 28 + (p.rivalNetwork ? 24 : 0), 0, 90),
    comprehension,
    used: new Set(),
    log: [],
    concluded: false,
    giftsGiven: {},
    giftValue: 0,
  };

  state.log.push({ speaker: 'narrator', text: openingLine(def, p, ctx.relations) });
  if (!interpreter && arabicBridge > 0) {
    state.log.push({
      speaker: 'narrator',
      text: 'There is a man here with Arabic, and one aboard who has it too. It is nobody\'s first language, but it will serve.',
    });
  } else if (!interpreter) {
    state.log.push({
      speaker: 'narrator',
      text: `Nobody aboard has a word of ${p.language}, and nobody ashore has a word of Portuguese. Whatever passes between you will pass by gesture.`,
    });
  }
  return state;
}

function openingLine(def: PortDef, p: People, rel: Relations): string {
  if (rel.visits > 0) {
    return `You are known here now. ${def.name} sends out a boat before your anchor is down.`;
  }
  if (p.sophistication > 0.75) {
    return `${def.name} is larger than you expected, and busier. There are ships in the roads from places you cannot identify, several of them bigger than yours. Nobody on the waterfront stops what they are doing to look at you.`;
  }
  if (p.sophistication > 0.35) {
    return `A crowd gathers on the beach at ${def.name}. After some time an official party comes down, unhurried, and waits for you to come to them.`;
  }
  return `Canoes put out from the shore at ${def.name} and stand off at a distance, watching. Eventually one comes closer than the others.`;
}

/** Moves the player can make right now. */
export function availableMoves(s: AudienceState, ctx: AudienceContext): Move[] {
  const p = people(s.peopleId);
  return MOVES.filter((m) => {
    if (m.once && s.used.has(m.id)) return false;
    switch (m.id) {
      case 'interpreter':
        return !!hasInterpreterFor(ctx.crew, p.language) || !!hasInterpreterFor(ctx.crew, 'Árabe');
      case 'letter':
        return ctx.hasKingsLetter;
      case 'padrao':
        return ctx.hasPadraoAboard && s.interest > 30;
      case 'exclusive':
        return ctx.canTreaty ? s.interest > 34 : s.interest > 55 && ctx.diplomacy > 0.5;
      case 'factory':
        return ctx.canFeitoria ? s.interest > 44 : s.interest > 68 && ctx.diplomacy > 0.65;
      case 'demand':
        return !!ctx.canForce && !s.concluded;
      case 'signs':
        return s.comprehension < 0.5;
      default:
        return true;
    }
  });
}

export interface GiftOffer {
  goodId: string;
  quantity: number;
}

/**
 * Apply a move. Returns the lines to append to the audience log; the state is
 * mutated in place.
 */
export function applyMove(
  s: AudienceState,
  move: MoveId,
  ctx: AudienceContext,
  gifts?: GiftOffer[],
): void {
  const p = people(s.peopleId);
  const def = portDef(s.portId);
  const dip = ctx.diplomacy;
  const speak = s.comprehension;

  if (MOVES.find((m) => m.id === move)?.once) s.used.add(move);

  switch (move) {
    case 'signs': {
      const gain = 3 + dip * 6;
      s.interest += gain;
      s.suspicion += 4 - dip * 3;
      s.comprehension = clamp(s.comprehension + 0.05 + dip * 0.05, 0, 0.45);
      s.log.push({
        speaker: 'narrator',
        text: 'You point at your ship, at the sea to the north, at their goods and yours. Some of it lands. A good deal of it plainly does not, and one gesture produces a reaction you did not intend and cannot interpret.',
      });
      break;
    }

    case 'interpreter': {
      const interp = hasInterpreterFor(ctx.crew, p.language) ?? hasInterpreterFor(ctx.crew, 'Árabe')!;
      s.comprehension = clamp(0.55 + interp.ability * 0.45, 0, 1);
      s.interest += 10 + interp.ability * 14;
      s.suspicion -= 8 + interp.ability * 8;
      s.log.push({
        speaker: 'narrator',
        text: `${interp.name} goes forward and speaks. The change in the room is immediate: they had been treating you as a curiosity, and now they are treating you as a party to a conversation.`,
      });
      break;
    }

    case 'letter': {
      if (p.faith === 'catholic' || p.id === 'kongo') {
        s.interest += 22;
        s.suspicion -= 14;
        s.log.push({ speaker: 'them', text: 'The letter is taken with both hands, and read aloud twice. That a king across the world should write to them is not a small thing.' });
      } else if (p.rivalNetwork) {
        s.interest += 5 * speak;
        s.suspicion += 10;
        s.log.push({ speaker: 'them', text: 'The letter is received politely and set aside. They know perfectly well what a letter from a king who has sent an armed ship means.' });
      } else {
        s.interest += 12 * speak;
        s.suspicion -= 3;
        s.log.push({ speaker: 'them', text: 'The letter is examined with interest, chiefly for the seal and the paper, which are unfamiliar.' });
      }
      break;
    }

    case 'gift': {
      if (!gifts || gifts.length === 0) break;
      let value = 0;
      let insult = 0;
      let delight = 0;
      const names: string[] = [];
      for (const g of gifts) {
        const gd = good(g.goodId);
        value += gd.lisbon * g.quantity;
        names.push(`${g.quantity} ${gd.name.toLowerCase()}`);
        s.giftsGiven[g.goodId] = (s.giftsGiven[g.goodId] ?? 0) + g.quantity;
        if (p.gifts.loves.includes(g.goodId)) delight += gd.lisbon * g.quantity;
        if (p.gifts.scorns.includes(g.goodId)) insult += gd.lisbon * g.quantity;
      }
      s.giftValue += value;

      // A court's expectation scales sharply with its own wealth and worldliness.
      const expected = 30 + p.sophistication * p.sophistication * 900 * (0.4 + def.wealth);
      const ratio = value / expected;

      if (insult > value * 0.35) {
        s.suspicion += 16;
        s.interest -= 12;
        s.log.push({
          speaker: 'them',
          text: `You offer ${names.join(', ')}. It is the wrong thing, and you understand that it is the wrong thing before anyone has said a word.`,
        });
      } else if (ratio < 0.25 && p.sophistication > 0.7) {
        s.suspicion += 10;
        s.interest -= 8;
        s.log.push({
          speaker: 'them',
          text: `Your present is laid out: ${names.join(', ')}. The factors look at it, and then at one another. One of them says, and the interpreter repeats it flatly, that the poorest merchant who comes here from Mecca gives more than this, and that they will not carry it to the palace, because to carry it would shame them as much as you.`,
        });
      } else if (ratio < 0.6) {
        s.interest += 6 + delight / Math.max(expected, 1) * 20;
        s.log.push({ speaker: 'them', text: `The gift — ${names.join(', ')} — is accepted without enthusiasm. It is not an insult. It is not much else either.` });
      } else if (ratio < 1.5) {
        s.interest += 18 + (delight / Math.max(value, 1)) * 14;
        s.suspicion -= 5;
        s.log.push({ speaker: 'them', text: `${names.join(', ')}. The gift is right, and is seen to be right. The temperature of the room changes.` });
      } else {
        s.interest += 30 + (delight / Math.max(value, 1)) * 16;
        s.suspicion -= 9;
        s.log.push({ speaker: 'them', text: `${names.join(', ')} — a present on a scale that requires an answer. They send at once for someone more senior.` });
      }
      break;
    }

    case 'display': {
      const relevantWant = Object.keys(def.wants).length > 0;
      const bonus = relevantWant ? 16 : 4;
      s.interest += bonus * (0.4 + speak * 0.6);
      s.suspicion -= 4;
      s.log.push({
        speaker: 'narrator',
        text: relevantWant
          ? 'The hold is opened. They go through it thoroughly, and pick out at once the two or three things they actually want, ignoring everything you had expected them to admire.'
          : 'The hold is opened. They look through it and find, politely, almost nothing they need. Everything you carry, they already have, and better.',
      });
      break;
    }

    case 'respect': {
      s.suspicion -= 12 + dip * 12;
      s.interest += 8 + dip * 8;
      s.log.push({
        speaker: 'narrator',
        text: 'You do it their way: you wait when you are told to wait, you go barefoot where shoes are not worn, you accept what is put in front of you and eat it. It costs an hour and a certain amount of dignity, and it is worth more than anything in the hold.',
      });
      break;
    }

    case 'promise': {
      const credible = clamp(dip * 0.6 + ctx.standing / 400 + ctx.relations.visits * 0.1, 0, 1);
      s.interest += 10 + credible * 18;
      s.suspicion -= credible * 10;
      s.log.push({
        speaker: 'them',
        text: credible > 0.5
          ? 'A yearly ship is worth more to them than a single cargo, and they say so. Terms begin to be discussed seriously.'
          : 'They have heard men promise to return before. They note it without weight.',
      });
      break;
    }

    case 'faith': {
      if (p.id === 'kongo') {
        s.interest += 30;
        s.suspicion -= 18;
        s.log.push({
          speaker: 'them',
          text: 'The question is taken up with genuine and unfeigned curiosity, and the conversation runs long past what you intended. They want priests, and books, and masons. What they are actually asking for is the whole apparatus of your world, and they have no idea what it will cost them.',
        });
      } else if (p.faith === 'muslim') {
        s.suspicion += 22;
        s.interest -= 10;
        s.log.push({
          speaker: 'them',
          text: 'The subject is closed courteously and completely. What is left unsaid is that they know exactly who you are, and what happened at Ceuta, and where the Portuguese have been going for eighty years.',
        });
      } else if (p.faith === 'hindu') {
        s.interest += 8;
        s.log.push({
          speaker: 'narrator',
          text: 'There is a long and cordial exchange in which both parties come away convinced of something. Your chaplain reports, with satisfaction, that these are Christians of an unfamiliar sort. He is entirely wrong, and it will be some years before anyone realises it.',
        });
      } else {
        s.interest += 6;
        s.suspicion += 4;
        s.log.push({ speaker: 'narrator', text: 'The subject is heard out with tolerance and no particular interest.' });
      }
      break;
    }

    case 'padrao': {
      if (s.suspicion > 55) {
        s.suspicion += 8;
        s.log.push({ speaker: 'them', text: 'Permission is refused. A stone marker with a foreign king\'s arms on it, set on their ground, is understood for exactly what it is.' });
      } else {
        s.interest += 4;
        s.log.push({ speaker: 'them', text: 'They cannot see why you would want to leave a rock on the headland, and they have no objection to it.' });
      }
      break;
    }

    case 'exclusive': {
      if (p.rivalNetwork) {
        s.suspicion += 25;
        s.interest -= 14;
        s.log.push({ speaker: 'them', text: 'To trade with you and no other would mean ending arrangements that are older than your kingdom. The proposal is not so much refused as marvelled at.' });
      } else if (s.interest > 70 && s.suspicion < 40) {
        s.interest += 6;
        s.log.push({ speaker: 'them', text: 'The idea is entertained. Not agreed, but entertained, which from this chair is a great deal.' });
      } else {
        s.suspicion += 10;
        s.log.push({ speaker: 'them', text: 'They decline, and are a little cooler afterwards. You have shown them what you actually came for.' });
      }
      break;
    }

    case 'factory': {
      if (s.interest > 78 && s.suspicion < 32) {
        s.log.push({ speaker: 'them', text: 'Ground is offered near the water: a warehouse, a house for your factor, and men of yours to live in it. It is granted as a commercial convenience. Nobody in the room is thinking about what a warehouse becomes when it acquires a wall.' });
      } else {
        s.suspicion += 14;
        s.log.push({ speaker: 'them', text: 'Foreigners living permanently on their ground, under their own law, is refused without much discussion.' });
      }
      break;
    }

    case 'demand': {
      // Not a negotiation. The room is not persuaded, it is overruled — which
      // is exactly what the Portuguese did at Calicut when persuasion failed,
      // and exactly why they were never trusted on that coast again.
      s.forced = true;
      s.interest = Math.max(s.interest, 66);
      s.suspicion = Math.min(100, s.suspicion + 46);
      s.log.push({
        speaker: 'narrator',
        text: 'The ship warps round until her broadside bears on the landing and the ports come up. '
          + 'Nobody in the room has seen guns before and everybody in it understands them. You are '
          + 'given what you asked for, and you are watched out of the harbour by men who will tell '
          + 'this story to their grandchildren.',
      });
      concludeAudience(s, ctx);
      return;
    }

    case 'depart':
      concludeAudience(s, ctx);
      return;
  }

  s.interest = clamp(s.interest, 0, 100);
  s.suspicion = clamp(s.suspicion, 0, 100);

  // A rival trading network works against you between your own moves.
  if (p.rivalNetwork && ctx.rng.chance(0.3)) {
    s.suspicion += 5;
    s.log.push({
      speaker: 'narrator',
      text: 'Merchants of the old trade have been in the ruler\'s ear since your anchor went down. You are not present for those conversations and cannot answer them.',
    });
  }

  if (s.suspicion > 92) {
    concludeAudience(s, ctx);
  }
}

/**
 * How an experienced captain would read the room.
 *
 * The screen showed interest and suspicion as two bars and never said that
 * what decides the outcome is the difference between them — so a player could
 * run the interest up to eighty, never notice the suspicion had gone to
 * ninety, take his leave, and be told he had got nothing, with no way of
 * knowing which of the six things he did was the mistake. This reads off the
 * same expression concludeAudience() settles on, so it can never flatter the
 * player about a room that is going to refuse him.
 */
export function audienceReading(s: AudienceState): { text: string; state: 'good' | 'warn' | 'bad' } {
  const net = s.interest - s.suspicion * 0.85;
  if (s.suspicion > 85 && s.interest < 30) {
    return {
      text: 'There are more men on the beach than there were. Leave now and you leave for good.',
      state: 'bad',
    };
  }
  if (net > 74) {
    return {
      text: 'They would give you ground to build on, if you asked for it and did not spoil it.',
      state: 'good',
    };
  }
  if (net > 62) {
    return { text: 'They would prefer Portugal to whoever comes next. Ask for it.', state: 'good' };
  }
  if (net > 12) {
    return {
      text: 'You have enough. Take your leave now and you go away with leave to trade.',
      state: 'good',
    };
  }
  if (net > -10) {
    return {
      text: 'Not enough. They are neither pleased nor alarmed, and would let you go away with nothing.',
      state: 'warn',
    };
  }
  return {
    text: 'Badly. Their suspicion is running ahead of their interest and nothing will be agreed today.',
    state: 'bad',
  };
}

export function concludeAudience(s: AudienceState, _ctx: AudienceContext): void {
  if (s.concluded) return;
  s.concluded = true;

  const p = people(s.peopleId);
  const net = s.interest - s.suspicion * 0.85;
  const hostile = s.suspicion > 85 && s.interest < 30;

  const treaty = !!_ctx.canTreaty;
  const outcome: AudienceOutcome = {
    mayTrade: s.forced || net > 12,
    exclusive: s.forced
      || (s.used.has('exclusive')
        && (treaty
          ? net > 40 && s.suspicion < 62
          : net > 62 && !p.rivalNetwork && s.suspicion < 35)),
    factory: s.used.has('factory')
      && (_ctx.canFeitoria ? net > 52 && s.suspicion < 52 : net > 74 && s.suspicion < 32),
    padrao: s.forced || (s.used.has('padrao') && s.suspicion < 55),
    // What force costs. The access is real and the coast is lost: every later
    // audience here opens from a ruler who remembers the guns.
    regardDelta: s.forced ? -0.85 : clamp(net / 130, -0.55, 0.5),
    hostile: hostile && !s.forced,
    summary: '',
  };

  if (s.forced) {
    outcome.summary = 'You have what you came for. You will not get it here a second time by asking.';
  } else if (hostile) {
    outcome.summary = 'The audience ends badly. You are told to be gone by morning, and there are more armed men on the beach than there were when you landed.';
  } else if (outcome.factory) {
    outcome.summary = 'You have leave to trade, and ground to build a factory on. This is more than your instructions asked for.';
  } else if (outcome.exclusive) {
    outcome.summary = 'You have leave to trade, and an understanding that Portugal is to be preferred.';
  } else if (outcome.mayTrade) {
    outcome.summary = 'You have leave to trade. Terms will be argued in the market like anywhere else, but the door is open.';
  } else if (net > -10) {
    outcome.summary = 'The audience ends inconclusively. You are not welcome and not unwelcome; come back when you have something they want.';
  } else {
    outcome.summary = 'Nothing is agreed. Whatever you came for, you have not got it.';
  }

  s.outcome = outcome;
  s.log.push({ speaker: 'narrator', text: outcome.summary });
}

/** Apply an audience's result to the standing relations. */
export function applyOutcome(rel: Relations, outcome: AudienceOutcome): void {
  rel.met = true;
  rel.visits += 1;
  rel.regard = clamp(rel.regard + outcome.regardDelta, -1, 1);
  if (outcome.mayTrade) rel.mayTrade = true;
  if (outcome.exclusive) rel.exclusive = true;
  if (outcome.factory) rel.factory = true;
  if (outcome.padrao) rel.padrao = true;
  if (outcome.hostile) rel.mayTrade = false;
}

/** Goods aboard that are plausible as presents. */
export function giftCandidates(cargo: { goodId: string; quantity: number }[]): { goodId: string; quantity: number }[] {
  return cargo.filter((c) => GIFT_GOODS.includes(c.goodId) && c.quantity > 0);
}

/** What this court expects a present to be worth. */
export function expectedGiftValue(def: PortDef): number {
  const p = people(def.people);
  return Math.round(30 + p.sophistication * p.sophistication * 900 * (0.4 + def.wealth));
}
