import { daysFromEpoch } from '../core/clock';
import { haversine, NM } from '../core/math';
import { familyOf } from '../ledger/tags';
import { gradeOf, soundingAnchors, type Grade } from '../navigation/chartGrade';
import { legDays } from '../progression/network';
import type { Game } from './state';

/**
 * The Year (C3): quarters at Lisbon, the sailing season, the homecoming.
 *
 * A cadence, never a gate. Nothing here blocks a verb, requires a return to
 * Lisbon, or locks content: the phase is *derived* from where the ship is and
 * what day it is, so an old save simply enters the right one. The only stored
 * things are the baseline taken when she last sailed from Lisbon and the
 * report waiting to be read. A captain who never comes home gets no card and
 * no penalty; the year number rolls on by the calendar.
 *
 * The season's dates are the Casa's own arithmetic: the same `legDays` the
 * Leg Report quotes, and the same monsoon months `inSeason` enforces for the
 * Malabar leg (south-west monsoon, April to September, out of Melinde).
 */

export type YearPhase = 'quarters' | 'season' | 'homecoming';

/** Everything measured when she sails from Lisbon. */
export interface YearBase {
  t: number;
  /** Career year it was taken in. */
  year: number;
  purse: number;
  deaths: number;
  /** Chart points at each grade 0..3. */
  grades: [number, number, number, number];
  coverage: number;
  ledgerLen: number;
  discoveries: number;
}

export interface YearReport {
  /** Career year she came home in. */
  year: number;
  /** Date the baseline was taken, and the day she came home. */
  from: number;
  to: number;
  days: number;
  purseDelta: number;
  sold: number;
  bought: number;
  deaths: number;
  /** Chart points raised to Surveyed or better, and the coverage gained (fraction of the route). */
  raised: number;
  sounded: number;
  coverageGain: number;
  discoveries: number;
  /** Ledger entries by tag family, most first. */
  families: [string, number][];
  highlights: string[];
  /** The card's lines, at most eight. */
  lines: string[];
}

export interface YearState {
  baseline: YearBase | null;
  /** The homecoming card not yet read. */
  pending: YearReport | null;
  /** Career year of the last card shown, so a year gets one. */
  lastHomeYear: number;
}

export const newYear = (): YearState => ({ baseline: null, pending: null, lastHomeYear: 0 });

/** Old saves and bad data: always a usable state. */
export function migrateYear(d: Partial<YearState> | undefined | null): YearState {
  const y = newYear();
  if (!d || typeof d !== 'object') return y;
  y.baseline = d.baseline && Number.isFinite(d.baseline.t) ? d.baseline : null;
  y.pending = d.pending && Array.isArray(d.pending.lines) ? d.pending : null;
  y.lastHomeYear = Number.isFinite(d.lastHomeYear) ? d.lastHomeYear! : 0;
  return y;
}

// ---------------------------------------------------------------------------
// The season

/** Ports from Lisbon to the Swahili coast, in the order the road meets them. */
const OUTWARD = ['lisboa', 'lagos', 'funchal', 'las-palmas', 'arguim', 'mina', 'mpinda', 'benguela', 'mocambique', 'melinde'];
const DAY = 86400;
/** The south-west monsoon out of Melinde, April to September (`inSeason`). */
const SW_OPEN = { month: 4, day: 1 };
const SW_CLOSE = { month: 9, day: 30 };

/** Days on the Casa's reckoning from Lisbon to Melinde for this hull. */
export function daysToMelinde(hullId: string): number {
  let d = 0;
  for (let i = 1; i < OUTWARD.length; i++) d += legDays(OUTWARD[i - 1], OUTWARD[i], hullId);
  return d;
}

export interface SeasonWindow {
  /** Days to Melinde on the Casa's reckoning. */
  passage: number;
  /** Day of year she should sail from Lisbon to arrive as the south-west monsoon sets in, and the last day that still catches it. */
  openDoy: number;
  closeDoy: number;
}

const doyOf = (t: number): number => {
  const days = Math.floor(t / DAY);
  // Same epoch the clock uses; take the year from the clock's own arithmetic.
  let y = 1430 + Math.floor(days / 365.2425);
  while (daysFromEpoch(y, 1, 1) > days) y--;
  while (daysFromEpoch(y + 1, 1, 1) <= days) y++;
  return days - daysFromEpoch(y, 1, 1) + 1;
};

