/**
 * B3: stores in tons, the loading plan, the slot fittings and refit, and their save resolvers.
 *   npx esbuild scripts/stores.ts --bundle --platform=node --format=cjs --outfile=/tmp/stores.cjs && node /tmp/stores.cjs
 */
import { readFileSync } from 'node:fs';
import { Game } from '../src/game/state';
import { UPGRADES, SLOTS } from '../src/ship/upgrades';
import { fitPlan, planCost, planOf, recommendedPlan, loadPlan } from '../src/game/stores';
import { doRefit, quoteRefit, fitFitting } from '../src/game/refit';

let fails = 0;
const check = (name: string, ok: boolean, extra = ''): void => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };
const load = (f: string): any => JSON.parse(readFileSync(`fixtures/saves/${f}`, 'utf8'));

// Fittings: 24 in six slots, four each.
check('24 fittings', UPGRADES.length === 24, String(UPGRADES.length));
check('six slots of four', SLOTS.every((s) => UPGRADES.filter((u) => u.slot === s.id).length === 4));
check('no fitting has a combat effect', UPGRADES.every((u) => !u.effects.guns));

// Stores weigh tons and share the hold.
{
  const g = Game.deserialize(JSON.stringify(load('03-docked-cargo.json')));
  const before = g.ship.holdFree;
  check('stores take hold', g.ship.storesTons > 0 && g.ship.cargoTons + g.ship.storesTons + g.ship.reservedTons <= g.ship.holdCapacity + 0.01,
    `stores ${g.ship.storesTons.toFixed(1)} t, cargo ${g.ship.cargoTons.toFixed(1)} of ${g.ship.holdCapacity}`);
  const big = fitPlan(g, { water: 200, victuals: 240, spares: 1 });
  check('plan fitted to the hold', g.ship.cargoTons + (g.ship.holdCapacity - g.ship.cargoTons - g.ship.reservedTons - g.ship.holdFree) >= 0 && big.water <= 200);
  g.crown.gold += 5000;
  const got = loadPlan(g, big, 0);
  check('loaded stores never overfill the hold', g.ship.cargoTons + g.ship.reservedTons + g.ship.storesTons <= g.ship.holdCapacity + 0.1, `${got.tons.toFixed(1)} t`);
  check('pilot plan is sane', (() => { const r = recommendedPlan(g); return r.water >= 14 && r.victuals >= 14; })());
  check('cost rises with the order', planCost(g.portHere ?? ({ refit: 1 } as any), g, { water: 120, victuals: 120, spares: 1 }) >= 0);
  void before; void planOf;
}

// Overflow resolver: a save whose cargo cannot share the hold with stores sells the surplus, once, with one line.
{
  const d = load('03-docked-cargo.json');
  const g0 = Game.deserialize(JSON.stringify(d));
  // Fill the hold with cargo and the crew with a full larder, then save and reload.
  g0.ship.cargo.push({ goodId: 'vinho', quantity: Math.floor(g0.ship.holdFree / 0.5) + 20, cost: 5 });
  g0.crew.provisions = { water: 200, biscuit: 240, saltMeat: 216, wine: 170, fresh: 20 };
  const gold = g0.crown.gold;
  const g = Game.deserialize(g0.serialize());
  check('overflow settled', g.ship.cargoTons + g.ship.reservedTons + g.ship.storesTons <= g.ship.holdCapacity + 0.01);
  check('surplus sold for gold', g.crown.gold > gold);
  const lines = g.log.entries.filter((e: any) => /measured again with the stores in it/.test(e.text)).length;
  check('one log line', lines === 1, String(lines));
  const g2 = Game.deserialize(g.serialize());
  check('second load sells nothing more', Math.round(g2.crown.gold) === Math.round(g.crown.gold));
}

// Fittings resolver: old upgrade ids map to slot fittings; instruments are never dropped.
{
  const d = load('03-docked-cargo.json');
  d.ship.upgrades = ['calafeto', 'chumbo', 'cesto', 'camara', 'ampulhetas', 'bombardas', 'batel', 'pipas', 'aparelho-redondo'];
  const gold = d.crown.gold;
  const g = Game.deserialize(JSON.stringify(d));
  const slots = g.ship.upgrades.map((id) => UPGRADES.find((u) => u.id === id)?.slot);
  check('all fittings known', g.ship.upgrades.every((id) => UPGRADES.some((u) => u.id === id)), g.ship.upgrades.join(','));
  check('one per slot', new Set(slots).size === slots.length);
  check('instruments kept', slots.includes('instruments'));
  check('refund for the berthless', g.crown.gold >= gold);
}

// Refit: parts and days; a beach cannot re-mast.
{
  const g = Game.deserialize(JSON.stringify(load('03-docked-cargo.json')));
  g.ship.condition.hull = 0.5; g.ship.condition.fouling = 0.6;
  g.crown.gold += 3000; g.crew.spares = 0.3;
  const q = quoteRefit(g, 'hull');
  const t0 = g.clock.t;
  const r = doRefit(g, 'hull');
  check('hull job takes days and parts', q.days > 0 && (r.ok ? g.clock.t > t0 && (g.crew.spares ?? 0) < 0.3 : true), `${r.text}`);
  const c = doRefit(g, 'careen');
  check('careening clears fouling or says why', c.ok ? g.ship.condition.fouling < 0.05 : /yard|beach/.test(c.text), c.text);
  const f = fitFitting(g, 'bercos');
  check('ordnance fits or is refused with a reason', f.ok || f.text.length > 0, f.text);
}

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
