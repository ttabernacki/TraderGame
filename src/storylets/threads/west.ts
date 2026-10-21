import { clamp, type LatLon } from '../../core/math';
import { anchorageOf, portDef } from '../../world/ports';
import { skill } from '../../crew/skills';
import type { Game } from '../../game/state';
import { DAY, end, go, hasOfficer, later, portMark, renown, scene, thread, writeTheSea } from '../arc';
import { HOME_PORTS, either, ports, seaNear, seaWhere } from '../places';
import { afterDays, gte, has } from '../qualities';

/**
 * The Atlantic and the Guinea coast: the Lost Caravel, the Leak in the Casa, the Manikongo's Embassy, the Biscayan's Ship,
 * the Stowaway. KEPT whole (BUILD_PLAN E1): their text and choices are as they were; where they are had, what they
 * need, which beat opens which, and what the world does while they wait are now declared (`../arc`).
 */

/** Where the last of the São Brás's people is living, as a point. */
const CASTAWAY_AT = anchorageOf(portDef('angra-pequena'));
// ---------------------------------------------------------------------------
// 1. The Lost Caravel

/** Where the São Brás's people cut their cross, near Cabo Frio. */
const CROSS: LatLon = { lat: -18.45, lon: 11.95 };
/** And where the last of them is living. */
const CASTAWAY = 'angra-pequena';

export const caravel = thread({
  id: 'caravel',
  title: 'The Lost Caravel',
  blurb: 'Find what became of the São Brás, lost south of the Congo three years ago.',
  // And at the Congo itself, on the way south: the quay at Mpinda has heard of
  // her too, and a captain past Mpinda should not have to sail home to be asked.
  offeredAt: ['funchal', 'lagos', 'lisboa', 'mpinda'],
  // Lost south of the Congo, so it is heard of once the Congo is: the
  // second act. Offered in the first it sent a new captain past three acts.
  requires: [gte('act', 2)],
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
      at: ports('benguela', 'luanda'),
      hooks: ['cross'],
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
      at: seaNear(CROSS.lat, CROSS.lon, 14, { shoreMax: 6 }),
      hooks: ['castaway'],
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
      at: either(ports(CASTAWAY), seaNear(CASTAWAY_AT.lat, CASTAWAY_AT.lon, 12)),
      hooks: ['home'],
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
      at: ports(...HOME_PORTS),
      homeward: true,
      carries: 'the news, and Tomé Lopes’s book',
      hooks: [],
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
});

// ---------------------------------------------------------------------------
// 2. The Leak in the Casa

/** The Mina coast, where the interlopers are waiting. */
const MINA_COAST: LatLon = { lat: 4.6, lon: -2.2 };

export const leak = thread({
  id: 'leak',
  title: 'The Leak in the Casa',
  blurb: 'Somebody in Lisbon is selling the King’s charts to Castile. Find out who.',
  offeredAt: ['mina', 'arguim', 'axim'],
  requires: [],
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
      at: seaNear(MINA_COAST.lat, MINA_COAST.lon, 140, { shoreMax: 80 }),
      hooks: ['arguim'],
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
      at: ports('arguim'),
      homeward: true,
      hooks: ['lagos'],
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
      at: ports('lagos'),
      hooks: ['ruanova'],
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
      at: ports('lisboa'),
      hooks: ['reckoning'],
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
      at: ports('lisboa'),
      quarter: 'court',
      hooks: [],
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
});

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

export const kongo = thread({
  id: 'kongo',
  title: 'The Manikongo’s Embassy',
  blurb: 'Carry the King of Kongo’s envoys to Lisbon, and what comes back.',
  offeredAt: ['mpinda'],
  requires: [has('met.mpinda'), gte('regard.kongo', 0.2)],
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
      at: seaWhere({ lat: 25, lon: -20 }, (g) => g.ship.state.pos.lat > 8),
      needs: [afterDays(12)],
      homeward: true,
      carries: 'the four envoys',
      hooks: ['court'],
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
      at: ports('lisboa'),
      quarter: 'court',
      homeward: true,
      carries: 'the four envoys',
      hooks: ['gifts'],
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
      at: ports('mpinda'),
      carries: 'the envoys, home, and the King’s iron tools',
      hooks: ['succession'],
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
      at: ports('mpinda'),
      expires: {
        when: has('power.kongo.succession'),
        settle: (g, q) => end(g, q, 'lapsed', 'The brothers settled the succession at Mbanza Kongo while the ship was away, and neither of them waited to hear what the captain would have said.'),
      },
      hooks: ['letter'],
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
      at: ports('lisboa'),
      needs: [afterDays(45)],
      quarter: 'court',
      homeward: true,
      carries: 'the king’s letter',
      hooks: [],
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
});

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

export const galeao = thread({
  id: 'galeao',
  title: 'The Biscayan’s Ship',
  blurb: 'A shipwright from Biscay is building Castile a new kind of ship in the Canaries. Get her, or get her lines.',
  offeredAt: ['las-palmas'],
  requires: [gte('act', 3), gte('renown', 150), has('heard.galeao')],
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
      at: ports('las-palmas'),
      quarter: 'tavern',
      hooks: ['arana', 'trials'],
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
      at: ports('las-palmas'),
      quarter: 'tavern',
      hooks: ['drawings', 'gomera'],
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
      at: seaNear(GOMERA_BEACH.lat, GOMERA_BEACH.lon, 12, { shoreMax: 6 }),
      hooks: ['aranaHome'],
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
      at: seaNear(TRIALS.lat, TRIALS.lon, 30),
      hooks: ['prizeHome', 'drawings'],
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
      at: ports('lisboa'),
      homeward: true,
      carries: 'the galleon’s lines',
      hooks: [],
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
      at: ports('lisboa'),
      homeward: true,
      carries: 'Martín de Arana',
      hooks: [],
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
      at: ports('lisboa'),
      homeward: true,
      carries: 'the prize',
      hooks: [],
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
});

export const aprendiz = thread({
  id: 'aprendiz',
  title: 'The Stowaway',
  blurb: 'There is a boy in the lazarette who cannot be put ashore until somebody decides what he is for.',
  offeredAt: HOME_PORTS,
  requires: [],
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
      at: ports('las-palmas', 'arguim', 'mina'),
      hooks: ['coast'],
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
      at: ports('benguela', 'luanda', 'angra-pequena'),
      hooks: ['home'],
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
              // A chart taken on trust that turns out a league wrong costs the pilot his confidence.
              gg.nav.sigmaLat += 6;
              gg.nav.sigmaLon += 6;
              gg.crew.morale = clamp(gg.crew.morale - 0.03, 0, 1);
              return go(gg, q, 'home', 'The boy was wrong by a league, and the pilot, who had half believed him, is now six miles less sure where he is. He wept. '
                + 'The hands, for once, said nothing.');
            },
          },
        ]),
    },
    home: {
      goal: () => 'The boy has a mother. She is at Lisbon, or Lagos, or Funchal.',
      marker: () => portMark('lagos', 'Nuno’s mother'),
      at: ports(...HOME_PORTS),
      homeward: true,
      carries: 'the boy',
      hooks: [],
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
});

