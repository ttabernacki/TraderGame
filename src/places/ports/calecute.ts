import { clamp } from '../../core/math';
import type { Game } from '../../game/state';
import { mark, scene } from '../kit';
import type { ArcBeat, CalendarEntry, DeepPort, MemoryDef, PatronDef } from '../types';

/**
 * CALECUTE (Kozhikode), the Zamorin's port and the Mappila merchants' town: a Deep port (BUILD_PLAN D6).
 *
 * The Patron is Mammali, the Koya of the Mappila merchants: the head of the Muslim trading houses that own the pepper's road to
 * the Red Sea and sit at the Zamorin's ear. The Zamorin's court is the frame (the polity and the Rule are the Powers' work, D4);
 * the Patron is the community's face, not the king's.
 *
 * SOURCES AND WHAT IS INVENTED (docs/SOURCES.md, "Arguim, Melinde, Calecute and Lisbon as Deep ports (D6)"):
 *   documented  Calicut as the great pepper port of the Malabar coast under the Zamorin; the Mappila (Muslim) and Arab merchants
 *               and their dominance of the trade to the Red Sea and Gujarat; the "Koya" as the Mappila head and the port
 *               officer ("Shah Bandar"); the Zamorin's feud with Cochin and the Kolathiri; the south-west monsoon bringing the
 *               rains in June and closing the coast to ships; Onam and Vishu as harvest and new-year festivals of the coast.
 *   approximate the sea closed to shipping from about June to August (the "closed sea" of Malabar); pepper harvested in the
 *               dry months and brought to the warehouses December-March; Onam in August-September (Chingam) and Vishu in April.
 *   invented    Mammali and his house, his sister's son Pokker, the Friday table, the grower's advance and the failed crop, the
 *               letter to a Mappila house at Cochim, the pass in his hand; every sum. The Zamorin's ruler is left generic.
 */

