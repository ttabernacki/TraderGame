import { clamp, formatLat, formatLon } from '../core/math';
import { good } from '../economy/goods';
import { sheetAgeWord, sheetConfidence, type PriceSheet } from '../economy/trade';
import { AGREED_W, type ChartedPort } from '../navigation/charts';
import type { Lead } from '../progression/leads';
import {
  CONFIDENCE_LABEL, CONFIDENCE_WEIGHT, type Entry as RutterEntry, type EntryKind, type Note,
} from '../game/rutter';
import { portDef } from '../world/ports';
import type { Game } from '../game/state';
import { rumourFacts } from '../world/powers/rumours';

/**
 * The Information object (B2, decision D3): everything the captain holds about
 * the world is a claim, from someone, of some age, worth some belief.
 *
 *   Fact = { claim, source, age, confidence, kind }
 *
 * Truth is not a field and is never shown. A fact is judged by who told it and
 * how long ago, and is settled only by arriving or by a second source.
 *
 * The stores underneath are not duplicated here and not replaced: a price
 * sheet is still the table the market reads, a lead still carries the position
 * the chart draws, a rutter note still hangs off its page. Those hold game
 * state that is not a claim. A Fact is what each of them *says*, in one shape,
 * so one component can show a price sheet, a rumour and a chart fact the same
 * way, and so the Informers can sell and check any of them without knowing
 * which store it came from. Nothing here is saved; it is rebuilt from the
 * stores every time, which is why no save needs migrating.
 */

export type FactKind = 'price' | 'politics' | 'hazard' | 'chart' | 'rumour';

export const KIND_ORDER: FactKind[] = ['price', 'rumour', 'chart', 'hazard', 'politics'];
export const KIND_TITLE: Record<FactKind, string> = {
  price: 'Prices', rumour: 'Hearsay', chart: 'The chart and the coast', hazard: 'Dangers', politics: 'Peoples and courts',
};

/** Where a fact lives, so an action can reach the store it came from. */
export type FactRef =
  | { store: 'sheet'; port: string }
  | { store: 'lead'; id: string }
  | { store: 'rutter'; entry: string; note: string }
  | { store: 'chart'; port: string }
  | { store: 'rumour'; id: number };

/** What a second source made of it, once asked. Never what is true. */
export type Corroboration = 'agrees' | 'disputed';

export interface Fact {
  id: string;
  kind: FactKind;
  /** What is claimed, in the words it was given. */
  claim: string;
  /** Who said it, or how it was come by. */
  source: string;
  /** Days since it was true, or heard, or written. */
  age: number;
  /** 0..1: how far it is worth acting on. Never the truth. */
  confidence: number;
  /** The port it is about, when it is about one. */
  place?: string;
  /** A second source has been asked. */
  checked?: Corroboration;
  /** A copy has been sold. */
  sold?: boolean;
  /** Settled by arrival: it was there, or it was not. */
  settled?: 'borne out' | 'not borne out';
  ref: FactRef;
}

const nameOfPort = (id: string): string => {
  try { return portDef(id).name; } catch { return id; }
};

// -- The shared words ---------------------------------------------------------

export const ageWord = sheetAgeWord;

/** Past this a fact is stale and is shown as such. */
export const STALE_DAYS = 100;
export const isStale = (f: Fact): boolean => f.age >= STALE_DAYS || f.confidence < 0.35;

export function confidenceWord(c: number): string {
  return c >= 0.8 ? 'firm' : c >= 0.55 ? 'fair' : c >= 0.3 ? 'doubtful' : 'hardly worth believing';
}

// -- Price sheets -----------------------------------------------------------

/** Confidence of a sheet: its age, or the age of the second opinion if one was taken. */
export function sheetFactConfidence(sh: PriceSheet, now: number): number {
  const age = Math.max(0, (now - sh.t) / 86400);
  const base = sheetConfidence(age);
  if (sh.checked === 'disputed') return Math.min(base, 0.2);
  if (sh.checkedAt !== undefined && sh.checked === 'agrees') {
    return Math.max(base, 0.8 * sheetConfidence(Math.max(0, (now - sh.checkedAt) / 86400)));
  }
  return base;
}

const SHEET_SOURCE: Record<PriceSheet['source'], string> = {
  seen: 'your own eyes', letter: 'a letter from a factor', broker: 'a broker’s letter',
};

export function sheetFact(port: string, sh: PriceSheet, now: number): Fact {
  const dear = Object.entries(sh.quotes)
    .sort((a, b) => b[1].bid - a[1].bid)
    .slice(0, 3)
    .map(([id, q]) => `${good(id).english.toLowerCase()} ${Math.round(q.bid)}`);
  const n = Object.keys(sh.quotes).length;
  const disputed = sh.checked === 'disputed';
  return {
    id: `price:${port}`,
    kind: 'price',
    claim: `${nameOfPort(port)}: ${n} goods quoted. Best bids, in cruzados: ${dear.join(', ') || 'none'}.`
      + (disputed ? ' A second informer will not stand behind one of the figures.' : ''),
    source: SHEET_SOURCE[sh.source],
    age: Math.max(0, (now - sh.t) / 86400),
    confidence: sheetFactConfidence(sh, now),
    place: port,
    checked: sh.checked,
    sold: sh.soldAt !== undefined,
    ref: { store: 'sheet', port },
  };
}

