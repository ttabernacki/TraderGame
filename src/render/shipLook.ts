import * as THREE from 'three';
import type { HullClass } from '../ship/hull';

/**
 * What makes one ship look like herself and not like the next.
 *
 * The physics tells the hulls apart by their numbers; the eye tells them apart
 * by the shape of the ends and the paint. A caravel is low and flush, her
 * sheer barely lifting at bow and stern. A carrack carries a castle at each end
 * and a triangular forecastle thrust out over her stem. A great Indiaman has two
 * storeys aft, a gallery across her stern and her band chequered red and ochre.
 * The Biscayan galleon cut the forecastle down and put a beak out ahead of it.
 */
export type BandStyle = 'red' | 'black' | 'ochre' | 'checker' | 'chevron' | 'galleon';

export interface ShipLook {
  /** How steeply the sheer rises toward the ends: 0.5 flush, 1.3 a carrack's. */
  sheer: number;
  /** Height of the after castle, as a multiple of the stock nau's. */
  aft: number;
  /** How far forward the quarterdeck runs, as a fraction of her length. */
  aftLen: number;
  /** One storey aft, or a poop deck on top of the quarterdeck. */
  aftTiers: 1 | 2;
  /** Height of the forecastle; 0 for none. */
  fore: number;
  /** A carrack's forecastle, triangular and overhanging the stem. */
  overhang: boolean;
  beak: boolean;
  gallery: boolean;
  bowsprit: boolean;
  /** Round fighting tops on the square-rigged masts. */
  tops: boolean;
  band: BandStyle | null;
  /** Paint on the castle sides, or null for bare timber. */
  castlePaint: number | null;
  /** Her timber, which weathers differently on every ship. */
  oak: number;
  canvas: string;
  /** 0 new canvas, 1 patched and stained. */
  wear: number;
  lanterns: number;
  /** Painted shields hung along the castle rails. */
  shields: boolean;
  /** The device on the main course, and on the fore course too if `crossAll`. */
  device: 'cross' | 'saltire' | 'plain';
  crossAll: boolean;
  seed: number;
}

const BASE: Omit<ShipLook, 'seed'> = {
  sheer: 1, aft: 1, aftLen: 0.26, aftTiers: 1, fore: 1, overhang: false, beak: false,
  gallery: false, bowsprit: true, tops: false, band: null, castlePaint: null,
  oak: 0xa8814f, canvas: '#ded3ba', wear: 0.4, lanterns: 1, shields: false,
  device: 'cross', crossAll: false,
};

