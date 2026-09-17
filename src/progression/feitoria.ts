import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import { GOOD_BY_ID, good } from '../economy/goods';
import type { PortDef } from '../world/ports';

/**
 * The factory.
 *
 * This was the Portuguese method, and it is what the whole century was
 * actually for. Not conquest and not colonies: a walled shed on a beach with
 * a clerk in it, a few men, a chapel, and a standing agreement with whoever
 * owns the ground. Arguim in 1445, São Jorge da Mina in 1482, and after them
 * every station down that coast and round it. The ships came and went; the
 * shed stayed, and bought all year.
 *
 * Until now a feitoria in this game was a boolean on the relations screen and
 * a trickle of coin at the quay. Nobody was in it, nothing was in it, nothing
 * could ever happen to it, and there was no decision anywhere in it. That is a
 * strange thing to leave hollow in a game about this trade, because a factory
 * is the only way a captain's work stops being a series of voyages and starts
 * being a *position*.
 *
 * What one is here:
 *
 *   - **A man you leave behind.** An officer out of your own wardroom, off the
 *     muster, out of the berth, for years. What he is decides what the station
 *     is: an able factor fills the shed, an honest one hands you the books, and
 *     they are not the same quality. This is the most expensive thing you will
 *     ever spend and it is not money.
 *   - **A shed with goods in it.** He buys all year at the price a resident
 *     pays, which is not the price a stranger pays, and it is waiting for you
 *     when you come. A cargo that takes three weeks and guts the market when a
 *     ship does it takes an afternoon when a factory has done it.
 *   - **Standing orders.** What he is to buy. A town can only put so much
 *     trade through one man in a year whatever it weighs, so the choice is not
 *     how much he accumulates but what shape it arrives in: a broad order
 *     fills the shed and half your hold, and an order for the one dear thing
 *     on that coast brings the same money aboard in a corner of it.
 *   - **Trouble.** A station is a foreign thing on somebody's shore. It is
 *     safe while the town wants it there and you keep coming back, and every
 *     month you do not come the arithmetic gets worse.
 *
 * The one rule this is written to: a factory is *never* free money. It always
 * costs the man, it always costs the visits, and it can always be lost.
 */

export type WorkId = 'palicada' | 'armazem' | 'torre' | 'capela' | 'batel' | 'bombardas';

export interface Work {
  id: WorkId;
  name: string;
  english: string;
  cost: number;
  /** Men it wants left there over and above the founding party. */
  hands: number;
  blurb: string;
}

export const WORKS: Work[] = [
  {
    id: 'palicada', name: 'Paliçada', english: 'Stockade', cost: 140, hands: 0,
    blurb: 'A ditch and a timber palisade round the shed. It will not stop an army and it was '
      + 'never meant to: it stops eleven men with torches, which is what actually burns factories.',
  },
  {
    id: 'armazem', name: 'Armazém', english: 'Warehouse', cost: 220, hands: 0,
    blurb: 'A proper stone-floored store with a roof that keeps the rain off. Holds half as much '
      + 'again, and what is in it stops rotting while it waits for a bottom.',
  },
  {
    id: 'torre', name: 'Torre de menagem', english: 'Keep', cost: 620, hands: 4,
    blurb: 'A square stone tower, which is what São Jorge da Mina is. Nothing on this coast can '
      + 'take one, and the fact of it standing there changes what the town thinks it is dealing with.',
  },
  {
    id: 'capela', name: 'Capela', english: 'Chapel', cost: 180, hands: 1,
    blurb: 'A chapel and a priest in it. Worth more than it looks: the men left here are not '
      + 'soldiers, they are frightened clerks a long way from home, and it is the one thing that '
      + 'makes the place somewhere rather than nowhere.',
  },
  {
    id: 'batel', name: 'Batel e remeiros', english: 'Boat and rowers', cost: 260, hands: 2,
    blurb: 'A shallow boat and men who know the river. The factor stops waiting for the trade to '
      + 'come down to him and goes up after it, which is most of the difference between a good '
      + 'station and a busy one.',
  },
  {
    id: 'bombardas', name: 'Bombardas', english: 'Guns', cost: 400, hands: 3,
    blurb: 'Two breech-loading pieces on the seaward face and men who have fired them. They are '
      + 'for the other crowns’ ships, not for the town, and everybody understands that.',
  },
];

