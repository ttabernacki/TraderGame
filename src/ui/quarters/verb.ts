/** Mark a rendered card as a verb of the Quarters, so the headless falsifier can find it by id in the DOM. */
export function verb<T extends HTMLElement>(id: string, node: T): T {
  node.setAttribute('data-verb', id);
  return node;
}

/** Mark the node a section has just appended. */
export function tagLast(host: HTMLElement, id: string): void {
  const c = host.lastElementChild;
  if (c) c.setAttribute('data-verb', id);
}
