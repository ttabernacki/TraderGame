import { NM, haversine, type LatLon } from '../core/math';
import { Rng } from '../core/rng';
import { GOOD_BY_ID } from '../economy/goods';
import { TAGS, type Tag } from '../ledger/tags';
import type { Entry } from '../ledger/ledger';
import { PORT_BY_ID, anchorageOf } from '../world/ports';
import { powerOfName } from '../world/powers/core';
import { hasClause } from '../identity/clauses';
import { wordDays } from '../identity/titles';
import { polityOfPort, POLITY_BY_ID } from '../diplomacy/polities';
import type { Nation } from './encounter';
import type { Game } from './state';

/**
 * Strangers as people (BUILD_PLAN D7).
 *
 * A sail on the horizon is a master with a name, a house behind him, a temper, and very often somebody aboard
 * who is going somewhere for a reason of his own. This file is the people layer and nothing else: who they are,
 * how they are drawn, and what they think of the captain. What can be done about them is `game/terms.ts`.
 *
 * MASTERS RECUR. Nothing is stored. The roster is a pure function of the game's seed (`roster`), each master
 * has a circuit of ports he works, and a master is "the same man" because the Ledger says so: every entry done
 * to him (or to his passenger or cargo) carries `data.master`, his id, and his attitude is read back out of
 * those entries, plus word of what was done to his polity's ships, plus the Power's regard and the clauses
 * (`regardOf`). A master spoken at Kilwa is therefore met again at Melinde or Calecute, and he is not the
 * same man to the captain on the second day as on the first.
 *
 * NO REAL PERSONS. Every name here is built from the given names and patronymics of the culture and is
 * INVENTED (docs/SOURCES.md, "Strangers as people (D7)"); `DENY` keeps the generator from drawing the name of
 * anybody the game or the history books already has.
 */

export type Temper = 'open' | 'proud' | 'wary' | 'sly' | 'hard';
export const TEMPERS: Temper[] = ['open', 'proud', 'wary', 'sly', 'hard'];

/** One line on each temper, for the hail card. */
export const TEMPER_LINE: Record<Temper, string> = {
  open: 'Open-handed, and likes to talk.',
  proud: 'Proud. Takes a search as an insult, and a gift as his due.',
  wary: 'Wary. Watches your guns, not your face.',
  sly: 'Sly. Tells you what it pays him to.',
  hard: 'Hard. Respects a gun, and little else.',
};

export type ErrandKind = 'envoy' | 'pilgrim' | 'wife' | 'pilot' | 'gift';

export interface Passenger {
  kind: ErrandKind;
  name: string;
  /** What he is doing aboard, in a sentence. */
  errand: string;
  /** The port he is going to. */
  to: string;
  /** How much the errand matters to whoever sent it, 0..1. */
  weight: number;
}

export interface Owner { name: string; house: string; home: string }
export interface CargoLot { goodId: string; units: number }

/** What a master is, apart from this meeting. */
export interface MasterRec {
  /** Roster id, `culture:n`. The Ledger knows him by this. */
  id: string;
  name: string;
  nation: Nation;
  people: string;
  /** Home port id ('' for a place off the map) and its name for display. */
  home: string;
  homeName: string;
  /** The Ledger target of his flag: a polity id where there is one. */
  polity: string;
  circuit: string[];
  temper: Temper;
  owner: Owner;
  boat: string;
  invented: true;
}

/** What the hail card needs of a master, copied onto the Stranger so a save carries it. */
export interface MasterInfo {
  id: string;
  name: string;
  home: string;
  homeName: string;
  polity: string;
  temper: Temper;
  /** -1..1 at the moment of the meeting, read from the Ledger. */
  regard: number;
  /** How many times he has been spoken before this. */
  metBefore: number;
  /** Whether he holds the captain's pass or his polity honours the cartaz. */
  pass: boolean;
}

// -----------------------------------------------------------------------------
// Cultures

interface CultureDef {
  people: string;
  given: string[];
  family: string[];
  style: (g: string, f: string, rng: Rng) => string;
  women: string[];
  boats: string[];
  houses: string[];
  /** Goods she carries, with units (low, high). */
  cargo: [string, number, number][];
  hulls: string[];
}

