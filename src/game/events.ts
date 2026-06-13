import type { GameState } from "./types";
import { pushLog } from "./log";

export function tickMilestones(state: GameState) {
  const y = state.date.year;
  const m = state.date.month;
  const d = state.date.day;
  for (const ms of state.milestones) {
    if (ms.fired) continue;
    const targetMonth = ms.month ?? 1;
    if (y > ms.year || (y === ms.year && (m > targetMonth || (m === targetMonth && d >= 1)))) {
      ms.fired = true;
      ms.apply(state);
      pushLog(state, `${ms.title}.`, "milestone");
      state.modal = { kind: "milestone", eventId: ms.id };
      state.speed = 0;
    }
  }
}
