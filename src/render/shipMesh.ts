import * as THREE from 'three';
import { DEG, clamp, lerp, smoothstep } from '../core/math';
import type { HullClass, MastSpec } from '../ship/hull';
import type { SailState } from '../ship/physics';

const OAK = 0x8a6743;
const DARK_OAK = 0x5f452b;
const DECK = 0xa08258;
const CANVAS = 0xece4d2;
const SPAR = 0x9a7a4e;

/** Rake of a lateen yard from the vertical. */
const LATEEN_RAKE = 42;

/** Height of the sheer above the designed waterline, as a multiple of draft. */
const FREEBOARD = 1.08;

interface SailBuild {
  geometry: THREE.BufferGeometry;
  /** Undeformed vertex positions. */
  base: Float32Array;
  /** How much each vertex bellies out, peaking in the middle of the sail. */
  weight: Float32Array;
  /** How close each vertex is to the luff, where a shaking sail shakes most. */
  luff: Float32Array;
  /** Which local axis the sail bellies along: 0 for x, 2 for z. */
  axis: 0 | 2;
  /** Overall size, used to scale the depth of the belly. */
  scale: number;
}

interface MastParts {
  spec: MastSpec;
  pivot: THREE.Group;
  yard: THREE.Mesh;
  sail: THREE.Mesh;
  build: SailBuild;
}

/**
 * A procedural caravel.
 *
 * The hull is lofted from parametric stations, which gives the right shape for
 * this kind of ship: fine forward, full amidships, a low waist and a raised
 * sterncastle. The sails are deformed every frame by the actual aerodynamic
 * force on them, so a sail that is drawing bellies out, a sail that is luffing
 * shakes along its leading edge, and a sail taken aback presses back against
 * the mast.
 */
export class ShipMesh {
  group = new THREE.Group();
  private masts: MastParts[] = [];
  private flag: THREE.Mesh;
  private flagGeo: THREE.PlaneGeometry;
  private flagBase: Float32Array;
  private wakeMaterial: THREE.MeshBasicMaterial;
  private wake: THREE.Mesh;

  constructor(hull: HullClass) {
    const L = hull.lwl;
    const B = hull.beam;
    const D = hull.draft;

    this.group.add(buildHull(L, B, D));
    this.group.add(buildDeck(L, B, D));
    this.group.add(buildSterncastle(L, B, D));
    this.group.add(buildForecastle(L, B, D));
    this.group.add(buildRails(L, B, D));

    const crossTexture = makeCrossTexture();
    const mainIndex = hull.masts.reduce(
      (best, m, i) => (m.area > hull.masts[best].area ? i : best), 0,
    );

    for (let i = 0; i < hull.masts.length; i++) {
      this.masts.push(this.buildMast(hull.masts[i], hull, i === mainIndex ? crossTexture : null));
    }

    // A banner at the main truck, which is also the best wind vane aboard.
    this.flagGeo = new THREE.PlaneGeometry(3.2, 1.9, 10, 5);
    this.flagBase = new Float32Array(this.flagGeo.getAttribute('position').array);
    this.flag = new THREE.Mesh(
      this.flagGeo,
      new THREE.MeshBasicMaterial({ color: 0xc8352c, side: THREE.DoubleSide }),
    );
    const tallest = hull.masts.reduce((a, b) => (a.ceHeight > b.ceHeight ? a : b));
    this.flag.position.set(0, tallest.ceHeight * 1.72, tallest.station * L * 0.42);
    this.group.add(this.flag);

    const wakeGeo = new THREE.PlaneGeometry(B * 2.4, L * 3.2, 1, 1);
    this.wakeMaterial = new THREE.MeshBasicMaterial({
      color: 0xdfe9ee, transparent: true, opacity: 0, depthWrite: false,
    });
    this.wake = new THREE.Mesh(wakeGeo, this.wakeMaterial);
    this.wake.rotation.x = -Math.PI / 2;
    this.wake.position.set(0, 0.12, -L * 1.5);
    this.wake.renderOrder = 2;
    this.group.add(this.wake);
  }

