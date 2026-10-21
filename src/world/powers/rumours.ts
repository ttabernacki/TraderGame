import { NM, clamp, haversine } from '../../core/math';
import { Rng } from '../../core/rng';
import { TRUNK } from '../../progression/road';
import type { Fact } from '../../knowledge/information';
import { PORT_BY_ID, anchorageOf, portDef } from '../ports';
import { DAY, MONTH } from './core';
import type { FrontId, PowerId, PowersState, Rumour, Truth } from './types';

/**
 * The rumour mill (BUILD_PLAN C2, decision D3).
 *
 * Every event a Power or a Front makes is announced as up to three rumours: what happened (true), what
 * was so a few months ago and is still going about (stale), and what a man who stood to gain said
 * happened (false). They travel the road, a port a month in either direction, losing some of what they
 * said at every hop. The captain hears them at the ports he puts into. What he is shown is the claim,
 * who told it, how old it is and how far it is worth believing, and never which of the three it is:
 * that comes out on arrival at the place, or from a second informer.
 */

export const MAX_HOPS = 9;
/** What one hop leaves of a rumour, by the kind of teller (the reliable teller is the safer one, not the true one). */
const TELLERS: { who: string; fidelity: number; kind: 'politics' | 'rumour' }[] = [
  { who: 'a factor’s clerk', fidelity: 0.93, kind: 'politics' },
  { who: 'a pilot', fidelity: 0.92, kind: 'politics' },
  { who: 'the master of a coasting vessel', fidelity: 0.88, kind: 'politics' },
  { who: 'a broker on the quay', fidelity: 0.86, kind: 'rumour' },
  { who: 'a seaman off the last ship', fidelity: 0.84, kind: 'rumour' },
  { who: 'a man in a wine shop', fidelity: 0.78, kind: 'rumour' },
];

export interface Telling { claim: string; vague: string }

export interface Announcement {
  /** The event, by name, for the record. */
  event: string;
  place: string;
  power?: PowerId;
  front?: FrontId;
  /** What happened. */
  truth: Telling;
  /** What was so before, if there was a before worth going stale. */
  stale?: Telling;
  /** What a man who gained by it would say. */
  falsehood?: Telling;
  /** Months it keeps going about. */
  window: number;
}

export const P_STALE = 0.45;
export const P_FALSE = 0.25;

// -- The road ---------------------------------------------------------------

const trunkCache = new Map<string, { i: number; off: number }>();
function trunkPos(port: string): { i: number; off: number } {
  const hit = trunkCache.get(port);
  if (hit) return hit;
  const at = TRUNK.indexOf(port);
  let pos: { i: number; off: number };
  if (at >= 0) pos = { i: at, off: 0 };
  else {
    let best = { i: 0, d: Infinity };
    const here = anchorageOf(portDef(port));
    TRUNK.forEach((id, i) => {
      const d = haversine(here, anchorageOf(portDef(id))) / NM;
      if (d < best.d) best = { i, d };
    });
    pos = { i: best.i, off: 1 };
  }
  trunkCache.set(port, pos);
  return pos;
}

/** Ports between two places on the road, counting a side-trip off it as one more. */
export function hops(a: string, b: string): number {
  if (a === b) return 0;
  const pa = trunkPos(a), pb = trunkPos(b);
  return Math.abs(pa.i - pb.i) + pa.off + pb.off;
}

// -- Making and moving them ------------------------------------------------------

function make(st: PowersState, rng: Rng, t: number, a: Announcement, truth: Truth, tell: Telling, bornAgo: number): Rumour {
  const teller = truth === 'false' && rng.chance(0.5) ? TELLERS[TELLERS.length - 1 - rng.int(0, 2)] : rng.pick(TELLERS);
  return {
    id: st.nextId++, event: a.event, power: a.power, front: a.front, place: a.place,
    claim: tell.claim, vague: tell.vague, kind: teller.kind, teller: teller.who,
    born: t - bornAgo, truth, fidelity: teller.fidelity,
    window: a.window + Math.ceil(bornAgo / MONTH),
  };
}

/** Announce an event: the true rumour, and perhaps a stale and a false one beside it. */
export function announce(st: PowersState, rng: Rng, t: number, a: Announcement): Rumour[] {
  const made: Rumour[] = [make(st, rng, t, a, 'true', a.truth, 0)];
  // The stale one began months ago, so it is already several ports out when the truth is first spoken.
  if (a.stale && rng.chance(P_STALE)) made.push(make(st, rng, t, a, 'stale', a.stale, rng.range(2, 5) * MONTH));
  if (a.falsehood && rng.chance(P_FALSE)) made.push(make(st, rng, t, a, 'false', a.falsehood, rng.range(0, 2) * MONTH));
  st.rumours.push(...made);
  return made;
}

