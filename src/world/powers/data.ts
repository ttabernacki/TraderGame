import type { FrontDef, FrontId, PowerId } from './types';

/**
 * The six Fronts and the Powers, as data (BUILD_PLAN C2). In this build only the Traffic and the Gold
 * tick, and only Kongo moves; the other four Fronts and the other Powers are written out in full so
 * that the Ledger's tables (`deltas.ts`) have somewhere to point and the later stages only add code.
 *
 * Source discipline (docs/DESIGN.md): every dated or attributed event below carries `source`, and
 * anything the game made up is marked `invented`. If a detail was not certain it is left generic.
 * The notes are collected in docs/SOURCES.md under "The Powers and the Traffic (C2)".
 */

const T = (name: string, line: string) => ({ name, line });

export const FRONTS: Record<FrontId, FrontDef> = {
  traffic: {
    id: 'traffic', name: 'The Traffic', region: 'Arguim, Mina, Kongo, and the islands',
    stages: [
      T('Ransom and barter', 'People are bought and ransomed on the edge of the Sahara and the coast of Guinea for horses, wheat and cloth, a few hundred a year. The sellers have done it longer than the Portuguese have been on the sea, and the factors write it in the same book as the gum.'),
      T('Routine', 'It has a book and a clerk at every factory. The Castle at Mina buys people from the east coast for gold, and the ships carry them without remark.'),
      T('Plantations and a quota', 'The cane on São Tomé wants hands, and the Casa writes a number into the licence of any ship that sails the Mina road.'),
      T('The system', 'Sugar is cheap in Lisbon. The court at Mbanza Kongo has split over what it sells. Children are being born into it who will never be asked.'),
    ],
    start: 1.0, perYear: 0.4, ticks: true,
    levers: {
      push: { label: 'Carry them', cost: 'Only what you will know; it pays freight', delta: 0.10 },
      brake: { label: 'Refuse, and lose the freight and the factor’s goodwill', cost: 'The freight, and the berth the factor kept for you', delta: -0.05 },
      contest: { label: 'Take it to a hearing', cost: 'Casa regard; the hearing is usually refused', delta: -0.15 },
    },
    // No lever stops a great process: the captain can move it about one tick down from the history line.
    offsetMin: -1.2, offsetMax: 2.4,
    effects: [
      {
        minStage: 2, ports: ['mina'], stock: { ouro: 1.05 },
        line: 'People bought from the east coast are working the diggings behind Mina, and more gold comes down to the beach.',
      },
      {
        minStage: 3, ports: ['sao-tome-porto'], stock: { acucar: 1.3 }, price: { acucar: 0.92 }, prosperity: 0.01,
        line: 'The mills on São Tomé run on the people the ships bring, and the island is richer for it.',
      },
      {
        minStage: 3, ports: ['funchal'], price: { acucar: 0.95 },
        line: 'Cane from São Tomé undercuts Madeira’s.',
      },
      {
        minStage: 3, ports: ['lisboa'], price: { acucar: 0.96 },
        line: 'Sugar from São Tomé is cheaper on the Tagus.',
      },
      {
        minStage: 4, ports: ['lisboa'], price: { acucar: 0.92 },
        line: 'Sugar on the Tagus is cheap enough that nobody asks where it was cut.',
      },
      {
        minStage: 4, ports: ['sao-tome-porto'], stock: { acucar: 1.15 },
        line: 'São Tomé’s mills have outgrown the island’s own people.',
      },
      {
        minStage: 4, ports: ['mpinda'], duesMult: 1.25, prosperity: -0.01,
        line: 'The Manikongo’s court is divided over the trade; what is asked at Mpinda changes with whoever holds the beach this season.',
      },
    ],
  },

  gold: {
    id: 'gold', name: 'The Gold', region: 'The Mina coast',
    stages: [
      T('The Castle and the beach', 'São Jorge stands on the Akan’s ground by the Akan’s leave, and the gold comes down to it.'),
      T('The fort strained', 'Fever has thinned the garrison, the factor is short of goods that the beach wants, and the Akan buyers are patient less often.'),
      T('A hard coast', 'Interlopers work the beach, the gold goes elsewhere, and every ship that comes has to be paid for in goodwill.'),
      T('The beach is shut', 'The Akan have stopped selling to the Castle on its terms. The fort lives on what it is sent.'),
    ],
    start: 1.0, perYear: 0.25, ticks: true,
    levers: {
      push: { label: 'Press the Akan for more', cost: 'Their patience', delta: 0.12 },
      brake: { label: 'Deal fair, and spend the time', cost: 'Margin, and days on the beach', delta: -0.08 },
      contest: { label: 'Take the beach’s case to the Castle’s captain', cost: 'Casa regard', delta: -0.10 },
    },
    offsetMin: -1.6, offsetMax: 3,
    effects: [
      { minStage: 2, ports: ['mina'], stock: { ouro: 0.95 }, line: 'Gold is slower to come down: the Akan are choosier about whom they sell to.' },
      { minStage: 3, ports: ['mina', 'axim', 'acara'], stock: { ouro: 0.85 }, duesMult: 1.2, prosperity: -0.01, line: 'The beach is a hard one now, and every ship pays for the privilege of landing.' },
      { minStage: 4, ports: ['mina'], stock: { ouro: 0.6 }, duesMult: 1.5, line: 'The Akan have stopped selling to the Castle on its terms.' },
    ],
  },

  claim: {
    id: 'claim', name: 'The Claim', region: 'The Atlantic and the line',
    stages: [
      T('Soundings and padrões', 'Portugal has the south Atlantic to itself and says so with stone.'),
      T('Castile asks', 'Castile is asking where the line runs, and who gave the pilots their sheets.'),
      T('The line is drawn', 'The line is drawn on paper, and both crowns are arguing over where it falls on water.'),
      T('The race', 'Whoever lands first, owns. Both crowns send what they have.'),
    ],
    start: 0.5, perYear: 0.35, ticks: false,
    levers: {
      push: { label: 'Raise another padrão', cost: 'A stone and a risk', delta: 0.15 },
      brake: { label: 'Keep the sheets in the Casa’s press', cost: 'Renown you might have sold', delta: -0.08 },
      contest: { label: 'Argue the line at court', cost: 'Casa regard', delta: -0.10 },
    },
    offsetMin: -1.2, offsetMax: 2.4,
    effects: [
      { minStage: 3, ports: ['mina', 'axim'], price: { ouro: 1.04 }, line: 'Castilian ships are bidding for gold on the Mina beach.' },
      { minStage: 4, ports: ['mina', 'axim'], price: { ouro: 1.04 }, stock: { ouro: 0.95 }, line: 'Castile and Portugal are both on the beach, and the gold goes to whoever pays at once.' },
    ],
  },

  crescent: {
    id: 'crescent', name: 'The Crescent', region: 'The Red Sea and the Indian Ocean',
    stages: [
      T('Quiet in Cairo', 'The Sultan’s customs are collected as they always were, and Venice buys what comes up the Red Sea.'),
      T('Notes', 'The Mamluk court has written to Rome and to Lisbon, and nobody on the quays at Aden is calm.'),
      T('Convoys', 'The ships out of Aden sail in company, and pepper is dearer in Europe than it has been.'),
      T('A league', 'Cairo, Gujarat and Calicut have agreed on something, and it is aimed at the ships that came round the Cape.'),
    ],
    start: 0.0, perYear: 0.3, ticks: false,
    levers: {
      push: { label: 'Press the Portuguese advantage', cost: 'The next ship you meet', delta: 0.12 },
      brake: { label: 'Spare a ship, and be known for it', cost: 'The prize', delta: -0.06 },
      contest: { label: 'Carry a peace between courts', cost: 'Weeks, and your word', delta: -0.15 },
    },
    offsetMin: -1.6, offsetMax: 3,
    effects: [
      { minStage: 3, ports: ['lisboa'], price: { pimenta: 1.06 }, line: 'The Red Sea road is moving more of the pepper, and Lisbon pays more for what comes round the Cape.' },
      { minStage: 3, ports: ['calecute', 'cochim', 'cananor'], duesMult: 1.1, line: 'Convoys of the Moorish ships make the Malabar quays dear.' },
      { minStage: 4, ports: ['lisboa'], price: { pimenta: 1.08 }, line: 'The league has raised the price of pepper on the Tagus.' },
    ],
  },

  rule: {
    id: 'rule', name: 'The Rule', region: 'The Indian Ocean',
    stages: [
      T('Free sea', 'Anyone may sail anywhere, and nobody has a pass.'),
      T('Friends have passes', 'Ships of friends carry a Portuguese letter, and are left alone.'),
      T('Stopping unlicensed ships', 'A ship without the letter is stopped, searched and sometimes taken.'),
      T('Blockade', 'The ports are closed to ships without the letter, and the ocean is watched.'),
    ],
    start: 0.0, perYear: 0.3, ticks: false,
    levers: {
      push: { label: 'Stop the unlicensed', cost: 'Every captain’s opinion of you', delta: 0.20 },
      brake: { label: 'Let her pass', cost: 'The King’s letter', delta: -0.10 },
      contest: { label: 'Argue it at court', cost: 'Casa regard', delta: -0.10 },
    },
    offsetMin: -1.6, offsetMax: 3.2,
    effects: [
      { minStage: 2, ports: ['calecute', 'cochim', 'cananor', 'melinde', 'quiloa', 'mombaca', 'adem', 'ormuz'], duesMult: 1.1, line: 'Ships without a Portuguese letter pay more to land.' },
      { minStage: 3, ports: ['calecute', 'cochim', 'cananor', 'melinde', 'quiloa', 'mombaca', 'adem', 'ormuz'], duesMult: 1.2, line: 'Ships without a Portuguese letter are stopped, and the quays charge for the risk.' },
      { minStage: 4, ports: ['calecute', 'adem', 'ormuz'], closes: true, duesMult: 1.3, line: 'The great ports are shut to ships without the letter.' },
    ],
  },

  court: {
    id: 'court', name: 'The Court', region: 'Lisbon',
    stages: [
      T('The throne holds', 'The King rules, and the Casa does what he says.'),
      T('Favourites', 'Patrons rise and fall, and a captain’s standing depends on whose man he is.'),
      T('The Rua Nova ascendant', 'The money on the Rua Nova outweighs the old families.'),
      T('The reckoning', 'The Church, the throne and the money have each been given what they asked for, and each wants to be paid.'),
    ],
    start: 0.5, perYear: 0.25, ticks: false,
    levers: {
      push: { label: 'Take a patron’s side', cost: 'The other patrons', delta: 0.08 },
      brake: { label: 'Stay out of it', cost: 'Whatever the patron would have given', delta: -0.05 },
      contest: { label: 'Petition the King', cost: 'Casa regard', delta: -0.10 },
    },
    offsetMin: -1.6, offsetMax: 2.4,
    effects: [
      { minStage: 3, ports: ['lisboa'], duesMult: 1.1, line: 'Everything at the Casa takes longer, and costs more, than it did.' },
      { minStage: 4, ports: ['lisboa'], duesMult: 1.1, line: 'The reckoning has reached the quays.' },
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// Powers

export interface PowerDef {
  id: PowerId;
  name: string;
  /** The polities (diplomacy/polities) it speaks for, and 'portugal' for the Crown. */
  polities: string[];
  /** Whether the monthly tick moves it in this build. Only Kongo. */
  ticks: boolean;
  /** Inside the Traffic: has its own interests and terms; moves come later. */
  inside?: boolean;
  /** What it wants over the next 24 months, in the voice of the Book. */
  intent: string;
  /** Rough means, 0..1: coin, arms, ships. INVENTED: order-of-magnitude judgement for the game, not sourced. */
  means: { coin: number; arms: number; ships: number };
  /** Home factions, where the Power is a court of several. */
  factions?: string[];
}

export const POWERS: PowerDef[] = [
  { id: 'crown', name: 'The Crown’s court', polities: ['portugal'], ticks: false, intent: 'Keep the gold, find the road to India, and keep Castile south of the line.', means: { coin: 0.7, arms: 0.5, ships: 0.7 }, factions: ['the throne', 'the Order of Christ and the Church', 'the Rua Nova money'] },
  { id: 'castile', name: 'Castile', polities: ['castile'], ticks: false, intent: 'Press for the Guinea trade and for the line to run where it suits.', means: { coin: 0.6, arms: 0.6, ships: 0.5 } },
  { id: 'mamluk', name: 'The Mamluk–Venetian axis', polities: ['aden', 'hormuz', 'gujarat'], ticks: false, intent: 'Keep the spice road through the Red Sea open and Lisbon’s ships out of it.', means: { coin: 0.8, arms: 0.5, ships: 0.4 } },
  { id: 'kilwa', name: 'Kilwa and Mombaça', polities: ['kilwa', 'mombasa'], ticks: false, intent: 'Keep the gold of Sofala flowing north on their own terms, and Melinde down.', means: { coin: 0.6, arms: 0.4, ships: 0.3 } },
  { id: 'melinde', name: 'Melinde', polities: ['malindi'], ticks: false, intent: 'Find a friend against Mombaça.', means: { coin: 0.4, arms: 0.2, ships: 0.2 } },
  { id: 'calicut', name: 'Calicut and the Mappila merchants', polities: ['calicut'], ticks: false, intent: 'Keep the Moorish merchants and the pepper under the Zamorin’s hand.', means: { coin: 0.7, arms: 0.5, ships: 0.4 } },
  { id: 'cochin', name: 'Cochim and the Kolathiri', polities: ['cochin', 'kolathiri'], ticks: false, intent: 'Pay no tribute to Calicut, if somebody will stand behind them.', means: { coin: 0.4, arms: 0.3, ships: 0.2 } },
  { id: 'kongo', name: 'Kongo, with Soyo', polities: ['kongo'], ticks: true, intent: 'The elders want the king’s monopoly kept; the traders want to sell to whoever comes.', means: { coin: 0.4, arms: 0.6, ships: 0.05 }, factions: ['elders', 'traders', 'warriors'] },
  // Inside the Traffic
  { id: 'akan', name: 'The Akan of the Gold Coast', polities: ['eguafo'], ticks: false, inside: true, intent: 'Sell gold at the best price, and buy the labour the mines need from whoever brings it.', means: { coin: 0.5, arms: 0.5, ships: 0.1 } },
  { id: 'benin', name: 'The Kingdom of Benin', polities: ['benin'], ticks: false, inside: true, intent: 'Set the terms of what Benin sells, and to whom.', means: { coin: 0.5, arms: 0.6, ships: 0.1 } },
  { id: 'sahel', name: 'The Sahel: Azenegue, Wolof and Mandinka', polities: ['azenegue', 'jolof', 'kaabu'], ticks: false, inside: true, intent: 'Sell to whoever pays most, in horses, wheat or cloth.', means: { coin: 0.4, arms: 0.6, ships: 0.05 } },
];

export const POWER_BY_ID = new Map<PowerId, PowerDef>(POWERS.map((p) => [p.id, p]));
export const POWER_OF_POLITY = new Map<string, PowerId>(POWERS.flatMap((p) => p.polities.map((x): [string, PowerId] => [x, p.id])));

// ---------------------------------------------------------------------------------------------
// The history schedule: dated shocks

export type SourceGrade = 'documented' | 'approximate' | 'invented';

export interface DatedShock {
  id: string;
  /** Resolve the date from chronicle HISTORY instead of writing it here. */
  history?: string;
  year?: number;
  month?: number;
  front?: FrontId;
  /** Points added to the Front's history line (not the captain's offset). */
  delta?: number;
  power?: PowerId;
  /** Attitude moved by the event itself, not by the captain. */
  attitude?: number;
  /** What the Book says when the news arrives. */
  text: string;
  /** Where the world first knew it, for the rumour. */
  place?: string;
  /** Source note (kept here and in docs/SOURCES.md). */
  source: string;
  grade: SourceGrade;
}

export const SCHEDULE: DatedShock[] = [
  {
    id: 'cao-congo', history: 'cao', front: 'traffic', delta: 0.10, power: 'kongo', attitude: 0.0, place: 'mpinda',
    text: 'Diogo Cão has reached the great river of the Kongo. A coast with kings and markets is open to the ships.',
    source: 'Date from chronicle HISTORY (Cão at the Congo, c. 1482-84; the sources differ by a year).', grade: 'approximate',
  },
  {
    id: 'casa-escravos', year: 1486, month: 6, front: 'traffic', delta: 0.15, place: 'lisboa',
    text: 'The Crown’s customs on people landed at Lisbon are ordered under one house, the Casa dos Escravos.',
    source: 'The Casa dos Escravos at Lisbon is documented from the 1480s; the exact year is not fixed here and the game does not claim 1486 as the date of its founding.', grade: 'approximate',
  },
  {
    id: 'benin-contact', year: 1486, month: 9, front: 'traffic', delta: 0.10, power: 'benin', attitude: 0.08, place: 'ugoton',
    text: 'A Portuguese captain has been to Benin, and the Oba has sent a man to see the King of Portugal.',
    source: 'João Afonso de Aveiro at Benin c. 1485-86 and an ambassador carried to Lisbon (Ryder, Benin and the Europeans, 1969; Pacheco Pereira, Esmeraldo).', grade: 'documented',
  },
  {
    id: 'dias-cape', history: 'dias-returns', front: 'claim', delta: 0.30, place: 'lisboa',
    text: 'Dias has rounded the Cape and found the sea open to the east.',
    source: 'Date from chronicle HISTORY (Dias returns, December 1488).', grade: 'documented',
  },
  {
    id: 'kongo-baptism', year: 1491, month: 5, front: 'traffic', delta: 0.10, power: 'kongo', attitude: 0.10, place: 'mpinda',
    text: 'The Manikongo has been baptised, and takes the name João. Priests and masons are asked for.',
    source: 'The Mani Soyo baptised 3 April and the Manikongo (as João I) on 3 May 1491 (Rui de Pina; Pigafetta and Lopes). The dates are the usual ones; the game does not claim the detail.', grade: 'documented',
  },
  {
    id: 'colombo-west', history: 'colombo-returns', front: 'claim', delta: 0.50, place: 'lisboa',
    text: 'The Genoese is back from the west, and Castile has a claim to answer.',
    source: 'Date from chronicle HISTORY (Columbus returns, 1493).', grade: 'documented',
  },
  {
    id: 'sao-tome-caminha', year: 1493, month: 1, front: 'traffic', delta: 0.25, place: 'sao-tome-porto',
    text: 'The King has given São Tomé to Álvaro de Caminha, with settlers, convicts, and orders to plant. Cane will follow.',
    source: 'Donation of São Tomé to Álvaro de Caminha, 1493 (Hair; Seibert on São Tomé).', grade: 'documented',
  },
  {
    id: 'tordesillas-line', history: 'tordesillas', front: 'claim', delta: 0.40, place: 'lisboa',
    text: 'At Tordesillas the line is drawn.',
    source: 'Date from chronicle HISTORY (Tordesillas, June 1494).', grade: 'documented',
  },
  {
    id: 'joao-dies', history: 'manuel', front: 'court', delta: 0.40, place: 'lisboa',
    text: 'The King is dead, and the court is new.',
    source: 'Date from chronicle HISTORY (João II dies, October 1495).', grade: 'documented',
  },
  {
    id: 'edict', year: 1496, month: 12, front: 'court', delta: 0.40, place: 'lisboa',
    text: 'The King has ordered the Jews out of Portugal or into the font. The Rua Nova is not calm.',
    source: 'Edict of expulsion, December 1496; forced conversions in 1497 (Tavares; Soyer).', grade: 'documented',
  },
  {
    id: 'sao-tome-sugar', year: 1500, month: 6, front: 'traffic', delta: 0.25, place: 'sao-tome-porto',
    text: 'The first mills are grinding on São Tomé, and the planters are asking for more hands than the island has.',
    source: 'São Tomé’s first sugar exports fall in the first years of the 1500s; the date is approximate and the game does not claim the year.', grade: 'approximate',
  },
  {
    id: 'kongo-succession', year: 1506, month: 6, power: 'kongo', place: 'mpinda',
    text: 'The old Manikongo is failing, and two of his sons have men under arms.',
    source: 'Afonso I (Mvemba a Nzinga) succeeded Nzinga a Nkuwu c. 1506-09; the sources differ and the game gives no year in a scene.', grade: 'approximate',
  },
  {
    id: 'benin-terms', year: 1516, month: 1, front: 'traffic', power: 'benin', place: 'ugoton',
    text: 'The Oba will sell no more men from Benin; women are another matter.',
    source: 'Benin’s ban on the export of male captives, early sixteenth century, often put about 1516 (Ryder). The year is approximate.', grade: 'approximate',
  },
];

export function shockDate(s: DatedShock, history: { id: string; year: number; month: number }[]): { year: number; month: number } | null {
  if (s.history) {
    const h = history.find((x) => x.id === s.history);
    return h ? { year: h.year, month: h.month } : null;
  }
  return s.year !== undefined && s.month !== undefined ? { year: s.year, month: s.month } : null;
}
