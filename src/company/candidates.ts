import type { OfficerRole } from '../crew/crew';
import type { Game } from '../game/state';

/**
 * The men on the quay who can be courted.
 *
 * There used to be a dice roll behind every hired officer: a name off a list,
 * an ability off a bell curve, a trait or not. An unnamed man with a number is
 * the least interesting person in the game, so the roll is gone. What is left
 * is a short list of people the game has actually written, each with one line
 * of where he comes from, offered on the quay that would plausibly have him.
 *
 * Source note. Every man here is invented. What is not: the Crown's licensed
 * physicians of the 1480s-90s were largely Jewish and some served at sea; the
 * Kongo court did send young men to be schooled in Lisbon; men taken on the
 * Guinea coast as boys were baptised, given Portuguese names and used as
 * interpreters (the Casa's practice); a Saint Thomas Christian of Malabar and a
 * Cambay broker are the sort of people the Portuguese engaged in India. No
 * candidate stands for a real individual.
 */

export interface Candidate {
  id: string;
  name: string;
  role: OfficerRole;
  ability: number;
  trait?: string;
  languages: string[];
  wage: number;
  /** Signing money, cruzados. */
  cost: number;
  /** Crown standing before he will talk to you at all. */
  standing: number;
  /** Where he can be found. For línguas, `lisbon` means he is on the Lisbon waterfront too. */
  at: string[];
  lisbon?: boolean;
  /** One line: where he comes from. */
  backstory: string;
  /** Why he will not come, if he will not. */
  gate?: (g: Game) => string | null;
  /** Arc he carries, if any. */
  arc?: string;
}

