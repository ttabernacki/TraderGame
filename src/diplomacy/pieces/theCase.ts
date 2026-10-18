import type { Piece, PieceView } from '../piece';
import type { PolityDef } from '../polities';

/**
 * The case. The qadi hears a dispute between two merchants and asks the
 * stranger to sit with him and give his opinion. You have four inquiries, each
 * a question to a witness or a look at the evidence; witnesses have tells and
 * clues can contradict. You rule from four options, and the ruling is
 * political: each pleases one voice and hurts another. Right and useful are
 * often different, and a wrong ruling is tested weeks later.
 *
 * Names: A is the house clerk (whose rod it is), B the ship's master, C the broker.
 *
 * Cut A3: the old 'linguist' piece is folded in. At the courts of the Guinea
 * and Kongo coasts nobody sits as a qadi; the king's linguist hears the dispute
 * and the stranger sits with him. After the ruling the linguist asks for a
 * proverb to close it, and the king's liking for one of three is what the
 * linguist spent the old piece's days finding out (he lets slip the two things
 * the king has been talking about). The right proverb teaches the Book tag
 * 'proverb-*'. At Moorish and Malabar courts nothing changes.
 */

type Variant = 'rod' | 'tally' | 'broker';
type Witness = 'clerk' | 'master' | 'broker';
type Topic = 'measure' | 'payment';
type Item = 'rod' | 'tally' | 'receipt';

interface S {
  v: Variant;
  left: number;
  names: { A: string; B: string; C: string };
  asked: string[];
  said: string[];
  /** Exhibits too old and handled to be read. */
  blur: Item[];
  /** Guinea and Kongo courts only: the linguist's proverb, asked for after the ruling. */
  ling?: {
    proverbs: number[];
    want: number;
    decoy: number;
    decoyFirst: boolean;
    /** Set once the ruling is made: whether it was right. */
    ruled?: boolean;
  };
}

const THEMES = [
  { id: 'guest', text: 'The river does not refuse the stream', gist: 'how a guest is received' },
  { id: 'return', text: 'The cow that goes far comes home', gist: 'who comes back' },
  { id: 'patience', text: 'Water carried slowly arrives full', gist: 'patience' },
  { id: 'kin', text: 'Two hands wash each other', gist: 'who is kin to whom' },
  { id: 'strength', text: 'The hunter sleeps with his spear', gist: 'strength' },
  { id: 'market', text: 'A market belongs to those who keep its peace', gist: 'the peace of the market' },
];
const LING_COURTS = new Set(['jolof', 'eguafo', 'benin', 'kaabu', 'kongo', 'temne', 'ndongo']);

const NAMES: Record<string, [string[], string[], string[]]> = {
  swahili: [['Hasan', 'Khamis', 'Mwinyi'], ['Idris', 'Yusuf', 'Bakari'], ['Salim', 'Rashid', 'Juma']],
  arab: [['Hasan', 'Mansur', 'Hamad'], ['Idris', 'Khalid', 'Yusuf'], ['Salim', 'Rashid', 'Nasir']],
  malabar: [['Kutty Ali', 'Pokker', 'Mammali'], ['Nambiar', 'Cherian', 'Itty'], ['Koya', 'Mussa', 'Abdulla']],
  guinea: [['Mamadu', 'Sori', 'Dembo'], ['Kofi', 'Osei', 'Adjei'], ['Nzinga', 'Mpanzu', 'Lukeni']],
};
const POOL_OF: Record<string, string> = { swahili: 'swahili', arab: 'arab', malabar: 'malabar', gujarati: 'arab' };

