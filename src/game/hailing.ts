import { NM, clamp, haversine } from '../core/math';
import { shiftAll } from '../crew/hands';
import { hullClass } from '../ship/hull';
import { NATION_NAME, NATION_PEOPLE, type Stranger } from './encounter';
import type { SeaEvent, SeaChoice } from './seaEvents';
import type { Game } from './state';

/**
 * What is said when the two ships are close enough to hear each other.
 *
 * A hail at sea in this period is a shouted conversation between two decks
 * fifty yards apart with the sails shaking, and almost all of it is one of four
 * questions: who are you, where are you from, where is the water, and what is
 * the news. What makes it a decision rather than a cutscene is that the answer
 * to "who are you" changes what the other three are worth, and that a captain
 * with a royal commission in his pocket has a duty about some of the answers
 * that he may not want to carry out.
 *
 * The rule these are written to: nothing here is free and nothing here is
 * obligatory. Every choice costs something the player can feel — days, water,
 * men, standing, the regard of the office in Lisbon, the regard of the men
 * forward — and the honourable option is not always the profitable one, which
 * is the only way a choice about honour means anything.
 */

/** Move a whole flag's standing with you, which is what a meeting at sea does. */
function shiftNation(g: Game, s: Stranger, delta: number): void {
  g.shiftPeopleRegard(NATION_PEOPLE[s.nation], delta);
}

/** Her worth as a prize, before anybody has been hurt over it. */
export function prizeValue(g: Game, s: Stranger): number {
  const hull = hullClass(s.hullId);
  const cargo = s.business === 'guineaman' ? 3.2
    : s.business === 'interloper' ? 2.1
      : s.business === 'corsair' ? 1.4 : 1;
  return Math.round(hull.tons * 11 * cargo * (0.75 + g.rng.next() * 0.5));
}

/**
 * How a boarding goes.
 *
 * Decided by men and by weight of hull, because that is what decided them: a
 * boarding action was won by whoever could put more people over the rail, and
 * almost every one of these ended when one side's master could see how it was
 * going to go and struck rather than be killed about it. So the odds are not
 * a coin: a ship that is plainly stronger usually takes her prize with nobody
 * killed at all, and a ship that is barely stronger pays for it.
 */
export function boardingOdds(g: Game, s: Stranger): number {
  const mine = g.crew.count * (0.6 + g.crew.morale * 0.6) + g.ship.hull.tons * 0.06;
  const hers = s.hands * (s.business === 'corsair' ? 1.35 : 0.9) + hullClass(s.hullId).tons * 0.06;
  return clamp(mine / (mine + hers), 0.05, 0.95);
}

function takeHer(g: Game, s: Stranger, lawful: boolean): string {
  const odds = boardingOdds(g, s);
  const won = g.rng.next() < odds;
  // Casualties fall off hard with how lopsided it was, on both outcomes.
  const bloodiness = 1 - Math.abs(odds - 0.5) * 1.7;
  const lost = Math.max(won ? 0 : 1, Math.round(g.rng.range(0, 7) * bloodiness));
  g.killHands(lost, won ? 'Killed going over her rail.' : 'Killed in the boats alongside.');
  g.crew.morale = clamp(g.crew.morale + (won ? 0.06 : -0.22), 0, 1);
  shiftAll(g.hands, won ? 0.05 : -0.12);
  shiftNation(g, s, lawful ? -0.25 : -0.5);

  if (!won) {
    g.seaRecord.repulsed++;
    g.ship.damage(g.rng.range(0.04, 0.14));
    return `The boats went in and were beaten back off her side. ${lost === 1 ? 'One man' : `${lost} men`} `
      + `killed for nothing, the boats stove, and ${s.name} standing away to the `
      + 'westward with her people cheering on the rail. It will be in the escrivão’s book by supper.';
  }

  const purse = prizeValue(g, s);
  g.seaRecord.prizes++;
  g.crown.gold += purse;
  if (lawful) {
    g.crown.standing += 14;
    g.crown.lifetimeStanding += 14;
  } else {
    g.crown.standing -= 40;
    g.casa.regard = clamp(g.casa.regard - 0.4, -1, 1);
  }
  return `${s.name} was carried in about four minutes. ${lost === 0
    ? 'Nobody was killed, on either side; her master looked at the numbers on our rail and put up his hands.'
    : `${lost === 1 ? 'One of ours' : `${lost} of ours`} killed, and more of hers.`} `
    + `${purse} cruzados out of her, and ${lawful
      ? 'a deposition for the Casa that will be read by somebody who was not there.'
      : 'nothing whatever to say for it, because she was under the same flag as you are.'}`;
}

