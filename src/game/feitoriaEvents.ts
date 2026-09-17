import { clamp } from '../core/math';
import { portDef } from '../world/ports';
import { people } from '../world/peoples';
import {
  garrisonWanted, stockCost, stockValue, strengthOf, type Feitoria,
} from '../progression/feitoria';
import type { SeaEvent } from './seaEvents';
import type { Game } from './state';

/**
 * What happens to a shed on a beach four thousand miles away.
 *
 * The factory is the only thing in this game that keeps happening while the
 * player is not there, and the whole design of it rests on that: it is worth
 * having because it works all year, and it is dangerous to have for exactly
 * the same reason. So everything here is a consequence of absence.
 *
 * Three stages, and they are the real ones. First the town starts asking for
 * things — a present for the ruler, a share, a wrong put right — and paying is
 * always cheaper than not paying and always feels like being robbed. Then the
 * man in charge goes wrong, because a clerk left alone with a chest for four
 * years in a place with no Portuguese in it goes wrong in one of about three
 * ways, all of which really happened. Then it is burned, and everything in the
 * shed and everybody in it is gone, and the only decision left is whether you
 * are the kind of captain who comes back and rebuilds.
 *
 * None of it fires without warning. `trouble` is on the orders screen from the
 * day the place is founded, it only ever rises while you are away, and a
 * captain who calls in once a year and keeps the town sweet will never see any
 * of these. That is the point: this is the price of treating a station as a
 * money tap.
 */

/** A gift asked for, a share demanded, or a wrong to be put right. */
export function demandScene(g: Game, f: Feitoria): SeaEvent {
  const def = portDef(f.portId);
  const pe = people(def.people);
  const ask = Math.round(60 + stockValue(f) * 0.12 + f.garrison * 8);

  return {
    id: `feit:demand:${f.portId}:${Math.floor(g.clock.t / 86400 / 300)}`,
    title: `A demand from the ${pe.name} at ${def.name}`,
    severity: 'warning',
    text: `${f.factor} has been waiting for a ship to tell this to. The men who own the ground the `
      + `factory stands on have been round three times since the rains, and the message has got `
      + `shorter each time: the arrangement made when the shed was built was made with a ship in `
      + `the road and there has not been one since.\n\nThey want ${ask} cruzados' worth, in goods `
      + `or in coin, and they have not said what happens if they do not get it, which is the part `
      + `${f.factor} does not like.`,
    choices: [
      {
        label: `Pay it — ${ask} cruzados`,
        detail: 'Out of the purse or the factory’s own chest. It buys the place another year.',
        resolve: (game) => {
          const fromChest = Math.min(f.chest, ask);
          f.chest -= fromChest;
          const rest = ask - fromChest;
          if (rest > 0) {
            const paid = Math.min(rest, game.crown.gold + game.creditFree);
            if (game.crown.gold < paid) game.drawCredit(paid);
            game.crown.gold -= paid;
          }
          f.regard = clamp(f.regard + 0.16, 0, 1);
          f.trouble = clamp(f.trouble - 0.4, 0, 1);
          return `Paid, and the whole town watched it counted out, which is most of what it was `
            + 'for. The factory stands where it stands because they let it, and everybody there '
            + 'has been reminded of that including you.';
        },
      },
      {
        label: 'Send half and a promise',
        detail: 'Cheaper, and they will know exactly what it is.',
        resolve: (game) => {
          const half = Math.round(ask / 2);
          const fromChest = Math.min(f.chest, half);
          f.chest -= fromChest;
          const rest = half - fromChest;
          if (rest > 0) {
            const paid = Math.min(rest, game.crown.gold + game.creditFree);
            if (game.crown.gold < paid) game.drawCredit(paid);
            game.crown.gold -= paid;
          }
          f.regard = clamp(f.regard + 0.04, 0, 1);
          f.trouble = clamp(f.trouble - 0.15, 0, 1);
          return `Half of it, and ${f.factor} saying the rest comes with the next ship. They took `
            + 'it. They also counted it, in front of him, twice.';
        },
      },
      {
        label: 'Refuse, and tell him to shut the gate',
        detail: 'Nothing paid. Whether that is courage or the end of the station depends on the walls.',
        resolve: (game) => {
          f.regard = clamp(f.regard - 0.22, 0, 1);
          f.trouble = clamp(f.trouble + 0.3, 0, 1);
          game.crown.standing += 3;
          return strengthOf(f) > 0.5
            ? `Refused. ${f.factor} has the gate shut and the pieces run out, and nothing has `
              + 'happened yet. The Casa will like this better than the town does.'
            : `Refused, and ${f.factor} took the message with the face of a man who has counted `
              + 'the palisade and the six of them behind it.';
        },
      },
    ],
  };
}

