import { clamp } from '../core/math';
import { weightAt, type Entry } from '../ledger/ledger';
import { TAGS, type Tag } from '../ledger/tags';
import { PORT_BY_ID } from '../world/ports';
import type { MarketMods } from '../world/powers/modifiers';
import { callbackAt } from '../progression/quests';
import type { Game } from '../game/state';
import { activeEntries } from './calendar';
import { deepPort } from './deep';
import { patronArrival, patronOf, perkOf } from './patron';
import type { DeepPort } from './types';

/**
 * Place memory (BUILD_PLAN C4): Ledger entries made at a place become what the place says to the captain,
 * and, at a Deep port, small effects on its market and on the town's own regard.
 *
 * It generalises `callbackAt` (a thread's outcome spoken at the ports it concerns) from authored quest
 * outcomes to any Ledger entry, and `Relations.local` (the town's own memory, +-0.6) from marks to deeds.
 * Everything here is a pure function of the Ledger except the record of what has already been said.
 */

const DAY = 86400;

/** The town's line for a deed, for any place that has no authored one. Plain, short, in the ship's voice. */
const GENERIC: Partial<Record<Tag, (at: string) => string>> = {
  'weights.fair': (at) => `At ${at} they remember the scales were honest.`,
  'weights.false': (at) => `At ${at} the traders remember the scales, and watch your hands.`,
  'promise.kept': (at) => `At ${at} a word of yours was kept, and is counted.`,
  'promise.broken': (at) => `At ${at} a word of yours was broken, and is counted.`,
  'gift.great': (at) => `At ${at} your gift is still talked of.`,
  'gift.insult': (at) => `At ${at} they tell the story of the tray.`,
  'table.kept': (at) => `At ${at} they say you kept their table.`,
  'table.spoiled': (at) => `At ${at} they noticed your manners at the table.`,
  'courtesy.kept': (at) => `At ${at} they noted that you asked before you acted.`,
  'courtesy.broken': (at) => `At ${at} they have not forgotten that you stood.`,
  'hearing.contested': (at) => `At ${at} a question you put in the open is in the clerk’s book.`,
  'person.redeemed': (at) => `At ${at} it is known whose money bought a man home.`,
  'mercy.shown': (at) => `At ${at} they speak of the man you took in.`,
  'faith.pressed': (at) => `At ${at} they remember who was taken to the font.`,
  'faith.respected': (at) => `At ${at} they noticed that their worship was left alone.`,
  'silent.fair': (at) => `At ${at} they say you dealt fairly on the mat.`,
  'traffic.refused': (at) => `At ${at} the factor remembers a ship that would not carry.`,
  'smuggle.caught': (at) => `At ${at} the weigh-house remembers what it found in your hold.`,
  'books.honest': (at) => `At ${at} the clerks remember a book that was kept straight.`,
  'ship.succoured': (at) => `At ${at} they have heard what you did for a ship in distress.`,
};

export interface MemoryLine { tag: Tag; t: number; text: string; tone: number }

const nameOf = (port: string): string => PORT_BY_ID.get(port)?.name ?? port;

/** Entries a place has a say about: made there, or done to it. */
function hereEntries(g: Game, port: string): Entry[] {
  return g.ledger.filter((e) => e.place === port || e.target === port);
}

function lineFor(deep: DeepPort | null, port: string, tag: Tag): string | null {
  const own = deep?.memory.lines[tag];
  if (own) return own;
  return GENERIC[tag]?.(nameOf(port)) ?? null;
}

/** What the place says of the captain, newest deed first, one line per kind of deed. Pure. */
export function memoryLines(g: Game, port: string, limit = 4): MemoryLine[] {
  const deep = deepPort(port);
  const out: MemoryLine[] = [];
  const done = new Set<string>();
  const entries = hereEntries(g, port).sort((a, b) => b.t - a.t);
  for (const e of entries) {
    if (done.has(e.tag) || weightAt(e, g.clock.t) <= 0) continue;
    const text = lineFor(deep, port, e.tag);
    if (!text) continue;
    done.add(e.tag);
    out.push({ tag: e.tag, t: e.t, text, tone: TAGS[e.tag].tone });
    if (out.length >= limit) break;
  }
  return out;
}

const spokenKey = (e: Entry): string => `place:said:${Math.round(e.t)}:${e.tag}`;

/**
 * What a place says on a call, once each. The generalised `callbackAt`: a thread outcome first (as before), then the
 * Patron's word if the port has one, then the oldest deed here that has not been spoken of and is a day old.
 */
export function placeCallbackAt(g: Game, port: string): string | null {
  const quest = callbackAt(g, port);
  if (quest) return quest;
  const deep = deepPort(port);
  if (deep) {
    const said = patronArrival(g, deep);
    if (said) return said;
  }
  const seen = g.powers.seen;
  const entries = hereEntries(g, port).filter((e) => e.t <= g.clock.t - DAY).sort((a, b) => a.t - b.t);
  for (const e of entries) {
    const key = spokenKey(e);
    if (seen[key] !== undefined) continue;
    const text = lineFor(deep, port, e.tag);
    seen[key] = g.clock.t;
    if (text) return text;
  }
  return null;
}

