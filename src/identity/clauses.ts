import { clamp } from '../core/math';
import type { Game } from '../game/state';
import { record, type Entry } from '../ledger/ledger';
import { TAGS } from '../ledger/tags';
import { expectedGift } from '../diplomacy/courts';
import { POLITY_BY_ID, polityOfPort, type PolityDef } from '../diplomacy/polities';
import type { MarketMods } from '../world/powers/modifiers';
import { portDef } from '../world/ports';

/**
 * Treaty clauses (BUILD_PLAN D5).
 *
 * A clause is a named grant a court makes for a term of years, at a price in gifts, and loses by
 * accumulated offences. It is a Ledger entry with a term, not a separate store: `clause.granted` /
 * `clause.poisoned` carry {clause, id, until, poison} in `data`, and `clause.lapsed` / `clause.revoked` /
 * `clause.renewed` carry the id of the one they close. Everything below reads the Ledger.
 *
 * Offences are what the court holds against the captain since the grant: every Ledger entry aimed at
 * that court with a tone against him, weighted by its magnitude. A grant goes when they reach its limit
 * (1.0; 0.4 for a poisoned one, which is also half as good and shorter).
 *
 * Regard stays inside as the five-word mood (`measureWord`/`standingWord`); the player sees clauses.
 */

export type ClauseKind = 'dues' | 'berth' | 'buyer' | 'fortress' | 'pilot' | 'cartaz' | 'men';
export const CLAUSE_KINDS: ClauseKind[] = ['dues', 'berth', 'buyer', 'fortress', 'pilot', 'cartaz', 'men'];

export interface ClauseDef {
  kind: ClauseKind;
  name: string;
  /** What it gives, in the Book's voice. */
  gives: string;
  /** What the poisoned version costs instead. */
  strings: string;
  /** Price in gifts, as a share of what this court expects of a first present (`expectedGift`). */
  price: number;
  /** Term in years, 2 to 5. */
  years: number;
}

export const CLAUSES: Record<ClauseKind, ClauseDef> = {
  dues: { kind: 'dues', name: 'Free dues', gives: 'Port dues at this court’s quays are halved.', strings: 'Dues are only a quarter off, and a present is still expected at each call.', price: 0.8, years: 3 },
  berth: { kind: 'berth', name: 'Berth and watering rights', gives: 'A berth at the best quay, water and wood for nothing, no present asked.', strings: 'A berth, but out at the roads, and the water is drawn at your own cost.', price: 0.5, years: 5 },
  buyer: { kind: 'buyer', name: 'Exclusive buyer', gives: 'The court sells you what it grows first, deeper in stock and a little cheaper.', strings: 'First call on its goods, at a price that suits the court.', price: 1.0, years: 2 },
  fortress: { kind: 'fortress', name: 'Fortress licence', gives: 'Leave to hold ground and a House with a wall round it.', strings: 'Ground for a House, inside the court’s own walls and under its guns.', price: 1.4, years: 5 },
  pilot: { kind: 'pilot', name: 'Pilot loan', gives: 'One of the court’s pilots and the soundings of its coast.', strings: 'A pilot who has not been asked whether he is willing.', price: 0.6, years: 2 },
  cartaz: { kind: 'cartaz', name: 'Cartaz recognised', gives: 'The Portuguese letter is honoured here: no stopping, lighter dues.', strings: 'The letter is honoured, and so is the rival’s.', price: 0.9, years: 3 },
  men: { kind: 'men', name: 'Men for hire', gives: 'Boatmen, porters and carpenters at the court’s rate, as trade and not as soldiers.', strings: 'Men at the court’s rate, and the court keeps a share of their wage.', price: 0.7, years: 2 },
};

export interface Clause {
  id: number;
  kind: ClauseKind;
  polity: string;
  granted: number;
  until: number;
  poisoned: boolean;
  status: 'active' | 'lapsed' | 'revoked' | 'renewed';
  /** What the court holds against the captain since the grant. */
  offences: number;
  limit: number;
}

const YEAR = 365.25 * 86400;
const OPEN = new Set(['clause.granted', 'clause.poisoned']);
const CLOSE: Record<string, Clause['status']> = { 'clause.lapsed': 'lapsed', 'clause.revoked': 'revoked', 'clause.renewed': 'renewed' };
export const OFFENCE_LIMIT = 1.0;
export const POISON_LIMIT = 0.4;

