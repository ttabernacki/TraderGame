import { clamp } from '../../core/math';
import type { Game } from '../../game/state';
import { mark, scene } from '../kit';
import type { ArcBeat, CalendarEntry, DeepPort, MemoryDef, PatronDef } from '../types';

/**
 * MELINDE (Malindi), the friend of anyone Mombaça hates: a Deep port (BUILD_PLAN D6).
 *
 * The Patron is Salim bin Abdalla, a nakhuda and keeper of the pilots' roll: the court's man for the harbour and the men who
 * take dhows across the monsoon. Hamisi bin Nasir, the mu'allim of src/company, is on his roll; the Patron asks after him.
 *
 * SOURCES AND WHAT IS INVENTED (docs/SOURCES.md, "Arguim, Melinde, Calecute and Lisbon as Deep ports (D6)"):
 *   documented  Melinde's quarrel with Mombasa and its welcome of the Portuguese; a Melinde pilot taking Gama across to
 *               India in 1498 (accounts differ on the man); the monsoons, kaskazi (north-east) and kusi (south-west), as the
 *               timetable of the Indian Ocean; mu'allims of the Arab and Gujarati sea who wrote rhymed rutters (Ibn Majid's
 *               Fawa'id is 1490); the long rains of the East African coast in March-May and the short rains of October-December.
 *   approximate the fleets from Cambay and Hormuz arriving with the north-east monsoon (Dec-Mar) and sailing for India on the
 *               south-west (Apr-Sep); the turning of the monsoon in April and October-November (read from the game's own wind).
 *   invented    Salim bin Abdalla and his house, the pilots' roll as a guild with rules (a ship that stops dhows is not piloted),
 *               the boy Sefu, the letter to Calecute, every sum; the Nairuzi festival is kept in March on an approximation of
 *               the Persian reckoning the Swahili coast used (the coast kept several), and is marked so.
 */

