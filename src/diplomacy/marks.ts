/**
 * Marks: the unit of diplomatic story.
 *
 * A piece does not end in a number but in a named mark — "the sultan heard you
 * out in his own tongue" — which a later scene can read and answer. A mark has
 * a `key` (what the code asks about), a `text` (what the ledger shows) and an
 * `echo` (what a court says about it on the next visit). Marks fade only if
 * they are given a `until`; most are for the life of the career.
 */

import { record, type Entry, type LedgerHost } from '../ledger/ledger';
import { tagForMark } from '../ledger/markTags';

export interface Mark {
  id: number;
  polity: string;
  key: string;
  text: string;
  /** One line a court or an officer may say when the mark comes up again. */
  echo: string;
  t: number;
  /** -1 to 1: how it reads in the ledger (against / for you). */
  tone: number;
  until?: number;
}

export interface NewMark {
  key: string;
  text: string;
  echo: string;
  tone: number;
  until?: number;
}

export interface MarksState {
  marks: Mark[];
  nextId: number;
}

export function newMarks(): MarksState {
  return { marks: [], nextId: 1 };
}

/** Writing the same key twice replaces the old mark: a court has one view at a time. */
export function writeMark(s: MarksState, polity: string, m: NewMark, t: number): Mark {
  s.marks = s.marks.filter((x) => !(x.polity === polity && x.key === m.key));
  const mark: Mark = { id: s.nextId++, polity, t, ...m };
  s.marks.push(mark);
  return mark;
}

/** The Ledger entry a mark is: the same act, under a tag, with the court as its target. */
export function markEntry(polity: string, m: NewMark, t: number, place = ''): Entry {
  return {
    t, place, tag: tagForMark(m.key, m.tone), actors: ['captain'], target: polity,
    magnitude: Math.max(0.2, Math.abs(m.tone)), witnesses: [], note: m.text,
  };
}

/**
 * Write a mark and record it in the Ledger. The mark, its echo and everything
 * that reads them are unchanged; the Ledger entry is the same act in the one
 * record every other system will read. Silent: a mark already says its piece.
 */
export function writeMarkAndRecord(g: LedgerHost & { diplomacy: { marks: MarksState } }, polity: string, m: NewMark): Mark {
  const mark = writeMark(g.diplomacy.marks, polity, m, g.clock.t);
  record(g, tagForMark(m.key, m.tone), {
    target: polity, magnitude: Math.max(0.2, Math.abs(m.tone)), note: m.text,
  });
  return mark;
}

/** Marks held by a save that has no Ledger yet, as the entries they would have been. */
export function entriesFromMarks(marks: Mark[]): Entry[] {
  return [...marks].sort((a, b) => a.t - b.t).map((m) => markEntry(m.polity, m, m.t));
}

export function marksOf(s: MarksState, polity: string, t: number): Mark[] {
  return s.marks.filter((m) => m.polity === polity && (m.until === undefined || m.until > t));
}

export function hasMark(s: MarksState, polity: string, key: string, t: number): boolean {
  return marksOf(s, polity, t).some((m) => m.key === key);
}

/** The line a court says on meeting you again: its most recent mark that has something to say. */
export function echoFor(s: MarksState, polity: string, t: number): string | null {
  const ms = marksOf(s, polity, t).filter((m) => m.echo);
  return ms.length ? ms[ms.length - 1].echo : null;
}

/** How many marks, active now, a court holds for you (tone above 0.3) and against you (below -0.5). */
export function markCounts(s: MarksState, polity: string, t: number): { for: number; against: number } {
  const ms = marksOf(s, polity, t);
  return { for: ms.filter((m) => m.tone > 0.3).length, against: ms.filter((m) => m.tone < -0.5).length };
}
