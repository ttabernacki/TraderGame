import type { Rng } from '../../core/rng';
import { MONTH, addEffect, hasActive } from './core';
import { declareReader } from './modifiers';
import { announce } from './rumours';
import type { PowersState } from './types';

/**
 * The Gold (Mina): the one Front besides the Traffic that ticks in this build. Its clock is the strain on
 * the Castle: fever, thin supply, the Akan's patience. At stage 2 and above the coast gets fever seasons,
 * which are an event like any other: an effect on the beach, and a rumour that goes down the road.
 */

declareReader('moves.gold');

export function goldTick(st: PowersState, t: number, rng: Rng): void {
  const stage = st.fronts.gold.stage;
  if (stage < 2 || hasActive(st, 'akan', 'stub', t)) return;
  if (!rng.chance(0.03 * (stage - 1))) return;
  const dur = Math.round(rng.range(3, 5));
  const e = addEffect(st, {
    kind: 'stub', power: 'akan', ports: ['mina'], start: t, end: t + dur * MONTH, stock: { ouro: 0.9 }, blight: 0.02,
    reason: 'Fever is in the Castle at Mina, and the garrison is burying men every week; fewer ships are loading.',
  });
  announce(st, rng, t, {
    event: `effect:${e.id}`, place: 'mina', power: 'akan', front: 'gold', window: dur + 2,
    truth: { claim: 'Fever is in the Castle at Mina, and the garrison is burying men every week.', vague: 'There is sickness at Mina.' },
    stale: { claim: 'The Castle at Mina is healthy, and the factor is buying gold at the usual price.', vague: 'Mina is well.' },
    falsehood: { claim: 'The Akan have taken the Castle at Mina.', vague: 'There is fighting at Mina.' },
  });
}
