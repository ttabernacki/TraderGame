import { hasInterpreterFor } from '../../crew/crew';
import { GIFT_GOODS, good } from '../../economy/goods';
import { people } from '../../world/peoples';
import { knows } from '../book';
import type { Outcome, Piece, PieceView } from '../piece';
import type { PolityDef } from '../polities';

/**
 * The gift table. Before the audience you set a ranked tray from your hold:
 * the place of honour, then the rest. Every voice in the court reads each good
 * differently, and you know only some of it. Who knows a thing is the lesson
 * ("ask the merchants"), not a list to memorise: each court's table has a few
 * quirks drawn fresh for the run.
 *
 * Since Cut A3 the tray is also the host of two older pieces. At the Islamic
 * courts of the Swahili coast and the Gulf, carrying the tray in begins with the
 * MEAL (dates, the host's seat, a fast or a feast: what the old 'meal' piece
 * taught, Book tag 'guest-right'). At the Malabar courts it begins with the
 * HALL (where you stand and where the gifts are laid: the old 'hall' piece,
 * Book tags 'hall-you', 'hall-gifts', 'hall-interp', 'hall-retinue'). How you
 * behave there moves how the tray lands (see `manners`). Docs: docs/CUTS.md.
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
  /** Set once the tray is carried in at a court with a table manner of its own. */
  manners?: Manners;
  /** The tray has been carried in; the manners (if any) are being played before it is read. */
  carried?: boolean;
}

type MealTest = 'fast' | 'feast';
interface MealState {
  kind: 'meal';
  n: number;
  order: number[][];
  hostLine: number[];
  test: MealTest;
  right: number;
  said: string[];
}
type HallThing = 'you' | 'gifts';
type HallZone = 'front' | 'brahmin' | 'nair' | 'back' | 'bench';
interface HallState {
  kind: 'hall';
  /** One rule index (into HALL_RULES) per thing, in THINGS order: you, interp, gifts, retinue. */
  rules: number[];
  placed: Partial<Record<HallThing, HallZone>>;
  said: string[];
}
type Manners = MealState | HallState;


// ---------------------------------------------------------------------------
// The meal (folded in from the old 'meal' piece)
// ---------------------------------------------------------------------------

interface MealStep { host: string[]; options: string[]; prompt: string }
/** Index 0 of each step's options is the echo of the host. Two of the old four steps survive. */
const MEAL_STEPS: MealStep[] = [
  { prompt: 'The host gestures to the cushions.',
    host: ['The host sits at the head, and gestures the person he honours to his right.', 'The host sits, folds his legs, and gestures to the cushion on his right.'],
    options: ['Take the cushion on his right', 'Take the cushion across from him', 'Wait to be told twice'] },
  { prompt: 'Dates and a bowl are set before you.',
    host: ['The host takes three dates with his right hand, eating the first before he speaks.', 'The host takes a date, eats it slowly, and only then speaks of the weather.'],
    options: ['Take dates with your right hand and eat before you speak', 'Speak first, and eat when he does', 'Take a handful for later'] },
];
const MEAL_COURTS = new Set(['malindi', 'kilwa', 'mombasa', 'mogadishu', 'aden', 'hormuz']);

// ---------------------------------------------------------------------------
// The hall (folded in from the old 'hall' piece)
// ---------------------------------------------------------------------------

