/**
 * Golden-save gate. For every fixtures/saves/*.json: load with Game.deserialize, step one simulated month
 * (docked: waitDays(30); at sea: the game's own update() loop at the top clock rate, scenes answered),
 * re-serialise, load again, and check invariants. Prints ok/FAIL per save; exit code 1 on any failure.
 *
 *   npx esbuild scripts/saves.ts --bundle --platform=node --format=cjs --outfile=/tmp/saves.cjs \
 *     && node /tmp/saves.cjs [fixtureDir=fixtures/saves]
 *
 * Fixtures are produced by scripts/genSaves.ts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { Game } from '../src/game/state';
import { answerScenes, newTally, TOP_SCALE } from './lib/botlib';

const DIR = process.argv[2] ?? 'fixtures/saves';
const MONTH = 30 * 86400;
const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
if (files.length === 0) { console.log(`FAIL no fixtures in ${DIR}`); process.exit(1); }

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Everything that should be true of a living game, loaded or stepped. Returns the failures. */
function invariants(g: Game, label: string): string[] {
  const bad: string[] = [];
  const need = (ok: boolean, what: string) => { if (!ok) bad.push(`${label}: ${what}`); };
  need(fin(g.clock.t) && g.clock.t > 0, `clock ${g.clock.t}`);
  need(fin(g.crown.gold), `purse ${g.crown.gold}`);
  need(Math.abs(g.crown.gold) < 1e7, `purse out of range ${g.crown.gold}`);
  const p = g.ship.state.pos;
  need(fin(p.lat) && fin(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180, `position ${p.lat},${p.lon}`);
  const c = g.ship.condition;
  need(fin(c.hull) && c.hull >= 0 && c.hull <= 1, `hull ${c.hull}`);
  need(fin(c.leak) && fin(c.bilge) && fin(c.fouling), 'condition not finite');
  need(fin(g.crew.count) && g.crew.count >= 0, `crew ${g.crew.count}`);
  need(g.ship.cargo.every((l) => fin(l.quantity) && l.quantity >= 0 && fin(l.cost)), 'cargo lot not finite');
  need(fin(g.ship.cargoTons) && g.ship.cargoTons <= g.ship.holdCapacity + 1, `hold ${g.ship.cargoTons}/${g.ship.holdCapacity}`);
  need(g.chronicle.act >= 1 && g.chronicle.act <= 5, `act ${g.chronicle.act}`);
  need(fin(g.crown.standing) && fin(g.crown.lifetimeStanding), 'standing not finite');
  need(g.mode !== 'title', 'mode is title');
  need(!!g.ship.name, 'ship has no name');
  need(g.dockedAt === null || !!g.dockedAt, 'dockedAt undefined');
  // The Ledger (B1) is not in the game yet: when it lands, it must survive the round trip.
  if ('ledger' in (g as any)) need(Array.isArray((g as any).ledger?.entries ?? (g as any).ledger), 'ledger malformed');
  return bad;
}

/** One simulated month, with the game's own clock. */
function stepMonth(g: Game): void {
  const t = newTally();
  const until = g.clock.t + MONTH;
  g.clock.paused = false;
  answerScenes(g, t);
  if (g.dockedAt) {
    g.waitDays(30);
  } else {
    g.mode = 'sailing';
    g.clock.scaleIndex = TOP_SCALE;
    for (let i = 0; g.clock.t < until && i < 2000; i++) {
      answerScenes(g, t);
      g.clock.scaleIndex = TOP_SCALE;
      g.update(0.25);
      if ((g.mode as string) === 'gameover') break;
    }
  }
  answerScenes(g, t);
}

/** The fields a save must carry across a round trip unchanged. */
const key = (g: Game) => ({
  t: Math.round(g.clock.t),
  gold: Math.round(g.crown.gold),
  ship: g.ship.name,
  hull: g.ship.hullId,
  dockedAt: g.dockedAt,
  act: g.chronicle.act,
  crew: g.crew.count,
  cargo: g.ship.cargo.map((l) => `${l.goodId}:${Math.round(l.quantity)}`).sort().join(','),
  quests: g.quests.map((q) => q.id).join(','),
  lines: g.lines.length,
  houses: g.feitorias.length,
  ventures: g.ventures.length,
  pieces: g.diplomacy.pieces.runs.length,
  patent: g.crown.patent?.title ?? null,
  generation: g.generation,
  visited: g.visitedPorts.size,
});

let failures = 0;
for (const f of files) {
  const t0 = Date.now();
  const bad: string[] = [];
  try {
    const raw = readFileSync(`${DIR}/${f}`, 'utf8');
    const g = Game.deserialize(raw);
    bad.push(...invariants(g, 'loaded'));
    const before = key(g);
    const t1 = g.clock.t;

    stepMonth(g);
    if ((g.mode as string) === 'gameover') bad.push(`gameover within the month: ${g.gameOverReason}`);
    bad.push(...invariants(g, 'stepped'));
    if (g.clock.t - t1 < MONTH * 0.95) bad.push(`clock moved only ${((g.clock.t - t1) / 86400).toFixed(1)} days`);

    const json2 = g.serialize();
    if (json2.length < 1000 || json2.length > 5e6) bad.push(`re-serialised size ${json2.length}`);
    const g2 = Game.deserialize(json2);
    bad.push(...invariants(g2, 'reloaded'));
    const a = key(g), b = key(g2);
    for (const k of Object.keys(a) as (keyof typeof a)[]) {
      if (a[k] !== b[k]) bad.push(`round trip changed ${k}: ${a[k]} -> ${b[k]}`);
    }
    // Serialising the reloaded game must be stable (a second round trip changes nothing that matters).
    const g3 = Game.deserialize(g2.serialize());
    const c = key(g3);
    for (const k of Object.keys(b) as (keyof typeof b)[]) {
      if (b[k] !== c[k]) bad.push(`second round trip changed ${k}: ${b[k]} -> ${c[k]}`);
    }
    // And the reloaded game still runs.
    stepMonth(g2);
    bad.push(...invariants(g2, 'reloaded+month'));
    void before;
  } catch (e: any) {
    bad.push(`exception: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' | ')}`);
  }
  if (bad.length) failures++;
  console.log(`${bad.length ? 'FAIL' : 'ok  '} ${f.padEnd(28)} ${((Date.now() - t0) / 1000).toFixed(1)}s${bad.length ? '\n     ' + bad.join('\n     ') : ''}`);
}
console.log(`-- ${files.length} saves, ${failures} failed`);
process.exit(failures ? 1 : 0);
