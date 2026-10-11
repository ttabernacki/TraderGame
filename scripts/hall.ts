/**
 * Solver bots for the hall. Run: npx esbuild scripts/hall.ts --bundle --platform=node --format=cjs --outfile=/tmp/hall.cjs && node /tmp/hall.cjs
 * Perfect passes at once. The reader uses the two hints, guesses the rest, and learns from the correction.
 * Win = right first time. Half = right after a correction.
 */
import { Game } from '../src/game/state';
import { Rng } from '../src/core/rng';
import { startPiece, stepPiece, runView } from '../src/diplomacy/table';
import { HALL_RULES } from '../src/diplomacy/pieces/hall';

const ZONES = ['front', 'brahmin', 'nair', 'back', 'bench'];
const THINGS = ['you', 'interp', 'gifts', 'retinue'];

function play(kind: 'perfect' | 'reader' | 'random', seed: number): string {
  const g = new Game(seed);
  const run = startPiece(g, 'hall', 'cochin', 'cochim')!;
  const rng = new Rng(seed * 7 + 5);
  const known: Record<string, string> = {};
  for (let attempt = 0; attempt < 4; attempt++) {
    // What a player has: the rule texts the escort and the correction have shown.
    for (const l of runView(g, run)!.lines) {
      const r = HALL_RULES.find((x) => l.text.includes(x.text));
      if (r) known[r.thing] = r.zone;
    }
    for (const t of THINGS) {
      let z: string;
      if (kind === 'perfect') z = HALL_RULES[(run.state.rules as number[]).find((i) => HALL_RULES[i].thing === t)!].zone;
      else if (kind === 'reader') z = known[t] ?? 'front';
      else z = rng.pick(ZONES);
      stepPiece(g, run, `put:${z}`);
    }
    const o = stepPiece(g, run, 'enter');
    if (o) return o.grade;
  }
  return 'stuck';
}

const N = 400; let bad = 0;
for (const [name, lo, hi] of [['perfect', 0.99, 1], ['reader', 0, 0.55], ['random', 0, 0.05]] as const) {
  const t: Record<string, number> = { win: 0, half: 0, fail: 0, stuck: 0 };
  for (let i = 1; i <= N; i++) t[play(name, i)]++;
  const w = t.win / N, pass = (t.win + t.half) / N;
  const ok = w >= lo && w <= hi && !t.stuck && (name !== 'reader' || pass >= 0.9);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(8)} first time ${(w * 100).toFixed(0)}%  after correction ${(t.half / N * 100).toFixed(0)}%  twice defiled ${(t.fail / N * 100).toFixed(0)}%`);
}
process.exit(bad ? 1 : 0);
