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
  /** Where the cross sits in texture space. */
  crossAt: [number, number];
  /**
   * How a metre along each of two world axes in the plane of the sail moves in
   * texture space. The device is drawn through this, so it comes out upright
   * and square on the cloth however the sail is cut and however the yard is
   * raked — laying it out in the texture's own frame instead puts the arms at
   * whatever angle the cut happens to have, which on a lateen is a pinwheel.
   */
  crossAxes: { up: [number, number]; across: [number, number] };
  /** Length of a cross arm, in metres. */
  crossArm: number;
}

/**
 * One rope of the running rigging: an end made fast to something that swings
 * with the yard, and an end made fast to the ship.
 */
interface Rope {
  /** In the mast pivot's frame, so it turns with the trim. */
  local: THREE.Vector3;
  /** In the hull's frame. */
  fixed: THREE.Vector3;
}

/** A ribbon seized in the rigging that lies along the wind. */
interface Telltale {
  mesh: THREE.Mesh;
  geo: THREE.PlaneGeometry;
  base: Float32Array;
  length: number;
  phase: number;
}

interface MastParts {
  spec: MastSpec;
  pivot: THREE.Group;
  yard: THREE.Mesh;
  sail: THREE.Mesh;
  bundle: THREE.Mesh;
  build: SailBuild;
  ropes: Rope[];
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
  private telltales: Telltale[] = [];
  private rudder: THREE.Group;
  private tiller: THREE.Mesh;
  private runningRig!: THREE.LineSegments;
  private runningPos!: THREE.BufferAttribute;

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

