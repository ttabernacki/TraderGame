import { NM, haversine, type LatLon } from '../core/math';
import { dateFromDays } from '../core/clock';
import { GOODS, good } from '../economy/goods';
import { Markets, type MarketEffects } from '../economy/market';
import { regionOf, type Region } from '../economy/trade';
import { polityOfPort } from '../diplomacy/polities';
import { PORTS, anchorageOf, portDef } from './ports';
import { MONTH, setLaneModel, type LaneContext, type LaneModel, type LaneResult, type WorldHost } from './tick';
import { postContracts } from './contracts';
import { stepHouse } from '../progression/rivalHouse';

/**
 * NPC lanes (BUILD_PLAN D1): the world trades without you.
 *
 * About a hundred and fifty directed lanes join neighbouring ports within a network,
 * the networks to one another along the road, and five long trunks (Lisbon-Mina,
 * Kilwa-Cambay, Cambay-Malabar, Malabar-Malacca, Aden-Cambay). Each carries at most six
 * goods. Once a month (the lane pass of `world/tick`):
 *
 *     F = min(surplus_A, need_B, cap_lane) x (1 - risk)
 *
 * surplus_A is what the origin holds above a floor, need_B what the destination will
 * still take, cap_lane the tonnage the carrying polity can spare for the lane.
 * risk is the lane's own, times the chart grade (`Game.laneRisk`, the better the coast is
 * known the safer the road), times the war or embargo `marketModifiers` says is in force.
 * A lane whose end is shut by the Powers carries nothing until it is open again.
 *
 * What the player, his Lines and the rival buy off a quay and sell onto it lately
 * (`Markets.volumeOf`) crowds the NPC ships out of that lane: his volume saturates it.
 * They are never simulated as hulls; only their weight moves. Nothing here draws on the
 * game's random numbers, and nothing reads the date but the month, so a long catch-up is
 * the same as the months stepped one at a time.
 */

export interface LaneDef {
  id: string;
  from: string;
  to: string;
  goods: string[];
  trunk: boolean;
  nm: number;
  /** Tons a month the carrying polity can spare for the whole lane. */
  capT: number;
  /** The loss risk before the chart and the war: a few per cent, more on the long runs. */
  baseRisk: number;
  phase: number;
  /** The lane crosses the monsoon divide. */
  monsoon: boolean;
}

export interface LaneState {
  v: 1;
  /** port:good to an average of the month's net arrivals: positive is a glut coming in, negative stock going out. */
  net: Record<string, number>;
  /** port:good to the months in a row the quay has shown under 30% of its usual stock. */
  low: Record<string, number>;
  /** Lane to the chart-grade multiplier last worked out, and the quarter it was worked out for. */
  risk: Record<string, { k: number; m: number }>;
  /** Lane to the value moved last month, in cruzados at the Lisbon price. */
  flow: Record<string, number>;
  /** Port to last month's traffic against what is usual for it. */
  traffic: Record<string, number>;
  /** port:good to the month index before which no new contract is posted. */
  cool: Record<string, number>;
}

export function newLaneState(): LaneState {
  return { v: 1, net: {}, low: {}, risk: {}, flow: {}, traffic: {}, cool: {} };
}

/** The state, made on first use (the `??=` of the load boundary). */
export function laneStateOf(h: Pick<WorldHost, 'lanes'>): LaneState {
  const s = (h.lanes ??= newLaneState());
  s.net ??= {}; s.low ??= {}; s.risk ??= {}; s.flow ??= {}; s.traffic ??= {}; s.cool ??= {};
  return s;
}

// ---------------------------------------------------------------------------
// The numbers

/** A lane draws at most this share of the origin's baseline stock in a month. */
export const DRAW = 0.08;
/** The origin keeps this share of its baseline; only what is above is surplus. */
export const FLOOR = 0.55;
/** A destination takes this share of what it still wants in a month. */
export const TAKE = 0.3;
/** A port is "usual" when its traffic is this share of the median port's. */
export const USUAL = 0.7;
/** Annual tons the carrying polity can spare, order of magnitude (BUILD_PLAN D1), by polity then by network. */
const POLITY_KT: Record<string, number> = { gujarat: 12000, calicut: 8000, kilwa: 2000, malindi: 1000, hormuz: 5000, aden: 5000, malacca: 8000 };
const NETWORK_KT: Record<Region, number> = {
  europe: 3000, atlantic: 800, maghreb: 1500, guinea: 400, kongo: 300, cape: 100, brazil: 100,
  swahili: 1000, arabia: 4000, india: 5000, east: 6000,
};
/** The trunks: from, to, tons a year each way. */
const TRUNKS: [string, string, number][] = [
  ['lisboa', 'mina', 600], ['quiloa', 'cambaia', 2000], ['cambaia', 'calecute', 10000],
  ['calecute', 'malaca', 8000], ['adem', 'cambaia', 5000],
];
/** Region order along the road, for the bridges between networks. */
const BRIDGES: Region[] = ['europe', 'atlantic', 'maghreb', 'guinea', 'kongo', 'cape', 'swahili', 'arabia', 'india', 'east'];
/** Neighbours each port reaches within its own network. */
const NEAREST = 2;
const MAX_GOODS = 6;

