import { clamp, type LatLon } from '../../core/math';
import { end, go, later, portMark, renown, scene, thread, writeTheSea } from '../arc';
import { HOME_PORTS, ports, seaNear } from '../places';
import { eq, has } from '../qualities';

/**
 * Who you are: one backstory arc for each way of coming to this coast (BUILD_PLAN E1: REWORKED). Each is offered to the
 * captain whose origin it belongs to, runs down the road in order, and writes what it did as qualities, Ledger tags and
 * the line of the last page (`originEnding`).
 */

// ---------------------------------------------------------------------------
// 7–10. Who you are: one thread for each way of coming to this coast
//
// Each runs down the road in order — a port in the first leg, one on the Guinea
// coast or the Cape, one at the far end — and each ends by deciding a line of
// the last page of the career. They are offered to the captain whose origin they
// belong to, at any of the ports he leaves Portugal by.


/** A headland on the Swahili coast that nobody has put a name to. */
const UNNAMED_CAPE: LatLon = { lat: -3.75, lon: 40.05 };
/** The bay with the bar across it, south of Benguela. */
const FATHERS_BAY: LatLon = { lat: -16.65, lon: 11.75 };

export const nome = thread({
  id: 'nome',
  title: 'A Name of Your Own',
  blurb: 'Your brother has the house. Make something that is yours, and put your name on it.',
  offeredAt: HOME_PORTS,
  requires: [eq('origin', 'segundo')],
  offer: () => ({
    who: 'A letter in your brother’s hand',
    text: 'It is four lines long and the third is about money. Duarte has the house, the land and the '
      + 'name, and he has also got into debt to a neighbour, and has remembered that he has a brother '
      + 'with a ship. His steward is on the quays somewhere, and will find you.',
    accept: 'Read the rest, and meet the steward',
  }),
  first: 'steward',
  steps: {
    steward: {
      goal: () => 'Meet your brother’s steward, at Lisbon, Lagos or Funchal.',
      marker: () => portMark('lagos', 'Your brother’s steward'),
      at: ports(...HOME_PORTS),
      hooks: ['younger'],
      scene: (_g, q) => scene(q, 'steward', 'Duarte’s steward',
        'He has been a month on the quays, waiting, and is polite about it. Duarte wants a hundred and '
        + 'twenty cruzados against the neighbour. The steward also happens to know that the '
        + 'donatary’s agent is letting cane land above the town to any man who will put up a mill, '
        + 'and that nobody with a brother and an entail has ever been offered it.',
        [
          {
            label: 'Send Duarte the hundred and twenty',
            detail: '120 cruzados. He will remember it, and so will the neighbour.',
            resolve: (gg) => {
              if (gg.crown.gold < 120) return later(q, 'You cannot find the hundred and twenty. The steward will wait.');
              gg.crown.gold -= 120;
              renown(gg, 6);
              q.flags.kin = true;
              return go(gg, q, 'younger', 'Sent Duarte a hundred and twenty cruzados against the neighbour. '
                + 'The steward wrote it down as a loan, which it is not.');
            },
          },
          {
            label: 'Take the cane land above the town',
            detail: 'The lot and the water, on the donatary’s terms. A mill of your own, in your own name.',
            resolve: (gg) => {
              q.flags.land = true;
              return go(gg, q, 'younger', 'Took the cane land above Funchal in your own name. It is the first '
                + 'thing you have ever owned that nobody had to die for.');
            },
          },
          {
            label: 'Send the steward back with nothing',
            detail: 'You did not take a ship to be your brother’s purse.',
            resolve: (gg) => {
              renown(gg, 10);
              q.flags.proud = true;
              return go(gg, q, 'younger', 'Sent Duarte’s steward home with nothing. It was not kind, and '
                + 'the men on the quay who heard about it thought better of you.');
            },
          },
        ]),
    },
    younger: {
      goal: () => 'Look for another man who is out here for the same reason: the garrison at São Jorge da Mina.',
      marker: () => portMark('mina', 'The captain of the garrison'),
      at: ports('mina'),
      hooks: ['name'],
      scene: (_g, q) => scene(q, 'younger', 'The captain of the garrison',
        'Rui Mendes commands forty men in a fort that is the most valuable building in Africa, and is '
        + 'a second son from the Alentejo who has not seen his family in six years. He asks, without '
        + 'looking at you, whether you would stand surety for the lime and timber he needs to mend '
        + 'the north wall — a hundred and fifty, to be repaid by the Casa “in due course”.',
        [
          {
            label: 'Stand surety for him',
            detail: '150 cruzados now. The Casa’s due course is long; a man who remembers is rarer.',
            resolve: (gg) => {
              if (gg.crown.gold < 150) return later(q, 'You cannot stand surety for what you have not got.');
              gg.crown.gold -= 150;
              renown(gg, 15);
              q.flags.friend = true;
              return go(gg, q, 'name', 'Stood surety for Rui Mendes’s north wall at Mina. He shook your hand '
                + 'as if he were afraid it might be taken back.');
            },
          },
          {
            label: 'Drink his wine, and say no',
            detail: 'You cannot afford to be everybody’s brother.',
            resolve: (gg) => go(gg, q, 'name', 'Drank Rui Mendes’s wine at Mina and did not stand surety. '
              + 'He did not seem surprised.'),
          },
        ]),
    },
    name: {
      goal: () => 'Find the headland past Melinde that nobody has put a name to. It is yours to give.',
      marker: () => ({ lat: UNNAMED_CAPE.lat, lon: UNNAMED_CAPE.lon, nm: 70, label: 'An unnamed headland' }),
      at: seaNear(UNNAMED_CAPE.lat, UNNAMED_CAPE.lon, 40, { shoreMax: 22 }),
      hooks: [],
      scene: (_g, q) => scene(q, 'name', 'A headland with no name',
        'It is low, green at the top and pale at the foot, and the pilots’ book calls it nothing. The '
        + 'King’s factor at Melinde has said, more than once, that whatever a captain names he may '
        + 'keep, for what that is worth in an empty country. There is a padrão in the hold. What '
        + 'is it to be called?',
        [
          {
            label: 'Cabo do Segundo, for yourself',
            detail: 'Your own name on a chart. A second son does not get many chances.',
            resolve: (gg) => {
              renown(gg, 70);
              gg.chart.addPlace('Cabo do Segundo', 'cape', UNNAMED_CAPE, gg.clock.t);
              return end(gg, q, 'self', 'Named the headland past Melinde for yourself, and set a padrão on it. '
                + 'Duarte will hear of it in a year.');
            },
          },
          {
            label: q.flags.friend ? 'Cabo Mendes, for the man at Mina' : 'Cabo de Duarte, for your brother',
            detail: q.flags.friend ? 'A second son you once stood surety for.' : 'The house will have it in the will.',
            resolve: (gg) => {
              const friend = !!q.flags.friend;
              renown(gg, friend ? 40 : 30);
              gg.crown.gold += friend ? 600 : 0;
              gg.chart.addPlace(friend ? 'Cabo Mendes' : 'Cabo de Duarte', 'cape', UNNAMED_CAPE, gg.clock.t);
              return end(gg, q, friend ? 'friend' : 'brother', friend
                ? 'Named the headland past Melinde for Rui Mendes. The Casa paid his surety back, and he '
                  + 'sent you six hundred cruzados and a great many pages of thanks.'
                : 'Named the headland past Melinde for your brother, and sent him the word. It is the first '
                  + 'time in your life he has had something of yours to be proud of.');
            },
          },
          {
            label: 'Cabo da Boa Vista, and leave it at that',
            detail: 'A name anyone could have. Nobody can say you took anything.',
            resolve: (gg) => {
              renown(gg, 25);
              gg.chart.addPlace('Cabo da Boa Vista', 'cape', UNNAMED_CAPE, gg.clock.t);
              return end(gg, q, 'plain', 'Named the headland past Melinde for what it looks like.');
            },
          },
        ]),
    },
  },
});

