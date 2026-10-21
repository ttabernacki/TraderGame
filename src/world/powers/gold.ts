import { MONTH, hasActive } from './core';
import { declareReader } from './modifiers';
import { att, launch, months, oneOf, stageOf, type Ctx } from './moves';
import type { PowersState } from './types';

/**
 * The Gold (Mina), staged (BUILD_PLAN E3). Its clock is the strain on the Castle: fever, thin supply, the Akan's patience.
 *
 *   stage 1  the Castle and the beach: nothing out of the ordinary.
 *   stage 2  the fort strained: fever seasons on the coast, a garrison short of men and of goods the beach wants.
 *   stage 3  a hard coast: the beach can turn on the Castle (a revolt shuts Axim and Acara, and Mina lets ships in at a toll).
 *   stage 4  the beach is shut: the Akan stop selling to the Castle on its terms, and the Castle lives on what it is sent.
 *
 * Each of these is an event like any other: an Effect on the beach (what `marketModifiers` reads), a line in the Book
 * and a rumour that goes down the road. The two ends of the coast are tied by the stage's own effects (data.ts): what
 * does not come down to Mina is dearer at Lisbon. The fever is also read by the crew's sickness at the Gold Coast
 * (`goldFever`, below), which is the hook that makes a fever season a danger to the ship's company and not only a price.
 *
 * Sources and what is invented: docs/SOURCES.md, "The Fronts staged (E3)". High mortality at São Jorge is documented; the
 * seasons, the revolts, the chances and the numbers are the game's own.
 */

declareReader('moves.gold');
declareReader('moves.fever');

export const GOLD_COAST = ['mina', 'axim', 'acara'];

/** Extra sickness pressure a ship's company feels while it lies on the Gold Coast: a little at stage 2 and above, more in a fever season. */
export function goldFever(st: PowersState | undefined | null, port: string | null, t: number): number {
  if (!st || !port || !GOLD_COAST.includes(port)) return 0;
  const stage = st.fronts.gold.stage;
  const until = st.powers.akan.flags.feverUntil;
  const season = typeof until === 'number' && t < until ? 0.012 : 0;
  return (stage >= 2 ? 0.002 * (stage - 1) : 0) + season;
}

