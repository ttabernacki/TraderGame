import { clamp } from '../../core/math';
import type { Game } from '../../game/state';
import { mark, scene } from '../kit';
import type { ArcBeat, CalendarEntry, DeepPort, MemoryDef, PatronDef } from '../types';

/**
 * ARGUIM, the Crown's fort on the sandbank: a Deep port (BUILD_PLAN D6).
 *
 * The Patron is Ahmad ibn Yahya, the caravan broker who already speaks in the Traffic's "The factor's book" (progression/
 * trafficScenes). This deepens him rather than adding a stranger, as Mina did with Kwesi. The Traffic scenes at Arguim are
 * untouched and still offered beside his arc.
 *
 * SOURCES AND WHAT IS INVENTED (docs/SOURCES.md, "Arguim, Melinde, Calecute and Lisbon as Deep ports (D6)"):
 *   documented  the fort on the island of Arguin (built in the 1440s-1450s; the trade run by the Crown through a factor); gum,
 *               gold dust and captives bought for wheat, cloth and horses (Zurara; Pacheco Pereira); the caravan road from
 *               the Sahara's salt and gold towns; the Imraguen fishers of the Banc d'Arguin, shoals that wreck ships; the
 *               Islamic rule that a free Muslim may not be enslaved, and ransom (manumission) as an honoured act.
 *   approximate caravans moving in the cool months and the gum gathered in the dry season; the harmattan haze, Dec-Mar.
 *   invented    Ahmad's family, his cousin Idriss at Wadan, the Wolof broker Demba Sy at Portudal, Bilal of the Imraguen, every
 *               sum, the wheat ships in May and October, the well-names recited in the last beat; the identity of the factor.
 */

