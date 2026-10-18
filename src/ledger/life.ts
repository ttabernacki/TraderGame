import { byVoyage, dateOf, didLine, placeName, type Entry } from './ledger';
import { TAGS } from './tags';

/**
 * The Ledger as an autobiography, for the Life page of the Captain's Book.
 * Plain voice, newest voyage first, grouped by voyage. Pure: the view only
 * lays out what this returns, and the falsifier reads it without a DOM.
 */

export interface LifeLine {
  date: string;
  place: string;
  /** What happened, in the captain's words (the entry's note, or the tag's own line). */
  said: string;
  /** What it did, the one-line consequence. */
  did: string;
  /** -1..1, for colouring. */
  tone: number;
  tag: string;
}

export interface LifeChapter {
  title: string;
  lines: LifeLine[];
}

export function lifeLine(e: Entry): LifeLine {
  const did = didLine(e);
  return {
    date: dateOf(e),
    place: placeName(e.place),
    said: e.note || did,
    did: e.note ? did : '',
    tone: TAGS[e.tag].tone,
    tag: e.tag,
  };
}

export function life(ledger: Entry[]): LifeChapter[] {
  const chapters: LifeChapter[] = [];
  for (const v of byVoyage(ledger)) {
    const lines = v.entries.map(lifeLine);
    if (lines.length === 0 && v.n === 0) continue;
    chapters.push({
      title: v.n === 0 ? 'Before the first voyage' : `The ${ordinal(v.n)} voyage, from ${dateOf({ t: v.from } as Entry)}`,
      lines,
    });
  }
  return chapters.reverse().map((c) => ({ ...c, lines: [...c.lines].reverse() }));
}

/** Everything the Life page will print for these entries, as one string (for tests). */
export function lifeText(ledger: Entry[]): string {
  return life(ledger).map((c) => `${c.title}\n${c.lines.map((l) => `${l.date} ${l.place}: ${l.said} ${l.did}`).join('\n')}`).join('\n');
}

const ORD = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
function ordinal(n: number): string {
  return ORD[n] ?? `${n}th`;
}