export function goldTick(c: Ctx): void {
  const { st, t } = c;
  const stage = stageOf(c, 'gold');
  const akan = st.powers.akan;
  const a = att(c, 'akan');
  const quiet = (kind: 'stub' | 'war' | 'embargo' | 'welcome'): boolean => !hasActive(st, 'akan', kind, t);
  const noWar = quiet('war') && quiet('embargo');
  const fx = (p: number): number => (stage >= 2 ? p * (stage - 1) : 0);

  if (t >= akan.intentUntil) {
    akan.intentUntil = t + 24 * MONTH;
    akan.intent = stage >= 4 ? 'Hold the beach shut until the Castle sends what it owes.'
      : stage === 3 ? 'Sell to whoever pays at once, and make the Castle pay for the landing.'
        : a >= 0.3 ? 'Sell the Castle its gold on the old terms, and keep the friend.'
          : 'Sell gold at the best price, and buy the labour the mines need from whoever brings it.';
  }

  oneOf(c, [
    // Stage 4: the beach is shut to the Castle for a season and more.
    ['collapse', stage >= 4 && quiet('embargo') ? 0.08 : 0, () => {
      launch(c, {
        kind: 'embargo', power: 'akan', ports: GOLD_COAST, dur: months(c.rng, 10, 16), closes: true, blight: 0.02, stock: { ouro: 0.5 }, duesMult: 1.2,
        reason: 'The Akan have stopped selling to the Castle on its terms, and the beach is shut to every ship that is not on theirs.',
        said: 'Shut the beach to the Castle.', kindName: 'collapse', front: { id: 'gold', delta: 0.1 },
        note: 'The beach at Mina is shut to the Castle.',
        rumour: {
          place: 'mina', front: 'gold',
          truth: { claim: 'The Akan have stopped selling to the Castle, and the beach at Mina is shut to every ship that is not on their terms.', vague: 'The beach at Mina is shut.' },
          stale: { claim: 'The Castle’s gold is coming down at the old price.', vague: 'Mina is open.' },
          falsehood: { claim: 'The Castle has fallen and the garrison is at sea in a boat.', vague: 'Mina has fallen.' },
        },
      });
    }],
    // Stage 3 and above: a revolt on the coast, shorter and nearer.
    ['revolt', stage >= 3 && noWar ? 0.02 * (stage - 2) + (a <= -0.3 ? 0.03 : 0) : 0, () => {
      launch(c, {
        kind: 'war', power: 'akan', ports: GOLD_COAST, dur: months(c.rng, 4, 7), closes: true, blight: 0.02, stock: { ouro: 0.6 }, price: { ouro: 1.1 },
        reason: 'The beach has risen against the Castle’s factors, and the road from Axim and Acara to Mina is held by the Akan.',
        said: 'The beach rose against the Castle.', kindName: 'revolt', front: { id: 'gold', delta: 0.25 },
        note: 'The beach has risen against the Castle at Mina.',
        rumour: {
          place: 'mina', front: 'gold',
          truth: { claim: 'The beach has risen against the Castle’s factors, and the road from Axim and Acara to Mina is held by the Akan.', vague: 'There is fighting on the Mina beach.' },
          stale: { claim: 'The Castle’s factors are trading at Axim and Acara as they always did.', vague: 'The Mina beach is quiet.' },
          falsehood: { claim: 'The Akan have taken the Castle at Mina.', vague: 'There is fighting at Mina.' },
        },
      });
    }],
    // Stage 2 and above: fever in the Castle, and a ship lying there feels it.
    ['fever', fx(0.03) > 0 && quiet('stub') ? fx(0.03) : 0, () => {
      const dur = months(c.rng, 3, 5);
      akan.flags.feverUntil = t + dur * MONTH;
      launch(c, {
        kind: 'stub', power: 'akan', ports: ['mina'], dur, stock: { ouro: 0.9 }, blight: 0.02,
        reason: 'Fever is in the Castle at Mina, and the garrison is burying men every week; fewer ships are loading.',
        said: 'Fever in the Castle.', kindName: 'fever',
        rumour: {
          place: 'mina', front: 'gold',
          truth: { claim: 'Fever is in the Castle at Mina, and the garrison is burying men every week.', vague: 'There is sickness at Mina.' },
          stale: { claim: 'The Castle at Mina is healthy, and the factor is buying gold at the usual price.', vague: 'Mina is well.' },
          falsehood: { claim: 'The Akan have taken the Castle at Mina.', vague: 'There is fighting at Mina.' },
        },
      });
    }],
    // Stage 2 and above: the garrison is short of men and the factor of goods the beach wants.
    ['strain', fx(0.025) > 0 && !hasActive(st, 'crown', 'stub', t) ? fx(0.025) : 0, () => {
      launch(c, {
        kind: 'stub', power: 'crown', ports: ['mina'], dur: months(c.rng, 4, 7), duesMult: 1.1, stock: { ouro: 0.93 }, price: { ferramenta: 1.1, panos: 1.08 },
        reason: 'The Castle is short of men and of the goods the beach asks for; the captain keeps what he has and charges the ships that land.',
        said: 'The Castle ran short of men and goods.', kindName: 'strain',
        rumour: {
          place: 'mina', front: 'gold',
          truth: { claim: 'The garrison at Mina is short of men, and the factor is short of the cloth and iron the beach wants.', vague: 'The Castle is short of men.' },
          stale: { claim: 'The Castle’s stores are full, and the garrison is at strength.', vague: 'The Castle is well found.' },
        },
      });
    }],
    // A beach that likes the Castle says so in the dues.
    ['welcome', a >= 0.3 && stage <= 3 && quiet('welcome') && noWar ? 0.04 : 0, () => {
      launch(c, {
        kind: 'welcome', power: 'akan', ports: ['mina'], dur: months(c.rng, 8, 14), duesMult: 0.9, stock: { ouro: 1.06 },
        reason: 'The beach likes the Castle’s captain this season, and the gold comes down a little freer.',
        said: 'The beach sold freely.', kindName: 'welcome',
        rumour: {
          place: 'mina', front: 'gold',
          truth: { claim: 'The Akan are selling freely to the Castle this season, and the dues on the beach are light.', vague: 'The Mina beach is friendly.' },
          stale: { claim: 'The Mina beach is slow and the Akan are choosy.', vague: 'The Mina beach is slow.' },
        },
      });
    }],
  ]);
}
