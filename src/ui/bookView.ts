import type { Game, GameMode } from '../game/state';
import { entriesOf } from '../diplomacy/book';
import { POLITY_BY_ID } from '../diplomacy/polities';
import { KIND_ORDER, KIND_TITLE, byKind, knownFacts, type FactKind } from '../knowledge/information';
import { life } from '../ledger/life';
import { button, card, clear, el, fold } from './dom';
import { factCard } from './factCard';

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
  { mode: 'book', label: 'Book', key: 'J' },
  { mode: 'orders', label: 'Orders', key: 'O' },
  { mode: 'crew', label: 'Company', key: 'K' },
];

/**
 * Screens bound into the book that have no tab of their own: the Rutter
 * (its pages, to publish or annotate) and the Logbook are reached from the
 * Book's Known and Log pages. They keep the Book's tab lit.
 */
const UNDER_BOOK: GameMode[] = ['rutter', 'logbook'];

export function isBookSection(mode: GameMode): boolean {
  return SECTIONS.some((s) => s.mode === mode) || UNDER_BOOK.includes(mode);
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
        class: `book-tab${s.mode === mode || (s.mode === 'book' && UNDER_BOOK.includes(mode)) ? ' active' : ''}`,
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


// ---------------------------------------------------------------------------
// The knowledge screen
// ---------------------------------------------------------------------------

const KNOWN_SHOWN = 8;
const EMPTY: Record<FactKind, string> = {
  price: 'You hold no price sheets yet. A port you have walked, or a letter, gives one.',
  rumour: 'Nothing you have been told is waiting to be run down. Lie in a port and talk to pilots.',
  chart: 'Nothing has been drawn yet.',
  hazard: 'Nothing has been written about the dangers of the sea.',
  politics: 'Nothing has been written about the peoples you have met.',
};

export type KnowledgeTab = 'life' | 'known' | 'courtesies' | 'log';

const TABS: [KnowledgeTab, string][] = [
  ['life', 'Life'], ['known', 'Known'], ['courtesies', 'Courtesies'], ['log', 'Log'],
];

/**
 * The Captain's Book proper: what the captain has done, what he knows, how he
 * has learned to behave, and the raw log behind all of it.
 *
 *  - Life is the Ledger told as an autobiography, voyage by voyage, in the
 *    plain voice: what was done and, under it in small type, what it did.
 *  - Known is what he holds about the world, every item of it a dated, sourced
 *    Fact (knowledge/information) shown by the one fact card: price sheets,
 *    hearsay, the pages of the rutter, the chart's towns. Never the truth.
 *  - Courtesies is the Book of Courtesies, by people.
 *  - Log is the raw ring buffer, an appendix.
 */
export class KnowledgeView {
  root = el('div', { class: 'screen' });
  private body = el('div', { class: 'screen-body' });
  private tab: KnowledgeTab = 'life';
  private logAll = false;
  private knownAll = new Set<FactKind>();
  private game: Game | null = null;

  constructor(private onClose: () => void, private goTo: (mode: GameMode) => void) {
    this.root.append(
      el('div', { class: 'screen-head' },
        el('h1', {}, 'The captain\u2019s book'),
        el('div', { class: 'sub' }, 'What you have done, what you know, and how you were taught to behave'),
      ),
      this.body,
      el('div', { class: 'screen-foot' }, button('Shut the book  (Esc)', () => this.onClose())),
    );
  }

  open(g: Game, tab?: KnowledgeTab): void {
    this.game = g;
    if (tab) this.tab = tab;
    this.render();
  }

  private render(): void {
    const g = this.game;
    if (!g) return;
    clear(this.body);
    const tabs = el('div', { class: 'tabs' }, ...TABS.map(([t, label]) => el('button', {
      class: this.tab === t ? 'active' : '',
      onclick: () => { this.tab = t; this.render(); },
    }, label)));
    const inner = el('div', { class: 'scroll-narrow' });
    switch (this.tab) {
      case 'life': this.renderLife(inner, g); break;
      case 'known': this.renderKnown(inner, g); break;
      case 'courtesies': this.renderCourtesies(inner, g); break;
      case 'log': this.renderLog(inner, g); break;
    }
    this.body.append(tabs, inner);
  }

  private renderLife(host: HTMLElement, g: Game): void {
    const chapters = life(g.ledger);
    if (chapters.length === 0) {
      host.append(el('p', { class: 'quote' },
        'Nothing is entered yet. The book fills as you keep your word or break it, as you give '
        + 'and take, as men are lost and coasts are claimed, and each entry says what it did.'));
      return;
    }
    host.append(el('p', { class: 'quote' },
      `${g.ledger.length} deeds entered in your name, newest first. Under each, in small type, what it did.`));
    for (const c of chapters) {
      host.append(el('div', { class: 'life-chapter' }, c.title));
      if (c.lines.length === 0) host.append(el('p', { class: 'life-none' }, 'Nothing was entered.'));
      for (const l of c.lines) {
        host.append(el('div', { class: `life-line ${l.tone > 0.25 ? 'for' : l.tone < -0.25 ? 'against' : ''}` },
          el('div', { class: 'life-meta' }, `${l.date}${l.place !== 'sea' ? `  \u00b7  ${l.place}` : '  \u00b7  at sea'}`),
          el('div', { class: 'life-said' }, l.said),
          l.did ? el('div', { class: 'life-did' }, l.did) : null));
      }
    }
  }

  private renderKnown(host: HTMLElement, g: Game): void {
    host.append(el('p', { class: 'quote' },
      'Everything you hold about the world, each with who told you and how old it is. '
      + 'Nothing here says whether it is true: that is settled by going, or by asking a second man. '
      + 'Treat the oldest with the least respect.'));
    if (g.dockedAt) {
      host.append(el('p', { class: 'life-meta' },
        'You lie in port, so the informers will buy a copy of what you know, or say whether they would tell it the same way.'));
    }
    const hooks = { changed: () => this.render(), goTo: this.goTo };
    const groups = byKind(knownFacts(g));
    for (const kind of KIND_ORDER) {
      let facts = groups.get(kind) ?? [];
      if (kind === 'rumour') facts = [...facts.filter((f) => !f.settled), ...facts.filter((f) => f.settled)];
      const all = this.knownAll.has(kind);
      const shown = all ? facts : facts.slice(0, KNOWN_SHOWN);
      const open = kind === 'price' || kind === 'rumour';
      host.append(fold(KIND_TITLE[kind], `${facts.length}`, open,
        facts.length === 0 ? el('p', { class: 'life-none' }, EMPTY[kind]) : null,
        ...shown.map((f) => factCard(g, f, hooks)),
        facts.length > shown.length
          ? button(`Show all ${facts.length}`, () => { this.knownAll.add(kind); this.render(); }, { ghost: true })
          : null));
    }
    host.append(fold('The older pages', '', false,
      el('p', {}, `The Rutter holds ${g.rutter.entries.length} pages; the chart covers ${(g.chart.coverage() * 100).toFixed(1)}% of the route.`),
      el('div', { class: 'foot-actions' },
        button('Open the Rutter', () => this.goTo('rutter')),
        button('The chart', () => this.goTo('chart')))));
  }

  private renderCourtesies(host: HTMLElement, g: Game): void {
    const entries = g.diplomacy.book.entries;
    host.append(el('p', { class: 'quote' },
      'The Book of Courtesies: how to behave among a people, and how you learned it. What you were told '
      + 'or taught can be relied on; what you blundered into is only a warning.'));
    if (entries.length === 0) {
      host.append(el('p', {}, 'Nothing is written here yet. Courts teach it, and so do mistakes.'));
      return;
    }
    const ids = [...new Set(entries.map((e) => e.polity))];
    for (const id of ids) {
      host.append(card(POLITY_BY_ID.get(id)?.name ?? id,
        ...entriesOf(g.diplomacy.book, id).map((e) => el('p', {}, `${e.text} `, el('span', { class: 'life-meta' }, `(${e.how})`)))));
    }
  }

  private renderLog(host: HTMLElement, g: Game): void {
    host.append(el('div', { class: 'log-filter' },
      el('span', {}, 'Show'),
      el('button', { class: this.logAll ? '' : 'active', onclick: () => { this.logAll = false; this.render(); } }, 'Notable'),
      el('button', { class: this.logAll ? 'active' : '', onclick: () => { this.logAll = true; this.render(); } }, 'Everything'),
      button('Traverse, sights and discoveries', () => this.goTo('logbook')),
    ));
    const all = g.log.entries.slice(-600).reverse();
    const shown = (this.logAll ? all : all.filter((e) => e.important)).slice(0, 180);
    if (shown.length === 0) {
      host.append(el('p', { style: { marginTop: '18px' } }, 'Nothing written yet.'));
      return;
    }
    for (const e of shown) {
      host.append(el('div', { class: `life-line ${e.important ? 'against' : ''}` },
        el('div', { class: 'life-meta' }, `${e.date}  \u00b7  ${e.time}`),
        el('div', { class: 'life-said' }, e.text)));
    }
  }
}
