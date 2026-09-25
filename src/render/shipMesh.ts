import * as THREE from 'three';
import { DEG, clamp, lerp, smoothstep } from '../core/math';
import type { HullClass, MastSpec } from '../ship/hull';
import type { SailState } from '../ship/physics';

import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  bandTexture, glowTexture, isShared, lookFor, plankTexture, seeded, type ShipLook,
} from './shipLook';

const OAK_DARK = new THREE.Color(0x6d5030);
const WALE = new THREE.Color(0x4a3520);
const BOTTOM = new THREE.Color(0x5b5046);
const SPAR = 0x9a7a4e;
const IRON = 0x2f2a24;

/**
 * How steeply the sheer of the ship being built rises to her ends. Set by the
 * constructor before anything is lofted, and read by every builder through
 * `sheerAt`, so the castles, rails and rigging all sit on the same line.
 */
let SHEER = 1;

/** Planked timber: the shared plank texture, multiplied by the colour given. */
function timber(color: number | THREE.Color, vertexColors = false): THREE.MeshStandardMaterial {
  const tex = plankTexture();
  return new THREE.MeshStandardMaterial({
    color, vertexColors, map: tex, bumpMap: tex, bumpScale: 1.2,
    roughness: 0.84, metalness: 0, side: THREE.DoubleSide,
  });
}

/** Planking UVs in metres: strakes run along u, 12 of them to 3.2 m of v. */
const PLANK_U = 1 / 5;
const PLANK_V = 1 / 3.2;

/** The materials one ship is built from, shared across her parts. */
interface Kit {
  look: ShipLook;
  hullTone: THREE.Color;
  castle: THREE.MeshStandardMaterial;
  castleDeck: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  glass: THREE.MeshLambertMaterial;
}

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
  /**
   * The apparent wind off the bow as the pennant and the telltales stream by
   * it: smoothed, so they do not flick through tens of degrees a frame.
   */
  apparentBeta: number;
  /**
   * The same angle unsmoothed, which is what the canvas bellies by.
   *
   * These have to be two numbers. The yards brace to the side the *raw* angle
   * says, so a sail whose belly followed the smoothed one kept the old side for
   * the better part of a second after the wind had crossed — the sails came
   * across in a gybe and the cloth stayed bagged the way it had been, which is
   * precisely the thing anyone watching a gybe would notice.
   */
  trueBeta: number;
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
 * Where the wind is *going*, in the ship's own frame, given its angle off her
 * bow.
 *
 * This existed twice, written the same wrong way both times, and it is the
 * reason the sails bagged into the wind and the pennant lay across the ship.
 * The ship is built with her bow down +Z and her port side down +X; `beta` is
 * the bearing of the wind's source off the bow, positive to starboard. So the
 * wind blows *from* `forward·cos β + starboard·sin β`, which with starboard at
 * −X is (−sin β, +cos β), and it blows *towards* the reciprocal of that:
 *
 *     downwind = (sin β, −cos β)
 *
 * Running dead before it, β = 180, and that is (0, +1): straight over the bow,
 * which is where a pennant lies and which way the canvas bags. The old
 * expression gave (−1, 0) there — square athwartships — because it was written
 * as a compass bearing rotated into a frame it does not belong to, and the two
 * conventions are ninety degrees and a reflection apart.
 */
function downwindInShip(beta: number): { x: number; z: number } {
  const b = beta * DEG;
  return { x: Math.sin(b), z: -Math.cos(b) };
}

/**
 * The rotation about Y that lays a thing built along +X — the pennant, a
 * telltale — down the wind. Derived from the same vector, so the flags and the
 * canvas can never again disagree about which way the wind is blowing.
 */