/**
 * The man goes wrong.
 *
 * Three ways, and they are the three ways it actually went: he has been
 * writing two sets of books, he has made a life there and does not want the
 * one you are offering, or the coast has killed him. Which one it is depends
 * on what he was when you left him, which is the return on having chosen him
 * carefully.
 */
export function factorScene(g: Game, f: Feitoria): SeaEvent {
  const def = portDef(f.portId);
  const kind = f.honesty < 0.45 ? 'thief' : g.rng.chance(0.45) ? 'gone-native' : 'dead';
  const held = stockCost(f);

  if (kind === 'thief') {
    const taken = Math.round(f.chest * 0.7 + held * 0.25);
    return {
      id: `feit:thief:${f.portId}`,
      title: `${f.factor}’s books do not add up`,
      severity: 'grave',
      text: `You have sat with the ledger for an afternoon and it is not a near thing. There are `
        + `two sets of weights in the store. There is a parcel of the best of it that is entered `
        + `as spoiled and is in a shed on the other side of the town with another man’s mark `
        + `on it. Four years of small amounts comes to about ${taken} cruzados, and he has not `
        + `denied a word of it — he has explained, at length, that a man left here for four `
        + `years with no ship and no word is entitled to something.`,
      choices: [
        {
          label: 'Hang him on the beach',
          detail: 'The men will see it. So will the town, and they will draw their own conclusion.',
          resolve: (game) => {
            f.trouble = clamp(f.trouble + 0.18, 0, 1);
            f.regard = clamp(f.regard - 0.12, 0, 1);
            game.crew.morale = clamp(game.crew.morale - 0.06, 0, 1);
            game.crown.standing += 6;
            game.factorLeaves(f, 'dead');
            f.factor = 'nobody';
            f.ability = 0;
            f.honesty = 0;
            return `Hanged at low water in front of the shed. The Casa will record it as proper. `
              + 'The station has no factor now and everybody in it watched you do that, which is '
              + 'a thing they will think about when the next ship is late.';
          },
        },
        {
          label: 'Take what is left and keep him',
          detail: 'He is a thief who knows this coast and this town. Those are not opposites.',
          resolve: (game) => {
            f.chest = Math.max(0, f.chest - taken * 0.4);
            f.honesty = clamp(f.honesty - 0.1, 0, 1);
            f.ability = clamp(f.ability + 0.06, 0, 1);
            f.trouble = clamp(f.trouble - 0.1, 0, 1);
            game.crown.standing = Math.max(0, game.crown.standing - 4);
            return `Took back what could be found and left him in the chair. He understood the `
              + 'arrangement immediately, which tells you something, and he will go on stealing '
              + 'and go on being the only man on this shore who can buy well.';
          },
        },
        {
          label: 'Put him in irons and carry him home',
          detail: 'The station loses its factor. The Casa gets its man and you get the credit.',
          resolve: (game) => {
            f.chest = Math.max(0, f.chest - taken * 0.2);
            game.factorLeaves(f, 'aboard');
            f.factor = 'nobody';
            f.ability = 0;
            f.honesty = 0;
            game.crown.standing += 10;
            game.casa.regard = clamp((game.casa.regard ?? 0) + 0.12, -1, 1);
            return 'In irons in the cable tier, with the ledger in a bag beside him for the '
              + 'contador to read. The shed is shut and there is nobody in it.';
          },
        },
      ],
    };
  }

  if (kind === 'gone-native') {
    return {
      id: `feit:native:${f.portId}`,
      title: `${f.factor} will not come home`,
      severity: 'warning',
      text: `He came down to the boat to tell you himself and he had thought about how to say it. `
        + `He has a wife here and two children and the language, and he is the only man on this `
        + `shore both sides will listen to. The books are perfect. The shed is full. He simply `
        + `does not want the berth you are offering him or any other one, and he asks — he is `
        + `careful to make it an asking — to be left where he is.`,
      choices: [
        {
          label: 'Leave him. He is the station now',
          detail: 'He stops being your clerk and starts being your man in this country.',
          resolve: (game) => {
            f.regard = clamp(f.regard + 0.3, 0, 1);
            f.trouble = clamp(f.trouble - 0.35, 0, 1);
            f.ability = clamp(f.ability + 0.14, 0, 1);
            f.honesty = clamp(f.honesty + 0.08, 0, 1);
            game.factorLeaves(f, 'stays');
            return `Left him to it with the Crown’s commission written out fresh in his own `
              + 'name. Whatever this place becomes, he is going to be the reason, and the first '
              + 'Portuguese who comes here in twenty years will find his sons running it.';
          },
        },
        {
          label: 'Order him aboard',
          detail: 'He is a sworn man under commission. It is entirely within your power.',
          resolve: (game) => {
            f.regard = clamp(f.regard - 0.3, 0, 1);
            f.trouble = clamp(f.trouble + 0.34, 0, 1);
            game.factorLeaves(f, 'aboard');
            f.factor = 'nobody';
            f.ability = 0;
            game.crew.morale = clamp(game.crew.morale - 0.08, 0, 1);
            return 'Aboard, with his sea chest, and the whole town on the beach watching it '
              + 'happen. He has not spoken since. The station has nobody in it who is trusted '
              + 'here and everyone here knows why.';
          },
        },
      ],
    };
  }

  return {
    id: `feit:dead:${f.portId}`,
    title: `${f.factor} is dead`,
    severity: 'grave',
    text: `The fever, eleven months ago, and they buried him behind the shed with a board over `
      + `him. The senior of the men left has been keeping the books since and has kept them `
      + `honestly and badly — he can write and he cannot buy, and the shed shows it. He has `
      + `been waiting for a ship for eleven months to be told what to do.`,
    choices: [
      {
        label: 'Leave the man in charge formally',
        detail: 'He is willing, loyal, and not much good at it. The station keeps going.',
        resolve: (game) => {
          game.factorLeaves(f, 'dead');
          f.factor = `the senior man at ${def.name}`;
          f.ability = clamp(f.ability * 0.55, 0.12, 1);
          f.honesty = clamp(f.honesty + 0.12, 0, 1);
          f.trouble = clamp(f.trouble - 0.12, 0, 1);
          return 'Written into the commission on the cabin table with two of the hands as '
            + 'witnesses. He is going to do his best, which is the most that can be said.';
        },
      },
      {
        label: 'Shut the shed and bring everything away',
        detail: 'The goods and the men come aboard. The position is given up.',
        resolve: (game) => game.closeFactory(f, 'Shut up after the factor died and no other man '
          + 'could be spared for it.'),
      },
    ],
  };
}

