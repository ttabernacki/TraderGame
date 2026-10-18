/**
 * Shared helpers for the headless bots (scripts/career.ts, scripts/genSaves.ts).
 *
 * Everything here goes through the Game's own public API (weighAnchor,
 * setDestination/addWaypoint, update, tradeBuy/tradeSell, resolveEvent, the
 * diplomacy table). The bot is allowed to know the truth about prices and the
 * position of ports (it is a QA bot, not a model of a pilot); the places it
 * deliberately bypasses the game's navigation are counted and reported as
 * `snaps`.
 */
import { Game } from '../../src/game/state';
import { Rng } from '../../src/core/rng';
import { NM, haversine, type LatLon } from '../../src/core/math';
import { PORTS, anchorageOf, portDef } from '../../src/world/ports';
import { provisioningCost } from '../../src/economy/market';
import { good } from '../../src/economy/goods';
import { roadBetween } from '../../src/progression/road';
import { openRuns, offered, runView, startPiece, stepPiece } from '../../src/diplomacy/table';
import { UPGRADE_BY_ID, nodeStatus, yardLevel } from '../../src/ship/upgrades';
import { isLand } from '../../src/world/landmass';
import { polityOfPort } from '../../src/diplomacy/polities';

export interface Tally {
  events: Record<string, number>;
  snaps: number;
  audiences: number;
  pieces: Record<string, number>;
  trades: number;
  notes: string[];
}
export const newTally = (): Tally => ({ events: {}, snaps: 0, audiences: 0, pieces: {}, trades: 0, notes: [] });

export const TOP_SCALE = 8;