const SALIM: PatronDef = {
  id: 'salim', name: 'Salim bin Abdalla', title: 'nakhuda and keeper of the pilots’ roll', of: 'of Melinde, with a share in four dhows and a seat in the Sultan’s majlis',
  bio: [
    'Salim has taken ships to Cambay and Hormuz for thirty years and does not any longer. He keeps the roll: the names of the men the harbour will answer for as mu’allims, and the rule that no man on it takes a ship that stops dhows or breaks a safe-conduct.',
    'He sits at the Sultan’s right hand when the harbour is discussed, and at nobody’s when it is not. Melinde is small and frightened of Mombaça, and he has spent a lifetime making sure that it is useful to people who are not.',
    'He reads the Portuguese as he reads weather: what the ship does when nobody has asked it to.',
  ],
  visitWeight: 0.4, visitCap: 1.6,
  thresholds: [1.0, 3.0, 5.5],
  rules: [
    { tag: 'pilot.trusted', weight: 1.4, anywhere: true, why: 'Hired a pilot and read him right. Pilots at Melinde say you know a true man from a talker.' },
    { tag: 'pilot.misled', weight: -1.0, anywhere: true, why: 'Followed a pilot you did not check and were led astray; he keeps the roll and answers for such men.' },
    { tag: 'landfall.exact', weight: 0.5, anywhere: true, why: 'Raised a port where the reckoning said. A pilot respects a ship that keeps its board.' },
    { tag: 'landfall.lost', weight: -0.3, anywhere: true, why: 'Raised a port far from the reckoning.' },
    { tag: 'ship.stopped', weight: -1.8, anywhere: true, why: 'Boarded and carried a stranger. The dhows of his friends are strangers to the Portuguese, and the roll forbids a pilot to a ship that does it.' },
    { tag: 'ship.spared', weight: 0.8, anywhere: true, why: 'Let a stranger pass. It is the thing the roll was made to see.' },
    { tag: 'ship.succoured', weight: 0.9, anywhere: true, why: 'Went to the help of a ship in distress. That is the sea’s oldest rule.' },
    { tag: 'courtesy.kept', weight: 0.9, why: 'Asked how to greet the Sultan before acting.' },
    { tag: 'courtesy.broken', weight: -1.0, why: 'Stood where a stranger should have bowed.' },
    { tag: 'table.kept', weight: 0.7, anywhere: true, why: 'Kept a host’s table well.' },
    { tag: 'table.spoiled', weight: -0.6, anywhere: true, why: 'Spoiled a host’s table by ignorance of its rules.' },
    { tag: 'gift.great', weight: 0.8, why: 'Brought a gift that was praised in the majlis.' },
    { tag: 'gift.insult', weight: -0.8, why: 'Brought a gift that was mocked.' },
    { tag: 'promise.kept', weight: 1.0, anywhere: true, why: 'A word given and kept.' },
    { tag: 'promise.broken', weight: -2.0, anywhere: true, why: 'A word broken. The majlis is small, and everyone in it hears.' },
    { tag: 'peace.made', weight: 0.9, anywhere: true, why: 'Carried proposals between two states and made a peace. Melinde has never been able to afford a war.' },
    { tag: 'faith.respected', weight: 0.6, anywhere: true, why: 'Let a people keep its worship.' },
    { tag: 'faith.pressed', weight: -1.0, anywhere: true, why: 'Pressed the font on a people who had not asked.' },
    { tag: 'companion.freed', weight: 0.5, anywhere: true, why: 'Freed a man who served aboard against his will.' },
    { tag: 'parcel.carried', weight: 0.5, why: 'Carried a letter he gave you, with no question.' },
    { tag: 'chart.shared', weight: 0.3, anywhere: true, why: 'Gave a survey to a friend; a pilot reckons knowledge a gift.' },
  ],
  greet: {
    stranger: 'A tall man in the shade of the harbour house watches the ship come in, and what her people do on the stairs. He is shown no courtesy that he has not first been paid.',
    acquaintance: 'Salim bin Abdalla lifts a hand from the water-stairs. He knows the ship now, and which way she turns.',
    trusted: 'Salim has a mat laid out in the shade and coffee on it before the boat is up the stairs. He asks after the pilot first.',
    partner: 'Salim comes down to the water himself. Two boys carry your chest to his house, which is the house from which the harbour is run.',
  },
  rise: {
    acquaintance: 'Salim has stopped asking for your business at the stairs and now waits to be told it.',
    trusted: 'Salim says the roll has your ship in it, in the margin, in his hand. It does not say she is a friend. It says she is not an enemy of the sea.',
    partner: 'Salim speaks of your ship at the majlis as "ours". The Sultan’s people write it down, and some of them wish they had not heard.',
  },
  reactions: {
    'pilot.trusted': 'Salim has heard how you chose your pilot. He says the roll is made of exactly that: someone who looked, and was right.',
    'pilot.misled': 'Salim has heard of the pilot who did not know his sea. He says the roll would not have had him, and that he is sorry you did not ask.',
    'ship.stopped': 'Salim does not come down to the stairs. A boy says the nakhuda is at his dhows, and that the roll is not open this week.',
    'ship.spared': 'Salim has heard that you let a dhow pass. He says nothing about the dhow. He says the monsoon has been kind, and pours coffee.',
    'ship.succoured': 'Salim has heard how you went alongside a ship that was sinking. He says the sea keeps a book too.',
    'courtesy.broken': 'Salim says the Sultan’s people have not forgotten where you stood. He says it as a pilot gives a depth.',
    'promise.kept': 'Salim has heard you kept your word where it cost you. He says it is rare enough on this coast to be a kind of safe-conduct.',
    'promise.broken': 'Salim looks at you for a long time and then out at the harbour. He says the majlis is small.',
    'gift.insult': 'Salim has heard about the gift. He is courteous about it in the way that makes it worse.',
    'peace.made': 'Salim has heard that you carried words between two houses and a peace came of it. He says Melinde has been trying to do that for forty years and has never had a ship to carry them.',
  },
  perks: [
    { id: 'word', stage: 'acquaintance', kind: 'rumour', text: 'Once a call he will tell you how the sea stands: the fleets expected, who is said to be at war, and what the pilots say of the turning of the wind.' },
    { id: 'second', stage: 'trusted', kind: 'rumour', text: 'His pilots will say whether a tale of the Swahili coast is told the same way at their end. No charge.' },
    { id: 'hamisi', stage: 'trusted', kind: 'pilot', text: 'He will answer for the ship to Hamisi bin Nasir and the roll: Hamisi will hear you out even if the quay’s word of you has been mixed. The word of what the ship has done at sea he cannot change.' },
    { id: 'credit-1', stage: 'trusted', kind: 'credit', value: 200, text: 'A Gujarati house in the town will let a note run on his word while you lie here: up to 200 cruzados.' },
    { id: 'credit-2', stage: 'partner', kind: 'credit', value: 400, supersedes: 'credit-1', text: 'A Gujarati house in the town will let a note run on his word while you lie here: up to 400 cruzados.' },
    { id: 'dues', stage: 'trusted', kind: 'dues', value: 0.94, text: 'The harbour dues are written down six parts in a hundred lighter: he keeps the harbour’s book.' },
    { id: 'pilot-loan', stage: 'partner', kind: 'hint', text: 'He will put the ship’s name to the Sultan for a loan of pilots to the Malabar coast, as the court does for ships it counts as friends: a grant that costs gifts, runs for years, and is lost by stopping dhows.' },
    { id: 'house', stage: 'partner', kind: 'house', value: 0.75, text: 'A House in the town costs a quarter less: he stands surety for the ground in the majlis.' },
  ],
  front: 'crescent',
  aside: (g) => {
    const hired = g.company.hired.includes('hamisi');
    const aboard = g.crew.officers.find((o) => o.arc === 'hamisi' && o.alive && !o.ashoreAt);
    if (aboard) return 'Salim asks after Hamisi bin Nasir, who is on his roll and in your ship. He asks it the way a man asks after a son who writes seldom.';
    if (hired && g.crew.officers.some((o) => o.arc === 'hamisi' && !o.alive)) return 'Salim has had word that Hamisi bin Nasir is dead. He has had the name read at the harbour house, and he does not say more.';
    if (hired) return 'Salim says Hamisi bin Nasir left your ship in good standing, and that the roll has his name where it was.';
    if (g.company.seen.includes('hamisi:seen')) return 'Hamisi bin Nasir is still asking at the water-stairs which ship this is. Salim says that is what a mu’allim does with a captain he has not yet decided about.';
    return null;
  },
};

