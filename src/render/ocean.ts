import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/math';

/**
 * Wave train. Eight Gerstner components spread either side of the wind, spanning
 * a wide enough range of wavelengths that there is real geometry at every scale
 * the player can see — long swell out to the horizon, short chop under the bow.
 */
const WAVE_COUNT = 8;

/** How many points of the ship's recent track the wake is measured against. */
const TRACK_POINTS = 18;

const SPREAD = [0, 26, -32, 58, -64, 88, -96, 150];
const WAVELENGTH_SCALE = [1.0, 0.64, 0.42, 0.26, 0.155, 0.092, 0.055, 2.6];
const AMPLITUDE_SCALE = [1.0, 0.66, 0.45, 0.29, 0.185, 0.115, 0.07, 0.42];

export interface OceanParams {
  /** Direction the wind blows from, degrees. */
  windFrom: number;
  /** Significant wave height, metres. */
  waveHeight: number;
  /** Direction the dominant swell comes from, degrees. */
  swellFrom: number;
  windKnots: number;
}

export interface WakeParams {
  /** Ship's forward direction in world XZ. */
  dirX: number;
  dirZ: number;
  /** 0 to 1, how hard she is driving. */
  strength: number;
  halfBeam: number;
  halfLength: number;
  /** Height of the rig, which decides how far her shadow is thrown. */
  rigHeight: number;
  /** How hard the sun is casting, 0 when it is overcast or on the horizon. */
  shadow: number;
}

/**
 * Wake geometry, shared by both shader stages so the raised bow wave and the
 * foam that marks it stay registered with one another.
 */
const wakeGlsl = /* glsl */ `
uniform vec2 uWakeDir;
uniform float uWakeStrength;
uniform float uShipHalfBeam;
uniform float uShipHalfLength;
uniform vec2 uTrack[${TRACK_POINTS}];
uniform float uTrackAge[${TRACK_POINTS}];
uniform int uTrackCount;

/**
 * Foam and displacement from the ship.
 *
 * The wake is measured against the track she actually sailed, held as a short
 * history of where she has been, rather than against her present heading. Water
 * she disturbed two minutes ago stays disturbed where it was: put the helm over
 * and the wake bends astern of her instead of swinging round like a searchlight.
 *
 * x: foam coverage, y: surface displacement in metres.
 */
vec2 wakeAt(vec2 rel) {
  if (uWakeStrength < 0.002) return vec2(0.0);
  // Everything past this is open water: skip the whole track search for it.
  if (dot(rel, rel) > 300.0 * 300.0) return vec2(0.0);

  // Nearest point on the track, and how long ago she laid it down.
  float bestD = 1.0e9;
  float bestAge = 0.0;
  for (int i = 0; i < ${TRACK_POINTS - 1}; i++) {
    if (i + 1 >= uTrackCount) break;
    vec2 a = uTrack[i];
    vec2 b = uTrack[i + 1];
    vec2 ab = b - a;
    float denom = max(dot(ab, ab), 1.0e-4);
    float t = clamp(dot(rel - a, ab) / denom, 0.0, 1.0);
    float d = length(rel - (a + ab * t));
    if (d < bestD) {
      bestD = d;
      bestAge = mix(uTrackAge[i], uTrackAge[i + 1], t);
    }
  }

  // The wake spreads and dies as it ages.
  float halfWidth = uShipHalfBeam * 0.85 + bestAge * 0.42;
  float fade = exp(-bestAge / (7.0 + uWakeStrength * 16.0));
  float edge = abs(bestD - halfWidth);

  float shoulders = exp(-edge * edge / 2.4) * fade;
  float centre = (1.0 - smoothstep(halfWidth * 0.2, halfWidth, bestD))
               * exp(-bestAge / (3.5 + uWakeStrength * 7.0)) * 0.55;

  // The bow throws water aside just forward of the stem, which is fixed to her
  // and so is still measured from her heading.
  float along = dot(rel, uWakeDir);
  float across = dot(rel, vec2(uWakeDir.y, -uWakeDir.x));
  float bowAlong = along - uShipHalfLength * 0.72;
  float bow = exp(-(bowAlong * bowAlong) / 9.0)
            * exp(-(across * across) / max(uShipHalfBeam * uShipHalfBeam * 1.4, 1.0));

  float foam = clamp((shoulders * 0.95 + centre + bow * 1.2) * uWakeStrength, 0.0, 1.0);

  // She piles water up at the bow and leaves a trough astern of it.
  float lift = bow * 0.55 - centre * 0.42 + shoulders * 0.18;
  return vec2(foam, lift * uWakeStrength * (uShipHalfBeam * 0.42));
}
`;

