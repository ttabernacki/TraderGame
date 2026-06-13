import type { GameState, Caravan, City, GoodId } from "../game/types";
import { GOODS, GOOD_BY_ID } from "../data/goods";
import { CITY_BY_ID } from "../data/cities";
import { priceTrend } from "../game/economy";
import { caravanCargoUnits, travelKmAndDays } from "../game/caravan";

export interface PanelActions {
  closePanel: () => void;
  selectCaravan: (id: string) => void;
  beginDispatch: (caravanId: string) => void;
  openTrade: (caravanId: string, cityId: string) => void;
  recallSelection: () => void;
}

export function renderSidePanel(state: GameState, actions: PanelActions) {
  const panel = document.getElementById("side-panel")!;
  if (state.selection.kind === "none") {
    panel.classList.remove("open");
    panel.innerHTML = "";
    return;
  }
  panel.classList.add("open");

  const sel = state.selection;
  if (sel.kind === "city") {
    const city = CITY_BY_ID[sel.id];
    if (!city) { panel.classList.remove("open"); return; }
    panel.innerHTML = renderCity(state, city);
  } else if (sel.kind === "caravan") {
    const c = state.caravans.find((x) => x.id === sel.id);
    if (!c) { panel.classList.remove("open"); return; }
    panel.innerHTML = renderCaravan(state, c);
  } else if (sel.kind === "dispatch") {
    const c = state.caravans.find((x) => x.id === sel.caravanId);
    if (!c) { panel.classList.remove("open"); return; }
    panel.innerHTML = renderDispatch(state, c);
  }

  panel.querySelector<HTMLButtonElement>(".panel-close")?.addEventListener("click", () => actions.closePanel());
  panel.querySelectorAll<HTMLElement>("[data-action='select-caravan']").forEach((e) => {
    e.addEventListener("click", (ev) => {
      const target = ev.target as HTMLElement;
      if (target.closest("[data-action='trade'],[data-action='dispatch']")) return;
      actions.selectCaravan(e.dataset.id!);
    });
  });
  panel.querySelectorAll<HTMLElement>("[data-action='dispatch']").forEach((e) => {
    e.addEventListener("click", (ev) => {
      ev.stopPropagation();
      actions.beginDispatch(e.dataset.id!);
    });
  });
  panel.querySelectorAll<HTMLElement>("[data-action='trade']").forEach((e) => {
    e.addEventListener("click", (ev) => {
      ev.stopPropagation();
      actions.openTrade(e.dataset.cid!, e.dataset.city!);
    });
  });
  panel.querySelectorAll<HTMLElement>("[data-action='cancel-dispatch']").forEach((e) => {
    e.addEventListener("click", () => actions.recallSelection());
  });
}

function renderCity(state: GameState, city: City): string {
  const market = state.markets[city.id];
  const caravansHere = state.caravans.filter((c) => c.cityId === city.id);
  const rows = GOODS.map((g) => {
    const price = market.prices[g.id];
    const stock = Math.round(market.stock[g.id]);
    const trend = priceTrend(market, g.id);
    const arrow = trend === "up" ? "▲" : trend === "down" ? "▼" : "—";
    return `<tr>
      <td class="good-name"><span class="good-glyph">${g.glyph}</span>${g.name}</td>
      <td>${stock}</td>
      <td>${price} ɡ</td>
      <td class="trend-${trend}">${arrow}</td>
    </tr>`;
  }).join("");

  const caravanList = caravansHere.length === 0 ? `
    <div style="font-style: italic; color: var(--ink-faded); padding: 4px 0;">No caravans of your house in the city.</div>
  ` : caravansHere.map((c) => `
    <div class="caravan-row" data-action="select-caravan" data-id="${c.id}">
      <div>
        <div class="caravan-name">${c.name}</div>
        <div class="caravan-status">${caravanCargoUnits(c)}/${c.capacity} loaded</div>
      </div>
      <button class="action" data-action="trade" data-cid="${c.id}" data-city="${city.id}">Trade</button>
    </div>
  `).join("");

  return `
    <div class="panel-header">
      <div>
        <div class="panel-title">${city.name}</div>
        <div class="panel-subtitle">${city.region} — ${city.population.toLocaleString("de-DE")} souls</div>
      </div>
      <button class="panel-close">✕</button>
    </div>
    <div class="section-title">Market</div>
    <table class="market-table">
      <thead><tr><th>Good</th><th>Stock</th><th>Price</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="section-title">Caravans in city</div>
    ${caravanList}
  `;
}

function renderCaravan(_state: GameState, c: Caravan): string {
  const cargoRows = (Object.keys(c.cargo) as GoodId[])
    .filter((k) => (c.cargo[k] ?? 0) > 0)
    .map((k) => {
      const good = GOOD_BY_ID[k];
      return `<tr>
        <td class="good-name"><span class="good-glyph">${good.glyph}</span>${good.name}</td>
        <td>${c.cargo[k]}</td>
      </tr>`;
    }).join("");

  const locationLine = c.status === "traveling"
    ? `Traveling ${CITY_BY_ID[c.fromCityId!]?.name ?? "?"} → ${CITY_BY_ID[c.toCityId!]?.name ?? "?"} (${Math.round(c.travelProgress)}/${c.travelDuration} days)`
    : c.cityId ? `At ${CITY_BY_ID[c.cityId]?.name}` : "—";

  const cityId = c.cityId;
  const cargo = caravanCargoUnits(c);
  return `
    <div class="panel-header">
      <div>
        <div class="panel-title">${c.name}</div>
        <div class="panel-subtitle">${locationLine}</div>
      </div>
      <button class="panel-close">✕</button>
    </div>
    <div class="section-title">Cargo (${cargo}/${c.capacity})</div>
    ${cargoRows ? `<table class="market-table"><tbody>${cargoRows}</tbody></table>` : `<div style="font-style: italic; color: var(--ink-faded); padding: 4px 0;">Empty.</div>`}
    <div style="display:flex; gap:8px; margin-top:14px;">
      ${cityId ? `<button class="action" data-action="trade" data-cid="${c.id}" data-city="${cityId}">Trade in ${CITY_BY_ID[cityId]?.name}</button>` : ""}
      ${c.status === "idle" ? `<button class="action" data-action="dispatch" data-id="${c.id}">Dispatch…</button>` : ""}
    </div>
  `;
}

function renderDispatch(state: GameState, c: Caravan): string {
  const from = c.cityId ? CITY_BY_ID[c.cityId] : null;
  const hovered = state.hoveredCity ? CITY_BY_ID[state.hoveredCity] : null;
  let preview = "";
  if (from && hovered && from.id !== hovered.id) {
    const { km, days } = travelKmAndDays(from.id, hovered.id, c.speed);
    preview = `<div style="margin-top:8px; padding:8px; background: rgba(184, 146, 58, 0.18); border:1px dashed var(--ink-faded);">
      <div style="font-weight:600;">${from.name} → ${hovered.name}</div>
      <div style="font-size:12px; color: var(--ink-soft);">~${Math.round(km)} km · ~${days} days · Click city to confirm.</div>
    </div>`;
  }
  return `
    <div class="panel-header">
      <div>
        <div class="panel-title">${c.name}</div>
        <div class="panel-subtitle">Choose destination on the map</div>
      </div>
      <button class="panel-close">✕</button>
    </div>
    <div style="font-style: italic; color: var(--ink-soft);">Click any city to dispatch the caravan there. Right-click or press <b>Esc</b> to cancel.</div>
    ${preview}
    <div style="margin-top:12px;">
      <button class="action" data-action="cancel-dispatch">Cancel</button>
    </div>
  `;
}
