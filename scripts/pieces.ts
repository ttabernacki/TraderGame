/**
 * Checks for the set-piece frame. A stub piece writes a mark, a later audience
 * reads it back, and the whole thing survives a save.
 * Run: npx esbuild scripts/pieces.ts --bundle --platform=node --format=cjs --outfile=/tmp/pieces.cjs && node /tmp/pieces.cjs
 */
import { Game } from '../src/game/state';
import { startPiece, stepPiece, runView, offered, tickPieces } from '../src/diplomacy/table';
import { echoFor, hasMark } from '../src/diplomacy/marks';
import { knows } from '../src/diplomacy/book';

let fails = 0;
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`);
  if (!ok) fails++;
}

const g = new Game(7);
const pol = 'malindi';
check('bow is offered', offered(g, pol).some((p) => p.id === 'bow'));
const run = startPiece(g, 'bow', pol, 'melinde')!;
check('run started', !!run && g.diplomacy.pieces.runs.length === 1);
const v = runView(g, run)!;
check('view has choices', v.choices.length === 3);
const trustBefore = g.polityState(pol).trust;
const out = stepPiece(g, run, 'ask');
check('outcome returned', !!out && out.grade === 'win');
check('mark written', hasMark(g.diplomacy.marks, pol, 'greeted', g.clock.t));
check('book entry learned', knows(g.diplomacy.book, pol, 'greeting'));
check('trust rose', g.polityState(pol).trust > trustBefore);
check('echo readable', (echoFor(g.diplomacy.marks, pol, g.clock.t) ?? '').includes('asked'));
check('finished run not stepped again', stepPiece(g, run, 'bow') === null);

const g2 = Game.deserialize(g.serialize());
check('save keeps mark', hasMark(g2.diplomacy.marks, pol, 'greeted', g2.clock.t));
check('save keeps book', knows(g2.diplomacy.book, pol, 'greeting'));
check('save keeps run outcome', g2.diplomacy.pieces.runs[0]?.outcome?.grade === 'win');

// Mid-piece save: the open run steps to the same end after a reload.
const r2 = startPiece(g2, 'bow', 'kilwa', 'quiloa')!;
const g3 = Game.deserialize(g2.serialize());
const open = g3.diplomacy.pieces.runs.find((r) => r.id === r2.id)!;
const o3 = stepPiece(g3, open, 'stand');
check('open run survives a save', !!o3 && o3.grade === 'fail');

// An old career, with no marks, book or runs, still loads.
const old = JSON.parse(g.serialize());
delete old.diplomacy.marks; delete old.diplomacy.book; delete old.diplomacy.pieces;
const g4 = Game.deserialize(JSON.stringify(old));
check('old save loads', g4.diplomacy.marks.marks.length === 0 && g4.diplomacy.pieces.runs.length === 0);

// The envoy aboard: four beats over the passage, answered, then Lisbon.
{
  const e = new Game(11);
  e.diplomacy.agreements.push({ id: 99, polity: 'malindi', kind: 'envoy', text: 'envoy', made: e.clock.t, due: e.clock.t + 365 * 86400, status: 'open' });
  const run = startPiece(e, 'envoy', 'malindi', 'melinde')!;
  let scenes = 0;
  for (let i = 0; i < 6; i++) {
    tickPieces(e, 13);
    const ev = e.pendingEvent;
    if (ev && ev.choices) { scenes++; ev.choices[0].resolve(e); e.pendingEvent = null; }
  }
  check('envoy gave four scenes, one at a time', scenes === 4, `(${scenes})`);
  check('no scene while one is unanswered', (() => {
    const e2 = new Game(12);
    e2.diplomacy.agreements.push({ id: 98, polity: 'malindi', kind: 'envoy', text: 'envoy', made: e2.clock.t, due: e2.clock.t + 365 * 86400, status: 'open' });
    startPiece(e2, 'envoy', 'malindi', 'melinde');
    tickPieces(e2, 13); const first = e2.pendingEvent; e2.pendingEvent = null;
    tickPieces(e2, 13);
    return !!first && !e2.pendingEvent;
  })());
  e.diplomacy.agreements[0].status = 'kept';
  tickPieces(e, 1);
  check('envoy resolves at Lisbon with a mark', run.outcome?.grade === 'win' && hasMark(e.diplomacy.marks, 'malindi', 'envoy', e.clock.t), JSON.stringify(run.outcome?.grade));
  const e3 = Game.deserialize(e.serialize());
  check('envoy outcome survives a save', e3.diplomacy.pieces.runs.some((r) => r.pieceId === 'envoy' && r.outcome));
}

process.exit(fails ? 1 : 0);
