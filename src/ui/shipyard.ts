import { hullClass, type HullClass, type RigKind } from '../ship/hull';
import {
  BUILD, DESIGN_LIMITS, defaultDesign,
  type Build, type Fastening, type Paint, type SailDevice, type Sheathing, type ShipDesign, type Timber,
} from '../ship/design';
import type { Game } from '../game/state';
import { append, button, card, clear, el, svg } from './dom';

/**
 * The Ribeira das Naus: a ship to your own lines.
 *
 * The table keeps its own drawing between renders, so a captain can leave the
 * yard, look at his purse and come back to the same design. Everything on the
 * readout is measured by ship/design against the physics, on every change.
 */
let draft: ShipDesign | null = null;

export function shipyardCard(g: Game, done: (text: string, grave?: boolean) => void): HTMLElement {
  if (g.building) return stocksCard(g, done);
  const d = draft ?? (draft = defaultDesign(suggestName(g)));

  const readout = el('div', { class: 'yard-readout' });
  const profile = el('div', { class: 'yard-profile' });
  const warn = el('div', { class: 'yard-warn' });
  const action = el('div', { class: 'yard-action' });

  const refresh = () => {
    const r = g.assess(d);
    const h = r.hull;
    clear(readout);
    const cell = (k: string, v: string) => el('div', {}, el('span', { class: 'k' }, k), el('span', { class: 'v' }, v));
    readout.append(
      cell('Burthen', `${h.tons} tonéis`),
      cell('Hold', `${h.hold} t`),
      cell('Beam × draft', `${h.beam.toFixed(1)} × ${h.draft.toFixed(1)} m`),
      cell('Canvas', `${h.masts.reduce((s, m) => s + m.area, 0)} m²`),
      cell('Points', `${r.noGo}° off the wind`),
      cell('Reaching, 12 kn wind', `${r.reach12.toFixed(1)} kn`),
      cell('Running, 20 kn wind', `${r.run20.toFixed(1)} kn`),
      cell('Heel, 20 kn on the beam', `${r.heel20.toFixed(0)}°`),
      cell('Hull speed', `${r.hullSpeed.toFixed(1)} kn`),
      cell('Strength', `${Math.round(h.strength * (h.toughness ?? 1) * 100)}%`),
      cell('Weed and worm', (h.fouling ?? 1) < 0.35 ? 'Almost none' : (h.fouling ?? 1) < 0.8 ? 'Slow' : 'The usual'),
      cell('Handiness', `${Math.round(h.handiness * 100)}%`),
      cell('Company', `${h.crewMin}–${h.crewFull} men`),
      cell('On the stocks', `${Math.round(r.days / 30 * 10) / 10} months`),
    );
    clear(profile);
    profile.append(drawProfile(h, d));
    clear(warn);
    for (const w of r.warnings) warn.append(el('div', {}, w));
    clear(action);
    const why = g.commissionBlocked(d);
    append(action,
      button(`Lay her down — ${h.cost} cruzados`, () => {
        const err = g.commissionShip(d);
        if (err) { done(err, true); return; }
        draft = null;
        done(`The keel of the ${d.name.trim()} is laid.`);
      }, { primary: true, disabled: !!why, title: why ?? undefined }),
      why ? el('div', { class: 'yard-why' }, why) : null,
    );
  };

  const slider = (label: string, key: 'lwl' | 'beamRatio' | 'draft' | 'castles' | 'canvas', step: number, fmt: (v: number) => string) => {
    const lo = DESIGN_LIMITS[key][0];
    // The leanest lines and heaviest rig the chosen build will stand.
    const bq = BUILD[d.build ?? 'yard'];
    const hi = key === 'canvas' ? bq.canvas : key === 'beamRatio' ? bq.lean : DESIGN_LIMITS[key][1];
    if (d[key] > hi) d[key] = hi;
    const out = el('span', { class: 'yard-val' }, fmt(d[key]));
    const input = el('input', {
      type: 'range', id: `yard-${key}`, min: lo, max: hi, step, value: d[key],
      oninput: (ev: Event) => {
        d[key] = Number((ev.target as HTMLInputElement).value);
        out.textContent = fmt(d[key]);
        refresh();
      },
    });
    return el('label', { class: 'yard-row' }, el('span', { class: 'yard-label' }, label), input, out);
  };

  const choice = <T extends string>(label: string, id: string, options: [T, string][], get: () => T, set: (v: T) => void) =>
    el('label', { class: 'yard-row' }, el('span', { class: 'yard-label' }, label),
      el('select', {
        id,
        onchange: (ev: Event) => { set((ev.target as HTMLSelectElement).value as T); rebuild(); },
      }, ...options.map(([v, text]) => el('option', { value: v, selected: get() === v }, text))),
    );

  const masts = el('div', { class: 'yard-masts' });
  const drawMasts = () => {
    clear(masts);
    const names = ({ 1: ['Main'], 2: ['Main', 'Mizzen'], 3: ['Fore', 'Main', 'Mizzen'], 4: ['Fore', 'Main', 'Mizzen', 'Bonaventure'] } as Record<number, string[]>)[d.masts.length];
    d.masts.forEach((rig, i) => {
      masts.append(el('button', {
        class: `yard-mast ${rig}`,
        title: 'Square or lateen',
        onclick: () => { d.masts[i] = rig === 'square' ? 'lateen' : 'square'; rebuild(); },
      }, `${names[i]}: ${rig}`));
    });
  };

  const body = el('div', {});
  const rebuild = () => {
    clear(body);
    drawMasts();
    const mainIdx = d.masts.length >= 3 ? 1 : 0;
    append(body,
      el('div', { class: 'yard-presets' },
        el('span', { class: 'yard-label' }, 'Start from:'),
        button('The fastest ship afloat', () => {
          Object.assign(d, {
            lwl: 30, beamRatio: 4.6, draft: 3.2, castles: 0.1, masts: ['square', 'square', 'lateen', 'lateen'],
            topsail: true, canvas: 1.7, timber: 'oak', fastening: 'iron', build: 'master', sheathing: 'lead',
          });
          rebuild();
        }, { ghost: true, title: 'Long, lean, heavily sparred and master-built' }),
        button('A ship that cannot be broken', () => {
          Object.assign(d, {
            lwl: 28, beamRatio: 3.0, draft: 3.8, castles: 0.7, masts: ['square', 'square', 'lateen'],
            topsail: true, canvas: 1.1, timber: 'teak', fastening: 'iron', build: 'master', sheathing: 'lead',
          });
          rebuild();
        }, { ghost: true, title: 'Teak, iron, lead and a master’s frames' }),
      ),
      el('label', { class: 'yard-row' }, el('span', { class: 'yard-label' }, 'Her name'),
        el('input', {
          type: 'text', id: 'yard-name', value: d.name, maxlength: 40,
          oninput: (ev: Event) => { d.name = (ev.target as HTMLInputElement).value; refresh(); },
        })),
      el('div', { class: 'fit-cat-head' }, 'The hull'),
      slider('Length on the waterline', 'lwl', 0.5, (v) => `${v.toFixed(1)} m`),
      slider('Length to beam', 'beamRatio', 0.05, (v) => `${v.toFixed(2)} : 1`),
      slider('Draft', 'draft', 0.1, (v) => `${v.toFixed(1)} m`),
      slider('Castles', 'castles', 0.05, (v) => v < 0.15 ? 'flush' : v < 0.5 ? 'low' : v < 0.8 ? 'a carrack’s' : 'towering'),
      el('div', { class: 'fit-cat-head' }, 'How she is built'),
      choice<Build>('Built by', 'yard-build', [
        ['yard', 'The yard’s own men'],
        ['fine', 'A fine build — faster, stronger, ×1.8 the price'],
        ['master', 'The master shipwright — the finest ship afloat, ×3'],
      ], () => d.build ?? 'yard', (v) => { d.build = v; }),
      choice<Timber>('Timber', 'yard-timber', [['oak', 'Oak — strong, dear'], ['pine', 'Pine — light, cheap, short-lived'], ['teak', 'Malabar teak — near unbreakable, ×1.7']], () => d.timber, (v) => { d.timber = v; }),
      choice<Fastening>('Fastened', 'yard-fast', [['trenail', 'Trenails'], ['iron', 'Iron bolts — stronger, dearer']], () => d.fastening, (v) => { d.fastening = v; }),
      choice<Sheathing>('Her bottom', 'yard-sheath', [['none', 'Tallow and pitch'], ['lead', 'Sheathed in lead — no weed, no worm']], () => d.sheathing ?? 'none', (v) => { d.sheathing = v; }),
      el('div', { class: 'fit-cat-head' }, 'The rig'),
      choice<string>('Masts', 'yard-masts', [['1', 'One'], ['2', 'Two'], ['3', 'Three'], ['4', 'Four']], () => String(d.masts.length), (v) => {
        const n = Number(v);
        const presets: Record<number, RigKind[]> = {
          1: ['lateen'], 2: ['lateen', 'lateen'], 3: ['square', 'square', 'lateen'], 4: ['square', 'square', 'lateen', 'lateen'],
        };
        d.masts = presets[n];
      }),
      masts,
      d.masts[mainIdx] === 'square'
        ? el('label', { class: 'yard-row' }, el('span', { class: 'yard-label' }, 'Main topsail'),
          el('input', {
            type: 'checkbox', id: 'yard-topsail', checked: d.topsail,
            onchange: (ev: Event) => { d.topsail = (ev.target as HTMLInputElement).checked; refresh(); },
          }))
        : null,
      slider('Canvas', 'canvas', 0.02, (v) => `${Math.round(v * 100)}%`),
      el('div', { class: 'fit-cat-head' }, 'Her colours'),
      choice<Paint>('Paint above the wale', 'yard-paint', [['natural', 'Bare oak and tar'], ['red', 'Red'], ['black', 'Black'], ['ochre', 'Ochre']], () => d.paint, (v) => { d.paint = v; }),
      choice<SailDevice>('On the main course', 'yard-device', [['cross', 'The cross of the Order of Christ'], ['plain', 'Plain canvas']], () => d.device, (v) => { d.device = v; }),
    );
    refresh();
  };
  rebuild();

  const sisters = g.designs.filter((x) => x.design);
  return card('The Ribeira das Naus — a ship to your own lines',
    el('p', { class: 'fit-blurb' },
      'The master shipwright will build to your drawings. Everything below is what the hull you draw will actually do: '
      + 'the yard reckons it from the lines, not from a list. The price is paid when the keel is laid, and she takes months on the stocks, '
      + 'during which you may sail in what you have.'),
    profile,
    el('div', { class: 'yard-grid' }, body, el('div', {}, readout, warn, action)),
    sisters.length
      ? el('div', { class: 'yard-sisters' }, el('span', { class: 'yard-label' }, 'Your drawings:'),
        ...sisters.map((x) => button(x.design!.name, () => {
          draft = { ...x.design!, masts: [...x.design!.masts], name: `${x.design!.name} II` };
          done(`The lines of the ${x.design!.name} are on the table.`);
        }, { ghost: true })))
      : null,
  );
}

