import { Clock } from '../core/clock';
import {
  NM, angleDelta, clamp, cosd, formatBearing, formatLat, formatLon, haversine,
  lerp, wrap360,
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
import { RIG_PROFILES, optimalTrim, pointOfSail, sailForce, tackName } from '../ship/rig';
import { Navigator } from '../navigation/navigator';
import { Chart, sightingRangeNm } from '../navigation/charts';
import { magneticVariation } from '../navigation/celestial';
import {
  ableHands, crewFactor, newCrew, officerBonus, updateCrew, type CrewState,
} from '../crew/crew';
import { newSkills, skill, train, type SkillSet } from '../crew/skills';
import { Markets } from '../economy/market';
import { Crown, portName } from '../progression/crown';
import { newRelations, type Relations } from '../diplomacy/contact';
import { Logbook, type LogKind } from './log';
import { rollSeaEvent, type SeaEvent } from './seaEvents';

export type GameMode =
  | 'sailing' | 'chart' | 'sight' | 'logbook' | 'crew' | 'port'
  | 'audience' | 'court' | 'shipyard' | 'menu' | 'title' | 'gameover';

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

  mode: GameMode = 'title';
  /** Set while at anchor in a port. */
  dockedAt: string | null = null;
  anchored = false;

  /** Latest simulation readouts, refreshed every step. */
  weatherNow!: WeatherSample;
  physics!: StepResult;
  sounding: Sounding = { depth: 4000, shoreDistNm: 999, shoreBearing: 0, aground: false, shoaling: false };
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
  /** Simulated days since she last lay in a port. */
  daysSincePort = 0;
  private eventCooldown = 0;

  /** Fraction of the standard ration being issued. */
  ration = 1;
  /** Hands told off to the pumps rather than to the sails. */
  pumpEffort = 0.15;
  /** True when the crew trim the sails without being told. */
  autoTrim = true;

  private accumDays = 0;
  private lastLat = 0;
  private lastSurveyT = -1e9;
  private lastPortCheck = -1e9;
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

  get tuning(): ShipTuning {
    const eff = this.effectiveSkill;
    return {
      fouling: 1 + this.ship.condition.fouling * 0.85,
      crewFactor: crewFactor(this.crew, this.ship.baseHull.crewMin),
      seamanship: skill(eff, 'marinharia'),
      keel: this.ship.effects.keel,
      integrity: this.ship.condition.hull,
    };
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
    const maxSteps = 40;
    let step = 0.25;
    if (simDt / step > maxSteps) step = clamp(simDt / maxSteps, 0.25, 12);
    let remaining = simDt;

    while (remaining > 0) {
      const dt = Math.min(step, remaining);
      if (this.autoTrim) this.applyAutoTrim(dt);
      this.physics = this.runPhysics(dt);
      remaining -= dt;
    }
  }

  /** The crew keep the sails drawing without being told, imperfectly. */
  private applyAutoTrim(dt: number): void {
    const beta = this.physics?.beta ?? 0;
    const eff = this.effectiveSkill;
    const sk = skill(eff, 'marinharia');
    const rate = dt * (0.4 + sk * 1.6) * clamp(crewFactor(this.crew, this.ship.baseHull.crewMin), 0.1, 1.4);

    for (let i = 0; i < this.ship.state.sails.length; i++) {
      const sail = this.ship.state.sails[i];
      if (sail.shifting > 0) continue;
      const profile = RIG_PROFILES[this.ship.hull.masts[i].rig];
      const want = optimalTrim(beta, profile);
      // A less skilled crew settle for a rougher trim.
      const slop = lerp(9, 1.2, sk);
      const target = want + (this.rng.next() - 0.5) * slop;
      const d = target - sail.trim;
      sail.trim = clamp(
        sail.trim + Math.sign(d) * Math.min(Math.abs(d), rate * 14),
        profile.minTrim, profile.maxTrim,
      );
    }
  }

  private updateNavigation(simDt: number): void {
    const pos = this.ship.state.pos;
    const eff = this.effectiveSkill;
    const navSkill = skill(eff, 'navegacao');
    this.nav.leewayAllowance = this.skills.navegacao >= 15 ? 0.85 : 0;

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
        const before = this.chart.points.size;
        const newly = this.chart.survey(
          pos, this.nav.estimated, range, this.clock.t, skill(eff, 'cartografia'),
        );
        const added = this.chart.points.size - before;
        if (newly.length > 0) {
          const nm = added * 6;
          this.crown.chartedSincePatent += nm;
          this.crown.progressObjective('chart', undefined, nm);
          train(this.skills, 'cartografia', added * 0.14);
          train(this.skills, 'navegacao', added * 0.04);
        }
      }
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

    const events = updateCrew(this.crew, {
      days,
      ashore: this.anchored && this.dockedAt !== null,
      ration: this.ration,
      leadership: skill(eff, 'lideranca'),
      surgeonQuality: surgeon ? surgeon.ability : 0,
      exertion,
      beyondTheKnown: this.beyondTheKnown,
      gold: this.crown.gold,
      rng: this.rng,
    });

    for (const e of events) {
      this.pushAlert(e.message, e.severity);
      this.logEvent('crew', e.message, e.severity === 'grave');
      if (e.kind === 'mutiny') this.handleMutiny();
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
        this.crew.morale -= 0.06;
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

    if (this.sounding.shoaling && !this.anchored && this.physics.speedKnots > 1) {
      this.pushAlert(
        `By the lead, ${this.sounding.depth.toFixed(0)} fathoms shoaling — land bears ${formatBearing(this.sounding.shoreBearing)}`,
        'warning',
      );
    }

    // Landmarks of the route.
    const landmarks = this.crown.checkLandmarks(pos, this.lastLat);
    this.lastLat = pos.lat;
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
    this.eventCooldown = Math.max(0, this.eventCooldown - days);
    if (this.eventCooldown > 0) return;

    const event = rollSeaEvent(this, days);
    if (!event) return;

    this.eventCooldown = event.choices ? 1.6 : 0.55;
    this.recentEvents.unshift(event.id);
    if (this.recentEvents.length > 4) this.recentEvents.pop();

    if (event.choices && event.choices.length > 0) {
      this.pendingEvent = event;
      return;
    }
    this.pushAlert(event.text, event.severity);
    this.logEvent(event.severity === 'note' ? 'note' : 'peril', event.text, event.severity !== 'note');
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

    this.crew.morale -= 0.2;
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

  setHelm(v: number): void {
    this.ship.state.rudder = clamp(v, -1, 1);
    // You cannot steer a ship at two hours to the second.
    if (this.clock.scaleIndex > 2) this.clock.scaleIndex = 2;
  }

  setCanvas(fraction: number): void {
    this.ship.setAllCanvas(fraction);
    if (this.clock.scaleIndex > 3) this.clock.scaleIndex = 3;
  }

  adjustTrim(delta: number): void {
    this.autoTrim = false;
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
    this.ship.setAllCanvas(Math.min(0.6, prudentCanvas(this.weatherNow.wind.speed)));
    this.logEvent('departure', `Weighed and made sail. Wind ${formatBearing(this.weatherNow.wind.from)}, ${this.weatherNow.wind.speed.toFixed(0)} knots.`);
    return 'Anchor aweigh.';
  }

  letGoAnchor(): string {
    if (this.sounding.depth > 55) return 'No bottom here. You cannot anchor in this depth.';
    if (Math.abs(this.physics.speedKnots) > 3) return 'Too much way on. Take in sail first.';
    this.anchored = true;
    this.ship.setAllCanvas(0);
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
    this.recentEvents = [];
    this.markets.refresh(def.id, this.clock.t);

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
    } else {
      this.logEvent('landfall', `Anchored again off ${def.name}.`);
    }
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
  }

  pushAlert(text: string, severity: Alert['severity']): void {
    const last = this.alerts[this.alerts.length - 1];
    if (last && last.text === text && this.clock.t - last.t < 7200) return;
    this.alerts.push({ id: this.nextAlertId++, text, severity, t: this.clock.t });
    if (this.alerts.length > 6) this.alerts.shift();
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
      heading: this.ship.state.heading,
      // The compass card shows magnetic, which is what the helmsman steers by.
      compass: wrap360(this.ship.state.heading - variation),
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
      heel: this.ship.state.heel,
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
  trimQuality(): { quality: number; advice: string; shifting: boolean } {
    const beta = this.physics?.beta ?? 0;
    let bestDrive = 0;
    let actualDrive = 0;
    let wantDelta = 0;
    let shifting = false;

    for (let i = 0; i < this.ship.state.sails.length; i++) {
      const sail = this.ship.state.sails[i];
      if (sail.set <= 0.02) continue;
      if (sail.shifting > 0) shifting = true;
      const profile = RIG_PROFILES[this.ship.hull.masts[i].rig];
      const want = optimalTrim(beta, profile);
      const area = this.ship.hull.masts[i].area * sail.set;
      bestDrive += Math.max(sailForce(10, beta, want, area, profile).drive, 0);
      actualDrive += Math.max(sailForce(10, beta, sail.trim, area, profile).drive, 0);
      wantDelta += (want - sail.trim) * area;
    }

    if (bestDrive <= 1e-6) {
      return { quality: 0, advice: this.ship.canvasSet < 0.02 ? 'No canvas set' : 'She will not draw on this heading', shifting };
    }
    const quality = clamp(actualDrive / bestDrive, 0, 1);
    const advice = shifting
      ? 'Sails coming across'
      : quality > 0.96
        ? 'Drawing well'
        : wantDelta > 0
          ? 'Ease the sheets  (E)'
          : 'Harden in  (Q)';
    return { quality, advice, shifting };
  }

  /** Bearing and distance to a charted port, as the pilot would work it out. */
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

  positionText(): { lat: string; lon: string; certainty: string } {
    const e = this.nav.estimated;
    const lonCertain = this.nav.sigmaLon < 25;
    return {
      lat: formatLat(e.lat),
      lon: formatLon(e.lon),
      certainty: lonCertain
        ? `± ${this.nav.sigmaLat.toFixed(0)}′ lat, ± ${this.nav.sigmaLon.toFixed(0)}′ lon`
        : `± ${this.nav.sigmaLat.toFixed(0)}′ lat; longitude is a guess`,
    };
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
    g.mode = 'sailing';
    g.lastLat = g.ship.state.pos.lat;
    g.refreshEnvironment();
    return g;
  }
}

export { KNOTS, portName };
