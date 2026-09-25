import { el } from './dom';

/**
 * On-screen controls, for playing without a keyboard.
 *
 * Two kinds of control. A *held* button is pressed and kept pressed — the helm,
 * making and shortening sail, trimming the yards — and works by putting a
 * virtual key into the same key set the keyboard fills, so every one of them
 * goes through exactly the code path the real keys do and nothing can drift out
 * of step between the two. A *tapped* button fires once and is routed to the
 * same handler a key press would reach.
 *
 * Laid out for thumbs: the helm under the left one, the sails under the right,
 * and the clock and the ship's business along the top, clear of both.
 */
export interface TouchHandlers {
  /** Hold a virtual key down, or let it up. */
  setKey: (key: string, down: boolean) => void;
  /** Fire a single key, as if it had been pressed and released. */
  tapKey: (key: string) => void;
}

interface Spec {
  label: string;
  /** A word under the glyph, so nobody has to guess what an arrow does. */
  cap?: string;
  key: string;
  hold?: boolean;
  hint?: string;
  wide?: boolean;
}

/**
 * Whether this is a device operated by touch. A coarse pointer is the honest
 * signal: it means fingers, and fingers are what these controls exist for.
 */
function hasFingers(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

export class TouchControls {
  root = el('div', { id: 'touch', class: 'touch' });
  private handlers: TouchHandlers;
  private visible = false;
  /** Which virtual key each live pointer is holding down. */
  private held = new Map<number, { key: string; button: HTMLElement }>();
  private rate = el('div', { class: 'touch-rate' }, 'x4');

  constructor(handlers: TouchHandlers) {
    this.handlers = handlers;

    const up = (e: PointerEvent) => this.release(e.pointerId);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });

    // Built for one hand on a phone held upright.
    //
    // The old layout was three rows of glyphs — a top strip of eleven buttons
    // that ran off the edge of the screen, and two corner pads of arrows whose
    // meaning a player had to guess. Now the top carries only what is reached
    // for every minute (the clock, the book, the anchor) and a "more" sheet
    // holds the rest; the bottom is one dock, full width, with the helm on one
    // row and the canvas on the other, every button saying what it does.
    const helm = this.pad('touch-helm', [
      { label: '◀', cap: 'Port', key: 'a', hold: true, hint: 'Alter course to port' },
      { label: '■', cap: 'Steady', key: 'x', hold: true, hint: 'Steady as she goes' },
      { label: '⌖', cap: 'Mark', key: 'h', hint: 'Steer for the mark laid off on the chart' },
      { label: '▶', cap: 'Starboard', key: 'd', hold: true, hint: 'Alter course to starboard' },
    ]);

    const rig = this.pad('touch-rig', [
      { label: '▲', cap: 'Make sail', key: 'w', hold: true, hint: 'Make sail' },
      { label: '▼', cap: 'Shorten', key: 's', hold: true, hint: 'Shorten sail' },
      { label: '↶', cap: 'Ease', key: 'q', hold: true, hint: 'Ease the sheets' },
      { label: '↷', cap: 'Harden', key: 'e', hold: true, hint: 'Harden in the sheets' },
      { label: '⇄', cap: 'Tack', key: 't', hint: 'About ship — put her on the other tack' },
      { label: '⏪', cap: 'Astern', key: 'b', hint: 'Back her astern, off whatever she is on' },
    ]);

    const top = this.pad('touch-top', [
      { label: '‹‹', key: '[', hint: 'Slower' },
      { label: '', key: '', hint: 'Rate' },
      { label: '››', key: ']', hint: 'Faster' },
      // One button for the book, which is everything written down.
      { label: 'Book', key: 'j', hint: 'Chart, rutter, log, orders, company', wide: true },
    ]);
    this.anchorBtn = this.button({ label: 'Anchor', key: ' ', hint: 'Anchor, or weigh', wide: true });
    const moreBtn = el('button', {
      class: 'touch-btn touch-more-btn', type: 'button', 'aria-label': 'More', title: 'More',
    }, '⋯');
    moreBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.more.classList.toggle('on');
    });
    top.append(this.anchorBtn, moreBtn);

    // The things wanted now and then, in a sheet that drops from the top bar.
    for (const s of [
      { label: 'Take a sight', key: 'n', hint: 'The quadrant: the sun at noon, or the pole star' },
      { label: 'Heave the lead', key: 'g', hint: 'Depth, the ground, and how far off the land she is' },
      { label: 'Change the view', key: 'v', hint: 'Shift the view about the ship' },
      { label: 'Sound on / off', key: 'm', hint: 'Sound' },
      { label: 'Save or load', key: 'f2', hint: 'The Book of Voyages' },
    ] as Spec[]) {
      const b = this.button({ ...s, wide: true });
      b.addEventListener('pointerup', () => this.more.classList.remove('on'));
      this.more.append(b);
    }

    this.dock.append(helm, rig);
    this.root.append(top, this.more, this.dock);
    this.setVisible(false);
  }

  private dock = el('div', { class: 'touch-dock' });
  private more = el('div', { class: 'touch-more' });
  private anchorBtn!: HTMLElement;

  /** Whether she is at anchor, so the button says what it will do. */
  setAnchored(down: boolean): void {
    const word = down ? 'Weigh' : 'Anchor';
    if (this.anchorBtn.textContent !== word) this.anchorBtn.textContent = word;
  }

  private pad(cls: string, specs: Spec[]): HTMLElement {
    const host = el('div', { class: `touch-pad ${cls}` });
    for (const s of specs) {
      // The rate is a readout rather than a control: the two buttons either
      // side of it change the clock, and without it in the middle the player is
      // pressing them blind.
      if (s.key === '') { host.append(this.rate); continue; }
      host.append(this.button(s));
    }
    return host;
  }

  /** Tell the controls what the clock is doing. */
  setRate(label: string): void {
    if (this.rate.textContent !== label) this.rate.textContent = label;
  }

  private button(s: Spec): HTMLElement {
    const b = el('button', {
      class: `touch-btn${s.wide ? ' wide' : ''}${s.cap ? ' capped' : ''}`,
      type: 'button',
      'aria-label': s.hint ?? s.label,
      title: s.hint ?? s.label,
    }, s.cap ? el('span', { class: 'touch-glyph' }, s.label) : s.label,
    s.cap ? el('span', { class: 'touch-cap' }, s.cap) : null);

    if (s.hold) {
      // A held control is registered against the pointer that started it and
      // released from a listener on the window, never from one on the button.
      // A finger that slides off, a pointer the browser cancels, a tab that
      // loses focus — any of those leaves the button's own pointerup unfired,
      // and a helm left hard over because a thumb wandered is how ships are
      // lost. The window sees the release wherever it happens.
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.hold(e.pointerId, s.key, b);
      });
    } else {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.classList.add('held');
        this.handlers.tapKey(s.key);
      });
      const up = () => b.classList.remove('held');
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    }
    // Never let a control drag the camera underneath it.
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  private hold(pointerId: number, key: string, button: HTMLElement): void {
    this.release(pointerId);
    this.held.set(pointerId, { key, button });
    button.classList.add('held');
    this.handlers.setKey(key, true);
  }

  private release(pointerId: number): void {
    const h = this.held.get(pointerId);
    if (!h) return;
    this.held.delete(pointerId);
    h.button.classList.remove('held');
    // Only let the key up once no other finger is still on the same control.
    for (const other of this.held.values()) if (other.key === h.key) return;
    this.handlers.setKey(h.key, false);
  }

  private releaseAll(): void {
    for (const id of [...this.held.keys()]) this.release(id);
  }

  setVisible(on: boolean): void {
    // Only where there are fingers.
    //
    // The top row of buttons was drawn on every screen, so a desktop player got
    // a permanent strip of eleven controls across the sky duplicating keys the
    // hint line already lists — which was most of the clutter, and every one of
    // them a thing to wonder whether you were supposed to press. A mouse has a
    // keyboard next to it. A thumb does not.
    if (on && !hasFingers()) on = false;
    this.visible = on;
    this.root.classList.toggle('on', on);
    // Nothing should stay held while the controls are off the screen.
    if (!on) { this.releaseAll(); this.more.classList.remove('on'); }
  }

  isVisible(): boolean {
    return this.visible;
  }
}
