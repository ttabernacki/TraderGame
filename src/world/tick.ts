import { clamp } from '../core/math';
import { dateFromDays } from '../core/clock';
import { Rng } from '../core/rng';
import type { Markets } from '../economy/market';
import { fairsAt, rollShocks, type TradeState } from '../economy/trade';
import type { Feitoria } from '../progression/feitoria';
import { PORTS, portDef, type PortDef } from './ports';
import type { LatLon } from '../core/math';
import type { LaneState } from './laneState';
import type { PortContract } from './contracts';
import type { HeatState } from '../economy/contraband';
import type { RivalState } from '../progression/rival';

/**
 * The monthly world tick (BUILD_PLAN C1) and port prosperity.
 *
 * Once a month of game time, every port is run through three passes (about 52 ports
 * x 42 goods, microseconds):
 *
 *   1. production   stock comes back toward the port's baseline, which is scaled by prosperity;
 *   2. lanes        NPC traffic and flows between ports (world/lanes, installed with `setLaneModel`);
 *   3. consumption  gluts decay; appetite is scaled by prosperity wherever it is read.
 *
 * then prosperity itself moves. The tick is deterministic given the seed and the date (its
 * only randomness is a generator seeded from both), and `tickWorld(h, 12)` leaves exactly the
 * state twelve calls of `tickWorld(h, 1)` do, so a long accelerated stretch catches up the
 * same as the same time lived a month at a time.
 *
 * Prosperity P, 0.5 to 1.6, multiplies the port's constant wealth wherever the markets
 * read it (`Markets.wealthOf`). 1 is how the port was written.
 */

export const MONTH = 30 * 86400;
export const P_MIN = 0.5;
export const P_MAX = 1.6;
/** Months a single call will run; longer gaps are skipped forward (the world is not a ledger of every month of a long absence). */
export const MAX_CATCH_UP = 240;

export type Band = 'thriving' | 'ordinary' | 'struggling';
export type Reason = 'traffic' | 'fair' | 'house' | 'boom' | 'quay' | 'fort' | 'war' | 'blockade' | 'embargo' | 'plague' | 'famine' | 'other';

/** What is kept for each port. Additive: absent in older saves, defaulted by `portState`. */
export interface PortState {
  /** P, 0.5 to 1.6. */
  prosperity: number;
  band?: Band;
  /** Why it is where it is: the last thing that moved it. */
  cause?: Reason;
  /** What the player has built: quay and fort levels, 0 to 3 each. */
  quay?: number;
  fort?: number;
  /** Calls the player has made since the last tick (traffic). */
  calls?: number;
  /** What the player saw when last in port. */
  seen?: { p: number; t: number; band: Band; cause?: Reason };
}

/** What `tickWorld` needs of a game. `Game` satisfies it; so does the harness's bare host. */
export interface WorldHost {
  seed: number;
  /** When the world was last ticked; null until the first call. */
  worldT: number | null;
  ports: Record<string, PortState>;
  markets: Markets;
  trade: TradeState;
  feitorias: Feitoria[];
  visitedPorts?: Set<string>;
  /** The lane sim's memory (world/lanes). Made on first use. */
  lanes?: LaneState;
  /** How well the coast between two points is known, as a multiplier on a lane's risk (Game.laneRisk). Absent: 1. */
  laneRisk?: (from: LatLon, to: LatLon) => number;
  /** Contracts posted by quays and not yet signed (world/contracts), and the next id. */
  postings?: PortContract[];
  nextContractId?: number;
  /** What the captain carries with the weigh-house (economy/contraband). */
  heat?: HeatState;
  /** The other captain, whose house trades in the lane sim (progression/rivalHouse). */
  rival?: RivalState;
  /** Something the rival's house did that the captain is owed a line on ('undercut': he sold into a lane the house works). */
  rivalEvent?: (kind: 'undercut', portId: string, goodId: string) => void;
  /** A quiet line for the log (only said for a port the captain knows). */
  worldNote?: (portId: string, text: string) => void;
}

// ---------------------------------------------------------------------------
// The numbers

