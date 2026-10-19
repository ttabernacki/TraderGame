import type { Tag } from '../ledger/tags';
import type { SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';

/**
 * The vocabulary of a Deep port (BUILD_PLAN C4, Pillar 5).
 *
 * A Deep port has a Patron (a named person, a relationship track read off the Ledger and the visits), a
 * calendar, a memory (Ledger entries at the place become lines and small price and dues effects) and one
 * personal arc. Everything is data except the arc's scenes, which are written as `SeaEvent`s beside it.
 * Mina is the first (`deep.ts`); D6 adds Arguim, Melinde, Calecute and Lisbon by adding entries there.
 *
 * Source discipline (docs/DESIGN.md): each Deep port says, in its own file, what is documented, what is
 * approximate and what is invented. `grade` on a calendar entry is that statement, in data.
 */

export type Grade = 'documented' | 'approximate' | 'invented';

export type Stage = 'stranger' | 'acquaintance' | 'trusted' | 'partner';
export const STAGES: Stage[] = ['stranger', 'acquaintance', 'trusted', 'partner'];

/** What the Ledger does to a Patron's opinion: one tag, one weight, and why he cares. */
export interface PatronRule {
  tag: Tag;
  /** Added to the score per unit of magnitude (0..1), scaled by the entry's age. */
  weight: number;
  /** Only entries made at this port count (default), or anywhere on the road. */
  anywhere?: boolean;
  /** Why this matters to him, in the clerks' plain voice. For the Book and the falsifier. */
  why: string;
}

export interface Perk {
  id: string;
  stage: Stage;
  kind: 'rumour' | 'credit' | 'pilot' | 'house' | 'price';
  /** What it is, in a line the Quarters can print. */
  text: string;
  /** Credit: cruzados while lying here. House: the multiplier on the founding cost. Price: the multiplier on gold. */
  value?: number;
}

export interface ArcBeat {
  id: string;
  /** The least trust this beat is offered at. */
  stage: Stage;
  /** The beats that must have been had first. */
  after?: string[];
  /** Days after the previous beat before this one is offered. */
  wait?: number;
  needs?: (g: Game) => boolean;
  build: (g: Game) => SeaEvent;
}

export interface PatronDef {
  id: string;
  name: string;
  title: string;
  /** Where he is from and what he is, a line. */
  of: string;
  /** Who he is, a few lines, the way a clerk would say it to a captain new to the beach. */
  bio: string[];
  /** Calls here are worth this much each, to a cap. */
  visitWeight: number;
  visitCap: number;
  /** Score at which he becomes an acquaintance, trusted, a partner. */
  thresholds: [number, number, number];
  rules: PatronRule[];
  /** What he says on seeing you, by stage; the first line is used. */
  greet: Record<Stage, string>;
  /** What he says of a deed, by tag, the first time he hears of it. */
  reactions: Partial<Record<Tag, string>>;
  perks: Perk[];
  /** Said when his opinion crosses a threshold: arriving at the stage. */
  rise: Partial<Record<Stage, string>>;
}

/** What the place remembers: a line per tag, and what the deed does to the market. */
export interface MemoryEffect {
  tag: Tag;
  /** Added to the dues multiplier per unit of weighted magnitude (capped at 2). */
  dues?: number;
  /** Per good, added to the price multiplier per unit. */
  price?: Record<string, number>;
  /** Added to the town's own regard (`Relations.local`) when the deed is written, per unit of magnitude. */
  regard?: number;
}

export interface MemoryDef {
  /** Lines in the town's own voice, by tag (the generic table is used for the rest). */
  lines: Partial<Record<Tag, string>>;
  effects: MemoryEffect[];
}

export interface CalendarEntry {
  id: string;
  name: string;
  kind: 'fever' | 'fair' | 'fleet' | 'feast' | 'rains';
  months: number[];
  /** Within the month(s), the days it runs; the whole month if absent. */
  days?: [number, number];
  text: string;
  grade: Grade;
  /** Multiplies the arrival fever (the surgeon still halves it). */
  fever?: number;
  price?: Record<string, number>;
  appetite?: Record<string, number>;
  dues?: number;
  /** Morale added by keeping the day (Faith). */
  morale?: number;
}

export interface DeepPort {
  port: string;
  patron: PatronDef;
  calendar: CalendarEntry[];
  memory: MemoryDef;
  arc: ArcBeat[];
  /** What is invented, one line each, for docs/SOURCES.md and the reader. */
  invented: string[];
}
