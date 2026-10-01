import { NM, clamp, haversine } from '../core/math';
import { GOOD_BY_ID, type Good } from '../economy/goods';
import { Markets } from '../economy/market';
import { HULL_BY_ID } from '../ship/hull';
import { PORTS, anchorageOf, portDef, type PortDef } from '../world/ports';
import type { Game } from '../game/state';
import { hullAllowed } from './chronicle';
import { postLetter, transitDays } from './livingFactory';

/**
 * Businesses, and the ships that carry what they make.
 *
 * A captain with a purse and nothing to put it in is a captain who can only
 * spend it on the next ship. This gives the money somewhere to go: a mill, a
 * vineyard, a saltworks, a tannery, bought in a town that makes the thing
 * well, run by a manager of the town's own, and turning out goods every month
 * whether or not the owner is within a thousand miles.
 *
 * What it makes sits in the warehouse. A trading vessel hired on contract
 * carries it to a market that wants it and brings the money back — a caravel on
 * a coasting run, a nau on the long road — and the difference between what it
 * cost to make and what it fetched there, less the freight, the crew's wages,
 * the town's commission and the sea's share, is the owner's. The money reaches
 * him through the Casa's post, like the factories', at the next Portuguese
 * port he makes.
 *
 * It is never free: a business costs a great deal to buy, eats its wages every
 * month, can burn or blight, and is only as good as the road its cargo takes.
 */

export interface Trader {
  hullId: string;
  name: string;
  toPort: string;
  phase: 'idle' | 'out' | 'back';
  /** When the ship reaches the end of the leg she is on. */
  arrives: number;
  load: number;
  /** What the load fetched, held until the ship is home. */
  proceeds: number;
  trips: number;
  earned: number;
  lost: number;
  /** What the last completed voyage netted, freight paid. */
  lastNet?: number;
  /** Why she is lying idle, if she is. */
  idleNote?: string;
}

export interface Enterprise {
  id: number;
  portId: string;
  goodId: string;
  level: number;
  founded: number;
  /** Units in the warehouse. */
  stock: number;
  /** The business's own account, which pays the wages and the freight. */
  cash: number;
  /** What the owner has put in, for the sale and the ledger. */
  paidIn: number;
  /** Months of reduced work after a fire or a blight. */
  ailing: number;
  /** Last month that was run. */
  ticked: number;
  trader?: Trader;
  earned: number;
  lost?: boolean;
  lostWhy?: string;
}

const SIZE = { anchorage: 0.35, village: 0.5, town: 0.8, city: 1, emporium: 1.3 } as const;
/** Output multiplier and cost multiplier for each level. */
const LEVELS = [
  { out: 1, cost: 1, name: 'A small works' },
  { out: 1.7, cost: 1.9, name: 'A going concern' },
  { out: 2.6, cost: 3.4, name: 'The great house of the place' },
];
const MONTH = 30 * 86400;
const MAX_CATCH_UP = 36;
const MAX_PER_PORT = 3;

/** What each good's business is called in its own place. */
const KINDS: Record<string, string> = {
  acucar: 'Sugar mill', vinho: 'Vineyard', sal: 'Saltworks', trigo: 'Wheat farm', azeite: 'Olive press',
  la: 'Wool house', linho: 'Linen works', ferramenta: 'Smithy', couros: 'Tannery', cera: 'Beeswax works',
  goma: 'Gum gatherers', malagueta: 'Grain-of-paradise gardens', pimenta: 'Pepper gardens',
  canela: 'Cinnamon grove', gengibre: 'Ginger gardens', ouro: 'Gold washings', marfim: 'Ivory station',
  cola: 'Kola grove', panos: 'Weavers’ hall', calico: 'Calico looms', seda: 'Silk looms',
  incenso: 'Incense groves', anil: 'Indigo vats', cravo: 'Clove plantation', noz: 'Nutmeg grove',
  cobre: 'Copper works', cavalos: 'Horse stud', coral: 'Coral fishery', perolas: 'Pearl fishery',
};

export function kindOf(goodId: string): string {
  return KINDS[goodId] ?? `${GOOD_BY_ID.get(goodId)?.english ?? goodId} works`;
}

/** What a business's yearly turnover would be, in Lisbon-value cruzados a month. */
export function monthlyValue(def: PortDef, goodId: string): number {
  const abundance = def.produces[goodId] ?? 0;
  return 160 * SIZE[def.size] * (0.4 + def.wealth) * abundance;
}

