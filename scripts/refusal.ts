/**
 * Solver bots for the refusal. Run: npx esbuild scripts/refusal.ts --bundle --platform=node --format=cjs --outfile=/tmp/refusal.cjs && node /tmp/refusal.cjs
 */
import { Game } from '../src/game/state';
import { Rng } from '../src/core/rng';
import { startPiece, stepPiece, runView } from '../src/diplomacy/table';

function play(kind: 'perfect' | 'reader' | 'random', seed: number): string {
  const g = new Game(seed);
  g.polityState('kaabu').met = true; g.polityState('kaabu').trust = 0.4;
  const run = startPiece(g, 'refusal', 'kaabu', 'cantor')!;
  const rng = new Rng(seed * 19 + 3);
  const s = run.state;
  let draft = [0, 0, 0];
  if (kind === 'perfect') draft = [s.needKind === 'self' ? 0 : 2, s.needConsole === 'gift' ? 0 : 1, s.needDoor === 'open' ? 0 : 1];
  if (kind === 'random') draft = [Math.floor(rng.next() * 4), Math.floor(rng.next() * 3), Math.floor(rng.next() * 2)];
  const build = () => { for (const d of draft) stepPiece(g, run, `set:${d}`); };
  build();
  if (kind === 'reader') {
    for (let k = 0; k < 2; k++) {
      stepPiece(g, run, 'preview');
      const said = runView(g, run)!.lines.filter((l) => l.who === 'them').slice(-1)[0]?.text ?? '';
      if (/dignity/.test(said)) break;
      stepPiece(g, run, 'redo');
      if (/wrong kind of excuse/.test(said)) draft[0] = (draft[0] + 2) % 4;
      else if (/cold/.test(said)) draft[1] = draft[1] === 0 ? 1 : 0;
      else draft[2] = draft[2] === 0 ? 1 : 0;
      build();
    }
  }
  return stepPiece(g, run, 'send')?.grade ?? 'stuck';
}
const N = 600; let bad = 0;
for (const [name, lo, hi] of [['perfect', 1, 1], ['reader', 0.7, 0.95], ['random', 0, 0.2]] as const) {
  const t: Record<string, number> = { win: 0, half: 0, fail: 0, stuck: 0 };
  for (let i = 1; i <= N; i++) t[play(name, i)]++;
  const w = t.win / N; const ok = w >= lo && w <= hi && !t.stuck;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(8)} kept the friend ${(w * 100).toFixed(0)}%  insulted ${(t.fail / N * 100).toFixed(0)}%`);
}
process.exit(bad ? 1 : 0);
