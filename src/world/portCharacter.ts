import { clamp } from '../core/math';
import type { Game } from '../game/state';

/**
 * What makes a port itself.
 *
 * Every harbour used to be the same screen with different numbers in it: a
 * produce list, a wants list, and a blurb. The places the carreira actually
 * turned on were not like that. Benin wanted coral for the Oba and nothing
 * else would open the palace; Melinde's sultan wanted horses and gave Gama his
 * pilot; the Zamorin took his customs on every bale; Mombaça sent swimmers to
 * cut the cables. Each of these is one line of text and one real rule, applied
 * where the rule belongs — in the market's prices, on the anchor coming down,
 * or as an errand the town will reward you for.
 */

export interface PortQuest {
  id: string;
  /** What is asked, in the town's words. */
  ask: string;
  good: string;
  qty: number;
  gold: number;
  /** Regard with every port of the same people. */
  regard: number;
  renown: number;
  /** What happens when it is done. */
  done: string;
  /** A port that goes on the chart when it is done. */
  reveals?: string;
}

export interface PortCharacter {
  /** The one thing the place is known for, in a few words. */
  signature: string;
  /** How business is done here, and the rule that goes with it. */
  custom?: string;
  /** Multiplies what they pay for everything you sell. Customs, a monopoly. */
  duty?: number;
  /** Per-good price changes: ask is what they charge, bid what they pay. */
  prices?: Record<string, { ask?: number; bid?: number }>;
  /** What the place does to a ship that comes to anchor. */
  danger?: string;
  arrive?: (g: Game, first: boolean) => string | null;
  quest?: PortQuest;
}

const fever = (amount: number) => (g: Game): string | null => {
  const surgeon = g.crew.officers.some((o) => o.alive && !o.ashoreAt && o.role === 'cirurgiao');
  const hit = surgeon ? amount * 0.5 : amount;
  g.crew.sickness = clamp(g.crew.sickness + hit, 0, 1);
  return surgeon
    ? 'The fever came off the river at night. The surgeon had them sleeping aboard with the '
      + 'ports shut, and it was not as bad as it might have been.'
    : 'The fever came off the river at night, and by the morning watch there were men '
      + 'shaking in their hammocks.';
};

