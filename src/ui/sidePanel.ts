import type { GameState, Caravan, City, GoodId, MarketIntel } from "../game/types";
import { GOODS, GOOD_BY_ID } from "../data/goods";
import { CITY_BY_ID, HOME_CITY_ID } from "../data/cities";
import { priceTrend } from "../game/economy";
import { caravanCargoUnits, travelKmAndDays, CARAVAN_HIRE_COST } from "../game/caravan";
import { hasPresence } from "../game/intel";
import {
  warehouseUnits, warehouseSpace, WAREHOUSE_RENT_COST,
} from "../game/warehouse";
import { formatDateShort } from "../game/time";
import { sparkline } from "./sparkline";

export interface PanelActions {
  closePanel: () => void;
  selectCaravan: (id: string) => void;
  beginDispatch: (caravanId: string) => void;
  recallSelection: () => void;
  hireCaravan: (cityId: string) => void;
  assignRoute: (caravanId: string, routeId: string | null) => void;
  setActiveTradeCaravan: (caravanId: string) => void;
  trade: (caravanId: string, cityId: string, goodId: GoodId, dir: "buy" | "sell", qty: number | "max" | "all") => void;
  rentWarehouse: (cityId: string) => void;
  warehouseMove: (caravanId: string, cityId: string, goodId: GoodId, dir: "store" | "take", qty: number | "all") => void;
}

export function renderSidePanel(state: GameState, actions: PanelActions) {
  const panel = document.getElementById("side-panel")!;
  const sel = state.selection;
  if (sel.kind === "none") {
    panel.classList.remove("open");
    panel.innerHTML = "";
    return;
  }
  panel.classList.add("open");

  if (sel.kind === "city") {
    const city = CITY_BY_ID[sel.id];
    if (!city) { panel.classList.remove("open"); return; }
    panel.innerHTML = renderCity(state, city);
  } else if (sel.kind === "caravan") {
    const c = state.caravans.find((x) => x.id === sel.id);
    if (!c) { panel.classList.remove("open"); return; }
    // A selected caravan sitting in a city: show that city's trade panel,
    // with this caravan active. One panel does both jobs.
    if (c.cityId) {
      panel.innerHTML = renderCity(state, CITY_BY_ID[c.cityId], c.id);
    } else {
      panel.innerHTML = renderCaravan(state, c);
    }
  } else if (sel.kind === "dispatch") {
    const c = state.caravans.find((x) => x.id === sel.caravanId);
    if (!c) { panel.classList.remove("open"); return; }
    panel.innerHTML = renderDispatch(state, c);
  }

  wire(panel, actions);
}

function wire(panel: HTMLElement, actions: PanelActions) {
  panel.querySelector<HTMLButtonElement>(".panel-close")?.addEventListener("click", () => actions.closePanel());

  panel.querySelectorAll<HTMLElement>("[data-act]").forEach((e) => {
    e.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const act = e.dataset.act!;
      const cid = e.dataset.cid;
      const city = e.dataset.city;
      const good = e.dataset.good as GoodId | undefined;
      const qtyRaw = e.dataset.qty;
      const qty: number | "max" | "all" =
        qtyRaw === "max" ? "max" : qtyRaw === "all" ? "all" : Number(qtyRaw);
      switch (act) {
        case "close": actions.closePanel(); break;
        case "dispatch": actions.beginDispatch(e.dataset.id!); break;
        case "cancel-dispatch": actions.recallSelection(); break;
        case "hire": actions.hireCaravan(city!); break;
        case "rent-wh": actions.rentWarehouse(city!); break;
        case "active": actions.setActiveTradeCaravan(e.dataset.id!); break;
        case "view-caravan": actions.selectCaravan(e.dataset.id!); break;
        case "buy": actions.trade(cid!, city!, good!, "buy", qty); break;
        case "sell": actions.trade(cid!, city!, good!, "sell", qty); break;
        case "store": actions.warehouseMove(cid!, city!, good!, "store", qty as number | "all"); break;
        case "take": actions.warehouseMove(cid!, city!, good!, "take", qty as number | "all"); break;
      }
    });
  });

  panel.querySelector<HTMLSelectElement>("[data-action='route-select']")?.addEventListener("change", (ev) => {
    const el = ev.currentTarget as HTMLSelectElement;
    actions.assignRoute(el.dataset.cid!, el.value === "" ? null : el.value);
  });
}

