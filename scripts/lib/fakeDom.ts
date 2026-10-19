/**
 * A very small DOM, just enough for the port screen's views to run in node (no browser, no jsdom).
 *
 * It implements what `ui/dom.ts` and the quarters use: elements and text nodes, `append`, `attributes`, `style`,
 * `className`, `children`, `querySelector(All)` for `tag`, `.class`, `[attr]` and `:scope > tag`, `remove`,
 * `addEventListener` and `click()`. That is all the falsifier needs to render every quarter of every port and to find
 * a verb by its `data-verb` attribute.
 */

export class FakeNode {
  parent: FakeEl | null = null;
  constructor(public text = '') {}
  get textContent(): string { return this.text; }
}

export class FakeEl extends FakeNode {
  children: FakeNode[] = [];
  attrs: Record<string, string> = {};
  style: Record<string, string> = {};
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  className = '';
  open = false;
  disabled = false;
  value = '';
  constructor(public tagName: string) { super(''); }

  get childNodes(): FakeNode[] { return this.children; }
  get firstChild(): FakeNode | null { return this.children[0] ?? null; }
  get lastElementChild(): FakeEl | null {
    for (let i = this.children.length - 1; i >= 0; i--) if (this.children[i] instanceof FakeEl) return this.children[i] as FakeEl;
    return null;
  }
  get textContent(): string { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v: string) { this.children = []; if (v) this.append(new FakeNode(v)); }
  set innerHTML(v: string) { this.children = []; if (v) this.append(new FakeNode(v)); }

  append(...nodes: (FakeNode | string)[]): void {
    for (const n of nodes) {
      const node = typeof n === 'string' ? new FakeNode(n) : n;
      if (node.parent) node.parent.removeChild(node);
      node.parent = this;
      this.children.push(node);
    }
  }
  appendChild(n: FakeNode): FakeNode { this.append(n); return n; }
  removeChild(n: FakeNode): FakeNode {
    const i = this.children.indexOf(n);
    if (i >= 0) this.children.splice(i, 1);
    n.parent = null;
    return n;
  }
  remove(): void { this.parent?.removeChild(this); }
  setAttribute(k: string, v: string): void { this.attrs[k] = v; if (k === 'class') this.className = v; if (k === 'disabled') this.disabled = true; }
  getAttribute(k: string): string | null { return k === 'class' ? this.className || null : this.attrs[k] ?? null; }
  addEventListener(type: string, fn: (e: unknown) => void): void { (this.listeners[type] ??= []).push(fn); }
  click(): void { for (const f of this.listeners.click ?? []) f({}); }

  classes(): string[] { return this.className.split(/\s+/).filter(Boolean); }

  private matches(sel: string): boolean {
    const m = /^([a-z0-9]*)((?:\.[\w-]+)*)(?:\[([\w-]+)(?:="([^"]*)")?\])?$/i.exec(sel.trim());
    if (!m) return false;
    const [, tag, cls, attr, val] = m;
    if (tag && tag.toLowerCase() !== this.tagName.toLowerCase()) return false;
    for (const c of cls.split('.').filter(Boolean)) if (!this.classes().includes(c)) return false;
    if (attr) {
      const v = this.getAttribute(attr);
      if (v === null || (val !== undefined && v !== val)) return false;
    }
    return true;
  }

  querySelectorAll(sel: string): FakeEl[] {
    const out: FakeEl[] = [];
    const scoped = /^:scope\s*>\s*(.+)$/.exec(sel);
    if (scoped) {
      for (const c of this.children) if (c instanceof FakeEl && c.matches(scoped[1])) out.push(c);
      return out;
    }
    const walk = (n: FakeEl) => {
      for (const c of n.children) {
        if (!(c instanceof FakeEl)) continue;
        if (c.matches(sel)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel: string): FakeEl | null { return this.querySelectorAll(sel)[0] ?? null; }
}

/** Install `document` (and the few globals the views touch) on globalThis. Idempotent. */
export function installFakeDom(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = {
    createElement: (tag: string) => new FakeEl(tag),
    createElementNS: (_ns: string, tag: string) => new FakeEl(tag),
    createTextNode: (t: string) => new FakeNode(t),
  };
}

/** Every element under `root` that carries a `data-verb`. */
export function verbsIn(root: FakeEl): string[] {
  return root.querySelectorAll('[data-verb]').map((e) => e.getAttribute('data-verb')!);
}
