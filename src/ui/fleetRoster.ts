import type { GameState, Caravan } from "../game/types";
import { CITY_BY_ID } from "../data/cities";
import { caravanCargoUnits } from "../game/caravan";

export interface RosterActions {
  selectCaravan: (id: string) => void;
  beginDispatch: (caravanId: string) => void;
  focusCaravan: (id: string) => void;
}

function statusLabel(c: Caravan): string {
  if (c.status === "traveling") {
    const to = c.toCityId ? CITY_BY_ID[c.toCityId]?.name : "?";
    const daysLeft = Math.max(0, Math.ceil(c.travelDuration - c.travelProgress));
    return `→ ${to} · ${daysLeft}d`;
  }
  if (c.status === "loading") return "loading…";
  const at = c.cityId ? CITY_BY_ID[c.cityId]?.name : "—";
  return `at ${at}`;
}

export function renderFleetRoster(state: GameState, actions: RosterActions) {
  const el = document.getElementById("fleet-roster")!;
  const selectedId =
    state.selection.kind === "caravan" ? state.selection.id :
    state.selection.kind === "dispatch" ? state.selection.caravanId : null;

  const rows = state.caravans.map((c) => {
    const cargo = caravanCargoUnits(c);
    const pct = Math.round((cargo / c.capacity) * 100);
    const onRoute = c.routeId ? "⟳" : "";
    const canDispatch = c.status === "idle" && !c.routeId && c.cityId;
    return `
      <div class="roster-row ${selectedId === c.id ? "selected" : ""}" data-action="focus" data-id="${c.id}">
        <div class="roster-main">
          <div class="roster-name">${c.name} <span class="roster-route">${onRoute}</span></div>
          <div class="roster-status">${statusLabel(c)}</div>
        </div>
        <div class="roster-right">
          <div class="cargo-bar" title="${cargo}/${c.capacity}"><div class="cargo-fill" style="width:${pct}%"></div></div>
          ${canDispatch ? `<button class="roster-dispatch" data-action="dispatch" data-id="${c.id}" title="Dispatch">➤</button>` : ""}
        </div>
      </div>
    `;
  }).join("");

  el.innerHTML = `
    <div class="roster-header">Fleet · ${state.caravans.length}</div>
    <div class="roster-list">${rows}</div>
  `;

  el.querySelectorAll<HTMLElement>("[data-action='focus']").forEach((e) => {
    e.addEventListener("click", (ev) => {
      if ((ev.target as HTMLElement).closest("[data-action='dispatch']")) return;
      actions.focusCaravan(e.dataset.id!);
    });
  });
  el.querySelectorAll<HTMLElement>("[data-action='dispatch']").forEach((e) => {
    e.addEventListener("click", (ev) => {
      ev.stopPropagation();
      actions.beginDispatch(e.dataset.id!);
    });
  });
}