const CALENDAR: CalendarEntry[] = [
  {
    id: 'kaskazi-fleets', name: 'The fleets of the north-east monsoon', kind: 'fleet', months: [12, 1, 2, 3], grade: 'approximate',
    price: { calico: 0.92, arroz: 0.95 },
    text: 'The dhows from Cambay and Hormuz run down on the kaskazi, and the roads are full of masts. Cloth is cheap on the quay, the pilots are busy, and every captain in the town has a cousin to ask after.',
  },
  {
    id: 'nairuzi', name: 'Nairuzi', kind: 'fair', months: [3], days: [20, 23], grade: 'approximate',
    text: 'The new year is kept after the old Persian reckoning, with a bathing, a feast and a mock fight on the shore. It is not the ship’s feast and does not need to be. A captain who is seen on the quay is remembered.',
  },
  {
    id: 'long-rains', name: 'The long rains', kind: 'rains', months: [3, 4, 5], grade: 'documented', fever: 1.5,
    text: 'The masika rains. The roads are red mud, the anchorage is rough, and the fever comes up from the creeks. Men who sleep ashore in these weeks do not always wake well.',
  },
  {
    id: 'turning-sw', name: 'The turning', kind: 'fair', months: [4], days: [5, 26], grade: 'documented',
    text: 'The wind is between the kaskazi and the kusi: calms, squalls and the six weeks the pilots call the turning. Fleets bound for India wait for it to settle, and the town is busy with waiting.',
  },
  {
    id: 'kusi-sailing', name: 'The sailing for India', kind: 'fleet', months: [5, 6, 7, 8, 9], grade: 'approximate',
    price: { marfim: 1.03, ouro: 1.02 },
    text: 'The kusi blows, and the Gujarati and Arab ships take it for Malabar. Anyone who wants a pilot now has to ask before the fleet has the best of them.',
  },
  {
    id: 'short-rains', name: 'The short rains', kind: 'rains', months: [10, 11], grade: 'documented', fever: 1.3,
    text: 'The vuli, a shorter wet season. The turning of the wind is in the same weeks, and nothing sails.',
  },
];

