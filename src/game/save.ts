import { Game } from './state';
import { hullClass } from '../ship/hull';
import { portsNear } from '../world/ports';
import { titleFor } from '../progression/crown';
import { formatLat, formatLon } from '../core/math';

/**
 * Keeping a voyage.
 *
 * A published artifact is a single page on somebody else's origin, and it gets
 * republished under the player's feet every time the game is changed. That
 * shapes everything here:
 *
 * - The page's own storage survives a republish but lives in one browser. It is
 *   the right place for the continuous autosave, because it is synchronous and
 *   always there, and the wrong place to leave a year's voyage for ever.
 * - The artifact's document store, where the viewer's account can reach it,
 *   follows the player between machines — but it is granted per view, can be
 *   absent, and caps a document at 256 KiB.
 * - A file on the player's own disk outlives both, and is the only copy nobody
 *   else can take away.
 *
 * So all three, in that order of convenience and the reverse order of
 * durability, over one save format. The rule the whole module is built on is
 * that no single store is trusted: whatever is missing, the game still runs and
 * still saves somewhere.
 *
 * The 256 KiB ceiling is also why `Chart.serialize` stopped writing the
 * inherited chart and why the numbers are rounded on the way out. A save was a
 * hundred and fifty-four kilobytes before a mile had been sailed; it is four,
 * and a fifty-year career is twenty-six.
 */

/** Bumped only when a save written by an older build cannot be read at all. */
export const SAVE_FORMAT = 3;

/** Magic at the front of an exported code, so a wrong paste is caught early. */
const MAGIC = 'CDI3:';

export interface SaveMeta {
  /** Slot key. `auto` is the continuous one; the rest are the player's. */
  id: string;
  /** What the player called it, or what the game called it for him. */
  name: string;
  /** Real-world milliseconds, for "saved 3 minutes ago". */
  savedAt: number;
  format: number;
  /** Everything below is for the card in the book, so a slot can be read
   *  without decompressing the save behind it. */
  date: string;
  ship: string;
  where: string;
  title: string;
  gold: number;
  standing: number;
  crew: string;
  years: number;
  /** Bytes of the stored payload, for the storage meter. */
  bytes: number;
}

// ---------------------------------------------------------------------------
// The format
// ---------------------------------------------------------------------------

/**
 * Compress with the platform's own gzip, where there is one.
 *
 * `CompressionStream` is in every browser that can run the rest of this game,
 * but it is absent in a few privacy configurations and in older webviews, and
 * the cost of getting that wrong is the player's voyage. So the format carries
 * a flag: `z` for gzipped, `p` for plain. A reader handles both whatever it can
 * itself do, so a save written on one machine loads on the other.
 */
async function deflate(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const CS = (globalThis as any).CompressionStream;
  if (!CS) return `p${toBase64(bytes)}`;
  try {
    return `z${toBase64(await pump(new CS('gzip'), bytes))}`;
  } catch {
    return `p${toBase64(bytes)}`;
  }
}

async function inflate(payload: string): Promise<string> {
  const kind = payload[0];
  const bytes = fromBase64(payload.slice(1));
  if (kind === 'p') return new TextDecoder().decode(bytes);
  const DS = (globalThis as any).DecompressionStream;
  if (!DS) throw new Error('This browser cannot read a compressed save.');
  return new TextDecoder().decode(await pump(new DS('gzip'), bytes));
}

/**
 * Push bytes through a compression stream by hand, rather than through a Blob
 * and a Response.
 *
 * The obvious spelling — `new Blob([bytes]).stream().pipeThrough(cs)`, then
 * `new Response(stream).arrayBuffer()` — is three hops that each resolve on a
 * *macrotask*. That is free on an idle page and is not free here: this game
 * runs a render loop every frame, and measured inside it a bare
 * `setTimeout(…, 0)` took 548 ms to come back. So a save that compresses in
 * under a millisecond of actual work was taking 1.6 seconds of wall clock, and
 * every one of those seconds was a second in which the voyage was not yet
 * written down.
 *
 * Driving the writer and the reader directly keeps the whole thing on
 * microtasks, which the render loop does not starve. Same bytes out, measured
 * at 0 ms against 1624.
 */