function streamRotation(beta: number): number {
  const d = downwindInShip(beta);
  // A rotation of θ about Y carries +X to (cos θ, −sin θ) in (x, z). Setting
  // that equal to the downwind vector gives cos θ = d.x and sin θ = −d.z.
  return Math.atan2(-d.z, d.x);
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
  private look: ShipLook;
  private kit: Kit;
  private lamps: THREE.Sprite[] = [];
  private lampGlass = new THREE.MeshLambertMaterial({ color: 0x3a2a14 });
  private lampLight: THREE.PointLight | null = null;
  private lit = { night: -1, overcast: -1 };

  /**
   * `lamp` gives her a real light at the stern lantern, which only the
   * player's own ship carries: every light in the scene is paid for by every
   * lit surface in it.
   */
  constructor(hull: HullClass, opts: { lamp?: boolean } = {}) {
    const L = hull.lwl;
    const B = hull.beam;
    const D = hull.draft;
    const look = lookFor(hull);
    this.look = look;
    SHEER = look.sheer;

    const castleTone = look.castlePaint !== null
      ? new THREE.Color(look.castlePaint)
      : new THREE.Color(look.oak).multiplyScalar(0.72);
    const kit: Kit = {
      look,
      hullTone: new THREE.Color(look.oak),
      castle: timber(castleTone),
      castleDeck: timber(new THREE.Color(0xb59468)),
      trim: timber(new THREE.Color(0x4a3520)),
      glass: new THREE.MeshLambertMaterial({ color: 0x1c1710 }),
    };
    this.kit = kit;

    this.group.add(buildHull(L, B, D, kit));
    if (look.band) this.group.add(buildBand(L, B, D, look));
    this.group.add(buildDeck(L, B, D));
    const aft = buildSterncastle(L, B, D, kit);
    this.group.add(aft.group);
    const foreH = D * 0.42 * look.fore;
    if (look.fore > 0) this.group.add(buildForecastle(L, B, D, foreH, kit));
    this.group.add(buildStem(L, D, foreH));
    if (look.bowsprit) this.group.add(buildBowsprit(L, D, foreH));
    if (look.beak) this.group.add(buildBeak(L, B, D, kit));
    this.group.add(buildRails(L, B, D));
    this.group.add(buildDeckFittings(L, B, D));
    if (look.shields) this.group.add(buildShields(L, B, D, aft.height, foreH, look));
    this.group.add(buildCrew(hull, look, aft.height, foreH));

    // The stern lanterns, on the taffrail, and the glow they throw at night.
    const n = look.lanterns;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : (i / (n - 1) - 0.5) * aft.halfWidth * 1.3;
      const lantern = buildLantern(this.lampGlass);
      const lift = n === 3 && i === 1 ? 0.5 : 0;
      lantern.position.set(x, aft.top + lift, aft.z - 0.25);
      this.group.add(lantern);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: 0xffc070, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0,
      }));
      halo.position.set(x, aft.top + lift + 0.75, aft.z - 0.25);
      halo.scale.setScalar(2.6);
      halo.visible = false;
      this.lamps.push(halo);
      this.group.add(halo);
    }
    if (opts.lamp) {
      this.lampLight = new THREE.PointLight(0xffa860, 0, 34, 1.7);
      this.lampLight.position.set(0, aft.top + 1.4, aft.z + 1.2);
      this.group.add(this.lampLight);
    }

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

    // The device goes on the main course; a great ship carries it on every
    // course she sets, and never on a topsail.
    const topsail = spec.name.startsWith('Gávea');
    const device = this.look.device === 'plain' || topsail ? null
      : isMain || (this.look.crossAll && spec.rig === 'square') ? this.look.device : null;

    // A round top at the head of each lower square mast, where the lookout
    // stands and the topsail sheets lead.
    if (this.look.tops && spec.rig === 'square' && !topsail) {
      const r = clamp(0.7 + Math.sqrt(spec.area) * 0.04, 0.9, 1.6);
      const y = mastHeight * 0.86 + D * 0.15;
      const topMat = timber(new THREE.Color(0x7a5a38));
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.82, 0.85, 14, 1, true), topMat);
      rim.position.y = y + 0.42;
      pivot.add(rim);
      const floor = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r * 0.5, 0.18, 14), topMat);
      floor.position.y = y;
      pivot.add(floor);
    }

    const sail = new THREE.Mesh(
      build.geometry,
      new THREE.MeshLambertMaterial({
        side: THREE.DoubleSide,
        map: makeSailTexture(build, device, this.look, this.masts.length),
        transparent: true,
        // Canvas is thin enough that the sun glows through it, so a backlit sail
        // is never just a black shape against the sky — and that glow is the
        // single most recognisable thing about a square-rigged ship seen from
        // astern. It was set so low it did nothing. Still short of swamping the
        // shading, because a sail with no shading on it has no shape.
        emissive: 0x3a352a,
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

      // Which way the cloth bellies, worked out from where the wind is and
      // where the yard has actually swung to.
      //
      // It used to come from the sign of the angle of attack, decided in the
      // physics, while the yard's angle came from `trimSign`, decided
      // separately — two independent sign conventions that have to agree for
      // the picture to be right, and on one tack they did not. The sail bellied
      // *into* the wind, which is the one thing canvas never does.
      //
      // There is no convention to get wrong here. The wind blows towards a
      // direction; the sail's belly axis points somewhere in the ship; the
      // cloth goes the way the wind is going. The rotation below is the same
      // one Three.js applies to the pivot, and the same one the running rigging
      // is drawn through, so the three can never drift apart.
      const blow = downwindInShip(v.trueBeta);
      const windX = blow.x;
      const windZ = blow.z;
      const a = m.pivot.rotation.y;
      // The belly axis of this sail, in the ship's frame.
      const axX = b.axis === 0 ? Math.cos(a) : Math.sin(a);
      const axZ = b.axis === 0 ? -Math.sin(a) : Math.cos(a);
      const downwind = windX * axX + windZ * axZ;

      // And how hard. A sail with wind in it is never a flat sheet: the cloth
      // stands in a curve from the moment there is any air at all, and drawing
      // it flat whenever the load happened to pass through zero was most of
      // what read as "the sails go wrong". The floor rises with the breeze, so
      // she is only ever slack in a calm.
      const fill = Math.max(
        Math.abs(pressure),
        clamp(v.apparentKnots / 14, 0, 1) * 0.42,
      );
      const depth = Math.sign(downwind || 1) * fill * b.scale * 0.26;

      for (let k = 0; k < pos.count; k++) {
        const bx = b.base[k * 3];
        const by = b.base[k * 3 + 1];
        const bz = b.base[k * 3 + 2];

        const belly = depth * b.weight[k];
        const flap = shake * b.scale * 0.07 * b.luff[k]
          * Math.sin(v.t * 6.5 + k * 0.7 + bx * 0.3 + bz * 0.3);
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
    const stream = streamRotation(v.apparentBeta);
    this.flag.rotation.y = stream;
    const gust = clamp(v.apparentKnots / 20, 0.06, 1);
    const fpos = this.flagGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < fpos.count; k++) {
      const bx = this.flagBase[k * 3];
      const by = this.flagBase[k * 3 + 1];
      // Nothing at the luff, everything at the fly: a pennant is held at one end
      // and the whip travels down it.
      const u = clamp(bx / 6.4, 0, 1);
      // About a cycle a second in a light air and two and a half in a fresh
      // breeze, which is what a pennant does. `v.t` runs on real seconds, so
      // the clock rate never touches it.
      const whip = Math.sin(v.t * (3.6 + gust * 4.2) - u * 5.5) * u * u * gust;
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
        const whip = Math.sin(v.t * (4.8 + gust * 5.4) - u * 6 + t.phase) * u * gust;
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

  /**
   * Match her to the light. Canvas under a storm sky is grey, not the white it
   * is at noon, and the lamp in her stern is lit at dusk.
   */
  setLight(night: number, overcast: number): void {
    if (Math.abs(night - this.lit.night) < 0.01 && Math.abs(overcast - this.lit.overcast) < 0.01) return;
    this.lit = { night, overcast };
    const dim = (1 - overcast * 0.72) * (1 - night * 0.82);
    for (const m of this.masts) {
      const mat = m.sail.material as THREE.MeshLambertMaterial;
      mat.emissive.setHex(0x3a352a).multiplyScalar(dim);
      mat.color.setScalar(1 - overcast * 0.34);
    }
    (this.flag.material as THREE.MeshLambertMaterial).emissive.setHex(0x2a0d0a).multiplyScalar(1 - night * 0.7);
    const glow = smoothstep(0.2, 0.7, night);
    this.kit.glass.emissive.setRGB(1, 0.6, 0.26).multiplyScalar(glow * 1.3);
    this.lampGlass.emissive.setRGB(1, 0.72, 0.36).multiplyScalar(0.05 + glow * 3);
    for (const h of this.lamps) {
      h.visible = glow > 0.01;
      (h.material as THREE.SpriteMaterial).opacity = glow * 0.95;
    }
    if (this.lampLight) this.lampLight.intensity = glow * 26;
  }

  dispose(): void {
    const done = new Set<THREE.Material>();
    this.group.traverse((o: THREE.Object3D) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      for (const x of Array.isArray(m) ? m : m ? [m] : []) {
        if (done.has(x)) continue;
        done.add(x);
        const map = (x as THREE.MeshLambertMaterial).map;
        if (map && !isShared(map)) map.dispose();
        x.dispose();
      }
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
  return lerp(1.05, 1.05 + 0.39 * SHEER, Math.pow(Math.min(d, 1), 1.9));
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
function hullPoint(t: number, v: number, side: number, L: number, B: number, D: number): THREE.Vector3 {
  const bw = beamAt(t) * (B / 2);
  const keel = -keelAt(t) * D;
  const sheer = sheerAt(t) * D * FREEBOARD;
  const y = lerp(keel, sheer, v);
  // The wale is a heavier strake, standing slightly proud of the planking.
  const waleness = Math.exp(-Math.pow((v - 0.74) / 0.055, 2));
  const w = sectionWidth(v, t) * bw * (1 + waleness * 0.085);
  return new THREE.Vector3(side * w, y, (t - 0.5) * L + rakeAt(t, L) * v);
}

function buildHull(L: number, B: number, D: number, kit: Kit): THREE.Mesh {
  const stations = 44;
  const rows = 22;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const c = new THREE.Color();
  const oak = kit.hullTone;
  const weed = new THREE.Color(0x4a5a3a);
  const rnd = seeded(kit.look.seed);
  // A few long runs of weathering along her length, different on every ship.
  const stains = Array.from({ length: 5 }, () => ({ t: rnd(), w: 0.02 + rnd() * 0.05, k: 0.06 + rnd() * 0.12 }));

  const addVertex = (t: number, v: number, side: number) => {
    const p = hullPoint(t, v, side, L, B, D);
    positions.push(p.x, p.y, p.z);
    uvs.push(p.z * PLANK_U, p.y * PLANK_V);
    const y = p.y;
    const waleness = Math.exp(-Math.pow((v - 0.74) / 0.055, 2));

    if (y < 0.02) {
      // Tallow and pitch, fouling darker as it goes deeper.
      c.copy(BOTTOM).lerp(OAK_DARK, clamp(y / (D * 0.4) + 1, 0, 1) * 0.35);
      // Weed at the boot-top, where the sea washes and the sun reaches.
      c.lerp(weed, clamp(1 + y / 0.35, 0, 1) * 0.45);
    } else {
      c.copy(oak).lerp(OAK_DARK, Math.sin(t * 37) * 0.05 + 0.08);
      // The wet band: the planking a wave has just run off is darker and
      // richer than the dry wood above it.
      c.multiplyScalar(lerp(0.62, 1, smoothstep(0.05, D * 0.32, y)));
    }
    for (const s of stains) {
      c.multiplyScalar(1 - s.k * Math.exp(-Math.pow((t - s.t) / s.w, 2)) * (1 - v * 0.5));
    }
    c.lerp(WALE, waleness * 0.9);
    // Occlusion: the turn of the bilge and the tuck under the wale see less
    // sky than the topsides.
    c.multiplyScalar(lerp(0.72, 1, smoothstep(0.05, 0.55, v)));
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
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  const mat = timber(0xffffff, true);
  mat.roughness = 0.72;
  return new THREE.Mesh(g, mat);
}

/**
 * The painted band from the wale to the rail, laid a finger's breadth proud of
 * the planking so it never fights it for the same pixels.
 */
function buildBand(L: number, B: number, D: number, look: ShipLook): THREE.Mesh {
  const stations = 44;
  const rows = 4;
  const v0 = 0.79, v1 = 0.985;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let base = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < stations; i++) {
      const t = 0.01 + (i / (stations - 1)) * 0.975;
      for (let j = 0; j <= rows; j++) {
        const v = lerp(v0, v1, j / rows);
        const p = hullPoint(t, v, side, L, B, D);
        p.x += side * (0.025 + Math.abs(p.x) * 0.004);
        positions.push(p.x, p.y, p.z);
        uvs.push(p.z / 8, j / rows);
      }
    }
    for (let i = 0; i < stations - 1; i++) {
      for (let j = 0; j < rows; j++) {
        const a = base + i * (rows + 1) + j;
        const b = a + rows + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    base += stations * (rows + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    map: bandTexture(look.band!, look.seed), roughness: 0.62, metalness: 0,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
}

function buildDeck(L: number, B: number, D: number): THREE.Mesh {
  const stations = 30;
  const across = 9;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const c = new THREE.Color();
  const deck = new THREE.Color(0xc2a47a);

  for (let i = 0; i < stations; i++) {
    const t = i / (stations - 1);
    const z = (t - 0.5) * L + rakeAt(t, L);
    const bw = railHalfBeam(t, B) * 0.97;
    const y = sheerAt(t) * D * FREEBOARD;
    for (let k = 0; k < across; k++) {
      const u = k / (across - 1);
      const x = (u - 0.5) * 2 * bw;
      positions.push(x, y, z);
      // Deck planks run fore and aft, so the strakes of the texture do too.
      uvs.push(z * PLANK_U, x * PLANK_V + 0.37);
      // Scrubbed pale down the middle where the watch walks; darker in the
      // waterways along the bulwarks, where the water lies and the light
      // does not reach.
      c.copy(deck).multiplyScalar(lerp(1, 0.62, Math.pow(Math.abs(u - 0.5) * 2, 3)));
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
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return new THREE.Mesh(g, timber(0xffffff, true));
}

/** Where the stern castle ends, for hanging the lanterns and the gallery on. */
interface AftCastle {
  group: THREE.Group;
  /** Total rise of the castle above the ship's sheer. */
  height: number;
  /** Top of the taffrail, its z, and its half-width. */
  top: number;
  z: number;
  halfWidth: number;
}

function buildSterncastle(L: number, B: number, D: number, kit: Kit): AftCastle {
  const look = kit.look;
  const g = new THREE.Group();
  const h = D * 0.72 * look.aft;
  const deck = sheerAt(0.14) * D * FREEBOARD;

  // The quarterdeck: a raised deck following the ship's own plan, with bulwarks
  // up either side and a bulkhead closing it at the break. Built as a box, as it
  // was, it reads as a shed nailed to the stern — a castle aft is part of the
  // hull's shape and has to be lofted from the same stations.
  g.add(buildRaisedDeck(L, B, D, 0.0, look.aftLen, h, kit));
  let total = h;
  // A great ship carries a second storey aft, the poop, over the after half
  // of the quarterdeck: the captain's cabin under it and the pilot on top.
  if (look.aftTiers === 2) {
    const h2 = D * 0.46 * look.aft;
    g.add(buildRaisedDeck(L, B, D, 0.0, look.aftLen * 0.52, h2, kit, { base: h }));
    total += h2;
  }

  // The transom, planked across the stern and raked aft. It is lofted rather
  // than boxed: a slab of BoxGeometry here shows the player one enormous
  // unlit rectangle, because its after face is the only one he ever sees and it
  // points away from the sun all day.
  g.add(buildTransom(L, B, D, h, deck, kit));

  const endZ = -L * 0.5 + rakeAt(0, L);
  const endY = sheerAt(0) * D * FREEBOARD;
  const endHalf = railHalfBeam(0, B) * 0.96;
  const bulwark = D * 0.34;

  // Stern windows: the great cabin's lights across the castle's after face,
  // a row to each storey, and the quarter lights down either side.
  const wins: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  const tiers = look.aft < 0.5 ? 0 : look.aftTiers;
  for (let r = 0; r < tiers; r++) {
    const y = endY + (r === 0 ? h * 0.5 : h + (total - h) * 0.5);
    const n = look.aft > 1 ? 4 : look.aft > 0.75 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n - 0.5) * endHalf * 1.55;
      wins.push(m.clone().compose(new THREE.Vector3(x, y, endZ - 0.12), new THREE.Quaternion(), new THREE.Vector3(0.62, 0.58, 0.1)));
    }
    for (const side of [-1, 1]) {
      for (const t of [0.06, 0.13]) {
        if (r === 1 && t > look.aftLen * 0.45) continue;
        const x = side * (railHalfBeam(t, B) * 0.96 + 0.04);
        const z = (t - 0.5) * L + rakeAt(t, L);
        wins.push(m.clone().compose(new THREE.Vector3(x, sheerAt(t) * D * FREEBOARD + (r === 0 ? h * 0.5 : h + (total - h) * 0.5), z),
          new THREE.Quaternion(), new THREE.Vector3(0.1, 0.5, 0.55)));
      }
    }
  }
  if (wins.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), kit.glass, wins.length);
    wins.forEach((w, i) => im.setMatrixAt(i, w));
    g.add(im);
  }

  const top = endY + total + bulwark;
  if (look.gallery) g.add(buildGallery(endZ, endY + h * 0.18, endHalf, h, kit));
  return { group: g, height: total, top, z: endZ, halfWidth: endHalf };
}

/**
 * The stern gallery: a railed walk across the after face of the castle, roofed
 * over, which is the most ornamented thing on a great ship and the first thing
 * anyone astern of her sees.
 */
function buildGallery(z: number, y: number, half: number, h: number, kit: Kit): THREE.Group {
  const g = new THREE.Group();
  const depth = 1.0;
  const w = half * 2 * 1.02;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, depth), kit.trim);
  floor.position.set(0, y, z - depth / 2);
  g.add(floor);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 0.14, depth * 1.15), kit.castle);
  roof.position.set(0, y + h * 0.78, z - depth / 2);
  g.add(roof);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.14), kit.trim);
  rail.position.set(0, y + 0.95, z - depth + 0.05);
  g.add(rail);
  // Balusters, and posts carrying the roof at the corners and between.
  const n = Math.max(10, Math.round(w * 3));
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.06, 1, 5), kit.trim, n + 5);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n - 0.5) * w;
    posts.setMatrixAt(i, m.compose(new THREE.Vector3(x, y + 0.5, z - depth + 0.05), new THREE.Quaternion(), new THREE.Vector3(1, 0.86, 1)));
  }
  for (let i = 0; i < 5; i++) {
    const x = (i / 4 - 0.5) * w;
    posts.setMatrixAt(n + i, m.compose(new THREE.Vector3(x, y + h * 0.39, z - depth + 0.05), new THREE.Quaternion(), new THREE.Vector3(1.8, h * 0.78, 1.8)));
  }
  g.add(posts);
  return g;
}

