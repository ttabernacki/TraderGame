import type { Counsel } from '../game/counsel';
import type { SeaEvent } from '../game/seaEvents';
import { el } from './dom';

/**
 * A decision put to the captain.
 *
 * Deliberately not one of the full-screen panels. What is happening is
 * happening *now*, on deck, and the player should still be able to see his ship
 * and the sea behind the card while he decides what to do about it.
 */
export class EventView {
  root = el('div', { class: 'event-card-host' });
  private onChoose: (index: number) => void;
  private showing: string | null = null;

  constructor(onChoose: (index: number) => void) {
    this.onChoose = onChoose;
  }

  /** Show this event, or clear the card when there is none. */
  show(event: SeaEvent | null, counsel: Counsel[] = []): void {
    if (!event) {
      if (this.showing !== null) {
        this.showing = null;
        this.root.replaceChildren();
      }
      return;
    }
    // Rebuilding the card every frame would restart its animation and steal
    // focus from the button the player is reaching for.
    if (this.showing === event.id) return;
    this.showing = event.id;

    const choices = el('div', { class: 'event-choices' });
    (event.choices ?? []).forEach((c, i) => {
      // Who is behind this course, by name, on the button itself — so the
      // choice reads as siding with somebody, which is what it is.
      const backers = counsel.filter((k) => k.backs === i).map((k) => k.who.split(' ').pop());
      choices.append(el('button', {
        class: 'event-choice',
        type: 'button',
        onclick: () => this.onChoose(i),
      },
        el('span', { class: 'event-choice-label' }, c.label),
        el('span', { class: 'event-choice-detail' }, c.detail),
        backers.length > 0
          ? el('span', { class: 'event-choice-backers' }, `${backers.join(', ')} would do this`)
          : null,
      ));
    });

    // The wardroom, before the captain decides. See game/counsel.
    const wardroom = counsel.length > 0
      ? el('div', { class: 'event-counsel' },
        ...counsel.map((k) => el('div', { class: 'event-counsel-line' },
          el('span', { class: 'event-counsel-who' }, `${k.who}, ${k.office}`),
          el('span', { class: 'event-counsel-says' }, `\u201c${k.says}\u201d`),
        )))
      : null;

    this.root.replaceChildren(el('div', { class: `event-card ${event.severity}${event.council ? ' council' : ''}` },
      event.council ? el('div', { class: 'event-eyebrow' }, 'At the chart table') : null,
      el('div', { class: 'event-title' }, event.title),
      // A blank line in the written text is a paragraph break and has to survive
      // as one. HTML collapses it, so a scene written in three beats — what
      // happened, who is standing where, what they are waiting for — arrived on
      // screen as a single grey slab.
      ...event.text.split(/\n\s*\n/).map((para) => el('p', { class: 'event-text' }, para.trim())),
      wardroom,
      choices,
    ));
    // So a keyboard player can answer without reaching for the mouse.
    requestAnimationFrame(() => {
      (this.root.querySelector('.event-choice') as HTMLElement | null)?.focus();
    });
  }

  /** Number keys pick a course, as they would in any ship's business. */
  handleKey(e: KeyboardEvent, count: number): boolean {
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > count) return false;
    this.onChoose(n - 1);
    return true;
  }
}
