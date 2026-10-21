/**
 * Refit as a place and a time (BUILD_PLAN B3).
 *
 * Careening, mending the hull, re-masting and re-rigging need a yard (a port
 * whose `refit` is worth the name) or, for the plainest work, a beach. The price
 * is parts consumed and days spent: the parts come out of the spares in the hold
 * first, and what is short is bought at the yard. A beach has no shop; it can do
 * only what the spares in the hold allow. Hull stays a scalar, with the
 * condition of each mast beside it.
 */
import { clamp } from '../core/math';
import { UPGRADE_BY_ID, nodeStatus, ordnanceResale, yardLevel, type Upgrade } from '../ship/upgrades';
import { combineEffects } from '../ship/upgrades';
import { trimToHold } from './stores';
import type { Game } from './state';

export type RefitJob = 'careen' | 'hull' | 'rig';

export interface RefitPlace {
  kind: 'yard' | 'beach' | 'none';
  /** 0-3 as yardLevel; 0 on a beach. */
  level: number;
  /** How well the place is supplied, 0-1: the port's refit, or a fixed poor figure on a beach. */
  supply: number;
  name: string;
}

export function refitPlace(g: Game): RefitPlace {
  const def = g.portHere;
  if (def && g.dockedAt) {
    return { kind: 'yard', level: yardLevel(def), supply: clamp(def.refit, 0.15, 1), name: def.name };
  }
  if (g.shoreHere && g.sounding.shoreDistNm < 6) {
    return { kind: 'beach', level: 0, supply: 0, name: 'the beach' };
  }
  return { kind: 'none', level: 0, supply: 0, name: '' };
}

/** What a full set of spares costs to replace at a yard: a tenth of the hull's price and a little more. */
export function setCost(g: Game): number {
  return g.ship.baseHull.cost * 0.12;
}

export interface RefitQuote {
  ok: boolean;
  why: string;
  job: RefitJob;
  /** Days the job takes. */
  days: number;
  /** Cruzados: parts bought short, plus the yard's labour. */
  gold: number;
  /** Fractions of a full set of spares used from the hold, and bought. */
  fromHold: number;
  bought: number;
  /** What it does, in words. */
  does: string;
}

const NO = (job: RefitJob, why: string): RefitQuote => ({ ok: false, why, job, days: 0, gold: 0, fromHold: 0, bought: 0, does: '' });

/** The sets of parts a job wants, and the days of work, before anything is on hand. */
function need(g: Game, job: RefitJob, place: RefitPlace): { sets: number; days: number; does: string } | null {
  const sup = Math.max(place.supply, 0.3);
  switch (job) {
    case 'careen':
      if (g.ship.condition.fouling < 0.03) return null;
      return { sets: 0.05, days: place.kind === 'beach' ? 7 : Math.round(5 / Math.sqrt(sup)), does: 'Clears the weed and worm from her bottom.' };
    case 'hull': {
      const lack = 1 - g.ship.condition.hull;
      if (lack < 0.01) return null;
      const reach = place.kind === 'beach' ? 0.7 : place.level >= 2 ? 1 : 0.85;
      const target = Math.max(g.ship.condition.hull, reach);
      const by = target - g.ship.condition.hull;
      if (by < 0.01) return null;
      return {
        sets: by * 2.5, days: Math.round((3 + by * 12) / Math.sqrt(sup)),
        does: `Hull to ${(target * 100).toFixed(0)}%${target < 1 ? ' (all this place can do)' : ''}.`,
      };
    }
    case 'rig': {
      const lack = g.ship.state.sails.reduce((s, sl) => s + (1 - sl.condition), 0);
      if (lack < 0.02) return null;
      const lost = g.ship.state.sails.filter((sl) => sl.condition <= 0.05).length;
      return {
        sets: lack * 0.15 + lost * 0.2, days: Math.round((1 + lack * 3 + lost * 4) / Math.sqrt(sup)),
        does: lost > 0 ? `Re-masts ${lost}, and bends new canvas on the rest.` : 'New canvas and mended rigging on every mast.',
      };
    }
  }
}

export function quoteRefit(g: Game, job: RefitJob): RefitQuote {
  const place = refitPlace(g);
  if (place.kind === 'none') return NO(job, 'There is no yard here and no beach to work from.');
  if (place.kind === 'beach' && job === 'rig') return NO(job, 'Re-masting wants a yard. A beach has no sticks to cut and no loft to cut canvas in.');
  if (place.kind === 'yard' && place.level < 1) return NO(job, 'There is no yard here worth the name. Careen her on a beach if you must.');
  if (job === 'rig' && place.level < 2) return NO(job, 'Wants a proper yard to step a mast or cut a sail.');
  const n = need(g, job, place);
  if (!n) return NO(job, job === 'careen' ? 'Her bottom is clean.' : job === 'hull' ? 'She wants nothing, or nothing this place can do.' : 'Her rig is sound.');
  const have = g.crew.spares ?? 0;
  const fromHold = Math.min(have, n.sets);
  const short = n.sets - fromHold;
  if (place.kind === 'beach' && short > 0.001) {
    return { ...NO(job, `She has ${(have * 100).toFixed(0)}% of a set of spares aboard and the work wants ${(n.sets * 100).toFixed(0)}%. A beach has no shop.`), days: n.days };
  }
  const buy = place.kind === 'yard' ? (short * setCost(g)) / Math.max(place.supply, 0.15) : 0;
  const labour = place.kind === 'yard' ? n.days * (6 + g.ship.baseHull.cost / 250) / Math.max(place.supply, 0.3) : 0;
  return { ok: true, why: '', job, days: n.days, gold: Math.ceil(buy + labour), fromHold, bought: short, does: n.does };
}