const isEast = (id: string): boolean => portDef(id).lon > 60;

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

const nmBetween = (a: string, b: string): number => haversine(anchorageOf(portDef(a)), anchorageOf(portDef(b))) / NM;

/** What a lane from a to b would carry: goods the origin makes and the destination wants or is short of. */
function goodsFor(a: string, b: string): string[] {
  const A = portDef(a), B = portDef(b);
  const scored: [string, number][] = [];
  for (const g of GOODS) {
    const ab = A.produces[g.id] ?? 0;
    if (ab <= 0) continue;
    const hunger = B.wants[g.id] ?? 0;
    const bp = B.produces[g.id] ?? 0;
    let score = 0;
    if (hunger > 0) score = ab * hunger * Math.pow(g.lisbon, 0.3);
    else if (bp > 0 && ab > bp + 0.15) score = (ab - bp) * 0.35 * Math.pow(g.lisbon, 0.3);
    if (score > 0.3) scored.push([g.id, score]);
  }
  return scored.sort((x, y) => y[1] - x[1]).slice(0, MAX_GOODS).map(([id]) => id);
}

let table: LaneDef[] | null = null;
let byPort: Map<string, LaneDef[]> | null = null;

/** Every lane, built once from the port and polity tables. Deterministic. */
export function lanes(): LaneDef[] {
  if (table) return table;
  const pairs = new Map<string, boolean>(); // 'a>b' to trunk
  const link = (a: string, b: string, trunk = false): void => {
    if (a === b) return;
    for (const k of [`${a}>${b}`, `${b}>${a}`]) pairs.set(k, (pairs.get(k) ?? false) || trunk);
  };
  const byRegion = new Map<Region, string[]>();
  for (const p of PORTS) {
    const r = regionOf(p.id);
    (byRegion.get(r) ?? byRegion.set(r, []).get(r)!).push(p.id);
  }
  // Neighbours within a network.
  for (const ids of byRegion.values()) {
    for (const a of ids) {
      ids.filter((b) => b !== a).sort((x, y) => nmBetween(a, x) - nmBetween(a, y)).slice(0, NEAREST).forEach((b) => link(a, b));
    }
  }
  // Bridges: the nearest pair of ports in networks next along the road, and a port alone in its network joins the nearest port at all.
  for (let i = 1; i < BRIDGES.length; i++) {
    const A = byRegion.get(BRIDGES[i - 1]) ?? [], B = byRegion.get(BRIDGES[i]) ?? [];
    let best: [string, string, number] | null = null;
    for (const a of A) for (const b of B) { const d = nmBetween(a, b); if (!best || d < best[2]) best = [a, b, d]; }
    if (best) link(best[0], best[1]);
  }
  for (const [r, ids] of byRegion) {
    if (ids.length > 1 || BRIDGES.includes(r)) continue;
    const a = ids[0];
    const near = PORTS.filter((p) => p.id !== a).sort((x, y) => nmBetween(a, x.id) - nmBetween(a, y.id))[0];
    if (near) link(a, near.id);
  }
  for (const [a, b] of TRUNKS) link(a, b, true);

  const out: LaneDef[] = [];
  for (const [k, trunk] of pairs) {
    const [from, to] = k.split('>');
    const goods = goodsFor(from, to);
    if (goods.length === 0) continue;
    const nm = nmBetween(from, to);
    const carrier = polityOfPort(from) ?? polityOfPort(to);
    const kt = carrier ? (POLITY_KT[carrier.id] ?? NETWORK_KT[carrier.network]) : NETWORK_KT[regionOf(from)] ?? 800;
    out.push({
      id: k, from, to, goods, trunk, nm, capT: kt / 12, // shared out below
      baseRisk: Math.min(0.25, 0.03 + nm / 2400 * 0.06 + (trunk ? 0.04 : 0)),
      phase: hash(k) * Math.PI * 2,
      monsoon: isEast(from) !== isEast(to) || (trunk && (regionOf(from) === 'swahili' || regionOf(from) === 'arabia') !== (regionOf(to) === 'swahili' || regionOf(to) === 'arabia')),
    });
  }
  // A polity's tonnage is shared among the lanes it carries; a trunk has its own figure.
  const carried = new Map<string, number>();
  for (const l of out) if (!l.trunk) { const c = polityOfPort(l.from)?.id ?? regionOf(l.from); carried.set(c, (carried.get(c) ?? 0) + 1); }
  for (const l of out) {
    const tr = TRUNKS.find(([a, b]) => (a === l.from && b === l.to) || (a === l.to && b === l.from));
    if (tr) l.capT = tr[2] / 12;
    else l.capT = l.capT / Math.max(1, carried.get(polityOfPort(l.from)?.id ?? regionOf(l.from)) ?? 1);
  }
  table = out.sort((a, b) => (a.id < b.id ? -1 : 1));
  byPort = new Map();
  for (const l of table) for (const p of [l.from, l.to]) (byPort.get(p) ?? byPort.set(p, []).get(p)!).push(l);
  return table;
}

