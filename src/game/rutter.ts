import { clamp, cosd, wrap180, wrap360, type LatLon } from '../core/math';

/**
 * The roteiro: the pilot's own book.
 *
 * Not a collection screen and not a list of things found. A roteiro was a
 * working document — the accumulated, private, partly wrong knowledge of one
 * man's career, written down because the next passage depended on it and
 * because nobody else would write it for him. It held the set of the current
 * off a cape, which month the wind came fair, what the people at a river mouth
 * would take in trade, where the water was good, and which of it he had seen
 * himself and which he had off a Genoese in a tavern and did not believe.
 *
 * Three things follow from taking that seriously, and they are what this file
 * is for.
 *
 * The first is that every piece of knowledge carries how it was come by.
 * "Observed" and "rumoured" are not decoration: a pilot acted differently on
 * them, and so does this game. The second is that the book is *worth*
 * something, which means it can be given away — to the Crown for standing, to
 * the merchants for money, to the world for good — and that giving it away
 * costs you the advantage of having been the only man with it. The third is
 * that it is an object. It goes to sea. It gets wet, and burnt, and bled on,
 * and written in by other people, and what survives twenty years of that is
 * not a clean database.
 */

export type Confidence = 'observed' | 'reported' | 'rumoured' | 'speculative';

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  observed: 'Observed',
  reported: 'Reported',
  rumoured: 'Rumoured',
  speculative: 'Supposed',
};

/** How much a piece of knowledge is worth acting on, from nothing to certain. */
export const CONFIDENCE_WEIGHT: Record<Confidence, number> = {
  observed: 1,
  reported: 0.6,
  rumoured: 0.28,
  speculative: 0.15,
};

export type EntryKind =
  | 'coast' | 'port' | 'nature' | 'people' | 'chronicle'
  | 'passage' | 'rumour' | 'person';

export const KIND_LABEL: Record<EntryKind, string> = {
  coast: 'The coast',
  port: 'Ports and anchorages',
  nature: 'What grows and what swims',
  people: 'The peoples',
  chronicle: 'The chronicle',
  passage: 'Passages and the sea',
  rumour: 'What is said',
  person: 'Men and their characters',
};

/**
 * What a page has been through.
 *
 * Applied to the entry rather than to a note, because water gets into a book at
 * a place and ruins whatever happened to be written there — which may be the
 * one thing you needed.
 */
export type Damage = 'water' | 'blood' | 'fire' | 'torn' | 'foxed';

export const DAMAGE_LABEL: Record<Damage, string> = {
  water: 'water-stained',
  blood: 'blood on the page',
  fire: 'scorched',
  torn: 'torn',
  foxed: 'foxed and faded',
};

export interface Note {
  id: string;
  text: string;
  confidence: Confidence;
  /** Who it came from, when it did not come from you. */
  source?: string;
  t: number;
  /** Written by the player rather than by the ship. */
  mine?: boolean;
  /**
   * A fact the rest of the game can act on. See {@link Rutter.knows}.
   * Free-form so that new hooks do not need a new note type.
   */
  fact?: { tag: string; value?: number; target?: string };
}

export interface Entry {
  id: string;
  kind: EntryKind;
  /** The name the book gives it, which the player may change. */
  title: string;
  /** Where it is, by the reckoning of the day it was written. */
  lat: number;
  lon: number;
  /** Identity, so a second visit adds to the page instead of starting a new one. */
  key: string;
  opened: number;
  lastSeen: number;
  visits: number;
  notes: Note[];
  damage: Damage[];
  /** Where this page has been given away to, if anywhere. */
  published: 'crown' | 'merchants' | 'atlas' | null;
  /** Sim time of the publication, for the atlas. */
  publishedT?: number;
}

/**
 * A region of sea, five degrees square, and what the wind and the water do in
 * it in a given month.
 *
 * This is the part of a roteiro that actually got men to India. Nobody cared
 * that a Portuguese pilot had seen a cape; they cared that he could say the
 * wind in that latitude holds from the north-east from November to March and
 * the current sets a knot to the south-west all year. It is knowledge that
 * cannot be had except by being there and writing it down, it is the difference
 * between a six-week passage and a four-month one, and it is exactly what a
 * game about navigation should reward a player for accumulating.
 */
