import type { Game } from '../game/state';
import {
  SaveShelf, exportToFile, importFromFile, decodeSave, wrapCode, encodeJson,
  type SlotView,
} from '../game/save';
import { button, card, clear, el, kv, plural } from './dom';

/**
 * O Livro das Viagens — where the voyages are kept.
 *
 * One screen rather than a save menu, because the three places a voyage can
 * live behave differently and a player has to be able to see which is which.
 * The browser forgets when it is cleared; the account follows him to another
 * machine; a file is his. The screen says so in those words and then gets out
 * of the way.
 *
 * It is reachable from the title screen before there is a game and from the
 * deck while there is one, and does slightly different things in each: with no
 * game there is nothing to write, only voyages to resume or bring in.
 */
export class SavesView {
  root = el('div', { class: 'screen voyages' });

  private list = el('div', { class: 'voyage-list' });
  private notice = el('div', { class: 'voyage-notice' });
  private head = el('div', { class: 'voyage-where' });
  private nameField = el('input', {
    type: 'text', class: 'voyage-name', maxlength: '40',
    placeholder: 'Name this voyage',
  }) as HTMLInputElement;
  private pasteField = el('textarea', {
    class: 'voyage-paste', rows: '3',
    placeholder: 'Paste a voyage code beginning CDI3…',
  }) as HTMLTextAreaElement;

  private game: Game | null = null;
  private busy = false;

  constructor(
    private shelf: SaveShelf,
    private onBack: () => void,
    private onResume: (json: string) => void,
  ) {}

  /** `g` is null when this is opened from the title screen. */
  open(g: Game | null): void {
    this.game = g;
    clear(this.root);
    this.notice.textContent = '';

    const body = el('div', {});
    body.append(this.head, this.notice, this.list);

    if (g) body.append(this.saveCard(g));
    body.append(this.bringInCard());

    this.root.append(
      el('div', { class: 'screen-head' },
        el('h1', {}, 'The Book of Voyages'),
        el('div', { class: 'sub' },
          'Every voyage you have kept, and where it is kept. A voyage in this browser '
          + 'is gone if the browser is cleared; one in your account follows you to any '
          + 'machine you sign in on; one you have saved as a file is yours whatever '
          + 'happens to either.'),
      ),
      el('div', { class: 'screen-body' }, body),
      el('div', { class: 'screen-foot' }, button('Back', this.onBack)),
    );

    this.refresh();
    // The account is asked for in the background: the shelf draws immediately
    // with whatever the browser has, and the account's voyages appear when and
    // if the platform answers. Nothing on this screen waits on a network.
    void this.connect();
  }

  private async connect(): Promise<void> {
    const had = !!this.shelf.cloud;
    const ok = await this.shelf.connect();
    this.drawWhere();
    if (ok && !had) this.refresh();
  }

  private drawWhere(): void {
    clear(this.head);
    const cloud = !!this.shelf.cloud;
    this.head.append(
      el('span', { class: cloud ? 'voyage-dot on' : 'voyage-dot' }),
      el('span', {}, cloud
        ? 'Kept in this browser and in your account.'
        : this.shelf.local
          ? 'Kept in this browser. Your account is not available on this page, so save '
            + 'a file for anything you would be sorry to lose.'
          : 'This browser will not keep a save at all. Use files.'),
    );
  }

  private say(text: string, bad = false): void {
    this.notice.textContent = text;
    this.notice.className = bad ? 'voyage-notice bad' : 'voyage-notice good';
  }

  private async refresh(): Promise<void> {
    const slots = await this.shelf.list();
    clear(this.list);
    if (slots.length === 0) {
      this.list.append(el('p', { class: 'quote' },
        'No voyages kept. The one you are on is written down by itself every few '
        + 'minutes; anything you mean to come back to deserves a name.'));
      return;
    }
    for (const s of slots) this.list.append(this.slotCard(s));
  }

  private slotCard(s: SlotView): HTMLElement {
    const auto = s.id === 'auto';
    const body = el('div', { class: 'voyage-card' },
      el('div', { class: 'voyage-title' },
        el('span', {}, auto ? 'The voyage in hand' : s.name),
        el('span', { class: 'voyage-age' }, `${ago(s.savedAt)} · ${s.kept}`)),
      el('div', { class: 'voyage-facts' },
        kv('Aboard', `${s.date}`),
        kv('Ship', s.ship),
        kv('Position', s.where),
        kv('Rank', s.title),
        kv('Purse', `${s.gold} cruzados`),
        kv('Renown', String(s.standing)),
        kv('Company', s.crew),
        kv('At sea', `${s.years.toFixed(1)} ${plural(Math.round(s.years), 'year')}`)),
      el('div', { class: 'voyage-acts' },
        button('Resume', () => void this.resume(s.id), { primary: true }),
        this.game
          ? button('Save over it', () => void this.write(s.id, s.name), { disabled: auto })
          : null,
        button('Save as a file', () => void this.exportSlot(s)),
        button('Copy the code', () => void this.copySlot(s), { ghost: true }),
        button(this.arming === s.id ? 'Delete — sure?' : 'Delete',
          () => void this.remove(s), { ghost: true })),
    );
    return body;
  }

