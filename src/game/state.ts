import { Clock, dateFromDays, formatDateAt } from '../core/clock';
import { counselFor, type Counsel } from './counsel';
import { characterOf } from '../world/portCharacter';
import {
  crisisFor, newDiplomacy, newPolityState, regardDelta, rulerName, spreadWord,
  type Agreement, type Deal, type DiplomacyState, type Verdict,
} from '../diplomacy/courts';
import { POLITIES, POLITY_BY_ID, polityOfPort, politiesOfPeople, type PolityDef } from '../diplomacy/polities';
import {
  ACT_CHARGE, chronicleAnswered, chronicleDue, chronicleFromProgress, hullAllowed, newChronicle, patentAllowed,
  type ChronicleState,
} from '../progression/chronicle';
import {
  QUESTS, dueScene, newQuest, offersAt, refreshQuestPrices, type QuestDef, type QuestId, type QuestState,
} from '../progression/quests';
import { newPassageRecord, passageQuestion, type PassageRecord } from './passage';
import { itczLatitude } from '../world/wind';
import {
  NM, angleDelta, atan2d, bearingTo, clamp, compassPoint, cosd, formatBearing, formatLat,
  formatLon, haversine, lerp, rhumbStep, sind, toENU, wrap180, wrap360, type LatLon,
} from '../core/math';
import { Rng } from '../core/rng';
import { Weather, type WeatherSample } from '../world/weather';
import { currentAt, dominantCurrentName, tidalStream, tideHeight } from '../world/currents';
import { LEAD_REACH_M, depthAt, isLand, nearestShore } from '../world/landmass';
import { PORTS, anchorageOf, portDef, portsNear, type PortDef } from '../world/ports';
import { people } from '../world/peoples';
import { Ship } from '../ship/ship';
import { HULL_CLASSES, hullClass } from '../ship/hull';
import { UPGRADE_BY_ID, movesWithTheFlag, tierCap } from '../ship/upgrades';
import {
  KNOTS, prudentCanvas, stepShip, type Environment, type ShipTuning, type StepResult,
} from '../ship/physics';
import {
  RIG_PROFILES, optimalTrim, pointOfSail, sailForce, tackName, trimBand,
} from '../ship/rig';
import { Navigator } from '../navigation/navigator';
import { Chart, seededError, sightingRangeNm, type SurveyResult } from '../navigation/charts';
import { sightOpportunities, type SightBody } from '../navigation/navigator';
import { magneticVariation } from '../navigation/celestial';
import {
  ableHands, crewFactor, enduranceDays, hasInterpreterFor, makeOfficer, newCrew, officerBonus, updateCrew,
  type CrewState, type Officer,
} from '../crew/crew';
import {
  NODE_BY_ID, SKILLS, addPractice, respec as respecSkillsOf, buyNode, levelsOf, migrateCaptain, newCaptainSkills, perksOf, skill,
  type CaptainSkills, type PerkId, type SkillId, type SkillSet,
} from '../crew/skills';
import { Markets, type Listing } from '../economy/market';
import {
  ANTWERP_DAYS, CASA_SHARE, CHEST_TONS, COMPETITION, LICENCE_YEARS, MONOPOLY, REGION_NAME, antwerpBid, antwerpWeight,
  bookTotals, currentBook, decayAntwerp, gradeWord, licenceCost, newTrade, newsDelayDays, paymentAt, portsInRegion,
  qualityAtSource, qualityFactor, regionOf, rollShocks, shockDef, worldMod,
  type Contract, type EntryKind, type PriceSheet, type Quote, type Region, type Shock, type ShockDef, type TradeState,
} from '../economy/trade';

/** A price at this port, as this ship will pay or be paid it. */
export interface TradeListing extends Listing {
  /** Before the coin discount and the Casa: what his goods are worth in barter. */
  rawAsk: number;
  rawBid: number;
  /** Sold in Lisbon to the Casa, at the King's price. */
  casa: boolean;
  /** The premium it carries when laid on the barter table here. */
  barter: number;
}
import { Crown, commissionPoints, portName, type Patent } from '../progression/crown';
import { ARCS, ARC_BY_ID, BONDS, dueBeat, type BondId } from '../progression/arcs';
import { newRelations, type Relations } from '../diplomacy/contact';
import {
  foragingParty, meetingParty, shorePlaceAt, waterParty, woodParty,
  type Hearsay, type LandingResult, type ShorePlace,
} from './shore';
import { Logbook, type LogKind } from './log';
import {
  Rutter, compass, regionKey, seaSentence, type Confidence, type Damage,
} from './rutter';
import { rollSeaEvent, type SeaEvent } from './seaEvents';
import {
  bestCourse, newSeaRecord, raiseASail, readOf, sailStranger, strangerThinks, trafficAt,
  type ChaseOrder, type SeaRecord, type Stranger,
} from './encounter';
import { hailScene } from './hailing';
import { newGale, newGaleRecord, rollGaleScene, type GaleRecord, type GaleState } from './gale';
import {
  pilotOnTheMonsoon, readMonsoon, setsAgainst, type MonsoonRead,
} from '../navigation/monsoon';
import {
  groundingOutlook, pilotOnTheTide, readTide, tideClock, type TideRead,
} from '../navigation/tides';
import {
  ERRAND_BY_ID, backingFor, journeyScene, newJourneyRecord, outfitCost,
  type Journey, type JourneyRecord,
} from '../progression/inland';
import { polarAt } from '../ship/polars';
import { newTutorial, stepTutorial, type TutorialState, type TutorialStep } from './tutorial';
import { rollOfficerEvent } from './officerEvents';
import { difficultyDef, type Difficulty, type DifficultyDef } from './difficulty';
import { checkLead, hearRumour, type Lead } from '../progression/leads';
import { featureNear, type CoastFeature } from '../world/features';
import { charterDays, daysLeft, offerVentures, ventureLine, type Venture } from '../progression/ventures';
import { advanceRival, newRival, rivalGossip, type RivalState } from '../progression/rival';
import { rollRivalMeeting } from '../progression/rivalEvents';
import { beyondScene, featureScene, landmarkScene } from './discovery';
import { castLead, landfallScene, type LeadCast } from './soundings';
import { mutinyScene } from './mutiny';
import { newCasa, rollCasaScene, type CasaState } from '../progression/casa';
import { TEMPER, aboardHands, musterHands, shiftAll, signOnHands, type Hand } from '../crew/hands';
import { originDef, type OriginId } from '../progression/origins';
import { assignTraits, wardroom, type TraitEffects } from '../progression/officers';
import { GOOD_BY_ID, good, unitOf } from '../economy/goods';
import {
  HOUSES, Ledger, cambioRate, ceilingFor, house, letraRate, quinhaoPrice, reaches,
  type Debt, type DebtKind, type House, type HouseId,
} from '../economy/finance';
import { rollFinanceScene } from './financeEvents';
import {
  WORK_BY_ID, capacityOf, garrisonWanted, runFactory, stockTons,
  type Feitoria, type WorkId,
} from '../progression/feitoria';
import { rollFeitoriaScene } from './feitoriaEvents';
import {
  closeIsleLeads, dirWord, hearOfIsland, historyCatchesUp, isleInSight, isleScene, newIsleState, readTheSea,
  searchRumours, type IsleState,
} from './farLand';
import { ISLES, landIndexOf, type OceanIsle } from '../world/isles';
import {
  assessDesign, hullFromDesign, polarTable, registerHull, tonsAllowed, buildDays, type ShipDesign,
} from '../ship/design';
import type { HullClass } from '../ship/hull';
import {
  HOLDING_BY_ID, ROUTE_BY_ID, monthOfEstate, newEstate, offerOutfits,
  type EstateState, type HoldingId,
} from '../progression/estate';

/**
 * Latitude of the deepest Portuguese penetration at the start of play.
 *
 * Diogo Cão's second padrão at Cape Cross, 1486. South of this the rutters stop.
 */
const BEYOND_LAT = -21.8;

export type GameMode =
  | 'sailing' | 'chart' | 'sight' | 'logbook' | 'crew' | 'port'
  | 'audience' | 'court' | 'shipyard' | 'menu' | 'title' | 'gameover' | 'orders' | 'epilogue'
  | 'voyages'
  | 'shore' | 'rutter';

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

