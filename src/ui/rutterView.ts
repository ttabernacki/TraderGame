import { formatLat, formatLon } from '../core/math';
import {
  CONFIDENCE_LABEL, DAMAGE_LABEL, KIND_LABEL, describeSea, monthName, seaSentence,
  type Confidence, type Entry, type EntryKind, type Note,
} from '../game/rutter';
import type { Game } from '../game/state';
import { append, button, clear, el } from './dom';

const KIND_ORDER: EntryKind[] = [
  'passage', 'coast', 'port', 'people', 'rumour', 'chronicle', 'nature', 'person',
];

/**
 * O Roteiro: the pilot's book.
 *
 * Written as a book rather than as a screen. There is a shelf of pages down the
 * left in the order a pilot would keep them — the sea first, because that is
 * what he opens it for — and one page open on the right at a time, in his hand,
 * with what he saw, what he was told, what he heard said and what he supposes,
 * kept visibly apart. Everything on it was written by the ship as the voyage
 * happened; the only thing the player adds is the last kind, which is the one
 * that is his.
 *
 * The damage is drawn rather than listed. A page that has been in the sea is
 * stained and some of its words are gone, and you can still mostly read it,
 * which is the honest representation of what a wet page is: not deleted, worse.
 */
export class RutterView {
  root = el('div', { class: 'screen' });

  private head = el('div', { class: 'screen-head' });
  private body = el('div', { class: 'screen-body' });
  private foot = el('div', { class: 'screen-foot' });
  private game: Game | null = null;
  private openId: string | null = null;
  private filter: EntryKind | 'all' = 'all';
  private draft = '';
  private notice: string | null = null;

  constructor(private onClose: () => void) {
    this.root.append(this.head, this.body, this.foot);
  }

  open(g: Game): void {
    this.game = g;
    this.notice = null;
    this.render();
  }

  private render(): void {
    const g = this.game;
    if (!g) return;
    const all = g.rutter.entries;
    const shown = all
      .filter((e) => this.filter === 'all' || e.kind === this.filter)
      .sort((a, b) => b.lastSeen - a.lastSeen);
    const current = all.find((e) => e.id === this.openId) ?? shown[0] ?? null;
    this.openId = current?.id ?? null;

    clear(this.head);
    const atlas = g.atlas();
    this.head.append(
      el('h1', {}, 'O Roteiro'),
      el('div', { class: 'sub' },
        all.length === 0
          ? 'Nothing in it yet. It fills itself as you sail.'
          : `${all.length} pages · ${g.rutter.unpublished().length} nobody else has seen`
            + (atlas.entries > 0 ? ` · ${atlas.entries} in your atlas` : '')),
    );

    clear(this.foot);
    this.foot.append(
      el('div', { style: { marginRight: 'auto', fontSize: '13.5px', opacity: '0.75' } },
        this.notice ?? (g.dockedAt
          ? 'Ashore: a page may be laid before the Casa, sold, or entered in your atlas.'
          : 'What to do with it is decided ashore.')),
      button('Shut the book  (Esc)', () => this.onClose()),
    );

    clear(this.body);
    if (all.length === 0) {
      this.body.append(el('p', { class: 'flavour' },
        'A roteiro is not written in advance. Sail, and it will have something in it.'));
      return;
    }

    const shelf = el('div', { class: 'rutter-shelf' });
    const kinds: (EntryKind | 'all')[] = ['all',
      ...KIND_ORDER.filter((k) => all.some((e) => e.kind === k))];
    const tabs = el('div', { class: 'rutter-tabs' });
    for (const k of kinds) {
      tabs.append(el('button', {
        class: `rutter-tab${this.filter === k ? ' active' : ''}`,
        onclick: () => { this.filter = k; this.render(); },
      }, k === 'all' ? 'All' : KIND_LABEL[k]));
    }
    shelf.append(tabs);

    const list = el('div', { class: 'rutter-list' });
    for (const e of shown) {
      list.append(el('button', {
        class: `rutter-item${e.id === current?.id ? ' active' : ''}`
          + (e.damage.length ? ' hurt' : ''),
        onclick: () => { this.openId = e.id; this.notice = null; this.render(); },
      },
        el('b', {}, e.title),
        el('span', {},
          `${KIND_LABEL[e.kind]} · ${e.notes.length} `
          + (e.notes.length === 1 ? 'line' : 'lines')
          + (e.visits > 1 ? ` · ${e.visits} visits` : '')
          + (e.published ? ` · ${publishedWord(e.published)}` : '')),
      ));
    }
    shelf.append(list);

    this.body.append(el('div', { class: 'rutter' }, shelf,
      current ? this.page(g, current) : el('div', {})));
  }

