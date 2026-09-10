import { NM, clamp, haversine } from '../core/math';
import type { Rng } from '../core/rng';
import { GOODS, good } from '../economy/goods';
import { PORTS, portDef, type PortDef } from '../world/ports';

/**
 * Private ventures: the trade a captain does on his own account.
 *
 * The Crown's commission is one thing at a time and takes months. Between the
 * orders there has to be something to want, or the middle of a campaign is
 * nothing but sailing. A venture is a merchant's contract taken in a port —
 * carry this to there by then, and be paid — and it is the player's own money
 * and his own risk, which is exactly how the trade actually worked.
 *
 * They are also the pressure. A charter with a date on it is the reason to
 * carry more canvas than is prudent, to take the shorter passage through worse
 * water, and to decide that the leak can wait.
 */

export interface Venture {
  id: string;
  /** Merchant's name, for flavour and for holding a grudge. */
  patron: string;
  fromPort: string;
  toPort: string;
  goodId: string;
  quantity: number;
  /** Paid on delivery. */
  fee: number;
  /** Paid up front, and forfeit with a penalty if she never arrives. */
  advance: number;
  /** Simulated seconds by which she must be delivered. */
  dueBy: number;
  /** Standing lost with the merchants of the world if it is not delivered. */
  penalty: number;
  taken: boolean;
  delivered: boolean;
  failed: boolean;
  /** Set when the cargo has actually been loaded, so it cannot be sold away. */
  loaded: boolean;
}

const PATRONS = [
  'Bartolomeu Marchionni', 'the house of Affaitati', 'Girolamo Sernigi',
  'the Casa da Guiné', 'Fernão Gomes', 'the Lomellini', 'Diogo de Braga',
  'the widow Correia', 'Anselmo de Palma', 'the Sernige brothers',
];

/**
 * The charters on offer at a port. Regenerated when the market is, so a captain
 * who lies at anchor for a month finds different business waiting.
 */
export function offerVentures(
  at: PortDef, t: number, rng: Rng, known: Set<string>, nextId: () => string,
): Venture[] {
  const out: Venture[] = [];
  // What this place actually produces is what a merchant here wants shipped.
  const produce = Object.keys(at.produces).filter((id) => GOODS.some((g) => g.id === id));
  if (produce.length === 0) return out;

  // Somewhere they trade with, that the player has heard of. A merchant does not
  // charter a ship to a place nobody can find.
  const destinations = PORTS.filter((p) => {
    if (p.id === at.id) return false;
    if (!known.has(p.id) && !p.known) return false;
    const d = haversine({ lat: at.lat, lon: at.lon }, { lat: p.lat, lon: p.lon }) / NM;
    return d > 120 && d < 6500;
  });
  if (destinations.length === 0) return out;

  const count = at.size === 'city' ? 3 : at.size === 'town' ? 2 : 1;
  const used = new Set<string>();
  for (let i = 0; i < count * 3 && out.length < count; i++) {
    const goodId = rng.pick(produce);
    const g = good(goodId);

    // A merchant charters a ship to somewhere that actually wants what he has.
    // Freight to a port with no appetite for the cargo is not a contract, it is
    // a donation, and offering it produced charters worth forty cruzados that
    // no captain would ever look at twice.
    const wanting = destinations.filter((p) => (p.wants[goodId] ?? 0) > 0.2);
    if (wanting.length === 0) continue;
    const to = rng.pick(wanting);
    if (used.has(`${goodId}:${to.id}`)) continue;
    used.add(`${goodId}:${to.id}`);

    const distNm = haversine({ lat: at.lat, lon: at.lon }, { lat: to.lat, lon: to.lon }) / NM;
    const hunger = to.wants[goodId] ?? 0.25;

    // Sized by what it *stows*, not by a count: a caravel's hold is forty-odd
    // tons, and forty units of pepper and forty head of horses are not remotely
    // the same cargo. A charter bigger than the ship is not a decision.
    // Capped both ways: by what she can stow, and by a count a merchant would
    // actually name. Four thousand arráteis of coral stows in nine tons and
    // still reads like a clerical error.
    const tons = rng.range(5, 15) * (0.5 + at.wealth);
    const quantity = Math.round(clamp(tons / Math.max(g.bulk, 0.002), 4, 240));

    // Freight was paid by the ton and the league, with a premium for how badly
    // the far end wanted it — plus a flat handling charge, which is what keeps a
    // cargo of salt from being carried for nothing.
    const carriage = quantity * (g.lisbon * (0.11 + hunger * 0.42) + 1.1)
      * (0.55 + distNm / 1500);
    const fee = Math.round(clamp(carriage, 110, 5200));

    // A generous allowance — about twice a good passage — because a charter the
    // player cannot possibly keep is not a decision, it is a tax.
    const days = clamp(distNm / 78 + 26, 34, 260);

    out.push({
      id: nextId(),
      patron: rng.pick(PATRONS),
      fromPort: at.id,
      toPort: to.id,
      goodId,
      quantity,
      fee,
      advance: Math.round(fee * rng.range(0.16, 0.3)),
      dueBy: t + days * 86400,
      penalty: Math.round(fee * 0.4),
      taken: false, delivered: false, failed: false, loaded: false,
    });
  }
  return out;
}

/** A one-line description of what a charter is asking. */
export function ventureLine(v: Venture): string {
  const g = good(v.goodId);
  return `${v.quantity} ${unitPlural(g.unit, v.quantity)} of ${g.name} `
    + `to ${portDef(v.toPort).name}`;
}

/** How many of a thing, in the words the cargo book would use. */
export function ventureTons(v: Venture): number {
  return v.quantity * good(v.goodId).bulk;
}

const IRREGULAR: Record<string, string> = {
  'dozen strings': 'dozen strings',
  dozen: 'dozen',
  head: 'head',
  piece: 'pieces',
  lot: 'lots',
  moio: 'moios',
  quintal: 'quintais',
  'arrátel': 'arráteis',
  arroba: 'arrobas',
  marco: 'marcos',
  chest: 'chests',
  pipe: 'pipes',
};

function unitPlural(unit: string, n: number): string {
  if (n === 1) return unit;
  return IRREGULAR[unit] ?? `${unit}s`;
}

/** How long is left, in days, or negative when it is already overdue. */
export function daysLeft(v: Venture, t: number): number {
  return (v.dueBy - t) / 86400;
}
