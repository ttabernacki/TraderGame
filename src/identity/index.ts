import { Rng } from '../core/rng';
import type { Game } from '../game/state';
import { tickClauses } from './clauses';
import { generateName } from './names';
import { tickPatrons } from './patrons';
import { tickTitles } from './titles';

export * from './state';
export * from './clauses';
export * from './patrons';
export * from './titles';
export * from './calling';
export * from './dynasty';
export { generateName, heirName, cleanName, familyOf } from './names';

/** A save without a name, or a game just begun, gets one from the origin and the seed (never from the game's own stream). */
export function ensureName(g: Game): void {
  if (!g.identity.name) g.identity.name = generateName(g.origin, new Rng((g.seed ^ 0x1d3a) >>> 0));
}

/** Called as the days pass (once a game-day): clauses lapse or are forfeited, titles are earned, patrons turn. */
export function tickIdentity(g: Game): void {
  if (g.campaign === 'xiyang' || g.mode === 'title') return;
  if (g.clock.t - g.identity.lastDay < 86400) return;
  g.identity.lastDay = g.clock.t;
  ensureName(g);
  tickClauses(g);
  tickPatrons(g);
  tickTitles(g);
}