  private page(g: Game, e: Entry): HTMLElement {
    const page = el('div', { class: `rutter-page${e.damage.length ? ' damaged' : ''}` });
    for (const d of e.damage) page.classList.add(`dmg-${d}`);

    const opened = new Date((e.opened / 86400 - 719162) * 86400000);
    void opened;
    page.append(
      el('div', { class: 'rutter-page-head' },
        el('h2', {}, e.title),
        el('div', { class: 'rutter-where' },
          `${formatLat(e.lat)}, ${formatLon(e.lon)} by the reckoning`),
        e.damage.length
          ? el('div', { class: 'rutter-damage' },
            e.damage.map((d) => DAMAGE_LABEL[d]).join(', '))
          : null,
      ),
    );

    // The sea pages carry the thing the whole book is for, so they get it in
    // full rather than as one line.
    const seaKey = e.key.startsWith('sea:') ? e.key.slice(4) : null;
    const s = seaKey ? g.rutter.sea.get(seaKey) : undefined;
    if (s) {
      const d = describeSea(s);
      page.append(el('div', { class: 'rutter-sea' },
        el('div', { class: 'rutter-sea-rose' }, rose(d.windFrom, d.steadiness)),
        el('div', {},
          // Under a watch in the square is not a rule about it, and the book
          // should not pretend otherwise — it is the difference between a
          // roteiro and a guess with a compass rose drawn on it.
          el('p', {}, d.hours >= 4
            ? seaSentence(s)
            : 'Too few hours in this water to say what it does.'),
          el('p', { class: 'flavour' },
            `${monthName(s.month)}, ${d.hours < 1 ? 'under an hour' : `${d.hours.toFixed(0)} hours`} `
            + 'of it in the book. '
            + (d.settled
              ? 'Enough to lay a passage by.'
              : 'Not yet enough to swear to.')),
        ),
      ));
    }

    const byConf: Confidence[] = ['observed', 'reported', 'rumoured', 'speculative'];
    for (const c of byConf) {
      const notes = e.notes.filter((n) => n.confidence === c);
      if (notes.length === 0) continue;
      const block = el('div', { class: `rutter-conf conf-${c}` });
      block.append(el('div', { class: 'rutter-conf-head' }, CONFIDENCE_LABEL[c]));
      for (const n of notes) block.append(this.line(e, n));
      page.append(block);
    }

    // The captain's own hand.
    const field = el('textarea', {
      class: 'rutter-write',
      rows: '2',
      placeholder: 'What do you suppose? (entered as your own, and marked as a supposition)',
      oninput: (ev: Event) => { this.draft = (ev.target as HTMLTextAreaElement).value; },
      onkeydown: (ev: KeyboardEvent) => {
        ev.stopPropagation();
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          this.commit(g, e);
        }
      },
    }) as HTMLTextAreaElement;
    field.value = this.draft;
    page.append(el('div', { class: 'rutter-own' }, field,
      button('Write it', () => this.commit(g, e))));

