import {
  DEG, RAD, angleDelta, clamp, cosd, lerp, rhumbStep, sind, smoothstep,
  wrap360, type LatLon,
} from '../core/math';
import type { HullClass } from './hull';
import { hullSpeedKnots } from './hull';
import { RIG_PROFILES, sailForce, type SailForce } from './rig';

export const KNOTS = 0.514444;
const WATER_DENSITY = 1025;
const G = 9.81;

export interface SailState {
  /** Fraction of this mast's canvas actually set, 0-1. */
  set: number;
  /** Angle of the sail's chord from the centreline, degrees. */
  trim: number;
  /** Which side the sail is sheeted to: -1 port, +1 starboard. */
  side: number;
  /** Seconds remaining in a shift across to the other tack. */
  shifting: number;
  /** Structural condition of this mast and its canvas, 0-1. */
  condition: number;
}

export interface HullDerived {
  wetted: number;
  lateralArea: number;
  yawInertia: number;
  gm: number;
  rudderArea: number;
  hullSpeed: number;
}

export function deriveHull(h: HullClass): HullDerived {
  return {
    wetted: h.lwl * (h.beam + 2 * h.draft) * 0.78,
    lateralArea: h.lwl * h.draft * 0.9,
    yawInertia: h.displacement * Math.pow(0.25 * h.lwl, 2),
    gm: 0.115 * h.beam,
    rudderArea: h.lwl * h.draft * 0.06,
    hullSpeed: hullSpeedKnots(h) * KNOTS,
  };
}

export interface DynamicState {
  pos: LatLon;
  /** Degrees true. */
  heading: number;
  /** Degrees per second, positive to starboard. */
  yawRate: number;
  /** Surge through the water along the hull axis, m/s. */
  surge: number;
  /** Sideslip through the water, m/s, positive to starboard. */
  sway: number;
  /** Degrees, positive heeling to starboard. */
  heel: number;
  /** Helm setting, -1 hard a-port to +1 hard a-starboard. */
  rudder: number;
  sails: SailState[];
}

export interface Environment {
  /** True wind direction the wind blows from, degrees. */
  windFrom: number;
  /** True wind speed, knots. */
  windKnots: number;
  /** Direction the current sets toward, degrees. */
  currentToward: number;
  currentKnots: number;
  /** Significant wave height, metres. */
  waveHeight: number;
}

export interface ShipTuning {
  /** Multiplies hull resistance. Rises with fouling and shipworm. */
  fouling: number;
  /** Fraction of the crew present relative to a full complement. */
  crewFactor: number;
  /** 0-1 seamanship of the crew, speeds sail handling. */
  seamanship: number;
  /** Multiplies the hull's ability to resist leeway. Improved by a deeper keel. */
  keel: number;
  /** Overall hull integrity, 0-1. */
  integrity: number;
  /**
   * Multiplies how fast the sails come across on a tack. Above one is a crew
   * who know their work — or a player who has asked not to be made to wait for
   * them.
   */
  sailHandling?: number;
}

export interface StepResult {
  /** Apparent wind angle off the bow, signed degrees. */
  beta: number;
  apparentKnots: number;
  apparentFrom: number;
  /** Speed through the water, knots. */
  speedKnots: number;
  /** Speed made good over the ground, knots. */
  groundKnots: number;
  /** Course made good over the ground, degrees true. */
  courseOverGround: number;
  /** Angle between the heading and the actual track through the water. */
  leeway: number;
  drive: number;
  sideForce: number;
  perSail: SailForce[];
  inIrons: boolean;
  makingSternway: boolean;
  /** Peak rig load as a fraction of what the spars will take. */
  rigStress: number;
}

/**
 * Advance the ship one step.
 *
 * Current is deliberately applied only to motion over the ground. A ship in a
 * current feels nothing: the whole body of water moves with her, so the wind on
 * deck, the wake, and the log line all read exactly as they would in still
 * water. That invisibility is precisely why dead reckoning drifts, and why a
 * chart built from dead reckoning is wrong in ways its maker cannot detect.
 */
