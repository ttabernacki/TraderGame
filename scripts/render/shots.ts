/**
 * Browser entry for the deterministic render harness (see scripts/render/shots.cjs).
 * Drives Renderer.render() directly with fixed frames: no game, no RNG.
 * Exposes window.shoot(scene, opts) -> render stats.
 */
import { Renderer, type RenderFrame } from '../../src/render/renderer';
import { hullClass } from '../../src/ship/hull';
import { sunPosition } from '../../src/navigation/celestial';
import { initialSails } from '../../src/ship/physics';

interface Scene {
  lat: number; lon: number; hour: number; day?: number; cloud: number; rain?: number; storm?: boolean;
  wind: number; windFrom: number; wave: number; vis?: number; heading: number; cam?: string; dist?: number; yaw?: number; moonDay?: number; sunLook?: boolean; headSun?: boolean; pitch?: number;
}

const SCENES: Record<string, Scene> = {
  // open sea, mid Atlantic
  dawn:     { sunLook: true, lat: 20, lon: -35, hour: 5.9,  cloud: 0.3, wind: 14, windFrom: 60, wave: 1.4, heading: 100 },
  noon:     { lat: 20, lon: -35, hour: 12.2, cloud: 0.25, wind: 14, windFrom: 60, wave: 1.4, heading: 100 },
  dusk:     { sunLook: true, lat: 20, lon: -35, hour: 18.3, cloud: 0.35, wind: 12, windFrom: 60, wave: 1.2, heading: 250 },
  night:    { lat: 20, lon: -35, hour: 23.0, cloud: 0.15, wind: 10, windFrom: 60, wave: 1.0, heading: 100, moonDay: 14 },
  overcast: { lat: 40, lon: -20, hour: 11.0, cloud: 0.95, rain: 0.25, wind: 18, windFrom: 220, wave: 2.6, vis: 8, heading: 60 },
  gale:     { lat: 45, lon: -20, hour: 15.0, cloud: 1.0, rain: 0.9, storm: true, wind: 42, windFrom: 250, wave: 7.5, vis: 3, heading: 70 },
  backlit:  { headSun: true, lat: 20, lon: -35, hour: 16.6, cloud: 0.25, wind: 12, windFrom: 100, wave: 1.2, heading: 270, pitch: -4 },
  // coast / port
  coast:    { lat: 38.60, lon: -9.62, hour: 9.0, cloud: 0.3, wind: 12, windFrom: 330, wave: 1.2, heading: 20 },
  port:     { lat: 32.60, lon: -16.80, hour: 16.8, cloud: 0.3, wind: 8, windFrom: 40, wave: 0.8, heading: 340 },
  // R3/R4 scenes: hull close-ups, a ship under a town, a coast at low sun
  hull:     { lat: 20, lon: -35, hour: 15.2, cloud: 0.2, wind: 12, windFrom: 20, wave: 1.0, heading: 100, cam: 'beam', dist: 26, pitch: -6 },
  hullnoon: { lat: 20, lon: -35, hour: 12.4, cloud: 0.2, wind: 12, windFrom: 20, wave: 1.0, heading: 100, cam: 'beam', dist: 26, pitch: -6 },
  hulldusk: { lat: 20, lon: -35, hour: 17.9, day: 150, cloud: 0.3, wind: 10, windFrom: 20, wave: 1.0, heading: 100, cam: 'beam', dist: 24, pitch: -4 },
  hulllow:  { lat: 20, lon: -35, hour: 15.2, cloud: 0.2, wind: 12, windFrom: 20, wave: 1.0, heading: 100, cam: 'low', pitch: -4 },
  funchal:  { lat: 32.60, lon: -16.91, hour: 17.4, cloud: 0.25, wind: 6, windFrom: 200, wave: 0.5, heading: 90, cam: 'beam', dist: 46, pitch: -4 },
  funchalw: { lat: 32.622, lon: -16.915, hour: 17.9, cloud: 0.2, wind: 6, windFrom: 200, wave: 0.5, heading: 20, pitch: -3 },
  funchalc: { lat: 32.622, lon: -16.915, hour: 18.05, cloud: 0.2, wind: 6, windFrom: 200, wave: 0.5, heading: 340, cam: 'deck', pitch: 1, yaw: 25 },
  lisboam:  { lat: 38.655, lon: -9.285, hour: 6.4, cloud: 0.25, wind: 8, windFrom: 330, wave: 0.6, heading: 75, pitch: -2, dist: 55 },
  lisboae:  { lat: 38.655, lon: -9.285, hour: 18.7, cloud: 0.25, wind: 8, windFrom: 330, wave: 0.6, heading: 20, pitch: -2, dist: 55, yaw: 60 },
  lisboa:   { lat: 38.655, lon: -9.30, hour: 16.9, cloud: 0.3, wind: 8, windFrom: 330, wave: 0.6, heading: 80, pitch: -6 },
  seadown:  { lat: 38, lon: -25, hour: 14.0, cloud: 0.5, wind: 28, windFrom: 250, wave: 3.4, vis: 12, heading: 70, pitch: -30, dist: 60 },
  whitecap: { lat: 38, lon: -25, hour: 14.0, cloud: 0.6, wind: 26, windFrom: 250, wave: 3.2, vis: 12, heading: 70, pitch: -5 },
};

