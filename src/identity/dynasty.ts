import { Rng } from '../core/rng';
import { POLITY_BY_ID } from '../diplomacy/polities';
import { applySuccession, planSuccession, type SuccessionPlan } from '../company/succession';
import type { Game } from '../game/state';
import { decayed, record, weightAt, type Entry } from '../ledger/ledger';
import type { OriginId } from '../progression/origins';
import { FRONTS } from '../world/powers/data';
import { migratePowers } from '../world/powers/core';
import type { FrontId, PowersState } from '../world/powers/types';
import { CALLINGS } from './calling';
import { CLAUSES, activeClauses, onGrant, type ClauseKind } from './clauses';
import { cleanName, familyOf, generateName, heirGiven, otherFamily } from './names';
import { PATRONS } from './patrons';
import { PATRON_IDS, newPatronRec, type CallingId, type HeirRec, type InheritedTitle, type PatronId, type Relation } from './state';
import { TITLE_BY_ID } from './titles';

/**
 * Dynasty-lite (BUILD_PLAN E2): the career as a line, and nothing more than `Game.inheritFrom` extended. There is no
 * multi-life structure: an heir is a new Game that is handed, by data rules, what a family actually keeps.
 *
 *   The heir      a person: a name from the origin's pool (a given name not his father's, the family name unless he puts it
 *                 off), a relation and an age. He chooses his own Calling at Act II.
 *   Titles        the one worn title of the father's that weighed most is carried as "a name your father had", at 0.4 of its
 *                 effect and with no door shut by it; the others are not carried and are earned again, or not.
 *   Patrons       a patron's favour toward the father is halved; one that stood well with him receives the heir at a first
 *                 meeting (favour at least 0.2); one that was ruined or hostile is shut for two years.
 *   Ledger        entries older than eight years fade by `decayed()`, those past sixteen are gone; what is kept is moved back in
 *                 time so that it lies before the heir's first day (`Entry.inh` keeps the true date), and the heir's own titles,
 *                 chronicles and muster read his own entries only.
 *   Fronts        persist: the stage the father left is the stage the heir starts in. The history schedule's dated shocks are not
 *                 run again, the news is stale, and what was in the air (embargoes, wars) is carried at its remaining length.
 *   Clauses       a grant still in force is carried at half its remaining term.
 *   Company       `company/succession`.
 *   Repudiation   the heir may put the name off: he takes another, and with it neither the name at court, the title, the
 *                 patrons' memory nor the clauses; the Ledger fades to a quarter and half the purse goes. The chart, the Houses
 *                 and the world stay: those were never the name's.
 *
 * All of the numbers and the relation weights are INVENTED (docs/SOURCES.md).
 */

const YEAR = 365.25 * 86400;
const MONTH = 30 * 86400;

export interface PatronStance { id: PatronId; name: string; stance: 'receives' | 'cool' | 'closed'; favour: number }
export interface ClauseCarry { kind: ClauseKind; polity: string; polityName: string; name: string; poisoned: boolean; years: number; id: number }
export interface FrontNote { id: FrontId; name: string; stage: number; stageName: string }

export interface InheritPlan {
  repudiate: boolean;
  origin: OriginId;
  person: { given: string; family: string; name: string; relation: Relation; age: number; father: string };
  generation: number;
  purse: number;
  standing: number;
  points: number;
  stations: number;
  lines: number;
  lordship: string | undefined;
  coverage: number;
  ledger: { kept: number; faded: number; gone: number };
  clauses: ClauseCarry[];
  title: { id: string; english: string; name: string } | null;
  patrons: PatronStance[];
  fronts: FrontNote[];
  succession: SuccessionPlan;
  fatherCalling: CallingId | null;
  /** The plain-words list the heir card shows and the heir keeps. */
  words: string[];
}

export interface InheritOpts { repudiate?: boolean; origin?: OriginId; name?: string }

