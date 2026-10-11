import { good } from '../../economy/goods';
import type { Piece, PieceCtx, PieceView } from '../piece';

/**
 * Silent trade. You have goods, they have cattle, and nobody speaks.
 *
 * Lay a bundle on the mat, step back, read what they do. How much a thing is
 * worth to them is hidden and differs every time; the old men and the young men
 * react to different things (iron may please one and unsettle the other). Both
 * patience and unease run down: hurrying, taking back and flooding the mat with
 * the same trash all cost you. Too much unease and a stone is thrown, as at São
 * Brás in 1488.
 */

interface Val { v: number; old: number; young: number }
interface S {
  patience: number;
  unease: number;
  value: number;
  /** Bundles laid, by good. */
  laid: Record<string, number>;
  vals: Record<string, Val>;
  /** Goods offered from the hold, with how many bundles may be laid. */
  stock: Record<string, number>;
  /** What the voices have said, newest last. */
  said: string[];
  free: boolean;
}

// Base worth (in beasts per bundle), and how the old men and the young men take it.
type Table = Record<string, [number, number, number]>;
const KHOI: Table = {
  ferramenta: [1.2, -1, 1], cobre: [1.1, 0, 1], manilhas: [1.0, 0, 1], bacias: [0.8, 0, 0],
  contas: [0.3, 0, 1], espelhos: [0.3, 0, 1], panos: [0.5, 1, 0], coral: [0.5, 1, 0], sal: [0.4, 0, 0], la: [0.3, 0, 0],
};
const TUPI: Table = {
  ferramenta: [1.3, 0, 1], espelhos: [0.9, 1, 1], contas: [0.8, 1, 0], panos: [0.6, 0, 0],
  manilhas: [0.5, 0, 0], bacias: [0.5, 0, 0], coral: [0.6, 1, 0], cobre: [0.4, 0, 0], sal: [0.2, 0, 0], la: [0.1, -1, 0],
};

const MAX_UNEASE = 6;
const GOODS_OFFERED = 4;

function tableFor(polity: string): Table { return polity === 'tupi' ? TUPI : KHOI; }

/** A good's price to them after the mat already holds some of it. */
function worth(s: S, id: string): number {
  const n = s.laid[id] ?? 0;
  return s.vals[id].v / (1 + 0.5 * Math.max(0, n - 1));
}

const beasts = (s: S): number => Math.floor(s.value + 1e-9);

/** What is laid on the other side of the mat: the Cape herdsmen trade cattle; the Tupi, baskets of fruit, feathers and dye-wood. */
const unit = (polity: string, n: number): string => (polity === 'tupi' ? (n === 1 ? 'basket' : 'baskets') : (n === 1 ? 'beast' : 'beasts'));

function gesture(ratio: number, polity: string): string {
  const tupi = polity === 'tupi';
  if (ratio >= 0.9) return tupi ? 'A basket is pushed forward at once.' : 'A beast is led forward at once.';
  if (ratio >= 0.5) return `They confer, and one of them sets a ${tupi ? 'basket' : 'beast'} at the mat\u2019s edge, not quite pushing it forward.`;
  if (ratio >= 0.25) return 'They look at it for a long time, and do not move.';
  return 'One of them pushes it back with a foot.';
}

