import { people } from '../../world/peoples';
import type { Piece, PieceScene } from '../piece';

/**
 * The envoy aboard. A court sends a man to see the King of Portugal, and he
 * lives in your ship for months. Small beats, a few weeks apart, never a task
 * that stops the voyage: he is ill, he wants to know how you find the way, he
 * wants a place to pray, he asks what the King will make of him. Three things
 * count: care (how he is housed and fed), curiosity (what you show him), and
 * trust (whether you told him the truth). What he says when he gets home is
 * the mark.
 */

interface S {
  since: number;
  n: number;
  pending: number | null;
  care: number;
  curiosity: number;
  trust: number;
  /** The captain lied to him about what awaited him at Lisbon. */
  lied: boolean;
}

const GAP_DAYS = 12;
const BEATS = 4;

/** Where the envoy is being taken, and to whom: Lisbon and the King, or Nanjing and the Emperor. */
const homeOf = (xiyang: boolean): { place: string; ruler: string; Ruler: string } =>
  (xiyang ? { place: 'Nanjing', ruler: 'the Emperor', Ruler: 'The Emperor' } : { place: 'Lisbon', ruler: 'the King', Ruler: 'The King' });

function scene(n: number, faith: string, who: string, xiyang: boolean): PieceScene {
  const home = homeOf(xiyang);
  const rite = faith === 'muslim' ? 'to pray at the hours, facing Mecca' : 'to keep his own rites';
  switch (n) {
    case 0: return {
      title: 'The envoy is sick',
      text: `${who} has not kept food down for three days. The ship is not kind to men who have never left their own coast.`,
      choices: [
        { id: '0:cabin', label: 'Give him your own cabin', detail: 'You sleep in the waist. He will remember it.' },
        { id: '0:berth', label: 'Put him in the sick berth', detail: 'The surgeon sees to him with the crew.' },
        { id: '0:pass', label: 'Tell him it passes', detail: 'It does, mostly.' },
      ],
    };
    case 1: return {
      title: 'The envoy asks the way',
      text: `${who} has watched you take the sun every noon. He asks, through the interpreter, how you know where you are.`,
      choices: [
        { id: '1:show', label: 'Show him the chart and the instruments', detail: 'He will take what he learns home, and so will whoever he tells.' },
        { id: '1:some', label: 'Show him the quadrant, and say little', detail: 'A guest’s curiosity, answered.' },
        { id: '1:no', label: 'Say a captain’s road is a captain’s own', detail: 'He nods. He does not ask again.' },
      ],
    };
    case 2: return {
      title: 'The hour of prayer',
      text: `${who} asks for a place ${rite}. The waist is crowded, the helmsman is a Christian, and some of the crew have things to say.`,
      choices: [
        { id: '2:screen', label: 'Rig a screen on the quarterdeck and find the direction', detail: 'The helmsman grumbles. The envoy is quiet, and grateful.' },
        { id: '2:below', label: 'Let him use his own berth', detail: 'No trouble. No honour either.' },
        { id: '2:no', label: 'Tell him this is a Portuguese ship', detail: 'The crew are pleased. He is not.' },
      ],
    };
    default: return {
      title: `What will ${home.ruler} make of him?`,
      text: `${who} asks what will be expected of him at ${home.place}, and whether it is true ${home.ruler} receives men from every sea.`,
      choices: [
        { id: '3:truth', label: 'Tell him what you know, plainly', detail: 'He will be sobered, and he will know whom to trust.' },
        { id: '3:coach', label: 'Teach him the court’s manners on the way', detail: 'He learns, and the weeks pass quickly.' },
        { id: '3:lie', label: `Tell him ${home.ruler} will give him whatever he asks`, detail: `He will be happier until ${home.place}.` },
      ],
    };
  }
}

