import * as THREE from 'three';
import { NM, clamp, cosd, wrap180, type LatLon } from '../core/math';
import { elevationAt, isLand, nearestShore } from '../world/landmass';
import { anchorageOf, portsNear, type PortDef } from '../world/ports';
import { people } from '../world/peoples';
import { Rng } from '../core/rng';

const EARTH_RADIUS_M = 6371000;

/**
 * How far the curve hides a point, measured from the horizon rather than from
 * the ship — see the same function in `land.ts`. A town this side of the
 * horizon is not hidden by the curve at all.
 */
function curvatureDrop(distanceM: number, eyeM: number): number {
  const horizonM = Math.sqrt(2 * EARTH_RADIUS_M * Math.max(eyeM, 1.5));
  const beyond = Math.max(distanceM - horizonM, 0);
  return (beyond * beyond) / (2 * EARTH_RADIUS_M);
}

/**
 * What a town looks like from the deck of a ship standing in toward it.
 *
 * A landfall on an inhabited coast is not the same event as a landfall on an
 * empty one, and until this existed the game could not tell the player which
 * he had made: Arguim and four hundred miles of Saharan beach were the same
 * brown band along the skyline. A town raised from the masthead is the oldest
 * piece of information in this trade — it means water, it means people, it
 * means somebody will come off to you — and it has to be visible before the
 * ship is committed, not printed in a panel after she has anchored.
 *
 * So a settlement is built as buildings, on the ground, sunk by the same
 * curvature as the terrain behind it, and it comes up over the horizon the way
 * everything else does: the tower first, then the roofs, then the beach.
 * What kind of buildings is read off who lives there. A Maghrebi port is flat
 * roofs and a minaret; a Temne town on the Guinea coast is round houses under
 * thatch; a Portuguese feitoria is whitewash and a church. That is the
 * difference the player is sailing thousands of miles to find out, and it is
 * worth drawing honestly.
 */
interface Town {
  def: PortDef;
  /** Where the buildings stand, in metres east and south of the ship. */
  x: number;
  z: number;
  /** True bearing from the anchorage to the shore, radians: the way inland. */
  brg: number;
  lat: number;
  lon: number;
}

type RoofKind = 'thatch' | 'flat' | 'pitched';

interface Style {
  roof: RoofKind;
  /** Walls. */
  wall: THREE.Color;
  roofColour: THREE.Color;
  /** A tower, a keep, a minaret — or nothing. */
  landmark: 'tower' | 'minaret' | 'keep' | 'none';
  /** Round houses rather than rectangular ones. */
  round: boolean;
}

const WHITEWASH = new THREE.Color(0.90, 0.88, 0.82);
const MUDBRICK = new THREE.Color(0.72, 0.58, 0.40);
const OCHRE = new THREE.Color(0.66, 0.50, 0.34);
const THATCH = new THREE.Color(0.58, 0.47, 0.26);
const TILE = new THREE.Color(0.52, 0.28, 0.19);
const FLATROOF = new THREE.Color(0.64, 0.56, 0.44);

function styleFor(def: PortDef): Style {
  const folk = people(def.people);
  const faith = folk ? folk.faith : 'traditional';
  if (def.people === 'portuguese' || def.people === 'castilian') {
    return {
      roof: 'pitched', wall: WHITEWASH, roofColour: TILE, round: false,
      landmark: def.feitoria || def.size === 'city' ? 'tower' : 'none',
    };
  }
  if (faith === 'muslim') {
    return {
      roof: 'flat', wall: def.people === 'swahili' ? WHITEWASH : MUDBRICK,
      roofColour: FLATROOF, round: false,
      landmark: def.size === 'anchorage' ? 'none' : 'minaret',
    };
  }
  if (faith === 'hindu' || faith === 'buddhist') {
    return {
      roof: 'pitched', wall: OCHRE, roofColour: TILE, round: false,
      landmark: def.wealth > 0.5 ? 'tower' : 'none',
    };
  }
  return {
    roof: 'thatch', wall: MUDBRICK, roofColour: THATCH, round: true,
    landmark: def.size === 'city' || def.size === 'emporium' ? 'keep' : 'none',
  };
}

/** How many houses, and how far the town spreads, by what the place is. */
const SPREAD: Record<string, { count: number; radius: number }> = {
  anchorage: { count: 6, radius: 90 },
  village: { count: 16, radius: 170 },
  town: { count: 40, radius: 340 },
  city: { count: 80, radius: 620 },
  emporium: { count: 110, radius: 820 },
};