export function stepShip(
  s: DynamicState,
  hull: HullClass,
  d: HullDerived,
  env: Environment,
  tune: ShipTuning,
  dt: number,
): StepResult {
  const windSpeed = env.windKnots * KNOTS;

  // --- Apparent wind ------------------------------------------------------
  // World frame: east and north components, metres per second.
  const windTowardRad = (env.windFrom + 180) * DEG;
  const windE = Math.sin(windTowardRad) * windSpeed;
  const windN = Math.cos(windTowardRad) * windSpeed;

  const hdgRad = s.heading * DEG;
  const fwdE = Math.sin(hdgRad), fwdN = Math.cos(hdgRad);
  const stbE = Math.cos(hdgRad), stbN = -Math.sin(hdgRad);

  const boatE = fwdE * s.surge + stbE * s.sway;
  const boatN = fwdN * s.surge + stbN * s.sway;

  const appE = windE - boatE;
  const appN = windN - boatN;
  const apparentSpeed = Math.hypot(appE, appN);
  const apparentFrom = wrap360(Math.atan2(-appE, -appN) * RAD);
  const beta = angleDelta(s.heading, apparentFrom);

  // --- Sail handling ------------------------------------------------------
  const handRate = sailHandRate(tune);
  const desiredSide = beta >= 0 ? -1 : 1;

  let drive = 0;
  let side = 0;
  let heelMoment = 0;
  let yawMoment = 0;
  let maxStress = 0;
  const perSail: SailForce[] = [];

  for (let i = 0; i < s.sails.length; i++) {
    const sail = s.sails[i];
    const mast = hull.masts[i];
    const profile = RIG_PROFILES[mast.rig];

    // A sail always sets to leeward. When the wind crosses the bow or the stern
    // the whole thing has to come across, and until it does she makes no drive.
    if (sail.shifting > 0) {
      sail.shifting = Math.max(0, sail.shifting - dt * handRate);
      if (sail.shifting === 0) sail.side = desiredSide;
    } else if (sail.side !== desiredSide && Math.abs(beta) > 8 && sail.set > 0.02) {
      sail.shifting = profile.shiftTime;
    }

    sail.trim = clamp(sail.trim, profile.minTrim, profile.maxTrim);

    const shiftPenalty = sail.shifting > 0 ? 0.12 : 1;
    // Heeling spills wind out of the top of the sail.
    const heelSpill = Math.max(cosd(s.heel) ** 0.6, 0.25);
    const area = mast.area * sail.set * sail.condition * shiftPenalty * heelSpill;

    const f = sailForce(apparentSpeed, beta, sail.trim, area, profile);
    perSail.push(f);

    drive += f.drive;
    side += f.side;
    heelMoment += Math.abs(f.side) * mast.ceHeight * Math.sign(f.side);
    // A sail forward of the centre of lateral resistance pushes the bow off the
    // wind; one aft of it drives her up into the wind. This is weather helm.
    yawMoment += -f.side * mast.station * hull.lwl * 0.42;

    if (sail.set > 0.02) {
      const stress = f.load / (mast.area * 1250 * sail.condition + 1);
      maxStress = Math.max(maxStress, stress);
    }
  }

  // --- Hull resistance ----------------------------------------------------
  const v = Math.abs(s.surge);
  const ct = 0.0079 * tune.fouling;
  const froude = clamp(v / d.hullSpeed, 0, 3);
  const waveMaking = 1 + 3.2 * Math.pow(froude, 8);
  const resistance = 0.5 * WATER_DENSITY * d.wetted * ct * v * v * waveMaking;

  // Windage on the hull and standing rigging, which matters a great deal when
  // she is lying with bare poles in a gale.
  const windageArea = hull.lwl * 2.6 + hull.beam * 3.5;
  const q = 0.5 * 1.225 * apparentSpeed * apparentSpeed;
  const windageDrag = q * windageArea * 0.85;
  const betaRad = beta * DEG;
  drive -= windageDrag * Math.cos(betaRad) * 0.55;
  side -= Math.sign(beta || 1) * windageDrag * Math.abs(Math.sin(betaRad)) * 0.55;

  // Added resistance in a seaway: pitching into a head sea costs a great deal.
  const seaPenalty = 1 + clamp(env.waveHeight / 4, 0, 3) * lerp(0.05, 0.55, smoothstep(120, 20, Math.abs(beta)));

  const mass = hull.displacement * 1.12; // includes added mass of entrained water
  const surgeAccel = (drive - Math.sign(s.surge || 1) * resistance * seaPenalty) / mass;
  s.surge += surgeAccel * dt;
  // Small ships cannot be driven backwards faster than a walk.
  s.surge = clamp(s.surge, -1.6, d.hullSpeed * 1.35);

  // --- Leeway -------------------------------------------------------------
  // The hull is a very poor lifting surface, so it must slip a long way sideways
  // before it generates enough side force to balance the rig.
  const total = Math.max(Math.hypot(s.surge, s.sway), 0.05);
  const keelEff = 0.09 * tune.keel;
  const denom = 0.5 * WATER_DENSITY * d.lateralArea * total * total * 2 * Math.PI * keelEff;
  // With no way on, the hull generates no side lift at all and the angle would
  // run away to ninety degrees. She is being blown bodily sideways at that point
  // and the angle stops meaning anything, so it is capped where it stops being
  // a useful number to steer by.
  const maxLeeway = Math.sin(28 * DEG);
  const sinLeeway = clamp(denom > 1 ? -side / denom : Math.sign(-side), -maxLeeway, maxLeeway);
  const leewayRad = Math.asin(sinLeeway);
  const targetSway = Math.tan(leewayRad) * Math.abs(s.surge);
  // Lag it so the ship settles into her leeway rather than snapping to it.
  s.sway += (clamp(targetSway, -3, 3) - s.sway) * clamp(dt * 0.35, 0, 1);

  // --- Yaw ----------------------------------------------------------------
  // A rudder is useless without water flowing past it, which is what makes
  // being caught in stays so dangerous.
  const flow = s.surge;
  const rudderCl = 1.05 * Math.sin(clamp(s.rudder, -1, 1) * 32 * DEG) / Math.sin(32 * DEG);
  const rudderForce = 0.5 * WATER_DENSITY * d.rudderArea * rudderCl * flow * Math.abs(flow) * 0.55;
  const rudderTorque = rudderForce * hull.lwl * 0.45;

  const yawDamp = hull.displacement * hull.lwl * 0.19 / clamp(hull.handiness, 0.2, 1);
  const yawRateRad = s.yawRate * DEG;
  const dampTorque = -yawDamp * yawRateRad * (Math.abs(s.surge) + 1.0);

  const yawAccel = (rudderTorque + yawMoment + dampTorque) / d.yawInertia;
  s.yawRate += yawAccel * RAD * dt;
  s.yawRate = clamp(s.yawRate, -6, 6);
  s.heading = wrap360(s.heading + s.yawRate * dt);

  // --- Heel ---------------------------------------------------------------
  const righting = hull.displacement * G * d.gm;
  const heelTarget = clamp((heelMoment / righting) * RAD, -55, 55);
  s.heel += (heelTarget - s.heel) * clamp(dt * 0.8, 0, 1);

  // --- Motion over the ground --------------------------------------------
  const groundE = boatE + Math.sin(env.currentToward * DEG) * env.currentKnots * KNOTS;
  const groundN = boatN + Math.cos(env.currentToward * DEG) * env.currentKnots * KNOTS;
  const groundSpeed = Math.hypot(groundE, groundN);
  const cog = wrap360(Math.atan2(groundE, groundN) * RAD);

  if (groundSpeed > 1e-4) {
    s.pos = rhumbStep(s.pos, cog, groundSpeed * dt);
  }

  const speedThroughWater = Math.hypot(s.surge, s.sway);
  const inIrons = Math.abs(beta) < 35 && s.surge < 0.55 && drive < 200;

  return {
    beta,
    apparentKnots: apparentSpeed / KNOTS,
    apparentFrom,
    speedKnots: (s.surge < 0 ? -speedThroughWater : speedThroughWater) / KNOTS,
    groundKnots: groundSpeed / KNOTS,
    courseOverGround: cog,
    leeway: leewayRad * RAD,
    drive,
    sideForce: side,
    perSail,
    inIrons,
    makingSternway: s.surge < -0.05,
    rigStress: maxStress / clamp(tune.integrity, 0.2, 1),
  };
}

