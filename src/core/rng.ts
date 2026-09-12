/** Deterministic, seedable PRNG (mulberry32). */
export class Rng {
  private state: number;

  constructor(seed = 0x9e3779b9) {
    this.state = seed >>> 0;
  }

  static fromString(s: string): Rng {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return new Rng(h >>> 0);
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  int(lo: number, hi: number): number {
    return Math.floor(this.range(lo, hi + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Standard normal via Box-Muller. */
  normal(mean = 0, sd = 1): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  serialize(): number {
    return this.state;
  }

  restore(state: number): void {
    this.state = state >>> 0;
  }
}

/**
 * Smooth value noise in one dimension, used for slowly drifting quantities
 * such as wind direction and swell.
 */
export function valueNoise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  return hash1(i, seed) * (1 - s) + hash1(i + 1, seed) * s;
}

/** Layered value noise, returns roughly [-1, 1]. */
export function fbm1(x: number, octaves = 3, seed = 0): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += (valueNoise1(x * freq, seed + o * 101) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/**
 * A deterministic [0,1) from a pair of integers — one lattice cell, one field.
 *
 * Wanted wherever a world feature has to be laid out on a grid and be the same
 * every time anybody looks at it, without storing anything: the squall cells in
 * the doldrums are a field of these.
 */
export function hash2(i: number, j: number, seed: number): number {
  let h = Math.imul(i ^ seed, 0x27d4eb2d);
  h = Math.imul(h ^ (j + 0x9e3779b9), 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function hash1(i: number, seed: number): number {
  let h = Math.imul(i ^ seed, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
