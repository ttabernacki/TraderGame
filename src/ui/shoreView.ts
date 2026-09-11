import { formatLat, formatLon } from '../core/math';
import { people } from '../world/peoples';
import type { Game, ShoreAction } from '../game/state';
import { button, card, clear, el, kv } from './dom';

/**
 * Anchored off a coast with no town on it.
 *
 * Raising land was the point of these voyages and, until this screen existed,
 * the whole of what a player could do about it was sail past: the coast was
 * scenery. A boat's crew went in for water, wood, something green and to find
 * out who lived there, and between them those four things decide how long a
 * ship can stay at sea. Every one of them costs a day the scurvy is still
 * working and the other man is still sailing, which is what makes choosing
 * between them worth anything.
 */
export class ShoreView {
  root = el('div', { class: 'screen' });
  private body = el('div', { class: 'screen-body' });
  private head = el('div', { class: 'screen-head' });
  private foot = el('div', { class: 'screen-foot' });
  private game: Game | null = null;
  private notice: string | null = null;

  constructor(private onClose: () => void, private onChart: () => void) {
    this.root.append(this.head, this.body, this.foot);
  }

  open(g: Game): void {
    this.game = g;
    this.notice = g.shoreReport;
    this.render();
  }

  private render(): void {
    const g = this.game;
    const place = g?.shoreHere;
    if (!g || !place) return;
    const folk = place.peopleId ? people(place.peopleId) : null;

    clear(this.head);
    this.head.append(
      el('h1', {}, 'The land'),
      el('div', { class: 'sub' },
        `${formatLat(g.nav.estimated.lat)}, ${formatLon(g.nav.estimated.lon)} by the reckoning`),
    );

    clear(this.foot);
    this.foot.append(
      el('div', { style: { marginRight: 'auto', fontSize: '13.5px' } },
        `${g.clock.formatDate()} · ${g.crew.provisions.water.toFixed(0)} days of water`),
      button('The chart  (C)', () => this.onChart()),
      button('Weigh anchor  (Space)', () => { g.weighAnchor(); this.onClose(); }, { primary: true }),
    );

    clear(this.body);
    const left = el('div', {});
    const right = el('div', {});

    left.append(el('div', { class: 'shore-lede' }, place.describe));

    if (this.notice) {
      left.append(card('The boat is back', el('p', { class: 'shore-report' }, this.notice)));
    }

    const rough = g.weatherNow.waveHeight > 2.4 || g.weatherNow.wind.speed > 24;
    if (rough) {
      left.append(el('div', { class: 'notice grave' },
        'There is too much sea on the beach today. Nothing can be landed until it goes down.'));
    }

    const actions = g.shoreActions();
    const list = el('div', { class: 'shore-actions' });
    for (const a of actions) {
      list.append(el('button', {
        class: `shore-action${a.done ? ' done' : ''}`,
        disabled: a.done || rough,
        onclick: () => {
          this.notice = g.sendBoatAshore(a.id as ShoreAction);
          this.render();
        },
      },
        el('b', {}, a.done ? `${a.label} — done` : a.label),
        el('span', {}, a.detail),
      ));
    }
    left.append(card('Send the boat in', list));

    // What the place is, in the terms that decide whether it is worth a day.
    right.append(card('The anchorage',
      kv('Depth under her', `${g.sounding.depth.toFixed(0)} fathoms`),
      kv('Off the beach', `${g.sounding.shoreDistNm.toFixed(1)} miles`),
      kv('The land behind', place.relief > 900 ? 'Mountainous'
        : place.relief > 260 ? 'Hilly' : 'Low'),
      kv('Whose country', folk ? folk.name : 'Nobody knows'),
      place.nearestPortId && place.nearestPortNm < 200
        ? kv('Nearest town', `${place.nearestPortNm.toFixed(0)} miles off`)
        : null,
    ));

    right.append(card('The ship',
      kv('Water', `${g.crew.provisions.water.toFixed(0)} days`),
      kv('Fresh food', `${g.crew.provisions.fresh.toFixed(0)} days`),
      kv('Days since anything green', `${g.crew.daysWithoutFresh.toFixed(0)}`),
      kv('Hands fit', `${g.crew.count}`),
    ));

    const padrao = g.padraoCheck();
    right.append(card('A pillar',
      el('p', { class: 'flavour' }, padrao.reason),
      padrao.ok
        ? button(`Set up ${padrao.name}`, () => {
          this.notice = g.raisePadrao();
          this.render();
        }, { primary: true })
        : null,
    ));

    this.body.append(el('div', { class: 'cols side' }, left, right));
  }
}