const MEMORY: MemoryDef = {
  lines: {
    'pilot.trusted': 'The pilots on the stairs say you know a true man from a talker. They look at their own hands when they say it.',
    'pilot.misled': 'The pilots on the stairs tell of a captain who followed a man who did not know his sea. They are not unkind about it.',
    'ship.stopped': 'There is a dhow in the roads that has been boarded by the Portuguese. Nobody on the stairs mentions it when you are there.',
    'ship.spared': 'A dhow master in the roads tells of a Portuguese ship that stood off and let him pass.',
    'ship.succoured': 'The story of the ship you went alongside has come down the coast ahead of you, and has grown a mast.',
    'courtesy.kept': 'At the harbour house it is remembered that you asked how to greet the Sultan before you did.',
    'courtesy.broken': 'The Sultan’s people have not forgotten where you stood.',
    'promise.kept': 'The majlis counts your word as one of the things it can use.',
    'promise.broken': 'A word broken at Melinde is repeated at Mombaça with pleasure.',
    'gift.great': 'The gift is still talked of in the majlis, and is a little larger each time.',
    'gift.insult': 'They tell the story of the tray in the majlis and on the stairs.',
    'peace.made': 'In the harbour house they say a Portuguese carried words between two houses and a peace came of it.',
    'faith.pressed': 'The people of the town remember who was taken to the font.',
    'faith.respected': 'The people of the town noticed that you left their prayers alone.',
    'companion.freed': 'The pilots on the stairs know the name of the man you freed, and the name of the ship.',
    'table.kept': 'They say you kept their table, and the story is told without any surprise.',
  },
  effects: [
    { tag: 'pilot.trusted', dues: -0.02, regard: 0.1 },
    { tag: 'pilot.misled', regard: -0.05 },
    { tag: 'ship.stopped', dues: 0.07, price: { calico: 0.03 }, regard: -0.25 },
    { tag: 'ship.spared', dues: -0.03, regard: 0.12 },
    { tag: 'ship.succoured', dues: -0.02, regard: 0.15 },
    { tag: 'courtesy.kept', regard: 0.08 },
    { tag: 'courtesy.broken', dues: 0.03, regard: -0.15 },
    { tag: 'promise.kept', regard: 0.08 },
    { tag: 'promise.broken', dues: 0.05, regard: -0.2 },
    { tag: 'gift.great', dues: -0.02, price: { calico: -0.02 }, regard: 0.1 },
    { tag: 'gift.insult', dues: 0.03, regard: -0.15 },
    { tag: 'peace.made', dues: -0.03, regard: 0.15 },
    { tag: 'faith.pressed', dues: 0.04, regard: -0.2 },
    { tag: 'faith.respected', regard: 0.1 },
  ],
};

// ---------------------------------------------------------------------------------------------
// The arc: the boy on the roll, a question about dhows, Hamisi's due, the letter to Calecute. The letter goes FORWARD, to Mammali
// Koya at Calecute, whose Patron track counts it (a deed with target 'calecute' is Calecute's to remember).