function resolveActiveCaravan(state: GameState, city: City, forced?: string): Caravan | null {
  const here = state.caravans.filter((c) => c.cityId === city.id);
  if (here.length === 0) return null;
  if (forced) {
    const f = here.find((c) => c.id === forced);
    if (f) return f;
  }
  const stored = here.find((c) => c.id === state.activeTradeCaravan);
  return stored ?? here[0];
}

function renderCity(state: GameState, city: City, forcedCaravan?: string): string {
  const present = hasPresence(state, city.id);
  const intel: MarketIntel | undefined = state.intel[city.id];
  const here = state.caravans.filter((c) => c.cityId === city.id);
  const active = resolveActiveCaravan(state, city, forcedCaravan);
  const wh = state.warehouses[city.id];

  // ---- Header ----
  let html = `
    <div class="panel-header">
      <div>
        <div class="panel-title">${city.name}</div>
        <div class="panel-subtitle">${city.region} — ${city.population.toLocaleString("de-DE")} souls</div>
      </div>
      <button class="panel-close">✕</button>
    </div>
  `;

  // ---- Active caravan chips ----
  if (here.length > 0) {
    const chips = here.map((c) => {
      const cargo = caravanCargoUnits(c);
      const isActive = active?.id === c.id;
      return `<button class="caravan-chip ${isActive ? "active" : ""}" data-act="active" data-id="${c.id}">
        ${c.name.replace(" Kompagnie", "")} <span class="chip-cargo">${cargo}/${c.capacity}</span>
      </button>`;
    }).join("");
    html += `<div class="chip-row">${chips}</div>`;
    if (active) {
      const space = active.capacity - caravanCargoUnits(active);
      const canDispatch = active.status === "idle" && !active.routeId;
      const dispatchLink = canDispatch
        ? `<button class="link-btn" data-act="dispatch" data-id="${active.id}">dispatch ›</button>`
        : "";
      html += `<div class="active-line">Trading with <b>${active.name}</b> · ${space} free · ${dispatchLink}</div>`;
    }
  }

  // ---- Intel banner ----
  if (present) {
    html += `<div class="intel-banner live">Live market — your factor is present.</div>`;
  } else if (intel) {
    html += `<div class="intel-banner stale">Last report: ${formatDateShort(intel.date)}. Prices may have moved.</div>`;
  } else {
    html += `<div class="intel-banner unknown">No intelligence here. Send a caravan to scout, or lease a warehouse.</div>`;
  }

  // ---- Market ----
  html += `<div class="section-title">Market</div>`;
  if (present || intel) {
    const prices = present ? state.markets[city.id].prices : intel!.prices;
    const stock = present ? state.markets[city.id].stock : intel!.stock;
    const market = present ? state.markets[city.id] : null;
    html += `<div class="market">`;
    for (const g of GOODS) {
      const price = prices[g.id];
      const trend = market ? priceTrend(market, g.id) : "flat";
      const arrow = trend === "up" ? "▲" : trend === "down" ? "▼" : "—";
      const spark = market ? sparkline(market.priceHistory[g.id]) : "";
      const carry = active ? (active.cargo[g.id] ?? 0) : 0;
      const stored = wh ? wh.goods[g.id] : 0;
      html += `
        <div class="mrow">
          <div class="mrow-good"><span class="good-glyph">${g.glyph}</span>${g.name}</div>
          <div class="mrow-spark">${spark}</div>
          <div class="mrow-price">${price}ɡ <span class="trend-${trend}">${arrow}</span></div>
          <div class="mrow-meta">stk ${Math.round(stock[g.id])}${active ? ` · hold ${carry}` : ""}${wh ? ` · whs ${stored}` : ""}</div>
          ${active ? tradeControls(active, city.id, g.id, carry, price, state.treasury) : ""}
        </div>
      `;
    }
    html += `</div>`;
  } else {
    html += `<div class="muted">—</div>`;
  }

  // ---- Warehouse ----
  html += renderWarehouseSection(state, city, active);

  // ---- Route assignment for the active caravan ----
  if (active) {
    const routeOptions = state.routes.map((r) =>
      `<option value="${r.id}" ${active.routeId === r.id ? "selected" : ""}>${escapeHtml(r.name)}</option>`
    ).join("");
    html += `
      <div class="section-title">${active.name} · Route</div>
      <select class="route-select" data-action="route-select" data-cid="${active.id}">
        <option value="">(no route — manual)</option>
        ${routeOptions}
      </select>
    `;
  }

  // ---- Hire / actions ----
  const canHire = present || city.id === HOME_CITY_ID;
  if (canHire) {
    html += `<div class="panel-actions-row">
      <button class="action" data-act="hire" data-city="${city.id}" ${state.treasury < CARAVAN_HIRE_COST ? "disabled" : ""}>Hire caravan (${CARAVAN_HIRE_COST}ɡ)</button>
    </div>`;
  }

  return html;
}

