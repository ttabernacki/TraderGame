import type { GameState, Caravan } from "../game/types";
import { project, Viewport } from "./projection";
import {
  HRE_OUTLINE, RHINE, DANUBE, ELBE, MAIN_RIVER, ODER, SEA_FILL, ITALY_HINT,
} from "./geography";
import { caravanCurrentPos } from "../game/caravan";

const PARCHMENT = "#e8d9b0";
const PARCHMENT_DARK = "#d4be8a";
const INK = "#3a2818";
const INK_SOFT = "#5a4028";
const INK_FADED = "#8a6a44";
const SEA = "#c5cfb8";
const SEA_DEEP = "#aebca0";
const RIVER = "#7d92a8";
const GOLD = "#b8923a";
const BLOOD = "#7a2418";

// Noise is rendered to an offscreen canvas (then drawImage'd) rather than
// putImageData'd directly: putImageData ignores the active transform and the
// CSS-pixel-sized ImageData would land in the top-left of the backing buffer
// on HiDPI displays, leaving the rest exposed as transparent.
let noiseCache: HTMLCanvasElement | null = null;
let noiseCacheKey = "";

function getNoiseCanvas(w: number, h: number): HTMLCanvasElement {
  const key = `${w}x${h}`;
  if (noiseCache && noiseCacheKey === key) return noiseCache;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const offCtx = off.getContext("2d")!;
  const img = offCtx.createImageData(w, h);
  let seed = 0x9e3779b1;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const v = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    const n = Math.floor(v * 50);
    img.data[i] = 0;
    img.data[i + 1] = 0;
    img.data[i + 2] = 0;
    img.data[i + 3] = n < 12 ? 18 : n < 24 ? 8 : 0;
  }
  offCtx.putImageData(img, 0, 0);
  noiseCache = off;
  noiseCacheKey = key;
  return off;
}

function drawPolyline(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  vp: Viewport,
  stroke: string,
  width: number,
  dashed = false,
  closed = false,
) {
  if (pts.length === 0) return;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const { x, y } = project(pts[i][0], pts[i][1], vp);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  if (closed) ctx.closePath();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  if (dashed) ctx.setLineDash([6, 6]);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  if (dashed) ctx.setLineDash([]);
}

