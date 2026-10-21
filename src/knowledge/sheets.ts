import { clamp } from '../core/math';
import { coastVertexByKey, coastVertexKeysInBox, type CoastVertex } from '../world/landmass';
import { soundingAnchors, vertexGrade, GRADE_WORD, type Grade } from '../navigation/chartGrade';
import { rivalLevel } from '../progression/rival';
import type { Game } from '../game/state';
import {
  AGE_PER_CHANGE, REGION_BY_ID, SHEET_REGIONS, effectiveLevel, epochAt, type Holding, type SheetRegion,
} from './sheetRegions';

/**
 * Survey sheets as goods (BUILD_PLAN D3).
 *
 * A sheet is a region's chart data at the grade the captain holds it. He can give it to the Casa, sell it to
 * the Casa, sell it on the Rua Nova to the Genoese, sell it to the other captain, publish it to the world, or
 * keep it. The price is the grade he *gained over what the buyer already has*, never the grade itself, so a
 * sheet sold twice pays once. Each costs him something else:
 *
 *   - the Casa pays standing and some money, and copies it into every pilot's book on the Guinea run;
 *   - the Genoese pay best among the honest buyers, and the Casa hears of it (standing, and a Ledger entry);
 *   - the rival pays most, winds his clock on (progression/rival reads what he holds), and the Casa hears;
 *   - published, it pays only fame, and raises everyone's grade, the rival's included, so secrecy has a price.
 *
 * Sheets age. A coast changes (sheetRegions.changed): every change since a buyer was handed a sheet takes half
 * a grade off what he can steer by, which is the only way a sheet is sold again to the same man.
 *
 * Frames: this reads the Chart (the pilot's own drawing, graded as chartGrade does) and writes only to the
 * buyers' holdings. Nothing flows from the ground truth into the chart here.
 */

export type Buyer = 'casa' | 'genoese' | 'rival' | 'world';
export type SaleKind = 'casa' | 'gift' | 'genoese' | 'rival' | 'publish';

export interface SheetSale {
  t: number;
  region: string;
  kind: SaleKind;
  /** Grade gained over what the buyer held, 0..3. */
  gain: number;
  money: number;
  standing: number;
}

export interface SheetsState {
  /** What the Casa, the Rua Nova and the world hold; the rival's are on `RivalState.sheets`. */
  held: { casa: Record<string, Holding>; genoese: Record<string, Holding>; world: Record<string, Holding> };
  log: SheetSale[];
}

export function newSheets(): SheetsState {
  return { held: { casa: {}, genoese: {}, world: {} }, log: [] };
}

/** Migration for a save from before sheets: empty, additive. */
export function migrateSheets(d: unknown): SheetsState {
  const s = newSheets();
  const x = d as Partial<SheetsState> | undefined;
  if (!x) return s;
  s.held.casa = { ...(x.held?.casa ?? {}) };
  s.held.genoese = { ...(x.held?.genoese ?? {}) };
  s.held.world = { ...(x.held?.world ?? {}) };
  s.log = Array.isArray(x.log) ? x.log.slice(-200) : [];
  return s;
}

// -- Parameters -------------------------------------------------------------------

/** Cruzados per grade gained, per unit of region weight. */
export const PRICE = { casa: 240, genoese: 400, rival: 560 } as const;
/** Standing per grade gained, per unit of weight. */
export const STANDING = { casa: 16, gift: 30, publish: 22 } as const;
/** What the Casa takes off the captain's standing when it hears he sold the coast abroad, per grade per weight. */
export const HEAT = { genoese: 8, rival: 14 } as const;
/** Below this gain there is nothing to sell. */
export const MIN_GAIN = 0.2;
/** Survey speed: the flagship's offing pass runs at this rate. The Pilot Calling doubles it (identity/calling). */
export const SURVEY_RATE = { base: 1, pilot: 2 };
export const surveyRate = (g?: unknown): number =>
  (g as { identity?: { calling?: string | null } } | undefined)?.identity?.calling === 'pilot' ? SURVEY_RATE.pilot : SURVEY_RATE.base;

// -- What the captain holds ---------------------------------------------------------

const keyCache = new Map<string, CoastVertex[]>();
function regionVertices(r: SheetRegion): CoastVertex[] {
  let vs = keyCache.get(r.id);
  if (!vs) {
    vs = [];
    for (const k of coastVertexKeysInBox(r.latMin, r.latMax, r.lonMin, r.lonMax)) {
      const v = coastVertexByKey(k);
      if (v) vs.push(v);
    }
    keyCache.set(r.id, vs);
  }
  return vs;
}

/** The captain's own level for a region: the mean grade (0..3) of every stretch of its coast, on his chart. */
export function regionLevel(g: Game, regionId: string): number {
  const r = REGION_BY_ID.get(regionId);
  if (!r) return 0;
  const vs = regionVertices(r);
  if (vs.length === 0) return 0;
  const anchors = soundingAnchors(g);
  let sum = 0;
  for (const v of vs) sum += vertexGrade(g.chart, v, anchors);
  return sum / vs.length;
}

