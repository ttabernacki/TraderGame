import { clamp } from '../../core/math';
import { Rng } from '../../core/rng';
import type { Entry } from '../../ledger/ledger';
import { MONTH as WORLD_MONTH, onMonth, prosperityShock, type WorldHost } from '../tick';
import { PORT_BY_ID } from '../ports';
import {
  ERA, MONTH, activeEffects, enemiesOf, friendsOf, initAt, powerOfName, pull, relay, shockTime, stageOfPoints, pointsOf,
} from './core';
import { FRONTS, SCHEDULE } from './data';
import { ATTITUDES, FRONT_DELTAS, type AttitudeRow, type FrontRow } from './deltas';
import { goldTick } from './gold';
import { kongoTick } from './kongo';
import { type Ctx, yearOf } from './moves';
import { kilwaTick, melindeTick, mombasaTick } from './swahili';
import { calicutTick, cochinTick, gujaratTick } from './malabar';
import { mamlukTick } from './crescent';
import { beninTick, sahelTick } from './stubs';
import { castileTick } from './race';
import { conflictsTick } from './conflicts';
import { declareReader } from './modifiers';
import { announce, hearAt, resolveDue, type Heard } from './rumours';
import { FRONT_IDS, type FrontId, type PowerId, type PowersState, type Rumour } from './types';

/**
 * The monthly Powers tick (BUILD_PLAN C2). It registers once with world/tick; a host that carries no
 * `powers` state is untouched, which is why the econ and tick harnesses are exactly as they were.
 *
 * Each month, in order:
 *   1. fold the Ledger entries made since last time into the Fronts (levers) and the Powers' attitudes;
 *   2. apply the dated shocks that have come due (history enters the Fronts here);
 *   3. let each ticking Front drift along its history line, and each effect blight the ports it names;
 *   4. let the Powers that move, move (Kongo), and the Gold have its fever;
 *   5. announce what changed as rumours, and let the old ones resolve.
 * Randomness is a generator seeded from the game's seed and the month, never the game's own: a stretch
 * of twelve months ticked at once is the same as twelve ticked singly.
 */

export interface PowersHost extends WorldHost {
  powers?: PowersState;
  /** The Ledger (Game.ledger). Absent in a bare harness world. */
  ledger?: Entry[];
  /** The chronicle (Game.chronicle): the act, read once, to fix the Rule when Act V opens. Absent in a bare harness world. */
  chronicle?: { act: number };
  /** A quiet line for the player (Game.powersNote). */
  powersNote?: (text: string) => void;
}

declareReader('scenes.traffic');

// ---------------------------------------------------------------------------------------------
// Folding the Ledger

const FRONT_ROWS = new Map<string, FrontRow[]>();
for (const r of FRONT_DELTAS) FRONT_ROWS.set(r.tag, [...(FRONT_ROWS.get(r.tag) ?? []), r]);
const ATT_ROWS = new Map<string, AttitudeRow[]>();
for (const r of ATTITUDES) ATT_ROWS.set(r.tag, [...(ATT_ROWS.get(r.tag) ?? []), r]);

function rowMatches(r: FrontRow, e: Entry): boolean {
  if (!r.where && !r.about) return true;
  if (r.where && (r.where.includes(e.place) || r.where.includes(e.target))) return true;
  if (r.about && (r.about.includes(e.target) || r.about.includes(e.place))) return true;
  // 'about' also matches a polity through the port the act was done at.
  if (r.about && e.place) { const p = powerOfName(e.place); if (p && r.about.includes(p)) return true; }
  return false;
}

/** The effect on the captain's own levers: how many times each has been pulled, for the scenes. */
function countLever(st: PowersState, e: Entry): void {
  const t = st.fronts.traffic.pulled;
  if (e.tag === 'traffic.carried') t.push++;
  else if (e.tag === 'traffic.refused') t.brake++;
  else if (e.tag === 'hearing.contested') t.contest++;
}

