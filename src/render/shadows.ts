import * as THREE from 'three';

/**
 * The second shadow: the world's.
 *
 * The first one (see renderer.ts) is a box a few ship-lengths across, sharp
 * enough to put the shadow of a shroud on the deck. It is no use for anything
 * further off than the bowsprit, and the coast and towns are all further off.
 * This is a second, coarser orthographic shadow map about a kilometre across
 * that holds the ship, the land, the buildings and the trees, and which the
 * land, the settlements and the trees receive: a headland that throws its
 * shadow across the next bay at dusk, a house that shades its own street.
 *
 * Why a second light and not a second map on the first. Three gives every
 * shadow-casting light its own map, camera and bias, and gives every lit
 * material the code to read them all, so a second light is the cheapest way to
 * get a second map out of the stock renderer. That light carries no light of its
 * own (zero colour). The land's own shader is patched to do two things with
 * the loop over directional lights: ignore the first light (the ship's box has
 * no business shading a hillside) and light itself from the first light's
 * colour through the second light's shadow. The ship's materials are
 * untouched, so for them the second light is simply a black one.
 *
 * Stable, not shimmering: the box is slid in whole texels along the light's own
 * axes, measured in the frame the coast is built in, so the map's texels are
 * fixed to the ground and the edge of a shadow stays where it is while the ship
 * moves; and the shadow is faded out toward the edge of the box rather than
 * stopping there.
 */

/** Matches the line in three's light loop that applies a directional light's shadow. */
const DIR_SHADOW_LINE =
  /directLight\.color \*= \( directLight\.visible && receiveShadow \) \? getShadow\( directionalShadowMap\[ i \], directionalLightShadow\.shadowMapSize, directionalLightShadow\.shadowIntensity, directionalLightShadow\.shadowBias, directionalLightShadow\.shadowRadius, vDirectionalShadowCoord\[ i \] \) : 1\.0;/;

let patchedBegin: string | null | undefined;

/** three's `lights_fragment_begin` with the directional loop rewritten, or null if three has changed shape. */
function lightsBeginForLand(): string | null {
  if (patchedBegin !== undefined) return patchedBegin;
  const src = THREE.ShaderChunk.lights_fragment_begin;
  if (!DIR_SHADOW_LINE.test(src)) return (patchedBegin = null);
  patchedBegin = src.replace(DIR_SHADOW_LINE, (original) => `
    #if NUM_DIR_LIGHT_SHADOWS > 1
      #if UNROLLED_LOOP_INDEX == 0
        directLight.color = vec3( 0.0 );
      #else
      {
        vec4 wsc = vDirectionalShadowCoord[ i ];
        vec3 wp = wsc.xyz / wsc.w;
        float edge = max( abs( wp.x - 0.5 ), abs( wp.y - 0.5 ) ) * 2.0;
        float ws = 1.0;
        if ( receiveShadow && directLight.visible ) {
          ws = getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] );
          ws = mix( 1.0, ws, 1.0 - smoothstep( 0.7, 0.98, edge ) );
          // Ground at a grazing angle to the light shades itself in stripes however the bias is set;
          // it is dark enough by its own cosine, so the map has no say in it.
          ws = mix( 1.0, ws, smoothstep( 0.15, 0.5, dot( normal, directLight.direction ) ) );
        }
        directLight.color = directionalLights[ 0 ].color * ws;
      }
      #endif
    #else
      ${original}
    #endif
  `);
  return patchedBegin;
}