function tradeControls(
  caravan: Caravan, cityId: string, goodId: GoodId,
  carry: number, price: number, treasury: number,
): string {
  const canAfford = treasury >= price;
  const space = caravan.capacity - caravanCargoUnits(caravan);
  const canBuy = canAfford && space > 0;
  const buy = `
    <button class="tbtn buy" data-act="buy" data-cid="${caravan.id}" data-city="${cityId}" data-good="${goodId}" data-qty="1" ${canBuy ? "" : "disabled"}>+1</button>
    <button class="tbtn buy" data-act="buy" data-cid="${caravan.id}" data-city="${cityId}" data-good="${goodId}" data-qty="10" ${canBuy ? "" : "disabled"}>+10</button>
    <button class="tbtn buy" data-act="buy" data-cid="${caravan.id}" data-city="${cityId}" data-good="${goodId}" data-qty="max" ${canBuy ? "" : "disabled"}>max</button>
  `;
  const sell = `
    <button class="tbtn sell" data-act="sell" data-cid="${caravan.id}" data-city="${cityId}" data-good="${goodId}" data-qty="1" ${carry > 0 ? "" : "disabled"}>−1</button>
    <button class="tbtn sell" data-act="sell" data-cid="${caravan.id}" data-city="${cityId}" data-good="${goodId}" data-qty="10" ${carry > 0 ? "" : "disabled"}>−10</button>
    <button class="tbtn sell" data-act="sell" data-cid="${caravan.id}" data-city="${cityId}" data-good="${goodId}" data-qty="all" ${carry > 0 ? "" : "disabled"}>all</button>
  `;
  return `<div class="mrow-trade">${buy}<span class="tgap"></span>${sell}</div>`;
}

