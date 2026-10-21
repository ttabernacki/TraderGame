import type { Game } from '../game/state';
import { setQuestPriceMods } from '../world/portCharacter';
import {
  ledgerSays, onArcEnd, portMark, registerArcs, thread, writeTheSea,
  type QuestDef, type QuestId, type QuestMarker, type QuestState,
} from '../storylets/arc';
import { kingsOffer } from '../storylets/threads/ending';
import { caravel, galeao, kongo, leak, aprendiz } from '../storylets/threads/west';
import { count, feitorCalecute, mappila, monsoon, pepperRace, prester, sofala, zamorin } from '../storylets/threads/east';
import { ficheiro, nome, roteiro, escudeiro } from '../storylets/threads/origins';
import { adrift, feverFleet, mercador, padrao, pesos } from '../storylets/threads/texture';
import { offersAt, registerThreads } from '../storylets/threads';
import { qualityOf } from '../storylets/qualities';

/**
 * The long stories, as the Web carries them (BUILD_PLAN E1, Pillar 4).
 *
 * The threads are arcs of storylets (`storylets/threads/*`): each step says where it is had, what it needs of the
 * world, which beat it opens and when the world will have moved on without it. This file is the bridge the rest of the
 * game still reads: the registry of arcs (`QUESTS`), what a finished arc leaves behind (the last page's lines, the road's
 * memory, the epilogue's), the Book's rumours, and the prices a finished thread changes.
 *
 * The thread record (`Game.quests`: step, flags, journal, outcome) is unchanged, so a story in flight when the engine
 * arrived goes on from where it stood; `storylets/resolver` settles the two threads that were cut.
 */

export type { QuestDef, QuestId, QuestMarker, QuestState };
export { ledgerSays, offersAt, writeTheSea };

/** Cut as threads (BUILD_PLAN E1): kept only so a save with one of them, finished or in flight, still has a title to show. */
const retired = (id: QuestId, title: string, blurb: string): QuestDef => thread({
  id, title, blurb, offeredAt: [], requires: [{ fn: () => false, label: 'cut' }],
  offer: () => ({ who: '', text: '', accept: '' }), first: 'closed', steps: {},
});
const malay = retired('malay', 'The Cinnamon Island', 'A Malay merchant at Cochim has letters to Ceylon and Malacca. Nobody in Portugal has ever been further.');
const pepperHouse = retired('pepperhouse', 'The Pepper of Your Houses', 'The Casa has noticed how much pepper your Lines bring in, and so have the men of the Rua Nova.');

export const QUESTS: Record<QuestId, QuestDef> = {
  caravel, leak, kongo, prester, zamorin, galeao, nome, ficheiro, roteiro, escudeiro,
  adrift, pesos, padrao, mercador, monsoon, aprendiz, sofala, count, feitorcal: feitorCalecute, mappila, malay, pepperrace: pepperRace, feverfleet: feverFleet, kingsoffer: kingsOffer, pepperhouse: pepperHouse,
};
registerArcs(QUESTS);
registerThreads((Object.values(QUESTS) as QuestDef[]).filter((d) => d !== malay && d !== pepperHouse));
onArcEnd(refreshQuestPrices);

// ---------------------------------------------------------------------------
// What a finished thread leaves behind: the last page, the road's memory, the epilogue's lines

/** The line under the origin on the last page: what this captain did with who he was. */
const ORIGIN_ENDINGS: Record<string, string> = {
  'nome:self': 'There is a cape on the Swahili coast with your name on it, and nobody living there knows or needs to.',
  'nome:brother': 'Duarte had the headland read out at the house, twice. He never said so to you, and he kept the letter.',
  'nome:friend': 'Rui Mendes named his son for you. The Casa paid his surety back eleven years late.',
  'nome:plain': 'You gave the headland a name anyone could have, and kept your own for the ships.',
  'ficheiro:closed': 'The file on your family was closed, and the clerk who closed it was not thanked, either.',
  'ficheiro:open': 'The file stayed open. You were useful, and the merchants of Cochim remembered you in Lisbon all the same.',
  'roteiro:named': 'The bay is on the chart under his name, and you have never told anybody which of you found it.',
  'roteiro:crown': 'The bay is the King’s. The cairn on the north horn is still there, and is still empty.',
  'roteiro:sold': 'You sold his book, and did not find the bay. Somebody else did, in the end, and named it for a saint.',
  'escudeiro:honest': 'The King had the truth from you once, in his own hand, and never forgot who had given it.',
  'escudeiro:flattered': 'The King had a cheerful letter from you once. Dom Lopo, who read it over your shoulder, never did.',
};
export function originEnding(g: Game): string | null {
  const id: QuestId | undefined = ({ segundo: 'nome', converso: 'ficheiro', piloto: 'roteiro', fidalgo: 'escudeiro' } as const)[g.origin];
  const q = id && g.quests.find((x) => x.id === id);
  // Where the Ledger already says it (the chronicles above), the card does not repeat it.
  if (q && q.outcome && ledgerSays(q.id, q.outcome)) return null;
  return q && q.outcome ? ORIGIN_ENDINGS[`${id}:${q.outcome}`] ?? null : null;
}

