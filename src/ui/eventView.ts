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
  show(event: SeaEvent | null): void {
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
      choices.append(el('button', {
        class: 'event-choice',
        type: 'button',
        onclick: () => this.onChoose(i),
      },
        el('span', { class: 'event-choice-label' }, c.label),
        el('span', { class: 'event-choice-detail' }, c.detail),
      ));
    });

    this.root.replaceChildren(el('div', { class: `event-card ${event.severity}` },
      el('div', { class: 'event-title' }, event.title),
      el('p', { class: 'event-text' }, event.text),
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
