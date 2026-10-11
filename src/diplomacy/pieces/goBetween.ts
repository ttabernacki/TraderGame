import { markCounts } from '../marks';
import type { Piece, PieceView } from '../piece';
import { POLITY_BY_ID } from '../polities';

/**
 * The go-between. Two courts that hate each other will both talk to the
 * stranger, and you carry proposals between them. Three issues, each a point
 * on a line from one court's side to the other's. Each court has a hidden
 * limit on each issue; one issue is a real tension where the limits overlap
 * the wrong way and no straight split can work. Gifts ease a limit; days run
 * out; one side insulted costs a day to mend.
 *
 * Melinde and Mombasa, Calicut and Cochin: the courts that would do anything
 * to spite each other.
 */

const DAYS = 4;
const GIFTS = 2;
const EASE = 2;
type St = 0 | 1 | 2 | 3;
const STATE_WORD = ['welcomes it', 'will bear it', 'cannot accept', 'is insulted'];

interface S {
  /** The other court. */
  other: string;
  issues: string[];
  x: number[];
  rA: number[];
  rB: number[];
  tension: number;
  gifts: number;
  days: number;
  /** Eased limits: sweet[0] is for the home court, sweet[1] for the other. */
  sweet: [number[], number[]];
  said: string[];
  carried: number;
}

const ISSUES: Record<string, string[]> = {
  swahili: ['Tribute', 'The creek', 'First embassy'],
  malabar: ['Precedence', 'The pepper tax', 'The Brahmins’ seat'],
  default: ['Tribute', 'The boundary', 'First embassy'],
};

function gstate(d: number): St { return d >= 2 ? 0 : d >= 0 ? 1 : d > -2 ? 2 : 3; }

function respond(s: S): { rows: { issue: string; a: St; b: St }[]; okA: boolean; okB: boolean; insult: boolean; warmA: number; warmB: number } {
  let okA = true, okB = true, insult = false, wA = 0, wB = 0;
  const rows = s.issues.map((issue, i) => {
    const dA = s.x[i] + s.sweet[0][i] * EASE - s.rA[i];
    const dB = s.rB[i] + s.sweet[1][i] * EASE - s.x[i];
    if (dA < 0) okA = false;
    if (dB < 0) okB = false;
    const a = gstate(dA), b = gstate(dB);
    if (a === 3 || b === 3) insult = true;
    wA += Math.min(dA, 3); wB += Math.min(dB, 3);
    return { issue, a, b };
  });
  return { rows, okA, okB, insult, warmA: wA / 9, warmB: wB / 9 };
}

