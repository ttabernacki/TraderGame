import { NM, haversine } from '../core/math';
import { legDays } from '../progression/network';
import { currentBook } from '../economy/trade';
import { portDef } from '../world/ports';
import type { Game } from './state';

/**
 * The Leg Report: at most five lines when a leg ends at a port. Reads existing
 * state only; the Ledger (B1) will replace the sources, not the shape.
 */
export interface LegStart {
  from: string;
  t: number;
  deaths: number;
}

export function noteDeparture(g: Game): void {
  if (!g.dockedAt) return;
  g.legStart = { from: g.dockedAt, t: g.clock.t, deaths: g.crew.deaths };
  // A voyage is what lies between sailing from Lisbon and coming home to it.
  if (g.dockedAt === 'lisboa') {
    g.noteDeed('voyage.begun', { place: 'lisboa', note: `Sailed from Lisbon in ${g.ship.name}.` });
  }
}

/** A landfall from the sea is a test of the reckoning: the Ledger keeps those that held or failed badly. */
const EXACT_NM = 15;
const LOST_NM = 60;

/** The lines, without emitting them. Called before the landfall corrects the reckoning. */
export function legReportLines(g: Game, toId: string): string[] {
  const s = g.legStart;
  if (!s || s.from === toId) return [];
  const days = (g.clock.t - s.t) / 86400;
  if (days < 0.5) return [];
  const lines: string[] = [];

  let bench = 0;
  try { bench = legDays(s.from, toId, g.ship.baseHull.id); } catch { bench = 0; }
  const d = Math.round(days);
  lines.push(`Leg report, ${portDef(s.from).name} to ${portDef(toId).name}: ${d} ${d === 1 ? 'day' : 'days'}`
    + (bench > 0 ? ` against ${bench} on the Casa's reckoning (${d - bench >= 0 ? '+' : ''}${d - bench}).` : '.'));

  // Reckoned against true, before the town corrects it.
  const err = haversine(g.nav.estimated, g.ship.state.pos) / NM;
  lines.push(`Reckoning at landfall: ${err.toFixed(0)} miles out.`);

  const lost = g.crew.deaths - s.deaths;
  lines.push(lost > 0 ? `Men lost: ${lost}.` : 'Men lost: none.');

  const spoiled = currentBook(g.trade).entries
    .filter((e) => e.kind === 'spoiled' && e.t >= s.t)
    .reduce((a, e) => a - e.amount, 0);
  lines.push(spoiled > 0.5 ? `Spoilage: ${spoiled.toFixed(0)} cruzados of cargo.` : 'Spoilage: none.');

  // The margin the hold would make at this quay's bids, against what it cost.
  const bids = new Map(g.marketHere(toId).map((l) => [l.goodId, l.bid]));
  let cost = 0, worth = 0;
  for (const c of g.ship.cargo) {
    const bid = bids.get(c.goodId);
    if (bid === undefined) continue;
    cost += c.cost * c.quantity;
    worth += bid * c.quantity;
  }
  if (cost > 0) {
    const m = worth - cost;
    lines.push(`Margin on cargo at today's bids: ${m >= 0 ? '+' : '-'}${Math.abs(m).toFixed(0)} on ${cost.toFixed(0)} paid.`);
  }
  return lines.slice(0, 5);
}

export function legReportOnArrival(g: Game, toId: string): void {
  const lines = legReportLines(g, toId);
  const start = g.legStart;
  if (start && start.from !== toId) {
    const days = (g.clock.t - start.t) / 86400;
    const err = haversine(g.nav.estimated, g.ship.state.pos) / NM;
    if (days >= 5 && err <= EXACT_NM) {
      g.noteDeed('landfall.exact', { place: toId, target: toId, magnitude: 0.5, note: `Raised ${portDef(toId).name} after ${Math.round(days)} days, ${err.toFixed(0)} miles from the reckoning.` });
    } else if (err >= LOST_NM) {
      g.noteDeed('landfall.lost', { place: toId, target: toId, magnitude: Math.min(1, err / 200), note: `Raised ${portDef(toId).name} ${err.toFixed(0)} miles from where the reckoning put her.` });
    }
    if (toId === 'lisboa' && days >= 5) g.noteDeed('voyage.home', { place: 'lisboa', note: `Came home to Lisbon after ${Math.round(days)} days from ${portDef(start.from).name}.` });
  }
  g.legStart = null;
  if (lines.length === 0) return;
  // Logbook entries are shown newest first, so the headline goes in last.
  for (const l of lines.slice(1).reverse()) g.logEvent('navigation', l);
  g.logEvent('navigation', lines[0], true);
  g.pushAlert(lines[0], 'note');
}