const vertexShader = /* glsl */ `
uniform vec2 uNoiseOrigin;
uniform vec2 uDir[${WAVE_COUNT}];
uniform float uAmp[${WAVE_COUNT}];
uniform float uLen[${WAVE_COUNT}];
uniform float uSteep[${WAVE_COUNT}];
uniform float uPhase[${WAVE_COUNT}];

${wakeGlsl}

varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
varying float vDist;
varying vec2 vSurface;
varying vec2 vLocal;

void main() {
  vec3 pos = position;
  // Wave phase is carried in uPhase, already wrapped into a single turn on the
  // CPU. Feeding absolute distance and absolute time into a float32 sine loses
  // every bit of precision and freezes the sea solid.
  vec2 p = pos.xz;
  vSurface = p + uNoiseOrigin;

  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  float crest = 0.0;

  float d = length(pos.xz);
  // Short components are dropped in the far field, where the mesh cannot carry
  // them and they would only alias.
  float nearFade = 1.0 - smoothstep(120.0, 1600.0, d);
  float farFade = 1.0 - smoothstep(2200.0, 9500.0, d);

  for (int i = 0; i < ${WAVE_COUNT}; i++) {
    float k = 6.28318530718 / uLen[i];
    vec2 dir = uDir[i];
    float f = k * dot(dir, p) + uPhase[i];

    // Wavelengths under about eight metres only survive close to the camera.
    float scaleFade = mix(farFade, nearFade, clamp((14.0 - uLen[i]) / 12.0, 0.0, 1.0));
    float a = uAmp[i] * scaleFade;
    float s = uSteep[i];

    float sinf = sin(f);
    float cosf = cos(f);

    pos.x += dir.x * (a * s) * cosf;
    pos.z += dir.y * (a * s) * cosf;
    pos.y += a * sinf;

    float wa = k * a;
    tangent += vec3(
      -dir.x * dir.x * (s * wa) * sinf,
      dir.x * wa * cosf,
      -dir.x * dir.y * (s * wa) * sinf
    );
    binormal += vec3(
      -dir.x * dir.y * (s * wa) * sinf,
      dir.y * wa * cosf,
      -dir.y * dir.y * (s * wa) * sinf
    );

    crest += max(0.0, sinf) * a;
  }

  // Only the displacement is taken per-vertex. The foam is evaluated per-pixel
  // in the fragment stage, because far-field triangles are hundreds of metres
  // across and interpolating foam over them smears the wake into a solid sheet.
  pos.y += wakeAt(position.xz).y;
  vLocal = position.xz;

  vNormal = normalize(cross(binormal, tangent));
  vWorld = pos;
  vCrest = crest;
  vDist = d;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const fragmentShader = /* glsl */ `
${wakeGlsl}

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uHorizonColor;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform float uCrestMax;
uniform float uFoamThreshold;
uniform float uNight;
uniform float uFogDensity;
uniform vec3 uFogColor;
uniform float uNoiseTime;
uniform vec2 uChopDir;
uniform float uChop;
uniform float uRigHeight;
uniform float uShadow;

varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
varying float vDist;
varying vec2 vSurface;
varying vec2 vLocal;

