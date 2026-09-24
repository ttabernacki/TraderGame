export type UpgradeCategory = 'hull' | 'rig' | 'stores' | 'equipment' | 'service';

export interface UpgradeEffects {
  /** Multiplies how fast weed and shipworm accumulate. */
  foulingRate?: number;
  /** Multiplies the hull's grip on the water, reducing leeway. */
  keel?: number;
  /** Multiplies structural strength against storm damage. */
  strength?: number;
  /** Multiplies total sail area. */
  sailArea?: number;
  /** Extra cargo capacity in tons (negative takes room). */
  hold?: number;
  /** Extra days of water carried. */
  water?: number;
  /** Multiplies how readily she answers her helm. */
  handiness?: number;
  /** Multiplies how fast the pumps clear the bilge. */
  pumping?: number;
  /** Multiplies spoilage of cargo in the hold. */
  spoilage?: number;
  /** Multiplies how fast the scurvy comes on once the fresh food is gone. */
  scurvy?: number;
  /** A proper longboat: kedging, landing through surf, watering off a beach. */
  boat?: boolean;
  /** A sheet anchor and spare cable, for riding out a lee shore. */
  anchors?: boolean;
  /** Pieces of ordnance. */
  guns?: number;
  /** Converts every lateen mast to square, or the reverse. */
  convertRig?: 'square' | 'lateen';
}

export interface Upgrade {
  id: string;
  name: string;
  english: string;
  category: UpgradeCategory;
  cost: number;
  /** Renown with the Crown required before the yard will fit it. */
  standing: number;
  /** Days in the yard. */
  days: number;
  effects: UpgradeEffects;
  /** Hull classes this can be fitted to; omitted means all. */
  hulls?: string[];
  /** Takes no fitting place: a service, or a change to the ship herself. */
  free?: boolean;
  blurb: string;
}

/**
 * How many fittings a hull has room for.
 *
 * Every hull is a compromise, and it used to be possible to buy your way out of
 * that: every upgrade on the list, one after another, until the caravel was
 * sheathed, reinforced, deep-keeled, topsailed, pumped, stowed and armed and
 * better at everything. A ship has so much room below and so many men to work
 * what is fitted to her, so she carries a loadout — an explorer, a trader, a
 * ship that can fight — and choosing it is the decision.
 */
export const FITTING_PLACES: Record<string, number> = {
  barcha: 2,
  'caravela-latina': 3,
  'caravela-redonda': 4,
  'nau-pequena': 4,
  nau: 5,
  'nau-da-india': 6,
};

export function placesFor(hullId: string): number {
  return FITTING_PLACES[hullId] ?? 4;
}

/**
 * The fittings. Each does one thing well and costs something real, so none of
 * them is simply better: that is what makes choosing a loadout a choice.
 */
