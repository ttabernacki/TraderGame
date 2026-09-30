import { POLITY_BY_ID } from '../diplomacy/polities';
import { NM, clamp, haversine, type LatLon } from '../core/math';
import type { SeaEvent, SeaChoice } from '../game/seaEvents';
import type { Game } from '../game/state';
import { prevailingWind } from '../world/wind';
import { currentAt } from '../world/currents';
import { anchorageOf, portDef } from '../world/ports';
import { setQuestPriceMods } from '../world/portCharacter';
import { skill } from '../crew/skills';

/**
 * The long stories.
 *
 * Commissions from the Crown are the career's spine and charters are its
 * bread, but neither is a *story*: they are errands with a figure at the end.
 * These are five threads that run across a whole career, each picked up at a
 * port the ship reaches anyway in its first few voyages, each made of beats
 * that happen at particular places — a market, a headland, a court — and each
 * ending in something that changes the rest of the game: a title, a coast's
 * worth of knowledge, an ally, an enemy.
 *
 * A quest is a list of steps. A step says where it happens (a port, or a
 * stretch of sea, or simply "after enough time"), what the journal says the
 * captain should be doing, where the chart should mark it, and the scene that
 * plays when he gets there. The scene's choices move the quest on.
 */

export type QuestId = 'caravel' | 'leak' | 'kongo' | 'prester' | 'zamorin' | 'galeao'
  | 'nome' | 'ficheiro' | 'roteiro' | 'escudeiro'
  | 'adrift' | 'pesos' | 'padrao' | 'mercador' | 'monsoon' | 'aprendiz' | 'sofala' | 'count' | 'feitorcal' | 'mappila' | 'malay' | 'pepperrace' | 'feverfleet' | 'kingsoffer';

export interface QuestState {
  id: QuestId;
  step: string;
  /** When the current step began. */
  stepT: number;
  /** The current step's scene has been put and not yet answered. */
  fired: boolean;
  flags: Record<string, number | string | boolean>;
  started: number;
  journal: { t: number; text: string }[];
  /** Set when the thread is finished, one way or another. */
  outcome?: string;
}

export interface QuestMarker { lat: number; lon: number; nm: number; label: string }

interface Step {
  /** What the captain is to do, for the journal. */
  goal: (g: Game, q: QuestState) => string;
  /** Where on the chart. */
  marker?: (g: Game, q: QuestState) => QuestMarker | null;
  /** Whether the scene happens now. `port` is where she is docked, if anywhere. */
  when: (g: Game, q: QuestState, port: string | null) => boolean;
  scene: (g: Game, q: QuestState) => SeaEvent;
}

export interface QuestDef {
  id: QuestId;
  title: string;
  /** One line for the journal and the offer card. */
  blurb: string;
  /** Ports where the thread can be picked up. */
  offeredAt: string[];
  available: (g: Game) => boolean;
  /** Who is asking, and what for — the offer card in the town. */
  offer: (g: Game) => { who: string; text: string; accept: string };
  first: string;
  steps: Record<string, Step>;
}

// ---------------------------------------------------------------------------
// Helpers the scenes share

const DAY = 86400;

function go(g: Game, q: QuestState, next: string, line: string): string {
  q.step = next;
  q.stepT = g.clock.t;
  q.fired = false;
  q.journal.push({ t: g.clock.t, text: line });
  g.pushAlert(`${QUESTS[q.id].title}: ${firstSentence(line)}`, 'note');
  return line;
}

/** What the purse and the renown stood at when the scene now being answered was put. */
let snap = { gold: 0, standing: 0 };

/** "+120 cruzados, +25 renown" for what the last scene changed, or an empty string. */
function whatChanged(g: Game): string {
  const parts: string[] = [];
  const gold = Math.round(g.crown.gold - snap.gold);
  const st = Math.round(g.crown.lifetimeStanding - snap.standing);
  if (gold) parts.push(`${gold > 0 ? '+' : '\u2212'}${Math.abs(gold)} cruzados`);
  if (st) parts.push(`${st > 0 ? '+' : '\u2212'}${Math.abs(st)} renown`);
  return parts.join(', ');
}

function end(g: Game, q: QuestState, outcome: string, line: string): string {
  q.outcome = outcome;
  q.fired = false;
  const change = whatChanged(g);
  q.journal.push({ t: g.clock.t, text: change ? `${line} (${change})` : line });
  g.logEvent('crown', `${QUESTS[q.id].title} — ${line}`, true);
  g.pushAlert(`${QUESTS[q.id].title} is finished${change ? `: ${change}` : ''}.`, 'note');
  refreshQuestPrices(g);
  return line;
}

/** Leave the step where it is, to be put again next time. */
function later(q: QuestState, line: string): string {
  q.fired = false;
  return line;
}

function firstSentence(s: string): string {
  const i = s.search(/[.!?](\s|$)/);
  return i > 0 ? s.slice(0, i + 1) : s;
}

function renown(g: Game, n: number): void {
  g.crown.standing += n;
  g.crown.lifetimeStanding += n;
}

function hasOfficer(g: Game, role: string): string | null {
  const o = g.crew.officers.find((x) => x.alive && !x.ashoreAt && x.role === role);
  return o ? o.name : null;
}

function near(g: Game, at: LatLon, nm: number): boolean {
  return haversine(g.ship.state.pos, at) / NM <= nm;
}

function scene(
  q: QuestState, step: string, title: string, text: string, choices: SeaChoice[],
  severity: SeaEvent['severity'] = 'note',
): SeaEvent {
  return { id: `quest:${q.id}:${step}`, title, text, severity, choices, council: false };
}

function portMark(id: string, label: string, nm = 25): QuestMarker {
  const a = anchorageOf(portDef(id));
  return { lat: a.lat, lon: a.lon, nm, label };
}

/**
 * Fill the book with a region's winds and currents, month by month — what a
 * pilot who had sailed it for years would have written down.
 */
export function writeTheSea(g: Game, lat0: number, lat1: number, lon0: number, lon1: number): number {
  let squares = 0;
  for (let lat = lat0; lat < lat1; lat += 5) {
    for (let lon = lon0; lon < lon1; lon += 5) {
      const p = { lat: lat + 2.5, lon: lon + 2.5 };
      for (let m = 1; m <= 12; m++) {
        const doy = Math.round((m - 0.5) * 30.4);
        const w = prevailingWind(p, doy, 0);
        const c = currentAt(p, doy);
        g.rutter.observeSea(p, m, w.from, w.speed, c.toward, c.knots, 40);
      }
      squares++;
    }
  }
  return squares;
}

// ---------------------------------------------------------------------------
// 1. The Lost Caravel

/** Where the São Brás's people cut their cross, near Cabo Frio. */
const CROSS: LatLon = { lat: -18.45, lon: 11.95 };
/** And where the last of them is living. */
const CASTAWAY = 'angra-pequena';

const caravel: QuestDef = {
  id: 'caravel',
  title: 'The Lost Caravel',
  blurb: 'Find what became of the São Brás, lost south of the Congo three years ago.',
  // And at the Congo itself, on the way south: the quay at Mpinda has heard of
  // her too, and a captain past Mpinda should not have to sail home to be asked.
  offeredAt: ['funchal', 'lagos', 'lisboa', 'mpinda'],
  // Lost south of the Congo, so it is heard of once the Congo is: the
  // second act. Offered in the first it sent a new captain past three acts.
  available: (g) => g.chronicle.act >= 2,
  offer: (g) => g.dockedAt === 'mpinda' ? {
    who: 'A degredado who has lived at Mpinda since Cão’s time',
    text: 'He has a letter, and he has been keeping it for a captain who would look. It is from '
      + 'Soeiro da Costa, master of the caravel São Brás, who passed here three years ago bound '
      + 'south and did not come back. His wife is waiting for word in Funchal, or Lagos, or Lisbon. '
      + '"They say he is dead," the degredado says. "The market at Benguela knows more than '
      + 'anyone will say to a Portuguese face."',
    accept: 'Take Soeiro da Costa’s letter, and promise to look',
  } : ({
    who: 'Isabel da Costa, on the quay',
    text: 'A woman in mourning black has been waiting for any captain bound south. Her husband, '
      + 'Soeiro da Costa, took the caravel São Brás past the Congo three years ago and never came '
      + 'back. "Everybody says they are dead. Nobody has looked." She has a hundred and fifty '
      + 'cruzados, which is everything, and a letter from him written at São Jorge da Mina.',
    accept: 'Take her letter, and promise to look',
  }),
  first: 'market',
  steps: {
    market: {
      goal: () => 'Ask after the São Brás on the coast south of the Congo. A market town is where '
        + 'a wreck’s goods would turn up — Benguela, or Luanda.',
      marker: () => ({ ...portMark('benguela', 'Ask at Benguela', 120) }),
      when: (_g, _q, port) => port === 'benguela' || port === 'luanda',
      scene: (g, q) => scene(q, 'market', 'A bell in the market',
        'Among the salt and the palm cloth on the beach there is a ship’s bell — bronze, green '
        + 'with the sea, and cast on it in Portuguese letters: S. BRAS 1477.\n\n'
        + 'The trader who has it will not say where it came from, and the people gathering to '
        + 'watch have gone very quiet.',
        [
          {
            label: 'Buy the bell, and ask gently',
            detail: 'Twenty cruzados and patience.',
            resolve: (gg) => {
              gg.crown.gold = Math.max(0, gg.crown.gold - 20);
              gg.chart.addPlace('Cross of the São Brás?', 'cape', CROSS, gg.clock.t);
              return go(gg, q, 'cross',
                'Bought the São Brás’s bell. The trader, once paid, says it came up the coast '
                + 'from the south in a canoe, from where "the white men cut a tree into a cross '
                + 'on the point below the red cliffs." Somewhere near Cabo Frio.');
            },
          },
          {
            label: 'Have the interpreter question him',
            detail: hasOfficer(g, 'lingua') ? 'Your língua speaks enough of the coast tongues.'
              : 'Nobody aboard speaks the language. It may go badly.',
            resolve: (gg) => {
              if (!hasOfficer(gg, 'lingua') && gg.rng.chance(0.5)) {
                return later(q, 'The questions went badly and the trader packed up his goods and '
                  + 'went. Somebody else here knows. Come back another day.');
              }
              gg.chart.addPlace('Cross of the São Brás?', 'cape', CROSS, gg.clock.t);
              return go(gg, q, 'cross',
                'The trader talks, once he understands nobody means to take the bell by force. '
                + 'White men came ashore south of here, far south, where the red cliffs are, and '
                + 'cut a cross on the point. Some of them walked on south along the shore.');
            },
          },
        ]),
    },
    cross: {
      goal: () => 'Find the cross the São Brás’s people cut, on a point below red cliffs near '
        + 'Cabo Frio. It will only be seen from close in.',
      marker: () => ({ lat: CROSS.lat, lon: CROSS.lon, nm: 60, label: 'The cross, somewhere here' }),
      when: (g) => near(g, CROSS, 14) && g.sounding.shoreDistNm < 6,
      scene: (_g, q) => scene(q, 'cross', 'A cross on the point',
        'There — on the bluff above the surf, grey against the red rock: two baulks of ship’s '
        + 'timber lashed and pegged into a cross, taller than a man.\n\n'
        + 'The boat goes in. Cut into the upright with a knife, a long time ago:\n'
        + '"S. BRAS PERDIDA AQUI · AGOSTO 1479 · XI VIVOS · IMOS AO SUL."\n'
        + 'Lost here. Eleven alive. We are going south.',
        [
          {
            label: 'Follow them south along the coast',
            detail: 'Eleven men walking a desert shore. Somebody on this coast will know.',
            resolve: (gg) => {
              renown(gg, 8);
              return go(gg, q, 'castaway',
                'Found the São Brás’s cross above Cabo Frio: eleven survived the wreck in '
                + 'August 1479 and walked south. The pilot thinks of the bay the Portuguese call '
                + 'Angra Pequena, where there is water.');
            },
          },
        ], 'warning'),
    },
    castaway: {
      goal: () => 'Look for the survivors to the south — the bay of Angra Pequena, where there is water.',
      marker: () => portMark(CASTAWAY, 'Survivors?', 70),
      when: (g, _q, port) => port === CASTAWAY || near(g, anchorageOf(portDef(CASTAWAY)), 12),
      scene: (g, q) => {
        const gaspar = g.crew.officers.find((o) => o.alive && !o.ashoreAt && o.role === 'degredado');
        return scene(q, 'castaway', 'A white man among them',
          (gaspar
            ? `It is ${gaspar.name} who sees him first — a man among the herdsmen on the beach who stands `
              + 'wrong, like a sailor, and is burned darker than any of them. '
            : 'Among the herdsmen who come down to the water there is one who stands like a sailor, '
              + 'burned darker than any of them. ')
          + 'He calls out in Portuguese, and then stops, as if the words had surprised him.\n\n'
          + 'He is Tomé Lopes, the São Brás’s pilot, and the last of the eleven. He has a wife '
          + 'here, and a son who is two. He has also kept, through everything, a book: the winds '
          + 'and currents of every month he has watched this sea, written with a burnt stick on '
          + 'the ship’s last paper.',
          [
            {
              label: 'Bring him home to his family',
              detail: 'He goes back to Portugal. His wife here does not.',
              resolve: (gg) => {
                q.flags.tome = 'aboard';
                q.flags.book = true;
                const n = writeTheSea(gg, -45, -10, -30, 20);
                return go(gg, q, 'home',
                  `Tomé Lopes came aboard with his book and without his son. ${n} squares of the `
                  + 'South Atlantic are in our own book now, every month of the year. Isabel da '
                  + 'Costa is waiting at home.');
              },
            },
            {
              label: 'Leave him, and take his book',
              detail: 'He stays. His knowledge comes home.',
              resolve: (gg) => {
                q.flags.tome = 'stayed';
                q.flags.book = true;
                const n = writeTheSea(gg, -45, -10, -30, 20);
                return go(gg, q, 'home',
                  `Tomé stayed with his wife and son, and gave us his book. ${n} squares of the `
                  + 'South Atlantic are in ours now. Somebody has to tell Isabel da Costa her '
                  + 'husband is dead and his pilot is not.');
              },
            },
            {
              label: 'Leave him as our man on this coast',
              detail: 'He stays, speaks for you here, and knows every sounding for a hundred leagues.',
              resolve: (gg) => {
                q.flags.tome = 'agent';
                q.flags.book = true;
                const at = anchorageOf(portDef(CASTAWAY));
                gg.soundedGround.push({ lat: at.lat, lon: at.lon, nm: 400, source: 'Tomé Lopes', sigmaNm: 8 });
                gg.shiftPeopleRegard(portDef(CASTAWAY).people, 0.3);
                const n = writeTheSea(gg, -45, -10, -30, 20);
                return go(gg, q, 'home',
                  `Tomé stays as our man on this coast, with his soundings for four hundred miles `
                  + `in our book and ${n} squares of the South Atlantic besides. His people here `
                  + 'will know our flag. Isabel da Costa must be told.');
              },
            },
          ], 'warning');
      },
    },
    home: {
      goal: () => 'Carry word home to Isabel da Costa — at Funchal, Lagos or Lisbon.',
      marker: () => portMark('lisboa', 'Isabel da Costa', 40),
      when: (_g, _q, port) => port === 'funchal' || port === 'lagos' || port === 'lisboa',
      scene: (_g, q) => scene(q, 'home', 'Isabel da Costa',
        q.flags.tome === 'aboard'
          ? 'She is on the quay before the anchor is down, because somebody has told her whose the '
            + 'sail is. Tomé Lopes goes down the side first, and she knows at once from his face '
            + 'that Soeiro is not behind him. She listens to all of it. Then she thanks you, and '
            + 'means it, and pays you every coin she promised.'
          : 'She has heard the ship is in. She sits very straight while you tell her — the bell, '
            + 'the cross, the eleven, and the one who is still alive and is not coming. At the end '
            + 'she puts the money on the table and will not take it back.',
        [
          {
            label: 'Take her money',
            detail: 'A hundred and fifty cruzados. It was the bargain.',
            resolve: (gg) => {
              gg.crown.gold += 150;
              renown(gg, 30);
              return end(gg, q, 'paid', 'Told Isabel da Costa what became of the São Brás. She '
                + 'paid, and her brother the sugar merchant will remember the name.');
            },
          },
          {
            label: 'Refuse it, and have a mass said',
            detail: 'The story will travel. It is worth more than the money.',
            resolve: (gg) => {
              renown(gg, 55);
              gg.crew.morale = clamp(gg.crew.morale + 0.1, 0, 1);
              return end(gg, q, 'mass', 'Refused Isabel da Costa’s money and paid for a mass '
                + 'for the São Brás. Half the waterfront came. The court heard about it.');
            },
          },
        ]),
    },
  },
};

// ---------------------------------------------------------------------------
// 2. The Leak in the Casa

/** The Mina coast, where the interlopers are waiting. */
const MINA_COAST: LatLon = { lat: 4.6, lon: -2.2 };

const leak: QuestDef = {
  id: 'leak',
  title: 'The Leak in the Casa',
  blurb: 'Somebody in Lisbon is selling the King’s charts to Castile. Find out who.',
  offeredAt: ['mina', 'arguim', 'axim'],
  available: () => true,
  offer: (g) => ({
    who: g.dockedAt === 'arguim' ? 'The factor of Arguim' : 'The captain of São Jorge da Mina',
    text: '"Three Castilian caravels on this coast since Easter, and every one of them knew '
      + 'where ours would be and when. That is not luck. Somebody in Lisbon is selling our '
      + 'charts." He wants a captain who is not known at the Casa to find out who, and to '
      + 'bring back proof rather than a story.',
    accept: 'Agree to hunt the leak',
  }),
  first: 'interloper',
  steps: {
    interloper: {
      goal: () => 'Patrol the Mina coast for a Castilian interloper and take her papers.',
      marker: () => ({ ...MINA_COAST, nm: 120, label: 'Castilian interlopers' }),
      when: (g) => !g.dockedAt && near(g, MINA_COAST, 140) && g.sounding.shoreDistNm < 80,
      scene: (g, q) => {
        const odds = clamp(0.3 + g.crew.count / 110, 0.3, 0.85);
        return scene(q, 'interloper', 'A Castilian on the Mina coast',
          'A caravel under no colours, close in with the land and trading off the beach as if she '
          + 'owned it. She sees you and makes sail — and she is not quite fast enough.',
          [
            {
              label: 'Board her',
              detail: `The men are willing. About ${Math.round(odds * 10)} chances in ten, and some of them will be hurt.`,
              resolve: (gg) => {
                if (gg.rng.chance(odds)) {
                  gg.shiftPeopleRegard('castilian', -0.2);
                  gg.crew.morale = clamp(gg.crew.morale + 0.05, 0, 1);
                  return go(gg, q, 'arguim',
                    'Took the Castilian. In her master’s chest, a copy of the Casa’s own '
                    + 'chart of the Mina coast — in a Lisbon hand, and on the back the note '
                    + '“by Arguim, as before”. The trail goes up the coast for home.');
                }
                gg.ship.condition.hull = clamp(gg.ship.condition.hull - 0.05, 0, 1);
                gg.crew.morale = clamp(gg.crew.morale - 0.08, 0, 1);
                return later(q, 'Beaten off her rail with men hurt. She got away to the westward. '
                  + 'There will be others on this coast.');
              },
            },
            {
              label: 'Chase her off without a fight',
              detail: 'The King’s coast is kept. The question is not answered.',
              resolve: () => later(q, 'Chased her off to seaward. The coast is clear and we are '
                + 'no wiser. There will be others.'),
            },
          ], 'warning');
      },
    },
    // The trail runs home along the coast — Arguim, then Lagos, then the Rua Nova
    // — so the whole thread is one passage north from Mina and nobody sails back
    // for a clue. See docs/DESIGN.md.
    arguim: {
      goal: () => 'On the way home, look at the Arguim factor’s books.',
      marker: () => portMark('arguim', 'Two ledgers'),
      when: (_g, _q, port) => port === 'arguim',
      scene: (_g, q) => scene(q, 'arguim', 'Two ledgers',
        'The factor keeps two books, which is what factors do. The second has the packets in it — '
        + 'dates, weights, and where they went next: a shipwright at Lagos, who copies more than hull '
        + 'plans, and money coming back the other way from a Flemish house in the Rua Nova. The '
        + 'seal on the packets is the Casa’s own.',
        [
          {
            label: 'Take the ledger',
            detail: 'The factor will not stop you. He will write to Lisbon on the next ship.',
            resolve: (gg) => go(gg, q, 'lagos',
              'Took the Arguim ledger. The pages went on to a shipwright at Lagos, and the money '
              + 'came from the Rua Nova.'),
          },
        ], 'warning'),
    },
    lagos: {
      goal: () => 'Make Lagos on the way up and find the shipwright who has been copying charts.',
      marker: () => portMark('lagos', 'The shipwright'),
      when: (_g, _q, port) => port === 'lagos',
      scene: (_g, q) => scene(q, 'lagos', 'The shipwright’s loft',
        'Álvaro Teles, master shipwright, is sixty and frightened. He copied the charts, yes. '
        + 'He never saw the originals: they came to him in sealed packets, and the copies went '
        + 'on to a Flemish house in Lisbon. He is very sure of the name over the door.',
        [
          {
            label: 'Let him go, and follow the copies to the Rua Nova',
            detail: 'He is a small man in a large business.',
            resolve: (gg) => go(gg, q, 'ruanova',
              'Teles talked. The copies went to Jan Bernaerts, in the Rua Nova dos Mercadores.'),
          },
          {
            label: 'Take his confession in writing',
            detail: 'Proof, signed. He will hang for it if it is ever read.',
            resolve: (gg) => {
              q.flags.confession = true;
              return go(gg, q, 'ruanova',
                'Teles signed a confession. The copies went to Jan Bernaerts, in the Rua Nova.');
            },
          },
        ]),
    },
    ruanova: {
      goal: () => 'In Lisbon, find the Flemish house in the Rua Nova and get the name from it.',
      marker: () => portMark('lisboa', 'The Rua Nova'),
      when: (_g, _q, port) => port === 'lisboa',
      scene: (g, q) => {
        const who = g.casa.pact ? 'Aires Tinoco' : 'Brás Leitão, Tinoco’s own clerk';
        q.flags.culprit = who;
        const name = (gg: Game) => go(gg, q, 'reckoning',
          `Bernaerts gave a name, with the Arguim ledger and Teles’s pages to bear it out: ${who}.`
          + (gg.casa.pact ? ' Three lines above the entry for the charts, in the same hand, is the '
            + 'arrangement you made with him.' : ''));
        return scene(q, 'ruanova', 'The Flemish house',
          'A narrow counting room over a warehouse in the Rua Nova dos Mercadores. The merchant, '
          + 'Jan Bernaerts, looks at the copies and the ledger for a long time and then says he has '
          + 'never seen them.\n\nHe is lying, and he knows you know.',
          [
            {
              label: 'Pay him for the name',
              detail: 'Sixty cruzados.',
              resolve: (gg) => {
                if (gg.crown.gold < 60) return later(q, 'Not enough in the purse to make it worth his while.');
                gg.crown.gold -= 60;
                return name(gg);
              },
            },
            {
              label: 'Threaten him with the King',
              detail: g.crown.lifetimeStanding >= 60
                ? 'You have the standing to make it stick.'
                : 'You are not important enough yet. He may laugh.',
              resolve: (gg) => {
                if (gg.crown.lifetimeStanding < 60) {
                  return later(q, 'Bernaerts laughed, politely. Come back when your name means something at court.');
                }
                return name(gg);
              },
            },
          ]);
      },
    },
    reckoning: {
      goal: (_g, q) => `Decide in Lisbon what to do about ${q.flags.culprit ?? 'the Casa'}.`,
      marker: () => portMark('lisboa', 'The reckoning'),
      when: (_g, _q, port) => port === 'lisboa',
      scene: (_g, q) => scene(q, 'reckoning', 'What to do with it',
        `The ledger, the chart${q.flags.confession ? ', Teles’s confession' : ''} and a name: `
        + `${q.flags.culprit}. Three ways to use it, and none of them clean.`,
        [
          {
            label: 'Lay it before the King',
            detail: 'The Casa is broken open. The houses that did business with it will not forget.',
            resolve: (gg) => {
              gg.casa.broke = true;
              gg.casa.pact = false;
              gg.casa.pactFee = 0;
              gg.casa.regard = -0.6;
              for (const id of Object.keys(gg.finance.credit) as (keyof typeof gg.finance.credit)[]) {
                gg.finance.credit[id] = Math.max(0, gg.finance.credit[id] - 15);
              }
              renown(gg, 90);
              gg.crown.gold += 120;
              return end(gg, q, 'exposed', `Laid the evidence before the King. ${q.flags.culprit} `
                + 'is in the Limoeiro prison and the Casa has new clerks. The Rua Nova is colder.');
            },
          },
          {
            label: 'Take the ring over',
            detail: 'Keep the name to yourself and the trade for yourself. Very profitable.',
            resolve: (gg) => {
              gg.casa.pact = true;
              gg.casa.regard = 0.8;
              gg.casa.patron = true;
              gg.casa.pactFee = 0;
              gg.crown.gold += 300;
              return end(gg, q, 'ring', `${q.flags.culprit} works for you now. There are three `
                + 'hundred cruzados in the first packet, and a file with your name in it.');
            },
          },
          {
            label: 'Turn the ring on Castile',
            detail: 'Keep it running, and feed them false charts that put their caravels on the Arguim banks.',
            resolve: (gg) => {
              gg.shiftPeopleRegard('castilian', -0.5);
              renown(gg, 70);
              q.flags.falseCharts = true;
              return end(gg, q, 'turned', 'The ring goes on selling charts to Castile — ours, '
                + 'with the shoals moved. Two Castilian caravels went on the Arguim banks by '
                + 'autumn. At Tordesillas the Crown will have the better maps.');
            },
          },
        ], 'warning'),
    },
  },
};