/**
 * A cooking fire's smoke, which is how a town was actually raised.
 *
 * Houses are six metres high and a town four miles off subtends about as much
 * of the eye as a pencil line: that is the truth of it, and no amount of
 * drawing will make a roof visible at the distance a lookout reported one.
 * What he reported was the smoke. A column standing a hundred metres up off a
 * dozen fires is twenty times the size of anything under it and it is what put
 * "smokes" into every landfall in the sailing directions — the Portuguese
 * named a whole reach of the Angolan coast after them.
 */
interface Plume {
  sprite: THREE.Sprite;
  /** Where the fire is, in the scene's metres. */
  x: number;
  z: number;
  y: number;
  /** How far up this puff sits, which sets how far the wind has carried it. */
  rise: number;
}

function smokeTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.34)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/** How many fires are worth drawing, by what the place is. */
const SMOKES: Record<string, number> = {
  anchorage: 1, village: 2, town: 3, city: 5, emporium: 6,
};

export class Settlements {
  group = new THREE.Group();

  private material: THREE.MeshLambertMaterial;
  private smokeMaterial: THREE.SpriteMaterial | null = null;
  private mesh: THREE.Mesh | null = null;
  private plumes: Plume[] = [];
  private lastOrigin: LatLon = { lat: 999, lon: 999 };
  private lastRangeNm = 0;
  private eyeM = 20;

  constructor() {
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
  }

  needsRebuild(origin: LatLon, rangeNm: number, eyeM: number): boolean {
    const dLat = Math.abs(origin.lat - this.lastOrigin.lat) * 60;
    const dLon = Math.abs(wrap180(origin.lon - this.lastOrigin.lon)) * 60 * cosd(origin.lat);
    const step = this.mesh ? 0.25 : 1.2;
    return Math.hypot(dLat, dLon) > step || Math.abs(rangeNm - this.lastRangeNm) > 8
      || Math.abs(eyeM - this.eyeM) > 4;
  }

  rebuild(origin: LatLon, rangeNm: number, eyeM: number): void {
    this.lastOrigin = { ...origin };
    this.lastRangeNm = rangeNm;
    this.eyeM = eyeM;
    this.clear();

    const towns = this.townsNear(origin, rangeNm);
    if (towns.length === 0) return;

    const positions: number[] = [];
    const colours: number[] = [];
    const indices: number[] = [];

    for (const town of towns) {
      this.buildTown(town, origin, positions, colours, indices);
      this.buildSmoke(town);
    }
    if (indices.length === 0) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 2;
    this.group.add(this.mesh);
  }

  /**
   * Where the houses of each town in sight actually stand.
   *
   * The port's own coordinates are the harbour, which for a river port is
   * water; the buildings belong on the bank. So the shore is found from the
   * anchorage and the town is set a little way in from it, facing the water it
   * was built for.
   */
  private townsNear(origin: LatLon, rangeNm: number): Town[] {
    const out: Town[] = [];
    const mPerDegLat = NM * 60;
    const mPerDegLon = mPerDegLat * Math.max(cosd(origin.lat), 1e-6);

    for (const { def } of portsNear(origin, rangeNm)) {
      const at = anchorageOf(def);
      const shore = nearestShore(at, 60);
      if (shore.land < 0) continue;
      // In from the water's edge, by a couple of hundred yards. The coastline
      // is a coarse ring and the anchorage is derived from it, so where it says
      // the beach is and where the ground actually starts do not always agree;
      // walk in until the foot is dry rather than build a town on the water.
      const brg = (shore.bearing * Math.PI) / 180;
      let lat = 0, lon = 0, dry = false;
      for (let inM = shore.distance + 140; inM < shore.distance + 3200; inM += 160) {
        lat = at.lat + (Math.cos(brg) * inM) / mPerDegLat;
        lon = at.lon + (Math.sin(brg) * inM) / mPerDegLon;
        if (isLand({ lat, lon })) { dry = true; break; }
      }
      if (!dry) continue;

      out.push({
        def,
        x: wrap180(lon - origin.lon) * mPerDegLon,
        z: -(lat - origin.lat) * mPerDegLat,
        brg,
        lat,
        lon,
      });
    }
    return out;
  }

