import { NM, clamp, haversine, wrap360, type LatLon } from '../core/math';
import type { Rng } from '../core/rng';
import { PORTS, portDef, type PortDef } from '../world/ports';
import { people } from '../world/peoples';

/**
 * Hearsay.
 *
 * The single hardest problem in an exploration game is telling the player where
 * to go without telling him what is there. A map with a marker on it is not
 * exploration; a featureless ocean with nothing to aim at is not a game. What
 * actual explorers had was neither: they had rumour. A pilot at Malindi who had
 * made the crossing, a merchant who had seen cinnamon come up from the south, a
 * captured seaman who spoke of a strait.
 *
 * A lead is that. It names no coordinates. It gives a rough direction and
 * distance from somewhere the player knows, drawn from a real place he has not
 * found yet, and it is *wrong* — by as much as its source is unreliable. Sailing
 * to where the rumour says and finding nothing is a real outcome, and finding
 * the thing eighty miles further on is the game working correctly.
 */

export type LeadKind = 'port' | 'passage' | 'goods' | 'water' | 'peril';

export interface Lead {
  id: string;
  kind: LeadKind;
  /** What the player was told, in the words of whoever told him. */
  text: string;
  /** Who said it, and where. */
  source: string;
  /** Where the rumour points, which is not necessarily where the thing is. */
  lat: number;
  lon: number;
  /** How far the rumour might be out, in nautical miles. */
  errorNm: number;
  /** The port this is really about, when it is about one. */
  targetPort?: string;
  /** Renown for running it down. */
  value: number;
  /** Simulated seconds when it was heard. */
  heard: number;
  followed: boolean;
  /** Set when the player reached the place and it was not there. */
  false: boolean;
}

/** How much a teller can be relied on, which sets how far out his rumour is. */
const RELIABILITY: Record<string, number> = {
  pilot: 0.9, merchant: 0.72, captain: 0.68, fisherman: 0.6,
  slave: 0.55, sailor: 0.5, wanderer: 0.35, drunkard: 0.2,
};

const TELLERS = [
  { role: 'pilot', name: 'a pilot' },
  { role: 'merchant', name: 'a merchant' },
  { role: 'captain', name: 'the master of a coasting vessel' },
  { role: 'fisherman', name: 'a fisherman' },
  { role: 'sailor', name: 'a seaman off a dhow' },
  { role: 'wanderer', name: 'a man who had walked a long way' },
  { role: 'drunkard', name: 'a man in a wine shop' },
];

/**
 * Generate a rumour heard at this port, or null when there is nothing worth
 * hearing. What can be heard depends on where you are: nobody in Lisbon has any
 * idea what is south of the Congo, and everybody at Malindi knows the way to
 * India.
 */
