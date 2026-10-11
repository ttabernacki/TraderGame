import { IS_XIYANG } from '../campaigns/active';

/**
 * The words of the Ming campaign for what the game's screens call things in
 * the Carreira: the purse, the renown, the captain's rank. Applied to the text
 * the screens write, once, as they write it, so no screen has to know there is
 * more than one story.
 */
const WORDS: [RegExp, string][] = [
  [/\bcruzados\b/g, 'taels'],
  [/\bCruzados\b/g, 'Taels'],
  [/\brenown\b/g, 'favour'],
  [/\bRenown\b/g, 'Favour'],
  [/\bEscudeiro\b/g, 'Captain'],
  [/\bPortuguese factory\b/g, 'Ming station'],
  [/\bA padr\u00e3o of yours\b/g, 'A stele of yours'],
  [/\bpadr\u00f5es\b/g, 'steles'],
  [/\bpadr\u00e3o\b/g, 'stele'],
  [/The Casa\u2019s word/g, 'The pilots\u2019 word'],
];

function skinNode(n: Node): void {
  if (n.nodeType === Node.TEXT_NODE) {
    const t = n.nodeValue ?? '';
    let out = t;
    for (const [re, to] of WORDS) out = out.replace(re, to);
    if (out !== t) n.nodeValue = out;
    return;
  }
  if (n.nodeType !== Node.ELEMENT_NODE) return;
  const tag = (n as Element).tagName;
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'INPUT' || tag === 'TEXTAREA') return;
  for (const c of Array.from(n.childNodes)) skinNode(c);
}

/** Keep a root skinned as its text changes. A no-op in the Carreira. */
export function skin(root: HTMLElement): void {
  if (!IS_XIYANG || typeof MutationObserver === 'undefined') return;
  skinNode(root);
  let busy = false;
  new MutationObserver((records) => {
    if (busy) return;
    busy = true;
    for (const r of records) {
      for (const a of Array.from(r.addedNodes)) skinNode(a);
      if (r.type === 'characterData') skinNode(r.target);
    }
    busy = false;
  }).observe(root, { childList: true, subtree: true, characterData: true });
}
