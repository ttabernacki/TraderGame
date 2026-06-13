import type { GameState, GoodId, TradeRoute, RouteOrder } from "../game/types";
import { GOODS } from "../data/goods";
import { CITIES, CITY_BY_ID } from "../data/cities";
import { createRoute, deleteRoute, caravansOnRoute } from "../game/routes";
import { hasWarehouse } from "../game/warehouse";
import { formatDateShort } from "../game/time";

export interface ModalUI {
  close: () => void;
  refresh: () => void;
}

export function renderModal(state: GameState, ui: ModalUI) {
  const root = document.getElementById("modal-root")!;
  if (!state.modal) {
    root.innerHTML = "";
    return;
  }
  switch (state.modal.kind) {
    case "milestone":
      renderMilestone(state, root, ui);
      break;
    case "routes":
      renderRoutesList(state, root, ui);
      break;
    case "route-edit":
      renderRouteEditor(state, root, ui);
      break;
  }
}

function renderMilestone(state: GameState, root: HTMLElement, ui: ModalUI) {
  if (state.modal?.kind !== "milestone") return;
  const modal = state.modal;
  const ms = state.milestones.find((m) => m.id === modal.eventId);
  if (!ms) { root.innerHTML = ""; return; }
  root.innerHTML = `
    <div class="modal-bg">
      <div class="modal">
        <div class="modal-title">${ms.title}</div>
        <div class="modal-flavor">${ms.flavor}</div>
        <div class="modal-actions">
          <button class="action" id="modal-dismiss">Continue</button>
        </div>
      </div>
    </div>
  `;
  root.querySelector<HTMLButtonElement>("#modal-dismiss")?.addEventListener("click", () => ui.close());
}

// ---- Routes list ----

function renderRoutesList(state: GameState, root: HTMLElement, ui: ModalUI) {
  const rows = state.routes.length === 0
    ? `<div style="font-style:italic; color: var(--ink-faded); padding: 8px 0;">No routes yet. A route is a circuit of cities with standing buy/sell orders — assign caravans to it from their panel.</div>`
    : state.routes.map((r) => {
        const stops = r.stops.length >= 1
          ? r.stops.map((s) => CITY_BY_ID[s.cityId]?.name ?? s.cityId).join(" → ")
          : "<i>no stops</i>";
        const assigned = caravansOnRoute(state, r.id).length;
        return `
          <div class="route-row">
            <div>
              <div class="caravan-name">${escapeHtml(r.name)}</div>
              <div class="caravan-status">${stops} · ${assigned} caravan${assigned === 1 ? "" : "s"}</div>
            </div>
            <div style="display:flex; gap:6px;">
              <button class="action" data-action="edit-route" data-id="${r.id}">Edit</button>
              <button class="action" data-action="delete-route" data-id="${r.id}">Delete</button>
            </div>
          </div>
        `;
      }).join("");

  root.innerHTML = `
    <div class="modal-bg">
      <div class="modal" style="max-width: 600px;">
        <div class="modal-title">Trade Routes</div>
        ${rows}
        <div class="modal-actions">
          <button class="action" id="new-route">+ New route</button>
          <button class="action" id="modal-dismiss">Close</button>
        </div>
      </div>
    </div>
  `;
  root.querySelector<HTMLButtonElement>("#modal-dismiss")?.addEventListener("click", () => ui.close());
  root.querySelector<HTMLButtonElement>("#new-route")?.addEventListener("click", () => {
    const r = createRoute(state);
    state.modal = { kind: "route-edit", routeId: r.id };
    ui.refresh();
  });
  root.querySelectorAll<HTMLElement>("[data-action='edit-route']").forEach((e) => {
    e.addEventListener("click", () => {
      state.modal = { kind: "route-edit", routeId: e.dataset.id! };
      ui.refresh();
    });
  });
  root.querySelectorAll<HTMLElement>("[data-action='delete-route']").forEach((e) => {
    e.addEventListener("click", () => {
      deleteRoute(state, e.dataset.id!);
      ui.refresh();
    });
  });
}

// ---- Route editor ----