export const WORK_BY_ID = new Map<WorkId, Work>(WORKS.map((w) => [w.id, w]));

export interface Feitoria {
  portId: string;
  /** The man in charge, by name, because that is how you will think of him. */
  factor: string;
  /** The officer he was, so the wardroom knows where he went. */
  officerId: string | null;
  /** How well he buys, 0-1. */
  ability: number;
  /** How much of what he buys reaches the books, 0-1. */
  honesty: number;
  founded: number;
  /** Last time you stood in the place and had the books read to you. */
  settled: number;
  works: WorkId[];
  /** Men left there, all told. */
  garrison: number;
  /** What is in the shed, in trading units. */
  stock: Record<string, number>;
  /** What the shed paid for it, per unit, so a profit can be reckoned. */
  paid: Record<string, number>;
  /** Coin the factor holds on your account, for buying with. */
  chest: number;
  /** The standing order: what he is to buy, in preference. */
  buying: string[];
  /** How the town feels about the station itself, 0-1. */
  regard: number;
  /** How near it is to going wrong, 0-1. */
  trouble: number;
  lost: boolean;
  lostWhy?: string;
  /** Lifetime, for the last page. */
  landed: number;
  paidOut: number;
}

/** Room in the shed, in trading units of average bulk. */
export function capacityOf(f: Feitoria): number {
  let tons = 26;
  if (f.works.includes('armazem')) tons += 14;
  if (f.works.includes('torre')) tons += 10;
  return tons;
}

/** What is in the shed, in tons, so it can be weighed against a hold. */
export function stockTons(f: Feitoria): number {
  let t = 0;
  for (const [id, q] of Object.entries(f.stock)) {
    const g = GOOD_BY_ID.get(id);
    if (g) t += g.bulk * q;
  }
  return t;
}

/** What is in the shed, at Lisbon prices, which is not what it cost. */
export function stockValue(f: Feitoria): number {
  let v = 0;
  for (const [id, q] of Object.entries(f.stock)) {
    const g = GOOD_BY_ID.get(id);
    if (g) v += g.lisbon * q;
  }
  return Math.round(v);
}

/** What the shed paid for what is in it. */
export function stockCost(f: Feitoria): number {
  let v = 0;
  for (const [id, q] of Object.entries(f.stock)) v += (f.paid[id] ?? 0) * q;
  return Math.round(v);
}

export function garrisonWanted(works: WorkId[]): number {
  return 6 + works.reduce((s, id) => s + (WORK_BY_ID.get(id)?.hands ?? 0), 0);
}

/**
 * What a station of this size is worth defending with.
 *
 * Not a combat number. It is the reason the thing does not simply get burned
 * one night, and it is the whole return on spending money on works rather than
 * on a bigger ship.
 */
export function strengthOf(f: Feitoria): number {
  let s = 0.12 + Math.min(f.garrison, 24) * 0.018;
  if (f.works.includes('palicada')) s += 0.16;
  if (f.works.includes('torre')) s += 0.34;
  if (f.works.includes('bombardas')) s += 0.14;
  return clamp(s, 0, 0.95);
}

/** How fast it buys, in tons a day. */
export function buyRate(f: Feitoria, def: PortDef): number {
  const size = { anchorage: 0.35, village: 0.5, town: 0.8, city: 1, emporium: 1.3 }[def.size];
  let r = 0.11 * size * (0.45 + f.ability * 0.75) * (0.5 + clamp(f.regard, 0, 1) * 0.8);
  if (f.works.includes('batel')) r *= 1.45;
  return r;
}

/**
 * How much trade the place can actually put through him in a day, in cruzados
 * of Lisbon value.
 *
 * The bulk limit alone is not a limit at all, and measuring this the wrong way
 * round produced the worst number in the game. Gold stows at a thousandth of a
 * ton the marco, so a station told to buy gold was capped by a shed it could
 * never come near filling: one at Mina with two and a half thousand cruzados
 * in the chest bought three hundred and twenty-four marcos in a year — more
 * than twice everything the town's own market held — and handed the captain
 * seventeen thousand cruzados of Lisbon value for one call. That is not a
 * trading post, it is a printing press.
 *
 * A town can only produce so much, whatever it is worth by weight. So the real
 * constraint is value, and it is set by how big and how rich the place is and
 * how good the man is at getting at it. Calibrated so that a well-run station
 * at Mina accumulates something like a good freight charter over a year and a
 * long way short of a spice cargo, which is where a thing you get for free
 * while you are elsewhere belongs.
 */