type Thing = 'you' | 'interp' | 'gifts' | 'retinue';
const HALL_THINGS: Thing[] = ['you', 'interp', 'gifts', 'retinue'];
const HALL_ZONES: HallZone[] = ['front', 'brahmin', 'nair', 'back', 'bench'];
const HALL_ZONE_NAME: Record<HallZone, string> = {
  front: 'before the throne', brahmin: 'with the Brahmins', nair: 'with the Nair line', back: 'at the back of the hall', bench: 'on the merchants’ bench',
};
export interface HallRule { thing: Thing; zone: HallZone; text: string }
/** Alternatives for each thing; a court holds one of each. Which one is the whole game. */
export const HALL_RULES: HallRule[] = [
  { thing: 'you', zone: 'front', text: 'The captain stands before the throne, alone, and nowhere else.' },
  { thing: 'you', zone: 'brahmin', text: 'The captain stands with the Brahmin escort and speaks only when spoken to.' },
  { thing: 'you', zone: 'nair', text: 'A man who has come with ships stands with the Nair line, as a soldier does.' },
  { thing: 'interp', zone: 'bench', text: 'A Moor stands with the Moorish merchants, or not at all.' },
  { thing: 'interp', zone: 'back', text: 'No unclean tongue speaks near the throne; the interpreter stands at the back and is passed the words.' },
  { thing: 'gifts', zone: 'front', text: 'Gifts are laid before the throne, where the Zamorin can see them.' },
  { thing: 'gifts', zone: 'nair', text: 'Nothing that has been in a ship’s hold touches the Brahmins’ side; the Nair line receives gifts.' },
  { thing: 'gifts', zone: 'bench', text: 'Gifts are given into the hands of the merchants, who give them on.' },
  { thing: 'retinue', zone: 'back', text: 'Armed men stand at the back of the hall.' },
  { thing: 'retinue', zone: 'bench', text: 'Armed strangers wait with the merchants, who answer for them.' },
  { thing: 'retinue', zone: 'nair', text: 'Armed strangers stand with the Nair line, where the Nairs can watch them.' },
];
const HALL_COURTS = new Set(['calicut', 'cochin', 'kolathiri', 'vijayanagara']);
/** What the host puts to the stranger in the hall: only these two are tested; the escort tells all four. */
const HALL_TESTED: HallThing[] = ['you', 'gifts'];

function startManners(polity: PolityDef, rng: import('../../core/rng').Rng): Manners | undefined {
  if (MEAL_COURTS.has(polity.id)) {
    return {
      kind: 'meal', n: 0,
      order: MEAL_STEPS.map((st) => rng.shuffle(st.options.map((_, i) => i))),
      hostLine: MEAL_STEPS.map((st) => Math.floor(rng.next() * st.host.length)),
      test: rng.next() < 0.5 ? 'fast' : 'feast', right: 0, said: [],
    };
  }
  if (HALL_COURTS.has(polity.id)) {
    const rules = HALL_THINGS.map((t) => {
      const of = HALL_RULES.map((r, i) => [r, i] as const).filter(([r]) => r.thing === t);
      if (t === 'interp' && polity.id === 'calicut') return of.find(([r]) => r.zone === 'bench')![1];
      return rng.pick(of)[1];
    });
    return { kind: 'hall', rules, placed: {}, said: [] };
  }
  return undefined;
}

/** Whether this court's table manners have already been taught (by this piece, or by the old pieces). */
function mannersDone(g: import('../../game/state').Game, polity: PolityDef): boolean {
  if (MEAL_COURTS.has(polity.id)) {
    return knows(g.diplomacy.book, polity.id, 'guest-right')
      || g.diplomacy.pieces.runs.some((r) => r.pieceId === 'meal' && r.polity === polity.id);
  }
  if (HALL_COURTS.has(polity.id)) {
    return knows(g.diplomacy.book, polity.id, 'hall-gifts')
      || g.diplomacy.pieces.runs.some((r) => r.pieceId === 'hall' && r.polity === polity.id);
  }
  return true;
}

function mannersView(m: Manners, pol: PolityDef): PieceView {
  const lines: PieceView['lines'] = [];
  if (m.kind === 'meal') {
    if (m.said.length === 0) lines.push({ who: 'narrator', text: 'Before the tray is looked at, dates and water are brought. You are a guest in the house, if you can be one.' });
    for (const t of m.said.slice(-3)) lines.push({ who: 'narrator', text: t });
    if (m.n < MEAL_STEPS.length) {
      const st = MEAL_STEPS[m.n];
      lines.push({ who: 'narrator', text: st.prompt });
      lines.push({ who: 'them', text: st.host[m.hostLine[m.n]] });
      return { title: 'The meal', lines, choices: m.order[m.n].map((i) => ({ id: `m:${i}`, label: st.options[i] })) };
    }
    lines.push({ who: 'narrator', text: m.test === 'fast'
      ? 'The host sets his own plate aside, untouched. The servants bring yours, and a second dish, and wait.'
      : 'The host presses a second dish on you with his own hand, and then a third. Every man at the table is watching how you take it.' });
    return { title: 'The meal', lines, choices: [
      { id: 'mt:take', label: 'Take it and eat' },
      { id: 'mt:decline', label: 'Decline gracefully, with a hand on your chest' },
      { id: 'mt:explain', label: 'Explain through the interpreter that your faith or your crew’s habits differ' },
    ] };
  }
  lines.push({ who: 'narrator', text: `The hall of the ${pol.title.toLowerCase()} is ranked and pure, and the tray is to be carried in. A Brahmin escort says what he will.` });
  for (const i of m.rules) lines.push({ who: 'them', text: `The escort mutters: “${HALL_RULES[i].text}”` });
  for (const t of m.said.slice(-2)) lines.push({ who: 'narrator', text: t });
  const next = HALL_TESTED.find((t) => !m.placed[t]);
  const name: Record<HallThing, string> = { you: 'yourself', gifts: 'the gifts' };
  lines.push({ who: 'you', text: `Where do you put ${name[next!]}?` });
  return { title: 'The hall', lines, choices: HALL_ZONES.map((z) => ({ id: `h:${z}`, label: `Put ${name[next!]} ${HALL_ZONE_NAME[z]}` })) };
}

