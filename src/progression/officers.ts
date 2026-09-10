import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import { OFFICER_ROLES, type CrewState, type Officer, type OfficerRole } from '../crew/crew';

/**
 * The men aft.
 *
 * A crew that is only a number of hands and a morale bar is a resource, and
 * resources are managed, not remembered. What makes a three-month passage worth
 * sailing is that there are six or seven people on the quarterdeck with names,
 * opinions, and an idea of what you ought to be doing — and that some of them
 * are right.
 *
 * A trait does two things at once, which is the whole design: it moves a number
 * in the simulation, and it gives the man a position to take when something
 * happens. The pilot who is never wrong about the reckoning is the same pilot
 * who wants to put the helm up for Portugal, and the captain has to weigh one
 * against the other with no way of knowing which will matter.
 */

export interface TraitDef {
  id: string;
  name: string;
  /** How the man is spoken of. */
  blurb: string;
  /** Roles this can land on; empty means any. */
  roles: OfficerRole[];
  /** Effects, all small, all additive across the officers aboard. */
  effects: Partial<TraitEffects>;
}

export interface TraitEffects {
  /** Added to daily morale drift. */
  morale: number;
  /** Multiplies unrest accumulation. */
  unrest: number;
  /** Reduces dead-reckoning error, as a fraction. */
  reckoning: number;
  /** Multiplies the crew's willingness to work the ship. */
  handling: number;
  /** Multiplies the dread of unsailed water. Below one is a steadier ship. */
  fear: number;
  /** Fraction added to renown for discoveries. */
  discovery: number;
  /** Fraction added to prices got in trade. */
  trade: number;
  /** Reduces the chance of losing spars when carrying too much canvas. */
  prudence: number;
  /** Fraction added to what the surgeon can do. */
  physic: number;
}

export const TRAITS: TraitDef[] = [
  {
    id: 'steady', name: 'Steady',
    blurb: 'Nothing gets a rise out of him. The hands have noticed and it steadies them too.',
    roles: [], effects: { morale: 0.004, unrest: 0.8 },
  },
  {
    id: 'hardhorse', name: 'A hard horse',
    blurb: 'Drives the hands with the rope’s end. Sail comes in fast and the fo’c’sle hates him.',
    roles: ['contramestre', 'mestre'], effects: { handling: 1.14, morale: -0.005, unrest: 1.25 },
  },
  {
    id: 'exact', name: 'Exact',
    blurb: 'Keeps the traverse board like a ledger and will argue with the sun.',
    roles: ['piloto', 'escrivao'], effects: { reckoning: 0.22 },
  },
  {
    id: 'timid', name: 'Cautious to a fault',
    blurb: 'Has an opinion about every headland and it is always to stand further off.',
    roles: ['piloto', 'mestre'], effects: { prudence: 0.3, fear: 1.3, discovery: -0.05 },
  },
  {
    id: 'ambitious', name: 'Ambitious',
    blurb: 'Means to have a ship of his own, and is keeping his own account of this voyage.',
    roles: [], effects: { discovery: 0.12, unrest: 1.15 },
  },
  {
    id: 'pious', name: 'Devout',
    blurb: 'Says the office whether there is a chaplain aboard or not. It carries the men further than you would think.',
    roles: [], effects: { morale: 0.005, fear: 0.82 },
  },
  {
    id: 'drunk', name: 'Fond of the wine',
    blurb: 'Sound enough before noon.',
    roles: [], effects: { reckoning: -0.14, morale: 0.002, handling: 0.94 },
  },
  {
    id: 'sealawyer', name: 'A sea lawyer',
    blurb: 'Knows every article of the Crown’s regulations and quotes them aft.',
    roles: ['escrivao', 'contramestre'], effects: { unrest: 1.35, trade: 0.05 },
  },
  {
    id: 'curious', name: 'Curious',
    blurb: 'Draws everything: coasts, fish, the faces of strangers. Half of it is useful.',
    roles: [], effects: { discovery: 0.14, reckoning: 0.07 },
  },
  {
    id: 'haggler', name: 'A hard bargainer',
    blurb: 'Would get a price out of a rock.',
    roles: ['escrivao', 'lingua'], effects: { trade: 0.11 },
  },
  {
    id: 'veteran', name: 'Guinea-hardened',
    blurb: 'Has been down the coast twice and buried men on both voyages. Very little surprises him.',
    roles: [], effects: { fear: 0.75, handling: 1.06, morale: 0.002 },
  },
  {
    id: 'healer', name: 'Knows the herbs',
    blurb: 'Learned something on the Guinea coast that the Lisbon physicians do not admit to.',
    roles: ['cirurgiao', 'capelao', 'lingua'], effects: { physic: 0.35 },
  },
  {
    id: 'reckless', name: 'Carries it away',
    blurb: 'Would sail her under before he handed a sail.',
    roles: ['mestre', 'contramestre'], effects: { handling: 1.1, prudence: -0.35, fear: 0.9 },
  },
  {
    id: 'sullen', name: 'Sullen',
    blurb: 'Does what he is told and not one thing more.',
    roles: [], effects: { morale: -0.004, handling: 0.95 },
  },
];

