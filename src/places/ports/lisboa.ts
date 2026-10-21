import { clamp } from '../../core/math';
import type { Game } from '../../game/state';
import type { YearReport } from '../../game/year';
import { mark, scene } from '../kit';
import type { ArcBeat, CalendarEntry, DeepPort, MemoryDef, PatronDef } from '../types';

/**
 * LISBOA, the Tagus, the Casa and the Rua Nova: a Deep port (BUILD_PLAN D6).
 *
 * Lisbon has three Patrons, one for each of the houses a career answers to (the Crown, the Church and the Rua Nova money of
 * BUILD_PLAN D5), and they are people before they are offices: Fernão Vaz, a clerk of the Casa; Frei Diogo, bursar of the Order of
 * Christ; and Branca Nunes, who runs a money-changer's table on the Rua Nova. D5 reads their tracks for "patron of record"; this
 * file only writes who they are, what each gives, and how each answers the Ledger. The winter-quarters panel and the homecoming card
 * of the Year (game/year.ts) are not separate cards here: the Fort & Court shows the quarters beside Fernão's reading of the
 * book, and the homecoming card carries the three patrons' answers to the year.
 *
 * SOURCES AND WHAT IS INVENTED (docs/SOURCES.md, "Arguim, Melinde, Calecute and Lisbon as Deep ports (D6)"):
 *   documented  Lisbon as the Crown's port, with the Casa da Mina and Casa dos Escravos in the Ribeira; the Rua Nova dos Mercadores
 *               as the street of Lisbon's merchants and money-changers, with Florentine, Genoese and New Christian houses; the
 *               Order of Christ, seated at Tomar, which held the spiritual jurisdiction of the lands discovered by Portugal
 *               (the bull Romanus Pontifex, 1455) and drew its revenues from them; conversos fleeing the Castilian Inquisition
 *               (founded 1478-80) into Portugal; the expulsion from Castile (1492) and João II's admission of refugees for a fee;
 *               the Edict of December 1496 and the forced conversions of 1497; Corpus Christi processions at Lisbon with
 *               St George on horseback; Lent; Santo António, Lisbon's saint, on 13 June; plague outbreaks in Lisbon.
 *   approximate the months of the Mina ships' arrival at Lisbon (May and November); Lisbon's summer pestilence.
 *   invented    Fernão Vaz, Frei Diogo, Branca Nunes (a New Christian widow), her late husband, her nephew Isaac, her cousin at
 *               Funchal, the parcel and the letter of credit; all sums; the chaplain Frei Lourenço.
 */

