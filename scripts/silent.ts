/**
 * Solver bots for the silent trade. Targets: the perfect bot always wins; a bot
 * that only reads what the herdsmen do wins most; a random one wins about a third
 * or less. Run: npx esbuild scripts/silent.ts --bundle --platform=node --format=cjs --outfile=/tmp/silent.cjs && node /tmp/silent.cjs
 */
import { Game } from '../src/game/state';
import { Rng } from '../src/core/rng';
import { startPiece, stepPiece, runView } from '../src/diplomacy/table';

type Bot = (g: Game, run: any, rng: Rng, mem: any) => string;

const perfect: Bot = (_g, run) => {
  const s = run.state;
  if (Math.floor(s.value + 1e-9) >= 3) return 'go';
  if (s.unease >= 4) return 'wait';
  const marginal = (id: string) => s.vals[id].v / (1 + 0.5 * Math.max(0, (s.laid[id] ?? 0)))
    - 0.5 * ((s.vals[id].old < 0 ? 1 : 0) + (s.vals[id].young < 0 ? 1 : 0) + ((s.laid[id] ?? 0) >= 3 ? 1 : 0));
  const cand = Object.keys(s.stock).filter((id) => s.stock[id] > 0).sort((a, b) => marginal(b) - marginal(a));
  return cand.length ? `lay:${cand[0]}` : 'go';
};

/** Sees only the view: choices and the voices' last words. */
const reader: Bot = (g, run, _rng, mem) => {
  const v = runView(g, run)!;
  const beasts = Number((v.lines[v.lines.length - 1].text.match(/^(\d+) on the mat/) ?? [])[1] ?? 0);
  if (beasts >= 3) return 'go';
  const said = v.lines.filter((l) => l.who === 'them').slice(-1)[0]?.text ?? '';
  if (mem.last) {
    const score = (said.includes('at once') ? 3 : said.includes('confer') ? 2 : said.includes('long time') ? 1 : 0)
      - (said.includes('mutter') || said.includes('step back') ? 2 : 0);
    mem.score[mem.last] = Math.max(mem.score[mem.last] ?? -9, score);
  }
  const lays = v.choices.filter((c) => c.id.startsWith('lay:') && !c.disabled).map((c) => c.id);
  const fresh = lays.find((id) => mem.score[id] === undefined);
  const pick = fresh ?? lays.filter((id) => (mem.score[id] ?? 0) >= 2).sort((a, b) => mem.score[b] - mem.score[a])[0];
  mem.last = pick ?? null;
  return pick ?? 'go';
};

const random: Bot = (g, run, rng) => {
  const v = runView(g, run)!;
  const opts = v.choices.filter((c) => !c.disabled);
  return rng.pick(opts).id;
};

function play(bot: Bot, seed: number): string {
  const g = new Game(seed);
  g.ship.addCargo('ferramenta', 6, 8); g.ship.addCargo('manilhas', 6, 5);
  g.ship.addCargo('contas', 6, 3); g.ship.addCargo('espelhos', 6, 9);
  const run = startPiece(g, 'silent', 'khoi', 'sao-bras')!;
  const rng = new Rng(seed * 7 + 1);
  const mem = { score: {} as Record<string, number>, last: null as string | null };
  for (let i = 0; i < 60; i++) {
    const o = stepPiece(g, run, bot(g, run, rng, mem));
    if (o) return o.grade;
  }
  return 'stuck';
}

const N = 400;
let bad = 0;
for (const [name, bot, lo, hi] of [['perfect', perfect, 0.97, 1], ['reader', reader, 0.6, 0.9], ['random', random, 0, 0.35]] as const) {
  const t: Record<string, number> = { win: 0, half: 0, fail: 0, stuck: 0 };
  for (let i = 1; i <= N; i++) t[play(bot, i)]++;
  const w = t.win / N;
  const ok = w >= lo && w <= hi && t.stuck === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(8)} win ${(w * 100).toFixed(0)}%  half ${(t.half / N * 100).toFixed(0)}%  fail ${(t.fail / N * 100).toFixed(0)}%`);
}
process.exit(bad ? 1 : 0);
