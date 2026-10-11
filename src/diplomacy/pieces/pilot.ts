import type { Piece, PieceScene } from '../piece';

/**
 * The pilot's test. A pilot offers to take you across to India, and you judge
 * a stranger's word at sea over two or three days. He is one of three men,
 * which you are not told: true (right nearly always), proud (he claims more
 * than he knows) or somebody else's (he leans you toward Mombaça's friends).
 * Each beat he claims something you can follow, check against your own
 * reckoning at the cost of a little time and a little of his pride, or refuse.
 * What the passage costs you shows whom you trusted.
 */

type Kind = 'true' | 'proud' | 'agent';
interface S {
  kind: Kind;
  n: number;
  since: number;
  pending: number | null;
  /** Count of times his claim was followed and was right/wrong. */
  rightFollowed: number;
  wrongFollowed: number;
  checked: number;
  refused: number;
  /** Per-beat: whether his claim is true. */
  truth: boolean[];
  pride: number;
}

const GAP_DAYS = 1.5;
const BEATS = 3;

const CLAIMS = [
  { title: 'The pilot names a star', text: (who: string) => `${who} says the star he is steering by stands over the mast, and that you hold too far south by a hand. He points.` },
  { title: 'The pilot smells the shoal', text: (who: string) => `${who} says the water has changed colour and a bank lies two watches ahead; he wants her hauled to the north.` },
  { title: 'The pilot promises the landfall', text: (who: string) => `${who} says the coast of Gujarat will rise before the next noon, off the bow, and bids you hold the course.` },
];

function truthFor(kind: Kind, rngNext: () => number): boolean {
  return kind === 'true' ? rngNext() < 0.92 : kind === 'proud' ? rngNext() < 0.55 : rngNext() < 0.25;
}

export const pilot: Piece<S> = {
  id: 'pilot',
  title: 'The pilot',
  /** Offered at the monsoon ports of the Swahili coast and Arabia, once. */
  available: (g, pol) => (pol.id === 'malindi' || pol.id === 'aden')
    && !g.diplomacy.pieces.runs.some((r) => r.pieceId === 'pilot' && r.polity === pol.id),
  start: ({ rng }) => {
    const r = rng.next();
    const kind: Kind = r < 0.5 ? 'true' : r < 0.8 ? 'proud' : 'agent';
    return { kind, n: 0, since: 0, pending: null, rightFollowed: 0, wrongFollowed: 0, checked: 0, refused: 0,
      truth: [0, 1, 2].map(() => truthFor(kind, () => rng.next())), pride: 0 };
  },
  view: () => ({ title: 'The pilot', lines: [], choices: [] }),
  beat: (ctx, s, days) => {
    s.since += days;
    if (s.n >= BEATS && s.pending === null) {
      const total = s.rightFollowed - s.wrongFollowed;
      const hurt = s.wrongFollowed;
      const offended = s.kind === 'true' && s.checked >= 2;
      const outcome = hurt === 0 && !offended && s.rightFollowed + s.checked >= 2 ? {
        grade: 'win' as const, line: 'The pilot brings you across, and you knew whom to believe',
        marks: [{ key: 'pilot', text: 'You hired a pilot and read him right.', echo: 'Pilots at this port say you know a true man from a talker.', tone: 0.6 }],
        measures: { respect: 0.04, trust: 0.03 },
        book: [{ kind: 'person' as const, tag: 'pilot-' + ctx.polity.id, how: 'taught' as const, text: s.kind === 'true' ? 'A pilot of this port: honest, and worth having again.' : 'A pilot of this port, read and measured at sea.' }],
      } : total >= 0 ? {
        grade: 'half' as const, line: offended ? 'You reach the coast, and the pilot is not speaking to you: you checked a true man too often' : 'You reach the coast, a little later than you should have',
        marks: [{ key: 'pilot', text: offended ? 'You doubted an honest pilot once too often.' : 'You crossed with a pilot who cost you a day or two.', echo: offended ? 'Pilots here say you do not trust a man who has not earned it, and do not know when he has.' : '', tone: offended ? -0.2 : 0 }],
        measures: { respect: 0.0 },
      } : {
        grade: 'fail' as const, line: 'The pilot cost you days, and you followed him when you should not have',
        marks: [{ key: 'pilot', text: 'You were led astray by a pilot you did not check.', echo: 'They tell the story of the captain who followed a pilot who did not know his own sea.', tone: -0.5 }],
        measures: { respect: -0.03 },
      };
      return { state: s, outcome };
    }
    if (s.pending !== null || s.n >= BEATS || s.since < GAP_DAYS) return { state: s };
    s.pending = s.n;
    const c = CLAIMS[s.n];
    const scene: PieceScene = {
      title: c.title,
      text: c.text('The pilot'),
      choices: [
        { id: `${s.n}:follow`, label: 'Do as he says', detail: 'If he is right, you gain a day. If not, you lose some.' },
        { id: `${s.n}:check`, label: 'Check it against your own reckoning first', detail: 'Costs a little time and a little of his pride, and tells you whether he is right.' },
        { id: `${s.n}:refuse`, label: 'Keep your own course', detail: 'You trust your own reckoning, and say so.' },
      ],
    };
    return { state: s, scene };
  },
  step: (_ctx, s0, choice) => {
    const s: S = JSON.parse(JSON.stringify(s0));
    if (s.pending === null || !choice.startsWith(`${s.pending}:`)) return { state: s };
    const how = choice.slice(2);
    const right = s.truth[s.pending];
    if (how === 'follow') { if (right) s.rightFollowed += 1; else s.wrongFollowed += 1; }
    else if (how === 'check') { s.checked += 1; s.pride += 1; if (right) s.rightFollowed += 1; }
    else { s.refused += 1; s.pride += 2; if (right) s.wrongFollowed += 1; }
    s.pending = null; s.n += 1; s.since = 0;
    return { state: s };
  },
};
