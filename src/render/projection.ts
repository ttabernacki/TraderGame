import { MAP_BBOX } from "../data/cities";

export interface Viewport {
  width: number;
  height: number;
  padding: number;
}

export function project(lat: number, lon: number, vp: Viewport): { x: number; y: number } {
  const w = vp.width - vp.padding * 2;
  const h = vp.height - vp.padding * 2;
  const lonRange = MAP_BBOX.maxLon - MAP_BBOX.minLon;
  const latRange = MAP_BBOX.maxLat - MAP_BBOX.minLat;
  // Equirectangular with cos correction at mid-lat for nicer aspect.
  const midLat = (MAP_BBOX.minLat + MAP_BBOX.maxLat) / 2;
  const lonScale = Math.cos((midLat * Math.PI) / 180);
  const correctedLonRange = lonRange * lonScale;
  // Determine fit: use whichever axis constrains.
  const sx = w / correctedLonRange;
  const sy = h / latRange;
  const s = Math.min(sx, sy);
  const drawnW = correctedLonRange * s;
  const drawnH = latRange * s;
  const offsetX = (w - drawnW) / 2 + vp.padding;
  const offsetY = (h - drawnH) / 2 + vp.padding;
  const x = offsetX + (lon - MAP_BBOX.minLon) * lonScale * s;
  const y = offsetY + (MAP_BBOX.maxLat - lat) * s;
  return { x, y };
}