const AHMAD: PatronDef = {
  id: 'ahmad', name: 'Ahmad ibn Yahya', title: 'caravan broker', of: 'of a family that has crossed the sand since before there was a fort',
  bio: [
    'Ahmad sells the right-hand column of the factor’s book to the left-hand one: gum, gold dust and hides on one side, wheat, cloth and horses on the other, and between them what the clerk calls pieces. His family has done it for four generations, and he is not ashamed of it, and he is nobody’s fool.',
    'He keeps a buyer at Tuat in reserve so that the factor will not feel certain of him. He keeps a second set of scales in his tent so that the fort’s will not feel certain either.',
    'He does not deal in the free-born of his own faith; his law forbids it, and he will tell you so, and he will also tell you what a ransom costs. He has decided what sort of man he is, and watches whether you have.',
  ],
  visitWeight: 0.4, visitCap: 1.6,
  thresholds: [1.0, 3.0, 5.5],
  rules: [
    { tag: 'weights.fair', weight: 1.4, why: 'Weighed gum and dust honestly when the fort’s weights could have been leaned on. He has two sets of scales and knows which one a man uses.' },
    { tag: 'weights.false', weight: -2.4, why: 'Shaded a weight. A broker’s name is his weights, and he will not forget whose hand was on them.' },
    { tag: 'books.honest', weight: 1.0, anywhere: true, why: 'Kept the King’s books straight. He lives by two columns and respects a man who does not cook either.' },
    { tag: 'books.cooked', weight: -1.2, anywhere: true, why: 'Had a book cooked. A captain who lies for him will lie to him.' },
    { tag: 'person.redeemed', weight: 1.2, why: 'Paid a family’s price and sent a girl home. Ransom is an honoured act in his law, and he knows to the grain what it cost.' },
    { tag: 'traffic.refused', weight: 0.4, why: 'Refused freight in people and paid for it. He says it cost the ship twice, and that this is how a man shows what he is.' },
    { tag: 'hearing.contested', weight: -0.4, why: 'Put the trade to the Castle in the open. It is not his quarrel, and it makes the factor’s clerk careful of everyone on the sand.' },
    { tag: 'promise.kept', weight: 1.0, anywhere: true, why: 'A word given and kept.' },
    { tag: 'promise.broken', weight: -2.0, anywhere: true, why: 'A word broken. The caravans hear of it before the ship has cleared the bar.' },
    { tag: 'contract.kept', weight: 0.5, anywhere: true, why: 'Delivered a contract to a House.' },
    { tag: 'contract.broken', weight: -1.0, anywhere: true, why: 'Let a contract run out undelivered.' },
    { tag: 'table.kept', weight: 0.6, anywhere: true, why: 'Kept a host’s table well.' },
    { tag: 'table.spoiled', weight: -0.5, anywhere: true, why: 'Spoiled a host’s table by ignorance.' },
    { tag: 'gift.great', weight: 0.7, why: 'Brought a gift that was praised.' },
    { tag: 'gift.insult', weight: -0.7, why: 'Brought a gift that was mocked.' },
    { tag: 'mercy.shown', weight: 0.6, anywhere: true, why: 'Took in or paid for someone who could not repay.' },
    { tag: 'faith.respected', weight: 0.5, anywhere: true, why: 'Let a people keep its worship.' },
    { tag: 'faith.pressed', weight: -0.9, anywhere: true, why: 'Pressed the font on those who had not asked.' },
    { tag: 'smuggle.caught', weight: -0.5, anywhere: true, why: 'Was caught running goods past the weigh-house; a broker pays for a careless friend.' },
    { tag: 'loan.defaulted', weight: -1.2, anywhere: true, why: 'A debt went bad against your name.' },
  ],
  greet: {
    stranger: 'A man in blue under an awning by the cistern watches the boat come in, and writes something down. He does not get up.',
    acquaintance: 'Ahmad ibn Yahya gets up from his mat when the boat grounds. He has seen the ship before, and has a price in mind for her.',
    trusted: 'Ahmad has tea made before the boat is up the sand. He asks after the voyage, and after the men, and waits for the answer to both.',
    partner: 'Ahmad comes out to the water himself, in the heat. Behind him a boy carries a mat to the best of the shade, and it is yours.',
  },
  rise: {
    acquaintance: 'Ahmad has stopped quoting you the stranger’s price. He will answer a question if it is asked plainly.',
    trusted: 'Ahmad says his family will sell to this ship before it sells to the fort’s favourites. He says it flatly, as one says a weight.',
    partner: 'Ahmad speaks of "our" caravan in front of the factor. The factor looks up from his book, and looks down again.',
  },
  reactions: {
    'weights.fair': 'Ahmad has heard how the gum was weighed. He sets out the second scales, the ones he does not show the fort, and says nothing at all, which is the point.',
    'weights.false': 'Ahmad does not come out of his tent. A boy says the broker has gum to weigh for the Tuat caravan this week.',
    'person.redeemed': 'Ahmad has heard about the girl at the cistern and the sum that was made up. He asks the family’s name, and then says it back, correctly. He says that in his law this is a good act and a hard bargain, and that he will not pretend he does not know both.',
    'traffic.refused': 'Ahmad has heard you turned down the freight. He asks what it cost, and nods at the answer, and says the fort will find another ship.',
    'books.honest': 'Ahmad has seen the factor’s clerk strike out a line in your favour. He says it is rare to see the right-hand column corrected by a captain.',
    'books.cooked': 'Ahmad has heard that a count was altered. He says a book is a kind of scale, and looks at the sand.',
    'hearing.contested': 'Ahmad has heard of the question put at the Castle. He is polite, and a little further from you than before.',
    'promise.kept': 'Ahmad has heard that you kept your word where it cost you. He says the caravans count that and nothing else.',
    'promise.broken': 'Ahmad looks at you for a while, and then at his tea.',
    'gift.insult': 'Ahmad has heard about the gift. He is courteous about it in the way that makes it worse.',
    'mercy.shown': 'Ahmad has heard of the man you took in. He asks what it cost you.',
  },
  perks: [
    { id: 'word', stage: 'acquaintance', kind: 'rumour', text: 'Once a call he will tell you plainly how the sand road stands: what the caravans are saying at Wadan and Tuat, and who is short of what.' },
    { id: 'second', stage: 'trusted', kind: 'rumour', text: 'His cousins on the sand will say whether a tale of the Saharan and Guinea coasts is told the same way at their end. No charge.' },
    { id: 'bilal', stage: 'trusted', kind: 'pilot', text: 'Bilal, an Imraguen fisherman who has taken his boat over the Banc d’Arguin since he was a boy, will come as a second pilot for the shoals if you ask.' },
    { id: 'credit-1', stage: 'trusted', kind: 'credit', value: 120, text: 'His family will let a note run against your name while you lie here: up to 120 cruzados of gum and dust.' },
    { id: 'credit-2', stage: 'partner', kind: 'credit', value: 250, supersedes: 'credit-1', text: 'His family will let a note run against your name while you lie here: up to 250 cruzados of gum and dust.' },
    { id: 'gold', stage: 'partner', kind: 'price', value: 0.97, text: 'Gold dust is weighed to you at the price he gives his own cousins.' },
    { id: 'house', stage: 'partner', kind: 'house', value: 0.75, text: 'A House on the island costs a quarter less: his family stands surety for the ground, and the fort’s clerk knows the family.' },
  ],
  front: 'traffic',
};