/** The heir's origin: a fidalgo if the line reached 400 renown, otherwise the father's. */
export const heirOrigin = (old: Game): OriginId => (old.crown.lifetimeStanding >= 400 ? 'fidalgo' : old.origin);

const RELATIONS: [Relation, number][] = [['son', 0.6], ['nephew', 0.2], ['natural son', 0.12], ['ward', 0.08]];
const pickRelation = (rng: Rng): Relation => {
  let x = rng.next();
  for (const [r, w] of RELATIONS) { if (x < w) return r; x -= w; }
  return 'son';
};

export const fatherNameOf = (old: Game): string => old.identity.name || generateName(old.origin, new Rng(old.seed));

/** The worn title that weighed most with the world: the sum of what it did at courts and with patrons. */
export function pickInheritedTitle(old: Game): { id: string; english: string; name: string } | null {
  let best: { id: string; w: number } | null = null;
  for (const id of old.identity.worn) {
    const t = TITLE_BY_ID.get(id);
    if (!t) continue;
    let w = 0.01;
    for (const d of Object.values(t.courts ?? {})) w += Math.abs(d.trust ?? 0) + Math.abs(d.respect ?? 0) + Math.abs(d.interest ?? 0);
    for (const v of Object.values(t.patron ?? {})) w += Math.abs(v ?? 0);
    w += Math.abs((t.hire ?? 1) - 1);
    if (!best || w > best.w) best = { id, w };
  }
  const t = best ? TITLE_BY_ID.get(best.id) : null;
  return t ? { id: t.id, english: t.english, name: t.name } : null;
}

function patronStance(old: Game, id: PatronId, repudiate: boolean): PatronStance {
  const rec = old.identity.patrons[id];
  const name = PATRONS[id].name;
  if (repudiate) return { id, name, stance: 'cool', favour: 0 };
  if (rec.ruined !== null || rec.grudge >= 0.5 || rec.favour <= -0.5) return { id, name, stance: 'closed', favour: Math.min(rec.favour * 0.5, -0.25) };
  if (rec.favour >= 0.25) return { id, name, stance: 'receives', favour: Math.max(0.2, rec.favour * 0.6) };
  return { id, name, stance: 'cool', favour: rec.favour * 0.5 };
}

/** The clauses of the father still in force at the hand-off, each at half what was left of its term (at least half a year). */
export function carriedClauses(old: Game): ClauseCarry[] {
  const out: ClauseCarry[] = [];
  let id = 0;
  for (const c of activeClauses(old.ledger, old.clock.t)) {
    const left = c.until - old.clock.t;
    if (left < 1 * YEAR) continue;
    const pol = POLITY_BY_ID.get(c.polity);
    out.push({
      kind: c.kind, polity: c.polity, polityName: pol?.name ?? c.polity, name: CLAUSES[c.kind].name, poisoned: c.poisoned,
      years: Math.round((left / 2 / YEAR) * 10) / 10, id: id++,
    });
  }
  return out;
}

