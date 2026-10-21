import { MONTH } from './core';
import { declareReader } from './modifiers';
import { active, ask, att, clearAsk, endAll, launch, months, oneOf, rel, say, stageOf, yearOf, type Ctx } from './moves';

/**
 * The Swahili coast: the rivalry of Kilwa, Mombaça and Melinde (BUILD_PLAN D4).
 *
 * Kilwa holds the gold road from Sofala and is proud of it; Mombaça is the strongest harbour and has been
 * at odds with Melinde for as long as anyone says; Melinde is smaller, frightened, and the friend of anybody
 * Mombaça hates. Each makes at most one move a month. The moves read the Power's attitude to the captain (the
 * Ledger), its relations to the others (seeded from `allies`/`feuds`), and the Rule's stage.
 *
 * The war of Mombaça on Melinde shuts the lane at both ends: Melinde is a trunk port, so the flagship is let in at
 * a toll; Mombaça is off the trunk and its market is shut while the war lasts. A truce reopens both.
 */

declareReader('moves.swahili');

export const MOMBASA_PORTS = ['mombaca'];
export const MELINDE_PORTS = ['melinde'];
export const KILWA_PORTS = ['quiloa'];

const warOn = (c: Ctx): boolean => active(c, 'mombasa', 'war');

function endWar(c: Ctx, who: 'mombasa' | 'melinde'): void {
  endAll(c, 'mombasa', 'war');
  const k = who === 'mombasa' ? 'Made a truce with Melinde.' : 'Sued for a truce, and had it.';
  say(c, who, 'truce', k, {
    place: who === 'mombasa' ? 'mombaca' : 'melinde',
    truth: { claim: 'Mombaça and Melinde have made a truce, and the harbours are open to each other’s boats again.', vague: 'The war between Mombaça and Melinde is over, they say.' },
    stale: { claim: 'Mombaça is at war with Melinde, and neither harbour is open to the other.', vague: 'There is war on the Swahili coast.' },
  }, 6);
}

