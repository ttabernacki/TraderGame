import { compassPoint, formatLat, formatLon } from '../core/math';
import { LANDMARKS } from '../progression/crown';
import type { LogEntry } from '../game/log';
import type { Game } from '../game/state';
import { button, card, clear, el, kv } from './dom';

type Tab = 'log' | 'traverse' | 'sights' | 'discoveries';

const KIND_LABEL: Record<string, string> = {
  departure: 'Departure', landfall: 'Landfall', weather: 'Weather',
  navigation: 'Navigation', discovery: 'Discovery', crew: 'The company',
  trade: 'Trade', contact: 'Contact', crown: 'The Crown', peril: 'Peril', note: '',
};

/** The ship's log, the traverse board, and the register of discoveries. */
export class LogbookView {
  root = el('div', { class: 'screen' });
  private body = el('div', { class: 'screen-body' });
  private tab: Tab = 'log';
  private game: Game | null = null;

  constructor(private onClose: () => void) {
    this.root.append(
      el('div', { class: 'screen-head' },
        el('h1', {}, 'The logbook'),
        el('div', { class: 'sub' }, 'Kept by the clerk, corrected by the pilot'),
      ),
      this.body,
      el('div', { class: 'screen-foot' }, button('Close  (L)', () => this.onClose())),
    );
  }

  open(g: Game): void {
    this.game = g;
    this.render();
  }

  private render(): void {
    const g = this.game;
    if (!g) return;
    clear(this.body);

    const tabs = el('div', { class: 'tabs' },
      ...(['log', 'traverse', 'sights', 'discoveries'] as Tab[]).map((t) =>
        el('button', {
          class: this.tab === t ? 'active' : '',
          onclick: () => { this.tab = t; this.render(); },
        }, { log: 'The log', traverse: 'Traverse board', sights: 'Observations', discoveries: 'Discoveries' }[t])),
    );

    const inner = el('div', { class: 'scroll-narrow' });
    switch (this.tab) {
      case 'log': this.renderLog(inner, g); break;
      case 'traverse': this.renderTraverse(inner, g); break;
      case 'sights': this.renderSights(inner, g); break;
      case 'discoveries': this.renderDiscoveries(inner, g); break;
    }

    this.body.append(tabs, inner);
  }

