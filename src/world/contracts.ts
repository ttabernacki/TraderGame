import { NM, clamp, haversine } from '../core/math';
import { Rng } from '../core/rng';
import { good } from '../economy/goods';
import { PORTS, anchorageOf, portDef, type PortDef } from './ports';
import type { WorldHost } from './tick';
import { laneStateOf } from './laneState';

/**
 * Contracts (BUILD_PLAN D1): they replace the merchants' charters of `progression/ventures`.
 *
 * A quay that has stood under 30% of its usual stock of a good it makes for two months
 * running (a war on the road, a shut lane, the player's own buying, the rival's) posts a
 * contract: deliver q of g, at 1.3 to 1.8 times what the good asks there, in 60 to 120
 * days. The post is offered at the ports behind it on the road that make the good, so
 * the captain takes it up on the way and never has to turn back for it. He supplies the
 * goods himself, from the market; nothing is loaded for him, so nothing can be stolen
 * from a merchant. A contract delivered restocks the quay; one missed costs the advance,
 * a forfeit and standing.
 *
 * The shape is that of the old `Venture` (the UI reads the same fields), plus what a
 * posting needs. An old charter found in a save becomes one of these with `kind: 'venture'`
 * (see `migrateVenture`), keeping its consigned cargo.
 */

export interface PortContract {
  id: string;
  /** Who posted it, for the line and for holding a grudge. */
  patron: string;
  /** Where it is offered and taken up. */
  fromPort: string;
  /** Where the goods are wanted. */
  toPort: string;
  goodId: string;
  quantity: number;
  /** Paid on delivery. */
  fee: number;
  /** Paid at signing, and forfeit with the penalty if she never arrives. */
  advance: number;
  /** Ship-time by which she must be delivered. Set when the contract is signed. */
  dueBy: number;
  /** Cruzados forfeit if it is not delivered (the advance is part of it); a tenth of it in standing. */
  penalty: number;
  taken: boolean;
  delivered: boolean;
  failed: boolean;
  /** An old charter whose cargo was loaded for the merchant and is still consigned. */
  loaded: boolean;
  /** 'posted' is a quay's contract; 'venture' an old charter carried over from a save. */
  kind?: 'posted' | 'venture';
  /** Days allowed from signing. */
  days?: number;
  /** Per unit, agreed at the posting. */
  price?: number;
  /** When it was posted, and when the offer lapses. */
  postedT?: number;
  expires?: number;
}

/** The reasons a posting is made, and the numbers. */
export const LOW_RATIO = 0.3;
export const LOW_MONTHS = 2;
export const PRICE_MULT: [number, number] = [1.3, 1.8];
export const DAYS: [number, number] = [60, 120];
/** Months before a quay posts the same good again. */
export const COOLDOWN = 6;
/** Months an unsigned posting stays on the board. */
export const OFFER_MONTHS = 4;
const MAX_TONS = 25;
const MAX_FEE = 6000;
const MONTH = 30 * 86400;

const isPortuguese = (def: PortDef): boolean => def.people === 'portuguese' || def.people === 'castilian';

export function patronAt(def: PortDef): string {
  return isPortuguese(def) ? `the factor at ${def.name}` : `the merchants of ${def.name}`;
}

/**
 * The monthly check, from the lane pass. Counts the months each quay has shown under 30% of its
 * usual stock (as the Powers leave it: war and embargo cut what is shown), and posts.
 */
export function postContracts(h: WorldHost, t: number, mi: number): void {
  const st = laneStateOf(h);
  const mk = h.markets;
  const board = (h.postings ??= []);
  h.postings = board.filter((c) => !c.taken && (c.expires ?? Infinity) > t);
  for (const def of PORTS) {
    const fx = mk.modifiers ? mk.modifiers(def.id, t) : null;
    for (const gid of Object.keys(def.produces)) {
      if ((def.produces[gid] ?? 0) <= 0) continue;
      const key = `${def.id}:${gid}`;
      const { stock, ratio } = mk.supply(def.id, gid);
      const shown = ratio * (fx?.stockMult[gid] ?? 1);
      if (shown >= LOW_RATIO) { delete st.low[key]; continue; }
      st.low[key] = (st.low[key] ?? 0) + 1;
      if (st.low[key] < LOW_MONTHS) continue;
      if ((st.cool[key] ?? -1) > mi) continue;
      if (h.postings.some((c) => c.toPort === def.id && c.goodId === gid)) continue;
      const c = makePosting(h, def, gid, stock, t, mi);
      if (c) { h.postings.push(c); st.cool[key] = mi + COOLDOWN; }
    }
  }
}

