import { MONTH, pull } from './core';
import { declareReader } from './modifiers';
import { active, att, endAll, launch, months, oneOf, say, stageOf, type Ctx } from './moves';

/**
 * The Crescent (BUILD_PLAN D4): the Mamluk–Venetian axis answering the ships that came round the Cape.
 * Diplomatic notes, then convoys, then a league. Stage 1 is quiet in Cairo. The Fronts stage follows the dated
 * shocks (Gama, Cabral, the Venetian alarm, the Egyptian fleet) and what the Power does here; the captain moves it
 * through the Ledger (ships stopped, ships spared, peace carried).
 */

declareReader('moves.crescent');

export const RED_SEA_PORTS = ['adem'];

export function mamlukTick(c: Ctx): void {
  const a = att(c, 'mamluk');
  const p = c.st.powers.mamluk;
  const cres = stageOf(c, 'crescent');
  const f = p.flags;
  if (c.t >= p.intentUntil) {
    p.intentUntil = c.t + 24 * MONTH;
    p.intent = cres >= 4 ? 'Hold the league together and break the ships that came round the Cape.'
      : cres === 3 ? 'Get the pepper out of Malabar in company, and the Portuguese out of the road.'
        : cres === 2 ? 'Write to Rome and to Lisbon, and see which listens.'
          : 'Keep the spice road through the Red Sea open and Lisbon’s ships out of it.';
  }
  const calicutHot = att(c, 'calicut') <= -0.1 && att(c, 'gujarat') <= -0.1;
  oneOf(c, [
    ['peace', cres >= 2 && a >= 0.1 ? 0.025 : 0, () => {
      endAll(c, 'mamluk', 'convoy');
      pull(c.st, 'crescent', -0.5);
      delete f.league;
      say(c, 'mamluk', 'peace', 'Received a Portuguese envoy and wrote back, civilly.', {
        place: 'adem', front: 'crescent',
        truth: { claim: 'The Sultan’s court at Cairo has received a Portuguese envoy and written back, civilly.', vague: 'Cairo is less angry than it was.' },
        stale: { claim: 'Cairo has written to Rome that the Portuguese are pirates.', vague: 'Cairo is angry.' },
      }, 8);
    }],
    ['league', cres >= 3 && calicutHot && !f.league ? 0.035 : 0, () => {
      f.league = c.t;
      c.st.powers.mamluk.relations.calicut = 0.9; c.st.powers.calicut.relations.mamluk = 0.9;
      c.st.powers.mamluk.relations.gujarat = 0.9; c.st.powers.gujarat.relations.mamluk = 0.9;
      launch(c, {
        kind: 'blockade', power: 'mamluk', ports: RED_SEA_PORTS, dur: months(c.rng, 12, 18), closes: true, duesMult: 1.2, blight: 0.015,
        reason: 'Cairo, Gujarat and Calicut have agreed to keep the Red Sea road shut to ships without their letter.',
        said: 'Agreed a league with Gujarat and Calicut against the ships round the Cape.', kindName: 'league', front: { id: 'crescent', delta: 0.8 },
        note: 'Cairo, Gujarat and Calicut have agreed to act together against the Portuguese.',
        rumour: {
          place: 'adem', front: 'crescent',
          truth: { claim: 'Cairo, Gujarat and Calicut have agreed to act together against the ships that came round the Cape.', vague: 'The Moorish courts have agreed on something.' },
          stale: { claim: 'The Moorish courts are each writing their own letters, and agree on nothing.', vague: 'The Moorish courts are divided.' },
          falsehood: { claim: 'The Sultan has sent a fleet to sea against the Portuguese.', vague: 'A fleet has sailed from Suez.' },
        },
      });
    }],
    ['convoy', cres >= 3 && !active(c, 'mamluk', 'convoy') ? 0.05 : 0, () => {
      launch(c, {
        kind: 'convoy', power: 'mamluk', ports: [...RED_SEA_PORTS, 'ormuz'], dur: months(c.rng, 10, 16), duesMult: 1.08,
        reason: 'The ships out of Adem and Ormuz sail in company this season, and the quay charges for the escort.',
        said: 'Ordered the ships out of Adem to sail in company.', kindName: 'convoy', front: { id: 'crescent', delta: 0.3 },
        rumour: {
          place: 'adem', front: 'crescent',
          truth: { claim: 'The ships out of Adem and Ormuz are sailing in company now, with guns, and the quays charge for the escort.', vague: 'The Moorish ships sail in convoy.' },
          stale: { claim: 'Ships leave Adem one by one, as they always did.', vague: 'Adem trades as it always has.' },
        },
      });
    }],
    ['note', cres >= 2 && (typeof f.noteAt !== 'number' || c.t - f.noteAt > 18 * MONTH) ? 0.06 : 0, () => {
      f.noteAt = c.t;
      launch(c, {
        kind: 'stub', power: 'mamluk', ports: RED_SEA_PORTS, dur: 6, duesMult: 1.1,
        reason: 'The Sultan’s court has written to Rome and to Lisbon, and nobody on the quay at Adem is calm.',
        said: 'Wrote to Rome and to Lisbon about the Cape route.', kindName: 'note', front: { id: 'crescent', delta: 0.4 },
        rumour: {
          place: 'adem', front: 'crescent',
          truth: { claim: 'The Sultan’s court at Cairo has written to Rome and to Lisbon about the ships that came round the Cape.', vague: 'Cairo has written about the Portuguese.' },
          stale: { claim: 'Cairo takes no notice of the Portuguese.', vague: 'Cairo takes no notice.' },
          falsehood: { claim: 'The Pope has promised to call the Portuguese home.', vague: 'Rome has answered Cairo.' },
        },
      });
    }],
  ]);
}
