import { NM, clamp, haversine, type LatLon } from '../core/math';
import { elevationAt, nearestShore } from '../world/landmass';
import { PORTS, anchorageOf } from '../world/ports';
import type { Rng } from '../core/rng';

/**
 * A stretch of coast nobody has built a town on.
 *
 * Raising land was the whole point of the voyages this game is about, and until
 * now it was an alert and nothing else: the coast was scenery, and the only
 * thing a player could do with it was sail past. What a landing party actually
 * went in for was water, wood and food — the three things that decide how long
 * a ship can stay at sea — and to find out who lived there.
 *
 * What a place has is read off where it is, so the answer is never arbitrary
 * and is always the historically right one. The Saharan coast gives a boat's
 * crew nothing at all and cost Portuguese expeditions dearly for sixty years;
 * four hundred miles further south the rivers run all year. That difference is
 * the reason the Guinea voyages worked and it belongs in the game.
 */
export interface ShorePlace {
  /** Whose coast this is, if anyone's, as a people id. */
  peopleId: string | null;
  /** Nearest settlement, and how far off — for "there is a town along here". */
  nearestPortId: string | null;
  nearestPortNm: number;
  /** 0 to 1: how likely a watering party is to find a stream. */
  water: number;
  /** 0 to 1: timber worth cutting. */
  wood: number;
  /** 0 to 1: anything to eat that will keep the scurvy off. */
  food: number;
  /** Height of the land behind the beach, in metres. */
  relief: number;
  /** What the coast looks like, in a sentence. */
  describe: string;
}

/**
 * How wet a coast is, from latitude alone.
 *
 * The great deserts sit under the descending limb of the Hadley cell at about
 * twenty-five degrees either side of the line, and the wet belts are the
 * equator and the temperate forties. This is the single most important fact
 * about the west African coast for a ship: from Cape Bojador to the Senegal
 * there is no fresh water at all, and everybody who tried it found that out.
 */
function wetness(lat: number): number {
  const a = Math.abs(lat);
  // Equatorial rain belt.
  const equatorial = Math.exp(-((a / 9) ** 2));
  // Temperate westerlies.
  const temperate = Math.exp(-(((a - 45) / 13) ** 2));
  // The subtropical deserts, which subtract.
  const desert = Math.exp(-(((a - 24) / 8) ** 2));
  return clamp(equatorial + temperate * 0.85 - desert * 0.75, 0.02, 1);
}

export function shorePlaceAt(at: LatLon): ShorePlace {
  const shore = nearestShore(at, 90);
  const relief = elevationAt(shore.land >= 0
    ? { lat: at.lat, lon: at.lon }
    : at, shore);

  let nearestPortId: string | null = null;
  let nearestPortNm = Infinity;
  for (const p of PORTS) {
    const d = haversine(at, anchorageOf(p)) / NM;
    if (d < nearestPortNm) { nearestPortNm = d; nearestPortId = p.id; }
  }
  const near = PORTS.find((p) => p.id === nearestPortId);

  // Whose coast it is. Four hundred miles is about as far as one people's
  // country ran along a shore, and beyond that nobody aboard would be able to
  // say whose land they had landed on — which is the honest answer.
  const peopleId = near && nearestPortNm < 400 ? near.people : null;

  const wet = wetness(at.lat);
  // Rivers come out of high ground. A flat desert shore has neither.
  const reliefBonus = clamp(relief / 900, 0, 0.45);
  const water = clamp(wet * 0.85 + reliefBonus, 0, 1);
  const wood = clamp(wet * 1.05 - 0.1, 0, 1);
  const food = clamp(wet * 0.7 + (peopleId ? 0.25 : 0) + reliefBonus * 0.4, 0, 1);

  return {
    peopleId,
    nearestPortId,
    nearestPortNm,
    water,
    wood,
    food,
    relief,
    describe: describeShore(wood, relief, peopleId !== null),
  };
}

function describeShore(wood: number, relief: number, peopled: boolean): string {
  const land = relief > 900
    ? 'Mountains stand up behind the beach'
    : relief > 260
      ? 'The ground rises steadily behind the shore'
      : 'The land behind is low and flat';
  const green = wood > 0.6
    ? 'and the whole of it is under trees.'
    : wood > 0.25
      ? 'with scrub and low trees along the top of the beach.'
      : 'and there is nothing growing on it that a man would call a tree.';
  const signs = peopled
    ? ' There is smoke inland, and the marks of boats on the sand.'
    : ' Nothing has been ashore here but birds.';
  return `${land}, ${green}${signs}`;
}

export interface LandingResult {
  /** What to write in the log. */
  text: string;
  /** Days the boat is away. */
  days: number;
  waterDays?: number;
  freshDays?: number;
  woodDays?: number;
  moraleDelta?: number;
  /** True when the party met somebody. */
  metPeople?: boolean;
  hurt?: number;
  severity?: 'note' | 'warning' | 'grave';
}

