import type { Piece, PieceView } from '../piece';

/**
 * Through the linguist. You never address the king. A gatekeeper, a linguist
 * with a staff and an elder carry your words in turn, each in his own way. You
 * build a message from four slots (a praise-name, a gift, the request, a
 * proverb) and each mediator guards something: one drops a demand, one
 * replaces a proverb that does not fit, one wants precedent for how the king is
 * called. You do not see what arrived. You see the echo: how the king reacts,
 * and how long the linguist spoke. A day is a send or a sounding of one
 * mediator, and the court's rule is consensus: one elder gone cold stops it all.
 */

const DAYS = 4;

const PRAISE = ['The king by his own great name', 'The king as a brother of the King of Portugal', 'The King of Portugal’s greeting, which is the greatest in the world'];
const GIFT = ['Name the gift plainly', 'Present the gift as tribute', 'Say the gift is between equals'];
const REQUEST = ['Ask leave to trade at the river mouth', 'Demand leave to trade at the river mouth', 'Ask the king’s advice on how to trade here'];
const THEMES = [
  { id: 'guest', text: 'The river does not refuse the stream', gist: 'how a guest is received' },
  { id: 'return', text: 'The cow that goes far comes home', gist: 'who comes back' },
  { id: 'patience', text: 'Water carried slowly arrives full', gist: 'patience' },
  { id: 'kin', text: 'Two hands wash each other', gist: 'who is kin to whom' },
  { id: 'strength', text: 'The hunter sleeps with his spear', gist: 'strength' },
  { id: 'market', text: 'A market belongs to those who keep its peace', gist: 'the peace of the market' },
];

interface S {
  days: number;
  msg: number[];
  /** The three proverbs on offer, as indexes into THEMES, and which one the king wants. */
  proverbs: number[];
  want: number;
  /** Which praise the elder needs: 0 own great name, 1 brother-king. */
  precedent: 0 | 1;
  /** A second thing the king has been talking about, which is not what he wants. */
  decoy: number;
  decoyFirst: boolean;
  heard: string[];
  /** Mediators sounded so far. */
  sounded: string[];
  sent: number;
  elderCold: boolean;
}

const SOUNDING: Record<string, (s: S) => string> = {
  gate: () => 'The gatekeeper says that kings are not given orders, and that what is ordered is not repeated.',
  ling: (s) => `The linguist says the king has been speaking of ${s.decoyFirst ? `${THEMES[s.decoy].gist} and of ${THEMES[s.want].gist}` : `${THEMES[s.want].gist} and of ${THEMES[s.decoy].gist}`}.`,
  elder: (s) => (s.precedent === 0
    ? 'The elder says no king has been called anything but by his own name at this court, and none will be.'
    : 'The elder says there was a king of a far country who was called a brother here once, and it was remembered well.'),
};
const MED: Record<string, string> = { gate: 'the gatekeeper', ling: 'the linguist', elder: 'the elder' };

const COURTS = new Set(['jolof', 'eguafo', 'benin', 'kaabu', 'kongo', 'temne', 'ndongo']);

function judge(s: S): { arrived: string[]; reaction: 'warm' | 'puzzled' | 'cold' | 'silent'; talked: 'short' | 'long' } {
  const [praise, , request, proverb] = s.msg;
  const arrived: string[] = [];
  let reaction: 'warm' | 'puzzled' | 'cold' | 'silent' = 'warm';
  let talked: 'short' | 'long' = 'short';
  // The gatekeeper drops a demand: the king hears no request at all.
  if (request === 1) { reaction = 'silent'; arrived.push('no request'); } else arrived.push('request');
  // The linguist replaces a proverb that does not fit, and talks longer doing it.
  if (s.proverbs[proverb] !== s.want) { talked = 'long'; if (reaction === 'warm') reaction = 'puzzled'; arrived.push('wrong proverb'); } else arrived.push('proverb');
  // The elder wants precedent: a boast, or the wrong form of the king's name, turns him cold.
  const ok = praise === s.precedent;
  if (praise === 2 || !ok) { reaction = 'cold'; arrived.push('praise'); }
  return { arrived, reaction, talked };
}