export function hearRumour(
  at: PortDef,
  known: Set<string>,
  rng: Rng,
  t: number,
  nextId: () => string,
): Lead | null {
  // The places this port could plausibly have heard of: near enough that its
  // trade or its fishermen reach them, and not somewhere the player has already
  // been.
  const candidates = PORTS.filter((p) => {
    if (p.id === at.id || known.has(p.id)) return false;
    const d = haversine({ lat: at.lat, lon: at.lon }, { lat: p.lat, lon: p.lon }) / NM;
    if (d < 60) return false;
    // A great port's reach is long; a fishing village's is not.
    const reach = 300 + at.wealth * 2200 + (at.size === 'city' ? 900 : 0);
    return d < reach;
  });
  if (candidates.length === 0) return null;

  // Weighted toward the interesting: somewhere rich, somewhere far, somewhere
  // nobody in Portugal has heard of.
  const target = pickWeighted(candidates, (p) => {
    const d = haversine({ lat: at.lat, lon: at.lon }, { lat: p.lat, lon: p.lon }) / NM;
    return (0.4 + p.wealth) * (1 + p.discovery / 60) * (1 + d / 900);
  }, rng);
  if (!target) return null;

  const teller = rng.pick(TELLERS);
  const reliability = RELIABILITY[teller.role] ?? 0.5;
  const errorNm = clamp((1 - reliability) * 420 + rng.range(0, 90), 15, 420);

  // The rumour points somewhere near the truth, not at it.
  const bearing = rng.next() * 360;
  const offset = rng.next() * errorNm * 0.8;
  const lat = target.lat + Math.cos(bearing * Math.PI / 180) * (offset / 60);
  const lon = target.lon + Math.sin(bearing * Math.PI / 180) * (offset / 60)
    / Math.max(Math.cos(target.lat * Math.PI / 180), 0.2);

  const dist = haversine({ lat: at.lat, lon: at.lon }, { lat: target.lat, lon: target.lon }) / NM;
  const dir = compassWord(bearingBetween({ lat: at.lat, lon: at.lon }, { lat, lon }));
  const days = Math.round(dist / 110);
  const pe = people(target.people);

  const kind: LeadKind = target.wealth > 0.7 ? 'goods' : target.refit > 0.7 ? 'water' : 'port';
  const text = buildRumourText(kind, target, pe.name, dir, days, teller.name, reliability);

  return {
    id: nextId(),
    kind,
    text,
    source: `${teller.name} at ${at.name}`,
    lat, lon, errorNm,
    targetPort: target.id,
    value: Math.max(6, Math.round(target.discovery * 0.45 + dist / 40)),
    heard: t,
    followed: false,
    false: false,
  };
}

function buildRumourText(
  kind: LeadKind, target: PortDef, peopleName: string,
  dir: string, days: number, teller: string, reliability: number,
): string {
  const hedge = reliability > 0.75
    ? 'He has been there himself and drew the coast on the table in wine.'
    : reliability > 0.5
      ? 'He had it from his brother, who trades that way.'
      : 'He was very sure of it, which is not the same as being right.';

  const run = days <= 1 ? 'a day\'s sail' : `some ${days} days' sail`;

  switch (kind) {
    case 'goods': {
      const good = Object.keys(target.produces)[0] ?? 'spice';
      return `You are told by ${teller} of a place ${run} to the ${dir}, where the ${peopleName} `
        + `trade ${good} in quantity and have never seen a Portuguese ship. ${hedge}`;
    }
    case 'water':
      return `${capitalise(teller)} speaks of a bay ${run} to the ${dir} with good water and `
        + `shelter from every wind but the westerly. ${hedge}`;
    default:
      return `${capitalise(teller)} speaks of a town ${run} to the ${dir}, of the ${peopleName}, `
        + `with a king in it and a harbour. ${hedge}`;
  }
}

/**
 * Whether standing at this position runs the lead down. A rumour is confirmed
 * by finding what it was about, not by arriving at the coordinates it named —
 * which is the whole difference between a rumour and a chart.
 */
export function checkLead(lead: Lead, pos: LatLon): 'found' | 'empty' | null {
  if (lead.followed) return null;
  if (lead.targetPort) {
    const def = portDef(lead.targetPort);
    if (haversine(pos, { lat: def.lat, lon: def.lon }) / NM < 22) return 'found';
  }
  // Arrived where the rumour pointed and there is nothing here.
  if (haversine(pos, { lat: lead.lat, lon: lead.lon }) / NM < 12) return 'empty';
  return null;
}

function pickWeighted<T>(items: T[], weight: (x: T) => number, rng: Rng): T | null {
  let total = 0;
  for (const i of items) total += Math.max(weight(i), 0);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (const i of items) {
    r -= Math.max(weight(i), 0);
    if (r <= 0) return i;
  }
  return items[items.length - 1];
}

function bearingBetween(from: LatLon, to: LatLon): number {
  const dLat = to.lat - from.lat;
  const dLon = (to.lon - from.lon) * Math.cos(from.lat * Math.PI / 180);
  return wrap360((Math.atan2(dLon, dLat) * 180) / Math.PI);
}

const WORDS = [
  'north', 'north-east', 'east', 'south-east',
  'south', 'south-west', 'west', 'north-west',
];

function compassWord(bearing: number): string {
  return WORDS[Math.round(wrap360(bearing) / 45) % 8];
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
