import type { Entry } from '../../ledger/ledger';
import type { Tag } from '../../ledger/tags';
import { FRONTS } from './data';
import { declareReader } from './modifiers';
import type { PowersState } from './types';

/**
 * The Rule, read from the captain's own conduct (BUILD_PLAN D4).
 *
 * The cartaz runs from a free sea, through "friends have passes" and the stopping of ships without the King's letter,
 * to a blockade. The stage it stands at in Act V is made by what the captain did at Calecute and at Kilwa in Act IV:
 * the Ledger's rows (`deltas.ts`, tags `ship.*`, `pass.*`, `compact.made`) move the Front, and Act V's opening fixes
 * it (conduct after that counts a third as much: the regime has set, and the heir lives in it).
 *
 * THIS file is the reading: a table of what counts, by place, and one plain line for the Captain's Book that says
 * what stage the Rule is at and what the captain did to put it there. The table is data. The falsifier checks that
 * every row's sign agrees with the sign of the delta table for the same tag, so the line cannot say one thing while
 * the Front does another.
 */

declareReader('scenes.powers');

export interface ConductRow {
  tag: Tag;
  /** Toward stopping (+) or toward licence (-); the sign must agree with `FRONT_DELTAS` for the tag's rule row. */
  lean: 1 | -1;
  /** What the captain did, with the count: singular and plural. */
  one: string;
  many: (n: number) => string;
}

const ships = (n: number): string => (n === 1 ? 'one ship' : `${n} ships`);

export const CONDUCT: ConductRow[] = [
  { tag: 'ship.stopped', lean: 1, one: 'stopped one ship', many: (n) => `stopped ${ships(n)}` },
  { tag: 'ship.spared', lean: -1, one: 'let one ship go', many: (n) => `let ${ships(n)} go` },
  { tag: 'pass.granted', lean: -1, one: 'wrote one pass', many: (n) => `wrote ${n} passes` },
  { tag: 'pass.refused', lean: 1, one: 'refused one pass', many: (n) => `refused ${n} passes` },
  { tag: 'compact.made', lean: -1, one: 'kept a list of passes', many: () => 'kept a list of passes' },
  { tag: 'ship.succoured', lean: -1, one: 'helped one ship under way', many: (n) => `helped ${ships(n)} under way` },
  { tag: 'ship.repulsed', lean: 1, one: 'was beaten off one dhow', many: (n) => `was beaten off ${n} dhows` },
  { tag: 'gift.great', lean: -1, one: 'brought a gift that was praised', many: (n) => `brought ${n} gifts that were praised` },
  { tag: 'gift.insult', lean: 1, one: 'brought a gift that was mocked', many: (n) => `brought ${n} gifts that were mocked` },
  { tag: 'courtesy.kept', lean: -1, one: 'asked before he acted', many: (n) => `asked before acting ${n} times` },
  { tag: 'courtesy.broken', lean: 1, one: 'stood where a stranger should have bowed', many: (n) => `stood where a stranger should have bowed ${n} times` },
  { tag: 'promise.kept', lean: -1, one: 'kept a promise', many: (n) => `kept ${n} promises` },
  { tag: 'promise.broken', lean: 1, one: 'broke a promise', many: (n) => `broke ${n} promises` },
  { tag: 'parcel.carried', lean: -1, one: 'carried a parcel for a merchant and asked nothing', many: (n) => `carried ${n} parcels for merchants and asked nothing` },
  { tag: 'parcel.refused', lean: 1, one: 'refused a merchant’s parcel', many: (n) => `refused ${n} merchants’ parcels` },
];

export interface Place { id: 'calecute' | 'kilwa'; name: string; ports: string[]; polities: string[] }
/** The two places where Act IV sets the Rule. */
export const KEY_PLACES: Place[] = [
  { id: 'calecute', name: 'Calecute', ports: ['calecute'], polities: ['calicut'] },
  { id: 'kilwa', name: 'Kilwa', ports: ['quiloa'], polities: ['kilwa'] },
];

const rowOf = new Map<string, ConductRow>(CONDUCT.map((r) => [r.tag, r]));

export interface PlaceReading { place: Place; counts: Partial<Record<Tag, number>>; lean: number; clause: string }
export interface RuleReading {
  stage: 1 | 2 | 3 | 4;
  name: string;
  places: PlaceReading[];
  /** Positive: toward stopping; negative: toward licence. */
  lean: number;
  /** The implied stage from conduct alone, for the falsifier (1 free .. 4 blockade). */
  conductStage: 1 | 2 | 3 | 4;
  locked: boolean;
  line: string;
}

const atPlace = (p: Place, e: Entry): boolean => p.ports.includes(e.place) || p.polities.includes(e.target) || p.ports.includes(e.target);

export function ruleReading(st: PowersState | undefined, ledger: Entry[]): RuleReading {
  const stage = (st?.fronts.rule.stage ?? 1) as 1 | 2 | 3 | 4;
  const name = FRONTS.rule.stages[stage - 1].name;
  const places: PlaceReading[] = KEY_PLACES.map((place) => {
    const counts: Partial<Record<Tag, number>> = {};
    let lean = 0;
    for (const e of ledger) {
      const row = rowOf.get(e.tag);
      if (!row || !atPlace(place, e)) continue;
      counts[e.tag] = (counts[e.tag] ?? 0) + 1;
      lean += row.lean;
    }
    const parts = CONDUCT.filter((r) => counts[r.tag]).map((r) => (counts[r.tag] === 1 ? r.one : r.many(counts[r.tag]!)));
    const clause = parts.length === 0 ? '' : `At ${place.name} you ${join(parts)}`;
    return { place, counts, lean, clause };
  });
  const lean = places.reduce((s, p) => s + p.lean, 0);
  const conductStage = (lean >= 6 ? 4 : lean >= 2 ? 3 : lean <= -2 ? 2 : 1) as 1 | 2 | 3 | 4;
  const said = places.filter((p) => p.clause).map((p) => p.clause);
  const locked = st?.rule?.lockedAt !== undefined;
  const why = said.length === 0
    ? 'You have done nothing at Calecute or Kilwa that bears on it, so it stands where the Crown and the coast have put it.'
    : `${said.join('. ')}.`;
  const tail = locked ? ' It was set when the fifth act opened.' : '';
  return { stage, name, places, lean, conductStage, locked, line: `The Rule: ${name}. ${why}${tail}` };
}

function join(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