async function pump(stream: any, bytes: Uint8Array): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Not awaited before the read loop — `write` resolves on the stream's own
  // backpressure and awaiting it first deadlocks a transform stream — but the
  // promise must still be handled. Left bare, a corrupt payload rejects the
  // writer as well as the reader, and while the reader's rejection is caught
  // below, the writer's became an unhandled rejection: a warning in a browser,
  // and enough to kill the process outright in Node.
  const writing = writer.write(bytes).then(() => writer.close()).catch(() => {});
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await writing;
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/**
 * Base64 in chunks.
 *
 * `String.fromCharCode(...bytes)` on a twenty-thousand-byte array throws
 * `RangeError: too many arguments` in every engine, and a long career is far
 * past that — so the spread has to be fed in pieces. It is the sort of thing
 * that works for the first hour of play and fails on the save that matters.
 */
function toBase64(bytes: Uint8Array): string {
  let s = '';
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    s += String.fromCharCode(...bytes.subarray(i, i + STEP));
  }
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64.trim());
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** The whole voyage as one string, for a slot, a file, or the clipboard. */
export async function encodeSave(g: Game): Promise<string> {
  return deflate(g.serialize());
}

/** The same, for a payload already in hand — a slot taken out without loading it. */
export async function encodeJson(json: string): Promise<string> {
  return deflate(json);
}

/** And back. Throws with something sayable if it is not a save at all. */
export async function decodeSave(code: string): Promise<string> {
  let body = code.trim();
  if (body.startsWith(MAGIC)) body = body.slice(MAGIC.length);
  // A pasted code picks up line breaks from wherever it has been.
  body = body.replace(/\s+/g, '');
  if (!body || !'zp'.includes(body[0])) {
    // An exported file or an older save may be plain JSON.
    if (body.startsWith('{')) return code.trim();
    throw new Error('That is not a voyage. Paste the whole code, beginning CDI3.');
  }
  // Everything below here fails in the platform's words — a `DOMException` from
  // the gunzip, an `InvalidCharacterError` from `atob`, a `SyntaxError` from the
  // parse — and none of those is a sentence to put in front of somebody who has
  // just pasted the wrong thing. They all mean one thing to the player.
  let json: string;
  try {
    json = await inflate(body);
    JSON.parse(json);   // fail here, with the payload in hand, rather than later
  } catch {
    throw new Error('That voyage is damaged, or is only part of a code. Paste the '
      + 'whole of it, or use the file.');
  }
  return json;
}

/** What the exported file and the clipboard carry. */
export function wrapCode(payload: string): string {
  return MAGIC + payload;
}

// ---------------------------------------------------------------------------
// What a slot says about itself
// ---------------------------------------------------------------------------

/**
 * The card in the book.
 *
 * Written when the save is written, and stored beside it rather than inside
 * it, so the list of voyages can be drawn without decompressing and parsing
 * every one of them — which on a page that is also running a 3-D ocean is the
 * difference between the book opening and the book stuttering.
 */
export function describeSave(g: Game, id: string, name: string, bytes: number): SaveMeta {
  const near = portsNear(g.ship.state.pos, 30)[0];
  const where = g.portHere
    ? `At ${g.portHere.name}`
    : near
      ? `${near.distNm.toFixed(0)} miles off ${near.def.name}`
      : `${formatLat(g.nav.estimated.lat)}, ${formatLon(g.nav.estimated.lon)}`;
  const start = new Game(1).clock.t;
  return {
    id,
    name,
    savedAt: Date.now(),
    format: SAVE_FORMAT,
    date: g.clock.formatDate(),
    ship: hullClass(g.ship.hull.id)?.name ?? g.ship.hull.id,
    where,
    title: titleFor(g.crown.standing).english,
    gold: Math.round(g.crown.gold),
    standing: Math.round(g.crown.standing),
    crew: `${g.crew.count}/${g.crew.complement}`,
    years: Math.max(0, (g.clock.t - start) / (86400 * 365)),
    bytes,
  };
}