/** How heavily one entry weighs against a court: its tone, if against the captain, times how much it mattered. */
export function offenceWeight(e: Entry): number {
  if (e.tag.startsWith('clause.') || e.tag.startsWith('patron.') || e.tag.startsWith('title.')) return 0;
  const tone = TAGS[e.tag]?.tone ?? 0;
  return tone < -0.3 ? -tone * clamp(e.magnitude, 0.2, 1) : 0;
}

/** Every clause the Ledger records, with its fate so far. Pure: the Book, the quarters and the tests all read this. */
const cache = new WeakMap<Entry[], { len: number; day: number; list: Clause[] }>();
export function clausesOf(ledger: Entry[], now: number): Clause[] {
  const day = Math.floor(now / 86400), hit = cache.get(ledger);
  if (hit && hit.len === ledger.length && hit.day === day) return hit.list;
  const list = clausesUncached(ledger);
  cache.set(ledger, { len: ledger.length, day, list });
  return list;
}

function clausesUncached(ledger: Entry[]): Clause[] {
  const out = new Map<number, Clause>();
  const at = new Map<number, number>();
  for (let i = 0; i < ledger.length; i++) {
    const e = ledger[i];
    if (OPEN.has(e.tag) && e.data && typeof e.data.id === 'number') {
      const poisoned = e.tag === 'clause.poisoned';
      at.set(e.data.id, i);
      out.set(e.data.id, {
        id: e.data.id, kind: e.data.clause as ClauseKind, polity: e.target, granted: e.t,
        until: Number(e.data.until), poisoned, status: 'active', offences: 0, limit: poisoned ? POISON_LIMIT : OFFENCE_LIMIT,
      });
    } else if (CLOSE[e.tag] && e.data && typeof e.data.id === 'number') {
      const c = out.get(e.data.id);
      if (c && c.status === 'active') c.status = CLOSE[e.tag];
    }
  }
  const list = [...out.values()];
  for (const c of list) {
    if (c.status !== 'active') continue;
    // What came after the grant in the Ledger, not merely later by the clock: a mark written in the same breath as the grant is not held against it.
    for (let i = (at.get(c.id) ?? 0) + 1; i < ledger.length; i++) if (ledger[i].target === c.polity) c.offences += offenceWeight(ledger[i]);
  }
  return list;
}

/** Clauses in force at `now`: not closed, in term, offences under the limit. */
export function activeClauses(ledger: Entry[], now: number, polity?: string): Clause[] {
  return clausesOf(ledger, now).filter((c) => c.status === 'active' && c.until > now && c.offences < c.limit && (!polity || c.polity === polity));
}

export function hasClause(g: Pick<Game, 'ledger' | 'clock'>, polity: string | null | undefined, kind: ClauseKind): Clause | null {
  if (!polity) return null;
  return activeClauses(g.ledger, g.clock.t, polity).find((c) => c.kind === kind) ?? null;
}

/** The clause of this kind in force at a port's court, if any. */
export function clauseAtPort(g: Pick<Game, 'ledger' | 'clock'>, port: string | null | undefined, kind: ClauseKind): Clause | null {
  const pol = port ? polityOfPort(port) : null;
  return pol ? hasClause(g, pol.id, kind) : null;
}

const nextId = (ledger: Entry[]): number => ledger.reduce((m, e) => (typeof e.data?.id === 'number' ? Math.max(m, e.data.id) : m), 0) + 1;

/** What a clause costs the captain in gifts at this court, in cruzados. */
export function clausePrice(pol: PolityDef, kind: ClauseKind): number {
  return Math.round(CLAUSES[kind].price * expectedGift(pol));
}

/** Years a court gives: the clause's own, a year more to a court that trusts you, cut to two when poisoned. */
export function termYears(kind: ClauseKind, trust: number, poisoned: boolean): number {
  if (poisoned) return 2;
  return clamp(CLAUSES[kind].years + (trust > 0.5 ? 1 : 0), 2, 5);
}

/** On-grant effects that are state rather than a modifier. */
export function onGrant(g: Game, pol: PolityDef, kind: ClauseKind): void {
  if (kind === 'pilot') {
    const a = portDef(pol.seat);
    g.soundedGround.push({ lat: a.lat, lon: a.lon, nm: 200, source: `the pilots of ${a.name}` });
  }
  if (kind === 'fortress') {
    for (const port of pol.ports) { const r = g.relationsFor(port); r.mayTrade = true; }
    g.relationsFor(pol.seat).factory = true;
  }
}

function onEnd(g: Game, pol: PolityDef, kind: ClauseKind): void {
  if (kind !== 'fortress') return;
  const house = g.feitorias.some((f) => !f.lost && pol.ports.includes(f.portId));
  if (!house) g.relationsFor(pol.seat).factory = false;
}