// -- The town's own regard ----------------------------------------------------------------

/**
 * A deed done at a Deep port moves the town's own regard (`Relations.local`) a little, per its memory table: the
 * generalisation of `feelMark`. Called once, when the entry is written, so it is never counted twice.
 */
export function rememberDeed(g: Game, e: Entry): void {
  const deep = deepPort(e.place);
  if (!deep) return;
  const fx = deep.memory.effects.find((x) => x.tag === e.tag);
  if (!fx?.regard) return;
  const r = g.relationsFor(deep.port);
  r.local = clamp((r.local ?? 0) + fx.regard * Math.max(0.2, e.magnitude) * 0.5, -0.6, 0.6);
}

// -- What it does to the market -----------------------------------------------------------

export interface PlaceMods {
  dues: number;
  price: Record<string, number>;
  appetite: Record<string, number>;
  reasons: string[];
}

const NONE: PlaceMods = { dues: 1, price: {}, appetite: {}, reasons: [] };

/** The deeds, the calendar and the Patron's goodwill as multipliers at a Deep port. Pure. */
export function placeEffects(g: Game, port: string, t: number): PlaceMods {
  const deep = deepPort(port);
  if (!deep) return NONE;
  const out: PlaceMods = { dues: 1, price: {}, appetite: {}, reasons: [] };

  // The deeds: a weighted sum per tag, capped, so a hundred honest weighings do not make gold free.
  let dues = 0;
  const price: Record<string, number> = {};
  for (const fx of deep.memory.effects) {
    let s = 0;
    for (const e of g.ledger) {
      if (e.tag !== fx.tag || (e.place !== port && e.target !== port)) continue;
      s += Math.max(0.2, e.magnitude) * weightAt(e, t);
    }
    s = Math.min(2, s);
    if (s <= 0) continue;
    if (fx.dues) dues += fx.dues * s;
    for (const [id, d] of Object.entries(fx.price ?? {})) price[id] = (price[id] ?? 0) + d * s;
  }
  out.dues = clamp(1 + dues, 0.85, 1.2);
  for (const [id, d] of Object.entries(price)) out.price[id] = clamp(1 + d, 0.92, 1.08);
  if (out.dues < 0.995) out.reasons.push(`${nameOf(port)} remembers how you dealt, and the dues are lighter.`);
  else if (out.dues > 1.005) out.reasons.push(`${nameOf(port)} remembers how you dealt, and the dues are heavier.`);

  // The calendar.
  for (const c of activeEntries(deep, t)) {
    for (const [id, m] of Object.entries(c.price ?? {})) out.price[id] = (out.price[id] ?? 1) * m;
    for (const [id, m] of Object.entries(c.appetite ?? {})) out.appetite[id] = (out.appetite[id] ?? 1) * m;
    if (c.dues) out.dues *= c.dues;
    if (c.price || c.appetite || c.dues) out.reasons.push(`${c.name}: ${c.text.split('. ')[0]}.`);
  }

  // The Patron's goodwill.
  const v = patronOf(g, deep);
  const gold = perkOf(v, 'price');
  if (gold?.value) {
    out.price.ouro = (out.price.ouro ?? 1) * gold.value;
    out.reasons.push(`${deep.patron.name}: ${gold.text}`);
  }
  return out;
}

/** The Powers' modifiers with a Deep port's memory, calendar and Patron folded in. Set once in Game's constructor. */
export function placeMods(g: Game, port: string, t: number, base: MarketMods): MarketMods {
  if (!deepPort(port)) return base;
  const p = placeEffects(g, port, t);
  if (p.dues === 1 && p.reasons.length === 0 && Object.keys(p.price).length === 0 && Object.keys(p.appetite).length === 0) return base;
  const mul = (a: Record<string, number>, b: Record<string, number>): Record<string, number> => {
    const o = { ...a };
    for (const [id, m] of Object.entries(b)) o[id] = (o[id] ?? 1) * m;
    return o;
  };
  const reasons = [...base.reasons, ...p.reasons];
  return {
    ...base,
    priceMult: mul(base.priceMult, p.price),
    appetiteMult: mul(base.appetiteMult, p.appetite),
    duesMult: base.duesMult * p.dues,
    reasons,
    reason: base.reason || reasons[0] || '',
  };
}

/** Cruzados of credit the Patron lets run while the ship lies here. Added to `Game.creditLimit`. */
export function placeCredit(g: Game): number {
  const deep = deepPort(g.dockedAt);
  if (!deep) return 0;
  return perkOf(patronOf(g, deep), 'credit')?.value ?? 0;
}

/** The multiplier on the founding cost of a House at a port (1 where nobody vouches for the ground). */
export function placeHouseFactor(g: Game, port: string | null | undefined): number {
  const deep = deepPort(port);
  if (!deep) return 1;
  return perkOf(patronOf(g, deep), 'house')?.value ?? 1;
}
