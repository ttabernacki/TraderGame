import { clamp } from '../../core/math';
import { daysFromEpoch } from '../../core/clock';
import { POLITIES, POLITY_BY_ID, polityOfPort } from '../../diplomacy/polities';
import { portDef } from '../ports';
import { FRONTS, POWERS, POWER_OF_POLITY, SCHEDULE, shockDate } from './data';
import {
  FRONT_IDS, MAX_POINTS, POINTS_PER_STAGE, POWER_IDS,
  type Effect, type FrontId, type FrontState, type PowerId, type PowerState, type PowersState,
} from './types';

/**
 * The state the Powers engine keeps and the small operations on it. No rules of the world live here;
 * those are in engine.ts, kongo.ts, gold.ts and modifiers.ts.
 */

export const DAY = 86400;
export const YEAR = 365.25 * DAY;
export const MONTH = 30 * DAY;
/** The career's first day (campaigns/carreira): the history line is measured from here. */
export const START_T = daysFromEpoch(1482, 7, 12) * DAY;

export function stageOfPoints(points: number, prev?: number): 1 | 2 | 3 | 4 {
  const raw = Math.min(4, 1 + Math.floor(clamp(points, 0, MAX_POINTS - 1e-9) / POINTS_PER_STAGE)) as 1 | 2 | 3 | 4;
  if (prev === undefined || raw === prev) return raw;
  // A little hysteresis so a Front on the line does not flicker (and does not announce itself every month).
  const edge = raw > prev ? (prev * POINTS_PER_STAGE) + 0.1 : ((prev - 1) * POINTS_PER_STAGE) - 0.1;
  if (raw > prev ? points >= edge : points < edge) return raw;
  return prev as 1 | 2 | 3 | 4;
}

export const pointsOf = (f: FrontState): number => clamp(f.base + f.offset, 0, MAX_POINTS);

export function newFront(id: FrontId): FrontState {
  const def = FRONTS[id];
  return { base: def.start, offset: 0, stage: stageOfPoints(def.start), since: 0, log: [], pulled: { push: 0, brake: 0, contest: 0 } };
}

/** Which Power a polity (or the Crown) speaks through. */
export const powerOfPolity = (polity: string): PowerId | null => (polity === 'portugal' ? 'crown' : POWER_OF_POLITY.get(polity) ?? null);

/** Which Power a Ledger target or place belongs to: a polity id, a port, 'portugal', or a Power id itself. */
export function powerOfName(name: string): PowerId | null {
  if (!name) return null;
  if (name === 'portugal' || name === 'the Crown') return 'crown';
  if ((POWER_IDS as string[]).includes(name)) return name as PowerId;
  if (POLITY_BY_ID.has(name)) return powerOfPolity(name);
  try {
    const pol = polityOfPort(name);
    if (pol) return powerOfPolity(pol.id);
    if (portDef(name).people === 'portuguese') return 'crown';
  } catch { /* not a port */ }
  return null;
}

/** Relations between Powers, seeded from the allies and feuds already written for the polities. */
export function seedRelations(): Record<PowerId, Partial<Record<PowerId, number>>> {
  const rel = {} as Record<PowerId, Partial<Record<PowerId, number>>>;
  for (const id of POWER_IDS) rel[id] = {};
  const set = (a: PowerId, b: PowerId, v: number): void => {
    if (a === b) return;
    const keep = (x: number | undefined): number => (x === undefined ? v : Math.abs(v) >= Math.abs(x) ? v : x);
    rel[a][b] = keep(rel[a][b]);
    rel[b][a] = keep(rel[b][a]);
  };
  for (const pol of POLITIES) {
    const a = powerOfPolity(pol.id);
    if (!a) continue;
    for (const ally of pol.allies) { const b = powerOfPolity(ally); if (b) set(a, b, 0.6); }
    for (const foe of pol.feuds) { const b = powerOfPolity(foe); if (b) set(a, b, -0.6); }
  }
  return rel;
}

export function newPower(id: PowerId, rel: Partial<Record<PowerId, number>>): PowerState {
  const def = POWERS.find((p) => p.id === id)!;
  const s: PowerState = { attitude: 0, intent: def.intent, intentUntil: 0, relations: { ...rel }, moves: [], flags: {} };
  if (id === 'kongo') s.balance = 0;
  return s;
}

export function newPowers(): PowersState {
  const fronts = {} as Record<FrontId, FrontState>;
  for (const id of FRONT_IDS) fronts[id] = newFront(id);
  const rel = seedRelations();
  const powers = {} as Record<PowerId, PowerState>;
  for (const id of POWER_IDS) powers[id] = newPower(id, rel[id]);
  return {
    v: 1, fronts, powers, effects: [], rumours: [], parcels: [], local: { state: 'unmet' }, localRule: { state: 'unmet' }, rule: {},
    cursor: 0, shocksDone: [], seen: {}, nextId: 1, lastMonth: -1, era: ERA,
  };
}

/** The edition of the history line this build lays the Fronts on. */
export const ERA = 2;

/**
 * Re-lay the Fronts' history clocks on this edition's line: start, the drift to `t`, and every dated shock already
 * applied. What the captain and the Powers have done (the offset) is kept; stages are set without announcing them.
 */
export function relay(st: PowersState, t: number): void {
  for (const id of FRONT_IDS) {
    const f = st.fronts[id];
    const def = FRONTS[id];
    if (!def.ticks) continue;
    let base = def.start + def.perYear * Math.max(0, (t - START_T) / YEAR);
    for (const s of SCHEDULE) if (st.shocksDone.includes(s.id) && s.front === id) base += s.delta ?? 0;
    f.base = base;
    f.stage = stageOfPoints(pointsOf(f));
  }
  st.era = ERA;
}