/** Wall-clock milliseconds, wherever the environment keeps them. */
function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export interface Alert {
  id: number;
  text: string;
  severity: 'note' | 'warning' | 'grave';
  t: number;
  /**
   * When it was said, by the clock on the wall rather than the ship's.
   *
   * An alert is something the player reads, so it has to last long enough for a
   * player to read it and no longer — and that is a quantity in seconds of his
   * life, not in hours of the ship's. Expiring them on ship's time meant the
   * same line hung on screen for an hour and a half at the slow rates and
   * flickered past at the fast ones, which is exactly backwards.
   */
  said: number;
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
  /** The pilot's own book: what he has seen, been told, and guessed at. */
  rutter = new Rutter();
  crown: Crown;
  markets: Markets;
  /**
   * What the captain has bought, and what he has left to spend.
   *
   * The levels every system reads are derived from this rather than trained by
   * repetition: a captain who sails long enough used to end up good at
   * everything, which is the opposite of a build. Points come from voyages
   * completed, a career is about thirty of them, and a whole tree costs twelve.
   */
  captain: CaptainSkills = newCaptainSkills();
  /** Cached, because every physics step reads a level off it. */
  private skillCache: { taken: number; levels: SkillSet; perks: Set<PerkId> } | null = null;
  log = new Logbook();

  relations = new Map<string, Relations>();
  /** Ports the player has actually entered. */
  visitedPorts = new Set<string>();
  /** The career as five acts, and the history around it. See progression/chronicle. */
  chronicle: ChronicleState = newChronicle();

  /** The story beats due now: the chronicle first, then the quest lines. */
  checkStory(): void {
    this.refreshObjectives();
    const c = this.chronicle;
    // A scene put and since lost is put again.
    c.pending = c.pending.filter((id) => this.pendingEvent?.id === `chronicle:${id}`
      || this.pendingScenes.some((x) => x.id === `chronicle:${id}`));
    const s = chronicleDue(this, c);
    if (s) {
      this.easeTheClock(1);
      if (!this.pendingEvent) this.pendingEvent = s;
      else this.pendingScenes.push(s);
      return;
    }
    this.checkQuests();
  }

  /** Commissions the King will offer, in this act of the career. */
  commissionOffers() {
    const act = this.chronicle.act;
    // Act I's commission waits on the island voyage the pilot teaches; after
    // that, each act's own commission is always on the table.
    return this.crown.offers(this.clock.date.year, (title) => patentAllowed(act, title),
      act >= 2 ? ACT_CHARGE[act] : undefined);
  }

  /**
   * Commission objectives that are standing facts rather than events: leave to
   * trade with a people, a factory on their coast. A captain who already has
   * them when he takes the commission has them — the objective used to wait
   * for a first contact that had happened two voyages before.
   */
  refreshObjectives(): void {
    const p = this.crown.patent;
    if (!p || p.complete) return;
    for (const o of p.objectives) {
      if (o.complete || !o.target) continue;
      const ports = PORTS.filter((d) => d.people === o.target);
      if (o.kind === 'contact' && ports.some((d) => this.relations.get(d.id)?.mayTrade)) {
        o.complete = true; o.progress = 1;
      }
      if (o.kind === 'factory' && ports.some((d) => this.relations.get(d.id)?.factory
          || this.liveFactories.some((f) => f.portId === d.id))) {
        o.complete = true; o.progress = 1;
      }
    }
  }

  /** Hulls the yards will build, in this act. */
  hullsForSale() {
    return this.crown.availableHulls().filter((h) => hullAllowed(this.chronicle.act, h.id));
  }

  /** A rumour pointing at a real place, told by somebody in the story. */
  addLead(portId: string, text: string, source: string, errorNm: number, value: number): void {
    if (this.leads.some((l) => l.targetPort === portId) || this.chart.ports.has(portId)) return;
    const at = anchorageOf(portDef(portId));
    const off = errorNm * 0.6;
    const brg = this.rng.range(0, Math.PI * 2);
    this.leads.push({
      id: `l${this.nextLeadId++}`, kind: 'port', text, source,
      lat: at.lat + (off * Math.cos(brg)) / 60,
      lon: at.lon + (off * Math.sin(brg)) / 60 / Math.max(Math.cos((at.lat * Math.PI) / 180), 0.2),
      errorNm, targetPort: portId, value, heard: this.clock.t, followed: false, false: false,
    });
    this.logEvent('note', `${text} (${source})`, true);
  }

  /** The long stories. See progression/quests. */
  quests: QuestState[] = [];
  // -------------------------------------------------------------------------
  // The estate: money put to work while she is at sea. See progression/estate.
  // -------------------------------------------------------------------------

  estate: EstateState = newEstate(0);
  private estateRenown = 0;

  /** The name a holding goes by in a letter. */
  estatePlace(id: HoldingId): string {
    switch (id) {
      case 'casa': return 'The house on the Rua Nova';
      case 'quinta': return 'The quinta in the Alentejo';
      case 'engenho': return 'The engenho on Madeira';
      default: return this.estate.lordship ? `Your lordship of ${this.estate.lordship}` : 'Your lordship';
    }
  }

  /** A month at a time, on the ship's calendar, wherever she is. */
  private tickEstate(): void {
    const st = this.estate;
    if (st.lastMonthT <= 0) { st.lastMonthT = this.clock.t; return; }
    while (this.clock.t - st.lastMonthT >= 30 * 86400) {
      st.lastMonthT += 30 * 86400;
      monthOfEstate(st, this.rng, st.lastMonthT, (id) => this.estatePlace(id));
      for (const [id, level] of Object.entries(st.holdings) as [HoldingId, number][]) {
        this.estateRenown += (HOLDING_BY_ID.get(id)?.renown ?? 0) * (level > 0 ? 1 : 0) / 12;
      }
      const whole = Math.floor(this.estateRenown);
      if (whole > 0) {
        this.estateRenown -= whole;
        this.crown.standing += whole;
        this.crown.lifetimeStanding += whole;
      }
    }
  }

  /** In a Portuguese port the letters are read and the money is paid over. */
  private settleEstate(): void {
    this.tickEstate();
    const st = this.estate;
    for (const n of st.news) this.logEvent('trade', n, true);
    const had = st.news.length;
    st.news = [];
    if (st.accrued > 0) {
      const paid = Math.round(st.accrued);
      this.crown.gold += paid;
      st.accrued = 0;
      this.pushAlert(`Your affairs at home: ${paid} cruzados paid over${had ? `, and ${had} ${had === 1 ? 'letter' : 'letters'}` : ''}.`, 'note');
    } else if (had) {
      this.pushAlert(`${had} ${had === 1 ? 'letter' : 'letters'} about your affairs at home.`, 'note');
    }
  }

  /** Why a share in this voyage cannot be taken, or null. */
  outfitBlocked(offerId: string, share: number): string | null {
    const o = this.estate.offers.find((x) => x.id === offerId);
    if (!o) return 'That ship has sailed without you.';
    if (this.dockedAt !== 'lisboa') return 'Voyages are outfitted in Lisbon.';
    const stake = Math.round(o.ask * share);
    if (this.crown.gold < stake) return `Your share is ${stake} cruzados, and the purse will not run to it.`;
    return null;
  }

  /** Put money into another man's voyage. */
  outfitVoyage(offerId: string, share: number): string | null {
    const why = this.outfitBlocked(offerId, share);
    if (why) return why;
    const st = this.estate;
    const o = st.offers.find((x) => x.id === offerId)!;
    const r = ROUTE_BY_ID.get(o.route)!;
    o.stake = Math.round(o.ask * share);
    o.sailedT = this.clock.t;
    o.dueT = this.clock.t + r.months * 30 * 86400;
    this.crown.gold -= o.stake;
    st.offers = st.offers.filter((x) => x.id !== offerId);
    st.outfits.push(o);
    this.logEvent('trade', `Put ${o.stake} cruzados into the ${o.ship}, ${o.captain}, for ${r.name}. `
      + `She is due home in about ${r.months} months.`, true);
    return null;
  }

  /** The next level of a holding, and why it cannot be bought here, if it cannot. */
  holdingBlocked(id: HoldingId): string | null {
    const h = HOLDING_BY_ID.get(id)!;
    const level = this.estate.holdings[id] ?? 0;
    if (level >= h.cost.length) return 'You have all of it there is.';
    if (this.dockedAt !== h.where) return h.where === 'lisboa' ? 'This is bought in Lisbon.' : 'This is bought at Funchal, on Madeira.';
    if (this.chronicle.act < h.act) return 'Nobody is selling, yet.';
    if (this.crown.lifetimeStanding < h.standing) return `Wants ${h.standing} renown behind the name.`;
    if (id === 'senhorio' && !this.estate.holdings.quinta) return 'The King grants lordships to men who already hold land.';
    const cost = h.cost[level];
    if (this.crown.gold < cost) return `${cost} cruzados, and the purse will not run to it.`;
    return null;
  }

  buyHolding(id: HoldingId): string | null {
    const why = this.holdingBlocked(id);
    if (why) return why;
    const h = HOLDING_BY_ID.get(id)!;
    const level = this.estate.holdings[id] ?? 0;
    const cost = h.cost[level];
    this.crown.gold -= cost;
    this.estate.holdings[id] = level + 1;
    if (id === 'senhorio') {
      const towns = ['Alvito', 'Vila Nova de Portimão', 'Sortelha', 'Ferreira de Aves', 'Castelo Rodrigo', 'Tentúgal'];
      this.estate.lordship = this.rng.pick(towns);
      this.crown.standing += 80;
      this.crown.lifetimeStanding += 80;
      this.logEvent('crown', `By the King's letters you are Senhor de ${this.estate.lordship}, with its rents and its gallows, `
        + `for ${cost} cruzados and a great deal of kneeling.`, true);
    } else {
      this.logEvent('trade', `${level ? 'Enlarged' : 'Bought'} ${h.english.toLowerCase()} for ${cost} cruzados.`, true);
    }
    return null;
  }

  /** Talk overheard that opens a secret thread. See quests: "The Biscayan's Ship". */
  secretsHeard: string[] = [];
  private lastQuestCheck = -1e9;

  /** Threads somebody here would put to the captain. */
  questOffersHere(): QuestDef[] {
    return this.dockedAt ? offersAt(this, this.dockedAt) : [];
  }

  /** Take a thread up. Its first beat plays at once if it belongs here. */
  acceptQuest(id: QuestId): string {
    if (this.quests.some((q) => q.id === id)) return 'Already taken up.';
    this.quests.push(newQuest(id, this.clock.t));
    this.logEvent('crown', `Took up: ${QUESTS[id].title}. ${QUESTS[id].blurb}`, true);
    this.checkQuests();
    return `${QUESTS[id].title} — in the Book, under Missions.`;
  }

  /** Put whichever quest beat is due. In port, straight onto the screen. */
  checkQuests(): void {
    // A beat that was put and has since vanished — dropped from the queue by
    // a port call, a lost ship, anything — is put again rather than leaving
    // the whole story waiting on a card nobody will ever see.
    for (const q of this.quests) {
      if (!q.fired || q.outcome) continue;
      const id = `quest:${q.id}:${q.step}`;
      if (this.pendingEvent?.id !== id && !this.pendingScenes.some((x) => x.id === id)) q.fired = false;
    }
    const s = dueScene(this, this.dockedAt);
    if (!s) return;
    this.easeTheClock(1);
    if (!this.pendingEvent) this.pendingEvent = s;
    else this.pendingScenes.push(s);
  }

  /** Errands done for towns. See world/portCharacter. */
  portQuestsDone = new Set<string>();

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

  /** Everything owed on the Rua Nova, and what the houses there think of you. */
  finance = new Ledger(0);
  /** Houses that have already made their one proposition, so it stays an event. */
  propositionsSeen: HouseId[] = [];

  /** The stations: sheds on beaches that go on trading while you are elsewhere. */
  feitorias: Feitoria[] = [];
  /** Letters already delivered, so the same one does not overtake you twice. */
  lettersSeen: string[] = [];

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

  /**
   * How far to one side of the mark she is deliberately being steered, in
   * nautical miles. Positive is north of it.
   *
   * The great technique of the age, and the game had no way to express it.
   * Longitude cannot be measured, so a captain steering straight for a harbour
   * raises the coast not knowing whether he is north or south of it, and has a
   * coin-flip and possibly a fortnight of beating the wrong way along a lee
   * shore. So he does not steer for the harbour. He steers thirty miles up the
   * coast of it on purpose, and when the land comes up he knows, with
   * certainty, which way to turn.
   *
   * It costs the extra distance, and it converts an unsolvable two-dimensional
   * problem into a solvable one-dimensional one, which is exactly the trade the
   * period actually made.
   */
  aimOffNm = 0;

  /** The point she is really being steered at, with the offing applied. */
  get aimedMark(): { name: string; lat: number; lon: number } | null {
    const d = this.destination;
    if (!d) return null;
    if (Math.abs(this.aimOffNm) < 0.5) return d;
    return { name: d.name, lat: d.lat + this.aimOffNm / 60, lon: d.lon };
  }

  /**
   * Which way to run along the coast once it is raised, and how sure of it.
   *
   * A captain who aimed off knows. One who steered straight at it is guessing,
   * and the guess is only as good as his longitude — which is to say not good
   * at all after three weeks of blue water.
   */
  landfallAdvice(): { text: string; sure: boolean } | null {
    const d = this.destination;
    if (!d) return null;
    if (Math.abs(this.aimOffNm) < 0.5) {
      return {
        sure: false,
        text: `You steered straight for ${d.name}. The coast is up, and whether she lies north or `
          + 'south of us from here is a question the reckoning cannot answer to better than '
          + `${this.nav.sigmaLon.toFixed(0)} miles. Somebody has to choose.`,
      };
    }
    const north = this.aimOffNm > 0;
    return {
      sure: true,
      text: `You laid the course ${Math.abs(this.aimOffNm).toFixed(0)} miles to the `
        + `${north ? 'north' : 'south'} of ${d.name} on purpose. The coast is up, so ${d.name} is `
        + `to the ${north ? 'south' : 'north'} of us. Put the helm over and run down along it.`,
    };
  }

  /**
   * The real town, if the lookout can see it: within the sighting range and no
   * more than fifteen miles off, which is as far as a town is a thing to steer
   * at rather than a smudge on a coast.
   */
  townInSight(portId: string): LatLon | null {
    const at = anchorageOf(portDef(portId));
    const range = Math.min(15, sightingRangeNm(this.ship.mastHeight, this.weatherNow.visibility));
    return haversine(this.ship.state.pos, at) / NM <= range ? at : null;
  }

  /**
   * The set the pilot allows for, here and now.
   *
   * A current he knows about is laid off on the board like leeway: the Casa's
   * roteiros have the great currents of the coast it has sailed for sixty years
   * (the Guinea current, the Canaries current), and his own book has whatever
   * he has measured himself, square by square and month by month. Where he
   * knows nothing, he allows nothing, and the water carries the board's error.
   * Without this a ship beating west out of Mina against a current running
   * east faster than she sailed reckoned herself fifty miles a day to the
   * westward while she was being set backwards along the coast.
   */
  private allowedSet(pos: LatLon): { toward: number; knots: number } | null {
    const month = this.clock.date.month;
    const skillK = 0.75 + skill(this.effectiveSkill, 'navegacao') * 0.25;
    let best: { toward: number; knots: number } | null = null;
    let weight = 0;
    const book = this.rutter.seaFor(this.nav.estimated, month);
    if (book && book.currentKnots > 0.1) {
      weight = clamp(book.hours / 30, 0, 1) * 0.85;
      best = { toward: book.currentToward, knots: book.currentKnots };
    }
    // The Casa's pilots had worked the whole Gulf of Guinea to São Tomé and the
    // line by 1482, and its set was the first thing their roteiros said.
    const casa = !this.beyondTheKnownAt(pos) || (pos.lat > -2 && pos.lon > -25 && pos.lon < 12);
    if (casa && weight < 0.8) {
      const c = currentAt(pos, this.clock.dayOfYear);
      if (c.knots > 0.1) { weight = 0.8; best = c; }
    }
    if (!best || weight <= 0) return null;
    if (this.can('setAndDrift')) weight = Math.min(1, weight + 0.18);
    return { toward: best.toward, knots: best.knots * weight * skillK };
  }

  private lastBearingsT = 0;

  /**
   * Coasting: with charted land in sight the pilot takes bearings of the
   * headlands every watch and puts the ship where his chart says those
   * bearings cross. It is as good as the chart and no better — a fix onto the
   * paper, not onto the world — and it is how a ship running along a known
   * coast keeps her board honest without a sight.
   */
  private takeBearings(pos: LatLon): void {
    const instinct = this.can('pilotsInstinct');
    if (this.clock.t - this.lastBearingsT < (instinct ? 2 : 4) * 3600) return;
    const range = sightingRangeNm(this.ship.mastHeight, this.weatherNow.visibility);
    const off = this.sounding.shoreDistNm;
    if (off > range * (instinct ? 1 : 0.85) || off < 0.3) return;
    // Something on the paper to take bearings of: coast charted before today.
    if (!this.chart.knewCoastNear(pos, Math.min(range, 30), this.clock.t - 3600)) return;
    const shift = this.chart.localOffset(pos, 90);
    if (!shift) return;
    this.lastBearingsT = this.clock.t;
    const at = { lat: pos.lat + shift.dLat, lon: wrap180(pos.lon + shift.dLon) };
    const sigma = (1.5 + off * 0.08 + (1.3 - skill(this.effectiveSkill, 'navegacao')) * 1.5) * (instinct ? 0.5 : 1);
    const moved = this.nav.applyBearings(at, sigma, this.clock.t);
    if (moved > 15) {
      this.logEvent('navigation',
        `Bearings on the land put her ${moved.toFixed(0)} miles from where the board had her. The pilot moves the board, and says something about the set of the water.`, true);
    }
  }

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
   * Running down the latitude.
   *
   * The technique the whole century actually navigated a landfall by, and the
   * one the aiming-off system does not replace: aiming off still steers for a
   * point fixed by longitude, which is a guess dressed up as a plan. This
   * throws longitude away entirely. Run north or south to the latitude of
   * where you are bound, well clear of the coast so a bad noon sight does not
   * put you ashore, then hold that parallel — by the sun each day, nothing
   * else — making easting or westing until the coast comes up under the bow.
   * There is no doubt to resolve at the landfall, because there is no
   * question: the parallel runs to the place.
   *
   * What it costs is the dogleg down to the latitude, whatever a current sets
   * you off the parallel between sights, and the fact that it is *slower* to
   * correct than steering direct — a ship days off her latitude corrects
   * gently rather than turning square onto it, because turning square would
   * throw away all the easting or westing she is making at the same time.
   */
  latitudeOrder: { lat: number; eastward: boolean; startLon?: number } | null = null;

  /**
   * The strange sail, if there is one in sight. See game/encounter.
   *
   * At most one at a time, on purpose. Two sails on the horizon is a fleet
   * action and this is not that game; one sail is a question, and a question is
   * what the long passages are short of.
   */
  encounter: Stranger | null = null;
  /** What the watch have been told to do about her. */
  chaseOrder: ChaseOrder = 'hold';
  /** What a career of meetings at sea came to. See encounter/SeaRecord. */
  seaRecord: SeaRecord = newSeaRecord();

  /** Men sent away from the sea. See progression/inland. */
  journeys: Journey[] = [];
  journeyRecord: JourneyRecord = newJourneyRecord();
  private nextJourneyId = 1;
  /** Ports whose inland road has been opened, which deepens their market. */
  inlandRoads = new Set<string>();

  /** The blow she is in, and what a career of them came to. See game/gale. */
  gale: GaleState = newGale();
  galeRecord: GaleRecord = newGaleRecord();
  /** Days since the last sail was raised, so they do not come in pairs. */
  private daysSinceSail = 3;

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
   * The course she keeps when nothing else is ordered and no mark is laid.
   *
   * There is exactly one way to steer this ship: you give a course and the
   * watch hold it. There used to be two — below a quarter of an hour to the
   * second you held the rudder over yourself, above it you conned her by course
   * — and the game swapped between them silently on the clock rate, so the same
   * two keys did two different things depending on a number in the corner of
   * the screen, and touching them at the wrong moment took the ship off the
   * watch without the player knowing why she had started wandering.
   *
   * A captain does not steer. He says "north-north-west" and somebody else
   * stands at the wheel for six hours. That is the whole of the model now.
   */
  private standingCourse: number | null = null;

  /** Simulated seconds when she dropped down the Tagus, for the epilogue. */
  startT = 0;

  private accumDays = 0;
  /** Furthest south she has ever been, which is how a captain is measured. */
  private deepestSouth = 90;
  /** Set once she has been south of everything anyone out of Lisbon has seen. */
  private passedTheKnown = false;
  /** Whether the lead had bottom last tick, so the shoaling cry is given once. */
  private wasShoaling = false;
  /**
   * Scenes waiting to be put to the captain.
   *
   * A landfall can raise a landmark and pass the edge of the known world in the
   * same step, and two decision windows arriving on the same frame means the
   * second one is never seen. They queue, and are handed out one at a time as
   * the previous one is answered.
   */
  private pendingScenes: SeaEvent[] = [];
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
  /** When each of the passage questions was last put. See game/passage. */
  passageRecord: PassageRecord = newPassageRecord();
  private lastPassageCheck = -1e9;
  /** When each port was last compared with what the book already said. */
  private lastRemembered = new Map<string, number>();
  /** When the sea was last written up, so the book is not scribbled in hourly. */
  private lastSeaWrite = -1e9;
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

  /**
   * Which career this is, so each one keeps its own autosave and a new game
   * can never write over another. Minted once, carried in the save.
   */
  careerId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

  constructor(seed = Math.floor(Math.random() * 1e9)) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.clock = new Clock({ year: 1482, month: 7, day: 12 });

    const start = anchorageOf(portDef('lisboa'));
    this.weather = new Weather(seed);
    this.ship = new Ship('São Cristóvão', 'caravela-latina', start, 200);
    this.crew = newCrew(hullClass('caravela-latina').crewFull, this.rng);
    this.nav = new Navigator(start, seed);
    this.wireNavigator();
    this.chart = new Chart();
    this.crown = new Crown(seed);
    this.markets = new Markets(seed);
    this.markets.adjust = (p, gid, t) => this.worldAdjust(p, gid, t);
    this.trade = newTrade(this.clock.t);
    this.rival = newRival(this.rng);
    this.rival.lastNews = this.clock.t;
    // She begins at a quay, which is as much in sight of land as it gets.
    this.lastLandSeenT = this.clock.t;
    this.hands = musterHands(this.rng);
    this.shipTheCompany();
    assignTraits(this.crew, this.rng);
    this.setQuintaladas(this.trade.quintaladas);

    for (const p of PORTS) {
      const pe = people(p.people);
      const rel = newRelations(pe);
      if (p.people === 'portuguese') { rel.met = true; rel.mayTrade = true; rel.regard = 1; }
      this.relations.set(p.id, rel);
    }

    this.dockedAt = 'lisboa';
    this.anchored = true;
    this.visitedPorts.add('lisboa');
    this.crown.padraoStock = Math.max(this.crown.padraoStock, 3);
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

  /** The captain's own levels, from the tree. */
  get skills(): SkillSet {
    this.refreshSkillCache();
    return this.skillCache!.levels;
  }

  /** The discrete things this captain can do that another cannot. */
  get perks(): Set<PerkId> {
    this.refreshSkillCache();
    return this.skillCache!.perks;
  }

  /**
   * What a discharged commission taught the captain.
   *
   * Points come from *finishing the thing you undertook to do* \u2014 not from
   * sailing, not from taking sights, and not from casting off and coming back.
   * A voyage-for-returning award turns the strongest build into whoever was
   * willing to bounce off Funchal the most times, and none of those trips is a
   * decision: the interesting captain is the one who took a hard commission and
   * got it discharged.
   *
   * Size matters because the commissions are a ladder. The Madeira sugar run is
   * a fortnight of fair wind; the one that opens the route to India is two
   * years and most of a career's nerve, and they cannot be worth the same.
   */
  awardCommission(patent: Patent, beyondTheContract: number): number {
    const base = commissionPoints(patent.standingReward);
    // One more for coming home with something the Crown never asked for.
    //
    // Counted in new places and new peoples only \u2014 not in capes you named or
    // pillars you set up, both of which a patient captain can manufacture by
    // running twelve miles down a coast and doing it again. There is a fixed
    // number of ports and peoples on the map, so this is bounded by the world
    // rather than by patience, which is the whole point.
    const bonus = beyondTheContract >= 2 ? 1 : 0;
    const points = base + bonus;

    // Reporting at court ends the passage, so the passage's tally starts again.
    // Called after sellCharts(), which is paid on it.
    this.chartedThisPassage = 0;
    this.correctedNm = 0;
    this.captain.points += points;

    this.logEvent('crown',
      `"${patent.title}" is discharged and entered at the Casa. ${points} points to spend on `
      + `yourself` + (bonus > 0
        ? `, one of them for the ${beyondTheContract} places and peoples you brought home that `
          + 'nobody asked you for.'
        : '.'), true);
    this.pushAlert(
      `${points} skill points. ${this.captain.points} unspent \u2014 the book, under Captain.`, 'note');
    return points;
  }

  can(perk: PerkId): boolean {
    return this.perks.has(perk);
  }

  /**
   * What doing a thing teaches: a point now and then in the discipline, to a
   * cap, for the captain who actually works at it.
   */
  practise(tree: SkillId, amount: number): void {
    const got = addPractice(this.captain, tree, amount);
    if (got > 0) {
      const name = SKILLS.find((x) => x.id === tree)?.english ?? tree;
      this.logEvent('crown', `Practice has made you better at ${name.toLowerCase()}: ${got} point${got === 1 ? '' : 's'} to spend.`, true);
      this.pushAlert(`${name}: +${got} point from practice.`, 'note');
    }
  }

  /**
   * How the court reads your voyage, which depends on what kind of man you are.
   *
   * The Crown's man takes half again in renown and rather less in coin; the
   * chart-seller the reverse. Renown buys hulls, better commissions and a title;
   * coin buys cargo and upgrades. Neither is the strong choice, which is what
   * lets a player build round either.
   */
  get settlementBias(): { standing: number; gold: number } {
    // A man starting from further back is worth more to himself for the same
    // service, because the same service moves him further.
    const k = this.standingScale;
    // The contador writes the figure. What he thinks of you is worth about as
    // much as a skill node, which is the point of him.
    const c = this.casa;
    const casaGold = c.pact ? 1.15 : c.regard < -0.3 ? 0.9 : 1;
    const casaStanding = c.patron ? 1.15 : c.broke ? 0.92 : 1;
    const b = this.can('cosmographer') ? { standing: 1.7 * k, gold: 1.35 }
      : this.can('crownsMan') ? { standing: 1.6 * k, gold: 0.75 }
        : this.can('sheetTrade') ? { standing: 0.8 * k, gold: 1.5 }
          : { standing: k, gold: 1 };
    return { standing: b.standing * casaStanding, gold: b.gold * casaGold };
  }

  /**
   * The private trade in sheets, paid on reporting and then reset.
   *
   * Only the man who took that fork has copies to sell — but what they are
   * worth is the coast he actually ran, so this pays for surveying rather than
   * for owning the node.
   */
  sellCharts(): number {
    if (!this.can('sheetTrade') && !this.can('cosmographer') && !this.has('theDraughtsman')) return 0;
    const rate = (this.can('cosmographer') ? 2.6 : 1.7)
      * (this.can('casaClerks') ? 1.25 : 1) * (this.can('secretChart') ? 2 : 1)
      * (this.has('theDraughtsman') ? 1.5 : 1)
      // A new Christian selling the Crown's charts out of the back door is not
      // doing the same thing a fidalgo is doing, and the file says so.
      * (originDef(this.origin).watched ? 0.6 : 1);
    return Math.round((this.chartedThisPassage + this.correctedNm * 0.6) * rate);
  }

  /**
   * What the houses will lend you, over and above what is in the purse.
   *
   * Credit lends against the cargo, so it is worth most to a captain who is
   * already loaded and nothing at all to one who is not — the merchant's road.
   * Merchant prince lends against your name, so it is worth most to a captain
   * with renown, and it is what lets him fit out a voyage the Crown never asked
   * for.
   */
  get creditLimit(): number {
    let limit = 0;
    // The Casa victualled the ship.
    //
    // A captain carrying the King's commission was not a private trader
    // risking his own money: the Casa da Mina had fitted him out, wanted its
    // voyage finished, and would advance against a reward it was already
    // committed to paying. Without that floor a captain who spent his purse and
    // lost his cargo had no way at all to buy the thirty days of water it takes
    // to get anywhere — no credit, nothing to sell, and a hold he could not
    // fill. It is a small line, deliberately: enough to victual her and get her
    // home, nowhere near enough to trade on, and it is gone the moment the
    // commission is discharged.
    const p = this.crown.patent;
    if (p && !p.complete && !p.failed) limit += Math.round(p.reward * 0.4) + 90;
    if (this.can('credit')) limit += this.ship.manifestValue() * 0.8 + 120;
    if (this.can('ownAccount')) limit += 400 + this.crown.lifetimeStanding * 3;
    return Math.round(limit);
  }

  get creditFree(): number {
    return Math.max(0, this.creditLimit - this.crown.debt);
  }

  /** Draw against credit so the purse holds at least `need`. Returns what was drawn. */
  drawCredit(need: number): number {
    const short = need - this.crown.gold;
    if (short <= 0) return 0;
    const draw = Math.min(short, this.creditFree);
    if (draw <= 0.5) return 0;
    this.crown.gold += draw;
    this.crown.debt += draw;
    this.logEvent('trade',
      `${Math.round(draw)} cruzados drawn on credit. You owe ${Math.round(this.crown.debt)}, and it is `
      + 'owed whether the cargo comes home or not.');
    return draw;
  }

  // -------------------------------------------------------------------------
  // The Rua Nova
  // -------------------------------------------------------------------------

  /**
   * How dangerous the money thinks this voyage is, 0 to 1.
   *
   * The lender prices the route, not the captain, which is why a câmbio for
   * the Cape costs three times one for Madeira however well he knows you. The
   * three things that actually killed ships are in it: how far south she is
   * going, how far from anywhere the passage runs, and the state of the hull
   * she is going in.
   */
  voyageRisk(): number {
    const p = this.crown.patent;
    let far = 0;
    if (p?.returnTo) {
      // The furthest thing the commission names is what the money is looking at.
      for (const o of p.objectives) {
        const target = PORTS.find((x) => x.id === o.target);
        if (target) far = Math.max(far, Math.abs(target.lat - 38.7) + Math.abs(target.lon + 9.2) * 0.4);
      }
    }
    const dest = this.destination;
    if (dest) far = Math.max(far, Math.abs(dest.lat - 38.7) + Math.abs(dest.lon + 9.2) * 0.4);
    // Where she already is counts too: a man raising money at Mina is not
    // planning a coastal hop, whatever he says.
    far = Math.max(far, Math.abs(this.ship.state.pos.lat - 38.7));
    const hull = 1 - clamp(this.ship.condition.hull, 0.3, 1);
    return clamp(far / 68 + hull * 0.3, 0.05, 1);
  }

  /**
   * What a house thinks the voyage in hand will land, for pricing sixteenths.
   *
   * Deliberately generous to the *ship* and not to the captain: they are
   * valuing a hull, a commission and a hold, because that is all they can see.
   * A captain who knows a trade they do not can sell sixteenths cheaply and
   * keep the difference, which is the only way to win at this instrument.
   */
  voyageValue(): number {
    const p = this.crown.patent;
    const commission = p && !p.complete && !p.failed ? p.reward : 0;
    const hold = this.ship.holdCapacity * 34;
    // And who is sailing her, a little. Not because they trust him — that is
    // what credit is for, and it is priced separately — but because a voyage
    // under a man with a name on this coast is worth more than the same hull
    // under a man without one, and they know it.
    const name = this.crown.lifetimeStanding * 1.4;
    return Math.round(commission + hold + name + this.ship.manifestValue() * 0.5 + 120);
  }

  houseReaches(h: House, def: PortDef): boolean {
    return reaches(h, def);
  }

  /** Terms this house will put on the table here, right now. */
  termsFor(h: House, kind: DebtKind): { max: number; rate: number; days: number; barred: string | null } {
    const credit = this.finance.credit[h.id];
    const out = this.finance.owedTo(h.id);
    const room = Math.max(0, ceilingFor(h, credit) - out);
    const days = kind === 'cambio' ? 240 : 150;
    const barred = credit < h.floor ? h.refusal
      : !this.portHere || !this.houseReaches(h, this.portHere)
        ? `${h.short} has no man in this town.`
        : kind !== 'quinhao' && room < 25
          ? `They have ${Math.round(out)} cruzados out with you already.`
          : null;
    return {
      max: Math.round(room),
      rate: kind === 'cambio' ? cambioRate(h, this.voyageRisk(), credit)
        : kind === 'letra' ? letraRate(h, credit, days) : 0,
      days, barred,
    };
  }

  /** Take money from a house. Returns what goes on the screen. */
  borrow(id: HouseId, kind: DebtKind, amount: number): string {
    const h = house(id);
    const terms = this.termsFor(h, kind);
    if (terms.barred) return terms.barred;
    const sum = Math.round(clamp(amount, 1, terms.max));
    if (sum < 1) return 'There is no room left on that account.';
    this.crown.gold += sum;
    const owed = Math.round(sum * (1 + terms.rate));
    this.finance.strike({
      house: id, kind, principal: sum, owed, rate: terms.rate,
      dueBy: this.clock.t + terms.days * 86400, struck: this.clock.t,
      sixteenths: 0, share: 0,
      atPort: this.dockedAt ?? 'lisboa',
      voyage: this.crown.patent && !this.crown.patent.complete
        ? this.crown.patent.title : 'the voyage in hand',
    });
    this.logEvent('trade',
      `Drew ${sum} cruzados of ${h.name} on a ${kind === 'cambio' ? 'câmbio marítimo' : 'letra'} `
      + `at ${(terms.rate * 100).toFixed(0)} per cent, ${owed} to be repaid inside ${terms.days} days.`
      + (kind === 'cambio'
        ? ' If she does not come home the debt goes down with her, which is what the premium is for.'
        : ' It is owed whatever becomes of the ship.'), true);
    return `${sum} cruzados. ${owed} falls due in ${terms.days} days.`;
  }

  /**
   * Sell sixteenths of the voyage.
   *
   * The one instrument with no date on it and nothing ever to repay — and the
   * only one that can take money off you for the rest of a career, because the
   * share comes off every sale until the account is discharged.
   */
  sellSixteenths(id: HouseId, n: number): string {
    const h = house(id);
    if (!h.writes.includes('quinhao')) return `${h.short} does not buy shares in voyages.`;
    const credit = this.finance.credit[h.id];
    if (credit < h.floor) return h.refusal;
    if (!this.portHere || !this.houseReaches(h, this.portHere)) {
      return `${h.short} has no man in this town.`;
    }
    const held = this.finance.live.reduce((s, d) => s + d.sixteenths, 0);
    const take = Math.round(clamp(n, 1, 12 - held));
    if (take < 1) return 'There are not enough sixteenths left unsold to be worth anybody’s while.';
    const price = quinhaoPrice(h, take, this.voyageValue(), credit);
    this.crown.gold += price;
    this.finance.strike({
      house: id, kind: 'quinhao', principal: price, owed: 0, rate: 0,
      dueBy: this.clock.t + 540 * 86400, struck: this.clock.t,
      sixteenths: take, share: take / 16,
      atPort: this.dockedAt ?? 'lisboa', voyage: 'the voyage in hand',
    });
    this.finance.regard(id, 2, 0);
    this.logEvent('trade',
      `Sold ${take} sixteenths of the voyage to ${h.name} for ${price} cruzados. There is nothing `
      + `to repay and never will be; instead his man takes ${((take / 16) * 100).toFixed(0)} per cent `
      + 'of everything landed until the account is closed.', true);
    return `${price} cruzados for ${take} sixteenths. They take `
      + `${((take / 16) * 100).toFixed(0)}% of everything you land.`;
  }

  /** Pay off a bill, in whole or in part. */
  repayDebt(debtId: string, amount?: number): string {
    const d = this.finance.find(debtId);
    if (!d || d.settled) return 'That paper is already discharged.';
    const h = house(d.house);
    const due = d.owed - d.seized;
    const want = Math.round(clamp(amount ?? due, 1, due));
    const paid = Math.min(want, this.crown.gold + this.creditFree);
    if (paid < 1) return 'There is nothing in the purse and nothing to draw on.';
    if (this.crown.gold < paid) this.drawCredit(paid);
    this.crown.gold -= paid;
    this.finance.repaid += paid;
    d.seized += paid;
    if (d.seized >= d.owed - 1) {
      d.settled = true;
      d.outcome = 'paid';
      const late = this.clock.t > d.dueBy;
      this.finance.regard(d.house, late ? 5 : 11);
      this.logEvent('trade',
        `Discharged ${h.name}’s paper with ${paid} cruzados${late ? ', late' : ', inside the date'}. `
        + 'The bill came back with the seal cut off it.', true);
      return `Paid in full. ${h.short} has cut the seal off the bill.`;
    }
    return `Paid ${paid}. ${Math.round(d.owed - d.seized)} still stands.`;
  }

  /**
   * The sharers' cut of money coming aboard.
   *
   * Called at the two places money actually arrives — the quay when cargo is
   * sold, and the Casa when a commission is settled. Returns what was taken so
   * the caller can say so, because a fifth of a good cargo disappearing without
   * a word would read as a bug.
   */
  takeShares(amount: number): number {
    const took = this.finance.takeShare(amount);
    if (took > 0.5) this.crown.gold -= took;
    return took;
  }

  /**
   * Cargo carried up the quay against a debt.
   *
   * Valued as this town values it rather than at Lisbon prices, because the
   * factor is selling it here — which is why being attached at a poor port
   * costs far more cargo than being attached at a rich one.
   */
  attachCargo(value: number): number {
    if (value <= 0) return 0;
    const def = this.portHere;
    let want = value;
    let got = 0;
    const lots = this.ship.cargo.slice().sort((a, b) => b.quantity * good(b.goodId).lisbon
      - a.quantity * good(a.goodId).lisbon);
    for (const lot of lots) {
      if (want <= 0.5) break;
      const gd = good(lot.goodId);
      const rel = def ? this.relationsFor(def.id) : null;
      const listing = def
        ? this.markets.listings(def.id, this.clock.t, rel?.regard ?? 0.5, 0.6)
          .find((x) => x.goodId === lot.goodId)
        : undefined;
      const per = listing && listing.bid > 0 ? listing.bid : gd.lisbon * 0.55;
      const units = Math.min(lot.quantity, want / Math.max(per, 0.01));
      this.ship.removeCargo(lot.goodId, units);
      want -= units * per;
      got += units * per;
    }
    if (got > 0) this.crown.syncCargoObjectives((id) => this.ship.quantityOf(id));
    return Math.round(got);
  }

  /**
   * Give the house the ship rather than be entered in the bad book.
   *
   * She is replaced with the meanest hull a yard will hand over, because a
   * captain with no ship is not a game state this simulation has anywhere to
   * put — and because that is what actually happened: a man who lost a ship
   * went back to sea in somebody's worn-out caravel and started again.
   */
  surrenderShip(d: Debt): string {
    const h = house(d.house);
    const worth = this.tradeInValue();
    const owed = d.owed - d.seized;
    d.settled = true;
    d.outcome = worth >= owed ? 'paid' : 'defaulted';
    this.finance.repaid += Math.min(worth, owed);
    if (worth < owed) {
      this.finance.defaults += 1;
      this.finance.regard(d.house, -14, 0.5);
    } else {
      this.finance.regard(d.house, -3, 0.2);
    }

    const cheapest = HULL_CLASSES.reduce((a, b) => (a.cost <= b.cost ? a : b));
    const old = this.ship;
    const next = new Ship(old.name, cheapest.id, old.state.pos, old.state.heading);
    let carried = 0;
    for (const lot of old.cargo) {
      const gd = good(lot.goodId);
      if (next.holdFree < lot.quantity * gd.bulk) continue;
      next.addCargo(lot.goodId, lot.quantity, lot.cost);
      carried += 1;
    }
    next.condition.hull = Math.min(old.condition.hull, 0.72);
    this.ship = next;
    this.crew.complement = cheapest.crewFull;
    this.crew.count = Math.min(this.crew.count, cheapest.crewFull);
    this.refreshEnvironment();
    this.crew.morale = clamp(this.crew.morale - 0.2, 0, 1);

    this.logEvent('crown',
      `Signed the ship over to ${h.name} against ${Math.round(owed)} cruzados. The yard has `
      + `handed you a ${cheapest.name} that has been round the Bojador twice and looks it. `
      + (carried > 0 ? 'What would stow has been shifted across; the rest went with her.'
        : 'Everything in the hold went with her.'), true);
    return `She is his. You have a ${cheapest.name} instead, and no debt to ${h.short}.`;
  }

  /**
   * Bills running, and the houses' opinion of you drifting back to neutral.
   *
   * Credit recovers very slowly on its own and only towards the middle: a man
   * nobody has heard of for two years is neither trusted nor distrusted, and a
   * reputation that decayed to nothing would make a default free after a long
   * enough voyage.
   */
  private checkFinance(days: number): void {
    if (days <= 0) return;
    this.finance.accrue(this.clock.t, days);
    for (const d of this.finance.live) {
      if (d.kind !== 'quinhao') continue;
      if (this.clock.t < d.dueBy) continue;
      d.settled = true;
      d.outcome = 'expired';
      this.logEvent('trade',
        `${house(d.house).name}’s sixteenths are discharged. He put in ${Math.round(d.principal)} `
        + `cruzados and took ${Math.round(d.drawn)} out, and neither of you has any further claim `
        + 'on the other.', true);
    }
    const drift = days * 0.012;
    for (const h of HOUSES) {
      const c = this.finance.credit[h.id];
      if (this.finance.owedTo(h.id) > 0) continue;
      this.finance.credit[h.id] = Math.round(clamp(c + Math.sign(45 - c) * drift, 0, 100));
    }
  }

  /**
   * What other ports are paying, for a captain who keeps a factor's notes.
   *
   * Only ports you have actually traded at, and only the ones your own book
   * covers — this is not an oracle, it is the correspondence a merchant of the
   * period really had, and it is stale by however long the passage takes.
   */
  distantQuotes(goodId: string, exclude: string): { port: string; bid: number; days: number }[] {
    return this.knownQuotes(goodId, exclude)
      .filter((q) => q.bid > 0 && q.wanted)
      .map((q) => ({ port: q.port, bid: q.bid, days: q.days }))
      .sort((a, b) => b.bid - a.bid).slice(0, 4);
  }


  /**
   * A bond struck with one of the written officers.
   *
   * Bonds sit alongside the captain's own perks and are earned a completely
   * different way: not by spending points on yourself but by carrying one man's
   * story to its end. A captain who never looks at his officers can fill his
   * skill trees and will never hold one of these; a captain who does can reach
   * parts of the game the trees do not cover. They survive the man — what he
   * taught you does not go ashore when he does — which is why the effect is
   * held here and not on the officer.
   */
  bonds = new Set<BondId>();

  /**
   * The men forward the captain knows by name. See crew/hands.
   *
   * A handful out of the complement, not all of them — which is honest, and
   * which is what makes a death among them land rather than decrement a
   * counter.
   */
  hands: Hand[] = [];

  /**
   * The Casa da Mina, and the contador who decides what a voyage was worth.
   * See progression/casa — the shore end of the career, opposite the rival.
   */
  casa: CasaState = newCasa();

  /** Whatever the Casa has ready for him at court, once each in a career. */
  checkCasa(): boolean {
    if (this.pendingEvent) return false;
    const scene = rollCasaScene(this);
    if (!scene) return false;
    this.pendingEvent = scene;
    return true;
  }

  awardBond(id: BondId, o: Officer): void {
    if (this.bonds.has(id)) return;
    this.bonds.add(id);
    const b = BONDS[id];
    this.logEvent('crew', `${o.name}: ${b.name}. ${b.effect}`, true);
    this.pushAlert(`${b.name} \u2014 ${o.name}.`, 'note');
  }

  has(id: BondId): boolean {
    return this.bonds.has(id);
  }

  /**
   * The one reckoning-up a career allows: every point back, at court, for a
   * hundred of the King's good opinion.
   */
  respecSkills(): string {
    if (this.captain.respecUsed) return 'You have already done this once. A man is what he has made of himself.';
    if (this.dockedAt !== 'lisboa') return 'This is done at court, in Lisbon.';
    if (this.crown.standing < 100) return 'It costs a hundred renown, and you have not got it.';
    this.crown.standing -= 100;
    const back = respecSkillsOf(this.captain);
    this.skillCache = null;
    this.logEvent('crown', `You have unlearned what you were: ${back} points to spend again, and a hundred renown the poorer for the talk it caused.`, true);
    return `${back} points returned.`;
  }

  /** Spend on a node. Returns false if it was barred or unaffordable. */
  buySkill(id: string): boolean {
    if (!buyNode(this.captain, id)) return false;
    this.skillCache = null;
    const node = NODE_BY_ID.get(id);
    if (node) this.logEvent('note', `You have learned it: ${node.name}. ${node.effect}`, true);
    return true;
  }

  private refreshSkillCache(): void {
    if (this.skillCache && this.skillCache.taken === this.captain.taken.length) return;
    this.skillCache = {
      taken: this.captain.taken.length,
      levels: levelsOf(this.captain),
      perks: perksOf(this.captain),
    };
  }

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

  /**
   * The sea as the man at the instrument finds it.
   *
   * A captain who has spent his career at the quadrant does not calm the ocean;
   * he learns to catch the body at the top of the roll, so a seaway that ruins
   * another man's sight costs him a fraction of a degree. Expressed as a
   * smaller effective wave height because that is the one number every part of
   * the observing model already reads.
   */
  get observingSea(): number {
    const sea = this.weatherNow.waveHeight;
    return (this.can('celestial') ? sea * 0.38 : sea) * (this.can('guards') ? 0.8 : 1);
  }

  /**
   * How much canvas the watch will carry without being told twice.
   *
   * Pressing her is the only node in the game that makes the ship *less* safe on
   * purpose: it raises this ceiling by a reef and a half and roughly doubles
   * the chance of losing a spar for it, so the fast captain is the one who
   * arrives with a jury mast up about once a voyage. Sparing her does the
   * reverse, and the man who takes it will never win a race.
   */
  get canvasCeiling(): number {
    const prudent = prudentCanvas(this.weatherNow.wind.speed);
    if (this.can('press')) return Math.min(1, prudent + 0.24);
    if (this.can('spare')) return Math.max(0, prudent - 0.07);
    return prudent;
  }

  get tuning(): ShipTuning {
    const eff = this.effectiveSkill;
    return {
      fouling: 1 + this.ship.condition.fouling * 0.85,
      crewFactor: crewFactor(this.crew, this.ship.baseHull.crewMin) * this.wardroom.handling
        * (this.has('trueSecond') ? 1.18 : 1),
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
    return this.beyondTheKnownAt(this.ship.state.pos);
  }

  /** Whether a place is past anything the Casa's own pilots have sailed. */
  beyondTheKnownAt(p: LatLon): boolean {
    if (p.lat < 3 && p.lon > -20) return true;
    if (p.lat < -8) return true;
    if (p.lon > 20 && p.lat < 20) return true;
    return false;
  }

  get portHere(): PortDef | null {
    return this.dockedAt ? portDef(this.dockedAt) : null;
  }

  /** Ports close enough to enter. */
  /**
   * How far the pilot's advice carries, against the lookout's own eyes.
   *
   * A day's run, which is what the reasoning in `portInSight` calls for and is
   * the distance a pilot who has the latitude can usefully talk about. It must
   * stay larger than the worst error on the inherited chart or the search for a
   * badly drawn town has no answer — which is asserted in the landfall harness
   * so a new port cannot quietly reintroduce it.
   */
  static readonly PILOT_REACH_NM = 120;

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
      // The hand lead, going in the chains as she closes the land. It reaches
      // about twenty fathoms; deeper than that is the deep-sea lead, which
      // means heaving her to and is a decision, not a readout.
      sounding: this.sounding.depth < 20 * 1.8288
        ? `${(this.sounding.depth / 1.8288).toFixed(0)} fathoms`
        : null,
    };
  }

  /** The last cast of the lead, kept so the deck can show what came up on it. */
  private lastCastRaw: LeadCast | null = null;
  private lastCastT = -1e9;

  /**
   * What the lead said, while it is still worth anything.
   *
   * A sounding is a statement about where the ship was when it was taken, and
   * she has been sailing ever since. Half a day later it is history, and
   * leaving it on the deck display would be telling the captain his offing on
   * the strength of a line that went over the side sixty miles back.
   */
  get lastCast(): LeadCast | null {
    if (!this.lastCastRaw) return null;
    return this.clock.t - this.lastCastT < 10 * 3600 ? this.lastCastRaw : null;
  }

  /**
   * Heave the lead.
   *
   * The one navigational act available when the sky is shut, which on this
   * coast in winter is most of it.
   */
  heaveTheLead(): LeadCast {
    const cast = castLead(this);
    if (cast.ok) { this.lastCastRaw = cast; this.lastCastT = this.clock.t; }
    return cast;
  }

  /**
   * Stretches of bottom whose soundings were bought or copied from somebody
   * who had run them. See knowsGroundAt.
   */
  soundedGround: { lat: number; lon: number; nm: number; source: string; sigmaNm?: number }[] = [];

  /**
   * Whether the pilot knows how the bottom shoals toward the land here — which
   * is what turns a depth into a distance off.
   *
   * A depth on its own is a fact about the water under her. Reading it as "so
   * many leagues off the land" needs somebody to have sounded this coast with
   * the land in sight and written down how it shoals, which on a new coast
   * nobody has. So it is known where the Casa's pilots have worked for thirty
   * years, where you have sounded it yourself on an earlier voyage, and where
   * you have bought or copied another pilot's soundings — and nowhere else.
   */
  knowsGroundAt(at: LatLon): string | null {
    // The best record first: a pilot who knows this coast by eye, then your
    // own book, then the Casa's roteiros for the coast it has had for years.
    for (const g of this.soundedGround) {
      if (haversine(at, g) / NM <= g.nm) return g.source;
    }
    const old = this.clock.t - 10 * 86400;
    for (const e of this.rutter.entries) {
      for (const n of e.notes) {
        if (n.fact?.tag !== 'sounding' || n.t > old) continue;
        if (n.fact.lat === undefined || n.fact.lon === undefined) continue;
        if (haversine(at, { lat: n.fact.lat, lon: n.fact.lon }) / NM <= 45) return 'your own book';
      }
    }
    if (!this.beyondTheKnownAt(at)) return 'the Casa\u2019s roteiros';
    return null;
  }

  /**
   * Whose soundings these are, and so which drawing of the coast they are
   * measured against. A sounding figure is only as good as the chart it was
   * written on: the Casa's roteiros sit on the Casa's sheet, with its errors;
   * a local pilot's are taken off the real shore he can see from his own
   * beach; your own are on your own chart. The lead matches the reckoning to
   * that drawing, and to nothing else.
   */
  soundingFrame(at: LatLon): { source: string; shift: { dLat: number; dLon: number }; sigmaNm: number } | null {
    const source = this.knowsGroundAt(at);
    if (!source) return null;
    if (source === 'the Casa\u2019s roteiros') return { source, shift: seededError(at.lat, at.lon), sigmaNm: 3 };
    if (source === 'your own book') {
      return { source, shift: this.chart.localOffset(at, 160) ?? { dLat: 0, dLon: 0 }, sigmaNm: 3 };
    }
    const g = this.soundedGround.find((x) => x.source === source);
    return { source, shift: { dLat: 0, dLon: 0 }, sigmaNm: g?.sigmaNm ?? 4 };
  }

  /** What the local pilots ask for their soundings of this coast. */
  localSoundingsPrice(): number | null {
    const def = this.portHere;
    if (!def || def.people === 'portuguese') return null;
    const rel = this.relationsFor(def.id);
    if (!rel.met) return null;
    const at = anchorageOf(def);
    if (this.soundedGround.some((g) => haversine(at, g) / NM < g.nm * 0.5)) return null;
    return Math.round(30 + def.wealth * 50 - rel.regard * 15);
  }

  /** Pay a local pilot for how the bottom lies along a hundred and fifty miles of coast. */
  buyLocalSoundings(): string {
    const def = this.portHere;
    const price = this.localSoundingsPrice();
    if (!def || price === null) return 'Nobody here has anything to sell you about the bottom.';
    if (this.crown.gold < price) return 'Not enough in the purse.';
    this.crown.gold -= price;
    const at = anchorageOf(def);
    this.soundedGround.push({ lat: at.lat, lon: at.lon, nm: 150, source: `the pilots of ${def.name}` });
    this.logEvent('navigation',
      `Paid ${price} cruzados to a pilot of ${def.name} for the soundings of this coast — how the `
      + 'bottom shoals, sand here and mud there, and where the ground turns to rock. The '
      + 'escrivão wrote it all down in a hand that got smaller as the afternoon went on.', true);
    return `The soundings of ${def.name}'s coast are in the book, a hundred and fifty miles each way.`;
  }

  /** Whether there is any point putting the line over the side from here. */
  get inSoundings(): boolean {
    return !this.dockedAt && this.sounding.depth <= LEAD_REACH_M * this.ship.effects.leadReach;
  }

  /**
   * The port the lookout can see, with its true bearing and distance.
   *
   * Finding a place you have never been was the hard half of this trade and the
   * game should keep it hard. Finding a place that is *on your chart*, whose
   * latitude you have from the quadrant, on a coast you are already in sight
   * of, was not hard at all: you ran down the parallel until the land came up
   * and then you asked the man at the masthead which way the town lay, and he
   * told you, because he could see it. Without that a player whose reckoning
   * has run out by a degree sails to where he *thinks* the town is, finds open
   * water, and has no way at all to convert "somewhere on this coast" into a
   * course.
   *
   * So: a port already on the chart, within the lookout's range, on a coast in
   * sight, bears thus-and-so. Places not yet charted are not included. This
   * tells the player nothing a ship's company would not have known and it turns
   * an impossible search into a chase.
   *
   * The reach of the pilot's half of that was 60 miles, and it had to be more.
   * A reckoning three weeks old is out by more than sixty miles as a matter of
   * course, so a captain laid a course for Mina, arrived where his board said
   * Mina was, found open water, and asked the masthead which way the town lay
   * — and because the search stopped at sixty miles, nobody aboard had
   * anything to say. See PILOT_REACH_NM.
   */
  portInSight(wantId?: string): { def: PortDef; bearing: number; distNm: number; sure: boolean } | null {
    const eye = sightingRangeNm(this.ship.mastHeight, this.weatherNow.visibility);
    // Two ranges. Inside the lookout's, with the coast up, he can see the place
    // and says so. Outside it — but within a day's run — it is the pilot
    // talking, not the lookout: he has the latitude off the quadrant and he
    // knows the town is on this coast, so he knows which way to turn, and that
    // is exactly how these places were found.
    // The one he is looking for first, then the nearest.
    //
    // This only ever answered about the nearest charted town, which is the
    // wrong answer to the question the arrival actually asks. Standing on the
    // spot the chart calls Mina, the nearest charted town is Axim — because
    // Mina's real position is seventy-four miles east of where it is drawn —
    // so a captain who had laid a course for Mina, sailed it, and asked where
    // Mina was, was told about somewhere else entirely and never about Mina.
    const list = portsNear(this.ship.state.pos, Game.PILOT_REACH_NM);
    const ordered = wantId
      ? [...list].sort((a, b) =>
          (a.def.id === wantId ? -1 : 0) - (b.def.id === wantId ? -1 : 0))
      : list;
    for (const near of ordered) {
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

  /**
   * Something done to one of a people is done to all of them.
   *
   * Relations are kept per port, because trading rights are granted by a place
   * and not by a nation. But a thing done on the open sea — a ship taken, a
   * ship helped, a ransom paid without a shot — is not done at a port at all,
   * and word of it travels along the flag rather than along the coast. So it
   * moves every port of that people at once, which is the only honest way to
   * record it and is also why taking a Castilian prize is a decision rather
   * than a windfall.
   */
  shiftPeopleRegard(peopleId: string, delta: number): void {
    for (const p of PORTS) {
      if (p.people !== peopleId) continue;
      const r = this.relationsFor(p.id);
      r.regard = clamp(r.regard + delta, -1, 1);
    }
    // The states of that people feel it too. See diplomacy/courts.
    for (const def of politiesOfPeople(peopleId)) {
      const st = this.diplomacy.polities[def.id];
      if (!st) continue;
      st.trust = clamp(st.trust + delta * 0.7, -1, 1);
      st.interest = clamp(st.interest + delta * 0.3, -1, 1);
    }
  }

  // -------------------------------------------------------------------------
  // States and courts. See diplomacy/polities and diplomacy/courts.
  // -------------------------------------------------------------------------

  diplomacy: DiplomacyState = newDiplomacy();

  polityState(id: string) {
    let st = this.diplomacy.polities[id];
    if (!st) {
      st = newPolityState(POLITY_BY_ID.get(id)!);
      this.diplomacy.polities[id] = st;
    }
    return st;
  }

  /** Move a state's measures, and the regard of all its ports with them. */
  adjustPolity(id: string, d: { trust?: number; respect?: number; interest?: number }, why = ''): void {
    const def = POLITY_BY_ID.get(id);
    if (!def) return;
    const st = this.polityState(id);
    st.trust = clamp(st.trust + (d.trust ?? 0), -1, 1);
    st.respect = clamp(st.respect + (d.respect ?? 0), -1, 1);
    st.interest = clamp(st.interest + (d.interest ?? 0), -1, 1);
    const rd = regardDelta(d);
    if (rd !== 0) {
      for (const port of def.ports) {
        const r = this.relationsFor(port);
        r.regard = clamp(r.regard + rd, -1, 1);
      }
    }
    if (why) {
      this.logEvent('contact', `${def.name}: ${why}.`);
      st.news = [...(st.news ?? []), { t: this.clock.t, text: why }].slice(-5);
    }
  }

  /**
   * The state whose waters these are, if it is a friend: within 300 nm of the
   * seat of a state that trusts you. Its galleys and its pilots keep the coast,
   * and a corsair who knows whose friend you are looks for somebody else.
   */
  alliedWatersAt(lat: number, lon: number): PolityDef | null {
    for (const p of POLITIES) {
      const st = this.diplomacy.polities[p.id];
      if (!st?.met || st.trust < 0.4) continue;
      const a = anchorageOf(portDef(p.seat));
      if (haversine({ lat, lon }, a) / NM < 300) return p;
    }
    return null;
  }

  /** An agreement not kept. The state remembers, and its neighbours hear. */
  breakAgreement(a: Agreement, why: string): void {
    if (a.status !== 'open') return;
    a.status = 'broken';
    const def = POLITY_BY_ID.get(a.polity)!;
    this.adjustPolity(a.polity, { trust: -0.4, respect: -0.05 }, `agreement broken — ${why}`);
    spreadWord(this, a.polity, -0.12, 0, `The Portuguese broke their word to the ${def.title} of ${portDef(def.seat).name}.`);
    this.pushAlert(`Broken: ${a.text} (${def.name}).`, 'grave');
  }

  private keepAgreement(a: Agreement, why: string): void {
    if (a.status !== 'open') return;
    a.status = 'kept';
    const def = POLITY_BY_ID.get(a.polity)!;
    const word = this.can('keptWord') ? 1.5 : 1;
    this.adjustPolity(a.polity, { trust: 0.25 * word, interest: 0.1 }, `agreement kept — ${why}`);
    this.practise('diplomacia', 1);
    spreadWord(this, a.polity, 0.06 * word * word, 0.02, `The Portuguese kept their word to the ${def.title} of ${portDef(def.seat).name}.`);
    this.pushAlert(`Kept: ${a.text}.`, 'note');
  }

  /** A new ruler. How he starts with you depends on what you did. */
  successionIn(id: string, trustAfter: number): void {
    const def = POLITY_BY_ID.get(id)!;
    const st = this.polityState(id);
    st.ruler = Math.min(st.ruler + 1, def.rulers.length - 1);
    st.rulerSince = this.clock.t;
    const temps = ['proud', 'pious', 'mercantile', 'wary', 'warlike'] as const;
    st.temper = temps[Math.floor(this.rng.next() * temps.length)];
    // Half of what the old ruler thought of you survives him.
    const next = clamp(st.trust * 0.5 + trustAfter, -1, 1);
    this.adjustPolity(id, { trust: next - st.trust });
    this.logEvent('contact', `${def.name}: ${rulerName(def, st)} is ${def.title} now.`, true);
  }

  /** Arriving at a port of a state: what they know of you, and what is due. */
  private visitPolity(def: PortDef): void {
    const pol = polityOfPort(def.id);
    this.checkAgreements(pol?.id ?? null);
    if (!pol) return;
    const st = this.polityState(pol.id);
    if (!st.met) { st.met = true; st.rulerSince = this.clock.t; }
    st.knowledge = clamp(st.knowledge + (this.can('readCourt') ? 0.12 : 0.06), 0, 1);
    // The rival has been here first, with presents and his own account of you.
    // Only on coasts he opened himself, and not if he is broken or bound to you.
    if (!st.rivalCourted && def.lat < -6.5 && def.lat >= this.rival.frontierLat
        && !this.rival.ruined && !this.rival.compact) {
      st.rivalCourted = true;
      const bound = this.diplomacy.agreements.some((a) => a.polity === pol.id && a.status !== 'broken');
      if (!bound && st.trust < 0.45) {
        this.adjustPolity(pol.id, { interest: -0.12, trust: -0.05 }, `${this.rival.name} was here before you, with presents`);
        this.pushAlert(`${this.rival.name} has been at this court before you, and left presents and opinions.`, 'warning');
      } else {
        this.adjustPolity(pol.id, { respect: 0.04 }, `sent ${this.rival.name} away — they are bound to you`);
      }
    }
    // Word that has reached them since the last time.
    const now = this.clock.t;
    const arrived = this.diplomacy.word.filter((w) => w.polity === pol.id && w.arrive <= now);
    this.diplomacy.word = this.diplomacy.word.filter((w) => !(w.polity === pol.id && w.arrive <= now));
    for (const w of arrived) {
      this.adjustPolity(pol.id, { trust: w.trust, respect: w.respect });
      st.heard.push(w.text);
    }
    if (st.heard.length > 0) {
      const said = st.heard.slice(-2).join(' ');
      this.logEvent('contact', `At ${def.name} they have heard of you. ${said}`, true);
      this.pushAlert(`They have heard of you here: ${st.heard[st.heard.length - 1]}`, 'note');
      st.heard = [];
    }
    // A great ally shows you his waters.
    if (st.trust > 0.55 && !this.soundedGround.some((g) => g.source === `the ${pol.title}\u2019s pilots`)) {
      const a = anchorageOf(portDef(pol.seat));
      this.soundedGround.push({ lat: a.lat, lon: a.lon, nm: 250, source: `the ${pol.title}\u2019s pilots` });
      this.logEvent('contact', `The ${pol.title} of ${portDef(pol.seat).name} has lent you his pilots: the soundings of his coast are in your book.`, true);
    }
    // Once in a long while, something happens at court that needs you.
    if (st.met && this.relationsFor(def.id).met && now - st.lastCrisisT > 240 * 86400
        && now - st.rulerSince > 60 * 86400 && this.rng.chance(0.35)) {
      st.lastCrisisT = now;
      const c = crisisFor(this, pol, st);
      if (c) this.pendingScenes.push(c);
    }
  }

  /** Deliveries made, returns kept, deadlines passed. */
  checkAgreements(polityHere: string | null): void {
    const now = this.clock.t;
    for (const a of this.diplomacy.agreements) {
      if (a.status !== 'open') continue;
      if (a.kind === 'envoy' && this.dockedAt === 'lisboa') {
        this.keepAgreement(a, 'the envoy has seen the King');
        this.crown.standing += 20; this.crown.lifetimeStanding += 20;
        continue;
      }
      if (polityHere === a.polity) {
        if (a.kind === 'return' && now - a.made > 120 * 86400) { this.keepAgreement(a, 'came back as promised'); continue; }
        if (a.kind === 'deliver' && a.goodId && a.qty && this.ship.quantityOf(a.goodId) >= a.qty) {
          this.ship.removeCargo(a.goodId, a.qty);
          this.keepAgreement(a, `${a.qty} ${good(a.goodId).english.toLowerCase()} delivered`);
          continue;
        }
      }
      if (a.due !== undefined && now > a.due) this.breakAgreement(a, 'the time ran out');
    }
  }

  /**
   * The treaty an audience has come to. Grants what was agreed, writes down
   * what was promised, and tells the neighbours.
   */
  concludeTreaty(def: PortDef, deal: Deal, verdict: Verdict, forced = false): string {
    const pol = polityOfPort(def.id);
    const rel = this.relationsFor(def.id);
    const pe = people(def.people);
    rel.met = true;
    rel.visits += 1;
    const lines: string[] = [];
    if (pol) {
      const st = this.polityState(pol.id);
      st.knowledge = clamp(st.knowledge + (this.can('readCourt') ? 0.24 : 0.12), 0, 1);
      verdict.factions.forEach((f) => { st.factions[f.id] = clamp((st.factions[f.id] ?? 0) * 0.6 + f.approval * 0.4, -1, 1); });
    }
    if (forced) {
      for (const port of pol?.ports ?? [def.id]) this.relationsFor(port).mayTrade = true;
      const soft = this.can('gunboat') ? 0.5 : 1;
      if (pol) {
        this.adjustPolity(pol.id, { trust: -0.6 * soft, respect: 0.45 }, 'the guns were run out');
        spreadWord(this, pol.id, -0.15 * soft, 0.2, `The Portuguese ran out their guns at ${def.name} and took what they wanted.`);
      } else rel.regard = clamp(rel.regard - 0.6 * soft, -1, 1);
      const extra: string[] = [];
      if (this.can('tribute')) {
        const gold = Math.round(100 + def.wealth * 400);
        this.crown.gold += gold;
        extra.push(`${gold} cruzados in tribute`);
      }
      if (this.can('viceroy')) {
        rel.factory = true;
        for (const port of pol?.ports ?? [def.id]) this.relationsFor(port).exclusive = true;
        extra.push('ground for a feitoria and the trade to yourself');
      }
      return `Leave to trade, given at the mouth of a gun${extra.length ? `, with ${extra.join(' and ')}` : ''}. It will be remembered.`;
    }
    if (!verdict.accepted) {
      if (pol) this.adjustPolity(pol.id, { trust: 0.02, interest: -0.05 }, '');
      return 'Nothing was agreed. You were heard, and sent back to your ship.';
    }
    const now = this.clock.t;
    for (const ask of deal.asks) {
      if (ask === 'trade') { for (const port of pol?.ports ?? [def.id]) this.relationsFor(port).mayTrade = true; lines.push('leave to trade'); }
      if (ask === 'factory') { rel.factory = true; rel.mayTrade = true; this.crown.record('port', `Feitoria at ${def.name}`, this.nav.estimated, 45, now); lines.push('ground for a feitoria'); }
      if (ask === 'exclusive') { for (const port of pol?.ports ?? [def.id]) this.relationsFor(port).exclusive = true; lines.push('exclusive terms'); }
      if (ask === 'pilot') {
        const a = anchorageOf(def);
        this.soundedGround.push({ lat: a.lat, lon: a.lon, nm: 200, source: `the pilots of ${def.name}` });
        lines.push('a pilot and his soundings');
      }
      if (ask === 'padrao') {
        rel.padrao = true;
        if (this.crown.padraoStock > 0) {
          this.crown.padraoStock -= 1;
          this.crown.padroesRaised += 1;
          this.crown.progressObjective('padrao', undefined, 1);
          this.crown.record('padrao', `Padrão at ${def.name}`, this.nav.estimated, 12, now);
          this.crown.padraoSites.push({ name: `Padrão at ${def.name}`, lat: this.nav.estimated.lat, lon: this.nav.estimated.lon, t: now });
          lines.push('a padrão on the headland');
        } else lines.push('leave for a padrão, and no stone to set');
      }
    }
    if (pol) {
      const due = now + 540 * 86400;
      for (const off of deal.offers) {
        const id = this.diplomacy.nextId++;
        if (off === 'return') this.diplomacy.agreements.push({ id, polity: pol.id, kind: 'return', text: `Return to ${pol.name} with a cargo`, made: now, due, status: 'open' });
        if (off === 'deliver') {
          const goodId = pol.wants[0];
          const qty = goodId === 'cavalos' ? 4 : goodId === 'ouro' ? 5 : goodId === 'coral' ? 10 : 20;
          this.diplomacy.agreements.push({ id, polity: pol.id, kind: 'deliver', goodId, qty, text: `Bring ${qty} ${good(goodId).english.toLowerCase()} to ${pol.name}`, made: now, due, status: 'open' });
        }
        if (off === 'ally' && pol.feuds.length > 0) {
          this.diplomacy.agreements.push({ id, polity: pol.id, kind: 'ally', against: pol.feuds[0], text: `Stand with ${pol.name} against ${POLITY_BY_ID.get(pol.feuds[0])?.name}`, made: now, status: 'open' });
          this.adjustPolity(pol.feuds[0], { trust: -0.25 }, `allied with their enemy, ${pol.name}`);
        }
        if (off === 'envoy') this.diplomacy.agreements.push({ id, polity: pol.id, kind: 'envoy', text: `Carry ${pol.name}\u2019s envoy to Lisbon`, made: now, due: now + 365 * 86400, status: 'open' });
        if (off === 'tribute') { this.crown.gold = Math.max(0, this.crown.gold - 150); }
      }
      this.adjustPolity(pol.id, { trust: 0.12, interest: 0.12 + deal.offers.length * 0.04, respect: 0.03 }, 'a treaty agreed');
      this.practise('diplomacia', 1);
      spreadWord(this, pol.id, 0.05, 0.03, `The Portuguese made a treaty with the ${pol.title} of ${portDef(pol.seat).name}.`);
    } else {
      rel.regard = clamp(rel.regard + 0.2, -1, 1);
    }
    if (rel.mayTrade && !this.visitedPorts.has(`${def.id}:traded`)) {
      this.visitedPorts.add(`${def.id}:traded`);
      this.crown.progressObjective('contact', pe.id);
      const value = Math.round(def.discovery * 0.5);
      if (value > 0) this.crown.record('people', `Contact with the ${pe.name} at ${def.name}`, this.nav.estimated, value, now);
    }
    return `Agreed: ${lines.join(', ') || 'friendship'}.`;
  }

  /** Every state you have dealt with, for the Courts page. */
  get knownPolities(): PolityDef[] {
    return POLITIES.filter((p) => this.diplomacy.polities[p.id]?.met);
  }



  // -------------------------------------------------------------------------
  // Trade beyond the counter. See economy/trade.
  // -------------------------------------------------------------------------

  trade: TradeState = newTrade(0);
  /** The bargaining at this visit's table: his patience, and whether you have walked out once. */
  private haggle: { key: string; patience: number; walked: boolean; closedUntil: number; bias: number } | null = null;

  /** What news, the season and the other buyers are doing to a price. */
  private worldAdjust(portId: string, goodId: string, t: number): { ask: number; bid: number; stock: number } {
    const month = dateFromDays(Math.floor(t / 86400)).month;
    const w = worldMod(this.trade, portId, goodId, t, month);
    const comp = this.competitionAt(portId);
    return {
      ask: w.ask * (1 + comp * 0.18),
      bid: w.bid * (1 - comp * 0.08),
      stock: 1 - comp * 0.35,
    };
  }

  /** How hard other buyers are pressing here, 0-1. An exclusive treaty sends them away. */
  competitionAt(portId: string): number {
    const c = COMPETITION[portId];
    if (!c) return 0;
    const rel = this.relations.get(portId);
    return c.level * (rel?.exclusive ? 0.2 : 1);
  }

  /** The merchants' faction at this port's court, -1 to 1: how the men you trade with feel about you. */
  merchantsHere(portId: string): number {
    const pol = polityOfPort(portId);
    if (!pol) return 0;
    const st = this.diplomacy.polities[pol.id];
    if (!st?.met) return 0;
    const fs = pol.factions.filter((f) => f.cares === 'trade');
    if (fs.length === 0) return 0;
    return fs.reduce((s, f) => s + (st.factions[f.id] ?? 0), 0) / fs.length;
  }

  /** The prices at this port as the ship sees them: in coin, for this captain. */
  marketHere(portId = this.dockedAt ?? ''): TradeListing[] {
    if (!portId) return [];
    const def = portDef(portId);
    const rel = this.relationsFor(portId);
    const relation = rel.regard + this.diplomaticEdge(def.people) + this.merchantsHere(portId) * 0.3;
    const pay = paymentAt(portId);
    const lisbon = portId === 'lisboa';
    return this.markets.listings(portId, this.clock.t, relation, skill(this.effectiveSkill, 'comercio'),
      this.ship.cargo.map((c) => c.goodId))
      .map((l) => {
        const casa = lisbon && MONOPOLY.includes(l.goodId) && !this.hasLicence(l.goodId);
        return {
          ...l,
          rawAsk: l.ask, rawBid: l.bid,
          ask: l.ask * pay.coin,
          // A town short of coin pays you in what coin it has, and not much of it.
          bid: l.bid / Math.sqrt(pay.coin) * (casa ? (this.can('kingsPartner') ? 0.9 : CASA_SHARE) : 1),
          casa,
          barter: pay.takes[l.goodId] ?? 1,
        };
      });
  }

  hasLicence(goodId: string): boolean {
    return (this.trade.licences[goodId] ?? 0) > this.clock.t;
  }

  /** Write the book. */
  private enter(kind: EntryKind, text: string, amount: number): void {
    currentBook(this.trade).entries.push({ t: this.clock.t, kind, text, amount });
  }

  /** Take down the prices here, as they are today. */
  private noteSheet(portId: string, source: PriceSheet['source'], noise = 0, falseGood?: string): void {
    const quotes: Record<string, Quote> = {};
    for (const l of this.marketHere(portId)) {
      const n = noise > 0 ? 1 + this.rng.range(-noise, noise) : 1;
      const lie = falseGood === l.goodId ? 1.7 : 1;
      quotes[l.goodId] = { ask: l.ask * n, bid: l.bid * n * lie, stock: l.stock, wanted: l.wanted, local: l.local };
    }
    const prev = this.trade.sheets[portId];
    // A letter never overwrites what you saw with your own eyes more recently.
    if (source !== 'seen' && prev && prev.t >= this.clock.t - 20 * 86400) return;
    this.trade.sheets[portId] = { t: source === 'seen' ? this.clock.t : this.clock.t - this.rng.range(15, 45) * 86400, source, quotes, falseGood };
  }

  /** What the sheets in your book say a good fetches elsewhere. */
  knownQuotes(goodId: string, exclude = ''): { port: string; portId: string; ask: number; bid: number; days: number; source: PriceSheet['source']; wanted: boolean; local: boolean }[] {
    const out = [];
    for (const [id, sh] of Object.entries(this.trade.sheets)) {
      if (id === exclude) continue;
      const q = sh.quotes[goodId];
      if (!q) continue;
      out.push({ port: portDef(id).name, portId: id, ask: q.ask, bid: q.bid, days: (this.clock.t - sh.t) / 86400, source: sh.source, wanted: q.wanted, local: q.local });
    }
    return out;
  }

  /** Arrival: the news, the letters, what is owed and what is due. */
  private visitMarket(def: PortDef): void {
    const now = this.clock.t;
    const d = this.clock.date;
    rollShocks(this.trade, now, d.year, this.rng);
    decayAntwerp(this.trade, now);
    const here = regionOf(def.id);
    // News that has reached this coast.
    for (const x of this.trade.shocks) {
      if (this.trade.heard[x.id] !== undefined) continue;
      if ((x.arrive[here] ?? Infinity) > now) continue;
      this.trade.heard[x.id] = now;
      if (x.end < now) continue;
      const sd = shockDef(x.key);
      this.logEvent('trade', `News at ${def.name}: ${sd.title}. ${sd.text}`, true);
      this.pushAlert(`News: ${sd.title}.`, 'note');
    }
    // A broker's letter that lied.
    const prev = this.trade.sheets[def.id];
    if (prev?.falseGood) {
      this.logEvent('trade', `The broker's letter about ${def.name} was a lie: ${good(prev.falseGood).english.toLowerCase()} fetches nothing like what he wrote. Somebody wanted you here.`, true);
      this.pushAlert(`The broker lied about ${good(prev.falseGood).english.toLowerCase()} at ${def.name}.`, 'warning');
    }
    this.noteSheet(def.id, 'seen');
    // A merchant keeps up a correspondence: every factory you have traded at on
    // this coast has written.
    if (this.can('factorsEye') || this.can('ownAccount')) {
      for (const id of this.visitedPorts) {
        if (id === def.id || regionOf(id) !== here || !this.relationsFor(id).mayTrade) continue;
        this.noteSheet(id, 'letter', 0.06);
      }
    }
    // The officers' chests.
    const aboard = this.crew.officers.filter((o) => o.alive && !o.ashoreAt);
    this.ship.reservedTons = this.trade.quintaladas ? aboard.length * CHEST_TONS : 0;
    if (def.id !== 'lisboa' || this.trade.books.length > 1 || currentBook(this.trade).entries.length > 0) {
      // Expected, so granting it earns nothing; refusing it is remembered.
      if (!this.trade.quintaladas && !this.can('fairShares')) for (const o of aboard) o.loyalty = clamp(o.loyalty - 0.012, 0, 1);
      if (this.can('fairShares')) this.crew.morale = clamp(this.crew.morale + 0.05, 0, 1);
    }
    // Contracts.
    for (const c of this.trade.contracts) {
      if (c.status !== 'open') continue;
      if (c.port === def.id && this.ship.quantityOf(c.goodId) >= c.qty) {
        this.ship.removeCargo(c.goodId, c.qty);
        const due = c.qty * c.price - c.advance;
        this.crown.gold += due;
        c.status = 'kept';
        this.finance.credit[c.house as HouseId] = clamp((this.finance.credit[c.house as HouseId] ?? 0) + 8, 0, 100);
        this.enter('contract', `Delivered ${c.qty} ${unitOf(good(c.goodId), c.qty)} of ${good(c.goodId).english.toLowerCase()} to ${c.houseName}`, due);
        this.logEvent('trade', `Delivered ${c.qty} ${good(c.goodId).english.toLowerCase()} to ${c.houseName} under contract: ${due.toFixed(0)} cruzados, the advance already had.`, true);
        this.crown.syncCargoObjectives((id) => this.ship.quantityOf(id));
      } else if (now > c.due) {
        c.status = 'broken';
        const penalty = Math.round(c.advance * 1.5);
        this.crown.gold = Math.max(0, this.crown.gold - penalty);
        this.finance.credit[c.house as HouseId] = clamp((this.finance.credit[c.house as HouseId] ?? 0) - 20, 0, 100);
        this.enter('contract', `Contract with ${c.houseName} broken`, -penalty);
        this.logEvent('trade', `The contract with ${c.houseName} has run out undelivered. They have taken back the advance and half as much again, ${penalty} cruzados, and they will remember.`, true);
        this.pushAlert(`Contract broken: ${c.houseName} (${penalty} cruzados).`, 'grave');
      }
    }
    this.trade.contracts = this.trade.contracts.filter((c) => c.status !== 'offered');
    // Antwerp.
    if (def.id === 'lisboa') {
      const paid = this.trade.antwerp.filter((a) => a.due <= now);
      for (const a of paid) {
        this.crown.gold += a.amount;
        this.enter('antwerp', `Antwerp paid for ${a.qty.toFixed(0)} ${good(a.goodId).english.toLowerCase()}`, a.amount);
        this.logEvent('trade', `The Casa's factor at Antwerp has remitted ${a.amount.toFixed(0)} cruzados for ${good(a.goodId).english.toLowerCase()}.`, true);
      }
      this.trade.antwerp = this.trade.antwerp.filter((a) => a.due > now);
    }
    this.haggle = null;
  }

  /** Contracts the Lisbon houses would sign today. */
  contractOffers(): Contract[] {
    if (this.dockedAt !== 'lisboa') return [];
    const now = this.clock.t;
    if (now - this.trade.offersT > 120 * 86400) {
      this.trade.offersT = now;
      this.trade.contracts = this.trade.contracts.filter((c) => c.status !== 'offered');
      const act = this.chronicle.act;
      const pool = (act <= 2 ? ['acucar', 'malagueta', 'marfim', 'ouro', 'panos'] : act === 3 ? ['acucar', 'marfim', 'ouro', 'malagueta', 'perolas'] : ['canela', 'cravo', 'gengibre', 'noz', 'seda', 'perolas', 'calico', 'anil'])
        .filter((id) => !MONOPOLY.includes(id) || this.hasLicence(id));
      const houses = HOUSES.filter((h) => (this.finance.credit[h.id] ?? 0) >= h.floor);
      const n = this.can('kingsPartner') ? 3 : 2;
      for (let i = 0; i < n && pool.length > 0 && houses.length > 0; i++) {
        const goodId = pool[Math.floor(this.rng.next() * pool.length)];
        const h = houses[Math.floor(this.rng.next() * houses.length)];
        const gd = good(goodId);
        const value = this.rng.range(1200, 3200) * (act <= 2 ? 0.6 : 1);
        const price = Math.round(gd.lisbon * this.rng.range(1.65, 1.9) * (this.can('antwerpEarly') ? 1.08 : 1) * 10) / 10;
        const qty = Math.max(1, Math.round(value / price));
        this.trade.contracts.push({
          id: this.trade.nextId++, house: h.id, houseName: h.name, goodId, qty, price,
          advance: Math.round(qty * price * 0.15), made: now,
          due: now + (act >= 4 ? 720 : 480) * 86400, port: 'lisboa', status: 'offered',
        });
      }
    }
    return this.trade.contracts.filter((c) => c.status === 'offered');
  }

  signContract(id: number): string {
    const c = this.trade.contracts.find((x) => x.id === id && x.status === 'offered');
    if (!c) return 'That offer has gone.';
    c.status = 'open';
    c.made = this.clock.t;
    this.crown.gold += c.advance;
    this.enter('contract', `Advance from ${c.houseName}`, c.advance);
    this.logEvent('trade', `Signed with ${c.houseName}: ${c.qty} ${unitOf(good(c.goodId), c.qty)} of ${good(c.goodId).english.toLowerCase()} at ${c.price} the ${good(c.goodId).unit}, by ${formatDateAt(c.due)}. ${c.advance} cruzados advanced.`, true);
    return `Signed. ${c.advance} cruzados advanced; the rest when the ${good(c.goodId).english.toLowerCase()} is on the quay.`;
  }

  /** Buy for coin at the scales. */
  tradeBuy(goodId: string, qty: number): { ok: boolean; text: string } {
    const port = this.dockedAt;
    const l = this.marketHere().find((x) => x.goodId === goodId);
    if (!port || !l) return { ok: false, text: 'Nothing of that here.' };
    const gd = good(goodId);
    const affordable = Math.floor((this.crown.gold + this.creditFree) / l.ask);
    const roomFor = Math.floor(this.ship.holdFree / gd.bulk);
    let take = Math.min(qty, l.stock, affordable, roomFor);
    if (take <= 0) return { ok: false, text: roomFor <= 0 ? 'No room in the hold.' : affordable <= 0 ? 'Not enough in the purse.' : 'None to be had.' };
    let paid = l.ask * Markets.slippage(take, l.stock);
    if (take * paid > this.crown.gold) this.drawCredit(take * paid);
    if (take * paid > this.crown.gold) {
      take = Math.floor(this.crown.gold / paid);
      if (take <= 0) return { ok: false, text: 'Not enough in the purse, once they see how much you want.' };
      paid = l.ask * Markets.slippage(take, l.stock);
    }
    const cost = take * paid;
    const q = qualityAtSource(port, goodId, this.clock.date.month, this.rng.range(-0.1, 0.1));
    this.ship.addCargo(goodId, take, paid, q);
    this.crown.gold -= cost;
    this.markets.buy(port, goodId, take);
    this.crown.syncCargoObjectives((id) => this.ship.quantityOf(id));
    this.enter('buy', `${take.toFixed(0)} ${unitOf(gd, take)} of ${gd.english.toLowerCase()} at ${portDef(port).name}`, -cost);
    this.logEvent('trade', `Bought ${take.toFixed(0)} ${gd.unit} of ${gd.name.toLowerCase()} at ${paid.toFixed(1)} the ${gd.unit}, ${cost.toFixed(0)} cruzados in all. ${gradeWord(q)}.`);
    this.noteSheet(port, 'seen');
    return { ok: true, text: `Took aboard ${take.toFixed(0)} ${gd.unit} of ${gd.name.toLowerCase()} (${gradeWord(q).toLowerCase()}) for ${cost.toFixed(0)} cruzados.` };
  }

  /**
   * Sell for coin. `quay` sells a monopoly good privately in Lisbon, past the
   * Casa's scales, and takes the chance of the King's officers.
   */
  tradeSell(goodId: string, qty: number, quay = false): { ok: boolean; text: string; revenue: number; profit: number; shared: number; edge: number } {
    const port = this.dockedAt;
    const l = this.marketHere().find((x) => x.goodId === goodId);
    const none = { revenue: 0, profit: 0, shared: 0, edge: 0 };
    if (!port || !l) return { ok: false, text: 'Nobody here will buy that.', ...none };
    const gd = good(goodId);
    const lot = this.ship.cargo.find((c) => c.goodId === goodId);
    const take = Math.min(qty, lot?.quantity ?? 0, l.appetite);
    if (take <= 0 || !lot) return { ok: false, text: 'They will not take any more of that.', ...none };
    const edge = this.tradeEdge(goodId);
    const base = quay ? l.rawBid / Math.sqrt(paymentAt(port).coin) : l.bid;
    const got = (base / Markets.slippage(take, l.appetite)) * (1 + edge) * qualityFactor(lot.q);
    const revenue = take * got;
    const costBasis = lot.cost * take;
    this.ship.removeCargo(goodId, take);
    this.markets.sell(port, goodId, take);
    this.crown.syncCargoObjectives((id) => this.ship.quantityOf(id));
    if (quay) {
      const caught = this.rng.chance(clamp(0.2 - skill(this.effectiveSkill, 'comercio') * 0.08, 0.06, 0.25) * (this.can('licences') ? 0.5 : 1));
      if (caught) {
        const fine = Math.round(revenue * 0.25);
        this.crown.gold = Math.max(0, this.crown.gold - fine);
        this.crown.standing = Math.max(0, this.crown.standing - 15);
        this.casa.regard = clamp(this.casa.regard - 0.15, -1, 1);
        this.enter('fine', `${gd.english} seized on the quay, and a fine`, -fine);
        this.logEvent('trade', `The King's officers were on the quay. ${take.toFixed(0)} ${unitOf(gd, take)} of ${gd.english.toLowerCase()} seized for the Crown, and a fine of ${fine} cruzados.`, true);
        return { ok: true, text: `Caught. The ${gd.english.toLowerCase()} is the King's now, and the fine is ${fine} cruzados.`, revenue: 0, profit: -costBasis - fine, shared: 0, edge: 0 };
      }
    }
    this.crown.gold += revenue;
    const shared = this.takeShares(revenue);
    const profit = revenue - costBasis;
    this.enter('sell', `${take.toFixed(0)} ${unitOf(gd, take)} of ${gd.english.toLowerCase()} at ${portDef(port).name}${l.casa && !quay ? ', to the Casa' : quay ? ', on the quay' : ''}`, revenue);
    if (shared > 0.5) this.enter('shares', 'The sharers’ cut', -shared);
    if (l.casa && !quay) {
      this.enter('casa', `The King's share of the ${gd.english.toLowerCase()} (kept at the scales)`, 0);
    }
    this.logEvent('trade',
      `Sold ${take.toFixed(0)} ${gd.unit} of ${gd.name.toLowerCase()} at ${got.toFixed(1)}, ${revenue.toFixed(0)} cruzados`
      + (lot.cost > 0 ? `, against ${costBasis.toFixed(0)} paid — ${profit >= 0 ? 'a gain' : 'a loss'} of ${Math.abs(profit).toFixed(0)}.` : '.'));
    this.noteSheet(port, 'seen');
    return {
      ok: true,
      text: `Sold for ${revenue.toFixed(0)} cruzados`
        + (lot.cost > 0 ? ` — ${profit >= 0 ? 'profit' : 'loss'} ${Math.abs(profit).toFixed(0)}.` : '.')
        + (l.casa && !quay ? ' The Casa took it at the King’s price.' : '')
        + (quay ? ' Nobody asked where it came from.' : ''),
      revenue, profit, shared, edge,
    };
  }

  // --- The barter table ---------------------------------------------------

  /** What each side of a bargain is worth to the man across the table. */
  barterValue(give: { goodId: string; qty: number }[], coin: number, take: { goodId: string; qty: number }[]): { yours: number; theirs: number } {
    const port = this.dockedAt;
    if (!port) return { yours: 0, theirs: 0 };
    const ls = new Map(this.marketHere().map((l) => [l.goodId, l]));
    const pay = paymentAt(port);
    let yours = coin / pay.coin, theirs = 0;
    for (const g of give) {
      const l = ls.get(g.goodId);
      const lot = this.ship.cargo.find((c) => c.goodId === g.goodId);
      if (!l || !lot || g.qty <= 0) continue;
      const q = Math.min(g.qty, lot.quantity, l.appetite);
      yours += q * (l.rawBid / Markets.slippage(q, l.appetite)) * l.barter * qualityFactor(lot.q);
    }
    for (const t of take) {
      const l = ls.get(t.goodId);
      if (!l || t.qty <= 0) continue;
      const q = Math.min(t.qty, l.stock);
      theirs += q * l.rawAsk * Markets.slippage(q, l.stock);
    }
    return { yours, theirs };
  }

  private haggleState(): NonNullable<Game['haggle']> {
    const key = `${this.dockedAt}:${this.dockedSinceT}`;
    if (!this.haggle || this.haggle.key !== key) {
      const regard = this.relationsFor(this.dockedAt!).regard;
      this.haggle = { key, patience: 3 + (regard > 0.4 ? 1 : 0) + (this.can('patience') ? 2 : 0), walked: false, closedUntil: 0, bias: this.rng.range(-0.06, 0.06) };
    }
    return this.haggle;
  }

  /** What he will settle for, as a fraction of his side: hidden from the player. */
  barterReservation(): number {
    const port = this.dockedAt!;
    const h = this.haggleState();
    const r = 0.97 - skill(this.effectiveSkill, 'comercio') * 0.12
      - clamp(this.relationsFor(port).regard, -1, 1) * 0.05
      - this.merchantsHere(port) * 0.05 + this.competitionAt(port) * 0.08 + h.bias;
    return clamp(r, 0.78, 1.12);
  }

  /** How well you can read him: the width of the band either side of the truth. */
  get barterFuzz(): number {
    const def = this.portHere;
    const interp = def ? hasInterpreterFor(this.crew, people(def.people).language) : null;
    return clamp((0.15 - skill(this.effectiveSkill, 'comercio') * 0.08 - (interp ? 0.05 : 0)) * (this.can('patience') ? 0.6 : 1), 0.02, 0.16);
  }

  get barterPatience(): { patience: number; walked: boolean; closed: boolean } {
    const h = this.haggleState();
    return { patience: h.patience, walked: h.walked, closed: h.closedUntil > this.clock.t };
  }

  /** Put a bargain to him. */
  barter(give: { goodId: string; qty: number }[], coin: number, take: { goodId: string; qty: number }[]): { accepted: boolean; text: string } {
    const port = this.dockedAt;
    if (!port) return { accepted: false, text: '' };
    const h = this.haggleState();
    if (h.closedUntil > this.clock.t) return { accepted: false, text: 'He will not deal with you again today.' };
    coin = clamp(coin, 0, this.crown.gold);
    const v = this.barterValue(give, coin, take);
    if (v.theirs <= 0) return { accepted: false, text: 'You have asked for nothing.' };
    const r = this.barterReservation();
    if (v.yours < v.theirs * r) {
      h.patience -= 1;
      const short = (v.theirs * r - v.yours) * (1 + this.rng.range(-this.barterFuzz, this.barterFuzz));
      if (h.patience <= 0) {
        h.closedUntil = this.clock.t + 3 * 86400;
        return { accepted: false, text: 'He has had enough of you, and rolls up his cloth. Come back in a few days.' };
      }
      return { accepted: false, text: `He shakes his head. You would need to find something like ${Math.max(1, Math.round(short))} cruzados more of what he will take.` };
    }
    // Done. Your goods go ashore, his come aboard at what you gave for them.
    const ls = new Map(this.marketHere().map((l) => [l.goodId, l]));
    let givenCost = coin;
    const gave: string[] = [];
    for (const g of give) {
      const lot = this.ship.cargo.find((c) => c.goodId === g.goodId);
      const l = ls.get(g.goodId);
      if (!lot || !l || g.qty <= 0) continue;
      const q = Math.min(g.qty, lot.quantity, l.appetite);
      givenCost += lot.cost * q;
      this.ship.removeCargo(g.goodId, q);
      this.markets.sell(port, g.goodId, q);
      gave.push(`${q.toFixed(0)} ${good(g.goodId).english.toLowerCase()}`);
    }
    this.crown.gold -= coin;
    if (coin > 0) gave.push(`${coin.toFixed(0)} cruzados`);
    const got: string[] = [];
    for (const t of take) {
      const l = ls.get(t.goodId);
      if (!l || t.qty <= 0) continue;
      const q = Math.min(t.qty, l.stock, Math.floor(this.ship.holdFree / good(t.goodId).bulk));
      if (q <= 0) continue;
      const share = (q * l.rawAsk) / v.theirs;
      const quality = qualityAtSource(port, t.goodId, this.clock.date.month, this.rng.range(-0.1, 0.1));
      this.ship.addCargo(t.goodId, q, (givenCost * share) / q, quality);
      this.markets.buy(port, t.goodId, q);
      got.push(`${q.toFixed(0)} ${unitOf(good(t.goodId), q)} of ${good(t.goodId).english.toLowerCase()} (${gradeWord(quality).toLowerCase()})`);
    }
    this.crown.syncCargoObjectives((id) => this.ship.quantityOf(id));
    const text = `Gave ${gave.join(', ')} for ${got.join(', ')}.`;
    this.enter('barter', `${text.replace(/\.$/, '')} at ${portDef(port).name}`, -coin);
    this.logEvent('trade', `Bartered at ${portDef(port).name}. ${text}`);
    this.noteSheet(port, 'seen');
    return { accepted: true, text: `Done. ${text}` };
  }

  /** Get up from the table. Sometimes he calls you back. */
  walkAway(): string {
    const h = this.haggleState();
    if (h.walked) return 'You have tried that once already. He watches you go.';
    h.walked = true;
    const port = this.dockedAt!;
    const chance = clamp(0.55 + skill(this.effectiveSkill, 'comercio') * 0.2 - this.competitionAt(port) * 0.5, 0.15, 0.85);
    if (this.rng.chance(chance)) {
      h.bias -= 0.06;
      h.patience += 1;
      return 'You are halfway to the boat when a boy runs after you. He will talk again, and he will be more reasonable.';
    }
    h.closedUntil = this.clock.t + 3 * 86400;
    return COMPETITION[port]
      ? `He lets you go. ${COMPETITION[port].who} are waiting to take your place at the table.`
      : 'He lets you go, and does not look up.';
  }

  // --- Letters, licences, Antwerp ------------------------------------------

  /** Regions a broker here can write you a price letter for, and what it costs. */
  reportOffers(): { region: Region; price: number; ports: number }[] {
    const def = this.portHere;
    if (!def) return [];
    if (!(def.size === 'city' || def.size === 'emporium' || def.feitoria || this.relationsFor(def.id).factory)) return [];
    const out: { region: Region; price: number; ports: number }[] = [];
    for (const r of Object.keys(REGION_NAME) as Region[]) {
      const ports = portsInRegion(r).filter((id) => this.chart.ports.has(id) && id !== def.id);
      if (ports.length === 0) continue;
      const far = newsDelayDays(regionOf(def.id), r);
      out.push({ region: r, ports: ports.length, price: Math.round((15 + ports.length * 6 + far * 0.15) * (this.can('brokers') ? 0.5 : 1)) });
    }
    return out;
  }

  buyReport(r: Region): string {
    const offer = this.reportOffers().find((o) => o.region === r);
    if (!offer) return 'Nobody here writes about that coast.';
    if (this.crown.gold < offer.price) return 'Not enough in the purse.';
    this.crown.gold -= offer.price;
    this.enter('report', `A broker's letter on ${REGION_NAME[r]}`, -offer.price);
    const here = this.dockedAt!;
    const hostile = this.merchantsHere(here) < -0.15 || (this.rival.met && (this.rival.regard ?? 0) < -0.3);
    let lied = false;
    for (const id of portsInRegion(r)) {
      if (!this.chart.ports.has(id) || id === here) continue;
      let falseGood: string | undefined;
      if (!lied && !this.can('brokers') && this.rng.chance(hostile ? 0.35 : 0.1)) {
        const wanted = Object.keys(portDef(id).wants);
        if (wanted.length) { falseGood = wanted[Math.floor(this.rng.next() * wanted.length)]; lied = true; }
      }
      this.noteSheet(id, 'broker', 0.12, falseGood);
    }
    return `The letter covers ${offer.ports} ${offer.ports === 1 ? 'port' : 'ports'} on ${REGION_NAME[r].replace(/^The /, 'the ')}. The prices are in your book.`;
  }

  buyLicence(goodId: string): string {
    if (this.dockedAt !== 'lisboa') return 'Licences are granted at the Casa, in Lisbon.';
    const cost = this.licencePrice(goodId);
    if (this.crown.gold < cost) return 'Not enough in the purse.';
    this.crown.gold -= cost;
    this.trade.licences[goodId] = Math.max(this.trade.licences[goodId] ?? 0, this.clock.t) + LICENCE_YEARS * 365 * 86400;
    this.enter('licence', `The King's licence for ${good(goodId).english.toLowerCase()}`, -cost);
    this.logEvent('trade', `Bought the King's licence to trade ${good(goodId).english.toLowerCase()} on your own account for ${LICENCE_YEARS} years, ${cost} cruzados.`, true);
    return `Licensed for ${LICENCE_YEARS} years. The Casa will not stand at your scales for ${good(goodId).english.toLowerCase()}.`;
  }

  /** The Casa's factor in Antwerp: from the third act, or at once with a correspondent there. */
  get antwerpOpen(): boolean {
    return this.dockedAt === 'lisboa' && (this.chronicle.act >= 3 || this.can('antwerpEarly'));
  }

  /** What the King's licence for a good costs this captain. */
  licencePrice(goodId: string): number {
    return Math.round(licenceCost(goodId) * (this.can('licences') ? 0.5 : 1));
  }

  sellAntwerp(goodId: string, qty: number): string {
    if (!this.antwerpOpen) return 'The Casa has no factor in Antwerp for you yet.';
    if (MONOPOLY.includes(goodId) && !this.hasLicence(goodId)) return 'That is the King’s, and the King sells it himself.';
    const lot = this.ship.cargo.find((c) => c.goodId === goodId);
    if (!lot || qty <= 0) return 'Nothing to send.';
    const take = Math.min(qty, lot.quantity);
    const w = antwerpWeight(goodId) * take;
    const g0 = this.trade.antwerpGlut[goodId] ?? 0;
    const per = antwerpBid(this.trade, goodId) * (1 + g0 * 1.2) / (1 + (g0 + w / 2) * 1.2);
    const amount = take * per * qualityFactor(lot.q);
    this.trade.antwerpGlut[goodId] = g0 + w;
    this.ship.removeCargo(goodId, take);
    const shared = this.takeShares(amount);
    this.trade.antwerp.push({ goodId, qty: take, amount: amount - shared, due: this.clock.t + ANTWERP_DAYS * 86400 });
    if (shared > 0.5) this.enter('shares', 'The sharers’ cut, on the Antwerp sale', 0);
    this.crown.syncCargoObjectives((id) => this.ship.quantityOf(id));
    this.logEvent('trade', `Consigned ${take.toFixed(0)} ${good(goodId).english.toLowerCase()} to the Casa's factor at Antwerp. He expects ${amount.toFixed(0)} cruzados, less freight, in about ${ANTWERP_DAYS} days.`);
    return `Shipped to Antwerp. About ${(amount - shared).toFixed(0)} cruzados to come, in ${ANTWERP_DAYS} days.`;
  }

  setQuintaladas(on: boolean): void {
    this.trade.quintaladas = on;
    const aboard = this.crew.officers.filter((o) => o.alive && !o.ashoreAt).length;
    this.ship.reservedTons = on ? aboard * CHEST_TONS : 0;
  }

  /** News you have heard that is still true, as far as you know. */
  get newsHeard(): { shock: Shock; def: ShockDef; heard: number }[] {
    return this.trade.shocks
      .filter((x) => this.trade.heard[x.id] !== undefined && this.clock.t - x.end < 60 * 86400)
      .map((x) => ({ shock: x, def: shockDef(x.key), heard: this.trade.heard[x.id] }))
      .sort((a, b) => b.heard - a.heard);
  }

  /** Close the book on one voyage and open the next. */
  private closeVoyageBook(): void {
    const b = currentBook(this.trade);
    if (b.entries.length === 0) return;
    const net = bookTotals(b).net;
    if (net > 0) this.practise('comercio', net);
    if (this.crew.count >= this.crew.complement * 0.85) this.practise('lideranca', 1);
    b.end = this.clock.t;
    this.trade.books.push({ n: b.n + 1, start: this.clock.t, entries: [] });
    if (this.trade.books.length > 12) this.trade.books.splice(0, this.trade.books.length - 12);
  }

  /**
   * Ship replacements at a port.
   *
   * The counterpart of `killHands`, and it exists for the same reason: losses
   * take named men, so replacements have to put named men back, or the fo'c'sle
   * empties out over a career while the muster reads full.
   *
   * What it costs is not a flat six cruzados a head. Men are cheap on a quay in
   * Lisbon where the voyage is understood and there is a queue; they are dear
   * at Mina, where what is known about the Guinea voyage is that people do not
   * come back from it, and dearer still in a foreign port where the ship is a
   * curiosity and the wage has to do the whole of the persuading.
   */
  shipHands(n: number): { ok: boolean; cost: number; message: string } {
    const def = this.portHere;
    if (!def) return { ok: false, cost: 0, message: 'She is not in a port.' };
    const want = Math.min(n, this.crew.complement - this.crew.count);
    if (want <= 0) return { ok: false, cost: 0, message: 'She is fully manned.' };
    const cost = this.handWage() * want;
    if (this.crown.gold < cost) {
      return { ok: false, cost, message: 'Not enough in the purse to sign them.' };
    }
    this.crown.gold -= cost;
    this.crew.count += want;

    // Put names back on the books, up to the size of the fo'c'sle the ship
    // started with — the captain knows about eight men, not the whole company.
    const known = this.hands.filter((h) => h.alive && h.aboard).length;
    const gaps = Math.min(want, Math.max(0, 8 - known));
    if (gaps > 0) {
      const fresh = signOnHands(
        this.rng, gaps, def.name, def.people === 'portuguese', this.hands,
      );
      this.hands.push(...fresh);
      this.logEvent('crew',
        `Shipped ${want} hands at ${def.name} for ${cost} cruzados. `
        + `${fresh.map((h) => h.name).join(', ')} came aft to be entered in the book, and the `
        + 'purser wrote them down without looking up.');
    } else {
      this.logEvent('crew', `Shipped ${want} hands at ${def.name} for ${cost} cruzados.`);
    }
    return {
      ok: true,
      cost,
      message: this.crew.count >= this.crew.complement
        ? 'The muster is full again.'
        : `${want} shipped. She is still ${this.crew.complement - this.crew.count} short.`,
    };
  }

  /** What a hand costs a month here, which is mostly about what is known here. */
  handWage(): number {
    const def = this.portHere;
    if (!def) return 6;
    let wage = def.people === 'portuguese' ? 6 : 11;
    // Where the ship's own reputation has got about, it is either a help or the
    // reverse, and the reverse is more expensive than the help is cheap.
    const rel = this.relationsFor(def.id);
    wage *= 1 - clamp(rel.regard, -1, 1) * 0.18;
    // And what it is known she is going to do with them.
    if (Math.abs(def.lat) < 15 && def.people === 'portuguese') wage *= 1.4;
    return Math.max(4, Math.round(wage));
  }

  /**
   * Men killed all at once, which is not the same as men dying one at a time.
   *
   * The daily attrition takes a named man occasionally and by chance. An action
   * takes several in an afternoon, and the ones it takes are named first,
   * because the whole point of having written the fo'c'sle down is that the
   * cost of a decision has somebody's name on it.
   */
  killHands(n: number, fate: string): void {
    if (n <= 0) return;
    this.crew.count = Math.max(0, this.crew.count - n);
    this.crew.deaths += n;
    const live = aboardHands(this.hands);
    for (let i = 0; i < Math.min(n, live.length); i++) {
      const man = live[Math.floor(this.rng.next() * live.length)];
      if (!man.alive) continue;
      man.alive = false;
      man.aboard = false;
      man.fate = fate;
      man.fateT = this.clock.t;
    }
  }

  /**
   * Men left in a station, which is not the same as men lost.
   *
   * They come off the muster and off the ship's work with names attached, and
   * they go back on it if the place is ever shut up and they are brought away.
   * Doing this by decrementing `crew.count` alone left the fo'c'sle list saying
   * twenty-four men were aboard a ship being worked by eighteen.
   */
  landHands(n: number, where: string): string[] {
    const names: string[] = [];
    if (n <= 0) return names;
    const live = aboardHands(this.hands);
    // The fo'c'sle list is a named *sample* of the company — eight men out of
    // twenty-four — so a party leaving has to take its share of the sample and
    // not its share of the ship. Taking `n` named men for `n` hands stripped
    // six of the eight into a shed and left the ship being worked by two men
    // with names and sixteen without.
    const share = Math.max(1, Math.round(n * (live.length / Math.max(this.crew.count, 1))));
    this.crew.count = Math.max(0, this.crew.count - n);
    for (let i = 0; i < Math.min(share, live.length); i++) {
      const man = live[Math.floor(this.rng.next() * live.length)];
      if (!man.aboard) continue;
      man.aboard = false;
      man.fate = `Left in the factory at ${where}.`;
      man.fateT = this.clock.t;
      names.push(man.name);
    }
    return names;
  }

  /** And the other way, when a station is shut up and its people come away. */
  recoverHands(n: number, where: string): void {
    if (n <= 0) return;
    this.crew.count += n;
    // All of them: whatever was landed there is what comes back, and the list
    // is the only record of who that was.
    let want = this.hands.length;
    for (const h of this.hands) {
      if (want <= 0) break;
      if (h.alive && !h.aboard && h.fate?.includes(where)) {
        h.aboard = true;
        h.fate = undefined;
        h.fateT = undefined;
        want--;
      }
    }
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

  /** How much more a master's canvas draws. See the seamanship tree. */
  private get skillSail(): number {
    return (this.can('crowd') ? 1.05 : 1) * (this.can('driveAcross') ? 1.08 : 1);
  }

  private runPhysics(dt: number): StepResult {
    const sail = this.skillSail;
    if (this.ship.skillSail !== sail) { this.ship.skillSail = sail; this.ship.refreshDerived(); }
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

    this.lastStepHours = simDt / 3600;
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
    // Outside rollIncidents on purpose. A sail on the horizon is not an
    // incident competing for the event slot — it is a thing that is there — and
    // while it lived behind the incident cooldown the busiest water in the
    // world produced one sighting a month instead of one a week.
    this.checkForSails(simDt / 86400);
    this.updateEncounter(simDt);
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
    // second and a half. The watch always have the helm, so it is always a
    // second.
    const maxStep = 1;
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
      // Backing her astern is the one time nobody is steering to a course:
      // she is being walked out of trouble stern-first and the rudder is no
      // use to her at all.
      if (!this.backing) this.steerToCourse(dt);
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
    const want = this.courseToSteer();

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
  /**
   * The course the watch are keeping her on.
   *
   * Never nothing, because there is always an answer to "what are you
   * steering?" aboard a ship under way. The captain's own order comes first;
   * failing that the bearing of the mark she is laid off for; failing that the
   * last course she was steadied on, which is what a watch does when the
   * quarterdeck has stopped saying anything.
   */
  courseToSteer(): number | null {
    const dest = this.courseToDestination();
    if (this.helmOrder === null && !dest && this.standingCourse === null && !this.latitudeOrder) {
      this.standingCourse = wrap360(this.ship.state.heading);
    }
    // A town the lookout can see is steered for by eye, whatever the board or
    // the parallel being run says.
    const port = this.route[0]?.portId;
    const eye = dest && port && this.townInSight(port) ? dest.bearing : null;
    const wanted = this.helmOrder ?? this.chaseCourse() ?? eye ?? this.coastCourse() ?? this.latitudeCourse()
      ?? dest?.bearing ?? this.standingCourse;
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
    const prudent = this.canvasCeiling;
    const now = this.ship.canvasSet;

    // Anything she is carrying is taken as the standing order, whoever set it,
    // up to what the weather allows. Without this the watch will strike sail she
    // is safely carrying because some code path put canvas on her without going
    // through setCanvas — and a ship that silently furls everything and lies
    // there is the worst possible bug to hand a player who asked for less work.
    //
    // It used to adopt the canvas only when it was already at or under the
    // ceiling, which left the gap it exists to close: set her *above* the
    // ceiling and the watch furled the lot instead of easing her to it. Taking
    // the lesser of the two is what the sentence above always meant.
    if (now > this.orderedCanvas) this.orderedCanvas = Math.min(now, prudent);

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
   * What the monsoon is doing, if this water has one. See navigation/monsoon.
   *
   * A readout rather than a calculation: the wind model has always known, and
   * this is the first thing in the game that asks it.
   */
  monsoonNow(): MonsoonRead | null {
    return readMonsoon(this.ship.state.pos, this.clock.dayOfYear);
  }

  /** Whether the pilot has explained the monsoon. Once a career is enough. */
  private monsoonToldOnce = false;
  /** And the tide, likewise. */
  private tideToldOnce = false;

  /** What the water is doing under her, when she is where it matters. */
  tideNow(): TideRead | null {
    if (this.sounding.shoreDistNm > 30) return null;
    return readTide(this.ship.state.pos, this.clock.t);
  }
  /** So the warning about sailing against the season is given once a season. */
  private monsoonWarnedT = -1e9;

  /**
   * The pilot on the monsoon, and then on sailing against it.
   *
   * Two separate things, and the second is the one that kills people. Being
   * told that the wind reverses is general knowledge; being told, while the
   * ship is standing west across the Arabian Sea in July, that this passage
   * takes three months instead of three weeks and that the water will run out,
   * is a warning about what is happening now.
   */
  private watchTheMonsoon(): void {
    if (this.anchored || this.dockedAt) return;
    const m = this.monsoonNow();
    if (!m || m.grip < 0.25) return;

    if (!this.monsoonToldOnce) {
      this.monsoonToldOnce = true;
      const said = pilotOnTheMonsoon(m);
      this.pushAlert(said, 'note');
      this.logEvent('note', said, true);
      return;
    }

    // Standing the wrong way across it, with the season against her.
    if (this.clock.t - this.monsoonWarnedT < 90 * 86400) return;
    if (this.physics.speedKnots < 1.5) return;
    const course = this.physics.courseOverGround;
    if (!setsAgainst(m, course)) return;
    // Only out on the open sea, where the passage is the thing at stake.
    if (this.sounding.shoreDistNm < 90) return;
    this.monsoonWarnedT = this.clock.t;
    const said = `The pilot: "You are going the wrong way for the season, senhor. The `
      + `${m.name.toLowerCase()} has ${Math.round(m.daysToTurn)} days to run and it is dead `
      + `against us. We will do it, and it will take three months to do three weeks of work, `
      + `and I would rather lie in a harbour and wait than bury the people."`;
    this.pushAlert(said, 'warning');
    this.logEvent('note', said, true);
    this.easeTheClock(3);
  }

  /**
   * The pilot on the tide, the first time she is in water that has one.
   *
   * Said inshore, because that is where it matters and where a master would
   * raise it — three metres of range is a sentence about the Tagus, not a
   * fact about the ocean.
   */
  private watchTheTide(): void {
    if (this.tideToldOnce) return;
    const r = this.tideNow();
    if (!r || r.range < 1.8) return;
    if (this.sounding.shoreDistNm > 18) return;
    this.tideToldOnce = true;
    const said = pilotOnTheTide(r);
    this.pushAlert(said, 'note');
    this.logEvent('note', said, true);
  }

  /**
   * Lie in this harbour until the wind comes round.
   *
   * What every hull in that ocean did, and the reason the harbours were full.
   * It is not a free skip: the wages run, the stores go, the men go ashore and
   * some of them do not come back, and the commission's dates do not move.
   */
  waitForTheMonsoon(): string {
    // Only in a harbour. A ship hove to in the middle of the Arabian Sea for
    // four months is not waiting out the monsoon, she is dying of it: the
    // crew simulation is a ship at sea, and over that many days it correctly
    // kills everybody aboard. What the Arab and Gujarati shipping actually did
    // was lie in a port, where the men go ashore and the hull is pumped.
    if (!this.dockedAt) {
      return 'Not out here. A ship waits out the monsoon in a harbour, with her people ashore '
        + 'and somebody on the pumps, or she does not wait it out at all.';
    }
    const m = readMonsoon(this.ship.state.pos, this.clock.dayOfYear);
    if (!m) return 'This is not monsoon water. The wind here does what it likes.';
    // To the turn, and then far enough past it that the new monsoon has
    // actually set in: the phase does not reach the threshold that counts as a
    // season until a fortnight after it crosses zero, so waiting only to the
    // crossing put her back to sea in the middle of the calms she was avoiding.
    const days = Math.max(1, Math.round(m.daysToTurn + 26));
    // Four months at anchor is four months of eating.
    //
    // Without this the button quietly killed the ship's company: waitDays runs
    // the crew simulation for every one of those days, the casks empty around
    // day eighty, and the game ended in the middle of what the player had been
    // told was a sensible piece of seamanship. The harbours of that ocean were
    // full of ships waiting out the monsoon and every one of them had victualled
    // for it first.
    const keeps = enduranceDays(this.crew, this.ration);
    if (keeps < days + 10) {
      return `The wind turns in ${Math.round(m.daysToTurn)} days and there is a month of calms `
        + `after it — call it ${days} days at anchor. She has ${Math.floor(keeps)} days of `
        + 'stores in her. Victual her for the season first, or there will be nobody aboard to '
        + 'sail when the wind comes round.';
    }
    const was = m.name.toLowerCase();
    this.waitDays(days);
    const after = readMonsoon(this.ship.state.pos, this.clock.dayOfYear);
    this.logEvent('note',
      `Lay at anchor ${days} days for the monsoon to turn. The ${was} went out in the middle of `
      + 'the month and there was a fortnight of thunder and dead calm, and then one morning the '
      + `wind was in the other quarter and every hull in the road was getting her anchor at `
      + 'once.', true);
    return `${days} days at anchor. It is the ${(after?.name ?? 'season').toLowerCase()} now.`;
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

  /**
   * Keep the book, a watch at a time.
   *
   * Everything the pilot writes is written from what the ship actually did, so
   * the roteiro is a record of this voyage and not a list of unlockables. The
   * sea is the part that has to be accumulated rather than noticed: one glance
   * at the wind tells you nothing, and thirty hours in the same square in the
   * same month tells you the trade holds from the north-east — which is the
   * single most valuable thing a pilot of this century could own.
   */
  private keepTheBook(simDt: number): void {
    if (this.anchored || this.dockedAt) return;
    const hours = simDt / 3600;
    this.rutter.observeSea(
      this.nav.estimated, this.clock.date.month,
      this.weatherNow.wind.from, this.weatherNow.wind.speed,
      this.currentToward, this.currentKnots, hours,
    );

    // Once a square is well enough observed, it goes onto a page as a rule.
    if (this.clock.t - this.lastSeaWrite < 6 * 3600) return;
    this.lastSeaWrite = this.clock.t;
    const month = this.clock.date.month;
    const s = this.rutter.sea.get(regionKey(this.nav.estimated, month));
    if (!s || s.hours < 30) return;
    const key = `sea:${s.key}`;
    if (this.rutter.find(key) && this.rutter.find(key)!.notes.length > 0) return;
    const { entry } = this.rutter.open(
      'passage', key,
      `The sea in ${Math.abs(s.lat)}\u00b0${s.lat < 0 ? 'S' : 'N'}, `
      + `${Math.abs(s.lon)}\u00b0${s.lon < 0 ? 'W' : 'E'}`,
      this.nav.estimated, this.clock.t,
    );
    this.rutter.note(entry, seaSentence(s), 'observed', this.clock.t,
      { fact: { tag: 'winds', target: s.key } });
  }

  private updateNavigation(simDt: number): void {
    const pos = this.ship.state.pos;
    const eff = this.effectiveSkill;
    const navSkill = skill(eff, 'navegacao');
    this.nav.leewayAllowance = this.skills.navegacao >= 15 ? 0.85 : 0;
    // The board kept properly is worth more than any instrument aboard, and
    // what an old pilot taught you stacks with it.
    this.nav.driftScale = (this.can('deadReckoning') ? 0.5 : 1)
      * (this.has('oldPilotsHand') ? 0.67 : 1)
      // The chart room. See ship/upgrades.
      * this.ship.effects.reckoning;

    const hours = simDt / 3600;
    this.distanceRun += Math.abs(this.physics.speedKnots) * hours;
    const overGround = this.physics.groundKnots * hours;
    this.groundRun += overGround;
    this.runSinceNoon += overGround;

    this.nav.integrate(
      simDt, pos, this.ship.state.heading, this.physics.speedKnots,
      this.physics.leeway, this.weatherNow.wind.from, this.weatherNow.wind.speed,
      navSkill, this.clock.t, this.allowedSet(pos),
    );
    this.takeBearings(pos);

    this.chart.logTrack(this.nav.estimated, this.clock.t);
    this.keepTheBook(simDt);
    this.watchForTheTurn(hours);
    this.watchTheMonsoon();
    this.watchTheTide();

    // Chart whatever the lookout can see, at intervals.
    if (this.clock.t - this.lastSurveyT > 900) {
      this.lastSurveyT = this.clock.t;
      const range = sightingRangeNm(this.ship.mastHeight, this.weatherNow.visibility)
        * (this.can('farSight') ? 1.33 : 1);
      // Closing the traverse: each sighting counts for half as much again.
      const tk = this.can('traverse') ? 0.82 : 1;
      if (this.sounding.shoreDistNm < range) {
        const result = this.chart.survey(
          pos, this.nav.estimated, range, this.clock.t, skill(eff, 'cartografia'),
          // What the sighting is worth is what the pilot's position is worth.
          // A cape laid down an hour after a noon sight is worth having; the
          // same cape laid down at the end of three weeks of blue water is a
          // guess, and the chart treats it as one.
          this.nav.sigmaLat * tk, this.nav.sigmaLon * tk, this.nav.legNm, this.nav.legNmLat,
        );
        if (result.milesTaken > 0) this.practise('cartografia', result.milesTaken);
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
          this.chartedThisPassage += result.milesTaken;
          this.correctedNm += result.improvedNm ?? 0;
          this.announceSurvey(result);
        }
        if (result.fresh.length > 0) this.raiseNewCoast(result.fresh, pos);
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
      this.weatherNow.cloud, this.weatherNow.visibility, this.nav.almanac,
    );
    // `sightOpportunities` is given the books now, so `available` already means
    // "can be seen *and* can be worked" and `canWork` is only a second pair of
    // eyes on it.
    const usable = opps.filter((o) => o.available && this.canWork(o.body));
    const grave = this.nav.sigmaLat > 24;

    if (usable.length === 0) {
      if (!grave) return;
      this.lastSightWord = this.clock.t;
      // Short, and about the thing he can do something about.
      //
      // This used to lowercase whichever reason the sun happened to carry and
      // paste it into the sentence. That was survivable while the reasons were
      // three words about cloud; once the sun started explaining that the
      // Regimento do Norte is a rule for the pole star and has no solar
      // declination in it, the alert became a paragraph in the corner of the
      // screen with a lower-case R.
      const sun = opps.find((o) => o.body === 'sun');
      const pole = opps.find((o) => o.body === 'polaris');
      const noTables = this.nav.almanac.solarError === null;
      const poleGone = pole ? /below the horizon/i.test(pole.reason ?? '') : false;
      if (noTables && poleGone) {
        this.pushAlert(
          'No latitude to be had at all — the pole star is under the horizon astern and there '
          + 'are no solar tables aboard. The reckoning is all you have until you buy the '
          + 'Regimento do Astrolábio (Fitting out, in port).', 'grave');
      } else if (noTables) {
        this.pushAlert(
          'No latitude again today. The sun is no use without solar tables — the Regimento do '
          + 'Astrolábio, 220 cruzados under Fitting out in port — so it wants a clear night and the '
          + 'pole star.', 'warning');
      } else {
        const why = (sun?.reason ?? 'nothing to be had').replace(/\.$/, '');
        this.pushAlert(`No latitude again today — ${why.charAt(0).toLowerCase()}${why.slice(1)}.`,
          'warning');
      }
      return;
    }

    this.lastSightWord = this.clock.t;
    const best = usable[0];
    const days = (this.clock.t - this.nav.lastFixT) / 86400;
    // The sun is on the meridian for about an hour and a half, and at a watch a
    // The sun is on the meridian for about an hour and a half, and at a watch a
    // second that is four seconds of the player's life. The offer was being
    // made and then withdrawn before anybody could reach for the quadrant, so
    // in practice the sight — which is the whole of how a pilot knows his
    // latitude — was something that only ever happened by accident. The clock
    // comes down for it, the way the ship would be called.
    //
    // But only when it is worth calling the ship for. Before the solar tables
    // the sun cannot be worked at all, so this fired rarely; the moment they
    // are bought it can be worked every clear noon, and the clock was being
    // hauled down to a watch a second every single day of a three-month
    // passage. That is not a prompt, it is a stutter — and the player who has
    // just spent two hundred and twenty cruzados making his navigation better
    // is precisely the one being punished for it.
    //
    // So the ship is called when the sight actually matters: when the
    // reckoning has gone bad, or when nothing has been observed for days. On an
    // ordinary noon with good tables and a fresh fix it is one line in the
    // corner, and the passage runs on.
    const worthStopping = grave || days > 3;
    if (worthStopping) this.easeTheClock(2);
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
   * the first time a stretch the Casa only had hearsay for is run in person and
   * goes down as survey, which is the moment the mapmaking becomes real.
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
    // Under a dozen miles is a headland coming abeam, not a survey.
    if (result.milesTaken < 12) return;
    if (result.fresh.length > 0) {
      this.pushAlert(
        `The escrivão is drawing coast nobody has drawn before — ${Math.round(result.milesTaken)} miles of it.`,
        'note');
      return;
    }
    if (result.corrected > 0) {
      this.pushAlert(
        'Coast the Casa only had hearsay for, run in person and entered as survey.',
        'note');
      this.logEvent('navigation',
        'Ran the coast in sight all forenoon. It is on the Lisbon chart, but on it the way a '
        + 'thing is when nobody who drew it had been there — a line copied from a line. It is '
        + 'ours now, with a pilot\u2019s name against it.');
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

    // Rain into the casks, and fish over the side. See ship/upgrades.
    if (!this.dockedAt) {
      const fx = this.ship.effects;
      const pv = this.crew.provisions;
      if (fx.rainCatch && this.weatherNow.rain > 0.3) {
        pv.water = Math.min(pv.water + days * this.weatherNow.rain * 3, 100 + fx.water);
      }
      if (fx.fishing && this.sounding.depth < 200 && Math.abs(this.physics.speedKnots) < 7) {
        pv.fresh = Math.min(pv.fresh + days * 0.9, 30);
      }
    }

    const w = this.wardroom;
    const events = updateCrew(this.crew, {
      days,
      ashore: this.anchored && this.dockedAt !== null,
      // What this particular place can put aboard. An emporium feeds a crew;
      // an open anchorage on a desert coast does not.
      ashoreVictuals: this.dockedAt ? portDef(this.dockedAt).refit : 0,
      ration: this.ration * (this.can('hardRations') ? 0.88 : 1),
      leadership: skill(eff, 'lideranca'),
      surgeonQuality: (surgeon ? surgeon.ability : 0) + w.physic,
      exertion,
      beyondTheKnown: this.beyondTheKnown,
      gold: this.crown.gold,
      rng: this.rng,
      // The surgeon's book, if he ever finished it.
      surgeonBook: this.has('theRemedy'),
      galley: this.ship.effects.scurvy,
      physic: this.ship.effects.sickness,
      // A chaplain who has made his peace with a larger world is worth more to
      // the men than one who is certain about everything.
      wardroomMoraleBonus: this.has('cureOfSouls') ? 0.004 : 0,
      captainLoved: this.can('loved'),
      captainFeared: this.can('feared'),
      wardroomMorale: w.morale,
      // Authority conceded in front of the ship's company is authority spent.
      // A captain who has given the men what they came aft for finds them
      // coming aft again sooner, which is the cost of the easy answer and is
      // what the scene promises will happen.
      wardroomUnrest: w.unrest * (1 + (this.crew.conceded ?? 0) * 0.22),
      // A company who would follow you anywhere do not fear anywhere.
      wardroomFear: w.fear * (this.can('followAnywhere') ? 0.2 : 1),
    });

    this.driftRegard(days);

    for (const e of events) {
      this.pushAlert(e.message, e.severity);
      this.logEvent('crew', e.message, e.severity === 'grave');
      if (e.kind === 'mutiny') this.handleMutiny();
      if (e.kind === 'death') this.buryTheNamed();
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
    // A ship worked gently wears at half the rate; one pressed hard wears faster.
    const usage = this.can('spare') ? 0.5 : this.can('press') ? 1.35 : 1;
    const wear = this.ship.age(days * usage, tempFactor, this.pumpEffort * crewFactor(this.crew, this.ship.baseHull.crewMin));
    if (wear.swamped) {
      if (this.reprieve('She was going down by the head. Every man who could stand was put on the pumps and the rest bailed with buckets, and at the end of the second night she was floating.')) {
        this.ship.condition.bilge = this.ship.holdCapacity * 0.2;
      } else {
        this.endGame('She filled faster than the pumps could clear her, and went down by the head.');
        return;
      }
    }
    for (const s of wear.spoiled) {
      this.logEvent('note', `The ${s.toLowerCase()} in the hold is spoiled past saving and has been thrown over the side.`);
    }
    // A sailmaker and spare canvas: blown-out sails are mended at sea.
    if (this.ship.effects.sailRepair) {
      for (const sl of this.ship.state.sails) sl.condition = Math.min(1, sl.condition + days * 0.06);
    }
    // What the damp took, at what it cost: one line a good in the voyage's books.
    for (const l of wear.lost) {
      const book = currentBook(this.trade);
      const text = `${good(l.goodId).english} spoiled in the hold`;
      const e = book.entries.find((x) => x.kind === 'spoiled' && x.text === text);
      if (e) e.amount -= l.qty * l.cost;
      else book.entries.push({ t: this.clock.t, kind: 'spoiled', text, amount: -l.qty * l.cost });
    }

    if (this.ship.condition.bilge > this.ship.holdCapacity * 0.28) {
      this.pushAlert('She is making more water than the pumps are clearing. Put more hands on them.', 'warning');
    }

    if (!this.anchored) {
    }

    this.checkStormDamage(days);
  }

  private checkStormDamage(days: number): void {
    const wind = this.weatherNow.wind.speed;
    const prudent = prudentCanvas(wind);
    const carried = this.ship.canvasSet;
    const eff = this.effectiveSkill;
    const seamanship = skill(eff, 'marinharia');
    // Pressing her is paid for here and nowhere else.
    const sparHazard = (this.can('press') ? 1.85 : this.can('spare') ? 0.4 : 1) * (this.can('driveAcross') ? 0.5 : 1)
      // A ship drawn with more canvas than her spars were ever meant to carry.
      * (this.ship.baseHull.sparStrain ?? 1);

    if (carried > prudent + 0.05 && wind > 14) {
      const over = carried - prudent;
      const risk = clamp(over * over * (wind / 40) * days * 3.2 * (1 - seamanship * 0.55) * sparHazard, 0, 0.85);
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
        if (this.rng.chance(0.3)) {
          this.damageTheBook('torn', 1, 'the case went over with the spar and a page is gone.');
        }
      }
    }

    if (this.weatherNow.waveHeight > 5.5) {
      // Knowing how to lie-to is the difference between a sea that comes aboard
      // and a sea that passes under her.
      const handled = this.can('lieTo') ? 0.25 : this.can('spare') ? 0.6 : 1;
      const risk = clamp((this.weatherNow.waveHeight - 5.5) * days * 0.11 * handled, 0, 0.7);
      if (this.rng.chance(risk)) {
        const dmg = this.rng.range(0.02, 0.11) * (this.can('spare') ? 0.5 : 1);
        this.ship.damage(dmg);
        this.pushAlert('A sea came aboard and started the seams forward.', 'warning');
        this.logEvent('peril', `A heavy sea broke over the bow and worked the topsides. She is making water. Pumps manned in both watches.`);
        // The book was in the round-house with everything else that got wet.
        if (this.rng.chance(0.45)) {
          this.damageTheBook('water', this.rng.int(1, 3),
            'a sea got into the round-house and into the roteiro.');
        }
      }
    }
  }

  /**
   * What the men forward make of the voyage, a day at a time.
   *
   * Every man's regard walks toward a target set by the conditions he is
   * actually living in — the ration he is on, when he last stood on ground, how
   * long since anything fresh, how many of them are sick, and whether the
   * captain is a man they have decided they would follow. Doing it as a drift
   * rather than as a hook on every event means a bad passage is felt as a bad
   * passage, cumulatively, which is how a crew really turns: not because of one
   * thing but because of ten weeks of it.
   *
   * A brittle man falls further and faster on the same conditions, so the
   * sullen hand is the one who has stopped believing in you months before the
   * steady one has, and he is the one who ends up out in front when they come
   * aft.
   */
  private driftRegard(days: number): void {
    const live = aboardHands(this.hands);
    if (live.length === 0) return;
    const p = this.crew.provisions;

    let target = 0.55;
    if (this.ration < 1) target -= (1 - this.ration) * 0.45;
    if (p.water < 20) target -= clamp((20 - p.water) / 20, 0, 1) * 0.35;
    if (p.biscuit < 20) target -= clamp((20 - p.biscuit) / 20, 0, 1) * 0.25;
    if (this.crew.daysWithoutFresh > 45) {
      target -= clamp((this.crew.daysWithoutFresh - 45) / 70, 0, 1) * 0.3;
    }
    if (this.crew.daysSinceLandfall > 50) {
      target -= clamp((this.crew.daysSinceLandfall - 50) / 80, 0, 1) * 0.3;
    }
    target -= clamp(this.crew.scurvy, 0, 1) * 0.25;
    target -= clamp(this.crew.fatigue - 0.5, 0, 0.5) * 0.3;
    // A captain the men have decided about. Loved and feared pull opposite ways
    // here on purpose: fear keeps the ship working and does not buy affection.
    if (this.can('loved')) target += 0.14;
    if (this.can('feared')) target -= 0.06;
    if (this.has('cureOfSouls')) target += 0.06;
    target = clamp(target, 0.05, 0.95);

    // Slow. Ten weeks of a bad passage, not ten days.
    const k = 1 - Math.exp(-days / 26);
    for (const h of live) {
      const pull = h.regard < target ? 1 : TEMPER[h.temper].brittle;
      h.regard = clamp(h.regard + (target - h.regard) * k * pull, 0, 1);
    }
  }

  /**
   * When the mortality takes men, decide whether it took one you knew.
   *
   * The chance is the named men's share of the whole complement, so this adds
   * no deaths and removes none — it only decides, honestly, whether the number
   * that just went down had a name attached to it. A ship of twenty-four with
   * eight named men reports a name about a third of the time, which is what it
   * should be, and the other two thirds are the men the captain genuinely did
   * not know, which is also true and is most of why the figure is horrifying.
   */
  private buryTheNamed(): void {
    const live = aboardHands(this.hands);
    if (live.length === 0) return;
    const share = live.length / Math.max(live.length, this.crew.count + 1);
    if (!this.rng.chance(share)) return;
    const man = live[Math.floor(this.rng.next() * live.length)];
    man.alive = false;
    man.aboard = false;
    man.fate = this.crew.scurvy > 0.3
      ? 'Died of the scurvy and was put over the side.'
      : 'Died at sea and was put over the side after the Salve.';
    man.fateT = this.clock.t;
    // A man they all knew. The ones who are left take it personally, and a
    // little of it attaches to the captain who brought them out here.
    shiftAll(this.hands, -0.04, `${man.name} died at sea.`);
    this.logEvent('crew',
      `${man.name}, of ${man.from}, is dead. He was sewn into his hammock with a shot at his feet `
      + 'and put over the side, and the ship was hove to for as long as it took, which was not long.',
      true);
    this.pushAlert(`${man.name} is dead.`, 'grave');
  }

  /**
   * They have come aft. See game/mutiny — this is a scene with a named man in
   * front of it now, not a roll against Leadership.
   */
  private handleMutiny(): void {
    // One at a time. Unrest stays over the line until the scene is answered, so
    // without this every crew tick queued another mutiny behind the one already
    // on screen — a queue that grows for as long as the player is reading it.
    if (this.pendingEvent?.id === 'mutiny'
        || this.pendingScenes.some((s) => s.id === 'mutiny')) {
      return;
    }
    // Nobody dares; or the lash has put it down before it came to anything.
    if (this.can('nobodyDares') || (this.can('lash') && this.rng.chance(0.5))) {
      this.crew.unrest = this.can('nobodyDares') ? 0.2 : 0.35;
      this.logEvent('crew', 'There was talk in the forecastle. It stopped when you came forward, and it did not start again.');
      return;
    }
    const scene = mutinyScene(this);
    if (scene) {
      this.pendingScenes.push(scene);
      return;
    }
    // Nobody aboard is willing to lead one. That is not nothing happening: it
    // is the reward for a career of keeping them fed and landing them, and it
    // deserves to be said out loud rather than passed over in silence.
    this.crew.unrest = 0.35;
    this.crew.morale = clamp(this.crew.morale + 0.06, 0, 1);
    this.logEvent('crew',
      'There was a good deal of talk forward and it came to nothing, because when it came to it '
      + 'there was nobody willing to be the man standing in front. The boatswain reports it as a '
      + 'grumble. It is more than that, and it is also less.', true);
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
        if (away > 0.6) {
          this.cryLandRaised(bearing, away);
          // Whether the offing paid. A captain who aimed thirty miles up the
          // coast on purpose now knows which way to turn; one who steered
          // straight at the harbour has a coin to flip.
          const advice = this.landfallAdvice();
          if (advice && away > 2) {
            this.logEvent('landfall', advice.text, true);
            this.pushAlert(advice.sure
              ? 'You know which way to run. That is what the offing was for.'
              : 'Which way along the coast? Nobody aboard can say.', advice.sure ? 'note' : 'warning');
          }
          // And the question the log line never asked: which coast is this?
          // Answering it is the best fix in the game and answering it wrong is
          // the worst thing that can happen to a reckoning.
          if (away > 2) {
            const scene = landfallScene(this);
            if (scene) this.pendingScenes.push(scene);
          }
        }
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

      // Shoaling water: said once on going in, and then she is left alone.
      //
      // This had no latch on it at all. `checkWorldEvents` runs every tick, so
      // for as long as the lead had anything under it the clock was pulled back
      // to four times *on every frame* — the player would wind it up, watch it
      // drop again immediately, and end up limping across a shelf at four
      // times because the game would not let go of the wheel. Every other place
      // the clock is eased is a one-shot: the cry of land, a sail raised, the
      // watch shortening sail. This is now one too.
      //
      // The warning is still grave and it still comes down the first time, which
      // is the point of it. What it no longer does is take the decision away and
      // keep taking it.
      if (this.sounding.shoaling && !this.wasShoaling) {
        this.easeTheClock(2);
        this.pushAlert(
          `By the lead, ${this.sounding.depth.toFixed(0)} fathoms shoaling — land bears ${formatBearing(bearing)}`,
          'grave',
        );
      }
      this.wasShoaling = this.sounding.shoaling;
    }

    // Landmarks of the route.
    const landmarks = this.crown.checkLandmarks(pos, this.lastLat);
    this.lastLat = pos.lat;
    if (pos.lat < this.deepestSouth) this.deepestSouth = pos.lat;
    for (const l of landmarks) {
      this.writeCoast(l.name, this.nav.estimated, l.announce);
      this.logEvent('discovery', l.announce, true);
      // These are the peaks of the whole game. Reaching one is a decision about
      // what to do with it — claim it, survey it, or spend nothing and press on
      // — rather than a line in the log and seven per cent of morale. The
      // renown and the objective are awarded by whichever is chosen.
      this.pendingScenes.push(landmarkScene(this, l));
    }

    // Headlands and river mouths, which is where names and pillars go.
    //
    // Offered when she is up with one *and* it is actually in sight — a cape
    // raised in a fog at fifteen miles is a cape nobody has seen. Once each,
    // whether or not it was named, because a captain who stood on past it does
    // not get the choice again on the way home; somebody else has it by then.
    const f = featureNear(pos);
    if (f && !this.foundFeatures.includes(f.id)) {
      const range = sightingRangeNm(this.ship.mastHeight, this.weatherNow.visibility);
      if (this.sounding.shoreDistNm < range) {
        this.foundFeatures.push(f.id);
        this.easeTheClock(2);
        this.pendingScenes.push(featureScene(this, f, saintOfDay(this.clock)));
      }
    }

    this.watchForLand();

    // The first time she is south of anything in the Portuguese record.
    if (!this.passedTheKnown && pos.lat < BEYOND_LAT) {
      this.passedTheKnown = true;
      this.pendingScenes.push(beyondScene(this));
    }

    // The questions a passage turns on: where to cross the line, how to round
    // the Cape, whether the water will reach. Hourly, one at a time.
    if (this.clock.t - this.lastPassageCheck > 3600 && !this.dockedAt && !this.anchored
        && !this.pendingEvent && this.pendingScenes.length === 0) {
      this.lastPassageCheck = this.clock.t;
      const q = passageQuestion(this, this.passageRecord);
      if (q) {
        this.easeTheClock(2);
        this.pendingScenes.push(q);
      }
    }

    // The long stories, when a beat of one happens out here.
    if (this.clock.t - this.lastQuestCheck > 1800 && !this.dockedAt && !this.pendingEvent) {
      this.lastQuestCheck = this.clock.t;
      this.checkStory();
    }

    // Ports coming into view.
    if (this.clock.t - this.lastPortCheck > 1800) {
      this.lastPortCheck = this.clock.t;
      const range = sightingRangeNm(this.ship.mastHeight, this.weatherNow.visibility);
      for (const near of portsNear(pos, range)) {
        const charted = this.chart.ports.get(near.def.id);
        this.crySettlementRaised(near.def, near.at, near.distNm);
        // A town in sight is laid down where the reckoning puts it — once a
        // day at most, so a long look is one sighting and not forty.
        if (charted && (charted.visited || this.clock.t - charted.t < 86400)) continue;
        const isNew = this.chart.chartPort(
          near.def, this.nav.estimated, pos, this.clock.t, false,
          this.nav.sigmaLat, this.nav.sigmaLon, this.nav.legNm, this.nav.legNmLat,
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

    if (!known && !last) {
      // The first sight of a town nobody has put on a chart. Everything
      // stops for it, the glass swings round to it, and the whole ship is at
      // the rail.
      this.easeTheClock(1);
      this.lookCue = { bearing, id: ++this.lookCueId };
      this.announceDiscovery('sighted', 'Raised from the masthead',
        'A town no chart has shown', townLooks(def),
        `${word}, ${distNm.toFixed(0)} miles \u00b7 ${this.clock.formatDate()}`);
    }
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
    // A written scene jumps the queue. The cooldown exists to keep rolled
    // incidents from arriving on top of each other; a landfall or a landmark is
    // a thing that is happening *now*, and holding it back a day and a half
    // meant the identification of a coast was offered after she had run past it.
    if (this.eventCooldown > 0 && this.pendingScenes.length === 0) return;

    this.checkArrival();
    this.checkLeads();
    this.checkVentures(days);
    this.checkFinance(days);
    this.tickEstate();
    this.advanceRival(days);

    // A beat of somebody's story outranks everything: these are the moments the
    // voyage is actually about, they are written rather than rolled, and each
    // one is only ever offered once in a career.
    const event = rollGaleScene(this)
      ?? this.pendingScenes.shift()
      ?? this.rollArcBeat()
      ?? rollRivalMeeting(this, days)
      ?? rollOfficerEvent(this, days)
      ?? rollSeaEvent(this, days);
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
   * The next beat of a written officer's story, if one is due.
   *
   * Beats are conditions rather than dice: a man's story advances when the
   * voyage has actually put him in the position the beat is about, which is why
   * two captains never see the same arc at the same time and why skipping past
   * one is impossible. A degredado's second beat waits until he is over the
   * side; the surgeon's first waits until there is scurvy aboard to have a
   * theory about.
   */
  private rollArcBeat(): SeaEvent | null {
    for (const o of this.crew.officers) {
      if (!o.arc || !o.alive) continue;
      const served = (this.clock.t - (o.joined ?? this.startT)) / 86400;
      const due = dueBeat({ g: this, o, served });
      if (!due) continue;
      // Marked resolved as it is offered, so a player who shuts the window
      // without answering does not see it again on the next step.
      o.arcStage = due.index + 1;
      return due.beat.build({ g: this, o, served });
    }
    return null;
  }

  /**
   * Put one of the written officers aboard, if he is not already.
   *
   * They are finite and they are the point: a career has room for four or five
   * of these men, and which of them you sailed with is most of what makes one
   * captain's story different from another's.
   */
  /**
   * The company she sails with, put aboard before the first voyage.
   *
   * There used to be a chandler's list of officers at every port — a pilot for
   * ninety cruzados, a surgeon for sixty — and three anonymous men aboard at
   * the start who existed to be replaced by them. That is a shop, and a shop is
   * the wrong shape for the thing this game is actually about: these six are
   * the people the twenty years happen to, each with a name on the quay, a
   * reason for wanting this voyage, and three scenes of his own that will not
   * play for anybody who never carried him. Rolling a fresh pilot out of the
   * dice every time one died made all of that optional, and optional story is
   * story most players never see.
   *
   * So the cast is fixed and it is aboard from the first morning. What it costs
   * is that these men are now irreplaceable: a pilot who dies off the Cape is
   * gone, the berth stays empty, and whatever he knew goes over the side with
   * him. That is the right price. It is also what actually happened.
   *
   * The escrivão is the exception, and deliberately: he is the only man in the
   * wardroom the captain did not choose, because the Casa da Mina appointed him
   * and he writes to them.
   */
  private shipTheCompany(): void {
    for (const a of ARCS) this.recruitArc(a.id);
    // The Crown's own clerk. Not hired, not refusable, and not your friend.
    const clerk = makeOfficer('escrivao', this.rng, 0.58);
    clerk.name = 'Diogo Pais';
    clerk.wage = 20;
    clerk.joined = this.clock.t;
    this.crew.officers.push(clerk);
    this.wardroomCache = null;
  }

  // -------------------------------------------------------------------------
  // Línguas
  // -------------------------------------------------------------------------

  /**
   * Engaging an interpreter.
   *
   * The wardroom is otherwise the company she sailed with and cannot be shopped
   * for, which is right: those men are written, they have arcs, and a berth
   * that empties stays empty. The língua is the one exception, and it is the
   * exception the period insists on. Nobody carried a fixed interpreter down
   * that coast; they picked men up. Gama took a Jew of Poznań off a boat at
   * Anjediva, Cabral carried men who had been taken at Mina, every ship that
   * went south of the Senegal engaged somebody at the last port who had the
   * next people's tongue, and a captain who could not do that was reduced to
   * shouting at strangers and hoping — which is precisely what the audience
   * screen makes you do without one.
   *
   * So: one man, at a port whose people you have actually met, who has their
   * language and nothing else. He costs money up front and a wage after, and he
   * is worth it exactly as far as the next people who speak something different.
   */
  linguaOffer(def: PortDef): { language: string; cost: number; can: string | null } {
    const pe = people(def.people);
    const rel = this.relationsFor(def.id);
    // A rich town has men who have been up and down this coast; a beach has the
    // one fisherman who went to Arguim once.
    const size = { anchorage: 0.6, village: 0.75, town: 1, city: 1.25, emporium: 1.5 }[def.size];
    const cost = Math.round((70 + def.wealth * 110) * size);

    let can: string | null = null;
    if (def.people === 'portuguese') {
      // Lisbon and Lagos are full of men brought home off that coast, which is
      // historically the main way the early língua was got at all.
      can = null;
    } else if (!rel.met) {
      can = 'Nobody here has been presented to you yet, and you are in no position to engage anybody.';
    } else if (rel.regard < -0.2) {
      can = 'Nobody here will take service with you on any terms.';
    }
    if (!can && this.linguaFor(pe.language)) {
      can = `You already carry a man who has ${pe.language}.`;
    }
    if (!can && this.linguas().length >= 3) {
      can = 'Three interpreters is as many as the wardroom will hold and as many as are any use.';
    }
    if (!can && this.crown.gold + this.creditFree < cost) {
      can = `He wants ${cost} cruzados in hand and there is not that much.`;
    }
    return { language: pe.language, cost, can };
  }

  /** The interpreters aboard. */
  linguas(): Officer[] {
    return this.crew.officers.filter((o) => o.role === 'lingua' && o.alive && !o.ashoreAt);
  }

  linguaFor(language: string): Officer | null {
    return this.crew.officers.find(
      (o) => o.alive && !o.ashoreAt && o.languages.includes(language)) ?? null;
  }

  /**
   * The languages a Portuguese port can supply, which is not this port's own.
   *
   * At Lisbon what is on offer is a man off that coast, and which coast depends
   * on how far down it Portugal has actually got — which is the player's own
   * doing, so the list grows as the career does.
   */
  linguaLanguagesAt(def: PortDef): string[] {
    if (def.people !== 'portuguese') return [people(def.people).language];
    const out: string[] = [];
    for (const id of this.visitedPorts) {
      const p = PORTS.find((x) => x.id === id);
      if (!p || p.people === 'portuguese') continue;
      const rel = this.relations.get(id);
      if (!rel?.met) continue;
      const lang = people(p.people).language;
      if (!out.includes(lang) && !this.linguaFor(lang)) out.push(lang);
    }
    return out;
  }

  /** Take him on. Returns what goes on the screen. */
  engageLingua(def: PortDef, language: string): string {
    const offer = this.linguaOffer(def);
    if (offer.can && def.people !== 'portuguese') return offer.can;
    if (this.linguaFor(language)) return `You already carry a man who has ${language}.`;
    if (this.linguas().length >= 3) {
      return 'Three interpreters is as many as the wardroom will hold.';
    }
    const cost = offer.cost;
    if (this.crown.gold + this.creditFree < cost) {
      return `He wants ${cost} cruzados in hand and there is not that much.`;
    }
    if (this.crown.gold < cost) this.drawCredit(cost);
    this.crown.gold -= cost;

    // What he actually is varies a great deal, and the captain cannot tell
    // which he has got until somebody important is being spoken to.
    const ability = clamp(this.rng.normal(0.52, 0.17), 0.14, 0.93);
    const o = makeOfficer('lingua', this.rng, ability, [language]);
    o.joined = this.clock.t;
    // He has signed with a foreign ship going somewhere he may not come back
    // from, and he knows the terms better than the crew do.
    o.loyalty = clamp(this.rng.normal(0.46, 0.13), 0.12, 0.9);
    // He goes on the muster under a Portuguese name, because that is what
    // happened: a man engaged on that coast was baptised before he was entered
    // in the book, and the name in the book is the only one the record kept.
    this.crew.officers.push(o);
    this.wardroomCache = null;
    this.logEvent('contact',
      `Engaged ${o.name} at ${def.name} as língua, for ${cost} cruzados down and ${o.wage} the `
      + `month. He has ${language} and, as far as anybody aboard can tell, nothing else. `
      + 'Whether he is any good will be found out in front of somebody who matters.', true);
    return `${o.name} is aboard as your língua. He has ${language}.`;
  }

  recruitArc(arcId: string): Officer | null {
    const arc = ARC_BY_ID.get(arcId);
    if (!arc) return null;
    if (this.crew.officers.some((o) => o.arc === arcId)) return null;
    const o = makeOfficer(arc.role, this.rng, arc.ability, arc.languages ?? []);
    o.name = arc.name;
    o.trait = arc.trait;
    o.wage = arc.wage;
    o.arc = arc.id;
    o.arcStage = 0;
    o.arcFlags = [];
    o.joined = this.clock.t;
    // He takes the berth: a ship carries one pilot, not two.
    this.crew.officers = this.crew.officers.filter((x) => x.role !== arc.role || !x.alive);
    this.crew.officers.push(o);
    this.wardroomCache = null;
    return o;
  }

  /**
   * Who this captain is. See progression/origins — it is not a difficulty
   * setting: it decides what he starts with, what the Casa will forgive him,
   * and what the last page of his life says.
   */
  origin: OriginId = 'segundo';

  setOrigin(id: OriginId): void {
    this.origin = id;
    const o = originDef(id);
    this.crown.gold = o.gold;
    this.crown.standing = o.standing;
    this.crown.lifetimeStanding = o.standing;
    this.captain.points = o.points;
    // The counting-houses form their own opinion, and it is not the court's.
    this.finance = new Ledger(o.standing);
    for (const h of HOUSES) {
      this.finance.credit[h.id] = Math.round(clamp(
        this.finance.credit[h.id] + o.creditBias, 0, 100));
    }
    this.logEvent('note', o.detail, true);
  }

  /** What the court is worth to a man starting from where this one started. */
  get standingScale(): number {
    return originDef(this.origin).standingScale;
  }

  /** How many peoples this captain has actually met, for the chaplain's arc. */
  relationsMetCount(): number {
    let n = 0;
    const seen = new Set<string>();
    for (const [id, rel] of this.relations) {
      if (!rel.met) continue;
      const def = PORTS.find((p) => p.id === id);
      if (!def || seen.has(def.people)) continue;
      seen.add(def.people);
      n++;
    }
    return n;
  }

  /** Miles from the ship to a named port, for arcs that wait on a landfall. */
  nearPortNm(portId: string): number {
    const def = PORTS.find((p) => p.id === portId);
    if (!def) return Infinity;
    return haversine(this.ship.state.pos, anchorageOf(def)) / NM;
  }

  /**
   * Up with the mark she was steering for. Judged on the true position rather
   * than the reckoned one — she has either arrived or she has not, whatever the
   * navigator believes — and the course is struck once she has.
   */
  private checkArrival(): void {
    // The raw route entry rather than the `destination` getter, which narrows
    // away the portId the arrival message needs to tell a town from a mark.
    const d = this.route[0];
    if (!d) return;
    // A town is up with when she is up with the town — the real one, wherever
    // the chart had it. A mark in open water exists only on the paper.
    const real = d.portId ? anchorageOf(portDef(d.portId)) : d;
    const trueDist = haversine(this.ship.state.pos, real) / NM;
    const estDist = haversine(this.nav.estimated, { lat: d.lat, lon: d.lon }) / NM;
    // A mark in open water is a position and nothing else, so she is up with
    // it when the reckoning says she is: there is nothing to see that would
    // tell anybody otherwise. Judged on the truth, a mark laid by a passage
    // question had her circling a patch of sea she could never find.
    const openSea = !d.portId;
    // Run far enough along the parallel and there is no point running further:
    // either the latitude is wrong or the place is the other way.
    const lo = this.latitudeOrder;
    if (!openSea && lo && lo.startLon !== undefined && trueDist > 6 && !this.pendingEvent) {
      const ran = Math.abs(wrap180(this.nav.estimated.lon - lo.startLon)) * 60
        * Math.cos((this.nav.estimated.lat * Math.PI) / 180);
      if (ran > 240) {
        this.latitudeOrder = null;
        this.standingCourse = wrap360(this.ship.state.heading);
        this.searchAskedT = this.clock.t;
        this.easeTheClock(2);
        this.pendingScenes.push(this.nothingInSight(d, ran));
        return;
      }
    }
    if (openSea ? estDist > 4 : trueDist > 6) {
      // Up with a town by the reckoning, and the town is not there. She used
      // to circle the reckoned spot for weeks while the current carried her
      // off; this is the moment the whole art of the pilot is for.
      if (!openSea && estDist < 3 && !this.pendingEvent
          && this.clock.t - this.searchAskedT > 2 * 86400) {
        this.searchAskedT = this.clock.t;
        this.standingCourse = wrap360(this.ship.state.heading);
        this.easeTheClock(2);
        this.pendingScenes.push(this.nothingInSight(d));
      }
      return;
    }
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
    // The passage is sailed out. She stands on as she is until she is told
    // otherwise, which is what a ship does when she has arrived and nobody has
    // yet said what next.
    this.standingCourse = wrap360(this.ship.state.heading);

    // And what is actually here, which is not always the town.
    //
    // The mark is laid at the position the *chart* gives, and off Guinea the
    // chart is wrong by up to seventy-odd miles — so arriving at it regularly
    // means arriving at a piece of open sea. This used to announce "Made X by
    // the reckoning, and there it was", which is a flat lie in that case and is
    // the single most confusing thing the game can say: the player is told he
    // has arrived somewhere he can see he is not, and concludes the world has
    // moved. Say which of the two has happened.
    const seen = this.portInSight(d.portId);
    const here = seen && seen.def.id === d.portId ? seen : null;
    if (here?.sure) {
      this.pushAlert(`Up with ${d.name}.`, 'note');
      this.logEvent('note',
        `Made ${d.name} by the reckoning, and there it was, ${here.distNm.toFixed(0)} miles off `
        + `and bearing ${formatBearing(here.bearing)}.`, true);
      return;
    }
    if (here) {
      this.pushAlert(`Up with the charted place. ${d.name} bears `
        + `${formatBearing(here.bearing)}, ${here.distNm.toFixed(0)} miles.`, 'note');
      this.logEvent('note',
        `Up with the position the chart gives for ${d.name}, and there is nothing here but water. `
        + `The pilot has the latitude and says the place lies ${formatBearing(here.bearing)} of us, `
        + `some ${here.distNm.toFixed(0)} miles — the chart is out in its longitude, as it is `
        + 'the whole length of this coast. Run down the parallel and look for it.', true);
      return;
    }
    this.pushAlert(`Up with the charted position of ${d.name} — and nothing here.`, 'warning');
    this.logEvent('note',
      `Made the position the chart gives for ${d.name}. There is no town in sight and nobody `
      + 'aboard can say which way it lies. The chart is wrong, the reckoning may be wrong as '
      + 'well, and the only honest answers are the parallel and the lead.', true);
  }

  /** When the last "nothing in sight" was put, so it is not put every watch. */
  private searchAskedT = -1e12;

  /** By the reckoning she is there, and there is nothing there. */
  private nothingInSight(d: { name: string; lat: number; lon: number; portId?: string }, ranNm = 0): SeaEvent {
    const def = d.portId ? portDef(d.portId) : null;
    const truth = def ? anchorageOf(def) : d;
    const west = wrap180(truth.lon - this.ship.state.pos.lon) < 0;
    const latOffNm = Math.abs(this.ship.state.pos.lat - truth.lat) * 60;
    return {
      id: 'landfall:search',
      council: true,
      title: 'Nothing in sight',
      severity: 'warning',
      text: (ranNm > 0
        ? `${Math.round(ranNm)} miles along the latitude of ${d.name}, and still nothing. `
        : `By the reckoning she is up with ${d.name}. The masthead has been manned since dawn `
          + 'and there is nothing — no land, no smoke, no birds going home at dusk. ')
        + (this.nav.sigmaLat > 15
          ? `The pilot will not swear to the latitude within ${Math.round(this.nav.sigmaLat)} miles, `
            + 'and a parallel run on the wrong parallel finds nothing at all: a sight first, if '
            + 'the sky gives one.\n\n'
          : '\n\n')
        + 'Either the reckoning is out or the chart is, and probably both. The way it has always '
        + 'been done is to get on the latitude of the place and run along it until it comes up. '
        + 'Which way to run is the question.',
      facts: { west: west ? 1 : 0, latOff: latOffNm },
      choices: [
        {
          label: 'Run down the parallel to the westward',
          detail: `Hold ${d.name}\u2019s latitude and stand west until it lifts.`,
          resolve: (g) => {
            g.latitudeOrder = { lat: d.lat, eastward: false, startLon: g.nav.estimated.lon };
            g.helmOrder = null; g.standingCourse = null;
            return `Ran down the latitude of ${d.name} to the westward, with a man at each masthead.`;
          },
        },
        {
          label: 'Run down the parallel to the eastward',
          detail: `Hold ${d.name}\u2019s latitude and stand east until it lifts.`,
          resolve: (g) => {
            g.latitudeOrder = { lat: d.lat, eastward: true, startLon: g.nav.estimated.lon };
            g.helmOrder = null; g.standingCourse = null;
            return `Ran down the latitude of ${d.name} to the eastward, with a man at each masthead.`;
          },
        },
        {
          label: 'Stand on as she heads',
          detail: 'Hold the course she has and trust the land to show itself.',
          resolve: () => 'Stood on as she was heading. The pilot said nothing, loudly.',
        },
      ],
    };
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

  /**
   * Write the port up, or come back to the page and see what has changed.
   *
   * The memory is the point. A book that only records the first visit is a
   * catalogue; a book that says "I first entered this harbour twelve years ago
   * and the village had forty houses" is a life. Everything needed for that is
   * already here — when the page was opened, how many times it has been come
   * back to — so the ship can be made to notice.
   */
  /**
   * What the book is worth to the ship that carries it.
   *
   * Knowledge is the resource this game is actually about, and until now it was
   * scored rather than used. These are the places where having written
   * something down changes what happens, and every one of them is weighted by
   * how the thing was come by — a rumour of good water is worth something and
   * not much; a stream you filled the casks at yourself is worth all of it.
   */

  /** Days of water the book says can be had at a place, discounted by doubt. */
  waterKnownAt(portId: string): number {
    return this.rutter.knows('water', portId);
  }

  /**
   * A shoal or a reef somebody has written down, close enough to matter.
   *
   * The lead gives eight metres of warning. The book gives a mile, and only for
   * water somebody has already been frightened by — which is exactly the trade
   * a roteiro was for.
   */
  hazardAhead(): { title: string; distNm: number; text: string } | null {
    const near = this.rutter.hazardsNear(this.nav.estimated, 6);
    if (near.length === 0) return null;
    const h = near[0];
    return { title: h.entry.title, distNm: h.distNm, text: h.note.text };
  }

  /**
   * How much the book improves a bargain.
   *
   * A merchant pays more for a cargo from a man who can tell him what it cost
   * where it came from, and a captain who has the page in front of him is not
   * guessing at the price. Capped low: it is an edge, not a cheat.
   */
  tradeEdge(goodId: string): number {
    return this.rutter.knows('trade', goodId) * 0.09;
  }

  /** How much easier an audience is with the page open in front of you. */
  diplomaticEdge(peopleId: string): number {
    return this.rutter.knows('people', peopleId) * 0.18
      + this.rutter.knows('ruler', peopleId) * 0.22;
  }

  /**
   * Everything else the book writes itself, gathered in one place so that the
   * hooks scattered through the game stay one line each.
   */
  writeCoast(name: string, at: LatLon, text: string, conf: Confidence = 'observed'): void {
    const { entry } = this.rutter.open('coast', `coast:${name}`, name, at, this.clock.t);
    this.rutter.note(entry, text, conf, this.clock.t);
  }

  writePeople(peopleId: string, text: string, conf: Confidence, source?: string): void {
    const folk = people(peopleId);
    const { entry, fresh } = this.rutter.open(
      'people', `people:${peopleId}`, folk ? folk.name : peopleId,
      this.nav.estimated, this.clock.t);
    if (fresh && folk) {
      this.rutter.note(entry,
        `They speak ${folk.language}. ${folk.blurb}`, 'observed', this.clock.t,
        { fact: { tag: 'people', target: peopleId } });
    }
    this.rutter.note(entry, text, conf, this.clock.t, { source });
  }

  writeChronicle(title: string, text: string): void {
    const { entry } = this.rutter.open(
      'chronicle', `ch:${title}:${Math.floor(this.clock.t / 86400)}`, title,
      this.nav.estimated, this.clock.t);
    this.rutter.note(entry, text, 'observed', this.clock.t);
  }

  writeRumour(title: string, text: string, source: string): void {
    const { entry } = this.rutter.open(
      'rumour', `rum:${title}`, title, this.nav.estimated, this.clock.t);
    this.rutter.note(entry, text, 'rumoured', this.clock.t, { source });
  }

  /**
   * The captain's own hand: a guess, written down as a guess.
   *
   * The one kind of entry the ship does not make for him. A supposition that
   * turns out right is the most valuable thing in the book and the only thing
   * in it that is his rather than the sea's.
   */
  /**
   * What to do with what you know.
   *
   * The decision the whole book exists to pose. Everything in it is worth
   * something to somebody, and every one of them costs you the others: give the
   * Crown your winds and you are a made man and so is the next captain down
   * that coast; sell them to the Rua Nova and you eat well and the Casa hears
   * about it; keep them and you are the only man alive who can lay that passage,
   * for as long as you live. There is no right answer, which is the point of
   * having it be a choice.
   *
   * Publishing is per-page rather than all-or-nothing, because the interesting
   * version of this is a captain who gives away his coasts and keeps his winds.
   */
  publish(entryId: string, to: 'crown' | 'merchants' | 'atlas'): string {
    const e = this.rutter.entries.find((x) => x.id === entryId);
    if (!e) return 'No such page.';
    if (e.published) return `That page is already with ${e.published === 'atlas' ? 'the world' : e.published}.`;
    if (!this.dockedAt) return 'This is done ashore, at Lisbon.';
    const worth = this.rutter.worth(e);
    e.published = to;
    e.publishedT = this.clock.t;

    if (to === 'crown') {
      this.crown.standing += worth.crown;
      this.crown.lifetimeStanding += worth.crown;
      // The Casa copies it, and the next man out has it — including the other
      // man, who is on the same coast and is now a little further down it than
      // he would have got on his own.
      this.rival.standing += Math.round(worth.crown * 0.3);
      this.logEvent('crown',
        `Laid the page on ${e.title} before the Casa. ${worth.crown} renown, and a clerk `
        + 'was copying it before I was out of the building. Every pilot on the Guinea run '
        + 'will have it by the spring.', true);
      return `${worth.crown} renown. The Casa has it now, and so will everybody.`;
    }
    if (to === 'merchants') {
      this.crown.gold += worth.merchants;
      this.crown.standing = Math.max(0, this.crown.standing - Math.round(worth.crown * 0.25));
      this.logEvent('trade',
        `Sold what I know of ${e.title} on the Rua Nova for ${worth.merchants} cruzados. `
        + 'The Casa will hear that I sold it, and the Casa does not forget that sort of thing.',
        true);
      return `${worth.merchants} cruzados. The Casa will hear of it.`;
    }
    this.crown.standing += Math.round(worth.atlas * 0.6);
    this.crown.lifetimeStanding += worth.atlas;
    this.logEvent('discovery',
      `Entered ${e.title} in the atlas, under my own name, where it will stand after me. `
      + `${worth.atlas} renown, no money at all, and it is the only kind of this work that lasts.`,
      true);
    return `In the atlas, under your name. ${worth.atlas} renown.`;
  }

  /** Everything the captain has given the world, which is his atlas. */
  atlas(): { entries: number; renown: number; kinds: Record<string, number> } {
    const kinds: Record<string, number> = {};
    let renown = 0;
    let entries = 0;
    for (const e of this.rutter.entries) {
      if (e.published !== 'atlas') continue;
      entries++;
      renown += this.rutter.worth(e).atlas;
      kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    }
    return { entries, renown, kinds };
  }

  /**
   * Something has got at the book.
   *
   * Called from the events that would actually do it. Deliberately destructive:
   * a page that has been soaked is harder to read for the rest of the campaign,
   * and the knowledge on it is worth less because the reader is no longer sure
   * what it said. That is the cost of carrying twenty years of work to sea in a
   * leather case, and it is what makes an old book feel like an object rather
   * than a database.
   */
  damageTheBook(kind: Damage, pages: number, why: string): void {
    const hit = this.rutter.damageRecent(kind, pages, this.clock.t);
    if (hit.length === 0) return;
    this.pushAlert(`The book: ${why}`, 'warning');
    this.logEvent('peril',
      `${why} ${hit.length === 1 ? 'One page' : `${hit.length} pages`} of the roteiro `
      + `${hit.length === 1 ? 'is' : 'are'} the worse for it — `
      + `${hit.map((e) => e.title).join(', ')}.`, true);
  }

  writeSupposition(entryId: string, text: string): string {
    const e = this.rutter.entries.find((x) => x.id === entryId);
    if (!e) return 'No such page.';
    if (!text.trim()) return 'Nothing written.';
    this.rutter.note(e, text.trim(), 'speculative', this.clock.t, { mine: true });
    return 'Entered in your own hand.';
  }

  private writeUpPort(def: PortDef, first: boolean): void {
    const t = this.clock.t;
    const { entry, fresh } = this.rutter.open(
      'port', `port:${def.id}`, def.name, this.nav.estimated, t);

    if (fresh) {
      this.rutter.note(entry, def.blurb, 'observed', t);
      this.rutter.note(entry,
        `Anchored in ${this.sounding.depth.toFixed(0)} fathoms. `
        + (def.anchorage > 0.7 ? 'Good holding and shelter from anything.'
          : def.anchorage > 0.45 ? 'Fair holding. It would be no place to lie in an onshore blow.'
            : 'An open roadstead. She would have to run for it if it came on to blow.'),
        'observed', t, { fact: { tag: 'harbour', value: def.anchorage, target: def.id } });
      if (def.refit > 0.5) {
        this.rutter.note(entry, 'Water and provisions to be had here.', 'observed', t,
          { fact: { tag: 'water', target: def.id } });
      }
      const folk = people(def.people);
      if (folk) {
        this.rutter.note(entry,
          `The people are ${folk.name}, and speak ${folk.language}.`, 'observed', t,
          { fact: { tag: 'people', target: def.people } });
      }
      const best = Object.entries(def.produces).sort((a, b) => b[1] - a[1])[0];
      if (best) {
        this.rutter.note(entry,
          `They have ${good(best[0]).english} here, and plenty of it.`,
          'observed', t, { fact: { tag: 'trade', target: best[0] } });
      }
      return;
    }

    // Back again. How long has it been, and what is different?
    const years = (t - entry.opened) / (86400 * 365.25);
    if (years > 0.75 && this.clock.t - (this.lastRemembered.get(def.id) ?? -1e9) > 86400 * 200) {
      this.lastRemembered.set(def.id, t);
      const span = years < 1.6 ? 'a year ago'
        : years < 12 ? `${years.toFixed(0)} years ago`
          : `${years.toFixed(0)} years ago, when I was a younger man`;
      const rel = this.relationsFor(def.id);
      const changed = rel.regard > 0.5
        ? 'They know the ship now, and a boat came off before the anchor was down.'
        : rel.regard < -0.2
          ? 'They have not forgotten whatever it was, and nobody came off to us.'
          : 'It is much as it was, and nobody remembers us.';
      this.rutter.note(entry,
        `Entered this harbour again, ${span}. ${changed}`, 'observed', t);
      this.pushAlert(`You first wrote this place up ${span}.`, 'note');
    }
    void first;
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

    // Presents kept for exactly this. See ship/upgrades.
    if (this.ship.effects.gifts) {
      this.shiftPeopleRegard(def.people, 0.15);
      this.logEvent('contact', `The chest of presents was opened on the beach: scarlet cloth, `
        + 'brass, hawk\u2019s bells, and a looking-glass that went from hand to hand for an hour. '
        + 'Whatever they think of us, they think it more kindly.', true);
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
    if (r.hurt) {
      this.crew.sickness = clamp(this.crew.sickness + r.hurt * 0.02, 0, 1);
      this.damageTheBook('blood', 1, 'the book was in the boat, and it has blood on it now.');
    }
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

    // Into the book, where the next voyage can use it.
    const where = `${formatLat(this.nav.estimated.lat)}, ${formatLon(this.nav.estimated.lon)}`;
    const { entry } = this.rutter.open(
      'coast', `shore:${this.shoreKey()}`, `The coast at ${where}`,
      this.nav.estimated, this.clock.t);
    if (entry.notes.length === 0) this.rutter.note(entry, place.describe, 'observed', this.clock.t);
    if (r.waterDays) {
      this.rutter.note(entry, 'Fresh water to be had here.', 'observed', this.clock.t,
        { fact: { tag: 'water', value: r.waterDays } });
    }
    if (r.freshDays) {
      this.rutter.note(entry, 'Greens and fruit ashore, enough to check the scurvy.',
        'observed', this.clock.t, { fact: { tag: 'victuals', value: r.freshDays } });
    }
    if (r.woodDays) {
      this.rutter.note(entry, 'Timber worth cutting.', 'observed', this.clock.t,
        { fact: { tag: 'wood' } });
    }
    if (action === 'water' && !r.waterDays) {
      this.rutter.note(entry, 'No water on this coast. They dug and got salt.',
        'observed', this.clock.t, { fact: { tag: 'nowater' } });
    }
    if (r.told) {
      this.writeRumour(r.told.name,
        `They point ${compass(r.told.bearing)} along the shore and hold up fingers for the days. `
        + `By my reckoning that puts it ${r.told.distNm.toFixed(0)} miles off.`,
        folk ? `the ${folk.name}` : 'the people of this coast');
    }
    if (r.metPeople && place.peopleId) {
      this.writePeople(place.peopleId, r.text, 'observed');
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
      this.crew.morale = clamp(this.crew.morale + 0.04, 0, 1);
      this.pushAlert(`Charter discharged. ${v.fee} cruzados.`, 'note');
      this.logEvent('trade',
        `Landed ${ventureLine(v)} for ${v.patron}, within his time, and was paid ${v.fee} `
        + 'cruzados on the quay without argument.', true);
    }
  }

  /**
   * What the yard will allow against the old ship when you shift your flag.
   *
   * She used to evaporate. A captain buying a nau paid six thousand eight
   * hundred for it while a caravel worth nine hundred, with thirteen hundred
   * cruzados of lead sheathing and chain pumps and reinforced frames fitted
   * into her, simply ceased to exist — the new hull was constructed with no
   * upgrades and the old object was dropped on the floor. Every penny a captain
   * had spent making his ship better was destroyed the moment he got a better
   * one, silently, which taught the exactly wrong lesson: never improve
   * anything you might replace.
   *
   * A ship is an asset. The yard takes her in against the new one at what she
   * is worth second-hand — hull and fitting-out both, discounted for the wear
   * on her, because a hauled-out hull with her seams open is not worth what a
   * sound one is.
   */
  // -------------------------------------------------------------------------
  // A ship to your own lines. See ship/design.
  // -------------------------------------------------------------------------

  /** Hulls built to the captain's drawings, with their polar tables. */
  designs: { hull: HullClass; polar: number[][]; design?: ShipDesign }[] = [];
  /** The one on the stocks at the Ribeira, if any. */
  building: { hullId: string; readyT: number; startT: number } | null = null;
  /** When the flagship she now is was launched. */
  flagship: { hullId: string; launchedT: number } | null = null;

  /** What the draughtsman says about a design before a timber is cut. */
  assess(d: ShipDesign) {
    return assessDesign(d, this.chronicle.act);
  }

  /** Why the Ribeira will not lay this one down, or null when it will. */
  commissionBlocked(d: ShipDesign): string | null {
    if (this.dockedAt !== 'lisboa') return 'Ships are laid down at the Ribeira das Naus, in Lisbon.';
    if (this.building) return 'There is already a ship of yours on the stocks.';
    if (!d.name.trim()) return 'She wants a name before the keel is laid.';
    const h = hullFromDesign(d, 'draught');
    if (h.tons > tonsAllowed(this.chronicle.act)) {
      return `The Ribeira will not lay down more than ${tonsAllowed(this.chronicle.act)} tonéis for you yet.`;
    }
    if (h.standing > this.crown.lifetimeStanding) {
      return `A ship of ${h.tons} tonéis wants ${h.standing} renown behind it; you have ${this.crown.lifetimeStanding}.`;
    }
    if (this.crown.gold + this.creditFree < h.cost) return `She costs ${h.cost} cruzados, paid when the keel is laid.`;
    return null;
  }

  /** Lay her down. The price is paid now; she is ready in her building time. */
  commissionShip(d: ShipDesign): string | null {
    const why = this.commissionBlocked(d);
    if (why) return why;
    const id = `custom-${this.designs.length + 1}`;
    const hull = hullFromDesign({ ...d, name: d.name.trim() }, id);
    const polar = polarTable(hull);
    registerHull(hull, polar);
    this.designs.push({ hull, polar, design: { ...d, masts: [...d.masts], name: d.name.trim() } });
    if (this.crown.gold < hull.cost) this.drawCredit(hull.cost);
    this.crown.gold -= hull.cost;
    const days = buildDays(hull);
    this.building = { hullId: id, readyT: this.clock.t + days * 86400, startT: this.clock.t };
    this.logEvent('crown',
      `The keel of the ${hull.name} is laid at the Ribeira das Naus: ${hull.tons} tonéis, `
      + `${hull.lwl} metres on the waterline, ${hull.masts.length} ${hull.masts.length === 1 ? 'mast' : 'masts'}. `
      + `${hull.cost} cruzados paid to the master shipwright, and she will be ready in ${Math.round(days / 30)} months.`, true);
    return null;
  }

  /** Whether the ship on the stocks is ready to take your flag. */
  get launchReady(): boolean {
    return !!this.building && this.clock.t >= this.building.readyT;
  }

  /** Shift your flag into her. The old ship is sold to the yard. */
  launchShip(): string | null {
    if (!this.building) return 'There is nothing of yours on the stocks.';
    if (this.dockedAt !== 'lisboa') return 'She is lying at the Ribeira, in Lisbon.';
    if (!this.launchReady) return `She is not finished: ${Math.ceil((this.building.readyT - this.clock.t) / 86400)} days yet.`;
    const id = this.building.hullId;
    const h = hullClass(id);
    // Your own design goes into the water under the name you drew her with;
    // anything else carries your ship's name across.
    const err = this.shiftFlag(id, true, h.custom ? h.name : this.ship.name);
    if (err) return err;
    this.building = null;
    this.flagship = { hullId: id, launchedT: this.clock.t };
    this.logEvent('crown',
      `The ${h.name} goes down the ways into the Tagus with the whole of the Ribeira cheering and the `
      + 'chaplain throwing water at her. She is yours from the keel up, drawn by your hand, and there is '
      + 'no other ship like her.', true);
    return null;
  }

  tradeInValue(): number {
    const hull = hullClass(this.ship.hullId);
    // What goes with you into the new ship is not sold with the old one.
    const fitted = this.ship.upgrades.filter((id) => !movesWithTheFlag(id)).reduce(
      (sum, id) => sum + (UPGRADE_BY_ID.get(id)?.cost ?? 0), 0);
    const wear = clamp(this.ship.condition.hull, 0.35, 1);
    return Math.round((hull.cost + fitted) * 0.55 * wear);
  }

  /** Fitted work that would come across into a new hull. */
  carriedAcross(hullId: string): string[] {
    return this.ship.upgrades.filter((id) => {
      if (!movesWithTheFlag(id)) return false;
      const u = UPGRADE_BY_ID.get(id)!;
      return (!u.hulls || u.hulls.includes(hullId)) && u.tier <= tierCap(hullId);
    });
  }

  /** What the yard charges to move it: half its price. */
  carryCost(hullId: string): number {
    return Math.round(this.carriedAcross(hullId)
      .reduce((sum, id) => sum + (UPGRADE_BY_ID.get(id)?.cost ?? 0), 0) * 0.5);
  }

  /**
   * Shift your flag into another ship.
   *
   * Returns why it cannot be done, or null when it is done. The hold is the
   * reason it usually cannot: cargo that will not fit used to be dropped on the
   * floor with the old hull, which quietly destroyed a hundred and sixty-seven
   * quintais of pepper on a downgrade, and would just as quietly have destroyed
   * a merchant's consignment or the cargo the King is expecting, failing both
   * without a word.
   */
  shiftFlag(hullId: string, prepaid = false, name?: string): string | null {
    const h = hullClass(hullId);
    const carried = this.carriedAcross(hullId);
    const allowed = this.tradeInValue();
    // A ship already paid for on the stocks: the old one is sold to the yard
    // and only the fittings carried across are charged against it.
    const price = prepaid
      ? this.carryCost(hullId) - allowed
      : Math.max(0, h.cost - allowed) + this.carryCost(hullId);
    if (this.crown.gold + this.creditFree < price) return 'There is not enough in the purse.';
    const tons = this.ship.cargoTons;
    if (tons > h.hold + 0.001) {
      return `She has ${tons.toFixed(1)} tons in her and the ${h.name} holds ${h.hold}. `
        + 'Sell down the hold before you shift your flag — nothing is going over the side for this.';
    }
    if (this.crown.gold < price) this.drawCredit(price);
    this.crown.gold -= price;

    const old = this.ship;
    const next = new Ship(name ?? old.name, hullId, old.state.pos, old.state.heading);
    // The rig, stores, quarters, instruments and arms come across if the new
    // hull can take them; the hull and keel work stays with the old ship.
    next.upgrades = carried;
    next.reservedTons = old.reservedTons;
    next.applyRigConversion();
    next.refreshDerived();
    for (const lot of old.cargo) next.addCargo(lot.goodId, lot.quantity, lot.cost, lot.q);
    next.state.heading = old.state.heading;
    this.ship = next;
    this.crew.complement = h.crewFull;
    this.crew.count = Math.min(this.crew.count, h.crewFull);
    this.refreshEnvironment();
    if (this.crew.count < h.crewMin) {
      this.pushAlert(`The ${h.name} wants ${h.crewMin} men to sail her and you have `
        + `${this.crew.count}. Ship hands before you weigh.`, 'warning');
    }
    this.logEvent('crown', prepaid
      ? `Shifted your flag into the ${h.name}. The yard bought the old ship for ${allowed} cruzados`
        + `${price > 0 ? `, and took ${price} more for carrying her fittings across` : `, and ${-price} came back to you after the fittings were carried across`}.`
      : `Shifted your flag into the ${h.name}. ${h.blurb} The yard allowed `
        + `${allowed} against the old ship and her fitting-out, so she cost `
        + `${price} on the day.`, true);
    return null;
  }

  /**
   * When she moored, so the days alongside can be given back to the charters.
   *
   * A merchant's contract is for a passage, and the fortnight she spends on the
   * blocks having her bottom breamed is not passage time. Counting it meant a
   * captain who did the one obviously sensible thing before a long run — refit
   * her first — was punished for it by a charter he could no longer make, which
   * is the opposite of the decision the charter is supposed to create.
   */
  dockedSinceT = 0;

  /** Charters still running, for the orders panel. */
  get activeVentures(): Venture[] {
    return this.ventures.filter((v) => !v.delivered && !v.failed);
  }

  /**
   * Cargo aboard that belongs to a merchant, whether the charter is still
   * running or not.
   *
   * A charter that runs out of time used to drop out of `activeVentures`, and
   * with it out of every check that knew the goods were not yours — so the
   * cargo stopped being consigned the instant the contract voided and could be
   * sold free and clear. Measured across every charter the game can offer, that
   * made fifty of eighty-six of them worth more stolen than delivered: 240 lots
   * of Diu gemstones are worth 50,400 and letting the charter lapse cost 2,978.
   * Breaking a charter deliberately is meant to be a real option — money now
   * against a forfeit later — but it is supposed to be *theft*, with the
   * merchant's goods leaving your hold when his factor catches up with you, and
   * not a discount on a shipment of diamonds.
   */
  get consignedVentures(): Venture[] {
    return this.ventures.filter((v) => v.loaded && !v.delivered);
  }

  /**
   * His factor comes aboard and takes what is still his.
   *
   * Called on entering any port: a voided charter does not transfer ownership,
   * and the merchants of the Rua Nova have correspondents everywhere the ship
   * can put in. Whatever is left of the consignment goes over the side into his
   * boat; whatever the captain already sold is gone, and was paid for in the
   * penalty he has already taken.
   */
  private reclaimBrokenCharters(): void {
    for (const v of this.ventures) {
      if (!v.failed || !v.loaded) continue;
      const held = this.ship.quantityOf(v.goodId);
      const took = Math.min(held, v.quantity);
      v.loaded = false;
      if (took <= 0.01) continue;
      this.ship.removeCargo(v.goodId, took);
      this.logEvent('trade',
        `${v.patron}’s factor came off with two boats and a notary and took back `
        + `${took.toFixed(0)} ${good(v.goodId).unit} of ${good(v.goodId).name.toLowerCase()}. `
        + 'He was within his rights and had the paper to prove it.', true);
      this.pushAlert(`${v.patron}’s factor has taken his cargo back.`, 'warning');
    }
  }

  /** Rumours heard and not yet run down. */
  /** Enter a piece of hearsay about land to seaward. See farLand. */
  addIsleLead(l: Omit<Lead, 'id' | 'heard' | 'followed' | 'false'>): Lead {
    const lead: Lead = { ...l, id: `l${this.nextLeadId++}`, heard: this.clock.t, followed: false, false: false };
    this.leads.push(lead);
    this.logEvent('note', lead.text, true);
    return lead;
  }

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
    // Nothing runs out while she is moored. The days alongside are handed back
    // in weighAnchor, so failing a charter in port would be failing it on time
    // that is about to be returned.
    const inPort = this.dockedAt !== null;
    for (const v of this.ventures) {
      if (v.delivered || v.failed) continue;
      if (!inPort && this.clock.t > v.dueBy) {
        v.failed = true;
        this.crown.standing = Math.max(0, this.crown.standing - v.penalty * 0.1);
        this.crown.gold -= v.penalty;
        this.pushAlert(`${v.patron}\u2019s charter is out of time.`, 'warning');
        this.logEvent('trade',
          `The charter for ${ventureLine(v)} is void. ${v.patron} has been repaid his advance `
          + `and ${v.penalty} cruzados besides, and will tell the Rua Nova about it.`, true);
      }
    }
    // A charter that runs out while she is lying at a quay is reclaimed there
    // and then; the factor does not wait for her to sail and come back.
    if (this.dockedAt) this.reclaimBrokenCharters();
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
   * It used to work anywhere the land was in sight, which meant a captain could
   * stop in a bight of featureless sand and have a cape named after him. A name
   * is only worth anything if it goes on something another pilot can recognise
   * from seaward — so it now goes on a headland or a river mouth and nowhere
   * else. See world/features.
   */
  namePlace(name: string): { ok: boolean; message: string } {
    const given = name.trim();
    if (given.length < 3) {
      return { ok: false, message: 'A place wants a name, not a mark.' };
    }
    const f = featureNear(this.ship.state.pos);
    if (!f) {
      return {
        ok: false,
        message: 'There is nothing here to hang a name on. A name goes on a headland or the '
          + 'mouth of a river — something the next man can find. Stand along the coast until '
          + 'something stands up out of it.',
      };
    }
    const range = sightingRangeNm(this.ship.mastHeight, this.weatherNow.visibility);
    if (this.sounding.shoreDistNm > range) {
      return { ok: false, message: 'It is not in sight. Stand in until the land is up.' };
    }
    if (this.namedFeatures[f.id]) {
      return { ok: false, message: `You have already called this place ${this.namedFeatures[f.id]}.` };
    }
    return { ok: true, message: this.nameTheFeature(f, given) };
  }

  /** The headland or river mouth she is up with, for the interface. */
  featureHere(): { id: string; kind: string; named: string | null; suggested: string } | null {
    const f = featureNear(this.ship.state.pos);
    if (!f) return null;
    const range = sightingRangeNm(this.ship.mastHeight, this.weatherNow.visibility);
    if (this.sounding.shoreDistNm > range) return null;
    return {
      id: f.id, kind: f.kind, named: this.namedFeatures[f.id] ?? null, suggested: f.suggested,
    };
  }

  /** What the captain has called each feature he has found. */
  namedFeatures: Record<string, string> = {};
  /** Features raised from the masthead, so each is offered once. */
  private foundFeatures: string[] = [];

  /** Islands found, tales heard on the quay, and the signs the sea has given. See farLand. */
  isles: IsleState = newIsleState();

  /** Turn the view to something on the horizon. */
  cueLook(bearing: number): void {
    this.lookCue = { bearing, id: ++this.lookCueId };
  }

  /**
   * Enter an ocean island under a name — or under none — and, if the boats go
   * in, take what it has. See farLand.isleScene.
   */
  nameTheIsle(isle: OceanIsle, given: string, landed: boolean): string {
    const at = { lat: isle.lat, lon: isle.lon };
    const name = given || `An island at ${formatLat(this.nav.estimated.lat)}`;
    this.isles.found[isle.id] = { name, t: this.clock.t, landed, by: 'you' };
    closeIsleLeads(this, isle.id);
    const worth = Math.round(isle.value * (given ? (landed ? 1 : 0.8) : 0.3));
    if (given) this.chart.addPlace(given, 'island', at, this.clock.t);
    this.crown.record('island', name, this.nav.estimated, worth, this.clock.t);
    this.chartedThisPassage += 30;
    this.crown.chartedSincePatent += 30;
    this.crew.morale = clamp(this.crew.morale + (landed ? 0.14 : 0.06), 0, 1);
    this.writeCoast(name, this.nav.estimated,
      `${given ? `Named by me, ${this.clock.formatDate()}` : `Raised ${this.clock.formatDate()}, no name given`}. `
      + `Water ${isle.water > 0.7 ? 'plentiful' : isle.water > 0.25 ? 'scant' : 'none'}; `
      + `${isle.food > 0.5 ? 'food to be had' : 'little to eat'}${landed ? '' : ' (from the offing)'}.`);
    this.logEvent('discovery',
      `${given ? `Entered this island as ${given}` : 'Entered an island in the book without a name'}, at `
      + `${formatLat(this.nav.estimated.lat)}, ${formatLon(this.nav.estimated.lon)} by the reckoning.`, true);
    this.announceDiscovery('named', 'An island on no chart', name,
      given ? 'Found and named' : 'Found', `By the ${this.ship.name}, ${this.clock.formatDate()} \u00b7 ${worth} renown at court`);
    if (!landed) {
      return given
        ? `${given}. On the chart under your hand, and she stands on.`
        : 'A position in the book. The pilot does not like the blank against it and says so.';
    }
    this.clock.t += 86400;
    const p = this.crew.provisions;
    const water = Math.round(45 * isle.water);
    const fresh = Math.round(40 * isle.food);
    p.water = Math.min(Math.max(p.water, 120), p.water + water);
    p.fresh = Math.min(90, p.fresh + fresh);
    if (fresh > 8) this.crew.daysWithoutFresh = 0;
    this.crew.daysSinceLandfall = 0;
    this.crew.fatigue = clamp(this.crew.fatigue - 0.1, 0, 1);
    this.nav.sigmaLat = Math.min(this.nav.sigmaLat, 4);
    this.nav.sigmaLon = Math.min(this.nav.sigmaLon, 14);
    return `${given}. ${isle.landing}\n\n`
      + `${water > 4 ? `${water} days of water in the casks` : 'Not a cask filled'}, `
      + `${fresh > 4 ? `${fresh} days of fresh food` : 'nothing green'}, and bearings off three points of it `
      + 'on the sheet.';
  }

  /** The sea read, rumours searched, and islands raised: every tick at sea. */
  private watchForLand(): void {
    if (this.dockedAt || this.pendingEvent) return;
    const sign = readTheSea(this);
    if (sign) {
      this.pushAlert(sign.text.split('. ')[0] + '.', 'note');
      this.logEvent('note', sign.text, false);
    }
    const found = searchRumours(this);
    if (found) this.pushAlert(found.split('. ')[0] + '.', 'note');
    if (this.clock.t - this.isles.lastSightT < 600) return;
    this.isles.lastSightT = this.clock.t;
    const isle = isleInSight(this);
    if (!isle) return;
    if (this.clock.date.year > isle.year) {
      historyCatchesUp(this);
      return;
    }
    // Held open until the scene is answered, so it cannot fire twice.
    this.isles.found[isle.id] = { name: '', t: this.clock.t, landed: false, by: 'you' };
    this.easeTheClock(2);
    this.lastNewCoastT = this.clock.t;
    this.pushAlert(`Land! An island to the ${dirWord(bearingTo(this.ship.state.pos, isle))}, and on nobody\u2019s chart.`, 'grave');
    this.cueLook(bearingTo(this.ship.state.pos, isle));
    this.pendingScenes.push(isleScene(this, isle, saintOfDay(this.clock)));
  }

  /**
   * Enter a headland under a name, which is the act the whole thing is about.
   *
   * Half the coast of Africa still carries the name the first Portuguese
   * captain to see it happened to choose, usually for the saint of the day or
   * for what the thing looked like from the deck, and usually decided in about
   * a minute by a man who had no idea anyone would still be using it.
   */
  nameTheFeature(f: CoastFeature, given: string): string {
    this.namedFeatures[f.id] = given;
    // What it is worth at court. The same wherever the name is given — the
    // chart table and the scene at the rail used to pay different amounts for
    // the same headland — and much less for a coast the Casa already has on
    // its sheets or that the other captain has already passed and named.
    const heAhead = f.lat < 0 && this.rival.frontierLat < f.lat - 0.5;
    const worth = Math.round(f.value * (this.beyondTheKnown ? 1.5 : 0.35) * (heAhead ? 0.25 : 1));
    // Named where the thing is, not where the board thought it was.
    this.chart.addPlace(given, f.kind, { lat: f.lat, lon: f.lon }, this.clock.t);
    this.writeCoast(given, this.nav.estimated,
      `Named by me, ${this.clock.formatDate()}. `
      + `${this.sounding.depth.toFixed(0)} fathoms a mile off it, and the land behind `
      + `${this.sounding.shoreDistNm.toFixed(0)} miles distant when it first came up.`);
    this.crown.record('coast', given, this.nav.estimated, worth, this.clock.t);
    this.crown.progressObjective('name', undefined, 1);
    this.chartedThisPassage += 25;
    this.crown.chartedSincePatent += 25;
    this.crew.morale = clamp(this.crew.morale + 0.04, 0, 1);
    this.logEvent('discovery',
      `Entered this ${f.kind === 'river' ? 'river' : 'headland'} as ${given}, at `
      + `${formatLat(this.nav.estimated.lat)}, ${formatLon(this.nav.estimated.lon)} by the `
      + 'reckoning. The pilot has it on the sheet and the escrivão has it in the book, and from '
      + 'today that is its name.', true);
    return `${given}. It is on the chart under your hand and nobody else's.`;
  }

  // -------------------------------------------------------------------------
  // Raising a padrão
  // -------------------------------------------------------------------------

  /**
   * Whether the boat could put a stone ashore at all, weather and hands aside
   * from where she is.
   *
   * Split out from the place, because the two refusals are different and the
   * player needs to know which one he is looking at: "not here" is a thing he
   * fixes by sailing, "not today" is a thing he fixes by waiting.
   */
  padraoLandable(): { ok: boolean; reason: string } {
    // A longboat lives in surf that would swamp the skiff.
    const boat = this.ship.effects.boat;
    if (this.weatherNow.waveHeight > (boat ? 3.2 : 2.2) || this.weatherNow.wind.speed > (boat ? 28 : 22)) {
      return { ok: false, reason: 'No boat could land on that beach today.' };
    }
    if (this.sounding.shoreDistNm > 6) {
      return { ok: false, reason: 'Too far off the land to send a boat in.' };
    }
    if (ableHands(this.crew) < 10) {
      return { ok: false, reason: 'There are not enough men fit to pull a boat ashore.' };
    }
    return { ok: true, reason: 'The boat can be hoisted out and the pillar landed.' };
  }

  /**
   * The stone itself.
   *
   * Worth more the further it is beyond anything Lisbon has a sheet for, which
   * is the honest measure: a pillar on a cape three hundred miles past the last
   * line on the Casa's chart is a claim, and one on a headland everybody has
   * been passing for forty years is a decoration.
   */
  landThePadrao(f: CoastFeature, given: string): string {
    if (this.crown.padraoStock <= 0) {
      return 'There is no stone left in the hold. The carpenter offers to cut something out of a '
        + 'spare spar and is told, with some feeling, that a wooden padrão is worse than none.';
    }
    const beyond = this.beyondTheKnown;
    const worth = Math.round(f.value * (beyond ? 0.9 : 0.35));

    // Standing in, and waiting for a day the boat can live in.
    //
    // A cape is raised from the masthead at fifteen or twenty miles and a boat
    // cannot be landed from there, so this used to refuse and the player had to
    // close the coast himself and then find a second button. That was two
    // mechanisms for one act. Deciding to claim a headland is the decision; the
    // standing in and the waiting for a slant are what the ship then does about
    // it, and they cost what they cost.
    // The distance is paid for in hours: she closes the coast under her own
    // sail, and that is a known quantity. What is not known is whether the sea
    // will let a boat off the beach, so only that — and having hands fit to
    // pull her — is what the waiting is about.
    const off = Math.max(0, this.sounding.shoreDistNm - 3);
    const hours = 9 + (off / Math.max(this.physics.speedKnots, 2.5));
    const workable = (): { ok: boolean; reason: string } => {
      const boat = this.ship.effects.boat;
      if (this.weatherNow.waveHeight > (boat ? 3.2 : 2.2) || this.weatherNow.wind.speed > (boat ? 28 : 22)) {
        return { ok: false, reason: 'No boat could land on that beach today.' };
      }
      if (ableHands(this.crew) < 10) {
        return { ok: false, reason: 'There are not enough men fit to pull a boat ashore.' };
      }
      return { ok: true, reason: '' };
    };
    this.clock.t += hours * 3600;
    this.refreshEnvironment();
    let waited = 0;
    while (!workable().ok && waited < 5) {
      this.clock.t += 24 * 3600;
      this.refreshEnvironment();
      waited++;
    }
    const last = workable();
    if (!last.ok) {
      this.crew.fatigue = clamp(this.crew.fatigue + 0.08, 0, 1);
      return 'Five days standing off and on waiting for the sea to let a boat in, and it never '
        + `did. ${last.reason} The stone is still in the hold and the place is still ${given}, `
        + 'which is at least on the chart.';
    }
    this.crown.padroesRaised += 1;
    this.crown.padraoStock -= 1;
    this.crown.progressObjective('padrao', undefined, 1);
    this.crown.record('padrao', given, this.nav.estimated, worth, this.clock.t);
    this.crown.padraoSites.push({
      name: given, lat: this.nav.estimated.lat, lon: this.nav.estimated.lon, t: this.clock.t,
    });
    this.crew.morale = clamp(this.crew.morale + 0.07, 0, 1);
    this.crew.fatigue = clamp(this.crew.fatigue + 0.06, 0, 1);
    for (const o of this.crew.officers) {
      if (o.alive && !o.ashoreAt) o.loyalty = clamp(o.loyalty + 0.03, 0, 1);
    }
    // A pillar is a signpost and the other man can read it.
    if (beyond) this.rival.frontierLat = Math.min(this.rival.frontierLat, f.lat + 1.5);
    this.logEvent('discovery',
      `Hoisted out the boat and landed the pillar on the high ground at ${given}. The arms of `
      + 'Portugal and the date cut into the stone, the cross set on top of it, and the whole '
      + 'ship\u2019s company that could be spared standing round it bareheaded while the office '
      + 'was read. It will be there when everyone who saw it is dead.', true);
    this.pushAlert(`${given} claimed for the Crown.`, 'note');
    return beyond
      ? `The stone is standing on the highest ground the boats could reach. It will tell the next `
        + `Portuguese ship down this coast exactly how far you got, and when, and in what.`
      : `The stone is standing, on a headland Portuguese ships have been passing for years. The `
        + `Casa will enter it. Nobody at the Casa will be surprised by it.`;
  }

  /** Take one of the courses offered by the outstanding decision. */
  resolveEvent(index: number): void {
    const event = this.pendingEvent;
    if (!event || !event.choices) return;
    const choice = event.choices[index];
    this.pendingEvent = null;
    if (!choice) return;
    const outcome = choice.resolve(this);
    if (event.id.startsWith('chronicle:')) chronicleAnswered(this.chronicle, event.id);
    this.logEvent(event.severity === 'note' ? 'note' : 'peril', outcome, true);
    this.pushAlert(outcome, event.severity);
    this.refreshEnvironment();
    // In port the queue is not drained (the clock is stopped), so a story
    // beat waiting behind this one is brought forward, and the next beat of
    // the same story — if it happens here too — is put straight after.
    if (this.dockedAt && !this.pendingEvent) {
      const i = this.pendingScenes.findIndex((x) => x.id.startsWith('quest:') || x.id.startsWith('chronicle:'));
      if (i >= 0) this.pendingEvent = this.pendingScenes.splice(i, 1)[0];
      else this.checkStory();
    }
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

    // What it costs is the state of the tide, which is the whole of it.
    //
    // Touching used to be free — "gently, with no harm in it" — which was a
    // deliberate kindness and also meant the one piece of water in this game
    // that can genuinely trap a ship had no teeth at all. It still does not
    // wreck her. What it does now is the thing that actually decided these:
    // a ship that goes on with the water making under her lifts off on the
    // next of the flood, and one that goes on at the top of a spring tide
    // spends the day lying over on her bilge with her own weight working her.
    const outlook = groundingOutlook(this.tideNow());
    if (outlook.easy) {
      // The water is making under her, so she lifts off on her own — but she
      // has to be put back into it, or she touches again on the next step and
      // the "gently, with no harm in it" message becomes a stream of them.
      this.floatHerOff();
      this.pushAlert(
        'She touched, and the flood lifted her off again. The watch have handed the sail and '
        + 'her head is off the land.', 'warning');
      this.logEvent('note',
        'Ran her in until she would go no further and touched. ' + outlook.text);
      return;
    }
    this.pendingScenes.push(this.aground(outlook));
  }

  /**
   * She has taken the ground on a falling tide, which is a day's work.
   *
   * Three courses, and they are the three a master had: lighten her and get her
   * off now, lay out an anchor and wait for the water, or let her sit and take
   * what comes. Every one of them costs something real, and none of them is
   * the end of the voyage.
   */
  private aground(outlook: { easy: boolean; hours: number; text: string }): SeaEvent {
    const cargo = this.ship.cargoTons;
    const over = Math.min(cargo, Math.max(3, Math.round(cargo * 0.35)));
    return {
      id: 'aground',
      title: 'She has taken the ground',
      severity: 'grave',
      facts: { hours: outlook.hours },
      text: `She went on making four knots and stopped in her own length, and everything not `
        + `secured went forward along the deck with her.\n\n${outlook.text}\n\n`
        + 'The carpenter is sounding the well. Nothing is coming in yet.',
      choices: [
        ...(cargo > 2 ? [{
          label: `Lighten her — ${over} tons over the side`,
          detail: 'Get her off on this tide. It is cargo, and some of it is somebody else\u2019s.',
          resolve: (g: Game) => {
            const gone = g.heaveCargoOverboard(over);
            g.clock.t += 4 * 3600;
            g.crew.fatigue = clamp(g.crew.fatigue + 0.14, 0, 1);
            shiftAll(g.hands, -0.04);
            (g as any).floatHerOff();
            return `${gone.toFixed(0)} tons through the lee ports and into the boats, a kedge `
              + 'laid out astern, and the whole company at the capstan. She came off at about '
              + 'four in the afternoon with a noise like a door opening and swung to her anchor '
              + 'in four fathoms. The cargo is on the putty and will be there at low water for '
              + 'anyone who wants it.';
          },
        }] : []),
        {
          label: 'Lay out a kedge and wait for the water',
          detail: `${tideClock(outlook.hours)} until high water, lying over on her bilge.`,
          resolve: (g: Game) => {
            g.clock.t += Math.max(2, outlook.hours) * 3600;
            g.crew.fatigue = clamp(g.crew.fatigue + 0.22, 0, 1);
            g.crew.morale = clamp(g.crew.morale - 0.08, 0, 1);
            shiftAll(g.hands, -0.08);
            // Lying over on the ground works her, and how much depends on
            // what state she was already in.
            // Without a proper longboat the kedge goes out in the skiff, not
            // far enough, and she lies on the ground longer working herself.
            const boat = g.ship.effects.boat;
            const hurt = g.rng.range(0.04, 0.13) * (2 - g.ship.condition.hull) * (boat ? 0.6 : 1.4);
            g.ship.damage(hurt);
            (g as any).floatHerOff();
            if (!boat) {
              return 'The kedge went out in the skiff, which is the wrong boat for it, and not half '
                + 'as far as it should have. She lay over on the ebb and ground herself against '
                + 'the bottom for hours before the flood floated her. The carpenter wants a word '
                + 'about a proper longboat.';
            }
            return `A kedge laid out astern in the boat and the company at the capstan every `
              + `hour of the ebb for nothing. She lay over about fifteen degrees at low water `
              + `with the sea breaking under her counter and everybody aboard listening to her, `
              + `and came off on the top of the flood. She is making water where she was not `
              + `before, and the carpenter has a list.`;
          },
        },
        {
          label: 'Let her lie and see what the tide leaves',
          detail: 'Do nothing. It is sometimes right and it is never comfortable.',
          resolve: (g: Game) => {
            g.clock.t += Math.max(3, outlook.hours + 2) * 3600;
            g.crew.morale = clamp(g.crew.morale - 0.14, 0, 1);
            shiftAll(g.hands, -0.12);
            const hurt = g.rng.range(0.08, 0.22) * (2 - g.ship.condition.hull);
            g.ship.damage(hurt);
            (g as any).floatHerOff();
            if (g.rng.chance(0.3)) {
              g.ship.condition.leak = clamp(g.ship.condition.leak + 0.25, 0, 3);
              return 'She lay down on her bilge and stayed there through the whole of the ebb '
                + 'with her people sitting on the weather rail because there was nowhere else '
                + 'to sit. She floated at about two in the morning and she has started a butt '
                + 'somewhere forward that nobody can find. Both watches on the pumps from now '
                + 'until she is hove down somewhere.';
            }
            return 'She lay down on her bilge and stayed there through the whole of the ebb, and '
              + 'floated on the top of the flood with a good deal of noise and nothing broken '
              + 'that anybody can see. The boatswain does not believe it and is still looking.';
          },
        },
      ],
    };
  }

  /**
   * Put her back in water that will float her.
   *
   * Every one of the grounding scenes says she came off — "came off at about
   * four in the afternoon", "came off on the top of the flood", "floated at
   * about two in the morning" — and not one of them moved her. She was left
   * sitting exactly where she struck, so `touchLand` raised the same scene
   * again three hours later, and again, and again. Censused with a captain who
   * answered every card with the careful choice, that came to twenty-one
   * groundings, a hull worked from sound to a quarter in four days, and a ship
   * that filled faster than the pumps could clear her — all of it from one
   * question the game asked over and over because the answer never took effect.
   *
   * She comes off the way a ship comes off: astern, down her own keel line,
   * into the water she came in over, and then her head is put out to sea.
   */
  private floatHerOff(): void {
    const s = this.ship.state;
    const astern = wrap360(s.heading + 180);
    // Out along her own wake until there is water under her, and no further —
    // a mile and a half is already more than a kedge would ever warp her.
    for (let nm = 0.15; nm <= 1.6; nm += 0.15) {
      const p = rhumbStep(s.pos, astern, nm * NM);
      if (!isLand(p) && depthAt(p) > this.ship.hull.draft * 1.6) {
        s.pos = p;
        break;
      }
    }
    // Head her away from whatever she was on, and stopped, so the next thing
    // she does is the captain's decision and not a second grounding.
    this.sounding = { ...this.sounding, aground: false };
    s.heading = wrap360(this.sounding.shoreBearing + 180);
    s.surge = 0;
    s.sway = 0;
    s.yawRate = 0;
    this.setCanvas(0);
    this.standingCourse = wrap360(s.heading);
    this.helmOrder = null;
    // And she is not asked about it again the moment she is afloat.
    this.lastTouchT = this.clock.t;
    this.refreshEnvironment();
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
    this.helmOrder = null;
    this.standingCourse = null;
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

  /**
   * Con her by course: "so many degrees to starboard", which the watch then
   * hold. Works at any clock rate and does not stop the clock, because giving
   * an order is not the same as standing at the wheel.
   */
  alterCourse(deg: number): void {
    const from = this.helmOrder ?? this.courseToSteer() ?? this.ship.state.heading;
    this.helmOrder = wrap360(from + deg);
    this.standingCourse = null;
    // Putting the helm over yourself takes the coast back off the master.
    this.coastOrder = null;
  }

  /** Steady on the course she is heading now. */
  steadyAsSheGoes(): void {
    this.helmOrder = wrap360(this.ship.state.heading);
    this.standingCourse = null;
    this.coastOrder = null;
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
      this.standingCourse = null;
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
    this.standingCourse = null;
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
    this.latitudeOrder = null;
    this.coastOrder = null;
    this.standingCourse = null;
    return true;
  }

  /**
   * The course held while running down a latitude: not pure east or west, but
   * biased toward the parallel by however far off it she has drifted.
   *
   * The bias is a heading correction, not a fix — it comes from the reckoning,
   * which is exactly as good as the reckoning is, and it is why the whole
   * technique still wants a noon sight every day it can get one. A ship this
   * makes turn square onto the parallel the moment she is a mile off it would
   * spend her whole passage crabbing back and forth across it and make no
   * easting at all; capping the bias keeps her always gaining ground the way
   * she is bound, correcting harder the further off she has been let run.
   */
  private latitudeCourse(): number | null {
    const o = this.latitudeOrder;
    if (!o) return null;
    const errNm = (this.nav.estimated.lat - o.lat) * 60;
    const GAIN = 2.2;
    const MAX_BIAS = 55;
    const bias = clamp(errNm * GAIN, -MAX_BIAS, MAX_BIAS);
    const base = o.eastward ? 90 : 270;
    const sign = o.eastward ? 1 : -1;
    return wrap360(base + sign * bias);
  }

  /**
   * Give up the direct passage and run down a parallel instead.
   *
   * `eastward` is fixed at the order rather than worked out fresh each frame,
   * because the whole point is committing to a direction and holding it — a
   * captain who let the game decide which way to turn every time the
   * reckoning twitched would never actually reach the coast he is aiming for.
   */
  runDownTheLatitude(eastward: boolean): void {
    const at = this.aimedMark ?? this.destination;
    if (!at) return;
    this.latitudeOrder = { lat: at.lat, eastward };
    this.helmOrder = null;
    this.standingCourse = null;
  }

  // -------------------------------------------------------------------------
  // Men sent inland
  // -------------------------------------------------------------------------

  /**
   * Give a man a bag of goods, a letter, and an errand, and watch him walk
   * inland. See progression/inland.
   *
   * He stays on the books and stays on the wage bill, because the Crown paid
   * these men for the whole time they were gone and paid their widows after,
   * and because a captain who could simply write a man off would not feel the
   * years the way the thing is supposed to be felt.
   */
  sendInland(def: PortDef, officerId: string, errandId: string): string {
    const e = ERRAND_BY_ID.get(errandId as never);
    const o = this.crew.officers.find((x) => x.id === officerId);
    if (!e || !o) return 'There is nobody to send.';
    const cost = outfitCost(e);
    if (this.crown.gold < cost) {
      return `Fitting a party out costs ${cost} cruzados of goods and you have not got it.`;
    }
    this.crown.gold -= cost;
    o.ashoreAt = def.id;
    o.ashoreSince = this.clock.t;
    const backing = backingFor(this, def, o);
    this.journeys.push({
      id: `jn${this.nextJourneyId++}`,
      errand: e.id,
      officerId: o.id,
      officerName: o.name,
      fromPortId: def.id,
      peopleId: def.people,
      sentT: this.clock.t,
      // Not the errand's nominal length: a badly backed party is slower as well
      // as less likely, because half of what goes wrong is being made to wait.
      dueT: this.clock.t + e.years * (1.5 - backing * 0.55) * 365.25 * 86400,
      backing,
    });
    this.journeyRecord.sent++;
    this.logEvent('contact',
      `${o.name} went up the river from ${def.name} with nine men, four hundred cruzados of `
      + `goods, and orders to ${e.brief.charAt(0).toLowerCase()}${e.brief.slice(1)} He was told `
      + `we would come back for him. Everybody on the beach understood what that was worth.`, true);
    return `${o.name} is gone inland. Put into ${def.name} again in two or three years.`;
  }

  /**
   * Whether a man who went inland is on the beach here, and if so, the card.
   *
   * Put up as a pending event rather than as a notice on the port screen,
   * because three years is not a notice.
   */
  checkInland(def: PortDef): boolean {
    if (this.pendingEvent) return false;
    const scene = journeyScene(this, def);
    if (!scene) return false;
    this.logEvent('contact', scene.text.replace(/\n\n/g, ' '), true);
    this.pendingEvent = scene;
    return true;
  }

  /**
   * Something a returning man was told about, entered as hearsay.
   *
   * Deliberately a rumour and not a chart: he did not see the place, he was
   * told about it by somebody who had, and the error on it is the error on
   * every second-hand position in this game.
   */
  hearFromInland(target: PortDef, from: PortDef): void {
    if (this.leads.some((x) => x.targetPort === target.id)) return;
    const known = new Set(this.chart.ports.keys());
    const lead = hearRumour(from, known, this.rng, this.clock.t, () => `l${this.nextLeadId++}`);
    if (!lead) return;
    lead.targetPort = target.id;
    lead.source = `a man who walked there and back`;
    this.leads.push(lead);
  }

  /**
   * Cargo through the lee ports, to lighten her.
   *
   * Takes it out of the largest lots first, because that is what a boatswain
   * with a gale on him and an hour to do it in actually starts on. Returns the
   * tons that really went, which is not always the tons asked for. Charters and
   * the King's cargo are not exempt: that is the whole weight of the decision.
   */
  heaveCargoOverboard(tons: number): number {
    let want = Math.max(0, tons);
    let gone = 0;
    const lots = this.ship.cargo.slice().sort((a, b) => b.quantity - a.quantity);
    for (const lot of lots) {
      if (want <= 0.01) break;
      const g = good(lot.goodId);
      const tonsHere = lot.quantity * g.bulk;
      const take = Math.min(tonsHere, want);
      const units = take / Math.max(g.bulk, 1e-6);
      this.ship.removeCargo(lot.goodId, units);
      want -= take;
      gone += take;
    }
    if (gone > 0) this.crown.syncCargoObjectives((id) => this.ship.quantityOf(id));
    return gone;
  }

  /** She is lost. The one ending that is not the end of a career. */
  wreckHer(): void {
    if (this.reprieve('She struck and should have gone to pieces. You had the boats out, a kedge laid, the guns over the side and every man on the capstan before the next sea, and on the top of the flood she came off.')) {
      this.ship.damage(0.25);
      return;
    }
    const lost = Math.max(1, Math.round(this.crew.count * this.rng.range(0.3, 0.7)));
    this.killHands(lost, 'Lost when she struck.');
    this.endGame('She was driven ashore in a gale and went to pieces in the surf. '
      + `${this.crew.count} of the company reached the beach.`);
  }

  /** The inland road, opened once, which deepens what this port can trade. */
  openTheRoad(portId: string): void {
    this.inlandRoads.add(portId);
    this.markets.openRoad(portId, this.clock.t);
  }

  /** Give it up, and go back to steering direct for the mark. */
  stopRunningTheLatitude(): void {
    this.latitudeOrder = null;
  }

  // -------------------------------------------------------------------------
  // Running a coast at an offing
  // -------------------------------------------------------------------------

  /**
   * Hold her parallel to the land at a set distance off. See perk `coasting`.
   *
   * This is what the caravels actually did for eighty years, and it is the one
   * order in the game a player has had to give by hand, minute by minute, for
   * days at a time: a coast is surveyed by running along it close enough to
   * draw and far enough off to live, and the whole of `Chart.survey` is fed by
   * exactly that. Holding it by eye at four times real time is the least
   * interesting work in the game and there is a great deal of it.
   *
   * It is a perk and not a default because it is a real skill. A master who can
   * be handed a coast and an offing and left to run it is the difference
   * between a captain who has to be on deck and one who does not, which is what
   * the whole seamanship tree is about.
   */
  coastOrder: { offingNm: number; steer?: number; smoothed?: number; hand?: number; axis?: number } | null = null;

  /** Ship-hours in the step just taken, for anything rate-limited in her time. */
  private lastStepHours = 0;

  /**
   * The coast's general trend, as a line, rather than the nearest rock to her.
   *
   * This is the whole fix for the jitter. `sounding.shoreBearing` points at the
   * single closest piece of land, which on a real coast jumps about constantly:
   * every headland, every islet, every bight swings it thirty or forty degrees
   * in a few miles, and a controller reading it steered the ship round each one
   * individually. What a master actually does is look at the run of the land
   * over the next day's sail and lay a course along *that*, ignoring anything
   * smaller than his offing.
   *
   * So: probe the shore at points spread along her track, fit a straight line
   * through those shore points by least squares, and hold station off the line.
   * Features shorter than the probe span average out of the fit instead of
   * being steered around.
   */
  private coastTrend(span: number, axis: number):
  { bearing: number; mE: number; mN: number; bulge: number } | null {
    const here = this.ship.state.pos;
    // Seven probes over `span` miles along `axis`: enough to average a headland
    // out, few enough to stay cheap at 7200x.
    //
    // `axis` is deliberately not her head. Probing along the head fed the fit
    // with her own steering: working to windward she swings sixty degrees a
    // board, the probe line swings with her, the fit moves, the aim point
    // moves, and she chases herself. It is the trend from the last tick
    // instead, which is a property of the coast and not of the ship.
    const pts: { e: number; n: number }[] = [];
    for (let i = -3; i <= 3; i++) {
      const at = rhumbStep(here, axis, (i * span * NM) / 6);
      const s = nearestShore(at, 120);
      if (!Number.isFinite(s.distance) || s.distance / NM > 110) continue;
      const shorePoint = rhumbStep(at, s.bearing, s.distance);
      pts.push(toENU(here, shorePoint));
    }
    if (pts.length < 4) return null;

    // Least-squares line through the shore points, taken as the principal axis
    // of the scatter so a north-south coast is no harder than an east-west one.
    const n = pts.length;
    const mE = pts.reduce((a, p) => a + p.e, 0) / n;
    const mN = pts.reduce((a, p) => a + p.n, 0) / n;
    let see = 0; let snn = 0; let sen = 0;
    for (const p of pts) {
      see += (p.e - mE) ** 2; snn += (p.n - mN) ** 2; sen += (p.e - mE) * (p.n - mN);
    }
    // The fit gives the direction as an angle anticlockwise from east, so it
    // wants turning into a compass bearing before anything else touches it.
    if (see + snn < 1) return null;   // every probe found the same rock
    const phi = atan2d(2 * sen, see - snn) / 2;
    const bearing = wrap360(90 - phi);

    // How far the most seaward headland in the span stands out of the line.
    //
    // This is what makes "keep her five miles off" mean what a master means by
    // it. A straight line laid through a bight passes close to the headlands at
    // each end and miles from the beach in the middle, so a path offset five
    // miles from the *line* was measured holding two and a half off the points
    // and fifteen off the bay — the fair curve the captain asked for, at an
    // offing he did not. Offsetting by the bulge as well clears the points by
    // the distance ordered and simply gives him more water in the bays, which
    // is the same thing he would do with the ship in his own hands.
    const ux = sind(bearing); const uy = cosd(bearing);
    const shipPerp = -mE * uy + mN * ux;
    const sign = Math.sign(shipPerp) || 1;
    let bulge = 0;
    for (const p of pts) {
      const perp = ((p.e - mE) * uy - (p.n - mN) * ux) * sign;
      if (perp > bulge) bulge = perp;
    }
    return { bearing, mE, mN, bulge: bulge / NM };
  }

  /**
   * The course that follows the coast.
   *
   * This steers to a *path*, not to an error, and that is the whole of the
   * difference. Three earlier versions were proportional controllers on the
   * distance off — measure how far the land is, turn in proportion — and every
   * one of them sawed, because a controller of that shape has no idea where it
   * is going, only how wrong it is now. Feeding it a smoothed distance and
   * rate-limiting its output helped and did not fix it; it was still four
   * hundred degrees of helm to make good a hundred miles of coast.
   *
   * So the coast is fitted to a line (`coastTrend`), the line is offset to
   * seaward by the ordered offing to give the track she is meant to be on, and
   * she steers for a point on that track some miles ahead — the same pure
   * pursuit a helmsman uses without naming it, by picking a hill over the bow
   * and keeping it there. The aim point moves only as fast as the fitted line
   * does, which is slowly, so the course is smooth by construction rather than
   * by being filtered afterwards.
   *
   * Two things are still done the hard way. The sense in which she is running
   * along the coast is latched when the order is given, because deriving it from
   * her present head let it flip end for end the moment she began working to
   * windward. And the distance to the nearest land — not to the fitted line —
   * still overrides everything if it becomes small, because the fit knows the
   * trend of the coast and nothing at all about the rock she is about to hit.
   */
  private coastCourse(): number | null {
    const o = this.coastOrder;
    if (!o) return null;
    const d = this.sounding.shoreDistNm;
    // Out of soundings and out of sight of it, there is no coast to follow.
    if (!Number.isFinite(d) || d > 90) return null;

    // Look along a span set by the offing: the further off she is ordered to
    // run, the larger the features she is entitled to ignore. Never less than
    // thirty miles, or small bays still get into the fit.
    const span = Math.max(60, o.offingNm * 4);
    const trend = this.coastTrend(span, o.axis ?? this.ship.state.heading);
    if (trend) {
      // Keep the probe axis pointing the way she is running, not back down the
      // coast: the fitted line has no sense of direction, only of orientation.
      const sensed = o.axis === undefined || Math.abs(angleDelta(o.axis, trend.bearing)) < 90
        ? trend.bearing : wrap360(trend.bearing + 180);
      // And hold it to a rate, for the same reason the steer is held to one.
      // Rounding a peninsula — Cap-Vert was the case that showed it — the fit
      // jumps to the coast on the far side, the probe line jumps with it, and
      // she was measured turning back north up the coast she had just run.
      const milesAxis = Math.max(this.physics.speedKnots, 0.5) * (this.lastStepHours ?? 0);
      o.axis = o.axis === undefined ? sensed
        : wrap360(o.axis + clamp(angleDelta(o.axis, sensed), -1, 1)
          * Math.max(2, milesAxis * 8));
    }

    // Which way the land lies from her, by the trend where there is one.
    const shoreBrg = trend
      ? (Math.abs(angleDelta(wrap360(trend.bearing + 90), this.sounding.shoreBearing))
        < 90 ? wrap360(trend.bearing + 90) : wrap360(trend.bearing - 90))
      : this.sounding.shoreBearing;

    // Latch the hand of the shore: land to port, or land to starboard.
    if (o.hand === undefined) {
      o.hand = angleDelta(this.ship.state.heading, shoreBrg) >= 0 ? 1 : -1;
    }
    const alongCoast = wrap360(shoreBrg - o.hand * 90);

    let want: number;
    if (trend) {
      // Pure pursuit, on the offset curve rather than on an offset straight
      // line.
      //
      // The line fit was tried as the path itself and holds a beautifully fair
      // course at the wrong distance: a chord through forty miles of a bight
      // passed two and a half miles off the points and fifteen off the beach in
      // the middle, on an order of five. So the fit is kept for the *direction*
      // to look in, which is all it is good for, and the path is the real thing
      // — the curve lying `offing` miles off the actual coast.
      //
      // The aim point is found by stepping ahead along that direction, asking
      // where the land is from *there*, and coming back out to seaward by the
      // offing. Three of them are averaged so that one probe landing on an
      // islet cannot throw the helm.
      const runDir = Math.abs(angleDelta(alongCoast, trend.bearing)) < 90
        ? trend.bearing : wrap360(trend.bearing + 180);

      // Look far enough ahead that a wobble in any one probe is a degree or two
      // of bearing and not ten. This distance is the single number that decides
      // whether she saws: measured on the same coast, twelve miles of look-ahead
      // cost 437 degrees of helm per hundred made good and thirty cost 142.
      const aheadNm = clamp(Math.max(this.physics.speedKnots, 3) * 3,
        Math.max(34, o.offingNm * 1.5), span * 0.7);

      // Of the candidates, take the one that asks her to keep furthest to
      // seaward, rather than the average of them.
      //
      // Averaging was tried and is wrong at exactly the place it matters. Along
      // the straight of the Guinea coast it is fine; at the turn into the Bight
      // of Biafra, where the land swings from running east to running south,
      // the near probe lands on one coast and the far one across the bight, and
      // the mean of two points on opposite sides of a corner is out in the
      // middle of it. Measured, she alternated between steering 90 and steering
      // 210 every four hours for two days. Taking the most seaward candidate
      // instead means the corner is entered on the course that clears it, which
      // is also what a master does with a point of land ahead: he gives it the
      // berth the worst of it needs, not the berth the average of it needs.
      const here = this.ship.state.pos;
      let want2: number | null = null;
      let mostSeaward = Infinity;
      for (const frac of [0.6, 0.85, 1.15, 1.5]) {
        const at = rhumbStep(here, runDir, aheadNm * frac * NM);
        // A probe that has walked up the beach is no use: the nearest shore to
        // a point inland is whatever is behind it, and the aim point derived
        // from it can be anywhere at all.
        if (isLand(at)) continue;
        const sh = nearestShore(at, 120);
        if (!Number.isFinite(sh.distance) || sh.distance / NM > 110) continue;
        const shorePt = rhumbStep(at, sh.bearing, sh.distance);
        // Out to seaward from the land at that place, by the distance ordered.
        const aim = rhumbStep(shorePt, wrap360(sh.bearing + 180), o.offingNm * NM);
        const brg = bearingTo(here, aim);
        // A ship following a coast never has to turn back on herself. Rounding
        // a peninsula the probes land on the far side of it, and the aim point
        // they give is astern; taking it turned her round to run back up the
        // coast she had just made good.
        if (Math.abs(angleDelta(this.ship.state.heading, brg)) > 100) continue;
        // Seaward is a turn in the direction opposite the hand of the shore, so
        // the most seaward candidate is the one that minimises this.
        const turn = o.hand * angleDelta(alongCoast, brg);
        if (turn < mostSeaward) { mostSeaward = turn; want2 = brg; }
      }
      // But never right round: she is following this coast, not leaving it.
      want = want2 === null ? alongCoast
        : wrap360(alongCoast + o.hand * clamp(mostSeaward, -95, 80));
    } else {
      // No fit — hold what she has along the coast and let the floor below do
      // the work if the land closes.
      want = alongCoast;
    }

    // The one thing the path may never smooth away: the actual land.
    //
    // Everything above looks ahead, and looking ahead is exactly what fails at
    // a corner or over an islet the probes stepped across. So a plain guard is
    // laid over the top of it, on the distance to the nearest land right now.
    // It is written to contribute *nothing* while she is at or outside the
    // offing she was given — which is almost always — so it adds no motion of
    // its own to the helm, and everything once she is inside it.
    // The guard reads a smoothed distance, not the raw one. Reading the raw
    // one put all the noise it was meant to catch straight back into the helm:
    // measured, it took her from 287 degrees of helm per hundred miles to 545,
    // undoing the entire fix in one term. Smoothed over a run of coast rather
    // than a run of clock, so it behaves the same at any rate of time.
    //
    // And it looks a little way ahead as well as at where she is. Aiming at a
    // point thirty-odd miles up the coast is what makes the track fair, and it
    // is also what lets her cut inside something in the first ten: on a five
    // mile order she was measured closing to one and six tenths. Taking the
    // worst of the next few miles as well as the present means the guard leads
    // the danger instead of lagging it, so it can stay gentle and still work.
    let dGuard = d;
    for (const ahead of [3, 6, 10]) {
      const at = rhumbStep(this.ship.state.pos, this.ship.state.heading, ahead * NM);
      const sh = nearestShore(at, 60);
      const nm = isLand(at) ? 0 : sh.distance / NM;
      if (nm < dGuard) dGuard = nm;
    }
    const milesRun = Math.max(this.physics.speedKnots, 0.5) * (this.lastStepHours ?? 0);
    const k = 1 - Math.exp(-milesRun / Math.max(8, o.offingNm * 0.8));
    o.smoothed = o.smoothed === undefined ? dGuard : o.smoothed + (dGuard - o.smoothed) * k;

    const shortfall = o.offingNm - o.smoothed;
    const panicking = d < o.offingNm * 0.45;
    if (shortfall > 0 || panicking) {
      const urgency = panicking ? 1
        : clamp(shortfall / Math.max(o.offingNm * 0.7, 1), 0, 1);
      // Where the guard points hardens with how bad it is. A little inside the
      // offing she is merely edged out, on the seaward bow; embayed — which is
      // what happens rounding Cap-Vert into the bight behind it — she is put
      // straight out to sea, which is what a master does and what the order is
      // for. Interpolating between the two keeps it from being a switch.
      const edge = wrap360(alongCoast - o.hand * 50);
      const out = wrap360(shoreBrg + 180);
      const guard = wrap360(edge + clamp(urgency * 1.6 - 0.6, 0, 1) * angleDelta(edge, out));
      want = wrap360(want + urgency * angleDelta(want, guard));
    }

    // Give the helm a course she can actually sail.
    //
    // The first version handed over the geometric answer and walked away. On a
    // coast that happened to lie across the wind that answer was inside her
    // no-go: measured off Guinea, she was put at twenty degrees to the wind's
    // eye, sat in irons making a knot and a half *astern*, and was set down on
    // the beach she had been told to keep twenty miles off — arriving at nought
    // point nought miles while the order was still in force.
    //
    // So the wanted direction is run through the same `bestCourse` the strange
    // sail is chased with, which returns the heading that makes the most good
    // in that direction out of the polar table. A master handed a coast and an
    // offing does not sail into the wind either; he makes his offing on the
    // tack that pays.
    const w = this.weatherNow.wind;

    // Only ask the polar table when she cannot simply steer what is wanted.
    //
    // `bestCourse` searches headings on a five-degree grid, so a demand sitting
    // between two of them flips from one to the other and back every tick, and
    // the ship dutifully swings five degrees each way for ever. Measured at the
    // tick, that chatter alone was most of the remaining helm: the course was
    // fair at any sane sampling rate and still cost four hundred degrees per
    // hundred miles. When the wanted course is outside her no-go it *is* the
    // best course, exactly, and there is nothing to search for.
    const offWind = Math.abs(angleDelta(w.from, want));
    if (offWind >= this.noGoAngle) {
      const prevOk = o.steer;
      if (prevOk === undefined) { o.steer = want; return want; }
      const milesOk = Math.max(this.physics.speedKnots, 0.5) * (this.lastStepHours ?? 0);
      const lim = panicking ? 180 : Math.max(1, milesOk * 4);
      o.steer = wrap360(prevOk + clamp(angleDelta(prevOk, want), -lim, lim));
      return o.steer;
    }

    const best = bestCourse(this.ship.hull.id, w.from, w.speed, want);
    let sailable = best.heading;

    // Don't go about for a trifle.
    //
    // `bestCourse` re-decides from nothing every tick, so wherever the demand
    // sits near a dead beat the two tacks trade places on a few degrees of
    // shift and she tacks, and tacks back, and tacks again — thirty swings of
    // over thirty degrees in four days, measured. A master puts her about when
    // the other board is worth having, not when it is worth a tenth of a knot.
    // So the board she is on keeps the benefit of the doubt.
    const mirrored = wrap360(2 * w.from - sailable);
    if (Math.abs(angleDelta(this.ship.state.heading, mirrored))
      < Math.abs(angleDelta(this.ship.state.heading, sailable))) {
      const vmgOf = (h: number) => polarAt(this.ship.hull.id, w.speed,
        Math.abs(wrap180(w.from - h))) * cosd(angleDelta(want, h));
      if (vmgOf(mirrored) > vmgOf(sailable) - 0.12 * Math.max(best.speed, 1)) sailable = mirrored;
    }

    // Slew limit, in degrees per mile made good rather than per tick, so the
    // curve she describes is the same at one time scale as at another.
    const milesSince = Math.max(this.physics.speedKnots, 0.5) * (this.lastStepHours ?? 0);
    const prev = o.steer;
    if (prev === undefined) { o.steer = sailable; return sailable; }
    const limit = panicking ? 180 : Math.max(1, milesSince * 4);
    o.steer = wrap360(prev + clamp(angleDelta(prev, sailable), -limit, limit));
    return o.steer;
  }

  /** Hand the watch the coast and an offing. */
  followTheCoast(offingNm: number): string {
    if (!this.can('coasting')) {
      return 'Nobody aboard can be trusted to hold her at a distance off a coast you cannot see '
        + 'from the cabin. You will have to con her yourself.';
    }
    this.coastOrder = { offingNm: clamp(offingNm, 0.5, 40) };
    this.helmOrder = null;
    this.latitudeOrder = null;
    this.standingCourse = null;
    this.logEvent('navigation',
      `Gave the master the coast and told him to hold her ${offingNm.toFixed(0)} miles off it and `
      + 'follow it. He has the lead going in the chains and a man at the masthead, and he will '
      + 'send for you when it changes its mind about which way it is going.');
    return `Running the coast at ${offingNm.toFixed(0)} miles.`;
  }

  /** Take it back. */
  stopFollowingTheCoast(): void {
    this.coastOrder = null;
  }

  // -------------------------------------------------------------------------
  // The strange sail
  // -------------------------------------------------------------------------

  /**
   * The course the watch steer while there is a sail in sight and an order
   * about her.
   *
   * Deliberately the *best* course for the order rather than a bearing: told to
   * close a ship dead to windward, a caravel does not point at her, she works
   * up to her on the tack that pays. That is `bestCourse`, which is the same
   * calculation the stranger's own master is doing about you, out of the same
   * table, so neither ship has an advantage the rig does not give her.
   */
  private chaseCourse(): number | null {
    const s = this.encounter;
    if (!s || this.chaseOrder === 'hold') return null;
    const w = this.weatherNow.wind;
    const toHer = bearingTo(this.ship.state.pos, s.pos);
    const want = this.chaseOrder === 'close' ? toHer : wrap360(toHer + 180);
    return bestCourse(this.ship.hull.id, w.from, w.speed, want).heading;
  }

  /** Nautical miles to the strange sail, or null when there is not one. */
  rangeToSail(): number | null {
    if (!this.encounter) return null;
    return haversine(this.ship.state.pos, this.encounter.pos) / NM;
  }

  /**
   * The pilot, once in a career, on how a chase is actually decided.
   *
   * The same reason the volta do mar is said out loud: it is a real piece of
   * seamanship that a player will not arrive at by reasoning from anything on
   * the screen, and a captain of this period would have known it before he was
   * twenty. Which way to run is read off both ships' polars at the wind that is
   * actually blowing — so the advice is never generic, and it is never wrong.
   */
  private chaseAdvice(): string | null {
    const s = this.encounter;
    if (!s || this.chaseToldOnce) return null;
    const w = this.weatherNow.wind;
    const onTheWind = 55;
    const beforeIt = 160;
    const myClose = polarAt(this.ship.hull.id, w.speed, onTheWind);
    const myRun = polarAt(this.ship.hull.id, w.speed, beforeIt);
    const herClose = polarAt(s.hullId, w.speed, onTheWind);
    const herRun = polarAt(s.hullId, w.speed, beforeIt);
    const closeEdge = myClose - herClose;
    const runEdge = myRun - herRun;
    if (Math.abs(closeEdge - runEdge) < 0.35) return null;
    this.chaseToldOnce = true;
    return closeEdge > runEdge
      ? 'The pilot: "Haul your wind, senhor. She will not lie as close as we will, and every '
        + 'hour on this tack is half a mile she cannot get back."'
      : 'The pilot: "Square away and run, senhor. She points better than we do and we will not '
        + 'beat her to windward — but before it she is the slower ship."';
  }

  /** Whether the pilot has explained a chase. Once a career is enough. */
  private chaseToldOnce = false;

  /** Tell the watch what to do about her. */
  orderChase(order: ChaseOrder): void {
    if (!this.encounter) return;
    this.chaseOrder = order;
    const advice = this.chaseAdvice();
    if (advice) {
      this.pushAlert(advice, 'note');
      this.logEvent('note', advice, true);
    }
    // A chase is conned, not run off. Dropping out of the fast rates is the
    // difference between a three-hour pursuit and one frame.
    if (order !== 'hold') this.easeTheClock(2);
    this.pushAlert(order === 'close'
      ? 'Hands to the braces — we are going down to her.'
      : order === 'avoid'
        ? 'Put the helm up. We want nothing to do with her.'
        : 'Hold your course and let her do as she likes.', 'note');
  }

  /**
   * Raise a sail, occasionally, where there is shipping to raise one in.
   *
   * The roll is per day of simulated time and scales with how busy the water
   * is, so the Gulf of Cádiz produces one every few days and the water below
   * the frontier produces none at all — which is the fact the whole voyage is
   * about and which nothing in the game said out loud before.
   */
  private checkForSails(days: number): void {
    this.daysSinceSail += days;
    if (this.encounter || this.pendingEvent || this.dockedAt || this.anchored) return;
    if (this.daysSinceSail < 3) return;
    const busy = trafficAt(this.ship.state.pos);
    if (busy < 0.04) return;
    // Nobody sights anything in a fog.
    const vis = this.weatherNow.visibility;
    if (vis < 4) return;
    // Sub-linear in the traffic, because what is being modelled is not how many
    // ships are out there but how often one comes over your particular horizon,
    // and the second is a much flatter function of the first. Measured: about
    // one a week in the Gulf of Cádiz, one a fortnight off the Canaries, one in
    // five weeks on the Guinea run, and none at all in blue water.
    const chance = clamp(Math.sqrt(busy) * 0.09 * days, 0, 0.4);
    if (!this.rng.chance(chance)) return;

    const range = clamp(sightingRangeNm(this.ship.mastHeight, vis, 28), 5, 22);
    const s = raiseASail(this, range * this.rng.range(0.75, 1));
    if (!s) return;
    this.encounter = s;
    this.chaseOrder = 'hold';
    this.seaRecord.sighted++;
    this.daysSinceSail = 0;
    this.easeTheClock(3);
    this.pushAlert('Sail ho! — a strange sail, and nobody aboard knows whose.', 'warning');
    this.logEvent('note',
      `A sail raised from the masthead, ${range.toFixed(0)} miles off. She is the first thing `
      + `anybody aboard has seen that was not water in ${this.crew.daysSinceLandfall.toFixed(0)} days.`,
      true);
  }

  /** The race south with the other captain, while it is being run. */
  rivalRace: { targetLat: number; until: number } | null = null;

  /** His ship, raised on the bow and standing the same way. */
  putRivalOnTheSea(): void {
    const pos = this.ship.state.pos;
    const bearing = wrap360(this.ship.state.heading + (this.rng.chance(0.5) ? 25 : -25));
    let at = rhumbStep(pos, bearing, 9 * NM);
    if (isLand(at)) at = rhumbStep(pos, wrap360(this.ship.state.heading + 180), 6 * NM);
    this.encounter = {
      hullId: 'caravela-redonda',
      nation: 'portuguese',
      business: 'trader',
      name: this.rival.ship.replace(/^the /, ''),
      master: this.rival.name,
      pos: at,
      heading: this.ship.state.heading,
      speedKnots: 0,
      intent: 'hold',
      read: 1,
      guns: 4,
      hands: 40,
      sightedT: this.clock.t,
      // The meeting is the card that raised him. He is not hailed twice.
      spoken: true,
      awareT: this.clock.t,
      rival: true,
    };
    this.chaseOrder = 'hold';
    this.seaRecord.sighted++;
  }

  /** Start the race. Returns the latitude it is to, in words. */
  startRivalRace(): string {
    const targetLat = this.ship.state.pos.lat - 1.5;
    this.rivalRace = { targetLat, until: this.clock.t + 6 * 86400 };
    if (this.encounter?.rival) this.encounter.course = 180;
    const deg = Math.abs(targetLat);
    return `${deg.toFixed(1)}\u00b0 ${targetLat >= 0 ? 'north' : 'south'}`;
  }

  /** Who is winning, and whether it is over. Called with the encounter. */
  private judgeRivalRace(): void {
    const race = this.rivalRace;
    if (!race) return;
    const him = this.encounter?.rival ? this.encounter : null;
    const me = this.ship.state.pos.lat;
    const heLat = him ? him.pos.lat : race.targetLat + 1;
    const mine = me <= race.targetLat;
    const his = heLat <= race.targetLat;
    const timeUp = this.clock.t > race.until || !!this.dockedAt;
    if (!mine && !his && !timeUp) return;
    const won = mine && !his ? true : his && !mine ? false : me < heLat;
    this.rivalRace = null;
    if (him) him.course = undefined;
    if (won) {
      this.rival.frontierLat = Math.max(this.rival.frontierLat, race.targetLat + 1.2);
      this.rival.standing = Math.max(0, this.rival.standing - 5);
      this.crown.standing += 5;
      this.crown.lifetimeStanding += 5;
      this.crew.morale = clamp(this.crew.morale + 0.08, 0, 1);
      this.pushAlert(`You beat ${this.rival.name} south. The coast ahead is yours to name.`, 'note');
      this.logEvent('discovery', `Raced ${this.rival.name} south and was first by a clear `
        + 'distance. He hauled his wind and stood away to the westward before dark, which is as '
        + 'near as he will come to saying so.', true);
    } else {
      this.rival.frontierLat = Math.min(this.rival.frontierLat, race.targetLat - 0.8);
      this.rival.standing += 5;
      this.crew.morale = clamp(this.crew.morale - 0.05, 0, 1);
      this.pushAlert(`${this.rival.name} is ahead of you, and pulling away.`, 'warning');
      this.logEvent('note', `Lost the race south to ${this.rival.name}. ${this.rival.ship} was `
        + 'hull down ahead by the second morning, and whatever is on the next stretch of coast '
        + 'will have his name on it.', true);
    }
  }

  /** She is not there any more: the ship has come to an anchor or gone in. */
  private partCompany(): void {
    this.encounter = null;
    this.chaseOrder = 'hold';
  }

  /** Sail her, and see what the two of you have made of each other. */
  // -------------------------------------------------------------------------
  // The first voyage
  // -------------------------------------------------------------------------

  /** Where the pilot has got to. See game/tutorial.ts. */
  tutorial: TutorialState = newTutorial();

  /** True once the captain has opened the chart, which one step waits on. */
  seenChart = false;

  /** The instruction standing at the moment, or null once he has stopped. */
  tutorialStep(): TutorialStep | null {
    return stepTutorial(this);
  }

  /** Put the pilot away. Not for good — see `recallTutorial`. */
  dismissTutorial(): void {
    this.tutorial.on = false;
    this.logEvent('note',
      'Told the pilot you would find your own way. He said nothing, which is how he says '
      + 'most things.');
  }

  /**
   * Ask him again.
   *
   * Dismissing him used to set `finished`, which made it irreversible — a
   * player who shut the panel to see the sea and then wanted the next
   * instruction had thrown away the rest of the first voyage's guidance with
   * no way back. `finished` now means only that the commission was discharged,
   * which is the one ending that should be permanent.
   */
  recallTutorial(): void {
    if (this.tutorial.finished) return;
    this.tutorial.on = true;
    this.logEvent('note', 'Asked the pilot what he would do. He had been waiting to be asked.');
  }

  /** Whether there is anything left for him to say. */
  get pilotAvailable(): boolean {
    return !this.tutorial.finished;
  }

  private updateEncounter(simDt: number): void {
    this.judgeRivalRace();
    const s = this.encounter;
    if (!s) return;
    // A sail in sight is the one thing in this game that must not be sailed in
    // one step. At the fastest rates a frame is half an hour, in which two
    // converging ships cover three miles — so the hail range is stepped clean
    // over and the two of them pass through each other without a word. Two
    // minutes a step is a cable and a half, which nothing can hide in.
    let remaining = simDt;
    let range = haversine(this.ship.state.pos, s.pos) / NM;
    while (remaining > 0) {
      const step = Math.min(120, remaining);
      sailStranger(this, s, step);
      remaining -= step;
      range = haversine(this.ship.state.pos, s.pos) / NM;
      if (range < 0.55) break;
    }
    strangerThinks(this, s, range);
    s.read = Math.max(s.read, readOf(range));

    // Hull down and going away. Three hours of watching a topsail get smaller
    // is the commonest outcome of a sighting and it should be allowed to be.
    const gone = sightingRangeNm(this.ship.mastHeight, this.weatherNow.visibility, 28) + 3;
    // During a race he is followed past the horizon: losing sight of him is
    // not the same as him stopping.
    if (range > gone && !(s.rival && this.rivalRace)) {
      this.pushAlert(s.spoken
        ? `${s.name} is hull down to the ${compassPoint(bearingTo(this.ship.state.pos, s.pos))}.`
        : 'She is gone. Nobody aboard will ever know whose she was.', 'note');
      this.logEvent('note', s.spoken
        ? `Parted company with ${s.name}. She is hull down and going her own way.`
        : 'The strange sail is below the horizon and has not been spoken. Whose she was, and '
          + 'what she was doing out here, are two questions this ship will not be answering.');
      this.partCompany();
      return;
    }

    // Within hail. Both ships have to be willing, or one of them simply is not
    // there when the other arrives: a ship running from you that you cannot
    // catch is not spoken, however close you get.
    if (range < 0.55 && !s.spoken && !this.pendingEvent) {
      s.spoken = true;
      this.seaRecord.spoken++;
      this.chaseOrder = 'hold';
      this.easeTheClock(1);
      this.pendingEvent = hailScene(this, s);
    }
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

  /**
   * The fewest able men who can work her at all. Below this at sea she is lost
   * — see updateCrewAndShip — so it is also the line nobody may weigh under.
   */
  hullWorkingMinimum(): number {
    return Math.max(4, Math.round(this.ship.baseHull.crewMin * 0.28));
  }

  /**
   * Why she cannot put to sea, or null.
   *
   * A Nau da Índia wants seventy men and a caravel carries twenty-four. Shifting
   * the flag keeps the company you had, and weighing with them used to be
   * allowed — and four ticks later the game ended, because nineteen men cannot
   * work a four-hundred-ton ship and the check that says so runs at sea. The
   * same arithmetic, asked on the quay, is a refusal with a reason instead of a
   * loss with none. A small margin over the line itself, so the first man to
   * go down with a fever does not end the voyage.
   */
  cannotWeigh(): string | null {
    const able = ableHands(this.crew);
    const need = Math.max(this.hullWorkingMinimum() + 3, Math.ceil(this.ship.baseHull.crewMin * 0.5));
    if (able >= need) return null;
    return `She cannot be worked with ${able} able men — the ${this.ship.baseHull.name} wants `
      + `${this.ship.baseHull.crewMin} to sail her properly and will not put to sea with fewer than `
      + `${need}. Ship more hands before you weigh.`;
  }

  weighAnchor(): string {
    const refused = this.cannotWeigh();
    if (refused) return refused;
    // Out of the Tagus is a new voyage, and a new page in the books.
    if (this.dockedAt === 'lisboa') this.closeVoyageBook();
    // Give the charters back the days she lay alongside. Done here, once, on
    // the elapsed time rather than accumulated per tick: rollIncidents can skip
    // a tick on its cooldown, and a deadline that drifts by however many ticks
    // happened to be swallowed is worse than one that does not move at all.
    if (this.dockedAt) {
      const held = Math.max(0, this.clock.t - this.dockedSinceT);
      if (held > 0) {
        let given = 0;
        for (const v of this.ventures) {
          if (v.delivered || v.failed) continue;
          v.dueBy += held;
          given++;
        }
        if (given > 0 && held > 0.5 * 86400) {
          this.logEvent('trade',
            `${(held / 86400).toFixed(0)} days alongside, which the freighters do not count `
            + 'against the passage. Their dates move with her.');
        }
      }
    }
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

  // -------------------------------------------------------------------------
  // The stations
  // -------------------------------------------------------------------------

  /** The factory in the port she is lying in, if there is one. */
  get factoryHere(): Feitoria | null {
    if (!this.dockedAt) return null;
    return this.feitorias.find((f) => f.portId === this.dockedAt && !f.lost) ?? null;
  }

  get liveFactories(): Feitoria[] {
    return this.feitorias.filter((f) => !f.lost);
  }

  /**
   * Whether a station can be founded here at all, and why not.
   *
   * Three gates, and each of them is a different part of the game: the King's
   * leave to do it anywhere (the perk), this town's leave to do it here (the
   * audience), and a man and men you can actually spare. The third is the real
   * one — nobody ever runs out of the first two twice.
   */
  canFoundFactory(def: PortDef): string | null {
    if (!this.can('feitoria')) {
      return 'Nothing in your commission lets you leave the King\u2019s men on a foreign shore. '
        + 'That is the Ambassador\u2019s article, and it is bought in the book.';
    }
    const rel = this.relationsFor(def.id);
    if (!rel.factory) {
      return 'You have no ground here. Ground for a factory is asked for at an audience and '
        + 'granted or not by whoever owns this beach.';
    }
    if (this.feitorias.some((f) => f.portId === def.id && !f.lost)) return 'There is one here already.';
    const men = this.crew.count - this.ship.baseHull.crewMin;
    if (men < 6) {
      return `A station wants six men left in it and she cannot sail without ${this.ship.baseHull.crewMin}. `
        + `You have ${Math.max(0, men)} to spare.`;
    }
    if (this.foundingCost() > this.crown.gold + this.creditFree) {
      return `The founding of it comes to ${this.foundingCost()} cruzados and there is not that much.`;
    }
    return null;
  }

  /** Timber, tools, trade goods to start the chest, and a year's victuals for the men. */
  foundingCost(): number {
    return 320;
  }

  /**
   * Leave a man on a beach.
   *
   * The officer is the whole decision. He comes off the muster and out of the
   * berth for years — the ship works worse for it, immediately and visibly —
   * and what he was decides everything the station does afterwards. An able
   * man fills the shed. An honest one hands you the books. They are separate
   * qualities and no officer in the game has both at once by accident.
   */
  foundFactory(officerId: string, order: string[]): string {
    const def = this.portHere;
    if (!def) return 'This is done ashore.';
    const why = this.canFoundFactory(def);
    if (why) return why;
    const o = this.crew.officers.find((x) => x.id === officerId && x.alive && !x.ashoreAt);
    if (!o) return 'That man is not aboard.';

    const cost = this.foundingCost();
    if (this.crown.gold < cost) this.drawCredit(cost);
    this.crown.gold -= cost;
    this.landHands(6, def.name);
    o.ashoreAt = def.id;
    o.ashoreSince = this.clock.t;

    // Ability is what he is; honesty is his character, and the traits that make
    // a good officer at sea are not the ones that make a safe man with a chest.
    const trait = o.trait ?? '';
    const honest = clamp(0.5 + o.loyalty * 0.4
      + (trait === 'devout' || trait === 'steady' ? 0.16 : 0)
      + (trait === 'grasping' || trait === 'sly' ? -0.3 : 0), 0.1, 0.98);

    const f: Feitoria = {
      portId: def.id,
      factor: o.name,
      officerId: o.id,
      ability: clamp(o.ability * 0.85 + skill(this.skills, 'comercio') * 0.15, 0.1, 1),
      honesty: honest,
      founded: this.clock.t,
      settled: this.clock.t,
      works: [],
      garrison: 6,
      stock: {},
      paid: {},
      chest: 90,
      buying: order.length > 0 ? order.slice(0, 3) : [],
      regard: clamp(this.relationsFor(def.id).regard * 0.8 + 0.1, 0, 1),
      trouble: 0.05,
      lost: false,
      landed: 0,
      paidOut: 0,
    };
    this.feitorias.push(f);
    this.relationsFor(def.id).factorySettled = this.clock.t;
    this.crown.standing += 12;
    this.refreshEnvironment();
    this.logEvent('crown',
      `Founded a feitoria at ${def.name}. ${o.name} is left in it with six men, ninety cruzados `
      + 'in the chest and the King\u2019s commission, and he will be here when you come back or he '
      + 'will not. The berth aft is empty from today.', true);
    return `${o.name} has the shed and six men. She is that much shorter-handed and you have a `
      + 'station on this coast.';
  }

  /**
   * What the factor has done since you last stood in his store.
   *
   * Run in one pass at the quay rather than tick by tick: nothing about a
   * station is worth a frame of the simulation while the ship is four thousand
   * miles away, and a factor's year is exactly the kind of thing that ought to
   * arrive as a set of books read out to you.
   */
  private settleFeitoria(def: PortDef): void {
    const f = this.feitorias.find((x) => x.portId === def.id && !x.lost);
    if (!f) return;
    const days = (this.clock.t - f.settled) / 86400;
    f.settled = this.clock.t;
    if (days < 8) return;
    const news = runFactory(f, def, days, this.rng, this.relationsFor(def.id).regard);
    // Standing in the road is itself the answer to half of it. A station that
    // sees a Portuguese ship is a station nobody is about to try.
    f.trouble = clamp(f.trouble - 0.3, 0, 1);
    this.logEvent('trade',
      `${f.factor} has the books ready at ${def.name}. ${Math.round(days)} days: `
      + `${news.bought.toFixed(1)} tons bought in for ${Math.round(news.spent)} cruzados, `
      + `${Math.round(news.earned)} taken in trade, ${stockTons(f).toFixed(1)} tons in the shed `
      + `and ${Math.round(f.chest)} in the chest.`
      + (news.spoiled > 0.05 ? ` ${news.spoiled.toFixed(1)} tons went bad waiting for a bottom.` : '')
      + (news.skimmed > 12 ? ' The figures do not quite meet in the middle and he knows you can see it.' : ''),
      true);
    this.pushAlert(`${def.name}: ${stockTons(f).toFixed(1)} tons in the shed.`, 'note');
  }

  /**
   * Take the shed's contents aboard.
   *
   * The reward for the whole system, and it is a reward in *time* rather than
   * in money: a cargo that takes a ship three weeks to buy and guts the quay
   * while she does it is already sitting on the floor, bought all year in small
   * parcels at what a resident pays. The factor takes his commission on it,
   * which is why it is not simply free.
   */
  loadFromShed(goodId: string, units: number): string {
    const f = this.factoryHere;
    if (!f) return 'There is no factory of yours here.';
    const have = f.stock[goodId] ?? 0;
    const g = good(goodId);
    const take = Math.min(have, Math.max(0, units), this.ship.holdFree / Math.max(g.bulk, 1e-6));
    if (take < 1) {
      return have < 1 ? 'There is none of that in the shed.' : 'There is no room in her for it.';
    }
    // His commission, which is how a factor was actually paid.
    const per = (f.paid[goodId] ?? g.lisbon * 0.2) * 1.08;
    const cost = Math.round(per * take);
    const fromChest = Math.min(f.chest, 0);
    void fromChest;
    if (cost > this.crown.gold + this.creditFree) {
      return `His commission on that comes to ${cost} and there is not that much in the purse.`;
    }
    if (this.crown.gold < cost) this.drawCredit(cost);
    this.crown.gold -= cost;
    f.chest += cost;
    f.stock[goodId] = have - take;
    f.landed += take * g.lisbon;
    this.ship.addCargo(goodId, take, per);
    this.crown.syncCargoObjectives((id) => this.ship.quantityOf(id));
    this.logEvent('trade',
      `Took ${take.toFixed(0)} ${g.unit} of ${g.name.toLowerCase()} out of the shed at `
      + `${portName(f.portId)} at ${per.toFixed(1)} the ${g.unit}, against ${g.lisbon} at Lisbon. `
      + 'A year of somebody else\u2019s patience, carried aboard in an afternoon.');
    return `${take.toFixed(0)} ${unitOf(g, take)} aboard at ${per.toFixed(1)} — `
      + `${cost} cruzados to the factor.`;
  }

  /** Put coin in the chest, which is the only thing that lets him buy. */
  fundChest(amount: number): string {
    const f = this.factoryHere;
    if (!f) return 'There is no factory of yours here.';
    const sum = Math.round(clamp(amount, 1, this.crown.gold + this.creditFree));
    if (sum < 1) return 'There is nothing to put in it.';
    if (this.crown.gold < sum) this.drawCredit(sum);
    this.crown.gold -= sum;
    f.chest += sum;
    return `${sum} cruzados into the chest. He can only buy with what is in it.`;
  }

  /** Take the takings. */
  drawChest(): string {
    const f = this.factoryHere;
    if (!f) return 'There is no factory of yours here.';
    const sum = Math.floor(f.chest);
    if (sum < 1) return 'The chest is empty, which he will explain at length.';
    // Leave him something to work with unless you empty it on purpose: a factor
    // with nothing to buy with is a man sitting in a shed for a year.
    f.chest = 0;
    f.paidOut += sum;
    this.crown.gold += sum;
    const shared = this.takeShares(sum);
    this.logEvent('trade',
      `Drew ${sum} cruzados out of the chest at ${portName(f.portId)}.`
      + (shared > 0.5 ? ` ${Math.round(shared)} of it went to the men holding sixteenths.` : '')
      + ' He has nothing to buy with until something is put back.');
    return `${sum} cruzados. He now has nothing to trade with.`;
  }

  /** What he is to buy while you are away. */
  setStandingOrder(goodIds: string[]): string {
    const f = this.factoryHere;
    if (!f) return 'There is no factory of yours here.';
    f.buying = goodIds.slice(0, 3);
    return f.buying.length === 0
      ? 'He is to buy whatever the place offers, which is safe and never brilliant.'
      : `Orders given: ${f.buying.map((id) => good(id).name.toLowerCase()).join(', ')}.`;
  }

  /** Build something. */
  buildWork(id: WorkId): string {
    const f = this.factoryHere;
    if (!f) return 'There is no factory of yours here.';
    const w = WORK_BY_ID.get(id);
    if (!w) return 'No such work.';
    if (f.works.includes(id)) return 'That is built already.';
    if (this.crown.gold + this.creditFree < w.cost) {
      return `The ${w.english.toLowerCase()} comes to ${w.cost} and there is not that much.`;
    }
    const spare = this.crew.count - this.ship.baseHull.crewMin;
    if (w.hands > spare) {
      return `It wants ${w.hands} more men left here and she cannot spare them.`;
    }
    if (this.crown.gold < w.cost) this.drawCredit(w.cost);
    this.crown.gold -= w.cost;
    if (w.hands > 0) { this.landHands(w.hands, portName(f.portId)); f.garrison += w.hands; }
    f.works.push(id);
    f.trouble = clamp(f.trouble - 0.12, 0, 1);
    this.refreshEnvironment();
    this.logEvent('crown',
      `Built the ${w.name.toLowerCase()} at ${portName(f.portId)} for ${w.cost} cruzados. ${w.blurb}`,
      true);
    return `${w.name} built.` + (w.hands > 0 ? ` ${w.hands} more men left here.` : '');
  }

  /** Put more men in it. */
  reinforceFactory(n: number): string {
    const f = this.factoryHere;
    if (!f) return 'There is no factory of yours here.';
    const spare = this.crew.count - this.ship.baseHull.crewMin;
    const men = Math.min(Math.max(0, Math.round(n)), spare);
    if (men < 1) return 'She has no men to spare and still be able to sail.';
    this.landHands(men, portName(f.portId));
    f.garrison += men;
    f.trouble = clamp(f.trouble - men * 0.02, 0, 1);
    this.refreshEnvironment();
    return `${men} left ashore. ${f.garrison} in the station now, and she is that much shorter.`;
  }

  /** Bring everybody and everything away, and give the position up. */
  closeFactory(f: Feitoria, why: string): string {
    let carried = 0;
    for (const [id, q] of Object.entries(f.stock)) {
      const g = GOOD_BY_ID.get(id);
      if (!g || q < 1) continue;
      const room = this.ship.holdFree / Math.max(g.bulk, 1e-6);
      const take = Math.min(q, room);
      if (take < 1) continue;
      this.ship.addCargo(id, take, f.paid[id] ?? g.lisbon * 0.2);
      carried += take * g.bulk;
    }
    this.crown.gold += Math.floor(f.chest);
    this.recoverHands(f.garrison, portName(f.portId));
    f.garrison = 0;
    f.stock = {};
    f.chest = 0;
    f.lost = true;
    f.lostWhy = why;
    if (f.officerId) {
      const o = this.crew.officers.find((x) => x.id === f.officerId);
      if (o) { o.ashoreAt = undefined; o.ashoreSince = undefined; }
    }
    this.relationsFor(f.portId).factory = false;
    this.crown.syncCargoObjectives((id) => this.ship.quantityOf(id));
    this.refreshEnvironment();
    this.logEvent('crown',
      `The station at ${portName(f.portId)} is given up. ${why} `
      + (carried > 0.05 ? `${carried.toFixed(1)} tons came aboard with the men.` : 'Nothing came aboard.'),
      true);
    return `${portName(f.portId)} is shut. The men are aboard and the ground is somebody else\u2019s again.`;
  }

  /**
   * The factor stops being the factor.
   *
   * Every branch of the scenes where he is hanged, carried home in irons, dies
   * of the fever or simply stops being yours has to put the officer somewhere:
   * back on the muster, or dead, or written out of the wardroom for good.
   * Leaving him with `ashoreAt` still set and the station pretending he was
   * never there produced a man who was in two places and available in neither.
   */
  factorLeaves(f: Feitoria, how: 'aboard' | 'dead' | 'stays'): void {
    const o = f.officerId ? this.crew.officers.find((x) => x.id === f.officerId) : null;
    f.officerId = null;
    if (!o) return;
    if (how === 'aboard') {
      o.ashoreAt = undefined;
      o.ashoreSince = undefined;
      this.refreshEnvironment();
      return;
    }
    if (how === 'dead') {
      o.alive = false;
      o.ashoreAt = undefined;
      this.refreshEnvironment();
      return;
    }
    // He stays where he is and stops being a berth you could ever fill again.
    o.ashoreAt = f.portId;
  }

  /**
   * Everybody in the station is gone.
   *
   * The men left there are named men on the muster with `aboard` false and a
   * fate that says where they went, so a sacked factory has to go back through
   * the fo'c'sle and mark them, or the last page of the career reports them as
   * having merely been put ashore somewhere.
   */
  loseGarrison(f: Feitoria): void {
    const where = portName(f.portId);
    let gone = 0;
    for (const h of this.hands) {
      if (!h.alive || h.aboard) continue;
      if (!h.fate?.includes(where)) continue;
      h.alive = false;
      h.fate = `Killed when the factory at ${where} was burned.`;
      h.fateT = this.clock.t;
      gone++;
    }
    this.crew.deaths += Math.max(f.garrison, gone);
    f.garrison = 0;
    this.factorLeaves(f, 'dead');
  }

  /** The garrison the works ask for, for the screen. */
  garrisonWantedAt(f: Feitoria): number {
    return garrisonWanted(f.works);
  }

  /** Room left in the shed, in tons. */
  shedRoom(f: Feitoria): number {
    return Math.max(0, capacityOf(f) - stockTons(f));
  }

  /**
   * What being feared costs, and the only place it is charged.
   *
   * A crew who work through anything at sea have exactly one way to answer for
   * it, and they take it the moment there is a quay under their feet. So the
   * feared captain sails harder and arrives short-handed, and has to buy men in
   * every port — which is money, and which is the balance against a company
   * that never mutinies.
   */
  private runFromTheQuay(def: PortDef): void {
    if (!this.can('feared') || this.crew.count <= this.ship.baseHull.crewMin * 0.5) return;
    const hardship = clamp(0.35 + this.crew.fatigue * 0.5 - this.crew.morale * 0.3, 0.1, 0.9);
    const gone = Math.round(this.crew.count * 0.06 * hardship + (this.rng.chance(hardship) ? 2 : 0));
    if (gone <= 0) return;
    this.crew.count -= gone;
    this.logEvent('crew',
      `${gone} men did not come back to the boat at ${def.name}. Nobody aboard is surprised and `
      + 'nobody will say where they went. You are that much short for the run home.', true);
    this.pushAlert(`${gone} hands run at ${def.name}.`, 'warning');
  }

  enterPort(def: PortDef): void {
    this.dockedAt = def.id;
    this.dockedSinceT = this.clock.t;
    this.anchored = true;
    this.daysSincePort = 0;
    this.lastLandSeenT = this.clock.t;
    this.landInSight = true;
    this.recentEvents = [];
    // Whatever was on the horizon is somebody else's business now.
    this.partCompany();
    // And whoever walked away from this beach two years ago may be standing on
    // it. See progression/inland.
    this.checkInland(def);
    this.visitPolity(def);
    this.markets.refresh(def.id, this.clock.t);
    this.visitMarket(def);
    this.refreshPortBusiness(def);
    this.deliverVentures(def);
    this.reclaimBrokenCharters();
    this.settleFeitoria(def);
    this.runFromTheQuay(def);

    const first = !this.visitedPorts.has(def.id);
    this.visitedPorts.add(def.id);
    // The town tells the pilot where he is. That is the best fix there is:
    // the reckoning is put right, and the error it had been carrying is shared
    // back over the coast drawn since the last fix (see Chart.amend). Then the
    // town goes on the chart where it is, and the coast in sight of it is put
    // right and the stretch around bent to meet it (Chart.settleAround).
    this.nav.applyLandfall(anchorageOf(def), this.clock.t);
    this.chart.chartPort(def, this.nav.estimated, this.ship.state.pos, this.clock.t, true);
    this.chart.settleAround(anchorageOf(def), this.clock.t);

    this.crown.progressObjective('reach', def.id);

    // Letters and money from home, at any Portuguese port; new voyages wanting
    // backers at Lisbon.
    if (def.people === 'portuguese') this.settleEstate();
    if (def.id === 'lisboa') offerOutfits(this.estate, this.chronicle.act, this.rng, this.clock.t);

    // News of land other men have found, and whatever the quay is saying.
    for (const isle of historyCatchesUp(this)) {
      this.logEvent('discovery', `News on the quay: ${isle.by} has found an island and called it `
        + `${isle.suggested}. The Casa has it on the sheet now.`, true);
    }
    if (hearOfIsland(this, def.id)) this.pushAlert('A tale on the quay of land to seaward. It is on the chart with a query.', 'note');

    // Pillars are the King's business and the Casa ships them: every sailing
    // from the Tagus carries three, and nobody has to remember to ask.
    if (def.id === 'lisboa') this.crown.padraoStock = Math.max(this.crown.padraoStock, 3);
    // A word overheard on the Lisbon waterfront, once the Crown has made a
    // name of you: the only door into the Biscayan's Ship.
    if (def.id === 'lisboa' && this.chronicle.act >= 3 && this.crown.lifetimeStanding >= 150
      && !this.secretsHeard.includes('galeao')) {
      this.secretsHeard.push('galeao');
      this.logEvent('note', 'A Canary Islands pilot in a waterfront tavern, telling anyone who will '
        + 'listen that the Castilians have a Biscayan building them "a ship like nothing afloat" at '
        + 'Las Palmas, and that the man has not been paid. Nobody listening seems to think it matters.', true);
    }
    if (def.id === 'lisboa' && this.launchReady) {
      this.pushAlert(`The ${hullClass(this.building!.hullId).name} is finished and lying at the Ribeira. Shift your flag from the shipwrights.`, 'note');
    }

    this.writeUpPort(def, first);

    // What this place does to a ship that anchors in it.
    const ch = characterOf(def.id);
    if (ch) {
      const said = ch.arrive?.(this, first) ?? null;
      if (said) {
        this.logEvent('landfall', said, true);
        this.pushAlert(said.split('. ')[0] + '.', 'note');
      }
      if (first && ch.custom) this.pushAlert(`${def.name}: ${ch.signature}.`, 'note');
    }

    if (first && def.discovery > 0) {
      const pe = people(def.people);
      this.announceDiscovery('named', 'First entered on a Portuguese chart',
        def.name, `${pe.name}${def.modern ? ` \u00b7 ${def.modern}` : ''}`,
        `By the ${this.ship.name}, ${this.clock.formatDate()} \u00b7 ${def.discovery} renown at court`);
    }
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
    // Whoever is owed money in this town finds out she is here before the
    // anchor is down. Queued as a scene so it is put to the captain before the
    // port screen opens rather than after he has spent the purse.
    const word = rollFinanceScene(this) ?? rollFeitoriaScene(this);
    if (word) {
      // Straight into the slot rather than onto the queue: the queue is drained
      // by rollIncidents, which needs the clock to be running, and the clock is
      // stopped the moment she is moored.
      if (this.pendingEvent) this.pendingScenes.push(word);
      else this.pendingEvent = word;
    }
    this.mode = 'port';
    this.checkStory();
    if (this.questOffersHere().length > 0) {
      this.pushAlert('Somebody here wants a word with the captain — see the Town.', 'note');
    }
  }

  /** Take on water, provisions and fresh food. Returns the cost. */
  provision(days: number, cost: number): void {
    const p = this.crew.provisions;
    // The extra casks raise what she can stow, they do not refill themselves.
    //
    // This added the upgrade's forty-five days on top of *every* purchase
    // rather than to her capacity, so thirty days of water bought six times at
    // the same quay came to three hundred days. Water is the hard limit on
    // every passage in this game — it is the reason the volta do mar is a
    // gamble and the reason a captain turns for home — and a hundred and twenty
    // cruzados of casks turned it off altogether.
    p.water = Math.max(p.water, days + this.ship.effects.water);
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
    this.waitDaysInner(days);
    // Time spent in port passes at home too, and in a Portuguese port the
    // letters are waiting on the quay.
    this.tickEstate();
    if (this.dockedAt && portDef(this.dockedAt).people === 'portuguese') this.settleEstate();
  }

  private waitDaysInner(days: number): void {
    const step = 0.25;
    for (let d = 0; d < days; d += step) {
      this.clock.t += step * 86400;
      this.accumDays += step;
      this.refreshEnvironment();
      this.updateCrewAndShip(step * 86400);
      // In a harbour she is kept pumped.
      //
      // At sea the pumps are a watch's worth of tired men against the sea
      // coming aboard, and the balance between the leak and the pumping is one
      // of the real tensions of a long passage. Alongside it is not a tension
      // at all: there is time, there is shore labour, and there is nothing else
      // for the hands to do. Without this a ship left lying for a season
      // filled and foundered at her own anchor with a full crew aboard, which
      // is what waiting out a monsoon did to her.
      if (this.dockedAt) {
        this.ship.condition.bilge = Math.max(0, this.ship.condition.bilge - step * 2.5);
      }
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
    this.alerts.push({
      id: this.nextAlertId++, text, severity, t: this.clock.t, said: nowMs(),
    });
    if (this.alerts.length > 5) this.alerts.shift();
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
    // Fourteen seconds is about as long as a line of text is worth leaving on a
    // screen somebody is trying to see the sea through. The grave ones get
    // twice that, because they are the ones he may want to read twice.
    const now = nowMs();
    this.alerts = this.alerts.filter(
      (a) => now - a.said < (a.severity === 'grave' ? 30000 : 14000),
    );
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

  /** Set when the camera should turn to look at something; see main. */
  lookCue: { bearing: number; id: number } | null = null;
  /**
   * The moment a discovery is announced on screen: a town raised on a coast
   * nobody has charted, and the day it is entered under its own name. Read by
   * the interface, which puts it up across the sea and rings for it.
   */
  discoveryCue: {
    id: number; kind: 'sighted' | 'named' | 'act';
    eyebrow: string; title: string; sub: string; line: string;
  } | null = null;
  private discoveryCueId = 0;

  /** Put a great moment up across the screen. */
  announce(kind: 'sighted' | 'named' | 'act', eyebrow: string, title: string, sub: string, line: string): void {
    this.announceDiscovery(kind, eyebrow, title, sub, line);
  }

  private announceDiscovery(kind: 'sighted' | 'named' | 'act', eyebrow: string, title: string, sub: string, line: string): void {
    this.discoveryCue = { id: ++this.discoveryCueId, kind, eyebrow, title, sub, line };
  }
  private lookCueId = 0;
  /** When coast nobody had drawn last came up over the horizon. */
  private lastNewCoastT = -1e9;

  /**
   * Land nobody has put on a chart, coming up over the horizon.
   *
   * The whole game is named after this and it used to arrive as a line in the
   * corner of the screen. It is the moment now: the view turns to it, the
   * lookout's cry goes up, the chart starts drawing it in fresh ink, and the
   * captain has a choice to make about it with the wardroom's opinions in his
   * ear — run it close and draw it properly, or keep the offing and draw it
   * from a distance. Once per new stretch: a coast run for a week is one
   * discovery, not seven hundred.
   */
  private raiseNewCoast(fresh: { lat: number; lon: number }[], at: LatLon): void {
    // An island that has its own scene is announced there, not twice.
    const isleLands = new Set(ISLES.filter((i) => {
      const f = this.isles.found[i.id];
      return !f || this.clock.t - f.t < 86400;
    }).map(landIndexOf));
    if (fresh.some((v) => isleLands.has((v as { land?: number }).land ?? -1))) {
      this.lastNewCoastT = this.clock.t;
      return;
    }
    const quiet = this.clock.t - this.lastNewCoastT;
    this.lastNewCoastT = this.clock.t;
    if (quiet < 18 * 3600 || this.dockedAt || this.pendingEvent) return;
    // Nearest of it, which is what the masthead is pointing at.
    let best = fresh[0];
    let bestD = Infinity;
    for (const v of fresh) {
      const d = haversine(at, v);
      if (d < bestD) { bestD = d; best = v; }
    }
    const bearing = bearingTo(at, best);
    const distNm = bestD / NM;
    this.lookCue = { bearing, id: ++this.lookCueId };
    this.pushAlert(`Land! ${compassPoint(bearing)}, and nobody has drawn it.`, 'grave');
    const deg = Math.abs(this.nav.estimated.lat).toFixed(0);
    const hemi = this.nav.estimated.lat >= 0 ? 'north' : 'south';
    this.pendingScenes.push({
      id: 'newcoast',
      title: 'Land nobody has charted',
      severity: 'warning',
      text: `"Terra!" from the masthead, and then a long silence while the man up there makes `
        + `sure. Land on the ${compassPoint(bearing).toLowerCase()} bow, ${distNm.toFixed(0)} `
        + `miles off by the look of it, and there is nothing on the chart for it at all. The `
        + `Casa\u2019s sheet ends a long way north of here.\n\n`
        + `Every man who can get a foot on the rail is at it. The escrivão has the sheet out and `
        + `a pen cut. Somewhere about ${deg}° ${hemi}, by the reckoning, which is the only thing `
        + 'anybody aboard is sure of.',
      choices: [
        {
          label: 'Stand in and run it close',
          detail: 'Close enough to see the rivers and the surf, which is how a coast is drawn '
            + 'properly. Close enough for the ground to come up, too.',
          resolve: (g: Game) => {
            g.helmOrder = bearing;
            return 'Put her head in toward it with the lead going and a man in each top. By the '
              + 'change of the watch there were trees on it, and a line of surf, and the escrivão '
              + 'had not looked up from the sheet in an hour.';
          },
        },
        {
          label: 'Keep your offing',
          detail: 'Draw what can be seen from here and keep sea room. Less of it goes down, '
            + 'and none of it is ground under her.',
          resolve: () => 'Kept her head where it was and let the land lie along the horizon. The '
            + 'escrivão drew what he could make out and wrote "seen from the offing" against all '
            + 'of it, which is a pilot\u2019s way of saying he would not stake a ship on it.',
        },
      ],
    });
  }

  /**
   * What the wardroom says about the decision in front of the captain.
   *
   * Asked once per scene and remembered, so the men do not change their minds
   * every frame the card is on the screen.
   */
  counselOn(e: SeaEvent): Counsel[] {
    let c = this.counselCache.get(e);
    if (!c) {
      c = counselFor(this, e, this.clock.t);
      this.counselCache.set(e, c);
    }
    return c;
  }
  private counselCache = new WeakMap<SeaEvent, Counsel[]>();

  /**
   * The ship is lost; the captain is not.
   *
   * Losing her used to end the game, which on this route was never how it went
   * — Dias lost ships, Cabral lost more than half his fleet, and every one of
   * the men who survived went out again. So a loss is now the end of a voyage,
   * not of a career. What stays is everything that is the captain's rather than
   * the ship's: his skills and unspent points, his title and renown, the
   * commission he holds, the chart and the book, every people he has met, his
   * stations ashore, his debts and his purse. What went down is the hull, the
   * cargo, the stores and the men who did not come home.
   *
   * The survivors are carried home in whatever passes — the time that takes is
   * charged by the distance — and at Lisbon the Casa finds him a caravel, as it
   * did at the start. It is a setback measured in months and in the ship he had
   * built up, which is what a wreck should cost.
   */
  fitOutAfterLoss(): void {
    const lost = this.ship.name;
    const home = anchorageOf(portDef('lisboa'));
    const passageNm = haversine(this.ship.state.pos, home) / NM;
    const days = Math.round(clamp(14 + passageNm / 70, 14, 240));
    this.clock.t += days * 86400;

    // The hull, the hold and the stores.
    const name = lost.startsWith('Nova ') ? lost : `Nova ${lost}`;
    this.ship = new Ship(name, 'caravela-latina', home, 200);
    this.flagship = null;

    // The company. Named officers who came through it are still his; the men
    // are a fresh muster off the quay. Anybody left at a station ashore was
    // never aboard and is untouched.
    const officers = this.crew.officers.filter((o) => o.alive);
    const deaths = this.crew.deaths;
    this.crew = newCrew(hullClass('caravela-latina').crewFull, this.rng);
    this.crew.officers = officers;
    this.crew.deaths = deaths;
    this.wardroomCache = null;
    for (const h of this.hands) {
      if (h.alive && !h.aboard && !h.fate) h.aboard = true;
    }

    // The reckoning starts again from the quay; the instruments he had learned
    // to use are bought again with the ship's stores and are his as before.
    const kit = { ...this.nav.kit };
    const leeway = this.nav.leewayAllowance;
    const drift = this.nav.driftScale;
    this.nav = new Navigator(home, this.seed ^ Math.floor(this.clock.t));
    this.nav.kit = kit;
    this.nav.leewayAllowance = leeway;
    this.nav.driftScale = drift;
    this.nav.lastFixT = this.clock.t;
    this.wireNavigator();
    this.chart.leg = [];

    // Everything that was happening at sea stops happening.
    this.encounter = null;
    this.gale = newGale();
    this.pendingEvent = null;
    this.pendingScenes = [];
    this.route = [];
    this.helmOrder = null;
    this.latitudeOrder = null;
    this.orderedCanvas = 0;
    this.backing = false;
    this.shoreHere = null;
    this.shoreReport = null;
    for (const v of this.ventures) {
      if (!v.delivered && !v.failed) v.failed = true;
    }
    this.crown.syncCargoObjectives((id) => this.ship.quantityOf(id));

    // Home.
    this.dockedAt = 'lisboa';
    this.anchored = true;
    this.dockedSinceT = this.clock.t;
    this.daysSincePort = 0;
    this.lastLandSeenT = this.clock.t;
    this.landInSight = true;
    this.gameOverReason = null;
    this.mode = 'port';
    this.refreshEnvironment();
    this.markets.refresh('lisboa', this.clock.t);
    this.refreshPortBusiness(portDef('lisboa'));

    this.logEvent('crown',
      `The survivors of the ${lost} came home to the Tagus ${days} days after she was lost. `
      + `The Casa has found you the ${name}, a caravel, stored and watered and with a fresh `
      + 'company off the quay. Your commission, your chart and your book are as you left them.',
      true);
  }

  /** Never lose a ship: the one time in a career the sea is refused. */
  private reprieve(text: string): boolean {
    if (!this.can('neverLose') || this.captain.reprieved) return false;
    this.captain.reprieved = true;
    this.logEvent('peril', text, true);
    this.pushAlert('She should have been lost. She was not.', 'grave');
    return true;
  }

  endGame(reason: string): void {
    this.gameOverReason = reason;
    this.mode = 'gameover';
    this.logEvent('peril', reason, true);
    // The sea loans die with her, which is the entire reason anybody ever paid
    // sixty per cent for one. Worth saying out loud even at the end, because it
    // is the only moment in the game where the expensive instrument is the one
    // that was right.
    const { cancelled, standing } = this.finance.shipLost();
    if (cancelled > 0) {
      this.logEvent('trade',
        `${Math.round(cancelled)} cruzados of câmbio marítimo went down with her and will `
        + 'never be asked for. The houses that wrote it knew what they were selling.', true);
    }
    if (standing > 0) {
      this.logEvent('trade',
        `${Math.round(standing)} cruzados of letras are still owed by a man with no ship, and `
        + 'will be owed by his name after that.', true);
    }
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
      if (!charted) continue;
      this.setDestination(def.name, charted.lat, charted.lon, def.id);
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
    this.aimOffNm = 0;
    this.helmOrder = null;
    this.latitudeOrder = null;
    this.coastOrder = null;
    this.standingCourse = null;
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
    this.pushAlert(`${name} added to the passage \u2014 ${this.route.length} marks.`, 'note');
  }

  /** The errand this town has for you, if there is one still to do. */
  questHere(): NonNullable<ReturnType<typeof characterOf>>['quest'] | null {
    const def = this.portHere;
    const q = def ? characterOf(def.id)?.quest : undefined;
    if (!q || this.portQuestsDone.has(q.id)) return null;
    return q;
  }

  /** Hand over what the town asked for. Returns what happened, or why not. */
  doQuestHere(): string {
    const def = this.portHere;
    const q = this.questHere();
    if (!def || !q) return 'There is nothing asked here.';
    if (this.ship.quantityOf(q.good) < q.qty) return 'You do not have enough of it aboard.';
    this.ship.removeCargo(q.good, q.qty);
    this.portQuestsDone.add(q.id);
    this.crown.gold += q.gold;
    this.crown.standing += q.renown;
    this.crown.lifetimeStanding += q.renown;
    if (q.regard) this.shiftPeopleRegard(def.people, q.regard);
    if (q.reveals) {
      const r = portDef(q.reveals);
      // Told, not seen: on the chart where they say, which is near enough.
      if (r) this.chart.hearOfPort(r, 25, this.clock.t, this.seed);
    }
    this.logEvent('trade', q.done, true);
    return q.done;
  }

  /**
   * Put a mark in front of the one she is steering for, so she goes there
   * first and then carries on with the passage as laid.
   */
  insertWaypointAhead(name: string, lat: number, lon: number, portId?: string): void {
    if (this.route.length >= 12) this.route.pop();
    this.route.unshift({ name, lat, lon, portId });
    this.helmOrder = null;
    this.standingCourse = null;
    this.latitudeOrder = null;
    this.coastOrder = null;
    this.aimOffNm = 0;
    this.markLaidAt = { ...this.nav.estimated };
    this.markDistNm = haversine(this.nav.estimated, { lat, lon }) / NM;
    this.pushAlert(`Course laid for ${name}, then on as before.`, 'note');
  }

  /** Where the calm belt lies this month. */
  calmBeltLatitude(): number {
    return itczLatitude(this.clock.dayOfYear);
  }

  /** Strike one mark out of the passage, leaving the rest of it standing. */
  removeWaypoint(index: number): void {
    if (index < 0 || index >= this.route.length) return;
    const gone = this.route.splice(index, 1)[0];
    if (this.route.length === 0) {
      // Nothing laid off any more, so she stands on as she is rather than
      // falling off wherever the sea puts her.
      this.standingCourse = wrap360(this.ship.state.heading);
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
    this.standingCourse = wrap360(this.ship.state.heading);
    this.helmOrder = null;
    this.latitudeOrder = null;
    this.coastOrder = null;
    this.markLaidAt = null;
  }

  /**
   * Bearing, distance and time to the place she is steering for, all reckoned
   * from where the navigator believes she is rather than from where she is.
   */
  courseToDestination(): {
    name: string; bearing: number; distNm: number; hours: number; off: number;
  } | null {
    // Steered at the offing, not at the harbour: see aimOffNm.
    const mark = this.aimedMark;
    if (!mark) return null;
    // Once the town is in sight the helmsman steers by eye, not by the board:
    // the lookout can see where it actually is.
    const port = this.route[0]?.portId;
    const eye = port ? this.townInSight(port) : null;
    const d = eye ? { name: mark.name, lat: eye.lat, lon: eye.lon } : mark;
    const from = eye ? this.ship.state.pos : this.nav.estimated;
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
    // How close the *whole rig* will lie, not the best single mast on it.
    //
    // This used to take the minimum across the masts, so one lateen anywhere in
    // the ship decided the answer for her. Every hull in the game carries a
    // lateen mizzen — it is what a mizzen was for — so every hull got the
    // lateen's figure, and a four-hundred-ton Indiaman with three square
    // courses and one small fore-and-aft sail right aft pointed exactly as high
    // as a caravel. That erased the one distinction the ships are *for*: the
    // whole reason the caravel is called the instrument of discovery, and the
    // whole reason the nau is described as a ship you plan the passage around
    // rather than fight the wind in, is that one of them goes to windward and
    // the other does not.
    //
    // A ship goes to windward when everything hanging on her, added up, pulls
    // her forward. So the masts are summed, each weighted by its own area, and
    // the answer is the first angle at which the total turns positive. A nau's
    // hundred-and-thirty-metre mizzen cannot drag six hundred and eighty metres
    // of backed square canvas up into the wind, and now it does not pretend to.
    const masts = this.ship.hull.masts.filter((_m, i) => {
      const sail = this.ship.state.sails[i];
      return !sail || sail.condition > 0.05;
    });
    if (masts.length === 0) return 88;
    for (let beta = 5; beta <= 90; beta += 1) {
      let drive = 0;
      for (const m of masts) {
        const p = RIG_PROFILES[m.rig];
        drive += sailForce(10, beta, optimalTrim(beta, p), m.area, p).drive;
      }
      // She also crabs sideways, so her course made good is worse than she
      // points.
      // Bowlines, a false keel and long lateen yards take a few degrees more.
      if (drive > 0) return clamp(beta + 7 - this.ship.effects.pointing - (this.can('windward') ? 2 : 0), 20, 88);
    }
    return 88;
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

    // Paper falling due, alongside the water and the hull, because it is the
    // same kind of thing: a number that is fine today and ruinous in ninety
    // days, and the decision about it is made in port or not at all.
    const bills = this.finance.live.filter((d) => d.kind !== 'quinhao');
    if (bills.length > 0) {
      const late = bills.filter((d) => this.clock.t > d.dueBy);
      const soonest = bills.reduce((a, b) => (a.dueBy <= b.dueBy ? a : b));
      const untilDue = (soonest.dueBy - this.clock.t) / 86400;
      out.push({
        label: 'Paper outstanding',
        value: `${Math.round(this.finance.owedTo())} cruzados`,
        state: late.length > 0 ? 'bad' : untilDue < 45 ? 'warn' : 'good',
        note: late.length > 0
          ? `${late.length} of them past the date. Their factors are looking for you, and a letra `
            + 'goes on compounding while they do.'
          : untilDue < 45
            ? `The nearest falls due in ${Math.round(untilDue)} days, and a passage is longer than `
              + 'that more often than not.'
            : undefined,
      });
    }
    if (this.finance.shareOut > 0) {
      out.push({
        label: 'Sold out of the voyage',
        value: `${(this.finance.shareOut * 100).toFixed(0)} in a hundred`,
        state: this.finance.shareOut > 0.4 ? 'warn' : 'good',
        note: 'Taken off the top of everything you land and everything the Casa pays you, '
          + 'before it reaches the purse.',
      });
    }

    // A station that will not survive being left again. It belongs here rather
    // than only on the orders screen because this is the list a player reads
    // before deciding where to go next, which is the decision it bears on.
    const shaky = this.liveFactories
      .filter((f) => f.trouble > 0.5)
      .sort((a, b) => b.trouble - a.trouble)[0];
    if (shaky) {
      out.push({
        label: 'A factory in trouble',
        value: portName(shaky.portId),
        state: shaky.trouble > 0.72 ? 'bad' : 'warn',
        note: `${shaky.factor} has ${stockTons(shaky).toFixed(1)} tons in the shed and a town that `
          + 'has changed its mind. It only gets worse while you are elsewhere.',
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

  /**
   * Every fix closes the traverse on the chart: whatever the pilot drew since
   * the last one is amended by the error the fix has just revealed.
   */
  private wireNavigator(): void {
    this.nav.onCorrect = (c) => {
      this.chart.amend(c);
      // A sight worked is practice at the art.
      const m = this.nav.fixes[this.nav.fixes.length - 1]?.method ?? '';
      if (/Meridian|North Star|Lunar|star/i.test(m)) this.practise('navegacao', 1);
    };
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
      careerId: this.careerId,
      t: this.clock.t,
      scaleIndex: this.clock.scaleIndex,
      ship: this.ship.serialize(),
      crew: this.crew,
      hands: this.hands,
      casa: this.casa,
      captain: this.captain,
      bonds: [...this.bonds],
      origin: this.origin,
      aimOffNm: this.aimOffNm,
      debt: this.crown.debt,
      nav: {
        estimated: { lat: round(this.nav.estimated.lat, 6), lon: round(this.nav.estimated.lon, 6) },
        sigmaLat: round(this.nav.sigmaLat, 5),
        sigmaLon: round(this.nav.sigmaLon, 5),
        // The traverse board and the fix list are the pilot's working, and a
        // double's last eleven digits are not part of it. Rounded to a good
        // deal finer than anything he could read off an instrument.
        traverse: this.nav.traverse.map((e) => ({
          ...e,
          t: Math.round(e.t),
          course: round(e.course, 2),
          distance: round(e.distance, 3),
          windFrom: round(e.windFrom, 1),
          windKnots: round(e.windKnots, 2),
        })),
        fixes: this.nav.fixes.map((f) => ({
          ...f,
          t: Math.round(f.t),
          latitude: round(f.latitude, 5),
          sigma: round(f.sigma, 5),
        })),
        kit: this.nav.kit,
      },
      chart: this.chart.serialize(),
      rutter: this.rutter.serialize(),
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
      log: this.log.serialize().map((e) => (e.lat === undefined ? e : {
        ...e, t: Math.round(e.t), lat: round(e.lat, 4), lon: round(e.lon ?? 0, 4),
      })),
      finance: this.finance.serialize(),
      propositionsSeen: this.propositionsSeen,
      feitorias: this.feitorias,
      lettersSeen: this.lettersSeen,
      dockedAt: this.dockedAt,
      dockedSinceT: this.dockedSinceT,
      anchored: this.anchored,
      ration: this.ration,
      pumpEffort: this.pumpEffort,
      autoTrim: this.autoTrim,
      difficulty: this.difficulty,
      voltaAdvised: this.voltaAdvised,
      voltaAllowance: true,
      orderedCanvas: this.orderedCanvas,
      helmOrder: this.helmOrder,
      latitudeOrder: this.latitudeOrder,
      namedFeatures: this.namedFeatures,
      foundFeatures: this.foundFeatures,
      isles: this.isles,
      secretsHeard: this.secretsHeard,
      estate: this.estate,
      designs: this.designs,
      building: this.building,
      flagship: this.flagship,
      coastOrder: this.coastOrder,
      tutorial: this.tutorial,
      seenChart: this.seenChart,
      encounter: this.encounter,
      seaRecord: this.seaRecord,
      chaseOrder: this.chaseOrder,
      chaseToldOnce: this.chaseToldOnce,
      monsoonToldOnce: this.monsoonToldOnce,
      tideToldOnce: this.tideToldOnce,
      monsoonWarnedT: this.monsoonWarnedT,
      journeys: this.journeys,
      journeyRecord: this.journeyRecord,
      nextJourneyId: this.nextJourneyId,
      inlandRoads: [...this.inlandRoads],
      gale: this.gale,
      galeRecord: this.galeRecord,
      route: this.route,
      diplomacy: this.diplomacy,
      trade: this.trade,
      chronicle: this.chronicle,
      quests: this.quests,
      soundedGround: this.soundedGround,
      portQuestsDone: [...this.portQuestsDone],
      passageRecord: this.passageRecord,
      daysSincePort: this.daysSincePort,
      distanceRun: this.distanceRun,
      correctedNm: this.correctedNm,
      groundRun: this.groundRun,
      dayRuns: this.dayRuns,
      markLaidAt: this.markLaidAt,
      markDistNm: this.markDistNm,
      deepestSouth: this.deepestSouth,
      passedTheKnown: this.passedTheKnown,
      startT: this.startT,
      leads: this.leads,
      ventures: this.ventures,
      ventureOffers: this.ventureOffers,
      rival: this.rival,
      rivalRace: this.rivalRace,
      nextVentureId: this.nextVentureId,
      nextLeadId: this.nextLeadId,
    });
  }

  static deserialize(json: string): Game {
    const d = JSON.parse(json);
    const g = new Game(d.seed);
    // A save from before careers had ids keeps a fresh one from here on.
    if (typeof d.careerId === 'string' && d.careerId) g.careerId = d.careerId;
    g.clock.t = d.t;
    g.clock.scaleIndex = d.scaleIndex ?? 1;
    // Her own lines have to be known before she can be.
    g.designs = d.designs ?? [];
    for (const x of g.designs) registerHull(x.hull, x.polar);
    g.building = d.building ?? null;
    g.flagship = d.flagship ?? null;
    g.ship = Ship.deserialize(d.ship);
    g.crew = d.crew;
    g.hands = d.hands ?? musterHands(g.rng);
    g.casa = d.casa ?? newCasa();
    g.captain = d.captain ?? newCaptainSkills();
    // The trees were redrawn: a captain who learned the old shape is given his
    // points back to spend again.
    const refunded = migrateCaptain(g.captain);
    if (refunded > 0) {
      g.pushAlert(`The captain's book has been redrawn: ${refunded} points returned to spend again.`, 'note');
    }
    g.bonds = new Set<BondId>(d.bonds ?? []);
    g.origin = d.origin ?? 'segundo';
    g.aimOffNm = d.aimOffNm ?? 0;
    g.refreshSkillCache();
    g.nav.estimated = d.nav.estimated;
    g.nav.sigmaLat = d.nav.sigmaLat;
    g.nav.sigmaLon = d.nav.sigmaLon;
    g.nav.traverse = d.nav.traverse ?? [];
    g.nav.fixes = d.nav.fixes ?? [];
    g.nav.kit = d.nav.kit;
    g.chart = Chart.deserialize(d.chart);
    g.rutter = Rutter.deserialize(d.rutter);
    g.crown.debt = d.debt ?? 0;
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
    (g as any).dockedSinceT = d.dockedSinceT ?? g.clock.t;
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
    g.helmOrder = d.helmOrder ?? null;
    g.latitudeOrder = d.latitudeOrder ?? null;
    g.namedFeatures = d.namedFeatures ?? {};
    g.foundFeatures = d.foundFeatures ?? [];
    g.isles = { ...newIsleState(), ...(d.isles ?? {}) };
    g.secretsHeard = d.secretsHeard ?? [];
    g.estate = { ...newEstate(g.clock.t), ...(d.estate ?? {}) };
    // An island raised with its scene still unanswered when the game was saved.
    for (const [id, f] of Object.entries(g.isles.found)) if (!f.name) delete g.isles.found[id];
    g.coastOrder = d.coastOrder ?? null;
    g.finance = Ledger.deserialize(d.finance);
    g.propositionsSeen = d.propositionsSeen ?? [];
    g.feitorias = d.feitorias ?? [];
    g.lettersSeen = d.lettersSeen ?? [];
    // A voyage begun before the pilot existed is a voyage whose captain has
    // plainly worked it out for himself, so he is not started on lesson one.
    g.tutorial = d.tutorial ?? { on: false, at: 0, finished: true };
    g.seenChart = d.seenChart ?? true;
    g.encounter = d.encounter ?? null;
    g.seaRecord = { ...newSeaRecord(), ...(d.seaRecord ?? {}) };
    g.chaseOrder = d.chaseOrder ?? 'hold';
    g.chaseToldOnce = d.chaseToldOnce ?? false;
    g.monsoonToldOnce = d.monsoonToldOnce ?? false;
    g.tideToldOnce = d.tideToldOnce ?? false;
    g.monsoonWarnedT = d.monsoonWarnedT ?? -1e9;
    g.journeys = d.journeys ?? [];
    g.journeyRecord = { ...newJourneyRecord(), ...(d.journeyRecord ?? {}) };
    g.nextJourneyId = d.nextJourneyId ?? 1;
    g.inlandRoads = new Set<string>(d.inlandRoads ?? []);
    for (const id of g.inlandRoads) g.markets.openRoad(id, g.clock.t);
    g.gale = d.gale ?? newGale();
    g.galeRecord = { ...newGaleRecord(), ...(d.galeRecord ?? {}) };
    // Saves from before a passage could have more than one mark carry a single
    // destination; it becomes a route of one.
    g.route = d.route ?? (d.destination ? [d.destination] : []);
    g.portQuestsDone = new Set<string>(d.portQuestsDone ?? []);
    g.soundedGround = d.soundedGround ?? [];
    g.quests = d.quests ?? [];
    g.diplomacy = d.diplomacy ?? newDiplomacy();
    g.trade = { ...newTrade(g.clock.t), ...(d.trade ?? {}) };
    g.ship.reservedTons = g.trade.quintaladas
      ? g.crew.officers.filter((o) => o.alive && !o.ashoreAt).length * CHEST_TONS : 0;
    // A career from before the courts: states you have dealt with are met, and
    // start where your regard with their ports stood.
    if (!d.diplomacy) {
      for (const pol of POLITIES) {
        const rels = pol.ports.map((id) => g.relations.get(id)).filter((r): r is NonNullable<typeof r> => !!r && r.met);
        if (rels.length === 0) continue;
        const st = g.diplomacy.polities[pol.id];
        st.met = true;
        const avg = rels.reduce((sum, r) => sum + r.regard, 0) / rels.length;
        st.trust = clamp(avg, -1, 1);
        st.interest = clamp(avg * 0.5 + 0.1, -1, 1);
        st.knowledge = clamp(0.15 * rels.length, 0, 0.6);
      }
    }
    g.chronicle = d.chronicle ?? chronicleFromProgress(g);
    refreshQuestPrices(g);
    g.passageRecord = { ...newPassageRecord(), ...(d.passageRecord ?? {}) };
    g.daysSincePort = d.daysSincePort ?? 0;
    g.distanceRun = d.distanceRun ?? 0;
    g.correctedNm = d.correctedNm ?? 0;
    g.groundRun = d.groundRun ?? 0;
    g.dayRuns = d.dayRuns ?? [];
    g.markLaidAt = d.markLaidAt ?? null;
    g.markDistNm = d.markDistNm ?? 0;
    g.deepestSouth = d.deepestSouth ?? 90;
    g.passedTheKnown = d.passedTheKnown ?? false;
    g.startT = d.startT ?? 0;
    g.leads = d.leads ?? [];
    g.ventures = d.ventures ?? [];
    // Charters homeward from the trades used to be allowed the crow's road,
    // not the volta. Any still open are given the time a merchant now allows.
    if (!d.voltaAllowance) {
      for (const v of g.ventures) {
        if (v.delivered || v.failed) continue;
        const a = portDef(v.fromPort), b = portDef(v.toPort);
        const extra = charterDays(a, b) - Math.min(260, Math.max(34, haversine(a, b) / NM / 78 + 26));
        if (extra > 0) v.dueBy += extra * 86400;
      }
    }
    g.ventureOffers = d.ventureOffers ?? [];
    if (d.rival) g.rival = d.rival;
    g.rivalRace = d.rivalRace ?? null;
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

/**
 * Round to `d` decimals on the way into a save.
 *
 * A double prints seventeen significant digits and a save file is mostly
 * numbers, so most of a save was the part of each number nobody can measure,
 * act on, or see. Four decimals of a degree is about eleven yards.
 */
function round(n: number, d: number): number {
  if (!Number.isFinite(n)) return 0;
  const m = 10 ** d;
  return Math.round(n * m) / m;
}

/** What the masthead can make out of a town before anybody knows whose it is. */
function townLooks(def: PortDef): string {
  const p = people(def.people);
  const big = def.size === 'city' || def.size === 'emporium';
  if (p.faith === 'muslim') {
    return big ? 'White stone houses, flat roofs, and a minaret over them'
      : 'Whitewashed houses along the shore, and a mosque';
  }
  if (p.faith === 'hindu') {
    return big ? 'Palm-thatched roofs for miles, and a temple tower'
      : 'Thatch under the palms, and boats drawn up on the beach';
  }
  if (p.faith === 'buddhist') return 'Roofs among the trees, and a white dome';
  if (p.faith === 'catholic') return 'A church tower, and roofs of tile';
  return big ? 'A great many round houses, and smoke going up all along the shore'
    : 'Round houses under thatch, and canoes on the beach';
}
