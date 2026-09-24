import { clamp } from '../core/math';
import type { SeaChoice, SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';
import { anchorageOf, portDef } from '../world/ports';
import { writeTheSea } from './quests';

/**
 * The shape of a career.
 *
 * Renown and titles measure a captain; they do not tell his story. This gives
 * the game a spine — five acts from the gold of Mina to the first pepper
 * fleet, each opened by the King setting the ambition of the age and closed
 * by the captain carrying the news of it home — and it puts the career inside
 * the real history of those eighteen years. Columbus comes to court and comes
 * back. Dias sails for the end of Africa. A converso astronomer arrives from
 * Castile with the best tables in the world. The King dies, and the new one
 * has favourites of his own.
 *
 * None of it waits for the player. It happens on its date. But the player can
 * be in the room, and what he has done changes what happens: a captain who
 * rounded the Cape in 1486 hears Dias's return very differently from one who
 * is still running gold from Mina.
 */

export interface ChronicleState {
  act: number;
  /** The current act's goal has been met; the news waits for Lisbon. */
  goalMet: boolean;
  /** Acts whose opening scene has been played. */
  opened: number[];
  /** History: event id → what came of it, in a few words. */
  history: Record<string, string>;
  /** Events that have been put and not yet answered. */
  pending: string[];
  flags: Record<string, string | number | boolean>;
}

export function newChronicle(): ChronicleState {
  return { act: 1, goalMet: false, opened: [], history: {}, pending: [], flags: {} };
}

interface ActDef {
  n: number;
  title: string;
  english: string;
  years: string;
  goal: string;
  met: (g: Game) => boolean;
  opening: (g: Game, c: ChronicleState) => SeaEvent;
  closing: (g: Game, c: ChronicleState) => SeaEvent;
  /** What the new act changes in the world, for the chronicle page. */
  changes: string;
}


function renown(g: Game, n: number): void {
  g.crown.standing += n;
  g.crown.lifetimeStanding += n;
}

function courtScene(
  id: string, title: string, text: string, choices: SeaChoice[],
  severity: SeaEvent['severity'] = 'note',
): SeaEvent {
  return { id: `chronicle:${id}`, title, text, severity, choices };
}

function one(label: string, detail: string, run: (g: Game) => string): SeaChoice[] {
  return [{ label, detail, resolve: run }];
}

// ---------------------------------------------------------------------------
// The acts

export const ACTS: ActDef[] = [
  {
    n: 1,
    title: 'O Ouro da Mina',
    english: 'The Gold of Mina',
    years: '1482 –',
    goal: 'Make the Guinea run: bring your ship to São Jorge da Mina and home again to Lisbon.',
    met: (g) => g.visitedPorts.has('mina'),
    changes: 'The Guinea coast as far as Mina is Portuguese water. Beyond it, nothing is certain.',
    opening: () => courtScene('act1:open', 'Act I — The Gold of Mina',
      'The new King, João II, has been on the throne a year and has already taken the Guinea '
      + 'trade back into royal hands. At São Jorge da Mina, on the Gold Coast, masons from Lisbon '
      + 'are raising a fortress out of stone cut and numbered in Portugal.\n\n'
      + '"Every caravel that goes to Mina and comes back," he says, "is a letter to Castile '
      + 'saying that coast is mine. Go and write me one."',
      one('Kiss the King’s hand', 'The Guinea run: to Mina and home.', (g) => {
        g.pushAlert('Act I: bring your ship to São Jorge da Mina and home to Lisbon.', 'note');
        return 'Took the King’s charge: the Guinea run, to Mina and home.';
      })),
    closing: () => courtScene('act1:close', 'The gold of Mina',
      'The gold is weighed in the Casa before the King, who watches every ounce go onto the '
      + 'scale. When it is done he does not talk about gold at all. He talks about Diogo Cão, '
      + 'who has gone south past anything on the charts, and about a river so large it '
      + 'freshens the sea for twenty leagues.',
      one('Ask to be sent south', 'The next act: the Congo and the pillars.', (gg) => {
        renown(gg, 30);
        gg.crown.gold += 120;
        return 'The King has marked you. Beyond Mina, then: the great river, and the pillars.';
      })),
  },
  {
    n: 2,
    title: 'Os Padrões',
    english: 'The Pillars',
    years: '1483 –',
    goal: 'Reach the great river of the Congo, where the sea runs fresh — the Rio do Padrão.',
    met: (g) => g.crown.landmarksFound.has('congo'),
    changes: 'The yards will build a small nau for a captain who has been past the Line. The Casa sells stone pillars by the dozen.',
    opening: () => courtScene('act2:open', 'Act II — The Pillars',
      'The King has ordered pillars of stone to be cut in Lisbon — padrões, with his arms and '
      + 'his name and the date — to stand on every headland his captains reach. Wooden crosses '
      + 'rot; stone will say for ever who came first.\n\n'
      + '"Somewhere past Mina," he says, "the coast turns, and when it turns I will have the '
      + 'Indies. Find me the river the negroes of Mina talk of. Find me the turn."',
      one('Take the pillars south', 'Reach the Congo.', (g) => {
        g.addLead('mpinda', 'A river so great it freshens the sea for twenty leagues, far to the '
          + 'south of Mina — the Congo, the Mina traders call it.', 'the traders at Mina', 180, 30);
        return 'South past Mina, with pillars in the hold, for the great river.';
      })),
    closing: () => courtScene('act2:close', 'The river and the pillar',
      'The King has your chart of the Congo spread on the table and his finger on the coast '
      + 'running south from it. "It goes on," he says. "It always goes on. How far?" Nobody in '
      + 'the room knows. That is the point of you.',
      one('Promise him the end of Africa', 'The next act: the Cape.', (gg) => {
        renown(gg, 50);
        gg.crown.gold += 200;
        return 'The King wants the end of Africa. The next voyage is to find it.';
      })),
  },
  {
    n: 3,
    title: 'O Cabo',
    english: 'The Cape',
    years: '1486 –',
    goal: 'Find the end of Africa and round it: the Cape of Good Hope.',
    met: (g) => g.crown.landmarksFound.has('boa-esperanca'),
    changes: 'The yards will build a full nau. Every captain in Lisbon wants to sail with the man who rounds Africa.',
    opening: () => courtScene('act3:open', 'Act III — The Cape',
      'The King is sending two men overland through Cairo, in disguise, to find the Indies and '
      + 'Prester John from the east. And he is sending ships to find the end of Africa from the '
      + 'west.\n\n'
      + '"One of them," he says, "should be you."',
      one('Sail for the end of Africa', 'Round the Cape.', (g) => {
        g.addLead('sao-bras', 'A pilot who sailed with Cão swears the coast falls away south-east '
          + 'below the desert — that there is an end to it, and water beyond.', 'a pilot in Lagos', 400, 40);
        return 'For the end of Africa, and whatever is beyond it.';
      })),
    closing: () => courtScene('act3:close', 'Cabo da Boa Esperança',
      'You tell the King about the storms, and about the coast turning north-east at last, and '
      + 'the water going warm. He listens to all of it. Then he says the Cape will not be called '
      + 'the Cape of Storms, whatever the sailors call it. It will be called the Cape of Good '
      + 'Hope, because of what lies beyond it.',
      one('Ask for the Indies', 'The next act: the Indian Ocean.', (gg) => {
        renown(gg, 90);
        gg.crown.gold += 350;
        return 'The Cape of Good Hope. Beyond it, the sea of the Indies.';
      })),
  },
  {
    n: 4,
    title: 'O Mar da Índia',
    english: 'The Sea of the Indies',
    years: '1488 –',
    goal: 'Cross the Indian Ocean and reach the Malabar coast of India.',
    met: (g) => g.crown.landmarksFound.has('india'),
    changes: 'The yards will lay down a Nau da Índia. The spice ports of the East are on the chart as rumour.',
    opening: (g) => courtScene('act4:open', 'Act IV — The Sea of the Indies',
      'Word has come from Cairo, in a Jew’s letter sewn into a coat: pepper at a place called '
      + 'Calecute, gold at Çofala, and a wind that blows across the ocean half the year one way '
      + 'and half the year the other.'
      + (g.chronicle.history.covilha ? '' : '\n\nThe King reads it to you himself.'),
      one('Go and find Calecute', 'Reach India.', (gg) => {
        gg.addLead('calecute', 'Pepper at Calecute, on the far side of the sea of the Indies, from '
          + 'Pêro da Covilhã’s letter out of Cairo.', 'Covilhã’s letter', 300, 60);
        gg.addLead('sofala', 'Gold at Çofala, on the African shore beyond the Cape.', 'Covilhã’s letter', 200, 30);
        return 'For Calecute, by way of the Cape and the monsoon.';
      })),
    closing: () => courtScene('act4:close', 'India',
      'There is pepper on the table in front of the King — a handful, from your own hold, from '
      + 'Malabar. He picks up a corn and bites it and does not say anything for a long time.\n\n'
      + '"A fleet," he says at last. "Not a caravel. A fleet, and you to lead it."',
      one('Accept the armada', 'The last act: the pepper fleet.', (gg) => {
        renown(gg, 150);
        gg.crown.gold += 600;
        return 'The King will send a fleet to the Indies. You are to bring the pepper home.';
      })),
  },
  {
    n: 5,
    title: 'A Armada',
    english: 'The Armada',
    years: '1495 –',
    goal: 'Bring the first great cargo of pepper — forty quintals and more — home to Lisbon.',
    met: (g) => g.dockedAt === 'lisboa' && g.ship.quantityOf('pimenta') >= 40,
    changes: 'The Carreira da Índia: a fleet a year, round the Cape and back, for a hundred years.',
    opening: () => courtScene('act5:open', 'Act V — The Armada',
      'Ships are building on the Tagus that are bigger than anything Portugal has put to sea, '
      + 'and the talk in every tavern on the waterfront is of the Indies.\n\n'
      + 'The King wants the first pepper fleet. Not a sample: a cargo, landed on the Tagus, '
      + 'that pays for the whole enterprise and every one after it.',
      one('For the pepper', 'Bring home the first great cargo.', () =>
        'The last act: pepper, forty quintals and more, on the Tagus.')),
    closing: () => courtScene('act5:close', 'The Carreira da Índia',
      'Lisbon has turned out to watch the pepper come ashore. The King rides down to the Ribeira '
      + 'himself. From this day there will be a fleet every year, round the Cape and back, and '
      + 'they will call it the Carreira da Índia — and your name is at the head of it.',
      [
        {
          label: 'Write your chronicle',
          detail: 'The career is complete. See how it will be remembered.',
          resolve: (gg) => {
            renown(gg, 300);
            gg.crown.routeOpened = true;
            return 'The road to the Indies is open, and it was you who opened it.';
          },
        },
        {
          label: 'Sail on',
          detail: 'There is more of the world. The chronicle can wait.',
          resolve: (gg) => {
            renown(gg, 300);
            return 'The pepper fleet is home. There is more of the world, and you are not done with it.';
          },
        },
      ]),
  },
];

// ---------------------------------------------------------------------------
// History

interface HistoryEvent {
  id: string;
  year: number;
  month: number;
  title: string;
  /** Played at court when the captain is next in Lisbon; otherwise heard as news anywhere. */
  court: boolean;
  scene: (g: Game, c: ChronicleState) => SeaEvent;
  /** What happens if the captain is not in Lisbon to be part of it. */
  missed: (g: Game, c: ChronicleState) => string;
  /** One line for the chronicle page once it is past. */
  summary: (c: ChronicleState) => string;
}

function after(g: Game, y: number, m: number): boolean {
  const d = g.clock.date;
  return d.year > y || (d.year === y && d.month >= m);
}

function monthsSince(g: Game, y: number, m: number): number {
  const d = g.clock.date;
  return (d.year - y) * 12 + (d.month - m);
}

export const HISTORY: HistoryEvent[] = [
  {
    id: 'cao',
    year: 1483, month: 9,
    title: 'Diogo Cão at the Congo',
    court: false,
    summary: (c) => c.history.cao === 'you' ? 'The Congo reached — by you, before Cão.' : 'Diogo Cão reached the Congo and set up the first stone padrão.',
    scene: (g, c) => {
      const first = g.crown.landmarksFound.has('congo');
      c.history.cao = first ? 'you' : 'cao';
      return courtScene('cao', first ? 'Cão comes home second' : 'News of Diogo Cão',
        first
          ? 'Diogo Cão is back in Lisbon from the great river — and finds your pillar there before '
            + 'him in the report. He is gracious about it in public. The court is not so gracious '
            + 'to him.'
          : 'A caravel in from the south brings word: Diogo Cão has found a river so great it '
            + 'freshens the sea for twenty leagues, and set up a stone pillar at its mouth — the '
            + 'first padrão. The coast runs on south beyond it.',
        one(first ? 'Let the court talk' : 'Drink to Cão', first ? 'You were first.' : 'The coast runs on.', (gg) => {
          if (first) { renown(gg, 30); return 'The court knows who stood at the Congo first.'; }
          gg.addLead('mpinda', 'Cão’s great river, far south of Mina, where his pillar stands.', 'Cão’s report', 60, 15);
          return 'Cão has found the great river. Its place is in our book now.';
        }));
    },
    missed: (g, c) => { c.history.cao = g.crown.landmarksFound.has('congo') ? 'you' : 'cao'; return ''; },
  },
  {
    id: 'colombo',
    year: 1484, month: 3,
    title: 'Columbus at court',
    court: true,
    summary: (c) => c.history.colombo === 'backed' ? 'Columbus came to court for ships to sail west. You spoke for him; the King said no.'
      : c.history.colombo === 'mocked' ? 'Columbus came to court for ships to sail west. You helped the cosmographers laugh him out.'
        : 'Columbus came to court for ships to sail west. The King said no.',
    scene: (_g, c) => courtScene('colombo', 'The Genoese',
      'A red-haired Genoese called Cristóvão Colombo, who married a Portuguese captain’s '
      + 'daughter, is before the King asking for three caravels. He will sail west, he says, '
      + 'and reach the Indies in a month.\n\n'
      + 'The King’s cosmographers are smiling. They have measured the world, and it is far '
      + 'larger than the Genoese thinks. The King looks at you.',
      [
        {
          label: 'Speak for him',
          detail: 'There is land out there. You have seen driftwood and birds far to the west.',
          resolve: () => {
            c.history.colombo = 'backed';
            c.flags.colomboFriend = true;
            return 'Spoke for the Genoese. The King thanked you and refused him anyway. Colombo will not forget who stood up.';
          },
        },
        {
          label: 'Side with the cosmographers',
          detail: 'He has the size of the world wrong, and they can prove it.',
          resolve: (g) => {
            c.history.colombo = 'mocked';
            renown(g, 15);
            return 'Sided with the cosmographers. The Genoese went to Castile with his figures.';
          },
        },
        {
          label: 'Say nothing',
          detail: 'It is not your voyage.',
          resolve: () => { c.history.colombo = 'silent'; return 'Said nothing. The Genoese went to try his luck in Castile.'; },
        },
      ]),
    missed: (_g, c) => { c.history.colombo = 'absent'; return 'While you were at sea a Genoese called Colombo asked the King for ships to sail west to the Indies. He was refused, and has gone to Castile.'; },
  },
  {
    id: 'dias-sails',
    year: 1487, month: 8,
    title: 'Dias sails for the Cape',
    court: true,
    summary: (c) => c.history['dias-sails'] === 'command' ? 'The King offered you the command of the Cape voyage.' : 'Bartolomeu Dias sailed to find the end of Africa.',
    scene: (g, c) => {
      const rounded = g.crown.landmarksFound.has('boa-esperanca');
      if (rounded) {
        c.history['dias-sails'] = 'moot';
        return courtScene('dias-sails', 'Dias’s voyage',
          'Bartolomeu Dias was to have sailed this summer to find the end of Africa. The King has '
          + 'sent him to Mina with the gold ships instead. There is nothing at the end of Africa '
          + 'that you have not already charted.',
          one('Good', 'You were first.', (gg) => { renown(gg, 40); return 'Dias carries gold. You carried the Cape.'; }));
      }
      return courtScene('dias-sails', 'The command of the Cape voyage',
        'The King is sending ships to find the end of Africa, and a storeship to follow them. He '
        + 'had meant to give the command to Bartolomeu Dias. He is asking whether it should be yours.',
        [
          {
            label: 'Take the command',
            detail: 'The King’s commission for the end of Africa, and a storeship’s worth of provisions.',
            resolve: (gg) => {
              c.history['dias-sails'] = 'command';
              gg.crew.provisions.water = Math.max(gg.crew.provisions.water, 120 + gg.ship.effects.water);
              gg.crew.provisions.biscuit = Math.max(gg.crew.provisions.biscuit, 150);
              renown(gg, 25);
              return 'The Cape voyage is yours, victualled from the King’s own stores. Dias goes to Mina with the gold ships.';
            },
          },
          {
            label: 'Let Dias have it',
            detail: 'He is a good seaman. Race him if you like.',
            resolve: () => { c.history['dias-sails'] = 'dias'; return 'Dias sails for the end of Africa. If you want the Cape, you will have to beat him to it.'; },
          },
        ]);
    },
    missed: (g, c) => { c.history['dias-sails'] = g.crown.landmarksFound.has('boa-esperanca') ? 'moot' : 'dias'; return g.crown.landmarksFound.has('boa-esperanca') ? '' : 'Bartolomeu Dias has sailed from Lisbon to find the end of Africa.'; },
  },
  {
    id: 'dias-returns',
    year: 1488, month: 12,
    title: 'Dias returns',
    court: false,
    summary: (c) => c.history['dias-returns'] === 'you' ? 'Dias came home to find the Cape already yours.'
      : c.history['dias-returns'] === 'moot' ? 'The Cape voyage was yours; Dias went to Mina.'
        : 'Bartolomeu Dias came home having rounded the end of Africa.',
    scene: (g, c) => {
      const mine = g.crown.landmarksFound.has('boa-esperanca');
      const commanded = c.history['dias-sails'] === 'command';
      c.history['dias-returns'] = mine ? 'you' : commanded ? 'moot' : 'dias';
      if (mine || commanded) {
        return courtScene('dias-returns', 'The Cape is yours',
          'In Lisbon they are calling you the man who rounded Africa, and the King has not '
          + 'corrected them.',
          one('Accept it', '', (gg) => { renown(gg, mine ? 60 : 0); return 'The Cape is yours in every account written this year.'; }));
      }
      return courtScene('dias-returns', 'Dias has rounded Africa',
        'Bartolomeu Dias is home. He found the end of Africa in a storm, went round it without '
        + 'seeing it, and saw it on the way back: a great cape, and beyond it the coast running '
        + 'north-east and the water warm. His crew made him turn back.\n\n'
        + 'His pilot’s book is at the Casa, and the Casa shares it with the King’s captains.',
        one('Copy his rutter', 'His winds and currents for the Cape, into your own book.', (gg) => {
          const n = writeTheSea(gg, -40, -25, 10, 30);
          gg.addLead('sao-bras', 'The watering place Dias found beyond the Cape, where the herdsmen are.', 'Dias’s rutter', 40, 20);
          return `Dias’s rutter is copied into our book — ${n} squares of the Cape seas, every month. The road round is known.`;
        }));
    },
    missed: () => '',
  },
  {
    id: 'zacuto',
    year: 1492, month: 8,
    title: 'Zacuto comes from Castile',
    court: true,
    summary: (c) => c.history.zacuto === 'hired' ? 'Abraham Zacuto, fleeing Castile, gave you his tables.'
      : 'Abraham Zacuto, the great astronomer, came to Lisbon from Castile.',
    scene: (_g, c) => courtScene('zacuto', 'The astronomer from Salamanca',
      'The Jews have been driven out of Castile, and the road into Portugal is full of them. '
      + 'Among them is Abraham Zacuto of Salamanca, whose tables of the sun’s declination '
      + 'are the finest in the world. He needs a patron, and he needs one quickly.',
      [
        {
          label: 'Take him under your protection',
          detail: 'His Almanach Perpetuum — the sun’s place for every day — is yours. The Church will notice.',
          resolve: (gg) => {
            c.history.zacuto = 'hired';
            gg.nav.kit.almanac = 'almanach';
            gg.casa.regard = clamp(gg.casa.regard - 0.1, -1, 1);
            return 'Zacuto is under your roof, and his tables are aboard: the sun’s declination '
              + 'to a tenth of a degree, for every day of every year.';
          },
        },
        {
          label: 'Leave him to the King',
          detail: 'The court will find a use for him.',
          resolve: () => { c.history.zacuto = 'court'; return 'Zacuto went to the King’s service. His tables will reach the fleets — in time.'; },
        },
      ]),
    missed: (_g, c) => { c.history.zacuto = 'court'; return 'Abraham Zacuto, the astronomer, has come to Lisbon from Castile and entered the King’s service.'; },
  },
  {
    id: 'colombo-returns',
    year: 1493, month: 3,
    title: 'Columbus returns',
    court: true,
    summary: (c) => `Columbus came back claiming the Indies for Castile. ${c.history['colombo-returns'] === 'islands' ? 'You told the King they were islands, not the Indies.' : c.history['colombo-returns'] === 'seize' ? 'You urged the King to seize his ships.' : ''}`,
    scene: (g, c) => {
      const friend = c.flags.colomboFriend;
      const beyond = g.crown.landmarksFound.has('boa-esperanca');
      return courtScene('colombo-returns', 'The Genoese comes back',
        'A battered caravel, the Niña, has put into the Tagus in a storm, and the Genoese is at '
        + 'court. He sailed west for Castile, he says, and found the Indies in thirty-three days.\n\n'
        + (friend ? 'He sees you across the room and bows. He has not forgotten who spoke for him. '
          : '')
        + 'The King is white with fury. The treaty gives Portugal everything south of the '
        + 'Canaries. The Genoese says his islands are south of the Canaries.',
        [
          {
            label: 'Tell the King they are islands, not the Indies',
            detail: beyond ? 'You have been round Africa. You know how far the Indies are.' : 'The cosmographers’ numbers say so.',
            resolve: (gg) => {
              c.history['colombo-returns'] = 'islands';
              renown(gg, beyond ? 50 : 20);
              return 'Told the King what the numbers say: the Genoese has found islands, not the Indies. The King will fight for the ocean, not panic for it.';
            },
          },
          {
            label: 'Urge the King to seize his ships',
            detail: 'Keep his charts from Castile. It may mean war.',
            resolve: (gg) => {
              c.history['colombo-returns'] = 'seize';
              gg.shiftPeopleRegard('castilian', -0.4);
              return 'The King would not seize him — but he has sent ships to watch the Castilian coast, and Castile knows why.';
            },
          },
          ...(friend ? [{
            label: 'Take him aside and ask what he saw',
            detail: 'He owes you. Winds, currents, the road west.',
            resolve: (gg: Game) => {
              c.history['colombo-returns'] = 'friend';
              const n = writeTheSea(gg, 15, 35, -65, -20);
              return `Colombo talked for an hour: the trades west from the Canaries, the westerlies home. ${n} squares of the western ocean are in our book.`;
            },
          }] : []),
        ], 'warning');
    },
    missed: (_g, c) => { c.history['colombo-returns'] = 'absent'; return 'The Genoese, Colombo, has come back from the west claiming the Indies for Castile. The King is furious.'; },
  },
  {
    id: 'tordesillas',
    year: 1494, month: 6,
    title: 'The Treaty of Tordesillas',
    court: true,
    summary: (c) => c.history.tordesillas === 'far' ? 'At Tordesillas the line was drawn 370 leagues west of Cabo Verde, on your charts.'
      : 'At Tordesillas the world was divided between Portugal and Castile.',
    scene: (g, c) => {
      const ports = g.chart.ports.size;
      const leak = g.quests.find((q) => q.id === 'leak')?.outcome;
      const weight = ports + (leak === 'turned' ? 20 : 0) + (g.crown.landmarksFound.has('boa-esperanca') ? 15 : 0);
      return courtScene('tordesillas', 'Dividing the world',
        'At Tordesillas, the ambassadors of Portugal and Castile are dividing the ocean with a '
        + 'line from pole to pole. The Pope said a hundred leagues west of the Cabo Verde '
        + 'islands. The King wants it pushed west — far enough west to keep the whole of the '
        + 'South Atlantic, and the volta, and whatever is out there.\n\n'
        + `The ambassadors want charts. You have ${ports} ports on yours`
        + (leak === 'turned' ? ', and Castile has been sailing on false ones.' : '.'),
        [
          {
            label: 'Give them every chart you have',
            detail: 'Your survey is Portugal’s argument.',
            resolve: (gg) => {
              const far = weight >= 25;
              c.history.tordesillas = far ? 'far' : 'near';
              renown(gg, far ? 80 : 30);
              if (far) {
                gg.addLead('porto-seguro', 'Far to the west in the South Atlantic, inside the new '
                  + 'line, the volta passes near land — a pilot swears he smelled it.', 'the Tordesillas ambassadors', 400, 60);
              }
              return far
                ? 'The line is drawn 370 leagues west of Cabo Verde — on your charts. The whole South Atlantic is Portuguese water, and whatever land lies in it.'
                : 'The line is drawn, not as far west as the King wanted. Your charts helped.';
            },
          },
        ]);
    },
    missed: (_g, c) => { c.history.tordesillas = 'near'; return 'At Tordesillas the world has been divided between Portugal and Castile by a line 370 leagues west of Cabo Verde.'; },
  },
  {
    id: 'manuel',
    year: 1495, month: 10,
    title: 'Death of João II',
    court: true,
    summary: (c) => `João II died, and Manuel I came to the throne.${c.history.manuel === 'petition' ? ' You petitioned the new King for the India command.' : ''}`,
    scene: (g, c) => courtScene('manuel', 'The Perfect Prince is dead',
      'João II has died at Alvor, of dropsy, at forty. He had no legitimate son. The crown '
      + 'goes to his cousin Manuel, the Duke of Beja, who is twenty-six, pious, lucky, and '
      + 'surrounded by men João kept away from power.\n\n'
      + (g.crown.lifetimeStanding > 300
        ? 'Everybody at court knows you were the old King’s man.'
        : 'Nobody at court much minds who you were.'),
      [
        {
          label: 'Swear to the new King, and ask for nothing',
          detail: 'Patience. Manuel will need captains.',
          resolve: () => { c.history.manuel = 'loyal'; return 'Swore to Manuel I. He looked at you for a long moment and said the Indies were still his ambition.'; },
        },
        {
          label: 'Petition him for the India command',
          detail: 'Bold, with the old King not cold. It may work.',
          resolve: (gg) => {
            const ok = gg.crown.lifetimeStanding >= 360 || gg.crown.landmarksFound.has('boa-esperanca');
            c.history.manuel = ok ? 'petition' : 'rebuffed';
            if (ok) renown(gg, 60); else renown(gg, -30);
            return ok
              ? 'Manuel heard you out and said the India fleet would want a man who had been round the Cape. He did not say no.'
              : 'Manuel said he would consider it, in the voice that means he will not. His favourites are laughing.';
          },
        },
      ], 'warning'),
    missed: (_g, c) => { c.history.manuel = 'absent'; return 'João II is dead. Manuel I is King of Portugal.'; },
  },
  {
    id: 'gama',
    year: 1497, month: 7,
    title: 'Gama’s armada',
    court: true,
    summary: (c) => c.history.gama === 'you' ? 'The India armada of 1497 sailed under your command.'
      : c.history.gama === 'already' ? 'You had already been to India; Gama’s fleet followed your road.'
        : 'Vasco da Gama sailed for India with four ships.',
    scene: (g, c) => {
      const been = g.crown.landmarksFound.has('india');
      if (been) {
        c.history.gama = 'already';
        return courtScene('gama', 'Gama’s fleet',
          'Four ships under Vasco da Gama sail for India this summer, on your charts and by your '
          + 'road. Gama came to your house the night before, to ask about the monsoon.',
          one('Tell him everything', 'The road is yours; the fleet is the King’s.', (gg) => { renown(gg, 70); return 'Gama sailed on your road. Every account of it has your name in the first line.'; }));
      }
      return courtScene('gama', 'The India armada',
        'Four ships are fitting out at Restelo for India: the São Gabriel, the São Rafael, the '
        + 'Bérrio and a storeship. The King has named Vasco da Gama to command.'
        + (c.history.manuel === 'petition' ? ' Unless — the King has not forgotten your petition.' : ''),
        [
          ...(c.history.manuel === 'petition' || g.crown.lifetimeStanding >= 600 ? [{
            label: 'Claim the command',
            detail: 'The King half-promised it. Gama will be your enemy for life.',
            resolve: (gg: Game) => {
              c.history.gama = 'you';
              renown(gg, 80);
              gg.crown.gold += 800;
              return 'The India armada is yours: pay for the voyage, and every man at Restelo watching you. Gama sails as your second, and hates it.';
            },
          }] : []),
          {
            label: 'Race him to India',
            detail: 'On your own account. Be at Calecute before him.',
            resolve: () => { c.history.gama = 'race'; c.flags.gamaDue = true; return 'Gama sails for India with the King’s fleet. You mean to be there first.'; },
          },
          {
            label: 'Wish him fair winds',
            detail: 'Somebody has to go.',
            resolve: () => { c.history.gama = 'gama'; return 'Gama sails for India with four ships.'; },
          },
        ], 'warning');
    },
    missed: (g, c) => { c.history.gama = g.crown.landmarksFound.has('india') ? 'already' : 'gama'; return c.history.gama === 'gama' ? 'Vasco da Gama has sailed for India with four ships.' : ''; },
  },
  {
    id: 'gama-returns',
    year: 1499, month: 9,
    title: 'The road to India',
    court: false,
    summary: (c) => c.history['gama-returns'] === 'you' ? 'The road to India was yours before Gama came home.' : 'Gama came home from Calecute with pepper, and half his men dead.',
    scene: (g, c) => {
      const mine = g.crown.landmarksFound.has('india');
      c.history['gama-returns'] = mine ? 'you' : 'gama';
      return courtScene('gama-returns', mine ? 'Gama comes home second' : 'Gama is home from India',
        mine
          ? 'Vasco da Gama is home from Calecute, with pepper and cinnamon and fifty-five men of the '
            + 'hundred and seventy he sailed with. He was there. You were there first.'
          : 'Vasco da Gama is home from Calecute, with pepper and cinnamon and fifty-five men of '
            + 'the hundred and seventy he sailed with. The road to India is found — and not by you.',
        one(mine ? 'Let him have his parade' : 'Read his rutter', mine ? '' : 'The monsoon and the Indian coast, into your own book.', (gg) => {
          if (mine) { renown(gg, 60); return 'Gama has his parade. The chronicles already have your name.'; }
          const n = writeTheSea(gg, -30, 25, 30, 80);
          gg.addLead('calecute', 'Gama’s pilot’s road to Calecute.', 'Gama’s rutter', 30, 20);
          return `Gama’s rutter is at the Casa: ${n} squares of the Indian Ocean, every month of the monsoon. The road is open to anybody now.`;
        }));
    },
    missed: () => '',
  },
  {
    id: 'cabral',
    year: 1500, month: 4,
    title: 'Land in the west',
    court: false,
    summary: () => 'Cabral’s fleet, standing far out on the volta, found land in the west: Vera Cruz.',
    scene: (g, c) => {
      c.history.cabral = 'heard';
      const been = g.visitedPorts.has('porto-seguro');
      return courtScene('cabral', 'Vera Cruz',
        been
          ? 'Cabral’s India fleet stood far out to the west on the volta and fell in with land: '
            + 'the same coast you found years ago. The King has written to the Pope that it is his.'
          : 'Cabral’s India fleet stood far out to the west on the volta and fell in with a great '
            + 'land — green, forested, full of people. He has named it Vera Cruz and sent a ship '
            + 'home with the news. It lies east of the Tordesillas line.',
        one('Mark it on the chart', '', (gg) => {
          if (!been) {
            const d = portDef('porto-seguro');
            gg.chart.chartPort(d, anchorageOf(d), anchorageOf(d), gg.clock.t, false, 30, 60);
          }
          renown(gg, been ? 80 : 0);
          return been ? 'The world knows now what you knew.' : 'Vera Cruz is on the chart: land in the west, inside the King’s line.';
        }));
    },
    missed: () => '',
  },
];

// ---------------------------------------------------------------------------
// The engine

export function actDef(n: number): ActDef {
  return ACTS[Math.max(0, Math.min(ACTS.length - 1, n - 1))];
}

/** Hulls the yards will build in this act. */
export function hullAllowed(act: number, hullId: string): boolean {
  const need: Record<string, number> = { 'nau-pequena': 2, nau: 3, 'nau-da-india': 4 };
  return act >= (need[hullId] ?? 1);
}

/** Commissions the King offers in this act, by title. Anything not listed is always offered. */
const PATENT_ACT: Record<string, number> = {
  'Beyond the Congo': 2,
  'The end of Africa': 3,
  'The road to the Indies': 4,
  'The pepper fleet': 5,
};
export function patentAllowed(act: number, title: string): boolean {
  return act >= (PATENT_ACT[title] ?? 1);
}

/**
 * What is due now. Returns at most one scene: the act's closing and the next
 * act's opening are Lisbon's, and history is Lisbon's or anybody's.
 */
export function chronicleDue(g: Game, c: ChronicleState): SeaEvent | null {
  const inLisbon = g.dockedAt === 'lisboa';

  // The act's goal, noticed wherever it happens.
  const act = actDef(c.act);
  if (!c.goalMet && act.met(g)) {
    c.goalMet = true;
    g.pushAlert(`${act.english}: done. Carry the news to the King in Lisbon.`, 'note');
    g.logEvent('crown', `Act ${c.act}, ${act.english}: ${act.goal} Done — the King must hear it in Lisbon.`, true);
  }

  if (inLisbon) {
    if (!c.opened.includes(c.act)) {
      c.opened.push(c.act);
      g.announce('act', `Act ${roman(c.act)}`, act.english, `${act.title} · ${act.years}`, act.goal);
      return act.opening(g, c);
    }
    if (c.goalMet && c.act < ACTS.length) {
      const closing = act.closing(g, c);
      c.act += 1;
      c.goalMet = false;
      return closing;
    }
    if (c.goalMet && c.act === ACTS.length && !c.flags.finished) {
      c.flags.finished = true;
      return act.closing(g, c);
    }
  }

  // History, on its dates.
  for (const h of HISTORY) {
    if (c.history[h.id] !== undefined || c.pending.includes(h.id)) continue;
    if (!after(g, h.year, h.month)) continue;
    if (h.court) {
      if (inLisbon) {
        c.pending.push(h.id);
        return h.scene(g, c);
      }
      // A year and a half away from court and it happens without you.
      if (monthsSince(g, h.year, h.month) > 18) {
        const said = h.missed(g, c);
        if (c.history[h.id] === undefined) c.history[h.id] = 'absent';
        if (said) { g.logEvent('crown', `News from Lisbon: ${said}`, true); g.pushAlert(`News from Lisbon: ${h.title}.`, 'note'); }
      }
      continue;
    }
    // News travels: heard in any port.
    if (g.dockedAt) {
      c.pending.push(h.id);
      return h.scene(g, c);
    }
  }
  return null;
}

/** A scene answered: take it off the pending list. */
export function chronicleAnswered(c: ChronicleState, sceneId: string): void {
  const id = sceneId.replace(/^chronicle:/, '');
  c.pending = c.pending.filter((p) => p !== id);
  if (c.history[id] === undefined && HISTORY.some((h) => h.id === id)) c.history[id] = 'seen';
}

export function roman(n: number): string {
  return ['I', 'II', 'III', 'IV', 'V'][n - 1] ?? String(n);
}

/** Where an existing career already stands, for a save from before the chronicle. */
export function chronicleFromProgress(g: Game): ChronicleState {
  const c = newChronicle();
  const steps = [
    () => g.visitedPorts.has('mina'),
    () => g.crown.landmarksFound.has('congo'),
    () => g.crown.landmarksFound.has('boa-esperanca'),
    () => g.crown.landmarksFound.has('india'),
  ];
  for (const s of steps) {
    if (!s()) break;
    c.opened.push(c.act);
    c.act += 1;
  }
  return c;
}