export const linguist: Piece<S> = {
  id: 'linguist',
  title: 'Through the linguist',
  available: (g, pol) => COURTS.has(pol.id)
    && !g.diplomacy.pieces.runs.some((r) => r.pieceId === 'linguist' && r.polity === pol.id),
  start: ({ rng }) => {
    const idx = rng.shuffle([0, 1, 2, 3, 4, 5]).slice(0, 3);
    return { days: DAYS, msg: [], proverbs: idx, want: idx[Math.floor(rng.next() * 3)], precedent: rng.next() < 0.5 ? 0 : 1, decoy: rng.pick([0, 1, 2, 3, 4, 5].filter((i) => i !== idx[0] && i !== -1)), decoyFirst: rng.next() < 0.5, heard: [], sounded: [], sent: 0, elderCold: false };
  },
  view: (_ctx, s): PieceView => {
    const lines: PieceView['lines'] = [{
      who: 'narrator',
      text: s.sent === 0 && s.sounded.length === 0
        ? `You will not see the king. A gatekeeper, a linguist and an elder carry your words in turn. Days left: ${s.days}.`
        : `Days left: ${s.days}.`,
    }];
    for (const t of s.heard.slice(-4)) lines.push({ who: 'them', text: t });
    const choices: PieceView['choices'] = [];
    const slot = s.msg.length;
    if (slot < 4) {
      const opts = [PRAISE, GIFT, REQUEST, s.proverbs.map((i) => THEMES[i].text)][slot];
      const head = ['Greet him', 'The gift', 'The request', 'The proverb'][slot];
      lines.push({ who: 'you', text: `${head}.` });
      opts.forEach((o, i) => choices.push({ id: `set:${i}`, label: o }));
    } else {
      lines.push({ who: 'you', text: `Your message: ${s.msg.map((m, i) => [PRAISE, GIFT, REQUEST, s.proverbs.map((j) => THEMES[j].text)][i][m]).join('; ')}.` });
      choices.push({ id: 'send', label: 'Send it through the three mouths' });
      choices.push({ id: 'redo', label: 'Take it back and rebuild it' });
    }
    if (slot === 0 || slot === 4) for (const m of Object.keys(MED)) if (!s.sounded.includes(m) && s.days > 0) choices.push({ id: `sound:${m}`, label: `Sound ${MED[m]}`, hint: 'A day.' });
    return { title: 'Through the linguist', lines, choices };
  },
  step: (_ctx, s0, choice) => {
    const s: S = JSON.parse(JSON.stringify(s0));
    if (choice.startsWith('set:') && s.msg.length < 4) { s.msg.push(Number(choice.slice(4))); return { state: s }; }
    if (choice === 'redo') { s.msg = []; return { state: s }; }
    if (choice.startsWith('sound:') && s.days > 0) {
      const m = choice.slice(6);
      if (!s.sounded.includes(m)) { s.sounded.push(m); s.days -= 1; s.heard.push(SOUNDING[m](s)); }
      if (s.days <= 0) return { state: s, outcome: spent() };
      return { state: s };
    }
    if (choice === 'send' && s.msg.length === 4) {
      s.days -= 1; s.sent += 1;
      const j = judge(s);
      if (j.reaction === 'warm') {
        return { state: s, outcome: {
          grade: 'win', line: 'The right words reach the throne',
          marks: [{ key: 'linguist', text: 'Your words reached the king whole.', echo: 'The linguist remembers a stranger who spoke as a guest of the house.', tone: 0.8 }],
          measures: { trust: 0.08, respect: 0.04 }, factions: { custom: 0.1 },
          book: [{ kind: 'phrase', tag: 'proverb-' + THEMES[s.want].id, how: 'told', text: `“${THEMES[s.want].text}”: said of ${THEMES[s.want].gist}.` }],
        } };
      }
      s.heard = [...s.heard.slice(-3), j.reaction === 'silent'
        ? `The king says nothing at all. The linguist spoke ${j.talked}.`
        : j.reaction === 'puzzled'
          ? `The king is puzzled, and asks a question you cannot hear. The linguist spoke ${j.talked}, and at length.`
          : 'The elder will not carry it further. The linguist’s staff comes down once.'];
      if (j.reaction === 'cold') s.elderCold = true;
      s.msg = [];
      if (s.days <= 0 || s.elderCold) {
        return { state: s, outcome: s.elderCold ? {
          grade: 'fail', line: 'The elder has turned, and the king never hears the end of it',
          marks: [{ key: 'linguist', text: 'You were taken for a boaster at this court.', echo: 'The mediators remember how you spoke.', tone: -0.7 }],
          measures: { respect: -0.04, trust: -0.03 }, factions: { custom: -0.12 },
        } : spent() };
      }
      return { state: s };
    }
    return { state: s };
  },
};

function spent() {
  return {
    grade: 'half' as const, line: 'The days are spent; the king has heard something, and not what you meant',
    marks: [{ key: 'linguist', text: 'You never quite got through.', echo: '', tone: 0 }],
    measures: { trust: 0.0 },
  };
}