const ANS: Record<Variant, Record<string, string>> = {
  rod: {
    'clerk/measure': 'He swears it was measured on the house rod. He keeps his eyes on the floor.',
    'clerk/payment': 'He says the full price was never paid, and says it twice in the same words, like a lesson.',
    'master/measure': 'The master says his men counted thirty-six pieces off the boat, and had them measured twice at the quay. The same count both times.',
    'master/payment': 'He says {B} paid for thirty-six at the agreed rate, and has the receipt.',
    'broker/measure': '{C} says he was not there for the measuring. He looks at the harbour while he says it.',
    'broker/payment': '{C} says the payment was fair for what came. He takes a long time to say it.',
    rod: 'The rod is a thumb shorter than the standard, and the notch at its end has been recut.',
    tally: 'The tally shows the price of thirty-six pieces, cleanly cut, in {B}’s hand.',
    receipt: 'A receipt in two hands, for thirty-six pieces. The clerk’s hand wavers at the number.',
  },
  tally: {
    'clerk/measure': 'He says the cloth was measured on the house rod, and shows no unease.',
    'clerk/payment': 'He says {B} paid twelve of the forty, and counts it off on his fingers.',
    'master/measure': 'The master says the count off the boat was thirty-six, then corrects himself: “forty, with the wet.” He rubs the back of his neck.',
    'master/payment': 'He says {B} paid half, near enough. “Near enough” is all he will say.',
    'broker/measure': '{C} says the measure was fair, and that he saw it done.',
    'broker/payment': '{C} says he does not carry the figures of other men’s money.',
    rod: 'The rod is true to the standard.',
    tally: 'The tally has twelve notches cut cleanly, and eight more scratched in afterwards with a different knife.',
    receipt: 'A receipt for twenty pieces in {B}’s own hand, signed. It does not say “paid”.',
  },
  broker: {
    'clerk/measure': 'He says he measured honestly and invites you to look at the rod.',
    'clerk/payment': 'He says {B} paid half, and shows his book, open.',
    'master/measure': 'The master says the count off the boat was forty and honest. He looks puzzled that there is a dispute.',
    'master/payment': 'He says half was paid in the broker’s presence. “In his hand,” he says, and points at {C}.',
    'broker/measure': '{C} says the measure was fair, and then, unasked, that both men are honest. A little too quickly.',
    'broker/payment': '{C} says the money passed through his own hands. He does not say how much. He smiles.',
    rod: 'The rod is true.',
    tally: 'The tally is true: twenty notches, agreed by both men.',
    receipt: 'The receipt is in a third hand, neither the clerk’s nor {B}’s: a trained writer’s hand. It is {C}’s.',
  },
};

const INQUIRIES = 3;

const RIGHT: Record<Variant, number> = { rod: 2, tally: 3, broker: 4 };
const TRUTH: Record<Variant, string> = {
  rod: '{A}’s rod was short. Every “piece” was a thumb light, and {B} paid for what he got.',
  tally: 'The cloth was sound, and {B} paid only twelve of forty and scratched in eight more.',
  broker: 'Both men were honest. {C} handled the money on both sides and kept the difference.',
};
const RULINGS: { id: number; label: string }[] = [
  { id: 1, label: '{A} is paid in full' },
  { id: 2, label: '{B} owes nothing; {A} is fined for his rod' },
  { id: 3, label: '{B} pays the balance, and no more' },
  { id: 4, label: 'The broker held the difference; both are made whole' },
];
/** Which voice each ruling pleases and which it hurts. */
const DELTAS: Record<number, { fav?: 'trade' | 'war'; against?: 'trade' | 'war' }> = {
  1: { fav: 'trade', against: 'war' },
  2: { fav: 'war', against: 'trade' },
  3: { fav: 'trade', against: 'war' },
  4: { against: 'war' },
};

const WITNESSES: { id: Witness; who: string }[] = [
  { id: 'clerk', who: 'the clerk, {A}' }, { id: 'master', who: 'the master, {B}' }, { id: 'broker', who: 'the broker, {C}' },
];
const TOPICS: { id: Topic; label: string }[] = [{ id: 'measure', label: 'the measure' }, { id: 'payment', label: 'the payment' }];
const ITEMS: { id: Item; label: string }[] = [
  { id: 'rod', label: 'Inspect the rod' }, { id: 'tally', label: 'Inspect the tally stick' }, { id: 'receipt', label: 'Inspect the receipt' },
];

const fill = (t: string, n: S['names']): string => t.replace(/\{A\}/g, n.A).replace(/\{B\}/g, n.B).replace(/\{C\}/g, n.C);

