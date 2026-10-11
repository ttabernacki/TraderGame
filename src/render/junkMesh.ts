import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEG, clamp, lerp, smoothstep } from '../core/math';
import type { HullClass } from '../ship/hull';
import { ShipMesh, type RigView } from './shipMesh';
import { glowTexture, plankTexture, seeded } from './shipLook';

/**
 * The ships of the Western Ocean.
 *
 * A junk is not a caravel with other sails. The hull is flat in the floor and
 * hard at the chine, with a blunt, raked bow transom and a broad stern that
 * rises into a tiered castle; she is divided by watertight bulkheads and
 * carries great wales that stand proud of her sides. Her masts are unstayed,
 * stepped in a tabernacle and raked, and every sail is a balanced lug cut in
 * panels and stiffened by a batten to each, so it camber in scallops between
 * them and never goes slack all at once. Six kinds are built here from the same
 * parts: the war junk and the troop junk, the grain, water and horse junks of
 * the fleet's train, and the treasure junk itself, with a stern like a pavilion.
 *
 * Geometry is merged by finish, so a whole junk is a dozen draw calls however
 * many battens, lanterns and tiles she has.
 */

export type JunkKind = 'war' | 'troop' | 'grain' | 'water' | 'horse' | 'treasure';

export const JUNK_KIND: Record<string, JunkKind> = {
  zhanchuan: 'war', zuochuan: 'troop', liangchuan: 'grain', shuichuan: 'water', machuan: 'horse', baochuan: 'treasure',
};

interface Style {
  /** Topside paint, wale, bottom, band and trim, as hex. */
  topsides: number; wale: number; bottom: number; band: number | null; trim: number;
  /** Sail cloth: dyed cloth with seams, or woven bamboo matting. */
  sail: 'cloth' | 'mat'; sailColor: string; sailDark: string; device: boolean;
  castle: 0 | 1 | 2 | 3;
  tiles: number;
  bulwark: number;
  crenel: boolean;
  guns: boolean;
  shields: boolean;
  eyes: boolean;
  banners: number;
  bannerColors: number[];
  lanterns: number;
  deck: JunkKind;
}

const RED = 0xa5261b;
const VERMILION = 0xc2311f;
const GOLD = 0xd8a838;
const BLACK = 0x1a1512;
const TAR = 0x2a2018;
const LIME = 0xe4dcc8;
const MAT = 0xb48f56;

const STYLES: Record<JunkKind, Style> = {
  war: {
    topsides: RED, wale: BLACK, bottom: 0x8a7a64, band: LIME, trim: GOLD,
    sail: 'cloth', sailColor: '#8e231a', sailDark: '#5c140f', device: false,
    castle: 1, tiles: 0x4a4038, bulwark: 1.15, crenel: true, guns: true, shields: true, eyes: true,
    banners: 5, bannerColors: [0xf0c030, 0xb02a1c, 0xf0c030], lanterns: 2, deck: 'war',
  },
  troop: {
    topsides: 0x9b2c1e, wale: 0x2a1c12, bottom: 0x8a7a64, band: null, trim: 0xc0902c,
    sail: 'cloth', sailColor: '#8a3a22', sailDark: '#5a2414', device: false,
    castle: 1, tiles: 0x55483c, bulwark: 1.25, crenel: true, guns: false, shields: true, eyes: true,
    banners: 4, bannerColors: [0xe8b82a, 0xa5261b], lanterns: 2, deck: 'troop',
  },
  grain: {
    topsides: 0x3b2c20, wale: 0x1d1510, bottom: 0x7a6a55, band: LIME, trim: 0x8a6a3a,
    sail: 'mat', sailColor: '#b79a62', sailDark: '#8a6f3c', device: false,
    castle: 1, tiles: 0x6b5a44, bulwark: 1.0, crenel: false, guns: false, shields: false, eyes: true,
    banners: 2, bannerColors: [0xe8b82a], lanterns: 1, deck: 'grain',
  },
  water: {
    topsides: 0x4e6670, wale: 0x1d1d1a, bottom: 0x7a6a55, band: 0xd8cfb8, trim: 0x8a8f90,
    sail: 'mat', sailColor: '#b8a070', sailDark: '#8c7442', device: false,
    castle: 1, tiles: 0x5a5148, bulwark: 1.0, crenel: false, guns: false, shields: false, eyes: true,
    banners: 2, bannerColors: [0x3a6a8a, 0xe8b82a], lanterns: 1, deck: 'water',
  },
  horse: {
    topsides: 0x8f3524, wale: 0x2a1c12, bottom: 0x8a7a64, band: 0xc8a050, trim: 0xc8a050,
    sail: 'cloth', sailColor: '#9a5030', sailDark: '#66301a', device: false,
    castle: 2, tiles: 0x5a4a3c, bulwark: 1.35, crenel: false, guns: false, shields: false, eyes: true,
    banners: 3, bannerColors: [0xe8b82a, 0xa5261b], lanterns: 2, deck: 'horse',
  },
  treasure: {
    topsides: VERMILION, wale: BLACK, bottom: 0x8a7a64, band: GOLD, trim: GOLD,
    sail: 'cloth', sailColor: '#a71f18', sailDark: '#6a120e', device: true,
    castle: 3, tiles: 0xe0b23a, bulwark: 1.3, crenel: false, guns: false, shields: true, eyes: true,
    banners: 9, bannerColors: [0xf4c82a, 0xc2311f, 0xf4c82a, 0x1f6a54], lanterns: 4, deck: 'treasure',
  },
};

// ---------------------------------------------------------------------------
// Little builders: every part is a vertex-coloured geometry, merged by finish.

type Geo = THREE.BufferGeometry;

function paint(geo: Geo, hex: number): Geo {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

interface Place { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number }

function put(geo: Geo, p: Place): Geo {
  if (p.rx) geo.rotateX(p.rx);
  if (p.ry) geo.rotateY(p.ry);
  if (p.rz) geo.rotateZ(p.rz);
  geo.translate(p.x ?? 0, p.y ?? 0, p.z ?? 0);
  return geo;
}

const box = (w: number, h: number, d: number, hex: number, p: Place = {}): Geo => paint(put(new THREE.BoxGeometry(w, h, d), p), hex);
const cyl = (r1: number, r2: number, h: number, hex: number, p: Place = {}, seg = 8): Geo =>
  paint(put(new THREE.CylinderGeometry(r1, r2, h, seg), p), hex);
const ball = (r: number, hex: number, p: Place = {}, ws = 8, hs = 6): Geo => paint(put(new THREE.SphereGeometry(r, ws, hs), p), hex);

/** A bucket of geometry that will become one mesh. */
class Bucket {
  parts: Geo[] = [];
  add(...g: Geo[]): void { this.parts.push(...g); }
  build(mat: THREE.Material, shadows = true): THREE.Mesh | null {
    if (!this.parts.length) return null;
    // Every part has to carry the same attributes to merge.
    const uniform = this.parts.map((g) => {
      const x = g.index ? g.toNonIndexed() : g;
      if (!x.getAttribute('uv')) {
        x.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(x.getAttribute('position').count * 2), 2));
      }
      return x;
    });
    const merged = mergeGeometries(uniform, false);
    if (!merged) return null;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = shadows; m.receiveShadow = shadows;
    return m;
  }
}

// ---------------------------------------------------------------------------
// Textures: made once, shared by every junk, never disposed.

const cache = new Map<string, THREE.CanvasTexture>();
function cached(key: string, make: () => HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  let t = cache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(make());
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    cache.set(key, t);
  }
  return t;
}

