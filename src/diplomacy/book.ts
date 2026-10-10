/**
 * The Book of Courtesies: what the captain has learned of how to behave among
 * a people. A sibling of the rutter — each entry says how it was learned, and
 * what is learned from a pilot or an interpreter may be sold on or lent.
 */

export type BookKind = 'custom' | 'taboo' | 'phrase' | 'gift' | 'person';
export type LearnedHow = 'told' | 'seen' | 'blundered' | 'bought' | 'taught';

export interface BookEntry {
  id: number;
  polity: string;
  kind: BookKind;
  text: string;
  how: LearnedHow;
  t: number;
  /** Keys that pieces test, e.g. 'shoes-off', 'left-hand'. */
  tag: string;
}

export interface BookState {
  entries: BookEntry[];
  nextId: number;
}

export function newBook(): BookState {
  return { entries: [], nextId: 1 };
}

/** Learning a thing twice keeps the better provenance (told/taught over blundered). */
export function learn(b: BookState, polity: string, e: Omit<BookEntry, 'id' | 'polity' | 't'>, t: number): BookEntry {
  const rank: Record<LearnedHow, number> = { blundered: 0, seen: 1, told: 2, bought: 2, taught: 3 };
  const old = b.entries.find((x) => x.polity === polity && x.tag === e.tag);
  if (old) {
    if (rank[e.how] > rank[old.how]) { old.how = e.how; old.text = e.text; old.t = t; }
    return old;
  }
  const entry: BookEntry = { id: b.nextId++, polity, t, ...e };
  b.entries.push(entry);
  return entry;
}

export function knows(b: BookState, polity: string, tag: string): boolean {
  return b.entries.some((x) => x.polity === polity && x.tag === tag);
}

export function entriesOf(b: BookState, polity: string): BookEntry[] {
  return b.entries.filter((x) => x.polity === polity);
}
