/**
 * Solver bots for the linguist piece. Run: npx esbuild scripts/linguist.ts --bundle --platform=node --format=cjs --outfile=/tmp/linguist.cjs && node /tmp/linguist.cjs
 */
import { Game } from '../src/game/state';
import { Rng } from '../src/core/rng';
import { startPiece, stepPiece, runView } from '../src/diplomacy/table';

type Bot = (g: Game, run: any, rng: Rng, mem: any) => string[];
const perfect: Bot = (_g, run) => { const s = run.state; return [`set:${s.precedent}`, 'set:0', 'set:0', `set:${s.proverbs.indexOf(s.want)}`, 'send']; };

/** Sounds the linguist and the elder, reads the hints, then sends. */
const reader: Bot = (g, run, _rng, mem) => {
  const v = runView(g, run)!;
  const text = v.lines.map((l) => l.text).join(' ');
  if (!mem.s1) { mem.s1 = 1; return ['sound:ling']; }
  if (!mem.s2) { mem.s2 = 1; return ['sound:elder']; }
  const m = /speaking of ([^.]+?) and of ([^.]+)\./.exec(text);
  const praise = /called a brother/.test(text) ? 1 : 0;
  const names = ['how a guest is received', 'who comes back', 'patience', 'who is kin to whom', 'strength', 'the peace of the market'];
  const mentioned = [m?.[1], m?.[2]].map((x) => names.indexOf(x ?? ''));
  const offered = run.state.proverbs as number[];
  const hit = offered.map((o: number, i: number) => (mentioned.includes(o) ? i : -1)).filter((i: number) => i >= 0);
  const which = hit.length ? hit[0] : 0;
  return [`set:${praise}`, 'set:0', 'set:0', `set:${which}`, 'send'];
};
const random: Bot = (_g, _run, rng) => ['set:' + Math.floor(rng.next() * 3), 'set:' + Math.floor(rng.next() * 3), 'set:' + Math.floor(rng.next() * 3), 'set:' + Math.floor(rng.next() * 3), 'send'];

function play(bot: Bot, seed: number): string {
  const g = new Game(seed);
  const run = startPiece(g, 'linguist', 'eguafo', 'mina')!;
  const rng = new Rng(seed * 11 + 2);
  const mem: any = {};
  for (let turn = 0; turn < 10; turn++) {
    for (const st of bot(g, run, rng, mem)) { const o = stepPiece(g, run, st); if (o) return o.grade; }
  }
  return 'stuck';
}
const N = 500; let bad = 0;
for (const [name, bot, lo, hi] of [['perfect', perfect, 1, 1], ['reader', reader, 0.7, 1], ['random', random, 0, 0.2]] as const) {
  const t: Record<string, number> = { win: 0, half: 0, fail: 0, stuck: 0 };
  for (let i = 1; i <= N; i++) t[play(bot, i)]++;
  const w = t.win / N; const ok = w >= lo && w <= hi && !t.stuck;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(8)} through ${(w * 100).toFixed(0)}%  boaster ${(t.fail / N * 100).toFixed(0)}%  stuck ${t.stuck}`);
}
process.exit(bad ? 1 : 0);
