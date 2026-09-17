import { NM, clamp, haversine } from '../core/math';
import { portDef } from '../world/ports';
import type { Game } from './state';
import type { SeaEvent } from './seaEvents';
import { TEMPERS, consortReport, signalRangeNm, type Consort } from './consort';

/**
 * What having a second ship actually puts in front of the captain.
 *
 * The consort is only worth having in the game if she asks questions the player
 * would not otherwise be asked, and the questions have to be the real ones. A
 * commodore's decisions are almost all the same decision in different weather:
 * *how much of my own voyage am I prepared to spend on her?* Standing by a
 * damaged consort costs days. Casting her off costs a ship, her people, and
 * whatever the Casa thinks of a man who came home alone. There is no answer
 * that is free, which is the only kind of choice worth writing.
 */

/** She has fallen out of signalling distance and the light is going. */
export function losingHerScene(g: Game, c: Consort): SeaEvent {
  const rep = consortReport(g, c);
  return {
    id: 'consort:losing',
    title: `${c.name} is dropping astern`,
    severity: 'warning',
    text: `She is ${rep.distNm.toFixed(0)} miles off and losing ground, and the signal `
      + `will not carry much longer. ${c.captain} has his topsails set and is doing what he `
      + `can with a ${c.condition < 0.6 ? 'ship that is hurt' : 'slower ship'}.\n\n`
      + 'You can shorten sail and let her come up, which costs you the day\'s run and every '
      + 'day\'s run after it while the wind holds. Or you can stand on, and find out whether '
      + 'she can follow a light.',
    choices: [
      {
        label: 'Shorten sail and let her come up',
        detail: 'Lose the ground. Keep the fleet.',
        resolve: (gg) => {
          const cc = gg.consort!;
          gg.setCanvas(Math.min(gg.ship.canvasSet, 0.45));
          cc.regard = clamp(cc.regard + 0.09, 0, 1);
          cc.pos = { ...gg.ship.state.pos };
          cc.lost = false;
          cc.missingSince = undefined;
          gg.clock.t += 7 * 3600;
          gg.crew.fatigue = clamp(gg.crew.fatigue - 0.02, 0, 1);
          return `Took in the courses and lay to for the best part of a watch until she came `
            + `up under our lee. ${cc.captain} came to the rail and said nothing about it, `
            + 'which from him is thanks. The day\'s run is gone and the fleet is still a fleet.';
        },
      },
      {
        label: 'Make a light and stand on',
        detail: 'Keep the wind. She follows if she can.',
        resolve: (gg) => {
          const cc = gg.consort!;
          cc.regard = clamp(cc.regard - 0.14, 0, 1);
          // Whether she holds on is his seamanship against the night.
          const holds = gg.rng.chance(0.3 + TEMPERS[cc.temper].skill * 0.55 + cc.regard * 0.15);
          if (holds) {
            return 'Hung a lantern in the maintop and stood on. She was still astern of us at '
              + `daylight, further off than she was, and ${cc.captain} has not made a signal `
              + 'about it. He will remember that he was not waited for.';
          }
          cc.lost = true;
          cc.missingSince = gg.clock.t;
          gg.logEvent('peril',
            `Lost sight of ${cc.name} in the night. She was three leagues astern at dusk and `
            + 'there was nothing on the horizon at first light.', true);
          return `Stood on. At the middle watch the light astern was not there any more, and at `
            + `daylight there was nothing in the whole round of the sea. ${cc.name} is `
            + 'somewhere, and the somewhere is a day\'s sail wide.';
        },
      },
    ],
  };
}