const yearOfT = (t: number): number => {
  const days = Math.floor(t / DAY);
  let y = 1430 + Math.floor(days / 365.2425);
  while (daysFromEpoch(y, 1, 1) > days) y--;
  while (daysFromEpoch(y + 1, 1, 1) <= days) y++;
  return y;
};

const wrapDoy = (d: number): number => ((d - 1) % 365 + 365) % 365 + 1;

export function seasonWindow(hullId: string): SeasonWindow {
  const passage = daysToMelinde(hullId);
  const first = doyOf(daysFromEpoch(1483, SW_OPEN.month, SW_OPEN.day) * DAY);
  const last = doyOf(daysFromEpoch(1483, SW_CLOSE.month, SW_CLOSE.day) * DAY);
  return { passage, openDoy: wrapDoy(first - passage), closeDoy: wrapDoy(last - passage) };
}

/** Is this day of year inside the departure window (which may straddle New Year)? */
export function inWindow(w: SeasonWindow, doy: number): boolean {
  return w.openDoy <= w.closeDoy ? doy >= w.openDoy && doy <= w.closeDoy : doy >= w.openDoy || doy <= w.closeDoy;
}

/** Days from `doy` until the window next opens (0 if open now). */
export function daysToOpen(w: SeasonWindow, doy: number): number {
  return inWindow(w, doy) ? 0 : ((w.openDoy - doy) % 365 + 365) % 365;
}

/** Days from `doy` until the window next closes (0 if closed now). */
export function daysToClose(w: SeasonWindow, doy: number): number {
  return inWindow(w, doy) ? ((w.closeDoy - doy) % 365 + 365) % 365 : 0;
}

/**
 * What sailing from Lisbon on this day costs against the monsoon, from the same
 * numbers the game uses: the Casa's days to Melinde, then the wait for the
 * south-west monsoon if she arrives before April or after September.
 */
export interface Consequence {
  arrivalDoy: number;
  /** 0 when the passage lands inside the monsoon. */
  waitDays: number;
  /** 'early' = wait at Melinde for it to open; 'late' = it has closed and the next opens after the north-east. */
  kind: 'on-time' | 'early' | 'late';
}

export function consequenceOf(w: SeasonWindow, t: number): Consequence {
  const dep = Math.floor(t / DAY);
  const arrive = (dep + w.passage) * DAY;
  const y = yearOfT(arrive);
  const arriveDays = Math.floor(arrive / DAY);
  const open = daysFromEpoch(y, SW_OPEN.month, SW_OPEN.day);
  const close = daysFromEpoch(y, SW_CLOSE.month, SW_CLOSE.day);
  const doy = doyOf(arrive);
  if (arriveDays >= open && arriveDays <= close) return { arrivalDoy: doy, waitDays: 0, kind: 'on-time' };
  if (arriveDays < open) return { arrivalDoy: doy, waitDays: open - arriveDays, kind: 'early' };
  return { arrivalDoy: doy, waitDays: daysFromEpoch(y + 1, SW_OPEN.month, SW_OPEN.day) - arriveDays, kind: 'late' };
}

// ---------------------------------------------------------------------------
// The year, as the game reads it

export function yearWindow(g: Game): SeasonWindow {
  return seasonWindow(g.ship.baseHull.id);
}

/** Career year: 1 from the first day, turning on the day the sailing window opens. */
export function yearNumber(g: Game, t = g.clock.t): number {
  const w = yearWindow(g);
  const shift = (w.openDoy - 1) * DAY;
  return yearOfT(t - shift) - yearOfT(g.startT - shift) + 1;
}

export function yearPhase(g: Game): YearPhase {
  if (g.year.pending && g.dockedAt === 'lisboa') return 'homecoming';
  if (g.dockedAt === 'lisboa' && !inWindow(yearWindow(g), g.clock.dayOfYear)) return 'quarters';
  return 'season';
}

const gradeCounts = (g: Game): [number, number, number, number] => {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  const anchors = soundingAnchors(g);
  for (const p of g.chart.points.values()) {
    const sounded = anchors.some((a) => haversine(p, a) / NM <= a.nm);
    out[gradeOf(p.passes, p.wLon, sounded) as Grade]++;
  }
  return out;
};