  private buildMast(spec: MastSpec, hull: HullClass, texture: THREE.Texture | null): MastParts {
    const L = hull.lwl;
    const D = hull.draft;
    const mastHeight = spec.ceHeight * 1.72;
    const z = spec.station * L * 0.42;
    const deckY = sheerAt(0.5) * D * FREEBOARD;

    const pivot = new THREE.Group();
    pivot.position.set(0, 0, z);
    this.group.add(pivot);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.3, mastHeight, 8),
      new THREE.MeshLambertMaterial({ color: SPAR }),
    );
    mast.position.y = mastHeight / 2 + D * 0.15;
    pivot.add(mast);

    const build = spec.rig === 'lateen'
      ? buildLateenSail(spec.area, deckY)
      : buildSquareSail(spec.area, spec.ceHeight * 1.42);

    const sail = new THREE.Mesh(
      build.geometry,
      new THREE.MeshLambertMaterial({
        color: CANVAS,
        side: THREE.DoubleSide,
        map: texture ?? undefined,
        transparent: true,
        // Canvas is thin enough that the sun glows through it, so a backlit sail
        // is never a black shape against the sky.
        emissive: 0x2e2b24,
      }),
    );
    pivot.add(sail);

    // The yard is drawn along the sail's head, so the two always agree.
    const yardMat = new THREE.MeshLambertMaterial({ color: SPAR });
    let yard: THREE.Mesh;
    if (spec.rig === 'lateen') {
      const s = lateenPoints(spec.area, deckY);
      const dir = new THREE.Vector3().subVectors(s.peak, s.tack);
      const len = dir.length();
      yard = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.08, len * 1.06, 6), yardMat);
      yard.position.copy(s.tack).addScaledVector(dir, 0.5);
      yard.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    } else {
      const s = squarePoints(spec.area, spec.ceHeight * 1.42);
      yard = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, s.width * 1.14, 6), yardMat);
      yard.rotation.z = Math.PI / 2;
      yard.position.set(0, s.top, 0);
    }
    pivot.add(yard);

    // Standing rigging down to the channels, and a stay forward.
    const shroudMat = new THREE.LineBasicMaterial({ color: 0x3a2f22, transparent: true, opacity: 0.7 });
    const pts: THREE.Vector3[] = [];
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        pts.push(new THREE.Vector3(0, mastHeight * 0.9, 0));
        pts.push(new THREE.Vector3(side * hull.beam * 0.46, deckY, (k - 1) * 1.6));
      }
    }
    pts.push(new THREE.Vector3(0, mastHeight * 0.88, 0));
    pts.push(new THREE.Vector3(0, deckY + D * 0.3, L * 0.46 - z));
    pivot.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), shroudMat));

    return { spec, pivot, yard, sail, build };
  }

  /**
   * Set the rig to match the simulation. `trimSign` is the side the sails are
   * sheeted to, and `pressures` is how hard each one is drawing, signed so that
   * a negative value means the wind is on the wrong side of it.
   */
  update(
    sails: SailState[],
    trimSign: number,
    pressures: number[],
    apparentBeta: number,
    apparentKnots: number,
    speedKnots: number,
    t: number,
  ): void {
    for (let i = 0; i < this.masts.length; i++) {
      const m = this.masts[i];
      const s = sails[i];
      if (!s) continue;

      // A lateen yard rests fore-and-aft and swings out; a square yard rests
      // athwartships and braces round, so the two measure trim from opposite
      // datums.
      const rest = m.spec.rig === 'square' ? 90 : 0;
      const targetAngle = trimSign * (s.trim - rest) * DEG;
      m.pivot.rotation.y += (targetAngle - m.pivot.rotation.y) * 0.08;

      const setAmount = s.set * s.condition;
      m.sail.visible = setAmount > 0.02;
      m.yard.visible = s.condition > 0.05;
      if (!m.sail.visible) continue;

      const mat = m.sail.material as THREE.MeshLambertMaterial;
      mat.opacity = clamp(setAmount * 1.5, 0.2, 1);

      const furl = 1 - setAmount;
      const pressure = clamp(pressures[i] ?? 0, -1, 1);
      const luffing = Math.abs(pressure) < 0.08;
      const shake = luffing ? clamp(apparentKnots / 26, 0, 1) * 0.5 : 0;

      const b = m.build;
      const pos = b.geometry.getAttribute('position') as THREE.BufferAttribute;
      const depth = pressure * b.scale * 0.16;

      for (let v = 0; v < pos.count; v++) {
        const bx = b.base[v * 3];
        const by = b.base[v * 3 + 1];
        const bz = b.base[v * 3 + 2];

        // Furling gathers the sail up toward its head rather than shrinking it.
        const gathered = furl * 0.75;
        const belly = depth * b.weight[v] * (1 - gathered);
        const flap = shake * b.scale * 0.07 * b.luff[v]
          * Math.sin(t * 10 + v * 0.7 + bx * 0.3 + bz * 0.3);

        const offset = belly + flap;
        if (b.axis === 0) {
          pos.setXYZ(v, bx + offset, by, bz);
        } else {
          pos.setXYZ(v, bx, by, bz + offset);
        }
      }
      pos.needsUpdate = true;
      b.geometry.computeVertexNormals();
      m.sail.scale.y = 1 - furl * 0.55;
    }

    // The banner streams with the apparent wind.
    this.flag.rotation.y = (apparentBeta + 180) * DEG;
    const fpos = this.flagGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let v = 0; v < fpos.count; v++) {
      const bx = this.flagBase[v * 3];
      const by = this.flagBase[v * 3 + 1];
      const u = bx / 3.2 + 0.5;
      const flutter = Math.sin(t * 9 + u * 7) * u * clamp(apparentKnots / 22, 0.05, 1) * 0.4;
      fpos.setXYZ(v, bx, by + flutter * 0.4, flutter);
    }
    fpos.needsUpdate = true;

    this.wakeMaterial.opacity = clamp(Math.abs(speedKnots) / 9, 0, 1) * 0.3;
  }

  setHeel(heelDeg: number, pitchDeg: number): void {
    this.group.rotation.z = -heelDeg * DEG;
    this.group.rotation.x = pitchDeg * DEG;
  }

  dispose(): void {
    this.group.traverse((o: THREE.Object3D) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    });
  }
}