export const CHARACTER: Record<string, PortCharacter> = {
  lisboa: {
    signature: 'The Casa da Mina and the King’s spice monopoly',
    custom: 'The Casa takes the King’s share on every quintal of spice landed on the Tagus.',
    prices: { pimenta: { bid: 0.92 }, canela: { bid: 0.92 }, cravo: { bid: 0.92 }, noz: { bid: 0.92 }, gengibre: { bid: 0.92 } },
  },
  funchal: {
    signature: 'Sugar, and nothing to eat',
    custom: 'Every terrace on the island is cane. Sugar is cheaper here than anywhere in the world.',
    prices: { acucar: { ask: 0.8 }, trigo: { bid: 1.25 } },
    quest: {
      id: 'funchal-wheat', good: 'trigo', qty: 30, gold: 90, regard: 0, renown: 3,
      ask: 'The island grows sugar and imports its bread. The captain of the donatary would '
        + 'take thirty quintals of wheat at a price, and remember who brought it.',
      done: 'The wheat went ashore in lighters and the donatary’s man paid in good coin. '
        + 'Your name will be known in Funchal.',
    },
  },
  arguim: {
    signature: 'Gum and gold from the Sahara caravans',
    custom: 'A Crown fort, and a Crown monopoly. The factor takes a tenth of every sale.',
    duty: 0.9,
    prices: { goma: { ask: 0.8 } },
  },
  cantor: {
    signature: 'The gold fair on the Gambia',
    custom: 'The Mandinka merchants come down the river with gold dust for cloth and brass.',
    prices: { ouro: { ask: 0.88 }, panos: { bid: 1.15 } },
    danger: 'The river fever. Men who sleep ashore do not always wake well.',
    arrive: (g) => fever(0.06)(g),
  },
  'serra-leoa': {
    signature: 'The best watering place on the coast',
    custom: 'A stream runs into the bay clear enough to drink. The casks are filled for nothing.',
    arrive: (g) => {
      const p = g.crew.provisions;
      const want = 100 + g.ship.effects.water;
      if (p.water >= want) return null;
      p.water = want;
      return 'Filled every cask from the stream at the head of the bay. The men drank until '
        + 'they were sick, and nobody minded.';
    },
  },
  mina: {
    signature: 'Gold, under the King’s own flag',
    custom: 'The gold is the King’s. The captain of the castle adds the royal fifth to every ounce.',
    prices: { ouro: { ask: 1.2 }, manilhas: { bid: 1.2 }, panos: { bid: 1.15 } },
    danger: 'The castle is healthy. The beach below it is not.',
    arrive: (g) => fever(0.03)(g),
  },
  ugoton: {
    signature: 'The Oba’s city, and the Oba’s coral',
    custom: 'Coral is regalia in Benin. They pay for it as other men pay for gold.',
    prices: { coral: { bid: 1.35 } },
    quest: {
      id: 'benin-coral', good: 'coral', qty: 10, gold: 0, regard: 0.3, renown: 6,
      ask: 'The Oba’s chamberlain lets it be known that a gift of coral — real coral, from '
        + 'the Middle Sea — would be remembered at court.',
      done: 'The coral went up to the palace under a guard of spearmen. The chamberlain came back '
        + 'the next day with a leopard skin and the Oba’s thanks, which is worth more.',
    },
  },
  mpinda: {
    signature: 'The Manikongo’s river',
    custom: 'The king of Kongo wants what Portugal makes: iron, tools, masons and priests.',
    prices: { ferramenta: { bid: 1.3 } },
    quest: {
      id: 'kongo-tools', good: 'ferramenta', qty: 20, gold: 60, regard: 0.3, renown: 6,
      ask: 'The Mani Soyo asks whether the King of Portugal would send iron tools to his brother '
        + 'of Kongo — for the building of a church, he says.',
      done: 'The tools went upriver by canoe with an escort of the Mani Soyo’s men. Word came '
        + 'back from Mbanza Kongo before you had watered.',
    },
  },
  'sao-bras': {
    signature: 'Cattle from the herdsmen, and water',
    custom: 'The herdsmen trade oxen and sheep for a handful of bells or brass.',
    danger: 'Dias’s men shot one of them here over the watering place. They have not forgotten.',
    arrive: (g) => {
      const p = g.crew.provisions;
      p.fresh = Math.max(p.fresh, 20);
      return 'Bought three oxen and a dozen sheep on the beach for brass bells. Fresh meat '
        + 'for the first time in months.';
    },
  },
  mocambique: {
    signature: 'The sultan’s island and the Arab pilots',
    custom: 'Every ship of the coast calls here. They know the monsoon better than any man in Lisbon.',
    prices: { ouro: { ask: 0.92 } },
    danger: 'The sultan was friendly until he found out you were not Muslim.',
  },
  mombaca: {
    signature: 'The coast’s richest port, and the least friendly',
    custom: 'Mombaça and Melinde are at war. A friend of one is an enemy of the other.',
    danger: 'Swimmers come out by night to cut the cables.',
    arrive: (g) => {
      if (g.rng.chance(0.35)) {
        g.ship.condition.hull = clamp(g.ship.condition.hull - 0.03, 0, 1);
        return 'Swimmers came out in the middle watch and cut at the cable. The anchor watch '
          + 'saw them in time, but she dragged onto the reef before the second anchor held.';
      }
      return null;
    },
  },
  melinde: {
    signature: 'The sultan who wants horses',
    custom: 'Mombaça’s enemy, and so a friend to anybody Mombaça hates.',
    prices: { cavalos: { bid: 1.5 } },
    quest: {
      id: 'melinde-horses', good: 'cavalos', qty: 4, gold: 200, regard: 0.35, renown: 10,
      ask: 'The sultan would give a great deal for horses — Arabian horses, for his guard. He '
        + 'has a pilot who knows the road to Calecute, and he is not above trading him.',
      done: 'Four horses swung ashore in slings, and the sultan came down to the beach to see them. '
        + 'He sent a pilot aboard that evening, a Gujarati who has made the crossing to Calecute '
        + 'twenty times, and before he had been aboard an hour Calecute was on the chart.',
      reveals: 'calecute',
    },
  },
  calecute: {
    signature: 'Pepper, and the Zamorin’s customs house',
    custom: 'Every bale that crosses the Zamorin’s beach pays his duty.',
    duty: 0.88,
    prices: { pimenta: { ask: 0.85 }, gengibre: { ask: 0.9 } },
    danger: 'The Moorish merchants own the Zamorin’s ear, and they want you gone.',
  },
  cochim: {
    signature: 'Pepper, and a raja looking for an ally',
    custom: 'The raja of Cochim pays tribute to the Zamorin and resents it. He charges no duty '
      + 'to anybody who might help him stop.',
    prices: { pimenta: { ask: 0.9 } },
  },
  ormuz: {
    signature: 'Horses and pearls from the Gulf',
    custom: 'The key of the Gulf. The king takes a heavy duty on everything that passes.',
    duty: 0.86,
    prices: { cavalos: { ask: 0.75 }, perolas: { ask: 0.8 } },
  },
  goa: {
    signature: 'The horse market of the Deccan',
    custom: 'The Deccan sultans buy every horse that comes ashore for their cavalry.',
    prices: { cavalos: { bid: 1.4 } },
  },
  malaca: {
    signature: 'Every ship of the East',
    custom: 'Cloves and nutmeg from the Moluccas, silk and porcelain from China, all in one roadstead.',
    duty: 0.94,
    prices: { cravo: { ask: 0.8 }, noz: { ask: 0.8 }, maca: { ask: 0.8 } },
  },
};

export function characterOf(portId: string): PortCharacter | null {
  return CHARACTER[portId] ?? null;
}

/** Multipliers the market applies here. */
export function priceMod(portId: string, goodId: string): { ask: number; bid: number } {
  const c = CHARACTER[portId];
  if (!c) return { ask: 1, bid: 1 };
  const m = c.prices?.[goodId];
  return { ask: m?.ask ?? 1, bid: (m?.bid ?? 1) * (c.duty ?? 1) };
}
