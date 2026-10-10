import { hasInterpreterFor } from '../../crew/crew';
import { GIFT_GOODS, good } from '../../economy/goods';
import { people } from '../../world/peoples';
import type { Piece, PieceView } from '../piece';
import type { PolityDef } from '../polities';

/**
 * The gift table. Before the audience you set a ranked tray from your hold:
 * the place of honour, then the rest. Every voice in the court reads each good
 * differently, and you know only some of it. Who knows a thing is the lesson
 * ("ask the merchants"), not a list to memorise: each court's table has a few
 * quirks drawn fresh for the run.
 */

type R = -1 | 0 | 1;
interface S {
  /** Goods you might lay on the tray, with how many are aboard. */
  stock: Record<string, number>;
  tray: string[];
  /** Hidden reactions by voice then good, and the ruler's own. */
  react: Record<string, Record<string, R>>;
  ruler: Record<string, number>;
  /** "voice:good" or "ruler:good" pairs you have learned. */
  known: string[];
  asks: number;
}

const SLOTS = 3;
const W = [1, 0.6, 0.4];
const MAX_ASKS = 2;
const ISLAMIC = new Set(['islam', 'sunni', 'muslim']);

function baseReaction(pol: PolityDef, cares: string, goodId: string): R {
  const gd = good(goodId);
  const pe = people(pol.people);
  if (cares === 'trade') return gd.lisbon >= 20 ? 1 : gd.lisbon <= 4 ? -1 : 0;
  if (cares === 'war') return ['ferramenta', 'cavalos', 'cobre', 'bacias'].includes(goodId) ? 1 : 0;
  if (cares === 'faith') {
    return ISLAMIC.has(pe.faith) && goodId === 'vinho' ? -1 : ['incenso', 'cera', 'coral'].includes(goodId) ? 1 : 0;
  }
  return pe.gifts.loves.includes(goodId) ? 1 : pe.gifts.scorns.includes(goodId) ? -1 : 0;
}

function rulerTerm(pol: PolityDef, goodId: string): number {
  const pe = people(pol.people);
  return pol.wants.includes(goodId) ? 1 : pe.gifts.loves.includes(goodId) ? 0.7 : pe.gifts.scorns.includes(goodId) ? -1 : 0;
}

/** What the tray is worth to this court, and whether it gave offence. Pure, so bots can use it. */
export function trayScore(s: Pick<S, 'tray' | 'react' | 'ruler'>, pol: PolityDef): { score: number; offence: boolean } {
  let score = 0;
  let offence = false;
  s.tray.forEach((id, i) => {
    let fac = 0;
    for (const f of pol.factions) fac += f.weight * (s.react[f.id]?.[id] ?? 0);
    const rt = s.ruler[id] ?? 0;
    score += W[i] * (0.5 * fac + rt);
    if (i === 0 && rt < 0) offence = true;
  });
  return { score, offence };
}

const word = (r: R): string => (r > 0 ? 'pleased' : r < 0 ? 'offended' : 'unmoved');

