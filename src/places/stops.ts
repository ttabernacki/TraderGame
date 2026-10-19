import { good } from '../economy/goods';
import type { Game } from '../game/state';
import { characterOf } from '../world/portCharacter';
import type { PortDef } from '../world/ports';
import { rumourFacts } from '../world/powers/rumours';

/**
 * A Stop: every port that is not a Deep port, said honestly in four lines (BUILD_PLAN C4, Pillar 5).
 *
 * Water, a market, a rumour and a danger, generated from data the game already holds (the port's anchorage, refit,
 * produce and wants, `portCharacter`'s signature, custom and danger, and whatever the rumour mill has put about
 * here). There are no hand-written blurbs in it: a port that has nothing to say says so in one plain line.
 */

export interface Stop {
  name: string;
  water: string;
  market: string;
  rumour: string;
  danger: string;
}

const top = (m: Record<string, number>, n: number): string[] =>
  Object.entries(m).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => good(id).english.toLowerCase());

const list = (xs: string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export function waterLine(def: PortDef): string {
  if (def.refit > 0.6) return 'Good water, and a market for stock and greens.';
  if (def.refit > 0.3) return 'Water can be had, though it is a labour to get it aboard, and there is not much else.';
  return 'Little to be had. Take what you can and do not count on it.';
}

export function marketLine(def: PortDef): string {
  const ch = characterOf(def.id);
  const sells = top(def.produces, 3);
  const wants = top(def.wants, 3);
  const bits: string[] = [];
  if (sells.length) bits.push(`sells ${list(sells)}`);
  if (wants.length) bits.push(`wants ${list(wants)}`);
  const base = bits.length ? `A ${def.size === 'anchorage' ? 'roadstead' : def.size} that ${bits.join(' and ')}.` : 'Nothing much changes hands here.';
  const duty = ch?.duty && ch.duty < 0.99 ? ` Customs take ${Math.round((1 - ch.duty) * 100)}% of what you are paid.` : '';
  return base + duty;
}

export function dangerLine(def: PortDef): string {
  const ch = characterOf(def.id);
  if (ch?.danger) return ch.danger;
  if (def.anchorage < 0.3) return 'An open roadstead: if it comes on to blow, she runs for it.';
  if (def.anchorage < 0.5) return 'Fair holding, and no place to lie in an onshore blow.';
  return 'None the pilots mention.';
}

/** The strongest thing the mill has put about here that the captain has heard, or the port's gossip, or nothing. */
export function rumourLine(g: Game, def: PortDef): string {
  const heard = rumourFacts(g.powers, g.clock.t).filter((f) => f.place === def.id).sort((a, b) => b.confidence - a.confidence)[0];
  if (heard) return heard.claim;
  if (g.portGossip) return g.portGossip;
  return 'Nothing is being said that has not been said before.';
}

export function stopOf(g: Game, def: PortDef): Stop {
  return {
    name: def.name,
    water: waterLine(def),
    market: marketLine(def),
    rumour: rumourLine(g, def),
    danger: dangerLine(def),
  };
}
