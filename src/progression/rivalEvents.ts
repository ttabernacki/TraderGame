import { clamp } from '../core/math';
import type { SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';

/**
 * Meeting the other man.
 *
 * The rival worked as a simulation — a frontier creeping south, ports going
 * onto the padrão real under his name, gossip about him in every factor's
 * mouth — and as a character he was a scoreboard. You could lose a whole coast
 * to him over two years and never once be in the same ocean as him.
 *
 * These are the times you actually meet. There are five of them in a career and
 * each is a decision that moves one number: `regard`, which runs from hatred to
 * something like friendship and decides which of four endings the rivalry gets.
 * None of the choices is obviously correct. Helping him costs you the lead;
 * ruining him costs you the only other man alive who understands what you are
 * doing.
 */

export interface RivalMeeting {
  id: string;
  /** Fires the first time this is true and it has not fired before. */
  when: (g: Game) => boolean;
  build: (g: Game) => SeaEvent;
}

function move(g: Game, delta: number, note: string): void {
  g.rival.regard = clamp((g.rival.regard ?? 0) + delta, -1, 1);
  g.rival.met = true;
  g.logEvent('note', note, true);
}

/** Miles between the ship and the rival's frontier, north-south only. */
function gapNm(g: Game): number {
  return Math.abs(g.ship.state.pos.lat - g.rival.frontierLat) * 60;
}

export const MEETINGS: RivalMeeting[] = [
  {
    id: 'sail',
    when: (g) => gapNm(g) < 90 && g.daysSincePort > 4,
    build: (g) => {
      // He is a ship, and he is out there: put him on the sea where the
      // player can see him and, if it comes to it, race him.
      g.putRivalOnTheSea();
      return {
      id: 'rival:sail',
      title: 'A sail, and she is one of ours',
      severity: 'note',
      text:
        'A sail at first light, hull-down to the south and standing the same way you are. By '
        + `noon there is no doubt about the build of her. It is ${g.rival.ship}, and the man on `
        + `her quarterdeck is ${g.rival.name}, and the pair of you are the only Christians within `
        + 'nine hundred miles of this piece of water.',
      choices: [
        {
          label: 'Close her and speak him',
          detail: 'Two ships, one ocean. There are things only he will understand.',
          resolve: (gg) => {
            move(gg, 0.25, `Spoke ${gg.rival.name} at sea. Neither of you mentioned the race.`);
            gg.crew.morale = clamp(gg.crew.morale + 0.06, 0, 1);
            return 'You lie to within hailing distance for an hour. He gives you the set of the '
              + 'current south of the cape and you give him what you know of the watering. Neither '
              + 'of you says a word about the other thing. The men cheer each other, which is '
              + 'strange to watch.';
          },
        },
        {
          label: 'Crowd on and beat him to the next headland',
          detail: 'He has seen you too. Whoever is round first has the naming of it.',
          resolve: (gg) => {
            move(gg, -0.2, `Raced ${gg.rival.name} for the next headland rather than speak him.`);
            const target = gg.startRivalRace();
            return `Whoever is first a degree and a half to the south — about ${target} — has the `
              + 'naming of whatever is there. Everything she will carry and some she will not; he '
              + 'has seen you, and he is doing the same.';
          },
        },
        {
          label: 'Alter course and let him lose you',
          detail: 'What he does not know about your track, he cannot report.',
          resolve: (gg) => {
            move(gg, -0.05, `Avoided ${gg.rival.name} at sea rather than be seen.`);
            return 'You stand out to seaward until dark and then take up the old course. He may '
              + 'have thought you were a stranger. He almost certainly did not.';
          },
        },
      ],
      };
    },
  },

  {
    id: 'pillar',
    when: (g) => g.rival.claimed.length > 0 && g.sounding.shoreDistNm < 6,
    build: (g) => ({
      id: 'rival:pillar',
      title: 'His pillar on the point',
      severity: 'note',
      text:
        'There is a padrão standing on the headland: limestone, cut with the arms and a cross, '
        + `and ${g.rival.name}'s name on the base with a date eleven months old. It is the first `
        + 'Christian thing anybody aboard has seen in a hundred days and it belongs to the one man '
        + 'you did not want to have been here.',
      choices: [
        {
          label: 'Salute it and sail on',
          detail: 'He got here first. That is all it means.',
          resolve: (gg) => {
            move(gg, 0.2, 'Saluted the other man’s pillar rather than resent it.');
            gg.crew.morale = clamp(gg.crew.morale + 0.04, 0, 1);
            return 'The gun is fired once and the men take their caps off, and it is not clear to '
              + 'anybody including you whether that was for the Crown, for the pillar, or for the '
              + 'fact that somebody else got this far and lived.';
          },
        },
        {
          label: 'Set your own beside it',
          detail: 'Let the padrão real carry both names on the same headland.',
          resolve: (gg) => {
            move(gg, 0.05, 'Set a pillar beside the other man’s on the same point.');
            gg.crown.standing += 6;
            return 'Two pillars on one point, eleven months apart. The Casa will find that very '
              + 'irritating and the coast will find it incomprehensible.';
          },
        },
        {
          label: 'Throw it down',
          detail: 'A headland has one name. If his is on it, yours cannot be.',
          resolve: (gg) => {
            move(gg, -0.45, `Threw down ${gg.rival.name}'s pillar and set your own on the stump.`);
            gg.crown.standing -= 12;
            gg.crew.morale = clamp(gg.crew.morale - 0.08, 0, 1);
            return 'It takes six men and most of a morning. The chaplain will not come ashore for '
              + 'it. Word of this will be in Lisbon before you are.';
          },
        },
      ],
    }),
  },

  {
    id: 'distress',
    when: (g) => gapNm(g) < 140 && g.crown.lifetimeStanding > 90 && g.daysSincePort > 10,
    build: (g) => ({
      id: 'rival:distress',
      title: 'She is flying something from the maintop',
      severity: 'warning',
      text:
        `${g.rival.ship}, six miles off, under a jury rig and making about two knots. As you close `
        + 'her you can see what happened: she has been dismasted and repaired badly, and she is '
        + 'very deep in the water. A boat comes across with her master in it. They have water for '
        + 'nine days and eleven hundred miles to go, and he has come himself because sending '
        + 'anybody else would have been a lie about how bad it is.',
      choices: [
        {
          label: 'Give him water and a spare spar',
          detail: 'Costs you a fortnight of your own margin and most of your lead.',
          resolve: (gg) => {
            gg.crew.provisions.water = Math.max(8, gg.crew.provisions.water - 22);
            gg.clock.t += 2 * 86400;
            move(gg, 0.45, `Gave ${gg.rival.name} water and a spar when he would have died without them.`);
            return 'Two days alongside in a rising sea getting a spar across to him. He does not '
              + 'thank you in any way you would recognise. He writes something in his book, and '
              + 'shows you that he has written it, and does not let you read it.';
          },
        },
        {
          label: 'Give him water. Take his charts for it.',
          detail: 'He will live, and you will have everything he has found.',
          resolve: (gg) => {
            gg.crew.provisions.water = Math.max(8, gg.crew.provisions.water - 18);
            gg.crown.chartedSincePatent += 320;
            gg.chartedThisPassage += 320;
            move(gg, -0.3, `Made ${gg.rival.name} pay for his water in charts.`);
            return 'He agrees to it in about four seconds, which is how you learn exactly how bad '
              + 'it was. Three hundred miles of coast in his own hand, and a man who will remember '
              + 'the price of it for the rest of his life.';
          },
        },
        {
          label: 'Stand on',
          detail: 'You have a commission, a crew, and no water to spare for a competitor.',
          resolve: (gg) => {
            move(gg, -0.8, `Left ${gg.rival.name} dismasted and short of water, and sailed on.`);
            gg.crew.morale = clamp(gg.crew.morale - 0.14, 0, 1);
            gg.crew.unrest = clamp(gg.crew.unrest + 0.2, 0, 2);
            return 'The boat is still pulling after you when the light goes. The hands are very '
              + 'quiet at supper. Whether he made Lisbon is a thing you will find out at the '
              + 'same time as everybody else.';
          },
        },
      ],
    }),
  },

  {
    id: 'compact',
    when: (g) => (g.rival.regard ?? 0) > 0.4 && g.crown.lifetimeStanding > 140,
    build: (g) => ({
      id: 'rival:compact',
      title: 'What the other man proposes',
      severity: 'note',
      text:
        `A letter from ${g.rival.name}, carried up the coast by three separate ships over five `
        + 'months, and addressed to you by name rather than by rank. He proposes that the two of '
        + 'you divide it: everything north of the line he has reached is his to work, everything '
        + 'south is yours to find, and each sends the other what he learns. The Casa would call '
        + 'that a conspiracy. He puts it more simply — between them, he writes, they have killed '
        + 'every other man who tried this, and there are two of us left.',
      choices: [
        {
          label: 'Agree, and keep it',
          detail: 'Share what you find with the one man who can use it. The Crown will not like it.',
          resolve: (gg) => {
            move(gg, 0.4, `Made a private compact with ${gg.rival.name} to divide the coast.`);
            gg.rival.compact = true;
            gg.crown.standing = Math.max(0, gg.crown.standing - 15);
            return 'You write back in the same hand he used, which is to say plainly. From now on '
              + 'what he learns comes north to you and what you learn goes south to him, and '
              + 'neither of you tells the Casa da Mina a single word about any of it.';
          },
        },
        {
          label: 'Refuse, and tell him why',
          detail: 'You sail for the King. So does he. Pretending otherwise gets men hanged.',
          resolve: (gg) => {
            move(gg, -0.1, `Refused ${gg.rival.name}'s compact, and said so to his face in writing.`);
            gg.crown.standing += 10;
            return 'He writes back once more, a short letter, agreeing that you are probably '
              + 'right and that he is sorry you are. You keep it.';
          },
        },
        {
          label: 'Agree, and send the letter to the Casa',
          detail: 'A conspiracy against the Crown, in his own hand, with his signature on it.',
          resolve: (gg) => {
            move(gg, -1, `Sent ${gg.rival.name}'s own letter to the Casa and ruined him with it.`);
            gg.crown.standing += 45;
            gg.rival.ruined = true;
            gg.rival.eclipsed = true;
            return 'It is very effective. He is recalled, examined, and never given another ship. '
              + 'You have the coast to yourself and the Casa has a paper in its files with your '
              + 'name at the bottom of it as the man who brought it in.';
          },
        },
      ],
    }),
  },
];

/**
 * How the rivalry ends, read off what actually passed between you.
 *
 * Four endings, and which one you get is the sum of every choice above rather
 * than a final decision at the end — the point being that you cannot plan for
 * the ending you want in the last scene, only in all the ones before it.
 */
export function rivalEnding(g: Game): { title: string; text: string } {
  const r = g.rival;
  const regard = r.regard ?? 0;
  const ahead = g.crown.lifetimeStanding > r.standing;

  if (r.ruined) {
    return {
      title: 'The man you ruined',
      text: `${r.name} lives in Lagos on a small pension and is occasionally consulted about `
        + 'currents. He does not receive visitors from the sea. Everything he found is on the '
        + 'padrão real under other men’s names, several of them yours, and there is nobody '
        + 'left alive who can say from experience whether what you did to him was necessary.',
    };
  }
  if (r.compact && regard > 0.5) {
    return {
      title: 'The two of us',
      text: `You and ${r.name} between you put four thousand miles of coast on the chart and `
        + 'neither of you ever admitted in writing how much of it came from the other. The Casa '
        + 'suspected the whole time and could never prove it. He named a bay after you, without '
        + 'explanation, and you have never told anybody why it is there.',
    };
  }
  if (regard > 0.3) {
    return {
      title: 'The other man',
      text: `You were the two best pilots of your generation and you spent twenty years half an `
        + `ocean apart. ${r.name} outlived you by six years and spoke at the memorial, briefly, `
        + 'and said that the only man who had ever understood the problem was in the ground and '
        + 'that he had nothing further to add.',
    };
  }
  if (regard < -0.5) {
    return {
      title: 'Enemies to the end',
      text: `Neither of you ever gave the other anything. ${r.name} is still alive and still `
        + `sailing${ahead ? ', and has never caught you' : ' and has long since passed you'}. `
        + 'When his name comes up you change the subject, and the people who know you both have '
        + 'learned not to raise it.',
    };
  }
  return {
    title: 'The other caravel',
    text: `You and ${r.name} sailed the same ocean for twenty years and met four times. `
      + `${ahead ? 'You are the better remembered' : 'He is the better remembered'}, by a margin `
      + 'that has more to do with who came home than with who was the better seaman, and both of '
      + 'you knew it.',
  };
}

/** The next meeting that is due, if any. */
export function rollRivalMeeting(g: Game, days: number): SeaEvent | null {
  if (g.dockedAt || g.rival.eclipsed) return null;
  // Rare on purpose: four of these in a career, not four in a passage.
  if (!g.rng.chance(days / 9)) return null;
  const seen = g.rival.metEvents ?? [];
  for (const m of MEETINGS) {
    if (seen.includes(m.id)) continue;
    if (!m.when(g)) continue;
    g.rival.metEvents = [...seen, m.id];
    return m.build(g);
  }
  return null;
}