export function mombasaTick(c: Ctx): void {
  const a = att(c, 'mombasa');
  const f = c.st.powers.mombasa.flags;
  const intent = c.st.powers.mombasa;
  if (c.t >= intent.intentUntil) {
    intent.intentUntil = c.t + 24 * MONTH;
    intent.intent = warOn(c) ? 'Break Melinde before the Portuguese make it too strong.'
      : a <= -0.3 ? 'Keep the Portuguese out of the harbour until the dues are paid in full.'
        : 'Keep the strongest harbour on the coast, and Melinde down.';
  }
  const melindeFriend = Math.max(0, att(c, 'melinde'));
  oneOf(c, [
    ['truce', warOn(c) ? 0.1 : 0, () => endWar(c, 'mombasa')],
    ['war', !warOn(c) && !active(c, 'mombasa', 'embargo') && !f.warCool
      ? 0.0042 * (1 + melindeFriend * 1.6) * (rel(c, 'mombasa', 'melinde') <= -0.5 ? 1 : 0.4) : 0, () => {
      const dur = months(c.rng, 4, 9);
      launch(c, {
        kind: 'war', power: 'mombasa', ports: [...MOMBASA_PORTS, ...MELINDE_PORTS], dur, closes: true, blight: 0.025,
        price: { ferramenta: 1.2, arroz: 1.2, panos: 1.1 },
        reason: 'Mombaça is at war with Melinde, and the boats of neither will land at the other’s quay.',
        said: 'Went to war with Melinde.', front: { id: 'crescent', delta: 0.05 },
        note: 'Mombaça has gone to war with Melinde.',
        rumour: {
          place: 'mombaca',
          truth: { claim: 'Mombaça has come out against Melinde with its boats, and the quays of both are shut to the other’s trade while it lasts.', vague: 'There is war between Mombaça and Melinde.' },
          stale: { claim: 'Mombaça and Melinde are quiet, and the dhows go between them as they always did.', vague: 'The coast is quiet.' },
          falsehood: { claim: 'Mombaça has taken Melinde, and the sultan is in chains.', vague: 'Melinde has fallen.' },
        },
      });
      f.warCool = true;
    }],
    ['grievance', !f.grievance && att(c, 'melinde') > 0.3 && a < 0.05 && !active(c, 'mombasa', 'embargo') ? 0.03 : 0, () => {
      f.grievance = c.t;
      const dur = months(c.rng, 6, 10);
      launch(c, {
        kind: 'embargo', power: 'mombasa', ports: MOMBASA_PORTS, dur, closes: true, blight: 0.02, duesMult: 1.2,
        reason: 'The sultan of Mombaça has shut his quay to the Portuguese until the favour shown to Melinde is answered.',
        said: 'Shut the quay to the Portuguese over the favour shown to Melinde.', kindName: 'embargo',
        rumour: {
          place: 'mombaca',
          truth: { claim: 'The sultan of Mombaça has forbidden his people to trade with the Portuguese, because of how Melinde was treated.', vague: 'Mombaça is cold to the Portuguese.' },
          stale: { claim: 'Mombaça sells to every ship that pays the dues.', vague: 'Mombaça trades as it always has.' },
          falsehood: { claim: 'Mombaça has taken a Portuguese ship in the roads and kept her cargo.', vague: 'A ship has been lost at Mombaça.' },
        },
      });
    }],
    ['raid', !warOn(c) ? 0.014 : 0, () => {
      const dur = months(c.rng, 2, 3);
      launch(c, {
        kind: 'stub', power: 'mombasa', ports: MELINDE_PORTS, dur, stock: { arroz: 0.75, panos: 0.85 }, blight: 0.01,
        reason: 'Boats out of Mombaça have burned the fishing fleet of Melinde, and the town is short of grain.',
        said: 'Raided the boats of Melinde.', kindName: 'raid',
        rumour: {
          place: 'melinde',
          truth: { claim: 'Mombaça’s boats have burned the fishing fleet of Melinde, and the town is short of grain.', vague: 'There was a raid on Melinde.' },
          falsehood: { claim: 'Melinde’s sultan has paid Mombaça to leave it alone.', vague: 'Melinde has paid.' },
        },
      });
    }],
    ['welcome', a >= 0.35 && !active(c, 'mombasa', 'welcome') && !warOn(c) ? 0.04 : 0, () => {
      launch(c, {
        kind: 'welcome', power: 'mombasa', ports: MOMBASA_PORTS, dur: months(c.rng, 10, 18), duesMult: 0.9,
        reason: 'Mombaça has opened its quay to the Portuguese on easier dues.',
        said: 'Opened the quay to the Portuguese.', kindName: 'welcome',
        rumour: {
          place: 'mombaca',
          truth: { claim: 'The sultan of Mombaça has cut the dues for Portuguese ships and given them a place on the quay.', vague: 'Mombaça is easier to the Portuguese.' },
          stale: { claim: 'Mombaça will not have a Portuguese ship in the roads.', vague: 'Mombaça is shut to the Portuguese.' },
        },
      });
    }],
  ]);
  if (!warOn(c) && f.warCool && c.rng.chance(0.15)) delete f.warCool;
}

