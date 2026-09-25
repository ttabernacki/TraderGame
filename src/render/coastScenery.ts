import * as THREE from 'three';
import { clamp } from '../core/math';

/**
 * What stands on the coast.
 *
 * The land was a coloured band with a height field under it, and from the deck
 * every coast in the world was the same smooth ribbon in a different tint: the
 * Sahara, the Guinea forest, the Cape and the Malabar palms all read as one
 * brown line on the skyline. What a pilot actually knew a coast by — what the
 * rutters describe, headland by headland — is what stood on it: "a low land
 * all of trees", "white sand hills", "red cliffs like a wall", "a land of
 * palms". Running a new coast is only a discovery if the coast looks new.
 *
 * So each stretch of shore is dressed by region, with a handful of low-poly
 * shapes drawn as instanced meshes: palms along the beach, a ragged forest
 * canopy behind it, baobabs and flat-topped acacias in the dry country, dunes
 * and pale cliffs in the desert, dark cypresses on the Barbary hills, bare rock
 * at the Cape and in Arabia. Every one of them is placed at a fixed point on
 * the earth — hashed from the coastline vertex it belongs to — so the same tree
 * is on the same bluff every time the band is rebuilt and nothing swims.
 *
 * Sizes are exaggerated for the same reason the low land is: a real palm eight
 * miles off is a pixel, and a treeline you cannot see is not a landmark.
 */

export type PropKind =
  | 'palm' | 'canopy' | 'acacia' | 'baobab' | 'dune' | 'cliff' | 'cypress' | 'rock' | 'scrub';

export interface Layer {
  kind: PropKind;
  /** Metres between chances along the shore. */
  spacing: number;
  /** Chance per slot. */
  chance: number;
  /** How far inland, metres. */
  inland: [number, number];
  /** Height in metres, as drawn. */
  height: [number, number];
  /** Width over height. */
  aspect: [number, number];
  colour: [number, number, number];
  /** How much the colour varies, 0 to 1. */
  vary?: number;
}

export interface Region {
  name: string;
  layers: Layer[];
}

const GREEN_DARK: [number, number, number] = [0.10, 0.21, 0.09];
const GREEN_PALM: [number, number, number] = [0.24, 0.36, 0.14];
const SAND: [number, number, number] = [0.90, 0.80, 0.58];
const SAND_RED: [number, number, number] = [0.86, 0.60, 0.40];
const LATERITE: [number, number, number] = [0.66, 0.34, 0.22];
const CHALK: [number, number, number] = [0.88, 0.86, 0.80];
const GRANITE: [number, number, number] = [0.46, 0.45, 0.43];
const TAN: [number, number, number] = [0.70, 0.58, 0.42];
const SCRUB: [number, number, number] = [0.42, 0.44, 0.24];
const DRY: [number, number, number] = [0.55, 0.50, 0.30];
const CYPRESS: [number, number, number] = [0.12, 0.22, 0.12];
const FYNBOS: [number, number, number] = [0.40, 0.46, 0.34];
const CORAL: [number, number, number] = [0.86, 0.83, 0.74];

