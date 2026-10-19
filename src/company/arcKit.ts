import { clamp } from '../core/math';
import type { Officer } from '../crew/crew';
import type { Game } from '../game/state';
import type { BondId } from '../progression/arcs';

/**
 * The small verbs every arc beat is written in. Kept out of `progression/arcs`
 * so the new arcs and the codas can use them without importing it back.
 */

export type EndState = NonNullable<Officer['arcEnd']>;

export const flag = (o: Officer, f: string): boolean => (o.arcFlags ?? []).includes(f);

export function setFlag(o: Officer, f: string): void {
  if (!flag(o, f)) o.arcFlags = [...(o.arcFlags ?? []), f];
}

/** Move a man's regard for the captain, and give him something to remember. */
export function regard(o: Officer, delta: number, memory: string): void {
  o.loyalty = clamp(o.loyalty + delta, 0, 1);
  o.memory = [memory, ...(o.memory ?? [])].slice(0, 6);
}

/** The bond is struck: he is yours. The caller words what it does. */
export function strike(g: Game, o: Officer, bond: BondId): void {
  o.bonded = true;
  o.arcEnd = 'bonded';
  o.loyalty = clamp(o.loyalty + 0.25, 0, 1);
  g.awardBond(bond, o);
  g.noteDeed('companion.bonded', { target: o.name, magnitude: 0.8, note: `${o.name}'s story was carried to its end, and he is yours.` });
}

/**
 * The last word on his story. `ashore` puts him on the quay at the port she is
 * in (the berth empties; a bond already struck stays); `estranged` and
 * `betrayed` cut the thread and, if told to, take the bond away with him;
 * `dead` is a death that was chosen or could not be turned.
 */
export function close(
  g: Game, o: Officer, beats: number, end: EndState, why: string, dropBond?: BondId,
): void {
  o.arcEnd = end;
  o.memory = [why, ...(o.memory ?? [])].slice(0, 6);
  if (end === 'estranged' || end === 'betrayed') {
    o.arcStage = 99;
    if (dropBond) g.bonds.delete(dropBond);
    o.bonded = false;
  } else {
    o.arcStage = beats;
  }
  if (end === 'ashore') {
    o.ashoreAt = g.dockedAt ?? 'coast';
    o.ashoreSince = undefined;
    o.left = true;
    g.noteDeed('companion.left', { target: o.name, magnitude: 0.5, note: `${o.name} was left ashore: ${why}.` });
  } else if (end === 'estranged') {
    g.noteDeed('companion.estranged', { target: o.name, magnitude: 0.5, note: `${o.name}: ${why}.` });
  } else if (end === 'betrayed') {
    g.noteDeed('companion.betrayed', { target: o.name, magnitude: 0.8, note: `${o.name}: ${why}.` });
  } else if (end === 'dead') {
    o.alive = false;
    g.noteDeed('officer.died', { target: o.name, magnitude: 1, note: `${o.name}, your ${o.role}, ${why}.` });
  }
}

/**
 * A friendly departure from a beat that fires at sea: he goes ashore at the next
 * port with his leave, and the exit pipeline writes the one Ledger entry there.
 */
export function farewell(o: Officer, beats: number, why: string): void {
  o.arcEnd = 'ashore';
  o.arcStage = beats;
  o.leaving = true;
  o.memory = [why, ...(o.memory ?? [])].slice(0, 6);
}
