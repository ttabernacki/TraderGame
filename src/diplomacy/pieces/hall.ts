import type { Piece, PieceView } from '../piece';

/**
 * The hall. The audience hall is ranked and ritually pure: where you stand,
 * who touches what, which hand gives, and nobody tells you the rules. A small
 * floor plan with five places; you set four things in them (yourself, your
 * interpreter, the gifts, your retinue). An escort gives you two hints and you
 * learn the rest by being corrected in front of everyone. Rules conflict: the
 * interpreter is a Moor and belongs with the merchants, which puts him away
 * from you. The rule set is drawn from a pool for each court.
 */

type Thing = 'you' | 'interp' | 'gifts' | 'retinue';
type Zone = 'front' | 'brahmin' | 'nair' | 'back' | 'bench';
const THINGS: Thing[] = ['you', 'interp', 'gifts', 'retinue'];
const THING_NAME: Record<Thing, string> = { you: 'yourself', interp: 'your interpreter', gifts: 'the gifts', retinue: 'your retinue' };
const ZONES: Zone[] = ['front', 'brahmin', 'nair', 'back', 'bench'];
const ZONE_NAME: Record<Zone, string> = {
  front: 'before the throne', brahmin: 'with the Brahmins', nair: 'with the Nair line', back: 'at the back of the hall', bench: 'on the merchants’ bench',
};

export interface Rule { thing: Thing; zone: Zone; text: string }
/** Alternatives for each thing; a court holds one of each. Which one is the whole game. */
export const HALL_RULES: Rule[] = [
  { thing: 'you', zone: 'front', text: 'The captain stands before the throne, alone, and nowhere else.' },
  { thing: 'you', zone: 'brahmin', text: 'The captain stands with the Brahmin escort and speaks only when spoken to.' },
  { thing: 'you', zone: 'nair', text: 'A man who has come with ships stands with the Nair line, as a soldier does.' },
  { thing: 'interp', zone: 'bench', text: 'A Moor stands with the Moorish merchants, or not at all.' },
  { thing: 'interp', zone: 'back', text: 'No unclean tongue speaks near the throne; the interpreter stands at the back and is passed the words.' },
  { thing: 'gifts', zone: 'front', text: 'Gifts are laid before the throne, where the Zamorin can see them.' },
  { thing: 'gifts', zone: 'nair', text: 'Nothing that has been in a ship\u2019s hold touches the Brahmins\u2019 side; the Nair line receives gifts.' },
  { thing: 'gifts', zone: 'bench', text: 'Gifts are given into the hands of the merchants, who give them on.' },
  { thing: 'retinue', zone: 'back', text: 'Armed men stand at the back of the hall.' },
  { thing: 'retinue', zone: 'bench', text: 'Armed strangers wait with the merchants, who answer for them.' },
  { thing: 'retinue', zone: 'nair', text: 'Armed strangers stand with the Nair line, where the Nairs can watch them.' },
];

interface S {
  rules: number[];
  /** Rules the escort has told you of. */
  hinted: number[];
  /** Rules you have learned by being corrected. */
  learned: number[];
  placed: Partial<Record<Thing, Zone>>;
  attempts: number;
  said: string[];
}

const MAX_ATTEMPTS = 2;
const COURTS = new Set(['calicut', 'cochin', 'kolathiri', 'vijayanagara']);