export const CANDIDATES: Candidate[] = [
  {
    id: 'pero-anes', name: 'Pero Anes', role: 'piloto', ability: 0.55, trait: 'timid', languages: [],
    wage: 24, cost: 90, standing: 0, at: ['lisboa', 'lagos'],
    backstory: 'Of Lagos. Piloted a caravel back from the Rio de Ouro with eleven of her thirty and has distrusted every table the Casa prints since.',
  },
  {
    id: 'estevao-veiga', name: 'Estêvão da Veiga', role: 'mestre', ability: 0.6, trait: 'hardhorse', languages: [],
    wage: 26, cost: 70, standing: 0, at: ['lisboa'],
    backstory: 'A Setúbal shipwright’s son the yard would not keep. Has spent twenty years proving he can work a hull better than the men who built her.',
  },
  {
    id: 'isaac-tomar', name: 'Mestre Isaac of Tomar', role: 'cirurgiao', ability: 0.62, trait: 'healer', languages: [],
    wage: 26, cost: 80, standing: 5, at: ['lisboa'],
    backstory: 'A physician licensed under the King’s letter. Has read Galen and Avicenna and trusts neither, and keeps a book of what he has seen men die of.',
  },
  {
    id: 'frei-duarte', name: 'Frei Duarte', role: 'capelao', ability: 0.5, trait: 'pious', languages: [],
    wage: 16, cost: 40, standing: 0, at: ['lisboa', 'lagos'],
    backstory: 'A Franciscan of Alenquer who asked for the Guinea ships as other men ask for a benefice. Has never been south of Sintra and says so.',
  },
  {
    id: 'bras-gil', name: 'Brás Gil', role: 'contramestre', ability: 0.57, trait: 'hardhorse', languages: [],
    wage: 22, cost: 50, standing: 0, at: ['lisboa', 'lagos', 'funchal'],
    backstory: 'Of Aveiro. Eleven voyages and ten crews who would sign with him again, which is the only reference that counts on a quay.',
  },
  {
    id: 'afonso-mendes', name: 'Afonso Mendes', role: 'escrivao', ability: 0.55, trait: 'exact', languages: [],
    wage: 18, cost: 40, standing: 0, at: ['lisboa'],
    backstory: 'A notary’s clerk of Évora nobody would take on, because he once refused a rounded figure to an inspector. Adds every column twice.',
  },
  {
    id: 'martinho-dias', name: 'Martinho Dias', role: 'lingua', ability: 0.55, trait: 'curious',
    languages: ['Wolof', 'Mandinga', 'Temne'], wage: 18, cost: 0, standing: 0, at: ['portudal', 'arguim', 'funchal'], lisbon: true,
    backstory: 'Called Mamadu in the street he was born in. Taken at Arguim as a boy, baptised at Lagos, and has lived since by being the one man in the room who knows both sentences.',
  },
  {
    id: 'luis-mina', name: 'Luís of Mina', role: 'lingua', ability: 0.5, trait: 'haggler',
    languages: ['Akan', 'Edo'], wage: 18, cost: 0, standing: 0, at: ['mina', 'axim', 'acara'], lisbon: true,
    backstory: 'Given a Portuguese name at the font and a Portuguese master at Santiago, and has spent two years learning the first is a good deal more use than the second.',
  },
  {
    id: 'garcia-lopes', name: 'Garcia Lopes', role: 'lingua', ability: 0.6, trait: 'pious',
    languages: ['Kikongo', 'Kimbundu'], wage: 20, cost: 0, standing: 5, at: ['mpinda'], lisbon: true,
    backstory: 'A Kongo youth sent to Lisbon to be taught letters and the faith. Has learned both, and a third thing nobody taught him: how his king’s letters read aloud in Lisbon.',
  },
  {
    id: 'goncalo-mouro', name: 'Gonçalo Mouro', role: 'lingua', ability: 0.55, trait: 'steady',
    languages: ['Árabe', 'Castelhano'], wage: 18, cost: 0, standing: 0, at: ['lagos', 'funchal'], lisbon: true,
    backstory: 'Born Ibrahim at Tavira, baptised at nine, married into an Old Christian family, and still called "the Moor" by men who have never been further than Setúbal.',
  },
  {
    id: 'tome-cranganor', name: 'Tomé of Cranganor', role: 'lingua', ability: 0.55, trait: 'steady',
    languages: ['Malaialam', 'Tâmil', 'Cingalês'], wage: 20, cost: 0, standing: 0, at: ['cochim', 'coulao', 'cananor', 'calecute'],
    backstory: 'A Saint Thomas Christian whose family has kept the same church longer than Portugal has had a king. Has never seen Lisbon and wants a ship that comes back.',
  },
  {
    id: 'hasan-cambay', name: 'Khwaja Hasan', role: 'lingua', ability: 0.58, trait: 'haggler',
    languages: ['Gujarati', 'Árabe', 'Malaio'], wage: 24, cost: 0, standing: 0, at: ['cambaia', 'diu', 'chaul', 'goa', 'calecute'],
    backstory: 'A Cambay broker who has sold pepper to three navies and been paid by two. Will speak for any ship that pays on the day, and tells you so first.',
  },
  // The one non-Portuguese pilot, and the only man here with an arc of his own to the end.
  // Invented (see docs/DESIGN.md, "Sources checked for the company"). Not the Gujarati pilot of
  // the Malemo thread, who is a different man and a different errand.
  {
    id: 'hamisi', name: 'Hamisi bin Nasir', role: 'piloto', ability: 0.66, trait: 'exact', languages: ['Kiswahili', 'Árabe'],
    wage: 28, cost: 120, standing: 0, at: ['melinde'], arc: 'hamisi',
    backstory: 'A mu’allim of Melinde: a pilot who has taken dhows to Cambay and Hormuz by the monsoon, as his father did. He is not for sale; he is asking what kind of ship this is.',
    gate: (g) => {
      const rel = g.relationsFor('melinde');
      if (!rel.met) return 'He will not talk to a ship the sheikh has not received.';
      if (rel.regard < -0.1) return 'He has heard what is said of this ship on the quay, and has gone home.';
      const stopped = g.ledger.some((e) => e.tag === 'ship.stopped' && e.target !== 'portugal' && e.target !== 'castile' && e.target !== 'nation:genoese');
      if (stopped) return 'The word along the coast is that this ship stops dhows. He has asked his cousins, and they say it is so.';
      return null;
    },
  },
];

export const CANDIDATE_BY_ID = new Map(CANDIDATES.map((c) => [c.id, c]));

/** Who is for the asking on this quay, for a berth that is empty (the Melinde pilot may be a second). */
export function candidatesAt(g: Game, portId: string): Candidate[] {
  const empty = (role: OfficerRole): boolean => !g.crew.officers.some((o) => o.alive && !o.ashoreAt && o.role === role);
  return CANDIDATES.filter((c) => c.role !== 'lingua'
    && c.at.includes(portId)
    && !g.company.hired.includes(c.id)
    && (c.id === 'hamisi' || empty(c.role)));
}

/**
 * The named man who has this language, if he can be had here. On a Portuguese quay
 * it is a man brought home off that coast (`lisbon`); on a foreign one it is the
 * man of that coast who will take service, so `at` there is only where he is from.
 */
export function linguaCandidate(g: Game, language: string, home: boolean): Candidate | null {
  return CANDIDATES.find((c) => c.role === 'lingua'
    && c.languages.includes(language)
    && !g.company.hired.includes(c.id)
    && (!home || c.lisbon)) ?? null;
}