export function outputUnits(e: Enterprise): number {
  const def = portDef(e.portId);
  const g = GOOD_BY_ID.get(e.goodId);
  if (!g) return 0;
  const lvl = LEVELS[e.level - 1] ?? LEVELS[0];
  return (monthlyValue(def, e.goodId) * lvl.out / (0.9 * g.lisbon)) * (e.ailing > 0 ? 0.4 : 1);
}

/** Wages and upkeep, a month. */
export function upkeepOf(e: Enterprise): number {
  const lvl = LEVELS[e.level - 1] ?? LEVELS[0];
  return Math.round(0.12 * monthlyValue(portDef(e.portId), e.goodId) * lvl.out);
}

export function warehouseCap(e: Enterprise): number {
  return Math.max(10, Math.round(outputUnits(e) * 5 * (e.ailing > 0 ? 2.5 : 1)));
}

export function priceOf(g: Game, def: PortDef, goodId: string, level = 1): number {
  const count = g.enterprises.filter((x) => x.portId === def.id && !x.lost).length;
  const lvl = LEVELS[level - 1] ?? LEVELS[0];
  const v = monthlyValue(def, goodId) * lvl.out;
  return Math.round(30 * v * (1 + 0.2 * count) * (level === 1 ? 1 : 1)) + 3 * Math.round(0.12 * v);
}

/** The goods this town could be put to making, dearest first, that you do not already make here. */
export function forSale(g: Game, def: PortDef): string[] {
  if (g.enterprises.filter((x) => x.portId === def.id && !x.lost).length >= MAX_PER_PORT) return [];
  const have = new Set(g.enterprises.filter((x) => x.portId === def.id && !x.lost).map((x) => x.goodId));
  return Object.keys(def.produces)
    .filter((id) => GOOD_BY_ID.has(id) && (def.produces[id] ?? 0) >= 0.4 && !have.has(id))
    .sort((a, b) => monthlyValue(def, b) - monthlyValue(def, a))
    .slice(0, 5);
}

/** How many a man can manage at a distance, by what the Crown has opened to him. */
export function maxBusinesses(g: Game): number {
  return 3 + 2 * g.chronicle.act;
}

export function canFound(g: Game, def: PortDef, goodId: string): string | null {
  const rel = g.relationsFor(def.id);
  if (!rel.mayTrade && def.people !== 'portuguese') return 'You have no leave to trade here, and nobody sells land to a stranger. Seek an audience first.';
  if (rel.regard < -0.4) return 'The town will not sell to you: you are not liked here.';
  if (g.enterprises.filter((x) => x.portId === def.id && !x.lost).length >= MAX_PER_PORT) return 'This place has all the businesses of yours it will bear.';
  if (g.enterprises.filter((x) => !x.lost).length >= maxBusinesses(g)) return `A captain of your standing can keep ${maxBusinesses(g)} businesses going. Sell one, or wait for the Crown to open more.`;
  const cost = priceOf(g, def, goodId, 1);
  if (cost > g.crown.gold + g.creditFree) return `It comes to ${cost} cruzados, and there is not that much.`;
  return null;
}

export function found(g: Game, def: PortDef, goodId: string): string {
  const why = canFound(g, def, goodId);
  if (why) return why;
  const cost = priceOf(g, def, goodId, 1);
  if (g.crown.gold < cost) g.drawCredit(cost);
  g.crown.gold -= cost;
  const e: Enterprise = {
    id: g.nextEnterpriseId++, portId: def.id, goodId, level: 1, founded: g.clock.t, stock: 0,
    cash: 0, paidIn: cost, ailing: 0, ticked: g.clock.t, earned: 0,
  };
  e.cash = 3 * upkeepOf(e);
  g.enterprises.push(e);
  g.crown.standing += 4;
  g.crown.lifetimeStanding += 4;
  g.logEvent('trade', `Bought a ${kindOf(goodId).toLowerCase()} at ${def.name} for ${cost} cruzados, with a manager from the town and three months’ wages in the chest.`, true);
  return `${kindOf(goodId)} bought at ${def.name}. It will turn out ${Math.round(outputUnits(e))} ${GOOD_BY_ID.get(goodId)!.unit}s a month.`;
}

export function upgradeCost(g: Game, e: Enterprise): number | null {
  if (e.level >= LEVELS.length) return null;
  const def = portDef(e.portId);
  const cur = priceOf(g, def, e.goodId, e.level) - 3 * Math.round(0.12 * monthlyValue(def, e.goodId) * LEVELS[e.level - 1].out);
  const next = Math.round(30 * monthlyValue(def, e.goodId) * LEVELS[e.level].out);
  return Math.max(150, Math.round((next - cur * 0.6) * 0.8));
}

