import { NM, clamp, haversine } from '../core/math';
import { GOOD_BY_ID } from '../economy/goods';
import { CASA_SHARE, MONOPOLY } from '../economy/trade';
import { PORTS, anchorageOf, portDef } from '../world/ports';
import type { WorldHost } from '../world/tick';
import type { RivalState } from './rival';

/**
 * The rival as a house (BUILD_PLAN D2).
 *
 * He used to be a latitude that fell. Now he is a trading house in the lane sim: a purse,
 * one to three hulls, and an eye for margin. Every month he lands what his hulls have
 * carried (selling it into the same markets the captain sells into), then sends any hull
 * that is idle to the pair of ports on his part of the coast where the margin is best,
 * buying off the same quay. So the captain can feel him in the prices: the Tagus sags when
 * his caravel lands pepper, a quay he has stripped is dear for a season, and a lane the
 * captain has glutted is one he leaves. He can be undercut (sell into his lane first), bought out
 * (the Casa mediates, and it is dear) or allied with (he gives your lane a wide berth). There is
 * no ship-to-ship contact: he is a name on the quay, as he always was.
 *
 * His discovery frontier is flavour on top, and it is paid for out of the same purse: when he
 * is poor he explores slowly. It is no longer a counter: it is the log of the voyages his house
 * has paid for, and `frontierLat` on the rival reads the southernmost of them.
 */

export interface HouseVoyage {
  from: string;
  to: string;
  goodId: string;
  qty: number;
  /** What he paid, in all. */
  cost: number;
  /** Margin per unit when he bought, to tell later whether he was undercut. */
  margin0: number;
  arrive: number;
}

export interface RivalHouse {
  capital: number;
  hulls: number;
  voyages: HouseVoyage[];
  /** The voyages of discovery his house has paid for, newest last. */
  explored: { t: number; lat: number }[];
  /** Days since his last discovery voyage was sent. */
  expDays: number;
  /** Lifetime profit on trade. */
  profit: number;
  /** The captain bought him out; he trades no more. */
  bought?: boolean;
  /** The captain has an understanding with him: he keeps off the lanes the captain works. */
  allied?: boolean;
  /** Ship-time of the last time the captain undercut him. */
  undercutT?: number;
  /** Last month the house was stepped. */
  month?: number;
}

export const START_LAT = -6;
export const HULL_COST = 1300;
/** Upkeep a hull costs a month: 0.8% of its price, 24 men at 4 cruzados, chandlery and dues. */
export const HULL_UPKEEP = HULL_COST * 0.008 + 24 * 4 + 55;
/** What he keeps of a sale after commission, spoilage and the quay's cut. */
const TAKE_HOME = 0.78;
/** A voyage in twelve never comes home. */
const LOSS = 1 / 12;
/** A house above this lives on it: the share of the excess spent each month on his household, the court and his name. */
const HOUSEHOLD_ABOVE = 4000;
const HOUSEHOLD_RATE = 0.05;
export const EXPLORE_COST = 350;
export const START_CAPITAL = 1800;
const HOLD_T = 60;
const MONTH = 30 * 86400;
const PACE_NM_DAY = 95;
const RESERVE = 150;

export function newHouse(): RivalHouse {
  return { capital: START_CAPITAL, hulls: 1, voyages: [], explored: [], expDays: 0, profit: 0 };
}

export function houseOf(r: RivalState): RivalHouse {
  r.house ??= newHouse();
  const h = r.house;
  h.voyages ??= []; h.explored ??= []; h.expDays ??= 0; h.profit ??= 0;
  return h;
}

// ---------------------------------------------------------------------------
// The frontier: the log of voyages his house has paid for

export function frontierOf(r: RivalState): number {
  const e = houseOf(r).explored;
  let lat = START_LAT;
  for (const x of e) if (x.lat < lat) lat = x.lat;
  return lat;
}

/** Move the frontier: further south is a voyage; a set-back strikes out the voyages that went beyond it. */
export function setFrontier(r: RivalState, lat: number, t = 0): void {
  const h = houseOf(r);
  const to = Math.min(START_LAT, lat);
  if (to >= frontierOf(r)) h.explored = h.explored.filter((x) => x.lat >= to);
  if (to < START_LAT && to < frontierOf(r)) h.explored.push({ t, lat: to });
  else if (to < START_LAT && !h.explored.some((x) => x.lat <= to)) h.explored.push({ t, lat: to });
  if (h.explored.length > 12) h.explored = h.explored.slice(-12);
}

/**
 * Make `frontierLat` a reading of the house, not a number kept. A save from before the house has it as plain data: it
 * becomes the first voyage in the log. Idempotent; call after the rival is made or loaded.
 */
