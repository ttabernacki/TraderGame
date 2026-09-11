import { Clock } from '../core/clock';
import {
  NM, angleDelta, clamp, cosd, formatBearing, formatLat, formatLon, haversine,
  lerp, rhumbStep, wrap180, wrap360, type LatLon,
} from '../core/math';
import { Rng } from '../core/rng';
import { Weather, type WeatherSample } from '../world/weather';
import { currentAt, dominantCurrentName, tidalStream, tideHeight } from '../world/currents';
import { depthAt, isLand, nearestShore } from '../world/landmass';
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
import {
  foragingParty, meetingParty, shorePlaceAt, waterParty, woodParty,
  type Hearsay, type LandingResult, type ShorePlace,
} from './shore';
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
  | 'audience' | 'court' | 'shipyard' | 'menu' | 'title' | 'gameover' | 'orders' | 'epilogue'
  | 'shore';

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

/** What a boat's crew can be sent in to do. */
export type ShoreAction = 'water' | 'wood' | 'food' | 'meet';

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
  /**
   * The stretch of coast she is anchored off, when it is not a port.
   *
   * Set when the anchor goes down somewhere nobody has built a town, which
   * until now produced one line in the log and nothing else at all.
   */
  shoreHere: ShorePlace | null = null;
  /** What the last boat that went in came back with. */
  shoreReport: string | null = null;
  /** Landings made here, so a coast cannot be milked by going in ten times. */
  private shoreVisits = new Map<string, number>();
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
  /**
   * The marks she is to make, in order.
   *
   * A passage is not one bearing. The whole of the volta do mar is a course
   * that goes the wrong way first on purpose, and a pilot planning one lays off
   * three or four legs on the paper before he weighs: out to the westward until
   * this latitude, then north until that one, then in for the land. With one
   * mark at a time the player had to sit over the chart and re-lay the course
   * by hand at every corner, which is a chore the ship's own pilot would have
   * done and which made planning a passage impossible to think about as a
   * whole. So the chart takes as many marks as he wants to put on it, and the
   * watch work them in order.
   */
  route: { name: string; lat: number; lon: number; portId?: string }[] = [];

  /** The mark she is steering for now, which is the first one left on the list. */
  get destination(): { name: string; lat: number; lon: number } | null {
    return this.route[0] ?? null;
  }

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
  private lastPortCheck = -1e9;
  /** When she last came up against the land, so it is said once and not hourly. */
  private lastTouchT = -1e9;
  /** The course she is being carried through the wind's eye onto, while tacking. */
  private tackingTo: number | null = null;
  /** When the watch give up on the tack and wear her round instead. */
  private tackingUntil = 0;
  /** Set by the integrator when a step was refused because it ended on land. */
  private touchedThisStep = false;
  /**
   * Backing her off, which no caravel could do and which is here anyway.
   *
   * A square-rigged ship can be got astern by bracing the yards aback, but not
   * off a beach she is sitting on, and the honest answer to being hard aground
   * on a lee shore is that the voyage is over. That is a fine answer for a
   * history and a miserable one for a game: a player who has put her on the
   * sand wants to get her off and carry on, and telling him to start a new
   * campaign is not a lesson, it is an exit. So she will walk astern at a knot
   * and a half whenever she is told to, and the log does not pretend otherwise.
   */
  backing = false;
  /** Hours she has been unable to lay a mark that is dead to windward. */
  private stuckHours = 0;
  /** The pilot only explains the turn of the sea once. */
  private voltaAdvised = false;
  /** When each settlement was last in sight, and how close she was cried at. */
  private townsRaised = new Map<string, { seenT: number; criedNm: number; sign: string }>();
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

  /**
   * What the masthead has to say about the land, all the time it is in sight.
   *
   * The lookout used to speak once, in an alert, and then the screen forgot
   * about the land entirely: a coast could be three miles under her lee and
   * nothing on the deck mentioned it. Now the distance and the bearing stand on
   * the HUD the whole time the land is up, with the lead alongside it once she
   * is in soundings — which is the one thing a man was sent to the masthead for
   * and the only reason a ship ever knew it was standing into danger.
   */
  landReport(): {
    distNm: number; bearing: number; near: boolean; close: boolean; sounding: string | null;
  } | null {
    const range = sightingRangeNm(this.ship.mastHeight, this.weatherNow.visibility);
    const d = this.sounding.shoreDistNm;
    if (d > range) return null;
    return {
      distNm: d,
      bearing: this.sounding.shoreBearing,
      near: d < 6,
      close: d < 1.5 || this.sounding.aground,
      sounding: this.sounding.depth < 90
        ? `${(this.sounding.depth / 1.8288).toFixed(0)} fathoms`
        : null,
    };
  }

  /**
   * The port the lookout can see, with its true bearing and distance.
   *
   * Finding a place you have never been was the hard half of this trade and the
   * game should keep it hard. Finding a place that is *on your chart*, whose
   * latitude you have from the quadrant, on a coast you are already in sight
   * of, was not hard at all: you ran down the parallel until the land came up
   * and then you asked the man at the masthead which way the town lay, and he
   * told you, because he could see it. Without that the player was sailing to
   * the charted position — which since the chart is wrong in longitude by a
   * degree and a half off Guinea is open sea — finding nothing there, and
   * having no way at all to convert "somewhere on this coast" into a course.
   *
   * So: a port already on the chart, within the lookout's range, on a coast in
   * sight, bears thus-and-so. Places not yet charted are not included. This
   * tells the player nothing a ship's company would not have known and it turns
   * an impossible search into a chase.
   */
  portInSight(): { def: PortDef; bearing: number; distNm: number; sure: boolean } | null {
    const eye = sightingRangeNm(this.ship.mastHeight, this.weatherNow.visibility);
    // Two ranges. Inside the lookout's, with the coast up, he can see the place
    // and says so. Outside it — but within a day's run — it is the pilot
    // talking, not the lookout: he has the latitude off the quadrant and he
    // knows the town is on this coast, so he knows which way to turn, and that
    // is exactly how these places were found.
    for (const near of portsNear(this.ship.state.pos, 60)) {
      if (!this.chart.ports.has(near.def.id)) continue;
      const dLat = near.at.lat - this.ship.state.pos.lat;
      const dLon = angleDelta(this.ship.state.pos.lon, near.at.lon) * cosd(this.ship.state.pos.lat);
      return {
        def: near.def,
        bearing: wrap360((Math.atan2(dLon, dLat) * 180) / Math.PI),
        distNm: near.distNm,
        sure: near.distNm <= eye && this.sounding.shoreDistNm <= Math.max(eye, 30),
      };
    }
    return null;
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
      // She takes the ground when she is on the land, and not before.
      //
      // The depth field is a smooth ramp off a coastline that is itself a
      // coarse polygon, so a draft test put her hard aground in water the chart
      // called five fathoms and the eye called open sea — a mile off a beach
      // she had never been shown. Shoal water is still shoal water: the lead
      // calls it, the watch keep their offing by it, and running through it is
      // the risk the player is taking. What it no longer does is wreck her
      // without warning.
      aground: shore.signed <= 0,
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
    this.makeSternway(simDt);

    if (this.anchored && !this.backing) {
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
      const was = { ...this.ship.state.pos };
      this.physics = this.runPhysics(dt);
      // The water stops here. She is not allowed onto the land at all: the step
      // that would take her there is simply not taken, her way comes off, and
      // she lies against the beach until somebody backs or steers her off.
      if (!isLand(was) && isLand(this.ship.state.pos)) {
        this.ship.state.pos = was;
        this.ship.state.surge = 0;
        this.ship.state.sway = 0;
        this.touchedThisStep = true;
      }
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
    const want = wanted;

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
      const was = { ...s.pos };
      this.physics = this.runPhysics(chunk);
      // The watch are holding her there. Whatever the rig tried to do to her
      // head over the last quarter of an hour, they took out with the helm.
      if (want !== null) {
        s.heading = held;
        s.yawRate = 0;
      }
      // A chunk at the fastest rates is minutes of sailing, which is a mile or
      // more in one step. Same rule as the fine integration: the step that
      // would put her on the land is not taken.
      if (!isLand(was) && isLand(s.pos)) {
        s.pos = was;
        s.surge = 0;
        s.sway = 0;
        this.touchedThisStep = true;
        break;
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

  private steerToCourse(dt: number): void {
    this.watchTheTack();
    const wanted = this.courseToSteer();
    if (wanted === null) return;
    const want = wanted;

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
    //
    // Unless he has been *told* to tack, which is the whole point of the order:
    // then he takes her through the eye deliberately and the risk of missing
    // stays is the captain's, as it should be.
    const short = angleDelta(heading, want);
    let dir: number = short >= 0 ? 1 : -1;
    if (this.tackingTo === null
        && sweepEntersEye(heading, Math.abs(short), dir, windEye, noGo)) dir = -dir;

    // Signed sweep in the chosen direction, which may be the long way round.
    const sweep = dir > 0 ? wrap360(want - heading) : -wrap360(heading - want);

    // He anticipates: he checks the swing before she reaches the course, or she
    // wanders either side of it for the whole watch.
    const demand = clamp(sweep * 0.05 - this.ship.state.yawRate * 0.85, -1, 1);
    const rate = 0.9 + skill(this.effectiveSkill, 'marinharia') * 1.2;

    // Coming about is not a course change, it is an evolution, and the whole
    // ship's company is doing it: the helm goes hard down and the hands haul
    // the yards round to force her head through the eye. Left to the rudder
    // alone she took twenty minutes to do what a caravel did in five or six,
    // and spent the middle of it going astern at two knots — which is what
    // being caught in stays *is*, and is not what a tack is.
    if (this.tackingTo !== null) {
      this.ship.state.rudder = dir;
      const swing = 0.45 * (0.7 + skill(this.effectiveSkill, 'marinharia') * 0.6);
      if (Math.abs(this.ship.state.yawRate) < swing
          || Math.sign(this.ship.state.yawRate) !== dir) {
        this.ship.state.yawRate = dir * swing;
      }
      return;
    }

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

  /**
   * Is she round yet, and if not, has she missed stays?
   *
   * Missing stays is the thing that makes the order a decision rather than a
   * button. A ship that goes into the wind with too little way on, or in a sea
   * that stops her, hangs head to wind with everything shaking and then falls
   * back onto the tack she came from, having lost a quarter of an hour and
   * several cables of ground to leeward. It happened constantly and it is why
   * captains wore ship when they could afford the room.
   */
  private watchTheTack(): void {
    if (this.tackingTo === null) return;
    const offCourse = Math.abs(angleDelta(this.ship.state.heading, this.tackingTo));
    if (offCourse < 7) {
      this.tackingTo = null;
      return;
    }
    if (this.clock.t < this.tackingUntil) return;

    // Out of time. She has missed stays: her head falls back the way it came
    // and the watch wear her round instead, which the ordinary course-keeper
    // will now do because it is no longer told to go through the eye.
    this.tackingTo = null;
    this.crew.morale = clamp(this.crew.morale - 0.02, 0, 1);
    this.pushAlert('She has missed stays. Wear her round instead.', 'warning');
    this.logEvent('note',
      'She would not come through the wind. Hung there head to sea with everything shaking, '
      + 'fell back onto the old tack, and we wore her round the other way and lost half a mile '
      + 'of it doing so.');
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
      // Weather that takes the canvas off her is weather worth being awake
      // for: a gale at a watch a second arrives and is over before the player
      // has read what happened.
      if (prudent < 0.45) this.easeTheClock(3);
      this.pushAlert(
        prudent <= 0
          ? 'The watch have taken everything off her and she lies to it under bare poles.'
          : `The watch are shortening sail — ${(prudent * 100).toFixed(0)}% is all she will bear.`,
        prudent <= 0.2 ? 'warning' : 'note',
      );
    }
  }

  /**
   * The pilot suggests the volta do mar, once, the first time she is stuck.
   *
   * This is the one piece of seamanship in the game that a player will not
   * arrive at by reasoning, because it is the opposite of reasoning: the way
   * home from Madeira is not towards Lisbon, it is four hundred miles out into
   * the empty Atlantic, away from everything, until the wind changes hands and
   * carries you in. It took the Portuguese the better part of a lifetime to
   * work out and it is why their caravels could come back from places other
   * people's ships could only go to. A player who has not been told will beat
   * to windward for a fortnight, lose the crew, and conclude the game is
   * broken, which is fair of him.
   *
   * So the pilot says it: once a voyage, only when she is actually stuck, and
   * only when the mark is to windward and far enough off to matter. After that
   * it is the captain's business. Being told is not the same as being able to
   * do it, which is the part worth playing.
   */
  private watchForTheTurn(hours: number): void {
    const dest = this.destination;
    if (!dest || this.voltaAdvised || this.anchored || this.dockedAt) return;
    const course = this.courseToDestination();
    if (!course || course.distNm < 150) return;

    // Is the mark to windward, and is it to the north — which is the case this
    // advice is about, and the case every homeward passage from the south is?
    const offWind = Math.abs(angleDelta(this.weatherNow.wind.from, course.bearing));
    const northward = dest.lat > this.ship.state.pos.lat + 1.5;
    if (offWind > this.noGoAngle + 12 || !northward) {
      this.stuckHours = Math.max(0, this.stuckHours - hours * 0.5);
      return;
    }

    this.stuckHours += hours;
    if (this.stuckHours < 9) return;
    this.voltaAdvised = true;

    this.pushAlert('The pilot asks to speak to you about the course.', 'warning');
    this.logEvent('note',
      `The pilot has been at the rail an hour working out how to say this. ${dest.name} `
      + 'bears up into the wind’s eye and we will not lay it on this tack or the other, and '
      + 'beating up is a month of it with the water going down. He says there is another way '
      + 'and that it sounds like madness: stand out to the north-west, away from the land and '
      + 'away from where we are going, four hundred miles of it or more, until we are up in the '
      + 'latitude of the Azores. The wind is westerly up there. It blows the way we want to go. '
      + 'Then we run in for Portugal with it behind us and make in a fortnight what we would not '
      + 'make in two months by the short road. He calls it the volta do mar, the turn of the sea. '
      + 'He says every man who has come home from Guinea has come home that way, and that the '
      + 'ones who tried the short road are still out there.',
      true);
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
    this.watchForTheTurn(hours);

    // Chart whatever the lookout can see, at intervals.
    if (this.clock.t - this.lastSurveyT > 900) {
      this.lastSurveyT = this.clock.t;
      const range = sightingRangeNm(this.ship.mastHeight, this.weatherNow.visibility);
      if (this.sounding.shoreDistNm < range) {
        const result = this.chart.survey(
          pos, this.nav.estimated, range, this.clock.t, skill(eff, 'cartografia'),
          // What the sighting is worth is what the pilot's position is worth.
          // A cape laid down an hour after a noon sight is worth having; the
          // same cape laid down at the end of three weeks of blue water is a
          // guess, and the chart treats it as one.
          this.nav.sigmaLat, this.nav.sigmaLon,
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
    if (this.nav.sigmaLat < 6) return;
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
    // The sun is on the meridian for about an hour and a half, and at a watch a
    // second that is four seconds of the player's life. The offer was being
    // made and then withdrawn before anybody could reach for the quadrant, so
    // in practice the sight — which is the whole of how a pilot knows his
    // latitude — was something that only ever happened by accident. The clock
    // comes down for it, the way the ship would be called.
    this.easeTheClock(2);
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
  /**
   * Take the way off the clock, not off the ship.
   *
   * A passage is run at a watch a second because most of it is empty, and the
   * price of that is that the one moment in a fortnight that wants attention
   * goes past inside a single frame: the land is raised twenty miles off and
   * the ship is on it before the alert has finished fading. Nobody can react to
   * that, and asking the player to sit at real time all the way down the coast
   * in case something happens is not a game, it is a watch-keeping punishment.
   *
   * So the clock comes down by itself when something is raised, the way the
   * captain would be sent for. It never speeds up on its own, and it never goes
   * below what it is told to — if the player is already at four times or slower
   * he is left alone.
   */
  private easeTheClock(toIndex: number): void {
    if (this.clock.scaleIndex <= toIndex) return;
    this.clock.scaleIndex = toIndex;
  }

  private cryLandRaised(bearing: number, daysAway: number): void {
    const range = sightingRangeNm(this.ship.mastHeight, this.weatherNow.visibility);
    const known = this.chart.knewCoastNear(this.ship.state.pos, range, this.clock.t - 3600);
    const word = formatBearing(bearing);
    const miles = this.sounding.shoreDistNm;

    // The cry brings the ship down to four times whatever she was running at,
    // so the player is actually at the rail when the land opens.
    const wasFast = this.clock.scaleIndex > 2;
    this.easeTheClock(2);

    this.pushAlert(
      `LAND HO — ${word}, ${miles.toFixed(0)} miles.`
      + (known ? ` ${daysAway < 1 ? 'Raised again' : `${daysAway.toFixed(0)} days without sight of it`}.`
        : ' It is on nobody\u2019s chart.')
      + (wasFast ? ' The clock is down to four times.' : ''),
      'warning');

    // A coast this ship has named before. The chart's placenames were write-only
    // — you could put a headland on the paper and the game never mentioned it
    // again — and recognising your own work is most of what makes a second
    // voyage down a coast different from the first.
    let mine: string | null = null;
    let mineNm = 45;
    for (const pl of this.chart.places) {
      const d = haversine(this.chart.placeAt(pl), this.nav.estimated) / NM;
      if (d < mineNm) { mineNm = d; mine = pl.name; }
    }
    if (mine) {
      this.pushAlert(`That is your own ${mine}, ${mineNm.toFixed(0)} miles off.`, 'note');
    }

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

    // She cannot be on the land -- the integrator will not put her there -- so
    // what is reported is the step that was refused, and the `aground` flag is
    // only a backstop for a position set from outside the simulation.
    if ((this.touchedThisStep || this.sounding.aground) && !this.backing) this.touchLand();
    this.touchedThisStep = false;

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
        if (away > 0.6) this.cryLandRaised(bearing, away);
      }
      if (inSight) this.lastLandSeenT = this.clock.t;
      this.landInSight = inSight;

      if (this.sounding.shoreDistNm < range && closing && hours < 6
          && this.clock.t - this.lastLandWord > 3 * 3600) {
        this.lastLandWord = this.clock.t;
        // Standing straight at a coast is the other case where the clock has to
        // come down: two hours of sea room at a watch a second is gone between
        // one frame and the next.
        this.easeTheClock(hours < 2 ? 1 : 2);
        this.pushAlert(
          `Land ho — ${formatBearing(bearing)}, ${this.sounding.shoreDistNm.toFixed(0)} miles, `
          + `and she is standing at it. ${hours < 2 ? 'Under two hours.' : `About ${hours.toFixed(0)} hours.`}`,
          hours < 2 ? 'grave' : 'warning',
        );
      }

      if (this.sounding.shoaling) {
        this.easeTheClock(2);
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
        this.crySettlementRaised(near.def, near.at, near.distNm);
        if (charted) continue;
        const isNew = this.chart.chartPort(
          near.def, this.nav.estimated, pos, this.clock.t, false,
          this.nav.sigmaLat, this.nav.sigmaLon,
        );
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
   * "Smoke on the land!"
   *
   * A coast with people on it is a different proposition from an empty one and
   * the ship has to be told which she has found while there is still sea room
   * to do something about it. What the lookout can actually make out at the
   * distance is what he says: a smoke first, because a column standing a
   * hundred metres up is twenty times the size of the roofs under it, then the
   * tower or the fort, then the houses. That progression is why a masthead was
   * worth manning, and it is the one piece of information in this game that
   * arrives before the player has committed to anything.
   */
  private crySettlementRaised(def: PortDef, at: LatLon, distNm: number): void {
    const known = this.chart.ports.has(def.id);
    const big = def.size === 'city' || def.size === 'emporium';

    // What is actually distinguishable, given how far off she is. The lookout
    // says what he can see, and the whole point of a masthead is that what he
    // can see changes as she closes.
    const sign = distNm > 9
      ? (big ? 'Smokes on the land' : 'A smoke on the land')
      : distNm > 4
        ? (def.feitoria ? 'A fort on the point' : big ? 'Towers and smokes' : 'Roofs among the trees')
        : (big ? 'A great town, and shipping in the road' : 'Houses along the beach');

    const last = this.townsRaised.get(def.id);
    const gone = !last || this.clock.t - last.seenT > 20 * 3600;
    // Raised again after a day out of sight of it, or closed far enough that he
    // has something new to say. Otherwise he holds his tongue, or a ship
    // coasting past a town reports it every half hour as it drops astern.
    const closed = !!last && distNm < last.criedNm * 0.5 && sign !== last.sign;
    this.townsRaised.set(def.id, {
      seenT: this.clock.t,
      criedNm: gone || closed ? distNm : (last?.criedNm ?? distNm),
      sign: gone || closed ? sign : (last?.sign ?? sign),
    });
    if (!gone && !closed) return;

    const dLat = at.lat - this.ship.state.pos.lat;
    const dLon = angleDelta(this.ship.state.pos.lon, at.lon) * cosd(this.ship.state.pos.lat);
    const bearing = wrap360((Math.atan2(dLon, dLat) * 180) / Math.PI);
    const word = formatBearing(bearing);

    this.pushAlert(
      known
        ? `${sign}, ${word} — ${def.name}, ${distNm.toFixed(0)} miles.`
        : `${sign}, ${word}, ${distNm.toFixed(0)} miles. Somebody lives here.`,
      'note');

    if (!known) {
      this.logEvent('landfall',
        `${sign} ${word}, ${distNm.toFixed(0)} miles off, and no chart aboard shows a soul on `
        + 'this coast. The hands are on the rail. Whoever they are, they have seen us by now.',
        true);
      this.crew.morale = clamp(this.crew.morale + 0.05, 0, 1);
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
    this.route.shift();
    const next = this.route[0];
    if (next) {
      // One leg of the passage done and the next one begins from here: the
      // watch put her head round without anybody having to go to the chart.
      this.markLaidAt = { ...this.nav.estimated };
      this.markDistNm = haversine(
        this.nav.estimated, { lat: next.lat, lon: next.lon }) / NM;
      this.pushAlert(`Up with ${d.name}. Now for ${next.name}.`, 'note');
      this.logEvent('note',
        `Made ${d.name}, and shaped a course for ${next.name}: `
        + `${this.route.length} ${this.route.length === 1 ? 'mark' : 'marks'} left of the passage.`,
        true);
      return;
    }
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

  /**
   * What the boat can be sent in for, where she now lies.
   *
   * Water, wood, something green, and who lives here. Those are the four things
   * a landing party actually went in for, and between them they decide how long
   * a ship can stay at sea — which is to say they are the whole reason for
   * closing a strange coast at all.
   */
  shoreActions(): { id: ShoreAction; label: string; detail: string; done: boolean }[] {
    const place = this.shoreHere;
    if (!place) return [];
    const folk = place.peopleId ? people(place.peopleId) : null;
    const key = this.shoreKey();
    const done = (a: ShoreAction) => (this.shoreVisits.get(`${key}:${a}`) ?? 0) > 0;
    return [
      {
        id: 'water',
        label: 'Send the casks in',
        detail: 'A boat, the empty casks, and a dozen men to look for a stream.',
        done: done('water'),
      },
      {
        id: 'wood',
        label: 'Cut wood',
        detail: 'Firewood for the galley, and spars if anything ashore is straight enough.',
        done: done('wood'),
      },
      {
        id: 'food',
        label: 'Look for anything green',
        detail: 'Fruit, greens, shellfish, eggs — whatever will keep the scurvy down.',
        done: done('food'),
      },
      {
        id: 'meet',
        label: folk ? 'Walk up the beach' : 'See who is here',
        detail: folk
          ? `This is the country of the ${folk.name}, or near enough.`
          : 'Find out whether anybody lives on this coast.',
        done: done('meet'),
      },
    ];
  }

  private shoreKey(): string {
    const p = this.ship.state.pos;
    // Quarter of a degree: far enough that moving on is a different place, near
    // enough that swinging at anchor is not.
    return `${(p.lat * 4).toFixed(0)}:${(p.lon * 4).toFixed(0)}`;
  }

  /**
   * Hoist the boat out and send her in.
   *
   * Time passes while she is away, which is the cost: a day spent watering is a
   * day the scurvy is still working and a day the other man is still sailing.
   */
  sendBoatAshore(action: ShoreAction): string {
    const place = this.shoreHere;
    if (!place) return 'She is not lying off any coast.';
    if (this.weatherNow.waveHeight > 2.4 || this.weatherNow.wind.speed > 24) {
      return 'No boat could land on that beach today.';
    }
    const key = `${this.shoreKey()}:${action}`;
    if ((this.shoreVisits.get(key) ?? 0) > 0) {
      return 'That has been done here already. There is no more of it to be had.';
    }
    const hands = ableHands(this.crew);
    if (hands < 8) return 'There are not enough men fit to pull a boat ashore.';
    this.shoreVisits.set(key, 1);

    const folk = place.peopleId ? people(place.peopleId) : null;
    let r: LandingResult;
    switch (action) {
      case 'water': r = waterParty(place, this.rng, hands); break;
      case 'wood': r = woodParty(place, this.rng); break;
      case 'food': r = foragingParty(place, this.rng); break;
      default: r = meetingParty(place, this.rng, folk ? folk.name : null, this.whatTheyKnow()); break;
    }

    // The boat is away, and the ship waits.
    this.waitDays(r.days);

    const p = this.crew.provisions;
    if (r.waterDays) p.water = Math.min(p.water + r.waterDays, 160);
    if (r.freshDays) {
      p.fresh = Math.min(p.fresh + r.freshDays, 40);
      this.crew.daysWithoutFresh = 0;
    }
    if (r.woodDays) p.biscuit = Math.min(p.biscuit + r.woodDays * 0.25, 160);
    if (r.moraleDelta) this.crew.morale = clamp(this.crew.morale + r.moraleDelta, 0, 1);
    if (r.hurt) this.crew.sickness = clamp(this.crew.sickness + r.hurt * 0.02, 0, 1);
    // What they pointed at goes on the chart, at the place their arm and their
    // fingers put it — which is a rough place, and is how most of this coast
    // first got drawn.
    if (r.told) {
      const def = portDef(r.told.portId);
      const err = (this.rng.next() - 0.5) * 2;
      const at = rhumbStep(
        this.nav.estimated, wrap360(r.told.bearing + err * 14),
        r.told.distNm * (1 + err * 0.22) * NM);
      // An arm and some fingers is worth about fifty miles, which is poor and
      // is not nothing: the chart weighs it against everything else it has.
      const w = 1 / (50 * 50);
      const existing = this.chart.ports.get(def.id);
      if (!existing) {
        this.chart.ports.set(def.id, {
          id: def.id, lat: at.lat, lon: at.lon, visited: false, traded: false,
          t: this.clock.t, wLat: w, wLon: w, passes: 0,
        });
      } else {
        existing.lat = (existing.lat * existing.wLat + at.lat * w) / (existing.wLat + w);
        existing.lon = existing.lon
          + (wrap180(at.lon - existing.lon) * w) / (existing.wLon + w);
        existing.wLat += w;
        existing.wLon += w;
        existing.t = this.clock.t;
      }
      this.pushAlert(`${def.name} — they say it lies ${formatBearing(r.told.bearing)} of here.`, 'note');
    }
    if (r.metPeople && place.peopleId) {
      // Meeting people on a beach is worth recording, once per people.
      const name = folk ? folk.name : 'a people with no name we know';
      if (this.crown.record('people', `The ${name}`, this.nav.estimated, 14, this.clock.t)) {
        this.logEvent('contact', `Met the ${name} on an open beach, with no town in sight.`, true);
      }
    }

    this.shoreReport = r.text;
    this.logEvent(action === 'meet' ? 'contact' : 'note', r.text, action === 'meet');
    if (r.severity && r.severity !== 'note') this.pushAlert(r.text.slice(0, 90), r.severity);
    return r.text;
  }

  /**
   * What the people on this beach can tell a boat's crew about the coast.
   *
   * The nearest town they would know of that is not already on our chart —
   * because a landing party that is told about a place the pilot drew last
   * month has been told nothing. Four hundred miles is as far as any of this
   * ever carried: beyond that the people on one beach have not heard of the
   * people on the next.
   *
   * This is the piece that makes a landing on an empty coast worth the day it
   * costs. Finding a town you have never heard of by asking somebody who lives
   * two days' walk from it is exactly how the Guinea coast was charted, and it
   * gives the player a way to work down a strange shore that is not sailing
   * blind and hoping.
   */
  private whatTheyKnow(): Hearsay | null {
    const from = this.ship.state.pos;
    // As far as word travels along a beach. Three hundred and fifty miles is
    // already generous — it is a week's walk — and beyond it the people on one
    // shore have genuinely not heard of the people on the next.
    const reach = portsNear(from, 350).filter((x) => !this.visitedPorts.has(x.def.id));
    // A place we have never drawn is worth far more than a second opinion about
    // one we have, so it is offered first — but a second opinion is worth
    // having too, because the chart averages it in with everything else and
    // somebody who lives on this coast is a better authority on it than a
    // pilot who has run past it once.
    const target = reach.find((x) => !this.chart.ports.has(x.def.id)) ?? reach[0];
    if (!target) return null;
    const dLat = target.at.lat - from.lat;
    const dLon = angleDelta(from.lon, target.at.lon) * cosd(from.lat);
    return {
      portId: target.def.id,
      name: target.def.name,
      bearing: wrap360((Math.atan2(dLon, dLat) * 180) / Math.PI),
      distNm: target.distNm,
      known: this.chart.ports.has(target.def.id),
    };
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
      (p) => haversine(this.chart.placeAt(p), this.nav.estimated) / NM < 12,
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

  /**
   * She has come up against the land.
   *
   * Not a grounding: there is no such thing in this game any more. She stops
   * where the water stops, the way she would stop against a quay, and nothing
   * else happens to her — no damage, no anchor down, no waiting on a tide, and
   * above all no state she cannot get out of. She can be backed off with B or
   * simply steered off; the hull is untouched and the campaign is untouched.
   *
   * The reason is not realism, it is that being permanently stuck is the one
   * outcome a player cannot do anything with. Everything else in this game can
   * be recovered from by sailing better. That could not, so it is gone.
   */
  private touchLand(): void {
    this.ship.state.surge = 0;
    this.ship.state.sway = 0;
    if (this.clock.t - this.lastTouchT < 3 * 3600) return;
    this.lastTouchT = this.clock.t;
    // The watch hand the sail and hold her head where it is, and wait to be
    // told. Nobody keeps driving a ship at a beach, and a course laid off
    // across a continent would otherwise grind her against it for a fortnight
    // while the player is looking at something else.
    this.setCanvas(0);
    this.steadyAsSheGoes();
    this.pushAlert(
      'She is in against the land. The watch have handed the sail. '
      + 'Back her off with B, or steer off and press H.', 'warning');
    this.logEvent('note',
      'Ran her in until she would go no further and touched, gently, with no harm in it. '
      + 'Handed the sail and lay against the shore waiting for orders.');
  }

  /**
   * Walk her astern, off whatever she has got herself onto.
   *
   * A knot and a half, straight back down her own heading, whether she is
   * afloat or sitting on the beach, until she is in clear water — and then it
   * stops itself, so nobody backs her half a mile out to sea by forgetting
   * about it.
   */
  backHer(): string {
    if (this.dockedAt) return 'She is moored. There is nothing to back off.';
    this.backing = !this.backing;
    if (!this.backing) return 'Belay backing her.';
    this.setCanvas(0);
    this.holdCourse = false;
    this.helmOrder = null;
    this.logEvent('note',
      'Got the sweeps and the boat ahead with a line to the stern, and walked her back off it.');
    return 'Backing her astern. B again to stop.';
  }

  private makeSternway(simDt: number): void {
    if (!this.backing) return;
    // Capped so that backing at a watch a second does not fling her a league.
    const dt = Math.min(simDt, 45);
    // Afloat, she goes straight astern, which is what backing means. Aground,
    // she goes toward deep water whichever way her head happens to be lying —
    // because the whole point of this is to get her off, and a ship that walks
    // further up the beach because she struck while paying off is not a rescue,
    // it is the same trap with an extra keystroke.
    // Which way is off.
    //
    // From *inside* a landmass the shore bearing points out to the sea, and
    // from outside it points at the beach, so the sign flips the moment she
    // floats. Both cases are worked as "away from the land" while she is
    // anywhere near it, and only out in clear water does backing mean what the
    // word means. Going straight astern throughout walked her up the beach
    // whenever she had struck while paying off, and made her jitter across the
    // waterline once she was free of it.
    const close = this.sounding.shoreDistNm < 0.6;
    const off = this.sounding.aground
      ? this.sounding.shoreBearing
      : wrap360(this.sounding.shoreBearing + 180);
    const astern = this.sounding.aground || close
      ? off
      : wrap360(this.ship.state.heading + 180);
    const run = 1.5 * NM * (dt / 3600);
    this.ship.state.pos = rhumbStep(this.ship.state.pos, astern, run);
    this.nav.estimated = rhumbStep(this.nav.estimated, astern, run);
    this.ship.state.surge = 0;
    this.ship.state.sway = 0;
    this.ship.state.yawRate = 0;
    // Her head comes round to the offing as she comes off, so that when the
    // sweeps stop she is pointing at deep water and not back at the sand.
    if (this.sounding.aground || close) this.ship.state.heading = off;
    this.refreshEnvironment();

    if (!this.sounding.aground) {
      this.anchored = false;
      if (this.sounding.shoreDistNm > 0.5) {
        this.backing = false;
        this.pushAlert('She is off and afloat. Make sail when you are ready.', 'note');
      }
    }
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

  /**
   * About ship.
   *
   * The single most-used order on a windward passage and the one the game had
   * no word for. Beating means putting her through the wind's eye every few
   * hours, and doing it by holding the helm over — at a clock rate where the
   * helm is not even being worked — meant nudging her round in twelve-degree
   * steps, past the no-go, hoping she did not stall, while the watch tried to
   * put her back. That is not the interesting decision. *When* to go about is
   * the interesting decision, and this leaves it entirely to the captain: it
   * only does the evolution, and it does it the way a crew does, which is in
   * one order.
   *
   * She comes round onto the same angle to the wind on the other side — a
   * close-hauled ship tacks from sixty degrees off on one bow to sixty off on
   * the other — so nothing is gained or lost by it except the ground she makes
   * while her head is through the wind, which the physics takes off her because
   * her sails are aback while she is in stays.
   *
   * If she is sailing free rather than close-hauled there is nothing to tack,
   * and the order wears her round instead: away from the wind and onto the
   * other gybe, which is the slower way and the one that does not risk missing
   * stays.
   */
  aboutShip(): string {
    if (this.anchored || this.dockedAt) return 'She is at anchor.';
    const windEye = this.weatherNow.wind.from;
    // The rig's own convention: beta is the wind off the bow, positive with the
    // wind to starboard, which is the starboard tack. `side` is the side of the
    // wind's eye her head lies on, which is the opposite sign.
    const betaSigned = angleDelta(this.ship.state.heading, windEye);
    const beta = Math.abs(betaSigned);
    const side = -(Math.sign(betaSigned) || 1);
    const ontoStarboard = betaSigned < 0;

    if (beta > 125) {
      // Running. Gybe her: bring the wind across the stern to the other quarter.
      this.helmOrder = wrap360(windEye - side * beta);
      this.holdCourse = true;
      this.pushAlert(
        `Stand by to gybe \u2014 the wind onto the ${ontoStarboard ? 'starboard' : 'port'} quarter.`,
        'note');
      this.logEvent('note', 'Gybed her over, and the main came across with a crack you felt in the deck.');
      return 'Gybe-o.';
    }

    // The angle she will lie on the new tack: as close as she will point, or
    // the angle she is sailing now if she is not pinching.
    const noGo = this.noGoAngle;
    const newBeta = clamp(beta, noGo, 120);
    this.helmOrder = wrap360(windEye - side * newBeta);
    this.holdCourse = true;
    // Her head has to go through the wind, so she loses her way while she does
    // it: the watch let her run up, the sails come aback, and she pays off on
    // the other bow with the speed of a walking man.
    this.ship.state.surge *= 0.45;

    // Will she come round at all?
    //
    // Decided here, when the order is given, so the answer is immediate and the
    // player can see what it turned on. A ship goes through the wind on the way
    // she has on her: with plenty of speed and a smooth sea it is routine, and
    // with the way off her or a head sea stopping her she hangs in the eye,
    // falls back onto the tack she came from, and has to be worn round instead
    // — which costs a quarter of an hour and half a mile to leeward. This is
    // the reason a captain with sea room wore rather than tacked, and without
    // it the order was free and the choice was not a choice.
    const way = clamp(Math.abs(this.physics.speedKnots) / 4.5, 0, 1);
    const sea = clamp(this.weatherNow.waveHeight / 4, 0, 1);
    const hands = skill(this.effectiveSkill, 'marinharia');
    const chance = clamp(0.35 + way * 0.55 + hands * 0.25 - sea * 0.4, 0.12, 0.97);
    if (!this.rng.chance(chance)) {
      this.crew.morale = clamp(this.crew.morale - 0.02, 0, 1);
      this.pushAlert(
        'She missed stays \u2014 hung in the wind and fell back. The watch are wearing her '
        + 'round instead.', 'warning');
      this.logEvent('note',
        'Put the helm down and she would not go through it: hung head to wind with everything '
        + 'shaking, gathered sternway, and paid off on the tack she came from. Wore her round '
        + 'the other way and lost the best part of half a mile doing it.');
      // `tackingTo` is left unset, so the ordinary course-keeper takes her the
      // long way round — which is wearing ship, which is what has happened.
      return 'She missed stays.';
    }

    this.tackingTo = this.helmOrder;
    // A caravel that has not got her head round in half an hour is not going
    // to. Measured, a tack takes five or six minutes with the hands at the
    // braces; anything much past that and she is hanging in stays.
    this.tackingUntil = this.clock.t + 30 * 60;
    this.easeTheClock(3);
    this.pushAlert(
      `Ready about. Helm\u2019s a-lee \u2014 she comes onto the `
      + `${ontoStarboard ? 'starboard' : 'port'} tack, ${newBeta.toFixed(0)}\u00b0 off the wind.`,
      'note');
    this.logEvent('note',
      'Put the helm down and carried her through the wind. She hung a moment in stays with '
      + 'everything shaking and then paid off on the other tack.');
    return 'Helm\u2019s a-lee.';
  }

  /**
   * Which board makes the better ground toward the mark.
   *
   * Beating is a sequence of choices between two bad options, and the whole
   * skill of it is knowing which is less bad — which is a thing a pilot reads
   * off the set of the sea and forty years of practice, and which a player
   * staring at a compass rose has no way to work out at all. This gives him the
   * same answer a good pilot would have: the speed she would actually make
   * *toward the mark* on each tack, which is not the speed she sails at.
   */
  tackChoice(): {
    port: number; starboard: number; better: 'port' | 'starboard'; beating: boolean;
  } | null {
    const dest = this.courseToDestination();
    if (!dest) return null;
    const windEye = this.weatherNow.wind.from;
    const noGo = this.noGoAngle;
    const beating = Math.abs(angleDelta(windEye, dest.bearing)) < noGo + 8;
    // Her best speed on each board is her speed close-hauled; what differs is
    // how much of it is pointed at the mark.
    const speed = Math.max(Math.abs(this.physics.groundKnots), 0.3);
    const madeGood = (heading: number) =>
      speed * Math.cos((angleDelta(heading, dest.bearing) * Math.PI) / 180);
    const port = madeGood(wrap360(windEye + noGo));
    const starboard = madeGood(wrap360(windEye - noGo));
    return { port, starboard, better: port >= starboard ? 'port' : 'starboard', beating };
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
    this.anchored = false;
    this.dockedAt = null;
    // Start the day's run from the moment she drops down the river, so the
    // first noon at sea has something to report.
    const day = Math.floor(this.clock.t / 86400);
    this.lastNoonDay = this.clock.hour < 12 ? day - 1 : day;
    this.shoreHere = null;
    this.shoreReport = null;
    // Weighing from a known anchorage is itself a fix, and the land she is
    // dropping astern counts as land seen — otherwise the first headland after
    // a two-day coastal hop is announced as a landfall.
    this.lastLandSeenT = this.clock.t;
    this.landInSight = true;
    // Nobody at the masthead announces the town the ship is standing out of.
    for (const near of portsNear(this.ship.state.pos, 6)) {
      this.townsRaised.set(near.def.id,
        { seenT: this.clock.t, criedNm: near.distNm, sign: '' });
    }
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

  /**
   * One press. Hand the sail, let the anchor go, and open whatever is there.
   *
   * It used to refuse if she still had way on — "take in sail first" — which is
   * correct and is also three separate actions to arrive somewhere, with the
   * ship sailing past the anchorage while the player works out which one he has
   * not done. The watch can hand sail and let go in the same breath; they did
   * not need to be told twice.
   */
  letGoAnchor(): string {
    if (this.sounding.depth > 90) return 'No bottom here. You cannot anchor in this depth.';
    // Handing the sail is part of anchoring, not a thing to be done before it.
    this.setCanvas(0);
    this.ship.setAllCanvas(0);
    this.ship.state.surge *= 0.2;
    this.ship.state.sway = 0;
    this.backing = false;
    this.anchored = true;
    const near = this.approachablePorts();
    if (near.length > 0) {
      this.enterPort(near[0].def);
      return 'Anchor let go.';
    }

    // Anchored off a coast with no town on it. This used to be one line in the
    // log and nothing else — the land was scenery. It is now a place, with
    // whatever a boat's crew could actually get out of it.
    this.lastLandSeenT = this.clock.t;
    this.landInSight = true;
    this.shoreReport = null;
    if (this.sounding.shoreDistNm < 16) {
      this.shoreHere = shorePlaceAt(this.ship.state.pos);
      this.logEvent('landfall',
        `Came to an anchor in ${this.sounding.depth.toFixed(0)} fathoms, `
        + `${this.sounding.shoreDistNm.toFixed(1)} miles off the beach. ${this.shoreHere.describe}`,
        true);
      this.pushAlert('Anchored off the land. The boat can be hoisted out.', 'note');
    } else {
      this.shoreHere = null;
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
    // Drawn before the landfall fix, so what goes onto the paper is the
    // reckoning she arrived on — an opinion formed at sea and independent of
    // what the chart already said. Fixing first and charting afterwards would
    // have every visit confirm the chart with the chart.
    this.chart.chartPort(
      def, this.nav.estimated, this.ship.state.pos, this.clock.t, true,
      this.nav.sigmaLat, this.nav.sigmaLon,
    );

    // Making a landfall on a place you already know fixes your position — but
    // only as well as you know the place.
    //
    // A pilot who raises Arguim does not thereby learn his longitude. He learns
    // that he is at Arguim, and then writes down whatever longitude his chart
    // gives Arguim, which for most of this coast in 1482 was out by a degree
    // and more. His latitude is a different matter: the quadrant is ashore, it
    // is steady, and there is all day to use it, so that much is settled for
    // good. Fixing him to the truth instead made the inherited chart's error
    // self-correcting and the whole survey pointless — every port call quietly
    // handed him a longitude nobody in Europe had.
    const rel = this.relationsFor(def.id);
    if (rel.met || def.known) {
      const at = anchorageOf(def);
      const believed = this.chart.believedPort(def.id);
      const lonDoubt = believed ? Math.sqrt(1 / Math.max(believed.wLon, 1e-9)) : 1.2;
      this.nav.applyLandfall(
        { lat: at.lat, lon: believed ? believed.lon : at.lon },
        this.clock.t,
        lonDoubt,
      );
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
    this.setDestination(def.name, at.lat, at.lon, def.id);
  }

  /** The furthest south she has ever been, by the reckoning. */
  get furthestSouth(): number {
    return this.deepestSouth;
  }

  /** Lay off a fresh course for somewhere, striking whatever was laid before. */
  setDestination(name: string, lat: number, lon: number, portId?: string): void {
    this.route = [{ name, lat, lon, portId }];
    this.holdCourse = true;
    this.helmOrder = null;
    this.markLaidAt = { ...this.nav.estimated };
    this.markDistNm = haversine(this.nav.estimated, { lat, lon }) / NM;
    this.logEvent('note', `Laid off a course for ${name}.`);
    this.pushAlert(`Course laid off for ${name}.`, 'note');
  }

  /**
   * Add a mark to the end of the passage she is already laid off for.
   *
   * The first one is a course; the second makes it a plan.
   */
  addWaypoint(name: string, lat: number, lon: number, portId?: string): void {
    if (this.route.length === 0) {
      this.setDestination(name, lat, lon, portId);
      return;
    }
    if (this.route.length >= 12) return;
    this.route.push({ name, lat, lon, portId });
    this.holdCourse = true;
    this.pushAlert(`${name} added to the passage \u2014 ${this.route.length} marks.`, 'note');
  }

  /** Strike one mark out of the passage, leaving the rest of it standing. */
  removeWaypoint(index: number): void {
    if (index < 0 || index >= this.route.length) return;
    const gone = this.route.splice(index, 1)[0];
    if (this.route.length === 0) {
      this.holdCourse = false;
      this.markLaidAt = null;
    } else if (index === 0) {
      // The leg she was actually steering has been struck out, so the next one
      // begins here rather than wherever the last was laid off from.
      this.markLaidAt = { ...this.nav.estimated };
      this.markDistNm = haversine(
        this.nav.estimated, { lat: this.route[0].lat, lon: this.route[0].lon }) / NM;
    }
    this.pushAlert(`${gone.name} struck off the passage.`, 'note');
  }

  clearDestination(): void {
    this.route = [];
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
      voltaAdvised: this.voltaAdvised,
      orderedCanvas: this.orderedCanvas,
      holdCourse: this.holdCourse,
      helmOrder: this.helmOrder,
      route: this.route,
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
    (g as any).voltaAdvised = d.voltaAdvised ?? false;
    g.orderedCanvas = d.orderedCanvas ?? g.ship.canvasSet;
    g.holdCourse = d.holdCourse ?? false;
    g.helmOrder = d.helmOrder ?? null;
    // Saves from before a passage could have more than one mark carry a single
    // destination; it becomes a route of one.
    g.route = d.route ?? (d.destination ? [d.destination] : []);
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
