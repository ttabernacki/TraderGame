import * as THREE from 'three';
import { DEG, clamp, lerp, type LatLon } from '../core/math';
import { Land } from './land';
import { Settlements } from './settlement';
import { Ocean } from './ocean';
import { Sky, type SkyLighting } from './sky';
import { ShipMesh } from './shipMesh';
import { Spray } from './spray';
import type { HullClass } from '../ship/hull';
import type { SailState } from '../ship/physics';

export type CameraMode = 'chase' | 'deck' | 'masthead' | 'beam';

/**
 * How much faster than real time the water may be drawn streaming past her.
 *
 * Six knots is genuinely slow, and from a ship held at the origin the only
 * thing that shows headway at all is the water going by, so this has to be
 * above one. It does not have to be ten: that read as a strobing blur and told
 * the player nothing he could not get from the log.
 */
const WATER_GAIN = 3.4;

/** The colour of light off the whole sky dome, which the zenith is bluer than. */
const SKYLIGHT = new THREE.Color(0.72, 0.78, 0.86);

/**
 * Natural periods of the hull's motion, in seconds. A small ship of this size
 * rolls slowly and lazily, pitches sharply, and heaves somewhere between.
 */
const ROLL_PERIOD = 5.6;
const PITCH_PERIOD = 2.6;
const HEAVE_PERIOD = 3.4;
const YAW_PERIOD = 7.0;

/**
 * Step a damped harmonic oscillator toward a target and report the new rate.
 *
 * Semi-implicit, so it stays stable at any frame time, and expressed as a period
 * and a damping ratio because those are the numbers a naval architect would
 * quote: a damping of about 0.15 rolls three or four times before it settles,
 * which is what a small ship in a beam sea actually does.
 */
function spring(
  value: number, rate: number, target: number,
  period: number, damping: number, dt: number,
  setRate: (v: number) => void,
): number {
  const w = (Math.PI * 2) / period;
  const accel = w * w * (target - value) - 2 * damping * w * rate;
  const nextRate = rate + accel * dt;
  setRate(nextRate);
  return value + nextRate * dt;
}

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

/**
 * Whether this is a phone, for the purposes of how hard to work the GPU.
 *
 * A coarse pointer is the honest signal — it means fingers, which means a
 * handheld device with a thermal budget and a battery — and the width test
 * catches a small tablet held in portrait.
 */
function isPhone(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches
    && Math.min(window.innerWidth, window.innerHeight) <= 900;
}

export class Renderer {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;

  ocean = new Ocean();
  sky = new Sky();
  land = new Land();
  settlements = new Settlements();
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
  /** How far she is rolling right now, for anything outside the renderer. */
  get drawnRoll(): number { return this.shipRoll; }
  private shipHeave = 0;
  private shipYaw = 0;
  private pitchRate = 0;
  private rollRate = 0;
  private heaveRate = 0;
  private yawRate = 0;
  private chaseYaw = 0;
  private fov = 58;
  private cameraBank = 0;
  /** Set once the opening frame has chosen a chase distance for this window. */
  private framed = false;
  /**
   * How many times faster than real time the scene is being drawn. Everything
   * that sells the sensation of speed — the field of view, the spray, the way
   * the camera works in a seaway — is keyed to this rather than to the ship's
   * true speed, because under time compression she really is covering the ground
   * that fast and the view should say so.
   */
  private drawnRate = 1;
  /**
   * A clock for cloth, in real seconds, which the game's clock never touches.
   *
   * A pennant snaps about twice a second in a breeze. It does that whether the
   * player is watching the voyage in real time or at a watch a second, because
   * it is a property of the wind and the cloth and not of how fast he wants the
   * month to go by. Driving it off the wave clock — which runs at up to three
   * times real time — put the flag, the telltales and the luffing sails at five
   * to eight cycles a second, which at sixty frames is not a flag whipping, it
   * is a strobe.
   */
  private riggingClock = 0;
  /**
   * The heading and heel she is *drawn* at, which lag the simulated ones
   * through a short real-time filter.
   *
   * At high clock rates one rendered frame covers minutes of simulation, so the
   * simulated heel can legitimately move six degrees between two frames and the
   * heading a degree or two — and drawn literally that is a lurch, not a roll.
   * The filter has a time constant of about an eighth of a second: too short to
   * feel at the helm in real time, long enough that a frame covering a quarter
   * of an hour is drawn as smooth motion rather than a jump cut.
   */
  private drawnHeading = 0;
  private drawnHeel = 0;