export const levelWord = (level: number): string => GRADE_WORD[clamp(Math.round(level), 0, 3) as Grade];

const yearNow = (g: Game): number => g.clock.date.year;
export const epochNow = (g: Game, region: string): number => epochAt(g.seed, region, yearNow(g));

/** What a buyer can steer by in a region now: his own copy after silting, or the published one if better. */
export function buyerLevel(g: Game, buyer: Buyer, region: string): number {
  const e = epochNow(g, region);
  const world = effectiveLevel(g.sheets.held.world[region], e);
  if (buyer === 'world') return world;
  const own = buyer === 'rival' ? rivalLevel(g.rival, region, g.seed, yearNow(g)) : effectiveLevel(g.sheets.held[buyer][region], e);
  return Math.max(own, world);
}

// -- Offers ---------------------------------------------------------------------------

export interface SheetOffer {
  ok: boolean;
  why: string;
  region: string;
  kind: SaleKind;
  gain: number;
  money: number;
  standing: number;
  /** What the sale will cost the captain with the Casa, in standing. */
  heat: number;
  /** The buyer's name, for the line. */
  buyer: string;
}

const HAS_PLACE: Record<SaleKind, string[]> = {
  casa: ['lisboa'], gift: ['lisboa'], publish: ['lisboa'],
  genoese: ['lisboa', 'lagos', 'funchal'], rival: ['lisboa'],
};
const PLACE_WORD: Record<SaleKind, string> = {
  casa: 'The Casa buys at Lisbon.', gift: 'The Casa takes a gift at Lisbon.', publish: 'A sheet is published at Lisbon.',
  genoese: 'The Genoese have factors at Lisbon, Lagos and Funchal.', rival: 'His agent is at Lisbon.',
};
const BUYER_OF: Record<SaleKind, Buyer> = { casa: 'casa', gift: 'casa', genoese: 'genoese', rival: 'rival', publish: 'world' };

export function sheetOffer(g: Game, regionId: string, kind: SaleKind): SheetOffer {
  const r = REGION_BY_ID.get(regionId);
  const none = (why: string): SheetOffer => ({ ok: false, why, region: regionId, kind, gain: 0, money: 0, standing: 0, heat: 0, buyer: '' });
  if (!r) return none('There is no such sheet.');
  const buyer = kind === 'rival' ? g.rival.name : kind === 'genoese' ? 'the Genoese' : kind === 'publish' ? 'the world' : 'the Casa';
  if (kind === 'rival' && (g.rival.eclipsed || g.rival.ruined)) return none(`${g.rival.name} is no longer in the market.`);
  if (!g.dockedAt || !HAS_PLACE[kind].includes(g.dockedAt)) return { ...none(PLACE_WORD[kind]), buyer };
  const mine = regionLevel(g, regionId);
  const held = buyerLevel(g, BUYER_OF[kind], regionId);
  const gain = Math.max(0, mine - held);
  if (gain < MIN_GAIN) {
    return { ...none(held > 0 && mine > 0 ? `${buyer} already has it as well as you do. It is sold again only after the coast changes, or when you have run more of it.` : 'You have drawn too little of that coast for anybody to pay.'), buyer, gain };
  }
  const w = r.weight;
  let money = 0, standing = 0, heat = 0;
  if (kind === 'casa') { money = PRICE.casa * gain * w; standing = STANDING.casa * gain * w; }
  else if (kind === 'gift') { standing = STANDING.gift * gain * w; }
  else if (kind === 'genoese') { money = PRICE.genoese * gain * w; heat = HEAT.genoese * gain * w; }
  else if (kind === 'rival') { money = PRICE.rival * gain * w; heat = HEAT.rival * gain * w; }
  else { standing = STANDING.publish * gain * w; }
  return {
    ok: true, why: '', region: regionId, kind, gain, buyer,
    money: Math.round(money), standing: Math.round(standing), heat: Math.round(heat),
  };
}

function hold(map: Record<string, Holding>, region: string, level: number, epoch: number, t: number): void {
  const cur = map[region];
  if (cur && cur.level >= level && cur.epoch === epoch) { cur.t = t; return; }
  map[region] = { level, epoch, t };
}