function takeBaseline(g: Game): YearBase {
  return {
    t: g.clock.t,
    year: yearNumber(g),
    purse: g.crown.gold,
    deaths: g.crew.deaths,
    grades: gradeCounts(g),
    coverage: g.chart.coverage(),
    ledgerLen: g.ledger.length,
    discoveries: g.crown.discoveries.length,
  };
}

/** Called as she weighs from any port: a voyage out of Lisbon starts the year's books. */
export function yearOnDeparture(g: Game): void {
  if (g.dockedAt !== 'lisboa') return;
  if (!g.year.baseline) g.year.baseline = takeBaseline(g);
  g.year.pending = null;
}

const money = (n: number) => `${n >= 0 ? '+' : '-'}${Math.abs(Math.round(n))} cruzados`;

export function buildReport(g: Game, b: YearBase): YearReport {
  const days = Math.round((g.clock.t - b.t) / DAY);
  let sold = 0, bought = 0;
  for (const book of g.trade.books) {
    for (const e of book.entries) {
      if (e.t < b.t) continue;
      if (e.kind === 'sell' || e.kind === 'barter' || e.kind === 'casa') { if (e.amount > 0) sold += e.amount; }
      else if (e.kind === 'buy') bought += Math.abs(e.amount);
    }
  }
  const now = gradeCounts(g);
  const raised = Math.max(0, (now[2] + now[3]) - (b.grades[2] + b.grades[3]));
  const sounded = Math.max(0, now[3] - b.grades[3]);
  const coverageGain = Math.max(0, g.chart.coverage() - b.coverage);
  const fam = new Map<string, number>();
  const fresh = g.ledger.slice(b.ledgerLen);
  for (const e of fresh) {
    const f = familyOf(e.tag);
    if (f === 'voyage') continue;
    fam.set(f, (fam.get(f) ?? 0) + 1);
  }
  const families = [...fam.entries()].sort((a, c) => c[1] - a[1]).slice(0, 4);
  const highlights = fresh
    .filter((e) => familyOf(e.tag) !== 'voyage' && e.note)
    .sort((x, y) => y.magnitude - x.magnitude)
    .slice(0, 2).map((e) => e.note);
  const discoveries = Math.max(0, g.crown.discoveries.length - b.discoveries);
  const deaths = Math.max(0, g.crew.deaths - b.deaths);
  const purseDelta = g.crown.gold - b.purse;
  const to = g.clock.t;

  const lines: string[] = [];
  lines.push(`Year ${yearNumber(g)}: home from ${days} days at sea, ${g.clock.formatDate()}.`);
  lines.push(`The year's profit: ${money(purseDelta)} in the purse.`);
  lines.push(sold + bought > 0
    ? `Cargo: ${Math.round(sold)} taken in sales, ${Math.round(bought)} laid out in goods.`
    : 'Cargo: nothing bought or sold.');
  lines.push(deaths > 0 ? `Men lost: ${deaths}.` : 'Men lost: none.');
  lines.push(raised > 0 || coverageGain > 0.0005
    ? `Charts: ${raised} stretches raised to Surveyed or better${sounded > 0 ? `, ${sounded} of them sounded` : ''}; ${(coverageGain * 100).toFixed(1)}% more of the route drawn true.`
    : 'Charts: nothing new drawn true this year.');
  if (discoveries > 0) lines.push(`Discoveries: ${discoveries} named.`);
  if (families.length) lines.push(`The Book: ${families.map(([f, n]) => `${f} ${n}`).join(', ')}.`);
  if (highlights.length && lines.length < 8) lines.push(highlights[0]);

  return {
    year: yearNumber(g), from: b.t, to, days, purseDelta, sold, bought, deaths, raised, sounded, coverageGain,
    discoveries, families, highlights, lines: lines.slice(0, 8),
  };
}

/**
 * Arrival. At Lisbon, with a baseline, the year's card is made once per career
 * year; a second return in the same year folds into the next card instead
 * (the baseline stays, so nothing is lost and nothing is shown twice).
 */
