import * as THREE from 'three';
import { DEG, clamp, lerp, type LatLon } from '../core/math';
import { Land } from './land';
import { Ocean } from './ocean';
import { Sky, type SkyLighting } from './sky';
import { ShipMesh } from './shipMesh';
import type { HullClass } from '../ship/hull';
import type { SailState } from '../ship/physics';

export type CameraMode = 'chase' | 'deck' | 'masthead' | 'beam';

export interface RenderFrame {
  pos: LatLon;
  heading: number;
  heel: number;
  /** Over-ground velocity in metres per second, east and north. */
  velocityE: number;
  velocityN: number;
  sails: SailState[];
  trimSign: number;
  sailPressures: number[];
  apparentBeta: number;
  apparentKnots: number;
  speedKnots: number;
  windFrom: number;
  windKnots: number;
  waveHeight: number;
  swellFrom: number;
  cloud: number;
  visibilityNm: number;
  dayFromEpoch: number;
  hourLocal: number;
  dayOfYear: number;
  year: number;
  simTime: number;
  /** How far the lookout can see land, in nautical miles. */
  sightingRangeNm: number;
}

export class Renderer {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;

  ocean = new Ocean();
  sky = new Sky();
  land = new Land();
  ship: ShipMesh;

  cameraMode: CameraMode = 'chase';
  /** User look offsets, in degrees. */
  lookYaw = 0;
  lookPitch = -8;
  distance = 42;

  private sun = new THREE.DirectionalLight(0xffffff, 1);
  private ambient = new THREE.HemisphereLight(0x88aacc, 0x2a2418, 0.6);
  private waveOriginE = 0;
  private waveOriginN = 0;
  private hullClass: HullClass;
  private shipPitch = 0;
  private shipRoll = 0;