/** The King's gift for Kongo comes down to the quay with the envoys and is stowed, not left for the captain to hunt for. */
function stowTools(g: Game): string {
  const short = 20 - g.ship.quantityOf('ferramenta');
  if (short <= 0) return 'The King’s iron tools are already in the hold.';
  const took = g.ship.addCargo('ferramenta', short, 0, 0.6);
  return took >= short
    ? 'Twenty quintals of iron tools came down to the quay with them and are stowed in our hold.'
    : 'The King’s iron tools came down to the quay, and there was not room for all of them: find '
      + 'stowage before Mpinda.';
}

// ---------------------------------------------------------------------------
// 3. The Manikongo's Embassy

const kongo: QuestDef = {
  id: 'kongo',
  title: 'The Manikongo’s Embassy',
  blurb: 'Carry the King of Kongo’s envoys to Lisbon, and what comes back.',
  offeredAt: ['mpinda'],
  available: (g) => g.relationsFor('mpinda').met,
  offer: () => ({
    who: 'The Mani Soyo, lord of the river mouth',
    text: 'The Manikongo, Nzinga a Nkuwu, wishes to send four men of his house to the King of '
      + 'Portugal — to see his country, to learn his letters, and to come back. The Mani Soyo '
      + 'asks if your ship will carry them. He is very plain that if they do not come back, '
      + 'nobody from Portugal will be welcome on this river again.',
    accept: 'Carry the envoys to Lisbon',
  }),
  first: 'passage',
  steps: {
    passage: {
      goal: () => 'Carry the four envoys to Lisbon, and keep them alive.',
      marker: () => portMark('lisboa', 'Lisbon', 40),
      when: (g, q) => !g.dockedAt && g.clock.t - q.stepT > 12 * DAY && g.ship.state.pos.lat > 8,
      scene: (g, q) => {
        q.flags.envoys = q.flags.envoys ?? 4;
        const dinis = hasOfficer(g, 'cirurgiao');
        const anselmo = hasOfficer(g, 'capelao');
        return scene(q, 'passage', 'The envoys are sickening',
          'The cold has come down on them north of Cabo Verde, and two of the four are shivering '
          + 'in the great cabin with a fever.'
          + (dinis ? ` ${dinis} wants them fed on the last of the fresh food and kept by the galley fire.` : '')
          + (anselmo ? ` ${anselmo} wants them baptised before they die, and says so in front of them.` : ''),
          [
            {
              label: 'The surgeon’s way: food and warmth',
              detail: 'Ten days of fresh provisions, and the crew eat salt.',
              resolve: (gg) => {
                gg.crew.provisions.fresh = Math.max(0, gg.crew.provisions.fresh - 10);
                q.flags.envoys = dinis ? 4 : 3;
                return go(gg, q, 'court', dinis
                  ? 'The envoys pulled through on the fresh food and the galley fire. All four will see Lisbon.'
                  : 'Three of the envoys pulled through. The youngest died off the Canaries.');
              },
            },
            {
              label: 'The chaplain’s way: prayer',
              detail: 'The men approve. The envoys do not understand a word.',
              resolve: (gg) => {
                gg.crew.morale = clamp(gg.crew.morale + 0.05, 0, 1);
                q.flags.envoys = 2;
                return go(gg, q, 'court', 'Two of the envoys died before Madeira, baptised. The '
                  + 'other two will not speak to the chaplain.');
              },
            },
          ], 'warning');
      },
    },
    court: {
      goal: () => 'Present the envoys at court in Lisbon.',
      marker: () => portMark('lisboa', 'The court'),
      when: (_g, _q, port) => port === 'lisboa',
      scene: (g, q) => scene(q, 'court', 'The envoys at court',
        `${q.flags.envoys} men of the house of Kongo, in borrowed Portuguese clothes, before the `
        + 'King of Portugal. The whole court is watching you, because you are the one who has to '
        + 'say what they are.',
        [
          {
            label: 'Present them as a king’s ambassadors',
            detail: 'Equals, from a Christian king to be.',
            resolve: (gg) => {
              q.flags.court = 'ambassadors';
              renown(gg, 20 + Number(q.flags.envoys) * 8);
              gg.adjustPolity('kongo', { trust: 0.2, respect: 0.1 }, 'their envoys were received in Lisbon as ambassadors');
              return go(gg, q, 'gifts', 'The King received the Kongo envoys as ambassadors, and '
                + `is sending masons, priests and tools back with them. ${stowTools(gg)}`);
            },
          },
          {
            label: 'Let them speak for themselves',
            detail: hasOfficer(g, 'lingua') ? 'Your língua can put their words into Portuguese.'
              : 'Nobody can translate. It will be halting.',
            resolve: (gg) => {
              const good = !!hasOfficer(gg, 'lingua');
              q.flags.court = good ? 'spoke' : 'halting';
              renown(gg, good ? 45 : 15);
              gg.adjustPolity('kongo', { trust: good ? 0.25 : 0.1, respect: 0.05 }, 'their envoys spoke before the King of Portugal');
              return go(gg, q, 'gifts', good
                ? 'The eldest envoy spoke to the King through our língua for half an hour, and the '
                  + `court was silent. The King is sending masons, priests and tools. ${stowTools(gg)}`
                : 'The envoys spoke, badly translated. The King is courteous and is sending tools '
                  + `back with them. ${stowTools(gg)}`);
            },
          },
          {
            label: 'Show them as a curiosity',
            detail: 'The court will pay to see them. Kongo will hear of it.',
            resolve: (gg) => {
              q.flags.court = 'curiosity';
              gg.crown.gold += 120;
              gg.shiftPeopleRegard('kongo', -0.35);
              gg.adjustPolity('kongo', { respect: -0.2 }, 'their envoys were shown in Lisbon as a curiosity');
              return go(gg, q, 'gifts', 'The court paid well to see the Kongo envoys. They know '
                + `exactly what was done. The King still sends tools back. ${stowTools(gg)}`);
            },
          },
        ]),
    },
    gifts: {
      goal: () => 'Carry the envoys home to Mpinda with the King’s gift: 20 quintals of iron tools.',
      marker: () => portMark('mpinda', 'Home to Kongo'),
      when: (_g, _q, port) => port === 'mpinda',
      scene: (g, q) => {
        const have = g.ship.quantityOf('ferramenta');
        return scene(q, 'gifts', 'Home to Kongo',
          have >= 20
            ? `The envoys go ashore to drums, and behind them the King of Portugal’s tools. The `
              + 'Mani Soyo embraces you in front of everyone.'
            : `The envoys are home, and the Mani Soyo asks, pleasantly, where the King of `
              + `Portugal’s gifts are. There are ${have.toFixed(0)} quintals of tools aboard, not twenty.`,
          have >= 20
            ? [{
              label: 'Land the gifts',
              detail: 'Twenty quintals of iron tools.',
              resolve: (gg) => {
                gg.ship.removeCargo('ferramenta', 20);
                gg.shiftPeopleRegard('kongo', q.flags.court === 'curiosity' ? 0.2 : 0.45);
                renown(gg, 40);
                return go(gg, q, 'succession', 'The envoys and the King’s gifts are home. Kongo '
                  + 'is open to us, and the old Manikongo is failing fast.');
              },
            }]
            : [{
              label: 'Promise to come back with them',
              detail: 'Buy iron tools at a Portuguese port and return.',
              resolve: () => later(q, 'Promised the Mani Soyo the tools on the next voyage. He '
                + 'smiled, which was worse than if he had not.'),
            }]);
      },
    },
    succession: {
      goal: () => 'At Mpinda: the old Manikongo is dying, and the capital is choosing.',
      marker: () => portMark('mpinda', 'The succession'),
      when: (_g, _q, port) => port === 'mpinda',
      scene: (_g, q) => scene(q, 'succession', 'Two sons',
        'Nzinga a Nkuwu is dead — he died in the week the ships were being unloaded, and the '
        + 'envoys’ homecoming was the last public thing he did. His son Mvemba a Nzinga, baptised Afonso, holds the capital with '
        + 'the priests and the Portuguese behind him. His brother Mpanzu a Kitima holds the old '
        + 'ways and most of the army. Both have sent men to your ship.',
        [
          {
            label: 'Back Afonso, the Christian',
            detail: 'Lisbon wants this. It will be bloody.',
            resolve: (gg) => {
              q.flags.backed = 'afonso';
              gg.shiftPeopleRegard('kongo', 0.2);
              renown(gg, 60);
              return go(gg, q, 'letter', 'Backed Afonso with our arquebuses at the battle for the '
                + 'capital. He is king. He will not forget, and neither will his brother’s people.');
            },
          },
          {
            label: 'Back Mpanzu, the old ways',
            detail: 'The army is his. Lisbon will be furious.',
            resolve: (gg) => {
              q.flags.backed = 'mpanzu';
              renown(gg, -30);
              return go(gg, q, 'letter', 'Backed Mpanzu. He took the capital and burned the new '
                + 'church. He trades with us, on his terms, and the Casa has written your name down.');
            },
          },
          {
            label: 'Stay out of it, and offer to broker a peace',
            detail: 'Hard, and it may fail. It might also be the best thing anybody does here.',
            resolve: (gg) => {
              const ok = gg.rng.chance(hasOfficer(gg, 'lingua') ? 0.6 : 0.35);
              q.flags.backed = ok ? 'peace' : 'afonso';
              gg.shiftPeopleRegard('kongo', ok ? 0.4 : 0);
              renown(gg, ok ? 80 : 20);
              return go(gg, q, 'letter', ok
                ? 'The brothers met on our deck, under our flag, and divided the kingdom. It will not last forever. It will last.'
                : 'The peace failed. Afonso won the battle without us, and remembers that we did not come.');
            },
          },
        ], 'grave'),
    },
    // The king's letter is written to Lisbon, so it is answered in Lisbon: the
    // last beat waits at the Casa for the voyage home, not at the far end of the
    // river for a second trip.
    letter: {
      goal: () => 'Word from the king of Kongo is waiting at the Casa. Take it to the King in Lisbon.',
      marker: () => portMark('lisboa', 'The king’s letter'),
      when: (g, q, port) => port === 'lisboa' && g.clock.t - q.stepT > 45 * DAY,
      scene: (_g, q) => scene(q, 'letter', 'The king’s letter',
        'The letter from Kongo has come up the coast by a São Tomé ship and is waiting at the Casa '
        + 'with your name on it. Portuguese traders on the coast are buying the king’s people — his '
        + 'subjects, his nobles’ own sons — and carrying them to São Tomé. He asks that it stop. '
        + 'He asks you, who brought his envoys home, to carry the request to the King of Portugal '
        + 'and press it.\n\n'
        + 'It would cost a great deal: the São Tomé men are rich and well-connected in Lisbon.',
        [
          {
            label: 'Carry his request to the King and press it',
            detail: 'Turn the São Tomé traders away from the Kongo river. Enemies at the Casa; a king’s trust.',
            resolve: (gg) => {
              gg.shiftPeopleRegard('kongo', 0.4);
              gg.casa.regard = clamp(gg.casa.regard - 0.3, -1, 1);
              renown(gg, 60);
              q.flags.enforced = true;
              return end(gg, q, 'enforced', 'Pressed the king of Kongo’s request at court and got the '
                + 'São Tomé traders turned off his river. The Casa is furious. Kongo trades with us alone.');
            },
          },
          {
            label: 'Say it is not your business',
            detail: 'The trade goes on. So does yours.',
            resolve: (gg) => {
              gg.shiftPeopleRegard('kongo', -0.4);
              gg.crown.gold += 100;
              return end(gg, q, 'lookedaway', 'Said it was not our business. The São Tomé men '
                + 'sent a present. The king did not look at us again.');
            },
          },
        ], 'grave'),
    },
  },
};

// ---------------------------------------------------------------------------
// 4. The Letter to Prester John

const ETHIOPIA: LatLon = { lat: 9.0, lon: 39.5 };

const prester: QuestDef = {
  id: 'prester',
  title: 'The Letter to Prester John',
  blurb: 'Carry the King’s letter toward the Christian king of the Indies.',
  offeredAt: ['lisboa'],
  // The King sent Covilhã east in 1487, the year Dias sailed: the Cape act.
  available: (g) => g.chronicle.act >= 3 && g.crown.lifetimeStanding >= 60,
  offer: () => ({
    who: 'The King, in private audience',
    text: 'João II gives you a letter in Latin and in the tongue of the Abyssinians, sealed with '
      + 'his own seal. It is addressed to the Christian king the Europeans call Prester John. '
      + 'Somewhere beyond Africa there is a Christian kingdom that trades with the Indies; the '
      + 'King wants it found, and the sea road to it. He wants you to carry an envoy as far as '
      + 'the sea will take him.',
    accept: 'Take the King’s letter',
  }),
  first: 'envoy',
  steps: {
    envoy: {
      goal: () => 'Choose the envoy who will carry the letter.',
      // At Lisbon, or wherever the King's letter finds the captain: the two men
      // come out with it.
      when: (_g, _q, port) => port !== null,
      scene: (_g, q) => scene(q, 'envoy', 'Two envoys',
        'The King has put two men at your disposal, and leaves the choice to you.\n\n'
        + 'Afonso de Paiva is a converso from Castelo Branco who speaks Arabic like a Moor and '
        + 'has been to Fez. He is clever and nobody quite trusts him.\n\n'
        + 'Frei Lucas is a monk of the Abyssinian church, found in Jerusalem. He speaks the '
        + 'tongue of the letter. He has never been to sea and it shows.',
        [
          {
            label: 'Take Afonso de Paiva',
            detail: 'Arabic opens the Swahili coast.',
            resolve: (gg) => { q.flags.envoy = 'afonso'; return go(gg, q, 'inland', 'Afonso de Paiva will carry the letter. First, the Kongo river: the king there may know the way east.'); },
          },
          {
            label: 'Take Frei Lucas',
            detail: 'The Abyssinians will believe their own.',
            resolve: (gg) => { q.flags.envoy = 'lucas'; return go(gg, q, 'inland', 'Frei Lucas will carry the letter. First, the Kongo river: the king there may know the way east.'); },
          },
        ]),
    },
    inland: {
      goal: () => 'On the Kongo and Angola coast, send the envoy inland to ask the way east.',
      marker: () => portMark('mpinda', 'Ask the way east', 140),
      // Mpinda first, but the King's letter can find the captain a port or two
      // down the coast, and the envoy should not have to be carried back north.
      when: (_g, _q, port) => port === 'mpinda' || port === 'luanda' || port === 'benguela',
      scene: (_g, q) => scene(q, 'inland', 'The road inland',
        `${q.flags.envoy === 'lucas' ? 'Frei Lucas' : 'Afonso de Paiva'} can go inland with the `
        + 'coast people and ask at the Manikongo’s court, whose word runs a long way up this coast. '
        + 'It will take three weeks, and the ship must wait.',
        [
          {
            label: 'Send him, and wait',
            detail: 'Three weeks at anchor.',
            resolve: (gg) => {
              gg.waitDays(21);
              return go(gg, q, 'cape', 'The envoy came back from Mbanza Kongo with a rumour: a '
                + 'Christian king beyond the great lakes, toward the sunrise, who keeps priests '
                + 'and crosses of gold. East. Round the Cape.');
            },
          },
        ]),
    },
    cape: {
      goal: () => 'Round the Cape of Good Hope with the letter.',
      marker: () => ({ lat: -34.4, lon: 18.5, nm: 80, label: 'Round the Cape' }),
      when: (g) => g.ship.state.pos.lat < -33.5 && g.ship.state.pos.lon > 21,
      scene: (_g, q) => scene(q, 'cape', 'The letter rounds the Cape',
        'The coast has turned north-east, and the water is warm again. The envoy stands at the '
        + 'rail for a long time with the King’s letter inside his coat.',
        [{
          label: 'On up the coast',
          detail: 'Moçambique first: there is an Abyssinian pilgrim in the sultan’s prison, they say.',
          resolve: (gg) => { renown(gg, 30); return go(gg, q, 'pilgrim', 'Past the Cape with the King’s letter. At Moçambique, word of an Abyssinian in the sultan’s prison.'); },
        }]),
    },
    pilgrim: {
      goal: () => 'At Moçambique, get the Abyssinian pilgrim out of the sultan’s prison.',
      marker: () => portMark('mocambique', 'The pilgrim'),
      when: (_g, _q, port) => port === 'mocambique',
      scene: (_g, q) => scene(q, 'pilgrim', 'The pilgrim in the prison',
        'Yohannes of Axum was taken off a dhow two years ago, on his way home from Jerusalem. He '
        + 'is in chains in the sultan’s fort, and he knows the road to his king.',
        [
          {
            label: 'Buy him out',
            detail: 'Eighty cruzados to the sultan’s steward.',
            resolve: (gg) => {
              if (gg.crown.gold < 80) return later(q, 'Not enough in the purse. The steward will wait.');
              gg.crown.gold -= 80;
              q.flags.pilgrim = true;
              return go(gg, q, 'send', 'Bought Yohannes of Axum out of the sultan’s prison.');
            },
          },
          {
            label: 'Talk him out',
            detail: q.flags.envoy === 'afonso' ? 'Afonso’s Arabic, and a story.' : 'Nobody aboard can argue in Arabic.',
            resolve: (gg) => {
              if (q.flags.envoy !== 'afonso' && !gg.rng.chance(0.3)) {
                gg.shiftPeopleRegard('swahili', -0.1);
                return later(q, 'The steward did not believe a word of it. Try something else.');
              }
              q.flags.pilgrim = true;
              return go(gg, q, 'send', 'Afonso talked Yohannes out of the fort, as a Muslim merchant’s debtor. Nobody has noticed yet.');
            },
          },
          {
            label: 'Break him out at night',
            detail: 'A boat, a file, and luck. The sultan will not forgive it.',
            resolve: (gg) => {
              if (gg.rng.chance(0.6)) {
                gg.shiftPeopleRegard('swahili', -0.3);
                q.flags.pilgrim = true;
                return go(gg, q, 'send', 'Got Yohannes out of the fort by boat in the middle watch. We are not welcome at Moçambique.');
              }
              gg.crew.count = Math.max(1, gg.crew.count - 3);
              gg.shiftPeopleRegard('swahili', -0.4);
              return later(q, 'The boat was seen. Three men did not come back. Yohannes is still in chains.');
            },
          },
        ], 'warning'),
    },
    send: {
      goal: () => 'At Melinde, decide: send the envoy inland toward Prester John, or carry the pilgrim home as proof.',
      marker: () => portMark('melinde', 'The road inland'),
      when: (_g, _q, port) => port === 'melinde' || port === 'magadoxo',
      scene: (_g, q) => scene(q, 'send', 'The road to Prester John',
        'Yohannes says the road inland from here is a year’s walking, and that his king is real — '
        + 'Eskender, the Lion of Judah, with priests and churches cut out of the rock. The envoy '
        + 'could go with him. Or Yohannes could come to Lisbon and tell the King himself.',
        [
          {
            label: 'Send the envoy inland with the letter',
            detail: 'A year, perhaps longer. He may never come back. If he does, everything changes.',
            resolve: (gg) => go(gg, q, 'wait', 'The envoy and Yohannes walked inland from Melinde with the King’s letter. Come back in a year.'),
          },
          {
            label: 'Carry Yohannes to Lisbon as proof',
            detail: 'Certain, and smaller.',
            resolve: (gg) => go(gg, q, 'proof', 'Yohannes of Axum is aboard, bound for the King.'),
          },
        ]),
    },
    wait: {
      goal: () => 'Return to Melinde after a year for word of the envoy.',
      marker: () => ({ ...ETHIOPIA, nm: 300, label: 'Prester John' }),
      when: (g, q, port) => (port === 'melinde' || port === 'magadoxo' || port === 'lisboa')
        && g.clock.t - q.stepT > 300 * DAY,
      scene: (g, q) => {
        const ok = g.rng.chance(q.flags.envoy === 'lucas' ? 0.75 : 0.55);
        q.flags.returned = ok;
        return scene(q, 'wait', ok ? 'A letter from Prester John' : 'No word',
          ok
            ? 'A letter, in the tongue of the Abyssinians, sealed with a lion: the Negus Eskender '
              + 'greets the King of Portugal as a brother in Christ and offers friendship against '
              + 'the Moors of the Red Sea. The envoy stays at his court.'
            : 'A trader from the interior brings word that two foreigners were seen on the road to '
              + 'the lakes last year, and not since. The King’s letter is somewhere in Africa.',
          [{
            label: ok ? 'Carry the Negus’s letter to Lisbon' : 'Go home without it',
            detail: ok ? 'The greatest thing any captain has brought home.' : 'You tried.',
            resolve: (gg) => {
              if (ok) {
                renown(gg, 260);
                gg.crown.gold += 400;
                return end(gg, q, 'found', 'Carried the letter of the Negus of Ethiopia to Lisbon. '
                  + 'The King wept. Ethiopia is an ally against the Moors of the Red Sea.');
              }
              renown(gg, 60);
              return end(gg, q, 'lost', 'The envoy and the letter were lost in the interior. The King '
                + 'has the road, at least, and knows who tried.');
            },
          }], ok ? 'note' : 'warning');
      },
    },
    proof: {
      goal: () => 'Bring Yohannes of Axum to the King in Lisbon.',
      marker: () => portMark('lisboa', 'The King'),
      when: (_g, _q, port) => port === 'lisboa',
      scene: (_g, q) => scene(q, 'proof', 'Yohannes before the King',
        'The pilgrim tells the King about the churches cut from the rock, the priests, the Negus. '
        + 'The King asks him everything, for three days.',
        [{
          label: 'Leave him with the King',
          detail: 'The road to Prester John is known.',
          resolve: (gg) => {
            renown(gg, 170);
            gg.crown.gold += 200;
            return end(gg, q, 'proof', 'Brought Yohannes of Axum to the King. The road to Prester John is known at last.');
          },
        }]),
    },
  },
};