/** Ask him where he thinks he is. The best longitude you will get all voyage. */
function askThePosition(g: Game, quality: number): string {
  const from = g.nav.estimated;
  const truth = g.ship.state.pos;
  // He is wrong too, but he is wrong by less, because he has just come from a
  // place he knew the position of.
  const errLat = g.rng.normal(0, quality * 0.12);
  const errLon = g.rng.normal(0, quality * 0.55);
  g.nav.estimated = { lat: truth.lat + errLat, lon: truth.lon + errLon };
  g.nav.sigmaLat = Math.min(g.nav.sigmaLat, quality * 9);
  g.nav.sigmaLon = Math.min(g.nav.sigmaLon, quality * 34);
  const moved = haversine(from, g.nav.estimated) / NM;
  return `His pilot gives his reckoning and ours is ${moved.toFixed(0)} miles from it. `
    + `${moved > 60
      ? 'One of the two books is badly wrong and it is not going to be his, because he sailed from a place he knew the latitude of nine days ago.'
      : 'Close enough to be a comfort, which is not the same as a proof.'} `
    + `The pilot has taken his figure and worked from it, and is in a better temper than he has been for a month.`;
}

function copyHisCoast(g: Game, s: Stranger, accuracyNm: number, rangeNm: number): string {
  const gained = g.chart.copyFrom(g.ship.state.pos, rangeNm, accuracyNm, g.clock.t);
  // His soundings come with his coast.
  g.soundedGround.push({
    lat: g.ship.state.pos.lat, lon: g.ship.state.pos.lon, nm: rangeNm, source: `${s.master}\u2019s roteiro`,
  });
  if (gained === 0) {
    return 'His sheet is worse than ours and he is embarrassed about it. We gave him ours to '
      + 'copy instead, which the Casa would have something to say about.';
  }
  return `Two hours with his roteiro open on our table and the pilot copying as fast as he can `
    + `write. ${gained} headlands laid down that we had never seen, drawn where ${s.master} `
    + `believes they are — which is a better guess than ours and is still a guess.`;
}

// -----------------------------------------------------------------------------

type Build = (g: Game, s: Stranger) => SeaEvent;

const partAndAway: SeaChoice = {
  label: 'Give him a gun and stand on',
  detail: 'Salute, and let him get on with his voyage.',
  resolve: () => 'Colours dipped both ways and a gun fired to leeward, and inside an hour '
    + 'there is nothing of her but the topsail. Nobody aboard either ship will ever mention it '
    + 'again and every man in both watches will remember it for thirty years.',
};

/** What she shouts across first, which depends entirely on whose she is. */
function hailFrom(nation: string): string {
  switch (nation) {
    case 'portuguese':
      return 'Whose ship? — we are eleven days from Lagos and we have water if you want it.';
    case 'castilian':
      return 'Portugale? We are for Cadiz out of the islands, and we want nothing from you but '
        + 'the news.';
    case 'moorish':
      return 'A long exchange in three languages of which the only words either side is sure of '
        + 'are the names of two ports.';
    case 'french':
      return 'Dieppe. He says it twice, as though it explained what a Norman is doing in this '
        + 'water, and to a Norman it does.';
    default:
      return 'Genova — and then, without being asked, the price of pepper in Bruges.';
  }
}

