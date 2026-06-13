import type { GameState, LogEntry } from "./types";

const MAX_LOG = 60;

export function pushLog(state: GameState, text: string, kind: LogEntry["kind"] = "info") {
  state.log.unshift({ date: { ...state.date }, text, kind });
  if (state.log.length > MAX_LOG) state.log.length = MAX_LOG;
}