// ---------------------------------------------------------------------------
// Sails
// ---------------------------------------------------------------------------

/**
 * Corners of a lateen sail, sized so the triangle's area matches the rig.
 * The tack is down and forward near the deck, the peak is high and aft at the
 * masthead, and the clew is aft at the level of the rail: the enormous raked
 * yard that let these ships lie closer to the wind than anything else afloat.
 */
function lateenPoints(area: number, deckY: number): { tack: THREE.Vector3; peak: THREE.Vector3; clew: THREE.Vector3 } {
  const dirY = Math.cos(LATEEN_RAKE * DEG);
  const dirZ = -Math.sin(LATEEN_RAKE * DEG);
  // Unit shape, then scaled so the area comes out right.
  const clewY = 0.10;
  const clewZ = -0.75;
  const unitArea = 0.5 * Math.abs(dirY * clewZ - dirZ * clewY);
  const s = Math.sqrt(area / unitArea);

  const tack = new THREE.Vector3(0, deckY, s * 0.16);
  return {
    tack,
    peak: new THREE.Vector3(tack.x, tack.y + dirY * s, tack.z + dirZ * s),
    clew: new THREE.Vector3(tack.x, tack.y + clewY * s, tack.z + clewZ * s),
  };
}

function buildLateenSail(area: number, deckY: number): SailBuild {
  const { tack, peak, clew } = lateenPoints(area, deckY);
  const N = 9;

  const positions: number[] = [];
  const weight: number[] = [];
  const luff: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const offsets: number[] = [];

  let running = 0;
  for (let i = 0; i <= N; i++) { offsets.push(running); running += N - i + 1; }
  const idx = (i: number, j: number) => offsets[i] + j;

  // Texture mapping is done from the vertex's real position in the sail's plane
  // rather than barycentrically, so the cross of the Order of Christ stays square
  // and upright instead of being sheared across the triangle. The texture border
  // is plain canvas, so anything falling outside simply clamps to cloth.
  const cz = (peak.z + clew.z + tack.z) / 3;
  const cy = (peak.y + clew.y + tack.y) / 3;
  const extentZ = Math.max(peak.z, clew.z, tack.z) - Math.min(peak.z, clew.z, tack.z);
  const extentY = Math.max(peak.y, clew.y, tack.y) - Math.min(peak.y, clew.y, tack.y);
  const uvScale = Math.min(extentZ, extentY) * 0.85;

  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N - i; j++) {
      const k = N - i - j;
      const a = i / N, b = j / N, c = k / N;
      positions.push(
        peak.x * a + clew.x * b + tack.x * c,
        peak.y * a + clew.y * b + tack.y * c,
        peak.z * a + clew.z * b + tack.z * c,
      );
      const vz = peak.z * a + clew.z * b + tack.z * c;
      const vy = peak.y * a + clew.y * b + tack.y * c;
      uv.push(0.5 - (vz - cz) / uvScale, 0.5 + (vy - cy) / uvScale);
      // Peaks at the centroid and falls to nothing at every edge.
      weight.push(27 * a * b * c);
      // The luff is the edge from tack to peak, the one laced to the yard.
      luff.push(clamp(1 - b * 2.2, 0, 1));
    }
  }

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N - i; j++) {
      indices.push(idx(i, j), idx(i + 1, j), idx(i, j + 1));
      if (j < N - i - 1) indices.push(idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1));
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();

  return {
    geometry,
    base: new Float32Array(positions),
    weight: new Float32Array(weight),
    luff: new Float32Array(luff),
    axis: 0,
    scale: Math.sqrt(area),
  };
}

