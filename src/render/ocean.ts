import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/math';

/**
 * Wave train. Six Gerstner components spread either side of the wind give a
 * sea that is directional without looking like a corrugated roof.
 */
const WAVE_COUNT = 6;

const SPREAD = [0, 28, -34, 62, -68, 140];
const WAVELENGTH_SCALE = [1.0, 0.62, 0.44, 0.28, 0.19, 0.75];
const AMPLITUDE_SCALE = [1.0, 0.62, 0.42, 0.27, 0.18, 0.34];

export interface OceanParams {
  /** Direction the wind blows from, degrees. */
  windFrom: number;
  /** Significant wave height, metres. */
  waveHeight: number;
  /** Direction the dominant swell comes from, degrees. */
  swellFrom: number;
  windKnots: number;
}

const vertexShader = /* glsl */ `
uniform float uTime;
uniform vec2 uOrigin;
uniform vec2 uDir[${WAVE_COUNT}];
uniform float uAmp[${WAVE_COUNT}];
uniform float uLen[${WAVE_COUNT}];
uniform float uSteep[${WAVE_COUNT}];

varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
varying float vDist;
varying vec2 vSurface;

void main() {
  vec3 pos = position;
  vec2 p = pos.xz + uOrigin;
  vSurface = p;

  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  float crest = 0.0;

  // Waves are attenuated with distance so the far field stays smooth rather
  // than aliasing into noise at the horizon.
  float d = length(pos.xz);
  float atten = 1.0 - smoothstep(1400.0, 9000.0, d);

  for (int i = 0; i < ${WAVE_COUNT}; i++) {
    float k = 6.28318530718 / uLen[i];
    float c = sqrt(9.81 / k);
    vec2 dir = uDir[i];
    float f = k * (dot(dir, p) - c * uTime);
    float a = uAmp[i] * atten;
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

  vNormal = normalize(cross(binormal, tangent));
  vWorld = pos;
  vCrest = crest;
  vDist = d;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const fragmentShader = /* glsl */ `
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
uniform float uTime;
uniform vec2 uChopDir;
uniform float uChop;

varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
varying float vDist;
varying vec2 vSurface;

