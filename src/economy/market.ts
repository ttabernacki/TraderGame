import { priceMod } from '../world/portCharacter';
import { clamp, lerp } from '../core/math';
import { fbm1 } from '../core/rng';
import { GOODS, good, type Good } from './goods';
import { PORTS, portDef, type PortDef } from '../world/ports';
import { lotUnits, deepUnits, DEEP_PRICE, DEEP_BID } from './ladder';
import { dateFromDays } from '../core/clock';

export interface Listing {
  goodId: string;
  /** Units the port can sell you right now: the first lot and, where there is one, the deeper pool behind it. */
  stock: number;
  /**
   * Where a deeper pool stands behind the first lot (the Malabar and Eastern houses, see economy/ladder): the units
   * of `stock` on offer at the quoted ask. The rest is sold dearer, and the more of it the dearer (Markets.slippage). Absent where there is one tier.
   */
  lot?: number;
  /** Units the port still wants to buy before its appetite is satisfied: the first lot and, where there is one, the deeper buyers behind it. */
  appetite: number;
  /** Where deeper buyers stand behind the first lot (Lisbon's Flemish and German houses): the units of `appetite` at the quoted bid. The rest fetch less (Markets.sellSlippage). Absent where there is one tier. */
  appetiteLot?: number;
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

/**
 * What the Powers are doing to a port, as the economy sees it (world/powers `marketModifiers`: the one
 * door they have). A missing good is 1. With nothing in force nothing is applied and nothing changes.
 */
export interface MarketEffects {
  priceMult: Record<string, number>;
  stockMult: Record<string, number>;
  appetiteMult: Record<string, number>;
  duesMult: number;
  /** The market is shut to the ship (never a trunk port: there the mods carry a toll). */
  closed: boolean;
  laneClosed: boolean;
  reason: string;
}

export interface MarketState {
  portId: string;
  /** Per-good stock, which depletes when you buy and recovers over time. */
  stock: Record<string, number>;
  /** Per-good satiation, which rises when you sell and decays over time. */
  glut: Record<string, number>;
  lastUpdate: number;
  /**
   * When the quay's stock was last knocked off its baseline (a purchase or a sale). Recovery is a
   * straight line back over 90 days from that moment, which makes it the same whether it is
   * applied in one lump (a ship arriving) or month by month (the world tick). Absent in older saves.
   */
  disturbed?: number;
  /**
   * What outsiders to the lane sim (the player, his Lines, the rival) have bought off this quay and sold onto it lately,
   * by good, decaying month by month (world/lanes). Absent in older saves.
   */
  vol?: { b: Record<string, number>; s: Record<string, number> };
  /** Units the player and the like have lifted from the deeper pool (economy/ladder `deepUnits`), coming back as the houses restock. Absent in older saves. */
  deep?: Record<string, number>;
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

  /**
   * A port's prosperity, 0.5 to 1.6 (world/tick). Set by the game; 1 where nothing is
   * keeping count (the harness). Wealth in every market formula is `wealth0 * P`.
   */
  prosperityOf: (portId: string) => number = () => 1;

  /** What the place is worth now: its constant wealth times its prosperity. */
  wealthOf(def: PortDef): number {
    return def.wealth * this.prosperityOf(def.id);
  }

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
    return bySize * (0.5 + this.wealthOf(def));
  }

  /**
   * Baseline quantity a port keeps of a good it produces.
   *
   * Capped in tons by the hold of the hull class above the ones that call here,
   * and in money for the dense goods: see economy/ladder.
   */
  private baseStock(def: PortDef, g: Good, abundance: number): number {
    // A road to the interior, bought with a man's three years. What it changes
    // is not the price — it is that the goods arrive here through two pairs of
    // hands instead of four, so there is simply more of them and the town can
    // pay for more of them. See progression/inland.
    const road = this.roads.has(def.id) ? 1.7 : 1;
    const units = lotUnits(def, g, 'produces', abundance, road, this.wealthOf(def));
    const affordable = (this.valueCeiling(def) * abundance * road) / Math.max(g.lisbon, 0.01);
    return Math.max(1, Math.round(Math.min(units, affordable)));
  }

  /**
   * Whatever the rest of the world is doing to this price: news, the season,
   * other buyers. Set by the game; see economy/trade.
   */
  adjust: ((portId: string, goodId: string, t: number) => { ask: number; bid: number; stock: number }) | null = null;

