import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/math';

/**
 * The weather you can see and the life you can see.
 *
 * Everything here is drawn on the real-seconds clock and none of it is
 * simulated: rain is where the weather says it is raining, lightning where a
 * storm is on her, birds where there is land within their range, and the rest
 * — dolphins at the bow, flying fish skittering off the swell in the tropics, a
 * whale blowing two miles off — turns up now and then, which is how it turned
 * up in every journal that mentions it.
 */
export interface LifeFrame {
  /** Real seconds since the last frame, and a running real clock. */
  dt: number;
  t: number;
  camera: THREE.Camera;
  /** 0 to 1. */
  rain: number;
  /** A storm system is on her: lightning is possible. */
  storm: boolean;
  windFrom: number;
  windKnots: number;
  night: number;
  /** Miles to the nearest land, or Infinity. */
  landNm: number;
  lat: number;
  speedKnots: number;
  /** Her heading, degrees true, as drawn. */
  heading: number;
  /** Her length, for placing things about the bow. */
  length: number;
  /** Height of the sea surface at the ship, which the ship rides on. */
  seaY: number;
  /** How much life to draw, 0 to 1, from the quality setting. */
  detail: number;
}

const RAIN_BOX = 70;

export class Life {
  group = new THREE.Group();
  /** How bright a lightning flash is right now, 0 to 1. The renderer lights the scene by it. */
  flash = 0;

  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private rainSeed: Float32Array;
  private rainMat = new THREE.LineBasicMaterial({ color: 0xc8d2dc, transparent: true, opacity: 0, depthWrite: false });
  private rainCount: number;

  private bolt: THREE.Line;
  private boltMat = new THREE.LineBasicMaterial({ color: 0xf4f6ff, transparent: true, opacity: 0, fog: false, depthWrite: false });
  private nextFlash = 6;
  private flashAge = 99;

  private birds: THREE.InstancedMesh;
  private birdState: { r: number; h: number; speed: number; phase: number; flap: number; big: boolean }[] = [];
  private birdMat = new THREE.MeshLambertMaterial({ color: 0xf0eee8, side: THREE.DoubleSide });

  private dolphins: THREE.InstancedMesh;
  private podUntil = -1;
  private nextPod = 60;
  private podSide = 1;

  private fish: THREE.InstancedMesh;
  private flightAge = 99;
  private nextFlight = 20;
  private flightSeed: number[] = [];

  private spout: THREE.Sprite;
  private hump: THREE.Mesh;
  private whaleAge = 99;
  private nextWhale = 90;
  private whaleAt = new THREE.Vector3();

  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(maxRain = 1400) {
    // Rain: short streaks in a box that travels with the eye.
    this.rainCount = maxRain;
    this.rainPos = new Float32Array(maxRain * 6);
    this.rainSeed = new Float32Array(maxRain * 3);
    for (let i = 0; i < maxRain; i++) {
      this.rainSeed[i * 3] = Math.random();
      this.rainSeed[i * 3 + 1] = Math.random();
      this.rainSeed[i * 3 + 2] = Math.random();
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(rg, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.group.add(this.rain);

    // A bolt: a jagged line from the cloud base to the sea, rebuilt each strike.
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
    this.bolt = new THREE.Line(bg, this.boltMat);
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    this.group.add(this.bolt);

    // Birds: a shallow V, flapped by scaling it through the flat.
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0.35, -1, 0.45, -0.1, 0, 0, -0.25,
      0, 0, 0.35, 0, 0, -0.25, 1, 0.45, -0.1,
      0, 0.02, 0.5, 0, 0.02, -0.5, 0.12, 0.02, 0,
    ], 3));
    wing.computeVertexNormals();
    this.birds = new THREE.InstancedMesh(wing, this.birdMat, 14);
    this.birds.frustumCulled = false;
    this.birds.count = 0;
    this.group.add(this.birds);
    for (let i = 0; i < 14; i++) {
      this.birdState.push({
        r: 25 + Math.random() * 70, h: 14 + Math.random() * 40,
        speed: (0.18 + Math.random() * 0.2) * (Math.random() < 0.5 ? 1 : -1),
        phase: Math.random() * Math.PI * 2, flap: 3.5 + Math.random() * 2, big: i === 0,
      });
    }