function squarePoints(area: number, yardY: number): { width: number; height: number; top: number } {
  // A square course is wide and shallow.
  const width = Math.sqrt(area * 1.75);
  return { width, height: area / width, top: yardY };
}

function buildSquareSail(area: number, yardY: number): SailBuild {
  const { width, height, top } = squarePoints(area, yardY);
  const nx = 10;
  const ny = 8;

  const positions: number[] = [];
  const weight: number[] = [];
  const luff: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const v = j / ny;
      // The foot of a square sail is cut with a slight roach.
      const foot = 1 - Math.sin(Math.PI * u) * 0.07;
      positions.push((u - 0.5) * width, top - v * height * foot, 0);
      weight.push(Math.sin(Math.PI * u) * Math.sin(Math.PI * clamp(v * 1.05, 0, 1)));
      luff.push(Math.sin(Math.PI * u) * v);
    }
  }

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      indices.push(a, a + nx + 1, a + 1);
      indices.push(a + 1, a + nx + 1, a + nx + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const uv: number[] = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) uv.push(i / nx, 1 - j / ny);
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();

  return {
    geometry,
    base: new Float32Array(positions),
    weight: new Float32Array(weight),
    luff: new Float32Array(luff),
    axis: 2,
    scale: Math.sqrt(area),
  };
}

// ---------------------------------------------------------------------------
// Hull construction
// ---------------------------------------------------------------------------

/** Half-beam as a fraction of maximum, along the length. */
function beamAt(t: number): number {
  if (t < 0.12) return lerp(0.34, 0.66, t / 0.12);
  if (t < 0.45) return lerp(0.66, 1.0, smoothstep(0.12, 0.45, t));
  if (t < 0.78) return lerp(1.0, 0.62, smoothstep(0.45, 0.78, t));
  return lerp(0.62, 0.07, smoothstep(0.78, 1.0, t));
}

/** Height of the sheer line above the waterline, as a fraction of draft. */
function sheerAt(t: number): number {
  const mid = 0.52;
  const d = Math.abs(t - mid) / mid;
  return lerp(0.95, 1.95, Math.pow(d, 1.7));
}

function keelAt(t: number): number {
  if (t < 0.08) return lerp(0.55, 1.0, t / 0.08);
  if (t > 0.86) return lerp(1.0, 0.35, (t - 0.86) / 0.14);
  return 1;
}

function sectionWidth(v: number, t: number): number {
  const rise = Math.pow(clamp(v, 0, 1), 0.52);
  const tumble = 1 - Math.pow(clamp(v, 0, 1), 5) * 0.22;
  const fineness = lerp(1, 0.72, smoothstep(0.7, 1, t));
  return rise * tumble * fineness;
}

