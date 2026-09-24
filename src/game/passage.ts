import { NM, haversine } from '../core/math';
import { isLand } from '../world/landmass';
import { PORTS, anchorageOf, type PortDef } from '../world/ports';
import type { SeaEvent } from './seaEvents';
import type { Game } from './state';

/**
 * The questions a passage actually turns on.
 *
 * The sim already models the things a pilot of 1490 argued about at the chart
 * table: where the calm belt lies this month, which side of it the south-east
 * trade will head her, the Cape in the winter westerlies, and how many days of
 * water are left against how many days of sea. None of it reached the player
 * as a choice. The watch trimmed and steered and he wound up the clock.
 *
 * These put each one to him once, at the point on the passage where it has to
 * be decided, with the officers arguing their side of it (game/counsel). Each
 * choice changes the route or the ration — something the sim then plays out —
 * rather than moving a number the player never sees.
 */

export interface PassageRecord {
  doldrumsT: number;
  capeT: number;
  waterT: number;
}

export function newPassageRecord(): PassageRecord {
  return { doldrumsT: -1e12, capeT: -1e12, waterT: -1e12 };
}

const DAY = 86400;

/** Destinations inside the Gulf of Guinea, where the coast road is the right one. */
function inTheBight(d: { lat: number; lon: number }): boolean {
  return d.lat > -3 && d.lat < 8 && d.lon > -9 && d.lon < 12;
}

/** Destinations round the Cape — the Indian Ocean. */
function pastTheCape(d: { lat: number; lon: number }): boolean {
  return d.lon > 21 && d.lat < 30;
}

/** A mark in open water, nudged seaward until it is not on the land. */
function seaMark(lat: number, lon: number): { lat: number; lon: number } {
  let p = { lat, lon };
  for (let i = 0; i < 8 && isLand(p); i++) p = { lat: p.lat - 0.3, lon: p.lon - 0.3 };
  return p;
}

/**
 * Where to cross the line.
 *
 * Asked a few degrees short of the calm belt, southbound, with a mark laid
 * beyond it. The belt's latitude is this season's; the advice in the text is
 * what the Guinea pilots actually told each other.
 */
export function doldrumsScene(g: Game): SeaEvent | null {
  const dest = g.destination;
  if (!dest) return null;
  const pos = g.nav.estimated;
  const belt = g.calmBeltLatitude();
  if (pos.lat < belt + 3 || pos.lat > belt + 8) return null;
  if (dest.lat > pos.lat - 6) return null;
  if (pos.lon < -40 || pos.lon > 5) return null;

  const beltN = Math.round(belt + 3);
  const beltS = Math.round(belt - 3);
  const westLon = -24;
  const west = seaMark(belt - 6, westLon);
  const coast = seaMark(3.9, -7.9);
  const bight = inTheBight(dest);

  return {
    id: 'passage:doldrums',
    council: true,
    title: 'Where to cross the line',
    severity: 'note',
    text: `The pilot has the chart out on the capstan head. The calms lie across the whole `
      + `ocean ahead of her, from about ${beltN}° north down to ${beltS}°, this month — `
      + `a belt of dead air and thunder squalls that has kept better ships than this one `
      + `rolling in the swell for a month.\n\n`
      + `Where she goes through it is a choice, and it is the last one that will be easy `
      + `to change.`,
    facts: { bight: bight ? 1 : 0, south: dest.lat < -3 ? 1 : 0 },
    choices: [
      {
        label: `Stand away west, and cross near ${Math.abs(westLon)}° west`,
        detail: 'A long board out into the ocean. Beyond the calms the south-east trade '
          + 'heads a ship off the African shore; from out here she can lie south on it.',
        resolve: (g2) => {
          g2.insertWaypointAhead('Crossing of the line', west.lat, west.lon);
          return 'Bore away to the westward to take the calms where the pilots say they '
            + 'are narrowest, and to have the trade on the beam beyond them instead of '
            + 'in her teeth.';
        },
      },
      {
        label: 'Keep in with the coast and take the Guinea current',
        detail: 'Down past Serra Leoa to Cabo das Palmas, then east with the current '
          + 'under her. The road to Mina. Wrong for anywhere south.',
        resolve: (g2) => {
          g2.insertWaypointAhead('Offing of Cabo das Palmas', coast.lat, coast.lon);
          return 'Kept her in toward the coast, for the land breezes at night and the '
            + 'current along the shore.';
        },
      },
      {
        label: 'Stand on as she is',
        detail: 'The straight line through. Fewest miles on the chart.',
        resolve: () => 'Held the course laid. The calms are the calms wherever you meet them, '
          + 'the master says, and there is no sense sailing extra leagues to find out.',
      },
    ],
  };
}

/**
 * The Cape: wide into the westerlies, or close under the land.
 *
 * Asked coming down the south-west coast of Africa with a mark laid beyond
 * the Cape. Summer and a sound ship want the short road; winter, or a ship
 * that will not stand a lee shore, want the long one.
 */
