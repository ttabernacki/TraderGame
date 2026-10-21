import { MONTH } from './core';
import { declareReader } from './modifiers';
import { active, ask, att, clearAsk, endAll, launch, months, oneOf, rel, say, stageOf, type Ctx } from './moves';

/**
 * Malabar and Gujarat (BUILD_PLAN D4).
 *
 * Calicut's Zamorin is lord of the pepper and the Mappila merchants own his ear; Cochim pays tribute to him and would
 * give a great deal to stop; Cananor's Kolathiri is jealous of the Zamorin and says so. Gujarat is Calicut's ally, and
 * watches. The war of Calicut on Cochim shuts the lane at Cochim (a trunk port: the flagship is let in at a toll) and
 * at Coulão (off the trunk: shut), and a truce reopens them. The Mappila houses can have the Portuguese shut out of
 * Calecute; Cochim can withhold its tribute, which makes a war likelier; the Raja asks for a protector.
 */

declareReader('moves.malabar');

export const CALICUT_PORTS = ['calecute'];
export const COCHIN_PORTS = ['cochim', 'coulao'];
export const KOLATHIRI_PORTS = ['cananor'];
export const GUJARAT_PORTS = ['diu', 'cambaia'];

const warOn = (c: Ctx): boolean => active(c, 'calicut', 'war');

export function calicutTick(c: Ctx): void {
  const a = att(c, 'calicut');
  const p = c.st.powers.calicut;
  const f = p.flags;
  const cochinFriend = Math.max(0, att(c, 'cochin'));
  const withheld = typeof c.st.powers.cochin.flags.tributeWithheld === 'number';
  const rule = stageOf(c, 'rule');
  if (c.t >= p.intentUntil) {
    p.intentUntil = c.t + 24 * MONTH;
    p.intent = warOn(c) ? 'Bring Cochim to heel before the Portuguese make its Raja bold.'
      : a <= -0.3 ? 'Keep the Portuguese out of the Moorish houses’ pepper.'
        : 'Keep the Moorish merchants and the pepper under the Zamorin’s hand.';
  }
  oneOf(c, [
    ['truce', warOn(c) ? 0.1 : 0, () => {
      endAll(c, 'calicut', 'war');
      delete c.st.powers.cochin.flags.tributeWithheld;
      say(c, 'calicut', 'truce', 'Made a truce with Cochim.', {
        place: 'calecute',
        truth: { claim: 'The Zamorin has made a truce with Cochim, and the pepper is moving down the river again.', vague: 'The war at Cochim is over, they say.' },
        stale: { claim: 'The Zamorin’s army is at Cochim, and the pepper is not moving.', vague: 'There is war at Cochim.' },
      }, 6);
    }],
    ['war', !warOn(c) && !f.warCool ? 0.0045 * (1 + cochinFriend * 2) * (withheld ? 3 : 1) * (rel(c, 'calicut', 'cochin') <= -0.5 ? 1 : 0.3) : 0, () => {
      launch(c, {
        kind: 'war', power: 'calicut', ports: COCHIN_PORTS, dur: months(c.rng, 4, 9), closes: true, blight: 0.025,
        price: { pimenta: 1.25, gengibre: 1.15 }, stock: { pimenta: 0.6 },
        reason: 'The Zamorin’s army is in the field against Cochim, and the pepper does not come down to the quay.',
        said: 'Went to war with Cochim.', front: { id: 'crescent', delta: 0.05 }, note: 'The Zamorin has gone to war with Cochim.',
        rumour: {
          place: 'calecute',
          truth: { claim: 'The Zamorin has marched against Cochim, and the pepper is held up at the river while the army is in the field.', vague: 'There is war at Cochim.' },
          stale: { claim: 'Cochim pays its tribute and the pepper comes down on time.', vague: 'Cochim is quiet.' },
          falsehood: { claim: 'Cochim has fallen, and the Raja is a fugitive.', vague: 'Cochim is lost.' },
        },
      });
      f.warCool = true;
    }],
    ['shut', !active(c, 'calicut', 'embargo') && (a <= -0.3 || rule >= 3)
      ? 0.025 + Math.max(0, -a - 0.3) * 0.12 + (rule >= 3 ? 0.015 : 0) : 0, () => {
      launch(c, {
        kind: 'embargo', power: 'calicut', ports: CALICUT_PORTS, dur: months(c.rng, 6, 12), closes: true, duesMult: 1.15, blight: 0.02,
        reason: 'The Moorish houses have persuaded the Zamorin to turn the Portuguese away from the quay, and the lane is shut to them.',
        said: 'The Mappila houses had the Portuguese turned away.', kindName: 'embargo', front: { id: 'rule', delta: 0.1 },
        rumour: {
          place: 'calecute',
          truth: { claim: 'The Mappila houses have persuaded the Zamorin to forbid his people to trade with the Portuguese.', vague: 'Calecute has turned against the Portuguese.' },
          stale: { claim: 'The Zamorin’s quay is open to every ship that pays.', vague: 'Calecute trades as it always has.' },
          falsehood: { claim: 'The Zamorin has seized a Portuguese factor and put him in the stocks.', vague: 'A Portuguese has been taken at Calecute.' },
        },
      });
    }],
    ['welcome', a >= 0.3 && !active(c, 'calicut', 'welcome') && !active(c, 'calicut', 'embargo') ? 0.05 : 0, () => {
      launch(c, {
        kind: 'welcome', power: 'calicut', ports: CALICUT_PORTS, dur: months(c.rng, 10, 18), duesMult: 0.88, stock: { pimenta: 1.08 },
        reason: 'The Zamorin has given the Portuguese factor a house on the water and lightened the dues.',
        said: 'Gave the Portuguese factor a house.', kindName: 'welcome',
        rumour: {
          place: 'calecute',
          truth: { claim: 'The Zamorin has given the Portuguese factor a house on the water and lightened the dues.', vague: 'Calecute is friendly to the Portuguese.' },
          stale: { claim: 'The Mappila houses will not have a Portuguese factor in the town.', vague: 'Calecute keeps the Portuguese out.' },
        },
      });
    }],
    ['ask', !f.ask && a > -0.3 && rule >= 2 ? 0.02 : 0, () => {
      ask(c, 'calicut', 'pass', 8);
      say(c, 'calicut', 'ask', 'The Mappila houses asked the Portuguese for a letter for their ships.', {
        place: 'calecute',
        truth: { claim: 'The Mappila houses of Calecute are asking whether the Portuguese will write a letter for their ships.', vague: 'Calecute wants a Portuguese letter.' },
      }, 6);
    }],
  ]);
  if (!warOn(c) && f.warCool && c.rng.chance(0.15)) delete f.warCool;
  if (typeof f.askUntil === 'number' && c.t >= f.askUntil) clearAsk(c.st, 'calicut');
}

