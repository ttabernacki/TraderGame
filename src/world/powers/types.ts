/**
 * The Powers engine's vocabulary (BUILD_PLAN C2). Data and types only.
 *
 * A Power is somebody with an intent, means, an attitude to the captain that
 * the Ledger sets, and relations to the other Powers seeded from the
 * `allies`/`feuds` already written in diplomacy/polities. A Front is a clock
 * with four stages; each stage changes the world through `marketModifiers`,
 * through the scenes it unlocks and through what the Powers do. Nothing here
 * edits a price: the economy asks `marketModifiers(port, t)` and nothing else.
 */

export type FrontId = 'gold' | 'traffic' | 'claim' | 'crescent' | 'rule' | 'court';
export const FRONT_IDS: FrontId[] = ['gold', 'traffic', 'claim', 'crescent', 'rule', 'court'];

export type PowerId =
  | 'crown' | 'castile' | 'mamluk' | 'kilwa' | 'melinde' | 'calicut' | 'cochin' | 'kongo'
  // Inside the Traffic: they predate the Portuguese and have their own interests.
  | 'akan' | 'benin' | 'sahel';
export const POWER_IDS: PowerId[] = [
  'crown', 'castile', 'mamluk', 'kilwa', 'melinde', 'calicut', 'cochin', 'kongo', 'akan', 'benin', 'sahel',
];

/** Stage points a Front stage spans. A Front runs 0..16; stages begin at 0, 4, 8, 12. */
export const POINTS_PER_STAGE = 4;
export const MAX_POINTS = 4 * POINTS_PER_STAGE;

/** What a Front's stage does to a port's market, as data. Read only by `marketModifiers`. */
export interface StageEffect {
  /** In force from this stage up. */
  minStage: 1 | 2 | 3 | 4;
  /** Up to and including this stage (default: all above). */
  maxStage?: 1 | 2 | 3 | 4;
  ports: string[];
  /** Per good; a missing good is untouched. */
  price?: Record<string, number>;
  stock?: Record<string, number>;
  appetite?: Record<string, number>;
  duesMult?: number;
  /** Closes the lane while in force (a trunk port stays open to the flagship, at a toll). */
  closes?: boolean;
  /** P moved each month while this is in force (small, and through `prosperityShock`). */
  prosperity?: number;
  /** One plain line for the Book: what this stage is doing to this place. */
  line: string;
}

export interface StageDef {
  /** The stage's name, in the plain voice. */
  name: string;
  /** What it is, in one or two sentences. */
  line: string;
}

export interface LeverDef {
  label: string;
  /** What it costs the captain, in words. */
  cost: string;
  /** Front points per use (the Ledger's delta table is the authority; this is what the UI prints). */
  delta: number;
}

export interface FrontDef {
  id: FrontId;
  name: string;
  /** Where the Front lives. */
  region: string;
  stages: [StageDef, StageDef, StageDef, StageDef];
  /** Points the Front stood at when the career opens (July 1482). */
  start: number;
  /** The history schedule's drift, points a year, before dated shocks and the captain. */
  perYear: number;
  /** Whether the monthly tick runs it in this build (stage 1 of C2: Traffic and Gold). */
  ticks: boolean;
  /** Push (profit), brake (cost), contest (take it to a court and be told no). */
  levers: { push: LeverDef; brake: LeverDef; contest: LeverDef };
  /** How far the captain can move it from the history line: no lever stops a great process. */
  offsetMin: number;
  offsetMax: number;
  effects: StageEffect[];
}

/** An active thing in the world: an embargo, a war, a stage's toll. `marketModifiers` reads these. */
export interface Effect {
  id: number;
  kind: 'embargo' | 'war' | 'register' | 'push' | 'succession' | 'blockade' | 'stub';
  power: PowerId;
  ports: string[];
  start: number;
  end: number;
  /** The Book's line for it. */
  reason: string;
  /** Closes the lane. The flagship is never refused a trunk port: there it pays a toll instead. */
  closes?: boolean;
  /** Per good, or '*' for all. */
  price?: Record<string, number>;
  stock?: Record<string, number>;
  appetite?: Record<string, number>;
  duesMult?: number;
  /** P per month while it lasts ('war' | 'embargo' | 'blockade'). */
  blight?: number;
  /** The Rumour that began with it. */
  rumour?: number;
}