/** Name a clause granted (or granted with strings). Closes any clause of the same kind there as renewed. */
export function grantClause(g: Game, polityId: string, kind: ClauseKind, how: 'granted' | 'poisoned', note = ''): Clause | null {
  const pol = POLITY_BY_ID.get(polityId);
  if (!pol) return null;
  const poisoned = how === 'poisoned';
  const now = g.clock.t;
  const old = activeClauses(g.ledger, now, polityId).find((c) => c.kind === kind);
  if (old) record(g, 'clause.renewed', { target: polityId, data: { id: old.id, clause: kind }, silent: true, note: `${CLAUSES[kind].name} at ${pol.name}, renewed.` });
  const id = nextId(g.ledger);
  const until = now + termYears(kind, g.polityState(polityId).trust, poisoned) * YEAR;
  const def = CLAUSES[kind];
  record(g, poisoned ? 'clause.poisoned' : 'clause.granted', {
    target: polityId, magnitude: 0.5, data: { id, clause: kind, until, poison: poisoned ? 1 : 0 },
    note: `${def.name}, ${pol.name}: ${poisoned ? def.strings : def.gives}${note ? ` ${note}` : ''}`,
  });
  onGrant(g, pol, kind);
  return clausesOf(g.ledger, now).find((c) => c.id === id) ?? null;
}

export function refuseClause(g: Game, polityId: string, kind: ClauseKind): void {
  const pol = POLITY_BY_ID.get(polityId);
  record(g, 'clause.refused', { target: polityId, magnitude: 0.2, data: { clause: kind }, note: `${CLAUSES[kind].name}: ${pol?.name ?? polityId} would not grant it.` });
}

/** Renew an active clause before it ends, paying the gifts. */
export function renewClause(g: Game, clauseId: number): { ok: boolean; text: string } {
  const c = clausesOf(g.ledger, g.clock.t).find((x) => x.id === clauseId);
  if (!c || c.status !== 'active' || c.until <= g.clock.t || c.offences >= c.limit) return { ok: false, text: 'That grant is not in force.' };
  const pol = POLITY_BY_ID.get(c.polity)!;
  const cost = Math.round(clausePrice(pol, c.kind) * 0.6);
  if (g.crown.gold < cost) return { ok: false, text: `Renewing it wants ${cost} cruzados in gifts.` };
  g.crown.gold -= cost;
  grantClause(g, c.polity, c.kind, c.poisoned ? 'poisoned' : 'granted', `Renewed for ${cost} cruzados in gifts.`);
  return { ok: true, text: `${CLAUSES[c.kind].name} at ${pol.name} renewed for ${cost} cruzados.` };
}

/** Close what has run out or been forfeited. Cheap: called as the days pass. */
export function tickClauses(g: Game): void {
  const now = g.clock.t;
  for (const c of clausesOf(g.ledger, now)) {
    if (c.status !== 'active') continue;
    const pol = POLITY_BY_ID.get(c.polity);
    if (!pol) continue;
    if (c.offences >= c.limit) {
      record(g, 'clause.revoked', { target: c.polity, data: { id: c.id, clause: c.kind }, magnitude: 0.6, note: `${CLAUSES[c.kind].name} at ${pol.name} is withdrawn: too much has been held against you since it was given.` });
      onEnd(g, pol, c.kind);
    } else if (c.until <= now) {
      record(g, 'clause.lapsed', { target: c.polity, data: { id: c.id, clause: c.kind }, note: `${CLAUSES[c.kind].name} at ${pol.name} has run its term.` });
      onEnd(g, pol, c.kind);
    }
  }
}

/** Days left on a clause, for the Book. */
export const daysLeft = (c: Clause, now: number): number => Math.max(0, Math.round((c.until - now) / 86400));

// -- The piece -> clause table -----------------------------------------------

/**
 * What each kept piece ends in. Win names the clause granted, half names it poisoned (granted, with strings),
 * fail names it refused. A piece not listed (the greeting) ends in the custom of the court and leads on to the terms.
 * INVENTED pairing: the design docs say only that pieces must end in a clause, a lane or a person.
 */
export const PIECE_CLAUSE: Record<string, ClauseKind> = {
  silent: 'berth', gifts: 'dues', case: 'fortress', between: 'cartaz', envoy: 'buyer',
  informer: 'cartaz', refusal: 'men', pilot: 'pilot', hostage: 'buyer',
};