export function cochinTick(c: Ctx): void {
  const a = att(c, 'cochin');
  const p = c.st.powers.cochin;
  const f = p.flags;
  if (c.t >= p.intentUntil) {
    p.intentUntil = c.t + 24 * MONTH;
    p.intent = warOn(c) ? 'Hold the river and wait for a friend with guns.'
      : a >= 0.2 ? 'Stop paying the Zamorin, with the Portuguese behind the Raja.'
        : 'Pay no tribute to Calicut, if somebody will stand behind them.';
  }
  oneOf(c, [
    ['withhold', typeof f.tributeWithheld !== 'number' && a >= 0.1 && !warOn(c) ? 0.03 : 0, () => {
      f.tributeWithheld = c.t;
      say(c, 'cochin', 'withhold', 'Withheld the tribute due to Calicut.', {
        place: 'cochim',
        truth: { claim: 'The Raja of Cochim has not sent his tribute to the Zamorin this year.', vague: 'Cochim is behind with the Zamorin.' },
        stale: { claim: 'Cochim has paid the Zamorin as it always did.', vague: 'Cochim pays its tribute.' },
      }, 8, { id: 'crescent', delta: 0.05 });
    }],
    ['protector', !f.ask && a > -0.2 ? 0.04 : 0, () => {
      ask(c, 'cochin', 'protector', 9);
      say(c, 'cochin', 'ask', 'Asked the Portuguese to stand behind the Raja.', {
        place: 'cochim',
        truth: { claim: 'The Raja of Cochim is looking for a friend who will stand behind him against the Zamorin.', vague: 'Cochim wants a friend.' },
        falsehood: { claim: 'The Raja of Cochim has made his peace with the Zamorin and will take no foreigner.', vague: 'Cochim has made its peace.' },
      }, 8);
    }],
    ['welcome', a >= 0.25 && !active(c, 'cochin', 'welcome') && !warOn(c) ? 0.07 : 0, () => {
      launch(c, {
        kind: 'welcome', power: 'cochin', ports: [...COCHIN_PORTS, ...KOLATHIRI_PORTS], dur: months(c.rng, 10, 18), duesMult: 0.85, stock: { pimenta: 1.1 },
        reason: 'The Raja and the Kolathiri have given the Portuguese houses on their quays and lightened the dues.',
        said: 'Gave the Portuguese a house on the quay.', kindName: 'welcome',
        rumour: {
          place: 'cochim',
          truth: { claim: 'The Raja of Cochim and the Kolathiri have each given the Portuguese a house and a warehouse for pepper.', vague: 'Cochim and Cananor are friendly to the Portuguese.' },
          stale: { claim: 'Cochim is too frightened of the Zamorin to take a Portuguese factor.', vague: 'Cochim keeps its distance.' },
        },
      });
    }],
    ['succession', !active(c, 'cochin', 'succession') && (Number(f.fights) || 0) < 2 ? 0.004 : 0, () => {
      f.fights = (Number(f.fights) || 0) + 1;
      launch(c, {
        kind: 'succession', power: 'cochin', ports: COCHIN_PORTS, dur: months(c.rng, 4, 7), duesMult: 1.2, stock: { pimenta: 0.85 },
        reason: 'The court of Cochim is split over who is to be Raja, and the quay waits to see whose dues it will pay.',
        said: 'A fight over who is to be Raja.',
        rumour: {
          place: 'cochim',
          truth: { claim: 'Two men claim to be Raja of Cochim, and the Zamorin has an envoy at each door.', vague: 'There is trouble in the palace at Cochim.' },
          stale: { claim: 'The Raja of Cochim sits firm.', vague: 'Cochim’s court is quiet.' },
        },
      });
    }],
  ]);
  if (typeof f.askUntil === 'number' && c.t >= f.askUntil) clearAsk(c.st, 'cochin');
  if (typeof f.tributeWithheld === 'number' && c.t - f.tributeWithheld > 30 * MONTH) delete f.tributeWithheld;
}