function makePosting(h: WorldHost, def: PortDef, gid: string, stock: number, t: number, mi: number): PortContract | null {
  const mk = h.markets;
  const g = good(gid);
  const base = mk.baseOf(def.id, gid);
  if (base <= 0) return null;
  const rng = Rng.fromString(`contract:${h.seed}:${mi}:${def.id}:${gid}`);
  const ask = mk.listings(def.id, t, 0, 0.3).find((l) => l.goodId === gid)?.ask ?? g.lisbon;
  const mult = rng.range(PRICE_MULT[0], PRICE_MULT[1]);
  const price = ask * mult;
  const want = Math.max(0, 0.6 * base - stock);
  let q = Math.round(clamp(want, 4, MAX_TONS / Math.max(g.bulk, 0.0005)));
  q = Math.max(1, Math.min(q, Math.floor(MAX_FEE / Math.max(price, 0.01))));
  const fee = Math.round(q * price);
  if (fee < 40) return null;
  const days = Math.round(rng.range(DAYS[0], DAYS[1]));
  h.nextContractId ??= 1;
  const advance = Math.round(fee * 0.12);
  return {
    id: `c${h.nextContractId++}`, patron: patronAt(def), fromPort: '', toPort: def.id, goodId: gid, quantity: q,
    fee, advance, dueBy: 0, penalty: advance + Math.round(fee * 0.3), taken: false, delivered: false, failed: false, loaded: false,
    kind: 'posted', days, price, postedT: t, expires: t + OFFER_MONTHS * MONTH,
  };
}

/**
 * The contracts on offer at a port: those posted by a quay further along the road that this port makes the
 * good for, and that the captain knows the way to. `alongOf` is the road (progression/road `along`).
 */
export function contractOffersAt(
  board: PortContract[], at: PortDef, known: Set<string>, alongOf: (p: PortDef) => number,
  supply: (portId: string, goodId: string) => { stock: number; ratio: number }, now: number,
): PortContract[] {
  const out: PortContract[] = [];
  const here = alongOf(at);
  for (const c of board) {
    if (c.taken || (c.expires ?? Infinity) <= now || c.toPort === at.id) continue;
    if ((at.produces[c.goodId] ?? 0) <= 0) continue;
    const to = portDef(c.toPort);
    if (!known.has(to.id) && !to.known) continue;
    if (alongOf(to) <= here + 40) continue; // forward only: never a reason to sail back
    const nm = haversine(anchorageOf(at), anchorageOf(to)) / NM;
    if (nm < 120 || nm > 6500) continue;
    const s = supply(at.id, c.goodId);
    if (s.ratio < 0.6 || s.stock < c.quantity * 0.5) continue;
    out.push({ ...c, fromPort: at.id });
  }
  return out.sort((a, b) => b.fee - a.fee).slice(0, 3);
}

/** A contract once signed: the clock starts, the advance is the captain's. */
export function sign(c: PortContract, now: number): PortContract {
  return { ...c, taken: true, dueBy: now + (c.days ?? 90) * 86400 };
}

/** A charter in a save, as a contract. Active ones keep their date, advance and consigned cargo. */
export function migrateVenture(v: Record<string, unknown>): PortContract {
  const fee = Number(v.fee) || 0;
  return {
    id: String(v.id ?? ''), patron: String(v.patron ?? 'a merchant'), fromPort: String(v.fromPort ?? ''), toPort: String(v.toPort ?? ''),
    goodId: String(v.goodId ?? ''), quantity: Number(v.quantity) || 0, fee, advance: Number(v.advance) || 0,
    dueBy: Number(v.dueBy) || 0, penalty: Number(v.penalty) || Math.round(fee * 0.4),
    taken: v.taken !== false, delivered: !!v.delivered, failed: !!v.failed, loaded: !!v.loaded, kind: 'venture',
  };
}

// ---------------------------------------------------------------------------
// Words

const IRREGULAR: Record<string, string> = {
  'dozen strings': 'dozen strings', dozen: 'dozen', head: 'head', piece: 'pieces', lot: 'lots', moio: 'moios',
  quintal: 'quintais', 'arrátel': 'arráteis', arroba: 'arrobas', marco: 'marcos', chest: 'chests', pipe: 'pipes',
};

function unitPlural(unit: string, n: number): string {
  if (n === 1) return unit;
  return IRREGULAR[unit] ?? `${unit}s`;
}

/** A one-line description of what a contract asks. */
export function contractLine(c: PortContract): string {
  const g = good(c.goodId);
  return `${c.quantity} ${unitPlural(g.unit, c.quantity)} of ${g.name} to ${portDef(c.toPort).name}`;
}

/** Tons the contract's goods stow. */
export function contractTons(c: PortContract): number {
  return c.quantity * good(c.goodId).bulk;
}

/** How long is left, in days, or negative when it is already overdue. */
export function daysLeft(c: PortContract, t: number): number {
  return (c.dueBy - t) / 86400;
}
