import type { TagDef } from './tags';

/**
 * The Ledger tags the career as a line adds (BUILD_PLAN E2): what an heir is handed, written once at the hand-off by
 * `identity/dynasty.ts`. They are the heir's own entries (not faded memory), so the Book prints them at the head of his Life.
 */
const d = (x: TagDef): TagDef => x;
const B = ['book'];

export const DYNASTY_TAGS = {
  'heir.named': d({
    doc: 'The ship passes to an heir: a named person, his relation to the captain and his age. Written once, on his first day.',
    did: 'You are {target}, of the line. What came down to you is written in the Book.',
    tone: 0, readers: B, silent: true,
  }),
  'heir.received': d({
    doc: 'A patron the father stood well with receives the heir at a first meeting; its favour is the father’s, halved.',
    did: '{target} has agreed to see you, for your father’s sake. It will not do so twice on his account.',
    tone: 0.2, readers: B,
  }),
  'heir.succeeded': d({
    doc: 'A seat in the company passes to a promoted hand, an apprentice, or the child of a man the father freed.',
    did: '{target} has the seat now. He was the old company’s, and he has not been tested as yours.',
    tone: 0.1, readers: B, silent: true,
  }),
  'heir.enemy': d({
    doc: 'A man the father wronged is still against the name. He is the heir’s enemy until he is given a reason not to be.',
    did: '{target} has not forgotten your father, and does not make the difference between you.',
    tone: -0.3, readers: B,
  }),
} as const satisfies Record<string, TagDef>;
