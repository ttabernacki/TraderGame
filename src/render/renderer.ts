import * as THREE from 'three';
import { DEG, clamp, lerp, type LatLon } from '../core/math';
import { Land } from './land';
import { Ocean } from './ocean';
import { Sky, type SkyLighting } from './sky';
import { ShipMesh } from './shipMesh';
import { Spray } from './spray';
import type { HullClass } from '../ship/hull';
import type { SailState } from '../ship/physics';

export type CameraMode = 'chase' | 'deck' | 'masthead' | 'beam';

/** The colour of light off the whole sky dome, which the zenith is bluer than. */
const SKYLIGHT = new THREE.Color(0.72, 0.78, 0.86);

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
  /** Helm setting, -1 to +1, for the rudder. */
  rudder: number;
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
  spray = new Spray();
  ship: ShipMesh;

  cameraMode: CameraMode = 'chase';
  /** User look offsets, in degrees. */
  lookYaw = 0;
  lookPitch = -8;
  distance = 42;

  private sun = new THREE.DirectionalLight(0xffffff, 1);
  private ambient = new THREE.HemisphereLight(0x88aacc, 0x2a2418, 0.6);
  /**
   * Seconds of drawn motion since the view opened. Everything that flutters,
   * shakes or streams is driven from this rather than from the simulation clock:
   * that clock counts seconds since 1430, and a sine of seventeen billion has no
   * precision left to animate with.
   */
  private waveClock = 0;
  private fog = new THREE.FogExp2(0x9ab4c8, 0.00006);
  private hullClass: HullClass;
  private shipPitch = 0;
  private shipRoll = 0;
  private chaseYaw = 0;
  private fov = 58;

  constructor(canvas: HTMLCanvasElement, hull: HullClass) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // The far plane must clear the ocean's outer rim, or the water is clipped
    // short of the horizon and the sky shows through beneath it.
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.4, 90000);
    this.camera.position.set(0, 22, -55);

    this.hullClass = hull;
    this.ship = new ShipMesh(hull);

    this.scene.fog = this.fog;
    this.scene.add(this.sky.group);
    this.scene.add(this.ocean.mesh);
    this.scene.add(this.land.group);
    this.scene.add(this.ship.group);
    this.scene.add(this.spray.points);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.add(this.ambient);
    this.sun.position.set(0, 1000, 0);

    // The shadow frustum is kept tight around the ship, which is the only thing
    // in the scene that casts anything worth seeing.
    this.sun.castShadow = true;
    const span = Math.max(hull.lwl, 30) * 1.6;
    const cam = this.sun.shadow.camera;
    cam.left = -span; cam.right = span;
    cam.top = span; cam.bottom = -span;
    cam.near = 1; cam.far = span * 6;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0009;
    this.sun.shadow.normalBias = 0.06;

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
    //
    // At anything above real time the water is drawn at a plausible rate rather
    // than a literal one: at the half-day scale a literal sea would run past at
    // two thousand knots, which reads as a strobing white blur and tells the
    // player nothing. Time and distance are clamped together so the wave train
    // and the flow past the hull stay in step with one another either way.
    const visualDt = Math.min(simDt, realDt * 3);
    this.ocean.updateTrack(f.velocityE, f.velocityN, visualDt);
    this.ocean.setSea(
      {
        windFrom: f.windFrom,
        windKnots: f.windKnots,
        waveHeight: f.waveHeight,
        swellFrom: f.swellFrom,
      },
      f.velocityE * visualDt,
      f.velocityN * visualDt,
      visualDt * 0.62,
    );
    this.waveClock += visualDt;

    // The ship pushes the water aside: a bow wave forward and a spreading wake
    // astern, both keyed to how hard she is driving.
    const lighting = this.sky.update(
      f.pos.lat, f.pos.lon, f.dayFromEpoch, f.hourLocal,
      f.dayOfYear, f.year, f.cloud, f.simTime,
    );
    this.applyLighting(lighting, f.visibilityNm);

    const wakeHdg = f.heading * DEG;
    this.ocean.setWake({
      dirX: Math.sin(wakeHdg),
      dirZ: -Math.cos(wakeHdg),
      strength: clamp(Math.abs(f.speedKnots) / 7, 0, 1),
      halfBeam: this.hullClass.beam * 0.5,
      halfLength: this.hullClass.lwl * 0.5,
      rigHeight: this.hullClass.masts.reduce((a, m) => Math.max(a, m.ceHeight), 0) * 1.1,
      shadow: clamp(lighting.intensity * 1.3, 0, 1),
    });

    // --- Ship motion in the water ------------------------------------------
    const L = this.hullClass.lwl;
    const B = this.hullClass.beam;
    const hdg = f.heading * DEG;
    const fwdX = Math.sin(hdg), fwdZ = -Math.cos(hdg);
    const stbX = Math.cos(hdg), stbZ = Math.sin(hdg);

    const centre = this.ocean.sample(0, 0);
    const bow = this.ocean.sample(fwdX * L * 0.42, fwdZ * L * 0.42);
    const stern = this.ocean.sample(-fwdX * L * 0.42, -fwdZ * L * 0.42);
    const port = this.ocean.sample(-stbX * B * 0.5, -stbZ * B * 0.5);
    const stbd = this.ocean.sample(stbX * B * 0.5, stbZ * B * 0.5);

    const targetPitch = Math.atan2(bow.height - stern.height, L * 0.84) / DEG;
    const targetRoll = Math.atan2(stbd.height - port.height, B) / DEG;
    const k = clamp(realDt * 3.2, 0, 1);
    const prevPitch = this.shipPitch;
    this.shipPitch = lerp(this.shipPitch, targetPitch, k);
    this.shipRoll = lerp(this.shipRoll, targetRoll, k);
    const pitchRate = realDt > 0 ? (this.shipPitch - prevPitch) / realDt : 0;

    // The hull model's own origin is its designed waterline, so she floats there.
    this.ship.group.position.y = centre.height;
    this.ship.group.rotation.order = 'YXZ';
    this.ship.group.rotation.y = Math.PI - hdg;
    this.ship.setHeel(f.heel + this.shipRoll * 0.75, this.shipPitch);

    this.ship.update({
      sails: f.sails,
      trimSign: f.trimSign,
      pressures: f.sailPressures,
      apparentBeta: f.apparentBeta,
      apparentKnots: f.apparentKnots,
      rudder: f.rudder,
      t: this.waveClock,
    });

    // --- Spray at the bow ---------------------------------------------------
    this.spray.setLight(lighting.sunColor, lighting.night);
    this.spray.update(
      realDt,
      new THREE.Vector3(fwdX * L * 0.46, centre.height + 0.4, fwdZ * L * 0.46),
      new THREE.Vector3(fwdX, 0, fwdZ),
      Math.abs(f.speedKnots) * 0.5144,
      f.waveHeight,
      f.windKnots,
      pitchRate,
    );

    // --- Land ---------------------------------------------------------------
    // Only as far as the lookout could actually raise it. Building further than
    // that costs geometry for terrain the curve has already put out of sight.
    const landRange = clamp(f.sightingRangeNm * 1.1, 12, 70);
    if (this.land.needsRebuild(f.pos, landRange)) {
      this.land.rebuild(f.pos, landRange);
    }
    this.land.setFog(lighting.horizon, clamp(1 - f.visibilityNm / 24, 0, 0.7));

    this.updateCamera(f, realDt, centre.height, f.waveHeight);
    this.applyCameraFeel(f, realDt);
    this.renderer.render(this.scene, this.camera);
  }

  private applyLighting(l: SkyLighting, visibilityNm: number): void {
    // The light itself is placed just clear of the ship rather than at the real
    // distance of the sun, so the shadow frustum stays tight enough to be sharp.
    const span = Math.max(this.hullClass.lwl, 30) * 1.6;
    this.sun.position.copy(l.sunDir).multiplyScalar(span * 2.5);
    this.sun.target.position.set(0, 0, 0);
    this.sun.color.copy(l.sunColor);
    this.sun.intensity = l.intensity * 1.35;
    // Shadows are meaningless once the sun is on the horizon, and the long
    // stretched maps they produce are worse than none.
    this.sun.castShadow = l.sunDir.y > 0.12;

    // Skylight is blue, but not as blue as the zenith looks: most of what falls
    // on a deck comes from the whole dome, not from the darkest part of it.
    // Taking the zenith colour neat and multiplying it turns every shadowed
    // piece of timber aboard a bright mint green.
    this.ambient.color.copy(l.zenith).lerp(SKYLIGHT, 0.55).multiplyScalar(1.5);
    this.ambient.groundColor.copy(l.horizon).multiplyScalar(0.55);
    this.ambient.intensity = lerp(1.15, 0.26, l.night);

    // Visibility drives atmospheric extinction, so fog thickens in haze and rain.
    const visM = Math.max(visibilityNm, 0.15) * 1852;
    const fogDensity = 2.6 / visM;
    this.ocean.setLighting(l.sunDir, l.sunColor, l.zenith, l.horizon, l.night, fogDensity);
    this.fog.color.copy(l.horizon);
    this.fog.density = fogDensity * 0.85;
  }

  private updateCamera(f: RenderFrame, dt: number, seaHeight: number, waveHeight: number): void {
    const hdg = f.heading * DEG;
    const k = clamp(dt * 4, 0, 1);
    // In a big sea the camera must ride above the wave tops or it spends half
    // the time looking at the back of a swell.
    const lift = waveHeight * 0.85;

    const target = new THREE.Vector3();
    const desired = new THREE.Vector3();

    switch (this.cameraMode) {
      case 'deck': {
        // Standing at the break of the quarterdeck by the weather rail, which is
        // where the officer of the watch stands and where the whole ship — deck,
        // rail, mast and the set of her canvas — is in front of him. Put him
        // right forward instead, as this once did, and he sees nothing but the
        // bowsprit and a great deal of empty water.
        const fwd = new THREE.Vector3(Math.sin(hdg), 0, -Math.cos(hdg));
        const stb = new THREE.Vector3(Math.cos(hdg), 0, Math.sin(hdg));
        const eye = this.ship.group.position.clone()
          .add(fwd.clone().multiplyScalar(-this.hullClass.lwl * 0.3))
          // On the weather side, where the officer of the watch stands and where
          // the sail is not directly in front of his face. A lateen yard sweeps
          // the whole deck, so standing to leeward of it is standing in canvas.
          .add(stb.clone().multiplyScalar(this.hullClass.beam * 0.3 * -f.trimSign))
          .add(new THREE.Vector3(0, this.hullClass.draft * 1.6 + 2.4, 0));
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
        // At the hounds, not above the truck: the lookout wants his own deck in
        // sight below him as well as the sea ahead.
        const h = this.hullClass.masts.reduce((a, m) => Math.max(a, m.ceHeight), 0) * 1.28;
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
          this.hullClass.lwl * 0.28 + seaHeight + lift,
          -Math.cos(az) * this.distance,
        );
        break;
      }
      case 'chase':
      default: {
        // The camera trails the heading rather than snapping to it, so putting
        // the helm over swings her visibly across the frame before the view
        // settles in behind her again. Without the lag a turn is invisible.
        this.chaseYaw = wrapAngle(this.chaseYaw + wrapAngle(hdg - this.chaseYaw) * clamp(dt * 1.6, 0, 1));
        const az = this.chaseYaw + Math.PI + this.lookYaw * DEG;
        const pitch = clamp(this.lookPitch, -45, 40) * DEG;
        const horizontal = Math.cos(pitch) * this.distance;
        desired.set(
          Math.sin(az) * horizontal,
          Math.max(-Math.sin(pitch) * this.distance, 3) + this.hullClass.lwl * 0.18 + seaHeight + lift,
          -Math.cos(az) * horizontal,
        );
        break;
      }
    }

    this.camera.position.lerp(desired, k);
    const look = this.ship.group.position.clone().add(new THREE.Vector3(0, this.hullClass.lwl * 0.14, 0));
    this.camera.lookAt(look);
  }

  /**
   * Speed is hard to feel without a reference. Widening the field of view as she
   * works up gives the sensation of the water rushing past, and a little motion
   * in a seaway keeps the frame alive.
   */
  private applyCameraFeel(f: RenderFrame, dt: number): void {
    const speed = Math.abs(f.speedKnots);
    const targetFov = 56 + clamp(speed / 11, 0, 1) * 11;
    this.fov = lerp(this.fov, targetFov, clamp(dt * 1.5, 0, 1));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    if (this.cameraMode === 'deck' || this.cameraMode === 'masthead') return;
    const shake = clamp(f.waveHeight / 5, 0, 1) * clamp(0.3 + speed / 9, 0, 1.2);
    if (shake < 0.01) return;
    const t = this.waveClock;
    this.camera.position.x += Math.sin(t * 1.9) * shake * 0.32;
    this.camera.position.y += Math.sin(t * 2.7 + 1.1) * shake * 0.26;
    this.camera.position.z += Math.cos(t * 1.6 + 0.4) * shake * 0.32;
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

/** Wrap an angle in radians to (-pi, pi]. */
function wrapAngle(a: number): number {
  const t = (a + Math.PI) % (Math.PI * 2);
  return (t < 0 ? t + Math.PI * 2 : t) - Math.PI;
}