/** Do the job. Returns a line to show, or the reason it could not be done. */
export function doRefit(g: Game, job: RefitJob, wait = true): { ok: boolean; text: string } {
  const q = quoteRefit(g, job);
  if (!q.ok) return { ok: false, text: q.why };
  if (g.crown.gold < q.gold) return { ok: false, text: 'Not enough in the purse.' };
  const place = refitPlace(g);
  g.crown.gold -= q.gold;
  g.crew.spares = Math.max(0, (g.crew.spares ?? 0) - q.fromHold);
  if (job === 'careen') {
    g.ship.condition.fouling = 0;
  } else if (job === 'hull') {
    const reach = place.kind === 'beach' ? 0.7 : place.level >= 2 ? 1 : 0.85;
    g.ship.repair(Math.max(0, reach - g.ship.condition.hull));
  } else {
    for (const s of g.ship.state.sails) s.condition = 1;
  }
  if (wait) g.waitDays(q.days);
  g.syncStores();
  const where = place.kind === 'beach' ? 'on the beach' : `at ${place.name}`;
  const used = q.fromHold > 0 ? ` ${(q.fromHold * 100).toFixed(0)}% of a set of spares went into it.` : '';
  const text = {
    careen: `Careened ${where}: ${q.days} days, bottom scraped and payed.${used}`,
    hull: `Hull worked ${where}: ${q.days} days, ${q.gold} cruzados.${used}`,
    rig: `Re-rigged ${where}: ${q.days} days, ${q.gold} cruzados.${used}`,
  }[job];
  g.logEvent('note', text);
  return { ok: true, text };
}

/** Whether a fitting's yard work can be done here and now; the reason if not. */
export function fittingBlocked(g: Game, u: Upgrade): string | null {
  const place = refitPlace(g);
  if (place.kind !== 'yard') return 'Fittings are done in a yard, not off a beach.';
  const st = nodeStatus(u, g.ship.upgrades, g.ship.hullId, g.crown.lifetimeStanding, place.level);
  if (st.state === 'built') return 'Already fitted.';
  if (st.state === 'locked') return st.why;
  if (g.crown.gold < u.cost) return 'Not enough in the purse.';
  // The hold she will have afterwards must still stow what is in it.
  const after = g.ship.upgrades.filter((id) => !st.replaces.includes(id)).concat(u.id);
  const fx = combineEffects(after);
  const cap = Math.max(4, g.ship.baseHull.hold + fx.hold);
  const resident = g.ship.cargoTons + g.ship.reservedTons;
  if (resident > cap + 0.001) {
    return `She has ${resident.toFixed(1)} tons in her and would hold ${cap.toFixed(1)} with this fitted. Sell down first.`;
  }
  return null;
}

/** Fit it. Same-slot work comes out; ordnance that comes out is sold. */
export function fitFitting(g: Game, id: string): { ok: boolean; text: string } {
  const u = UPGRADE_BY_ID.get(id);
  if (!u) return { ok: false, text: 'No such work.' };
  const why = fittingBlocked(g, u);
  if (why) return { ok: false, text: why };
  const def = g.portHere!;
  const out = g.ship.upgrades.filter((x) => UPGRADE_BY_ID.get(x)?.slot === u.slot);
  g.crown.gold -= u.cost;
  let sold = 0;
  for (const x of out) {
    const old = UPGRADE_BY_ID.get(x)!;
    if (old.slot === 'ordnance') sold += ordnanceResale(old, def);
  }
  if (sold) g.crown.gold += sold;
  g.ship.upgrades = g.ship.upgrades.filter((x) => !out.includes(x)).concat(id);
  g.ship.applyRigConversion();
  g.ship.refreshDerived();
  g.waitDays(u.days);
  trimToHold(g);
  const gone = out.map((x) => UPGRADE_BY_ID.get(x)?.english).filter(Boolean);
  g.logEvent('note', `${u.english}: ${u.days} days in the yard at ${def.name}, ${u.cost} cruzados.`
    + `${gone.length ? ` Out came ${gone.join(', ')}${sold ? `, sold for ${sold}` : ''}.` : ''}`);
  return { ok: true, text: `${u.english} done. ${u.blurb}` };
}

/** Take a fitting out. Only ordnance is worth anything coming out, and it is sold. */
export function removeFitting(g: Game, id: string): { ok: boolean; text: string } {
  const u = UPGRADE_BY_ID.get(id);
  const place = refitPlace(g);
  if (!u || !g.ship.upgrades.includes(id)) return { ok: false, text: 'She has no such work.' };
  if (place.kind !== 'yard' || place.level < u.yard - 1) return { ok: false, text: 'It comes out in a yard.' };
  const after = g.ship.upgrades.filter((x) => x !== id);
  const fx = combineEffects(after);
  const cap = Math.max(4, g.ship.baseHull.hold + fx.hold);
  if (g.ship.cargoTons + g.ship.reservedTons > cap + 0.001) return { ok: false, text: 'Sell down the hold first: she would not stow it without that fitting.' };
  const sold = u.slot === 'ordnance' ? ordnanceResale(u, g.portHere!) : 0;
  g.crown.gold += sold;
  g.ship.upgrades = after;
  g.ship.applyRigConversion();
  g.ship.refreshDerived();
  g.waitDays(Math.max(1, Math.round(u.days / 3)));
  trimToHold(g);
  g.logEvent('note', `${u.english} taken out${sold ? ` and sold for ${sold} cruzados` : ''}.`);
  return { ok: true, text: `${u.english} taken out${sold ? `; ${sold} cruzados for the bronze` : ''}.` };
}

