import { Clock } from '../core/clock';
import {
  NM, angleDelta, clamp, cosd, formatBearing, formatLat, formatLon, haversine,
  lerp, rhumbStep, wrap180, wrap360,
} from '../core/math';
import { Rng } from '../core/rng';
import { Weather, type WeatherSample } from '../world/weather';
import { currentAt, dominantCurrentName, tidalStream, tideHeight } from '../world/currents';
import { depthAt, nearestShore } from '../world/landmass';
import { PORTS, anchorageOf, portDef, portsNear, type PortDef } from '../world/ports';
import { people } from '../world/peoples';
import { Ship } from '../ship/ship';
import { hullClass } from '../ship/hull';
import {
  KNOTS, prudentCanvas, stepShip, type Environment, type ShipTuning, type StepResult,
} from '../ship/physics';
import {
  RIG_PROFILES, closestPointing, optimalTrim, pointOfSail, sailForce, tackName, trimBand,
} from '../ship/rig';
import { Navigator } from '../navigation/navigator';
import { Chart, sightingRangeNm, type SurveyResult } from '../navigation/charts';
import { sightOpportunities, type SightBody } from '../navigation/navigator';
import { magneticVariation } from '../navigation/celestial';
import {
  ableHands, crewFactor, enduranceDays, newCrew, officerBonus, updateCrew, type CrewState,
} from '../crew/crew';
import { newSkills, skill, train, type SkillSet } from '../crew/skills';
import { Markets } from '../economy/market';
import { Crown, portName } from '../progression/crown';
import { newRelations, type Relations } from '../diplomacy/contact';
import { Logbook, type LogKind } from './log';
import { rollSeaEvent, type SeaEvent } from './seaEvents';
import { rollOfficerEvent } from './officerEvents';
import { difficultyDef, type Difficulty, type DifficultyDef } from './difficulty';
import { checkLead, hearRumour, type Lead } from '../progression/leads';
import { daysLeft, offerVentures, ventureLine, type Venture } from '../progression/ventures';
import { advanceRival, newRival, rivalGossip, type RivalState } from '../progression/rival';
import { assignTraits, wardroom, type TraitEffects } from '../progression/officers';
import { good } from '../economy/goods';

export type GameMode =
  | 'sailing' | 'chart' | 'sight' | 'logbook' | 'crew' | 'port'
  | 'audience' | 'court' | 'shipyard' | 'menu' | 'title' | 'gameover' | 'orders' | 'epilogue';

/** One mast's sails, as set against how they ought to be. */
export interface MastTrim {
  name: string;
  /** Angle the yard is braced to, from the centreline. */
  trim: number;
  /** Angle that would draw best on this point of sail. */
  want: number;
  /** The run either side of it that is near enough to make no odds. */
  bandLo: number;
  bandHi: number;
  /** The range the rig can actually be braced through. */
  min: number;
  max: number;
  quality: number;
  /** False when nothing in the rig's range would drive her on this heading. */
  drawing: boolean;
}

export interface TrimReport {
  quality: number;
  advice: string;
  shifting: boolean;
  masts: MastTrim[];
}

export interface Sounding {
  depth: number;
  shoreDistNm: number;
  shoreBearing: number;
  aground: boolean;
  shoaling: boolean;
}

export interface Alert {
  id: number;
  text: string;
  severity: 'note' | 'warning' | 'grave';
  t: number;
}

export class Game {
  clock: Clock;
  rng: Rng;
  seed: number;

  weather: Weather;
  ship: Ship;
  crew: CrewState;
  nav: Navigator;
  chart: Chart;
  crown: Crown;
  markets: Markets;
  skills: SkillSet;
  log = new Logbook();

  relations = new Map<string, Relations>();
  /** Ports the player has actually entered. */
  visitedPorts = new Set<string>();

  /** Rumours picked up in port, and the ones already run down. */
  leads: Lead[] = [];
  /** Merchants' charters taken on the captain's own account. */
  ventures: Venture[] = [];
  /** Charters on offer where she now lies, refreshed with the market. */
  ventureOffers: Venture[] = [];
  /** The other captain, working his way down the coast while you refit. */
  rival: RivalState;
  /** What they are saying about the other man in the port she now lies in. */
  portGossip: string | null = null;
  private nextVentureId = 1;
  private nextLeadId = 1;

  mode: GameMode = 'title';
  /** Set while at anchor in a port. */
  dockedAt: string | null = null;
  anchored = false;

  /** Latest simulation readouts, refreshed every step. */
  weatherNow!: WeatherSample;
  physics!: StepResult;
  sounding: Sounding = { depth: 4000, shoreDistNm: 999, shoreBearing: 0, aground: false, shoaling: false };
  /**
   * The heading and heel as they are *shown* — on the compass, on the tape, and
   * in the 3D view — which are the simulated ones through a short real-time
   * filter.
   *
   * At the fast clock rates a single rendered frame covers minutes of sailing,
   * so the simulated heel can legitimately move several degrees between two
   * frames and the heading a degree or two. Drawn literally that is a lurch,
   * not a roll, and a compass card that jumps is the thing that reads as being
   * out of control. The filter runs on real seconds with a time constant of
   * about an eighth of one: far too short to feel at the helm, long enough that
   * a frame covering a quarter of an hour is drawn as motion.
   */
  displayHeading = 0;
  displayHeel = 0;

  /**
   * The weather as it is *shown*, which is the weather's trend rather than its
   * instant.
   *
   * Measured at the half-day rate, every single rendered frame carries up to
   * twenty-six degrees of wind shift, six knots of wind and a metre of sea —
   * and the ocean is rebuilt from exactly those numbers, so the water reshuffles
   * sixty times a second. None of that is a bug: thirty minutes really does
   * pass per frame and the weather really does change that much in thirty
   * minutes. But you cannot *see* a gust that lasted half an hour, and drawing
   * one is not honesty, it is noise.
   *
   * So the sea and the dials follow a filter running on real seconds, the same
   * one the heading and the heel use. At real time it is imperceptible — the
   * lag is a fifth of a second. Wound up, the view becomes what it actually is,
   * a time-lapse, in which the weather visibly builds and veers instead of
   * flickering. The physics is untouched and still feels every gust.
   */
  displayWind = { from: 0, speed: 0 };
  displayWave = 0;
  displaySwell = 0;
  /** Apparent wind as shown, which is what the pennant and the telltales fly by. */
  displayBeta = 0;
  displayApparent = 0;

  currentToward = 0;
  currentKnots = 0;
  currentName: string | null = null;

  alerts: Alert[] = [];
  private nextAlertId = 1;

  /**
   * An event waiting on the captain's decision. While one is set the clock is
   * held and the sailing view puts it in front of him; nothing else fires until
   * it is answered.
   */
  pendingEvent: SeaEvent | null = null;
  /** The last few event ids, so the same thing does not happen twice running. */
  recentEvents: string[] = [];
  /** Simulated days since anything at all happened, for the pacing floor. */
  daysSinceEvent = 0;
  /** Simulated days since the captain was asked anything, which matters more. */
  daysSinceDecision = 0;
  /** Simulated days since she last lay in a port. */
  daysSincePort = 0;

  /**
   * Where she is trying to get to.
   *
   * Held in *charted* coordinates, not true ones. Steering for a place you have
   * marked on your own chart means steering for where you believe it to be, and
   * if your reckoning has drifted the course you lay off is wrong in exactly the
   * way the reckoning is wrong. That is the whole game.
   */
  destination: { name: string; lat: number; lon: number } | null = null;

  /**
   * A compass course the watch are told to hold, when the captain is conning
   * her by course rather than by mark.
   *
   * A ship is not steered at eighteen hundred times real time by holding a
   * rudder over — but she is very much *conned*: "two points to starboard" is
   * an order, the quartermaster puts her there, and she stays there. That is
   * what the helm does once the clock is up, and it is why touching it no
   * longer has to stop the clock. Takes precedence over the mark while it is
   * set; the mark stays on the chart and the tape so the captain can see how
   * far his own course is taking him off it.
   */
  helmOrder: number | null = null;

  /**
   * How far she has actually come.
   *
   * A ship held at the origin with the sea streaming past her gives the eye
   * almost nothing to measure progress by, and at the fast clock rates that
   * reads — correctly — as making no headway at all. These are the figures a
   * navigator kept for exactly the same reason: the day's run written in the
   * log at noon is how anybody knew whether a passage was going well.
   */
  /** Nautical miles logged through the water since she sailed. */
  distanceRun = 0;
  /** Miles made good over the ground, which is the one that gets you there. */
  groundRun = 0;
  /** Miles over the ground since the last noon, and the last few days' runs. */
  private runSinceNoon = 0;
  private noonAt = -1;
  dayRuns: { date: string; nm: number; lat: number; hours: number }[] = [];
  private lastNoonDay = -1;
  /** Where the present course was laid off from, and how far it was then. */
  markLaidAt: { lat: number; lon: number } | null = null;
  markDistNm = 0;
  private eventCooldown = 0;

  /** Fraction of the standard ration being issued. */
  ration = 1;
  /** Hands told off to the pumps rather than to the sails. */
  pumpEffort = 0.15;
  /**
   * How much of the ship's routine work the player does with his own hands.
   * Changes nothing about the world — only who trims the yards and who decides
   * when to shorten sail.
   */
  difficulty: Difficulty = 'watch';

  /**
   * The canvas the captain has ordered, as against the canvas actually set.
   *
   * On the relaxed setting the watch takes sail off her when it comes on to
   * blow and makes it again afterwards, and they need to know what to make it
   * back *to* — which is the last thing the captain asked for, not whatever
   * happened to be set when the squall hit.
   */
  orderedCanvas = 0;

  /** True when the crew trim the sails without being told. */
  autoTrim = true;
  /**
   * True when the quartermaster is keeping her on the laid-off course.
   *
   * A three-month passage cannot be steered by hand, and a player holding a key
   * down for an hour to make a two-degree correction is not being challenged, he
   * is being punished. What the game is actually about is deciding *which*
   * course to steer and what canvas to carry — so once the course is decided,
   * the helm can be given to the watch, as it always was aboard.
   */
  holdCourse = false;

  /** Simulated seconds when she dropped down the Tagus, for the epilogue. */
  startT = 0;

  private accumDays = 0;
  /** Furthest south she has ever been, which is how a captain is measured. */
  private deepestSouth = 90;
  private lastLat = 0;
  private lastSurveyT = -1e9;
  /** Miles of coast drawn or corrected since she last lay in a port. */
  chartedThisPassage = 0;
  /** Total error taken out of the inherited chart, in miles. */
  correctedNm = 0;
  private lastSurveyWord = -1e9;
  private lastSightWord = -1e9;
  private lastLandWord = -1e9;
  /**
   * When the land was last in sight from the masthead.
   *
   * Raising land after a long passage is the oldest and best moment in any
   * voyage, and the game only ever mentioned land as a hazard — "she is
   * standing at it" — so a ship coasting comfortably past Africa, or making a
   * perfect landfall after three weeks of blue water, was told nothing at all.
   */
  private lastLandSeenT = -1e9;
  /** True while she is in soundings, so the cry is given once and not hourly. */
  private landInSight = false;
  /** The last course the watch settled on after looking at the water. */
  private avoidCourse = 0;
  private avoidWant = 0;
  private avoidCheckedT = -1e9;
  /** True while the watch are steering off the course to keep her off a shore. */
  avoidingLand = false;
  /** Which way round she is weathering it: +1 starboard, -1 larboard. */
  private avoidSide = 0;
  private lastPortCheck = -1e9;
  private lastCanvasWord = -1e9;
  private lastManualTrim = -1e9;
  gameOverReason: string | null = null;

  constructor(seed = Math.floor(Math.random() * 1e9)) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.clock = new Clock({ year: 1482, month: 7, day: 12 });

    const start = anchorageOf(portDef('lisboa'));
    this.weather = new Weather(seed);
    this.ship = new Ship('São Cristóvão', 'caravela-latina', start, 200);
    this.crew = newCrew(hullClass('caravela-latina').crewFull, this.rng);
    this.nav = new Navigator(start, seed);
    this.chart = new Chart();
    this.crown = new Crown(seed);
    this.markets = new Markets(seed);
    this.skills = newSkills();
    this.rival = newRival(this.rng);
    this.rival.lastNews = this.clock.t;
    // She begins at a quay, which is as much in sight of land as it gets.
    this.lastLandSeenT = this.clock.t;
    assignTraits(this.crew, this.rng);

    for (const p of PORTS) {
      const pe = people(p.people);
      const rel = newRelations(pe);
      if (p.people === 'portuguese') { rel.met = true; rel.mayTrade = true; rel.regard = 1; }
      this.relations.set(p.id, rel);
    }

    this.dockedAt = 'lisboa';
    this.anchored = true;
    this.visitedPorts.add('lisboa');
    this.lastLat = start.lat;
    this.displayHeading = this.ship.state.heading;
    // She lies in the Tagus with her position known to the yard of the quay, so
    // the reckoning starts fresh rather than nineteen thousand days stale.
    this.nav.lastFixT = this.clock.t;
    this.refreshPortBusiness(portDef('lisboa'));
    this.startT = this.clock.t;

