import type { Game } from '../game/state';
import { end } from './arc';

/**
 * The old-save resolver (BUILD_PLAN E1 / §2.2): a thread in flight when the engine arrived is never dropped.
 *
 * The thread record (`Game.quests`) is unchanged, so its step pointer IS the arc's open beat (`open.<arc>.<step>`) and
 * its flags ARE its qualities (`story.<arc>.<flag>`): nothing is converted. What this does is settle what cannot go on
 * (the two threads cut as threads), forget the old machinery's "put and not answered" mark (the engine keeps its own),
 * and write the qualities that did not exist before from the flags that did (the Kilwa promise).
 * Idempotent: a second load changes nothing.
 */

/** Threads cut as threads (BUILD_PLAN E1): a story still open is closed, with a line, and nothing is refunded or charged. */
const CUT: Record<string, string> = {
  malay: 'Nina Chatu’s letters to the King of Kotte and the Sultan of Malacca were never delivered; the road ends on the Malabar coast, and the merchant sailed without a captain.',
  pepperhouse: 'The Casa’s clerk and the man from the Rua Nova took the question of your Houses’ pepper to the contracts board, where it is settled by the quay and not by a conversation.',
};

export function resolveOldSaves(g: Game): string[] {
  const lines: string[] = [];
  for (const q of g.quests) {
    q.fired = false;
    if (!q.outcome && CUT[q.id]) lines.push(end(g, q, 'lapsed', CUT[q.id]));
    if (q.id === 'sofala' && q.flags.promise) g.web.flags['flag.promise.kilwa.first_call'] = true;
  }
  return lines;
}
