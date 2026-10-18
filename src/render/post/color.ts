/**
 * Bridging the hand-written shaders into the HDR post stack.
 *
 * The sea, sky, stars and spray write *display-referred* colour straight to the
 * canvas: the numbers in their uniforms are what the eye sees, and they never
 * went through the tone curve. The standard-family materials (ship, land, towns)
 * are lit in linear light and tone-mapped in-material.
 *
 * Inside the post stack the scene is drawn into a linear half-float target and
 * the tone curve is applied once, at the end, to everything. For the hand-written
 * shaders to look the same they have to be handed to that curve already
 * pre-distorted so that curve returns what they meant: sRGB to linear, divide by
 * the exposure the curve will multiply back in, and undo the toe of the Khronos
 * neutral curve. Anything they paint brighter than white then rolls off through
 * the shoulder and feeds the bloom, instead of clipping.
 *
 * `POST_OUT` is shared by every wrapped material: 1 while the HDR target is
 * being drawn, 0 otherwise (the env-cube photograph of the sky, and the legacy
 * path, want the old display-referred numbers untouched).
 */
import * as THREE from 'three';

export const POST_OUT = { value: 0 };
export const POST_EXPOSURE = { value: 1.42 };

const GLSL = /* glsl */ `
uniform float uPostOut;
uniform float uPostExposure;
vec3 postSrgbToLinear(vec3 c) {
  return mix(pow(c * 0.9478672986 + 0.0521327014, vec3(2.4)), c * 0.0773993808, vec3(lessThanEqual(c, vec3(0.04045))));
}
// Inverse of the toe of three's NeutralToneMapping (valid below its compression knee).
vec3 postNeutralPre(vec3 t) {
  float x = min(t.r, min(t.g, t.b));
  float xc = x < 0.04 ? 0.4 * sqrt(max(x, 0.0)) : x + 0.04;
  return t + (xc - x);
}
vec3 postOut(vec3 c) {
  return postNeutralPre(postSrgbToLinear(max(c, 0.0)) / uPostExposure);
}
void main() {
  postMainImpl();
  if (uPostOut > 0.5) gl_FragColor.rgb = postOut(gl_FragColor.rgb);
}
`;

/** Rewrite a fragment shader so its colour output survives the HDR stack. */
export function wrapPostOut(frag: string): string {
  if (frag.includes('postMainImpl')) return frag;
  return frag.replace(/void\s+main\s*\(\s*\)/, 'void postMainImpl()') + GLSL;
}

/** Add the shared uniforms a wrapped shader needs. */
export function postUniforms<T extends Record<string, THREE.IUniform>>(u: T): T & { uPostOut: THREE.IUniform; uPostExposure: THREE.IUniform } {
  return Object.assign(u, { uPostOut: POST_OUT, uPostExposure: POST_EXPOSURE });
}