    // Dolphins: a long body and a fin, grey above.
    const body = new THREE.SphereGeometry(0.5, 10, 6);
    body.scale(0.42, 0.42, 2.2);
    const fin = new THREE.ConeGeometry(0.16, 0.45, 4);
    fin.translate(0, 0.32, -0.1);
    const tail = new THREE.ConeGeometry(0.28, 0.5, 4);
    tail.rotateX(-Math.PI / 2); tail.scale(1.6, 0.25, 1); tail.translate(0, 0, -1.25);
    const pod = mergeSimple([body, fin, tail]);
    this.dolphins = new THREE.InstancedMesh(pod, new THREE.MeshStandardMaterial({ color: 0x3c4853, roughness: 0.4, metalness: 0.05 }), 5);
    this.dolphins.frustumCulled = false;
    this.dolphins.count = 0;
    this.group.add(this.dolphins);

    // Flying fish: a sliver with its fins spread.
    const f = new THREE.BufferGeometry();
    f.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0.18, -0.2, 0, -0.02, 0, 0, -0.14,
      0, 0, 0.18, 0, 0, -0.14, 0.2, 0, -0.02,
    ], 3));
    f.computeVertexNormals();
    this.fish = new THREE.InstancedMesh(f, new THREE.MeshStandardMaterial({ color: 0xc8d6e4, roughness: 0.25, metalness: 0.6, side: THREE.DoubleSide }), 12);
    this.fish.frustumCulled = false;
    this.fish.count = 0;
    this.group.add(this.fish);

    // A whale: the blow, and the long dark back that rolls up under it.
    this.spout = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTexture(), transparent: true, opacity: 0, depthWrite: false }));
    this.spout.visible = false;
    this.group.add(this.spout);
    const back = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    back.scale(4, 1.8, 15);
    this.hump = new THREE.Mesh(back, new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.5 }));
    this.hump.visible = false;
    this.group.add(this.hump);
  }

  update(f: LifeFrame): void {
    this.updateRain(f);
    this.updateLightning(f);
    this.updateBirds(f);
    this.updateDolphins(f);
    this.updateFish(f);
    this.updateWhale(f);
  }

  private updateRain(f: LifeFrame): void {
    const on = f.rain > 0.06 && f.detail > 0;
    this.rain.visible = on;
    if (!on) return;
    const n = Math.floor(this.rainCount * clamp(f.rain * 1.2, 0.15, 1) * lerp(0.35, 1, f.detail));
    const cam = f.camera.position;
    // Falling at about nine metres a second, driven slantwise by the wind.
    const to = ((f.windFrom + 180) * Math.PI) / 180;
    const drift = clamp(f.windKnots, 0, 50) * 0.18;
    const vx = Math.sin(to) * drift, vz = -Math.cos(to) * drift, vy = -9.5;
    const len = 0.09;
    const p = this.rainPos;
    for (let i = 0; i < this.rainCount; i++) {
      if (i >= n) { p.fill(0, i * 6, i * 6 + 6); continue; }
      const sx = this.rainSeed[i * 3], sy = this.rainSeed[i * 3 + 1], sz = this.rainSeed[i * 3 + 2];
      // Each drop's height runs down on its own phase; the box follows the eye.
      const fall = (sy - f.t * 0.13 * (0.9 + sx * 0.2)) % 1;
      const yy = ((fall + 1) % 1) * RAIN_BOX - RAIN_BOX * 0.4;
      const x = cam.x + (sx - 0.5) * RAIN_BOX + vx * yy * -0.1;
      const z = cam.z + (sz - 0.5) * RAIN_BOX + vz * yy * -0.1;
      const y = cam.y + yy;
      p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
      p[i * 6 + 3] = x + vx * len; p[i * 6 + 4] = y + vy * len; p[i * 6 + 5] = z + vz * len;
    }
    (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.rainMat.opacity = clamp(f.rain, 0, 1) * lerp(0.42, 0.18, f.night);
  }

  private updateLightning(f: LifeFrame): void {
    this.flashAge += f.dt;
    if (f.storm && f.rain > 0.35) {
      this.nextFlash -= f.dt;
      if (this.nextFlash <= 0) {
        this.nextFlash = 4 + Math.random() * 12;
        this.flashAge = 0;
        this.strike(f);
      }
    }
    // Two or three flickers over a third of a second, then gone.
    const a = this.flashAge;
    this.flash = a > 0.45 ? 0
      : Math.max(0, 1 - a / 0.45) * (0.55 + 0.45 * Math.abs(Math.sin(a * 42)));
    this.bolt.visible = this.flash > 0.08;
    this.boltMat.opacity = this.flash;
  }

  private strike(f: LifeFrame): void {
    const ang = Math.random() * Math.PI * 2;
    const dist = 2500 + Math.random() * 6000;
    const x0 = f.camera.position.x + Math.cos(ang) * dist;
    const z0 = f.camera.position.z + Math.sin(ang) * dist;
    const pos = this.bolt.geometry.getAttribute('position') as THREE.BufferAttribute;
    let x = x0, z = z0;
    const top = 900 + Math.random() * 500;
    for (let i = 0; i < pos.count; i++) {
      const u = i / (pos.count - 1);
      x += (Math.random() - 0.5) * 90;
      z += (Math.random() - 0.5) * 90;
      pos.setXYZ(i, x, top * (1 - u), z);
    }
    pos.needsUpdate = true;
  }

  private updateBirds(f: LifeFrame): void {
    // Gulls and terns within a day's flight of land — the sign every pilot
    // watched for — and out in the high southern latitudes an albatross or
    // two, which will follow a ship for days. None at night.
    const nearLand = clamp(1 - (f.landNm - 8) / 40, 0, 1);
    const albatross = Math.abs(f.lat) > 30 && f.lat < 0 ? 1 : 0;
    let n = Math.round(nearLand * 12 + albatross * 2);
    if (f.night > 0.6 || f.detail <= 0) n = 0;
    this.birds.count = n;
    if (n === 0) return;
    for (let i = 0; i < n; i++) {
      const b = this.birdState[i];
      const big = albatross > 0 && i < 2;
      const a = b.phase + f.t * b.speed;
      const x = Math.cos(a) * b.r, z = Math.sin(a) * b.r;
      const y = b.h + Math.sin(f.t * 0.4 + b.phase) * 3;
      // Flap in bursts and glide between them; the albatross hardly flaps.
      const burst = big ? 0.1 : smoothstep(0.2, 0.6, Math.sin(f.t * 0.5 + b.phase * 3));
      const flap = lerp(0.35, Math.sin(f.t * b.flap * Math.PI * 2 + b.phase), burst);
      const size = big ? 3.4 : 1.2;
      this.e.set(0, -a + (b.speed > 0 ? 0 : Math.PI), Math.sin(a) * 0.2);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(x, y, z), this.q, this.s.set(size, size * flap, size));
      this.birds.setMatrixAt(i, this.m);
    }
    this.birds.instanceMatrix.needsUpdate = true;
    this.birdMat.color.setScalar(lerp(0.95, 0.35, f.night));
  }

  private updateDolphins(f: LifeFrame): void {
    this.nextPod -= f.dt;
    const warmish = Math.abs(f.lat) < 45;
    if (this.podUntil < f.t && this.nextPod <= 0) {
      this.nextPod = 90 + Math.random() * 180;
      if (warmish && f.speedKnots > 2.5 && f.detail > 0 && Math.random() < 0.6) {
        this.podUntil = f.t + 35 + Math.random() * 30;
        this.podSide = Math.random() < 0.5 ? 1 : -1;
      }
    }
    const on = this.podUntil > f.t && f.night < 0.7;
    this.dolphins.count = on ? 4 : 0;
    if (!on) return;
    // Riding the bow wave: they keep station ahead of the stem and to either
    // side of it, leaping in turn.
    const h = (f.heading * Math.PI) / 180;
    const fx = Math.sin(h), fz = -Math.cos(h);
    const sx = Math.cos(h), sz = Math.sin(h);
    const fade = clamp((this.podUntil - f.t) / 4, 0, 1);
    for (let i = 0; i < 4; i++) {
      const ahead = f.length * 0.5 + 4 + i * 3.5;
      const side = this.podSide * (i % 2 ? 1 : -1) * (3 + i * 1.3);
      const period = 2.4 + i * 0.3;
      const ph = ((f.t / period) + i * 0.37) % 1;
      // Half the cycle in the air, in an arc; the other half under.
      const air = ph < 0.45 ? ph / 0.45 : -1;
      // Sinking out of sight as the pod leaves, rather than vanishing.
      const y = (air >= 0 ? Math.sin(air * Math.PI) * 1.6 - 0.3 : -2.2) - (1 - fade) * 3;
      const pitch = air >= 0 ? Math.cos(air * Math.PI) * 0.9 : 0;
      const x = fx * ahead + sx * side;
      const z = fz * ahead + sz * side;
      // Nose up on the way out of the water, down on the way back in.
      this.e.set(-pitch, Math.atan2(fx, fz), 0, 'YXZ');
      this.q.setFromEuler(this.e);
      // Drawn a good deal bigger than a real dolphin, like everything else at
      // sea that has to be seen from the deck of a ship forty yards long.
      this.m.compose(this.v.set(x, y * 1.6 + f.seaY, z), this.q, this.s.set(2.4, 2.4, 2.4));
      this.dolphins.setMatrixAt(i, this.m);
    }
    this.dolphins.instanceMatrix.needsUpdate = true;
  }

  private updateFish(f: LifeFrame): void {
    this.flightAge += f.dt;
    this.nextFlight -= f.dt;
    if (this.nextFlight <= 0) {
      this.nextFlight = 15 + Math.random() * 40;
      if (Math.abs(f.lat) < 24 && f.speedKnots > 2 && f.night < 0.5 && f.detail > 0) {
        this.flightAge = 0;
        this.flightSeed = Array.from({ length: 12 }, () => Math.random());
      }
    }
    const dur = 1.8;
    if (this.flightAge > dur) { this.fish.count = 0; return; }
    const u = this.flightAge / dur;
    const h = (f.heading * Math.PI) / 180;
    const fx = Math.sin(h), fz = -Math.cos(h);
    const n = Math.round(lerp(4, 12, f.detail));
    this.fish.count = n;
    for (let i = 0; i < n; i++) {
      const r = this.flightSeed[i] ?? 0.5;
      // Bursting out from under the bow and fanning away over the swell.
      const out = (r < 0.5 ? -1 : 1);
      const ang = h + out * (0.6 + r * 0.8);
      const dx = Math.sin(ang), dz = -Math.cos(ang);
      const d = u * (30 + r * 40);
      const x = fx * (f.length * 0.5 + 3) + dx * d;
      const z = fz * (f.length * 0.5 + 3) + dz * d;
      const y = Math.sin(Math.min(u * 1.15, 1) * Math.PI) * (0.6 + r * 0.6);
      this.e.set(0, Math.atan2(dx, dz), 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(x, y * 1.4 + f.seaY, z), this.q, this.s.set(2.6, 2.6, 2.6));
      this.fish.setMatrixAt(i, this.m);
    }
    this.fish.instanceMatrix.needsUpdate = true;
  }

  private updateWhale(f: LifeFrame): void {
    this.whaleAge += f.dt;
    this.nextWhale -= f.dt;
    if (this.nextWhale <= 0) {
      this.nextWhale = 100 + Math.random() * 200;
      if (f.landNm > 6 && f.detail > 0 && Math.random() < 0.55) {
        this.whaleAge = 0;
        const a = Math.random() * Math.PI * 2;
        const d = 300 + Math.random() * 600;
        this.whaleAt.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      }
    }
    const a = this.whaleAge;
    const on = a < 12 && f.night < 0.75;
    this.spout.visible = on;
    this.hump.visible = on && a > 0.8 && a < 7;
    if (!on) return;
    // Two blows, a few seconds apart, each a column of mist rising and
    // drifting off; the back rolling up under the first and going down.
    const blow = (t: number) => (t < 0 || t > 4 ? 0 : smoothstep(0, 0.4, t) * (1 - smoothstep(1.2, 4, t)));
    const b1 = blow(a), b2 = blow(a - 6);
    const k = Math.max(b1, b2);
    const since = b1 >= b2 ? a : a - 6;
    const rise = clamp(since / 1.2, 0, 1);
    const drift = since * 0.6;
    this.spout.position.set(this.whaleAt.x + drift, 4 + rise * 8, this.whaleAt.z);
    this.spout.scale.set(7 + rise * 8, 12 + rise * 9, 1);
    (this.spout.material as THREE.SpriteMaterial).opacity = k * 0.85;
    const roll = clamp((a - 0.8) / 6.2, 0, 1);
    this.hump.position.set(this.whaleAt.x, Math.sin(roll * Math.PI) * 2 - 1.8, this.whaleAt.z);
    this.hump.rotation.y = Math.atan2(this.whaleAt.x, this.whaleAt.z) + Math.PI / 2;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose();
    });
  }
}

/** Positions and normals of several geometries in one, without indices. */
function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    pos.push(...(g.getAttribute('position').array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}

function mistTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 36, 0, 32, 36, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(240,244,248,0.45)');
  g.addColorStop(1, 'rgba(240,244,248,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