/**
 * The world remembering. A finished thread is noticed, once, at the place it
 * touched — a greeting at the gate, a note in the King's book, a fish sold at
 * cost — so that what the captain did is something the road shows him, not
 * only something the journal says.
 */
const CALLBACKS: { quest: QuestId; outcomes?: string[]; flags?: Record<string, number | string | boolean>; ports: string[]; text: string }[] = [
  { quest: 'pesos', outcomes: ['inland'], ports: ['mina', 'axim', 'acara'], text: 'The gold traders at the gate nod to you before they nod to the factor. Word of the scales has gone along the coast.' },
  { quest: 'pesos', outcomes: ['cheat'], ports: ['mina', 'axim', 'acara'], text: 'The gold traders find something to do when you come down the beach. The clerk’s scales are still the Casa’s.' },
  { quest: 'pesos', outcomes: ['repaid'], ports: ['axim'], text: 'A trader at Axim gives you a nod that is almost warm. He has been told about the hundred and fifty.' },
  { quest: 'adrift', outcomes: ['boy', 'salvage'], ports: ['arguim'], text: 'The garrison at Arguim turns out to watch you come in. Somebody knows whose the caravel was that you brought news of.' },
  { quest: 'padrao', ports: ['mocambique'], text: 'The King’s factor at Moçambique has left the page with Dias’s padrão open on his desk, and leaves it there when you come in.' },
  { quest: 'mercador', outcomes: ['freely', 'pilotage'], ports: ['melinde'], text: 'A dish of figs is sent down to the ship from a house on the terrace. The sheikh’s harbour-master bows lower than he need.' },
  { quest: 'mercador', outcomes: ['freely', 'pilotage'], ports: ['mombaca'], text: 'At Mombaça a boy on the beach watches you and says nothing, and then holds up his hand in greeting.' },
  { quest: 'monsoon', outcomes: ['freed'], ports: ['calecute', 'cochim', 'cananor'], text: 'A pilot on the quay at Calecute touches his brow to you. They know the name of the ship.' },
  { quest: 'monsoon', outcomes: ['kept'], ports: ['calecute', 'cochim', 'cananor'], text: 'The pilots on the quay at Calecute look at Malemo standing at your rail, and then do not look at him.' },
  { quest: 'roteiro', outcomes: ['named'], ports: ['mocambique', 'melinde'], text: 'A Moçambique pilot has the Baía do Piloto in his book, in a hand you do not know. He asks whether it is yours.' },
  { quest: 'ficheiro', outcomes: ['closed'], ports: ['lisboa', 'lagos'], text: 'The Casa’s clerk on the quay does not look up when you come ashore. It is the first time that has been a kindness.' },
  { quest: 'aprendiz', outcomes: ['chose'], ports: ['lagos', 'lisboa', 'funchal'], text: 'A fishwife on the quay sells you her whole basket at cost and will not hear a word about it.' },
  { quest: 'nome', outcomes: ['self', 'brother', 'friend'], ports: ['lisboa'], text: 'A letter in Duarte’s hand is waiting at the Casa. It is four lines, and none of them is about money.' },
  { quest: 'escudeiro', outcomes: ['honest'], ports: ['lisboa', 'lagos'], text: 'The men at the Casa stand a little straighter when you pass. A man who tells the King the truth is either feared or trusted.' },
  { quest: 'sofala', outcomes: ['fair'], ports: ['sofala', 'quiloa', 'mocambique'], text: 'A dhow captain at the water stairs tells you, unasked, that the Portuguese at Çofala paid what they said. He says it like a man reporting a miracle.' },
  { quest: 'count', outcomes: ['honest', 'declared'], ports: ['lisboa'], text: 'The weigh-house clerks are very civil this morning. The contador has been telling the story of your book.' },
  { quest: 'feitorcal', outcomes: ['peace'], ports: ['calecute', 'cochim'], text: 'Aires Correia, the factor, has put a jar of Calecute’s best pepper-wine on your table with no note. The shutters of the house are wide open.' },
  { quest: 'feitorcal', outcomes: ['riot', 'riot-home'], ports: ['cochim', 'calecute'], text: 'Nobody at the water stairs will meet your eye. The black patch on the waterfront, where the factory was, has a fresh flower on it.' },
  { quest: 'mappila', outcomes: ['treaty', 'friendly'], ports: ['cananor', 'calecute'], text: 'A Cananor boatman offers to carry you ashore for nothing. The Kolathiri’s friends are everywhere on the water.' },
  { quest: 'malay', outcomes: ['malacca', 'quay'], ports: ['cochim', 'calecute', 'columbo'], text: 'A pilot in the Cochim roadstead has heard of Malacca and of the ship that went there. He asks whether the cloves are what he has been told.' },
  { quest: 'pepperrace', outcomes: ['won'], ports: ['lisboa', 'lagos'], text: 'A Ribeira porter touches his cap. The men who lost money on the other ship are not among the ones who look you in the eye.' },
  { quest: 'feverfleet', outcomes: ['nursed', 'landed'], ports: ['mocambique', 'lisboa', 'lagos'], text: 'A man with a scar at the corner of his mouth recognises the ship and stands to attention on the quay. He was one of the São Vicente’s.' },
  { quest: 'caravel', outcomes: ['paid', 'mass'], ports: ['funchal', 'lagos', 'lisboa'], text: 'A sugar merchant’s clerk finds you on the quay with a cask and a card: Isabel da Costa’s brother sends his thanks, and will not hear of payment.' },
  { quest: 'kongo', outcomes: ['enforced'], ports: ['mpinda'], text: 'The Manikongo’s men line the beach at Mpinda and bow as you land. The priests are a little further off, and do not.' },
  { quest: 'kongo', outcomes: ['lookedaway'], ports: ['mpinda'], text: 'The Manikongo receives you coolly. He remembers what you did not say.' },
  { quest: 'prester', outcomes: ['found', 'proof'], ports: ['melinde', 'mocambique'], text: 'A Melinde scribe asks whether it is true about the Abyssinian letter, and whether he might copy it. Word travels on this coast faster than ships.' },
  { quest: 'galeao', ports: ['las-palmas', 'lisboa'], text: 'A shipwright’s apprentice on the careenage stops work to watch you pass. He has a sketch of a long, low hull on his bench, and does not try to hide it.' },
  { quest: 'leak', ports: ['lisboa'], text: 'The Rua Nova has a new contador, and a new way of looking at the ships’ books.' },
  // What the choices on the way left in the thread's own record, remembered where the road shows it (BUILD_PLAN E1: no dead qualities).
  { quest: 'nome', flags: { kin: true }, ports: ['lisboa'], text: 'The Casa holds a second letter from Duarte, and this one is about the neighbour, who has been paid. He thanks you in the last line, as if it had cost him something.' },
  { quest: 'nome', flags: { land: true }, ports: ['lisboa', 'funchal'], text: 'A clerk has a note from the donatary’s agent at Funchal: the cane land is entered in your name, and the water with it.' },
  { quest: 'nome', flags: { proud: true }, ports: ['lisboa', 'lagos'], text: 'Duarte’s steward is on the quay, and does not come forward when he sees the ship.' },
  { quest: 'leak', flags: { falseCharts: true }, ports: ['las-palmas'], text: 'A Castilian pilot tells anyone who will listen how two caravels were lost on the Arguim banks by a chart that was a good deal too sure of itself. He does not look at you.' },
  { quest: 'prester', outcomes: ['lost'], ports: ['melinde', 'mocambique'], text: 'A Melinde scribe asks whether anything was ever heard of the envoy, and does not wait for the answer.' },
  { quest: 'zamorin', outcomes: ['war'], ports: ['calecute', 'cochim'], text: 'The guns on the point at Calecute are manned when you come in, and nobody on the beach turns to look at the ship.' },
  { quest: 'aprendiz', outcomes: ['home'], ports: ['lagos', 'funchal'], text: 'A fishwife on the quay has a boy by the hand, in his Sunday clothes. He looks at the ship, and then at his feet.' },
  { quest: 'feverfleet', outcomes: ['left'], ports: ['mocambique', 'melinde'], text: 'A boatswain at the water stairs looks at the casks in your boat, and says to nobody that a cask of water is a cask of water.' },
];