/** Create a fresh set of sails for a hull, all furled. */
export function initialSails(hull: HullClass): SailState[] {
  return hull.masts.map((m) => ({
    set: 0,
    trim: RIG_PROFILES[m.rig].minTrim + 20,
    side: -1,
    shifting: 0,
    condition: 1,
  }));
}

/**
 * How much canvas she ought to be carrying for the wind that is blowing. Beyond
 * this the spars are at risk, and past twice this she will be dismasted.
 */
/**
 * How fast the hands get a sail across, as a multiple of the nominal time. The
 * shift counter is in nominal seconds, so real seconds are counter / this — and
 * anything reporting a countdown to the player has to divide.
 */
export function sailHandRate(tune: ShipTuning): number {
  return clamp(
    tune.crewFactor * (0.55 + 0.7 * tune.seamanship) * (tune.sailHandling ?? 1),
    0.15, 9,
  );
}

export function prudentCanvas(windKnots: number): number {
  if (windKnots < 17) return 1;
  if (windKnots < 24) return 0.85;
  if (windKnots < 31) return 0.6;
  if (windKnots < 39) return 0.35;
  if (windKnots < 48) return 0.15;
  return 0;
}

/** Convert a speed in metres per second to knots. */
export function toKnots(ms: number): number {
  return ms / KNOTS;
}