/**
 * A raised deck at one end of the ship — the quarterdeck aft, the forecastle
 * forward — lofted from the hull's own stations so it carries her sheer and her
 * plan shape, with bulwarks up either side and a bulkhead across the break.
 *
 * `base` stacks one on another; `overhang` carries a carrack's forecastle out
 * past the stem in a triangle, its underside open to the sea.
 */
function buildRaisedDeck(
  L: number, B: number, D: number,
  fromT: number, toT: number, rise: number,
  kit: Kit, opts: { base?: number; overhang?: boolean } = {},
): THREE.Group {
  const g = new THREE.Group();
  const steps = 14;
  const base = opts.base ?? 0;
  const bulwark = D * 0.34;
  const aft = fromT === 0;
  const sheer = (t: number) => sheerAt(Math.min(t, 1)) * D * FREEBOARD;
  const level = (t: number) => sheer(t) + base + rise;
  const zAt = (t: number) => (t - 0.5) * L + rakeAt(Math.min(t, 1), L);
  const halfAt = (t: number) => (opts.overhang && t > 0.9
    ? railHalfBeam(0.9, B) * (1 - Math.pow((t - 0.9) / (toT - 0.9), 1.25) * 0.86)
    : railHalfBeam(t, B));
  // Where the castle's side comes down to: the ship's own sheer, lapping it,
  // or for an overhang past the hull, a short skirt under its deck.
  const footAt = (t: number) => (opts.overhang && t > 0.9
    ? sheer(t) + base - 0.4
    : sheer(t) + base - (base ? 0.05 : 0.12));
  const ts = Array.from({ length: steps + 1 }, (_, i) => lerp(fromT, toT, i / steps));

  const strip = (pts: number[], uv: number[], mat: THREE.Material) => {
    const idx: number[] = [];
    for (let i = 0; i < steps; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, mat));
  };

  // The deck itself.
  {
    const pts: number[] = [];
    const uv: number[] = [];
    for (const t of ts) {
      const bw = halfAt(t) * 0.94;
      pts.push(-bw, level(t), zAt(t), bw, level(t), zAt(t));
      uv.push(zAt(t) * PLANK_U, -bw * PLANK_V, zAt(t) * PLANK_U, bw * PLANK_V);
    }
    strip(pts, uv, kit.castleDeck);
  }

  // The side of the castle, either hand: planked from the ship's own sheer all
  // the way up past the raised deck to the top of the bulwark.
  //
  // It used to start a hand's breadth under the raised deck, which left the
  // whole height of the rise — two thirds of the depth of the hold, aft — as
  // open air between the castle and the ship. The quarterdeck and the
  // forecastle both hung over the water with a gap you could see the sea
  // through, which is what "the stern castle is floating" means.
  for (const side of [-1, 1]) {
    const pts: number[] = [];
    const uv: number[] = [];
    const cap: number[] = [];
    const capUv: number[] = [];
    for (const t of ts) {
      const bw = halfAt(t) * 0.96;
      const foot = footAt(t);
      const head = level(t) + bulwark;
      pts.push(side * bw, foot, zAt(t), side * bw * 0.97, head, zAt(t));
      uv.push(zAt(t) * PLANK_U, foot * PLANK_V, zAt(t) * PLANK_U, head * PLANK_V);
      // A capping rail along the top, which draws the line of the castle.
      cap.push(side * (bw * 0.97 + 0.1), head + 0.05, zAt(t), side * (bw * 0.97 - 0.14), head + 0.05, zAt(t));
      capUv.push(0, 0, 0, 0.05);
    }
    strip(pts, uv, kit.castle);
    strip(cap, capUv, kit.trim);
  }

  // The underside of an overhang, seen from the water under the bow.
  if (opts.overhang) {
    const pts: number[] = [];
    const uv: number[] = [];
    const under = ts.map((t) => Math.max(t, 0.9));
    for (const t of under) {
      const bw = halfAt(t) * 0.96;
      pts.push(-bw, footAt(t), zAt(t), bw, footAt(t), zAt(t));
      uv.push(zAt(t) * PLANK_U, -bw * PLANK_V, zAt(t) * PLANK_U, bw * PLANK_V);
    }
    strip(pts, uv, kit.trim);
  }

  // The end of the castle at the ship's own end — the after face aft, the
  // point of the forecastle forward — closed in, so it is a castle and not a
  // pair of walls.
  {
    const t = aft ? fromT : toT;
    const bw = halfAt(t) * 0.96;
    const shape = new THREE.Shape();
    const foot = footAt(t);
    const head = level(t) + bulwark;
    shape.moveTo(-bw, foot); shape.lineTo(bw, foot);
    shape.lineTo(bw * 0.97, head); shape.lineTo(-bw * 0.97, head);
    const geo = new THREE.ShapeGeometry(shape);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * PLANK_U, pos.getY(i) * PLANK_V);
    const face = new THREE.Mesh(geo, kit.castle);
    face.position.z = zAt(t);
    g.add(face);
  }

  // The bulkhead across the break, which is the face the rest of the deck sees.
  const breakT = aft ? toT : fromT;
  const bw = halfAt(breakT) * 0.94;
  const face = new THREE.Mesh(new THREE.BoxGeometry(bw * 2, rise + 0.3, 0.16), kit.castle);
  face.position.set(0, level(breakT) - rise / 2, zAt(breakT));
  g.add(face);
  // A door in it, and a ladder up beside.
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, Math.min(1.7, rise * 0.8), 0.06), kit.glass);
  door.position.set(-bw * 0.3, level(breakT) - rise + Math.min(1.7, rise * 0.8) / 2, zAt(breakT) + (aft ? 0.09 : -0.09));
  if (rise > 1) g.add(door);
  for (let s = 0; s < 4; s++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.16), kit.trim);
    step.position.set(
      bw * 0.45,
      level(breakT) - rise + (s + 0.6) * (rise / 4),
      zAt(breakT) + (aft ? 0.5 : -0.5) * (1 - s * 0.12),
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
  L: number, B: number, D: number, castle: number, deck: number, kit: Kit,
): THREE.Mesh {
  const rows = 12;
  const cols = 9;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
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
    // to, so it closes the planking off instead of sitting inside it.
    const z = -L * 0.5 + rakeAt(0.02, L) * v - 0.05;
    for (let i = 0; i < cols; i++) {
      const u = i / (cols - 1);
      // The corners are eased, so the transom reads as a panel rather than a box.
      const round = 1 - Math.pow(Math.abs(u - 0.5) * 2, 3.4) * 0.25;
      const x = (u - 0.5) * 2 * halfWidth * round;
      positions.push(x, y, z);
      uvs.push(x * PLANK_U, y * PLANK_V);
      c.copy(kit.hullTone).multiplyScalar(0.86);
      if (y < 0.3) c.multiplyScalar(lerp(0.6, 1, clamp((y + 0.2) / 0.5, 0, 1)));
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
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return new THREE.Mesh(g, timber(0xffffff, true));
}

function buildForecastle(L: number, B: number, D: number, h: number, kit: Kit): THREE.Group {
  // A carrack's forecastle is a triangle thrust out over the stem; a caravel's
  // or a galleon's is a low platform that stops at it.
  return kit.look.overhang
    ? buildRaisedDeck(L, B, D, 0.8, 1.085, h, kit, { overhang: true })
    : buildRaisedDeck(L, B, D, 0.84, 0.995, h, kit);
}

/** The bowsprit, stepped through the forecastle and steeved up over the stem. */
function buildBowsprit(L: number, D: number, foreH: number): THREE.Mesh {
  const deck = sheerAt(0.88) * D * FREEBOARD;
  const sprit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.18, L * 0.32, 8),
    new THREE.MeshLambertMaterial({ color: SPAR }),
  );
  sprit.rotation.x = Math.PI / 2 - 22 * DEG;
  sprit.position.set(0, deck + Math.max(foreH, 0.5) * 0.7, L * 0.57);
  return sprit;
}

