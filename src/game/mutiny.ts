import { clamp } from '../core/math';
import {
  RATING_LABEL, TEMPER, aboardHands, shiftAll, shiftRegard, type Hand,
} from '../crew/hands';
import { skill } from '../crew/skills';
import type { SeaEvent } from './seaEvents';
import type { Game } from './state';

/**
 * They have come aft in a body.
 *
 * This used to be a coin flip. Unrest crossed one, the game rolled the
 * captain's Leadership against a random number, and printed one of two
 * paragraphs: either "you put the ringleaders in irons" or "they have taken the
 * ship". Nobody had a name, the captain made no decision, and the single most
 * dramatic thing that can happen aboard was settled by a number the player
 * could not see and could not argue with.
 *
 * What makes a mutiny a scene rather than a dice roll is that it has three
 * things the coin flip had none of.
 *
 * **A man.** Somebody is standing in front of the others doing the talking, and
 * he is a man from the fo'c'sle with a name, a home town and a reason. Which
 * man it is falls out of who has actually been aboard, what his temper is, and
 * how far his own regard for the captain has fallen — so the ringleader off
 * Guinea in one career is a different man from the ringleader in the next, and
 * in a career where the captain has kept his men fed and landed them regularly
 * there is nobody willing to do it at all.
 *
 * **A grievance that is true.** He does not say "morale is low". He says the
 * water is down to eleven days and we have buried nine men and you have not put
 * us ashore since the Cape Verdes, because those are the actual numbers in the
 * actual simulation and the player can check every one of them. A complaint the
 * captain knows to be justified is a very different thing to answer than a
 * grumble, and the game should not protect him from the difference.
 *
 * **Sides.** Some of the men are behind him and some are standing aft by the
 * captain, and both groups are named. That is what turns "the crew" into
 * people: you find out, at the worst moment of the voyage, which of them think
 * you are worth it.
 *
 * None of the four answers is correct. Hanging him settles it now and is
 * remembered for twenty years by every man who watched. Hearing him out costs
 * you the thing he is asking for and buys back the ship. Facing him down is
 * free if it works. Turning for home ends the voyage and saves the company.
 */

interface Grievance {
  /** What he says, with the real number in it. */
  text: string;
  /** How much weight it carries, 0-1, for whether the men side with him. */
  weight: number;
  /** True when the captain can actually do something about it. */
  answerable: boolean;
}

/** What is actually wrong with this ship, worst first. */
function grievances(g: Game): Grievance[] {
  const out: Grievance[] = [];
  const p = g.crew.provisions;
  const men = Math.max(1, g.crew.count);

  // Water outranks everything. A man who has counted the casks and made it
  // eleven days is not worried about the same thing as a man who is bored of
  // salt meat, and when both are true he talks about the casks.
  if (p.water < 30) {
    out.push({
      text: `there is ${p.water.toFixed(0)} days of water in the ground tier and he has counted it himself`,
      weight: clamp((30 - p.water) / 30, 0, 1) * 1.4,
      answerable: true,
    });
  }
  if (p.biscuit < 30) {
    out.push({
      text: `the bread is down to ${p.biscuit.toFixed(0)} days and half of that is weevils`,
      weight: clamp((30 - p.biscuit) / 30, 0, 1) * 1.1,
      answerable: true,
    });
  }
  if (g.crew.daysWithoutFresh > 40) {
    out.push({
      text: `no man aboard has eaten anything fresh in ${g.crew.daysWithoutFresh.toFixed(0)} days`,
      weight: clamp((g.crew.daysWithoutFresh - 40) / 60, 0, 1),
      answerable: true,
    });
  }
  if (g.crew.daysSinceLandfall > 45) {
    out.push({
      text: `she has not had her anchor down in ${g.crew.daysSinceLandfall.toFixed(0)} days`,
      weight: clamp((g.crew.daysSinceLandfall - 45) / 70, 0, 1),
      answerable: true,
    });
  }
  if (g.crew.deaths > 0) {
    const share = g.crew.deaths / (men + g.crew.deaths);
    out.push({
      text: `${g.crew.deaths} men have gone over the side since Lisbon`,
      weight: clamp(share * 2.2, 0, 1),
      answerable: false,
    });
  }
  if (g.crew.scurvy > 0.25) {
    out.push({
      text: 'half the watch cannot climb and their gums are black',
      weight: clamp(g.crew.scurvy, 0, 1),
      answerable: false,
    });
  }
  const south = g.ship.state.pos.lat;
  if (south < -5) {
    out.push({
      text: 'nobody aboard can tell him what is south of here, because nobody has been',
      weight: 0.45,
      answerable: false,
    });
  }
  out.sort((a, b) => b.weight - a.weight);
  return out;
}

