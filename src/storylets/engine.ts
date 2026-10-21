import type { SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';
import { KIND_RANK, type Candidate, type Quarter, type Source, type Waiting, type WebState } from './types';

/**
 * The engine (BUILD_PLAN E1, Pillar 4).
 *
 * Sources list what is due where the ship lies; the engine ranks it (a deadline beats a companion beats a Front
 * beats an arc beats texture, then `priority`, then id: no dice) and lets AT MOST ONE storylet scene through per port
 * call, and one at sea per leg. In port a scene is a PERSON at the Quarters: it waits, shown by the quarter, until the
 * captain hears him; the Patron, who is already a person there, speaks at the call. At sea the scene goes to the
 * ordinary decision card. The world does not wait: expiry is swept before anything is listed.
 */

export const newWeb = (): WebState => ({
  v: 1, flags: {}, done: {}, fired: {}, used: { port: 0, sea: 0 }, call: '', waiting: null, expired: [],
});

export function migrateWeb(raw: unknown): WebState {
  const d = newWeb();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<WebState>;
  return {
    v: 1,
    flags: r.flags && typeof r.flags === 'object' ? { ...r.flags } : {},
    done: r.done && typeof r.done === 'object' ? { ...r.done } : {},
    fired: r.fired && typeof r.fired === 'object' ? { ...r.fired } : {},
    used: r.used && typeof r.used.port === 'number' && typeof r.used.sea === 'number' ? { port: r.used.port, sea: r.used.sea } : { port: 0, sea: 0 },
    call: typeof r.call === 'string' ? r.call : '',
    waiting: r.waiting && typeof r.waiting.id === 'string' ? { ...r.waiting } : null,
    expired: Array.isArray(r.expired) ? r.expired.filter((x) => typeof x === 'string') : [],
  };
}

// -- Sources -----------------------------------------------------------------------------------------------------------

const SOURCES: Source[] = [];
export function registerSource(s: Source): void {
  const i = SOURCES.findIndex((x) => x.id === s.id);
  if (i >= 0) SOURCES[i] = s; else SOURCES.push(s);
}
export const sources = (): Source[] => SOURCES;

/** Everything due at the port (or at sea), best first. */
export function dueNow(g: Game, port: string | null): Candidate[] {
  const out: Candidate[] = [];
  for (const s of SOURCES) out.push(...s.due(g, port));
  return out.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// -- Calls and legs ------------------------------------------------------------------------------------------------------

/** A new port call: the counters are clear, and whoever was waiting at the last quay stayed there. */
export function webOnArrival(g: Game, port: string): void {
  const w = g.web;
  w.used = { port: 0, sea: 0 };
  w.call = `${port}@${Math.round(g.clock.t)}`;
  w.waiting = null;
}

/** Whether a scene is still on its way to the captain (on the screen or queued). */
export function isPending(g: Game, id: string): boolean {
  return g.pendingEvent?.id === id || g.pendingScenes.some((x) => x.id === id);
}

/** A scene put and since lost (dropped from the queue, a lost ship) is put again, not left waiting on a card nobody will see. */
function reconcile(g: Game): void {
  for (const id of Object.keys(g.web.fired)) if (!isPending(g, id)) delete g.web.fired[id];
}

// -- Expiry --------------------------------------------------------------------------------------------------------------------

type Sweeper = (g: Game) => void;
const SWEEPERS: Sweeper[] = [];
/** Sources register a sweep that closes the doors the world has shut and settles what they left hanging. */
export function onSweep(fn: Sweeper): void { SWEEPERS.push(fn); }

/** Note a door closed, once. */
export function noteExpired(g: Game, id: string): boolean {
  if (g.web.expired.includes(id)) return false;
  g.web.expired.push(id);
  return true;
}

// -- Surfacing ---------------------------------------------------------------------------------------------------------------------

/** What the Quarters shows: who is waiting here, if anyone. */
export function waitingAt(g: Game, quarter?: Quarter): Waiting | null {
  const w = g.web.waiting;
  if (!w || !g.dockedAt || w.port !== g.dockedAt) return null;
  return !quarter || w.quarter === quarter ? w : null;
}

/**
 * The scene due now, if one may be put. In port a 'person' scene is not returned but made to wait; a 'now' scene (the
 * Patron's) and every scene at sea is returned at once. Called by `Game.checkQuests`.
 */
export function surface(g: Game): SeaEvent | null {
  for (const sw of SWEEPERS) sw(g);
  reconcile(g);
  const web = g.web;
  const port = g.dockedAt;
  if (port) {
    if (web.used.port >= 1) { web.waiting = null; return null; }
    const best = dueNow(g, port).find((c) => !isPending(g, c.id));
    if (!best) { web.waiting = null; return null; }
    if (best.delivery === 'now') { web.used.port++; web.waiting = null; return best.take(g); }
    if (web.waiting?.id !== best.id || web.waiting.port !== port) {
      const p = previewOf(g, best);
      web.waiting = { id: best.id, source: best.source, port, quarter: best.quarter, who: p.who, line: p.line, since: g.clock.t };
    }
    return null;
  }
  web.waiting = null;
  if (web.used.sea >= 1) return null;
  const best = dueNow(g, null).find((c) => !isPending(g, c.id));
  if (!best) return null;
  web.used.sea++;
  return best.take(g);
}

/** The captain hears the person who is waiting: his scene is built and put. Returns it. */
export function hear(g: Game): SeaEvent | null {
  const w = g.web.waiting;
  if (!w || w.port !== g.dockedAt) { g.web.waiting = null; return null; }
  const c = dueNow(g, w.port).find((x) => x.id === w.id);
  g.web.waiting = null;
  if (!c) return null;
  g.web.used.port++;
  return c.take(g);
}

/** A preview of a candidate: who and what, without keeping anything the build changed. */
function previewOf(g: Game, c: Candidate): { who: string; line: string } {
  return c.preview(g);
}

/** Above zero while a preview is being built: the falsifier's flag tracing (scripts/storylets.ts) does not count what it reads. */
export const quiet = { n: 0 };

/**
 * Build a scene to read its title and first lines, then put back what the build touched (the generator and the
 * thread record's flags): a scene may roll dice or note a flag as it is built, and a preview must not.
 */
export function withoutTrace<T>(g: Game, flags: Record<string, unknown> | undefined, fn: () => T): T {
  const rng = g.rng as unknown as { state: number };
  const saved = rng.state;
  quiet.n++;
  const keep = flags ? JSON.stringify(flags) : '';
  try {
    return fn();
  } finally {
    quiet.n--;
    rng.state = saved;
    if (flags) {
      for (const k of Object.keys(flags)) delete flags[k];
      Object.assign(flags, JSON.parse(keep));
    }
  }
}

/** First sentence or two of a scene, for the card. */
export function leadOf(text: string, max = 170): string {
  const para = text.split('\n')[0];
  if (para.length <= max) return para;
  const cut = para.slice(0, max);
  const i = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return (i > 60 ? cut.slice(0, i + 1) : `${cut.replace(/\s+\S*$/, '')}…`);
}