  /** The element the scene is drawn into, measured rather than assumed. */
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, hull: HullClass) {
    this.canvas = canvas;
    // Antialiasing is a real cost on a phone GPU and the sea is mostly smooth
    // gradients, where it buys least. The pixel ratio does the same work more
    // cheaply.
    const phone = isPhone();
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !phone,
      powerPreference: 'high-performance',
    });
    // A modern phone reports a device pixel ratio of three, which on a 390-point
    // screen is 1170 columns of a shader that was written for a desktop. Half of
    // that is indistinguishable at arm's length and roughly four times faster.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, phone ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    // The soft variant takes many more samples per fragment. On a phone that is
    // paid for on every frame for a softness nobody can see at that size.
    this.renderer.shadowMap.type = phone ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

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
    this.scene.add(this.settlements.group);
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
    // Two thousand square is a lot of depth buffer to fill for a shadow that
    // covers one small ship, and a phone feels every megabyte of it.
    const shadowSize = isPhone() ? 1024 : 2048;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
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
    // Measured from the element, not from window.innerHeight: on a phone the
    // two disagree by the height of the address bar, and drawing to the window
    // stretches the scene behind the bottom of the screen.
    const box = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(box.width)) || window.innerWidth;
    const h = Math.max(1, Math.round(box.height)) || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // A tall narrow window sees far less of the horizontal field, so the ship
    // fills it at a distance that frames her comfortably on a desktop. Back off
    // until she takes about the same share of the width either way.
    if (!this.framed) {
      this.framed = true;
      this.distance = clamp(42 / clamp(this.camera.aspect / 1.7, 0.58, 1), 30, 76);
    }
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
    //
    // The ceiling is high on purpose. Six knots is genuinely slow, and the only
    // thing that makes headway visible from a ship held at the origin is the
    // water going past her: clamping that to three times real time meant the log
    // read thirty knots of progress while the sea crawled, and putting the
    // clock on gave no sensation of moving at all. Ten times reads as a ship
    // driving hard, which is what the player has asked the clock for.
    // The ceiling is approached along a curve rather than run into: each step
    // up the clock still reads as faster water, but the gain falls away, so the
    // top of the range is a ship driving hard rather than a river in flood.
    // A flat ten times was the same wall of streaming water at every rate above
    // four, and it was what made the fast clock unpleasant to sit in.
    const ratio = realDt > 1e-5 ? Math.max(simDt / realDt, 0) : 1;
    const shown = 1 + WATER_GAIN * (1 - Math.exp(-Math.max(ratio - 1, 0) / 5));
    const visualDt = Math.min(simDt, realDt * shown);
    this.drawnRate = realDt > 1e-5 ? clamp(visualDt / realDt, 0.05, WATER_GAIN + 1) : 1;
    this.riggingClock += realDt;
    // f.heading and f.heel are already the filtered, shown values: the game
    // smooths them once, on real seconds, so the 3D view and the compass never
    // disagree about which way her head is.
    this.drawnHeading = f.heading;
    this.drawnHeel = f.heel;

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
      // The wave train's own evolution is held back well below the rate the
      // water flows past her. Advancing both together reads as a film run fast;
      // advancing only the flow reads as a ship going fast, which is the thing
      // the player turned the clock up to feel.
      Math.min(simDt, realDt * 2) * 0.62,
    );
    this.waveClock += Math.min(simDt, realDt * 2);

    // The ship pushes the water aside: a bow wave forward and a spreading wake
    // astern, both keyed to how hard she is driving.
    const lighting = this.sky.update(
      f.pos.lat, f.pos.lon, f.dayFromEpoch, f.hourLocal,
      f.dayOfYear, f.year, f.cloud, f.simTime,
    );
    this.applyLighting(lighting, f.visibilityNm);

    const wakeHdg = this.drawnHeading * DEG;
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
    const hdg = this.drawnHeading * DEG;
    const fwdX = Math.sin(hdg), fwdZ = -Math.cos(hdg);
    const stbX = Math.cos(hdg), stbZ = Math.sin(hdg);

    const centre = this.ocean.sample(0, 0);
    const bow = this.ocean.sample(fwdX * L * 0.42, fwdZ * L * 0.42);
    const stern = this.ocean.sample(-fwdX * L * 0.42, -fwdZ * L * 0.42);
    const port = this.ocean.sample(-stbX * B * 0.5, -stbZ * B * 0.5);
    const stbd = this.ocean.sample(stbX * B * 0.5, stbZ * B * 0.5);

    // A hull does not lie flat on the wave it happens to be crossing. It is a
    // mass on a spring: it lags the water, overshoots it, and goes on rolling
    // after the sea that started it has passed under. Fitting her attitude to
    // the local wave slope with a first-order lag — which is what this did —
    // gives a model gliding over a moving surface, and no motion at all in the
    // sense a sailor would recognise. Each axis is now a damped oscillator with
    // the hull's own natural period, driven by the sea.
    const rawPitch = Math.atan2(bow.height - stern.height, L * 0.84) / DEG;
    const rawRoll = Math.atan2(stbd.height - port.height, B) / DEG;
    const motionDt = Math.min(Math.max(realDt, 1 / 240), 1 / 20);

    // How much of the wave slope she is allowed to feel.
    //
    // The water is drawn flowing past her at up to ten times its real rate, so
    // that six knots looks like six knots from a ship held at the origin. But
    // her attitude is sampled from that same flowing wave field, which means she
    // also *crosses* the wave train ten times too fast: the encounter frequency
    // climbs well above her natural roll and pitch periods, and a hull driven
    // far above its own frequency does not roll, it is shaken. That is what put
    // the twitch into her at the high clock rates.
    //
    // Rolling the forcing off as the drawn rate climbs gives the right thing at
    // both ends: every wave felt properly at real time, and a ship standing
    // steadily on with the sea streaming past her when the clock is wound up —
    // which is what a time-lapse of a passage actually looks like.
    const motionGain = clamp(1 - (this.drawnRate - 1) / 5, 0.1, 1);
    const targetPitch = rawPitch * motionGain;
    const targetRoll = rawRoll * motionGain;

    // She is stiffer with more sail up and in a breeze, and rolls further and
    // more slowly when she is under bare poles in a seaway.
    const prevPitch = this.shipPitch;
    // The gains are above one because the surface slope is only part of what
    // rolls a ship. The water in a wave is moving in orbits, and the horizontal
    // acceleration of those orbits heels her as well; the effective wave slope a
    // hull actually feels is roughly twice the geometric one.
    this.shipPitch = spring(
      this.shipPitch, this.pitchRate, targetPitch * 1.7, PITCH_PERIOD, 0.30, motionDt,
      (v) => { this.pitchRate = v; },
    );
    this.shipRoll = spring(
      this.shipRoll, this.rollRate, targetRoll * 2.4, ROLL_PERIOD, 0.13, motionDt,
      (v) => { this.rollRate = v; },
    );
    // Heave: she floats to the surface, but with her own mass behind her, so in
    // a short steep sea she drives through crests instead of tracking them.
    this.shipHeave = spring(
      this.shipHeave, this.heaveRate, centre.height * motionGain, HEAVE_PERIOD, 0.5, motionDt,
      (v) => { this.heaveRate = v; },
    );
    // Yawing: the sea takes her stern and swings it. It is small, but a heading
    // that never wavers by a degree is the surest sign of a ship on rails.
    const yawForce = ((stbd.height - port.height) * 0.4
      + (bow.height - stern.height) * 0.25) * motionGain;
    this.shipYaw = spring(
      this.shipYaw, this.yawRate, clamp(yawForce, -2.5, 2.5), YAW_PERIOD, 0.3, motionDt,
      (v) => { this.yawRate = v; },
    );
    const pitchRate = realDt > 0 ? (this.shipPitch - prevPitch) / realDt : 0;

    // The hull model's own origin is its designed waterline, so she floats there.
    this.ship.group.position.y = this.shipHeave;
    this.ship.group.rotation.order = 'YXZ';
    this.ship.group.rotation.y = Math.PI - hdg + this.shipYaw * DEG;
    this.ship.setHeel(this.drawnHeel + this.shipRoll, this.shipPitch);

    this.ship.update({
      sails: f.sails,
      trimSign: f.trimSign,
      pressures: f.sailPressures,
      apparentBeta: f.apparentBeta,
      apparentKnots: f.apparentKnots,
      rudder: f.rudder,
      t: this.riggingClock,
    });

    // --- Spray at the bow ---------------------------------------------------
    this.spray.setLight(lighting.sunColor, lighting.night);
    this.spray.update(
      realDt,
      new THREE.Vector3(fwdX * L * 0.46, centre.height + 0.4, fwdZ * L * 0.46),
      new THREE.Vector3(fwdX, 0, fwdZ),
      Math.abs(f.speedKnots) * 0.5144 * Math.min(this.drawnRate, 3),
      f.waveHeight,
      f.windKnots,
      pitchRate,
    );

    // --- Land ---------------------------------------------------------------
    // Only as far as the lookout could actually raise it. Building further than
    // that costs geometry for terrain the curve has already put out of sight.
    // Drawn a good way beyond the range the lookout is credited with, because
    // land lifted two and a half times stands up over the curve long before a
    // true-scale coast would, and building only as far as the game's own
    // sighting rule allows would cut the far hills off at a hard edge.
    const landRange = clamp(f.sightingRangeNm * 1.6, 16, 110);
    // Where the eye actually is, because that is what decides how far off the
    // horizon stands and therefore how much of the coast the curve hides. Going
    // to the masthead really does open the land, which is what a masthead was
    // for.
    const eyeM = clamp(this.camera.position.y, 2, 60);
    if (this.land.needsRebuild(f.pos, landRange, eyeM)) {
      this.land.rebuild(f.pos, landRange, eyeM);
    }
    this.land.setFog(lighting.horizon, clamp(1 - f.visibilityNm / 24, 0, 0.7));

    // Towns, which are built from the same land range: a settlement that has
    // not risen over the curve yet has no business being drawn either.
    if (this.settlements.needsRebuild(f.pos, landRange, eyeM)) {
      this.settlements.rebuild(f.pos, landRange, eyeM);
    }
    this.settlements.setFog(lighting.horizon, clamp(1 - f.visibilityNm / 24, 0, 0.7));
    this.settlements.setWind(f.windFrom, f.windKnots, f.simTime);

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
    // Meteorological visibility is defined on objects, not on a water surface
    // seen at a grazing angle. Applying the full extinction to the sea hazes it
    // white a couple of miles out and leaves a pale strip under the horizon, so
    // the sea gets a good deal less of it than the air does.
    const fogDensity = 1.15 / visM;
    this.ocean.setLighting(l.sunDir, l.sunColor, l.zenith, l.horizon, l.night, fogDensity);
    this.fog.color.copy(l.horizon);
    this.fog.density = fogDensity * 0.85;
  }

  private updateCamera(f: RenderFrame, dt: number, seaHeight: number, waveHeight: number): void {
    const hdg = this.drawnHeading * DEG;
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
    // Apparent speed, not true speed: with the clock on she is genuinely running
    // at this rate over the ground, and the view should feel like it.
    const speed = Math.abs(f.speedKnots) * this.drawnRate;
    const drive = clamp(speed / 14, 0, 1);
    const targetFov = 55 + drive * 16;
    this.fov = lerp(this.fov, targetFov, clamp(dt * 1.5, 0, 1));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    // The camera lies over with her, so the horizon tilts as she rolls. Only
    // part of the way, because a view that heels the full amount is nauseating
    // and no cameraman aboard would hold it that way — but with none of it at
    // all she reads as a picture of a ship rather than a ship you are aboard.
    const bank = (this.shipRoll * 0.5 + this.drawnHeel * 0.22) * DEG;
    this.cameraBank = lerp(this.cameraBank, bank, clamp(dt * 3, 0, 1));

    if (this.cameraMode === 'deck' || this.cameraMode === 'masthead') {
      this.camera.rotateZ(this.cameraBank * 1.4);
      return;
    }
    this.camera.rotateZ(this.cameraBank);

    const shake = clamp(f.waveHeight / 5, 0, 1) * clamp(0.3 + drive, 0, 1.4);
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
    this.settlements.dispose();
    this.ship.dispose();
    this.renderer.dispose();
  }
}

/** Wrap an angle in radians to (-pi, pi]. */
function wrapAngle(a: number): number {
  const t = (a + Math.PI) % (Math.PI * 2);
  return (t < 0 ? t + Math.PI * 2 : t) - Math.PI;
}