export const ficheiro = thread({
  id: 'ficheiro',
  title: 'The File',
  blurb: 'Somebody keeps a file on your family. A cousin, a clerk and a far coast will decide what is in it.',
  offeredAt: HOME_PORTS,
  requires: [eq('origin', 'converso')],
  offer: () => ({
    who: 'Your cousin Isaac, at the quay',
    text: 'You are not supposed to know him in public, and he knows it, and he has come anyway. He '
      + 'copied tables for a master at Salamanca who has since had to leave Spain, and he has a '
      + 'set of corrected declinations that the Casa’s pilots do not have and would pay a great deal '
      + 'for. He wants to put them in the hands of a navigator. He does not want to be the '
      + 'man who sold them.',
    accept: 'Hear what he is asking',
  }),
  first: 'cousin',
  steps: {
    cousin: {
      goal: () => 'Take cousin Isaac’s tables, at Lisbon, Lagos or Funchal.',
      marker: () => portMark('lagos', 'Cousin Isaac'),
      at: ports(...HOME_PORTS),
      hooks: ['clerk'],
      scene: (_g, q) => scene(q, 'cousin', 'Corrected tables',
        'They are in a flat case, ruled in a hand you know from the letters at home: the sun’s '
        + 'declination for every day of four years, worked again from the master’s observations and '
        + 'two degrees better than anything in the Casa. Isaac wants a hundred and twenty for his '
        + 'trouble, or a navigator who will say where they came from if asked. He is shaking a little.',
        [
          {
            label: 'Pay him the hundred and twenty',
            detail: 'A clean purchase. Nobody will need to say where they came from.',
            resolve: (gg) => {
              if (gg.crown.gold < 120) return later(q, 'You have not got the hundred and twenty. Isaac will wait a little.');
              gg.crown.gold -= 120;
              q.flags.tables = true;
              renown(gg, 6);
              return go(gg, q, 'clerk', 'Bought Isaac’s corrected tables for a hundred and twenty. They are '
                + 'in the chart case under the Casa’s own.');
            },
          },
          {
            label: 'Say you will vouch for him',
            detail: 'Free, and it puts your name next to his if anybody asks.',
            resolve: (gg) => {
              q.flags.tables = true;
              q.flags.vouched = true;
              renown(gg, 12);
              return go(gg, q, 'clerk', 'Took Isaac’s tables and said you would vouch for where they '
                + 'came from. He cried, and then was ashamed that he had.');
            },
          },
          {
            label: 'Send him away, for both your sakes',
            detail: 'The file is thinner without him.',
            resolve: (gg) => go(gg, q, 'clerk', 'Told Isaac you could not be seen with him, and watched him '
              + 'believe it.'),
          },
        ]),
    },
    clerk: {
      goal: () => 'The Casa’s clerk at Arguim keeps a book. Call on him.',
      marker: () => portMark('arguim', 'The Casa’s clerk'),
      at: ports('arguim'),
      hooks: ['malabar'],
      scene: (_g, q) => scene(q, 'clerk', 'The clerk at Arguim',
        'He is pleasant, stout and very well informed, and he asks after Isaac by name. '
        + 'He is not threatening you; he would not know how. It is a thing he has been told to keep '
        + 'track of, and a captain who is useful can make the keeping of it very much shorter.',
        [
          {
            label: 'Pay him for his silence',
            detail: '150 cruzados. It buys this year, not the next.',
            resolve: (gg) => {
              if (gg.crown.gold < 150) return later(q, 'You have not got a hundred and fifty. The clerk will be at Arguim a while yet.');
              gg.crown.gold -= 150;
              q.flags.paid = true;
              return go(gg, q, 'malabar', 'Paid the Casa’s clerk at Arguim a hundred and fifty cruzados '
                + 'to forget a name.');
            },
          },
          {
            label: 'Hand him the coast',
            detail: 'Every sounding and headland of the passage, written out clean. Being useful is the only coin the file respects.',
            resolve: (gg) => {
              renown(gg, 18);
              q.flags.useful = true;
              return go(gg, q, 'malabar', 'Gave the Casa’s clerk at Arguim a fair copy of the coast you '
                + 'have sailed. He read it twice and closed the book a little more slowly than he opened it.');
            },
          },
          {
            label: 'Remind him who lends to the Crown',
            detail: 'A word to Marchionni would be heard. It would also be remembered.',
            resolve: (gg) => {
              gg.finance.regard('marchionni', 4);
              q.flags.threat = true;
              return go(gg, q, 'malabar', 'Mentioned the Florentine house to the clerk at Arguim. He stopped '
                + 'asking about Isaac. He did not stop writing.');
            },
          },
        ]),
    },
    malabar: {
      goal: () => 'There is a community at Cochim that has a word for you. Go there.',
      marker: () => portMark('cochim', 'The Jews of Cochim'),
      at: ports('cochim'),
      hooks: [],
      scene: (_g, q) => scene(q, 'malabar', 'The old community',
        'They have been here longer than the Portuguese have had ships, and they have been '
        + 'expecting a captain with a name like yours for some time. A merchant in a white coat '
        + 'asks, politely, about your cousin, and then about the Casa’s clerk at Arguim, and '
        + 'then sets down three things on the table: a list of what the Zamorin’s factors have been '
        + 'paid, the price of pepper by the week, and a letter for your family.'
        + (q.flags.vouched ? ' He mentions, as one mentions a debt, that you put your name beside Isaac’s.'
          : q.flags.threat ? ' He is careful not to ask what you meant by the Florentine house, when you said it to the clerk.' : ''),
        [
          {
            label: 'Take the letter, and trade with them',
            detail: 'Their credit is good on this coast, and they will say so to any house in Lisbon.',
            resolve: (gg) => {
              const closed = !!(q.flags.paid || q.flags.useful) && !!q.flags.tables;
              gg.finance.regard('marchionni', 6);
              gg.finance.regard('affaitati', 6);
              if (closed) {
                gg.secretsHeard.push('file-closed');
                renown(gg, 40);
                return end(gg, q, 'closed', 'The file was closed. Nobody has said so; the Casa has just stopped '
                  + 'asking. The merchants of Cochim speak for you in Lisbon.');
              }
              renown(gg, 15);
              return end(gg, q, 'open', 'The file stays open, and the merchants of Cochim will speak for '
                + 'you in Lisbon all the same.');
            },
          },
        ]),
    },
  },
});

