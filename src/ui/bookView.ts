import type { Game, GameMode } from '../game/state';
import { entriesOf } from '../diplomacy/book';
import { POLITY_BY_ID } from '../diplomacy/polities';
import { sheetAgeWord, sheetConfidence } from '../economy/trade';
import { life } from '../ledger/life';
import { portDef } from '../world/ports';
import { button, card, clear, el, kv } from './dom';

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
 * Screens bound into the book that no longer have a tab of their own: the
 * Rutter and the Logbook are reached from the Book's Known and Log pages
 * until they are absorbed into it (B2). They keep the Book's tab lit.
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
 *  - Known is what he holds about the world: price sheets and hearsay as they
 *    stand today. B2 puts them under one roof as dated, sourced facts; for now
 *    it lists them and sends the reader to the Rutter and the Hearsay page.
 *  - Courtesies is the Book of Courtesies, by people.
 *  - Log is the raw ring buffer, an appendix.
 */
export class KnowledgeView {
  root = el('div', { class: 'screen' });
  private body = el('div', { class: 'screen-body' });
  private tab: KnowledgeTab = 'life';
  private logAll = false;
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
      'What you hold about the world, with how old it is. Treat the oldest with the least respect. '
      + 'This page will bring prices, hearsay and the chart together as dated, sourced facts; '
      + 'for now it lists the two you can act on, and the older pages are one click away.'));

    const now = g.clock.t;
    const sheets = Object.entries(g.trade.sheets)
      .map(([port, sh]) => ({ port, sh, days: Math.max(0, (now - sh.t) / 86400) }))
      .sort((a, b) => a.days - b.days);
    host.append(card('Price sheets',
      sheets.length === 0 ? el('p', {}, 'You hold no price sheets yet. A port you have walked, or a letter, gives one.') : null,
      ...sheets.map(({ port, sh, days }) => {
        let name = port;
        try { name = portDef(port).name; } catch { /* a port the table does not know */ }
        const conf = sheetConfidence(days);
        return kv(name, `${Object.keys(sh.quotes).length} goods \u00b7 ${sheetAgeWord(days)} \u00b7 from ${sh.source === 'seen' ? 'your own eyes' : sh.source === 'letter' ? 'a letter' : 'a broker'} \u00b7 ${Math.round(conf * 100)}% worth believing`,
          conf < 0.4 ? 'bad' : '');
      })));

    const leads = g.openLeads;
    host.append(card('Hearsay',
      leads.length === 0 ? el('p', {}, 'Nothing you have been told is still waiting to be run down.') : null,
      ...leads.map((l) => el('p', {},
        `${l.text} `,
        el('span', { class: 'life-meta' }, `${l.source}, ${sheetAgeWord(Math.max(0, (now - l.heard) / 86400))}, out by perhaps ${Math.round(l.errorNm)} miles`)))));

    host.append(card('The older pages',
      el('p', {}, `The Rutter holds ${g.rutter.entries.length} entries; the chart covers ${(g.chart.coverage() * 100).toFixed(1)}% of the route.`),
      el('div', { class: 'foot-actions' },
        button('Open the Rutter', () => this.goTo('rutter')),
        button('Hearsay and reports, in Orders', () => this.goTo('orders')),
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
