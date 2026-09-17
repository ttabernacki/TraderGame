import { NM, haversine } from '../core/math';
import type { Game } from './state';

/**
 * The first voyage, with the pilot talking.
 *
 * Every game of this kind has to solve the problem that its first ten minutes
 * are a wall: a quadrant, a traverse board, a lead line, a market, a wardroom
 * and a chart that is deliberately wrong, none of which explains itself. The
 * usual answers are a wall of tooltips or a separate tutorial mode that is not
 * the game.
 *
 * This is neither. It is a commission — the real first commission, worth real
 * money, with real objectives — sailed with a pilot aboard who tells the new
 * captain what to do next, because that is exactly what happened. A fidalgo's
 * son given his first command did not know how to find a latitude; the
 * *piloto* did, and was paid to say so, and every roteiro of the period is a
 * professional explaining the route to somebody who has not sailed it. So the
 * teaching is in the fiction rather than laid over it, and when the voyage is
 * discharged the pilot simply stops narrating and the game continues, because
 * by then the captain has done all of it once.
 *
 * The voyage is the right one. Lisbon to Funchal is a week of fair wind and
 * teaches nothing except how to work the ship, which is the point of putting it
 * first. Funchal home is the whole problem of the Atlantic in miniature: the
 * wind that carried you down blows dead against the way back, and the answer —
 * stand out north-west, away from Portugal, until the wind changes hands — is
 * completely counter-intuitive and is the single piece of knowledge the entire
 * carreira was built on. A captain who has made the Azores leg once has the
 * volta do mar in his hands, and can be trusted with Guinea.
 */

export interface TutorialStep {
  id: string;
  /** Who is speaking. The pilot for navigation, the master for the ship. */
  from: string;
  /** The short instruction, which is also the panel's title. */
  task: string;
  /** What he actually says. */
  says: string;
  /** True once the captain has done it. */
  done: (g: Game) => boolean;
  /**
   * Skip the step entirely when this is already true on arrival — so a player
   * who happens to do things in a different order is never told to do
   * something he has done.
   */
  skipIf?: (g: Game) => boolean;
}

const at = (g: Game, id: string) => g.dockedAt === id;
const been = (g: Game, id: string) => g.visitedPorts.has(id);
const bound = (g: Game, id: string) => g.destination !== null
  && g.route.some((r) => r.portId === id);

