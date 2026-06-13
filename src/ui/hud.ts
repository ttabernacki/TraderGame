import type { GameState } from "../game/types";
import { formatDate } from "../game/time";
import { houseHead, houseHeir, age } from "../game/dynasty";

export function renderHUD(state: GameState) {
  const hud = document.getElementById("hud")!;
  const head = houseHead(state);
  const heir = houseHeir(state);
  hud.innerHTML = `
    <div class="plate plate-row">
      <div>
        <div class="plate-title">House</div>
        <div class="plate-value">${head ? `${head.givenName} ${head.surname}` : "(vacant)"}</div>
      </div>
      <div>
        <div class="plate-title">Age</div>
        <div class="plate-value">${head ? age(head, state.date.year) : "—"}</div>
      </div>
      <div>
        <div class="plate-title">Heir</div>
        <div class="plate-value">${heir ? heir.givenName : "—"}</div>
      </div>
    </div>
    <div class="plate plate-row">
      <div>
        <div class="plate-title">Treasury</div>
        <div class="plate-value">${state.treasury.toLocaleString("de-DE")} ɡ</div>
      </div>
      <div>
        <div class="plate-title">Date</div>
        <div class="plate-value">${formatDate(state.date)}</div>
      </div>
    </div>
  `;
}