export const hall: Piece<S> = {
  id: 'hall',
  title: 'The hall',
  available: (g, pol) => COURTS.has(pol.id)
    && !g.diplomacy.pieces.runs.some((r) => r.pieceId === 'hall' && r.polity === pol.id),
  start: ({ rng, polity }) => {
    // One rule for each thing; Calicut always sends the Moor to the bench.
    const rules = THINGS.map((t) => {
      const of = HALL_RULES.map((r, i) => [r, i] as const).filter(([r]) => r.thing === t);
      if (t === 'interp' && polity.id === 'calicut') return of.find(([r]) => r.zone === 'bench')![1];
      return rng.pick(of)[1];
    });
    const hinted = rng.shuffle([...rules]).slice(0, 2);
    return { rules, hinted, learned: [], placed: {}, attempts: 0, said: [] };
  },
  view: (_ctx, s): PieceView => {
    const lines: PieceView['lines'] = [{
      who: 'narrator',
      text: s.attempts === 0 && s.said.length === 0
        ? 'The hall is ranked and pure, and the rules are nobody’s to tell you. A Brahmin escort says what he will.'
        : `Attempts left: ${MAX_ATTEMPTS - s.attempts}.`,
    }];
    for (const i of s.hinted) lines.push({ who: 'them', text: `The escort mutters: “${HALL_RULES[i].text}”` });
    for (const i of s.learned.filter((x) => !s.hinted.includes(x))) lines.push({ who: 'them', text: `You were corrected, before everyone: “${HALL_RULES[i].text}”` });
    for (const t of s.said.slice(-2)) lines.push({ who: 'narrator', text: t });
    const next = THINGS.find((t) => !s.placed[t]);
    const choices: PieceView['choices'] = [];
    if (next) {
      lines.push({ who: 'you', text: `Where do you put ${THING_NAME[next]}?` });
      for (const z of ZONES) choices.push({ id: `put:${z}`, label: `Put ${THING_NAME[next]} ${ZONE_NAME[z]}` });
    } else {
      lines.push({ who: 'you', text: THINGS.map((t) => `${THING_NAME[t]} ${ZONE_NAME[s.placed[t]!]}`).join('; ') + '.' });
      choices.push({ id: 'enter', label: 'Go in' });
      choices.push({ id: 'reset', label: 'Rearrange' });
    }
    return { title: 'The hall', lines, choices };
  },
  step: (_ctx, s0, choice) => {
    const s: S = JSON.parse(JSON.stringify(s0));
    if (choice.startsWith('put:')) {
      const next = THINGS.find((t) => !s.placed[t]);
      if (next) s.placed[next] = choice.slice(4) as Zone;
      return { state: s };
    }
    if (choice === 'reset') { s.placed = {}; return { state: s }; }
    if (choice !== 'enter') return { state: s };
    const p = s.placed as Record<Thing, Zone>;
    const broken = s.rules.filter((i) => p[HALL_RULES[i].thing] !== HALL_RULES[i].zone);
    s.attempts += 1;
    if (broken.length === 0) {
      return { state: s, outcome: s.attempts === 1 ? {
        grade: 'win', line: 'The hall nods, and the Nair line notices that you keep rank',
        marks: [{ key: 'hall', text: 'You kept the hall.', echo: 'The Brahmins have nothing to say of you, which is the best they say of any stranger.', tone: 0.7 }],
        measures: { respect: 0.05, trust: 0.04 }, factions: { custom: 0.12, war: 0.05 },
        book: s.rules.map((i) => ({ kind: 'custom' as const, tag: 'hall-' + HALL_RULES[i].thing, how: 'seen' as const, text: HALL_RULES[i].text })),
      } : {
        grade: 'half', line: 'The hall is made right at last, after a day lost to it',
        marks: [{ key: 'hall', text: 'You had to be corrected in the hall.', echo: 'They remember the day the hall had to be made right.', tone: 0 }],
        measures: { respect: -0.01 }, factions: { custom: 0.02 },
        book: s.rules.map((i) => ({ kind: 'custom' as const, tag: 'hall-' + HALL_RULES[i].thing, how: 'blundered' as const, text: HALL_RULES[i].text })),
      } };
    }
    for (const i of broken) if (!s.learned.includes(i)) s.learned.push(i);
    s.said.push('A gasp. A purification is begun, and a day is lost while the hall is made right. The Moorish merchants smile.');
    if (s.attempts >= MAX_ATTEMPTS) {
      return { state: s, outcome: {
        grade: 'fail', line: 'You defiled the hall twice, and the audience is put off',
        marks: [{ key: 'hall', text: 'You defiled the hall.', echo: 'The Brahmins still speak of the day the hall was defiled.', tone: -0.8 }],
        measures: { respect: -0.06, trust: -0.03 }, factions: { custom: -0.15 },
        book: s.rules.map((i) => ({ kind: 'taboo' as const, tag: 'hall-' + HALL_RULES[i].thing, how: 'blundered' as const, text: HALL_RULES[i].text })),
      } };
    }
    s.placed = {};
    return { state: s };
  },
};
