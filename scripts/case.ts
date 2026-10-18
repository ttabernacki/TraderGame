/**
 * Solver bots for the case. Run: npx esbuild scripts/case.ts --bundle --platform=node --format=cjs --outfile=/tmp/case.cjs && node /tmp/case.cjs
 * Perfect (knows the variant) always wins; a reader using only the view wins most; random about a quarter.
 * Also checks that no ruling is right more often than half the time.
 */
import { Game } from '../src/game/state';
import { Rng } from '../src/core/rng';
import { startPiece, stepPiece, runView } from '../src/diplomacy/table';

type Bot = (g: Game, run: any, rng: Rng) => string;
const RIGHT: Record<string, number> = { rod: 2, tally: 3, broker: 4 };

const perfect: Bot = (_g, run) => `rule:${RIGHT[run.state.v]}`;

const reader: Bot = (g, run, rng) => {
  const v = runView(g, run)!;
  const text = v.lines.map((l) => l.text).join(' | ');
  if (text.includes('thumb shorter')) return 'rule:2';
  if (text.includes('scratched in afterwards')) return 'rule:3';
  if (text.includes('trained writer')) return 'rule:4';
  const unseen = ['rod', 'tally', 'receipt'].filter((id) => v.choices.some((c) => c.id === `look:${id}`));
  if (unseen.length && v.choices.some((c) => c.id === `look:${unseen[0]}`)) return `look:${unseen[0]}`;
  // Out of inquiries and nothing decisive: the culprit is an exhibit it could not read, or one it never saw.
  const blurred = ['rod', 'tally', 'receipt'].filter((id) => text.includes(`The ${id === 'tally' ? 'tally stick' : id} is old`));
  const cand = [...blurred, ...unseen];
  const pick = cand.length ? rng.pick(cand) : 'broker';
  return pick === 'rod' ? 'rule:2' : pick === 'tally' ? 'rule:3' : 'rule:4';
};

const random: Bot = (g, run, rng) => {
  const v = runView(g, run)!;
  const opts = v.choices;
  return rng.pick(opts).id;
};

function play(bot: Bot, seed: number, rights?: Record<number, number>): string {
  const g = new Game(seed);
  const run = startPiece(g, 'case', 'malindi', 'melinde')!;
  const rng = new Rng(seed * 31 + 7);
  for (let i = 0; i < 40; i++) {
    const o = stepPiece(g, run, bot(g, run, rng));
    if (o) { if (rights && o.grade === 'win') { const r = RIGHT[run.state.v]; rights[r] = (rights[r] ?? 0) + 1; } return o.grade; }
  }
  return 'stuck';
}

const N = 600;
let bad = 0;
for (const [name, bot, lo, hi] of [['perfect', perfect, 1, 1], ['reader', reader, 0.6, 0.95], ['random', random, 0, 0.35]] as const) {
  const t: Record<string, number> = { win: 0, half: 0, fail: 0, stuck: 0 };
  for (let i = 1; i <= N; i++) t[play(bot, i)]++;
  const w = t.win / N;
  const ok = w >= lo && w <= hi && t.stuck === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(8)} win ${(w * 100).toFixed(0)}%  fail ${(t.fail / N * 100).toFixed(0)}%`);
}
const rights: Record<number, number> = {};
for (let i = 1; i <= N; i++) play(perfect, i, rights);
const maxShare = Math.max(...Object.values(rights)) / N;
console.log(`${maxShare <= 0.5 ? 'ok  ' : 'FAIL'} no ruling right for more than half (max ${(maxShare * 100).toFixed(0)}%)`);
if (maxShare > 0.5) bad++;

// Folded in from the old linguist piece (Cut A3): at a Guinea/Kongo court the ruling is followed by a proverb.
const THEME_GIST: Record<string, string> = {
  'The river does not refuse the stream': 'how a guest is received', 'The cow that goes far comes home': 'who comes back',
  'Water carried slowly arrives full': 'patience', 'Two hands wash each other': 'who is kin to whom',
  'The hunter sleeps with his spear': 'strength', 'A market belongs to those who keep its peace': 'the peace of the market',
};
function playLing(kind: 'perfect' | 'reader' | 'random', seed: number): { grade: string; learned: boolean } {
  const g = new Game(seed);
  const run = startPiece(g, 'case', 'kongo', 'mpinda')!;
  const rng = new Rng(seed * 17 + 3);
  for (let i = 0; i < 40; i++) {
    const v = runView(g, run)!;
    let pick: string;
    if (v.choices.some((c) => c.id.startsWith('prov:'))) {
      const text = v.lines.map((l) => l.text).join(' ');
      if (kind === 'perfect') pick = `prov:${run.state.ling.want}`;
      else if (kind === 'reader') pick = v.choices.find((c) => text.includes(THEME_GIST[c.label.replace(/[“”]/g, '')]))?.id ?? v.choices[0].id;
      else pick = rng.pick(v.choices).id;
    } else pick = kind === 'perfect' || kind === 'reader' ? (kind === 'perfect' ? `rule:${RIGHT[run.state.v]}` : reader(g, run, rng)) : random(g, run, rng);
    const o = stepPiece(g, run, pick);
    if (o) return { grade: o.grade, learned: g.diplomacy.book.entries.some((e) => e.polity === 'kongo' && e.tag.startsWith('proverb-')) };
  }
  return { grade: 'stuck', learned: false };
}
for (const [name, lo, hi] of [['perfect', 1, 1], ['reader', 0.6, 0.95], ['random', 0, 0.12]] as const) {
  let win = 0, stuck = 0, learnedWin = 0;
  for (let i = 1; i <= N; i++) { const r = playLing(name, i); if (r.grade === 'win') { win++; if (r.learned) learnedWin++; } if (r.grade === 'stuck') stuck++; }
  const w = win / N; const ok = w >= lo && w <= hi && !stuck && learnedWin === win;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} linguist-court ${name.padEnd(8)} win ${(w * 100).toFixed(0)}%  (a win always teaches the proverb: ${learnedWin === win})`);
}
process.exit(bad ? 1 : 0);