// ---------------------------------------------------------------------------
// 5. The Zamorin's Pepper

const zamorin: QuestDef = {
  id: 'zamorin',
  title: 'The Zamorin’s Pepper',
  blurb: 'Open the pepper trade of Calecute, and bring the first great cargo home.',
  offeredAt: ['calecute', 'melinde'],
  available: () => true,
  offer: (g) => ({
    who: g.dockedAt === 'melinde' ? 'The sultan’s Gujarati pilot' : 'A Tunisian merchant on the beach',
    text: g.dockedAt === 'melinde'
      ? '"Calecute," the pilot says. "All the pepper of Malabar goes through the Zamorin’s '
        + 'hands. He is proud and the Moors own his ear. Go there with the wrong gifts and '
        + 'you will be laughed off the beach."'
      : '"Portuguese! By the devil, what brought you here?" A merchant from Tunis who speaks '
        + 'Castilian offers to take you to the Zamorin’s palace. The pepper is here. So are '
        + 'the Moors who own it.',
    accept: 'Seek the Zamorin',
  }),
  first: 'audience',
  steps: {
    audience: {
      goal: () => 'Go to Calecute and win an audience with the Zamorin.',
      marker: () => portMark('calecute', 'The Zamorin'),
      when: (_g, _q, port) => port === 'calecute',
      scene: (g, q) => {
        const coral = g.ship.quantityOf('coral');
        const gold = g.ship.quantityOf('ouro');
        return scene(q, 'audience', 'The Zamorin of Calecute',
          'The Zamorin receives you lying on a green velvet couch, chewing betel, in a hall full of '
          + 'courtiers who have seen the ambassadors of Cairo and China. What you have brought him '
          + 'will decide everything.',
          [
            ...(coral >= 5 || gold >= 5 ? [{
              label: coral >= 5 ? 'Give him coral' : 'Give him gold',
              detail: 'Five of the best in the hold. The one thing this court respects.',
              resolve: (gg: Game) => {
                if (coral >= 5) gg.ship.removeCargo('coral', 5); else gg.ship.removeCargo('ouro', 5);
                q.flags.audience = 'good';
                gg.shiftPeopleRegard(portDef('calecute').people, 0.3);
                leaveToTrade(gg, 'calicut', { trust: 0.15, respect: 0.1 }, 'the Zamorin accepted your gift');
                return go(gg, q, 'merchants', 'The Zamorin accepted our gift and gave leave to trade. '
                  + 'The Moorish merchants have already begun working against us.');
              },
            }] : []),
            {
              label: 'Give him cloth, hats and honey',
              detail: 'What was aboard. It is what da Gama gave him.',
              resolve: (gg) => {
                q.flags.audience = 'poor';
                gg.shiftPeopleRegard(portDef('calecute').people, -0.2);
                leaveToTrade(gg, 'calicut', { respect: -0.15 }, 'the court laughed at your presents');
                return go(gg, q, 'merchants', 'The court laughed at our gifts. The Zamorin gave '
                  + 'grudging leave to trade, and the Moors are delighted.');
              },
            },
            {
              label: 'Present the King of Portugal’s letter',
              detail: g.crown.lifetimeStanding >= 340 ? 'Your name carries it.' : 'Your name is not yet big enough to carry it.',
              resolve: (gg) => {
                const ok = gg.crown.lifetimeStanding >= 340;
                q.flags.audience = ok ? 'good' : 'poor';
                gg.shiftPeopleRegard(portDef('calecute').people, ok ? 0.2 : -0.1);
                leaveToTrade(gg, 'calicut', ok ? { trust: 0.1, respect: 0.15 } : { respect: -0.1 }, 'the King of Portugal\u2019s letter was read');
                return go(gg, q, 'merchants', ok
                  ? 'The Zamorin read the King’s letter with interest. Leave to trade is given.'
                  : 'The Zamorin asked who the King of Portugal was. Leave to trade, grudgingly.');
              },
            },
          ]);
      },
    },
    merchants: {
      goal: () => 'Deal with the Moorish merchants who control the pepper at Calecute.',
      marker: () => portMark('calecute', 'The pepper'),
      when: (g, q, port) => port === 'calecute' && g.clock.t - q.stepT > 3 * DAY,
      scene: (g, q) => {
        const proof = QUEST_STATE_OUTCOME(g, 'leak') === 'turned' || QUEST_STATE_OUTCOME(g, 'leak') === 'exposed';
        return scene(q, 'merchants', 'The Moors of Calecute',
          'The pepper is in the warehouses of the Mappila and Cairo merchants, and they will not '
          + 'sell to you at any price the Zamorin would call fair. They have also been telling '
          + 'him that you are pirates.',
          [
            {
              label: 'Outbid them',
              detail: 'Two hundred cruzados in the right hands.',
              resolve: (gg) => {
                if (gg.crown.gold < 200) return later(q, 'Not enough in the purse to outbid Cairo.');
                gg.crown.gold -= 200;
                return go(gg, q, 'hostages', 'Bought pepper over the Moors’ heads. They will not forgive it.');
              },
            },
            ...(proof ? [{
              label: 'Show the Zamorin their letters to Castile',
              detail: 'From the Casa affair: proof they have been dealing with your enemies.',
              resolve: (gg: Game) => {
                gg.shiftPeopleRegard(portDef('calecute').people, 0.3);
                q.flags.merchantsBroken = true;
                return go(gg, q, 'hostages', 'The Zamorin read the Moors’ letters and fined them '
                  + 'heavily. The pepper is ours at a fair price. They are desperate now.');
              },
            }] : []),
            {
              label: 'Outwait them',
              detail: 'A month at anchor, and see who breaks first.',
              resolve: (gg) => {
                gg.waitDays(30);
                return gg.rng.chance(0.55)
                  ? go(gg, q, 'hostages', 'After a month the smaller merchants broke ranks and sold.')
                  : later(q, 'A month, and nobody broke. The Moors can wait longer than we can.');
              },
            },
          ]);
      },
    },
    hostages: {
      goal: () => 'Put to sea from Calecute with the first of the pepper.',
      when: (g) => !g.dockedAt && near(g, anchorageOf(portDef('calecute')), 40),
      scene: (_g, q) => scene(q, 'hostages', 'Our factors are taken',
        'A boat comes after you from the beach: the Zamorin’s men have seized the two factors '
        + 'you left ashore with the goods, on the Moors’ word that you mean to sail without '
        + 'paying the customs.',
        [
          {
            label: 'Go back and negotiate',
            detail: 'A hundred and fifty cruzados and a week.',
            resolve: (gg) => {
              gg.crown.gold = Math.max(0, gg.crown.gold - 150);
              gg.waitDays(7);
              return go(gg, q, 'cochim', 'Paid the customs twice over and got our factors back. Cochim, to the south, is said to want friends.');
            },
          },
          {
            label: 'Take hostages of your own',
            detail: 'Five Nair gentlemen from the next boat that comes out. It worked for da Gama.',
            resolve: (gg) => {
              gg.shiftPeopleRegard(portDef('calecute').people, -0.3);
              return go(gg, q, 'cochim', 'Exchanged hostages for hostages. We have our factors. Calecute will not forget. Cochim, to the south, is said to want friends.');
            },
          },
          {
            label: 'Bombard the town',
            detail: 'Every gun into the town until they are returned. There is no coming back from this.',
            resolve: (gg) => {
              gg.shiftPeopleRegard(portDef('calecute').people, -1);
              gg.adjustPolity('calicut', { trust: -0.6, respect: 0.3 }, 'you bombarded the town');
              q.flags.war = true;
              return go(gg, q, 'cochim', 'Bombarded Calecute for a day. The factors came back in a canoe. There is war with the Zamorin now. Cochim wants an ally against him.');
            },
          },
        ], 'grave'),
    },
    cochim: {
      goal: () => 'Go to Cochim, where the raja wants an ally against the Zamorin.',
      marker: () => portMark('cochim', 'The raja of Cochim'),
      when: (_g, _q, port) => port === 'cochim',
      scene: (_g, q) => scene(q, 'cochim', 'The raja of Cochim',
        'Unni Goda Varma, raja of Cochim, pays tribute to the Zamorin and hates it. He offers you '
        + 'a factory, pepper at the old price, and his friendship — against Calecute.',
        [
          {
            label: 'Take the alliance',
            detail: 'Cochim’s pepper, and the Zamorin’s enmity.',
            resolve: (gg) => {
              q.flags.cochim = 'ally';
              gg.shiftPeopleRegard(portDef('cochim').people, 0.4);
              allyWithCochin(gg);
              return go(gg, q, 'home', 'Allied with Cochim, with ground for a factory. Now load the pepper — forty quintals at least — and sail.');
            },
          },
          {
            label: 'Broker a three-way treaty',
            detail: q.flags.war ? 'Impossible while you are at war with Calecute.' : 'Everybody trades; nobody fights. Hard.',
            resolve: (gg) => {
              if (q.flags.war || !gg.rng.chance(0.5)) {
                q.flags.cochim = 'ally';
                allyWithCochin(gg);
                return go(gg, q, 'home', 'The treaty would not hold, but Cochim is our friend, and gives ground for a factory. Load the pepper — forty quintals at least — and sail.');
              }
              q.flags.cochim = 'treaty';
              gg.shiftPeopleRegard(portDef('cochim').people, 0.3);
              gg.shiftPeopleRegard(portDef('calecute').people, 0.3);
              leaveToTrade(gg, 'cochin', { trust: 0.2 }, 'a treaty with Calecute and Cochim together');
              leaveToTrade(gg, 'calicut', { trust: 0.2 }, 'a treaty with Calecute and Cochim together');
              gg.relationsFor('cochim').factory = true;
              return go(gg, q, 'home', 'Calecute and Cochim both trade with us under one treaty, and Cochim gives ground for a factory. Load the pepper — forty quintals at least — and sail.');
            },
          },
        ]),
    },
    // The thread ends on the Malabar coast, with the pepper stowed and the
    // bows turned for home. The landing on the Tagus is the chronicle's —
    // Act V — and used to be this thread's too, on the same forty quintals,
    // so the one homecoming was told twice in a row.
    home: {
      goal: () => 'Load at least forty quintals of pepper on the Malabar coast and sail for home.',
      marker: () => portMark('cochim', 'The pepper'),
      when: (g) => !g.dockedAt && g.ship.quantityOf('pimenta') >= 40
        && (near(g, anchorageOf(portDef('cochim')), 60) || near(g, anchorageOf(portDef('calecute')), 60)),
      scene: (_g, q) => scene(q, 'home', 'The pepper is stowed',
        'The last boat comes off from the beach low in the water, and the hold smells of nothing '
        + 'but pepper. The pilots say the monsoon will carry you west within the week.',
        [{
          label: 'Turn her for home',
          detail: 'The Tagus, and the King.',
          resolve: (gg) => {
            renown(gg, 250);
            return end(gg, q, q.flags.war ? 'war' : q.flags.cochim === 'treaty' ? 'peace' : 'empire',
              q.flags.war
                ? 'The first pepper is stowed, bought with a war on the Malabar coast that will last a century.'
                : q.flags.cochim === 'treaty'
                  ? 'The first pepper is stowed, and every port on the Malabar coast trades under our treaty.'
                  : 'The first pepper is stowed. Cochim is ours, and the Zamorin waits.');
          },
        }]),
    },
  },
};


// ---------------------------------------------------------------------------
// 6. The Biscayan's Ship — a secret thread
//
// Never on any quay's list until the captain has heard the talk in Lisbon (see
// Game.enterPort, `secretsHeard`), and even then only at Las Palmas. It is a
// tree rather than a line: the same prize — a Biscayan shipwright's
// experimental galleon, forty years ahead of its time — is reached by buying
// his drawings, by bringing the man himself over to Portugal, or by cutting
// the ship out from under Castile's nose. Each costs something different.

/** Where the Castilian galleon works up on her trials, south-west of Gran Canaria. */
const TRIALS: LatLon = { lat: 27.55, lon: -15.95 };
/** The beach on La Gomera where Arana will be waiting. */
const GOMERA_BEACH: LatLon = { lat: 28.03, lon: -17.12 };

function layDownGaleao(g: Game, cost: number, dayScale: number, who: string): string | null {
  if (g.building) return 'There is already a ship of yours on the stocks at the Ribeira. When she is launched there will be room.';
  if (g.crown.gold + g.creditFree < cost) return `The Ribeira wants ${cost} cruzados to lay her down, and the purse will not stretch to it.`;
  if (g.crown.gold < cost) g.drawCredit(cost);
  g.crown.gold -= cost;
  const days = Math.round(200 * dayScale);
  g.building = { hullId: 'galeao', readyT: g.clock.t + days * DAY, startT: g.clock.t };
  g.logEvent('crown', `${who} lays down the galleon at the Ribeira das Naus: ${cost} cruzados, and about ${Math.round(days / 30)} months on the stocks.`, true);
  return null;
}

const galeao: QuestDef = {
  id: 'galeao',
  title: 'The Biscayan’s Ship',
  blurb: 'A shipwright from Biscay is building Castile a new kind of ship in the Canaries. Get her, or get her lines.',
  offeredAt: ['las-palmas'],
  available: (g) => g.chronicle.act >= 3 && g.crown.lifetimeStanding >= 150 && g.secretsHeard.includes('galeao'),
  offer: () => ({
    who: 'A Biscayan in a harbour tavern',
    text: 'The man at the next table is a ship’s carpenter from Guarnizo, drunk, and aggrieved. His '
      + 'master, Martín de Arana, has been building "a thing that is not a nau and not a caravel" for '
      + 'the Catholic Monarchs, here, out of the way of Seville’s eyes, and has not been paid for '
      + 'a year. "Long, low, four masts, a beak like a galley’s. She will run down a carrack and '
      + 'point with a caravel. And the fools want to send her to fish for Columbus."',
    accept: 'Buy him another jug, and listen',
  }),
  first: 'tavern',
  steps: {
    tavern: {
      goal: () => 'Decide how to go about the Biscayan’s ship, at Las Palmas.',
      marker: () => portMark('las-palmas', 'The Biscayan’s ship'),
      when: (_g, _q, port) => port === 'las-palmas',
      scene: (_g, q) => scene(q, 'tavern', 'A ship forty years early',
        'By the second jug the carpenter has drawn her on the table in wine: a hull longer than a '
        + 'nau’s and lower, the forecastle cut down to nothing and a beak thrust out ahead, '
        + 'square courses forward and two lateens aft. She is lying in the careenage under guard. '
        + 'She goes out on trials to the south-west of the island when the wind serves. And her '
        + 'builder has not been paid.',
        [
          {
            label: 'Find Martín de Arana',
            detail: 'A shipwright who has not been paid is a shipwright who will talk.',
            resolve: (gg) => go(gg, q, 'arana',
              'Went to find Martín de Arana, the Biscayan who drew her, in his lodging above the careenage.'),
          },
          {
            label: 'Watch her trials from the offing',
            detail: 'South-west of Gran Canaria, at sea. Look at her; perhaps more than look.',
            resolve: (gg) => go(gg, q, 'trials',
              'Resolved to see the galleon on her trials, south-west of Gran Canaria.'),
          },
          {
            label: 'Go to the Casa’s man here for a purse, and find Arana',
            detail: 'The Casa keeps a factor wherever the Crown trades. 500 cruzados to buy the man, on your name.',
            resolve: (gg) => {
              gg.crown.gold += 500;
              q.flags.casa = true;
              return go(gg, q, 'arana',
                'The Casa’s man at Las Palmas counted out 500 cruzados on your name, quietly, to '
                + 'bring Arana over — or his drawings.');
            },
          },
          {
            label: 'Go to the Casa’s man here for a letter, and take the ship',
            detail: 'A sealed letter that makes her a prize and not piracy — in Lisbon, anyway.',
            resolve: (gg) => {
              q.flags.letter = true;
              return go(gg, q, 'trials',
                'The Casa’s man wrote the letter and sealed it: if the galleon is taken at sea, she is '
                + 'the King’s prize. South-west of Gran Canaria, when the wind serves.');
            },
          },
        ]),
    },
    arana: {
      goal: () => 'Find Martín de Arana at Las Palmas.',
      marker: () => portMark('las-palmas', 'Martín de Arana'),
      when: (_g, _q, port) => port === 'las-palmas',
      scene: (_g, q) => scene(q, 'arana', 'Martín de Arana',
        'A square grey Biscayan with ink to the elbow and a roll of drawings he will not let out of '
        + 'his hand. He has built for the Catholic Monarchs for two years and been paid for one. He '
        + 'knows exactly who you are. "Portugal," he says. "Portugal pays."',
        [
          {
            label: 'Buy the drawings',
            detail: `${q.flags.casa ? 'The Vedor’s purse and more: ' : ''}900 cruzados for the lines and the tables. The Ribeira can build from them.`,
            resolve: (gg) => {
              if (gg.crown.gold < 900) return later(q, 'He will not take a promise. Come back with nine hundred cruzados.');
              gg.crown.gold -= 900;
              return go(gg, q, 'drawings', 'Bought Arana’s drawings of the galleon for 900 cruzados. The Ribeira das Naus can build her.');
            },
          },
          {
            label: 'Offer him Portugal',
            detail: 'Bring the man himself over. Castile will not let him walk aboard in the harbour.',
            resolve: (gg) => go(gg, q, 'gomera',
              'Arana will come, drawings and all, but not from Las Palmas under the alcaide’s eyes. He will be on the beach on the south-east side of La Gomera. Stand in close.'),
          },
          {
            label: 'Leave it for now',
            detail: 'He will still be here, and still unpaid.',
            resolve: () => later(q, 'Left Arana to his drawings. He will be here.'),
          },
        ]),
    },
    gomera: {
      goal: () => 'Take Arana off the beach on the south-east side of La Gomera. Stand in close.',
      marker: () => ({ ...GOMERA_BEACH, nm: 12, label: 'Arana’s beach' }),
      when: (g) => !g.dockedAt && near(g, GOMERA_BEACH, 12) && g.sounding.shoreDistNm < 6,
      scene: (g, q) => {
        const odds = clamp(0.55 + (g.ship.effects.boat ? 0.2 : 0) + g.crew.count / 400, 0.5, 0.95);
        return scene(q, 'gomera', 'A light on the beach',
          'Three lanterns in a row above the tide line, as agreed — and a fourth, further along, '
          + 'where nothing was agreed. The Count of La Gomera keeps men on this coast.',
          [
            {
              label: 'Send the boat in for him',
              detail: `About ${Math.round(odds * 10)} chances in ten of a clean pull${g.ship.effects.boat ? ' with the longboat' : ''}.`,
              resolve: (gg) => {
                if (gg.rng.chance(odds)) {
                  q.flags.arana = true;
                  return go(gg, q, 'aranaHome', 'Arana came off the beach with his drawings and his two apprentices. Castile will know by morning. Lisbon.');
                }
                gg.killHands(1, 'Shot in the boat off La Gomera.');
                gg.shiftPeopleRegard('castilian', -0.1);
                return later(q, 'The fourth lantern was soldiers. The boat came off with a man dead and without Arana. He will try again another night, he sent word: stand in again.');
              },
            },
            {
              label: 'Stand off till another night',
              detail: 'No boat goes in to a fourth lantern.',
              resolve: () => later(q, 'Stood off. Arana will try another night.'),
            },
          ], 'warning');
      },
    },
    trials: {
      goal: (_g, q) => `Find the galleon on her trials, south-west of Gran Canaria.${q.flags.letter ? ' The Vedor’s letter makes her a prize.' : ''}`,
      marker: () => ({ ...TRIALS, nm: 30, label: 'The galleon’s trials' }),
      when: (g) => !g.dockedAt && near(g, TRIALS, 30),
      scene: (g, q) => {
        const odds = clamp(0.2 + g.crew.count / 160 + g.ship.effects.guns * 0.012, 0.2, 0.85);
        const eye = skill(g.effectiveSkill, 'cartografia') * 100;
        return scene(q, 'trials', 'The galleon',
          'She comes out from under the land with a fresh trade wind abeam and she is everything the '
          + 'carpenter drew: long and low and fast, working up to windward of a caravel that is '
          + 'trying to keep company with her and cannot. There is a skeleton crew aboard, and no '
          + 'guns run out. She anchors for the night under the lee of the island.',
          [
            {
              label: 'Cut her out tonight',
              detail: `Boats in under the dark. About ${Math.round(odds * 10)} chances in ten. Castile will not forget it.`,
              resolve: (gg) => {
                if (gg.rng.chance(odds)) {
                  gg.shiftPeopleRegard('castilian', q.flags.letter ? -0.3 : -0.5);
                  gg.crew.morale = clamp(gg.crew.morale + 0.1, 0, 1);
                  q.flags.prize = true;
                  return go(gg, q, 'prizeHome', 'Cut the galleon out from under Gran Canaria in the middle watch with a prize crew aboard her before the guard boat was awake. She sails in company. Lisbon, and fast.');
                }
                gg.killHands(gg.rng.int(2, 5), 'Killed cutting out the Castilian galleon.');
                gg.ship.damage(0.08);
                gg.shiftPeopleRegard('castilian', -0.2);
                return later(q, 'The guard boat was awake. Beaten off with men lost. She will be on her trials again when the wind serves.');
              },
            },
            {
              label: 'Take her lines from the offing',
              detail: eye >= 40 ? 'Your eye for a coast is good enough for a hull. Rougher than the real drawings.' : 'Rough work at a distance. The Ribeira will have to guess at much of it.',
              resolve: (gg) => {
                q.flags.rough = eye >= 40 ? 'fair' : 'rough';
                return go(gg, q, 'drawings', 'Spent a day shadowing her with the dividers out, and have her lines, after a fashion. The Ribeira can try to build from them.');
              },
            },
            {
              label: 'Let her be',
              detail: 'She will be on her trials again.',
              resolve: () => later(q, 'Left the galleon to her trials.'),
            },
          ], 'warning');
      },
    },
    drawings: {
      goal: () => 'Take the galleon’s lines to the Ribeira das Naus, in Lisbon.',
      marker: () => portMark('lisboa', 'The Ribeira das Naus'),
      when: (_g, _q, port) => port === 'lisboa',
      scene: (g, q) => {
        const rough = q.flags.rough === 'rough' ? 1.35 : q.flags.rough === 'fair' ? 1.15 : 1;
        const cost = Math.round(7000 * rough);
        return scene(q, 'drawings', 'The Ribeira das Naus',
          'The master shipwright spreads the drawings on a bench and does not speak for a long time. '
          + (rough > 1 ? '"Half of this is guesswork. The other half is extraordinary." ' : '"Who drew this?" ')
          + `He can build her: ${cost} cruzados and the better part of a year${g.building ? ', once the stocks are clear' : ''}.`,
          [
            {
              label: `Lay her down — ${cost} cruzados`,
              detail: 'Paid now. She takes months on the stocks; launch her from the shipwrights when she is ready.',
              resolve: (gg) => {
                const err = layDownGaleao(gg, cost, rough, 'The Ribeira');
                if (err) return later(q, err);
                renown(gg, 30);
                return end(gg, q, 'built', 'The galleon is on the stocks at the Ribeira das Naus, built from the Biscayan’s lines. Nobody else in Christendom has one.');
              },
            },
            {
              label: 'Give the lines to the Crown',
              detail: 'The King’s shipwrights will use them; you will not get the ship.',
              resolve: (gg) => {
                renown(gg, 90);
                gg.crown.gold += 1200;
                return end(gg, q, 'given', 'Gave the galleon’s lines to the King. 1,200 cruzados and his thanks, which is worth more.');
              },
            },
          ]);
      },
    },
    aranaHome: {
      goal: () => 'Bring Martín de Arana to the Ribeira das Naus, in Lisbon.',
      marker: () => portMark('lisboa', 'The Ribeira das Naus'),
      when: (_g, _q, port) => port === 'lisboa',
      scene: (g, q) => scene(q, 'aranaHome', 'A Biscayan at the Ribeira',
        'Arana walks the Ribeira das Naus like a man choosing a house. He wants oak from the Alentejo, '
        + 'Biscay iron, and his own men, and he wants to be paid on the nail. Built under his own eye, '
        + 'she will cost half again less than any copy, and be finished sooner.'
        + (g.building ? ' The stocks are taken by a ship of yours already.' : ''),
        [
          {
            label: 'Let him build her — 4,500 cruzados',
            detail: 'Under his own hand, and quicker than the Ribeira could.',
            resolve: (gg) => {
              const err = layDownGaleao(gg, 4500, 0.7, 'Martín de Arana');
              if (err) return later(q, err);
              renown(gg, 50);
              return end(gg, q, 'arana', 'Martín de Arana is building his galleon again — at the Ribeira das Naus, for Portugal, and for you.');
            },
          },
          {
            label: 'Present him to the King',
            detail: 'A great Biscayan shipwright in the King’s service is a coup. You will not get the ship.',
            resolve: (gg) => {
              renown(gg, 140);
              gg.crown.gold += 800;
              return end(gg, q, 'presented', 'Presented Martín de Arana to the King, who took him into his service on the spot and will not forget who brought him.');
            },
          },
        ]),
    },
    prizeHome: {
      goal: () => 'Bring the captured galleon home to Lisbon.',
      marker: () => portMark('lisboa', 'Lisbon, with the prize'),
      when: (_g, _q, port) => port === 'lisboa',
      scene: (_g, q) => scene(q, 'prizeHome', 'The prize in the Tagus',
        'Half of Lisbon is on the waterfront to see her come up the river. '
        + (q.flags.letter
          ? 'The Vedor’s letter is read, and she is the King’s lawful prize; the King makes a gift of her to the captain who took her.'
          : 'The Castilian ambassador is at the palace within the hour. The King, who has seen her, decides that she was found drifting.'),
        [
          {
            label: 'Shift your flag into her',
            detail: 'The old ship is sold to the yard; her fittings come across where they can.',
            resolve: (gg) => {
              const err = gg.shiftFlag('galeao', true);
              if (err) return later(q, err);
              gg.flagship = { hullId: 'galeao', launchedT: gg.clock.t };
              renown(gg, q.flags.letter ? 60 : 25);
              return end(gg, q, 'prize', 'Your flag flies in the Biscayan’s galleon. There is not another ship like her on the sea.');
            },
          },
          {
            label: 'Give her to the King',
            detail: 'The Crown’s shipwrights will take her apart to learn her.',
            resolve: (gg) => {
              renown(gg, 150);
              gg.crown.gold += 2500;
              return end(gg, q, 'crown', 'Gave the galleon to the King. 2,500 cruzados, and the ear of the court.');
            },
          },
        ]),
    },
  },
};

