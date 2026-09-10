import * as THREE from 'three';
import { DEG, clamp, lerp, smoothstep } from '../core/math';
import type { HullClass, MastSpec } from '../ship/hull';
import type { SailState } from '../ship/physics';

const OAK = new THREE.Color(0xa8814f);
const OAK_DARK = new THREE.Color(0x6d5030);
const WALE = new THREE.Color(0x4a3520);
const BOTTOM = new THREE.Color(0x5b5046);
const SPAR = 0x9a7a4e;
const IRON = 0x2f2a24;

/** Rake of a lateen yard from the vertical. */
const LATEEN_RAKE = 42;

/** Height of the sheer above the designed waterline, as a multiple of draft. */
const FREEBOARD = 0.94;

export interface RigView {
  sails: SailState[];
  /** Which side the sails are sheeted to: -1 port, +1 starboard. */
  trimSign: number;
  /** Normalised drawing force per sail, negative when taken aback. */
  pressures: number[];
  apparentBeta: number;
  apparentKnots: number;
  /** Helm setting, -1 to +1. */
  rudder: number;
  t: number;
}

interface SailBuild {
  geometry: THREE.BufferGeometry;
  base: Float32Array;
  /** How much each vertex bellies out, peaking in the middle of the sail. */
  weight: Float32Array;
  /** How close each vertex is to the luff, where a shaking sail shakes most. */
  luff: Float32Array;
  /** Which local axis the sail bellies along: 0 for x, 2 for z. */
  axis: 0 | 2;
  scale: number;
  /** Where the cross sits in texture space, and the sail's aspect. */
  crossAt: [number, number];
  aspect: number;
}

interface MastParts {
  spec: MastSpec;
  pivot: THREE.Group;
  yard: THREE.Mesh;
  sail: THREE.Mesh;
  bundle: THREE.Mesh;
  build: SailBuild;
}

/**
 * A procedural caravel.
 *
 * The hull is lofted from parametric stations and coloured strake by strake, so
 * the planking, the wale and the tallowed bottom all read at a distance. The
 * sails are cut as real sails were — triangles laced to a raked yard for the
 * lateens, a roached rectangle for a square course — and are deformed every
 * frame by the actual aerodynamic force on them, so a sail that is drawing
 * bellies out, one that is luffing shakes along its leading edge, and one taken
 * aback presses back against the mast.
 */
export class ShipMesh {
  group = new THREE.Group();
  private masts: MastParts[] = [];
  private flag: THREE.Mesh;
  private flagGeo: THREE.PlaneGeometry;
  private flagBase: Float32Array;
  private rudder: THREE.Group;
  private tiller: THREE.Mesh;

