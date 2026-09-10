import { NM, clamp, haversine, wrap360 } from '../core/math';
import type { Rng } from '../core/rng';
import { PORTS, portDef } from '../world/ports';

/**
 * The other captain.
 *
 * Discovery only means anything if it can be lost. A coast that will sit there
 * unfound until the player gets round to it is scenery; a coast that another
 * man is working his way down while you refit at Mina is a reason to sail.
 *
 * He is not simulated as a ship — that would be enormous and the player would
 * never see it. He is a name, a reputation, and a slowly advancing frontier
 * that eats southward down the African coast at a rate set by the year and by
 * how far ahead of him the player is. When he reaches somewhere first, the
 * renown for it is gone, and the court hears about it.
 */

export interface RivalState {
  name: string;
  ship: string;
  /** How far down the coast he has worked, as a latitude. Falls southward. */
  frontierLat: number;
  /** Places he has taken the credit for. */
  claimed: string[];
  /** Simulated seconds of his last reported return to Lisbon. */
  lastNews: number;
  /** Rises as he succeeds; the court compares the two of you by it. */
  standing: number;
  /** True once the player has decisively outdone him. */
  eclipsed: boolean;
}

const RIVALS = [
  { name: 'Diogo Cão', ship: 'the São Cristóvão of Lagos' },
  { name: 'Bartolomeu Dias', ship: 'the São Pantaleão' },
  { name: 'Duarte Pacheco Pereira', ship: 'the Espírito Santo' },
  { name: 'João Afonso de Aveiro', ship: 'a caravel of the Casa da Mina' },
];

export function newRival(rng: Rng): RivalState {
  const r = rng.pick(RIVALS);
  return {
    name: r.name,
    ship: r.ship,
    // He starts where Portuguese knowledge already stood in 1482.
    frontierLat: -6,
    claimed: [],
    lastNews: 0,
    standing: 20,
    eclipsed: false,
  };
}

export interface RivalNews {
  text: string;
  /** Ports he has just taken, so their discovery value can be struck off. */
  claimed: string[];
  /** True when this is the moment he passes the player. */
  overtaken: boolean;
}

/**
 * Advance him by `days`.
 *
 * His rate is deliberately a little slower than a determined player's, so a
 * captain who presses on stays ahead and one who spends two years trading in
 * Guinea comes home to find the Cape already rounded by somebody else. He also
 * slows down when he is a long way ahead — the further south he is, the harder
 * every mile of it — which keeps him from running away with the whole map.
 */
export function advanceRival(
  r: RivalState, days: number, playerLat: number, playerStanding: number, rng: Rng,
): RivalNews | null {
  if (r.eclipsed) return null;

  // Degrees of latitude a year, tapering with distance from home.
  const reach = clamp(1 - Math.abs(r.frontierLat) / 46, 0.25, 1);
  const behind = clamp((r.frontierLat - playerLat) / 25, 0, 1.2);
  const rate = (3.1 * reach + behind * 1.6) / 365;
  const before = r.frontierLat;
  r.frontierLat -= rate * days;
  r.standing += days * 0.035 * reach;

  // Anything he has passed and the player has not yet reached is his.
  const taken: string[] = [];
  for (const p of PORTS) {
    if (p.known || p.discovery <= 0) continue;
    if (r.claimed.includes(p.id)) continue;
    if (p.lat > before || p.lat < r.frontierLat) continue;
    // Only the Atlantic coast: he is not crossing to India by accident.
    if (p.lon > 25 || p.lon < -45) continue;
    if (rng.chance(0.55)) { r.claimed.push(p.id); taken.push(p.id); }
  }

  if (taken.length === 0) return null;
  const names = taken.map((id) => portDef(id).name);
  const overtaken = r.standing > playerStanding && !r.eclipsed;
  return {
    text: `Word from Lisbon: ${r.name} has returned in ${r.ship} and reported `
      + `${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}. `
      + `The court has entered ${names.length === 1 ? 'it' : 'them'} on the padrão real under his name.`,
    claimed: taken,
    overtaken,
  };
}

/** How the two of you stand, in the words the court would use. */
export function rivalStanding(r: RivalState, playerStanding: number): string {
  if (r.eclipsed) return `${r.name} is spoken of as a man who was once thought promising.`;
  const gap = playerStanding - r.standing;
  if (gap > 140) return `${r.name} is no longer mentioned in the same breath as you.`;
  if (gap > 40) return `You are the better regarded, though ${r.name} has his admirers.`;
  if (gap > -40) return `You and ${r.name} are reckoned about equal, which neither of you enjoys.`;
  if (gap > -140) return `${r.name} is the favourite. You are the alternative.`;
  return `${r.name} has the King's ear. You have a ship.`;
}

/** The frontier as a bearing and distance from the player, for the chart. */
export function rivalFrontier(r: RivalState): { lat: number; lon: number } {
  // Kept on the African coast, roughly, so it draws in a sensible place.
  const lon = r.frontierLat > -6 ? 9 : r.frontierLat > -22 ? 12 : 16;
  return { lat: r.frontierLat, lon };
}

export { wrap360, haversine, NM };
