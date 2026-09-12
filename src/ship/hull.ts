export type RigKind = 'lateen' | 'square';

export interface MastSpec {
  /** Name as the crew would call it. */
  name: string;
  rig: RigKind;
  /** Sail area in square metres at full canvas. */
  area: number;
  /** Height of the centre of effort above the waterline, metres. */
  ceHeight: number;
  /** Position of the mast along the hull, -1 at the stern, +1 at the bow. */
  station: number;
}

export interface HullClass {
  id: string;
  name: string;
  english: string;
  /** Burthen in tonéis, the period measure of capacity. */
  tons: number;
  /** Waterline length, metres. */
  lwl: number;
  beam: number;
  draft: number;
  /** Loaded displacement, kilograms. */
  displacement: number;
  masts: MastSpec[];
  /** Cargo capacity in tons. */
  hold: number;
  crewMin: number;
  crewFull: number;
  /** Structural strength, scales storm damage resistance. */
  strength: number;
  /** How readily she answers her helm, 0-1. */
  handiness: number;
  /** Purchase price in cruzados. */
  cost: number;
  /** Renown required from the Crown before one will be granted. */
  standing: number;
  blurb: string;
}

const lateen = (name: string, area: number, ceHeight: number, station: number): MastSpec =>
  ({ name, rig: 'lateen', area, ceHeight, station });
const square = (name: string, area: number, ceHeight: number, station: number): MastSpec =>
  ({ name, rig: 'square', area, ceHeight, station });

export const HULL_CLASSES: HullClass[] = [
  {
    id: 'barcha',
    name: 'Barcha', english: 'Barque',
    tons: 25, lwl: 14, beam: 4.6, draft: 1.5, displacement: 42000,
    masts: [lateen('Mainmast', 90, 8.5, 0.05)],
    hold: 14, crewMin: 8, crewFull: 14, strength: 0.5, handiness: 0.85,
    cost: 380, standing: 0,
    blurb: 'A single-masted coaster. The Infante sent these down the coast of Africa for twenty years before anything better existed, and the men who sailed them turned back at Bojador twelve times.',
  },
  {
    id: 'caravela-latina',
    name: 'Caravela latina', english: 'Lateen caravel',
    tons: 50, lwl: 19, beam: 6.1, draft: 2.0, displacement: 95000,
    masts: [
      lateen('Mainmast', 150, 12.5, 0.1),
      lateen('Mizzen', 78, 9.5, -0.55),
    ],
    hold: 30, crewMin: 14, crewFull: 24, strength: 0.62, handiness: 0.92,
    cost: 900, standing: 0,
    blurb: 'The instrument of discovery. She will lie within five points of the wind, which no square-rigged ship on earth can do, and that is the only reason anyone ever came home from Guinea.',
  },
  {
    id: 'caravela-redonda',
    name: 'Caravela redonda', english: 'Square-rigged caravel',
    tons: 70, lwl: 21, beam: 6.8, draft: 2.3, displacement: 135000,
    masts: [
      square('Foremast', 105, 11.0, 0.62),
      lateen('Mainmast', 150, 13.0, 0.02),
      lateen('Mizzen', 70, 9.5, -0.62),
    ],
    hold: 45, crewMin: 18, crewFull: 32, strength: 0.68, handiness: 0.84,
    cost: 1500, standing: 25,
    blurb: 'A square course forward for running down the trades, lateens aft for working to windward. The compromise that made the long ocean crossings practical.',
  },
  {
    id: 'nau-pequena',
    name: 'Nau pequena', english: 'Small carrack',
    tons: 140, lwl: 24, beam: 8.4, draft: 3.1, displacement: 310000,
    masts: [
      square('Foremast', 175, 13.0, 0.66),
      square('Mainmast', 300, 17.5, 0.03),
      lateen('Mizzen', 95, 11.0, -0.66),
    ],
    hold: 105, crewMin: 30, crewFull: 55, strength: 0.78, handiness: 0.62,
    cost: 3200, standing: 90,
    blurb: 'Room for cargo and men, and a hull that will take a beating off the Cape. She will not point, so plan the passage around the wind rather than fighting it.',
  },
  {
    id: 'nau',
    name: 'Nau', english: 'Carrack',
    tons: 260, lwl: 28, beam: 9.8, draft: 3.8, displacement: 580000,
    masts: [
      square('Foremast', 250, 15.5, 0.66),
      square('Mainmast', 430, 21.0, 0.03),
      lateen('Mizzen', 130, 12.5, -0.64),
    ],
    hold: 205, crewMin: 45, crewFull: 90, strength: 0.86, handiness: 0.5,
    cost: 6800, standing: 200,
    blurb: 'The ship of the India run. Slow, enormously strong, and capable of carrying enough pepper home to pay for the entire voyage four times over.',
  },
  {
    id: 'nau-da-india',
    name: 'Nau da Índia', english: 'Great Indiaman',
    tons: 480, lwl: 33, beam: 11.6, draft: 4.6, displacement: 1100000,
    masts: [
      square('Foremast', 340, 17.5, 0.66),
      square('Mainmast', 620, 24.5, 0.03),
      square('Gávea do grande', 180, 33.0, 0.03),
      lateen('Mizzen', 180, 14.0, -0.64),
    ],
    hold: 400, crewMin: 70, crewFull: 150, strength: 0.95, handiness: 0.38,
    cost: 15000, standing: 480,
    blurb: 'A floating warehouse with a castle at each end. Half of them never come back, and the half that do make more money than a province.',
  },
];

export const HULL_BY_ID = new Map(HULL_CLASSES.map((h) => [h.id, h]));

export function hullClass(id: string): HullClass {
  const h = HULL_BY_ID.get(id);
  if (!h) throw new Error(`unknown hull class: ${id}`);
  return h;
}

/** Total sail area at full canvas. */
export function totalSailArea(h: HullClass): number {
  return h.masts.reduce((s, m) => s + m.area, 0);
}

/**
 * Theoretical hull speed in knots. Displacement hulls cannot outrun their own
 * bow wave, so this is a soft ceiling on everything below.
 */
export function hullSpeedKnots(h: HullClass): number {
  return 1.34 * Math.sqrt(h.lwl * 3.28084);
}
