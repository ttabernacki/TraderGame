import type { Tag } from '../ledger/tags';

/**
 * What the captain is, kept in one additive block on the Game (BUILD_PLAN D4/D5): his name, the patron of record
 * and how each patron stands with him, the titles the Ledger has earned and the three he wears, the Calling.
 * Clauses are not here: they are Ledger entries (clauses.ts).
 */

export type PatronId = 'crown' | 'church' | 'ruanova';
export const PATRON_IDS: PatronId[] = ['crown', 'church', 'ruanova'];
export type CallingId = 'pilot' | 'factor' | 'builder' | 'master';
export const CALLING_IDS: CallingId[] = ['pilot', 'factor', 'builder', 'master'];

export interface PatronRec {
  /** -1..1: what the patron makes of him, folded from the Ledger by its loves and hates. */
  favour: number;
  /** 0..: what he has done against it under its flag. At 1 it turns on him. */
  grudge: number;
  /** When it fell, and when it rises again (seconds), if it has. */
  fell: number | null;
  recovers: number | null;
  /** He sailed for it when it fell and had not moved: pulled down with it until `recovers`. */
  pulled: boolean;
  /** When it ruined him; its door stays shut for a term. */
  ruined: number | null;
  /** Orders discharged under it. */
  done: number;
}

export interface TitleRec { t: number; place: string }

export interface IdentityState {
  v: 1;
  name: string;
  /** Patron of record for the voyage, and how many voyages he has begun (to know a choice is per voyage). */
  patron: PatronId;
  patronVoyage: number;
  patrons: Record<PatronId, PatronRec>;
  /** Agenda events warned of (id -> when), applied (id), and where he stood: moved early? */
  warned: Record<string, number>;
  applied: string[];
  moved: string[];
  /** Ledger entries already folded into the patrons. */
  cursor: number;
  titles: Record<string, TitleRec>;
  worn: string[];
  /** Titles' word already sent down the road (title id). */
  announced: string[];
  calling: CallingId | null;
  lastMonth: number;
  /** The last game-day the identity ticked (seconds). */
  lastDay: number;
  /** The invented favourite's fall when the Court Front reaches its second stage: which patron, seeded. */
  favourite?: PatronId;
  /** Seat-holders a Master has kept beside the usual one (role -> count), for the Book. */
  seats: number;
}

export const newPatronRec = (): PatronRec => ({ favour: 0, grudge: 0, fell: null, recovers: null, pulled: false, ruined: null, done: 0 });

export function newIdentity(): IdentityState {
  return {
    v: 1, name: '', patron: 'crown', patronVoyage: 0,
    patrons: { crown: newPatronRec(), church: newPatronRec(), ruanova: newPatronRec() },
    warned: {}, applied: [], moved: [], cursor: 0, titles: {}, worn: [], announced: [], calling: null, lastMonth: -1, lastDay: -1e12, seats: 0,
  };
}

export function migrateIdentity(raw: unknown): IdentityState {
  const d = newIdentity();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<IdentityState>;
  const patrons = { ...d.patrons };
  for (const id of PATRON_IDS) patrons[id] = { ...newPatronRec(), ...((r.patrons ?? {})[id] ?? {}) };
  return {
    v: 1,
    name: typeof r.name === 'string' ? r.name : '',
    patron: PATRON_IDS.includes(r.patron as PatronId) ? r.patron as PatronId : 'crown',
    patronVoyage: typeof r.patronVoyage === 'number' ? r.patronVoyage : 0,
    patrons,
    warned: r.warned && typeof r.warned === 'object' ? { ...r.warned } : {},
    applied: Array.isArray(r.applied) ? r.applied.filter((x) => typeof x === 'string') : [],
    moved: Array.isArray(r.moved) ? r.moved.filter((x) => typeof x === 'string') : [],
    cursor: typeof r.cursor === 'number' ? r.cursor : 0,
    titles: r.titles && typeof r.titles === 'object' ? { ...r.titles } : {},
    worn: Array.isArray(r.worn) ? r.worn.filter((x) => typeof x === 'string').slice(0, 3) : [],
    announced: Array.isArray(r.announced) ? r.announced.filter((x) => typeof x === 'string') : [],
    calling: CALLING_IDS.includes(r.calling as CallingId) ? r.calling as CallingId : null,
    lastMonth: typeof r.lastMonth === 'number' ? r.lastMonth : -1,
    lastDay: typeof r.lastDay === 'number' ? r.lastDay : -1e12,
    favourite: PATRON_IDS.includes(r.favourite as PatronId) ? r.favourite as PatronId : undefined,
    seats: typeof r.seats === 'number' ? r.seats : 0,
  };
}

export type { Tag };
