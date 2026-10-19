/**
 * A physical sky: single scattering through a Rayleigh, Mie and ozone
 * atmosphere (after Bruneton, Hillaire and Preetham's lineage), in two forms
 * that must agree.
 *
 *  - `skyRadiance` / `sunTransmittance` / `skyColours`: the integral on the CPU, for the
 *    handful of numbers the rest of the renderer wants (the colour of the
 *    sun at the observer, of the zenith, of the haze at the horizon), and for
 *    the harness to check the GPU against.
 *  - `SkyLut`: the same integral in a fragment shader, drawn into a small
 *    texture indexed by elevation and azimuth from the sun, which the dome then
 *    looks up. The sky is a function of the sun's altitude alone, so it is
 *    redrawn only when the sun has moved.
 *
 * Distances are in kilometres, the observer is at sea level, and colour is
 * linear RGB radiance. `display()` maps it to the sRGB-code numbers the dome's
 * own shader, written before any of this, is built from.
 */
import * as THREE from 'three';

const R_EARTH = 6360;
const R_TOP = 6460;
const H_RAYLEIGH = 8;
const H_MIE = 1.2;
const BETA_R: [number, number, number] = [5.802e-3, 13.558e-3, 33.1e-3];
// A clear, salt-washed maritime air: less absorbing haze than the continental default.
const BETA_M_SCA = 3.4e-3;
const BETA_M_EXT = 3.4e-3 / 0.92;
const BETA_O: [number, number, number] = [0.65e-3, 1.881e-3, 0.085e-3];
const MIE_G = 0.78;
/** The sun's irradiance, folded into one number with the display exposure. */
export const SUN_E = 1;

export type Vec3 = [number, number, number];

function ozone(h: number): number {
  return Math.max(0, 1 - Math.abs(h - 25) / 15);
}

function phaseR(mu: number): number { return (3 / (16 * Math.PI)) * (1 + mu * mu); }
function phaseM(mu: number): number {
  const g = MIE_G, g2 = g * g;
  return (3 / (8 * Math.PI)) * ((1 - g2) * (1 + mu * mu)) / ((2 + g2) * Math.pow(1 + g2 - 2 * g * mu, 1.5));
}

/** Distance along (p, d) to the sphere of radius r, nearest positive hit, or -1. */
function sphere(px: number, py: number, pz: number, dx: number, dy: number, dz: number, r: number, far: boolean): number {
  const b = px * dx + py * dy + pz * dz;
  const c = px * px + py * py + pz * pz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t0 = -b - s, t1 = -b + s;
  if (far) return t1 > 0 ? t1 : -1;
  return t0 > 0 ? t0 : (t1 > 0 ? t1 : -1);
}

/** Optical depth along a ray to the top of the atmosphere, or null if the planet is in the way. */
function lightDepth(px: number, py: number, pz: number, sx: number, sy: number, sz: number, steps: number, out: Vec3): boolean {
  if (sphere(px, py, pz, sx, sy, sz, R_EARTH, false) > 0) return false;
  const tTop = sphere(px, py, pz, sx, sy, sz, R_TOP, true);
  const dt = tTop / steps;
  let dR = 0, dM = 0, dO = 0;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * dt;
    const x = px + sx * t, y = py + sy * t, z = pz + sz * t;
    const h = Math.sqrt(x * x + y * y + z * z) - R_EARTH;
    dR += Math.exp(-h / H_RAYLEIGH) * dt;
    dM += Math.exp(-h / H_MIE) * dt;
    dO += ozone(h) * dt;
  }
  for (let k = 0; k < 3; k++) out[k] = BETA_R[k] * dR + BETA_M_EXT * dM + BETA_O[k] * dO;
  return true;
}

/** The colour (relative; 1 at the zenith's clear-air limit) of direct sunlight at sea level. */
export function sunTransmittance(sunAltRad: number): Vec3 {
  const a = Math.max(sunAltRad, 0.004);
  const od: Vec3 = [0, 0, 0];
  const ok = lightDepth(0, R_EARTH + 0.0005, 0, Math.cos(a), Math.sin(a), 0, 24, od);
  if (!ok) return [0, 0, 0];
  return [Math.exp(-od[0]), Math.exp(-od[1]), Math.exp(-od[2])];
}

