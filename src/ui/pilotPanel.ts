import type { Game } from '../game/state';
import { TUTORIAL, tutorialMark } from '../game/tutorial';
import { clear, el } from './dom';

/**
 * The pilot, talking.
 *
 * Deliberately not a tooltip, a modal, or a checklist with ticks. It is a man
 * on the quarterdeck saying one thing at a time, and it looks like the rest of
 * the ship's furniture rather than like a layer over the top of it — because
 * the moment a tutorial announces itself as a tutorial, the player starts
 * waiting for it to be over instead of listening to it.
 *
 * One step is shown. It is collapsed to its instruction by default, because a
 * paragraph of prose parked over the sea on every frame is a paragraph nobody
 * reads twice; the whole of what he says is a click away and stays open if the
 * player wants it open. It can be put away for good, and it puts itself away
 * when the first commission is discharged.
 */
export class PilotPanel {
  root = el('div', { class: 'pilot' });

  private head = el('div', { class: 'pilot-head' });
  private task = el('div', { class: 'pilot-task' });
  private body = el('div', { class: 'pilot-body' });
  private mark = el('div', { class: 'pilot-mark' });
  private open = false;
  /** The step currently drawn, so the panel is only rebuilt when it changes. */
  private shown: string | null = null;

  constructor(private onDismiss: () => void) {
    this.root.append(this.head, this.task, this.body, this.mark);
    this.root.style.display = 'none';
  }

  update(g: Game): void {
    const step = g.tutorialStep();
    if (!step) {
      this.root.style.display = 'none';
      this.shown = null;
      return;
    }
    this.root.style.display = '';

    if (this.shown !== step.id) {
      this.shown = step.id;
      // A new instruction opens itself once — except on a phone, where the
      // paragraph would cover a third of the sea. There it is a single line,
      // and the ? opens it.
      this.open = !(typeof window !== 'undefined' && window.matchMedia?.('(max-width: 860px)').matches);
      this.rebuild(g, step.id);
    }
    // The distance to the mark moves every watch, so it is refreshed even when
    // the step has not changed.
    const m = tutorialMark(g, step);
    this.mark.textContent = m ?? '';
    this.mark.style.display = m ? '' : 'none';
  }

  private rebuild(g: Game, id: string): void {
    const step = TUTORIAL.find((s) => s.id === id);
    if (!step) return;
    const n = TUTORIAL.findIndex((s) => s.id === id) + 1;

    clear(this.head);
    this.head.append(
      el('span', { class: 'pilot-who' }, step.from),
      el('span', { class: 'pilot-count' }, `${n} of ${TUTORIAL.length}`),
    );

    clear(this.task);
    this.task.append(
      el('span', {}, step.task),
      el('button', {
        class: 'pilot-more',
        title: this.open ? 'Say less' : 'What he said',
        onclick: () => { this.open = !this.open; this.rebuild(g, id); },
      }, this.open ? '−' : '?'),
      el('button', {
        class: 'pilot-more',
        title: 'Find your own way — the pilot stops explaining',
        onclick: () => this.onDismiss(),
      }, '×'),
    );

    clear(this.body);
    this.body.style.display = this.open ? '' : 'none';
    if (this.open) this.body.append(el('p', {}, step.says));
  }
}
