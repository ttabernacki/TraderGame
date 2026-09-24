import { el } from './dom';

/**
 * A discovery, announced across the sea.
 *
 * Raising an uncharted town and entering it under its own name are the two
 * biggest moments this game has, and they used to arrive as one line among the
 * alerts in the corner. This puts them up the way a map-maker would letter
 * them — large, spaced, and gone after a few seconds — over the picture of the
 * thing itself, which the camera has just swung round to.
 */
export class DiscoveryBanner {
  root = el('div', { class: 'discovery', 'aria-live': 'polite' });
  private timer = 0;

  show(cue: { kind: 'sighted' | 'named' | 'act'; eyebrow: string; title: string; sub: string; line: string }): void {
    window.clearTimeout(this.timer);
    this.root.className = `discovery ${cue.kind}`;
    this.root.replaceChildren(
      el('div', { class: 'discovery-eyebrow' }, cue.eyebrow),
      el('div', { class: 'discovery-rule' }),
      el('div', { class: 'discovery-title' }, cue.title),
      el('div', { class: 'discovery-sub' }, cue.sub),
      el('div', { class: 'discovery-rule' }),
      el('div', { class: 'discovery-line' }, cue.line),
    );
    // Restart the animation even when two come close together.
    void this.root.offsetWidth;
    this.root.classList.add('on');
    this.timer = window.setTimeout(() => this.root.classList.remove('on'),
      cue.kind === 'sighted' ? 6000 : 8500);
  }
}
