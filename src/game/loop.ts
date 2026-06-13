import type { GameState } from "./types";
import { advanceOneDay } from "./time";
import { tickEconomy } from "./economy";
import { tickCaravans } from "./caravan";
import { tickDynasty } from "./dynasty";
import { tickMilestones } from "./events";

// At speed=1 the game advances one game-day per (DAY_REAL_MS) of real time.
export const DAY_REAL_MS = 600;

export function tickGame(state: GameState, realDtMs: number) {
  if (state.speed === 0 || state.modal !== null) return;
  state.tickAccumulator += realDtMs * state.speed;
  let daysAdvanced = 0;
  const MAX_DAYS_PER_FRAME = 8;
  while (state.tickAccumulator >= DAY_REAL_MS && daysAdvanced < MAX_DAYS_PER_FRAME) {
    state.tickAccumulator -= DAY_REAL_MS;
    state.date = advanceOneDay(state.date);
    daysAdvanced += 1;
  }
  if (daysAdvanced === 0) return;
  tickEconomy(state, daysAdvanced);
  tickCaravans(state, daysAdvanced);
  tickDynasty(state, daysAdvanced);
  tickMilestones(state);
}