export function gujaratTick(c: Ctx): void {
  const a = att(c, 'gujarat');
  const cres = stageOf(c, 'crescent');
  oneOf(c, [
    ['convoy', cres >= 3 && !active(c, 'gujarat', 'convoy') ? 0.04 : 0, () => {
      launch(c, {
        kind: 'convoy', power: 'gujarat', ports: GUJARAT_PORTS, dur: months(c.rng, 8, 14), duesMult: 1.05,
        price: { pimenta: 1.06 }, stock: { pimenta: 0.9 },
        reason: 'The ships of Gujarat sail in company this season, and what they carry goes to the Red Sea first.',
        said: 'Had the merchant ships sail in company.', kindName: 'convoy', front: { id: 'crescent', delta: 0.2 },
        rumour: {
          place: 'cambaia',
          truth: { claim: 'The merchants of Cambay are sending their ships out in company this season, with guns, and the Red Sea gets the pepper first.', vague: 'Cambay sails in convoy.' },
          stale: { claim: 'The Gujarati ships sail singly, as they always did.', vague: 'Cambay trades as it always has.' },
        },
      });
    }],
    ['shut', cres >= 3 && a <= -0.2 && !active(c, 'gujarat', 'embargo') ? 0.03 : 0, () => {
      launch(c, {
        kind: 'embargo', power: 'gujarat', ports: GUJARAT_PORTS, dur: months(c.rng, 8, 14), closes: true, blight: 0.02,
        reason: 'The sultan of Gujarat has forbidden his merchants to sell to the ships that came round the Cape.',
        said: 'Forbade his merchants to sell to the Portuguese.', kindName: 'embargo',
        rumour: {
          place: 'cambaia',
          truth: { claim: 'The sultan of Gujarat has forbidden his merchants to sell to the ships that came round the Cape.', vague: 'Cambay is shut to the Portuguese.' },
          stale: { claim: 'Cambay will sell cloth to anybody who pays in silver.', vague: 'Cambay is open.' },
          falsehood: { claim: 'Gujarat has sunk a Portuguese ship off Diu.', vague: 'A ship was lost off Diu.' },
        },
      });
    }],
    ['glut', !active(c, 'gujarat', 'push') ? 0.02 : 0, () => {
      launch(c, {
        kind: 'push', power: 'gujarat', ports: ['cambaia'], dur: months(c.rng, 4, 8), stock: { calico: 1.12, anil: 1.1 },
        reason: 'A good season for cloth and indigo at Cambay, and the warehouses are full.',
        said: 'A heavy season for cloth.', kindName: 'glut',
        rumour: { place: 'cambaia', truth: { claim: 'The warehouses at Cambay are full of cloth and indigo this season.', vague: 'Cambay has cloth to spare.' } },
      });
    }],
  ]);
}
