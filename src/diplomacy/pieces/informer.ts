import type { Piece, PieceView } from '../piece';

/**
 * The informer. Somebody at this court is the rival's man, and a clerk who
 * wants paying has told you so. You have four nights. Each night you can watch
 * one thing: who has been spending beyond his pay, who has been out after the
 * curfew, who has been seen with the rival's script. The man you want does all
 * three; the innocent do at most one. What you see is only mostly right, and
 * a night spent looking twice at the same thing buys certainty. Then you
 * accuse, or hold your tongue. An accused man who is not the one is ruined.
 */

type Test = 'money' | 'night' | 'script';
const TESTS: Test[] = ['money', 'night', 'script'];
const TEST_LABEL: Record<Test, string> = {
  money: 'Who has been spending beyond his pay',
  night: 'Who has been out after the curfew',
  script: 'Who has been seen with the rival’s script',
};
const NIGHTS = 4;
const ACCURACY = 0.85;

const ROLES = ['the treasury clerk', 'a cloth merchant', 'the captain of the gate', 'the sultan’s physician', 'a pilot of the harbour', 'the keeper of the weights'];

interface S {
  names: string[];
  roles: string[];
  agent: number;
  /** Each suspect's truth on each test. */
  truth: Record<Test, boolean[]>;
  nights: number;
  seen: Record<Test, boolean[][]>;
  said: string[];
}

const FIRST: Record<string, string[]> = {
  swahili: ['Hamisi', 'Ali bin Nasr', 'Juma', 'Mwinyi Mkuu', 'Bakari'],
  malabar: ['Pokker', 'Kutty Hasan', 'Cheriya Koya', 'Nambiar', 'Mammali'],
  arab: ['Mansur', 'Hamad', 'Khalid', 'Nasir', 'Yusuf'],
  default: ['Abu Bakr', 'Idris', 'Salim', 'Khamis', 'Rashid'],
};

export const informer: Piece<S> = {
  id: 'informer',
  title: 'The informer',
  available: (g, pol) => !!g.polityState(pol.id).rivalCourted && g.polityState(pol.id).met
    && !g.diplomacy.pieces.runs.some((r) => r.pieceId === 'informer' && r.polity === pol.id),
  start: ({ polity, rng }) => {
    const pool = FIRST[polity.people === 'swahili' ? 'swahili' : polity.people === 'malabar' ? 'malabar' : polity.people === 'arab' ? 'arab' : 'default'];
    const names = rng.shuffle([...pool]).slice(0, 4);
    const roles = rng.shuffle([...ROLES]).slice(0, 4);
    const agent = Math.floor(rng.next() * 4);
    const truth: Record<Test, boolean[]> = { money: [], night: [], script: [] };
    for (const t of TESTS) truth[t] = names.map((_, i) => i === agent);
    // Each innocent does one thing, at most; two of them do nothing at all.
    const innocents = names.map((_, i) => i).filter((i) => i !== agent);
    rng.shuffle(innocents);
    innocents.slice(0, 2).forEach((i) => { truth[rng.pick(TESTS)][i] = true; });
    return { names, roles, agent, truth, nights: NIGHTS, seen: { money: [], night: [], script: [] }, said: [] };
  },
  view: (_ctx, s): PieceView => {
    const lines: PieceView['lines'] = [{
      who: 'narrator',
      text: s.said.length === 0
        ? `A clerk who wants paying says the rival has a man at this court: ${s.names.map((n, i) => `${n}, ${s.roles[i]}`).join('; ')}. You have ${NIGHTS} nights.`
        : `Nights left: ${s.nights}.`,
    }];
    for (const t of s.said) lines.push({ who: 'them', text: t });
    const choices: PieceView['choices'] = [];
    if (s.nights > 0) for (const t of TESTS) choices.push({ id: `watch:${t}`, label: `Watch: ${TEST_LABEL[t].toLowerCase()}`, hint: 'One night' });
    s.names.forEach((n, i) => choices.push({ id: `accuse:${i}`, label: `Name ${n}, ${s.roles[i]}` }));
    choices.push({ id: 'silent', label: 'Say nothing, and keep what you know' });
    return { title: 'The informer', lines, choices };
  },
  step: (ctx, s0, choice) => {
    const s: S = JSON.parse(JSON.stringify(s0));
    if (choice.startsWith('watch:') && s.nights > 0) {
      const t = choice.slice(6) as Test;
      s.nights -= 1;
      // What is seen is mostly right.
      const obs = s.truth[t].map((v) => (ctx.rng.next() < ACCURACY ? v : !v));
      s.seen[t].push(obs);
      const who = s.names.filter((_, i) => obs[i]);
      s.said.push(`${TEST_LABEL[t]}: ${who.length ? who.join(', ') : 'nobody you could swear to'}.`);
      return { state: s };
    }
    if (choice === 'silent') {
      return { state: s, outcome: {
        grade: 'half', line: 'You keep what you know, and the rival’s man is not troubled',
        marks: [{ key: 'informer', text: 'You knew of the rival’s man here, and said nothing.', echo: '', tone: 0 }],
      } };
    }
    if (choice.startsWith('accuse:')) {
      const i = Number(choice.slice(7));
      if (i === s.agent) {
        return { state: s, outcome: {
          grade: 'win', line: `${s.names[i]} is taken, and the rival has no ears at this court`,
          marks: [{ key: 'informer', text: 'You found the rival’s man at this court.', echo: 'They remember that you saw what their own court had not.', tone: 0.7 }],
          measures: { trust: 0.06, respect: 0.05 },
        } };
      }
      return { state: s, outcome: {
        grade: 'fail', line: `${s.names[i]} is ruined, and was not the man; the rival’s man laughs`,
        marks: [{ key: 'informer', text: `You named ${s.names[i]}, and he was innocent.`, echo: `${s.names[i]}’s family has not forgotten who named him.`, tone: -0.8 }],
        measures: { trust: -0.08, respect: -0.03 },
      } };
    }
    return { state: s };
  },
};