// ---------------------------------------------------------------------------
// 7–10. Who you are: one thread for each way of coming to this coast
//
// Each runs down the road in order — a port in the first leg, one on the Guinea
// coast or the Cape, one at the far end — and each ends by deciding a line of
// the last page of the career. They are offered to the captain whose origin they
// belong to, at any of the ports he leaves Portugal by.

const OUT = ['lisboa', 'lagos', 'funchal'];
const isOrigin = (g: Game, o: string): boolean => g.origin === o;
const atOut = (_g: Game, _q: QuestState, port: string | null): boolean => !!port && OUT.includes(port);

/** A headland on the Swahili coast that nobody has put a name to. */
const UNNAMED_CAPE: LatLon = { lat: -3.75, lon: 40.05 };
/** The bay with the bar across it, south of Benguela. */
const FATHERS_BAY: LatLon = { lat: -16.65, lon: 11.75 };

const nome: QuestDef = {
  id: 'nome',
  title: 'A Name of Your Own',
  blurb: 'Your brother has the house. Make something that is yours, and put your name on it.',
  offeredAt: OUT,
  available: (g) => isOrigin(g, 'segundo'),
  offer: () => ({
    who: 'A letter in your brother’s hand',
    text: 'It is four lines long and the third is about money. Duarte has the house, the land and the '
      + 'name, and he has also got into debt to a neighbour, and has remembered that he has a brother '
      + 'with a ship. His steward is on the quays somewhere, and will find you.',
    accept: 'Read the rest, and meet the steward',
  }),
  first: 'steward',
  steps: {
    steward: {
      goal: () => 'Meet your brother’s steward, at Lisbon, Lagos or Funchal.',
      marker: () => portMark('lagos', 'Your brother’s steward'),
      when: atOut,
      scene: (_g, q) => scene(q, 'steward', 'Duarte’s steward',
        'He has been a month on the quays, waiting, and is polite about it. Duarte wants a hundred and '
        + 'twenty cruzados against the neighbour. The steward also happens to know that the '
        + 'donatary’s agent is letting cane land above the town to any man who will put up a mill, '
        + 'and that nobody with a brother and an entail has ever been offered it.',
        [
          {
            label: 'Send Duarte the hundred and twenty',
            detail: '120 cruzados. He will remember it, and so will the neighbour.',
            resolve: (gg) => {
              if (gg.crown.gold < 120) return later(q, 'You cannot find the hundred and twenty. The steward will wait.');
              gg.crown.gold -= 120;
              renown(gg, 6);
              q.flags.kin = true;
              return go(gg, q, 'younger', 'Sent Duarte a hundred and twenty cruzados against the neighbour. '
                + 'The steward wrote it down as a loan, which it is not.');
            },
          },
          {
            label: 'Take the cane land above the town',
            detail: '250 cruzados for the lot and the water. A mill of your own, in your own name.',
            resolve: (gg) => {
              if (gg.crown.gold < 250) return later(q, 'The donatary’s agent wants two hundred and fifty, and you have not got it.');
              gg.crown.gold -= 250;
              gg.estate.holdings.engenho = Math.max(1, gg.estate.holdings.engenho ?? 0);
              q.flags.land = true;
              return go(gg, q, 'younger', 'Took the cane land above Funchal in your own name. It is the first '
                + 'thing you have ever owned that nobody had to die for.');
            },
          },
          {
            label: 'Send the steward back with nothing',
            detail: 'You did not take a ship to be your brother’s purse.',
            resolve: (gg) => {
              renown(gg, 10);
              q.flags.proud = true;
              return go(gg, q, 'younger', 'Sent Duarte’s steward home with nothing. It was not kind, and '
                + 'the men on the quay who heard about it thought better of you.');
            },
          },
        ]),
    },
    younger: {
      goal: () => 'Look for another man who is out here for the same reason: the garrison at São Jorge da Mina.',
      marker: () => portMark('mina', 'The captain of the garrison'),
      when: (_g, _q, port) => port === 'mina',
      scene: (_g, q) => scene(q, 'younger', 'The captain of the garrison',
        'Rui Mendes commands forty men in a fort that is the most valuable building in Africa, and is '
        + 'a second son from the Alentejo who has not seen his family in six years. He asks, without '
        + 'looking at you, whether you would stand surety for the lime and timber he needs to mend '
        + 'the north wall — a hundred and fifty, to be repaid by the Casa “in due course”.',
        [
          {
            label: 'Stand surety for him',
            detail: '150 cruzados now. The Casa’s due course is long; a man who remembers is rarer.',
            resolve: (gg) => {
              if (gg.crown.gold < 150) return later(q, 'You cannot stand surety for what you have not got.');
              gg.crown.gold -= 150;
              renown(gg, 15);
              q.flags.friend = true;
              return go(gg, q, 'name', 'Stood surety for Rui Mendes’s north wall at Mina. He shook your hand '
                + 'as if he were afraid it might be taken back.');
            },
          },
          {
            label: 'Drink his wine, and say no',
            detail: 'You cannot afford to be everybody’s brother.',
            resolve: (gg) => go(gg, q, 'name', 'Drank Rui Mendes’s wine at Mina and did not stand surety. '
              + 'He did not seem surprised.'),
          },
        ]),
    },
    name: {
      goal: () => 'Find the headland past Melinde that nobody has put a name to. It is yours to give.',
      marker: () => ({ lat: UNNAMED_CAPE.lat, lon: UNNAMED_CAPE.lon, nm: 70, label: 'An unnamed headland' }),
      when: (g) => near(g, UNNAMED_CAPE, 40) && g.sounding.shoreDistNm < 22,
      scene: (_g, q) => scene(q, 'name', 'A headland with no name',
        'It is low, green at the top and pale at the foot, and the pilots’ book calls it nothing. The '
        + 'King’s factor at Melinde has said, more than once, that whatever a captain names he may '
        + 'keep, for what that is worth in an empty country. There is a padrão in the hold. What '
        + 'is it to be called?',
        [
          {
            label: 'Cabo do Segundo, for yourself',
            detail: 'Your own name on a chart. A second son does not get many chances.',
            resolve: (gg) => {
              q.flags.named = 'self';
              renown(gg, 70);
              gg.chart.addPlace('Cabo do Segundo', 'cape', UNNAMED_CAPE, gg.clock.t);
              return end(gg, q, 'self', 'Named the headland past Melinde for yourself, and set a padrão on it. '
                + 'Duarte will hear of it in a year.');
            },
          },
          {
            label: q.flags.friend ? 'Cabo Mendes, for the man at Mina' : 'Cabo de Duarte, for your brother',
            detail: q.flags.friend ? 'A second son you once stood surety for.' : 'The house will have it in the will.',
            resolve: (gg) => {
              const friend = !!q.flags.friend;
              q.flags.named = friend ? 'friend' : 'brother';
              renown(gg, friend ? 40 : 30);
              gg.crown.gold += friend ? 600 : 0;
              gg.chart.addPlace(friend ? 'Cabo Mendes' : 'Cabo de Duarte', 'cape', UNNAMED_CAPE, gg.clock.t);
              return end(gg, q, friend ? 'friend' : 'brother', friend
                ? 'Named the headland past Melinde for Rui Mendes. The Casa paid his surety back, and he '
                  + 'sent you six hundred cruzados and a great many pages of thanks.'
                : 'Named the headland past Melinde for your brother, and sent him the word. It is the first '
                  + 'time in your life he has had something of yours to be proud of.');
            },
          },
          {
            label: 'Cabo da Boa Vista, and leave it at that',
            detail: 'A name anyone could have. Nobody can say you took anything.',
            resolve: (gg) => {
              q.flags.named = 'plain';
              renown(gg, 25);
              gg.chart.addPlace('Cabo da Boa Vista', 'cape', UNNAMED_CAPE, gg.clock.t);
              return end(gg, q, 'plain', 'Named the headland past Melinde for what it looks like.');
            },
          },
        ]),
    },
  },
};

const ficheiro: QuestDef = {
  id: 'ficheiro',
  title: 'The File',
  blurb: 'Somebody keeps a file on your family. A cousin, a clerk and a far coast will decide what is in it.',
  offeredAt: OUT,
  available: (g) => isOrigin(g, 'converso'),
  offer: () => ({
    who: 'Your cousin Isaac, at the quay',
    text: 'You are not supposed to know him in public, and he knows it, and he has come anyway. He '
      + 'copied tables for a master at Salamanca who has since had to leave Spain, and he has a '
      + 'set of corrected declinations that the Casa’s pilots do not have and would pay a great deal '
      + 'for. He wants to put them in the hands of a navigator. He does not want to be the '
      + 'man who sold them.',
    accept: 'Hear what he is asking',
  }),
  first: 'cousin',
  steps: {
    cousin: {
      goal: () => 'Take cousin Isaac’s tables, at Lisbon, Lagos or Funchal.',
      marker: () => portMark('lagos', 'Cousin Isaac'),
      when: atOut,
      scene: (_g, q) => scene(q, 'cousin', 'Corrected tables',
        'They are in a flat case, ruled in a hand you know from the letters at home: the sun’s '
        + 'declination for every day of four years, worked again from the master’s observations and '
        + 'two degrees better than anything in the Casa. Isaac wants a hundred and twenty for his '
        + 'trouble, or a navigator who will say where they came from if asked. He is shaking a little.',
        [
          {
            label: 'Pay him the hundred and twenty',
            detail: 'A clean purchase. Nobody will need to say where they came from.',
            resolve: (gg) => {
              if (gg.crown.gold < 120) return later(q, 'You have not got the hundred and twenty. Isaac will wait a little.');
              gg.crown.gold -= 120;
              q.flags.tables = true;
              renown(gg, 6);
              return go(gg, q, 'clerk', 'Bought Isaac’s corrected tables for a hundred and twenty. They are '
                + 'in the chart case under the Casa’s own.');
            },
          },
          {
            label: 'Say you will vouch for him',
            detail: 'Free, and it puts your name next to his if anybody asks.',
            resolve: (gg) => {
              q.flags.tables = true;
              q.flags.vouched = true;
              renown(gg, 12);
              return go(gg, q, 'clerk', 'Took Isaac’s tables and said you would vouch for where they '
                + 'came from. He cried, and then was ashamed that he had.');
            },
          },
          {
            label: 'Send him away, for both your sakes',
            detail: 'The file is thinner without him.',
            resolve: (gg) => go(gg, q, 'clerk', 'Told Isaac you could not be seen with him, and watched him '
              + 'believe it.'),
          },
        ]),
    },
    clerk: {
      goal: () => 'The Casa’s clerk at Arguim keeps a book. Call on him.',
      marker: () => portMark('arguim', 'The Casa’s clerk'),
      when: (_g, _q, port) => port === 'arguim',
      scene: (_g, q) => scene(q, 'clerk', 'The clerk at Arguim',
        'He is pleasant, stout and very well informed, and he asks after Isaac by name. '
        + 'He is not threatening you; he would not know how. It is a thing he has been told to keep '
        + 'track of, and a captain who is useful can make the keeping of it very much shorter.',
        [
          {
            label: 'Pay him for his silence',
            detail: '150 cruzados. It buys this year, not the next.',
            resolve: (gg) => {
              if (gg.crown.gold < 150) return later(q, 'You have not got a hundred and fifty. The clerk will be at Arguim a while yet.');
              gg.crown.gold -= 150;
              q.flags.paid = true;
              return go(gg, q, 'malabar', 'Paid the Casa’s clerk at Arguim a hundred and fifty cruzados '
                + 'to forget a name.');
            },
          },
          {
            label: 'Hand him the coast',
            detail: 'Every sounding and headland of the passage, written out clean. Being useful is the only coin the file respects.',
            resolve: (gg) => {
              renown(gg, 18);
              q.flags.useful = true;
              return go(gg, q, 'malabar', 'Gave the Casa’s clerk at Arguim a fair copy of the coast you '
                + 'have sailed. He read it twice and closed the book a little more slowly than he opened it.');
            },
          },
          {
            label: 'Remind him who lends to the Crown',
            detail: 'A word to Marchionni would be heard. It would also be remembered.',
            resolve: (gg) => {
              gg.finance.regard('marchionni', 4);
              q.flags.threat = true;
              return go(gg, q, 'malabar', 'Mentioned the Florentine house to the clerk at Arguim. He stopped '
                + 'asking about Isaac. He did not stop writing.');
            },
          },
        ]),
    },
    malabar: {
      goal: () => 'There is a community at Cochim that has a word for you. Go there.',
      marker: () => portMark('cochim', 'The Jews of Cochim'),
      when: (_g, _q, port) => port === 'cochim',
      scene: (_g, q) => scene(q, 'malabar', 'The old community',
        'They have been here longer than the Portuguese have had ships, and they have been '
        + 'expecting a captain with a name like yours for some time. A merchant in a white coat '
        + 'asks, politely, about your cousin, and then about the Casa’s clerk at Arguim, and '
        + 'then sets down three things on the table: a list of what the Zamorin’s factors have been '
        + 'paid, the price of pepper by the week, and a letter for your family.',
        [
          {
            label: 'Take the letter, and trade with them',
            detail: 'Their credit is good on this coast, and they will say so to any house in Lisbon.',
            resolve: (gg) => {
              const closed = !!(q.flags.paid || q.flags.useful) && !!q.flags.tables;
              gg.finance.regard('marchionni', 6);
              gg.finance.regard('affaitati', 6);
              if (closed) {
                gg.secretsHeard.push('file-closed');
                renown(gg, 40);
                return end(gg, q, 'closed', 'The file was closed. Nobody has said so; the Casa has just stopped '
                  + 'asking. The merchants of Cochim speak for you in Lisbon.');
              }
              renown(gg, 15);
              return end(gg, q, 'open', 'The file stays open, and the merchants of Cochim will speak for '
                + 'you in Lisbon all the same.');
            },
          },
        ]),
    },
  },
};

const roteiro: QuestDef = {
  id: 'roteiro',
  title: 'His Book',
  blurb: 'Your father’s roteiro names three marks on this coast, and the last is where he stopped.',
  offeredAt: OUT,
  available: (g) => isOrigin(g, 'piloto'),
  offer: () => ({
    who: 'Your father’s roteiro, open on the chart table',
    text: 'You have read it so often the spine has gone. The last page is not like the others: '
      + 'three marks, a line under each, and then nothing. The Casa’s man at the quay has an '
      + 'offer for the whole book, and does not ask why it has a page torn out.',
    accept: 'Read the last page again',
  }),
  first: 'page',
  steps: {
    page: {
      goal: () => 'Decide what to do with your father’s book, at Lisbon, Lagos or Funchal.',
      marker: () => portMark('lagos', 'The last page'),
      when: atOut,
      scene: (_g, q) => scene(q, 'page', 'The last page',
        'Three marks. A river mouth past Mina where the water changes colour. A cape that shows '
        + 'twice before it shows once. And a bay with a bar across it, south of the Congo, '
        + 'underlined twice, and below it: "ela tem fundo." She has bottom. The Casa’s man '
        + 'will give four hundred cruzados for the book as it stands.',
        [
          {
            label: 'Follow it',
            detail: 'Every sounding he took between here and Mina goes into your own book at once.',
            resolve: (gg) => {
              const n = writeTheSea(gg, -6, 30, -25, 12);
              return go(gg, q, 'mate', `Decided to follow the roteiro to the last page. His soundings and `
                + `winds are in your book now: ${n} squares between here and the Guinea coast.`);
            },
          },
          {
            label: 'Sell it to the Casa',
            detail: '400 cruzados. The Casa’s pilots will have it, and it will be nobody’s in particular.',
            resolve: (gg) => {
              gg.crown.gold += 400;
              renown(gg, 5);
              return end(gg, q, 'sold', 'Sold your father’s roteiro to the Casa for four hundred cruzados. '
                + 'The money was good, and is already spent.');
            },
          },
        ]),
    },
    mate: {
      goal: () => 'A man who sailed with your father is at São Jorge da Mina.',
      marker: () => portMark('mina', 'Your father’s mate'),
      when: (_g, _q, port) => port === 'mina',
      scene: (_g, q) => scene(q, 'mate', 'Bastião',
        'He was the mate, he is fifty and looks seventy, and he has been waiting at the factory gate '
        + 'for a face like your father’s for eleven years. The captain put him ashore with the fever, '
        + 'he says, and sailed. Your father stayed to fetch him and did not come out again. '
        + 'The captain is named in the Casa’s book. He is named as a hero.',
        [
          {
            label: 'Have him aboard as your mate',
            detail: 'He knows the coast from the water, and you will know it from him.',
            resolve: (gg) => {
              gg.crew.morale = clamp(gg.crew.morale + 0.1, 0, 1);
              const n = writeTheSea(gg, -40, -5, -30, 20);
              q.flags.bastiao = true;
              return go(gg, q, 'bay', `Took Bastião aboard. He talked half the night about marks and bars. ${n} `
                + 'squares of the south are in your book by morning. The bay is below the Congo.');
            },
          },
          {
            label: 'Publish what the captain did',
            detail: 'The Casa will not like it. The waterfront will.',
            resolve: (gg) => {
              renown(gg, 30);
              gg.crown.gold -= Math.min(gg.crown.gold, 100);
              q.flags.published = true;
              return go(gg, q, 'bay', 'Wrote down what Bastião said and had it read at the factory. The '
                + 'captain’s name is struck out of a book in Lisbon. It was not as satisfying as you '
                + 'had hoped. The bay is still to find.');
            },
          },
        ]),
    },
    bay: {
      goal: () => 'Find the bay with the bar across it, south of Benguela. It will show only from close in.',
      marker: () => ({ lat: FATHERS_BAY.lat, lon: FATHERS_BAY.lon, nm: 70, label: 'The bay with the bar' }),
      when: (g) => near(g, FATHERS_BAY, 25) && g.sounding.shoreDistNm < 8,
      scene: (_g, q) => scene(q, 'bay', 'Ela tem fundo',
        'There. A long pale bar across the mouth with one dark break in it, and inside the water is '
        + 'flat as a table. The lead goes down to twelve fathoms at the top of the tide and finds '
        + 'sand. It is on no chart in the Casa. He got here, and whatever happened to him happened '
        + 'after the last page.\n\nOn the north horn of the bay there is a cairn, very old, with '
        + 'nothing in it.',
        [
          {
            label: 'Name it for him',
            detail: 'Baía do Piloto. It goes on your chart, and on nobody else’s.',
            resolve: (gg) => {
              gg.chart.addPlace('Baía do Piloto', 'bay', FATHERS_BAY, gg.clock.t);
              renown(gg, 50);
              const n = writeTheSea(gg, -30, -10, 5, 20);
              return end(gg, q, 'named', `Found the bay with the bar across it and named it for your father. ${n} `
                + 'more squares of his coast are in your book. The cairn is still there.');
            },
          },
          {
            label: 'Give it to the King',
            detail: 'A padrão on the point, the Crown’s thanks, and a name that is not his.',
            resolve: (gg) => {
              gg.chart.addPlace('Baía do Rei', 'bay', FATHERS_BAY, gg.clock.t);
              renown(gg, 90);
              gg.crown.gold += 300;
              return end(gg, q, 'crown', 'Gave your father’s bay to the King. The padrão is on the point '
                + 'and the court paid three hundred cruzados. You left the cairn as you found it.');
            },
          },
        ], 'warning'),
    },
  },
};