    this.refreshEnvironment();
    this.log.add({
      t: this.clock.t, date: this.clock.formatDate(), time: this.clock.formatTime(),
      kind: 'note', important: true,
      text: 'The São Cristóvão lies in the Tagus, stored and watered. Whatever happens after this is written in this book.',
    });
  }

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  get effectiveSkill(): SkillSet {
    const s = { ...this.skills };
    for (const k of Object.keys(s) as (keyof SkillSet)[]) {
      s[k] = clamp(s[k] + officerBonus(this.crew, k) * 100, 0, 100);
    }
    return s;
  }

  get rules(): DifficultyDef {
    return difficultyDef(this.difficulty);
  }

  get tuning(): ShipTuning {
    const eff = this.effectiveSkill;
    return {
      fouling: 1 + this.ship.condition.fouling * 0.85,
      crewFactor: crewFactor(this.crew, this.ship.baseHull.crewMin) * this.wardroom.handling,
      seamanship: skill(eff, 'marinharia'),
      keel: this.ship.effects.keel,
      integrity: this.ship.condition.hull,
      sailHandling: this.rules.handRate,
    };
  }

  /**
   * The officers' combined effect on the ship, recomputed only when the
   * wardroom actually changes — it is read every physics step and walking the
   * officer list at sixty hertz is waste.
   */
  private wardroomCache: TraitEffects | null = null;
  private wardroomStamp = '';

  get wardroom(): TraitEffects {
    const stamp = this.crew.officers
      .map((o) => `${o.id}${o.alive ? 1 : 0}${o.ashoreAt ?? ''}${o.loyalty.toFixed(2)}`)
      .join('|');
    if (!this.wardroomCache || stamp !== this.wardroomStamp) {
      this.wardroomCache = wardroom(this.crew);
      this.wardroomStamp = stamp;
    }
    return this.wardroomCache;
  }

  /** True where no Portuguese ship has been, which the crew feel keenly. */
  get beyondTheKnown(): boolean {
    const p = this.ship.state.pos;
    if (p.lat < 3 && p.lon > -20) return true;
    if (p.lat < -8) return true;
    if (p.lon > 20 && p.lat < 20) return true;
    return false;
  }

  get portHere(): PortDef | null {
    return this.dockedAt ? portDef(this.dockedAt) : null;
  }

  /** Ports close enough to enter. */
  approachablePorts(): { def: PortDef; distNm: number }[] {
    return portsNear(this.ship.state.pos, 8).map((p) => ({ def: p.def, distNm: p.distNm }));
  }

  relationsFor(portId: string): Relations {
    let r = this.relations.get(portId);
    if (!r) {
      r = newRelations(people(portDef(portId).people));
      this.relations.set(portId, r);
    }
    return r;
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  /** Sample everything that depends on where and when the ship is. */
  /** Carry the shown heading and heel toward the simulated ones. */
  private smoothDisplay(realDt: number): void {
    const dt = clamp(realDt, 1 / 240, 0.25);
    const k = 1 - Math.exp(-8 * dt);
    this.displayHeading = wrap360(
      this.displayHeading + angleDelta(this.displayHeading, this.ship.state.heading) * k,
    );
    this.displayHeel += (this.ship.state.heel - this.displayHeel) * k;

    // The weather is filtered harder than the ship, because it is what the
    // whole sea is rebuilt from and because nobody expects the wind to answer
    // as quickly as a rudder. A second and a half of real time.
    const w = this.weatherNow;
    if (this.displayWind.speed === 0 && this.displayWave === 0) {
      this.displayWind = { from: w.wind.from, speed: w.wind.speed };
      this.displayWave = w.waveHeight;
      this.displaySwell = w.swellFrom;
      return;
    }
    const kw = 1 - Math.exp(-0.7 * dt);
    this.displayWind.from = wrap360(
      this.displayWind.from + angleDelta(this.displayWind.from, w.wind.from) * kw,
    );
    this.displayWind.speed += (w.wind.speed - this.displayWind.speed) * kw;
    this.displayWave += (w.waveHeight - this.displayWave) * kw;
    this.displaySwell = wrap360(
      this.displaySwell + angleDelta(this.displaySwell, w.swellFrom) * kw,
    );

    // And the apparent wind, which the pennant and the telltales stream by.
    // Left raw they flick through tens of degrees a frame while the sea they
    // are supposed to be describing moves smoothly, which reads worse than
    // either on its own.
    const p = this.physics;
    if (p) {
      const kb = 1 - Math.exp(-1.6 * dt);
      // Filtered as an angle, not as a number. Beta lives in [-180, 180], so
      // when the apparent wind crosses the stern it steps by a full turn — and
      // a plain filter then sweeps the drawn value the long way round, which on
      // screen is every sail in the ship swinging across and back for no reason.
      this.displayBeta = wrap180(
        this.displayBeta + angleDelta(this.displayBeta, p.beta) * kb,
      );
      this.displayApparent += (p.apparentKnots - this.displayApparent) * kb;
    }
  }

  refreshEnvironment(): void {
    const pos = this.ship.state.pos;
    this.weatherNow = this.weather.sample(pos, this.clock.dayOfYear, this.clock.t);

    const shore = nearestShore(pos, 90);
    const depth = depthAt(pos, shore) + tideHeight(pos, this.clock.t);
    this.sounding = {
      depth,
      shoreDistNm: shore.distance / NM,
      shoreBearing: wrap360(shore.bearing),
      aground: depth < this.ship.baseHull.draft * 1.05,
      shoaling: depth < this.ship.baseHull.draft * 4,
    };

    const oceanCurrent = currentAt(pos, this.clock.dayOfYear);
    const tide = tidalStream(pos, this.clock.t, this.sounding.shoreDistNm);
    // Combine as vectors.
    const e = Math.sin((oceanCurrent.toward * Math.PI) / 180) * oceanCurrent.knots
      + Math.sin((tide.toward * Math.PI) / 180) * tide.knots;
    const n = Math.cos((oceanCurrent.toward * Math.PI) / 180) * oceanCurrent.knots
      + Math.cos((tide.toward * Math.PI) / 180) * tide.knots;
    this.currentKnots = Math.hypot(e, n);
    this.currentToward = wrap360((Math.atan2(e, n) * 180) / Math.PI);
    this.currentName = dominantCurrentName(pos);

    if (!this.physics) {
      this.physics = this.runPhysics(0.01);
    }
  }

  private buildEnvironment(): Environment {
    return {
      windFrom: this.weatherNow.wind.from,
      windKnots: this.weatherNow.wind.speed,
      currentToward: this.currentToward,
      currentKnots: this.anchored ? 0 : this.currentKnots,
      waveHeight: this.weatherNow.waveHeight,
    };
  }

  private runPhysics(dt: number): StepResult {
    return stepShip(
      this.ship.state, this.ship.hull, this.ship.derived,
      this.buildEnvironment(), this.tuning, dt,
    );
  }

  /**
   * Advance the world. `realDt` is wall-clock seconds; the clock's scale turns
   * that into simulated time.
   */
  update(realDt: number): void {
    if (this.mode === 'title' || this.mode === 'gameover') return;
    this.smoothDisplay(realDt);
    // A decision is outstanding: the ship sails on but nothing new happens to
    // her until it is answered, so the player is never handed two at once.
    if (this.pendingEvent) return;

    const simDt = this.clock.advance(Math.min(realDt, 0.25));
    if (simDt <= 0) {
      this.physics = this.runPhysics(0.016);
      return;
    }

    this.weather.update(simDt, this.clock.t, this.ship.state.pos);
    this.refreshEnvironment();

    if (this.anchored) {
      this.ship.state.surge *= 0.85;
      this.ship.state.sway *= 0.85;
      this.ship.state.yawRate *= 0.8;
      this.physics = this.runPhysics(Math.min(simDt, 2));
    } else {
      this.integrateSailing(simDt);
    }

    this.updateNavigation(simDt);
    this.updateCrewAndShip(simDt);
    this.checkNoon();
    this.checkWorldEvents();
    this.rollIncidents(simDt);
    this.expireAlerts();
  }

  /**
   * Physics integration with a step size that adapts to the time acceleration.
   * At high acceleration the ship is on a settled course, so a coarse step is
   * both adequate and necessary.
   */
  private integrateSailing(simDt: number): void {
    // Two different limits, for two different reasons.
    //
    // The hull's dynamics are written to be stable at any step size, but a step
    // of a minute still *averages* manoeuvring away: she rounds corners she
    // should have had to make properly. Two seconds keeps that honest.
    //
    // The course-keeper is a control loop closed round the ship, and a control
    // loop stepped more slowly than its plant responds oscillates however it is
    // integrated. Measured, it is clean at a second and starts sawing at a
    // second and a half — so when the watch have the helm, the step is a second.
    const maxStep = this.holdCourse ? 1 : 2;
    const maxSteps = 48;
    let step = 0.25;
    if (simDt / step > maxSteps) step = clamp(simDt / maxSteps, 0.25, maxStep);
    let remaining = simDt;

    // Whatever will not fit in that many honest steps is sailed as a passage
    // rather than steered. At the two fastest rates the player is not conning
    // the ship at all — he has laid off a course and is running the miles off —
    // and pretending otherwise is what made her feel out of hand.
    const budget = maxStep * maxSteps;
    if (remaining > budget) {
      this.advancePassage(remaining - budget);
      remaining = budget;
    }

    while (remaining > 0) {
      const dt = Math.min(step, remaining);
      if (this.holdCourse) this.steerToCourse(dt);
      // On the relaxed setting a captain who reaches for the sheets gets them,
      // and the watch quietly take them back a few minutes later. Otherwise one
      // stray keypress silently switches the game into the hard mode and the
      // player never finds out why she stopped sailing well.
      if (!this.autoTrim && this.rules.autoTrim
          && this.clock.t - this.lastManualTrim > 240) {
        this.autoTrim = true;
        this.pushAlert('The watch have the sheets again.', 'note');
      }
      if (this.autoTrim) this.applyAutoTrim(dt);
      if (this.rules.autoCanvas) this.applyAutoCanvas(dt);
      this.physics = this.runPhysics(dt);
      remaining -= dt;
    }
  }

  /**
   * Sail her as a passage rather than conning her.
   *
   * Used when the clock is running so fast that a frame covers minutes: her
   * head is laid on the course and held there, the helm is not worked at all,
   * and the miles are run off at whatever speed the rig and the sea give her.
   * This is not a shortcut around the simulation — the wind, the currents, the
   * leeway, the trim and the hull are all exactly the same, and the position
   * she arrives at is the position the full integration would have given. The
   * only thing left out is the second-by-second work of the helmsman, which at
   * eighteen hundred times real time nobody is doing.
   *
   * Broken into chunks so that a wind shift, a change of trim or the watch
   * shortening sail partway through is still felt.
   */
  private advancePassage(dt: number): void {
    const s = this.ship.state;
    const wanted = this.holdCourse ? this.courseToSteer() : null;
    const want = wanted === null ? null : this.clearCourse(wanted);

    if (want !== null) {
      // She comes round at a rate a ship actually turns, not instantly, so a
      // course laid off across the wind still costs the time it should.
      const delta = angleDelta(s.heading, want);
      s.heading = wrap360(s.heading + clamp(delta, -0.5 * dt, 0.5 * dt));
    }
    s.rudder = 0;
    s.yawRate = 0;

    const chunks = 6;
    const chunk = dt / chunks;
    for (let i = 0; i < chunks; i++) {
      if (this.autoTrim) this.applyAutoTrim(chunk);
      if (this.rules.autoCanvas) this.applyAutoCanvas(chunk);
      const held = s.heading;
      this.physics = this.runPhysics(chunk);
      // The watch are holding her there. Whatever the rig tried to do to her
      // head over the last quarter of an hour, they took out with the helm.
      if (want !== null) {
        s.heading = held;
        s.yawRate = 0;
      }
    }
  }

  /**
   * The quartermaster keeps her on the course laid off, within the limits of
   * what she will actually do.
   *
   * He will not steer her inside the no-go: if the mark lies to windward the
   * best he can do is lie as close as she will point, on whichever tack is
   * making the most ground toward it, and it is then the captain's business to
   * decide when to go about. That is the one piece of judgement this does not
   * take away, because it is the interesting one.
   */
  /**
   * The heading the quartermaster is actually trying to hold, which is the
   * bearing of the mark unless the mark lies inside the no-go — in which case
   * it is as close as she will lie on the tack she is already on.
   */
  courseToSteer(): number | null {
    const dest = this.courseToDestination();
    const wanted = this.helmOrder ?? dest?.bearing ?? null;
    if (wanted === null) return null;
    const windEye = this.weatherNow.wind.from;
    const noGo = this.noGoAngle;
    // Dead to windward: lie as close as she will on the tack already set, so she
    // holds a board instead of hunting across the wind's eye. When to go about
    // is then the captain's business, which is the interesting decision and the
    // one this deliberately does not take away.
    if (Math.abs(angleDelta(windEye, wanted)) < noGo) {
      const side = Math.sign(angleDelta(windEye, this.ship.state.heading)) || 1;
      return wrap360(windEye + side * noGo);
    }
    return wanted;
  }

  /**
   * Whether the water along a given course is clear for the next few hours.
   *
   * Probed rather than computed: a handful of points along the bearing, each
   * asked how deep it is. Anything shoaler than a few times her draft counts as
   * land, because a caravel drawing two metres does not want to find out
   * whether four is enough in a swell.
   */
  private waterClearOn(bearing: number, aheadNm: number): boolean {
    const from = this.ship.state.pos;
    // Twenty metres under her and three and a half miles of offing.
    //
    // Clearing her draft is not the test. A ship embayed on a lee shore in
    // twelve metres with the wind onto it is already lost, and the whole
    // practice of the period was to keep an offing — enough water to claw off
    // in if it came on to blow. Testing depth alone had her threading the
    // Moroccan shallows a mile and a half off the beach in eight metres, which
    // is survivable until the first gale and then is not.
    const safe = this.ship.baseHull.draft * 10;
    const offingNm = 3.5;
    const probes = 7;
    for (let i = 1; i <= probes; i++) {
      const d = (aheadNm * i) / probes;
      const at = rhumbStep(from, bearing, d * NM);
      // A tight search radius: the question is only whether *this* spot is
      // clear, and nothing far away can make it foul. Asking depthAt directly
      // searches ninety miles for the nearest coast, which is an enormous query
      // to run seven times a probe on a course checked all voyage.
      const shore = nearestShore(at, 16);
      if (shore.land < 0) continue;
      if (shore.signed <= 0) return false;
      if (shore.distance / NM < offingNm) return false;
      if (depthAt(at, shore) < safe) return false;
    }
    return true;
  }

  /**
   * The course the watch will actually steer, having looked at the water.
   *
   * The single most important thing this function does is refuse to sail her
   * ashore. Before it existed the course-keeper steered the bearing of the mark
   * and nothing else, and since the rhumb from Lisbon to Mina runs across
   * Portugal, five runs out of five ended aground within a day of weighing and
   * the ship broke up inside a week. A quartermaster does not do that. He sees
   * the land, he says so, and he keeps her off it until the captain tells him
   * otherwise.
   *
   * He alters as little as he can: the sweep runs outward from the course he
   * wants, and he takes the first heading that is both clear and sailable, so
   * she is never further off her course than the coast obliges her to be.
   */
  private clearCourse(want: number): number {
    const speed = Math.max(Math.abs(this.physics?.speedKnots ?? 0), 2);
    // Three hours of looking ahead, which is about as far as a lookout at the
    // masthead can see anyway.
    const ahead = clamp(speed * 3, 6, 26);

    // Cached: probing the coast is a spatial query and the steering loop runs
    // up to forty-eight times a frame. The water does not change in two minutes.
    const fresh = this.clock.t - this.avoidCheckedT < 120
      && Math.abs(angleDelta(this.avoidWant, want)) < 4;
    if (fresh) return this.avoidCourse;

    this.avoidCheckedT = this.clock.t;
    this.avoidWant = want;

    // Most of a voyage is a long way from anything. If the nearest land is
    // further off than she can possibly reach in the look-ahead, there is
    // nothing to check and no reason to pay for checking it.
    if (this.sounding.shoreDistNm > ahead + 12) {
      if (this.avoidingLand) {
        this.avoidingLand = false;
        this.avoidSide = 0;
        this.pushAlert('Clear water ahead. The watch have her back on her course.', 'note');
      }
      this.avoidCourse = want;
      return want;
    }

    // Coming back onto the course wants a wider look than going off it did, so
    // she rounds a headland properly instead of cutting the corner the moment
    // the point is abeam.
    if (this.waterClearOn(want, this.avoidingLand ? ahead * 1.6 : ahead)) {
      if (this.avoidingLand) {
        this.avoidingLand = false;
        this.avoidSide = 0;
        this.pushAlert('Clear water ahead. The watch have her back on her course.', 'note');
      }
      this.avoidCourse = want;
      return want;
    }

    // Something is in the way. Take the smallest alteration that clears it, and
    // do not steer into the wind's eye to do it.
    //
    // Once she has begun to weather something she keeps going the same way
    // round it. Re-choosing the smallest deviation from scratch on every check
    // is what walks a ship into a bay: each look says the shortest way to the
    // mark is a little to port, then a little to starboard, and she creeps into
    // the corner and grounds. Measured, that is exactly what happened at the
    // Cap-Vert peninsula — she got sixteen hundred miles down the coast and
    // then trapped herself on the one headland that sticks out. Committing to a
    // side and holding it until the mark can be laid is coast-following, which
    // is what a pilot does and why the Portuguese got round Africa at all.
    const windEye = this.weatherNow.wind.from;
    const noGo = this.noGoAngle;
    // Which way to go round it: away from where the land actually bears, which
    // is what a seaman does and what picking the smaller sweep does not. On a
    // coast running down her port side, the smaller sweep is repeatedly to
    // port, and that is how she ends up in the bay.
    const towardLand = angleDelta(want, this.sounding.shoreBearing);
    const away = towardLand > 0 ? -1 : 1;
    const sides: number[] = this.avoidingLand && this.avoidSide !== 0
      ? [this.avoidSide, -this.avoidSide]
      : [away, -away];

    for (const side of sides) {
      for (let off = 12; off <= 120; off += 12) {
        const trial = wrap360(want + side * off);
        if (Math.abs(angleDelta(windEye, trial)) < noGo) continue;
        if (!this.waterClearOn(trial, ahead)) continue;
        if (!this.avoidingLand) {
          this.avoidingLand = true;
          this.avoidSide = side;
          this.pushAlert(
            `Land ahead. The watch have hauled her ${off}° to ${side > 0 ? 'starboard' : 'larboard'} to weather it.`,
            'warning');
          this.logEvent('navigation',
            `Land raised fine on the ${side > 0 ? 'starboard' : 'larboard'} bow, standing right `
            + 'across the course laid off. Hauled her up to weather it. The chart says one thing '
            + 'and the coast says another, and the coast is always right.');
        }
        this.avoidCourse = trial;
        return trial;
      }
    }

    // Embayed: nothing within ninety-six degrees of the course is clear water.
    // Get her head off the land and tell the captain, because this is his
    // problem now and not the quartermaster's.
    const off = wrap360(this.sounding.shoreBearing + 180);
    if (!this.avoidingLand) {
      this.avoidingLand = true;
      this.pushAlert('Land all round the bow. She is standing off — come and look at the chart.', 'grave');
    }
    this.avoidCourse = off;
    return off;
  }

  private steerToCourse(dt: number): void {
    const wanted = this.courseToSteer();
    if (wanted === null) return;
    const want = this.clearCourse(wanted);

    const windEye = this.weatherNow.wind.from;
    const noGo = this.noGoAngle;
    const heading = this.ship.state.heading;

    // Which way round to bring her head.
    //
    // Not simply the shorter way. A helmsman who takes the short way whenever it
    // is short will sooner or later steer her straight into the wind's eye,
    // where the sails go aback, the way comes off her, the rudder loses its flow
    // and she stops dead — caught in stays, and it can take twenty minutes and
    // every hand aboard to get her out of it. She is therefore wound round the
    // other way instead, through the stern: wearing ship costs distance and
    // costs nothing else, which is exactly the trade a quartermaster makes.
    const short = angleDelta(heading, want);
    let dir: number = short >= 0 ? 1 : -1;
    if (sweepEntersEye(heading, Math.abs(short), dir, windEye, noGo)) dir = -dir;

    // Signed sweep in the chosen direction, which may be the long way round.
    const sweep = dir > 0 ? wrap360(want - heading) : -wrap360(heading - want);

    // He anticipates: he checks the swing before she reaches the course, or she
    // wanders either side of it for the whole watch.
    const demand = clamp(sweep * 0.05 - this.ship.state.yawRate * 0.85, -1, 1);
    const rate = 0.9 + skill(this.effectiveSkill, 'marinharia') * 1.2;

    // Move the helm toward the demand as a first-order lag rather than a fixed
    // step of `dt * rate`.
    //
    // This is a control loop closed round a ship, and a control loop stepped
    // more slowly than the thing it is controlling responds will oscillate. At
    // a step of one second this one was putting the helm hard over one way and
    // hard over the other on alternate steps — which is exactly what a helmsman
    // sawing at the wheel looks like, and is why she felt out of hand above
    // x300. An exponential approach cannot overshoot the demand at any step
    // size; the demand itself is kept sane by capping how long a step the
    // course-keeper is ever asked to take (see integrateSailing).
    const move = 1 - Math.exp(-rate * dt);
    this.ship.state.rudder = clamp(
      this.ship.state.rudder + (demand - this.ship.state.rudder) * move,
      -1, 1,
    );
  }

  /** The crew keep the sails drawing without being told, imperfectly. */
  private applyAutoTrim(dt: number): void {
    const beta = this.physics?.beta ?? 0;
    const eff = this.effectiveSkill;
    const sk = skill(eff, 'marinharia');
    const rules = this.rules;
    const rate = dt * (0.4 + sk * 1.6) * rules.trimRate
      * clamp(crewFactor(this.crew, this.ship.baseHull.crewMin), 0.1, 1.4);

    for (let i = 0; i < this.ship.state.sails.length; i++) {
      const sail = this.ship.state.sails[i];
      // A crew who are already handling the yard brace it round to where it
      // wants to be on the way, so it draws the moment it is over. Otherwise
      // the sail comes across and then a fresh minute of trimming begins, which
      // is the part that actually feels like waiting.
      if (sail.shifting > 0 && !rules.trimWhileShifting) continue;
      const profile = RIG_PROFILES[this.ship.hull.masts[i].rig];
      const want = optimalTrim(beta, profile, sail.trim);
      // A less skilled crew settle for a rougher trim — and how rough anybody is
      // willing to settle for is the difference between the two settings.
      const slop = lerp(rules.slopWorst, rules.slopBest, sk);
      const target = want + (this.rng.next() - 0.5) * slop;
      const d = target - sail.trim;
      sail.trim = clamp(
        sail.trim + Math.sign(d) * Math.min(Math.abs(d), rate * 14),
        profile.minTrim, profile.maxTrim,
      );
    }
  }

  /**
   * The watch shortens sail before she is over-pressed, and makes it again when
   * the weather has gone through.
   *
   * This is the single thing that most often ends a voyage for a player who is
   * not watching the anemometer: the wind gets up two points while he is in the
   * chart room, and a mast goes over the side with all its gear. A real captain
   * did not have to watch for it because twenty-four men were watching for it,
   * and the boatswain would have the courses in before anyone came on deck to
   * ask. On the relaxed setting they do.
   *
   * They never carry *more* than the captain ordered — asking for half canvas
   * gets half canvas in any weather — so the decision to press her hard is
   * still entirely his.
   */
  private applyAutoCanvas(dt: number): void {
    const prudent = prudentCanvas(this.weatherNow.wind.speed);
    const now = this.ship.canvasSet;

    // Anything she is carrying that the weather allows is taken as the standing
    // order, whoever set it. Without this the watch will strike sail she is
    // safely carrying because some code path put canvas on her without going
    // through setCanvas — and a ship that silently furls everything and lies
    // there is the worst possible bug to hand a player who asked for less work.
    if (now > this.orderedCanvas && now <= prudent + 0.001) this.orderedCanvas = now;

    const want = Math.min(this.orderedCanvas, prudent);
    if (Math.abs(want - now) < 0.004) return;

    // Taking sail off is quick and getting it back on is not, which is both
    // true and the right way round for the player: the protective move happens
    // in time to matter, the recovery costs a little of the passage.
    const rate = want < now ? 0.28 : 0.075;
    const step = Math.sign(want - now) * Math.min(Math.abs(want - now), rate * dt);
    this.ship.setAllCanvas(clamp(now + step, 0, 1));

    // Say so once when they take a reef in, so the change is never silent.
    if (want < now - 0.02 && this.clock.t - this.lastCanvasWord > 4 * 3600) {
      this.lastCanvasWord = this.clock.t;
      this.pushAlert(
        prudent <= 0
          ? 'The watch have taken everything off her and she lies to it under bare poles.'
          : `The watch are shortening sail — ${(prudent * 100).toFixed(0)}% is all she will bear.`,
        prudent <= 0.2 ? 'warning' : 'note',
      );
    }
  }

  private updateNavigation(simDt: number): void {
    const pos = this.ship.state.pos;
    const eff = this.effectiveSkill;
    const navSkill = skill(eff, 'navegacao');
    this.nav.leewayAllowance = this.skills.navegacao >= 15 ? 0.85 : 0;

    const hours = simDt / 3600;
    this.distanceRun += Math.abs(this.physics.speedKnots) * hours;
    const overGround = this.physics.groundKnots * hours;
    this.groundRun += overGround;
    this.runSinceNoon += overGround;

    this.nav.integrate(
      simDt, pos, this.ship.state.heading, this.physics.speedKnots,
      this.physics.leeway, this.weatherNow.wind.from, this.weatherNow.wind.speed,
      navSkill, this.clock.t,
    );

    this.chart.logTrack(this.nav.estimated, this.clock.t);

    // Chart whatever the lookout can see, at intervals.
    if (this.clock.t - this.lastSurveyT > 900) {
      this.lastSurveyT = this.clock.t;
      const range = sightingRangeNm(this.ship.mastHeight, this.weatherNow.visibility);
      if (this.sounding.shoreDistNm < range) {
        const result = this.chart.survey(
          pos, this.nav.estimated, range, this.clock.t, skill(eff, 'cartografia'),
        );
        // Coast run in sight counts even when no ring vertex happened to fall
        // inside the horizon — which, with vertices forty-seven miles apart, is
        // most of the time.
        const worked = result.fresh.length + result.corrected;
        if (worked > 0 || result.milesTaken > 0) {
          // Coast drawn for the first time and coast put right both count. The
          // Casa da Guiné paid for corrections — a stretch of Africa that is on
          // the chart eighty miles from where it really is has cost ships, and
          // a pilot who fixes it has done the Crown a service.
          this.crown.chartedSincePatent += result.milesTaken;
          this.crown.progressObjective('chart', undefined, result.milesTaken);
          // Paid in miles of coast, not in ring vertices, for the same reason
          // the commission is.
          train(this.skills, 'cartografia', result.milesTaken * 0.006);
          train(this.skills, 'navegacao', result.milesTaken * 0.0018);
          this.chartedThisPassage += result.milesTaken;
          this.correctedNm += result.improvedNm ?? 0;
          this.announceSurvey(result);
        }
      }
    }
  }

  /**
   * Noon.
   *
   * The one fixed point in a ship's day: the sun is observed, the latitude
   * worked, the day's run entered in the log, and everybody finds out whether
   * the last twenty-four hours were any good. It is also the thing a passage
   * needs most — a rhythm. Without it a month at sea at a high clock rate is
   * one undifferentiated afternoon, which is exactly what "no progress" feels
   * like; with it there is a report every forty-eight seconds at the Watch rate
   * saying how many miles have gone under her.
   */
  private checkNoon(): void {
    const day = Math.floor(this.clock.t / 86400);
    // Local apparent noon, near enough: the hour hand at twelve.
    if (this.clock.hour < 12) return;
    if (day === this.lastNoonDay) return;
    this.lastNoonDay = day;

    const nm = this.runSinceNoon;
    const hours = this.noonAt > 0 ? (this.clock.t - this.noonAt) / 3600 : 24;
    this.runSinceNoon = 0;
    this.noonAt = this.clock.t;
    if (this.anchored || this.dockedAt) return;

    const lat = this.nav.estimated.lat;
    this.dayRuns.unshift({ date: this.clock.formatDate(), nm, lat, hours });
    if (this.dayRuns.length > 60) this.dayRuns.pop();

    // A short first watch since sailing is not a day's run and must not be
    // judged as one — a captain who weighed at eleven has not had a bad day.
    const partial = hours < 20;
    const period = partial
      ? `the ${hours.toFixed(0)} hours since she sailed`
      : 'the twenty-four hours';
    const rate = nm / Math.max(hours, 1) * 24;
    const verdict = partial ? ''
      : rate > 150 ? ' A very good day\u2019s run.'
        : rate > 110 ? ' A fair day\u2019s work.'
          : rate > 60 ? ' Ordinary enough.'
            : rate > 20 ? ' Poor. The hands have noticed.'
              : ' Next to nothing. She has been going nowhere all day.';

    const dest = this.courseToDestination();
    const remaining = dest
      ? ` ${dest.distNm.toFixed(0)} miles still to run for ${dest.name}.`
      : '';

    this.logEvent('navigation',
      `Noon. ${nm.toFixed(0)} miles made good in ${period}, `
      + `latitude ${formatLat(lat)} by the reckoning.${verdict}${remaining}`);
    this.pushAlert(`Noon — ${nm.toFixed(0)} miles run.${remaining}`, 'note');

    // And the other half of noon: the sun is on the meridian, which is the one
    // moment in the day the latitude can be had. The pilot asks for it, because
    // a player who is never told his reckoning has gone stale will never think
    // to open the quadrant, and the whole of this game is supposed to be about
    // not knowing where you are.
    this.offerSight();
  }

  /**
   * Whether anything can be brought down right now, and whether it is worth the
   * trouble.
   *
   * Offers whichever body is actually available rather than always the sun: in
   * the north the pilot's method is the pole star and his book is the rule of
   * the Guards, and the sun only becomes the method once he has solar tables and
   * has run the pole star under the horizon. Nagging every day would train the
   * player to ignore it, so he only speaks up once the reckoning has gone soft.
   */
  private offerSight(): void {
    if (this.nav.sigmaLat < 9) return;
    if (this.clock.t - this.lastSightWord < 20 * 3600) return;

    const opps = sightOpportunities(
      this.ship.state.pos, this.clock.day, this.clock.hour,
      this.clock.dayOfYear, this.clock.date.year,
      this.weatherNow.cloud, this.weatherNow.visibility,
    );
    // Only bodies this pilot can actually work into a latitude with the books
    // he has aboard. Being offered a sight that turns out to be useless is
    // worse than not being offered one.
    const usable = opps.filter((o) => o.available && this.canWork(o.body));
    const grave = this.nav.sigmaLat > 24;

    if (usable.length === 0) {
      if (!grave) return;
      const sun = opps.find((o) => o.body === 'sun');
      const why = opps.find((o) => o.available && !this.canWork(o.body))
        ? 'and no tables aboard to work it by'
        : (sun?.reason ?? 'nothing to be had').toLowerCase();
      this.lastSightWord = this.clock.t;
      this.pushAlert(`No latitude again today — ${why}.`, 'warning');
      return;
    }

    this.lastSightWord = this.clock.t;
    const best = usable[0];
    const days = (this.clock.t - this.nav.lastFixT) / 86400;
    this.pushAlert(
      `${best.label} may be had. `
      + `${days > 2 ? `Nothing observed for ${days.toFixed(0)} days. ` : ''}Press N.`,
      grave ? 'warning' : 'note',
    );
  }

  /** Whether the books aboard can turn an altitude of this body into a latitude. */
  private canWork(body: SightBody): boolean {
    const alm = this.nav.almanac;
    const southern = this.ship.state.pos.lat < 0;
    if (body === 'sun') return alm.solarError !== null && (!southern || alm.southern);
    if (body === 'polaris') return true;
    return alm.southern;
  }

  /**
   * Tell the player the chart is being worked on.
   *
   * Surveying happens silently every quarter of an hour and is the single
   * activity the whole game is named after, so it needs to say so — especially
   * the first time a stretch of inherited coast turns out to be a long way from
   * where Lisbon thinks it is, which is the moment the mapmaking becomes real.
   */
  /**
   * "Terra!"
   *
   * Said once, when the land lifts over the horizon after the ship has been out
   * of sight of it for days. What makes the moment is not the land — it is that
   * the reckoning is about to be judged. A pilot who has run three weeks on
   * dead reckoning finds out here whether he is where he thinks he is, and the
   * whole company knows it.
   */
  private cryLandRaised(bearing: number, daysAway: number): void {
    const range = sightingRangeNm(this.ship.mastHeight, this.weatherNow.visibility);
    const known = this.chart.knewCoastNear(this.ship.state.pos, range, this.clock.t - 3600);
    const word = formatBearing(bearing);

    this.pushAlert(
      known
        ? `Land, ${word}. ${daysAway.toFixed(0)} days without sight of it.`
        : `Land, ${word} — and it is on nobody's chart.`,
      'note');

    // What actually makes the moment: the reckoning is about to be judged, and
    // everybody aboard knows by how much it might be wrong.
    const doubt = Math.max(this.nav.sigmaLat, this.nav.sigmaLon);
    const verdict = doubt < 12
      ? 'The pilot has her within a dozen miles and is saying so to anyone who will listen.'
      : doubt < 45
        ? `The pilot allows ${doubt.toFixed(0)} miles of doubt. We are about to find out.`
        : `The pilot will not put a figure on it below ${doubt.toFixed(0)} miles, which is `
          + 'another way of saying he does not know.';

    this.logEvent('landfall',
      (known
        ? `Raised the land ${word} after ${daysAway.toFixed(0)} days out of sight of it. `
          + 'The hands are up the shrouds without being told. '
        : `Raised the land ${word} after ${daysAway.toFixed(0)} days of blue water. `
          + 'No chart aboard shows anything here. The escrivão has been sent for. ')
      + verdict,
      true);

    // A landfall is worth more to a crew than a week of fair wind.
    this.crew.morale = clamp(this.crew.morale + (known ? 0.06 : 0.11), 0, 1);
  }

  private announceSurvey(result: SurveyResult): void {
    if (this.clock.t - this.lastSurveyWord < 6 * 3600) return;
    this.lastSurveyWord = this.clock.t;
    const improved = result.improvedNm ?? 0;
    // Under a dozen miles is a headland coming abeam, not a survey.
    if (result.milesTaken < 12) return;
    if (result.corrected === 0) {
      this.pushAlert(
        `The escrivão is drawing coast nobody has drawn before — ${Math.round(result.milesTaken)} miles of it.`,
        'note');
      return;
    }
    if (improved > 40) {
      this.pushAlert(
        'This coast is not where the Lisbon chart puts it. The pilot is redrawing it.',
        'note');
      this.logEvent('navigation',
        'Ran the coast in sight all forenoon and it does not agree with the chart we were given: '
        + `${(improved / Math.max(result.corrected, 1)).toFixed(0)} miles out, and every league of `
        + 'it the same way. Somebody laid off a bad day\u2019s run down here a long time ago and '
        + 'every pilot since has copied him.');
    }
  }

  private updateCrewAndShip(simDt: number): void {
    this.accumDays += simDt / 86400;
    if (this.accumDays < 0.02) return;
    const days = this.accumDays;
    this.accumDays = 0;

    const eff = this.effectiveSkill;
    const surgeon = this.crew.officers.find((o) => o.role === 'cirurgiao' && o.alive);
    const exertion = clamp(
      this.ship.canvasSet * (this.weatherNow.wind.speed / 30) + this.weatherNow.waveHeight / 12,
      0, 1,
    );

    const w = this.wardroom;
    const events = updateCrew(this.crew, {
      days,
      ashore: this.anchored && this.dockedAt !== null,
      ration: this.ration,
      leadership: skill(eff, 'lideranca'),
      surgeonQuality: (surgeon ? surgeon.ability : 0) + w.physic,
      exertion,
      beyondTheKnown: this.beyondTheKnown,
      gold: this.crown.gold,
      rng: this.rng,
      wardroomMorale: w.morale,
      wardroomUnrest: w.unrest,
      wardroomFear: w.fear,
    });

    for (const e of events) {
      this.pushAlert(e.message, e.severity);
      this.logEvent('crew', e.message, e.severity === 'grave');
      if (e.kind === 'mutiny') this.handleMutiny();
    }

    // A ship is not lost when the last man dies; she is lost when there are not
    // enough left to work her, and she drifts until she goes ashore or is found
    // empty. Gama burned the São Rafael for exactly this reason.
    if (!this.anchored && ableHands(this.crew) < Math.max(4, this.ship.baseHull.crewMin * 0.28)) {
      this.endGame(
        this.crew.count === 0
          ? 'There is nobody left alive aboard. She will be found some months from now, or she '
            + 'will not be found.'
          : `There are ${ableHands(this.crew)} men able to stand a watch, and she wants at least `
            + `${Math.round(this.ship.baseHull.crewMin * 0.28)} to be worked at all. She lies to `
            + 'the sea with her yards braced any way the wind left them.',
      );
      return;
    }

    // Water temperature drives fouling: the worm is far worse in the tropics.
    const tempFactor = lerp(1.9, 0.5, clamp(Math.abs(this.ship.state.pos.lat) / 45, 0, 1));
    const wear = this.ship.age(days, tempFactor, this.pumpEffort * crewFactor(this.crew, this.ship.baseHull.crewMin));
    if (wear.swamped) {
      this.endGame('She filled faster than the pumps could clear her, and went down by the head.');
      return;
    }
    for (const s of wear.spoiled) {
      this.logEvent('note', `The ${s.toLowerCase()} in the hold is spoiled past saving and has been thrown over the side.`);
    }

    if (this.ship.condition.bilge > this.ship.holdCapacity * 0.28) {
      this.pushAlert('She is making more water than the pumps are clearing. Put more hands on them.', 'warning');
    }

    if (!this.anchored) {
      train(this.skills, 'marinharia', days * 0.35);
      train(this.skills, 'navegacao', days * 0.22);
      train(this.skills, 'lideranca', days * 0.12);
    }

    this.checkStormDamage(days);
  }

  private checkStormDamage(days: number): void {
    const wind = this.weatherNow.wind.speed;
    const prudent = prudentCanvas(wind);
    const carried = this.ship.canvasSet;
    const eff = this.effectiveSkill;
    const seamanship = skill(eff, 'marinharia');

    if (carried > prudent + 0.05 && wind > 14) {
      const over = carried - prudent;
      const risk = clamp(over * over * (wind / 40) * days * 3.2 * (1 - seamanship * 0.55), 0, 0.85);
      if (this.rng.chance(risk)) {
        const idx = this.rng.int(0, this.ship.state.sails.length - 1);
        const lost = this.ship.damageMast(idx, this.rng.range(0.25, 0.8));
        const mastName = this.ship.hull.masts[idx].name;
        if (lost) {
          this.pushAlert(`The ${mastName.toLowerCase()} has gone by the board.`, 'grave');
          this.logEvent('peril', `Carrying too much canvas in a ${wind.toFixed(0)}-knot breeze, the ${mastName.toLowerCase()} went over the side with all its gear. Two hours cutting it clear before it stove in the topsides.`, true);
        } else {
          this.pushAlert(`Canvas blown out on the ${mastName.toLowerCase()}.`, 'warning');
          this.logEvent('peril', `Split the sail on the ${mastName.toLowerCase()}. Handed what was left of it.`);
        }
        this.crew.morale = clamp(this.crew.morale - 0.06, 0, 1);
      }
    }

    if (this.weatherNow.waveHeight > 5.5) {
      const risk = clamp((this.weatherNow.waveHeight - 5.5) * days * 0.11, 0, 0.7);
      if (this.rng.chance(risk)) {
        const dmg = this.rng.range(0.02, 0.11);
        this.ship.damage(dmg);
        this.pushAlert('A sea came aboard and started the seams forward.', 'warning');
        this.logEvent('peril', `A heavy sea broke over the bow and worked the topsides. She is making water. Pumps manned in both watches.`);
      }
    }
  }

  private handleMutiny(): void {
    const eff = this.effectiveSkill;
    const authority = skill(eff, 'lideranca');
    if (this.rng.next() < authority * 0.8 + 0.15) {
      this.crew.unrest = 0.4;
      this.crew.morale = clamp(this.crew.morale + 0.14, 0, 1);
      this.logEvent('crew', 'You put the ringleaders in irons and had the rest back at their stations inside the hour. It is settled. It is not forgotten.', true);
      train(this.skills, 'lideranca', 2.5);
    } else {
      this.crew.unrest = 0;
      this.crew.morale = 0.42;
      this.ship.state.heading = wrap360(this.ship.state.heading + 180);
      this.logEvent('crew', 'They would not be talked round. The helm is up and she is heading north, and you are captain in name only until she smells Portugal.', true);
      this.pushAlert('The crew have taken the ship and put her head for home.', 'grave');
    }
  }

  private checkWorldEvents(): void {
    const pos = this.ship.state.pos;

    if (this.sounding.aground && !this.anchored) {
      this.runAground();
      return;
    }

    // The lookout, who is the warning that matters.
    //
    // The lead only speaks when there is already less than eight metres under
    // her, and at three hundred times real time she crosses that in a fraction
    // of a second — it was a warning that arrived after the crunch. A man at the
    // masthead sees the land twenty miles off, and what he is asked is not "is
    // it near" but "are we standing at it", which is the question that actually
    // saves ships.
    if (!this.anchored && !this.dockedAt && this.physics.speedKnots > 1) {
      const range = sightingRangeNm(this.ship.mastHeight, this.weatherNow.visibility);
      const bearing = this.sounding.shoreBearing;
      const off = Math.abs(angleDelta(this.ship.state.heading, bearing));
      const closing = off < 55;
      const hours = this.sounding.shoreDistNm / Math.max(Math.abs(this.physics.speedKnots), 0.5);

      // Raising the land. Not a warning — the other thing, the one everybody
      // aboard has been waiting weeks for.
      const inSight = this.sounding.shoreDistNm < range;
      if (inSight && !this.landInSight) {
        const away = (this.clock.t - this.lastLandSeenT) / 86400;
        if (away > 3) this.cryLandRaised(bearing, away);
      }
      if (inSight) this.lastLandSeenT = this.clock.t;
      this.landInSight = inSight;

      if (this.sounding.shoreDistNm < range && closing && hours < 6
          && this.clock.t - this.lastLandWord > 3 * 3600) {
        this.lastLandWord = this.clock.t;
        this.pushAlert(
          `Land ho — ${formatBearing(bearing)}, ${this.sounding.shoreDistNm.toFixed(0)} miles, `
          + `and she is standing at it. ${hours < 2 ? 'Under two hours.' : `About ${hours.toFixed(0)} hours.`}`,
          hours < 2 ? 'grave' : 'warning',
        );
      }

      if (this.sounding.shoaling) {
        this.pushAlert(
          `By the lead, ${this.sounding.depth.toFixed(0)} fathoms shoaling — land bears ${formatBearing(bearing)}`,
          'grave',
        );
      }
    }

    // Landmarks of the route.
    const landmarks = this.crown.checkLandmarks(pos, this.lastLat);
    this.lastLat = pos.lat;
    if (pos.lat < this.deepestSouth) this.deepestSouth = pos.lat;
    for (const l of landmarks) {
      this.crown.record('coast', l.name, this.nav.estimated, l.value, this.clock.t);
      this.logEvent('discovery', l.announce, true);
      this.pushAlert(`${l.name} — ${l.value} renown`, 'note');
      this.crown.progressObjective('reach', l.id);
      train(this.skills, 'cartografia', l.value * 0.06);
      this.crew.morale = clamp(this.crew.morale + 0.07, 0, 1);
    }

    // Ports coming into view.
    if (this.clock.t - this.lastPortCheck > 1800) {
      this.lastPortCheck = this.clock.t;
      const range = sightingRangeNm(this.ship.mastHeight, this.weatherNow.visibility);
      for (const near of portsNear(pos, range)) {
        const charted = this.chart.ports.get(near.def.id);
        if (charted) continue;
        const isNew = this.chart.chartPort(near.def, this.nav.estimated, pos, this.clock.t, false);
        if (isNew) {
          const value = near.def.discovery;
          if (value > 0) {
            this.crown.record('port', near.def.name, this.nav.estimated, value, this.clock.t);
            this.logEvent('discovery', `A settlement in sight: ${near.def.name}. ${near.def.blurb}`, true);
            this.pushAlert(`${near.def.name} sighted — ${value} renown`, 'note');
          }
        }
      }
    }
  }

  /**
   * Whatever the passage threw up in the last step.
   *
   * The cooling-off period is in simulated days rather than in events, so a
   * player running the clock at a watch a second is not buried in them, and a
   * player sailing in real time is not left with nothing for an hour.
   */
  private rollIncidents(simDt: number): void {
    const days = simDt / 86400;
    this.daysSincePort += days;
    this.daysSinceEvent += days;
    this.daysSinceDecision += days;
    this.eventCooldown = Math.max(0, this.eventCooldown - days);
    if (this.eventCooldown > 0) return;

    this.checkArrival();
    this.checkLeads();
    this.checkVentures(days);
    this.advanceRival(days);

    // The quarterdeck first: a man asking for a judgement outranks a shoal of
    // fish, and the two must never arrive in the same breath.
    const event = rollOfficerEvent(this, days) ?? rollSeaEvent(this, days);
    if (!event) return;

    this.eventCooldown = event.choices ? 1.6 : 0.55;
    this.daysSinceEvent = 0;
    this.recentEvents.unshift(event.id);
    if (this.recentEvents.length > 5) this.recentEvents.pop();

    if (event.choices && event.choices.length > 0) {
      this.daysSinceDecision = 0;
      this.pendingEvent = event;
      return;
    }
    this.pushAlert(event.text, event.severity);
    this.logEvent(event.severity === 'note' ? 'note' : 'peril', event.text, event.severity !== 'note');
  }

  /**
   * Up with the mark she was steering for. Judged on the true position rather
   * than the reckoned one — she has either arrived or she has not, whatever the
   * navigator believes — and the course is struck once she has.
   */
  private checkArrival(): void {
    const d = this.destination;
    if (!d) return;
    const trueDist = haversine(this.ship.state.pos, { lat: d.lat, lon: d.lon }) / NM;
    if (trueDist > 6) return;
    this.destination = null;
    this.holdCourse = false;
    this.pushAlert(`Up with ${d.name}.`, 'note');
    this.logEvent('note', `Made ${d.name} by the reckoning, and there it was.`, true);
  }

  /**
   * The business waiting in a port: charters on offer, and whatever the
   * waterfront is saying.
   */
  refreshPortBusiness(def: PortDef): void {
    const known = new Set(this.chart.ports.keys());
    this.ventureOffers = offerVentures(
      def, this.clock.t, this.rng, known, () => `v${this.nextVentureId++}`,
    );

    // A port gives up one rumour per visit at most, and only when there is
    // something there worth hearing. Sitting in the same harbour listening for a
    // week does not produce a second one.
    const rel = this.relationsFor(def.id);
    if (!this.rng.chance(rel.met ? 0.75 : 0.35)) return;
    const lead = hearRumour(
      def, known, this.rng, this.clock.t, () => `l${this.nextLeadId++}`,
    );
    if (!lead) return;
    if (this.leads.some((x) => x.targetPort && x.targetPort === lead.targetPort)) return;
    this.leads.push(lead);
    this.logEvent('note', lead.text, true);
    this.pushAlert('You have heard something worth writing down.', 'note');
  }

  /**
   * Something learnt from a stranger at sea.
   *
   * The rumour system's other door. A pilot met on the water knows the coast
   * ahead the way a pilot met in a harbour knows it, and speaking a strange
   * sail is the single most historically loaded thing a caravel could do — half
   * of what Portugal knew about the Indian Ocean before Gama came out of
   * conversations exactly like this one.
   */
  hearFromStranger(): boolean {
    const known = new Set(this.chart.ports.keys());
    // Told from wherever she is, by the nearest port's reckoning of the world.
    const near = portsNear(this.ship.state.pos, 900)[0];
    if (!near) return false;
    const lead = hearRumour(
      near.def, known, this.rng, this.clock.t, () => `l${this.nextLeadId++}`,
    );
    if (!lead) return false;
    if (this.leads.some((x) => x.targetPort && x.targetPort === lead.targetPort)) return false;
    lead.source = `the master of a strange sail off ${near.def.name}`;
    this.leads.push(lead);
    this.logEvent('note', lead.text, true);
    this.pushAlert('You have heard something worth writing down.', 'note');
    train(this.skills, 'diplomacia', 0.6);
    return true;
  }

  /**
   * Coming among a people who have never seen a ship like yours.
   *
   * This is the most dramatic thing that happens in the game and it used to
   * produce one line of flavour text and no alert at all. A player anchored
   * off a city nobody in Europe had heard of, was shown a port menu, went to
   * the market, and was told he had no leave to trade — with no indication that
   * the way to get it was a button in the footer.
   *
   * What the peoples file knows about them — their tongue, their faith, how
   * much of the world they have already seen, and what they will think of a
   * hold full of brass bracelets — is the whole payoff of having sailed here,
   * and none of it reached the player either.
   */
  /**
   * Whether this people is already known to the ship, by any of their towns.
   *
   * Relations are kept per port, so two Akan towns forty miles apart each
   * counted as a people nobody had ever seen — and arriving at the second one
   * announced first contact with the Akan for a second time, in the same
   * words, on the same day. What makes a people new is that nobody aboard has
   * stood among them anywhere.
   */
  peopleKnown(def: PortDef, ignorePort = def.id): boolean {
    if (def.people === 'portuguese') return true;
    for (const id of this.visitedPorts) {
      if (id === ignorePort) continue;
      if (portDef(id).people === def.people) return true;
    }
    return false;
  }

  private announceFirstContact(def: PortDef): void {
    if (def.people === 'portuguese') return;
    const pe = people(def.people);
    const met = this.peopleKnown(def);

    if (met) {
      // Their people are known, this town is not.
      this.pushAlert(`${def.name} — ${pe.name} again. They will have heard of you.`, 'note');
      return;
    }

    this.crown.record('people', `The ${pe.name}`, this.nav.estimated, 18, this.clock.t);
    this.logEvent('contact',
      `First contact with the ${pe.name}. ${pe.blurb} They speak ${pe.language}, `
      + `${FAITH_WORD[pe.faith]}, and `
      + (pe.sophistication > 0.7
        ? 'they have been trading with the whole of the known world for longer than Portugal has existed. '
          + 'Whatever is in the hold, it will not impress them.'
        : pe.sophistication > 0.35
          ? 'they know the sea and the peoples on either side of them, and they will drive a hard bargain.'
          : 'nothing like this ship has ever come here.')
      + (pe.rivalNetwork
        ? ' There are Arab merchants ashore and they understood what you are before you did.'
        : ''), true);
    this.pushAlert(
      `The ${pe.name}. No Portuguese has stood here before. Seek an audience before you open the hold.`,
      'note');
  }

  /** Take a merchant's charter, on your own account and at your own risk. */
  acceptVenture(id: string): string {
    const v = this.ventureOffers.find((x) => x.id === id);
    if (!v || v.taken) return 'That charter is no longer on offer.';
    const taken = this.ship.addCargo(v.goodId, v.quantity, 0);
    if (taken < v.quantity - 0.01) {
      // Put back whatever went in: a part cargo discharges no charter.
      if (taken > 0) this.ship.removeCargo(v.goodId, taken);
      return 'She has not the room for it.';
    }
    v.taken = true;
    v.loaded = true;
    this.crown.gold += v.advance;
    this.ventures.push(v);
    this.ventureOffers = this.ventureOffers.filter((x) => x.id !== id);
    this.logEvent('trade',
      `Signed for ${v.patron}: ${ventureLine(v)}, ${v.fee} cruzados on delivery and `
      + `${v.advance} in hand. ${Math.round(daysLeft(v, this.clock.t))} days allowed.`, true);
    return `Loaded. ${v.advance} cruzados in hand.`;
  }

  /** Anything consigned here is landed and paid for on arrival. */
  private deliverVentures(def: PortDef): void {
    for (const v of this.ventures) {
      if (v.delivered || v.failed || v.toPort !== def.id) continue;
      if (this.ship.quantityOf(v.goodId) < v.quantity - 0.01) {
        v.failed = true;
        this.crown.gold -= v.penalty;
        this.logEvent('trade',
          `${v.patron}\u2019s factor here asked for his ${good(v.goodId).name} and it was not `
          + 'aboard. The matter will be raised in Lisbon.', true);
        continue;
      }
      this.ship.removeCargo(v.goodId, v.quantity);
      v.delivered = true;
      v.loaded = false;
      this.crown.gold += v.fee;
      const renown = Math.max(1, Math.round(v.fee / 90));
      this.crown.standing += renown;
      this.crown.lifetimeStanding += renown;
      train(this.skills, 'comercio', 0.9);
      this.crew.morale = clamp(this.crew.morale + 0.04, 0, 1);
      this.pushAlert(`Charter discharged. ${v.fee} cruzados.`, 'note');
      this.logEvent('trade',
        `Landed ${ventureLine(v)} for ${v.patron}, within his time, and was paid ${v.fee} `
        + 'cruzados on the quay without argument.', true);
    }
  }

  /** Charters still running, for the orders panel. */
  get activeVentures(): Venture[] {
    return this.ventures.filter((v) => !v.delivered && !v.failed);
  }

  /** Rumours heard and not yet run down. */
  get openLeads(): Lead[] {
    return this.leads.filter((l) => !l.followed);
  }

  /**
   * Rumours run down.
   *
   * A lead is confirmed by finding the thing, not by arriving at the position
   * the rumour named — and arriving at that position and finding open water is
   * a real outcome, worth saying so, because it is what happened to everybody
   * who ever followed one.
   */
  private checkLeads(): void {
    const pos = this.ship.state.pos;
    for (const lead of this.leads) {
      const result = checkLead(lead, pos);
      if (!result) continue;
      lead.followed = true;
      if (result === 'found') {
        lead.false = false;
        this.crown.standing += lead.value;
        this.crown.lifetimeStanding += lead.value;
        this.pushAlert(`The rumour was true. ${lead.value} renown.`, 'note');
        this.logEvent('discovery',
          `Ran down the report we had from ${lead.source}, and it was where he said it was, `
          + 'or near enough that a seaman would call it the same place.', true);
        train(this.skills, 'cartografia', lead.value * 0.05);
        this.crew.morale = clamp(this.crew.morale + 0.06, 0, 1);
      } else {
        lead.false = true;
        this.crew.morale = clamp(this.crew.morale - 0.05, 0, 1);
        this.pushAlert('Nothing here. The report was wrong.', 'warning');
        this.logEvent('note',
          `Made the position we had from ${lead.source} and there is nothing in it but water. `
          + 'The hands have opinions about the man who told us.', true);
      }
    }
  }

  /** Charters delivered, and charters run out of time. */
  private checkVentures(days: number): void {
    void days;
    for (const v of this.ventures) {
      if (v.delivered || v.failed) continue;
      if (this.clock.t > v.dueBy) {
        v.failed = true;
        this.crown.standing = Math.max(0, this.crown.standing - v.penalty * 0.1);
        this.crown.gold -= v.penalty;
        this.pushAlert(`${v.patron}\u2019s charter is out of time.`, 'warning');
        this.logEvent('trade',
          `The charter for ${ventureLine(v)} is void. ${v.patron} has been repaid his advance `
          + `and ${v.penalty} cruzados besides, and will tell the Rua Nova about it.`, true);
      }
    }
  }

  /** The other captain works his way down the coast whether you sail or not. */
  private advanceRival(days: number): void {
    const news = advanceRival(
      this.rival, days, this.ship.state.pos.lat, this.crown.lifetimeStanding, this.rng,
    );
    if (!news) return;
    this.rival.lastNews = this.clock.t;
    this.pushAlert(`${this.rival.name} has been before you.`, 'warning');
    this.logEvent('note', news.text, true);
    this.crew.morale = clamp(this.crew.morale - 0.04, 0, 1);
  }

  // -------------------------------------------------------------------------
  // Raising a padrão
  // -------------------------------------------------------------------------

  /**
   * Put a name on the chart.
   *
   * The chart table has had a "Name this place" button since the beginning and
   * nothing has ever depended on pressing it, so nobody did. It is now what the
   * survey commission asks for — which is right, because naming what you have
   * run along is the other half of surveying it, and it is how half the coast
   * of Africa came by the names it still has.
   *
   * It needs a place. A pilot in the middle of the Atlantic naming the water he
   * is floating over is not doing cartography, so the land has to be in sight,
   * and a name has to be his own rather than one already on the sheet.
   */
  namePlace(name: string): { ok: boolean; message: string } {
    const given = name.trim();
    if (given.length < 3) {
      return { ok: false, message: 'A place wants a name, not a mark.' };
    }
    const range = sightingRangeNm(this.ship.mastHeight, this.weatherNow.visibility);
    if (this.sounding.shoreDistNm > range) {
      return {
        ok: false,
        message: 'There is nothing in sight to name. Stand in until the land is up.',
      };
    }
    const near = this.chart.places.find(
      (p) => haversine({ lat: p.lat, lon: p.lon }, this.nav.estimated) / NM < 12,
    );
    if (near) {
      return { ok: false, message: `You have already called this place ${near.name}.` };
    }

    const place = this.chart.addPlace(given, 'cape', this.nav.estimated, this.clock.t);
    const fresh = this.crown.record('coast', given, this.nav.estimated, 8, this.clock.t);
    this.crown.progressObjective('name', undefined, 1);
    this.logEvent('discovery',
      `Named this place ${given}, at ${formatLat(place.lat)}, ${formatLon(place.lon)} by the reckoning.`);
    train(this.skills, 'cartografia', 0.12);
    return {
      ok: true,
      message: fresh
        ? `${given}. It is on the chart under your hand and nobody else's.`
        : `${given}, again. The register already carries that name.`,
    };
  }

  /**
   * Whether a stone pillar can be put up where she now lies.
   *
   * The padrão was the physical act of claiming: a carved limestone pillar with
   * the arms of Portugal and the date, landed by boat and set on a headland
   * where the next ship down the coast would see it. Cão carried them on his
   * voyages and two of his are still standing. It costs a day, it needs the
   * boat and calm enough water to use it, and it is the only thing in the game
   * that leaves a mark on the world that outlasts the voyage.
   */
  padraoCheck(): { ok: boolean; reason: string; name: string } {
    // Named for the saint whose day it is, which is how half the coast of Africa
    // came by the names it still has.
    const name = `${this.ship.state.pos.lat >= 0 ? 'Cabo' : 'Ponta'} de ${saintOfDay(this.clock)}`;
    if (!this.ship.upgrades.includes('padroes') || this.crown.padraoStock <= 0) {
      return {
        ok: false,
        name,
        reason: this.ship.upgrades.includes('padroes')
          ? 'The last of the pillars is ashore already.'
          : 'There are no pillars aboard. They are cut and shipped at Lisbon.',
      };
    }
    if (this.sounding.shoreDistNm > 4) {
      return { ok: false, reason: 'Too far off the land to send a boat in.', name };
    }
    if (this.weatherNow.waveHeight > 2.2 || this.weatherNow.wind.speed > 22) {
      return { ok: false, reason: 'No boat could land on that beach today.', name };
    }
    if (this.crown.padraoNear(this.ship.state.pos)) {
      return { ok: false, reason: 'A pillar of yours already stands within sight of this one.', name };
    }
    if (!this.beyondTheKnown) {
      return { ok: false, reason: 'This coast is charted already. A pillar here claims nothing.', name };
    }
    if (ableHands(this.crew) < 10) {
      return { ok: false, reason: 'There are not enough men fit to pull a boat ashore.', name };
    }
    return { ok: true, reason: 'The boat can be hoisted out and the pillar landed.', name };
  }

  /** Put a pillar ashore. Costs a day and the boat's crew a hard morning. */
  raisePadrao(name?: string): string {
    const check = this.padraoCheck();
    if (!check.ok) return check.reason;
    const given = (name ?? check.name).trim() || check.name;

    this.clock.t += 9 * 3600;
    this.crown.padroesRaised += 1;
    this.crown.padraoStock -= 1;
    this.crown.progressObjective('padrao', undefined, 1);
    this.crown.record('padrao', given, this.nav.estimated, 22, this.clock.t);
    this.crown.padraoSites.push({
      name: given, lat: this.nav.estimated.lat, lon: this.nav.estimated.lon, t: this.clock.t,
    });
    this.crew.morale = clamp(this.crew.morale + 0.07, 0, 1);
    this.crew.fatigue = clamp(this.crew.fatigue + 0.06, 0, 1);
    train(this.skills, 'cartografia', 1.2);
    for (const o of this.crew.officers) {
      if (o.alive && !o.ashoreAt) o.loyalty = clamp(o.loyalty + 0.03, 0, 1);
    }
    this.logEvent('discovery',
      `Hoisted out the boat and landed the pillar on the headland, which is entered as ${given}. `
      + 'The arms of Portugal and the date cut into the stone, the cross set on top of it, and '
      + 'the whole ship\u2019s company that could be spared standing round it bareheaded while '
      + 'the office was read. It will be there when everyone who saw it is dead.', true);
    this.pushAlert(`${given} claimed for the Crown.`, 'note');
    return `The pillar is standing. This place is ${given} from today.`;
  }

  /** Take one of the courses offered by the outstanding decision. */
  resolveEvent(index: number): void {
    const event = this.pendingEvent;
    if (!event || !event.choices) return;
    const choice = event.choices[index];
    this.pendingEvent = null;
    if (!choice) return;
    const outcome = choice.resolve(this);
    this.logEvent('peril', outcome, true);
    this.pushAlert(outcome, event.severity);
    this.refreshEnvironment();
  }

  private runAground(): void {
    const speed = Math.abs(this.physics.speedKnots);
    const severity = clamp(speed / 7, 0.06, 1);
    this.ship.damage(severity * 0.55);
    this.ship.state.surge = 0;
    this.ship.state.sway = 0;
    this.anchored = true;

    if (this.ship.condition.hull <= 0.02) {
      this.endGame('She struck hard, bilged on the reef, and broke up where she lay.');
      return;
    }

    this.crew.morale = clamp(this.crew.morale - 0.2, 0, 1);
    this.pushAlert('Aground!', 'grave');
    this.logEvent('peril',
      speed > 4
        ? 'She took the ground at speed. Everything not lashed went forward, and there is water over the ceiling in the after hold. We are on, and hard on.'
        : 'She touched and stuck. No great violence to it, but she is aground and the tide is what it is.',
      true,
    );
  }

  /** Attempt to warp off a grounding. */
  tryRefloat(): string {
    const pos = this.ship.state.pos;
    const depth = depthAt(pos) + tideHeight(pos, this.clock.t);
    const eff = this.effectiveSkill;
    const chance = clamp(
      0.18 + skill(eff, 'marinharia') * 0.45 + (depth - this.ship.baseHull.draft) * 0.4,
      0.05, 0.95,
    );
    this.clock.t += 3 * 3600;
    if (this.rng.chance(chance)) {
      this.anchored = false;
      this.sounding.aground = false;
      // Kedge her off toward deeper water.
      const away = wrap360(this.sounding.shoreBearing + 180);
      this.ship.state.heading = away;
      this.logEvent('note', 'Laid out the kedge, started the water casks, and hove her off on the flood.');
      train(this.skills, 'marinharia', 1.8);
      return 'She floats. Get her into deep water before the tide turns.';
    }
    this.crew.fatigue = clamp(this.crew.fatigue + 0.2, 0, 1);
    return 'She will not budge. Wait for more water, or lighten her.';
  }

  // -------------------------------------------------------------------------
  // Player actions
  // -------------------------------------------------------------------------

  /** Put the wheel over yourself. Only meaningful at the slower clock rates. */
  setHelm(v: number): void {
    this.ship.state.rudder = clamp(v, -1, 1);
    this.helmOrder = null;
  }

  /**
   * Con her by course: "so many degrees to starboard", which the watch then
   * hold. Works at any clock rate and does not stop the clock, because giving
   * an order is not the same as standing at the wheel.
   */
  alterCourse(deg: number): void {
    const from = this.helmOrder ?? this.courseToSteer() ?? this.ship.state.heading;
    this.helmOrder = wrap360(from + deg);
    this.holdCourse = true;
  }

  /** Steady on the course she is heading now. */
  steadyAsSheGoes(): void {
    this.helmOrder = wrap360(this.ship.state.heading);
    this.holdCourse = true;
    this.ship.state.rudder = 0;
  }

  /** Give up your own course and steer for the mark again. */
  resumeCourseForMark(): boolean {
    if (!this.destination) return false;
    this.helmOrder = null;
    this.holdCourse = true;
    return true;
  }

  /**
   * Order a quantity of canvas. Making and shortening sail is an order given
   * from the quarterdeck, not something the captain does with his own hands, so
   * it does not stop the clock.
   */
  setCanvas(fraction: number): void {
    this.orderedCanvas = fraction;
    this.ship.setAllCanvas(fraction);
  }

  /**
   * Hand sail for the weather, without changing what she is ordered to carry.
   *
   * There is a difference between "take that in, it is coming on to blow" and
   * "she carries a third of her canvas from here to India", and the squall was
   * making the second one every time it made the first. It called setCanvas(),
   * which writes the standing order, so a black squall that "passed in twenty
   * minutes" left the ship under thirty-five per cent canvas for the rest of
   * the voyage — and the watch could never shake it out, because
   * applyAutoCanvas only ever *raises* the standing order to meet what she is
   * already carrying, which is impossible once the order is the thing holding
   * her down.
   *
   * Measured on a Lisbon–Mina passage: a hundred and thirty miles a day until
   * the first squall on day nine, and under a hundred for ever afterwards, in
   * a steady thirteen-knot breeze with nothing whatever wrong with the ship.
   * Squalls come round every five days, so almost every long passage in the
   * game was being sailed at half speed by a ship nobody had told to slow down.
   */
  handSail(fraction: number): void {
    this.ship.setAllCanvas(Math.min(this.ship.canvasSet, fraction));
  }

  adjustTrim(delta: number): void {
    this.autoTrim = false;
    this.lastManualTrim = this.clock.t;
    for (let i = 0; i < this.ship.state.sails.length; i++) {
      const p = RIG_PROFILES[this.ship.hull.masts[i].rig];
      const s = this.ship.state.sails[i];
      s.trim = clamp(s.trim + delta, p.minTrim, p.maxTrim);
    }
    if (this.clock.scaleIndex > 2) this.clock.scaleIndex = 2;
  }

  weighAnchor(): string {
    if (this.sounding.aground) return 'She is aground, not anchored.';
    this.anchored = false;
    this.dockedAt = null;
    // Start the day's run from the moment she drops down the river, so the
    // first noon at sea has something to report.
    const day = Math.floor(this.clock.t / 86400);
    this.lastNoonDay = this.clock.hour < 12 ? day - 1 : day;
    // Weighing from a known anchorage is itself a fix, and the land she is
    // dropping astern counts as land seen — otherwise the first headland after
    // a two-day coastal hop is announced as a landfall.
    this.lastLandSeenT = this.clock.t;
    this.landInSight = true;
    this.nav.lastFixT = this.clock.t;
    this.nav.milesSinceFix = 0;
    this.runSinceNoon = 0;
    this.noonAt = this.clock.t;
    // Making sail on weighing is an order, so the watch know what to make it
    // back to after they have handed it in a squall.
    this.setCanvas(Math.min(0.75, prudentCanvas(this.weatherNow.wind.speed)));
    this.logEvent('departure', `Weighed and made sail. Wind ${formatBearing(this.weatherNow.wind.from)}, ${this.weatherNow.wind.speed.toFixed(0)} knots.`);
    return 'Anchor aweigh.';
  }

  letGoAnchor(): string {
    if (this.sounding.depth > 55) return 'No bottom here. You cannot anchor in this depth.';
    if (Math.abs(this.physics.speedKnots) > 3) return 'Too much way on. Take in sail first.';
    this.anchored = true;
    this.setCanvas(0);
    const near = this.approachablePorts();
    if (near.length > 0) {
      this.enterPort(near[0].def);
    } else {
      this.logEvent('note', `Came to an anchor in ${this.sounding.depth.toFixed(0)} fathoms.`);
    }
    return 'Anchor let go.';
  }

  enterPort(def: PortDef): void {
    this.dockedAt = def.id;
    this.anchored = true;
    this.daysSincePort = 0;
    this.lastLandSeenT = this.clock.t;
    this.landInSight = true;
    this.recentEvents = [];
    this.markets.refresh(def.id, this.clock.t);
    this.refreshPortBusiness(def);
    this.deliverVentures(def);

    const first = !this.visitedPorts.has(def.id);
    this.visitedPorts.add(def.id);
    this.chart.chartPort(def, this.nav.estimated, this.ship.state.pos, this.clock.t, true);

    // Making a landfall on a place you already know fixes your position entirely.
    const rel = this.relationsFor(def.id);
    if (rel.met || def.known) {
      this.nav.applyLandfall(anchorageOf(def), this.clock.t);
    }

    this.crown.progressObjective('reach', def.id);

    if (first) {
      const value = def.discovery;
      if (value > 0) {
        this.crown.record('port', def.name, this.nav.estimated, value, this.clock.t);
      }
      this.logEvent('landfall', `Came to an anchor off ${def.name}. ${def.blurb}`, true);
      this.announceFirstContact(def);
    } else {
      this.logEvent('landfall', `Anchored again off ${def.name}.`);
    }
    this.portGossip = rivalGossip(
      this.rival, def, this.crown.lifetimeStanding,
      (this.clock.t - this.rival.lastNews) / 86400, this.rng,
    );
    if (this.portGossip) this.logEvent('note', this.portGossip);
    this.crew.morale = clamp(this.crew.morale + 0.1, 0, 1);
    this.mode = 'port';
  }

  /** Take on water, provisions and fresh food. Returns the cost. */
  provision(days: number, cost: number): void {
    const p = this.crew.provisions;
    p.water = Math.max(p.water, days) + this.ship.effects.water;
    p.biscuit = Math.max(p.biscuit, days);
    p.saltMeat = Math.max(p.saltMeat, days * 0.9);
    p.wine = Math.max(p.wine, days * 0.7);
    const def = this.portHere;
    p.fresh = Math.max(p.fresh, 18 * (def ? clamp(def.refit * 1.4, 0.15, 1.4) : 0.5));
    this.crew.daysWithoutFresh = 0;
    this.crown.gold -= cost;
    this.logEvent('note', `Watered and victualled for ${days} days at a cost of ${cost} cruzados.`);
  }

  /** Advance time in port. */
  waitDays(days: number): void {
    const step = 0.25;
    for (let d = 0; d < days; d += step) {
      this.clock.t += step * 86400;
      this.accumDays += step;
      this.refreshEnvironment();
      this.updateCrewAndShip(step * 86400);
      if (this.mode === 'gameover') return;
    }
    // A week at anchor is a week of ships arriving and merchants changing their
    // minds. The business waiting on the quay is not the same business.
    const here = this.portHere;
    if (here && days >= 3) {
      this.markets.refresh(here.id, this.clock.t);
      this.refreshPortBusiness(here);
    }
  }

  pushAlert(text: string, severity: Alert['severity']): void {
    const last = this.alerts[this.alerts.length - 1];
    if (last && last.text === text && this.clock.t - last.t < 7200) return;
    this.alerts.push({ id: this.nextAlertId++, text, severity, t: this.clock.t });
    if (this.alerts.length > 6) this.alerts.shift();
    // Something wants the captain *now*. Bring the clock down so he is on deck
    // to see it: the fast rate is for the empty ocean, and the moment it stops
    // being empty he should be at a pace he can act at.
    //
    // Only the grave ones. Warnings are common on a passage — the watch taking
    // a reef in, the pilot wanting an observation, a charter running short —
    // and knocking the player out of fast time for each of them would make the
    // fast rates unusable. A grave alert is land under two hours away, the lead
    // shoaling, or the company dying, and those are worth stopping for.
    if (severity === 'grave' && this.clock.scaleIndex > 4) this.clock.scaleIndex = 4;
  }

  private expireAlerts(): void {
    this.alerts = this.alerts.filter((a) => this.clock.t - a.t < 5400);
  }

  logEvent(kind: LogKind, text: string, important = false): void {
    this.log.add({
      t: this.clock.t,
      date: this.clock.formatDate(),
      time: this.clock.formatTime(),
      kind, text, important,
      lat: this.nav.estimated.lat,
      lon: this.nav.estimated.lon,
    });
  }

  endGame(reason: string): void {
    this.gameOverReason = reason;
    this.mode = 'gameover';
    this.logEvent('peril', reason, true);
  }

  // -------------------------------------------------------------------------
  // Readouts for the interface
  // -------------------------------------------------------------------------

  helmReport() {
    const p = this.physics;
    const variation = magneticVariation(this.ship.state.pos.lat, this.ship.state.pos.lon);
    return {
      // The shown heading, so the compass card and the ship in the view agree
      // and neither of them jumps when one frame covers a quarter of an hour.
      heading: this.displayHeading,
      // The compass card shows magnetic, which is what the helmsman steers by.
      compass: wrap360(this.displayHeading - variation),
      speed: p.speedKnots,
      groundSpeed: p.groundKnots,
      cog: p.courseOverGround,
      beta: p.beta,
      apparent: p.apparentKnots,
      pointOfSail: pointOfSail(p.beta),
      tack: tackName(p.beta),
      leeway: p.leeway,
      inIrons: p.inIrons,
      sternway: p.makingSternway,
      heel: this.displayHeel,
      rigStress: p.rigStress,
      canvas: this.ship.canvasSet,
      prudent: prudentCanvas(this.weatherNow.wind.speed),
      ableHands: ableHands(this.crew),
      rudder: this.ship.state.rudder,
      trim: this.trimQuality(),
    };
  }

  /**
   * How well the sails are set for the wind she has, and which way to shift the
   * sheets. Without this the player is trimming blind: the difference between a
   * good trim and a poor one is a knot and a half, and nothing on deck shows it.
   */
  /**
   * How the sails are set against how they ought to be, mast by mast.
   *
   * Reported as angles rather than as a single score, because "your trim is 84%
   * right" tells a player nothing he can act on. The yards are at forty degrees
   * and want to be at sixty is something he can do something about, and it is
   * what the bar on the head-up display draws.
   */
  trimQuality(): TrimReport {
    const beta = this.physics?.beta ?? 0;
    let bestDrive = 0;
    let actualDrive = 0;
    let wantDelta = 0;
    let shifting = false;
    const masts: MastTrim[] = [];

    for (let i = 0; i < this.ship.state.sails.length; i++) {
      const sail = this.ship.state.sails[i];
      const spec = this.ship.hull.masts[i];
      const profile = RIG_PROFILES[spec.rig];
      if (sail.shifting > 0) shifting = true;
      if (sail.set <= 0.02 || sail.condition <= 0.05) continue;

      // The *true* best, not the nearest acceptable one: a marker that moves
      // toward wherever the player has already put the yard is a marker chasing
      // its own tail, and he can never tell whether he has arrived.
      const band = trimBand(beta, profile);
      const want = band.best;
      const area = spec.area * sail.set;
      const best = Math.max(sailForce(10, beta, want, area, profile).drive, 0);
      const actual = Math.max(sailForce(10, beta, sail.trim, area, profile).drive, 0);
      bestDrive += best;
      actualDrive += actual;
      wantDelta += (want - sail.trim) * area;

      masts.push({
        name: spec.name,
        trim: sail.trim,
        want,
        min: profile.minTrim,
        max: profile.maxTrim,
        bandLo: band.lo,
        bandHi: band.hi,
        // A mast that cannot draw at all on this heading is shown as such rather
        // than as a mast trimmed badly; there is nothing to be done about it
        // with the sheets, only with the helm.
        quality: best > 1e-6 ? clamp(actual / best, 0, 1) : 0,
        drawing: best > 1e-6,
      });
    }

    if (bestDrive <= 1e-6) {
      return {
        quality: 0, masts, shifting,
        advice: this.ship.canvasSet < 0.02
          ? 'No canvas set'
          : 'She will not draw on this heading',
      };
    }
    const quality = clamp(actualDrive / bestDrive, 0, 1);
    const advice = shifting
      ? 'Sails coming across'
      : quality > 0.975
        ? 'Drawing well'
        : wantDelta > 0
          ? 'Ease the sheets  (E)'
          : 'Harden in  (Q)';
    return { quality, advice, shifting, masts };
  }


  /** Bearing and distance to a charted port, as the pilot would work it out. */
  /**
   * Lay off a course for the first place a new commission sends her.
   *
   * Accepting orders and then having to go and find the place on the chart
   * yourself before you can steer for it is a step nobody enjoys twice. If the
   * King has named a port, the course to it is on the board before you leave
   * the room.
   */
  layCourseForCommission(): void {
    const patent = this.crown.patent;
    if (!patent) return;
    for (const o of patent.objectives) {
      if (o.complete || o.kind === 'return' || !o.target) continue;
      const def = PORTS.find((x) => x.id === o.target);
      if (!def) continue;
      const charted = this.chart.ports.get(def.id);
      const at = charted ?? { lat: def.lat, lon: def.lon };
      this.setDestination(def.name, at.lat, at.lon);
      return;
    }
  }

  /**
   * Lay off a course for a port by id, using the charted position if the player
   * has one — steering for where you believe a place to be is the whole game,
   * and the belief is what is written on your own chart.
   */
  setDestinationPort(portId: string): void {
    const def = PORTS.find((x) => x.id === portId);
    if (!def) return;
    const charted = this.chart.ports.get(def.id);
    const at = charted ?? { lat: def.lat, lon: def.lon };
    this.setDestination(def.name, at.lat, at.lon);
  }

  /** The furthest south she has ever been, by the reckoning. */
  get furthestSouth(): number {
    return this.deepestSouth;
  }

  /** Lay off a course for somewhere, or clear the one that is set. */
  setDestination(name: string, lat: number, lon: number): void {
    this.destination = { name, lat, lon };
    this.holdCourse = true;
    this.helmOrder = null;
    this.markLaidAt = { ...this.nav.estimated };
    this.markDistNm = haversine(this.nav.estimated, { lat, lon }) / NM;
    this.logEvent('note', `Laid off a course for ${name}.`);
    this.pushAlert(`Course laid off for ${name}.`, 'note');
  }

  clearDestination(): void {
    this.destination = null;
    this.holdCourse = false;
    this.markLaidAt = null;
  }

  /**
   * Bearing, distance and time to the place she is steering for, all reckoned
   * from where the navigator believes she is rather than from where she is.
   */
  courseToDestination(): {
    name: string; bearing: number; distNm: number; hours: number; off: number;
  } | null {
    const d = this.destination;
    if (!d) return null;
    const from = this.nav.estimated;
    const dLat = d.lat - from.lat;
    const dLon = angleDelta(from.lon, d.lon) * cosd(from.lat);
    const bearing = wrap360((Math.atan2(dLon, dLat) * 180) / Math.PI);
    const distNm = haversine(from, { lat: d.lat, lon: d.lon }) / NM;
    // Speed made good toward the mark, which is what actually decides when she
    // arrives: five knots at ninety degrees to the course is five knots wasted.
    const toward = Math.cos((bearing - this.physics.courseOverGround) * Math.PI / 180);
    const closing = this.physics.groundKnots * toward;
    return {
      name: d.name,
      bearing,
      distNm,
      hours: closing > 0.15 ? distNm / closing : Infinity,
      off: angleDelta(this.displayHeading, bearing),
    };
  }

  /**
   * How close to the wind she will lie, in degrees, including the leeway the
   * hull makes. Anything inside this of the true wind is water she cannot get
   * to without tacking, and the player has to be able to see where that is.
   */
  get noGoAngle(): number {
    let best = 90;
    for (const m of this.ship.hull.masts) {
      const sail = this.ship.state.sails[this.ship.hull.masts.indexOf(m)];
      if (sail && sail.condition <= 0.05) continue;
      best = Math.min(best, closestPointing(RIG_PROFILES[m.rig]));
    }
    // She also crabs sideways, so her course made good is worse than she points.
    return clamp(best + 7, 20, 88);
  }

  /**
   * What a captain walks the deck asking himself before he gives the word.
   *
   * Voyages in this game are lost in port, quietly, a fortnight before anybody
   * notices: she sails with forty days of water on a fifty-day passage, or with
   * six hands down and the fore course split, and the first the player hears of
   * it is the alert that says the last cask is dry. Every one of these numbers
   * was already in the simulation and every one of them was on a different
   * screen. None of it is new information. It is the same information, on the
   * quay, at the one moment when it can still be acted on.
   *
   * The endurance is measured against the passage she is actually laid off for,
   * at four and a half knots made good, which is a caravel's honest average
   * over a long run — she does better on a reach and much worse working to
   * windward, so the estimate carries a half again as a margin the way a
   * careful master victualled.
   */
  readiness(): { label: string; value: string; state: 'good' | 'warn' | 'bad'; note?: string }[] {
    const out: { label: string; value: string; state: 'good' | 'warn' | 'bad'; note?: string }[] = [];
    const crew = this.crew;
    const cond = this.ship.condition;

    // How long the passage is, if one has been laid off.
    const course = this.destination
      ? haversine(this.nav.estimated, { lat: this.destination.lat, lon: this.destination.lon }) / NM
      : null;
    const passageDays = course === null ? null : (course / (4.5 * 24)) * 1.5;

    const endurance = enduranceDays(crew);
    const days = (n: number) => `${n.toFixed(0)} ${n < 1.5 ? 'day' : 'days'}`;
    if (passageDays === null) {
      out.push({
        label: 'Water and stores',
        value: days(endurance),
        state: endurance > 45 ? 'good' : endurance > 20 ? 'warn' : 'bad',
        note: 'No course laid off. Lay one on the chart and this is measured against it.',
      });
    } else {
      const slack = endurance - passageDays;
      out.push({
        label: 'Water and stores',
        value: days(endurance),
        state: slack > 14 ? 'good' : slack > 0 ? 'warn' : 'bad',
        note: slack > 0
          ? `${passageDays.toFixed(0)} days to ${this.destination!.name} with the wind fair. ${slack.toFixed(0)} days in hand.`
          : `${passageDays.toFixed(0)} days to ${this.destination!.name}, and you have ${endurance.toFixed(0)}.`,
      });
    }

    const fresh = crew.provisions.fresh;
    out.push({
      label: 'Fresh food',
      value: days(fresh),
      state: fresh > 12 ? 'good' : fresh > 4 ? 'warn' : 'bad',
      note: fresh > 4 ? undefined : 'Nothing green aboard. The scurvy begins about five weeks after the last of it.',
    });

    const able = ableHands(crew);
    const short = crew.complement - crew.count;
    out.push({
      label: 'Hands',
      value: `${able} fit of ${crew.complement}`,
      state: able >= crew.complement * 0.85 ? 'good' : able >= crew.complement * 0.6 ? 'warn' : 'bad',
      note: short > 0 ? `${short} short of her complement. Ship men in the crimp house.` : undefined,
    });

    out.push({
      label: 'Hull',
      value: `${(cond.hull * 100).toFixed(0)} in a hundred`,
      state: cond.hull > 0.82 ? 'good' : cond.hull > 0.6 ? 'warn' : 'bad',
      note: cond.leak > 0.55 ? 'She makes water faster than one watch can pump.' : undefined,
    });

    if (cond.fouling > 0.3) {
      out.push({
        label: 'Her bottom',
        value: cond.fouling > 0.6 ? 'Foul' : 'Growing weed',
        state: cond.fouling > 0.6 ? 'bad' : 'warn',
        note: `Costing perhaps ${(cond.fouling * 22).toFixed(0)} in a hundred of her speed. Careen her at a yard.`,
      });
    }

    const worst = this.ship.state.sails.reduce((a, s) => Math.min(a, s.condition), 1);
    if (worst < 0.75) {
      out.push({
        label: 'Canvas',
        value: worst < 0.4 ? 'Split' : 'Worn',
        state: worst < 0.4 ? 'bad' : 'warn',
        note: 'New canvas is bent at a yard, not at sea.',
      });
    }

    // A commission that wants pillars, and no pillars aboard. They are cut at
    // Lisbon and nowhere else, so finding this out at the Congo is finding it
    // out three months too late.
    const wantsPadrao = this.crown.patent?.objectives.find(
      (o) => o.kind === 'padrao' && !o.complete);
    if (wantsPadrao) {
      const have = this.crown.padraoStock;
      const left = (wantsPadrao.amount ?? 1) - Math.floor(wantsPadrao.progress);
      out.push({
        label: 'Stone pillars',
        value: have > 0 ? `${have} aboard` : 'None aboard',
        state: have >= left ? 'good' : 'bad',
        note: have >= left
          ? undefined
          : 'The King wants pillars set up and there are none in the hold. They are '
            + 'cut and shipped at Lisbon, at the shipwrights, and nowhere else on the coast.',
      });
    }

    // A cargo commission with no room for the cargo is the quiet mistake.
    const wants = this.crown.patent?.objectives.find((o) => o.kind === 'cargo' && !o.complete);
    if (wants) {
      out.push({
        label: 'Room in the hold',
        value: `${this.ship.holdFree.toFixed(0)} of ${this.ship.holdCapacity.toFixed(0)} tons`,
        state: this.ship.holdFree > this.ship.holdCapacity * 0.3 ? 'good' : 'warn',
        note: `The King wants ${wants.description.toLowerCase().replace(/^bring home /, '')} brought home in her.`,
      });
    }

    return out;
  }

  courseTo(portId: string): { bearing: number; distNm: number } | null {
    const charted = this.chart.ports.get(portId);
    if (!charted) return null;
    const from = this.nav.estimated;
    const to = { lat: charted.lat, lon: charted.lon };
    const dLat = to.lat - from.lat;
    const dLon = angleDelta(from.lon, to.lon) * cosd(from.lat);
    return {
      bearing: wrap360((Math.atan2(dLon, dLat) * 180) / Math.PI),
      distNm: haversine(from, to) / NM,
    };
  }

  positionText(): { lat: string; lon: string; certainty: string; doubt: number } {
    const e = this.nav.estimated;
    const sLat = this.nav.sigmaLat;
    const sLon = this.nav.sigmaLon;
    const days = (this.clock.t - this.nav.lastFixT) / 86400;

    // Said the way the pilot would say it, and escalating, because a number that
    // creeps from 2 to 34 over a fortnight is not something anyone notices — and
    // noticing is the entire point. This is the line that has to make the player
    // reach for the quadrant.
    let certainty: string;
    if (sLat < 4) {
      certainty = `± ${sLat.toFixed(0)}′ lat, ± ${sLon.toFixed(0)}′ lon — the reckoning is fresh`;
    } else if (sLat < 12) {
      certainty = `± ${sLat.toFixed(0)}′ lat, ± ${sLon.toFixed(0)}′ lon`;
    } else if (sLat < 26) {
      certainty = `± ${sLat.toFixed(0)}′ lat — the pilot wants an observation`;
    } else if (sLat < 55) {
      certainty = `± ${sLat.toFixed(0)}′ lat; longitude is a guess. `
        + `${days < 1 || days > 3000 ? 'No sight taken' : `Nothing observed for ${days.toFixed(0)} days`}.`;
    } else {
      certainty = 'Nobody aboard can say where she is within a day\u2019s sail.';
    }
    return { lat: formatLat(e.lat), lon: formatLon(e.lon), certainty, doubt: sLat };
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  serialize(): string {
    return JSON.stringify({
      version: 1,
      seed: this.seed,
      t: this.clock.t,
      scaleIndex: this.clock.scaleIndex,
      ship: this.ship.serialize(),
      crew: this.crew,
      skills: this.skills,
      nav: {
        estimated: this.nav.estimated,
        sigmaLat: this.nav.sigmaLat,
        sigmaLon: this.nav.sigmaLon,
        traverse: this.nav.traverse,
        fixes: this.nav.fixes,
        kit: this.nav.kit,
      },
      chart: this.chart.serialize(),
      crown: {
        standing: this.crown.standing,
        lifetimeStanding: this.crown.lifetimeStanding,
        gold: this.crown.gold,
        discoveries: this.crown.discoveries,
        landmarks: [...this.crown.landmarksFound],
        patent: this.crown.patent,
        completedPatents: this.crown.completedPatents,
        hasKingsLetter: this.crown.hasKingsLetter,
        padroesRaised: this.crown.padroesRaised,
        padraoStock: this.crown.padraoStock,
        routeOpened: this.crown.routeOpened,
        padraoSites: this.crown.padraoSites,
        chartedSincePatent: this.crown.chartedSincePatent,
      },
      markets: this.markets.serialize(),
      relations: [...this.relations.entries()],
      visited: [...this.visitedPorts],
      log: this.log.serialize(),
      dockedAt: this.dockedAt,
      anchored: this.anchored,
      ration: this.ration,
      pumpEffort: this.pumpEffort,
      autoTrim: this.autoTrim,
      difficulty: this.difficulty,
      orderedCanvas: this.orderedCanvas,
      holdCourse: this.holdCourse,
      helmOrder: this.helmOrder,
      destination: this.destination,
      daysSincePort: this.daysSincePort,
      distanceRun: this.distanceRun,
      correctedNm: this.correctedNm,
      groundRun: this.groundRun,
      dayRuns: this.dayRuns,
      markLaidAt: this.markLaidAt,
      markDistNm: this.markDistNm,
      deepestSouth: this.deepestSouth,
      startT: this.startT,
      leads: this.leads,
      ventures: this.ventures,
      ventureOffers: this.ventureOffers,
      rival: this.rival,
      nextVentureId: this.nextVentureId,
      nextLeadId: this.nextLeadId,
    });
  }

  static deserialize(json: string): Game {
    const d = JSON.parse(json);
    const g = new Game(d.seed);
    g.clock.t = d.t;
    g.clock.scaleIndex = d.scaleIndex ?? 1;
    g.ship = Ship.deserialize(d.ship);
    g.crew = d.crew;
    g.skills = d.skills;
    g.nav.estimated = d.nav.estimated;
    g.nav.sigmaLat = d.nav.sigmaLat;
    g.nav.sigmaLon = d.nav.sigmaLon;
    g.nav.traverse = d.nav.traverse ?? [];
    g.nav.fixes = d.nav.fixes ?? [];
    g.nav.kit = d.nav.kit;
    g.chart = Chart.deserialize(d.chart);
    g.crown.standing = d.crown.standing;
    g.crown.lifetimeStanding = d.crown.lifetimeStanding;
    g.crown.gold = d.crown.gold;
    g.crown.discoveries = d.crown.discoveries ?? [];
    g.crown.landmarksFound = new Set(d.crown.landmarks ?? []);
    g.crown.patent = d.crown.patent ?? null;
    g.crown.completedPatents = d.crown.completedPatents ?? [];
    g.crown.hasKingsLetter = d.crown.hasKingsLetter ?? false;
    g.crown.padroesRaised = d.crown.padroesRaised ?? 0;
    g.crown.padraoStock = d.crown.padraoStock ?? 0;
    g.crown.routeOpened = d.crown.routeOpened ?? false;
    g.crown.padraoSites = d.crown.padraoSites ?? [];
    g.crown.chartedSincePatent = d.crown.chartedSincePatent ?? 0;
    g.markets.restore(d.markets);
    g.relations = new Map(d.relations);
    g.visitedPorts = new Set(d.visited);
    g.log.entries = d.log ?? [];
    g.dockedAt = d.dockedAt;
    g.anchored = d.anchored;
    g.ration = d.ration ?? 1;
    g.pumpEffort = d.pumpEffort ?? 0.15;
    g.autoTrim = d.autoTrim ?? true;
    // A save written before the setting existed loads as the relaxed one,
    // which is what a new game gives you. Defaulting the other way silently
    // handed a returning player the hard mode and no explanation for why the
    // watch had stopped working the ship.
    g.difficulty = d.difficulty ?? 'watch';
    g.orderedCanvas = d.orderedCanvas ?? g.ship.canvasSet;
    g.holdCourse = d.holdCourse ?? false;
    g.helmOrder = d.helmOrder ?? null;
    g.destination = d.destination ?? null;
    g.daysSincePort = d.daysSincePort ?? 0;
    g.distanceRun = d.distanceRun ?? 0;
    g.correctedNm = d.correctedNm ?? 0;
    g.groundRun = d.groundRun ?? 0;
    g.dayRuns = d.dayRuns ?? [];
    g.markLaidAt = d.markLaidAt ?? null;
    g.markDistNm = d.markDistNm ?? 0;
    g.deepestSouth = d.deepestSouth ?? 90;
    g.startT = d.startT ?? 0;
    g.leads = d.leads ?? [];
    g.ventures = d.ventures ?? [];
    g.ventureOffers = d.ventureOffers ?? [];
    if (d.rival) g.rival = d.rival;
    g.nextVentureId = d.nextVentureId ?? 1;
    g.nextLeadId = d.nextLeadId ?? 1;
    g.mode = 'sailing';
    g.lastLat = g.ship.state.pos.lat;
    g.displayHeading = g.ship.state.heading;
    g.displayHeel = g.ship.state.heel;
    g.refreshEnvironment();
    return g;
  }
}

const FAITH_WORD: Record<string, string> = {
  catholic: 'they are Christians',
  muslim: 'they are Muslims and have been for six hundred years',
  hindu: 'their faith is one nobody in Lisbon has a name for',
  buddhist: 'their faith is one nobody in Lisbon has a name for',
  traditional: 'they keep their own gods',
};

export { KNOTS, portName };

/**
 * The saint whose day it is.
 *
 * Not decoration: this is how the coast of Africa was named. Cabo de Santa
 * Maria, Rio de São Domingos, the Cape of St Blaise — a ship made a landfall,
 * the chaplain said whose feast it was, and the name went on the chart and
 * stayed there for five hundred years.
 */
function saintOfDay(clock: Clock): string {
  return SAINTS[clock.dayOfYear % SAINTS.length];
}

const SAINTS = [
  'Santo Antão', 'São Sebastião', 'São Vicente', 'São Brás', 'Santa Águeda',
  'São Matias', 'São Casimiro', 'São João de Deus', 'São José', 'São Bento',
  'São Gabriel', 'São Jorge', 'São Marcos', 'São Filipe', 'Santa Cruz',
  'Santo Isidoro', 'São Brandão', 'São Bernardino', 'Santa Joana', 'São Fernando',
  'São Barnabé', 'Santo António', 'São João Baptista', 'São Pedro', 'São Paulo',
  'Santa Isabel', 'São Bento de Nursia', 'Santa Maria Madalena', 'São Tiago',
  'Sant\u2019Ana', 'São Pantaleão', 'Santo Inácio', 'São Domingos', 'São Lourenço',
  'Santa Clara', 'Santa Maria', 'São Bartolomeu', 'Santo Agostinho', 'São Rafael',
  'São Gonçalo', 'São Nicolau', 'São Miguel', 'São Jerónimo', 'São Francisco',
  'São Dinis', 'São Lucas', 'São Simão', 'Todos os Santos', 'São Martinho',
  'Santa Catarina', 'Santo André', 'São Nicolau de Mira', 'Santa Luzia',
  'São Tomé', 'Santo Estêvão', 'São João Evangelista', 'São Silvestre',
];

/**
 * Whether swinging her head `sweep` degrees in `dir` would carry it into the
 * sector either side of the wind's eye that she cannot sail in.
 *
 * A ship already inside that sector is not "entering" it — she is in it, and the
 * only thing to do is bear away, which is the turn that gets her out soonest.
 */
function sweepEntersEye(
  heading: number, sweep: number, dir: number, windEye: number, noGo: number,
): boolean {
  if (Math.abs(angleDelta(windEye, heading)) < noGo) return false;
  // Degrees of turn, in this direction, before her head reaches the near edge.
  const edge = wrap360(windEye - dir * noGo);
  const toEdge = dir > 0 ? wrap360(edge - heading) : wrap360(heading - edge);
  return toEdge < sweep - 0.5;
}
