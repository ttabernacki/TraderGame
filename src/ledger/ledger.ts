import { formatDateAt } from '../core/clock';
import { POLITY_BY_ID } from '../diplomacy/polities';
import { PORT_BY_ID } from '../world/ports';
import { TAGS, familyOf, type Tag } from './tags';

/**
 * The Ledger: one append-only record of the consequential things the captain
 * did, each under a tag from the controlled vocabulary (`tags.ts`).
 *
 * It is data and nothing else. It holds no meter and moves nothing; the Book
 * prints it as a life, the epilogue prints it as two chronicles, and later
 * builds (Powers, Company, Titles) will read it. Marks are written here too,
 * through `diplomacy/marks.ts`, with their echo kept where it always was.
 */

export interface Entry {
  /** Ship-time, seconds. */
  t: number;
  /** Port id the act was done at, or '' at sea. */
  place: string;
  tag: Tag;
  /** Who did it: the captain unless said otherwise. */
  actors: string[];
  /** The polity, person, front or place it was done to. */
  target: string;
  /** How much it weighed, 0..1 (a count, for tags that count). */
  magnitude: number;
  /** Who saw it. */
  witnesses: string[];
  /** What happened, in the captain's plain words. */
  note: string;
  /** Structured facts a reader needs (a clause's kind, id and term). Optional; most entries carry none. */
  data?: Record<string, number | string>;
}

/** What `record` needs of the game; `Game` satisfies it. */
export interface LedgerHost {
  ledger: Entry[];
  clock: { t: number };
  dockedAt: string | null;
  pushAlert(text: string, severity: 'note' | 'warning' | 'grave'): void;
}

export interface Deed {
  target?: string;
  place?: string;
  actors?: string[];
  magnitude?: number;
  witnesses?: string[];
  note?: string;
  /** Override the tag's own silence. */
  silent?: boolean;
  /** Back-dated entries (migration). */
  t?: number;
  data?: Record<string, number | string>;
}

/** Name of a target for display: polity, port, or the raw string. */
export function nameOf(target: string): string {
  if (!target) return 'the coast';
  if (target === 'portugal') return 'the Crown';
  const pol = POLITY_BY_ID.get(target);
  if (pol) return pol.name;
  const port = PORT_BY_ID.get(target);
  if (port) return port.name;
  if (target.startsWith('nation:')) return `the ${target.slice(7)}s`;
  return target;
}

export function placeName(place: string): string {
  if (!place) return 'sea';
  return PORT_BY_ID.get(place)?.name ?? place;
}

/** The "what this did" line for an entry, with its placeholders filled. */
export function didLine(e: Entry): string {
  const n = Math.round(e.magnitude);
  return TAGS[e.tag].did
    .replace('{target}', nameOf(e.target))
    .replace('{place}', placeName(e.place))
    .replace('{n}', String(Math.max(n, 1)));
}

/**
 * Write one entry and, unless it is a silent kind, say in one quiet line what
 * it did. Never throws: the Ledger is a record, and a failure to write it must
 * not stop the game that is being played.
 */
export function record(g: LedgerHost, tag: Tag, d: Deed = {}): Entry {
  const e: Entry = {
    t: d.t ?? g.clock.t,
    place: d.place ?? g.dockedAt ?? '',
    tag,
    actors: d.actors ?? ['captain'],
    target: d.target ?? '',
    magnitude: d.magnitude ?? 0.5,
    witnesses: d.witnesses ?? [],
    note: d.note ?? '',
  };
  if (d.data) e.data = d.data;
  g.ledger.push(e);
  const quiet = d.silent ?? TAGS[tag].silent ?? false;
  if (!quiet) {
    try { g.pushAlert(didLine(e), 'note'); } catch { /* the record stands without the notice */ }
  }
  return e;
}

// -- Queries ----------------------------------------------------------------

export const byTag = (l: Entry[], ...tags: Tag[]): Entry[] => l.filter((e) => tags.includes(e.tag));
export const byFamily = (l: Entry[], family: string): Entry[] => l.filter((e) => familyOf(e.tag) === family);
export const ofTarget = (l: Entry[], target: string): Entry[] => l.filter((e) => e.target === target);
export const atPlace = (l: Entry[], place: string): Entry[] => l.filter((e) => e.place === place);
export const between = (l: Entry[], t0: number, t1: number): Entry[] => l.filter((e) => e.t >= t0 && e.t < t1);
export const count = (l: Entry[], tag: Tag): number => l.filter((e) => e.tag === tag).length;

// -- Decay ------------------------------------------------------------------

const YEAR = 365.25 * 86400;
/** Entries older than this begin to fade at an heir's hand-off. */
export const DECAY_AFTER_YEARS = 8;
export const DECAY_SPAN_YEARS = 8;

/** 1 for anything within eight years, falling to 0 over the next eight. */
export function weightAt(e: Entry, now: number): number {
  const age = (now - e.t) / YEAR;
  if (age <= DECAY_AFTER_YEARS) return 1;
  return Math.max(0, 1 - (age - DECAY_AFTER_YEARS) / DECAY_SPAN_YEARS);
}

/** What an heir inherits: entries faded by age, those that have faded out dropped. */
export function decayed(l: Entry[], now: number): Entry[] {
  const out: Entry[] = [];
  for (const e of l) {
    const w = weightAt(e, now);
    if (w <= 0) continue;
    out.push(w === 1 ? e : { ...e, magnitude: e.magnitude * w });
  }
  return out;
}

// -- Voyages and dates -------------------------------------------------------

/**
 * Entries grouped by voyage. A voyage begins at a `voyage.begun` entry; what
 * came before the first is "before the first voyage". Derived, not stored.
 */
export function byVoyage(l: Entry[]): { n: number; from: number; entries: Entry[] }[] {
  const sorted = [...l].sort((a, b) => a.t - b.t);
  const groups: { n: number; from: number; entries: Entry[] }[] = [];
  let cur = { n: 0, from: sorted.length ? sorted[0].t : 0, entries: [] as Entry[] };
  for (const e of sorted) {
    if (e.tag === 'voyage.begun') {
      if (cur.entries.length > 0 || cur.n > 0) groups.push(cur);
      cur = { n: cur.n + 1, from: e.t, entries: [] };
      continue;
    }
    cur.entries.push(e);
  }
  if (cur.entries.length > 0 || cur.n > 0) groups.push(cur);
  return groups;
}

export function dateOf(e: Entry): string {
  return formatDateAt(e.t);
}

export function isEntry(x: unknown): x is Entry {
  const e = x as Entry;
  return !!e && typeof e.t === 'number' && Number.isFinite(e.t) && typeof e.tag === 'string'
    && Object.prototype.hasOwnProperty.call(TAGS, e.tag) && Array.isArray(e.actors)
    && Array.isArray(e.witnesses) && typeof e.target === 'string' && typeof e.place === 'string'
    && typeof e.note === 'string' && typeof e.magnitude === 'number';
}

/** Load-time guard: keep what is well formed, drop what is not (a hand-edited save). */
export function sanitize(l: unknown): Entry[] {
  return Array.isArray(l) ? l.filter(isEntry) : [];
}