function goodOptions(selected: GoodId): string {
  return GOODS.map((g) => `<option value="${g.id}" ${g.id === selected ? "selected" : ""}>${g.name}</option>`).join("");
}

function cityOptions(): string {
  return [...CITIES]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join("");
}

function orderRow(stopIdx: number, orderIdx: number, order: RouteOrder, intelPrice: number | null, hasWh: boolean): string {
  const whOpts = hasWh
    ? `<option value="unload" ${order.mode === "unload" ? "selected" : ""}>Store</option>
       <option value="load" ${order.mode === "load" ? "selected" : ""}>Load</option>`
    : "";
  const isMarket = order.mode === "buy" || order.mode === "sell";
  const limitField = isMarket
    ? `<input type="number" min="1" placeholder="any ɡ" value="${order.limit ?? ""}"
        data-edit="order-limit" data-stop="${stopIdx}" data-order="${orderIdx}"
        title="${order.mode === "buy" ? "Max price to pay" : "Min price to accept"}" />`
    : `<span class="order-intel" style="opacity:0.5;">whs</span>`;
  return `
    <div class="order-row">
      <select data-edit="order-good" data-stop="${stopIdx}" data-order="${orderIdx}">${goodOptions(order.goodId)}</select>
      <select data-edit="order-mode" data-stop="${stopIdx}" data-order="${orderIdx}">
        <option value="buy" ${order.mode === "buy" ? "selected" : ""}>Buy</option>
        <option value="sell" ${order.mode === "sell" ? "selected" : ""}>Sell</option>
        ${whOpts}
      </select>
      <input type="number" min="1" placeholder="all" value="${order.qty === "all" ? "" : order.qty}"
        data-edit="order-qty" data-stop="${stopIdx}" data-order="${orderIdx}" title="Quantity (blank = as much as possible)" />
      ${limitField}
      <span class="order-intel">${intelPrice !== null ? `~${intelPrice}ɡ` : "?"}</span>
      <button class="qty-btn" data-edit="order-del" data-stop="${stopIdx}" data-order="${orderIdx}">✕</button>
    </div>
  `;
}

