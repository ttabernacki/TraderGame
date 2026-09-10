import { clamp, type LatLon } from '../core/math';
import { good, GOOD_BY_ID } from '../economy/goods';
import { hullClass, totalSailArea, type HullClass, type MastSpec } from './hull';
import { deriveHull, initialSails, type DynamicState, type HullDerived, type SailState } from './physics';
import { combineEffects } from './upgrades';

export interface CargoLot {
  goodId: string;
  quantity: number;
  /** Average price paid, for the clerk's books and the profit reckoning. */
  cost: number;
}

export interface ShipCondition {
  /** Structural integrity, 0-1. */
  hull: number;
  /** Weed and shipworm, 0 clean to 1 foul. */
  fouling: number;
  /** Tons of water in the hold. She founders when this passes her capacity. */
  bilge: number;
  /** Rate she makes water, tons per day at rest. */
  leak: number;
}

export class Ship {
  name: string;
  hullId: string;
  state: DynamicState;
  derived: HullDerived;
  upgrades: string[] = [];
  cargo: CargoLot[] = [];
  condition: ShipCondition = { hull: 1, fouling: 0, bilge: 0, leak: 0.2 };
  /** Rig kinds, which upgrades may change from the hull's defaults. */
  rigOverride: ('lateen' | 'square')[] | null = null;

  constructor(name: string, hullId: string, at: LatLon, heading = 180) {
    this.name = name;
    this.hullId = hullId;
    const h = hullClass(hullId);
    this.derived = deriveHull(h);
    this.state = {
      pos: { ...at },
      heading,
      yawRate: 0,
      surge: 0,
      sway: 0,
      heel: 0,
      rudder: 0,
      sails: initialSails(h),
    };
  }

  get hull(): HullClass {
    const base = hullClass(this.hullId);
    const fx = this.effects;
    if (fx.sailArea === 1 && !this.rigOverride) return base;
    const masts: MastSpec[] = base.masts.map((m, i) => ({
      ...m,
      area: m.area * fx.sailArea,
      rig: this.rigOverride?.[i] ?? m.rig,
    }));
    return { ...base, masts, handiness: base.handiness * fx.handiness };
  }

  get baseHull(): HullClass {
    return hullClass(this.hullId);
  }

  get effects() {
    return combineEffects(this.upgrades);
  }

  get holdCapacity(): number {
    return Math.max(4, this.baseHull.hold + this.effects.hold);
  }

  get cargoTons(): number {
    let t = 0;
    for (const lot of this.cargo) {
      const g = GOOD_BY_ID.get(lot.goodId);
      if (g) t += g.bulk * lot.quantity;
    }
    return t;
  }

  get holdFree(): number {
    return Math.max(0, this.holdCapacity - this.cargoTons);
  }

  get sailArea(): number {
    return totalSailArea(this.hull);
  }

  /** Height of the masthead above the water, which sets how far the lookout sees. */
  get mastHeight(): number {
    return Math.max(...this.hull.masts.map((m) => m.ceHeight)) * 1.55;
  }

  /** Fraction of full canvas currently set, averaged across the masts. */
  get canvasSet(): number {
    const total = this.hull.masts.reduce((s, m) => s + m.area, 0);
    if (total <= 0) return 0;
    let set = 0;
    for (let i = 0; i < this.state.sails.length; i++) {
      set += this.hull.masts[i].area * this.state.sails[i].set;
    }
    return set / total;
  }

  setAllCanvas(fraction: number): void {
    for (const s of this.state.sails) s.set = clamp(fraction, 0, 1);
  }

  refreshDerived(): void {
    this.derived = deriveHull(this.hull);
  }

  applyRigConversion(): void {
    const fx = this.effects;
    if (!fx.convertRig) { this.rigOverride = null; return; }
    this.rigOverride = this.baseHull.masts.map(() => fx.convertRig!);
    this.refreshDerived();
  }

  addCargo(goodId: string, quantity: number, unitPrice: number): number {
    const g = good(goodId);
    const room = this.holdFree;
    const canTake = Math.min(quantity, Math.floor(room / g.bulk));
    if (canTake <= 0) return 0;
    const existing = this.cargo.find((c) => c.goodId === goodId);
    if (existing) {
      const totalCost = existing.cost * existing.quantity + unitPrice * canTake;
      existing.quantity += canTake;
      existing.cost = totalCost / existing.quantity;
    } else {
      this.cargo.push({ goodId, quantity: canTake, cost: unitPrice });
    }
    return canTake;
  }

