import { clamp } from '../core/math';
import type { Officer } from '../crew/crew';
import type { SeaChoice, SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';
import { monsoonGrip } from '../navigation/monsoon';
import { regard } from './arcKit';

/**
 * Two of the company, at odds, and the captain between them.
 *
 * Counsel (`game/counsel.ts`) puts each man's opinion to the captain before he
 * decides. These are the cases where two of them do not merely differ but are
 * arguing with each other, in front of him, about something each of them owns:
 * the chaplain and the interpreter over a baptism, the pilot and the master over
 * the weather, the clerk and the degredado over a false weight, the surgeon and
 * the boatswain over the sick at the pumps, the chaplain and the clerk over a
 * parcel, the Swahili pilot and the master over a dhow.
 *
 * Each is played once in a career. Backing one man costs you the other's regard
 * (his approval moves with it) and writes whatever the Ledger would write for
 * the act; the third way, where there is one, costs money or time and offends
 * nobody much.
 */

interface Sides { a: Officer; b: Officer }

interface Conflict {
  id: string;
  /** Who argues. Both must be aboard. */
  pick: (g: Game, aboard: Officer[]) => Sides | null;
  when: (g: Game, s: Sides) => boolean;
  build: (g: Game, s: Sides) => SeaEvent;
}

const aboard = (g: Game): Officer[] => g.crew.officers.filter((o) => o.alive && !o.ashoreAt);
const byRole = (xs: Officer[], role: Officer['role'], not?: Officer): Officer | undefined =>
  xs.find((o) => o.role === role && o !== not && o.arc !== 'hamisi') ?? xs.find((o) => o.role === role && o !== not);

const choice = (label: string, detail: string, resolve: SeaChoice['resolve']): SeaChoice => ({ label, detail, resolve });

export const CONFLICTS: Conflict[] = [
  // ----------------------------------------------- the chaplain and the interpreter
  {
    id: 'baptism',
    pick: (_g, xs) => {
      const a = byRole(xs, 'capelao');
      const b = xs.find((o) => o.role === 'lingua') ?? xs.find((o) => o.role === 'degredado' && o.languages.length > 0);
      return a && b ? { a, b } : null;
    },
    when: (g) => g.relationsMetCount() > 0 && g.sounding.shoreDistNm < 40 && g.daysSincePort > 6,
    build: (g, { a, b }) => {
      const refuses = a.arc === 'anselmo';
      const where = g.dockedAt ?? 'the coast';
      return {
        id: 'conflict:baptism',
        title: `${a.name} and ${b.name}`,
        severity: 'warning',
        text: refuses
          ? `A headman's household came off to the ship in two canoes this morning, with a gift, and the headman has asked through ${b.name} to be baptised in the ship's God as a mark of friendship. `
            + `${a.name} will not. "He does not know what he is asking, sir. I will not put the water on a man who thinks it is a handshake." `
            + `${b.name}: "It is a handshake, Father. It is the only one he has got. If you refuse it he will understand he has been insulted, and the next ship will find the beach empty."`
          : `A headman's household came off to the ship this morning, his eldest wife sick and a boy of seven staring at the cross on ${a.name}'s breast. The headman said a sentence which the chaplain understood as a wish to be baptised. `
            + `${a.name}: "He asked for the water, sir. I heard him." `
            + `${b.name}: "He said he would take whatever the ship's God took if it would cure the child. It is not the same, and I will not be the mouth that says it is."`,
        choices: [
          choice(
            refuses ? 'Baptise them: it is the handshake' : 'Back the chaplain: baptise them',
            refuses ? 'The headman is pleased. The chaplain has been overruled on the one thing he will not do.' : 'The chaplain has his font. The interpreter has been told his work is to carry, not to doubt.',
            (gg) => {
              if (refuses) {
                regard(a, -0.22, 'was overruled on baptising a man who thought it was a handshake');
                regard(b, 0.12, 'was backed over a headman’s baptism');
              } else {
                regard(a, 0.12, 'was backed over the baptism of a headman’s household');
                regard(b, -0.15, 'was told his work was to carry words and not to doubt them');
              }
              gg.noteDeed('faith.pressed', { target: where, magnitude: 0.6, note: `Had a headman's household baptised at ${where}, with the interpreter saying he did not understand it.` });
              return refuses
                ? `${a.name} does it, because he is ordered to, and says the words as if each one were a stone he were setting down. The headman is delighted. Nobody asks ${a.name} what he thinks.`
                : 'The water is poured. The boy cries, which the chaplain takes for a sign. The headman is courteous and the interpreter is silent for three days.';
            },
          ),
          choice(
            refuses ? 'Back the chaplain: decline, and give them a gift' : 'Back the interpreter: not until he understands',
            refuses ? 'No font. A gift in its place, and the interpreter’s warning to heed.' : 'No font today. The headman is told what it is, plainly, and may ask again.',
            (gg) => {
              if (refuses) {
                regard(a, 0.15, 'was backed in refusing to baptise a man who did not understand');
                regard(b, -0.1, 'was overruled on the headman’s baptism');
                gg.crown.gold = Math.max(0, gg.crown.gold - 25);
              } else {
                regard(b, 0.15, 'was backed over what the headman had actually said');
                regard(a, -0.12, 'was told to wait on a baptism he had heard asked for');
              }
              gg.noteDeed('faith.respected', { target: where, magnitude: 0.6, note: `Declined to baptise a headman's household until it understood what was being asked.` });
              return refuses
                ? 'A bolt of cloth and a looking glass, in the place of a font. The headman receives both with great gravity and the interpreter softens it in the telling.'
                : `${b.name} explains it, at length and with none of the usual tact. The headman listens, and says he will think. The chaplain says the office alone on deck that night.`;
            },
          ),
          choice(
            'Have the interpreter tell the headman plainly what it is, and let him choose',
            'Both have been heard. Neither is wholly satisfied. Nobody is insulted.',
            (gg) => {
              regard(a, 0.04, 'was asked to wait while the headman was told plainly what he asked for');
              regard(b, 0.05, 'was asked to tell a headman plainly what the font was');
              gg.noteDeed('faith.respected', { target: where, magnitude: 0.4, note: 'Had the headman told plainly what baptism was, and left the choice to him.' });
              return 'It takes the whole of a forenoon. The headman declines the water and accepts the explanation, and asks, as a favour, that the chaplain pray for the sick wife in his own way. The chaplain, to his credit, does.';
            },
          ),
        ],
      };
    },
  },

  // ------------------------------------------------ the pilot and the master
  {
    id: 'weather',
    pick: (_g, xs) => {
      const a = byRole(xs, 'piloto');
      const b = byRole(xs, 'mestre');
      return a && b ? { a, b } : null;
    },
    when: (g) => g.daysSincePort > 5 && g.weatherNow.wind.speed > 14 && g.sounding.shoreDistNm > 25,
    build: (g, { a, b }) => {
      const pilotRight = g.weatherNow.wind.speed >= 22 || g.ship.condition.hull < 0.65;
      return {
        id: 'conflict:weather',
        title: `${a.name} and ${b.name} on the weather`,
        severity: 'warning',
        text: `${a.name} has been looking at the sky since the forenoon and does not like the colour of the western edge of it, the long swell, or the way the birds are going home. `
          + `"Heave her to, sir. I have seen this sky twice and both times the front came through at night." `
          + `${b.name}: "We have a fair wind and a clean bottom, and the men are working her well. Every hour we lie hove-to is an hour somebody else is making. I have seen skies like this and nothing came of them either."`,
        choices: [
          choice('Heave to, as the pilot says', 'A day lost, and the hands rested. If he is wrong it is a day lost for nothing.', (gg) => {
            gg.clock.t += 14 * 3600;
            gg.crew.fatigue = clamp(gg.crew.fatigue - 0.05, 0, 1);
            regard(a, pilotRight ? 0.14 : 0.06, pilotRight ? 'was backed on the weather, and the front came' : 'was backed on the weather, and it was a day lost');
            regard(b, pilotRight ? -0.08 : -0.12, 'was overruled on the weather');
            return pilotRight
              ? `The front came through a little after midnight, and she rode it hove-to with the lamps lit and nobody on deck who did not have to be. ${b.name} comes aft in the morning and says, to nobody, that it was a well-judged day.`
              : `Nothing came. ${b.name} loses an afternoon and says so, civilly, and ${a.name} says that a front that does not come is the best kind.`;
          }),
          choice('Carry sail, as the master says', 'The passage made. If he is wrong it is the ship that pays.', (gg) => {
            regard(b, pilotRight ? 0.06 : 0.14, pilotRight ? 'carried sail against the pilot and was lucky' : 'was backed on the weather, and nothing came');
            regard(a, pilotRight ? -0.16 : -0.08, 'was overruled on the weather');
            if (pilotRight) {
              gg.ship.condition.hull = clamp(gg.ship.condition.hull - 0.05, 0, 1);
              gg.crew.fatigue = clamp(gg.crew.fatigue + 0.1, 0, 1);
              gg.crew.unrest = clamp(gg.crew.unrest + 0.05, 0, 2);
              return `The front caught her under full canvas at two in the morning and cost her a topsail, a boat and some part of the hands’ regard. ${a.name} does not say anything. He has the look of a man whose silence is a full account.`;
            }
            gg.crew.morale = clamp(gg.crew.morale + 0.02, 0, 1);
            return `Nothing came, and she made a fine day's run for it. ${b.name} does not gloat, which is to his credit, and ${a.name} makes a note in his book of how the sky looked, for next time.`;
          }),
          choice('Shorten down and hold on: a little of both', 'Neither is wholly satisfied. The ship is safe, and slower.', (gg) => {
            regard(a, 0.04, 'had half his way on the weather');
            regard(b, 0.04, 'had half his way on the weather');
            gg.crew.fatigue = clamp(gg.crew.fatigue + 0.02, 0, 1);
            return 'She goes on under reefed topsails, and both of them are a little right and a little wrong, which is exactly what a compromise at sea is.';
          }),
        ],
      };
    },
  },

  // ----------------------------------------------- the clerk and the degredado
  {
    id: 'weights',
    pick: (_g, xs) => {
      const a = byRole(xs, 'escrivao');
      const b = xs.find((o) => o.arc === 'gaspar') ?? xs.find((o) => o.role === 'lingua') ?? xs.find((o) => o.role === 'degredado');
      return a && b ? { a, b } : null;
    },
    when: (g) => g.visitedPorts.size >= 3 && g.daysSincePort > 4,
    build: (_g, { a, b }) => ({
      id: 'conflict:weights',
      title: `${a.name} and ${b.name}`,
      severity: 'note',
      text: `${a.name} has found a false weight in the last day's lading: a factor's beam that read heavy in the factor's favour by two ounces in twelve, and he has it on a sheet with the figures in two columns. `
        + `"It is a false count, sir, and the Casa will hold me to it." `
        + `${b.name}: "It is the custom of the place, and it is nobody's quarrel but the town's. The man is a fool and a thief and he is also the one who fed me for a month. If you make a noise about it the town will remember who made it, and so will the next ship that puts in."`,
      choices: [
        choice('Back the clerk: reweigh it and bring the difference to book', 'The book is true. The factor, and the town, will remember the correction.', (gg) => {
          gg.crown.gold = Math.max(0, gg.crown.gold - 30);
          regard(a, 0.15, 'was backed over the false weight');
          regard(b, -0.12, 'was overruled when he asked that a false weight be let alone');
          gg.noteDeed('weights.fair', { target: 'the factor', magnitude: 0.6, note: 'Had a false weight brought to book and made good out of the ship’s account.' });
          return `Thirty cruzados of difference, in your disfavour, entered in a hand so neat it looks like a verdict. ${b.name} says nothing about it for the rest of the week, and then, quietly, that it was the right thing and he hopes the town agrees.`;
        }),
        choice(`Back ${b.name}: let it stand`, 'Forty cruzados to the good, a peaceful quay, and a clerk who has noticed.', (gg) => {
          gg.crown.gold += 40;
          regard(b, 0.12, 'was backed in letting a false weight stand');
          regard(a, -0.2, 'was overruled on the false weight, and told to enter the weight that was read');
          gg.noteDeed('weights.false', { target: 'the factor', magnitude: 0.5, note: 'Let a false weight stand because it ran your way and the town would not have liked it said.' });
          return `${a.name} enters the weight that was read, in the proper column, and in the margin, in a hand so small it might be a flaw in the paper, the weight that was true.`;
        }),
        choice('Pay the difference out of your own purse, and say nothing to either', 'Fifty cruzados to buy peace with both, and nobody’s principle settled.', (gg) => {
          gg.crown.gold = Math.max(0, gg.crown.gold - 50);
          regard(a, 0.05, 'had the false weight made good out of the captain’s own purse');
          regard(b, 0.05, 'was spared a quarrel with the town');
          gg.noteDeed('weights.fair', { target: 'the factor', magnitude: 0.3, note: 'Made good a false weight out of your own purse and said nothing to the factor.' });
          return `The book is true and the town is undisturbed, and the only man who knows what it cost is you. ${a.name} and ${b.name} each think they know why you did it, and they are not the same reason.`;
        }),
      ],
    }),
  },

  // ----------------------------------------------- the surgeon and the boatswain
  {
    id: 'pumps',
    pick: (_g, xs) => {
      const a = byRole(xs, 'cirurgiao');
      const b = byRole(xs, 'contramestre');
      return a && b ? { a, b } : null;
    },
    when: (g) => (g.crew.sickness > 0.08 || g.crew.scurvy > 0.15) && g.ship.condition.leak > 0.05,
    build: (_g, { a, b }) => ({
      id: 'conflict:pumps',
      title: `${a.name} and ${b.name}`,
      severity: 'warning',
      text: `She is making more water than the watch can clear, and there are not enough hands fit to put on the brakes. ${b.name} wants the sick who can walk put to the pump. `
        + `"They are not dead, sir, and the ship will be." `
        + `${a.name}: "Three of them will not stand a watch of it and the fourth will go over the side. They are not idle, boatswain, they are ill, and I am the one who has to write down which."`,
      choices: [
        choice('Back the surgeon: the sick are to rest', 'The ship takes more water. The men live.', (gg) => {
          gg.ship.condition.hull = clamp(gg.ship.condition.hull - 0.02, 0, 1);
          gg.crew.sickness = clamp(gg.crew.sickness - 0.02, 0, 1);
          regard(a, 0.15, 'was backed over the sick at the pumps');
          regard(b, -0.12, 'was told the sick were not to be put to the pumps');
          gg.noteDeed('mercy.shown', { target: 'the sick', magnitude: 0.5, note: 'Kept the sick from the pumps against the boatswain, and let the ship take the water.' });
          return `The ship takes it on the chin, and the fit men take double watches. ${b.name} says what he thinks of this, once, to the pump-brake and not to you.`;
        }),
        choice('Back the boatswain: the walking sick to the pumps', 'The pumps clear. It will cost somebody, and the surgeon will know who.', (gg) => {
          gg.ship.condition.leak = Math.max(0, gg.ship.condition.leak - 0.03);
          gg.crew.sickness = clamp(gg.crew.sickness + 0.03, 0, 1);
          gg.crew.morale = clamp(gg.crew.morale - 0.03, 0, 1);
          gg.crew.count = Math.max(1, gg.crew.count - 1);
          gg.crew.deaths += 1;
          regard(b, 0.14, 'was backed over the sick at the pumps');
          regard(a, -0.2, 'was overruled and lost a man at the pumps');
          gg.noteDeed('hand.died', { target: 'the pumps', magnitude: 1, note: 'A sick man put to the pump-brake died at it, on the boatswain’s word and yours.' });
          return `She is dry by dawn. One of the four goes over the side, at the end of the first watch, with the brake still in his hands. ${a.name} writes it down in his own hand, exactly as it was.`;
        }),
        choice('Light duty for the sick, double watches for the fit', 'A middle way. Costs rest, and the fit men’s temper.', (gg) => {
          gg.crew.fatigue = clamp(gg.crew.fatigue + 0.05, 0, 1);
          gg.crew.morale = clamp(gg.crew.morale - 0.01, 0, 1);
          regard(a, 0.04, 'was given half of what he asked for the sick');
          regard(b, 0.04, 'was given half of what he asked for the pumps');
          return 'It works well enough, and nobody is pleased, which is generally the mark of a decision at sea that was right.';
        }),
      ],
    }),
  },

  // ----------------------------------------------- the chaplain and the clerk
  {
    id: 'parcel',
    pick: (_g, xs) => {
      const a = byRole(xs, 'capelao');
      const b = byRole(xs, 'escrivao');
      return a && b ? { a, b } : null;
    },
    when: (g) => g.visitedPorts.size >= 4 && g.daysSincePort > 3 && g.chronicle.act >= 2,
    build: (_g, { a, b }) => ({
      id: 'conflict:parcel',
      title: `${a.name} and ${b.name} on the parcel`,
      severity: 'warning',
      text: 'A factor’s man left a parcel aboard at the last quay with a letter and a seal, to be carried to a House: a chest, and in the chest-room two people who are not on the muster, a woman and a boy, with the factor’s mark on their wrists. '
        + `${b.name}: "It is a parcel, sir, and a declared parcel is a parcel. Enter it, pay the King's share, and nobody is in any trouble. It is the only way it can be done that I can sign." `
        + `${a.name}: "They are not a parcel, sir. They are a woman and a boy. I will not see them entered as freight in the same book as the pepper."`,
      choices: [
        choice('Back the clerk: enter it and pay the King’s share', 'Everything is in the book. It remains a woman and a boy.', (gg) => {
          gg.crown.gold = Math.max(0, gg.crown.gold - 40);
          regard(b, 0.15, 'was backed in entering the parcel and paying the King’s share');
          regard(a, -0.25, 'was overruled when he said a woman and a boy were not freight');
          gg.noteDeed('parcel.redeemed', { target: 'portugal', magnitude: 0.6, note: 'Entered the factor’s parcel and paid the King’s share on it.' });
          return `${b.name} writes it as it is, in the proper column, with the proper figures. ${a.name} comes to the entry and looks at it for a time, and then goes below to find the boy something to eat.`;
        }),
        choice('Back the chaplain: put them ashore at the next port, and enter the parcel as refused', 'The book is true and the people are not carried. The factor will ask why.', (gg) => {
          regard(a, 0.18, 'was backed in refusing to carry a woman and a boy as freight');
          regard(b, -0.05, 'was overruled on carrying the parcel, though it was entered as refused');
          gg.noteDeed('parcel.refused', { target: 'the factor', magnitude: 0.6, note: 'Refused the factor’s parcel and had it entered as refused.' });
          return `${b.name} enters it as refused, with the date and the seal, and says that this is a correct form. ${a.name} says the office for them that evening in the waist, and the woman, who cannot understand it, listens.`;
        }),
        choice('Carry it, and ask nothing', 'Quick, quiet, and a favour owed to a man of standing. Neither of them will forget it.', (gg) => {
          regard(a, -0.2, 'let a woman and a boy go unentered in the hold');
          regard(b, -0.12, 'carried a parcel unwritten and made him a party to it');
          gg.noteDeed('parcel.carried', { target: 'the factor', magnitude: 0.6, note: 'Carried the factor’s parcel unwritten, and asked nothing.' });
          return `It is done as the factor’s man hoped. ${b.name} does not enter it; ${a.name} does not speak of it; and the woman and the boy go down the side at the other end, which is the last you hear.`;
        }),
      ],
    }),
  },

  // ----------------------------------------------- the Swahili pilot and the master
  {
    id: 'dhow',
    pick: (_g, xs) => {
      const a = xs.find((o) => o.arc === 'hamisi');
      const b = byRole(xs, 'mestre');
      return a && b ? { a, b } : null;
    },
    when: (g) => monsoonGrip(g.ship.state.pos) > 0.3 && g.sounding.shoreDistNm > 4 && g.chronicle.act >= 3,
    build: (_g, { a, b }) => ({
      id: 'conflict:dhow',
      title: `${a.name} and ${b.name} on the dhow`,
      severity: 'warning',
      text: 'A dhow, low in the water, her mat sail the colour of old wood, is standing across the lane from Cambay under a light wind. '
        + `${b.name}, who has counted: "She is riding deep, sir, she is a Moor's, and she has no pass of ours. The Crown's order on ships of her kind is plain." `
        + `${a.name} has already named her: a boat of Melinde, with an owner he knows by his mother's brother. "She is carrying cloth and some dates, sir, and a woman going to a wedding. I have conned ships for twenty years and I have never put one onto a dhow I could name. I would be obliged if you would not ask me to begin."`,
      choices: [
        choice('Let her pass', 'A ship of his coast goes by. The master thinks it soft; the pilot has been told what kind of ship this is.', (gg) => {
          regard(a, 0.22, 'let a Melinde dhow pass when the master wanted her stopped');
          regard(b, -0.1, 'was overruled on stopping a dhow');
          gg.noteDeed('ship.spared', { target: 'nation:swahili', magnitude: 0.6, note: 'Let a Melinde dhow pass, against the master’s advice, because the pilot knew her owner.' });
          return `She goes by with her mat sail drawing and a man at the rail lifting one hand to ${a.name}, who lifts one back. ${b.name} writes the encounter in the log in the proper form and adds nothing.`;
        }),
        choice('Heave to and search her', 'The Crown’s order, and a prize. The pilot will conn the ship alongside, or he will not.', (gg) => {
          gg.crown.gold += 60;
          gg.crown.standing += 1;
          regard(a, -0.35, 'conned the ship onto a dhow he could name');
          regard(b, 0.1, 'was backed on stopping a dhow');
          gg.noteDeed('ship.stopped', { target: 'nation:swahili', magnitude: 0.6, note: 'Hove to and searched a Melinde dhow, with the Melinde pilot at the helm.' });
          return `The boats go over and come back with sixty cruzados of cloth and a woman in tears. ${a.name} conned the ship alongside, as ordered, perfectly, and has not spoken since. It is the best piece of pilotage he has ever done, and he will not forgive it.`;
        }),
        choice('Hail her, and ask what she carries and where she is bound', 'No search, and no promise. It is what a courteous ship does.', (gg) => {
          regard(a, 0.1, 'hailed a Melinde dhow and asked what she carried and let her go on');
          regard(b, -0.05, 'was told to hail and not to search');
          gg.noteDeed('ship.spared', { target: 'nation:swahili', magnitude: 0.3, note: 'Hailed a Melinde dhow, asked what she carried, and let her go on.' });
          return `She answers, in Arabic and then Swahili, that she carries cloth and dates, and the master of her thanks God for the wind. ${a.name} translates all of it without being asked, and some of it is not in the dialogue.`;
        }),
      ],
    }),
  },
];

/**
 * A conflict, if one is ripe. Once each in a career, and rare: a captain asked
 * to arbitrate every week is running a court, not a ship.
 */
export function rollConflict(g: Game, days: number): SeaEvent | null {
  if (days <= 0 || g.dockedAt || g.campaign === 'xiyang') return null;
  const xs = aboard(g);
  if (xs.length < 2) return null;
  for (const c of CONFLICTS) {
    if (g.company.seen.includes(c.id)) continue;
    const sides = c.pick(g, xs);
    if (!sides || !c.when(g, sides)) continue;
    if (!g.rng.chance(days / 16)) continue;
    g.company.seen.push(c.id);
    return c.build(g, sides);
  }
  return null;
}