/** Who is doing the talking, or nobody. */
function findRingleader(g: Game): Hand | null {
  const live = aboardHands(g.hands);
  if (live.length === 0) return null;
  let best: Hand | null = null;
  let bestScore = 0;
  for (const h of live) {
    // A man leads when he is the sort who would *and* when he has stopped
    // believing in the captain — and the second term has to dominate, or the
    // bold hand leads a mutiny on a happy ship because boldness is his
    // character. Squared and a bit: at three-quarters regard even the boldest
    // man aboard will not stand out in front of the others, which is precisely
    // the thing a captain spends two years buying.
    const doubt = Math.pow(1 - h.regard, 2.2);
    const score = TEMPER[h.temper].lead * doubt * (1 + g.crew.unrest);
    if (score > bestScore) { bestScore = score; best = h; }
  }
  // Below this nobody is willing to stand out in front, whatever the unrest.
  return bestScore > 0.35 ? best : null;
}

/** Who goes with him, and who stands aft. */
function takeSides(g: Game, leader: Hand): { with: Hand[]; against: Hand[] } {
  const withHim: Hand[] = [];
  const against: Hand[] = [];
  for (const h of aboardHands(g.hands)) {
    if (h.id === leader.id) continue;
    const pull = TEMPER[h.temper].follow * (1 - h.regard) * (0.6 + g.crew.unrest * 0.5);
    if (pull > 0.5) withHim.push(h);
    else if (h.regard > 0.55) against.push(h);
  }
  return { with: withHim, against };
}

function nameList(hands: Hand[]): string {
  if (hands.length === 0) return 'nobody';
  if (hands.length === 1) return hands[0].name;
  if (hands.length === 2) return `${hands[0].name} and ${hands[1].name}`;
  return `${hands.slice(0, -1).map((h) => h.name).join(', ')} and ${hands[hands.length - 1].name}`;
}

/**
 * Build the scene. Returns null when there is nobody aboard willing to lead
 * one, which is itself a result: a captain who has kept his men has no mutiny
 * to answer, and that is the reward for having kept them.
 */
