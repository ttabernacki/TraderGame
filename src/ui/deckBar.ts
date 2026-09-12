import { el } from './dom';

/**
 * The controls a captain has on deck, for a player with a mouse.
 *
 * The on-screen controls used to be one set of thumb pads drawn on every
 * screen, and hiding them on a desktop — because eleven fat buttons across the
 * sky is a phone's layout, not a monitor's — quietly took the clock, the book,
 * the quadrant and the anchor off the screen altogether. A key list along the
 * bottom is not a control surface: nothing on it can be *seen* to be pressed,
 * nothing shows the rate the clock is running at, and a player who does not
 * already know the game has no way in.
 *
 * So a desktop gets its own bar: mouse-sized rather than thumb-sized, one row
 * along the bottom, and only the things that are a *button* — something you
 * decide once and click. The things you hold — the helm, the sheets, the yards
 * — stay on the keys, because holding a mouse button on a screen control is a
 * worse way to steer than resting two fingers on A and D, and they are listed
 * on the hint line above.
 */

export interface BarHandlers {
  tapKey: (key: string) => void;
}

interface Item {
  label: string;
  key: string;
  /** What it does, for the tooltip. */
  hint: string;
  /** How the key reads on the face of the button. */
  cap?: string;
}

const ITEMS: Item[] = [
  { label: 'The book', key: 'j', cap: 'J', hint: 'Chart, rutter, log, orders and company' },
  { label: 'Sight', key: 'n', cap: 'N', hint: 'Take the sun or the pole star with the quadrant' },
  { label: '\u266a', key: 'm', cap: 'M', hint: 'Sound on or off' },
  { label: 'View', key: 'v', cap: 'V', hint: 'Shift the view about the ship' },
  { label: 'Padrão', key: 'u', cap: 'U', hint: 'Land a pillar and claim the place for the Crown' },
];

/** True where the player has a mouse, which is who this bar is for. */
function hasMouse(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(pointer: fine)').matches;
}

export class DeckBar {
  root = el('div', { id: 'deckbar' });

  /**
   * The rate, between the two arrows. A readout rather than a control: there is
   * no pause key to bind it to — the slowest notch of the clock *is* stopped —
   * and a player pressing the arrows without it is pressing them blind.
   */
  private rate = el('div', { class: 'deckbar-rate' }, '×4');
  private anchor = el('button', { class: 'deckbar-btn anchor', type: 'button' });
  private visible = false;

  constructor(private handlers: BarHandlers) {
    const tap = (k: string) => (e: Event) => { e.preventDefault(); this.handlers.tapKey(k); };

    // The clock, which is the control a player reaches for most and the one
    // that vanished most completely.
    const clock = el('div', { class: 'deckbar-group' },
      el('button', { class: 'deckbar-step', type: 'button', title: 'Slow the clock  ([)', onpointerdown: tap('[') }, '‹‹'),
      this.rate,
      el('button', { class: 'deckbar-step', type: 'button', title: 'Wind the clock on  (])', onpointerdown: tap(']') }, '››'),
    );

    const business = el('div', { class: 'deckbar-group' });
    for (const it of ITEMS) {
      business.append(el('button', {
        class: 'deckbar-btn',
        type: 'button',
        title: `${it.hint}  (${it.cap ?? it.key})`,
        onpointerdown: tap(it.key),
      },
        el('span', {}, it.label),
        it.cap ? el('b', {}, it.cap) : null,
      ));
    }

    this.anchor.append(el('span', {}, 'Anchor'), el('b', {}, '␣'));
    this.anchor.title = 'Hand sail, let go the anchor and go ashore  (Space)';
    this.anchor.addEventListener('pointerdown', tap(' '));

    this.root.append(clock, business, el('div', { class: 'deckbar-group' }, this.anchor));
    this.setVisible(false);
  }

  /** What the clock is doing, on the face of the button between the arrows. */
  setRate(label: string, paused: boolean): void {
    const text = paused ? 'Stopped' : label;
    if (this.rate.textContent !== text) this.rate.textContent = text;
    this.rate.classList.toggle('paused', paused);
  }

  /** Whether she is at anchor, so the button says the thing it will do. */
  setAnchored(down: boolean): void {
    const word = down ? 'Weigh' : 'Anchor';
    const face = this.anchor.firstElementChild;
    if (face && face.textContent !== word) face.textContent = word;
  }

  setVisible(on: boolean): void {
    if (on && !hasMouse()) on = false;
    this.visible = on;
    this.root.classList.toggle('on', on);
  }

  get shown(): boolean {
    return this.visible;
  }
}