/** What the heir will be handed. Pure: it reads the father's game and changes nothing, so the card and the hand-off agree. */
export function planInheritance(old: Game, opt: InheritOpts = {}): InheritPlan {
  const repudiate = opt.repudiate ?? old.identity.heirStance === 'repudiate';
  const origin = opt.origin ?? heirOrigin(old);
  const rng = Rng.fromString(`heir:${old.seed}:${old.generation}`);
  const father = fatherNameOf(old);
  const given = heirGiven(father.split(' ')[0], origin, rng);
  const other = otherFamily(familyOf(father), origin, rng);
  const family = repudiate ? other : familyOf(father);
  const relation = pickRelation(rng);
  const age = 17 + Math.floor(rng.next() * 14);
  const person = { given, family, name: cleanName(opt.name) || `${given}${family ? ` ${family}` : ''}`, relation, age, father };

  const major = old.secretsHeard.includes('captain-major');
  let purse = Math.min(major ? 4000 : 2500, Math.floor(Math.max(0, old.crown.gold) * (major ? 0.6 : 0.4)));
  let standing = Math.floor(old.crown.lifetimeStanding * 0.25);
  if (repudiate) { purse = Math.floor(purse * 0.5); standing = 0; }
  const points = Math.min(4, Math.floor(old.crown.lifetimeStanding / 250));

  let kept = 0, faded = 0, gone = 0;
  for (const e of old.ledger) {
    const w = weightAt(e, old.clock.t);
    if (w >= 1) kept++; else if (w > 0) faded++; else gone++;
  }
  const clauses = repudiate ? [] : carriedClauses(old);
  const title = repudiate ? null : pickInheritedTitle(old);
  const patrons = PATRON_IDS.map((id) => patronStance(old, id, repudiate));
  const fronts = (Object.keys(FRONTS) as FrontId[]).map((id) => {
    const stage = old.powers.fronts[id].stage;
    return { id, name: FRONTS[id].name, stage, stageName: FRONTS[id].stages[stage - 1].name };
  });
  const succession = planSuccession(old, rng);
  const stations = old.liveFactories.length;
  const lines = old.lines.filter((l) => !l.lost).length;
  const fatherCalling = old.identity.calling;
  const lordship = old.lordship;

  const plan: InheritPlan = {
    repudiate, origin, person, generation: old.generation + 1, purse, standing, points, stations, lines, lordship,
    coverage: old.chart.coverage(), ledger: { kept, faded, gone }, clauses, title, patrons, fronts, succession, fatherCalling, words: [],
  };
  plan.words = wordsOf(plan, old);
  return plan;
}

