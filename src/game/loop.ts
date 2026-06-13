import type { GameState } from "./types";
import { advanceOneDay } from "./time";
import { tickEconomyDay } from "./economy";
import { tickCaravansDay } from "./caravan";
import { tickRoutesDay } from "./routes";
import { tickIntelDay } from "./intel";
import { tickDynasty } from "./dynasty";
import { tickMilestones, tickSeasonNotes } from "./events";

// At speed=1 the game advances one game-day per (DAY_REAL_MS) of real time.
export const DAY_REAL_MS = 600;

export function tickGame(state: GameState, realDtMs: number) {
  if (state.speed === 0 || state.modal !== null) return;
  state.tickAccumulator += realDtMs * state.speed;
  let safety = 8;
  while (state.tickAccumulator >= DAY_REAL_MS && safety > 0) {
    state.tickAccumulator -= DAY_REAL_MS;
    safety -= 1;
    advanceDay(state);
    // A milestone may have paused the game mid-batch (it sets modal + speed=0).
    if (state.modal !== null || (state.speed as number) === 0) break;
  }
}

export function advanceDay(state: GameState) {
  state.date = advanceOneDay(state.date);
  tickEconomyDay(state);
  tickCaravansDay(state);
  tickRoutesDay(state);
  tickIntelDay(state);
  tickDynasty(state);
  tickSeasonNotes(state);
  tickMilestones(state);
}