function renderRouteEditor(state: GameState, root: HTMLElement, ui: ModalUI) {
  if (state.modal?.kind !== "route-edit") return;
  const modal = state.modal;
  const route = state.routes.find((r) => r.id === modal.routeId);
  if (!route) {
    state.modal = { kind: "routes" };
    ui.refresh();
    return;
  }

  const stopCards = route.stops.map((stop, si) => {
    const city = CITY_BY_ID[stop.cityId];
    const intel = state.intel[stop.cityId];
    const hasWh = hasWarehouse(state, stop.cityId);
    const orders = stop.orders.map((o, oi) =>
      orderRow(si, oi, o, intel ? intel.prices[o.goodId] : null, hasWh)
    ).join("");
    const intelNote = intel
      ? `prices as of ${formatDateShort(intel.date)}`
      : "no price intelligence";
    return `
      <div class="route-stop-card">
        <div class="route-stop-header">
          <span><b>${si + 1}.</b> ${city?.name ?? stop.cityId} <span style="font-size:10px; color:var(--ink-faded);">(${intelNote})</span></span>
          <button class="qty-btn" data-edit="stop-del" data-stop="${si}">✕</button>
        </div>
        ${orders || `<div style="font-size:11px; font-style:italic; color: var(--ink-faded); padding: 2px 0;">No orders — caravan only passes through.</div>`}
        <button class="action order-add" data-edit="order-add" data-stop="${si}">+ order</button>
      </div>
    `;
  }).join("");

  const assigned = caravansOnRoute(state, route.id);
  const assignedNote = assigned.length > 0
    ? assigned.map((c) => c.name).join(", ")
    : "none — open a caravan's panel and pick this route";

  root.innerHTML = `
    <div class="modal-bg">
      <div class="modal" style="max-width: 680px; max-height: 86vh; overflow-y: auto;">
        <div class="modal-title" style="display:flex; gap:10px; align-items:baseline;">
          <input type="text" value="${escapeHtml(route.name)}" data-edit="route-name" class="route-name-input" />
        </div>
        <div style="font-size:11px; color: var(--ink-faded); margin-bottom:10px; font-style:italic;">
          At each stop the caravan first sells, then buys, then departs for the next stop. Quantity blank = "as much as possible". Limit blank = any price.
        </div>
        ${stopCards || `<div style="font-style:italic; color: var(--ink-faded);">No stops yet — add at least two.</div>`}
        <div class="route-add-stop">
          <select id="add-stop-city">${cityOptions()}</select>
          <button class="action" id="add-stop">+ Add stop</button>
        </div>
        <div class="section-title">Assigned caravans</div>
        <div style="font-size:12px; color: var(--ink-soft);">${assignedNote}</div>
        <div class="modal-actions">
          <button class="action" id="back-routes">‹ All routes</button>
          <button class="action" id="modal-dismiss">Close</button>
        </div>
      </div>
    </div>
  `;

  root.querySelector<HTMLButtonElement>("#modal-dismiss")?.addEventListener("click", () => ui.close());
  root.querySelector<HTMLButtonElement>("#back-routes")?.addEventListener("click", () => {
    state.modal = { kind: "routes" };
    ui.refresh();
  });
  root.querySelector<HTMLInputElement>("[data-edit='route-name']")?.addEventListener("change", (ev) => {
    route.name = (ev.currentTarget as HTMLInputElement).value.trim() || route.name;
    ui.refresh();
  });
  root.querySelector<HTMLButtonElement>("#add-stop")?.addEventListener("click", () => {
    const sel = root.querySelector<HTMLSelectElement>("#add-stop-city")!;
    route.stops.push({ cityId: sel.value, orders: [] });
    ui.refresh();
  });
  root.querySelectorAll<HTMLElement>("[data-edit='stop-del']").forEach((e) => {
    e.addEventListener("click", () => {
      route.stops.splice(Number(e.dataset.stop), 1);
      ui.refresh();
    });
  });
  root.querySelectorAll<HTMLElement>("[data-edit='order-add']").forEach((e) => {
    e.addEventListener("click", () => {
      route.stops[Number(e.dataset.stop)].orders.push({ goodId: "grain", mode: "buy", qty: "all" });
      ui.refresh();
    });
  });
  root.querySelectorAll<HTMLElement>("[data-edit='order-del']").forEach((e) => {
    e.addEventListener("click", () => {
      route.stops[Number(e.dataset.stop)].orders.splice(Number(e.dataset.order), 1);
      ui.refresh();
    });
  });
  root.querySelectorAll<HTMLSelectElement>("[data-edit='order-good']").forEach((e) => {
    e.addEventListener("change", () => {
      route.stops[Number(e.dataset.stop)].orders[Number(e.dataset.order)].goodId = e.value as GoodId;
      ui.refresh();
    });
  });
  root.querySelectorAll<HTMLSelectElement>("[data-edit='order-mode']").forEach((e) => {
    e.addEventListener("change", () => {
      route.stops[Number(e.dataset.stop)].orders[Number(e.dataset.order)].mode = e.value as RouteOrder["mode"];
      ui.refresh();
    });
  });
  root.querySelectorAll<HTMLInputElement>("[data-edit='order-qty']").forEach((e) => {
    e.addEventListener("change", () => {
      const v = parseInt(e.value, 10);
      route.stops[Number(e.dataset.stop)].orders[Number(e.dataset.order)].qty =
        Number.isFinite(v) && v > 0 ? v : "all";
      ui.refresh();
    });
  });
  root.querySelectorAll<HTMLInputElement>("[data-edit='order-limit']").forEach((e) => {
    e.addEventListener("change", () => {
      const v = parseInt(e.value, 10);
      route.stops[Number(e.dataset.stop)].orders[Number(e.dataset.order)].limit =
        Number.isFinite(v) && v > 0 ? v : undefined;
      ui.refresh();
    });
  });
}

export function routesButtonAvailable(_route?: TradeRoute): boolean {
  return true;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
