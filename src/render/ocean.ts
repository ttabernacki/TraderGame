import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/math';

/**
 * Wave train. Eight Gerstner components spread either side of the wind, spanning
 * a wide enough range of wavelengths that there is real geometry at every scale
 * the player can see — long swell out to the horizon, short chop under the bow.
 */
const WAVE_COUNT = 8;

/** How many points of the ship's recent track the wake is measured against. */
const TRACK_POINTS = 20;

/** Spacing between track points, metres. Twenty of them give ~180m of wake. */
const TRACK_STEP = 9;

/**
 * How fast the radial grid's ring spacing grows with distance, as a fraction of
 * the radius. The vertex shader needs it to know which waves the mesh can still
 * resolve where it is standing, so it is derived from the grid's own numbers
 * rather than written down twice.
 */
const GRID_GROWTH = 0.0505;

/** Half-angle of the Kelvin cusp line, the same for every displacement hull. */
const KELVIN_TAN = 0.3541;

const SPREAD = [0, 26, -32, 58, -64, 88, -96, 150];
/**
 * The spectrum, as fractions of the peak wavelength and of the peak amplitude.
 *
 * The short end reaches a good deal further down than the long end suggests it
 * needs to. A fully developed sea has almost constant steepness at its peak
 * whatever the wind, so a gale drawn from the peak alone is a 300-metre swell
 * with a slope of two degrees: physically right, and it reads on screen as a
 * flat calm. What makes a gale look like a gale is the steep short chop riding
 * on top of the swell, so the short components are carried down to a few metres
 * and given progressively more steepness, which is what wind chop actually has.
 */
const WAVELENGTH_SCALE = [1.0, 0.58, 0.34, 0.19, 0.105, 0.055, 0.026, 2.4];
const AMPLITUDE_SCALE = [1.0, 0.62, 0.40, 0.25, 0.15, 0.085, 0.045, 0.40];

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
uniform float uTrackRun[${TRACK_POINTS}];
uniform int uTrackCount;

/**
 * Foam and displacement from the ship.
 *
 * The wake is measured against the track she actually sailed, held as a short
 * history of where she has been, rather than against her present heading. Water
 * she disturbed two minutes ago stays disturbed where it was: put the helm over
 * and the wake bends astern of her instead of swinging round like a searchlight.
 *
 * Its geometry is set by distance run rather than by elapsed time. A wake is a
 * wave pattern the hull drags along with it, so its width at a given point is
 * fixed by how far astern that point lies, not by how long ago the ship passed:
 * driving the spread with age instead makes a slow ship in a calm lay down a
 * wake half a cable wide.
 *
 * x: foam coverage, y: surface displacement in metres, z: how far the water has
 * been smoothed — the flattened slick a hull drags behind it, which is what the
 * eye actually reads as a wake long after the foam itself has gone.
 */