  removeCargo(goodId: string, quantity: number): number {
    const lot = this.cargo.find((c) => c.goodId === goodId);
    if (!lot) return 0;
    const taken = Math.min(lot.quantity, quantity);
    lot.quantity -= taken;
    if (lot.quantity <= 0.001) this.cargo = this.cargo.filter((c) => c !== lot);
    return taken;
  }

  quantityOf(goodId: string): number {
    return this.cargo.find((c) => c.goodId === goodId)?.quantity ?? 0;
  }

  /** Value of everything in the hold at Lisbon reference prices. */
  manifestValue(): number {
    let v = 0;
    for (const lot of this.cargo) {
      const g = GOOD_BY_ID.get(lot.goodId);
      if (g) v += g.lisbon * lot.quantity;
    }
    return v;
  }

  /**
   * Daily wear: weed grows, the worm eats, seams work open, and cargo spoils in
   * a hold that is never dry.
   */
  age(days: number, waterTempFactor: number, pumpEffort: number): { swamped: boolean; spoiled: string[] } {
    const fx = this.effects;
    this.condition.fouling = clamp(
      this.condition.fouling + days * 0.0042 * waterTempFactor * fx.foulingRate,
      0, 1,
    );

    const leakRate = this.condition.leak * (2 - this.condition.hull);
    const pumped = pumpEffort * fx.pumping * days * 3.2;
    this.condition.bilge = Math.max(0, this.condition.bilge + days * leakRate - pumped);

    const spoiled: string[] = [];
    const damp = clamp(this.condition.bilge / Math.max(this.holdCapacity * 0.25, 1), 0, 1);
    for (const lot of [...this.cargo]) {
      const g = GOOD_BY_ID.get(lot.goodId);
      if (!g || g.spoilage <= 0) continue;
      const rate = g.spoilage * fx.spoilage * (1 + damp * 2.2) * (days / 30);
      const lost = lot.quantity * clamp(rate, 0, 0.9);
      if (lost > 0.01) {
        lot.quantity -= lost;
        if (lot.quantity < 0.5) {
          this.cargo = this.cargo.filter((c) => c !== lot);
          spoiled.push(g.name);
        }
      }
    }

    const swamped = this.condition.bilge > this.holdCapacity * 0.55;
    return { swamped, spoiled };
  }

  /** Storm and grounding damage. */
  damage(amount: number): void {
    const strength = this.baseHull.strength * this.effects.strength;
    const applied = amount / Math.max(strength, 0.2);
    this.condition.hull = clamp(this.condition.hull - applied, 0, 1);
    this.condition.leak += applied * 2.4;
  }

  repair(amount: number): void {
    this.condition.hull = clamp(this.condition.hull + amount, 0, 1);
    this.condition.leak = Math.max(0.15, this.condition.leak - amount * 2.4);
  }

  /** Damage to a single mast, which is how a dismasting starts. */
  damageMast(index: number, amount: number): boolean {
    const s: SailState | undefined = this.state.sails[index];
    if (!s) return false;
    s.condition = clamp(s.condition - amount, 0, 1);
    if (s.condition < 0.08) {
      s.set = 0;
      s.condition = 0;
      return true;
    }
    return false;
  }

  serialize(): unknown {
    return {
      name: this.name,
      hullId: this.hullId,
      state: this.state,
      upgrades: this.upgrades,
      cargo: this.cargo,
      condition: this.condition,
      rigOverride: this.rigOverride,
    };
  }

  static deserialize(data: any): Ship {
    const s = new Ship(data.name, data.hullId, data.state.pos, data.state.heading);
    s.state = data.state;
    s.upgrades = data.upgrades ?? [];
    s.cargo = data.cargo ?? [];
    s.condition = data.condition ?? { hull: 1, fouling: 0, bilge: 0, leak: 0.2 };
    s.rigOverride = data.rigOverride ?? null;
    s.refreshDerived();
    return s;
  }
}