/**
 * The stem: the timber the planking is rabbeted into, following the same raked
 * profile the last station of the hull is lofted to, so the two meet instead of
 * the planking stopping in mid air and the stem standing clear of it.
 */
function buildStem(L: number, D: number, foreH: number): THREE.Mesh {
  const stemMat = new THREE.MeshLambertMaterial({ color: 0x574024 });
  const stemPos: number[] = [];
  const stemIdx: number[] = [];
  const rows = 12;
  // A flush-decked caravel's stem stands up past her rail as a stemhead.
  const top = sheerAt(1) * D * FREEBOARD + (foreH > 0 ? foreH * 0.55 : 0.7);
  for (let i = 0; i < rows; i++) {
    const v = i / (rows - 1);
    const y = lerp(-keelAt(1) * D, top, v);
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
  return new THREE.Mesh(stemGeo, stemMat);
}

/**
 * A galleon's beak: a low spur run out ahead of the stem under the bowsprit,
 * with a grating to stand on and a knee beneath it down to the cutwater. It is
 * the one feature that tells a galleon from a carrack at a glance.
 */
function buildBeak(L: number, B: number, D: number, kit: Kit): THREE.Group {
  const g = new THREE.Group();
  const y0 = sheerAt(1) * D * FREEBOARD * 0.72;
  const z0 = L * 0.5 + rakeAt(1, L) * 0.72 - 0.4;
  const len = L * 0.15;
  const half = railHalfBeam(0.93, B) * 0.9 + 0.3;
  const tipY = y0 - 0.1;
  // The knee runs from well down the cutwater up to the point: a slender
  // timber under the beak, not a keel.
  const v = [
    -half, y0, z0, half, y0, z0, // 0 1: base of the platform
    -0.12, tipY, z0 + len, 0.12, tipY, z0 + len, // 2 3: the point
    0, y0 - D * 0.42, z0 + len * 0.1, // 4: the knee, down on the cutwater
  ];
  const idx = [0, 2, 1, 1, 2, 3, 0, 4, 2, 1, 3, 4, 2, 4, 3];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, kit.trim));
  // The head rails either side, sweeping up from the point to the bow.
  for (const side of [-1, 1]) {
    const a = new THREE.Vector3(side * 0.14, tipY + 0.35, z0 + len - 0.1);
    const b = new THREE.Vector3(side * half * 0.95, y0 + 1.1, z0 - 0.3);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, a.distanceTo(b), 6), kit.trim);
    rail.position.copy(a).lerp(b, 0.5);
    rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(rail);
  }
  // A figurehead's worth of carving at the point: a lion, at this distance a
  // gilded lump, which is what a lion at this distance was.
  const lion = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xb8903e, roughness: 0.45, metalness: 0.4 }));
  lion.scale.set(0.8, 1, 1.3);
  lion.position.set(0, tipY + 0.3, z0 + len + 0.05);
  g.add(lion);
  return g;
}

