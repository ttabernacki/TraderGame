/**
 * The Emperor's orders, end to end. CAMPAIGN=xiyang npx esbuild scripts/xiyangImperial.ts --bundle --platform=node --format=cjs --outfile=/tmp/xi.cjs && CAMPAIGN=xiyang node /tmp/xi.cjs
 */
import { Game } from '../src/game/state';
import { VOYAGES, evaluateImperial, imperialArrival, ordersDone, reportVoyage, voyageOf } from '../src/campaigns/xiyang/imperial';
import { POLITY_BY_ID } from '../src/diplomacy/polities';

let bad = 0;
const check = (name: string, ok: boolean, extra = ''): void => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) bad++; };

const g = new Game(8, 'xiyang');
const s = g.imperial!;
check('the first voyage is under orders at the start', s.voyage === 1 && !!voyageOf(s));
check('nothing is done at the start', !ordersDone(s) && Object.keys(s.done).length === 0);
// Courts that have taken the calendar: trust, and leave to trade at the seat.
for (const o of voyageOf(s)!.objectives.filter((x) => x.kind === 'accept')) {
  const pol = POLITY_BY_ID.get(o.target);
  check(`${o.target} is a court the orders can name`, !!pol);
  if (!pol) continue;
  g.polityState(pol.id).trust = 0.3;
  for (const p of pol.ports) g.relationsFor(p).mayTrade = true;
}
evaluateImperial(g);
check('the courts that accept are written down', voyageOf(s)!.objectives.filter((o) => o.kind === 'accept').every((o) => s.done[o.id]));
{
  const accepted = voyageOf(s)!.objectives.filter((o) => o.kind === 'accept').length;
  const envoys = g.diplomacy.agreements.filter((a) => a.kind === 'envoy' && a.status === 'open');
  check('each court that accepts sends an envoy aboard', envoys.length === accepted, `(${envoys.length} of ${accepted})`);
  check('and a piece is carrying each one', g.diplomacy.pieces.runs.filter((r) => r.pieceId === 'envoy' && !r.outcome).length === accepted);
  const stand = g.crown.standing;
  g.dockedAt = 'changle';
  g.checkAgreements(null);
  check('at Nanjing\u2019s port the envoys are delivered', g.diplomacy.agreements.filter((a) => a.kind === 'envoy' && a.status === 'kept').length === accepted && g.crown.standing > stand);
  g.dockedAt = null;
}
check('the report waits on the pirate', !ordersDone(s) && reportVoyage(g) === null);
imperialArrival(g, 'palembang');
check('Palembang puts the headman’s warning to the captain', g.pendingEvent?.id === 'imperial:chen_zuyi');
g.pendingEvent!.choices![0].resolve(g);
g.pendingEvent = null;
check('the pirate is dealt with', !!s.done.chen_zuyi && ordersDone(s));
const gold0 = g.crown.gold, stand0 = g.crown.standing;
const text = reportVoyage(g);
check('reporting pays the captain and closes the voyage', !!text && g.crown.gold > gold0 && g.crown.standing > stand0 && s.completed.includes(1) && s.voyage === 2);
const h = Game.deserialize(g.serialize());
check('the orders survive a save', h.imperial?.completed.includes(1) === true && h.imperial?.voyage === 2);
// All seven voyages, in order: every court the orders name is a court of this world, every deed has a scene.
{
  const w = new Game(9, 'xiyang');
  const st = w.imperial!;
  const DEED_PORT: Record<string, string> = { chen_zuyi: 'palembang', alakeshvara: 'galle', sekandar: 'pasai', qilin: 'melinde' };
  for (let n = 1; n <= VOYAGES.length; n++) {
    const v = voyageOf(st)!;
    check(`voyage ${n} is the one under orders`, v.n === n);
    for (const o of v.objectives) {
      if (o.kind === 'accept') {
        const pol = POLITY_BY_ID.get(o.target);
        check(`  voyage ${n}: ${o.target} is a court`, !!pol);
        if (!pol) continue;
        w.polityState(pol.id).trust = 0.3;
        for (const p of pol.ports) w.relationsFor(p).mayTrade = true;
      } else {
        const port = DEED_PORT[o.target];
        imperialArrival(w, port);
        const ev = w.pendingEvent;
        check(`  voyage ${n}: the deed ${o.target} is put to the captain at ${port}`, !!ev && ev.id === `imperial:${o.target}`);
        ev?.choices?.[0].resolve(w);
        w.pendingEvent = null;
      }
    }
    evaluateImperial(w);
    check(`  voyage ${n}: the orders are done`, ordersDone(st));
    check(`  voyage ${n}: the report is taken`, !!reportVoyage(w));
  }
  check('after the seventh the orders run out', st.voyage === 0 && st.completed.length === VOYAGES.length);
}
process.exit(bad ? 1 : 0);