/** She has taken damage and cannot keep up. The commodore's decision proper. */
export function herDamageScene(_g: Game, c: Consort): SeaEvent {
  const daysHome = Math.round(haversine(c.pos, { lat: 38.7, lon: -9.2 }) / NM / 90);
  return {
    id: 'consort:hurt',
    title: `${c.name} signals distress`,
    severity: 'grave',
    text: `She has been making water since the blow and ${c.captain} reports the pumps will `
      + 'not hold her if it comes on again. She has her people aboard and a share of the '
      + `lading, and she is ${daysHome > 0 ? `some ${daysHome} weeks from Lisbon` : 'a long way from anywhere'}.\n\n`
      + 'What is done about her is what the Casa will ask about first, whatever else the '
      + 'voyage achieves.',
    choices: [
      {
        label: 'Heave to and put carpenters aboard',
        detail: 'Three days. Both ships stopped. She may swim.',
        resolve: (gg) => {
          const cc = gg.consort!;
          gg.clock.t += 3 * 86400;
          gg.crew.fatigue = clamp(gg.crew.fatigue + 0.12, 0, 1);
          cc.condition = clamp(cc.condition + 0.3, 0, 1);
          cc.regard = clamp(cc.regard + 0.2, 0, 1);
          gg.crown.standing += 6;
          gg.logEvent('crew',
            `Lay by ${cc.name} three days with the carpenters aboard her, fothered a sail `
            + 'under her bilge and got the worst of it stopped.', true);
          return `Three days hove to with both ships' carpenters in her hold. They got a sail `
            + `under her and the leak is down to what one pump will hold. ${cc.captain} came `
            + 'aboard afterwards and said, in front of both companies, that he would not have '
            + 'done the same for a man who had not done it for him.';
        },
      },
      {
        label: 'Take out her people and burn her',
        detail: 'Her crew live. Her lading does not.',
        resolve: (gg) => {
          const cc = gg.consort!;
          const took = Math.min(cc.crew, gg.ship.hull.crewFull - gg.crew.count + 6);
          gg.clock.t += 1.5 * 86400;
          gg.crew.count += took;
          gg.crew.provisions.water = Math.max(4, gg.crew.provisions.water - took * 0.8);
          gg.crew.unrest = clamp(gg.crew.unrest + 0.1, 0, 2);
          gg.consort = null;
          gg.consortRecord.burned += 1;
          gg.logEvent('peril',
            `Took ${took} men out of ${cc.name} and fired her. She burned to the waterline in `
            + 'sight of both companies and went down by the head about midnight.', true);
          return `Everything that could be got out of her was got out, and the rest went with `
            + `her. She burned all evening and the men watched it without being told to. There `
            + `are ${took} more mouths aboard and the water will not last what it was going to.`;
        },
      },
      {
        label: 'Send her home while she can still swim',
        detail: 'She carries the cargo to Lisbon. You go on alone.',
        resolve: (gg) => {
          const cc = gg.consort!;
          cc.station = 'detached';
          cc.boundFor = 'lisboa';
          cc.dueBack = gg.clock.t + 120 * 86400;
          cc.regard = clamp(cc.regard + 0.05, 0, 1);
          gg.consortRecord.detached += 1;
          gg.logEvent('note',
            `Detached ${cc.name} for Lisbon with what she could carry. She is out of the `
            + 'voyage and out of our hands.', true);
          return `Put what would not survive the rest of the voyage into her and sent her north `
            + `with the flood. ${cc.captain} asked once whether you were sure and then did not `
            + 'ask again. From here the voyage is one ship, which is how most of them are.';
        },
      },
      {
        label: 'Tell him to keep his station',
        detail: 'She is a ship of the King\'s. She can be pumped.',
        resolve: (gg) => {
          const cc = gg.consort!;
          cc.regard = clamp(cc.regard - 0.3, 0, 1);
          cc.condition = clamp(cc.condition - 0.05, 0, 1);
          gg.crown.standing = Math.max(0, gg.crown.standing - 4);
          return `Signalled him to keep his station and hauled our wind. He acknowledged it. `
            + 'The acknowledgement took a long time coming and there is no doubt at all that '
            + 'both companies watched it being made.';
        },
      },
    ],
  };
}

