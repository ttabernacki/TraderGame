import { clamp, lerp } from '../core/math';
import { fbm1 } from '../core/rng';
import { GOODS, good, type Good } from './goods';
import { PORTS, portDef, type PortDef } from '../world/ports';

export interface Listing {
  goodId: string;
  /** Units the port can sell you right now. */
  stock: number;
  /** Units the port still wants to buy before its appetite is satisfied. */
  appetite: number;
  /** What they ask, per unit, before any bargaining. */
  ask: number;
  /** What they offer, per unit, before any bargaining. */
  bid: number;
  /** True when this is a local product rather than an import. */
  local: boolean;
  /**
   * True when the town actually wants the stuff. False means the only buyer is
   * a merchant taking it off your hands to move on somewhere else, and the
   * price says so — worth showing, because otherwise a middleman's offer looks
   * exactly like a market that has collapsed.
   */
  wanted: boolean;
}

export interface MarketState {
  portId: string;
  /** Per-good stock, which depletes when you buy and recovers over time. */
  stock: Record<string, number>;
  /** Per-good satiation, which rises when you sell and decays over time. */
  glut: Record<string, number>;
  lastUpdate: number;
}

/**
 * Port markets.
 *
 * The whole economic engine of the period sits in one number: pepper cost about
 * two cruzados the quintal at Calicut and sold for thirty at Lisbon. A single
 * cargo covered the cost of the voyage many times over, which is why men kept
 * going even when two ships in five never came back.
 */
export class Markets {
  private states = new Map<string, MarketState>();

  constructor(_seed: number) {
    for (const p of PORTS) {
      this.states.set(p.id, {
        portId: p.id,
        stock: {},
        glut: {},
        lastUpdate: 0,
      });
    }
  }

  private stateFor(portId: string): MarketState {
    let s = this.states.get(portId);
    if (!s) {
      s = { portId, stock: {}, glut: {}, lastUpdate: 0 };
      this.states.set(portId, s);
    }
    return s;
  }

  /**
   * What a place could plausibly have lying in its warehouses, in money.
   *
   * Stock is counted in units and scaled by how little room a unit takes, so
   * that a hold is filled by a sane number of them — you need a great many
   * quintais of pepper and very few lots of pearls. That multiplier tops out at
   * fourteen, and every valuable good in the game is light, so every one of
   * them collected the ceiling: Ormuz was found holding six hundred thousand
   * cruzados of precious stones, Columbo a hundred and thirty-seven thousand,
   * against thirty-odd thousand for the dearest *bulk* cargo anywhere. The
   * entire purchasable contents of the game come to thirty-six thousand. There
   * were towns on this coast with twenty shiploads of treasure in a shed.
   *
   * It made one trade — buy gold at Mina, sell it at Lisbon — worth a hundred
   * and eight thousand a year against nine hundred for the sugar run, because
   * the two have the same margin and only one of them lets you put eighteen
   * thousand cruzados on the table at once. Nothing else in the game was
   * capping the size of the bet.
   *
   * So a port's holding of any one thing is also capped by what the place is
   * worth. The figures are set above the dearest ordinary cargo, so bulk trade
   * is untouched to the last quintal; it bites only where a village was sitting
   * on a fortune in diamonds.
   */
  private valueCeiling(def: PortDef): number {
    const bySize = {
      anchorage: 900, village: 2500, town: 7000, city: 16000, emporium: 35000,
    }[def.size];
    return bySize * (0.5 + def.wealth);
  }

  /** Baseline quantity a port keeps of a good it produces. */
  private baseStock(def: PortDef, g: Good, abundance: number): number {
    const scale = { anchorage: 0.15, village: 0.4, town: 1, city: 2.2, emporium: 4.5 }[def.size];
    const bulkiness = clamp(0.06 / Math.max(g.bulk, 0.001), 0.4, 14);
    // A road to the interior, bought with a man's three years. What it changes
    // is not the price — it is that the goods arrive here through two pairs of
    // hands instead of four, so there is simply more of them and the town can
    // pay for more of them. See progression/inland.
    const road = this.roads.has(def.id) ? 1.7 : 1;
    const units = abundance * scale * bulkiness * 45 * (0.5 + def.wealth) * road;
    const affordable = (this.valueCeiling(def) * abundance * road) / Math.max(g.lisbon, 0.01);
    return Math.round(Math.min(units, affordable));
  }