    page.append(this.publishing(g, e));
    return page;
  }

  private commit(g: Game, e: Entry): void {
    if (!this.draft.trim()) return;
    this.notice = g.writeSupposition(e.id, this.draft);
    this.draft = '';
    this.render();
  }

  private line(e: Entry, n: Note): HTMLElement {
    // A page that has been in the sea has lost words, not sentences.
    const text = e.damage.includes('water') || e.damage.includes('fire')
      ? blur(n.text, e.id + n.id)
      : n.text;
    return el('div', { class: `rutter-line${n.mine ? ' mine' : ''}` },
      el('span', {}, text),
      n.source ? el('em', {}, ` — ${n.source}`) : null,
    );
  }

  private publishing(g: Game, e: Entry): HTMLElement {
    const worth = g.rutter.worth(e);
    if (e.published) {
      return el('div', { class: 'rutter-publish done' },
        el('span', {}, `This page is ${publishedWord(e.published)}. `
          + (e.published === 'crown'
            ? 'Every pilot on the run has a copy of it.'
            : e.published === 'merchants'
              ? 'The Rua Nova has it, and the Casa knows you sold it.'
              : 'It stands in your atlas under your own name.')));
    }
    const row = el('div', { class: 'rutter-publish' });
    row.append(el('div', { class: 'rutter-publish-head' }, 'What is it for?'));
    const act = (label: string, detail: string, to: 'crown' | 'merchants' | 'atlas') =>
      el('button', {
        class: 'rutter-act',
        disabled: !g.dockedAt,
        onclick: () => { this.notice = g.publish(e.id, to); this.render(); },
      }, el('b', {}, label), el('span', {}, detail));
    row.append(el('div', { class: 'rutter-acts' },
      act('Lay it before the Casa', `${worth.crown} renown · every pilot gets it`, 'crown'),
      act('Sell it on the Rua Nova', `${worth.merchants} cruzados · the Casa hears`, 'merchants'),
      act('Enter it in your atlas', `${worth.atlas} renown · it outlives you`, 'atlas'),
    ));
    row.append(el('p', { class: 'flavour' },
      'Or keep it. Nobody else can lay this passage while you are the only man who has it.'));
    return row;
  }
}

function publishedWord(p: 'crown' | 'merchants' | 'atlas'): string {
  return p === 'crown' ? 'with the Casa' : p === 'merchants' ? 'sold' : 'in the atlas';
}

/**
 * A page that has been wet. Some words are gone and the rest is still there.
 *
 * Deterministic on the page and the line, so the same words are missing every
 * time it is opened — the damage is a property of the book, not of the render.
 */
function blur(text: string, seed: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const words = text.split(' ');
  return words.map((w, i) => {
    h = Math.imul(h ^ i, 16777619);
    return ((h >>> 8) % 100) < 9 && w.length > 3 ? '—'.repeat(Math.min(w.length, 6)) : w;
  }).join(' ');
}

/** A wind rose: which way it holds, and how hard it holds that way. */
function rose(from: number, steadiness: number): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('width', '64');
  svg.setAttribute('height', '64');
  const ring = document.createElementNS(ns, 'circle');
  ring.setAttribute('cx', '32'); ring.setAttribute('cy', '32'); ring.setAttribute('r', '26');
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', 'rgba(90,74,55,0.45)');
  svg.appendChild(ring);
  // The arrow points the way the wind is going, which is what a pilot draws.
  const rad = ((from + 180) * Math.PI) / 180;
  const x = 32 + Math.sin(rad) * 22;
  const y = 32 - Math.cos(rad) * 22;
  const arm = document.createElementNS(ns, 'line');
  arm.setAttribute('x1', String(32 - Math.sin(rad) * 18));
  arm.setAttribute('y1', String(32 + Math.cos(rad) * 18));
  arm.setAttribute('x2', String(x));
  arm.setAttribute('y2', String(y));
  arm.setAttribute('stroke', '#8a3a2a');
  arm.setAttribute('stroke-width', String(1.4 + steadiness * 3.2));
  arm.setAttribute('stroke-linecap', 'round');
  svg.appendChild(arm);
  const head = document.createElementNS(ns, 'circle');
  head.setAttribute('cx', String(x)); head.setAttribute('cy', String(y));
  head.setAttribute('r', String(2 + steadiness * 2.4));
  head.setAttribute('fill', '#8a3a2a');
  svg.appendChild(head);
  return svg;
}

export { append };
