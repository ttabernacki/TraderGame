import type { Tag } from '../../ledger/tags';
import type { FrontId, PowerId } from './types';

/**
 * THE DATA, WRITTEN BEFORE THE ENGINE (BUILD_PLAN C2; the Devil's Advocate's §3.3 test).
 *
 * Two tables, both over the real Ledger vocabulary in `ledger/tags.ts`:
 *
 *   FRONT_DELTAS    what an entry does to a Front, in stage points (a Front runs 0..16, four to a stage);
 *   ATTITUDES       what an entry does to a Power's attitude to the captain, -1..1.
 *
 * Every row cites the READER that makes it matter: the part of the game that looks at the Front or
 * the attitude and does something different because of it. A row nobody reads is a dead row.
 * `scripts/powers.ts` checks that every cited reader exists, that every tag exists and has an
 * emitter, and that moving each row moves something its reader can see.
 *
 * Numbers for the Traffic are the plan's (BUILD_PLAN C2): a person-carrying +0.10, a refusal at
 * cost -0.05, a contested hearing -0.15 (and Casa regard), redeeming a named person NOTHING. The
 * rest are judgement and are meant to be tuned by `scripts/powers.ts`, which only asks that no Front
 * ends pinned.
 */

/** The consumers of Fronts and attitudes. Each is registered (`declareReader`) where it lives. */
export type ReaderId =
  | 'modifiers.stage'   // marketModifiers: a Front's stage becomes a stage effect on a port's market
  | 'modifiers.dues'    // marketModifiers: a Power's attitude becomes dues at its ports
  | 'moves.kongo'       // the Kongo tick: attitude, balance and the Traffic's stage decide its moves
  | 'moves.gold'        // the Gold tick: strain at the fort, fever, the Akan's patience
  | 'scenes.traffic';   // trafficScenes: which scenes are offered, and what they say

export const READERS: Record<ReaderId, string> = {
  'modifiers.stage': 'A Front’s stage turns on its stage effects in marketModifiers (world/powers/modifiers.ts).',
  'modifiers.dues': 'A Power’s attitude sets the dues at its ports in marketModifiers (world/powers/modifiers.ts).',
  'moves.kongo': 'The Kongo Power’s monthly move reads its attitude, its balance and the Traffic (world/powers/kongo.ts).',
  'moves.gold': 'The Gold tick reads the Gold clock for strain and fever at the fort (world/powers/gold.ts).',
  'scenes.traffic': 'The Traffic scenes are offered, and worded, from the Front and the Ledger (progression/trafficScenes.ts).',
};

export interface FrontRow {
  tag: Tag;
  front: FrontId;
  /** Points. Positive speeds the Front's own process (the Traffic grows, the Gold strains). */
  delta: number;
  /** 'flat' once per entry; 'magnitude' times the entry's magnitude (a count, for tags that count). */
  scale: 'flat' | 'magnitude';
  /** Only entries made at one of these ports (or about one of them). */
  where?: string[];
  /** Only entries about one of these polities or ports. */
  about?: string[];
  why: string;
  reader: ReaderId;
}

const F = (
  tag: Tag, front: FrontId, delta: number, why: string, reader: ReaderId,
  o: { scale?: 'flat' | 'magnitude'; where?: string[]; about?: string[] } = {},
): FrontRow => ({ tag, front, delta, scale: o.scale ?? 'flat', where: o.where, about: o.about, why, reader });

const GOLD_COAST = ['mina', 'axim', 'acara'];
const TRAFFIC_PORTS = ['arguim', 'mina', 'mpinda', 'luanda', 'benguela', 'sao-tome-porto', 'ugoton', 'portudal'];
const CRESCENT_POLITIES = ['calicut', 'gujarat', 'aden', 'hormuz', 'kilwa', 'mombasa', 'malindi', 'cochin', 'kolathiri', 'mogadishu', 'mahra'];
const RULE_WATERS = ['kilwa', 'mombasa', 'malindi', 'calicut', 'cochin', 'kolathiri', 'gujarat', 'aden', 'hormuz'];