export function mutinyScene(g: Game): SeaEvent | null {
  const leader = findRingleader(g);
  if (!leader) return null;

  const sides = takeSides(g, leader);
  const gr = grievances(g);
  const top = gr.slice(0, 3);
  const authority = skill(g.effectiveSkill, 'lideranca');
  const rating = RATING_LABEL[leader.rating].english.toLowerCase();

  const complaint = top.length > 0
    ? top.map((x) => x.text).join('; ')
    : 'he cannot say exactly, only that it has been too long and too far';

  const strength = clamp(
    top.reduce((s, x) => s + x.weight, 0) / Math.max(1, top.length), 0, 1);

  const backing = sides.with.length;
  const loyal = sides.against.length;

  return {
    id: 'mutiny',
    title: 'They have come aft',
    severity: 'grave',
    text:
      `The watch below are on deck and they are not working. ${leader.name}, `
      + `${rating}, of ${leader.from}, is standing at the break of the quarterdeck with his cap `
      + `in his hands, which is worse than if he had a knife, because it means he has thought `
      + `about it. He says ${complaint}. He says the men want the helm put up for Portugal.\n\n`
      + (backing > 0
        ? `Behind him: ${nameList(sides.with)}.`
        : 'Nobody has actually stepped up beside him. He is out there on his own.')
      + (loyal > 0
        ? ` Aft of you, saying nothing and not moving: ${nameList(sides.against)}.`
        : ' There is nobody aft but you and the wardroom.')
      + '\n\nHe is waiting. So is everybody else.',
    choices: [
      {
        label: `Hang ${leader.name} from the yardarm`,
        detail: backing > 0
          ? `It will settle it. There ${backing === 1 ? 'is one man' : `are ${backing} men`} behind `
            + 'him who will watch you do it.'
          : 'It will settle it, and it will be the thing every man aboard remembers of you.',
        resolve: (gg) => hang(gg, leader, sides),
      },
      {
        label: 'Hear him out, and give him what he asks',
        detail: top.some((x) => x.answerable)
          ? 'Full ration restored and the first land we raise, we land. You will have conceded it publicly.'
          : 'You cannot fix what he is complaining of. You can only say so to his face.',
        resolve: (gg) => concede(gg, leader, top),
      },
      {
        label: 'Face him down where he stands',
        detail: `Nothing offered and nothing given. Rests entirely on what they think of you`
          + ` — ${(authority * 100).toFixed(0)} against his ${(strength * 100).toFixed(0)}.`,
        resolve: (gg) => faceDown(gg, leader, sides, authority, strength),
      },
      {
        label: 'Put the helm up. She goes home.',
        detail: 'The voyage is over and the company is alive. The Casa will want to know why.',
        resolve: (gg) => turnBack(gg, leader),
      },
    ],
  };
}

function hang(g: Game, leader: Hand, sides: { with: Hand[]; against: Hand[] }): string {
  leader.alive = false;
  leader.aboard = false;
  leader.fate = 'Hanged at the main yardarm for mutiny.';
  leader.fateT = g.clock.t;
  g.crew.count = Math.max(1, g.crew.count - 1);
  g.crew.unrest = 0.15;
  g.crew.morale = clamp(g.crew.morale - 0.08, 0, 1);

  // The men who stood behind him do not forget, and neither does anybody else
  // — the whole company watched. Fear works, and it is not free.
  for (const h of sides.with) {
    shiftRegard(h, -0.3, `Saw ${leader.name} hanged for saying what the rest were thinking.`);
  }
  shiftAll(g.hands, -0.1, `${leader.name} was hanged at the yardarm.`);
  g.crew.floggings = (g.crew.floggings ?? 0) + 1;

  g.logEvent('crew',
    `${leader.name}, ${RATING_LABEL[leader.rating].english.toLowerCase()} of ${leader.from}, was `
    + 'run up to the main yardarm at four bells with the whole company mustered to watch it. He '
    + 'did not say anything at the end. The watch went back to their stations and the ship was '
    + 'worked well and silently for the rest of the day, and for a long time after that.', true);
  return 'It is settled, in the way that these things are settled. The deck was holystoned in the '
    + 'afternoon and nobody spoke above what the work required. You have your ship. You will be '
    + 'this to them for the rest of the voyage and they will say it about you ashore for the rest '
    + 'of your life.';
}

function concede(g: Game, leader: Hand, top: Grievance[]): string {
  g.crew.unrest = 0.1;
  g.crew.morale = clamp(g.crew.morale + 0.2, 0, 1);
  g.ration = Math.max(g.ration, 1);
  // He was right, and saying so to his face is worth more to the men forward
  // than anything else the captain can do.
  shiftAll(g.hands, 0.16, `The captain heard ${leader.name} out on deck and did not pretend.`);
  shiftRegard(leader, 0.3, 'The captain listened, in front of everybody.');
  // Authority publicly conceded is authority spent. The next one comes sooner.
  g.crew.conceded = (g.crew.conceded ?? 0) + 1;

  const answerable = top.filter((x) => x.answerable).length > 0;
  g.logEvent('crew',
    `Heard ${leader.name} out at the break of the quarterdeck in front of the whole ship's `
    + 'company, and told him he was right, because he was. Full ration restored from tonight and '
    + 'the first land we raise we water at, whatever it costs the passage.', true);
  return answerable
    ? 'You give him the full ration and your word about the first landfall, and he takes his cap '
      + 'and says "thank you, senhor" and goes forward, and the watch turns to without being told. '
      + 'It cost you nothing you can put a figure on and a great deal that you can. They know now '
      + 'that coming aft works, and they will come aft again.'
    : 'You tell him the truth, which is that you cannot conjure water out of the sea and the men '
      + 'who are dead are dead. He listens to it. Being told the truth by the captain in front of '
      + 'the ship’s company turns out to be most of what he came aft for.';
}

