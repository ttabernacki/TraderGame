import { clamp } from '../core/math';
import type { Rng } from '../core/rng';

/**
 * The men forward.
 *
 * The wardroom has had names and stories since the officers were written. The
 * fo'c'sle was a number: twenty-four hands, of whom some fraction had scurvy
 * and some fraction were dead. A voyage where a fifth of the company dies is
 * the central fact of this route and it was being reported as an integer going
 * down — "3 men dead since the last reckoning" — which is a casualty figure and
 * not a thing that happens to anybody.
 *
 * So a handful of them have names. Not all: a captain did not know every man on
 * a nau by name and this game should not pretend he did. Eight or so, which is
 * about what a man remembers off one deck — the ones who are good at something,
 * or trouble, or young enough that everybody watches out for them. When the
 * mortality rolls it takes from the whole complement, and whether it takes one
 * of these is a matter of proportion and luck, so losing a named man is not
 * scripted and lands the way it should.
 *
 * They also have opinions. `regard` is this man's own view of the captain,
 * which is not the same thing as the ship's morale: a crew can be in good
 * spirits and still contain three men who have not forgiven you for the
 * flogging at Arguim. That is what decides who comes aft with the ringleader
 * and who stands behind you, and it is why a mutiny in this game now has sides
 * with names on them instead of a dice roll against a skill.
 */

export type Rating =
  | 'marinheiro' | 'grumete' | 'bombardeiro' | 'carpinteiro' | 'calafate' | 'pagem';

export const RATING_LABEL: Record<Rating, { pt: string; english: string }> = {
  marinheiro: { pt: 'Marinheiro', english: 'Able seaman' },
  grumete: { pt: 'Grumete', english: 'Ordinary seaman' },
  bombardeiro: { pt: 'Bombardeiro', english: 'Gunner' },
  carpinteiro: { pt: 'Carpinteiro', english: 'Carpenter' },
  calafate: { pt: 'Calafate', english: 'Caulker' },
  pagem: { pt: 'Pagem', english: 'Ship’s boy' },
};

/**
 * What sort of man he is, which decides how he takes a hard voyage.
 *
 * These are not stat blocks. Each one answers a single question — when the ship
 * has been ninety days at sea and the water is short, does this man lead the
 * others aft, follow them, or stand between them and the captain?
 */
export type Temper = 'steady' | 'sullen' | 'bold' | 'devout' | 'sly' | 'young';

export const TEMPER: Record<Temper, {
  label: string;
  /** How readily he leads a mutiny. */
  lead: number;
  /** How readily he joins one somebody else leads. */
  follow: number;
  /** How fast his regard falls when the voyage goes badly. */
  brittle: number;
  line: string;
}> = {
  steady: {
    label: 'Steady', lead: 0.1, follow: 0.5, brittle: 0.7,
    line: 'Does the work and says little. The kind of man a ship is actually made of.',
  },
  sullen: {
    label: 'Sullen', lead: 1.3, follow: 1.5, brittle: 1.5,
    line: 'Keeps a tally of everything that has been done to him and has never forgotten any of it.',
  },
  bold: {
    label: 'Bold', lead: 1.6, follow: 0.9, brittle: 1.1,
    line: 'First up the shrouds and first to say aloud what the rest are thinking.',
  },
  devout: {
    label: 'Devout', lead: 0.15, follow: 0.4, brittle: 0.6,
    line: 'Believes the voyage is in God’s hands, which makes him very hard to frighten.',
  },
  sly: {
    label: 'Sly', lead: 0.8, follow: 1.7, brittle: 1.3,
    line: 'Never the one holding the knife. Always somewhere near the man who is.',
  },
  young: {
    label: 'Young', lead: 0.2, follow: 1.2, brittle: 1.2,
    line: 'Fourteen, and away from home for the first time. The others look out for him.',
  },
};