export const UPGRADES: Upgrade[] = [
  // --- The yard's own work ------------------------------------------------
  {
    id: 'breame', name: 'Querenar', english: 'Careen and breame',
    category: 'service', cost: 40, standing: 0, days: 6, free: true,
    effects: {},
    blurb: 'Lay her over on a beach at spring tides, burn the weed off the bottom, and pay it with tallow. Clears the fouling entirely.',
  },
  {
    id: 'aparelho-redondo', name: 'Aparelhar de redondo', english: 'Re-rig her square',
    category: 'rig', cost: 540, standing: 20, days: 16, free: true,
    effects: { convertRig: 'square' },
    hulls: ['caravela-latina', 'caravela-redonda'],
    blurb: 'Cross the yards and make her a square-rigger. She will run down the trades far faster and will never again lie within six points of the wind.',
  },
  {
    id: 'aparelho-latino', name: 'Aparelhar de latina', english: 'Re-rig her lateen',
    category: 'rig', cost: 540, standing: 20, days: 16, free: true,
    effects: { convertRig: 'lateen' },
    hulls: ['caravela-latina', 'caravela-redonda'],
    blurb: 'Strike the yards and rig her lateen throughout. She will beat off a lee shore, and crawl home across the ocean.',
  },

  // --- Hull ---------------------------------------------------------------
  {
    id: 'chumbo', name: 'Forro de chumbo', english: 'Lead sheathing',
    category: 'hull', cost: 520, standing: 40, days: 14,
    effects: { foulingRate: 0.35, hold: -4, sailArea: 0.97 },
    blurb: 'Lead sheets over tarred hair. The worm and the weed barely touch her, and she stays fast for a year instead of four months. The weight costs a little speed and a little room.',
  },
  {
    id: 'cavername', name: 'Cavername dobrado', english: 'Doubled frames',
    category: 'hull', cost: 420, standing: 25, days: 16,
    effects: { strength: 1.35, hold: -6 },
    blurb: 'Doubled futtocks and heavier knees. She takes a sea off the Cape that would open a lighter ship. The timber takes room below.',
  },
  {
    id: 'quilha', name: 'Quilha funda', english: 'Deepened keel',
    category: 'hull', cost: 360, standing: 20, days: 12,
    effects: { keel: 1.55, handiness: 0.9 },
    blurb: 'More wood below the waterline. She grips the sea and makes far less leeway, so she claws off a lee shore that would have her. She is slower to come about.',
  },

  // --- Rig ----------------------------------------------------------------
  {
    id: 'gavea', name: 'Gáveas', english: 'Topsails',
    category: 'rig', cost: 380, standing: 30, days: 8,
    effects: { sailArea: 1.2, strength: 0.94 },
    blurb: 'Small sails over the courses. A fifth more canvas and a knot or more in the trades. The top-hamper strains the masts in a blow.',
  },
  {
    id: 'bonetas', name: 'Bonetas', english: 'Bonnets',
    category: 'rig', cost: 140, standing: 0, days: 3,
    effects: { sailArea: 1.1 },
    blurb: 'Extra strips laced to the foot of the courses. Cheap canvas, and the easiest tenth of a knot you will ever buy.',
  },

  // --- Stores -------------------------------------------------------------
  {
    id: 'pipas', name: 'Pipas de água', english: 'Water casks',
    category: 'stores', cost: 120, standing: 0, days: 3,
    effects: { water: 45, hold: -8 },
    blurb: 'Forty-five more days of water, for eight tons of cargo. On a long passage it is almost always the right trade.',
  },
  {
    id: 'arrumacao', name: 'Arrumação apertada', english: 'Tight stowage',
    category: 'stores', cost: 180, standing: 10, days: 5,
    effects: { hold: 14, pumping: 0.85 },
    blurb: 'Dunnage, battens and a mate who knows how to stow. Fourteen more tons in the same hull — and the pump well buried under cargo where nobody can get at it.',
  },
  {
    id: 'paiol-seco', name: 'Paiol seco', english: 'Dry store room',
    category: 'stores', cost: 240, standing: 15, days: 6,
    effects: { spoilage: 0.55, hold: -4 },
    blurb: 'A lined, sealed room for the spices. Pepper that arrives dry is worth twice pepper that arrives sweating.',
  },
  {
    id: 'capoeiras', name: 'Capoeiras e fogão', english: 'Hen coops and a galley',
    category: 'stores', cost: 200, standing: 10, days: 4,
    effects: { scurvy: 0.6, hold: -3 },
    blurb: 'Live hens, a goat, cress growing in wet sacking and a proper firebox to cook on. The scurvy comes on far more slowly. The deck is a farmyard.',
  },

  // --- Equipment ----------------------------------------------------------
  {
    id: 'bombas', name: 'Bombas de cadeia', english: 'Chain pumps',
    category: 'equipment', cost: 200, standing: 10, days: 5,
    effects: { pumping: 2.2, hold: -2 },
    blurb: 'Every ship of this age leaks. With chain pumps the watch clears twice the water for the same work — the difference between an old ship and a lost one.',
  },
  {
    id: 'batel', name: 'Batel grande', english: 'Longboat',
    category: 'equipment', cost: 150, standing: 0, days: 3,
    effects: { boat: true, hold: -2 },
    blurb: 'A proper boat. A kedge laid out properly when she is aground, and a padrão landed through surf that would swamp a skiff.',
  },
  {
    id: 'ancoras', name: 'Âncora da esperança', english: 'Sheet anchor and cable',
    category: 'equipment', cost: 170, standing: 10, days: 2,
    effects: { anchors: true, hold: -3 },
    blurb: 'The anchor of last resort, and a second cable to ride to. Ships are lost by dragging onto a lee shore with nothing left to let go.',
  },
  {
    id: 'bombardas', name: 'Bombardas', english: 'Bombards',
    category: 'equipment', cost: 450, standing: 30, days: 6,
    effects: { guns: 6, hold: -5 },
    blurb: 'Six pieces on the waist and a gunner who knows them. Boarding goes your way, and a corsair counts your ports and looks for somebody else.',
  },
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

type Combined = Required<Omit<UpgradeEffects, 'convertRig'>> & { convertRig?: 'square' | 'lateen' };

/** Combine every fitted upgrade into a single set of effects. */
export function combineEffects(ids: string[]): Combined {
  const acc: Combined = {
    foulingRate: 1, keel: 1, strength: 1, sailArea: 1, hold: 0, water: 0,
    handiness: 1, pumping: 1, spoilage: 1, scurvy: 1, boat: false, anchors: false, guns: 0,
  };
  for (const id of ids) {
    const u = UPGRADE_BY_ID.get(id);
    if (!u) continue;
    const e = u.effects;
    if (e.foulingRate !== undefined) acc.foulingRate *= e.foulingRate;
    if (e.keel !== undefined) acc.keel *= e.keel;
    if (e.strength !== undefined) acc.strength *= e.strength;
    if (e.sailArea !== undefined) acc.sailArea *= e.sailArea;
    if (e.hold !== undefined) acc.hold += e.hold;
    if (e.water !== undefined) acc.water += e.water;
    if (e.handiness !== undefined) acc.handiness *= e.handiness;
    if (e.pumping !== undefined) acc.pumping *= e.pumping;
    if (e.spoilage !== undefined) acc.spoilage *= e.spoilage;
    if (e.scurvy !== undefined) acc.scurvy *= e.scurvy;
    if (e.boat) acc.boat = true;
    if (e.anchors) acc.anchors = true;
    if (e.guns) acc.guns += e.guns;
    if (e.convertRig) acc.convertRig = e.convertRig;
  }
  return acc;
}

/** Fittings actually taking a place aboard. Unknown ids from old saves are free. */
export function placesUsed(fitted: string[]): number {
  return fitted.filter((id) => {
    const u = UPGRADE_BY_ID.get(id);
    return u && !u.free;
  }).length;
}

/** The effect of a fitting in plain words, good and bad, for the yard. */
export function describeEffects(e: UpgradeEffects): { good: string[]; bad: string[] } {
  const good: string[] = [];
  const bad: string[] = [];
  const pct = (k: number) => `${Math.round(Math.abs(k - 1) * 100)}%`;
  if (e.foulingRate !== undefined && e.foulingRate < 1) good.push(`Fouls ${pct(e.foulingRate)} slower`);
  if (e.strength !== undefined) (e.strength > 1 ? good : bad).push(`${e.strength > 1 ? '+' : '\u2212'}${pct(e.strength)} strength in a storm`);
  if (e.keel !== undefined && e.keel > 1) good.push(`${pct(1 / e.keel)} less leeway`);
  if (e.handiness !== undefined && e.handiness < 1) bad.push(`Comes about ${pct(e.handiness)} slower`);
  if (e.sailArea !== undefined) (e.sailArea > 1 ? good : bad).push(`${e.sailArea > 1 ? '+' : '\u2212'}${pct(e.sailArea)} sail`);
  if (e.hold !== undefined) (e.hold > 0 ? good : bad).push(`${e.hold > 0 ? '+' : '\u2212'}${Math.abs(e.hold)} tons of hold`);
  if (e.water) good.push(`+${e.water} days of water`);
  if (e.pumping !== undefined) (e.pumping > 1 ? good : bad).push(e.pumping > 1 ? `Pumps clear ${e.pumping.toFixed(1)}\u00d7 the water` : `Pumping ${pct(e.pumping)} slower`);
  if (e.spoilage !== undefined && e.spoilage < 1) good.push(`${pct(e.spoilage)} less spoilage`);
  if (e.scurvy !== undefined && e.scurvy < 1) good.push(`Scurvy comes on ${pct(e.scurvy)} slower`);
  if (e.boat) good.push('Kedges her off the ground; lands a party through surf');
  if (e.anchors) good.push('Far better odds riding out a lee shore at anchor');
  if (e.guns) good.push(`${e.guns} guns: boarding odds up, corsairs think twice`);
  if (e.convertRig === 'square') { good.push('Much faster off the wind'); bad.push('Will not point within six points'); }
  if (e.convertRig === 'lateen') { good.push('Points high, claws off a lee shore'); bad.push('Slow running before the trades'); }
  return { good, bad };
}

export function availableUpgrades(fitted: string[], hullId: string, standing: number): Upgrade[] {
  return UPGRADES.filter((u) => {
    if (u.id !== 'breame' && fitted.includes(u.id)) return false;
    if (u.hulls && !u.hulls.includes(hullId)) return false;
    if (u.standing > standing) return false;
    // The two rig conversions exclude one another.
    if (u.id === 'aparelho-redondo' && fitted.includes('aparelho-latino')) return false;
    if (u.id === 'aparelho-latino' && fitted.includes('aparelho-redondo')) return false;
    return true;
  });
}
