/**
 * Save resolvers for the Phase A3 cuts (docs/CUTS.md). Takes golden saves, plants the old state the cut
 * systems used to write, loads them, and checks each resolver settled it.
 *   npx esbuild scripts/cuts.ts --bundle --platform=node --format=cjs --outfile=/tmp/cuts.cjs && node /tmp/cuts.cjs
 */
import { readFileSync } from 'node:fs';
import { Game } from '../src/game/state';

let fails = 0;
const check = (name: string, ok: boolean, extra = ''): void => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };
const load = (f: string): any => JSON.parse(readFileSync(`fixtures/saves/${f}`, 'utf8'));

// 1. estate: holdings, accrued money, a voyage outfitted, a lordship -> purse; fields dropped.
{
  const d = load('03-docked-cargo.json');
  const before = d.crown.gold;
  d.estate = { outfits: [{ id: 'o1', stake: 700, route: 'mina' }, { id: 'o2', stake: 900, outcome: 'home', payout: 1500 }], offers: [{ id: 'o3' }],
    holdings: { casa: 2, quinta: 1, senhorio: 1 }, accrued: 250, news: ['A letter.'], lastMonthT: 1, nextId: 4, earned: 10, lordship: 'Alvito' };
  const g = Game.deserialize(JSON.stringify(d));
  const want = 3000 + 5500 + 4200 + 15000 + 250 + 700;
  check('estate converts to purse', Math.round(g.crown.gold - before) === want, `+${Math.round(g.crown.gold - before)} want +${want}`);
  check('lordship survives', g.lordship === 'Alvito');
  check('estate field is gone from the save', !('estate' in JSON.parse(g.serialize())));
  const g2 = Game.deserialize(g.serialize());
  check('second load does not pay twice', Math.round(g2.crown.gold) === Math.round(g.crown.gold));
}

// 2. factory: a House with state loads, does not tick in the background, and is run forward on a visit.
{
  const d = load('06-line-and-house.json');
  const g = Game.deserialize(JSON.stringify(d));
  const f = g.feitorias.find((x) => !x.lost);
  check('house present', !!f);
  if (f) {
    const ledgerBefore = f.ledger?.months ?? 0;
    (g as any).checkWorld();
    g.clock.t += 90 * 86400;
    (g as any).checkWorld();
    check('no background ticks', (f.ledger?.months ?? 0) === ledgerBefore);
  }
}

// 4. port quests: an open errand at the docked port is cancelled with one log line.
{
  const d = load('03-docked-cargo.json');
  d.portQuestsDone = [];
  const g = Game.deserialize(JSON.stringify(d));
  const at = g.dockedAt;
  const open = ['funchal', 'ugoton', 'mpinda', 'melinde'].includes(at ?? '');
  const lines = g.log.entries.filter((e: any) => /errand for goods is withdrawn/.test(e.text)).length;
  check('port quest cancelled with one line (only where one was open)', lines === (open ? 1 : 0), `docked ${at}`);
  check('portQuestsDone dropped', !('portQuestsDone' in JSON.parse(g.serialize())));
}

// 5. pieces: open Meal / Hall / Linguist runs settle neutrally on load.
{
  const d = load('04-mid-audience.json');
  const runs = d.diplomacy.pieces.runs;
  runs.push({ id: 901, pieceId: 'meal', polity: 'malindi', port: 'melinde', seed: 1, started: d.clock?.t ?? 0, state: {} });
  runs.push({ id: 902, pieceId: 'hall', polity: 'calicut', port: 'calicut', seed: 2, started: 0, state: {} });
  runs.push({ id: 903, pieceId: 'linguist', polity: 'kongo', port: 'mpinda', seed: 3, started: 0, state: {} });
  const nBefore = d.diplomacy.marks.marks.length;
  const g = Game.deserialize(JSON.stringify(d));
  const settled = g.diplomacy.pieces.runs.filter((r) => ['meal', 'hall', 'linguist'].includes(r.pieceId));
  check('folded pieces settled', settled.length === 3 && settled.every((r) => r.outcome?.grade === 'half'));
  check('settled neutrally: no marks written', g.diplomacy.marks.marks.length === nBefore);
  const g2 = Game.deserialize(g.serialize());
  check('and survives another save', g2.diplomacy.pieces.runs.filter((r) => r.outcome && ['meal', 'hall', 'linguist'].includes(r.pieceId)).length === 3);
}

process.exit(fails ? 1 : 0);