  constructor(hull: HullClass) {
    const L = hull.lwl;
    const B = hull.beam;
    const D = hull.draft;

    this.group.add(buildHull(L, B, D));
    this.group.add(buildDeck(L, B, D));
    this.group.add(buildSterncastle(L, B, D));
    this.group.add(buildForecastle(L, B, D));
    this.group.add(buildRails(L, B, D));
    this.group.add(buildDeckFittings(L, B, D));

    const steering = buildSteering(L, B, D);
    this.rudder = steering.rudder;
    this.tiller = steering.tiller;
    this.group.add(this.rudder);
    this.group.add(this.tiller);

    const mainIndex = hull.masts.reduce(
      (best, m, i) => (m.area > hull.masts[best].area ? i : best), 0,
    );
    for (let i = 0; i < hull.masts.length; i++) {
      this.masts.push(this.buildMast(hull.masts[i], hull, i === mainIndex));
    }

    // A banner at the main truck, which is also the best wind vane aboard.
    this.flagGeo = new THREE.PlaneGeometry(3.2, 1.9, 10, 5);
    this.flagBase = new Float32Array(this.flagGeo.getAttribute('position').array);
    this.flag = new THREE.Mesh(
      this.flagGeo,
      new THREE.MeshLambertMaterial({ color: 0xc8352c, side: THREE.DoubleSide }),
    );
    const tallest = hull.masts.reduce((a, b) => (a.ceHeight > b.ceHeight ? a : b));
    this.flag.position.set(0, tallest.ceHeight * 1.74, tallest.station * L * 0.42);
    this.group.add(this.flag);

    this.group.traverse((o: THREE.Object3D) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
    });
  }

  private buildMast(spec: MastSpec, hull: HullClass, isMain: boolean): MastParts {
    const L = hull.lwl;
    const D = hull.draft;
    const mastHeight = spec.ceHeight * 1.74;
    const z = spec.station * L * 0.42;
    const deckY = sheerAt(0.5) * D * FREEBOARD;

    const pivot = new THREE.Group();
    pivot.position.set(0, 0, z);
    this.group.add(pivot);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.29, mastHeight, 10),
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
        side: THREE.DoubleSide,
        map: makeSailTexture(
          build.aspect,
          isMain ? build.crossAt : null,
          spec.rig === 'lateen' ? 90 - LATEEN_RAKE : 0,
        ),
        transparent: true,
        // Canvas is thin enough that the sun glows through it, so a backlit sail
        // is never just a black shape against the sky.
        emissive: 0x333026,
      }),
    );
    pivot.add(sail);

    // The yard, drawn along the sail's head so the two always agree, and the
    // bundle of furled canvas that appears along it as sail is taken in.
    const yardMat = new THREE.MeshLambertMaterial({ color: SPAR });
    const bundleMat = new THREE.MeshLambertMaterial({ color: 0xd8cfba });
    let yard: THREE.Mesh;
    let bundle: THREE.Mesh;

    if (spec.rig === 'lateen') {
      const s = lateenPoints(spec.area, deckY);
      const dir = new THREE.Vector3().subVectors(s.peak, s.tack);
      const len = dir.length();
      const mid = s.tack.clone().addScaledVector(dir, 0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), dir.clone().normalize(),
      );
      yard = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.07, len * 1.06, 8), yardMat);
      yard.position.copy(mid);
      yard.quaternion.copy(q);

      bundle = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, len * 0.9, 8), bundleMat);
      bundle.position.copy(mid).add(new THREE.Vector3(0, -0.3, 0));
      bundle.quaternion.copy(q);
    } else {
      const s = squarePoints(spec.area, spec.ceHeight * 1.42);
      yard = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, s.width * 1.14, 8), yardMat);
      yard.rotation.z = Math.PI / 2;
      yard.position.set(0, s.top, 0);

      bundle = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.3, s.width * 0.94, 8), bundleMat);
      bundle.rotation.z = Math.PI / 2;
      bundle.position.set(0, s.top - 0.35, 0);
    }
    bundle.visible = false;
    pivot.add(yard);
    pivot.add(bundle);

    // Standing rigging: shrouds to the channels, ratlines across them, a stay
    // forward. Drawn as lines, which is what they look like at any real range.
    const shroudMat = new THREE.LineBasicMaterial({ color: 0x2b2319, transparent: true, opacity: 0.85 });
    const pts: THREE.Vector3[] = [];
    const head = new THREE.Vector3(0, mastHeight * 0.9, 0);
    for (const side of [-1, 1]) {
      const feet: THREE.Vector3[] = [];
      for (let k = 0; k < 3; k++) {
        const foot = new THREE.Vector3(side * hull.beam * 0.46, deckY, (k - 1) * 1.7);
        feet.push(foot);
        pts.push(head.clone(), foot);
      }
      // Ratlines between the forward and after shroud of each side.
      for (let r = 1; r <= 8; r++) {
        const t = r / 9.5;
        pts.push(
          feet[0].clone().lerp(head, t),
          feet[2].clone().lerp(head, t),
        );
      }
    }
    pts.push(new THREE.Vector3(0, mastHeight * 0.88, 0));
    pts.push(new THREE.Vector3(0, deckY + D * 0.3, L * 0.46 - z));
    pivot.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), shroudMat));

    return { spec, pivot, yard, sail, bundle, build };
  }

  /** Set the rig and the steering to match the simulation. */
  update(v: RigView): void {
    for (let i = 0; i < this.masts.length; i++) {
      const m = this.masts[i];
      const s = v.sails[i];
      if (!s) continue;

      // A lateen yard rests fore-and-aft and swings out; a square yard rests
      // athwartships and braces round, so they measure trim from opposite datums.
      const rest = m.spec.rig === 'square' ? 90 : 0;
      const targetAngle = v.trimSign * (s.trim - rest) * DEG;
      m.pivot.rotation.y += (targetAngle - m.pivot.rotation.y) * 0.08;

      const setAmount = s.set * s.condition;
      const gone = s.condition <= 0.05;
      m.yard.visible = !gone;
      m.sail.visible = setAmount > 0.06 && !gone;
      // Canvas taken in is gathered along the yard rather than shrunk away.
      m.bundle.visible = !gone && setAmount < 0.94;
      const bundleScale = clamp(1 - setAmount, 0.12, 1);
      m.bundle.scale.set(bundleScale, 1, bundleScale);

      if (!m.sail.visible) continue;

      const mat = m.sail.material as THREE.MeshLambertMaterial;
      mat.opacity = 1;

      const pressure = clamp(v.pressures[i] ?? 0, -1, 1);
      const luffing = Math.abs(pressure) < 0.08;
      const shake = luffing ? clamp(v.apparentKnots / 26, 0, 1) * 0.5 : 0;

      const b = m.build;
      const pos = b.geometry.getAttribute('position') as THREE.BufferAttribute;
      const depth = pressure * b.scale * 0.26;

      for (let k = 0; k < pos.count; k++) {
        const bx = b.base[k * 3];
        const by = b.base[k * 3 + 1];
        const bz = b.base[k * 3 + 2];

        const belly = depth * b.weight[k];
        const flap = shake * b.scale * 0.07 * b.luff[k]
          * Math.sin(v.t * 10 + k * 0.7 + bx * 0.3 + bz * 0.3);
        const offset = belly + flap;

        if (b.axis === 0) pos.setXYZ(k, bx + offset, by, bz);
        else pos.setXYZ(k, bx, by, bz + offset);
      }
      pos.needsUpdate = true;
      b.geometry.computeVertexNormals();
      // Reefed canvas is a shorter sail, hoisted from the same yard.
      m.sail.scale.y = clamp(setAmount, 0.25, 1);
    }

    // The rudder answers the helm, and the tiller swings the other way.
    const rudderAngle = clamp(v.rudder, -1, 1) * 32 * DEG;
    this.rudder.rotation.y += (rudderAngle - this.rudder.rotation.y) * 0.2;
    this.tiller.rotation.y += (-rudderAngle * 1.1 - this.tiller.rotation.y) * 0.2;

    // The banner streams with the apparent wind.
    this.flag.rotation.y = (v.apparentBeta + 180) * DEG;
    const fpos = this.flagGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < fpos.count; k++) {
      const bx = this.flagBase[k * 3];
      const by = this.flagBase[k * 3 + 1];
      const u = bx / 3.2 + 0.5;
      const flutter = Math.sin(v.t * 9 + u * 7) * u * clamp(v.apparentKnots / 22, 0.05, 1) * 0.4;
      fpos.setXYZ(k, bx, by + flutter * 0.4, flutter);
    }
    fpos.needsUpdate = true;
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
 * Corners of a lateen sail, sized so the triangle's area matches the rig. The
 * tack is down and forward near the deck, the peak high and aft at the masthead,
 * and the clew aft at the level of the rail: the enormous raked yard that let
 * these ships lie closer to the wind than anything else afloat.
 */