const R = {
  iberia: {
    name: 'iberia',
    layers: [
      { kind: 'cliff', spacing: 900, chance: 0.35, inland: [0, 40], height: [30, 70], aspect: [4, 8], colour: TAN, vary: 0.1 },
      { kind: 'cypress', spacing: 90, chance: 0.35, inland: [300, 5000], height: [18, 30], aspect: [0.25, 0.35], colour: CYPRESS },
      { kind: 'scrub', spacing: 70, chance: 0.6, inland: [60, 3000], height: [6, 12], aspect: [2, 4], colour: SCRUB },
    ],
  },
  islands: {
    name: 'islands',
    layers: [
      { kind: 'cliff', spacing: 500, chance: 0.6, inland: [0, 30], height: [50, 140], aspect: [3, 6], colour: [0.30, 0.27, 0.25], vary: 0.1 },
      { kind: 'canopy', spacing: 80, chance: 0.4, inland: [400, 5000], height: [18, 30], aspect: [1.4, 2.2], colour: [0.20, 0.36, 0.16] },
      { kind: 'scrub', spacing: 60, chance: 0.5, inland: [100, 3000], height: [6, 10], aspect: [2, 4], colour: SCRUB },
    ],
  },
  barbary: {
    name: 'barbary',
    layers: [
      { kind: 'cliff', spacing: 800, chance: 0.4, inland: [0, 40], height: [25, 60], aspect: [4, 9], colour: SAND_RED, vary: 0.1 },
      { kind: 'scrub', spacing: 55, chance: 0.55, inland: [80, 4000], height: [6, 12], aspect: [2, 3.5], colour: DRY },
      { kind: 'cypress', spacing: 160, chance: 0.2, inland: [800, 6000], height: [14, 22], aspect: [0.3, 0.4], colour: CYPRESS },
    ],
  },
  sahara: {
    name: 'sahara',
    layers: [
      { kind: 'dune', spacing: 320, chance: 0.9, inland: [30, 6000], height: [26, 70], aspect: [7, 13], colour: [0.70, 0.56, 0.38], vary: 0.08 },
      { kind: 'cliff', spacing: 1400, chance: 0.35, inland: [0, 30], height: [20, 45], aspect: [6, 12], colour: CHALK, vary: 0.06 },
    ],
  },
  sahel: {
    name: 'sahel',
    layers: [
      { kind: 'baobab', spacing: 160, chance: 0.4, inland: [200, 5000], height: [22, 34], aspect: [0.9, 1.3], colour: [0.45, 0.42, 0.30] },
      { kind: 'acacia', spacing: 90, chance: 0.45, inland: [120, 5000], height: [12, 20], aspect: [1.4, 2.0], colour: DRY },
      { kind: 'dune', spacing: 600, chance: 0.3, inland: [40, 800], height: [10, 22], aspect: [5, 9], colour: SAND },
    ],
  },
  guinea: {
    name: 'guinea',
    layers: [
      { kind: 'palm', spacing: 45, chance: 0.7, inland: [25, 350], height: [30, 44], aspect: [0.7, 0.9], colour: GREEN_PALM },
      { kind: 'canopy', spacing: 38, chance: 0.95, inland: [300, 7000], height: [34, 60], aspect: [1.6, 2.4], colour: GREEN_DARK, vary: 0.18 },
      { kind: 'cliff', spacing: 1500, chance: 0.25, inland: [0, 30], height: [20, 45], aspect: [5, 10], colour: LATERITE, vary: 0.08 },
    ],
  },
  angola: {
    name: 'angola',
    layers: [
      { kind: 'cliff', spacing: 700, chance: 0.5, inland: [0, 30], height: [30, 80], aspect: [4, 9], colour: LATERITE, vary: 0.08 },
      { kind: 'baobab', spacing: 140, chance: 0.35, inland: [300, 5000], height: [22, 34], aspect: [0.9, 1.3], colour: [0.42, 0.40, 0.28] },
      { kind: 'scrub', spacing: 60, chance: 0.5, inland: [80, 4000], height: [6, 12], aspect: [2, 4], colour: DRY },
    ],
  },
  namib: {
    name: 'namib',
    layers: [
      { kind: 'dune', spacing: 170, chance: 0.9, inland: [40, 7000], height: [40, 110], aspect: [4, 8], colour: [0.78, 0.52, 0.34], vary: 0.06 },
    ],
  },
  cape: {
    name: 'cape',
    layers: [
      { kind: 'cliff', spacing: 450, chance: 0.6, inland: [0, 30], height: [40, 120], aspect: [3, 6], colour: GRANITE, vary: 0.08 },
      { kind: 'rock', spacing: 220, chance: 0.4, inland: [100, 3000], height: [20, 50], aspect: [1.2, 2], colour: GRANITE },
      { kind: 'scrub', spacing: 45, chance: 0.7, inland: [60, 5000], height: [5, 9], aspect: [2, 4], colour: FYNBOS },
    ],
  },
  mozambique: {
    name: 'mozambique',
    layers: [
      { kind: 'palm', spacing: 55, chance: 0.6, inland: [25, 400], height: [30, 42], aspect: [0.7, 0.9], colour: GREEN_PALM },
      { kind: 'canopy', spacing: 55, chance: 0.7, inland: [400, 6000], height: [26, 44], aspect: [1.6, 2.4], colour: [0.18, 0.36, 0.14], vary: 0.15 },
      { kind: 'dune', spacing: 700, chance: 0.3, inland: [20, 300], height: [10, 20], aspect: [5, 9], colour: SAND },
    ],
  },
  swahili: {
    name: 'swahili',
    layers: [
      { kind: 'palm', spacing: 40, chance: 0.75, inland: [20, 500], height: [30, 44], aspect: [0.7, 0.9], colour: GREEN_PALM },
      { kind: 'cliff', spacing: 900, chance: 0.35, inland: [0, 20], height: [12, 25], aspect: [8, 14], colour: CORAL, vary: 0.05 },
      { kind: 'baobab', spacing: 200, chance: 0.35, inland: [400, 5000], height: [22, 34], aspect: [0.9, 1.3], colour: [0.40, 0.40, 0.26] },
      { kind: 'canopy', spacing: 90, chance: 0.4, inland: [800, 6000], height: [22, 36], aspect: [1.6, 2.4], colour: [0.22, 0.38, 0.16] },
    ],
  },
  arabia: {
    name: 'arabia',
    layers: [
      { kind: 'cliff', spacing: 500, chance: 0.55, inland: [0, 40], height: [40, 120], aspect: [3, 7], colour: TAN, vary: 0.1 },
      { kind: 'rock', spacing: 200, chance: 0.5, inland: [200, 5000], height: [30, 80], aspect: [1.2, 2.2], colour: [0.58, 0.48, 0.36] },
      { kind: 'dune', spacing: 500, chance: 0.35, inland: [40, 2000], height: [14, 30], aspect: [5, 9], colour: SAND },
    ],
  },
  india: {
    name: 'india',
    layers: [
      { kind: 'palm', spacing: 26, chance: 0.9, inland: [20, 1400], height: [32, 46], aspect: [0.7, 0.9], colour: GREEN_PALM, vary: 0.12 },
      { kind: 'canopy', spacing: 60, chance: 0.7, inland: [1200, 7000], height: [30, 50], aspect: [1.6, 2.4], colour: GREEN_DARK, vary: 0.15 },
      { kind: 'cliff', spacing: 1600, chance: 0.25, inland: [0, 30], height: [20, 40], aspect: [5, 10], colour: LATERITE, vary: 0.08 },
    ],
  },
  malay: {
    name: 'malay',
    layers: [
      { kind: 'palm', spacing: 45, chance: 0.6, inland: [20, 400], height: [30, 42], aspect: [0.7, 0.9], colour: GREEN_PALM },
      { kind: 'canopy', spacing: 34, chance: 0.95, inland: [300, 7000], height: [36, 64], aspect: [1.6, 2.4], colour: GREEN_DARK, vary: 0.18 },
    ],
  },
  scrubland: {
    name: 'scrubland',
    layers: [
      { kind: 'scrub', spacing: 55, chance: 0.6, inland: [60, 4000], height: [6, 12], aspect: [2, 4], colour: SCRUB },
      { kind: 'rock', spacing: 400, chance: 0.3, inland: [200, 3000], height: [20, 40], aspect: [1.2, 2], colour: GRANITE },
    ],
  },
} satisfies Record<string, { name: string; layers: Layer[] }>;