  /** The Powers' door: war, embargo, cartaz and a Front's stage as multipliers. Set by the game; absent in the harness. */
  modifiers: ((portId: string, t: number) => MarketEffects) | null = null;

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
    return (0.26 + this.wealthOf(def) * 0.22) * scale * glutted;
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
    return Math.max(1, Math.round(scale * bulkiness * 22 * (0.4 + this.wealthOf(def)) * own));
  }

  private baseAppetite(def: PortDef, g: Good, hunger: number): number {
    // What a great market craves, it will take as much of as you can carry.
    //
    // Lisbon's appetite for pepper measured at ninety-one quintais, against a
    // caravel's hold of five hundred — so the hold, which is the central
    // scarcity of the entire genre, never once bound on any route. A city that
    // wants a thing badly now wants more of it than one voyage can bring, in
    // tons for the staples and in money for the dense goods (economy/ladder).
    return Math.max(1, Math.round(lotUnits(def, g, 'wants', hunger, 1, this.wealthOf(def))));
  }

  /** Units on the quay now, and that against what the town usually holds (1 = normal). */
  supply(portId: string, goodId: string): { stock: number; ratio: number } {
    const def = portDef(portId);
    const abundance = def.produces[goodId] ?? 0;
    if (abundance <= 0) return { stock: 0, ratio: 0 };
    const base = this.baseStock(def, good(goodId), abundance);
    const stock = this.stateFor(portId).stock[goodId] ?? base;
    return { stock, ratio: base > 0 ? stock / base : 0 };
  }

  /** How sated a town is with a good: 0 hungry, 3 drowning in it. */
  glutOf(portId: string, goodId: string): number {
    return this.stateFor(portId).glut[goodId] ?? 0;
  }

  /**
   * Refresh stocks and let gluts decay. Called when the player arrives, and by the monthly
   * world tick (world/tick) as its production and consumption passes.
   */
  refresh(portId: string, t: number): void {
    this.produce(portId, t);
    this.consume(portId, t);
  }

  /**
   * Production pass: what the port makes comes back toward its baseline, which is
   * scaled by prosperity. Reads `lastUpdate`; `consume` is what moves it on, so the
   * two are always called as a pair.
   */
  produce(portId: string, t: number): void {
    const s = this.stateFor(portId);
    const days = Math.max(0, (t - s.lastUpdate) / 86400);
    if (days <= 0) return;
    s.disturbed ??= s.lastUpdate;
    // Remaining gap after `days` more, as a fraction of the gap now, on a line that closes in 90 days.
    const d0 = Math.max(0, (s.lastUpdate - s.disturbed) / 86400);
    const ratio = d0 >= 90 ? 0 : Math.max(0, 1 - (d0 + days) / 90) / (1 - d0 / 90);
    const def = portDef(portId);
    for (const g of GOODS) {
      const abundance = def.produces[g.id] ?? 0;
      if (abundance <= 0) continue;
      const base = this.baseStock(def, g, abundance);
      const cur = s.stock[g.id] ?? base;
      // Stocks rebuild toward the baseline over a season.
      s.stock[g.id] = base + (cur - base) * ratio;
    }
    // The houses restock their godowns from the next harvest and the next fleet: a half-life of two months.
    if (s.deep) {
      const keep = Math.exp(-days / 90);
      for (const k of Object.keys(s.deep)) { s.deep[k] *= keep; if (s.deep[k] < 0.5) delete s.deep[k]; }
      if (Object.keys(s.deep).length === 0) delete s.deep;
    }
  }

  /** Consumption pass: gluts decay as the town works through what it was sold. Moves `lastUpdate` on. */
  consume(portId: string, t: number): void {
    const s = this.stateFor(portId);
    const days = Math.max(0, (t - s.lastUpdate) / 86400);
    s.lastUpdate = t;
    if (days <= 0) return;
    for (const g of GOODS) {
      const glut = s.glut[g.id] ?? 0;
      // Lisbon remembers a great landing of spice for a year: the whole of
      // Europe's pepper came through one quay, and every cargo put on it
      // pushed the price down for the next man.
      const slow = portId === 'lisboa' && (g.category === 'spice' || g.category === 'precious');
      if (glut > 0) s.glut[g.id] = Math.max(0, glut - days / (slow ? 365 : 120));
    }
  }

  /** Units in the deeper pool of a good at a port, before anyone has drawn on it, at time `t` (the wholesale season). 0 where there is no second tier. */
  deepBaseOf(portId: string, goodId: string, t: number): number {
    const def = portDef(portId);
    const abundance = def.produces[goodId] ?? 0;
    if (abundance <= 0) return 0;
    return deepUnits(def, good(goodId), abundance, dateFromDays(Math.floor(t / 86400)).month, this.wealthOf(def));
  }

  /** The baseline stock of a good a port produces (0 if it does not). */
  baseOf(portId: string, goodId: string): number {
    const def = portDef(portId);
    const abundance = def.produces[goodId] ?? 0;
    if (abundance <= 0) return 0;
    return this.baseStock(def, good(goodId), abundance);
  }

  /** Units a port still wants of a good, before the Powers' multiplier: its appetite less what it is sated with. 0 if it does not want it. */
  appetiteLeft(portId: string, goodId: string): number {
    const def = portDef(portId);
    const hunger = def.wants[goodId] ?? 0;
    if (hunger <= 0) return 0;
    return this.baseAppetite(def, good(goodId), hunger) * Math.max(0, 1 - (this.stateFor(portId).glut[goodId] ?? 0));
  }

  /** A lane's cargo landed: sates a port that wants it, restocks one that makes it. Returns what was taken in. */
  receive(portId: string, goodId: string, units: number): number {
    if (units <= 0) return 0;
    const def = portDef(portId);
    const g = good(goodId);
    const s = this.stateFor(portId);
    const hunger = def.wants[goodId] ?? 0;
    let took = 0;
    if (hunger > 0) {
      const appetite = Math.max(1, this.baseAppetite(def, g, hunger));
      s.glut[goodId] = clamp((s.glut[goodId] ?? 0) + units / appetite, 0, 3);
      took = units;
    } else if ((def.produces[goodId] ?? 0) > 0) {
      took = this.addStock(portId, goodId, units);
    }
    return took;
  }

  /** What outsiders have bought off and sold onto this quay lately. */
  volumeOf(portId: string, goodId: string): { bought: number; sold: number } {
    const v = this.stateFor(portId).vol;
    return { bought: v?.b[goodId] ?? 0, sold: v?.s[goodId] ?? 0 };
  }

  /** Let the volume record fade (the lane pass does this once a month). */
  decayVolume(portId: string, keep: number): void {
    const v = this.stateFor(portId).vol;
    if (!v) return;
    for (const m of [v.b, v.s]) {
      for (const k of Object.keys(m)) { m[k] *= keep; if (m[k] < 0.05) delete m[k]; }
    }
    if (Object.keys(v.b).length === 0 && Object.keys(v.s).length === 0) delete this.stateFor(portId).vol;
  }

  private noteVolume(portId: string, goodId: string, side: 'b' | 's', quantity: number): void {
    const st = this.stateFor(portId);
    const v = (st.vol ??= { b: {}, s: {} });
    v[side][goodId] = (v[side][goodId] ?? 0) + quantity;
  }

  /**
   * For the lanes pass (D1): move `units` of a good onto (+) or off (-) the quay,
   * within what the port can hold. Returns what actually moved.
   */
  addStock(portId: string, goodId: string, units: number): number {
    const def = portDef(portId);
    const abundance = def.produces[goodId] ?? 0;
    if (abundance <= 0) return 0;
    const s = this.stateFor(portId);
    const base = this.baseStock(def, good(goodId), abundance);
    const cur = s.stock[goodId] ?? base;
    const next = clamp(cur + units, 0, base * 1.4);
    s.stock[goodId] = next;
    s.disturbed = s.lastUpdate;
    return next - cur;
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
    // What the Powers are doing to this place (war, embargo, a Front's stage): read once, applied per good.
    const fx = this.modifiers ? this.modifiers(portId, t) : null;
    const month = dateFromDays(Math.floor(t / 86400)).month;

    for (const g of GOODS) {
      const abundance = def.produces[g.id] ?? 0;
      const hunger = def.wants[g.id] ?? 0;
      if (abundance <= 0 && hunger <= 0 && !held.has(g.id)) continue;

      const baseStock = abundance > 0 ? this.baseStock(def, g, abundance) : 0;
      const stock = abundance > 0 ? clamp(s.stock[g.id] ?? baseStock, 0, baseStock * 1.4) : 0;
      const scarcity = baseStock > 0 ? clamp(1 - stock / baseStock, 0, 1) : 0;
      // The houses behind the first lot: what is still in their godowns, over and above it.
      const deepLeft = abundance > 0 ? Math.max(0, this.deepBaseOf(portId, g.id, t) - (s.deep?.[g.id] ?? 0)) : 0;
      const hasDeep = abundance > 0 && deepUnits(def, g, abundance, 1, 1) > 0;
      const deepWant = hunger > 0 ? deepUnits(def, g, hunger, month, this.wealthOf(def), 'wants') : 0;
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

      // What this town does to the price: its customs, its monopoly, the one
      // thing it will pay anything for. See world/portCharacter.
      const mod = priceMod(portId, g.id);
      const world = this.adjust?.(portId, g.id, t) ?? { ask: 1, bid: 1, stock: 1 };

      out.push({
        goodId: g.id,
        stock: fx?.closed ? 0 : Math.floor((stock + deepLeft) * world.stock * (fx?.stockMult[g.id] ?? 1)),
        ...(hasDeep ? { lot: fx?.closed ? 0 : Math.floor(stock * world.stock * (fx?.stockMult[g.id] ?? 1)) } : {}),
        // Never quite zero. A market sated to the eyebrows still has somebody
        // who will take a little more if the price is bad enough, and a hard
        // stop at nought is how a captain ends up with a hold he can never
        // empty anywhere — which is the thing this whole section exists to
        // prevent. The price at full glut is a fraction of the good's worth, so
        // this is a way to cut a loss and never a way to make money.
        appetite: fx?.closed ? 0 : Math.max(1, Math.floor((this.appetiteFor(def, g, hunger, abundance) + deepWant) * (1 - glut) * (fx?.appetiteMult[g.id] ?? 1))),
        ...(deepWant > 0 ? { appetiteLot: fx?.closed ? 0 : Math.max(1, Math.floor(this.appetiteFor(def, g, hunger, abundance) * (1 - glut) * (fx?.appetiteMult[g.id] ?? 1))) } : {}),
        ask: Math.max(0.4, mid * (1 + spread) * mod.ask * world.ask * (fx?.priceMult[g.id] ?? 1)),
        bid: Math.max(0.2, bid * mod.bid * world.bid * (fx?.priceMult[g.id] ?? 1)),
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
  static slippage(quantity: number, available: number, lot?: number, curve: { base: number; rise: number } = DEEP_PRICE): number {
    if (available <= 0) return 1;
    if (lot === undefined || lot >= available || quantity <= 0) {
      const share = clamp(quantity / available, 0, 1);
      return 1 + share * share * 0.55;
    }
    // Two tiers: the first `lot` as ever; whatever is taken beyond it comes out of the houses' godowns, dearer
    // from the first unit and dearer as the pool is drawn down. Returns the average multiple over the whole order.
    const q = Math.min(quantity, available);
    const n1 = Math.min(q, Math.max(0, lot)), n2 = q - n1, deep = available - Math.max(0, lot);
    const first = lot > 0 ? n1 * (1 + 0.55 * (n1 / lot) ** 2) : 0;
    const second = n2 * (curve.base + curve.rise * 0.5 * clamp(n2 / deep, 0, 1));
    return (first + second) / q;
  }

  /** The same for a sale: divide the bid by it. Beyond the first lot the deeper buyers pay less, and less the more they are sold. */
  static sellSlippage(quantity: number, appetite: number, lot?: number): number {
    return Markets.slippage(quantity, appetite, lot, DEEP_BID);
  }

  /** Record a purchase, which draws down stock and pushes the price up. */
  buy(portId: string, goodId: string, quantity: number): void {
    const s = this.stateFor(portId);
    const def = portDef(portId);
    const g = good(goodId);
    const base = this.baseStock(def, g, def.produces[goodId] ?? 0);
    const cur = s.stock[goodId] ?? base;
    s.stock[goodId] = Math.max(0, cur - quantity);
    // Beyond the first lot a buyer is lifting from the houses' godowns.
    if (quantity > cur && deepUnits(def, g, def.produces[goodId] ?? 0, 1, 1) > 0) {
      (s.deep ??= {})[goodId] = (s.deep[goodId] ?? 0) + (quantity - Math.max(0, cur));
    }
    s.disturbed = s.lastUpdate;
    this.noteVolume(portId, goodId, 'b', quantity);
  }

  /** Record a sale, which sates the port's appetite and drives the price down. */
  sell(portId: string, goodId: string, quantity: number): void {
    const s = this.stateFor(portId);
    const def = portDef(portId);
    const g = good(goodId);
    const appetite = Math.max(1, this.appetiteFor(
      def, g, def.wants[goodId] ?? 0, def.produces[goodId] ?? 0));
    // Whatever the deeper buyers took is spread over their whole pool, not over the first lot alone.
    const deepWant = (def.wants[goodId] ?? 0) > 0 ? deepUnits(def, g, def.wants[goodId], dateFromDays(Math.floor(s.lastUpdate / 86400)).month, this.wealthOf(def), 'wants') : 0;
    const glutNow = s.glut[goodId] ?? 0;
    const first = Math.min(quantity, Math.max(1, appetite * (1 - glutNow)));
    s.glut[goodId] = clamp(glutNow + first / appetite + (quantity - first) / (appetite + deepWant), 0, 3);
    this.noteVolume(portId, goodId, 's', quantity);
    if (def.produces[goodId]) {
      const base = this.baseStock(def, g, def.produces[goodId]);
      s.stock[goodId] = Math.min(base * 1.4, (s.stock[goodId] ?? base) + quantity * 0.5);
      s.disturbed = s.lastUpdate;
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