export function bindRival(r: RivalState): RivalState {
  const own = Object.getOwnPropertyDescriptor(r, 'frontierLat');
  if (own && 'value' in own) {
    const h = houseOf(r);
    const old = Number(own.value);
    if (Number.isFinite(old) && old < START_LAT && h.explored.length === 0) h.explored.push({ t: 0, lat: old });
    delete (r as { frontierLat?: number }).frontierLat;
  }
  if (!Object.getOwnPropertyDescriptor(r, 'frontierLat')) {
    Object.defineProperty(r, 'frontierLat', {
      configurable: true, enumerable: false,
      get(this: RivalState) { return frontierOf(this); },
      set(this: RivalState, v: number) { setFrontier(this, v); },
    });
  }
  houseOf(r);
  return r;
}

// ---------------------------------------------------------------------------
// The month

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

function slip(q: number, avail: number): number {
  return avail <= 0 ? 1 : 1 + Math.min(1, q / avail) ** 2 * 0.55;
}

interface Option { from: string; to: string; goodId: string; qty: number; unit: number; margin: number; profit: number; days: number }

function reach(r: RivalState): string[] {
  const south = frontierOf(r);
  return PORTS.filter((p) => p.lon < 25 && p.lon > -45 && p.lat >= south - 0.5
    && (p.known || r.claimed.includes(p.id) || p.lat >= START_LAT)).map((p) => p.id);
}

/**
 * Land what has arrived, then send an idle hull where the margin is best. Called by the lane pass.
 * Nothing here draws on the game's random numbers.
 */
export function stepHouse(host: WorldHost, t: number): void {
  const r = host.rival;
  if (!r || r.eclipsed || r.ruined) return;
  const h = houseOf(r);
  const mk = host.markets;
  const mi = Math.floor(t / MONTH);
  if (h.bought) return;
  h.month = mi;

  // Landings.
  const pending: HouseVoyage[] = [];
  for (const v of h.voyages) {
    if (v.arrive > t) { pending.push(v); continue; }
    const gd = GOOD_BY_ID.get(v.goodId);
    if (!gd) continue;
    const l = mk.listings(v.to, t, 0, 0.2).find((x) => x.goodId === v.goodId);
    if (!l) { h.capital += v.cost * 0.6; continue; }
    const casa = v.to === 'lisboa' && MONOPOLY.includes(v.goodId) ? Math.max(CASA_SHARE, 0.9) : 1;
    const lost = hash(`${host.seed}:${mi}:${v.from}:${v.to}:${v.goodId}`) < LOSS;
    if (lost) {
      host.worldNote?.(v.to, `${r.name}’s house lost a cargo of ${gd.english.toLowerCase()} on the road to ${portDef(v.to).name}.`);
      continue;
    }
    const got = (v.qty * l.bid * casa * TAKE_HOME) / slip(v.qty, l.appetiteLot ?? l.appetite);
    mk.sell(v.to, v.goodId, Math.min(v.qty, Math.max(1, l.appetiteLot ?? l.appetite)));
    h.capital += got;
    h.profit += got - v.cost;
    // Undercut: the margin he sailed for is gone, and the captain's weight is on that quay.
    const sold = mk.volumeOf(v.to, v.goodId).sold - v.qty;
    if (v.margin0 > 0 && (got - v.cost) / v.qty < v.margin0 * 0.35 && sold > 0.5 * v.qty && (h.undercutT ?? -1e12) < t - 180 * 86400) {
      h.undercutT = t;
      host.rivalEvent?.('undercut', v.to, v.goodId);
    }
    if (v.to === 'lisboa') host.worldNote?.('lisboa', `${r.name}’s caravel came up the Tagus with ${Math.round(v.qty)} ${gd.unit}s of ${gd.english.toLowerCase()}. The price of it on the quay went down the same afternoon.`);
  }
  h.voyages = pending;

  // Upkeep, the household, then the books.
  h.capital -= h.hulls * HULL_UPKEEP;
  h.capital -= Math.max(0, h.capital - HOUSEHOLD_ABOVE) * HOUSEHOLD_RATE;
  if (h.capital < 0) { h.capital = 0; if (h.voyages.length === 0 && h.hulls > 1) h.hulls--; }

  // A second and third hull when the purse has grown to carry them.
  if (h.hulls < 3 && h.capital > HULL_COST * (h.hulls + 1.8) * 1.4) { h.capital -= HULL_COST; h.hulls++; }

  // Dispatch.
  const idle = h.hulls - h.voyages.length;
  if (idle <= 0 || h.capital < RESERVE + 60) return;
  const ids = reach(r);
  const book = new Map(ids.map((id) => [id, new Map(mk.listings(id, t, 0, 0.2).map((l) => [l.goodId, l]))]));
  const taken = new Set(h.voyages.map((v) => `${v.from}>${v.to}:${v.goodId}`));
  for (let k = 0; k < idle; k++) {
    let best: Option | null = null;
    for (const a of ids) {
      const la = book.get(a)!;
      for (const [gid, ask] of la) {
        if (!ask.local || ask.stock < 4) continue;
        const gd = GOOD_BY_ID.get(gid);
        if (!gd) continue;
        for (const b of ids) {
          if (a === b) continue;
          const lb = book.get(b)!.get(gid);
          if (!lb || lb.appetite < 2 || taken.has(`${a}>${b}:${gid}`)) continue;
          const casa = b === 'lisboa' && MONOPOLY.includes(gid) ? Math.max(CASA_SHARE, 0.9) : 1;
          const margin = lb.bid * casa - ask.ask;
          if (margin <= 0) continue;
          const qty = Math.floor(Math.min((ask.lot ?? ask.stock) * 0.4, lb.appetiteLot ?? lb.appetite, HOLD_T / Math.max(gd.bulk, 0.001), (h.capital - RESERVE) / (ask.ask * 1.2)));
          if (qty < 2) continue;
          // An ally keeps off the captain's lanes.
          const crowd = mk.volumeOf(a, gid).bought + mk.volumeOf(b, gid).sold;
          if (h.allied && crowd > 0.2 * qty) continue;
          const nm = haversine(anchorageOf(portDef(a)), anchorageOf(portDef(b))) / NM * 1.25;
          const days = Math.max(20, nm / PACE_NM_DAY + 8);
          const profit = (qty * margin) / (days / 30 + 1);
          if (!best || profit > best.profit || (profit === best.profit && `${a}${b}${gid}` < `${best.from}${best.to}${best.goodId}`)) {
            best = { from: a, to: b, goodId: gid, qty, unit: ask.ask, margin, profit, days };
          }
        }
      }
    }
    if (!best) break;
    const cost = best.qty * best.unit * slip(best.qty, (book.get(best.from)!.get(best.goodId)!.lot ?? book.get(best.from)!.get(best.goodId)!.stock));
    if (cost > h.capital - RESERVE) break;
    mk.buy(best.from, best.goodId, best.qty);
    h.capital -= cost;
    h.voyages.push({
      from: best.from, to: best.to, goodId: best.goodId, qty: best.qty, cost, margin0: best.margin,
      arrive: t + Math.ceil(best.days / 30) * MONTH,
    });
    taken.add(`${best.from}>${best.to}:${best.goodId}`);
    r.cargoes = [...(r.cargoes ?? []), { t, port: best.from, goodId: best.goodId, qty: best.qty }].slice(-6);
  }
}