const MAMMALI: PatronDef = {
  id: 'mammali', name: 'Mammali', title: 'Koya of the Mappila merchants', of: 'of Calecute, whose houses have owned the pepper’s road to Jidda for as long as there has been a road',
  bio: [
    'Mammali is the Koya: the man the Mappila merchants of Calecute answer to, and the man the Zamorin sends for when a ship has come in and nobody has been sure who to ask. He keeps no army. He keeps the weigh-house, the book of every ship that has called and a tenth of every voyage.',
    'His family have been Calecute’s Muslims longer than the Zamorin’s have been its kings, and are not frightened of him. They are frightened of whoever frightens the Red Sea ships, and have been watching the Portuguese for several years to see which they are.',
    'He is courteous to the point of being impossible to read. He asks what a ship will do before he tells her what the port will do for her.',
  ],
  visitWeight: 0.4, visitCap: 1.6,
  thresholds: [1.0, 3.0, 5.5],
  rules: [
    { tag: 'weights.fair', weight: 1.0, why: 'Weighed pepper by honest weights in the Koya’s own weigh-house when shading was easy.' },
    { tag: 'weights.false', weight: -2.2, why: 'Shaded a weight in a house that lives by its scales.' },
    { tag: 'ship.stopped', weight: -2.0, anywhere: true, why: 'Boarded and carried a stranger. The ships of the Red Sea are his ships, and he has heard the word of each stop before the ship that made it.' },
    { tag: 'ship.spared', weight: 1.0, anywhere: true, why: 'Let a stranger pass. It is the only thing he can use as a safe-conduct.' },
    { tag: 'ship.succoured', weight: 0.7, anywhere: true, why: 'Went to the help of a ship in distress.' },
    { tag: 'promise.kept', weight: 1.0, anywhere: true, why: 'A word given and kept.' },
    { tag: 'promise.broken', weight: -2.0, anywhere: true, why: 'A word broken. The houses talk, and the houses are the same house.' },
    { tag: 'courtesy.kept', weight: 0.8, why: 'Asked how a stranger should greet the Zamorin, and did it.' },
    { tag: 'courtesy.broken', weight: -0.9, why: 'Stood where a stranger should have bowed.' },
    { tag: 'table.kept', weight: 0.8, anywhere: true, why: 'Kept a host’s table well.' },
    { tag: 'table.spoiled', weight: -0.7, anywhere: true, why: 'Spoiled a host’s table by ignorance of its rules.' },
    { tag: 'gift.great', weight: 0.7, why: 'Brought a gift that was praised.' },
    { tag: 'gift.insult', weight: -0.8, why: 'Brought a gift that was mocked.' },
    { tag: 'parcel.carried', weight: 0.9, why: 'Carried a letter a friend gave you to him, without a question.' },
    { tag: 'parcel.redeemed', weight: 0.6, anywhere: true, why: 'Carried a parcel and declared it. A house understands a declared thing.' },
    { tag: 'contract.kept', weight: 0.6, anywhere: true, why: 'Delivered a contract to a House.' },
    { tag: 'contract.broken', weight: -1.0, anywhere: true, why: 'Let a contract run out undelivered.' },
    { tag: 'mercy.shown', weight: 0.5, anywhere: true, why: 'Took in or paid for someone who could not repay.' },
    { tag: 'faith.respected', weight: 0.8, anywhere: true, why: 'Let a people keep its worship.' },
    { tag: 'faith.pressed', weight: -1.2, anywhere: true, why: 'Pressed the font on a people who had not asked. The Mappila remember it for all of them.' },
    { tag: 'peace.made', weight: 0.6, anywhere: true, why: 'Carried proposals between two states and made a peace.' },
    { tag: 'loan.defaulted', weight: -1.2, anywhere: true, why: 'A debt went bad against your name. Ledgers cross the sea.' },
  ],
  greet: {
    stranger: 'A man with a sharp white cap and a retinue of three stands on the weigh-house steps and watches your boat. He does not come down. Someone is writing the ship’s name in a book.',
    acquaintance: 'Mammali comes down the steps to meet you, which he does for ships whose name he knows. He asks about the voyage and gives no hint of what he thinks of it.',
    trusted: 'Mammali has a seat placed for you under the awning of the weigh-house and sherbet on a brass tray. He asks about the voyage, and then the ship, and then you.',
    partner: 'Mammali meets the boat at the water’s edge and walks you up to his house himself. The Zamorin’s people see it, and several of them go indoors.',
  },
  rise: {
    acquaintance: 'Mammali has stopped asking the ship’s business through his clerk and now asks it himself.',
    trusted: 'Mammali says the houses will deal with your ship before they deal with strangers. He says it the way a man gives a weight.',
    partner: 'Mammali says "we" at the weigh-house in front of the Zamorin’s officer, of the Mappila and of you. The officer writes down which.',
  },
  reactions: {
    'weights.fair': 'Mammali has heard how the pepper was weighed. He sets a sherbet in front of you, and nothing else, which in his house is a good deal.',
    'weights.false': 'Mammali does not come to the steps. His clerk says the Koya is at the Zamorin’s palace for the season.',
    'ship.stopped': 'Mammali looks at you for a time. A boy brings sherbet, and takes it away untouched, and the interview is over.',
    'ship.spared': 'Mammali has heard that you let a ship pass. He says nothing about the ship. He says the monsoon has been late.',
    'courtesy.kept': 'Mammali has heard that you asked how to greet the Zamorin before you did. He says most captains find out afterwards.',
    'parcel.carried': 'Mammali has had a letter, in a hand he knows. He puts it away without a word, and orders sherbet for the ship’s officers as well as the captain.',
    'promise.kept': 'Mammali has heard you kept your word where it cost you. He says it is the one coin the houses do not clip.',
    'promise.broken': 'Mammali looks at you for a while and says the houses are the same house.',
    'gift.insult': 'Mammali has heard about the gift. He is courteous about it in the way that makes it worse.',
    'faith.pressed': 'Mammali says the houses heard what was done at the font. He does not say what the houses think.',
    'faith.respected': 'Mammali has heard that you let a people keep its worship. He says it costs nothing, and that few have paid it.',
  },
  perks: [
    { id: 'word', stage: 'acquaintance', kind: 'rumour', text: 'Once a call he will tell you how the Red Sea stands: which fleets are looked for, what Cairo and Jidda are saying of the Franks, and which way the Zamorin is leaning.' },
    { id: 'second', stage: 'trusted', kind: 'rumour', text: 'His houses at Cananor and Cochim will say whether a tale of the Malabar coast is told the same way at their end. No charge.' },
    { id: 'linguas', stage: 'trusted', kind: 'hint', text: 'He will say, on the quay, which of the interpreters can be trusted with a petition to the Zamorin and which sell what they hear. The clause view will read it when a court names its grants.' },
    { id: 'credit-1', stage: 'trusted', kind: 'credit', value: 250, text: 'A Mappila house will let a note run on his word while you lie here: up to 250 cruzados.' },
    { id: 'credit-2', stage: 'partner', kind: 'credit', value: 500, supersedes: 'credit-1', text: 'A Mappila house will let a note run on his word while you lie here: up to 500 cruzados.' },
    { id: 'dues', stage: 'trusted', kind: 'dues', value: 0.93, text: 'The weigh-house takes seven parts in a hundred less of a ship it has weighed before: the Koya keeps the weigh-house’s book.' },
    { id: 'cartaz', stage: 'partner', kind: 'hint', text: 'He will say, in the Zamorin’s hearing, that your ship is not an enemy of the sea. When the court names its grants, a Koya’s word is what a pass of the Zamorin’s is written on; a ship that has stopped dhows loses it.' },
    { id: 'house', stage: 'partner', kind: 'house', value: 0.7, text: 'A House in the town costs three parts in ten less: the Mappila stand surety for the ground, and the Zamorin’s officer notes it.' },
  ],
  front: 'rule',
};