export const roteiro = thread({
  id: 'roteiro',
  title: 'His Book',
  blurb: 'Your father’s roteiro names three marks on this coast, and the last is where he stopped.',
  offeredAt: HOME_PORTS,
  requires: [eq('origin', 'piloto')],
  offer: () => ({
    who: 'Your father’s roteiro, open on the chart table',
    text: 'You have read it so often the spine has gone. The last page is not like the others: '
      + 'three marks, a line under each, and then nothing. The Casa’s man at the quay has an '
      + 'offer for the whole book, and does not ask why it has a page torn out.',
    accept: 'Read the last page again',
  }),
  first: 'page',
  steps: {
    page: {
      goal: () => 'Decide what to do with your father’s book, at Lisbon, Lagos or Funchal.',
      marker: () => portMark('lagos', 'The last page'),
      at: ports(...HOME_PORTS),
      hooks: ['mate'],
      scene: (_g, q) => scene(q, 'page', 'The last page',
        'Three marks. A river mouth past Mina where the water changes colour. A cape that shows '
        + 'twice before it shows once. And a bay with a bar across it, south of the Congo, '
        + 'underlined twice, and below it: "ela tem fundo." She has bottom. The Casa’s man '
        + 'will give four hundred cruzados for the book as it stands.',
        [
          {
            label: 'Follow it',
            detail: 'Every sounding he took between here and Mina goes into your own book at once.',
            resolve: (gg) => {
              const n = writeTheSea(gg, -6, 30, -25, 12);
              return go(gg, q, 'mate', `Decided to follow the roteiro to the last page. His soundings and `
                + `winds are in your book now: ${n} squares between here and the Guinea coast.`);
            },
          },
          {
            label: 'Sell it to the Casa',
            detail: '400 cruzados. The Casa’s pilots will have it, and it will be nobody’s in particular.',
            resolve: (gg) => {
              gg.crown.gold += 400;
              renown(gg, 5);
              return end(gg, q, 'sold', 'Sold your father’s roteiro to the Casa for four hundred cruzados. '
                + 'The money was good, and is already spent.');
            },
          },
        ]),
    },
    mate: {
      goal: () => 'A man who sailed with your father is at São Jorge da Mina.',
      marker: () => portMark('mina', 'Your father’s mate'),
      at: ports('mina'),
      hooks: ['bay'],
      scene: (_g, q) => scene(q, 'mate', 'Bastião',
        'He was the mate, he is fifty and looks seventy, and he has been waiting at the factory gate '
        + 'for a face like your father’s for eleven years. The captain put him ashore with the fever, '
        + 'he says, and sailed. Your father stayed to fetch him and did not come out again. '
        + 'The captain is named in the Casa’s book. He is named as a hero.',
        [
          {
            label: 'Have him aboard as your mate',
            detail: 'He knows the coast from the water, and you will know it from him.',
            resolve: (gg) => {
              gg.crew.morale = clamp(gg.crew.morale + 0.1, 0, 1);
              const n = writeTheSea(gg, -40, -5, -30, 20);
              q.flags.bastiao = true;
              return go(gg, q, 'bay', `Took Bastião aboard. He talked half the night about marks and bars. ${n} `
                + 'squares of the south are in your book by morning. The bay is below the Congo.');
            },
          },
          {
            label: 'Publish what the captain did',
            detail: 'The Casa will not like it. The waterfront will.',
            resolve: (gg) => {
              renown(gg, 30);
              gg.crown.gold -= Math.min(gg.crown.gold, 100);
              q.flags.published = true;
              return go(gg, q, 'bay', 'Wrote down what Bastião said and had it read at the factory. The '
                + 'captain’s name is struck out of a book in Lisbon. It was not as satisfying as you '
                + 'had hoped. The bay is still to find.');
            },
          },
        ]),
    },
    bay: {
      goal: () => 'Find the bay with the bar across it, south of Benguela. It will show only from close in.',
      marker: () => ({ lat: FATHERS_BAY.lat, lon: FATHERS_BAY.lon, nm: 70, label: 'The bay with the bar' }),
      at: seaNear(FATHERS_BAY.lat, FATHERS_BAY.lon, 25, { shoreMax: 8 }),
      hooks: [],
      scene: (_g, q) => scene(q, 'bay', 'Ela tem fundo',
        'There. A long pale bar across the mouth with one dark break in it, and inside the water is '
        + 'flat as a table. The lead goes down to twelve fathoms at the top of the tide and finds '
        + 'sand. It is on no chart in the Casa. He got here, and whatever happened to him happened '
        + 'after the last page.\n\nOn the north horn of the bay there is a cairn, very old, with '
        + 'nothing in it.'
        + (q.flags.bastiao ? ' Bastião is at your shoulder, and has begun to weep without any noise.'
          : q.flags.published ? ' You think of the name struck out of a book in Lisbon, and of how little the bar cares.' : ''),
        [
          {
            label: 'Name it for him',
            detail: 'Baía do Piloto. It goes on your chart, and on nobody else’s.',
            resolve: (gg) => {
              gg.chart.addPlace('Baía do Piloto', 'bay', FATHERS_BAY, gg.clock.t);
              renown(gg, 50);
              const n = writeTheSea(gg, -30, -10, 5, 20);
              return end(gg, q, 'named', `Found the bay with the bar across it and named it for your father. ${n} `
                + 'more squares of his coast are in your book. The cairn is still there.');
            },
          },
          {
            label: 'Give it to the King',
            detail: 'A padrão on the point, the Crown’s thanks, and a name that is not his.',
            resolve: (gg) => {
              gg.chart.addPlace('Baía do Rei', 'bay', FATHERS_BAY, gg.clock.t);
              renown(gg, 90);
              gg.crown.gold += 300;
              return end(gg, q, 'crown', 'Gave your father’s bay to the King. The padrão is on the point '
                + 'and the court paid three hundred cruzados. You left the cairn as you found it.');
            },
          },
        ], 'warning'),
    },
  },
});

