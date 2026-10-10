/**
 * Solver bots for the gift table. Perfect-information bot always wins; one that
 * reads only what it has been told wins most; a random tray wins a third or less.
 * Run: npx esbuild scripts/gifts.ts --bundle --platform=node --format=cjs --outfile=/tmp/gifts.cjs && node /tmp/gifts.cjs
 */
import { Game } from '../src/game/state';
import { Rng } from '../src/core/rng';
import { startPiece, stepPiece, runView } from '../src/diplomacy/table';
import { POLITY_BY_ID } from '../src/diplomacy/polities';
import { trayScore } from '../src/diplomacy/pieces/giftTable';

type Bot = (g: Game, run: any, rng: Rng) => string;
const pol = (run: any) => POLITY_BY_ID.get(run.polity)!;

const perfect: Bot = (_g, run) => {
  const s = run.state;
  if (s.tray.length >= 3) return 'done';
  let best = '', bs = -9;
  for (const id of Object.keys(s.stock).filter((x) => !s.tray.includes(x))) {
    const { score, offence } = trayScore({ ...s, tray: [...s.tray, id] }, pol(run));
    const v = offence ? -9 : score;
    if (v > bs) { bs = v; best = id; }
  }
  return best ? `place:${best}` : 'done';
};

/** Uses only what the view tells it; asks first; treats the unknown as neutral. */
const reader: Bot = (g, run) => {
  const s = run.state;
  if (s.asks < 2) {
    const f = pol(run).factions.sort((a, b) => b.weight - a.weight)[s.asks];
    const c = runView(g, run)!.choices.find((x) => x.id === `ask:${f.id}`);
    if (c) return c.id;
  }
  if (s.tray.length >= 3) return 'done';
  let best = '', bs = -9;
  for (const id of Object.keys(s.stock).filter((x) => !s.tray.includes(x))) {
    const known = (k: string) => s.known.includes(k);
    const mask = { react: {} as any, ruler: { [id]: known(`ruler:${id}`) ? s.ruler[id] : 0 }, tray: [id] };
    for (const f of pol(run).factions) mask.react[f.id] = { [id]: known(`${f.id}:${id}`) ? s.react[f.id][id] : 0 };
    const t = trayScore(mask, pol(run));
    const v = t.offence ? -9 : t.score + 0.01 * Math.random();
    if (v > bs) { bs = v; best = id; }
  }
  return best ? `place:${best}` : 'done';
};

const random: Bot = (_g, run, rng) => {
  const s = run.state;
  const ids = Object.keys(s.stock);
  const n = 1 + Math.floor(rng.next() * 3);
  if (s.tray.length >= n) return 'done';
  const free = ids.filter((x) => !s.tray.includes(x));
  return `place:${rng.pick(free)}`;
};

function play(bot: Bot, seed: number, polity: string): string {
  const g = new Game(seed);
  g.polityState(polity).knowledge = 0.2;
  for (const [id, n] of [['ferramenta', 3], ['panos', 3], ['la', 3], ['seda', 3], ['vinho', 3], ['contas', 3], ['coral', 3], ['bacias', 3], ['espelhos', 3]] as const) g.ship.addCargo(id, n, 5);
  const run = startPiece(g, 'gifts', polity, POLITY_BY_ID.get(polity)!.seat)!;
  const rng = new Rng(seed * 13 + 5);
  for (let i = 0; i < 40; i++) {
    const o = stepPiece(g, run, bot(g, run, rng));
    if (o) return o.grade;
  }
  return 'stuck';
}

const N = 300;
const courts = ['calicut', 'malindi', 'benin', 'kongo', 'fez'];
let bad = 0;
for (const [name, bot, lo, hi] of [['perfect', perfect, 0.95, 1], ['reader', reader, 0.55, 0.9], ['random', random, 0, 0.35]] as const) {
  const t: Record<string, number> = { win: 0, half: 0, fail: 0, stuck: 0 };
  for (let i = 1; i <= N; i++) t[play(bot, i, courts[i % courts.length])]++;
  const w = t.win / N;
  const ok = w >= lo && w <= hi && t.stuck === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(8)} win ${(w * 100).toFixed(0)}%  half ${(t.half / N * 100).toFixed(0)}%  fail ${(t.fail / N * 100).toFixed(0)}%`);
}
process.exit(bad ? 1 : 0);