export function melindeTick(c: Ctx): void {
  const a = att(c, 'melinde');
  const p = c.st.powers.melinde;
  const war = warOn(c);
  if (c.t >= p.intentUntil) {
    p.intentUntil = c.t + 24 * MONTH;
    p.intent = war ? 'Find a friend with guns against Mombaça, and soon.'
      : a >= 0.25 ? 'Keep the Portuguese as a friend against Mombaça, and see them settle in the roads.'
        : 'Find a friend against Mombaça.';
  }
  oneOf(c, [
    ['sues', war ? 0.07 : 0, () => endWar(c, 'melinde')],
    ['ask', war && !c.st.powers.melinde.flags.ask ? 0.2 : 0, () => {
      ask(c, 'melinde', 'ally', 6);
      say(c, 'melinde', 'ask', 'Asked every ship in the roads for powder and a friend against Mombaça.', {
        place: 'melinde',
        truth: { claim: 'The sultan of Melinde is asking every captain in the roads for powder and for a friend against Mombaça.', vague: 'Melinde wants a friend.' },
        falsehood: { claim: 'Melinde has sold its roads to the Portuguese for a promise of guns.', vague: 'Melinde has sold itself.' },
      }, 6);
    }],
    ['welcome', a >= 0.1 && !active(c, 'melinde', 'welcome') ? 0.05 : 0, () => {
      launch(c, {
        kind: 'welcome', power: 'melinde', ports: MELINDE_PORTS, dur: months(c.rng, 12, 20), duesMult: 0.9, stock: { pimenta: 1.0, arroz: 1.05 },
        reason: 'The sultan of Melinde has given the Portuguese a house on the quay and lightened their dues.',
        said: 'Welcomed the Portuguese factor, and gave him a house.', kindName: 'welcome',
        rumour: {
          place: 'melinde',
          truth: { claim: 'The sultan of Melinde has given the Portuguese a house on the quay and lightened their dues.', vague: 'Melinde is a friend to the Portuguese.' },
          stale: { claim: 'Melinde trades with the Portuguese as with anyone, and no better.', vague: 'Melinde is as it was.' },
        },
      });
    }],
    ['evict', a <= -0.4 && !active(c, 'melinde', 'embargo') ? 0.06 : 0, () => {
      launch(c, {
        kind: 'embargo', power: 'melinde', ports: MELINDE_PORTS, dur: months(c.rng, 5, 10), closes: true, duesMult: 1.15, blight: 0.015,
        reason: 'The sultan of Melinde has sent the Portuguese factor away, and the lane is shut to the Portuguese.',
        said: 'Sent the Portuguese factor away.', kindName: 'evict',
        rumour: {
          place: 'melinde',
          truth: { claim: 'The sultan of Melinde has sent the Portuguese factor away from the quay.', vague: 'Melinde has turned against the Portuguese.' },
          stale: { claim: 'Melinde is the best friend a Portuguese ship has on this coast.', vague: 'Melinde is a friend.' },
          falsehood: { claim: 'Melinde has made its peace with Mombaça on the Portuguese’s account.', vague: 'Melinde has changed sides.' },
        },
      });
    }],
  ]);
  if (!war) clearAsk(c.st, 'melinde');
}

