import { clamp } from '../core/math';
import { GOOD_BY_ID } from '../economy/goods';
import { Markets } from '../economy/market';
import { CASA_SHARE, MONOPOLY } from '../economy/trade';
import { HULL_BY_ID } from '../ship/hull';
import { PORTS, anchorageOf, portDef, type PortDef } from '../world/ports';
import type { SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';
import { hullAllowed } from './chronicle';
import type { Feitoria } from './feitoria';
import { roadMiles } from './road';
import { polityOfPort } from '../diplomacy/polities';
import { MAX_CIVIC_LEVEL, civicLevel, fundedCivic, type Civic } from '../world/tick';

/**
 * Houses and Lines.
 *
 * Everything the captain owns away from his ship is one of two things. A House
 * is a place on the road where he has a man, a store and a footing: it buys the
 * town's goods when they are cheap, holds them, and may have Works that turn
 * the town's goods into something dearer. A Line is a ship he keeps running
 * from one of his Houses to a market and back: she takes whatever the far end
 * will pay best for, sells it there into the real market, and comes home with
 * whatever pays best the other way. Houses never move anything; Lines never
 * own anything. Between them, and the captain's own ship, that is the economy.
 *
 * (A House is stored as a `Feitoria`, which is what one was called before.)
 */

// ---------------------------------------------------------------------------
// Houses

export type Posture = 'buy' | 'stores' | 'work';

export const POSTURES: { id: Posture; name: string; blurb: string }[] = [
  { id: 'buy', name: 'Buy and hold', blurb: 'The factor buys the town’s goods when they are cheap and holds them for your ship or a Line.' },
  { id: 'stores', name: 'Keep stores', blurb: 'He keeps victuals and water against your coming: your ship provisions here at half the price.' },
  { id: 'work', name: 'Work', blurb: 'Everything goes into the Works, which turn out twice as much. Nothing else is bought.' },
];

export const postureOf = (f: Feitoria): Posture => f.posture ?? 'buy';

/** One meter for how the House stands in its town: 0 lost, 1 part of the place. */
export function footingOf(f: Feitoria): number {
  return clamp(0.55 * (1 - f.trouble) + 0.45 * f.regard, 0, 1);
}

export function footingWord(v: number): string {
  if (v >= 0.75) return 'Firm';
  if (v >= 0.55) return 'Steady';
  if (v >= 0.4) return 'Uneasy';
  if (v >= 0.25) return 'Slipping';
  return 'About to be lost';
}

const WORKS_NAMES: Record<string, string> = {
  acucar: 'Sugar mill', vinho: 'Wine press', sal: 'Saltpans', trigo: 'Mill', azeite: 'Olive press',
  la: 'Wool house', linho: 'Linen works', ferramenta: 'Smithy', couros: 'Tannery', cera: 'Wax works',
  goma: 'Gum gatherers', malagueta: 'Malagueta gardens', pimenta: 'Pepper sheds', canela: 'Cinnamon peelers',
  gengibre: 'Ginger gardens', ouro: 'Gold washings', marfim: 'Ivory yard', cola: 'Kola groves',
  panos: 'Weavers’ hall', calico: 'Calico looms', seda: 'Silk looms', incenso: 'Incense groves',
  anil: 'Indigo vats', cravo: 'Clove gardens', noz: 'Nutmeg groves', cobre: 'Copper works',
  cavalos: 'Horse stud', coral: 'Coral fishery', perolas: 'Pearl fishery', arroz: 'Rice paddies',
  cardamomo: 'Cardamom gardens', tamaras: 'Date groves',
};

export function worksName(goodId: string): string {
  return WORKS_NAMES[goodId] ?? `${GOOD_BY_ID.get(goodId)?.english ?? goodId} works`;
}

const SIZE = { anchorage: 0.35, village: 0.5, town: 0.8, city: 1, emporium: 1.3 } as const;

/** A town's monthly turnover in one good, at Lisbon value. */
function monthlyValue(def: PortDef, goodId: string, prosperity = 1): number {
  return 160 * SIZE[def.size] * (0.4 + def.wealth * prosperity) * (def.produces[goodId] ?? 0);
}

/** What the Works at a House can be put to making: the town's own goods, dearest first. */
export function worksChoices(def: PortDef): string[] {
  return Object.keys(def.produces)
    .filter((id) => GOOD_BY_ID.has(id) && (def.produces[id] ?? 0) >= 0.4)
    .sort((a, b) => monthlyValue(def, b) - monthlyValue(def, a))
    .slice(0, 4);
}

export function worksCost(def: PortDef, goodId: string, level = 1): number {
  return Math.round(26 * monthlyValue(def, goodId) * [1, 1.6, 2.4][level - 1]);
}

/**
 * How well the man running a House gets the most of it, as a multiplier on yield: an officer
 * of ability 0.5 (the middle) is 1; a good one a fifth better, a poor one a fifth worse.
 */
export function factorQuality(f: Feitoria): number {
  return 0.8 + 0.4 * clamp(f.ability, 0, 1);
}

/**
 * Units a month the Works turn out. `prosperity` is the town's (world/tick): the Works turn
 * out more in a thriving town and less in a struggling one, as well as with a better factor.
 * Costs and wages stay as they were, so the profit moves with both.
 */
export function worksOutput(f: Feitoria, prosperity = 1): number {
  if (!f.make) return 0;
  const def = portDef(f.portId);
  const gd = GOOD_BY_ID.get(f.make);
  if (!gd) return 0;
  const lvl = [1, 1.7, 2.6][(f.makeLevel ?? 1) - 1] ?? 1;
  const posture = postureOf(f) === 'work' ? 2 : 1;
  return (monthlyValue(def, f.make, prosperity) * lvl * posture * factorQuality(f)) / (0.9 * gd.lisbon);
}

/** Wages for the Works, a month. */
export function worksUpkeep(f: Feitoria): number {
  if (!f.make) return 0;
  const lvl = [1, 1.7, 2.6][(f.makeLevel ?? 1) - 1] ?? 1;
  return Math.round(0.14 * monthlyValue(portDef(f.portId), f.make) * lvl * (postureOf(f) === 'work' ? 1.6 : 1));
}

// ---------------------------------------------------------------------------
// A quay or a fort: money put into the town itself (BUILD_PLAN C1)

export const CIVIC: Record<Civic, { name: string; blurb: string; cost: number }> = {
  quay: { name: 'Quay', blurb: 'A stone quay and a crane: ships load faster, more of them call, and the town grows richer for it.', cost: 1 },
  fort: { name: 'Fort', blurb: 'Walls and guns over the anchorage. Nobody blockades a town that can answer, and war does it less harm.', cost: 1.5 },
};

/**
 * What a quay or fort costs: the Works formula (26 x monthly value of the town's best good,
 * at P = 1 so that the price does not move with the fortunes it is meant to improve), dearer
 * each time (x1, 1.6, 2.4), the fort half as dear again.
 */
export function civicCost(def: PortDef, kind: Civic, level: number): number {
  const best = worksChoices(def)[0];
  const value = best ? monthlyValue(def, best) : 160 * SIZE[def.size] * (0.4 + def.wealth) * 0.4;
  return Math.round(26 * value * CIVIC[kind].cost * [1, 1.6, 2.4][Math.min(level, 2)]);
}

/** Pay for a quay or fort at a port the captain is in. Returns what to say. */
export function fundCivic(g: Game, portId: string, kind: Civic): string {
  const def = portDef(portId);
  const level = civicLevel(g, portId, kind);
  if (level >= MAX_CIVIC_LEVEL) return `The ${CIVIC[kind].name.toLowerCase()} at ${def.name} is as much as the town needs.`;
  const cost = civicCost(def, kind, level);
  if (cost > g.crown.gold + g.creditFree) return `It comes to ${cost} cruzados, and there is not that much.`;
  if (g.crown.gold < cost) g.drawCredit(cost);
  g.crown.gold -= cost;
  const gain = fundedCivic(g, portId, kind);
  g.logEvent('trade', `${level === 0 ? 'Paid for' : 'Enlarged'} the ${CIVIC[kind].name.toLowerCase()} at ${def.name}: ${cost} cruzados.`, true);
  return gain > 0.005
    ? `The ${CIVIC[kind].name.toLowerCase()} is paid for. ${def.name} will be the better for it.`
    : `The ${CIVIC[kind].name.toLowerCase()} is paid for, but ${def.name} can hardly be made richer than it is.`;
}

export function buildWorks(g: Game, f: Feitoria, goodId: string): string {
  const def = portDef(f.portId);
  if (f.make && f.make !== goodId) return `The Works here already make ${GOOD_BY_ID.get(f.make)!.english.toLowerCase()}.`;
  const level = f.make ? (f.makeLevel ?? 1) + 1 : 1;
  if (level > 3) return 'The Works are as large as the town will bear.';
  const cost = worksCost(def, goodId, level);
  if (cost > g.crown.gold + g.creditFree) return `It comes to ${cost} cruzados, and there is not that much.`;
  if (g.crown.gold < cost) g.drawCredit(cost);
  g.crown.gold -= cost;
  f.make = goodId;
  f.makeLevel = level;
  g.logEvent('trade', `${level === 1 ? 'Built' : 'Enlarged'} the ${worksName(goodId).toLowerCase()} at the House at ${def.name} for ${cost} cruzados.`, true);
  return `${worksName(goodId)}: ${Math.round(worksOutput(f))} ${GOOD_BY_ID.get(goodId)!.unit}s a month.`;
}

// ---------------------------------------------------------------------------
// Lines

export interface Line {
  id: number;
  name: string;
  hullId: string;
  /** The House she runs from. */
  home: string;
  /** The market she runs to. */
  to: string;
  phase: 'home' | 'out' | 'back';
  /** When she reaches the end of the leg she is on, or next looks at sailing. */
  at: number;
  cargo: { goodId: string; qty: number; cost: number } | null;
  /** What the outward cargo fetched, carried home with her. */
  purse: number;
  voyageText: string;
  trips: number;
  earned: number;
  lastNet?: number;
  nextHull?: string;
  nextTo?: string;
  waiting?: string;
  /** Sent out of season on the captain's word, once. */
  forced?: boolean;
  history: { t: number; net: number }[];
  /** What the outward cargo cost, paid back to whoever laid it out when she is home. */
  outlay?: number;
  lost?: boolean;
  /** A share in another owner's ship: the fraction of each voyage that is yours. She is his to run. */
  share?: number;
  partner?: string;
}

const SHIP_NAMES = ['São Brás', 'Santa Clara', 'Boa Ventura', 'São Cristóvão', 'Nossa Senhora do Cabo',
  'Espírito Santo', 'São Vicente', 'Garça', 'Bom Jesus', 'Santiago', 'Flor de la Mar', 'Santa Catarina'];

/** Hulls the yards will sell for a Line, by what the Crown has opened. */
export function lineHulls(g: Game): string[] {
  return ['caravela-latina', 'caravela-redonda', 'nau-pequena', 'nau', 'nau-da-india']
    .filter((id) => hullAllowed(g.chronicle.act, id));
}

export function hullPrice(hullId: string): number {
  return Math.round((HULL_BY_ID.get(hullId)?.cost ?? 2000) * 0.8);
}

const PACE: Record<string, number> = {
  'caravela-latina': 115, 'caravela-redonda': 110, 'nau-pequena': 104, nau: 100, 'nau-da-india': 98,
};

export function legDays(from: string, to: string, hullId: string): number {
  const nm = roadMiles(anchorageOf(portDef(from)), anchorageOf(portDef(to)));
  return Math.max(3, Math.round(nm / (PACE[hullId] ?? 100) + 3));
}

/** Wages, victuals and port dues for one leg. */
export function legCost(from: string, to: string, hullId: string): number {
  const h = HULL_BY_ID.get(hullId);
  // A great ship is cheaper by the ton to run than a small one: that is why they were built.
  return Math.round(20 + legDays(from, to, hullId) * (h?.crewMin ?? 18) ** 0.8 * 0.6);
}

const isIndia = (id: string) => portDef(id).lon > 60;

/**
 * Whether the monsoon lets her sail this leg now. To India on the south-west
 * monsoon, April to September; from India on the north-east, November to
 * February. Everything else sails when it likes.
 */
export function inSeason(from: string, to: string, month: number): boolean {
  if (isIndia(from) === isIndia(to)) return true;
  return isIndia(to) ? month >= 4 && month <= 9 : month >= 11 || month <= 2;
}

/** The chance of losing her on one leg: about one in ten a year on any road, out of season four times that. */
function legRisk(from: string, to: string, hullId: string, forced: boolean): number {
  return (0.002 + legDays(from, to, hullId) * 0.0003) * (forced ? 4 : 1);
}

/** What one unit of a good fetches at a port today, as a Line would sell it there. */
function saleUnit(g: Game, port: string, goodId: string, qty: number): number {
  g.markets.refresh(port, g.clock.t);
  const l = g.markets.listings(port, g.clock.t, g.relationsFor(port).regard, 0.3, [goodId]).find((x) => x.goodId === goodId);
  if (!l) return 0;
  // A master selling on commission does not get what a captain standing on the quay gets.
  let unit = (l.bid / Markets.slippage(qty, l.appetite)) * 0.75;
  // The King's goods go straight into the Casa's warehouse at the Casa's price:
  // no agent to pay on the quay, but the Crown's share instead.
  if (port === 'lisboa' && MONOPOLY.includes(goodId)) unit = (unit / 0.75) * 0.92;
  if (port === 'lisboa' && MONOPOLY.includes(goodId) && !g.hasLicence(goodId)) {
    if (goodId === 'pimenta' && g.secretsHeard.includes('pepper-contract')) unit = 26;
    else unit *= CASA_SHARE;
  }
  if (port === 'lisboa' && goodId === 'pimenta' && g.secretsHeard.includes('pepper-corner')) unit *= 1.4;
  return unit;
}

/** What she can buy at a port: the House's store at what it paid, then the market. */
function sources(g: Game, port: string): { goodId: string; qty: number; unit: number; store: boolean }[] {
  const out: { goodId: string; qty: number; unit: number; store: boolean }[] = [];
  const house = g.feitorias.find((f) => f.portId === port && !f.lost);
  if (house) {
    for (const [id, q] of Object.entries(house.stock)) {
      if (q >= 1 && GOOD_BY_ID.has(id)) out.push({ goodId: id, qty: Math.floor(q), unit: house.paid[id] ?? GOOD_BY_ID.get(id)!.lisbon * 0.2, store: true });
    }
  }
  g.markets.refresh(port, g.clock.t);
  for (const l of g.markets.listings(port, g.clock.t, g.relationsFor(port).regard, 0.3)) {
    if (!l.local || l.stock < 1 || out.some((x) => x.goodId === l.goodId)) continue;
    out.push({ goodId: l.goodId, qty: l.stock, unit: l.ask, store: false });
  }
  return out;
}

export interface Pick { goodId: string; qty: number; unit: number; sale: number; margin: number; store: boolean }

/** The best single cargo from one port to another for this hull, or null. */
export function bestCargo(g: Game, from: string, to: string, hullId: string, cash: number): Pick | null {
  const h = HULL_BY_ID.get(hullId);
  if (!h) return null;
  let best: Pick | null = null;
  for (const s of sources(g, from)) {
    const gd = GOOD_BY_ID.get(s.goodId)!;
    let qty = Math.min(s.qty, Math.floor((h.hold * 0.85) / Math.max(gd.bulk, 1e-6)));
    if (!s.store) qty = Math.min(qty, Math.floor(cash / Math.max(s.unit, 0.01)));
    if (qty < 1) continue;
    const sale = saleUnit(g, to, s.goodId, qty);
    const margin = (sale - s.unit) * qty;
    if (margin > 0 && (!best || margin > best.margin)) best = { goodId: s.goodId, qty, unit: s.unit, sale, margin, store: s.store };
  }
  return best;
}

/** Take a cargo aboard: out of the House's store or the market. */
function load(g: Game, port: string, p: Pick): number {
  if (p.store) {
    const house = g.feitorias.find((f) => f.portId === port && !f.lost);
    if (house) house.stock[p.goodId] = Math.max(0, (house.stock[p.goodId] ?? 0) - p.qty);
  } else {
    g.markets.buy(port, p.goodId, p.qty);
  }
  return p.unit * p.qty;
}

function sell(g: Game, port: string, goodId: string, qty: number): number {
  const v = saleUnit(g, port, goodId, qty) * qty;
  g.markets.sell(port, goodId, qty);
  // A ship that brings a town what it wants, year after year, is worth the court's while.
  const pol = polityOfPort(port);
  if (pol) g.adjustPolity(pol.id, { interest: 0.012 });
  return v;
}

/** News of a port, as fresh as the ship that just left it. */
function bringNews(g: Game, port: string): void {
  g.hearFrom(port);
}

export function canOpenLine(g: Game, home: string, to: string, hullId: string): string | null {
  if (!g.feitorias.some((f) => f.portId === home && !f.lost) && home !== 'lisboa') return 'A Line runs from one of your Houses.';
  if (home === to) return 'She has to go somewhere.';
  if (g.lines.some((l) => !l.lost && !l.share && l.home === home)) {
    return `${portDef(home).name} already keeps a Line. One ship to a House: a factor cannot load two.`;
  }
  const def = portDef(to);
  if (def.people !== 'portuguese' && !g.relationsFor(to).mayTrade) return `You have no leave to trade at ${def.name}.`;
  if (!lineHulls(g).includes(hullId)) return 'The yards will not sell you that hull yet.';
  const cost = hullPrice(hullId);
  if (cost > g.crown.gold + g.creditFree) return `The hull comes to ${cost} cruzados, and there is not that much.`;
  return null;
}

export function openLine(g: Game, home: string, to: string, hullId: string): string {
  const why = canOpenLine(g, home, to, hullId);
  if (why) return why;
  const cost = hullPrice(hullId);
  if (g.crown.gold < cost) g.drawCredit(cost);
  g.crown.gold -= cost;
  const id = g.nextLineId++;
  const name = SHIP_NAMES[(id * 5 + g.lines.length) % SHIP_NAMES.length];
  g.lines.push({
    id, name, hullId, home, to, phase: 'home', at: g.clock.t, cargo: null, purse: 0, voyageText: '',
    trips: 0, earned: 0, history: [],
  });
  const h = HULL_BY_ID.get(hullId)!;
  g.logEvent('trade', `Bought the ${h.english.toLowerCase()} ${name} for ${cost} cruzados to run between ${portDef(home).name} and ${portDef(to).name}.`, true);
  return `The ${name} will run ${portDef(home).name} to ${portDef(to).name}.`;
}

/** Change her hull or her far end. At once if she is at home, otherwise when she comes in. */
export function amendLine(g: Game, l: Line, change: { hullId?: string; to?: string }): string {
  if (change.hullId && change.hullId !== l.hullId) {
    const price = hullPrice(change.hullId) - Math.round(hullPrice(l.hullId) * 0.6);
    if (price > g.crown.gold + g.creditFree) return `The exchange comes to ${price} cruzados, and there is not that much.`;
    if (price > 0) { if (g.crown.gold < price) g.drawCredit(price); g.crown.gold -= price; } else g.crown.gold -= price;
    if (l.phase === 'home') l.hullId = change.hullId; else l.nextHull = change.hullId;
  }
  if (change.to && change.to !== l.to) {
    if (l.phase === 'home') l.to = change.to; else l.nextTo = change.to;
  }
  l.waiting = undefined;
  l.at = Math.min(l.at, g.clock.t);
  return l.phase === 'home' ? 'Done.' : 'Done when she comes in.';
}

export function closeLine(g: Game, l: Line): string {
  if (l.phase !== 'home') return `${l.name} is at sea. She can be sold when she comes in.`;
  const back = Math.round(hullPrice(l.hullId) * 0.6);
  g.crown.gold += back;
  l.lost = true;
  return `${l.name} sold for ${back} cruzados.`;
}

function letterFrom(g: Game, port: string, text: string, severity: 'note' | 'warning' | 'grave' = 'note', act?: Letter['act']): void {
  g.postLetter(port, text, severity, act);
}

export interface Letter {
  t: number; arrives: number; text: string; severity: 'note' | 'warning' | 'grave';
  act?: { kind: 'sendEarly' | 'gift' | 'stockade'; ref: string };
}

/** Run every Line forward to now. Cheap: each looks at nothing until her time comes. */
export function tickLines(g: Game): void {
  for (const l of g.lines) {
    let guard = 0;
    while (!l.lost && g.clock.t >= l.at && guard++ < 6) step(g, l);
  }
}

function step(g: Game, l: Line): void {
  const month = g.clock.date.month;
  const house = g.feitorias.find((f) => f.portId === l.home && !f.lost);
  const homeName = portDef(l.home).name;
  const toName = portDef(l.to).name;

  if (l.phase === 'home') {
    if (l.nextHull) { l.hullId = l.nextHull; l.nextHull = undefined; }
    if (l.nextTo) { l.to = l.nextTo; l.nextTo = undefined; }
    // The factor keeps back enough to pay the Works and buy for the store.
    const cash = Math.max(0, (house?.chest ?? 0) - 150 - (house ? 2 * worksUpkeep(house) : 0)) + (l.home === 'lisboa' ? 600 : 0);
    const pick = bestCargo(g, l.home, l.to, l.hullId, cash);
    const cost = legCost(l.home, l.to, l.hullId) * 2;
    if (!pick || pick.margin < cost * 1.1) {
      if (l.waiting !== 'cargo') {
        letterFrom(g, l.home, `${homeName}: nothing here would pay the ${l.name}’s way to ${toName}. She lies idle until something does, or until you send her somewhere else.`);
      }
      l.waiting = 'cargo';
      l.at = g.clock.t + 12 * 86400;
      return;
    }
    if (!inSeason(l.home, l.to, month) && !l.forced) {
      if (l.waiting !== 'season') {
        letterFrom(g, l.home, `${homeName}: the ${l.name} is loaded and lies waiting for the monsoon before she can sail for ${toName}.`,
          'note', { kind: 'sendEarly', ref: String(l.id) });
      }
      l.waiting = 'season';
      l.at = g.clock.t + 10 * 86400;
      return;
    }
    const paid = load(g, l.home, pick);
    if (!pick.store && house) house.chest -= paid;
    l.outlay = paid;
    l.cargo = { goodId: pick.goodId, qty: pick.qty, cost: paid };
    l.phase = 'out';
    l.waiting = undefined;
    l.at = g.clock.t + legDays(l.home, l.to, l.hullId) * 86400;
    return;
  }

  if (l.phase === 'out') {
    const forced = !!l.forced;
    l.forced = false;
    if (g.rng.chance(legRisk(l.home, l.to, l.hullId, forced))) { lose(g, l, toName); return; }
    const c = l.cargo!;
    const gd = GOOD_BY_ID.get(c.goodId)!;
    const fetched = sell(g, l.to, c.goodId, c.qty);
    bringNews(g, l.to);
    l.purse = fetched;
    l.voyageText = `${Math.round(c.qty)} ${gd.unit}s of ${gd.english.toLowerCase()} to ${toName} for ${Math.round(fetched)}`;
    // And something to bring home, bought out of what she just took.
    const back = bestCargo(g, l.to, l.home, l.hullId, fetched * 0.8);
    if (back && back.margin > legCost(l.to, l.home, l.hullId)) {
      const spent = load(g, l.to, back);
      l.purse -= spent;
      l.cargo = { goodId: back.goodId, qty: back.qty, cost: spent };
    } else {
      l.cargo = null;
    }
    l.phase = 'back';
    l.at = g.clock.t + legDays(l.to, l.home, l.hullId) * 86400;
    return;
  }

  // Home.
  if (g.rng.chance(legRisk(l.to, l.home, l.hullId, false))) { lose(g, l, homeName); return; }
  let purse = l.purse;
  if (l.cargo) {
    const gd = GOOD_BY_ID.get(l.cargo.goodId)!;
    const fetched = sell(g, l.home, l.cargo.goodId, l.cargo.qty);
    purse += fetched;
    l.voyageText += `; home with ${Math.round(l.cargo.qty)} ${gd.unit}s of ${gd.english.toLowerCase()} for ${Math.round(fetched)}`;
  }
  bringNews(g, l.home);
  // The outward cargo is paid for out of the voyage: back into the House's chest
  // that bought it, or, from Lisbon, out of your own account.
  const outlay = Math.round(l.outlay ?? 0);
  l.outlay = 0;
  if (house) house.chest += outlay;
  purse -= outlay;
  const costs = legCost(l.home, l.to, l.hullId) + legCost(l.to, l.home, l.hullId);
  // The master and the men sail for a share, as every ship on the Carreira did, and the Casa takes its own.
  const gain = Math.max(0, purse - costs);
  const shares = gain * 0.35;
  const casa = gain * (g.casa.linesRate ?? (g.can('rua') ? 0.08 : 0.15));
  const whole = purse - costs - shares - casa;
  // A part-owner gets his part, of the profit and of the loss.
  const net = Math.round(whole * (l.share ?? 1));
  l.trips++;
  l.earned += net;
  l.lastNet = net;
  l.history.push({ t: g.clock.t, net });
  if (l.history.length > 12) l.history.shift();
  if (net !== 0) {
    g.remittances.push({
      arrives: g.clock.t + (portDef(l.home).people === 'portuguese' ? 0 : g.transitDays(l.home) * 86400),
      amount: net, from: l.name,
      voyage: `The ${l.name}: ${l.voyageText}. Outward cargo ${outlay}, costs ${costs}, the men’s shares ${Math.round(shares)}, the Casa ${Math.round(casa)}. `
        + (l.share ? `Your ${shareWord(l.share)} share: ${net}.` : `Net ${net}.`),
    });
  }
  l.cargo = null;
  l.purse = 0;
  l.phase = 'home';
  // Unloading, careening and loading again.
  l.at = g.clock.t + 20 * 86400;
}

function lose(g: Game, l: Line, near: string): void {
  l.lost = true;
  const what = l.cargo ? ` with ${Math.round(l.cargo.qty)} ${GOOD_BY_ID.get(l.cargo.goodId)!.unit}s of ${GOOD_BY_ID.get(l.cargo.goodId)!.english.toLowerCase()}` : '';
  letterFrom(g, l.home, `The ${l.name} has not come in. She was last seen bound for ${near}${what}, and nobody expects her now.`, 'grave');
  g.logEvent('peril', `The ${l.name} of your Line from ${portDef(l.home).name} is lost.`, true);
}

/** The scene for a run of paydays, delivered together at a Portuguese port. */
export function paydayScene(lines: string[], total: number): SeaEvent {
  return {
    id: `payday:${total}:${lines.length}`,
    title: total >= 0 ? 'The fleet is in' : 'A bad year for the Lines',
    severity: 'note',
    text: `${lines.join('\n\n')}\n\nAll told, ${total} cruzados ${total >= 0 ? 'to your account' : 'out of it'}.`,
    choices: [{ label: total >= 0 ? 'Into the chest' : 'So be it', detail: '', resolve: () => `The Lines: ${total} cruzados.` }],
  };
}

/** An actionable letter, as a scene with two answers. */
export function letterScene(g: Game, l: Letter): SeaEvent | null {
  const act = l.act;
  if (!act) return null;
  if (act.kind === 'sendEarly') {
    const line = g.lines.find((x) => String(x.id) === act.ref && !x.lost);
    if (!line || line.phase !== 'home') return null;
    return {
      id: `letter:send:${line.id}`, title: `A letter from ${portDef(line.home).name}`, severity: 'note',
      text: l.text + ' The factor asks whether she should go now, out of season, and take her chance.',
      choices: [
        { label: 'Send her now', detail: 'Four times the risk of losing her on the way out.', resolve: () => { line.forced = true; line.at = g.clock.t; line.waiting = undefined; return `Wrote to send the ${line.name} out of season.`; } },
        { label: 'Hold for the monsoon', detail: 'She sails when the wind comes round.', resolve: () => `The ${line.name} waits for the monsoon.` },
      ],
    };
  }
  const f = g.feitorias.find((x) => x.portId === act.ref && !x.lost);
  if (!f) return null;
  const gift = Math.round(80 + f.garrison * 6);
  return {
    id: `letter:footing:${f.portId}`, title: `A letter from ${portDef(f.portId).name}`, severity: 'warning',
    text: l.text,
    choices: [
      { label: `Send a present — ${gift} cruzados`, detail: 'The town is reminded why it wants you there.', resolve: (gg) => {
        gg.crown.gold = Math.max(0, gg.crown.gold - gift);
        f.trouble = clamp(f.trouble - 0.35, 0, 1);
        f.regard = clamp(f.regard + 0.12, 0, 1);
        return `Sent ${gift} cruzados of presents to ${portDef(f.portId).name}.`;
      } },
      { label: 'Raise a stockade — 160', detail: 'Walls and men; the House is harder to move against.', resolve: (gg) => {
        gg.crown.gold = Math.max(0, gg.crown.gold - 160);
        if (!f.works.includes('palicada')) f.works.push('palicada');
        f.trouble = clamp(f.trouble - 0.15, 0, 1);
        return `Wrote to raise a stockade at ${portDef(f.portId).name}.`;
      } },
      { label: 'Leave it to him', detail: 'Nothing spent.', resolve: () => 'Left the factor to manage.' },
    ],
  };
}

/**
 * Bring a save from before Houses and Lines across: each old business becomes
 * Works at a House in its town (a House is opened for it if there was none),
 * and each hired trading vessel becomes a Line.
 */
export function migrateEnterprises(g: Game, list: any[]): void {
  for (const e of list ?? []) {
    if (!e || e.lost) continue;
    let f = g.feitorias.find((x) => x.portId === e.portId && !x.lost);
    if (!f) {
      f = g.newHouse(e.portId, 'a manager of the town', null);
    }
    if (!f.make) { f.make = e.goodId; f.makeLevel = e.level ?? 1; }
    f.chest += Math.max(0, e.cash ?? 0);
    for (const [id, q] of Object.entries({ [e.goodId]: e.stock ?? 0 })) f.stock[id] = (f.stock[id] ?? 0) + (q as number);
    if (e.trader) {
      const id = g.nextLineId++;
      g.lines.push({
        id, name: e.trader.name ?? SHIP_NAMES[id % SHIP_NAMES.length], hullId: e.trader.hullId, home: e.portId,
        to: e.trader.toPort, phase: 'home', at: g.clock.t, cargo: null, purse: 0, voyageText: '', trips: e.trader.trips ?? 0,
        earned: e.trader.earned ?? 0, history: [],
      });
    }
  }
}

/** Ports a Line from `home` could run to: anywhere you may trade that you know. */
export function lineDestinations(g: Game, home: string): string[] {
  return PORTS.filter((p) => p.id !== home && (p.people === 'portuguese' || g.relationsFor(p.id).mayTrade)
    && (g.visitedPorts.has(p.id) || p.known)).map((p) => p.id);
}

export function shareWord(f: number): string {
  return f <= 0.26 ? 'quarter' : f <= 0.34 ? 'third' : f <= 0.51 ? 'half' : 'whole';
}

/** Where a Rua Nova owner sends his ship, by the route he is raising money for. */
const SHARE_ROUTE: Record<string, { to: string; hullId: string }> = {
  madeira: { to: 'funchal', hullId: 'caravela-latina' },
  guinea: { to: 'serra-leoa', hullId: 'caravela-latina' },
  mina: { to: 'mina', hullId: 'caravela-redonda' },
  congo: { to: 'mpinda', hullId: 'nau-pequena' },
  india: { to: 'calecute', hullId: 'nau' },
};

/**
 * Take a share in a Rua Nova owner's ship. She runs from Lisbon as any Line does,
 * through the same markets, and you are paid your part of every voyage. He decides
 * where she goes and in what; you decide only whether to be in her.
 */
export function buyShare(g: Game, route: string, ship: string, owner: string, ask: number, share: number): string {
  const r = SHARE_ROUTE[route];
  if (!r) return 'That ship has sailed without you.';
  const cost = Math.round(ask * share);
  if (cost > g.crown.gold) return `Your share is ${cost} cruzados, and the purse will not run to it.`;
  g.crown.gold -= cost;
  const id = g.nextLineId++;
  g.lines.push({
    id, name: ship, hullId: r.hullId, home: 'lisboa', to: r.to, phase: 'home', at: g.clock.t, cargo: null, purse: 0,
    voyageText: '', trips: 0, earned: 0, history: [], share, partner: owner,
  });
  g.logEvent('trade', `Bought a ${shareWord(share)} share in the ${ship}, ${owner}'s ship on the ${portDef(r.to).name} run, for ${cost} cruzados.`, true);
  return `A ${shareWord(share)} of the ${ship} is yours.`;
}

/** Sell a share back on the Rua Nova, at what the hull is worth. */
export function sellShare(g: Game, l: Line): string {
  if (l.phase !== 'home') return `The ${l.name} is at sea. A share is sold when she is in the river.`;
  const back = Math.round(hullPrice(l.hullId) * (l.share ?? 1) * 0.8);
  g.crown.gold += back;
  l.lost = true;
  return `Sold your share in the ${l.name} for ${back} cruzados.`;
}