/** +P a month when traffic is at or above baseline and nothing is wrong. */
export const GROWTH = 0.015;
/** -P a month under war, blockade, plague or famine. */
export const BLIGHT = 0.03;
/** Share of the distance back to the port's anchor that decay closes each month. */
export const DECAY = 0.06;
/** A quay or fort raises the anchor P decays toward, per level. */
export const ANCHOR_QUAY = 0.05;
export const ANCHOR_FORT = 0.03;
/** A fort takes this much off war and blockade damage, per level (3 levels: 60%). */
export const FORT_SHIELD = 0.2;
/** Funding: +0.10 x cap, scaled by port size and by headroom, so the player cannot pump a favourite port. */
export const FUND_FRACTION = 0.10;
export const FUND_SIZE: Record<PortDef['size'], number> = { anchorage: 1.5, village: 1.3, town: 1, city: 0.75, emporium: 0.55 };
export const MAX_CIVIC_LEVEL = 3;
/** Thresholds, with a little hysteresis so a port on the line does not log every month. */
export const THRIVING = 1.15;
export const STRUGGLING = 0.9;

export const clampP = (p: number): number => clamp(p, P_MIN, P_MAX);

export function newPortState(): PortState {
  return { prosperity: 1 };
}

/** The port's state, made on first use (the `??=` of the load boundary). */
export function portState(h: Pick<WorldHost, 'ports'>, portId: string): PortState {
  const s = (h.ports[portId] ??= newPortState());
  s.prosperity ??= 1;
  return s;
}

export function prosperityOf(h: Pick<WorldHost, 'ports'>, portId: string): number {
  return h.ports[portId]?.prosperity ?? 1;
}

export function anchorOf(s: PortState): number {
  return 1 + ANCHOR_QUAY * (s.quay ?? 0) + ANCHOR_FORT * (s.fort ?? 0);
}

export function bandOf(p: number, prev?: Band): Band {
  if (prev === 'thriving') return p >= THRIVING - 0.05 ? 'thriving' : p < STRUGGLING ? 'struggling' : 'ordinary';
  if (prev === 'struggling') return p < STRUGGLING + 0.05 ? 'struggling' : p >= THRIVING ? 'thriving' : 'ordinary';
  return p >= THRIVING ? 'thriving' : p < STRUGGLING ? 'struggling' : 'ordinary';
}

// ---------------------------------------------------------------------------
// Words

export function prosperityWord(b: Band): string {
  return b;
}

function causeText(def: PortDef, band: Band, cause: Reason | undefined): string {
  const name = def.name;
  switch (cause) {
    case 'traffic': return band === 'struggling' ? `few ships call at ${name}` : `${name}’s ships call often`;
    case 'fair': return `the fairs bring ${name} custom`;
    case 'house': return `your House keeps the quays at ${name} busy`;
    case 'boom': return `${name} is having a good season`;
    case 'quay': return `the new quay at ${name}`;
    case 'fort': return `the new fort at ${name} keeps the peace`;
    case 'war': return `war is hurting ${name}`;
    case 'blockade': return `${name} is blockaded`;
    case 'embargo': return `an embargo has closed ${name}’s trade`;
    case 'plague': return `plague has emptied ${name}’s quays`;
    case 'famine': return `famine in ${name}`;
    default: return band === 'ordinary' ? 'trade goes on as it always has' : band === 'thriving' ? `${name} has done well lately` : `${name} has fallen on hard times`;
  }
}

/** 'thriving: Lisbon’s ships call often'. */
export function prosperityLine(def: PortDef, band: Band, cause: Reason | undefined): string {
  return `${prosperityWord(band)}: ${causeText(def, band, cause)}`;
}

/** What the captain knows of a port: as it was when he last put in (never the truth of this month). Null if he has not been. */
export function seenProsperity(h: Pick<WorldHost, 'ports'>, portId: string): { band: Band; line: string; t: number } | null {
  const s = h.ports[portId]?.seen;
  if (!s) return null;
  return { band: s.band, line: prosperityLine(portDef(portId), s.band, s.cause), t: s.t };
}

/** Called when the captain puts in: he sees the port as it is. Counts as a call, for traffic. */
export function noteSeen(h: Pick<WorldHost, 'ports'>, portId: string, t: number): void {
  const s = portState(h, portId);
  s.band ??= bandOf(s.prosperity);
  s.seen = { p: Math.round(s.prosperity * 1000) / 1000, t, band: s.band, cause: s.cause };
  s.calls = Math.min((s.calls ?? 0) + 1, 3);
}

// ---------------------------------------------------------------------------
// Shocks to prosperity

/**
 * Something done to a port from outside: the Powers engine (C2) calls this for a blockade,
 * an embargo, a war, a succession fight; the tick calls it for the world's shocks.
 * A fort takes the edge off war and blockade. Returns the new P.
 */
