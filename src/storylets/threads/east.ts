import { clamp, type LatLon } from '../../core/math';
import { anchorageOf, portDef } from '../../world/ports';
import type { Game } from '../../game/state';
import { allyWithCochin, end, go, hasOfficer, later, leaveToTrade, outcomeOf, portMark, renown, roll, scene, thread, writeTheSea } from '../arc';
import { anyPort, either, ports, seaNear, seaWhere } from '../places';
import { afterDays, allOf, anyOf, gte, has, lte, qualityOf, setFlag } from '../qualities';

/**
 * The far end of the road: Prester John, the Zamorin, the Monsoon pilot, Çofala, the Count, the Factory at Calecute,
 * the Pepper Houses and the Pepper Race. KEPT whole (BUILD_PLAN E1), tied to the Fronts where the story touches them.
 */

/** The open sea between Melinde and Calecute, where the monsoon is. */
const MONSOON: LatLon = { lat: 4.0, lon: 58.0 };
// ---------------------------------------------------------------------------
// 4. The Letter to Prester John

const ETHIOPIA: LatLon = { lat: 9.0, lon: 39.5 };

export const prester = thread({
  id: 'prester',
  title: 'The Letter to Prester John',
  blurb: 'Carry the King’s letter toward the Christian king of the Indies.',
  offeredAt: ['lisboa'],
  // The King sent Covilhã east in 1487, the year Dias sailed: the Cape act.
  requires: [gte('act', 3), anyOf(gte('renown', 60), allOf(gte('renown', 30), gte('patron.church.favour', 0.3)))],
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
      at: anyPort(),
      quarter: 'court',
      hooks: ['inland'],
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
      at: ports('mpinda', 'luanda', 'benguela'),
      hooks: ['cape'],
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
      at: seaWhere({ lat: -34.4, lon: 24 }, (g) => g.ship.state.pos.lat < -33.5 && g.ship.state.pos.lon > 21),
      hooks: ['pilgrim'],
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
      at: ports('mocambique'),
      hooks: ['send'],
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
      at: ports('melinde', 'magadoxo'),
      hooks: ['wait', 'proof'],
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
      at: ports('melinde', 'magadoxo', 'lisboa'),
      needs: [afterDays(300)],
      hooks: [],
      scene: (g, q) => {
        const ok = g.rng.chance(q.flags.envoy === 'lucas' ? 0.75 : 0.55);
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
      at: ports('lisboa'),
      needs: [has('story.@.pilgrim')],
      quarter: 'court',
      homeward: true,
      carries: 'Yohannes of Axum',
      hooks: [],
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
});

// ---------------------------------------------------------------------------
// 5. The Zamorin's Pepper

export const zamorin = thread({
  id: 'zamorin',
  title: 'The Zamorin’s Pepper',
  blurb: 'Open the pepper trade of Calecute, and bring the first great cargo home.',
  offeredAt: ['calecute', 'melinde'],
  requires: [],
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
      at: ports('calecute'),
      quarter: 'court',
      hooks: ['merchants'],
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
              // A title opens the Zamorin's door: the King's Man is received on his name where another captain is received on his renown.
              detail: g.crown.lifetimeStanding >= 340 || qualityOf(g, 'title.homem-do-rei') ? 'Your name carries it.' : 'Your name is not yet big enough to carry it.',
              resolve: (gg) => {
                const ok = gg.crown.lifetimeStanding >= 340 || !!qualityOf(gg, 'title.homem-do-rei');
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
      at: ports('calecute'),
      needs: [afterDays(3)],
      hooks: ['hostages'],
      scene: (g, q) => {
        const proof = outcomeOf(g, 'leak') === 'turned' || outcomeOf(g, 'leak') === 'exposed';
        return scene(q, 'merchants', 'The Moors of Calecute',
          'The pepper is in the warehouses of the Mappila and Cairo merchants, and they will not '
          + 'sell to you at any price the Zamorin would call fair. They have also been telling '
          + 'him that you are pirates.'
          + (q.flags.audience === 'poor' ? ' The gifts you brought him have been laughed over in every warehouse, and the Moors use it.' : ''),
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
      at: seaNear(anchorageOf(portDef('calecute')).lat, anchorageOf(portDef('calecute')).lon, 40),
      hooks: ['cochim'],
      scene: (_g, q) => scene(q, 'hostages', 'Our factors are taken',
        'A boat comes after you from the beach: the Zamorin’s men have seized the two factors '
        + 'you left ashore with the goods, on the Moors’ word that you mean to sail without '
        + 'paying the customs.'
        + (q.flags.merchantsBroken ? ' They are the same Moors the Zamorin fined on your evidence, and they have not forgiven it.' : ''),
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
      at: ports('cochim'),
      quarter: 'court',
      hooks: ['home'],
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
      at: either(seaNear(anchorageOf(portDef('cochim')).lat, anchorageOf(portDef('cochim')).lon, 60), seaNear(anchorageOf(portDef('calecute')).lat, anchorageOf(portDef('calecute')).lon, 60)),
      needs: [gte('hold.pimenta', 40)],
      hooks: [],
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
});


export const monsoon = thread({
  id: 'monsoon',
  title: 'A Pilot for Calecute',
  blurb: 'The Melinde pilots know the monsoon. One of them may be willing to show a Portuguese captain.',
  offeredAt: ['melinde'],
  requires: [gte('act', 3)],
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
      at: ports('melinde'),
      hooks: ['crossing'],
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
      at: seaNear(MONSOON.lat, MONSOON.lon, 260, { shoreMin: 120 }),
      hooks: ['calecute'],
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
      at: ports('calecute'),
      hooks: [],
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
});

// ---------------------------------------------------------------------------
// 17–18. The way home: the last act is a cargo carried back, and these two lie
// along that road in the order a homeward ship meets them.

export const sofala = thread({
  id: 'sofala',
  title: 'The Gold of Çofala',
  blurb: 'The Swahili coast has been bringing gold out of the interior for five hundred years. Find where from.',
  offeredAt: ['melinde', 'quiloa', 'mocambique', 'mombaca'],
  requires: [gte('act', 4)],
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
      at: ports('quiloa'),
      quarter: 'court',
      writes: ['flag.promise.kilwa.first_call'],
      hooks: ['merchant'],
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
              // The promise is a quality the world reads: the Rule's Kilwa scenes, the epilogue and Hamisi's approval.
              setFlag(gg, 'flag.promise.kilwa.first_call');
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
      at: ports('mocambique'),
      hooks: ['gold'],
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
      at: ports('sofala'),
      quarter: 'court',
      hooks: [],
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
});

export const count = thread({
  id: 'count',
  title: 'The Count',
  blurb: 'The pepper is weighed at Lisbon against the clerk’s book. What is in the hold and what is written need not agree.',
  offeredAt: ['cochim', 'calecute', 'cananor', 'melinde'],
  requires: [gte('act', 5)],
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
      at: ports('cochim', 'calecute', 'cananor'),
      hooks: ['cape'],
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
              gg.noteDeed('parcel.carried', { target: 'the factor', magnitude: 0.6, note: 'Took the factor\u2019s forty quintals aboard unwritten.' });
              renown(gg, -5);
              return go(gg, q, 'cape', 'Took the factor’s forty quintals aboard unwritten. They are in the lazarette, under the spare canvas.');
            },
          },
          {
            label: 'Refuse, and have him put it in the book',
            detail: 'A forty-quintal parcel honestly declared is the King’s, and so is the profit.',
            resolve: (gg) => {
              renown(gg, 25);
              gg.noteDeed('parcel.refused', { target: 'the factor', magnitude: 0.6, note: 'Refused the factor\u2019s parcel and saw the pepper weighed into the book.' });
              return go(gg, q, 'cape', 'Refused the factor’s parcel and saw the pepper weighed into the book. He shrugged, and was quietly relieved.');
            },
          },
        ]),
    },
    cape: {
      goal: () => 'Round the Cape homeward. The clerk will want a word.',
      marker: () => ({ lat: -34.4, lon: 18.5, nm: 180, label: 'The Cape, homeward' }),
      at: seaNear(-34.4, 18.5, 180),
      homeward: true,
      hooks: ['weigh'],
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
      at: ports('lisboa'),
      homeward: true,
      quarter: 'court',
      hooks: [],
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
});

// ---------------------------------------------------------------------------
// 19–21. The Malabar coast and what lies beyond it: the far end of the road, where the last act's
// pepper is bought and the first real trouble with the merchants who held it before.

/** Between Calecute and Cananor, where the coastal dhows pass. */
const DHOW_LANE: LatLon = { lat: 11.55, lon: 75.1 };

export const feitorCalecute = thread({
  id: 'feitorcal',
  title: 'The Factory at Calecute',
  blurb: 'The factor at Calecute is frightened, and the men who make him so have not said why.',
  offeredAt: ['melinde', 'mocambique', 'calecute', 'cananor', 'cochim'],
  requires: [gte('act', 4)],
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
      at: ports('calecute'),
      kind: 'front',
      hooks: ['aftermath'],
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
      at: ports('cochim'),
      needs: [afterDays(30)],
      kind: 'front',
      hooks: [],
      scene: (g, q) => {
        // What the merchants do is partly dice, weighted by what was done about it, and by the world: the Crescent's stage, and the ships the King's letter has stopped off Calecute.
        const risk = clamp((q.flags.armed ? 0.25 : q.flags.evacuated ? 0.1 : 0.6)
          + 0.06 * (Number(qualityOf(g, 'front.crescent.stage')) - 1)
          + 0.05 * Math.min(3, Number(qualityOf(g, 'ledger.ship.stopped@calicut'))), 0.05, 0.9);
        const riot = roll(g) < risk;
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
});


export const mappila = thread({
  id: 'mappila',
  title: 'The Pepper Houses',
  blurb: 'The Moorish merchants of the Malabar coast held the pepper trade before you came, and have opinions about it.',
  offeredAt: ['calecute', 'cochim', 'cananor'],
  requires: [gte('act', 4), lte('front.crescent.stage', 3)],
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
      at: ports('calecute', 'cochim', 'cananor'),
      kind: 'front',
      hooks: ['dhows'],
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
      at: seaNear(DHOW_LANE.lat, DHOW_LANE.lon, 35),
      kind: 'front',
      hooks: ['raja'],
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
              gg.noteDeed('ship.stopped', { target: 'calicut', magnitude: 0.5, note: 'Stopped the coastal dhows between Calecute and Cananor and took forty quintals of their pepper as the King’s.' });
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
      at: ports('cananor'),
      quarter: 'court',
      kind: 'front',
      hooks: [],
      scene: (_g, q) => scene(q, 'raja', 'The Kolathiri',
        'The Raja of Cananor is old, fat, and delighted to see you. The Zamorin’s enemy is his friend, he '
        + 'says, and a Portuguese ship is worth two regiments. '
        + (q.flags.searched ? 'He has heard about the dhows, and is very pleased. ' : q.flags.informed ? 'He has heard that there is an honest captain on the coast, and would like to see the animal. '
          : q.flags.refused ? 'He has heard that a captain turned down Khwaja Muhammad’s pepper, and thinks it either very honest or very expensive. ' : '')
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
});

// ---------------------------------------------------------------------------
// 22–24. The last act: the pepper race, the fleet that cannot afford a fever, and what the King offers.

export const pepperRace = thread({
  id: 'pepperrace',
  title: 'The Pepper Race',
  blurb: 'Your rival has the same idea about the first great cargo home, and a faster ship.',
  offeredAt: ['cochim', 'calecute', 'cananor'],
  requires: [gte('act', 5)],
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
      at: ports('cochim', 'calecute', 'cananor'),
      hooks: ['chase'],
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
      at: seaNear(-34.4, 18.5, 200),
      homeward: true,
      expires: {
        when: has('route.opened'),
        settle: (g, q) => end(g, q, 'lapsed', 'The pepper was home before the race could be run, and nobody asked who had been first.'),
      },
      hooks: ['landing'],
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
      at: ports('lisboa'),
      homeward: true,
      kind: 'deadline',
      expires: {
        when: has('route.opened'),
        settle: (g, q) => end(g, q, 'lapsed', 'The pepper was home before the race could be run, and nobody asked who had been first.'),
      },
      hooks: [],
      scene: (g, q) => {
        // Who is first is what the voyage has made it, and a little luck.
        const edge = (q.flags.outbid ? 0.22 : 0) + (q.flags.sabotage ? 0.3 : 0) + (q.flags.pressed ? 0.15 : 0)
          + (q.flags.divided ? 0.05 : 0) + g.rng.next() * 0.45;
        const first = edge > 0.5;
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
});

