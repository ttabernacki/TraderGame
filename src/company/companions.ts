import { POLITY_BY_ID } from '../diplomacy/polities';
import type { Entry } from '../ledger/ledger';
import type { Tag } from '../ledger/tags';

/**
 * The company, as data.
 *
 * Each written companion has a Want, a Fear and a Line (the one thing he will
 * not do), and a table of what the Ledger's tags mean to *him*: the same deed
 * is a kindness to one man and an offence to another, and that difference is
 * most of what makes six people in a wardroom six people. `approval.ts` reads
 * these tables; nothing here moves anything by itself.
 *
 * Weights are in approval points for one full-weight entry (-30..+30), and a
 * tag's contribution saturates, so a captain cannot buy a man with the same
 * kindness a dozen times, or lose him over the same slip a dozen times.
 * `because` completes "because ..." in the one-line cause the crew screen shows.
 */

export interface Weight {
  tag: Tag;
  w: number;
  /** "... because <you let the weights stand false>". */
  because: string;
  /** Only entries this holds for count (a people's own ships, its own courts). */
  where?: (e: Entry) => boolean;
}

export type ConsequenceKind = 'chart' | 'rival' | 'gossip' | 'report';

export interface Exit {
  /** What he does on the way out. */
  consequence: ConsequenceKind;
  /** How his arc is recorded if it was still running. */
  end: 'estranged' | 'betrayed';
  /** The scene at the gangway, said once, in his voice. */
  leaves: string;
}

export interface Companion {
  /** Arc id for the written men; role key for the rest. */
  key: string;
  want: string;
  fear: string;
  line: string;
  weights: Weight[];
  /** What he says at a hard decision when he has stopped holding his tongue (approval of -40 or less). */
  dissent: string[];
  exit: Exit;
}

// -- Whose people ------------------------------------------------------------

const EASTERN_NATIONS = new Set(['nation:arab', 'nation:swahili', 'nation:moorish', 'nation:gujarati', 'nation:indian', 'fez']);
const EASTERN_PEOPLES = new Set(['swahili', 'arab', 'gujarati', 'moor']);

/** An entry done to the Swahili coast, Arabia or Gujarat, or to their ships. */
export function hisPeople(e: Entry): boolean {
  if (EASTERN_NATIONS.has(e.target)) return true;
  const pol = POLITY_BY_ID.get(e.target);
  return !!pol && EASTERN_PEOPLES.has(pol.people);
}

/** A ship stopped that was not a Christian's. */
const notChristian = (e: Entry): boolean => e.target !== 'portugal' && e.target !== 'castile' && e.target !== 'nation:genoese';

// -- The six written men, and the three added ---------------------------------

