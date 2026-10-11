/**
 * Sailing a fleet.
 *
 * A fleet is an extension of the flagship, not a crowd around it. Every
 * consort has a slot in a formation drawn around the flag and sails only to hold
 * it: it does not wander, chase or orbit. The flagship alone runs the full
 * physics; a consort is a few lines of steering, so forty of them cost almost
 * nothing.
 *
 * Three rules make it feel like one body.
 *  - Slots live in the flagship's frame, so moving the flagship moves them all.
 *  - A turn reaches the ships by signal, nearest first, so the fleet turns as a
 *    wave that follows the helm a beat behind.
 *  - Corrections are relaxed exponentially rather than integrated step by step,
 *    so a consort can only ever drift into place, and the same code is stable
 *    at a frame, at a watch and at a day's step.
 *
 * Everything is in metres and seconds; headings are compass radians (0 north,
 * clockwise).
 */

export type Shape = 'column' | 'line' | 'crescent';
export type Spacing = 'close' | 'open';

export interface HullClass {
  id: string;
  /** Fraction of the flagship's speed this class can hold on the same point of sail. */
  speedFactor: number;
  /** Degrees a second it can turn. */
  turnRate: number;
}

export interface Flag { x: number; y: number; hdg: number; spd: number }

export interface Consort {
  id: number;
  cls: HullClass;
  /** Metres ahead of the flag, metres to starboard. */
  slotA: number;
  slotB: number;
  x: number;
  y: number;
  hdg: number;
  spd: number;
  /** Seconds a signal takes to reach this ship. */
  delay: number;
}

export interface Fleet {
  shape: Shape;
  spacing: Spacing;
  consorts: Consort[];
  /** Flagship states by time, newest last, for the signal to be read late. */
  history: { t: number; f: Flag }[];
  t: number;
  /** The flagship's master holds her canvas to the slowest class. */
  keepTogether: boolean;
}

export const CABLE = 185.2;
const SIGNAL_BASE = 3;
const SIGNAL_PER_M = 0.012;
/** How quickly a consort relaxes toward its place, per second. */
const GAIN = 0.035;
/** The most a consort may close on its slot, metres a second. */
const MAX_CLOSE = 1.5;
/** The most a consort's bow may be turned toward its place, radians. */
const TRIM = 8 * Math.PI / 180;

const norm = (a: number): number => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/** Slots, ahead and to starboard, for n ships behind the flag. */
export function slotsFor(n: number, shape: Shape, spacing: Spacing, weatherSide: 1 | -1 = 1): { a: number; b: number }[] {
  const gap = spacing === 'close' ? 180 : 360;
  // A row holds at most sixteen ships, so a big fleet is deep rather than wide
  // and stays within a mile and a half across.
  const ROW = 16;
  const out: { a: number; b: number }[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / ROW);
    const j = i % ROW;
    const rank = Math.floor(j / 2) + 1;
    const side = (j % 2 === 0 ? 1 : -1) * weatherSide;
    if (shape === 'column') out.push({ a: -gap * (i + 1), b: 0 });
    else if (shape === 'line') out.push({ a: -row * gap * 1.6, b: side * gap * rank });
    else {
      // The wings sweep back: the weather side and the ends take the warships.
      out.push({ a: -row * gap * 1.6 - gap * 0.35 * rank, b: side * gap * rank });
    }
  }
  return out;
}

export function newFleet(flag: Flag, classes: HullClass[], shape: Shape, spacing: Spacing): Fleet {
  const slots = slotsFor(classes.length, shape, spacing);
  const f: Fleet = { shape, spacing, consorts: [], history: [{ t: 0, f: { ...flag } }], t: 0, keepTogether: true };
  classes.forEach((cls, i) => {
    const c: Consort = { id: i, cls, slotA: slots[i].a, slotB: slots[i].b, x: 0, y: 0, hdg: flag.hdg, spd: flag.spd, delay: 0 };
    const p = slotWorld(flag, c);
    c.x = p.x; c.y = p.y;
    c.delay = SIGNAL_BASE + SIGNAL_PER_M * Math.hypot(c.slotA, c.slotB);
    f.consorts.push(c);
  });
  return f;
}

function slotWorld(flag: Flag, c: Pick<Consort, 'slotA' | 'slotB'>): { x: number; y: number } {
  const fx = Math.sin(flag.hdg), fy = Math.cos(flag.hdg);
  const rx = Math.cos(flag.hdg), ry = -Math.sin(flag.hdg);
  return { x: flag.x + c.slotA * fx + c.slotB * rx, y: flag.y + c.slotA * fy + c.slotB * ry };
}