const CALENDAR: CalendarEntry[] = [
  {
    id: 'pepper-months', name: 'The pepper months', kind: 'fair', months: [12, 1, 2, 3], grade: 'approximate',
    price: { pimenta: 0.94, gengibre: 0.96 },
    text: 'The harvest is in, and the warehouses are full from the hills. Pepper is cheap by the bahar, every broker is out, and the Red Sea ships fill their holds and go.',
  },
  {
    id: 'vishu', name: 'Vishu', kind: 'fair', months: [4], days: [10, 15], grade: 'approximate',
    text: 'The first morning of the new year, when the Malayalis look first at gold, rice and flowers. The town is quiet and well dressed; business resumes after a day or two.',
  },
  {
    id: 'closed-sea', name: 'The closed sea', kind: 'rains', months: [6, 7, 8], grade: 'approximate', fever: 1.4,
    appetite: { pimenta: 0.9 },
    text: 'The south-west monsoon breaks on the coast, the roads are open to the surf and no ship works the anchorage. Fever comes with the rain.',
  },
  {
    id: 'onam', name: 'Onam', kind: 'fair', months: [8, 9], days: [20, 30], grade: 'approximate',
    text: 'The harvest feast of the Malayalis. The flowers are laid on the ground before the doors and the town eats with its neighbours. A captain who is seen to keep the day is remembered.',
  },
  {
    id: 'red-sea-fleet', name: 'The Red Sea ships', kind: 'fleet', months: [9, 10, 11], grade: 'approximate',
    price: { ouro: 1.03, coral: 1.04, cavalos: 1.05 },
    text: 'The ships from Jidda, Aden and Cambay are in as the sea opens, and the quay is full of coral, horses and silver. Everything the ships bring is dearer for being wanted by so many.',
  },
];

const MEMORY: MemoryDef = {
  lines: {
    'weights.fair': 'In the weigh-house it is remembered that your pepper was weighed twice, on both sets of scales, and the numbers were the same.',
    'weights.false': 'The Mappila clerks find that the scales are being repaired when you ask to use them.',
    'ship.stopped': 'There is a dhow in the roads with a patched side and a captain who has told it to a good many people. Nobody mentions it when you are there.',
    'ship.spared': 'A dhow master tells how a Portuguese ship stood off to let him pass. He tells it often, to strangers.',
    'ship.succoured': 'The story of the ship you went alongside has come down the coast ahead of you.',
    'courtesy.kept': 'The Zamorin’s officer remembers that you asked how to greet him before you did.',
    'courtesy.broken': 'The Zamorin’s people have not forgotten where you stood.',
    'parcel.carried': 'The Koya’s clerks speak of a letter carried across the ocean in good faith.',
    'parcel.redeemed': 'A parcel was brought to the weigh-house and shown. The clerks still tell it.',
    'promise.kept': 'The houses count your word among the things they can lend against.',
    'promise.broken': 'A word broken at Calecute is repeated at Jidda, Cairo and Cambay by the next ship.',
    'gift.great': 'The gift is still talked of at the palace, and is larger each time.',
    'gift.insult': 'They tell the story of the tray at the palace, in the bazaar and on the weigh-house steps.',
    'faith.pressed': 'The Mappila remember who was taken to the font, for all of them.',
    'faith.respected': 'The Mappila noticed that you left their prayers alone.',
    'table.kept': 'They say you kept their table, and are not surprised by it.',
  },
  effects: [
    { tag: 'weights.fair', dues: -0.04, price: { pimenta: -0.02 }, regard: 0.12 },
    { tag: 'weights.false', dues: 0.06, price: { pimenta: 0.03 }, regard: -0.2 },
    { tag: 'ship.stopped', dues: 0.08, price: { pimenta: 0.04 }, regard: -0.3 },
    { tag: 'ship.spared', dues: -0.03, regard: 0.12 },
    { tag: 'ship.succoured', dues: -0.02, regard: 0.1 },
    { tag: 'courtesy.kept', regard: 0.08 },
    { tag: 'courtesy.broken', dues: 0.03, regard: -0.15 },
    { tag: 'parcel.carried', regard: 0.1 },
    { tag: 'parcel.redeemed', dues: -0.02, regard: 0.08 },
    { tag: 'promise.kept', regard: 0.08 },
    { tag: 'promise.broken', dues: 0.05, regard: -0.2 },
    { tag: 'gift.great', dues: -0.02, regard: 0.1 },
    { tag: 'gift.insult', dues: 0.03, regard: -0.15 },
    { tag: 'faith.pressed', dues: 0.05, regard: -0.25 },
    { tag: 'faith.respected', regard: 0.1 },
  ],
};

