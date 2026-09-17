import { clamp } from '../core/math';

/**
 * The money market of the Rua Nova.
 *
 * Until now a captain's finances were a single number that went up and a
 * credit line at the Casa that carried no interest, had no term, and was
 * quietly repaid out of the next settlement. Nobody ever lost anything to it,
 * which meant nobody ever had to think about it, which meant the richest and
 * most dangerous part of the actual business was the one part of the game with
 * no decisions in it.
 *
 * The real thing was not a bank. It was five or six Italian houses with offices
 * on one street in Lisbon, who between them financed most of what went down the
 * coast, and who had invented three completely different ways of putting money
 * into a ship — each of which put the risk somewhere else:
 *
 *   - **Câmbio marítimo.** The sea loan. Money now, a very large premium on
 *     arrival, and *the debt dies with the ship*. This is insurance sold as a
 *     loan, and it was priced as insurance: eighteen per cent to Madeira and
 *     the wrong side of sixty beyond the Cape. It is the expensive answer and
 *     the one that means a wreck costs you a ship rather than a life.
 *   - **A letra.** An ordinary obligation, secured on you. A third of the
 *     price of a sea loan, with a date on it — and if she goes down you still
 *     owe every cruzado, and the house has factors in every port you are
 *     likely to put into.
 *   - **Quinhões.** Sixteenths of the voyage itself, sold outright. There is
 *     nothing to repay ever; instead the men who bought them take their
 *     fraction of everything you land for the length of the voyage. It costs
 *     nothing on a bad passage and it costs you the earth on a good one.
 *
 * None of the three is correct, which is the whole point of having them. A
 * cautious captain sails on letras and is ruined once; a frightened one sails
 * on câmbios and pays for the privilege every time he comes home alive; a
 * greedy one sells sixteenths and watches a house take a fifth of the best
 * cargo of his life off the quay in front of him.
 */

export type HouseId = 'marchionni' | 'lomellini' | 'affaitati' | 'sernigi' | 'cambista';

export type DebtKind = 'cambio' | 'letra' | 'quinhao';

/** How far a house can reach when it wants its money. */
export type Reach = 'portugal' | 'atlantic' | 'everywhere';

export interface House {
  id: HouseId;
  name: string;
  /** Short form, for a line of prose. */
  short: string;
  nation: string;
  blurb: string;
  /** Multiplies every rate they quote. Under one is cheap money. */
  rate: number;
  /** The most they will have out with one captain at once, at full credit. */
  ceiling: number;
  /** What a stranger is worth to them, 0-100. */
  opening: number;
  /** Below this they will not deal at all. */
  floor: number;
  /** The instruments they write. */
  writes: DebtKind[];
  reach: Reach;
  /** What they say when they will not deal. */
  refusal: string;
}

export const HOUSES: House[] = [
  {
    id: 'marchionni', name: 'Bartolomeu Marchionni', short: 'Marchionni',
    nation: 'Florentine', rate: 1, ceiling: 4200, opening: 30, floor: 18,
    writes: ['cambio', 'letra', 'quinhao'], reach: 'everywhere',
    blurb: 'The largest private purse in Lisbon and the only foreigner the King '
      + 'lets into the Guinea trade. He has financed more of this coast than the Casa has, '
      + 'he prices a voyage better than the man sailing it, and he is never wrong by much.',
    refusal: 'He has read your account and will not be putting money into it.',
  },
  {
    id: 'lomellini', name: 'The house of Lomellini', short: 'the Lomellini',
    nation: 'Genoese', rate: 0.72, ceiling: 1800, opening: 12, floor: 52,
    writes: ['letra', 'cambio'], reach: 'atlantic',
    blurb: 'Genoese, four generations in the sugar of Madeira, and careful to the point '
      + 'of rudeness. Their money is the cheapest on the street and they will not lend it '
      + 'to a man who has not already come home twice.',
    refusal: 'They are civil about it. They are also quite clear that they lend to '
      + 'captains with a record, and you have not got one.',
  },
  {
    id: 'affaitati', name: 'The Affaitati', short: 'the Affaitati',
    nation: 'Cremonese', rate: 0.94, ceiling: 3000, opening: 20, floor: 30,
    writes: ['letra', 'quinhao'], reach: 'everywhere',
    blurb: 'Cremona by way of Antwerp, and they are not really interested in you: they are '
      + 'interested in pepper, and in owning some of it before it is landed. They buy '
      + 'sixteenths the way other men buy wine.',
    refusal: 'They will look at you again when there is a cargo worth owning part of.',
  },
  {
    id: 'sernigi', name: 'Girolamo Sernigi', short: 'Sernigi',
    nation: 'Florentine', rate: 1.24, ceiling: 2600, opening: 42, floor: 8,
    writes: ['cambio', 'quinhao'], reach: 'atlantic',
    blurb: 'A speculator, and he knows it and enjoys it. He will put money behind a scheme '
      + 'nobody else will touch, at a price nobody else would dare ask, and he would rather '
      + 'back a wild voyage that fails than a safe one that pays.',
    refusal: 'Even Sernigi has heard enough about you to keep his purse shut.',
  },
  {
    id: 'cambista', name: 'Rodrigo Anes, cambista', short: 'Anes',
    nation: 'Portuguese', rate: 1.75, ceiling: 900, opening: 60, floor: 0,
    writes: ['letra'], reach: 'portugal',
    blurb: 'A money-changer’s table at the foot of the Rua Nova with a locked chest under it. '
      + 'He lends to anybody, at a rate that tells you what he thinks of anybody, and the two '
      + 'men who fetch his money back are not clerks.',
    refusal: 'Even Anes has written you off, which takes some doing.',
  },
];