const COURTS = new Set(['malindi', 'kilwa', 'mombasa', 'mogadishu', 'aden', 'hormuz', 'calicut', 'cochin', 'gujarat', ...LING_COURTS]);


export const theCase: Piece<S> = {
  id: 'case',
  title: 'The case',
  available: (g, pol: PolityDef) => COURTS.has(pol.id)
    && !g.diplomacy.pieces.runs.some((r) => r.pieceId === 'case' && r.polity === pol.id
      && (!r.outcome || g.clock.t - r.outcome.t < 120 * 86400)),
  start: ({ polity, rng }) => {
    const pool = LING_COURTS.has(polity.id) ? NAMES.guinea : NAMES[POOL_OF[polity.people] ?? 'swahili'] ?? NAMES.swahili;
    const names = { A: rng.pick(pool[0]), B: rng.pick(pool[1]), C: rng.pick(pool[2]) };
    const v = rng.pick<Variant>(['rod', 'tally', 'broker']);
    const items: Item[] = ['rod', 'tally', 'receipt'];
    const base: S = { v, left: INQUIRIES, names, asked: [], said: [], blur: items.filter(() => rng.next() < 0.3) };
    if (LING_COURTS.has(polity.id)) {
      const idx = rng.shuffle([0, 1, 2, 3, 4, 5]);
      const proverbs = idx.slice(0, 3);
      const want = proverbs[Math.floor(rng.next() * 3)];
      base.ling = { proverbs, want, decoy: idx[3], decoyFirst: rng.next() < 0.5 };
    }
    return base;
  },
  view: (_ctx, s): PieceView => {
    const n = s.names;
    const lines: PieceView['lines'] = [{
      who: 'narrator',
      text: s.said.length === 0
        ? `${s.ling ? 'The king’s linguist' : 'The qadi'} hears ${n.A}, a house clerk, against ${n.B}, a ship’s master, over forty pieces of cloth. He asks the stranger to sit with him. You have ${INQUIRIES} inquiries before you must say what you think.`
        : s.ling?.ruled !== undefined ? 'The ruling is made. The linguist asks what proverb will close it.' : `Inquiries left: ${s.left}.`,
    }];
    for (const t of s.said) lines.push({ who: 'them', text: t });
    const choices: PieceView['choices'] = [];
    if (s.ling?.ruled !== undefined) {
      const l = s.ling;
      const gist = (i: number) => THEMES[i].gist;
      lines.push({ who: 'them', text: `The linguist says, to nobody, that the king has been speaking of ${l.decoyFirst ? `${gist(l.decoy)} and of ${gist(l.want)}` : `${gist(l.want)} and of ${gist(l.decoy)}`}.` });
      for (const i of l.proverbs) choices.push({ id: `prov:${i}`, label: `“${THEMES[i].text}”` });
      return { title: 'The case', lines, choices };
    }
    if (s.left > 0) {
      for (const w of WITNESSES) for (const t of TOPICS) {
        const k = `${w.id}/${t.id}`;
        if (!s.asked.includes(k)) choices.push({ id: `ask:${k}`, label: `Ask ${fill(w.who, n)} about ${t.label}` });
      }
      for (const it of ITEMS) if (!s.asked.includes(it.id)) choices.push({ id: `look:${it.id}`, label: it.label });
    }
    for (const r of RULINGS) choices.push({ id: `rule:${r.id}`, label: `Rule: ${fill(r.label, n)}` });
    return { title: 'The case', lines, choices };
  },
  step: (_ctx, s0, choice) => {
    const s: S = JSON.parse(JSON.stringify(s0));
    if (choice.startsWith('ask:') && s.left > 0) {
      const k = choice.slice(4);
      if (!s.asked.includes(k)) {
        s.asked.push(k); s.left -= 1;
        s.said.push(fill(ANS[s.v][k], s.names));
      }
      return { state: s };
    }
    if (choice.startsWith('look:') && s.left > 0) {
      const k = choice.slice(5);
      if (!s.asked.includes(k)) {
        s.asked.push(k); s.left -= 1;
        s.said.push(s.blur.includes(k as Item)
          ? `The ${k === 'tally' ? 'tally stick' : k} is old and much handled. You cannot say whether anyone has touched it.`
          : fill(ANS[s.v][k], s.names));
      }
      return { state: s };
    }
    if (choice.startsWith('prov:') && s.ling?.ruled !== undefined) {
      const proverb = Number(choice.slice(5));
      return { state: s, outcome: closeLing(s, s.ling.ruled, proverb === s.ling.want) };
    }
    if (!choice.startsWith('rule:') || s.ling?.ruled !== undefined) return { state: s };
    const r = Number(choice.slice(5));
    const right = r === RIGHT[s.v];
    const d = DELTAS[r] ?? {};
    const fx: NonNullable<ReturnType<typeof theCase.step>['outcome']>['factions'] = { faith: right ? 0.15 : -0.15 };
    if (d.fav) fx[d.fav] = (fx[d.fav] ?? 0) + 0.08;
    if (d.against) fx[d.against] = (fx[d.against] ?? 0) - 0.08;
    s.said.push(`The truth: ${fill(TRUTH[s.v], s.names)}`);
    if (s.ling) { s.ling.ruled = right; return { state: s }; }
    return { state: s, outcome: right ? {
      grade: 'win',
      line: 'The qadi nods slowly: that is what the law says',
      marks: [{ key: 'case', text: 'You judged justly in an open court.', echo: 'The qadi remembers that you judged as a man of law would.', tone: 0.7 }],
      measures: { trust: 0.05, respect: 0.04 }, factions: fx,
      book: [{ kind: 'custom', tag: 'case-weights', text: 'Here a false measure or a scratched tally is read before the price.', how: 'seen' }],
    } : {
      grade: 'fail',
      line: 'The qadi’s face does not change, which is worse',
      marks: [{ key: 'case', text: 'Your ruling will not survive a second look.', echo: 'In three weeks the qadi sent for the evidence you did not read.', tone: -0.7 }],
      measures: { trust: -0.04, respect: -0.03 }, factions: fx,
    } };
  },
};