/** Start a game the way the title screen does, docked at Lisbon with the clock free. */
export function newGame(seed: number): Game {
  const g = new Game(seed);
  g.mode = 'port';
  g.clock.paused = false;
  return g;
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

const GOOD_WORDS = /stand on|press on|carry on|continue|go on|sail on|ignore|take it|accept|kiss|for the pepper|read it|write your/i;
const BAD_WORDS = /abandon|scuttle|mutin|hang |flog|surrender|burn|turn back|heave to|strike/i;

export function pickChoice(e: { choices?: { label: string }[] }): number {
  const cs = e.choices ?? [];
  const good = cs.findIndex((c) => GOOD_WORDS.test(c.label));
  if (good >= 0) return good;
  const ok = cs.findIndex((c) => !BAD_WORDS.test(c.label));
  return ok >= 0 ? ok : 0;
}

/** Answer whatever is pending. Returns true if something was answered. */
export function answerScenes(g: Game, t: Tally, limit = 20): boolean {
  let did = false;
  for (let i = 0; i < limit && g.pendingEvent; i++) {
    const e = g.pendingEvent;
    t.events[e.id] = (t.events[e.id] ?? 0) + 1;
    if (!e.choices || e.choices.length === 0) { g.pendingEvent = null; did = true; continue; }
    g.resolveEvent(pickChoice(e));
    did = true;
  }
  if (g.clock.scaleIndex < 1) g.clock.scaleIndex = TOP_SCALE;
  return did;
}

// ---------------------------------------------------------------------------
// Diplomacy
// ---------------------------------------------------------------------------

/**
 * The solver bot of scripts/silent.ts, generalised: pick the first enabled
 * choice that is not an obvious walk-away, 'go' once offered. Good enough to
 * drive any piece to an outcome without exceptions; it does not try to win.
 */
export function playPiece(g: Game, run: any, rng: Rng): string {
  for (let i = 0; i < 80; i++) {
    const v = runView(g, run);
    if (!v) return 'noview';
    const opts = v.choices.filter((c) => !c.disabled);
    if (opts.length === 0) return 'nochoice';
    const pick = opts.find((c) => c.id === 'go') ?? opts.find((c) => c.id.startsWith('lay:')) ?? rng.pick(opts);
    const o = stepPiece(g, run, pick.id);
    if (o) return o.grade;
  }
  return 'stuck';
}

/** At a court that offers a piece, play one. */
export function audienceHere(g: Game, t: Tally, rng: Rng): void {
  const port = g.dockedAt;
  if (!port) return;
  const pol = polityOfPort(port);
  if (!pol) return;
  for (const run of openRuns(g, pol.id)) {
    const r = playPiece(g, run, rng);
    t.pieces[`${run.pieceId}:${r}`] = (t.pieces[`${run.pieceId}:${r}`] ?? 0) + 1;
    t.audiences++;
  }
  const ps = offered(g, pol.id);
  if (ps.length > 0 && openRuns(g, pol.id).length === 0) {
    const run = startPiece(g, ps[0].id, pol.id, port);
    if (run) {
      const r = playPiece(g, run, rng);
      t.pieces[`${ps[0].id}:${r}`] = (t.pieces[`${ps[0].id}:${r}`] ?? 0) + 1;
      t.audiences++;
    }
  }
}

// ---------------------------------------------------------------------------
// Port business
// ---------------------------------------------------------------------------

export function victual(g: Game, want = 90): void {
  const def = g.portHere;
  if (!def) return;
  const cost = Math.round(provisioningCost(def, want, g.crew.count));
  if (g.crown.gold < cost) g.drawCredit(cost);
  if (g.crown.gold >= cost) g.provision(want, cost);
  else {
    const d = 30;
    const c2 = Math.round(provisioningCost(def, d, g.crew.count));
    if (g.crown.gold >= c2) g.provision(d, c2);
  }
  if (g.crew.count < g.crew.complement) g.shipHands(g.crew.complement - g.crew.count);
}

/** Sell what pays, buy what the next port will pay more for. */
export function trade(g: Game, nextPort: string | null, t: Tally): void {
  const here = g.dockedAt;
  if (!here) return;
  // Sell every lot that does not lose money here, or that has been carried a long way.
  for (const lot of [...g.ship.cargo]) {
    const l = g.marketHere().find((x) => x.goodId === lot.goodId);
    if (!l) continue;
    if (lot.cost === 0 || l.bid >= lot.cost * 0.98 || here === 'lisboa') {
      const r = g.tradeSell(lot.goodId, lot.quantity);
      if (r.ok) t.trades++;
    }
  }
  if (!nextPort) return;
  const rows = g.marketHere().filter((l) => l.stock > 1 && !l.casa);
  const there = g.markets.listings(nextPort, g.clock.t, 0, 0, rows.map((r) => r.goodId));
  const scored = rows
    .map((l) => {
      const o = there.find((x) => x.goodId === l.goodId);
      return { l, margin: o ? (o.bid - l.ask) / l.ask : -1, bulk: good(l.goodId).bulk };
    })
    .filter((s) => s.margin > 0.2)
    .sort((a, b) => b.margin - a.margin);
  let budget = g.crown.gold * 0.7;
  for (const s of scored) {
    if (g.ship.holdFree < 0.5 || budget < 5) break;
    const qty = Math.min(Math.floor(budget / s.l.ask), Math.floor(g.ship.holdFree / s.bulk), s.l.stock);
    if (qty < 1) continue;
    const r = g.tradeBuy(s.l.goodId, qty);
    if (r.ok) { t.trades++; budget -= qty * s.l.ask; }
  }
}

/** Make her sound if the yard is worth anything (the Yard card of the port screen, same arithmetic). */
export function repair(g: Game): void {
  const def = g.portHere;
  if (!def || g.ship.condition.hull > 0.9) return;
  const refit = Math.min(1, Math.max(0.15, def.refit));
  const full = Math.ceil((1 - g.ship.condition.hull) * 900 / refit);
  if (g.crown.gold < full) g.drawCredit(full - g.crown.gold);
  // A poor yard still does what the purse buys: a part-repair in proportion.
  const spend = Math.min(full, Math.floor(g.crown.gold * 0.9));
  if (spend < 20) return;
  g.crown.gold -= spend;
  g.ship.repair((spend / full) * (1 - g.ship.condition.hull));
  for (const s of g.ship.state.sails) s.condition = 1;
  g.clock.t += 86400 * 8;
}

/** Scrape her bottom where there is a yard that does it (the 'breame' service of the yard card). */
export function careen(g: Game): void {
  const def = g.portHere;
  if (!def || g.ship.condition.fouling < 0.45) return;
  const u = UPGRADE_BY_ID.get('breame');
  if (!u) return;
  const st = nodeStatus(u, g.ship.upgrades, g.ship.hullId, g.crown.lifetimeStanding, yardLevel(def));
  if (st.state !== 'open' || g.crown.gold < u.cost * 1.2) return;
  g.crown.gold -= u.cost;
  g.ship.condition.fouling = 0;
  g.ship.applyRigConversion();
  g.ship.refreshDerived();
  g.waitDays(u.days);
}

/** The King's commission: take the one the act asks for, else the best-paying. */
export function takeCommission(g: Game): void {
  if (g.crown.patent) return;
  const offers = g.commissionOffers();
  if (offers.length === 0) return;
  const p = offers[0];
  g.crown.accept(p, g.clock.t);
  g.layCourseForCommission();
  g.crown.hasKingsLetter = true;
}

/** Everything a bot does on a quay. */
export function atQuay(g: Game, next: string | null, t: Tally, rng: Rng): void {
  answerScenes(g, t);
  if (g.dockedAt === 'lisboa') takeCommission(g);
  audienceHere(g, t, rng);
  trade(g, next, t);
  repair(g);
  careen(g);
  victual(g, bigStores(g));
  answerScenes(g, t);
}

/** Days of stores for the next leg: more beyond the Line. */
export function bigStores(g: Game): number {
  return g.ship.state.pos.lat < 0 || g.ship.state.pos.lon > 20 ? 150 : 90;
}

// ---------------------------------------------------------------------------
// Sailing
// ---------------------------------------------------------------------------

export interface Leg { ok: boolean; days: number; steps: number; snapped: number; why: string }

function _thin(pts: LatLon[], maxMarks: number): LatLon[] {
  if (pts.length <= maxMarks) return pts;
  const out: LatLon[] = [];
  for (let i = 0; i < maxMarks; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (maxMarks - 1))]);
  return out;
}

