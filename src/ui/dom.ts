export type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(node.style, v);
    } else if (typeof v === 'boolean') {
      if (v) node.setAttribute(k, '');
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function svg(tag: string, attrs: Record<string, unknown> = {}, ...children: Node[]): SVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    node.setAttribute(k, String(v));
  }
  for (const c of children) node.append(c);
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function kv(k: string, v: string | number, cls = ''): HTMLElement {
  return el('div', { class: `kv ${cls}` }, el('span', { class: 'k' }, k), el('span', { class: 'v' }, String(v)));
}

export function hudRow(k: string, v: string): HTMLElement {
  return el('div', { class: 'hud-row' }, el('span', { class: 'k' }, k), el('span', { class: 'v' }, v));
}

export function meter(value: number, cls = ''): HTMLElement {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return el('div', { class: `meter ${cls}` }, el('i', { style: { width: `${pct}%` } }));
}

export function card(title: string, ...children: Child[]): HTMLElement {
  return el('div', { class: 'card' }, title ? el('h3', {}, title) : null, ...children);
}

/** Append children to a node, skipping the nulls that conditional markup produces. */
export function append(host: HTMLElement, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    host.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

export function button(
  label: string, onClick: () => void, opts: { primary?: boolean; disabled?: boolean; ghost?: boolean; title?: string } = {},
): HTMLButtonElement {
  return el('button', {
    class: `${opts.primary ? 'primary' : ''} ${opts.ghost ? 'ghost' : ''}`.trim(),
    disabled: opts.disabled,
    title: opts.title,
    onclick: onClick,
  }, label);
}

/** A full-screen parchment panel with a head, scrolling body and footer. */
export function screen(
  title: string,
  subtitle: string,
  body: Node,
  footer: Node[],
): HTMLElement {
  return el('div', { class: 'screen' },
    el('div', { class: 'screen-head' },
      el('h1', {}, title),
      el('div', { class: 'sub' }, subtitle),
    ),
    el('div', { class: 'screen-body' }, body),
    el('div', { class: 'screen-foot' }, ...footer),
  );
}

export function fmt(n: number, digits = 0): string {
  return n.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function plural(n: number, one: string, many?: string): string {
  return n === 1 ? one : (many ?? `${one}s`);
}