/** Fill the casks. The single commonest reason a ship closed a strange coast. */
export function waterParty(place: ShorePlace, rng: Rng, hands: number): LandingResult {
  const luck = rng.next();
  if (place.water < 0.18 || luck > place.water + 0.25) {
    return {
      text: 'The boat was away all day and found nothing. There is no water on this coast — '
        + 'they dug in the sand above the tide line and got salt, and came off again with the '
        + 'casks as empty as they went in.',
      days: 0.6,
      moraleDelta: -0.05,
      severity: 'warning',
    };
  }
  // A good stream fills a caravel's casks in a day; a seep takes longer and
  // gives less.
  const quality = clamp(place.water + (luck - 0.5) * 0.3, 0.15, 1);
  const days = quality > 0.6 ? 0.7 : 1.3;
  const gained = Math.round(20 + quality * 55 * clamp(hands / 20, 0.4, 1.3));
  return {
    text: quality > 0.6
      ? `A stream comes down to the beach a cable north of where the boat landed, running `
        + `clear and sweet. The casks are filled and rafted off — ${gained} days of water.`
      : `They found a seep in the rocks and dug it out into a pool. It fills slowly and it `
        + `tastes of the ground it came through, but it is water — ${gained} days of it.`,
    days,
    waterDays: gained,
    moraleDelta: 0.06,
  };
}

/** Wood, which is what the galley fire burns and what repairs are made from. */
export function woodParty(place: ShorePlace, rng: Rng): LandingResult {
  if (place.wood < 0.15) {
    return {
      text: 'Nothing ashore stands higher than a man’s knee. The party brought off an '
        + 'armful of driftwood and a great deal of sand.',
      days: 0.4,
      moraleDelta: -0.02,
    };
  }
  const q = clamp(place.wood + (rng.next() - 0.5) * 0.25, 0.1, 1);
  return {
    text: q > 0.6
      ? 'Good timber down to the water’s edge. The carpenter went in with the party and '
        + 'came back with spars enough to fish a yard, besides the firewood.'
      : 'Scrub, mostly, but it burns. The galley has fuel for some weeks.',
    days: q > 0.6 ? 0.8 : 0.5,
    woodDays: Math.round(q * 40),
    moraleDelta: 0.03,
  };
}

/**
 * Anything green.
 *
 * This is the scurvy, which is the thing that actually killed the crews. A
 * landing on a wet coast is worth more to a ship's company than any cargo.
 */
export function foragingParty(place: ShorePlace, rng: Rng): LandingResult {
  const luck = rng.next();
  if (place.food < 0.2 || luck > place.food + 0.2) {
    return {
      text: 'They walked four miles inland and found nothing anybody was willing to eat.',
      days: 0.7,
      moraleDelta: -0.04,
    };
  }
  const q = clamp(place.food + (luck - 0.5) * 0.3, 0.1, 1);
  const days = Math.round(6 + q * 22);
  const what = q > 0.7
    ? 'Fruit the surgeon does not know and a kind of wild celery, and turtles on the beach '
      + 'at night'
    : q > 0.4
      ? 'Greens of some sort, sour and tough, and a quantity of shellfish off the rocks'
      : 'A few handfuls of berries and some birds’ eggs';
  return {
    text: `${what}. The surgeon has everybody eating it whether they like it or not — `
      + `${days} days of fresh provisions.`,
    days: 0.8,
    freshDays: days,
    moraleDelta: 0.09,
  };
}

/**
 * Walk up the beach and see who is there.
 *
 * On an inhabited coast this is how first contact actually happened: not at a
 * factory with a governor and an interpreter, but a boat's crew and a dozen
 * people on a beach, neither of whom could say a word to the other.
 */
export function meetingParty(
  place: ShorePlace, rng: Rng, peopleName: string | null,
): LandingResult {
  if (!place.peopleId || !peopleName) {
    return {
      text: 'The party walked the beach for a mile either way. There are no tracks, no fires, '
        + 'no boats and no paths. Whatever this coast is, nobody lives on this part of it.',
      days: 0.5,
    };
  }
  const luck = rng.next();
  if (luck < 0.12) {
    return {
      text: `Men came down through the trees while the boat was on the sand, and it went `
        + `wrong before anybody understood why. Two of ours were hurt getting off the beach. `
        + `Whatever the ${peopleName} thought was happening, it was not what we thought.`,
      days: 0.5,
      hurt: 2,
      moraleDelta: -0.12,
      severity: 'grave',
    };
  }
  if (luck < 0.45) {
    return {
      text: `A few people watched the boat from the trees and would not come down to it. `
        + `The party left a knife and a string of beads on a rock above the tide and pulled `
        + `off. In the morning they were gone and there was a basket of fruit in their place.`,
      days: 0.5,
      freshDays: 5,
      metPeople: true,
      moraleDelta: 0.04,
    };
  }
  return {
    text: `The ${peopleName} came down to the boat, and after a long while of everybody `
      + `standing still, one of them walked into the water and put his hand on the gunwale. `
      + `Nothing was traded and nothing was agreed, and both sides went away knowing the `
      + `other exists, which is more than either knew this morning.`,
    days: 0.6,
    metPeople: true,
    moraleDelta: 0.07,
  };
}
