import { HULL_BY_ID } from './hull';
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
  /** Multiplies how far the masthead sees. */
  lookout?: number;
  /** Multiplies how fast the reckoning goes soft. */
  reckoning?: number;
  /** Multiplies how fast fevers and flux take hold. */
  sickness?: number;
  /** A chest of presents for peoples met for the first time. */
  gifts?: boolean;
  /** Canvas spread to catch rain into the casks. */
  rainCatch?: boolean;
  /** Lines and a net over the side: fresh food on the shelf. */
  fishing?: boolean;
  /** Multiplies how deep the lead can find bottom. */
  leadReach?: number;
  /** Degrees closer to the wind she will lie. */
  pointing?: number;
  /** Blown-out canvas is mended at sea. */
  sailRepair?: boolean;
  /** Multiplies the leadsman's error. */
  leadSigma?: number;
  /** Extra odds of riding out a lee shore at anchor. */
  holding?: number;
  /**
   * Changes the rig: every mast square, every mast lateen, or `mixed` — the
   * foremast square and everything abaft it lateen.
   */
  convertRig?: 'square' | 'lateen' | 'mixed';
}

export type SystemId = 'hull' | 'keel' | 'rig' | 'hold' | 'quarters' | 'navigation' | 'arms';

export interface Upgrade {
  id: string;
  name: string;
  english: string;
  /** The ship's system this belongs to; omitted for the yard's services. */
  system?: SystemId;
  /**
   * 0 is the rig plan (the root switch of the rig), 1 is the trunk of the
   * tree, 2 to 5 climb the two branches. A branch node needs the one below it.
   */
  tier: 0 | 1 | 2 | 3 | 4 | 5;
  branch?: 'a' | 'b';
  /** Kept for old code paths that group the list. */
  category: UpgradeCategory;
  cost: number;
  /** Renown with the Crown required before the yard will do it. */
  standing: number;
  /** Days in the yard. */
  days: number;
  /** Tons it weighs and the room it takes below. Weight also costs speed. */
  tons: number;
  effects: UpgradeEffects;
  /** Hull classes this can be fitted to; omitted means all. */
  hulls?: string[];
  /** A job the yard does rather than a thing built into her. */
  service?: boolean;
  blurb: string;
}

/** The seven systems of a ship, and what each tree's two branches are for. */
export const SYSTEMS: { id: SystemId; name: string; english: string; a: string; b: string; blurb: string }[] = [
  { id: 'hull', name: 'Casco', english: 'Hull', a: 'Sheathing', b: 'Framing',
    blurb: 'What keeps the sea out and the worm off: fast and clean, or strong enough to take the Cape.' },
  { id: 'keel', name: 'Quilha e leme', english: 'Keel and helm', a: 'Weatherly', b: 'Handy',
    blurb: 'How she grips the water and answers the helm: to windward, or through the shoals.' },
  { id: 'rig', name: 'Aparelho', english: 'Rig', a: 'Square canvas', b: 'Lateen canvas',
    blurb: 'Her sails: the plan first, then more canvas of the kind the plan carries.' },
  { id: 'hold', name: 'Porão', english: 'Hold and stores', a: 'Merchant', b: 'Explorer',
    blurb: 'Room below: for cargo that arrives dry, or for water enough to go where nobody has.' },
  { id: 'quarters', name: 'Alojamento', english: 'Company\u2019s quarters', a: 'Physic', b: 'Victualling',
    blurb: 'Keeping the men alive: against the fevers, or against the scurvy.' },
  { id: 'navigation', name: 'Navegação', english: 'Navigation', a: 'Pilot\u2019s room', b: 'Soundings',
    blurb: 'Knowing where she is: a better board kept aft, or a better lead heaved forward.' },
  { id: 'arms', name: 'Armas e batéis', english: 'Arms and boats', a: 'Guns', b: 'Ground tackle',
    blurb: 'What she carries for trouble: guns for a fight, or anchors and warps for a lee shore.' },
];

/**
 * How far up each tree a hull can be taken. A barcha has room for the simple
 * work and no more; a nau will carry anything the Ribeira can build.
 */
export const TIER_CAP: Record<string, number> = {
  barcha: 2,
  'caravela-latina': 3,
  'caravela-redonda': 3,
  'nau-pequena': 4,
  nau: 5,
  'nau-da-india': 5,
  galeao: 5,
};

export function tierCap(hullId: string): number {
  if (TIER_CAP[hullId] !== undefined) return TIER_CAP[hullId];
  // A ship built to your own lines takes what her size will bear.
  const h = HULL_BY_ID.get(hullId);
  if (!h) return 2;
  return h.tons < 40 ? 2 : h.tons < 100 ? 3 : h.tons < 200 ? 4 : 5;
}

const NAUS = ['nau-pequena', 'nau', 'nau-da-india'];
const CARAVELS = ['caravela-latina', 'caravela-redonda'];

/**
 * The trees. Each system has a trunk anybody can have, and at the second tier
 * a fork: one branch or the other, because a ship is fitted for a purpose.
 * Everything weighs something and takes room, which is the price of a ship
 * fitted for everything: she is slow and she carries nothing.
 */