  private buildTown(
    town: Town, origin: LatLon,
    positions: number[], colours: number[], indices: number[],
  ): void {
    const style = styleFor(town.def);
    const plan = SPREAD[town.def.size] ?? SPREAD.village;
    const rng = Rng.fromString(town.def.id);
    const mPerDegLat = NM * 60;
    const mPerDegLon = mPerDegLat * Math.max(cosd(origin.lat), 1e-6);

    // The scene's axes are east and *south*, so a compass bearing b points
    // along (sin b, -cos b). Getting that sign wrong scatters the houses out
    // to sea on half the world's coasts, which is why it is written out.
    const { alongX, alongZ, backX, backZ } = frameOf(town.brg);

    const groundAt = (x: number, z: number): number => {
      const lat = origin.lat - z / mPerDegLat;
      const lon = origin.lon + x / mPerDegLon;
      return elevationAt({ lat, lon });
    };

    const place = (
      alongM: number, backM: number, w: number, d: number, h: number,
      wall: THREE.Color, roofColour: THREE.Color, roof: RoofKind, round: boolean,
    ): void => {
      const x = town.x + alongX * alongM + backX * backM;
      const z = town.z + alongZ * alongM + backZ * backM;
      const base = Math.max(groundAt(x, z), 0.5);
      const drop = curvatureDrop(Math.hypot(x, z), this.eyeM);
      const y = base - drop;
      if (round) {
        cylinder(positions, colours, indices, x, y, z, w / 2, h, wall);
        cone(positions, colours, indices, x, y + h, z, w * 0.62, h * 0.85, roofColour);
      } else {
        box(positions, colours, indices, x, y, z, w, d, h, town.brg, wall);
        if (roof === 'pitched') {
          prism(positions, colours, indices,
            x, y + h, z, w, d, Math.min(h * 0.45, 3.5), town.brg, roofColour);
        } else {
          // A flat roof still wants a lip, or the town reads as bare walls.
          box(positions, colours, indices,
            x, y + h, z, w * 1.04, d * 1.04, 0.5, town.brg, roofColour);
        }
      }
    };

    // The houses, scattered in a rough half-disc behind the beach: dense at the
    // waterfront, thinning inland, which is how a landing place grows.
    for (let i = 0; i < plan.count; i++) {
      const t = i / plan.count;
      const backM = 30 + plan.radius * (0.15 + 0.85 * t * t) * rng.range(0.6, 1.25);
      const alongM = rng.range(-1, 1) * plan.radius * (0.45 + 0.9 * (1 - t));
      const w = style.round ? rng.range(4.5, 7.5) : rng.range(6, 12);
      const d = style.round ? w : rng.range(5, 10);
      const h = style.round ? rng.range(2.4, 3.2) : rng.range(3.2, 6.5);
      place(alongM, backM, w, d, h, style.wall, style.roofColour, style.roof, style.round);
    }

    // The one building a lookout can see before any of the others, which is
    // exactly why towns built them where they did.
    if (style.landmark !== 'none') {
      const tall = style.landmark === 'minaret' ? 24
        : style.landmark === 'tower' ? 21 : 12;
      const wide = style.landmark === 'minaret' ? 5
        : style.landmark === 'tower' ? 8 : 16;
      const backM = style.landmark === 'keep' ? 60 : plan.radius * 0.35 + 40;
      const x = town.x + backX * backM;
      const z = town.z + backZ * backM;
      const base = Math.max(groundAt(x, z), 0.5) - curvatureDrop(Math.hypot(x, z), this.eyeM);
      box(positions, colours, indices,
        x, base, z, wide, wide, tall, town.brg,
        style.landmark === 'keep' ? style.wall : WHITEWASH);
      if (style.landmark === 'tower') {
        prism(positions, colours, indices,
          x, base + tall, z, wide, wide, 4, town.brg, TILE);
      }
    }

    // A fortress stands apart from the town, on the point, which is the whole
    // idea of a feitoria: a wall the Crown holds whether the town likes it or not.
    if (town.def.feitoria && town.def.people !== 'portuguese') {
      const alongM = plan.radius * 0.9;
      const x = town.x + alongX * alongM + backX * 20;
      const z = town.z + alongZ * alongM + backZ * 20;
      const base = Math.max(groundAt(x, z), 0.5) - curvatureDrop(Math.hypot(x, z), this.eyeM);
      box(positions, colours, indices, x, base, z, 34, 34, 9, town.brg, WHITEWASH);
      for (const corner of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const cx = x + (alongX * corner[0] + backX * corner[1]) * 15;
        const cz = z + (alongZ * corner[0] + backZ * corner[1]) * 15;
        box(positions, colours, indices,
          cx, base, cz, 8, 8, 13, town.brg, WHITEWASH);
      }
    }
  }