/** A ship on the stocks, and the day she is ready. */
function stocksCard(g: Game, done: (text: string, grave?: boolean) => void): HTMLElement {
  const b = g.building!;
  const h = hullClass(b.hullId);
  const left = Math.ceil((b.readyT - g.clock.t) / 86400);
  const share = Math.min(1, (g.clock.t - b.startT) / Math.max(1, b.readyT - b.startT));
  const design = g.designs.find((x) => x.hull.id === b.hullId)?.design;
  return card('The Ribeira das Naus — on the stocks',
    el('div', { class: 'yard-profile' }, drawProfile(h, design ?? null, share)),
    el('p', {}, g.launchReady
      ? `The ${h.name} is finished: rigged, caulked, and lying at the quay with her paint still wet.`
      : `The ${h.name} is ${Math.round(share * 100)}% built. The master shipwright says ${left} days, and means ${Math.round(left * 1.1)}.`),
    g.launchReady && g.dockedAt === 'lisboa'
      ? button(`Shift your flag into the ${h.name}`, () => {
        const err = g.launchShip();
        if (err) done(err, true);
        else done(`The ${h.name} is yours.`);
      }, { primary: true })
      : null,
  );
}

function suggestName(g: Game): string {
  const names = ['Nossa Senhora da Graça', 'São Gabriel', 'Santa Maria da Luz', 'Espírito Santo', 'São Rafael', 'Flor de la Mar', 'Anunciada'];
  return names[g.designs.length % names.length];
}