    // The running rigging is redrawn every frame, since both its ends move.
    const ropeCount = this.masts.reduce((n, m) => n + m.ropes.length, 0);
    const runningGeo = new THREE.BufferGeometry();
    this.runningPos = new THREE.BufferAttribute(new Float32Array(ropeCount * 6), 3);
    this.runningPos.setUsage(THREE.DynamicDrawUsage);
    runningGeo.setAttribute('position', this.runningPos);
    runningGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), L * 2);
    this.runningRig = new THREE.LineSegments(
      runningGeo,
      new THREE.LineBasicMaterial({ color: ROPE, transparent: true, opacity: 0.85 }),
    );
    this.runningRig.frustumCulled = false;
    this.group.add(this.runningRig);

    // The banner at the main truck. It is the best wind vane aboard and the
    // player's most immediate reading of where the wind is, so it is cut long
    // and narrow — a streaming pennant rather than a square flag — because a
    // long one lies along the wind and points, and a square one only flutters.
    const tallest = hull.masts.reduce((a, b) => (a.ceHeight > b.ceHeight ? a : b));
    this.flagGeo = new THREE.PlaneGeometry(6.4, 1.15, 22, 3);
    // Hung from its own luff, so it streams away from the masthead instead of
    // pivoting about the middle of itself.
    this.flagGeo.translate(3.2, 0, 0);
    this.flagBase = new Float32Array(this.flagGeo.getAttribute('position').array);
    this.flag = new THREE.Mesh(
      this.flagGeo,
      new THREE.MeshLambertMaterial({
        color: 0xc8352c, side: THREE.DoubleSide, emissive: 0x2a0d0a,
      }),
    );
    this.flag.position.set(0, tallest.ceHeight * 1.74 - 0.4, tallest.station * L * 0.42);
    this.group.add(this.flag);

    // Telltales in the weather rigging: light ribbons seized to the shrouds,
    // which is how the watch reads the wind on deck without looking aloft.
    this.telltales = buildTelltales(hull);
    for (const t of this.telltales) this.group.add(t.mesh);

    this.group.traverse((o: THREE.Object3D) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
    });
    // Canvas is a single sheet with no thickness, and it moves and re-normals
    // every frame. Letting it receive shadows only lets it shadow itself, which
    // turns a sail seen from above into a solid brown triangle.
    for (const m of this.masts) {
      m.sail.receiveShadow = false;
      m.bundle.receiveShadow = false;
    }
    this.flag.receiveShadow = false;
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
        map: makeSailTexture(build, isMain),
        transparent: true,
        // Canvas is thin enough that the sun glows through it, so a backlit sail
        // is never just a black shape against the sky. Kept low: any more and it
        // swamps the shading, and a sail with no shading on it has no shape.
        emissive: 0x191710,
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

    this.group.add(buildStandingRigging(spec, hull, mastHeight, z));

    return {
      spec, pivot, yard, sail, bundle, build,
      ropes: buildRunningRigging(spec, hull, mastHeight, z, deckY),
    };
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

    // Redraw the running rigging against wherever the yards have swung to.
    const arr = this.runningPos.array as Float32Array;
    let o = 0;
    for (const m of this.masts) {
      const a = m.pivot.rotation.y;
      const ca = Math.cos(a), sa = Math.sin(a);
      const oz = m.pivot.position.z;
      for (const r of m.ropes) {
        arr[o++] = r.local.x * ca + r.local.z * sa;
        arr[o++] = r.local.y;
        arr[o++] = -r.local.x * sa + r.local.z * ca + oz;
        arr[o++] = r.fixed.x;
        arr[o++] = r.fixed.y;
        arr[o++] = r.fixed.z;
      }
    }
    this.runningPos.needsUpdate = true;

    // The rudder answers the helm, and the tiller swings the other way.
    const rudderAngle = clamp(v.rudder, -1, 1) * 32 * DEG;
    this.rudder.rotation.y += (rudderAngle - this.rudder.rotation.y) * 0.2;
    this.tiller.rotation.y += (-rudderAngle * 1.1 - this.tiller.rotation.y) * 0.2;

    // The banner streams away from the masthead, downwind. `apparentBeta` is the
    // angle of the wind off her bow, so the pennant lies along the reciprocal:
    // it points where the wind is *going*, which is what a flag does.
    const stream = (v.apparentBeta + 180) * DEG;
    this.flag.rotation.y = stream;
    const gust = clamp(v.apparentKnots / 20, 0.06, 1);
    const fpos = this.flagGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < fpos.count; k++) {
      const bx = this.flagBase[k * 3];
      const by = this.flagBase[k * 3 + 1];
      // Nothing at the luff, everything at the fly: a pennant is held at one end
      // and the whip travels down it.
      const u = clamp(bx / 6.4, 0, 1);
      const whip = Math.sin(v.t * (5 + gust * 7) - u * 5.5) * u * u * gust;
      // In a light air it hangs; in a breeze it stands out straight.
      const droop = (1 - gust) * u * u * 1.5;
      fpos.setXYZ(k, bx, by + whip * 0.45 - droop, whip * 1.1);
    }
    fpos.needsUpdate = true;

    // The telltales lie along the wind too, and stream harder as it freshens.
    for (const t of this.telltales) {
      t.mesh.rotation.y = stream;
      const tp = t.geo.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < tp.count; k++) {
        const bx = t.base[k * 3];
        const by = t.base[k * 3 + 1];
        const u = clamp(bx / t.length, 0, 1);
        const whip = Math.sin(v.t * (7 + gust * 9) - u * 6 + t.phase) * u * gust;
        fpos.needsUpdate = true;
        tp.setXYZ(k, bx, by + whip * 0.22 - (1 - gust) * u * u * 0.5, whip * 0.5);
      }
      tp.needsUpdate = true;
    }
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
  const N = 14;

  // The cloth is mapped in the sail's own frame — along the luff, and out across
  // it toward the leech — rather than on the ship's axes. A lateen's cloths were
  // seamed square to its own edges and its device painted square to the cloths,
  // so laying the texture out any other way puts the seams across the weave at
  // an angle that changes with the cut and makes them crawl as the sail bellies.
  const luffVec = new THREE.Vector3().subVectors(peak, tack);
  const luffLen = luffVec.length();
  const luffDir = luffVec.clone().normalize();
  const toClew = new THREE.Vector3().subVectors(clew, tack);
  const outDir = toClew.clone()
    .addScaledVector(luffDir, -toClew.dot(luffDir)).normalize();
  const outSpan = Math.max(toClew.dot(outDir), 0.01);

  const uvOf = (p: THREE.Vector3): [number, number] => {
    const d = new THREE.Vector3().subVectors(p, tack);
    return [clamp(d.dot(outDir) / outSpan, 0, 1), clamp(d.dot(luffDir) / luffLen, 0, 1)];
  };

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
      // A roach on the leech: the free edge from peak to clew is cut with a
      // convex curve and held out by battens, not ruled straight.
      const onLeech = b + a;
      if (onLeech > 0.001) {
        const along = a / onLeech;
        const roach = Math.sin(Math.PI * along) * onLeech * outSpan * 0.075;
        p.addScaledVector(outDir, roach * (1.0 - c * c));
      }
      positions.push(p.x, p.y, p.z);
      const t = uvOf(p);
      uv.push(t[0], t[1]);

      // Draft is fullest a little abaft the luff and well up the sail, not at
      // the centroid: a sail is a wing, and a wing's deepest section is forward.
      const across = clamp(t[0], 0, 1);
      const up = clamp(t[1], 0, 1);
      const chordwise = Math.sin(Math.PI * Math.pow(across, 0.72));
      const spanwise = Math.sin(Math.PI * Math.pow(up, 0.85));
      weight.push(chordwise * spanwise);
      // The luff is the edge from tack to peak, the one laced to the yard, and
      // the first part of the sail to shake when she comes up into the wind.
      luff.push(clamp(1 - across * 2.2, 0, 1));
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
    // Well up the sail and a third out from the luff, where the cloth is broad
    // enough to carry the device and the yard does not cross it.
    crossAt: [0.42, 0.46],
    // The sail stands in the ship's fore-and-aft plane, so its two world axes
    // are straight up and straight aft.
    crossAxes: {
      up: [outDir.y / outSpan, luffDir.y / luffLen],
      across: [-outDir.z / outSpan, -luffDir.z / luffLen],
    },
    crossArm: Math.min(outSpan, luffLen) * 0.26,
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
    // A square sail hangs square already: its texture axes are the world's.
    crossAxes: { up: [0, 1 / height], across: [1 / width, 0] },
    crossArm: Math.min(width, height) * 0.3,
  };
}