function buildHull(L: number, B: number, D: number): THREE.Mesh {
  const stations = 34;
  const rows = 14;
  const positions: number[] = [];
  const indices: number[] = [];
  const halfB = B / 2;

  for (let i = 0; i < stations; i++) {
    const t = i / (stations - 1);
    const z = (t - 0.5) * L;
    const bw = beamAt(t) * halfB;
    const keel = -keelAt(t) * D;
    const sheer = sheerAt(t) * D * FREEBOARD;

    for (let j = 0; j < rows; j++) {
      const v = j / (rows - 1);
      positions.push(-sectionWidth(v, t) * bw, lerp(keel, sheer, v), z);
    }
    for (let j = rows - 1; j >= 0; j--) {
      const v = j / (rows - 1);
      positions.push(sectionWidth(v, t) * bw, lerp(keel, sheer, v), z);
    }
  }

  const perStation = rows * 2;
  for (let i = 0; i < stations - 1; i++) {
    for (let j = 0; j < perStation - 1; j++) {
      const a = i * perStation + j;
      indices.push(a, a + perStation, a + 1);
      indices.push(a + 1, a + perStation, a + perStation + 1);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: OAK, side: THREE.DoubleSide }));
}

function buildDeck(L: number, B: number, D: number): THREE.Mesh {
  const stations = 26;
  const positions: number[] = [];
  const indices: number[] = [];
  const halfB = B / 2;

  for (let i = 0; i < stations; i++) {
    const t = i / (stations - 1);
    const z = (t - 0.5) * L;
    const bw = beamAt(t) * halfB * 0.93;
    const y = sheerAt(t) * D * FREEBOARD;
    positions.push(-bw, y, z);
    positions.push(bw, y, z);
  }
  for (let i = 0; i < stations - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1);
    indices.push(a + 1, a + 2, a + 3);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: DECK, side: THREE.DoubleSide }));
}

function buildSterncastle(L: number, B: number, D: number): THREE.Group {
  const g = new THREE.Group();
  const w = B * 0.66;
  const h = D * 0.85;
  const len = L * 0.2;

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, len),
    new THREE.MeshLambertMaterial({ color: DARK_OAK }),
  );
  box.position.set(0, sheerAt(0.12) * D * FREEBOARD + h / 2 - 0.2, -L * 0.5 + len * 0.66);
  g.add(box);

  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(w * 1.05, 0.3, len * 1.03),
    new THREE.MeshLambertMaterial({ color: OAK }),
  );
  rail.position.set(0, box.position.y + h / 2 + 0.35, box.position.z);
  g.add(rail);
  return g;
}

function buildForecastle(L: number, B: number, D: number): THREE.Group {
  const g = new THREE.Group();
  const w = B * 0.46;
  const h = D * 0.5;
  const len = L * 0.12;
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, len),
    new THREE.MeshLambertMaterial({ color: DARK_OAK }),
  );
  box.position.set(0, sheerAt(0.9) * D * FREEBOARD + h / 2 - 0.2, L * 0.5 - len * 0.95);
  g.add(box);

  const sprit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.19, L * 0.3, 6),
    new THREE.MeshLambertMaterial({ color: SPAR }),
  );
  sprit.rotation.x = Math.PI / 2 - 22 * DEG;
  sprit.position.set(0, box.position.y + h * 0.3, L * 0.56);
  g.add(sprit);
  return g;
}

function buildRails(L: number, B: number, D: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: DARK_OAK, side: THREE.DoubleSide });
  const stations = 22;

  for (const side of [-1, 1]) {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < stations; i++) {
      const t = 0.08 + (i / (stations - 1)) * 0.84;
      const z = (t - 0.5) * L;
      const bw = beamAt(t) * (B / 2) * 0.95;
      const y = sheerAt(t) * D * FREEBOARD;
      positions.push(side * bw, y, z);
      positions.push(side * bw * 0.97, y + D * 0.3, z);
    }
    for (let i = 0; i < stations - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1);
      indices.push(a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, mat));
  }
  return g;
}

/** The cross of the Order of Christ, which these ships carried on their sails. */
function makeCrossTexture(): THREE.Texture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ece4d2';
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size * 0.5;
  const arm = size * 0.28;
  const thick = size * 0.10;
  const flare = size * 0.072;

  ctx.fillStyle = '#b8322a';
  for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    drawCrossArm(ctx, cx, cy, arm, thick, flare, rot);
  }
  ctx.fillStyle = '#ece4d2';
  for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    drawCrossArm(ctx, cx, cy, arm * 0.6, thick * 0.38, flare * 0.32, rot);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawCrossArm(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, len: number, thick: number, flare: number, rot: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(-thick / 2, 0);
  ctx.lineTo(-thick / 2 - flare, -len);
  ctx.lineTo(thick / 2 + flare, -len);
  ctx.lineTo(thick / 2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