  /** Ports whose inland road has been opened. */
  roads = new Set<string>();

  /** Open one, and let the stock rebuild to the new baseline from now on. */
  openRoad(portId: string, t: number): void {
    if (this.roads.has(portId)) return;
    this.roads.add(portId);
    // Refreshed from a long time ago so the new baseline is reached at once:
    // he has been away three years and the caravans have been coming down for
    // most of them.
    const s = this.stateFor(portId);
    s.lastUpdate = t - 400 * 86400;
    this.refresh(portId, t);
  }

  /**
   * How much of a thing nobody here asked for the town can absorb anyway, and
   * at what fraction of its worth.
   *
   * Every port in the game used to buy exactly the three or four goods written
   * into its `wants`, and *nothing else at all* — a good it had no appetite for
   * was not merely unprofitable, it was not on the screen. A captain who came
   * out of the Indian Ocean with a hold of cinnamon and put into a Guinea
   * factory for water could not sell an ounce of it, could not see that he
   * could not, and had no way to find out but sailing to the next place and
   * trying again. Across fifty-two ports and forty-two goods that is nine
   * tenths of every cargo unsellable at nine tenths of the world.
   *
   * That is not how a port works. There is always a merchant who will take a
   * parcel off your hands, because he is not buying it to use — he is buying it
   * to move on to somebody who wants it, and he prices in the voyage, the risk
   * and his own profit before he opens his mouth. So he pays badly: a third of
   * what the thing is worth in a rich emporium that can actually shift it, a
   * sixth at a beach where the only buyer is one factor with a shed. That is
   * far below what a port which genuinely wants the cargo will pay, and it is
   * meant to be. It is a way out of a hold full of the wrong thing, not a
   * route.
   */
  private middlemanFactor(def: PortDef, abundance: number): number {
    const scale = { anchorage: 0.55, village: 0.68, town: 0.85, city: 1, emporium: 1.1 }[def.size];
    // A place that grows the stuff itself has least reason of all to buy yours.
    const glutted = abundance > 0 ? 0.45 : 1;
    return (0.26 + def.wealth * 0.22) * scale * glutted;
  }

  /**
   * What the town will take, wanted or not. One number, so that the price on
   * the screen and the glut a sale leaves behind cannot drift apart.
   */
  private appetiteFor(def: PortDef, g: Good, hunger: number, abundance: number): number {
    if (hunger > 0) return this.baseAppetite(def, g, hunger);
    // A middleman's shed, not a city's hunger: a small parcel, and scaled to
    // the same bulk and size terms as everything else so a village cannot
    // swallow four hundred tons of pepper out of politeness.
    const scale = { anchorage: 0.12, village: 0.35, town: 0.9, city: 2, emporium: 4 }[def.size];
    const bulkiness = clamp(0.06 / Math.max(g.bulk, 0.001), 0.4, 14);
    const own = abundance > 0 ? 0.4 : 1;
    // Big enough to be worth walking up the quay for. At seven this came out at
    // six quintais of pepper in a market town — one per cent of a caravel's
    // hold — so a captain with the wrong cargo could technically sell and might
    // as well not have been able to.
    return Math.max(1, Math.round(scale * bulkiness * 22 * (0.4 + def.wealth) * own));
  }

