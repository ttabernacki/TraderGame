import type { Game } from '../../game/state';
import type { SeaEvent } from '../../game/seaEvents';
import { POLITY_BY_ID } from '../../diplomacy/polities';
import { startPiece } from '../../diplomacy/table';

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
  {
    n: 2, title: 'The second voyage', years: '1407\u20131409',
    orders: 'The Emperor has the Zamorin of Calicut to invest and a stele to set up, and wants the harbours of Siam and Java kept sweet. You will sail again on the north-east monsoon, call at Siam and Java, and carry the Emperor\u2019s patents to Cochin and Calicut. Come home with the south-west monsoon.',
    objectives: [
      { id: 'siam', kind: 'accept', target: 'ayutthaya', text: 'Ayutthaya receives the Emperor\u2019s envoy' },
      { id: 'java', kind: 'accept', target: 'majapahit', text: 'Java is kept in the Emperor\u2019s peace' },
      { id: 'cochin', kind: 'accept', target: 'cochin', text: 'The Raja of Cochin receives his patent' },
      { id: 'calicut', kind: 'accept', target: 'calicut', text: 'The Zamorin of Calicut receives his patent and a stele' },
    ],
    renown: 90, silver: 700,
    closing: 'The fleet returns with the envoys of Siam and Calicut. The Emperor sends gifts back with them.',
  },
  {
    n: 3, title: 'The third voyage', years: '1409\u20131411',
    orders: 'Malacca is to be given the Emperor\u2019s seal and a place to store the fleet\u2019s goods. The king of the cinnamon island has been robbing Chinese envoys, and is to be made to answer for it. Then Quilon, Cochin and Calicut as before.',
    objectives: [
      { id: 'malacca', kind: 'accept', target: 'malacca', text: 'Malacca receives the Emperor\u2019s seal' },
      { id: 'alakeshvara', kind: 'deed', target: 'alakeshvara', text: 'The king of Ceylon is called to account' },
      { id: 'cochin', kind: 'accept', target: 'cochin', text: 'Cochin is visited' },
      { id: 'calicut', kind: 'accept', target: 'calicut', text: 'Calicut is visited' },
    ],
    renown: 110, silver: 800,
    closing: 'The fleet brings the king of Ceylon to Nanjing as a prisoner, and the Emperor is minded to forgive him.',
  },
  {
    n: 4, title: 'The fourth voyage', years: '1413\u20131415',
    orders: 'The fleet is to go farther than it has: Hormuz, at the head of the Gulf, and on the way a usurper in Sumatra who has taken the throne of Samudera from its king. The envoys of thirty courts are to be carried home.',
    objectives: [
      { id: 'pasai', kind: 'accept', target: 'pasai', text: 'Samudera receives the Emperor\u2019s envoy' },
      { id: 'sekandar', kind: 'deed', target: 'sekandar', text: 'The usurper of Samudera is dealt with' },
      { id: 'calicut', kind: 'accept', target: 'calicut', text: 'Calicut is visited' },
      { id: 'hormuz', kind: 'accept', target: 'hormuz', text: 'Hormuz receives the Emperor\u2019s envoy' },
    ],
    renown: 130, silver: 1000,
    closing: 'The fleet returns with the envoys of thirty courts, and a usurper in irons.',
  },
  {
    n: 5, title: 'The fifth voyage', years: '1417\u20131419',
    orders: 'The envoys of Hormuz, Aden and the coast of Africa are to be carried home, and the courts of the Swahili coast and Arabia visited. The Emperor would like to see the animals those courts breed, and has been told of one that looks like the qilin of the old books.',
    objectives: [
      { id: 'aden', kind: 'accept', target: 'aden', text: 'Aden receives the Emperor\u2019s envoy' },
      { id: 'mogadishu', kind: 'accept', target: 'mogadishu', text: 'Magadoxo receives it' },
      { id: 'malindi', kind: 'accept', target: 'malindi', text: 'Melinde receives it' },
      { id: 'qilin', kind: 'deed', target: 'qilin', text: 'A giraffe is taken aboard for the Emperor' },
    ],
    renown: 150, silver: 1200,
    closing: 'The giraffe is led through Nanjing and the court declares it the qilin, a sign of heaven\u2019s favour.',
  },
  {
    n: 6, title: 'The sixth voyage', years: '1421\u20131422',
    orders: 'The envoys carried home on the last voyage are to be taken back to their courts. The Emperor is building a new capital in the north and needs the court to see the world still pays him.',
    objectives: [
      { id: 'hormuz', kind: 'accept', target: 'hormuz', text: 'Hormuz sees its envoy home' },
      { id: 'aden', kind: 'accept', target: 'aden', text: 'Aden sees its envoy home' },
      { id: 'kilwa', kind: 'accept', target: 'kilwa', text: 'The sultan of Kilwa receives the Emperor\u2019s envoy' },
    ],
    renown: 120, silver: 900,
    closing: 'The envoys are home. The court in the north is cooler to the voyages than it was; there is talk of their cost.',
  },
  {
    n: 7, title: 'The seventh voyage', years: '1431\u20131433',
    orders: 'The Xuande Emperor wishes the foreign kings reminded of the Ming. This is to be the last: you will visit every court on the old road, and the Admiral is old.',
    objectives: [
      { id: 'champa', kind: 'accept', target: 'champa', text: 'Champa' },
      { id: 'majapahit', kind: 'accept', target: 'majapahit', text: 'Java' },
      { id: 'malacca', kind: 'accept', target: 'malacca', text: 'Malacca' },
      { id: 'calicut', kind: 'accept', target: 'calicut', text: 'Calicut' },
      { id: 'hormuz', kind: 'accept', target: 'hormuz', text: 'Hormuz' },
    ],
    renown: 200, silver: 1500,
    closing: 'It is the last voyage. The Admiral is old, and the court does not send the fleet out again.',
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

/** A court that has taken the calendar sends a man to Nanjing, and the fleet carries him. */
function takeEnvoy(g: Game, polityId: string): void {
  const pol = POLITY_BY_ID.get(polityId);
  if (!pol || g.diplomacy.agreements.some((a) => a.kind === 'envoy' && a.polity === polityId && a.status === 'open')) return;
  const now = g.clock.t;
  g.diplomacy.agreements.push({
    id: g.diplomacy.nextId++, polity: polityId, kind: 'envoy',
    text: `Carry the envoy of ${pol.name} to Nanjing`, made: now, due: now + 2 * 365 * 86400, status: 'open',
  });
  startPiece(g, 'envoy', polityId, pol.seat);
  g.logEvent('contact', `An envoy of ${pol.name} comes aboard to be carried to the Emperor.`, true);
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
      takeEnvoy(g, o.target);
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

function alakeshvara(): SeaEvent {
  return {
    id: 'imperial:alakeshvara', title: 'The king of Ceylon\u2019s invitation', severity: 'warning', council: true,
    text: 'King Alakeshvara asks the Admiral to come inland to receive his answer to the Emperor. The road goes into the hills, and the country around is full of armed men. He has robbed Chinese envoys before.',
    choices: [
      {
        label: 'Refuse the road and call the fleet\u2019s soldiers to the beach',
        detail: 'You will not leave the ships. If the king means no harm, he loses face; if he does, he finds the fleet ready.',
        resolve: (g) => {
          g.imperial!.done.alakeshvara = true;
          g.adjustPolity('kotte', { respect: 0.2, trust: -0.05 }, 'the Ming fleet answered the king of Ceylon\u2019s ambush');
          return 'Alakeshvara\u2019s men came down on the fleet in the night and found it waiting. Two thousand soldiers took his capital while he was out of it, and he was brought to the ships.';
        },
      },
      {
        label: 'Go as he asks, with a guard, and see what he means',
        detail: 'It is a long risk for little. But it is the Admiral\u2019s own office to hear a king in his house.',
        resolve: (g) => {
          g.imperial!.done.alakeshvara = true;
          g.crew.morale = Math.max(0, g.crew.morale - 0.1);
          g.adjustPolity('kotte', { respect: 0.1, trust: -0.15 }, 'the Ming fleet was nearly cut off in Ceylon');
          return 'The road was shut behind you, and the fleet had to fight its way to the guard. You came back with the king as a prisoner, and fewer men than you left with.';
        },
      },
    ],
  };
}

function sekandar(): SeaEvent {
  return {
    id: 'imperial:sekandar', title: 'The usurper of Samudera', severity: 'warning', council: true,
    text: 'Sekandar, who killed the old king\u2019s heir and took the throne, has refused to receive the Emperor\u2019s envoy and sent his men to the beach. The old king\u2019s son, Sultan Zain al-Abidin, has sent word that he will join the fleet if it moves against him.',
    choices: [
      {
        label: 'Move against Sekandar with the old king\u2019s son',
        detail: 'A war of three days, ashore, with the fleet\u2019s soldiers in the front.',
        resolve: (g) => {
          g.imperial!.done.sekandar = true;
          g.adjustPolity('pasai', { trust: 0.2, respect: 0.2 }, 'the Ming fleet set the rightful sultan of Samudera on his throne');
          return 'Sekandar was taken at his own gate and the rightful sultan was seated again. He will not forget who seated him.';
        },
      },
      {
        label: 'Leave it to the sultan\u2019s son and keep the fleet aboard',
        detail: 'It is not the Emperor\u2019s quarrel. But the Emperor\u2019s envoy was insulted.',
        resolve: (g) => {
          g.imperial!.done.sekandar = true;
          g.adjustPolity('pasai', { trust: 0.05, respect: -0.1 }, 'the Ming fleet stood by at Samudera');
          return 'The sultan\u2019s son was left to finish it alone, and did, after a hard month. The Emperor will hear of the fleet that stood by.';
        },
      },
    ],
  };
}

function qilin(): SeaEvent {
  return {
    id: 'imperial:qilin', title: 'The sultan\u2019s giraffe', severity: 'note', council: true,
    text: 'The sultan of Melinde has a giraffe, a beast his people call by a name your interpreter renders as "the long-necked one". He would send it to the Emperor, who is said to collect such things.',
    choices: [
      {
        label: 'Take it aboard, with the sultan\u2019s thanks',
        detail: 'A long voyage with a beast that stands taller than a deck beam, and a cargo bay that has to be built for it.',
        resolve: (g) => {
          g.imperial!.done.qilin = true;
          g.adjustPolity('malindi', { trust: 0.1, respect: 0.05 }, 'the Ming fleet took the sultan\u2019s giraffe for the Emperor');
          return 'The giraffe was led up the plank on a cord, and stood on the main hatch for the whole of the voyage with the carpenters trying to give it a roof.';
        },
      },
      {
        label: 'Decline: the fleet has no room for such a beast',
        detail: 'The Emperor will not be told what the sultan offered.',
        resolve: () => 'The sultan was not offended, only a little disappointed. The giraffe went back to its pen.',
      },
    ],
  };
}

export function imperialArrival(g: Game, portId: string): void {
  const s = g.imperial;
  if (!s) return;
  if (s.voyage === 1 && portId === 'palembang' && !s.done.chen_zuyi) g.queueScene(chenZuyi());
  if (s.voyage === 3 && portId === 'galle' && !s.done.alakeshvara) g.queueScene(alakeshvara());
  if (s.voyage === 4 && portId === 'pasai' && !s.done.sekandar) g.queueScene(sekandar());
  if (s.voyage === 5 && portId === 'melinde' && !s.done.qilin) g.queueScene(qilin());
}