const STOCK: Record<string, Partial<ShipLook>> = {
  barcha: {
    sheer: 0.55, aft: 0.34, aftLen: 0.16, fore: 0, bowsprit: false,
    oak: 0x8c7050, canvas: '#cbbd9c', wear: 0.95,
  },
  'caravela-latina': {
    sheer: 0.6, aft: 0.55, aftLen: 0.22, fore: 0, bowsprit: false, band: 'black',
    oak: 0xa27b4b, canvas: '#d8cbae', wear: 0.6,
  },
  'caravela-redonda': {
    sheer: 0.72, aft: 0.7, aftLen: 0.24, fore: 0.36, band: 'red',
    oak: 0xa9824f, canvas: '#dbcfb3', wear: 0.5,
  },
  'nau-pequena': {
    sheer: 1, aft: 0.95, fore: 0.9, overhang: true, tops: true, band: 'red',
    oak: 0xa07a4a, wear: 0.42,
  },
  nau: {
    sheer: 1.12, aft: 1.05, aftLen: 0.28, aftTiers: 2, fore: 1.05, overhang: true, tops: true,
    band: 'chevron', castlePaint: 0x7d2c21, shields: true, oak: 0x9f7748, canvas: '#e2d8c0',
    wear: 0.3, crossAll: true,
  },
  'nau-da-india': {
    sheer: 1.28, aft: 1.28, aftLen: 0.3, aftTiers: 2, fore: 1.25, overhang: true, gallery: true,
    tops: true, band: 'checker', castlePaint: 0x8a3322, shields: true, oak: 0x98703f,
    canvas: '#e6dcc6', wear: 0.24, lanterns: 3, crossAll: true,
  },
  galeao: {
    sheer: 0.82, aft: 1.0, aftLen: 0.3, aftTiers: 2, fore: 0.5, beak: true, gallery: true,
    tops: true, band: 'galleon', castlePaint: 0x4a3626, oak: 0x8a6a44, canvas: '#e8dfc9',
    wear: 0.18, lanterns: 2, device: 'saltire',
  },
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function lookFor(hull: HullClass): ShipLook {
  const stock = hull.custom ? undefined : STOCK[hull.id];
  if (stock) return { ...BASE, ...stock, seed: hash(hull.id) };

  // A ship drawn to the captain's own lines: her castles and paint are his.
  const c = hull.castles ?? 0.6;
  const aft = 0.3 + c * 0.95;
  const squareFore = hull.masts.some((m) => m.rig === 'square' && m.station > 0.4);
  const band: Record<string, BandStyle | null> = { natural: null, red: 'red', black: 'black', ochre: 'ochre' };
  return {
    ...BASE,
    sheer: 0.55 + c * 0.7,
    aft,
    aftLen: 0.2 + c * 0.09,
    aftTiers: c > 0.8 ? 2 : 1,
    fore: aft > 0.45 ? aft * 0.9 : 0,
    overhang: c > 0.7,
    beak: c < 0.6 && hull.lwl >= 24,
    gallery: hull.lwl >= 28,
    bowsprit: squareFore,
    tops: hull.masts.some((m) => m.rig === 'square'),
    band: band[hull.paint ?? 'natural'] ?? null,
    castlePaint: hull.paint === 'red' ? 0x7d2c21 : hull.paint === 'black' ? 0x2a221b : null,
    canvas: '#e2d8c0',
    wear: 0.2,
    lanterns: hull.lwl >= 28 ? 2 : 1,
    shields: c > 0.85,
    device: hull.device === 'plain' ? 'plain' : 'cross',
    seed: hash(hull.id + hull.name),
  };
}

/** A small deterministic generator, so a ship's patches are hers every time. */
export function seeded(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

// ---------------------------------------------------------------------------
// Timber
// ---------------------------------------------------------------------------

let plank: THREE.CanvasTexture | null = null;
let plankNormal: THREE.CanvasTexture | null = null;
let plankRough: THREE.CanvasTexture | null = null;

/**
 * Planking: strakes of oak with the grain running along them, butt joints
 * staggered from strake to strake, treenails at the butts, and a tarred seam
 * between every strake. Pale and nearly neutral, because the ship's own colour
 * is carried in the vertex colours and this only multiplies it.
 *
 * Three maps come out of the one drawing so they cannot disagree with each
 * other: the colour; a tangent-space normal map taken from a height field in
 * which every strake is slightly crowned and the seams are grooves; and a
 * roughness map in which the tar is dull, the grain a little rougher than the
 * face, and hand-and-spray polished patches are smoother. The colour is the
 * only one the old picture used.
 *
 * Shared by every ship afloat. Never disposed.
 */
function buildPlankMaps(): void {
  const W = 512, H = 512, rows = 12;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    return c;
  };
  const cc = mk(), ch = mk(), cr = mk();
  const ctx = cc.getContext('2d')!;
  const hx = ch.getContext('2d', { willReadFrequently: true })!;
  const rx = cr.getContext('2d')!;
  const rnd = seeded(77);
  const rnd2 = seeded(4093); // roughness only, so the colour draw stays what it was
  const rh = H / rows;
  rx.fillStyle = 'rgb(0,184,0)'; rx.fillRect(0, 0, W, H);
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, W, H);
  const gv = (v: number) => `rgb(${v},${v},${v})`;
  for (let r = 0; r < rows; r++) {
    const y0 = r * rh;
    const tone = 0.84 + rnd() * 0.16;
    ctx.fillStyle = `rgb(${Math.round(236 * tone)},${Math.round(226 * tone)},${Math.round(212 * tone)})`;
    ctx.fillRect(0, y0, W, rh);
    // Each strake is crowned: grooved at the seams, domed between.
    const crown = hx.createLinearGradient(0, y0, 0, y0 + rh);
    crown.addColorStop(0, gv(30)); crown.addColorStop(0.05, gv(40));
    crown.addColorStop(0.13, gv(168)); crown.addColorStop(0.5, gv(190));
    crown.addColorStop(0.9, gv(166)); crown.addColorStop(1, gv(60));
    hx.fillStyle = crown; hx.fillRect(0, y0, W, rh);
    // Plank faces differ in smoothness: some strakes are worn, some are not.
    const base = 150 + Math.round((rnd2() - 0.4) * 60);
    rx.fillStyle = `rgb(0,${base},0)`; rx.fillRect(0, y0, W, rh);
    // Grain: long wavering lines, a few darker, most barely there.
    for (let k = 0; k < 16; k++) {
      const gy = y0 + 2 + rnd() * (rh - 4);
      const amp = 0.6 + rnd() * 1.8;
      const f = 0.004 + rnd() * 0.01;
      const ph = rnd() * 6.28;
      const a = 0.05 + rnd() * 0.1;
      const lw = 0.6 + rnd() * 1.1;
      const path = (g: CanvasRenderingContext2D) => {
        g.beginPath();
        for (let x = 0; x <= W; x += 16) {
          const yy = gy + Math.sin(x * f * 6.28 + ph) * amp;
          if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
        }
        g.stroke();
      };
      ctx.strokeStyle = `rgba(70,48,28,${a})`; ctx.lineWidth = lw; path(ctx);
      hx.strokeStyle = `rgba(0,0,0,${a * 2.4})`; hx.lineWidth = lw; path(hx);
      rx.strokeStyle = `rgba(0,240,0,${a * 3})`; rx.lineWidth = lw; path(rx);
    }
    // A knot or two.
    if (rnd() < 0.5) {
      const kx = rnd() * W, ky = y0 + rh * (0.3 + rnd() * 0.4);
      const kr = 5 + rnd() * 4;
      const g = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
      g.addColorStop(0, 'rgba(60,38,20,0.55)');
      g.addColorStop(1, 'rgba(60,38,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(kx, ky, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
      hx.fillStyle = 'rgba(0,0,0,0.3)';
      hx.beginPath(); hx.ellipse(kx, ky, 9, 3.6, 0, 0, Math.PI * 2); hx.fill();
      rx.fillStyle = 'rgba(0,225,0,0.55)';
      rx.beginPath(); rx.ellipse(kx, ky, 12, 5, 0, 0, Math.PI * 2); rx.fill();
    }
    // Butt joints, staggered, with a pair of treenails at each.
    const butts = [rnd() * W, 0];
    butts[1] = (butts[0] + W * (0.4 + rnd() * 0.2)) % W;
    for (const bx of butts) {
      ctx.fillStyle = 'rgba(38,26,16,0.55)';
      ctx.fillRect(bx, y0 + 1, 2, rh - 2);
      hx.fillStyle = 'rgba(20,20,20,0.9)'; hx.fillRect(bx - 0.5, y0 + 1, 3, rh - 2);
      rx.fillStyle = 'rgba(0,245,0,0.9)'; rx.fillRect(bx - 1, y0 + 1, 4, rh - 2);
      ctx.fillStyle = 'rgba(52,36,22,0.7)';
      for (const dx of [-6, 8]) {
        for (const fy of [0.3, 0.7]) {
          ctx.beginPath(); ctx.arc(bx + dx, y0 + rh * fy, 1.6, 0, Math.PI * 2); ctx.fill();
          hx.fillStyle = 'rgba(30,30,30,0.7)';
          hx.beginPath(); hx.arc(bx + dx, y0 + rh * fy, 1.7, 0, Math.PI * 2); hx.fill();
          ctx.fillStyle = 'rgba(52,36,22,0.7)';
        }
      }
    }
    // Weathering, streaking down the strake. Bleached streaks go dry and rough;
    // dark ones are the ones the wet has stayed in.
    for (let k = 0; k < 6; k++) {
      const dark = rnd() < 0.5;
      const a = 0.04 + rnd() * 0.05;
      const sx = rnd() * W, sw = 20 + rnd() * 90;
      ctx.fillStyle = `rgba(${dark ? '90,70,50' : '250,244,230'},${a})`;
      ctx.fillRect(sx, y0, sw, rh);
      rx.fillStyle = dark ? `rgba(0,90,0,${a * 5})` : `rgba(0,255,0,${a * 7})`;
      rx.fillRect(sx, y0, sw, rh);
    }
    // The tarred seam along the top of the strake, and the light it throws on
    // the edge of the plank below.
    ctx.fillStyle = 'rgba(28,20,12,0.92)';
    ctx.fillRect(0, y0, W, 2.5);
    ctx.fillStyle = 'rgba(255,248,232,0.22)';
    ctx.fillRect(0, y0 + 2.5, W, 1.5);
    ctx.fillStyle = 'rgba(40,28,16,0.18)';
    ctx.fillRect(0, y0 + rh - 4, W, 4);
    // Tar is the dullest thing on the ship.
    rx.fillStyle = 'rgb(0,250,0)'; rx.fillRect(0, y0, W, 3);
  }
  // Height field to a tangent-space normal map: central differences, wrapped.
  const hd = hx.getImageData(0, 0, W, H).data;
  const nrm = document.createElement('canvas');
  nrm.width = W; nrm.height = H;
  const nx = nrm.getContext('2d')!;
  const out = nx.createImageData(W, H);
  const hAt = (x: number, y: number) => hd[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  const strength = 3.2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * strength;
      const dy = (hAt(x, y + 1) - hAt(x, y - 1)) * strength;
      const il = 1 / Math.hypot(dx, dy, 1);
      const i = (y * W + x) * 4;
      out.data[i] = Math.round((-dx * il * 0.5 + 0.5) * 255);
      // Canvas y runs down the strake; texture v runs up it, so the green slope is flipped.
      out.data[i + 1] = Math.round((dy * il * 0.5 + 0.5) * 255);
      out.data[i + 2] = Math.round((il * 0.5 + 0.5) * 255);
      out.data[i + 3] = 255;
    }
  }
  nx.putImageData(out, 0, 0);

  const tex = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  plank = tex(cc, true);
  plankNormal = tex(nrm, false);
  plankRough = tex(cr, false);
}