/** Cut cloth or woven matting, with a seam at every batten and the weave between. */
function sailTexture(kind: 'cloth' | 'mat', color: string, dark: string, panels: number, device: boolean, seed: number): THREE.CanvasTexture {
  return cached(`sail:${kind}:${color}:${panels}:${device}:${seed}`, () => {
    const W = 256, H = 512;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const rnd = seeded(seed + 17);
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    const ph = H / panels;
    for (let p = 0; p < panels; p++) {
      // Each panel is its own cut of cloth, a shade apart from its neighbour.
      g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,240,210'},${0.03 + rnd() * 0.07})`;
      g.fillRect(0, p * ph, W, ph);
      // The weave.
      g.strokeStyle = kind === 'mat' ? 'rgba(60,40,10,0.28)' : 'rgba(0,0,0,0.09)';
      g.lineWidth = 1;
      const step = kind === 'mat' ? 7 : 4;
      for (let y = p * ph + 2; y < (p + 1) * ph; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + (kind === 'mat' ? 3 : 0)); g.stroke(); }
      if (kind === 'mat') {
        for (let x = 0; x < W; x += 9) { g.beginPath(); g.moveTo(x, p * ph); g.lineTo(x + 3, (p + 1) * ph); g.stroke(); }
      }
      // The seam and the tabling at the batten.
      g.fillStyle = dark; g.fillRect(0, p * ph - 2, W, 4);
    }
    // Patches and sun-bleaching.
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(${rnd() < 0.6 ? '0,0,0' : '255,235,200'},${0.05 + rnd() * 0.06})`;
      g.fillRect(rnd() * W, rnd() * H, 18 + rnd() * 50, 12 + rnd() * 30);
    }
    // The luff and the leech are bolt-roped.
    g.fillStyle = dark; g.fillRect(0, 0, 5, H); g.fillRect(W - 4, 0, 4, H);
    if (device) {
      // The Emperor's device on the great sail: a disc of gold with a wheeling dragon's coil.
      const cx = W * 0.5, cy = H * 0.5, r = W * 0.34;
      g.fillStyle = 'rgba(232,184,48,0.95)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(120,20,12,0.9)'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath();
      for (let a = 0; a < Math.PI * 3.4; a += 0.08) {
        const rr = r * (0.12 + 0.82 * (a / (Math.PI * 3.4)));
        const x = cx + Math.cos(a * 1.0) * rr * 0.92, y = cy + Math.sin(a * 1.0) * rr * 0.92;
        if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.fillStyle = 'rgba(120,20,12,0.95)'; g.beginPath(); g.arc(cx + r * 0.52, cy - r * 0.52, 9, 0, Math.PI * 2); g.fill();
    }
    return c;
  });
}

/** Glazed roof tiles, in rows, for the pavilion aft. */
function tileTexture(hex: number): THREE.CanvasTexture {
  return cached(`tiles:${hex}`, () => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d')!;
    const col = new THREE.Color(hex);
    g.fillStyle = `#${col.getHexString()}`; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) {
      for (let x = ((y / 16) % 2) * 8; x < 128; x += 16) {
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, y, 2, 16);
        g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 2, y, 3, 15);
      }
      g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(0, y + 14, 128, 2);
    }
    return c;
  }, [3, 3]);
}

/** A lattice window with a dark room behind it, set into the pavilion walls. */
function windowTexture(): THREE.CanvasTexture {
  return cached('window', () => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#b4281c'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#e8b82a'; g.fillRect(10, 14, 108, 100);
    g.fillStyle = '#251a10'; g.fillRect(16, 20, 96, 88);
    g.strokeStyle = '#d8a838'; g.lineWidth = 3;
    for (let i = 1; i < 6; i++) {
      g.beginPath(); g.moveTo(16 + i * 16, 20); g.lineTo(16 + i * 16, 108); g.stroke();
      g.beginPath(); g.moveTo(16, 20 + i * 14.6); g.lineTo(112, 20 + i * 14.6); g.stroke();
    }
    return c;
  });
}

/** A painted eye, for the bow: white, with a black pupil and a gold ring. */
function eyeTexture(): THREE.CanvasTexture {
  return cached('eye', () => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = '#d8a838'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f4ecd8'; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#16100c'; g.beginPath(); g.arc(70, 64, 28, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f4ecd8'; g.beginPath(); g.arc(78, 54, 8, 0, Math.PI * 2); g.fill();
    return c;
  });
}

// ---------------------------------------------------------------------------
// The hull

/** What the sections do from end to end of her. All in terms of t, 0 at the stern to 1 at the bow. */
interface Lines {
  L: number; B: number; D: number; fb: number; bulwark: number;
  keelY(t: number): number;
  sheerY(t: number): number;
  deckY(t: number): number;
  halfBeam(t: number): number;
  z(t: number, u: number): number;
  width(t: number, u: number): number;
}

function makeLines(hull: HullClass, kind: JunkKind): Lines {
  const L = hull.lwl, B = hull.beam, D = hull.draft;
  const st = STYLES[kind];
  const fb = D * (kind === 'war' ? 0.82 : kind === 'treasure' ? 0.92 : 0.86);
  const bulwark = st.bulwark;
  const smooth = (x: number) => x * x * (3 - 2 * x);
  const halfBeam = (t: number): number => {
    const f = t < 0.34 ? 0.8 + 0.2 * smooth(t / 0.34) : t > 0.66 ? 1 - 0.42 * smooth((t - 0.66) / 0.34) : 1;
    return (B / 2) * f;
  };
  const keelY = (t: number): number => {
    const stern = t < 0.22 ? Math.pow((0.22 - t) / 0.22, 2) * 0.72 : 0;
    const bow = t > 0.76 ? Math.pow((t - 0.76) / 0.24, 2) * 0.55 : 0;
    return -D * (1 - Math.max(stern, bow));
  };
  const sheerY = (t: number): number => {
    const stern = t < 0.5 ? Math.pow((0.5 - t) / 0.5, 2) * fb * 0.55 : 0;
    const bow = t > 0.5 ? Math.pow((t - 0.5) / 0.5, 2.2) * fb * 0.42 : 0;
    return fb + stern + bow;
  };
  return {
    L, B, D, fb, bulwark, keelY, sheerY, halfBeam,
    deckY: (t) => sheerY(t) - bulwark,
    // Raked transoms at both ends: the upper part of the section runs out beyond the lower.
    z: (t, u) => (t - 0.5) * L + (t > 0.97 ? Math.pow(u, 1.6) * L * 0.045 : 0) - (t < 0.03 ? Math.pow(u, 1.5) * L * 0.03 : 0),
    // Flat floor, hard chine, then a flare toward the sheer.
    width: (t, u) => halfBeam(t) * (0.55 + 0.45 * (1 - Math.pow(1 - u, 2.3))) * (1 + 0.05 * smoothstep(0.78, 1, u)),
  };
}

interface HullParts {
  skin: Geo;
  deck: Geo;
  bulwarkInner: Geo;
  transoms: Geo;
}