// ---------------------------------------------------------------------------------------------
// The arc: the Friday table, the grower's advance, a letter to Cochim, the pass. The letter goes FORWARD (Cochim lies beyond
// Calecute on the road); the pass is a gift in the Koya's hand that is carried on to Cochim and Coulão.

const C1 = 'calecute-arc-1';
const C2 = 'calecute-arc-2';
const C3 = 'calecute-arc-3';
const C4 = 'calecute-arc-4';

const regardAt = (g: Game, port: string, d: number): void => { const r = g.relationsFor(port); r.regard = clamp(r.regard + d, -1, 1); };

export const CALECUTE_ARC: ArcBeat[] = [
  {
    id: C1, stage: 'trusted',
    build: (g) => {
      const letter = g.powers.seen['melinde:letter'] !== undefined;
      return scene(C1, 'The Friday table',
        'After the noon prayer Mammali has the merchants of three ships to his house: a man from Jidda, a man from Aden and one from Cambay who speaks less than the others and watches more. The food is rice and fish and a kind of pepper you have not met. He puts you at the end of the table where the light is bad, which, you realise later, is a courtesy: it is where a guest can watch without being watched.\n\n'
        + (letter ? 'Salim of Melinde’s letter has been read. It is not mentioned. ' : '')
        + 'Over the sweet course, with no change of voice, one of the Jidda men asks what the King of Portugal wants of the sea. The room goes on eating.',
        [
          {
            label: 'Tell them plainly: the pepper and the road, and a flag on both',
            detail: 'The truth, and not all of it a comfort. They will repeat it exactly.',
            resolve: (gg) => {
              mark(gg, C1); gg.powers.seen['calecute:plain'] = gg.clock.t;
              gg.noteDeed('refusal.honest', { target: 'calicut', place: 'calecute', magnitude: 0.7, note: 'At the Koya’s Friday table, told the merchants of Jidda, Aden and Cambay plainly what the King of Portugal wants of the sea.' });
              return 'Nobody speaks for a time. The man from Cambay looks, for the first time, at you. Mammali says that it is long since he heard a captain say that in his house and be wrong about only half of it, and orders more rice.';
            },
          },
          {
            label: 'Say the King wants friendship and trade, and that is all',
            detail: 'The thing every ambassador says. They have heard it before and do not expect it to be tested.',
            resolve: (gg) => {
              mark(gg, C1);
              gg.noteDeed('courtesy.plain', { target: 'calicut', place: 'calecute', magnitude: 0.2, note: 'At the Koya’s Friday table, told the merchants the King of Portugal wants friendship and trade.' });
              return 'The Jidda man says that is what the last ambassador said. Mammali says that the last ambassador had not been asked at his table, and passes the dish.';
            },
          },
          {
            label: 'Say a captain is not the King’s mouth, and ask about the pepper instead',
            detail: 'Honest, and it spares you from making a promise for a man who is not present.',
            resolve: (gg) => {
              mark(gg, C1);
              gg.noteDeed('table.kept', { target: 'calicut', place: 'calecute', magnitude: 0.4, note: 'At the Koya’s Friday table, said a captain is not the King’s mouth and asked about the pepper.' });
              return 'The Aden man laughs, and the room with him. The Koya says that is the first thing a captain has said at his table that he believes, and tells you the price of the hills.';
            },
          },
        ]);
    },
  },
  {
    id: C2, stage: 'trusted', after: [C1], wait: 40,
    build: () => scene(C2, 'The grower’s advance',
      'The rains failed in the hills above Calecute. A third of the pepper the Koya’s house had advanced money against is not there, and the growers who took the advance are coming down to the weigh-house to say so, one family at a time, with their heads down. Mammali sits with the book open and does not look at them.\n\n'
      + 'He tells you what the Portuguese factor will do: buy at the market price of a short year, which is high, and let the growers settle. He tells you what the houses do: take a smaller price for the pepper that did come, and forgive the rest. He says it is a hard price for a house, and that it is the reason there will be pepper next year. He does not ask. The sum is sixty cruzados.',
      [
        {
          label: 'Pay the old price for the pepper that came, and let the Koya forgive the rest',
          detail: 'Sixty cruzados above the market. The families will remember the ship.',
          resolve: (gg) => {
            mark(gg, C2);
            if (gg.crown.gold < 60) return 'You have not sixty cruzados, and Mammali, who has known it from the first, closes the book on it for the season.';
            gg.crown.gold -= 60;
            gg.noteDeed('mercy.shown', { target: 'calicut', place: 'calecute', magnitude: 0.6, note: 'Paid the old price for the pepper that came in a failed year, sixty cruzados above the market, so the Koya could forgive the growers’ advance.' });
            return 'Mammali writes it in the book without comment. A grower’s wife, at the foot of the steps, says something to her husband that the interpreter does not translate.';
          },
        },
        {
          label: 'Buy at the market price, as the factor would, and take the pepper',
          detail: 'A fair price for a short year. No one can say you cheated.',
          resolve: (gg) => {
            mark(gg, C2);
            gg.noteDeed('contract.kept', { target: 'calicut', place: 'calecute', magnitude: 0.3, note: 'Bought the short year’s pepper at the market price from the Koya’s house.' });
            return 'Mammali nods and has the pepper weighed. He says a fair price is not a thing to apologise for, and the growers go home without a word.';
          },
        },
        {
          label: 'Say you will buy nothing in a short year and sail on',
          detail: 'Prudent, and no one is wronged. The pepper goes to a Red Sea ship.',
          resolve: (gg) => {
            mark(gg, C2);
            gg.noteDeed('refusal.curt', { target: 'calicut', place: 'calecute', magnitude: 0.2, note: 'Declined to buy any pepper in the failed year at Calecute.' });
            return 'Mammali says the Red Sea ships are glad of a short year. He says it without bitterness, and has the book closed.';
          },
        },
      ]),
  },
  {
    id: C3, stage: 'partner', after: [C2], wait: 30,
    build: () => scene(C3, 'A letter for Cochim',
      'Mammali has a letter. It is written in Arabic, in his own hand, for a Mappila house at Cochim that has dealt with his for forty years and that stands in the Raja’s good grace. The Zamorin and the Raja of Cochim are not friends, and the letter is nothing a Zamorin’s officer would be glad to see carried. It is also nothing a Raja’s officer would be glad to see. It says that a debt is settled, and that the houses are as they were.\n\n'
      + 'He tells you what is in it before you ask, and tells you the risk to the ship, which is the Zamorin’s officer seeing it. He asks nothing. He says a letter that is shown is a letter that is safe, and that he trusts you to know whom to show it to.',
      [
        {
          label: 'Take it, and carry it to Cochim without a question',
          detail: 'Cochim lies ahead on the road. The Zamorin’s officer will not know unless he is told.',
          resolve: (gg) => {
            mark(gg, C3); gg.powers.seen['calecute:letter'] = gg.clock.t;
            for (const p of ['cochim', 'coulao']) regardAt(gg, p, 0.1);
            gg.noteDeed('parcel.carried', { target: 'cochin', place: 'calecute', magnitude: 0.5, note: 'Took the Koya Mammali’s letter to a Mappila house at Cochim: a debt settled, the houses as they were.' });
            return 'Mammali presses the letter into your hand. The seal is the Koya’s ring in green wax. He says that a house which sends no letters has no friends, and a house which sends many has enemies, and that he has chosen.';
          },
        },
        {
          label: 'Take it, and show it to the King’s factor first',
          detail: 'Open, and safe. The factor will know what the Koya writes, and the Koya will know you showed it.',
          resolve: (gg) => {
            mark(gg, C3); gg.powers.seen['calecute:letter'] = gg.clock.t;
            for (const p of ['cochim', 'coulao']) regardAt(gg, p, 0.05);
            gg.noteDeed('parcel.redeemed', { target: 'cochin', place: 'calecute', magnitude: 0.5, note: 'Took the Koya Mammali’s letter to Cochim, and showed it to the King’s factor first.' });
            return 'Mammali, when you tell him, says that he wrote it knowing it might be read. He says that a letter shown is a letter safe, and that he would rather have it shown by a man who said he would.';
          },
        },
        {
          label: 'Decline, and say a ship in the Zamorin’s roads cannot carry what the Zamorin would not wish',
          detail: 'Prudent, and honest about the reason. He will think you careful.',
          resolve: (gg) => {
            mark(gg, C3);
            gg.noteDeed('refusal.honest', { target: 'calicut', place: 'calecute', magnitude: 0.4, note: 'Told the Koya Mammali I could not carry his letter to Cochim while the ship lay in the Zamorin’s roads.' });
            return 'Mammali says that is a good reason and not a small one. He puts the letter in his sleeve and has the sherbet poured.';
          },
        },
      ]),
  },
  {
    id: C4, stage: 'partner', after: [C3], wait: 120,
    build: (g) => {
      const carried = g.powers.seen['calecute:letter'] !== undefined;
      const rule = g.powers.fronts.rule.stage;
      return scene(C4, 'The Koya’s pass',
        (carried
          ? 'The house at Cochim has answered, by a boat along the shore, and the boat beat the ship. Mammali reads out the answer in front of you, which he need not have done: the debt was settled and the houses are as they were, and the Cochim house adds that the bearer is trusted.\n\n'
          : 'An answer has come from Cochim by another hand. Mammali does not read it out. He says the houses are as they were, and that it is not nothing to have been asked.\n\n')
        + (rule >= 3 ? 'The sea has changed since you first called. Ships are being stopped off the coast, and the Koya’s dhows are among them; he does not say so, and does not need to. ' : 'The sea is still free, for now. Mammali does not think it will stay so. ')
        + 'He has a paper. It is a pass in his own hand, in Arabic and in Malayalam, that says the ship named in it is a friend of the Koya’s house, and that any house on the coast that honours the Koya may honour her.',
        [
          {
            label: 'Accept the pass, and say you will show it where it is asked and nowhere else',
            detail: 'It is worth more to you than any cargo, and it binds you to deal fairly with his people.',
            resolve: (gg) => {
              mark(gg, C4); gg.powers.seen['calecute:pass'] = gg.clock.t;
              gg.noteDeed('promise.kept', { target: 'calicut', place: 'calecute', magnitude: 0.6, note: 'Accepted the Koya Mammali’s pass for this ship, and gave my word to show it where it was asked and nowhere else.' });
              gg.crown.lifetimeStanding += 4;
              for (const p of ['cochim', 'coulao']) regardAt(gg, p, 0.08);
              return 'Mammali folds the paper into your hand and closes your fingers over it. He says it is worth only what the ship does with it, and that he has written it in Malayalam because the clerks who read Arabic are not always his.';
            },
          },
          {
            label: 'Thank him, and say a captain cannot carry a pass from a house the King has not named a friend',
            detail: 'Careful, and honest about the King. He will not press it.',
            resolve: (gg) => {
              mark(gg, C4);
              gg.noteDeed('gift.great', { target: 'calicut', place: 'calecute', magnitude: 0.4, note: 'Declined the Koya Mammali’s pass for this ship, and left him a gift for his sister’s son.' });
              return 'Mammali smiles and folds the paper away. He says a refusal that comes with a gift is a welcome one, and that he will say in the Zamorin’s hearing only that the ship was courteous.';
            },
          },
        ]);
    },
  },
];

export const CALECUTE: DeepPort = {
  port: 'calecute',
  patron: MAMMALI,
  calendar: CALENDAR,
  memory: MEMORY,
  arc: CALECUTE_ARC,
  invented: [
    'Mammali, Koya of the Mappila merchants (a title the coast used; the man is not real), his house and his sister’s son Pokker',
    'the Friday table, the failed crop and the grower’s advance, the letter to a Mappila house at Cochim, the pass in his hand',
    'the red-sea-fleet and pepper-months price multipliers, every sum and threshold',
    'The identity of the Zamorin and of the Zamorin’s officer is left generic.',
  ],
};
