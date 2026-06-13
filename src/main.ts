import "./style.css";
import { makeInitialState } from "./game/state";
import { tickGame } from "./game/loop";
import { renderMap, RenderInfo } from "./render/map";
import type { Viewport } from "./render/projection";
import { renderHUD } from "./ui/hud";
import { renderBottomBar } from "./ui/bottomBar";
import { renderEventLog } from "./ui/eventLog";
import { renderSidePanel, PanelActions } from "./ui/sidePanel";
import { renderFleetRoster } from "./ui/fleetRoster";
import { renderModal } from "./ui/modals";
import { dispatchCaravan, hireCaravan, caravanCargoUnits } from "./game/caravan";
import { assignCaravanToRoute } from "./game/routes";
import { executeTrade } from "./game/economy";
import { rentWarehouse, depositToWarehouse, withdrawFromWarehouse } from "./game/warehouse";
import { GOOD_BY_ID } from "./data/goods";
import { CITY_BY_ID } from "./data/cities";
import { pushLog } from "./game/log";
import type { Speed, GameState, GoodId } from "./game/types";

const state: GameState = makeInitialState();
(window as unknown as { __state: GameState }).__state = state;

const canvas = document.getElementById("map") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

let lastRender: RenderInfo = { cityPositions: {}, caravanPositions: {} };
let lastFrameMs = performance.now();
let needsHtmlRefresh = true;

const camera = { x: 0, y: 0 };
const keysHeld = new Set<string>();
const PAN_PX_PER_SEC = 520;
const PAN_BOOST_PX_PER_SEC = 1100;

function sizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

sizeCanvas();
window.addEventListener("resize", () => {
  sizeCanvas();
  needsHtmlRefresh = true;
});

function viewport(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight, padding: 70 };
}

function frame(now: number) {
  const dt = Math.min(80, now - lastFrameMs);
  lastFrameMs = now;
  updateCamera(dt);
  const beforeYear = state.date.year;
  const beforeModal = state.modal;
  tickGame(state, dt);
  // Render map every frame for caravan animation.
  lastRender = renderMap(ctx, state, viewport(), camera);
  // Refresh DOM UI when state-relevant fields change or speed changes.
  if (needsHtmlRefresh || beforeYear !== state.date.year || beforeModal !== state.modal) {
    refreshHtmlUI();
    needsHtmlRefresh = false;
  } else {
    // Cheap refreshes that need to happen every frame (date display + log timestamps + treasury).
    renderHUD(state);
    renderEventLog(state);
  }
  requestAnimationFrame(frame);
}

function updateCamera(dtMs: number) {
  if (state.modal) return;
  let dx = 0, dy = 0;
  if (keysHeld.has("w") || keysHeld.has("arrowup")) dy += 1;
  if (keysHeld.has("s") || keysHeld.has("arrowdown")) dy -= 1;
  if (keysHeld.has("a") || keysHeld.has("arrowleft")) dx += 1;
  if (keysHeld.has("d") || keysHeld.has("arrowright")) dx -= 1;
  if (dx === 0 && dy === 0) return;
  // Normalise so diagonal isn't faster than cardinal.
  const len = Math.hypot(dx, dy);
  dx /= len; dy /= len;
  const speed = keysHeld.has("shift") ? PAN_BOOST_PX_PER_SEC : PAN_PX_PER_SEC;
  const step = (dtMs / 1000) * speed;
  camera.x += dx * step;
  camera.y += dy * step;
  // Soft clamp so the user can't pan into the void: the camera offset is in
  // CSS pixels, so cap roughly to one viewport on each side.
  const vp = viewport();
  const maxX = vp.width * 0.9;
  const maxY = vp.height * 0.9;
  if (camera.x > maxX) camera.x = maxX;
  if (camera.x < -maxX) camera.x = -maxX;
  if (camera.y > maxY) camera.y = maxY;
  if (camera.y < -maxY) camera.y = -maxY;
}

function refreshHtmlUI() {
  renderHUD(state);
  renderBottomBar(state, setSpeed, openRoutes);
  renderEventLog(state);
  renderFleetRoster(state, rosterActions);
  renderSidePanel(state, panelActions);
  renderModal(state, modalUI);
}

function centerOnCity(cityId: string) {
  const pos = lastRender.cityPositions[cityId];
  if (!pos) return;
  // Recenter the camera so the city sits near screen centre.
  const vp = viewport();
  camera.x = vp.width / 2 - pos.x;
  camera.y = vp.height / 2 - pos.y;
}

function centerOnCaravan(c: { cityId: string | null; fromCityId: string | null }) {
  const id = c.cityId ?? c.fromCityId;
  if (id) centerOnCity(id);
}

function setSpeed(s: Speed) {
  if (state.modal !== null) return;
  state.speed = s;
  needsHtmlRefresh = true;
}