function buildHull(ln: Lines, st: Style): HullParts {
  const S = 36, M = 26, K = 3;
  const cols = 2 * (M + 1) + (K - 1);
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const topsides = new THREE.Color(st.topsides), wale = new THREE.Color(st.wale), bottom = new THREE.Color(st.bottom);
  const band = st.band !== null ? new THREE.Color(st.band) : null;
  const trim = new THREE.Color(st.trim);
  const tar = new THREE.Color(TAR);

  const colorAt = (y: number, t: number): THREE.Color => {
    const rel = y;
    const top = ln.sheerY(t);
    if (rel < -ln.D * 0.14) return bottom;
    if (rel < ln.D * 0.14) return tar;
    // Two great wales, one at the load line and one under the rail.
    const w1 = Math.abs(rel - ln.fb * 0.30) < ln.fb * 0.075;
    const w2 = Math.abs(rel - ln.fb * 0.66) < ln.fb * 0.06;
    if (w1 || w2) return wale;
    if (band && Math.abs(rel - ln.fb * 0.47) < ln.fb * 0.04) return band;
    if (rel > top - 0.32) return trim;
    return topsides;
  };
  const bump = (y: number): number => {
    const a = Math.max(0, 1 - Math.abs(y - ln.fb * 0.30) / (ln.fb * 0.075));
    const b = Math.max(0, 1 - Math.abs(y - ln.fb * 0.66) / (ln.fb * 0.06));
    return Math.max(a, b) * 0.2;
  };

  for (let i = 0; i <= S; i++) {
    // More stations at the ends, where the shape turns.
    const s = i / S;
    const t = 0.5 - 0.5 * Math.cos(Math.PI * s);
    const k = ln.keelY(t), sh = ln.sheerY(t);
    const pts: { x: number; u: number }[] = [];
    for (let j = M; j >= 0; j--) pts.push({ x: 1, u: j / M });
    for (let q = 1; q < K; q++) pts.push({ x: 1 - (2 * q) / K, u: -q / K });
    for (let j = 0; j <= M; j++) pts.push({ x: -1, u: j / M });
    for (const p of pts) {
      const u = Math.max(0, p.u);
      const y = p.u < 0 ? k - Math.sin((-p.u) * Math.PI) * 0.0 : k + u * (sh - k);
      const w = ln.width(t, u);
      const x = p.u < 0 ? p.x * ln.width(t, 0) : p.x * (w + bump(y));
      pos.push(x, y, ln.z(t, u));
      const c = p.u < 0 ? bottom : colorAt(y, t);
      col.push(c.r, c.g, c.b);
      uv.push(t * ln.L * (1 / 5), y * (1 / 3.2));
    }
  }
  for (let i = 0; i < S; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const skin = new THREE.BufferGeometry();
  skin.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  skin.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  skin.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  skin.setIndex(idx);
  skin.computeVertexNormals();

  // Deck, the inside of the bulwarks and the rim.
  const dpos: number[] = [], duv: number[] = [], didx: number[] = [], dcol: number[] = [];
  const bpos: number[] = [], bcol: number[] = [], bidx: number[] = [];
  const deckTone = new THREE.Color(0xb59468), inner = new THREE.Color(st.bulwark > 0 ? st.topsides : 0x9b2c1e).multiplyScalar(0.8);
  const thick = 0.2;
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const t = 0.03 + 0.94 * (i / N);
    const dy = ln.deckY(t), sh = ln.sheerY(t), k = ln.keelY(t);
    const u = (dy - k) / (sh - k);
    const w = ln.width(t, Math.min(1, u)) - thick;
    const z = ln.z(t, u);
    for (const sx of [-1, 1]) {
      dpos.push(sx * w, dy, z); duv.push(t * ln.L * 0.2, sx > 0 ? 1 : 0); dcol.push(deckTone.r, deckTone.g, deckTone.b);
    }
    // Inner wall: foot at the deck, top at the rim; and the rim across.
    const wTop = ln.width(t, 1);
    for (const sx of [-1, 1]) {
      bpos.push(sx * w, dy, z, sx * w, sh, z, sx * wTop, sh, ln.z(t, 1));
      for (let q = 0; q < 3; q++) bcol.push(q === 2 ? ln.sheerY(t) * 0 + 0.82 : inner.r, q === 2 ? 0.63 : inner.g, q === 2 ? 0.2 : inner.b);
    }
  }
  for (let i = 0; i < N; i++) { const a = i * 2; didx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const deck = new THREE.BufferGeometry();
  deck.setAttribute('position', new THREE.Float32BufferAttribute(dpos, 3));
  deck.setAttribute('color', new THREE.Float32BufferAttribute(dcol, 3));
  deck.setAttribute('uv', new THREE.Float32BufferAttribute(duv, 2));
  deck.setIndex(didx);
  deck.computeVertexNormals();
  // Each station contributes 6 wall vertices (3 per side); wall faces join consecutive stations per side.
  for (let i = 0; i < N; i++) {
    for (const s of [0, 1]) {
      const a = i * 6 + s * 3, b = (i + 1) * 6 + s * 3;
      // Wall (foot to top) and rim (top to outside).
      bidx.push(a, b, a + 1, a + 1, b, b + 1);
      bidx.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
  }
  const bulwarkInner = new THREE.BufferGeometry();
  bulwarkInner.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3));
  bulwarkInner.setAttribute('color', new THREE.Float32BufferAttribute(bcol, 3));
  bulwarkInner.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((bpos.length / 3) * 2).fill(0), 2));
  bulwarkInner.setIndex(bidx);
  bulwarkInner.computeVertexNormals();

  // The two transoms, flat: stern and bow.
  const tp: number[] = [], tc: number[] = [], ti: number[] = [];
  for (const [t, hex] of [[0, st.topsides], [1, st.topsides]] as [number, number][]) {
    const base = tp.length / 3;
    const cc = new THREE.Color(hex).multiplyScalar(t === 0 ? 0.92 : 0.8);
    const k = ln.keelY(t), sh = ln.sheerY(t);
    const ring: [number, number, number][] = [];
    for (let j = M; j >= 0; j--) ring.push([ln.width(t, j / M), k + (j / M) * (sh - k), ln.z(t, j / M)]);
    for (let q = 1; q < K; q++) ring.push([ln.width(t, 0) * (1 - (2 * q) / K), k, ln.z(t, 0)]);
    for (let j = 0; j <= M; j++) ring.push([-ln.width(t, j / M), k + (j / M) * (sh - k), ln.z(t, j / M)]);
    const cy = (k + sh) * 0.5, cz = ln.z(t, 0.5);
    tp.push(0, cy, cz); tc.push(cc.r, cc.g, cc.b);
    for (const r of ring) { tp.push(r[0], r[1], r[2]); const c = r[1] < ln.D * 0.14 && r[1] > -ln.D * 0.14 ? tar : r[1] < -ln.D * 0.14 ? bottom : cc; tc.push(c.r, c.g, c.b); }
    for (let r = 1; r < ring.length; r++) { if (t === 0) ti.push(base, base + r + 1, base + r); else ti.push(base, base + r, base + r + 1); }
  }
  const transoms = new THREE.BufferGeometry();
  transoms.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  transoms.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3));
  transoms.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((tp.length / 3) * 2).fill(0), 2));
  transoms.setIndex(ti);
  transoms.computeVertexNormals();

  return { skin, deck, bulwarkInner, transoms };
}

// ---------------------------------------------------------------------------
// Sails

interface SailBuild {
  geometry: Geo;
  base: Float32Array;
  weight: Float32Array;
  luff: Float32Array;
  W: number;
  H: number;
  panels: number;
}

const FORE_FRAC = 0.24;

function buildSail(W: number, H: number, panels: number): SailBuild {
  const C = 10, R = panels * 4;
  const pos: number[] = [], uv: number[] = [], weight: number[] = [], luff: number[] = [], idx: number[] = [];
  for (let r = 0; r <= R; r++) {
    const v = r / R;
    // The leech is roached: the cloth stands out between the battens' ends.
    const roach = Math.sin(Math.PI * v) * 0.075 * W;
    const pv = (r % 4) / 4; // 0 at a batten, up through the panel
    const wv = r % 4 === 0 ? 0.12 : Math.pow(Math.sin(Math.PI * pv), 0.75);
    for (let c = 0; c <= C; c++) {
      const u = c / C;
      const zLuff = W * FORE_FRAC, zLeech = -W * (1 - FORE_FRAC) - roach;
      pos.push(0, v * H, zLuff + (zLeech - zLuff) * u);
      uv.push(u, 1 - v);
      const wc = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.8) * (0.7 + 0.3 * u);
      weight.push(wc * (0.15 + 0.85 * wv));
      luff.push(u);
    }
  }
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const a = r * (C + 1) + c, b = a + 1, d = a + C + 1, e = d + 1;
    idx.push(a, b, d, b, e, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  return { geometry, base: new Float32Array(pos), weight: new Float32Array(weight), luff: new Float32Array(luff), W, H, panels };
}

interface MastRig {
  pivot: THREE.Group;
  rig: THREE.Group;
  sail: THREE.Mesh;
  build: SailBuild;
  z: number;
  foot: number;
  ropes: { local: THREE.Vector3; fixed: THREE.Vector3 }[];
}

// ---------------------------------------------------------------------------

function downwindInShip(beta: number): { x: number; z: number } {
  const b = beta * DEG;
  return { x: Math.sin(b), z: -Math.cos(b) };
}
function streamRotation(beta: number): number {
  const d = downwindInShip(beta);
  return Math.atan2(-d.z, d.x);
}

interface Flag { mesh: THREE.Mesh; geo: THREE.PlaneGeometry; base: Float32Array; length: number; phase: number }

export class JunkMesh {
  group = new THREE.Group();
  private masts: MastRig[] = [];
  private flags: Flag[] = [];
  private rudder: THREE.Group;
  private tiller: THREE.Group;
  private runningRig!: THREE.LineSegments;
  private runningPos!: THREE.BufferAttribute;
  private lamps: THREE.Sprite[] = [];
  private lanternMat = new THREE.MeshLambertMaterial({ color: 0xc8341f, emissive: 0x000000 });
  private windowMat: THREE.MeshLambertMaterial;
  private lampLight: THREE.PointLight | null = null;
  private lit = { night: -1, overcast: -1 };
  private cloths: THREE.MeshLambertMaterial[] = [];