// ---------------------------------------------------------------------------
// Hull construction
// ---------------------------------------------------------------------------

function beamAt(t: number): number {
  if (t < 0.12) return lerp(0.34, 0.66, t / 0.12);
  if (t < 0.45) return lerp(0.66, 1.0, smoothstep(0.12, 0.45, t));
  if (t < 0.78) return lerp(1.0, 0.62, smoothstep(0.45, 0.78, t));
  // The bow closes right down to the stem. Leaving any beam on the last station
  // ends her in a squared-off block instead of a cutwater.
  return lerp(0.62, 0.012, Math.pow(smoothstep(0.78, 1.0, t), 0.78));
}

function sheerAt(t: number): number {
  const mid = 0.52;
  const d = Math.abs(t - mid) / mid;
  return lerp(1.05, 1.44, Math.pow(d, 1.9));
}

/**
 * How far forward a station leans as it rises, in metres at the sheer.
 *
 * A hull is not a vertical extrusion. The stem rakes well forward of the forefoot
 * and the sternpost rakes aft of the heel, and it is that overhang at both ends
 * — not the plan shape — that makes a ship look like a ship in profile. Without
 * it she ends in two flat cliffs, however finely the waterlines are drawn.
 */
function rakeAt(t: number, L: number): number {
  const bow = Math.pow(smoothstep(0.55, 1, t), 1.6);
  const stern = Math.pow(1 - smoothstep(0, 0.36, t), 1.5);
  return bow * L * 0.115 - stern * L * 0.062;
}

function keelAt(t: number): number {
  if (t < 0.08) return lerp(0.55, 1.0, t / 0.08);
  if (t > 0.86) return lerp(1.0, 0.35, (t - 0.86) / 0.14);
  return 1;
}

/**
 * Half-beam at the sheer: where the planking actually finishes.
 *
 * The topsides tumble home, so the widest part of a station is well below the
 * rail and the rail itself is a good deal narrower than the maximum beam. The
 * deck, the rails, the castles and the shrouds' chainwales all have to be set
 * out from this and not from the beam, or they stand outboard of the ship's own
 * side and the player sees open water through the gap between them.
 */
function railHalfBeam(t: number, B: number): number {
  return beamAt(t) * (B / 2) * sectionWidth(1, t);
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
    positions.push(side * w, y, z + rakeAt(t, L) * v);

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
  const c = new THREE.Color();
  const deckLight = new THREE.Color(0xb59468);
  const deckDark = new THREE.Color(0x8a6c46);

  for (let i = 0; i < stations; i++) {
    const t = i / (stations - 1);
    const z = (t - 0.5) * L + rakeAt(t, L);
    const bw = railHalfBeam(t, B) * 0.97;
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
  const h = D * 0.72;
  const deck = sheerAt(0.14) * D * FREEBOARD;

  const oak = new THREE.MeshLambertMaterial({ color: 0x6b4e30 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x4a3520 });

  // The quarterdeck: a raised deck following the ship's own plan, with bulwarks
  // up either side and a bulkhead closing it at the break. Built as a box, as it
  // was, it reads as a shed nailed to the stern — a castle aft is part of the
  // hull's shape and has to be lofted from the same stations.
  g.add(buildRaisedDeck(L, B, D, 0.0, 0.26, h, oak, trim));

  // The transom, planked across the stern and raked aft. It is lofted rather
  // than boxed: a slab of BoxGeometry here shows the player one enormous
  // unlit rectangle, because its after face is the only one he ever sees and it
  // points away from the sun all day.
  g.add(buildTransom(L, B, D, h, deck));

  // Quarter windows, which catch the light and give the stern a face.
  const glass = new THREE.MeshLambertMaterial({ color: 0x241f16, emissive: 0x2a2113 });
  const sternBeam = railHalfBeam(0.06, B) * 2;
  for (const side of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(sternBeam * 0.34, h * 0.24, 0.1), glass);
    win.position.set(side * sternBeam * 0.42, deck + h * 0.34, -L * 0.474);
    win.rotation.x = -0.2;
    g.add(win);
  }
  return g;
}

/**
 * A raised deck at one end of the ship — the quarterdeck aft, the forecastle
 * forward — lofted from the hull's own stations so it carries her sheer and her
 * plan shape, with bulwarks up either side and a bulkhead across the break.
 */