  /** The card for writing the voyage that is actually being played. */
  private saveCard(g: Game): HTMLElement {
    return card('Keep this voyage',
      el('p', {},
        'The voyage in hand is written down by itself, into this browser, every few '
        + 'minutes and whenever you leave the page. Giving it a name puts it on the '
        + 'shelf above as its own voyage, which the autosave will not overwrite.'),
      el('div', { class: 'voyage-newrow' },
        this.nameField,
        button('Keep it', () => {
          const name = this.nameField.value.trim()
            || `${g.clock.formatDate()}`;
          void this.write(`v${Date.now().toString(36)}`, name);
          this.nameField.value = '';
        }, { primary: true }),
        button('Save as a file', () => void this.exportCurrent(g))),
    );
  }

  private bringInCard(): HTMLElement {
    const file = el('input', {
      type: 'file', accept: '.roteiro,.txt,.json,text/plain', class: 'voyage-file',
    }) as HTMLInputElement;
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (f) void this.importFile(f);
      file.value = '';
    });
    return card('Bring a voyage in',
      el('p', {},
        'A voyage saved as a file, or a code copied from another machine. It is '
        + 'loaded straight away — nothing is written over.'),
      el('div', { class: 'voyage-newrow' }, file),
      this.pasteField,
      el('div', { class: 'voyage-newrow' },
        button('Read the code', () => void this.importCode())),
    );
  }

  // -------------------------------------------------------------------------
  // The acts themselves
  // -------------------------------------------------------------------------

  /** One at a time: a double-click on Delete used to race its own refresh. */
  private async guard<T>(what: () => Promise<T>): Promise<T | null> {
    if (this.busy) return null;
    this.busy = true;
    try { return await what(); } finally { this.busy = false; }
  }

  private async write(id: string, name: string): Promise<void> {
    const g = this.game;
    if (!g) return;
    await this.guard(async () => {
      const r = await this.shelf.write(g, id, name, true);
      this.say(r.message, !r.ok);
      await this.refresh();
    });
  }

  private async resume(id: string): Promise<void> {
    await this.guard(async () => {
      const json = await this.shelf.read(id);
      if (!json) { this.say('That voyage could not be read.', true); return; }
      try {
        this.onResume(json);
      } catch {
        this.say('That voyage could not be read. It may have been written by a '
          + 'much older version of the game.', true);
      }
    });
  }

  /** Armed by the first press of Delete, so the second one means it. */
  private arming: string | null = null;

  private async remove(s: SlotView): Promise<void> {
    // Two presses, because there is no undo and a voyage is a great many hours.
    if (this.arming !== s.id) {
      this.arming = s.id;
      this.say(`Press Delete again to lose ${s.id === 'auto' ? 'the autosave' : s.name} `
        + 'for good. There is no getting it back.', true);
      await this.refresh();
      return;
    }
    this.arming = null;
    await this.guard(async () => {
      await this.shelf.remove(s.id);
      this.say(`${s.id === 'auto' ? 'The autosave' : s.name} is gone.`);
      await this.refresh();
    });
  }

  private async exportCurrent(g: Game): Promise<void> {
    await this.guard(async () => {
      try {
        this.say(await exportToFile(g, this.nameField.value.trim() || 'carreira'));
      } catch (e: any) {
        this.say(e?.message ?? 'Could not write the file.', true);
      }
    });
  }

  private async exportSlot(s: SlotView): Promise<void> {
    await this.guard(async () => {
      const json = await this.shelf.read(s.id);
      if (!json) { this.say('That voyage could not be read.', true); return; }
      // Straight from the stored payload rather than through a live Game, so a
      // voyage can be taken out as a file without being loaded first.
      const code = wrapCode(await encodeJson(json));
      download(code, `${s.name.replace(/[^\w -]/g, '') || 'voyage'}.roteiro`);
      this.say('Saved as a file.');
    });
  }

  private async copySlot(s: SlotView): Promise<void> {
    await this.guard(async () => {
      const json = await this.shelf.read(s.id);
      if (!json) { this.say('That voyage could not be read.', true); return; }
      const code = wrapCode(await encodeJson(json));
      try {
        await navigator.clipboard.writeText(code);
        this.say(`Copied — ${(code.length / 1024).toFixed(0)} kB of it. Paste it into `
          + 'the box below on another machine.');
      } catch {
        // Clipboard access is refused in plenty of contexts. Put the code where
        // it can be selected by hand instead of saying nothing.
        this.pasteField.value = code;
        this.pasteField.select();
        this.say('The clipboard was refused. The code is in the box below — copy it '
          + 'from there.', true);
      }
    });
  }

  private async importFile(f: File): Promise<void> {
    await this.guard(async () => {
      try {
        this.onResume(await importFromFile(f));
      } catch (e: any) {
        this.say(e?.message ?? 'That file is not a voyage.', true);
      }
    });
  }

  private async importCode(): Promise<void> {
    await this.guard(async () => {
      const code = this.pasteField.value.trim();
      if (!code) { this.say('Nothing pasted.', true); return; }
      try {
        this.onResume(await decodeSave(code));
      } catch (e: any) {
        this.say(e?.message ?? 'That is not a voyage.', true);
      }
    });
  }
}

function download(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** "four minutes ago", which is what a player actually wants to know. */
function ago(t: number): string {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return 'just now';
  const m = s / 60;
  if (m < 60) return `${Math.round(m)} minutes ago`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)} ${plural(Math.round(h), 'hour')} ago`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)} ${plural(Math.round(d), 'day')} ago`;
  return new Date(t).toLocaleDateString();
}