export function upgrade(g: Game, e: Enterprise): string {
  const cost = upgradeCost(g, e);
  if (cost === null) return 'It is as large as the town will bear.';
  if (cost > g.crown.gold + g.creditFree) return `It comes to ${cost} cruzados, and there is not that much.`;
  if (g.crown.gold < cost) g.drawCredit(cost);
  g.crown.gold -= cost;
  e.level++;
  e.paidIn += cost;
  g.logEvent('trade', `Enlarged the ${kindOf(e.goodId).toLowerCase()} at ${portName(e.portId)} for ${cost} cruzados.`, true);
  return `${LEVELS[e.level - 1].name}: ${Math.round(outputUnits(e))} ${GOOD_BY_ID.get(e.goodId)!.unit}s a month.`;
}

export function sell(g: Game, e: Enterprise): string {
  const refund = Math.round(e.paidIn * 0.55 + Math.max(0, e.cash) + e.stock * (GOOD_BY_ID.get(e.goodId)?.lisbon ?? 0) * 0.35);
  g.crown.gold += refund;
  e.lost = true;
  e.lostWhy = 'Sold.';
  g.logEvent('trade', `Sold the ${kindOf(e.goodId).toLowerCase()} at ${portName(e.portId)} for ${refund} cruzados.`, true);
  return `Sold for ${refund} cruzados.`;
}

const portName = (id: string): string => PORTS.find((p) => p.id === id)?.name ?? id;

// ---------------------------------------------------------------------------
// Ships

/** The vessels that can be hired, by what the Crown has opened to you. */
export function hireable(g: Game): string[] {
  return ['caravela-latina', 'caravela-redonda', 'nau-pequena', 'nau', 'nau-da-india']
    .filter((id) => hullAllowed(g.chronicle.act, id));
}

const PACE: Record<string, number> = {
  'caravela-latina': 118, 'caravela-redonda': 112, 'nau-pequena': 104, nau: 98, 'nau-da-india': 96,
};

export function legDays(from: string, to: string, hullId: string): number {
  const nm = haversine(anchorageOf(portDef(from)), anchorageOf(portDef(to))) / NM * 1.3;
  return Math.max(2, Math.round(nm / (PACE[hullId] ?? 100) + 2));
}

/** What a trading vessel charges for a round voyage, wages and all. */
export function voyageFee(from: string, to: string, hullId: string): number {
  const h = HULL_BY_ID.get(hullId);
  if (!h) return 0;
  const days = legDays(from, to, hullId) * 2;
  return Math.round(14 + days * Math.sqrt(h.hold) * 0.55);
}

export function loadLimit(e: Enterprise, hullId: string): number {
  const gd = GOOD_BY_ID.get(e.goodId);
  const h = HULL_BY_ID.get(hullId);
  if (!gd || !h) return 0;
  return Math.floor((h.hold * 0.85) / Math.max(gd.bulk, 1e-6));
}

export interface Estimate {
  toPort: string;
  days: number;
  /** What a unit fetches there, after the town's commission. */
  unit: number;
  /** Expected net of one full load, after freight. */
  net: number;
  wanted: boolean;
  load: number;
}

/** What it would pay to send the warehouse to a port, at the prices of today. */
export function estimate(g: Game, e: Enterprise, toPort: string, hullId: string): Estimate | null {
  const gd = GOOD_BY_ID.get(e.goodId);
  if (!gd || toPort === e.portId) return null;
  const rel = g.relationsFor(toPort);
  // A market is as it is today, whether or not anyone has been there to see it.
  g.markets.refresh(toPort, g.clock.t);
  const l = g.markets.listings(toPort, g.clock.t, rel.regard, 0.3, [e.goodId]).find((x) => x.goodId === e.goodId);
  if (!l) return null;
  const load = Math.max(1, Math.min(Math.round(Math.max(e.stock, outputUnits(e) * 2)), loadLimit(e, hullId)));
  const slip = Markets.slippage(load, l.appetite);
  const unit = (l.bid / slip) * 0.94;
  const days = legDays(e.portId, toPort, hullId) * 2;
  const net = Math.round(unit * load - voyageFee(e.portId, toPort, hullId));
  return { toPort, days, unit, net, wanted: l.wanted, load };
}

