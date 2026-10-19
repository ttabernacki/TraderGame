import { clamp } from '../core/math';
import type { Arc } from '../progression/arcs';
import { close, farewell, flag, regard, setFlag, strike } from './arcKit';

/**
 * Three arcs the first six did not cover: the clerk, the interpreter, and the
 * Swahili pilot of Melinde.
 *
 * Source note (see docs/DESIGN.md, "Sources checked for the company"). All three
 * men are invented. The clerk is the Crown's: the Casa appointed a scrivener to
 * every ship and he reported to it, which is why he is the one man aboard the
 * captain did not choose. The interpreter is the kind the Casa made and bought:
 * boys taken on the Guinea coast, baptised, schooled and used. The pilot is a
 * mu'allim of the Indian Ocean tradition: the kamal (a knotted cord and a horn
 * plate for the altitude of Polaris), the star compass of thirty-two houses, the
 * two monsoons (kaskazi, the north-east, and kusi, the south-west, are the
 * Swahili names). Hamisi himself, his father, his cousins and the family that
 * would give him a berth are invented; nothing here is a claim about a real
 * pilot, and the Gujarati pilot Malemo of the monsoon thread is another man.
 */

// ---------------------------------------------------------------- the clerk
export const PAIS: Arc = {
  id: 'pais', role: 'escrivao', name: 'Diogo Pais', trait: 'exact', start: false,
  ability: 0.58, standing: 0, wage: 20,
  hook: 'The Crown’s man. Keeps the cargo books, writes to the Casa by every ship that passes and does not pretend otherwise.',
  bond: 'theWitness',
  beats: [
    {
      when: (c) => c.served > 20,
      build: ({ o }) => ({
        id: `arc:pais:1:${o.id}`,
        title: 'The clerk reads you his letter',
        severity: 'note',
        text:
          `${o.name} comes to the great cabin on the evening before a ship is spoken, with a sheet folded `
          + 'in three, and says what it is: his report to the Casa, as it stands, which is what the Crown '
          + 'pays him for. Nobody has asked him to read it to you. He thinks you ought to hear it in the '
          + 'plain voice he wrote it in. It says what she has carried and what she has spent and how many '
          + 'are dead, and, in one dry sentence, that the great cabin has drunk more wine than the book allows.',
        choices: [
          {
            label: 'Let it go as written',
            detail: 'The wine and all. He will notice that you did not argue.',
            resolve: (g) => {
              regard(o, 0.12, 'let his report go to the Casa as he wrote it, wine and all');
              setFlag(o, 'open');
              g.noteDeed('books.honest', { target: o.name, magnitude: 0.4, note: `Let ${o.name}'s report go to the Casa as he wrote it.` });
              return 'He folds it in three again and says it will go by the next ship. It is the longest '
                + 'conversation you have had with him, and he looks, for a moment, like a man who has '
                + 'been let off something.';
            },
          },
          {
            label: 'Ask him to leave out the sentence about the wine',
            detail: 'A small thing. It is the kind of small thing the Casa is made of.',
            resolve: () => {
              regard(o, -0.14, 'asked him to leave one sentence out of his report');
              setFlag(o, 'edited');
              return 'He strikes it out with a ruler, once, and initials the margin, which is the proper '
                + 'form. He does not look at you. You do not think he has forgotten the sentence.';
            },
          },
          {
            label: 'Write your own account beside his, and send both',
            detail: 'The Casa will have two voices and can weigh them.',
            resolve: (g) => {
              regard(o, 0.06, 'wrote his own account to lie beside the clerk’s');
              setFlag(o, 'twoletters');
              g.crown.standing += 2;
              return 'Two letters in two hands, sealed with two seals. He finds it unusual and says so, '
                + 'and then he says it is also, in its way, the only honest way of doing it.';
            },
          },
        ],
      }),
    },
    {
      when: (c) => c.served > 45 && c.g.crew.deaths >= 2,
      build: ({ o, g }) => ({
        id: `arc:pais:2:${o.id}`,
        title: 'The count of the dead',
        severity: 'warning',
        text:
          `There are men on the muster who are not in the ship. ${o.name} has the book open at the page, `
          + 'the pen lifted, the date of each and the wage of each; and the wage, by the Casa’s rule, goes '
          + 'to the widow unless the entry is made late. A late entry keeps the money in the ship’s account '
          + `until the next reckoning. Nobody has ever been hanged for it. He wants to know whether to write `
          + `the day they died or the day the Casa will be told, and he has counted ${g.crew.deaths}.`,
        choices: [
          {
            label: 'Write the day they died. Send the wages home',
            detail: 'The widows are paid. The ship is poorer.',
            resolve: (gg) => {
              const cost = Math.min(gg.crown.gold, 14 * gg.crew.deaths);
              gg.crown.gold -= cost;
              regard(o, 0.2, 'had the dead entered on the day they died and the wages sent home');
              setFlag(o, 'honestdead');
              gg.noteDeed('books.honest', { target: o.name, magnitude: 0.7, note: `Had the dead entered on the day they died and their wages sent home (${cost} cruzados).` });
              return `${cost} cruzados into the Casa’s hand for the widows. He enters each man by name, in `
                + 'his best hand, and when he comes to the last he puts the pen down for a moment.';
            },
          },
          {
            label: 'Enter them late. The ship has a use for the money',
            detail: 'Common practice, small gain, and a thing he will have to write his name under.',
            resolve: (gg) => {
              const gain = 8 * gg.crew.deaths;
              gg.crown.gold += gain;
              regard(o, -0.22, 'had the dead entered late to keep their wages');
              setFlag(o, 'cookedcount');
              gg.noteDeed('books.cooked', { target: o.name, magnitude: 0.7, note: 'Had the dead entered late to keep their wages in the ship’s account.' });
              return `${gain} cruzados, which is not nothing. He writes what he is told, in a hand that is `
                + 'exactly as neat as always and rather smaller.';
            },
          },
          {
            label: 'Write the day they died, and pay the wages from your own purse',
            detail: 'Costs you twice as much, and costs nobody else anything.',
            resolve: (gg) => {
              const cost = Math.min(gg.crown.gold, 24 * gg.crew.deaths);
              gg.crown.gold -= cost;
              gg.crew.morale = clamp(gg.crew.morale + 0.03, 0, 1);
              regard(o, 0.3, 'paid the dead men’s wages out of his own purse');
              setFlag(o, 'honestdead');
              gg.noteDeed('books.honest', { target: o.name, magnitude: 0.8, note: `Paid the dead men's wages out of your own purse (${cost} cruzados).` });
              return `${cost} cruzados out of your own chest. The word goes forward before the book is `
                + 'closed, and it is not the clerk who carries it.';
            },
          },
        ],
      }),
    },
    {
      when: (c) => c.served > 80 && c.g.visitedPorts.size >= 3,
      build: ({ o }) => ({
        id: `arc:pais:3:${o.id}`,
        title: 'The scale that reads heavy',
        severity: 'note',
        text:
          'At the last quay the factor’s beam read two ounces in twelve heavy, in the factor’s favour, '
          + `against the ship’s own scale in the hold. ${o.name} noticed it the way he notices a figure out `
          + 'of its column: physically. He has told nobody. A short sack is a short sack, and the people '
          + 'who weighed it will not be at the next port. He asks, as a clerk asks, whom he is to tell.',
        choices: [
          {
            label: 'Reweigh it before the factor, with witnesses',
            detail: 'Fair weights, at a cost. The factor will remember being corrected.',
            resolve: (g) => {
              g.crown.gold = Math.max(0, g.crown.gold - 30);
              regard(o, 0.15, 'had the sacks reweighed before the factor');
              g.noteDeed('weights.fair', { target: g.dockedAt ?? 'the factor', magnitude: 0.6, note: 'Had the sacks reweighed before the factor, and lost the difference.' });
              return 'The factor goes the colour of the sack and the beam is hung again, true. Thirty '
                + 'cruzados of difference, in your disfavour, and a good many people on the quay '
                + 'who have decided something about this ship.';
            },
          },
          {
            label: 'Say nothing. It runs your way',
            detail: 'Forty cruzados, and a thing he will not say, and will not forget.',
            resolve: (g) => {
              g.crown.gold += 40;
              regard(o, -0.2, 'let the heavy scale stand because it ran his way');
              g.noteDeed('weights.false', { target: g.dockedAt ?? 'the factor', magnitude: 0.5, note: 'Let a heavy scale stand because the error ran your way.' });
              return 'Forty cruzados to the good. He enters the weight that was read, and in the margin, '
                + 'in a hand so small it might be a flaw in the paper, the weight that was true.';
            },
          },
          {
            label: 'Have him correct the book, and say nothing to the factor',
            detail: 'The ship’s books are true. The factor’s are his own affair.',
            resolve: (g) => {
              regard(o, 0.05, 'had the book made true and said nothing to the factor');
              g.noteDeed('books.honest', { target: o.name, magnitude: 0.3, note: 'Had the book corrected to the true weight and said nothing to the factor.' });
              return 'He is not entirely satisfied. He has, however, made the book true, which is the '
                + 'only part of the matter that is his.';
            },
          },
        ],
      }),
    },
    {
      when: (c) => c.served > 130,
      build: ({ o }) => ({
        id: `arc:pais:4:${o.id}`,
        title: 'The clerk’s own request',
        severity: 'note',
        text:
          `${o.name} has a cousin who is a notary at the Casa and a letter from him that says there is a `
          + 'feitor’s place going at a House on the coast, with a house and a garden and a salary that does '
          + 'not depend on a captain. He holds it out to you, which is not like him. He has also, and he '
          + 'says it plainly, been in this ship long enough to find that he would rather be in your book '
          + 'than in anybody else’s. He asks which of those you would like him to act on.',
        choices: [
          {
            label: 'Write him the best letter you can, and let him go at the next quay',
            detail: 'A good clerk placed in a good House. You lose him, and the Casa thinks the better of you.',
            resolve: (g) => {
              regard(o, 0.15, 'wrote him the best letter he ever had and let him go');
              g.crown.standing += 3;
              g.casa.regard = clamp(g.casa.regard + 0.05, -1, 1);
              farewell(o, 5, 'was let go with the best letter of his life to a House on the coast');
              return 'He reads the letter twice, and then, because the matter is formal, he asks if he '
                + 'may keep the ship’s books until the next quay. You say that he may. He keeps them, '
                + 'as it turns out, until the hour he goes down the side, with the pen in his hand.';
            },
          },
          {
            label: 'Ask him to stay, and promise him a House when you found one',
            detail: 'He will stay. You will be held to it.',
            resolve: () => {
              regard(o, 0.1, 'asked him to stay and promised him a House of his own');
              setFlag(o, 'promised');
              return 'He writes it down: the date, the words, your name. It is the first time you have '
                + 'seen him write something down with evident pleasure.';
            },
          },
          {
            label: 'Tell him a clerk goes where the Crown sends him',
            detail: 'It is the rule. It is also how a good man is turned into a careful one.',
            resolve: () => {
              regard(o, -0.25, 'told him a clerk goes where the Crown sends him');
              setFlag(o, 'refused');
              return 'He puts the letter away. He does not seem surprised, and that is the worst of it.';
            },
          },
        ],
      }),
    },
    {
      when: (c) => c.served > 200 && !c.o.leaving,
      build: ({ o }) => ({
        id: `arc:pais:5:${o.id}`,
        title: 'What the clerk will say',
        severity: 'warning',
        text:
          'The Casa audits every ship, and the audit of this one will turn on the books and on what the '
          + `clerk says of them. ${o.name} has begun to write the fair copy. He asks one thing, with the `
          + 'exactness of a man who has been asking it for three years: what is he to write at the foot of '
          + 'the last page, where the clerk certifies that the books are true?',
        choices: [
          {
            label: 'The truth, as it stands',
            detail: 'He will write it. What the truth is depends on what you have had him write.',
            resolve: (g) => {
              const dirty = flag(o, 'cookedcount') || flag(o, 'edited');
              g.noteDeed('books.honest', { target: o.name, magnitude: 0.6, note: 'Told the clerk to certify the books as they stood.' });
              if (!dirty) {
                regard(o, 0.2, 'was told to certify the books as they stood');
                strike(g, o, 'theWitness');
                return 'He signs. It takes him nine minutes and he does not hesitate once. "I have '
                  + 'been in four ships, sir," he says, "and it is the first time I have certified '
                  + 'something I would have signed if nobody had asked."';
              }
              regard(o, -0.05, 'was told to certify the books as they stood, which was not clean');
              g.casa.regard = clamp(g.casa.regard - 0.1, -1, 1);
              close(g, o, 5, 'estranged', 'certified the books as they stood, which was not clean');
              return 'He certifies what is there, including the entries made late and the sentence '
                + 'struck out with a ruler. It is exactly true. It does not help you, and he does '
                + 'not pretend that it will.';
            },
          },
          {
            label: 'What I tell you to',
            detail: 'The books say what the ship needs them to. He is a Crown man and he will remember.',
            resolve: (g) => {
              g.casa.regard = clamp(g.casa.regard - 0.2, -1, 1);
              g.crown.standing = Math.max(0, g.crown.standing - 6);
              g.noteDeed('books.cooked', { target: o.name, magnitude: 0.8, note: 'Told the clerk to certify the books as you dictated.' });
              regard(o, -0.5, 'was told to certify the books as the captain dictated');
              close(g, o, 5, 'betrayed', 'certified the books as dictated and kept a second copy for the Casa', 'theWitness');
              return 'He writes it. He writes it in the same hand, in the same ink, and he blots it, '
                + 'and he puts a second sheet in his own chest. The Casa has the true figures by '
                + 'the next ship, and you never find out how.';
            },
          },
          {
            label: 'Nothing. Write what you think right',
            detail: 'It depends, entirely, on what he thinks of you by now.',
            resolve: (g) => {
              if ((o.approval ?? 0) >= 25) {
                regard(o, 0.15, 'left it to him what the books should say, and was trusted with it');
                g.noteDeed('books.honest', { target: o.name, magnitude: 0.6, note: 'Left it to the clerk what the books should say.' });
                strike(g, o, 'theWitness');
                return 'He considers it for what is, by his standards, a very long time. "Then I shall '
                  + 'write that these books are true," he says, "because in my judgement they are."';
              }
              regard(o, -0.1, 'left it to him what the books should say, and was found wanting');
              close(g, o, 5, 'estranged', 'was left to certify the books, and certified exactly what he had seen');
              return 'He writes what he has seen, and it is a good deal. It is all true. He gives '
                + 'you the page to read and you do not ask him to change it.';
            },
          },
        ],
      }),
    },
  ],
};

