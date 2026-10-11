import { ordersDone, reportVoyage, voyageOf, VOYAGES } from '../campaigns/xiyang/imperial';
import type { Game } from '../game/state';
import { append, button, card, clear, el, kv } from './dom';

/** The Admiral's hall at a Ming port: the Emperor's orders, how far they are done, and the report. */
export class AdmiralView {
  root = el('div', { class: 'screen' });
  private body = el('div', { class: 'screen-body' });
  private head = el('div', { class: 'screen-head' });
  private foot = el('div', { class: 'screen-foot' });
  private game: Game | null = null;
  private closing = '';

  constructor(private onClose: () => void) {
    this.root.append(this.head, this.body, this.foot);
  }

  open(g: Game): void {
    this.game = g;
    this.closing = '';
    this.render();
  }

  private render(): void {
    const g = this.game;
    const s = g?.imperial;
    if (!g || !s) return;
    const v = voyageOf(s);
    clear(this.head);
    this.head.append(
      el('h1', {}, 'The Admiral’s hall'),
      el('div', { class: 'sub' }, `${g.clock.formatDate()} · favour at court ${s.favour}`),
    );
    clear(this.body);
    if (this.closing) {
      this.body.append(card('The report', el('p', {}, this.closing)));
    }
    if (v) {
      this.body.append(card(`${v.title} · ${v.years}`,
        el('p', {}, v.orders),
        ...v.objectives.map((o) => el('div', { class: `court-agreement${s.done[o.id] ? '' : ' late'}` },
          el('span', {}, `${s.done[o.id] ? '✓ ' : '• '}${o.text}`))),
        kv('When it is done', `${v.silver} in silver, ${v.renown} in the Emperor’s regard`),
      ));
    } else {
      this.body.append(card('Orders',
        el('p', {}, s.completed.length === VOYAGES.length
          ? 'The Emperor’s orders for the next voyage are not yet cut. Wait for the monsoon.'
          : 'There are no orders for you at present.')));
    }
    clear(this.foot);
    append(this.foot,
      v && ordersDone(s)
        ? button('Report the voyage', () => { this.closing = reportVoyage(g) ?? ''; this.render(); }, { primary: true })
        : null,
      button('Withdraw', () => this.onClose(), { primary: !(v && ordersDone(s)) }));
  }
}