/** Ports worth sending it to: ports you know, with a market that wants it. */
export function destinationsFor(g: Game, e: Enterprise, hullId: string): Estimate[] {
  const out: Estimate[] = [];
  for (const p of PORTS) {
    if (p.id === e.portId) continue;
    if (!g.visitedPorts.has(p.id) && !p.known) continue;
    const rel = g.relationsFor(p.id);
    if (!rel.mayTrade && p.people !== 'portuguese') continue;
    const est = estimate(g, e, p.id, hullId);
    if (est && est.net > 0) out.push(est);
  }
  return out.sort((a, b) => b.net - a.net).slice(0, 7);
}

const SHIP_NAMES = ['São Brás', 'Santa Clara', 'Boa Ventura', 'São Cristóvão', 'Nossa Senhora do Cabo', 'Espírito Santo', 'São Vicente', 'Garça', 'Bom Jesus', 'Santiago'];

export function hire(g: Game, e: Enterprise, hullId: string, toPort: string): string {
  if (!hireable(g).includes(hullId)) return 'No such vessel is to be had.';
  if (!estimate(g, e, toPort, hullId)) return 'Nobody there will take it.';
  e.trader = {
    hullId, name: SHIP_NAMES[(e.id * 3 + Math.floor(g.clock.t / 86400)) % SHIP_NAMES.length], toPort,
    phase: 'idle', arrives: g.clock.t, load: 0, proceeds: 0, trips: 0, earned: 0, lost: 0,
  };
  g.logEvent('trade', `Hired the ${HULL_BY_ID.get(hullId)!.english.toLowerCase()} ${e.trader.name} to carry the ${kindOf(e.goodId).toLowerCase()}’s goods from ${portName(e.portId)} to ${portName(toPort)}.`, true);
  return `${e.trader.name} is hired to carry ${GOOD_BY_ID.get(e.goodId)!.english.toLowerCase()} to ${portName(toPort)}.`;
}

export function dismiss(_g: Game, e: Enterprise): string {
  if (!e.trader) return 'There is no vessel on contract.';
  const name = e.trader.name;
  if (e.trader.load > 0 && e.trader.phase !== 'idle') return `${name} is at sea with a cargo, and the contract runs until she is home.`;
  e.trader = undefined;
  return `${name} is paid off.`;
}

export function redirect(g: Game, e: Enterprise, toPort: string): string {
  if (!e.trader) return 'There is no vessel on contract.';
  if (!estimate(g, e, toPort, e.trader.hullId)) return 'Nobody there will take it.';
  e.trader.toPort = toPort;
  return `${e.trader.name} is to sail for ${portName(toPort)} next.`;
}

// ---------------------------------------------------------------------------
// The months

function lose(g: Game, e: Enterprise, why: string): void {
  e.lost = true;
  e.lostWhy = why;
  postLetter(g, e.portId, `${portName(e.portId)}: the ${kindOf(e.goodId).toLowerCase()} is gone. ${why}`, 'grave');
  g.logEvent('trade', `The ${kindOf(e.goodId).toLowerCase()} at ${portName(e.portId)} was lost: ${why}`, true);
}