vec3 wakeAt(vec2 rel) {
  // Everything past this is open water: skip the whole track search for it.
  // A ship lying to her anchor still wets her own waterline, so the test is on
  // range and not on whether she is moving.
  if (dot(rel, rel) > 260.0 * 260.0) return vec3(0.0);

  // Nearest point on the track: how far off it we are, how far astern along it,
  // and how long ago she laid it down.
  float bestD = 1.0e9;
  float bestAge = 0.0;
  float bestRun = 0.0;
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
      bestRun = mix(uTrackRun[i], uTrackRun[i + 1], t);
    }
  }

  // The pattern itself persists with distance run; the froth in it dies away far
  // sooner, which is why a wake is white for a ship's length or two and then a
  // smooth glassy road for a mile.
  float pattern = exp(-bestRun / (uShipHalfLength * 26.0));
  float froth = exp(-bestAge / (11.0 + uWakeStrength * 15.0))
              * exp(-bestRun / (uShipHalfLength * 5.5));

  // The band of broken water directly astern, about the ship's beam at the
  // transom and opening only slowly.
  float halfWidth = uShipHalfBeam * (1.05 + bestRun * 0.008);
  float q = bestD / max(halfWidth, 0.4);
  float trail = exp(-q * q * 1.25);

  // The Kelvin cusps: two lines of steeper water running out at a fixed angle
  // either side of the track, whatever the ship's speed. They are a pattern in
  // the surface rather than a painted stripe, so they carry almost no foam.
  float arm = uShipHalfBeam * 0.9 + bestRun * ${KELVIN_TAN.toFixed(4)};
  float armWidth = 0.9 + bestRun * 0.035;
  float e = (bestD - arm) / armWidth;
  float cusps = exp(-e * e) * pattern * smoothstep(0.0, 8.0, bestRun);

  // The bow throws water aside just forward of the stem, which is fixed to her
  // and so is still measured from her heading.
  float along = dot(rel, uWakeDir);
  float across = dot(rel, vec2(uWakeDir.y, -uWakeDir.x));
  float bowAlong = along - uShipHalfLength * 0.78;
  float bowSpread = max(uShipHalfBeam * uShipHalfBeam * 1.4, 1.0);
  float bow = exp(-(bowAlong * bowAlong) / 6.0) * exp(-(across * across) / bowSpread);

  // Where the planking meets the water she wets the surface all round herself: a
  // thin line of disturbed water along the whole waterline. It is a small thing
  // and it does most of the work of making a hull sit in the sea rather than
  // stand on it like a model on a mirror.
  vec2 hull = vec2(along / max(uShipHalfLength, 0.5),
                   across / max(uShipHalfBeam * 0.94, 0.3));
  float edge = (length(hull) - 1.0) / 0.10;
  float wetting = exp(-edge * edge) * (0.3 + 0.7 * uWakeStrength);

  float foam = clamp((trail * froth * 0.85 + cusps * 0.10 + bow * 0.8) * uWakeStrength
                     + wetting * 0.3, 0.0, 1.0);

  // She piles water up at the bow, leaves a trough in the trail astern of it,
  // and raises the two cusp lines either side.
  float lift = bow * 0.62 - trail * pattern * 0.34 + cusps * 0.30;

  // Astern of her the chop is knocked flat for a long way, and that smooth road
  // catches the sky differently from the broken water round it.
  float slick = clamp((trail * pattern * 1.25 + cusps * 0.3) * uWakeStrength, 0.0, 1.0);

  return vec3(foam, lift * uWakeStrength * (uShipHalfBeam * 0.4), slick);
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

  // How far apart this ring's vertices are. The grid is dense under the ship and
  // opens out geometrically toward the horizon, so a wave the mesh can carry
  // easily at a hundred metres has barely a vertex per crest at five kilometres.
  float spacing = max(d * ${(GRID_GROWTH).toFixed(4)}, ${(1.9).toFixed(1)});

  for (int i = 0; i < ${WAVE_COUNT}; i++) {
    float k = 6.28318530718 / uLen[i];
    vec2 dir = uDir[i];
    float f = k * dot(dir, p) + uPhase[i];

    // A wave is faded out where the mesh can no longer resolve it — under about
    // five vertices to a wavelength — rather than at some fixed distance. Left
    // in past that point it is not drawn, it is *sampled*: the crests land
    // between vertices, beat against the grid, and crawl and sparkle as the ship
    // moves. That beating is most of the shimmer on a distant sea. What it costs
    // is geometry in the far field, and the fragment stage pays that back with
    // filtered slope, which can be resolved per pixel however far off it is.
    float carry = 1.0 - smoothstep(uLen[i] * 0.30, uLen[i] * 0.85, spacing);
    float a = uAmp[i] * carry;
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

    // The crest test drives the whitecaps, and it is taken from the unfaded
    // amplitude: where a wave is breaking does not stop being true because the
    // mesh out there is too coarse to draw its shape.
    crest += max(0.0, sinf) * uAmp[i];
  }

  // Only the displacement is taken per-vertex. The foam is evaluated per-pixel
  // in the fragment stage, because far-field triangles are hundreds of metres
  // across and interpolating foam over them smears the wake into a solid sheet.
  // Only near the ship: the wake search is a loop over the whole track, and the
  // far field has hundreds of vertices that will never be within a mile of her.
  if (d < 320.0) pos.y += wakeAt(position.xz).y;
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
uniform vec3 uSeaFar;
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

