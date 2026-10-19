/**
 * The HDR post stack: scene into a linear half-float target, a dual-filter bloom
 * chain, and one final pass that does antialiasing, bloom, exposure, the neutral
 * tone curve, a time-of-day grade, the vignette, dither and the sRGB encode.
 *
 * Deliberately not three's EffectComposer: that ping-pongs two full-size targets
 * and runs a pass per effect. This is the scene target, a few shrinking bloom
 * mips, and a single full-screen pass to the canvas, which is what a phone can
 * afford. Everything the hand-written shaders draw is bridged in by post/color.ts.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { POST_EXPOSURE, POST_OUT } from './color';
import type { PostSpec } from '../quality';

/** What the grade is told about the moment. All 0 to 1 except where noted. */
export interface PostParams {
  night: number;
  /** How far into dawn or dusk: 0 by day and by night. */
  twilight: number;
  overcast: number;
  /** Rain or storm, 0 to 1: flattens and cools the picture. */
  weather: number;
  photo: boolean;
}

const VERT = /* glsl */ `
precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** First bloom level: soft-knee threshold with a Karis average so one hot pixel cannot fire the whole chain. */
const BLOOM_DOWN = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;     // texel of the SOURCE
uniform float uFirst;
uniform float uThreshold;
varying vec2 vUv;
vec3 fetch(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
float karis(vec3 c) { return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }
vec3 knee(vec3 c) {
  float l = max(c.r, max(c.g, c.b));
  float k = uThreshold * 0.5;
  float s = clamp(l - uThreshold + k, 0.0, 2.0 * k);
  s = s * s / (4.0 * k + 1e-4);
  return c * (max(s, l - uThreshold) / max(l, 1e-4));
}
void main() {
  vec3 a = fetch(vec2(-2.0, 2.0)), b = fetch(vec2(0.0, 2.0)), c = fetch(vec2(2.0, 2.0));
  vec3 d = fetch(vec2(-2.0, 0.0)), e = fetch(vec2(0.0, 0.0)), f = fetch(vec2(2.0, 0.0));
  vec3 g = fetch(vec2(-2.0, -2.0)), h = fetch(vec2(0.0, -2.0)), i = fetch(vec2(2.0, -2.0));
  vec3 j = fetch(vec2(-1.0, 1.0)), k = fetch(vec2(1.0, 1.0)), l = fetch(vec2(-1.0, -1.0)), m = fetch(vec2(1.0, -1.0));
  vec3 col;
  if (uFirst > 0.5) {
    // Each group weighted by the Karis average of the group's own mean.
    vec3 t0 = (a + b + d + e) * 0.25, t1 = (b + c + e + f) * 0.25, t2 = (d + e + g + h) * 0.25;
    vec3 t3 = (e + f + h + i) * 0.25, t4 = (j + k + l + m) * 0.25;
    t0 = knee(min(t0, vec3(64.0))); t1 = knee(min(t1, vec3(64.0))); t2 = knee(min(t2, vec3(64.0)));
    t3 = knee(min(t3, vec3(64.0))); t4 = knee(min(t4, vec3(64.0)));
    col = t0 * 0.125 * karis(t0) + t1 * 0.125 * karis(t1) + t2 * 0.125 * karis(t2) + t3 * 0.125 * karis(t3) + t4 * 0.5 * karis(t4);
    col /= (0.125 * (karis(t0) + karis(t1) + karis(t2) + karis(t3)) + 0.5 * karis(t4));
    col = max(col, 0.0);
  } else {
    col = e * 0.125;
    col += (a + c + g + i) * 0.03125;
    col += (b + d + f + h) * 0.0625;
    col += (j + k + l + m) * 0.125;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

/** Tent upsample of the smaller mip, added onto the one it is drawn into. */
const BLOOM_UP = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;     // texel of the SOURCE (the smaller mip)
uniform float uWeight;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb
         + texture2D(tSrc, vUv + vec2(0.0, 1.0) * uTexel).rgb * 2.0
         + texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb
         + texture2D(tSrc, vUv + vec2(-1.0, 0.0) * uTexel).rgb * 2.0
         + texture2D(tSrc, vUv).rgb * 4.0
         + texture2D(tSrc, vUv + vec2(1.0, 0.0) * uTexel).rgb * 2.0
         + texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb
         + texture2D(tSrc, vUv + vec2(0.0, -1.0) * uTexel).rgb * 2.0
         + texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb;
  gl_FragColor = vec4(c * (1.0 / 16.0) * uWeight, 1.0);
}`;

