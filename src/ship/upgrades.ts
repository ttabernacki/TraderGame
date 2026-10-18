import { HULL_BY_ID } from './hull';

/**
 * Slot fittings (BUILD_PLAN B3).
 *
 * The ship has six slots and one fitting in each. A fitting has an upside and a
 * cost: tons in the hold, wear on the hull, or the temper of the company. There
 * is no tree to climb; there is a choice about what she is for, and a yard that
 * has to be able to do it. Ordnance is a store of value, not a weapon: the guns
 * are tons of bronze that a prince in the east will pay for.
 */
export type SlotId = 'hull' | 'rig' | 'boats' | 'cabin' | 'instruments' | 'ordnance';

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
  /** Retained for the courts and the boarding odds; no fitting sets it any more (ordnance is a trade good). */
  guns?: number;
  /** Pieces of ordnance carried as a store of value. Read by nothing in a fight. */
  pieces?: number;
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
  /** Multiplies the tons her stores weigh: better casks, tighter stowage. */
  storage?: number;
  /** Multiplies how fast she works open and makes water. Over one is wear. */
  wear?: number;
  /** Morale drift per day, positive or negative: a decent cabin against a crowded deck. */
  morale?: number;
  /**
   * Changes the rig: every mast square, every mast lateen, or `mixed` — the
   * foremast square and everything abaft it lateen.
   */
  convertRig?: 'square' | 'lateen' | 'mixed';
}

export interface Upgrade {
  id: string;
  name: string;
  english: string;
  slot: SlotId;
  cost: number;
  /** Renown with the Crown required before the yard will do it. */
  standing: number;
  /** Days in the yard. */
  days: number;
  /** What the yard must be able to do: 1 the simple work, 2 a real yard, 3 the Ribeira. */
  yard: 1 | 2 | 3;
  /** Tons it weighs and the room it takes below. Weight also costs speed. */
  tons: number;
  effects: UpgradeEffects;
  /** The smallest hull (burthen, tonéis) that has room for it. */
  minTons?: number;
  /** Hull classes this can be fitted to; omitted means all. */
  hulls?: string[];
  /** The price of what is paid for the work, in plain words: tons, wear or the company. */
  price: string;
  blurb: string;
}

export const SLOTS: { id: SlotId; name: string; english: string; blurb: string }[] = [
  { id: 'hull', name: 'Casco', english: 'Hull treatment', blurb: 'What keeps the sea out and the worm off: one treatment at a time.' },
  { id: 'rig', name: 'Aparelho', english: 'Rig', blurb: 'The plan of her sails, or better canvas for the plan she has.' },
  { id: 'boats', name: 'Batéis e amarras', english: 'Boats and ground tackle', blurb: 'What puts a party ashore and holds her off a lee shore.' },
  { id: 'cabin', name: 'Câmara e paióis', english: 'Cabin and stores', blurb: 'Stowage, casks, galley and the cabin aft: how the company lives and how the stores stow.' },
  { id: 'instruments', name: 'Navegação', english: 'Instruments', blurb: 'Knowing where she is: the masthead, the lead, the chart room.' },
  { id: 'ordnance', name: 'Artilharia', english: 'Ordnance', blurb: 'Bronze carried as tons of value. A prince in the east will pay for guns; nobody here will fight with them.' },
];