/**
 * The pavesade: painted shields hung along a great ship's castle rails, as
 * much a ship's colours as her flag, and as much for show as for musket shot.
 */
function buildShields(L: number, B: number, D: number, aftH: number, foreH: number, look: ShipLook): THREE.InstancedMesh {
  const spots: THREE.Vector3[] = [];
  const bulwark = D * 0.34;
  const along = (from: number, to: number, rise: number) => {
    const n = Math.max(2, Math.floor(((to - from) * L) / 1.15));
    for (let i = 0; i < n; i++) {
      const t = lerp(from, to, (i + 0.5) / n);
      const y = sheerAt(t) * D * FREEBOARD + rise + bulwark * 0.5;
      const z = (t - 0.5) * L + rakeAt(t, L);
      for (const side of [-1, 1]) spots.push(new THREE.Vector3(side * (railHalfBeam(t, B) * 0.95 + 0.06), y, z));
    }
  };
  along(0.03, look.aftLen - 0.02, aftH);
  if (foreH > 0) along(0.83, 0.93, foreH);
  // And along the waist, between the castles.
  along(look.aftLen + 0.04, 0.78, 0);

  const im = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.36, 0.36, 0.07, 12).rotateZ(Math.PI / 2),
    new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 }),
    spots.length,
  );
  const colours = [0xa63224, 0xe0d6bf, 0xc09340].map((h) => new THREE.Color(h));
  const m = new THREE.Matrix4();
  spots.forEach((p, i) => {
    im.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    im.setColorAt(i, colours[Math.floor(i / 2) % 3]);
  });
  return im;
}