/** The Guinea/Kongo close: the ruling and the proverb each count. Win only if both are right. */
function closeLing(s: S, ruledRight: boolean, proverbRight: boolean): NonNullable<ReturnType<typeof theCase.step>['outcome']> {
  const theme = THEMES[s.ling!.want];
  const book: NonNullable<ReturnType<typeof theCase.step>['outcome']>['book'] = [];
  if (ruledRight) book.push({ kind: 'custom', tag: 'case-weights', text: 'Here a false measure or a scratched tally is read before the price.', how: 'seen' });
  if (proverbRight) book.push({ kind: 'phrase', tag: 'proverb-' + theme.id, how: 'told', text: `“${theme.text}”: said of ${theme.gist}.` });
  if (ruledRight && proverbRight) {
    return {
      grade: 'win', line: 'The ruling is just, and the right words close it',
      marks: [{ key: 'case', text: 'Your words reached the king whole.', echo: 'The linguist remembers a stranger who spoke as a guest of the house.', tone: 0.8 }],
      measures: { trust: 0.08, respect: 0.04 }, factions: { custom: 0.1 }, book,
    };
  }
  if (ruledRight || proverbRight) {
    return {
      grade: 'half', line: ruledRight ? 'The ruling stands, and the proverb falls flat' : 'The proverb is liked, and the ruling will not stand a second look',
      marks: [{ key: 'case', text: 'You were heard at the linguist’s court, not entirely.', echo: '', tone: 0.1 }],
      measures: { trust: 0.01 }, book,
    };
  }
  return {
    grade: 'fail', line: 'The linguist spoke at length, and the king heard something other than what you meant',
    marks: [{ key: 'case', text: 'You were taken for a boaster at this court.', echo: 'The mediators remember how you spoke.', tone: -0.7 }],
    measures: { respect: -0.04, trust: -0.03 }, factions: { custom: -0.12 },
  };
}