/** The fittings in each slot run lightest to heaviest; a worse one is replaced, not stacked. */
export const UPGRADES: Upgrade[] = [
  // --- Hull treatment ------------------------------------------------------
  {
    id: 'calafeto', name: 'Calafeto novo e paiol seco', english: 'New caulking and a dry hold', slot: 'hull',
    cost: 140, standing: 0, days: 5, yard: 1, tons: 0.5,
    effects: { pumping: 1.15, spoilage: 0.8, wear: 0.85 },
    price: '0.5 t of oakum and pitch',
    blurb: 'Every seam raked out and driven again, and the hold lined to keep the bilge off the cargo. She makes less water and less of the cargo goes bad.',
  },
  {
    id: 'forro-dobrado', name: 'Forro dobrado', english: 'Sacrificial planking', slot: 'hull',
    cost: 320, standing: 0, days: 8, yard: 2, tons: 1.5,
    effects: { foulingRate: 0.65, handiness: 0.99 },
    price: '1.5 t of planking',
    blurb: 'A second skin of pine over tallow and hair, for the worm to eat instead of the hull. She stays clean longer between careenings.',
  },
  {
    id: 'forro-chumbo', name: 'Forro de chumbo', english: 'Lead sheathing', slot: 'hull',
    cost: 900, standing: 30, days: 12, yard: 2, tons: 4, minTons: 40,
    effects: { foulingRate: 0.3, strength: 1.03, handiness: 0.98, wear: 0.95 },
    price: '4 t of lead, and she is a shade slower to the helm',
    blurb: 'Sheets of lead nailed over the bottom. The worm will not touch it and the weed hardly grows, at the cost of four tons and a ship that is a little less handy.',
  },
  {
    id: 'cavername', name: 'Cavername e quilha dobrados', english: 'Doubled frames and a deeper keel', slot: 'hull',
    cost: 1100, standing: 60, days: 14, yard: 2, tons: 6, minTons: 40,
    effects: { strength: 1.2, keel: 1.1, handiness: 0.96, wear: 0.85 },
    price: '6 t of oak, and she is slower to answer',
    blurb: 'Futtocks sistered along the whole of the frames and a deeper keel under them. She takes the Cape better, and loses less to the leeway, and she is heavier and slower to turn.',
  },

  // --- Rig ----------------------------------------------------------------
  {
    id: 'velame', name: 'Velame de Flandres e loja de velas', english: 'Flemish canvas and a sail loft', slot: 'rig',
    cost: 420, standing: 0, days: 6, yard: 1, tons: 2,
    effects: { sailArea: 1.05, sailRepair: true },
    price: '2 t of canvas and bolt-rope',
    blurb: 'Close-woven flax and a sailmaker with room to work. She draws better, and blown-out canvas is mended at sea.',
  },
  {
    id: 'rig-redondo', name: 'Aparelhar de redondo', english: 'Re-rig her square', slot: 'rig',
    cost: 540, standing: 0, days: 10, yard: 2, tons: 1,
    hulls: ['caravela-latina', 'caravela-redonda'],
    effects: { convertRig: 'square' },
    price: 'She will not point within six points',
    blurb: 'Square courses on every mast for running down the trades. Much faster off the wind and hopeless on it.',
  },
  {
    id: 'rig-latino', name: 'Aparelhar de latina', english: 'Re-rig her lateen', slot: 'rig',
    cost: 540, standing: 0, days: 10, yard: 2, tons: 0,
    hulls: ['caravela-latina', 'caravela-redonda'],
    effects: { convertRig: 'lateen' },
    price: 'Slow running before the trades',
    blurb: 'Lateens on every mast: she points high and claws off a lee shore, and she is slow when the wind is aft.',
  },
  {
    id: 'rig-misto', name: 'Aparelho misto', english: 'Square foremast, lateens abaft', slot: 'rig',
    cost: 900, standing: 40, days: 14, yard: 3, tons: 1,
    hulls: ['nau-pequena', 'nau', 'nau-da-india'],
    effects: { convertRig: 'mixed' },
    price: 'A knot slower before the trades',
    blurb: 'The Ribeira’s answer for a great ship: a square foremast to run with and lateens abaft to point.',
  },

  // --- Boats and ground tackle -------------------------------------------
  {
    id: 'batel', name: 'Batel grande', english: 'Longboat', slot: 'boats',
    cost: 150, standing: 0, days: 2, yard: 1, tons: 2,
    effects: { boat: true },
    price: '2 t on the booms',
    blurb: 'A proper longboat: she kedges off a bank, lands a party through surf and waters off a beach.',
  },
  {
    id: 'ancoras', name: 'Âncora da esperança', english: 'Sheet anchor and a second cable', slot: 'boats',
    cost: 170, standing: 10, days: 2, yard: 1, tons: 3,
    effects: { anchors: true, holding: 0.06 },
    price: '3 t of iron and hemp',
    blurb: 'The anchor of last resort. Ships are lost by dragging onto a lee shore with nothing left to let go.',
  },
  {
    id: 'espias', name: 'Espias e ancorotes', english: 'Kedges, warps and a boat to lay them', slot: 'boats',
    cost: 330, standing: 25, days: 3, yard: 1, tons: 4,
    effects: { boat: true, holding: 0.12, pumping: 1.05 },
    price: '4 t of cable and kedges',
    blurb: 'Two kedges and cable enough to lay them out a quarter of a mile, and the boat to do it with. She warps herself off a bank.',
  },
  {
    id: 'pinaca', name: 'Pinaça e âncoras de ferro', english: 'Pinnace and wrought anchors', slot: 'boats',
    cost: 900, standing: 80, days: 6, yard: 2, tons: 9, minTons: 100,
    effects: { boat: true, anchors: true, holding: 0.2, strength: 1.02 },
    price: '9 t on deck and below',
    blurb: 'A second boat that can sail, and four great anchors of Biscay iron. She rides out a gale on a lee shore that would put any other ship on the beach.',
  },

  // --- Cabin and stores --------------------------------------------------
  {
    id: 'estiva', name: 'Estiva com grades e arca de resgates', english: 'Gratings, tight stowage and a presents-chest', slot: 'cabin',
    cost: 260, standing: 0, days: 4, yard: 1, tons: 2, minTons: 40,
    effects: { hold: 6, spoilage: 0.88, gifts: true },
    price: '2 t of gratings and dunnage',
    blurb: 'Gratings under the cargo, battens along the sides and a locked chest of scarlet cloth and hawk’s bells for the first meeting with a people. A little more room and a drier hold.',
  },
  {
    id: 'pipas', name: 'Pipas arqueadas a ferro e toldos', english: 'Iron-hooped casks and rain awnings', slot: 'cabin',
    cost: 380, standing: 20, days: 4, yard: 1, tons: 1.5,
    effects: { storage: 0.8, water: 30, rainCatch: true },
    price: '1.5 t of cooper’s work',
    blurb: 'Casks that do not weep, stowed tight, and canvas spread to catch rain. Her stores weigh a fifth less in the hold and she can carry water for thirty days more.',
  },
  {
    id: 'cozinha', name: 'Fogão, capoeiras e botica', english: 'Galley, hen-coops and an apothecary’s chest', slot: 'cabin',
    cost: 300, standing: 0, days: 4, yard: 1, tons: 2,
    effects: { scurvy: 0.8, sickness: 0.88, fishing: true, morale: 0.0006 },
    price: '2 t, and hens in the waist',
    blurb: 'A brick galley, hens and a goat, lines over the side and a chest of physic. The scurvy comes on slower, fevers take fewer, and the men eat hot.',
  },
  {
    id: 'camara-grande', name: 'Câmara grande', english: 'Great cabin and stern gallery', slot: 'cabin',
    cost: 2200, standing: 350, days: 10, yard: 3, tons: 6, minTons: 140,
    hulls: ['nau-pequena', 'nau', 'nau-da-india', 'galeao'],
    effects: { sickness: 0.8, gifts: true, handiness: 0.97, morale: 0.0015 },
    price: '6 t of joinery and top-weight',
    blurb: 'A proper cabin aft with a gallery over the stern: light and air for the sick, a room fit to receive an envoy in. She is a little heavier for it.',
  },

  // --- Instruments -------------------------------------------------------
  {
    id: 'cesto', name: 'Cesto da gávea', english: 'Crow’s nest', slot: 'instruments',
    cost: 120, standing: 0, days: 1, yard: 1, tons: 0.5,
    effects: { lookout: 1.25, strength: 0.99 },
    price: 'Top-weight on the mainmast',
    blurb: 'A basket at the masthead. The lookout sees further, and the mast carries a little more than it should.',
  },
  {
    id: 'prumo', name: 'Prumo de alto mar e livro de sondas', english: 'Deep-sea lead and a sounding book', slot: 'instruments',
    cost: 220, standing: 10, days: 2, yard: 1, tons: 1,
    effects: { leadReach: 1.6, leadSigma: 0.8 },
    price: '1 t of line and lead',
    blurb: 'Two hundred fathoms of line and a lead heavy enough to find the bottom with. Soundings are truer, and found deeper.',
  },
  {
    id: 'camara-piloto', name: 'Câmara do piloto', english: 'Pilot’s chart room', slot: 'instruments',
    cost: 520, standing: 30, days: 5, yard: 2, tons: 2,
    effects: { reckoning: 0.72 },
    price: '2 t of cabin aft',
    blurb: 'A table kept dry and a board kept aft, with glasses and a log-line. The reckoning goes soft slower.',
  },
  {
    id: 'cartas-casa', name: 'Cartas da Casa e astrolábio', english: 'The Casa’s sea charts and a brass astrolabe', slot: 'instruments',
    cost: 1800, standing: 250, days: 6, yard: 3, tons: 0.5,
    effects: { reckoning: 0.55, leadReach: 1.8, leadSigma: 0.65, lookout: 1.2 },
    price: 'Nothing in the hold, and a great deal of renown',
    blurb: 'Cut at Lisbon to the master’s own pattern, with the Casa’s sheets under glass and a lead-room forward. The best the Ribeira can fit.',
  },

  // --- Ordnance (a trade good) ------------------------------------------
  {
    id: 'bercos', name: 'Berços', english: 'Swivel guns', slot: 'ordnance',
    cost: 300, standing: 0, days: 2, yard: 2, tons: 1.5,
    effects: { pieces: 2 },
    price: '1.5 t of bronze, resold at nearly what it cost',
    blurb: 'Two breech-loading swivels. A small fortune in bronze that sells again at any yard, and a prince in the east gives half as much again.',
  },
  {
    id: 'bombardas', name: 'Bombardas', english: 'Bombards', slot: 'ordnance',
    cost: 600, standing: 30, days: 6, yard: 2, tons: 5, minTons: 70,
    effects: { pieces: 6 },
    price: '5 t of iron',
    blurb: 'Six pieces of forged iron on the waist. Dear to carry, dear to sell, and the courts of the east will pay for them.',
  },
  {
    id: 'falcoes', name: 'Falcões', english: 'Falconets', slot: 'ordnance',
    cost: 820, standing: 90, days: 6, yard: 2, tons: 3, minTons: 100,
    effects: { pieces: 3 },
    price: '3 t of bronze',
    blurb: 'Three bronze falcons cast at the royal foundry. Light for the money, and a gift a king will remember.',
  },
  {
    id: 'camelos', name: 'Camelos', english: 'Heavy bronze guns', slot: 'ordnance',
    cost: 3000, standing: 200, days: 14, yard: 3, tons: 12, minTons: 140,
    hulls: ['nau-pequena', 'nau', 'nau-da-india', 'galeao'],
    effects: { pieces: 8, handiness: 0.95 },
    price: '12 t of bronze and a slower helm',
    blurb: 'Great bronze pieces from the royal foundry under the Crown’s seal. The most money a ship can carry in a corner of her waist, if she can carry the weight.',
  },
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

export function slotFittings(slot: SlotId): Upgrade[] {
  return UPGRADES.filter((u) => u.slot === slot);
}

/** Whether the hull has the room and the class for it. */
export function fitsHull(u: Upgrade, hullId: string): boolean {
  if (u.hulls && !u.hulls.includes(hullId)) return false;
  const h = HULL_BY_ID.get(hullId);
  return !u.minTons || !h || h.tons >= u.minTons;
}

type Combined = Required<Omit<UpgradeEffects, 'convertRig'>> & { convertRig?: 'square' | 'lateen' | 'mixed'; tons: number };

/** Combine every fitted upgrade into a single set of effects. */
export function combineEffects(ids: string[]): Combined {
  const acc: Combined = {
    foulingRate: 1, keel: 1, strength: 1, sailArea: 1, hold: 0, water: 0,
    handiness: 1, pumping: 1, spoilage: 1, scurvy: 1, boat: false, anchors: false, guns: 0, pieces: 0,
    lookout: 1, reckoning: 1, sickness: 1, gifts: false, rainCatch: false, fishing: false, leadReach: 1,
    pointing: 0, sailRepair: false, leadSigma: 1, holding: 0, storage: 1, wear: 1, morale: 0, tons: 0,
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
    if (e.pieces) acc.pieces += e.pieces;
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
    if (e.storage !== undefined) acc.storage *= e.storage;
    if (e.wear !== undefined) acc.wear *= e.wear;
    if (e.morale) acc.morale += e.morale;
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
  if (e.strength !== undefined) (e.strength > 1 ? good : bad).push(`${e.strength > 1 ? '+' : '−'}${pct(e.strength)} strength in a storm`);
  if (e.keel !== undefined && e.keel > 1) good.push(`${pct(1 / e.keel)} less leeway`);
  if (e.handiness !== undefined) (e.handiness > 1 ? good : bad).push(`Comes about ${pct(e.handiness)} ${e.handiness > 1 ? 'faster' : 'slower'}`);
  if (e.sailArea !== undefined) (e.sailArea > 1 ? good : bad).push(`${e.sailArea > 1 ? '+' : '−'}${pct(e.sailArea)} sail`);
  if (e.hold !== undefined && e.hold > 0) good.push(`+${e.hold} tons of hold`);
  if (e.water) good.push(`+${e.water} days of water`);
  if (e.storage !== undefined && e.storage < 1) good.push(`Stores weigh ${pct(e.storage)} less`);
  if (e.pumping !== undefined) (e.pumping > 1 ? good : bad).push(e.pumping > 1 ? `Pumps clear ${e.pumping.toFixed(1)}× the water` : `Pumping ${pct(e.pumping)} slower`);
  if (e.wear !== undefined) (e.wear < 1 ? good : bad).push(e.wear < 1 ? `Works open ${pct(e.wear)} less` : `Works open ${pct(e.wear)} faster`);
  if (e.spoilage !== undefined && e.spoilage < 1) good.push(`${pct(e.spoilage)} less spoilage`);
  if (e.scurvy !== undefined && e.scurvy < 1) good.push(`Scurvy comes on ${pct(e.scurvy)} slower`);
  if (e.boat) good.push('Kedges her off the ground; lands a party through surf');
  if (e.anchors) good.push('Far better odds riding out a lee shore at anchor');
  if (e.pieces) good.push(`${e.pieces} pieces: a store of value, resold at any yard`);
  if (e.lookout) good.push(`Sees ${pct(e.lookout)} further from the masthead`);
  if (e.reckoning) good.push(`Reckoning goes soft ${pct(e.reckoning)} slower`);
  if (e.sickness) good.push(`Fevers and flux ${pct(e.sickness)} less`);
  if (e.leadReach) good.push(`Lead finds bottom ${pct(e.leadReach)} deeper`);
  if (e.gifts) good.push('Better first meetings with new peoples');
  if (e.rainCatch) good.push('Fills the casks in every squall');
  if (e.fishing) good.push('Fresh fish on the shelf and near land');
  if (e.pointing) good.push(`Lies ${e.pointing}° closer to the wind`);
  if (e.sailRepair) good.push('Mends blown-out canvas at sea');
  if (e.leadSigma !== undefined && e.leadSigma < 1) good.push(`Soundings ${pct(e.leadSigma)} truer`);
  if (e.holding) good.push('Rides out a lee shore on more anchors');
  if (e.morale) (e.morale > 0 ? good : bad).push(e.morale > 0 ? 'The company lives better' : 'The company lives worse');
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
 * Whether a fitting can be made now, and if not, the reason. `yard` is what the
 * port can do (see yardLevel); `standing` is renown with the Crown. One fitting
 * to a slot: a new one replaces what is there.
 */
export function nodeStatus(
  u: Upgrade, fitted: string[], hullId: string, standing: number, yard: number,
): { state: NodeState; why: string; replaces: string[] } {
  if (fitted.includes(u.id)) return { state: 'built', why: '', replaces: [] };
  if (!fitsHull(u, hullId)) {
    return { state: 'locked', why: u.hulls && !u.hulls.includes(hullId) ? 'Not for this hull' : 'No room for it in this hull', replaces: [] };
  }
  if (u.standing > standing) return { state: 'locked', why: `At ${u.standing} renown`, replaces: [] };
  if (yard < u.yard) {
    return { state: 'locked', why: u.yard >= 3 ? 'Only the Ribeira at Lisbon' : yard === 0 ? 'No yard here' : 'Wants a proper yard', replaces: [] };
  }
  const replaces = fitted.filter((id) => UPGRADE_BY_ID.get(id)?.slot === u.slot);
  return { state: 'open', why: '', replaces };
}

/** Which fitted work goes with a ship's captain into a new hull: all but the hull treatment. */
export function movesWithTheFlag(id: string): boolean {
  const u = UPGRADE_BY_ID.get(id);
  return !!u && u.slot !== 'hull';
}

/**
 * What a piece of ordnance fetches when it comes out: the yard takes it back at
 * four fifths; a prince who wants guns pays half as much again.
 */
export function ordnanceResale(u: Upgrade, port: { lon: number; people: string }): number {
  const eager = port.lon > 45 && port.people !== 'portuguese';
  return Math.round(u.cost * (eager ? 1.45 : 0.8));
}
