import { weightAt, type Entry } from '../ledger/ledger';
import type { Game } from '../game/state';
import type { DeepPort, PatronDef, Perk, Stage } from './types';
import { STAGES } from './types';

/**
 * The Patron's regard, read off the Ledger and the visits (BUILD_PLAN C4).
 *
 * Nothing is stored: the score is a pure function of the Ledger (faded by age, so an heir inherits a shorter
 * memory) and of the calls made here, so a save never needs migrating and the falsifier can recompute it. The
 * only stored thing is what he has already said (`powers.seen`), so he greets a deed once.
 */

export interface PatronReason { tag: string; delta: number; why: string }

export interface PatronView {
  patron: PatronDef;
  score: number;
  stage: Stage;
  /** Score at which the next stage begins, or null at the last. */
  nextAt: number | null;
  /** From visits alone. */
  visits: number;
  reasons: PatronReason[];
  unlocked: Perk[];
  locked: Perk[];
}

export const stageIndex = (s: Stage): number => STAGES.indexOf(s);
export const atLeast = (s: Stage, min: Stage): boolean => stageIndex(s) >= stageIndex(min);

const STAGE_WORD: Record<Stage, string> = {
  stranger: 'a stranger', acquaintance: 'an acquaintance', trusted: 'trusted', partner: 'a partner',
};
export const stageWord = (s: Stage): string => STAGE_WORD[s];

/** An entry counts for a rule if it was made here (or anywhere, for the rules that say so). */
function counts(e: Entry, port: string, anywhere: boolean | undefined): boolean {
  return anywhere ? true : e.place === port || e.target === port;
}

export function patronOf(g: Game, deep: DeepPort): PatronView {
  const p = deep.patron;
  const now = g.clock.t;
  const visits = Math.min(p.visitCap, (g.relationsFor(deep.port).visits ?? 0) * p.visitWeight);
  const reasons: PatronReason[] = [];
  let score = visits;
  for (const r of p.rules) {
    let delta = 0;
    for (const e of g.ledger) {
      if (e.tag !== r.tag || !counts(e, deep.port, r.anywhere)) continue;
      delta += r.weight * Math.max(0.2, e.magnitude) * weightAt(e, now);
    }
    if (Math.abs(delta) > 1e-6) { reasons.push({ tag: r.tag, delta, why: r.why }); score += delta; }
  }
  reasons.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  let idx = 0;
  p.thresholds.forEach((th, i) => { if (score >= th) idx = i + 1; });
  const stage = STAGES[idx];
  const unlocked = p.perks.filter((k) => atLeast(stage, k.stage));
  return {
    patron: p, score, stage, visits,
    nextAt: idx < p.thresholds.length ? p.thresholds[idx] : null,
    reasons, unlocked, locked: p.perks.filter((k) => !atLeast(stage, k.stage)),
  };
}

/** The best perk of a kind he gives at this regard (credit and price perks supersede one another). */
export function perkOf(v: PatronView, kind: Perk['kind']): Perk | null {
  const ks = v.unlocked.filter((k) => k.kind === kind);
  if (ks.length === 0) return null;
  return ks.reduce((a, b) => (stageIndex(b.stage) >= stageIndex(a.stage) ? b : a));
}

// -- What he says on seeing you ----------------------------------------------------------

const tKey = (port: string) => `place:patron:${port}:t`;
const sKey = (port: string) => `place:patron:${port}:stage`;

/**
 * The Patron's word on a call: a reaction to the strongest deed he has heard of since he last spoke, else the
 * line for a new regard, else the plain greeting on the first call. Said once; null when he has nothing new.
 */
export function patronArrival(g: Game, deep: DeepPort): string | null {
  const v = patronOf(g, deep);
  const seen = g.powers.seen;
  const lastT = seen[tKey(deep.port)];
  const lastStage = seen[sKey(deep.port)];
  const first = lastT === undefined;
  // He hears of a deed a day after it is done, not as the pen leaves the page.
  const heardBy = g.clock.t - 86400;

  let best: { line: string; weight: number } | null = null;
  for (const e of g.ledger) {
    if (e.t <= (lastT ?? -Infinity) || e.t > heardBy) continue;
    const line = v.patron.reactions[e.tag];
    if (!line) continue;
    const rule = v.patron.rules.find((r) => r.tag === e.tag);
    if (!rule || !counts(e, deep.port, rule.anywhere)) continue;
    const w = Math.abs(rule.weight) * Math.max(0.2, e.magnitude);
    if (!best || w > best.weight) best = { line, weight: w };
  }

  const idx = stageIndex(v.stage);
  const rose = lastStage !== undefined && idx > lastStage;
  const fell = lastStage !== undefined && idx < lastStage;
  let said: string | null = null;
  if (best) said = best.line;
  else if (rose) said = v.patron.rise[v.stage] ?? null;
  else if (first) said = v.patron.greet[v.stage];
  if (best && rose && v.patron.rise[v.stage]) said += ` ${v.patron.rise[v.stage]}`;
  if (!said && fell) said = v.patron.greet[v.stage];

  seen[tKey(deep.port)] = heardBy;
  seen[sKey(deep.port)] = idx;
  return said;
}