export function yearOnArrival(g: Game, toId: string): void {
  const y = g.year;
  if (toId !== 'lisboa' || !y.baseline) return;
  // Only a voyage worth a card: not the last dozen miles of a coasting hop.
  if ((g.clock.t - y.baseline.t) / DAY < 5) return;
  const now = yearNumber(g);
  if (y.lastHomeYear >= now) return;
  y.pending = buildReport(g, y.baseline);
  y.lastHomeYear = now;
  y.baseline = null;
  g.logEvent('note', y.pending.lines[0], true);
}

/** The card has been read. The next sailing starts the next year's books. */
export function dismissHomecoming(g: Game): void {
  g.year.pending = null;
}

// ---------------------------------------------------------------------------
// Winter quarters: what is on offer now, and what leaving costs

export interface QuartersView {
  title: string;
  phase: YearPhase;
  year: number;
  /** One line on where the season stands. */
  season: string;
  /** What leaving now costs, in the Casa's days; one line. */
  consequence: string;
  items: { label: string; value: string }[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayWord = (doy: number): string => {
  const days = daysFromEpoch(1483, 1, 1) + doy - 1;
  for (let m = 1; m <= 12; m++) {
    const start = daysFromEpoch(1483, m, 1);
    const end = m === 12 ? daysFromEpoch(1484, 1, 1) : daysFromEpoch(1483, m + 1, 1);
    if (days >= start && days < end) return `${days - start + 1} ${MONTHS[m - 1]}`;
  }
  return '';
};

export function quartersView(g: Game): QuartersView | null {
  if (g.dockedAt !== 'lisboa') return null;
  const w = yearWindow(g);
  const doy = g.clock.dayOfYear;
  const phase = yearPhase(g);
  const open = inWindow(w, doy);
  const cons = consequenceOf(w, g.clock.t);
  const india = g.chronicle.act >= 3;
  const month = g.clock.date.month;

  const season = open
    ? `The sailing season is open: leave by ${dayWord(w.closeDoy)} to raise Melinde, ${w.passage} days on the Casa's reckoning, as the south-west monsoon is blowing (${daysToClose(w, doy)} days left).`
    : `The sailing season opens ${dayWord(w.openDoy)}, ${daysToOpen(w, doy)} days from now (${w.passage} days to Melinde on the Casa's reckoning, then the south-west monsoon from April).`;

  let consequence: string;
  if (!india) {
    consequence = 'The Guinea road keeps no calendar the Casa knows: you may leave when you are ready. The monsoon governs the voyages after the Cape.';
  } else if (cons.kind === 'on-time') {
    consequence = `Sailing today she raises Melinde about ${dayWord(cons.arrivalDoy)}, inside the south-west monsoon: no wait.`;
  } else if (cons.kind === 'early') {
    consequence = `Sailing today she raises Melinde about ${dayWord(cons.arrivalDoy)}, ${cons.waitDays} days before the monsoon sets to India: a wait at Melinde, eating stores.`;
  } else {
    consequence = `Sailing today she raises Melinde about ${dayWord(cons.arrivalDoy)}, after the monsoon has closed: ${cons.waitDays} days to wait for the next, or the passage east against the wind.`;
  }

  const short = g.crew.complement - g.crew.count;
  const hull = g.ship.condition;
  const items: { label: string; value: string }[] = [
    { label: 'Hiring', value: short > 0 ? `${short} hands wanted at ${g.handWage()} cruzados a man; the quay is full of men in the off-season.` : 'She is fully manned.' },
    { label: 'Refit', value: hull.hull < 0.9 || hull.bilge > 1 || hull.leak > 0.02 ? 'The yard can mend and careen her; see the Yard.' : 'Sound; the yard is idle. A careening is still cheap in the off-season.' },
    { label: 'The Casa', value: 'Accounts and the King’s goods are settled at the Casa: see the Market quarter (Trade and Money).' },
    { label: 'Letters', value: g.lettersSeen.length > 0 ? 'Brokers’ letters wait in the Market quarter.' : 'No letters waiting.' },
    { label: 'Patron', value: 'Nothing is asked of you yet. A patron’s business will wait here.' },
  ];
  return {
    title: month >= 10 || month <= 3 ? 'Winter quarters' : 'Quarters at Lisbon',
    phase, year: yearNumber(g), season, consequence, items,
  };
}

/** For the Leg-Report style card: the pending homecoming, if any, and only at Lisbon. */
export function pendingHomecoming(g: Game): YearReport | null {
  return g.dockedAt === 'lisboa' ? g.year.pending : null;
}