const bin = (g: string, f: string): string => `${g} bin ${f}`;

export const CULTURES: Record<Nation, CultureDef> = {
  swahili: {
    people: 'swahili',
    given: ['Bakari', 'Chande', 'Faraji', 'Khamis', 'Mussa', 'Rajab', 'Sefu', 'Shaaban', 'Tumbo', 'Yahya', 'Zubeir', 'Mkame'],
    family: ['Abdalla', 'Ali', 'Hassan', 'Mkubwa', 'Nasoro', 'Rashidi', 'Said', 'Shee', 'Waziri', 'Pandu', 'Mwenye'],
    style: (g, f, r) => (r.chance(0.35) ? `Nahodha ${bin(g, f)}` : bin(g, f)),
    women: ['Mwanaisha', 'Halima', 'Zawadi', 'Mwanahawa'],
    boats: ['Kheri', 'Baraka', 'Safina', 'Nuru', 'Mfalme wa Bahari', 'Mwangaza'],
    houses: ['a house of the stone town', 'a Shirazi family of the coast', 'a broker of the ivory trade', 'the sultan’s own account'],
    cargo: [['marfim', 4, 12], ['panos', 20, 60], ['arroz', 10, 30], ['cera', 4, 12], ['couros', 15, 40]],
    hulls: ['caravela-latina', 'barcha'],
  },
  arab: {
    people: 'arab',
    given: ['Mahfuz', 'Sulayman', 'Hilal', 'Nasir', 'Mubarak', 'Jabir', 'Salih', 'Khalfan', 'Zayid', 'Hamdan', 'Rashid'],
    family: ['Hamad', 'Jumah', 'Saif', 'Said', 'Khalid', 'Majid al-Sur', 'Naji', 'Ghanim', 'Mansur'],
    style: (g, f) => `Nakhoda ${bin(g, f)}`,
    women: ['Maryam', 'Salma', 'Aisha', 'Shamsa'],
    boats: ['Al-Najah', 'Al-Salamah', 'Fath al-Khayr', 'Bahr al-Amal', 'Al-Sa’d', 'Jawhar'],
    houses: ['a Hadrami house at Adem', 'a pearl-and-horse merchant of the Gulf', 'a house of Dofar frankincense', 'the Tahirid customs-farm'],
    cargo: [['tamaras', 20, 60], ['incenso', 4, 14], ['cavalos', 6, 16], ['perolas', 1, 3], ['goma', 6, 20]],
    hulls: ['caravela-latina', 'nau-pequena'],
  },
  gujarati: {
    people: 'gujarati',
    given: ['Bhimji', 'Devji', 'Hirji', 'Kanji', 'Lalji', 'Mulji', 'Nathu', 'Pranji', 'Ratanji', 'Vaghji', 'Valji', 'Ismail', 'Yaqub', 'Jamal'],
    family: ['Kapadia', 'Mehta', 'Parekh', 'Sheth', 'Shah', 'Desai', 'Lodhia', 'Vohra', 'Memon', 'Malik', 'Khoja'],
    style: (g, f) => (['Ismail', 'Yaqub', 'Jamal'].includes(g) ? `Nakhoda ${g} ${f}` : `${g} ${f}`),
    women: ['Jamnabai', 'Lilavati', 'Ratanbai', 'Gangabai'],
    boats: ['Ganga', 'Lakshmi', 'Fateh Salamat', 'Sundari', 'Mubarak', 'Dwarkesh'],
    houses: ['a Vania counting-house at Cambaia', 'a Bohra house of Diu', 'a Khoja family of the cloth trade', 'a shipowning widow of Cambaia'],
    cargo: [['calico', 40, 120], ['anil', 6, 18], ['seda', 3, 9], ['acucar', 8, 24], ['cobre', 4, 12]],
    hulls: ['nau-pequena', 'caravela-latina'],
  },
  malabari: {
    people: 'malabar',
    given: ['Moidu', 'Pokker', 'Kunhi', 'Hamsa', 'Bava', 'Ayyoob', 'Mayin', 'Kutti', 'Ussan', 'Seethi'],
    family: ['Haji', 'Mooppan', 'Thangal', 'Musliyar', 'Koya', 'Maraikkayar', 'Rawther'],
    style: (g, f) => `${g} ${f}`,
    women: ['Aysha', 'Kunhimma', 'Beevi', 'Fathima'],
    boats: ['Barakath', 'Nusrath', 'Kerala Mutu', 'Sulaiman', 'Mappila Kutty', 'Salamath'],
    houses: ['a Mappila house of Calecute', 'a pepper-broker of the Zamorin’s port', 'a Chettiar and Mappila partnership', 'a house of Cochim rice'],
    cargo: [['pimenta', 10, 40], ['gengibre', 6, 24], ['canela', 3, 12], ['cardamomo', 3, 10], ['arroz', 20, 60]],
    hulls: ['caravela-latina', 'barcha'],
  },
  portuguese: {
    people: 'portuguese',
    given: ['Afonso', 'Brás', 'Estevão', 'Gil', 'Lopo', 'Martim', 'Nuno', 'Rodrigo', 'Tomé', 'Garcia', 'Antão'],
    family: ['Alvim', 'Barreto', 'Cardoso', 'Fagundes', 'Lobato', 'Meireles', 'Pimentel', 'Quaresma', 'Teixeira', 'Vilar', 'Zagalo'],
    style: (g, f) => `${g} ${f}`,
    women: ['Brites', 'Leonor', 'Violante', 'Catarina'],
    boats: ['São Tomé', 'Santa Luzia', 'Nossa Senhora da Luz', 'São Lourenço', 'Esperança', 'Santa Marta'],
    houses: ['a Lagos shipowner', 'a Lisbon house of the Rua Nova', 'a Madeira sugar planter', 'the Casa da Mina’s own freight'],
    cargo: [['vinho', 6, 16], ['trigo', 8, 24], ['acucar', 8, 24], ['la', 20, 60]],
    hulls: ['caravela-latina', 'caravela-redonda', 'nau-pequena'],
  },
  castilian: {
    people: 'castilian',
    given: ['Benito', 'Diego', 'Fernán', 'Gómez', 'Íñigo', 'Lope', 'Sancho', 'Martín', 'Hernando'],
    family: ['Quintero', 'de Triana', 'Garrido', 'Peralta', 'de Jerez', 'Bermúdez', 'de Moguer', 'de Huelva', 'Valdivia'],
    style: (g, f) => `${g} ${f}`,
    women: ['Mencía', 'Inés', 'Elvira', 'Constanza'],
    boats: ['La Gallega', 'San Antón', 'Santa Cruz', 'La Trinidad', 'San Sebastián', 'La Rosa'],
    houses: ['a Seville house with a Genoese partner', 'a Palos shipowner', 'a Canary sugar factor', 'an unlicensed voyage out of Andalusia'],
    cargo: [['vinho', 6, 16], ['la', 20, 60], ['ferramenta', 6, 18], ['contas', 8, 24]],
    hulls: ['caravela-latina', 'caravela-redonda'],
  },
  genoese: {
    people: 'castilian',
    given: ['Ambrogio', 'Battista', 'Domenico', 'Gaspare', 'Lazzaro', 'Niccolò', 'Paolo', 'Tomaso'],
    family: ['Lercari', 'Negrone', 'Sauli', 'Imperiale', 'Gentile', 'Marini', 'Rapallo', 'Cebà'],
    style: (g, f) => `${g} ${f}`,
    women: ['Bianca', 'Violante', 'Argenta', 'Ginevra'],
    boats: ['Santa Caterina', 'San Giorgio', 'La Fortuna', 'La Superba', 'San Lorenzo', 'La Buona Ventura'],
    houses: ['a Genoese house with a seat at Lisbon', 'a Genoese factor of the Funchal sugar', 'a Genoese bank’s own bottom'],
    cargo: [['seda', 2, 6], ['la', 20, 60], ['coral', 4, 12], ['acucar', 8, 24]],
    hulls: ['nau-pequena', 'caravela-redonda'],
  },
  moorish: {
    people: 'moor',
    given: ['Yahya', 'Idriss', 'Abdelaziz', 'Hamed', 'Mussa', 'Omar', 'Bou Bekr', 'Mimoun'],
    family: ['al-Rifi', 'al-Sabti', 'al-Tilimsani', 'al-Anjari', 'ben Aissa', 'al-Wazzani', 'al-Qasri'],
    style: (g, f) => `${g} ${f}`,
    women: ['Zohra', 'Khadija', 'Tamou', 'Aicha'],
    boats: ['Rih al-Bahr', 'Bab al-Nasr', 'Al-Ghazi', 'Al-Fath', 'Tarik', 'Nasr Allah'],
    houses: ['a Salé shipowner', 'a Tetuán corsair’s partnership', 'a Fez merchant’s coastal agent'],
    cargo: [['couros', 15, 40], ['panos', 20, 60], ['acucar', 8, 24], ['cera', 4, 12]],
    hulls: ['barcha', 'caravela-latina'],
  },
  french: {
    people: 'castilian',
    given: ['Colin', 'Guillemot', 'Jehan', 'Pierre', 'Raoulet', 'Thomas'],
    family: ['Le Gall', 'de Honfleur', 'Lecomte', 'du Pont', 'Pavie', 'de Rouen'],
    style: (g, f) => `${g} ${f}`,
    women: ['Jehanne', 'Perrette', 'Guillemette'],
    boats: ['La Pensée', 'Le Sacre', 'La Bonne Aventure', 'Marie de Dieppe', 'Saint-Nicolas'],
    houses: ['a Dieppe shipowner', 'a Rouen merchant’s venture'],
    cargo: [['la', 20, 60], ['linho', 10, 30], ['ferramenta', 6, 18]],
    hulls: ['caravela-redonda', 'nau-pequena'],
  },
};

