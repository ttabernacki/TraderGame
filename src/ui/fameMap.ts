import { LANDMASSES } from '../world/coastlines';
import { CLAIM_DEFS } from '../knowledge/claims';
import { fameOf, FATE_WORD, type Fame, type FameMark } from '../knowledge/fame';
import { SHEET_REGIONS } from '../knowledge/sheetRegions';
import type { Game } from '../game/state';
import { el } from './dom';

/**
 * The Fame map (D3): a small map of the run's exploration, in the Captain's Book and at the head of the
 * epilogue. It draws the same coastline the chart table does (world/coastlines, the one truth about land)
 * and puts on it only what the career did: claims held, places found and not claimed, phantoms put to rest,
 * places the other captain was first to, and the regions whose sheets were sold, published or kept.
 *
 * Positions come from knowledge/fame, which shows where a claim is only once the captain has been to it.
 */

const LON0 = -58, LON1 = 82, LAT0 = -40, LAT1 = 58;

const FATE_COLOUR: Record<string, string> = {
  published: 'rgba(47, 111, 163, 0.30)', sold: 'rgba(201, 162, 74, 0.34)', kept: 'rgba(74, 138, 106, 0.30)', none: 'rgba(0,0,0,0)',
};

const MARK_STYLE: Record<FameMark['kind'], { colour: string; label: string }> = {
  held: { colour: '#c8a44e', label: 'Claim held' },
  found: { colour: '#e8dcc0', label: 'Found, not claimed' },
  exposed: { colour: '#8a7a63', label: 'Phantom put to rest' },
  lost: { colour: '#a83228', label: 'Lost to another' },
  isle: { colour: '#4a8a8a', label: 'Island named' },
  first: { colour: '#4d7a3e', label: 'Reached first' },
  beaten: { colour: '#a83228', label: 'Reported first by the other man' },
};

export function drawFameMap(canvas: HTMLCanvasElement, fame: Fame): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const px = (lon: number): number => ((lon - LON0) / (LON1 - LON0)) * W;
  const py = (lat: number): number => ((LAT1 - lat) / (LAT1 - LAT0)) * H;
  ctx.fillStyle = '#16283a';
  ctx.fillRect(0, 0, W, H);

  for (const l of LANDMASSES) {
    ctx.beginPath();
    for (let i = 0; i + 1 < l.ring.length; i += 2) {
      const x = px(l.ring[i + 1]), y = py(l.ring[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#6d5f46';
    ctx.fill();
    ctx.strokeStyle = 'rgba(232, 220, 192, 0.55)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // Sheets: the regions, shaded by what became of them.
  for (const s of fame.sheets) {
    const r = SHEET_REGIONS.find((x) => x.id === s.region);
    if (!r || s.fate === 'none') continue;
    ctx.fillStyle = FATE_COLOUR[s.fate];
    ctx.fillRect(px(r.lonMin), py(r.latMax), px(r.lonMax) - px(r.lonMin), py(r.latMin) - py(r.latMax));
  }

  for (const m of fame.marks) {
    const x = px(m.at.lon), y = py(m.at.lat);
    if (x < 0 || x > W || y < 0 || y > H) continue;
    const st = MARK_STYLE[m.kind];
    ctx.strokeStyle = st.colour;
    ctx.fillStyle = st.colour;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (m.kind === 'held') {
      // A padrão: a small cross on a filled disc.
      ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2a1f14'; ctx.beginPath(); ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y); ctx.moveTo(x, y - 2.5); ctx.lineTo(x, y + 2.5); ctx.stroke();
    } else if (m.kind === 'found' || m.kind === 'beaten') {
      ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.stroke();
    } else if (m.kind === 'exposed' || m.kind === 'lost') {
      ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke();
    } else {
      ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/** The map with its legend and the lists under it, as one block for a card. */
export function fameBlock(g: Game): HTMLElement {
  const fame = fameOf(g);
  const canvas = el('canvas', { width: 640, height: 440, class: 'fame-map', style: { width: '100%', maxWidth: '640px', height: 'auto', borderRadius: '3px' } });
  drawFameMap(canvas, fame);
  const seen = new Set(fame.marks.map((m) => m.kind));
  const legend = el('div', { class: 'fame-legend', style: { display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: '12px', margin: '6px 0' } },
    ...(['held', 'found', 'exposed', 'lost', 'isle', 'first', 'beaten'] as const).filter((k) => seen.has(k)).map((k) =>
      el('span', {}, el('span', { style: { color: MARK_STYLE[k].colour, fontWeight: '700' } }, '● '), MARK_STYLE[k].label)),
    fame.published + fame.sold + fame.kept > 0
      ? el('span', {}, 'Coast shaded: ', el('span', { style: { color: '#2f6fa3' } }, 'published'), ', ', el('span', { style: { color: '#c9a24a' } }, 'sold'), ', ', el('span', { style: { color: '#4a8a6a' } }, 'kept'))
      : null);
  return el('div', {}, canvas, legend);
}

/** The Fame in plain lines: what was claimed, what was lost, what the sheets became. */
export function fameLines(g: Game): string[] {
  const f = fameOf(g);
  const out: string[] = [];
  out.push(`${f.points} fame: ${f.held.length} claim${f.held.length === 1 ? '' : 's'} held, ${f.found.length} found and left unclaimed, ${f.exposed.length} phantom${f.exposed.length === 1 ? '' : 's'} put to rest.`);
  if (f.lost.length > 0) out.push(`Lost to another: ${f.lost.map((c) => `${nameOf(c.id)} (${c.by ?? 'another'})`).join('; ')}.`);
  if (f.firsts.length > 0) out.push(`First there, before the other man: ${f.firsts.slice(0, 8).join(', ')}.`);
  if (f.beaten.length > 0) out.push(`He was first to: ${f.beaten.slice(0, 8).join(', ')}.`);
  const sheets = f.sheets.filter((s) => s.fate !== 'none').map((s) => `${s.name} ${FATE_WORD[s.fate]}`);
  if (sheets.length > 0) out.push(`Sheets: ${sheets.join('; ')}.`);
  return out;
}

function nameOf(id: string): string { return CLAIM_DEFS.find((d) => d.id === id)?.name ?? id; }