function faceDown(
  g: Game, leader: Hand, sides: { with: Hand[]; against: Hand[] },
  authority: number, strength: number,
): string {
  // Standing on nothing but what they already think of you. The loyal men on
  // deck count for as much as the skill does — this is the moment a career of
  // treating them decently is cashed in, or found to be empty.
  const standing = authority * 0.55
    + (sides.against.length / Math.max(1, sides.against.length + sides.with.length)) * 0.45;
  const won = g.can('followAnywhere') || g.rng.next() < clamp(standing - strength * 0.35 + 0.2, 0.05, 0.95);

  if (won) {
    g.crew.unrest = 0.3;
    g.crew.morale = clamp(g.crew.morale + 0.05, 0, 1);
    shiftRegard(leader, -0.15, 'Backed down in front of the whole company.');
    g.logEvent('crew',
      `Went forward to ${leader.name} and stood in front of him and told him to get back to his `
      + 'station. He looked past you for a long moment at the men who were supposed to be behind '
      + 'him, and what he saw there decided it. He went.', true);
    return 'He goes. They all go, in ones and twos, finding something to do. Nothing has been '
      + 'given and nothing has been spent, and it worked because of who they already thought you '
      + 'were — which means it was bought a long time ago, a watch at a time.';
  }

  // It did not work, and now everybody has seen it not work.
  g.crew.unrest = 1.4;
  g.crew.morale = clamp(g.crew.morale - 0.12, 0, 1);
  shiftAll(g.hands, -0.12, 'The captain tried to face them down and it did not answer.');
  g.ship.state.heading = (g.ship.state.heading + 180) % 360;
  g.helmOrder = null;
  g.latitudeOrder = null;
  g.crew.taken = true;
  g.logEvent('crew',
    `Told ${leader.name} to get back to his station. He did not move, and then neither did `
    + 'anybody else, and the silence went on a great deal too long. The helm is up. She is '
    + 'heading north.', true);
  g.pushAlert('The crew have taken the ship and put her head for home.', 'grave');
  return 'He does not move. Nobody moves. You find out, standing there, exactly what you are '
    + 'worth to these men, and the answer is not enough. The helm goes up without anybody giving '
    + 'the order and she pays off onto the other tack heading north, and you are captain of this '
    + 'ship in name for as long as it takes her to smell Portugal.';
}

function turnBack(g: Game, leader: Hand): string {
  g.crew.unrest = 0;
  g.crew.morale = clamp(g.crew.morale + 0.3, 0, 1);
  shiftAll(g.hands, 0.25, 'The captain turned her for home rather than bury the rest of us.');
  g.ship.state.heading = (g.ship.state.heading + 180) % 360;
  g.helmOrder = null;
  g.latitudeOrder = null;
  g.clearDestination();
  g.crew.turnedBack = (g.crew.turnedBack ?? 0) + 1;
  // The Crown does not care what it cost the men.
  g.crown.standing = Math.max(0, g.crown.standing - 18);
  g.logEvent('crew',
    `Gave the order yourself, before ${leader.name} could ask again: up helm, and lay her north. `
    + 'The cheer that went up forward was the loudest noise on this voyage and it is the one you '
    + 'will think about.', true);
  return 'You give the order yourself, which matters, because it means it was an order and not a '
    + 'surrender. They will sail with you again — every one of them will sail with you again. The '
    + 'Casa da Mina will take a different view, and the Casa da Mina is who decides what you get '
    + 'next.';
}