// ---------------------------------------------------------------------------
// Where a voyage is kept
// ---------------------------------------------------------------------------

export interface SaveStore {
  readonly kind: 'local' | 'cloud';
  /** Human name for the storage meter. */
  readonly label: string;
  list(): Promise<SaveMeta[]>;
  read(id: string): Promise<string | null>;
  write(id: string, meta: SaveMeta, data: string): Promise<void>;
  remove(id: string): Promise<void>;
}

const LOCAL_PREFIX = 'carreira.save.';
const LOCAL_INDEX = 'carreira.saves';

/**
 * The browser's own storage.
 *
 * Every access is wrapped, because reading `localStorage` does not merely
 * return nothing in a locked-down browser — it throws on the property access
 * itself, and an unguarded read took the title screen down before anything was
 * drawn. A store that cannot store is not an error here; it is a store that
 * lists nothing, and the game goes on without it.
 */
export class LocalStore implements SaveStore {
  readonly kind = 'local' as const;
  readonly label = 'this browser';

  static available(): boolean {
    try {
      localStorage.setItem('carreira.probe', '1');
      localStorage.removeItem('carreira.probe');
      return true;
    } catch {
      return false;
    }
  }

  async list(): Promise<SaveMeta[]> {
    try {
      const raw = localStorage.getItem(LOCAL_INDEX);
      const all: SaveMeta[] = raw ? JSON.parse(raw) : [];
      // Only report a slot whose payload is actually still there: a browser
      // clearing site data can take the save and leave the index.
      return all.filter((m) => localStorage.getItem(LOCAL_PREFIX + m.id) !== null);
    } catch {
      return [];
    }
  }

  async read(id: string): Promise<string | null> {
    try {
      const payload = localStorage.getItem(LOCAL_PREFIX + id);
      return payload === null ? null : decodeSave(payload);
    } catch {
      return null;
    }
  }

  async write(id: string, meta: SaveMeta, data: string): Promise<void> {
    try {
      localStorage.setItem(LOCAL_PREFIX + id, data);
    } catch (e) {
      // Out of room. Say which, because "could not save" with no reason is the
      // worst message a save system can give.
      throw new Error(
        'There is no more room in this browser for another voyage. Delete one, '
        + 'or keep it as a file instead.',
      );
    }
    const index = (await this.list()).filter((m) => m.id !== id);
    index.push(meta);
    try {
      localStorage.setItem(LOCAL_INDEX, JSON.stringify(index));
    } catch {
      localStorage.removeItem(LOCAL_PREFIX + id);
      throw new Error('There is no more room in this browser for another voyage.');
    }
  }

  async remove(id: string): Promise<void> {
    try {
      localStorage.removeItem(LOCAL_PREFIX + id);
      const index = (await this.list()).filter((m) => m.id !== id);
      localStorage.setItem(LOCAL_INDEX, JSON.stringify(index));
    } catch { /* nothing to remove it from */ }
  }
}

/**
 * The artifact's own document store, under the viewer's private subtree.
 *
 * This is the one that makes a voyage follow the player from the desk to the
 * sofa, which is the whole reason for wanting more than the browser. Three
 * things about it decide the shape of the code:
 *
 * The capability is granted per view and may simply not be there — a page
 * opened by a link, an account without it, a runtime that never answers. So
 * `attach` resolves to null and every caller is written for a game with no
 * cloud at all.
 *
 * A document is capped at 256 KiB, which a save now fits inside with room to
 * spare, but the cap is real and the failure is reported rather than swallowed.
 *
 * And writes are one-at-a-time per document and are not free, so the cloud is
 * written on a deliberate act — a manual save, a port, a new voyage — and never
 * from the autosave timer, which would be a write every half minute for ever.
 */
export class CloudStore implements SaveStore {
  readonly kind = 'cloud' as const;
  readonly label = 'your account';

  private constructor(private db: any, private uid: string) {}