export const UPGRADES: Upgrade[] = [
  // --- The yard's own work ------------------------------------------------
  {
    id: 'breame', name: 'Querenar', english: 'Careen and breame', tier: 1, service: true,
    category: 'service', cost: 40, standing: 0, days: 6, tons: 0,
    effects: {},
    blurb: 'Lay her over on a beach at spring tides, burn the weed off the bottom, and pay it with tallow. Clears the fouling entirely.',
  },
  {
    id: 'resgates', name: 'Arca de resgates', english: 'Chest of presents', tier: 1, service: true,
    category: 'service', cost: 220, standing: 10, days: 1, tons: 2,
    effects: { gifts: true },
    blurb: 'Scarlet cloth, brass basins, hawk\u2019s bells and a looking-glass, kept only for the first meeting with a people nobody has met. First impressions are made once.',
  },

  // --- Hull ---------------------------------------------------------------
  {
    id: 'calafeto', name: 'Calafeto novo', english: 'New caulking', system: 'hull', tier: 1,
    category: 'hull', cost: 140, standing: 0, days: 5, tons: 0,
    effects: { strength: 1.05, pumping: 1.2 },
    blurb: 'Every seam reamed out and driven with fresh oakum and pitch. She makes less water, and a tight ship is a strong one.',
  },
  {
    id: 'bombas', name: 'Bombas de cadeia', english: 'Chain pumps', system: 'hull', tier: 1,
    category: 'equipment', cost: 200, standing: 10, days: 5, tons: 2,
    effects: { pumping: 2.2 },
    blurb: 'Every ship of this age leaks. With chain pumps the watch clears twice the water for the same work — the difference between an old ship and a lost one.',
  },
  {
    id: 'forro', name: 'Forro dobrado', english: 'Sacrificial planking', system: 'hull', tier: 2, branch: 'a',
    category: 'hull', cost: 200, standing: 0, days: 8, tons: 2,
    effects: { foulingRate: 0.65, strength: 1.04 },
    blurb: 'A second skin of thin planks over tarred hair, for the worm to eat instead of the hull. The weed grows slower on it.',
  },
  {
    id: 'chumbo', name: 'Forro de chumbo', english: 'Lead sheathing', system: 'hull', tier: 3, branch: 'a',
    category: 'hull', cost: 520, standing: 40, days: 14, tons: 4,
    effects: { foulingRate: 0.5 },
    blurb: 'Lead sheets over tarred hair. The worm and the weed barely touch her, and she stays fast for a year instead of four months.',
  },
  {
    id: 'cavername', name: 'Cavername dobrado', english: 'Doubled frames', system: 'hull', tier: 2, branch: 'b',
    category: 'hull', cost: 420, standing: 25, days: 16, tons: 6,
    effects: { strength: 1.3 },
    blurb: 'Doubled futtocks and heavier knees. She takes a sea off the Cape that would open a lighter ship.',
  },
  {
    id: 'curvas', name: 'Curvas de ferro', english: 'Iron knees', system: 'hull', tier: 3, branch: 'b',
    category: 'hull', cost: 600, standing: 60, days: 14, tons: 5,
    effects: { strength: 1.2, pumping: 1.1 },
    blurb: 'Wrought-iron knees at every deck beam. She does not work in a seaway, so her seams stay shut when a wooden ship\u2019s open.',
  },
  {
    id: 'breu-sebo', name: 'Breu de Veneza', english: 'Venetian pitch and tallow', system: 'hull', tier: 4, branch: 'a',
    category: 'hull', cost: 700, standing: 90, days: 10, tons: 1,
    effects: { foulingRate: 0.7, strength: 1.03 },
    blurb: 'The bottom paid with the dear pitch out of the Adriatic, boiled with tallow and brimstone. The weed finds nothing to take hold of for a season.',
  },
  {
    id: 'costado-liso', name: 'Costado liso', english: 'Faired bottom', system: 'hull', tier: 5, branch: 'a',
    category: 'hull', cost: 1400, standing: 180, days: 18, tons: 0,
    effects: { foulingRate: 0.75, handiness: 1.05, keel: 1.05 },
    blurb: 'Every plank below the wale dubbed fair with the adze until a hand run along her finds no edge. She slips through the water, and stays clean longest of any ship on the river.',
  },
  {
    id: 'cintas', name: 'Cintas dobradas', english: 'Doubled wales', system: 'hull', tier: 4, branch: 'b',
    category: 'hull', cost: 820, standing: 100, days: 14, tons: 4,
    effects: { strength: 1.1, pumping: 1.05 },
    blurb: 'A second heavy wale bolted outside the first the whole length of her. The Cape can hit her broadside on and she only groans.',
  },
  {
    id: 'tabuado-duplo', name: 'Tabuado dobrado', english: 'Double planking', system: 'hull', tier: 5, branch: 'b',
    category: 'hull', cost: 1600, standing: 200, days: 24, tons: 8,
    effects: { strength: 1.15, pumping: 1.15, handiness: 0.95 },
    blurb: 'A whole second skin of oak over the first, the seams crossed. She is heavy and she is slow to turn, and nothing short of a reef will open her.',
  },

  // --- Keel and helm ------------------------------------------------------
  {
    id: 'quilha', name: 'Quilha funda', english: 'Deepened keel', system: 'keel', tier: 1,
    category: 'hull', cost: 360, standing: 20, days: 12, tons: 3,
    effects: { keel: 1.45, handiness: 0.93 },
    blurb: 'More wood below the waterline. She grips the sea and makes far less leeway. She is slower to come about.',
  },
  {
    id: 'falsa-quilha', name: 'Falsa quilha', english: 'False keel', system: 'keel', tier: 2, branch: 'a',
    category: 'hull', cost: 380, standing: 30, days: 10, tons: 3,
    effects: { keel: 1.25, pointing: 2, handiness: 0.95 },
    blurb: 'A second keel bolted under the first. She holds her ground to windward like a caravel of twice her length.',
  },
  {
    id: 'bolinas', name: 'Bolinas e amuras', english: 'Bowlines and tacks', system: 'keel', tier: 3, branch: 'a',
    category: 'rig', cost: 260, standing: 50, days: 4, tons: 0,
    effects: { pointing: 4 },
    blurb: 'Bowlines to haul the weather leeches forward and tack-tackles to hold the clews down. The courses stand flat on a wind and she lies half a point higher.',
  },
  {
    id: 'leme-grande', name: 'Leme grande', english: 'Great rudder', system: 'keel', tier: 2, branch: 'b',
    category: 'hull', cost: 300, standing: 20, days: 8, tons: 1,
    effects: { handiness: 1.25 },
    blurb: 'A broader rudder hung on heavier pintles. She comes round in half the room, which is what saves her in a river mouth.',
  },
  {
    id: 'cana-leme', name: 'Cana e talhas', english: 'Whipstaff tackles', system: 'keel', tier: 3, branch: 'b',
    category: 'hull', cost: 240, standing: 40, days: 4, tons: 0,
    effects: { handiness: 1.15, keel: 1.05 },
    blurb: 'Relieving tackles on the tiller so two men can hold her in a seaway. She answers every order, and holds her course when she is on it.',
  },
  {
    id: 'quilha-azinho', name: 'Quilha de azinho', english: 'Holm-oak keel shoe', system: 'keel', tier: 4, branch: 'a',
    category: 'hull', cost: 760, standing: 90, days: 14, tons: 3,
    effects: { keel: 1.15, pointing: 2 },
    blurb: 'A deep shoe of holm oak, the hardest wood in Portugal, fayed to the keel. She bites the water on a wind and gives up almost nothing to leeward.',
  },
  {
    id: 'velas-bolina', name: 'Panos de bolina', english: 'Flat-cut windward canvas', system: 'keel', tier: 5, branch: 'a',
    category: 'rig', cost: 1300, standing: 170, days: 10, tons: 0,
    effects: { pointing: 3, sailArea: 0.97 },
    blurb: 'A suit cut flat by the best sailmaker at the Ribeira, for close-hauled work only. A little less canvas, and she lies closer to the wind than any ship of her kind.',
  },
  {
    id: 'popa-afinada', name: 'Popa afinada', english: 'Fined run aft', system: 'keel', tier: 4, branch: 'b',
    category: 'hull', cost: 700, standing: 80, days: 14, tons: 0,
    effects: { handiness: 1.15, keel: 1.03 },
    blurb: 'The deadwood aft cut away and the run faired, so the water comes clean to the rudder. She spins in her own length.',
  },
  {
    id: 'lastro-ajustado', name: 'Lastro ajustado', english: 'Trimmed ballast', system: 'keel', tier: 5, branch: 'b',
    category: 'hull', cost: 1100, standing: 160, days: 10, tons: 4,
    effects: { handiness: 1.12, strength: 1.03 },
    blurb: 'The shingle ballast hauled out and restowed in stone and pig-iron where the master wants it. She sits exactly on her marks and answers like a boat.',
  },

  // --- Rig: the plan ------------------------------------------------------
  {
    id: 'aparelho-redondo', name: 'Aparelhar de redondo', english: 'Re-rig her square', system: 'rig', tier: 0,
    category: 'rig', cost: 540, standing: 20, days: 16, tons: 1,
    effects: { convertRig: 'square' },
    hulls: CARAVELS,
    blurb: 'Cross the yards and make her a square-rigger. She will run down the trades far faster and will never again lie within six points of the wind.',
  },
  {
    id: 'aparelho-latino', name: 'Aparelhar de latina', english: 'Re-rig her lateen', system: 'rig', tier: 0,
    category: 'rig', cost: 540, standing: 20, days: 16, tons: 0,
    effects: { convertRig: 'lateen' },
    hulls: CARAVELS,
    blurb: 'Strike the yards and rig her lateen throughout. She will beat off a lee shore, and crawl home across the ocean.',
  },
  {
    id: 'aparelho-misto', name: 'Aparelho misto', english: 'Lateen main and mizzen', system: 'rig', tier: 0,
    category: 'rig', cost: 900, standing: 60, days: 18, tons: 1,
    effects: { convertRig: 'mixed' },
    hulls: NAUS,
    blurb: 'The caravela redonda\u2019s plan on a nau\u2019s hull: square canvas on the foremast to run with, and great lateens on the main and mizzen to claw to windward with. She gives up a knot in the trades and gains the whole of the wind\u2019s eye she could not get near before.',
  },
  // --- Rig: canvas --------------------------------------------------------
  {
    id: 'bonetas', name: 'Bonetas', english: 'Bonnets', system: 'rig', tier: 1,
    category: 'rig', cost: 140, standing: 0, days: 3, tons: 0,
    effects: { sailArea: 1.1 },
    blurb: 'Extra strips laced to the foot of the courses. Cheap canvas, and the easiest tenth of a knot you will ever buy.',
  },
  {
    id: 'gavea', name: 'Gáveas', english: 'Topsails', system: 'rig', tier: 2, branch: 'a',
    category: 'rig', cost: 380, standing: 30, days: 8, tons: 1,
    effects: { sailArea: 1.18, strength: 0.96 },
    blurb: 'Small sails over the courses. A knot or more in the trades. The top-hamper strains the masts in a blow.',
  },
  {
    id: 'cevadeira', name: 'Cevadeira', english: 'Spritsail', system: 'rig', tier: 3, branch: 'a',
    category: 'rig', cost: 200, standing: 40, days: 4, tons: 0,
    effects: { handiness: 1.15, sailArea: 1.05 },
    blurb: 'A square sail under the bowsprit. It pays her head off smartly, so she comes about and wears in half the time.',
  },
  {
    id: 'latinas-grandes', name: 'Antenas grandes', english: 'Long lateen yards', system: 'rig', tier: 2, branch: 'b',
    category: 'rig', cost: 340, standing: 30, days: 8, tons: 1,
    effects: { sailArea: 1.08, pointing: 3 },
    blurb: 'Longer yards and deeper lateens, peaked high. More canvas where it drives her to windward.',
  },
  {
    id: 'velame', name: 'Velame de sobressalente', english: 'Spare canvas and a sail loft', system: 'rig', tier: 3, branch: 'b',
    category: 'rig', cost: 260, standing: 40, days: 3, tons: 2,
    effects: { sailRepair: true },
    blurb: 'A full suit of spare canvas and a sailmaker with his palm and needle. Blown-out sails are mended at sea instead of in the next port.',
  },
  {
    id: 'gavea-traquete', name: 'Gávea do traquete', english: 'Fore topsail', system: 'rig', tier: 4, branch: 'a',
    category: 'rig', cost: 780, standing: 90, days: 10, tons: 1,
    effects: { sailArea: 1.12, strength: 0.97 },
    blurb: 'A topmast and a topsail on the foremast as well as the main. Another knot in the trades, and more top-hamper to carry away in a squall.',
  },
  {
    id: 'cutelos', name: 'Cutelos', english: 'Studding sails', system: 'rig', tier: 5, branch: 'a',
    category: 'rig', cost: 1250, standing: 170, days: 8, tons: 1,
    effects: { sailArea: 1.1, handiness: 0.95 },
    blurb: 'Booms run out from the yardarms and narrow sails set outside the courses. Running down the trades she spreads canvas like a fleet, and takes half the watch to get it in.',
  },
  {
    id: 'contramezena', name: 'Contramezena', english: 'Bonaventure mizzen', system: 'rig', tier: 4, branch: 'b',
    category: 'rig', cost: 720, standing: 90, days: 10, tons: 1,
    effects: { sailArea: 1.06, pointing: 2, handiness: 1.05 },
    blurb: 'A fourth, small lateen stepped right aft on the taffrail. It holds her head up to the wind and helps her through stays.',
  },
  {
    id: 'antenas-duplas', name: 'Antenas de duas peças', english: 'Two-piece lateen yards', system: 'rig', tier: 5, branch: 'b',
    category: 'rig', cost: 1200, standing: 170, days: 10, tons: 1,
    effects: { pointing: 3, sailArea: 1.05, strength: 0.98 },
    blurb: 'Lateen yards scarfed from two spars and fished with iron, longer than any single tree could make. The peak stands higher and the luff stays straight on a wind.',
  },

  // --- Hold and stores ----------------------------------------------------
  {
    id: 'arrumacao', name: 'Arrumação apertada', english: 'Tight stowage', system: 'hold', tier: 1,
    category: 'stores', cost: 180, standing: 10, days: 5, tons: 0,
    effects: { hold: 12, pumping: 0.88 },
    blurb: 'Dunnage, battens and a mate who knows how to stow. More tons in the same hull — and the pump well buried under cargo.',
  },
  {
    id: 'paiol-seco', name: 'Paiol seco', english: 'Dry store room', system: 'hold', tier: 2, branch: 'a',
    category: 'stores', cost: 240, standing: 15, days: 6, tons: 3,
    effects: { spoilage: 0.55 },
    blurb: 'A lined, sealed room for the spices. Pepper that arrives dry is worth twice pepper that arrives sweating.',
  },
  {
    id: 'estiva', name: 'Estiva com grades', english: 'Cargo gratings', system: 'hold', tier: 3, branch: 'a',
    category: 'stores', cost: 320, standing: 40, days: 6, tons: 2,
    effects: { spoilage: 0.7, hold: 6 },
    blurb: 'Gratings and ventilators through the whole hold, so the air moves through the cargo. It keeps its quality, and it stows tighter.',
  },
  {
    id: 'pipas', name: 'Pipas de água', english: 'Water casks', system: 'hold', tier: 2, branch: 'b',
    category: 'stores', cost: 120, standing: 0, days: 3, tons: 8,
    effects: { water: 45 },
    blurb: 'Forty-five more days of water, for eight tons of cargo. On a long passage it is almost always the right trade.',
  },
  {
    id: 'toldos', name: 'Toldos de chuva', english: 'Rain awnings', system: 'hold', tier: 3, branch: 'b',
    category: 'stores', cost: 90, standing: 20, days: 2, tons: 0,
    effects: { rainCatch: true, water: 15, handiness: 0.97 },
    blurb: 'Old sails rigged as funnels over the casks. Every squall fills them. The deck is cluttered with gear that fouls the braces.',
  },
  {
    id: 'paiois-especiaria', name: 'Paióis de especiaria', english: 'Spice rooms', system: 'hold', tier: 4, branch: 'a',
    category: 'stores', cost: 760, standing: 90, days: 10, tons: 3,
    effects: { spoilage: 0.7, hold: 10 },
    blurb: 'Sealed, lined rooms built into the hold for pepper, cloves and cinnamon, each with its own hatch. The spices come home as they went aboard, and more of them fit.',
  },
  {
    id: 'coberta-carga', name: 'Coberta de carga', english: 'A cargo deck', system: 'hold', tier: 5, branch: 'a',
    category: 'stores', cost: 1500, standing: 180, days: 22, tons: 4,
    effects: { hold: 30, handiness: 0.95, strength: 0.97 },
    blurb: 'A whole orlop deck laid between the hold and the gun deck. Thirty tons more of whatever pays, and a ship that sits deeper and works harder in a sea.',
  },
  {
    id: 'tanques', name: 'Tanques de água', english: 'Water tanks', system: 'hold', tier: 4, branch: 'b',
    category: 'stores', cost: 640, standing: 80, days: 8, tons: 10,
    effects: { water: 40 },
    blurb: 'Great leaded tanks built into the ground tier in place of casks. Forty days more, and water that does not leak away through the staves.',
  },
  {
    id: 'pipas-ferro', name: 'Pipas arqueadas a ferro', english: 'Iron-hooped casks', system: 'hold', tier: 5, branch: 'b',
    category: 'stores', cost: 1100, standing: 160, days: 6, tons: 4,
    effects: { water: 30, spoilage: 0.9 },
    blurb: 'Casks hooped with iron instead of hazel, that do not start in the heat of the line. The water keeps sweet a month longer and there is more of it.',
  },

  // --- Company's quarters -------------------------------------------------
  {
    id: 'capoeiras', name: 'Capoeiras e fogão', english: 'Hen coops and a galley', system: 'quarters', tier: 1,
    category: 'stores', cost: 200, standing: 10, days: 4, tons: 3,
    effects: { scurvy: 0.7 },
    blurb: 'Live hens, a goat, cress in wet sacking and a proper firebox to cook on. The scurvy comes on more slowly.',
  },
  {
    id: 'botica', name: 'Botica', english: 'Apothecary\u2019s chest', system: 'quarters', tier: 2, branch: 'a',
    category: 'stores', cost: 260, standing: 15, days: 1, tons: 1,
    effects: { sickness: 0.6 },
    blurb: 'Theriac, rhubarb, quince paste, wine for the fevers and a surgeon\u2019s saw. Fevers and the flux take hold far less.',
  },
  {
    id: 'enfermaria', name: 'Enfermaria', english: 'Sick berth', system: 'quarters', tier: 3, branch: 'a',
    category: 'stores', cost: 300, standing: 40, days: 5, tons: 3,
    effects: { sickness: 0.75, scurvy: 0.9 },
    blurb: 'A screened berth under the forecastle with hammocks and a stove, so the sick are not lying in the bilge water. Fewer die of what they catch.',
  },
  {
    id: 'pesca', name: 'Aparelho de pesca', english: 'Fishing gear', system: 'quarters', tier: 2, branch: 'b',
    category: 'stores', cost: 70, standing: 0, days: 1, tons: 1,
    effects: { fishing: true },
    blurb: 'Lines, hooks, a net and a harpoon. On the shelf and near land the off watch feeds itself.',
  },
  {
    id: 'salga', name: 'Salga e fumeiro', english: 'Salting and smoking', system: 'quarters', tier: 3, branch: 'b',
    category: 'stores', cost: 180, standing: 30, days: 3, tons: 2,
    effects: { scurvy: 0.75 },
    blurb: 'Barrels, salt and a smoking rack, so a good catch or a turtle beach lasts the passage instead of the week.',
  },
  {
    id: 'fisico', name: 'Físico da Casa', english: 'A university physician', system: 'quarters', tier: 4, branch: 'a',
    category: 'stores', cost: 700, standing: 90, days: 1, tons: 1,
    effects: { sickness: 0.7 },
    blurb: 'A physician out of Salamanca with his books and his instruments, paid by the voyage. He is insufferable, and fewer men die of fevers.',
  },
  {
    id: 'hospital', name: 'Hospital de bordo', english: 'Sick bay', system: 'quarters', tier: 5, branch: 'a',
    category: 'stores', cost: 1300, standing: 170, days: 10, tons: 4,
    effects: { sickness: 0.75, scurvy: 0.85 },
    blurb: 'A bulkheaded sick bay under the half-deck with its own scuttles, stove and water. The sick are kept apart, and the sickness does not go round the ship.',
  },
  {
    id: 'hortas', name: 'Hortas de convés', english: 'Deck gardens', system: 'quarters', tier: 4, branch: 'b',
    category: 'stores', cost: 560, standing: 80, days: 3, tons: 2,
    effects: { scurvy: 0.75 },
    blurb: 'Tubs of earth lashed along the waist with cress, purslane and onions growing in them. A handful of green a day to every mess, which is a great deal more than nothing.',
  },
  {
    id: 'citrinos', name: 'Laranjas e limões', english: 'Oranges and lemons in cask', system: 'quarters', tier: 5, branch: 'b',
    category: 'stores', cost: 1000, standing: 150, days: 2, tons: 3,
    effects: { scurvy: 0.6 },
    blurb: 'Casks of Algarve oranges and lemons packed in sand, a ration to every man while they last. Nobody aboard can say why it works. It works.',
  },

  // --- Navigation ---------------------------------------------------------
  {
    id: 'cesto', name: 'Cesto da gávea', english: 'Crow\u2019s nest', system: 'navigation', tier: 1,
    category: 'rig', cost: 120, standing: 0, days: 2, tons: 0,
    effects: { lookout: 1.25, strength: 0.99 },
    blurb: 'A proper top at the masthead with a rail round it. The lookout sees a quarter further — land, shoal water, a sail, a smoke.',
  },
  {
    id: 'camara', name: 'Câmara do piloto', english: 'Pilot\u2019s chart room', system: 'navigation', tier: 2, branch: 'a',
    category: 'stores', cost: 340, standing: 25, days: 5, tons: 2,
    effects: { reckoning: 0.75 },
    blurb: 'A dry room aft with a table, a lamp and a traverse board kept every half-hour glass. The reckoning goes soft more slowly.',
  },
  {
    id: 'ampulhetas', name: 'Ampulhetas e barquinha', english: 'Glasses and a log-line', system: 'navigation', tier: 3, branch: 'a',
    category: 'equipment', cost: 280, standing: 50, days: 2, tons: 0,
    effects: { reckoning: 0.8 },
    blurb: 'Matched half-minute glasses and a knotted line on a reel. The speed on the board is measured instead of guessed.',
  },
  {
    id: 'prumo', name: 'Prumo de alto mar', english: 'Deep-sea lead', system: 'navigation', tier: 2, branch: 'b',
    category: 'equipment', cost: 110, standing: 0, days: 1, tons: 1,
    effects: { leadReach: 1.6 },
    blurb: 'A fourteen-pound lead and two hundred fathoms of line. It finds bottom well outside the hundred-fathom line.',
  },
  {
    id: 'livro-sondas', name: 'Livro de sondas', english: 'The leadsman\u2019s book', system: 'navigation', tier: 3, branch: 'b',
    category: 'equipment', cost: 220, standing: 35, days: 1, tons: 0,
    effects: { leadSigma: 0.65 },
    blurb: 'A marked line checked wet against the fathom-rod, a leadsman who calls what he feels, and a book to write it in. The soundings are true to the fathom.',
  },
  {
    id: 'cartas-casa', name: 'Cartas de marear da Casa', english: 'The Casa\u2019s sea charts', system: 'navigation', tier: 4, branch: 'a',
    category: 'equipment', cost: 820, standing: 100, days: 1, tons: 0,
    effects: { reckoning: 0.85 },
    blurb: 'Fair copies of the King\u2019s padrão, rhumbed and graduated, and a pilot allowed to see them. Courses laid off properly, and distances run checked against them.',
  },
  {
    id: 'agulha-variacao', name: 'Agulha de variação', english: 'A variation compass', system: 'navigation', tier: 5, branch: 'a',
    category: 'equipment', cost: 1300, standing: 180, days: 1, tons: 0,
    effects: { reckoning: 0.8 },
    blurb: 'A compass with a shadow-pin, to take the sun\u2019s bearing at rising and setting and find how far the needle lies. The courses steered are the courses written down.',
  },
  {
    id: 'sondareza', name: 'Sondareza de rolo', english: 'Deep-sea line on a reel', system: 'navigation', tier: 4, branch: 'b',
    category: 'equipment', cost: 620, standing: 80, days: 1, tons: 1,
    effects: { leadReach: 1.4, leadSigma: 0.9 },
    blurb: 'Three hundred fathoms of tarred line on a reel on the poop, and a heavier lead to go with it. Bottom is found a long way off soundings.',
  },
  {
    id: 'batel-sonda', name: 'Batel de sonda', english: 'A sounding boat', system: 'navigation', tier: 5, branch: 'b',
    category: 'equipment', cost: 1100, standing: 160, days: 3, tons: 2,
    effects: { leadSigma: 0.75, leadReach: 1.1 },
    blurb: 'A light boat that goes ahead of her into strange water, sounding as it goes and signalling back. The soundings are true, and they are taken before she is on the ground.',
  },

  // --- Arms and boats -----------------------------------------------------
  {
    id: 'batel', name: 'Batel grande', english: 'Longboat', system: 'arms', tier: 1,
    category: 'equipment', cost: 150, standing: 0, days: 3, tons: 2,
    effects: { boat: true },
    blurb: 'A proper boat. A kedge laid out properly when she is aground, and a padrão landed through surf that would swamp a skiff.',
  },
  {
    id: 'bercos', name: 'Berços', english: 'Swivel guns', system: 'arms', tier: 2, branch: 'a',
    category: 'equipment', cost: 160, standing: 0, days: 2, tons: 1,
    effects: { guns: 2 },
    blurb: 'Little breech-loaders on the rails, swept across a deck at boarding range. Enough to make a boarding cost a corsair.',
  },
  {
    id: 'bombardas', name: 'Bombardas', english: 'Bombards', system: 'arms', tier: 3, branch: 'a',
    category: 'equipment', cost: 450, standing: 30, days: 6, tons: 5,
    effects: { guns: 6 },
    blurb: 'Six pieces on the waist and a gunner who knows them. Boarding goes your way, and a corsair counts your ports and looks for somebody else.',
  },
  {
    id: 'ancoras', name: 'Âncora da esperança', english: 'Sheet anchor and cable', system: 'arms', tier: 2, branch: 'b',
    category: 'equipment', cost: 170, standing: 10, days: 2, tons: 3,
    effects: { anchors: true },
    blurb: 'The anchor of last resort, and a second cable to ride to. Ships are lost by dragging onto a lee shore with nothing left to let go.',
  },
  {
    id: 'espias', name: 'Espias e ancorotes', english: 'Warps and kedges', system: 'arms', tier: 3, branch: 'b',
    category: 'equipment', cost: 160, standing: 25, days: 2, tons: 2,
    effects: { holding: 0.12, pumping: 1.05 },
    blurb: 'Two kedges and cable enough to lay them out a quarter of a mile. She rides a lee shore on three anchors, and warps herself off a bank.',
  },
  {
    id: 'falcoes', name: 'Falcões', english: 'Falconets', system: 'arms', tier: 4, branch: 'a',
    category: 'equipment', cost: 820, standing: 90, days: 6, tons: 3,
    effects: { guns: 3 },
    blurb: 'Three bronze falcons on the castles, firing a two-pound ball. They sweep an enemy\u2019s deck from above before anyone goes over the rail.',
  },
  {
    id: 'camelos', name: 'Camelos', english: 'Heavy bronze guns', system: 'arms', tier: 5, branch: 'a',
    category: 'equipment', cost: 1800, standing: 200, days: 14, tons: 10,
    effects: { guns: 5, handiness: 0.95, strength: 1.02 },
    blurb: 'Great bronze pieces cast at the royal foundry, on carriages in the waist, with ports cut for them. She is a ship of war now, and every corsair on the coast knows it.',
  },
  {
    id: 'amarras-canhamo', name: 'Amarras de cânhamo', english: 'Hemp cables', system: 'arms', tier: 4, branch: 'b',
    category: 'equipment', cost: 600, standing: 80, days: 2, tons: 3,
    effects: { holding: 0.1 },
    blurb: 'Cables laid up from Baltic hemp instead of esparto grass. They do not chafe through on a rocky bottom in the night.',
  },
  {
    id: 'quatro-ancoras', name: 'Quatro âncoras de ferro', english: 'Four wrought anchors', system: 'arms', tier: 5, branch: 'b',
    category: 'equipment', cost: 1200, standing: 160, days: 4, tons: 6,
    effects: { holding: 0.15, strength: 1.02 },
    blurb: 'Four great anchors of Biscay iron and cables to each. She rides out a gale on a lee shore that would put any other ship on the beach.',
  },
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

type Combined = Required<Omit<UpgradeEffects, 'convertRig'>> & { convertRig?: 'square' | 'lateen' | 'mixed'; tons: number };

/** Combine every fitted upgrade into a single set of effects. */
export function combineEffects(ids: string[]): Combined {
  const acc: Combined = {
    foulingRate: 1, keel: 1, strength: 1, sailArea: 1, hold: 0, water: 0,
    handiness: 1, pumping: 1, spoilage: 1, scurvy: 1, boat: false, anchors: false, guns: 0,
    lookout: 1, reckoning: 1, sickness: 1, gifts: false, rainCatch: false, fishing: false, leadReach: 1,
    pointing: 0, sailRepair: false, leadSigma: 1, holding: 0, tons: 0,
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
    if (e.lookout !== undefined) acc.lookout *= e.lookout;
    if (e.reckoning !== undefined) acc.reckoning *= e.reckoning;
    if (e.sickness !== undefined) acc.sickness *= e.sickness;
    if (e.leadReach !== undefined) acc.leadReach *= e.leadReach;
    if (e.gifts) acc.gifts = true;
    if (e.rainCatch) acc.rainCatch = true;
    if (e.fishing) acc.fishing = true;
    if (e.pointing) acc.pointing += e.pointing;
    if (e.sailRepair) acc.sailRepair = true;
    if (e.leadSigma !== undefined) acc.leadSigma *= e.leadSigma;
    if (e.holding) acc.holding += e.holding;
    if (e.convertRig) acc.convertRig = e.convertRig;
    acc.tons += u.tons;
  }
  // What she carries takes room below.
  acc.hold -= acc.tons;
  return acc;
}

/** The effect of a fitting in plain words, good and bad, for the yard. */
export function describeEffects(e: UpgradeEffects): { good: string[]; bad: string[] } {
  const good: string[] = [];
  const bad: string[] = [];
  const pct = (k: number) => `${Math.round(Math.abs(k - 1) * 100)}%`;
  if (e.foulingRate !== undefined && e.foulingRate < 1) good.push(`Fouls ${pct(e.foulingRate)} slower`);
  if (e.strength !== undefined) (e.strength > 1 ? good : bad).push(`${e.strength > 1 ? '+' : '\u2212'}${pct(e.strength)} strength in a storm`);
  if (e.keel !== undefined && e.keel > 1) good.push(`${pct(1 / e.keel)} less leeway`);
  if (e.handiness !== undefined) (e.handiness > 1 ? good : bad).push(`Comes about ${pct(e.handiness)} ${e.handiness > 1 ? 'faster' : 'slower'}`);
  if (e.sailArea !== undefined) (e.sailArea > 1 ? good : bad).push(`${e.sailArea > 1 ? '+' : '\u2212'}${pct(e.sailArea)} sail`);
  if (e.hold !== undefined) (e.hold > 0 ? good : bad).push(`${e.hold > 0 ? '+' : '\u2212'}${Math.abs(e.hold)} ton${Math.abs(e.hold) === 1 ? '' : 's'} of hold`);
  if (e.water) good.push(`+${e.water} days of water`);
  if (e.pumping !== undefined) (e.pumping > 1 ? good : bad).push(e.pumping > 1 ? `Pumps clear ${e.pumping.toFixed(1)}\u00d7 the water` : `Pumping ${pct(e.pumping)} slower`);
  if (e.spoilage !== undefined && e.spoilage < 1) good.push(`${pct(e.spoilage)} less spoilage`);
  if (e.scurvy !== undefined && e.scurvy < 1) good.push(`Scurvy comes on ${pct(e.scurvy)} slower`);
  if (e.boat) good.push('Kedges her off the ground; lands a party through surf');
  if (e.anchors) good.push('Far better odds riding out a lee shore at anchor');
  if (e.guns) good.push(e.guns >= 6 ? `${e.guns} guns: boarding odds up, corsairs think twice` : `${e.guns} guns: boarding odds up`);
  if (e.lookout) good.push(`Sees ${pct(e.lookout)} further from the masthead`);
  if (e.reckoning) good.push(`Reckoning goes soft ${pct(e.reckoning)} slower`);
  if (e.sickness) good.push(`Fevers and flux ${pct(e.sickness)} less`);
  if (e.leadReach) good.push(`Lead finds bottom ${pct(e.leadReach)} deeper`);
  if (e.gifts) good.push('Better first meetings with new peoples');
  if (e.rainCatch) good.push('Fills the casks in every squall');
  if (e.fishing) good.push('Fresh fish on the shelf and near land');
  if (e.pointing) good.push(`Lies ${e.pointing}\u00b0 closer to the wind`);
  if (e.sailRepair) good.push('Mends blown-out canvas at sea');
  if (e.leadSigma !== undefined && e.leadSigma < 1) good.push(`Soundings ${pct(e.leadSigma)} truer`);
  if (e.holding) good.push('Rides out a lee shore on more anchors');
  if (e.convertRig === 'mixed') { good.push('Points far higher: lateen main and mizzen'); bad.push('A knot slower running before the trades'); }
  if (e.convertRig === 'square') { good.push('Much faster off the wind'); bad.push('Will not point within six points'); }
  if (e.convertRig === 'lateen') { good.push('Points high, claws off a lee shore'); bad.push('Slow running before the trades'); }
  return { good, bad };
}

/** What the yard here can do: 0 none, 1 the simple work, 2 a real yard, 3 the Ribeira at Lisbon. */
export function yardLevel(port: { id: string; people: string; refit: number; feitoria?: boolean }): number {
  if (port.id === 'lisboa') return 3;
  if (port.refit < 0.4) return 0;
  if ((port.people === 'portuguese' && port.refit >= 0.7) || port.feitoria) return 2;
  return 1;
}

export type NodeState = 'built' | 'open' | 'locked';

/**
 * Whether a node can be built now, and if not, the reason. `yard` is what the
 * port can do (see yardLevel); `standing` is renown with the Crown.
 */
export function nodeStatus(
  u: Upgrade, fitted: string[], hullId: string, standing: number, yard: number,
): { state: NodeState; why: string; replaces: string[] } {
  const none = { replaces: [] as string[] };
  if (fitted.includes(u.id) && !u.service) return { state: 'built', why: '', ...none };
  if (u.hulls && !u.hulls.includes(hullId)) return { state: 'locked', why: 'Not for this hull', ...none };
  const tier = u.tier === 0 ? 2 : u.tier;
  if (!u.service && tier > tierCap(hullId)) return { state: 'locked', why: 'Too much for this hull', ...none };
  if (u.standing > standing) return { state: 'locked', why: `At ${u.standing} renown`, ...none };
  // The trunk wants any yard, the lower branches a proper one, and the top of
  // every tree — and the rig plan — the Ribeira at Lisbon.
  const need = u.tier === 0 ? 3 : u.tier >= 4 ? 3 : u.tier >= 2 ? 2 : 1;
  if (yard < need) {
    return { state: 'locked', why: need >= 3 ? 'Only the Ribeira at Lisbon' : yard === 0 ? 'No yard here' : 'Wants a proper yard', ...none };
  }
  if (!u.system) return { state: 'open', why: '', ...none };
  const inSystem = fitted.map((id) => UPGRADE_BY_ID.get(id)).filter((x): x is Upgrade => !!x && x.system === u.system);
  if (u.tier === 0) {
    // One rig plan at a time; changing it replaces the old one.
    return { state: 'open', why: '', replaces: inSystem.filter((x) => x.tier === 0).map((x) => x.id) };
  }
  if (u.tier === 1) return { state: 'open', why: '', ...none };
  const trunk = inSystem.some((x) => x.tier === 1);
  if (!trunk) return { state: 'locked', why: 'Needs the first work in this tree', ...none };
  if (u.tier >= 3 && !inSystem.some((x) => x.tier === u.tier - 1 && x.branch === u.branch)) {
    return { state: 'locked', why: 'Needs the one below it', ...none };
  }
  const other = inSystem.filter((x) => x.branch && x.branch !== u.branch);
  if (other.length > 0) {
    // Taking the other branch out and putting this one in is Lisbon's work.
    if (yard < 3) return { state: 'locked', why: 'Changing branch is Lisbon\u2019s work', ...none };
    return { state: 'open', why: '', replaces: other.map((x) => x.id) };
  }
  return { state: 'open', why: '', ...none };
}

/** Everything in a system, in tree order. */
export function systemNodes(sys: SystemId): Upgrade[] {
  return UPGRADES.filter((u) => u.system === sys).sort((a, b) => a.tier - b.tier || (a.branch ?? '').localeCompare(b.branch ?? ''));
}

/** Which fitted work goes with a ship's captain into a new hull: all but the hull and keel. */
export function movesWithTheFlag(id: string): boolean {
  const u = UPGRADE_BY_ID.get(id);
  return !!u && !!u.system && u.system !== 'hull' && u.system !== 'keel' && u.tier !== 0;
}
