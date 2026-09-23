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

varying vec3 vDir;

void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, -0.2, 1.0);

  // The dome reaches its zenith colour more slowly than it did. At 0.55 the
  // deep blue overhead took most of the frame the moment the zenith was made a
  // real blue, and the sky went from pale to navy within a hand's breadth of
  // the horizon — which is what a sky does through a polarising filter and not
  // what it does over an ocean.
  vec3 col = mix(uHorizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.82));

  // Glow around the sun, strongest along the horizon at sunrise and sunset.
  float sunDot = max(dot(d, uSunDir), 0.0);
  float halo = pow(sunDot, 6.0) * 0.55 + pow(sunDot, 90.0) * 1.6;
  float lowSun = 1.0 - smoothstep(-0.05, 0.35, uSunDir.y);
  col += uSunGlow * halo * (0.45 + lowSun * 1.5);

  // Overcast flattens the whole dome toward a uniform grey.
  col = mix(col, uCloudColor, uOvercast * (0.55 + 0.35 * (1.0 - up)));

  // A band of haze thickening down to the horizon, reaching the horizon colour
  // exactly at eye level. The sea fogs to the same colour at its rim, so the two
  // meet there without a seam.
  col = mix(col, uHorizon, smoothstep(0.30, 0.0, d.y));

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

/** Alt/az to a world direction, with X east, Y up, and north toward -Z. */
export function dirFromAltAz(altitude: number, azimuth: number): THREE.Vector3 {
  const alt = altitude * DEG;
  const az = azimuth * DEG;
  const ca = Math.cos(alt);
  return new THREE.Vector3(ca * Math.sin(az), Math.sin(alt), -ca * Math.cos(az));
}