declare global { interface Window { seq: (scene: string, o?: Record<string, unknown>) => Promise<unknown>; shoot: (scene: string, o?: Record<string, unknown>) => Promise<unknown>; setup: (o: Record<string, unknown>) => void } }

const canvas = document.getElementById('c') as HTMLCanvasElement;
let r: Renderer | null = null;

function frameOf(s: Scene, t: number, hull: ReturnType<typeof hullClass>): RenderFrame {
  const hd = s.heading * Math.PI / 180;
  const sp = 3.4;
  const sails = initialSails(hull).map((x) => ({ ...x, set: 1, trim: 40, side: -1 }));
  return {
    pos: { lat: s.lat, lon: s.lon }, heading: s.heading, heel: 8,
    velocityE: Math.sin(hd) * sp, velocityN: Math.cos(hd) * sp,
    sails, trimSign: -1, sailPressures: sails.map(() => 0.6),
    apparentBeta: 55, trueBeta: 55, apparentKnots: s.wind * 0.8, speedKnots: 6, rudder: 0,
    windFrom: s.windFrom, windKnots: s.wind, waveHeight: s.wave, swellFrom: s.windFrom + 20,
    cloud: s.cloud, rain: s.rain ?? 0, storm: !!s.storm, visibilityNm: s.vis ?? 24,
    dayFromEpoch: (s.moonDay ?? 6) + 20000, hourLocal: s.hour, dayOfYear: s.day ?? 150, year: 1498,
    simTime: t, sightingRangeNm: 12, stranger: null, fleet: [],
  };
}

function shadowMB(rr: any): number {
  // 8 bytes a texel: RGBA8 packed depth plus the depth renderbuffer, per shadow map in use
  let b = 0;
  for (const l of [rr.sun, rr.sun2]) if (l?.shadow?.map) b += l.shadow.mapSize.x * l.shadow.mapSize.y * 8;
  const w = rr.worldShadow; if (w?.bytes) b += w.bytes;
  return +(b / 1048576).toFixed(1);
}

window.setup = (o) => {
  const q = new URLSearchParams(location.search);
  const w = Number(o.w ?? q.get('w') ?? 960), h = Number(o.h ?? q.get('h') ?? 540);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  canvas.width = w; canvas.height = h;
};