const BUILDERS: Record<string, Build> = {
  // ---------------------------------------------------------------------------
  trader: (_g, s) => ({
    id: 'hail:trader',
    title: `${s.name}, ${NATION_NAME[s.nation]}`,
    severity: 'note',
    text: `She comes up into the wind a cable to leeward and backs her main topsail, which is `
      + `a civil thing to do and costs her an hour. ${s.master} is at her rail with a speaking `
      + `trumpet he does not need.\n\n`
      + `"${hailFrom(s.nation)}"\n\n`
      + 'Two ships in company in open water, for as long as you care to keep her there.',
    choices: [
      {
        label: 'Ask him the news',
        detail: 'What is being said in port. It costs an hour and it is sometimes worth a voyage.',
        resolve: (gg) => {
          const got = gg.hearFromStranger();
          gg.crew.morale = clamp(gg.crew.morale + 0.05, 0, 1);
          shiftAll(gg.hands, 0.04);
          return got
            ? 'An hour of shouting across fifty yards of water, and out of it comes one thing '
              + 'worth the writing down.'
            : 'Prices, weather, who has died, and a long complaint about the Casa\'s weighers. '
              + 'Nothing you did not know, and the men were glad of the sight of another ship.';
        },
      },
      {
        label: 'Ask his pilot for a position',
        detail: 'He has come from somewhere he knew. Your reckoning has not.',
        resolve: (gg) => askThePosition(gg, 1),
      },
      {
        label: 'Send letters home by him',
        detail: 'Every man aboard who can write, and a good many who cannot.',
        resolve: (gg) => {
          gg.crew.morale = clamp(gg.crew.morale + 0.11, 0, 1);
          shiftAll(gg.hands, 0.1);
          return 'The boat went across twice. Men who cannot write got the escrivão to do it '
            + 'and stood over him while he did, and one of them made him read it back three '
            + 'times. Whether any of it arrives is another question and not one anybody aboard '
            + 'is asking today.';
        },
      },
      partAndAway,
    ],
  }),

  // ---------------------------------------------------------------------------
  fisher: (_g, s) => ({
    id: 'hail:fisher',
    title: 'A fishing boat, a long way out',
    severity: 'note',
    text: `A ${hullClass(s.hullId).english.toLowerCase()} with four men in her and the sea coming `
      + `over her weather bow, forty miles further offshore than anything that size has any `
      + `business being. They are not frightened of you, which tells you they have seen ships `
      + `before.\n\nThey hold up a fish the length of a man's arm and shout something nobody `
      + `aboard can make anything of.`,
    choices: [
      {
        label: 'Buy the catch',
        detail: 'Fresh fish for the whole ship’s company, for a knife and some beads.',
        resolve: (gg) => {
          gg.crew.provisions.fresh += 6;
          gg.crew.daysWithoutFresh = 0;
          gg.crew.morale = clamp(gg.crew.morale + 0.1, 0, 1);
          shiftAll(gg.hands, 0.08);
          return 'Two baskets of fish over the rail for a seaman\'s knife and a string of beads, '
            + 'and the cook had the galley fire going before the boat was clear. Six days of '
            + 'fresh for the whole company and the first thing anybody has eaten in a fortnight '
            + 'that did not come out of a cask.';
        },
      },
      {
        label: 'Ask them where the water is',
        detail: 'Men who fish this coast know every stream on it.',
        resolve: (gg) => {
          const got = gg.hearFromStranger();
          return got
            ? 'A great deal of pointing and a name repeated four times, which the pilot has '
              + 'written down as best he can.'
            : 'They point south and shrug, which is either "a long way" or "we do not go there".';
        },
      },
      partAndAway,
    ],
  }),

  // ---------------------------------------------------------------------------
  guineaman: (_g, s) => ({
    id: 'hail:guineaman',
    title: 'Homeward from Mina',
    severity: 'note',
    text: `She is deep in the water and she has been running from you since first light, and `
      + `she has only rounded to now because she has recognised the cut of a Portuguese sail. `
      + `There are men at her rail with crossbows who are being told, audibly, to put them `
      + `down.\n\n"${s.master}, forty-one days from Mina." He does not say what is in her and `
      + `he does not have to; she is six inches lower than she was built to swim and everybody `
      + `in this ocean knows what comes north from that river.`,
    choices: [
      {
        label: 'Ask him for the coast',
        detail: 'He has run it twice a year for six years. Your chart of it is a rumour.',
        resolve: (gg) => copyHisCoast(gg, s, 14, 200),
      },
      {
        label: 'Ask his pilot for a position',
        detail: 'A man forty days out of a place he knew, which is better than you have.',
        resolve: (gg) => askThePosition(gg, 1.5),
      },
      {
        label: 'Take her',
        detail: 'She is your own King’s ship, his gold is aboard, and there is nobody out here.',
        resolve: (gg) => takeHer(gg, s, false),
      },
      partAndAway,
    ],
  }),

  // ---------------------------------------------------------------------------
  interloper: (g, s) => {
    const licensed = g.crown.hasKingsLetter || g.crown.patent !== null;
    const odds = boardingOdds(g, s);
    return {
      id: 'hail:interloper',
      title: `A ${NATION_NAME[s.nation]} sail, south of the line`,
      severity: 'warning',
      facts: { odds },
      text: `She is where no ship but a Portuguese one is permitted to be, and she has known it `
        + `since she raised you, which is why she spent four hours trying to lose you.\n\n`
        + `${s.master} is a long way from Palos and does not pretend otherwise. "We are in this `
        + `water. You are in this water. The Pope drew his line on paper and neither of us has `
        + `seen it."\n\n`
        + (licensed
          ? 'Your commission is explicit, and so was the King when it was read to you: vessels '
            + 'of any other prince found south of Bojador are to be taken, and their people are '
            + 'to be put into the sea. You have the letter in your cabin.'
          : 'You are here on your own account with no commission in your pocket, which makes '
            + 'this a matter between two masters and not between two crowns.'),
      choices: [
        ...(licensed
          ? [{
            label: 'Take her, as your commission requires',
            detail: `Board her. ${(odds * 100).toFixed(0)} chances in a hundred, and men will be hurt either way.`,
            resolve: (gg: Game) => takeHer(gg, s, true),
          }]
          : []),
        {
          label: 'Warn him off and let him go',
          detail: 'Tell him what the King has said, and that next time it will not be you.',
          resolve: (gg) => {
            shiftNation(gg, s, 0.12);
            gg.crown.standing += licensed ? 2 : 4;
            gg.crown.lifetimeStanding += licensed ? 2 : 4;
            gg.casa.regard = clamp(gg.casa.regard - (licensed ? 0.2 : 0), -1, 1);
            return `You read him the King's words across fifty yards of water and he listens to `
              + `all of it with his hat in his hand. Then he says that he has eleven men aboard `
              + `who have not been paid since March, and puts his helm up, and goes south.`
              + (licensed
                ? ' Your orders were not to warn him. The escrivão writes down that you did.'
                : ' You had no orders about him at all, and the fact that you did not have to do '
                  + 'it is most of why it was worth doing.');
          },
        },
        {
          label: 'Let him alone. He is nothing to do with you.',
          detail: licensed
            ? 'Your commission says otherwise, and there is a clerk aboard who reads it too.'
            : 'Two ships pass. Nothing happens. This is what usually happened.',
          resolve: (gg) => {
            if (licensed) {
              gg.casa.regard = clamp(gg.casa.regard - 0.3, -1, 1);
              gg.crown.standing -= 8;
              return 'You alter two points and go about your own business, and he goes about his, '
                + 'and neither ship fires. It is the sensible thing and it is a breach of your '
                + 'commission, and the man who writes the Casa\'s copy of this voyage was standing '
                + 'at the break of the quarterdeck for the whole of it.';
            }
            shiftNation(gg, s, 0.08);
            return 'You alter two points and he alters two the other way, and by dark there is '
              + 'nothing in that quarter but water. Whatever is going on between the two crowns '
              + 'is being conducted by people who are not out here.';
          },
        },
      ],
    };
  },

  // ---------------------------------------------------------------------------
  corsair: (g, s) => {
    const odds = boardingOdds(g, s);
    const ransom = Math.max(60, Math.round(g.crown.gold * 0.22));
    return {
      id: 'hail:corsair',
      title: 'She has run you down',
      severity: 'grave',
      facts: { odds },
      text: `She has had the heels of you since the forenoon watch and there is nothing more to `
        + `be done about it. A lateen caravel out of the Barbary coast with sixty men in her `
        + `and no cargo at all, which in this ocean means one trade and only one.\n\n`
        + `She fires once across your bow and lies on your weather quarter, close enough that `
        + `you can see them sorting themselves along her rail, and waits to see what you do.`,
      choices: [
        {
          label: 'Fight her',
          detail: `${(odds * 100).toFixed(0)} chances in a hundred, and this is what she does for a living.`,
          resolve: (gg) => {
            const won = gg.rng.next() < odds;
            const lost = Math.round(gg.rng.range(1, 9) * (won ? 0.6 : 1.3));
            if (!won) gg.seaRecord.repulsed++;
            gg.killHands(lost, 'Killed when the Moor came aboard.');
            gg.ship.damage(gg.rng.range(0.05, 0.18));
            gg.crew.morale = clamp(gg.crew.morale + (won ? 0.12 : -0.3), 0, 1);
            shiftAll(gg.hands, won ? 0.1 : -0.18);
            shiftNation(gg, s, -0.3);
            if (won) {
              const purse = prizeValue(gg, s);
              gg.seaRecord.prizes++;
              gg.crown.gold += purse;
              gg.crown.standing += 10;
              gg.crown.lifetimeStanding += 10;
              return `They came over the quarter and were held on the gangway for a quarter of `
                + `an hour, and then they were not there any more. ${lost === 1 ? 'One man' : `${lost} men`} `
                + `killed. ${purse} cruzados out of her, and a ship's company who will tell this `
                + 'story in every wine shop in Belém for the rest of their lives.';
            }
            const taken = Math.round(gg.crown.gold * 0.5);
            gg.crown.gold -= taken;
            return `It lasted about eight minutes. ${lost === 1 ? 'One man' : `${lost} men`} killed, `
              + `the topsides opened in three places, and ${taken} cruzados and most of what was `
              + `loose on deck gone across to her. They left you the ship, which is what they do, `
              + 'because a hull nobody can sail home is worth nothing to anybody.';
          },
        },
        {
          label: `Buy her off — ${ransom} cruzados`,
          detail: 'The ordinary arrangement, and the reason most of these end with nobody dead.',
          resolve: (gg) => {
            gg.seaRecord.ransoms++;
            gg.crown.gold -= ransom;
            gg.crew.morale = clamp(gg.crew.morale - 0.06, 0, 1);
            shiftAll(gg.hands, -0.04);
            shiftNation(gg, s, 0.15);
            return `${ransom} cruzados into a basket and across on a line, and he counts it on `
              + `his own deck while sixty men watch you in silence. Then he takes his hat off, `
              + 'and bears away east, and that is the whole of it. Every man forward understood '
              + 'exactly what was bought and what it cost and none of them said a word.';
          },
        },
      ],
    };
  },

  // ---------------------------------------------------------------------------
  distressed: (_g, s) => ({
    id: 'hail:distressed',
    title: 'A ship that cannot swim much longer',
    severity: 'warning',
    text: `${s.name}, dismasted. Her mainmast is over the side and still attached to her by the `
      + `weather rigging, which is what is holding her beam on to the sea, and there are men on `
      + `her forecastle who have stopped working.\n\n`
      + `Her master has been eleven days like this. He wants water, he wants a spar, and what he `
      + `actually wants is for somebody to take his people off, and he is too proud to ask for `
      + `it in front of them.`,
    choices: [
      {
        label: 'Go alongside and get her sailing',
        detail: 'Three days, your carpenter, your spare spar, and water out of your own casks.',
        resolve: (gg) => {
          gg.seaRecord.succoured++;
          gg.crew.provisions.water = Math.max(0, gg.crew.provisions.water - 18);
          gg.clock.t += 3 * 86400;
          gg.crew.fatigue = clamp(gg.crew.fatigue + 0.12, 0, 1);
          gg.crew.morale = clamp(gg.crew.morale + 0.16, 0, 1);
          shiftAll(gg.hands, 0.16);
          gg.crown.standing += 6;
          gg.crown.lifetimeStanding += 6;
          shiftNation(gg, s, 0.3);
          gg.casa.regard = clamp(gg.casa.regard + 0.15, -1, 1);
          for (const o of gg.crew.officers) {
            if (o.alive) o.loyalty = clamp(o.loyalty + 0.08, 0, 1);
          }
          return 'Three days of it. Our carpenter and eighteen of ours aboard her cutting the '
            + 'wreck clear, a spare topmast across on two boats, and eighteen days of our water '
            + 'gone into her casks. She made sail on the third afternoon and our people came off '
            + 'her and nobody said anything for about a minute. Then the bosun started them on '
            + 'the pumps, because that is what you do.';
        },
      },
      {
        label: 'Give her water and go',
        detail: 'Half a day and six days of water. She will probably still be there in a week.',
        resolve: (gg) => {
          gg.seaRecord.succoured++;
          gg.crew.provisions.water = Math.max(0, gg.crew.provisions.water - 6);
          gg.clock.t += 0.5 * 86400;
          gg.crew.morale = clamp(gg.crew.morale + 0.03, 0, 1);
          shiftAll(gg.hands, 0.02);
          shiftNation(gg, s, 0.12);
          return 'Four casks across and a course to steer, and we filled away before the boat '
            + 'was properly hoisted in. Her master shouted something after us that nobody chose '
            + 'to hear clearly. It was probably thanks.';
        },
      },
      {
        label: 'Stand on',
        detail: 'You have your own water to think about, and a commission, and eleven weeks to run.',
        resolve: (gg) => {
          gg.seaRecord.abandoned++;
          gg.crew.morale = clamp(gg.crew.morale - 0.14, 0, 1);
          shiftAll(gg.hands, -0.18);
          gg.casa.regard = clamp(gg.casa.regard - 0.1, -1, 1);
          for (const o of gg.crew.officers) {
            if (o.alive) o.loyalty = clamp(o.loyalty - 0.07, 0, 1);
          }
          return 'You hold your course and she goes down the horizon over about two hours, and '
            + 'for the whole of those two hours there are men on your own rail not working. '
            + 'Nobody says anything to you about it. Nobody will ever say anything to you about '
            + 'it. The escrivão wrote down the time she was sighted and the time she was lost '
            + 'sight of, which is all he is required to write down.';
        },
      },
    ],
  }),
};

