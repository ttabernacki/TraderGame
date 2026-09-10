export type UpgradeCategory = 'hull' | 'rig' | 'hold' | 'equipment';

export interface UpgradeEffects {
  /** Multiplies how fast weed and shipworm accumulate. */
  foulingRate?: number;
  /** Multiplies the hull's grip on the water, reducing leeway. */
  keel?: number;
  /** Multiplies structural strength against storm damage. */
  strength?: number;
  /** Multiplies total sail area. */
  sailArea?: number;
  /** Extra cargo capacity in tons. */
  hold?: number;
  /** Extra days of water carried. */
  water?: number;
  /** Multiplies how quickly the crew work the sails. */
  handling?: number;
  /** Multiplies how readily she answers her helm. */
  handiness?: number;
  /** Reduces the rate at which the hull takes on water. */
  pumping?: number;
  /** Multiplies spoilage of cargo in the hold. */
  spoilage?: number;
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
  requires?: string;
  /** Hull classes this can be fitted to; omitted means all. */
  hulls?: string[];
  blurb: string;
}

export const UPGRADES: Upgrade[] = [
  // --- Hull ---------------------------------------------------------------
  {
    id: 'breame', name: 'Querenar', english: 'Careen and breame',
    category: 'hull', cost: 40, standing: 0, days: 6,
    effects: { foulingRate: 1 },
    blurb: 'Lay her over on a beach at spring tides, burn the weed off the bottom, and pay it with tallow. Clears the fouling entirely and buys perhaps four months.',
  },
  {
    id: 'sebo', name: 'Sebo e breu', english: 'Tallow and pitch',
    category: 'hull', cost: 130, standing: 0, days: 4,
    effects: { foulingRate: 0.7 },
    blurb: 'A heavier coat of tallow over pitch. Weed takes hold more slowly, though nothing stops it for long in warm water.',
  },
  {
    id: 'chumbo', name: 'Forro de chumbo', english: 'Lead sheathing',
    category: 'hull', cost: 620, standing: 60, days: 18,
    effects: { foulingRate: 0.34, strength: 1.06 },
    requires: 'sebo',
    blurb: 'Thin lead sheets nailed over a layer of tarred hair. Expensive, heavy, and the only real answer to the worm that eats a hull to lace in tropical water.',
  },
  {
    id: 'cavername', name: 'Cavername reforçado', english: 'Reinforced frames',
    category: 'hull', cost: 480, standing: 40, days: 20,
    effects: { strength: 1.35, hold: -6 },
    blurb: 'Doubled futtocks and heavier knees. She will take a sea over the bow off the Cape that would open a lighter ship, at the cost of some room below.',
  },
  {
    id: 'quilha', name: 'Quilha funda', english: 'Deepened keel',
    category: 'hull', cost: 380, standing: 25, days: 14,
    effects: { keel: 1.55, handiness: 0.94 },
    blurb: 'More wood below the waterline. She grips the sea, makes far less leeway, and works to windward like a different ship. She also draws more, which will matter on a bar.',
  },
  {
    id: 'bombas', name: 'Bombas de esgoto', english: 'Chain pumps',
    category: 'equipment', cost: 210, standing: 15, days: 6,
    effects: { pumping: 2.2 },
    blurb: 'Every ship of this age leaks. The question is only whether the men can pump faster than she makes water.',
  },

  // --- Rig ----------------------------------------------------------------
  {
    id: 'panos-novos', name: 'Panos novos', english: 'New canvas',
    category: 'rig', cost: 160, standing: 0, days: 5,
    effects: { sailArea: 1.05, handling: 1.08 },
    blurb: 'Fresh sailcloth holds its shape instead of bagging, and bagged sails will not point.',
  },
  {
    id: 'bonetas', name: 'Bonetas', english: 'Bonnets',
    category: 'rig', cost: 190, standing: 10, days: 4,
    effects: { sailArea: 1.16 },
    requires: 'panos-novos',
    blurb: 'Extra strips laced to the foot of the courses in light weather and unlaced when it breezes up. Cheap sail area, when you can carry it.',
  },
  {
    id: 'gavea', name: 'Gáveas', english: 'Topsails',
    category: 'rig', cost: 420, standing: 45, days: 10,
    effects: { sailArea: 1.22, handling: 0.94 },
    requires: 'bonetas',
    blurb: 'Small sails above the courses. They add drive in moderate weather and can be taken in first when it blows, which is the whole point of them.',
  },
  {
    id: 'aparelho-redondo', name: 'Aparelhar de redondo', english: 'Convert to square rig',
    category: 'rig', cost: 540, standing: 20, days: 16,
    effects: { convertRig: 'square' },
    hulls: ['caravela-latina', 'caravela-redonda'],
    blurb: 'Cross the yards and make her a square-rigger. She will run down the trades far faster and will never again lie within six points of the wind. Captains have made this change in mid-voyage and regretted it either way.',
  },
  {
    id: 'aparelho-latino', name: 'Aparelhar de latina', english: 'Convert to lateen rig',
    category: 'rig', cost: 540, standing: 20, days: 16,
    effects: { convertRig: 'lateen' },
    hulls: ['caravela-latina', 'caravela-redonda'],
    blurb: 'Strike the yards and rig her lateen throughout. She will beat to windward off a lee shore, and crawl home across the ocean.',
  },
  {
    id: 'massame', name: 'Massame novo', english: 'New standing rigging',
    category: 'rig', cost: 300, standing: 20, days: 8,
    effects: { strength: 1.12, handling: 1.06 },
    blurb: 'Fresh shrouds and stays. Masts stay up in weather that would otherwise take them out of her.',
  },

  // --- Hold ---------------------------------------------------------------
  {
    id: 'pipas', name: 'Pipas de água', english: 'Additional water casks',
    category: 'hold', cost: 120, standing: 0, days: 3,
    effects: { water: 45, hold: -8 },
    blurb: 'Water is the hard limit on every passage. Fifty more days of it costs you eight tons of cargo, and it is almost always the right trade.',
  },
  {
    id: 'arrumacao', name: 'Boa arrumação', english: 'Improved stowage',
    category: 'hold', cost: 180, standing: 15, days: 6,
    effects: { hold: 14, spoilage: 0.85 },
    blurb: 'Proper dunnage, better ventilation, and a mate who knows how to stow. More cargo in the same hull, and less of it ruined by damp.',
  },
  {
    id: 'paiol-seco', name: 'Paiol seco', english: 'Dry store room',
    category: 'hold', cost: 260, standing: 30, days: 7,
    effects: { spoilage: 0.6, hold: -4 },
    requires: 'arrumacao',
    blurb: 'A lined and sealed compartment for the spices. Pepper that arrives dry is worth twice pepper that arrives sweating.',
  },

  // --- Equipment ----------------------------------------------------------
  {
    id: 'batel', name: 'Batel grande', english: 'Ship\'s longboat',
    category: 'equipment', cost: 150, standing: 0, days: 4,
    effects: {},
    blurb: 'A proper boat lets you sound ahead, land a party through surf, warp her off a shoal, and water at places where no ship can lie. Do not go south without one.',
  },
  {
    id: 'ancoras', name: 'Âncoras de reserva', english: 'Spare anchors',
    category: 'equipment', cost: 190, standing: 10, days: 3,
    effects: {},
    blurb: 'Ships are lost by dragging onto a lee shore with nothing left to let go.',
  },
  {
    id: 'padroes', name: 'Padrões', english: 'Stone pillars',
    category: 'equipment', cost: 90, standing: 20, days: 2,
    effects: { hold: -3 },
    blurb: 'Carved limestone pillars bearing the arms of Portugal, to be set up on every new headland. They are heavy, they take space, and the Crown counts them when you come home.',
  },
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

/** Combine every fitted upgrade into a single set of effects. */
export function combineEffects(ids: string[]): Required<Omit<UpgradeEffects, 'convertRig'>> & { convertRig?: 'square' | 'lateen' } {
  const acc = {
    foulingRate: 1, keel: 1, strength: 1, sailArea: 1,
    hold: 0, water: 0, handling: 1, handiness: 1, pumping: 1, spoilage: 1,
  } as Required<Omit<UpgradeEffects, 'convertRig'>> & { convertRig?: 'square' | 'lateen' };

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
    if (e.handling !== undefined) acc.handling *= e.handling;
    if (e.handiness !== undefined) acc.handiness *= e.handiness;
    if (e.pumping !== undefined) acc.pumping *= e.pumping;
    if (e.spoilage !== undefined) acc.spoilage *= e.spoilage;
    if (e.convertRig) acc.convertRig = e.convertRig;
  }
  return acc;
}

export function availableUpgrades(fitted: string[], hullId: string, standing: number): Upgrade[] {
  return UPGRADES.filter((u) => {
    if (u.id !== 'breame' && fitted.includes(u.id)) return false;
    if (u.hulls && !u.hulls.includes(hullId)) return false;
    if (u.requires && !fitted.includes(u.requires)) return false;
    if (u.standing > standing) return false;
    // The two rig conversions exclude one another.
    if (u.id === 'aparelho-redondo' && fitted.includes('aparelho-latino')) return false;
    if (u.id === 'aparelho-latino' && fitted.includes('aparelho-redondo')) return false;
    return true;
  });
}