const escudeiro: QuestDef = {
  id: 'escudeiro',
  title: 'The King’s Gentleman',
  blurb: 'A young cousin is to learn what you learned. The King will want an honest account of how.',
  offeredAt: OUT,
  available: (g) => isOrigin(g, 'fidalgo'),
  offer: () => ({
    who: 'Dom Lopo, your cousin, on the quay',
    text: 'He is seventeen and has a sword too long for him, and has been sent by a mother who believes '
      + 'that a month at sea will do for him what three years at court have not. He has a letter '
      + 'and a chest and no idea what either is worth.',
    accept: 'Take him aboard, and see',
  }),
  first: 'squire',
  steps: {
    squire: {
      goal: () => 'Decide what to do with Dom Lopo, at Lisbon, Lagos or Funchal.',
      marker: () => portMark('lagos', 'Dom Lopo'),
      when: atOut,
      scene: (_g, q) => scene(q, 'squire', 'Dom Lopo',
        'He looks at the ship as if she were a mistake that somebody will shortly correct. The '
        + 'hands look at him as they look at anyone who will eat their biscuit and give orders in '
        + 'a boy’s voice. The letter is from your aunt, and is about his health.',
        [
          {
            label: 'Take him as a gentleman volunteer',
            detail: 'He sleeps in the cuddy and stands no watch at first. The hands will resent it.',
            resolve: (gg) => {
              gg.crew.morale = clamp(gg.crew.morale - 0.04, 0, 1);
              q.flags.aboard = true;
              return go(gg, q, 'insult', 'Took Dom Lopo aboard. The hands are polite, which is worse '
                + 'than if they were not.');
            },
          },
          {
            label: 'Put him to the lowest watch, as any boy',
            detail: 'He will hate it. The hands will not.',
            resolve: (gg) => {
              gg.crew.morale = clamp(gg.crew.morale + 0.04, 0, 1);
              q.flags.aboard = true;
              q.flags.hard = true;
              return go(gg, q, 'insult', 'Put Dom Lopo to the lowest watch. He did not speak for a day, and '
                + 'then he asked what a clew was.');
            },
          },
          {
            label: 'Decline, and send him home to his mother',
            detail: 'Nobody will blame you. Your aunt will.',
            resolve: (gg) => {
              renown(gg, -4);
              return go(gg, q, 'report', 'Sent Dom Lopo home to his mother. There is a letter to your aunt '
                + 'that took four drafts.');
            },
          },
        ]),
    },
    insult: {
      goal: () => 'Keep Dom Lopo out of trouble at São Jorge da Mina.',
      marker: () => portMark('mina', 'Dom Lopo at Mina'),
      when: (_g, q, port) => port === 'mina' && !!q.flags.aboard,
      scene: (_g, q) => scene(q, 'insult', 'Words at the factory',
        'It is the heat, and the sight of the gold, and a factor’s clerk who said something about '
        + 'pretty boys. Dom Lopo has drawn the sword that is too long for him, in front of '
        + 'the Casa’s men, and the clerk is laughing.',
        [
          {
            label: 'Stand between them, and make him apologise',
            detail: 'He will never forgive you for it. He will also be alive.',
            resolve: (gg) => {
              renown(gg, 10);
              q.flags.steady = true;
              return go(gg, q, 'report', 'Made Dom Lopo put up his sword and apologise to the clerk at Mina. '
                + 'The clerk has told everyone.');
            },
          },
          {
            label: 'Let them have it out',
            detail: 'Men are made this way. Sometimes they are also buried.',
            resolve: (gg) => {
              if (gg.rng.chance(0.55)) {
                renown(gg, 15);
                q.flags.reckless = true;
                return go(gg, q, 'report', 'Dom Lopo put the clerk’s sleeve to the wall and was pulled off, '
                  + 'shaking and delighted. The factory thinks well of him.');
              }
              gg.crew.morale = clamp(gg.crew.morale - 0.08, 0, 1);
              renown(gg, -10);
              q.flags.hurt = true;
              return go(gg, q, 'report', 'Dom Lopo took a cut across the arm and was carried aboard. He '
                + 'will keep the scar. Your aunt will want to hear how it came about.');
            },
          },
        ]),
    },
    report: {
      goal: () => 'A letter from the King is waiting at Melinde.',
      marker: () => portMark('melinde', 'The King’s private letter'),
      when: (_g, _q, port) => port === 'melinde',
      scene: (_g, q) => scene(q, 'report', 'A private letter',
        'It is on plain paper, in the King’s own hand, and is short. "You asked me for a ship, and '
        + 'I have watched what you have done with it. I should like to be told, by you and by nobody '
        + 'else, what the captains are really doing out there." It does not say what will come of a '
        + 'plain answer.'
        + (q.flags.aboard ? ' Dom Lopo, who reads over your shoulder, goes very still.' : ''),
        [
          {
            label: 'Tell him the truth',
            detail: 'Every private trade, every bribe, every man who has starved his crew for a profit.',
            resolve: (gg) => {
              renown(gg, 70);
              gg.estate.accrued += 1500;
              gg.secretsHeard.push('commenda');
              return end(gg, q, 'honest', 'Wrote the King an honest account of the captains. He gave you a '
                + 'commenda of the Order of Christ, which pays fifteen hundred cruzados and makes '
                + 'a great many enemies.');
            },
          },
          {
            label: 'Tell him what he would like to hear',
            detail: 'He is not a fool, but he is fond of being told.',
            resolve: (gg) => {
              renown(gg, 20);
              gg.crown.gold += 400;
              return end(gg, q, 'flattered', 'Wrote the King a cheerful account of the captains. He sent four '
                + 'hundred cruzados for your trouble and did not write again.');
            },
          },
        ]),
    },
  },
};

// ---------------------------------------------------------------------------
// 11–16. More of the road: what happens to a ship on the way
//
// Six threads that belong to the road itself rather than to the captain's past
// or to the Crown's errands. They are offered at the ports a voyage passes and
// each one's beats sit further down the road than the last.

/** Off the Barbary shore, where the Canaries' fishermen say a caravel is drifting. */
const DRIFT: LatLon = { lat: 22.4, lon: -17.6 };
/** Where Dias's padrão stood, east of the Cape. */
const KWAAIHOEK: LatLon = { lat: -33.7, lon: 26.3 };
/** The open sea between Melinde and Calecute, where the monsoon is. */
const MONSOON: LatLon = { lat: 4.0, lon: 58.0 };

const adrift: QuestDef = {
  id: 'adrift',
  title: 'The Ship Adrift',
  blurb: 'A caravel has been seen drifting off the Barbary shore with nobody at her helm.',
  offeredAt: ['funchal', 'las-palmas', 'lagos'],
  available: (g) => g.chronicle.act >= 1,
  offer: () => ({
    who: 'A Canary fisherman, mending net',
    text: 'He will not say where he heard it, which is how you know it is true. A caravel with her '
      + 'foresail in rags has been turning slowly in the current off the Barbary shore for a week, '
      + 'and the boat that went out to her came back without going aboard. "There is a smell," '
      + 'he says.',
    accept: 'Ask where, and go and see',
  }),
  first: 'drift',
  steps: {
    drift: {
      goal: () => 'Find the drifting caravel off the Barbary shore, south of the Canaries.',
      marker: () => ({ lat: DRIFT.lat, lon: DRIFT.lon, nm: 90, label: 'A drifting caravel' }),
      when: (g) => near(g, DRIFT, 35) && !g.dockedAt,
      scene: (_g, q) => scene(q, 'drift', 'The Nossa Senhora da Ajuda',
        'She is a Lagos caravel, and there is nobody at her helm because the helmsman is at the foot '
        + 'of it, past help. The fever has been through her. Four are dead, two are dying, and '
        + 'one boy of about fifteen is sitting in the waist with his knees drawn up, watching you '
        + 'come alongside as if you were something in a dream. Her hold is still full.',
        [
          {
            label: 'Take off the boy and bring her in',
            detail: 'A prize crew, the fever aboard, and three weeks’ delay. She is worth having.',
            resolve: (gg) => {
              gg.crew.morale = clamp(gg.crew.morale - 0.06, 0, 1);
              gg.ship.addCargo('ferramenta', 12, 0, 0.55);
              q.flags.boy = true;
              return go(gg, q, 'factor', 'Took the boy off the Nossa Senhora da Ajuda and sent a prize crew '
                + 'aboard her. Her master’s papers are for the factor at Arguim.');
            },
          },
          {
            label: 'Take the boy and her papers, and leave her',
            detail: 'Fever ships are burnt. There is nothing to be done for the rest.',
            resolve: (gg) => {
              q.flags.boy = true;
              renown(gg, 5);
              return go(gg, q, 'factor', 'Took the boy and the master’s papers off the Nossa Senhora da '
                + 'Ajuda, and burnt her. The papers are for the factor at Arguim.');
            },
          },
          {
            label: 'Stand off and let the fever go by',
            detail: 'Nobody would blame you. The boy would.',
            resolve: (gg) => {
              renown(gg, -5);
              gg.crew.morale = clamp(gg.crew.morale + 0.03, 0, 1);
              return end(gg, q, 'left', 'Left the Nossa Senhora da Ajuda to her fever, and sailed on.');
            },
          },
        ], 'warning'),
    },
    factor: {
      goal: () => 'Carry her master’s papers to the factor at Arguim.',
      marker: () => portMark('arguim', 'The factor at Arguim'),
      when: (_g, _q, port) => port === 'arguim',
      scene: (_g, q) => scene(q, 'factor', 'The master’s papers',
        'The factor reads them standing. The master, Jorge Lobo, was carrying two hundred '
        + 'cruzados of the King’s money for the garrison and a good deal of his own, and has been '
        + 'thought lost since the spring. The boy, Zé, is his nephew. The factor looks at the '
        + 'boy, and at you, and waits to be told what kind of man you are.',
        [
          {
            label: 'Hand over the King’s money, and keep the rest',
            detail: 'The garrison is paid. What Lobo owned is salvage.',
            resolve: (gg) => {
              renown(gg, 25);
              gg.crown.gold += 120;
              return end(gg, q, 'salvage', 'Handed the garrison’s money to the factor at Arguim and kept the '
                + 'salvage. The factor sent 120 cruzados and a good word to Lisbon.');
            },
          },
          {
            label: 'Give it all to the boy',
            detail: 'Lobo’s nephew has nothing else. The Crown’s share is another matter.',
            resolve: (gg) => {
              renown(gg, 45);
              gg.crew.morale = clamp(gg.crew.morale + 0.06, 0, 1);
              return end(gg, q, 'boy', 'Gave Lobo’s nephew what his uncle left. The hands remember things like that, '
                + 'and so does the Casa’s man at Arguim.');
            },
          },
        ]),
    },
  },
};

const pesos: QuestDef = {
  id: 'pesos',
  title: 'False Weights',
  blurb: 'The gold traders of the Mina coast say the Casa’s scales are not honest. They would be right.',
  offeredAt: ['mina', 'axim'],
  available: (g) => g.chronicle.act >= 1,
  offer: () => ({
    who: 'A gold trader at the factory gate',
    text: 'He has come down from the interior three times this year and has gone home three times '
      + 'with a little less than the trade was worth. He does not say the scales are false. He puts '
      + 'a stone he has carried from home in your hand and asks you to hold it.',
    accept: 'Weigh his stone against the Casa’s',
  }),
  first: 'scales',
  steps: {
    scales: {
      goal: () => 'Weigh the trader’s stone against the Casa’s scales, at Mina or Axim.',
      marker: () => portMark('mina', 'The Casa’s scales'),
      when: (_g, _q, port) => port === 'mina' || port === 'axim',
      scene: (_g, q) => scene(q, 'scales', 'Two sets of weights',
        'The stone is a third lighter against the Casa’s marco than against the trader’s own weights. '
        + 'The clerk sees your face and begins to explain. The explanation is long and ends in a '
        + 'request that you not make a scene.',
        [
          {
            label: 'Put it to the factor, in front of the traders',
            detail: 'Public, and the factor will not thank you.',
            resolve: (gg) => {
              renown(gg, 25);
              gg.shiftPeopleRegard(portDef('mina').people, 0.3);
              q.flags.public = true;
              return go(gg, q, 'axim', 'Put the false weights to the factor at Mina in front of the gold traders. '
                + 'The scales were changed the same afternoon. The trader’s brother runs a market at Axim.');
            },
          },
          {
            label: 'Say nothing, and buy the clerk’s silence for yourself',
            detail: 'A third off every marco you buy, for as long as he keeps his post.',
            resolve: (gg) => {
              q.flags.cheat = true;
              gg.shiftPeopleRegard(portDef('mina').people, -0.25);
              return go(gg, q, 'axim', 'Took the clerk’s offer at Mina. You will buy gold cheaper than anyone '
                + 'on the coast, for a while. The trader’s brother runs a market at Axim.');
            },
          },
        ]),
    },
    axim: {
      goal: () => 'The trader’s brother has a market at Axim.',
      marker: () => portMark('axim', 'The trader’s brother'),
      when: (_g, _q, port) => port === 'axim',
      scene: (_g, q) => scene(q, 'axim', 'The brother',
        q.flags.cheat
          ? 'He knows already. Word goes along the coast faster than a ship. He stands in the market '
            + 'with his arms folded and nothing whatever to sell you.'
          : 'He has heard what you did at Mina, and has done a good deal of thinking about it. He '
            + 'has a place, a day’s walk inland, where the gold is washed out of the river and not '
            + 'mined, and no Portuguese has been allowed to see it.',
        q.flags.cheat
          ? [
            {
              label: 'Pay him what the trader was short',
              detail: '150 cruzados, and the coast may forget.',
              resolve: (gg) => {
                gg.crown.gold = Math.max(0, gg.crown.gold - 150);
                gg.shiftPeopleRegard(portDef('mina').people, 0.2);
                return end(gg, q, 'repaid', 'Repaid the gold traders what the scales had taken, and the coast is '
                  + 'less cold. Not warm.');
              },
            },
            {
              label: 'Go on as you are',
              detail: 'The price is good.',
              resolve: (gg) => end(gg, q, 'cheat', 'The gold traders of Axim sell to other flags. You buy '
                + 'cheaper than anyone on the coast, from fewer men.'),
            },
          ]
          : [
            {
              label: 'Go inland with him',
              detail: 'A day’s walk each way, and what you see there is not for the Casa.',
              resolve: (gg) => {
                gg.shiftPeopleRegard(portDef('mina').people, 0.35);
                leaveToTrade(gg, 'eguafo', { trust: 0.25, respect: 0.1 }, 'stood up for the traders against false weights');
                renown(gg, 30);
                return end(gg, q, 'inland', 'Saw where the river gold is washed. The traders of the coast will '
                  + 'deal with you first from now on, and say so to each other.');
              },
            },
            {
              label: 'Send word of it to the Casa',
              detail: 'Everything you saw, written down, for the King’s factor.',
              resolve: (gg) => {
                renown(gg, 40);
                gg.crown.gold += 200;
                gg.shiftPeopleRegard(portDef('mina').people, -0.2);
                return end(gg, q, 'report', 'Told the Casa where the river gold is washed, and was paid two '
                  + 'hundred cruzados for it. The traders did not thank you.');
              },
            },
          ],
        q.flags.cheat ? 'warning' : 'note'),
    },
  },
};

const padrao: QuestDef = {
  id: 'padrao',
  title: 'The Fallen Padrão',
  blurb: 'Dias set a stone east of the Cape. Nobody has been back to see whether it is still standing.',
  offeredAt: ['benguela', 'mpinda', 'luanda'],
  available: (g) => g.chronicle.act >= 2,
  offer: () => ({
    who: 'An old pilot who sailed with Dias',
    text: 'He was a grumete on the São Cristóvão in 1488, and he will tell you so without being '
      + 'asked. They set a stone at the far end of the land — the padrão of São Gregório — and '
      + 'turned back, and nobody has been to see it since. "It will be down," he says. "They '
      + 'always are. But there should be somebody to know where it lay."',
    accept: 'Ask him where he remembers it',
  }),
  first: 'stone',
  steps: {
    stone: {
      goal: () => 'Find where Dias’s padrão stood: a bay east of the Cape, close under a low headland.',
      marker: () => ({ lat: KWAAIHOEK.lat, lon: KWAAIHOEK.lon, nm: 80, label: 'Where Dias’s stone stood' }),
      when: (g) => near(g, KWAAIHOEK, 30) && g.sounding.shoreDistNm < 14,
      scene: (g, q) => scene(q, 'stone', 'The padrão of São Gregório',
        'It is lying on its side in the dune grass above the beach, cracked across, with the '
        + 'cross at one end and the arms of Portugal at the other. The herdsmen have used the '
        + 'foot of it to grind something. There is still a line of letters that can be read: '
        + '"... DA BOA ESPERANÇA ... A DIAS ..."',
        [
          {
            label: g.crown.padraoStock > 0 ? 'Raise a new stone on the old foot' : 'Take a rubbing of the inscription and lay the cross upright',
            detail: g.crown.padraoStock > 0
              ? 'One of your padrões. The Crown will hear it stood again.'
              : 'You have no padrão to spare. The cross, at least, can stand.',
            resolve: (gg) => {
              if (gg.crown.padraoStock > 0) {
                gg.crown.padraoStock -= 1;
                gg.crown.padroesRaised += 1;
                q.flags.raised = true;
                renown(gg, 55);
              } else {
                renown(gg, 30);
              }
              return go(gg, q, 'factor',
                'Found Dias’s padrão of São Gregório where the old pilot said it would be, fallen, and '
                + (q.flags.raised ? 'raised a new stone on its foot. ' : 'stood the cross up again. ')
                + 'The King’s factor at Moçambique will want the inscription.');
            },
          },
          {
            label: 'Carry the stone home',
            detail: 'Too heavy for a caravel’s deck. Half of it, at any rate — the arms of Portugal.',
            resolve: (gg) => {
              renown(gg, 40);
              gg.crew.morale = clamp(gg.crew.morale - 0.05, 0, 1);
              q.flags.carried = true;
              return go(gg, q, 'factor', 'Cut the arms of Portugal from Dias’s padrão and stowed them '
                + 'in the hold. The herdsmen watched it done and said nothing.');
            },
          },
        ], 'warning'),
    },
    factor: {
      goal: () => 'Report the padrão to the King’s factor, at Moçambique.',
      marker: () => portMark('mocambique', 'The King’s factor'),
      when: (_g, _q, port) => port === 'mocambique',
      scene: (_g, q) => scene(q, 'factor', 'What became of the stone',
        'The factor at Moçambique is a thin, tired man who has never been further south than '
        + 'the bar. He has been told Dias’s stone fell, and has been waiting for a captain to say '
        + 'whether it is true. He reads the inscription you copied aloud, twice, and then sets the '
        + 'paper down.',
        [
          {
            label: 'Ask for nothing',
            detail: 'The stone is the King’s. The finding is yours, and that is enough.',
            resolve: (gg) => {
              renown(gg, 30);
              return end(gg, q, 'modest', 'Reported Dias’s padrão to the King’s factor at Moçambique and asked '
                + 'for nothing. He wrote it up in the king’s book under your name.');
            },
          },
          {
            label: 'Ask the Crown’s price',
            detail: 'A discovery is a discovery. 300 cruzados.',
            resolve: (gg) => {
              gg.crown.gold += 300;
              renown(gg, 15);
              return end(gg, q, 'paid', 'The factor at Moçambique paid three hundred cruzados for news of '
                + 'Dias’s padrão, and did not write your name in the king’s book.');
            },
          },
        ]),
    },
  },
};

const mercador: QuestDef = {
  id: 'mercador',
  title: 'A Passenger for Melinde',
  blurb: 'A Swahili merchant stranded at Moçambique wants to get home to Melinde by way of Mombaça.',
  offeredAt: ['mocambique'],
  available: (g) => g.chronicle.act >= 3,
  offer: () => ({
    who: 'A merchant in a white robe, on the quay',
    text: 'His name is Hasan ibn Salim, and his ship was taken by the sultan of Kilwa’s men two months '
      + 'ago. He has a wife at Melinde and a son at Mombaça, and has been reading the Portuguese ship '
      + 'lists each morning for a captain bound north. He has nothing to pay with but what he '
      + 'knows about the coast.',
    accept: 'Take him aboard, north to Melinde',
  }),
  first: 'mombaca',
  steps: {
    mombaca: {
      goal: () => 'Put into Mombaça with Hasan ibn Salim aboard: his son is there.',
      marker: () => portMark('mombaca', 'Hasan’s son'),
      when: (_g, _q, port) => port === 'mombaca',
      scene: (_g, q) => scene(q, 'mombaca', 'Hasan’s son',
        'Mombaça has not forgotten the Portuguese, and is not glad to see a Portuguese ship with a '
        + 'Swahili merchant aboard. Hasan’s son comes down to the beach, which takes courage, '
        + 'and stands with the crowd behind him. The sultan’s men are at the top of the beach.',
        [
          {
            label: 'Put Hasan ashore to see his son',
            detail: 'A quarter of an hour. The sultan’s men may not wait.',
            resolve: (gg) => {
              q.flags.landed = true;
              gg.adjustPolity('mombasa', { trust: 0.1, respect: 0.05 }, 'let a merchant see his son');
              return go(gg, q, 'melinde', 'Put Hasan ashore at Mombaça to see his son. The sultan’s men let it '
                + 'be done. Melinde is next, and his wife.');
            },
          },
          {
            label: 'Keep him aboard, and trade',
            detail: 'The sultan’s men are the sort you would rather not quarrel with.',
            resolve: (gg) => {
              gg.adjustPolity('mombasa', { respect: 0.05 }, 'kept clear of trouble');
              return go(gg, q, 'melinde', 'Kept Hasan aboard at Mombaça, and he did not speak. Melinde is next, '
                + 'and his wife.');
            },
          },
        ], 'warning'),
    },
    melinde: {
      goal: () => 'Bring Hasan ibn Salim home to Melinde.',
      marker: () => portMark('melinde', 'Hasan’s house'),
      when: (_g, _q, port) => port === 'melinde',
      scene: (_g, q) => scene(q, 'melinde', 'Hasan’s house',
        'His wife is at the water stairs, veiled and very still. Hasan goes down the side slowly '
        + 'and then not slowly. '
        + (q.flags.landed ? 'He has seen his son, and says so, and his voice is not quite steady. ' : '')
        + 'The sheikh of Melinde is watching from the terrace, and does not miss much.',
        [
          {
            label: 'Accept nothing',
            detail: 'Let the sheikh see a Portuguese captain do a kindness for its own sake.',
            resolve: (gg) => {
              leaveToTrade(gg, 'malindi', { trust: 0.3, respect: 0.1 }, 'brought a Melinde merchant home');
              renown(gg, 30);
              q.flags.freely = true;
              return end(gg, q, 'freely', 'Brought Hasan ibn Salim home to Melinde and took nothing. The sheikh '
                + 'has made a note of that.');
            },
          },
          {
            label: 'Take what Hasan knows about the coast',
            detail: 'Every anchorage and bar between here and Kilwa, written down by a man who sailed it.',
            resolve: (gg) => {
              const n = writeTheSea(gg, -30, 0, 32, 50);
              leaveToTrade(gg, 'malindi', { trust: 0.15 }, 'brought a Melinde merchant home');
              return end(gg, q, 'pilotage', `Hasan ibn Salim’s pilotage of the Swahili coast is in your book now: ${n} squares.`);
            },
          },
        ]),
    },
  },
};

