import type { Game } from '../game/state';
import type { Outcome, PieceRun } from '../diplomacy/piece';
import { runView, stepPiece } from '../diplomacy/table';
import { card, el } from './dom';

/**
 * The panel any set piece plays in. It knows nothing of a piece's rules: it
 * draws the piece's own view, forwards the choice to the Table, and says what
 * came of it. Used inside an audience, and later by passages that arrive by
 * dispatch.
 */
export function pieceCard(
  g: Game, run: PieceRun, rerender: () => void,
  onLine: (who: 'them' | 'you' | 'narrator', text: string) => void,
  onDone: (o: Outcome) => void,
): HTMLElement {
  const v = runView(g, run);
  if (!v) return card('', el('p', {}, 'The moment has passed.'));
  return card(v.title,
    ...v.lines.map((l) => el('div', { class: `audience-line ${l.who}` }, l.text)),
    el('div', { class: 'shore-actions' },
      ...v.choices.map((c) => el('button', {
        class: 'shore-action', type: 'button', disabled: !!c.disabled,
        onclick: () => {
          onLine('you', c.label);
          const o = stepPiece(g, run, c.id);
          if (o) { onLine('narrator', o.line + '.'); onDone(o); } else rerender();
        },
      }, el('b', {}, c.label), c.hint ? el('span', {}, c.hint) : null))));
}
