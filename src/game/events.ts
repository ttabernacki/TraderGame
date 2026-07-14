import type { GameState } from "./types";
import { pushLog } from "./log";

export function tickSeasonNotes(state: GameState) {
  if (state.date.day !== 1) return;
  switch (state.date.month) {
    case 5:
      pushLog(state, "Shearing season begins — wool will flood the northern and eastern markets.", "info");
      break;
    case 8:
      pushLog(state, "The grain harvest begins across the Empire. Granaries fill; prices fall at the source.", "info");
      break;
    case 9:
      pushLog(state, "The wine harvest begins along the Rhine and Danube.", "info");
      break;
    case 12:
      pushLog(state, "Winter closes in: the roads slow, and festival season raises the thirst for wine and beer.", "info");
      break;
  }
}

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
      // Interactive milestones open a decision; the rest show a flavor card.
      if (ms.decisionId) {
        state.modal = { kind: "decision", decisionId: ms.decisionId };
      } else {
        state.modal = { kind: "milestone", eventId: ms.id };
      }
      state.speed = 0;
    }
  }
}
