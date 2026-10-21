import type { LatLon } from '../core/math';
import type { SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';

/**
 * The storylet engine's vocabulary (BUILD_PLAN E1, Pillar 4: the Web).
 *
 * A storylet is a piece of the world that is true only in some states of it: it says where it may be had (a port,
 * a stretch of sea, a span of the road, a season), what must be so (`requires`, a query over QUALITIES), how it
 * ranks against the others that are also due (`kind`, `priority`), what it writes and which storylets its answer
 * unlocks (`hooks`), and when the world will have moved on without it (`expires`). Arcs are named sets of storylets
 * that share qualities, not step pointers.
 */

export type Val = number | string | boolean;
export type Op = '>=' | '<=' | '>' | '<' | '==' | '!=';

/** A query over qualities. A bare `{ q }` is true when the quality is truthy. `@` in a key stands for the storylet's arc. */
export type Req =
  | { q: string; op?: Op; v?: Val }
  | { all: Req[] }
  | { any: Req[] }
  | { not: Req }
  /** An opaque predicate kept from older machinery. `reads` names the qualities it looks at, for the graph. */
  | { fn: (g: Game) => boolean; label: string; reads?: string[] };

/** Surfacing rank: a deadline beats a companion beats a Front beats an arc beats texture. */
export type Kind = 'deadline' | 'companion' | 'front' | 'arc' | 'texture';
export const KIND_RANK: Record<Kind, number> = { deadline: 0, companion: 1, front: 2, arc: 3, texture: 4 };

/** The Quarters a person can be met in (ui/quarters). */
export type Quarter = 'waterfront' | 'tavern' | 'court' | 'faith' | 'yard' | 'market';

/** A stretch of open water, or of coast. */
export interface SeaSpot {
  at: LatLon;
  /** Within this many nautical miles of `at` (omit for "wherever `where` says"). */
  nm?: number;
  /** Nearest land, nautical miles. */
  shoreMin?: number;
  shoreMax?: number;
  /** For shapes a circle will not draw (the Cape, "north of eight degrees"). */
  where?: (g: Game) => boolean;
}

/**
 * Where a storylet may be had. Exactly one of `ports` / `anyPort` / `sea` / `either`, then optional `span` and
 * `months`. `span` is nautical miles along the road from Lisbon (`progression/road.ts: along()`).
 */
export interface Place {
  ports?: string[];
  anyPort?: true;
  sea?: SeaSpot;
  /** A port or a stretch of sea: whichever the ship is in. */
  either?: Place[];
  span?: [number, number];
  months?: number[];
}

export interface Person {
  who: string | ((g: Game) => string);
  line: string | ((g: Game) => string);
  quarter?: Quarter;
}

export type SourceId = 'thread' | 'traffic' | 'power' | 'front' | 'deep' | 'web';

export interface Expiry {
  /** True once the world has moved on. */
  when: Req;
  /** Settles what was left hanging (closes the thread, says so). Returns the line for the log. */
  settle?: (g: Game) => string | void;
}

export interface Storylet {
  id: string;
  source: SourceId;
  arc?: string;
  kind: Kind;
  /** Within a kind, higher first; ties by id. */
  priority: number;
  place: Place;
  requires: Req[];
  expires?: Expiry;
  /** The scene, built when it is heard (never when it is listed: building may roll dice). */
  scene: (g: Game) => SeaEvent;
  person?: Person;
  /** Quality keys the answer writes beyond what the Ledger and the thread record already carry. */
  writes: string[];
  /** Storylets (by id) whose requires this one's answer makes true. */
  hooks: string[];
  /** The road (road.ts): this beat is met on the voyage home, carrying what it is about. */
  homeward?: boolean;
  /** What is aboard that makes a return to a place behind possible (a person, a letter, cargo). */
  carries?: string;
  /** An offer rather than a scene: a person with a story, taken up at the quay (the Quarters' offer card). */
  offer?: { thread: string };
}

/** What the engine lists and puts. */
export interface Candidate {
  id: string;
  source: SourceId;
  kind: Kind;
  priority: number;
  quarter: Quarter;
  /** Who the person is and what he says, read from the scene without keeping anything its build touched. */
  preview: (g: Game) => { who: string; line: string };
  /** 'now': put at the call (the Patron speaks); 'person': waits at the Quarters until the captain hears him. */
  delivery: 'now' | 'person';
  /** Build the scene and mark it put. */
  take: (g: Game) => SeaEvent | null;
}

/** A source of storylets: the thread registry, the Traffic's scenes, the courts', the Patron's arcs. */
export interface Source {
  id: SourceId;
  /** Everything due at `port` (docked) or at sea (`port` null), unranked. */
  due: (g: Game, port: string | null) => Candidate[];
  /** For the graph: every storylet the source can ever offer. */
  all: () => Storylet[];
}

/** Persistent engine state (additive on the Game, `g.web`). */
export interface WebState {
  v: 1;
  /** Qualities that storylets write and nothing else owns (`flag.*`). */
  flags: Record<string, Val>;
  /** Storylets of the web source answered, by id, when. */
  done: Record<string, number>;
  /** Scenes put and not yet answered, by id, when. */
  fired: Record<string, number>;
  /** Scenes heard this port call / this leg (reset on arrival). */
  used: { port: number; sea: number };
  /** The call the counters belong to: `<port>@<arrival time>`. */
  call: string;
  /** The one person waiting at the Quarters this call. */
  waiting: Waiting | null;
  /** Storylets whose door has closed (id), so the world does not offer them again and the log says so once. */
  expired: string[];
}

export interface Waiting {
  id: string;
  source: SourceId;
  port: string;
  quarter: Quarter;
  who: string;
  line: string;
  since: number;
}

export type { LatLon };