/** Names the generator must never draw: the game's own D4 cast and real persons of the period. */
const DENY = new Set([
  'Hamad bin Faraji', 'Juma bin Salim', 'Rashid bin Sultani', 'Juma bin Omari', 'Chande bin Abdallah', 'Hamisi',
  'Jivan Kanji', 'Kunhi Raman', 'Ibrahim Koya', 'Ali Kutty', 'Mammali', 'Ahmad ibn Majid', 'Malemo Cana', 'Nahodha Ahmad ibn Majid',
  'Pero Escobar', 'Fernão Gomes', 'Gonçalo Coelho', 'Rui de Sequeira', 'Pedro de Covides',
  'Diego Cão', 'Bartolomeu Dias', 'Vasco da Gama', 'Cristóvão Colombo', 'Antoniotto Usodimare',
]);

// -----------------------------------------------------------------------------
// The roster

interface Slot { culture: Nation; home: string; homeName?: string; circuit: string[]; polity?: string }

/**
 * The houses that work the water, each with the ports he is likely to be found between. Written so that a
 * Kilwa man can be met again at Melinde or Calecute (s2 and m4), an Adem man on the whole crossing, and so on.
 */
export const SLOTS: Slot[] = [
  { culture: 'swahili', home: 'quiloa', circuit: ['quiloa', 'mocambique', 'sofala'] },
  { culture: 'swahili', home: 'quiloa', circuit: ['quiloa', 'mombaca', 'melinde', 'calecute'] },
  { culture: 'swahili', home: 'mombaca', circuit: ['mombaca', 'melinde', 'quiloa'] },
  { culture: 'swahili', home: 'melinde', circuit: ['melinde', 'mombaca', 'calecute'] },
  { culture: 'swahili', home: 'mocambique', circuit: ['mocambique', 'quiloa'] },
  { culture: 'swahili', home: 'melinde', circuit: ['melinde', 'magadoxo', 'adem'] },
  { culture: 'arab', home: 'adem', circuit: ['adem', 'melinde', 'calecute'] },
  { culture: 'arab', home: 'mascate', circuit: ['mascate', 'melinde', 'mombaca'] },
  { culture: 'arab', home: 'ormuz', circuit: ['ormuz', 'calecute', 'cochim'] },
  { culture: 'arab', home: 'dofar', circuit: ['dofar', 'socotora', 'adem', 'quiloa'] },
  { culture: 'arab', home: 'adem', circuit: ['adem', 'cambaia', 'calecute'] },
  { culture: 'gujarati', home: 'cambaia', circuit: ['cambaia', 'diu', 'calecute', 'melinde'] },
  { culture: 'gujarati', home: 'diu', circuit: ['diu', 'chaul', 'calecute'] },
  { culture: 'gujarati', home: 'cambaia', circuit: ['cambaia', 'adem', 'ormuz'] },
  { culture: 'gujarati', home: 'diu', circuit: ['diu', 'melinde', 'quiloa'] },
  { culture: 'gujarati', home: 'chaul', circuit: ['chaul', 'goa', 'calecute'] },
  { culture: 'malabari', home: 'calecute', circuit: ['calecute', 'cananor', 'cochim', 'adem'] },
  { culture: 'malabari', home: 'cochim', circuit: ['cochim', 'calecute', 'columbo'] },
  { culture: 'malabari', home: 'cananor', circuit: ['cananor', 'calecute', 'goa'] },
  { culture: 'malabari', home: 'calecute', circuit: ['calecute', 'melinde', 'quiloa'] },
  { culture: 'malabari', home: 'coulao', circuit: ['coulao', 'cochim', 'columbo'] },
  { culture: 'malabari', home: 'calecute', circuit: ['calecute', 'adem', 'ormuz'] },
  { culture: 'portuguese', home: 'lagos', circuit: ['lagos', 'funchal', 'lisboa'] },
  { culture: 'portuguese', home: 'funchal', circuit: ['funchal', 'lagos', 'las-palmas', 'arguim'] },
  { culture: 'portuguese', home: 'lagos', circuit: ['lagos', 'arguim', 'mina'] },
  { culture: 'portuguese', home: 'lisboa', circuit: ['lisboa', 'lagos', 'funchal'] },
  { culture: 'castilian', home: '', homeName: 'Palos', circuit: ['las-palmas', 'mina', 'axim'], polity: 'castile' },
  { culture: 'castilian', home: 'las-palmas', circuit: ['las-palmas', 'funchal', 'lagos'], polity: 'castile' },
  { culture: 'castilian', home: '', homeName: 'Huelva', circuit: ['las-palmas', 'arguim', 'mina'], polity: 'castile' },
  { culture: 'genoese', home: '', homeName: 'Genoa', circuit: ['lagos', 'funchal', 'las-palmas'], polity: 'nation:genoese' },
  { culture: 'genoese', home: '', homeName: 'Genoa', circuit: ['funchal', 'lagos', 'mina'], polity: 'nation:genoese' },
  { culture: 'moorish', home: 'arzila', circuit: ['arzila', 'ceuta', 'lagos'], polity: 'fez' },
  { culture: 'moorish', home: 'safim', circuit: ['safim', 'arguim', 'funchal'], polity: 'fez' },
  { culture: 'moorish', home: 'arzila', circuit: ['arzila', 'lagos', 'ceuta'], polity: 'fez' },
  { culture: 'french', home: '', homeName: 'Dieppe', circuit: ['funchal', 'mina', 'axim'], polity: 'nation:french' },
];