const FERNAO: PatronDef = {
  id: 'fernao', name: 'Fernão Vaz', title: 'clerk of the Casa da Mina', of: 'of the Ribeira, who reads every captain’s book before the captain has finished writing it',
  bio: [
    'Fernão Vaz has been at the Casa for twenty years and at the same desk for eighteen. He writes a clear hand. He reads a clearer one. He keeps the ledger of the ships that come home and the one of the ships that did not, and he knows which captains have a way with a rounded figure.',
    'He does not love the Crown and does not hate it: he is its instrument, and takes the care of a man who has seen what happens to an instrument that gets ideas. He is one of the few men on the Ribeira who will tell you what the Casa really thinks.',
    'He is honest with the books, which in a Casa clerk is rare enough to be his whole reputation, and is wary of captains who are the same, for it makes them hard to predict.',
  ],
  visitWeight: 0.5, visitCap: 2.0,
  thresholds: [1.2, 3.2, 5.8],
  rules: [
    { tag: 'books.honest', weight: 1.4, anywhere: true, why: 'Kept the King’s books straight when a false line was easy. A clerk notices.' },
    { tag: 'books.cooked', weight: -2.2, anywhere: true, why: 'Had a book cooked. It is in a clerk’s hand and not in his heart, and he will remember it.' },
    { tag: 'commission.delivered', weight: 1.0, anywhere: true, why: 'Delivered a charter on time.' },
    { tag: 'commission.failed', weight: -1.0, anywhere: true, why: 'Failed a charter.' },
    { tag: 'patent.completed', weight: 1.2, anywhere: true, why: 'Completed a patent or commission from the Crown.' },
    { tag: 'crown.reported', weight: 0.8, anywhere: true, why: 'Reported to the King’s factor with the voyage’s findings.' },
    { tag: 'patron.honest', weight: 1.0, anywhere: true, why: 'Told the King the plain truth in a letter.' },
    { tag: 'patron.flattered', weight: -0.8, anywhere: true, why: 'Sent the King a cheerful letter that left out the truth.' },
    { tag: 'chart.shared', weight: 0.9, anywhere: true, why: 'Gave the Casa a survey or a roteiro.' },
    { tag: 'chart.sold', weight: -1.4, anywhere: true, why: 'Sold a survey to another flag or house. It was the Casa’s to be asked first.' },
    { tag: 'smuggle.caught', weight: -2.0, anywhere: true, why: 'Landed goods the weigh-house found.' },
    { tag: 'contraband.run', weight: -0.8, anywhere: true, why: 'Sold the King’s goods to a buyer who is not the King.' },
    { tag: 'parcel.redeemed', weight: 0.8, anywhere: true, why: 'Took a parcel and declared it, paying the King’s share.' },
    { tag: 'order.breached', weight: -1.2, anywhere: true, why: 'Let an interloper alone against the letter of a commission.' },
    { tag: 'claim.made', weight: 0.7, anywhere: true, why: 'Raised a padrão and claimed a headland for the Crown.' },
    { tag: 'south.beyond', weight: 0.6, anywhere: true, why: 'Passed the furthest south any Christian had been.' },
    { tag: 'voyage.home', weight: 0.35, why: 'Came home. The Casa trusts the ships that return.' },
    { tag: 'promise.kept', weight: 0.5, anywhere: true, why: 'A word given and kept.' },
    { tag: 'promise.broken', weight: -1.0, anywhere: true, why: 'A word broken.' },
  ],
  greet: {
    stranger: 'A clerk at the Casa’s outer table looks up from his ledger at the ship’s name, and down again. He does not offer a seat.',
    acquaintance: 'Fernão Vaz nods as you come into the Casa. He has your voyage in a column, and says so, in the voice of a man reading out a weight.',
    trusted: 'Fernão Vaz stands, which he does for few. He tells you what the Casa has heard of the road since you were last at the desk, and asks for no return.',
    partner: 'Fernão Vaz closes the ledger as you come in and says he has been wishing to speak to you. It is the first time you have known him wish for anything.',
  },
  rise: {
    acquaintance: 'Fernão Vaz has begun to say good morning, which his juniors have noticed.',
    trusted: 'Fernão Vaz says the Casa reads your book before the others’. He says it is not a favour, only a matter of order, and is plainly pleased.',
    partner: 'Fernão Vaz speaks of "your" voyages in front of the Provedor’s man. The Provedor’s man writes it down.',
  },
  reactions: {
    'books.honest': 'Fernão Vaz has read the corrected line in your book. He says the Casa has a reputation for the opposite, and that he would be glad to see it change.',
    'books.cooked': 'Fernão Vaz says nothing of the count. He counts twice, at his desk, in front of you, and puts the pen down.',
    'commission.delivered': 'Fernão Vaz has the charter closed in the Casa’s book. He tells you it was on time, which is the only praise the book has a column for.',
    'commission.failed': 'Fernão Vaz has the failed charter in the Casa’s book. He tells you the figure and the date, and nothing else.',
    'patent.completed': 'Fernão Vaz says the Crown has what it asked for. He says the Crown has a long memory for who gave it, and that the memory is mostly in his hand.',
    'chart.shared': 'Fernão Vaz has your sheet under his glass. He says it is the best the Casa has had of that coast, and asks whether it may keep your name on it.',
    'chart.sold': 'Fernão Vaz says the Casa has seen your sheet in another man’s hands. He does not ask how it got there. He asks for a copy.',
    'smuggle.caught': 'Fernão Vaz has the weigh-house’s note. He reads it out, in full, to the end.',
    'patron.honest': 'Fernão Vaz says the King had the truth from you once, in your own hand. He says it is a long time since the King could say that of any captain.',
  },
  perks: [
    { id: 'word', stage: 'acquaintance', kind: 'rumour', text: 'Once a call he will tell you what the Casa has heard from the ships that have come in: the Court at home, the kingdom’s mood, who is favoured and who is not.' },
    { id: 'dues-1', stage: 'trusted', kind: 'dues', value: 0.96, text: 'The weigh-house takes four parts in a hundred less of a ship its clerk reads before the others.' },
    { id: 'dues-2', stage: 'partner', kind: 'dues', value: 0.92, supersedes: 'dues-1', text: 'The weigh-house takes eight parts in a hundred less of a ship its clerk reads before the others.' },
    { id: 'clause', stage: 'trusted', kind: 'hint', text: 'He will tell you what the Casa has recorded of each court’s grants: which have given free dues, berth and watering rights or a pilot loan, to whom, and what they were paid. The clause view will read it.' },
    { id: 'second', stage: 'partner', kind: 'rumour', text: 'The Casa’s clerks at Lisbon will say whether a tale of the Atlantic coast is told the same way in the books. No charge.' },
  ],
  front: 'court',
};