export function throughput(f: Feitoria, def: PortDef): number {
  const size = { anchorage: 0.3, village: 0.5, town: 0.8, city: 1.05, emporium: 1.3 }[def.size];
  let v = 5.3 * size * (0.55 + def.wealth) * (0.6 + f.ability * 0.8)
    * (0.45 + clamp(f.regard, 0, 1) * 0.75);
  if (f.works.includes('batel')) v *= 1.4;
  if (f.works.includes('armazem')) v *= 1.1;
  return v;
}

/** Goods this station could plausibly be told to buy. */
export function buyable(def: PortDef): string[] {
  return Object.keys(def.produces).filter((id) => GOOD_BY_ID.has(id));
}

/** What a resident pays, against what the quay charges a stranger. */
export function residentPrice(goodId: string, def: PortDef): number {
  const g = good(goodId);
  const abundance = def.produces[goodId] ?? 0.4;
  // A factor buys at the head of the trade, all year, in small parcels, and he
  // is not a ship in a hurry with a hold to fill before the monsoon. That is
  // most of the point of having one.
  return Math.max(0.2, g.lisbon * (0.14 + 0.16 * (1 - clamp(abundance, 0, 1))));
}

export interface FactoryNews {
  /** Days the books cover. */
  days: number;
  /** Tons bought in. */
  bought: number;
  spent: number;
  /** Coin taken in selling your European goods and the factor's own dealing. */
  earned: number;
  /** What he quietly kept. */
  skimmed: number;
  /** Spoiled in the shed. */
  spoiled: number;
  /** Trouble accrued over the period. */
  troubleAdded: number;
}

/**
 * Run the station forward.
 *
 * Simulated in one pass at the quay rather than tick by tick, because nothing
 * about it is worth a frame of anybody's time while the ship is a thousand
 * miles away — and because a factor's year is exactly the kind of thing that
 * ought to arrive as a set of books read out to you.
 */
