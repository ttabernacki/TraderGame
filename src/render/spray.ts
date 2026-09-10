import * as THREE from 'three';
import { clamp } from '../core/math';

const MAX = 420;

const vertexShader = /* glsl */ `
attribute float aLife;
attribute float aSize;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // Sprites shrink with distance, and grow a little as the drop breaks up.
  gl_PointSize = aSize * (1.0 + (1.0 - aLife) * 1.6) * (260.0 / max(-mv.z, 8.0));
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
varying float vLife;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.08, d);
  gl_FragColor = vec4(uColor, soft * vLife * 0.85);
}
`;

interface Drop {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  decay: number;
}

/**
 * Spray thrown up when the bow goes into a sea.
 *
 * Nothing conveys that a ship is being driven hard like water coming over the
 * bow, and nothing conveys a flat calm like its absence, so the emission rate is
 * taken straight from the speed, the sea state and how far she is pitching.
 */
export class Spray {
  points: THREE.Points;

  private drops: Drop[] = [];
  private positions = new Float32Array(MAX * 3);
  private lives = new Float32Array(MAX);
  private sizes = new Float32Array(MAX);
  private material: THREE.ShaderMaterial;
  private carry = 0;

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.lives, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(0.95, 0.97, 1.0) } },
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  setLight(color: THREE.Color, night: number): void {
    (this.material.uniforms.uColor.value as THREE.Color)
      .copy(color).multiplyScalar(0.35).addScalar(0.62 * (1 - night * 0.6));
  }

  /**
   * `bow` is where the stem meets the water in the ship's local frame, `forward`
   * her heading as a unit vector, and `pitchRate` how fast she is coming down
   * onto the sea.
   */
  update(
    dt: number,
    bow: THREE.Vector3,
    forward: THREE.Vector3,
    speed: number,
    waveHeight: number,
    windKnots: number,
    pitchRate: number,
  ): void {
    // Emission needs both way on and a sea to put the bow into.
    const drive = clamp(speed / 6, 0, 1.6);
    const sea = clamp(waveHeight / 2.2, 0, 3);
    const slam = clamp(Math.abs(pitchRate) / 8, 0, 2);
    const rate = drive * sea * (1 + slam * 2.2) * 26;

    this.carry += rate * dt;
    const spawn = Math.min(Math.floor(this.carry), 40);
    this.carry -= spawn;

    const side = new THREE.Vector3(forward.z, 0, -forward.x);
    for (let i = 0; i < spawn && this.drops.length < MAX; i++) {
      const lateral = (Math.random() * 2 - 1);
      const speedOut = 1.6 + drive * 3.4 + slam * 3;
      this.drops.push({
        x: bow.x + side.x * lateral * 1.4 + forward.x * (Math.random() - 0.3) * 2,
        y: bow.y + Math.random() * 0.7,
        z: bow.z + side.z * lateral * 1.4 + forward.z * (Math.random() - 0.3) * 2,
        vx: side.x * lateral * speedOut + forward.x * drive * 1.4,
        vy: 2.4 + Math.random() * 3.2 + slam * 2.6,
        vz: side.z * lateral * speedOut + forward.z * drive * 1.4,
        life: 1,
        decay: 0.5 + Math.random() * 0.55,
      });
    }

    // The wind carries the spray away to leeward.
    const blow = clamp(windKnots / 30, 0, 1.4);
    let n = 0;
    for (const d of this.drops) {
      d.life -= d.decay * dt;
      if (d.life <= 0) continue;
      d.vy -= 9.81 * dt;
      d.vx -= d.vx * 1.1 * dt;
      d.vz -= d.vz * 1.1 * dt;
      d.vx -= forward.x * blow * 4 * dt;
      d.vz -= forward.z * blow * 4 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      if (d.y < 0) continue;

      this.positions[n * 3] = d.x;
      this.positions[n * 3 + 1] = d.y;
      this.positions[n * 3 + 2] = d.z;
      this.lives[n] = d.life;
      this.sizes[n] = 0.09 + (1 - d.life) * 0.05;
      n++;
      if (n >= MAX) break;
    }
    this.drops = this.drops.filter((d) => d.life > 0 && d.y >= 0);

    this.points.geometry.setDrawRange(0, n);
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('aLife') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