/**
 * Radiance reaching an observer at sea level looking along elevation `e` and at
 * azimuth `phi` from the sun (0 toward it), with the sun at altitude `a`. Radians.
 */
export function skyRadiance(a: number, e: number, phi: number, steps = 24, lightSteps = 8): Vec3 {
  const sx = Math.cos(a), sy = Math.sin(a), sz = 0;
  const ce = Math.cos(e);
  const dx = ce * Math.cos(phi), dy = Math.sin(e), dz = ce * Math.sin(phi);
  const px = 0, py = R_EARTH + 0.0005, pz = 0;
  let tMax = sphere(px, py, pz, dx, dy, dz, R_TOP, true);
  const tg = sphere(px, py, pz, dx, dy, dz, R_EARTH, false);
  if (tg > 0) tMax = Math.min(tMax, tg);
  const mu = dx * sx + dy * sy + dz * sz;
  const pr = phaseR(mu), pm = phaseM(mu);
  let tauR = 0, tauM = 0, tauO = 0;
  const L: Vec3 = [0, 0, 0];
  const od: Vec3 = [0, 0, 0];
  let prev = 0;
  for (let i = 0; i < steps; i++) {
    const b1 = tMax * Math.pow((i + 1) / steps, 2);
    const dt = b1 - prev;
    const t = prev + dt * 0.5;
    prev = b1;
    const x = px + dx * t, y = py + dy * t, z = pz + dz * t;
    const h = Math.sqrt(x * x + y * y + z * z) - R_EARTH;
    const rR = Math.exp(-h / H_RAYLEIGH), rM = Math.exp(-h / H_MIE), rO = ozone(h);
    const hx = dt * 0.5;
    const vR = tauR + rR * hx, vM = tauM + rM * hx, vO = tauO + rO * hx;
    tauR += rR * dt; tauM += rM * dt; tauO += rO * dt;
    if (!lightDepth(x, y, z, sx, sy, sz, lightSteps, od)) continue;
    for (let k = 0; k < 3; k++) {
      const trans = Math.exp(-(BETA_R[k] * vR + BETA_M_EXT * vM + BETA_O[k] * vO) - od[k]);
      L[k] += trans * (BETA_R[k] * rR * pr + BETA_M_SCA * rM * pm) * dt;
    }
  }
  return [L[0] * SUN_E, L[1] * SUN_E, L[2] * SUN_E];
}

/**
 * Radiance to the display's sRGB code values: exposed, rolled off, encoded.
 * `K` is the exposure; the two-channel desaturation keeps a sunset's reds
 * from clipping to flat orange.
 */
export const SKY_K = 28;
/**
 * Single scattering is paler than a real sky (it has no second bounce to push
 * the blue further and no ground to warm the horizon) and the eye is not a
 * linear sensor. Chroma about the luminance, in linear light, restores it; this
 * and the exposure are the two numbers the model is calibrated with.
 */
export const SKY_SAT = 1.6;
export function display(L: Vec3, k = SKY_K): Vec3 {
  const out: Vec3 = [0, 0, 0];
  const lum = 0.2126 * L[0] + 0.7152 * L[1] + 0.0722 * L[2];
  for (let i = 0; i < 3; i++) {
    const c = Math.max(lum + (L[i] - lum) * SKY_SAT, 0);
    const x = 1 - Math.exp(-k * c);
    out[i] = Math.pow(Math.max(x, 0), 1 / 2.2);
  }
  return out;
}

export interface SkyColours {
  zenith: Vec3;
  horizon: Vec3;
  /** The sun's own colour at the observer, brightest channel 1. */
  sun: Vec3;
  /** Luminance of the direct beam relative to a high sun, 0 to 1. */
  beam: number;
}

const cache = { a: NaN, v: null as SkyColours | null };