export function lanesAt(portId: string): LaneDef[] {
  lanes();
  return byPort!.get(portId) ?? [];
}

// ---------------------------------------------------------------------------
// What a lane carries, in a healthy month

/** Units of one good a lane's cap allows in a month (the tons are shared evenly among its goods). */
function capUnits(l: LaneDef, goodId: string): number {
  return l.capT / l.goods.length / Math.max(good(goodId).bulk, 0.0005);
}

interface Nominal { units: number; value: number }
let reference: Map<string, Nominal> | null = null;
let typical = 1;
const refPort = new Map<string, number>();

/** The reference: the lanes in a healthy month at prosperity 1, from a fresh set of markets. */
function referenceTable(): Map<string, Nominal> {
  if (reference) return reference;
  const m = new Markets(0);
  reference = new Map();
  refPort.clear();
  for (const l of lanes()) {
    for (const gid of l.goods) {
      const base = m.baseOf(l.from, gid);
      if (base <= 0) continue;
      const want = m.appetiteLeft(l.to, gid);
      const need = want > 0 ? TAKE * want : 0.25 * 0.5 * m.baseOf(l.to, gid);
      const units = Math.min(DRAW * base, need, capUnits(l, gid));
      if (units <= 0) continue;
      const value = units * good(gid).lisbon * (1 - l.baseRisk);
      reference.set(`${l.id}:${gid}`, { units, value });
      for (const p of [l.from, l.to]) refPort.set(p, (refPort.get(p) ?? 0) + value);
    }
  }
  const vals = [...refPort.values()].sort((a, b) => a - b);
  typical = vals.length ? vals[Math.floor(vals.length / 2)] : 1;
  return reference;
}

/** What the lanes carry for a port in a healthy month, in cruzados at the Lisbon price; 0 if none touch it. */
export function usualTraffic(portId: string): number {
  referenceTable();
  return refPort.get(portId) ?? 0;
}

// ---------------------------------------------------------------------------
// The month

const monthIndex = (t: number): number => Math.floor(t / MONTH);

/** `Math.sin` of the year: a lane has its own busy season, and the monsoon shuts the crossing ones for half the year. */
function season(l: LaneDef, month: number): number {
  let s = 1 + 0.3 * Math.sin((month / 12) * Math.PI * 2 + l.phase);
  if (l.monsoon) {
    const eastbound = isEast(l.to) || regionOf(l.to) === 'arabia';
    const open = eastbound ? month >= 4 && month <= 9 : month >= 11 || month <= 2;
    s *= open ? 1.15 : 0.3;
  }
  return s;
}

/** Worked out once a quarter: the chart's grade makes the coast safer. 1 if the host knows nothing of charts. */
function chartMult(h: WorldHost, st: LaneState, l: LaneDef, mi: number): number {
  if (!h.laneRisk) return 1;
  const k = Math.floor(mi / 3);
  const c = st.risk[l.id];
  if (c && c.k === k) return c.m;
  const a: LatLon = anchorageOf(portDef(l.from)), b: LatLon = anchorageOf(portDef(l.to));
  const m = h.laneRisk(a, b);
  st.risk[l.id] = { k, m };
  return m;
}

/** What the Powers are doing to a lane's two ends, as the markets would apply it. */
function warFactor(a: MarketEffects | null, b: MarketEffects | null): number {
  let f = 1;
  for (const e of [a, b]) if (e && e.reason) f += 0.35;
  return f;
}

/**
 * The lane pass. Registered with `setLaneModel` when this module is loaded.
 */
