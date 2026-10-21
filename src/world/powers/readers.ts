import type { ReaderId } from './deltas';

/**
 * Which consumers of the Fronts and the Powers exist: each registers itself where it lives (`declareReader`), and
 * scripts/powers.ts checks the tables' `reader`s against this. A module of its own, with no imports but a type, so that
 * a consumer far from the engine (the patrons, the Lines) can register without pulling the engine in a cycle.
 */
const declared = new Set<ReaderId>();
export function declareReader(id: ReaderId): ReaderId { declared.add(id); return id; }
export const declaredReaders = (): ReaderId[] => [...declared];
