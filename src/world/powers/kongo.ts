import { clamp } from '../../core/math';
import { dateFromDays } from '../../core/clock';
import type { Rng } from '../../core/rng';
import { MONTH, addEffect, hasActive } from './core';
import { declareReader } from './modifiers';
import { announce } from './rumours';
import type { PowersState } from './types';

/**
 * The Kongo Power, the one that moves in this build.
 *
 * Kongo is a king at Mbanza Kongo and a coast of provinces; Mpinda is the mouth of the great river and
 * answers to the Mani Soyo. Its court is divided: the ELDERS keep the king's right to every captive taken
 * in war and want the sale of people held to that right; the TRADERS want to sell to whoever comes.
 * `balance` is the court's lean, -1 elders to +1 traders. What Kongo does each month depends on three
 * things: its attitude to the captain (set by the Ledger), the balance (moved by the captain's scenes at
 * Mpinda and by the Traffic's own stage), and the Traffic's stage. Probabilities are the game's own
 * tuning, not history; the events they model (an embargo, a register of those sold, a war with the Ngola)
 * are plausible and not dated.
 */

declareReader('moves.kongo');

export const KONGO_PORTS = ['mpinda'];
export const NDONGO_PORTS = ['luanda', 'benguela'];

/** Monthly chances; see the falsifier for what they do to a 20-year run. */
export const K = {
  embargoBase: 0.07, war: 0.011, truce: 0.12, curb: 0.035, push: 0.035, succession: 0.2,
  drift: 0.02,
} as const;

const months = (rng: Rng, a: number, b: number): number => Math.round(rng.range(a, b));

function log(st: PowersState, t: number, kind: string, text: string): void {
  const k = st.powers.kongo;
  k.moves.push({ t, kind, text });
  if (k.moves.length > 40) k.moves.splice(0, k.moves.length - 40);
}

export interface KongoOut {
  /** Ports whose lane closed this month (for P). */
  note?: (text: string) => void;
}

