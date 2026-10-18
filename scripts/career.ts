/**
 * Full-career bot. Plays Lisbon -> (the road) -> Lisbon, voyage after voyage, headlessly,
 * through the Game's own API, until the epilogue (Crown.routeOpened), the game ends, or a budget runs out.
 *
 *   npx esbuild scripts/career.ts --bundle --platform=node --format=cjs --outfile=/tmp/career.cjs \
 *     && node /tmp/career.cjs [seeds=3] [firstSeed=1] [maxVoyages=12] [maxYears=40]
 *
 * Per seed it prints: acts reached, days, final purse, epilogue yes/no, snaps (times the bot had to
 * lift the ship past something that held her), exception text. Exit code non-zero on any exception.
 */
import { Game } from '../src/game/state';
import { Rng } from '../src/core/rng';
import { anchorageOf, portDef } from '../src/world/ports';
import { atQuay, repair, answerScenes, newGame, newTally, sailRoad, sailHomeward, trade, victual, type Tally } from './lib/botlib';

const nSeeds = Number(process.argv[2] ?? 3);
const first = Number(process.argv[3] ?? 1);
const maxVoyages = Number(process.argv[4] ?? 12);
const maxYears = Number(process.argv[5] ?? 40);
const DEBUG = !!process.env.BOT_DEBUG;

/** How far out the road each act wants the voyage to go. */
const FAR: Record<number, string[]> = {
  1: ['funchal', 'arguim', 'mina'],
  2: ['funchal', 'arguim', 'mina', 'mpinda'],
  3: ['funchal', 'arguim', 'mina', 'mpinda', 'benguela', 'sao-bras', 'mocambique'],
  4: ['funchal', 'arguim', 'mina', 'mpinda', 'benguela', 'sao-bras', 'mocambique', 'melinde', 'calecute', 'cochim'],
  5: ['funchal', 'arguim', 'mina', 'mpinda', 'benguela', 'sao-bras', 'mocambique', 'melinde', 'calecute', 'cochim'],
};

interface Result {
  seed: number; act: number; days: number; gold: number; epilogue: boolean; voyages: number;
  ended: string; snaps: number; trades: number; audiences: number; exception: string; wallMs: number;
}