/** What the flag was doing `ago` seconds back, interpolated; the signal ships read. */
function flagAt(f: Fleet, ago: number): Flag {
  const want = f.t - ago;
  const h = f.history;
  if (want <= h[0].t) return h[0].f;
  for (let i = h.length - 1; i > 0; i--) {
    if (h[i - 1].t <= want) {
      const a = h[i - 1], b = h[i];
      const u = b.t === a.t ? 1 : (want - a.t) / (b.t - a.t);
      return { x: a.f.x + (b.f.x - a.f.x) * u, y: a.f.y + (b.f.y - a.f.y) * u, hdg: a.f.hdg + norm(b.f.hdg - a.f.hdg) * u, spd: a.f.spd + (b.f.spd - a.f.spd) * u };
    }
  }
  return h[h.length - 1].f;
}

/** The speed the flagship's master holds her canvas to, if he is keeping the fleet together. */
export function fleetSpeedCap(f: Fleet, wanted: number): number {
  if (!f.keepTogether) return wanted;
  // A shade under the slowest hull's best, so a straggler can close up.
  const slowest = Math.min(1, ...f.consorts.map((c) => c.cls.speedFactor));
  return wanted * slowest * 0.95;
}

/**
 * `free` is the speed the flagship would make unconstrained on this point of sail;
 * a class's capability is its share of that, whatever the master is holding her to.
 */
export function stepFleet(f: Fleet, flag: Flag, dt: number, free: number = flag.spd): void {
  f.t += dt;
  f.history.push({ t: f.t, f: { ...flag } });
  // Keep a minute and a half of signal history.
  const oldest = f.t - 90;
  while (f.history.length > 2 && f.history[1].t < oldest) f.history.shift();

  // Exponential relaxation, so the correction is the same whether dt is a frame or a watch.
  const relax = 1 - Math.exp(-GAIN * dt);
  for (const c of f.consorts) {
    const seen = flagAt(f, c.delay);
    // The signal is old; dead-reckon the flag forward along the heading it signalled.
    const sx = Math.sin(seen.hdg), sy = Math.cos(seen.hdg);
    const ghost: Flag = { x: seen.x + sx * seen.spd * c.delay, y: seen.y + sy * seen.spd * c.delay, hdg: seen.hdg, spd: seen.spd };
    const slot = slotWorld(ghost, c);
    // Its own rig: it holds at most its class's share of the flag's speed, and falls astern if that is less.
    const cap = free * c.cls.speedFactor;
    const v = Math.min(seen.spd, cap);
    // Correction toward the place, a fraction of the error, never more than a slow walk.
    // The slot is where the flag is now, so the error once this ship has sailed its step is what remains.
    const ex = slot.x - c.x - sx * v * dt;
    const ey = slot.y - c.y - sy * v * dt;
    // The along-track part of the error is not closed faster than the hull can make good.
    // A hull at the flag's speed may press a little to close up; one already at its limit cannot.
    const room = c.cls.speedFactor >= 1 ? MAX_CLOSE : Math.max(0, cap - v);
    let dx = ex * relax, dy = ey * relax;
    const along = dx * sx + dy * sy;
    if (along > room * dt) { const cut = along - room * dt; dx -= sx * cut; dy -= sy * cut; }
    const dm = Math.hypot(dx, dy), lim = MAX_CLOSE * dt;
    if (dm > lim) { dx *= lim / dm; dy *= lim / dm; }
    const mx = sx * v * dt + dx, my = sy * v * dt + dy;
    c.x += mx; c.y += my;
    const sp = Math.hypot(mx, my) / Math.max(dt, 1e-6);
    // Steers mostly parallel to the flag, turned a few degrees toward its place.
    const toward = sp > 0.05 ? norm(Math.atan2(mx, my) - seen.hdg) : 0;
    const want = seen.hdg + Math.max(-TRIM, Math.min(TRIM, toward));
    const maxTurn = (c.cls.turnRate * Math.PI / 180) * dt;
    c.hdg += Math.max(-maxTurn, Math.min(maxTurn, norm(want - c.hdg)));
    c.spd = sp;
  }
}

export function slotError(flag: Flag, c: Consort): number {
  const s = slotWorld(flag, c);
  return Math.hypot(s.x - c.x, s.y - c.y);
}
