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
/** The same fade the coast uses, so a town and its shore go together. */
function hazeAt(distanceM: number, rangeNm: number): number {
  const rangeM = rangeNm * 1852;
  const from = rangeM * 0.55;
  const to = rangeM * 0.97;
  if (distanceM <= from) return 1;
  if (distanceM >= to) return 0;
  const t = (distanceM - from) / (to - from);
  return 1 - t * t * (3 - 2 * t);
}

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

/**
 * How many houses, and how far the town spreads, by what the place is.
 *
 * Exaggerated, like the land behind it and for the same reason. A real village
 * of sixteen huts three miles off is three or four pixels of pale smudge, and
 * the player has sailed two thousand miles to find it. These are about twice
 * the footprint and the buildings themselves stand higher than they stood, so
 * that raising a town reads as raising a town.
 */
const SPREAD: Record<string, { count: number; radius: number }> = {
  anchorage: { count: 14, radius: 150 },
  village: { count: 34, radius: 300 },
  town: { count: 80, radius: 600 },
  city: { count: 150, radius: 1050 },
  emporium: { count: 200, radius: 1400 },
};

/** How much higher than life the buildings are drawn. */
const BUILD_LIFT = 2.4;

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
  /** Its own material, so it can be faded and darkened on its own. */
  material: THREE.SpriteMaterial;
  /** Where the fire is, in the scene's metres. */
  x: number;
  z: number;
  y: number;
  /** How far up this puff sits, which sets how far the wind has carried it. */
  rise: number;
  /** Its size at the foot of the column, before the churn. */
  width: number;
  /** How tall the whole column is, which is what sets how far it leans. */
  tall: number;
  /** Phase, so the puffs of one column do not breathe together. */
  seed: number;
}

/**
 * One puff of smoke, with a ragged edge.
 *
 * A clean radial gradient reads as a smudge of fog. Smoke has lumps in it: the
 * texture is a handful of overlapping blobs, so a stack of them churns instead
 * of sliding, which is what makes a column look like it is boiling upward
 * rather than being dragged past.
 */
function smokeTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const blob = (cx: number, cy: number, r: number, a: number) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.5, `rgba(255,255,255,${a * 0.45})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  };
  const h = size / 2;
  blob(h, h, h * 0.92, 0.55);
  blob(h * 0.72, h * 0.78, h * 0.5, 0.55);
  blob(h * 1.28, h * 0.86, h * 0.44, 0.5);
  blob(h * 1.1, h * 1.26, h * 0.5, 0.5);
  blob(h * 0.8, h * 1.2, h * 0.38, 0.45);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/** How many fires are worth drawing, by what the place is. */
const SMOKES: Record<string, number> = {
  anchorage: 2, village: 3, town: 5, city: 8, emporium: 10,
};

/**
 * How high the smoke of each kind of place stands, in metres.
 *
 * Frankly enormous, and on purpose. A cooking fire's smoke is thirty metres and
 * invisible from a mile; what this is drawing is the *sign* of a town — the
 * thing that has to carry across twenty miles of sea and tell a lookout there
 * are people on that shore. It is the one piece of the coast the player is
 * allowed to see before he is committed, and at honest scale there is nothing
 * to see. A big place makes a bigger mark, which is at least the right shape of
 * lie.
 */
const SMOKE_HEIGHT: Record<string, number> = {
  anchorage: 420, village: 700, town: 1250, city: 1900, emporium: 2400,
};

export class Settlements {
  group = new THREE.Group();

  private material: THREE.MeshLambertMaterial;
  private smokeMap: THREE.Texture | null = null;
  /** How thick the haze is, for fading the plumes out at range. */
  private hazeIntensity = 0;
  private mesh: THREE.Mesh | null = null;
  private plumes: Plume[] = [];
  private lastOrigin: LatLon = { lat: 999, lon: 999 };
  private lastRangeNm = 0;
  private eyeM = 20;

  constructor() {
    this.material = new THREE.MeshLambertMaterial({
      vertexColors: true, transparent: true, depthWrite: true,
    });
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
    // The fourth component is the haze, as for the coast behind it: a town
    // dissolves before the edge of what is built rather than appearing at it.
    const withHaze: number[] = [];
    for (let i = 0, v = 0; i < colours.length; i += 3, v += 3) {
      const d = Math.hypot(positions[v], positions[v + 2]);
      withHaze.push(colours[i], colours[i + 1], colours[i + 2], hazeAt(d, rangeNm));
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(withHaze, 4));
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
      const w = (style.round ? rng.range(4.5, 7.5) : rng.range(6, 12)) * 1.5;
      const d = style.round ? w : rng.range(5, 10) * 1.5;
      const h = (style.round ? rng.range(2.4, 3.2) : rng.range(3.2, 6.5)) * BUILD_LIFT;
      place(alongM, backM, w, d, h, style.wall, style.roofColour, style.roof, style.round);
    }

    // The one building a lookout can see before any of the others, which is
    // exactly why towns built them where they did.
    if (style.landmark !== 'none') {
      // The landmark is the thing a lookout picks up first, so it is lifted
      // hardest: a minaret you can see at ten miles is the whole point of it.
      const tall = (style.landmark === 'minaret' ? 24
        : style.landmark === 'tower' ? 21 : 12) * BUILD_LIFT * 1.35;
      const wide = (style.landmark === 'minaret' ? 5
        : style.landmark === 'tower' ? 8 : 16) * 1.9;
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
      box(positions, colours, indices, x, base, z, 62, 62, 22, town.brg, WHITEWASH);
      for (const corner of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const cx = x + (alongX * corner[0] + backX * corner[1]) * 27;
        const cz = z + (alongZ * corner[0] + backZ * corner[1]) * 27;
        box(positions, colours, indices,
          cx, base, cz, 15, 15, 33, town.brg, WHITEWASH);
      }
    }
  }

  /**
   * The smokes, stacked one above another so the column leans away downwind as
   * it rises, which is what a plume does and what tells a watching ship where
   * the wind is over the land.
   */
  private buildSmoke(town: Town): void {
    if (!this.smokeMap) {
      const map = smokeTexture();
      if (!map) return;
      this.smokeMap = map;
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
      const tall = SMOKE_HEIGHT[town.def.size] ?? 700;
      const puffs = 9;
      for (let i = 0; i < puffs; i++) {
        const t = (i + 0.5) / puffs;
        // Its own material, so each puff can be darkened at the fire, thinned
        // as it rises, and faded out at range, which one shared material could
        // not do — and which is why the plumes used to arrive all at once at
        // full strength the moment a town came into the built circle.
        const material = new THREE.SpriteMaterial({
          map: this.smokeMap,
          transparent: true,
          depthWrite: false,
          // The scene's haze is not applied to it. Everything else on that
          // coast is meant to fade out at ten miles, and a smoke is meant not
          // to: it is the one mark a lookout could still pick up when the land
          // under it had gone soft, which is why landfalls were made on smokes.
          fog: false,
          // Sooty at the fire and going grey as it thins with height. Wood and
          // green brush burn dirty, and dark is what shows against a pale sky
          // at twenty miles — which is the whole job this is doing.
          // Black at the fire and only a little greyer at the top. Green brush
          // and wet wood burn filthy, and against a pale sky it is darkness
          // that carries, not shape: a pale plume twenty miles off is the sky.
          //
          // These are *linear* values and the renderer writes sRGB, which lifts
          // the bottom of the range enormously — a linear tenth comes out of
          // the screen as a third. Smoke set to a plausible-looking 0.2 arrived
          // as pale tan. This is what black has to be written as here.
          color: new THREE.Color(0.010 + t * 0.030, 0.0095 + t * 0.029, 0.009 + t * 0.027),
        });
        const sprite = new THREE.Sprite(material);
        const width = tall * (0.22 + t * 0.52);
        sprite.scale.set(width, width, 1);
        this.plumes.push({
          sprite, material, x, z,
          y: ground + tall * 0.06 + t * tall - drop,
          rise: t,
          width,
          tall,
          seed: rng.range(0, 100),
        });
        this.group.add(sprite);
      }
    }
  }

  /**
   * Carry the smoke: lean it downwind, let it boil as it goes up, and fade it
   * out at the edge of what is built.
   *
   * The boil is the thing that makes it read as smoke rather than as four
   * stacked blobs. Each puff swells and shrinks on its own clock and drifts a
   * little across the column, so the whole thing churns upward. It runs on the
   * rigging clock, which is real seconds, so a plume rolls at the same rate
   * whatever the game clock is doing.
   */
  setWind(fromDeg: number, knots: number, time: number): void {
    if (this.plumes.length === 0) return;
    const rad = ((fromDeg + 180) * Math.PI) / 180;
    // East and south components of where the wind is blowing to, in scene axes.
    const ex = Math.sin(rad), ez = -Math.cos(rad);
    // Enough lean to say which way the wind is over the land, not so much that
    // the column lies down along the beach and stops being a column.
    // Leaned as a fraction of its own height, so a big smoke and a small one
    // bend at the same angle. Leaning by a fixed number of metres stood the
    // little ones upright and folded the big ones flat along the beach.
    const lean = clamp(knots, 2, 30) / 42;
    const rangeM = this.lastRangeNm * 1852;
    for (const p of this.plumes) {
      const drift = p.rise * p.rise * p.tall * lean;
      const wobble = Math.sin(time * 0.33 + p.seed) * p.width * 0.14 * p.rise;
      const x = p.x + ex * drift + wobble;
      const z = p.z + ez * drift;
      p.sprite.position.set(x, p.y + Math.sin(time * 0.21 + p.seed * 0.7) * p.width * 0.05, z);
      // Boiling: each puff breathes, and the higher ones breathe wider.
      const swell = 1 + Math.sin(time * 0.5 + p.seed * 1.7) * 0.16 * (0.4 + p.rise);
      const w = p.width * swell;
      p.sprite.scale.set(w, w, 1);
      // Thick at the fire, thinning as it goes up, and gone before the edge of
      // the built world so nothing arrives at the boundary.
      const far = clamp(1 - Math.max(Math.hypot(x, z) - rangeM * 0.6, 0) / (rangeM * 0.37), 0, 1);
      p.material.opacity = (0.95 - p.rise * 0.3)
        * (1 - this.hazeIntensity * 0.3) * far * far;
    }
  }

  setFog(color: THREE.Color, intensity: number): void {
    this.hazeIntensity = clamp(intensity, 0, 0.7);
    this.material.color.setRGB(1, 1, 1).lerp(color, this.hazeIntensity);
  }

  clear(): void {
    for (const p of this.plumes) {
      this.group.remove(p.sprite);
      p.material.dispose();
    }
    this.plumes = [];
    if (!this.mesh) return;
    this.group.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh = null;
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
    this.smokeMap?.dispose();
    this.smokeMap = null;
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
