import type { GameState, Speed } from "../game/types";

export function renderBottomBar(state: GameState, onSpeedChange: (s: Speed) => void) {
  const bar = document.getElementById("bottom-bar")!;
  bar.innerHTML = `
    <div class="speed-controls">
      <button class="speed-btn ${state.speed === 0 ? "active" : ""}" data-speed="0">❚❚ Pause</button>
      <button class="speed-btn ${state.speed === 1 ? "active" : ""}" data-speed="1">▶ 1×</button>
      <button class="speed-btn ${state.speed === 2 ? "active" : ""}" data-speed="2">▶▶ 2×</button>
      <button class="speed-btn ${state.speed === 5 ? "active" : ""}" data-speed="5">▶▶▶ 5×</button>
    </div>
  `;
  bar.querySelectorAll<HTMLButtonElement>("button.speed-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = Number(btn.dataset.speed) as Speed;
      onSpeedChange(s);
    });
  });
}
