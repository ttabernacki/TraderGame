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
  key: string;
  hold?: boolean;
  hint?: string;
  wide?: boolean;
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

    const helm = this.pad('touch-helm', [
      { label: '❮', key: 'a', hold: true, hint: 'Port — alters course when the clock is up' },
      { label: '■', key: 'x', hold: true, hint: 'Steady as she goes' },
      { label: 'Hold', key: 'h', hint: 'Give the helm to the watch, or resume for the mark' },
      { label: '❯', key: 'd', hold: true, hint: 'Starboard — alters course when the clock is up' },
    ]);

    const rig = this.pad('touch-rig', [
      { label: '▲', key: 'w', hold: true, hint: 'Make sail' },
      { label: '▼', key: 's', hold: true, hint: 'Shorten' },
      { label: '↶', key: 'q', hold: true, hint: 'Ease' },
      { label: '↷', key: 'e', hold: true, hint: 'Harden' },
    ]);

    const top = this.pad('touch-top', [
      { label: '‹‹', key: '[', hint: 'Slower' },
      { label: '››', key: ']', hint: 'Faster' },
      { label: '', key: '', hint: 'Rate' },
      { label: 'Cam', key: 'v', hint: 'View' },
      { label: 'Orders', key: 'o', hint: 'What the ship is bound to' },
      { label: 'Chart', key: 'c', hint: 'Chart' },
      { label: 'Sight', key: 'n', hint: 'Sextant' },
      { label: 'Log', key: 'l', hint: 'Logbook' },
      { label: 'Crew', key: 'k', hint: 'Crew' },
      { label: 'Padrão', key: 'u', hint: 'Land a pillar and claim the place' },
      { label: 'Anchor', key: ' ', hint: 'Anchor', wide: true },
    ]);

    this.root.append(top, helm, rig);
    this.setVisible(false);
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
      class: `touch-btn${s.wide ? ' wide' : ''}`,
      type: 'button',
      'aria-label': s.hint ?? s.label,
      title: s.hint ?? s.label,
    }, s.label);

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
    this.visible = on;
    this.root.classList.toggle('on', on);
    // Nothing should stay held while the controls are off the screen.
    if (!on) this.releaseAll();
  }

  isVisible(): boolean {
    return this.visible;
  }
}