const portName = (id: string): string => PORT_BY_ID.get(id)?.name ?? id;

const rosterCache = new Map<number, MasterRec[]>();

/** The masters of this game: a pure function of the seed. */
export function roster(seed: number): MasterRec[] {
  const hit = rosterCache.get(seed);
  if (hit) return hit;
  const used = new Set<string>(DENY);
  const counts: Partial<Record<Nation, number>> = {};
  const out: MasterRec[] = SLOTS.map((slot) => {
    const c = CULTURES[slot.culture];
    const n = (counts[slot.culture] = (counts[slot.culture] ?? 0) + 1);
    const id = `${slot.culture}:${n}`;
    const rng = Rng.fromString(`master:${seed}:${id}`);
    let name = '';
    for (let tries = 0; tries < 40 && (!name || used.has(name)); tries++) {
      name = c.style(rng.pick(c.given), rng.pick(c.family), rng);
    }
    used.add(name);
    let ownerName = '';
    for (let tries = 0; tries < 40 && (!ownerName || used.has(ownerName)); tries++) {
      ownerName = c.style(rng.pick(c.given), rng.pick(c.family), rng).replace(/^(Nahodha|Nakhoda) /, '');
    }
    used.add(ownerName);
    const homeName = slot.homeName ?? portName(slot.home);
    const pol = slot.polity ?? (slot.home ? polityOfPort(slot.home)?.id ?? 'portugal' : 'portugal');
    // A Lisbon or Lagos man is a subject of the Crown, whatever his temper: `portugal` is the Ledger target.
    return {
      id, name, nation: slot.culture, people: c.people, home: slot.home, homeName, polity: pol,
      circuit: slot.circuit, temper: rng.pick(TEMPERS),
      owner: { name: ownerName, house: rng.pick(c.houses), home: homeName },
      boat: rng.pick(c.boats), invented: true,
    };
  });
  rosterCache.set(seed, out);
  return out;
}