export interface SeaNote {
  key: string;
  /** South-west corner of the five-degree square. */
  lat: number;
  lon: number;
  /** Month, 1-12. */
  month: number;
  /** Vector sum of the observed wind, for a mean direction with a strength. */
  windE: number;
  windN: number;
  windKnots: number;
  currentE: number;
  currentN: number;
  /** Hours of observation that have gone into it. */
  hours: number;
}

export const REGION = 5;

export function regionKey(at: LatLon, month: number): string {
  const la = Math.floor(at.lat / REGION) * REGION;
  const lo = Math.floor(wrap180(at.lon) / REGION) * REGION;
  return `${la},${lo},${month}`;
}

function keyParts(key: string): { lat: number; lon: number; month: number } {
  const [la, lo, m] = key.split(',').map(Number);
  return { lat: la, lon: lo, month: m };
}

/** Enough watches in one square to be worth writing down as a rule. */
const SETTLED_HOURS = 30;

export class Rutter {
  entries: Entry[] = [];
  sea = new Map<string, SeaNote>();
  /** Pages the captain has written himself, kept apart for the atlas. */
  private nextId = 1;

  // -------------------------------------------------------------------------
  // Writing it
  // -------------------------------------------------------------------------

  find(key: string): Entry | undefined {
    return this.entries.find((e) => e.key === key);
  }

  /**
   * Open a page, or come back to one.
   *
   * Returns the entry and whether it was already there, because coming back to
   * a place you wrote up years ago is a different event from finding it, and
   * the book should say so.
   */
  open(
    kind: EntryKind, key: string, title: string, at: LatLon, t: number,
  ): { entry: Entry; fresh: boolean } {
    const had = this.find(key);
    if (had) {
      had.lastSeen = t;
      had.visits++;
      return { entry: had, fresh: false };
    }
    const entry: Entry = {
      id: `r${this.nextId++}`,
      kind, key, title,
      lat: at.lat, lon: at.lon,
      opened: t, lastSeen: t, visits: 1,
      notes: [], damage: [], published: null,
    };
    this.entries.push(entry);
    return { entry, fresh: true };
  }

  /**
   * Write a line on a page.
   *
   * Silently refuses a line that says the same thing as one already there, so a
   * coast run twenty times does not accumulate twenty identical observations —
   * but a *better-founded* version of the same thing replaces the old one,
   * because that is what happens when you finally see for yourself something
   * you had only been told.
   */
  note(
    entry: Entry, text: string, confidence: Confidence, t: number,
    opts: { source?: string; fact?: Note['fact']; mine?: boolean } = {},
  ): Note | null {
    const same = entry.notes.find((n) => n.text === text
      || (opts.fact && n.fact && n.fact.tag === opts.fact.tag
        && n.fact.target === opts.fact.target));
    if (same) {
      if (CONFIDENCE_WEIGHT[confidence] > CONFIDENCE_WEIGHT[same.confidence]) {
        same.text = text;
        same.confidence = confidence;
        same.source = opts.source;
        same.t = t;
        return same;
      }
      return null;
    }
    const n: Note = {
      id: `n${this.nextId++}`,
      text, confidence, t,
      source: opts.source,
      fact: opts.fact,
      mine: opts.mine,
    };
    entry.notes.push(n);
    return n;
  }

  // -------------------------------------------------------------------------
  // The sea itself
  // -------------------------------------------------------------------------

  /**
   * Another watch of wind and water in this square, averaged into what the book
   * already says about it.
   */
  observeSea(
    at: LatLon, month: number, windFrom: number, windKnots: number,
    currentToward: number, currentKnots: number, hours: number,
  ): void {
    const key = regionKey(at, month);
    let s = this.sea.get(key);
    if (!s) {
      const p = keyParts(key);
      s = {
        key, lat: p.lat, lon: p.lon, month: p.month,
        windE: 0, windN: 0, windKnots: 0, currentE: 0, currentN: 0, hours: 0,
      };
      this.sea.set(key, s);
    }
    const rad = Math.PI / 180;
    // The wind is summed as a vector so that a steady trade reads as a strong
    // mean and a month of variables reads as nothing at all, which is the
    // distinction a pilot actually wanted.
    s.windE += Math.sin(windFrom * rad) * hours;
    s.windN += Math.cos(windFrom * rad) * hours;
    s.windKnots += windKnots * hours;
    s.currentE += Math.sin(currentToward * rad) * currentKnots * hours;
    s.currentN += Math.cos(currentToward * rad) * currentKnots * hours;
    s.hours += hours;
  }