export function prosperityShock(h: WorldHost, portId: string, delta: number, reason: Reason): number {
  const s = portState(h, portId);
  let d = delta;
  if (d < 0 && (reason === 'war' || reason === 'blockade')) d *= 1 - FORT_SHIELD * (s.fort ?? 0);
  s.prosperity = clampP(s.prosperity + d);
  s.cause = reason;
  settleBand(h, portId, s);
  return s.prosperity;
}

/**
 * The world's own shocks (economy/trade SHOCKS) that touch a port's health, by key.
 * Booms are traffic: ships come for the gold or the sugar. Ports are the ones in
 * the thick of it, not every port the price effect reaches.
 */
interface ShockEffect { reason: Reason; ports: string[]; boom?: boolean }
const SHOCK_EFFECTS: Record<string, ShockEffect> = {
  'lisbon-plague': { reason: 'plague', ports: ['lisboa'] },
  'kongo-famine': { reason: 'famine', ports: ['mpinda', 'luanda', 'benguela'] },
  'sahel-drought': { reason: 'famine', ports: ['arguim', 'portudal', 'cantor', 'cacheu'] },
  'gujarat-war': { reason: 'war', ports: ['cambaia', 'diu'] },
  'deccan-war': { reason: 'war', ports: ['goa', 'onor'] },
  'gold-caravans': { reason: 'boom', ports: ['mina', 'axim', 'acara'], boom: true },
  'sofala-fair': { reason: 'boom', ports: ['sofala', 'quiloa', 'mocambique'], boom: true },
  'sugar-boom': { reason: 'boom', ports: ['funchal'], boom: true },
};

// ---------------------------------------------------------------------------
// Funding a quay or a fort

export type Civic = 'quay' | 'fort';

export function civicLevel(h: Pick<WorldHost, 'ports'>, portId: string, kind: Civic): number {
  return h.ports[portId]?.[kind] ?? 0;
}

/**
 * What one funding would add to P right now: +0.10 x the cap, by port size (a small
 * place is moved by a quay; an emporium barely notices), by how much room is left
 * under the cap (headroom falls as P climbs), and by level (the third quay is the
 * smallest). A fort does two thirds of what a quay does and also shields.
 */
export function civicGain(h: Pick<WorldHost, 'ports'>, portId: string, kind: Civic): number {
  const s = h.ports[portId];
  const p = s?.prosperity ?? 1;
  const level = s?.[kind] ?? 0;
  if (level >= MAX_CIVIC_LEVEL) return 0;
  const headroom = clamp((P_MAX - p) / (P_MAX - 1), 0, 1);
  const base = FUND_FRACTION * P_MAX * FUND_SIZE[portDef(portId).size] * (kind === 'quay' ? 1 : 0.67);
  return base * headroom * [1, 0.8, 0.6][level];
}

/** Record a quay or fort paid for (the cost is the caller's: see progression/network `fundCivic`). Returns the gain in P. */
export function fundedCivic(h: WorldHost, portId: string, kind: Civic): number {
  const s = portState(h, portId);
  const gain = civicGain(h, portId, kind);
  s[kind] = Math.min(MAX_CIVIC_LEVEL, (s[kind] ?? 0) + 1);
  const before = s.prosperity;
  s.prosperity = clampP(s.prosperity + gain);
  s.cause = kind;
  settleBand(h, portId, s);
  // The captain is standing in the place he paid for: he sees it.
  if (s.seen) s.seen = { ...s.seen, p: s.prosperity, band: s.band ?? s.seen.band, cause: s.cause };
  return s.prosperity - before;
}

// ---------------------------------------------------------------------------
// Lanes: the interface D1 fills

export interface LaneContext {
  host: WorldHost;
  /** The end of the month being run. */
  t: number;
  months: number;
}

export interface LaneResult {
  /**
   * Per port: this month's traffic against its baseline (1 = as usual). A port absent from the
   * map has no lane data, and is taken as neutral: it neither grows nor shrinks on traffic.
   * D1 moves goods itself through `host.markets.addStock` / `markets.sell` on the ports it touches.
   */
  traffic: Record<string, number>;
}

export type LaneModel = (ctx: LaneContext) => LaneResult;

/** The stub: used until `world/lanes` is loaded. */
const noLanes: LaneModel = () => ({ traffic: {} });
let laneModel: LaneModel = noLanes;

/**
 * Things that run once a month after the markets and prosperity have moved: the Powers engine (world/powers)
 * registers here, once, at module load. A host that carries nothing for a hook to act on is left alone.
 */
export type MonthHook = (h: WorldHost, t: number) => void;
const monthHooks: MonthHook[] = [];
export function onMonth(hook: MonthHook): void {
  if (!monthHooks.includes(hook)) monthHooks.push(hook);
}