/** How the table manner went: 2 well, 1 middling, 0 badly. Null if it is not over. */
function mannersStep(m: Manners, choice: string): number | null {
  if (m.kind === 'meal') {
    if (choice.startsWith('m:') && m.n < MEAL_STEPS.length) {
      const ok = Number(choice.slice(2)) === 0;
      if (ok) m.right += 1;
      m.said.push(ok ? 'The host nods, barely.' : 'There is a pause, and nobody says anything about it.');
      m.n += 1;
      return null;
    }
    if (!choice.startsWith('mt:') || m.n < MEAL_STEPS.length) return null;
    const c = choice.slice(3);
    // In a fast the gracious thing is to decline; at a feast, to take. Explaining is never wrong, only second best.
    const best = m.test === 'fast' ? 'decline' : 'take';
    const total = m.right + (c === best ? 2 : c === 'explain' ? 1 : 0);
    return total >= 4 ? 2 : total >= 2 ? 1 : 0;
  }
  if (!choice.startsWith('h:')) return null;
  const next = HALL_TESTED.find((t) => !m.placed[t]);
  if (!next) return null;
  m.placed[next] = choice.slice(2) as HallZone;
  if (HALL_TESTED.some((t) => !m.placed[t])) return null;
  const broken = HALL_TESTED.filter((t) => {
    const rule = HALL_RULES[m.rules[HALL_THINGS.indexOf(t)]];
    return m.placed[t] !== rule.zone;
  }).length;
  return broken === 0 ? 2 : broken === 1 ? 1 : 0;
}

/** The Book entries the table manner leaves, whatever the grade. */
function mannersBook(m: Manners, quality: number): NonNullable<Outcome['book']> {
  if (m.kind === 'meal') {
    return [{ kind: 'custom', tag: 'guest-right', how: quality >= 1 ? 'seen' : 'blundered',
      text: 'Eat with the right hand, sit on the host’s right, bless the house. In a fast, decline with a hand on the chest.' }];
  }
  return m.rules.map((i) => ({
    kind: quality === 0 ? 'taboo' as const : 'custom' as const, tag: 'hall-' + HALL_RULES[i].thing,
    how: (quality === 2 ? 'seen' : quality === 1 ? 'told' : 'blundered') as 'seen' | 'told' | 'blundered', text: HALL_RULES[i].text,
  }));
}