export function callbackAt(g: Game, portId: string): string | null {
  for (let i = 0; i < CALLBACKS.length; i++) {
    const cb = CALLBACKS[i];
    const key = `cb:${cb.quest}:${i}`;
    if (!cb.ports.includes(portId) || g.secretsHeard.includes(key)) continue;
    const q = g.quests.find((x) => x.id === cb.quest);
    if (!q?.outcome || (cb.outcomes && !cb.outcomes.includes(q.outcome))) continue;
    if (cb.flags && !Object.entries(cb.flags).every(([k, v]) => q.flags[k] === v)) continue;
    g.secretsHeard.push(key);
    return cb.text;
  }
  return null;
}

/** What the late threads say about how the career ended, for the last page. */
const LATE_ENDINGS: Record<string, string> = {
  'kingsoffer:armada': 'You commanded the armada, and the road to the Indies was yours for the rest of your life.',
  'kingsoffer:lordship': 'You took the lordship and the quiet. On a clear day you could see the river from the terrace, and you usually did not look.',
  'kingsoffer:rich': 'You took the gold and were let alone. It was the most honest thing anyone at court had said in years.',
  'kingsoffer:ship': 'You asked for nothing but the ship. The King had to find something else to give, and never did.',
  'pepperrace:won': 'You were first up the Tagus with the pepper, and the court has told it ever since.',
  'pepperrace:quarrel': 'You quarrelled with your rival on the Ribeira in front of the court, and the court has told it better than either of you.',
  'pepperrace:second': 'You came second up the Tagus, and were gracious about it. It is the only thing in the story anyone remembers of you.',
  'feverfleet:nursed': 'The men of the São Vicente tell the story of the Aguada de São Brás in every tavern on the Tagus.',
};
export function lateEndings(g: Game): string[] {
  const out: string[] = [];
  for (const q of g.quests) {
    const line = q.outcome ? LATE_ENDINGS[`${q.id}:${q.outcome}`] : undefined;
    if (line) out.push(line);
  }
  // The Kilwa promise: a quality the Çofala thread wrote, read here by the last page (and by the Rule's scenes and Hamisi's approval).
  if (qualityOf(g, 'flag.promise.kilwa.first_call')) {
    const sofala = g.quests.find((q) => q.id === 'sofala')?.outcome;
    if (sofala === 'fair') out.push('The King’s ships called at Kilwa before Çofala, as you had promised the vizier, and the vizier remembers it.');
    if (sofala === 'route') out.push('You promised the vizier of Kilwa that the ships would call there first, and then gave the Crown the road to Çofala. He has the promise by heart.');
  }
  return out;
}

