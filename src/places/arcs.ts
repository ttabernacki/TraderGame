import type { SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';
import { deepPort } from './deep';
import { atLeast, patronOf, patronsIn } from './patron';
import type { ArcBeat, DeepPort } from './types';

/**
 * The Patron's personal arc: three or four beats, offered when his trust is deep (BUILD_PLAN C4, Pillar 5).
 *
 * The same machinery as the Traffic scenes (a `SeaEvent` put at the quay, answered, its choices writing the
 * Ledger). Nothing is stored but `powers.seen['place:<beat>']`, the time a beat was had. Each beat is offered
 * on a call at the port and is never required: skipping it loses only the beat. ROAD ORDER: a beat's reward
 * travels forward (a letter to a port further along), never back (`scripts/quarters.ts` checks this with
 * `road.ts: along()`).
 */

const DAY = 86400;
const hadAt = (g: Game, id: string): number | undefined => g.powers.seen[`place:${id}`];

/** Whether a beat may be offered now. */
export function beatOffered(g: Game, deep: DeepPort, b: ArcBeat): boolean {
  if (hadAt(g, b.id) !== undefined) return false;
  const who = patronsIn(deep).find((p) => p.id === b.patron) ?? deep.patron;
  if (!atLeast(patronOf(g, deep, who).stage, b.stage)) return false;
  const prior = (b.after ?? []).map((a) => hadAt(g, a));
  if (prior.some((t) => t === undefined)) return false;
  const last = prior.length ? Math.max(...(prior as number[])) : -Infinity;
  if (b.wait && g.clock.t - last < b.wait * DAY) return false;
  return b.needs ? b.needs(g) : true;
}

/** The beat offered at this port, if any, not yet marked put (the storylet engine's source). */
export function peekDeepBeat(g: Game, port: string | null): ArcBeat | null {
  const deep = deepPort(port);
  if (!deep) return null;
  const seen = g.powers.seen;
  for (const b of deep.arc) {
    const id = `place:${b.id}`;
    const fired = seen[`fired:${id}`];
    if (fired !== undefined) {
      if (g.pendingEvent?.id === id || g.pendingScenes.some((x) => x.id === id)) continue;
      delete seen[`fired:${id}`];
    }
    if (!beatOffered(g, deep, b)) continue;
    return b;
  }
  return null;
}

/** Build a beat and mark it put; it is had when answered. */
export function putDeepBeat(g: Game, b: ArcBeat): SeaEvent {
  g.powers.seen[`fired:place:${b.id}`] = g.clock.t;
  return b.build(g);
}

/** The beat due at this port, if any. Marks it put; it is had when answered. */
export function dueDeepScene(g: Game, port: string | null): SeaEvent | null {
  const b = peekDeepBeat(g, port);
  return b ? putDeepBeat(g, b) : null;
}

/** Where the arc stands, for the Quarters: beats had, and the next, if it can be named. */
export function arcProgress(g: Game, deep: DeepPort): { done: number; total: number; next: ArcBeat | null } {
  const done = deep.arc.filter((b) => hadAt(g, b.id) !== undefined).length;
  const next = deep.arc.find((b) => hadAt(g, b.id) === undefined) ?? null;
  return { done, total: deep.arc.length, next };
}
