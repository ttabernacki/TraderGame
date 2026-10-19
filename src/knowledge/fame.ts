import type { LatLon } from '../core/math';
import { ISLES } from '../world/isles';
import { PORTS } from '../world/ports';
import type { Game } from '../game/state';
import { claimName, type Claim } from './claims';
import { SHEET_REGIONS } from './sheetRegions';
import { sheetRows, type SheetFate } from './sheets';

/**
 * Fame (BUILD_PLAN D3): the career's exploration, read off the run, and shown as a map in the Captain's Book
 * and at the head of the epilogue in place of one scalar. Nothing here is stored; it is rebuilt from the claims,
 * the islands found, the ports reached and the sheets handed over, so no save needs migrating.
 */

export interface FameMark {
  name: string;
  at: LatLon;
  /** How it stands. */
  kind: 'held' | 'found' | 'exposed' | 'lost' | 'isle' | 'first' | 'beaten';
  /** Who got there first, when it was not the captain. */
  by?: string;
}

export interface Fame {
  held: Claim[];
  found: Claim[];
  exposed: Claim[];
  lost: Claim[];
  open: Claim[];
  marks: FameMark[];
  /** Places the captain reached before the other man (ports charted first, islands named first). */
  firsts: string[];
  /** Places the other man reached first. */
  beaten: string[];
  sheets: { region: string; name: string; fate: SheetFate; level: number }[];
  sold: number;
  published: number;
  kept: number;
  /** A held claim is 3, a find 2, a phantom put to rest 1, a published sheet 1, an island named first 1. */
  points: number;
}

/** Where the Casa's sheet draws the claim for a player who has not found it; where it is, for one who has (the captain has been there). */
function placeOf(c: Claim): LatLon {
  return (c.status === 'held' || c.status === 'found') && c.truth ? c.truth : { lat: c.lat, lon: c.lon };
}

export function fameOf(g: Game): Fame {
  const list = g.claims.list;
  const held = list.filter((c) => c.status === 'held');
  const found = list.filter((c) => c.status === 'found');
  const exposed = list.filter((c) => c.status === 'false');
  const lost = list.filter((c) => c.status === 'lost');
  const open = list.filter((c) => c.status === 'open');

  const marks: FameMark[] = [];
  for (const c of held) marks.push({ name: claimName(c), at: placeOf(c), kind: 'held' });
  for (const c of found) marks.push({ name: claimName(c), at: placeOf(c), kind: 'found' });
  for (const c of exposed) marks.push({ name: claimName(c), at: { lat: c.lat, lon: c.lon }, kind: 'exposed' });
  for (const c of lost) marks.push({ name: claimName(c), at: placeOf(c), kind: 'lost', by: c.by });

  const firsts: string[] = [];
  const beaten: string[] = [];
  // Islands named: by the captain, or by history before he got there.
  for (const isle of ISLES) {
    const f = g.isles.found[isle.id];
    if (!f) continue;
    if (f.by === 'you') {
      firsts.push(f.name || isle.suggested);
      if (!list.some((c) => c.isle === isle.id)) marks.push({ name: f.name || isle.suggested, at: { lat: isle.lat, lon: isle.lon }, kind: 'isle' });
    } else {
      beaten.push(`${isle.suggested} (${f.by})`);
    }
  }
  // Ports nobody had charted: reached by the captain, or reported by the rival first.
  for (const p of PORTS) {
    if (p.known || p.discovery <= 0) continue;
    if (g.rival.claimed.includes(p.id)) {
      beaten.push(p.name);
      marks.push({ name: p.name, at: { lat: p.lat, lon: p.lon }, kind: 'beaten', by: g.rival.name });
    } else if (g.visitedPorts.has(p.id)) {
      firsts.push(p.name);
      marks.push({ name: p.name, at: { lat: p.lat, lon: p.lon }, kind: 'first' });
    }
  }

  const rows = sheetRows(g);
  const sheets = rows.map((r) => ({ region: r.region.id, name: r.region.name, fate: r.fate, level: r.level }));
  const published = sheets.filter((s) => s.fate === 'published').length;
  const sold = sheets.filter((s) => s.fate === 'sold').length;
  const kept = sheets.filter((s) => s.fate === 'kept').length;

  const isleFirsts = ISLES.filter((i) => g.isles.found[i.id]?.by === 'you' && !list.some((c) => c.isle === i.id)).length;
  const points = held.length * 3 + found.length * 2 + exposed.length + published + isleFirsts;
  return { held, found, exposed, lost, open, marks, firsts, beaten, sheets, sold, published, kept, points };
}

export const FATE_WORD: Record<SheetFate, string> = {
  published: 'published to all', sold: 'sold', kept: 'kept in the book', none: 'not yet drawn',
};

export { SHEET_REGIONS };
