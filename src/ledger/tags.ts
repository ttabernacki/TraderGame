/**
 * The Ledger's controlled vocabulary.
 *
 * Every consequential act the game already records lands here under one of
 * these tags, and nothing else may be written: a tag nobody reads is a
 * memory nobody can use, and a tag nobody writes is a promise the game does
 * not keep. `scripts/ledger.ts` checks both, against the source and against
 * what the Book and the epilogue actually print.
 *
 * `did` is the one plain line shown when an entry lands (the cause and what it
 * will do), and the line the Book prints under the entry. Placeholders:
 *   {target}  the polity, person or place the act was done to
 *   {place}   the port it happened at, or "sea"
 *   {n}       the weight or count, when the entry carries one
 * Voice is the ship's: short, level, no exclamation.
 */

export interface TagDef {
  /** What the tag means, for whoever has to emit or read it. */
  doc: string;
  /** What this did, in one plain line. */
  did: string;
  /** How it reads for the captain's name, -1 (against) to 1 (for). */
  tone: number;
  /**
   * Consumers that read the tag today. `book` is the Life page of the Captain's
   * Book; `epilogue.lisbon` and `epilogue.polity` are the two chronicles;
   * `epilogue.muster` is the roll of the dead. Verified by the falsifier.
   */
  readers: string[];
  /** Consumers later builds will add (informational; never counted as readers). */
  planned?: string[];
  /** Logged in the Book but not announced when it lands. */
  silent?: boolean;
}

const BOOK = ['book'];
const POL = ['book', 'epilogue.polity'];
const LIS = ['book', 'epilogue.lisbon'];
const BOTH = ['book', 'epilogue.lisbon', 'epilogue.polity'];
const DEAD = ['book', 'epilogue.muster'];

function t(
  tone: number, doc: string, did: string, readers: string[] = BOOK,
  more: { planned?: string[]; silent?: boolean } = {},
): TagDef {
  return { doc, did, tone, readers, ...more };
}

