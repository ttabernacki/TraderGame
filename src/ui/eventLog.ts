import type { GameState } from "../game/types";
import { formatDateShort } from "../game/time";

export function renderEventLog(state: GameState) {
  const el = document.getElementById("event-log")!;
  if (state.log.length === 0) {
    el.innerHTML = `<div class="log-entry" style="color: var(--ink-faded); font-style: italic;">The chronicle is empty.</div>`;
    return;
  }
  el.innerHTML = state.log.slice(0, 12).map((entry) => `
    <div class="log-entry ${entry.kind}">
      <span class="log-date">${formatDateShort(entry.date)}</span>${escape(entry.text)}
    </div>
  `).join("");
}

function escape(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}