export function clauseLine(g: Game, polity: string, kind: ClauseKind, how: 'granted' | 'poisoned' | 'refused'): string {
  const name = CLAUSES[kind].name, pol = POLITY_BY_ID.get(polity)?.name ?? polity;
  if (how === 'refused') return `${pol} would not grant ${name.toLowerCase()}.`;
  const c = activeClauses(g.ledger, g.clock.t, polity).find((x) => x.kind === kind);
  const yrs = c ? Math.round((c.until - g.clock.t) / YEAR) : 0;
  return `${pol} ${how === 'poisoned' ? 'grants, with strings,' : 'grants'} ${name.toLowerCase()}, for ${yrs} years.`;
}

/** A piece has ended: name its clause. Returns the line, or '' if the piece has none. */
export function settlePieceClause(g: Game, pieceId: string, polity: string, grade: 'win' | 'half' | 'fail'): string {
  const kind = PIECE_CLAUSE[pieceId];
  if (!kind) return '';
  const how = grade === 'win' ? 'granted' : grade === 'half' ? 'poisoned' : 'refused';
  const held = activeClauses(g.ledger, g.clock.t, polity).find((c) => c.kind === kind);
  // A grant already in force is not given twice: it is renewed, for gifts, from the Book.
  if (held && (how !== 'granted' || held.poisoned === false)) {
    return `${POLITY_BY_ID.get(polity)?.name ?? polity} already holds ${CLAUSES[kind].name.toLowerCase()} with you, for ${Math.round((held.until - g.clock.t) / YEAR)} more years.`;
  }
  if (how === 'refused') refuseClause(g, polity, kind); else grantClause(g, polity, kind, how);
  return clauseLine(g, polity, kind, how);
}

// -- Effects -----------------------------------------------------------------

/**
 * The clauses of the court that owns this port, folded into the Powers' modifiers (`marketModifiers`). Set once in
 * Game's constructor, beside the Deep ports' own.
 */
export function clauseMods(g: Pick<Game, 'ledger' | 'clock'>, port: string, t: number, base: MarketMods): MarketMods {
  const pol = polityOfPort(port);
  if (!pol) return base;
  const live = activeClauses(g.ledger, t, pol.id);
  if (live.length === 0) return base;
  let dues = 1;
  const priceMult = { ...base.priceMult }, stockMult = { ...base.stockMult };
  const reasons = [...base.reasons];
  for (const c of live) {
    const p = c.poisoned;
    if (c.kind === 'dues') { dues *= p ? 0.75 : 0.5; reasons.push(`${CLAUSES.dues.name}: ${p ? CLAUSES.dues.strings : CLAUSES.dues.gives}`); }
    if (c.kind === 'berth') { dues *= p ? 0.95 : 0.8; reasons.push(`${CLAUSES.berth.name}.`); }
    if (c.kind === 'cartaz') { dues *= p ? 0.95 : 0.85; reasons.push(`${CLAUSES.cartaz.name}.`); }
    if (c.kind === 'buyer') {
      for (const id of Object.keys(portDef(port).produces)) {
        priceMult[id] = (priceMult[id] ?? 1) * (p ? 0.98 : 0.93);
        stockMult[id] = (stockMult[id] ?? 1) * (p ? 1.05 : 1.25);
      }
      reasons.push(`${CLAUSES.buyer.name}.`);
    }
  }
  return { ...base, priceMult, stockMult, duesMult: base.duesMult * dues, reasons, reason: base.reason || reasons[0] || '' };
}

/** A hand's wage is the court's rate where it lends men. */
export function menWageMult(g: Pick<Game, 'ledger' | 'clock'>, port: string | null): number {
  const c = clauseAtPort(g, port, 'men');
  return c ? (c.poisoned ? 0.85 : 0.6) : 1;
}

/** Water and wood for nothing where there is a berth clause. */
export const wateringFree = (g: Pick<Game, 'ledger' | 'clock'>, port: string | null): boolean => {
  const c = clauseAtPort(g, port, 'berth');
  return !!c && !c.poisoned;
};

/** A present is not asked where the letter is honoured or the dues are the court's gift. */
export const presentWaived = (g: Pick<Game, 'ledger' | 'clock'>, port: string | null): boolean =>
  !!(clauseAtPort(g, port, 'cartaz') || clauseAtPort(g, port, 'berth') && !clauseAtPort(g, port, 'berth')!.poisoned);

/** Ask-side: gifts laid down against a clause's price decide granted / poisoned / refused. */
export function judgeClause(pol: PolityDef, kind: ClauseKind, giftValue: number): 'granted' | 'poisoned' | 'refused' {
  const price = clausePrice(pol, kind);
  if (giftValue >= price) return 'granted';
  if (giftValue >= price * 0.5) return 'poisoned';
  return 'refused';
}
