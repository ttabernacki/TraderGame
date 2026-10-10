/**
 * Solver bots for the go-between. Run: npx esbuild scripts/between.ts --bundle --platform=node --format=cjs --outfile=/tmp/between.cjs && node /tmp/between.cjs
 * Perfect knows the limits; the reader moves only on what the two courts say; random wanders. A straight split must fail the tension issue.
 */
import { Game } from '../src/game/state';
import { Rng } from '../src/core/rng';
import { startPiece, stepPiece, runView } from '../src/diplomacy/table';

type Bot = (g: Game, run: any, rng: Rng, mem: any) => string[];

/** Returns the list of steps to take this turn (ends with send). */
const perfect: Bot = (_g, run) => {
  const s = run.state, out: string[] = [];
  for (let i = 0; i < 3; i++) {
    let lo = s.rA[i], hi = s.rB[i];
    if (i === s.tension) { out.push(`gift:0:${i}`); lo -= 2; }
    const target = Math.max(0, Math.min(10, Math.ceil((lo + hi) / 2)));
    const d = target - s.x[i];
    for (let k = 0; k < Math.abs(d); k++) out.push(`nudge:${i}:${d > 0 ? 1 : -1}`);
  }
  out.push('send');
  return out;
};

const reader: Bot = (g, run, _rng, mem) => {
  const out: string[] = [];
  const v = runView(g, run)!;
  const text = v.lines.filter((l) => l.who === 'them').map((l) => l.text);
  if (text.length === 0) return ['send'];
  const issues: string[] = run.state.issues;
  issues.forEach((name, i) => {
    const row = text.find((t) => t.startsWith(`${name}:`)) ?? '';
    const aBad = /cannot accept|insulted/.test(row.split(';')[0]);
    const bBad = /cannot accept|insulted/.test(row.split(';')[1] ?? '');
    if (aBad && bBad) {
      // Both sides cannot: a tension. Ease the home court's limit once, then split near it.
      if (!mem.gifted?.[i] && run.state.gifts > 0) { (mem.gifted ??= {})[i] = 1; out.push(`gift:0:${i}`); }
      return;
    }
    const want = aBad ? 1 : bBad ? -1 : 0;
    if (!want) return;
    const prev = ((mem.prev ??= {}) as Record<number, number>)[i];
    mem.prev[i] = want;
    // Pushed one way, then pushed back: both courts are against the same point. That is a tension; ease one side.
    if (prev && prev !== want && !mem.gifted?.[i] && run.state.gifts > 0) {
      (mem.gifted ??= {})[i] = 1; out.push(`gift:0:${i}`); return;
    }
    out.push(`nudge:${i}:${want}`);
    if (/insulted/.test(row)) out.push(`nudge:${i}:${want}`);
  });
  out.push('send');
  return out;
};

const random: Bot = (_g, run, rng) => {
  const out: string[] = [];
  for (let k = 0; k < 4; k++) out.push(`nudge:${Math.floor(rng.next() * 3)}:${rng.next() < 0.5 ? 1 : -1}`);
  if (rng.next() < 0.3 && run.state.gifts > 0) out.push(`gift:${rng.next() < 0.5 ? 0 : 1}:${Math.floor(rng.next() * 3)}`);
  out.push('send');
  return out;
};

function play(bot: Bot, seed: number, straight = false): string {
  const g = new Game(seed);
  const run = startPiece(g, 'between', 'malindi', 'melinde')!;
  const rng = new Rng(seed * 17 + 3);
  const mem: any = {};
  for (let turn = 0; turn < 12; turn++) {
    const steps = straight ? ['send'] : bot(g, run, rng, mem);
    for (const st of steps) {
      const o = stepPiece(g, run, st);
      if (o) return o.grade;
    }
  }
  return 'stuck';
}

const N = 500;
let bad = 0;
for (const [name, bot, lo, hi] of [['perfect', perfect, 0.99, 1], ['reader', reader, 0.6, 0.95], ['random', random, 0, 0.35]] as const) {
  const t: Record<string, number> = { win: 0, half: 0, fail: 0, stuck: 0 };
  for (let i = 1; i <= N; i++) t[play(bot, i)]++;
  const won = (t.win + t.half) / N;
  const ok = won >= lo && won <= hi && t.stuck === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(8)} peace ${(won * 100).toFixed(0)}%  (warm ${(t.win / N * 100).toFixed(0)}%)  failed ${(t.fail / N * 100).toFixed(0)}%`);
}
let straight = 0;
for (let i = 1; i <= N; i++) { const r = play(perfect, i, true); if (r === 'win' || r === 'half') straight++; }
console.log(`${straight / N === 0 ? 'ok  ' : 'FAIL'} straight split never works (${straight}/${N})`);
if (straight) bad++;
if (process.env.DBG) {
  const g = new Game(5); const run = startPiece(g, 'between', 'malindi', 'melinde')!;
  console.log(JSON.stringify({ rA: run.state.rA, rB: run.state.rB, t: run.state.tension }));
  const rng = new Rng(1), mem: any = {};
  for (let k = 0; k < 4; k++) { const st = reader(g, run, rng, mem); console.log(st.join(' ')); for (const x of st) stepPiece(g, run, x); console.log(run.state.x, run.state.said, run.state.days); }
}
process.exit(bad ? 1 : 0);
