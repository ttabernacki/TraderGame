import "./style.css";
import { makeInitialState } from "./game/state";
import { tickGame } from "./game/loop";
import { renderMap, RenderInfo } from "./render/map";
import type { Viewport } from "./render/projection";
import { renderHUD } from "./ui/hud";
import { renderBottomBar } from "./ui/bottomBar";
import { renderEventLog } from "./ui/eventLog";
import { renderSidePanel } from "./ui/sidePanel";
import { renderModal } from "./ui/modals";
import { dispatchCaravan } from "./game/caravan";
import type { Speed, GameState } from "./game/types";

const state: GameState = makeInitialState();
(window as unknown as { __state: GameState }).__state = state;

const canvas = document.getElementById("map") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

let lastRender: RenderInfo = { cityPositions: {}, caravanPositions: {} };
let lastFrameMs = performance.now();
let needsHtmlRefresh = true;

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
  const beforeYear = state.date.year;
  const beforeModal = state.modal;
  tickGame(state, dt);
  // Render map every frame for caravan animation.
  lastRender = renderMap(ctx, state, viewport());
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

function refreshHtmlUI() {
  renderHUD(state);
  renderBottomBar(state, setSpeed);
  renderEventLog(state);
  renderSidePanel(state, panelActions);
  renderModal(state, closeModal);
}

function setSpeed(s: Speed) {
  if (state.modal !== null) return;
  state.speed = s;
  needsHtmlRefresh = true;
}

function closeModal() {
  state.modal = null;
  needsHtmlRefresh = true;
}

const panelActions = {
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
};

// ---- Input ----

function hitTest(x: number, y: number): { kind: "city" | "caravan"; id: string } | null {
  for (const [id, p] of Object.entries(lastRender.caravanPositions)) {
    const dx = x - p.x, dy = y - p.y;
    if (dx * dx + dy * dy <= p.r * p.r) return { kind: "caravan", id };
  }
  let best: { id: string; d2: number } | null = null;
  for (const [id, p] of Object.entries(lastRender.cityPositions)) {
    const dx = x - p.x, dy = y - p.y;
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

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (state.modal) { closeModal(); return; }
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
  if (e.key === " " || e.code === "Space") {
    e.preventDefault();
    setSpeed(state.speed === 0 ? 1 : 0);
    return;
  }
  if (e.key === "1") setSpeed(1);
  if (e.key === "2") setSpeed(2);
  if (e.key === "3") setSpeed(5);
});

// First HTML render and start the loop.
refreshHtmlUI();
requestAnimationFrame(frame);
