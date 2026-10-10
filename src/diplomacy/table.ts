import { Rng } from '../core/rng';
import type { Game } from '../game/state';
import { learn } from './book';
import { writeMark } from './marks';
import type { Outcome, Piece, PieceCtx, PieceRun, PieceView } from './piece';
import { POLITY_BY_ID } from './polities';
import { PIECES } from './pieces';

/**
 * The Table: starts a piece, steps it, resolves it into marks, measures and
 * Book entries, and files the result. The one place a piece touches the game.
 */

export function pieceById(id: string): Piece | undefined {
  return PIECES.find((p) => p.id === id);
}

function ctxOf(g: Game, run: PieceRun): PieceCtx | null {
  const polity = POLITY_BY_ID.get(run.polity);
  if (!polity) return null;
  // The run's own stream, advanced by the steps taken so far, so a loaded game
  // continues the same piece. Pieces draw from it only in `start` and `step`.
  return { g, polity, port: run.port, rng: new Rng(run.seed) };
}

/** Pieces offered at this court now. */
export function offered(g: Game, polityId: string): Piece[] {
  const pol = POLITY_BY_ID.get(polityId);
  if (!pol) return [];
  return PIECES.filter((p) => p.available(g, pol));
}

export function startPiece(g: Game, pieceId: string, polityId: string, port: string): PieceRun | null {
  const piece = pieceById(pieceId);
  const polity = POLITY_BY_ID.get(polityId);
  if (!piece || !polity) return null;
  const seed = Math.floor(g.rng.next() * 2 ** 31);
  const run: PieceRun = {
    id: g.diplomacy.pieces.nextId++, pieceId, polity: polityId, port, seed, started: g.clock.t, state: null,
  };
  run.state = piece.start({ g, polity, port, rng: new Rng(seed) });
  g.diplomacy.pieces.runs.push(run);
  return run;
}

export function runView(g: Game, run: PieceRun): PieceView | null {
  const piece = pieceById(run.pieceId);
  const ctx = ctxOf(g, run);
  return piece && ctx ? piece.view(ctx, run.state) : null;
}

/** Take one choice. Returns the outcome if the piece is now over. */
export function stepPiece(g: Game, run: PieceRun, choice: string): Outcome | null {
  if (run.outcome) return null;
  const piece = pieceById(run.pieceId);
  const ctx = ctxOf(g, run);
  if (!piece || !ctx) return null;
  // Advance the seed each step so successive draws differ but stay reproducible.
  run.seed = (Math.imul(run.seed, 1664525) + 1013904223) >>> 0;
  ctx.rng = new Rng(run.seed);
  const r = piece.step(ctx, run.state, choice);
  run.state = r.state;
  if (r.outcome) resolve(g, run, r.outcome);
  return r.outcome ?? null;
}

function resolve(g: Game, run: PieceRun, o: Outcome): void {
  const now = g.clock.t;
  for (const m of o.marks) writeMark(g.diplomacy.marks, run.polity, m, now);
  if (o.measures) g.adjustPolity(run.polity, o.measures, o.line);
  for (const b of o.book ?? []) learn(g.diplomacy.book, run.polity, b, now);
  if (o.factions) {
    const st = g.polityState(run.polity);
    for (const f of POLITY_BY_ID.get(run.polity)?.factions ?? []) {
      const d = o.factions[f.cares];
      if (d) st.factions[f.id] = Math.max(-1, Math.min(1, (st.factions[f.id] ?? 0) + d));
    }
  }
  if (o.gold) g.crown.gold += o.gold;
  run.outcome = { grade: o.grade, line: o.line, t: now };
  // The ledger keeps the last twenty-four runs and the open ones.
  const done = g.diplomacy.pieces.runs.filter((r) => r.outcome);
  if (done.length > 24) {
    const drop = new Set(done.slice(0, done.length - 24).map((r) => r.id));
    g.diplomacy.pieces.runs = g.diplomacy.pieces.runs.filter((r) => !drop.has(r.id));
  }
}

export function openRuns(g: Game, polityId?: string): PieceRun[] {
  return g.diplomacy.pieces.runs.filter((r) => !r.outcome && (!polityId || r.polity === polityId));
}
