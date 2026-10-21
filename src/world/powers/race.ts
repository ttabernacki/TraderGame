import { MONTH } from './core';
import { declareReader } from './modifiers';
import { clamp } from '../../core/math';
import { active, att, launch, months, oneOf, say, stageOf, type Ctx } from './moves';
import type { PowersState } from './types';

/**
 * The Claim, or the Race (BUILD_PLAN E3): Castile, the line, the padrões, and who lands first.
 *
 *   stage 1  soundings and padrões: Portugal has the south Atlantic to itself and says so with stone.
 *   stage 2  Castile asks where the line runs, and who gave the pilots their sheets.
 *   stage 3  the line is drawn, and both crowns argue over where it falls on water (Castile's harbour-masters, hired pilots).
 *   stage 4  the race: whoever lands first, owns. Castilian interlopers on the Mina beach; the other captain presses.
 *
 * Castile's moves are an Effect in force and a rumour (as every Power's). The other half of the Race is the rival's
 * house (progression/rivalHouse), the "person with a company": its pace is the Front's stage (`racePace`, read where
 * the rival is advanced), and a place it reached first is a place the captain meets with a stone already standing on it
 * (progression/frontScenes, `claim-pillar`).
 *
 * Sources and what is invented: docs/SOURCES.md, "The Fronts staged (E3)". The line, the hired pilots and the interlopers
 * are documented in outline; the chances, the lengths and the prices are the game's own.
 */

declareReader('moves.race');

/** How much faster the rival's house works the coast ahead of it as the Race heats: 1 at stage 1, then 1.1, 1.25, 1.4. */
export const racePace = (st: PowersState | undefined | null): number => {
  const s = st?.fronts.claim.stage ?? 1;
  return [1, 1, 1.1, 1.25, 1.4][s] ?? 1;
};

