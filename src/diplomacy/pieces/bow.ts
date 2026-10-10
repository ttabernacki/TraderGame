import { rulerName } from '../courts';
import type { Piece } from '../piece';

/**
 * The first piece, small on purpose: how the captain greets the court. It
 * exists to exercise the frame — a choice, a mark, a Book entry, a measure —
 * and stays as the opening of every audience.
 */
interface S { step: 0 | 1 }

export const bow: Piece<S> = {
  id: 'bow',
  title: 'The greeting',
  available: () => true,
  start: () => ({ step: 0 }),
  view: (ctx) => ({
    title: 'The greeting',
    lines: [{ who: 'narrator', text: `The usher waits to see how you will greet ${rulerName(ctx.polity, ctx.g.polityState(ctx.polity.id))}.` }],
    choices: [
      { id: 'bow', label: 'Bow as your own court would', hint: 'Plain, and known.' },
      { id: 'ask', label: 'Ask the usher what is done here' },
      { id: 'stand', label: 'Stand, and let them see a king’s captain' },
    ],
  }),
  step: (_ctx, s, choice) => {
    if (choice === 'ask') {
      return { state: s, outcome: {
        grade: 'win', line: 'The usher is pleased to be asked',
        marks: [{ key: 'greeted', text: 'You asked how to greet them, and they told you.', echo: 'They remember that you asked before you acted.', tone: 0.5 }],
        measures: { trust: 0.03 },
        book: [{ kind: 'custom', tag: 'greeting', text: 'The usher shows how a stranger greets the court.', how: 'told' }],
      } };
    }
    if (choice === 'stand') {
      return { state: s, outcome: {
        grade: 'fail', line: 'A stranger who does not bow is noticed',
        marks: [{ key: 'greeted', text: 'You did not bow.', echo: 'They have not forgotten that you stood.', tone: -0.5 }],
        measures: { respect: 0.02, trust: -0.04 },
        book: [{ kind: 'taboo', tag: 'greeting', text: 'Standing before the throne gave offence.', how: 'blundered' }],
      } };
    }
    return { state: s, outcome: {
      grade: 'half', line: 'Your bow is taken for what it is',
      marks: [{ key: 'greeted', text: 'You bowed in the Portuguese way.', echo: 'They remember a stranger’s bow.', tone: 0 }],
      measures: { trust: 0.01 },
    } };
  },
};
