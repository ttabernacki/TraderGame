/**
 * Solver bots for the informer. Run: npx esbuild scripts/informer.ts --bundle --platform=node --format=cjs --outfile=/tmp/informer.cjs && node /tmp/informer.cjs
 */
import { Game } from '../src/game/state';
import { Rng } from '../src/core/rng';
import { startPiece, stepPiece, runView } from '../src/diplomacy/table';

type Bot = (g: Game, run: any, rng: Rng) => string;
const perfect: Bot = (_g, run) => `accuse:${run.state.agent}`;

/** Sees only what has been said: tallies how often each name was seen doing something. */
const reader: Bot = (g, run, rng) => {
  const s = run.state;
  const v = runView(g, run)!;
  const night = ['money', 'night', 'script', 'money'][NIGHTS - s.nights];
  if (s.nights > 0) return `watch:${night}`;
  const tally = s.names.map((n: string) => v.lines.filter((l) => l.who === 'them' && l.text.includes(n)).length);
  const best = Math.max(...tally);
  return `accuse:${rng.pick(tally.map((t: number, i: number) => (t === best ? i : -1)).filter((i: number) => i >= 0))}`;
};
const NIGHTS = 4;
const random: Bot = (_g, _run, rng) => `accuse:${Math.floor(rng.next() * 4)}`;

function play(bot: Bot, seed: number): string {
  const g = new Game(seed);
  g.polityState('calicut').rivalCourted = true;
  g.polityState('calicut').met = true;
  const run = startPiece(g, 'informer', 'calicut', 'calecute')!;
  const rng = new Rng(seed * 5 + 9);
  for (let i = 0; i < 12; i++) { const o = stepPiece(g, run, bot(g, run, rng)); if (o) return o.grade; }
  return 'stuck';
}
const N = 600; let bad = 0;
for (const [name, bot, lo, hi] of [['perfect', perfect, 1, 1], ['reader', reader, 0.6, 0.92], ['random', random, 0.15, 0.35]] as const) {
  const t: Record<string, number> = { win: 0, half: 0, fail: 0, stuck: 0 };
  for (let i = 1; i <= N; i++) t[play(bot, i)]++;
  const w = t.win / N; const ok = w >= lo && w <= hi && !t.stuck;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(8)} win ${(w * 100).toFixed(0)}%  innocent ruined ${(t.fail / N * 100).toFixed(0)}%`);
}
process.exit(bad ? 1 : 0);