function openRoutes() {
  state.modal = { kind: "routes" };
  needsHtmlRefresh = true;
}

const modalUI = {
  close: () => { state.modal = null; needsHtmlRefresh = true; },
  refresh: () => { needsHtmlRefresh = true; },
};

// ---- Trade / warehouse action handlers (shared by panel) ----

function doTrade(caravanId: string, cityId: string, goodId: GoodId, dir: "buy" | "sell", qty: number | "max" | "all") {
  const caravan = state.caravans.find((c) => c.id === caravanId);
  if (!caravan || caravan.cityId !== cityId) return;
  if (dir === "buy") {
    const space = caravan.capacity - caravanCargoUnits(caravan);
    const maxUnits = qty === "max" ? space : Math.min(qty as number, space);
    const res = executeTrade(state, cityId, goodId, "buy", maxUnits);
    if (res.units > 0) {
      caravan.cargo[goodId] = (caravan.cargo[goodId] ?? 0) + res.units;
      const avg = (res.gold / res.units).toFixed(1);
      pushLog(state, `Bought ${res.units} ${GOOD_BY_ID[goodId].name} in ${CITY_BY_ID[cityId].name} (avg ${avg}ɡ, total ${res.gold}ɡ).`, "trade");
    }
  } else {
    const have = caravan.cargo[goodId] ?? 0;
    const maxUnits = qty === "all" ? have : Math.min(qty as number, have);
    const res = executeTrade(state, cityId, goodId, "sell", maxUnits);
    if (res.units > 0) {
      caravan.cargo[goodId] = have - res.units;
      const avg = (res.gold / res.units).toFixed(1);
      pushLog(state, `Sold ${res.units} ${GOOD_BY_ID[goodId].name} in ${CITY_BY_ID[cityId].name} (avg ${avg}ɡ, total ${res.gold}ɡ).`, "trade");
    }
  }
  needsHtmlRefresh = true;
}

function doWarehouseMove(caravanId: string, cityId: string, goodId: GoodId, dir: "store" | "take", qty: number | "all") {
  const caravan = state.caravans.find((c) => c.id === caravanId);
  if (!caravan) return;
  if (dir === "store") {
    const have = caravan.cargo[goodId] ?? 0;
    const n = qty === "all" ? have : Math.min(qty, have);
    depositToWarehouse(state, caravanId, cityId, goodId, n);
  } else {
    const space = caravan.capacity - caravanCargoUnits(caravan);
    const wh = state.warehouses[cityId];
    const stored = wh ? wh.goods[goodId] : 0;
    const n = qty === "all" ? stored : Math.min(qty, stored);
    withdrawFromWarehouse(state, caravanId, cityId, goodId, n, space);
  }
  needsHtmlRefresh = true;
}

const panelActions: PanelActions = {
  closePanel: () => { state.selection = { kind: "none" }; needsHtmlRefresh = true; },
  selectCaravan: (id: string) => { state.selection = { kind: "caravan", id }; needsHtmlRefresh = true; },
  beginDispatch: (caravanId: string) => { state.selection = { kind: "dispatch", caravanId }; needsHtmlRefresh = true; },
  recallSelection: () => {
    if (state.selection.kind === "dispatch") {
      state.selection = { kind: "caravan", id: state.selection.caravanId };
    } else {
      state.selection = { kind: "none" };
    }
    needsHtmlRefresh = true;
  },
  hireCaravan: (cityId: string) => {
    hireCaravan(state, cityId);
    needsHtmlRefresh = true;
  },
  assignRoute: (caravanId: string, routeId: string | null) => {
    assignCaravanToRoute(state, caravanId, routeId);
    needsHtmlRefresh = true;
  },
  setActiveTradeCaravan: (caravanId: string) => {
    state.activeTradeCaravan = caravanId;
    // Keep selection in sync so the panel's forced-active caravan updates too.
    if (state.selection.kind === "caravan") {
      state.selection = { kind: "caravan", id: caravanId };
    }
    needsHtmlRefresh = true;
  },
  trade: doTrade,
  rentWarehouse: (cityId: string) => {
    rentWarehouse(state, cityId);
    needsHtmlRefresh = true;
  },
  warehouseMove: doWarehouseMove,
};

const rosterActions = {
  selectCaravan: (id: string) => { state.selection = { kind: "caravan", id }; needsHtmlRefresh = true; },
  beginDispatch: (caravanId: string) => { state.selection = { kind: "dispatch", caravanId }; needsHtmlRefresh = true; },
  focusCaravan: (id: string) => {
    const c = state.caravans.find((x) => x.id === id);
    state.selection = { kind: "caravan", id };
    state.activeTradeCaravan = id;
    if (c) centerOnCaravan(c);
    needsHtmlRefresh = true;
  },
};

// ---- Input ----

