import { clamp } from '../core/math';
import type { Rng } from '../core/rng';

/**
 * What a rich captain does with his money while he is at sea.
 *
 * By the fourth act a successful career is sitting on more cruzados than the
 * game gives it anything to spend on, and a Lisbon captain of the 1490s would
 * not have left his fortune in a chest. He put it to work in the three ways the
 * city offered: a share in somebody else's voyage (armar — outfitting a ship
 * he would never sail in), a house of his own on the Rua Nova, and land, which
 * was the only thing in Portugal that turned a merchant into a gentleman.
 *
 * All of it runs while the player is away. The income piles up in Lisbon and
 * is paid, with the news, the next time he enters a Portuguese port; a voyage
 * he put money into comes home or does not on its own calendar, and he hears
 * of it the same way — by letter, late.
 */

export type RouteId = 'madeira' | 'guinea' | 'mina' | 'congo' | 'india';

export interface RouteDef {
  id: RouteId;
  name: string;
  months: number;
  /** Chance the ship is lost and the stake with her. */
  risk: number;
  /** What a stake comes home as, lo to hi. */
  multiple: [number, number];
  /** First act in which anyone is outfitting for it. */
  act: number;
  cargo: string;
}

export const ROUTES: RouteDef[] = [
  { id: 'madeira', name: 'Madeira and home', months: 3, risk: 0.04, multiple: [1.06, 1.2], act: 1, cargo: 'sugar' },
  { id: 'guinea', name: 'The Guinea rivers', months: 6, risk: 0.12, multiple: [1.2, 1.7], act: 1, cargo: 'malagueta and hides' },
  { id: 'mina', name: 'São Jorge da Mina', months: 8, risk: 0.15, multiple: [1.35, 2.0], act: 1, cargo: 'gold' },
  { id: 'congo', name: 'The Congo and Angola', months: 12, risk: 0.22, multiple: [1.5, 2.5], act: 2, cargo: 'ivory and copper' },
  { id: 'india', name: 'The Indies', months: 20, risk: 0.38, multiple: [2.2, 4.8], act: 4, cargo: 'pepper' },
];

export const ROUTE_BY_ID = new Map(ROUTES.map((r) => [r.id, r]));

/** A voyage outfitted with the player's money and somebody else's seamanship. */
export interface Outfit {
  id: string;
  captain: string;
  ship: string;
  route: RouteId;
  /** What the whole outfitting wants; the player takes a share of it. */
  ask: number;
  /** 0.8 steady old hand to 1.3 young man in a hurry: multiplies the risk. */
  temper: number;
  /** Once taken up: the player's stake, and when she is due home. */
  stake?: number;
  sailedT?: number;
  dueT?: number;
  outcome?: 'home' | 'lost';
  payout?: number;
}

export type HoldingId = 'casa' | 'quinta' | 'engenho' | 'senhorio';

export interface HoldingDef {
  id: HoldingId;
  name: string;
  english: string;
  /** Price of each level; a holding with one entry has one level. */
  cost: number[];
  /** Cruzados a month at each level, before the year's luck. */
  income: number[];
  /** How far a month can swing either way, as a fraction. */
  swing: number;
  /** Renown a year the holding is worth at court. */
  renown: number;
  where: 'lisboa' | 'funchal';
  standing: number;
  act: number;
  blurb: string;
}

export const HOLDINGS: HoldingDef[] = [
  {
    id: 'casa', name: 'Casa na Rua Nova', english: 'A house on the Rua Nova',
    cost: [3000, 5500, 9500], income: [70, 160, 300], swing: 0.25, renown: 0, where: 'lisboa', standing: 60, act: 1,
    blurb: 'A counting house of your own among the Florentines and Genoese: a clerk, then a factor in Antwerp, then ships chartered in your name. It trades while you sail.',
  },
  {
    id: 'quinta', name: 'Quinta no Alentejo', english: 'An estate in the Alentejo',
    cost: [4200], income: [85], swing: 0.45, renown: 6, where: 'lisboa', standing: 120, act: 2,
    blurb: 'Wheat, cork and olives, a manor house with a tiled chapel, and tenants who touch their caps. The harvest decides the year. Land is what the court respects.',
  },
  {
    id: 'engenho', name: 'Engenho na Madeira', english: 'A sugar mill on Madeira',
    cost: [6500], income: [210], swing: 0.6, renown: 0, where: 'funchal', standing: 90, act: 1,
    blurb: 'Cane on the terraces above Funchal, a water-driven mill, and a price in Antwerp that nobody on the island controls. The richest thing you can buy, and the most fickle.',
  },
  {
    id: 'senhorio', name: 'Senhorio', english: 'A lordship from the Crown',
    cost: [15000], income: [120], swing: 0.15, renown: 25, where: 'lisboa', standing: 320, act: 3,
    blurb: 'A town and its rents, granted by the King to a subject he means to honour, for a consideration. You will be Senhor of somewhere, and your son after you.',
  },
];