function play(seed: number): Result {
  const t: Tally = newTally();
  const rng = new Rng(seed * 31 + 7);
  const t0 = Date.now();
  let g: Game = newGame(seed);
  let voyages = 0;
  let ended = '';
  const res = (exception = ''): Result => ({
    seed, act: g.chronicle.act, days: Math.round((g.clock.t - g.startT) / 86400), gold: Math.round(g.crown.gold),
    epilogue: g.crown.routeOpened, voyages, ended, snaps: t.snaps, trades: t.trades, audiences: t.audiences,
    exception, wallMs: Date.now() - t0,
  });
  try {
    g.checkStory();
    answerScenes(g, t);
    const deadline = g.clock.t + maxYears * 365 * 86400;
    while (voyages < maxVoyages) {
      if (g.crown.routeOpened) { ended = 'epilogue'; break; }
      if ((g.mode as string) === 'gameover') { ended = `gameover: ${g.gameOverReason}`; break; }
      if (g.clock.t > deadline) { ended = 'year budget'; break; }
      voyages++;
      // --- At Lisbon: court, trade, stores.
      if (g.dockedAt !== 'lisboa') { ended = `not at Lisbon (${g.dockedAt ?? 'sea'})`; break; }
      const stops = FAR[Math.min(5, g.chronicle.act)];
      atQuay(g, stops[0], t, rng);
      if (DEBUG) console.log(`   [s${seed}] voyage ${voyages} sails: hull ${g.ship.condition.hull.toFixed(2)} leak ${g.ship.condition.leak.toFixed(2)} bilge ${g.ship.condition.bilge.toFixed(1)} crew ${g.crew.count}/${g.crew.complement} gold ${Math.round(g.crown.gold)} date ${g.clock.formatDate()}`);
      // --- Outward along the road.
      let fail = '';
      for (let i = 0; i < stops.length; i++) {
        const leg = sailRoad(g, stops[i], t);
        if (DEBUG) console.log(`   [s${seed}] -> ${stops[i]} ${leg.why} ${leg.days.toFixed(1)}d snaps ${leg.snapped} ${g.clock.formatDate()} gold ${Math.round(g.crown.gold)} act ${g.chronicle.act}`);
        if (!leg.ok) { fail = `outward to ${stops[i]}: ${leg.why}`; break; }
        if ((g.mode as string) === 'gameover') break;
        if (i < stops.length - 1) atQuay(g, stops[i + 1], t, rng);
        else {
          // The far end: act V wants a hundred quintals of pepper for the Tagus.
          atQuay(g, 'lisboa', t, rng);
          if (g.chronicle.act >= 5) buyPepper(g, t);
        }
      }
      if ((g.mode as string) === 'gameover') continue;
      if (fail) { ended = fail; break; }
      // --- Home by the volta.
      victual(g);
      const home = sailHomeward(g, t);
      if (DEBUG) console.log(`   [s${seed}] -> home ${home.why} ${home.days.toFixed(1)}d snaps ${home.snapped} ${g.clock.formatDate()} gold ${Math.round(g.crown.gold)}`);
      if (!home.ok && DEBUG) console.log('   reason:', g.gameOverReason, 'crew', g.crew.count, 'prov', JSON.stringify(g.crew.provisions), g.ship.condition);
      if (!home.ok) { ended = `homeward: ${home.why}`; break; }
      // Arrived at Lisbon: story beats open at the dock; then sell.
      if (DEBUG) console.log(JSON.stringify(t.events));
      if (DEBUG) console.log(`   [s${seed}] arrived: hull ${g.ship.condition.hull.toFixed(2)} leak ${g.ship.condition.leak.toFixed(2)} bilge ${g.ship.condition.bilge.toFixed(1)} mode ${g.mode}`);
      trade(g, null, t);
      repair(g);
      answerScenes(g, t);
      g.checkStory();
      answerScenes(g, t);
      // Let any dispatch / chronicle chain play out.
      for (let k = 0; k < 4; k++) { g.waitDays(2); g.checkStory(); answerScenes(g, t); }
    }
    if (!ended) ended = 'voyage budget';
    return res();
  } catch (e: any) {
    return res(String(e?.stack ?? e).split('\n').slice(0, 4).join(' | '));
  }
}

function buyPepper(g: Game, t: Tally): void {
  if (g.dockedAt !== 'cochim' && g.dockedAt !== 'calecute') return;
  const l = g.marketHere().find((x) => x.goodId === 'pimenta');
  if (!l) return;
  const room = Math.floor(g.ship.holdFree / 1);
  const r = g.tradeBuy('pimenta', Math.min(room, Math.max(0, 120 - g.ship.quantityOf('pimenta'))));
  if (r.ok) t.trades++;
}

let bad = 0;
const rows: Result[] = [];
for (let s = first; s < first + nSeeds; s++) {
  const r = play(s);
  rows.push(r);
  const failed = !!r.exception;
  if (failed) bad++;
  console.log(`${failed ? 'FAIL' : 'ok  '} seed ${r.seed}: act ${r.act}/5  days ${r.days}  purse ${r.gold}  epilogue ${r.epilogue ? 'YES' : 'no'}  `
    + `voyages ${r.voyages}  snaps ${r.snaps}  trades ${r.trades}  audiences ${r.audiences}  ${(r.wallMs / 1000).toFixed(1)}s  [${r.ended}]`
    + (r.exception ? `\n     EXCEPTION ${r.exception}` : ''));
}
const eps = rows.filter((r) => r.epilogue).length;
console.log(`-- ${rows.length} seeds, ${eps} epilogues, max act ${Math.max(...rows.map((r) => r.act))}, ${bad} exceptions`);
process.exit(bad ? 1 : 0);
void portDef; void anchorageOf;
