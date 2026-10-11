import { clamp, cosd, NM, type LatLon } from '../core/math';
import { newFleet, stepFleet, type Fleet, type HullClass as ClassSlot, type Shape, type Spacing } from '../fleet/formation';
import { polarAt } from '../ship/polars';
import { KNOTS, type DynamicState } from '../ship/physics';
import type { Game } from './state';

/**
 * The fleet the flagship sails with. See fleet/formation for the engine.
 *
 * Each consort is a hull; what it can make on this point of sail is read from
 * its own polar, so a heavy horse ship drops back on a close reach for a
 * visible reason. Only the flagship runs the full physics. If the master is
 * keeping the fleet together he holds her canvas to a shade under the slowest
 * hull's best, which is the one place the fleet reaches back into the flagship.
 */

export interface FleetShip {
  id: number;
  hullId: string;
  name: string;
}

export interface FleetSave {
  ships: FleetShip[];
  shape: Shape;
  spacing: Spacing;
  keepTogether: boolean;
}

const MPD = NM * 60;

export class PlayerFleet {
  ships: FleetShip[];
  formation: Fleet | null = null;
  shape: Shape;
  spacing: Spacing;
  keepTogether: boolean;
  /** The flagship's place on the fleet's own metre grid, accumulated from her moves. */
  private fx = 0;
  private fy = 0;
  private last: LatLon | null = null;
  /** The speed, m/s, the master holds her to while keeping together; Infinity when not. */
  limitMs = Infinity;
  /** The heading the formation last took from the flagship, for tests and the drawn compass. */
  lastHdg = 0;

  constructor(ships: FleetShip[], shape: Shape = 'crescent', spacing: Spacing = 'close', keepTogether = true) {
    this.ships = ships;
    this.shape = shape;
    this.spacing = spacing;
    this.keepTogether = keepTogether;
  }

  serialize(): FleetSave {
    return { ships: this.ships, shape: this.shape, spacing: this.spacing, keepTogether: this.keepTogether };
  }

  static deserialize(d: FleetSave): PlayerFleet {
    return new PlayerFleet(d.ships, d.shape, d.spacing, d.keepTogether);
  }

  /** (Re)form on the flagship, every ship in her place. */
  private form(flagHdg: number, flagSpd: number): void {
    const classes: ClassSlot[] = this.ships.map((s) => ({ id: s.hullId, speedFactor: 1, turnRate: turnRateOf(s.hullId) }));
    this.formation = newFleet({ x: this.fx, y: this.fy, hdg: flagHdg, spd: flagSpd }, classes, this.shape, this.spacing);
  }

  /** Reform in another order (a command from the flagship). */
  reform(shape: Shape, spacing: Spacing): void {
    this.shape = shape;
    this.spacing = spacing;
    if (!this.formation) return;
    const f = this.formation;
    const keep = f.consorts.map((c) => ({ x: c.x, y: c.y, hdg: c.hdg, spd: c.spd }));
    this.form(0, 0);
    // Ships stay where they are and sail to their new places; a command is not a teleport.
    this.formation!.consorts.forEach((c, i) => { c.x = keep[i].x; c.y = keep[i].y; c.hdg = keep[i].hdg; c.spd = keep[i].spd; });
  }

  step(g: Game, dt: number): void {
    if (dt <= 0) return;
    const p = g.ship.state.pos;
    if (this.last) {
      this.fx += (p.lon - this.last.lon) * MPD * cosd((p.lat + this.last.lat) / 2);
      this.fy += (p.lat - this.last.lat) * MPD;
    }
    this.last = { ...p };
    const cog = g.physics.courseOverGround * Math.PI / 180;
    const groundMs = g.physics.groundKnots * KNOTS;
    const hdg = groundMs > 0.6 ? cog : g.ship.state.heading * Math.PI / 180;
    if (!this.formation) this.form(hdg, groundMs);

    const wind = g.weatherNow.wind;
    const flagCap = Math.max(0.5, polarAt(g.ship.hullId, wind.speed, wind.from - g.ship.state.heading));
    let slowest = Infinity;
    const f = this.formation!;
    for (let i = 0; i < f.consorts.length; i++) {
      const c = f.consorts[i];
      const cap = polarAt(this.ships[i].hullId, wind.speed, wind.from - c.hdg * 180 / Math.PI);
      c.cls.speedFactor = clamp(cap / flagCap, 0.15, 1);
      slowest = Math.min(slowest, cap);
    }
    // The master holds her canvas a shade under the slowest hull's best.
    this.limitMs = this.keepTogether && Number.isFinite(slowest) ? Math.max(1, slowest * 0.95 * KNOTS) : Infinity;
    this.lastHdg = hdg;
    stepFleet(f, { x: this.fx, y: this.fy, hdg, spd: groundMs }, dt, flagCap * KNOTS);
  }

  /** The flagship's canvas is held to the fleet. */
  hold(s: DynamicState, groundMs: number): void {
    if (!Number.isFinite(this.limitMs) || groundMs <= this.limitMs || s.surge <= 0) return;
    // Over the ground, not through the water: a favouring current is no reason to leave the horse ships.
    s.surge *= this.limitMs / groundMs;
  }

  /** Every consort as the renderer draws her: a hull at a place, a heading, an angle to the wind. */
  poses(g: Game): { hullId: string; pos: LatLon; heading: number; beta: number }[] {
    const f = this.formation;
    if (!f) return [];
    const p = g.ship.state.pos;
    const wind = g.weatherNow.wind;
    return f.consorts.map((c, i) => {
      const heading = ((c.hdg * 180 / Math.PI) % 360 + 360) % 360;
      return {
        hullId: this.ships[i].hullId,
        pos: { lat: p.lat + (c.y - this.fy) / MPD, lon: p.lon + (c.x - this.fx) / (MPD * Math.max(cosd(p.lat), 1e-6)) },
        heading,
        beta: ((wind.from - heading + 540) % 360) - 180,
      };
    });
  }
}

function turnRateOf(hullId: string): number {
  // Degrees a second, from handiness (see ship/hull): a handy hull turns faster.
  const table: Record<string, number> = { zhanchuan: 4, zuochuan: 3.4, liangchuan: 3, shuichuan: 3.2, machuan: 2.8, baochuan: 2.6 };
  return table[hullId] ?? 3;
}