/** Make a Lambert material take the world's shadow. Harmless where there is only one shadowing light. */
export function receiveWorldShadow(m: THREE.MeshLambertMaterial): void {
  const chunk = lightsBeginForLand();
  if (!chunk) return;
  const prior = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prior?.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', chunk);
  };
  const key = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${key.call(m)}|world-shadow`;
}

/** The two shadow cameras, so a mesh can tell which of them is drawing it. */
export const SHADOW_CAMS: { tight: THREE.Camera | null; wide: THREE.Camera | null; wideHasShip: boolean } = {
  tight: null, wide: null, wideHasShip: true,
};

/**
 * Leave a mesh out of one of the shadow passes. Three renders every shadow-casting object into every
 * shadow-casting light's map, whatever the map is for, and the ground drawn again into the ship's
 * box (where it falls outside the box and is thrown away by the GPU) and the ship's seventy-odd
 * meshes drawn again into the world's map are most of what a second cascade would cost. A mesh may
 * veto its own draw in the hook before it: a negative draw range is refused before any GL call.
 */
function skipWhen(m: THREE.Object3D, skip: (shadowCamera: THREE.Camera) => boolean): void {
  let saved = Infinity;
  m.onBeforeShadow = (_r, _o, _c, shadowCamera, geometry) => {
    if (skip(shadowCamera)) { saved = geometry.drawRange.count; geometry.drawRange.count = -1; }
  };
  m.onAfterShadow = (_r, _o, _c, shadowCamera, geometry) => {
    if (skip(shadowCamera)) geometry.drawRange.count = saved;
  };
}

/** Ground, buildings and trees: in the world's map, not the ship's. */
export function worldOnly(m: THREE.Object3D): void {
  skipWhen(m, (c) => c === SHADOW_CAMS.tight);
}

/** A ship's parts: always in her own map; in the world's only when she is near enough to land to shade it. */
export function shipParts(root: THREE.Object3D): void {
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) skipWhen(o, (c) => c === SHADOW_CAMS.wide && !SHADOW_CAMS.wideHasShip); });
}

export interface WorldShadowSpec {
  /** Edge of the map, texels; 0 turns the world shadow off. */
  size: number;
  /** Half the box's edge, metres. */
  radius: number;
}

/** The second light, its box and its snapping. */
export class WorldShadow {
  readonly light = new THREE.DirectionalLight(0x000000, 0);
  private spec: WorldShadowSpec = { size: 0, radius: 1100 };
  private onScene = false;
  private lastKey = '';
  private frame = 0;
  private readonly dir = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  /** Bytes the map occupies: an RGBA8 colour plane and a 24-bit depth plane. */
  get bytes(): number {
    return this.onScene && this.light.shadow.map ? this.spec.size * this.spec.size * 8 : 0;
  }

  constructor(private scene: THREE.Scene) {
    this.light.castShadow = true;
    // Texels are about a metre, so the bias is in metres' worth of depth range, not the ship's
    // few centimetres: too little and every slope shades itself in stripes, too much and a
    // house detaches from its shadow.
    this.light.shadow.bias = -0.00008;
    this.light.shadow.normalBias = 1.2;
    this.light.shadow.radius = 1.5;
    SHADOW_CAMS.wide = this.light.shadow.camera;
  }

  get active(): boolean { return this.onScene; }

  /** Apply a quality level. Adds or removes the light, which recompiles lit materials once. */
  configure(spec: WorldShadowSpec): void {
    const had = this.spec.size;
    this.spec = spec;
    if (spec.size <= 0) {
      if (this.onScene) {
        this.scene.remove(this.light);
        this.scene.remove(this.light.target);
        this.onScene = false;
      }
      this.light.shadow.map?.dispose();
      this.light.shadow.map = null;
      return;
    }
    if (!this.onScene) {
      this.scene.add(this.light);
      this.scene.add(this.light.target);
      this.onScene = true;
    }
    const sh = this.light.shadow;
    if (had !== spec.size || sh.mapSize.x !== spec.size) {
      sh.mapSize.set(spec.size, spec.size);
      sh.map?.dispose();
      sh.map = null;
    }
    const c = sh.camera;
    c.left = -spec.radius; c.right = spec.radius; c.top = spec.radius; c.bottom = -spec.radius;
    c.updateProjectionMatrix();
    this.lastKey = '';
  }

  /**
   * Aim the box.
   * @param sunDir unit vector toward the key light
   * @param local where the ship is in the land's own frame, metres; the frame the box is snapped in
   * @param offset the land group's position, which carries that frame into the scene
   * @param strength 0 to 1, the key light's shadow strength
   * @param castable whether the key light is casting at all
   */
  update(sunDir: THREE.Vector3, local: THREE.Vector2, offset: THREE.Vector3, strength: number, castable: boolean): void {
    if (!this.onScene) return;
    const sh = this.light.shadow;
    sh.intensity = strength;
    this.light.castShadow = castable;
    if (!castable) return;

    this.dir.copy(sunDir).normalize();
    // The light's own axes: right and up across the picture the light sees.
    this.right.set(0, 1, 0).cross(this.dir);
    if (this.right.lengthSq() < 1e-6) this.right.set(1, 0, 0);
    this.right.normalize();
    this.up.crossVectors(this.dir, this.right).normalize();

    // Snap the centre, in the land's frame, to whole texels along those axes.
    const texel = (2 * this.spec.radius) / this.spec.size;
    this.tmp.set(local.x, 0, local.y);
    const u = this.tmp.dot(this.right);
    const v = this.tmp.dot(this.up);
    const su = Math.round(u / texel) * texel;
    const sv = Math.round(v / texel) * texel;
    // Centre in scene coordinates: snapped point in the land's frame, carried by the land's offset.
    const cx = this.tmp.x + (su - u) * this.right.x + (sv - v) * this.up.x + offset.x;
    const cy = this.tmp.y + (su - u) * this.right.y + (sv - v) * this.up.y;
    const cz = this.tmp.z + (su - u) * this.right.z + (sv - v) * this.up.z + offset.z;

    // How far back along the light the box must reach to catch the highest ground that can
    // throw a shadow into it: a thousand metres of hill at a sun ten degrees up is six kilometres.
    const back = THREE.MathUtils.clamp(900 / Math.max(this.dir.y, 0.1), 1500, 8000);
    this.light.target.position.set(cx, cy, cz);
    this.light.position.set(cx + this.dir.x * back, cy + this.dir.y * back, cz + this.dir.z * back);
    const cam = sh.camera;
    const far = back + this.spec.radius * 1.5;
    if (Math.abs(cam.far - far) > 1) { cam.near = 10; cam.far = far; cam.updateProjectionMatrix(); }

    // Re-draw the map only when it has something new to show: a different texel, a different sun, or
    // (the ship being in it) every other frame.
    const key = `${su.toFixed(3)},${sv.toFixed(3)},${this.dir.x.toFixed(4)},${this.dir.y.toFixed(4)}`;
    this.frame++;
    sh.autoUpdate = false;
    if (key !== this.lastKey || (this.frame & 1) === 0 || !sh.map) {
      sh.needsUpdate = true;
      this.lastKey = key;
    }
  }
}
