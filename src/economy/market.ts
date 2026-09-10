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

  /** Baseline quantity a port keeps of a good it produces. */
  private baseStock(def: PortDef, g: Good, abundance: number): number {
    const scale = { anchorage: 0.15, village: 0.4, town: 1, city: 2.2, emporium: 4.5 }[def.size];
    const bulkiness = clamp(0.06 / Math.max(g.bulk, 0.001), 0.4, 14);
    return Math.round(abundance * scale * bulkiness * 45 * (0.5 + def.wealth));
  }

  private baseAppetite(def: PortDef, g: Good, hunger: number): number {
    const scale = { anchorage: 0.12, village: 0.35, town: 0.9, city: 2, emporium: 4 }[def.size];
    const bulkiness = clamp(0.06 / Math.max(g.bulk, 0.001), 0.4, 14);
    return Math.round(hunger * scale * bulkiness * 38 * (0.4 + def.wealth));
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
  listings(portId: string, t: number, relation: number, tradeSkill: number): Listing[] {
    const def = portDef(portId);
    const s = this.stateFor(portId);
    const out: Listing[] = [];

    // Slow seasonal drift so prices are never quite the same twice.
    const season = fbm1(t / (86400 * 40) + hashPort(portId), 2, 3) * 0.14;

    for (const g of GOODS) {
      const abundance = def.produces[g.id] ?? 0;
      const hunger = def.wants[g.id] ?? 0;
      if (abundance <= 0 && hunger <= 0) continue;

      const baseStock = abundance > 0 ? this.baseStock(def, g, abundance) : 0;
      const stock = abundance > 0 ? clamp(s.stock[g.id] ?? baseStock, 0, baseStock * 1.4) : 0;
      const scarcity = baseStock > 0 ? clamp(1 - stock / baseStock, 0, 1) : 0;
      const glut = s.glut[g.id] ?? 0;

      let priceFactor: number;
      if (abundance > 0) {
        // At the source, goods are astonishingly cheap.
        priceFactor = lerp(0.42, 0.10, abundance) * (1 + scarcity * 1.6);
      } else {
        priceFactor = 1;
      }
      if (hunger > 0) {
        const wantFactor = lerp(1.35, 3.1, hunger) / (1 + glut * 1.5);
        priceFactor = abundance > 0 ? Math.max(priceFactor, wantFactor * 0.6) : wantFactor;
      }
      priceFactor *= 1 + season;

      const mid = g.lisbon * priceFactor;
      // The spread narrows as they come to trust you and as you learn to haggle.
      const spread = clamp(0.30 - tradeSkill * 0.14 - relation * 0.07, 0.07, 0.36);

      out.push({
        goodId: g.id,
        stock: Math.floor(stock),
        appetite: hunger > 0 ? Math.max(0, Math.floor(this.baseAppetite(def, g, hunger) * (1 - glut))) : 0,
        ask: Math.max(0.4, mid * (1 + spread)),
        bid: Math.max(0.2, mid * (1 - spread)),
        local: abundance > 0,
      });
    }

    return out.sort((a, b) => {
      if (a.local !== b.local) return a.local ? -1 : 1;
      return good(b.goodId).lisbon - good(a.goodId).lisbon;
    });
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
    const appetite = Math.max(1, this.baseAppetite(def, g, def.wants[goodId] ?? 0));
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