  /**
   * The smokes, stacked one above another so the column leans away downwind as
   * it rises, which is what a plume does and what tells a watching ship where
   * the wind is over the land.
   */
  private buildSmoke(town: Town): void {
    if (!this.smokeMaterial) {
      const map = smokeTexture();
      if (!map) return;
      this.smokeMaterial = new THREE.SpriteMaterial({
        map, transparent: true, depthWrite: false, opacity: 0.62,
        // Wood smoke is grey, and grey is what shows against a pale sky. A
        // white plume on a white horizon is a plume nobody sees.
        color: new THREE.Color(0.58, 0.56, 0.53),
        // The scene's haze is not applied to it. Everything else on that coast
        // is meant to fade out at ten miles, and a smoke is meant not to: it is
        // the one mark a lookout could still pick up when the land under it had
        // gone soft, which is exactly why landfalls were made on smokes.
        fog: false,
      });
    }
    const fires = SMOKES[town.def.size] ?? 1;
    const plan = SPREAD[town.def.size] ?? SPREAD.village;
    const rng = Rng.fromString(`${town.def.id}:smoke`);
    const { alongX, alongZ, backX, backZ } = frameOf(town.brg);
    // A town on a hill smokes from the hill, not from sea level.
    const ground = Math.max(elevationAt({ lat: town.lat, lon: town.lon }), 0);

    for (let f = 0; f < fires; f++) {
      const alongM = rng.range(-0.7, 0.7) * plan.radius;
      const backM = rng.range(0.2, 1.0) * plan.radius + 40;
      const x = town.x + alongX * alongM + backX * backM;
      const z = town.z + alongZ * alongM + backZ * backM;
      const drop = curvatureDrop(Math.hypot(x, z), this.eyeM);
      // Four puffs up each column, widening and thinning as they go.
      const puffs = 4;
      for (let i = 0; i < puffs; i++) {
        const t = (i + 0.5) / puffs;
        const sprite = new THREE.Sprite(this.smokeMaterial);
        const wide = 24 + t * 96;
        sprite.scale.set(wide, wide, 1);
        this.plumes.push({ sprite, x, z, y: ground + 14 + t * 168 - drop, rise: t });
        this.group.add(sprite);
      }
    }
  }

  /**
   * Lean the smoke downwind. Cheap enough to do every frame, and it is the one
   * thing on the whole coast that moves.
   */
  setWind(fromDeg: number, knots: number, time: number): void {
    if (this.plumes.length === 0) return;
    const rad = ((fromDeg + 180) * Math.PI) / 180;
    // East and south components of where the wind is blowing to, in scene axes.
    const ex = Math.sin(rad), ez = -Math.cos(rad);
    // Enough lean to say which way the wind is over the land, not so much that
    // the column lies down along the beach and stops being a column.
    const reach = clamp(knots, 2, 30) * 4.5;
    for (const p of this.plumes) {
      const drift = p.rise * p.rise * reach;
      // A slow breathing, so a plume is never a solid bar.
      const wobble = Math.sin(time * 0.35 + p.rise * 5 + p.x * 0.01) * 5 * p.rise;
      p.sprite.position.set(
        p.x + ex * drift + wobble, p.y + Math.sin(time * 0.2 + p.rise * 3) * 2, p.z + ez * drift,
      );
    }
  }

  setFog(color: THREE.Color, intensity: number): void {
    this.material.color.setRGB(1, 1, 1).lerp(color, clamp(intensity, 0, 0.7));
    if (this.smokeMaterial) {
      // Thinned by haze, but never to nothing.
      this.smokeMaterial.opacity = 0.62 - clamp(intensity, 0, 0.7) * 0.34;
    }
  }

  clear(): void {
    for (const p of this.plumes) this.group.remove(p.sprite);
    this.plumes = [];
    if (!this.mesh) return;
    this.group.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh = null;
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
    if (this.smokeMaterial) {
      this.smokeMaterial.map?.dispose();
      this.smokeMaterial.dispose();
      this.smokeMaterial = null;
    }
  }
}