export const FRONT_DELTAS: FrontRow[] = [
  // --- The Traffic: the plan's numbers --------------------------------------------------------
  F('traffic.carried', 'traffic', 0.10, 'A parcel carried: the captain is a hull the trade did not have to find.', 'modifiers.stage'),
  F('traffic.refused', 'traffic', -0.05, 'Refused at cost: one ship fewer. Another takes them.', 'modifiers.stage'),
  F('hearing.contested', 'traffic', -0.15, 'Taken to a court and heard: the most the captain can do in one act, and the Casa notes it.', 'scenes.traffic'),
  F('person.redeemed', 'traffic', 0, 'DELIBERATELY NOTHING. It matters to the person and to the Book, not to the machine.', 'scenes.traffic'),
  F('practice.changed', 'traffic', -0.10, 'One place does it differently; the trade goes round it.', 'moves.kongo'),
  F('companion.freed', 'traffic', -0.03, 'A man who served aboard against his will walks ashore free; the pilots on the quay see it.', 'scenes.traffic'),
  F('companion.kept', 'traffic', 0.03, 'A man kept aboard who would have gone.', 'scenes.traffic'),
  F('books.honest', 'traffic', -0.02, 'A register kept straight is a count somebody can ask for.', 'scenes.traffic'),
  F('books.cooked', 'traffic', 0.03, 'A count of the dead made to read otherwise: the trade is cheaper to run.', 'scenes.traffic'),
  F('lane.opened', 'traffic', 0.04, 'An inland road deepens what the coast can supply, people included.', 'moves.kongo', { where: TRAFFIC_PORTS, about: TRAFFIC_PORTS }),
  F('port.funded', 'traffic', 0.04, 'A House on this coast is a buyer and a berth.', 'modifiers.stage', { where: TRAFFIC_PORTS, about: TRAFFIC_PORTS }),

  // --- The Gold (Mina): strain at the fort, the Akan's patience ------------------------------
  F('weights.false', 'gold', 0.12, 'The scales shaded: the gold traders go to the interlopers.', 'moves.gold', { where: GOLD_COAST, about: [...GOLD_COAST, 'eguafo'] }),
  F('weights.fair', 'gold', -0.08, 'Honest scales hold the gold on the Portuguese beach.', 'moves.gold', { where: GOLD_COAST, about: [...GOLD_COAST, 'eguafo'] }),
  F('gift.great', 'gold', -0.04, 'A gift praised at the Omanhene’s court eases the fort.', 'moves.gold', { about: ['eguafo', ...GOLD_COAST] }),
  F('gift.insult', 'gold', 0.06, 'A gift mocked: the fort’s welcome is a little thinner.', 'moves.gold', { about: ['eguafo', ...GOLD_COAST] }),
  F('promise.kept', 'gold', -0.06, 'A promise kept to the Akan eases the fort.', 'moves.gold', { about: ['eguafo', ...GOLD_COAST] }),
  F('promise.broken', 'gold', 0.10, 'A promise broken to the Akan: the fort pays for it for years.', 'moves.gold', { about: ['eguafo', ...GOLD_COAST] }),
  F('port.funded', 'gold', -0.10, 'A House at the fort takes some of its weight.', 'moves.gold', { where: GOLD_COAST, about: GOLD_COAST }),
  F('hand.died', 'gold', 0.03, 'Fever on the Mina coast: each man lost is a day the garrison is thinner.', 'moves.gold', { scale: 'magnitude', where: GOLD_COAST }),
  F('order.breached', 'gold', 0.08, 'An interloper let alone against the commission: the monopoly leaks.', 'moves.gold', { where: GOLD_COAST }),
  F('ship.stopped', 'gold', -0.04, 'An interloper stopped off the gold coast holds the Crown’s monopoly.', 'moves.gold', { where: GOLD_COAST }),
  F('hostage.died', 'gold', 0.08, 'A chief’s son dead in the captain’s keeping: the Akan do not forget it.', 'moves.gold', { about: ['eguafo', ...GOLD_COAST] }),

  // --- The Claim / the Race: Castile, the line, who is first ---------------------------------
  F('claim.made', 'claim', 0.15, 'A padrão raised is a claim somebody else must answer.', 'modifiers.stage'),
  F('claim.lost', 'claim', 0.10, 'The rival’s name on a coast: the race is closer.', 'modifiers.stage'),
  F('south.beyond', 'claim', 0.10, 'Past the furthest south: the line will have to be drawn further.', 'modifiers.stage'),
  F('chart.sold', 'claim', 0.20, 'A sheet in foreign hands: Castile sails on Portuguese knowledge.', 'modifiers.stage'),
  F('chart.shared', 'claim', -0.08, 'A sheet kept in the Casa’s press slows the other side.', 'modifiers.stage'),
  F('landmark.surveyed', 'claim', 0.03, 'A coast properly surveyed is a coast properly claimed.', 'modifiers.stage'),
  F('name.given', 'claim', 0.02, 'A name on the chart is a flag of a kind.', 'modifiers.stage'),
  F('patent.completed', 'claim', 0.05, 'The Crown has what it asked for, and asks for more.', 'modifiers.stage'),
  F('informer.found', 'claim', -0.05, 'The rival’s man found at a court: one less ear for Castile.', 'modifiers.stage'),
  F('informer.wronged', 'claim', 0.02, 'An innocent named: the court takes the Portuguese for credulous.', 'modifiers.stage'),
  F('crown.reported', 'claim', 0.03, 'Findings entered: the Crown’s case is the better documented.', 'modifiers.stage'),

  // --- The Crescent: the Indian Ocean's answer ------------------------------------------------
  F('ship.stopped', 'crescent', 0.12, 'A ship stopped in the eastern waters is written up in Cairo.', 'modifiers.stage', { about: CRESCENT_POLITIES }),
  F('ship.repulsed', 'crescent', 0.05, 'Boats beaten back from a dhow: the story outlasts the dhow.', 'modifiers.stage', { about: CRESCENT_POLITIES }),
  F('ship.spared', 'crescent', -0.06, 'A stranger let go: the tale goes ahead of the next ship.', 'modifiers.stage', { about: CRESCENT_POLITIES }),
  F('ship.succoured', 'crescent', -0.08, 'A ship in distress got sailing: the people of that ship tell it for life.', 'modifiers.stage', { about: CRESCENT_POLITIES }),
  F('peace.made', 'crescent', -0.15, 'A peace carried between two states: the ocean has one fewer war to blame on Portugal.', 'modifiers.stage', { about: CRESCENT_POLITIES }),
  F('peace.left', 'crescent', 0.04, 'A quarrel left unmended.', 'modifiers.stage', { about: CRESCENT_POLITIES }),
  F('gift.insult', 'crescent', 0.03, 'A gift mocked at an eastern court.', 'modifiers.stage', { about: CRESCENT_POLITIES }),
  F('gift.great', 'crescent', -0.03, 'A gift praised at an eastern court.', 'modifiers.stage', { about: CRESCENT_POLITIES }),
  F('promise.broken', 'crescent', 0.05, 'A broken word to an eastern court crosses the whole ocean.', 'modifiers.stage', { about: CRESCENT_POLITIES }),
  F('silent.blood', 'crescent', 0.03, 'Blood on a beach: the next ship is met with distrust, even here.', 'modifiers.stage', { about: CRESCENT_POLITIES }),

  // --- The Rule (the cartaz): free sea to licensed sea ---------------------------------------
  F('ship.stopped', 'rule', 0.20, 'Stopping a ship under the King’s letter is the Rule, in practice.', 'modifiers.stage', { about: RULE_WATERS }),
  F('ship.spared', 'rule', -0.10, 'Letting a ship pass keeps the sea freer than the King’s letter wants.', 'modifiers.stage', { about: RULE_WATERS }),
  F('ship.repulsed', 'rule', 0.06, 'A boarding that failed hardens the next.', 'modifiers.stage', { about: RULE_WATERS }),
  F('ship.succoured', 'rule', -0.06, 'Help given to a ship of any flag is a precedent the other way.', 'modifiers.stage', { about: RULE_WATERS }),
  F('ship.abandoned', 'rule', 0.03, 'A ship left in distress: a sea nobody is bound to help in.', 'modifiers.stage', { about: RULE_WATERS }),
  F('order.breached', 'rule', -0.04, 'An interloper let alone against the letter: the Rule bends where the captain stands.', 'modifiers.stage', { about: RULE_WATERS }),

  // --- The Court (home): the throne, the Church, the Rua Nova ------------------------------
  F('patron.honest', 'court', -0.05, 'The King had the truth once: the favourites have a little less room.', 'modifiers.stage'),
  F('patron.flattered', 'court', 0.05, 'A cheerful letter feeds the faction that wrote it.', 'modifiers.stage'),
  F('patent.completed', 'court', -0.06, 'A commission discharged is the throne’s grip on the Casa.', 'modifiers.stage'),
  F('crown.reported', 'court', -0.03, 'A report on the coast keeps the court from guessing.', 'modifiers.stage'),
  F('loan.defaulted', 'court', 0.08, 'A bad debt on the Rua Nova: the money’s friends at court grow cold.', 'modifiers.stage'),
  F('loan.repaid', 'court', -0.03, 'A debt repaid is credit at court.', 'modifiers.stage'),
  F('commission.failed', 'court', 0.04, 'A charter broken is a patron who will say so.', 'modifiers.stage'),
  F('commission.delivered', 'court', -0.03, 'A charter delivered is a patron’s credit.', 'modifiers.stage'),
  F('smuggle.caught', 'court', 0.05, 'The King’s officers have a name to quote.', 'modifiers.stage'),
  F('promise.broken', 'court', 0.04, 'A word broken to the Crown’s own court.', 'modifiers.stage', { about: ['portugal'] }),
  F('books.cooked', 'court', 0.04, 'A false line in the King’s book is a thread the clerks pull.', 'modifiers.stage'),
  F('hearing.contested', 'court', 0.06, 'Contesting a trade the Crown profits from heats the faction that profits.', 'modifiers.stage'),
  F('mutiny.lost', 'court', 0.05, 'A ship taken from its captain is a story at court.', 'modifiers.stage'),
];

