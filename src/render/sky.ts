import * as THREE from 'three';
import { clamp, smoothstep, DEG } from '../core/math';
import { STARS, moonPosition, starPosition, sunPosition } from '../navigation/celestial';

const SKY_RADIUS = 11000;

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

  vec3 col = mix(uHorizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.55));

  // Glow around the sun, strongest along the horizon at sunrise and sunset.
  float sunDot = max(dot(d, uSunDir), 0.0);
  float halo = pow(sunDot, 6.0) * 0.55 + pow(sunDot, 90.0) * 1.6;
  float lowSun = 1.0 - smoothstep(-0.05, 0.35, uSunDir.y);
  col += uSunGlow * halo * (0.45 + lowSun * 1.5);

  // Overcast flattens the whole dome toward a uniform grey.
  col = mix(col, uCloudColor, uOvercast * (0.55 + 0.35 * (1.0 - up)));

  // A band of haze thickening down to the horizon.
  col = mix(col, uHorizon, smoothstep(0.22, -0.06, d.y) * 0.8);

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

export interface SkyLighting {
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  zenith: THREE.Color;
  horizon: THREE.Color;
  ambient: THREE.Color;
  /** 0 full day, 1 full night. */
  night: number;
  intensity: number;
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
    const n = STARS.length;
    this.starPositions = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const m = STARS[i].mag;
      sizes[i] = clamp(13 - m * 2.6, 2.6, 16);
      // Rough colour by magnitude class; the bright ones read as slightly warm.
      const c = new THREE.Color().setHSL(0.58 - clamp((2 - m) * 0.02, -0.05, 0.06), 0.25, 0.92);
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

    this.moonSprite = new THREE.Mesh(
      new THREE.CircleGeometry(95, 24),
      new THREE.MeshBasicMaterial({ color: 0xdde3ee, transparent: true, depthWrite: false }),
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

    const dayZenith = new THREE.Color(0.16, 0.37, 0.72);
    const dayHorizon = new THREE.Color(0.70, 0.80, 0.90);
    const duskZenith = new THREE.Color(0.14, 0.16, 0.36);
    const duskHorizon = new THREE.Color(0.86, 0.46, 0.24);
    const nightZenith = new THREE.Color(0.008, 0.014, 0.045);
    const nightHorizon = new THREE.Color(0.03, 0.05, 0.10);

    zenith.copy(dayZenith).lerp(duskZenith, twilight).lerp(nightZenith, night);
    horizon.copy(dayHorizon).lerp(duskHorizon, twilight).lerp(nightHorizon, night);

    sunColor.setRGB(1, 0.96, 0.88)
      .lerp(new THREE.Color(1, 0.62, 0.34), twilight)
      .lerp(new THREE.Color(0.32, 0.40, 0.62), night);

    ambient.copy(horizon).multiplyScalar(0.55).lerp(new THREE.Color(0.04, 0.06, 0.13), night * 0.8);

    const overcast = clamp(cloud, 0, 1) * 0.85;
    const intensity = clamp(smoothstep(-6, 12, sun.altitude), 0.02, 1) * (1 - overcast * 0.55);

    // --- Dome --------------------------------------------------------------
    (this.domeMaterial.uniforms.uZenith.value as THREE.Color).copy(zenith);
    (this.domeMaterial.uniforms.uHorizon.value as THREE.Color).copy(horizon);
    (this.domeMaterial.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir);
    (this.domeMaterial.uniforms.uSunGlow.value as THREE.Color)
      .setRGB(1, 0.78, 0.5).lerp(new THREE.Color(0.15, 0.2, 0.35), night);
    this.domeMaterial.uniforms.uNight.value = night;
    this.domeMaterial.uniforms.uOvercast.value = overcast;

    // --- Bodies ------------------------------------------------------------
    this.sunSprite.position.copy(sunDir).multiplyScalar(SKY_RADIUS * 0.94);
    this.sunSprite.lookAt(0, 0, 0);
    (this.sunSprite.material as THREE.MeshBasicMaterial).opacity =
      clamp(smoothstep(-3, 2, sun.altitude) * (1 - overcast * 0.9), 0, 1);

    const moon = moonPosition(lat, lon, dayFromEpoch, hourLocal);
    const moonDir = dirFromAltAz(moon.altitude, moon.azimuth);
    this.moonSprite.position.copy(moonDir).multiplyScalar(SKY_RADIUS * 0.93);
    this.moonSprite.lookAt(0, 0, 0);
    (this.moonSprite.material as THREE.MeshBasicMaterial).opacity =
      clamp(smoothstep(-2, 4, moon.altitude) * (0.25 + moon.phase * 0.75) * (1 - overcast * 0.9), 0, 1);

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

    return { sunDir, sunColor, zenith, horizon, ambient, night, intensity };
  }

  private recomputeStars(
    lat: number, lon: number, dayFromEpoch: number, hourLocal: number, year: number,
  ): void {
    const byName = new Map<string, THREE.Vector3>();
    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i];
      const h = starPosition(s, lat, lon, dayFromEpoch, hourLocal, year);
      const d = dirFromAltAz(h.altitude, h.azimuth).multiplyScalar(SKY_RADIUS * 0.97);
      // Stars below the horizon are pulled to the origin, where nothing sees them.
      const below = h.altitude < -1;
      this.starPositions[i * 3] = below ? 0 : d.x;
      this.starPositions[i * 3 + 1] = below ? -SKY_RADIUS * 2 : d.y;
      this.starPositions[i * 3 + 2] = below ? 0 : d.z;
      byName.set(s.name, d);
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
