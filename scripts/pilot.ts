/**
 * Solver bots for the pilot's test. Run: npx esbuild scripts/pilot.ts --bundle --platform=node --format=cjs --outfile=/tmp/pilot.cjs && node /tmp/pilot.cjs
 * "Always check" must lose to a reader who checks once and infers; "always follow" must lose to the agent.
 */
import { Game } from '../src/game/state';
import { Rng } from '../src/core/rng';
import { startPiece, tickPieces } from '../src/diplomacy/table';

type Policy = (beat: number, mem: { sawRight: boolean | null }, kind: string) => 'follow' | 'check' | 'refuse';
const IDX = { follow: 0, check: 1, refuse: 2 };

function play(policy: Policy, seed: number): { grade: string; kind: string } {
  const g = new Game(seed);
  const run = startPiece(g, 'pilot', 'malindi', 'melinde')!;
  const kind = run.state.kind as string;
  const mem = { sawRight: null as boolean | null };
  for (let i = 0; i < 12 && !run.outcome; i++) {
    tickPieces(g, 2);
    const ev = g.pendingEvent;
    if (ev?.choices) {
      const beat = run.state.pending as number;
      const how = policy(beat, mem, kind);
      // A check reveals whether the claim was true.
      if (how === 'check') mem.sawRight = run.state.truth[beat];
      ev.choices[IDX[how]].resolve(g);
      g.pendingEvent = null;
    }
  }
  return { grade: run.outcome?.grade ?? 'stuck', kind };
}
const always = (h: 'follow' | 'check' | 'refuse'): Policy => () => h;
const perfect: Policy = (_b, _m, kind) => (kind === 'true' ? 'follow' : 'check');
const reader: Policy = (b, m) => (b === 0 ? 'check' : m.sawRight === true ? 'follow' : 'check');
const random: Policy = (b) => (['follow', 'check', 'refuse'] as const)[(b * 7 + 3) % 3];

const N = 500; let bad = 0;
for (const [name, pol, lo, hi] of [['perfect', perfect, 0.9, 1], ['reader', reader, 0.55, 0.9], ['always follow', always('follow'), 0, 0.5], ['always check', always('check'), 0, 0.6], ['always refuse', always('refuse'), 0, 0.1], ['random', random, 0, 0.3]] as const) {
  let win = 0, stuck = 0;
  for (let i = 1; i <= N; i++) { const r = play(pol, i); if (r.grade === 'win') win++; if (r.grade === 'stuck') stuck++; }
  const w = win / N; const ok = w >= lo && w <= hi && !stuck;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(14)} read him right ${(w * 100).toFixed(0)}%  stuck ${stuck}`);
}
process.exit(bad ? 1 : 0);