export function masterById(seed: number, id: string): MasterRec | undefined {
  return roster(seed).find((m) => m.id === id);
}

/** Distance in miles from a position to the nearest port on a master's circuit. */
export function circuitDistanceNm(m: MasterRec, at: LatLon): number {
  let best = Infinity;
  for (const id of m.circuit) {
    const p = PORT_BY_ID.get(id);
    if (!p) continue;
    best = Math.min(best, haversine(at, anchorageOf(p)) / NM);
  }
  return best;
}

// -----------------------------------------------------------------------------
// What the Ledger remembers of him

/** Entries done to a master, his passenger or his cargo. */
export const memoryOf = (ledger: Entry[], id: string): Entry[] => ledger.filter((e) => e.data?.master === id);

/** How many times he has been spoken. */
export const metCount = (ledger: Entry[], id: string): number =>
  ledger.reduce((n, e) => (e.tag === 'master.met' && e.data?.master === id ? n + 1 : n), 0);

/** The deeds whose word runs the road between courts. */
const WORD_TAGS = new Set<Tag>([
  'ship.stopped', 'ship.spared', 'ship.succoured', 'ship.repulsed', 'ship.abandoned', 'pass.granted', 'pass.refused',
  'toll.taken', 'passenger.delayed', 'passenger.aided',
]);