// ---------------------------------------------------------- the interpreter
export const LINGUA: Arc = {
  id: 'lingua', role: 'lingua', name: 'The interpreter', trait: 'curious', start: false,
  ability: 0.55, standing: 0, wage: 18,
  hook: 'A man of two sentences, who is paid to make one of them heard.',
  bond: 'theBridge',
  beats: [
    {
      when: (c) => c.served > 12 && c.g.relationsMetCount() > 0,
      build: ({ o }) => ({
        id: `arc:lingua:1:${o.id}`,
        title: 'What he is paid to say',
        severity: 'note',
        text:
          `At the last audience ${o.name} changed one sentence. You said it plainly and it would have given `
          + 'offence; he said what you meant, in the form in which it could be heard. He tells you afterwards, '
          + 'unasked, because he thinks you should know what you said. He wants to know how much of this he '
          + 'is to do, which is not the same as asking permission.',
        choices: [
          {
            label: 'Say what I mean, not what I said',
            detail: 'You trust his ear over your own. It will go wrong once, somewhere, and be his fault.',
            resolve: () => {
              regard(o, 0.15, 'told him to say what he meant and not what he said');
              setFlag(o, 'trusted');
              return 'He takes it with a small bow, the kind that has always been the interpreter’s, '
                + 'and goes back to the stern. He has the look of a man who has been given a licence '
                + 'he did not expect to be offered.';
            },
          },
          {
            label: 'Word for word, always',
            detail: 'What you said is what they hear. It is your voice and your errors.',
            resolve: () => {
              regard(o, -0.12, 'told him word for word, always');
              setFlag(o, 'literal');
              return 'He nods. The next audience goes exactly as you say it, and it goes, for the '
                + 'first time, rather badly.';
            },
          },
          {
            label: 'Tell me whenever you change it, and I will decide afterwards',
            detail: 'More work for both of you. It leaves the judgement where it belongs.',
            resolve: () => {
              regard(o, 0.08, 'asked to be told when he changed a sentence');
              setFlag(o, 'told');
              return 'He thinks that is a reasonable arrangement. He keeps, after that, a small tally '
                + 'in the margin of his hand, which you never ask to see.';
            },
          },
        ],
      }),
    },
    {
      when: (c) => c.served > 35,
      build: ({ o }) => ({
        id: `arc:lingua:2:${o.id}`,
        title: 'The name in the book',
        severity: 'note',
        text:
          `The muster has him under the name the font gave him, and he answers to it. At the last quay an `
          + 'old woman called him by another, and he went quite still. He says nothing of it to you, but '
          + `the chaplain has heard of it, and so has the clerk, and ${o.name} has heard that they have. `
          + 'He is, as ever, waiting to see what a man in your place does with a small thing.',
        choices: [
          {
            label: 'Enter him in the book under both names',
            detail: 'The Casa’s clerk will ask why. You will have an answer.',
            resolve: () => {
              regard(o, 0.16, 'had him entered in the book under both his names');
              setFlag(o, 'named');
              return 'Both names, side by side, in the clerk’s hand. The clerk adds a note that it is '
                + 'irregular. He does not otherwise object.';
            },
          },
          {
            label: 'The book says what the priest wrote',
            detail: 'It is the rule. It is also an answer.',
            resolve: () => {
              regard(o, -0.12, 'told him the book says what the priest wrote');
              setFlag(o, 'font');
              return 'He accepts it. He goes on answering to the name in the book, and to the other '
                + 'when nobody from the ship is near.';
            },
          },
          {
            label: 'Ask him what he would have the ship call him',
            detail: 'It costs nothing, and it is more than anybody has asked him in nine years.',
            resolve: () => {
              regard(o, 0.2, 'asked him what he would have the ship call him');
              setFlag(o, 'asked');
              return 'He is silent for some time, and then he says it, once, carefully, as one sets '
                + 'something down on a table. It is the name the old woman used. The ship, on the whole, '
                + 'finds it easier than it expected.';
            },
          },
        ],
      }),
    },
    {
      when: (c) => c.served > 65 && c.g.relationsMetCount() > 1,
      build: ({ o }) => ({
        id: `arc:lingua:3:${o.id}`,
        title: 'A kinsman’s boy',
        severity: 'warning',
        text:
          `A man on the beach called ${o.name} by a third name and gave him a message from a woman he has not `
          + 'seen since he was ten. It is about a boy, her son’s son, who was carried to a factory on the '
          + 'coast two years ago and has a name there that is not his. The boy can be bought for eighty '
          + 'cruzados at the Casa’s own rate. The interpreter cannot. He puts the matter in your hands '
          + 'as a matter and not as a favour, and asks, carefully, what you would call it.',
        choices: [
          {
            label: 'Buy the boy’s freedom: eighty cruzados',
            detail: 'The Casa will note it in the book as a purchase and in no other way.',
            resolve: (g) => {
              const cost = Math.min(g.crown.gold, 80);
              g.crown.gold -= cost;
              regard(o, 0.3, 'bought his kinsman’s boy out of the factory');
              setFlag(o, 'boy');
              g.noteDeed('companion.freed', { target: 'a boy of the coast', magnitude: 0.8, note: `Bought ${o.name}'s kinsman's boy out of the factory for ${cost} cruzados.` });
              return `${cost} cruzados, counted onto the Casa’s table, and a boy of eleven who walks `
                + 'down the quay with nothing in his hands and does not look back. The interpreter '
                + 'does not thank you. He does something that is, in his language, worse: he '
                + 'says you have done what a kinsman does.';
            },
          },
          {
            label: 'Ship the boy under wages, and let him choose at the end of the voyage',
            detail: 'Cheaper. The boy’s choice is a real one, and so is yours.',
            resolve: (g) => {
              g.crown.gold = Math.max(0, g.crown.gold - 20);
              regard(o, 0.18, 'shipped his kinsman’s boy under wages and gave him the choice');
              setFlag(o, 'boyaboard');
              g.noteDeed('mercy.shown', { target: 'a boy of the coast', magnitude: 0.5, note: `Shipped ${o.name}'s kinsman's boy under wages, with the choice of going home at the end.` });
              return 'A boy of eleven in a ship’s company that has no idea what to do with him, and '
                + 'an interpreter who is, for a week, distinctly late for several things.';
            },
          },
          {
            label: 'It is a matter between the Casa and its own',
            detail: 'True, in law. It is also a decision about what kind of ship this is.',
            resolve: () => {
              regard(o, -0.3, 'told him the boy was a matter between the Casa and its own');
              setFlag(o, 'refused');
              return 'He says that he understands the law very well. He has spent his life explaining '
                + 'it to people it is applied to.';
            },
          },
        ],
      }),
    },
    {
      when: (c) => c.served > 105 && (flag(c.o, 'trusted') || flag(c.o, 'told') || flag(c.o, 'literal')),
      build: ({ o }) => ({
        id: `arc:lingua:4:${o.id}`,
        title: 'The word he would not carry',
        severity: 'note',
        text:
          `Before the next audience ${o.name} asks to see what you mean to say. He reads it twice. "This is `
          + 'not so," he says, and puts his finger on the sentence that promises something. "I will carry '
          + 'it. I have carried worse. But I know the man who will hear it, and he will remember it in the '
          + 'form I give it, and he will remember it for a long time. I would rather the form were true."',
        choices: [
          {
            label: 'Make it true: promise less',
            detail: 'A smaller word, kept. It will cost you something at the door.',
            resolve: () => {
              regard(o, 0.15, 'cut the promise down to what he would keep');
              setFlag(o, 'cut');
              return 'You strike it down by half, and he carries the half. It is received, at the door, '
                + 'as the exact size of what you meant, and the man who hears it thinks better of both of you.';
            },
          },
          {
            label: 'Say it anyway. It is only a word',
            detail: 'It will serve at the door. It is a word he will have to stand behind.',
            resolve: () => {
              regard(o, -0.25, 'told him to carry a promise he did not think would be kept');
              setFlag(o, 'lied');
              return 'He carries it. He does it, as he always does, perfectly, and he does not look at '
                + 'you when he is done.';
            },
          },
          {
            label: 'Let him choose the words',
            detail: 'He knows the man. You will not know exactly what you have said.',
            resolve: () => {
              regard(o, 0.2, 'let him choose the words of the promise himself');
              setFlag(o, 'chose');
              return 'You do not hear all of it. The man who hears it laughs once, quietly, and takes '
                + 'a long time to answer, and what he says in the end is better than anything you could '
                + 'have got by saying it yourself.';
            },
          },
        ],
      }),
    },
    {
      when: (c) => c.served > 170 && !c.o.leaving,
      build: ({ o }) => ({
        id: `arc:lingua:5:${o.id}`,
        title: 'The tongue he keeps',
        severity: 'note',
        text:
          `${o.name} has the language of three coasts now and a fourth he is half through, and a name along `
          + 'the quay that does not mention you. He asks what he is to you: a hired mouth, which is what '
          + 'the book says, or the man who has been through every door you went through. It is not a '
          + 'request. It is the kind of question that has an answer only one way, and he would like to '
          + 'know which.',
        choices: [
          {
            label: 'Tell him he is one of the company, and mean it',
            detail: 'The only answer that is true. It matters whether the last two years agree.',
            resolve: (g) => {
              if (flag(o, 'refused') && flag(o, 'lied')) {
                regard(o, -0.1, 'told him he was one of the company, after the boy and the promise');
                close(g, o, 5, 'estranged', 'was told he was one of the company by a captain who had refused his boy and used his mouth for a lie');
                return 'He thanks you. He does not believe it, and he is too courteous to say that '
                  + 'the two things you have asked of him cannot both be answered.';
              }
              strike(g, o, 'theBridge');
              return 'He sits very still for a moment, and then he says a sentence in his own '
                + 'language, which he does not translate. It is the first time you have heard him '
                + 'say anything in it for the sake of it.';
            },
          },
          {
            label: 'Tell him he is paid to speak, and that is the whole of it',
            detail: 'It is the book’s answer. It will be believed.',
            resolve: (g) => {
              regard(o, -0.3, 'told him he was paid to speak, and that was the whole of it');
              close(g, o, 5, 'estranged', 'was told he was paid to speak and that was the whole of it');
              return 'He bows, the kind of bow that is always the interpreter’s, and he speaks '
                + 'exactly as well as before.';
            },
          },
          {
            label: 'Offer him a house of his own on the coast, as the Crown’s agent',
            detail: 'He goes ashore, as a man of consequence. His word goes on carrying for you.',
            resolve: (g) => {
              g.crown.standing += 4;
              strike(g, o, 'theBridge');
              farewell(o, 5, 'was made the Crown’s agent on his own coast, with a house');
              return 'It takes him a long time to say yes, and when he does it is with the air of a '
                + 'man agreeing to a thing he had not quite let himself picture. He goes ashore at '
                + 'the next quay, and the ship is quieter for it.';
            },
          },
        ],
      }),
    },
  ],
};

