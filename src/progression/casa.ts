import { clamp } from '../core/math';
import { originDef } from './origins';
import type { SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';

/**
 * The Casa da Mina, and the man who decides what your voyage was worth.
 *
 * Every voyage in this game begins and ends at Lisbon, and Lisbon had no face.
 * The court was a settlement screen: a figure appeared, a title was conferred,
 * three commissions were offered. The sea has a rival in it and a wardroom full
 * of written men; the shore end — where the money is actually decided, where a
 * captain is made or quietly stopped being given ships — had nobody in it at
 * all.
 *
 * Aires Tinoco is a contador of the Casa da Mina. He is not a villain and he is
 * not an obstacle: he is an accountant with a duty to the Crown's purse and a
 * settled conviction that captains exaggerate, which is a conviction he holds
 * because captains exaggerate. He reads the escrivão's report before he sees
 * you. He knows what you have been doing — how many miles you really charted,
 * how many men you hanged, whether you came home with the King's cargo or sold
 * it on the quay — because all of that is written down by the Crown's own clerk
 * sitting in your own ship.
 *
 * What he offers, across a career, is the other half of the bargain the rival
 * offers at sea. The rival is a question about what kind of seaman you are.
 * Tinoco is a question about what kind of servant you are, and the answers cost
 * different things: standing with the King, money in hand, and a piece of paper
 * in a file with your name at the bottom of it.
 */

export interface CasaState {
  /** What Tinoco makes of you, -1 to 1. */
  regard: number;
  /** Scenes already played, so each happens once in a career. */
  seen: string[];
  /** You took his arrangement. There is a paper. */
  pact?: boolean;
  /** What the arrangement costs, taken at every settlement. */
  pactFee?: number;
  /** You went to the King about him, and it stuck. */
  broke?: boolean;
  /** He has decided you are worth protecting. */
  patron?: boolean;
}

export function newCasa(): CasaState {
  return { regard: 0, seen: [] };
}

function move(g: Game, delta: number): void {
  g.casa.regard = clamp(g.casa.regard + delta, -1, 1);
}

export interface CasaScene {
  id: string;
  when: (g: Game) => boolean;
  build: (g: Game) => SeaEvent;
}

/** How many commissions are behind him. */
function voyages(g: Game): number {
  return g.crown.completedPatents.length;
}

/**
 * Miles of coast this voyage put on the padrão real.
 *
 * `chartedSincePatent` is reset when a commission is accepted, not when it is
 * settled, so at the moment he walks into the Casa it is exactly the figure
 * under dispute. A captain who took a cargo commission and never saw a new
 * headland has nothing for Tinoco to shave, which is why the scene waits.
 */
function chartedMiles(g: Game): number {
  return Math.round(g.crown.chartedSincePatent || g.chartedThisPassage);
}

export const CASA_SCENES: CasaScene[] = [
  // -------------------------------------------------------------------------
  {
    id: 'figures',
    when: (g) => voyages(g) >= 1 && chartedMiles(g) >= 60,
    build: (g) => {
      const miles = chartedMiles(g);
      const shaved = Math.round(miles * 0.7);
      return {
        id: 'casa:figures',
        title: 'The Contador',
        severity: 'note',
        text:
          'A small room off the Casa da Mina with one window and a great deal of paper in it. '
          + 'The man behind the table is Aires Tinoco, contador, and he has your report in front '
          + 'of him with a finger on one line of it.\n\n'
          + `"You claim ${miles} miles of coast surveyed. The escrivão's book says you were in `
          + `sight of it for rather less of that than you would like, and I am minded to enter `
          + `${shaved}. It is not an accusation, captain. It is a number, and somebody has to `
          + 'choose which one goes to the King."\n\n'
          + 'He waits, with the pen already inked.',
        choices: [
          {
            label: 'Stand on your figures',
            detail: 'They are correct. Say so, and let him make of it what he likes.',
            resolve: (gg) => {
              move(gg, -0.2);
              return 'You tell him the figure is the figure and that he is welcome to sail it '
                + 'himself. He writes down what you said, in full, which you understand about a '
                + 'second too late is the point of having said it in front of him. The number goes '
                + 'up as you gave it. So does a note about your manner.';
            },
          },
          {
            label: 'Let him have it',
            detail: `Take the smaller number. ${miles - shaved} miles of renown you will not see again.`,
            resolve: (gg) => {
              const lost = Math.max(1, Math.round((miles - shaved) / 22));
              gg.crown.standing -= lost;
              move(gg, 0.3);
              return 'You tell him to enter whichever figure he can defend, and he looks up for '
                + 'the first time. It costs you something real and it buys a thing that is not on '
                + 'any list: the only man in Lisbon who reads every report has decided you are not '
                + 'one of the liars.';
            },
          },
          {
            label: 'Put the roteiro on his table',
            detail: 'Let him read the book itself. He will know everything you know.',
            resolve: (gg) => {
              move(gg, 0.45);
              gg.casa.seen.push('sawTheBook');
              return 'You put the book in front of him and tell him to find the miles himself. He '
                + 'reads for forty minutes without speaking while you stand there. Then he enters '
                + 'your figure, exactly as given, and says that he has never been shown one before '
                + 'and would be obliged if you did not tell anybody he asked. What he has also '
                + 'done is read your book.';
            },
          },
        ],
      };
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 'clerk',
    when: (g) => voyages(g) >= 2
      && ((g.crew.floggings ?? 0) > 0 || (g.crew.conceded ?? 0) > 0 || (g.crew.turnedBack ?? 0) > 0),
    build: (g) => {
      const hanged = g.crew.floggings ?? 0;
      const turned = g.crew.turnedBack ?? 0;
      const charge = hanged > 0
        ? `that you hanged ${hanged === 1 ? 'a man' : `${hanged} men`} at the yardarm`
        : turned > 0
          ? 'that you put the helm up and came home with the voyage undone'
          : 'that you stood on your own quarterdeck and let a foremast hand tell you your business';
      return {
        id: 'casa:clerk',
        title: 'What the clerk wrote',
        severity: 'warning',
        text:
          'Tinoco has a second book open today, and it is not yours. It is the escrivão\'s — the '
          + 'Crown\'s own clerk, who sailed in your ship, ate at your table, and wrote down '
          + 'everything he saw, because that is what he was put aboard to do.\n\n'
          + `"He records ${charge}. I am not the Inquisition and this is not a court. But it is `
          + 'in the file now, and files are read by people who were not there. I would rather '
          + 'have your account of it beside his than under it."',
        choices: [
          {
            label: 'Give him the whole of it',
            detail: 'What happened, why, and what it cost. No arranging.',
            resolve: (gg) => {
              move(gg, 0.35);
              return 'You tell him, including the parts that do you no credit, and he writes it '
                + 'down at the same unhurried speed he writes everything. At the end he blots the '
                + 'page and says that a man who explains himself before he is asked twice is '
                + 'usually telling the truth, and that he has been wrong about that perhaps four '
                + 'times in thirty years.';
            },
          },
          {
            label: 'It was necessary. Leave it there.',
            detail: 'Offer nothing. He can write what he likes.',
            resolve: (gg) => {
              move(gg, -0.15);
              return '"Necessary," he repeats, and writes the word down with the quotation marks '
                + 'around it, which you will think about later. The file is closed. It is not, of '
                + 'course, closed.';
            },
          },
          {
            label: 'Suggest the clerk is not a seaman',
            detail: 'Discredit him. He will not sail with you again, and the Casa will know why.',
            resolve: (gg) => {
              move(gg, -0.4);
              const clerk = gg.crew.officers.find((o) => o.role === 'escrivao' && o.alive);
              if (clerk) {
                clerk.loyalty = clamp(clerk.loyalty - 0.4, 0, 1);
                clerk.memory = ['You told the Casa he did not understand what he was watching.',
                  ...(clerk.memory ?? [])].slice(0, 5);
              }
              return 'You observe that a man who has never handed a sail in a gale may not be the '
                + 'best judge of what one costs. Tinoco agrees that this is so. He also observes, '
                + 'mildly, that the clerk is his, that the Casa puts clerks aboard precisely '
                + 'because they are not seamen, and that you have just told him his instrument is '
                + 'faulty rather than that his reading is wrong.';
            },
          },
        ],
      };
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 'offer',
    when: (g) => voyages(g) >= 3 && g.crown.lifetimeStanding >= 140 && !g.casa.pact,
    build: (g) => {
      const cut = Math.max(140, Math.round(g.crown.gold * 0.12) + 120);
      const watched = originDef(g.origin).watched;
      return {
        id: 'casa:offer',
        title: 'An arrangement',
        severity: 'warning',
        text:
          'He sends for you privately, which he has not done before, and the room is the same '
          + 'room with the door shut.\n\n'
          + '"You carry goods on your own account. Every captain does; the Casa knows to within a '
          + 'quintal what every one of you lands, and enters what it is told. What is entered is '
          + 'a matter of judgement and the judgement is mine." He turns his pen over once. "I am '
          + 'not asking you to smuggle. I am telling you that the figure I write can be generous '
          + `or it can be exact, and that a man in my position is paid ${cut} cruzados a year by `
          + 'the Crown to make that decision about people who come home richer than he will ever '
          + 'be."\n\n'
          + (watched
            ? 'He does not mention your family. He does not have to; the file is on the table '
              + 'between you and you both know what is in it.'
            : 'He says it without any appetite at all, which is somehow worse than if he had '
              + 'enjoyed it.'),
        choices: [
          {
            label: `Pay him his ${cut} a year`,
            detail: 'Your private cargo is entered generously from now on. And there is a paper.',
            resolve: (gg) => {
              gg.crown.gold -= cut;
              gg.casa.pact = true;
              gg.casa.pactFee = cut;
              move(gg, 0.3);
              return 'It is done in about ninety seconds and there is no ceremony to it. Your '
                + 'returns are entered generously from this voyage on, and somewhere in that room '
                + 'there is now a sheet of paper that says what you paid and when, because a man '
                + 'like Tinoco does not enter into an arrangement he cannot prove.';
            },
          },
          {
            label: 'Refuse him, and say nothing about it',
            detail: 'Clean hands, an enemy in the one office that values your voyages.',
            resolve: (gg) => {
              move(gg, -0.45);
              return 'You tell him no. He nods as though you had declined a second glass of wine, '
                + 'and the conversation moves to the condition of the Mina fortress. Your figures '
                + 'are exact from that day forward. Exactly exact — he never once enters a number '
                + 'you could complain about, and you never once get the benefit of a doubt.';
            },
          },
          {
            label: 'Take it to the King',
            detail: 'Your word against a contador of thirty years’ service.',
            resolve: (gg) => {
              const weight = gg.crown.lifetimeStanding / 420
                + (gg.casa.seen.includes('sawTheBook') ? 0.2 : 0)
                - (originDef(gg.origin).watched ? 0.25 : 0);
              if (gg.rng.next() < clamp(weight, 0.1, 0.9)) {
                gg.casa.broke = true;
                gg.crown.standing += 25;
                move(gg, -1);
                return 'It takes four months and two audiences and it very nearly does not work. '
                  + 'Tinoco is removed from the Guinea account and given the Madeira sugar books, '
                  + 'which is not a disgrace and is understood by everybody in the building to be '
                  + 'one. He was in that office for thirty years. The men who replace him are '
                  + 'younger, and they have all heard how he went.';
              }
              gg.crown.standing -= 20;
              move(gg, -1);
              return 'You are heard, politely, by a secretary. Nothing whatever happens to '
                + 'Tinoco, who has been at the Casa since before you could read a chart and who '
                + 'is owed favours by men you have not met. What happens instead is that you '
                + 'acquire a reputation as a captain who makes accusations, and it goes in the '
                + 'file, in his hand.';
            },
          },
        ],
      };
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 'reckoning',
    when: (g) => voyages(g) >= 4 && g.crown.lifetimeStanding >= 300 && !g.casa.broke,
    build: (g) => {
      const warm = g.casa.regard > 0.35;
      const cold = g.casa.regard < -0.3;
      return {
        id: 'casa:reckoning',
        title: warm ? 'The man in the small room' : cold ? 'The file' : 'The account',
        severity: cold ? 'grave' : 'note',
        text: warm
          ? 'Tinoco is older and the room has more paper in it. He has had your account ready for '
            + 'a week.\n\n"There is a view in this building that the discovery voyages are a '
            + 'romance and the sugar is the business. I have spent thirty years entering both and '
            + 'I know which of them the kingdom will be remembered for." He pushes the sheet '
            + 'across. "I have entered you generously and I will defend it. You have never once '
            + 'asked me to."'
          : cold
            ? 'You are kept waiting for two hours, which has never happened before, and when you '
              + 'are shown in the file is open at a page near the front.\n\n"I have been reading '
              + 'the whole of it," Tinoco says. "It makes a shape. A man who stands on his '
              + 'figures, who explains nothing, who has views about clerks. None of it is a '
              + 'crime. All of it is in one hand, mine, and it will be read after we are both '
              + 'dead by somebody deciding what you were."'
            : 'He has the account ready and goes through it line by line, as he always does, in '
              + 'the same flat voice.\n\n"You have been coming to this room for years and I could '
              + 'not tell anybody what sort of man you are. That is not a complaint. It is '
              + 'probably the safest thing that can be said about a captain in a building like '
              + 'this one."',
        choices: warm
          ? [
            {
              label: 'Ask him what he wants',
              detail: 'Thirty years in that room. Nobody has asked him.',
              resolve: (gg) => {
                gg.casa.patron = true;
                move(gg, 0.3);
                gg.crown.standing += 15;
                return 'He is silent for long enough that you think you have offended him. Then he '
                  + 'says that he would like, once, to see the thing he has been entering in '
                  + 'ledgers since he was twenty-two, and that he is aware this is not possible '
                  + 'and was not asking. You tell him the next ship out has a cabin. He does not '
                  + 'take it. He mentions it to people for the rest of his life.';
              },
            },
            {
              label: 'Thank him and take the sheet',
              detail: 'He is an accountant. This is what accountants do.',
              resolve: (gg) => {
                gg.casa.patron = true;
                return 'You thank him and take the account, and he is already reaching for the '
                  + 'next file before you are at the door. It is the eighth or ninth time he has '
                  + 'done something for you that was not required of him and neither of you has '
                  + 'ever named it.';
              },
            },
          ]
          : cold
            ? [
              {
                label: 'Tell him what you have actually done',
                detail: 'Not the figures. The coast, the men, the twenty years.',
                resolve: (gg) => {
                  move(gg, 0.4);
                  return 'You talk for a long time, badly, about things that are difficult to put '
                    + 'in a report: what a coast looks like when nobody has drawn it, what it is '
                    + 'to bury a man you shipped from his mother. He listens without writing, '
                    + 'which you have never seen him do. At the end he says that none of that can '
                    + 'go in the file, and that he is sorry, and you believe him.';
                },
              },
              {
                label: 'Let him write what he likes',
                detail: 'The sea knows what you did. The file is paper.',
                resolve: (gg) => {
                  gg.crown.standing -= 12;
                  return 'You tell him the file is his and the coast is yours and that you know '
                    + 'which of the two will still be there in five hundred years. It is a good '
                    + 'line. He writes it down, and it is in the file, and the file is the reason '
                    + 'the next commission goes to somebody else.';
                },
              },
            ]
            : [
              {
                label: 'Tell him plainly what you are',
                detail: 'Twenty years and the man has never had a straight answer.',
                resolve: (gg) => {
                  move(gg, 0.4);
                  return 'You give him a straight answer for the first time in a decade of these '
                    + 'interviews. He writes two lines, which for him is a great deal, and says '
                    + 'that it will make the account easier to defend and that he wishes you had '
                    + 'said it in 1483.';
                },
              },
              {
                label: 'Say nothing. Sign the account.',
                detail: 'He is the Casa and you are a captain. That has been enough.',
                resolve: () => 'You sign where he indicates. It has worked for years and it goes '
                  + 'on working, and on the day you sail for the last time he will enter it in the '
                  + 'book exactly as he entered the first one, and go to lunch.',
              },
            ],
      };
    },
  },
];

/** The scene the Casa has ready for him, if any. Court only, once each. */
export function rollCasaScene(g: Game): SeaEvent | null {
  for (const s of CASA_SCENES) {
    if (g.casa.seen.includes(s.id)) continue;
    if (!s.when(g)) continue;
    g.casa.seen.push(s.id);
    return s.build(g);
  }
  return null;
}

/** What the Casa did with you in the end, for the last page. */
export function casaEnding(g: Game): { title: string; text: string } | null {
  const c = g.casa;
  if (c.seen.length === 0) return null;
  if (c.broke) {
    return {
      title: 'The contador',
      text: 'Aires Tinoco kept the Madeira sugar books for eleven more years and was correct in '
        + 'every particular of them. He never spoke of you and was never heard to complain, and '
        + 'the one time somebody raised it in his hearing he said that the captain had been '
        + 'within his rights. Whether you were is a thing you have decided about several times '
        + 'and not the same way twice.',
    };
  }
  if (c.pact) {
    return {
      title: 'The paper in the file',
      text: 'The arrangement held for as long as he did, and the sums involved were, against what '
        + 'the voyages made, almost nothing. What was not nothing was the sheet of paper with the '
        + 'dates on it, which existed for thirty years in a building you could see from the river '
        + 'and which you thought about every single time you came up the Tagus. Nobody ever used '
        + 'it. That is not the same as it not having been there.',
    };
  }
  if (c.patron) {
    return {
      title: 'The man in the small room',
      text: 'Aires Tinoco entered your last account himself, at seventy-one, having been told he '
        + 'need not come in. He had entered every one of them. The clerks found the Guinea ledgers '
        + 'afterwards and there is a small mark in his hand against the voyages he thought were '
        + 'the real ones, and it is against yours, and no other captain’s.',
    };
  }
  if (c.regard < -0.3) {
    return {
      title: 'The file',
      text: 'The file went where files go. It is complete, it is accurate, and it is entirely '
        + 'without warmth, and for four hundred years it was the only account of you that '
        + 'anybody could read. Everything generous that was ever said about you was said out '
        + 'loud, by men at sea, and none of them wrote it down.',
    };
  }
  return {
    title: 'The account',
    text: 'You and Aires Tinoco did business across a table for twenty years and neither of you '
      + 'ever found out anything about the other. His entries are exact. Yours were mostly true. '
      + 'It is a kind of respect and it is the only kind the building had to give.',
  };
}