const TEMPER_SENSE: Record<Temper, { neg: number; pos: number }> = {
  open: { neg: 0.9, pos: 1.4 },
  proud: { neg: 1.4, pos: 1 },
  wary: { neg: 1.2, pos: 0.8 },
  sly: { neg: 0.8, pos: 0.8 },
  hard: { neg: 0.8, pos: 0.7 },
};

export interface RegardParts { personal: number; word: number; court: number; clause: number; total: number }

/**
 * What a master thinks of the captain, -1..1, read out of the Ledger.
 *
 *  personal  what was done to him: each entry stamped with his id, by the tag's tone and the deed's weight
 *  word      what was done to other ships of his polity, once the word could have reached him
 *  court     the Power's own regard for the captain, a little
 *  clause    a cartaz that his court honours, a little
 *
 * Pure: the same Ledger gives the same man, which is how the falsifier can check it.
 */
export function regardParts(g: Pick<Game, 'ledger' | 'clock' | 'powers'>, m: Pick<MasterRec, 'id' | 'polity' | 'home' | 'temper'>): RegardParts {
  const sense = TEMPER_SENSE[m.temper];
  let personal = 0;
  let word = 0;
  const pol = POLITY_BY_ID.get(m.polity);
  for (const e of g.ledger) {
    if (e.tag === 'master.met') continue;
    if (e.data?.master === m.id) {
      const tone = TAGS[e.tag]?.tone ?? 0;
      personal += tone * Math.max(0.2, Math.min(1, e.magnitude)) * (tone < 0 ? sense.neg : sense.pos) * 0.6;
    } else if (WORD_TAGS.has(e.tag) && e.target === m.polity && e.data?.master !== undefined) {
      // Done to somebody else of his flag, and the word has had time to run.
      const near = typeof e.data.near === 'string' ? e.data.near : e.place;
      const days = pol ? wordDays(near || m.home, pol) : 30;
      if (g.clock.t - e.t < days * 86400) continue;
      const tone = TAGS[e.tag]?.tone ?? 0;
      word += tone * Math.max(0.2, Math.min(1, e.magnitude)) * (tone < 0 ? sense.neg : sense.pos) * 0.2;
    }
  }
  personal = Math.max(-1, Math.min(1, personal));
  word = Math.max(-0.4, Math.min(0.4, word));
  const power = powerOfName(m.polity);
  const court = power && g.powers ? Math.max(-0.2, Math.min(0.2, (g.powers.powers[power]?.attitude ?? 0) * 0.4)) : 0;
  const clause = hasClause(g, m.polity, 'cartaz') ? 0.12 : 0;
  const total = Math.max(-1, Math.min(1, personal + word + court + clause));
  return { personal, word, court, clause, total };
}

