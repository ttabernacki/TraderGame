import type { TagDef } from './tags';

/**
 * The Ledger tags strangers-as-people add (BUILD_PLAN D7).
 *
 * A master met at sea is remembered by the Ledger and by nothing else: an entry that was done to him (or to his
 * passenger, or his cargo) carries `data.master`, his roster id (`game/strangers.ts`), and that is how he is
 * the same man the next time. Everything done to a stranger still uses the ordinary `ship.*`, `pass.*`,
 * `courtesy.*` and `gift.*` tags; these four are the only new words.
 */
const d = (x: TagDef): TagDef => x;

export const STRANGER_TAGS = {
  'master.met': d({
    doc: 'Spoke a named master at sea. Carries `data.master` (his roster id); the Ledger is how he is met again.',
    did: 'The master of that sail is in the Book by name.',
    tone: 0, readers: ['book'], silent: true,
  }),
  'passenger.delayed': d({
    doc: 'Held a ship with someone’s errand aboard (an envoy, a pilgrim, a factor’s wife, a prince’s gift). Magnitude is how much the errand mattered.',
    did: 'Somebody’s errand was a day or three late because of you, and {target} will be told whose fault it was.',
    tone: -0.4, readers: ['book'],
  }),
  'passenger.aided': d({
    doc: 'Helped a passenger met at sea on his errand: carried his letter, put him on his road, or let his gift through untouched.',
    did: '{target} will hear that the errand was helped on its way.',
    tone: 0.5, readers: ['book'],
  }),
  'toll.taken': d({
    doc: 'Let a master pass for a toll in coin or cargo: the first thing the Rule looks like from the other ship.',
    did: '{target} will hear that the ship takes a toll, and from whom.',
    tone: -0.35, readers: ['book'],
  }),
};
