/**
 * Solver bots for the hostage's letters. Run: npx esbuild scripts/hostage.ts --bundle --platform=node --format=cjs --outfile=/tmp/hostage.cjs && node /tmp/hostage.cjs
 */
import { Game } from '../src/game/state';
import { startPiece, tickPieces } from '../src/diplomacy/table';

type Policy = (text: string, run: any) => 'doctor' | 'goods' | 'hold' | 'free';
const IDX = { doctor: 0, goods: 1, hold: 2, free: 3 };
const read = (t: string): number => (/very ill/.test(t) ? 0.15 : /pale/.test(t) ? 0.4 : /quiet/.test(t) ? 0.6 : 0.85);

function play(policy: Policy, seed: number): string {
  const g = new Game(seed);
  g.polityState('azenegue').met = true;
  const run = startPiece(g, 'hostage', 'azenegue', 'arguim')!;
  for (let i = 0; i < 20 && !run.outcome; i++) {
    tickPieces(g, 40);
    const ev = g.pendingEvent;
    if (ev?.choices) { ev.choices[IDX[policy(ev.text, run)]].resolve(g); g.pendingEvent = null; }
  }
  return run.outcome?.grade ?? 'stuck';
}
// Perfect knows the real health now. Reader sees only the letter.
const perfect: Policy = (_t, run) => (run.state.h < 0.55 ? 'doctor' : 'goods');
const reader: Policy = (t) => (read(t) < 0.55 ? 'doctor' : 'goods');
const hold: Policy = () => 'hold';
const doctor: Policy = () => 'doctor';
const free: Policy = () => 'free';
let seq = 0; const random: Policy = () => (['doctor', 'goods', 'hold', 'free'] as const)[(seq++ * 5 + 1) % 4];

const N = 500; let bad = 0;
for (const [name, pol, lo, hi] of [['perfect', perfect, 0.85, 1], ['reader', reader, 0.6, 0.97], ['always hold', hold, 0, 0.35], ['always doctor', doctor, 0, 0.3], ['buy out', free, 0, 0], ['random', random, 0, 0.35]] as const) {
  let win = 0, fail = 0, stuck = 0;
  for (let i = 1; i <= N; i++) { const r = play(pol, i); if (r === 'win') win++; if (r === 'fail') fail++; if (r === 'stuck') stuck++; }
  const w = win / N; const ok = w >= lo && w <= hi && !stuck;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(14)} raised well ${(w * 100).toFixed(0)}%  died ${(fail / N * 100).toFixed(0)}%  stuck ${stuck}`);
}
process.exit(bad ? 1 : 0);