export const goBetween: Piece<S> = {
  id: 'between',
  title: 'Between two courts',
  available: (g, pol) => {
    const other = pol.feuds.find((f) => POLITY_BY_ID.has(f) && ['malindi', 'mombasa', 'calicut', 'cochin', 'kilwa'].includes(f))
      ?? null;
    // Neither court will use a stranger it has no reason to like.
    return !!other && ['malindi', 'mombasa', 'calicut', 'cochin', 'kilwa'].includes(pol.id)
      && markCounts(g.diplomacy.marks, pol.id, g.clock.t).for >= 1
      && !g.diplomacy.pieces.runs.some((r) => r.pieceId === 'between' && (r.polity === pol.id || (r.state as S).other === pol.id)
        && (!r.outcome || g.clock.t - r.outcome.t < 180 * 86400));
  },
  start: ({ polity, rng }) => {
    const other = polity.feuds.find((f) => ['malindi', 'mombasa', 'calicut', 'cochin', 'kilwa'].includes(f))!;
    const tension = Math.floor(rng.next() * 3);
    const rA: number[] = [], rB: number[] = [];
    for (let i = 0; i < 3; i++) {
      if (i === tension) { const r = 4 + Math.floor(rng.next() * 4); rA.push(r); rB.push(r - 1); }
      else { const a = 2 + Math.floor(rng.next() * 4); rA.push(a); rB.push(a + 1 + Math.floor(rng.next() * 3)); }
    }
    const pool = ISSUES[polity.people === 'malabar' ? 'malabar' : polity.people === 'swahili' ? 'swahili' : 'default'];
    return { other, issues: pool, x: [5, 5, 5], rA, rB, tension, gifts: GIFTS, days: DAYS, sweet: [[0, 0, 0], [0, 0, 0]], said: [], carried: 0 };
  },
  view: (ctx, s): PieceView => {
    const A = ctx.polity.name.replace(/^The (Sultanate|Kingdom) of /, '').replace(/^The /, '');
    const B = (POLITY_BY_ID.get(s.other)?.name ?? s.other).replace(/^The (Sultanate|Kingdom) of /, '').replace(/^The /, '');
    const lines: PieceView['lines'] = [{
      who: 'narrator',
      text: s.carried === 0
        ? `${A} and ${B} will not speak to each other, and both will speak to you. Set a package and carry it between them. Days left: ${s.days}. Gifts left: ${s.gifts}.`
        : `Days left: ${s.days}. Gifts left: ${s.gifts}.`,
    }];
    s.issues.forEach((n, i) => lines.push({ who: 'you', text: `${n}: ${s.x[i]}/10 (0 favours ${B}, 10 favours ${A})` }));
    for (const t of s.said.slice(-7)) lines.push({ who: 'them', text: t });
    const choices: PieceView['choices'] = [];
    s.issues.forEach((n, i) => {
      choices.push({ id: `nudge:${i}:1`, label: `${n}: more to ${A}`, disabled: s.x[i] >= 10 });
      choices.push({ id: `nudge:${i}:-1`, label: `${n}: more to ${B}`, disabled: s.x[i] <= 0 });
    });
    if (s.gifts > 0) {
      s.issues.forEach((n, i) => {
        if (!s.sweet[0][i]) choices.push({ id: `gift:0:${i}`, label: `Gift to ${A}: ${n.toLowerCase()}` });
        if (!s.sweet[1][i]) choices.push({ id: `gift:1:${i}`, label: `Gift to ${B}: ${n.toLowerCase()}` });
      });
    }
    choices.push({ id: 'send', label: 'Carry the proposal' });
    choices.push({ id: 'leave', label: 'Give it up' });
    return { title: 'Between two courts', lines, choices };
  },
  step: (ctx, s0, choice) => {
    const s: S = JSON.parse(JSON.stringify(s0));
    const B = s.other;
    const nA = ctx.polity.name.replace(/^The (Sultanate|Kingdom) of /, '').replace(/^The /, '');
    const nB = (POLITY_BY_ID.get(B)?.name ?? B).replace(/^The (Sultanate|Kingdom) of /, '').replace(/^The /, '');
    if (choice.startsWith('nudge:')) {
      const [, i, d] = choice.split(':').map(Number) as unknown as [string, number, number];
      s.x[i] = Math.max(0, Math.min(10, s.x[i] + d));
      return { state: s };
    }
    if (choice.startsWith('gift:') && s.gifts > 0) {
      const [, side, i] = choice.split(':').map(Number) as unknown as [string, number, number];
      if (!s.sweet[side][i]) {
        s.sweet[side][i] = 1; s.gifts -= 1;
        s.said.push(`You give ${side === 0 ? nA : nB} a gift on ${s.issues[i].toLowerCase()}. Their limit there is eased.`);
      }
      return { state: s };
    }
    if (choice === 'leave') s.days = 0;
    else if (choice === 'send') {
      s.days -= 1; s.carried += 1;
      const r = respond(s);
      s.said = r.rows.map((row) => `${row.issue}: ${nA} ${STATE_WORD[row.a]}; ${nB} ${STATE_WORD[row.b]}.`);
      if (r.insult) { s.days -= 1; s.said.push('One side takes it as an insult, and a day is lost making amends.'); }
      if (r.okA && r.okB) {
        const warm = (w: number) => (w > 0.55 ? 0.1 : w > 0.25 ? 0.06 : 0.03);
        return { state: s, outcome: {
          grade: s.carried <= 2 ? 'win' : 'half',
          line: `Both sides accept after ${s.carried} ${s.carried === 1 ? 'carrying' : 'carryings'}`,
          marks: [{ key: 'peace', text: `You made a peace between ${nA} and ${nB}.`, echo: `They remember who carried the proposals between ${nA} and ${nB}.`, tone: 0.8 }],
          measures: { trust: warm(r.warmA), respect: 0.03 },
          also: [{ polity: B, marks: [{ key: 'peace', text: `You made a peace between ${nB} and ${nA}.`, echo: `They remember who carried the proposals between ${nA} and ${nB}.`, tone: 0.8 }],
            measures: { trust: warm(r.warmB), respect: 0.03 } }],
        } };
      }
      s.said.push(`${r.okA ? `${nA} would accept.` : `${nA} will not accept this.`} ${r.okB ? `${nB} would accept.` : `${nB} will not accept this.`}`);
    } else return { state: s };
    if (s.days <= 0) {
      return { state: s, outcome: {
        grade: 'fail', line: 'The days are spent, and the quarrel stands',
        marks: [{ key: 'peace', text: 'The quarrel was left unmended.', echo: 'They remember that you came between them and left it as it was.', tone: -0.3 }],
        measures: { trust: -0.02 },
        also: [{ polity: B, marks: [{ key: 'peace', text: 'The quarrel was left unmended.', echo: '', tone: -0.3 }], measures: { trust: -0.02 } }],
      } };
    }
    return { state: s };
  },
};
