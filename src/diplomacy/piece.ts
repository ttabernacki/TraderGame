import { Rng } from '../core/rng';
import type { Game } from '../game/state';
import type { NewMark } from './marks';
import type { BookEntry } from './book';
import type { PolityDef } from './polities';

/**
 * A set piece: one small game played at a court, or by letter on the road.
 *
 * Every piece has the same shape so the Table and the UI need know nothing of
 * its rules. State is plain JSON (a piece can span days, and must survive a
 * save in the middle). The only randomness is the run's own seed, set at
 * `start`, so a loaded piece is the same piece. Every piece has a way to win,
 * to half-win and to fail forward; none ends in a dice roll at the verdict.
 */

export type Grade = 'win' | 'half' | 'fail';

/** What the UI shows: lines of narration and the verbs open to the player now. */
export interface PieceView {
  title: string;
  lines: { who: 'narrator' | 'them' | 'you'; text: string }[];
  choices: { id: string; label: string; hint?: string; disabled?: boolean }[];
}

export interface Outcome {
  grade: Grade;
  line: string;
  marks: NewMark[];
  measures?: { trust?: number; respect?: number; interest?: number };
  book?: Omit<BookEntry, 'id' | 'polity' | 't'>[];
  /** Cash gained or spent, in cruzados. */
  gold?: number;
  /** Moves in the court's own voices, by what each cares about (trade, faith, war, custom). */
  factions?: Partial<Record<'trade' | 'faith' | 'war' | 'custom', number>>;
  /** Other courts the outcome touches (a go-between answers to both). */
  also?: { polity: string; marks: NewMark[]; measures?: { trust?: number; respect?: number; interest?: number } }[];
  /** For an audience: how the presents were taken. */
  gift?: { value: number; loved: boolean; scorned: boolean };
}

export interface PieceScene {
  title: string;
  text: string;
  choices: { id: string; label: string; detail: string }[];
}

export interface PieceCtx {
  g: Game;
  polity: PolityDef;
  port: string;
  rng: Rng;
}

export interface Piece<S = any> {
  id: string;
  title: string;
  /** Whether it may be offered now at this court. */
  available(g: Game, polity: PolityDef): boolean;
  start(ctx: PieceCtx): S;
  view(ctx: PieceCtx, state: S): PieceView;
  /**
   * Passages only: called as the days pass. May return a scene to put to the
   * captain; its choices come back through `step` as `c.id`. Return null for
   * "nothing yet". A passage also ends here if the world has moved on.
   */
  beat?(ctx: PieceCtx, state: S, days: number): { state: S; scene?: PieceScene; outcome?: Outcome } | null;
  /** Returns the new state and, when the piece is over, its outcome. */
  step(ctx: PieceCtx, state: S, choice: string): { state: S; outcome?: Outcome };
}

export interface PieceRun {
  id: number;
  pieceId: string;
  polity: string;
  port: string;
  seed: number;
  started: number;
  state: unknown;
  /** Set once resolved; kept so the ledger can say what came of it. */
  outcome?: { grade: Grade; line: string; t: number };
}

export interface PiecesState {
  runs: PieceRun[];
  nextId: number;
}

export function newPieces(): PiecesState {
  return { runs: [], nextId: 1 };
}