export interface FrontState {
  /** What the history schedule has done to it, points. */
  base: number;
  /** What the captain and the Powers have done to it, points. */
  offset: number;
  stage: 1 | 2 | 3 | 4;
  since: number;
  /** Stage changes, newest last, for the Book. */
  log: { t: number; stage: number; why: string }[];
  /** Levers pulled, counted for the scenes. */
  pulled: { push: number; brake: number; contest: number };
}

export interface PowerMove { t: number; kind: string; text: string }

export interface PowerState {
  /** -1..1, what the Ledger has made of the captain in this Power's eyes. */
  attitude: number;
  intent: string;
  intentUntil: number;
  /** -1..1, to every other Power; seeded from allies/feuds. */
  relations: Partial<Record<PowerId, number>>;
  moves: PowerMove[];
  /** Kongo: -1 the elders hold the court, +1 the traders do. */
  balance?: number;
  /** Anything the Power's own moves need to remember. */
  flags: Record<string, number | string | boolean>;
}

export type Truth = 'true' | 'stale' | 'false';

export interface Rumour {
  id: number;
  /** The event it is about (an Effect id, a stage change, a dated shock), for the falsifier. */
  event: string;
  power?: PowerId;
  front?: FrontId;
  /** Where it began, and where it is about. */
  place: string;
  /** What is said when it has travelled little, and when it has worn. */
  claim: string;
  vague: string;
  kind: 'politics' | 'rumour';
  /** The teller's kind, for the source line. */
  teller: string;
  born: number;
  /** Hidden. Never shown: truth is settled by arrival or by a second source. */
  truth: Truth;
  /** Per hop, how much of it survives. */
  fidelity: number;
  /** How long it keeps going about, months; after this it resolves to its truth. */
  window: number;
  /** When the captain first heard it, at which port, and how many hops it had made. */
  heard?: { t: number; port: string; hops: number };
  checked?: 'agrees' | 'disputed';
  checkedAt?: number;
  soldAt?: number;
  /** The captain has stood at the place and seen. */
  settled?: 'borne out' | 'not borne out';
  /** Set by the world when its window closes, or by arrival: what it turned out to be. */
  resolved?: Truth;
}

/** A person-bearing cargo the captain has taken aboard, off the books of the hold's price list. */
export interface Parcel {
  id: number;
  from: string;
  to: string;
  /** People aboard at the start, and how many are still. */
  n: number;
  alive: number;
  /** Tons of hold they take. */
  tons: number;
  /** Freight, cruzados, paid on landing. */
  freight: number;
  taken: number;
  status: 'aboard' | 'landed' | 'refused';
  /** Who gave it to him. */
  by: string;
  /** Names the clerk wrote down, and of those, who died on the passage. */
  names?: string[];
  dead?: string[];
}

export interface LocalFight {
  /** The Mpinda register: 'open' until the captain has had his one chance. */
  state: 'unmet' | 'offered' | 'won' | 'lost';
  /** What has been prepared: the elders' seal, the officer's trust. */
  seal?: boolean;
  trust?: boolean;
  at?: number;
}

export interface PowersState {
  v: 1;
  fronts: Record<FrontId, FrontState>;
  powers: Record<PowerId, PowerState>;
  effects: Effect[];
  rumours: Rumour[];
  parcels: Parcel[];
  local: LocalFight;
  /** Ledger entries already folded into the Fronts and attitudes. */
  cursor: number;
  /** Dated shocks already applied. */
  shocksDone: string[];
  /** Scenes the captain has had, by id, when. */
  seen: Record<string, number>;
  nextId: number;
  /** The last month index run. */
  lastMonth: number;
}
