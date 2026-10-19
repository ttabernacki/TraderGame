import { dateFromDays } from '../core/clock';
import type { CalendarEntry, DeepPort } from './types';

/**
 * A Deep port's calendar: what the place is doing this month, and what it will be doing next.
 * Pure: a function of the date, so the port you come back to in March is not the port you left in October.
 */

const DAY = 86400;

export function entryActiveOn(e: CalendarEntry, month: number, day: number): boolean {
  if (!e.months.includes(month)) return false;
  return !e.days || (day >= e.days[0] && day <= e.days[1]);
}

/** What is running at ship-time `t`. */
export function activeEntries(deep: DeepPort, t: number): CalendarEntry[] {
  const d = dateFromDays(Math.floor(t / DAY));
  return deep.calendar.filter((e) => entryActiveOn(e, d.month, d.day));
}

/** The next entry to begin, and in how many days (within a year); null when everything is running or nothing will. */
export function nextEntry(deep: DeepPort, t: number): { entry: CalendarEntry; days: number } | null {
  const start = Math.floor(t / DAY);
  const now = new Set(activeEntries(deep, t).map((e) => e.id));
  let best: { entry: CalendarEntry; days: number } | null = null;
  for (const e of deep.calendar) {
    if (now.has(e.id)) continue;
    for (let d = 1; d <= 366; d++) {
      const x = dateFromDays(start + d);
      if (entryActiveOn(e, x.month, x.day)) {
        if (!best || d < best.days) best = { entry: e, days: d };
        break;
      }
    }
  }
  return best;
}

/** The arrival fever's multiplier from the calendar (1 when nothing in it speaks to fever). */
export function feverFactor(deep: DeepPort | null, t: number): number {
  if (!deep) return 1;
  return activeEntries(deep, t).reduce((m, e) => Math.max(m, e.fever ?? 1), 1);
}