/** The Genoese sell charts and buy them, and are on nobody's side but their own. */
const GENOESE: Build = (g, s) => {
  const price = 220 + Math.round(g.crown.lifetimeStanding * 0.6);
  return {
    id: 'hail:genoese',
    title: `${s.name}, of Genoa`,
    severity: 'note',
    text: `A Genoese hull sailing on somebody's licence — his own account, a Lisbon factor's `
      + `money, and a Castilian register, all at once, and he sees nothing strange in any of `
      + `it. Half the capital that paid for this coast came out of his city.\n\n`
      + `"${s.master}. You are surveying." It is not a question. "I will buy anything you have `
      + `drawn, and I have a Catalan sheet of the Gulf that your Casa does not have."`,
    choices: [
      {
        label: `Buy his sheet — ${price} cruzados`,
        detail: 'A Catalan chart of a coast you have not run. Drawn well, and drawn by somebody else.',
        resolve: (gg) => {
          if (gg.crown.gold < price) {
            return 'You have not got it, and he can see that you have not got it, and he is '
              + 'gracious about it in a way that is worse than if he had laughed.';
          }
          gg.crown.gold -= price;
          return copyHisCoast(gg, s, 9, 320);
        },
      },
      {
        label: 'Sell him a copy of your own',
        detail: 'Quick money. Everything you have surveyed, in a Genoese strongbox, by Thursday.',
        resolve: (gg) => {
          const worth = Math.round(gg.chart.drawn() * 0.7 + gg.crown.lifetimeStanding * 1.4);
          gg.crown.gold += worth;
          gg.casa.regard = clamp(gg.casa.regard - 0.25, -1, 1);
          gg.crown.standing -= 6;
          return `${worth} cruzados, counted out on his own capstan, for two hours of the pilot's `
            + 'time and a sheet of paper. What you have also done is put the Casa\'s survey into '
            + 'the hands of a man who will sell it again in Seville before Lent, and the Casa '
            + 'employs people whose entire occupation is noticing that this has happened.';
        },
      },
      {
        label: 'Ask what Seville is saying',
        detail: 'He drinks with everybody. That is the whole of his business model.',
        resolve: (gg) => {
          const got = gg.hearFromStranger();
          return got
            ? 'He talks for an hour and nine tenths of it is useless and the tenth is not.'
            : 'An hour of Genoese gossip about people you have never met, delivered with enormous '
              + 'relish, out of which comes precisely nothing you can use.';
        },
      },
      partAndAway,
    ],
  };
};

/** What passes between two ships that have closed to speaking distance. */
export function hailScene(g: Game, s: Stranger): SeaEvent {
  if (s.nation === 'genoese' && s.business === 'trader') return GENOESE(g, s);
  const build = BUILDERS[s.business] ?? BUILDERS.trader;
  return build(g, s);
}