export function castileTick(c: Ctx): void {
  const claim = stageOf(c, 'claim');
  const p = c.st.powers.castile;
  // A Castile the Ledger has made friendly (a sheet in its hands, a padrão left alone) harasses less; a sour one, more.
  const heat = clamp(1 - att(c, 'castile'), 0.4, 1.6);
  const stale = (k: string, months_: number): boolean => typeof p.flags[k] !== 'number' || c.t - Number(p.flags[k]) > months_ * MONTH;
  if (c.t >= p.intentUntil) {
    p.intentUntil = c.t + 24 * MONTH;
    p.intent = claim >= 4 ? 'Land first, and let the line be argued afterwards.'
      : claim === 3 ? 'Make the line mean what it says in Castile’s favour, and hire the pilots who know the water.'
        : claim === 2 ? 'Find out where the line runs, and who gave the pilots their sheets.'
          : 'Press for the Guinea trade and for the line to run where it suits.';
  }
  oneOf(c, [
    ['note', (claim >= 2 && stale('noteAt', 20) ? 0.04 : 0) * heat, () => {
      p.flags.noteAt = c.t;
      say(c, 'castile', 'note', 'Asked Lisbon where the line runs.', {
        place: 'lisboa', front: 'claim',
        truth: { claim: 'Castile has sent to ask where the line runs, and who gave the Portuguese pilots their sheets.', vague: 'Castile is asking about the line.' },
        stale: { claim: 'Castile is content to let the south alone.', vague: 'Castile is quiet.' },
      }, 8, { id: 'claim', delta: 0.1 });
    }],
    ['interlopers', (claim >= 2 && !active(c, 'castile', 'stub') ? 0.02 * (claim >= 4 ? 2 : 1) : 0) * heat, () => {
      launch(c, {
        kind: 'stub', power: 'castile', ports: ['mina'], dur: months(c.rng, 4, 7), price: { ouro: 1.04 }, stock: { ouro: 0.93 }, blight: 0.008,
        reason: 'Castilian interlopers are on the Mina beach, buying gold for whatever they have in the hold.',
        said: 'Sent interlopers to the Mina beach.', kindName: 'interlopers',
        rumour: {
          place: 'mina', front: 'claim',
          truth: { claim: 'Castilian ships are on the Mina beach, and the Akan are selling to them.', vague: 'Castilians are on the Mina beach.' },
          stale: { claim: 'The Mina beach is the Castle’s alone.', vague: 'Mina is quiet.' },
          falsehood: { claim: 'Castile has landed men on the Mina beach to build a fort.', vague: 'Castile is building at Mina.' },
        },
      });
    }],
    // The harbour-master at Las Palmas, who is Castile's, takes an interest in what a Portuguese hull is carrying.
    ['canaries', claim >= 3 && !(typeof p.flags.canariesUntil === 'number' && c.t < p.flags.canariesUntil) ? 0.03 * heat : 0, () => {
      const dur = months(c.rng, 5, 9);
      p.flags.canariesUntil = c.t + dur * MONTH;
      launch(c, {
        kind: 'stub', power: 'castile', ports: ['las-palmas'], dur, duesMult: 1.15,
        reason: 'Castile’s harbour-master at Las Palmas has had a letter about Portuguese hulls, and the dues have changed with it.',
        said: 'Had Las Palmas search Portuguese hulls.', kindName: 'canaries', front: { id: 'claim', delta: 0.1 },
        rumour: {
          place: 'las-palmas', front: 'claim',
          truth: { claim: 'The harbour-master at Las Palmas has orders about Portuguese hulls, and asks what each of them has been doing south of the line.', vague: 'Las Palmas is asking questions of Portuguese ships.' },
          stale: { claim: 'Las Palmas waters any hull that asks, and asks nothing back.', vague: 'Las Palmas is easy.' },
          falsehood: { claim: 'Castile has closed Las Palmas to the Portuguese.', vague: 'Las Palmas is shut to Portuguese ships.' },
        },
      });
    }],
    // Pilots who know the water are the thing the line cannot be drawn without; Castile is hiring them, and the Casa searches ships for sheets.
    ['pilots', (claim >= 3 && stale('pilotsAt', 24) ? 0.025 : 0) * heat, () => {
      p.flags.pilotsAt = c.t;
      launch(c, {
        kind: 'stub', power: 'castile', ports: ['lagos', 'lisboa'], dur: months(c.rng, 4, 8), duesMult: 1.04,
        reason: 'Castile is hiring Portuguese pilots, and the Casa’s men are searching outward ships for sheets.',
        said: 'Hired pilots from the Algarve.', kindName: 'pilots', front: { id: 'claim', delta: 0.1 },
        rumour: {
          place: 'lagos', front: 'claim',
          truth: { claim: 'Castile is paying Portuguese pilots to cross the border, and the Casa’s men are searching outward ships for sheets.', vague: 'Pilots are leaving for Castile.' },
          stale: { claim: 'The pilots of Lagos sail for the Casa and nobody else.', vague: 'The Lagos pilots are loyal.' },
          falsehood: { claim: 'A pilot of the Casa has sold the whole Guinea road to Castile.', vague: 'A pilot has sold the road.' },
        },
      });
    }],
    // The race itself: Castile says where it has been, and the stage is what it was.
    ['landing', (claim >= 4 && stale('landingAt', 18) ? 0.03 : 0) * heat, () => {
      p.flags.landingAt = c.t;
      say(c, 'castile', 'landing', 'Reported a landing on a coast past the line.', {
        place: 'lisboa', front: 'claim',
        truth: { claim: 'A Castilian captain says he landed on a coast past Mina and raised his sovereigns’ arms; the Casa says the coast is Portugal’s.', vague: 'Castile says it has landed past the line.' },
        stale: { claim: 'The south is Portugal’s, and nobody has been there but her ships.', vague: 'The south is Portugal’s.' },
        falsehood: { claim: 'Castile has built a fort on the Guinea coast and is holding it.', vague: 'Castile has a fort in Guinea.' },
      }, 8, { id: 'claim', delta: 0.2 });
    }],
  ]);
}