/** Lay a passage through the given marks (last one the port) and sail it. */
export function sailMarks(g: Game, marks: LatLon[], destId: string, t: Tally, maxDays = 400): Leg {
  const t0 = g.clock.t;
  const w = g.weighAnchor();
  if (g.dockedAt) return { ok: false, days: 0, steps: 0, snapped: 0, why: `cannot weigh: ${w}` };
  g.mode = 'sailing';
  g.pumpEffort = 1;
  const dest = portDef(destId);
  const rest = marks.slice();
  const label = (m: LatLon) => (m === marks[marks.length - 1] ? dest.name : 'Mark');
  const lay = (m: LatLon, first: boolean) => {
    const last = m === marks[marks.length - 1];
    if (first) g.setDestination(label(m), m.lat, m.lon, last ? destId : undefined);
    else g.addWaypoint(label(m), m.lat, m.lon, last ? destId : undefined);
  };
  lay(rest.shift()!, true);
  while (rest.length && g.route.length < 10) lay(rest.shift()!, false);
  g.clock.scaleIndex = TOP_SCALE;
  let steps = 0;
  let snapped = 0;
  let bestToMark = Infinity;
  let lastProgressStep = 0;
  let groundings = 0;
  const target = anchorageOf(dest);
  let why = '';
  while (steps < maxDays * 24 + 200) {
    const grounded = g.pendingEvent?.id === 'aground';
    answerScenes(g, t);
    if ((g.mode as string) === 'gameover') { why = 'gameover'; break; }
    // Aground twice running is the bot's seamanship, not the game's: lift her over the bank.
    if (grounded) { groundings++; if (groundings % 2 === 0) lastProgressStep = -1e9; }
    g.clock.scaleIndex = TOP_SCALE;
    g.update(0.25);
    steps++;
    if (g.approachablePorts().some((p) => p.def.id === destId)) {
      g.letGoAnchor();
      if (g.dockedAt === destId) return { ok: true, days: (g.clock.t - t0) / 86400, steps, snapped, why: 'docked' };
    }
    while (rest.length && g.route.length < 6) lay(rest.shift()!, false);
    // Stuck detection: the next mark is not getting closer for ten days.
    const next = g.route[0];
    if (next) {
      const d = haversine(g.ship.state.pos, next) / NM;
      if (d < bestToMark - 25) { bestToMark = d; lastProgressStep = steps; }
      if (d < 6 && g.route.length > 1) { g.route.shift(); bestToMark = Infinity; lastProgressStep = steps; }
    } else if (steps - lastProgressStep > 48) {
      // Out of marks and no port: run in on the port itself.
      g.setDestinationPort(destId);
      lastProgressStep = steps;
    }
    if (steps - lastProgressStep > 24 * 6) {
      // The bot's one cheat: carry her past whatever is holding her.
      snapped++;
      t.snaps++;
      const m = g.route.length > 1 ? g.route.shift()! : { ...target };
      g.ship.state.pos = { lat: m.lat, lon: m.lon };
      g.nav.estimated = { lat: m.lat, lon: m.lon };
      bestToMark = Infinity;
      lastProgressStep = steps;
      if (g.route.length === 0) {
        g.setDestinationPort(destId);
      }
    }
  }
  if (!why) why = 'timeout';
  return { ok: false, days: (g.clock.t - t0) / 86400, steps, snapped, why };
}


