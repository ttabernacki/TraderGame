import { clamp } from '../core/math';
import type { Landmark } from '../progression/crown';
import type { SeaEvent } from './seaEvents';
import type { Game } from './state';

/**
 * What a captain does at the edge of the known world.
 *
 * The landmarks are the peaks of the whole game — Bojador, the line, the Cape,
 * the Indian Ocean, India — and reaching one used to resolve into a log entry,
 * an alert, and seven per cent of morale. Eighty years of Portuguese effort and
 * the player's own three-month passage arrived as a toast notification.
 *
 * Each is now a scene with the same three questions under it, because those are
 * the three things a captain at a new headland actually had to weigh, and they
 * trade against each other:
 *
 *   - **Claim it.** A pillar, the arms of Portugal, and the place is entered on
 *     the padrão real under your name. It is also a signpost: the other man
 *     reads it when he gets here, and it tells the Casa exactly how far you got
 *     and when.
 *   - **Look at it.** Boats in, water and greenstuff aboard, the people met if
 *     there are any, the soundings taken properly. Costs a day or two of a
 *     margin you may not have, and it is the only way the coast gets *known*
 *     rather than merely passed.
 *   - **Press on.** Nothing spent. Renown at a discount, because a headland you
 *     saw from twelve miles off in failing light is a headland you reported
 *     rather than surveyed — and the men wanted to land.
 *
 * None of them is correct. A captain low on water who claims and surveys
 * everything dies at sea with a very good chart.
 */

export function landmarkScene(g: Game, l: Landmark): SeaEvent {
  const stones = g.crown.padraoStock;
  const carries = g.ship.upgrades.includes('padroes');
  const water = g.crew.provisions.water;
  const thin = water < 30;

  return {
    id: `landmark:${l.id}`,
    title: l.name,
    severity: 'note',
    text: l.announce,
    choices: [
      {
        label: stones > 0
          ? 'Land a padrão and claim it'
          : carries ? 'No stone left to land' : 'You carry no pillars',
        detail: stones > 0
          ? 'The arms of Portugal on the headland, and your name under them. Everyone who comes after will read it.'
          : carries
            ? 'The pillars were all set up further north. You cannot claim what you cannot mark.'
            : 'Cut limestone, carved with the arms, shipped at Lisbon. You did not take any. A headland you cannot mark is a headland somebody else will.',
        resolve: (gg) => {
          if (gg.crown.padraoStock <= 0) {
            return 'There is no stone left in the hold. The carpenter offers to cut something out '
              + 'of a spare spar and is told, with some feeling, that a wooden padrão is worse '
              + 'than none.';
          }
          gg.crown.padraoStock -= 1;
          gg.crown.padroesRaised += 1;
          gg.crown.record('padrao', `Padrão at ${l.name}`, gg.nav.estimated, Math.round(l.value * 0.4), gg.clock.t);
          gg.crown.standing += Math.round(l.value * 0.5);
          gg.crown.progressObjective('padrao', undefined, 1);
          // Reaching it is reaching it however you mark it: a commission to
          // make this headland must not fail because you claimed it as well.
          gg.crown.progressObjective('reach', l.id);
          gg.crew.morale = clamp(gg.crew.morale + 0.1, 0, 1);
          // A pillar is a signpost, and he can read.
          gg.rival.frontierLat = Math.min(gg.rival.frontierLat, l.lat + 1.5);
          return `The stone goes up on the highest ground the boats can reach it, and the chaplain `
            + 'says a mass beside it with the whole ship’s company standing in the surf. It '
            + 'will be there in five hundred years. It will also tell the next Portuguese ship '
            + 'down this coast precisely how far you got, and when, and in what.';
        },
      },
      {
        label: 'Stand in and look at it properly',
        detail: thin
          ? `Two days. You have ${water.toFixed(0)} days of water, which makes this expensive.`
          : 'Two days. Boats in, water and greenstuff aboard, the soundings taken, and whoever lives here met.',
        resolve: (gg) => {
          gg.clock.t += 2 * 86400;
          gg.crew.provisions.water = Math.min(120, gg.crew.provisions.water + 14);
          gg.crew.provisions.fresh = Math.min(90, gg.crew.provisions.fresh + 16);
          gg.crew.daysWithoutFresh = 0;
          gg.crew.daysSinceLandfall = 0;
          gg.crew.morale = clamp(gg.crew.morale + 0.16, 0, 1);
          gg.crew.fatigue = clamp(gg.crew.fatigue - 0.12, 0, 1);
          gg.crown.record('coast', l.name, gg.nav.estimated, l.value, gg.clock.t);
          gg.crown.progressObjective('reach', l.id);
          gg.chartedThisPassage += 40;
          gg.crown.chartedSincePatent += 40;
          // A landfall on something this size is a fix, and a good one.
          gg.nav.sigmaLat = Math.min(gg.nav.sigmaLat, 4);
          gg.nav.sigmaLon = Math.min(gg.nav.sigmaLon, 12);
          return 'Two days at anchor under the headland. The boats bring off water and a quantity '
            + 'of something green that nobody can name and everybody eats. The bearings are taken '
            + 'from three positions and the whole thing goes onto the sheet properly, and for the '
            + 'first time in weeks the pilot knows where the ship is to within a few miles.';
        },
      },
      {
        label: 'Note it and press on',
        detail: 'Nothing spent. The commission is what you are out here for, and it is not this.',
        resolve: (gg) => {
          gg.crown.record('coast', l.name, gg.nav.estimated, Math.round(l.value * 0.6), gg.clock.t);
          gg.crown.progressObjective('reach', l.id);
          gg.crew.morale = clamp(gg.crew.morale - 0.04, 0, 1);
          return 'The bearing is taken, the name written in, and she never alters course. The men '
            + 'watch it go by on the beam and there is a good deal of talk on the forecastle about '
            + 'captains who will not let a boat down for two hours after ninety days at sea.';
        },
      },
    ],
  };
}