function renderWarehouseSection(state: GameState, city: City, active: Caravan | null): string {
  const wh = state.warehouses[city.id];
  if (!wh) {
    const present = hasPresence(state, city.id);
    if (!present && city.id !== HOME_CITY_ID) return "";
    return `<div class="panel-actions-row">
      <button class="action" data-act="rent-wh" data-city="${city.id}" ${state.treasury < WAREHOUSE_RENT_COST ? "disabled" : ""}>Lease warehouse (${WAREHOUSE_RENT_COST}ɡ)</button>
    </div>`;
  }
  const used = warehouseUnits(wh);
  const space = warehouseSpace(wh);
  // Rows for goods either stored or carried by the active caravan.
  const goods = GOODS.filter((g) => wh.goods[g.id] > 0 || (active && (active.cargo[g.id] ?? 0) > 0));
  const rows = goods.length === 0
    ? `<div class="muted">Empty. Store goods here to speculate across seasons.</div>`
    : goods.map((g) => {
        const stored = wh.goods[g.id];
        const carry = active ? (active.cargo[g.id] ?? 0) : 0;
        const storeBtns = active && carry > 0 ? `
          <button class="tbtn" data-act="store" data-cid="${active.id}" data-city="${city.id}" data-good="${g.id}" data-qty="10" ${space > 0 ? "" : "disabled"}>store 10</button>
          <button class="tbtn" data-act="store" data-cid="${active.id}" data-city="${city.id}" data-good="${g.id}" data-qty="all" ${space > 0 ? "" : "disabled"}>all</button>
        ` : "";
        const takeBtns = active && stored > 0 ? `
          <button class="tbtn" data-act="take" data-cid="${active.id}" data-city="${city.id}" data-good="${g.id}" data-qty="10">take 10</button>
          <button class="tbtn" data-act="take" data-cid="${active.id}" data-city="${city.id}" data-good="${g.id}" data-qty="all">all</button>
        ` : "";
        return `<div class="wrow">
          <span class="good-glyph">${g.glyph}</span>
          <span class="wrow-name">${g.name}</span>
          <span class="wrow-qty">whs ${stored}${active ? ` · hold ${carry}` : ""}</span>
          <span class="wrow-btns">${takeBtns}${storeBtns}</span>
        </div>`;
      }).join("");
  return `
    <div class="section-title">Warehouse <span class="wh-cap">${used}/${wh.capacity}</span></div>
    ${rows}
  `;
}

function renderCaravan(state: GameState, c: Caravan): string {
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
    : "—";

  const route = c.routeId ? state.routes.find((r) => r.id === c.routeId) : null;
  const routeOptions = state.routes.map((r) =>
    `<option value="${r.id}" ${c.routeId === r.id ? "selected" : ""}>${escapeHtml(r.name)}</option>`
  ).join("");
  let routeStatus = "";
  if (route) {
    const nextStop = route.stops[c.routeStopIndex % Math.max(1, route.stops.length)];
    const nextName = nextStop ? CITY_BY_ID[nextStop.cityId]?.name : "—";
    routeStatus = `<div class="muted" style="margin-top:4px;">Next stop: ${nextName}${route.stops.length < 2 ? " · route needs ≥2 stops" : ""}</div>`;
  }

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
    ${cargoRows ? `<table class="market-table"><tbody>${cargoRows}</tbody></table>` : `<div class="muted">Empty.</div>`}
    <div class="section-title">Route</div>
    <select class="route-select" data-action="route-select" data-cid="${c.id}">
      <option value="">(no route — manual orders)</option>
      ${routeOptions}
    </select>
    ${routeStatus}
  `;
}

function renderDispatch(state: GameState, c: Caravan): string {
  const from = c.cityId ? CITY_BY_ID[c.cityId] : null;
  const hovered = state.hoveredCity ? CITY_BY_ID[state.hoveredCity] : null;
  let preview = "";
  if (from && hovered && from.id !== hovered.id) {
    const { km, days } = travelKmAndDays(from.id, hovered.id, c.speed);
    preview = `<div class="dispatch-preview">
      <div style="font-weight:600;">${from.name} → ${hovered.name}</div>
      <div class="muted">~${Math.round(km)} km · ~${days} days · Click city to confirm.</div>
    </div>`;
  }
  return `
    <div class="panel-header">
      <div>
        <div class="panel-title">${c.name}</div>
        <div class="panel-subtitle">Choose destination</div>
      </div>
      <button class="panel-close">✕</button>
    </div>
    <div class="muted" style="font-style:italic;">Click any city to dispatch. Right-click or <b>Esc</b> to cancel.</div>
    ${preview}
    <div style="margin-top:12px;">
      <button class="action" data-act="cancel-dispatch">Cancel</button>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