// ---------------------------------------------------------------------------
// A bot-local sea router. The game has no pathfinder (the player lays marks by
// hand), so the bot finds open-water marks on a coarse land mask: A* on 0.5
// degree cells with a one-cell clearance from land, then string-pulled.
// ---------------------------------------------------------------------------

const CELL = 0.5;
const LAT0 = -45, LAT1 = 50, LON0 = -35, LON1 = 100;
const NI = Math.round((LAT1 - LAT0) / CELL), NJ = Math.round((LON1 - LON0) / CELL);
let mask: Uint8Array | null = null; // 1 = open water with clearance

const cellAt = (p: LatLon): [number, number] => [Math.floor((p.lat - LAT0) / CELL), Math.floor((p.lon - LON0) / CELL)];
const centre = (i: number, j: number): LatLon => ({ lat: LAT0 + (i + 0.5) * CELL, lon: LON0 + (j + 0.5) * CELL });

function buildMask(): Uint8Array {
  const land = new Uint8Array(NI * NJ);
  for (let i = 0; i < NI; i++) for (let j = 0; j < NJ; j++) {
    const c = centre(i, j);
    // Four corners and the centre: a cell with any land in it is land.
    const h = CELL / 2;
    land[i * NJ + j] = [c, { lat: c.lat + h, lon: c.lon + h }, { lat: c.lat - h, lon: c.lon + h },
      { lat: c.lat + h, lon: c.lon - h }, { lat: c.lat - h, lon: c.lon - h }].some(isLand) ? 1 : 0;
  }
  const m = new Uint8Array(NI * NJ);
  for (let i = 0; i < NI; i++) for (let j = 0; j < NJ; j++) {
    let ok = 1;
    for (let di = -1; di <= 1 && ok; di++) for (let dj = -1; dj <= 1; dj++) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= NI || b >= NJ || land[a * NJ + b]) { ok = 0; break; }
    }
    m[i * NJ + j] = ok;
  }
  return m;
}

function clear(a: LatLon, b: LatLon): boolean {
  const n = Math.max(2, Math.ceil(Math.max(Math.abs(b.lat - a.lat), Math.abs(b.lon - a.lon)) / 0.1));
  for (let k = 0; k <= n; k++) {
    const p = { lat: a.lat + ((b.lat - a.lat) * k) / n, lon: a.lon + ((b.lon - a.lon) * k) / n };
    const [i, j] = cellAt(p);
    if (i < 0 || j < 0 || i >= NI || j >= NJ || !mask![i * NJ + j]) return false;
  }
  return true;
}

function nearestOpen(p: LatLon): [number, number] {
  const [i0, j0] = cellAt(p);
  for (let r = 0; r < 40; r++) {
    let best: [number, number] | null = null; let bd = Infinity;
    for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) {
      if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r) continue;
      if (i < 0 || j < 0 || i >= NI || j >= NJ || !mask![i * NJ + j]) continue;
      const d = (i - i0) ** 2 + (j - j0) ** 2;
      if (d < bd) { bd = d; best = [i, j]; }
    }
    if (best) return best;
  }
  return [i0, j0];
}