const BRANCA: PatronDef = {
  id: 'branca', name: 'Branca Nunes', title: 'money-changer of the Rua Nova', of: 'a New Christian widow who keeps her dead husband’s table, and his name on the sign',
  bio: [
    'Branca Nunes took over her husband’s table on the Rua Nova eleven years ago and has doubled it. She lends against ships, and against captains, and she has been wrong about the first more often than the second.',
    'She is a New Christian: her family was baptised in her grandfather’s day, and she hears the street’s opinion of that every time she signs a bill. She has decided not to let it matter, and has a cousin at Funchal who has decided otherwise.',
    'She lends to people who tell her the odds. She says that a captain who will tell her what could go wrong is one she can price; one who will not is one she has to guess at, and she is a poor guesser.',
  ],
  visitWeight: 0.35, visitCap: 1.4,
  thresholds: [1.0, 3.0, 5.5],
  rules: [
    { tag: 'loan.repaid', weight: 1.6, anywhere: true, why: 'Repaid a loan to a House on the Rua Nova. Her whole trade is knowing who will.' },
    { tag: 'loan.defaulted', weight: -3.0, anywhere: true, why: 'A loan went bad against your name. Your name is in a book on the Rua Nova that is never closed.' },
    { tag: 'loan.taken', weight: 0.3, anywhere: true, why: 'Took money against a voyage, which is what a House is for.' },
    { tag: 'contract.kept', weight: 1.0, anywhere: true, why: 'Delivered a goods contract to a House.' },
    { tag: 'contract.broken', weight: -1.4, anywhere: true, why: 'Let a goods contract run out undelivered.' },
    { tag: 'commission.delivered', weight: 0.6, anywhere: true, why: 'Delivered a charter on time. The Rua Nova hears.' },
    { tag: 'commission.failed', weight: -0.8, anywhere: true, why: 'Failed a charter.' },
    { tag: 'port.funded', weight: 0.9, anywhere: true, why: 'Put a House at a port. Every House is an agent she can lend through.' },
    { tag: 'books.honest', weight: 0.7, anywhere: true, why: 'Kept the books straight.' },
    { tag: 'books.cooked', weight: -1.0, anywhere: true, why: 'Had a book cooked. Hers are the books that pay for it.' },
    { tag: 'parcel.carried', weight: 0.5, anywhere: true, why: 'Carried a parcel for a man of standing without a question; she lends to people who do.' },
    { tag: 'parcel.redeemed', weight: 0.3, anywhere: true, why: 'Took a parcel and declared it.' },
    { tag: 'smuggle.caught', weight: -1.0, anywhere: true, why: 'Was caught running goods past the weigh-house. A House pays a fine too.' },
    { tag: 'mercy.shown', weight: 0.4, anywhere: true, why: 'Took in or paid for someone who could not repay.' },
    { tag: 'promise.kept', weight: 0.8, anywhere: true, why: 'A word given and kept.' },
    { tag: 'promise.broken', weight: -1.8, anywhere: true, why: 'A word broken. She lends on words.' },
    { tag: 'faith.pressed', weight: -0.6, anywhere: true, why: 'Pressed the font on a people who had not asked. She knows how that is remembered in a family.' },
  ],
  greet: {
    stranger: 'A woman at a long table on the Rua Nova glances at the ship’s name on your sleeve, and returns to a bill. Her clerk says the table is busy this week.',
    acquaintance: 'Branca Nunes looks up, and has the clerk bring a stool. She knows the ship, and what she carried, and says so briefly.',
    trusted: 'Branca Nunes has her own chair brought round to the front of the table, and sends the clerk for wine. She asks after the voyage, and wants the odds.',
    partner: 'Branca Nunes closes the book and takes you through to the room behind the shop, where the real ledgers are kept and no one is ever invited.',
  },
  rise: {
    acquaintance: 'Branca Nunes has begun to write your name in the margin of her book, in pencil.',
    trusted: 'Branca Nunes says her table will lend to this ship before it lends to the Casa’s favourites. She says it with her eyes on the bill.',
    partner: 'Branca Nunes says "we" to the Florentine at the next table, of you and of herself, and the Florentine looks at his bill.',
  },
  reactions: {
    'loan.repaid': 'Branca Nunes has the repayment in her book. She says the bill was paid on the day and the interest to the maravedi, and she says it twice, to hear how it sounds.',
    'loan.defaulted': 'Branca Nunes does not look up from the table. Her clerk says the table has no credit to offer this week, or the next.',
    'contract.kept': 'Branca Nunes has heard the contract was delivered. She says the Rua Nova prices a delivered contract at about a tenth more than a promised one.',
    'contract.broken': 'Branca Nunes has heard of the contract that ran out. She names the House that wrote it, and the sum.',
    'port.funded': 'Branca Nunes has heard that you put a House at a new port. She asks for its name, and writes it on a slip she then folds away.',
    'books.cooked': 'Branca Nunes has heard that a count moved in a book. She says it with great gentleness, and then asks to see yours.',
    'promise.broken': 'Branca Nunes does not mention the word. She puts down the bill and looks at the ship’s name on your sleeve for a while.',
    'parcel.carried': 'Branca Nunes has heard you carried a parcel without asking what was in it. She says there is a kind of man who is the better for it, and a kind who is not, and that she cannot yet tell which you are.',
  },
  perks: [
    { id: 'hint', stage: 'acquaintance', kind: 'hint', text: 'She will tell you on what terms a House on the Rua Nova lends to a ship: at what odds, against what cargo and with what cut for the House.' },
    { id: 'credit-1', stage: 'trusted', kind: 'credit', value: 300, text: 'Her table will let a note run against your name while you lie at Lisbon: up to 300 cruzados.' },
    { id: 'credit-2', stage: 'partner', kind: 'credit', value: 600, supersedes: 'credit-1', text: 'Her table will let a note run against your name while you lie at Lisbon: up to 600 cruzados.' },
    { id: 'house', stage: 'partner', kind: 'house', value: 0.8, text: 'A House costs a fifth less to found: the Rua Nova stands surety for the ground, and she does not ask for the name of the port.' },
    { id: 'agents', stage: 'trusted', kind: 'hint', text: 'She will name a House at your next port, if she has one, whose factor can be trusted with a Line; the Line view will read it.' },
  ],
  front: 'court',
};

