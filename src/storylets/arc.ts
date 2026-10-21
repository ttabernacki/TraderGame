import { NM, clamp, haversine, type LatLon } from '../core/math';
import { POLITY_BY_ID } from '../diplomacy/polities';
import type { SeaChoice, SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';
import type { Tag as LedgerTag } from '../ledger/tags';
import { prevailingWind } from '../world/wind';
import { currentAt } from '../world/currents';
import { anchorageOf, portDef } from '../world/ports';
import { allHold } from './qualities';
import type { Expiry, Kind, Place, Quarter, Req } from './types';

/**
 * The arc kit: what a long story is made of, and the authoring sugar its scenes use.
 *
 * An ARC is a named set of storylets that share qualities (the thread's record, `g.quests`, keeps its journal, its
 * flags and its outcome; `story.<arc>.*` and `open.<arc>.<step>` read it as qualities). Each STEP is one storylet: it
 * says where it is had (`at`), what else must be so (`needs`), which steps its answer opens (`hooks`), and, if the
 * world can move on without it, when (`expires`). `go()` opens the next step, `end()` closes the arc and writes the
 * Ledger. The thread's `step` pointer survives in the save as the arc's open beat, so a story in flight when this
 * engine arrived goes on from where it stood (`resolveOldSaves`).
 */

export type QuestId = 'caravel' | 'leak' | 'kongo' | 'prester' | 'zamorin' | 'galeao'
  | 'nome' | 'ficheiro' | 'roteiro' | 'escudeiro'
  | 'adrift' | 'pesos' | 'padrao' | 'mercador' | 'monsoon' | 'aprendiz' | 'sofala' | 'count' | 'feitorcal' | 'mappila' | 'malay' | 'pepperrace' | 'feverfleet' | 'kingsoffer' | 'pepperhouse';

export interface QuestState {
  id: QuestId;
  step: string;
  /** When the current step began. */
  stepT: number;
  /** Legacy: the old machinery's "put and not answered" mark. The engine keeps this in `g.web.fired` now. */
  fired: boolean;
  flags: Record<string, number | string | boolean>;
  started: number;
  journal: { t: number; text: string }[];
  /** Set when the thread is finished, one way or another. */
  outcome?: string;
}

export interface QuestMarker { lat: number; lon: number; nm: number; label: string }

export interface Step {
  /** What the captain is to do, for the journal. */
  goal: (g: Game, q: QuestState) => string;
  /** Where on the chart. */
  marker?: (g: Game, q: QuestState) => QuestMarker | null;
  /** Where this beat is had. */
  at: Place;
  /** What else must be so (qualities); the arc's own open beat is implied. */
  needs?: Req[];
  /** The steps this one's answer may open (the arc's graph). `end` is not a hook. */
  hooks: string[];
  /** Web qualities (`flag.*`) the answer writes. */
  writes?: string[];
  kind?: Kind;
  priority?: number;
  quarter?: Quarter;
  /** Met on the voyage home, carrying what the beat is about. */
  homeward?: boolean;
  carries?: string;
  /** The door that closes when the world moves on, and what is left to settle. */
  expires?: { when: Req; settle: (g: Game, q: QuestState) => string };
  scene: (g: Game, q: QuestState) => SeaEvent;
}

export interface QuestDef {
  id: QuestId;
  title: string;
  /** One line for the journal and the offer card. */
  blurb: string;
  /** Ports where the thread can be picked up. */
  offeredAt: string[];
  /** What must be so for it to be offered (qualities). */
  requires: Req[];
  /** Derived from `requires` by `thread()`. */
  available: (g: Game) => boolean;
  /** Who is asking, and what for — the offer card in the town. */
  offer: (g: Game) => { who: string; text: string; accept: string };
  /** Merged into the Fronts' texture: nobody asks, the first beat is a person met, and the thread is taken up as he is heard. */
  auto?: boolean;
  first: string;
  steps: Record<string, Step>;
}

export function thread(d: Omit<QuestDef, 'available'>): QuestDef {
  return { ...d, available: (g) => allHold(g, d.requires, d.id) };
}

// ---------------------------------------------------------------------------
// The registry (set by progression/quests, read by go/end for the title)

const REGISTRY = new Map<QuestId, QuestDef>();
export function registerArcs(defs: Record<string, QuestDef>): void {
  for (const d of Object.values(defs)) REGISTRY.set(d.id, d);
}
export const defOf = (id: QuestId): QuestDef => REGISTRY.get(id)!;

// ---------------------------------------------------------------------------
// Helpers the scenes share

export const DAY = 86400;

/** What the purse and the renown stood at when the scene now being answered was put. */
let snap = { gold: 0, standing: 0 };
export function markSnap(g: Game): void { snap = { gold: g.crown.gold, standing: g.crown.lifetimeStanding }; }

/** "+120 cruzados, +25 renown" for what the last scene changed, or an empty string. */
function whatChanged(g: Game): string {
  const parts: string[] = [];
  const gold = Math.round(g.crown.gold - snap.gold);
  const st = Math.round(g.crown.lifetimeStanding - snap.standing);
  if (gold) parts.push(`${gold > 0 ? '+' : '−'}${Math.abs(gold)} cruzados`);
  if (st) parts.push(`${st > 0 ? '+' : '−'}${Math.abs(st)} renown`);
  return parts.join(', ');
}

/**
 * What a finished thread did, in the Ledger's vocabulary. Outcomes not listed
 * here are only recorded as `thread.closed`; the ones that were a choice about
 * word, weights, charts or mercy are also entered under their own tag.
 */
export interface OutcomeDeed { tag: LedgerTag; target: string; magnitude?: number; when?: (q: QuestState) => boolean }
const D = (tag: LedgerTag, target: string, magnitude: number, when?: (q: QuestState) => boolean): OutcomeDeed => ({ tag, target, magnitude, when });
export const OUTCOME_DEEDS: Record<string, OutcomeDeed[]> = {
  'kongo:enforced': [D('promise.kept', 'kongo', 0.8)],
  'kongo:lookedaway': [D('promise.broken', 'kongo', 0.5)],
  // The Kilwa promise (`flag.promise.kilwa.first_call`) is kept or broken by what is done at Çofala; without it, the road to
  // Çofala shown to the Crown is only a sheet given, and fair trading is only fair trading.
  'sofala:fair': [D('promise.kept', 'kilwa', 0.7, (q) => !!q.flags.promise)],
  'sofala:route': [D('promise.broken', 'kilwa', 0.6, (q) => !!q.flags.promise), D('chart.shared', 'portugal', 0.5)],
  'pesos:cheat': [D('weights.false', 'eguafo', 0.8)],
  'pesos:inland': [D('weights.fair', 'eguafo', 0.7)],
  'pesos:report': [D('weights.fair', 'eguafo', 0.6)],
  'pesos:repaid': [D('weights.fair', 'eguafo', 0.6)],
  'monsoon:freed': [D('companion.freed', 'Malemo', 0.9)],
  'monsoon:kept': [D('companion.kept', 'Malemo', 0.6)],
  'roteiro:sold': [D('chart.sold', 'nation:foreign', 0.7)],
  'roteiro:crown': [D('chart.shared', 'portugal', 0.6)],
  'roteiro:named': [D('chart.shared', 'portugal', 0.5)],
  'count:caught': [D('smuggle.caught', 'portugal', 0.8)],
  'count:got away': [D('smuggle.escaped', 'portugal', 0.4)],
  'count:declared': [D('parcel.redeemed', 'portugal', 0.7)],
  'escudeiro:honest': [D('patron.honest', 'portugal', 0.7)],
  'escudeiro:flattered': [D('patron.flattered', 'portugal', 0.5)],
  'adrift:boy': [D('mercy.shown', 'Arguim', 0.7)],
  'adrift:left': [D('ship.abandoned', 'Nossa Senhora da Ajuda', 0.6)],
  'mercador:freely': [D('passenger.aided', 'malindi', 0.6)],
  'mercador:pilotage': [D('passenger.aided', 'malindi', 0.4)],
  'aprendiz:chose': [D('mercy.shown', 'Nuno', 0.5)],
  'feverfleet:nursed': [D('mercy.shown', 'the São Vicente', 0.9)],
  'caravel:mass': [D('mercy.shown', 'Isabel da Costa', 0.6)],
};

/** Whether the Ledger already says this outcome (so the epilogue need not say it twice). */
export function ledgerSays(questId: string, outcome: string): boolean {
  return `${questId}:${outcome}` in OUTCOME_DEEDS;
}

export function firstSentence(s: string): string {
  const i = s.search(/[.!?](\s|$)/);
  return i > 0 ? s.slice(0, i + 1) : s;
}

/** Open the next beat. The arc's step pointer moves; `open.<arc>.<next>` is now true. */
export function go(g: Game, q: QuestState, next: string, line: string): string {
  q.step = next;
  q.stepT = g.clock.t;
  q.fired = false;
  q.journal.push({ t: g.clock.t, text: line });
  g.pushAlert(`${defOf(q.id).title}: ${firstSentence(line)}`, 'note');
  return line;
}

/** Close the arc: its outcome is a quality (`story.<arc>.outcome`) and the Ledger says what it did. */
export function end(g: Game, q: QuestState, outcome: string, line: string, after?: () => void): string {
  q.outcome = outcome;
  q.fired = false;
  for (const deed of OUTCOME_DEEDS[`${q.id}:${outcome}`] ?? []) {
    if (!deed.when || deed.when(q)) g.noteDeed(deed.tag, { target: deed.target, magnitude: deed.magnitude, note: line });
  }
  g.noteDeed('thread.closed', { target: q.id, note: `${defOf(q.id).title}: ${outcome}. ${line}` });
  after?.();
  const change = whatChanged(g);
  q.journal.push({ t: g.clock.t, text: change ? `${line} (${change})` : line });
  g.logEvent('crown', `${defOf(q.id).title} — ${line}`, true);
  g.pushAlert(`${defOf(q.id).title} is finished${change ? `: ${change}` : ''}.`, 'note');
  for (const fn of ENDINGS) fn(g);
  return line;
}

/** Things that must be re-read when an arc closes (the price mods of the finished threads). */
const ENDINGS: ((g: Game) => void)[] = [];
export function onArcEnd(fn: (g: Game) => void): void { ENDINGS.push(fn); }

/** Leave the beat open, to be had again at the next call. */
export function later(q: QuestState, line: string): string {
  q.fired = false;
  return line;
}

export function renown(g: Game, n: number): void {
  g.crown.standing += n;
  g.crown.lifetimeStanding += n;
}

export function hasOfficer(g: Game, role: string): string | null {
  const o = g.crew.officers.find((x) => x.alive && !x.ashoreAt && x.role === role);
  return o ? o.name : null;
}

export function near(g: Game, at: LatLon, nm: number): boolean {
  return haversine(g.ship.state.pos, at) / NM <= nm;
}

export function scene(
  q: QuestState, step: string, title: string, text: string, choices: SeaChoice[],
  severity: SeaEvent['severity'] = 'note',
): SeaEvent {
  return { id: `quest:${q.id}:${step}`, title, text, severity, choices, council: false };
}

export function portMark(id: string, label: string, nm = 25): QuestMarker {
  const a = anchorageOf(portDef(id));
  return { lat: a.lat, lon: a.lon, nm, label };
}

/**
 * Fill the book with a region's winds and currents, month by month — what a
 * pilot who had sailed it for years would have written down.
 */
export function writeTheSea(g: Game, lat0: number, lat1: number, lon0: number, lon1: number): number {
  let squares = 0;
  for (let lat = lat0; lat < lat1; lat += 5) {
    for (let lon = lon0; lon < lon1; lon += 5) {
      const p = { lat: lat + 2.5, lon: lon + 2.5 };
      for (let m = 1; m <= 12; m++) {
        const doy = Math.round((m - 0.5) * 30.4);
        const w = prevailingWind(p, doy, 0);
        const c = currentAt(p, doy);
        g.rutter.observeSea(p, m, w.from, w.speed, c.toward, c.knots, 40);
      }
      squares++;
    }
  }
  return squares;
}

/** Leave to trade across a whole state, as an audience would give it, and the court's opinion with it. */
export function leaveToTrade(g: Game, polity: string, d: { trust?: number; respect?: number; interest?: number }, why: string): void {
  const pol = POLITY_BY_ID.get(polity);
  if (!pol) return;
  const st = g.polityState(polity);
  st.met = true;
  for (const id of pol.ports) { const r = g.relationsFor(id); r.met = true; r.mayTrade = true; }
  g.adjustPolity(polity, d, why);
}

/** The Cochin alliance, written into the courts: an ally against the Zamorin, and ground for a factory. */
export function allyWithCochin(g: Game): void {
  leaveToTrade(g, 'cochin', { trust: 0.3, interest: 0.2 }, 'allied with you against the Zamorin');
  g.relationsFor('cochim').factory = true;
  if (!g.diplomacy.agreements.some((a) => a.polity === 'cochin' && a.kind === 'ally' && a.status === 'open')) {
    g.diplomacy.agreements.push({
      id: g.diplomacy.nextId++, polity: 'cochin', kind: 'ally', against: 'calicut',
      text: 'Stand with Cochin against Calicut', made: g.clock.t, status: 'open',
    });
  }
  g.adjustPolity('calicut', { trust: -0.25 }, 'allied with Cochin against them');
}

/** A thread's outcome, as another thread's scene reads it. */
export function outcomeOf(g: Game, id: QuestId): string | undefined {
  return g.quests.find((q) => q.id === id)?.outcome;
}

/** A roll drawn from the game's own generator, so the scene is repeatable from a save. */
export function roll(g: Game): number { return g.rng.next(); }

export { clamp };
export type { Expiry };