export const regardOf = (g: Pick<Game, 'ledger' | 'clock' | 'powers'>, m: Pick<MasterRec, 'id' | 'polity' | 'home' | 'temper'>): number => regardParts(g, m).total;

export function regardWord(r: number): string {
  if (r >= 0.45) return 'glad to see you';
  if (r >= 0.15) return 'civil';
  if (r > -0.15) return 'guarded';
  if (r > -0.45) return 'cold';
  return 'hostile';
}

/** Whether he holds the captain’s pass, or his court honours the cartaz. */
export function holdsPass(g: Pick<Game, 'ledger' | 'clock'>, m: Pick<MasterRec, 'id' | 'polity'>): boolean {
  if (hasClause(g, m.polity, 'cartaz')) return true;
  return g.ledger.some((e) => e.tag === 'pass.granted' && e.data?.master === m.id)
    && !g.ledger.some((e) => e.tag === 'pass.refused' && e.data?.master === m.id && e.t > lastPass(g.ledger, m.id));
}
const lastPass = (ledger: Entry[], id: string): number =>
  ledger.reduce((t, e) => (e.tag === 'pass.granted' && e.data?.master === id ? Math.max(t, e.t) : t), -Infinity);

export function infoOf(g: Pick<Game, 'ledger' | 'clock' | 'powers'>, m: MasterRec): MasterInfo {
  return {
    id: m.id, name: m.name, home: m.home, homeName: m.homeName, polity: m.polity, temper: m.temper,
    regard: regardOf(g, m), metBefore: metCount(g.ledger, m.id), pass: holdsPass(g, m),
  };
}

// -----------------------------------------------------------------------------
// Choosing him, and what he is carrying this time

/**
 * Which master this sail is. The nation is already chosen by the water; the slot is chosen by how near the
 * position is to his circuit, and a master already spoken is likelier to be the one met again.
 */
export function pickMaster(g: Pick<Game, 'seed' | 'ledger' | 'seaRecord'>, nation: Nation, at: LatLon): MasterRec {
  const all = roster(g.seed).filter((m) => m.nation === nation);
  const near = all.map((m) => ({ m, d: circuitDistanceNm(m, at) })).sort((a, b) => a.d - b.d);
  const best = near[0].d;
  const eligible = near.filter((x) => x.d <= Math.max(best + 250, 380)).map((x) => x.m);
  const rng = Rng.fromString(`sail:${g.seed}:${g.seaRecord.sighted}`);
  const met = eligible.filter((m) => metCount(g.ledger, m.id) > 0);
  if (met.length > 0 && rng.chance(0.5)) return rng.pick(met);
  return rng.pick(eligible);
}

const ERRANDS: Record<ErrandKind, number> = { envoy: 0.8, pilgrim: 0.6, wife: 0.5, pilot: 0.3, gift: 0.9 };

/** A few Indian-Ocean pilgrims go to Mecca; the Hindu houses of Gujarat do not, so they send wives and gifts. */
function kindsFor(nation: Nation): ErrandKind[] {
  switch (nation) {
    case 'gujarati': return ['envoy', 'wife', 'pilot', 'gift'];
    case 'portuguese': return ['wife', 'pilot'];
    case 'castilian': case 'genoese': case 'french': return ['wife', 'pilot', 'envoy'];
    case 'moorish': return ['pilgrim', 'envoy', 'wife', 'gift'];
    default: return ['envoy', 'pilgrim', 'wife', 'pilot', 'gift'];
  }
}