function drawFilledPoly(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  vp: Viewport,
  fill: string,
) {
  if (pts.length === 0) return;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const { x, y } = project(pts[i][0], pts[i][1], vp);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

export interface MapHit {
  kind: "city" | "caravan" | "none";
  id?: string;
}

export interface RenderInfo {
  cityPositions: Record<string, { x: number; y: number; r: number }>;
  caravanPositions: Record<string, { x: number; y: number; r: number }>;
}

export function renderMap(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  vp: Viewport,
  camera: { x: number; y: number },
): RenderInfo {
  ctx.save();
  ctx.fillStyle = PARCHMENT;
  ctx.fillRect(0, 0, vp.width, vp.height);

  // Vignette using radial gradient (parchment edges darker).
  const cx = vp.width / 2;
  const cy = vp.height / 2;
  const grad = ctx.createRadialGradient(cx, cy, Math.min(vp.width, vp.height) * 0.25, cx, cy, Math.max(vp.width, vp.height) * 0.65);
  grad.addColorStop(0, "rgba(168, 144, 96, 0.0)");
  grad.addColorStop(1, "rgba(90, 60, 24, 0.45)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, vp.width, vp.height);

  // Everything below pans with the camera. Noise overlay is drawn at
  // (-camera.x, -camera.y) so it remains pinned to the viewport.
  ctx.translate(camera.x, camera.y);

  // Seas
  for (const poly of SEA_FILL) drawFilledPoly(ctx, poly, vp, SEA);
  // Sea hatching (suggest waves)
  ctx.save();
  ctx.strokeStyle = SEA_DEEP;
  ctx.lineWidth = 0.6;
  ctx.globalAlpha = 0.7;
  for (const poly of SEA_FILL) {
    // Clip to sea polygon.
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < poly.length; i++) {
      const { x, y } = project(poly[i][0], poly[i][1], vp);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.clip();
    // Hatching lines (gentle waves).
    for (let y = 0; y < vp.height; y += 8) {
      ctx.beginPath();
      for (let x = 0; x < vp.width; x += 16) {
        const yy = y + Math.sin((x + y) * 0.04) * 1.2;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();

  // HRE landmass fill (slight tint over parchment) and outline.
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < HRE_OUTLINE.length; i++) {
    const { x, y } = project(HRE_OUTLINE[i][0], HRE_OUTLINE[i][1], vp);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = PARCHMENT_DARK;
  ctx.globalAlpha = 0.55;
  ctx.fill();
  ctx.restore();

  drawPolyline(ctx, HRE_OUTLINE, vp, INK_SOFT, 2.2, false, true);
  // Decorative double-line border (faint outer)
  ctx.save();
  ctx.globalAlpha = 0.4;
  drawPolyline(ctx, HRE_OUTLINE, vp, INK_FADED, 5.5, false, true);
  ctx.restore();

  // Italy hint
  drawPolyline(ctx, ITALY_HINT, vp, INK_FADED, 1.5);

  // Rivers
  for (const r of [RHINE, DANUBE, ELBE, MAIN_RIVER, ODER]) {
    drawPolyline(ctx, r, vp, RIVER, 2.0);
  }

  // Parchment noise overlay — drawn at (-camera) so it stays viewport-fixed.
  ctx.drawImage(getNoiseCanvas(vp.width, vp.height), -camera.x, -camera.y);

  // Hovered/selected route preview (dispatch mode)
  const cityPositions: Record<string, { x: number; y: number; r: number }> = {};
  for (const city of state.cities) {
    const p = project(city.lat, city.lon, vp);
    cityPositions[city.id] = { x: p.x, y: p.y, r: cityRadius(city.population) };
  }

  if (state.selection.kind === "dispatch") {
    const sel = state.selection;
    const caravan = state.caravans.find((c) => c.id === sel.caravanId);
    if (caravan && caravan.cityId) {
      const from = cityPositions[caravan.cityId];
      if (state.hoveredCity && state.hoveredCity !== caravan.cityId) {
        const to = cityPositions[state.hoveredCity];
        if (from && to) {
          ctx.save();
          ctx.strokeStyle = GOLD;
          ctx.lineWidth = 2.2;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      }
    }
  }

  // Traveling caravan paths (faint dashed) and current positions
  const caravanPositions: Record<string, { x: number; y: number; r: number }> = {};
  for (const c of state.caravans) {
    const pos = caravanCurrentPos(c);
    if (!pos) continue;
    const from = cityPositions[pos.fromId];
    const to = cityPositions[pos.toId];
    if (!from || !to) continue;
    ctx.save();
    ctx.strokeStyle = INK_FADED;
    ctx.lineWidth = 1.3;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    const cx2 = from.x + (to.x - from.x) * pos.t;
    const cy2 = from.y + (to.y - from.y) * pos.t;
    drawCaravanMarker(ctx, cx2, cy2, c, state);
    caravanPositions[c.id] = { x: cx2, y: cy2, r: 9 };
  }

  // Cities. Markets with no price intelligence are drawn faded.
  for (const city of state.cities) {
    const { x, y, r } = cityPositions[city.id];
    const isHover = state.hoveredCity === city.id;
    const isSelected = state.selection.kind === "city" && state.selection.id === city.id;
    const known = state.intel[city.id] !== undefined;
    drawCityMarker(ctx, x, y, r, city.name, isHover, isSelected, known);
  }

  // Caravans idle in a city: draw a small badge.
  const idleAtCity: Record<string, number> = {};
  for (const c of state.caravans) {
    if (c.status === "idle" && c.cityId) {
      idleAtCity[c.cityId] = (idleAtCity[c.cityId] ?? 0) + 1;
    }
  }
  for (const cityId of Object.keys(idleAtCity)) {
    const pos = cityPositions[cityId];
    if (!pos) continue;
    const n = idleAtCity[cityId];
    drawIdleCaravanBadge(ctx, pos.x + pos.r + 6, pos.y - pos.r - 2, n);
    // Hit area for clicking caravans at city handled by clicking city first.
  }

  ctx.restore();
  return { cityPositions, caravanPositions };
}

function cityRadius(pop: number): number {
  if (pop >= 35000) return 7;
  if (pop >= 20000) return 6;
  if (pop >= 12000) return 5;
  return 4;
}

function drawCityMarker(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  name: string,
  hover: boolean,
  selected: boolean,
  known: boolean,
) {
  ctx.save();
  if (!known && !hover && !selected) ctx.globalAlpha = 0.55;
  // Outer ring (selection)
  if (selected) {
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (hover) {
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = INK_SOFT;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // Filled dot
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r - 2, 0, Math.PI * 2);
  ctx.fillStyle = PARCHMENT;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r - 4, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();

  // Label
  ctx.font = `${hover || selected ? "600" : "500"} ${r >= 6 ? 13 : 12}px "Palatino", "Iowan Old Style", Georgia, serif`;
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const labelX = x + r + 4;
  const labelY = y;
  // Light parchment outline to keep text readable on dark hatching
  ctx.strokeStyle = "rgba(232, 217, 176, 0.9)";
  ctx.lineWidth = 3;
  ctx.strokeText(name, labelX, labelY);
  ctx.fillText(name, labelX, labelY);
  ctx.restore();
}

function drawCaravanMarker(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, c: Caravan, state: GameState,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // Mark selection
  if (state.selection.kind === "caravan" && state.selection.id === c.id) {
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.strokeStyle = BLOOD;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawIdleCaravanBadge(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, n: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = "700 11px Palatino, Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), x, y + 1);
  ctx.restore();
}