/** It is gone. */
export function sackScene(g: Game, f: Feitoria): SeaEvent {
  const def = portDef(f.portId);
  const pe = people(def.people);
  const value = stockValue(f);
  const rival = g.rng.chance(0.3);

  return {
    id: `feit:sack:${f.portId}:${Math.floor(g.clock.t / 86400)}`,
    title: `The factory at ${def.name} has been burned`,
    severity: 'grave',
    text: rival
      ? `You raise the point expecting the shed and there is nothing on it but the stone floor `
        + `and a lot of charcoal. A fisherman tells it in pieces: a ship not of your nation, two `
        + `boats in at first light, and it was done before the town was properly awake. Whoever `
        + `they were, they knew what was in there.\n\nThe men are dead or gone. About `
        + `${value} cruzados of goods went into the boats or into the fire.`
      : `There is no shed. There is a black rectangle where the shed was, and the ${pe.name} on `
        + `the beach will not look at you.\n\nIt had been coming for a long time and everybody `
        + `here knew it was coming, which is worse. About ${value} cruzados of goods is ash, and `
        + `of the ${f.garrison} men left here nobody will say anything at all except that they `
        + `are not here.`,
    choices: [
      {
        label: 'Rebuild it, on the same stones',
        detail: 'A man, men, and money again, at a place that has already burned you once.',
        resolve: (game) => {
          game.loseGarrison(f);
          f.stock = {};
          f.paid = {};
          f.chest = 0;
          f.works = [];
          f.factor = 'nobody';
          f.ability = 0;
          f.trouble = 0.3;
          f.regard = clamp(f.regard - 0.1, 0, 1);
          return 'The stones are sound and the ground is still yours on paper. It wants a man in '
            + 'it, men behind him and everything that was in it, and none of that is aboard this '
            + 'ship. Found it again when you can.';
        },
      },
      {
        label: 'Have satisfaction for it',
        detail: 'Burn the beach town in return. The Casa will call it proper. Nothing here will forget.',
        resolve: (game) => {
          const rel = game.relationsFor(def.id);
          rel.regard = Math.min(rel.regard, -0.8);
          rel.mayTrade = false;
          game.crown.standing += 14;
          game.crew.morale = clamp(game.crew.morale - 0.1, 0, 1);
          // Everything and everybody, before the station is shut up: closing it
          // brings the men and the goods away, and there are neither.
          game.loseGarrison(f);
          f.stock = {};
          f.chest = 0;
          game.closeFactory(f, 'Burned, and answered for.');
          return 'Done at first light with the boats and the ship’s pieces. The Casa will '
            + 'record that the King’s honour was maintained on this coast. Nothing of yours '
            + 'will be able to put into this place again in your lifetime.';
        },
      },
      {
        label: 'Take the loss and sail',
        detail: 'Nothing spent, nothing avenged. The position is given up.',
        resolve: (game) => {
          const rel = game.relationsFor(def.id);
          rel.regard = clamp(rel.regard - 0.15, -1, 1);
          game.loseGarrison(f);
          f.stock = {};
          f.chest = 0;
          game.closeFactory(f, 'Burned out, and not gone back to.');
          return 'Weighed and stood out with the charcoal still smoking on the point. There were '
            + 'men in that shed whose names are in the muster book and there is nothing to be '
            + 'done about any of it.';
        },
      },
    ],
  };
}