/** Which dress the coast wears here. */
export function regionAt(lat: number, lon: number): Region {
  // The Atlantic islands, whatever latitude they are at: volcanic, steep, green
  // on the windward side.
  const island = (lat > 36 && lat < 40.5 && lon > -32 && lon < -24)   // Azores
    || (lat > 32 && lat < 33.3 && lon > -17.6 && lon < -16)              // Madeira
    || (lat > 27.4 && lat < 29.6 && lon > -18.3 && lon < -13.3)          // Canaries
    || (lat > 14.5 && lat < 17.5 && lon > -25.6 && lon < -22.4);          // Cabo Verde
  if (island) return R.islands;
  if (lat > 36) return R.iberia;
  if (lon < 12) {
    if (lat > 27) return R.barbary;
    if (lat > 16.5) return R.sahara;
    if (lat > 11) return R.sahel;
    if (lat > -5.5) return R.guinea;
    if (lat > -17) return R.angola;
    if (lat > -29.5) return R.namib;
  }
  if (lat <= -29.5 && lon < 32) return R.cape;
  if (lon >= 12 && lon < 22 && lat > -29.5 && lat < 0) return R.angola;
  if (lon >= 30 && lon < 52) {
    if (lat < -12) return R.mozambique;
    if (lat < 5) return R.swahili;
    return R.arabia;
  }
  if (lon >= 52 && lon < 66) return R.arabia;
  if (lon >= 66 && lon < 90) return lat > 23 ? R.arabia : R.india;
  if (lon >= 90) return R.malay;
  return R.scrubland;
}