function lateenPoints(area: number, deckY: number): { tack: THREE.Vector3; peak: THREE.Vector3; clew: THREE.Vector3 } {
  const dirY = Math.cos(LATEEN_RAKE * DEG);
  const dirZ = -Math.sin(LATEEN_RAKE * DEG);
  const clewY = 0.10;
  const clewZ = -0.75;
  const unitArea = 0.5 * Math.abs(dirY * clewZ - dirZ * clewY);
  const s = Math.sqrt(area / unitArea);

  const tack = new THREE.Vector3(0, deckY + 0.9, s * 0.16);
  return {
    tack,
    peak: new THREE.Vector3(tack.x, tack.y + dirY * s, tack.z + dirZ * s),
    clew: new THREE.Vector3(tack.x, tack.y + clewY * s, tack.z + clewZ * s),
  };
}

function buildLateenSail(area: number, deckY: number): SailBuild {
  const { tack, peak, clew } = lateenPoints(area, deckY);
  const N = 10;

  // The cloth is mapped on the ship's own axes — fore-and-aft across the sail,
  // vertical up it — so the cross of the Order of Christ stands upright as it was
  // painted, rather than leaning over with the rake of the yard. The seams are
  // drawn into the texture at the yard's angle instead, which is where they
  // actually ran.
  const corners = [tack, peak, clew];
  const zMin = Math.min(...corners.map((c) => c.z)), zMax = Math.max(...corners.map((c) => c.z));
  const yMin = Math.min(...corners.map((c) => c.y)), yMax = Math.max(...corners.map((c) => c.y));
  const uSpan = Math.max(zMax - zMin, 0.01);
  const vSpan = Math.max(yMax - yMin, 0.01);

  const toUv = (c: THREE.Vector3): [number, number] =>
    [(zMax - c.z) / uSpan, (c.y - yMin) / vSpan];
  const cornerUv = corners.map(toUv);
  const crossAt: [number, number] = [
    (cornerUv[0][0] + cornerUv[1][0] + cornerUv[2][0]) / 3,
    (cornerUv[0][1] + cornerUv[1][1] + cornerUv[2][1]) / 3,
  ];

  const positions: number[] = [];
  const weight: number[] = [];
  const luff: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const offsets: number[] = [];

  let running = 0;
  for (let i = 0; i <= N; i++) { offsets.push(running); running += N - i + 1; }
  const idx = (i: number, j: number) => offsets[i] + j;

  const p = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N - i; j++) {
      const k = N - i - j;
      const a = i / N, b = j / N, c = k / N;
      p.set(
        peak.x * a + clew.x * b + tack.x * c,
        peak.y * a + clew.y * b + tack.y * c,
        peak.z * a + clew.z * b + tack.z * c,
      );
      positions.push(p.x, p.y, p.z);
      const t = toUv(p);
      uv.push(t[0], t[1]);
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
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return {
    geometry,
    base: new Float32Array(positions),
    weight: new Float32Array(weight),
    luff: new Float32Array(luff),
    axis: 0,
    scale: Math.sqrt(area),
    crossAt,
    aspect: uSpan / vSpan,
  };
}

