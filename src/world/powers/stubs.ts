import { MONTH } from './core';
import { declareReader } from './modifiers';
import { active, att, launch, months, oneOf, say, stageOf, yearOf, type Ctx } from './moves';

/**
 * The lighter stubs (BUILD_PLAN D4): Castile and the Claim, the Benin river, and the Sahel edge where Jolof presses on
 * the caravan road. Each makes one or two small moves and is read by nothing but the price and the rumour mill. The
 * Akan are moved by the Gold's own tick (gold.ts) and are not repeated here.
 */

declareReader('moves.swahili');

export function castileTick(c: Ctx): void {
  const claim = stageOf(c, 'claim');
  oneOf(c, [
    ['note', claim >= 2 && (typeof c.st.powers.castile.flags.noteAt !== 'number' || c.t - Number(c.st.powers.castile.flags.noteAt) > 20 * MONTH) ? 0.04 : 0, () => {
      c.st.powers.castile.flags.noteAt = c.t;
      say(c, 'castile', 'note', 'Asked Lisbon where the line runs.', {
        place: 'lisboa', front: 'claim',
        truth: { claim: 'Castile has sent to ask where the line runs, and who gave the Portuguese pilots their sheets.', vague: 'Castile is asking about the line.' },
        stale: { claim: 'Castile is content to let the south alone.', vague: 'Castile is quiet.' },
      }, 8, { id: 'claim', delta: 0.1 });
    }],
    ['interlopers', claim >= 2 && !active(c, 'castile', 'stub') ? 0.02 : 0, () => {
      launch(c, {
        kind: 'stub', power: 'castile', ports: ['mina'], dur: months(c.rng, 4, 7), price: { ouro: 1.04 }, stock: { ouro: 0.93 }, blight: 0.008,
        reason: 'Castilian interlopers are on the Mina beach, buying gold for whatever they have in the hold.',
        said: 'Sent interlopers to the Mina beach.', kindName: 'interlopers',
        rumour: {
          place: 'mina',
          truth: { claim: 'Castilian ships are on the Mina beach, and the Akan are selling to them.', vague: 'Castilians are on the Mina beach.' },
          stale: { claim: 'The Mina beach is the Castle’s alone.', vague: 'Mina is quiet.' },
          falsehood: { claim: 'Castile has landed men on the Mina beach to build a fort.', vague: 'Castile is building at Mina.' },
        },
      });
    }],
  ]);
}

export function beninTick(c: Ctx): void {
  oneOf(c, [
    ['river', !active(c, 'benin', 'embargo') && att(c, 'benin') < 0.3 ? 0.01 : 0, () => {
      launch(c, {
        kind: 'embargo', power: 'benin', ports: ['ugoton'], dur: months(c.rng, 4, 8), closes: true, blight: 0.01,
        reason: 'The Oba has closed the river to strangers while his own business is done.',
        said: 'Closed the river to strangers.', kindName: 'river',
        rumour: {
          place: 'ugoton',
          truth: { claim: 'The Oba has closed the river to strangers for the season.', vague: 'Benin is shut for now.' },
          stale: { claim: 'Benin sells to every ship at the river’s mouth.', vague: 'Benin is open.' },
        },
      });
    }],
  ]);
}

export function sahelTick(c: Ctx): void {
  oneOf(c, [
    ['caravan', !active(c, 'sahel', 'stub') ? 0.02 : 0, () => {
      launch(c, {
        kind: 'stub', power: 'sahel', ports: ['arguim'], dur: months(c.rng, 3, 5), stock: { goma: 0.7, ouro: 0.9 }, blight: 0.008,
        reason: 'The caravan from the south is late, and Jolof’s horsemen are on the road to Arguim.',
        said: 'Jolof’s horsemen pressed on the caravan road.', kindName: 'caravan',
        rumour: {
          place: 'arguim',
          truth: { claim: 'The caravan is late, and Jolof’s horsemen are on the road to Arguim.', vague: 'The caravan is late.' },
          stale: { claim: 'The caravans come in on time and the gum is cheap.', vague: 'Arguim is quiet.' },
          falsehood: { claim: 'The Azenegue have burned the caravan and are marching on Arguim.', vague: 'The Azenegue are out.' },
        },
      });
    }],
    ['stool', yearOf(c.t) >= 1485 && !active(c, 'sahel', 'succession') && (Number(c.st.powers.sahel.flags.fights) || 0) < 2 ? 0.004 : 0, () => {
      c.st.powers.sahel.flags.fights = (Number(c.st.powers.sahel.flags.fights) || 0) + 1;
      launch(c, {
        kind: 'succession', power: 'sahel', ports: ['arguim'], dur: 5, duesMult: 1.1,
        reason: 'A fight over the succession in the Wolof country has slowed what comes up to the coast.',
        said: 'A fight over a succession on the Wolof edge.',
        rumour: {
          place: 'arguim',
          truth: { claim: 'There is a fight over the succession among the Wolof, and the caravans are slow.', vague: 'There is trouble among the Wolof.' },
          stale: { claim: 'The Wolof court is quiet and the road is open.', vague: 'The Wolof road is open.' },
        },
      });
    }],
  ]);
}