export const silentTrade: Piece<S> = {
  id: 'silent',
  title: 'The mat',
  available: (g, pol) => (pol.id === 'khoi' || pol.id === 'tupi')
    && !g.diplomacy.pieces.runs.some((r) => r.pieceId === 'silent' && r.polity === pol.id && !r.outcome),
  start: ({ g, polity, rng }: PieceCtx) => {
    const tbl = tableFor(polity.id);
    const vals: Record<string, Val> = {};
    for (const [id, [v, old, young]] of Object.entries(tbl)) {
      const swap = rng.next() < 0.2;
      vals[id] = {
        v: Math.round(v * (0.7 + rng.next() * 0.6) * 100) / 100,
        old: swap ? -old : old, young: swap ? -young : young,
      };
    }
    const held = g.ship.cargo.filter((c) => c.quantity >= 1 && vals[c.goodId]);
    const stock: Record<string, number> = {};
    for (const c of held.slice(0, GOODS_OFFERED)) stock[c.goodId] = Math.min(6, Math.floor(c.quantity));
    const free = Object.keys(stock).length === 0;
    // With an empty hold the crew's own kit goes on the mat: strings of beads.
    if (free) stock.contas = 4;
    return { patience: 12, unease: 0, value: 0, laid: {}, vals, stock, said: [], free };
  },
  view: (ctx, s) => {
    const lines: { who: 'narrator' | 'them' | 'you'; text: string }[] = [];
    if (s.said.length === 0) {
      lines.push({ who: 'narrator', text: ctx.polity.id === 'tupi'
        ? 'Men stand at the edge of the trees. Nobody has a word in common. A mat is spread on the sand.'
        : 'Herdsmen watch from the rise, their cattle behind them. Nobody has a word in common. You spread a mat on the ground.' });
    }
    for (const t of s.said.slice(-4)) lines.push({ who: 'them', text: t });
    lines.push({ who: 'narrator', text: `${beasts(s)} ${unit(ctx.polity.id, beasts(s))} on the mat · patience ${s.patience} · unease ${s.unease}/${MAX_UNEASE}` });
    const choices: PieceView['choices'] = Object.entries(s.stock).map(([id, n]) => ({
      id: `lay:${id}`,
      label: `Lay ${good(id).english.toLowerCase()}`,
      hint: `${n} left to lay${s.laid[id] ? `, ${s.laid[id]} down` : ''}`,
      disabled: n <= 0,
    }));
    choices.push({ id: 'wait', label: 'Step back and wait', hint: 'Eases the mood. Costs time.' });
    if (Object.values(s.laid).some((n) => n > 0)) {
      choices.push({ id: 'take', label: 'Take back what you laid', hint: 'Seen as a slight.' });
    }
    choices.push({ id: 'go', label: beasts(s) > 0 ? `Take the ${unit(ctx.polity.id, 2)} and go` : 'Go away', });
    return { title: 'The mat', lines, choices };
  },
  step: (ctx, s0, choice) => {
    const s: S = JSON.parse(JSON.stringify(s0));
    const g = ctx.g;
    const finish = (extra = ''): { state: S; outcome: NonNullable<ReturnType<Piece<S>['step']>['outcome']> } => {
      const n = beasts(s);
      const stoned = s.unease >= MAX_UNEASE;
      // Cattle go into the larder: fresh meat, and a little to drink at the river.
      if (n > 0 && !stoned) {
        g.crew.provisions.fresh += n * 5;
        g.crew.provisions.water += 4;
        g.crew.daysWithoutFresh = Math.max(0, g.crew.daysWithoutFresh - n * 3);
      }
      const signs = Object.entries(s.vals).filter(([id]) => s.laid[id])
        .map(([id, v]) => ({ kind: 'phrase' as const, tag: `sign-${id}`, how: 'seen' as const,
          text: `${good(id).english}: ${v.v >= 1 ? 'prized' : v.v >= 0.5 ? 'taken' : 'held cheap'} here.` }));
      if (stoned) {
        g.crew.morale = Math.max(0, g.crew.morale - 0.08);
        return { state: s, outcome: {
          grade: 'fail' as const, line: extra + 'A stone is thrown, and a man of yours is hurt',
          marks: [{ key: 'silent', text: 'Blood was shed on the beach.', echo: 'The next ship to land here is met with distrust.', tone: -1 }],
          measures: { trust: -0.22, respect: -0.04 }, book: signs,
        } };
      }
      if (n >= 3 && s.unease <= 3) {
        return { state: s, outcome: {
          grade: 'win' as const, line: extra + `${n} ${unit(ctx.polity.id, n)}, and they go back easy`,
          marks: [{ key: 'silent', text: 'You dealt fairly on the mat.', echo: 'A good name goes along the coast ahead of you.', tone: 0.7 }],
          measures: { trust: 0.12, interest: 0.05 }, book: signs,
        } };
      }
      return { state: s, outcome: {
        grade: n > 0 ? 'half' as const : 'half' as const,
        line: extra + (n > 0 ? `${n} ${unit(ctx.polity.id, n)}, and neither side pleased` : 'Nothing is traded, and nothing is lost'),
        marks: [{ key: 'silent', text: n > 0 ? 'A small trade on the mat.' : 'You came and went with nothing.', echo: '', tone: 0 }],
        measures: { trust: n > 0 ? 0.03 : 0 }, book: signs,
      } };
    };

    if (choice === 'go') return finish();

    if (choice.startsWith('lay:')) {
      const id = choice.slice(4);
      if (!s.stock[id] || s.stock[id] <= 0) return { state: s };
      if (!s.free) g.ship.removeCargo(id, 1);
      s.stock[id] -= 1;
      s.laid[id] = (s.laid[id] ?? 0) + 1;
      const v = s.vals[id];
      const w = worth(s, id);
      s.value += w;
      s.patience -= 1;
      const bits: string[] = [gesture(w * (0.45 + ctx.rng.next() * 1.1), ctx.polity.id)];
      if (v.old < 0) { s.unease += 1; bits.push('The old men mutter and look at the sea.'); }
      else if (v.old > 0) bits.push('An old man nods slowly.');
      if (v.young > 0) bits.push('The young men crowd forward.');
      else if (v.young < 0) { s.unease += 1; bits.push('The young men step back, hands low.'); }
      if (s.laid[id] >= 4) { s.unease += 1; bits.push('They have seen enough of this.'); }
      s.said.push(bits.join(' '));
    } else if (choice === 'wait') {
      s.patience -= 1;
      s.unease = Math.max(0, s.unease - 1);
      // Waiting lets you watch them: the best-liked good draws their eyes.
      const best = Object.entries(s.vals).filter(([id]) => s.stock[id] !== undefined)
        .sort((a, b) => b[1].v - a[1].v)[0];
      s.said.push(best ? `While you wait, an old man picks up your ${good(best[0]).english.toLowerCase()}, turns them over, and puts them down.` : 'They watch you.');
    } else if (choice === 'take') {
      for (const [id, n] of Object.entries(s.laid)) {
        if (!s.free) g.ship.addCargo(id, n, good(id).lisbon);
        s.stock[id] = (s.stock[id] ?? 0) + n;
      }
      s.laid = {};
      s.value = 0;
      s.unease += 2;
      s.patience -= 1;
      s.said.push('You sweep the goods back. Nobody speaks.');
    }
    if (s.unease >= MAX_UNEASE) return finish();
    if (s.patience <= 0) return finish('They tire of you. ');
    return { state: s };
  },
};
