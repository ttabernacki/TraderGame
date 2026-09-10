/**
 * The sound of her.
 *
 * A game whose whole proposition is being aboard a ship had no audio at all,
 * which is a larger hole than any missing visual feature: wind is the thing a
 * sailor reads the weather by before he looks at anything, and a ship working
 * in a seaway is never silent.
 *
 * All of it is synthesised — filtered noise and a few oscillators — because a
 * single-file build cannot carry audio assets, and because noise through a
 * moving filter is genuinely what wind and water sound like. Nothing here is a
 * sample.
 *
 * Three continuous voices whose levels are driven by the simulation:
 *
 *   the wind      band-passed noise, rising in pitch and level with wind speed
 *   the water     low-passed noise at the bow, driven by speed through the water
 *   the working   slow creaks from the hull, driven by how hard she is rolling
 *
 * and the ship's bell, struck on the half-hour of the watch, which is the only
 * clock anybody aboard had.
 */

export interface SoundFrame {
  windKnots: number;
  /** Apparent wind over the deck, which is what you actually hear. */
  apparentKnots: number;
  speedKnots: number;
  waveHeight: number;
  /** Degrees of roll, for the working of the hull. */
  roll: number;
  /** How fast the clock is running, so the bell is not rung two hundred times. */
  rate: number;
  /** Bells of the watch, 1-8, or 0 when nothing is to be struck. */
  bells: number;
  belowDecks: boolean;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private waterGain: GainNode | null = null;
  private waterFilter: BiquadFilterNode | null = null;
  private creakGain: GainNode | null = null;

  private lastBells = -1;
  private started = false;
  private muted = false;

  /** How loud everything is, before the per-voice mix. */
  private volume = 0.6;

  /**
   * Audio cannot start until the player has interacted with the page, so this
   * is called from the first click or key rather than at load.
   */
  start(): void {
    if (this.started) return;
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.started = true;

    const ctx = new Ctor();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    master.connect(ctx.destination);
    this.master = master;

    // --- The wind ----------------------------------------------------------
    // Band-passed noise. The centre frequency climbs with the wind, which is
    // why a gale sounds higher as well as louder — it is the same air moving
    // faster through the same rigging.
    const wind = ctx.createGain();
    wind.gain.value = 0;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.7;
    noise(ctx).connect(windFilter).connect(wind).connect(master);
    this.windGain = wind;
    this.windFilter = windFilter;

    // --- The water ---------------------------------------------------------
    // Low-passed noise: the bow wave and the wake, which is a broader and much
    // duller sound than the wind and rises with speed rather than with weather.
    const water = ctx.createGain();
    water.gain.value = 0;
    const waterFilter = ctx.createBiquadFilter();
    waterFilter.type = 'lowpass';
    waterFilter.frequency.value = 700;
    waterFilter.Q.value = 0.4;
    noise(ctx).connect(waterFilter).connect(water).connect(master);
    this.waterGain = water;
    this.waterFilter = waterFilter;

    // --- The working of her ------------------------------------------------
    // A wooden hull in a seaway is a loud object. Two detuned low oscillators
    // through a slow tremolo give the groan without needing a sample.
    const creak = ctx.createGain();
    creak.gain.value = 0;
    creak.connect(master);
    for (const f of [58, 87]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const shaper = ctx.createBiquadFilter();
      shaper.type = 'lowpass';
      shaper.frequency.value = 240;
      osc.connect(shaper).connect(creak);
      osc.start();
    }
    this.creakGain = creak;

    if (ctx.state === 'suspended') void ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.08);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Drive the mix from the simulation. Called every frame. */
  update(f: SoundFrame): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') return;
    const now = ctx.currentTime;
    const ease = 0.25;

    // Below decks everything is muffled and the water is louder against the
    // planking than the wind is over it.
    const muffle = f.belowDecks ? 0.45 : 1;

    if (this.windGain && this.windFilter) {
      const w = clamp01(f.apparentKnots / 45);
      this.windGain.gain.setTargetAtTime(w * w * 0.5 * muffle, now, ease);
      this.windFilter.frequency.setTargetAtTime(300 + w * 1500, now, ease);
      this.windFilter.Q.setTargetAtTime(0.6 + w * 1.8, now, ease);
    }

    if (this.waterGain && this.waterFilter) {
      const s = clamp01(Math.abs(f.speedKnots) / 9);
      const sea = clamp01(f.waveHeight / 5);
      this.waterGain.gain.setTargetAtTime((s * 0.34 + sea * 0.12) * (f.belowDecks ? 1.25 : 1), now, ease);
      this.waterFilter.frequency.setTargetAtTime(380 + s * 900 + sea * 300, now, ease);
    }

    if (this.creakGain) {
      const work = clamp01(Math.abs(f.roll) / 18) * clamp01(f.waveHeight / 3);
      this.creakGain.gain.setTargetAtTime(work * 0.05 * (f.belowDecks ? 1.6 : 1), now, 0.6);
    }

    // --- The bell ----------------------------------------------------------
    // Struck on the half-hour, one to eight, and it is the only clock anybody
    // aboard has. Silenced when the clock is wound right up, because eight
    // bells every second is not atmosphere.
    if (f.bells > 0 && f.bells !== this.lastBells && f.rate <= 60) {
      this.lastBells = f.bells;
      this.strikeBells(f.bells);
    } else if (f.bells !== this.lastBells) {
      this.lastBells = f.bells;
    }
  }

  /** Ring the bell: pairs of strokes, then the odd one. */
  private strikeBells(count: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    let t = ctx.currentTime + 0.05;
    for (let i = 0; i < count; i++) {
      this.ding(t);
      // Struck in twos, with the gap after each pair.
      t += i % 2 === 0 ? 0.26 : 0.52;
    }
  }

  private ding(at: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.16, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.5);
    g.connect(this.master);
    // A struck bell is a handful of inharmonic partials, which is what makes it
    // a bell rather than a note.
    for (const [mult, level] of [[1, 1], [2.02, 0.5], [3.01, 0.28], [4.17, 0.14]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 780 * mult;
      const og = ctx.createGain();
      og.gain.value = level;
      o.connect(og).connect(g);
      o.start(at);
      o.stop(at + 1.6);
    }
  }
}

/** A looping buffer of white noise, which is the raw material for wind and water. */
function noise(ctx: AudioContext): AudioBufferSourceNode {
  const seconds = 3;
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Brown-ish noise: white noise integrated, which has the low-frequency weight
  // that moving air and water actually have. Pure white sounds like a hiss.
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start();
  return src;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