// ---------------------------------------------------------------------------
// The captain's moves

/** What the Casa will ask to broker his house over to the captain: what it holds, and a premium. */
export function buyOutPrice(r: RivalState): number {
  const h = houseOf(r);
  return Math.round(1200 + h.capital * 1.2 + h.hulls * HULL_COST * 0.8 + h.voyages.reduce((s, v) => s + v.cost, 0) * 1.1);
}

/** The Casa mediates: he is paid, his hulls are sold, and he trades no more. */
export function buyOut(r: RivalState): void {
  const h = houseOf(r);
  h.bought = true;
  h.voyages = [];
  h.hulls = 0;
  h.capital = 0;
}

/** The understanding costs nothing in money: it needs a man he does not hate. */
export function canAlly(r: RivalState): boolean {
  return !houseOf(r).bought && !houseOf(r).allied && (r.regard ?? 0) >= -0.1 && !r.ruined && !r.eclipsed;
}

export function ally(r: RivalState): void {
  houseOf(r).allied = true;
  r.compact = true;
}

/** One line for the Book on what his house is doing, from what is true of it. */
export function houseLine(r: RivalState): string {
  const h = houseOf(r);
  if (h.bought) return `${r.name}’s house was bought out through the Casa and trades no more.`;
  if (r.ruined) return `${r.name}’s house is ruined.`;
  const v = h.voyages[0];
  const gd = v ? GOOD_BY_ID.get(v.goodId) : null;
  const where = v && gd ? ` One of his hulls is carrying ${gd.english.toLowerCase()} from ${portDef(v.from).name} to ${portDef(v.to).name}.` : '';
  return `${r.name} runs ${h.hulls === 1 ? 'a hull' : `${h.hulls} hulls`} and has about ${Math.round(clamp(h.capital, 0, 1e9) / 100) * 100} cruzados in the house.${where}`;
}