function buildRaisedDeck(
  L: number, B: number, D: number,
  fromT: number, toT: number, rise: number,
  oak: THREE.Material, trim: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  const steps = 12;
  const bulwark = D * 0.34;
  const level = (t: number) => sheerAt(t) * D * FREEBOARD + rise;
  const zAt = (t: number) => (t - 0.5) * L + rakeAt(t, L);

  // The deck itself.
  const deckPos: number[] = [];
  const deckIdx: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = lerp(fromT, toT, i / steps);
    const bw = railHalfBeam(t, B) * 0.94;
    deckPos.push(-bw, level(t), zAt(t), bw, level(t), zAt(t));
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 2;
    deckIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const deckGeo = new THREE.BufferGeometry();
  deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(deckPos, 3));
  deckGeo.setIndex(deckIdx);
  deckGeo.computeVertexNormals();
  g.add(new THREE.Mesh(deckGeo, oak));

  // Bulwarks either side, and a capping rail along the top of each.
  for (const side of [-1, 1]) {
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = lerp(fromT, toT, i / steps);
      const bw = railHalfBeam(t, B) * 0.96;
      pos.push(side * bw, level(t) - 0.15, zAt(t));
      pos.push(side * bw * 0.97, level(t) + bulwark, zAt(t));
    }
    for (let i = 0; i < steps; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, trim);
    (mesh.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
    g.add(mesh);
  }

  // The bulkhead across the break, which is the face the rest of the deck sees.
  const breakT = fromT < toT && fromT === 0 ? toT : fromT;
  const bw = railHalfBeam(breakT, B) * 0.94;
  const face = new THREE.Mesh(new THREE.BoxGeometry(bw * 2, rise + 0.3, 0.16), trim);
  face.position.set(0, level(breakT) - rise / 2, zAt(breakT));
  g.add(face);

  // A ladder up to it.
  for (let s = 0; s < 4; s++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.16), oak);
    step.position.set(
      bw * 0.45,
      level(breakT) - rise + (s + 0.6) * (rise / 4),
      zAt(breakT) + (fromT === 0 ? 0.5 : -0.5) * (1 - s * 0.12),
    );
    g.add(step);
  }
  return g;
}

/**
 * A flat raked transom, planked in strakes like the rest of her and closing the
 * stern off above the waterline. It takes its width from the hull's own after
 * sections at each height, so it meets the planking instead of standing proud
 * of it.
 */