/** Apply one Ledger entry to the Fronts and the Powers' attitudes. Returns what it did, for the tests. */
export function foldEntry(st: PowersState, e: Entry): { fronts: Partial<Record<FrontId, number>>; powers: Partial<Record<PowerId, number>> } {
  const out = { fronts: {} as Partial<Record<FrontId, number>>, powers: {} as Partial<Record<PowerId, number>> };
  countLever(st, e);
  for (const r of FRONT_ROWS.get(e.tag) ?? []) {
    if (!rowMatches(r, e)) continue;
    // The Rule sets when Act V opens: what the captain does after that counts a third as much.
    const set = r.front === 'rule' && st.rule?.lockedAt !== undefined && e.t > st.rule.lockedAt ? 0.35 : 1;
    const d = r.delta * set * (r.scale === 'magnitude' ? Math.max(0, e.magnitude) : 1);
    if (d === 0) continue;
    out.fronts[r.front] = (out.fronts[r.front] ?? 0) + pull(st, r.front, d);
  }
  for (const r of ATT_ROWS.get(e.tag) ?? []) {
    const p = r.power === 'target' ? (powerOfName(e.target) ?? powerOfName(e.place)) : r.power;
    if (!p) continue;
    const d = r.w * clamp(e.magnitude, 0.2, 1);
    const move = (id: PowerId, v: number): void => {
      const s = st.powers[id];
      const before = s.attitude;
      s.attitude = clamp(s.attitude + v, -1, 1);
      out.powers[id] = (out.powers[id] ?? 0) + (s.attitude - before);
    };
    move(p, d);
    if (r.spread) {
      for (const f of friendsOf(st, p)) move(f, d * 0.5);
      for (const f of enemiesOf(st, p)) move(f, -d * 0.3);
    }
  }
  return out;
}

/** Fold every entry not yet folded. Safe to call at any time; idempotent. */
export function foldLedger(h: PowersHost): void {
  const st = h.powers;
  const led = h.ledger;
  if (!st || !led) return;
  // An heir's Ledger is a shorter, faded one: refold what there is rather than skip ahead of it.
  if (st.cursor > led.length) st.cursor = 0;
  for (; st.cursor < led.length; st.cursor++) foldEntry(st, led[st.cursor]);
}

// ---------------------------------------------------------------------------------------------
// The month

function stageChange(h: PowersHost, st: PowersState, id: FrontId, t: number, rng: Rng): void {
  const f = st.fronts[id];
  const def = FRONTS[id];
  const was = f.stage;
  const now = stageOfPoints(pointsOf(f), was);
  if (now === was) return;
  f.stage = now;
  f.since = t;
  f.log.push({ t, stage: now, why: now > was ? 'The process went on.' : 'It eased.' });
  if (f.log.length > 20) f.log.shift();
  const place = id === 'traffic' || id === 'gold' ? 'mina' : id === 'court' || id === 'claim' ? 'lisboa' : id === 'crescent' ? 'adem' : 'melinde';
  announce(st, rng, t, {
    event: `front:${id}:${now}`, place, front: id, window: 10,
    truth: { claim: `${def.name}: ${def.stages[now - 1].name}. ${def.stages[now - 1].line}`, vague: `${def.name} is not what it was.` },
    stale: { claim: `${def.name}: ${def.stages[was - 1].name}. ${def.stages[was - 1].line}`, vague: `${def.name} goes on as it did.` },
  });
  h.powersNote?.(`${def.name}: ${def.stages[now - 1].name}.`);
}

function applyShocks(st: PowersState, t: number, rng: Rng): void {
  for (const s of SCHEDULE) {
    if (st.shocksDone.includes(s.id)) continue;
    const due = shockTime(s.id);
    if (due === null || due > t) continue;
    st.shocksDone.push(s.id);
    // A dormant Front takes no history in this build; its data is written and its clock is held.
    if (s.front && FRONTS[s.front].ticks) st.fronts[s.front].base += s.delta ?? 0;
    if (s.power && s.attitude) st.powers[s.power].attitude = clamp(st.powers[s.power].attitude + s.attitude, -1, 1);
    announce(st, rng, t, {
      event: `history:${s.id}`, place: s.place ?? 'lisboa', power: s.power, front: s.front, window: 10,
      truth: { claim: s.text, vague: s.text.split('.')[0] + '.' },
    });
  }
}