const FINAL = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 uTexel;
uniform float uBloom;
uniform float uVignette;
uniform float uSat;
uniform float uContrast;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uNight;
uniform float uWeather;
uniform float uStrength;   // overall grade strength: 0 = straight tone curve
varying vec2 vUv;

#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>

float lumaOf(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// Cheap reversible compression so edge decisions and blends are made on what
// the eye will see, not on an HDR sun that is fifty times brighter than the sky.
vec3 cmp(vec3 c) { return c / (1.0 + c); }
vec3 uncmp(vec3 c) { return c / max(1.0 - c, 1e-3); }

vec3 sceneColor(vec2 uv) {
#ifdef FXAA
  vec3 m = texture2D(tScene, uv).rgb;
  vec3 nw = cmp(texture2D(tScene, uv + vec2(-1.0, -1.0) * uTexel).rgb);
  vec3 ne = cmp(texture2D(tScene, uv + vec2(1.0, -1.0) * uTexel).rgb);
  vec3 sw = cmp(texture2D(tScene, uv + vec2(-1.0, 1.0) * uTexel).rgb);
  vec3 se = cmp(texture2D(tScene, uv + vec2(1.0, 1.0) * uTexel).rgb);
  vec3 mc = cmp(m);
  float lNW = lumaOf(nw), lNE = lumaOf(ne), lSW = lumaOf(sw), lSE = lumaOf(se), lM = lumaOf(mc);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.03, lMax * 0.125)) return m;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.25 * 0.125, 1.0 / 128.0);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uTexel;
  vec3 a = 0.5 * (cmp(texture2D(tScene, uv + dir * (1.0 / 3.0 - 0.5)).rgb) + cmp(texture2D(tScene, uv + dir * (2.0 / 3.0 - 0.5)).rgb));
  vec3 b = a * 0.5 + 0.25 * (cmp(texture2D(tScene, uv + dir * -0.5).rgb) + cmp(texture2D(tScene, uv + dir * 0.5).rgb));
  float lB = lumaOf(b);
  return uncmp((lB < lMin || lB > lMax) ? a : b);
#else
  return texture2D(tScene, uv).rgb;
#endif
}

void main() {
  vec3 hdr = sceneColor(vUv);
#ifdef BLOOM
  hdr += texture2D(tBloom, vUv).rgb * uBloom;
#endif
  vec3 c = hdr;
#if defined( NEUTRAL_TONE_MAPPING )
  c = NeutralToneMapping(c);
#endif
  c = clamp(c, 0.0, 1.0);
#ifdef SRGB_TRANSFER
  c = sRGBTransferOETF(vec4(c, 1.0)).rgb;
#endif

#ifdef GRADE
  // Grade in display space, where mid grey is where the eye expects it.
  float l = lumaOf(c);
  // Gentle S-curve about mid grey.
  vec3 s = c * c * (3.0 - 2.0 * c);
  c = mix(c, s, uContrast * uStrength);
  // Saturation about luma.
  l = lumaOf(c);
  c = mix(vec3(l), c, 1.0 + (uSat - 1.0) * uStrength);
  // Split tone: cool lifted shadows, warm highlights, weighted by luma.
  float sh = 1.0 - smoothstep(0.0, 0.5, l);
  float hi = smoothstep(0.45, 1.0, l);
  c *= mix(vec3(1.0), uShadowTint, sh * uStrength);
  c *= mix(vec3(1.0), uHighTint, hi * uStrength);
  // Vignette: a soft multiply that grows with the dark and the weather.
  vec2 q = vUv - 0.5;
  q.x *= 1.0;
  float v = smoothstep(0.35, 0.95, length(q) * 1.25);
  c *= 1.0 - v * uVignette;
#endif

  // Dither: kills banding in the long sky gradients at 8 bits.
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float n2 = fract(sin(dot(gl_FragCoord.yx + 17.0, vec2(39.3468, 11.135))) * 24634.6345);
  c += (n + n2 - 1.0) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

function rt(w: number, h: number, samples = 0, depth = false): THREE.WebGLRenderTarget {
  const t = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: depth,
    stencilBuffer: false,
    samples,
    generateMipmaps: false,
  });
  t.texture.colorSpace = THREE.LinearSRGBColorSpace;
  return t;
}