function buildTransom(
  L: number, B: number, D: number, castle: number, deck: number,
): THREE.Mesh {
  const rows = 12;
  const cols = 9;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const c = new THREE.Color();
  const top = deck + castle * 0.62;
  const foot = -D * 0.22;

  for (let j = 0; j < rows; j++) {
    const v = j / (rows - 1);
    const y = lerp(foot, top, v);
    // A transom is narrow at the tuck and flares out and aft as it rises, but
    // never wider than the rail it has to meet.
    const halfWidth = railHalfBeam(0.015 + v * 0.075, B) * (0.92 + v * 0.42);
    // Follows the same raked profile the hull's own after stations are lofted
    // to, so it closes the planking off instead of sitting inside it and letting
    // the hull's last station show as a flat wall astern of it.
    const z = -L * 0.5 + rakeAt(0.02, L) * v - 0.05;
    for (let i = 0; i < cols; i++) {
      const u = i / (cols - 1);
      // The corners are eased, so the transom reads as a panel rather than a box.
      const round = 1 - Math.pow(Math.abs(u - 0.5) * 2, 3.4) * 0.25;
      positions.push((u - 0.5) * 2 * halfWidth * round, y, z);
      const strake = Math.sin(v * rows * Math.PI * 0.86) * 0.5 + 0.5;
      c.copy(OAK).lerp(OAK_DARK, strake * 0.42 + 0.18);
      if (v < 0.12) c.lerp(WALE, 0.5);
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i;
      indices.push(a, a + 1, a + cols);
      indices.push(a + 1, a + cols + 1, a + cols);
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

function buildForecastle(L: number, B: number, D: number): THREE.Group {
  const g = new THREE.Group();
  const h = D * 0.42;
  const deck = sheerAt(0.88) * D * FREEBOARD;
  const oak = new THREE.MeshLambertMaterial({ color: 0x6b4e30 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x4a3520 });

  g.add(buildRaisedDeck(L, B, D, 0.84, 0.995, h, oak, trim));

  // The bowsprit, stepped through the forecastle and steeved up over the stem.
  const sprit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.18, L * 0.32, 8),
    new THREE.MeshLambertMaterial({ color: SPAR }),
  );
  sprit.rotation.x = Math.PI / 2 - 22 * DEG;
  sprit.position.set(0, deck + h * 0.7, L * 0.57);
  g.add(sprit);

  // The stem: the timber the planking is rabbeted into, following the same raked
  // profile the last station of the hull is lofted to, so the two meet instead
  // of the planking stopping in mid air and the stem standing clear of it.
  const stemMat = new THREE.MeshLambertMaterial({ color: 0x574024 });
  const stemPos: number[] = [];
  const stemIdx: number[] = [];
  const rows = 12;
  for (let i = 0; i < rows; i++) {
    const v = i / (rows - 1);
    const y = lerp(-keelAt(1) * D, sheerAt(1) * D * FREEBOARD + h * 0.55, v);
    // Below the waterline the stem curves back into the forefoot.
    const forefoot = v < 0.28 ? Math.pow(v / 0.28, 1.7) : 1;
    const z = L * 0.5 + rakeAt(1, L) * v * forefoot;
    // A blade standing a little proud of the planking, with a rounded cutwater.
    stemPos.push(-0.15, y, z - 0.3, 0.15, y, z - 0.3, 0, y, z + 0.16, 0, y, z + 0.16);
  }
  for (let i = 0; i < rows - 1; i++) {
    const a = i * 4;
    stemIdx.push(a, a + 4, a + 2, a + 4, a + 6, a + 2);
    stemIdx.push(a + 1, a + 3, a + 5, a + 3, a + 7, a + 5);
  }
  const stemGeo = new THREE.BufferGeometry();
  stemGeo.setAttribute('position', new THREE.Float32BufferAttribute(stemPos, 3));
  stemGeo.setIndex(stemIdx);
  stemGeo.computeVertexNormals();
  g.add(new THREE.Mesh(stemGeo, stemMat));

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
      const z = (t - 0.5) * L + rakeAt(t, L);
      const bw = railHalfBeam(t, B);
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

  const bowStation = 0.8;
  const bowHalfBeam = railHalfBeam(bowStation, B);
  const bowDeck = sheerAt(bowStation) * D * FREEBOARD;
  const bowZ = (bowStation - 0.5) * L + rakeAt(bowStation, L);
  const iron = new THREE.MeshLambertMaterial({ color: IRON });

  // Anchors catted at the bow: a stock athwartships, a shank down, and the two
  // flukes, hung outboard where they can be let go without fouling anything.
  for (const side of [-1, 1]) {
    const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.5, 6), iron);
    shank.position.set(side * bowHalfBeam * 1.02, bowDeck - 0.5, bowZ);
    shank.rotation.z = side * 0.2;
    g.add(shank);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 1.15), oak);
    stock.position.set(side * bowHalfBeam * 1.06, bowDeck + 0.15, bowZ);
    g.add(stock);
    for (const f of [-1, 1]) {
      const fluke = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.24), iron);
      fluke.position.set(side * bowHalfBeam * 0.98, bowDeck - 1.16, bowZ + f * 0.28);
      fluke.rotation.x = f * 0.5;
      g.add(fluke);
    }
  }

  // A second hatch, and the bitts the anchor cable is made fast to.
  const fore = new THREE.Mesh(new THREE.BoxGeometry(B * 0.26, 0.3, L * 0.09), oak);
  fore.position.set(0, deck + 0.15, L * 0.2);
  g.add(fore);
  g.add(new THREE.Mesh(new THREE.BoxGeometry(B * 0.22, 0.07, L * 0.075), dark)
    .translateY(deck + 0.32).translateZ(L * 0.2));

  const bitts = new THREE.Mesh(new THREE.BoxGeometry(B * 0.4, 0.16, 0.2), oak);
  bitts.position.set(0, deck + 0.72, L * 0.31);
  g.add(bitts);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.85, 0.2), oak);
    post.position.set(side * B * 0.17, deck + 0.42, L * 0.31);
    g.add(post);
  }

  // Water casks struck down on deck, the largest single stores a ship carried
  // and the thing that decides how far she can go.
  for (let i = 0; i < 4; i++) {
    const cask = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.78, 10), oak);
    cask.rotation.x = Math.PI / 2;
    cask.position.set(
      (i % 2 === 0 ? -1 : 1) * B * 0.19,
      deck + 0.34,
      -L * 0.02 - Math.floor(i / 2) * 0.78,
    );
    g.add(cask);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 5, 12), dark);
    hoop.position.copy(cask.position);
    g.add(hoop);
  }

  // Belaying pins along the rails, where every rope aboard is made fast.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const t = 0.24 + i * 0.075;
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.34, 5), oak);
      pin.position.set(
        side * railHalfBeam(t, B) * 0.9,
        sheerAt(t) * D * FREEBOARD + D * 0.2,
        (t - 0.5) * L + rakeAt(t, L),
      );
      g.add(pin);
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Rigging
// ---------------------------------------------------------------------------

const ROPE = 0x241d14;

/** Deck height at a station, in the hull's own frame. */
function deckAtZ(z: number, L: number, D: number): number {
  return sheerAt(clamp(z / L + 0.5, 0, 1)) * D * FREEBOARD;
}

/** Half-beam at the rail at a station. */
function railAtZ(z: number, L: number, B: number): number {
  return railHalfBeam(clamp(z / L + 0.5, 0, 1), B);
}