export function newQuest(id: QuestId, t: number): QuestState {
  return {
    id, step: QUESTS[id].first, stepT: t, fired: false, flags: {}, started: t,
    journal: [{ t, text: QUESTS[id].blurb }],
  };
}

/**
 * Secret threads the captain has heard of but not yet taken up: what the log
 * and the chart say about them, so a word overheard in a tavern is not lost.
 */
export interface Rumour { id: QuestId; title: string; text: string; mark: QuestMarker }
const RUMOURS: Partial<Record<QuestId, { text: string; port: string; label: string }>> = {
  galeao: {
    text: 'A Canary Islands pilot in a Lisbon tavern says the Castilians have a Biscayan building '
      + 'them "a ship like nothing afloat" at Las Palmas, and that the man has not been paid. '
      + 'Ask about it in the harbour taverns of Las Palmas.',
    port: 'las-palmas',
    label: 'The Biscayan’s ship (rumour)',
  },
};
export function rumoursHeard(g: Game): Rumour[] {
  const out: Rumour[] = [];
  for (const id of g.secretsHeard as QuestId[]) {
    const r = RUMOURS[id];
    if (!r || g.quests.some((q) => q.id === id) || !QUESTS[id]?.available(g)) continue;
    out.push({ id, title: QUESTS[id].title, text: r.text, mark: portMark(r.port, r.label) });
  }
  return out;
}

export function goalOf(g: Game, q: QuestState): string {
  if (q.outcome) return 'Finished.';
  return QUESTS[q.id].steps[q.step]?.goal(g, q) ?? '';
}

export function markerOf(g: Game, q: QuestState): QuestMarker | null {
  if (q.outcome) return null;
  return QUESTS[q.id].steps[q.step]?.marker?.(g, q) ?? null;
}

/** Prices that a finished thread has changed for good. */
export function refreshQuestPrices(g: Game): void {
  const mods: Record<string, Record<string, { ask?: number; bid?: number }>> = {};
  const kongo = g.quests.find((q) => q.id === 'kongo');
  if (kongo?.outcome === 'enforced') mods.mpinda = { marfim: { ask: 0.75 }, ferramenta: { bid: 1.3 } };
  const z = g.quests.find((q) => q.id === 'zamorin');
  if (z?.outcome === 'empire' || z?.outcome === 'peace') mods.cochim = { pimenta: { ask: 0.75 } };
  if (z?.outcome === 'peace') mods.calecute = { pimenta: { ask: 0.8 } };
  setQuestPriceMods(mods);
}