  private baseAppetite(def: PortDef, g: Good, hunger: number): number {
    const scale = { anchorage: 0.12, village: 0.35, town: 0.9, city: 2, emporium: 4 }[def.size];
    const bulkiness = clamp(0.06 / Math.max(g.bulk, 0.001), 0.4, 14);
    // What a great market craves, it will take as much of as you can carry.
    //
    // Lisbon's appetite for pepper measured at ninety-one quintais, against a
    // caravel's hold of five hundred — so the hold, which is the central
    // scarcity of the entire genre, never once bound on any route. It was
    // always the far end's appetite, which meant a captain filled a third of
    // his ship and there was no cargo decision to make at all. A city that
    // wants a thing badly now wants more of it than one voyage can bring, and
    // the goods it only half wants still cap out — so the choice is what to
    // fill her with, not how little to bother carrying.
    const craving = 1 + hunger * hunger * 5;
    return Math.round(hunger * scale * bulkiness * 38 * (0.4 + def.wealth) * craving);
  }

  /** Refresh stocks and let gluts decay. Called when the player arrives. */
  refresh(portId: string, t: number): void {
    const s = this.stateFor(portId);
    const days = Math.max(0, (t - s.lastUpdate) / 86400);
    s.lastUpdate = t;
    if (days <= 0) return;

    const def = portDef(portId);
    for (const g of GOODS) {
      const abundance = def.produces[g.id] ?? 0;
      if (abundance > 0) {
        const base = this.baseStock(def, g, abundance);
        const cur = s.stock[g.id] ?? base;
        // Stocks rebuild toward the baseline over a season.
        s.stock[g.id] = lerp(cur, base, clamp(days / 90, 0, 1));
      }
      const glut = s.glut[g.id] ?? 0;
      if (glut > 0) s.glut[g.id] = Math.max(0, glut - days / 120);
    }
  }

  /**
   * Current listings. `relation` is how well they regard you, -1 to 1, and
   * `tradeSkill` is the captain's bargaining, 0-1.
   */
  listings(
    portId: string, t: number, relation: number, tradeSkill: number,
    carrying: Iterable<string> = [],
  ): Listing[] {
    const def = portDef(portId);
    const s = this.stateFor(portId);
    const out: Listing[] = [];
    // What is in the hold is always on the counter, whether the town asked for
    // it or not. Listing all forty-two goods at every port instead would answer
    // the same complaint with a wall of rows nobody wants to read.
    const held = new Set(carrying);

    // Slow seasonal drift so prices are never quite the same twice.
    const season = fbm1(t / (86400 * 40) + hashPort(portId), 2, 3) * 0.14;

    for (const g of GOODS) {
      const abundance = def.produces[g.id] ?? 0;
      const hunger = def.wants[g.id] ?? 0;
      if (abundance <= 0 && hunger <= 0 && !held.has(g.id)) continue;

      const baseStock = abundance > 0 ? this.baseStock(def, g, abundance) : 0;
      const stock = abundance > 0 ? clamp(s.stock[g.id] ?? baseStock, 0, baseStock * 1.4) : 0;
      const scarcity = baseStock > 0 ? clamp(1 - stock / baseStock, 0, 1) : 0;
      const glut = s.glut[g.id] ?? 0;

      let priceFactor: number;
      if (abundance > 0) {
        // At the source, goods are cheap — but not thirty-one times cheaper
        // than at the sink, which is what the old floor and ceiling multiplied
        // out to. Every route in the game returned somewhere between eight and
        // twenty times the outlay with no risk and no scarcity, so a captain
        // was rich after one voyage and the ships, the upgrades, the charters
        // and the whole economy stopped meaning anything. The Guinea trade was
        // extraordinary; it was not free money.
        priceFactor = lerp(0.55, 0.22, abundance) * (1 + scarcity * 1.6);
      } else {
        priceFactor = 1;
      }
      if (hunger > 0) {
        const wantFactor = lerp(1.15, 2.1, hunger) / (1 + glut * 1.5);
        priceFactor = abundance > 0 ? Math.max(priceFactor, wantFactor * 0.6) : wantFactor;
      }
      priceFactor *= 1 + season;

      const mid = g.lisbon * priceFactor;
      // The spread narrows as they come to trust you and as you learn to haggle.
      const spread = clamp(0.30 - tradeSkill * 0.14 - relation * 0.07, 0.07, 0.36);

      // What they will give for it. A town that wants the thing bids off the
      // price it is worth here; a town that does not bids what a merchant with
      // a long voyage ahead of him and no particular need would offer, which is
      // a fraction of what the thing fetches where somebody actually wants it.
      const bid = hunger > 0
        ? mid * (1 - spread)
        : g.lisbon * this.middlemanFactor(def, abundance) * (1 + season) / (1 + glut * 1.5);

      out.push({
        goodId: g.id,
        stock: Math.floor(stock),
        // Never quite zero. A market sated to the eyebrows still has somebody
        // who will take a little more if the price is bad enough, and a hard
        // stop at nought is how a captain ends up with a hold he can never
        // empty anywhere — which is the thing this whole section exists to
        // prevent. The price at full glut is a fraction of the good's worth, so
        // this is a way to cut a loss and never a way to make money.
        appetite: Math.max(1, Math.floor(this.appetiteFor(def, g, hunger, abundance) * (1 - glut))),
        ask: Math.max(0.4, mid * (1 + spread)),
        bid: Math.max(0.2, bid),
        local: abundance > 0,
        wanted: hunger > 0,
      });
    }

    return out.sort((a, b) => {
      if (a.local !== b.local) return a.local ? -1 : 1;
      return good(b.goodId).lisbon - good(a.goodId).lisbon;
    });
  }

