import { NM, clamp, haversine, type LatLon } from '../core/math';
import type { SeaEvent, SeaChoice } from '../game/seaEvents';
import type { Game } from '../game/state';
import { prevailingWind } from '../world/wind';
import { currentAt } from '../world/currents';
import { anchorageOf, portDef } from '../world/ports';
import { setQuestPriceMods } from '../world/portCharacter';

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

export type QuestId = 'caravel' | 'leak' | 'kongo' | 'prester' | 'zamorin';

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

function end(g: Game, q: QuestState, outcome: string, line: string): string {
  q.outcome = outcome;
  q.fired = false;
  q.journal.push({ t: g.clock.t, text: line });
  g.logEvent('crown', `${QUESTS[q.id].title} — ${line}`, true);
  g.pushAlert(`${QUESTS[q.id].title} is finished.`, 'note');
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
  offeredAt: ['funchal', 'lagos', 'lisboa'],
  available: () => true,
  offer: () => ({
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
                gg.soundedGround.push({ lat: at.lat, lon: at.lon, nm: 400, source: 'Tomé Lopes' });
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
                  return go(gg, q, 'ruanova',
                    'Took the Castilian. In her master’s chest, a copy of the Casa’s own '
                    + 'chart of the Mina coast — in a Lisbon hand, with a merchant’s mark in '
                    + 'the corner: a Flemish house in the Rua Nova.');
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
    ruanova: {
      goal: () => 'Take the copied chart to Lisbon and find the Flemish house in the Rua Nova.',
      marker: () => portMark('lisboa', 'The Rua Nova'),
      when: (_g, _q, port) => port === 'lisboa',
      scene: (g, q) => scene(q, 'ruanova', 'The Flemish house',
        'A narrow counting room over a warehouse in the Rua Nova dos Mercadores. The merchant, '
        + 'Jan Bernaerts, looks at the chart for a long time and then says he has never seen it.\n\n'
        + 'He is lying, and he knows you know.',
        [
          {
            label: 'Pay him for a name',
            detail: 'Sixty cruzados.',
            resolve: (gg) => {
              if (gg.crown.gold < 60) return later(q, 'Not enough in the purse to make it worth his while.');
              gg.crown.gold -= 60;
              return go(gg, q, 'lagos',
                'Bernaerts took sixty cruzados and gave a name: a shipwright at Lagos who copies '
                + 'more than hull plans.');
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
              return go(gg, q, 'lagos',
                'Bernaerts decided he would rather talk to you than to the King. The pages come '
                + 'from a shipwright at Lagos.');
            },
          },
        ]),
    },
    lagos: {
      goal: () => 'Find the shipwright at Lagos who has been copying charts.',
      marker: () => portMark('lagos', 'The shipwright'),
      when: (_g, _q, port) => port === 'lagos',
      scene: (_g, q) => scene(q, 'lagos', 'The shipwright’s loft',
        'Álvaro Teles, master shipwright, is sixty and frightened. He copied the charts, yes. '
        + 'He never saw the originals: they came to him in sealed packets from the Arguim factor’s '
        + 'ledgers, and the seal on the packets was the Casa’s own.',
        [
          {
            label: 'Let him go, and follow the packets to Arguim',
            detail: 'He is a small man in a large business.',
            resolve: (gg) => go(gg, q, 'arguim',
              'Teles talked. The pages went through the factor at Arguim, under a Casa seal.'),
          },
          {
            label: 'Take his confession in writing',
            detail: 'Proof, signed. He will hang for it if it is ever read.',
            resolve: (gg) => {
              q.flags.confession = true;
              return go(gg, q, 'arguim',
                'Teles signed a confession. The pages went through the factor at Arguim, under a Casa seal.');
            },
          },
        ]),
    },
    arguim: {
      goal: () => 'Look at the Arguim factor’s books.',
      marker: () => portMark('arguim', 'Two ledgers'),
      when: (_g, _q, port) => port === 'arguim',
      scene: (g, q) => {
        const who = g.casa.pact ? 'Aires Tinoco' : 'Brás Leitão, Tinoco’s own clerk';
        q.flags.culprit = who;
        return scene(q, 'arguim', 'Two ledgers',
          'The factor keeps two books, which is what factors do. The second has the packets in it — '
          + 'dates, weights, and the name the money went to in Lisbon.\n\n'
          + `It is ${who}.`
          + (g.casa.pact ? ' And three lines above the entry for the charts, in the same hand, is '
            + 'the arrangement you made with him.' : ''),
          [
            {
              label: 'Take the ledger',
              detail: 'The factor will not stop you. He will write to Lisbon on the next ship.',
              resolve: (gg) => go(gg, q, 'reckoning', `Took the Arguim ledger. The name is ${who}.`),
            },
          ], 'warning');
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
              return go(gg, q, 'gifts', 'The King received the Kongo envoys as ambassadors, and '
                + 'is sending masons, priests and tools back with them. The tools must go in our hold.');
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
              return go(gg, q, 'gifts', good
                ? 'The eldest envoy spoke to the King through our língua for half an hour, and the '
                  + 'court was silent. The King is sending masons, priests and tools. The tools go in our hold.'
                : 'The envoys spoke, badly translated. The King is courteous and is sending tools '
                  + 'back with them, to go in our hold.');
            },
          },
          {
            label: 'Show them as a curiosity',
            detail: 'The court will pay to see them. Kongo will hear of it.',
            resolve: (gg) => {
              q.flags.court = 'curiosity';
              gg.crown.gold += 120;
              gg.shiftPeopleRegard('kongo', -0.35);
              return go(gg, q, 'gifts', 'The court paid well to see the Kongo envoys. They know '
                + 'exactly what was done. The King still sends tools back, in our hold.');
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
                  + 'is open to us — for now. The old Manikongo is not well.');
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
      goal: () => 'Return to the Kongo river in time. The old Manikongo is dying.',
      marker: () => portMark('mpinda', 'The succession'),
      when: (g, q, port) => port === 'mpinda' && g.clock.t - q.stepT > 90 * DAY,
      scene: (_g, q) => scene(q, 'succession', 'Two sons',
        'Nzinga a Nkuwu is dead. His son Mvemba a Nzinga, baptised Afonso, holds the capital with '
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
    letter: {
      goal: () => 'The king of Kongo has written to Lisbon. Go back to hear what he asks.',
      marker: () => portMark('mpinda', 'The king’s letter'),
      when: (g, q, port) => port === 'mpinda' && g.clock.t - q.stepT > 60 * DAY,
      scene: (_g, q) => scene(q, 'letter', 'The king’s letter',
        'The king has written to the King of Portugal, and he reads you the letter himself before '
        + 'it goes. Portuguese traders on the coast are buying his people — his subjects, his '
        + 'nobles’ own sons — and carrying them to São Tomé. He asks that it stop. He asks '
        + 'you, who brought his envoys home, to make it stop on this river.\n\n'
        + 'It would cost a great deal: the São Tomé men are rich and well-connected in Lisbon.',
        [
          {
            label: 'Enforce his request on this river',
            detail: 'Turn Portuguese slavers away at Mpinda. Enemies at the Casa; a king’s trust.',
            resolve: (gg) => {
              gg.shiftPeopleRegard('kongo', 0.4);
              gg.casa.regard = clamp(gg.casa.regard - 0.3, -1, 1);
              renown(gg, 60);
              q.flags.enforced = true;
              return end(gg, q, 'enforced', 'Turned the São Tomé traders off the Kongo river '
                + 'under the king’s letter. The Casa is furious. Kongo trades with us alone.');
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
  available: (g) => g.crown.lifetimeStanding >= 60,
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
      when: (_g, _q, port) => port === 'lisboa',
      scene: (_g, q) => scene(q, 'envoy', 'Two envoys',
        'The King offers you a choice of two men.\n\n'
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
      goal: () => 'At the Kongo river mouth, send the envoy inland to ask the way east.',
      marker: () => portMark('mpinda', 'Ask the way east'),
      when: (_g, _q, port) => port === 'mpinda',
      scene: (_g, q) => scene(q, 'inland', 'The road inland',
        `${q.flags.envoy === 'lucas' ? 'Frei Lucas' : 'Afonso de Paiva'} can go up the river with the `
        + 'Mani Soyo’s people and ask at the Manikongo’s court. It will take three weeks, '
        + 'and the ship must wait.',
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
              return go(gg, q, 'home', 'Allied with Cochim. The pepper is ours. Now carry the first great cargo home — forty quintals at least.');
            },
          },
          {
            label: 'Broker a three-way treaty',
            detail: q.flags.war ? 'Impossible while you are at war with Calecute.' : 'Everybody trades; nobody fights. Hard.',
            resolve: (gg) => {
              if (q.flags.war || !gg.rng.chance(0.5)) {
                q.flags.cochim = 'ally';
                return go(gg, q, 'home', 'The treaty would not hold, but Cochim is our friend. Carry the first great cargo home — forty quintals at least.');
              }
              q.flags.cochim = 'treaty';
              gg.shiftPeopleRegard(portDef('cochim').people, 0.3);
              gg.shiftPeopleRegard(portDef('calecute').people, 0.3);
              return go(gg, q, 'home', 'Calecute and Cochim both trade with us under one treaty. Carry the first great cargo home — forty quintals at least.');
            },
          },
        ]),
    },
    home: {
      goal: () => 'Bring at least forty quintals of pepper home to Lisbon.',
      marker: () => portMark('lisboa', 'The pepper fleet'),
      when: (g, _q, port) => port === 'lisboa' && g.ship.quantityOf('pimenta') >= 40,
      scene: (_g, q) => scene(q, 'home', 'Pepper on the Tagus',
        'The whole of Lisbon is on the waterfront. The smell of the hold reaches the Terreiro do Paço.',
        [{
          label: 'Report to the King',
          detail: 'The road to India is open.',
          resolve: (gg) => {
            renown(gg, 400);
            gg.crown.gold += 500;
            return end(gg, q, q.flags.war ? 'war' : q.flags.cochim === 'treaty' ? 'peace' : 'empire',
              q.flags.war
                ? 'The first pepper fleet is home, bought with a war on the Malabar coast that will last a century.'
                : q.flags.cochim === 'treaty'
                  ? 'The first pepper fleet is home, and every port on the Malabar coast trades under our treaty.'
                  : 'The first pepper fleet is home. Cochim is ours, and the Zamorin waits.');
          },
        }]),
    },
  },
};

export const QUESTS: Record<QuestId, QuestDef> = { caravel, leak, kongo, prester, zamorin };

function QUEST_STATE_OUTCOME(g: Game, id: QuestId): string | undefined {
  return g.quests.find((q) => q.id === id)?.outcome;
}

// ---------------------------------------------------------------------------
// The engine

export function newQuest(id: QuestId, t: number): QuestState {
  return {
    id, step: QUESTS[id].first, stepT: t, fired: false, flags: {}, started: t,
    journal: [{ t, text: QUESTS[id].blurb }],
  };
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