export const TAGS = {
  // --- Word given and kept -------------------------------------------------
  'promise.kept': t(0.8, 'A word given to a court or a person, and honoured.',
    '{target} will remember that you kept your word.', BOTH, { planned: ['powers', 'company', 'titles'] }),
  'promise.broken': t(-0.9, 'A word given to a court or a person, and not honoured.',
    '{target} will remember that you broke your word, and so will those they tell.', BOTH, { planned: ['powers', 'company', 'titles'] }),
  'envoy.mixed': t(0.1, 'An envoy came home with a mixed report of the voyage.',
    '{target} has had a mixed report of you from its envoy.', POL),

  // --- Manners and courts --------------------------------------------------
  'courtesy.kept': t(0.5, 'Asked how to greet a court before acting, or greeted it properly.',
    '{target} marks that you asked before you acted.', POL),
  'courtesy.broken': t(-0.5, 'Stood where a stranger should have bowed.',
    '{target} has not forgotten that you stood.', POL),
  'courtesy.plain': t(0, 'Greeted a court in the Portuguese way, no more.',
    '{target} noted a stranger’s bow, and no more.', BOOK, { silent: true }),
  'table.kept': t(0.7, 'Kept the table or the hall as a guest of the house.',
    '{target} will speak of how you kept their table.', POL),
  'table.spoiled': t(-0.6, 'Spoiled the table or the hall by ignorance of its rules.',
    '{target} noticed your manners at their table, and will not say so to your face.', POL),
  'table.plain': t(0, 'Was served at a table, and neither pleased nor offended.',
    '{target} served you and thought no more of it.', BOOK, { silent: true }),
  'gift.great': t(0.7, 'Brought a gift that was praised.',
    '{target} praised your gifts, and the word goes along the coast ahead of you.', BOTH, { planned: ['powers', 'titles'] }),
  'gift.insult': t(-0.7, 'Brought a gift that was mocked.',
    '{target} mocked your gifts, and tells the story of the tray.', BOTH, { planned: ['powers'] }),
  'gift.plain': t(0.1, 'Brought a gift that was received without comment.',
    '{target} received your gifts without remark.', BOOK, { silent: true }),
  'peace.made': t(0.8, 'Carried proposals between two states and made a peace.',
    '{target} remembers who carried the proposals between them.', POL),
  'peace.left': t(-0.3, 'Came between two states and left the quarrel unmended.',
    '{target} remembers that you came between them and left it as it was.', POL),
  'judgement.just': t(0.7, 'Judged justly in an open court, or was heard whole.',
    '{target} remembers that you judged as a man of law would.', POL),
  'judgement.unjust': t(-0.7, 'Gave a ruling that would not survive a second look, or boasted at a court.',
    '{target} found your ruling would not stand, and says so.', POL),
  'judgement.heard': t(0.1, 'Was heard at a court, not entirely.',
    '{target} heard you out, not entirely.', BOOK, { silent: true }),
  'hostage.freed': t(0.3, 'Bought a hostage out and sent him home.',
    '{target} remembers that you let the boy go, and what it cost.', POL),
  'hostage.raised': t(0.8, 'Raised a chief’s son in your care, and he did well.',
    '{target} speaks of the boy you kept as a son of two houses.', POL),
  'hostage.ill': t(-0.2, 'A chief’s son lived in your care, but badly.',
    '{target} counts the cost of the winter the boy was ill.', POL),
  'hostage.died': t(-1, 'A chief’s son died in your keeping.',
    '{target} counts you among the killers of the boy.', POL, { planned: ['powers', 'company'] }),
  'pilot.trusted': t(0.6, 'Hired a pilot and read him right.',
    'Pilots at {target} say you know a true man from a talker.', POL),
  'pilot.misled': t(-0.5, 'Followed a pilot you did not check, and was led astray.',
    '{target} tells the story of the captain who followed a pilot who did not know his sea.', POL),
  'pilot.mixed': t(0, 'Crossed with a pilot who cost a day or two, or doubted an honest one.',
    'The pilot at {target} cost you a day or two.', BOOK, { silent: true }),
  'silent.fair': t(0.7, 'Dealt fairly on the mat at a silent trade.',
    'A good name goes along the coast from {target} ahead of you.', POL),
  'silent.blood': t(-1, 'Blood was shed on the beach at a silent trade.',
    'The next ship to land at {target} will be met with distrust.', POL, { planned: ['powers'] }),
  'silent.none': t(0, 'Came and went from a silent trade with little or nothing.',
    'Nothing came of the mat at {target}.', BOOK, { silent: true }),
  'informer.found': t(0.7, 'Found the rival’s man at a court.',
    '{target} remembers that you saw what their own court had not.', POL),
  'informer.wronged': t(-0.8, 'Named a man as the rival’s informer, and he was innocent.',
    '{target} has not forgotten who named an innocent man.', POL),
  'informer.silent': t(0, 'Knew of the rival’s man at a court, and said nothing.',
    'You kept to yourself what you knew of the rival’s man at {target}.', BOOK, { silent: true }),
  'refusal.honest': t(0.8, 'Refused a request honestly and kept the friend.',
    '{target} says you tell the truth even when it costs you.', POL),
  'refusal.curt': t(0, 'Refused a request, not quite as it could be taken.',
    '{target} took your refusal as it came.', BOOK, { silent: true }),
  'mark.for': t(0.5, 'A court’s mark for you from a piece that has no tag of its own.',
    '{target} holds something in your favour.', POL, { silent: true }),
  'mark.against': t(-0.5, 'A court’s mark against you from a piece that has no tag of its own.',
    '{target} holds something against you.', POL),
  'mark.mixed': t(0, 'A court’s mark from a piece that has no tag of its own, neither way.',
    '{target} keeps a neutral note of you.', BOOK, { silent: true }),

  // --- Trade, weights and charters -----------------------------------------
  'weights.false': t(-0.8, 'Shaded the scales, or let the factor’s false weights stand.',
    'The gold traders at {target} will find something to do when you come down the beach.', BOTH, { planned: ['powers', 'titles'] }),
  'weights.fair': t(0.7, 'Dealt by honest weights when shading was easy.',
    'Word of the scales goes along the coast from {target}.', BOTH, { planned: ['powers', 'titles'] }),
  'contract.kept': t(0.5, 'Delivered a goods contract to a House, as promised.',
    '{target} will trust your next contract a little more.', LIS),
  'contract.broken': t(-0.7, 'Let a goods contract run out undelivered.',
    '{target} has taken back the advance and will remember.', LIS),
  'commission.delivered': t(0.5, 'Delivered a charter on time.',
    'The patron will tell the Rua Nova you deliver.', LIS),
  'commission.failed': t(-0.6, 'Failed a charter: out of time, or the goods not aboard.',
    'The patron will tell the Rua Nova about it.', LIS),
  'parcel.carried': t(0.1, 'Took a parcel aboard for a man of standing, no questions.',
    '{target} will not forget a favour done without a question.', BOOK, { planned: ['company', 'patrons'] }),
  'parcel.refused': t(0.3, 'Refused a parcel and had it entered in the book.',
    '{target} will know you do not carry what is not declared.', BOOK),
  'parcel.redeemed': t(0.6, 'Took a parcel and declared it, paying the King’s share.',
    '{target} will remember a parcel that was brought to the weigh-house.', BOOK),
  'smuggle.caught': t(-0.8, 'Landed goods the weigh-house found, and was fined.',
    'The Casa has fined you and the court will remember it.', LIS),
  'smuggle.escaped': t(-0.1, 'Landed goods the weigh-house missed.',
    'The weigh-house missed it. You will never mention it.', BOOK, { silent: true }),

  // --- Charts, claims and the known world -----------------------------------
  'chart.sold': t(-0.5, 'Sold your survey, or a man’s roteiro, to another flag or house.',
    'Your sheet is in {target}’s hands and will be sold again.', LIS, { planned: ['titles', 'powers'] }),
  'chart.bought': t(0.1, 'Bought a stranger’s sheet of a coast you had not run.',
    'The stranger’s coast is on your table, drawn by somebody else.', BOOK),
  'chart.shared': t(0.4, 'Gave a survey or a roteiro to the Crown or a friend.',
    'The Casa has your sheet, under a name you chose.', LIS, { planned: ['titles'] }),
  'chart.copied': t(0.2, 'Copied a stranger’s coast into your own book.',
    'Another master’s headlands are laid down on your sheet.', BOOK),
  'landfall.exact': t(0.5, 'Raised a port within a few miles of the reckoning, after days at sea.',
    'The reckoning held: the pilot trusts his board a little more.', LIS),
  'landfall.lost': t(-0.4, 'Raised a port far from where the reckoning put her.',
    'The reckoning was far out at the landfall. The pilot is less sure of his board.', LIS),
  'claim.made': t(0.6, 'Raised a padrão and claimed a headland for the Crown.',
    'The arms of Portugal stand at {target}, and the Casa has entered it.', LIS, { planned: ['powers'] }),
  'claim.lost': t(-0.4, 'The rival reported a coast first; the court entered it under his name.',
    '{target} is entered under the rival’s name, and the renown is gone.', LIS),
  'name.given': t(0.3, 'Gave a headland or river its name.',
    '{target} is on the chart under your hand.', BOOK),
  'landmark.surveyed': t(0.5, 'Stood in to a great landmark and surveyed it properly.',
    '{target} is surveyed, not merely passed, and the coast is known.', BOOK),
  'landmark.passed': t(-0.1, 'Noted a great landmark and pressed on.',
    '{target} was noted from the rail, and not surveyed.', BOOK),
  'south.beyond': t(0.6, 'Passed the furthest south any Christian had been.',
    'No chart, no rutter, no man alive who has seen this water.', LIS),
  'lane.opened': t(0.5, 'Opened an inland road to a port, deepening what it can trade.',
    'The road at {target} is open, and its markets are deeper.', LIS, { planned: ['powers', 'economy'] }),
  'port.funded': t(0.6, 'Founded a House or station at a port.',
    'A station of yours stands at {target}, and your men are in it.', LIS, { planned: ['powers', 'economy'] }),
  'fact.sold': t(-0.1, 'Sold a copy of a price sheet or a piece of hearsay to the informers of a port.',
    'A copy of what you knew of {target} is in other hands, and will be sold again.', BOOK),
  'fact.checked': t(0.1, 'Paid an informer for a second opinion on a price sheet or a piece of hearsay.',
    'A second man has been asked about {target}; what he said is on the page.', BOOK),
  'rumour.true': t(0.3, 'Ran down a report and found it where the man said.',
    'The report from {target} ran true; the next one will be believed sooner.', BOOK),
  'rumour.false': t(-0.1, 'Ran down a report and found only water.',
    'The report from {target} was wrong; the hands have opinions about the man.', BOOK),

  // --- The company ---------------------------------------------------------
  'hand.died': t(-0.4, 'Men lost out of the company; named ones in actors, the count in magnitude.',
    '{n} men lost; the dead are in the muster.', DEAD, { planned: ['company', 'titles'] }),
  'hand.hanged': t(-0.5, 'A ringleader hanged at the yardarm for mutiny.',
    '{target} was hanged; the hands work well and do not forget.', DEAD, { planned: ['company'] }),
  'hand.flogged': t(-0.3, 'Backed the boatswain and had a man flogged at the capstan.',
    'Two dozen at the capstan bar; the ship is run tighter and the fo’c’sle is sullen.', BOOK, { planned: ['company'] }),
  'officer.died': t(-0.5, 'An officer died on the voyage.',
    '{target} is dead, and the ship has no one in his place.', DEAD, { planned: ['company'] }),
  'mutiny.conceded': t(0.4, 'Heard the ringleader out and gave him what he asked.',
    'You told {target} he was right in front of the ship’s company; they will come aft again.', BOOK, { planned: ['company'] }),
  'mutiny.faced_down': t(0.2, 'Faced down a ringleader on the strength of what the men already thought.',
    'You stood in front of {target} and he went; it was bought a watch at a time.', BOOK, { planned: ['company'] }),
  'mutiny.lost': t(-0.8, 'Tried to face them down and failed; the crew took the ship.',
    'The helm is up. You are captain in name until she smells Portugal.', BOOK, { planned: ['company', 'patrons'] }),
  'mutiny.turned_back': t(-0.3, 'Put the helm up and took them home rather than bury the rest.',
    'The company will sail with you again; the Casa will take a different view.', BOOK, { planned: ['company', 'patrons'] }),
  'companion.freed': t(0.8, 'Freed a man who served aboard against his will.',
    '{target} is free, and the pilots on the quay know the name of the ship.', BOOK, { planned: ['company', 'titles'] }),
  'companion.kept': t(-0.3, 'Kept a man aboard who would have gone.',
    '{target} stays; the pilots on the quay look at him and then do not.', BOOK, { planned: ['company'] }),
  'companion.lied_to': t(-0.5, 'Made an officer write a lie into the King’s book.',
    '{target} will not forget what you made him write.', BOOK, { planned: ['company'] }),
  'journey.sent': t(0.1, 'Sent a man inland, away from the coast.',
    '{target} has gone up the river. His wage is paid to the end.', BOOK),
  'journey.returned': t(0.3, 'A man sent inland came back.',
    '{target} is back from the interior.', BOOK),
  'journey.lost': t(-0.5, 'A man sent inland never came down.',
    '{target} did not come back from the interior.', DEAD),

  'companion.bonded': t(0.6, 'A companion’s story was carried to its end well, and he is yours.',
    '{target} is yours; what he gave you stays with you.', LIS, { planned: ['titles'] }),
  'companion.estranged': t(-0.4, 'A companion’s story ended in a coldness that did not mend.',
    '{target} does his work and no more, and will not be asked again.', LIS),
  'companion.left': t(-0.4, 'A companion left the ship at a port, his leave taken or forced.',
    '{target} has left the ship, and the berth is empty.', LIS),
  'companion.betrayed': t(-0.8, 'A companion went over to another and took what he knew with him.',
    '{target} has sold what he knew of you, and the coast will have it by the spring.', LIS),
  'companion.promoted': t(0.4, 'A hand was raised to mate, or posted to a House.',
    '{target} has been raised out of the fo’c’sle, and the fo’c’sle has noticed.', BOOK),
  'faith.pressed': t(-0.5, 'Pressed baptism or the faith on a people who had not asked.',
    '{target} was pressed to the font, and remembers who pressed.', BOOK),
  'faith.respected': t(0.5, 'Let a people keep its worship, or waited until a rite could be understood.',
    '{target} saw its worship left alone, and says so.', BOOK),
  'books.honest': t(0.5, 'Had the King’s books kept straight when a false line was easy.',
    'The clerk has entered it as it was, and the Casa will read it so.', BOOK),
  'books.cooked': t(-0.6, 'Had the books cooked: a freight, a store, a count of the dead.',
    'It is in the clerk’s hand and not in his heart; he will remember it.', BOOK),

  // --- Strangers at sea ----------------------------------------------------
  'ship.stopped': t(-0.5, 'Boarded and carried a stranger.',
    '{target} will hear of the ship you took; the deposition goes to the Casa.', BOTH, { planned: ['powers', 'rule'] }),
  'ship.repulsed': t(-0.4, 'Went in to board and was beaten back.',
    'The boats were beaten back; it will be in the escrivão’s book by supper.', BOOK),
  'ship.spared': t(0.4, 'Warned a stranger off, or let her pass.',
    '{target} will hear that you let her go.', BOTH, { planned: ['powers', 'rule'] }),
  'ship.succoured': t(0.7, 'Went alongside a ship in distress and got her sailing.',
    'The people of that ship will tell it for the rest of their lives.', BOTH, { planned: ['powers', 'titles'] }),
  'ship.abandoned': t(-0.7, 'Held your course past a ship in distress.',
    'Nobody will ever raise it with you. It is in the escrivão’s book.', BOTH, { planned: ['company', 'titles'] }),
  'ship.ransomed': t(-0.2, 'Bought off a corsair.',
    'The ordinary arrangement: nobody dead, and every man forward understood what it cost.', BOOK),
  'order.breached': t(-0.5, 'Let an interloper alone against the letter of a commission.',
    'The Casa’s copy of this voyage has a clerk who watched you do it.', LIS),

  // --- Money ---------------------------------------------------------------
  'loan.taken': t(0, 'Took money from a House on the Rua Nova.',
    '{target} lent against the voyage, and the day it is due is written.', LIS),
  'loan.repaid': t(0.5, 'Repaid a loan to a House.',
    '{target} writes you paper more readily now.', LIS),
  'loan.defaulted': t(-0.9, 'A loan went bad against your name.',
    'Your name is in a book on the Rua Nova that is never closed.', LIS, { planned: ['patrons', 'titles'] }),

  // --- The career ----------------------------------------------------------
  'voyage.begun': t(0, 'Sailed from Lisbon to begin a voyage. Divides the Book into voyages.',
    'A new voyage is begun.', BOOK, { silent: true }),
  'voyage.home': t(0.2, 'Came home to Lisbon from a voyage.',
    'Home from the voyage.', LIS, { silent: true }),
  'thread.taken': t(0.1, 'Took up an errand or a story from someone ashore.',
    'You have taken it up, and it is entered in the journal.', BOOK, { silent: true }),
  'thread.closed': t(0, 'An errand or a story ended; the outcome is in the note.',
    'The matter is closed, and what came of it is in your book.', BOOK, { silent: true }),
  'patron.honest': t(0.6, 'Told the King the plain truth in a letter.',
    'The King had the truth from you once, in his own hand.', LIS, { planned: ['patrons', 'titles'] }),
  'patron.flattered': t(-0.3, 'Sent the King a cheerful letter that left out the truth.',
    'The King had a cheerful letter from you; the man who read it over your shoulder did not.', LIS, { planned: ['patrons'] }),
  'mercy.shown': t(0.8, 'Took in, nursed or paid for someone who could not repay.',
    'Word of it will be told in a tavern on the Tagus, and not by you.', BOOK, { planned: ['company', 'titles'] }),
  'milestone.reached': t(0.3, 'Reached a milestone of the career.',
    'It is entered in your name.', BOOK, { silent: true }),
  'crown.reported': t(0.3, 'Reported to the King’s factor with the voyage’s findings.',
    'The Casa has your report, and the renown that goes with it.', LIS),
  'patent.completed': t(0.7, 'Completed a patent or commission from the Crown.',
    'The Crown has what it asked for, and has a long memory for who gave it.', LIS, { planned: ['patrons', 'titles'] }),
} as const satisfies Record<string, TagDef>;

export type Tag = keyof typeof TAGS;

export const ALL_TAGS = Object.keys(TAGS) as Tag[];

export function isTag(s: string): s is Tag {
  return Object.prototype.hasOwnProperty.call(TAGS, s);
}

export function familyOf(tag: string): string {
  const i = tag.indexOf('.');
  return i < 0 ? tag : tag.slice(0, i);
}