  private renderLog(host: HTMLElement, g: Game): void {
    const entries = g.log.recent(180);
    if (entries.length === 0) {
      host.append(el('p', {}, 'Nothing written yet.'));
      return;
    }
    let lastDate = '';
    for (const e of entries) {
      if (e.date !== lastDate) {
        lastDate = e.date;
        host.append(el('div', {
          style: {
            marginTop: '18px', marginBottom: '7px', fontSize: '13px',
            letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--ink-soft)',
            borderBottom: '1px solid rgba(90,74,55,0.25)', paddingBottom: '3px',
          },
        }, e.date));
      }
      host.append(this.entryNode(e));
    }
  }

  private entryNode(e: LogEntry): HTMLElement {
    const meta = [e.time, KIND_LABEL[e.kind] || null].filter(Boolean).join(' · ');
    return el('div', {
      style: {
        marginBottom: '12px', paddingLeft: '13px',
        borderLeft: `2px solid ${e.important ? 'rgba(168,50,40,0.5)' : 'rgba(90,74,55,0.2)'}`,
      },
    },
      el('div', { style: { fontSize: '11px', color: 'var(--ink-faint)', marginBottom: '3px' } },
        meta + (e.lat !== undefined ? `  ·  ${formatLat(e.lat)}, ${formatLon(e.lon!)}` : '')),
      el('div', { style: { fontSize: '14.5px', lineHeight: '1.62' } }, e.text),
    );
  }

  private renderTraverse(host: HTMLElement, g: Game): void {
    host.append(el('p', { class: 'quote' },
      'The traverse board: course and distance run in each watch, pricked out with pegs at the time and copied into the book at the change of the watch. Everything the pilot knows about where he is, he gets from adding these lines together.'));

    const rows = g.nav.traverse.slice(-70).reverse();
    if (rows.length === 0) {
      host.append(el('p', {}, 'No watches logged yet.'));
      return;
    }

    const table = el('table', { class: 'ledger' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Watch ending'),
        el('th', {}, 'Course'),
        el('th', { class: 'num' }, 'Distance'),
        el('th', {}, 'Wind'),
      )),
    );
    const tbody = el('tbody', {});
    let total = 0;
    for (const r of rows) {
      total += r.distance;
      const hours = Math.floor((r.t % 86400) / 3600);
      tbody.append(el('tr', {},
        el('td', {}, `${String(hours).padStart(2, '0')}h00`),
        el('td', {}, `${r.course.toFixed(0)}° ${compassPoint(r.course)}`),
        el('td', { class: 'num' }, `${r.distance.toFixed(1)} miles`),
        el('td', {}, `${compassPoint(r.windFrom)} ${r.windKnots.toFixed(0)} kn`),
      ));
    }
    table.append(tbody);
    host.append(
      el('div', { class: 'card' }, kv('Distance run in these watches', `${total.toFixed(0)} nautical miles`)),
      table,
    );
  }

  private renderSights(host: HTMLElement, g: Game): void {
    host.append(el('p', { class: 'quote' },
      'Every observation taken, with the doubt attached to it. A latitude is only as good as the instrument, the tables, and the state of the sea when it was taken.'));

    const fixes = g.nav.fixes.slice(-60).reverse();
    if (fixes.length === 0) {
      host.append(el('p', {}, 'No observations taken. You are sailing on the reckoning alone, which is how most of them were lost.'));
      return;
    }
    const table = el('table', { class: 'ledger' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Method'),
        el('th', {}, 'Body'),
        el('th', { class: 'num' }, 'Latitude'),
        el('th', { class: 'num' }, 'Doubt'),
      )),
    );
    const tbody = el('tbody', {});
    for (const f of fixes) {
      tbody.append(el('tr', {},
        el('td', {}, f.method),
        el('td', {}, f.body),
        el('td', { class: 'num' }, formatLat(f.latitude)),
        el('td', { class: 'num' }, `± ${(f.sigma * 60).toFixed(0)}′`),
      ));
    }
    table.append(tbody);
    host.append(table);
  }

  private renderDiscoveries(host: HTMLElement, g: Game): void {
    const found = g.crown.discoveries;
    host.append(
      el('div', { class: 'card' },
        kv('Entered on the register', String(found.length)),
        kv('Renown not yet claimed', String(g.crown.unreportedValue())),
        kv('Coastline drawn', `${(g.chart.coverage() * 100).toFixed(1)}% of the known world`),
        kv('Mean error in the drawing', `${g.chart.meanError().toFixed(1)} miles`),
      ),
    );

    host.append(card('Landmarks of the route',
      el('ul', { class: 'list' },
        ...LANDMARKS.map((l) => {
          const got = g.crown.landmarksFound.has(l.id);
          return el('li', { style: { opacity: got ? '1' : '0.45' } },
            el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px' } },
              el('span', {}, got ? l.name : '— not yet reached —'),
              el('span', { style: { color: 'var(--ink-soft)' } }, `${l.value} renown`)),
            got ? el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '4px', lineHeight: '1.55' } }, l.announce) : null,
          );
        }),
      ),
    ));

    if (found.length > 0) {
      host.append(card('The register',
        el('table', { class: 'ledger' },
          el('thead', {}, el('tr', {},
            el('th', {}, 'Discovery'), el('th', {}, 'Kind'),
            el('th', { class: 'num' }, 'Position reported'), el('th', { class: 'num' }, 'Renown'),
          )),
          el('tbody', {}, ...found.slice().reverse().map((d) => el('tr', {},
            el('td', {}, d.name),
            el('td', {}, d.kind),
            el('td', { class: 'num' }, `${formatLat(d.lat)}, ${formatLon(d.lon)}`),
            el('td', { class: 'num' }, `${d.value}${d.reported ? '' : ' (unclaimed)'}`),
          ))),
        ),
      ));
    }
  }
}