/** One month of Kongo. At most one move. */
export function kongoTick(st: PowersState, t: number, rng: Rng, out: KongoOut = {}): void {
  const k = st.powers.kongo;
  const traffic = st.fronts.traffic.stage;
  const att = k.attitude;
  let bal = k.balance ?? 0;
  const year = dateFromDays(Math.floor(t / 86400)).year;

  // The court's lean follows the trade: as the Traffic grows, the traders gain on the elders.
  const lean = traffic >= 4 ? 0.5 : traffic === 3 ? 0.25 : traffic === 2 ? 0.0 : -0.1;
  bal = clamp(bal + (lean - bal) * K.drift, -1, 1);
  k.balance = bal;

  // What it wants for the next two years.
  if (t >= k.intentUntil) {
    k.intentUntil = t + 24 * MONTH;
    k.intent = att <= -0.35 ? 'Keep the Portuguese out until they show some respect.'
      : bal < -0.2 ? 'Keep the king’s right to those taken in war, and count those who leave.'
        : bal > 0.2 ? 'Sell to whoever comes, and let the elders object.'
          : 'Keep the coast quiet and the Portuguese useful.';
  }

  // At most one move a month.
  const war = hasActive(st, 'kongo', 'war', t);
  const embargo = hasActive(st, 'kongo', 'embargo', t);
  const register = hasActive(st, 'kongo', 'register', t);
  const push = hasActive(st, 'kongo', 'push', t);

  if (war && rng.chance(K.truce)) {
    for (const e of st.effects) if (e.power === 'kongo' && e.kind === 'war' && e.end > t) e.end = t;
    log(st, t, 'truce', 'Made a truce with the Ngola.');
    announce(st, rng, t, {
      event: 'kongo.truce', place: 'mpinda', power: 'kongo', window: 6,
      truth: { claim: 'The Ngola and the Manikongo have made a truce, and the road south of the Congo is open again.', vague: 'The war south of the Congo is over, they say.' },
      stale: { claim: 'The war south of the Congo goes on, and the coast from Luanda to Benguela is shut.', vague: 'There is war south of the Congo.' },
    });
    return;
  }

  if (!embargo && att <= -0.35 && rng.chance(K.embargoBase + (-att - 0.35) * 0.2)) {
    const dur = months(rng, 8, 14);
    const e = addEffect(st, {
      kind: 'embargo', power: 'kongo', ports: KONGO_PORTS, start: t, end: t + dur * MONTH, closes: true, blight: 0.03,
      reason: 'The Manikongo has forbidden his people to trade with the Portuguese until he is satisfied.',
    });
    log(st, t, 'embargo', 'Forbade his people to trade with the Portuguese.');
    out.note?.('The Manikongo has closed the beach at Mpinda to the Portuguese.');
    announce(st, rng, t, {
      event: `effect:${e.id}`, place: 'mpinda', power: 'kongo', window: dur + 2,
      truth: { claim: 'The Manikongo has forbidden his people to trade with the Portuguese at Mpinda until he is satisfied.', vague: 'There is trouble at Mpinda, and the Portuguese are not welcome there.' },
      stale: { claim: 'Mpinda is open, and the factor is buying ivory and cloth as he always has.', vague: 'Mpinda trades as it always has.' },
      falsehood: { claim: 'The Manikongo has seized a Portuguese ship at Mpinda and kept her cargo.', vague: 'A ship has been lost at Mpinda.' },
    });
    return;
  }

  if (!war && !embargo && rng.chance(K.war * (bal > 0.3 ? 1.5 : 1))) {
    const dur = months(rng, 5, 9);
    const e = addEffect(st, {
      kind: 'war', power: 'kongo', ports: NDONGO_PORTS, start: t, end: t + dur * MONTH, closes: true, blight: 0.03,
      price: { sal: 1.3, panos: 1.25, ferramenta: 1.2 },
      reason: 'The Ngola is at war with the Manikongo’s people, and the coast from Luanda to Benguela is shut to traders.',
    });
    log(st, t, 'war', 'War with the Ngola.');
    announce(st, rng, t, {
      event: `effect:${e.id}`, place: 'luanda', power: 'kongo', window: dur + 2,
      truth: { claim: 'The Ngola has come against the Manikongo’s people, and the coast from Luanda to Benguela is shut to traders while it lasts.', vague: 'There is war south of the Congo.' },
      stale: { claim: 'The coast south of Mpinda is quiet, and Luanda is buying iron.', vague: 'All is quiet south of the Congo.' },
      falsehood: { claim: 'The Manikongo is dead, and his sons are at war.', vague: 'The Manikongo is in trouble.' },
    });
    return;
  }

  if (traffic >= 2 && !register && bal < -0.15 && rng.chance(K.curb)) {
    const dur = months(rng, 8, 16);
    const e = addEffect(st, {
      kind: 'register', power: 'kongo', ports: KONGO_PORTS, start: t, end: t + dur * MONTH, duesMult: 1.15,
      reason: 'The Manikongo’s officers count everyone who goes down to the beach at Mpinda, and take a due on each.',
    });
    st.fronts.traffic.offset = clamp(st.fronts.traffic.offset - 0.08, -1.2, 2.4);
    k.balance = clamp(bal - 0.05, -1, 1);
    log(st, t, 'register', 'Had his officers count those who leave by the beach.');
    announce(st, rng, t, {
      event: `effect:${e.id}`, place: 'mpinda', power: 'kongo', front: 'traffic', window: dur + 2,
      truth: { claim: 'The Manikongo’s officers are counting every man, woman and child who goes down to the beach at Mpinda, and the factor does not like it.', vague: 'The Manikongo’s men are watching the beach at Mpinda.' },
      stale: { claim: 'Nobody counts at Mpinda: the factor ships what he buys.', vague: 'Mpinda ships what it likes.' },
      falsehood: { claim: 'The Manikongo has forbidden any sale at Mpinda.', vague: 'Mpinda has shut its beach.' },
    });
    return;
  }

  if (traffic >= 2 && !push && bal > 0.15 && rng.chance(K.push)) {
    const dur = months(rng, 8, 14);
    const e = addEffect(st, {
      kind: 'push', power: 'kongo', ports: KONGO_PORTS, start: t, end: t + dur * MONTH, stock: { marfim: 1.1, panos: 1.1 },
      reason: 'The traders hold the beach at Mpinda this season, and sell to anyone who comes.',
    });
    st.fronts.traffic.offset = clamp(st.fronts.traffic.offset + 0.08, -1.2, 2.4);
    k.balance = clamp(bal + 0.05, -1, 1);
    log(st, t, 'push', 'Let the traders have the beach.');
    announce(st, rng, t, {
      event: `effect:${e.id}`, place: 'mpinda', power: 'kongo', front: 'traffic', window: dur + 2,
      truth: { claim: 'The traders have the beach at Mpinda this season, and sell to anyone who comes.', vague: 'Mpinda is busy.' },
      stale: { claim: 'The elders keep the beach at Mpinda quiet, and little is sold.', vague: 'Mpinda is quiet.' },
      falsehood: { claim: 'The traders at Mpinda are giving ivory away to get a ship.', vague: 'Ivory is cheap at Mpinda.' },
    });
    return;
  }

  // The succession: not dated in the scene, but late enough in the game that it is the heir who lives it.
  if (year >= 1506 && !k.flags.succession && rng.chance(K.succession)) {
    k.flags.succession = true;
    const e = addEffect(st, {
      kind: 'succession', power: 'kongo', ports: KONGO_PORTS, start: t, end: t + 6 * MONTH, duesMult: 1.2, stock: { marfim: 0.85 },
      reason: 'The old Manikongo is failing, and two of his sons have men under arms; the beach is cautious.',
    });
    log(st, t, 'succession', 'The court is split over the succession.');
    announce(st, rng, t, {
      event: `effect:${e.id}`, place: 'mpinda', power: 'kongo', window: 8,
      truth: { claim: 'The old Manikongo is failing, and two of his sons have men under arms.', vague: 'There is trouble at the Manikongo’s court.' },
      stale: { claim: 'The Manikongo is well, and the court is quiet.', vague: 'The Manikongo’s court is quiet.' },
    });
  }
}
