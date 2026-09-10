/**
 * How much of the ship the player is expected to work himself.
 *
 * A caravel is worked by two dozen men and a captain is not one of them. He
 * decides where she goes, what she carries, when to press her and when to take
 * canvas off — and everything below that is somebody else's job. The hard mode
 * hands him the sheets anyway, because doing it yourself once is how you learn
 * what the crew are actually doing for you; the easy mode gives it back.
 *
 * Nothing here touches the world. The wind is the same wind, the scurvy is the
 * same scurvy and the reckoning is exactly as wrong either way — the only thing
 * that changes is how much of the ship's routine work the player does with his
 * own hands.
 */

export type Difficulty = 'watch' | 'captain';

export interface DifficultyDef {
  id: Difficulty;
  name: string;
  english: string;
  blurb: string;
  /** Degrees of wander the crew settle for at the worst, and at the best. */
  slopWorst: number;
  slopBest: number;
  /** Multiplies how fast they get the yards where they want them. */
  trimRate: number;
  /**
   * Multiplies how fast the sails come across on a tack.
   *
   * This is the single biggest thing standing between the player and a course
   * change. Dipping a lateen yard round the forward side of the mast really did
   * take a hundred seconds and every hand aboard, and she makes almost no drive
   * while it is happening — which is true, and is also a minute of watching
   * nothing at all. The relaxed setting keeps the manoeuvre and shortens the
   * wait.
   */
  handRate: number;
  /**
   * Whether the crew brace the yard to its new angle *while* it is coming
   * across, so it draws the moment it is over rather than starting a fresh
   * minute of trimming afterwards. A real crew do this; only a modelling
   * convenience ever stopped them.
   */
  trimWhileShifting: boolean;
  /**
   * The watch takes canvas off her before she is over-pressed, and makes it
   * again when the squall has gone through.
   */
  autoCanvas: boolean;
  /** Whether the sheets start in the crew's hands. */
  autoTrim: boolean;
}

export const DIFFICULTIES: DifficultyDef[] = [
  {
    id: 'watch',
    name: 'The watch has her',
    english: 'Relaxed',
    blurb:
      'The mestre and the hands work the ship the way they actually did. The yards '
      + 'are kept where they draw best and braced round as they come, so she is '
      + 'over and drawing in about fifteen seconds instead of standing there for '
      + 'the best part of two minutes; and the watch shortens sail before a squall '
      + 'takes a spar out of her, then makes it again when the sky clears. You '
      + 'decide the course, the cargo and when to press her. The wind, the '
      + 'reckoning, the scurvy and the sea are exactly the same.',
    slopWorst: 2.2,
    slopBest: 0.4,
    trimRate: 3.2,
    handRate: 6,
    trimWhileShifting: true,
    autoCanvas: true,
    autoTrim: true,
  },
  {
    id: 'captain',
    name: 'You have the sheets',
    english: 'Full',
    blurb:
      'You trim the yards yourself and you carry what canvas you judge she will '
      + 'bear. Hand the sheets to the watch with T when you want them, and take '
      + 'them back with Q and E — but a crew of no great seamanship settle for a '
      + 'rougher trim than you would, and nobody will shorten sail unless you say '
      + 'so. Losing a mast because you carried too much in a rising wind is then '
      + 'entirely your affair, which is the point.',
    slopWorst: 9,
    slopBest: 1.2,
    trimRate: 1,
    handRate: 1,
    trimWhileShifting: false,
    autoCanvas: false,
    autoTrim: true,
  },
];

export function difficultyDef(id: Difficulty): DifficultyDef {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[0];
}