export interface Hand {
  id: string;
  name: string;
  /** Where he is from, which is what a man is asked first and remembered by. */
  from: string;
  rating: Rating;
  temper: Temper;
  /** His own view of the captain, 0-1. Not the ship's morale. */
  regard: number;
  alive: boolean;
  /** Aboard, or left somewhere. */
  aboard: boolean;
  /** What became of him, for the log and the last page. */
  fate?: string;
  /** Simulated seconds it happened. */
  fateT?: number;
  /** Things the captain did that this man has not forgotten. */
  memory?: string[];
}

const FIRST = [
  'João', 'Pero', 'Álvaro', 'Gonçalo', 'Fernão', 'Vasco', 'Estêvão', 'Martim',
  'Lourenço', 'Rodrigo', 'Nuno', 'Diogo', 'Afonso', 'Bartolomeu', 'Simão',
  'Gil', 'Tristão', 'Duarte', 'Jorge', 'Antão',
];

const SURNAME = [
  'Fernandes', 'Gonçalves', 'Rodrigues', 'Álvares', 'Dias', 'Esteves', 'Nunes',
  'Lopes', 'Peres', 'Vaz', 'Martins', 'Anes', 'Cabral', 'Teixeira', 'Barbosa',
  'Coelho', 'Palha', 'Cordeiro', 'Ramires', 'Falcão',
];

/** Where the hands came from, which on this route was a very short list. */
const HOME = [
  'Lisboa', 'Setúbal', 'Lagos', 'Sesimbra', 'Aveiro', 'Porto', 'Viana',
  'Tavira', 'Peniche', 'Matosinhos', 'Olhão', 'Buarcos', 'Caminha', 'Faro',
];

const RATINGS: { rating: Rating; weight: number }[] = [
  { rating: 'marinheiro', weight: 4 },
  { rating: 'grumete', weight: 3 },
  { rating: 'bombardeiro', weight: 1 },
  { rating: 'carpinteiro', weight: 1 },
  { rating: 'calafate', weight: 1 },
  { rating: 'pagem', weight: 1 },
];

const TEMPERS: Temper[] = ['steady', 'steady', 'sullen', 'bold', 'devout', 'sly', 'young'];

/**
 * The men the captain knows by name.
 *
 * Eight of them, and one of each of the rarer ratings so the carpenter and the
 * caulker are people rather than an abstract capability — losing the carpenter
 * off the Cape should have a name attached to it.
 */
export function musterHands(rng: Rng, count = 8): Hand[] {
  const out: Hand[] = [];
  const used = new Set<string>();
  // One each of the specialists, then the rest off the general list.
  const wanted: Rating[] = ['carpinteiro', 'calafate', 'bombardeiro', 'pagem'];

  // Tempers and home towns are dealt without replacement.
  //
  // Drawn independently, eight men out of a seven-temper list produced two
  // devout able seamen both from Faro with the same sentence under each of
  // them, which on the screen reads as a bug rather than as a coincidence. A
  // shuffled deck gives a spread of characters, and only repeats a temper once
  // the deck runs out — by which point the man has a different rating and a
  // different town and the repetition is invisible.
  const temperDeck = rng.shuffle([...TEMPERS]);
  const homeDeck = rng.shuffle([...HOME]);
  let ti = 0;
  let hi = 0;

  for (let i = 0; i < count; i++) {
    let name = '';
    for (let tries = 0; tries < 30; tries++) {
      name = `${rng.pick(FIRST)} ${rng.pick(SURNAME)}`;
      if (!used.has(name)) break;
    }
    used.add(name);
    const rating = i < wanted.length ? wanted[i] : pickRating(rng);
    // The ship's boy is fourteen whatever the deck says.
    const temper: Temper = rating === 'pagem' ? 'young' : nextTemper();
    out.push({
      id: `h${i + 1}`,
      name,
      from: homeDeck[hi++ % homeDeck.length],
      rating,
      temper,
      // They do not begin as friends. They begin as men who have signed for a
      // voyage nobody sensible signs for, and will make their minds up at sea.
      regard: clamp(0.5 + rng.normal(0, 0.1), 0.2, 0.8),
      alive: true,
      aboard: true,
      memory: [],
    });
  }
  return out;

  /** Next off the shuffled deck, skipping 'young', which belongs to the boy. */
  function nextTemper(): Temper {
    for (let guard = 0; guard < TEMPERS.length * 2; guard++) {
      const t = temperDeck[ti++ % temperDeck.length];
      if (t !== 'young') return t;
    }
    return 'steady';
  }
}