  /** Null whenever this view cannot do it, which is not an error. */
  static async attach(): Promise<CloudStore | null> {
    const claude = (globalThis as any).claude;
    if (!claude?.use) return null;
    try {
      const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
      if (!db || !user) return null;
      const uid = await user.id();
      if (!uid) return null;
      return new CloudStore(db, uid);
    } catch {
      return null;
    }
  }

  /** One document per voyage, under this viewer's own path. */
  private ref(id: string) {
    return this.db.doc(`data/users/${this.uid}/voyages`).collection('slots').doc(id);
  }

  async list(): Promise<SaveMeta[]> {
    try {
      const snap = await this.db.doc(`data/users/${this.uid}/voyages`)
        .collection('slots').get();
      return snap.docs
        .map((d: any) => d.data()?.meta)
        .filter((m: any): m is SaveMeta => !!m && typeof m.id === 'string');
    } catch {
      return [];
    }
  }

  async read(id: string): Promise<string | null> {
    try {
      const snap = await this.ref(id).get();
      if (!snap.exists) return null;
      const data = snap.data()?.data;
      return typeof data === 'string' ? decodeSave(data) : null;
    } catch {
      return null;
    }
  }

  async write(id: string, meta: SaveMeta, data: string): Promise<void> {
    // Well inside the platform's 256 KiB, and refused here with something
    // sayable rather than as an `invalid_argument` from underneath.
    if (data.length > 240 * 1024) {
      throw new Error('This voyage is too long to keep in your account. Keep it as a file.');
    }
    try {
      await this.ref(id).set({ meta, data });
    } catch (e: any) {
      throw new Error(cloudReason(e));
    }
  }

  async remove(id: string): Promise<void> {
    try { await this.ref(id).delete(); } catch { /* it is gone either way */ }
  }
}

/** The platform's codes, in words a player can act on. */
function cloudReason(e: any): string {
  switch (e?.code) {
    case 'quota_exceeded':
      return 'Your account has no room for another voyage. Delete one first.';
    case 'resource_exhausted':
      return 'Too many saves at once. Wait a moment and try again.';
    case 'invalid_argument':
      return 'Your account would not take this voyage. Keep it as a file instead.';
    case 'not_granted':
    case 'capability_disabled':
    case 'capability_removed':
    case 'revoked':
      return 'This page cannot reach your account. The voyage is kept in this browser.';
    default:
      return 'Could not reach your account. The voyage is kept in this browser.';
  }
}

// ---------------------------------------------------------------------------
// Both at once
// ---------------------------------------------------------------------------

export interface SlotView extends SaveMeta {
  /**
   * Which store holds it — not to be confused with `where`, which this
   * inherits from the metadata and which is the ship's position.
   */
  kept: string;
  inLocal: boolean;
  inCloud: boolean;
}

/**
 * The book of voyages: the browser and the account presented as one shelf.
 *
 * A slot is the same voyage whether it is in one store or both, so the list is
 * merged on the slot id and the newer of the two metadata records wins. That
 * means a player who saves on the desk and opens the page on the sofa sees one
 * voyage and not two, and loading it takes whichever copy is newer.
 */
export class SaveShelf {
  local: LocalStore | null;
  cloud: CloudStore | null = null;

  constructor() {
    this.local = LocalStore.available() ? new LocalStore() : null;
  }

  /** Try for the account. Safe to call again; safe never to call at all. */
  async connect(): Promise<boolean> {
    if (this.cloud) return true;
    this.cloud = await CloudStore.attach();
    return !!this.cloud;
  }

  async list(): Promise<SlotView[]> {
    const [localList, cloudList] = await Promise.all([
      this.local?.list() ?? [],
      this.cloud?.list() ?? [],
    ]);
    const byId = new Map<string, SlotView>();
    for (const m of localList) {
      byId.set(m.id, { ...m, kept: 'this browser', inLocal: true, inCloud: false });
    }
    for (const m of cloudList) {
      const had = byId.get(m.id);
      if (!had) {
        byId.set(m.id, { ...m, kept: 'your account', inLocal: false, inCloud: true });
        continue;
      }
      // The newer record describes the voyage; both places still hold it.
      const newer = m.savedAt > had.savedAt ? m : had;
      byId.set(m.id, { ...newer, kept: 'browser and account', inLocal: true, inCloud: true });
    }
    return [...byId.values()].sort((a, b) => b.savedAt - a.savedAt);
  }

