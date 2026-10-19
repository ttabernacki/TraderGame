/**
 * C1: the monthly world tick and prosperity.
 *   npx esbuild scripts/tick.ts --bundle --platform=node --format=cjs --outfile=/tmp/tick.cjs && node /tmp/tick.cjs
 */
import { readFileSync } from 'node:fs';
import { Game } from '../src/game/state';
import { Markets } from '../src/economy/market';
import { PORTS, portDef } from '../src/world/ports';
import { MONTH, fundedCivic, portState, prosperityOf, prosperityShock, setLaneModel, tickWorld, tickWorldDue } from '../src/world/tick';
import { worksChoices, worksOutput } from '../src/progression/network';
import { makeHost, type BareHost } from './lib/worldHost';

let fails = 0;
const check = (name: string, ok: boolean, extra = ''): void => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };
const DAY = 86400;

/** A world with some history in it: a player's purchases, a quay, a shock, a House. */
function disturbed(seed: number): BareHost {
  const h = makeHost(seed);
  tickWorld(h, 1);
  h.markets.refresh('lisboa', h.worldT!);
  h.markets.buy('mina', 'ouro', 40);
  h.markets.sell('lisboa', 'pimenta', 300);
  h.markets.sell('funchal', 'acucar', 80);
  fundedCivic(h, 'funchal', 'quay');
  prosperityShock(h, 'calecute', -0.2, 'war');
  portState(h, 'cochim').calls = 2;
  h.trade.shocks.push({ id: 90, key: 'kongo-famine', start: h.worldT!, end: h.worldT! + 150 * DAY, arrive: {} });
  return h;
}
const snap = (h: BareHost): string => JSON.stringify({ w: h.worldT, p: h.ports, m: h.markets.serialize(), t: h.trade });

// Determinism: the same seed gives the same world.
{
  const a = disturbed(7), b = disturbed(7);
  tickWorld(a, 30); tickWorld(b, 30);
  check('deterministic given the seed', snap(a) === snap(b));
  const c = disturbed(8); tickWorld(c, 30);
  check('and a different seed is a different world', snap(a) !== snap(c));
}

// Catch-up: twelve single months are one twelve-month call.
{
  const a = disturbed(11), b = disturbed(11);
  for (let i = 0; i < 12; i++) tickWorld(a, 1);
  tickWorld(b, 12);
  check('12 x 1 month == one 12-month call', snap(a) === snap(b));
  const c = disturbed(11);
  const n = Math.floor((c.worldT! + 12 * MONTH + 9 * DAY - c.worldT!) / MONTH);
  tickWorldDue(c, c.worldT! + 12 * MONTH + 9 * DAY);
  check('tickWorldDue runs the whole months only', n === 12 && c.worldT === b.worldT);
  tickWorldDue(c, c.worldT! + 20 * DAY);
  check('and nothing before the month is up', c.worldT === b.worldT);
  const d = makeHost(11); d.worldT = d.t0 - 400 * MONTH;
  tickWorldDue(d, d.t0);
  check('a gap past the cap is run for the cap only', d.worldT === d.t0, String((d.t0 - d.worldT!) / MONTH));
}

// Market recovery is the same whether it is applied at once or month by month.
{
  const base = new Markets(1);
  const lump = new Markets(1), steps = new Markets(1);
  const t = 400 * DAY;
  for (const m of [base, lump, steps]) { m.refresh('mina', t); }
  for (const m of [lump, steps]) { m.buy('mina', 'ouro', 40); m.buy('mina', 'marfim', 20); }
  lump.refresh('mina', t + 60 * DAY);
  for (let i = 1; i <= 2; i++) steps.refresh('mina', t + 30 * i * DAY);
  const same = ['ouro', 'marfim', 'malagueta'].every((g) => Math.abs(lump.supply('mina', g).stock - steps.supply('mina', g).stock) < 1e-6);
  check('60 days recovery, lump vs two months', same, `${lump.supply('mina', 'ouro').stock.toFixed(2)} vs ${steps.supply('mina', 'ouro').stock.toFixed(2)} of ${base.supply('mina', 'ouro').stock.toFixed(2)}`);
  lump.refresh('mina', t + 90 * DAY); steps.refresh('mina', t + 90 * DAY);
  check('and at 90 days both are back at baseline', lump.supply('mina', 'ouro').stock === base.supply('mina', 'ouro').stock && steps.supply('mina', 'ouro').stock === base.supply('mina', 'ouro').stock);
  // Today's one-lump behaviour: 30 days recovers a third of the gap.
  const one = new Markets(1); one.refresh('mina', t); const full = one.supply('mina', 'ouro').stock;
  one.buy('mina', 'ouro', 3); one.refresh('mina', t + 30 * DAY);
  check('30 days recovers a third of the gap, as before', Math.abs(one.supply('mina', 'ouro').stock - (full - 2)) < 1e-6, one.supply('mina', 'ouro').stock.toFixed(2));
}