const TAGUS_OFFING: LatLon = { lat: 38.6, lon: -9.6 };
const nearLisbon = (p: LatLon): boolean => haversine(p, anchorageOf(portDef('lisboa'))) / NM < 6;

/** Marks in open water from `from` to just off `to` (not including `to`). */
export function seaRoute(from: LatLon, to: LatLon): LatLon[] {
  // The Tagus mouth has a bar and a peninsula either side; the coarse mask cannot see it.
  if (nearLisbon(from) && !nearLisbon(to)) return [TAGUS_OFFING, ...seaRoute(TAGUS_OFFING, to)];
  if (nearLisbon(to) && !nearLisbon(from)) return [...seaRoute(from, TAGUS_OFFING), TAGUS_OFFING];
  mask ??= buildMask();
  const [si, sj] = nearestOpen(from);
  const [gi, gj] = nearestOpen(to);
  const idx = (i: number, j: number) => i * NJ + j;
  const g = new Float64Array(NI * NJ).fill(Infinity);
  const prev = new Int32Array(NI * NJ).fill(-1);
  const open: [number, number][] = [[0, idx(si, sj)]]; // [f, node], small binary-free list
  g[idx(si, sj)] = 0;
  const h = (i: number, j: number) => Math.hypot(i - gi, (j - gj) * Math.cos(((LAT0 + i * CELL) * Math.PI) / 180));
  const closed = new Uint8Array(NI * NJ);
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
    const [, n] = open.splice(bi, 1)[0];
    if (closed[n]) continue;
    closed[n] = 1;
    const i = Math.floor(n / NJ), j = n % NJ;
    if (i === gi && j === gj) break;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= NI || b >= NJ || !mask[idx(a, b)]) continue;
      const ng = g[n] + Math.hypot(di, dj * Math.cos(((LAT0 + i * CELL) * Math.PI) / 180));
      if (ng < g[idx(a, b)]) { g[idx(a, b)] = ng; prev[idx(a, b)] = n; open.push([ng + h(a, b), idx(a, b)]); }
    }
  }
  const path: LatLon[] = [];
  for (let n = idx(gi, gj); n >= 0; n = prev[n]) path.push(centre(Math.floor(n / NJ), n % NJ));
  path.reverse();
  if (path.length === 0 || g[idx(gi, gj)] === Infinity) return [];
  // String-pull.
  const out: LatLon[] = [];
  let cur = from;
  let k = 0;
  const pts = [...path, to];
  while (k < pts.length - 1) {
    let far = k;
    for (let m = pts.length - 1; m > k; m--) if (m === pts.length - 1 ? clear(cur, pts[m]) || m === k + 1 : clear(cur, pts[m])) { far = m; break; }
    if (far === k) far = k + 1;
    if (far < pts.length - 1) { out.push(pts[far]); cur = pts[far]; }
    k = far;
  }
  return out;
}

/** Port to port along the trunk road (outward or inward). */
export function sailRoad(g: Game, destId: string, t: Tally, maxDays = 400): Leg {
  const from = g.ship.state.pos;
  const to = anchorageOf(portDef(destId));
  // Trunk ports we are not stopping at are dropped; the Cape's turning points stay.
  void roadBetween;
  return sailMarks(g, [...seaRoute(from, to), to], destId, t, maxDays);
}

/** Home by the volta: the game's own homeward passage, sailed by hand. */
export function sailHomeward(g: Game, t: Tally, maxDays = 400): Leg {
  const road = g.homewardPassage();
  if (!road) return { ok: true, days: 0, steps: 0, snapped: 0, why: 'home' };
  // The pilot's volta marks, joined by the bot's router so no leg crosses a coast.
  const pts: LatLon[] = [];
  let cur = g.ship.state.pos;
  for (const m of road.legs.slice(1)) { pts.push(...seaRoute(cur, m), m); cur = m; }
  return sailMarks(g, pts, 'lisboa', t, maxDays);
}

export { PORTS };