/**
 * The people aboard: not a crew, which would be a hundred men, but enough of
 * one — the helmsman at the whipstaff, an officer on the quarterdeck, a hand
 * at each mast and a lookout forward and aloft — that she reads as a working
 * ship and not a model of one.
 */
function buildCrew(hull: HullClass, look: ShipLook, aftH: number, foreH: number): THREE.Group {
  const L = hull.lwl, B = hull.beam, D = hull.draft;
  const g = new THREE.Group();
  const rnd = seeded(look.seed + 31);
  const deckY = (t: number) => sheerAt(t) * D * FREEBOARD
    + (t < look.aftLen ? aftH : 0)
    + (foreH > 0 && t > (look.overhang ? 0.8 : 0.84) ? foreH : 0);
  const zOf = (t: number) => (t - 0.5) * L + rakeAt(t, L);
  const spots: { x: number; y: number; z: number; face: number }[] = [];
  const put = (t: number, across: number) => {
    spots.push({ x: across * railHalfBeam(t, B), y: deckY(t), z: zOf(t), face: rnd() * Math.PI * 2 });
  };

  // The helmsman, at the break of the quarterdeck where the tiller comes in.
  put(look.aftLen + 0.03, 0.08);
  // Officer and pilot on the quarterdeck.
  put(look.aftLen * 0.55, -0.35);
  if (hull.crewFull > 40) put(look.aftLen * 0.4, 0.3);
  // A hand or two at the foot of every mast, tending the sheets and braces.
  for (const m of hull.masts) {
    if (m.name.startsWith('Gávea')) continue;
    const t = clamp((m.station * L * 0.42) / L + 0.5 - 0.035, 0.05, 0.92);
    if (t < look.aftLen) continue;
    put(t, rnd() < 0.5 ? -0.6 : 0.6);
    if (hull.crewFull > 25) put(t + 0.05, rnd() < 0.5 ? -0.45 : 0.45);
  }
  // A lookout forward.
  put(0.9, 0.12);
  // Men about the waist, the more the bigger she is.
  const extra = Math.min(6, Math.floor(hull.crewFull / 22));
  for (let i = 0; i < extra; i++) put(lerp(look.aftLen + 0.06, 0.78, rnd()), (rnd() - 0.5) * 1.3);

  // A figure of a man, merged into one shape: legs, body, arms and head.
  const legs = new THREE.CylinderGeometry(0.13, 0.11, 0.82, 6).translate(0, 0.41, 0).scale(1.3, 1, 0.8);
  const body = new THREE.CylinderGeometry(0.2, 0.15, 0.66, 7).translate(0, 1.14, 0).scale(1, 1, 0.75);
  const arms = new THREE.CylinderGeometry(0.06, 0.06, 0.6, 5).rotateZ(0.15).translate(0.24, 1.1, 0);
  const arms2 = arms.clone().scale(-1, 1, 1);
  const tint = (geo: THREE.BufferGeometry, hex: number) => {
    const c = new THREE.Color(hex);
    const n = geo.getAttribute('position').count;
    geo.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [c.r, c.g, c.b][i % 3]), 3));
    return geo;
  };
  const head = new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.62, 0);
  const figure = mergeGeometries([
    tint(legs.toNonIndexed(), 0x5a4a3a), tint(body.toNonIndexed(), 0xffffff),
    tint(arms.toNonIndexed(), 0xffffff), tint(arms2.toNonIndexed(), 0xffffff),
    tint(head.toNonIndexed(), 0xb0805a),
  ]);
  const men = new THREE.InstancedMesh(figure, new THREE.MeshLambertMaterial({ vertexColors: true }), spots.length);
  const shirts = [0xe8e0cc, 0xd8cdb2, 0x9a3a2a, 0x5a6878, 0x8a7050, 0xe8e0cc].map((h) => new THREE.Color(h));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spots.forEach((s, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.face);
    const k = 0.95 + rnd() * 0.1;
    m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(k, k, k));
    men.setMatrixAt(i, m);
    men.setColorAt(i, shirts[i % shirts.length]);
  });
  g.add(men);
  return g;
}

