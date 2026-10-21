import { clamp } from '../core/math';
import type { SeaChoice, SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';
import { asking, clearAsk } from '../world/powers/moves';
import { hasActive } from '../world/powers/core';
import { ruleReading } from '../world/powers/rule';
import type { PowersState } from '../world/powers/types';
import type { TrafficScene } from './trafficScenes';

/**
 * The courts of the Swahili coast and Malabar, as people (BUILD_PLAN D4).
 *
 * Fourteen short scenes at Melinde, Kilwa, Mombaça, Calecute, Cananor and Cochim, offered by the state of the Powers
 * and the Rule and by what the captain has done, on the same machinery as the Traffic's (a `SeaEvent`, answered at the
 * quay, its choices writing the Ledger). Nobody here is an obstacle: a chamberlain wants an ally, a vizier wants a
 * letter for his gold dhows, a merchant house wants its ships let alone, a Raja wants somebody to stand behind him,
 * and a dhow master wants to be home. They have moves of their own (world/powers/swahili.ts, malabar.ts); these are
 * what the captain meets of them at the water-stairs.
 *
 * THE RULE. The cartaz is made at Calecute and Kilwa in Act IV by what the captain does when a dhow without the King's
 * letter is brought under his guns (`rule-dhow-*`), when a house asks for passes (`calecute-mappila`, `kilwa-gold`),
 * and by the gifts and promises he leaves there. The Captain's Book prints the result in one line (world/powers/rule).
 *
 * THE WINNABLE FIGHT. At Melinde, the harbour-master keeps a list of passes in the sultan's own hand and fears the
 * King's officer will stop every ship that is not on the King's. The captain can stand beside him and keep the list:
 * `melinde-harbourmaster` (the sultan's seal), `melinde-banyan` (a surety), `melinde-list` (the stand, 250 cruzados, once).
 * Like the Mpinda register, it changes one place, at a cost, and nothing larger.
 *
 * ROAD ORDER. The Swahili coast runs Moçambique, Kilwa, Mombaça, Melinde; Malabar runs Calecute, Cananor, Cochim.
 * Every `after` names a scene at the same port or earlier along the road, and what is carried (Mombaça's terms,
 * the Kolathiri's letter) is carried forward: Kilwa to Mombaça to Melinde, Cananor to Cochim. `scripts/powers.ts`
 * checks it with `road.ts: along()`.
 *
 * SOURCES AND WHAT IS INVENTED: docs/SOURCES.md, "Swahili coast, Malabar and the Rule (D4)". The courts, the rivalry of
 * Melinde and Mombaça, the Mappila merchants, Cochin's tribute to the Zamorin and Cananor's Kolathiri are documented;
 * every NAME below, every sum and the harbour-master's list at Melinde are the game's own.
 */

const DAY = 86400;
const sid = (id: string): string => `power:${id}`;

function scene(id: string, title: string, text: string, choices: SeaChoice[], severity: SeaEvent['severity'] = 'note'): SeaEvent {
  return { id: sid(id), title, text, severity, choices, council: false };
}

function had(g: Game, id: string): void {
  g.powers.seen[id] = g.clock.t;
  delete g.powers.seen[`fired:${id}`];
}
function again(g: Game, id: string, line: string): string {
  delete g.powers.seen[`fired:${id}`];
  g.powers.seen[`later:${id}`] = g.clock.t;
  return line;
}
const casaRegard = (g: Game, d: number): void => { g.casa.regard = clamp(g.casa.regard + d, -1, 1); };
const spend = (g: Game, n: number): boolean => { if (g.crown.gold < n) return false; g.crown.gold -= n; return true; };
const hasLingua = (g: Game): boolean => g.crew.officers.some((o) => o.alive && !o.ashoreAt && o.role === 'lingua');
const trustOf = (g: Game, polity: string): number => g.diplomacy.polities[polity]?.trust ?? 0;
const inAct4 = (g: Game): boolean => g.chronicle.act >= 4;
const ruleStage = (st: PowersState): number => st.fronts.rule.stage;
const warOn = (g: Game): boolean => hasActive(g.powers, 'mombasa', 'war', g.clock.t);

function endWar(g: Game): void {
  for (const e of g.powers.effects) if (e.power === 'mombasa' && e.kind === 'war' && e.end > g.clock.t) e.end = g.clock.t;
}

// ---------------------------------------------------------------------------------------------
// Melinde

const melindeWelcome: TrafficScene = {
  id: 'melinde-welcome', ports: ['melinde'],
  needs: () => true,
  build: (g, st) => {
    const war = warOn(g);
    const terms = typeof st.powers.mombasa.flags.terms === 'number';
    return scene('melinde-welcome', 'The chamberlain at the water-stairs',
      'The sultan’s chamberlain, Mwinyi Hamad bin Faraji, comes down to the stairs himself, which he does not do for every ship. He has a house for the captain on the quay, '
      + 'a pilot if one is wanted, and a dish of rice and goat that has been cooking since the lookout saw your topsails. He says all this slowly and with some pleasure, and then he says the rest.\n\n'
      + (war
        ? 'The boats of Mombaça are out. Two fishing fleets have been burned, grain is short, and the sultan has asked every captain who has put in this season for powder and a friend. He does not say that the second is the harder to find. '
        : 'Mombaça is quiet this season, which the sultan does not trust. Melinde is the smaller town, and the friend of anyone Mombaça hates; it has said so to every ship that came before you. ')
      + 'He asks nothing yet. He says only that the sultan would think well of a ship that stood with Melinde, and that the sultan has a long memory for both kinds of ship.'
      + (terms ? '\n\nYou have a letter in your chest that was given to you at Mombaça, in a sealed cover. It is Mombaça’s terms.' : ''),
      [
        ...(terms && war ? [{
          label: 'Hand over Mombaça’s terms as they were written',
          detail: 'The sultan will read them in front of the council. If they are fair he may take them.',
          resolve: (gg: Game) => {
            had(gg, 'melinde-welcome');
            delete gg.powers.powers.mombasa.flags.terms;
            endWar(gg);
            gg.noteDeed('peace.made', { target: 'malindi', place: 'melinde', magnitude: 0.8, note: 'Carried Mombaça’s terms to Melinde’s sultan as they were written. He read them out to his council and took them.' });
            gg.noteDeed('favour.done', { target: 'mombasa', place: 'melinde', magnitude: 0.5, note: 'Delivered the sultan of Mombaça’s letter to Melinde, sealed.' });
            return 'The sultan reads the terms twice, once aloud. The council is not pleased, and it is not unhappy. By evening the chamberlain says the boats may go out again on both sides.';
          },
        } satisfies SeaChoice, {
          label: 'Keep the letter back, and say nothing of it',
          detail: 'The war goes on. Nobody asked you to carry it.',
          resolve: (gg: Game) => {
            had(gg, 'melinde-welcome');
            delete gg.powers.powers.mombasa.flags.terms;
            gg.noteDeed('peace.left', { target: 'malindi', place: 'melinde', magnitude: 0.5, note: 'Was given Mombaça’s terms and did not deliver them to Melinde.' });
            return 'The chamberlain asks whether you have anything else for the sultan. You say no.';
          },
        } satisfies SeaChoice] : []),
        {
          label: 'Give your word that the ship will stand with Melinde against Mombaça',
          detail: 'Melinde will remember it, and so will Mombaça. A word you do not keep is remembered longer.',
          resolve: (gg) => {
            had(gg, 'melinde-welcome');
            gg.powers.powers.melinde.flags.sworn = gg.clock.t;
            clearAsk(gg.powers, 'melinde');
            gg.noteDeed('ally.sworn', { target: 'malindi', place: 'melinde', magnitude: 0.6, note: 'Told the sultan of Melinde’s chamberlain that my ship would stand with Melinde against Mombaça.' });
            return 'The chamberlain touches his chest. The sultan has the word before the dish is cold, and the pilot is sent for.';
          },
        },
        {
          label: 'Say the ship trades with both coasts and takes no side',
          detail: 'It is honest. The chamberlain will think no worse of you, and no better.',
          resolve: (gg) => {
            had(gg, 'melinde-welcome');
            gg.noteDeed('courtesy.kept', { target: 'malindi', place: 'melinde', magnitude: 0.3, note: 'Told Melinde’s chamberlain I took no side between the coasts, and ate his rice.' });
            return 'The chamberlain says that is what the sultan’s father said to the last ship. He says it without heat and has more rice put on the dish.';
          },
        },
      ]);
  },
};

const melindeHarbourmaster: TrafficScene = {
  id: 'melinde-harbourmaster', ports: ['melinde'], after: ['melinde-welcome'],
  needs: (g, st) => inAct4(g) && ruleStage(st) >= 1 && st.localRule?.state !== 'won' && st.localRule?.state !== 'lost',
  build: (_g, st) => scene('melinde-harbourmaster', 'The roll in the sultan’s hand',
    'The harbour-master, Mwinyi Juma bin Salim, has a roll on his knee that is not the Portuguese factor’s. It lists the dhows of the coast and of Cambay that call at Melinde, '
    + 'with their masters and their owners, each in the sultan’s own chancery hand and each with the sultan’s seal. A dhow on it is a dhow the sultan answers for. '
    + 'He has heard that the King of Portugal’s officers stop any ship without the King’s letter, and he asks, as a man asks the price of a horse, whether the roll counts for anything with them.\n\n'
    + (ruleStage(st) >= 3
      ? 'He says it is not idle. Last month an officer stopped a Cambay dhow in the roads, on the roll, and let her go three days later with her cargo lighter.'
      : 'He says nothing has happened yet. He would like it to stay so.')
    + ' He does not ask you to promise. He asks you to look at the roll, and he gives you the seal to hold while you do, which is a courtesy and a test.',
    [
      {
        label: 'Look at it, and say a roll like this is the way a friend’s ships should be known',
        detail: 'He lets you keep the sultan’s seal for the list. It commits you to nothing yet.',
        resolve: (gg) => {
          had(gg, 'melinde-harbourmaster');
          const loc = gg.powers.localRule ??= { state: 'unmet' };
          loc.seal = true;
          gg.noteDeed('courtesy.kept', { target: 'malindi', place: 'melinde', magnitude: 0.4, note: 'Looked over the harbour-master’s roll of passes at Melinde and told him a roll like it was the way a friend’s ships should be known.' });
          return 'The harbour-master rolls it up and gives you the seal, a thumb of dark wood tied with a cord. He says it is to be shown to the officer at the stairs, and to nobody else.';
        },
      },
      {
        label: 'Tell him the King’s letter is the King’s, and a roll is a roll',
        detail: 'It is the truth as the orders have it. He will not ask again.',
        resolve: (gg) => {
          had(gg, 'melinde-harbourmaster');
          gg.noteDeed('pass.refused', { target: 'malindi', place: 'melinde', magnitude: 0.4, note: 'Told Melinde’s harbour-master that a roll of passes in the sultan’s hand did not count against the King’s letter.' });
          return 'He thanks you for the plain answer. He puts the roll in its chest and the seal in his sleeve.';
        },
      },
    ]),
};

const melindeBanyan: TrafficScene = {
  id: 'melinde-banyan', ports: ['melinde'], after: ['melinde-harbourmaster'],
  needs: (_g, st) => st.localRule?.seal === true && st.localRule.state !== 'won' && st.localRule.state !== 'lost' && !st.localRule.trust,
  build: () => scene('melinde-banyan', 'A Cambay man’s surety',
    'Jivan Kanji, a Cambay merchant who has kept a warehouse at Melinde for twenty years, has come to ask whether the harbour-master has shown you the roll. He is round and careful and dresses plainly. '
    + 'He owns shares in nine of the dhows on it. He says the roll is worth only what the masters on it are worth, and a captain who does not know them has no reason to trust it.\n\n'
    + 'So he will stand surety. If a master on the roll is found to carry what he should not, Jivan Kanji pays the King’s factor the value of the cargo out of his own warehouse. '
    + 'He asks for nothing for it, except that when the King’s officer comes to the stairs somebody who has the King’s ear is standing beside the harbour-master.',
    [
      {
        label: 'Take his surety, and write it into the ship’s book',
        detail: 'His name goes beside yours. If a master on the roll cheats, he pays.',
        resolve: (gg) => {
          had(gg, 'melinde-banyan');
          const loc = gg.powers.localRule ??= { state: 'unmet' };
          loc.trust = true;
          gg.noteDeed('favour.done', { target: 'malindi', place: 'melinde', magnitude: 0.4, note: 'Wrote Jivan Kanji’s surety for nine dhows at Melinde into the ship’s book.' });
          return 'He puts his thumb to the page and then, because it is the custom of his house, a drop of water beside it. The clerk writes the nine names.';
        },
      },
      {
        label: 'Thank him, and say you will not be bound by a merchant’s word',
        detail: 'Nothing is lost but his goodwill.',
        resolve: (gg) => { had(gg, 'melinde-banyan'); return 'He nods as if he had expected it, and goes back along the quay to his warehouse.'; },
      },
    ]),
};

const melindeList: TrafficScene = {
  id: 'melinde-list', ports: ['melinde'], after: ['melinde-harbourmaster'], repeatDays: 20,
  needs: (_g, st) => (st.localRule?.state === 'unmet' || st.localRule?.state === 'offered') && ruleStage(st) >= 2,
  build: (g, st) => {
    const loc = st.localRule ??= { state: 'unmet' };
    loc.state = 'offered';
    const seal = !!loc.seal;
    const trust = !!loc.trust || hasLingua(g) || trustOf(g, 'malindi') >= 0.3;
    return scene('melinde-list', 'The officer at the stairs',
      'An officer of the King’s, Rui Teles, has come ashore with six men and a paper that says no dhow is to leave the roads of Melinde without the King’s letter. He is neither cruel nor a fool: '
      + 'he has orders, and a fleet that wants to know by autumn whether the coast can be policed. Four dhows are lying under the sultan’s seal, and the first is being turned back from the stairs, her master standing with his hands open.\n\n'
      + 'The harbour-master is on the stairs with his roll. He has no guns and no ships. He has a roll, a seal, and a long memory of what the sultan has paid to keep this coast quiet.\n\n'
      + `To keep the roll honoured in the King’s name you need the sultan’s seal (${seal ? 'you hold it' : 'you have not got it'}), a surety or a tongue the harbour-master trusts (${trust ? 'you have one' : 'you have none'}), and two hundred and fifty cruzados, `
      + 'the bond Rui Teles is answerable to his captain for. It will cost the Casa’s favour. It can be done once.',
      [
        {
          label: 'Stand beside the harbour-master and say the sultan’s roll is the King’s letter at Melinde (250 cruzados)',
          detail: 'The one winnable fight of the Rule: it needs the seal, the surety and the money, and it changes one harbour.',
          resolve: (gg) => {
            const s = gg.powers;
            const l = s.localRule ??= { state: 'unmet' };
            if (!l.seal) return again(gg, 'melinde-list', 'Rui Teles asks what authority you have to speak for the roll. The harbour-master has not given you the seal, and the sultan’s name is not yours to use.');
            if (!(l.trust || hasLingua(gg) || trustOf(gg, 'malindi') >= 0.3)) return again(gg, 'melinde-list', 'The harbour-master looks at you as he would at a pilot he has never met. Somebody he knows must vouch for the masters, or you must speak his tongue.');
            if (!spend(gg, 250)) return again(gg, 'melinde-list', 'You have not got two hundred and fifty cruzados. Rui Teles says his orders do not wait for it.');
            l.state = 'won';
            l.at = gg.clock.t;
            had(gg, 'melinde-list');
            casaRegard(gg, -0.08);
            gg.noteDeed('compact.made', {
              target: 'melinde', place: 'melinde', magnitude: 0.8,
              note: 'Stood beside Melinde’s harbour-master and told the King’s officer at the stairs that I would answer for every dhow on the sultan’s roll. It cost 250 cruzados and the Casa’s favour.',
            });
            s.effects.push({
              id: s.nextId++, kind: 'register', power: 'melinde', ports: ['melinde'], start: gg.clock.t, end: gg.clock.t + 8 * 365 * DAY, duesMult: 0.93,
              reason: 'The King’s officer lets pass any dhow on the sultan’s roll at Melinde, as he has since you stood beside the harbour-master.',
            });
            s.powers.melinde.flags.compact = gg.clock.t;
            return 'Rui Teles reads the roll twice and the surety once. He turns the first dhow round and lets her out. The three behind her follow without a word, and the master of the first touches his forehead to the harbour-master as she passes.';
          },
        },
        {
          label: 'Tell the officer his orders are his own affair',
          detail: 'Nothing changes at the stairs. He may ask again.',
          resolve: (gg) => again(gg, 'melinde-list', 'Rui Teles turns back the next dhow. The harbour-master rolls up his roll slowly.'),
        },
        {
          label: 'Let it go',
          detail: 'It is the King’s officer and the sultan’s harbour. You will not have this chance again.',
          resolve: (gg) => {
            gg.powers.localRule!.state = 'lost';
            had(gg, 'melinde-list');
            return 'The dhows are turned back one by one. By evening the harbour-master has put his roll back in the chest and the seal back in his sleeve.';
          },
        },
      ]);
  },
};

const melindeAfter: TrafficScene = {
  id: 'melinde-after', ports: ['melinde'], after: ['melinde-list'],
  needs: (g, st) => st.localRule?.state === 'won' && g.clock.t - (st.localRule.at ?? g.clock.t) >= 60 * DAY,
  build: () => scene('melinde-after', 'The first page',
    'The harbour-master has the roll spread on the quay with a stone at each corner, and a second hand beside the sultan’s: Rui Teles’s, small and square, writing a number against each dhow that has been let out. Forty-one so far, and none has been found with what it should not carry. '
    + 'Mombaça’s boats are not on the roll, and Mombaça has noticed. The sultan’s chamberlain has been asked three times what the Portuguese mean by it.\n\n'
    + 'The harbour-master asks one thing of you: that the next captain who stands at these stairs be told what was done, so that he does not have to do it again.',
    [
      {
        label: 'Say it was the sultan’s roll, and not yours',
        detail: 'It was. Melinde will remember who said so.',
        resolve: (gg) => {
          had(gg, 'melinde-after');
          gg.noteDeed('mark.for', { target: 'malindi', place: 'melinde', magnitude: 0.5, note: 'Said at Melinde that the roll of passes was the sultan’s, and not mine.' });
          return 'The harbour-master rolls it up. He says that is a thing worth telling.';
        },
      },
      {
        label: 'Say nothing; let the officer’s hand stand beside it',
        detail: 'The roll is the harbour-master’s.',
        resolve: (gg) => { had(gg, 'melinde-after'); return 'Rui Teles looks up, nods once, and writes the next number.'; },
      },
    ]),
};

// ---------------------------------------------------------------------------------------------
// Kilwa

const kilwaGold: TrafficScene = {
  id: 'kilwa-gold', ports: ['quiloa'],
  needs: () => true,
  build: (g, st) => {
    const dry = hasActive(st, 'kilwa', 'stub', g.clock.t);
    const wants = asking(st, 'kilwa', g.clock.t) === 'pass';
    return scene('kilwa-gold', 'The counting house at Kilwa',
      'The great mosque and the coral-stone houses of Kilwa are older than anything in Lisbon that is not a church, and the vizier’s counting house is the best-kept room in them. '
      + 'Rashid bin Sultani, who has weighed the sultan’s tithe for thirty years, shows you the scales and a chest that is a good deal lighter than his father’s. '
      + (dry ? 'The Sofala dhows are late this season, and he says so without shame; they were late in his father’s time too, and they came. ' : 'The dhows from Çofala have come in, and the tithe is weighed; but he says it with the air of a man counting what he still has. ')
      + 'He knows how the ships of the Portuguese ask the way to Çofala itself. He does not blame them. He would ask, too.\n\n'
      + (wants
        ? 'What he wants is simple. The gold dhows sail north to Melinde and Cambay with the tithe paid. He has heard that the King’s ships stop any vessel without a letter. He asks whether you will write one, for the dhows of the vizier’s house.'
        : 'He pours sherbet. He asks, without hurry, what the Portuguese intend for the gold.'),
      [
        {
          label: 'Write a pass for the vizier’s dhows, in the King’s name',
          detail: 'The Casa will not know of it for a year. A master with your letter is a master you will not have to stop.',
          resolve: (gg) => {
            had(gg, 'kilwa-gold');
            clearAsk(gg.powers, 'kilwa');
            casaRegard(gg, -0.03);
            gg.noteDeed('pass.granted', { target: 'kilwa', place: 'quiloa', magnitude: 0.6, note: 'Wrote a pass for the dhows of the vizier of Kilwa’s house, in the King’s name, with the Sofala tithe paid.' });
            return 'Rashid bin Sultani reads it with his lips moving, and has it copied in Arabic beneath. He says that the gold will go north with this in the master’s chest, and that he will say who wrote it.';
          },
        },
        {
          label: 'Say a letter must come from the Governor, and you cannot write one',
          detail: 'It is the truth as the orders have it. The dhows will go without.',
          resolve: (gg) => {
            had(gg, 'kilwa-gold');
            gg.noteDeed('pass.refused', { target: 'kilwa', place: 'quiloa', magnitude: 0.5, note: 'Told the vizier of Kilwa’s house that I could not write a letter for his gold dhows.' });
            return 'He bows. He says the dhows have sailed without letters since before there were Portuguese. He does not say they will go on doing so.';
          },
        },
        {
          label: 'Weigh what he offers at the counting-house price, and say nothing about letters',
          detail: 'Business, as at any quay.',
          resolve: (gg) => { had(gg, 'kilwa-gold'); return 'The scales are honest and the sherbet is cold. Rashid bin Sultani writes the weight in the book himself.'; },
        },
      ]);
  },
};

/** A dhow brought into the roads without the King's letter: the Rule in person. */
function dhowScene(id: string, port: 'quiloa' | 'calecute'): TrafficScene {
  const kilwa = port === 'quiloa';
  return {
    id, ports: [port], after: kilwa ? ['kilwa-gold'] : ['calecute-court'],
    needs: (g) => inAct4(g),
    build: (_g, st) => {
      const master = kilwa ? 'Juma bin Omari' : 'Ali Kutty';
      const cargo = kilwa ? 'a goatskin of gold dust and bolts of Cambay cloth' : 'forty bags of pepper for the Red Sea road';
      const prize = kilwa ? 140 : 110;
      const stage = ruleStage(st);
      return scene(id, kilwa ? 'A gold dhow in the roads' : 'A pepper dhow off the point',
        `The boat has brought a dhow in under the ship’s guns: ${master}, nakhoda, bound ${kilwa ? 'north for Melinde' : 'up the coast for Cambay'} with ${cargo}. `
        + 'He has the sultan’s paper and a seal from his own port. He has no letter in the King’s name, because nobody had told him there was one until the boat came alongside. '
        + 'He is not afraid; he is annoyed. He has a wife at home and a loading-date, and he stands on your deck with his sandals in his hand because he was asked to take them off.\n\n'
        + (stage >= 3 ? 'Your orders are plain: a ship without the letter is to be searched and, if there is anything in her that the King would want, held. '
          : stage === 2 ? 'Your orders say the ships of friends carry a letter and are left alone; this master has none, and nobody has told you whether he is a friend. '
            : 'Your orders say the King’s letter is to be asked for. Nobody on this coast has yet been refused for lacking one. ')
        + 'The pilot says nothing. The master says that if you want his cargo, the boat can take it; he would rather be told now.',
        [
          {
            label: `Search her and hold her (about ${prize} cruzados in prize)`,
            detail: 'The King’s letter, enforced. The master and his people go ashore. The coast will hear of it by supper.',
            resolve: (gg) => {
              had(gg, id);
              gg.crown.gold += prize;
              gg.noteDeed('ship.stopped', { target: kilwa ? 'kilwa' : 'calicut', place: port, magnitude: 0.6, note: `Stopped ${master}’s dhow in the roads without the King’s letter and held her; ${cargo}.` });
              return `The boat’s crew goes over her side with a clerk. ${master} is put ashore with his people and his sandals, and the dhow is taken round to the ship’s lee. He says nothing as he goes; he looks back once, at the paper he was not allowed to keep.`;
            },
          },
          {
            label: 'Let him go on with a warning that the next ship will stop him',
            detail: 'He is told there is a letter. Nothing is taken.',
            resolve: (gg) => {
              had(gg, id);
              gg.noteDeed('ship.spared', { target: kilwa ? 'kilwa' : 'calicut', place: port, magnitude: 0.5, note: `Let ${master}’s dhow go on without the King’s letter, with a warning.` });
              return `${master} puts on his sandals. He says he will tell the next port. You do not ask what he will say.`;
            },
          },
          {
            label: 'Write him a pass in the King’s name, and let him go',
            detail: 'A letter in his chest for a year. The Casa will count it among your faults, if it counts at all.',
            resolve: (gg) => {
              had(gg, id);
              casaRegard(gg, -0.02);
              gg.noteDeed('pass.granted', { target: kilwa ? 'kilwa' : 'calicut', place: port, magnitude: 0.5, note: `Wrote ${master} a pass in the King’s name for his dhow and let her go on.` });
              return `The clerk writes it in Portuguese and ${master} has it copied beneath in his own hand. He folds it into a cloth. He says it will be shown at every port between here and home.`;
            },
          },
        ]);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Mombaça

const mombasaGrievance: TrafficScene = {
  id: 'mombasa-grievance', ports: ['mombaca'],
  needs: () => true,
  build: (g, st) => {
    const shut = hasActive(st, 'mombasa', 'embargo', g.clock.t);
    return scene('mombasa-grievance', 'The sultan’s envoy on the beach',
      'Mombaça does not come to the beach to meet a Portuguese ship; the envoy, Mwinyi Chande bin Abdallah, has been sent down because the sultan wishes it known that he was sent. '
      + 'He is dignified and not young. He has a list, and he reads it without notes: that the first Portuguese to come here were met with courtesy, and answered with boats taken; '
      + 'that Melinde has a house on the quay for the Portuguese and Mombaça has not been asked; that the dues at Mombaça are the dues the sultan’s father set, and paid by every nation.\n\n'
      + (shut ? 'The sultan has shut the quay, he says, and will open it when the list is answered. ' : '')
      + 'He does not ask for an alliance. He asks to be treated as the harbour it is.',
      [
        {
          label: 'Say the Portuguese will pay the dues in full and ask for the quay as any guest',
          detail: 'Nothing promised against Melinde. Mombaça will think better of you for it.',
          resolve: (gg) => {
            had(gg, 'mombasa-grievance');
            for (const e of gg.powers.effects) if (e.power === 'mombasa' && e.kind === 'embargo' && e.end > gg.clock.t) e.end = gg.clock.t;
            gg.noteDeed('courtesy.kept', { target: 'mombasa', place: 'mombaca', magnitude: 0.5, note: 'Told the sultan of Mombaça’s envoy that I would pay the dues in full and ask for the quay as any guest.' });
            return 'Mwinyi Chande inclines his head the width of a finger. He says the sultan will be told. He says the quay will be open before the evening prayer.';
          },
        },
        {
          label: 'Say Melinde is the Portuguese’s friend and Mombaça may learn to be one',
          detail: 'It is the plain truth of how the coast sees it. It will be repeated.',
          resolve: (gg) => {
            had(gg, 'mombasa-grievance');
            gg.noteDeed('mark.against', { target: 'mombasa', place: 'mombaca', magnitude: 0.5, note: 'Told the sultan of Mombaça’s envoy that Melinde was the Portuguese’s friend and Mombaça might learn to be one.' });
            return 'He does not move. He says that the sultan’s grandfather was called a friend by a good many ships, and that most of them are not remembered.';
          },
        },
        {
          label: 'Say the quarrels of the coast are not the ship’s',
          detail: 'Nothing changes.',
          resolve: (gg) => { had(gg, 'mombasa-grievance'); return 'He folds the list. He says that a ship that has no quarrel can still be in the middle of one.'; },
        },
      ]);
  },
};

const mombasaTruce: TrafficScene = {
  id: 'mombasa-truce', ports: ['mombaca'], after: ['mombasa-grievance'], repeatDays: 30,
  needs: (g, st) => warOn(g) && typeof st.powers.mombasa.flags.terms !== 'number',
  build: () => scene('mombasa-truce', 'Terms, sealed',
    'The war with Melinde has gone on for months and Mombaça has not won it. The envoy, Mwinyi Chande, says as much, in the way of a man saying that a cargo has not sold. '
    + 'The sultan will not write to Melinde, because he does not write first. But a Portuguese captain is bound that way, and has no stake in either side’s pride, '
    + 'and a letter carried by a stranger is not a letter written.\n\n'
    + 'He holds out a cover sealed with the sultan’s own ring. He says what is in it: the boats of both towns to land at both quays again, and the grain trade to open, and neither sultan to be asked to bow first. He does not say what he will do if the answer is no.',
    [
      {
        label: 'Take the letter to Melinde, sealed',
        detail: 'Melinde lies on the road ahead. The sultan there will read it.',
        resolve: (gg) => {
          had(gg, 'mombasa-truce');
          gg.powers.powers.mombasa.flags.terms = gg.clock.t;
          return 'Mwinyi Chande presses the cover into your hand with both of his. He says the ring is not to be broken by anyone but the man it is addressed to.';
        },
      },
      {
        label: 'Say you will carry no letters between the sultans',
        detail: 'The war goes on.',
        resolve: (gg) => again(gg, 'mombasa-truce', 'He takes the cover back. He says the offer will stand until the next ship, and not longer.'),
      },
    ]),
};

// ---------------------------------------------------------------------------------------------
// Calecute

const calecuteCourt: TrafficScene = {
  id: 'calecute-court', ports: ['calecute'],
  needs: () => true,
  build: (g, st) => {
    const shut = hasActive(st, 'calicut', 'embargo', g.clock.t);
    const wants = asking(st, 'calicut', g.clock.t) === 'pass';
    return scene('calecute-court', 'The Zamorin’s treasurer',
      'The palace at Calecute is long and low and full of men waiting. The Zamorin sees nobody in a hurry; his treasurer, Kunhi Raman, receives you in a side hall with a lamp lit although it is noon, '
      + 'and the Moorish brokers who are there stand when he stands and sit when he sits. They own the pepper, and the Zamorin’s ear, and he has told you more than once that he is not their servant.\n\n'
      + (shut ? 'The quay has been closed to the Portuguese by the Zamorin’s order, on the Mappila houses’ advice, and the treasurer has asked you here to say what would open it. ' : '')
      + (wants ? 'What the court asks is a letter. The Zamorin’s own ships and the Mappila houses’ are sailing under the Portuguese guns; they would like to be known as friends. ' : '')
      + 'Kunhi Raman says the Zamorin has seen the King of Portugal’s letter and has not yet answered it. He asks what the captain would answer in his place.',
      [
        {
          label: 'Promise the Zamorin’s own ships the King’s letter, and ask him to answer the King',
          detail: 'A pass for the court. The Casa would say it is not yours to give.',
          resolve: (gg) => {
            had(gg, 'calecute-court');
            clearAsk(gg.powers, 'calicut');
            for (const e of gg.powers.effects) if (e.power === 'calicut' && e.kind === 'embargo' && e.end > gg.clock.t) e.end = gg.clock.t;
            casaRegard(gg, -0.05);
            gg.noteDeed('pass.granted', { target: 'calicut', place: 'calecute', magnitude: 0.7, note: 'Promised the Zamorin’s own ships the King’s letter and asked him to answer the King.' });
            return 'Kunhi Raman writes a line in his own book. He says the Zamorin will be told that a Portuguese captain gave his word. He does not say the Zamorin will believe it.';
          },
        },
        {
          label: 'Say the King’s letter is for his friends, and the Zamorin has a house to show it',
          detail: 'It is how the orders read. The Mappila houses will hear it by evening.',
          resolve: (gg) => {
            had(gg, 'calecute-court');
            gg.noteDeed('pass.refused', { target: 'calicut', place: 'calecute', magnitude: 0.6, note: 'Told the Zamorin’s treasurer that the King’s letter was for his friends, and that the Zamorin had a house to show it.' });
            return 'The brokers look at one another. Kunhi Raman closes his book. He says he will tell the Zamorin exactly that.';
          },
        },
        {
          label: 'Ask to hear the Mappila houses first, in their own words',
          detail: 'No promise either way. It opens the next conversation.',
          resolve: (gg) => {
            had(gg, 'calecute-court');
            gg.noteDeed('courtesy.kept', { target: 'calicut', place: 'calecute', magnitude: 0.4, note: 'Asked the Zamorin’s treasurer to let me hear the Mappila houses in their own words.' });
            return 'Kunhi Raman looks at the brokers. The oldest of them stands. He says his house is called Koya and that he will wait at the water-stairs.';
          },
        },
      ]);
  },
};

const calecuteMappila: TrafficScene = {
  id: 'calecute-mappila', ports: ['calecute'], after: ['calecute-court'],
  needs: (g) => inAct4(g),
  build: (g, st) => {
    const shut = hasActive(st, 'calicut', 'embargo', g.clock.t);
    return scene('calecute-mappila', 'The Koya house',
      'Ibrahim Koya has been the head of his house for eleven years and a pepper broker for forty. He receives you on the water-stairs, standing, because he will not ask a stranger inside until the stranger has said why he is there. '
      + 'The Moors of this coast, he says, have traded with Cambay and Adem and Ormuz since before the Franks had ships; the Zamorin’s court takes its customs from them; and since the Portuguese came, six of his dhows have been stopped on the coast, three of them let go with their cargo lighter.\n\n'
      + (shut ? 'It was his house that told the Zamorin to shut the quay. He says that without apology. ' : '')
      + 'He does not ask you to like him. He asks what a captain of the King’s would write on a letter for a Moor, and whether it would be honoured by the next one.',
      [
        {
          label: 'Write a pass for each of the house’s ships, and enter their names in the ship’s book',
          detail: 'Six ships, six names. The Casa will find the entry.',
          resolve: (gg) => {
            had(gg, 'calecute-mappila');
            casaRegard(gg, -0.04);
            gg.noteDeed('pass.granted', { target: 'calicut', place: 'calecute', magnitude: 0.8, note: 'Wrote a pass for each of Ibrahim Koya’s six ships and entered their names in the ship’s book.' });
            gg.noteDeed('favour.done', { target: 'calicut', place: 'calecute', magnitude: 0.5, note: 'Did the Koya house the favour it asked at the water-stairs.' });
            return 'He has them read to him one at a time and says the name of each ship after the clerk. He says the Koya house will not forget that a stranger wrote them.';
          },
        },
        {
          label: 'Promise to carry the house’s complaint to the King’s factor, and say no more',
          detail: 'It costs a letter. It promises nothing about the next ship.',
          resolve: (gg) => {
            had(gg, 'calecute-mappila');
            gg.noteDeed('favour.done', { target: 'calicut', place: 'calecute', magnitude: 0.4, note: 'Promised the Koya house to carry its complaint about six stopped dhows to the King’s factor.' });
            return 'He says the factor has had the complaint three times and wrote nothing. He says he is glad it will be told a fourth.';
          },
        },
        {
          label: 'Say the pepper is the King’s to buy, and the Red Sea road is shut to the Moors',
          detail: 'It is how the orders read. He will not argue it.',
          resolve: (gg) => {
            had(gg, 'calecute-mappila');
            gg.noteDeed('pass.refused', { target: 'calicut', place: 'calecute', magnitude: 0.7, note: 'Told Ibrahim Koya that the pepper was the King’s to buy and the Red Sea road shut to the Moors.' });
            return 'He bows from the waist. He says the Zamorin’s father was told the same by the Chinese, and the Chinese went home.';
          },
        },
      ]);
  },
};

// ---------------------------------------------------------------------------------------------
// Cananor and Cochim

const kolathiriEnvoy: TrafficScene = {
  id: 'kolathiri-envoy', ports: ['cananor'],
  needs: () => true,
  build: () => scene('kolathiri-envoy', 'A letter for the Raja',
    'The Kolathiri’s messenger, Karunakaran, comes aboard with the Kolathiri’s steward’s leave and a bundle wrapped in palm leaf. His master is jealous of the Zamorin, and has been for as long as the two houses have shared a coast; '
    + 'he has a quay and a warehouse and nothing to put in them except goodwill. He would give the Portuguese a house at Cananor, and the pepper of his own hills at a fair price.\n\n'
    + 'He has a second errand. The Raja of Cochim, to the south, pays tribute to the Zamorin and does not like it. The Kolathiri would like him to know that he is not alone in that. '
    + 'A letter between them would not be safe on the road. A Portuguese ship goes where it likes.',
    [
      {
        label: 'Carry the Kolathiri’s letter to the Raja of Cochim',
        detail: 'Cochim lies ahead on your road. It is a favour, and it will be read as a side.',
        resolve: (gg) => {
          had(gg, 'kolathiri-envoy');
          gg.powers.powers.cochin.flags.letter = gg.clock.t;
          gg.noteDeed('favour.done', { target: 'kolathiri', place: 'cananor', magnitude: 0.4, note: 'Took the Kolathiri’s letter for the Raja of Cochim.' });
          return 'Karunakaran gives you the bundle with both hands. He says it is to be put in the Raja’s hand and in nobody else’s.';
        },
      },
      {
        label: 'Say the ship will trade for pepper, and carry no letters',
        detail: 'Cananor’s pepper is as good as any.',
        resolve: (gg) => {
          had(gg, 'kolathiri-envoy');
          gg.noteDeed('courtesy.kept', { target: 'kolathiri', place: 'cananor', magnitude: 0.3, note: 'Told the Kolathiri’s messenger the ship would trade for pepper and carry no letters.' });
          return 'Karunakaran says the steward will be sorry. He takes the bundle away and the steward sends a basket of mangoes.';
        },
      },
    ]),
};

const cochimRaja: TrafficScene = {
  id: 'cochim-raja', ports: ['cochim'],
  needs: () => true,
  build: (g, st) => {
    const war = hasActive(st, 'calicut', 'war', g.clock.t);
    const letter = typeof st.powers.cochin.flags.letter === 'number';
    const wants = asking(st, 'cochin', g.clock.t) === 'protector';
    return scene('cochim-raja', 'The Raja’s treasurer',
      'Cochim is a smaller town than Calecute, and it knows it. The Raja’s treasurer, Govinda Pillai, receives you at the end of a wooden pier, as if the Raja’s house could not be trusted with a stranger. '
      + (war
        ? 'The Zamorin’s army is across the river, and the pepper that should have come down to the quay is sitting in a village on the wrong side of it. '
        : 'The Zamorin’s men collected the tribute at the last full moon, and Govinda Pillai says the sum without lowering his voice. ')
      + 'He has a warehouse, a berth, a pepper price that is a third lower than Calecute’s, and a Raja who would be glad of somebody who will stand behind him.'
      + (wants ? ' He says so now, in so many words.' : '')
      + (letter ? '\n\nYou have a palm-leaf bundle from the Kolathiri of Cananor, for the Raja’s hand.' : ''),
      [
        ...(letter ? [{
          label: 'Put the Kolathiri’s letter into the Raja’s hand',
          detail: 'The two houses will know a Portuguese ship carried it.',
          resolve: (gg: Game) => {
            had(gg, 'cochim-raja');
            delete gg.powers.powers.cochin.flags.letter;
            gg.noteDeed('favour.done', { target: 'cochin', place: 'cochim', magnitude: 0.5, note: 'Put the Kolathiri’s letter into the Raja of Cochim’s hand.' });
            return 'The Raja reads it in front of the treasurer, and says nothing, and has it read again. He says the Kolathiri is a good neighbour with no army.';
          },
        } satisfies SeaChoice] : []),
        {
          label: 'Promise the ship’s guns at the river mouth if the Zamorin comes down on Cochim',
          detail: 'A word to a small court against a large one. If you do not keep it, Cochim will not forget.',
          resolve: (gg) => {
            had(gg, 'cochim-raja');
            clearAsk(gg.powers, 'cochin');
            gg.powers.powers.cochin.flags.sworn = gg.clock.t;
            gg.noteDeed('ally.sworn', { target: 'cochin', place: 'cochim', magnitude: 0.7, note: 'Promised the Raja of Cochim’s treasurer the ship’s guns at the river mouth if the Zamorin came against Cochim.' });
            return 'Govinda Pillai writes your name in the Raja’s book, in Malayalam first and then in Portuguese letters as best he can. He says Cochim will remember it.';
          },
        },
        {
          label: 'Say the ship will trade honestly at Cochim, and take no side between the courts',
          detail: 'He will think no worse of you. He will think no better.',
          resolve: (gg) => {
            had(gg, 'cochim-raja');
            gg.noteDeed('courtesy.kept', { target: 'cochin', place: 'cochim', magnitude: 0.3, note: 'Told the Raja of Cochim’s treasurer that the ship would trade honestly and take no side between the courts.' });
            return 'Govinda Pillai says that is what the Zamorin’s father said to the Chinese. He has the pepper weighed at the price he named.';
          },
        },
      ]);
  },
};

export const POWER_SCENES: TrafficScene[] = [
  mombasaGrievance, mombasaTruce, melindeWelcome, melindeHarbourmaster, melindeBanyan, melindeList, melindeAfter,
  kilwaGold, dhowScene('rule-dhow-kilwa', 'quiloa'),
  calecuteCourt, calecuteMappila, dhowScene('rule-dhow-calecute', 'calecute'), kolathiriEnvoy, cochimRaja,
];

export const POWER_SCENE_BY_ID = new Map(POWER_SCENES.map((s) => [s.id, s]));

/** Whether a scene may be offered now, given what has been had, its wait and its prerequisites. */
export function powerSceneOffered(g: Game, sc: TrafficScene, port: string): boolean {
  const st = g.powers;
  if (!sc.ports.includes(port)) return false;
  const doneAt = st.seen[sc.id];
  if (doneAt !== undefined && !sc.repeatDays) return false;
  if (doneAt !== undefined && sc.repeatDays && g.clock.t - doneAt < sc.repeatDays * DAY) return false;
  const laterAt = st.seen[`later:${sc.id}`];
  if (laterAt !== undefined && g.clock.t - laterAt < (sc.repeatDays ?? 1) * DAY) return false;
  if (sc.after && !sc.after.every((a) => st.seen[a] !== undefined)) return false;
  return sc.needs(g, st);
}

/** The next scene of the Indian Ocean's courts offered at this port, if any, not yet marked put (the storylet engine's source). */
export function peekPowerScene(g: Game, port: string | null): TrafficScene | null {
  if (!port) return null;
  const st = g.powers;
  for (const sc of POWER_SCENES) {
    if (!sc.ports.includes(port)) continue;
    const id = sid(sc.id);
    if (st.seen[`fired:${sc.id}`] !== undefined) {
      if (g.pendingEvent?.id === id || g.pendingScenes.some((x) => x.id === id)) continue;
      delete st.seen[`fired:${sc.id}`];
    }
    if (!powerSceneOffered(g, sc, port)) continue;
    return sc;
  }
  return null;
}

/** Build a scene and mark it put; it is had when answered. */
export function putPowerScene(g: Game, sc: TrafficScene): SeaEvent {
  g.powers.seen[`fired:${sc.id}`] = g.clock.t;
  return sc.build(g, g.powers);
}

/** The next scene of the Indian Ocean's courts due at this port, if any. Marks it put; it is had when answered. */
export function duePowerScene(g: Game, port: string | null): SeaEvent | null {
  const sc = peekPowerScene(g, port);
  return sc ? putPowerScene(g, sc) : null;
}

/** The Rule's one plain line, for whoever needs it outside the Book. */
export const ruleLineOf = (g: Game): string => ruleReading(g.powers, g.ledger).line;