/** Do the sale. Returns the line to show. */
export function sellSheet(g: Game, regionId: string, kind: SaleKind): string {
  const o = sheetOffer(g, regionId, kind);
  if (!o.ok) return o.why;
  const r = REGION_BY_ID.get(regionId)!;
  const mine = regionLevel(g, regionId);
  const epoch = epochNow(g, regionId);
  const t = g.clock.t;
  g.crown.gold += o.money;
  g.crown.standing = Math.max(0, g.crown.standing + o.standing - o.heat);
  if (o.standing > 0) g.crown.lifetimeStanding += o.standing;
  const where = `${levelWord(mine).toLowerCase()} sheet of ${r.name}`;
  const grade = `+${o.gain.toFixed(1)} grade`;

  if (kind === 'casa' || kind === 'gift') {
    hold(g.sheets.held.casa, regionId, mine, epoch, t);
    // Whatever the Casa has, the pilots of the Guinea run have by the spring, the other captain among them.
    g.rival.standing += Math.round(o.gain * r.weight * 2);
    g.logEvent('crown', kind === 'gift'
      ? `Gave the Casa the ${where} (${grade}). ${o.standing} standing and no money, and a clerk was copying it before I left the room.`
      : `Sold the Casa the ${where} (${grade}) for ${o.money} cruzados and ${o.standing} standing.`, true);
    g.noteDeed(kind === 'gift' ? 'chart.shared' : 'chart.sold', {
      target: kind === 'gift' ? 'portugal' : 'the Casa', place: g.dockedAt ?? '', magnitude: clamp(0.3 + 0.2 * o.gain, 0.3, 1),
      note: kind === 'gift' ? `Gave the Casa my sheet of ${r.name}.` : `Sold the Casa my sheet of ${r.name} for ${o.money} cruzados.`,
    });
  } else if (kind === 'genoese') {
    hold(g.sheets.held.genoese, regionId, mine, epoch, t);
    g.logEvent('trade', `Sold the Genoese the ${where} (${grade}) for ${o.money} cruzados. The Casa will hear that it went to the Rua Nova.`, true);
    g.noteDeed('chart.sold', {
      target: 'the Genoese', place: g.dockedAt ?? '', magnitude: clamp(0.4 + 0.25 * o.gain, 0.4, 1),
      note: `Sold the Genoese my sheet of ${r.name} for ${o.money} cruzados.`,
    });
  } else if (kind === 'rival') {
    g.rival.sheets ??= {};
    hold(g.rival.sheets, regionId, mine, epoch, t);
    g.rival.standing += Math.round(o.gain * r.weight * 5);
    g.logEvent('trade', `Sold ${g.rival.name} the ${where} (${grade}) for ${o.money} cruzados. He will work that coast faster for it, and the Casa will hear who sold him the paper.`, true);
    g.noteDeed('chart.sold', {
      target: g.rival.name, place: g.dockedAt ?? '', magnitude: clamp(0.5 + 0.3 * o.gain, 0.5, 1),
      note: `Sold ${g.rival.name} my sheet of ${r.name} for ${o.money} cruzados.`,
    });
  } else {
    hold(g.sheets.held.world, regionId, mine, epoch, t);
    g.rival.standing += Math.round(o.gain * r.weight * 3);
    g.logEvent('discovery', `Published the ${where} (${grade}) under my own name. ${o.standing} standing and no money, and every pilot on that coast has it, ${g.rival.name} among them.`, true);
    g.noteDeed('chart.shared', {
      target: 'the world', place: g.dockedAt ?? '', magnitude: clamp(0.4 + 0.2 * o.gain, 0.4, 1),
      note: `Published my sheet of ${r.name}, where everyone may copy it.`,
    });
  }
  g.sheets.log.push({ t, region: regionId, kind, gain: o.gain, money: o.money, standing: o.standing });
  if (g.sheets.log.length > 200) g.sheets.log.shift();
  const bits = [o.money > 0 ? `${o.money} cruzados` : '', o.standing > 0 ? `${o.standing} standing` : '', o.heat > 0 ? `${o.heat} standing lost with the Casa for it` : ''].filter(Boolean);
  return `${bits.join(', ')}.`;
}

// -- A region's standing, for the Fame view -------------------------------------------------

export type SheetFate = 'published' | 'sold' | 'kept' | 'none';

export interface SheetRow {
  region: SheetRegion;
  level: number;
  word: string;
  casa: number;
  genoese: number;
  rival: number;
  world: number;
  fate: SheetFate;
}

export function sheetRows(g: Game): SheetRow[] {
  return SHEET_REGIONS.map((region) => {
    const level = regionLevel(g, region.id);
    const sold = g.sheets.log.some((s) => s.region === region.id && s.kind !== 'publish');
    const pub = g.sheets.log.some((s) => s.region === region.id && s.kind === 'publish');
    return {
      region, level, word: levelWord(level),
      casa: buyerLevel(g, 'casa', region.id), genoese: buyerLevel(g, 'genoese', region.id),
      rival: buyerLevel(g, 'rival', region.id), world: buyerLevel(g, 'world', region.id),
      fate: pub ? 'published' : sold ? 'sold' : level >= 0.5 ? 'kept' : 'none',
    };
  });
}

/** The mean level the rival holds across every region, for claims outside any coastal region. */
export function rivalMeanLevel(g: Game): number {
  let s = 0;
  for (const r of SHEET_REGIONS) s += buyerLevel(g, 'rival', r.id);
  return s / SHEET_REGIONS.length;
}

export const AGE_NOTE = `Each time a coast changes, a sheet loses ${AGE_PER_CHANGE} of a grade in the buyer's hands.`;

/**
 * An heir takes the old man's paper at a discount (loop guard #7, DA 3.4 #7): the drawing stays, the
 * confidence does not. The buyers' holdings belong to the world the old man lived in and do not pass on.
 */
export function inheritChart(heir: Game, old: Game): number {
  heir.chart = old.chart;
  const n = heir.chart.discount();
  heir.sheets = newSheets();
  return n;
}