/**
 * Tiling value noise.
 *
 * Products and sums of sines are cheap but they lay down a regular lattice, and
 * once anything is thresholded against them — whitecaps, wake froth — the
 * lattice shows through as rows of identical round blobs. This hashes the
 * integer lattice instead, so the field is irregular at every scale.
 *
 * The cell index is taken modulo a period before it is hashed, which both makes
 * the field tile seamlessly and keeps the hash's argument small: a hash built on
 * fract() of a coordinate in the tens of thousands has no precision left, and
 * the noise degenerates into bands.
 */
float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float vnoise(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec2 a = mod(i, period);
  vec2 b = mod(i + 1.0, period);
  return mix(mix(hash21(a), hash21(vec2(b.x, a.y)), f.x),
             mix(hash21(vec2(a.x, b.y)), hash21(b), f.x), f.y);
}

/** Four octaves of it, tiling on the same period at every scale. */
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.52;
  float per = 64.0;
  for (int i = 0; i < 4; i++) {
    v += amp * vnoise(p, per);
    p *= 2.0;
    per *= 2.0;
    amp *= 0.5;
  }
  return v;
}

/**
 * How much of a feature of the given size survives at this pixel footprint.
 *
 * One at a comfortable several pixels across, nothing once it is down to about
 * two, and a smooth ramp between. This is the whole of the anti-aliasing: a
 * pattern finer than the pixel grid does not average out on its own, it beats
 * against the grid, and on a sea that beating crawls and glitters with every
 * metre the ship makes.
 */