export const HOUSE_BY_ID = new Map<HouseId, House>(HOUSES.map((h) => [h.id, h]));

export function house(id: HouseId): House {
  const h = HOUSE_BY_ID.get(id);
  if (!h) throw new Error(`no house ${id}`);
  return h;
}

export interface Debt {
  id: string;
  house: HouseId;
  kind: DebtKind;
  /** What was put into your hand. */
  principal: number;
  /** Principal and premium together, for a câmbio or a letra. Zero for a quinhão. */
  owed: number;
  /** The premium as struck, as a fraction of principal. */
  rate: number;
  /** Simulated seconds at which it falls due. */
  dueBy: number;
  struck: number;
  /** Quinhão: sixteenths sold, and the fraction of everything landed they take. */
  sixteenths: number;
  share: number;
  /** Quinhão: what they have actually drawn, so the card can show the damage. */
  drawn: number;
  /** Where it was written. */
  atPort: string;
  /** What the câmbio was priced against, in the words used at the time. */
  voyage: string;
  settled: boolean;
  outcome: 'paid' | 'lost' | 'defaulted' | 'expired' | null;
  /** Days overdue at the last letter, so the same letter does not come twice. */
  dunned: number;
  /** Cargo already attached against this debt, in cruzados. */
  seized: number;
}

const round2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * What a sea loan costs.
 *
 * Almost all of it is the odds she comes back, because that is the only thing
 * the lender is actually selling. Credit moves it, but far less than the route
 * does: Marchionni liked you and still wanted sixty per cent for the Cape,
 * because the Cape did not care who you were.
 */
export function cambioRate(h: House, risk: number, credit: number): number {
  const base = 0.15 + clamp(risk, 0, 1) * 0.64;
  return round2(clamp(base * h.rate * (1.2 - (credit / 100) * 0.3), 0.1, 1.25));
}

/** What an ordinary obligation costs. Cheap, because the risk stays with you. */
export function letraRate(h: House, credit: number, days: number): number {
  const base = 0.065 + (days / 365) * 0.07;
  return round2(clamp(base * h.rate * (1.35 - (credit / 100) * 0.55), 0.035, 0.45));
}

/**
 * What a house will pay for a sixteenth.
 *
 * Under the odds, always — they are buying a share of a voyage that may be at
 * the bottom of the sea, and they price it as though it probably is. A captain
 * they trust gets nearer the true value, which is the whole return on being
 * known.
 */
export function quinhaoPrice(
  h: House, sixteenths: number, voyageValue: number, credit: number,
): number {
  const frac = sixteenths / 16;
  const confidence = 0.46 + (credit / 100) * 0.26;
  return Math.max(1, Math.round((voyageValue * frac * confidence) / h.rate));
}

/** The most this house will have out with you at once. */
export function ceilingFor(h: House, credit: number): number {
  if (credit < h.floor) return 0;
  return Math.round(h.ceiling * (0.25 + (credit / 100) * 0.75));
}

/**
 * Does this house have a man in this port who can hand over money, take it
 * back, or lay a hand on your cargo?
 *
 * Reach is the difference between an embarrassment and a disaster. Anes can
 * only touch you in Portugal, so a captain in debt to him can simply stay
 * away — at the cost of never going home. Marchionni has correspondents
 * everywhere the Portuguese trade, which is the whole map.
 */
