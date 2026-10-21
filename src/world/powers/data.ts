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
    offsetMin: -1.6, offsetMax: 3.6,
    effects: [
      { minStage: 2, ports: ['mina'], stock: { ouro: 0.95 }, line: 'Gold is slower to come down: the Akan are choosier about whom they sell to.' },
      { minStage: 2, maxStage: 2, ports: ['lisboa'], price: { ouro: 1.01 }, line: 'The Castle’s returns are a little short, and the Casa notices on the Tagus.' },
      { minStage: 3, ports: ['mina', 'axim', 'acara'], stock: { ouro: 0.85 }, duesMult: 1.2, prosperity: -0.01, line: 'The beach is a hard one now, and every ship pays for the privilege of landing.' },
      { minStage: 3, maxStage: 3, ports: ['lisboa'], price: { ouro: 1.04 }, line: 'Less gold is coming up from Mina, and the Casa pays more for what there is.' },
      { minStage: 4, ports: ['mina'], stock: { ouro: 0.6 }, duesMult: 1.5, line: 'The Akan have stopped selling to the Castle on its terms.' },
      { minStage: 4, ports: ['lisboa'], price: { ouro: 1.09 }, line: 'The Mina beach is shut, and gold on the Tagus is dear.' },
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
    start: 0.5, perYear: 0.04, ticks: true,
    levers: {
      push: { label: 'Raise another padrão', cost: 'A stone and a risk', delta: 0.15 },
      brake: { label: 'Keep the sheets in the Casa’s press', cost: 'Renown you might have sold', delta: -0.08 },
      contest: { label: 'Argue the line at court', cost: 'Casa regard', delta: -0.10 },
    },
    offsetMin: -1.2, offsetMax: 3.0,
    effects: [
      { minStage: 3, ports: ['mina', 'axim'], price: { ouro: 1.04 }, line: 'Castilian ships are bidding for gold on the Mina beach.' },
      { minStage: 4, ports: ['mina', 'axim'], price: { ouro: 1.04 }, stock: { ouro: 0.95 }, line: 'Castile and Portugal are both on the beach, and the gold goes to whoever pays at once.' },
      { minStage: 3, maxStage: 3, ports: ['las-palmas'], duesMult: 1.1, line: 'Castile’s harbour-master at Las Palmas asks what a Portuguese hull has been doing south of the line.' },
      { minStage: 4, ports: ['las-palmas'], duesMult: 1.2, line: 'Castile’s harbour-master at Las Palmas has orders about Portuguese ships, and reads them aloud.' },
      { minStage: 4, ports: ['sao-tome-porto', 'mpinda'], duesMult: 1.05, line: 'Both crowns have ships out beyond Mina, and every quay there asks whose a stranger is.' },
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
    start: 0.0, perYear: 0, ticks: true,
    levers: {
      push: { label: 'Press the Portuguese advantage', cost: 'The next ship you meet', delta: 0.12 },
      brake: { label: 'Spare a ship, and be known for it', cost: 'The prize', delta: -0.06 },
      contest: { label: 'Carry a peace between courts', cost: 'Weeks, and your word', delta: -0.15 },
    },
    offsetMin: -4, offsetMax: 5,
    effects: [
      { minStage: 2, ports: ['adem'], duesMult: 1.05, line: 'Notes have gone to Cairo and Rome, and the harbour-master at Adem counts the Portuguese in every account.' },
      { minStage: 3, ports: ['cambaia', 'diu'], price: { pimenta: 1.08 }, stock: { pimenta: 0.9 }, line: 'The merchants of Gujarat sail in company, and what they carry goes to the Red Sea first.' },
      { minStage: 2, maxStage: 2, ports: ['lisboa'], price: { pimenta: 1.03 }, line: 'Venice’s factors have written home about the Cape pepper, and Lisbon’s brokers are asking more for it.' },
      { minStage: 3, maxStage: 3, ports: ['lisboa'], price: { pimenta: 1.07 }, line: 'The Red Sea road is moving more of the pepper, and Lisbon pays more for what comes round the Cape.' },
      { minStage: 3, ports: ['calecute', 'cochim', 'cananor'], duesMult: 1.1, line: 'Convoys of the Moorish ships make the Malabar quays dear.' },
      { minStage: 4, ports: ['lisboa'], price: { pimenta: 1.11 }, line: 'The league has raised the price of pepper on the Tagus.' },
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
    start: 0.0, perYear: 0, ticks: true,
    levers: {
      push: { label: 'Stop the unlicensed', cost: 'Every captain’s opinion of you', delta: 0.20 },
      brake: { label: 'Let her pass', cost: 'The King’s letter', delta: -0.10 },
      contest: { label: 'Argue it at court', cost: 'Casa regard', delta: -0.10 },
    },
    offsetMin: -5, offsetMax: 7,
    effects: [
      { minStage: 2, maxStage: 3, ports: ['melinde', 'cochim'], prosperity: 0.008, line: 'Ships with the King’s letter are left alone, and the friends who hold it are trading more.' },
      { minStage: 3, ports: ['calecute'], prosperity: -0.012, stock: { pimenta: 0.93 }, line: 'Calecute’s own ships are stopped on the coast, and the Mappila houses ship less pepper.' },
      { minStage: 3, ports: ['quiloa'], stock: { ouro: 0.93 }, prosperity: -0.008, line: 'Kilwa’s gold dhows are stopped for the letter, and less of it reaches the quay.' },
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
    start: 0.5, perYear: 0.08, ticks: true,
    levers: {
      push: { label: 'Take a patron’s side', cost: 'The other patrons', delta: 0.08 },
      brake: { label: 'Stay out of it', cost: 'Whatever the patron would have given', delta: -0.05 },
      contest: { label: 'Petition the King', cost: 'Casa regard', delta: -0.10 },
    },
    offsetMin: -1.6, offsetMax: 2.4,
    effects: [
      { minStage: 3, maxStage: 3, ports: ['lisboa'], duesMult: 1.05, line: 'Everything at the Casa takes longer, and costs more, than it did.' },
      { minStage: 4, ports: ['lisboa'], duesMult: 1.08, line: 'The reckoning has reached the quays.' },
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
  { id: 'castile', name: 'Castile', polities: ['castile'], ticks: true, intent: 'Press for the Guinea trade and for the line to run where it suits.', means: { coin: 0.6, arms: 0.6, ships: 0.5 } },
  { id: 'mamluk', name: 'The Mamluk–Venetian axis', polities: ['aden', 'hormuz'], ticks: true, intent: 'Keep the spice road through the Red Sea open and Lisbon’s ships out of it.', means: { coin: 0.8, arms: 0.5, ships: 0.4 } },
  { id: 'kilwa', name: 'Kilwa', polities: ['kilwa'], ticks: true, intent: 'Keep the gold of Sofala flowing north on its own terms.', means: { coin: 0.6, arms: 0.3, ships: 0.3 } },
  { id: 'mombasa', name: 'Mombaça', polities: ['mombasa'], ticks: true, intent: 'Keep the strongest harbour on the coast, and Melinde down.', means: { coin: 0.5, arms: 0.6, ships: 0.4 } },
  { id: 'melinde', name: 'Melinde', polities: ['malindi'], ticks: true, intent: 'Find a friend against Mombaça.', means: { coin: 0.4, arms: 0.2, ships: 0.2 } },
  { id: 'calicut', name: 'Calicut and the Mappila merchants', polities: ['calicut'], ticks: true, intent: 'Keep the Moorish merchants and the pepper under the Zamorin’s hand.', means: { coin: 0.7, arms: 0.5, ships: 0.4 } },
  { id: 'cochin', name: 'Cochim and the Kolathiri', polities: ['cochin', 'kolathiri'], ticks: true, intent: 'Pay no tribute to Calicut, if somebody will stand behind them.', means: { coin: 0.4, arms: 0.3, ships: 0.2 } },
  { id: 'gujarat', name: 'Gujarat and Cambay', polities: ['gujarat'], ticks: true, intent: 'Keep the cloth going out and the Red Sea road open; wait to see who wins at Calecute.', means: { coin: 0.8, arms: 0.5, ships: 0.5 } },
  { id: 'kongo', name: 'Kongo, with Soyo', polities: ['kongo'], ticks: true, intent: 'The elders want the king’s monopoly kept; the traders want to sell to whoever comes.', means: { coin: 0.4, arms: 0.6, ships: 0.05 }, factions: ['elders', 'traders', 'warriors'] },
  // Inside the Traffic
  { id: 'akan', name: 'The Akan of the Gold Coast', polities: ['eguafo'], ticks: true, inside: true, intent: 'Sell gold at the best price, and buy the labour the mines need from whoever brings it.', means: { coin: 0.5, arms: 0.5, ships: 0.1 } },
  { id: 'benin', name: 'The Kingdom of Benin', polities: ['benin'], ticks: true, inside: true, intent: 'Set the terms of what Benin sells, and to whom.', means: { coin: 0.5, arms: 0.6, ships: 0.1 } },
  { id: 'sahel', name: 'The Sahel: Azenegue, Wolof and Mandinka', polities: ['azenegue', 'jolof', 'kaabu'], ticks: true, inside: true, intent: 'Sell to whoever pays most, in horses, wheat or cloth.', means: { coin: 0.4, arms: 0.6, ships: 0.05 } },
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
    id: 'colombo-west', history: 'colombo-returns', front: 'claim', delta: 3.0, place: 'lisboa',
    text: 'The Genoese is back from the west, and Castile has a claim to answer.',
    source: 'Date from chronicle HISTORY (Columbus returns, 1493).', grade: 'documented',
  },
  {
    id: 'sao-tome-caminha', year: 1493, month: 1, front: 'traffic', delta: 0.25, place: 'sao-tome-porto',
    text: 'The King has given São Tomé to Álvaro de Caminha, with settlers, convicts, and orders to plant. Cane will follow.',
    source: 'Donation of São Tomé to Álvaro de Caminha, 1493 (Hair; Seibert on São Tomé).', grade: 'documented',
  },
  {
    id: 'tordesillas-line', history: 'tordesillas', front: 'claim', delta: 3.9, place: 'lisboa',
    text: 'At Tordesillas the line is drawn.',
    source: 'Date from chronicle HISTORY (Tordesillas, June 1494).', grade: 'documented',
  },
  {
    id: 'joao-dies', history: 'manuel', front: 'court', delta: 4.2, place: 'lisboa',
    text: 'The King is dead, and the court is new.',
    source: 'Date from chronicle HISTORY (João II dies, October 1495).', grade: 'documented',
  },
  {
    id: 'edict', year: 1496, month: 12, front: 'court', delta: 0.6, place: 'lisboa',
    text: 'The King has ordered the Jews out of Portugal or into the font. The Rua Nova is not calm.',
    source: 'Edict of expulsion, December 1496; forced conversions in 1497 (Tavares; Soyer).', grade: 'documented',
  },
  {
    id: 'sao-tome-sugar', year: 1500, month: 6, front: 'traffic', delta: 0.25, place: 'sao-tome-porto',
    text: 'The first mills are grinding on São Tomé, and the planters are asking for more hands than the island has.',
    source: 'São Tomé’s first sugar exports fall in the first years of the 1500s; the date is approximate and the game does not claim the year.', grade: 'approximate',
  },
  // --- The Indian Ocean (D4). Dates are the usual ones; scenes state none. ---
  {
    id: 'gama-melinde', year: 1498, month: 4, power: 'melinde', attitude: 0.15, place: 'melinde',
    text: 'Melinde has taken the Portuguese in, given them a house and a pilot, and made a friend of them against Mombaça.',
    source: 'Da Gama at Melinde, April 1498: received by the sultan, who gave a pilot for the crossing and was Mombaça\u2019s rival (Subrahmanyam, The Career and Legend of Vasco da Gama; Portuguese and Arabic accounts). The pilot\u2019s name and origin are disputed and not used.', grade: 'documented',
  },
  {
    id: 'gama-calicut', year: 1498, month: 5, front: 'crescent', delta: 1.0, power: 'calicut', attitude: -0.05, place: 'calecute',
    text: 'Ships from the far west have anchored off Calecute, and the Zamorin has seen their captain. The Moorish houses have not liked what they saw.',
    source: 'Da Gama reached Calicut 20 May 1498, was received by the Zamorin, and the Muslim merchants opposed him (Subrahmanyam; Malekandathil, Maritime India).', grade: 'documented',
  },
  {
    id: 'gama-rule', year: 1498, month: 9, front: 'rule', delta: 0.5, place: 'melinde',
    text: 'The Portuguese took a boat on the way out, and kept her pilots. Nobody on the coast has forgotten that.',
    source: 'Da Gama\u2019s outward voyage took vessels and pilots by force at points on the East African coast (Subrahmanyam). Which vessel and when is not stated.', grade: 'approximate',
  },
  {
    id: 'cabral-calicut', year: 1500, month: 9, front: 'rule', delta: 1.0, place: 'calecute',
    text: 'A second Portuguese fleet is at Calecute, thirteen ships, and it has come to trade on terms and not to ask.',
    source: 'Cabral reached Calicut in September 1500 (usual date); the fleet\u2019s size is given as thirteen ships in the sources and the game uses no figure.', grade: 'documented',
  },
  {
    id: 'calicut-factory', year: 1500, month: 12, front: 'crescent', delta: 1.5, power: 'calicut', attitude: -0.25, place: 'calecute',
    text: 'The Portuguese factory at Calecute has been attacked, and its people killed. The fleet answered with its guns.',
    source: 'The attack on the Portuguese factory at Calicut and Cabral\u2019s bombardment, December 1500 (Subrahmanyam; Pearson, The Portuguese in India). Numbers killed vary by source and are not given.', grade: 'documented',
  },
  {
    id: 'cochin-friend', year: 1501, month: 1, front: 'rule', delta: 0.5, power: 'cochin', attitude: 0.2, place: 'cochim',
    text: 'Cochim has given the Portuguese a house, and a warehouse for pepper, and has made a friend against the Zamorin.',
    source: 'Cabral at Cochin and Cannanore, December 1500 to January 1501: factories agreed with the Raja of Cochin and the ruler of Cannanore (Pearson; Subrahmanyam).', grade: 'documented',
  },
  {
    id: 'venice-alarm', year: 1501, month: 7, front: 'crescent', delta: 1.0, power: 'mamluk', attitude: -0.05, place: 'adem',
    text: 'Venice has seen the first Portuguese pepper arrive in Lisbon, and Cairo is asked what it means for the spice road.',
    source: 'Venetian alarm at the Portuguese spice route recorded by Girolamo Priuli in his diaries (1501-02); the Venetian embassy to Cairo followed in 1504. The game dates the alarm only to the year.', grade: 'documented',
  },
  {
    id: 'gama-1502', year: 1502, month: 2, front: 'rule', delta: 2.5, place: 'quiloa',
    text: 'The Admiral is back with a larger fleet. Kilwa has been made to pay tribute, and ships of the coast are now asked for a Portuguese letter.',
    source: 'Da Gama\u2019s second voyage left in February 1502 and forced tribute from Kilwa that summer; cartaz passes became regular practice in the following years (Subrahmanyam; Pearson). The exact first use of a pass is not fixed here.', grade: 'approximate',
  },
  {
    id: 'gama-1502-c', year: 1502, month: 2, front: 'crescent', delta: 0.8, power: 'kilwa', attitude: -0.15, place: 'quiloa',
    text: 'Kilwa has been made to pay tribute to the Portuguese, and the coast is counting what it cost.',
    source: 'Da Gama\u2019s second voyage forced tribute from Kilwa in the summer of 1502 (Subrahmanyam); the sum is not given here.', grade: 'approximate',
  },
  {
    id: 'almeida-1505', year: 1505, month: 7, front: 'rule', delta: 1.5, power: 'kilwa', attitude: -0.25, place: 'quiloa',
    text: 'The Viceroy\u2019s fleet has taken Kilwa and Mombaça, and built a fort at Kilwa.',
    source: 'Almeida\u2019s fleet took Kilwa and Mombasa in July 1505; a fort was built at Kilwa (Pearson; Subrahmanyam).', grade: 'documented',
  },
  {
    id: 'almeida-1505-m', year: 1505, month: 8, front: 'crescent', delta: 0.7, power: 'mombasa', attitude: -0.3, place: 'mombaca',
    text: 'Mombaça has been sacked. The sultans along the coast have each begun to think about whom to write to.',
    source: 'Almeida\u2019s fleet sacked Mombasa in August 1505, after Kilwa in July (Pearson; Subrahmanyam).', grade: 'documented',
  },
  {
    id: 'mamluk-fleet', year: 1507, month: 1, front: 'crescent', delta: 3.0, power: 'mamluk', attitude: -0.1, place: 'adem',
    text: 'A fleet is fitting out at Suez under the Sultan\u2019s order, to go against the Portuguese in India with Gujarat\u2019s help.',
    source: 'The Mamluk fleet under Amir Husayn al-Kurdi reached Gujarat in 1507-08; Chaul 1508; defeat at Diu 1509 (Pearson; Subrahmanyam). The game gives the year only.', grade: 'documented',
  },
  {
    id: 'diu-1509', year: 1509, month: 2, front: 'crescent', delta: -1.0, power: 'gujarat', attitude: -0.1, place: 'cambaia',
    text: 'The Egyptian fleet has been beaten off Diu, and Gujarat has to think again about its friends.',
    source: 'Battle of Diu, February 1509 (usual date).', grade: 'documented',
  },
  {
    id: 'albuquerque-1513', year: 1513, month: 3, front: 'rule', delta: 2.0, place: 'adem',
    text: 'The Governor has taken a fleet up to Adem, and means to shut the Red Sea to ships without the letter.',
    source: 'Albuquerque\u2019s attack on Aden, 1513 (failed), and the plan to blockade the Red Sea; Hormuz taken 1515. The Rule\u2019s \u201cblockade\u201d stage follows this policy; the game does not claim a particular year for it in any scene.', grade: 'approximate',
  },
  // --- E3: the Court, the Gold and the Claim, staged. The stage a shock lifts a Front to is the game's own reading of the date. ---
  {
    id: 'mina-fever-years', year: 1494, month: 3, front: 'gold', delta: 0.5, power: 'akan', attitude: 0, place: 'mina',
    text: 'The Castle at Mina is being relieved with whatever men can be spared, and the ones who come out say the fever takes a third of a garrison in a bad year.',
    source: 'Mortality at São Jorge da Mina was notorious in the Portuguese sources (Vogt, The Portuguese in West Africa; Hair on Guinea). The 1494 date and “a third” are INVENTED: the sources give the fact of high mortality, not a figure for a year.', grade: 'invented',
  },
  {
    id: 'mina-interlopers', year: 1503, month: 5, front: 'gold', delta: 0.8, power: 'akan', attitude: -0.04, place: 'mina',
    text: 'Foreign ships are working the Mina coast for gold, and the Akan are listening to what they offer.',
    source: 'Castilian, and later French and English, interlopers on the Guinea coast contested the Portuguese monopoly from the 1470s; the Treaty of Alcáçovas (1479) was the settlement. The game dates the shock to 1503 as its own choice; no year is claimed in a scene.', grade: 'approximate',
  },
  {
    id: 'brazil-sighted', year: 1500, month: 5, front: 'claim', delta: 1.2, power: 'castile', attitude: -0.05, place: 'lisboa',
    text: 'Land has been found in the south-west, across the ocean, on the Portuguese side of the line. Castile says that a Spanish pilot saw the same coast months before.',
    source: 'Pedro Álvares Cabral reached the coast of Brazil in April 1500; the Spanish captains Vicente Yáñez Pinzón (Jan 1500) and Diego de Lepe had sighted the same coast earlier that year (Disney; Hemming on Brazil). The line at Tordesillas put the coast on the Portuguese side.', grade: 'documented',
  },
  {
    id: 'cantino-chart', year: 1502, month: 11, front: 'claim', delta: 0.6, power: 'castile', attitude: 0.05, place: 'lisboa',
    text: 'A Portuguese chart of the new coasts has been bought out of the Casa for a duke in Italy, and Castile has seen a copy.',
    source: 'The Cantino planisphere, smuggled out of Lisbon for Ercole d’Este of Ferrara and dated 1502 (documented); that Castile saw a copy is the game’s own gloss.', grade: 'approximate',
  },
  {
    id: 'rua-nova-money', year: 1503, month: 3, front: 'court', delta: 2.4, place: 'lisboa',
    text: 'The German and Italian houses have put their money into the pepper fleets, and the Rua Nova is the loudest voice at court.',
    source: 'Italian and German capital (Marchioni, Affaitati, Welser, Fugger) took part in the Portuguese spice fleets from about 1503-05 (Subrahmanyam; Hümmerich). The month is approximate.', grade: 'approximate',
  },
  {
    id: 'lisbon-massacre', year: 1506, month: 4, front: 'court', delta: 3.5, place: 'lisboa',
    text: 'The New Christians of Lisbon have been killed in the streets for three days, and the King has hanged some of those who did it.',
    source: 'The Lisbon massacre of New Christians, Easter 1506 (Tavares; Soyer). Counts differ by source and are not given.', grade: 'documented',
  },
  {
    id: 'chaul-1508', year: 1508, month: 3, front: 'crescent', delta: 1.5, power: 'gujarat', attitude: -0.05, place: 'cambaia',
    text: 'The Egyptian and Gujarati ships have caught the Viceroy’s son off Chaul, and he is dead.',
    source: 'Battle of Chaul, 1508: Lourenço de Almeida killed by the Mamluk-Gujarati fleet (Pearson; Subrahmanyam). Avenged at Diu the following year.', grade: 'documented',
  },
  {
    id: 'magellan-1519', year: 1519, month: 9, front: 'claim', delta: 2.0, power: 'castile', attitude: 0, place: 'lisboa',
    text: 'Castile has sent a fleet west under a Portuguese captain, to reach the Spice Islands on the Spanish side of the line.',
    source: 'Magellan sailed from Sanlúcar on 20 September 1519 (documented).', grade: 'documented',
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
