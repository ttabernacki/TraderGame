import "./style.css";
import { makeInitialState } from "./game/state";
import { tickGame } from "./game/loop";
import { renderMap, RenderInfo } from "./render/map";
import type { Viewport } from "./render/projection";
import { renderHUD } from "./ui/hud";
import { renderBottomBar } from "./ui/bottomBar";
import { renderEventLog } from "./ui/eventLog";
import { renderSidePanel, PanelActions } from "./ui/sidePanel";
import { renderModal } from "./ui/modals";
import { dispatchCaravan, hireCaravan } from "./game/caravan";
import { assignCaravanToRoute } from "./game/routes";
import type { Speed, GameState } from "./game/types";

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
  renderSidePanel(state, panelActions);
  renderModal(state, modalUI);
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

const panelActions: PanelActions = {
  closePanel: () => { state.selection = { kind: "none" }; needsHtmlRefresh = true; },
  selectCaravan: (id: string) => { state.selection = { kind: "caravan", id }; needsHtmlRefresh = true; },
  beginDispatch: (caravanId: string) => { state.selection = { kind: "dispatch", caravanId }; needsHtmlRefresh = true; },
  openTrade: (caravanId: string, cityId: string) => {
    state.modal = { kind: "trade", caravanId, cityId };
    needsHtmlRefresh = true;
  },
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
    needsHtmlRefresh = true;
  } else {
    state.selection = { kind: "none" };
    needsHtmlRefresh = true;
  }
});

canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (state.selection.kind === "dispatch") {
    state.selection = { kind: "caravan", id: state.selection.caravanId };
    needsHtmlRefresh = true;
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