/**
 * Word of a station reaching you somewhere else.
 *
 * Without this, a factory in trouble is invisible until the day you happen to
 * call there, and the player's only defence against losing one is to visit
 * everything constantly, which is not a decision, it is a chore. A letter that
 * overtakes you at Lisbon or at Mina turns it into what it should be: a piece
 * of news that makes you change your plans.
 */
export function letterScene(g: Game, f: Feitoria): SeaEvent {
  const def = portDef(f.portId);
  const bad = f.trouble > 0.55;

  return {
    id: `feit:letter:${f.portId}:${Math.floor(g.clock.t / 86400 / 180)}`,
    title: `A letter from ${def.name}`,
    severity: bad ? 'warning' : 'note',
    text: bad
      ? `It came up in a caravel out of the south and has been four months on the way. `
        + `${f.factor} writes carefully, because he knows the letter may be read by others, and `
        + `underneath the care he is asking for a ship.\n\nThe town has changed its mind about the `
        + `station. He does not say he is frightened. He says that he has moved the best of the `
        + `goods inside at night, which is the same thing.`
      : `Four months old, and short, which from a factor is good news. The shed is full, the `
        + `chest is not empty, and ${f.factor} would like to know when a bottom is coming for `
        + `what is in it, because he has nowhere to put the next lot.`,
    choices: [
      {
        label: 'Note it',
        detail: 'The station is on the orders screen. What you do about it is a course.',
        resolve: () => (bad
          ? `Filed. It is four months old and whatever it describes has had four months to get `
            + 'worse.'
          : 'Filed, with the date. There is a full shed waiting somewhere south of here and it is '
            + 'doing nothing while it waits.'),
      },
    ],
  };
}

/**
 * Whatever any of the stations has to say to you, on making port.
 *
 * Checked at the quay, worst first, and the ones in the place you are standing
 * in outrank a letter about one four thousand miles away.
 */
export function rollFeitoriaScene(g: Game): SeaEvent | null {
  const here = g.factoryHere;
  if (here && !here.lost) {
    if (here.trouble >= 0.85) return sackScene(g, here);
    if (here.factor !== 'nobody' && here.officerId !== null
      && g.clock.t - here.settled > 540 * 86400 && g.rng.chance(0.55)) {
      return factorScene(g, here);
    }
    if (here.trouble >= 0.45) return demandScene(g, here);
    if (here.garrison < garrisonWanted(here.works) * 0.6 && here.garrison > 0) return null;
  }

  // And the post. Only at a place with Portuguese in it, because that is how a
  // letter travels, and only about a station you are not standing in.
  const def = g.portHere;
  if (!def) return null;
  if (def.people !== 'portuguese' && !def.feitoria) return null;
  for (const f of g.feitorias) {
    if (f.lost || f.portId === def.id) continue;
    const away = (g.clock.t - f.settled) / 86400;
    if (away < 150) continue;
    if (g.lettersSeen.includes(`${f.portId}:${Math.floor(g.clock.t / 86400 / 180)}`)) continue;
    if (!g.rng.chance(0.6)) continue;
    g.lettersSeen.push(`${f.portId}:${Math.floor(g.clock.t / 86400 / 180)}`);
    return letterScene(g, f);
  }
  return null;
}
