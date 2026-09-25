import * as THREE from 'three';
import { clamp, smoothstep, DEG } from '../core/math';
import { STARS, moonPosition, starPosition, sunPosition } from '../navigation/celestial';

const SKY_RADIUS = 11000;

/** Faint unnamed stars filling in the sky behind the navigational ones. */
const FILLER_STARS = 900;

/** A fixed pseudo-random sequence, so the same sky is drawn every session. */
function fillerRandom(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Declination for a filler star, distributed so the stars come out even over the
 * sphere. Drawing declination uniformly would crowd them round both poles.
 */
function fillerDec(k: number): number {
  return Math.asin(fillerRandom(k * 2 + 2) * 2 - 1) / DEG;
}

/** Asterisms a period navigator actually used, drawn so they can be recognised. */
const ASTERISMS: string[][] = [
  ['Acrux', 'Gacrux'],
  ['Mimosa', 'Acrux'],
  ['Dubhe', 'Merak'],
  ['Dubhe', 'Alioth'], ['Alioth', 'Mizar'], ['Mizar', 'Alkaid'],
  ['Merak', 'Phecda'], ['Phecda', 'Alioth'],
  ['Kochab', 'Pherkad'], ['Kochab', 'Polaris'],
  ['Alnitak', 'Alnilam'], ['Alnilam', 'Mintaka'],
  ['Betelgeuse', 'Alnilam'], ['Alnilam', 'Rigel'],
  ['Rigil Kentaurus', 'Hadar'],
  ['Schedar', 'Navi'], ['Navi', 'Caph'],
];

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const skyFragment = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunGlow;
uniform float uNight;
uniform float uOvercast;
uniform vec3 uCloudColor;
// The sun itself, which is not always the key light (see Sky.update).
uniform vec3 uSunDisc;
uniform float uSunVis;
uniform vec3 uSunColor;
uniform float uTwilight;
uniform vec3 uDuskWarm;
// The cloud deck: how much of the sky it covers, where the wind has carried it,
// and the two colours it is lit with.
uniform float uCover;
uniform vec2 uCloudOffset;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uCloudOn;

varying vec3 vDir;

float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Cumulus: a soft rounded body from the low octaves, with heaped, folded
// detail on its edges from the high ones.
float clouds(vec2 p) {
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  float body = 0.0;
  float a = 0.6;
  vec2 q = p * 0.55;
  for (int i = 0; i < 3; i++) {
    body += a * vnoise(q);
    q = rot * q * 2.1 + 5.3;
    a *= 0.5;
  }
  float detail = 0.0;
  a = 0.5;
  q = p * 2.2;
  for (int i = 0; i < CLOUD_OCTAVES - 3; i++) {
    detail += a * (1.0 - abs(vnoise(q) * 2.0 - 1.0));
    q = rot * q * 2.07 + 11.0;
    a *= 0.5;
  }
  return body * 1.05 + detail * 0.32;
}

void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, -0.2, 1.0);

  // The dome reaches its zenith colour slowly: a sky over open ocean stays pale
  // for a long way up from the horizon.
  vec3 col = mix(uHorizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.82));

  // Twilight is not one colour round the whole horizon. The sun's side burns
  // orange and gold; the opposite side carries the pink band and the blue-grey
  // shadow of the earth rising under it.
  vec2 hz = normalize(d.xz + 1e-5);
  vec2 sz = normalize(uSunDisc.xz + 1e-5);
  float toward = dot(hz, sz) * 0.5 + 0.5;
  float low = 1.0 - smoothstep(0.0, 0.42, d.y);
  vec3 warm = uDuskWarm * pow(toward, 2.2) * low;
  vec3 belt = vec3(0.55, 0.32, 0.42) * pow(1.0 - toward, 3.0)
            * smoothstep(0.02, 0.10, d.y) * (1.0 - smoothstep(0.10, 0.30, d.y));
  col += (warm * 0.9 + belt * 0.35) * uTwilight;

  // Glow about the key light (the sun, or the moon at night).
  float sunDot = max(dot(d, uSunDir), 0.0);
  float halo = pow(sunDot, 6.0) * 0.45 + pow(sunDot, 90.0) * 1.2 + pow(sunDot, 900.0) * 2.0;
  float lowSun = 1.0 - smoothstep(-0.05, 0.35, uSunDir.y);
  col += uSunGlow * halo * (0.45 + lowSun * 1.5);

  // The sun's own disc, drawn here so the clouds can pass in front of it.
  float discDot = dot(d, uSunDisc);
  float disc = smoothstep(0.99994, 0.99998, discDot);
  col += mix(uSunColor, vec3(1.0, 0.98, 0.92), 0.6) * disc * 6.0 * uSunVis;

  // The haze band, reaching the horizon colour exactly at eye level.
  col = mix(col, uHorizon, smoothstep(0.30, 0.0, d.y));

  // Clouds, on a flat deck a long way up, seen through the haze.
  if (uCloudOn > 0.5 && d.y > 0.02) {
    // Held back from the horizon, where the deck is seen so edge-on that the
    // noise is stretched into streaks; the haze has it by then anyway.
    float t = 1.0 / max(d.y, 0.02);
    vec2 p = d.xz * t * 0.9 + uCloudOffset;
    float n = clouds(p);
    // Coverage sets the threshold: a few fair-weather puffs in the trades, a
    // broken deck in unsettled weather, and a lid of grey when it is overcast.
    float cov = uCover;
    float th = mix(1.02, 0.30, cov);
    float dens = smoothstep(th, th + mix(0.16, 0.45, cov), n);
    // Lit from the sun's side: sample a little way toward it and see whether
    // the cloud thins, which is where light gets in.
    vec2 toSun = normalize(uSunDisc.xz + 1e-4) * 0.16;
    float n2 = clouds(p + toSun);
    float lit = clamp(0.62 + (n - n2) * 3.2, 0.0, 1.0);
    vec3 cc = mix(uCloudShade, uCloudLit, lit);
    // Thin edges near the sun light up white-gold.
    float lining = pow(max(dot(d, uSunDir), 0.0), 10.0) * (1.0 - dens) * 1.6;
    cc += uSunGlow * lining;
    // Clouds far off sink into the haze and lose their contrast.
    float far = smoothstep(0.02, 0.22, d.y);
    cc = mix(uHorizon, cc, 0.35 + 0.65 * far);
    // And gone entirely in the last few degrees, where every row of the sky
    // maps to nearly the same distance on the deck and the noise can only vary
    // sideways — which draws as vertical streaks.
    dens *= smoothstep(0.03, 0.11, d.y);
    col = mix(col, cc, dens * mix(0.35, 1.0, far));
  }

  // A heavy deck closes completely: no blue left between the clouds, just the
  // grey underside of the weather from one horizon to the other.
  if (uCloudOn > 0.5) {
    float lid = smoothstep(0.72, 0.98, uCover) * smoothstep(-0.02, 0.12, d.y);
    col = mix(col, mix(uCloudShade, uHorizon, 0.25), lid * 0.85);
  }

  // Overcast flattens what is left toward a uniform grey.
  col = mix(col, uCloudColor, uOvercast * 0.55 * (0.55 + 0.35 * (1.0 - up)));

  gl_FragColor = vec4(col, 1.0);
}
`;

const starVertex = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = uOpacity;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize;
}
`;

const starFragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.06, d);
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`;

/** A radial falloff, white at the centre and gone at the rim. */
function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface SkyLighting {
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  zenith: THREE.Color;
  horizon: THREE.Color;
  ambient: THREE.Color;
  /** 0 full day, 1 full night. */
  night: number;
  intensity: number;
  /**
   * How much the moon is lighting the night, 0 to 1: up, full, and the sky
   * clear. When it is, `sunDir` and `sunColor` are the moon's, so everything
   * downstream that is lit by "the sun" — the key light, the shadows, the
   * glitter on the water — is lit by the moon instead.
   */
  moon: number;
}

export class Sky {
  group = new THREE.Group();

  private dome: THREE.Mesh;
  private domeMaterial: THREE.ShaderMaterial;
  private starPoints: THREE.Points;
  private starMaterial: THREE.ShaderMaterial;
  private starPositions: Float32Array;
  private lines: THREE.LineSegments;
  private lineMaterial: THREE.LineBasicMaterial;
  private linePositions: Float32Array;
  private sunSprite: THREE.Mesh;
  private moonSprite: THREE.Mesh;
  /** A soft disc of light behind the moon, which is how a bright moon reads. */
  private moonGlow: THREE.Mesh;

  private lastUpdate = -1e9;
  private lastLat = 999;

  constructor() {
    this.domeMaterial = new THREE.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      defines: { CLOUD_OCTAVES: phoneish() ? 4 : 6 },
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: new THREE.Color(0.18, 0.38, 0.72) },
        uHorizon: { value: new THREE.Color(0.68, 0.78, 0.88) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunGlow: { value: new THREE.Color(1, 0.82, 0.55) },
        uNight: { value: 0 },
        uOvercast: { value: 0 },
        uCloudColor: { value: new THREE.Color(0.55, 0.57, 0.6) },
        uSunDisc: { value: new THREE.Vector3(0, 1, 0) },
        uSunVis: { value: 1 },
        uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
        uTwilight: { value: 0 },
        uDuskWarm: { value: new THREE.Color(1.0, 0.45, 0.12) },
        uCover: { value: 0.3 },
        uCloudOffset: { value: new THREE.Vector2(0, 0) },
        uCloudLit: { value: new THREE.Color(1, 1, 1) },
        uCloudShade: { value: new THREE.Color(0.6, 0.65, 0.72) },
        uCloudOn: { value: 1 },
      },
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 40, 24), this.domeMaterial);
    this.dome.renderOrder = -100;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // --- Stars -------------------------------------------------------------
    // The named stars are the ones a navigator shoots and the ones the asterism
    // lines are drawn between. On their own they make a sky of forty points,
    // which is not a night sky; the rest of the firmament is filled in behind
    // them with faint stars that carry no meaning but without which the real
    // ones have nothing to stand out from.
    const n = STARS.length + FILLER_STARS;
    this.starPositions = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const named = i < STARS.length;
      const m = named ? STARS[i].mag : 3.6 + fillerRandom(i) * 2.6;
      sizes[i] = named ? clamp(13 - m * 2.6, 3.0, 16) : clamp(7.4 - m * 1.05, 1.3, 4.2);
      // Rough colour by magnitude class; the bright ones read as slightly warm.
      const c = new THREE.Color().setHSL(
        0.58 - clamp((2 - m) * 0.02, -0.05, 0.06), 0.25, named ? 0.92 : 0.8,
      );
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(this.starPositions, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    starGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SKY_RADIUS * 1.1);

    this.starMaterial = new THREE.ShaderMaterial({
      vertexShader: starVertex,
      fragmentShader: starFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 0 } },
    });
    this.starPoints = new THREE.Points(starGeo, this.starMaterial);
    this.starPoints.frustumCulled = false;
    this.starPoints.renderOrder = -90;
    this.group.add(this.starPoints);

    // --- Asterism lines ----------------------------------------------------
    this.linePositions = new Float32Array(ASTERISMS.length * 6);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
    lineGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SKY_RADIUS * 1.1);
    this.lineMaterial = new THREE.LineBasicMaterial({
      color: 0x5f7fa8, transparent: true, opacity: 0, depthWrite: false,
    });
    this.lines = new THREE.LineSegments(lineGeo, this.lineMaterial);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = -89;
    this.group.add(this.lines);

    // --- Sun and moon ------------------------------------------------------
    this.sunSprite = new THREE.Mesh(
      new THREE.CircleGeometry(150, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff4dc, transparent: true, depthWrite: false }),
    );
    this.sunSprite.renderOrder = -88;
    // The disc is drawn in the dome now, under the clouds; the sprite is kept
    // only so nothing else that refers to it has to change.
    this.sunSprite.visible = false;
    this.group.add(this.sunSprite);

    this.moonGlow = new THREE.Mesh(
      new THREE.CircleGeometry(420, 32),
      new THREE.MeshBasicMaterial({
        color: 0x9fb6e0, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, map: glowTexture(),
      }),
    );
    this.moonGlow.renderOrder = -87.5;
    this.group.add(this.moonGlow);

    this.moonSprite = new THREE.Mesh(
      new THREE.CircleGeometry(125, 32),
      new THREE.MeshBasicMaterial({ color: 0xf2f5fb, transparent: true, depthWrite: false }),
    );
    this.moonSprite.renderOrder = -87;
    this.group.add(this.moonSprite);
  }

  /** Carry the cloud deck downwind. `dt` in real seconds. */
  drift(windFromDeg: number, knots: number, dt: number): void {
    const to = (windFromDeg + 180) * DEG;
    const off = this.domeMaterial.uniforms.uCloudOffset.value as THREE.Vector2;
    const k = (0.004 + knots * 0.0009) * dt;
    off.x += Math.sin(to) * k;
    off.y -= Math.cos(to) * k;
    // Kept small, so the noise never runs out of precision.
    if (Math.abs(off.x) > 4000) off.x = 0;
    if (Math.abs(off.y) > 4000) off.y = 0;
  }

  /**
   * Update the sky for a place and time. Star positions are only recomputed
   * every few simulated minutes, which is far more often than the sky visibly
   * changes and far less often than every frame.
   */
  update(
    lat: number, lon: number, dayFromEpoch: number, hourLocal: number,
    dayOfYear: number, year: number, cloud: number, simTime: number,
  ): SkyLighting {
    const sun = sunPosition(lat, lon, dayFromEpoch, hourLocal, dayOfYear);
    const sunDir = dirFromAltAz(sun.altitude, sun.azimuth);

    // --- Lighting ----------------------------------------------------------
    const night = 1 - smoothstep(-8, 4, sun.altitude);
    const twilight = smoothstep(-12, 2, sun.altitude) * (1 - smoothstep(2, 16, sun.altitude));

    const zenith = new THREE.Color();
    const horizon = new THREE.Color();
    const sunColor = new THREE.Color();
    const ambient = new THREE.Color();

    // Deeper overhead and warmer at the rim than before. A real tropical noon
    // sky is a far stronger blue than a temperate one and the eye knows it;
    // the old zenith was a pastel that went grey the moment the tone curve
    // touched it.
    const dayZenith = new THREE.Color(0.10, 0.32, 0.82);
    const dayHorizon = new THREE.Color(0.66, 0.80, 0.94);
    const duskZenith = new THREE.Color(0.11, 0.13, 0.38);
    const duskHorizon = new THREE.Color(0.98, 0.44, 0.18);
    // Night is not black. With no moon at all a clear tropical sky over open
    // water still shows a horizon, the loom of the sea and the ship's own
    // shape against the stars, and a sky this dark read as a switched-off
    // screen rather than as night.
    const nightZenith = new THREE.Color(0.016, 0.028, 0.075);
    const nightHorizon = new THREE.Color(0.055, 0.085, 0.16);

    // And the moon, which is most of what a night at sea actually looks like.
    // Its light is scaled by how much of the disc is lit and how high it is,
    // and a sky full of cloud puts it out.
    const moon = moonPosition(lat, lon, dayFromEpoch, hourLocal);
    const moonDir = dirFromAltAz(moon.altitude, moon.azimuth);
    const overcast = clamp(cloud, 0, 1) * 0.85;
    const moonUp = smoothstep(-1, 10, moon.altitude) * (0.12 + 0.88 * moon.phase)
      * (1 - overcast * 0.85);
    const moonlight = night * moonUp;

    zenith.copy(dayZenith).lerp(duskZenith, twilight).lerp(nightZenith, night)
      // A moonlit sky is a deep clear blue, not black.
      .lerp(new THREE.Color(0.04, 0.08, 0.20), moonlight * 0.85);
    horizon.copy(dayHorizon).lerp(duskHorizon, twilight).lerp(nightHorizon, night)
      .lerp(new THREE.Color(0.11, 0.16, 0.28), moonlight * 0.85);

    sunColor.setRGB(1, 0.96, 0.88)
      .lerp(new THREE.Color(1, 0.62, 0.34), twilight)
      .lerp(new THREE.Color(0.32, 0.40, 0.62), night);

    // More light off the sky dome. The shaded side of a hull under a bright sky
    // is not black — it is lit by the whole upper hemisphere — and at 0.55 the
    // ship's lee side and the underside of every sail were crushed to mud.
    ambient.copy(horizon).multiplyScalar(0.72)
      .lerp(new THREE.Color(0.09, 0.12, 0.24).lerp(new THREE.Color(0.14, 0.19, 0.34), moonlight), night * 0.8);

    let intensity = clamp(smoothstep(-6, 12, sun.altitude), 0.02, 1) * (1 - overcast * 0.55);

    // Once the sun is well down, the key light is the moon's: its direction,
    // a cold silver, and a strength that at the full is enough to throw a
    // shadow and lay a path of light across the water. The swap happens where
    // the sun's own light has already gone to nothing, so there is no jump.
    let keyDir = sunDir;
    if (night > 0.6 && moon.altitude > -1) {
      keyDir = moonDir;
      sunColor.setRGB(0.72, 0.82, 1.0);
      intensity = Math.max(intensity, moonlight * 0.34);
    }

    // --- Dome --------------------------------------------------------------
    (this.domeMaterial.uniforms.uZenith.value as THREE.Color).copy(zenith);
    (this.domeMaterial.uniforms.uHorizon.value as THREE.Color).copy(horizon);
    (this.domeMaterial.uniforms.uSunDir.value as THREE.Vector3).copy(keyDir);
    // Round the moon, a silver halo in place of the sun's.
    (this.domeMaterial.uniforms.uSunGlow.value as THREE.Color)
      .setRGB(1, 0.78, 0.5).lerp(new THREE.Color(0.15, 0.2, 0.35), night)
      .lerp(new THREE.Color(0.30, 0.38, 0.58), moonlight);
    this.domeMaterial.uniforms.uNight.value = night;
    this.domeMaterial.uniforms.uOvercast.value = overcast;
    const u = this.domeMaterial.uniforms;
    (u.uSunDisc.value as THREE.Vector3).copy(sunDir);
    u.uSunVis.value = clamp(smoothstep(-1.5, 1.5, sun.altitude) * (1 - overcast), 0, 1);
    (u.uSunColor.value as THREE.Color).setRGB(1, 0.96, 0.88).lerp(new THREE.Color(1, 0.55, 0.25), twilight);
    u.uTwilight.value = twilight * (1 - overcast * 0.7);
    (u.uDuskWarm.value as THREE.Color).setRGB(1.0, 0.42, 0.10).lerp(new THREE.Color(0.85, 0.25, 0.12), smoothstep(0, -6, sun.altitude));
    // A fair-weather sky is never empty: trade cumulus at a quarter cover even
    // on the clearest day, building to a full grey deck with the weather.
    u.uCover.value = clamp(0.22 + clamp(cloud, 0, 1) * 0.78, 0, 1);
    // The cloud is lit by whatever lights everything else, and its underside by
    // the sky; at night both go almost to nothing, and the moon silvers it.
    const dayLit = new THREE.Color(1, 0.99, 0.97).lerp(new THREE.Color(1.0, 0.62, 0.38), twilight);
    (u.uCloudLit.value as THREE.Color).copy(dayLit)
      .multiplyScalar(0.25 + 0.75 * (1 - night))
      .lerp(new THREE.Color(0.30, 0.34, 0.44), night * (1 - moonlight * 0.4))
      .multiplyScalar(1 - overcast * 0.5);
    (u.uCloudShade.value as THREE.Color).copy(zenith).lerp(horizon, 0.55).lerp(new THREE.Color(0.52, 0.55, 0.62), 0.45)
      .lerp(new THREE.Color(0.7, 0.42, 0.40), twilight * 0.5)
      .multiplyScalar(Math.max(0.05, 1 - overcast * 0.62 - night * 0.55));

    // --- Bodies ------------------------------------------------------------
    this.sunSprite.position.copy(sunDir).multiplyScalar(SKY_RADIUS * 0.94);
    this.sunSprite.lookAt(0, 0, 0);
    (this.sunSprite.material as THREE.MeshBasicMaterial).opacity =
      clamp(smoothstep(-3, 2, sun.altitude) * (1 - overcast * 0.9), 0, 1);

    this.moonSprite.position.copy(moonDir).multiplyScalar(SKY_RADIUS * 0.93);
    this.moonSprite.lookAt(0, 0, 0);
    (this.moonSprite.material as THREE.MeshBasicMaterial).opacity =
      clamp(smoothstep(-2, 4, moon.altitude) * (0.35 + moon.phase * 0.65) * (1 - overcast * 0.9), 0, 1);
    this.moonGlow.position.copy(moonDir).multiplyScalar(SKY_RADIUS * 0.935);
    this.moonGlow.lookAt(0, 0, 0);
    (this.moonGlow.material as THREE.MeshBasicMaterial).opacity =
      clamp(smoothstep(-2, 4, moon.altitude) * moon.phase * night * (1 - overcast * 0.9), 0, 1) * 0.22;

    // --- Stars -------------------------------------------------------------
    const starVisibility = clamp(night * 1.35 - overcast * 1.1, 0, 1);
    this.starMaterial.uniforms.uOpacity.value = starVisibility;
    this.lineMaterial.opacity = starVisibility * 0.32;

    const moved = Math.abs(lat - this.lastLat) > 0.35;
    if (starVisibility > 0.01 && (simTime - this.lastUpdate > 240 || moved)) {
      this.lastUpdate = simTime;
      this.lastLat = lat;
      this.recomputeStars(lat, lon, dayFromEpoch, hourLocal, year);
    }

    return { sunDir: keyDir, sunColor, zenith, horizon, ambient, night, intensity, moon: moonlight };
  }

  private recomputeStars(
    lat: number, lon: number, dayFromEpoch: number, hourLocal: number, year: number,
  ): void {
    const byName = new Map<string, THREE.Vector3>();
    const place = (i: number, h: { altitude: number; azimuth: number }): THREE.Vector3 => {
      const d = dirFromAltAz(h.altitude, h.azimuth).multiplyScalar(SKY_RADIUS * 0.97);
      // Stars below the horizon are pulled far below, where nothing sees them.
      const below = h.altitude < -1;
      this.starPositions[i * 3] = below ? 0 : d.x;
      this.starPositions[i * 3 + 1] = below ? -SKY_RADIUS * 2 : d.y;
      this.starPositions[i * 3 + 2] = below ? 0 : d.z;
      return d;
    };

    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i];
      byName.set(s.name, place(i, starPosition(s, lat, lon, dayFromEpoch, hourLocal, year)));
    }
    // The filler stars are carried on the same celestial sphere as the named
    // ones, so the whole sky wheels together and a player who learns to steer by
    // a pattern of faint stars is not being lied to.
    for (let k = 0; k < FILLER_STARS; k++) {
      const fake = { name: '', ra: fillerRandom(k * 2 + 1) * 360, dec: fillerDec(k), mag: 4 };
      place(STARS.length + k, starPosition(fake, lat, lon, dayFromEpoch, hourLocal, year));
    }
    (this.starPoints.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

    for (let i = 0; i < ASTERISMS.length; i++) {
      const [a, b] = ASTERISMS[i];
      const pa = byName.get(a);
      const pb = byName.get(b);
      const o = i * 6;
      if (!pa || !pb || pa.y < 0 || pb.y < 0) {
        for (let k = 0; k < 6; k++) this.linePositions[o + k] = 0;
        continue;
      }
      this.linePositions[o] = pa.x; this.linePositions[o + 1] = pa.y; this.linePositions[o + 2] = pa.z;
      this.linePositions[o + 3] = pb.x; this.linePositions[o + 4] = pb.y; this.linePositions[o + 5] = pb.z;
    }
    (this.lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.dome.geometry.dispose();
    this.domeMaterial.dispose();
    this.starPoints.geometry.dispose();
    this.starMaterial.dispose();
    this.lines.geometry.dispose();
    this.lineMaterial.dispose();
  }
}

/** A small screen: fewer octaves of cloud. */
function phoneish(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia
    && window.matchMedia('(max-width: 860px), (pointer: coarse)').matches;
}

/** Alt/az to a world direction, with X east, Y up, and north toward -Z. */
export function dirFromAltAz(altitude: number, azimuth: number): THREE.Vector3 {
  const alt = altitude * DEG;
  const az = azimuth * DEG;
  const ca = Math.cos(alt);
  return new THREE.Vector3(ca * Math.sin(az), Math.sin(alt), -ca * Math.cos(az));
}