export function kilwaTick(c: Ctx): void {
  const a = att(c, 'kilwa');
  const p = c.st.powers.kilwa;
  const rule = stageOf(c, 'rule');
  const f = p.flags;
  if (c.t >= p.intentUntil) {
    p.intentUntil = c.t + 24 * MONTH;
    p.intent = a <= -0.3 ? 'Keep the Portuguese out of the gold until they learn to ask.'
      : rule >= 3 ? 'Keep the gold moving north, letter or no letter.'
        : 'Keep the gold of Sofala flowing north on its own terms.';
  }
  oneOf(c, [
    ['evict', a <= -0.35 && !active(c, 'kilwa', 'embargo') ? 0.06 : 0, () => {
      launch(c, {
        kind: 'embargo', power: 'kilwa', ports: KILWA_PORTS, dur: months(c.rng, 6, 12), closes: true, duesMult: 1.15, blight: 0.02,
        reason: 'The sultan of Kilwa has sent the Portuguese factor away, and the gold is not shown to their ships.',
        said: 'Sent the Portuguese factor away.', kindName: 'evict',
        rumour: {
          place: 'quiloa',
          truth: { claim: 'The sultan of Kilwa has closed the quay to the Portuguese and shown the factor the road out.', vague: 'Kilwa is shut to the Portuguese.' },
          stale: { claim: 'Kilwa sells its gold to any ship that pays the dues.', vague: 'Kilwa trades as it always has.' },
          falsehood: { claim: 'Kilwa has burned a Portuguese boat in the harbour.', vague: 'There was a fire at Kilwa.' },
        },
      });
      f.factor = 'evicted';
    }],
    ['succession', yearOf(c.t) >= 1490 && !active(c, 'kilwa', 'succession') && (Number(f.fights) || 0) < 3 ? 0.006 : 0, () => {
      f.fights = (Number(f.fights) || 0) + 1;
      launch(c, {
        kind: 'succession', power: 'kilwa', ports: KILWA_PORTS, dur: months(c.rng, 4, 7), duesMult: 1.2, stock: { ouro: 0.85 },
        reason: 'The court of Kilwa is split over who sits on the stool, and the quay waits to see which man’s dues it will pay.',
        said: 'A fight over the stool.',
        rumour: {
          place: 'quiloa',
          truth: { claim: 'Two men claim the stool at Kilwa, and the vizier is not saying which he serves.', vague: 'There is trouble in the palace at Kilwa.' },
          stale: { claim: 'The sultan of Kilwa sits firm, and the court is quiet.', vague: 'Kilwa’s court is quiet.' },
        },
      });
    }],
    ['dry', !active(c, 'kilwa', 'stub') && !active(c, 'kilwa', 'embargo') ? 0.014 * (rule >= 3 ? 2 : 1) : 0, () => {
      launch(c, {
        kind: 'stub', power: 'kilwa', ports: KILWA_PORTS, dur: months(c.rng, 3, 5), stock: { ouro: 0.7 }, blight: 0.015,
        reason: 'The gold dhows from Sofala are late, and the counting house at Kilwa has little to weigh.',
        said: 'The Sofala dhows came in late.', kindName: 'dry',
        rumour: {
          place: 'quiloa',
          truth: { claim: 'The gold dhows from Sofala are late, and the counting house at Kilwa has little to weigh.', vague: 'Kilwa is short of gold.' },
          stale: { claim: 'The Sofala dhows have come in heavy, and Kilwa is full of gold.', vague: 'Kilwa is full of gold.' },
          falsehood: { claim: 'The gold has all gone to Sofala itself, and Kilwa sees none.', vague: 'Kilwa has lost the gold.' },
        },
      });
    }],
    ['ask', !p.flags.ask && a > -0.25 && rule >= 2 ? 0.02 : 0, () => {
      ask(c, 'kilwa', 'pass', 9);
      say(c, 'kilwa', 'ask', 'Asked the Portuguese for a letter for the gold dhows.', {
        place: 'quiloa',
        truth: { claim: 'Kilwa’s merchants are asking whether the Portuguese will write a letter for their gold dhows.', vague: 'Kilwa wants a letter from the Portuguese.' },
      }, 6);
    }],
    ['welcome', a >= 0.3 && !active(c, 'kilwa', 'welcome') && !active(c, 'kilwa', 'embargo') ? 0.05 : 0, () => {
      launch(c, {
        kind: 'welcome', power: 'kilwa', ports: KILWA_PORTS, dur: months(c.rng, 10, 18), duesMult: 0.88, stock: { ouro: 1.05 },
        reason: 'The sultan of Kilwa has given the Portuguese a house on the quay, and the gold is shown to them first.',
        said: 'Welcomed the Portuguese factor.', kindName: 'welcome',
        rumour: {
          place: 'quiloa',
          truth: { claim: 'The sultan of Kilwa has given the Portuguese a house on the quay and shows them the gold.', vague: 'Kilwa is friendly to the Portuguese.' },
          stale: { claim: 'Kilwa keeps the Portuguese at the water’s edge.', vague: 'Kilwa keeps its distance.' },
        },
      });
      f.factor = 'welcomed';
    }],
  ]);
  if (p.flags.ask && typeof p.flags.askUntil === 'number' && c.t >= p.flags.askUntil) clearAsk(c.st, 'kilwa');
}