const monsoon: QuestDef = {
  id: 'monsoon',
  title: 'A Pilot for Calecute',
  blurb: 'The Melinde pilots know the monsoon. One of them may be willing to show a Portuguese captain.',
  offeredAt: ['melinde'],
  available: (g) => g.chronicle.act >= 3,
  offer: () => ({
    who: 'The sheikh of Melinde’s harbour-master',
    text: 'The Gujarati pilot is named Malemo, and he is the best on the coast. He has made the '
      + 'crossing to Calecute since before the Portuguese were a sea power, and he knows the days '
      + 'on which the wind turns. He will go with you if you ask properly, and will say so to '
      + 'nobody if you do not.',
    accept: 'Ask him to take you across',
  }),
  first: 'hire',
  steps: {
    hire: {
      goal: () => 'Ask the Gujarati pilot Malemo to take you across to Calecute, at Melinde.',
      marker: () => portMark('melinde', 'The pilot, Malemo'),
      when: (_g, _q, port) => port === 'melinde',
      scene: (_g, q) => scene(q, 'hire', 'Malemo',
        'He is forty, small, dry, and looks at the ship’s compass as if it were something a child '
        + 'had brought. He has a wooden instrument on his lap with a string through it: a '
        + 'kamal. "You want to go to Calecute," he says. "Everyone wants to go to Calecute. '
        + 'The question is when."',
        [
          {
            label: 'Give him a present, and ask',
            detail: '200 cruzados in cloth and silver. Nothing is asked of him but the crossing.',
            resolve: (gg) => {
              if (gg.crown.gold < 200) return later(q, 'He looks at your purse without seeming to. Come back with two hundred cruzados.');
              gg.crown.gold -= 200;
              q.flags.free = true;
              return go(gg, q, 'crossing', 'Gave Malemo a present of two hundred cruzados and he '
                + 'came aboard with his kamal. He will show you the crossing at the turn of the wind.');
            },
          },
          {
            label: 'Ask the sheikh to command it',
            detail: 'Quicker, and the pilot will not forget how he came aboard.',
            resolve: (gg) => {
              q.flags.commanded = true;
              gg.adjustPolity('malindi', { respect: -0.05 }, 'asked the sheikh to command a pilot');
              return go(gg, q, 'crossing', 'Had the sheikh command Malemo to take you across. He came aboard '
                + 'without a word, and has not looked at the compass since.');
            },
          },
        ]),
    },
    crossing: {
      goal: () => 'Cross the open sea to Calecute with Malemo at the monsoon’s turn.',
      marker: () => ({ lat: MONSOON.lat, lon: MONSOON.lon, nm: 240, label: 'The monsoon crossing' }),
      when: (g) => near(g, MONSOON, 260) && !g.dockedAt && g.sounding.shoreDistNm > 120,
      scene: (_g, q) => scene(q, 'crossing', 'What Malemo knows',
        'On the fourth day out of sight of land he has you stand to and looks for a long time at '
        + 'the colour of the water, the flight of a tern, and the set of the swell. Then he '
        + 'begins to talk — in a low voice, in pieces, to the helmsman and not to you — about what '
        + 'the wind does here in each month of the year, and where the sea turns, and which stars stand '
        + 'where on which night.'
        + (q.flags.commanded ? ' He does not look at you once.' : ''),
        [
          {
            label: 'Write it all down',
            detail: 'Every month. It takes the rest of the crossing.',
            resolve: (gg) => {
              const n = writeTheSea(gg, -10, 25, 45, 80);
              renown(gg, 30);
              return go(gg, q, 'calecute', `Wrote down the whole of Malemo’s monsoon: ${n} squares of the Indian `
                + 'Ocean are in your book now, every month of the year.');
            },
          },
        ]),
    },
    calecute: {
      goal: () => 'Put into Calecute; Malemo will go ashore there.',
      marker: () => portMark('calecute', 'Malemo’s farewell'),
      when: (_g, _q, port) => port === 'calecute',
      scene: (_g, q) => scene(q, 'calecute', 'A pilot’s leave',
        'He stands at the rail, looking at the town, and says that he has crossed this sea four hundred '
        + 'times and never before with anyone who wrote it down. He says it without rancour. '
        + 'He wants to know what is to be done with what he has said.',
        [
          {
            label: 'Give him his freedom, and a hundred cruzados',
            detail: q.flags.commanded ? 'He came aboard under command. This is the least he is owed.' : 'He asked for nothing but the crossing.',
            resolve: (gg) => {
              gg.crown.gold = Math.max(0, gg.crown.gold - 100);
              renown(gg, 30);
              gg.shiftPeopleRegard('gujarati', 0.25);
              return end(gg, q, 'freed', 'Paid Malemo a hundred cruzados at Calecute and let him go ashore. '
                + 'The pilots of the Gujarati ports know the name of the ship.');
            },
          },
          {
            label: 'Ask him to stay on as your pilot',
            detail: 'He would be the best in any ship in India. He would also be a prisoner of a kind.',
            resolve: (gg) => {
              gg.crew.morale = clamp(gg.crew.morale + 0.05, 0, 1);
              gg.shiftPeopleRegard('gujarati', -0.15);
              return end(gg, q, 'kept', 'Malemo stayed aboard as your pilot. He is the best you will have, '
                + 'and he has never said whether he wanted to.');
            },
          },
        ]),
    },
  },
};

const aprendiz: QuestDef = {
  id: 'aprendiz',
  title: 'The Stowaway',
  blurb: 'There is a boy in the lazarette who cannot be put ashore until somebody decides what he is for.',
  offeredAt: OUT,
  available: (g) => g.chronicle.act >= 1,
  offer: () => ({
    who: 'A cook’s mate, with a boy by the ear',
    text: 'He was found under the spare canvas, asleep and very hungry. He says he is fourteen. He '
      + 'says his name is Nuno, and that he can draw. He has a scrap of paper with a coast on '
      + 'it that is, the pilot says grudgingly, not bad.',
    accept: 'Keep him, and see what he can do',
  }),
  first: 'hold',
  steps: {
    hold: {
      goal: () => 'Decide what to do with the boy, on the way south: Las Palmas, Arguim, or Mina.',
      marker: () => portMark('arguim', 'The boy in the lazarette'),
      when: (_g, _q, port) => port === 'las-palmas' || port === 'arguim' || port === 'mina',
      scene: (_g, q) => scene(q, 'hold', 'Nuno',
        'The boy has been a week aboard and has worked out, without being taught, which man to be '
        + 'useful to. The pilot lets him sit with the chart. The cook has put him to peeling. He '
        + 'has drawn every headland you have passed, and got three of them right.',
        [
          {
            label: 'Put him to the pilot',
            detail: 'A boy who can draw a coast is worth more to the chart than to the galley.',
            resolve: (gg) => {
              q.flags.pilot = true;
              return go(gg, q, 'coast', 'Put Nuno to the pilot as a chart boy. He took to it the way some boys '
                + 'take to fighting.');
            },
          },
          {
            label: 'Keep him in the galley',
            detail: 'A boy has to earn his biscuit. The hands like him.',
            resolve: (gg) => {
              gg.crew.morale = clamp(gg.crew.morale + 0.04, 0, 1);
              return go(gg, q, 'coast', 'Kept Nuno in the galley. The hands gave him their crusts and taught '
                + 'him knots.');
            },
          },
        ]),
    },
    coast: {
      goal: () => 'Somewhere on the long coast south of the Congo, the boy’s drawing will be tested.',
      marker: () => portMark('benguela', 'Nuno’s coast'),
      when: (_g, _q, port) => port === 'benguela' || port === 'luanda' || port === 'angra-pequena',
      scene: (_g, q) => scene(q, 'coast', 'A coast drawn from the masthead',
        'You have been writing the coast from the deck for a month and it has come out with the land '
        + 'in the wrong place. Nuno has been at the masthead every morning, and his drawing, which '
        + 'he has pinned above his hammock, has the land a full league east of where your chart puts it.',
        [
          {
            label: 'Check his drawing against the chart',
            detail: 'Half a day, and a bruised pride if the boy is right.',
            resolve: (gg) => {
              const right = !!q.flags.pilot || gg.rng.chance(0.5);
              if (right) {
                const n = writeTheSea(gg, -40, -5, 5, 25);
                renown(gg, 15);
                return go(gg, q, 'home', `The boy was right. His drawing corrected ${n} squares of this coast in your book `
                  + 'and embarrassed the pilot, who has asked him to stay.');
              }
              return go(gg, q, 'home', 'The boy was wrong by a league, but it was a good drawing. He wept. '
                + 'The hands, for once, said nothing.');
            },
          },
        ]),
    },
    home: {
      goal: () => 'The boy has a mother. She is at Lisbon, or Lagos, or Funchal.',
      marker: () => portMark('lagos', 'Nuno’s mother'),
      when: (_g, _q, port) => port === 'funchal' || port === 'lagos' || port === 'lisboa',
      scene: (_g, q) => scene(q, 'home', 'Nuno’s mother',
        'She is a fishwife, forty and stout, and she has been standing on the quay since she '
        + 'heard the ship was in. She sees the boy on the gangway and does not shout. She cries, '
        + 'and then she does shout.',
        [
          {
            label: 'Give her his wages, and let him choose',
            detail: 'Fifty cruzados. He has earned it, and more.',
            resolve: (gg) => {
              gg.crown.gold = Math.max(0, gg.crown.gold - 50);
              renown(gg, 25);
              return end(gg, q, 'chose', 'Gave Nuno’s mother his wages. The boy stayed on the quay for one night and '
                + 'was aboard again before the tide. His mother lit a candle for you.');
            },
          },
          {
            label: 'Send him home with her',
            detail: 'He is fourteen. The sea will keep.',
            resolve: (gg) => {
              renown(gg, 15);
              gg.crew.morale = clamp(gg.crew.morale - 0.03, 0, 1);
              return end(gg, q, 'home', 'Sent Nuno home to his mother. You will not know what became of '
                + 'him.');
            },
          },
        ]),
    },
  },
};

// ---------------------------------------------------------------------------
// 17–18. The way home: the last act is a cargo carried back, and these two lie
// along that road in the order a homeward ship meets them.

const sofala: QuestDef = {
  id: 'sofala',
  title: 'The Gold of Çofala',
  blurb: 'The Swahili coast has been bringing gold out of the interior for five hundred years. Find where from.',
  offeredAt: ['melinde', 'quiloa', 'mocambique', 'mombaca'],
  available: (g) => g.chronicle.act >= 4,
  offer: () => ({
    who: 'A gold-weigher’s clerk, at the water stairs',
    text: 'Covilhã’s letter said it, and the clerk says it plainer: the gold the dhows carry out of the '
      + 'south does not come from Kilwa, which only takes the tithe. It comes from a place called '
      + 'Çofala, a long way down the coast, where a river runs out of the interior and the gold is '
      + 'bought with cloth. He has never been. He knows a man who has.',
    accept: 'Ask him to tell you the man’s name',
  }),
  first: 'vizier',
  steps: {
    vizier: {
      goal: () => 'Hear what the vizier of Kilwa knows, at Quíloa.',
      marker: () => portMark('quiloa', 'The vizier of Kilwa'),
      when: (_g, _q, port) => port === 'quiloa',
      scene: (_g, q) => scene(q, 'vizier', 'The vizier of Kilwa',
        'He receives you in a courtyard with a fountain, offers sherbet, and listens for a long time '
        + 'before he speaks. Kilwa has had the gold trade for three centuries and is not anxious to '
        + 'share it with a nation it has met twice. He is, however, a practical man, and there is '
        + 'something he would like: a hundred cruzados of Portuguese cloth, and the King’s word that '
        + 'the ships will not call at Çofala without calling here first.',
        [
          {
            label: 'Give him the cloth, and the word',
            detail: '100 cruzados. A promise the King may not thank you for.',
            resolve: (gg) => {
              if (gg.crown.gold < 100) return later(q, 'You have not got a hundred cruzados. The vizier is patient, but not indefinitely.');
              gg.crown.gold -= 100;
              leaveToTrade(gg, 'kilwa', { trust: 0.3, respect: 0.1 }, 'promised that the ships would call at Kilwa first');
              q.flags.promise = true;
              return go(gg, q, 'merchant', 'Gave the vizier of Kilwa a hundred cruzados of cloth and a promise that may not be the '
                + 'King’s to give. He named a Kilwa merchant at Moçambique who has been to Çofala.');
            },
          },
          {
            label: 'Give him the cloth, and no promise',
            detail: '100 cruzados. He will make a cooler note of you.',
            resolve: (gg) => {
              if (gg.crown.gold < 100) return later(q, 'You have not got a hundred cruzados. The vizier is patient, but not indefinitely.');
              gg.crown.gold -= 100;
              leaveToTrade(gg, 'kilwa', { trust: 0.1 }, 'gave a present at Kilwa');
              return go(gg, q, 'merchant', 'Gave the vizier of Kilwa cloth and no promise. He named a Kilwa merchant at '
                + 'Moçambique who has been to Çofala, without warmth.');
            },
          },
        ]),
    },
    merchant: {
      goal: () => 'Find the Kilwa merchant who has been to Çofala, at Moçambique.',
      marker: () => portMark('mocambique', 'The Kilwa merchant'),
      when: (_g, _q, port) => port === 'mocambique',
      scene: (_g, q) => scene(q, 'merchant', 'Yusuf of Kilwa',
        'He is a spare, hooded man in the lee of a warehouse, and he does not want to be seen '
        + 'talking to you. He has been to Çofala eleven times. He will say where it is, and what '
        + 'the Sheikh there charges, and which season the river is passable, for the price of his '
        + 'passage south.'
        + (q.flags.promise ? ' He knows about the promise, and is thoughtful about it.' : ''),
        [
          {
            label: 'Carry him to Çofala',
            detail: 'A few days south and back in the channel. He will pilot.',
            resolve: (gg) => {
              q.flags.yusuf = true;
              const n = writeTheSea(gg, -27, -12, 32, 44);
              return go(gg, q, 'gold', `Took Yusuf aboard for Çofala. His pilotage of the channel fills ${n} squares of your book.`);
            },
          },
          {
            label: 'Get the marks from him, and go without him',
            detail: 'He will tell you for a hundred cruzados. You will pilot yourself.',
            resolve: (gg) => {
              if (gg.crown.gold < 100) return later(q, 'He will not give marks for less than a hundred cruzados.');
              gg.crown.gold -= 100;
              return go(gg, q, 'gold', 'Paid Yusuf for the marks to Çofala and sailed without him.');
            },
          },
        ]),
    },
    gold: {
      goal: () => 'Put into Çofala, where the gold comes out to the coast.',
      marker: () => portMark('sofala', 'Çofala'),
      when: (_g, _q, port) => port === 'sofala',
      scene: (_g, q) => scene(q, 'gold', 'Çofala',
        'The Sheikh of Çofala receives you on the beach in a silk robe under an awning of matting, and '
        + 'has the gold brought down in a bowl. It is in grains, and small bars, and a few things shaped '
        + 'like beads. It is the gold of Mina under another sun.'
        + (q.flags.yusuf ? ' Yusuf stands behind you and does not speak, and the Sheikh addresses him as an old friend.' : ''),
        [
          {
            label: 'Buy gold, fairly, for cloth',
            detail: 'A few marcos now, at the Sheikh’s price. A standing welcome for a Portuguese ship.',
            resolve: (gg) => {
              gg.ship.addCargo('ouro', 20, 0, 0.7);
              leaveToTrade(gg, 'kilwa', { trust: 0.25, respect: 0.1 }, 'traded fairly at Çofala');
              renown(gg, 40);
              return end(gg, q, 'fair', 'Traded fairly for Çofala’s gold. The Sheikh has sent word along the coast that the Portuguese pay what they say.');
            },
          },
          {
            label: 'Take the route, and leave the gold',
            detail: 'Every reach of the river, for the King’s factors. The Sheikh will not know till they come.',
            resolve: (gg) => {
              renown(gg, 80);
              gg.crown.gold += 400;
              leaveToTrade(gg, 'kilwa', { trust: -0.3 }, 'noted the road to the gold and took it to the Crown');
              return end(gg, q, 'route', 'Wrote down the road to Çofala for the Crown. The King’s factors will have it by the next fleet, and the Sheikh will not forgive it.');
            },
          },
        ]),
    },
  },
};

const count: QuestDef = {
  id: 'count',
  title: 'The Count',
  blurb: 'The pepper is weighed at Lisbon against the clerk’s book. What is in the hold and what is written need not agree.',
  offeredAt: ['cochim', 'calecute', 'cananor', 'melinde'],
  available: (g) => g.chronicle.act >= 5,
  offer: () => ({
    who: 'The King’s factor, in the pepper house',
    text: 'He is a careful man, and he is having a bad year. "There is always some that does not '
      + 'come to the weigh-house," he says. "The fleet’s captains take it for granted. I am asking '
      + 'nothing. I am only saying that if a forty-quintal parcel were to be stowed where the clerk '
      + 'would not think to look, nobody in Lisbon would be any the wiser."',
    accept: 'Listen to what he is suggesting',
  }),
  first: 'parcel',
  steps: {
    parcel: {
      goal: () => 'Decide about the factor’s parcel, at the pepper port.',
      marker: () => portMark('cochim', 'The factor’s parcel'),
      when: (_g, _q, port) => port === 'cochim' || port === 'calecute' || port === 'cananor',
      scene: (g, q) => scene(q, 'parcel', 'Forty quintals',
        'It would be a fortune, more than a year’s pay, and a third of it would be the factor’s. '
        + (hasOfficer(g, 'escrivao')
          ? `${hasOfficer(g, 'escrivao')}, the clerk, is standing at your shoulder with his book open, very still.`
          : 'There is no clerk aboard to ask awkward questions.'),
        [
          {
            label: 'Take the parcel',
            detail: 'Stowed in the lazarette under the spare sails. Not in the book.',
            resolve: (gg) => {
              q.flags.parcel = true;
              renown(gg, -5);
              return go(gg, q, 'cape', 'Took the factor’s forty quintals aboard unwritten. They are in the lazarette, under the spare canvas.');
            },
          },
          {
            label: 'Refuse, and have him put it in the book',
            detail: 'A forty-quintal parcel honestly declared is the King’s, and so is the profit.',
            resolve: (gg) => {
              renown(gg, 25);
              q.flags.honest = true;
              return go(gg, q, 'cape', 'Refused the factor’s parcel and saw the pepper weighed into the book. He shrugged, and was quietly relieved.');
            },
          },
        ]),
    },
    cape: {
      goal: () => 'Round the Cape homeward. The clerk will want a word.',
      marker: () => ({ lat: -34.4, lon: 18.5, nm: 180, label: 'The Cape, homeward' }),
      when: (g) => near(g, { lat: -34.4, lon: 18.5 }, 180) && !g.dockedAt,
      scene: (g, q) => {
        const clerk = hasOfficer(g, 'escrivao');
        return scene(q, 'cape', 'The clerk’s book',
          q.flags.parcel
            ? (clerk
              ? `${clerk} has been counting the sacks on deck, and has come to the number in the book and the number under the sail, and has found they do not agree. He does not raise his voice.`
              : 'A hand aboard has been at the lazarette, and is thoughtful about what he found there.')
            : 'The hold is written up honestly, and the clerk is more at ease than he has been since Cochim. He says the weigh-house at Lisbon will take the book without a murmur.',
          q.flags.parcel
            ? [
              {
                label: 'Have him write it in, and pay the King’s share',
                detail: 'The forty quintals go in the book. The profit is a third of what it was.',
                resolve: (gg) => {
                  q.flags.declared = true;
                  renown(gg, 10);
                  return go(gg, q, 'weigh', 'Had the clerk write the factor’s parcel into the book, and the King will have his share.');
                },
              },
              {
                label: 'Give him a hundred cruzados to forget it',
                detail: 'He is an honest man, and an honest man can be bought once.',
                resolve: (gg) => {
                  gg.crown.gold = Math.max(0, gg.crown.gold - 100);
                  q.flags.hidden = true;
                  return go(gg, q, 'weigh', 'Bought the clerk’s silence for a hundred cruzados. He has not looked you in the eye since.');
                },
              },
            ]
            : [
              {
                label: 'Commend him for it',
                detail: 'He will say so at Lisbon.',
                resolve: (gg) => {
                  renown(gg, 10);
                  gg.crew.morale = clamp(gg.crew.morale + 0.03, 0, 1);
                  return go(gg, q, 'weigh', 'Commended the clerk for an honest book.');
                },
              },
            ], 'note');
      },
    },
    weigh: {
      goal: () => 'The weigh-house at Lisbon.',
      marker: () => portMark('lisboa', 'The weigh-house'),
      when: (_g, _q, port) => port === 'lisboa',
      scene: (_g, q) => scene(q, 'weigh', 'The weigh-house',
        q.flags.hidden
          ? 'The Casa’s weighers are thorough, and they have a long pole, and a habit of using it on lazarettes. '
            + 'The contador stands at the head of the stair and does not look at you.'
          : 'The Casa’s weighers are thorough, and find nothing to add to the clerk’s book. The contador reads it twice '
            + 'and stamps it with no expression at all.',
        q.flags.hidden
          ? [
            {
              label: 'Stand on your word',
              detail: q.flags.hidden ? 'If they find it, it is a hanging matter for somebody, and not the factor.' : '',
              resolve: (gg) => {
                if (gg.rng.chance(0.4)) {
                  gg.crown.gold = Math.max(0, gg.crown.gold - 600);
                  renown(gg, -60);
                  return end(gg, q, 'caught', 'The pepper under the spare sails was found, and the Casa fined you six hundred cruzados. The court will remember it.');
                }
                gg.crown.gold += 700;
                return end(gg, q, 'got away', 'The weigh-house missed the parcel. It is worth seven hundred cruzados, and you will never mention it.');
              },
            },
          ]
          : [
            {
              label: 'Let the weigh-house do its work',
              detail: q.flags.declared ? 'A third of the parcel is yours, honestly.' : 'Nothing to hide, nothing to gain, nothing to fear.',
              resolve: (gg) => {
                const gain = q.flags.declared ? 200 : 0;
                gg.crown.gold += gain;
                renown(gg, q.flags.declared ? 25 : 45);
                return end(gg, q, q.flags.declared ? 'declared' : 'honest',
                  q.flags.declared
                    ? 'The weigh-house took the factor’s parcel into the book, and the Casa’s cut was paid.'
                    : 'The weigh-house found the book as written. The contador has said your name to the King as an example.');
              },
            },
          ],
        q.flags.hidden ? 'warning' : 'note'),
    },
  },
};

// ---------------------------------------------------------------------------
// 19–21. The Malabar coast and what lies beyond it: the far end of the road, where the last act's
// pepper is bought and the first real trouble with the merchants who held it before.

/** Between Calecute and Cananor, where the coastal dhows pass. */
const DHOW_LANE: LatLon = { lat: 11.55, lon: 75.1 };