  /**
   * What a large order actually costs, as a multiple of the quoted price.
   *
   * A quote is for a reasonable parcel. Taking a third of everything in the
   * town moves the price against you while you are doing it — which is both
   * true and the thing that stops "buy the entire market in one click" from
   * being the optimal play in every port.
   */
  static slippage(quantity: number, available: number): number {
    if (available <= 0) return 1;
    const share = clamp(quantity / available, 0, 1);
    return 1 + share * share * 0.55;
  }

  /** Record a purchase, which draws down stock and pushes the price up. */
  buy(portId: string, goodId: string, quantity: number): void {
    const s = this.stateFor(portId);
    const def = portDef(portId);
    const g = good(goodId);
    const base = this.baseStock(def, g, def.produces[goodId] ?? 0);
    s.stock[goodId] = Math.max(0, (s.stock[goodId] ?? base) - quantity);
  }

  /** Record a sale, which sates the port's appetite and drives the price down. */
  sell(portId: string, goodId: string, quantity: number): void {
    const s = this.stateFor(portId);
    const def = portDef(portId);
    const g = good(goodId);
    const appetite = Math.max(1, this.appetiteFor(
      def, g, def.wants[goodId] ?? 0, def.produces[goodId] ?? 0));
    s.glut[goodId] = clamp((s.glut[goodId] ?? 0) + quantity / appetite, 0, 3);
    if (def.produces[goodId]) {
      const base = this.baseStock(def, g, def.produces[goodId]);
      s.stock[goodId] = Math.min(base * 1.4, (s.stock[goodId] ?? base) + quantity * 0.5);
    }
  }

  /**
   * What the captain has learned a distant port pays, once his trade skill is
   * good enough to keep track of the rumours in every factory.
   */
  rumouredPrice(portId: string, goodId: string): number | null {
    const def = portDef(portId);
    const abundance = def.produces[goodId] ?? 0;
    const hunger = def.wants[goodId] ?? 0;
    if (abundance <= 0 && hunger <= 0) return null;
    const g = good(goodId);
    if (abundance > 0) return g.lisbon * lerp(0.42, 0.10, abundance);
    return g.lisbon * lerp(1.35, 3.1, hunger);
  }

  serialize(): unknown {
    return [...this.states.values()];
  }

  restore(data: MarketState[]): void {
    if (!Array.isArray(data)) return;
    for (const st of data) this.states.set(st.portId, st);
  }
}

function hashPort(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
  return h / 9973;
}

/** Cost of a full refit of provisions at a port. */
export function provisioningCost(def: PortDef, days: number, men: number): number {
  const availability = clamp(def.refit, 0.05, 1);
  return Math.ceil((days * men * 0.012) / availability);
}
