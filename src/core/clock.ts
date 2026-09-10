import { clamp } from './math';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WATCHES = [
  { name: 'Middle watch', start: 0 },
  { name: 'Morning watch', start: 4 },
  { name: 'Forenoon watch', start: 8 },
  { name: 'Afternoon watch', start: 12 },
  { name: 'First dog watch', start: 16 },
  { name: 'Last dog watch', start: 18 },
  { name: 'First watch', start: 20 },
];

/**
 * Multipliers offered to the player, in simulated seconds per real second.
 *
 * The low end is finely spaced on purpose. A passage under sail is measured in
 * weeks and six knots is genuinely slow, so almost nobody wants to watch it in
 * real time — but the jump straight from real time to thirty times left no
 * setting at which the ship simply feels like she is sailing briskly, which is
 * where a player wants to spend most of the voyage.
 */
export const TIME_SCALES = [0, 1, 4, 15, 60, 300, 1800, 7200] as const;
export const TIME_SCALE_LABELS = [
  'Hove to', 'Real time', 'x4', 'x15', 'x60', 'x300', 'Watch', 'Half-day',
] as const;

/**
 * Simulation clock. Time is tracked as seconds since 1 January 1430, which
 * comfortably precedes any voyage in the campaign.
 */
export class Clock {
  /** Simulated seconds since the epoch. */
  t = 0;
  /** Starts at four times, which is the pace a passage actually reads at. */
  scaleIndex = 2;
  /** Set while a modal screen is open; suspends time without losing the scale. */
  paused = false;

  constructor(startDate = { year: 1482, month: 7, day: 12 }) {
    this.t = daysFromEpoch(startDate.year, startDate.month, startDate.day) * 86400 + 6 * 3600;
  }

  get scale(): number {
    return this.paused ? 0 : TIME_SCALES[this.scaleIndex];
  }

  get scaleLabel(): string {
    return TIME_SCALE_LABELS[this.scaleIndex];
  }

  cycleScale(dir: number): void {
    this.scaleIndex = clamp(this.scaleIndex + dir, 0, TIME_SCALES.length - 1);
  }

  /** Advance by `realDt` seconds of wall time; returns simulated seconds elapsed. */
  advance(realDt: number): number {
    const dt = realDt * this.scale;
    this.t += dt;
    return dt;
  }

  /** Whole days since the epoch. */
  get day(): number {
    return Math.floor(this.t / 86400);
  }

  /** Hour of day as a float in [0, 24). */
  get hour(): number {
    return (this.t % 86400) / 3600;
  }

  get date(): { year: number; month: number; day: number } {
    return dateFromDays(this.day);
  }

  /** Day of the year, 1-based, used for solar declination. */
  get dayOfYear(): number {
    const d = this.date;
    return daysFromEpoch(d.year, d.month, d.day) - daysFromEpoch(d.year, 1, 1) + 1;
  }

  get watchName(): string {
    const h = this.hour;
    let w = WATCHES[0];
    for (const c of WATCHES) if (h >= c.start) w = c;
    return w.name;
  }

  /**
   * Bells of the watch: one to eight, struck every half hour from the start of
   * each four-hour watch. It was the only clock anybody aboard had, and it is
   * how a sailor knew how long he had left on deck.
   */
  get bells(): number {
    const intoWatch = this.hour % 4;
    return Math.floor(intoWatch * 2) + 1;
  }

  formatTime(): string {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`;
  }

  formatDate(): string {
    const d = this.date;
    return `${d.day} ${MONTHS[d.month - 1]} ${d.year}`;
  }

  formatShortDate(): string {
    const d = this.date;
    return `${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}/${d.year}`;
  }
}

const EPOCH_YEAR = 1430;

/** Days from 1 Jan 1430 to the given proleptic Gregorian date. */
export function daysFromEpoch(year: number, month: number, day: number): number {
  let days = 0;
  for (let y = EPOCH_YEAR; y < year; y++) days += isLeap(y) ? 366 : 365;
  for (let m = 1; m < month; m++) days += daysInMonth(year, m);
  return days + day - 1;
}

export function dateFromDays(days: number): { year: number; month: number; day: number } {
  let y = EPOCH_YEAR;
  let d = days;
  for (;;) {
    const len = isLeap(y) ? 366 : 365;
    if (d < len) break;
    d -= len;
    y++;
  }
  let m = 1;
  for (;;) {
    const len = daysInMonth(y, m);
    if (d < len) break;
    d -= len;
    m++;
  }
  return { year: y, month: m, day: d + 1 };
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

export function monthName(m: number): string {
  return MONTHS[m - 1];
}