// -- Hearsay ----------------------------------------------------------------

/** A rumour is worth the teller; it spoils faster than a price. */
export function leadConfidence(l: Lead, now: number): number {
  const age = Math.max(0, (now - l.heard) / 86400);
  const teller = clamp(1 - l.errorNm / 420, 0.1, 0.95);
  const fade = clamp(1 - age / 500, 0.3, 1);
  if (l.checked === 'disputed') return Math.min(0.15, teller * fade);
  return clamp(teller * fade + (l.checked === 'agrees' ? 0.2 : 0), 0.05, 0.95);
}

export function leadFact(l: Lead, now: number): Fact {
  return {
    id: `lead:${l.id}`,
    kind: 'rumour',
    claim: l.text + (l.checked === 'disputed' ? ' A second informer has never heard of it.' : ''),
    source: l.source,
    age: Math.max(0, (now - l.heard) / 86400),
    confidence: leadConfidence(l, now),
    place: l.targetPort,
    checked: l.checked,
    sold: l.soldAt !== undefined,
    settled: l.followed ? (l.false ? 'not borne out' : 'borne out') : undefined,
    ref: { store: 'lead', id: l.id },
  };
}

// -- The rutter and the chart ---------------------------------------------------

const RUTTER_KIND: Record<EntryKind, FactKind> = {
  coast: 'chart', port: 'chart', passage: 'chart', nature: 'hazard',
  people: 'politics', person: 'politics', chronicle: 'politics', rumour: 'rumour',
};

function noteSource(n: Note): string {
  if (n.source) return n.source;
  if (n.mine) return 'your own hand';
  return n.confidence === 'observed' ? 'your own eyes' : CONFIDENCE_LABEL[n.confidence].toLowerCase();
}

export function rutterFact(e: RutterEntry, n: Note, now: number): Fact {
  const kind = RUTTER_KIND[e.kind];
  const age = Math.max(0, (now - n.t) / 86400);
  // A page that has been through water is harder to trust; and what is said of
  // people and rumours spoils with the years where a cape does not.
  const damage = 1 - 0.12 * e.damage.length;
  const fade = kind === 'rumour' || kind === 'politics' ? clamp(1 - age / 900, 0.4, 1) : 1;
  return {
    id: `rutter:${e.id}:${n.id}`,
    kind,
    claim: `${e.title}. ${n.text}`,
    source: noteSource(n),
    age,
    confidence: clamp(CONFIDENCE_WEIGHT[n.confidence] * damage * fade, 0.05, 1),
    sold: e.published !== null,
    ref: { store: 'rutter', entry: e.id, note: n.id },
  };
}

/** Where the chart puts a town, and who says so. */
export function chartPortFact(p: ChartedPort, now: number): Fact {
  const hearsay = p.passes <= 0;
  const source = p.visited ? 'your own landfall' : hearsay ? (p.t > 0 ? 'hearsay' : 'the Casa’s sheet') : 'your own reckoning';
  const w = p.wLon ?? 0;
  return {
    id: `chart:${p.id}`,
    kind: 'chart',
    claim: `${nameOfPort(p.id)} is drawn at ${formatLat(p.lat)}, ${formatLon(p.lon)}.`,
    source,
    // The Casa's sheet is older than the voyage by a couple of years.
    age: p.t > 0 ? Math.max(0, (now - p.t) / 86400) : 730 + now / 86400,
    confidence: p.visited ? 1 : clamp(0.1 + 0.85 * (w / AGREED_W), 0.1, 0.95),
    place: p.id,
    ref: { store: 'chart', port: p.id },
  };
}

// -- Everything he holds ------------------------------------------------------

/** All the captain holds, newest first within each kind. */
export function knownFacts(g: Game): Fact[] {
  const now = g.clock.t;
  const out: Fact[] = [];
  for (const [port, sh] of Object.entries(g.trade.sheets)) out.push(sheetFact(port, sh, now));
  for (const l of g.leads) out.push(leadFact(l, now));
  for (const e of g.rutter.entries) for (const n of e.notes) out.push(rutterFact(e, n, now));
  for (const p of g.chart.ports.values()) out.push(chartPortFact(p, now));
  out.push(...rumourFacts(g.powers, now));
  return out.sort((a, b) => a.age - b.age);
}

export function byKind(facts: Fact[]): Map<FactKind, Fact[]> {
  const m = new Map<FactKind, Fact[]>();
  for (const k of KIND_ORDER) m.set(k, []);
  for (const f of facts) m.get(f.kind)!.push(f);
  return m;
}
