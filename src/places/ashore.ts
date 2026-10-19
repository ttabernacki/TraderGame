import { clamp } from '../core/math';
import type { Game } from '../game/state';
import { characterOf } from '../world/portCharacter';
import { activeEntries, feverFactor } from './calendar';
import { deepPort } from './deep';

/**
 * What the company does ashore (BUILD_PLAN C4: Waterfront and Faith). Two small verbs on the existing meters
 * (`crew.morale`, `crew.sickness`, a hand's `regard`); nothing here adds state but the day it was last done.
 */

const DAY = 86400;
const WEEK = 7 * DAY;
const leaveKey = (port: string) => `place:leave:${port}`;
const massKey = (port: string) => `place:mass:${port}`;

export const LEAVE_COST_EACH = 0.25;

export function canGiveLeave(g: Game): string | null {
  const port = g.dockedAt;
  if (!port) return 'There is no shore to give them.';
  const last = g.powers.seen[leaveKey(port)];
  if (last !== undefined && g.clock.t - last < 10 * DAY) return 'The men were ashore here not ten days since. The quay has not forgotten it.';
  return null;
}

/** A day ashore for the company: morale and the fo'c'sle's regard up, a few cruzados spent, and the shore's own risks. */
export function shoreLeave(g: Game): string {
  const why = canGiveLeave(g);
  if (why) return why;
  const port = g.dockedAt!;
  const cost = Math.round(g.crew.count * LEAVE_COST_EACH);
  g.crown.gold = Math.max(0, g.crown.gold - cost);
  g.powers.seen[leaveKey(port)] = g.clock.t;
  g.crew.morale = clamp(g.crew.morale + 0.15, 0, 1);
  for (const h of g.hands) if (h.alive && h.aboard) h.regard = clamp(h.regard + 0.04, 0, 1);
  // The shore has its own opinion of a ship's company let loose on it.
  const ch = characterOf(port);
  const feverish = /fever/i.test(ch?.danger ?? '') || deepPort(port) !== null;
  let text = `The company went ashore for the day, ${cost} cruzados between them, and came back at dusk in a better humour than they went.`;
  if (feverish) {
    const surgeon = g.crew.officers.some((o) => o.alive && !o.ashoreAt && o.role === 'cirurgiao');
    const hit = 0.025 * feverFactor(deepPort(port), g.clock.t) * (surgeon ? 0.5 : 1);
    g.crew.sickness = clamp(g.crew.sickness + hit, 0, 1);
    text += surgeon ? ' The surgeon had them back before dark, and kept an eye on who had slept where.' : ' Two or three of them have not been right since.';
  }
  g.waitDays(1);
  return text;
}

export function canKeepDay(g: Game): string | null {
  const port = g.dockedAt;
  if (!port) return 'There is no shore to hear mass on.';
  const last = g.powers.seen[massKey(port)];
  if (last !== undefined && g.clock.t - last < WEEK) return 'The day has been kept here this week.';
  return null;
}

/** Hear mass, or keep the day: a little morale, more with a chaplain, more again on the place's own feast. */
export function keepTheDay(g: Game): string {
  const why = canKeepDay(g);
  if (why) return why;
  const port = g.dockedAt!;
  const deep = deepPort(port);
  const chaplain = g.crew.officers.some((o) => o.alive && !o.ashoreAt && o.role === 'capelao');
  const feast = deep ? activeEntries(deep, g.clock.t).find((e) => e.kind === 'feast') : undefined;
  const gain = 0.04 + (chaplain ? 0.04 : 0) + (feast?.morale ?? 0);
  g.crew.morale = clamp(g.crew.morale + gain, 0, 1);
  g.powers.seen[massKey(port)] = g.clock.t;
  g.waitDays(1);
  return feast
    ? `The company kept ${feast.name} with the Castle: mass, the flag at the masthead, and the factor’s table.${chaplain ? ' Your chaplain said the Office himself.' : ''}`
    : chaplain ? 'Your chaplain said mass on the quay, and the men stood through it.' : 'The company kept the day as well as men can without a priest: a prayer on the deck, and the watch relieved.';
}
