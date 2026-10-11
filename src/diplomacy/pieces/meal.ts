import type { Piece, PieceView } from '../piece';

/**
 * The meal. Dates and water are brought before a word is said, and everything
 * you take puts you in the host's debt. A short mirror game: the host acts
 * first, his own example is the only clue, and you copy the right gesture
 * (the hand, the seat, the order, the thanks). Halfway the host tests you: a
 * fast, or a feast, and what he does shows which. How you decline matters more
 * than whether you do. A guest of the house opens doors; a stranger who is
 * merely served talks to the merchants through a broker.
 */

type Test = 'fast' | 'feast';
interface Step {
  /** What the host does; the right answer is whichever option echoes it. */
  host: string[];
  /** Index 0 is always the echo; shuffled when shown. */
  options: string[];
  prompt: string;
}

const STEPS: Step[] = [
  { prompt: 'Water is brought in a basin.',
    host: ['The host washes his right hand, palm up, and dries it on the cloth held out to him.', 'The host washes his right hand, then his mouth, and dries on the cloth.'],
    options: ['Wash your right hand, palm up, and take the cloth', 'Wash both hands together', 'Wave the basin away'] },
  { prompt: 'The host gestures to the cushions.',
    host: ['The host sits at the head, and gestures the person he honours to his right.', 'The host sits, folds his legs, and gestures to the cushion on his right.'],
    options: ['Take the cushion on his right', 'Take the cushion across from him', 'Wait to be told twice'] },
  { prompt: 'Dates and a bowl are set before you.',
    host: ['The host takes three dates with his right hand, eating the first before he speaks.', 'The host takes a date, eats it slowly, and only then speaks of the weather.'],
    options: ['Take dates with your right hand and eat before you speak', 'Speak first, and eat when he does', 'Take a handful for later'] },
  { prompt: 'The meal ends.',
    host: ['The host lays his hand on his chest and says the blessing on the house.', 'The host touches his chest, and blesses the house and the bread.'],
    options: ['Lay a hand on your chest and bless the house in your interpreter’s words', 'Rise and thank him in Portuguese', 'Say nothing, and bow'] },
];

interface S {
  n: number;
  /** Order in which the options are shown, as indexes into Step.options. */
  order: number[][];
  hostLine: number[];
  test: Test;
  right: number;
  tested: boolean;
  said: string[];
  /** Whether the last answer in the test was kind. */
  testScore: number;
}

const COURTS = new Set(['malindi', 'kilwa', 'mombasa', 'mogadishu', 'aden', 'hormuz']);

export const meal: Piece<S> = {
  id: 'meal',
  title: 'The meal',
  available: (g, pol) => COURTS.has(pol.id)
    && !g.diplomacy.pieces.runs.some((r) => r.pieceId === 'meal' && r.polity === pol.id),
  start: ({ rng }) => ({
    n: 0,
    order: STEPS.map((s) => rng.shuffle(s.options.map((_, i) => i))),
    hostLine: STEPS.map((s) => Math.floor(rng.next() * s.host.length)),
    test: rng.next() < 0.5 ? 'fast' : 'feast',
    right: 0, tested: false, said: [], testScore: 0,
  }),
  view: (_ctx, s): PieceView => {
    const lines: PieceView['lines'] = [];
    if (s.said.length === 0) lines.push({ who: 'narrator', text: 'Dates and water are brought before a word is said. You are a guest in the house, if you can be one.' });
    for (const t of s.said.slice(-3)) lines.push({ who: 'narrator', text: t });
    if (s.n < STEPS.length) {
      const st = STEPS[s.n];
      lines.push({ who: 'narrator', text: st.prompt });
      lines.push({ who: 'them', text: st.host[s.hostLine[s.n]] });
      return { title: 'The meal', lines, choices: s.order[s.n].map((i) => ({ id: `s:${i}`, label: st.options[i] })) };
    }
    lines.push({ who: 'narrator', text: s.test === 'fast'
      ? 'The host sets his own plate aside, untouched. The servants bring yours, and a second dish, and wait.'
      : 'The host presses a second dish on you with his own hand, and then a third. Every man at the table is watching how you take it.' });
    return { title: 'The meal', lines, choices: [
      { id: 't:take', label: 'Take it and eat' },
      { id: 't:decline', label: 'Decline gracefully, with a hand on your chest' },
      { id: 't:explain', label: 'Explain through the interpreter that your faith or your crew’s habits differ' },
    ] };
  },
  step: (_ctx, s0, choice) => {
    const s: S = JSON.parse(JSON.stringify(s0));
    if (choice.startsWith('s:') && s.n < STEPS.length) {
      const ok = Number(choice.slice(2)) === 0;
      if (ok) s.right += 1;
      s.said.push(ok ? 'The host nods, barely.' : 'There is a pause, and nobody says anything about it.');
      s.n += 1;
      return { state: s };
    }
    if (!choice.startsWith('t:')) return { state: s };
    const c = choice.slice(2);
    // In a fast the gracious thing is to decline; at a feast, to take. Explaining is never wrong, only second best.
    const best = s.test === 'fast' ? 'decline' : 'take';
    const test = c === best ? 2 : c === 'explain' ? 1 : 0;
    const total = s.right + test;
    const mark = (text: string, echo: string, tone: number) => [{ key: 'meal', text, echo, tone }];
    if (total >= 5) {
      return { state: s, outcome: {
        grade: 'win', line: 'You are a guest of the house',
        marks: mark('You ate as a guest of the house.', 'They remember you at their table, and speak of it as guest-right.', 0.7),
        measures: { trust: 0.07, respect: 0.02 },
        book: [{ kind: 'custom', tag: 'guest-right', how: 'seen', text: 'Eat with the right hand, sit on the host’s right, bless the house. In a fast, decline with a hand on the chest.' }],
        factions: { faith: 0.08, trade: 0.05 },
      } };
    }
    if (total >= 3) {
      return { state: s, outcome: {
        grade: 'half', line: 'You are served, and not quite taken in',
        marks: mark('You were served, and no more.', '', 0.1),
        measures: { trust: 0.02 },
      } };
    }
    return { state: s, outcome: {
      grade: 'fail', line: 'You are served, and treated as a stranger',
      marks: mark('Your manners at the table were noticed.', 'They remember a guest who did not know how to be one.', -0.4),
      measures: { respect: -0.03 },
      factions: { faith: -0.06 },
    } };
  },
};
