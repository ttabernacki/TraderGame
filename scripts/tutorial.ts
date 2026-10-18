// The first hour, walked headlessly: six verbs, each unlocked only by the one before.
// npx esbuild scripts/tutorial.ts --bundle --platform=node --format=cjs --outfile=/tmp/tutorial.cjs && node /tmp/tutorial.cjs
import { Game } from '../src/game/state';
import { migrateTutorial, TUTORIAL } from '../src/game/tutorial';

let fails = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const id = (g: Game) => g.tutorialStep()?.id ?? null;

// --- A: strict order, with every later verb held back until its turn ---------
{
  const g = new Game(1);
  g.mode = 'sailing';
  check(TUTORIAL.length === 6, 'six verbs');
  check(id(g) === 'steer', 'first verb is steer');
  g.seenChart = true; // a later verb done early must not bring its line up early
  g.adjustTrim(2);
  check(id(g) === 'steer', 'later verbs done early do not unlock out of turn');
  g.seenChart = false;
  (g.tutorial.f ??= {}).trim = false;

  g.weighAnchor();
  g.update(0.25);
  check(id(g) === 'steer', 'under way is not steering');
  g.alterCourse(10);
  check(id(g) === 'trim', 'helm -> trim');
  g.adjustTrim(2);
  check(id(g) === 'wind', 'trim -> read the wind');
  g.seenChart = true;
  check(id(g) === 'sight', 'chart -> sight');
  g.nav.applyLatitude(g.nav.estimated.lat, 0.1, 'North Star', 'the pole star', g.clock.t);
  check(id(g) === 'port', 'sight -> port');

  g.helmOrder = null; g.autoTrim = true;
  g.setDestinationPort('funchal');
  g.clock.scaleIndex = 8;
  let n = 0;
  while (!g.dockedAt && n++ < 4000 && g.mode !== 'gameover') {
    if (g.pendingEvent) { g.resolveEvent(1); g.clock.scaleIndex = 8; }
    g.update(0.25);
    id(g); g.clock.scaleIndex = 8; // the bell may have stopped the clock; the player winds it on again
    if (g.approachablePorts().some((p) => p.def.id === 'funchal')) { g.letGoAnchor(); break; }
  }
  check(g.dockedAt === 'funchal', 'reached Funchal');
  check(id(g) === 'trade', 'port -> trade');
  const l = g.marketHere().find((x) => x.ask > 0 && x.stock > 0);
  const r = l ? g.tradeBuy(l.goodId, 1) : { ok: false };
  check(!!r.ok, 'bought something');
  check(id(g) === null && g.tutorial.finished, 'six done: pilot stops');
}

// --- B: old saves ----------------------------------------------------------------
{
  const f = migrateTutorial({ on: true, at: 14, finished: true });
  check(f.finished && !f.on, 'old finished stays finished');
  const u = migrateTutorial(undefined);
  check(u.finished, 'missing state is finished');
  for (let at = 0; at <= 14; at++) {
    const m = migrateTutorial({ on: true, at, finished: false });
    if (m.finished || m.at < 0 || m.at > 5) check(false, `old step ${at} maps to 0..5 (got ${m.at})`);
  }
  check(migrateTutorial({ on: true, at: 0, finished: false }).at === 0, 'old step 0 -> verb 0');
  check(migrateTutorial({ on: true, at: 14, finished: false }).at === 5, 'old last step -> last verb');
  const g = new Game(2);
  g.mode = 'sailing';
  g.alterCourse(5);
  const back = Game.deserialize(g.serialize());
  check(!!back.tutorial.f?.helm && back.tutorial.at === g.tutorial.at, 'new-format save round-trips');
  // An old save: tutorial object in the 13-step shape, no flags, no legStart.
  const old = JSON.parse(g.serialize());
  old.tutorial = { on: true, at: 8, finished: false };
  delete old.legStart;
  const o = Game.deserialize(JSON.stringify(old));
  check(!o.tutorial.finished && o.tutorial.at >= 0 && o.tutorial.at <= 5 && o.legStart === null, 'old 13-step save loads and maps');
}

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
