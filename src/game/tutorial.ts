import type { Game } from './state';

/**
 * The first hour: six verbs, each unlocked by succeeding at the one before.
 *
 * Steer, trim, read the wind, take a sight, enter a port, trade. The pilot says
 * one short line per verb and then shuts up until the captain has done it; the
 * next line is never shown early and never lectures. Success is read off game
 * state (or a flag set by the action itself), so a captain who happens to have
 * done a later thing already is not told to do it: satisfied steps are skipped
 * silently.
 *
 * Old saves carried a 13-step tutorial (`at` 0..14). `migrateTutorial` maps
 * that onto the six: finished stays finished, otherwise the position is scaled.
 */

export interface TutorialStep {
  id: string;
  /** Who is speaking. */
  from: string;
  /** The short instruction, which is also the panel's title. */
  task: string;
  /** The one line he says. */
  says: string;
  /** True once the captain has done it. */
  done: (g: Game) => boolean;
}

/** Verbs that have no lasting game state of their own; set by the action. */
export type Verb = 'helm' | 'trim' | 'trade' | 'sailed';

export const TUTORIAL: TutorialStep[] = [
  {
    id: 'steer',
    from: 'Rui Correia, pilot',
    task: 'Weigh and take the helm — A and D',
    says: 'Cast off and put her head where you want it. She answers slowly; give her time.',
    done: (g) => !!g.tutorial.f?.helm,
  },
  {
    id: 'trim',
    from: 'Brás de Sousa, master',
    task: 'Trim the yards — Q and E',
    says: 'Square them up or ease them off. A sail that is full is a sail that is working.',
    done: (g) => !!g.tutorial.f?.trim,
  },
  {
    id: 'wind',
    from: 'Rui Correia, pilot',
    task: 'Read the wind — C for the chart',
    says: 'Look at which way the arrows run. She will go anywhere but into them.',
    done: (g) => g.seenChart,
  },
  {
    id: 'sight',
    from: 'Rui Correia, pilot',
    task: 'Take a sight after dark — N for the quadrant',
    says: 'The pole star gives you your latitude. The reckoning only ever drifts.',
    done: (g) => g.nav.fixes.some((f) => f.body !== 'the land'),
  },
  {
    id: 'port',
    from: 'Brás de Sousa, master',
    task: 'Make a port and let go the anchor',
    says: 'Land is a long way off until the day it is not. Take a cast of the lead before you stand in.',
    done: (g) => !!g.dockedAt && !!g.tutorial.f?.sailed,
  },
  {
    id: 'trade',
    from: 'The factor',
    task: 'Buy or sell something on the quay',
    says: 'A town has only so much to sell, and the price climbs as you empty the shed.',
    done: (g) => !!g.tutorial.f?.trade,
  },
];

/** Where the pilot has got to, and whether he is running at all. */
export interface TutorialState {
  on: boolean;
  /** Index of the verb standing; TUTORIAL.length once all six are done. */
  at: number;
  finished: boolean;
  /** Flags set by the actions themselves. Optional so old saves load. */
  f?: Partial<Record<Verb, boolean>>;
}

export function newTutorial(): TutorialState {
  return { on: true, at: 0, finished: false, f: {} };
}

/** Called by the action that is the verb. Cheap, idempotent. */
export function noteVerb(g: Game, v: Verb): void {
  const t = g.tutorial;
  if (t.finished) return;
  (t.f ??= {})[v] = true;
}

/** Old saves: the 13-step tutorial's position, scaled onto six verbs. */
export function migrateTutorial(old: Partial<TutorialState> | undefined): TutorialState {
  if (!old || old.finished) return { on: false, at: TUTORIAL.length, finished: true, f: {} };
  const at = Math.max(0, Math.min(TUTORIAL.length - 1, Math.floor((old.at ?? 0) * TUTORIAL.length / 15)));
  return { on: old.on ?? true, at, finished: false, f: old.f ?? {} };
}

/**
 * Advance the pilot. Called every update; returns the verb standing, or null.
 * The next verb is only ever returned once the previous is done.
 */
export function stepTutorial(g: Game): TutorialStep | null {
  const t = g.tutorial;
  if (t.finished) return null;
  // Underway at any point counts as having sailed; the port verb needs it.
  if (!g.dockedAt) (t.f ??= {}).sailed = true;
  if (!t.on) return null;

  let guard = 0;
  while (t.at < TUTORIAL.length && guard++ <= TUTORIAL.length) {
    const step = TUTORIAL[t.at];
    if (step.done(g)) {
      t.at++;
      continue;
    }
    return step;
  }
  finish(g);
  return null;
}

/** He stops talking, once. */
function finish(g: Game): void {
  if (g.tutorial.finished) return;
  g.tutorial.finished = true;
  g.tutorial.on = false;
  g.logEvent('note', 'The pilot has stopped explaining things, which from Rui Correia is the nearest '
    + 'thing to a compliment you are going to get.', true);
  g.pushAlert('The pilot has nothing more to teach you.', 'note');
}

/** Nothing to point at any more; kept for the panel. */
export function tutorialMark(_g: Game, _step: TutorialStep): string | null {
  return null;
}