// Prosperity is what the markets read: P = 1 is today, higher holds and takes more.
{
  const plain = new Markets(1);
  const rich = new Markets(1), poor = new Markets(1);
  rich.prosperityOf = () => 1.4; poor.prosperityOf = () => 0.6;
  const t = 400 * DAY;
  for (const m of [plain, rich, poor]) m.refresh('cochim', t);
  const L = (m: Markets) => m.listings('cochim', t, 0, 0);
  const pick = (m: Markets, g: string) => L(m).find((l) => l.goodId === g)!;
  const one1 = new Markets(1); one1.prosperityOf = () => 1; one1.refresh('cochim', t);
  check('P = 1 is the unmodified market', JSON.stringify(L(one1)) === JSON.stringify(L(plain)));
  check('a thriving port holds more', pick(rich, 'pimenta').stock > pick(plain, 'pimenta').stock, `${pick(rich, 'pimenta').stock} vs ${pick(plain, 'pimenta').stock}`);
  check('a struggling port holds less', pick(poor, 'pimenta').stock < pick(plain, 'pimenta').stock, `${pick(poor, 'pimenta').stock}`);
  const want = L(plain).find((l) => l.wanted && !l.local)!;
  check('and takes more of what it wants', pick(rich, want.goodId).appetite >= want.appetite && pick(poor, want.goodId).appetite <= want.appetite);
}

// A House's Works turn out more in a thriving town and with a better man.
{
  const g = Game.deserialize(readFileSync('fixtures/saves/06-line-and-house.json', 'utf8'));
  const house = g.feitorias[0];
  if (house) house.make = worksChoices(portDef(house.portId))[0];
  if (house) {
    const base = worksOutput(house, 1);
    const rich = worksOutput(house, 1.4), poor = worksOutput(house, 0.6);
    check('Works yield rises with prosperity', rich > base && base > poor, `${poor.toFixed(1)} / ${base.toFixed(1)} / ${rich.toFixed(1)}`);
    const keep = house.ability;
    house.ability = 0.9; const good = worksOutput(house, 1); house.ability = 0.1; const bad = worksOutput(house, 1); house.ability = keep;
    check('and with the factor', good > bad, `${bad.toFixed(1)} / ${good.toFixed(1)}`);
  } else check('fixture has a House', false);
}

// The lane stub is replaceable, and traffic above baseline lifts a port.
{
  const h = makeHost(5);
  tickWorld(h, 6);
  const before = prosperityOf(h, 'ormuz');
  setLaneModel(() => ({ traffic: { ormuz: 1.3 } }));
  tickWorld(h, 6);
  setLaneModel(null);
  check('a lane model reporting busy traffic lifts the port', prosperityOf(h, 'ormuz') > before + 0.04, `${before.toFixed(2)} -> ${prosperityOf(h, 'ormuz').toFixed(2)}`);
}

// Saves: prosperity round trips, an old save loads at 1, the game ticks itself.
{
  const d = JSON.parse(readFileSync('fixtures/saves/03-docked-cargo.json', 'utf8'));
  check('fixture is a save from before prosperity', d.ports === undefined);
  const g = Game.deserialize(JSON.stringify(d));
  check('old save: every port at 1', PORTS.every((p) => prosperityOf(g, p.id) === 1) && g.worldT === g.clock.t);
  check('old save: markets read P = 1', g.markets.prosperityOf('lisboa') === 1);
  g.ports['mina'] = { prosperity: 1.37, quay: 2, band: 'thriving', cause: 'quay' };
  g.markets.prosperityOf('mina');
  const g2 = Game.deserialize(g.serialize());
  check('prosperity round trips', g2.ports['mina']?.prosperity === 1.37 && g2.ports['mina'].quay === 2 && g2.worldT === g.worldT);
  check('and the markets read it', g2.markets.prosperityOf('mina') === 1.37);
  const t0 = g2.worldT!;
  g2.waitDays(65);
  check('the game ticks the world as time passes', g2.worldT! >= t0 + 2 * MONTH && g2.worldT! <= g2.clock.t, `${((g2.worldT! - t0) / MONTH).toFixed(1)} months`);
  const g3 = Game.deserialize(g2.serialize());
  check('and a save after it loads the same', g3.worldT === g2.worldT && JSON.stringify(g3.ports) === JSON.stringify(g2.ports));
  g3.prosperityShock('mina', -0.2, 'blockade');
  check('Game.prosperityShock is the Powers hook', g3.ports['mina'].prosperity < g2.ports['mina'].prosperity);
}

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