const feitorCalecute: QuestDef = {
  id: 'feitorcal',
  title: 'The Factory at Calecute',
  blurb: 'The factor at Calecute is frightened, and the men who make him so have not said why.',
  offeredAt: ['melinde', 'mocambique', 'calecute', 'cananor', 'cochim'],
  available: (g) => g.chronicle.act >= 4,
  offer: () => ({
    who: 'A fleet’s courier, with a packet',
    text: 'The captain-major’s compliments. He has a fleet a month behind you, and a letter from the '
      + 'factor at Calecute that the courier says is "not what a King’s factor writes", and he would be '
      + 'obliged if the nearest captain on the coast would go and see what is the matter before the '
      + 'fleet comes in.',
    accept: 'Take the factor’s letter, and go and see',
  }),
  first: 'factor',
  steps: {
    factor: {
      goal: () => 'See the factor at Calecute and judge for yourself.',
      marker: () => portMark('calecute', 'The factor, Aires Correia'),
      when: (_g, _q, port) => port === 'calecute',
      scene: (_g, q) => scene(q, 'factor', 'The factory at Calecute',
        'The Portuguese house on the waterfront has its shutters half closed in the middle of the day. Aires '
        + 'Correia, the factor, takes you into a back room and tells you in a low voice what he has not '
        + 'dared put in a letter: the Moorish pepper merchants have lost three years’ trade to the King’s '
        + 'prices, the Zamorin’s ministers have stopped meeting him, and on Friday a man in the bazaar '
        + 'said, pleasantly, that the house would make a good fire.',
        [
          {
            label: 'Put your own men in the house, and build a stockade',
            detail: '250 cruzados and six of your hands, and the Zamorin will know you fear him.',
            resolve: (gg) => {
              if (gg.crown.gold < 250) return later(q, 'You have not got the two hundred and fifty to build with. Aires will wait.');
              gg.crown.gold -= 250;
              gg.crew.morale = clamp(gg.crew.morale - 0.03, 0, 1);
              q.flags.armed = true;
              gg.adjustPolity('calicut', { respect: 0.1, trust: -0.1 }, 'fortified the Portuguese factory');
              return go(gg, q, 'aftermath', 'Raised a stockade round the factory at Calecute and left six of your hands in it. Aires Correia wept. '
                + 'The Zamorin’s ministers have begun to meet him again, stiffly.');
            },
          },
          {
            label: 'Take the factor and the stock off, and sail for Cochim',
            detail: 'The King loses a position. Aires keeps his life, and so do you.',
            resolve: (gg) => {
              q.flags.evacuated = true;
              renown(gg, -10);
              gg.adjustPolity('calicut', { trust: -0.1 }, 'withdrew the Portuguese factor');
              return go(gg, q, 'aftermath', 'Took the factor and the stock off from Calecute and stood down the coast for Cochim. '
                + 'The house is shuttered, and will not open again until the fleet comes.');
            },
          },
          {
            label: 'Go to the Zamorin, and ask for his word',
            detail: 'A King’s word is a King’s word. It may also be a great deal less.',
            resolve: (gg) => {
              q.flags.trusted = true;
              gg.adjustPolity('calicut', { trust: 0.15, respect: 0.05 }, 'asked the Zamorin for his word');
              renown(gg, 10);
              return go(gg, q, 'aftermath', 'Went to the Zamorin and asked for his word that the factory would be left in peace. '
                + 'He gave it gravely, and the Mappila merchants at his elbow said nothing at all.');
            },
          },
        ], 'warning'),
    },
    aftermath: {
      goal: () => 'Put into Cochim, and hear what comes of it.',
      marker: () => portMark('cochim', 'News from Calecute'),
      when: (g, q, port) => port === 'cochim' && g.clock.t - q.stepT > 30 * DAY,
      scene: (g, q) => {
        // What the merchants do is partly dice, weighted by what was done about it.
        const risk = q.flags.armed ? 0.25 : q.flags.evacuated ? 0.1 : 0.6;
        const riot = gg_rng(g) < risk;
        q.flags.riot = riot;
        return scene(q, 'aftermath', riot ? 'Fire at Calecute' : 'A quiet month at Calecute',
          riot
            ? 'The word reaches Cochim on a fisher’s boat: the Mappila crowd came down to the Portuguese '
              + 'house on the Friday, and the Zamorin’s guard did not stop them.'
              + (q.flags.armed ? ' Your stockade held for a night. The six men in it are alive, and so is Aires Correia, and the house is ash.'
                : q.flags.evacuated ? ' The house burned with nobody in it, and the stock you took away is the only Portuguese pepper on the coast.'
                  : ' Aires Correia and every man in the house are dead. Nobody will say who opened the gate.')
            : 'The word reaches Cochim with a pepper broker: nothing has happened at Calecute. The Mappila '
              + 'merchants have sulked, the Zamorin’s ministers have kept their word, and the factory is open. '
              + 'You are told, several times, that it was very sensible of you.',
          riot
            ? [
              {
                label: 'Offer the Raja of Cochim the King’s friendship',
                detail: 'He has been waiting for this, and will say so. A factory here, and an ally against Calicut.',
                resolve: (gg) => {
                  allyWithCochin(gg);
                  renown(gg, q.flags.armed ? 55 : q.flags.evacuated ? 35 : -20);
                  return end(gg, q, 'riot', 'Calecute burned the King’s factory, and Cochim took the King’s side. Cochim is now an ally, and there is a pepper house '
                    + 'here where the stock from Calecute is kept.');
                },
              },
              {
                label: 'Ask for nothing, and carry the news home',
                detail: 'The fleet will want the account from somebody who was there.',
                resolve: (gg) => {
                  renown(gg, q.flags.armed ? 40 : 10);
                  gg.adjustPolity('calicut', { trust: -0.3 }, 'a Portuguese factory burned at Calecute');
                  return end(gg, q, 'riot-home', 'Carried the news of the burning home. The Zamorin is now, for practical purposes, an enemy, and Cochim '
                    + 'is the only friend on this coast.');
                },
              },
            ]
            : [
              {
                label: 'Go back and thank the factor',
                detail: 'A present of cloth. He earned it.',
                resolve: (gg) => {
                  gg.crown.gold = Math.max(0, gg.crown.gold - 60);
                  renown(gg, 45);
                  gg.adjustPolity('calicut', { trust: 0.15 }, 'the factory kept the peace');
                  return end(gg, q, 'peace', 'Calecute stayed quiet, and the King’s factory stayed open. The fleet will come into a harbour that still '
                    + 'has a Portuguese house in it.');
                },
              },
            ],
          riot ? 'warning' : 'note');
      },
    },
  },
};

/** A roll drawn from the game's own generator, so the scene is repeatable from a save. */
function gg_rng(g: Game): number { return g.rng.next(); }

const mappila: QuestDef = {
  id: 'mappila',
  title: 'The Pepper Houses',
  blurb: 'The Moorish merchants of the Malabar coast held the pepper trade before you came, and have opinions about it.',
  offeredAt: ['calecute', 'cochim', 'cananor'],
  available: (g) => g.chronicle.act >= 4,
  offer: () => ({
    who: 'A pepper broker in a grey turban',
    text: 'He has been at the water stairs for three days, and he is very polite. There are merchants, he '
      + 'says, who would rather sell a hundred quintals to a captain who will pay in silver on the beach '
      + 'than to a King’s factor who pays in promises. There would be no paper. There would be no '
      + 'commission. He has a house he would like to show you.',
    accept: 'Go and see the house',
  }),
  first: 'house',
  steps: {
    house: {
      goal: () => 'Hear the merchants’ offer, at Calecute, Cochim or Cananor.',
      marker: () => portMark('calecute', 'The pepper house'),
      when: (_g, _q, port) => port === 'calecute' || port === 'cochim' || port === 'cananor',
      scene: (_g, q) => scene(q, 'house', 'The house on the canal',
        'It is a stone warehouse with a carved door, a great many clerks, and sacks of pepper stacked to the '
        + 'rafters. The owner, Khwaja Muhammad, pours tea. He would like to sell you a hundred quintals at '
        + 'a third less than the Crown’s price and he would like it not to appear in any book. He would also, '
        + 'he says, be glad of a Portuguese captain who could be talked to.',
        [
          {
            label: 'Buy the hundred quintals, off the books',
            detail: 'A great deal of money, and the King’s factor will not like it if he hears.',
            resolve: (gg) => {
              const n = gg.ship.addCargo('pimenta', 100, 0, 0.75);
              q.flags.bought = true;
              gg.secretsHeard.push('pepper-off-books');
              renown(gg, -10);
              return go(gg, q, 'dhows', `Took ${n} quintals of pepper from Khwaja Muhammad's house and entered none of it. `
                + 'The King’s factor will hear, eventually. Coastal dhows pass between here and Cananor.');
            },
          },
          {
            label: 'Decline, and tell him the King’s price is the King’s price',
            detail: 'He will not be offended. He will remember.',
            resolve: (gg) => {
              renown(gg, 15);
              q.flags.refused = true;
              return go(gg, q, 'dhows', 'Declined Khwaja Muhammad’s off-book pepper. He bowed, and poured more tea. '
                + 'Coastal dhows pass between here and Cananor.');
            },
          },
          {
            label: 'Decline, and tell the King’s factor',
            detail: 'The Crown will act on it. The merchants will know who told.',
            resolve: (gg) => {
              renown(gg, 35);
              gg.crown.gold += 150;
              q.flags.informed = true;
              gg.adjustPolity('calicut', { respect: -0.1 }, 'informed on the pepper houses');
              return go(gg, q, 'dhows', 'Told the King’s factor about Khwaja Muhammad’s offer. The factor paid 150 cruzados and was not as glad as he '
                + 'might have been. Coastal dhows pass between here and Cananor.');
            },
          },
        ]),
    },
    dhows: {
      goal: () => 'The coastal dhows pass between Calecute and Cananor; look at what they carry.',
      marker: () => ({ lat: DHOW_LANE.lat, lon: DHOW_LANE.lon, nm: 60, label: 'The dhow lane' }),
      when: (g) => near(g, DHOW_LANE, 35) && !g.dockedAt,
      scene: (_g, q) => scene(q, 'dhows', 'Six dhows in line',
        'They come out of the haze abreast, laden to the wash, bound up the coast for Cambaia: Mappila '
        + 'pepper for the Red Sea. Every one of them is carrying what the King’s ships are supposed to '
        + 'carry. '
        + (q.flags.bought ? 'One of them has a carved door on her stern that you recognise.' : 'Nobody aboard them has a pass.'),
        [
          {
            label: 'Stop and search them for the King',
            detail: 'The King’s law says the pepper is his. The merchants’ law says otherwise, and so does the coast.',
            resolve: (gg) => {
              const n = gg.ship.addCargo('pimenta', 40, 0, 0.7);
              renown(gg, 35);
              q.flags.searched = true;
              gg.adjustPolity('calicut', { trust: -0.25, respect: 0.05 }, 'stopped and searched the coastal dhows');
              return go(gg, q, 'raja', `Stopped the dhows and took ${n} quintals as the King’s. The Mappila houses will long remember the ship.`);
            },
          },
          {
            label: 'Let them pass',
            detail: 'A man cannot stop every dhow on a coast, and you are one ship.',
            resolve: (gg) => go(gg, q, 'raja', 'Let the dhows go by. They dipped their flags as they passed, which might have been a courtesy.'),
          },
        ], 'warning'),
    },
    raja: {
      goal: () => 'The Raja of Cananor has heard, and wants a word.',
      marker: () => portMark('cananor', 'The Raja of Cananor'),
      when: (_g, _q, port) => port === 'cananor',
      scene: (_g, q) => scene(q, 'raja', 'The Kolathiri',
        'The Raja of Cananor is old, fat, and delighted to see you. The Zamorin’s enemy is his friend, he '
        + 'says, and a Portuguese ship is worth two regiments. '
        + (q.flags.searched ? 'He has heard about the dhows, and is very pleased. ' : q.flags.informed ? 'He has heard that there is an honest captain on the coast, and would like to see the animal. ' : '')
        + 'He would like a factory, and a treaty, and would like them both now.',
        [
          {
            label: 'Sign the treaty, and leave a factor',
            detail: 'Cananor against Calicut. It costs your word in both courts.',
            resolve: (gg) => {
              leaveToTrade(gg, 'kolathiri', { trust: 0.3, interest: 0.2 }, 'signed with the Kolathiri against Calicut');
              gg.relationsFor('cananor').factory = true;
              renown(gg, 60);
              gg.adjustPolity('calicut', { trust: -0.15 }, 'signed a treaty with Cananor');
              return end(gg, q, 'treaty', 'Signed the treaty with the Kolathiri of Cananor. There is ground for a factory, and a friend on the coast, '
                + 'and the Zamorin will not forget it.');
            },
          },
          {
            label: 'Take his friendship, but sign nothing',
            detail: 'A pleasant lunch, a cargo of rice, and no promises.',
            resolve: (gg) => {
              leaveToTrade(gg, 'kolathiri', { trust: 0.1 }, 'a cordial visit');
              renown(gg, 20);
              return end(gg, q, 'friendly', 'Dined with the Raja of Cananor and signed nothing. He sent a cargo of rice to the ship with his regards.');
            },
          },
        ]),
    },
  },
};

const malay: QuestDef = {
  id: 'malay',
  title: 'The Cinnamon Island',
  blurb: 'A Malay merchant at Cochim has letters to Ceylon and Malacca. Nobody in Portugal has ever been further.',
  offeredAt: ['cochim', 'calecute', 'cananor'],
  available: (g) => g.chronicle.act >= 4 && g.crown.lifetimeStanding >= 250,
  offer: () => ({
    who: 'Nina Chatu, a Malay merchant, at the water stairs',
    text: 'He is sixty, small, tattooed to the wrist, and has been sailing this sea since before the '
      + 'Portuguese were a nation. He has letters of introduction to the King of Kotte and to the Sultan of '
      + 'Malacca, and a passage he would like to make. He will go, he says, with any captain who cares to '
      + 'see where the cloves come from.',
    accept: 'Take his letters, and go to Ceylon',
  }),
  first: 'kotte',
  steps: {
    kotte: {
      goal: () => 'Bear away for Ceylon with Nina Chatu’s letter to the King of Kotte, at Columbo.',
      marker: () => portMark('columbo', 'The King of Kotte'),
      when: (_g, _q, port) => port === 'columbo',
      scene: (_g, q) => scene(q, 'kotte', 'The cinnamon gardens',
        'Columbo is a white town under palm trees, and the cinnamon is not a crop but a forest: men '
        + 'strip the bark from wild trees in the hills and carry it down in bundles. The King of Kotte '
        + 'receives you on a cushion under an umbrella, reads Nina Chatu’s letter twice, and names his '
        + 'terms: a yearly tribute of cloth and silver to a factory here, in return for the King of '
        + 'Portugal’s friendship and a monopoly on Portuguese shipping.',
        [
          {
            label: 'Agree, and carry the first cinnamon home',
            detail: '200 cruzados of tribute now. Thirty quintals of the finest cinnamon in the world, aboard.',
            resolve: (gg) => {
              if (gg.crown.gold < 200) return later(q, 'The King wants two hundred cruzados of tribute, and there is not that much in the purse.');
              gg.crown.gold -= 200;
              gg.ship.addCargo('canela', 30, 0, 0.85);
              leaveToTrade(gg, 'kotte', { trust: 0.3, respect: 0.1 }, 'agreed the King of Kotte’s terms');
              gg.relationsFor('columbo').factory = true;
              q.flags.tribute = true;
              return go(gg, q, 'strait', 'Agreed the King of Kotte’s terms and loaded thirty quintals of cinnamon. Nina Chatu says Malacca is three weeks '
                + 'east on the monsoon, past the Nicobars and the great strait.');
            },
          },
          {
            label: 'Take the cinnamon and promise nothing',
            detail: 'Buy what he has on the quay, at the price, and leave the treaty for the King of Portugal.',
            resolve: (gg) => {
              gg.ship.addCargo('canela', 15, 0, 0.8);
              leaveToTrade(gg, 'kotte', { trust: 0.1 }, 'traded at Columbo');
              return go(gg, q, 'strait', 'Bought what cinnamon the quay had and promised the King of Kotte nothing. Nina Chatu says Malacca is three weeks '
                + 'east on the monsoon, past the Nicobars and the great strait.');
            },
          },
        ]),
    },
    strait: {
      goal: () => 'Malacca, at the end of the strait, is the last port of the Indian Ocean.',
      marker: () => portMark('malaca', 'Malacca'),
      when: (_g, _q, port) => port === 'malaca',
      scene: (_g, q) => scene(q, 'strait', 'The strait of Malacca',
        'Malacca is the largest port you have ever seen. A thousand ships at once in a roadstead crowded '
        + 'with junks, dhows, prahus, and every kind of hull that has ever floated in the eastern seas. There '
        + 'are four harbour-masters, one for every nation’s merchants, and the Sultan’s palace stands over '
        + 'the whole. The merchants have heard of the Portuguese, and are divided about it.',
        [
          {
            label: 'Present Nina Chatu’s letter to the Sultan',
            detail: 'A cordial beginning. The Sultan wants to know what a Portuguese captain has brought to sell.',
            resolve: (gg) => {
              leaveToTrade(gg, 'malacca', { trust: 0.25, respect: 0.1 }, 'presented a letter of introduction');
              gg.ship.addCargo('cravo', 15, 0, 0.8);
              gg.ship.addCargo('noz', 10, 0, 0.8);
              const n = writeTheSea(gg, -8, 15, 78, 110);
              renown(gg, 120);
              return end(gg, q, 'malacca', `The Sultan of Malacca received you, and cloves and nutmeg are in the hold. ${n} squares of the Bay of Bengal `
                + 'and the strait are in your book. Nobody from Portugal has been so far east.');
            },
          },
          {
            label: 'Buy what you can at the quay, unannounced',
            detail: 'Less ceremony, less risk, and less of a name.',
            resolve: (gg) => {
              gg.ship.addCargo('cravo', 8, 0, 0.7);
              const n = writeTheSea(gg, -8, 15, 78, 110);
              renown(gg, 60);
              return end(gg, q, 'quay', `Bought cloves on the Malacca quay and left before anybody asked who you were. ${n} squares of the strait are in your book.`);
            },
          },
        ]),
    },
  },
};

// ---------------------------------------------------------------------------
// 22–24. The last act: the pepper race, the fleet that cannot afford a fever, and what the King offers.

const pepperRace: QuestDef = {
  id: 'pepperrace',
  title: 'The Pepper Race',
  blurb: 'Your rival has the same idea about the first great cargo home, and a faster ship.',
  offeredAt: ['cochim', 'calecute', 'cananor'],
  available: (g) => g.chronicle.act >= 5,
  offer: (g) => ({
    who: `${g.rival.name}’s factor, on the quay`,
    text: `${g.rival.name}’s ship, the ${g.rival.ship}, has been in the roads for a week and her factor has bought `
      + 'every quintal of pepper that came down from the hills, at whatever was asked. He would like, he says, to '
      + 'propose a division of the coast. Nobody has proposed one to you before, and nobody has been so polite.',
    accept: 'Hear what he is proposing',
  }),
  first: 'outbid',
  steps: {
    outbid: {
      goal: () => 'Decide how to meet the rival’s buying, at the pepper ports.',
      marker: () => portMark('cochim', 'The rival’s factor'),
      when: (_g, _q, port) => port === 'cochim' || port === 'calecute' || port === 'cananor',
      scene: (g, q) => scene(q, 'outbid', 'The pepper market',
        `${g.rival.name}’s man has tied up the market with money: the brokers will sell you pepper, but only what `
        + 'he has left them, and at a price that makes a hundred quintals a fortnight’s profit. '
        + 'There is, he says, enough on this coast for two fleets. There is not, in this market, this month.',
        [
          {
            label: 'Outbid him',
            detail: '500 cruzados to pay up the brokers. You will have the pepper, and he will know how.',
            resolve: (gg) => {
              if (gg.crown.gold < 500) return later(q, 'You have not got five hundred cruzados to outbid him with.');
              gg.crown.gold -= 500;
              const n = gg.ship.addCargo('pimenta', 60, 0, 0.8);
              q.flags.outbid = true;
              gg.rival.standing = Math.max(0, gg.rival.standing - 15);
              return go(gg, q, 'chase', `Outbid ${gg.rival.name}’s factor and took ${n} quintals of pepper for five hundred cruzados. He bowed, and was not gracious.`);
            },
          },
          {
            label: 'Divide the coast with him',
            detail: 'Cochim for him, Calecute for you. A gentleman’s arrangement, and a cheaper one.',
            resolve: (gg) => {
              q.flags.divided = true;
              gg.ship.addCargo('pimenta', 30, 0, 0.75);
              renown(gg, 20);
              return go(gg, q, 'chase', `Divided the Malabar coast with ${gg.rival.name}. It was civil, and neither of you believed in it.`);
            },
          },
          {
            label: 'Delay his ship',
            detail: 'A word to the harbour-master, a few bribes, and a cable that will not come up. Dishonourable, and effective.',
            resolve: (gg) => {
              q.flags.sabotage = true;
              gg.crown.gold = Math.max(0, gg.crown.gold - 150);
              renown(gg, -15);
              gg.ship.addCargo('pimenta', 20, 0, 0.7);
              return go(gg, q, 'chase', 'Saw to it that the rival’s cable would not come up, and sailed with a head start. He will find out, eventually.');
            },
          },
        ]),
    },
    chase: {
      goal: () => 'Round the Cape homeward. The rival is somewhere behind you, or ahead.',
      marker: () => ({ lat: -34.4, lon: 18.5, nm: 180, label: 'The Cape, homeward' }),
      when: (g) => near(g, { lat: -34.4, lon: 18.5 }, 200) && !g.dockedAt,
      scene: (g, q) => scene(q, 'chase', 'A sail astern',
        q.flags.sabotage
          ? 'There is no sail astern. There has been none since Cochim, and the master has begun to notice.'
          : `A sail has been in your wake since the Cape, always the same distance: the ${g.rival.ship}, carrying every stitch she owns. `
            + 'She is, the pilot says, the faster ship on this point of sail.',
        q.flags.sabotage
          ? [
            {
              label: 'Sail on at an easy pace',
              detail: 'You have the lead. Keep the ship in one piece.',
              resolve: (gg) => go(gg, q, 'landing', 'Kept an easy pace homeward with a clear lead.'),
            },
          ]
          : [
            {
              label: 'Crack on, every stitch',
              detail: 'Spars and men pay for it. The hull will remember.',
              resolve: (gg) => {
                gg.crew.morale = clamp(gg.crew.morale - 0.06, 0, 1);
                gg.ship.condition.hull = clamp(gg.ship.condition.hull - 0.04, 0, 1);
                q.flags.pressed = true;
                return go(gg, q, 'landing', 'Drove her homeward under every stitch she owned. The hands are exhausted, and the sail astern has not gained a yard.');
              },
            },
            {
              label: 'Hold your course and your nerve',
              detail: 'A ship you can keep is worth more than a day.',
              resolve: (gg) => go(gg, q, 'landing', 'Held your course and let the sail astern do as she liked.'),
            },
          ]),
    },
    landing: {
      goal: () => 'Into the Tagus, and see who lands first.',
      marker: () => portMark('lisboa', 'The Ribeira, and the pepper'),
      when: (_g, _q, port) => port === 'lisboa',
      scene: (g, q) => {
        // Who is first is what the voyage has made it, and a little luck.
        const edge = (q.flags.outbid ? 0.22 : 0) + (q.flags.sabotage ? 0.3 : 0) + (q.flags.pressed ? 0.15 : 0)
          + (q.flags.divided ? 0.05 : 0) + g.rng.next() * 0.45;
        const first = edge > 0.5;
        q.flags.first = first;
        return scene(q, 'landing', first ? 'First up the Tagus' : 'Second up the Tagus',
          first
            ? 'The Ribeira has turned out to watch. You come up with the tide and lie alongside before anyone has '
              + `seen a sail behind. The ${g.rival.ship} comes in an hour later, and ${g.rival.name} will not look at you.`
            : `The ${g.rival.ship} is at the Ribeira already, her pepper on the quay and the court’s clerks writing `
              + `down ${g.rival.name}’s name. You come in at the evening tide, and the pepper is worth exactly as much `
              + 'as it was in Cochim.',
          first
            ? [
              {
                label: 'Take the honours',
                detail: 'The first great pepper cargo. The King will remember whose.',
                resolve: (gg) => {
                  renown(gg, 150);
                  gg.rival.standing = Math.max(0, gg.rival.standing - 40);
                  gg.rival.eclipsed = true;
                  return end(gg, q, 'won', `Landed the first great cargo of pepper ahead of ${gg.rival.name}. The court will speak of it for a generation.`);
                },
              },
            ]
            : [
              {
                label: 'Congratulate him',
                detail: 'Graceful, and it costs nothing you had.',
                resolve: (gg) => {
                  renown(gg, 30);
                  return end(gg, q, 'second', `Came second up the Tagus behind ${gg.rival.name}, and was gracious about it. The King said so.`);
                },
              },
              {
                label: 'Say what you think of how he did it',
                detail: 'The court will like it or it will not.',
                resolve: (gg) => {
                  renown(gg, -10);
                  gg.rival.standing = Math.max(0, gg.rival.standing - 15);
                  return end(gg, q, 'quarrel', `Quarrelled with ${gg.rival.name} on the Ribeira in front of the court. Neither of you was the better for it.`);
                },
              },
            ],
          first ? 'note' : 'warning');
      },
    },
  },
};