const EMPTY: TraitEffects = {
  morale: 0, unrest: 1, reckoning: 0, handling: 1, fear: 1,
  discovery: 0, trade: 0, prudence: 0, physic: 0,
};

export function traitDef(id: string | undefined): TraitDef | null {
  if (!id) return null;
  return TRAITS.find((t) => t.id === id) ?? null;
}

/** Give an officer a character, if one fits his place. */
export function assignTrait(o: Officer, rng: Rng): void {
  const fits = TRAITS.filter((t) => t.roles.length === 0 || t.roles.includes(o.role));
  if (fits.length === 0 || !rng.chance(0.8)) return;
  o.trait = rng.pick(fits).id;
}

export function assignTraits(crew: CrewState, rng: Rng): void {
  for (const o of crew.officers) if (!o.trait) assignTrait(o, rng);
}

/**
 * The wardroom's combined effect on the ship. Additive for the things that add
 * and multiplicative for the things that scale, so two hard horses drive the
 * hands harder than one and two devout men are not twice as brave.
 */
export function wardroom(crew: CrewState): TraitEffects {
  const out: TraitEffects = { ...EMPTY };
  for (const o of crew.officers) {
    if (!o.alive || o.ashoreAt) continue;
    const def = traitDef(o.trait);
    if (!def) continue;
    // A man the captain has fallen out with is worth less of whatever he is.
    const weight = clamp(0.45 + o.loyalty * 0.75, 0.3, 1.2) * clamp(0.5 + o.ability, 0.5, 1.4);
    const e = def.effects;
    out.morale += (e.morale ?? 0) * weight;
    out.reckoning += (e.reckoning ?? 0) * weight;
    out.discovery += (e.discovery ?? 0) * weight;
    out.trade += (e.trade ?? 0) * weight;
    out.prudence += (e.prudence ?? 0) * weight;
    out.physic += (e.physic ?? 0) * weight;
    out.unrest *= 1 + ((e.unrest ?? 1) - 1) * weight;
    out.handling *= 1 + ((e.handling ?? 1) - 1) * weight;
    out.fear *= 1 + ((e.fear ?? 1) - 1) * weight;
  }
  out.unrest = clamp(out.unrest, 0.5, 2);
  out.handling = clamp(out.handling, 0.7, 1.4);
  out.fear = clamp(out.fear, 0.5, 1.8);
  out.prudence = clamp(out.prudence, -0.6, 0.7);
  return out;
}

/** How a man is getting on with his captain, in the words the ship would use. */
export function loyaltyWord(l: number): string {
  if (l > 0.85) return 'would follow you anywhere';
  if (l > 0.68) return 'yours';
  if (l > 0.5) return 'correct';
  if (l > 0.32) return 'cool';
  if (l > 0.16) return 'has been heard talking';
  return 'against you';
}

export function officerTitle(o: Officer): string {
  return OFFICER_ROLES.find((r) => r.role === o.role)?.title ?? o.role;
}

/** A one-line description of a man for a list. */
export function officerLine(o: Officer): string {
  const t = traitDef(o.trait);
  return t ? `${officerTitle(o)} — ${t.name.toLowerCase()}` : officerTitle(o);
}
