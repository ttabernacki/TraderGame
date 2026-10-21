import { clamp, type LatLon } from '../../core/math';
import { portDef } from '../../world/ports';
import { end, go, hasOfficer, later, leaveToTrade, portMark, renown, scene, thread, writeTheSea } from '../arc';
import { ports, seaNear } from '../places';
import { gte, lte } from '../qualities';

/**
 * Front texture (BUILD_PLAN E1: MERGED). Short stories that belong to a Front rather than to a career: the false
 * weights at Mina (the Gold), Dias's fallen padrão (the Claim), the stranded merchant (the Crescent and the Rule), the
 * drifting caravel (the Traffic and the Barbary shore) and the fever fleet (a company's crisis). Their best text is as it
 * was; each is ranked as a Front's or a company's, offered only where its Front allows, and writes the Ledger tags the
 * Fronts read.
 */

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

export const adrift = thread({
  id: 'adrift',
  title: 'The Ship Adrift',
  blurb: 'A caravel has been seen drifting off the Barbary shore with nobody at her helm.',
  offeredAt: ['funchal', 'las-palmas', 'lagos'],
  requires: [],
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
      at: seaNear(DRIFT.lat, DRIFT.lon, 35),
      kind: 'texture',
      hooks: ['factor'],
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
      at: ports('arguim'),
      kind: 'texture',
      hooks: [],
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
});

export const pesos = thread({
  id: 'pesos',
  title: 'False Weights',
  blurb: 'The gold traders of the Mina coast say the Casa’s scales are not honest. They would be right.',
  offeredAt: ['mina', 'axim'],
  requires: [lte('front.gold.stage', 3)],
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
      at: ports('mina', 'axim'),
      kind: 'front',
      hooks: ['axim'],
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
      at: ports('axim'),
      kind: 'front',
      hooks: [],
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
});

export const padrao = thread({
  id: 'padrao',
  title: 'The Fallen Padrão',
  blurb: 'Dias set a stone east of the Cape. Nobody has been back to see whether it is still standing.',
  offeredAt: ['benguela', 'mpinda', 'luanda'],
  requires: [gte('act', 2)],
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
      at: seaNear(KWAAIHOEK.lat, KWAAIHOEK.lon, 30, { shoreMax: 14 }),
      kind: 'front',
      hooks: ['factor'],
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
      at: ports('mocambique'),
      kind: 'front',
      hooks: [],
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
});

export const mercador = thread({
  id: 'mercador',
  title: 'A Passenger for Melinde',
  blurb: 'A Swahili merchant stranded at Moçambique wants to get home to Melinde by way of Mombaça.',
  offeredAt: ['mocambique'],
  requires: [gte('act', 3)],
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
      at: ports('mombaca'),
      kind: 'front',
      hooks: ['melinde'],
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
      at: ports('melinde'),
      kind: 'front',
      hooks: [],
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
});

export const feverFleet = thread({
  id: 'feverfleet',
  title: 'The Fever Fleet',
  blurb: 'A ship of the fleet behind you is dying, and you are the only captain on the coast who can help.',
  offeredAt: ['mocambique', 'melinde', 'sofala'],
  requires: [gte('act', 4)],
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
      at: ports('mocambique', 'melinde', 'sofala'),
      kind: 'companion',
      hooks: ['shore'],
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
      at: ports('sao-bras'),
      kind: 'companion',
      homeward: true,
      carries: 'the São Vicente’s sick',
      hooks: [],
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
});