/**
 * Standing rigging: the ropes that hold the mast up.
 *
 * This belongs to the hull and never to the yard. Shrouds are set up to
 * chainwales bolted through the ship's side and stay exactly where they are
 * while the yard swings across them — parenting them to the sail's pivot, as
 * they once were here, sends the whole gang sweeping out over the water every
 * time the sheet is eased.
 */
function buildStandingRigging(
  spec: MastSpec, hull: HullClass, mastHeight: number, mastZ: number,
): THREE.Group {
  const L = hull.lwl;
  const B = hull.beam;
  const D = hull.draft;
  const g = new THREE.Group();

  const rope = new THREE.LineBasicMaterial({ color: ROPE, transparent: true, opacity: 0.9 });
  const timber = new THREE.MeshLambertMaterial({ color: 0x4a3520 });
  const pts: THREE.Vector3[] = [];

  // A heavier rig carries more shrouds. They stand nearly all of them abaft the
  // mast, where they take the forward drive of the sail.
  const count = spec.area > 90 ? 4 : 3;
  const offsets = [1.0, -1.3, -3.2, -5.1].slice(0, count);

  for (const side of [-1, 1]) {
    const gang: THREE.Vector3[] = [];
    for (let k = 0; k < count; k++) {
      const z = mastZ + offsets[k];
      // The chainwale stands proud of the planking so the shrouds clear the rail.
      const x = side * (railAtZ(z, L, B) + 0.34);
      const y = deckAtZ(z, L, D) + 0.12;
      const foot = new THREE.Vector3(x, y, z);
      gang.push(foot);

      // Shrouds are seized in pairs over the masthead, each pair sitting a little
      // lower than the one before, which is what gives a mast its stepped collar.
      const head = new THREE.Vector3(
        side * 0.16, mastHeight * (0.95 - k * 0.028), mastZ,
      );
      pts.push(head, foot);

      const deadeye = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 8), timber);
      deadeye.position.copy(foot).setY(foot.y + 0.22);
      deadeye.rotation.x = Math.PI / 2;
      g.add(deadeye);
    }

    // The chainwale itself: a plank on edge, spanning the whole gang.
    const first = gang[0], last = gang[gang.length - 1];
    const chain = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.16, Math.abs(first.z - last.z) + 0.7), timber,
    );
    chain.position.set((first.x + last.x) / 2, (first.y + last.y) / 2, (first.z + last.z) / 2);
    g.add(chain);

    // Ratlines: the rungs a topman climbs, seized across the gang. They taper
    // with it, because they are tied to the shrouds and the shrouds converge.
    const heads = gang.map((_, k) =>
      new THREE.Vector3(side * 0.16, mastHeight * (0.95 - k * 0.028), mastZ));
    for (let r = 0; r <= 11; r++) {
      const t = 0.05 + (r / 11) * 0.66;
      for (let k = 0; k < count - 1; k++) {
        pts.push(
          gang[k].clone().lerp(heads[k], t),
          gang[k + 1].clone().lerp(heads[k + 1], t),
        );
      }
    }
  }

  // The stay, taking the mast's pull forward: to the next mast's step if there
  // is one ahead of her, otherwise all the way to the stemhead.
  const head = new THREE.Vector3(0, mastHeight * 0.97, mastZ);
  let ahead = Infinity;
  for (const m of hull.masts) {
    const mz = m.station * L * 0.42;
    if (mz > mastZ + 1 && mz < ahead) ahead = mz;
  }
  const stayZ = Number.isFinite(ahead) ? ahead : L * 0.49;
  const stayY = Number.isFinite(ahead)
    ? deckAtZ(stayZ, L, D) + 0.4
    : deckAtZ(stayZ, L, D) + D * 0.5;
  pts.push(head.clone(), new THREE.Vector3(0, stayY, stayZ));

  // Backstays, one each side to the after rail, which is what lets her carry
  // sail on a run without pitching the mast out of her.
  for (const side of [-1, 1]) {
    const z = -L * 0.4;
    pts.push(
      head.clone(),
      new THREE.Vector3(side * railAtZ(z, L, B) * 0.9, deckAtZ(z, L, D) + 0.1, z),
    );
  }

  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), rope));
  return g;
}

/**
 * Running rigging: the ropes the watch actually handles.
 *
 * Each has one end on the yard or the sail, which swings with the trim, and one
 * end belayed to the ship. Drawing them is what makes a change of trim read as
 * work being done aloft rather than as a sail rotating on a spindle.
 */
