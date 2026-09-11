import type { GameMode } from '../game/state';
import { clear, el } from './dom';

/**
 * O Livro do Capitão: the one book everything is kept in.
 *
 * The chart, the roteiro, the log, the King's orders and the muster were five
 * separate screens reached by five separate keys, and a player had to remember
 * which letter held which fact. They are not five things. They are the papers
 * of one ship, kept by one man, and on a real quarterdeck they lived in one
 * chest and were consulted together: you looked at the commission, then at the
 * chart, then at what the book said about the water off that coast, and the
 * whole point was moving between them without putting anything down.
 *
 * So they are bound. One key opens the book at whatever page was last open, and
 * the tabs along the head move between sections the way a thumb does — and the
 * old keys still go straight to their own section, because a captain who wants
 * the chart wants the chart.
 *
 * The shell is deliberately thin: each section is the screen it always was,
 * hosted whole. Nothing about the chart or the log had to change to be bound
 * into a book, which is the point of binding rather than rewriting.
 */

export interface Section {
  /** The mode this section corresponds to, so the old keys still land. */
  mode: GameMode;
  label: string;
  /** The key that opens it directly, shown on the tab. */
  key: string;
}

/**
 * One word each, capitalised the same way. A row of tabs is read at a glance
 * and an inconsistent one is read twice.
 */
export const SECTIONS: Section[] = [
  { mode: 'chart', label: 'Chart', key: 'C' },
  { mode: 'rutter', label: 'Roteiro', key: 'J' },
  { mode: 'logbook', label: 'Log', key: 'L' },
  { mode: 'orders', label: 'Orders', key: 'O' },
  { mode: 'crew', label: 'Company', key: 'K' },
];

export function isBookSection(mode: GameMode): boolean {
  return SECTIONS.some((s) => s.mode === mode);
}

export class BookView {
  root = el('div', { class: 'screen book' });

  private tabs = el('div', { class: 'book-tabs' });
  private host = el('div', { class: 'book-host' });
  private current: GameMode | null = null;

  constructor(private onPick: (mode: GameMode) => void) {
    this.root.append(this.tabs, this.host);
  }

  /** Put a section's screen in the book and mark its tab. */
  show(mode: GameMode, page: HTMLElement): void {
    this.current = mode;
    clear(this.tabs);
    this.tabs.append(el('div', { class: 'book-spine' }, 'The captain’s book'));
    for (const s of SECTIONS) {
      this.tabs.append(el('button', {
        class: `book-tab${s.mode === mode ? ' active' : ''}`,
        title: `${s.label}  (${s.key})`,
        onclick: () => this.onPick(s.mode),
      },
        el('b', {}, s.label),
        el('span', {}, s.key),
      ));
    }
    clear(this.host);
    this.host.append(page);
  }

  get section(): GameMode | null {
    return this.current;
  }
}