/** A number in [0, 1) that is always the same for the same inputs. */
export function hash3(a: number, b: number, c: number): number {
  let h = 2166136261 ^ Math.imul(a | 0, 374761393);
  h = Math.imul(h ^ (b | 0), 668265263);
  h = Math.imul(h ^ (c | 0), 2246822519);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// Shapes. Unit height, centred on their base, with vertex colours so a palm
// can be a brown trunk and a green crown in one draw.

function paint(g: THREE.BufferGeometry, rgb: [number, number, number]): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const count = flat.reduce((s, p) => s + p.getAttribute('position').count, 0);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let o = 0;
  for (const p of flat) {
    p.computeVertexNormals();
    const pa = p.getAttribute('position').array as Float32Array;
    const na = p.getAttribute('normal').array as Float32Array;
    const ca = p.getAttribute('color').array as Float32Array;
    pos.set(pa, o); nor.set(na, o); col.set(ca, o);
    o += pa.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

const WHITE: [number, number, number] = [1, 1, 1];
const BARK: [number, number, number] = [0.42, 0.33, 0.24];

function shape(kind: PropKind): THREE.BufferGeometry {
  switch (kind) {
    case 'palm': {
      // A leaning trunk and a crown of drooping fronds. Width is set by the
      // instance; the trunk is a small fraction of it.
      const trunk = new THREE.CylinderGeometry(0.035, 0.05, 0.86, 5);
      trunk.translate(0, 0.43, 0);
      trunk.rotateZ(0.08);
      const parts = [paint(trunk, BARK)];
      for (let i = 0; i < 7; i++) {
        const frond = new THREE.ConeGeometry(0.09, 0.62, 3);
        frond.translate(0, 0.31, 0);
        frond.rotateZ(Math.PI / 2 + 0.55);
        frond.rotateY((i / 7) * Math.PI * 2);
        frond.translate(0.035, 0.85, 0);
        parts.push(paint(frond, WHITE));
      }
      return merge(parts);
    }
    case 'canopy': {
      // Lumpy crowns shoulder to shoulder: the ragged line a forest makes
      // against the sky.
      const a = new THREE.IcosahedronGeometry(0.5, 1);
      a.scale(1, 0.8, 1); a.translate(0, 0.55, 0);
      const b = new THREE.IcosahedronGeometry(0.34, 0);
      b.translate(0.28, 0.72, 0.1);
      const c = new THREE.IcosahedronGeometry(0.3, 0);
      c.translate(-0.3, 0.62, -0.12);
      return merge([paint(a, WHITE), paint(b, WHITE), paint(c, WHITE)]);
    }
    case 'acacia': {
      const trunk = new THREE.CylinderGeometry(0.03, 0.05, 0.75, 4);
      trunk.translate(0, 0.37, 0);
      const crown = new THREE.CylinderGeometry(0.5, 0.42, 0.2, 7);
      crown.translate(0, 0.86, 0);
      return merge([paint(trunk, BARK), paint(crown, WHITE)]);
    }
    case 'baobab': {
      // The bottle trunk and the root-like crown.
      const trunk = new THREE.CylinderGeometry(0.2, 0.3, 0.7, 7);
      trunk.translate(0, 0.35, 0);
      const crown = new THREE.IcosahedronGeometry(0.42, 0);
      crown.scale(1, 0.5, 1); crown.translate(0, 0.8, 0);
      return merge([paint(trunk, [0.55, 0.47, 0.40]), paint(crown, WHITE)]);
    }
    case 'dune': {
      const d = new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      d.scale(1, 2, 0.45);
      return merge([paint(d, WHITE)]);
    }
    case 'cliff': {
      // A wall with a slightly battered face and a flat top, set along the
      // shore. Length is the instance's width; depth is fixed.
      // Strata in the vertex colours, a ragged skyline, and a face that
      // bulges and recedes along its length, so it reads as rock and not as
      // a wall somebody built.
      const w = new THREE.BoxGeometry(1, 1, 0.14, 18, 9, 1);
      const p = w.getAttribute('position');
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const x = p.getX(i);
        const bulge = Math.sin(x * 9.1) * 0.03 + Math.sin(x * 23.7) * 0.015;
        p.setZ(i, p.getZ(i) + bulge + (y + 0.5) * 0.05);
        if (y > 0.49) p.setY(i, y - Math.abs(Math.sin(x * 11.3 + 1.2)) * 0.22 - Math.abs(Math.sin(x * 31.1)) * 0.08);
        // Taper the ends into the land.
        const end = Math.min(1, (0.5 - Math.abs(x)) * 6);
        p.setY(i, (p.getY(i) + 0.5) * Math.max(end, 0.15) - 0.5);
        // Strata that wander, not stripes ruled across it: the bedding dips
        // and swells along the face, and the rock darkens toward the sea.
        const band = 0.9 + 0.1 * Math.sin((y + 0.5) * 13.0 + Math.sin(x * 7.3) * 1.6 + x * 2.1);
        const foot = 0.78 + 0.22 * Math.min(1, (y + 0.5) * 1.6);
        col[i * 3] = band * foot; col[i * 3 + 1] = band * foot; col[i * 3 + 2] = band * foot;
      }
      w.translate(0, 0.5, 0);
      w.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return merge([w]);
    }
    case 'cypress': {
      const c = new THREE.ConeGeometry(0.5, 1, 6);
      c.translate(0, 0.5, 0);
      return merge([paint(c, WHITE)]);
    }
    case 'rock': {
      const r = new THREE.DodecahedronGeometry(0.5, 0);
      r.scale(1, 1.1, 0.8); r.translate(0, 0.35, 0);
      return merge([paint(r, WHITE)]);
    }
    case 'scrub': {
      const s = new THREE.IcosahedronGeometry(0.5, 0);
      s.scale(1, 0.55, 1); s.translate(0, 0.25, 0);
      return merge([paint(s, WHITE)]);
    }
  }
}

const KINDS: PropKind[] = ['palm', 'canopy', 'acacia', 'baobab', 'dune', 'cliff', 'cypress', 'rock', 'scrub'];
const MAX: Record<PropKind, number> = {
  palm: 6000, canopy: 9000, acacia: 3000, baobab: 1500, dune: 2500, cliff: 800,
  cypress: 2500, rock: 1500, scrub: 6000,
};

/**
 * The instanced meshes, refilled every time the coast band is rebuilt.
 * Lives in the land's own group so it slides with it between rebuilds.
 */
export class CoastScenery {
  group = new THREE.Group();
  private material: THREE.MeshLambertMaterial;
  private meshes = new Map<PropKind, THREE.InstancedMesh>();
  private counts = new Map<PropKind, number>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private c = new THREE.Color();
  private haze = new THREE.Color(0.70, 0.76, 0.82);

  constructor() {
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (const k of KINDS) {
      const mesh = new THREE.InstancedMesh(shape(k), this.material, MAX[k]);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      this.meshes.set(k, mesh);
      this.group.add(mesh);
    }
  }

  begin(): void {
    for (const k of KINDS) this.counts.set(k, 0);
  }

  /**
   * One thing on the coast. `yaw` turns it about the vertical; `fade` is how
   * much of it survives the haze, 0 to 1.
   */
  place(
    kind: PropKind, x: number, y: number, z: number, yaw: number,
    width: number, height: number, depth: number,
    colour: [number, number, number], shade: number, fade: number,
  ): void {
    const mesh = this.meshes.get(kind)!;
    const i = this.counts.get(kind)!;
    if (i >= MAX[kind] || fade <= 0.02) return;
    this.e.set(0, yaw, 0);
    this.q.setFromEuler(this.e);
    this.s.set(width, height, depth);
    this.p.set(x, y, z);
    this.m.compose(this.p, this.q, this.s);
    mesh.setMatrixAt(i, this.m);
    this.c.setRGB(colour[0] * shade, colour[1] * shade, colour[2] * shade)
      .lerp(this.haze, clamp(1 - fade, 0, 1) * 0.85);
    mesh.setColorAt(i, this.c);
    this.counts.set(kind, i + 1);
  }

  end(): void {
    for (const [k, mesh] of this.meshes) {
      mesh.count = this.counts.get(k) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  clear(): void {
    this.begin();
    this.end();
  }

  setFog(color: THREE.Color, intensity: number): void {
    this.material.color.setRGB(1, 1, 1).lerp(color, clamp(intensity, 0, 0.7));
    this.haze.copy(color).lerp(new THREE.Color(0.70, 0.76, 0.82), 0.5);
  }
}