// Ripple detail finer than the mesh can carry, as a normal perturbation.
vec2 chopNormal(vec2 q, float t) {
  vec2 n = vec2(0.0);
  n.x += sin(q.x * 0.42 + t * 1.5) * 0.60;
  n.y += cos(q.y * 0.38 - t * 1.3) * 0.60;
  n.x += sin(dot(q, vec2(0.62, 0.54)) * 1.0 - t * 2.2) * 0.42;
  n.y += cos(dot(q, vec2(-0.48, 0.66)) * 1.1 + t * 1.9) * 0.42;
  n.x += sin(dot(q, vec2(1.7, -0.9)) * 1.0 + t * 3.4) * 0.24;
  n.y += cos(dot(q, vec2(0.8, 1.6)) * 1.0 - t * 3.0) * 0.24;
  n.x += sin(dot(q, vec2(3.1, 2.2)) * 1.0 - t * 5.1) * 0.13;
  n.y += cos(dot(q, vec2(-2.6, 2.9)) * 1.0 + t * 4.6) * 0.13;
  return n;
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorld);

  // Ripple, at three ranges so the texture holds up as it recedes.
  float near = 1.0 - smoothstep(40.0, 340.0, vDist);
  float mid = (1.0 - smoothstep(300.0, 1500.0, vDist)) * 0.55;
  vec2 detail = vec2(0.0);
  if (near + mid > 0.004) {
    detail = chopNormal(vSurface, uNoiseTime) * near
           + chopNormal(vSurface * 0.27 + 41.0, uNoiseTime * 0.55) * (mid + near * 0.5);
  }
  n = normalize(n + vec3(detail.x, 0.0, detail.y) * 0.17 * clamp(uChop, 0.12, 1.1));

  float ndv = max(dot(n, viewDir), 0.0);
  float fresnel = mix(0.02, 1.0, pow(1.0 - ndv, 5.0));

  float slope = clamp(n.y, 0.0, 1.0);
  vec3 body = mix(uDeepColor, uShallowColor, pow(slope, 3.0) * 0.55);

  vec3 reflDir = reflect(-viewDir, n);
  float up = clamp(reflDir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 sky = mix(uHorizonColor, uSkyColor, pow(up, 0.7));

  // Sun glitter: a scattered track of individual reflections, not a mirror disc.
  float sunDot = max(dot(reflDir, uSunDir), 0.0);
  float sparkle = 0.55 + 0.45 * sin(vSurface.x * 3.1 + uNoiseTime * 4.3)
                              * sin(vSurface.y * 2.7 - uNoiseTime * 3.7);
  float spec = pow(sunDot, 90.0) * 0.8 * mix(1.0, sparkle, clamp(uChop, 0.0, 1.0));
  float sheen = pow(sunDot, 11.0) * 0.14;

  vec3 col = mix(body, sky, fresnel * 0.70);
  col += uSunColor * (spec + sheen) * (1.0 - uNight * 0.82);

  // Light carried through the back of a wave, which is what makes a sea look
  // like water rather than like painted metal.
  float through = pow(max(dot(viewDir, -uSunDir), 0.0), 3.0);
  float lift = clamp(vWorld.y / max(uCrestMax, 0.2), 0.0, 1.0);
  col += vec3(0.05, 0.22, 0.17) * through * lift * 0.9 * (1.0 - uNight);

  // Foam, but only where a crest is steep enough to be tumbling. Whitecaps do
  // not appear below about force four, and even in a gale they are scattered
  // patches and downwind streaks rather than a covering of white, so the crest
  // test is broken up by a moving noise field.
  float crest = vCrest / max(uCrestMax, 0.001);
  float mottle = 0.55 + 0.45 * sin(vSurface.x * 0.21 + uNoiseTime * 0.5)
                            * sin(vSurface.y * 0.17 - uNoiseTime * 0.41)
                     + 0.22 * sin(dot(vSurface, vec2(0.44, -0.38)) - uNoiseTime * 1.3);
  float breaking = smoothstep(uFoamThreshold, uFoamThreshold + 0.13, crest * mottle);
  // Foam lingers on the back of the crest that made it.
  breaking *= smoothstep(-0.1, 0.35, n.y * 0.3 + vWorld.y / max(uCrestMax, 0.3));
  breaking *= 1.0 - smoothstep(900.0, 4000.0, vDist);

  // Wake and bow foam, textured so it reads as bubbles rather than paint.
  float bubbles = 0.74
    + 0.16 * sin(dot(vSurface, vec2(1.7, 2.3)) + uNoiseTime * 2.6)
    + 0.13 * sin(dot(vSurface, vec2(-2.9, 1.1)) - uNoiseTime * 3.4)
    + 0.10 * sin(dot(vSurface, vec2(4.3, 5.1)) + uNoiseTime * 5.2);
  float wake = clamp(wakeAt(vLocal).x * bubbles * 1.2, 0.0, 1.0);

  float foam = clamp(breaking * 0.72 + wake, 0.0, 1.0);
  vec3 foamColor = vec3(0.93, 0.96, 0.98) * (1.0 - uNight * 0.82);
  col = mix(col, foamColor, foam * 0.78);

  // Wind streaks running downwind, the long pale lines a breeze draws on water.
  float streak = sin(dot(vSurface, uChopDir) * 0.06 + uNoiseTime * 0.4)
               * sin(dot(vSurface, vec2(-uChopDir.y, uChopDir.x)) * 0.9 - uNoiseTime * 1.1);
  col *= 1.0 + streak * 0.05 * uChop * (1.0 - smoothstep(200.0, 2200.0, vDist));

  // The ship's shadow on the water. The ocean is a custom shader and takes no
  // part in the shadow map, so the silhouette is projected analytically: she is
  // the only thing in the scene casting anything, and her hull and her rig throw
  // their shadows to different distances.
  if (uSunDir.y > 0.08 && uShadow > 0.01) {
    vec2 sunOff = uSunDir.xz / max(uSunDir.y, 0.12);
    vec2 fwd = uWakeDir;
    vec2 side = vec2(uWakeDir.y, -uWakeDir.x);

    vec2 qh = vLocal + sunOff * (uShipHalfBeam * 0.9);
    vec2 hullUv = vec2(dot(qh, fwd) / uShipHalfLength, dot(qh, side) / uShipHalfBeam);
    float hull = 1.0 - smoothstep(0.7, 1.1, length(hullUv));

    vec2 qr = vLocal + sunOff * uRigHeight;
    vec2 rigUv = vec2(dot(qr, fwd) / (uShipHalfLength * 0.9),
                      dot(qr, side) / (uShipHalfBeam * 2.6));
    float rig = (1.0 - smoothstep(0.35, 1.25, length(rigUv))) * 0.7;

    col *= 1.0 - clamp(max(hull, rig), 0.0, 1.0) * 0.42 * uShadow;
  }

  float fog = 1.0 - exp(-vDist * uFogDensity);
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}
`;

export class Ocean {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;

  private dirs: THREE.Vector2[] = [];
  private amps: number[] = [];
  private lens: number[] = [];
  private steeps: number[] = [];
  private phases: number[] = [];

  /** Distance travelled, in metres. Kept in doubles; never sent to the GPU raw. */
  private originE = 0;
  private originN = 0;
  private simTime = 0;
  private track: { x: number; z: number; age: number }[] = [{ x: 0, z: 0, age: 0 }];

  constructor() {
    const geometry = buildRadialGrid(256, 210, 1.6, 12000);

    this.dirs = Array.from({ length: WAVE_COUNT }, () => new THREE.Vector2(1, 0));
    this.amps = new Array(WAVE_COUNT).fill(0.4);
    this.lens = new Array(WAVE_COUNT).fill(40);
    this.steeps = new Array(WAVE_COUNT).fill(0.4);
    this.phases = new Array(WAVE_COUNT).fill(0);

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uNoiseTime: { value: 0 },
        uNoiseOrigin: { value: new THREE.Vector2(0, 0) },
        uDir: { value: this.dirs },
        uAmp: { value: this.amps },
        uLen: { value: this.lens },
        uSteep: { value: this.steeps },
        uPhase: { value: this.phases },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
        uSkyColor: { value: new THREE.Color(0.28, 0.45, 0.72) },
        uHorizonColor: { value: new THREE.Color(0.6, 0.72, 0.85) },
        uDeepColor: { value: new THREE.Color(0.006, 0.029, 0.058) },
        uShallowColor: { value: new THREE.Color(0.022, 0.115, 0.155) },
        uCrestMax: { value: 1.2 },
        uFoamThreshold: { value: 1.0 },
        uNight: { value: 0 },
        uFogDensity: { value: 0.00006 },
        uFogColor: { value: new THREE.Color(0.6, 0.72, 0.85) },
        uChopDir: { value: new THREE.Vector2(1, 0) },
        uChop: { value: 0.5 },
        uWakeDir: { value: new THREE.Vector2(0, -1) },
        uWakeStrength: { value: 0 },
        uShipHalfBeam: { value: 3 },
        uShipHalfLength: { value: 9 },
        uRigHeight: { value: 18 },
        uShadow: { value: 1 },
        uTrack: { value: Array.from({ length: TRACK_POINTS }, () => new THREE.Vector2()) },
        uTrackAge: { value: new Array(TRACK_POINTS).fill(0) },
        uTrackCount: { value: 0 },
      },
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0;
    this.mesh.receiveShadow = true;
  }

  /** Recompute the wave train for the current weather. */
  setSea(p: OceanParams): void {
    const baseAmp = clamp(p.waveHeight, 0.05, 14) * 0.34;
    // Fully developed wavelength grows with the square of wind speed.
    const baseLen = clamp(6 + p.windKnots * p.windKnots * 0.34, 12, 420);

    for (let i = 0; i < WAVE_COUNT; i++) {
      const isSwell = i === WAVE_COUNT - 1;
      const fromDeg = (isSwell ? p.swellFrom : p.windFrom) + SPREAD[i];
      const towardRad = ((fromDeg + 180) * Math.PI) / 180;
      this.dirs[i].set(Math.sin(towardRad), Math.cos(towardRad));

      this.lens[i] = Math.max(baseLen * WAVELENGTH_SCALE[i], 1.6);
      this.amps[i] = baseAmp * AMPLITUDE_SCALE[i] * (isSwell ? 1.05 : 1);
      // Steepness must stay below one or the surface folds through itself.
      // Short components carry more of it, which is what makes chop look sharp.
      this.steeps[i] = clamp(0.62 - i * 0.03, 0.12, 0.85) / (WAVE_COUNT * 0.42);
    }

    this.material.uniforms.uCrestMax.value = Math.max(
      this.amps.reduce((s, a) => s + a, 0), 0.02,
    );
    this.material.uniforms.uFoamThreshold.value =
      lerp(1.10, 0.62, smoothstep(11, 48, p.windKnots));

    const chopRad = ((p.windFrom + 180) * Math.PI) / 180;
    (this.material.uniforms.uChopDir.value as THREE.Vector2)
      .set(Math.sin(chopRad), Math.cos(chopRad));
    this.material.uniforms.uChop.value = clamp(p.windKnots / 26, 0, 1.3);

    this.syncPhases();
  }

  /** Tell the water where the ship is pushing it aside and where her shadow falls. */
  setWake(w: WakeParams): void {
    (this.material.uniforms.uWakeDir.value as THREE.Vector2).set(w.dirX, w.dirZ);
    this.material.uniforms.uWakeStrength.value = clamp(w.strength, 0, 1);
    this.material.uniforms.uShipHalfBeam.value = w.halfBeam;
    this.material.uniforms.uShipHalfLength.value = w.halfLength;
    this.material.uniforms.uRigHeight.value = w.rigHeight;
    this.material.uniforms.uShadow.value = clamp(w.shadow, 0, 1);
  }

  /**
   * Update the ship's recent track, in the water's frame. The ship is held at
   * the origin and the sea slides past her, so every point already laid down is
   * carried astern by her own motion over the ground.
   */
  updateTrack(velocityE: number, velocityN: number, dt: number): void {
    if (dt <= 0) return;
    const dx = -velocityE * dt;
    const dz = velocityN * dt;

    for (const p of this.track) {
      p.x += dx;
      p.z += dz;
      p.age += dt;
    }

    // A new point whenever she has run far enough for the track to bend.
    const head = this.track[0];
    if (!head || Math.hypot(head.x, head.z) > 6) {
      this.track.unshift({ x: 0, z: 0, age: 0 });
    }
    while (this.track.length > TRACK_POINTS) this.track.pop();
    // Drop the tail once it has faded out anyway.
    while (this.track.length > 2 && this.track[this.track.length - 1].age > 70) {
      this.track.pop();
    }

    const pts = this.material.uniforms.uTrack.value as THREE.Vector2[];
    const ages = this.material.uniforms.uTrackAge.value as number[];

    // Until she has run far enough to have a real track, the tail is carried on
    // in the direction she is going, so a ship that has just got under way still
    // leaves something astern instead of sitting in a puddle.
    const speed = Math.hypot(velocityE, velocityN);
    const tailX = speed > 0.05 ? (velocityE / speed) * -1 : 0;
    const tailZ = speed > 0.05 ? (velocityN / speed) : 0;
    const last = this.track[this.track.length - 1];
    const step = 7;

    for (let i = 0; i < TRACK_POINTS; i++) {
      if (i < this.track.length) {
        const p = this.track[i];
        pts[i].set(p.x, p.z);
        ages[i] = p.age;
      } else {
        const n = i - this.track.length + 1;
        pts[i].set(last.x + tailX * step * n, last.z + tailZ * step * n);
        ages[i] = last.age + (step * n) / Math.max(speed, 0.6);
      }
    }
    this.material.uniforms.uTrackCount.value = TRACK_POINTS;
  }

  /** Move the wave field so the water flows past a ship held at the origin. */
  setOrigin(east: number, north: number): void {
    this.originE = east;
    this.originN = north;
  }

  setTime(t: number): void {
    this.simTime = t;
  }

  /**
   * Fold the ship's travelled distance and the simulation time into a single
   * wrapped phase per wave.
   *
   * Both quantities grow without bound — a voyage runs to millions of metres and
   * the clock counts seconds since 1430 — and a float32 sine of a number that
   * large returns nothing but quantisation noise, which freezes the whole sea.
   * Doing the arithmetic here in doubles and handing the GPU only the fraction
   * of a turn keeps every wavelength exact for as long as the voyage lasts.
   */
  private syncPhases(): void {
    const TAU = Math.PI * 2;
    for (let i = 0; i < WAVE_COUNT; i++) {
      const k = TAU / this.lens[i];
      const c = Math.sqrt(9.81 / k);
      const d = this.dirs[i];
      const spatial = k * (d.x * this.originE + d.y * -this.originN);
      const temporal = k * c * this.simTime;
      this.phases[i] = ((spatial - temporal) % TAU + TAU) % TAU;
    }
    // The decorative noise fields are wrapped too, well inside float precision.
    (this.material.uniforms.uNoiseOrigin.value as THREE.Vector2).set(
      wrap(this.originE, 20000), wrap(-this.originN, 20000),
    );
    this.material.uniforms.uNoiseTime.value = wrap(this.simTime, 4096);
  }

  setLighting(
    sunDir: THREE.Vector3, sunColor: THREE.Color, sky: THREE.Color,
    horizon: THREE.Color, night: number, fogDensity: number,
  ): void {
    (this.material.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir);
    (this.material.uniforms.uSunColor.value as THREE.Color).copy(sunColor);
    (this.material.uniforms.uSkyColor.value as THREE.Color).copy(sky);
    (this.material.uniforms.uHorizonColor.value as THREE.Color).copy(horizon);
    (this.material.uniforms.uFogColor.value as THREE.Color).copy(horizon);
    this.material.uniforms.uNight.value = night;
    this.material.uniforms.uFogDensity.value = fogDensity;

    const deep = this.material.uniforms.uDeepColor.value as THREE.Color;
    deep.setRGB(0.006, 0.029, 0.058).multiplyScalar(1 - night * 0.72);
    const shallow = this.material.uniforms.uShallowColor.value as THREE.Color;
    shallow.setRGB(0.022, 0.115, 0.155).multiplyScalar(1 - night * 0.7);
  }

  /**
   * Surface height and normal at a point, matching the shader so the ship sits
   * in the water rather than on it. The wake is deliberately left out: she does
   * not ride her own bow wave.
   */
  sample(x: number, z: number): { height: number; normal: THREE.Vector3 } {
    let height = 0;
    const tangent = new THREE.Vector3(1, 0, 0);
    const binormal = new THREE.Vector3(0, 0, 1);

    for (let i = 0; i < WAVE_COUNT; i++) {
      const k = (2 * Math.PI) / this.lens[i];
      const d = this.dirs[i];
      // Same phase the shader uses, so she floats on the water that is drawn.
      const f = k * (d.x * x + d.y * z) + this.phases[i];
      const a = this.amps[i];
      const s = this.steeps[i];
      const sinf = Math.sin(f);
      const cosf = Math.cos(f);

      height += a * sinf;

      const wa = k * a;
      tangent.x += -d.x * d.x * (s * wa) * sinf;
      tangent.y += d.x * wa * cosf;
      tangent.z += -d.x * d.y * (s * wa) * sinf;
      binormal.x += -d.x * d.y * (s * wa) * sinf;
      binormal.y += d.y * wa * cosf;
      binormal.z += -d.y * d.y * (s * wa) * sinf;
    }

    const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();
    return { height, normal };
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/** Wrap to [-limit, limit), keeping large accumulators inside float precision. */
function wrap(v: number, limit: number): number {
  const span = limit * 2;
  return ((v + limit) % span + span) % span - limit;
}

/**
 * Radial grid: dense under the ship, coarse toward the horizon. The near field
 * is spaced almost linearly so short chop has enough vertices to survive, and
 * only the far field falls away exponentially.
 */
function buildRadialGrid(
  thetaSteps: number, radialSteps: number, inner: number, outer: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  positions.push(0, 0, 0);

  const nearBand = 0.58;
  const nearOuter = 420;

  for (let r = 0; r < radialSteps; r++) {
    const t = r / (radialSteps - 1);
    let radius: number;
    if (t < nearBand) {
      radius = inner + (nearOuter - inner) * Math.pow(t / nearBand, 1.7);
    } else {
      const e = (t - nearBand) / (1 - nearBand);
      radius = nearOuter * Math.pow(outer / nearOuter, e);
    }
    for (let a = 0; a < thetaSteps; a++) {
      const th = (a / thetaSteps) * Math.PI * 2;
      positions.push(Math.cos(th) * radius, 0, Math.sin(th) * radius);
    }
  }

  for (let a = 0; a < thetaSteps; a++) {
    const next = (a + 1) % thetaSteps;
    indices.push(0, 1 + next, 1 + a);
  }

  for (let r = 0; r < radialSteps - 1; r++) {
    const base = 1 + r * thetaSteps;
    const nextBase = base + thetaSteps;
    for (let a = 0; a < thetaSteps; a++) {
      const an = (a + 1) % thetaSteps;
      indices.push(base + a, nextBase + an, nextBase + a);
      indices.push(base + a, base + an, nextBase + an);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}