  constructor(hull: HullClass, opts: { lamp?: boolean } = {}) {
    const kind = JUNK_KIND[hull.id] ?? 'troop';
    const st = STYLES[kind];
    const ln = makeLines(hull, kind);
    const rnd = seeded(hullSeed(hull.id));
    const L = ln.L, B = ln.B;

    // -- Hull ---------------------------------------------------------------
    const parts = buildHull(ln, st);
    const plank = plankTexture();
    const skinMat = new THREE.MeshStandardMaterial({
      vertexColors: true, map: plank, bumpMap: plank, bumpScale: 1.0, roughness: 0.78, side: THREE.DoubleSide,
    });
    const hullMesh = new THREE.Mesh(parts.skin, skinMat);
    this.group.add(hullMesh);
    const deckMesh = new THREE.Mesh(parts.deck, new THREE.MeshStandardMaterial({ vertexColors: true, map: plank, roughness: 0.9, side: THREE.DoubleSide }));
    this.group.add(deckMesh);
    this.group.add(new THREE.Mesh(parts.bulwarkInner, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide })));
    this.group.add(new THREE.Mesh(parts.transoms, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide })));

    // Finish buckets.
    const wood = new Bucket();    // bare and tarred timber
    const lacquer = new Bucket(); // painted and gilded work
    const iron = new Bucket();
    const rope = new Bucket();
    const tiles = new Bucket();
    const windows = new Bucket();
    const eyes = new Bucket();
    const lanterns = new Bucket();

    const zOf = (t: number) => ln.z(t, 0.5);
    const deckAt = (t: number) => ln.deckY(t);

    // -- Fittings common to all --------------------------------------------
    this.fittings(ln, st, kind, rnd, wood, lacquer, iron, rope, eyes);

    // -- Stern: tiers of pavilion ------------------------------------------
    const aft = this.stern(ln, st, kind, wood, lacquer, tiles, windows, lanterns, rnd);

    // -- Bow ---------------------------------------------------------------
    this.bow(ln, st, kind, wood, lacquer, iron, rope, eyes, rnd);

    // -- Deck work by kind --------------------------------------------------
    this.deckWork(ln, st, kind, wood, lacquer, iron, rope, tiles, rnd, aft);

    // -- Masts and sails ----------------------------------------------------
    const mastBucket = wood;
    for (let i = 0; i < hull.masts.length; i++) {
      this.buildMast(hull, ln, st, hull.masts[i], i, hull.masts.length, mastBucket, lacquer, rope, iron, rnd);
    }

    // -- Rudder and tiller --------------------------------------------------
    this.rudder = new THREE.Group();
    this.tiller = new THREE.Group();
    {
      const w = clamp(B * 0.16, 0.9, 2.4), h = ln.D * 1.55 + 1.2;
      const rb = new Bucket();
      rb.add(box(0.28, h, w, 0x5a4026, { y: -ln.D * 0.45, z: -w / 2 }));
      for (let q = 0; q < 3; q++) rb.add(box(0.34, h * 0.14, w * 0.4, 0x2a1d12, { y: -ln.D * 0.45 + (q - 1) * h * 0.28, z: -w * 0.5 }));
      rb.add(cyl(0.12, 0.12, h + 1, 0x4a3520, { y: -ln.D * 0.25 }));
      const m = rb.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
      if (m) this.rudder.add(m);
      this.rudder.position.set(0, 0, zOf(0) - ln.L * 0.035);
      const tb = new Bucket();
      tb.add(box(0.18, 0.18, 4.4, 0x4a3520, { y: deckAt(0.05) + 1.4, z: -2.0 }));
      const tm = tb.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
      if (tm) this.tiller.add(tm);
      this.tiller.position.set(0, 0, zOf(0.04));
    }
    this.group.add(this.rudder, this.tiller);

    // -- Merge the buckets into meshes -------------------------------------
    const std = (rough: number, metal = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal, side: THREE.DoubleSide, ...extra });
    for (const m of [
      wood.build(std(0.88)), lacquer.build(std(0.5, 0.05)), iron.build(std(0.5, 0.6)), rope.build(std(0.95)),
    ]) if (m) this.group.add(m);
    const tileMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tileTexture(st.tiles), roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide });
    const tm = tiles.build(tileMat); if (tm) this.group.add(tm);
    this.windowMat = new THREE.MeshLambertMaterial({ map: windowTexture(), side: THREE.DoubleSide, emissive: 0x000000 });
    const wm = windows.build(this.windowMat as unknown as THREE.Material); if (wm) this.group.add(wm);
    const em = eyes.build(new THREE.MeshLambertMaterial({ map: eyeTexture(), transparent: true, side: THREE.DoubleSide }), false);
    if (em) this.group.add(em);
    const lm = lanterns.build(this.lanternMat, false); if (lm) this.group.add(lm);

    // -- Lantern glows and the player's lamp ---------------------------------
    for (const lp of aft.lanternSpots) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: 0xffa050, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
      }));
      halo.position.copy(lp); halo.position.y += 0.1;
      halo.scale.setScalar(3.2);
      halo.visible = false;
      this.lamps.push(halo);
      this.group.add(halo);
    }
    if (opts.lamp) {
      this.lampLight = new THREE.PointLight(0xff9a50, 0, 38, 1.7);
      const lp = aft.lanternSpots[0] ?? new THREE.Vector3(0, deckAt(0.1) + 3, zOf(0.05));
      this.lampLight.position.set(lp.x, lp.y + 1.2, lp.z + 1.5);
      this.group.add(this.lampLight);
    }

    // -- Running rigging: redrawn each frame -------------------------------
    const ropeCount = this.masts.reduce((n, m) => n + m.ropes.length, 0);
    const geo = new THREE.BufferGeometry();
    this.runningPos = new THREE.BufferAttribute(new Float32Array(ropeCount * 6), 3);
    this.runningPos.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.runningPos);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), L * 2);
    this.runningRig = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x3a2a18, transparent: true, opacity: 0.9 }));
    this.runningRig.frustumCulled = false;
    this.group.add(this.runningRig);

    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
    });
    for (const m of this.masts) { m.sail.receiveShadow = false; m.sail.castShadow = true; }
    for (const f of this.flags) { f.mesh.receiveShadow = false; f.mesh.castShadow = false; }
  }

  // ---------------------------------------------------------------------
  // Parts

  /** Rails, capping, the painted shields and screens, gun ports, anchors, bollards. */
  private fittings(ln: Lines, st: Style, _kind: JunkKind, rnd: () => number, wood: Bucket, lacquer: Bucket, iron: Bucket, rope: Bucket, eyes: Bucket): void {
    const L = ln.L;
    const N = 30;
    // Capping rail with gold ends, and posts every few metres.
    for (let i = 0; i < N; i++) {
      const t0 = 0.04 + 0.92 * (i / N), t1 = 0.04 + 0.92 * ((i + 1) / N);
      for (const sx of [-1, 1]) {
        const x0 = sx * (ln.width(t0, 1) - 0.08), x1 = sx * (ln.width(t1, 1) - 0.08);
        const y0 = ln.sheerY(t0) + 0.05, y1 = ln.sheerY(t1) + 0.05;
        const z0 = ln.z(t0, 1), z1 = ln.z(t1, 1);
        const len = Math.hypot(z1 - z0, y1 - y0, x1 - x0);
        const mid = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
        const g = box(0.32, 0.16, len, st.trim, {});
        g.rotateX(-Math.atan2(y1 - y0, z1 - z0));
        g.translate(mid[0], mid[1], mid[2]);
        lacquer.add(g);
      }
    }
    // Shields or crenellations above the bulwark.
    if (st.crenel || st.shields) {
      const n = Math.round(L / 2.1);
      for (let i = 0; i < n; i++) {
        const t = 0.1 + 0.8 * (i / (n - 1));
        for (const sx of [-1, 1]) {
          const x = sx * (ln.width(t, 1) - 0.12), y = ln.sheerY(t) + 0.2, z = ln.z(t, 1);
          if (st.crenel && i % 2 === 0) lacquer.add(box(0.2, 0.85, 1.0, st.topsides, { x, y: y + 0.42, z }));
          if (st.shields) {
            const alt = i % 2 === 0;
            const sh = cyl(0.62, 0.62, 0.08, alt ? 0xe8b82a : 0xa5261b, { x: x + sx * 0.14, y: y + (st.crenel ? 0.05 : 0.45), z, rz: Math.PI / 2 }, 14);
            lacquer.add(sh);
            lacquer.add(cyl(0.2, 0.2, 0.1, alt ? 0xa5261b : 0xe8b82a, { x: x + sx * 0.2, y: y + (st.crenel ? 0.05 : 0.45), z, rz: Math.PI / 2 }, 10));
          }
        }
      }
    }
    // Gun ports along the topsides: black squares with the muzzle just showing.
    if (st.guns) {
      const n = Math.round(L / 3.1);
      for (let i = 0; i < n; i++) {
        const t = 0.2 + 0.58 * (i / (n - 1));
        for (const sx of [-1, 1]) {
          const y = ln.deckY(t) - 0.25, w = ln.width(t, (y - ln.keelY(t)) / (ln.sheerY(t) - ln.keelY(t)));
          iron.add(box(0.1, 0.5, 0.5, 0x0c0a08, { x: sx * (w + 0.22), y, z: ln.z(t, 0.8) }));
          iron.add(cyl(0.1, 0.12, 0.5, 0x2a2a2a, { x: sx * (w + 0.35), y, z: ln.z(t, 0.8), rz: Math.PI / 2 }, 6));
        }
      }
    }
    // Fenders: the half-round timbers along the waterline that take a boat's blows.
    // Bollards, a windlass and the anchors on the bow.
    for (let i = 0; i < 4; i++) {
      const t = 0.3 + i * 0.14;
      for (const sx of [-1, 1]) wood.add(cyl(0.16, 0.2, 0.7, 0x4a3520, { x: sx * (ln.width(t, 0.95) - 0.5), y: ln.deckY(t) + 0.35, z: ln.z(t, 0.9) }, 6));
    }
    void rnd; void rope; void eyes;
  }

  /** The stern: a pavilion of one to three tiers with upturned eaves. */
  private stern(ln: Lines, st: Style, kind: JunkKind, wood: Bucket, lacquer: Bucket, tiles: Bucket, windows: Bucket, lanterns: Bucket, rnd: () => number): { top: number; lanternSpots: THREE.Vector3[]; zFront: number } {
    const spots: THREE.Vector3[] = [];
    const tiers = st.castle;
    const t0 = 0.02, tFront = 0.02 + (kind === 'treasure' ? 0.30 : kind === 'horse' ? 0.2 : kind === 'war' ? 0.14 : 0.18);
    let y = ln.deckY(0.1);
    let zBack = ln.z(0.03, 0.9) + 0.4;
    let zFront = ln.z(tFront, 0.5);
    let half = ln.width(0.1, 0.9) - 0.35;
    const tierH = kind === 'treasure' ? 2.7 : 2.3;
    for (let k = 0; k < tiers; k++) {
      const shrink = 1 - k * 0.2;
      const hw = half * shrink * (k === 0 ? 1 : 0.92);
      const zb = zBack + k * 1.2;
      const zf = zFront - k * (zFront - zBack) * 0.12 - (k ? (zFront - zBack) * 0.14 : 0);
      const depth = zf - zb;
      const h = tierH * (k === 0 ? 1 : 0.92);
      // Floor and walls.
      lacquer.add(box(hw * 2 + 0.3, 0.22, depth + 0.3, 0x8a6a3a, { y: y + 0.11, z: (zb + zf) / 2 }));
      lacquer.add(box(hw * 2, h, 0.18, st.topsides, { y: y + h / 2 + 0.2, z: zb }));
      lacquer.add(box(hw * 2, h, 0.18, st.topsides, { y: y + h / 2 + 0.2, z: zf }));
      lacquer.add(box(0.18, h, depth, st.topsides, { x: hw, y: y + h / 2 + 0.2, z: (zb + zf) / 2 }));
      lacquer.add(box(0.18, h, depth, st.topsides, { x: -hw, y: y + h / 2 + 0.2, z: (zb + zf) / 2 }));
      // Gilded posts and lintels.
      for (const sx of [-1, 1]) for (const zz of [zb, zf]) lacquer.add(box(0.26, h + 0.1, 0.26, st.trim, { x: sx * hw, y: y + h / 2 + 0.2, z: zz }));
      lacquer.add(box(hw * 2 + 0.3, 0.2, 0.28, st.trim, { y: y + h + 0.3, z: zb }));
      lacquer.add(box(hw * 2 + 0.3, 0.2, 0.28, st.trim, { y: y + h + 0.3, z: zf }));
      // Lattice windows.
      const nw = Math.max(2, Math.round(hw * 2 / 1.6));
      for (let w = 0; w < nw; w++) {
        const x = (-hw + (hw * 2) * ((w + 0.5) / nw));
        const wg = new THREE.PlaneGeometry(Math.min(1.2, hw * 1.7 / nw), 1.1);
        windows.add(put(wg, { x, y: y + h * 0.55, z: zb - 0.12, ry: Math.PI }));
        windows.add(put(new THREE.PlaneGeometry(Math.min(1.2, hw * 1.7 / nw), 1.1), { x, y: y + h * 0.55, z: zf + 0.12 }));
      }
      for (let w = 0; w < 2; w++) {
        windows.add(put(new THREE.PlaneGeometry(1.2, 1.1), { x: hw + 0.12, y: y + h * 0.55, z: zb + depth * (0.3 + w * 0.4), ry: Math.PI / 2 }));
        windows.add(put(new THREE.PlaneGeometry(1.2, 1.1), { x: -hw - 0.12, y: y + h * 0.55, z: zb + depth * (0.3 + w * 0.4), ry: -Math.PI / 2 }));
      }
      // Balcony rail where this tier overhangs the one below.
      if (k > 0 || kind === 'treasure') {
        const rz = zb - 0.55;
        for (let p = 0; p <= 8; p++) {
          const x = -hw + (hw * 2) * (p / 8);
          lacquer.add(box(0.1, 0.9, 0.1, st.trim, { x, y: y + 0.65, z: rz }));
        }
        lacquer.add(box(hw * 2, 0.1, 0.12, st.trim, { y: y + 1.05, z: rz }));
      }
      y += h + 0.3;
      // Roof: hipped, with eaves that curl up at the corners.
      const roofH = kind === 'treasure' ? 1.6 : 1.1;
      this.roof(tiles, lacquer, hw + 0.9, (depth + 1.7) / 2, roofH, (zb + zf) / 2, y, st);
      y += roofH * 0.45 + (k === tiers - 1 ? 0 : 0.1);
      // Lanterns at the eave corners of the topmost tier, and one per tier on the rear corners.
      for (const sx of [-1, 1]) {
        const lp = new THREE.Vector3(sx * (hw + 0.7), y - roofH * 0.6, zb - 0.9);
        const lan = [
          cyl(0.38, 0.38, 0.62, 0xc8341f, { x: lp.x, y: lp.y - 0.5, z: lp.z }, 10),
          cyl(0.16, 0.34, 0.12, 0x2a1d12, { x: lp.x, y: lp.y - 0.12, z: lp.z }, 10),
          cyl(0.16, 0.34, 0.12, 0x2a1d12, { x: lp.x, y: lp.y - 0.9, z: lp.z }, 10),
        ];
        lanterns.add(...lan);
        if (k === tiers - 1 || tiers === 1) spots.push(new THREE.Vector3(lp.x, lp.y - 0.5, lp.z));
        wood.add(cyl(0.04, 0.04, 0.6, 0x2a1d12, { x: lp.x, y: lp.y + 0.05, z: lp.z }, 4));
      }
    }
    // Low screens of the war junk stand in place of a pavilion: the fighting platform.
    if (tiers === 1 && st.guns) {
      const yy = ln.deckY(0.1) + 2.3;
      for (let q = 0; q < 6; q++) {
        const x = -half + (half * 2) * (q / 5);
        lacquer.add(box(0.08, 0.9, 0.5, 0xe8b82a, { x, y: yy + 0.5, z: zBack - 0.3 }));
      }
    }
    void rnd; void t0;
    return { top: y, lanternSpots: spots, zFront };
  }

  /** A hipped roof with curled eaves, as a lofted grid. */
  private roof(tiles: Bucket, lacquer: Bucket, hw: number, hd: number, h: number, zc: number, y0: number, st: Style): void {
    const nx = 10, nz = 10;
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
    const c = new THREE.Color(0xffffff);
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const u = (i / nx) * 2 - 1, v = (j / nz) * 2 - 1;
        // Distance from the centre in the hip metric: the ridge is at 0, the eave at 1.
        const d = Math.max(Math.abs(u) * 0.78, Math.abs(v));
        const rise = (1 - Math.pow(d, 1.0)) * h;
        // Corners curl up like the prow of a boat.
        const curl = Math.pow(Math.abs(u * v), 2.2) * h * 0.5 + Math.pow(Math.max(Math.abs(u), Math.abs(v)), 6) * h * 0.14;
        pos.push(u * hw, y0 + rise * 0.9 + curl, zc + v * hd);
        uv.push((u + 1) * 2.2, (v + 1) * 2.2);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    tiles.add(g);
    // The ridge, in gold, and the finial.
    lacquer.add(box(hw * 0.3, 0.2, 0.2, st.trim, { y: y0 + h * 0.92 + 0.12, z: zc }));
    lacquer.add(ball(0.22, st.trim, { y: y0 + h * 0.92 + 0.34, z: zc }, 6, 5));
    // The eave board, a band of paint round the lower edge.
    for (const sx of [-1, 1]) lacquer.add(box(0.14, 0.3, hd * 2, st.topsides, { x: sx * hw, y: y0 + 0.1, z: zc }));
    lacquer.add(box(hw * 2, 0.3, 0.14, st.topsides, { y: y0 + 0.1, z: zc - hd }));
    lacquer.add(box(hw * 2, 0.3, 0.14, st.topsides, { y: y0 + 0.1, z: zc + hd }));
  }

  /** The bow: a flat painted transom screen with its eyes, the bitts, and a windlass. */
  private bow(ln: Lines, st: Style, kind: JunkKind, wood: Bucket, lacquer: Bucket, iron: Bucket, rope: Bucket, eyes: Bucket, rnd: () => number): void {
    const t = 0.985;
    const zB = ln.z(t, 0.6);
    // The eyes on either bow.
    if (st.eyes) {
      for (const sx of [-1, 1]) {
        const tt = 0.9, r = clamp(ln.B * 0.075, 0.42, 0.95);
        const w = ln.width(tt, 0.7);
        const e = new THREE.PlaneGeometry(r * 2, r * 2);
        eyes.add(put(e, { x: sx * (w + 0.24), y: ln.sheerY(tt) - ln.fb * 0.33, z: ln.z(tt, 0.7), ry: sx * Math.PI / 2 }));
      }
    }
    // A short stem post and the great forward bitts.
    wood.add(box(0.5, 1.8, 0.5, 0x3a2a1c, { y: ln.sheerY(1) + 0.6, z: zB + 0.3 }));
    lacquer.add(box(0.6, 0.18, 0.6, st.trim, { y: ln.sheerY(1) + 1.55, z: zB + 0.3 }));
    // A forward platform for the windlass, with the anchors hung from cat-heads.
    const tp = 0.9;
    wood.add(box(ln.width(tp, 0.9) * 1.4, 0.2, 2.6, 0x7a5a38, { y: ln.deckY(tp) + 0.2, z: ln.z(tp, 0.9) - 0.8 }));
    wood.add(cyl(0.22, 0.22, ln.width(tp, 0.9) * 1.3, 0x4a3520, { y: ln.deckY(tp) + 0.9, z: ln.z(tp, 0.9) - 0.8, rz: Math.PI / 2 }, 8));
    for (const sx of [-1, 1]) {
      const x = sx * (ln.width(0.82, 1) - 0.1), z = ln.z(0.82, 1);
      wood.add(box(0.2, 0.25, 1.4, 0x3a2a1c, { x, y: ln.sheerY(0.82) + 0.4, z: z + 0.5 }));
      // A wooden stock-anchor lashed to the bow.
      wood.add(cyl(0.07, 0.07, 2.0, 0x2a1d12, { x: x + sx * 0.3, y: ln.sheerY(0.82) - 0.5, z, rx: 0.2 }, 5));
      iron.add(box(1.1, 0.12, 0.12, 0x3a3a3a, { x: x + sx * 0.3, y: ln.sheerY(0.82) - 1.4, z }));
    }
    void kind; void rope; void rnd;
  }

  /** What is on the deck, by kind of junk. */
  private deckWork(ln: Lines, st: Style, kind: JunkKind, wood: Bucket, lacquer: Bucket, iron: Bucket, rope: Bucket, tiles: Bucket, rnd: () => number, aft: { top: number; lanternSpots: THREE.Vector3[]; zFront: number }): void {
    const hatch = (t: number, x: number, w: number, d: number, hgt: number, hex = 0x6a4a2a) => {
      wood.add(box(w, hgt, d, hex, { x, y: ln.deckY(t) + hgt / 2, z: ln.z(t, 0.5) }));
      wood.add(box(w + 0.24, 0.12, d + 0.24, 0x2a1d12, { x, y: ln.deckY(t) + hgt + 0.03, z: ln.z(t, 0.5) }));
    };
    const L = ln.L;
    switch (kind) {
      case 'war': {
        // A raised fighting platform amidships, rows of men's pavises, a bow gun on a carriage, spear racks.
        const t = 0.5;
        lacquer.add(box(ln.width(t, 0.9) * 1.1, 0.16, 5.2, 0x8a6a3a, { y: ln.deckY(t) + 1.1, z: ln.z(t, 0.5) }));
        for (const sx of [-1, 1]) {
          wood.add(box(0.14, 1.0, 5.2, 0x4a3520, { x: sx * ln.width(t, 0.9) * 0.55, y: ln.deckY(t) + 0.55, z: ln.z(t, 0.5) }));
          lacquer.add(box(0.1, 0.85, 5.2, st.topsides, { x: sx * (ln.width(t, 0.9) * 0.55 + 0.1), y: ln.deckY(t) + 1.55, z: ln.z(t, 0.5) }));
        }
        iron.add(cyl(0.2, 0.28, 2.0, 0x24211e, { y: ln.deckY(0.86) + 0.8, z: ln.z(0.86, 0.5) + 0.2, rx: Math.PI / 2 }, 8));
        wood.add(box(1.0, 0.5, 1.6, 0x4a3520, { y: ln.deckY(0.86) + 0.25, z: ln.z(0.86, 0.5) - 0.3 }));
        break;
      }
      case 'troop': {
        // A deckhouse for the officers and a long tent-roofed shelter for the soldiers.
        const t = 0.5;
        lacquer.add(box(ln.width(t, 0.9) * 0.9, 1.8, 4.8, st.topsides, { y: ln.deckY(t) + 0.9, z: ln.z(t, 0.5) }));
        this.roof(tiles, lacquer, ln.width(t, 0.9) * 0.62, 3.0, 1.0, ln.z(t, 0.5), ln.deckY(t) + 1.85, st);
        hatch(0.7, 0, 1.8, 2.2, 0.5);
        break;
      }
      case 'grain': {
        // Three great hatches roofed with mats, ranked down the centreline.
        for (const t of [0.34, 0.5, 0.66]) {
          const w = ln.width(t, 0.9) * 0.9;
          wood.add(box(w * 1.3, 0.9, 3.8, 0x5a4026, { y: ln.deckY(t) + 0.45, z: ln.z(t, 0.5) }));
          // A mat roof, a half-round.
          const cyl2 = new THREE.CylinderGeometry(w * 0.74, w * 0.74, 3.9, 12, 1, false, 0, Math.PI);
          cyl2.rotateZ(Math.PI / 2); cyl2.rotateY(Math.PI / 2);
          // The cylinder lies with its axis along z once rotated; the half faces up.
          const r = paint(cyl2, MAT);
          r.scale(1, 0.62, 1); r.translate(0, ln.deckY(t) + 0.9, ln.z(t, 0.5));
          wood.add(r);
          for (let b = -1; b <= 1; b++) wood.add(box(w * 1.5, 0.08, 0.14, 0x3a2a1c, { y: ln.deckY(t) + 1.3, z: ln.z(t, 0.5) + b * 1.2 }));
        }
        break;
      }
      case 'water': {
        // A rank of tank hatches: round, with iron bands, each with a wooden lid.
        for (let q = 0; q < 6; q++) {
          const t = 0.28 + q * 0.09;
          for (const sx of [-1, 1]) {
            const x = sx * ln.width(t, 0.9) * 0.42;
            const r = clamp(ln.B * 0.075, 0.5, 0.95);
            wood.add(cyl(r, r * 1.05, 1.0, 0x6a4a2a, { x, y: ln.deckY(t) + 0.5, z: ln.z(t, 0.5) }, 12));
            iron.add(cyl(r * 1.06, r * 1.08, 0.08, 0x2a2a2a, { x, y: ln.deckY(t) + 0.25, z: ln.z(t, 0.5) }, 12));
            iron.add(cyl(r * 1.06, r * 1.08, 0.08, 0x2a2a2a, { x, y: ln.deckY(t) + 0.8, z: ln.z(t, 0.5) }, 12));
            wood.add(cyl(r * 0.96, r * 0.96, 0.12, 0x3a2a1c, { x, y: ln.deckY(t) + 1.04, z: ln.z(t, 0.5) }, 12));
          }
        }
        hatch(0.5, 0, 1.6, 3.4, 0.6);
        break;
      }
      case 'horse': {
        // Rows of stalls down both sides: post-and-rail pens, with a loading ramp and stacked fodder.
        for (let q = 0; q < 8; q++) {
          const t = 0.24 + q * 0.07;
          for (const sx of [-1, 1]) {
            const x = sx * (ln.width(t, 0.9) * 0.55);
            wood.add(box(0.14, 1.9, 0.14, 0x4a3520, { x: x - sx * 1.1, y: ln.deckY(t) + 0.95, z: ln.z(t, 0.5) }));
            wood.add(box(0.14, 1.9, 0.14, 0x4a3520, { x: x + sx * 1.0, y: ln.deckY(t) + 0.95, z: ln.z(t, 0.5) }));
            wood.add(box(2.3, 0.1, 0.1, 0x6a4a2a, { x, y: ln.deckY(t) + 0.8, z: ln.z(t, 0.5) }));
            wood.add(box(2.3, 0.1, 0.1, 0x6a4a2a, { x, y: ln.deckY(t) + 1.55, z: ln.z(t, 0.5) }));
            // A horse in the pen, now and then.
            if (rnd() < 0.55) {
              const hx = x, hz = ln.z(t, 0.5) + 0.35, hy = ln.deckY(t);
              const bay = [0x6a3a22, 0x2a1d14, 0x9a7a52, 0x7a5a3a][Math.floor(rnd() * 4)];
              lacquer.add(box(0.6, 0.6, 1.5, bay, { x: hx, y: hy + 1.0, z: hz }));
              lacquer.add(box(0.28, 0.7, 0.28, bay, { x: hx, y: hy + 1.55, z: hz + 0.8, rx: -0.5 }));
              lacquer.add(box(0.22, 0.28, 0.5, bay, { x: hx, y: hy + 1.82, z: hz + 1.05 }));
              for (const lx of [-0.2, 0.2]) for (const lz of [-0.6, 0.6]) lacquer.add(box(0.1, 0.8, 0.1, bay, { x: hx + lx, y: hy + 0.4, z: hz + lz }));
            }
          }
        }
        for (const q of [0.62, 0.7]) wood.add(box(2.2, 1.4, 1.6, 0xc8a85a, { x: 0, y: ln.deckY(q) + 0.7, z: ln.z(q, 0.5) }));
        break;
      }
      case 'treasure': {
        // The treasure house amidships, with a curled roof, and rows of stowed chests under tarpaulin.
        const t = 0.52;
        lacquer.add(box(ln.width(t, 0.9) * 0.78, 2.6, 7.0, st.topsides, { y: ln.deckY(t) + 1.3, z: ln.z(t, 0.5) }));
        for (const sx of [-1, 1]) for (const zz of [-3.5, 3.5]) lacquer.add(box(0.3, 2.8, 0.3, st.trim, { x: sx * ln.width(t, 0.9) * 0.39, y: ln.deckY(t) + 1.4, z: ln.z(t, 0.5) + zz }));
        this.roof(tiles, lacquer, ln.width(t, 0.9) * 0.54, 4.8, 1.5, ln.z(t, 0.5), ln.deckY(t) + 2.7, st);
        for (let q = 0; q < 5; q++) {
          const tt = 0.74 + q * 0.04;
          hatch(tt, ((q % 2) - 0.5) * 3, 2.2, 1.8, 0.7, 0x5a3a22);
        }
        break;
      }
    }
    void L; void aft; void iron; void rope;
  }

  /** A mast, its battened sail, the parrels, the bridle and the banner at the truck. */
  private buildMast(hull: HullClass, ln: Lines, st: Style, spec: { area: number; ceHeight: number; station: number }, index: number, count: number, wood: Bucket, lacquer: Bucket, rope: Bucket, iron: Bucket, rnd: () => number): void {
    const L = ln.L;
    const t = clamp(spec.station * 0.42 + 0.5, 0.06, 0.94);
    const z = ln.z(t, 0.5);
    const deckY = ln.deckY(t);
    // Rake: the foremast leans forward, the mizzen aft, the rest hardly at all.
    const rake = count === 1 ? 0 : (spec.station > 0.4 ? 0.07 : spec.station < -0.2 ? -0.05 : 0.0);
    // Sail: a rectangle a little taller than it is wide, standing off a low boom.
    const aspect = 0.58;
    let H = Math.sqrt(spec.area / aspect);
    let y0 = Math.max(deckY + 0.9, spec.ceHeight - H / 2);
    H = Math.min(H, spec.ceHeight * 2 - 2 * y0 + 0.001) || H;
    H = Math.max(H, Math.sqrt(spec.area / 0.9));
    const W = spec.area / H;
    const panels = clamp(Math.round(H / 1.35), 5, 12);

    // The mast: round, slightly tapered, with a bound tabernacle at the deck and a truck at the head.
    const top = y0 + H + 1.4;
    const mastLen = top - deckY + 1.2;
    const mg = new THREE.CylinderGeometry(0.2 + W * 0.006, 0.34 + W * 0.011, mastLen, 12);
    mg.rotateZ(0); mg.translate(0, mastLen / 2, 0);
    mg.rotateX(rake); mg.translate(0, deckY - 0.9, z);
    wood.add(paint(mg, 0x6e4e30));
    // Tabernacle: two stout cheeks either side of the mast, and a lashing.
    for (const sx of [-1, 1]) wood.add(box(0.26, 2.6, 1.0, 0x4a3520, { x: sx * 0.62, y: deckY + 1.2, z }));
    wood.add(box(1.6, 0.26, 1.0, 0x4a3520, { y: deckY + 2.4, z }));
    // Bands of rope round the mast.
    for (let q = 0; q < 4; q++) rope.add(cyl(0.36 + q * 0.0, 0.36, 0.1, 0x8a7550, { y: deckY + 0.5 + q * 0.5, z }, 12));
    // The truck: a gilded finial, and a small round fighting top on the great ships.
    lacquer.add(ball(0.3, st.trim, { y: top + 0.1 + rake * mastLen * 0.5, z: z + Math.sin(rake) * mastLen * 0.5 }));
    if (count >= 4 && index < 2) {
      lacquer.add(cyl(1.1, 0.9, 0.3, 0x8a6a3a, { y: top - 1.6, z: z + Math.sin(rake) * mastLen * 0.5 }, 12));
    }

    // The sail group: foot at y0, scaled in y as the canvas is reefed.
    const pivot = new THREE.Group();
    pivot.position.set(0, 0, z);
    this.group.add(pivot);
    const rig = new THREE.Group();
    rig.position.y = y0;
    pivot.add(rig);

    const build = buildSail(W, H, panels);
    const color = st.sail === 'cloth' ? st.sailColor : st.sailColor;
    const device = st.device && index === Math.min(1, count - 1);
    const mat = new THREE.MeshLambertMaterial({
      map: sailTexture(st.sail, color, st.sailDark, panels, device, index * 7 + hullSeed(hull.id)),
      side: THREE.DoubleSide,
      // Cloth is thin enough that the sun comes through it.
      emissive: 0x3a2a22, transparent: false,
    });
    this.cloths.push(mat);
    const sail = new THREE.Mesh(build.geometry, mat);
    rig.add(sail);

    // Battens: a full-length one at every panel boundary, run out past the leech, and the heavy head and boom.
    const bat = new Bucket();
    for (let p = 0; p <= panels; p++) {
      const y = (p / panels) * H;
      const heavy = p === 0 || p === panels;
      const zl = W * FORE_FRAC, zr = -W * (1 - FORE_FRAC) - 0.2;
      bat.add(box(heavy ? 0.2 : 0.13, heavy ? 0.2 : 0.13, zl - zr + 0.5, heavy ? 0x4a3520 : 0x7a5a38, { y, z: (zl + zr) / 2 + 0.1 }));
      // Bamboo ends, tipped with gold on the great ships.
      if (st.trim === GOLD) bat.add(box(0.15, 0.15, 0.18, GOLD, { y, z: zr - 0.18 }));
    }
    const bm = bat.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    if (bm) rig.add(bm);

    // Parrel rings round the mast at each batten, so the sail rides up and down it.
    const par = new Bucket();
    for (let p = 0; p <= panels; p++) {
      par.add(paint(put(new THREE.TorusGeometry(0.36, 0.05, 5, 12), { rx: Math.PI / 2, y: (p / panels) * H }), 0x8a7550));
    }
    const pm = par.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    if (pm) rig.add(pm);

    // The halyard, from the head batten to the truck, and the bridle of sheets from every batten end
    // to a common block astern of the boom.
    const lines = new THREE.BufferGeometry();
    const lp: number[] = [];
    const zr = -W * (1 - FORE_FRAC) - 0.2;
    const block = new THREE.Vector3(0, -1.0, zr - 0.4);
    for (let p = 1; p <= panels; p++) lp.push(0, (p / panels) * H, zr, block.x, block.y, block.z);
    lp.push(0, H, W * FORE_FRAC * 0.6, 0, H + 1.6, 0.0, 0, H, -W * 0.2, 0, H + 1.6, 0.0);
    lines.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    rig.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0x3a2a18, transparent: true, opacity: 0.85 })));

    // The banner at the truck: a long swallow-tail, streaming.
    const banner = this.makeBanner(st.bannerColors[index % st.bannerColors.length], clamp(W * 0.55, 2.5, 6), clamp(W * 0.1, 0.5, 1.1), index);
    banner.mesh.position.set(0, top + 0.6 + Math.sin(rake) * 0, z + Math.sin(rake) * mastLen * 0.5);
    this.group.add(banner.mesh);
    this.flags.push(banner);

    // The sheet to the deck, drawn each frame because both its ends move.
    this.masts.push({
      pivot, rig, sail, build, z, foot: y0,
      ropes: [{ local: new THREE.Vector3(block.x, y0 + block.y, block.z), fixed: new THREE.Vector3(0, deckY + 0.6, z - 2.4) }],
    });
    void lacquer; void iron; void rnd; void L;
  }

  private makeBanner(hex: number, length: number, width: number, seed: number): Flag {
    const geo = new THREE.PlaneGeometry(length, width, 16, 2);
    geo.translate(length / 2, 0, 0);
    const base = new Float32Array(geo.getAttribute('position').array);
    const mat = new THREE.MeshLambertMaterial({ color: hex, side: THREE.DoubleSide, emissive: new THREE.Color(hex).multiplyScalar(0.18) });
    this.cloths.push(mat);
    return { mesh: new THREE.Mesh(geo, mat), geo, base, length, phase: seed * 1.7 };
  }

  // ---------------------------------------------------------------------
  // Per frame

  update(v: RigView): void {
    for (let i = 0; i < this.masts.length; i++) {
      const m = this.masts[i];
      const s = v.sails[i];
      if (!s) continue;
      const targetAngle = v.trimSign * s.trim * DEG;
      m.pivot.rotation.y += (targetAngle - m.pivot.rotation.y) * 0.08;

      const setAmount = s.set * s.condition;
      const gone = s.condition <= 0.05;
      m.rig.visible = !gone;
      if (gone) continue;
      // Reefed: the panels are lowered and gathered at the boom, the battens bunching as they come down.
      m.rig.scale.y = clamp(setAmount, 0.18, 1);
      m.sail.visible = setAmount > 0.06;
      if (!m.sail.visible) continue;

      const pressure = clamp(v.pressures[i] ?? 0, -1, 1);
      const luffing = Math.abs(pressure) < 0.08;
      const shake = luffing ? clamp(v.apparentKnots / 26, 0, 1) * 0.5 : 0;
      const b = m.build;
      const pos = b.geometry.getAttribute('position') as THREE.BufferAttribute;
      const blow = downwindInShip(v.trueBeta);
      const a = m.pivot.rotation.y;
      const axX = Math.cos(a), axZ = -Math.sin(a);
      const downwind = blow.x * axX + blow.z * axZ;
      const fill = Math.max(Math.abs(pressure), clamp(v.apparentKnots / 14, 0, 1) * 0.42);
      const depth = Math.sign(downwind || 1) * fill * b.W * 0.16;
      for (let k = 0; k < pos.count; k++) {
        const bx = b.base[k * 3], by = b.base[k * 3 + 1], bz = b.base[k * 3 + 2];
        const flap = shake * b.W * 0.05 * b.luff[k] * Math.sin(v.t * 6.5 + k * 0.7 + by * 0.4);
        pos.setXYZ(k, bx + depth * b.weight[k] + flap, by, bz);
      }
      pos.needsUpdate = true;
      b.geometry.computeVertexNormals();
    }

    // The sheets: from the block astern of each boom to the deck.
    const arr = this.runningPos.array as Float32Array;
    let o = 0;
    for (const m of this.masts) {
      const a = m.pivot.rotation.y, ca = Math.cos(a), sa = Math.sin(a);
      for (const r of m.ropes) {
        arr[o++] = r.local.x * ca + r.local.z * sa;
        arr[o++] = r.local.y * (m.rig.visible ? Math.max(0.18, m.rig.scale.y) * 0 + 1 : 1);
        arr[o++] = -r.local.x * sa + r.local.z * ca + m.z;
        arr[o++] = r.fixed.x; arr[o++] = r.fixed.y; arr[o++] = r.fixed.z;
      }
    }
    this.runningPos.needsUpdate = true;

    // Rudder and tiller.
    const rudderAngle = clamp(v.rudder, -1, 1) * 30 * DEG;
    this.rudder.rotation.y += (rudderAngle - this.rudder.rotation.y) * 0.2;
    this.tiller.rotation.y += (-rudderAngle * 1.1 - this.tiller.rotation.y) * 0.2;

    // Banners stream downwind and whip along their fly.
    const stream = streamRotation(v.apparentBeta);
    const gust = clamp(v.apparentKnots / 20, 0.06, 1);
    for (const f of this.flags) {
      f.mesh.rotation.y = stream;
      const p = f.geo.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) {
        const bx = f.base[k * 3], by = f.base[k * 3 + 1];
        const u = clamp(bx / f.length, 0, 1);
        const whip = Math.sin(v.t * (3.4 + gust * 4.4) - u * 5.5 + f.phase) * u * u * gust;
        // A swallow-tail: the fly is notched.
        const notch = u > 0.82 ? (u - 0.82) * 1.5 * Math.sign(by || 1) * f.length * 0.0 : 0;
        p.setXYZ(k, bx, by + whip * 0.4 - (1 - gust) * u * u * 1.2 + notch, whip * 0.9);
      }
      p.needsUpdate = true;
    }
  }

  setHeel(heelDeg: number, pitchDeg: number): void {
    this.group.rotation.z = -heelDeg * DEG;
    this.group.rotation.x = pitchDeg * DEG;
  }

  /** The cloth greys under a storm sky, the lanterns are lit at dusk, the pavilion windows glow. */
  setLight(night: number, overcast: number): void {
    if (Math.abs(night - this.lit.night) < 0.01 && Math.abs(overcast - this.lit.overcast) < 0.01) return;
    this.lit = { night, overcast };
    const dim = (1 - overcast * 0.72) * (1 - night * 0.82);
    for (const m of this.cloths) {
      m.emissive.setRGB(0.23, 0.17, 0.13).multiplyScalar(dim);
      m.color.setScalar(1 - overcast * 0.34);
    }
    const glow = smoothstep(0.2, 0.7, night);
    this.lanternMat.emissive.setRGB(1, 0.42, 0.14).multiplyScalar(0.08 + glow * 2.6);
    this.windowMat.emissive.setRGB(1, 0.62, 0.26).multiplyScalar(glow * 1.2);
    for (const h of this.lamps) {
      h.visible = glow > 0.01;
      (h.material as THREE.SpriteMaterial).opacity = glow * 0.95;
    }
    if (this.lampLight) this.lampLight.intensity = glow * 9;
  }

  dispose(): void {
    const done = new Set<THREE.Material>();
    const keep = new Set<THREE.Texture>([...cache.values(), plankTexture(), glowTexture()]);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      for (const x of Array.isArray(m) ? m : m ? [m] : []) {
        if (done.has(x)) continue;
        done.add(x);
        const mp = (x as THREE.MeshLambertMaterial).map;
        if (mp && !keep.has(mp)) mp.dispose();
        x.dispose();
      }
    });
  }
}

function hullSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

void lerp;

/** What the renderer needs of any hull model. */
export type HullModel = ShipMesh | JunkMesh;

/** The model for a hull: a Ming junk for the Xiyang hulls, a European ship otherwise. */
export function makeHullModel(hull: HullClass, opts: { lamp?: boolean } = {}): HullModel {
  return JUNK_KIND[hull.id] ? new JunkMesh(hull, opts) : new ShipMesh(hull, opts);
}