function squarePoints(area: number, yardY: number): { width: number; height: number; top: number } {
  const width = Math.sqrt(area * 1.75);
  return { width, height: area / width, top: yardY };
}

function buildSquareSail(area: number, yardY: number): SailBuild {
  const { width, height, top } = squarePoints(area, yardY);
  const nx = 12;
  const ny = 9;

  const positions: number[] = [];
  const weight: number[] = [];
  const luff: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const v = j / ny;
      // The foot of a square sail is cut with a slight roach.
      const foot = 1 - Math.sin(Math.PI * u) * 0.07;
      positions.push((u - 0.5) * width, top - v * height * foot, 0);
      uv.push(u, 1 - v);
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
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return {
    geometry,
    base: new Float32Array(positions),
    weight: new Float32Array(weight),
    luff: new Float32Array(luff),
    axis: 2,
    scale: Math.sqrt(area),
    crossAt: [0.5, 0.52],
    aspect: width / height,
  };
}

// ---------------------------------------------------------------------------
// Hull construction
// ---------------------------------------------------------------------------

function beamAt(t: number): number {
  if (t < 0.12) return lerp(0.34, 0.66, t / 0.12);
  if (t < 0.45) return lerp(0.66, 1.0, smoothstep(0.12, 0.45, t));
  if (t < 0.78) return lerp(1.0, 0.62, smoothstep(0.45, 0.78, t));
  return lerp(0.62, 0.07, smoothstep(0.78, 1.0, t));
}

