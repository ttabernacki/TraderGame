/**
 * The career loop itself (used by scripts/career.ts and scripts/genSaves.ts).
 */
import { Game } from '../../src/game/state';
import { Rng } from '../../src/core/rng';
import { atQuay, answerScenes, careen, newGame, newTally, repair, sailRoad, sailHomeward, trade, victual, type Tally } from './botlib';

/** How far out the road each act wants the voyage to go. */
const FAR: Record<number, string[]> = {
  1: ['funchal', 'arguim', 'mina'],
  2: ['funchal', 'arguim', 'mina', 'mpinda'],
  3: ['funchal', 'arguim', 'mina', 'mpinda', 'benguela', 'sao-bras', 'mocambique'],
  4: ['funchal', 'arguim', 'mina', 'mpinda', 'benguela', 'sao-bras', 'mocambique', 'melinde', 'calecute', 'cochim'],
  5: ['funchal', 'arguim', 'mina', 'mpinda', 'benguela', 'sao-bras', 'mocambique', 'melinde', 'calecute', 'cochim'],
};

export interface Result {
  seed: number; act: number; days: number; gold: number; epilogue: boolean; voyages: number;
  ended: string; snaps: number; trades: number; audiences: number; exception: string; wallMs: number;
}

export interface Opts { maxVoyages: number; maxYears: number; debug: boolean; stopAtLisbon?: (g: Game) => boolean;
  /** Called at the top of each voyage, with the ship at the quay she will sail from. */
  onVoyage?: (g: Game, n: number) => void;
  /** Take up every story offered on the quay (scripts/storylets.ts). */
  accept?: boolean }

export function play(seed: number, o: Opts): Result & { game: Game } {
  const { maxVoyages, maxYears } = o;
  const DEBUG = o.debug;
  const t: Tally = newTally();
  t.accept = o.accept;
  const rng = new Rng(seed * 31 + 7);
  const t0 = Date.now();
  let g: Game = newGame(seed);
  let voyages = 0;
  let ended = '';
  const res = (exception = ''): Result & { game: Game } => ({
    game: g,
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
      if (o.stopAtLisbon?.(g)) { ended = 'stopped'; break; }
      if ((g.mode as string) === 'gameover') { ended = `gameover: ${g.gameOverReason}`; break; }
      if (g.clock.t > deadline) { ended = 'year budget'; break; }
      voyages++;
      o.onVoyage?.(g, voyages);
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
        if (!leg.ok && DEBUG) g.log.entries.slice(-14).forEach((e: any) => console.log('     |', e.text.slice(0, 170)));
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
      repair(g);
      careen(g);
      victual(g, 240);
      const home = sailHomeward(g, t);
      if (DEBUG) console.log(`   [s${seed}] -> home ${home.why} ${home.days.toFixed(1)}d snaps ${home.snapped} ${g.clock.formatDate()} gold ${Math.round(g.crown.gold)}`);
      if (!home.ok && DEBUG) g.log.entries.slice(-14).forEach((e: any) => console.log('     |', e.text.slice(0, 170)));
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