/** Estimate the best speed achievable at a given wind angle, for the polar diagram. */
export function polarSpeed(
  hull: HullClass,
  d: HullDerived,
  windKnots: number,
  beta: number,
  tune: ShipTuning,
): number {
  const state: DynamicState = {
    pos: { lat: 0, lon: 0 },
    heading: 0,
    yawRate: 0,
    surge: 1,
    sway: 0,
    heel: 0,
    rudder: 0,
    sails: initialSails(hull),
  };
  for (const s of state.sails) { s.set = prudentCanvas(windKnots); s.side = beta >= 0 ? -1 : 1; }

  const env: Environment = {
    windFrom: wrap360(beta),
    windKnots,
    currentToward: 0,
    currentKnots: 0,
    waveHeight: 0.02 * windKnots * windKnots,
  };

  let best = 0;
  // Try a spread of trims and settle each one out.
  for (let trimOffset = -25; trimOffset <= 25; trimOffset += 5) {
    state.surge = 1; state.sway = 0; state.heel = 0; state.heading = 0;
    for (let i = 0; i < state.sails.length; i++) {
      const p = RIG_PROFILES[hull.masts[i].rig];
      state.sails[i].trim = clamp(Math.abs(beta) - 20 + trimOffset, p.minTrim, p.maxTrim);
      state.sails[i].side = beta >= 0 ? -1 : 1;
      state.sails[i].shifting = 0;
    }
    for (let step = 0; step < 260; step++) {
      state.heading = 0;
      state.yawRate = 0;
      stepShip(state, hull, d, env, tune, 1);
    }
    best = Math.max(best, state.surge / KNOTS);
  }
  return Math.max(0, best);
}

/** Direction helper for the HUD: which way to put the helm to reach a heading. */
export function helmToward(current: number, target: number): number {
  return clamp(angleDelta(current, target) / 25, -1, 1);
}

export { sind, cosd };