/** The share of a rumour that survives the road to a port. */
export const fidelityAt = (r: Rumour, port: string): number => Math.pow(r.fidelity, hops(r.place, port));

/** Whether the rumour has had time to reach a port. A stale or false one is not heard where it began: there it is just wrong. */
export function reaches(r: Rumour, port: string, t: number): boolean {
  const h = hops(r.place, port);
  if (h > MAX_HOPS) return false;
  if (h === 0 && r.truth !== 'true') return false;
  return t - r.born >= h * MONTH;
}

export interface Heard { rumour: Rumour; port: string }

/** The captain puts in at a port: whatever has reached it that he has not heard, he hears. And what he can see here, he sees. */
export function hearAt(st: PowersState, port: string, t: number): { heard: Heard[]; settled: Rumour[] } {
  const heard: Heard[] = [];
  const settled: Rumour[] = [];
  for (const r of st.rumours) {
    if (!r.heard && reaches(r, port, t)) {
      r.heard = { t, port, hops: hops(r.place, port) };
      heard.push({ rumour: r, port });
    }
    // On arrival at the place itself, he sees for himself.
    if (r.heard && !r.settled && port === r.place && t - r.born >= 2 * DAY) {
      r.settled = r.truth === 'true' ? 'borne out' : 'not borne out';
      r.resolved ??= r.truth;
      settled.push(r);
    }
  }
  return { heard, settled };
}

/** Monthly: rumours past their window resolve to what they were. Nothing is shown by this; it is the world settling its accounts. */
export function resolveDue(st: PowersState, t: number): number {
  let n = 0;
  for (const r of st.rumours) {
    if (r.resolved === undefined && t >= r.born + r.window * MONTH) { r.resolved = r.truth; n++; }
  }
  // Forget what nobody heard, long after; keep what the captain holds.
  if (st.rumours.length > 90) {
    const keep = st.rumours.filter((r) => r.heard || r.resolved === undefined || t - (r.born + r.window * MONTH) < 18 * MONTH);
    st.rumours = keep.length > 90 ? keep.slice(keep.length - 90) : keep;
  }
  return n;
}

// -- What the Book shows ---------------------------------------------------------

const where = (id: string): string => PORT_BY_ID.get(id)?.name ?? id;

export function sourceLine(r: Rumour): string {
  const h = r.heard?.hops ?? 0;
  if (r.via) return h <= 1 ? `${r.via}, out of ${where(r.place)}` : `${r.via}, who had it from ${where(r.place)}`;
  if (h <= 1) return `${r.teller}, out of ${where(r.place)}`;
  if (h <= 3) return `${r.teller}, who had it from ${where(r.place)}`;
  return `talk on the quay, passed on from as far as ${where(r.place)}`;
}

export function rumourFact(r: Rumour, now: number): Fact {
  const hopsHeard = r.heard?.hops ?? 0;
  const fid = Math.pow(r.fidelity, hopsHeard);
  const age = Math.max(0, (now - r.born) / DAY);
  const fade = clamp(1 - age / 360, 0.35, 1);
  let conf = clamp(fid * fade, 0.05, 0.95);
  if (r.checked === 'disputed') conf = Math.min(conf, 0.15);
  else if (r.checked === 'agrees') conf = clamp(conf + 0.2, 0.05, 0.95);
  if (r.settled) conf = r.settled === 'borne out' ? 0.97 : 0.04;
  return {
    id: `rumour:${r.id}`,
    kind: r.kind,
    claim: (fid >= 0.62 ? r.claim : r.vague) + (r.checked === 'disputed' ? ' A second informer has not heard it.' : ''),
    source: sourceLine(r),
    age,
    confidence: conf,
    place: r.place,
    checked: r.checked,
    sold: r.soldAt !== undefined,
    settled: r.settled,
    ref: { store: 'rumour', id: r.id },
  };
}

/** Every rumour the captain has heard, as Facts. */
export function rumourFacts(st: PowersState | undefined, now: number): Fact[] {
  return (st?.rumours ?? []).filter((r) => r.heard).map((r) => rumourFact(r, now));
}

/**
 * A second informer: asked about a rumour he may or may not have heard. He says what he has heard. A true
 * one is usually told again; a stale one only sometimes; a false one seldom. Settled by a seeded draw so asking
 * twice cannot be used to read the dice.
 */
export function secondOpinion(r: Rumour, seed: number): 'agrees' | 'disputed' {
  const p = r.truth === 'true' ? 0.9 : r.truth === 'stale' ? 0.3 : 0.12;
  return Rng.fromString(`second:${seed}:${r.id}`).chance(p) ? 'agrees' : 'disputed';
}
