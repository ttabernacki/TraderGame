/**
 * Solver bots for the meal. Run: npx esbuild scripts/meal.ts --bundle --platform=node --format=cjs --outfile=/tmp/meal.cjs && node /tmp/meal.cjs
 */
import { Game } from '../src/game/state';
import { Rng } from '../src/core/rng';
import { startPiece, stepPiece, runView } from '../src/diplomacy/table';

type Bot = (g: Game, run: any, rng: Rng) => string;
const perfect: Bot = (_g, run) => (run.state.n < 4 ? 's:0' : run.state.test === 'fast' ? 't:decline' : 't:take');

const words = (t: string) => t.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter((w) => w.length > 3);
const reader: Bot = (g, run) => {
  const v = runView(g, run)!;
  const host = [...v.lines].reverse().find((l) => l.who === 'them')?.text ?? '';
  const text = v.lines.map((l) => l.text).join(' ');
  if (v.choices.some((c) => c.id.startsWith('t:'))) return /untouched/.test(text) ? 't:decline' : 't:take';
  const hw = new Set(words(host));
  const score = (l: string) => words(l).filter((w) => hw.has(w)).length;
  return v.choices.map((c) => [c.id, score(c.label)] as const).sort((a, b) => b[1] - a[1])[0][0];
};
const random: Bot = (g, run, rng) => rng.pick(runView(g, run)!.choices).id;

function play(bot: Bot, seed: number): string {
  const g = new Game(seed);
  const run = startPiece(g, 'meal', 'malindi', 'melinde')!;
  const rng = new Rng(seed * 3 + 1);
  for (let i = 0; i < 12; i++) { const o = stepPiece(g, run, bot(g, run, rng)); if (o) return o.grade; }
  return 'stuck';
}
const N = 500; let bad = 0;
for (const [name, bot, lo, hi] of [['perfect', perfect, 1, 1], ['reader', reader, 0.8, 1], ['random', random, 0, 0.1]] as const) {
  const t: Record<string, number> = { win: 0, half: 0, fail: 0, stuck: 0 };
  for (let i = 1; i <= N; i++) t[play(bot, i)]++;
  const w = t.win / N; const ok = w >= lo && w <= hi && !t.stuck;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(8)} guest ${(w * 100).toFixed(0)}%  stranger ${(t.fail / N * 100).toFixed(0)}%`);
}
process.exit(bad ? 1 : 0);