void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorld);

  // High-frequency chop. The Gerstner train carries the swell; this carries the
  // ripple that makes a breeze visible on the water, and it is far cheaper as a
  // normal perturbation than as geometry.
  float detail = 1.0 - smoothstep(150.0, 2600.0, vDist);
  vec2 q = vSurface;
  float dnx =
      sin(q.x * 0.62 + uTime * 1.9) * 0.50
    + sin(dot(q, vec2(0.31, 0.27)) * 1.45 - uTime * 2.7) * 0.30
    + sin(dot(q, vec2(0.9, -0.44)) * 2.6 + uTime * 3.6) * 0.16;
  float dnz =
      cos(q.y * 0.58 - uTime * 1.6) * 0.50
    + cos(dot(q, vec2(-0.24, 0.33)) * 1.55 + uTime * 2.3) * 0.30
    + cos(dot(q, vec2(0.5, 0.83)) * 2.8 - uTime * 3.1) * 0.16;
  n = normalize(n + vec3(dnx, 0.0, dnz) * 0.13 * uChop * detail);

  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 5.0);
  fresnel = mix(0.02, 1.0, fresnel);

  // Deep water darkens as the sun goes down; shallow-facing slopes pick up sky.
  float slope = clamp(n.y, 0.0, 1.0);
  vec3 body = mix(uDeepColor, uShallowColor, pow(slope, 3.0) * 0.55);

  vec3 reflDir = reflect(-viewDir, n);
  float up = clamp(reflDir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 sky = mix(uHorizonColor, uSkyColor, pow(up, 0.7));

  // Sun glitter. On a real sea this is a scattered track of individual
  // reflections, not a mirror disc, so it is broken up by the chop rather than
  // left as one blown-out blob.
  float sunDot = max(dot(reflDir, uSunDir), 0.0);
  float sparkle = 0.55 + 0.45 * sin(q.x * 3.1 + uTime * 4.3) * sin(q.y * 2.7 - uTime * 3.7);
  float spec = pow(sunDot, 90.0) * 0.75 * mix(1.0, sparkle, clamp(uChop, 0.0, 1.0));
  float sheen = pow(sunDot, 11.0) * 0.14;

  vec3 col = mix(body, sky, fresnel * 0.70);
  col += uSunColor * (spec + sheen) * (1.0 - uNight * 0.82);

  // Foam, but only on crests that are actually breaking. vCrest is the sum of
  // every wave component, so it is measured against the sum of their amplitudes;
  // the threshold then falls with the wind, because whitecaps do not appear at
  // all below about force four and cover more of the sea the harder it blows.
  float crest = vCrest / max(uCrestMax, 0.001);
  float foam = smoothstep(uFoamThreshold, uFoamThreshold + 0.16, crest);
  foam *= 1.0 - smoothstep(900.0, 4000.0, vDist);
  col = mix(col, vec3(0.92, 0.95, 0.97) * (1.0 - uNight * 0.55), foam * 0.7);

  // Wind streaks running downwind, the long pale lines a breeze draws on water.
  float streak = sin(dot(vSurface, uChopDir) * 0.06 + uTime * 0.4)
               * sin(dot(vSurface, vec2(-uChopDir.y, uChopDir.x)) * 0.9 - uTime * 1.1);
  col *= 1.0 + streak * 0.05 * uChop * (1.0 - smoothstep(200.0, 2200.0, vDist));

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

  constructor() {
    const geometry = buildRadialGrid(216, 150, 2.5, 14000);

    this.dirs = Array.from({ length: WAVE_COUNT }, () => new THREE.Vector2(1, 0));
    this.amps = new Array(WAVE_COUNT).fill(0.4);
    this.lens = new Array(WAVE_COUNT).fill(40);
    this.steeps = new Array(WAVE_COUNT).fill(0.4);

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uOrigin: { value: new THREE.Vector2(0, 0) },
        uDir: { value: this.dirs },
        uAmp: { value: this.amps },
        uLen: { value: this.lens },
        uSteep: { value: this.steeps },
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
      },
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0;
  }

  /** Recompute the wave train for the current weather. */
  setSea(p: OceanParams): void {
    // Significant wave height is the mean of the highest third. The six
    // components sum to roughly three times the base, so scale accordingly to
    // land the crest-to-trough height where it belongs.
    const baseAmp = clamp(p.waveHeight, 0.05, 14) * 0.34;
    // Fully developed wavelength grows with the square of wind speed.
    const baseLen = clamp(6 + p.windKnots * p.windKnots * 0.34, 12, 420);

    for (let i = 0; i < WAVE_COUNT; i++) {
      // The last component is the long swell, which runs from its own direction.
      const isSwell = i === WAVE_COUNT - 1;
      const fromDeg = (isSwell ? p.swellFrom : p.windFrom) + SPREAD[i];
      const towardRad = ((fromDeg + 180) * Math.PI) / 180;
      this.dirs[i].set(Math.sin(towardRad), Math.cos(towardRad));

      this.lens[i] = baseLen * WAVELENGTH_SCALE[i] * (isSwell ? 3.1 : 1);
      this.amps[i] = baseAmp * AMPLITUDE_SCALE[i] * (isSwell ? 1.15 : 1);
      // Steepness must stay below one or the surface self-intersects.
      this.steeps[i] = clamp(0.85 / (WAVE_COUNT * 0.7), 0.05, 0.85);
    }

    this.material.uniforms.uCrestMax.value = Math.max(
      this.amps.reduce((s, a) => s + a, 0), 0.02,
    );
    this.material.uniforms.uFoamThreshold.value =
      lerp(1.04, 0.48, smoothstep(9, 42, p.windKnots));

    const chopRad = ((p.windFrom + 180) * Math.PI) / 180;
    (this.material.uniforms.uChopDir.value as THREE.Vector2)
      .set(Math.sin(chopRad), Math.cos(chopRad));
    this.material.uniforms.uChop.value = clamp(p.windKnots / 26, 0, 1.3);
    this.material.uniformsNeedUpdate = true;
  }

  /** Move the wave field so the water flows past a ship held at the origin. */
  setOrigin(east: number, north: number): void {
    (this.material.uniforms.uOrigin.value as THREE.Vector2).set(east, -north);
  }

  setTime(t: number): void {
    this.material.uniforms.uTime.value = t;
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
   * Surface height and normal at a point, matching the shader exactly so the
   * ship sits in the water rather than on it.
   */
  sample(x: number, z: number, east: number, north: number, t: number): { height: number; normal: THREE.Vector3 } {
    const px = x + east;
    const pz = z - north;

    let height = 0;
    const tangent = new THREE.Vector3(1, 0, 0);
    const binormal = new THREE.Vector3(0, 0, 1);
    const atten = 1;

    for (let i = 0; i < WAVE_COUNT; i++) {
      const k = (2 * Math.PI) / this.lens[i];
      const c = Math.sqrt(9.81 / k);
      const d = this.dirs[i];
      const f = k * (d.x * px + d.y * pz - c * t);
      const a = this.amps[i] * atten;
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

/**
 * Radial grid: dense under the ship, coarse toward the horizon. Cheaper and
 * better-looking than a uniform plane at this scale.
 */
function buildRadialGrid(
  thetaSteps: number, radialSteps: number, inner: number, outer: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  positions.push(0, 0, 0);

  for (let r = 0; r < radialSteps; r++) {
    const tRad = r / (radialSteps - 1);
    const radius = inner * Math.pow(outer / inner, tRad);
    for (let a = 0; a < thetaSteps; a++) {
      const th = (a / thetaSteps) * Math.PI * 2;
      positions.push(Math.cos(th) * radius, 0, Math.sin(th) * radius);
    }
  }

  // Fan from the centre to the first ring.
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