/** One month of the Powers. The hook world/tick calls. */
export function powersMonth(host: WorldHost, t: number): void {
  const h = host as PowersHost;
  const st = h.powers;
  if (!st) return;
  if (st.lastMonth < 0) initAt(st, t - WORLD_MONTH);
  else if ((st.era ?? 1) < ERA) relay(st, t - WORLD_MONTH);
  const idx = Math.floor(t / MONTH);
  if (idx <= st.lastMonth) return;
  st.lastMonth = idx;
  foldLedger(h);
  const rng = Rng.fromString(`powers:${h.seed}:${idx}`);

  applyShocks(st, t, rng);

  for (const id of FRONT_IDS) {
    const def = FRONTS[id];
    if (!def.ticks) continue;
    st.fronts[id].base += def.perYear / 12;
  }
  // Attitudes ease back toward indifference: a court forgives, and forgets, slowly.
  for (const p of Object.values(st.powers)) p.attitude *= 0.985;

  kongoTick(st, t, rng, { note: (text) => h.powersNote?.(text) });
  // The courts of the Indian Ocean, the Crescent, and the lighter stubs. Each draws from its own generator.
  const year = yearOf(t);
  const ctx = (id: string): Ctx => ({ st, t, rng: Rng.fromString(`powers:${h.seed}:${idx}:${id}`), year, note: (text) => h.powersNote?.(text) });
  mombasaTick(ctx('mombasa')); melindeTick(ctx('melinde')); kilwaTick(ctx('kilwa'));
  calicutTick(ctx('calicut')); cochinTick(ctx('cochin')); gujaratTick(ctx('gujarat'));
  mamlukTick(ctx('mamluk')); castileTick(ctx('castile')); beninTick(ctx('benin')); sahelTick(ctx('sahel'));
  goldTick(ctx('gold')); conflictsTick(ctx('conflicts'));
  // Act V opening fixes the Rule at the stage the captain's conduct (and the coast's history) had made it.
  if ((h.chronicle?.act ?? 0) >= 5 && st.rule && st.rule.lockedAt === undefined) {
    st.rule.lockedAt = t;
    st.rule.stage = st.fronts.rule.stage;
  }

  for (const id of FRONT_IDS) if (FRONTS[id].ticks) stageChange(h, st, id, t, rng);

  // Effects blight the ports they name, once a month, through the one door prosperity has.
  for (const e of activeEffects(st, t)) {
    if (!e.blight) continue;
    const reason = e.kind === 'embargo' ? 'embargo' : e.kind === 'blockade' ? 'blockade' : e.kind === 'war' ? 'war' : 'other';
    for (const port of e.ports) if (PORT_BY_ID.has(port)) prosperityShock(h, port, -e.blight, reason);
  }
  // A stage that makes a place richer or poorer does it a little each month.
  for (const id of FRONT_IDS) {
    const stage = st.fronts[id].stage;
    for (const fx of FRONTS[id].effects) {
      if (!fx.prosperity || stage < fx.minStage || (fx.maxStage !== undefined && stage > fx.maxStage)) continue;
      for (const port of fx.ports) if (PORT_BY_ID.has(port)) prosperityShock(h, port, fx.prosperity, fx.prosperity > 0 ? 'boom' : 'other');
    }
  }

  resolveDue(st, t);
  st.effects = st.effects.filter((e) => t - e.end < 12 * MONTH);
}

onMonth(powersMonth);

// ---------------------------------------------------------------------------------------------
// The player's side: arriving at a port

export interface Arrival { heard: Heard[]; settled: Rumour[] }

/** The ship is in port: what has reached it is heard, what is there to see is seen. */
export function arriveAt(h: PowersHost, port: string, t: number): Arrival {
  const st = h.powers;
  if (!st) return { heard: [], settled: [] };
  return hearAt(st, port, t);
}

/** Where the Fronts the captain has stood in are, as he last saw them (for the Book's 'what you have seen'). */
export const FRONT_PORTS: Record<FrontId, string[]> = {
  traffic: ['arguim', 'mina', 'mpinda', 'sao-tome-porto', 'ugoton'],
  gold: ['mina', 'axim', 'acara'],
  claim: [], crescent: ['adem', 'cambaia'], rule: ['calecute', 'quiloa', 'melinde'], court: [],
};