function buildRunningRigging(
  spec: MastSpec, hull: HullClass, mastHeight: number, mastZ: number, deckY: number,
): Rope[] {
  const L = hull.lwl;
  const B = hull.beam;
  const D = hull.draft;
  const ropes: Rope[] = [];
  const railZ = (z: number, side: number) =>
    new THREE.Vector3(side * railAtZ(z, L, B) * 0.94, deckAtZ(z, L, D) + 0.2, z);

  if (spec.rig === 'lateen') {
    const s = lateenPoints(spec.area, deckY);

    // The halyard, which hoists the yard: masthead down to the slings, a third
    // of the way along the yard from the peak.
    ropes.push({
      local: s.peak.clone().lerp(s.tack, 0.32),
      fixed: new THREE.Vector3(0, mastHeight * 0.93, mastZ),
    });

    // The sheet, hauled aft from the clew, and a lazy sheet on the other quarter
    // standing ready for the next tack.
    for (const side of [-1, 1]) {
      ropes.push({ local: s.clew.clone(), fixed: railZ(mastZ - L * 0.24, side) });
    }

    // The tack, which holds the foot of the sail down and forward.
    ropes.push({
      local: s.tack.clone(),
      fixed: new THREE.Vector3(0, deckY + 0.3, mastZ + L * 0.16),
    });
  } else {
    const s = squarePoints(spec.area, spec.ceHeight * 1.42);

    // Braces from each yardarm aft, which is how a square yard is trimmed at all.
    for (const side of [-1, 1]) {
      ropes.push({
        local: new THREE.Vector3(side * s.width * 0.55, s.top, 0),
        fixed: railZ(mastZ - L * 0.26, side),
      });
      // Sheets, hauling the two clews down and aft to the rail.
      ropes.push({
        local: new THREE.Vector3(side * s.width * 0.47, s.top - s.height, 0),
        fixed: railZ(mastZ - L * 0.1, side),
      });
    }
  }
  return ropes;
}

/**
 * Telltales: short light ribbons seized in the weather rigging and at the ends
 * of the yards.
 *
 * They exist for one reason, which is that the player has to be able to see the
 * wind. A masthead pennant is twenty metres up and easy to miss; a ribbon at eye
 * level beside the rail is not, and a real ship carried both for exactly that
 * reason.
 */