  /** What the book can say about this square in this month, or nothing. */
  seaFor(at: LatLon, month: number): {
    windFrom: number; windKnots: number; steadiness: number;
    currentToward: number; currentKnots: number; hours: number; settled: boolean;
  } | null {
    const s = this.sea.get(regionKey(at, month));
    if (!s || s.hours < 4) return null;
    return describeSea(s);
  }

  /** Every square the book has anything to say about, for drawing on a chart. */
  seaNotes(): SeaNote[] {
    return [...this.sea.values()].filter((s) => s.hours >= 4);
  }

  // -------------------------------------------------------------------------
  // Acting on it
  // -------------------------------------------------------------------------

  /**
   * What the book knows about a thing, as a number between nothing and one.
   *
   * This is how the rest of the game asks the rutter a question. The answer is
   * weighted by how the knowledge was come by, so a rumour of good water is
   * worth something and not much, and a thing you saw yourself is worth all of
   * it. Nothing in the game should ever ask "is there an entry": it should ask
   * how sure the book is, and act proportionately.
   */
  knows(tag: string, target?: string): number {
    let best = 0;
    for (const e of this.entries) {
      for (const n of e.notes) {
        if (!n.fact || n.fact.tag !== tag) continue;
        if (target !== undefined && n.fact.target !== target) continue;
        best = Math.max(best, CONFIDENCE_WEIGHT[n.confidence]);
      }
    }
    return best;
  }

  /** The recorded value of a fact, if the book has one. */
  valueOf(tag: string, target?: string): number | null {
    let best: number | null = null;
    let bestW = 0;
    for (const e of this.entries) {
      for (const n of e.notes) {
        if (!n.fact || n.fact.tag !== tag || n.fact.value === undefined) continue;
        if (target !== undefined && n.fact.target !== target) continue;
        const w = CONFIDENCE_WEIGHT[n.confidence];
        if (w > bestW) { bestW = w; best = n.fact.value; }
      }
    }
    return best;
  }

  /** Hazards written down within `nm` of a place, for the warning on deck. */
  hazardsNear(at: LatLon, nm: number): { entry: Entry; note: Note; distNm: number }[] {
    const out: { entry: Entry; note: Note; distNm: number }[] = [];
    for (const e of this.entries) {
      for (const n of e.notes) {
        if (!n.fact || n.fact.tag !== 'hazard') continue;
        const d = Math.hypot(
          (e.lat - at.lat) * 60,
          wrap180(e.lon - at.lon) * 60 * cosd(at.lat),
        );
        if (d <= nm) out.push({ entry: e, note: n, distNm: d });
      }
    }
    return out.sort((a, b) => a.distNm - b.distNm);
  }

  // -------------------------------------------------------------------------
  // What it has been through
  // -------------------------------------------------------------------------