export const TUTORIAL: TutorialStep[] = [
  {
    id: 'commission',
    from: 'The Contador of the Casa da Guiné',
    task: 'Take the commission at court',
    says: 'The King grants commissions and the Casa keeps the accounts, and until you have '
      + 'one of the first you will get nothing from the second. Take what is offered. It is '
      + 'a short voyage and the Casa gives it to men it has not made up its mind about.',
    done: (g) => g.crown.patent !== null,
  },
  {
    id: 'sail',
    from: 'Brás de Sousa, master',
    task: 'Get her under way — W to make sail',
    says: 'She will not go anywhere with her canvas in the buntlines. W sets more sail and S '
      + 'takes it in, and she carries all of it in this weather. You will feel her come alive '
      + 'under you when the courses fill; that is the only instrument on this ship that never '
      + 'lies to you.',
    done: (g) => g.ship.canvasSet > 0.5 && !g.dockedAt,
  },
  {
    id: 'course',
    from: 'Rui Correia, pilot',
    task: 'Lay off a course for Funchal — C for the chart',
    says: 'Open the chart and lay off a course for Funchal. It is five hundred miles to the '
      + 'south-west and the wind here blows from the north-east all summer, so it will put you '
      + 'there without your having to think about it. Nothing on this voyage out will be '
      + 'difficult. That is deliberate, and it is not the half of the voyage the Casa is '
      + 'interested in.',
    done: (g) => bound(g, 'funchal') || at(g, 'funchal') || been(g, 'funchal'),
  },
  {
    id: 'clock',
    from: 'Brás de Sousa, master',
    task: 'Wind the clock on — the arrows by the rate',
    says: 'A passage is weeks, not minutes. The arrows either side of the rate wind the ship\'s '
      + 'clock on, and it will ease itself back down whenever something happens that you ought '
      + 'to be awake for — land, a sail, weather. Let her run.',
    done: (g) => g.clock.scaleIndex >= 4,
  },
  {
    id: 'reckoning',
    from: 'Rui Correia, pilot',
    task: 'Look at the reckoning — C, and read the plot',
    says: 'Look at where the chart says we are. It is not where we are. I lay off the course '
      + 'steered and the distance run every watch and the errors build up in it, and by Madeira '
      + 'it will be twenty miles out and I will not know in which direction. Every pilot in '
      + 'Europe works this way and every one of them is wrong by about that much.',
    done: (g) => g.seenChart,
    skipIf: (g) => g.seenChart,
  },
  {
    id: 'sight',
    from: 'Rui Correia, pilot',
    task: 'Take a latitude at noon — N for the quadrant',
    says: 'This is the one thing that puts the reckoning right. At noon the sun is at its '
      + 'highest and due south of us; take its altitude with the quadrant and the tables give '
      + 'you the latitude within a few miles. Latitude only — nobody on earth can find a '
      + 'longitude and nobody will for another two hundred and sixty years. Half of what this '
      + 'ship does is sailing down a latitude until the land comes up.',
    done: (g) => g.nav.fixes.length > 0,
  },
  {
    id: 'funchal',
    from: 'Rui Correia, pilot',
    task: 'Make Funchal',
    says: 'Hold her south-west and watch for the island. Madeira stands six thousand feet out '
      + 'of the water and you will see it a long way before you see the town. When the land is '
      + 'up, take a cast of the lead — G — before you stand in, every time, for the rest of '
      + 'your life.',
    done: (g) => at(g, 'funchal') || been(g, 'funchal'),
  },
  {
    id: 'sugar',
    from: 'The factor at Funchal',
    task: 'Load 25 arrobas of sugar',
    says: 'Sugar is what this island is, and the Casa wants it in Lisbon. Buy it in the market. '
      + 'Watch the price as you take it: a town has only so much to sell and the price climbs '
      + 'as you empty the warehouse, which is true of every port in this game and is most of '
      + 'the difference between a rich captain and a busy one.',
    done: (g) => g.ship.quantityOf('acucar') >= 25,
  },
  {
    id: 'water',
    from: 'Brás de Sousa, master',
    task: 'Water and victual her before you sail',
    says: 'Fill the casks and buy what fresh food there is. The way home is longer than the way '
      + 'out — a great deal longer, whatever the chart looks like — and men who run out of '
      + 'water do not get another chance to think about it. Fresh food holds off the scurvy; '
      + 'salt meat does not.',
    done: (g) => g.crew.provisions.water >= 55 || (!g.dockedAt && been(g, 'funchal')),
  },
  {
    id: 'volta',
    from: 'Rui Correia, pilot',
    task: 'Lay off a course for Angra, in the Azores',
    says: 'Now the part you were sent for. Lisbon is north-east of us and the wind is in the '
      + 'north-east, so you cannot go there — you would beat for two months and arrive with a '
      + 'dead crew. What you do instead is stand away to the north-west, out into the ocean, '
      + 'away from where you want to be, until you are up past the Azores and the wind comes '
      + 'round behind you. Lay off Angra, in Terceira. Every pilot will tell you this and no '
      + 'man believes it until he has done it.',
    done: (g) => bound(g, 'angra') || at(g, 'angra') || been(g, 'angra'),
  },
  {
    id: 'standing-out',
    from: 'Rui Correia, pilot',
    task: 'Stand out to the north-west and keep standing',
    says: 'Hold her north-west and do not lose your nerve when Portugal goes further away every '
      + 'day. Somewhere north of thirty-five the north-easterly falls away and the westerlies '
      + 'take you, and from there home is a run with the wind over the quarter. This is the '
      + 'volta do mar. It is the reason there is a Portuguese empire and not a Portuguese '
      + 'shipwreck, and it is a fortnight of sailing in the wrong direction on purpose.',
    done: (g) => g.ship.state.pos.lat > 34.5 || at(g, 'angra') || been(g, 'angra'),
    skipIf: (g) => been(g, 'angra'),
  },
  {
    id: 'angra',
    from: 'Rui Correia, pilot',
    task: 'Make Angra',
    says: 'Terceira is a small island in a large ocean and you are finding it on a latitude and '
      + 'a guess. Run down the parallel and keep a man at the masthead. Every homeward fleet '
      + 'for the next century will do exactly this, and a good many of them will not find it '
      + 'first time either.',
    done: (g) => at(g, 'angra') || been(g, 'angra'),
  },
  {
    id: 'home',
    from: 'Brás de Sousa, master',
    task: 'Carry her home to Lisbon',
    says: 'Eight hundred miles east with the westerlies behind you and the worst of it is the '
      + 'boredom. You have the wind, the cargo and a crew who have now done the thing that '
      + 'frightened them. Take her home.',
    done: (g) => at(g, 'lisboa') && been(g, 'angra'),
  },
  {
    id: 'report',
    from: 'The Contador of the Casa da Guiné',
    task: 'Report at court and discharge the commission',
    says: 'Go up to the court and render your account. The cargo is weighed, the commission is '
      + 'discharged, and what you did on the way is entered on the padrão real — which is the '
      + 'only record that decides what you are trusted with next. Everything after this is the '
      + 'same voyage, further south, with nobody left who has been there.',
    done: (g) => g.crown.completedPatents.length > 0,
  },
];