const EFFECT: Record<string, Partial<Pick<S, 'care' | 'curiosity' | 'trust' | 'lied'>>> = {
  '0:cabin': { care: 2, trust: 1 }, '0:berth': { care: 1 }, '0:pass': { care: -1, trust: -1 },
  '1:show': { curiosity: 2, trust: 1 }, '1:some': { curiosity: 1 }, '1:no': { curiosity: -1, trust: -1 },
  '2:screen': { care: 1, trust: 1, curiosity: 1 }, '2:below': {}, '2:no': { care: -1, trust: -1 },
  '3:truth': { trust: 2 }, '3:coach': { curiosity: 1, trust: 1 }, '3:lie': { trust: 1, lied: true },
};

export const envoy: Piece<S> = {
  id: 'envoy',
  title: 'The envoy aboard',
  /** Started by the treaty that promises him a passage, never offered. */
  available: () => false,
  start: () => ({ since: 0, n: 0, pending: null, care: 0, curiosity: 0, trust: 0, lied: false }),
  view: () => ({ title: 'The envoy aboard', lines: [], choices: [] }),
  beat: ({ g, polity }, s, days) => {
    const home = homeOf(g.campaign === 'xiyang');
    const ag = g.diplomacy.agreements.find((a) => a.kind === 'envoy' && a.polity === polity.id && a.status !== 'broken'
      && g.clock.t - a.made < 400 * 86400);
    const open = g.diplomacy.agreements.some((a) => a.kind === 'envoy' && a.polity === polity.id && a.status === 'open');
    if (!open) {
      const kept = !!ag && ag.status === 'kept';
      const total = s.care + s.curiosity + s.trust;
      if (!kept) {
        return { state: s, outcome: {
          grade: 'fail', line: `The envoy never saw ${home.ruler}, and went home with his grievance`,
          marks: [{ key: 'envoy', text: 'You promised to carry their envoy, and did not.', echo: 'They remember the envoy you did not carry.', tone: -0.8 }],
          measures: { trust: -0.1 },
        } };
      }
      const lied = s.lied;
      return { state: s, outcome: total >= 5 && !lied ? {
        grade: 'win', line: 'The envoy comes home to say the Portuguese are a people one can deal with',
        marks: [{ key: 'envoy', text: 'Your envoy came home and spoke well of you.', echo: `Their envoy came home from ${home.place} with stories, and they are told at every table.`, tone: 0.9 }],
        measures: { trust: 0.12, interest: 0.06 },
        book: [{ kind: 'person', tag: 'envoy-friend', how: 'taught', text: `A man of this court has seen ${home.place}, and speaks for you.` }],
      } : lied ? {
        grade: 'fail', line: 'The envoy found out what you had told him was not so',
        marks: [{ key: 'envoy', text: 'You told their envoy a comfortable lie, and he found out.', echo: `Their envoy learned at ${home.place} what you had promised him was not so.`, tone: -0.7 }],
        measures: { trust: -0.1 },
      } : {
        grade: 'half', line: 'The envoy comes home with a mixed report',
        marks: [{ key: 'envoy', text: 'Your envoy came home, and his report was mixed.', echo: `Their envoy has been to ${home.place} and says little of the voyage.`, tone: 0.1 }],
        measures: { trust: 0.03 },
      } };
    }
    s.since += days;
    if (s.pending !== null || s.n >= BEATS || s.since < GAP_DAYS) return { state: s };
    s.pending = s.n;
    const who = `The envoy of ${polity.name}`;
    return { state: s, scene: scene(s.n, people(polity.people).faith, who, g.campaign === 'xiyang') };
  },
  step: (_ctx, s0, choice) => {
    const s: S = { ...s0 };
    const e = EFFECT[choice];
    if (e && s.pending !== null && choice.startsWith(`${s.pending}:`)) {
      s.care += e.care ?? 0; s.curiosity += e.curiosity ?? 0; s.trust += e.trust ?? 0;
      if (e.lied) s.lied = true;
      s.pending = null; s.n += 1; s.since = 0;
    }
    return { state: s };
  },
};