  constructor(canvas: HTMLCanvasElement, hull: HullClass) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.5, 30000);
    this.camera.position.set(0, 22, -55);

    this.hullClass = hull;
    this.ship = new ShipMesh(hull);

    this.scene.add(this.sky.group);
    this.scene.add(this.ocean.mesh);
    this.scene.add(this.land.group);
    this.scene.add(this.ship.group);
    this.scene.add(this.sun);
    this.scene.add(this.ambient);
    this.sun.position.set(0, 1000, 0);

    this.resize();
  }

  /** Swap the ship model, for when the Crown grants a different hull. */
  setHull(hull: HullClass): void {
    this.scene.remove(this.ship.group);
    this.ship.dispose();
    this.hullClass = hull;
    this.ship = new ShipMesh(hull);
    this.scene.add(this.ship.group);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(f: RenderFrame, realDt: number, simDt: number): void {
    // The ship is held at the origin and the world moves past her, which keeps
    // floating-point precision perfect across a twelve-thousand-mile voyage.
    this.waveOriginE += f.velocityE * simDt;
    this.waveOriginN += f.velocityN * simDt;

    const waveTime = f.simTime * 0.35;
    this.ocean.setSea({
      windFrom: f.windFrom,
      windKnots: f.windKnots,
      waveHeight: f.waveHeight,
      swellFrom: f.swellFrom,
    });
    this.ocean.setOrigin(this.waveOriginE, this.waveOriginN);
    this.ocean.setTime(waveTime);

    const lighting = this.sky.update(
      f.pos.lat, f.pos.lon, f.dayFromEpoch, f.hourLocal,
      f.dayOfYear, f.year, f.cloud, f.simTime,
    );
    this.applyLighting(lighting, f.visibilityNm);

    // --- Ship motion in the water ------------------------------------------
    const L = this.hullClass.lwl;
    const B = this.hullClass.beam;
    const hdg = f.heading * DEG;
    const fwdX = Math.sin(hdg), fwdZ = -Math.cos(hdg);
    const stbX = Math.cos(hdg), stbZ = Math.sin(hdg);

    const centre = this.ocean.sample(0, 0, this.waveOriginE, this.waveOriginN, waveTime);
    const bow = this.ocean.sample(fwdX * L * 0.42, fwdZ * L * 0.42, this.waveOriginE, this.waveOriginN, waveTime);
    const stern = this.ocean.sample(-fwdX * L * 0.42, -fwdZ * L * 0.42, this.waveOriginE, this.waveOriginN, waveTime);
    const port = this.ocean.sample(-stbX * B * 0.5, -stbZ * B * 0.5, this.waveOriginE, this.waveOriginN, waveTime);
    const stbd = this.ocean.sample(stbX * B * 0.5, stbZ * B * 0.5, this.waveOriginE, this.waveOriginN, waveTime);

    const targetPitch = Math.atan2(bow.height - stern.height, L * 0.84) / DEG;
    const targetRoll = Math.atan2(stbd.height - port.height, B) / DEG;
    const k = clamp(realDt * 3.2, 0, 1);
    this.shipPitch = lerp(this.shipPitch, targetPitch, k);
    this.shipRoll = lerp(this.shipRoll, targetRoll, k);

    // The hull model's own origin is its designed waterline, so she floats there.
    this.ship.group.position.y = centre.height;
    this.ship.group.rotation.order = 'YXZ';
    this.ship.group.rotation.y = Math.PI - hdg;
    this.ship.setHeel(f.heel + this.shipRoll * 0.75, this.shipPitch);

    this.ship.update(
      f.sails, f.trimSign, f.sailPressures,
      f.apparentBeta, f.apparentKnots, f.speedKnots, f.simTime,
    );

    // --- Land ---------------------------------------------------------------
    const landRange = clamp(f.sightingRangeNm * 1.5, 12, 90);
    if (this.land.needsRebuild(f.pos, landRange)) {
      this.land.rebuild(f.pos, landRange);
    }
    this.land.setFog(lighting.horizon, clamp(1 - f.visibilityNm / 24, 0, 0.7));

    this.updateCamera(f, realDt, centre.height);
    this.renderer.render(this.scene, this.camera);
  }

  private applyLighting(l: SkyLighting, visibilityNm: number): void {
    this.sun.position.copy(l.sunDir).multiplyScalar(4000);
    this.sun.color.copy(l.sunColor);
    this.sun.intensity = l.intensity * 1.55;

    this.ambient.color.copy(l.zenith).multiplyScalar(1.5);
    this.ambient.groundColor.copy(l.horizon).multiplyScalar(0.35);
    this.ambient.intensity = lerp(0.85, 0.22, l.night);

    // Visibility drives atmospheric extinction, so fog thickens in haze and rain.
    const visM = Math.max(visibilityNm, 0.15) * 1852;
    const fogDensity = 2.6 / visM;
    this.ocean.setLighting(l.sunDir, l.sunColor, l.zenith, l.horizon, l.night, fogDensity);
    this.scene.fog = new THREE.FogExp2(l.horizon.getHex(), fogDensity * 0.85);
  }

  private updateCamera(f: RenderFrame, dt: number, seaHeight: number): void {
    const hdg = f.heading * DEG;
    const k = clamp(dt * 4, 0, 1);

    const target = new THREE.Vector3();
    const desired = new THREE.Vector3();

    switch (this.cameraMode) {
      case 'deck': {
        // Standing at the weather rail in the waist, forward of the mainmast and
        // clear of the lateen yards that sweep the quarterdeck, looking ahead.
        const fwd = new THREE.Vector3(Math.sin(hdg), 0, -Math.cos(hdg));
        const stb = new THREE.Vector3(Math.cos(hdg), 0, Math.sin(hdg));
        const eye = this.ship.group.position.clone()
          .add(fwd.clone().multiplyScalar(this.hullClass.lwl * 0.24))
          .add(stb.clone().multiplyScalar(this.hullClass.beam * 0.32))
          .add(new THREE.Vector3(0, this.hullClass.draft * 1.5 + 1.7, 0));
        this.camera.position.copy(eye);
        const yaw = hdg + this.lookYaw * DEG;
        const pitch = clamp(this.lookPitch, -60, 55) * DEG;
        target.set(
          eye.x + Math.sin(yaw) * Math.cos(pitch) * 60,
          eye.y + Math.sin(pitch) * 60,
          eye.z - Math.cos(yaw) * Math.cos(pitch) * 60,
        );
        this.camera.lookAt(target);
        return;
      }
      case 'masthead': {
        const h = this.hullClass.masts.reduce((a, m) => Math.max(a, m.ceHeight), 0) * 1.6;
        const eye = this.ship.group.position.clone().add(new THREE.Vector3(0, h, 0));
        this.camera.position.copy(eye);
        const yaw = hdg + this.lookYaw * DEG;
        const pitch = clamp(this.lookPitch - 4, -70, 40) * DEG;
        target.set(
          eye.x + Math.sin(yaw) * Math.cos(pitch) * 200,
          eye.y + Math.sin(pitch) * 200,
          eye.z - Math.cos(yaw) * Math.cos(pitch) * 200,
        );
        this.camera.lookAt(target);
        return;
      }
      case 'beam': {
        // Off the beam, to watch how she is sailing.
        const az = hdg + 90 * DEG + this.lookYaw * DEG;
        desired.set(
          Math.sin(az) * this.distance,
          this.hullClass.lwl * 0.28 + seaHeight,
          -Math.cos(az) * this.distance,
        );
        break;
      }
      case 'chase':
      default: {
        const az = hdg + Math.PI + this.lookYaw * DEG;
        const pitch = clamp(this.lookPitch, -45, 40) * DEG;
        const horizontal = Math.cos(pitch) * this.distance;
        desired.set(
          Math.sin(az) * horizontal,
          Math.max(-Math.sin(pitch) * this.distance, 3) + this.hullClass.lwl * 0.18 + seaHeight,
          -Math.cos(az) * horizontal,
        );
        break;
      }
    }

    this.camera.position.lerp(desired, k);
    const look = this.ship.group.position.clone().add(new THREE.Vector3(0, this.hullClass.lwl * 0.14, 0));
    this.camera.lookAt(look);
  }

  cycleCamera(): CameraMode {
    const order: CameraMode[] = ['chase', 'deck', 'beam', 'masthead'];
    const i = order.indexOf(this.cameraMode);
    this.cameraMode = order[(i + 1) % order.length];
    return this.cameraMode;
  }

  dispose(): void {
    this.ocean.dispose();
    this.sky.dispose();
    this.land.dispose();
    this.ship.dispose();
    this.renderer.dispose();
  }
}
