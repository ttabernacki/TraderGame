/**
 * Browser entry for the deterministic render harness (see scripts/render/shots.cjs).
 * Drives Renderer.render() directly with fixed frames: no game, no RNG.
 * Exposes window.shoot(scene, opts) -> render stats.
 */
import { Renderer, type RenderFrame } from '../../src/render/renderer';
import { hullClass } from '../../src/ship/hull';
import { initialSails } from '../../src/ship/physics';

interface Scene {
  lat: number; lon: number; hour: number; day?: number; cloud: number; rain?: number; storm?: boolean;
  wind: number; windFrom: number; wave: number; vis?: number; heading: number; cam?: string; moonDay?: number;
}

const SCENES: Record<string, Scene> = {
  // open sea, mid Atlantic
  dawn:     { lat: 20, lon: -35, hour: 5.9,  cloud: 0.3, wind: 14, windFrom: 60, wave: 1.4, heading: 100 },
  noon:     { lat: 20, lon: -35, hour: 12.2, cloud: 0.25, wind: 14, windFrom: 60, wave: 1.4, heading: 100 },
  dusk:     { lat: 20, lon: -35, hour: 18.3, cloud: 0.35, wind: 12, windFrom: 60, wave: 1.2, heading: 250 },
  night:    { lat: 20, lon: -35, hour: 23.0, cloud: 0.15, wind: 10, windFrom: 60, wave: 1.0, heading: 100, moonDay: 14 },
  overcast: { lat: 40, lon: -20, hour: 11.0, cloud: 0.95, rain: 0.25, wind: 18, windFrom: 220, wave: 2.6, vis: 8, heading: 60 },
  gale:     { lat: 45, lon: -20, hour: 15.0, cloud: 1.0, rain: 0.9, storm: true, wind: 42, windFrom: 250, wave: 7.5, vis: 3, heading: 70 },
  // coast / port
  coast:    { lat: 38.60, lon: -9.62, hour: 9.0, cloud: 0.3, wind: 12, windFrom: 330, wave: 1.2, heading: 20 },
  port:     { lat: 32.60, lon: -16.80, hour: 16.8, cloud: 0.3, wind: 8, windFrom: 40, wave: 0.8, heading: 340 },
};

declare global { interface Window { shoot: (scene: string, o?: Record<string, unknown>) => Promise<unknown>; setup: (o: Record<string, unknown>) => void } }

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
  if (o.cam) rr.cameraMode = o.cam as 'chase';
  rr.resetEase();
  rr.resize();
  const t0 = 1e9;
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
    mode: rr.renderMode, tier: rr.quality,
    calls: rr.perf.last.calls, tris: rr.perf.last.triangles,
    geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0,
  };
  void hd;
  return stats;
};
