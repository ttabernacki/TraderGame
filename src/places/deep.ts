import { clamp } from '../core/math';
import type { SeaChoice, SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';
import type { CalendarEntry, DeepPort, MemoryDef, PatronDef } from './types';

/**
 * The Deep ports (BUILD_PLAN C4; D6 adds Arguim, Melinde, Calecute and Lisbon by adding an entry here).
 *
 * MINA, São Jorge da Mina: the Castle on the Akan coast, raised in 1482, where a fifth of the Crown's
 * revenue lands. The Patron is Kwesi, the gold-broker who already speaks in the Traffic's "Who buys" scene
 * (progression/trafficScenes); this deepens that man rather than adding a stranger.
 *
 * SOURCES AND WHAT IS INVENTED (the same ledger as docs/SOURCES.md, "Mina as a Deep port (C4)"):
 *   documented  the Castle's foundation in 1482 and its name; gold weighed in dust against weights on the beach;
 *               the dry-season gold trade; the Akan buyers' own scales; fever as the Castle's killer; the
 *               Castle's patron saint, whose day is 23 April; pawnship as a custom of the coast; trade between
 *               the Gold Coast and Benin, carried by sea and by canoe.
 *   approximate the months of the rains and of the gold season (the Gulf of Guinea's two wet seasons); the
 *               Castle keeping its patron's day with a mass.
 *   invented    Kwesi (a day-name, Sunday-born, of no real man); his house, his nephew Yaw, the interpreter's
 *               few words; the factor's new clerk; every sum; the Casa's ship in March and September; the
 *               canoe trade to the Benin creeks as Kwesi's house's own practice; the letter, the broker and
 *               the half-ounce weight. Deliberately generic: the identity of the Captain of the Castle and of
 *               the factor, the name of the house, the year of anything but the foundation.
 */

const mark = (g: Game, id: string): void => { g.powers.seen[`place:${id}`] = g.clock.t; delete g.powers.seen[`fired:place:${id}`]; };

// ---------------------------------------------------------------------------------------------
// The Patron

const KWESI: PatronDef = {
  id: 'kwesi', name: 'Kwesi', title: 'gold-broker', of: 'for a house in Eguafo’s country, up the coast from the Castle',
  bio: [
    'Kwesi buys and sells gold for a house in Eguafo’s country. He weighs on his own scales, in the open, on the beach below the walls, and when the Castle’s weights are in doubt it is to him that the other Akan buyers look.',
    'He is not the Castle’s man and not its enemy. The Castle sells his house cloth and brass, and his house sells the Castle gold, and each thinks the other the better customer.',
    'He is a few years past forty, speaks the Portuguese of the beach and no more, and will bargain in no one’s tongue but his own until he has made up his mind about you.',
  ],
  visitWeight: 0.4, visitCap: 1.6,
  thresholds: [1.0, 3.0, 5.5],
  rules: [
    { tag: 'weights.fair', weight: 1.6, why: 'Weighed by honest weights on his beach when shading was easy. It is the coin he trades in.' },
    { tag: 'weights.false', weight: -2.6, why: 'Shaded the scales. A broker lives by his scales and will not forget a captain who touched them.' },
    { tag: 'promise.kept', weight: 1.0, anywhere: true, why: 'A word given and kept: the one thing the beach does not discount.' },
    { tag: 'promise.broken', weight: -2.0, anywhere: true, why: 'A word broken. He will say nothing, and will weigh you as a stranger from then on.' },
    { tag: 'table.kept', weight: 0.7, anywhere: true, why: 'Kept a host’s table well.' },
    { tag: 'table.spoiled', weight: -0.6, anywhere: true, why: 'Spoiled a host’s table by ignorance of its rules.' },
    { tag: 'gift.great', weight: 0.8, why: 'Brought a gift that was praised.' },
    { tag: 'gift.insult', weight: -0.8, why: 'Brought a gift that was mocked.' },
    { tag: 'hearing.contested', weight: 0.5, why: 'Was seen asking in the Castle’s yard, which a man who may be asked has to be.' },
    { tag: 'person.redeemed', weight: 0.7, why: 'Paid a creditor’s price for a pawn, which is how a pawn is redeemed on this coast.' },
    { tag: 'silent.fair', weight: 0.6, anywhere: true, why: 'Dealt fairly on the mat, which is a scale of another kind.' },
    { tag: 'faith.respected', weight: 0.5, anywhere: true, why: 'Let a people keep its worship.' },
    { tag: 'faith.pressed', weight: -0.8, anywhere: true, why: 'Pressed the font on a people who had not asked.' },
    { tag: 'mercy.shown', weight: 0.5, anywhere: true, why: 'Took in or paid for someone who could not repay.' },
    { tag: 'contract.kept', weight: 0.5, anywhere: true, why: 'Delivered what was promised to a House.' },
    { tag: 'contract.broken', weight: -1.0, anywhere: true, why: 'Let a contract run out undelivered.' },
    { tag: 'loan.defaulted', weight: -1.5, anywhere: true, why: 'A debt went bad against your name; a broker hears of it on every beach.' },
  ],
  greet: {
    stranger: 'A man at his scales on the beach below the walls looks at the ship, and then at his weights. He does not call out.',
    acquaintance: 'Kwesi lifts a hand from his scales as the boat grounds. He knows the ship now, and what she pays.',
    trusted: 'Kwesi has a stool set in the shade before the boat is up the beach. He asks after the voyage, and waits for the answer.',
    partner: 'Kwesi comes down to the water himself. Behind him a boy is already carrying your chest up to his house, because that is where you will eat.',
  },
  rise: {
    acquaintance: 'Kwesi has stopped weighing you every time. He will answer a question now, if it is asked plainly.',
    trusted: 'Kwesi says his house will deal with you before it deals with the Castle’s other captains. He says it as a man gives a weight, not as a courtesy.',
    partner: 'Kwesi speaks of "our" gold in front of the factor. The factor writes it down.',
  },
  reactions: {
    'weights.fair': 'Kwesi has heard about the weights. He says nothing of it; he sets a stool for you in the shade, which on this beach is saying a good deal.',
    'weights.false': 'Kwesi does not come down the beach. His boy brings word that the house has gold to weigh elsewhere this week.',
    'promise.kept': 'Kwesi has heard that you kept your word where it cost you. He says a word kept is a weight that has been checked, and goes back to his scales.',
    'promise.broken': 'Kwesi looks at you for a while and then at his hands. He weighs your gold as he would a stranger’s, down to the grain.',
    'gift.great': 'Kwesi has heard how your gifts were taken, and the story has grown on the way. He does not correct it.',
    'gift.insult': 'Kwesi has heard about the tray. He is polite about it in the way that makes it worse.',
    'hearing.contested': 'Kwesi heard of the Thursday yard. He says a petition that is refused is still a petition, and the clerk’s book is longer than the Captain’s memory.',
    'person.redeemed': 'Kwesi has heard that you paid the creditor’s price and let the man go home. He says that is how a pawn is redeemed, and asks whether you knew.',
    'silent.fair': 'Kwesi has heard how you dealt on the mat down the coast. He says every people has its scales, and that you seem to know where to look for them.',
    'faith.pressed': 'Kwesi says the house heard what was done at the font. He does not say what the house thinks.',
    'faith.respected': 'Kwesi has heard that you let a people keep its worship. He says it costs nothing, and that few have paid it.',
    'mercy.shown': 'Kwesi has heard of the man you took in. He asks what it cost you, and nods at the answer.',
  },
  perks: [
    { id: 'word', stage: 'acquaintance', kind: 'rumour', text: 'He will tell you plainly, once a call, how the gold stands on this coast: the beach’s view of the Castle, with no reason to flatter you.' },
    { id: 'second', stage: 'trusted', kind: 'rumour', text: 'His people will say whether a tale about this coast is told the same way at their end. No charge.' },
    { id: 'yaw', stage: 'trusted', kind: 'pilot', text: 'Yaw, his sister’s son, who has run the surf boats and the canoes along this coast since he could lift a paddle, will come as a second pilot if you ask.' },
    { id: 'credit-1', stage: 'trusted', kind: 'credit', value: 150, text: 'His house will let a note run against your name while you lie here: up to 150 cruzados of dust.' },
    { id: 'credit-2', stage: 'partner', kind: 'credit', value: 300, supersedes: 'credit-1', text: 'His house will let a note run against your name while you lie here: up to 300 cruzados of dust.' },
    { id: 'gold', stage: 'partner', kind: 'price', value: 0.96, text: 'Gold is weighed to you at the price he gives his own.' },
    { id: 'house', stage: 'partner', kind: 'house', value: 0.7, text: 'A House on this beach costs three parts in ten less: his house stands surety for the ground.' },
  ],
};

// ---------------------------------------------------------------------------------------------
// The calendar

const MINA_CALENDAR: CalendarEntry[] = [
  {
    id: 'gold-season', name: 'The gold season', kind: 'fair', months: [12, 1, 2, 3], grade: 'approximate',
    text: 'In the dry months the traders come down from the forest with gold dust. The beach is busy, and the harmattan keeps the sea haze on the water.',
  },
  {
    id: 'main-rains', name: 'The great rains', kind: 'rains', months: [4, 5, 6, 7], grade: 'approximate', fever: 2,
    text: 'The surf is up, the boats are late, and the ground below the Castle is wet. Men who sleep ashore in these months do not always wake well.',
  },
  {
    id: 'small-rains', name: 'The small rains', kind: 'rains', months: [10, 11], grade: 'approximate', fever: 1.5,
    text: 'A second, shorter wet season. The fever is not what it is in the great rains, and it is not gone.',
  },
  {
    id: 'sao-jorge', name: 'São Jorge’s day', kind: 'feast', months: [4], days: [21, 25], grade: 'approximate', morale: 0.06,
    text: 'The Castle keeps its patron’s day on the twenty-third with a mass and the flag at the masthead, and the factor receives the captains in the yard. A ship that is in is expected to be seen.',
  },
  {
    id: 'casa-ship', name: 'The Casa’s ship', kind: 'fleet', months: [3, 9], grade: 'invented',
    price: { manilhas: 0.94, panos: 0.94, ferramenta: 0.94, ouro: 1.04 },
    text: 'The Casa’s ship from Lisbon is looked for in March and in September. While she is in, the stores are full and brass and cloth are cheap on the beach, and the factor is bidding hard for dust to fill her.',
  },
];

// ---------------------------------------------------------------------------------------------
// The memory

const MINA_MEMORY: MemoryDef = {
  lines: {
    'weights.fair': 'On the beach below the Castle they still talk of the day the weights were agreed in front of the factor, on the broker’s scales.',
    'weights.false': 'The gold-traders on the beach find they have something to do when you come down it. The Castle’s clerk is the only man who does not notice.',
    'hearing.contested': 'The Castle’s clerk has your name in the Thursday book, against a petition that was heard and not granted. The woman who made it has a copy in her own hand.',
    'person.redeemed': 'In a village up the coast a man has been told by his sister whose price paid for him. He has not been told your name, and it is known on the beach anyway.',
    'promise.kept': 'The brokers on the beach count your word as one of the weights they trust.',
    'promise.broken': 'On this beach a word broken is not argued over. The brokers weigh you twice.',
    'gift.great': 'The gift is still talked of at the Castle, and is a little larger each time.',
    'gift.insult': 'They tell the story of the tray on the beach, in the Castle and in the villages behind it.',
    'faith.pressed': 'The people behind the beach remember who was taken to the font, and are patient about it.',
    'faith.respected': 'The people behind the beach noticed that you left their worship alone.',
    'silent.fair': 'The coast’s mats and the coast’s scales are the same trade; the brokers heard how you dealt on one, and read it on the other.',
    'mercy.shown': 'The Castle’s surgeon speaks of a captain who took in a man he did not have to. He says it of few.',
    'traffic.carried': 'The Castle’s clerk has you in the right-hand column with the other captains who carry. There is no more in it than that.',
    'passenger.died': 'The clerk has the count of those who died on the passage to this beach in your ship, and reads it out when he wants something.',
  },
  effects: [
    { tag: 'weights.fair', dues: -0.04, price: { ouro: -0.02 }, regard: 0.12 },
    { tag: 'weights.false', dues: 0.06, price: { ouro: 0.03 }, regard: -0.2 },
    { tag: 'gift.great', dues: -0.02, regard: 0.1 },
    { tag: 'gift.insult', dues: 0.03, regard: -0.15 },
    { tag: 'hearing.contested', dues: 0.03, regard: 0.04 },
    { tag: 'person.redeemed', regard: 0.1 },
    { tag: 'promise.kept', regard: 0.08 },
    { tag: 'promise.broken', dues: 0.05, regard: -0.2 },
    { tag: 'faith.pressed', dues: 0.04, regard: -0.2 },
    { tag: 'faith.respected', regard: 0.1 },
  ],
};

// ---------------------------------------------------------------------------------------------
// The arc: Kwesi's house and the Castle's clerk. Four beats; the first two when he trusts you, the last two when he calls you a partner.
// Nothing here asks the captain to come back for a clue: each beat is offered on a call at Mina, nothing is lost by missing it, and the
// reward of the third is a letter that is carried FORWARD along the road, to Acará and Ugoton.

const scene = (id: string, title: string, text: string, choices: SeaChoice[]): SeaEvent =>
  ({ id: `place:${id}`, title, text, severity: 'note', choices, council: false });

const ARC1 = 'mina-arc-1';
const ARC2 = 'mina-arc-2';
const ARC3 = 'mina-arc-3';
const ARC4 = 'mina-arc-4';
const WORD = 'mina:word';

export const MINA_ARC: DeepPort['arc'] = [
  {
    id: ARC1, stage: 'trusted',
    build: () => scene(ARC1, 'What the Castle does not weigh',
      'Kwesi has you up to his house, which is a courtyard of beaten earth with a roof on three sides, a mile above the beach, and he sends the boy away before he speaks. He says it slowly, in his own tongue, with the interpreter’s few words of Portuguese laid over it like a cloth.\n\n'
      + 'His house does not send all its gold to the Castle. Some goes east by canoe, along the coast, to men who buy it for cloth on the Benin side, and some of the cloth comes back and is sold to people who are not the Castle’s. He says this has been the house’s business longer than there has been a Castle on the rock, and that the factor knows it as a man knows the weather. The factor’s new clerk, he says, is the sort who writes the weather down.\n\n'
      + 'He asks you for nothing. He says he is telling you because on this beach a man who has been told a thing is a man who may be asked about it, and he would rather you were asked by him.',
      [
        {
          label: 'Give him your word that you will not speak of it in Lisbon',
          detail: 'A promise. It can be kept, or it can be broken, and the Ledger will know which.',
          resolve: (gg) => {
            mark(gg, ARC1); gg.powers.seen[WORD] = gg.clock.t;
            gg.noteDeed('thread.taken', { target: 'mina', place: 'mina', magnitude: 0.5, note: 'Gave Kwesi my word not to speak in Lisbon of what his house does with its gold.' });
            return 'Kwesi nods once. He does not thank you; on this beach thanks would be a kind of price.';
          },
        },
        {
          label: 'Tell him the King’s letter forbids it, and that you cannot give your word',
          detail: 'Honest, and it costs you nothing here. He will know the limit of what you can be told.',
          resolve: (gg) => {
            mark(gg, ARC1);
            gg.noteDeed('refusal.honest', { target: 'mina', place: 'mina', magnitude: 0.6, note: 'Told Kwesi I could not promise silence about his house’s gold; the King’s letter does not allow it.' });
            return 'Kwesi says that then he has told you a thing you cannot carry, and that this is a fair thing to know about a friend. He pours you water, not wine, and the two of you talk about the rains.';
          },
        },
        {
          label: 'Ask how it is done, and give no word',
          detail: 'You learn something about the coast. He will not hold you to anything, and neither will you be bound.',
          resolve: (gg) => {
            mark(gg, ARC1); gg.powers.seen['mina:curious'] = gg.clock.t;
            return 'He draws the canoe in the dust with a stick: eleven men to her, three days to the Benin side in the right wind, and what is carried back under the paddles. You learn more than you meant to, and he watches you learn it.';
          },
        },
      ]),
  },
  {
    id: ARC2, stage: 'trusted', after: [ARC1], wait: 40,
    build: (g) => {
      const gave = g.powers.seen[WORD] !== undefined;
      return scene(ARC2, 'The clerk’s question',
        'The factor’s new clerk has the Casa’s ledger open on the counting-house table and a pen already wet. He is polite and he is young and he is very tired of the beach. He asks, between two other questions, whether a captain who has weighed on Kwesi’s scales has seen the house’s gold go anywhere but to the Castle.\n\n'
        + 'He writes while you think. A captain’s answer, in this room, goes in the book.'
        + (gave ? ' You gave Kwesi your word, and the clerk does not know it. He knows only that the pen is moving.' : ''),
        [
          {
            label: 'Say you have seen nothing of the kind',
            detail: gave ? 'You keep your word. The clerk writes it down.' : 'You were told nothing you are bound to keep, and you are saying it anyway.',
            resolve: (gg) => {
              mark(gg, ARC2);
              if (gave) {
                gg.noteDeed('promise.kept', { target: 'mina', place: 'mina', magnitude: 0.7, note: 'Told the Castle’s clerk I had seen nothing of Kwesi’s house’s gold going elsewhere, as I had promised.' });
                return 'The clerk writes it down and thanks you. Kwesi is told by evening, by a boy, in four words, and sends a jar of palm wine to the ship without a message.';
              }
              return 'The clerk writes it down and thanks you. Whether Kwesi is told, you do not learn.';
            },
          },
          {
            label: 'Tell him what Kwesi told you',
            detail: gave ? 'You break your word to give the Casa what it asks for.' : 'It is the truth, and you were bound to nothing. Kwesi will still hear of it.',
            resolve: (gg) => {
              mark(gg, ARC2);
              if (gave) {
                gg.noteDeed('promise.broken', { target: 'mina', place: 'mina', magnitude: 0.8, note: 'Told the Castle’s clerk what Kwesi had told me of his house’s gold, after giving him my word that I would not.' });
                return 'The clerk writes for a long time. Kwesi is told by evening. He does not come down the beach for you, then or on the next call.';
              }
              gg.noteDeed('books.honest', { target: 'mina', place: 'mina', magnitude: 0.5, note: 'Told the Castle’s clerk what I had been told of Kwesi’s house’s gold, having promised nothing.' });
              return 'The clerk writes for a long time. Kwesi is told by evening. He says only that he had not asked you for silence, and that he was right not to.';
            },
          },
          {
            label: 'Say it is not a captain’s business what the beach does, and ask for the weights',
            detail: 'You answer nothing and keep the clerk working. He will not forget it either.',
            resolve: (gg) => {
              mark(gg, ARC2);
              gg.noteDeed('refusal.curt', { target: 'mina', place: 'mina', magnitude: 0.3, note: 'Told the Castle’s clerk it was not a captain’s business what the beach did with its gold.' });
              return 'The clerk looks at you for a moment and then sets the pen down. He says the weights are in the yard.';
            },
          },
        ]);
    },
  },
  {
    id: ARC3, stage: 'partner', after: [ARC2], wait: 30,
    build: () => scene(ARC3, 'A letter to carry east',
      'Kwesi has never written anything, he says; he has had a letter written for him by the Castle’s interpreter, who is a patient man and was told nothing of it. It is to a broker in the creek-towns on the Benin side, who has bought his house’s gold for twenty years. It says one thing: that the bearer weighs fairly.\n\n'
      + 'He asks you to carry it east, to say his name where it is wanted, to take what is offered at the other end and not to hurry the man. He says this as one would ask a friend to carry a cask of water, and then he is quiet.',
      [
        {
          label: 'Take the letter, and carry it',
          detail: 'It goes forward along the road, to Acará and the Benin side. It asks nothing of you but patience.',
          resolve: (gg) => {
            mark(gg, ARC3); gg.powers.seen['mina:letter'] = gg.clock.t;
            for (const p of ['acara', 'ugoton']) {
              const r = gg.relationsFor(p);
              r.regard = clamp(r.regard + 0.15, -1, 1);
            }
            gg.noteDeed('parcel.carried', { target: 'ugoton', place: 'mina', magnitude: 0.4, note: 'Took Kwesi’s letter east, to a broker in the Benin creek-towns who has bought his house’s gold for twenty years.' });
            return 'Kwesi presses the letter into your hand and closes your fingers over it. The seal is a thumb in wax. You have the sense of having been given a great deal, and of its weighing very little.';
          },
        },
        {
          label: 'Tell him the voyage goes south, and let him find another carrier',
          detail: 'Nothing is lost on either side. He will find another ship.',
          resolve: (gg) => {
            mark(gg, ARC3);
            gg.noteDeed('refusal.honest', { target: 'mina', place: 'mina', magnitude: 0.3, note: 'Told Kwesi I could not carry his letter east.' });
            return 'Kwesi says there is always a boat going east. He puts the letter in his sleeve, and you drink together.';
          },
        },
      ]),
  },
  {
    id: ARC4, stage: 'partner', after: [ARC3], wait: 120,
    build: (g) => {
      const carried = g.powers.seen['mina:letter'] !== undefined;
      return scene(ARC4, 'The half-ounce',
        (carried
          ? 'The broker in the creek-towns answered by the canoes, and the canoes beat the ship. Kwesi tells it plainly: the broker says the bearer weighed fairly, and that he is the first of the Portuguese to whom the broker has said it. Kwesi says he did not ask the man to say it. He lets you take that however you like.\n\n'
          : 'Kwesi’s letter went east in another man’s boat, and an answer has come back. He does not say what it said. He says the house has done well this year, and that it is not nothing that you were asked.\n\n')
        + 'He takes a small brass weight out of a cloth, the half-ounce of his house, with its mark worn nearly flat by his father’s thumb and his own. He sets it on your palm, and does not close your hand over it.',
        [
          {
            label: 'Take it, and say you will weigh to it',
            detail: 'The house’s own weight. It is a keepsake and an honour, and it binds you to weigh true.',
            resolve: (gg) => {
              mark(gg, ARC4); gg.powers.seen['mina:weight'] = gg.clock.t;
              gg.noteDeed('weights.fair', { target: 'eguafo', place: 'mina', magnitude: 0.5, note: 'Kwesi gave me his house’s half-ounce weight to keep. I weigh to it.' });
              gg.crown.lifetimeStanding += 4;
              return 'You close your hand. Kwesi says that in Eguafo’s country it will be said that a Portuguese keeps the house’s weight, and that this is the sort of story that does a ship more good than a cargo.';
            },
          },
          {
            label: 'Say a captain cannot keep another man’s weight, and give him a bolt of cloth',
            detail: 'A courteous refusal, with a gift. Nothing in it can go wrong.',
            resolve: (gg) => {
              mark(gg, ARC4);
              gg.noteDeed('gift.great', { target: 'eguafo', place: 'mina', magnitude: 0.4, note: 'Declined Kwesi’s half-ounce weight and left a bolt of cloth with his house.' });
              return 'Kwesi laughs, the first time you have heard him, and folds the weight back into its cloth. He says the cloth will be seen on his sister, and that she will want to know where it came from.';
            },
          },
        ]);
    },
  },
];

// ---------------------------------------------------------------------------------------------

export const MINA: DeepPort = {
  port: 'mina',
  patron: KWESI,
  calendar: MINA_CALENDAR,
  memory: MINA_MEMORY,
  arc: MINA_ARC,
  invented: [
    'Kwesi, his house, his sister’s son Yaw, the interpreter’s few words and the factor’s new clerk',
    'the canoe trade to the Benin creeks as the house’s practice, the letter, the broker and the half-ounce weight',
    'the Casa’s ship in March and September, every sum and every multiplier',
    'The identity of the Captain of the Castle and of the factor, and any year but 1482, are left generic.',
  ],
};

/** The Deep ports, by port id. D6 adds to this. */
export const DEEP_PORTS: Record<string, DeepPort> = { mina: MINA };

export const deepPort = (port: string | null | undefined): DeepPort | null => (port ? DEEP_PORTS[port] ?? null : null);