/** Where his passenger is going: another port on the circuit. */
function destination(m: MasterRec, rng: Rng): string {
  const others = m.circuit.filter((p) => p !== m.home);
  return others.length ? rng.pick(others) : m.circuit[0];
}

function passengerFor(m: MasterRec, rng: Rng): Passenger {
  const c = CULTURES[m.nation];
  const kind = rng.pick(kindsFor(m.nation));
  const to = destination(m, rng);
  const dest = portName(to);
  const person = c.style(rng.pick(c.given), rng.pick(c.family), rng).replace(/^(Nahodha|Nakhoda) /, '');
  switch (kind) {
    case 'envoy':
      return { kind, name: person, to, weight: ERRANDS.envoy, errand: `${person}, an envoy of ${m.homeName} to ${dest}, with a letter in an oilcloth under his shirt.` };
    case 'pilgrim':
      return { kind, name: person, to, weight: ERRANDS.pilgrim, errand: `${person}, a pilgrim, going to ${dest} to find a ship for the road to Mecca.` };
    case 'wife': {
      const w = rng.pick(c.women);
      return { kind, name: w, to, weight: ERRANDS.wife, errand: `${w}, a factor’s wife, going home to her father’s house at ${dest}.` };
    }
    case 'pilot':
      return { kind, name: person, to, weight: ERRANDS.pilot, errand: `${person}, a pilot out of work since his ship was lost, going to ${dest} to find another.` };
    default:
      return { kind, name: person, to, weight: ERRANDS.gift, errand: `${person}, with a prince’s gift for ${dest}: ${rng.pick(GIFTS[m.nation] ?? GIFTS.swahili ?? ['a sealed box'])}.` };
  }
}

const GIFTS: Partial<Record<Nation, string[]>> = {
  swahili: ['a tusk wrapped in red cloth', 'a gold-hilted knife in a leather case'],
  arab: ['six horses under striped cloths', 'a chest of frankincense and a sword'],
  gujarati: ['a bolt of figured silk and a silver betel-box', 'two war elephants’ worth of cloth, folded small'],
  malabari: ['a casket of cardamom and a lamp of bronze', 'a pair of ivory-handled fans'],
  moorish: ['two Barbary horses', 'a chest of embroidered leather'],
  portuguese: ['a cask of the best Madeira'],
  castilian: ['a bolt of good scarlet'],
  genoese: ['a bolt of Genoese velvet'],
  french: ['a cask of Norman cider'],
};

export interface Meeting { passengers: Passenger[]; cargo: CargoLot[]; errand: string }

/**
 * What is aboard this time. Seeded by the seed, the master and how many times he has been spoken, so that
 * raising the same sail twice gives the same ship and the next meeting gives a new errand.
 */
export function meetingFor(seed: number, ledger: Entry[], m: MasterRec): Meeting {
  const rng = Rng.fromString(`meet:${seed}:${m.id}:${metCount(ledger, m.id)}`);
  const c = CULTURES[m.nation];
  const lots: CargoLot[] = [];
  const picks = [...c.cargo].sort(() => rng.next() - 0.5).slice(0, rng.int(1, 3));
  for (const [goodId, lo, hi] of picks) if (GOOD_BY_ID.has(goodId)) lots.push({ goodId, units: rng.int(lo, hi) });
  const passengers: Passenger[] = [];
  if (rng.chance(0.85)) passengers.push(passengerFor(m, rng));
  if (passengers.length && rng.chance(0.12)) passengers.push(passengerFor(m, rng));
  const errand = passengers.length
    ? passengers[0].errand
    : `${m.owner.name}’s freight from ${m.homeName}, and nothing aboard that is not for sale.`;
  return { passengers, cargo: lots, errand };
}

export function cargoValue(lots: CargoLot[]): number {
  return lots.reduce((s, l) => s + (GOOD_BY_ID.get(l.goodId)?.lisbon ?? 0) * l.units, 0);
}

export function cargoLine(lots: CargoLot[]): string {
  return lots.map((l) => {
    const gd = GOOD_BY_ID.get(l.goodId);
    return gd ? `${l.units} ${gd.unit}${l.units === 1 ? '' : 's'} of ${gd.english.toLowerCase()}` : '';
  }).filter(Boolean).join(', ') || 'nothing worth a boat';
}
