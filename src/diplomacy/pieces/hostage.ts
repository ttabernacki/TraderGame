import type { Piece, PieceScene } from '../piece';

/**
 * The hostage's letters. A chief's son stays among your people as surety for
 * your good faith, and news of him comes by letter, weeks old. The day a
 * letter is written is not the day it is read, so you decide from stale news:
 * he was ailing a month ago, and may be dead or well now. Doctor, goods, or
 * hold your hand; or buy him out. His father hears of him too, and so does the
 * court. Nothing here requires a return to anywhere: the letters find you.
 */

interface S {
  /** The boy's real health now, 0 to 1, and a month ago. */
  h: number;
  hPrev: number;
  /** His father's patience, 0 to 1, falling when the boy is ill and nothing is done. */
  anger: number;
  n: number;
  since: number;
  pending: number | null;
  spent: number;
  freed: boolean;
}

const LETTERS = 4;
const GAP_DAYS = 38;

const WORDS = (h: number): string => (h > 0.75 ? 'well, and learning to ride' : h > 0.5 ? 'quiet, and eating a little' : h > 0.3 ? 'pale, and has stopped asking after his father' : 'very ill: the surgeon does not speak of what comes next');

export const hostage: Piece<S> = {
  id: 'hostage',
  title: 'The hostage',
  available: (g, pol) => pol.id === 'azenegue' && g.polityState(pol.id).met
    && !g.diplomacy.pieces.runs.some((r) => r.pieceId === 'hostage'),
  start: ({ rng }) => ({ h: 0.4 + rng.next() * 0.4, hPrev: 0.6, anger: 0.2, n: 0, since: 0, pending: null, spent: 0, freed: false }),
  view: () => ({ title: 'The hostage', lines: [], choices: [] }),
  beat: ({ rng }, s, days) => {
    s.since += days;
    if (s.pending === null && (s.n >= LETTERS || s.freed)) {
      const good = s.h > 0.5 && s.anger < 0.5;
      return { state: s, outcome: s.freed ? {
        grade: 'half' as const, line: 'The boy goes home to his father, bought out',
        marks: [{ key: 'hostage', text: 'You bought the hostage out, and sent him home.', echo: 'They remember that you let the boy go, and what it cost.', tone: 0.3 }],
        measures: { trust: 0.05 }, gold: -s.spent,
      } : good ? {
        grade: 'win' as const, line: 'The boy is a young man now, and speaks for you at his father’s fire',
        marks: [{ key: 'hostage', text: 'A chief’s son grew up in your care, and was well.', echo: 'The boy you kept is spoken of as a son of two houses.', tone: 0.8 }],
        measures: { trust: 0.12, respect: 0.04 }, gold: -s.spent,
        book: [{ kind: 'person' as const, tag: 'hostage-son', how: 'taught' as const, text: 'A chief’s son of this people was raised in your keeping, and speaks for you.' }],
      } : s.h > 0.2 ? {
        grade: 'half' as const, line: 'The boy lives, but his father does not forget the hungry year',
        marks: [{ key: 'hostage', text: 'The boy lived, but badly.', echo: 'His father counts the cost of the winter his son was ill.', tone: -0.2 }],
        measures: { trust: -0.02 }, gold: -s.spent,
      } : {
        grade: 'fail' as const, line: 'The boy died in your keeping, and his father has been told so',
        marks: [{ key: 'hostage', text: 'A chief’s son died in your keeping.', echo: 'His father counts you among his dead son’s killers.', tone: -1 }],
        measures: { trust: -0.25, respect: -0.05 }, gold: -s.spent,
      } };
    }
    if (s.pending !== null || s.since < GAP_DAYS) return { state: s };
    // A month passes at the other end of the road, whatever the captain decides.
    s.hPrev = s.h;
    s.h = Math.max(0, Math.min(1, s.h - 0.06 + (rng.next() - 0.55) * 0.25));
    if (s.h < 0.4) s.anger = Math.min(1, s.anger + 0.15);
    s.pending = s.n;
    const noisy = Math.max(0, Math.min(1, s.hPrev + (rng.next() - 0.5) * 0.15));
    const scene: PieceScene = {
      title: `A letter about the boy (${s.n + 1} of ${LETTERS})`,
      text: `A letter has found you, written a month ago. It says the boy is ${WORDS(noisy)}. His father has asked after him again. What you do now will arrive weeks from now, and he may not be as the letter says.`,
      choices: [
        { id: `${s.n}:doctor`, label: 'Send a physician to him', detail: 'It costs 30 cruzados. If he was ill, it may save him; if well, it is wasted.' },
        { id: `${s.n}:goods`, label: 'Send his father a present, and the boy a kind word', detail: 'It costs 15 cruzados, and quiets the father a little.' },
        { id: `${s.n}:hold`, label: 'Do nothing: the boy is well treated', detail: 'Free. If the letter is stale, so is your silence.' },
        { id: `${s.n}:free`, label: 'Pay what it costs and send him home', detail: 'It costs 90 cruzados. Ends it, and not as a victory.' },
      ],
    };
    return { state: s, scene };
  },
  step: (_ctx, s0, choice) => {
    const s: S = { ...s0 };
    if (s.pending === null || !choice.startsWith(`${s.pending}:`)) return { state: s };
    const how = choice.slice(2);
    if (how === 'doctor') {
      s.spent += 30;
      // A physician cures a sick boy; sent to a well one he frightens him, and insults the father.
      if (s.h < 0.6) s.h = Math.min(1, s.h + 0.3); else { s.h -= 0.08; s.anger = Math.min(1, s.anger + 0.2); }
    }
    else if (how === 'goods') { s.spent += 15; s.anger = Math.max(0, s.anger - 0.25); s.h = Math.min(1, s.h + 0.05); }
    else if (how === 'free') { s.spent += 90; s.freed = true; }
    s.pending = null; s.n += 1; s.since = 0;
    return { state: s };
  },
};