const feverFleet: QuestDef = {
  id: 'feverfleet',
  title: 'The Fever Fleet',
  blurb: 'A ship of the fleet behind you is dying, and you are the only captain on the coast who can help.',
  offeredAt: ['mocambique', 'melinde', 'sofala'],
  available: (g) => g.chronicle.act >= 4,
  offer: () => ({
    who: 'A boat from a fleet ship, hailing the quay',
    text: 'She came in on the morning tide with her flag at half-mast and forty men down with the flux and '
      + 'the scurvy. Her master wants a surgeon, water, and a place ashore for the sick, and he is '
      + 'asking every captain in the road.',
    accept: 'Go aboard and see what is wrong',
  }),
  first: 'board',
  steps: {
    board: {
      goal: () => 'Go aboard the fever ship, in the road.',
      marker: () => portMark('mocambique', 'The fever ship'),
      when: (_g, _q, port) => port === 'mocambique' || port === 'melinde' || port === 'sofala',
      scene: (g, q) => scene(q, 'board', 'The São Vicente',
        'She stinks from the boat. The men lie in rows under the forecastle, and the master, Gonçalo Pires, is '
        + 'grey and still standing. Forty down, nine dead, and every man who can stand has been sick once. '
        + (hasOfficer(g, 'cirurgiao') ? `${hasOfficer(g, 'cirurgiao')} looks at the rows and says nothing for a long time.` : 'You have no surgeon to send.'),
        [
          {
            label: 'Lend your surgeon and fresh stores',
            detail: hasOfficer(g, 'cirurgiao') ? 'He will be gone some days, and so will a share of your fruit and water.' : 'You have none to lend.',
            resolve: (gg) => {
              if (!hasOfficer(gg, 'cirurgiao')) return later(q, 'You have no surgeon to send. The master watches you not send one.');
              gg.crew.provisions.water = Math.max(0, gg.crew.provisions.water - 12);
              q.flags.lent = true;
              renown(gg, 20);
              return go(gg, q, 'shore', 'Sent your surgeon and a share of the stores to the São Vicente. Gonçalo Pires has begun to hope.');
            },
          },
          {
            label: 'Take the worst of the sick aboard',
            detail: 'Twenty men in your own waist. It is very likely to spread.',
            resolve: (gg) => {
              gg.crew.sickness = clamp(gg.crew.sickness + 0.12, 0, 1);
              gg.crew.morale = clamp(gg.crew.morale - 0.04, 0, 1);
              q.flags.aboard = true;
              renown(gg, 40);
              return go(gg, q, 'shore', 'Took twenty of the São Vicente’s sick aboard. They are quiet, and grateful, and your own men keep a careful distance.');
            },
          },
          {
            label: 'Give water and leave them to it',
            detail: 'A cask, a prayer, and the road.',
            resolve: (gg) => {
              gg.crew.provisions.water = Math.max(0, gg.crew.provisions.water - 4);
              renown(gg, -5);
              return end(gg, q, 'left', 'Gave the São Vicente water, and left. The master thanked you civilly, and did not ask for more.');
            },
          },
        ], 'warning'),
    },
    shore: {
      goal: () => 'The sick are to be put ashore at the Aguada de São Brás, where the water is sweet.',
      marker: () => portMark('sao-bras', 'The Aguada de São Brás'),
      when: (_g, _q, port) => port === 'sao-bras',
      scene: (_g, q) => scene(q, 'shore', 'The Aguada de São Brás',
        'Sweet water from a stream behind the beach, fresh meat from the Khoikhoi herdsmen for beads and '
        + 'iron, and the sick laid out in the shade of a tarpaulin in a line along the sand. They get better '
        + 'quickly. By the third day the ones who will live are obvious.',
        [
          {
            label: 'Stay and nurse them until they can sail',
            detail: 'A fortnight. The Khoikhoi will trade cattle for iron, and the men will recover.',
            resolve: (gg) => {
              gg.clock.t += 14 * 86400;
              gg.crew.sickness = clamp(gg.crew.sickness - 0.1, 0, 1);
              gg.crew.morale = clamp(gg.crew.morale + 0.08, 0, 1);
              renown(gg, 50);
              gg.shiftPeopleRegard('khoikhoi', 0.2);
              return end(gg, q, 'nursed', 'Stayed a fortnight at the Aguada de São Brás and got the São Vicente’s men on their feet. Gonçalo Pires will be telling this '
                + 'in every tavern on the Tagus.');
            },
          },
          {
            label: 'Put them ashore and go on',
            detail: 'The fleet will pick them up. You have a cargo to get home.',
            resolve: (gg) => {
              renown(gg, 20);
              return end(gg, q, 'landed', 'Landed the São Vicente’s sick at the Aguada de São Brás and went on. Somebody else will have to carry them home.');
            },
          },
        ]),
    },
  },
};

const kingsOffer: QuestDef = {
  id: 'kingsoffer',
  title: 'What the King Offers',
  blurb: 'The pepper is home. The King wants to know what you would like.',
  offeredAt: ['lisboa'],
  available: (g) => g.chronicle.act >= 5,
  offer: () => ({
    who: 'A gentleman of the King’s chamber',
    text: 'The King has been told about the pepper, and about the road, and about the ship. He would like '
      + 'to see you privately, and has asked that you come in the evening when the court has gone home. '
      + 'The gentleman does not say what for. He says it is nothing to worry about, in a tone that '
      + 'suggests it is.',
    accept: 'Go, in the evening',
  }),
  first: 'audience',
  steps: {
    audience: {
      goal: () => 'Go to the King, privately, at Lisbon.',
      marker: () => portMark('lisboa', 'The King, in the evening'),
      when: (g, _q, port) => port === 'lisboa' && (g.chronicle.goalMet || g.ship.quantityOf('pimenta') >= 100),
      scene: (_g, q) => scene(q, 'audience', 'The King, in the evening',
        'He is in a small room with a window on the river, in an old coat, and he waves away the usher. '
        + 'He has a map on the table, the one you made, and he has put his glass on the Indies. "I have been '
        + 'told," he says, "that a great many men would like to have done what you have done. I find I '
        + 'would like to know what you want. Nobody ever asks the men who have it."',
        [
          {
            label: 'The command of the next armada',
            detail: 'A captain-major’s flag, forty ships, and a road that is yours. The Crown’s business from here to the end of your life.',
            resolve: (gg) => {
              gg.secretsHeard.push('captain-major');
              renown(gg, 120);
              gg.crown.gold += 2000;
              return end(gg, q, 'armada', 'The King named you captain-major of the next armada to the Indies. The road is yours, and so is whatever the road brings.');
            },
          },
          {
            label: 'A lordship, and the quiet of the land',
            detail: 'Senhor de a town with rents and a gallows. The sea is a long way from it.',
            resolve: (gg) => {
              gg.estate.holdings.senhorio = 1;
              gg.estate.lordship = ['Alvito', 'Sortelha', 'Ferreira de Aves', 'Castelo Rodrigo'][Math.floor(gg.rng.next() * 4)];
              gg.secretsHeard.push('lordship');
              renown(gg, 90);
              return end(gg, q, 'lordship', `The King made you Senhor de ${gg.estate.lordship}, with its rents and its gallows. He was kind about it.`);
            },
          },
          {
            label: 'Gold, and be let alone',
            detail: 'Five thousand cruzados and the freedom of the quay. No office, and no enemies made at court.',
            resolve: (gg) => {
              gg.crown.gold += 5000;
              gg.secretsHeard.push('retired-rich');
              renown(gg, 30);
              return end(gg, q, 'rich', 'Asked the King for gold and to be let alone. He laughed, and paid, and said that was the most honest answer he had had in years.');
            },
          },
          {
            label: 'Ask for the ship, and nothing else',
            detail: 'The caravel, the crew, the next voyage. Nothing from the Crown that cannot be taken back.',
            resolve: (gg) => {
              gg.crew.morale = clamp(gg.crew.morale + 0.1, 0, 1);
              gg.secretsHeard.push('ship-only');
              renown(gg, 70);
              return end(gg, q, 'ship', 'Asked the King for nothing but the ship and the next voyage. He looked at you for a while, and said that in that case he would have to find something else to give.');
            },
          },
        ]),
    },
  },
};

export const QUESTS: Record<QuestId, QuestDef> = {
  caravel, leak, kongo, prester, zamorin, galeao, nome, ficheiro, roteiro, escudeiro,
  adrift, pesos, padrao, mercador, monsoon, aprendiz, sofala, count, feitorcal: feitorCalecute, mappila, malay, pepperrace: pepperRace, feverfleet: feverFleet, kingsoffer: kingsOffer,
};

/** Leave to trade across a whole state, as an audience would give it, and the court's opinion with it. */
function leaveToTrade(g: Game, polity: string, d: { trust?: number; respect?: number; interest?: number }, why: string): void {
  const pol = POLITY_BY_ID.get(polity);
  if (!pol) return;
  const st = g.polityState(polity);
  st.met = true;
  for (const id of pol.ports) { const r = g.relationsFor(id); r.met = true; r.mayTrade = true; }
  g.adjustPolity(polity, d, why);
}

/** The Cochin alliance, written into the courts: an ally against the Zamorin, and ground for a factory. */
function allyWithCochin(g: Game): void {
  leaveToTrade(g, 'cochin', { trust: 0.3, interest: 0.2 }, 'allied with you against the Zamorin');
  g.relationsFor('cochim').factory = true;
  if (!g.diplomacy.agreements.some((a) => a.polity === 'cochin' && a.kind === 'ally' && a.status === 'open')) {
    g.diplomacy.agreements.push({
      id: g.diplomacy.nextId++, polity: 'cochin', kind: 'ally', against: 'calicut',
      text: 'Stand with Cochin against Calicut', made: g.clock.t, status: 'open',
    });
  }
  g.adjustPolity('calicut', { trust: -0.25 }, 'allied with Cochin against them');
}

function QUEST_STATE_OUTCOME(g: Game, id: QuestId): string | undefined {
  return g.quests.find((q) => q.id === id)?.outcome;
}

// ---------------------------------------------------------------------------
// The engine

/** The line under the origin on the last page: what this captain did with who he was. */
const ORIGIN_ENDINGS: Record<string, string> = {
  'nome:self': 'There is a cape on the Swahili coast with your name on it, and nobody living there knows or needs to.',
  'nome:brother': 'Duarte had the headland read out at the house, twice. He never said so to you, and he kept the letter.',
  'nome:friend': 'Rui Mendes named his son for you. The Casa paid his surety back eleven years late.',
  'nome:plain': 'You gave the headland a name anyone could have, and kept your own for the ships.',
  'ficheiro:closed': 'The file on your family was closed, and the clerk who closed it was not thanked, either.',
  'ficheiro:open': 'The file stayed open. You were useful, and the merchants of Cochim remembered you in Lisbon all the same.',
  'roteiro:named': 'The bay is on the chart under his name, and you have never told anybody which of you found it.',
  'roteiro:crown': 'The bay is the King’s. The cairn on the north horn is still there, and is still empty.',
  'roteiro:sold': 'You sold his book, and did not find the bay. Somebody else did, in the end, and named it for a saint.',
  'escudeiro:honest': 'The King had the truth from you once, in his own hand, and never forgot who had given it.',
  'escudeiro:flattered': 'The King had a cheerful letter from you once. Dom Lopo, who read it over your shoulder, never did.',
};
export function originEnding(g: Game): string | null {
  const id: QuestId | undefined = ({ segundo: 'nome', converso: 'ficheiro', piloto: 'roteiro', fidalgo: 'escudeiro' } as const)[g.origin];
  const q = id && g.quests.find((x) => x.id === id);
  return q && q.outcome ? ORIGIN_ENDINGS[`${id}:${q.outcome}`] ?? null : null;
}

/**
 * The world remembering. A finished thread is noticed, once, at the place it
 * touched — a greeting at the gate, a note in the King's book, a fish sold at
 * cost — so that what the captain did is something the road shows him, not
 * only something the journal says.
 */
const CALLBACKS: { quest: QuestId; outcomes?: string[]; ports: string[]; text: string }[] = [
  { quest: 'pesos', outcomes: ['inland'], ports: ['mina', 'axim', 'acara'], text: 'The gold traders at the gate nod to you before they nod to the factor. Word of the scales has gone along the coast.' },
  { quest: 'pesos', outcomes: ['cheat'], ports: ['mina', 'axim', 'acara'], text: 'The gold traders find something to do when you come down the beach. The clerk’s scales are still the Casa’s.' },
  { quest: 'pesos', outcomes: ['repaid'], ports: ['axim'], text: 'A trader at Axim gives you a nod that is almost warm. He has been told about the hundred and fifty.' },
  { quest: 'adrift', outcomes: ['boy', 'salvage'], ports: ['arguim'], text: 'The garrison at Arguim turns out to watch you come in. Somebody knows whose the caravel was that you brought news of.' },
  { quest: 'padrao', ports: ['mocambique'], text: 'The King’s factor at Moçambique has left the page with Dias’s padrão open on his desk, and leaves it there when you come in.' },
  { quest: 'mercador', outcomes: ['freely', 'pilotage'], ports: ['melinde'], text: 'A dish of figs is sent down to the ship from a house on the terrace. The sheikh’s harbour-master bows lower than he need.' },
  { quest: 'mercador', outcomes: ['freely', 'pilotage'], ports: ['mombaca'], text: 'At Mombaça a boy on the beach watches you and says nothing, and then holds up his hand in greeting.' },
  { quest: 'monsoon', outcomes: ['freed'], ports: ['calecute', 'cochim', 'cananor'], text: 'A pilot on the quay at Calecute touches his brow to you. They know the name of the ship.' },
  { quest: 'monsoon', outcomes: ['kept'], ports: ['calecute', 'cochim', 'cananor'], text: 'The pilots on the quay at Calecute look at Malemo standing at your rail, and then do not look at him.' },
  { quest: 'roteiro', outcomes: ['named'], ports: ['mocambique', 'melinde'], text: 'A Moçambique pilot has the Baía do Piloto in his book, in a hand you do not know. He asks whether it is yours.' },
  { quest: 'ficheiro', outcomes: ['closed'], ports: ['lisboa', 'lagos'], text: 'The Casa’s clerk on the quay does not look up when you come ashore. It is the first time that has been a kindness.' },
  { quest: 'aprendiz', outcomes: ['chose'], ports: ['lagos', 'lisboa', 'funchal'], text: 'A fishwife on the quay sells you her whole basket at cost and will not hear a word about it.' },
  { quest: 'nome', outcomes: ['self', 'brother', 'friend'], ports: ['lisboa'], text: 'A letter in Duarte’s hand is waiting at the Casa. It is four lines, and none of them is about money.' },
  { quest: 'escudeiro', outcomes: ['honest'], ports: ['lisboa', 'lagos'], text: 'The men at the Casa stand a little straighter when you pass. A man who tells the King the truth is either feared or trusted.' },
  { quest: 'sofala', outcomes: ['fair'], ports: ['sofala', 'quiloa', 'mocambique'], text: 'A dhow captain at the water stairs tells you, unasked, that the Portuguese at Çofala paid what they said. He says it like a man reporting a miracle.' },
  { quest: 'count', outcomes: ['honest', 'declared'], ports: ['lisboa'], text: 'The weigh-house clerks are very civil this morning. The contador has been telling the story of your book.' },
  { quest: 'feitorcal', outcomes: ['peace'], ports: ['calecute', 'cochim'], text: 'Aires Correia, the factor, has put a jar of Calecute’s best pepper-wine on your table with no note. The shutters of the house are wide open.' },
  { quest: 'feitorcal', outcomes: ['riot', 'riot-home'], ports: ['cochim', 'calecute'], text: 'Nobody at the water stairs will meet your eye. The black patch on the waterfront, where the factory was, has a fresh flower on it.' },
  { quest: 'mappila', outcomes: ['treaty'], ports: ['cananor', 'calecute'], text: 'A Cananor boatman offers to carry you ashore for nothing. The Kolathiri’s friends are everywhere on the water.' },
  { quest: 'malay', outcomes: ['malacca', 'quay'], ports: ['cochim', 'calecute', 'columbo'], text: 'A pilot in the Cochim roadstead has heard of Malacca and of the ship that went there. He asks whether the cloves are what he has been told.' },
  { quest: 'pepperrace', outcomes: ['won'], ports: ['lisboa', 'lagos'], text: 'A Ribeira porter touches his cap. The men who lost money on the other ship are not among the ones who look you in the eye.' },
  { quest: 'feverfleet', outcomes: ['nursed', 'landed'], ports: ['mocambique', 'lisboa', 'lagos'], text: 'A man with a scar at the corner of his mouth recognises the ship and stands to attention on the quay. He was one of the São Vicente’s.' },
  { quest: 'leak', ports: ['lisboa'], text: 'The Rua Nova has a new contador, and a new way of looking at the ships’ books.' },
];

export function callbackAt(g: Game, portId: string): string | null {
  for (let i = 0; i < CALLBACKS.length; i++) {
    const cb = CALLBACKS[i];
    const key = `cb:${cb.quest}:${i}`;
    if (!cb.ports.includes(portId) || g.secretsHeard.includes(key)) continue;
    const q = g.quests.find((x) => x.id === cb.quest);
    if (!q?.outcome || (cb.outcomes && !cb.outcomes.includes(q.outcome))) continue;
    g.secretsHeard.push(key);
    return cb.text;
  }
  return null;
}

/** What the late threads say about how the career ended, for the last page. */
const LATE_ENDINGS: Record<string, string> = {
  'kingsoffer:armada': 'You commanded the armada, and the road to the Indies was yours for the rest of your life.',
  'kingsoffer:lordship': 'You took the lordship and the quiet. On a clear day you could see the river from the terrace, and you usually did not look.',
  'kingsoffer:rich': 'You took the gold and were let alone. It was the most honest thing anyone at court had said in years.',
  'kingsoffer:ship': 'You asked for nothing but the ship. The King had to find something else to give, and never did.',
  'pepperrace:won': 'You were first up the Tagus with the pepper, and the court has told it ever since.',
  'pepperrace:second': 'You came second up the Tagus, and were gracious about it. It is the only thing in the story anyone remembers of you.',
  'feverfleet:nursed': 'The men of the São Vicente tell the story of the Aguada de São Brás in every tavern on the Tagus.',
};
export function lateEndings(g: Game): string[] {
  const out: string[] = [];
  for (const q of g.quests) {
    const line = q.outcome ? LATE_ENDINGS[`${q.id}:${q.outcome}`] : undefined;
    if (line) out.push(line);
  }
  return out;
}

export function newQuest(id: QuestId, t: number): QuestState {
  return {
    id, step: QUESTS[id].first, stepT: t, fired: false, flags: {}, started: t,
    journal: [{ t, text: QUESTS[id].blurb }],
  };
}

/**
 * Secret threads the captain has heard of but not yet taken up: what the log
 * and the chart say about them, so a word overheard in a tavern is not lost.
 */
export interface Rumour { id: QuestId; title: string; text: string; mark: QuestMarker }
const RUMOURS: Partial<Record<QuestId, { text: string; port: string; label: string }>> = {
  galeao: {
    text: 'A Canary Islands pilot in a Lisbon tavern says the Castilians have a Biscayan building '
      + 'them "a ship like nothing afloat" at Las Palmas, and that the man has not been paid. '
      + 'Ask about it in the harbour taverns of Las Palmas.',
    port: 'las-palmas',
    label: 'The Biscayan’s ship (rumour)',
  },
};
export function rumoursHeard(g: Game): Rumour[] {
  const out: Rumour[] = [];
  for (const id of g.secretsHeard as QuestId[]) {
    const r = RUMOURS[id];
    if (!r || g.quests.some((q) => q.id === id) || !QUESTS[id]?.available(g)) continue;
    out.push({ id, title: QUESTS[id].title, text: r.text, mark: portMark(r.port, r.label) });
  }
  return out;
}

/** Threads that could be picked up in this port. */
export function offersAt(g: Game, portId: string): QuestDef[] {
  return (Object.values(QUESTS) as QuestDef[]).filter((d) => d.offeredAt.includes(portId)
    && !g.quests.some((q) => q.id === d.id)
    && d.available(g));
}

/** The step's scene, if its moment has come. Marks it fired. */
export function dueScene(g: Game, port: string | null): SeaEvent | null {
  for (const q of g.quests) {
    if (q.outcome || q.fired) continue;
    const step = QUESTS[q.id].steps[q.step];
    if (!step || !step.when(g, q, port)) continue;
    q.fired = true;
    snap = { gold: g.crown.gold, standing: g.crown.lifetimeStanding };
    return step.scene(g, q);
  }
  return null;
}

export function goalOf(g: Game, q: QuestState): string {
  if (q.outcome) return 'Finished.';
  return QUESTS[q.id].steps[q.step]?.goal(g, q) ?? '';
}

export function markerOf(g: Game, q: QuestState): QuestMarker | null {
  if (q.outcome) return null;
  return QUESTS[q.id].steps[q.step]?.marker?.(g, q) ?? null;
}

/** Prices that a finished thread has changed for good. */
export function refreshQuestPrices(g: Game): void {
  const mods: Record<string, Record<string, { ask?: number; bid?: number }>> = {};
  const kongo = g.quests.find((q) => q.id === 'kongo');
  if (kongo?.outcome === 'enforced') mods.mpinda = { marfim: { ask: 0.75 }, ferramenta: { bid: 1.3 } };
  const z = g.quests.find((q) => q.id === 'zamorin');
  if (z?.outcome === 'empire' || z?.outcome === 'peace') mods.cochim = { pimenta: { ask: 0.75 } };
  if (z?.outcome === 'peace') mods.calecute = { pimenta: { ask: 0.8 } };
  setQuestPriceMods(mods);
}