// ------------------------------------------------------ the pilot of Melinde
export const HAMISI: Arc = {
  id: 'hamisi', role: 'piloto', name: 'Hamisi bin Nasir', trait: 'exact', start: false,
  ability: 0.66, standing: 0, wage: 28, languages: ['Kiswahili', 'Árabe'],
  hook: 'A mu’allim of Melinde, who has taken dhows to Cambay and Hormuz by the monsoon, as his father did. He is not for sale; he is asking what kind of ship this is.',
  bond: 'theMuallim',
  beats: [
    {
      when: (c) => c.served > 8,
      build: ({ o }) => ({
        id: `arc:hamisi:1:${o.id}`,
        title: 'Who steers',
        severity: 'note',
        text:
          'For the first week the hands do not know what to call him, and so they call him nothing. When '
          + `${o.name} gives a course to the helm through Correia, the helmsman looks at the old pilot and `
          + 'not at him. At supper the master asks, civilly, whether the Moor is to be fed from the '
          + 'pilot’s mess. Hamisi, who has been a mu’allim for twenty years and a guest for six days, '
          + 'eats and says nothing. He is waiting to see what you do. He has been waiting to see what '
          + 'captains do for a good deal longer than you have been one.',
        choices: [
          {
            label: 'Sit him at the chart table beside Correia, in front of the watch',
            detail: 'The watch will notice. Some of them will mind.',
            resolve: (g) => {
              regard(o, 0.2, 'sat him at the chart table beside Correia in front of the watch');
              g.crew.unrest = clamp(g.crew.unrest + 0.04, 0, 2);
              g.crew.morale = clamp(g.crew.morale - 0.02, 0, 1);
              setFlag(o, 'seated');
              return 'He sits. Correia, who has not been consulted, moves the lamp so the light '
                + 'falls on both of them, and says nothing at all, which from Correia is a speech.';
            },
          },
          {
            label: 'Keep him in the waist, and let Correia pass on his courses',
            detail: 'Quiet. It is what the ship expects of you.',
            resolve: () => {
              regard(o, -0.15, 'kept him in the waist and had his courses passed on by another');
              setFlag(o, 'hidden');
              return 'It works, in the sense that nobody remarks on it. He gives his courses to '
                + 'Correia, and Correia gives them to the helm, and the ship goes where he says '
                + 'with his name taken off the voyage.';
            },
          },
          {
            label: 'Ask him what he wishes to be called aboard',
            detail: 'It is the question nobody has asked.',
            resolve: () => {
              regard(o, 0.18, 'asked him what he wished to be called aboard');
              setFlag(o, 'named');
              return '"Mu’allim," he says. It means a man who is answered when he speaks about '
                + 'the sea. The master does not like it. The helmsman, to everybody’s mild surprise, '
                + 'does.';
            },
          },
        ],
      }),
    },
    {
      when: (c) => c.served > 25,
      build: ({ o }) => ({
        id: `arc:hamisi:2:${o.id}`,
        title: 'The house of the stars',
        severity: 'note',
        text:
          'On a clear night in the lee of the land Hamisi brings out a cord with knots in it and a small '
          + 'plate of horn with a hole in the middle, and holds the cord in his teeth. It is a kamal. '
          + 'He takes the altitude of the pole star by the knot that belongs to the port he is going to, '
          + 'and says the names of the stars of the house of the north and the house of the east as the '
          + 'pilots of his coast say them, in the order they say them, thirty-two houses round. Correia '
          + 'watches with his arms folded. Hamisi says that the best of what he has is written nowhere, '
          + 'and that he does not know whether he may teach it to a ship that will carry it to Lisbon.',
        choices: [
          {
            label: 'Ask what he would have taught, and what not',
            detail: 'It is his to give. You will learn what he gives.',
            resolve: (g) => {
              regard(o, 0.18, 'asked what he would have taught and what he would keep');
              setFlag(o, 'between');
              g.nav.sigmaLon = Math.max(4, g.nav.sigmaLon * 0.9);
              return 'He gives you the cord and the knots and the first six houses. The rest he keeps, '
                + 'and says so, and says you may ask again in a year. It is more than the Casa would '
                + 'have got by asking, and a good deal less than it would have taken.';
            },
          },
          {
            label: 'Have Correia copy every knot and star for the Casa',
            detail: 'The Casa will pay for it. He will see it done.',
            resolve: (g) => {
              regard(o, -0.2, 'had every knot and every star copied out for the Casa');
              setFlag(o, 'taken');
              g.crown.standing += 3;
              g.nav.sigmaLon = Math.max(4, g.nav.sigmaLon * 0.85);
              g.noteDeed('chart.shared', { target: 'portugal', magnitude: 0.4, note: `Had ${o.name}'s kamal and star-houses copied out for the Casa.` });
              return 'Correia copies it, with the dignity of a man copying out a thing he would have '
                + 'liked to learn the other way. Hamisi watches the whole of it, and when it is done '
                + 'he says, politely, that the copy is accurate.';
            },
          },
          {
            label: 'Let him teach the pilots on the next quay, and say whose it is',
            detail: 'His name goes on it. It goes where it will be used.',
            resolve: (g) => {
              regard(o, 0.25, 'let him teach his own method on the quay and put his name to it');
              setFlag(o, 'shared');
              g.nav.sigmaLon = Math.max(4, g.nav.sigmaLon * 0.92);
              return 'He is quiet for a time. "In my country," he says, "a man who gives what he '
                + 'knows is paid in what is said of him." It is a good deal to say about a pilot, '
                + 'and he says it as a fact about the sea.';
            },
          },
        ],
      }),
    },
    {
      when: (c) => c.served > 45,
      build: ({ o }) => ({
        id: `arc:hamisi:3:${o.id}`,
        title: 'Word from the coast',
        severity: 'warning',
        text:
          'A dhow of Melinde, an ordinary one with a patched sail, runs alongside for half an hour in '
          + `the lee and hails the ship. ${o.name} answers for a long time. When she has gone he tells you what `
          + 'she carried, which was not cargo: it was news. A Portuguese ship, not yours, has stopped two '
          + 'dhows off Mombasa in the month of the kusi, taken their cloth, and put one of them ashore on '
          + 'a bar. He knows the owner of one of them. He says it as a fact and not as an accusation, and '
          + 'he adds the thing he has not said since he came aboard: that he has never conned a ship '
          + 'onto a dhow he could name, and does not mean to begin.',
        choices: [
          {
            label: 'Promise him this ship will not stop a ship of his coast while he is aboard',
            detail: 'A promise you will be held to, by him and by the Ledger.',
            resolve: (g) => {
              regard(o, 0.3, 'promised that the ship would not stop a ship of his coast');
              setFlag(o, 'sworn');
              void g;
              return 'He puts his hand flat on the rail for a moment, which is how he takes an oath. '
                + '"Then I will take you across," he says, "and I will not need to ask again."';
            },
          },
          {
            label: 'Tell him the King’s orders are the King’s',
            detail: 'True. It is also the answer a man gives when he has not decided.',
            resolve: () => {
              regard(o, -0.3, 'told him the King’s orders were the King’s');
              setFlag(o, 'orders');
              return 'He nods. He goes on taking sights, and giving courses, and being right; and '
                + 'you notice, as the weeks pass, that he stops volunteering the things that are not asked.';
            },
          },
          {
            label: 'Ask him to carry a letter to the sheikh, in his own hand, saying what the ship will and will not do',
            detail: 'It puts your word where the coast can read it. It puts his name under it.',
            resolve: (g) => {
              regard(o, 0.2, 'asked him to write the sheikh a letter saying what the ship would and would not do');
              setFlag(o, 'letter');
              g.relationsFor('melinde').regard = clamp(g.relationsFor('melinde').regard + 0.04, -1, 1);
              return 'He writes it in Arabic, in a fine hand, and reads it aloud to you in Portuguese, '
                + 'and the two do not say quite the same thing. He puts his name at the foot. The '
                + 'dhows of his coast will know about it before the ship is home.';
            },
          },
        ],
      }),
    },
    {
      when: (c) => c.served > 80,
      build: ({ o }) => ({
        id: `arc:hamisi:4:${o.id}`,
        title: 'The offer from the guild',
        severity: 'note',
        text:
          'A boat from the shore at the next quay brings a message from the mu’allims of Melinde: there '
          + 'is a berth for Hamisi, a master’s berth in a ship of a family that has sailed to Calicut '
          + 'for three generations. He reads it to you before you ask. He is not going to leave without '
          + 'telling you. He does not want to leave; he wants to know what you would have him stay for.',
        choices: [
          {
            label: 'Release him with your thanks and a letter',
            detail: 'He goes home as a master. You lose the best pilot of the Indian sea you will ever have.',
            resolve: (g) => {
              regard(o, 0.2, 'released him with thanks and a letter to take a master’s berth at home');
              g.relationsFor('melinde').regard = clamp(g.relationsFor('melinde').regard + 0.08, -1, 1);
              farewell(o, 5, 'was released with a letter to take a master’s berth in a ship of his own coast');
              return 'He says the Portuguese have a word for what you have just done, and that it is '
                + 'not "weakness." He goes ashore at the next quay with his kamal and his cord, and '
                + 'Correia, who has not said a word in three days, shakes his hand.';
            },
          },
          {
            label: 'Offer him a share in the pepper of this voyage',
            detail: 'Money, openly, and at the Casa’s expense. He will think about it.',
            resolve: (g) => {
              const share = Math.max(60, Math.round(g.crown.gold * 0.08));
              g.crown.gold = Math.max(0, g.crown.gold - share);
              regard(o, 0.18, 'offered him a share in the voyage as a pilot’s due');
              setFlag(o, 'shared');
              return `${share} cruzados, written into the book in front of the clerk. He says it is what a `
                + 'master of his coast would offer, and that he has noticed you did not offer it to '
                + 'make him stay, but because it was due.';
            },
          },
          {
            label: 'Ask him to stay a season, and to train an apprentice for the ship',
            detail: 'Correia’s man. The craft stays aboard when he goes.',
            resolve: (g) => {
              regard(o, 0.15, 'asked him to stay a season and train a pilot for the ship');
              setFlag(o, 'apprentice');
              g.nav.sigmaLat = Math.max(2, g.nav.sigmaLat * 0.95);
              return 'He agrees at once, which is how you know it was the right thing to ask. '
                + 'The apprentice is a Portuguese boy of fifteen and Hamisi calls him, from the first '
                + 'day, by a name that means "the one who asks."';
            },
          },
        ],
      }),
    },
    {
      when: (c) => c.served > 140 && !c.o.leaving,
      build: ({ o }) => ({
        id: `arc:hamisi:5:${o.id}`,
        title: 'What he is called in the book',
        severity: 'note',
        text:
          'The Casa’s roll of pilots, which Correia keeps for the Armazém, has a line for every man who '
          + 'has conned a Portuguese ship. Hamisi’s line says, in a clerk’s hand, "a Moor of Melinde". '
          + 'He has not seen it. He knows what it says; he has seen such lines. He does not ask you to '
          + 'change it. He asks, courteously, whether you know what is in it.',
        choices: [
          {
            label: 'Have it written: Hamisi bin Nasir, mu’allim, pilot of the Indian sea',
            detail: 'His name, his craft, and a line that will be read in Lisbon after he is gone.',
            resolve: (g) => {
              regard(o, 0.2, 'had his line in the Casa’s roll written with his name and his craft');
              strike(g, o, 'theMuallim');
              return 'It takes the clerk an afternoon and a good deal of objection. The line says '
                + 'what he asked for. He reads it in the lamplight, carefully, with his finger '
                + 'under the words, and gives it back without a word.';
            },
          },
          {
            label: 'Leave the clerk’s line',
            detail: 'It is the roll’s way. It is a decision about whose pilot he was.',
            resolve: (g) => {
              regard(o, -0.3, 'left the clerk’s line in the roll: a Moor of Melinde');
              close(g, o, 5, 'estranged', 'was left in the Casa’s roll as a Moor of Melinde', 'theMuallim');
              return 'He thanks you for telling him, which is the courtesy of a man who has decided '
                + 'something. He goes on being the best pilot in the ship. He does not sit at the '
                + 'chart table again unless he is asked.';
            },
          },
          {
            label: 'Ask him what the line should say',
            detail: 'Entirely his answer. It will depend on what the last year has taught him about you.',
            resolve: (g) => {
              if ((o.approval ?? 0) >= 20) {
                regard(o, 0.15, 'asked him what his line in the roll should say');
                strike(g, o, 'theMuallim');
                return 'He considers it with real pleasure. What he dictates is short, and exact, '
                  + 'and has his father’s name in it.';
              }
              regard(o, -0.05, 'asked him what his line should say and was found short');
              close(g, o, 5, 'estranged', 'was asked what his line should say, and told it by then did not matter');
              return '"It is kind of you to ask," he says. "It does not matter now." He says it '
                + 'without bitterness, as a pilot says that a headland has been passed.';
            },
          },
        ],
      }),
    },
  ],
};

export const NEW_ARCS: Arc[] = [PAIS, LINGUA, HAMISI];