/** Her captain has done something you did not order. */
export function wilfulScene(_g: Game, c: Consort): SeaEvent {
  const t = TEMPERS[c.temper];
  const bold = c.temper === 'bold' || c.temper === 'rival';
  return {
    id: 'consort:wilful',
    title: bold ? `${c.name} has made sail` : `${c.name} has hauled off`,
    severity: 'note',
    text: bold
      ? `${c.captain} has set everything she will carry and is standing away to the southward, `
        + 'well beyond the station he was given. He is not answering the signal, which from him '
        + `is an answer. ${t.line}\n\nWhat he finds down there he finds first.`
      : `${c.captain} has hauled off the land and is falling astern rather than stand in with `
        + `you. ${t.line}\n\nHe is not wrong about the water. He is simply not doing what he `
        + 'was told.',
    choices: [
      {
        label: 'Recall him, and say so plainly',
        detail: 'A gun, and a signal he cannot pretend not to see.',
        resolve: (gg) => {
          const cc = gg.consort!;
          cc.regard = clamp(cc.regard - 0.12, 0, 1);
          cc.station = 'company';
          cc.pos = { ...gg.ship.state.pos };
          return `Fired a gun to leeward and made his number until he answered it. He came back `
            + 'into station without a word and has kept it exactly, to the yard, ever since, in '
            + 'the way a man does when he wants you to notice that he is obeying you.';
        },
      },
      {
        label: 'Let him run',
        detail: 'He may be right. He may not come back.',
        resolve: (gg) => {
          const cc = gg.consort!;
          cc.regard = clamp(cc.regard + 0.14, 0, 1);
          cc.station = 'scout';
          cc.offingNm = Math.max(cc.offingNm, 14);
          if (bold && gg.rng.chance(0.45)) {
            gg.chartedThisPassage += 40;
            gg.crown.chartedSincePatent += 40;
            gg.crown.standing += 8;
            return `Let him go. He was back on the fourth day with sixty miles of coast on a `
              + 'sheet of paper and the names of two rivers, and the whole of it went into the '
              + 'roteiro under his name and yours. He is insufferable and he was right.';
          }
          return `Let him go. He has the horizon to himself and will be back when he is back, `
            + 'or he will not.';
        },
      },
    ],
  };
}

/** She has been out of sight long enough that it is a question. */
export function searchScene(g: Game, c: Consort): SeaEvent {
  const days = ((g.clock.t - (c.missingSince ?? g.clock.t)) / 86400).toFixed(0);
  return {
    id: 'consort:search',
    title: `${c.name} has not been seen in ${days} days`,
    severity: 'warning',
    text: `Nothing on the horizon since the weather cleared. The standing orders for a fleet `
      + 'that parts company are to make the next rendezvous and wait, and the next rendezvous '
      + 'is a long way down a coast neither of you has a chart for.\n\n'
      + 'Searching costs days you do not have. Not searching means she was on her own from the '
      + 'moment the light went.',
    choices: [
      {
        label: 'Beat back over the ground and look for her',
        detail: 'Three or four days, and the wind is where it is.',
        resolve: (gg) => {
          const cc = gg.consort!;
          gg.clock.t += 3.5 * 86400;
          gg.crew.fatigue = clamp(gg.crew.fatigue + 0.1, 0, 1);
          const found = gg.rng.chance(0.55 + TEMPERS[cc.temper].skill * 0.2);
          if (found) {
            cc.lost = false;
            cc.missingSince = undefined;
            cc.pos = { ...gg.ship.state.pos };
            cc.regard = clamp(cc.regard + 0.25, 0, 1);
            gg.crown.standing += 5;
            return `Beat back three days over our own wake and found her at the edge of the `
              + `fourth, hove to under a reefed main and firing a gun every glass. `
              + `${cc.captain} had been doing it since the night she lost us.`;
          }
          return 'Four days beating back over water we had already sailed, with a man at every '
            + 'masthead, and nothing. The sea is very large and a ship on it is very small, '
            + 'which every man aboard now understands better than he did.';
        },
      },
      {
        label: 'Make the rendezvous and wait there',
        detail: 'The thing the orders actually say to do.',
        resolve: (gg) => {
          const cc = gg.consort!;
          cc.lost = false;
          cc.missingSince = undefined;
          cc.station = 'company';
          cc.pos = { ...gg.ship.state.pos };
          cc.condition = clamp(cc.condition - 0.08, 0, 1);
          gg.clock.t += 2 * 86400;
          return `Made the rendezvous and lay there two days, and on the second evening she came `
            + `down on us out of the northward with her bowsprit sprung. ${cc.captain} had done `
            + 'exactly what the orders said, which is why fleets have orders.';
        },
      },
      {
        label: 'Write her off and go on',
        detail: 'The voyage is the voyage.',
        resolve: (gg) => {
          const cc = gg.consort!;
          gg.consort = null;
          gg.consortRecord.lost += 1;
          gg.crew.morale = clamp(gg.crew.morale - 0.12, 0, 1);
          gg.crown.standing = Math.max(0, gg.crown.standing - 12);
          gg.logEvent('peril',
            `Gave up ${cc.name} for lost and stood on. ${cc.crew} men and ${cc.captain}.`, true);
          return `Entered her in the book as parted company and not since seen, which is the `
            + `form of words, and stood on. ${cc.crew} men. Nobody aboard has said anything `
            + 'about it and the silence is its own kind of comment.';
        },
      },
    ],
  };
}