function sheerAt(t: number): number {
  const mid = 0.52;
  const d = Math.abs(t - mid) / mid;
  return lerp(1.05, 1.44, Math.pow(d, 1.9));
}

function keelAt(t: number): number {
  if (t < 0.08) return lerp(0.55, 1.0, t / 0.08);
  if (t > 0.86) return lerp(1.0, 0.35, (t - 0.86) / 0.14);
  return 1;
}

function sectionWidth(v: number, t: number): number {
  const rise = Math.pow(clamp(v, 0, 1), 0.52);
  const tumble = 1 - Math.pow(clamp(v, 0, 1), 2.4) * 0.28;
  const fineness = lerp(1, 0.72, smoothstep(0.7, 1, t));
  return rise * tumble * fineness;
}

/**
 * The hull, lofted station by station and coloured strake by strake: tallowed
 * below the waterline, planked oak above it, and a heavy wale running the length
 * at the turn of the topsides.
 */
function buildHull(L: number, B: number, D: number): THREE.Mesh {
  const stations = 44;
  const rows = 22;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const halfB = B / 2;
  const c = new THREE.Color();

  const addVertex = (t: number, v: number, side: number) => {
    const z = (t - 0.5) * L;
    const bw = beamAt(t) * halfB;
    const keel = -keelAt(t) * D;
    const sheer = sheerAt(t) * D * FREEBOARD;
    const y = lerp(keel, sheer, v);
    // The wale is a heavier strake, standing slightly proud of the planking.
    const waleness = Math.exp(-Math.pow((v - 0.74) / 0.055, 2));
    const w = sectionWidth(v, t) * bw * (1 + waleness * 0.085);
    positions.push(side * w, y, z);

    if (y < 0.02) {
      // Tallow and pitch, fouling darker as it goes deeper.
      c.copy(BOTTOM).lerp(OAK_DARK, clamp(y / (D * 0.4) + 1, 0, 1) * 0.35);
    } else {
      // Alternating strakes, with a little variation along the length so the
      // planking does not read as a machine-cut stripe.
      const strake = Math.sin(v * rows * Math.PI * 0.92) * 0.5 + 0.5;
      c.copy(OAK).lerp(OAK_DARK, strake * 0.5 + Math.sin(t * 37) * 0.07 + 0.06);
    }
    c.lerp(WALE, waleness * 0.9);
    colors.push(c.r, c.g, c.b);
  };

  for (let i = 0; i < stations; i++) {
    const t = i / (stations - 1);
    for (let j = 0; j < rows; j++) addVertex(t, j / (rows - 1), -1);
    for (let j = rows - 1; j >= 0; j--) addVertex(t, j / (rows - 1), 1);
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
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({
    vertexColors: true, side: THREE.DoubleSide,
  }));
}