  /** The newer of the two copies, or whichever one exists. */
  async read(id: string): Promise<string | null> {
    const slots = await this.list();
    const slot = slots.find((s) => s.id === id);
    if (!slot) return null;
    if (slot.inCloud && !slot.inLocal) return this.cloud!.read(id);
    if (slot.inLocal && !slot.inCloud) return this.local!.read(id);
    const [a, b] = await Promise.all([this.local!.list(), this.cloud!.list()]);
    const lm = a.find((m) => m.id === id);
    const cm = b.find((m) => m.id === id);
    const preferCloud = (cm?.savedAt ?? 0) > (lm?.savedAt ?? 0);
    return (preferCloud ? this.cloud!.read(id) : this.local!.read(id))
      ?? (preferCloud ? this.local!.read(id) : this.cloud!.read(id));
  }

  /**
   * Write a voyage.
   *
   * The browser first and always, because it is synchronous and cannot be
   * waiting on a network when the player closes the tab. The account after it,
   * when there is one and the caller asked for it — a failure there is reported
   * and is not a failed save, because the voyage is already down.
   */
  async write(g: Game, id: string, name: string, toCloud: boolean):
  Promise<{ ok: boolean; cloud: boolean; message: string }> {
    const data = await encodeSave(g);
    const meta = describeSave(g, id, name, data.length);
    let localOk = false;
    let message = '';
    if (this.local) {
      try { await this.local.write(id, meta, data); localOk = true; } catch (e: any) {
        message = e?.message ?? 'Could not write to this browser.';
      }
    } else {
      message = 'This browser will not keep a save. Keep the voyage as a file.';
    }
    let cloudOk = false;
    if (toCloud && this.cloud) {
      try { await this.cloud.write(id, meta, data); cloudOk = true; } catch (e: any) {
        message = message || e?.message || 'Could not reach your account.';
      }
    }
    if (!localOk && !cloudOk) return { ok: false, cloud: false, message };
    return {
      ok: true,
      cloud: cloudOk,
      message: message
        || (cloudOk ? 'The voyage is recorded, here and in your account.'
          : 'The voyage is recorded in this browser.'),
    };
  }

  async remove(id: string): Promise<void> {
    await Promise.all([this.local?.remove(id), this.cloud?.remove(id)]);
  }

  /** Bytes held in the browser, for the meter on the screen. */
  async localBytes(): Promise<number> {
    const list = (await this.local?.list()) ?? [];
    return list.reduce((s, m) => s + m.bytes, 0);
  }
}

// ---------------------------------------------------------------------------
// A file on the player's own disk
// ---------------------------------------------------------------------------

/**
 * Offer the voyage as a file.
 *
 * Through the page's own download capability where the viewer has granted one,
 * and otherwise through an object URL, which works anywhere and is what makes
 * this the copy nobody can take away — not the browser clearing its storage,
 * not the account, not a republished page.
 */
export async function exportToFile(g: Game, name: string): Promise<string> {
  const code = wrapCode(await encodeSave(g));
  const filename = `${safeName(name)}.roteiro`;
  const claude = (globalThis as any).claude;
  if (claude?.use) {
    try {
      const downloads = await claude.use('downloads');
      if (downloads) {
        await downloads.save({ filename, data: code });
        return `${filename} — the voyage is yours to keep.`;
      }
    } catch { /* fall through to the ordinary way */ }
  }
  const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return `${filename} — the voyage is yours to keep.`;
}

function safeName(name: string): string {
  const s = name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '-');
  return s || 'voyage';
}

/** Read a voyage back off a file the player has chosen. */
export async function importFromFile(file: File): Promise<string> {
  const text = await file.text();
  return decodeSave(text);
}