/** D1 installs its lane model here (once, at module load). */
export function setLaneModel(m: LaneModel | null): void {
  laneModel = m ?? noLanes;
}

// ---------------------------------------------------------------------------
// The tick

function settleBand(h: WorldHost, portId: string, s: PortState): void {
  const was = s.band;
  const now = bandOf(s.prosperity, was);
  s.band = now;
  if (was && was !== now && h.worldNote) {
    const def = portDef(portId);
    h.worldNote(portId, `${def.name} is ${now} now (${causeText(def, now, s.cause)}).`);
  }
}

function stepMonth(h: WorldHost, t: number): void {
  const date = dateFromDays(Math.floor(t / 86400));
  // The world's shocks are rolled here rather than only when the captain is in port, so that what has
  // happened is in the world whether or not anyone is looking. Its own generator: the tick never draws on the game's.
  rollShocks(h.trade, t, date.year, Rng.fromString(`world:${h.seed}:${Math.floor(t / MONTH)}`));

  // 1. Production.
  for (const p of PORTS) h.markets.produce(p.id, t);
  // 2. Lanes.
  const lanes = laneModel({ host: h, t, months: 1 });
  // 3. Consumption.
  for (const p of PORTS) h.markets.consume(p.id, t);

  // Then prosperity moves, and shows in the markets from next month.
  const live = h.trade.shocks.filter((x) => t >= x.start && t <= x.end);
  for (const def of PORTS) {
    const s = portState(h, def.id);
    let blight = 0;
    let blightReason: Reason | null = null;
    let boom = false;
    for (const x of live) {
      const e = SHOCK_EFFECTS[x.key];
      if (!e || !e.ports.includes(def.id)) continue;
      if (e.boom) boom = true;
      else { blight += BLIGHT; blightReason = e.reason; }
    }
    // Traffic against baseline: the lanes' word, and what the port has of its own.
    const known = lanes.traffic[def.id];
    let ratio = known ?? 1;
    let because: Reason = 'traffic';
    if (fairsAt(def.id, date.month).length > 0) { ratio *= 1.15; if (known === undefined) because = 'fair'; }
    if (boom) { ratio *= 1.25; if (known === undefined) because = 'boom'; }
    const house = h.feitorias.find((f) => f.portId === def.id && !f.lost);
    if (house) { ratio *= 1 + 0.12 * house.ability; if (known === undefined && because === 'traffic') because = 'house'; }
    if (s.calls) { ratio *= 1 + 0.1 * s.calls; s.calls = 0; }
    const grows = known !== undefined ? ratio >= 1 : ratio > 1;

    let p = s.prosperity;
    if (blight > 0) {
      // A fort takes the edge off war; nothing helps against plague or famine.
      const shield = blightReason === 'war' || blightReason === 'blockade' ? 1 - FORT_SHIELD * (s.fort ?? 0) : 1;
      p -= blight * shield;
      s.cause = blightReason ?? 'other';
    } else if (grows) {
      p += GROWTH;
      s.cause = because;
    }
    const anchor = anchorOf(s);
    p += (anchor - p) * DECAY;
    s.prosperity = clampP(p);
    // Back at its anchor with nothing pushing: no cause worth naming.
    if (blight === 0 && !grows && Math.abs(s.prosperity - anchor) < 0.03) s.cause = undefined;
    settleBand(h, def.id, s);
  }
  for (const hook of monthHooks) hook(h, t);
}

/** Run `months` monthly ticks from where the world was last left. */
export function tickWorld(h: WorldHost, months: number): void {
  if (h.worldT === null) return;
  const n = Math.min(Math.max(0, Math.floor(months)), MAX_CATCH_UP);
  for (let i = 0; i < n; i++) {
    h.worldT += MONTH;
    stepMonth(h, h.worldT);
  }
}

/**
 * The game loop's hook: run whatever whole months have passed since the world was last
 * ticked. Cheap when none have. A gap beyond `MAX_CATCH_UP` months (a very old save, a
 * cheat) is run for the last stretch only.
 */
export function tickWorldDue(h: WorldHost, now: number): void {
  if (h.worldT === null) { h.worldT = now; return; }
  const due = Math.floor((now - h.worldT) / MONTH);
  if (due <= 0) return;
  if (due > MAX_CATCH_UP) h.worldT += (due - MAX_CATCH_UP) * MONTH;
  tickWorld(h, Math.min(due, MAX_CATCH_UP));
}