/** Where the tutorial has got to, and whether it is running at all. */
export interface TutorialState {
  on: boolean;
  at: number;
  finished: boolean;
}

export function newTutorial(): TutorialState {
  return { on: true, at: 0, finished: false };
}

/**
 * Advance the pilot.
 *
 * Called every update. Steps that are already satisfied when they come up are
 * skipped silently rather than being announced and immediately ticked, which is
 * what makes a player who does things out of order feel like the game is
 * watching him rather than reciting at him.
 */
export function stepTutorial(g: Game): TutorialStep | null {
  const t = g.tutorial;
  if (t.finished) return null;

  // The commission being discharged ends him, whatever step he is on.
  //
  // Walking off the end of the list used to be the only way to finish, which
  // meant a captain who skipped a step — never opened the chart, never bought
  // the sugar because he already had some — kept a pilot offering instructions
  // for a voyage that was over. The voyage ending is the ending.
  if (g.crown.completedPatents.length > 0) {
    finish(g);
    return null;
  }
  if (!t.on) return null;

  let guard = 0;
  while (t.at < TUTORIAL.length && guard++ < TUTORIAL.length + 1) {
    const step = TUTORIAL[t.at];
    if (step.skipIf?.(g) || step.done(g)) {
      t.at++;
      continue;
    }
    return step;
  }
  finish(g);
  return null;
}

/** He stops talking, once, and says why. */
function finish(g: Game): void {
  if (g.tutorial.finished) return;
  g.tutorial.finished = true;
  g.tutorial.on = false;
  g.logEvent('note',
    'The pilot has stopped explaining things, which from Rui Correia is the nearest thing '
    + 'to a compliment you are going to get. You have made a landfall on an island in the '
    + 'open ocean, found a latitude by observation, and come home by standing away from '
    + 'home until the wind changed hands. The rest of it is the same, further south.', true);
  g.pushAlert('The pilot has nothing more to teach you.', 'note');
}

/** How far through the first voyage the captain is, for the panel. */
export function tutorialProgress(g: Game): { at: number; of: number } {
  return { at: Math.min(g.tutorial.at, TUTORIAL.length), of: TUTORIAL.length };
}

/** Distance and bearing to the thing the current step is about, where there is one. */
export function tutorialMark(g: Game, step: TutorialStep): string | null {
  const port = step.id === 'funchal' || step.id === 'sugar' || step.id === 'water'
    ? 'funchal'
    : step.id === 'angra' || step.id === 'volta' || step.id === 'standing-out' ? 'angra'
      : step.id === 'home' || step.id === 'report' ? 'lisboa' : null;
  if (!port) return null;
  const charted = g.chart.ports.get(port);
  if (!charted) return null;
  const d = haversine(g.nav.estimated, { lat: charted.lat, lon: charted.lon }) / NM;
  return `${d.toFixed(0)} miles by the reckoning`;
}