  /**
   * Something has happened to the book.
   *
   * Applied to whatever pages were open — that is, the most recent ones — so a
   * soaking in the Bight of Benin ruins the Bight of Benin, and the reader can
   * see that it did.
   */
  damageRecent(kind: Damage, pages: number, t: number): Entry[] {
    const recent = [...this.entries]
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, pages);
    const hit: Entry[] = [];
    for (const e of recent) {
      if (e.damage.includes(kind)) continue;
      e.damage.push(kind);
      hit.push(e);
    }
    void t;
    return hit;
  }

  // -------------------------------------------------------------------------
  // Giving it away
  // -------------------------------------------------------------------------

  /** Pages nobody but you has ever seen. */
  unpublished(): Entry[] {
    return this.entries.filter((e) => e.published === null && e.notes.length > 0);
  }

  /**
   * What a page is worth to somebody else.
   *
   * Worth is not the same as interest. A cape nobody has drawn is worth a great
   * deal to the Crown and nothing to a merchant; a note that the people of a
   * river will give four quintais of malagueta for one iron basin is the other
   * way about. The book is therefore not one asset but several, and what to do
   * with it is a real decision rather than a button that says "claim".
   */
  worth(e: Entry): { crown: number; merchants: number; atlas: number } {
    let crown = 0, merchants = 0, atlas = 0;
    for (const n of e.notes) {
      const w = CONFIDENCE_WEIGHT[n.confidence];
      const tag = n.fact?.tag ?? '';
      if (tag === 'winds' || tag === 'current' || tag === 'hazard' || tag === 'water') {
        crown += 9 * w; merchants += 5 * w; atlas += 12 * w;
      } else if (tag === 'trade' || tag === 'market') {
        crown += 3 * w; merchants += 16 * w; atlas += 4 * w;
      } else if (tag === 'ruler' || tag === 'people') {
        crown += 8 * w; merchants += 7 * w; atlas += 9 * w;
      } else {
        crown += 4 * w; merchants += 2 * w; atlas += 6 * w;
      }
    }
    const age = e.visits > 1 ? 1.15 : 1;
    return {
      crown: Math.round(crown * age),
      merchants: Math.round(merchants * age),
      atlas: Math.round(atlas * age),
    };
  }

  serialize(): unknown {
    return { entries: this.entries, sea: [...this.sea.values()], nextId: this.nextId };
  }

  static deserialize(d: any): Rutter {
    const r = new Rutter();
    r.entries = (d?.entries ?? []).map((e: Entry) => ({ ...e, damage: e.damage ?? [] }));
    r.sea = new Map((d?.sea ?? []).map((s: SeaNote) => [s.key, s]));
    (r as any).nextId = d?.nextId ?? (r.entries.length + 1) * 4 + 1;
    return r;
  }
}

/** The mean wind and current of a square, in the terms a pilot would use. */
export function describeSea(s: SeaNote): {
  windFrom: number; windKnots: number; steadiness: number;
  currentToward: number; currentKnots: number; hours: number; settled: boolean;
} {
  const deg = 180 / Math.PI;
  const wMag = Math.hypot(s.windE, s.windN);
  return {
    windFrom: wrap360(Math.atan2(s.windE, s.windN) * deg),
    windKnots: s.windKnots / Math.max(s.hours, 1e-6),
    // How much of the total ran one way: 1 for a trade wind that never varied,
    // near 0 for a month of calms and shifts.
    steadiness: clamp(wMag / Math.max(s.hours, 1e-6), 0, 1),
    currentToward: wrap360(Math.atan2(s.currentE, s.currentN) * deg),
    currentKnots: Math.hypot(s.currentE, s.currentN) / Math.max(s.hours, 1e-6),
    hours: s.hours,
    settled: s.hours >= SETTLED_HOURS,
  };
}

const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthName(m: number): string {
  return MONTHS[clamp(Math.round(m), 1, 12)] ?? '';
}

/** How a pilot would write down what a square does. */
export function seaSentence(s: SeaNote): string {
  const d = describeSea(s);
  const dir = compass(d.windFrom);
  const set = compass(d.currentToward);
  const steady = d.steadiness > 0.75
    ? 'holds'
    : d.steadiness > 0.45 ? 'is mostly' : 'is variable, but oftenest';
  const force = d.windKnots > 26 ? 'blowing hard'
    : d.windKnots > 17 ? 'a fresh breeze'
      : d.windKnots > 9 ? 'a working breeze' : 'light';
  const cur = d.currentKnots > 0.25
    ? ` The water sets ${set}, ${d.currentKnots.toFixed(1)} knots.`
    : ' No current worth the name.';
  return `In ${monthName(s.month)} the wind ${steady} from the ${dir}, ${force}`
    + ` — ${d.windKnots.toFixed(0)} knots.${cur}`;
}

const POINTS = [
  'north', 'north-north-east', 'north-east', 'east-north-east',
  'east', 'east-south-east', 'south-east', 'south-south-east',
  'south', 'south-south-west', 'south-west', 'west-south-west',
  'west', 'west-north-west', 'north-west', 'north-north-west',
];

export function compass(deg: number): string {
  return POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}
