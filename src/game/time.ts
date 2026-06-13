import type { GameDate } from "./types";

const MONTH_NAMES = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeap(year: number) {
  // Use Julian-style for the early modern period: every 4 years.
  return year % 4 === 0;
}

export function daysInMonth(year: number, month: number) {
  if (month === 2 && isLeap(year)) return 29;
  return DAYS_IN_MONTH[month - 1];
}

export function advanceOneDay(date: GameDate): GameDate {
  let { day, month, year } = date;
  day += 1;
  if (day > daysInMonth(year, month)) {
    day = 1;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return { day, month, year };
}

export function formatDate(d: GameDate): string {
  return `${d.day}. ${MONTH_NAMES[d.month - 1]} ${d.year}`;
}

export function formatDateShort(d: GameDate): string {
  return `${d.day.toString().padStart(2, "0")}.${d.month.toString().padStart(2, "0")}.${d.year}`;
}

export function dateOrder(d: GameDate): number {
  return d.year * 372 + d.month * 31 + d.day;
}