function tickOne(g: Game, e: Enterprise): void {
  const def = portDef(e.portId);
  const gd = GOOD_BY_ID.get(e.goodId) as Good;
  const rel = g.relationsFor(e.portId);
  const name = kindOf(e.goodId).toLowerCase();

  // A town that has been given reason to hate the owner takes what is his.
  if (rel.regard < -0.7) { lose(g, e, 'The town has turned against you and taken the place for itself.'); return; }

  // The month's work.
  e.stock = Math.min(warehouseCap(e), e.stock + outputUnits(e));
  e.cash -= upkeepOf(e);
  if (e.ailing > 0) e.ailing--;

  // What the sea and the seasons do.
  if (g.rng.chance(0.018)) {
    const fire = g.rng.chance(0.5);
    e.stock *= fire ? 0.35 : 0.7;
    e.ailing = fire ? 3 : 2;
    postLetter(g, e.portId, fire
      ? `${def.name}: fire in the ${name}. The warehouse is largely gone; the manager is rebuilding on credit.`
      : `${def.name}: the ${name} has had a bad season, and the manager expects short measure for a couple of months.`, 'warning');
  }

  // The ship.
  const t = e.trader;
  if (t) {
    if (t.phase === 'out' && g.clock.t >= t.arrives) {
      // The cargo is sold where it was sent.
      g.markets.refresh(t.toPort, g.clock.t);
      const l = g.markets.listings(t.toPort, g.clock.t, g.relationsFor(t.toPort).regard, 0.3, [e.goodId]).find((x) => x.goodId === e.goodId);
      const risk = 0.025 + clamp(haversine(anchorageOf(def), anchorageOf(portDef(t.toPort))) / NM / 9000, 0, 0.12);
      if (!l) {
        t.phase = 'back';
        t.arrives = g.clock.t + legDays(e.portId, t.toPort, t.hullId) * 86400;
        postLetter(g, e.portId, `${def.name}: the ${t.name} found no buyer for the ${gd.english.toLowerCase()} at ${portName(t.toPort)} and is bringing it home.`, 'warning');
        e.stock += t.load;
        t.load = 0;
      } else if (g.rng.chance(risk)) {
        t.lost += t.load * gd.lisbon * 0.6;
        postLetter(g, e.portId, `${def.name}: the ${t.name} was lost on the way to ${portName(t.toPort)} with a cargo of ${gd.english.toLowerCase()}. Nothing is to be done about it.`, 'warning');
        t.load = 0;
        t.proceeds = 0;
        t.phase = 'back';
        t.arrives = g.clock.t + legDays(e.portId, t.toPort, t.hullId) * 86400;
      } else {
        const slip = Markets.slippage(t.load, l.appetite);
        t.proceeds = (l.bid / slip) * 0.94 * t.load;
        g.markets.sell(t.toPort, e.goodId, t.load);
        t.phase = 'back';
        t.arrives = g.clock.t + legDays(e.portId, t.toPort, t.hullId) * 86400;
      }
    } else if (t.phase === 'back' && g.clock.t >= t.arrives) {
      // Home: the freight comes out of what the cargo fetched.
      const fee = t.load === 0 && t.proceeds === 0 ? 0 : voyageFee(e.portId, t.toPort, t.hullId);
      const net = t.proceeds - fee;
      e.cash += net;
      e.earned += net;
      t.earned += net;
      t.lastNet = Math.round(net);
      if (t.proceeds > 0) t.trips++;
      t.proceeds = 0;
      t.phase = 'idle';
    }
    if (t.phase === 'idle') {
      // She sails when there is a load worth the freight, and not otherwise.
      const lim = loadLimit(e, t.hullId);
      const minLoad = Math.max(1, Math.min(Math.round(outputUnits(e) * 2), lim));
      const est = estimate(g, e, t.toPort, t.hullId);
      if (e.stock >= minLoad && est && est.net > Math.max(8, upkeepOf(e) * 0.3)) {
        const load = Math.min(Math.floor(e.stock), lim);
        if (load >= 1) {
          e.stock -= load;
          t.load = load;
          t.phase = 'out';
          t.idleNote = undefined;
          t.arrives = g.clock.t + legDays(e.portId, t.toPort, t.hullId) * 86400;
        }
      } else if (e.stock >= minLoad) {
        if (t.idleNote === undefined) {
          postLetter(g, e.portId, `${def.name}: the ${t.name} lies idle. The ${gd.english.toLowerCase()} would not clear the freight at ${portName(t.toPort)} just now; a different port, or waiting a season, would pay better.`, 'warning');
        }
        t.idleNote = `${portName(t.toPort)} is not paying the freight at the moment.`;
      }
    }
  }

  // A business that cannot pay its people stops.
  if (e.cash < -4 * upkeepOf(e)) {
    e.ailing = Math.max(e.ailing, 1);
  }

  // What is over the float goes home on the Casa's ships.
  const float = 250 * e.level;
  if (e.cash > float + 150) {
    const send = Math.floor(e.cash - float);
    e.cash -= send;
    g.remittances.push({ arrives: g.clock.t + transitDays(e.portId) * 86400, amount: Math.round(send * 0.9), from: `${def.name} (${name})` });
  }
}

/** Run every business forward by whatever whole months have passed. */
export function tickEnterprises(g: Game): void {
  if (g.enterprises.length === 0) return;
  for (const e of g.enterprises) {
    if (e.lost) continue;
    let months = 0;
    while (g.clock.t - e.ticked >= MONTH && months < MAX_CATCH_UP) {
      e.ticked += MONTH;
      months++;
      tickOne(g, e);
      if (e.lost) break;
    }
    if (g.clock.t - e.ticked > MONTH * MAX_CATCH_UP) e.ticked = g.clock.t;
  }
}