window.shoot = async (name, o = {}) => {
  const s = { ...SCENES[name], ...(o.scene as object) } as Scene;
  const hull = hullClass((o.hull as string) ?? 'nau');
  if (!r) {
    r = new Renderer(canvas, hull);
  }
  const rr = r as unknown as Record<string, unknown> & Renderer;
  rr.setRenderMode(o.legacy ? 'legacy' : 'new');
  if (o.tier) rr.setQuality(o.tier as 'low');
  rr.cameraMode = ((o.cam as string) ?? s.cam ?? 'chase') as 'chase';
  rr.lookYaw = s.yaw ?? 0; rr.lookPitch = s.pitch ?? -8;
  if (s.sunLook) {
    const sp = sunPosition(s.lat, s.lon, 0, s.hour, s.day ?? 150);
    let d = sp.azimuth - s.heading; d = ((d + 540) % 360) - 180;
    rr.lookYaw = d * (Number(o.sign ?? 1));
    rr.lookPitch = s.pitch ?? -2;
  }
  rr.resetEase();
  rr.resize();
  if (s.dist) rr.distance = s.dist;
  const t0 = 1e9;
  if (s.headSun) { s.heading = sunPosition(s.lat, s.lon, 0, s.hour, s.day ?? 150).azimuth; }
  let pos = { ...s };
  const hd = s.heading * Math.PI / 180;
  const frames = Number(o.frames ?? 10);
  for (let i = 0; i < frames; i++) {
    const dt = 0.1;
    const f = frameOf(pos, t0 + i * dt, hull);
    rr.render(f, dt, dt);
  }
  const info = rr.renderer.info;
  const stats = {
    shadowMB: shadowMB(rr), mode: rr.renderMode, tier: rr.quality, rtMB: +(((rr as any).post?.bytes ?? 0) / 1048576).toFixed(1), passes: (rr as any).post?.passes ?? 0,
    calls: rr.perf.last.calls, tris: rr.perf.last.triangles,
    geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0,
  };
  void hd;
  const sm = (rr as any).settlements?.mesh;
  const box = sm ? (sm.geometry.boundingBox ?? (sm.geometry.computeBoundingBox(), sm.geometry.boundingBox)) : null;
  const gp = (rr as any).settlements?.group.position;
  return { ...stats, town: box ? [box.min.x + gp.x, box.max.x + gp.x, box.min.z + gp.z, box.max.z + gp.z].map((n: number) => Math.round(n)) : null };
};

/**
 * Temporal flicker harness. Renders N frames of a ship under way at 60 Hz (so the camera and the water
 * move by what they would in a frame) and measures, over the sea only: the mean absolute change in luma
 * between consecutive frames (flicker; 0-255), the fraction of sea pixels that differ from their frame
 * neighbour by more than 24 levels (sparkle), and the mean absolute step between horizontally adjacent
 * pixels (edge energy, which aliased detail raises). Ship, sky and the wake are masked out.
 */
const REF: { frames: Uint8ClampedArray[] } = { frames: [] };

/** Render n frames of the ship under way at 60 Hz, at ss times the resolution, box-filtered back to w x h. */
async function capture(name: string, o: Record<string, unknown>, w: number, h: number, ss: number): Promise<Uint8ClampedArray[]> {
  window.setup({ w: w * ss, h: h * ss });
  await window.shoot(name, o);
  const s = { ...SCENES[name], ...(o.scene as object) } as Scene;
  const hull = hullClass((o.hull as string) ?? 'nau');
  const rr = r as unknown as Renderer;
  const n = Number(o.n ?? 8);
  const W = w * ss, H = h * ss;
  const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
  const g = c2.getContext('2d', { willReadFrequently: true })!;
  const hd = s.heading * Math.PI / 180;
  const sp = Number(o.speed ?? 3.4);
  let t = 2e9, lat = s.lat, lon = s.lon;
  const out: Uint8ClampedArray[] = [];
  const yawRate = Number(o.yawRate ?? 0), pitchRate = Number(o.pitchRate ?? 0);
  for (let i = 0; i < n + 6; i++) {
    const dt = 1 / 60;
    rr.lookYaw += yawRate; rr.lookPitch += pitchRate;
    lat += Math.cos(hd) * sp * dt / 111320; lon += Math.sin(hd) * sp * dt / (111320 * Math.cos(lat * Math.PI / 180));
    rr.render(frameOf({ ...s, lat, lon }, t, hull), dt, dt); t += dt;
    if (i < 6) continue;
    g.drawImage(canvas, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    if (ss === 1) { out.push(d.slice()); continue; }
    const f = new Uint8ClampedArray(w * h * 4);
    const inv = 1 / (ss * ss);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r0 = 0, g0 = 0, b0 = 0;
      for (let yy = 0; yy < ss; yy++) for (let xx = 0; xx < ss; xx++) {
        const i4 = ((y * ss + yy) * W + x * ss + xx) * 4; r0 += d[i4]; g0 += d[i4 + 1]; b0 += d[i4 + 2];
      }
      const o4 = (y * w + x) * 4; f[o4] = r0 * inv; f[o4 + 1] = g0 * inv; f[o4 + 2] = b0 * inv; f[o4 + 3] = 255;
    }
    out.push(f);
  }
  window.setup({ w, h });
  return out;
}