const DIOGO: PatronDef = {
  id: 'diogo', name: 'Frei Diogo', title: 'bursar of the Order of Christ', of: 'of Tomar, who keeps the Order’s accounts and its conscience in that order',
  bio: [
    'Frei Diogo came to the Order from the sea, as a younger son and a ship’s chaplain, and has kept its books for twenty years. The Order draws money from every ship that goes south, and spends part of it on churches, on friars, and on a school at Tomar where boys from Africa learn the letters.',
    'He believes the faith should be carried. He also believes it should be carried by persuasion, which the Church holds and the captains of the road do not always remember, and he has put his name to more than one letter that said so.',
    'He is a man who has been told what the Order is paid from, and has decided to be the sort of friar who keeps that fact where he can see it.',
  ],
  visitWeight: 0.3, visitCap: 1.2,
  thresholds: [1.0, 3.0, 5.5],
  rules: [
    { tag: 'mercy.shown', weight: 1.4, anywhere: true, why: 'Took in, nursed or paid for someone who could not repay.' },
    { tag: 'person.redeemed', weight: 1.4, anywhere: true, why: 'Bought a named person out of the trade and set them free.' },
    { tag: 'faith.respected', weight: 0.6, anywhere: true, why: 'Let a people keep its worship until it asked for another. The Church holds that baptism cannot be forced.' },
    { tag: 'faith.pressed', weight: -1.2, anywhere: true, why: 'Pressed baptism or the faith on a people who had not asked. The canons forbid it, and he has said so in writing.' },
    { tag: 'hearing.contested', weight: 0.9, anywhere: true, why: 'Put a question about the trade in the open to a court.' },
    { tag: 'traffic.refused', weight: 0.9, anywhere: true, why: 'Refused to carry people for sale, and paid for it.' },
    { tag: 'traffic.carried', weight: -0.6, anywhere: true, why: 'Carried people for sale. He has a column for these too.' },
    { tag: 'passenger.died', weight: -0.8, anywhere: true, why: 'People carried aboard died on the passage. They are in the muster, and he reads the muster.' },
    { tag: 'practice.changed', weight: 1.0, anywhere: true, why: 'Changed how the trade is done at a place, at real cost.' },
    { tag: 'companion.freed', weight: 0.7, anywhere: true, why: 'Freed a man who served aboard against his will.' },
    { tag: 'hostage.freed', weight: 0.4, anywhere: true, why: 'Bought a hostage out and sent him home.' },
    { tag: 'hostage.died', weight: -1.2, anywhere: true, why: 'A chief’s son died in your keeping.' },
    { tag: 'ship.succoured', weight: 0.7, anywhere: true, why: 'Went to the help of a ship in distress.' },
    { tag: 'ship.abandoned', weight: -1.2, anywhere: true, why: 'Held your course past a ship in distress.' },
    { tag: 'claim.made', weight: 0.5, anywhere: true, why: 'Raised a padrão with the Order’s cross on it.' },
    { tag: 'south.beyond', weight: 0.4, anywhere: true, why: 'Went further south than any Christian had been.' },
    { tag: 'promise.kept', weight: 0.7, anywhere: true, why: 'A word given and kept.' },
    { tag: 'promise.broken', weight: -1.5, anywhere: true, why: 'A word broken.' },
    { tag: 'hand.flogged', weight: -0.2, anywhere: true, why: 'Had a man flogged at the capstan.' },
  ],
  greet: {
    stranger: 'A friar in the white mantle of the Order, red cross on the breast, is crossing the Ribeira with a purse and a boy with a ledger. He glances at the ship and goes on.',
    acquaintance: 'Frei Diogo stops, at the head of the stairs, and asks the ship’s name. He asks, and then waits for the answer.',
    trusted: 'Frei Diogo walks down to the quay himself. He asks after the company, one man at a time, by name.',
    partner: 'Frei Diogo meets you at the door of the Order’s house on the Ribeira and does not take the purse he has in his hand. He says there are things he would rather say before the ship sails.',
  },
  rise: {
    acquaintance: 'Frei Diogo has begun to say the ship’s name when he blesses the fleet.',
    trusted: 'Frei Diogo says the Order keeps a place in its prayers for the company. He says it is a small place and a real one.',
    partner: 'Frei Diogo says "your ship" in front of the Order’s commander, with a particular emphasis, and the commander is silent.',
  },
  reactions: {
    'mercy.shown': 'Frei Diogo has heard what you did for the man who could not repay. He asks what it cost, and writes the sum down, as if it were the Order’s.',
    'person.redeemed': 'Frei Diogo has heard that you bought a person home. He says the Order has spent more on less, and wishes it had spent it on this.',
    'faith.pressed': 'Frei Diogo has heard what was done at the font. He says the canons are plain and the sea is far, and that he is ashamed on behalf of both.',
    'faith.respected': 'Frei Diogo has heard that you let a people keep their worship. He says that is the Church’s teaching, and that he has not often seen it kept by a captain.',
    'traffic.refused': 'Frei Diogo has heard that you refused the freight. He says it cost the Order too, in a small way, and that he is glad of it.',
    'hearing.contested': 'Frei Diogo has a copy of the question you put at the Castle. He says he has been wanting someone to put it for ten years.',
    'passenger.died': 'Frei Diogo has the count of those who died on the passage. He reads it out to you, and asks if it is right.',
    'ship.abandoned': 'Frei Diogo says nothing of the ship in distress. He says Mass for her company, in your hearing.',
  },
  perks: [
    { id: 'word', stage: 'acquaintance', kind: 'rumour', text: 'Once a call he will tell you what the Order hears from its friars on the coasts: the missions, the chiefs who have asked for baptism and why, and what is said of Prester John.' },
    { id: 'credit', stage: 'trusted', kind: 'credit', value: 120, text: 'The Order will let a note of mission-money run against your name while you lie at Lisbon: up to 120 cruzados, repayable in letters carried.' },
    { id: 'lourenco', stage: 'trusted', kind: 'hire', text: 'Frei Lourenço, a priest of the Order who has been to Ceuta and learned Arabic in a captive’s school, will sail as chaplain if the berth is empty.' },
    { id: 'mission', stage: 'partner', kind: 'hint', text: 'He will write the Order’s letter to a court that asks for friars: a mission, a church, a school. When D5 names the clause, the grant will be his to ask.' },
  ],
  front: 'claim',
};