/**
 * The furthest south any Christian has been.
 *
 * Fires once, the first time the ship passes the deepest latitude in the
 * Portuguese record — which is the moment the whole enterprise is about, and
 * the only one where the *crew* get a vote on whether to keep going.
 */
export function beyondScene(g: Game): SeaEvent {
  const lat = Math.abs(g.ship.state.pos.lat);
  return {
    id: 'landmark:beyond',
    title: 'Further than anyone',
    severity: 'note',
    text:
      `By the reckoning she is at ${lat.toFixed(1)}° south, and that is further than any `
      + 'ship out of Lisbon has ever been. There is no rutter for this. There is no chart, no '
      + 'sailing direction, no man alive who has seen this water, and nothing ahead but whatever '
      + 'is ahead. The boatswain has told the hands and the hands have gone very quiet, and '
      + 'somebody aft is waiting for you to say something.',
    choices: [
      {
        label: 'Tell them what it means',
        detail: 'Name it for what it is. They came a long way to be here.',
        resolve: (gg) => {
          gg.crew.morale = clamp(gg.crew.morale + 0.18, 0, 1);
          gg.crew.unrest = clamp(gg.crew.unrest - 0.25, 0, 2);
          gg.crown.standing += 10;
          return 'You tell them where they are, and that nobody has ever been here, and that every '
            + 'one of their names is in the book against it. The wine is broken out at four in the '
            + 'afternoon on a Tuesday for no reason the Casa would accept. It is the best hour of '
            + 'the voyage and everybody aboard knows it while it is happening.';
        },
      },
      {
        label: 'Say nothing and hold the course',
        detail: 'Men who are thinking about how far from home they are do not work the ship.',
        resolve: (gg) => {
          gg.crew.unrest = clamp(gg.crew.unrest + 0.15, 0, 2);
          return 'You give the helmsman the course and go below. It is entered in the log in one '
            + 'line. The hands work it out among themselves within a day, as they always do, and '
            + 'are left to decide on their own what it means, which is how a ship gets a mood.';
        },
      },
    ],
  };
}