function buildDeck(L: number, B: number, D: number): THREE.Mesh {
  const stations = 30;
  const across = 7;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const halfB = B / 2;
  const c = new THREE.Color();
  const deckLight = new THREE.Color(0xb59468);
  const deckDark = new THREE.Color(0x8a6c46);

  for (let i = 0; i < stations; i++) {
    const t = i / (stations - 1);
    const z = (t - 0.5) * L;
    const bw = beamAt(t) * halfB * 0.93;
    const y = sheerAt(t) * D * FREEBOARD;
    for (let k = 0; k < across; k++) {
      const u = k / (across - 1);
      positions.push((u - 0.5) * 2 * bw, y, z);
      // Deck planks run fore and aft, so the caulking lines run athwartships.
      c.copy(deckLight).lerp(deckDark, (Math.sin(u * across * Math.PI) * 0.5 + 0.5) * 0.45);
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < stations - 1; i++) {
    for (let k = 0; k < across - 1; k++) {
      const a = i * across + k;
      indices.push(a, a + across, a + 1);
      indices.push(a + 1, a + across, a + across + 1);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({
    vertexColors: true, side: THREE.DoubleSide,
  }));
}

function buildSterncastle(L: number, B: number, D: number): THREE.Group {
  const g = new THREE.Group();
  const w = beamAt(0.14) * B * 0.94;
  const h = D * 0.72;
  const len = L * 0.2;
  const deck = sheerAt(0.14) * D * FREEBOARD;

  const oak = new THREE.MeshLambertMaterial({ color: 0x6b4e30 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x4a3520 });

  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), oak);
  box.position.set(0, deck + h / 2 - 0.2, -L * 0.5 + len * 0.66);
  g.add(box);

  const rail = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, 0.28, len * 1.04), trim);
  rail.position.set(0, box.position.y + h / 2 + 0.32, box.position.z);
  g.add(rail);

  // Transom across the stern, raked aft and cut to the hull's after sections.
  const sternBeam = beamAt(0.03) * B * 1.9;
  const transom = new THREE.Mesh(new THREE.BoxGeometry(sternBeam, h * 1.3, 0.2), trim);
  transom.position.set(0, deck + h * 0.25, -L * 0.485);
  transom.rotation.x = -0.16;
  g.add(transom);

  // Quarter windows, which catch the light and give the stern a face.
  const glass = new THREE.MeshLambertMaterial({ color: 0x2a2a24, emissive: 0x141008 });
  for (const side of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(sternBeam * 0.22, h * 0.26, 0.09), glass);
    win.position.set(side * sternBeam * 0.26, deck + h * 0.42, -L * 0.478);
    win.rotation.x = -0.16;
    g.add(win);
  }
  return g;
}

function buildForecastle(L: number, B: number, D: number): THREE.Group {
  const g = new THREE.Group();
  const w = beamAt(0.9) * B * 0.94;
  const h = D * 0.42;
  const len = L * 0.12;
  const deck = sheerAt(0.9) * D * FREEBOARD;
  const oak = new THREE.MeshLambertMaterial({ color: 0x6b4e30 });

  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), oak);
  box.position.set(0, deck + h / 2 - 0.2, L * 0.5 - len * 0.95);
  g.add(box);

  const sprit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.18, L * 0.32, 8),
    new THREE.MeshLambertMaterial({ color: SPAR }),
  );
  sprit.rotation.x = Math.PI / 2 - 22 * DEG;
  sprit.position.set(0, box.position.y + h * 0.3, L * 0.57);
  g.add(sprit);
  return g;
}

function buildRails(L: number, B: number, D: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x5c4229, side: THREE.DoubleSide });
  const stations = 26;

  for (const side of [-1, 1]) {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < stations; i++) {
      const t = 0.08 + (i / (stations - 1)) * 0.84;
      const z = (t - 0.5) * L;
      const bw = beamAt(t) * (B / 2) * 0.96;
      const y = sheerAt(t) * D * FREEBOARD;
      positions.push(side * bw, y, z);
      positions.push(side * bw * 0.97, y + D * 0.32, z);
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

/** Hatch, capstan, and the ship's boat stowed amidships. */
function buildDeckFittings(L: number, B: number, D: number): THREE.Group {
  const g = new THREE.Group();
  const deck = sheerAt(0.5) * D * FREEBOARD;
  const oak = new THREE.MeshLambertMaterial({ color: 0x6b4e30 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x3a2b1a });

  const hatch = new THREE.Mesh(new THREE.BoxGeometry(B * 0.34, 0.34, L * 0.13), oak);
  hatch.position.set(0, deck + 0.17, -L * 0.1);
  g.add(hatch);
  const grating = new THREE.Mesh(new THREE.BoxGeometry(B * 0.3, 0.08, L * 0.11), dark);
  grating.position.set(0, deck + 0.36, -L * 0.1);
  g.add(grating);

  const capstan = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.38, 0.9, 10), oak,
  );
  capstan.position.set(0, deck + 0.45, -L * 0.26);
  g.add(capstan);

  // The boat, without which no landing party gets ashore through surf.
  const boat = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), oak);
  boat.scale.set(B * 0.16, 0.5, L * 0.11);
  boat.rotation.x = Math.PI;
  boat.position.set(0, deck + 0.55, L * 0.08);
  g.add(boat);

  const bowStation = 0.9;
  const bowHalfBeam = beamAt(bowStation) * B * 0.5;
  const bowDeck = sheerAt(bowStation) * D * FREEBOARD;
  for (const side of [-1, 1]) {
    const anchor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.45), dark);
    anchor.position.set(side * bowHalfBeam * 0.94, bowDeck - 0.35, (bowStation - 0.5) * L);
    anchor.rotation.z = side * 0.22;
    g.add(anchor);
  }
  return g;
}