const CALENDAR: CalendarEntry[] = [
  {
    id: 'lent', name: 'Lent', kind: 'feast', months: [2, 3], days: [10, 31], grade: 'approximate', morale: 0.04,
    price: { sal: 0.96 },
    text: 'Fish and ash. The Ribeira is shut on Fridays and the friars are everywhere, and the Casa’s clerks are more particular than they would like to be. A ship that is in is expected at the Friday mass.',
  },
  {
    id: 'corpus-christi', name: 'Corpus Christi', kind: 'feast', months: [6], days: [1, 20], grade: 'approximate', morale: 0.05,
    text: 'The great procession through the streets, with the guilds in their order and St George on horseback at the head of it. The Rua Nova is hung with cloth, and nobody does any business that can be put off.',
  },
  {
    id: 'santo-antonio', name: 'Santo António', kind: 'feast', months: [6], days: [12, 14], grade: 'approximate', morale: 0.06,
    text: 'The city’s own saint, on the thirteenth. The hills are lit, the wine runs, and the hands are shoreside until it is over. A captain who is seen to keep it is not forgotten.',
  },
  {
    id: 'mina-ships', name: 'The Mina ships', kind: 'fleet', months: [5, 11], grade: 'invented',
    price: { ouro: 0.97, malagueta: 0.94, marfim: 0.96 },
    text: 'The Casa’s ships from the Mina road are looked for in May and November. While they are in, gold, malagueta and ivory are plentiful at the Ribeira, and the clerks are too busy to be agreeable.',
  },
  {
    id: 'pestilence', name: 'The summer sickness', kind: 'fever', months: [8, 9], grade: 'approximate', fever: 1.3,
    text: 'The river is low and the sickness is in the lower streets. The court goes up to Sintra, the guilds close their shops, and a ship that lies at the Ribeira has her people watched.',
  },
];

const MEMORY: MemoryDef = {
  lines: {
    'loan.repaid': 'On the Rua Nova it is said your bill was paid on the day, to the maravedi. It is a thing money-changers like to repeat.',
    'loan.defaulted': 'Your name is in a book on the Rua Nova that is never closed. The clerks know the page.',
    'books.honest': 'The Casa’s clerks remember a book that was kept straight, and take it down as an example when the juniors are about.',
    'books.cooked': 'The Casa’s clerks remember a count that moved. They count twice when they see your hand.',
    'smuggle.caught': 'The weigh-house remembers what it found in your hold, and so does the street.',
    'patent.completed': 'The Casa has your completed patent in a drawer it opens for visitors.',
    'crown.reported': 'The Casa has your report, and refers to it as a model of its kind.',
    'commission.delivered': 'The Casa’s book has your charter ticked, on time.',
    'commission.failed': 'The Casa’s book has your charter, with a note against it.',
    'contract.kept': 'The Houses of the Rua Nova speak of a captain who delivers a contract.',
    'contract.broken': 'The Houses of the Rua Nova speak of the contract that ran out, and whose it was.',
    'mercy.shown': 'In a tavern on the Tagus they tell of the man you took in. It is told without a name, and everyone knows whose.',
    'faith.pressed': 'The friars of the Order remember who was taken to the font, and have said so in a letter.',
    'port.funded': 'The Houses of the Rua Nova have your station on their list of places where a bill will be honoured.',
    'voyage.home': 'The Casa’s clerks have your voyages in a column, with a tick for each one that came home.',
  },
  effects: [
    { tag: 'loan.repaid', dues: -0.03, regard: 0.1 },
    { tag: 'loan.defaulted', dues: 0.08, regard: -0.3 },
    { tag: 'books.honest', dues: -0.03, regard: 0.08 },
    { tag: 'books.cooked', dues: 0.05, regard: -0.15 },
    { tag: 'smuggle.caught', dues: 0.1, regard: -0.25 },
    { tag: 'patent.completed', dues: -0.03, regard: 0.15 },
    { tag: 'commission.delivered', dues: -0.02, regard: 0.08 },
    { tag: 'commission.failed', dues: 0.02, regard: -0.1 },
    { tag: 'contract.kept', regard: 0.06 },
    { tag: 'contract.broken', dues: 0.03, regard: -0.12 },
    { tag: 'mercy.shown', regard: 0.08 },
    { tag: 'faith.pressed', regard: -0.12 },
    { tag: 'voyage.home', regard: 0.04 },
  ],
};