export const laneModel: LaneModel = (ctx: LaneContext): LaneResult => {
  const h = ctx.host;
  const st = laneStateOf(h);
  const mk = h.markets;
  const t = ctx.t;
  const mi = monthIndex(t);
  const month = dateFromDays(Math.floor(t / 86400)).month;
  const reference = referenceTable();
  const mods = new Map<string, MarketEffects | null>();
  const modsAt = (p: string): MarketEffects | null => {
    if (!mods.has(p)) mods.set(p, mk.modifiers ? mk.modifiers(p, t) : null);
    return mods.get(p)!;
  };

  const delta: Record<string, number> = {};
  const realized: Record<string, number> = {};
  for (const l of lanes()) {
    st.flow[l.id] = 0;
    const ma = modsAt(l.from), mb = modsAt(l.to);
    if (ma?.laneClosed || mb?.laneClosed || ma?.closed || mb?.closed) continue;
    const risk = Math.min(0.9, l.baseRisk * chartMult(h, st, l, mi) * warFactor(ma, mb));
    const seas = season(l, month);
    let moved = 0;
    for (const gid of l.goods) {
      const baseA = mk.baseOf(l.from, gid);
      if (baseA <= 0) continue;
      const stockA = mk.supply(l.from, gid).stock;
      const surplus = Math.max(0, stockA - FLOOR * baseA);
      const want = mk.appetiteLeft(l.to, gid) * (mb?.appetiteMult[gid] ?? 1);
      const baseB = mk.baseOf(l.to, gid);
      const need = want > 0 ? TAKE * want : Math.max(0, 0.9 * baseB - mk.supply(l.to, gid).stock) * 0.5;
      const nominal = reference.get(`${l.id}:${gid}`)?.units ?? 0;
      const raw = Math.min(surplus, need, capUnits(l, gid), DRAW * baseA);
      if (raw <= 0.01) continue;
      // The player's, his Lines' and the rival's weight on either quay crowds the lane.
      const crowd = (mk.volumeOf(l.from, gid).bought + mk.volumeOf(l.to, gid).sold) / Math.max(nominal, 1);
      const f = (raw * (1 - risk) * seas) / (1 + crowd);
      if (f <= 0.01) continue;
      const taken = -mk.addStock(l.from, gid, -f);
      if (taken <= 0) continue;
      const got = mk.receive(l.to, gid, taken);
      if (got < taken) mk.addStock(l.from, gid, taken - got);
      if (got <= 0) continue;
      const k1 = `${l.from}:${gid}`, k2 = `${l.to}:${gid}`;
      delta[k1] = (delta[k1] ?? 0) - got;
      delta[k2] = (delta[k2] ?? 0) + got;
      moved += got * good(gid).lisbon;
    }
    st.flow[l.id] = Math.round(moved);
    if (moved > 0) for (const p of [l.from, l.to]) realized[p] = (realized[p] ?? 0) + moved;
  }

  // The trend each quay shows: arrivals glut it, departures drain it.
  for (const k of new Set([...Object.keys(st.net), ...Object.keys(delta)])) {
    const v = (st.net[k] ?? 0) * 0.6 + (delta[k] ?? 0) * 0.4;
    if (Math.abs(v) < 0.02) delete st.net[k]; else st.net[k] = Math.round(v * 1000) / 1000;
  }

  // The traffic each port saw, against what is usual for a port of its kind.
  const traffic: Record<string, number> = {};
  const usual = USUAL * typical;
  for (const p of PORTS) {
    if (lanesAt(p.id).length === 0) continue;
    const r = (realized[p.id] ?? 0) / Math.max(usual, 1e-6);
    traffic[p.id] = Math.round(r * 1000) / 1000;
    st.traffic[p.id] = traffic[p.id];
  }

  // Scarcity: a quay that has stood under 30% of its usual stock for two months posts a contract.
  postContracts(h, t, mi);
  // The rival sells into the same markets.
  stepHouse(h, t);
  // The weight of outsiders fades, and the month is over.
  for (const p of PORTS) mk.decayVolume(p.id, 0.5);
  return { traffic };
};

/** The arrow a price sheet shows for a good at a port: 1 rising, -1 falling, 0 steady. */
export function laneTrend(h: Pick<WorldHost, 'lanes' | 'markets'>, portId: string, goodId: string): -1 | 0 | 1 {
  const net = h.lanes?.net[`${portId}:${goodId}`] ?? 0;
  if (net === 0) return 0;
  const scale = net < 0 ? h.markets.baseOf(portId, goodId) : h.markets.appetiteLeft(portId, goodId);
  if (scale <= 0 || Math.abs(net) < 0.03 * scale) return 0;
  // Departures leave the quay short (dearer); arrivals glut it (cheaper).
  return net < 0 ? 1 : -1;
}

setLaneModel(laneModel);