const CALENDAR: CalendarEntry[] = [
  {
    id: 'caravans', name: 'The caravan months', kind: 'fair', months: [11, 12, 1, 2], grade: 'approximate',
    price: { goma: 0.93, couros: 0.95, ouro: 1.03 },
    text: 'The cool months, when the caravans can cross. The island is full of tents and camels, gum and hides are cheap by the sack, and the factor is buying for the ship.',
  },
  {
    id: 'harmattan', name: 'The dust wind', kind: 'rains', months: [12, 1, 2, 3], grade: 'approximate',
    text: 'The harmattan lays a brown haze on the water. Boats are hard to see from the fort and the shoals are harder to read from a deck.',
  },
  {
    id: 'lent', name: 'Lent', kind: 'feast', months: [2, 3], days: [10, 31], grade: 'approximate', morale: 0.04,
    text: 'The fort’s chaplain keeps Lent with ash and fish, and the garrison with grumbling. A ship that is in is expected at the Friday mass.',
  },
  {
    id: 'hot-months', name: 'The hot months', kind: 'fever', months: [6, 7, 8, 9], grade: 'invented', fever: 1.4,
    text: 'The sandbank is an oven, the cistern is low, and men who sleep ashore wake with the flux. The caravans do not come.',
  },
  {
    id: 'wheat-ship', name: 'The wheat ship', kind: 'fleet', months: [5, 10], grade: 'invented',
    price: { trigo: 0.93, cavalos: 0.95, la: 0.96 },
    text: 'The Crown’s wheat ship from Lisbon is looked for in May and October. While she is in, the fort’s stores are full, and wheat, wool and horses are cheaper on the sand.',
  },
];

