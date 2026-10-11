import type { Game } from '../../game/state';
import type { SeaEvent } from '../../game/seaEvents';
import { POLITY_BY_ID } from '../../diplomacy/polities';

/**
 * The Emperor's orders. A voyage of the Western Ocean is not a trading
 * licence but a list of kings: each is to be brought to receive the Emperor's
 * calendar, or dealt with if he will not. The orders are what the captain is
 * judged by when he reports, and what pays him. Seven voyages, 1405 to 1433;
 * the first is written and the rest are cut as the campaign grows.
 */

export type ObjectiveKind = 'accept' | 'deed';

export interface ImperialObjective {
  id: string;
  kind: ObjectiveKind;
  /** For 'accept', a court (polity id); for 'deed', the id a scene sets. */
  target: string;
  text: string;
}

export interface VoyageDef {
  n: number;
  title: string;
  years: string;
  orders: string;
  objectives: ImperialObjective[];
  /** Where it is reported: any Ming port. */
  renown: number;
  silver: number;
  closing: string;
}

export const VOYAGES: VoyageDef[] = [
  {
    n: 1, title: 'The first voyage', years: '1405–1407',
    orders: 'The Yongle Emperor sends the fleet to the Western Ocean to carry his calendar to every king who will receive it, and to find the missing Emperor if he is anywhere to be found. '
      + 'You will sail with the north-east monsoon, call at Champa, Java, Palembang and Malacca, cross the Bay of Bengal to the cinnamon island and go on to Calicut. '
      + 'You will return with the south-west monsoon, with the envoys of the kings who are to come.',
    objectives: [
      { id: 'champa', kind: 'accept', target: 'champa', text: 'Champa receives the Emperor’s calendar' },
      { id: 'java', kind: 'accept', target: 'majapahit', text: 'The kings of Java receive it' },
      { id: 'chen_zuyi', kind: 'deed', target: 'chen_zuyi', text: 'The pirate chief of Palembang is dealt with' },
      { id: 'malacca', kind: 'accept', target: 'malacca', text: 'Malacca receives it' },
      { id: 'kotte', kind: 'accept', target: 'kotte', text: 'The king of the cinnamon island receives it' },
      { id: 'calicut', kind: 'accept', target: 'calicut', text: 'The Zamorin of Calicut receives it' },
    ],
    renown: 80, silver: 600,
    closing: 'The fleet comes home to Nanjing with the envoys of the kings, and the pirate in irons. The Emperor receives them in the Hall of Heavenly Grace, and the next voyage is ordered.',
  },
];

export interface ImperialState {
  /** The voyage under orders, from 1; 0 when the last is done and the next is not yet cut. */
  voyage: number;
  done: Record<string, boolean>;
  completed: number[];
  /** Standing with the Emperor's court, which the reports build. */
  favour: number;
}

export function newImperial(): ImperialState {
  return { voyage: 1, done: {}, completed: [], favour: 0 };
}

export function voyageOf(s: ImperialState): VoyageDef | null {
  return VOYAGES.find((v) => v.n === s.voyage) ?? null;
}

/** Whether a court has taken the Emperor's calendar: it trusts him, and will let the fleet trade. */
export function courtAccepts(g: Game, polityId: string): boolean {
  const pol = POLITY_BY_ID.get(polityId);
  if (!pol) return false;
  const st = g.polityState(polityId);
  return st.trust >= 0.2 && pol.ports.some((p) => g.relations.get(p)?.mayTrade);
}

export function evaluateImperial(g: Game): void {
  const s = g.imperial;
  const v = s && voyageOf(s);
  if (!s || !v) return;
  for (const o of v.objectives) {
    if (s.done[o.id]) continue;
    if (o.kind === 'accept' && courtAccepts(g, o.target)) {
      s.done[o.id] = true;
      g.logEvent('crown', `${o.text}. The Admiral will want it written down.`, true);
    }
  }
}

export function ordersDone(s: ImperialState): boolean {
  const v = voyageOf(s);
  return !!v && v.objectives.every((o) => s.done[o.id]);
}

/** Report to the Admiral at a Ming port: the voyage is closed, the captain paid. */
export function reportVoyage(g: Game): string | null {
  const s = g.imperial;
  const v = s && voyageOf(s);
  if (!s || !v || !ordersDone(s)) return null;
  s.completed.push(v.n);
  s.favour += v.renown;
  g.crown.standing += v.renown;
  g.crown.lifetimeStanding += v.renown;
  g.crown.gold += v.silver;
  const next = VOYAGES.find((x) => x.n === v.n + 1);
  s.voyage = next ? next.n : 0;
  s.done = {};
  g.logEvent('crown', `The ${v.title.toLowerCase()} is reported. ${v.silver} in silver, and ${v.renown} in the Emperor’s regard.`, true);
  return v.closing;
}

// ---------------------------------------------------------------------------
// Deeds: things that happen at a port while the orders are out.

function chenZuyi(): SeaEvent {
  return {
    id: 'imperial:chen_zuyi',
    title: 'The headman of Palembang’s warning',
    text: 'Shi Jinqing, the headman of the Chinese colony at Palembang, comes aboard by night. Chen Zuyi, the Cantonese chief who holds the river, has told the Emperor he will submit, and means to take the fleet when it lies in his roads: he has the boats, and he has the harbour. '
      + 'Shi says he can bring Chen out to the fleet’s own anchorage on a pretext, and take him.',
    severity: 'warning',
    council: true,
    choices: [
      {
        label: 'Take Chen at the anchorage, as Shi proposes',
        detail: 'You will have the fleet cleared for action and the soldiers aboard every boat. It will be sudden and it will be bloody.',
        resolve: (gg) => {
          gg.imperial!.done.chen_zuyi = true;
          gg.adjustPolity('palembang', { trust: 0.15, respect: 0.2 }, 'the pirate chief was taken by the Ming fleet');
          gg.crew.morale = Math.min(1, gg.crew.morale + 0.05);
          return 'Chen Zuyi came out to the fleet on the tide and did not go back. Five thousand of his men died on the river; Shi Jinqing was made headman of the port.';
        },
      },
      {
        label: 'Go ashore and treat with Chen yourself',
        detail: 'You trust his word more than his reputation. He will not need to know that you know.',
        resolve: (gg) => {
          gg.adjustPolity('palembang', { trust: -0.2, respect: -0.1 }, 'the fleet was ambushed at Palembang');
          gg.crew.morale = Math.max(0, gg.crew.morale - 0.12);
          gg.ship.condition.hull = Math.max(0.5, gg.ship.condition.hull - 0.12);
          gg.imperial!.done.chen_zuyi = true;
          return 'Chen’s boats came out in the dark. The fleet beat them off with fire-arrows and the soldiers, and Chen was taken in the end, but you lost good men for having believed him.';
        },
      },
    ],
  };
}

export function imperialArrival(g: Game, portId: string): void {
  const s = g.imperial;
  if (!s) return;
  if (s.voyage === 1 && portId === 'palembang' && !s.done.chen_zuyi) g.queueScene(chenZuyi());
}