export function runFactory(
  f: Feitoria, def: PortDef, days: number, rng: Rng, portRegard: number,
): FactoryNews {
  const news: FactoryNews = {
    days, bought: 0, spent: 0, earned: 0, skimmed: 0, spoiled: 0, troubleAdded: 0,
  };
  if (days <= 0 || f.lost) return news;

  // The town's opinion of the station drifts toward the town's opinion of you,
  // and a chapel and a few years of not being trouble move it further.
  const want = clamp(portRegard * 0.8 + (f.works.includes('capela') ? 0.18 : 0)
    + (f.works.includes('torre') ? -0.1 : 0), 0, 1);
  f.regard += (want - f.regard) * clamp(days / 400, 0, 0.6);

  // Buying. He has the chest, the room, and what the place can actually put
  // through him, and no more than any of the three.
  //
  // The share-out across the order matters more than it looks. The first
  // version gave the head of the list one part in 1.6 and everything else one
  // part in the list's length, which meant a *focused* order — the one the
  // screen tells the player is the aggressive choice — spent less of the
  // year's trade than a vague one. Naming one dear thing has to mean the whole
  // budget goes at it, so the weights are normalised over the list and a
  // second pass spends whatever the first could not.
  const order = f.buying.length > 0 ? f.buying : buyable(def);
  const room = Math.max(0, capacityOf(f) - stockTons(f));
  let tonsLeft = Math.min(room, buyRate(f, def) * days);
  let valueLeft = throughput(f, def) * days;
  const budget = valueLeft;
  const weights = order.map((_, i) => (f.buying.length > 0 ? [0.55, 0.3, 0.15][i] ?? 0.1 : 1));
  const total = weights.reduce((x, y) => x + y, 0) || 1;

  const take = (id: string, valueAllowed: number, tonsAllowed: number): void => {
    if (valueAllowed <= 0.5 || tonsAllowed <= 1e-5 || f.chest <= 1) return;
    const g = GOOD_BY_ID.get(id);
    if (!g) return;
    const per = residentPrice(id, def);
    const units = Math.floor(Math.min(
      tonsAllowed / Math.max(g.bulk, 1e-6),
      valueAllowed / Math.max(g.lisbon, 0.01),
      f.chest / Math.max(per, 0.01),
    ));
    if (units < 1) return;
    const cost = units * per;
    const held = f.stock[id] ?? 0;
    const heldCost = (f.paid[id] ?? per) * held;
    f.stock[id] = held + units;
    f.paid[id] = (heldCost + cost) / (held + units);
    f.chest -= cost;
    tonsLeft -= units * g.bulk;
    valueLeft -= units * g.lisbon;
    news.bought += units * g.bulk;
    news.spent += cost;
  };

  order.forEach((id, i) => take(id, budget * (weights[i] / total), tonsLeft));
  // And again with what is left over, because a good that ran out of room or
  // out of coin should not take the year's trade down with it.
  for (const id of order) take(id, valueLeft, tonsLeft);

  // The station's own dealing: he sells the European stuff, he takes a cut of
  // what passes through, and in a good place that is real money.
  const size = { anchorage: 0.3, village: 0.5, town: 0.85, city: 1.1, emporium: 1.5 }[def.size];
  // Deliberately the smaller half of what a station is worth. The shed is the
  // point of having one; the counter trade is what keeps the chest full enough
  // to go on filling it.
  const gross = days * size * (1.1 + f.ability * 2.2) * (0.4 + clamp(f.regard, 0, 1) * 1.2)
    * (0.85 + def.wealth * 0.5) * 0.55;
  const skim = gross * (1 - f.honesty) * 0.55;
  news.earned = Math.round(gross - skim);
  news.skimmed = Math.round(skim);
  f.chest += news.earned;

  // Damp, weevils and the roof. A proper warehouse is most of the answer.
  const shelter = f.works.includes('armazem') ? 0.35 : 1;
  for (const [id, q] of Object.entries(f.stock)) {
    const g = GOOD_BY_ID.get(id);
    if (!g || g.spoilage <= 0) continue;
    const lost = q * (1 - (1 - g.spoilage * shelter) ** (days / 30));
    if (lost <= 0) continue;
    f.stock[id] = Math.max(0, q - lost);
    news.spoiled += lost * g.bulk;
  }

  // And the arithmetic that gets worse while you are away.
  //
  // Three things drive it and they are all the captain's doing or his neglect:
  // how long since a Portuguese ship was seen off the place, how the town feels
  // about it, and how little there is to discourage anybody who fancies the
  // contents of the shed.
  const neglect = clamp((days - 200) / 700, 0, 1);
  const disliked = clamp(0.55 - f.regard, 0, 1);
  const weak = 1 - strengthOf(f);
  const add = clamp(neglect * 0.5 + disliked * 0.7 * (days / 365) + weak * 0.12 * (days / 365),
    0, 0.85);
  f.trouble = clamp(f.trouble + add, 0, 1);
  news.troubleAdded = add;
  void rng;
  return news;
}

/** How the books read, in one line. */
export function factoryLine(f: Feitoria, def: PortDef): string {
  if (f.lost) return `${def.name} — gone. ${f.lostWhy ?? ''}`.trim();
  const tons = stockTons(f);
  return `${def.name} — ${f.factor}, ${f.garrison} men, ${tons.toFixed(1)} tons in the shed, `
    + `${Math.round(f.chest)} cruzados in the chest.`;
}

export function troubleWord(t: number): string {
  if (t >= 0.8) return 'It is going to be burned';
  if (t >= 0.58) return 'Bad, and getting worse';
  if (t >= 0.36) return 'Uneasy';
  if (t >= 0.16) return 'Watchful';
  return 'Quiet';
}

export function regardWordF(r: number): string {
  if (r >= 0.78) return 'The town treats it as its own';
  if (r >= 0.55) return 'Welcome enough';
  if (r >= 0.32) return 'Tolerated';
  if (r >= 0.14) return 'Resented';
  return 'They want it gone';
}