const MEMORY: MemoryDef = {
  lines: {
    'weights.fair': 'At the cistern they say the gum was weighed in front of both sets of scales, and that nobody asked the captain to.',
    'weights.false': 'The caravan men find they have business at the far end of the sandbank when your boat comes in.',
    'person.redeemed': 'A family went back across the sand with a girl on a camel. In three camps they know whose money made up the difference.',
    'traffic.refused': 'The factor’s clerk has a mark in the margin against your ship: she would not carry. The broker’s boys know what it means.',
    'traffic.carried': 'The factor’s clerk has you in the right-hand column with the other captains who carry. The sand does not mention it.',
    'hearing.contested': 'The fort’s clerk has a note of the question you put to the Castle. It is a short note, and his hand is careful on it.',
    'books.honest': 'The factor’s clerk remembers a book that was kept straight, and sometimes reaches for it as an example.',
    'books.cooked': 'The clerk remembers a count that moved. He does not say so; he counts twice.',
    'promise.kept': 'The brokers count your word as one of the weights they trust.',
    'promise.broken': 'A word broken on the sand is repeated from camp to camp. The brokers weigh you twice.',
    'gift.great': 'The gift is still talked of in the tents, and is larger each time.',
    'gift.insult': 'They tell the story of the tray in the tents and at the fort.',
    'mercy.shown': 'The fort’s chaplain speaks of the man you took in. He says it of few captains.',
    'faith.pressed': 'The people of the camps remember who was taken to the font, and keep a long account.',
    'faith.respected': 'The people of the camps noticed that you left their prayers alone.',
    'smuggle.caught': 'The weigh-house remembers what was in your hold, and so do the men who sold it to you.',
  },
  effects: [
    { tag: 'weights.fair', dues: -0.04, price: { goma: -0.02, ouro: -0.02 }, regard: 0.12 },
    { tag: 'weights.false', dues: 0.06, price: { goma: 0.03, ouro: 0.03 }, regard: -0.2 },
    { tag: 'person.redeemed', regard: 0.12 },
    { tag: 'traffic.refused', dues: 0.02, regard: 0.05 },
    { tag: 'books.honest', dues: -0.02, regard: 0.06 },
    { tag: 'books.cooked', dues: 0.04, regard: -0.12 },
    { tag: 'promise.kept', regard: 0.08 },
    { tag: 'promise.broken', dues: 0.05, regard: -0.2 },
    { tag: 'gift.great', regard: 0.1 },
    { tag: 'gift.insult', dues: 0.03, regard: -0.15 },
    { tag: 'faith.pressed', dues: 0.04, regard: -0.2 },
    { tag: 'faith.respected', regard: 0.1 },
  ],
};

// ---------------------------------------------------------------------------------------------
// The arc: the water, the weigher, a letter south, the wells. Each beat is offered on a call at Arguim. The letter goes FORWARD to
// Portudal on the Senegal coast; the last beat is a gift of knowledge that is carried on down the road.

const A1 = 'arguim-arc-1';
const A2 = 'arguim-arc-2';
const A3 = 'arguim-arc-3';
const A4 = 'arguim-arc-4';

const regardAt = (g: Game, port: string, d: number): void => { const r = g.relationsFor(port); r.regard = clamp(r.regard + d, -1, 1); };