// ---------------------------------------------------------------------------------------------
// The year: the homecoming card and the winter-quarters panel (game/year.ts) get their Lisbon voice here, not a card of their own.

/** The three patrons' answers to the year's book, for the homecoming card: at most three lines, whichever are worth saying. */
export function homecomingWord(g: Game, r: YearReport): string[] {
  const out: string[] = [];
  const profit = r.purseDelta;
  out.push(profit >= 0
    ? `Fernão Vaz has the year's book open at the Casa before the ship is made fast. He reads out the figure, and, because the figure is good, nothing else.`
    : `Fernão Vaz has the year's book open at the Casa before the ship is made fast. He reads out the loss, and the column it came from, without comment.`);
  if (r.deaths > 0) out.push(`Frei Diogo is on the quay with the Order's cross on his breast. He asks for the names of the ${r.deaths === 1 ? 'one' : r.deaths} who did not come home, and writes them in the Order's book.`);
  else if (profit > 100) out.push('Branca Nunes sends a boy with a note: the table is open to the ship whenever she wants it, and the clerk has the odds.');
  void g;
  return out.slice(0, 3);
}

/** What the Lisbon patrons have to put to the captain, for the "Patron" line of the winter-quarters panel. */
export function lisbonBusiness(g: Game): string {
  const p = (id: string): boolean => {
    const t = g.powers.seen[`place:patron:lisboa:${id}:stage`];
    return t !== undefined && t >= 2;
  };
  const arc = ['lisboa-arc-1', 'lisboa-arc-2', 'lisboa-arc-3', 'lisboa-arc-4'].filter((b) => g.powers.seen[`place:${b}`] !== undefined).length;
  if (arc === 4) return 'Branca Nunes’s matter is closed. Fernão Vaz and Frei Diogo have nothing outstanding. The quarters are yours.';
  if (p('branca')) return 'Branca Nunes has something to put to you, when she trusts the ship enough to raise it. It will come up on a call at her table.';
  return 'Three people at Lisbon would deal with a ship they trusted: Fernão Vaz at the Casa, Branca Nunes on the Rua Nova, Frei Diogo at the Order’s house. The Waterfront says where each stands.';
}

// ---------------------------------------------------------------------------------------------
// The arc: Branca Nunes. Four beats, all had at Lisbon at the end or the start of a voyage; each reward is carried FORWARD (to Funchal,
// the first call out from the Tagus), none requires a return.

const L1 = 'lisboa-arc-1';
const L2 = 'lisboa-arc-2';
const L3 = 'lisboa-arc-3';
const L4 = 'lisboa-arc-4';

const regardAt = (g: Game, port: string, d: number): void => { const r = g.relationsFor(port); r.regard = clamp(r.regard + d, -1, 1); };

