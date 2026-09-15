import type { Officer } from '../crew/crew';
import type { SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';

/**
 * The company.
 *
 * Officers were a set of numbers with a personality label attached: ability,
 * loyalty, a trait that moved a multiplier, and a line of flavour on the crew
 * screen. Nothing about them ever *changed*, so there was no reason to prefer
 * the man you had sailed with twice to the one on the quay this morning with a
 * better ability roll — and a game about three-month voyages in which the only
 * human beings aboard are interchangeable is missing the thing those voyages
 * were actually about.
 *
 * These are written characters with a story that runs across a career. Each has
 * three or four beats that fire when the conditions for them are true — miles
 * sailed together, loyalty won or lost, latitudes reached, men buried — and each
 * beat is a decision that costs something. Carry an arc to its end and the man
 * is *bonded*: he will not leave you, and he is worth something no hired officer
 * can be. Handle him badly and he goes over the side, or ashore, or to the other
 * man.
 *
 * Every arc is tied to a different system, so the company is also how a captain
 * reaches parts of the game he could not otherwise: the pilot is navigation, the
 * master is ambition and betrayal, the degredado is language and the coast, the
 * surgeon is the one disease nobody in this century can cure.
 */

export type BondId =
  | 'oldPilotsHand'
  | 'trueSecond'
  | 'theTongue'
  | 'theRemedy'
  | 'theDraughtsman'
  | 'cureOfSouls';

export interface Bond {
  id: BondId;
  name: string;
  /** What it does, in the words the crew screen uses. */
  effect: string;
}

export const BONDS: Record<BondId, Bond> = {
  oldPilotsHand: {
    id: 'oldPilotsHand', name: 'The old pilot\'s hand',
    effect: 'He taught you to keep the board as he keeps it. Your reckoning drifts a third more slowly for the rest of your life.',
  },
  trueSecond: {
    id: 'trueSecond', name: 'A true second',
    effect: 'He has a ship of his own in view and has decided to get it your way. The watch work as though you were on deck when you are not.',
  },
  theTongue: {
    id: 'theTongue', name: 'The tongue of the coast',
    effect: 'He speaks four languages of this shore and is owed a debt in every town on it. First contact opens far better wherever he has been.',
  },
  theRemedy: {
    id: 'theRemedy', name: 'The remedy',
    effect: 'He worked out what keeps the scurvy off two centuries before anybody published it. Fresh stores go further and the sickness comes on at half the rate.',
  },
  theDraughtsman: {
    id: 'theDraughtsman', name: 'The draughtsman',
    effect: 'His coastal views are the best in the kingdom. Every sheet you bring home is worth half again what it was.',
  },
  cureOfSouls: {
    id: 'cureOfSouls', name: 'Cure of souls',
    effect: 'He has made his peace with a world larger than the one he was taught. The men are steadier than any chaplain has made them, and no coast is closed to you for his sake.',
  },
};

export interface ArcContext {
  g: Game;
  o: Officer;
  /** Simulated days this officer has served aboard. */
  served: number;
}

export interface ArcBeat {
  /** Fires the first time this is true, once the previous beat has resolved. */
  when: (c: ArcContext) => boolean;
  build: (c: ArcContext) => SeaEvent;
}

export interface Arc {
  id: string;
  /** The role this man fills. */
  role: Officer['role'];
  name: string;
  trait: string;
  ability: number;
  languages?: string[];
  /** What the crimp says about him on the quay. */
  hook: string;
  /** Standing before the Crown will let you have him at all. */
  standing: number;
  wage: number;
  beats: ArcBeat[];
  bond: BondId;
}

// --- helpers ---------------------------------------------------------------

function flag(o: Officer, f: string): boolean {
  return (o.arcFlags ?? []).includes(f);
}

function setFlag(o: Officer, f: string): void {
  o.arcFlags = [...(o.arcFlags ?? []), f];
}

/** Move a man's regard for the captain, and give him something to remember. */
function regard(o: Officer, delta: number, memory: string): void {
  o.loyalty = Math.max(0, Math.min(1, o.loyalty + delta));
  o.memory = [memory, ...(o.memory ?? [])].slice(0, 6);
}

/** End the arc well: he is yours, and the bond is struck. */
function bond(g: Game, o: Officer, arc: Arc): string {
  o.bonded = true;
  o.arcStage = arc.beats.length;
  o.loyalty = Math.min(1, o.loyalty + 0.25);
  g.awardBond(arc.bond, o);
  return `${BONDS[arc.bond].name}. ${BONDS[arc.bond].effect}`;
}

/** End the arc badly: he is still aboard, but the thread is cut. */
function breakArc(o: Officer, why: string): string {
  o.arcStage = 99;
  o.memory = [why, ...(o.memory ?? [])].slice(0, 6);
  return why;
}

// --- The arcs --------------------------------------------------------------

export const ARCS: Arc[] = [
  // -------------------------------------------------------------- the pilot
  {
    id: 'correia', role: 'piloto', name: 'Rui Correia', trait: 'veteran',
    ability: 0.72, standing: 0, wage: 34,
    hook: 'Has been down the coast twice and buried men on both voyages. Very little surprises him. He is also older than any pilot you have met.',
    bond: 'oldPilotsHand',
    beats: [
      {
        when: (c) => c.served > 26 && c.g.nav.milesSinceFix > 400,
        build: ({ o }) => ({
          id: `arc:correia:1:${o.id}`,
          title: 'The pilot works the sight twice',
          severity: 'note',
          text:
            `${o.name} took the sun at noon, wrote the latitude in the book, and then, when he `
            + 'thought the quarterdeck was empty, worked the whole thing again from the beginning. '
            + 'He got a different answer the second time. He has written the first one in, scratched '
            + 'it out, written the second, and gone below without saying anything to anybody.',
          choices: [
            {
              label: 'Say nothing',
              detail: 'He is the best pilot you have ever sailed with. Let him keep his dignity.',
              resolve: (g) => {
                regard(o, 0.08, 'left him his dignity when his hand shook');
                setFlag(o, 'quiet');
                void g;
                return 'You did not see it. He does not know that you did not see it, which is its own kind of gift.';
              },
            },
            {
              label: 'Ask him, in front of the watch',
              detail: 'The reckoning is the ship\'s life. Better a shamed pilot than a wrong one.',
              resolve: (g) => {
                regard(o, -0.18, 'shamed him in front of the watch');
                setFlag(o, 'shamed');
                g.nav.sigmaLat = Math.max(2, g.nav.sigmaLat * 0.7);
                return 'He gives you the second figure, flatly, and the correct one, and does not look at you for two days. The reckoning is better for it.';
              },
            },
          ],
        }),
      },
      {
        when: (c) => c.served > 70,
        build: ({ o }) => ({
          id: `arc:correia:2:${o.id}`,
          title: 'Correia asks for the quadrant to be held',
          severity: 'warning',
          text:
            `He comes to you at the change of the watch, and it takes him a while to get to it. `
            + '"The horizon has got soft," he says. "Not the weather. Mine." He has been taking the '
            + 'altitude by having a boy hold the instrument and reading it off at arm\'s length, and '
            + 'it has been getting worse for a year, and he has told nobody because a pilot who cannot '
            + 'see is a pilot who never sails again.',
          choices: [
            {
              label: 'Take the sights yourself; he keeps the board',
              detail: 'You go to the rail at noon. He works the figures, which is the harder half anyway.',
              resolve: (g) => {
                regard(o, 0.2, 'took the quadrant himself rather than put an old man ashore');
                setFlag(o, 'shared');
                g.logEvent('crew', `You and ${o.name} have a new arrangement about the noon sight. Nobody else aboard has been told what it is.`, true);
                return 'From now on you go to the rail and he works the figures. It is a slower business and a better one.';
              },
            },
            {
              label: 'Put him ashore at the next port, with his pay',
              detail: 'Kindly meant and finally done. A blind pilot will kill this ship.',
              resolve: (g) => {
                void g;
                return breakArc(o, 'told him his sight was gone and paid him off');
              },
            },
            {
              label: 'Say nothing and watch him',
              detail: 'He may have years in him yet. He may also put you on a reef.',
              resolve: (g) => {
                setFlag(o, 'watched');
                g.nav.driftScale = 1.25;
                return 'You leave it. The reckoning is a little looser than it was, and you are checking his figures now without telling him, which is the thing he was most afraid of.';
              },
            },
          ],
        }),
      },
      {
        when: (c) => c.served > 120 && (flag(c.o, 'shared') || flag(c.o, 'quiet')),
        build: ({ o, g: game }) => ({
          id: `arc:correia:3:${o.id}`,
          title: 'What Correia knows',
          severity: 'note',
          text:
            `Somewhere in the middle watch, with the ship going quietly and nothing to do, `
            + `${o.name} starts talking and does not stop for three hours. How to tell a current by `
            + 'the way the sea stands against the wind. Why the log always over-reads on a following '
            + 'sea and by how much. What the sky does two days before the weather comes, off this '
            + 'coast, in this month. Forty years of it, and he is giving it to you because he has '
            + 'worked out that he will not be making many more voyages and it will go into the ground '
            + 'with him otherwise.',
          choices: [
            {
              label: 'Write it all down',
              detail: 'Every word, into the roteiro, in his name.',
              resolve: (g) => {
                g.logEvent('navigation', `Forty years of ${o.name}'s reckoning, written into the roteiro in his name.`, true);
                return bond(g, o, ARCS[0]);
              },
            },
            {
              label: 'Listen, and let it be his',
              detail: 'Some of it is his own, and he has not offered it to the Casa.',
              resolve: (g) => {
                void game;
                return bond(g, o, ARCS[0]);
              },
            },
          ],
        }),
      },
    ],
  },

  // ------------------------------------------------------- the sailing master
  {
    id: 'sousa', role: 'mestre', name: 'Brás de Sousa', trait: 'ambitious',
    ability: 0.68, standing: 0, wage: 30,
    hook: 'Means to have a ship of his own, and is keeping his own account of this voyage. Extremely good at the work. Would hold a knife for you or against you depending on the year.',
    bond: 'trueSecond',
    beats: [
      {
        when: (c) => c.served > 30 && c.g.crown.lifetimeStanding > 20,
        build: ({ o }) => ({
          id: `arc:sousa:1:${o.id}`,
          title: 'The master keeps his own book',
          severity: 'note',
          text:
            `The clerk mentions, carefully, that ${o.name} has a book of his own — courses, `
            + 'soundings, the bearings of every headland you have raised this voyage, written up '
            + 'fair every evening. That is either a man learning his trade or a man assembling '
            + 'something he can sell, and there is no way to tell which from the outside.',
          choices: [
            {
              label: 'Ask to see it, and read it with him',
              detail: 'Treat it as what it probably is: a man studying to be a pilot.',
              resolve: (g) => {
                regard(o, 0.16, 'read his private book with him instead of confiscating it');
                setFlag(o, 'trusted');
                void g;
                return 'It is a good book. Better than the clerk\'s in places. He is delighted that you asked, and says so in about four words.';
              },
            },
            {
              label: 'Take it and put it in the ship\'s chest',
              detail: 'Everything written aboard this ship belongs to the voyage.',
              resolve: (g) => {
                regard(o, -0.22, 'took his book off him and locked it in the chest');
                setFlag(o, 'robbed');
                void g;
                return 'He hands it over without a word and works the ship exactly as well as he did before, which is somehow worse than if he had argued.';
              },
            },
          ],
        }),
      },
      {
        when: (c) => c.served > 75 && c.g.crown.discoveries.length > 2,
        build: ({ o }) => ({
          id: `arc:sousa:2:${o.id}`,
          title: 'An offer from the other man',
          severity: 'warning',
          text:
            `At the last port a boat came out from a caravel of the Casa and ${o.name} was in it for `
            + 'an hour. He tells you himself, which he did not have to: he has been offered a pilot\'s '
            + 'berth and a share, by your rival, in exchange for what he knows about where you have '
            + 'been. "I have not said yes," he says. "I am telling you because I have not said yes '
            + 'yet." It is not quite a threat and it is certainly not nothing.',
          choices: [
            {
              label: 'Offer him a share of this voyage',
              detail: 'Cost you money. Buy the man rather than bid for him later.',
              resolve: (g) => {
                const cost = Math.max(120, Math.round(g.crown.gold * 0.16));
                g.crown.gold = Math.max(0, g.crown.gold - cost);
                regard(o, 0.24, 'gave him a share of the voyage rather than let him be bought');
                setFlag(o, 'shared');
                return `${cost} cruzados, and a share written into the book in front of the clerk. He looks at it for a long moment and then goes back on deck.`;
              },
            },
            {
              label: 'Tell him to take it',
              detail: 'A man who tells you about the offer is a man who wants to be bid for. Refuse to bid.',
              resolve: (g) => {
                regard(o, -0.12, 'told him to go to the other man if he wanted to');
                setFlag(o, 'refused');
                void g;
                return 'He does not go. He also does not forget that you did not care whether he did.';
              },
            },
            {
              label: 'Put him in irons for the rest of the passage',
              detail: 'He has been talking to a rival about your discoveries. That is the end of it.',
              resolve: (g) => {
                regard(o, -0.5, 'put him in irons for an offer he refused');
                g.crew.morale = Math.max(0, g.crew.morale - 0.1);
                return breakArc(o, 'was put in irons for an offer he had already turned down');
              },
            },
          ],
        }),
      },
      {
        when: (c) => c.served > 130 && (flag(c.o, 'shared') || flag(c.o, 'trusted')),
        build: ({ o }) => ({
          id: `arc:sousa:3:${o.id}`,
          title: 'Sousa asks for the ship',
          severity: 'note',
          text:
            `"When you have your own squadron," ${o.name} says, "I want the second ship. Not a share `
            + 'of yours. A ship." He has thought about this for years and has the whole thing worked '
            + 'out — what he would carry, where he would go, who he would take. He is asking you to '
            + 'say yes now, years early, in front of nobody, and to mean it.',
          choices: [
            {
              label: 'Give him your word',
              detail: 'It costs nothing today and everything if you break it.',
              resolve: (g) => bond(g, o, ARCS[1]),
            },
            {
              label: 'Tell him the truth: you cannot promise it',
              detail: 'Honest, and he is a man who can tell the difference.',
              resolve: (g) => {
                regard(o, 0.1, 'would not promise him a ship he could not give');
                return bond(g, o, ARCS[1]);
              },
            },
          ],
        }),
      },
    ],
  },

  // ------------------------------------------------------------- the degredado
  {
    id: 'gaspar', role: 'degredado', name: 'Gaspar Vaz', trait: 'curious',
    ability: 0.4, standing: 0, wage: 0,
    hook: 'Condemned for a killing he says was not one. Carried to be put ashore among strangers; if he lives a year he has his pardon. Speaks well, for a man nobody intends to see again.',
    bond: 'theTongue',
    beats: [
      {
        when: (c) => c.served > 14 && Math.abs(c.g.ship.state.pos.lat) < 22,
        build: ({ o }) => ({
          id: `arc:gaspar:1:${o.id}`,
          title: 'The condemned man asks a question',
          severity: 'note',
          text:
            `${o.name} has worked out roughly where he is going to be put over the side, and has `
            + 'started asking the crew what they know about it, which is nothing. He asks you '
            + 'instead — not to be spared, which he knows is not in your gift, but whether you '
            + 'intend to come back for him. "Men say it and do not do it," he says. "I would rather '
            + 'be told now."',
          choices: [
            {
              label: 'Promise to come back for him',
              detail: 'Say it and be held to it.',
              resolve: (g) => {
                regard(o, 0.2, 'promised to come back for him');
                setFlag(o, 'promised');
                void g;
                return 'He nods once and goes back to coiling rope. He believes you, which is a weight you did not have five minutes ago.';
              },
            },
            {
              label: 'Tell him you do not know',
              detail: 'True. Voyages are not planned that far ahead and men die.',
              resolve: (g) => {
                regard(o, 0.05, 'would not promise what he could not promise');
                setFlag(o, 'honest');
                void g;
                return '"That is better than the other answer," he says, and means it.';
              },
            },
          ],
        }),
      },
      {
        when: (c) => !!c.o.ashoreAt,
        build: ({ o }) => ({
          id: `arc:gaspar:2:${o.id}`,
          title: 'Gaspar goes over the side',
          severity: 'warning',
          text:
            `The boat takes ${o.name} in at first light with a bag of trade iron, a crucifix he did `
            + 'not ask for, and no weapon, because a man landed armed is landed as an enemy. He does '
            + 'not look back at the ship. The last the lookout sees is four men coming down the '
            + 'beach to meet him, and him standing still and letting them come.',
          choices: [
            {
              label: 'Stand off and watch until dark',
              detail: 'Costs a day. You will at least know whether he lived the first one.',
              resolve: (g) => {
                g.clock.t += 86400;
                setFlag(o, 'watched');
                regard(o, 0.12, 'lay off the beach a whole day to see whether he lived');
                return 'He is still alive at sunset and sitting by a fire with them. It is not proof of anything. It is better than sailing away at noon.';
              },
            },
            {
              label: 'Make sail',
              detail: 'That is what a degredado is for. The Crown does not expect you to wait.',
              resolve: (g) => {
                void g;
                setFlag(o, 'abandoned');
                return 'You are hull-down by the afternoon. Nobody aboard mentions him again for eleven days.';
              },
            },
          ],
        }),
      },
      {
        // He comes off in a canoe when you stand in for the beach you left him
        // on — not the moment the year is up, wherever in the ocean you are.
        when: (c) => !!c.o.ashoreAt && !!c.o.ashoreSince
          && (c.g.clock.t - c.o.ashoreSince) / 86400 > 300
          && c.g.nearPortNm(c.o.ashoreAt) < 18,
        build: ({ o }) => ({
          id: `arc:gaspar:3:${o.id}`,
          title: 'The man on the beach',
          severity: 'note',
          text:
            `A canoe comes off to the ship with four men in it and one of them is ${o.name}. He is `
            + 'thinner, burnt nearly black, and wearing what everybody else on that beach is wearing. '
            + 'He has a year and more of the language, the name of every man of consequence for sixty '
            + 'miles, and a wife. He has also, technically, earned his pardon, and he is entitled to '
            + 'walk away from you at the next Christian port and never sail again.',
          choices: [
            {
              label: 'Ask him to stay as your interpreter',
              detail: 'He is worth more than any man you could hire. He knows it.',
              resolve: (g) => {
                o.ashoreAt = undefined;
                o.ashoreSince = undefined;
                o.languages = [...new Set([...o.languages, 'coast'])];
                o.ability = Math.min(0.95, o.ability + 0.3);
                return bond(g, o, ARCS[2]);
              },
            },
            {
              label: 'Give him his pardon and let him go',
              detail: 'He has served the sentence. Whatever he wants now, he has earned.',
              resolve: (g) => {
                o.alive = true;
                g.crown.standing += 8;
                return breakArc(o, 'gave him his pardon and let him stay with his wife');
              },
            },
          ],
        }),
      },
    ],
  },

  // -------------------------------------------------------------- the surgeon
  {
    id: 'dinis', role: 'cirurgiao', name: 'Mestre Dinis', trait: 'healer',
    ability: 0.6, standing: 10, wage: 26,
    hook: 'Has buried more men than he has saved and has stopped pretending otherwise. Keeps a book of everything he has tried against the scurvy, all of it useless so far.',
    bond: 'theRemedy',
    beats: [
      {
        when: (c) => c.g.crew.scurvy > 0.2,
        build: ({ o }) => ({
          id: `arc:dinis:1:${o.id}`,
          title: 'The surgeon wants to try something',
          severity: 'note',
          text:
            `${o.name} has a theory, and he is embarrassed about it, because it is not medicine. `
            + 'He has noticed that the men who go longest without the scurvy are the ones who steal '
            + 'fruit ashore, and the ones who go first are the ones who eat only what is issued. He '
            + 'wants to divide the watches: half on the ordinary ration, half given whatever green '
            + 'stuff can be got, and the difference written down.',
          choices: [
            {
              label: 'Let him do it',
              detail: 'Half the men get the better of it and half get the worse, and you will know.',
              resolve: (g) => {
                setFlag(o, 'trial');
                regard(o, 0.15, 'let him run his trial on the watches');
                g.logEvent('crew', `${o.name} has divided the watches for his trial. He writes it up every evening.`, true);
                return 'It is done. He records it in a hand that gets steadier as the weeks go by.';
              },
            },
            {
              label: 'Refuse — issue the same to every man',
              detail: 'You will not feed one watch better than another on a theory.',
              resolve: (g) => {
                regard(o, -0.1, 'refused to let him divide the ration for his trial');
                void g;
                return 'He accepts it. He goes on keeping the book anyway, with nothing in it worth reading.';
              },
            },
          ],
        }),
      },
      {
        when: (c) => flag(c.o, 'trial') && c.served > 60,
        build: ({ o }) => ({
          id: `arc:dinis:2:${o.id}`,
          title: 'The trial comes out',
          severity: 'note',
          text:
            'The result is not subtle. The watch that got the green stuff and the oranges has three '
            + 'men with soft gums. The other watch has eleven, two of them past working, and one who '
            + 'will not see Lisbon. '
            + `${o.name} is not triumphant about it. He is holding the book and looking at the column `
            + 'of names on the wrong side of it and saying, over and over, that he could have run this '
            + 'trial nine years ago.',
          choices: [
            {
              label: 'Put the whole ship on fresh whenever it can be got, at any cost',
              detail: 'Reorganise the storing of the ship around one column in one book.',
              resolve: (g) => {
                setFlag(o, 'adopted');
                g.crew.scurvy = Math.max(0, g.crew.scurvy - 0.15);
                regard(o, 0.25, 'changed how the ship was stored on the strength of his book');
                return 'Every port call from now on is partly a foraging expedition. The boatswain thinks you have lost your mind and the surgeon knows you have not.';
              },
            },
            {
              label: 'Note it, and change nothing yet',
              detail: 'One voyage, one ship, two hundred men. That is not proof.',
              resolve: (g) => {
                regard(o, -0.05, 'wanted more than one voyage before believing the book');
                void g;
                return 'He agrees with you, which is the worst part. He would like more evidence too. He simply does not think the men have time.';
              },
            },
          ],
        }),
      },
      {
        when: (c) => flag(c.o, 'adopted') && c.served > 110,
        build: ({ o }) => ({
          id: `arc:dinis:3:${o.id}`,
          title: 'What to do with the book',
          severity: 'note',
          text:
            `${o.name} has it written up properly now: four voyages, the rations, the deaths, and what `
            + 'he thinks it means, which is that the scurvy is not a corruption of the blood at all but '
            + 'a simple want of something that is in fruit and not in biscuit. He wants to know what to '
            + 'do with it. The Casa would bury it — a state secret is worth more than a cure. The '
            + 'physicians at Coimbra would laugh at a ship\'s surgeon. Every pilot on the quay would '
            + 'read it tomorrow.',
          choices: [
            {
              label: 'Give it to the quay',
              detail: 'Copies to every master who will take one. No credit, no money, and it saves men.',
              resolve: (g) => {
                g.crown.standing = Math.max(0, g.crown.standing - 10);
                g.crown.lifetimeStanding += 20;
                g.logEvent('crew', `${o.name}'s book is copied out for anybody on the quay who asks. The Casa is not pleased.`, true);
                return bond(g, o, ARCS[3]);
              },
            },
            {
              label: 'Lodge it with the Casa as a secret of the Crown',
              detail: 'It is worth a great deal and the King has paid for this ship.',
              resolve: (g) => {
                g.crown.gold += 400;
                g.crown.standing += 25;
                regard(o, -0.3, 'sold his book to the Casa to be locked in a cupboard');
                return breakArc(o, 'saw his life\'s work locked in a cupboard at the Casa da Mina');
              },
            },
          ],
        }),
      },
    ],
  },
];

export const ARC_BY_ID = new Map(ARCS.map((a) => [a.id, a]));

/**
 * The beat that is due for this man, or null.
 *
 * Arcs advance one beat at a time and never go backwards. A stage of 99 is a
 * cut thread: the man stays aboard and goes on doing his work, and nothing
 * further is ever offered.
 */
export function dueBeat(c: ArcContext): { arc: Arc; beat: ArcBeat; index: number } | null {
  const arc = c.o.arc ? ARC_BY_ID.get(c.o.arc) : undefined;
  if (!arc) return null;
  const stage = c.o.arcStage ?? 0;
  if (stage >= arc.beats.length) return null;
  const beat = arc.beats[stage];
  if (!beat.when(c)) return null;
  return { arc, beat, index: stage };
}