export const giftTable: Piece<S> = {
  id: 'gifts',
  title: 'The tray',
  available: (g, pol) => pol.id !== 'khoi' && pol.id !== 'tupi'
    && Object.keys(giftStock(g)).length > 0
    && !g.diplomacy.pieces.runs.some((r) => r.pieceId === 'gifts' && r.polity === pol.id && !r.outcome),
  start: ({ g, polity, rng }) => {
    const stock = giftStock(g, polity);
    const react: Record<string, Record<string, R>> = {};
    const ruler: Record<string, number> = {};
    for (const id of Object.keys(stock)) ruler[id] = rulerTerm(polity, id);
    for (const f of polity.factions) {
      react[f.id] = {};
      for (const id of Object.keys(stock)) react[f.id][id] = baseReaction(polity, f.cares, id);
      // One quirk per voice: a thing it reads the other way from what you'd guess.
      const ids = Object.keys(stock);
      const q = ids[Math.floor(rng.next() * ids.length)];
      const cur = react[f.id][q];
      react[f.id][q] = cur === 0 ? (rng.next() < 0.5 ? -1 : 1) : (-cur as R);
    }
    // What you know to begin with: your knowledge of the court and an interpreter's word.
    const st = g.polityState(polity.id);
    const interp = hasInterpreterFor(g.crew, people(polity.people).language);
    const pairs: string[] = [];
    for (const id of Object.keys(stock)) {
      pairs.push(`ruler:${id}`);
      for (const f of polity.factions) pairs.push(`${f.id}:${id}`);
    }
    const n = Math.min(pairs.length, 2 + Math.floor(st.knowledge * 4) + (interp ? 2 : 0));
    // A court's own man tells you one of the ruler's tastes; the rest is luck and knowledge.
    const rulerPairs = rng.shuffle(pairs.filter((p) => p.startsWith('ruler:')));
    const rest = rng.shuffle(pairs.filter((p) => !p.startsWith('ruler:')).concat(rulerPairs.slice(1)));
    const known = [rulerPairs[0], ...rest.slice(0, n - 1)];
    return { stock, tray: [], react, ruler, known, asks: 0 };
  },
  view: (ctx, s): PieceView => {
    const pol = ctx.polity;
    const lines: PieceView['lines'] = [{
      who: 'narrator',
      text: s.tray.length === 0
        ? `Before you go in, your tray is to be set. The first place is the place of honour. ${pol.title} will see it first.`
        : `On the tray: ${s.tray.map((id, i) => `${['the place of honour', 'second', 'third'][i]}: ${good(id).english.toLowerCase()}`).join('; ')}.`,
    }];
    for (const id of Object.keys(s.stock)) {
      const bits: string[] = [];
      if (s.known.includes(`ruler:${id}`)) {
        const t = s.ruler[id];
        bits.push(`${pol.title}: ${t > 0.8 ? 'wants it' : t > 0 ? 'would like it' : t < 0 ? 'would take it ill' : 'indifferent'}`);
      }
      for (const f of pol.factions) {
        if (s.known.includes(`${f.id}:${id}`)) bits.push(`${f.name.replace(/^The /, 'the ')}: ${word(s.react[f.id][id])}`);
      }
      if (bits.length) lines.push({ who: 'them', text: `${good(id).english}: ${bits.join('; ')}.` });
    }
    const choices: PieceView['choices'] = Object.keys(s.stock)
      .filter((id) => !s.tray.includes(id))
      .map((id) => ({ id: `place:${id}`, label: `Place ${good(id).english.toLowerCase()}`, disabled: s.tray.length >= SLOTS }));
    if (s.tray.length > 0) choices.push({ id: 'undo', label: 'Take the last one off' });
    if (s.asks < MAX_ASKS) {
      for (const f of pol.factions) {
        if (Object.keys(s.stock).some((id) => !s.known.includes(`${f.id}:${id}`))) {
          choices.push({ id: `ask:${f.id}`, label: `Ask who knows ${f.name.replace(/^The /, 'the ')}`, hint: `${MAX_ASKS - s.asks} asks left` });
        }
      }
    }
    choices.push({ id: 'done', label: 'Carry the tray in', disabled: s.tray.length === 0 });
    return { title: 'The tray', lines, choices };
  },
  step: (ctx, s0, choice) => {
    const s: S = JSON.parse(JSON.stringify(s0));
    const pol = ctx.polity;
    if (choice.startsWith('place:')) {
      const id = choice.slice(6);
      if (s.tray.length < SLOTS && s.stock[id] && !s.tray.includes(id)) s.tray.push(id);
      return { state: s };
    }
    if (choice === 'undo') { s.tray.pop(); return { state: s }; }
    if (choice.startsWith('ask:')) {
      const fid = choice.slice(4);
      if (s.asks < MAX_ASKS) {
        s.asks += 1;
        for (const id of Object.keys(s.stock)) if (!s.known.includes(`${fid}:${id}`)) s.known.push(`${fid}:${id}`);
      }
      return { state: s };
    }
    if (choice !== 'done' || s.tray.length === 0) return { state: s };

    const { score, offence } = trayScore(s, pol);
    let value = 0;
    let loved = false;
    let scorned = false;
    for (const id of s.tray) {
      ctx.g.ship.removeCargo(id, 1);
      value += good(id).lisbon;
      if (s.ruler[id] > 0.6) loved = true;
      if (s.ruler[id] < 0) scorned = true;
    }
    // Every meaning the tray taught you goes into the Book, for the next court that shares it.
    const book = s.tray.map((id) => ({
      kind: 'gift' as const, tag: `gift-${id}`, how: (s.known.includes(`ruler:${id}`) ? 'told' : 'blundered') as 'told' | 'blundered',
      text: `${good(id).english}: ${s.ruler[id] > 0.8 ? 'the ruler wants it' : s.ruler[id] > 0 ? 'liked' : s.ruler[id] < 0 ? 'taken ill' : 'of no account'} here.`,
    }));
    const gift = { value, loved, scorned };
    if (offence || score < 0.3) {
      return { state: s, outcome: {
        grade: 'fail', line: offence ? 'The tray is laughed at, and one voice remembers whose it was' : 'The tray is received without comment',
        marks: [{ key: 'tray', text: 'Your gifts were mocked.', echo: 'They still tell the story of the tray.', tone: -0.6 }],
        measures: { respect: -0.05, interest: -0.02 }, book, gift,
      } };
    }
    if (score >= 1.2) {
      return { state: s, outcome: {
        grade: 'win', line: 'The tray is read, and read well',
        marks: [{ key: 'tray', text: 'Your gifts were praised.', echo: 'They remember that you brought what they would have asked for.', tone: 0.6 }],
        measures: { respect: 0.05, interest: 0.04 }, book, gift,
      } };
    }
    return { state: s, outcome: {
      grade: 'half', line: 'The tray is received with courtesy',
      marks: [{ key: 'tray', text: 'Your gifts were received.', echo: '', tone: 0.1 }],
      measures: { respect: 0.01 }, book, gift,
    } };
  },
};

function giftStock(g: import('../../game/state').Game, pol?: PolityDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of g.ship.cargo) {
    if (c.quantity < 1) continue;
    if (GIFT_GOODS.includes(c.goodId) || pol?.wants.includes(c.goodId) || people(pol?.people ?? 'portuguese').gifts.loves.includes(c.goodId)) out[c.goodId] = Math.floor(c.quantity);
  }
  return out;
}