/** Rudder hung on the sternpost, with the tiller coming inboard over it. */
function buildSteering(L: number, _B: number, D: number): { rudder: THREE.Group; tiller: THREE.Mesh } {
  const oak = new THREE.MeshLambertMaterial({ color: 0x5c4229 });
  const iron = new THREE.MeshLambertMaterial({ color: IRON });

  const rudder = new THREE.Group();
  rudder.position.set(0, 0, -L * 0.455);

  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, D * 1.55, L * 0.075), oak);
  blade.position.set(0, -D * 0.62, -L * 0.03);
  rudder.add(blade);

  const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, D * 1.9, 8), oak);
  stock.position.set(0, -D * 0.42, 0);
  rudder.add(stock);

  for (const y of [-D * 1.1, -D * 0.5, D * 0.05]) {
    const pintle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.13, L * 0.035), iron);
    pintle.position.set(0, y, -L * 0.012);
    rudder.add(pintle);
  }

  const tiller = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, L * 0.2, 8), oak);
  tiller.geometry.translate(0, L * 0.1, 0);
  tiller.rotation.x = Math.PI / 2;
  tiller.position.set(0, sheerAt(0.12) * D * FREEBOARD + 0.35, -L * 0.47);
  return { rudder, tiller };
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

/**
 * Sailcloth: narrow cloths seamed together, a bolt rope round the edge, and for
 * the mainsail the cross of the Order of Christ. The cross is drawn stretched by
 * the inverse of the sail's aspect so that it comes out square once the texture
 * is mapped onto the cut of the sail.
 */
function makeSailTexture(
  aspect: number, crossAt: [number, number] | null, seamAngleDeg: number,
): THREE.Texture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#e6ddc8';
  ctx.fillRect(0, 0, size, size);

  // Cloth seams: narrow widths of canvas sewn edge to edge, running square to
  // the yard.
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(seamAngleDeg * DEG);
  ctx.strokeStyle = 'rgba(150, 138, 112, 0.5)';
  ctx.lineWidth = 2;
  const cloths = 13;
  for (let i = -cloths; i <= cloths; i++) {
    const y = (i / cloths) * size;
    ctx.beginPath();
    ctx.moveTo(-size, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  ctx.restore();

  // A little soiling so the canvas is not flat white.
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 18 + Math.random() * 55;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(150, 138, 110, 0.07)');
    g.addColorStop(1, 'rgba(150, 138, 110, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bolt rope.
  ctx.strokeStyle = 'rgba(120, 104, 76, 0.55)';
  ctx.lineWidth = 7;
  ctx.strokeRect(4, 4, size - 8, size - 8);

  if (crossAt) {
    const cx = crossAt[0] * size;
    const cy = (1 - crossAt[1]) * size;
    // Squash horizontally by the aspect so it maps back to a square cross.
    const arm = size * 0.15;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1 / Math.max(aspect, 0.05), 1);
    ctx.fillStyle = '#a8302a';
    for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      drawCrossArm(ctx, 0, 0, arm, size * 0.056, size * 0.04, rot);
    }
    ctx.fillStyle = '#e6ddc8';
    for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      drawCrossArm(ctx, 0, 0, arm * 0.6, size * 0.022, size * 0.018, rot);
    }
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
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