export const ARGUIM_ARC: ArcBeat[] = [
  {
    id: A1, stage: 'trusted',
    build: () => scene(A1, 'The water-skins',
      'A caravan is in from Wadan three days late, and Ahmad is on the sand when you land. The skins are flat and the camels are slow; the cistern at the fort is the Crown’s, and the factor has said it is low and that a cask of its water is a cask of the garrison’s.\n\n'
      + 'Ahmad does not ask. He says that his cousin Idriss leads the caravan, that the cousin is proud, and that there are forty skins to fill. He says the ship’s casks are full, because he has seen them. Then he looks at the horizon and talks about camels.',
      [
        {
          label: 'Send two casks ashore for the skins, and ask nothing for them',
          detail: 'Water is dear on the island. The ship keeps enough for the next leg, and the factor will hear of it.',
          resolve: (gg) => {
            mark(gg, A1); gg.powers.seen['arguim:water'] = gg.clock.t;
            gg.noteDeed('mercy.shown', { target: 'arguim', place: 'arguim', actors: ['captain', 'Ahmad ibn Yahya'], magnitude: 0.6, note: 'Sent two casks of the ship’s water ashore for a caravan from Wadan, three days late, and asked nothing for them.' });
            return 'Idriss does not thank you. He fills the skins, and sends a camel-bag of dates to the boat after dark with a boy who has been told to say nothing.';
          },
        },
        {
          label: 'Sell him the water at the fort’s price',
          detail: 'A fair sale. He pays it, and understands exactly what it is.',
          resolve: (gg) => {
            mark(gg, A1);
            gg.crown.gold += 24;
            return 'Ahmad counts out twenty-four cruzados in dust and does not argue. He says a fair price is also a thing a man remembers.';
          },
        },
        {
          label: 'Tell him the ship needs her water, and that you are sorry',
          detail: 'The truth, and it costs nothing here. He will know the limit of what you can give.',
          resolve: (gg) => {
            mark(gg, A1);
            gg.noteDeed('refusal.honest', { target: 'arguim', place: 'arguim', magnitude: 0.4, note: 'Told Ahmad ibn Yahya the ship could not spare water for his cousin’s caravan.' });
            return 'Ahmad nods as if you had told him the time. He sends a boy to the factor, and the factor, with ill grace, finds forty skins.';
          },
        },
      ]),
  },
  {
    id: A2, stage: 'trusted', after: [A1], wait: 30,
    build: (g) => {
      const water = g.powers.seen['arguim:water'] !== undefined;
      return scene(A2, 'A weigher’s word',
        'The factor and the broker disagree about a sack. The gum has come from Wadan, and the factor says there is sand in the bottom of it; Ahmad says there is not, and that the factor’s weights are light. Each has asked the other to name a weigher whom both will trust, and each has named the captain of the ship, because there is no one else.\n\n'
        + (water ? 'Ahmad has not mentioned the water. The factor has noticed that he has not. ' : '')
        + 'You tip the sack on the cloth. A tenth of it is sand, and the rest is sound. Both men are watching your hands.',
        [
          {
            label: 'Say what you see: a tenth is sand, and the weights are light too',
            detail: 'Both are a little right. Ahmad loses face before the factor, and keeps his name.',
            resolve: (gg) => {
              mark(gg, A2);
              gg.noteDeed('books.honest', { target: 'arguim', place: 'arguim', magnitude: 0.7, note: 'Weighed the disputed sack of Wadan gum in front of the factor and the broker, and said that a tenth was sand and the fort’s weights were light.' });
              return 'The factor strikes a tenth from the price and has his weights mended. Ahmad bows to you very slightly. He says afterwards that he has been called many things at the cistern and "right" was not one, and that he preferred it to the others.';
            },
          },
          {
            label: 'Say the gum is sound',
            detail: 'It is a kindness to him, and a lie to the factor. The book goes to the Casa in your name.',
            resolve: (gg) => {
              mark(gg, A2);
              gg.noteDeed('books.cooked', { target: 'arguim', place: 'arguim', magnitude: 0.6, note: 'Told the factor the disputed sack of Wadan gum was sound, when a tenth was sand.' });
              return 'The factor writes it down. Ahmad thanks you in front of the clerk and not afterwards, and when the clerk has gone he looks at you for a moment as a man looks at a weight he has not yet checked.';
            },
          },
          {
            label: 'Say a captain is not a weigher, and give the sack back',
            detail: 'Neither man gets a ruling. Both have to settle it as they would have.',
            resolve: (gg) => {
              mark(gg, A2);
              gg.noteDeed('refusal.curt', { target: 'arguim', place: 'arguim', magnitude: 0.3, note: 'Declined to weigh the disputed sack of Wadan gum for the factor and the broker.' });
              return 'They settle it by splitting the difference, which is what they would have done in any case, and each tells the other it was the captain’s fault.';
            },
          },
        ]);
    },
  },
  {
    id: A3, stage: 'partner', after: [A2], wait: 30,
    build: () => scene(A3, 'A letter south',
      'Ahmad has a letter. It is in his own hand, which he writes better than the clerk writes his, and it is for Demba Sy, a Wolof broker at Portudal who buys horses from the Portuguese and sells them on, and who has bought Ahmad’s gum for twenty years. It says that the bearer weighs fairly.\n\n'
      + 'He says that the road between the sand and the green country is a road of brokers, and that a broker who is vouched for on both ends is worth three who are not. He does not say it is a great matter. He asks you to say his name where it is wanted, to take what is offered, and not to hurry the man.',
      [
        {
          label: 'Take the letter and carry it south',
          detail: 'Portudal lies ahead on the road. It asks only patience.',
          resolve: (gg) => {
            mark(gg, A3); gg.powers.seen['arguim:letter'] = gg.clock.t;
            regardAt(gg, 'portudal', 0.15);
            gg.noteDeed('parcel.carried', { target: 'portudal', place: 'arguim', magnitude: 0.4, note: 'Took Ahmad ibn Yahya’s letter south to Demba Sy at Portudal, who has bought his family’s gum for twenty years.' });
            return 'Ahmad presses the letter into your hand. The seal is a thumb on tallow. You have been given a good deal, and it weighs almost nothing.';
          },
        },
        {
          label: 'Say the voyage is not going by Portudal, and let him find another ship',
          detail: 'Nothing is lost on either side. There is always a ship going south.',
          resolve: (gg) => {
            mark(gg, A3);
            gg.noteDeed('refusal.honest', { target: 'arguim', place: 'arguim', magnitude: 0.3, note: 'Told Ahmad ibn Yahya I could not carry his letter to Portudal.' });
            return 'Ahmad says there is always a hull going south, and puts the letter in his sleeve. You drink tea instead.';
          },
        },
      ]),
  },
  {
    id: A4, stage: 'partner', after: [A3], wait: 120,
    build: (g) => {
      const carried = g.powers.seen['arguim:letter'] !== undefined;
      return scene(A4, 'The wells',
        (carried
          ? 'Demba Sy answered by a camel-rider along the shore, and the rider beat the ship. Ahmad tells it plainly: the Wolof says the bearer weighed fairly, and that he is the first of the Portuguese of whom the broker has said it. Ahmad did not ask the man to say it.\n\n'
          : 'Ahmad’s letter went south in another man’s boat, and an answer has come back. He does not say what it said. He says the family has done well this year, and that it is not nothing to have been asked.\n\n')
        + 'He sits you down and recites the road to Wadan and on to Tuat: the wells by name and the days between them, where the water is sweet and where it is not, which wells a stranger must not drink from first. It is a long list. He says it is what his father gave him and that a thing like that is not for sale. He waits to see whether you will write it down.',
        [
          {
            label: 'Write it down in the ship’s book, with his name against it',
            detail: 'His road, in your hand, under his name. It goes on with the ship.',
            resolve: (gg) => {
              mark(gg, A4); gg.powers.seen['arguim:wells'] = gg.clock.t;
              gg.noteDeed('table.kept', { target: 'azenegue', place: 'arguim', magnitude: 0.6, note: 'Ahmad ibn Yahya recited the wells of the road to Wadan and Tuat. I wrote them in the ship’s book under his name.' });
              gg.crown.lifetimeStanding += 4;
              return 'He watches you write, and corrects the spelling of two wells. He says that in the camps it will be said that a Portuguese wrote down the road and put the right name on it, which is a story that does a ship more good than a cargo.';
            },
          },
          {
            label: 'Listen, and do not write it down',
            detail: 'A road told is a road kept. He will think the better of you for the courtesy, and you will not have it on paper.',
            resolve: (gg) => {
              mark(gg, A4);
              gg.noteDeed('courtesy.kept', { target: 'azenegue', place: 'arguim', magnitude: 0.4, note: 'Listened to Ahmad ibn Yahya recite the wells to Wadan and Tuat, and did not write it down.' });
              return 'Ahmad ends the list on a well whose name you have already forgotten. He says that is how it is kept, and pours the tea.';
            },
          },
        ]);
    },
  },
];

export const ARGUIM: DeepPort = {
  port: 'arguim',
  patron: AHMAD,
  calendar: CALENDAR,
  memory: MEMORY,
  arc: ARGUIM_ARC,
  invented: [
    'Ahmad ibn Yahya’s family (the Traffic’s broker, deepened), his cousin Idriss, the Wolof broker Demba Sy, Bilal of the Imraguen',
    'the wheat ship in May and October, the hot-months fever multiplier, every sum, multiplier and threshold',
    'the four beats of the arc (the water-skins, the disputed sack, the letter south, the wells)',
    'The identity of the factor and of the Captain of the fort is left generic.',
  ],
};