function buildTelltales(hull: HullClass): Telltale[] {
  const L = hull.lwl;
  const B = hull.beam;
  const D = hull.draft;
  const out: Telltale[] = [];
  // Bright, and lit from within: a telltale is only worth carrying if it can be
  // read at a glance from anywhere on deck, and a dull ribbon against dull
  // rigging is worth nothing at all.
  const mat = new THREE.MeshLambertMaterial({
    color: 0xf2e4b8, side: THREE.DoubleSide, emissive: 0x6a5c38,
  });

  const spots: { x: number; y: number; z: number; len: number }[] = [];
  for (const m of hull.masts) {
    const z = m.station * L * 0.42;
    // One in the rigging either side, at head height above the rail.
    for (const side of [-1, 1]) {
      spots.push({
        x: side * railHalfBeam(clamp(z / L + 0.5, 0, 1), B) * 0.98,
        y: sheerAt(clamp(z / L + 0.5, 0, 1)) * D * FREEBOARD + D * 1.1,
        z,
        len: 2.4,
      });
    }
    // And two up the mast, where they can be seen from anywhere on deck and
    // from any camera the player is likely to be using.
    spots.push({ x: 0.24, y: m.ceHeight * 0.95, z, len: 3.0 });
    spots.push({ x: -0.24, y: m.ceHeight * 1.45, z, len: 3.0 });
  }

  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    const geo = new THREE.PlaneGeometry(s.len, 0.28, 8, 1);
    geo.translate(s.len / 2, 0, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(s.x, s.y, s.z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    out.push({
      mesh, geo,
      base: new Float32Array(geo.getAttribute('position').array),
      length: s.len,
      phase: i * 1.7,
    });
  }
  return out;
}

/** Rudder hung on the sternpost, with the tiller coming inboard over it. */
function buildSteering(L: number, _B: number, D: number): { rudder: THREE.Group; tiller: THREE.Mesh } {
  const oak = new THREE.MeshLambertMaterial({ color: 0x5c4229 });
  const iron = new THREE.MeshLambertMaterial({ color: IRON });

  const rudder = new THREE.Group();
  // Hung on the sternpost, which rakes aft with the rest of her after body.
  rudder.position.set(0, 0, (0 - 0.5) * L + rakeAt(0, L) * 0.5 + L * 0.045);

  // The blade is cut to the run of the sternpost: deep at its heel, tapering up
  // to the head, and never reaching below the keel, where it would be knocked
  // off the first time she took the ground.
  const rows = 8;
  const pos: number[] = [];
  const idx: number[] = [];
  const heel = -keelAt(0.02) * D * 0.96;
  const head = sheerAt(0.02) * D * FREEBOARD * 0.55;
  for (let i = 0; i < rows; i++) {
    const v = i / (rows - 1);
    const y = lerp(heel, head, v);
    // The trailing edge rakes aft as it rises, following the sternpost.
    const back = -L * (0.055 + v * 0.03) * (v < 0.15 ? v / 0.15 : 1);
    const half = 0.09 + v * 0.03;
    pos.push(-half, y, 0, half, y, 0, -half, y, back, half, y, back);
  }
  for (let i = 0; i < rows - 1; i++) {
    const a = i * 4;
    for (const [p, q, r, s] of [[0, 2, 4, 6], [1, 5, 3, 7], [0, 4, 1, 5], [2, 3, 6, 7]]) {
      idx.push(a + p, a + q, a + r, a + q, a + s, a + r);
    }
  }
  const bladeGeo = new THREE.BufferGeometry();
  bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bladeGeo.setIndex(idx);
  bladeGeo.computeVertexNormals();
  const blade = new THREE.Mesh(bladeGeo, oak);
  blade.material.side = THREE.DoubleSide;
  rudder.add(blade);

  const stock = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.13, head - heel + 0.5, 8), oak,
  );
  stock.position.set(0, (heel + head) / 2 + 0.2, 0);
  rudder.add(stock);

  // Pintles and gudgeons: the iron hinges she swings on.
  for (const v of [0.12, 0.45, 0.82]) {
    const pintle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, L * 0.03), iron);
    pintle.position.set(0, lerp(heel, head, v), -L * 0.011);
    rudder.add(pintle);
  }

  const tiller = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, L * 0.2, 8), oak);
  tiller.geometry.translate(0, L * 0.1, 0);
  tiller.rotation.x = Math.PI / 2;
  tiller.position.set(0, sheerAt(0.12) * D * FREEBOARD + 0.35, -L * 0.5 + rakeAt(0.02, L) + L * 0.05);
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
function makeSailTexture(build: SailBuild, withCross: boolean): THREE.Texture {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#ded3ba';
  ctx.fillRect(0, 0, size, size);

  // The weave: a fine cross-hatch, which is what keeps canvas from reading as
  // paper at close range.
  ctx.strokeStyle = 'rgba(168, 155, 128, 0.28)';
  ctx.lineWidth = 1;
  for (let i = 0; i < size; i += 4) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
  }

  // Cloth seams. The texture is laid out in the sail's own frame — across the
  // sail one way, up the luff the other — so these run straight up it whatever
  // the cut, and stay straight when the canvas bellies.
  const cloths = 11;
  for (let i = 1; i < cloths; i++) {
    const x = (i / cloths) * size;
    ctx.strokeStyle = 'rgba(146, 132, 104, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
    // The doubled edge of the overlapping cloth catches the light beside it.
    ctx.strokeStyle = 'rgba(246, 240, 226, 0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 3, 0); ctx.lineTo(x + 3, size); ctx.stroke();
  }

  // Reef bands: the reinforced strips a sail is shortened along.
  ctx.fillStyle = 'rgba(150, 137, 108, 0.3)';
  for (const v of [0.3, 0.52]) ctx.fillRect(0, v * size, size, size * 0.018);

  // Sun, salt and weather. Canvas at sea is never one flat colour.
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 30 + Math.random() * 130;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() < 0.62;
    g.addColorStop(0, dark ? 'rgba(142, 128, 100, 0.08)' : 'rgba(255, 252, 244, 0.09)');
    g.addColorStop(1, 'rgba(150, 138, 110, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bolt rope round the edge.
  ctx.strokeStyle = 'rgba(112, 96, 70, 0.6)';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, size - 12, size - 12);

  if (withCross) {
    const cx = build.crossAt[0] * size;
    const cy = (1 - build.crossAt[1]) * size;
    const a = build.crossArm;
    ctx.fillStyle = '#a3302b';
    drawCross(ctx, cx, cy, size, build.crossAxes, a, a * 0.30, a * 0.17);
    ctx.fillStyle = '#ded3ba';
    drawCross(ctx, cx, cy, size, build.crossAxes, a * 0.56, a * 0.115, a * 0.065);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * The cross of the Order of Christ: four arms flaring out from a solid centre.
 *
 * Every dimension is given in metres on the actual sail and carried into texture
 * space through the sail's own axes, so the device comes out square and upright
 * on the cloth whatever the cut of the sail and whatever the rake of its yard.
 */
function drawCross(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number,
  axes: { up: [number, number]; across: [number, number] },
  len: number, thick: number, flare: number,
): void {
  // A metre up the sail, and a metre across it, as canvas pixels.
  const ux = axes.up[0] * size, uy = -axes.up[1] * size;
  const ax = axes.across[0] * size, ay = -axes.across[1] * size;
  const t = thick / 2;
  const w = t + flare;
  // One arm reaching along the first axis, as (along, sideways) in metres.
  const arm: [number, number][] = [[0, -t], [len, -w], [len, w], [0, t]];

  ctx.beginPath();
  // The four arms: up, across, down, back across.
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as [number, number][]) {
    arm.forEach(([along, side], i) => {
      // Rotate in metres, then map into texture space, never the other way
      // round: a rotation applied after a non-square mapping shears each arm by
      // a different amount and the cross comes out a pinwheel.
      const mUp = along * dx - side * dy;
      const mAcross = along * dy + side * dx;
      const px = cx + mUp * ux + mAcross * ax;
      const py = cy + mUp * uy + mAcross * ay;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
  }
  ctx.fill();
}
