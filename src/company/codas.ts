import { clamp } from '../core/math';
import type { ArcBeat } from '../progression/arcs';
import { close, regard, setFlag } from './arcKit';

/**
 * The fourth beat of each of the six written arcs.
 *
 * The first three beats decide whether a man is bonded. These decide how it
 * ends, and the answer is not always "he stays": a bonded man can go ashore
 * with honour, die doing the thing he was for, or be lost to a careless last
 * answer. Each ends in a state the epilogue reads (bonded, ashore, dead,
 * estranged), and a bond already struck is only taken back when the captain
 * is the one who broke it.
 */

const BEATS = 4;

export const CODAS: Record<string, ArcBeat> = {
  // ------------------------------------------------------------ the pilot
  correia: {
    port: true,
    when: (c) => c.o.bonded === true && c.served > 190,
    build: ({ o }) => ({
      id: `arc:correia:4:${o.id}`,
      title: 'Correia and the vine over the door',
      severity: 'note',
      text:
        `${o.name} has put the traverse board in your hands at the change of the watch and asked for `
        + 'nothing, which is how you know what he is going to ask. There is a house at Sesimbra with a '
        + 'vine over the door and a sister who writes that it is empty. He has not slept a whole winter '
        + 'in one bed in forty years and he would like, he says, to find out whether he is any good at it.',
      choices: [
        {
          label: 'Take him home with his full pay, and the board',
          detail: 'He goes ashore with honour. The berth is empty, and what he taught you stays.',
          resolve: (g) => {
            regard(o, 0.1, 'sent him home to the vine with his pay and his board');
            g.crown.gold = Math.max(0, g.crown.gold - 60);
            close(g, o, BEATS, 'ashore', 'was sent home to Sesimbra with a full year’s pay and his own board');
            return 'He takes the board and then, at the last, gives it back to you, and takes his old '
              + 'one out of his sea chest instead. He goes down the side in his good coat and does not '
              + 'look at the quadrant. The berth aft is empty, and you will feel it at every noon.';
          },
        },
        {
          label: 'Ask him for one more voyage, and call it a request',
          detail: 'He will say yes. You will have a pilot who is tired, and who is yours.',
          resolve: (g) => {
            regard(o, 0.06, 'asked him for one more voyage and did not order it');
            setFlag(o, 'onemore');
            void g;
            return 'He says yes before you have finished the sentence, and then, because he is an '
              + 'honest man, "but it is the last, sir, and you will have to tell me when." He is '
              + 'more careful with the board after that, and happier.';
          },
        },
        {
          label: 'Tell him it is his to say, and that the berth is his for as long as he lives',
          detail: 'The kindest answer, and the one that leaves the choice where it belongs.',
          resolve: (g) => {
            regard(o, 0.14, 'told him the berth was his for life and left the choice to him');
            setFlag(o, 'chose');
            void g;
            return 'He is quiet for a long time. "Then I will stay," he says, "and you will let me '
              + 'go the day I ask, and you will not tell the men why." You agree to all three.';
          },
        },
      ],
    }),
  },

  // ----------------------------------------------------------- the master
  sousa: {
    port: true,
    when: (c) => c.o.bonded === true && c.served > 190,
    build: ({ o }) => ({
      id: `arc:sousa:4:${o.id}`,
      title: 'The master and the hull on the stocks',
      severity: 'note',
      text:
        `There is a caravel on the stocks at Lagos with nobody's name on her yet, and ${o.name} has `
        + 'walked her keel twice and come back to tell you the price, to the cruzado. He has not asked '
        + 'you for it. He has told you what a master would need to be a captain, and then, with '
        + 'great care, nothing else.',
      choices: [
        {
          label: 'Stake him a share in a caravel of his own',
          detail: 'Costs money. He goes, as a captain, and he will not forget who made him one.',
          resolve: (g) => {
            const stake = Math.max(150, Math.round(g.crown.gold * 0.2));
            g.crown.gold = Math.max(0, g.crown.gold - stake);
            g.crown.standing += 6;
            regard(o, 0.2, 'staked him a caravel of his own');
            close(g, o, BEATS, 'ashore', `went to a hull of his own on a share you staked him (${stake} cruzados)`);
            return `${stake} cruzados, and a clause that makes you a partner in whatever he brings home. `
              + 'He signs under your name and does not trust his hand to do it twice. The ship works '
              + 'differently without him, and the Casa has a captain it did not have last week.';
          },
        },
        {
          label: 'Promise him the next hull, and keep him until then',
          detail: 'He will stay. You will be held to it.',
          resolve: (g) => {
            regard(o, 0.08, 'promised him the next hull');
            setFlag(o, 'promised');
            void g;
            return 'He takes it the way he takes weather: as a thing that will either come or not. '
              + 'He writes it into his private book, in the margin, with the date.';
          },
        },
        {
          label: 'Tell him a master serves until he is dead',
          detail: 'It is how most of the Casa’s men have been used. He will see to the ship, and not to you.',
          resolve: (g) => {
            regard(o, -0.45, 'told him a master serves until he is dead');
            close(g, o, BEATS, 'estranged', 'was told a master serves until he is dead', 'trueSecond');
            return 'He nods once and goes back to the working of her. The watch still work as though '
              + 'you were on deck, but not as though it mattered to them whether you were.';
          },
        },
      ],
    }),
  },

  // ---------------------------------------------------------- the degredado
  gaspar: {
    port: true,
    when: (c) => c.o.bonded === true && c.served > 190 && c.g.dockedAt !== 'lisboa' && !c.o.ashoreAt,
    build: ({ o }) => ({
      id: `arc:gaspar:4:${o.id}`,
      title: 'The man with two names',
      severity: 'note',
      text:
        `A message came down to the quay for ${o.name} by a boy who had been told whom to ask for, and `
        + 'who would not say more. He read it twice, which for a man who speaks four languages and reads '
        + 'two is a long time. His son is walking. His wife has a house with a door and a roof, and a '
        + 'headman who has asked after him by name. He has not asked you for anything. He is standing '
        + 'by the rail with his bag in his hand, which he thinks you have not noticed.',
      choices: [
        {
          label: 'Let him go home, with his pardon and a share',
          detail: 'He leaves you for the beach he was left on. What he knows of the coast stays with you.',
          resolve: (g) => {
            regard(o, 0.15, 'let him go home to his wife with a share of the voyage');
            g.crown.gold = Math.max(0, g.crown.gold - 80);
            close(g, o, BEATS, 'ashore', 'went home to the coast with his pardon, his wife and a share of the voyage');
            return 'He puts the share in his bag without counting it, and then he does a thing he has '
              + 'not done in three years, which is to shake your hand in the Portuguese way, awkwardly. '
              + 'He goes up the beach. This time, you notice, he looks back once.';
          },
        },
        {
          label: 'Ask him to stay to the end of the voyage, and send for the family',
          detail: 'A harder thing to ask. Costs the passage, and what the Casa will say.',
          resolve: (g) => {
            g.crown.gold = Math.max(0, g.crown.gold - 40);
            regard(o, 0.1, 'sent for his family rather than ask him to leave them');
            void g;
            return 'It is a long time before he answers. "I will not be the first man they have brought '
              + 'to Lisbon on a ship," he says. "But I will be the first who was asked." The family comes '
              + 'out to the ship in the headman’s own boat, and he is, for the first time since you met '
              + 'him, a man with nothing to prove.';
          },
        },
      ],
    }),
  },

  // ------------------------------------------------------------ the surgeon
  dinis: {
    port: true,
    when: (c) => c.o.bonded === true && c.served > 190 && (c.g.crew.sickness > 0.1 || c.g.crew.scurvy > 0.2),
    build: ({ o }) => ({
      id: `arc:dinis:4:${o.id}`,
      title: 'The fever ward',
      severity: 'warning',
      text:
        `There is a fever ward ashore, in a shed with a thatch roof and a Franciscan, and nobody in it `
        + `who is going to come out. ${o.name} has stood at the rail for an hour looking at it. `
        + 'He knows exactly what it is, and exactly how long it takes, and he knows that every man '
        + 'in that shed is a case he could write down. He says nothing of it to you at all, which is '
        + 'the first time in three years he has not told you the figures.',
      choices: [
        {
          label: 'Let him go, and stay with them',
          detail: 'He will nurse them, and he will not come out. It is the thing he is for.',
          resolve: (g) => {
            regard(o, 0.1, 'let him go to the fever ward and stay with the sick');
            g.crew.morale = clamp(g.crew.morale + 0.04, 0, 1);
            close(g, o, BEATS, 'dead', 'went ashore to the fever ward and did not come out, with his book in his bag');
            return 'He goes down the side with his chest and his book and a face you have never seen '
              + 'on him: untroubled. Eleven days later a Franciscan sends out the book, with a note '
              + 'that the last forty pages are the best thing he has ever read. It is all there, '
              + 'written down, in a hand that gets worse and then does not.';
          },
        },
        {
          label: 'Go with him, and give it three weeks',
          detail: 'You and half the watch. It costs time, and men will take the fever.',
          resolve: (g) => {
            g.clock.t += 14 * 86400;
            g.crew.sickness = clamp(g.crew.sickness + 0.04, 0, 1);
            g.crew.morale = clamp(g.crew.morale + 0.06, 0, 1);
            regard(o, 0.2, 'went into the fever ward with him');
            g.noteDeed('mercy.shown', { target: 'the fever ward', magnitude: 0.8, note: `Went into the fever ward with ${o.name} and gave it a fortnight.` });
            return 'A fortnight, and you are a poorer judge of a fever than you were. The Franciscan '
              + 'buries four. Dinis writes down nine, and the nine who walk out are the ones on whom '
              + 'he used the thing he has been trying for three years. He does not say so. He puts '
              + 'the book away with the care of a man who has finally got the answer to the right question.';
          },
        },
        {
          label: 'Order him aboard, and keep him alive',
          detail: 'It is your right. You will be the reason nobody wrote it down.',
          resolve: (g) => {
            regard(o, -0.3, 'ordered him back from the fever ward to keep him alive');
            g.crew.morale = clamp(g.crew.morale - 0.02, 0, 1);
            setFlag(o, 'kept');
            void g;
            return 'He obeys. He has the finest manners of any man on the ship and he uses them. '
              + 'The ward burns down a month later, with everyone in it, and he is the only man on '
              + 'deck who does not ask what is that smoke.';
          },
        },
      ],
    }),
  },

  // -------------------------------------------------------- the draughtsman
  sintra: {
    port: true,
    when: (c) => c.o.bonded === true && c.served > 190,
    build: ({ o }) => ({
      id: `arc:sintra:4:${o.id}`,
      title: 'The sheet with two names',
      severity: 'note',
      text:
        `${o.name} has laid the whole coast on the chart table, fair, in one hand, in the way he said `
        + 'in the first week he would one day draw it. It is the best thing you have ever seen made '
        + 'aboard a ship. He stands beside it, and says what the Casa will say, which is that the '
        + 'master of the voyage signs the sheet, and that a boatswain does not. He does not say what '
        + 'he wants. He has drawn a small, neat blank under your name.',
      choices: [
        {
          label: 'Sign it with both names',
          detail: 'The Casa will not like a boatswain’s name beside a captain’s. He will not forget that you did it.',
          resolve: (g) => {
            regard(o, 0.25, 'signed the sheet with both names');
            g.crown.standing = Math.max(0, g.crown.standing - 2);
            setFlag(o, 'signed');
            void g;
            return 'The clerk at the Casa will cross one of them out. It will not matter. There is a '
              + 'copy in his hand with both, under a stone in a church at Sintra, and in forty years '
              + 'a man will find it and wonder who he was.';
          },
        },
        {
          label: 'Sign it with yours only',
          detail: 'The usual practice, and the practice is not your doing. He will draw the next one for somebody else.',
          resolve: (g) => {
            regard(o, -0.45, 'signed the sheet with his name alone');
            close(g, o, BEATS, 'estranged', 'drew the sheet and watched it signed with another man’s name', 'theDraughtsman');
            void g;
            return 'He rolls the sheet with the care of a man putting a child to bed. The next one he '
              + 'draws is the best in the kingdom, and it is not for you.';
          },
        },
        {
          label: 'Let him take it to the Casa’s own atlas-makers',
          detail: 'He goes ashore, to the one place that would give him his name. Your sheets keep their value.',
          resolve: (g) => {
            regard(o, 0.12, 'let him carry the great sheet to the Casa’s atlas-makers under his own name');
            g.crown.standing += 3;
            close(g, o, BEATS, 'ashore', 'took the sheet to the Casa’s atlas-makers and kept his own name on it');
            return 'He takes the sheet in a leather tube under his arm and goes down the side with '
              + 'it as another man might take a child. You hear, a year later, that a copy hangs in '
              + 'a room at the Casa and that the name under it is his.';
          },
        },
      ],
    }),
  },

  // ---------------------------------------------------------- the chaplain
  anselmo: {
    port: true,
    when: (c) => c.o.bonded === true && c.served > 190 && c.g.relationsMetCount() > 3,
    build: ({ o }) => ({
      id: `arc:anselmo:4:${o.id}`,
      title: 'A conversation in the language',
      severity: 'note',
      text:
        `${o.name} has had his first whole conversation in the language of the coast, and it was `
        + 'with a woman who sells fish, about the price of fish, for an hour. He came back to the ship '
        + 'with the face of a man who has been given something. The town’s own scholar has asked him to '
        + 'stay a year and put his book into Portuguese, and has offered him a room with a window. He '
        + 'does not ask you. He says only that it is a very good window.',
      choices: [
        {
          label: 'Let him stay',
          detail: 'He leaves the ship for the room with the window. The men lose their chaplain, and the coast gets a man who listens.',
          resolve: (g) => {
            regard(o, 0.15, 'let him stay on the coast with the scholar and his window');
            g.noteDeed('faith.respected', { target: g.dockedAt ?? 'the coast', magnitude: 0.6, note: `Let ${o.name} stay on this coast to learn it before he teaches it.` });
            close(g, o, BEATS, 'ashore', 'stayed on the coast to translate a book and learn a language before teaching one');
            return 'He says the mass in the morning for the last time, on the main deck, and for the '
              + 'first time he says part of it in the language of the coast, badly, and the men '
              + 'do not laugh. He goes up the beach with two books and no luggage.';
          },
        },
        {
          label: 'Ask him to bury the company first, and go at the end of the voyage',
          detail: 'He will stay, and be a little less happy, and be kept for those who need him.',
          resolve: (g) => {
            regard(o, 0.08, 'asked him to see the company home before he went to his window');
            setFlag(o, 'deferred');
            void g;
            return 'He weighs it, and is a good enough priest to see that you are right, and a good '
              + 'enough man to mind. "At the end of the voyage," he says. "It is a long voyage, sir. '
              + 'I shall learn the language from the fish-wife in the meantime."';
          },
        },
        {
          label: 'Forbid it: the Order will want him back',
          detail: 'It is your right. It will cost you him, in every way but the muster.',
          resolve: (g) => {
            regard(o, -0.5, 'forbade him the room with the window');
            close(g, o, BEATS, 'estranged', 'was forbidden the room with the window', 'cureOfSouls');
            return 'He says the mass in the morning. He says it correctly and he does not look at '
              + 'any man in the congregation. The coast, behind him, goes on being the coast.';
          },
        },
      ],
    }),
  },
};