export function plankTexture(): THREE.CanvasTexture {
  if (!plank) buildPlankMaps();
  return plank!;
}
export function plankNormalMap(): THREE.CanvasTexture {
  if (!plankNormal) buildPlankMaps();
  return plankNormal!;
}
export function plankRoughMap(): THREE.CanvasTexture {
  if (!plankRough) buildPlankMaps();
  return plankRough!;
}

/**
 * The painted band between the wale and the rail: the one thing a ship could
 * be told apart by at two miles in the fifteenth century, and so the thing
 * every owner spent his paint on.
 */
export function bandTexture(style: BandStyle, seed: number): THREE.CanvasTexture {
  const W = 1024, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const rnd = seeded(seed + 5);
  const RED = '#8c2d20', OCHRE = '#c09340', BLACK = '#211b16', WHITE = '#d9cfb6';
  const rule = (y: number, h: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(0, y, W, h); };

  switch (style) {
    case 'red': rule(0, H, RED); rule(6, 6, OCHRE); rule(H - 12, 6, OCHRE); break;
    case 'black': rule(0, H, BLACK); rule(H - 14, 5, WHITE); break;
    case 'ochre': rule(0, H, OCHRE); rule(8, 6, RED); rule(H - 14, 6, RED); break;
    case 'checker': {
      const n = 8;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < 2; j++) {
          ctx.fillStyle = (i + j) % 2 ? RED : OCHRE;
          ctx.fillRect((i * W) / n, (j * H) / 2, W / n + 1, H / 2 + 1);
        }
      }
      rule(0, 5, BLACK); rule(H - 5, 5, BLACK);
      break;
    }
    case 'chevron': {
      rule(0, H, RED);
      ctx.fillStyle = OCHRE;
      const n = 8, w = W / n;
      for (let i = 0; i < n; i++) {
        const x = i * w;
        ctx.beginPath();
        ctx.moveTo(x, H * 0.82); ctx.lineTo(x + w / 2, H * 0.18); ctx.lineTo(x + w, H * 0.82);
        ctx.lineTo(x + w * 0.82, H * 0.82); ctx.lineTo(x + w / 2, H * 0.44); ctx.lineTo(x + w * 0.18, H * 0.82);
        ctx.closePath(); ctx.fill();
      }
      rule(0, 6, BLACK); rule(H - 6, 6, BLACK);
      break;
    }
    case 'galleon': rule(0, H, BLACK); rule(H * 0.3, H * 0.4, OCHRE); rule(H * 0.3 - 4, 3, RED); rule(H * 0.7 + 1, 3, RED); break;
  }
  // Salt, sun and chafe: paint at sea is never fresh for long.
  for (let i = 0; i < 260; i++) {
    const light = rnd() < 0.55;
    ctx.fillStyle = light ? `rgba(255,248,230,${0.03 + rnd() * 0.07})` : `rgba(20,14,8,${0.04 + rnd() * 0.1})`;
    ctx.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 40, 1 + rnd() * 6);
  }
  // Runs of weed and water-stain down from the scuppers.
  for (let i = 0; i < 10; i++) {
    const x = rnd() * W;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(40,30,20,0)');
    g.addColorStop(1, 'rgba(40,30,20,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 3 + rnd() * 5, H);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

let glow: THREE.CanvasTexture | null = null;

/** A soft warm disc, for the halo round a lantern at night. Shared. */
export function glowTexture(): THREE.CanvasTexture {
  if (glow) return glow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,230,170,1)');
  g.addColorStop(0.2, 'rgba(255,180,90,0.55)');
  g.addColorStop(1, 'rgba(255,140,50,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(c);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}

/** Textures every ship shares, which a disposed ship must leave alone. */
export function isShared(t: THREE.Texture | null | undefined): boolean {
  return !!t && (t === plank || t === glow || t === plankNormal || t === plankRough);
}