const join = (xs: string[]): string => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The inheritance in plain words, one line each. Reads the plan only (and the old game's chart for its coverage). */
function wordsOf(p: InheritPlan, old: Game): string[] {
  const out: string[] = [];
  const rel = p.person.relation === 'natural son' ? 'natural son' : p.person.relation;
  out.push(p.repudiate
    ? `You are ${p.person.name}, ${p.person.age}, ${rel} of ${p.person.father}, and you have put his name off.`
    : `You are ${p.person.name}, ${p.person.age}, ${rel} of ${p.person.father}.`);
  out.push(`A purse of ${p.purse} cruzados${p.standing > 0 ? `, and a name at court worth ${p.standing}` : ', and no name at court: you have put it off'}.`);
  out.push(`His charts and his book of the sea, one grade down (${Math.round(p.coverage * 100)}% of the route drawn): the drawing stays, the confidence does not.`);
  if (p.stations > 0 || p.lines > 0) {
    out.push(`${p.stations > 0 ? `${p.stations} ${p.stations === 1 ? 'House' : 'Houses'} on the coast, still standing, with their factors` : ''}`
      + `${p.stations > 0 && p.lines > 0 ? ' and ' : ''}${p.lines > 0 ? `${p.lines} ${p.lines === 1 ? 'Line' : 'Lines'} still running from their homes` : ''}.`);
  }
  if (p.lordship) out.push(`The lordship of ${p.lordship}, which goes to the eldest and is yours to hold.`);
  out.push(`The Book of his years: ${p.ledger.kept} entries still read as he left them, ${p.ledger.faded} faded, ${p.ledger.gone} forgotten.`
    + `${p.repudiate ? ' The world remembers a name, and you are not wearing it: what is kept is dim.' : ''}`);
  if (p.clauses.length > 0) {
    out.push(`Grants of the courts, at half the term he had left: ${join(p.clauses.map((c) => `${c.name.toLowerCase()} at ${c.polityName} (${c.years} years)`))}.`);
  }
  if (p.title) out.push(`A name your father had: ${p.title.english}. It opens and shuts less for the son, and no door is shut by it.`);
  const recv = p.patrons.filter((x) => x.stance === 'receives').map((x) => x.name);
  const shut = p.patrons.filter((x) => x.stance === 'closed').map((x) => x.name);
  if (!p.repudiate) {
    if (recv.length) out.push(`${join(recv)} will receive you, for his sake, and not twice on his account.`);
    if (shut.length) out.push(`${join(shut)} remembers him, and its door is shut to you for two years.`);
  }
  const world = p.fronts.filter((f) => f.id === 'traffic' || f.id === 'rule' || f.id === 'court');
  out.push(`The world you are born into stands where he left it: ${join(world.map((f) => `${f.name}, "${f.stageName}"`))}.`);
  for (const s of p.succession.successors) out.push(s.text.charAt(0).toUpperCase() + s.text.slice(1));
  for (const e of p.succession.enemies) out.push(e.text.charAt(0).toUpperCase() + e.text.slice(1));
  out.push(p.fatherCalling
    ? `Your father was a ${CALLINGS[p.fatherCalling].english}. You choose your own calling at the end of the first act, as he did.`
    : 'You choose your calling at the end of the first act, as your father did.');
  void old;
  return out;
}

// -- Applying it ----------------------------------------------------------------------------------------------------------

/** The father's Ledger, faded and moved back to lie before the heir's first day, with the clauses still in force carried at half term. */
export function inheritLedger(old: Game, heirT: number, plan: InheritPlan): Entry[] {
  const dt = heirT - old.clock.t;
  const fade = plan.repudiate ? 0.25 : 1;
  const out: Entry[] = decayed(old.ledger, old.clock.t).map((e) => {
    const c: Entry = { ...e, t: e.t + dt, inh: (e.inh ?? 0) + dt, magnitude: e.magnitude * fade };
    if (c.data && typeof c.data.until === 'number') c.data = { ...c.data, until: c.data.until + dt };
    return c;
  });
  let nextId = out.reduce((m, e) => (typeof e.data?.id === 'number' ? Math.max(m, e.data.id) : m), 0) + 1;
  const carry = new Map(plan.clauses.map((c) => [`${c.kind}:${c.polity}`, c]));
  // Every grant of the father's that was in force is closed at the hand-off: those carried are written again at half term below,
  // the rest (too short to be worth carrying, or an heir who has put the name off) simply end with him.
  for (const was of activeClauses(old.ledger, old.clock.t)) {
    const c = carry.get(`${was.kind}:${was.polity}`);
    const pol = POLITY_BY_ID.get(was.polity)?.name ?? was.polity;
    out.push({
      t: heirT, place: '', tag: c ? 'clause.renewed' : 'clause.lapsed', actors: ['captain'], target: was.polity, magnitude: 0.1, witnesses: [],
      note: `Your father’s grant of ${CLAUSES[was.kind].name.toLowerCase()} at ${pol}, ${c ? 'closed at the hand-off and written again below' : 'ended with him'}.`,
      data: { id: was.id, clause: was.kind }, inh: dt,
    });
  }
  for (const c of plan.clauses) {
    out.push({
      t: heirT, place: '', tag: c.poisoned ? 'clause.poisoned' : 'clause.granted', actors: ['captain'], target: c.polity, magnitude: 0.5, witnesses: [],
      note: `${c.name}, ${c.polityName}: your father’s grant, kept at half its term.`,
      data: { id: nextId++, clause: c.kind, until: heirT + c.years * YEAR, poison: c.poisoned ? 1 : 0 },
    });
  }
  return out;
}

/** The Fronts and the Powers as the father left them, carried into the heir's clock. Stages are what persist; the news does not. */
export function inheritPowers(heir: Game, old: Game): void {
  const dt = heir.clock.t - old.clock.t;
  const st: PowersState = migratePowers(JSON.parse(JSON.stringify(old.powers)));
  for (const f of Object.values(st.fronts)) {
    f.since = heir.clock.t;
    f.log = f.log.slice(-4).map((l) => ({ ...l, t: l.t + dt }));
  }
  for (const p of Object.values(st.powers)) {
    // A court forgives, and forgets, slowly: the name is a generation older.
    p.attitude *= 0.7;
    p.intentUntil = 0;
    p.moves = p.moves.slice(-6).map((m) => ({ ...m, t: m.t + dt }));
    for (const k of Object.keys(p.flags)) if (typeof p.flags[k] === 'number' && /(Until|At|Withheld)$/.test(k)) p.flags[k] = (p.flags[k] as number) + dt;
  }
  st.effects = st.effects.filter((e) => e.end > old.clock.t).map((e) => ({ ...e, start: e.start + dt, end: e.end + dt, rumour: undefined }));
  st.rumours = [];
  st.parcels = [];
  st.seen = Object.fromEntries(Object.entries(st.seen).map(([k, v]) => [k, typeof v === 'number' ? v + dt : v]));
  if (st.rule?.lockedAt !== undefined) st.rule.lockedAt += dt;
  if (st.local.at !== undefined) st.local.at += dt;
  if (st.localRule?.at !== undefined) st.localRule.at += dt;
  st.cursor = heir.ledger.length;
  st.lastMonth = Math.floor(heir.clock.t / MONTH);
  heir.powers = st;
}

/** The heir's own record of himself, with his father's patrons at the stance the plan gave them. */
export function inheritIdentity(heir: Game, old: Game, plan: InheritPlan): void {
  const id = heir.identity;
  const preset = id.name;
  id.name = preset || plan.person.name;
  for (const p of plan.patrons) {
    const rec = { ...newPatronRec(), favour: p.favour };
    if (p.stance === 'closed') rec.ruined = heir.clock.t - 0.5 * YEAR;
    id.patrons[p.id] = rec;
  }
  id.patron = plan.repudiate ? 'crown' : old.identity.patron;
  if (id.patrons[id.patron].ruined !== null) id.patron = PATRON_IDS.find((x) => id.patrons[x].ruined === null) ?? 'crown';
  id.applied = [...old.identity.applied];
  id.warned = { ...old.identity.warned };
  id.moved = [...old.identity.moved];
  id.favourite = old.identity.favourite;
  id.cursor = heir.ledger.length;
  id.titles = {};
  id.worn = [];
  id.announced = [];
  id.calling = null;
  id.inherited = plan.title ? { id: plan.title.id, from: plan.person.father } satisfies InheritedTitle : null;
  const rec: HeirRec = {
    name: id.name, relation: plan.person.relation, age: plan.person.age, father: plan.person.father,
    fatherCalling: plan.fatherCalling, repudiated: plan.repudiate, legacy: plan.words,
  };
  id.heir = rec;
}

/**
 * Everything E2 hands an heir that is not already `inheritFrom`'s purse, chart, Houses and Lines: the Ledger, the Fronts, the
 * clauses, the identity and the company. Called once, on a Game the constructor has just written. Returns the lines it logged.
 */
export function applyDynasty(heir: Game, old: Game, plan: InheritPlan): void {
  heir.ledger = inheritLedger(old, heir.clock.t, plan);
  for (const c of plan.clauses) onGrant(heir, POLITY_BY_ID.get(c.polity)!, c.kind);
  inheritPowers(heir, old);
  inheritIdentity(heir, old, plan);
  record(heir, 'heir.named', {
    target: heir.identity.name, magnitude: 0.3, silent: true,
    note: `${heir.identity.name}, ${plan.person.age}, ${plan.person.relation} of ${plan.person.father}, takes the ship.`,
  });
  for (const p of plan.patrons) {
    if (p.stance === 'receives') record(heir, 'heir.received', { target: p.name, magnitude: 0.3, note: `${p.name} receives you, for your father’s sake.`, silent: true });
  }
  applySuccession(heir, plan.succession);
}

/** The heir card's stance, remembered on the father's game for the hand-off. */
export function setHeirStance(old: Game, stance: 'keep' | 'repudiate'): void {
  old.identity.heirStance = stance;
}