/** The few numbers the lighting wants, from the same integral the dome draws. Cached on altitude. */
export function skyColours(sunAltRad: number): SkyColours {
  if (cache.v && Math.abs(cache.a - sunAltRad) < 0.0006) return cache.v;
  const zen = display(skyRadiance(sunAltRad, Math.PI / 2 - 0.02, 0, 16, 6));
  // The haze is the sky a degree or two above the horizon, averaged round the compass
  // with the sun's side and the far side given their weight.
  const e = 0.03;
  const parts = [skyRadiance(sunAltRad, e, 0, 16, 6), skyRadiance(sunAltRad, e, Math.PI * 0.5, 16, 6), skyRadiance(sunAltRad, e, Math.PI, 16, 6)];
  const avg: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) avg[k] = (parts[0][k] * 0.5 + parts[1][k] + parts[2][k] * 1.0) / 2.5;
  const hz = display(avg);
  const T = sunTransmittance(sunAltRad);
  const m = Math.max(T[0], T[1], T[2], 1e-6);
  const high = sunTransmittance(Math.PI / 2 - 0.2);
  const lum = (c: Vec3) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  cache.a = sunAltRad;
  cache.v = {
    zenith: zen, horizon: hz,
    sun: [T[0] / m, T[1] / m, T[2] / m],
    beam: Math.min(1, lum(T) / Math.max(lum(high), 1e-6)),
  };
  return cache.v;
}

// ---------------------------------------------------------------------------
// The GPU form
// ---------------------------------------------------------------------------

export const LUT_W = 64;
export const LUT_H = 64;
/** Lowest elevation the table covers, radians: a little below the horizon. */
export const LUT_E0 = -0.06;

const LUT_VERT = /* glsl */ `
precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const LUT_FRAG = /* glsl */ `
precision highp float;
uniform float uSunAlt;
uniform float uK;
varying vec2 vUv;

const float R_EARTH = ${R_EARTH.toFixed(1)};
const float R_TOP = ${R_TOP.toFixed(1)};
const vec3 BETA_R = vec3(${BETA_R.map((x) => x.toExponential(4)).join(', ')});
const float BETA_M_SCA = ${BETA_M_SCA.toExponential(4)};
const float BETA_M_EXT = ${BETA_M_EXT.toExponential(4)};
const vec3 BETA_O = vec3(${BETA_O.map((x) => x.toExponential(4)).join(', ')});
const float G = ${MIE_G.toFixed(3)};
const float PI = 3.14159265359;