/**
 * Her profile, as the master shipwright would draw it on a board: the hull in
 * side elevation, her castles, and her masts and sails to scale. `built` draws
 * only that much of her, for a ship on the stocks.
 */
function drawProfile(h: HullClass, d: ShipDesign | null, built = 1): SVGElement {
  const W = 460;
  const H = 210;
  const L = h.lwl;
  const tallest = Math.max(...h.masts.map((m) => m.ceHeight * 1.62));
  const scale = Math.min((W - 40) / (L * 1.25), (H - 24) / (tallest + h.draft + 2));
  const wl = H - 14 - h.draft * scale;
  const x = (z: number) => W / 2 + z * scale;
  const y = (up: number) => wl - up * scale;
  const free = h.draft * 0.85;
  const castle = h.castles ?? 0.6;
  const aft = free + h.draft * 0.72 * (0.3 + castle * 0.95);
  const fore = free + h.draft * 0.42 * (0.3 + castle * 0.95);
  const paint = ({ natural: '#6b4e30', red: '#8a2e22', black: '#221e1a', ochre: '#b3893c' } as Record<string, string>)[h.paint ?? 'natural'];

  const hullPath = [
    `M ${x(-L * 0.52)} ${y(aft)}`,
    `L ${x(-L * 0.36)} ${y(aft)}`,
    `L ${x(-L * 0.36)} ${y(free + 0.2)}`,
    `L ${x(L * 0.34)} ${y(free + 0.25)}`,
    `L ${x(L * 0.4)} ${y(fore)}`,
    `L ${x(L * 0.6)} ${y(fore + 0.4)}`,
    `Q ${x(L * 0.5)} ${y(0)} ${x(L * 0.38)} ${y(-h.draft)}`,
    `L ${x(-L * 0.42)} ${y(-h.draft)}`,
    `Q ${x(-L * 0.52)} ${y(-h.draft * 0.3)} ${x(-L * 0.52)} ${y(aft)}`,
    'Z',
  ].join(' ');

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'yard-svg', role: 'img', 'aria-label': `Profile of the ${h.name}` });
  root.append(svg('line', { x1: 0, x2: W, y1: wl, y2: wl, stroke: 'rgba(60, 90, 110, .5)', 'stroke-dasharray': '4 3' }));
  root.append(svg('path', { d: hullPath, fill: '#8c6a43', stroke: '#3d2c1a', 'stroke-width': 1.2, opacity: built < 1 ? 0.35 + built * 0.65 : 1 }));
  // The painted band above the wale.
  root.append(svg('path', {
    d: `M ${x(-L * 0.36)} ${y(free - 0.25)} L ${x(L * 0.34)} ${y(free - 0.2)} L ${x(L * 0.34)} ${y(free + 0.25)} L ${x(-L * 0.36)} ${y(free + 0.2)} Z`,
    fill: paint, opacity: 0.85,
  }));
  if (built < 1) return root;

  for (const m of h.masts) {
    const mx = x(m.station * L * 0.42);
    const top = m.name.startsWith('Gávea') ? m.ceHeight * 1.25 : m.ceHeight * 1.55;
    root.append(svg('line', { x1: mx, x2: mx, y1: y(free), y2: y(top), stroke: '#5a4027', 'stroke-width': 2 }));
    const side = Math.sqrt(m.area);
    if (m.rig === 'square') {
      const w = side * 0.95 * scale * 0.5;
      const hh = side * 0.9 * scale;
      const cy = y(m.ceHeight);
      root.append(svg('rect', { x: mx - w / 2, y: cy - hh / 2, width: w, height: hh, fill: '#e6dcc4', stroke: '#8c7c5c', 'stroke-width': 1 }));
      if (!m.name.startsWith('Gávea') && m === h.masts.reduce((a, b) => (b.area > a.area ? b : a)) && (d?.device ?? h.device) !== 'plain') {
        const r = Math.min(w, hh) * 0.22;
        root.append(svg('path', { d: `M ${mx - r} ${cy} H ${mx + r} M ${mx} ${cy - r} V ${cy + r}`, stroke: '#a3302b', 'stroke-width': Math.max(2, r * 0.45) }));
      }
    } else {
      const yardLen = side * 1.35 * scale;
      const peakX = mx - yardLen * 0.55;
      const peakY = y(m.ceHeight * 1.75);
      const tackX = mx + yardLen * 0.45;
      const tackY = y(free + 0.8);
      root.append(svg('path', {
        d: `M ${peakX} ${peakY} L ${tackX} ${tackY} L ${mx - yardLen * 0.15} ${y(free + 0.9)} Z`,
        fill: '#e6dcc4', stroke: '#8c7c5c', 'stroke-width': 1,
      }));
    }
  }
  return root;
}