/** She is up with you and there is something to be passed between the ships. */
export function alongsideScene(g: Game, c: Consort): SeaEvent {
  const myWater = g.crew.provisions.water;
  return {
    id: 'consort:alongside',
    title: `${c.name} alongside`,
    severity: 'note',
    text: `Both ships hove to within hail and the boats in the water. ${c.captain} has `
      + `${c.water.toFixed(0)} days of water and ${c.crew} men; you have `
      + `${myWater.toFixed(0)} days and ${g.crew.count}.\n\n`
      + 'It is the only chance either of you will have to even things up before the next leg.',
    choices: [
      {
        label: 'Even the water between the ships',
        detail: 'Both ships at the same number of days.',
        resolve: (gg) => {
          const cc = gg.consort!;
          const total = gg.crew.provisions.water * gg.crew.count + cc.water * cc.crew;
          const per = total / Math.max(1, gg.crew.count + cc.crew);
          gg.crew.provisions.water = per;
          cc.water = per;
          cc.regard = clamp(cc.regard + 0.08, 0, 1);
          gg.clock.t += 8 * 3600;
          return `Rolled casks across all afternoon in a swell that did neither ship any good. `
            + `Both companies are on ${per.toFixed(0)} days, which is either enough or it is not, `
            + 'but at least it is the same answer for everybody.';
        },
      },
      {
        label: 'Shift the heavy cargo into her',
        detail: 'She carries it. You sail faster and risk less of it on one bottom.',
        resolve: (gg) => {
          const cc = gg.consort!;
          const shift = Math.min(gg.ship.cargoTons * 0.4, 40);
          cc.cargoTons += shift;
          gg.clock.t += 10 * 3600;
          return `Struck ${shift.toFixed(0)} tons down into her hold. She is deeper and slower `
            + 'and you are neither, and the King\'s pepper is now in two bottoms instead of one, '
            + 'which is the whole reason the Casa sends ships in pairs.';
        },
      },
      {
        label: 'Send him some hands',
        detail: 'She is short-handed. You are not, yet.',
        resolve: (gg) => {
          const cc = gg.consort!;
          const n = Math.min(6, Math.max(0, gg.crew.count - 12));
          if (n <= 0) {
            return 'Counted the watch bill twice and there is nobody to spare. He was told so '
              + 'and took it well enough.';
          }
          gg.crew.count -= n;
          cc.crew += n;
          cc.regard = clamp(cc.regard + 0.16, 0, 1);
          gg.clock.t += 5 * 3600;
          return `Sent ${n} hands across in the longboat. They went without much enthusiasm and `
            + `${cc.captain} had them at work before the boat was back on the chocks.`;
        },
      },
      {
        label: 'Nothing. Fill and stand on',
        detail: 'Every hour hove to is an hour not sailed.',
        resolve: (gg) => {
          gg.clock.t += 2 * 3600;
          return 'Hailed him, asked after his people, told him where you mean to be, and filled '
            + 'away. Two hours, which is what it should cost.';
        },
      },
    ],
  };
}