export function reaches(h: House, port: { people: string; feitoria?: boolean; size: string }): boolean {
  if (h.reach === 'portugal') return port.people === 'portuguese';
  if (h.reach === 'atlantic') {
    return port.people === 'portuguese' || port.feitoria === true;
  }
  return port.people === 'portuguese' || port.feitoria === true
    || port.size === 'emporium' || port.size === 'city';
}

/**
 * The ledger.
 *
 * Everything owed, everything sold, and what each house thinks of you. Credit
 * is kept per house and moves on its own: pay a man back and he will lend you
 * more next time and cheaper, and the street hears about it and everybody's
 * opinion improves a little. Default and it goes the other way twice as fast,
 * because a bad debt is news and a good one is only business.
 */
export class Ledger {
  credit: Record<HouseId, number>;
  debts: Debt[] = [];
  /** Lifetime totals, for the epilogue and for the counting-house card. */
  borrowed = 0;
  repaid = 0;
  /** What the sharers have taken off the quay in front of you. */
  sharedOut = 0;
  defaults = 0;
  private nextId = 1;

  constructor(standing = 0) {
    this.credit = {} as Record<HouseId, number>;
    // A man with a name on the street starts a little ahead of one without,
    // but only a little: what these houses want is a record of coming back,
    // and the King's good opinion is not that.
    const head = clamp(standing / 40, 0, 18);
    for (const h of HOUSES) this.credit[h.id] = Math.round(clamp(h.opening + head, 0, 100));
  }

  /** Everything owed on loans, ignoring shares, which are not a debt. */
  owedTo(id?: HouseId): number {
    return this.debts.reduce((sum, d) => (
      d.settled || d.kind === 'quinhao' || (id && d.house !== id) ? sum : sum + d.owed - d.seized
    ), 0);
  }

  get live(): Debt[] {
    return this.debts.filter((d) => !d.settled);
  }

  /** The fraction of everything landed that belongs to somebody else. */
  get shareOut(): number {
    let f = 0;
    for (const d of this.debts) if (!d.settled && d.kind === 'quinhao') f += d.share;
    return Math.min(f, 0.75);
  }

  /**
   * Take the sharers' cut of a sum of money coming in.
   *
   * Returns what was taken. This is deliberately applied at the quay rather
   * than at a reckoning in Lisbon: the house's man is standing there with the
   * contract when the cargo is weighed, which is what a quinhão *was*, and it
   * hurts far more when you watch it happen.
   */
  takeShare(amount: number): number {
    if (amount <= 0) return 0;
    let taken = 0;
    const cap = this.shareOut;
    if (cap <= 0) return 0;
    const scale = cap / Math.max(cap, this.rawShare());
    for (const d of this.debts) {
      if (d.settled || d.kind !== 'quinhao') continue;
      const cut = amount * d.share * scale;
      d.drawn += cut;
      taken += cut;
    }
    this.sharedOut += taken;
    return taken;
  }

  private rawShare(): number {
    let f = 0;
    for (const d of this.debts) if (!d.settled && d.kind === 'quinhao') f += d.share;
    return f;
  }

  strike(d: Omit<Debt, 'id' | 'settled' | 'outcome' | 'dunned' | 'drawn' | 'seized'>): Debt {
    const debt: Debt = {
      ...d, id: `d${this.nextId++}`, settled: false, outcome: null, dunned: 0,
      drawn: 0, seized: 0,
    };
    this.debts.push(debt);
    this.borrowed += d.principal;
    return debt;
  }

  find(id: string): Debt | undefined {
    return this.debts.find((d) => d.id === id);
  }

  /** The houses, best opinion of you first. */
  byRegard(): House[] {
    return [...HOUSES].sort((a, b) => this.credit[b.id] - this.credit[a.id]);
  }

  /** Move a house's opinion of you, and let the street hear a little of it. */
  regard(id: HouseId, delta: number, gossip = 0.3): void {
    this.credit[id] = Math.round(clamp(this.credit[id] + delta, 0, 100));
    if (gossip === 0) return;
    for (const h of HOUSES) {
      if (h.id === id) continue;
      this.credit[h.id] = Math.round(clamp(this.credit[h.id] + delta * gossip, 0, 100));
    }
  }