/** A stern lantern: a post, a glazed body and a cap. */
function buildLantern(glass: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const iron = new THREE.MeshLambertMaterial({ color: IRON });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.6, 5), iron);
  post.position.y = 0.3;
  g.add(post);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.62, 6), glass);
  body.position.y = 0.9;
  g.add(body);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.32, 6), iron);
  cap.position.y = 1.37;
  g.add(cap);
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
function makeSailTexture(
  build: SailBuild, device: 'cross' | 'saltire' | null, look: ShipLook, index: number,
): THREE.Texture {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const rnd = seeded(look.seed + index * 101 + 7);

  ctx.fillStyle = look.canvas;
  ctx.fillRect(0, 0, size, size);

  // The weave: a fine cross-hatch, which is what keeps canvas from reading as
  // paper at close range.
  ctx.strokeStyle = 'rgba(168, 155, 128, 0.28)';
  ctx.lineWidth = 1;
  for (let i = 0; i < size; i += 4) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
  }

  // Each cloth came off a different bolt and has weathered its own way.
  const cloths = 11;
  const cw = size / cloths;
  for (let i = 0; i < cloths; i++) {
    const d = (rnd() - 0.5) * 0.06;
    ctx.fillStyle = d > 0 ? `rgba(255,250,236,${d})` : `rgba(120,104,78,${-d})`;
    ctx.fillRect(i * cw, 0, cw, size);
  }

  // Cloth seams. The texture is laid out in the sail's own frame — across the
  // sail one way, up the luff the other — so these run straight up it whatever
  // the cut, and stay straight when the canvas bellies.
  for (let i = 1; i < cloths; i++) {
    const x = i * cw;
    ctx.strokeStyle = 'rgba(146, 132, 104, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
    // The doubled edge of the overlapping cloth catches the light beside it.
    ctx.strokeStyle = 'rgba(246, 240, 226, 0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 3, 0); ctx.lineTo(x + 3, size); ctx.stroke();
  }

  // Reef bands: the reinforced strips a sail is shortened along, with the
  // points hanging from them.
  for (const v of [0.3, 0.52]) {
    ctx.fillStyle = 'rgba(150, 137, 108, 0.3)';
    ctx.fillRect(0, v * size, size, size * 0.018);
    ctx.fillStyle = 'rgba(110, 96, 72, 0.5)';
    for (let x = cw / 2; x < size; x += cw / 2) ctx.fillRect(x, v * size + size * 0.018, 3, 16);
  }

  // Patches, where the sail has blown out and been mended at sea: a square of
  // newer or older cloth let into a cloth, stitched round.
  const patches = Math.round(look.wear * (3 + rnd() * 6));
  for (let i = 0; i < patches; i++) {
    const col = Math.floor(rnd() * cloths);
    const w = cw * (0.6 + rnd() * 0.35);
    const h = size * (0.05 + rnd() * 0.12);
    const x = col * cw + (cw - w) / 2;
    const y = size * (0.1 + rnd() * 0.78);
    const newer = rnd() < 0.5;
    ctx.fillStyle = newer ? 'rgba(248,244,232,0.55)' : 'rgba(150,132,100,0.4)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(100,86,62,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
    ctx.setLineDash([]);
  }

  // Sun, salt and weather. Canvas at sea is never one flat colour.
  for (let i = 0; i < 130; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 30 + rnd() * 130;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.62;
    g.addColorStop(0, dark ? `rgba(142, 128, 100, ${0.05 + look.wear * 0.08})` : 'rgba(255, 252, 244, 0.09)');
    g.addColorStop(1, 'rgba(150, 138, 110, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rust and tar run down from the head, where the canvas is laced to the yard,
  // and the foot is grey with spray and the hands that haul on it.
  const runs = Math.round(4 + look.wear * 14);
  for (let i = 0; i < runs; i++) {
    const x = rnd() * size;
    const len = size * (0.08 + rnd() * 0.3 * look.wear + 0.05);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(110,72,40,${0.12 + look.wear * 0.18})`);
    g.addColorStop(1, 'rgba(110,72,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 2 + rnd() * 7, len);
  }
  const foot = ctx.createLinearGradient(0, size * 0.72, 0, size);
  foot.addColorStop(0, 'rgba(96,86,70,0)');
  foot.addColorStop(1, `rgba(96,86,70,${0.1 + look.wear * 0.22})`);
  ctx.fillStyle = foot;
  ctx.fillRect(0, size * 0.72, size, size * 0.28);

  // Bolt rope round the edge.
  ctx.strokeStyle = 'rgba(112, 96, 70, 0.6)';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, size - 12, size - 12);

  if (device) {
    const cx = build.crossAt[0] * size;
    const cy = (1 - build.crossAt[1]) * size;
    const a = build.crossArm;
    if (device === 'cross') {
      ctx.fillStyle = '#a3302b';
      drawCross(ctx, cx, cy, size, build.crossAxes, a, a * 0.30, a * 0.17);
      ctx.fillStyle = look.canvas;
      drawCross(ctx, cx, cy, size, build.crossAxes, a * 0.56, a * 0.115, a * 0.065);
    } else {
      // The ragged saltire of Burgundy, which Biscay's ships wore: two knotted
      // staves crossed, not a clean cross.
      ctx.fillStyle = '#a3302b';
      drawSaltire(ctx, cx, cy, size, build.crossAxes, a * 1.1, a * 0.16, rnd);
    }
  }
  // The paint has weathered with the cloth under it.
  ctx.fillStyle = `rgba(210,200,176,${0.06 + look.wear * 0.1})`;
  for (let i = 0; i < 60; i++) ctx.fillRect(rnd() * size, rnd() * size, 4 + rnd() * 30, 2 + rnd() * 6);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Two knotted staves crossed corner to corner, in metres on the sail. */
function drawSaltire(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number,
  axes: { up: [number, number]; across: [number, number] },
  len: number, thick: number, rnd: () => number,
): void {
  const ux = axes.up[0] * size, uy = -axes.up[1] * size;
  const ax = axes.across[0] * size, ay = -axes.across[1] * size;
  const at = (mUp: number, mAcross: number): [number, number] =>
    [cx + mUp * ux + mAcross * ax, cy + mUp * uy + mAcross * ay];
  for (const s of [1, -1]) {
    // Along the diagonal (1, s), with the stave's width across it.
    const d = Math.SQRT1_2;
    const du = d, da = s * d;
    const nu = -s * d, na = d;
    const pts: [number, number][] = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const k = -len + (2 * len * i) / n;
      pts.push(at(du * k + nu * thick, da * k + na * thick));
    }
    for (let i = n; i >= 0; i--) {
      const k = -len + (2 * len * i) / n;
      pts.push(at(du * k - nu * thick, da * k - na * thick));
    }
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    // The knots: stubs of cut branches along each stave.
    for (let i = 1; i < 6; i++) {
      const k = -len + (2 * len * i) / 6;
      const side = rnd() < 0.5 ? 1 : -1;
      const [x0, y0] = at(du * k + nu * thick * side, da * k + na * thick * side);
      const [x1, y1] = at(du * (k + thick * 0.8) + nu * thick * 2.4 * side, da * (k + thick * 0.8) + na * thick * 2.4 * side);
      ctx.lineWidth = Math.max(4, thick * Math.hypot(ux, uy) * 0.9);
      ctx.strokeStyle = '#a3302b';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
  }
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