export const HOLDING_BY_ID = new Map(HOLDINGS.map((h) => [h.id, h]));

export interface EstateState {
  outfits: Outfit[];
  offers: Outfit[];
  offersT: number;
  holdings: Partial<Record<HoldingId, number>>;
  /** Income and returns waiting in Lisbon. */
  accrued: number;
  /** Letters not yet read, delivered at the next Portuguese port. */
  news: string[];
  lastMonthT: number;
  lordship?: string;
  nextId: number;
  /** Everything the estate has ever paid out, for the ledger line. */
  earned: number;
}

export function newEstate(t: number): EstateState {
  return {
    outfits: [], offers: [], offersT: -1e12, holdings: {}, accrued: 0, news: [],
    lastMonthT: t, nextId: 1, earned: 0,
  };
}

const CAPTAINS = ['João Afonso', 'Pêro de Sintra', 'Gonçalo Vaz', 'Rui de Sousa', 'Diogo Gil',
  'Fernão Martins', 'Álvaro Mendes', 'Lopo Esteves', 'Nuno Fernandes', 'Bartolomeu Leite'];
const SHIPS = ['Santa Catarina', 'São Pedro', 'Bom Jesus', 'Santo António', 'Conceição',
  'São Miguel', 'Espera', 'Trindade', 'Garça', 'Santiago'];

/** Three voyages in want of money, refreshed at Lisbon every couple of months. */
export function offerOutfits(st: EstateState, act: number, rng: Rng, t: number): void {
  if (t - st.offersT < 60 * 86400 && st.offers.length) return;
  st.offersT = t;
  const routes = ROUTES.filter((r) => r.act <= act);
  st.offers = Array.from({ length: 3 }, () => {
    const r = rng.pick(routes);
    const temper = rng.pick([0.8, 1, 1, 1.15, 1.3]);
    const base = { madeira: 800, guinea: 1600, mina: 2400, congo: 3200, india: 6000 }[r.id];
    return {
      id: `o${st.nextId++}`,
      captain: rng.pick(CAPTAINS),
      ship: rng.pick(SHIPS),
      route: r.id,
      ask: Math.round((base * rng.range(0.8, 1.3)) / 50) * 50,
      temper,
    };
  });
}

export function temperWord(t: number): string {
  return t <= 0.85 ? 'an old hand who takes no chances'
    : t < 1.1 ? 'a sound man with a good name on the river'
      : t < 1.2 ? 'a pushing man who likes to be first home'
        : 'a young man in a hurry, and cheap for it';
}

/** The chance a stake with this captain on this route never comes back. */
export function lossChance(o: Outfit): number {
  const r = ROUTE_BY_ID.get(o.route)!;
  return clamp(r.risk * o.temper, 0.02, 0.6);
}

/**
 * A month of the estate: income from every holding, with the year's luck in it,
 * and every outfitted voyage whose day has come decided. Returns nothing; the
 * money and the letters wait in Lisbon.
 */
export function monthOfEstate(st: EstateState, rng: Rng, t: number, place: (id: HoldingId) => string): void {
  for (const [id, level] of Object.entries(st.holdings) as [HoldingId, number][]) {
    const h = HOLDING_BY_ID.get(id)!;
    const luck = 1 + rng.range(-h.swing, h.swing);
    const got = Math.round(h.income[level - 1] * luck);
    st.accrued += got;
    st.earned += got;
    if (luck < 1 - h.swing * 0.7) {
      st.news.push(`${place(id)}: a bad month — ${got} cruzados, and the steward's apologies.`);
    } else if (luck > 1 + h.swing * 0.7) {
      st.news.push(`${place(id)}: a very good month — ${got} cruzados.`);
    }
  }
  for (const o of st.outfits) {
    if (o.outcome || !o.dueT || t < o.dueT) continue;
    const r = ROUTE_BY_ID.get(o.route)!;
    if (rng.chance(lossChance(o))) {
      o.outcome = 'lost';
      o.payout = 0;
      st.news.push(`The ${o.ship}, ${o.captain}, outfitted with ${o.stake} of your cruzados for ${r.name}, `
        + 'has not come home and will not now. Nobody knows where she went down.');
    } else {
      const mult = rng.range(r.multiple[0], r.multiple[1]) * (o.temper > 1.1 ? 1.1 : o.temper < 0.9 ? 0.92 : 1);
      o.outcome = 'home';
      o.payout = Math.round((o.stake ?? 0) * mult);
      st.accrued += o.payout;
      st.earned += o.payout - (o.stake ?? 0);
      st.news.push(`The ${o.ship} is home from ${r.name} with ${r.cargo}. ${o.captain} has sold, and your `
        + `share of ${o.stake} comes back as ${o.payout} cruzados.`);
    }
  }
}