  /**
   * Interest running on paper that is past its date.
   *
   * A letra that is not met does not sit still. It compounds, weekly, at a
   * rate that would be usury if anybody admitted the debt existed — which is
   * exactly what happened to captains who came home late, and is why the
   * difference between a ninety-day bill and a hundred-and-twenty-day one is a
   * decision worth making at the table rather than a detail.
   */
  accrue(t: number, days: number): void {
    if (days <= 0) return;
    for (const d of this.debts) {
      if (d.settled || d.kind === 'quinhao') continue;
      if (t <= d.dueBy) continue;
      // A câmbio that is late is merely late — the premium was the whole risk
      // and the lender has already been paid for it.
      const weekly = d.kind === 'letra' ? 0.011 : 0.004;
      d.owed *= (1 + weekly) ** (days / 7);
    }
  }

  daysOverdue(d: Debt, t: number): number {
    return Math.max(0, (t - d.dueBy) / 86400);
  }

  /**
   * She is gone.
   *
   * The one place where the three instruments come apart completely: the sea
   * loans are cancelled, the sixteenths are worthless and nobody asks for them
   * back, and every letra is still owed in full by a man standing on a beach
   * with nothing.
   */
  shipLost(): { cancelled: number; standing: number } {
    let cancelled = 0;
    let standing = 0;
    for (const d of this.debts) {
      if (d.settled) continue;
      if (d.kind === 'cambio') {
        cancelled += d.owed;
        d.settled = true;
        d.outcome = 'lost';
        // He knew. It is why he charged what he charged.
        this.regard(d.house, -4, 0.2);
      } else if (d.kind === 'quinhao') {
        d.settled = true;
        d.outcome = 'lost';
        this.regard(d.house, -3, 0.2);
      } else {
        standing += d.owed;
      }
    }
    return { cancelled, standing };
  }

  serialize(): unknown {
    return {
      credit: this.credit, debts: this.debts, borrowed: this.borrowed,
      repaid: this.repaid, sharedOut: this.sharedOut, defaults: this.defaults,
      nextId: this.nextId,
    };
  }

  static deserialize(d: {
    credit?: Record<HouseId, number>; debts?: Debt[]; borrowed?: number;
    repaid?: number; sharedOut?: number; defaults?: number; nextId?: number;
  } | null | undefined): Ledger {
    const l = new Ledger(0);
    if (!d) return l;
    if (d.credit) for (const h of HOUSES) l.credit[h.id] = d.credit[h.id] ?? h.opening;
    l.debts = (d.debts ?? []).map((x) => ({ ...x, seized: x.seized ?? 0 }));
    l.borrowed = d.borrowed ?? 0;
    l.repaid = d.repaid ?? 0;
    l.sharedOut = d.sharedOut ?? 0;
    l.defaults = d.defaults ?? 0;
    l.nextId = d.nextId ?? (l.debts.length + 1);
    return l;
  }
}

/** How a credit number reads on the card. */
export function creditWord(c: number): string {
  if (c >= 85) return 'They would lend you the house';
  if (c >= 68) return 'Good name';
  if (c >= 50) return 'Sound enough';
  if (c >= 32) return 'Watched';
  if (c >= 15) return 'Doubtful';
  return 'Not welcome';
}

/** The one line a house's card leads with. */
export function standingLine(h: House, credit: number): string {
  if (credit < h.floor) return h.refusal;
  if (credit >= 80) return `${h.short} sends out for wine when you come in.`;
  if (credit >= 55) return `${h.short} has your account open before you sit down.`;
  if (credit >= 35) return `${h.short} will deal, and will want the paper drawn tightly.`;
  return `${h.short} will deal, at a price that says what he thinks of the odds.`;
}

export function kindName(k: DebtKind): string {
  return k === 'cambio' ? 'Câmbio marítimo'
    : k === 'letra' ? 'Letra de câmbio' : 'Quinhões';
}

export function kindBlurb(k: DebtKind): string {
  return k === 'cambio'
    ? 'Repaid with the premium when you next make a port where they have a man. If the ship '
      + 'is lost the debt is lost with her, and that is what the premium buys.'
    : k === 'letra'
      ? 'An obligation on you, not on the ship. Cheap, and owed whatever happens to her. '
        + 'Past the date it compounds every week and their factors start looking for you.'
      : 'Sixteenths of the voyage, sold outright. Nothing is ever repaid; instead they take '
        + 'their fraction of everything you land until the voyage is discharged.';
}