/** Folds the table manner into the tray's outcome. */
function withManners(o: Outcome, m: Manners | undefined, quality: number): Outcome {
  if (!m) return o;
  const meal = m.kind === 'meal';
  const key = meal ? 'meal' : 'hall';
  const marks = [...o.marks];
  const measures = { ...(o.measures ?? {}) };
  const factions = { ...(o.factions ?? {}) };
  let grade = o.grade;
  let line = o.line;
  if (quality === 2) {
    marks.push(meal
      ? { key, text: 'You ate as a guest of the house.', echo: 'They remember you at their table, and speak of it as guest-right.', tone: 0.7 }
      : { key, text: 'You kept the hall.', echo: 'The Brahmins have nothing to say of you, which is the best they say of any stranger.', tone: 0.7 });
    measures.trust = (measures.trust ?? 0) + 0.05;
    if (meal) factions.faith = (factions.faith ?? 0) + 0.08; else factions.custom = (factions.custom ?? 0) + 0.1;
  } else if (quality === 1) {
    marks.push({ key, text: meal ? 'You were served, and no more.' : 'You had to be corrected in the hall.', echo: '', tone: 0.0 });
  } else {
    marks.push(meal
      ? { key, text: 'Your manners at the table were noticed.', echo: 'They remember a guest who did not know how to be one.', tone: -0.4 }
      : { key, text: 'You defiled the hall.', echo: 'The Brahmins still speak of the day the hall was defiled.', tone: -0.8 });
    measures.respect = (measures.respect ?? 0) - 0.03;
    if (meal) factions.faith = (factions.faith ?? 0) - 0.06; else factions.custom = (factions.custom ?? 0) - 0.1;
    // A bad table spoils a good tray by one step.
    if (grade === 'win') { grade = 'half'; line = `${line}, though the table was not forgotten`; }
  }
  return { ...o, grade, line, marks, measures, factions, book: [...(o.book ?? []), ...mannersBook(m, quality)] };
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
    const manners = mannersDone(g, polity) ? undefined : startManners(polity, rng);
    return { stock, tray: [], react, ruler, known, asks: 0, manners };
  },
  view: (ctx, s): PieceView => {
    const pol = ctx.polity;
    if (s.manners && s.tray.length > 0 && s.carried) return mannersView(s.manners, pol);
    const lines: PieceView['lines'] = [{
      who: 'narrator',
      text: s.tray.length === 0
        ? `Before you go in, your tray is to be set. The first place is the place of honour. The ${pol.title.toLowerCase()} will see it first.`
        : `On the tray: ${s.tray.map((id, i) => `${['the place of honour', 'second', 'third'][i]}: ${good(id).english.toLowerCase()}`).join('; ')}.`,
    }];
    for (const id of Object.keys(s.stock)) {
      const bits: string[] = [];
      if (s.known.includes(`ruler:${id}`)) {
        const t = s.ruler[id];
        bits.push(`The ${pol.title.toLowerCase()}: ${t > 0.8 ? 'wants it' : t > 0 ? 'would like it' : t < 0 ? 'would take it ill' : 'indifferent'}`);
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
    if (s.carried && s.manners) {
      const q = mannersStep(s.manners, choice);
      if (q === null) return { state: s };
      return finishTray(ctx, s, q);
    }
    if (choice !== 'done' || s.tray.length === 0) return { state: s };
    if (s.manners) { s.carried = true; return { state: s }; }
    return finishTray(ctx, s, 1);
  },
};

/** Reads the tray; `quality` is how the table manner went (it only matters if there was one). */
function finishTray(ctx: import('../piece').PieceCtx, s: S, quality: number): { state: S; outcome: Outcome } {
  const r = readTray(ctx, s);
  return { state: s, outcome: withManners(r, s.manners, quality) };
}

function readTray(ctx: import('../piece').PieceCtx, s: S): Outcome {
  {
    const pol = ctx.polity;
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
      return {
        grade: 'fail', line: offence ? 'The tray is laughed at, and one voice remembers whose it was' : 'The tray is received without comment',
        marks: [{ key: 'tray', text: 'Your gifts were mocked.', echo: 'They still tell the story of the tray.', tone: -0.6 }],
        measures: { respect: -0.05, interest: -0.02 }, book, gift,
      };
    }
    if (score >= 1.2) {
      return {
        grade: 'win', line: 'The tray is read, and read well',
        marks: [{ key: 'tray', text: 'Your gifts were praised.', echo: 'They remember that you brought what they would have asked for.', tone: 0.6 }],
        measures: { respect: 0.05, interest: 0.04 }, book, gift,
      };
    }
    return {
      grade: 'half', line: 'The tray is received with courtesy',
      marks: [{ key: 'tray', text: 'Your gifts were received.', echo: '', tone: 0.1 }],
      measures: { respect: 0.01 }, book, gift,
    };
  }
}

function giftStock(g: import('../../game/state').Game, pol?: PolityDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of g.ship.cargo) {
    if (c.quantity < 1) continue;
    if (GIFT_GOODS.includes(c.goodId) || pol?.wants.includes(c.goodId) || people(pol?.people ?? 'portuguese').gifts.loves.includes(c.goodId)) out[c.goodId] = Math.floor(c.quantity);
  }
  return out;
}