export function capeScene(g: Game): SeaEvent | null {
  const dest = g.destination;
  if (!dest || !pastTheCape(dest)) return null;
  const pos = g.nav.estimated;
  if (pos.lat > -24 || pos.lat < -33.5) return null;
  if (pos.lon < -5 || pos.lon > 18.5) return null;

  const doy = g.clock.dayOfYear;
  const winter = doy > 121 && doy < 274;
  const wide = seaMark(-39.5, 20);
  const close = seaMark(-35.4, 20.2);

  return {
    id: 'passage:cape',
    council: true,
    title: 'The Cape',
    severity: 'warning',
    text: `The Cape lies somewhere to the south and east — Dias called it the Cape of `
      + `Storms before the King renamed it, and he had reasons. It is ${winter ? 'winter' : 'summer'} `
      + `down here.\n\n`
      + `Close under the land is the short road, with the Agulhas current against her and `
      + `a lee shore under her if it blows from the west. Wide is a week longer, down in `
      + `the westerlies where there is nothing to hit and a great deal of sea.`,
    facts: { winter: winter ? 1 : 0 },
    choices: [
      {
        label: 'Stand south into the westerlies and round it wide',
        detail: 'Down to forty degrees and run east. Longer, colder, and nothing to hit.',
        resolve: (g2) => {
          g2.insertWaypointAhead('Southing of the Cape', wide.lat, wide.lon);
          return 'Stood away to the southward to give the Cape a wide berth, with the '
            + 'westerlies to carry her round.';
        },
      },
      {
        label: 'Round close under the land',
        detail: 'The shortest way round. Fine in a summer easterly; a death trap in a '
          + 'winter gale from the west.',
        resolve: (g2) => {
          g2.insertWaypointAhead('Off Cabo das Agulhas', close.lat, close.lon);
          return 'Laid her for the Cape itself, to round it close and save the week.';
        },
      },
    ],
  };
}

/** Days of water left at the present ration. */
export function waterDays(g: Game): number {
  return g.crew.provisions.water / Math.max(g.ration, 0.1);
}

/** Days still to run to the mark, at a pessimistic four knots over the ground. */
export function daysToMark(g: Game): number | null {
  const dest = g.destination;
  if (!dest) return null;
  let nm = haversine(g.nav.estimated, dest) / NM;
  for (let i = 1; i < g.route.length; i++) nm += haversine(g.route[i - 1], g.route[i]) / NM;
  return nm / (4 * 24);
}

/** The nearest port she knows of where the casks can be filled, not the one she is bound for. */
function wateringPlace(g: Game, maxDays: number): { def: PortDef; days: number } | null {
  const dest = g.destination;
  let best: { def: PortDef; days: number } | null = null;
  for (const def of PORTS) {
    if (def.refit < 0.5) continue;
    if (!def.known && !g.chart.ports.has(def.id)) continue;
    if (dest && dest.lat === def.lat && dest.lon === def.lon) continue;
    const days = haversine(g.nav.estimated, anchorageOf(def)) / NM / (4 * 24);
    if (days > maxDays) continue;
    if (!best || days < best.days) best = { def, days };
  }
  return best;
}

/**
 * Stretch the water or go for more.
 *
 * Asked when the casks will not reach the mark with a margin. The old game
 * let water reach zero with nothing surfaced but a dwindling number.
 */
export function waterScene(g: Game): SeaEvent | null {
  const need = daysToMark(g);
  if (need === null || need < 6) return null;
  const have = waterDays(g);
  if (have > need * 1.3 || have > 50) return null;

  const place = wateringPlace(g, have * 0.75);
  const short = g.ration > 0.75;
  const choices: NonNullable<SeaEvent['choices']> = [];
  if (place) {
    const at = anchorageOf(place.def);
    choices.push({
      label: `Bear away for ${place.def.name} and water there`,
      detail: `About ${Math.max(1, Math.round(place.days))} days off. Time lost, and the `
        + 'men will drink as much as they like.',
      resolve: (g2) => {
        g2.insertWaypointAhead(place.def.name, at.lat, at.lon, place.def.id);
        return `Bore away for ${place.def.name} to fill the casks.`;
      },
    });
  }
  if (short) {
    choices.push({
      label: 'Put the company on short water',
      detail: 'Two-thirds of a ration. It will reach, and they will hate you for every day of it.',
      resolve: (g2) => {
        g2.ration = 0.67;
        return 'Put the ship’s company on two-thirds of water. The scuttlebutt is under a '
          + 'sentry now.';
      },
    });
  }
  choices.push({
    label: 'Stand on and trust to the rain',
    detail: 'Spread the sails at every squall. Sometimes it rains.',
    resolve: () => 'Stood on. Every man with a pot has been told to have it ready.',
  });
  if (choices.length < 2) return null;

  return {
    id: 'passage:water',
    council: true,
    title: 'The water',
    severity: 'warning',
    text: `The master has sounded the casks. ${Math.round(have)} days of water at `
      + `${g.ration >= 0.99 ? 'full ration' : 'this ration'}, and ${Math.round(need)} or so still `
      + `to run by the pilot’s reckoning — more if the wind does not serve.\n\n`
      + `It is the kind of arithmetic that decides whether a ship comes home.`,
    facts: { have, need, port: place ? 1 : 0 },
    choices,
  };
}

/**
 * Called from the passage loop. Returns at most one scene, at most once per
 * question per stretch of sea.
 */
export function passageQuestion(g: Game, rec: PassageRecord): SeaEvent | null {
  const t = g.clock.t;
  if (t - rec.waterT > 12 * DAY) {
    const s = waterScene(g);
    if (s) { rec.waterT = t; return s; }
  }
  if (t - rec.doldrumsT > 40 * DAY) {
    const s = doldrumsScene(g);
    if (s) { rec.doldrumsT = t; return s; }
  }
  if (t - rec.capeT > 60 * DAY) {
    const s = capeScene(g);
    if (s) { rec.capeT = t; return s; }
  }
  return null;
}
