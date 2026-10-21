import { clamp } from '../../core/math';
import { dateFromDays } from '../../core/clock';
import type { Rng } from '../../core/rng';
import { MONTH, addEffect, hasActive, pull } from './core';
import { announce, type Telling } from './rumours';
import type { Effect, FrontId, PowerId, PowersState } from './types';

/**
 * The authored moves of the Powers that tick in D4 (Swahili coast, Malabar, the Crescent, and the light stubs).
 *
 * A Power has a short list of moves; each month it is offered them in order and makes AT MOST ONE, by a chance
 * its own state sets (attitude to the captain from the Ledger, relations to its neighbours, the Fronts' stages).
 * A move is an Effect that `marketModifiers` reads (a war that closes a lane, an embargo, a welcome that
 * lightens the dues), a line in the Power's own record, and a rumour that goes down the road with a true tale, and
 * sometimes a stale one and a false one beside it. Each Power draws from its own generator, seeded from the game's
 * seed, the month and the Power, so a stretch of months ticked at once is the same as the months ticked singly
 * and one Power's moves never disturb another's dice.
 *
 * The chances are the game's own tuning and not history; the KINDS of event are what the sources attest, and the
 * dated shocks (data.ts SCHEDULE) are what they attest by date. See docs/SOURCES.md, "Swahili coast, Malabar and
 * the Rule (D4)".
 */

export interface Ctx {
  st: PowersState;
  t: number;
  rng: Rng;
  year: number;
  note?: (text: string) => void;
}

export const yearOf = (t: number): number => dateFromDays(Math.floor(t / 86400)).year;
export const months = (rng: Rng, a: number, b: number): number => Math.round(rng.range(a, b));
export const att = (c: Ctx, p: PowerId): number => c.st.powers[p].attitude;
export const stageOf = (c: Ctx, f: FrontId): number => c.st.fronts[f].stage;
export const rel = (c: Ctx, a: PowerId, b: PowerId): number => c.st.powers[a].relations[b] ?? 0;
export const active = (c: Ctx, p: PowerId, kind: Effect['kind']): boolean => hasActive(c.st, p, kind, c.t);

export function logMove(c: Ctx, power: PowerId, kind: string, text: string): void {
  const p = c.st.powers[power];
  p.moves.push({ t: c.t, kind, text });
  if (p.moves.length > 40) p.moves.splice(0, p.moves.length - 40);
}

export interface Launch {
  kind: Effect['kind'];
  power: PowerId;
  ports: string[];
  /** Months it lasts. */
  dur: number;
  closes?: boolean;
  price?: Record<string, number>;
  stock?: Record<string, number>;
  appetite?: Record<string, number>;
  duesMult?: number;
  blight?: number;
  reason: string;
  /** The Power's own record, in a line. */
  said: string;
  rumour: { place: string; front?: FrontId; truth: Telling; stale?: Telling; falsehood?: Telling };
  /** Push a Front's offset by this many points as the move is made. */
  front?: { id: FrontId; delta: number };
  /** A line for the player's log (a move he would know of). */
  note?: string;
  kindName?: string;
}

/** Make a move: the effect, the record, the front, the rumour. */
export function launch(c: Ctx, o: Launch): Effect {
  const e = addEffect(c.st, {
    kind: o.kind, power: o.power, ports: o.ports, start: c.t, end: c.t + o.dur * MONTH, closes: o.closes,
    price: o.price, stock: o.stock, appetite: o.appetite, duesMult: o.duesMult, blight: o.blight, reason: o.reason,
  });
  logMove(c, o.power, o.kindName ?? o.kind, o.said);
  if (o.front) pull(c.st, o.front.id, o.front.delta);
  const made = announce(c.st, c.rng, c.t, {
    event: `effect:${e.id}`, place: o.rumour.place, power: o.power, front: o.rumour.front, window: o.dur + 2,
    truth: o.rumour.truth, stale: o.rumour.stale, falsehood: o.rumour.falsehood,
  });
  e.rumour = made[0].id;
  if (o.note) c.note?.(o.note);
  return e;
}

/** A move that is only a word: no effect on a market, a rumour and a line. */
export function say(c: Ctx, power: PowerId, kind: string, said: string, rumour: Launch['rumour'], window = 8, front?: { id: FrontId; delta: number }): void {
  logMove(c, power, kind, said);
  if (front) pull(c.st, front.id, front.delta);
  announce(c.st, c.rng, c.t, {
    event: `move:${power}:${kind}:${Math.floor(c.t / MONTH)}`, place: rumour.place, power, front: rumour.front, window,
    truth: rumour.truth, stale: rumour.stale, falsehood: rumour.falsehood,
  });
}

/** End every effect of a kind that a Power has in force (a truce, a lifted embargo). */
export function endAll(c: Ctx, power: PowerId, kind: Effect['kind']): number {
  let n = 0;
  for (const e of c.st.effects) if (e.power === power && e.kind === kind && e.end > c.t) { e.end = c.t; n++; }
  return n;
}

/** Offered a list of moves in order; the first whose chance comes up is made. Returns its name. */
export function oneOf(c: Ctx, moves: [string, number, () => void][]): string | null {
  for (const [name, p, run] of moves) {
    if (p > 0 && c.rng.chance(clamp(p, 0, 0.9))) { run(); return name; }
  }
  return null;
}

/** A favour the Power is asking, kept in its flags for the scenes: what, and until when. */
export function ask(c: Ctx, power: PowerId, what: string, monthsOpen: number): void {
  const f = c.st.powers[power].flags;
  f.ask = what;
  f.askUntil = c.t + monthsOpen * MONTH;
}
export function asking(st: PowersState, power: PowerId, t: number): string | null {
  const f = st.powers[power].flags;
  return typeof f.ask === 'string' && typeof f.askUntil === 'number' && t < f.askUntil ? f.ask : null;
}
export function clearAsk(st: PowersState, power: PowerId): void {
  delete st.powers[power].flags.ask;
  delete st.powers[power].flags.askUntil;
}