export const LISBOA_ARC: ArcBeat[] = [
  {
    id: L1, stage: 'trusted', patron: 'branca',
    build: () => scene(L1, 'The odds',
      'Branca Nunes has two ledgers open on the table: one for the street and one for herself. She turns the second toward you, which she has never done. It shows eleven captains she has lent to and what became of each. Three came home with money. Four came home. Four did not.\n\n'
      + 'She says she does not lend on a captain’s hopes, only on what he says could go wrong. She asks you, as you would be asked by a surgeon, what is the likeliest way the next voyage kills the men and the money, and how likely.',
      [
        {
          label: 'Give her the odds plainly: the ones you would not say to the King',
          detail: 'Honest, and unflattering. She will price the ship on it.',
          resolve: (gg) => {
            mark(gg, L1); gg.powers.seen['lisboa:odds'] = gg.clock.t;
            gg.noteDeed('books.honest', { target: 'lisboa', place: 'lisboa', magnitude: 0.7, note: 'Told Branca Nunes the real odds of the next voyage: the likeliest ways it kills the men and the money, and how likely.' });
            return 'She writes the numbers beside your name, in ink, and says she has not had that written down by a captain in eleven years. She says it will cost you a little interest, and the ship nothing at all.';
          },
        },
        {
          label: 'Give her the best case, and say the rest is God’s',
          detail: 'The cheerful letter. She has read a good many.',
          resolve: (gg) => {
            mark(gg, L1);
            gg.noteDeed('patron.flattered', { target: 'lisboa', place: 'lisboa', magnitude: 0.5, note: 'Gave Branca Nunes the best case for the voyage and left the odds to God.' });
            return 'She writes a figure beside your name in pencil. She says the Rua Nova has a great deal of respect for God, and a good deal more for arithmetic.';
          },
        },
        {
          label: 'Ask what she would like to hear',
          detail: 'Courteous, and it hands her the question. She will think you careful, or evasive.',
          resolve: (gg) => {
            mark(gg, L1);
            gg.noteDeed('refusal.curt', { target: 'lisboa', place: 'lisboa', magnitude: 0.3, note: 'Asked Branca Nunes what she would like to hear of the voyage’s odds.' });
            return 'She laughs shortly. She says that is the question every captain asks, and that the ones who ask it die as often as the others. She closes the second ledger.';
          },
        },
      ]),
  },
  {
    id: L2, stage: 'trusted', patron: 'branca', after: [L1], wait: 60,
    build: () => scene(L2, 'A small parcel for Funchal',
      'Branca Nunes has a parcel wrapped in oilcloth and tied with her husband’s knot. It is small and heavy. It is for her cousin Jorge at Funchal, on the sugar, who has been paying his interest in kind, and who she says has been unwell. She says there is a little money in it, and some letters, and a ring.\n\n'
      + 'She asks you to carry it, and she is careful to say that the Casa’s man at the weigh-house would want to know of it, and that she would rather he did not ask. She leaves the rest to you. She is watching the way you take it from the table.',
      [
        {
          label: 'Carry it, and ask nothing of what is in it',
          detail: 'Funchal is the first call out from the Tagus. A parcel with no questions is a parcel she can use again.',
          resolve: (gg) => {
            mark(gg, L2); gg.powers.seen['lisboa:parcel'] = gg.clock.t;
            regardAt(gg, 'funchal', 0.1);
            gg.noteDeed('parcel.carried', { target: 'funchal', place: 'lisboa', magnitude: 0.5, note: 'Took Branca Nunes’s small parcel to her cousin Jorge at Funchal and asked what was in it of no one.' });
            return 'She hands it over as if it weighed nothing, and says you will be paid in being asked again. It is a hard sum to put in a ledger, and she writes it in hers.';
          },
        },
        {
          label: 'Carry it, and show it at the weigh-house, and pay the King’s share',
          detail: 'Open. The Casa gets its tenth, and Branca pays the figure herself, with a look.',
          resolve: (gg) => {
            mark(gg, L2); gg.powers.seen['lisboa:parcel'] = gg.clock.t;
            regardAt(gg, 'funchal', 0.08);
            gg.noteDeed('parcel.redeemed', { target: 'funchal', place: 'lisboa', magnitude: 0.5, note: 'Took Branca Nunes’s parcel to Funchal, showing it at the weigh-house and paying the King’s share.' });
            return 'The clerk at the weigh-house opens the oilcloth, looks at the ring and the letters, and takes his tenth. Branca Nunes pays it in the Casa’s coin, without a word, and then, outside, says you will make a dull smuggler and a good captain, and that she means both.';
          },
        },
        {
          label: 'Decline: the weigh-house would find it and the ship would pay',
          detail: 'Honest about the risk. She will not take offence, and she will remember the reason.',
          resolve: (gg) => {
            mark(gg, L2);
            gg.noteDeed('parcel.refused', { target: 'lisboa', place: 'lisboa', magnitude: 0.4, note: 'Declined Branca Nunes’s parcel for Funchal; the weigh-house would have found it.' });
            return 'She nods, and takes the parcel back. She says she has had a good many captains accept it and not one say why they would not, and that the second is the more useful to know.';
          },
        },
      ]),
  },
  {
    id: L3, stage: 'partner', patron: 'branca', after: [L2], wait: 60,
    build: (g) => {
      const y = g.clock.date.year;
      const era = y >= 1497 ? 'Since the Edict, the street has been arguing in whispers about who may leave and who must stay, and her family has been asked to be baptised again by priests who baptised them before.'
        : y >= 1492 ? 'Since Castile put out its Jews, families have come over the border with what they could carry, and some have been taken in at the King’s price and some have not; her house has taken in what it could.'
          : 'Since the Holy Office was set up in Castile, families of her own kind have been coming over the border at night, with children and bundles, and the Rua Nova has been arguing about whom it can house.';
      return scene(L3, 'The boy from over the border',
        'Branca Nunes has a boy in the room behind the shop. His name is Isaac, he is fifteen, and he is her late husband’s sister’s son from a town in Castile. ' + era + '\n\n'
        + 'He reads and writes, and can add a column faster than the clerk. He has never been on a ship. She asks you, very simply, whether the ship can carry him to Funchal and set him with her cousin Jorge, who needs a clerk. She will pay his keep. She says that she is not asking for a great thing and that she knows what it might cost the ship if he were found to have come without a licence.',
        [
          {
            label: 'Take him as a ship’s boy to Funchal, and set him with her cousin',
            detail: 'Twenty cruzados for his keep and the paperwork. He is entered in the ship’s book by a name that is his own.',
            resolve: (gg) => {
              mark(gg, L3);
              if (gg.crown.gold < 20) return 'You have not twenty cruzados for his keep. Branca Nunes says the boy will wait, and that she does not hold it against you.';
              gg.crown.gold -= 20;
              gg.powers.seen['lisboa:isaac'] = gg.clock.t;
              regardAt(gg, 'funchal', 0.1);
              gg.noteDeed('mercy.shown', { target: 'funchal', place: 'lisboa', magnitude: 0.7, note: 'Took Branca Nunes’s nephew Isaac, fifteen, from Castile as a ship’s boy to Funchal, and set him with her cousin Jorge.' });
              return 'Isaac stands very straight on the quay with a bundle and says nothing. Branca Nunes does not embrace him in public. She puts her hand on the bundle and says something in a language you do not know, and he goes up the plank.';
            },
          },
          {
            label: 'Say the ship cannot carry a passenger without a licence, and offer to ask at the Casa',
            detail: 'Honest and careful. It may come to nothing; it also may not be known.',
            resolve: (gg) => {
              mark(gg, L3);
              gg.noteDeed('refusal.honest', { target: 'lisboa', place: 'lisboa', magnitude: 0.5, note: 'Told Branca Nunes the ship could not carry her nephew without a licence, and offered to ask at the Casa.' });
              return 'Branca Nunes says that is the answer a careful man gives, and that it is the one she was afraid of, and the one she respects. She will send the boy by another route.';
            },
          },
          {
            label: 'Say it is not a thing a captain can be asked to do',
            detail: 'Plain. She will not ask again.',
            resolve: (gg) => {
              mark(gg, L3);
              gg.noteDeed('refusal.curt', { target: 'lisboa', place: 'lisboa', magnitude: 0.3, note: 'Told Branca Nunes a captain could not be asked to carry her nephew.' });
              return 'Branca Nunes bows her head and says she understands. She says the boy will find another way, and he looks at you across the room as if he has understood it better than she.';
            },
          },
        ]);
    },
  },
  {
    id: L4, stage: 'partner', patron: 'branca', after: [L3], wait: 120,
    build: (g) => {
      const isaac = g.powers.seen['lisboa:isaac'] !== undefined;
      return scene(L4, 'A paper on the Rua Nova',
        (isaac
          ? 'A letter has come from Funchal by the sugar ship. It is from Jorge, and it says in a clerk’s hand that Isaac is learning the planters’ names and the freight, and adds a line in a boy’s hand: the Atlantic is wider than he had been told. Branca Nunes reads it twice and does not read it aloud.\n\n'
          : 'Branca Nunes has had word from her cousin by the sugar ship. It says the boy came by another road. It does not say which. She tells you this before you can ask, and does not look at you while she does.\n\n')
        + 'She takes a paper from the drawer under the table. It is a letter of credit drawn on her cousin’s house at Funchal, in her hand and sealed with her husband’s ring, that any House on the road who knows the Rua Nova may honour for the ship. She says she has written it for the ship and not for the captain, so that it will outlive the one and not the other.',
        [
          {
            label: 'Accept it, and say it will be honoured and not abused',
            detail: 'A letter of credit in the Rua Nova’s hand. It travels forward with the ship.',
            resolve: (gg) => {
              mark(gg, L4); gg.powers.seen['lisboa:credit'] = gg.clock.t;
              gg.noteDeed('promise.kept', { target: 'lisboa', place: 'lisboa', magnitude: 0.6, note: 'Accepted Branca Nunes’s letter of credit for the ship, drawn on her cousin at Funchal, and gave my word it would be honoured and not abused.' });
              gg.crown.lifetimeStanding += 4;
              regardAt(gg, 'funchal', 0.08);
              return 'She folds it into your hand and closes your fingers over it. She says in the street it will be said that Branca Nunes put her name to a captain, and that she is curious how it will go.';
            },
          },
          {
            label: 'Thank her, and say the ship would sooner owe her nothing',
            detail: 'Proud, and it costs you the credit. She will not be offended.',
            resolve: (gg) => {
              mark(gg, L4);
              gg.noteDeed('gift.great', { target: 'lisboa', place: 'lisboa', magnitude: 0.4, note: 'Thanked Branca Nunes for her letter of credit, and declined it, leaving a gift for her table.' });
              return 'She smiles for the first time in the room behind the shop. She says that is a thing a man says before his first bad voyage, and puts the paper back in the drawer, where it will wait.';
            },
          },
        ]);
    },
  },
];

export const LISBOA: DeepPort = {
  port: 'lisboa',
  patron: FERNAO,
  others: [BRANCA, DIOGO],
  calendar: CALENDAR,
  memory: MEMORY,
  arc: LISBOA_ARC,
  invented: [
    'Fernão Vaz (Casa clerk), Branca Nunes (Rua Nova money-changer, a New Christian widow), Frei Diogo (bursar of the Order of Christ) and Frei Lourenço: none stands for a real person',
    'Branca’s late husband, her nephew Isaac, her cousin Jorge at Funchal, the parcel, the letter of credit',
    'the Mina ships in May and November, every sum, multiplier and threshold; the four beats of the arc',
    'The Provedor, the Order’s commander and the King’s officers are left unnamed.',
  ],
};