float ozoneD(float h) { return max(0.0, 1.0 - abs(h - 25.0) / 15.0); }
float phaseR(float mu) { return (3.0 / (16.0 * PI)) * (1.0 + mu * mu); }
float phaseM(float mu) {
  float g2 = G * G;
  return (3.0 / (8.0 * PI)) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * G * mu, 1.5));
}
// Nearest positive hit (far=false) or far hit of a sphere centred on the origin, or -1.
float sph(vec3 p, vec3 d, float r, bool far) {
  float b = dot(p, d);
  float c = dot(p, p) - r * r;
  float disc = b * b - c;
  if (disc < 0.0) return -1.0;
  float s = sqrt(disc);
  float t0 = -b - s, t1 = -b + s;
  if (far) return t1 > 0.0 ? t1 : -1.0;
  return t0 > 0.0 ? t0 : (t1 > 0.0 ? t1 : -1.0);
}
bool lightDepth(vec3 p, vec3 s, out vec3 od) {
  od = vec3(0.0);
  if (sph(p, s, R_EARTH, false) > 0.0) return false;
  float tTop = sph(p, s, R_TOP, true);
  float dt = tTop / float(LIGHT_STEPS);
  float dR = 0.0, dM = 0.0, dO = 0.0;
  for (int i = 0; i < LIGHT_STEPS; i++) {
    float h = length(p + s * ((float(i) + 0.5) * dt)) - R_EARTH;
    dR += exp(-h / ${H_RAYLEIGH.toFixed(1)}) * dt;
    dM += exp(-h / ${H_MIE.toFixed(1)}) * dt;
    dO += ozoneD(h) * dt;
  }
  od = BETA_R * dR + BETA_M_EXT * dM + BETA_O * dO;
  return true;
}
void main() {
  // v is elevation (stored with more rows near the horizon), u the azimuth from the sun, 0 to pi.
  float e = vUv.y * vUv.y * (${(Math.PI / 2 - LUT_E0).toFixed(5)}) + (${LUT_E0.toFixed(3)});
  float phi = vUv.x * PI;
  vec3 s = vec3(cos(uSunAlt), sin(uSunAlt), 0.0);
  float ce = cos(e);
  vec3 d = vec3(ce * cos(phi), sin(e), ce * sin(phi));
  vec3 p = vec3(0.0, R_EARTH + 0.0005, 0.0);
  float tMax = sph(p, d, R_TOP, true);
  float tg = sph(p, d, R_EARTH, false);
  if (tg > 0.0) tMax = min(tMax, tg);
  float mu = dot(d, s);
  float pr = phaseR(mu), pm = phaseM(mu);
  float tauR = 0.0, tauM = 0.0, tauO = 0.0;
  vec3 L = vec3(0.0);
  float prev = 0.0;
  for (int i = 0; i < VIEW_STEPS; i++) {
    float f = float(i + 1) / float(VIEW_STEPS);
    float b1 = tMax * f * f;
    float dt = b1 - prev;
    float t = prev + dt * 0.5;
    prev = b1;
    vec3 q = p + d * t;
    float h = length(q) - R_EARTH;
    float rR = exp(-h / ${H_RAYLEIGH.toFixed(1)}), rM = exp(-h / ${H_MIE.toFixed(1)}), rO = ozoneD(h);
    float vR = tauR + rR * dt * 0.5, vM = tauM + rM * dt * 0.5, vO = tauO + rO * dt * 0.5;
    tauR += rR * dt; tauM += rM * dt; tauO += rO * dt;
    vec3 od;
    if (!lightDepth(q, s, od)) continue;
    vec3 trans = exp(-(BETA_R * vR + BETA_M_EXT * vM + BETA_O * vO) - od);
    L += trans * (BETA_R * rR * pr + BETA_M_SCA * rM * pm) * dt;
  }
  float lum = dot(L, vec3(0.2126, 0.7152, 0.0722));
  vec3 c = max(vec3(lum) + (L - vec3(lum)) * ${SKY_SAT.toFixed(3)}, 0.0);
  vec3 x = 1.0 - exp(-uK * c * ${SUN_E.toFixed(3)});
  gl_FragColor = vec4(pow(max(x, 0.0), vec3(1.0 / 2.2)), 1.0);
}`;

/** The sky as a small texture, redrawn when the sun has moved. */
export class SkyLut {
  readonly target: THREE.WebGLRenderTarget;
  private material: THREE.RawShaderMaterial;
  private mesh: THREE.Mesh;
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private scene = new THREE.Scene();
  private altDrawn = NaN;

  constructor(viewSteps = 14, lightSteps = 5) {
    this.target = new THREE.WebGLRenderTarget(LUT_W, LUT_H, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false, generateMipmaps: false,
    });
    this.target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.material = new THREE.RawShaderMaterial({
      vertexShader: LUT_VERT, fragmentShader: LUT_FRAG,
      defines: { VIEW_STEPS: viewSteps, LIGHT_STEPS: lightSteps },
      uniforms: { uSunAlt: { value: 0 }, uK: { value: SKY_K } },
      depthTest: false, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  /** Redraw for this sun altitude (radians) if it has moved enough to show. */
  update(gl: THREE.WebGLRenderer, sunAlt: number): void {
    if (Math.abs(sunAlt - this.altDrawn) < 0.0008) return;
    this.altDrawn = sunAlt;
    this.material.uniforms.uSunAlt.value = sunAlt;
    const prev = gl.getRenderTarget();
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(this.target);
    gl.render(this.scene, this.camera);
    gl.setRenderTarget(prev);
    gl.autoClear = autoClear;
  }

  dispose(): void {
    this.target.dispose(); this.material.dispose(); this.mesh.geometry.dispose();
  }
}
