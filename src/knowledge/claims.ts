import { NM, clamp, haversine, type LatLon } from '../core/math';
import { Rng } from '../core/rng';
import { PORTS, portDef } from '../world/ports';
import { ISLES } from '../world/isles';
import { sightingRangeNm } from '../navigation/charts';
import { rivalLevel, SHEET_PACE } from '../progression/rival';
import { regionOfPoint } from './sheetRegions';
import type { SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';

/**
 * Claims on the Casa's sheet (BUILD_PLAN D3, DA 3.5 #1).
 *
 * Every run the Casa's sheet carries 10-15 *claims*: places it draws, or has heard of, that are not where
 * it says or not there at all. This extends the issued sheet's `seededError` (a smooth, honest-looking
 * distortion that is a pure function of place) with the other kind of error a chart of 1482 carried, the
 * thing somebody once swore to. Some claims are real places displaced; some are phantoms. Which is decided
 * per seed, deterministically, and never shown: truth comes out by sailing (an island raised; a coast made;
 * a clear horizon where a sea should be; a coast surveyed and found empty) or from a second informer who is
 * right three times in four.
 *
 * Frames: `lat`/`lon` on a Claim are the *Casa's sheet* (chart frame). `truth` is the world and is read only
 * by the lookout when the ship is in sight of it. Nothing here writes truth into the Chart.
 *
 * The spine (docs/DESIGN.md, BUILD_PLAN 0.3): each claim is told at ports of the road, and ends at a port
 * further along it (`end`), so every claim is closed by a forward detour and none asks the captain to turn
 * back. `scripts/discovery.ts` checks this against `road.ts along()`.
 */

export type ClaimKind = 'phantom' | 'real';
export type ClaimMode = 'sweep' | 'coast' | 'isle';
export type ClaimStatus = 'open' | 'found' | 'held' | 'false' | 'lost';

export interface Claim {
  id: string;
  kind: ClaimKind;
  mode: ClaimMode;
  /** Where the Casa's sheet draws it. Chart frame. */
  lat: number;
  lon: number;
  /** The real place, when there is one. Ground truth: only the lookout may read it. */
  truth?: LatLon;
  /** The ocean island, when it is one (world/isles). */
  isle?: string;
  told: boolean;
  toldAt?: number;
  toldPort?: string;
  leadId?: string;
  status: ClaimStatus;
  resolvedT?: number;
  /** Who got it, when it was lost: the rival's name, or the historical finder's. */
  by?: string;
  /** The rumoured spot was sailed and nothing was in sight there (a real place not where it was said). */
  searched?: boolean;
  /** A real coast has been raised and its scene put to the captain, not yet answered. */
  raised?: boolean;
  /** Years of the other captain's work before he reaches it. Real claims only. */
  rivalAfter: number;
  rivalWork: number;
  /** The port the Casa will grant ground at, at a discount, to a man who holds the claim. */
  site?: string;
  siteUsed?: boolean;
}

export interface ClaimsState { list: Claim[]; /** Times each quay has been put into, so a tale is told or not by a fixed roll. */ visits: Record<string, number> }
export const newClaims = (): ClaimsState => ({ list: [], visits: {} });

export interface ClaimDef {
  id: string;
  name: string;
  /** Phantom, real, or one of three places Prester John is put (exactly one of them is real per seed). */
  rule: ClaimKind | 'prester';
  mode: ClaimMode;
  /** Where the Casa's sheet draws it before the seed bends it (chart frame, degrees). */
  at: LatLon;
  /** Real: the place itself. Real isles read it from world/isles. */
  truth?: LatLon;
  isle?: string;
  /** Ports of the road where it is told, and the port further along where the detour closes. */
  tell: string[];
  end: string;
  /** First year it is told. */
  from: number;
  /** Renown for settling it. */
  value: number;
  /** Years of the rival's work before he takes it, if real. */
  rival: number;
  /** In the teller's mouth, after "At {port}, {who} ". {where} is the position as told. */
  say: string;
  /** What is actually known of it (docs/SOURCES.md): documented, approximate or invented. */
  source: string;
  /** Always in the sheet, or one of the extras a seed may leave out. */
  core: boolean;
  /** How far the sheet is out for a real claim, degrees (min, max). */
  off?: [number, number];
}

const ISLE = (id: string): LatLon => { const i = ISLES.find((x) => x.id === id)!; return { lat: i.lat, lon: i.lon }; };

export const CLAIM_DEFS: ClaimDef[] = [
  // -- The western ocean: what the Atlantic charts of the century carried --------------------------------------
  {
    id: 'antilia', name: 'Antília, of the Seven Cities', rule: 'phantom', mode: 'sweep', at: { lat: 34.5, lon: -41.5 },
    tell: ['funchal', 'lagos'], end: 'las-palmas', from: 1482, value: 14, rival: 0, core: true,
    say: 'tell of Antília, west of the islands, {where}: seven bishops fleeing the Moors built a city each, and their people are there yet.',
    source: 'documented: on Atlantic charts from 1424 (Pizzigano); Fernão Dulmo and João Estreito had a patent for it in 1486. The sweep radius and the teller are invented.',
  },
  {
    id: 'ilha-do-brasil', name: 'Ilha do Brasil, west of the Azores', rule: 'phantom', mode: 'sweep', at: { lat: 38.5, lon: -35.5 },
    tell: ['funchal', 'lisboa'], end: 'las-palmas', from: 1482, value: 14, rival: 0, core: false,
    say: 'swears to the Island of Brasil, two hundred leagues west of the Azores, {where}: round as a wheel, with a harbour, and no man who has gone for it has come back to say so.',
    source: 'documented: the Atlantic "Brasil" drawn west of the Azores on charts from 1325 (Dulcert). The teller and his words are invented.',
  },
  {
    id: 'hy-brasil', name: 'Hy-Brasil', rule: 'phantom', mode: 'sweep', at: { lat: 51.6, lon: -16.2 },
    tell: ['lisboa'], end: 'lagos', from: 1482, value: 14, rival: 0, core: true,
    say: 'talk of an island in a fog west of Ireland, {where}, that lifts one day in seven years. The Bristol men have gone for it more than once.',
    source: 'documented: Hy-Brasil on charts from 1325; Bristol voyages searched the western ocean from 1480 (the Trinity, 1480). Dates of the fog and the teller are invented.',
  },
  {
    id: 'sao-brandao', name: 'Ilha de São Brandão', rule: 'phantom', mode: 'sweep', at: { lat: 28.2, lon: -22.8 },
    tell: ['las-palmas', 'funchal'], end: 'arguim', from: 1482, value: 14, rival: 0, core: true,
    say: 'say that on clear evenings St Brendan’s island is to be seen from the western islands, {where}, and that every ship that goes after it loses it in the haze.',
    source: 'documented: the Isle of St Brendan was seen from the Canaries and Madeira and sought by expeditions into the 1700s. The teller is invented.',
  },
  {
    id: 'satanazes', name: 'Satanazes, the isle of devils', rule: 'phantom', mode: 'sweep', at: { lat: 35.6, lon: -50.5 },
    tell: ['funchal'], end: 'las-palmas', from: 1484, value: 16, rival: 0, core: false,
    say: 'will not name the place but will draw it, {where}, past Antília: a rock where the sea runs red at evening and the devils whistle in the rigging.',
    source: 'documented: Satanazes, beside Antília on the Pizzigano chart (1424). The red sea and the whistling are invented.',
  },
  {
    id: 'mar-tenebroso', name: 'the Sea of Darkness', rule: 'phantom', mode: 'sweep', at: { lat: 27.5, lon: -38 },
    tell: ['las-palmas'], end: 'arguim', from: 1482, value: 12, rival: 0, core: false,
    say: 'will tell you what the old Moors wrote: that west of the islands, {where}, the water thickens to weed and the air to darkness, and no ship has come back that went in.',
    source: 'documented: the Sea of Darkness (Bahr al-Zulumat) in Arab geography and in the speeches against Bojador; weed fields are real. The place named is invented.',
  },
  {
    id: 'ilha-das-mulheres', name: 'the Isle of Women', rule: 'phantom', mode: 'sweep', at: { lat: 11.8, lon: 57 },
    tell: ['mocambique', 'melinde'], end: 'calecute', from: 1485, value: 16, rival: 0, core: false,
    say: 'speak of the isle where only women live, {where}, a month’s sail from Socotra, and of the men’s isle a few days beyond it.',
    source: 'documented: Marco Polo’s Male and Female islands; Arab sailing books place them off Socotra. The position here is invented.',
  },
  // -- Real places the sheet has wrong ----------------------------------------------------------------------------
  {
    id: 'brasil', name: 'the land of the Holy Cross', rule: 'real', mode: 'isle', at: ISLE('brasil'), isle: 'brasil', off: [5, 8],
    tell: ['funchal', 'las-palmas'], end: 'mpinda', from: 1482, value: 90, rival: 16, core: true,
    say: 'swear to a great land far to the south-west of the islands, {where}: a caravel blown off Cape Verde saw a round mountain over it, and trees down to the water.',
    source: 'documented: the Portuguese reached Brazil in 1500 (Cabral); earlier knowledge is argued (the Duarte Pacheco Pereira claim). The 1482 rumour and its teller are invented.',
  },
  {
    id: 'fernando', name: 'the island with a needle of rock', rule: 'real', mode: 'isle', at: ISLE('fernando'), isle: 'fernando', off: [3, 5],
    tell: ['las-palmas'], end: 'mina', from: 1482, value: 40, rival: 13, core: false,
    say: 'tell of a green island with a needle of rock on it, {where}, a long way west of the Cape Verdes.',
    source: 'approximate: Fernando de Noronha, sighted c. 1501-03 by a Lisbon-financed voyage. The rumour is invented.',
  },
  {
    id: 'santa-helena', name: 'a green rock in the southern ocean', rule: 'real', mode: 'isle', at: ISLE('santa-helena'), isle: 'santa-helena', off: [3, 5],
    tell: ['mina', 'mpinda'], end: 'benguela', from: 1483, value: 60, rival: 15, core: false,
    say: 'speak of a green rock alone in the middle of the southern ocean, {where}, with water running down it; one man swears he smelled it before he saw it.',
    source: 'documented: St Helena found by João da Nova in 1502. The rumour is invented.',
  },
  {
    id: 'madagascar', name: 'the Isle of the Moon', rule: 'real', mode: 'isle', at: ISLE('madagascar'), isle: 'madagascar', off: [2, 3],
    tell: ['mocambique'], end: 'melinde', from: 1484, value: 70, rival: 11, core: false,
    say: 'speak of the great island of the Moon, {where}, bigger than Portugal, where they trade for rice and slaves.',
    source: 'documented: São Lourenço sighted by Fernandes in 1500, known to Arab pilots and to Marco Polo’s account. The teller is invented.',
  },
  {
    id: 'rio-de-ouro', name: 'the Rio de Ouro', rule: 'real', mode: 'coast', at: { lat: 23.7, lon: -15.9 }, truth: { lat: 23.7, lon: -15.9 }, off: [0.9, 1.7],
    tell: ['las-palmas', 'funchal'], end: 'arguim', from: 1482, value: 20, rival: 7, core: true,
    say: 'say the Rio de Ouro lies {where}, a day beyond where the Casa’s sheet has it, and that the sand of it is gold.',
    source: 'documented: the Rio de Oro of Baldaia (1436) is an inlet, not a river, and had no gold. The Casa’s displacement and the gold sand are invented.',
  },
  {
    id: 'monomotapa', name: 'the gold kingdom behind Sofala', rule: 'real', mode: 'coast', at: { lat: -20.2, lon: 34.7 }, truth: { lat: -20.2, lon: 34.7 }, off: [1.5, 2.6],
    tell: ['benguela'], end: 'mocambique', from: 1485, value: 45, rival: 9, core: false,
    say: 'talk of the Moorish gold-port, {where}, and the king inland of it who sends the gold down in canoes.',
    source: 'documented: Sofala, the Mwene Mutapa and the Zimbabwe gold trade; the Portuguese reached Sofala in 1500-05. The 1485 rumour is invented.',
  },
  // -- Prester John, at three latitudes: exactly one is the real place each run ---------------------------------------
  {
    id: 'prester-guinea', name: 'Prester John, behind Benin', rule: 'prester', mode: 'coast', at: { lat: 4.3, lon: 6.1 }, truth: { lat: 5.6, lon: 5.1 }, off: [0.8, 1.6],
    tell: ['mina', 'arguim'], end: 'mpinda', from: 1485, value: 55, rival: 6, core: true,
    say: 'tell of a great Christian king behind the Benin river, {where}, whom they call the Ogané, who sends a staff and a cross to his vassals when they are crowned.',
    source: 'documented: João Afonso de Aveiro at Benin (c. 1486) was told of the Ogané and took him for Prester John (Pacheco Pereira, Esmeraldo). The 1485 rumour and its teller are invented.',
  },
  {
    id: 'prester-ethiopia', name: 'Prester John, in Ethiopia', rule: 'prester', mode: 'coast', at: { lat: 13.0, lon: 43.0 }, truth: { lat: 16.9, lon: 41.1 }, off: [1.5, 2.5],
    tell: ['mocambique', 'melinde'], end: 'calecute', from: 1485, value: 75, rival: 8, core: true,
    say: 'say that the Christian king of the Abyssinians keeps court behind the Red Sea coast, {where}, and that his priests come to Jerusalem by the Nile.',
    source: 'documented: Pêro da Covilhã and Afonso de Paiva sent overland in 1487; Covilhã reached the Ethiopian court. The rumour is invented.',
  },
  {
    id: 'prester-india', name: 'Prester John, among the Christians of India', rule: 'prester', mode: 'coast', at: { lat: 13.5, lon: 74.0 }, truth: { lat: 9.0, lon: 76.4 }, off: [1.5, 3],
    tell: ['mocambique', 'melinde'], end: 'cochim', from: 1486, value: 60, rival: 12, core: true,
    say: 'will tell you what Marco Polo wrote: that Prester John is a Nestorian king in the Indies, {where}, and the Christians of Malabar are his people.',
    source: 'documented: Prester John in "India" (Marco Polo, Mandeville); the St Thomas Christians of Malabar are real, and the Portuguese found them in 1498. The teller is invented.',
  },
];

export const DEF_BY_ID = new Map(CLAIM_DEFS.map((d) => [d.id, d]));
/** Island ids and phantom ids the older quay-talk (game/farLand hearOfIsland) must leave to the claims. */
export const CLAIMED_IDS = new Set(CLAIM_DEFS.flatMap((d) => [d.id, ...(d.isle ? [d.isle] : [])]));

// -- Seeding --------------------------------------------------------------------------------------------------------

const MIN_CLAIMS = 10, MAX_CLAIMS = 15;
const PRESTER_WEIGHT: Record<string, number> = { 'prester-ethiopia': 0.55, 'prester-india': 0.25, 'prester-guinea': 0.2 };

function seedRng(seed: number): Rng { return Rng.fromString(`claims|${seed | 0}`); }

/** The nearest port to a point, if within the Casa's grant of ground. */
function siteNear(p: LatLon): string | undefined {
  let best: { id: string; nm: number } | null = null;
  for (const q of PORTS) {
    const nm = haversine(p, { lat: q.lat, lon: q.lon }) / NM;
    if (!best || nm < best.nm) best = { id: q.id, nm };
  }
  return best && best.nm <= 1400 ? best.id : undefined;
}

/** Ten to fifteen claims for this seed, deterministic in the seed alone. */
export function seedClaims(seed: number): ClaimsState {
  const rng = seedRng(seed);
  const core = CLAIM_DEFS.filter((d) => d.core);
  const extra = rng.shuffle(CLAIM_DEFS.filter((d) => !d.core));
  const n = rng.int(MIN_CLAIMS, MAX_CLAIMS);
  const chosen = [...core, ...extra.slice(0, Math.max(0, n - core.length))];
  // Which Prester is the real one.
  const presters = chosen.filter((d) => d.rule === 'prester');
  let roll = rng.next() * presters.reduce((s, d) => s + (PRESTER_WEIGHT[d.id] ?? 0.3), 0);
  let realPrester = presters[presters.length - 1]?.id;
  for (const d of presters) { roll -= PRESTER_WEIGHT[d.id] ?? 0.3; if (roll <= 0) { realPrester = d.id; break; } }

  const list: Claim[] = [];
  for (const d of CLAIM_DEFS) {
    const pick = chosen.find((c) => c.id === d.id);
    const jitter = rng.next(); const jitterB = rng.next(); const ang = rng.next() * Math.PI * 2; const mag = rng.next();
    const dBetween = rng.next();
    if (!pick) continue;
    const kind: ClaimKind = d.rule === 'prester' ? (d.id === realPrester ? 'real' : 'phantom') : d.rule;
    let lat = d.at.lat, lon = d.at.lon;
    let truth: LatLon | undefined;
    if (kind === 'real') {
      truth = d.truth ?? ISLE(d.isle!);
      const [lo, hi] = d.off ?? [1, 2];
      const m = lo + (hi - lo) * mag;
      if (d.mode === 'isle') {
        lat = truth.lat + m * Math.sin(ang);
        lon = truth.lon + m * Math.cos(ang);
      } else {
        // A coast is out along its length: the sheet has it a day's sail north or south of where it is.
        lat = truth.lat + (jitter < 0.5 ? -m : m) * 0.9;
        lon = truth.lon + (jitterB - 0.5) * 0.8;
      }
    } else {
      // A phantom is drawn where the old charts drew it, give or take what the copyist did.
      lat = d.at.lat + (jitter - 0.5) * 1.4;
      lon = d.at.lon + (jitterB - 0.5) * 1.6;
    }
    list.push({
      id: d.id, kind, mode: d.mode, lat, lon, truth, isle: d.isle,
      told: false, status: 'open', searched: false,
      rivalAfter: kind === 'real' ? d.rival * (0.75 + 0.5 * dBetween) : 0, rivalWork: 0,
      site: kind === 'real' && truth ? siteNear(truth) : undefined,
    });
  }
  return { list, visits: {} };
}

export function migrateClaims(d: unknown, seed: number): ClaimsState {
  const x = d as Partial<ClaimsState> | undefined;
  if (x && Array.isArray(x.list) && x.list.length > 0) {
    const list = x.list.filter((c) => DEF_BY_ID.has(c.id));
    // A find whose scene was still unanswered when the game was saved is raised again.
    for (const c of list) if (c.raised && c.status === 'open') c.raised = false;
    return { list, visits: { ...(x.visits ?? {}) } };
  }
  return seedClaims(seed);
}

export const claimDef = (c: Claim): ClaimDef => DEF_BY_ID.get(c.id)!;
export const claimName = (c: Claim): string => claimDef(c).name;
export const claimById = (g: Game, id: string): Claim | undefined => g.claims.list.find((c) => c.id === id);

// -- Telling ------------------------------------------------------------------------------------------------------

const TELLER_FOR: Record<string, string> = {
  funchal: 'an old pilot of the islands', lagos: 'a man on the quay', lisboa: 'a man on the Rua Nova',
  'las-palmas': 'a Canary fisherman', arguim: 'a factor’s clerk', mina: 'a mulatto interpreter',
  mpinda: 'a Kongo trader', benguela: 'a Portuguese convict-settler', mocambique: 'a Moorish pilot',
  melinde: 'a Gujarati pilot with a rutter older than Portugal',
};

function whereWords(lat: number, lon: number): string {
  return `about ${Math.abs(lat).toFixed(0)}° ${lat >= 0 ? 'north' : 'south'}, ${Math.abs(lon).toFixed(0)}° ${lon >= 0 ? 'east' : 'west'}`;
}

function toldHash(seed: number, id: string, port: string, visit: number): number {
  let h = 2166136261 ^ (seed | 0);
  const s = `${id}|${port}|${visit}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h >>> 0) % 10000) / 10000;
}

/** Chance a quay tells a given tale on a given visit. */
export const TELL_CHANCE = 0.8;
export const TELL_PER_VISIT = 2;

/**
 * Put into a port: tell up to two of the tales this quay carries that the captain has not yet heard. Each is
 * entered as a rumour (a Lead, shown as a Fact of kind 'rumour'), pricked on the chart with a question mark.
 */
export function hearClaims(g: Game, portId: string): number {
  const year = g.clock.date.year;
  let n = 0;
  const visit = g.claims.visits[portId] = (g.claims.visits[portId] ?? 0) + 1;
  for (const c of g.claims.list) {
    if (n >= TELL_PER_VISIT) break;
    const d = claimDef(c);
    if (c.told || c.status !== 'open' || !d.tell.includes(portId) || year < d.from) continue;
    if (toldHash(g.seed, c.id, portId, visit) > TELL_CHANCE) continue;
    const who = TELLER_FOR[portId] ?? 'a man on the quay';
    const text = `At ${portDef(portId).name}, ${who} ${d.say.replace('{where}', whereWords(c.lat, c.lon))} The pilot has pricked it on the chart with a question mark.`;
    const sigma = c.kind === 'phantom' ? 160 : 120;
    const lead = g.addIsleLead({
      kind: 'island', text, source: `${who} at ${portDef(portId).name}`, lat: c.lat, lon: c.lon,
      errorNm: sigma, value: d.value, isle: c.id, claim: c.id,
    });
    c.told = true; c.toldAt = g.clock.t; c.toldPort = portId; c.leadId = lead.id;
    n++;
  }
  return n;
}

/** A second informer's word on a claim: right three times in four, and never the truth itself. */
export function claimSecondOpinion(g: Game, id: string): 'agrees' | 'disputed' {
  const c = claimById(g, id);
  if (!c) return 'agrees';
  const right = toldHash(g.seed, id, 'second', 0) < 0.75;
  const truthSays = c.kind === 'real' ? 'agrees' : 'disputed';
  return right ? truthSays : (truthSays === 'agrees' ? 'disputed' : 'agrees');
}

// -- Resolving -------------------------------------------------------------------------------------------------------

function closeLead(g: Game, c: Claim, falseTale: boolean): void {
  const l = g.leads.find((x) => x.claim === c.id);
  if (!l) return;
  l.followed = true;
  l.false = falseTale;
}

const SWEEP_NM = 20;
const SURVEY_NM = 45;

/** What the lookout and the board give at this moment. Defaults to the ship's; the falsifier supplies its own. */
export interface WatchEnv { at: LatLon; truePos: LatLon; visibility: number; day: boolean; mastM: number }

export function envOf(g: Game): WatchEnv {
  const hour = ((g.clock.hour + g.ship.state.pos.lon / 15) % 24 + 24) % 24;
  return { at: g.nav.estimated, truePos: g.ship.state.pos, visibility: g.weatherNow.visibility, day: hour >= 7 && hour <= 18, mastM: g.ship.mastHeight };
}

/** The rumour is a phantom and the area has been looked at properly: struck off, and worth saying so. */
function exposePhantom(g: Game, c: Claim, how: 'sweep' | 'survey'): string {
  const d = claimDef(c);
  c.status = 'false';
  c.resolvedT = g.clock.t;
  closeLead(g, c, true);
  g.crown.record('island', `${d.name} — not there`, g.nav.estimated, d.value, g.clock.t);
  g.noteDeed('rumour.false', { target: d.name, magnitude: 0.3, silent: true, note: `Looked for ${d.name} where the tale put it; it is not there.` });
  g.crew.morale = clamp(g.crew.morale - 0.03, 0, 1);
  const text = how === 'sweep'
    ? `Here, by the reckoning, is where ${d.name} ought to be, and there is nothing: a clear horizon all round and no bottom with the deep-sea lead. The pilot rules a line through it on the chart. The Casa will want to hear it, because men have been given letters patent for this place.`
    : `The coast the tale pointed to has been run and sounded now, and ${d.name} is not on it. The pilot strikes the question mark off the sheet and writes the date beside it.`;
  g.logEvent('discovery', text, true);
  return text;
}

/**
 * Every tick at sea. A phantom in open water is settled by a clear day's sweep of its place; a phantom on a
 * coast is settled when that coast is Surveyed at the point the tale gave (chartGrade: run once and sounded,
 * or agreed). A real place is found by the lookout, in sight of the place itself.
 */
export function watchClaims(g: Game, env: WatchEnv = envOf(g)): string | null {
  const { at, truePos } = env;
  const sweepOk = env.visibility >= 10 && env.day;
  let said: string | null = null;
  for (const c of g.claims.list) {
    if (!c.told || c.status !== 'open' || c.raised) continue;
    // Real coast: found in sight of the coast itself (the lookout; ground truth).
    if (c.kind === 'real' && c.mode === 'coast' && c.truth) {
      const range = sightingRangeNm(env.mastM, env.visibility, 300);
      if (env.day && haversine(truePos, c.truth) / NM <= Math.min(range, 30)) {
        c.raised = true;
        g.pendingScenes.push(claimScene(g, c));
        said = `${claimName(c)} is raised.`;
      }
    }
    if (c.status !== 'open' || c.raised) continue;
    const near = haversine(at, { lat: c.lat, lon: c.lon }) / NM;
    if (c.kind === 'phantom' && c.mode === 'sweep' && near <= SWEEP_NM && sweepOk) {
      said = exposePhantom(g, c, 'sweep');
    } else if (c.kind === 'phantom' && c.mode === 'coast' && near <= SURVEY_NM) {
      const p = surveyGradeAt(g, { lat: c.lat, lon: c.lon });
      if (p >= 2) said = exposePhantom(g, c, 'survey');
    } else if (c.kind === 'real' && !c.searched && near <= SWEEP_NM && sweepOk) {
      // A real place that is not where the tale put it: all the pilot learns is that it is not here.
      c.searched = true;
      const text = `Nothing in sight where the tale put ${claimName(c)}. The tale may be wrong about where, or wrong about everything. The masthead is doubled and the pilot is watching the birds.`;
      g.logEvent('note', text, true);
      g.isles.lastSignT = -1e9;
      g.isles.lastCheckT = -1e9;
      said = text;
    }
  }
  return said;
}

/** The grade of the coast nearest a position on the captain's own chart (Rumour 0 .. Sounded 3). */
function surveyGradeAt(g: Game, p: LatLon): number {
  return g.gradeAt(p);
}

/** A real place, found: three ways to enter it, as the great landmarks do. */
export function claimScene(g: Game, c: Claim): SeaEvent {
  const d = claimDef(c);
  const stones = g.crown.padraoStock;
  return {
    id: `claim:${c.id}`,
    title: d.name.charAt(0).toUpperCase() + d.name.slice(1),
    severity: 'note',
    text: `Land is raised where a tale had it: ${d.name}. The Casa’s sheet has it ${displacedWords(c)}, and now the pilot knows the sheet was wrong, which is worth more than the place.`
      + ` It is the kind of place a man puts a stone on, and the other captain would.`,
    choices: [
      {
        label: stones > 0 ? 'Land a padrão and enter it as your claim' : 'No stone left to land',
        detail: stones > 0
          ? 'A day, the boat, one stone. The place is yours on the Casa’s sheet, with ground at a discount for a House, and the other captain will read it.'
          : 'The stones went ashore further north. Without one it is only found, and a found place can be taken.',
        resolve: (gg) => holdClaim(gg, c, true),
      },
      {
        label: 'Stand in and survey it',
        detail: 'Two days, boats in, the whole of it put on the sheet properly. Found, not claimed.',
        resolve: (gg) => {
          gg.clock.t += 2 * 86400;
          gg.chartedThisPassage += 40;
          gg.crown.chartedSincePatent += 40;
          return finishFind(gg, c, 'surveyed') + ' It is found, and not claimed: until a stone stands on it, it is anybody’s.';
        },
      },
      {
        label: 'Note it and press on',
        detail: 'Nothing spent. A bearing, a name, and the commission is what you are out here for.',
        resolve: (gg) => finishFind(gg, c, 'passed'),
      },
    ],
  };
}

function displacedWords(c: Claim): string {
  if (!c.truth) return 'in the wrong place';
  const nm = Math.round(haversine({ lat: c.lat, lon: c.lon }, c.truth) / NM);
  const lat = c.truth.lat - c.lat;
  const word = Math.abs(lat) > 0.3 ? (lat > 0 ? 'north' : 'south') : 'east';
  return `some ${Math.round(nm / 3)} leagues too far ${word === 'north' ? 'south' : word === 'south' ? 'north' : 'west'}`;
}

/** The place is found; `how` sets what the find was worth. Returns the line. */
function finishFind(g: Game, c: Claim, how: 'surveyed' | 'passed' | 'claimed'): string {
  const d = claimDef(c);
  const f = how === 'claimed' ? 1 : how === 'surveyed' ? 0.7 : 0.4;
  if (c.status === 'open') c.status = 'found';
  c.raised = false;
  c.resolvedT = c.resolvedT ?? g.clock.t;
  closeLead(g, c, false);
  const worth = Math.round(d.value * f);
  g.crown.record(c.mode === 'isle' ? 'island' : 'coast', claimName(c), g.nav.estimated, worth, g.clock.t);
  g.crown.standing += worth;
  g.crown.lifetimeStanding += worth;
  g.noteDeed('rumour.true', { target: d.name, magnitude: 0.4, silent: true, note: `Ran down the tale of ${d.name}; it was there, though not where the Casa had it.` });
  g.chart.addPlace(d.name, c.mode === 'isle' ? 'island' : 'note', g.nav.estimated, g.clock.t);
  g.logEvent('discovery', `${d.name} is found, and the Casa’s sheet was wrong about it. ${worth} renown.`, true);
  return `${d.name}: ${worth} renown, and the sheet corrected on the pilot’s own board.`;
}

/**
 * Raise a padrão on a place and enter it as the captain's claim: renown, a Fame point, and ground for a House
 * at a discount (siteDiscount). A claim already lost to the other man cannot be held.
 */
export function holdClaim(g: Game, c: Claim, spendStone: boolean): string {
  const d = claimDef(c);
  if (c.status === 'lost') return `${d.name} is entered under ${c.by ?? 'another'}’s name already.`;
  if (spendStone) {
    if (g.crown.padraoStock <= 0) return finishFind(g, c, 'surveyed') + ' There is no stone left to land.';
    g.crown.padraoStock -= 1;
    g.crown.padroesRaised += 1;
  }
  const line = finishFind(g, c, 'claimed');
  c.status = 'held';
  g.crown.record('padrao', `Padrão at ${d.name}`, g.nav.estimated, Math.round(d.value * 0.4), g.clock.t);
  g.crown.standing += Math.round(d.value * 0.5);
  g.noteDeed('claim.made', { target: d.name, magnitude: 0.8, note: `Raised a padrão at ${d.name} and entered it as my claim.` });
  return `${line} The stone is up, and the place is entered on the padrão real under your name.${c.site ? ` The Casa will grant ground at ${portDef(c.site).name} at a discount.` : ''}`;
}

/** An ocean island of a claim has been raised and named (game/state nameTheIsle). Returns an extra line, or ''. */
export function claimOnIsle(g: Game, isleId: string, landed: boolean, named: boolean): string {
  const c = g.claims.list.find((x) => x.isle === isleId);
  if (!c || c.status === 'false' || c.status === 'held') return '';
  if (c.status === 'lost') return ` The Casa has it already, under ${c.by ?? 'another'}’s name.`;
  if (landed && named && g.crown.padraoStock > 0) return ' ' + holdClaim(g, c, true);
  c.status = 'found';
  c.resolvedT = g.clock.t;
  closeLead(g, c, false);
  g.noteDeed('rumour.true', { target: claimName(c), magnitude: 0.4, silent: true, note: `Ran down the tale of ${claimName(c)}; it was there, though not where the Casa had it.` });
  return ` It is the place the tale spoke of, ${displacedWords(c)}. Found, not claimed: it wants a stone on it.`;
}

/** History found an island before the captain did (farLand.historyCatchesUp). */
export function claimTakenByHistory(g: Game, isleId: string, by: string): void {
  const c = g.claims.list.find((x) => x.isle === isleId);
  if (!c || c.status === 'held' || c.status === 'lost') return;
  const wasFound = c.status === 'found';
  c.status = 'lost';
  c.by = by;
  c.resolvedT = g.clock.t;
  closeLead(g, c, false);
  if (!wasFound) g.noteDeed('claim.lost', { target: claimName(c), magnitude: 0.4, note: `${by} found ${claimName(c)} first; the court entered it under his name.` });
}

// -- The other captain ---------------------------------------------------------------------------------------------------

/** What the rival is held to know of the ground a claim is on: the region's sheet he holds, or his average. */
export function rivalKnowOf(g: Game, c: Claim, meanLevel: number): number {
  const at = c.truth ?? { lat: c.lat, lon: c.lon };
  const region = regionOfPoint(at.lat, at.lon);
  const isCoast = c.mode === 'coast';
  return isCoast ? rivalLevel(g.rival, region, g.seed, g.clock.date.year) : meanLevel;
}

/**
 * Advance the other man's reach by `days` (game/state advanceRival calls this every tick). A real claim not
 * yet held is his when his work on it reaches `rivalAfter`; every grade of sheet he holds of its coast
 * (bought, or published) speeds that by SHEET_PACE, so a sheet sold or given is a clock wound on. A lost claim
 * is a real loss: the Ledger records it and the House site goes with it.
 */
export function advanceClaims(g: Game, days: number, meanLevel: number): string[] {
  const lost: string[] = [];
  if (g.rival.eclipsed || g.rival.ruined) return lost;
  for (const c of g.claims.list) {
    if (c.kind !== 'real' || c.status === 'held' || c.status === 'lost') continue;
    c.rivalWork += (days / 365) * (1 + SHEET_PACE * rivalKnowOf(g, c, meanLevel));
    if (c.rivalWork < c.rivalAfter) continue;
    const wasFound = c.status === 'found';
    c.status = 'lost';
    c.by = g.rival.name;
    c.resolvedT = g.clock.t;
    closeLead(g, c, false);
    g.rival.standing += 6;
    g.noteDeed('claim.lost', {
      target: claimName(c), magnitude: wasFound ? 0.6 : 0.4,
      note: `${g.rival.name} reported ${claimName(c)} first; the court entered it under his name.${wasFound ? ' You had found it, and not put a stone on it.' : ''}`,
    });
    lost.push(claimName(c));
  }
  return lost;
}

// -- Rewards ---------------------------------------------------------------------------------------------------------------

export const SITE_DISCOUNT = 0.4;

/** The fraction off a House founded at this port, if the captain holds a claim the Casa grants ground for there. */
export function siteDiscount(g: Game, portId: string | null | undefined): number {
  if (!portId) return 0;
  return g.claims.list.some((c) => c.status === 'held' && c.site === portId && !c.siteUsed) ? SITE_DISCOUNT : 0;
}

/** The House is founded: the grant is spent. */
export function useSite(g: Game, portId: string): void {
  const c = g.claims.list.find((x) => x.status === 'held' && x.site === portId && !x.siteUsed);
  if (c) c.siteUsed = true;
}