export const COMPANIONS: Companion[] = [
  {
    key: 'correia',
    want: 'One more voyage without being replaced.',
    fear: 'The hand that shakes, and the day somebody else notices.',
    line: 'He will not put a position in the book that he did not take.',
    weights: [
      { tag: 'landfall.exact', w: 14, because: 'the board held at the landfall' },
      { tag: 'landfall.lost', w: -9, because: 'she raised her port a day’s sail from where the board had her' },
      { tag: 'pilot.trusted', w: 8, because: 'you read a pilot right' },
      { tag: 'pilot.misled', w: -12, because: 'you followed a pilot you had not checked' },
      { tag: 'chart.shared', w: 8, because: 'you gave the Casa the roteiro in his name' },
      { tag: 'chart.sold', w: -16, because: 'you sold sheets he had helped draw' },
      { tag: 'south.beyond', w: 10, because: 'you took her past the furthest south' },
      { tag: 'landmark.surveyed', w: 6, because: 'you stood in to measure a landmark' },
      { tag: 'landmark.passed', w: -4, because: 'you ran by a landmark unmeasured' },
      { tag: 'hand.died', w: -6, because: 'men were buried' },
      { tag: 'companion.lied_to', w: -10, because: 'you made a man write a lie into the King’s book' },
      { tag: 'books.cooked', w: -14, because: 'the books were cooked' },
      { tag: 'ship.abandoned', w: -12, because: 'you held your course past a ship in distress' },
      { tag: 'promise.kept', w: 5, because: 'you kept your word' },
      { tag: 'promise.broken', w: -8, because: 'you broke your word' },
    ],
    dissent: [
      'I have said what I think of the way this ship is handled, sir, and I will not say it twice. Do as you please. I shall write down where she goes.',
      'Forty years, sir, and I have never once put a position in the book I did not take. I find I am being asked to share in some other kind of arithmetic.',
    ],
    exit: {
      consequence: 'gossip', end: 'estranged',
      leaves: 'He comes aft with the traverse board under his arm, which is not his to take and which he has copied out fair for you instead. "I will take my leave at the next quay, sir. I am told there are captains in Lisbon who do not need to be told twice where they are."',
    },
  },
  {
    key: 'sousa',
    want: 'A ship of his own, with his name in the Casa’s book against her.',
    fear: 'Dying a master with other men’s names on his work.',
    line: 'He will not stay in a ship he has judged is going to be lost with the men in her.',
    weights: [
      { tag: 'commission.delivered', w: 12, because: 'you delivered the charter' },
      { tag: 'commission.failed', w: -10, because: 'you let a charter fail' },
      { tag: 'contract.kept', w: 6, because: 'you kept your contracts' },
      { tag: 'contract.broken', w: -8, because: 'a contract ran out undelivered' },
      { tag: 'loan.repaid', w: 4, because: 'you paid what you owed' },
      { tag: 'loan.defaulted', w: -10, because: 'a loan went bad against your name' },
      { tag: 'port.funded', w: 10, because: 'you put a House ashore, and houses need masters' },
      { tag: 'claim.made', w: 8, because: 'you raised a padrão' },
      { tag: 'claim.lost', w: -8, because: 'the rival took a coast first' },
      { tag: 'patent.completed', w: 12, because: 'you discharged a commission for the Crown' },
      { tag: 'south.beyond', w: 8, because: 'you took her past the furthest south' },
      { tag: 'mutiny.faced_down', w: 6, because: 'you faced them down' },
      { tag: 'mutiny.lost', w: -14, because: 'the crew took the ship from you' },
      { tag: 'mutiny.turned_back', w: -8, because: 'you put the helm up for home' },
      { tag: 'mutiny.conceded', w: -6, because: 'you gave the ringleader what he asked' },
      { tag: 'hand.flogged', w: 4, because: 'you backed the boatswain' },
      { tag: 'order.breached', w: -6, because: 'you let an interloper alone against your commission' },
      { tag: 'smuggle.caught', w: -8, because: 'the weigh-house fined you' },
    ],
    dissent: [
      'I have kept my own book of this voyage, sir, and it is a good deal more critical than the one you are reading from.',
      'There are captains in the Casa’s list who would have taken that the other way, sir. I have not made up my mind whether you are one of them.',
    ],
    exit: {
      consequence: 'rival', end: 'betrayed',
      leaves: 'He tells you himself, which he did not have to. The rival’s boat has been alongside twice since the last quay. "I am sorry for it, sir. You taught me a great deal, and I have put it to the best use I could find."',
    },
  },
  {
    key: 'gaspar',
    want: 'His pardon, and a place that is his by right of having stayed.',
    fear: 'Being left a second time by a man who said he would come back.',
    line: 'He will not turn on the people who took him in.',
    weights: [
      { tag: 'promise.kept', w: 14, because: 'you kept your word' },
      { tag: 'promise.broken', w: -16, because: 'you broke your word, and he knows what that costs' },
      { tag: 'companion.freed', w: 16, because: 'you freed a man who served against his will' },
      { tag: 'companion.kept', w: -10, because: 'you kept a man aboard who would have gone' },
      { tag: 'mercy.shown', w: 12, because: 'you took in someone who could not repay it' },
      { tag: 'hostage.freed', w: 8, because: 'you sent a hostage home' },
      { tag: 'hostage.raised', w: 8, because: 'you raised a chief’s son as your own' },
      { tag: 'hostage.died', w: -18, because: 'a chief’s son died in your keeping' },
      { tag: 'table.kept', w: 6, because: 'you kept a host’s table' },
      { tag: 'table.spoiled', w: -6, because: 'you spoiled a host’s table' },
      { tag: 'courtesy.kept', w: 6, because: 'you asked before you acted' },
      { tag: 'courtesy.broken', w: -6, because: 'you stood where a stranger should have bowed' },
      { tag: 'gift.insult', w: -6, because: 'your gifts were mocked' },
      { tag: 'silent.fair', w: 10, because: 'you dealt fair on the mat' },
      { tag: 'silent.blood', w: -18, because: 'blood was shed on a beach that trusted you' },
      { tag: 'ship.abandoned', w: -8, because: 'you held your course past a ship in distress' },
      { tag: 'faith.pressed', w: -10, because: 'a people was pressed to the font' },
      { tag: 'journey.lost', w: -10, because: 'a man sent inland never came down' },
      { tag: 'journey.returned', w: 8, because: 'the man you sent inland came back' },
    ],
    dissent: [
      'You told me, sir, on the first day, that you did not know whether you would come back for me. I took it for honesty. I am no longer certain it was not simply the truth.',
      'I have stood on a beach and watched a ship go. I know what a captain looks like who has made up his mind, and I know what he looks like when he thinks I have not noticed.',
    ],
    exit: {
      consequence: 'gossip', end: 'estranged',
      leaves: 'He goes down the side with his bag and does not look back, as he did the first time. This time it is not a boat from the ship that takes him in; it is four men who were waiting on the quay, and one of them is carrying a child.',
    },
  },
  {
    key: 'dinis',
    want: 'To find the cause of the scurvy and be believed before he dies.',
    fear: 'Another bad run of burials, and a clerk writing them down as the weather.',
    line: 'He will not sign a muster that says a man died of something else.',
    weights: [
      { tag: 'hand.died', w: -10, because: 'men died' },
      { tag: 'mercy.shown', w: 12, because: 'you took in someone who could not repay it' },
      { tag: 'hand.flogged', w: -10, because: 'a man was flogged and he had to mend him' },
      { tag: 'hand.hanged', w: -12, because: 'a man was hanged at the yardarm' },
      { tag: 'mutiny.conceded', w: 4, because: 'you heard the men out' },
      { tag: 'ship.succoured', w: 10, because: 'you went alongside a ship in distress' },
      { tag: 'ship.abandoned', w: -12, because: 'you held your course past a ship in distress' },
      { tag: 'hostage.ill', w: -8, because: 'a hostage lived ill in your care' },
      { tag: 'hostage.raised', w: 6, because: 'a hostage was raised well' },
      { tag: 'hostage.died', w: -12, because: 'a chief’s son died in your keeping' },
      { tag: 'officer.died', w: -5, because: 'an officer was lost' },
      { tag: 'journey.lost', w: -8, because: 'a man sent inland never came down' },
      { tag: 'companion.lied_to', w: -6, because: 'you made an officer write a lie' },
      { tag: 'books.cooked', w: -10, because: 'the dead were entered as something else' },
      { tag: 'books.honest', w: 8, because: 'the muster was kept honest' },
      { tag: 'fact.checked', w: 4, because: 'you asked a second man before you believed it' },
      { tag: 'promise.kept', w: 4, because: 'you kept your word' },
    ],
    dissent: [
      'I have the book of them, sir. Every man, and what he died of in my hand and what he died of in the muster. I should be glad if the two did not have to differ again.',
      'I would be a poor surgeon if I did not say it plainly: the men are being spent, and I am the one who writes down the price.',
    ],
    exit: {
      consequence: 'report', end: 'estranged',
      leaves: 'He has the book of them in a canvas bag and he does not say what he means to do with it. "I will not be a party to the arithmetic, sir. There is a physician at the Casa who has asked me for it twice."',
    },
  },
  {
    key: 'sintra',
    want: 'To draw the coast as it is, once, whole, in one man’s hand.',
    fear: 'Seeing his drawings in a rival’s book under another man’s name.',
    line: 'He will not draw a coast he has not seen.',
    weights: [
      { tag: 'landmark.surveyed', w: 14, because: 'you stood in and surveyed a landmark properly' },
      { tag: 'landmark.passed', w: -8, because: 'you passed a landmark and pressed on' },
      { tag: 'name.given', w: 8, because: 'a headland was named on his sheet' },
      { tag: 'chart.copied', w: 4, because: 'you copied a stranger’s coast into your book' },
      { tag: 'chart.bought', w: 3, because: 'you bought a stranger’s sheet' },
      { tag: 'chart.sold', w: -16, because: 'you sold his drawings' },
      { tag: 'chart.shared', w: 8, because: 'you gave the sheets to the Crown under a name' },
      { tag: 'claim.made', w: 6, because: 'you raised a padrão on a coast he had drawn' },
      { tag: 'south.beyond', w: 10, because: 'you took her past the furthest south' },
      { tag: 'landfall.exact', w: 6, because: 'the reckoning held at the landfall' },
      { tag: 'lane.opened', w: 4, because: 'you opened a road inland' },
      { tag: 'hand.hanged', w: -6, because: 'a man was hanged' },
      { tag: 'mutiny.lost', w: -8, because: 'the crew took the ship from you' },
      { tag: 'rumour.true', w: 6, because: 'a report ran true and he saw the coast it named' },
      { tag: 'rumour.false', w: -4, because: 'a report ran to open water' },
      { tag: 'fact.sold', w: -3, because: 'you sold a price sheet' },
    ],
    dissent: [
      'I put the coast on the sheet, sir, and you put the ship where you please. I would be obliged if one of us were allowed to be right in front of the other.',
      'Every headland I draw is a thing I have seen. I cannot say the same, now, of every order I am given.',
    ],
    exit: {
      consequence: 'chart', end: 'betrayed',
      leaves: 'He does not argue. He has the sheets, he says, which are in his hand, which he drew, and the Genoese pay by the league. "I am very sorry, sir. A man must have somewhere to put what he has seen."',
    },
  },
  {
    key: 'anselmo',
    want: 'A mission: a place, a people and the time to learn them.',
    fear: 'The sea of faiths he did not expect, and what it does to a man’s certainties.',
    line: 'He will not baptise a person who cannot understand what is being asked.',
    weights: [
      { tag: 'faith.respected', w: 16, because: 'a people’s worship was left alone' },
      { tag: 'faith.pressed', w: -18, because: 'a people was pressed to the font' },
      { tag: 'mercy.shown', w: 12, because: 'you took in someone who could not repay it' },
      { tag: 'ship.succoured', w: 10, because: 'you went alongside a ship in distress' },
      { tag: 'ship.abandoned', w: -10, because: 'you held your course past a ship in distress' },
      { tag: 'ship.stopped', w: -8, because: 'you boarded and took a stranger' },
      { tag: 'hostage.raised', w: 8, because: 'you raised a chief’s son as your own' },
      { tag: 'hostage.died', w: -16, because: 'a chief’s son died in your keeping' },
      { tag: 'hand.hanged', w: -14, because: 'a man was hanged at the yardarm' },
      { tag: 'hand.flogged', w: -8, because: 'a man was flogged at the capstan' },
      { tag: 'hand.died', w: -5, because: 'men were buried' },
      { tag: 'mutiny.conceded', w: 4, because: 'you heard the men out' },
      { tag: 'promise.kept', w: 6, because: 'you kept your word' },
      { tag: 'promise.broken', w: -8, because: 'you broke your word' },
      { tag: 'table.kept', w: 6, because: 'you kept a host’s table' },
      { tag: 'silent.blood', w: -12, because: 'blood was shed on a beach that trusted you' },
      { tag: 'peace.made', w: 8, because: 'you made a peace' },
      { tag: 'parcel.carried', w: -8, because: 'you carried a parcel and asked nothing of it' },
      { tag: 'parcel.refused', w: 8, because: 'you refused a parcel and had it entered' },
      { tag: 'refusal.honest', w: 6, because: 'you refused honestly and kept the friend' },
    ],
    dissent: [
      'You will forgive a priest for asking, sir. The thing we are doing, with the guns run out and the book open: is it the thing I was told it was?',
      'I have heard confession from the men for two years, sir. They tell me what they have done for you, and I am growing less certain what I may absolve.',
    ],
    exit: {
      consequence: 'report', end: 'estranged',
      leaves: 'He says the mass in the morning as he always has, and at the end of it he asks to be put ashore, quietly, in front of the men. "I should not like to go on in a ship I cannot bless, sir. There is a bishop who will want to hear why."',
    },
  },
  {
    key: 'pais',
    want: 'A clean book that clears his name, and a House of his own to keep it in.',
    fear: 'Being the one blamed for what the captain wrote.',
    line: 'He will not sign a false count.',
    weights: [
      { tag: 'books.honest', w: 14, because: 'the books were kept straight' },
      { tag: 'books.cooked', w: -20, because: 'you had him cook the book' },
      { tag: 'weights.false', w: -14, because: 'you let the weights stand false' },
      { tag: 'weights.fair', w: 10, because: 'you dealt by honest weights' },
      { tag: 'smuggle.caught', w: -14, because: 'the weigh-house found goods that were not in his book' },
      { tag: 'smuggle.escaped', w: -6, because: 'goods were landed that were not in his book' },
      { tag: 'parcel.carried', w: -8, because: 'you carried a parcel unwritten' },
      { tag: 'parcel.redeemed', w: 10, because: 'a parcel was brought to the weigh-house' },
      { tag: 'parcel.refused', w: 8, because: 'you refused a parcel and had it entered' },
      { tag: 'contract.kept', w: 6, because: 'you delivered your contracts' },
      { tag: 'contract.broken', w: -8, because: 'a contract ran out undelivered' },
      { tag: 'commission.delivered', w: 8, because: 'you delivered the charter' },
      { tag: 'commission.failed', w: -8, because: 'a charter failed' },
      { tag: 'loan.repaid', w: 8, because: 'you paid what you owed' },
      { tag: 'loan.defaulted', w: -12, because: 'a loan went bad against your name' },
      { tag: 'companion.lied_to', w: -12, because: 'you made an officer write a lie' },
      { tag: 'crown.reported', w: 8, because: 'you reported to the King’s factor' },
      { tag: 'patent.completed', w: 8, because: 'you discharged a commission for the Crown' },
      { tag: 'order.breached', w: -8, because: 'you let an interloper alone against your commission' },
    ],
    dissent: [
      'I am obliged to say, sir, that the book and the ship do not presently agree, and that the Casa will believe the book.',
      'I am the Crown’s man aboard, sir, and I have never pretended otherwise. I should like it noted that I said so before the matter was put to the vote.',
    ],
    exit: {
      consequence: 'report', end: 'betrayed',
      leaves: 'He has been writing for three nights. At the quay he asks leave to deliver a packet to the Casa’s factor himself, and when you ask what is in it he tells you, as he would tell the factor, in order and without adjectives.',
    },
  },
  {
    key: 'lingua',
    want: 'To be heard before the captain acts, and called by his own name.',
    fear: 'Being blamed at a court for words he only carried.',
    line: 'He will not carry a lie to a court.',
    weights: [
      { tag: 'courtesy.kept', w: 10, because: 'you asked before you acted' },
      { tag: 'courtesy.broken', w: -10, because: 'you stood where a stranger should have bowed' },
      { tag: 'table.kept', w: 8, because: 'you kept a host’s table' },
      { tag: 'table.spoiled', w: -10, because: 'you spoiled a host’s table' },
      { tag: 'gift.great', w: 6, because: 'your gifts were praised' },
      { tag: 'gift.insult', w: -10, because: 'your gifts were mocked and he had to say what they were' },
      { tag: 'promise.kept', w: 12, because: 'you kept the word he carried' },
      { tag: 'promise.broken', w: -16, because: 'you broke the word he carried' },
      { tag: 'refusal.honest', w: 10, because: 'you refused honestly' },
      { tag: 'judgement.just', w: 8, because: 'you judged justly in an open court' },
      { tag: 'judgement.unjust', w: -10, because: 'you gave a ruling that would not stand' },
      { tag: 'peace.made', w: 8, because: 'you made a peace through his mouth' },
      { tag: 'hostage.died', w: -12, because: 'a chief’s son died in your keeping' },
      { tag: 'silent.fair', w: 6, because: 'you dealt fair on the mat' },
      { tag: 'silent.blood', w: -12, because: 'blood was shed on a beach that trusted you' },
      { tag: 'faith.respected', w: 8, because: 'a people’s worship was left alone' },
      { tag: 'faith.pressed', w: -10, because: 'a people was pressed to the font' },
      { tag: 'companion.freed', w: 8, because: 'you freed a man who served against his will' },
    ],
    dissent: [
      'At the last court I said what you told me to, sir, in the words you told me. I would like to be asked, next time, whether they will mean the same thing to him.',
      'I am the only man aboard who has to look them in the face afterward, sir. I should be glad if that were weighed.',
    ],
    exit: {
      consequence: 'gossip', end: 'estranged',
      leaves: 'He asks to be put ashore at the next port where his people have a quay. He has not said what he will say of you there, and it is some time before you notice that he has not needed to.',
    },
  },
  {
    key: 'hamisi',
    want: 'To take a ship across the whole monsoon sea and be named for it in the pilots’ books as a mu’allim, not as somebody’s man.',
    fear: 'That the ship he steers will be the one that stops his cousins’ dhows at sea.',
    line: 'He will not conn a ship onto a dhow he could name.',
    weights: [
      { tag: 'ship.stopped', w: -20, because: 'you stopped a ship of the sea he comes from', where: notChristian },
      { tag: 'ship.spared', w: 10, because: 'you let a ship of his coast go', where: notChristian },
      { tag: 'ship.succoured', w: 16, because: 'you went alongside a dhow in distress', where: notChristian },
      { tag: 'ship.abandoned', w: -8, because: 'you held your course past a ship in distress' },
      { tag: 'parcel.carried', w: -10, because: 'you carried a parcel, and he knows what such parcels are' },
      { tag: 'parcel.refused', w: 10, because: 'you refused a parcel and had it entered' },
      { tag: 'parcel.redeemed', w: 6, because: 'a parcel was brought to the weigh-house' },
      { tag: 'gift.insult', w: -14, because: 'you insulted a court of his coast with your gifts', where: hisPeople },
      { tag: 'gift.great', w: 8, because: 'your gifts were praised on his coast', where: hisPeople },
      { tag: 'table.spoiled', w: -8, because: 'you spoiled a table on his coast', where: hisPeople },
      { tag: 'table.kept', w: 8, because: 'you kept a table on his coast', where: hisPeople },
      { tag: 'courtesy.broken', w: -8, because: 'you stood where a stranger should have bowed', where: hisPeople },
      { tag: 'courtesy.kept', w: 6, because: 'you asked before you acted on his coast', where: hisPeople },
      { tag: 'promise.broken', w: -16, because: 'you broke your word to a court of his coast', where: hisPeople },
      { tag: 'promise.kept', w: 12, because: 'you kept your word to a court of his coast', where: hisPeople },
      { tag: 'hostage.died', w: -20, because: 'a chief’s son died in your keeping', where: hisPeople },
      { tag: 'hostage.freed', w: 10, because: 'you sent a hostage home' },
      { tag: 'weights.false', w: -8, because: 'you let the weights stand false', where: hisPeople },
      { tag: 'silent.blood', w: -8, because: 'blood was shed on a beach that trusted you' },
      { tag: 'peace.made', w: 10, because: 'you made a peace between coasts', where: hisPeople },
      { tag: 'pilot.trusted', w: 8, because: 'you read a pilot right' },
      { tag: 'pilot.misled', w: -6, because: 'you followed a pilot you had not checked' },
      { tag: 'companion.kept', w: -10, because: 'you kept a man aboard who would have gone' },
      { tag: 'companion.freed', w: 10, because: 'you let a man go who asked to go' },
    ],
    dissent: [
      'You are the captain, and I am a pilot, and the sea does not care for either. But I will say this once in front of the others: I have not learned to tell a man to hold his course while his cousins are on the other side of it.',
      'In my country we say a ship carries what her master has agreed to. I have begun to ask what this one has agreed to, and with whom.',
    ],
    exit: {
      consequence: 'gossip', end: 'estranged',
      leaves: 'He does not leave in anger, which is worse. He asks for the boat at the next quay and he takes only his kamal and the cord. "The pilots of the coast will want to know what kind of ship this is, and I will not tell them anything that is not so. I find that is enough."',
    },
  },
  // Anyone else: a hired man, a mate raised from the fo'c'sle, a generated officer
  // in an older save. Short and general, because there is little to remember them by.
  {
    key: 'hired',
    want: 'His pay on the day, and to come home.',
    fear: 'A voyage that ends with the wages owing.',
    line: 'He will not be made to answer for another man’s order.',
    weights: [
      { tag: 'hand.died', w: -6, because: 'men were buried' },
      { tag: 'hand.flogged', w: -5, because: 'a man was flogged' },
      { tag: 'hand.hanged', w: -8, because: 'a man was hanged' },
      { tag: 'mutiny.conceded', w: 3, because: 'you heard the men out' },
      { tag: 'mutiny.lost', w: -10, because: 'the crew took the ship from you' },
      { tag: 'mercy.shown', w: 8, because: 'you took in someone who could not repay it' },
      { tag: 'ship.succoured', w: 6, because: 'you went alongside a ship in distress' },
      { tag: 'ship.abandoned', w: -6, because: 'you held your course past a ship in distress' },
      { tag: 'promise.kept', w: 6, because: 'you kept your word' },
      { tag: 'promise.broken', w: -8, because: 'you broke your word' },
      { tag: 'commission.delivered', w: 6, because: 'you delivered the charter' },
      { tag: 'commission.failed', w: -6, because: 'a charter failed' },
      { tag: 'loan.defaulted', w: -8, because: 'a loan went bad against your name' },
      { tag: 'companion.lied_to', w: -6, because: 'you made an officer write a lie' },
    ],
    dissent: [
      'I was engaged for a voyage, sir, not for this. I will do the work.',
      'It is not for me to say, sir, and I am saying it.',
    ],
    exit: {
      consequence: 'gossip', end: 'estranged',
      leaves: 'He asks for his wages and the boat, in that order, and is gone before the watch changes.',
    },
  },
];

export const COMPANION_BY_KEY = new Map(COMPANIONS.map((c) => [c.key, c]));