/** Whether this context can draw into a half-float target at all. */
export function hdrSupported(gl: THREE.WebGLRenderer): boolean {
  return gl.capabilities.isWebGL2 && (gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float'));
}

export class PostStack {
  private scene: THREE.WebGLRenderTarget | null = null;
  private mips: THREE.WebGLRenderTarget[] = [];
  private w = 0;
  private h = 0;
  private spec: PostSpec | null = null;
  private down: THREE.RawShaderMaterial;
  private up: THREE.RawShaderMaterial;
  private final: THREE.RawShaderMaterial;
  private quad: FullScreenQuad;
  private warm = new THREE.Vector3();
  /** Bytes of render target memory in use, for the overlay. */
  bytes = 0;
  /** Full-screen passes drawn by the last frame (excluding the scene). */
  passes = 0;

  constructor(private gl: THREE.WebGLRenderer) {
    const base = { vertexShader: VERT, depthTest: false, depthWrite: false };
    this.down = new THREE.RawShaderMaterial({
      ...base, fragmentShader: BLOOM_DOWN,
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 }, uThreshold: { value: 1.0 } },
    });
    this.up = new THREE.RawShaderMaterial({
      ...base, fragmentShader: BLOOM_UP, blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } },
    });
    this.final = new THREE.RawShaderMaterial({
      ...base, fragmentShader: FINAL,
      uniforms: {
        tScene: { value: null }, tBloom: { value: null }, uTexel: { value: new THREE.Vector2() },
        uBloom: { value: 0.1 }, uVignette: { value: 0.3 }, uSat: { value: 1.05 }, uContrast: { value: 0.15 },
        uShadowTint: { value: new THREE.Vector3(1, 1, 1) }, uHighTint: { value: new THREE.Vector3(1, 1, 1) },
        uNight: { value: 0 }, uWeather: { value: 0 }, uStrength: { value: 1 },
        toneMappingExposure: POST_EXPOSURE,
      },
    });
    this.final.defines = { NEUTRAL_TONE_MAPPING: '', SRGB_TRANSFER: '' };
    this.quad = new FullScreenQuad(this.down);
  }

  /** Apply a quality level's post spec. Rebuilds targets and recompiles only what changed. */
  configure(spec: PostSpec): void {
    const prev = this.spec;
    this.spec = spec;
    const d: Record<string, string> = { NEUTRAL_TONE_MAPPING: '', SRGB_TRANSFER: '' };
    if (spec.fxaa) d.FXAA = '';
    if (spec.bloomLevels > 0) d.BLOOM = '';
    if (spec.grade) d.GRADE = '';
    const a = JSON.stringify(this.final.defines), b = JSON.stringify(d);
    if (a !== b) { this.final.defines = d; this.final.needsUpdate = true; }
    if (!prev || prev.msaa !== spec.msaa || prev.bloomLevels !== spec.bloomLevels) this.rebuild();
  }

  /** Size to the drawing buffer. */
  setSize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.rebuild();
  }

  private rebuild(): void {
    if (!this.spec || !this.w) return;
    this.scene?.dispose();
    for (const m of this.mips) m.dispose();
    const maxSamples = this.gl.capabilities.maxSamples;
    const samples = Math.min(this.spec.msaa, maxSamples);
    this.scene = rt(this.w, this.h, samples > 1 ? samples : 0, true);
    this.mips = [];
    let mw = this.w, mh = this.h, bytes = this.w * this.h * 8 * Math.max(1, samples) + this.w * this.h * 4 * Math.max(1, samples);
    for (let i = 0; i < this.spec.bloomLevels; i++) {
      mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
      this.mips.push(rt(mw, mh));
      bytes += mw * mh * 8;
    }
    this.bytes = bytes;
  }

  private pass(mat: THREE.RawShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.gl.setRenderTarget(target);
    this.quad.render(this.gl);
    this.passes++;
  }

  render(sceneObj: THREE.Scene, camera: THREE.Camera, p: PostParams): void {
    const spec = this.spec;
    if (!spec || !this.scene) { this.gl.render(sceneObj, camera); return; }
    this.passes = 0;
    const gl = this.gl;
    const prevAuto = gl.autoClear;
    gl.autoClear = true;

    POST_OUT.value = 1;
    gl.setRenderTarget(this.scene);
    gl.render(sceneObj, camera);
    POST_OUT.value = 0;

    gl.autoClear = false;
    let bloomTex: THREE.Texture | null = null;
    if (spec.bloomLevels > 0 && this.mips.length) {
      // Down.
      let src: THREE.Texture = this.scene.texture;
      let sw = this.w, sh = this.h;
      for (let i = 0; i < this.mips.length; i++) {
        const u = this.down.uniforms;
        u.tSrc.value = src; (u.uTexel.value as THREE.Vector2).set(1 / sw, 1 / sh);
        u.uFirst.value = i === 0 ? 1 : 0;
        u.uThreshold.value = 0.9;
        this.pass(this.down, this.mips[i]);
        src = this.mips[i].texture; sw = this.mips[i].width; sh = this.mips[i].height;
      }
      // Up, each tent-filtered mip added onto the larger one.
      for (let i = this.mips.length - 1; i > 0; i--) {
        const u = this.up.uniforms;
        u.tSrc.value = this.mips[i].texture;
        (u.uTexel.value as THREE.Vector2).set(1 / this.mips[i].width, 1 / this.mips[i].height);
        u.uWeight.value = 1.0;
        this.pass(this.up, this.mips[i - 1]);
      }
      bloomTex = this.mips[0].texture;
    }

    // The grade, for this moment.
    const u = this.final.uniforms;
    u.tScene.value = this.scene.texture;
    u.tBloom.value = bloomTex;
    (u.uTexel.value as THREE.Vector2).set(1 / this.w, 1 / this.h);
    const dusk = p.twilight;
    // Bloom is a lens, and a lens at night sees lamps: keep it, just a little less on a dull grey day.
    u.uBloom.value = spec.bloomStrength * (0.22 + 0.10 * p.night + 0.06 * dusk) * (1 - 0.35 * p.overcast);
    u.uVignette.value = ((0.30 + p.night * 0.16 + p.overcast * 0.10) * (p.photo ? 0.8 : 1)) * 0.9;
    u.uSat.value = 1.07 - 0.16 * p.overcast - 0.12 * p.night - 0.10 * p.weather;
    u.uContrast.value = 0.20 + 0.10 * dusk - 0.08 * p.overcast;
    // Shadows lean cool, highlights warm; at dusk the warm side deepens.
    (u.uShadowTint.value as THREE.Vector3).set(0.95 + 0.03 * p.night, 1.0, 1.05 + 0.02 * p.night).lerp(new THREE.Vector3(1, 1, 1), p.overcast * 0.5);
    this.warm.set(1.05 + 0.05 * dusk, 1.0 + 0.0 * dusk, 0.94 - 0.10 * dusk).lerp(new THREE.Vector3(1, 1, 1), p.overcast * 0.6 + p.night * 0.7);
    (u.uHighTint.value as THREE.Vector3).copy(this.warm);
    u.uStrength.value = 1;
    this.pass(this.final, null);
    gl.autoClear = prevAuto;
  }

  dispose(): void {
    this.scene?.dispose();
    for (const m of this.mips) m.dispose();
    this.down.dispose(); this.up.dispose(); this.final.dispose();
    this.quad.dispose();
  }
}