float resolvable(float featureSize, float px) {
  return 1.0 - smoothstep(featureSize * 0.22, featureSize * 0.65, px);
}

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

  vec3 wk = wakeAt(vLocal);

  // Ripple, in four octaves whose ranges overlap heavily. Each is roughly four
  // times coarser and reaches roughly four times further than the one before, so
  // as the fine texture drops out the next scale up is already carrying the
  // surface. The coarsest never fades at all: without it the water beyond a few
  // hundred metres goes glassy and a flat strip appears across the view.
  // How much of the surface one pixel covers, in metres. Everything below is
  // filtered against this rather than against distance: an octave is kept while
  // the screen can resolve it and faded out as it approaches the pixel grid,
  // whatever the camera height, the field of view or the display's resolution.
  // Fading by distance instead is only ever a guess at the same quantity, and it
  // guesses wrong the moment the player zooms, looks down, or opens the game on
  // a screen with twice the pixels.
  float px = max(length(fwidth(vSurface)), 1.0e-4);

  // Looking along the surface rather than down onto it, one pixel spans a huge
  // patch of water and what reaches the eye is the average of a great many wave
  // faces, not any one of them. Perturbing the normal by its full amount there
  // swings the reflected ray wildly for a fraction of a degree of elevation, and
  // the horizon comes apart into a ragged dark fringe.
  float graze = mix(0.12, 1.0, smoothstep(0.012, 0.26, abs(viewDir.y)));

  // Each octave's finest feature is about a fifth of its own scale. Held above
  // roughly two pixels, so nothing is drawn that the display cannot separate.
  float o1 = resolvable(3.6, px);
  float o2 = resolvable(13.8, px);
  float o3 = resolvable(53.0, px);
  float o4 = resolvable(212.0, px);
  // The coarse octaves are deliberately strong. Without slope in the far field
  // the water there has one uniform normal, the Fresnel term snaps from body
  // colour to sky colour over a couple of degrees of elevation, and that snap
  // lands on screen as a flat pale strip ruled under the horizon.
  vec2 detail =
      chopNormal(vSurface, uNoiseTime) * o1
    + chopNormal(vSurface * 0.26 + 41.0, uNoiseTime * 0.52) * (o2 * 0.82)
    + chopNormal(vSurface * 0.068 + 91.0, uNoiseTime * 0.27) * (o3 * 0.70)
    + chopNormal(vSurface * 0.017 + 137.0, uNoiseTime * 0.13) * (o4 * 0.95)
    + chopNormal(vSurface * 0.0042 + 211.0, uNoiseTime * 0.06) * 1.05;

  // What was filtered away is not simply lost. Slope that can no longer be
  // resolved still scatters light within the pixel, so it is carried forward as
  // roughness and used to widen the sun's reflection instead — which is what
  // stops a distant sea from breaking into a field of hard white sparks.
  float lost = (1.0 - o1) * 0.55 + (1.0 - o2) * 0.3 + (1.0 - o3) * 0.15;

  // The slick astern flattens the ripple as well as the swell, which is what
  // makes a wake visible on a calm day when there is no foam left in it at all.
  float smoothed = 1.0 - wk.z * 0.78;
  // Scaled by the sea that is actually running: the same ripple field on a
  // glassy calm and in a full gale is the surest way to make neither look right.
  float roughness = clamp(uChop + 0.22, 0.22, 1.5);
  n = normalize(n + vec3(detail.x, 0.0, detail.y) * 0.125 * roughness * smoothed * graze);
  n = normalize(mix(n, vec3(0.0, 1.0, 0.0), wk.z * 0.35));

  float ndv = max(dot(n, viewDir), 0.0);
  float fresnel = mix(0.02, 1.0, pow(1.0 - ndv, 5.0));

  float slope = clamp(n.y, 0.0, 1.0);
  vec3 body = mix(uDeepColor, uShallowColor, pow(slope, 3.0) * 0.55);

  vec3 reflDir = reflect(-viewDir, n);
  float up = clamp(reflDir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 sky = mix(uHorizonColor, uSkyColor, pow(up, 0.7));

  // Sun glitter: a scattered track of individual reflections, not a mirror disc.
  float sunDot = max(dot(reflDir, uSunDir), 0.0);
  // Glitter is a two-metre pattern, so it is filtered like everything else: past
  // the range where a pixel can hold it, it flattens to its own average rather
  // than being sampled at random.
  float glint = resolvable(2.1, px);
  float sparkle = 0.55 + 0.45 * glint * sin(vSurface.x * 3.1 + uNoiseTime * 4.3)
                                      * sin(vSurface.y * 2.7 - uNoiseTime * 3.7);
  // The slope the pixel could not resolve becomes roughness: a narrow, bright
  // highlight is spread into a wide, dim one of the same total energy. Leaving
  // the highlight narrow instead is what makes a distant sea flash and crawl —
  // a mirror-sharp reflection sampled once per pixel either hits the sun or
  // misses it entirely, and which of the two changes with every step the ship
  // takes. Spreading it is both physically right and the cure.
  float rough = clamp(lost, 0.0, 1.0);
  float tight = mix(110.0, 9.0, rough);
  float gain = mix(0.85, 0.16, rough);
  float spec = pow(sunDot, tight) * gain
             * mix(0.35, sparkle, clamp(uChop, 0.0, 1.0) * (1.0 - rough * 0.8));
  // The broad sheen either side of the sun's track is what blows out to a white
  // sheet if it is let run: it is held down hard and narrowed.
  float sheen = pow(sunDot, 24.0) * 0.09;

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
  float breaking = 0.0;
  // The noise field is four octaves of hashing and costs more than the rest of
  // the shading put together, so it is only sampled where a crest could possibly
  // break. Most of the sea, most of the time, is nowhere near.
  if (crest > uFoamThreshold * 0.42 && vDist < 14000.0) {
    // Broken up across four scales, and drifting downwind, because whitecaps do:
    // the patch that is breaking now was being blown to leeward a moment ago.
    vec2 drift = uChopDir * uNoiseTime * 0.8;
    float mottle = 0.55 + 0.92 * fbm((vSurface + drift) * 0.09);
    // A short ramp, so a crest breaks rather than dissolving.
    breaking = smoothstep(uFoamThreshold, uFoamThreshold + 0.06, crest * mottle);
    // Foam sits on the crest and streams down its back, never in the troughs.
    breaking *= smoothstep(0.02, 0.42, n.y * 0.25 + vWorld.y / max(uCrestMax, 0.3));
    breaking *= 1.0 - smoothstep(2500.0, 14000.0, vDist);
  }

  // Wake and bow foam, textured so it reads as bubbles rather than paint. The
  // fine grain is dropped with distance: a two-metre pattern seen from eighty
  // metres away falls below one sample per pixel and beats against the pixel
  // grid, which is what turns a wake into broad diagonal moire bands.
  // Only where there is actually froth: the great majority of the sea is not
  // within two hundred metres of the ship and need not pay for this at all.
  float wake = 0.0;
  if (wk.x > 0.002) {
    float grain = 1.0 - smoothstep(30.0, 170.0, vDist);
    // Sampled squashed along the ship's heading, so the patches come out drawn
    // into streaks in the direction the water was dragged, not round blobs.
    vec2 w = vec2(dot(vSurface, uWakeDir) * 0.34,
                  dot(vSurface, vec2(uWakeDir.y, -uWakeDir.x)));
    float bubbles = 0.28 + 1.5 * fbm(w * 0.42 + uNoiseTime * 0.11)
                  + 0.35 * (vnoise(w * 2.6 - uNoiseTime * 0.6, 512.0) - 0.5) * grain;
    // A soft threshold, so froth either covers a patch of water or it does not —
    // except close under the counter, where the water she is actually
    // shouldering aside is solid white however the noise happens to fall.
    float broken = smoothstep(0.30, 0.95, wk.x * max(bubbles, 0.0) + wk.x * 0.4);
    wake = clamp(max(broken, wk.x * wk.x * 0.95), 0.0, 1.0);
  }

  float foam = clamp(breaking * 0.72 + wake * 0.7, 0.0, 1.0);
  vec3 foamColor = vec3(0.93, 0.96, 0.98) * (1.0 - uNight * 0.82);
  // Foam is aerated water, not paint: even a hard-driven wake leaves the sea
  // showing through it.
  col = mix(col, foamColor, foam * 0.68);

  // Wind streaks running downwind: the long pale lines a breeze draws on water,
  // spaced tens of metres apart and drifting, not the close regular grating that
  // a single pair of sines lays down across the whole sea like corduroy.
  vec2 alongWind = uChopDir;
  vec2 acrossWind = vec2(-uChopDir.y, uChopDir.x);
  float lane = dot(vSurface, acrossWind);
  float run = dot(vSurface, alongWind);
  float streak = sin(lane * 0.038 + sin(run * 0.007) * 2.1 + uNoiseTime * 0.09)
               * (0.6 + 0.4 * sin(run * 0.013 - uNoiseTime * 0.22));
  col *= 1.0 + streak * 0.028 * uChop * (1.0 - smoothstep(300.0, 3000.0, vDist));

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
  // On a clear day extinction alone never quite finishes, and water that is
  // ninety-five per cent hazed against a sky that is eighty per cent hazed meets
  // it in a visible pale seam right along the horizon. The last of the haze is
  // therefore forced home well inside the rim of the mesh, so the sea arrives at
  // exactly the sky's own horizon colour and the join disappears.
  fog = max(fog, smoothstep(9000.0, 34000.0, vDist));
  // Toward the sea's own distant colour, not the sky's. Fogging water to the
  // exact colour of the sky above it both erases the horizon line — which is
  // the one thing a navigator looks at all day — and washes the last few miles
  // of sea out into a pale band that reads as a blurred strip across the view.
  col = mix(col, uSeaFar, clamp(fog, 0.0, 1.0));

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

  /** Noise-field origin, wrapped; decorative only, so it need not be exact. */
  private originE = 0;
  private originN = 0;
  private noiseTime = 0;
  /** Sea state as the water is actually drawing it, slewed toward the weather. */
  private seaHeight = 0.4;
  private seaWind = 8;
  private seaWindFrom = 0;
  private seaSwellFrom = 0;
  private seeded = false;

  private track: { x: number; z: number; age: number; run: number }[] =
    [{ x: 0, z: 0, age: 0, run: 0 }];

  constructor() {
    // The grid must reach past the true horizon — sixteen kilometres from a
    // masthead on a clear day — or the player sees the edge of the water before
    // he sees where the sea meets the sky.
    //
    // Every one of these vertices is displaced by the wave sum in the shader,
    // so the count is very nearly the whole cost of drawing the sea. A phone
    // gets rather under half of them, which at that size costs a little
    // definition in the chop and buys back the frame rate.
    const dense = !smallScreen();
    const geometry = buildRadialGrid(
      dense ? 256 : 168, dense ? 224 : 136, 1.6, 42000);

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
        uSeaFar: { value: new THREE.Color(0.3, 0.42, 0.55) },
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
        uTrackRun: { value: new Array(TRACK_POINTS).fill(0) },
        uTrackCount: { value: 0 },
      },
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0;
    this.mesh.receiveShadow = true;
  }

  /**
   * Advance the sea by one frame.
   *
   * `dEast` and `dNorth` are the metres she has made good since the last frame,
   * and `dt` the seconds of wave time elapsed. Everything is integrated rather
   * than recomputed from absolute position and absolute clock: see `advance`.
   */
  setSea(p: OceanParams, dEast: number, dNorth: number, dt: number): void {
    // A sea does not answer a gust. Slew the state the water is drawing toward
    // the weather over a minute or so, both because that is how a sea builds and
    // because it keeps the wave train's geometry from twitching frame to frame.
    // The first frame takes the weather whole: the player should open his eyes
    // on the sea that is running, not watch it build from a calm.
    if (!this.seeded) {
      this.seeded = true;
      this.seaHeight = clamp(p.waveHeight, 0.05, 14);
      this.seaWind = p.windKnots;
      this.seaWindFrom = p.windFrom;
      this.seaSwellFrom = p.swellFrom;
    }
    // Three seconds is enough. The weather itself already changes over hours;
    // all this has to do is take the twitch out of a gust so the wave train's
    // geometry does not jitter from frame to frame. Any slower and sailing into
    // a gale leaves the ship in a flat calm for minutes on end.
    const k = clamp(dt / 3, 0, 1);
    this.seaHeight = lerp(this.seaHeight, clamp(p.waveHeight, 0.05, 14), k);
    this.seaWind = lerp(this.seaWind, p.windKnots, k);
    this.seaWindFrom = slewAngle(this.seaWindFrom, p.windFrom, k);
    this.seaSwellFrom = slewAngle(this.seaSwellFrom, p.swellFrom, k);

    // Chosen so the sum of the components comes out at the significant wave
    // height the weather asked for: with random phases, Hs is four times the
    // standard deviation, not the sum of the amplitudes.
    const baseAmp = this.seaHeight * 0.275;
    // Peak wavelength of a fully developed sea: 0.79 U squared in metres, which
    // in knots is a shade over a fifth of the square of the wind.
    const baseLen = clamp(5 + this.seaWind * this.seaWind * 0.21, 8, 520);

    for (let i = 0; i < WAVE_COUNT; i++) {
      const isSwell = i === WAVE_COUNT - 1;
      const fromDeg = (isSwell ? this.seaSwellFrom : this.seaWindFrom) + SPREAD[i];
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
    // Whitecaps start at about force four and by a full gale the sea is more
    // white than blue. The threshold is measured against the summed crest, which
    // averages about a third of its maximum, so it has to come a long way down
    // before a gale looks like one.
    this.material.uniforms.uFoamThreshold.value =
      lerp(1.16, 0.52, smoothstep(9, 46, this.seaWind));

    const chopRad = ((this.seaWindFrom + 180) * Math.PI) / 180;
    (this.material.uniforms.uChopDir.value as THREE.Vector2)
      .set(Math.sin(chopRad), Math.cos(chopRad));
    this.material.uniforms.uChop.value = clamp(this.seaWind / 26, 0, 1.3);

    this.advance(dEast, dNorth, dt);
  }

  /** Take the next weather whole instead of slewing into it. */
  reseed(): void {
    this.seeded = false;
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
    if (!head || Math.hypot(head.x, head.z) > TRACK_STEP) {
      this.track.unshift({ x: 0, z: 0, age: 0, run: 0 });
    }
    while (this.track.length > TRACK_POINTS) this.track.pop();
    // Drop the tail once it has faded out anyway.
    while (this.track.length > 2 && this.track[this.track.length - 1].age > 120) {
      this.track.pop();
    }

    // Distance run along the track from the ship, which is what sets the wake's
    // geometry. Measured along the path rather than straight-line, so a wake
    // laid through a turn keeps its width all the way round the bend.
    this.track[0].run = 0;
    for (let i = 1; i < this.track.length; i++) {
      const a = this.track[i - 1];
      const b = this.track[i];
      b.run = a.run + Math.hypot(b.x - a.x, b.z - a.z);
    }

    const pts = this.material.uniforms.uTrack.value as THREE.Vector2[];
    const ages = this.material.uniforms.uTrackAge.value as number[];
    const runs = this.material.uniforms.uTrackRun.value as number[];

    // Until she has run far enough to have a real track, the tail is carried on
    // in the direction she is going, so a ship that has just got under way still
    // leaves something astern instead of sitting in a puddle.
    const speed = Math.hypot(velocityE, velocityN);
    const tailX = speed > 0.05 ? (velocityE / speed) * -1 : 0;
    const tailZ = speed > 0.05 ? (velocityN / speed) : 0;
    const last = this.track[this.track.length - 1];

    for (let i = 0; i < TRACK_POINTS; i++) {
      if (i < this.track.length) {
        const p = this.track[i];
        pts[i].set(p.x, p.z);
        ages[i] = p.age;
        runs[i] = p.run;
      } else {
        const n = i - this.track.length + 1;
        const reach = TRACK_STEP * n;
        pts[i].set(last.x + tailX * reach, last.z + tailZ * reach);
        ages[i] = last.age + reach / Math.max(speed, 0.6);
        runs[i] = last.run + reach;
      }
    }
    this.material.uniforms.uTrackCount.value = TRACK_POINTS;
  }

  /**
   * Carry every wave's phase forward by one frame.
   *
   * Phase must be integrated, never evaluated from absolutes. A voyage runs to
   * millions of metres and the clock counts seconds since 1430, so the product
   * of a wavenumber and either of those is an enormous number — and the
   * wavenumber itself moves with the wind. Taking `k * c * t` directly means a
   * gust of a hundredth of a knot shifts the wavelength by a tenth of a
   * millimetre and the phase by several million radians: the sea is re-rolled
   * from scratch every frame and the water shivers in place instead of running.
   *
   * Integrating the increment `k * c * dt` instead makes a change in the wind a
   * change in the sea's *rate*, which is what it physically is. The wave train
   * then keeps running through gusts, through a shift of wind, and across twelve
   * thousand miles of ocean, and only ever needs a single turn of phase on the
   * GPU.
   */
  private advance(dEast: number, dNorth: number, dt: number): void {
    const TAU = Math.PI * 2;
    for (let i = 0; i < WAVE_COUNT; i++) {
      const k = TAU / this.lens[i];
      // Deep-water phase speed: long waves outrun short ones, which is what
      // makes a real sea look layered rather than like a single moving cloth.
      const c = Math.sqrt(9.81 / k);
      const d = this.dirs[i];
      const step = k * (d.x * dEast + d.y * -dNorth) - k * c * dt;
      this.phases[i] = ((this.phases[i] + step) % TAU + TAU) % TAU;
    }

    // The decorative noise fields are carried the same way and wrapped well
    // inside float precision.
    this.originE = wrap(this.originE + dEast, 20000);
    this.originN = wrap(this.originN + dNorth, 20000);
    this.noiseTime = wrap(this.noiseTime + dt, 4096);
    (this.material.uniforms.uNoiseOrigin.value as THREE.Vector2)
      .set(this.originE, -this.originN);
    this.material.uniforms.uNoiseTime.value = this.noiseTime;
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
    // The sea's distant colour: the horizon haze pulled well down toward deep
    // water, which is what puts a hard dark line under the sky where it belongs.
    (this.material.uniforms.uSeaFar.value as THREE.Color)
      .copy(horizon).lerp(new THREE.Color(0.05, 0.12, 0.20), 0.42);
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

/** Ease one compass bearing toward another the short way round. */
function slewAngle(from: number, to: number, k: number): number {
  let delta = ((to - from) % 360 + 540) % 360 - 180;
  return from + delta * k;
}

/**
 * Whether this is a handheld screen, for how much sea to build.
 *
 * A coarse pointer means fingers, which means a device with a battery and a
 * thermal budget; the width test keeps a touchscreen desktop out of it.
 */
function smallScreen(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches
    && Math.min(window.innerWidth, window.innerHeight) <= 900;
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