/**
 * The town's own axes in the scene's metres: `back` runs inland along the
 * bearing from the anchorage to the shore, `along` runs down the beach.
 */
function frameOf(brg: number): {
  alongX: number; alongZ: number; backX: number; backZ: number;
} {
  const backX = Math.sin(brg), backZ = -Math.cos(brg);
  return { alongX: -backZ, alongZ: backX, backX, backZ };
}

// --- Primitives -------------------------------------------------------------
//
// Written out rather than instanced because a whole coast's worth of towns is a
// few thousand triangles in one buffer, which costs a single draw call and
// rebuilds only when the ship has run a mile.

function pushVertex(
  positions: number[], colours: number[], x: number, y: number, z: number, c: THREE.Color,
): number {
  const i = positions.length / 3;
  positions.push(x, y, z);
  colours.push(c.r, c.g, c.b);
  return i;
}

/** A box standing on the ground at (x, y, z), rotated to the town's facing. */
function box(
  positions: number[], colours: number[], indices: number[],
  x: number, y: number, z: number,
  w: number, d: number, h: number, facing: number, c: THREE.Color,
): void {
  const cos = Math.cos(facing), sin = Math.sin(facing);
  const hw = w / 2, hd = d / 2;
  const corners: [number, number][] = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  const base: number[] = [];
  const top: number[] = [];
  // Shade the faces a little apart from one another so the blocks read as solid
  // even when the sun is behind them and the lambert term is flat.
  for (let k = 0; k < 4; k++) {
    const [u, v] = corners[k];
    const px = x + u * cos - v * sin;
    const pz = z + u * sin + v * cos;
    base.push(pushVertex(positions, colours, px, y, pz, c));
    top.push(pushVertex(positions, colours, px, y + h, pz, c));
  }
  for (let k = 0; k < 4; k++) {
    const n = (k + 1) % 4;
    indices.push(base[k], top[k], base[n]);
    indices.push(base[n], top[k], top[n]);
  }
  indices.push(top[0], top[2], top[1]);
  indices.push(top[0], top[3], top[2]);
}

/** A ridged roof sitting on a box of the same footprint. */
function prism(
  positions: number[], colours: number[], indices: number[],
  x: number, y: number, z: number,
  w: number, d: number, h: number, facing: number, c: THREE.Color,
): void {
  const cos = Math.cos(facing), sin = Math.sin(facing);
  const hw = w / 2, hd = d / 2;
  const at = (u: number, v: number, yy: number): number => pushVertex(
    positions, colours, x + u * cos - v * sin, yy, z + u * sin + v * cos, c,
  );
  const a = at(-hw, -hd, y), b = at(hw, -hd, y);
  const cc = at(hw, hd, y), dd = at(-hw, hd, y);
  const r0 = at(0, -hd, y + h), r1 = at(0, hd, y + h);
  indices.push(a, r0, b);
  indices.push(dd, cc, r1);
  indices.push(a, dd, r1); indices.push(a, r1, r0);
  indices.push(b, r0, r1); indices.push(b, r1, cc);
}

function cylinder(
  positions: number[], colours: number[], indices: number[],
  x: number, y: number, z: number, r: number, h: number, c: THREE.Color,
): void {
  const seg = 6;
  const base: number[] = [], top: number[] = [];
  for (let k = 0; k < seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    base.push(pushVertex(positions, colours, px, y, pz, c));
    top.push(pushVertex(positions, colours, px, y + h, pz, c));
  }
  for (let k = 0; k < seg; k++) {
    const n = (k + 1) % seg;
    indices.push(base[k], top[k], base[n]);
    indices.push(base[n], top[k], top[n]);
  }
}

function cone(
  positions: number[], colours: number[], indices: number[],
  x: number, y: number, z: number, r: number, h: number, c: THREE.Color,
): void {
  const seg = 6;
  const ring: number[] = [];
  for (let k = 0; k < seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    ring.push(pushVertex(positions, colours, x + Math.cos(a) * r, y, z + Math.sin(a) * r, c));
  }
  const apex = pushVertex(positions, colours, x, y + h, z, c);
  for (let k = 0; k < seg; k++) {
    indices.push(ring[k], apex, ring[(k + 1) % seg]);
  }
}
