import type { SeaChoice, SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';

/** Authoring sugar shared by the Deep ports: a beat is had when answered; a scene is a SeaEvent at the quay. */
export const mark = (g: Game, id: string): void => { g.powers.seen[`place:${id}`] = g.clock.t; delete g.powers.seen[`fired:place:${id}`]; };

export const scene = (id: string, title: string, text: string, choices: SeaChoice[]): SeaEvent =>
  ({ id: `place:${id}`, title, text, severity: 'note', choices, council: false });

export const spend = (g: Game, n: number): boolean => { if (g.crown.gold < n) return false; g.crown.gold -= n; return true; };