// ---------------------------------------------------------------------------------------------

export interface AttitudeRow {
  tag: Tag;
  /** The Power it is done to: a Power id, or 'target' for whichever Power the entry's target belongs to. */
  power: PowerId | 'target';
  /** Attitude per unit of magnitude (-1..1 scale; most rows are 0.03 to 0.25). */
  w: number;
  /** Whether the word travels to that Power's allies (x0.5) and enemies (x-0.3). */
  spread: boolean;
  why: string;
  reader: ReaderId;
}

const A = (
  tag: Tag, power: PowerId | 'target', w: number, why: string, reader: ReaderId = 'modifiers.dues', spread = true,
): AttitudeRow => ({ tag, power, w, spread, why, reader });

export const ATTITUDES: AttitudeRow[] = [
  // Word, manners and gifts
  A('promise.kept', 'target', 0.12, 'A word kept is remembered.'),
  A('promise.broken', 'target', -0.18, 'A word broken is remembered longer.'),
  A('envoy.mixed', 'target', 0.02, 'A mixed report from its envoy.', 'modifiers.dues', false),
  A('courtesy.kept', 'target', 0.05, 'He asked before he acted.', 'modifiers.dues', false),
  A('courtesy.broken', 'target', -0.08, 'He stood where a stranger should have bowed.', 'modifiers.dues', false),
  A('table.kept', 'target', 0.08, 'A guest who kept the table.'),
  A('table.spoiled', 'target', -0.07, 'A guest who spoiled it.'),
  A('gift.great', 'target', 0.10, 'A gift praised.'),
  A('gift.insult', 'target', -0.12, 'A gift mocked.'),
  A('peace.made', 'target', 0.15, 'He carried the proposals.'),
  A('peace.left', 'target', -0.04, 'He came between them and left it.', 'modifiers.dues', false),
  A('judgement.just', 'target', 0.10, 'He judged as a man of law would.'),
  A('judgement.unjust', 'target', -0.12, 'A ruling that will not stand.'),
  A('refusal.honest', 'target', 0.10, 'He refused honestly and kept the friend.', 'modifiers.dues', false),
  A('mark.for', 'target', 0.05, 'A mark for him on the court’s book.', 'modifiers.dues', false),
  A('mark.against', 'target', -0.06, 'A mark against him on the court’s book.', 'modifiers.dues', false),
  A('silent.fair', 'target', 0.10, 'He dealt fairly on the mat.'),
  A('silent.blood', 'target', -0.25, 'Blood on the beach.'),
  A('informer.wronged', 'target', -0.12, 'He named an innocent man.', 'modifiers.dues', false),
  A('informer.found', 'target', 0.06, 'He saw what their own court had not.', 'modifiers.dues', false),

  // Hostages, mercy, faith
  A('hostage.freed', 'target', 0.06, 'A boy sent home.'),
  A('hostage.raised', 'target', 0.12, 'A boy raised as a son of two houses.'),
  A('hostage.ill', 'target', -0.04, 'A boy ill in his keeping.', 'modifiers.dues', false),
  A('hostage.died', 'target', -0.25, 'A boy dead in his keeping.'),
  A('mercy.shown', 'target', 0.05, 'Someone nursed who could not repay.', 'modifiers.dues', false),
  A('faith.pressed', 'target', -0.15, 'Baptism pressed on a people who had not asked.', 'moves.kongo'),
  A('faith.respected', 'target', 0.12, 'A worship left alone.', 'moves.kongo'),

  // Trade, weights, roads
  A('weights.false', 'akan', -0.15, 'The gold traders find something to do when he comes down the beach.'),
  A('weights.fair', 'akan', 0.08, 'Word of the scales goes along the coast.'),
  A('weights.false', 'target', -0.15, 'A shaded scale.', 'modifiers.dues', false),
  A('weights.fair', 'target', 0.08, 'An honest scale.', 'modifiers.dues', false),
  A('lane.opened', 'target', 0.10, 'An inland road opened for their goods.'),
  A('port.funded', 'target', 0.08, 'A House on their quay.'),
  A('contract.kept', 'crown', 0.03, 'The Houses on the Rua Nova trust his word a little more.', 'modifiers.dues', false),

  // The Crown, the Casa, charts
  A('patron.honest', 'crown', 0.10, 'The King had the truth from him.'),
  A('patron.flattered', 'crown', -0.03, 'A cheerful letter; the reader noticed.'),
  A('patent.completed', 'crown', 0.12, 'A commission discharged.'),
  A('crown.reported', 'crown', 0.05, 'Reported to the factor.'),
  A('chart.shared', 'crown', 0.10, 'His sheets in the Casa’s press.'),
  A('chart.sold', 'crown', -0.15, 'Sold the Crown’s coast to others.'),
  A('chart.sold', 'castile', 0.10, 'A sheet of the Portuguese coast in Castilian hands.'),
  A('claim.made', 'crown', 0.10, 'A padrão raised.', 'modifiers.dues', false),
  A('claim.made', 'castile', -0.08, 'A padrão on a coast Castile was watching.', 'modifiers.dues', false),
  A('claim.lost', 'crown', -0.04, 'The rival’s name stands where his might have.', 'modifiers.dues', false),
  A('smuggle.caught', 'crown', -0.12, 'Fined at the weigh-house.', 'modifiers.dues', false),
  A('loan.defaulted', 'crown', -0.06, 'A name on the Rua Nova that is never closed.', 'modifiers.dues', false),
  A('loan.repaid', 'crown', 0.03, 'Paid what he owed.', 'modifiers.dues', false),
  A('books.cooked', 'crown', -0.04, 'A false line in the King’s book.', 'modifiers.dues', false),
  A('books.honest', 'crown', 0.04, 'A straight line in the King’s book.', 'modifiers.dues', false),

  // Strangers at sea
  A('ship.stopped', 'target', -0.15, 'A ship of theirs stopped.'),
  A('ship.stopped', 'mamluk', -0.10, 'The Mamluk and Venetian houses hear of every stopping.', 'modifiers.dues', false),
  A('ship.spared', 'target', 0.06, 'He let her go.'),
  A('ship.succoured', 'target', 0.10, 'He got her sailing.'),
  A('ship.abandoned', 'target', -0.04, 'He held his course.', 'modifiers.dues', false),
  A('ship.repulsed', 'target', -0.05, 'Boats beaten back.', 'modifiers.dues', false),

  // The Traffic: these are the sellers’ and buyers’ own views of a hull on their coast, not a verdict
  A('traffic.carried', 'sahel', 0.05, 'A hull that will take what the brokers have; they notice who does.', 'modifiers.dues', false),
  A('traffic.carried', 'akan', 0.05, 'A ship that brings labour to the mines; the buyers at the beach notice.', 'modifiers.dues', false),
  A('traffic.carried', 'benin', 0.03, 'The Oba’s terms are met by a captain who carries.', 'modifiers.dues', false),
  A('traffic.refused', 'sahel', -0.03, 'A ship that will not carry: the brokers go to the next.', 'modifiers.dues', false),
  A('traffic.refused', 'akan', -0.02, 'A ship that will not carry.', 'modifiers.dues', false),
  A('hearing.contested', 'crown', -0.12, 'He took the Crown’s profitable trade to a hearing; the Casa has a copy.', 'modifiers.dues', false),
  A('hearing.contested', 'kongo', 0.06, 'The elders hear that a Portuguese captain put the question.', 'moves.kongo', false),
  A('hearing.contested', 'akan', 0.04, 'The elders at the beach hear it too.', 'modifiers.dues', false),
  A('person.redeemed', 'sahel', 0.04, 'Families remember the ship that brought one home, or to freedom.', 'modifiers.dues', false),
  A('person.redeemed', 'akan', 0.04, 'A person redeemed at their own beach.', 'modifiers.dues', false),
  A('practice.changed', 'kongo', 0.20, 'The Mani Soyo’s officer counts at the beach, because of him.', 'moves.kongo', false),
  A('practice.changed', 'crown', -0.05, 'A factor’s book has a line it did not have.', 'modifiers.dues', false),
];