/** The Crown gives you a second ship, which is the moment the voyage changes shape. */
export function assignedScene(_g: Game, c: Consort): SeaEvent {
  return {
    id: 'consort:assigned',
    title: 'A second ship',
    severity: 'note',
    text: `The Casa has attached ${c.name} to your commission, ${c.hullId === 'nau' ? 'a nau' : 'a caravel'} `
      + `of ${c.crew} men under ${c.captain}. ${TEMPERS[c.temper].line}\n\n`
      + 'You are a commodore from this morning, which means the voyage is no longer only about '
      + 'where your own ship can go. A fleet sails at the pace of the slowest ship in it, and '
      + 'everything that happens to her now happens to you.',
    choices: [
      {
        label: 'Keep her in close company',
        detail: 'Within signal. Slower, and you will not lose her.',
        resolve: (gg) => {
          gg.consort!.station = 'company';
          gg.consort!.offingNm = 1;
          return 'Gave him his station a mile on the quarter and the night signals, and told him '
            + 'that if he loses sight of us he is to make the next headland and lie there.';
        },
      },
      {
        label: 'Let her range ahead',
        detail: 'She finds things first, and she is on her own when she does.',
        resolve: (gg) => {
          gg.consort!.station = 'scout';
          gg.consort!.offingNm = 12;
          return 'Told him to range ahead and to windward and to close every evening. He liked '
            + 'that a great deal more than the other thing you might have said.';
        },
      },
    ],
  };
}

/** Whether a consort should be doing anything about the weather right now. */
export function galeRisk(c: Consort, waveHeight: number, windKnots: number): number {
  // Weather first, and nothing without it.
  //
  // The first version added `(1 - condition) * 0.7` to the exposure, which made
  // being less than perfect a source of risk in its own right: a consort handed
  // over at eighty-two per cent — which is what the Casa gives you — carried an
  // eleven per cent chance a day of taking damage in a flat calm, for ever.
  // Over a four-month voyage that is a certainty several times over, and forty
  // per cent of each one rolled her missing. Censused across twenty-four seeds,
  // three voyages in four ended with her lost and the search card came up four
  // times a voyage, which is not drama, it is a leak.
  //
  // Ships do not come apart in fine weather. What being hurt actually does is
  // make bad weather worse for you, so condition multiplies the exposure
  // instead of creating it, and in anything under a gale the answer is nought.
  const weather = clamp((windKnots - 30) / 22, 0, 1) * 0.75
    + clamp((waveHeight - 4) / 6, 0, 1) * 0.5;
  if (weather <= 0) return 0;
  const frail = 1 + (1 - c.condition) * 1.2;
  return clamp(weather * frail * (1.2 - TEMPERS[c.temper].skill * 0.55), 0, 1);
}

/** The line for the log when she is simply doing her job. */
export function consortWord(g: Game, c: Consort): string {
  const r = consortReport(g, c);
  const range = signalRangeNm(g);
  if (c.station === 'detached') {
    return `${c.name} is detached for ${portDef(c.boundFor ?? 'lisboa').name}.`;
  }
  if (r.distNm > range) {
    return `${c.name} is ${r.distNm.toFixed(0)} miles off, beyond signal.`;
  }
  return `${c.name} keeps her station, ${r.distNm.toFixed(1)} miles on the quarter.`;
}