/** Fill whatever a saved state lacks (the `??=` of the load boundary) and drop what is malformed. */
export function migratePowers(raw: unknown): PowersState {
  const base = newPowers();
  if (!raw || typeof raw !== 'object') return base;
  const d = raw as Partial<PowersState>;
  for (const id of FRONT_IDS) {
    const f = d.fronts?.[id];
    if (f && typeof f.base === 'number' && typeof f.offset === 'number') {
      base.fronts[id] = { ...base.fronts[id], ...f, pulled: { ...base.fronts[id].pulled, ...(f.pulled ?? {}) }, log: Array.isArray(f.log) ? f.log : [] };
    }
  }
  for (const id of POWER_IDS) {
    const p = d.powers?.[id];
    if (p && typeof p.attitude === 'number') {
      base.powers[id] = {
        ...base.powers[id], ...p,
        relations: { ...base.powers[id].relations, ...(p.relations ?? {}) },
        moves: Array.isArray(p.moves) ? p.moves : [], flags: { ...(p.flags ?? {}) },
      };
    }
  }
  base.effects = Array.isArray(d.effects) ? d.effects.filter((e) => e && typeof e.end === 'number') : [];
  base.rumours = Array.isArray(d.rumours) ? d.rumours.filter((r) => r && typeof r.born === 'number') : [];
  base.parcels = Array.isArray(d.parcels) ? d.parcels.filter((p) => p && typeof p.n === 'number') : [];
  base.local = { ...base.local, ...(d.local ?? {}) };
  base.localRule = { state: 'unmet', ...(d.localRule ?? {}) };
  base.rule = { ...(d.rule ?? {}) };
  base.cursor = typeof d.cursor === 'number' ? d.cursor : 0;
  base.shocksDone = Array.isArray(d.shocksDone) ? d.shocksDone : [];
  base.seen = d.seen && typeof d.seen === 'object' ? d.seen : {};
  base.nextId = typeof d.nextId === 'number' ? d.nextId : 1;
  base.lastMonth = typeof d.lastMonth === 'number' ? d.lastMonth : -1;
  base.era = typeof d.era === 'number' ? d.era : 1;
  return base;
}

// ---------------------------------------------------------------------------------------------
// The history schedule, measured from the career's first day

export interface HistoryDates { id: string; year: number; month: number }
let historySource: (() => HistoryDates[]) | null = null;
/** The chronicle's dated events (progression/chronicle HISTORY), given to the engine once at load. */
export function setHistorySource(f: (() => HistoryDates[]) | null): void { historySource = f; }
export const historyDates = (): HistoryDates[] => historySource?.() ?? [];

/** Time (seconds) a shock is due, or null if its history date is not known. */
export function shockTime(id: string): number | null {
  const s = SCHEDULE.find((x) => x.id === id);
  if (!s) return null;
  const d = shockDate(s, historyDates());
  return d ? daysFromEpoch(d.year, d.month, 1) * DAY : null;
}

/** Set a state up on its first tick, wherever in history that is: the history line up to the day, shocks already past applied. */
export function initAt(st: PowersState, t: number): void {
  for (const id of FRONT_IDS) {
    const f = st.fronts[id];
    const def = FRONTS[id];
    // A dormant Front's clock is held at its start in this build: its data is written, its history not yet run.
    f.base = def.ticks ? def.start + def.perYear * Math.max(0, (t - START_T) / YEAR) : def.start;
    f.since = t;
  }
  for (const s of SCHEDULE) {
    const due = shockTime(s.id);
    if (due === null || due > t) continue;
    st.shocksDone.push(s.id);
    if (s.front && FRONTS[s.front].ticks) st.fronts[s.front].base += s.delta ?? 0;
    if (s.power && s.attitude) st.powers[s.power].attitude = clamp(st.powers[s.power].attitude + s.attitude, -1, 1);
  }
  for (const id of FRONT_IDS) st.fronts[id].stage = stageOfPoints(pointsOf(st.fronts[id]));
  st.lastMonth = Math.floor(t / MONTH);
  st.era = ERA;
}

// ---------------------------------------------------------------------------------------------
// Effects

export function addEffect(st: PowersState, e: Omit<Effect, 'id'>): Effect {
  const eff: Effect = { ...e, id: st.nextId++ };
  st.effects.push(eff);
  return eff;
}

export const activeEffects = (st: PowersState, t: number): Effect[] => st.effects.filter((e) => e.start <= t && t < e.end);
export const hasActive = (st: PowersState, power: PowerId, kind: Effect['kind'], t: number): boolean =>
  st.effects.some((e) => e.power === power && e.kind === kind && e.start <= t && t < e.end);

/** Move a Front's offset from the history line, within what the captain can do against a great process. */
export function pull(st: PowersState, front: FrontId, delta: number): number {
  const f = st.fronts[front];
  const def = FRONTS[front];
  const before = f.offset;
  f.offset = clamp(f.offset + delta, def.offsetMin, def.offsetMax);
  return f.offset - before;
}

export const frontStageName = (st: PowersState, id: FrontId): string => FRONTS[id].stages[st.fronts[id].stage - 1].name;

/** The Powers a Power counts as friends (relation >= 0.5) and enemies (<= -0.5). */
export function friendsOf(st: PowersState, id: PowerId): PowerId[] {
  return POWER_IDS.filter((o) => o !== id && (st.powers[id].relations[o] ?? 0) >= 0.5);
}
export function enemiesOf(st: PowersState, id: PowerId): PowerId[] {
  return POWER_IDS.filter((o) => o !== id && (st.powers[id].relations[o] ?? 0) <= -0.5);
}
