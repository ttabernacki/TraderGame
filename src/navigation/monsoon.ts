import { monsoonPhase } from '../world/wind';
import { smoothstep, type LatLon } from '../core/math';

/**
 * The monsoon, as a thing the pilot knows rather than a thing the wind does.
 *
 * The wind model has had the monsoon in it from the beginning — the reversal,
 * the two seasons, the dead six weeks of the turning, the currents going round
 * with it — and not one word of it has ever reached the player. That is the
 * worst possible arrangement, because the monsoon is not weather. It is a
 * *timetable*, and it is the timetable the entire Indian Ocean ran on for a
 * thousand years before any Portuguese ship was in it.
 *
 * A pilot at Malindi in 1498 could tell you, without hesitating, that the
 * south-west monsoon would carry you to India in twenty-three days if you left
 * within the month and that if you left late you would spend three months on
 * the passage and bury half your people. Vasco da Gama was told exactly that,
 * was given a pilot who knew it, went out on the right wind, and then came back
 * on the wrong one against advice: the outward passage took twenty-three days,
 * the homeward one took a hundred and thirty-two, and thirty of his men died of
 * scurvy on it. That is the difference this file exists to put in front of the
 * player, in advance, in words.
 *
 * Everything here is read off `monsoonPhase` and the same latitude-longitude
 * mask the wind itself uses, so the pilot is never telling you anything the
 * weather will not then do.
 */

export type MonsoonSeason = 'sw' | 'ne' | 'turning';

export interface MonsoonRead {
  /** How far this water is governed by it, 0 to 1. Below about an eighth, not at all. */
  grip: number;
  /** -1 at the height of the north-east monsoon, +1 at the height of the south-west. */
  phase: number;
  season: MonsoonSeason;
  name: string;
  /** Days until it changes to the other season. */
  daysToTurn: number;
  /** What it will carry a ship, in the words a pilot of that ocean would use. */
  carries: string;
  /** What it will not. */
  against: string;
}

/**
 * How much of this water the monsoon owns.
 *
 * The same mask the wind model blends with, kept in step with it deliberately:
 * if the pilot's advice and the wind ever disagreed about where the monsoon
 * reaches, one of them would be lying and the player would have no way to tell
 * which.
 */
export function monsoonGrip(p: LatLon): number {
  const lonMask = smoothstep(34, 48, p.lon) * (1 - smoothstep(96, 112, p.lon));
  const latMask = smoothstep(-24, -10, p.lat) * (1 - smoothstep(24, 32, p.lat));
  return lonMask * latMask;
}

/** The day of the year the phase next crosses zero, going the other way. */
function daysToNextTurn(dayOfYear: number): number {
  // phase = sin(2π (d - 105) / 365): zero and rising at day 105, zero and
  // falling at 287.5. Those are the two turnings, and they are six weeks of
  // calms and thunderstorms each.
  const turns = [105, 287.5];
  let best = Infinity;
  for (const t of turns) {
    for (const wrap of [-365, 0, 365]) {
      const d = t + wrap - dayOfYear;
      if (d >= 0 && d < best) best = d;
    }
  }
  return best;
}

export function readMonsoon(at: LatLon, dayOfYear: number): MonsoonRead | null {
  const grip = monsoonGrip(at);
  if (grip < 0.12) return null;
  const phase = monsoonPhase(dayOfYear);
  const season: MonsoonSeason = phase > 0.2 ? 'sw' : phase < -0.2 ? 'ne' : 'turning';
  const daysToTurn = daysToNextTurn(dayOfYear);

  if (season === 'sw') {
    return {
      grip, phase, season,
      name: 'South-west monsoon',
      daysToTurn,
      carries: 'Africa to India, and it is the fastest water in the world while it lasts.',
      against: 'Nothing goes west across this sea now. A ship that tries it is three months '
        + 'doing twenty-three days’ work, and buries the men who cannot last that long.',
    };
  }
  if (season === 'ne') {
    return {
      grip, phase, season,
      name: 'North-east monsoon',
      daysToTurn,
      carries: 'India to Africa and down to Sofala. This is the season home.',
      against: 'Nobody crosses eastward against it. The Arab shipping simply stays where it is '
        + 'and does its business until the wind comes round.',
    };
  }
  return {
    grip, phase, season,
    name: phase >= 0 ? 'The monsoon turning to the south-west' : 'The monsoon turning to the north-east',
    daysToTurn,
    carries: 'Nothing. Calms, thunder, and a sea running from the wind that has gone.',
    against: 'Six weeks in which this ocean does not move, and every hull in it is lying in '
      + 'harbour waiting, which is why the harbours are full.',
  };
}

/**
 * The pilot's sentence about it, said once, the first time she is in that water.
 *
 * The same device as the volta do mar: a real piece of seamanship the player
 * will not arrive at by looking at the screen, said out loud, once, by the man
 * whose job it is to know. Being told is not the same as being able to use it.
 */
export function pilotOnTheMonsoon(m: MonsoonRead): string {
  return 'The pilot: "This wind is not weather, senhor, it is a calendar. It blows one way for '
    + 'half the year and the other way for the other half, and every ship in this ocean is '
    + `sailed to it and has been for longer than Portugal has existed. It is the ${m.name.toLowerCase()} `
    + `now, with ${Math.round(m.daysToTurn)} days to run. ${m.carries} ${m.against}"`;
}

/** How a passage on this heading stands with the season, for the warning. */
export function setsAgainst(m: MonsoonRead, courseDeg: number): boolean {
  if (m.season === 'turning') return false;
  const east = Math.sin((courseDeg * Math.PI) / 180);
  // The south-west monsoon carries you east; the north-east carries you west.
  return m.season === 'sw' ? east < -0.45 : east > 0.45;
}