const M1 = 'melinde-arc-1';
const M2 = 'melinde-arc-2';
const M3 = 'melinde-arc-3';
const M4 = 'melinde-arc-4';

const regardAt = (g: Game, port: string, d: number): void => { const r = g.relationsFor(port); r.regard = clamp(r.regard + d, -1, 1); };

export const MELINDE_ARC: ArcBeat[] = [
  {
    id: M1, stage: 'trusted',
    build: () => scene(M1, 'A boy for the roll',
      'Salim has a boy with him in the harbour house: Sefu, thirteen, his sister’s grandson, who has been on dhows since he could stand on a thwart and has never been out of sight of a coast he knew. A pilot’s roll is made one name at a time, and the boy has been refused it twice for being young.\n\n'
      + 'Salim does not ask for anything. He says that a boy who goes to India with a ship he has not yet decided about learns more in one passage than in five on the home water. He says it as he would give a depth, and then he talks of the weather.',
      [
        {
          label: 'Take Sefu aboard as a deckhand for the passage, and answer for him',
          detail: 'The ship feeds him and the pilot teaches him. You answer to Salim for what comes back.',
          resolve: (gg) => {
            mark(gg, M1); gg.powers.seen['melinde:sefu'] = gg.clock.t;
            gg.noteDeed('promise.kept', { target: 'malindi', place: 'melinde', magnitude: 0.5, note: 'Took Salim bin Abdalla’s great-nephew Sefu aboard as a deckhand for the passage, and answered for him.' });
            return 'Salim looks at the boy and not at you. The boy looks at the ship. A pouch of dates and a rolled mat go aboard before dark, and nobody says whose they are.';
          },
        },
        {
          label: 'Say the ship is no school, and that you will not have a boy on her you cannot teach',
          detail: 'Honest, and no one is hurt. He will know the limit of what the ship can be.',
          resolve: (gg) => {
            mark(gg, M1);
            gg.noteDeed('refusal.honest', { target: 'malindi', place: 'melinde', magnitude: 0.4, note: 'Told Salim bin Abdalla I could not take his great-nephew; the ship is no school.' });
            return 'Salim says that is fair, and that it is a thing few captains say. The boy goes back to the dhows.';
          },
        },
        {
          label: 'Offer to pay for the boy’s place on another ship of the roll',
          detail: 'Ten cruzados to a house you do not know, to a master you have not met.',
          resolve: (gg) => {
            mark(gg, M1);
            if (gg.crown.gold < 10) return 'You have not got ten cruzados, and Salim, who has known the sum from the first, says nothing more about it.';
            gg.crown.gold -= 10;
            gg.noteDeed('gift.great', { target: 'malindi', place: 'melinde', magnitude: 0.3, note: 'Paid ten cruzados toward Sefu’s place on another ship of the pilots’ roll.' });
            return 'Salim takes it as one takes a thing that was not asked. He says the boy will go on a Cambay ship in the spring, and that you will be told how he does.';
          },
        },
      ]),
  },
  {
    id: M2, stage: 'trusted', after: [M1], wait: 40,
    build: (g) => {
      const stopped = g.ledger.some((e) => e.tag === 'ship.stopped');
      return scene(M2, 'The roll’s question',
        'A dhow of a house Salim has known for forty years is overdue from Cambay, and a boat from the south has brought the tale that a Portuguese ship stopped one off the coast of Mombaça and took a part of her cargo. It is only a tale; nobody knows whose dhow or whose ship. The majlis has asked Salim what the roll is to do about a ship that may have done it.\n\n'
        + 'He asks you, across the coffee, as one asks a question of the weather. ' + (stopped ? 'There is an entry in your Ledger that he has not seen and that you have. ' : 'There is nothing in your Ledger to answer it. ') + 'He wants to know what you would say if he were to put it to the majlis.',
        [
          {
            label: stopped ? 'Say plainly what this ship has done, and what she has not' : 'Say plainly that this ship has stopped no dhow',
            detail: stopped ? 'The truth costs you something here. He asked as a friend and will not forget the answer.' : 'True, and there is nothing to lose by saying it.',
            resolve: (gg) => {
              mark(gg, M2);
              if (stopped) {
                gg.noteDeed('refusal.honest', { target: 'malindi', place: 'melinde', magnitude: 0.7, note: 'Told Salim bin Abdalla plainly what this ship has done in the way of stopping strangers, and what she has not.' });
                return 'Salim listens to the end. He says that the roll has a rule, and that he has now heard a captain say the thing that rule exists to hear. He does not say what he will do about the rule.';
              }
              gg.noteDeed('courtesy.kept', { target: 'malindi', place: 'melinde', magnitude: 0.4, note: 'Told Salim bin Abdalla plainly that this ship has stopped no dhow.' });
              return 'Salim says it will be put to the majlis in those words. He says he is glad of an answer that is easy to carry.';
            },
          },
          {
            label: 'Say this ship has never stopped a dhow',
            detail: stopped ? 'It is not true. The Ledger has it.' : 'True, but you say it flatly and with an air.',
            resolve: (gg) => {
              mark(gg, M2);
              if (stopped) {
                gg.noteDeed('promise.broken', { target: 'malindi', place: 'melinde', magnitude: 0.8, note: 'Told Salim bin Abdalla this ship had never stopped a dhow, when she had.' });
                return 'Salim says that the roll thanks you. He pours the coffee himself. Two evenings later a boy tells you the nakhuda has been hearing from his cousins in the south.';
              }
              return 'Salim says that the roll thanks you, and that it is a thing for the majlis to hear, not for him to doubt.';
            },
          },
          {
            label: 'Say a captain does not answer to a pilots’ roll',
            detail: 'The truth as you see it. He will hear the last half of it first.',
            resolve: (gg) => {
              mark(gg, M2);
              gg.noteDeed('courtesy.broken', { target: 'malindi', place: 'melinde', magnitude: 0.5, note: 'Told Salim bin Abdalla a captain does not answer to the pilots’ roll.' });
              return 'Salim bows his head a very little. He says the roll does not ask a captain anything he does not want to be asked, and that it is long.';
            },
          },
        ]);
    },
  },
  {
    id: M3, stage: 'partner', after: [M2], wait: 30,
    build: (g) => {
      const aboard = g.crew.officers.find((o) => o.arc === 'hamisi' && o.alive && !o.ashoreAt);
      return scene(M3, aboard ? 'What is owed to Hamisi' : 'The mu’allim at the stairs',
        (aboard
          ? 'Salim comes aboard, which he has not done before. He asks to see Hamisi, and for a quarter of an hour the two of them speak at the rail in a Swahili too fast for the língua. When they have finished Salim comes aft and says that a mu’allim of the roll who sails in a foreign ship owes the roll a tithe of what he learns, and the ship owes the mu’allim a part of the pepper he brings it. He says Hamisi has not asked. He says Hamisi would not.\n\n'
          : 'Hamisi bin Nasir is on the stairs again, as he has been each time you have called, looking at the ship. Salim says that Hamisi has asked him for a name, and that he has given it, and that he is not at all sure it was the right one. He asks what the ship would pay a mu’allim of the roll for a passage to Calecute, if he were to name one.\n\n')
        + 'He waits for a number, and is not above waiting.',
        [
          {
            label: aboard ? 'Write a share into the book in front of Salim and the clerk' : 'Name a master’s share of the voyage, in front of Salim',
            detail: 'Forty cruzados now, a share of the pepper after. Hamisi, if he is aboard, will hear it said.',
            resolve: (gg) => {
              mark(gg, M3);
              const pay = Math.min(40, Math.max(0, Math.floor(gg.crown.gold)));
              gg.crown.gold -= pay;
              gg.noteDeed('contract.kept', { target: 'malindi', place: 'melinde', magnitude: 0.5, note: `Wrote a master’s share into the book in front of Salim bin Abdalla for the pilot of the passage to Calecute, ${pay} cruzados down.` });
              return 'Salim reads the figure back. He says it is what the roll would have asked, and a little more than the roll would have dared to. The figure is written twice.';
            },
          },
          {
            label: 'Offer the usual pilot’s wage and no more',
            detail: 'Fair by the Casa’s book. Salim will not argue, and will not forget the word "usual".',
            resolve: (gg) => {
              mark(gg, M3);
              gg.noteDeed('refusal.curt', { target: 'malindi', place: 'melinde', magnitude: 0.3, note: 'Offered Salim bin Abdalla the usual pilot’s wage for the passage to Calecute and no more.' });
              return 'Salim says that is a figure. He pours the coffee himself, and does not say whose figure.';
            },
          },
        ]);
    },
  },
  {
    id: M4, stage: 'partner', after: [M3], wait: 120,
    build: (g) => {
      const sefu = g.powers.seen['melinde:sefu'] !== undefined;
      return scene(M4, 'A letter for the Koya',
        (sefu
          ? 'Sefu is back from the Cambay ship, taller and sunburnt, with a mark on his roll beside his name that Salim shows you with some effort at a straight face. He says the boy did well, and that what he learned was how little he had known.\n\n'
          : 'A Cambay ship has come in with the news that the boy Sefu is on her roll at last, with a mark beside his name. Salim says it as one says a depth.\n\n')
        + 'Salim has a letter. It is in his own hand and sealed with the roll’s mark, and it is for Mammali, the Koya of the Mappila merchants at Calecute, with whom his house has dealt for as long as there has been a Calecute for it to deal with. It says one thing: that the bearer is not an enemy of the sea. He asks you to carry it east, and to let the Koya read it before he speaks.',
        [
          {
            label: 'Take the letter and carry it to Calecute',
            detail: 'It goes forward along the road. The Koya’s house will have heard of the ship before she is in the roads.',
            resolve: (gg) => {
              mark(gg, M4); gg.powers.seen['melinde:letter'] = gg.clock.t;
              regardAt(gg, 'calecute', 0.12);
              gg.noteDeed('parcel.carried', { target: 'calecute', place: 'melinde', magnitude: 0.5, note: 'Took Salim bin Abdalla’s letter to Mammali, the Koya of the Mappila merchants at Calecute, saying that the bearer is not an enemy of the sea.' });
              gg.crown.lifetimeStanding += 3;
              return 'Salim presses it into your hand and closes your fingers over the seal. He says the monsoon will take it faster than the ship, and that the Koya will read it before you land.';
            },
          },
          {
            label: 'Tell him the voyage turns for home before Calecute',
            detail: 'Nothing is lost on either side. There is always a dhow going east.',
            resolve: (gg) => {
              mark(gg, M4);
              gg.noteDeed('refusal.honest', { target: 'malindi', place: 'melinde', magnitude: 0.3, note: 'Told Salim bin Abdalla I could not carry his letter to Calecute.' });
              return 'Salim says that in the right month there is always a dhow going east, and that it is the sea’s kindness. He puts the letter in his sleeve.';
            },
          },
        ]);
    },
  },
];

export const MELINDE: DeepPort = {
  port: 'melinde',
  patron: SALIM,
  calendar: CALENDAR,
  memory: MEMORY,
  arc: MELINDE_ARC,
  invented: [
    'Salim bin Abdalla, his house, the great-nephew Sefu, the pilots’ roll as a guild with a rule against ships that stop dhows',
    'the letter to Mammali Koya at Calecute; the dhow overdue from Cambay; every sum, multiplier and threshold',
    'Nairuzi on 20-23 March (the Swahili coast kept more than one new year; the date is approximate)',
    'The identity of the Sultan and of the majlis is left generic. Hamisi bin Nasir is the company’s (src/company), not this file’s.',
  ],
};