/**
 * Temporal flicker harness. Over the sea only (ship column, sky and the lowest rows masked):
 *   flicker  mean |luma change| between consecutive 60 Hz frames, 0-255
 *   sparkle  per cent of sea pixels that change by more than 24 levels in one frame
 *   edge     mean |luma step| between horizontally adjacent pixels (aliased detail raises it)
 *   err      mean |luma difference| from the same frames rendered at 3x and box-filtered (ground truth); needs ref=1
 *   refFlicker  the 3x reference's own flicker: the part of the motion that is real water, not aliasing
 */
window.seq = async (name, o = {}) => {
  const w = Number(o.w), h = Number(o.h);
  if (o.refOnly) {
    const fr = await capture(name, o, w, h, 3);
    return { luma: fr.map((f) => Array.from({ length: w * h }, (_, i) => Math.round(0.2126 * f[i * 4] + 0.7152 * f[i * 4 + 1] + 0.0722 * f[i * 4 + 2]))) };
  }
  if (o.refLuma) REF.frames = (o.refLuma as number[][]).map((l) => { const f = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { f[i * 4] = f[i * 4 + 1] = f[i * 4 + 2] = l[i]; f[i * 4 + 3] = 255; } return f; });
  const grabs = await capture(name, o, w, h, 1);
  const y0 = Math.round(h * Number(o.seaTop ?? 0.5)), y1 = Math.round(h * 0.82);
  const xa = Math.round(w * 0.3), xb = Math.round(w * 0.7);
  const lum = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const flick = (fs: Uint8ClampedArray[]) => {
    let sum = 0, cnt = 0, spark = 0, edge = 0, ecnt = 0;
    for (let k = 1; k < fs.length; k++) {
      const a = fs[k - 1], b = fs[k];
      for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
        if (x > xa && x < xb) continue;
        const i = (y * w + x) * 4;
        const d = Math.abs(lum(a, i) - lum(b, i));
        sum += d; cnt++; if (d > 24) spark++;
        if (x + 1 < w && !(x + 1 > xa && x + 1 < xb)) { edge += Math.abs(lum(b, i) - lum(b, i + 4)); ecnt++; }
      }
    }
    return { flicker: sum / cnt, sparkle: 100 * spark / cnt, edge: edge / ecnt };
  };
  const m = flick(grabs);
  const res: Record<string, number> = { flicker: +m.flicker.toFixed(3), sparkle: +m.sparkle.toFixed(3), edge: +m.edge.toFixed(3) };
  if (REF.frames.length) {
    const rf = flick(REF.frames);
    let e = 0, c = 0;
    for (let k = 0; k < grabs.length && k < REF.frames.length; k++) {
      for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
        if (x > xa && x < xb) continue;
        const i = (y * w + x) * 4; e += Math.abs(lum(grabs[k], i) - lum(REF.frames[k], i)); c++;
      }
    }
    res.refFlicker = +rf.flicker.toFixed(3); res.refEdge = +rf.edge.toFixed(3); res.err = +(e / c).toFixed(3);
  }
  return res;
};