export const escudeiro = thread({
  id: 'escudeiro',
  title: 'The King’s Gentleman',
  blurb: 'A young cousin is to learn what you learned. The King will want an honest account of how.',
  offeredAt: HOME_PORTS,
  requires: [eq('origin', 'fidalgo')],
  offer: () => ({
    who: 'Dom Lopo, your cousin, on the quay',
    text: 'He is seventeen and has a sword too long for him, and has been sent by a mother who believes '
      + 'that a month at sea will do for him what three years at court have not. He has a letter '
      + 'and a chest and no idea what either is worth.',
    accept: 'Take him aboard, and see',
  }),
  first: 'squire',
  steps: {
    squire: {
      goal: () => 'Decide what to do with Dom Lopo, at Lisbon, Lagos or Funchal.',
      marker: () => portMark('lagos', 'Dom Lopo'),
      at: ports(...HOME_PORTS),
      hooks: ['insult', 'report'],
      scene: (_g, q) => scene(q, 'squire', 'Dom Lopo',
        'He looks at the ship as if she were a mistake that somebody will shortly correct. The '
        + 'hands look at him as they look at anyone who will eat their biscuit and give orders in '
        + 'a boy’s voice. The letter is from your aunt, and is about his health.',
        [
          {
            label: 'Take him as a gentleman volunteer',
            detail: 'He sleeps in the cuddy and stands no watch at first. The hands will resent it.',
            resolve: (gg) => {
              gg.crew.morale = clamp(gg.crew.morale - 0.04, 0, 1);
              q.flags.aboard = true;
              return go(gg, q, 'insult', 'Took Dom Lopo aboard. The hands are polite, which is worse '
                + 'than if they were not.');
            },
          },
          {
            label: 'Put him to the lowest watch, as any boy',
            detail: 'He will hate it. The hands will not.',
            resolve: (gg) => {
              gg.crew.morale = clamp(gg.crew.morale + 0.04, 0, 1);
              q.flags.aboard = true;
              q.flags.hard = true;
              return go(gg, q, 'insult', 'Put Dom Lopo to the lowest watch. He did not speak for a day, and '
                + 'then he asked what a clew was.');
            },
          },
          {
            label: 'Decline, and send him home to his mother',
            detail: 'Nobody will blame you. Your aunt will.',
            resolve: (gg) => {
              renown(gg, -4);
              return go(gg, q, 'report', 'Sent Dom Lopo home to his mother. There is a letter to your aunt '
                + 'that took four drafts.');
            },
          },
        ]),
    },
    insult: {
      goal: () => 'Keep Dom Lopo out of trouble at São Jorge da Mina.',
      marker: () => portMark('mina', 'Dom Lopo at Mina'),
      at: ports('mina'),
      needs: [has('story.@.aboard')],
      hooks: ['report'],
      scene: (_g, q) => scene(q, 'insult', 'Words at the factory',
        'It is the heat, and the sight of the gold, and a factor’s clerk who said something about '
        + 'pretty boys. Dom Lopo has drawn the sword that is too long for him, in front of '
        + 'the Casa’s men, and the clerk is laughing.',
        [
          {
            label: 'Stand between them, and make him apologise',
            detail: 'He will never forgive you for it. He will also be alive.',
            resolve: (gg) => {
              renown(gg, 10);
              q.flags.steady = true;
              return go(gg, q, 'report', 'Made Dom Lopo put up his sword and apologise to the clerk at Mina. '
                + 'The clerk has told everyone.');
            },
          },
          {
            label: 'Let them have it out',
            detail: 'Men are made this way. Sometimes they are also buried.',
            resolve: (gg) => {
              if (gg.rng.chance(0.55)) {
                renown(gg, 15);
                q.flags.reckless = true;
                return go(gg, q, 'report', 'Dom Lopo put the clerk’s sleeve to the wall and was pulled off, '
                  + 'shaking and delighted. The factory thinks well of him.');
              }
              gg.crew.morale = clamp(gg.crew.morale - 0.08, 0, 1);
              renown(gg, -10);
              q.flags.hurt = true;
              return go(gg, q, 'report', 'Dom Lopo took a cut across the arm and was carried aboard. He '
                + 'will keep the scar. Your aunt will want to hear how it came about.');
            },
          },
        ]),
    },
    report: {
      goal: () => 'A letter from the King is waiting at Melinde.',
      marker: () => portMark('melinde', 'The King’s private letter'),
      at: ports('melinde'),
      quarter: 'court',
      hooks: [],
      scene: (_g, q) => scene(q, 'report', 'A private letter',
        'It is on plain paper, in the King’s own hand, and is short. "You asked me for a ship, and '
        + 'I have watched what you have done with it. I should like to be told, by you and by nobody '
        + 'else, what the captains are really doing out there." It does not say what will come of a '
        + 'plain answer.'
        + (q.flags.aboard
          ? ` Dom Lopo, who reads over your shoulder${q.flags.hurt ? ', his arm still stiff from Mina,' : q.flags.steady ? ', who apologised to a clerk at Mina because you made him,' : q.flags.reckless ? ', who put a clerk’s sleeve to the wall at Mina,' : q.flags.hard ? ', who has stood the lowest watch under you,' : ''} goes very still.`
          : ''),
        [
          {
            label: 'Tell him the truth',
            detail: 'Every private trade, every bribe, every man who has starved his crew for a profit.',
            resolve: (gg) => {
              renown(gg, 70);
              gg.crown.gold += 1500;
              gg.secretsHeard.push('commenda');
              return end(gg, q, 'honest', 'Wrote the King an honest account of the captains. He gave you a '
                + 'commenda of the Order of Christ, which pays fifteen hundred cruzados and makes '
                + 'a great many enemies.');
            },
          },
          {
            label: 'Tell him what he would like to hear',
            detail: 'He is not a fool, but he is fond of being told.',
            resolve: (gg) => {
              renown(gg, 20);
              gg.crown.gold += 400;
              return end(gg, q, 'flattered', 'Wrote the King a cheerful account of the captains. He sent four '
                + 'hundred cruzados for your trouble and did not write again.');
            },
          },
        ]),
    },
  },
});