function pickRating(rng: Rng): Rating {
  const total = RATINGS.reduce((s, r) => s + r.weight, 0);
  let n = rng.next() * total;
  for (const r of RATINGS) {
    n -= r.weight;
    if (n <= 0) return r.rating;
  }
  return 'marinheiro';
}

/** Those still aboard and alive, which is who the ship is actually worked by. */
export function aboardHands(hands: Hand[]): Hand[] {
  return hands.filter((h) => h.alive && h.aboard);
}

/**
 * Men signed on partway through the voyage, to replace the ones who are gone.
 *
 * The fo'c'sle used to be mustered once at Lisbon and never added to, while the
 * port screen had a button that put the anonymous head-count straight back to
 * complement for six cruzados a man. So a voyage that buried half the men it
 * knew by name sailed on with a full muster and an empty fo'c'sle, and the one
 * system the game had for making a death mean something quietly emptied out
 * over a career.
 *
 * `home` is where they are being shipped from, which decides both the names and
 * how they start out: a man taken on at Lisbon has signed for the voyage, and a
 * man taken on at Malindi has signed for a ship full of strangers going
 * somewhere he has never heard of, and knows less and trusts less accordingly.
 */
export function signOnHands(
  rng: Rng, count: number, home: string, portuguese: boolean, existing: Hand[],
): Hand[] {
  const out: Hand[] = [];
  const used = new Set(existing.map((h) => h.name));
  let next = existing.length + 1;
  for (let i = 0; i < count; i++) {
    let name = '';
    for (let tries = 0; tries < 30; tries++) {
      name = `${rng.pick(FIRST)} ${rng.pick(SURNAME)}`;
      if (!used.has(name)) break;
    }
    used.add(name);
    out.push({
      id: `h${next++}`,
      name,
      from: portuguese ? rng.pick(HOME) : home,
      rating: pickRating(rng),
      temper: rng.pick(TEMPERS.filter((t) => t !== 'young')),
      // A man shipped abroad, into a ship whose company has been together for a
      // year and whose language may not be his, does not start where the others
      // started. He starts lower and has to be won over like anybody else.
      regard: clamp((portuguese ? 0.46 : 0.34) + rng.normal(0, 0.09), 0.15, 0.75),
      alive: true,
      aboard: true,
      memory: [],
    });
  }
  return out;
}

/**
 * Move one man's opinion, and let him remember why.
 *
 * A brittle man moves further on the same event than a steady one, which is the
 * whole of what temper does to the numbers.
 */
export function shiftRegard(h: Hand, delta: number, why?: string): void {
  const scale = delta < 0 ? TEMPER[h.temper].brittle : 1;
  h.regard = clamp(h.regard + delta * scale, 0, 1);
  if (why) {
    h.memory = [why, ...(h.memory ?? [])].slice(0, 5);
  }
}

/** Everybody forward hears about it. */
export function shiftAll(hands: Hand[], delta: number, why?: string): void {
  for (const h of aboardHands(hands)) shiftRegard(h, delta, why);
}

export function regardWord(r: number): string {
  if (r > 0.78) return 'would follow you anywhere';
  if (r > 0.6) return 'thinks well of you';
  if (r > 0.42) return 'has no opinion he will say aloud';
  if (r > 0.25) return 'has his doubts';
  return 'has not forgiven you';
}