function hitTest(x: number, y: number): { kind: "city" | "caravan"; id: string } | null {
  // Stored positions are in pre-camera world coords; adjust the mouse.
  const wx = x - camera.x;
  const wy = y - camera.y;
  for (const [id, p] of Object.entries(lastRender.caravanPositions)) {
    const dx = wx - p.x, dy = wy - p.y;
    if (dx * dx + dy * dy <= p.r * p.r) return { kind: "caravan", id };
  }
  let best: { id: string; d2: number } | null = null;
  for (const [id, p] of Object.entries(lastRender.cityPositions)) {
    const dx = wx - p.x, dy = wy - p.y;
    const r = p.r + 6;
    const d2 = dx * dx + dy * dy;
    if (d2 <= r * r && (!best || d2 < best.d2)) best = { id, d2 };
  }
  if (best) return { kind: "city", id: best.id };
  return null;
}

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const hit = hitTest(x, y);
  const newHover = hit?.kind === "city" ? hit.id : null;
  if (newHover !== state.hoveredCity) {
    state.hoveredCity = newHover;
    if (state.selection.kind === "dispatch") needsHtmlRefresh = true; // dispatch panel preview
  }
});

canvas.addEventListener("click", (e) => {
  if (state.modal) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const hit = hitTest(x, y);

  // Dispatch mode: clicking a city sends caravan
  if (state.selection.kind === "dispatch") {
    if (hit?.kind === "city") {
      dispatchCaravan(state, state.selection.caravanId, hit.id);
      state.selection = { kind: "caravan", id: state.selection.caravanId };
      needsHtmlRefresh = true;
    }
    return;
  }

  if (hit?.kind === "city") {
    state.selection = { kind: "city", id: hit.id };
    needsHtmlRefresh = true;
  } else if (hit?.kind === "caravan") {
    state.selection = { kind: "caravan", id: hit.id };
    state.activeTradeCaravan = hit.id;
    needsHtmlRefresh = true;
  } else {
    state.selection = { kind: "none" };
    needsHtmlRefresh = true;
  }
});

// Right-click: dispatch the currently selected caravan to the clicked city in
// one gesture. Falls back to cancelling dispatch mode.
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (state.modal) return;
  const rect = canvas.getBoundingClientRect();
  const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);

  if (state.selection.kind === "dispatch") {
    if (hit?.kind === "city") {
      dispatchCaravan(state, state.selection.caravanId, hit.id);
      state.selection = { kind: "caravan", id: state.selection.caravanId };
    } else {
      state.selection = { kind: "caravan", id: state.selection.caravanId };
    }
    needsHtmlRefresh = true;
    return;
  }

  // If a caravan is selected and clickable destination is a city, send it.
  const selCaravanId =
    state.selection.kind === "caravan" ? state.selection.id : null;
  if (selCaravanId && hit?.kind === "city") {
    const c = state.caravans.find((x) => x.id === selCaravanId);
    if (c && c.status === "idle" && !c.routeId && c.cityId && c.cityId !== hit.id) {
      dispatchCaravan(state, selCaravanId, hit.id);
      needsHtmlRefresh = true;
    }
  }
});

const PAN_KEYS = new Set([
  "w", "a", "s", "d",
  "arrowup", "arrowdown", "arrowleft", "arrowright",
]);

function typingInField(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

window.addEventListener("keydown", (e) => {
  // Escape always works, even mid-typing, to back out of modals.
  if (e.key === "Escape") {
    if (state.modal) { modalUI.close(); return; }
    if (state.selection.kind === "dispatch") {
      state.selection = { kind: "caravan", id: state.selection.caravanId };
      needsHtmlRefresh = true;
      return;
    }
    if (state.selection.kind !== "none") {
      state.selection = { kind: "none" };
      needsHtmlRefresh = true;
    }
    return;
  }

  // Don't hijack keys while the user is editing a route name or order field.
  if (typingInField(e)) return;

  const k = e.key.toLowerCase();
  if (PAN_KEYS.has(k)) {
    keysHeld.add(k);
    e.preventDefault();
    return;
  }
  if (e.key === "Shift") {
    keysHeld.add("shift");
    return;
  }
  if (e.key === " " || e.code === "Space") {
    e.preventDefault();
    setSpeed(state.speed === 0 ? 1 : 0);
    return;
  }
  if (e.key === "1") setSpeed(1);
  if (e.key === "2") setSpeed(2);
  if (e.key === "3") setSpeed(5);
  if (k === "r" && !state.modal) openRoutes();
  if (k === "0") { camera.x = 0; camera.y = 0; }
});

window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if (PAN_KEYS.has(k)) keysHeld.delete(k);
  if (e.key === "Shift") keysHeld.delete("shift");
});

window.addEventListener("blur", () => {
  // Window lost focus while user was holding a key — clear so we don't
  // pan forever after they tab away.
  keysHeld.clear();
});

// First HTML render and start the loop.
refreshHtmlUI();
requestAnimationFrame(frame);
