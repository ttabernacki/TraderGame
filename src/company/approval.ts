import { clamp } from '../core/math';
import type { Officer } from '../crew/crew';
import type { Entry } from '../ledger/ledger';
import { COMPANION_BY_KEY, type Companion } from './companions';

/**
 * Approval: what one man thinks of the captain, from the Ledger.
 *
 * Pure. Given an officer, the Ledger and the time, it returns a score from -100
 * to +100 and the one thing that moved it most. It reads only entries made
 * since he came aboard (he cannot hold a grudge for what he did not see), lets
 * them fade (a year at full weight, then a half-life of three), saturates each
 * tag (the fifth kindness of a kind is worth less than the first), and adds the
 * man's own regard, which the arcs and the quarterdeck events move directly.
 *
 * A bonded man is never below +40: the bond is the thing that says he has
 * decided.
 */

export const YEAR = 365.25 * 86400;

export interface Part { delta: number; because: string }
export interface Approval { score: number; why: string; word: string; parts: Part[] }

export function companionOf(o: Officer): Companion {
  return COMPANION_BY_KEY.get(o.arc ?? '') ?? COMPANION_BY_KEY.get('hired')!;
}

/** 1 for a year, then a half-life of three. */
export function recency(ageSeconds: number): number {
  const age = ageSeconds / YEAR;
  if (age <= 1) return 1;
  return Math.max(0.12, Math.pow(0.5, (age - 1) / 3));
}

/** Saturating sum: k full-weight entries of one tag count for at most about 2.2. */
const sat = (k: number): number => (1 - Math.pow(0.55, k)) / 0.45;

const LOYALTY_BASE = 0.6;
const LOYALTY_SCALE = 70;

export function approvalFor(o: Officer, ledger: Entry[], now: number): Approval {
  const comp = companionOf(o);
  const since = o.joined ?? -Infinity;
  const parts: Part[] = [];
  let total = 0;
  for (const w of comp.weights) {
    let k = 0;
    for (const e of ledger) {
      if (e.tag !== w.tag || e.t < since) continue;
      if (w.where && !w.where(e)) continue;
      k += clamp(e.magnitude, 0.3, 1) * recency(now - e.t);
    }
    if (k <= 0) continue;
    const delta = w.w * sat(k);
    total += delta;
    parts.push({ delta, because: w.because });
  }
  const own = (o.loyalty - LOYALTY_BASE) * LOYALTY_SCALE;
  const mem = o.memory?.[0];
  parts.push({ delta: own, because: mem ? mem : 'of how the voyage has gone' });
  total += own;
  let score = clamp(Math.round(total), -100, 100);
  if (o.bonded) score = Math.max(score, 40);
  return { score, why: causeOf(parts, score), word: approvalWord(score), parts };
}

/** The one thing that moved it most, in the direction it went. */
function causeOf(parts: Part[], score: number): string {
  const sign = score >= 0 ? 1 : -1;
  const pool = parts.filter((p) => Math.sign(p.delta) === sign && Math.abs(p.delta) >= 2);
  const best = (pool.length ? pool : parts).reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a), parts[0]);
  if (!best || Math.abs(best.delta) < 2) return 'Nothing has passed between you that he has remarked on.';
  const because = best.because;
  // Memories are written as what the captain did ("shamed him in front of the watch").
  const lead = /^(you |of |the |a |men |goods |an |your )/.test(because) ? because
    : /^was /.test(because) ? `he ${because}` : `you ${because}`;
  return `Because ${lead}.`;
}

/** One word. */
export function approvalWord(score: number): string {
  if (score >= 70) return 'Devoted';
  if (score >= 40) return 'Warm';
  if (score >= 10) return 'Easy';
  if (score > -10) return 'Wary';
  if (score > -40) return 'Cold';
  if (score > -80) return 'Hostile';
  return 'Done';
}

export const BOND_AT = 40;
export const DISSENT_AT = -40;
export const EXIT_AT = -80;
