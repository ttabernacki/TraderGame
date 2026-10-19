import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import type { SeaChoice, SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';
import { aboardTons, parcelsAboard, survivors, takeParcel } from '../world/powers/traffic';
import { announce } from '../world/powers/rumours';
import type { Parcel, PowersState } from '../world/powers/types';

/**
 * The Traffic on the road: Arguim, Mina, Mpinda (BUILD_PLAN C2, stage 1).
 *
 * Twelve short scenes, offered by the state of the Front and of the Ledger, not by a thread's step. They use the
 * existing scene machinery (a `SeaEvent`, answered at the quay, its choices writing the Ledger) and none of
 * a storylet engine: each says where it may be had, at which stages, and what must already have happened.
 *
 * The voice is the ship's, after the fact. Names and counts, in the order a clerk would write them; no
 * spectacle, no euphemism in the narrator's mouth (the clerk's word, "pieces", is the clerk's), and nobody on
 * any side who is only a victim or only a villain: the sellers on the Saharan edge and the buyers on the Mina
 * beach have their reasons and their prices; the Kongo court is divided; the factor has a ship that sails on
 * the tide. The captain is inside something larger than himself, and chooses what part of it to have been.
 *
 * ROAD ORDER. Every scene is at Arguim, Mina or Mpinda, in that order along the road, and each scene's
 * `after` lists only scenes at the same port or earlier ones; a parcel taken at Arguim is landed at Mina or,
 * if the ship went on, at Mpinda. Nothing asks for a return. `scripts/powers.ts` checks this with
 * `road.ts: along()`.
 *
 * SOURCES AND WHAT IS INVENTED: see docs/SOURCES.md, "The Powers and the Traffic (C2)". In short, the practice
 * (people bought on the Saharan edge and the Guinea coast, carried to Mina and sold there for gold; the Kongo
 * court's elders and traders; São Tomé's cane) is documented; every NAME below, every count, price and
 * the Mpinda register are the game's own.
 */

export interface TrafficScene {
  id: string;
  ports: string[];
  /** Offered only from this stage to this stage. */
  stages?: [number, number];
  /** Scenes of this list that must have been had first. */
  after?: string[];
  /** Offered again after this many days if not settled (default: once). */
  repeatDays?: number;
  needs: (g: Game, st: PowersState) => boolean;
  build: (g: Game, st: PowersState) => SeaEvent;
}

const DAY = 86400;
const sid = (id: string): string => `traffic:${id}`;

function scene(id: string, title: string, text: string, choices: SeaChoice[], severity: SeaEvent['severity'] = 'note'): SeaEvent {
  return { id: sid(id), title, text, severity, choices, council: false };
}

const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'];
const word = (n: number): string => NUMBERS[n] ?? String(n);

/** Mark a scene answered: it is had, and may not be put again unless it says so. */
function had(g: Game, id: string): void {
  const st = g.powers;
  st.seen[id] = g.clock.t;
  delete st.seen[`fired:${id}`];
}

/** Leave a scene to be put again after its wait. */
function again(g: Game, id: string, line: string): string {
  delete g.powers.seen[`fired:${id}`];
  g.powers.seen[`later:${id}`] = g.clock.t;
  return line;
}

const regardAt = (g: Game, port: string, d: number): void => {
  const r = g.relationsFor(port);
  r.regard = clamp(r.regard + d, -1, 1);
};
const casaRegard = (g: Game, d: number): void => { g.casa.regard = clamp(g.casa.regard + d, -1, 1); };
const hasLingua = (g: Game): boolean => g.crew.officers.some((o) => o.alive && !o.ashoreAt && o.role === 'lingua');
const spend = (g: Game, n: number): boolean => { if (g.crown.gold < n) return false; g.crown.gold -= n; return true; };

// Names of the eleven in the cistern yard. INVENTED (Senegambian given names of the kind recorded; no real person).
const NAMES = ['Samba', 'Demba', 'Awa', 'Binta', 'Fatou', 'Kemo', 'Mamadou', 'Aminata', 'Sira', 'Lamin', 'Coumba', 'Ablaye', 'Dado', 'Yaya'];

function stageOf(st: PowersState): number { return st.fronts.traffic.stage; }
const carried = (st: PowersState): number => st.fronts.traffic.pulled.push;
const refused = (st: PowersState): number => st.fronts.traffic.pulled.brake;

// ---------------------------------------------------------------------------------------------
// Arguim

const arguimBook: TrafficScene = {
  id: 'arguim-book', ports: ['arguim'],
  needs: () => true,
  build: (_g, st) => {
    const n = [41, 90, 160, 230][stageOf(st) - 1];
    const price = 30;
    return scene('arguim-book', 'The factor’s book',
      'The factor at Arguim has two columns in his book, and he shows them to you without being asked, because he is proud of the hand. '
      + 'On the left, what comes in: wheat, cloth, horses. On the right, what goes out, by the year: gum, gold dust, hides, and a line the clerk has headed '
      + `"peças", pieces. He writes it as he writes quintals of gum. This year's count is ${n}.\n\n`
      + 'The broker at his elbow is Ahmad ibn Yahya, who sells the right-hand column to the left-hand one. His family has done it across the sand since before there was a fort. '
      + 'He is not ashamed of it and he is nobody’s fool: he points out that the Portuguese pay in horses and wheat, which the caravans do not, and that he has a buyer at Tuat if the factor’s price is poor.\n\n'
      + 'In the shade by the cistern a man and two women sit who have not come to sell. A girl of fourteen, Khadija, was taken from their camp in the spring by men of another band and sold on to the broker’s cousin. '
      + `They have walked three days with a camel and as much gold dust as the family owns. The factor says she is booked, and booked means sold. The broker says her price is ${price + 25} cruzados. They have ${price - 5}'s worth.`,
      [
        {
          label: `Make up the difference, and let the family take her home (${price - 5} cruzados)`,
          detail: 'She goes with them. It does not touch the book; the book has a hundred others.',
          resolve: (gg) => {
            if (!spend(gg, price - 5)) return again(gg, 'arguim-book', 'You have not got it. The family sits in the shade a while longer, and the factor says the price will stand until the ship sails.');
            had(gg, 'arguim-book');
            gg.noteDeed('person.redeemed', {
              target: 'arguim', place: 'arguim', actors: ['captain', 'Khadija'], magnitude: 0.5,
              note: `Khadija, fourteen, taken from a camp three days inland; her family brought what they had and I made up ${price - 5} cruzados. They went back across the sand together.`,
            });
            return 'The family counted out their dust twice before they believed the sum. The girl did not look at you; she looked at her mother. They left before the heat of the day, and the clerk struck one line out of the right-hand column and wrote the next.';
          },
        },
        {
          label: 'Ask the factor to weigh the price fairly, and leave the family to bargain',
          detail: 'Nothing from you but a word. The broker is not moved by words.',
          resolve: (gg) => {
            had(gg, 'arguim-book');
            return 'The factor shrugs and the broker names the same price in a different tone. The family sit on. You do not learn what became of the girl.';
          },
        },
        {
          label: 'Read the book, and say nothing',
          detail: 'It is the factor’s book and the broker’s trade.',
          resolve: (gg) => { had(gg, 'arguim-book'); return 'You read the right-hand column to the end. The hand is a good one.'; },
        },
      ]);
  },
};

const arguimParcel: TrafficScene = {
  id: 'arguim-parcel', ports: ['arguim'], after: ['arguim-book'], repeatDays: 200,
  needs: (g, st) => parcelsAboard(st).length === 0 && g.ship.holdFree >= 2.5,
  build: (g) => {
    const day = Math.floor(g.clock.t / DAY);
    const n = Math.min(14, 8 + (day % 7));
    const rng = Rng.fromString(`arguim-parcel:${g.seed}:${day}`);
    const names = rng.shuffle([...NAMES]).slice(0, n);
    const men = Math.round(n * 0.4), women = Math.round(n * 0.45), kids = n - men - women;
    const each = 9;
    const room = Math.floor(g.ship.holdFree / 0.25);
    const take = Math.min(n, room);
    return scene('arguim-parcel', 'Eleven for the Castle'.replace('Eleven', word(take)[0].toUpperCase() + word(take).slice(1)),
      `The factor has ${word(n)} bought on the coast to windward, in the yard behind the cistern for nine days: ${count(men, 'man', 'men')}, ${count(women, 'woman', 'women')}, ${count(kids, 'child', 'children')}. `
      + 'His own ship is six weeks late and he cannot count on her. Mina pays in gold, and the Castle’s factor will pay the freight, '
      + `${each} cruzados a head, on the day they are landed. That is ${each * take} cruzados. He says it the way he says the price of wheat.\n\n`
      + `The clerk has their names in the cistern book. ${names.slice(0, 5).join(', ')}, and ${names.length - 5} more. Nobody has told them what they are going south for. `
      + 'The broker’s boy has told them they are going to the gold.'
      + (take < n ? `\n\nYou have room for ${word(take)}.` : ''),
      [
        {
          label: `Carry them to Mina (${each * take} cruzados on landing)`,
          detail: `${count(take, 'person', 'people')} aboard, ${(take * 0.25).toFixed(1)} tons of the hold. They are fed from your stores.`,
          resolve: (gg) => {
            const p = takeParcel(gg.powers, { from: 'arguim', to: 'mina', n: take, freight: each, by: 'the factor at Arguim', t: gg.clock.t });
            p.names = names.slice(0, take);
            gg.ship.passengerTons = aboardTons(gg.powers);
            had(gg, 'arguim-parcel');
            gg.noteDeed('traffic.carried', {
              target: 'arguim', place: 'arguim', magnitude: 0.5,
              note: `Took ${word(take)} aboard at Arguim for the Castle at Mina: ${count(Math.round(take * 0.4), 'man', 'men')}, ${count(Math.round(take * 0.45), 'woman', 'women')}, ${count(take - Math.round(take * 0.4) - Math.round(take * 0.45), 'child', 'children')}. Freight ${each * take} cruzados, to be paid on landing.`,
            });
            gg.logEvent('trade', `${count(take, 'person', 'people')} came down the ladder and were put below. The pilot wrote them in the ship’s book as a number.`);
            return `${count(take, 'person', 'people')} came down the ladder, one at a time. The factor’s clerk read each name aloud and the boatswain wrote a number beside it.`;
          },
        },
        {
          label: 'Refuse, and say why',
          detail: 'You lose the freight and the berth he kept for you. He will find another ship.',
          resolve: (gg) => {
            had(gg, 'arguim-parcel');
            regardAt(gg, 'arguim', -0.06);
            gg.noteDeed('traffic.refused', {
              target: 'arguim', place: 'arguim', magnitude: 0.4,
              note: `The factor at Arguim asked me to take ${word(take)} to Mina for freight; I said no. He has put them down for another ship.`,
            });
            return 'The factor says that is a pity, and he means it as a remark about cash. He closes the book. In the yard behind the cistern nobody looks up.';
          },
        },
      ]);
  },
};

const arguimQuota: TrafficScene = {
  id: 'arguim-quota', ports: ['arguim'], stages: [3, 4], after: ['arguim-book'],
  needs: () => true,
  build: (_g, st) => {
    const n = 12;
    return scene('arguim-quota', 'A number in the licence',
      'The factor has a letter from the Casa, and it is not addressed to him but he reads it to you in full. Every ship licensed for the Mina road is to take on the coast '
      + `a number the factor shall name, for the plantations of São Tomé, at the freight the Casa sets. This year's number for a ship of yours is ${n}. `
      + 'Those who cannot take their number may compound for it. The compounding is ninety cruzados.\n\n'
      + `The factor does not seem to like it either. He says what everyone says: the cane wants hands, and the Crown wants the cane. ${carried(st) > 0 ? `He has you down as a man who has taken them before.` : 'He has you down as a man who has not.'}`,
      [
        {
          label: `Take the ${word(n)} to Mina`,
          detail: 'The Casa’s freight. They go on to São Tomé from there, on somebody’s ship.',
          resolve: (gg) => {
            if (gg.ship.holdFree < n * 0.25) return again(gg, 'arguim-quota', `You have not the room for ${word(n)}. The factor says he will put it to the Casa that your hold is small.`);
            const rng = Rng.fromString(`quota:${gg.seed}:${gg.clock.t}`);
            const p = takeParcel(gg.powers, { from: 'arguim', to: 'mina', n, freight: 8, by: 'the Casa’s quota, through the factor', t: gg.clock.t });
            p.names = rng.shuffle([...NAMES]).slice(0, n);
            gg.ship.passengerTons = aboardTons(gg.powers);
            had(gg, 'arguim-quota');
            gg.noteDeed('traffic.carried', { target: 'arguim', place: 'arguim', magnitude: 0.6, note: `Took ${word(n)} aboard at Arguim against the Casa’s quota for the Mina road.` });
            return `${word(n)} came aboard against the number in the licence. The clerk wrote the Casa’s reference beside each.`;
          },
        },
        {
          label: 'Compound for the number (90 cruzados)',
          detail: 'It is a fine, and it is cheaper than the freight you would have earned. The Casa will take the money.',
          resolve: (gg) => {
            if (!spend(gg, 90)) return again(gg, 'arguim-quota', 'You have not got ninety cruzados. The factor says the number will wait for you.');
            had(gg, 'arguim-quota');
            gg.noteDeed('traffic.refused', { target: 'arguim', place: 'arguim', magnitude: 0.5, note: 'Paid ninety cruzados at Arguim to be let off the Casa’s number for the Mina road.' });
            return 'The factor writes the composition into the book in the same hand as the rest. Somebody else’s ship will carry your number.';
          },
        },
        {
          label: 'Say you will answer the Casa at the Castle',
          detail: 'You carry nothing now. At Mina the Captain of the Castle hears petitions on Thursdays.',
          resolve: (gg) => {
            had(gg, 'arguim-quota');
            gg.powers.seen['quotaProtest'] = gg.clock.t;
            casaRegard(gg, -0.03);
            return 'The factor says he will write that you have not answered. He writes it.';
          },
        },
      ]);
  },
};

// ---------------------------------------------------------------------------------------------
// Mina

/** The parcels aboard are landed at Mina; if the ship has run on past it, at Mpinda, where the factor will take a receipt. */
const landing: TrafficScene = {
  id: 'landing', ports: ['mina', 'mpinda'], repeatDays: 1,
  needs: (_g, st) => parcelsAboard(st).length > 0,
  build: (g, st) => {
    const p = parcelsAboard(st)[0];
    const days = (g.clock.t - p.taken) / DAY;
    const alive = survivors(g.seed, p, days);
    const lost = p.n - alive;
    const here = g.dockedAt ?? 'mina';
    const atMina = here === p.to;
    const dead = p.names ? p.names.slice(p.names.length - lost) : [];
    const owed = atMina ? alive * p.freight : 0;
    const binta = p.names?.slice(0, alive).includes('Binta') ? 'Binta' : p.names?.[0];
    const sold = Math.max(0, alive - Math.ceil(alive * 0.3));
    return scene('landing', atMina ? 'The beach at Mina' : 'Not the beach they were bound for',
      `${word(p.n)[0].toUpperCase() + word(p.n).slice(1)} were taken aboard at ${p.from === 'arguim' ? 'Arguim' : p.from} on the ${Math.round(days)}th day back. `
      + (lost === 0 ? `${word(alive)[0].toUpperCase() + word(alive).slice(1)} are landed.` : `${word(alive)[0].toUpperCase() + word(alive).slice(1)} are landed. ${lost === 1 ? 'One' : word(lost)[0].toUpperCase() + word(lost).slice(1)} died on the passage${dead.length ? `: ${dead.join(', ')}` : ''}. The boatswain read what he knew over each of them, and the pilot said the rest, because nobody aboard had their words.`)
      + '\n\n'
      + (atMina
        ? `The Castle’s factor weighs the freight against the tally. ${word(sold)} are taken up the beach by Akan traders, who pay in gold by their own scales and check the factor’s weights twice; the rest stay with the Castle. `
          + `He pays ${owed} cruzados. Nobody on the beach looks surprised by any of it.`
        : 'The buyers at Mina will not wait for a ship that went on past them. The factor at Mpinda will give you a receipt for them and no freight: he has his own count to keep.')
      + (alive > 0 && binta ? `\n\nOne of them, ${binta}, has said — through the broker’s boy, who came with you, or through the Castle’s interpreter — that she would like her name written correctly.` : ''),
      [
        {
          label: 'Ask the clerk to write the names in the book, all of them, and the dead',
          detail: 'It costs nothing and nobody asked it. It is the count the Casa will see.',
          resolve: (gg) => {
            const q = settleParcel(gg, p, alive, lost, dead, owed, atMina);
            gg.noteDeed('books.honest', { target: 'mina', place: here, magnitude: 0.4, note: `Had every name written in the ship’s book at landing: ${alive} landed, ${lost} dead.` });
            return q;
          },
        },
        ...(alive > 0 && atMina ? [{
          label: `Redeem ${binta} (100 cruzados), and let her say where she goes`,
          detail: 'She is free at Mina with a paper and ten cruzados of wages. It changes nothing for the others.',
          resolve: (gg: Game) => {
            if (!spend(gg, 100)) { return 'You have not got it. The clerk says her price will stand until the Castle’s next ship sails, and no longer.'; }
            const q = settleParcel(gg, p, alive, lost, dead, owed, atMina);
            gg.noteDeed('person.redeemed', {
              target: 'mina', place: here, actors: ['captain', binta ?? 'one of them'], magnitude: 0.6,
              note: `${binta}, landed at Mina; I paid the Castle’s factor 100 cruzados for her. She asked for passage windward on the next ship and had the clerk write her name as she said it.`,
            });
            return `${q} ${binta} took the paper and read none of it; she asked the clerk to write her name again.`;
          },
        } satisfies SeaChoice] : []),
        {
          label: atMina ? 'Take the freight and go' : 'Take the receipt and go',
          detail: 'They are the buyers’ now, and the factor’s book is the factor’s.',
          resolve: (gg) => settleParcel(gg, p, alive, lost, dead, owed, atMina),
        },
      ]);
  },
};

/** The parcel is landed: freight paid, the dead entered in the muster, the hold freed. */
function settleParcel(g: Game, p: Parcel, alive: number, lost: number, dead: string[], owed: number, paid: boolean): string {
  p.alive = alive;
  p.status = 'landed';
  p.dead = dead;
  g.ship.passengerTons = aboardTons(g.powers);
  g.crown.gold += owed;
  delete g.powers.seen['fired:landing'];
  g.powers.seen['landing'] = g.clock.t;
  if (lost > 0) {
    g.noteDeed('passenger.died', {
      target: p.to, place: g.dockedAt ?? p.to, actors: dead.length ? ['captain', ...dead] : ['captain'], magnitude: lost,
      note: `${lost} of those carried from ${p.from} died on the passage${dead.length ? `: ${dead.join(', ')}` : ''}.`,
    });
  }
  g.logEvent('trade', `${word(alive)} landed at ${g.dockedAt ?? p.to}; ${lost === 0 ? 'none lost' : `${word(lost)} lost on the passage`}.${paid ? ` Freight ${owed} cruzados.` : ' No freight.'}`);
  return paid ? `The Castle’s factor counted ${owed} cruzados into your hand, and the clerk crossed the number out of the ship’s book.` : 'The factor wrote the receipt and took the count.';
}

const minaBuyers: TrafficScene = {
  id: 'mina-buyers', ports: ['mina'], stages: [2, 4],
  needs: () => true,
  build: (_g, st) => scene('mina-buyers', 'Who buys',
    'Kwesi, who deals in gold for a house in Eguafo’s country, comes down the beach to meet your boat. He is polite and a little amused. '
    + 'He buys people from the Castle’s factor because the pits behind the town flood every wet season, and the men who work them do not live long, and he says this plainly, as a man speaking of a cost. '
    + 'He does not buy from the factor because he likes the factor. He buys because the factor’s price is lower than the interlopers’, and he says that twice. '
    + 'He will tell the factor today that the Castle’s weights are light, and the factor will listen, because Kwesi’s house sells him his gold.\n\n'
    + (stageOf(st) >= 3 ? 'He says that the price has gone up since the Castle began to send the others on to São Tomé; there are fewer to buy at Mina, and he does not like that either. ' : '')
    + 'He asks whether you have been to Benin.',
    [
      {
        label: 'Ask him what the Oba of Benin charges these days',
        detail: 'Kwesi will tell you, and you will have it from him and nobody else.',
        resolve: (gg) => {
          had(gg, 'mina-buyers');
          const rng = Rng.fromString(`kwesi:${gg.seed}:${Math.floor(gg.clock.t / DAY)}`);
          announce(gg.powers, rng, gg.clock.t, {
            event: 'scene:mina-buyers', place: 'ugoton', power: 'benin', window: 18,
            truth: { claim: 'The Oba sets the price at Ugoton himself, through his own officers, and strangers do not go up the river to bargain.', vague: 'Benin’s price is the Oba’s, and the Oba keeps strangers at the water’s edge.' },
          });
          // He told it to you himself: it is the first thing you have heard of it, and he said it to your face.
          for (const r of gg.powers.rumours.filter((x) => x.event === 'scene:mina-buyers')) {
            r.truth = 'true';
            r.heard = { t: gg.clock.t, port: 'mina', hops: 0 };
            r.teller = 'Kwesi, a gold buyer at Mina';
          }
          return 'Kwesi tells you in four sentences, and does not hurry. The Oba sets the price; the Oba’s officers collect it; the Oba does not let strangers go up to the city. He says that is why Benin is the only market on the coast where he has never been cheated.';
        },
      },
      {
        label: 'Weigh the gold on his scales, and agree the weights before the factor',
        detail: 'You lose a little on the margin. The beach will remember it.',
        resolve: (gg) => {
          had(gg, 'mina-buyers');
          gg.noteDeed('weights.fair', { target: 'eguafo', place: 'mina', magnitude: 0.5, note: 'Agreed the weights with an Akan buyer in front of the factor, on his scales, when the Castle’s were light.' });
          return 'Kwesi laughs, once, and puts his own weights beside the Castle’s. The factor does not enjoy it. By evening the beach has the story.';
        },
      },
      {
        label: 'Say you have no opinion of Benin',
        detail: 'He shrugs.',
        resolve: (gg) => { had(gg, 'mina-buyers'); return 'Kwesi inclines his head and goes back up the beach to his scales.'; },
      },
    ]),
};

const minaHearing: TrafficScene = {
  id: 'mina-hearing', ports: ['mina'], stages: [2, 4], after: ['mina-buyers'],
  needs: (_g, st) => carried(st) + refused(st) > 0 || st.seen['quotaProtest'] !== undefined || st.seen['landing'] !== undefined,
  build: (_g, st) => scene('mina-hearing', 'Thursday in the yard',
    'The Captain of the Castle hears petitions on Thursdays in the yard under the flag. This week a woman has walked in from a village near Axim with the Castle’s interpreter, a patient man called Pêro who is paid for it. '
    + 'Her brother Kojo, a fisherman, was pawned for a debt by their uncle. She says he was never the uncle’s to pawn, and the creditor sold the pawn on to a factor for the list that goes north. '
    + 'The Captain says that the book is the book. He looks around the yard for somebody who might say otherwise, and finds that you are the only captain present whose name the Casa knows.'
    + (st.seen['quotaProtest'] !== undefined ? ' He adds that he has had a letter from the factor at Arguim about a captain who would answer the Casa at the Castle.' : ''),
    [
      {
        label: 'Speak for her: say the pawn was never lawful, and ask for it to be entered',
        detail: 'A contested hearing. It costs the Casa’s regard and it will almost certainly be refused. It is also on the record, in your name.',
        resolve: (gg) => {
          had(gg, 'mina-hearing');
          casaRegard(gg, -0.10);
          gg.noteDeed('hearing.contested', {
            target: 'mina', place: 'mina', magnitude: 0.7,
            note: 'Spoke at the Captain of the Castle’s hearing for a woman whose brother had been pawned unlawfully; asked that it be entered. It was heard, and entered, and not granted.',
          });
          return 'The Captain says he thanks you for your opinion and that the book will be amended when somebody shows him a law that says so. The clerk writes down what you said. The woman has it copied in her own hand by the interpreter, and goes home with it.';
        },
      },
      {
        label: 'Pay the creditor’s price for Kojo (70 cruzados)',
        detail: 'One man goes home. The Front does not notice.',
        resolve: (gg) => {
          if (!spend(gg, 70)) return again(gg, 'mina-hearing', 'You have not got it. The Captain says the price will stand for a week.');
          had(gg, 'mina-hearing');
          gg.noteDeed('person.redeemed', {
            target: 'axim', place: 'mina', actors: ['captain', 'Kojo'], magnitude: 0.6,
            note: 'Kojo, a fisherman of a village near Axim, pawned by an uncle for a debt; I paid the creditor 70 cruzados and he went home.',
          });
          return 'Kojo goes home to Axim. His sister does not thank you. She asks you to find the uncle, and you tell her you are bound south.';
        },
      },
      {
        label: 'Stay out of it',
        detail: 'It is the Captain’s yard.',
        resolve: (gg) => { had(gg, 'mina-hearing'); return 'You have the manners of a man with a cargo to sell. The Captain nods, and calls the next petition.'; },
      },
    ]),
};

// ---------------------------------------------------------------------------------------------
// Mpinda

const mpindaElders: TrafficScene = {
  id: 'mpinda-elders', ports: ['mpinda'], stages: [2, 4],
  needs: () => true,
  build: (_g, st) => scene('mpinda-elders', 'Elders and traders',
    'The Mani Soyo’s council meets under a tree above the landing at Mpinda, and he has asked you to sit at the edge of it. '
    + 'Nsaku, an elder of the king’s household, says that the king alone may dispose of those taken in war and of those condemned, and that no free person of Kongo may be sold. '
    + 'He says it in the voice of a man reading a law, and he is. The trader beside him, Mavungu, says that the Portuguese will buy from somebody, and that the king’s right is a right to a share. '
    + 'He does not look at the elder. The Portuguese factor, Gonçalo Anes, stands between them and is not asked.\n\n'
    + (stageOf(st) >= 3 ? 'There are more traders on the beach than there were, and the elders sit closer together. ' : '')
    + 'Nsaku asks what the captain of a ship from the King of Portugal thinks of a count.',
    [
      {
        label: 'Say the elders’ law is a good one, and that your ship will honour a count',
        detail: 'Nsaku will give you the elders’ seal to show at the landing. The traders will remember it.',
        resolve: (gg) => {
          had(gg, 'mpinda-elders');
          gg.powers.local.seal = true;
          gg.powers.powers.kongo.balance = clamp((gg.powers.powers.kongo.balance ?? 0) - 0.15, -1, 1);
          gg.adjustPolity('kongo', { trust: 0.05 }, 'sat with the elders');
          gg.noteDeed('mark.for', { target: 'kongo', place: 'mpinda', magnitude: 0.4, note: 'Told the Mani Soyo’s council that a ship of mine would honour a count of those who go down to the boats.' });
          return 'Nsaku writes nothing down; he has the law by heart. He gives you a short staff of dark wood with the Mani Soyo’s mark cut into it, and says that it is to be shown to the officer at the landing, and to nobody else.';
        },
      },
      {
        label: 'Say what the traders sell is their business',
        detail: 'The traders will remember it, and so will the elders.',
        resolve: (gg) => {
          had(gg, 'mpinda-elders');
          gg.powers.powers.kongo.balance = clamp((gg.powers.powers.kongo.balance ?? 0) + 0.15, -1, 1);
          return 'Mavungu inclines his head. Nsaku looks at the tree. The council moves on to a boundary dispute about a fish weir.';
        },
      },
      {
        label: 'Say it is not for a visitor to judge',
        detail: 'Nothing changes.',
        resolve: (gg) => { had(gg, 'mpinda-elders'); return 'Nsaku says that is what visitors say. He says it without heat.'; },
      },
    ]),
};

const mpindaRegister: TrafficScene = {
  id: 'mpinda-register', ports: ['mpinda'], stages: [2, 4], after: ['mpinda-elders'], repeatDays: 20,
  needs: (_g, st) => st.local.state === 'unmet' || st.local.state === 'offered',
  build: (g, st) => {
    st.local.state = 'offered';
    const seal = !!st.local.seal;
    const trust = hasLingua(g) || (g.diplomacy.polities.kongo?.trust ?? 0) >= 0.2;
    return scene('mpinda-register', 'A count at the landing',
      'A ship is loading at the landing: thirty-four people walking down to the boats in a line. The Mani Soyo’s officer, with a staff like the one Nsaku’s hands cut, has been told by his council to count each of them, '
      + 'to ask where each is from, and to stop any who is free-born. The factor, Gonçalo Anes, says the Casa’s licence does not mention an officer, and that his ship sails on the tide. '
      + 'The officer has no ships and no guns; he has a staff and a law and a line of boats that will not wait. Gonçalo Anes looks at you, because your licence is the same as his and your standing with the Casa is better.\n\n'
      + `To stand beside the officer you will need the elders’ seal (${seal ? 'you have it' : 'you have not got it'}), the officer’s trust (${trust ? 'he will speak to you: you have an interpreter, or the court’s regard' : 'he does not know you, and you have no interpreter or standing here'}), and two hundred cruzados, `
      + 'which is the officer’s due and the factor’s tide. It will cost you the factor’s goodwill and the Casa’s. It can be done once.',
      [
        {
          label: 'Stand beside the officer, and say your own ship will load nothing the count has not passed (200 cruzados)',
          detail: 'The one winnable fight on this road. It needs the seal, the officer’s trust and the money, and it changes what is done at Mpinda.',
          resolve: (gg) => {
            const s = gg.powers;
            if (!s.local.seal) return again(gg, 'mpinda-register', 'The officer looks at your hands for the seal and does not find one. He says it would be better if the elders had spoken for you first, and he turns back to the line.');
            if (!(hasLingua(gg) || (gg.diplomacy.polities.kongo?.trust ?? 0) >= 0.2)) return again(gg, 'mpinda-register', 'The officer does not know you and cannot understand you, and he will not stand beside a man he cannot ask a question of. Bring somebody who speaks his language, or earn the court’s regard first.');
            if (!spend(gg, 200)) return again(gg, 'mpinda-register', 'You have not got two hundred cruzados. The officer says the tide will not wait, and neither will the next ship.');
            s.local = { ...s.local, state: 'won', at: gg.clock.t };
            had(gg, 'mpinda-register');
            casaRegard(gg, -0.08);
            regardAt(gg, 'mpinda', -0.1);
            gg.noteDeed('practice.changed', {
              target: 'mpinda', place: 'mpinda', magnitude: 0.8,
              note: 'Stood beside the Mani Soyo’s officer at the landing at Mpinda and refused to load anything the count had not passed. It cost 200 cruzados, the factor’s goodwill and the Casa’s.',
            });
            s.powers.kongo.balance = clamp((s.powers.kongo.balance ?? 0) - 0.3, -1, 1);
            s.powers.kongo.flags.register = 'kept';
            // The register is a standing thing at Mpinda for eight years: it is in the Book, and Kongo's own curb cannot be redone over it.
            s.effects.push({
              id: s.nextId++, kind: 'register', power: 'kongo', ports: ['mpinda'], start: gg.clock.t, end: gg.clock.t + 8 * 365 * DAY,
              reason: 'The Mani Soyo’s officer counts everyone who goes to the boats at Mpinda, as he has since you stood beside him at the landing.',
            });
            return 'Gonçalo Anes says a number of things about the Casa. The officer counts. Thirty-four go down the line, and thirty-one are written down with where they are from, and three are stopped at the water’s edge and walked back up the beach by men with staves. The ship sails an hour after the tide.';
          },
        },
        {
          label: 'Tell the factor you will report it to the Casa',
          detail: 'It costs a little standing. Nothing changes at the landing.',
          resolve: (gg) => {
            casaRegard(gg, -0.03);
            return again(gg, 'mpinda-register', 'The factor says he will report it first. The line goes down to the boats. The officer writes what he can.');
          },
        },
        {
          label: 'Let it go',
          detail: 'It is a Kongo matter and a Portuguese factor. You will not have this chance again.',
          resolve: (gg) => {
            gg.powers.local.state = 'lost';
            had(gg, 'mpinda-register');
            return 'The ship sails on the tide. The officer’s count is read aloud to nobody, and he walks up the beach with the staff over his shoulder.';
          },
        },
      ]);
  },
};

const mpindaAfter: TrafficScene = {
  id: 'mpinda-after', ports: ['mpinda'], after: ['mpinda-register'],
  needs: (g, st) => st.local.state === 'won' && g.clock.t - (st.local.at ?? g.clock.t) >= 60 * DAY,
  build: () => scene('mpinda-after', 'The first page',
    'Nsaku has the first page of the register unrolled on a stone: names written in the officer’s hand beside the factor’s, with the place each is from. Thirty-one names, and three struck through where they were free-born and went home. '
    + 'The factor still ships, and fewer, and says so in every letter. The Casa has had four of them; none mentions the officer.\n\n'
    + 'Mpinda is not changed in its heart; the traders have a new grievance and the elders a new standing. Nsaku asks one thing of you: that the next captain who stands at this landing be told what was done, so that he does not have to do it again.',
    [
      {
        label: 'Say it was the elders’ law, and not yours',
        detail: 'It was. The elders will remember who said so.',
        resolve: (gg) => {
          had(gg, 'mpinda-after');
          gg.noteDeed('mark.for', { target: 'kongo', place: 'mpinda', magnitude: 0.5, note: 'Said at Mpinda that the register was the elders’ law, and not mine.' });
          return 'Nsaku rolls the page. He says that is a thing worth telling.';
        },
      },
      {
        label: 'Say nothing; let the Casa think what it likes',
        detail: 'The page is the officer’s.',
        resolve: (gg) => { had(gg, 'mpinda-after'); return 'The officer takes the page back. The register goes on.'; },
      },
    ]),
};

const mpindaSplit: TrafficScene = {
  id: 'mpinda-split', ports: ['mpinda'], stages: [3, 4], after: ['mpinda-elders'],
  needs: () => true,
  build: (_g, st) => scene('mpinda-split', 'Two papers',
    'Two men claim the beach at Mpinda this season. Nsaku’s man has a paper from the council in the Mani Soyo’s mark: only what the king has condemned or taken in war may be sold. '
    + 'The trader Mavungu has a paper from a house in the Casa’s favour and a licence from the factor on São Tomé, who needs hands for the mills and will pay in cloth, iron and sugar. '
    + 'Each asks you to put your name to his.\n\n'
    + (stageOf(st) >= 4 ? 'There is a third paper, from a son of the old king who would be Manikongo, who has a view on both. ' : '')
    + 'The court at Mbanza Kongo has not decided between them. It will not decide for years, and when it does, it will not be because of a captain.',
    [
      {
        label: 'Sign the elders’ paper',
        detail: 'The traders will not forget it.',
        resolve: (gg) => {
          had(gg, 'mpinda-split');
          gg.powers.powers.kongo.balance = clamp((gg.powers.powers.kongo.balance ?? 0) - 0.2, -1, 1);
          gg.noteDeed('mark.for', { target: 'kongo', place: 'mpinda', magnitude: 0.5, note: 'Put my name to the Mani Soyo’s council’s paper at Mpinda: only what the king condemns or takes in war may be sold.' });
          return 'Nsaku’s man watches you sign, and nods once. Mavungu watches too.';
        },
      },
      {
        label: 'Sign the trader’s licence',
        detail: 'The elders will not forget it.',
        resolve: (gg) => {
          had(gg, 'mpinda-split');
          gg.powers.powers.kongo.balance = clamp((gg.powers.powers.kongo.balance ?? 0) + 0.2, -1, 1);
          gg.noteDeed('mark.against', { target: 'kongo', place: 'mpinda', magnitude: 0.4, note: 'Put my name to a trader’s licence at Mpinda against the council’s paper.' });
          return 'Mavungu thanks you in two languages. Nsaku’s man does not watch you sign.';
        },
      },
      {
        label: 'Sign neither',
        detail: 'You are a guest. Nobody thinks better of you for it.',
        resolve: (gg) => { had(gg, 'mpinda-split'); return 'Both men take their papers back. They have met this answer before.'; },
      },
    ]),
};

// ---------------------------------------------------------------------------------------------
// The clerk's book, and the heirs

const shipBook: TrafficScene = {
  id: 'ship-book', ports: ['mpinda', 'mina'], after: ['landing'],
  needs: (_g, st) => st.parcels.some((p) => p.status === 'landed'),
  build: (_g, st) => {
    const landed = st.parcels.filter((p) => p.status === 'landed');
    const total = landed.reduce((s, p) => s + p.n, 0);
    const dead = landed.reduce((s, p) => s + (p.n - p.alive), 0);
    return scene('ship-book', 'How the book is to read',
      'The escrivão has the Casa’s form open on the table. It has a line for "pieces landed" and none for "pieces embarked". '
      + `By your own count you took ${word(total)} aboard and ${dead === 0 ? 'landed them all' : `lost ${word(dead)} on the way`}. He asks, without raising his eyes, how the book is to read.`
      + (stageOf(st) >= 3 ? ' The quota is measured on the landed number.' : ''),
      [
        {
          label: 'Enter what was embarked, what was landed, and who died, with names',
          detail: 'It is a longer entry than the form allows. The Casa will read all of it.',
          resolve: (gg) => {
            had(gg, 'ship-book');
            gg.noteDeed('books.honest', { target: 'portugal', magnitude: 0.5, note: `Had the ship’s book read ${total} embarked, ${total - dead} landed, ${dead} dead, with the names of the dead.` });
            return 'The escrivão writes it all, and the line for the dead takes up two. He says nothing, and writes carefully.';
          },
        },
        {
          label: 'Enter the landed number only, as the form has it',
          detail: dead > 0 ? 'The quota is met, and nobody has to explain the dead.' : 'It is what the form asks.',
          resolve: (gg) => {
            had(gg, 'ship-book');
            if (dead > 0) {
              gg.noteDeed('books.cooked', { target: 'portugal', magnitude: 0.5, note: `Had the ship’s book enter ${total - dead} landed and no more; ${dead} who died on the passage are not in it.` });
              casaRegard(gg, 0.03);
              return 'The escrivão writes the number the form asks for. He does not look up. The dead are in nobody’s book but the ones the muster keeps.';
            }
            return 'The escrivão writes the number. It is the same number in either book.';
          },
        },
      ]);
  },
};

const heirs: TrafficScene = {
  id: 'heirs', ports: ['arguim', 'mina', 'mpinda'], stages: [3, 4],
  needs: (g, st) => stageOf(st) >= 4 || g.generation >= 2,
  build: (g, st) => {
    const c = carried(st), r = refused(st), k = st.fronts.traffic.pulled.contest;
    const redeemed = g.ledger.filter((e) => e.tag === 'person.redeemed').length;
    return scene('heirs', 'What the heirs will sail in',
      'A letter has found you at the factory, forwarded from Lisbon with the accounts of your House at Funchal. The terraces pay a third less than they did, since the cane from São Tomé began to come up the Tagus; '
      + 'the factor suggests selling them to a man who is buying in São Tomé. The man who is buying is a Lisbon house with a licence for the Mina road.\n\n'
      + `Beside the letter is your own book, which the escrivão has kept honestly or has not. By its count you have carried ${c === 0 ? 'nobody' : `${count(c, 'parcel')}`}, `
      + `refused ${r === 0 ? 'none' : count(r, 'parcel')}, been heard at ${k === 0 ? 'no hearing' : count(k, 'hearing')}, and paid for ${redeemed === 0 ? 'no one by name' : count(redeemed, 'person', 'people')}. `
      + 'The trade has stages, and you are in the fourth of them. Whoever sails after you will sail in a world your book helped make, and will have to decide what to do with the book.',
      [
        {
          label: 'Keep the book as it is, for whoever has the ship after you',
          detail: 'It will be read.',
          resolve: (gg) => { had(gg, 'heirs'); gg.noteDeed('books.honest', { target: 'portugal', magnitude: 0.4, note: 'Left the ship’s book as it was kept, to be read by whoever has the ship after me.' }); return 'You close it and put it with the charts. It is the thing the heir will open first.'; },
        },
        {
          label: 'Sell the terraces, and say nothing about the man who is buying',
          detail: 'The house you sell them to is the house that has the licence.',
          resolve: (gg) => { had(gg, 'heirs'); return 'The factor says it is a sensible price. You sign.'; },
        },
        {
          label: 'Put the letter away unanswered',
          detail: 'It will be there.',
          resolve: (gg) => { had(gg, 'heirs'); return 'The letter will wait. So will the next one.'; },
        },
      ]);
  },
};

export const TRAFFIC_SCENES: TrafficScene[] = [
  landing, arguimBook, arguimParcel, arguimQuota, minaBuyers, minaHearing, mpindaElders, mpindaRegister, mpindaAfter, mpindaSplit, shipBook, heirs,
];

export const TRAFFIC_SCENE_BY_ID = new Map(TRAFFIC_SCENES.map((s) => [s.id, s]));

/** Whether a scene may be offered now, given what has been had, its stages and its wait. */
export function sceneOffered(g: Game, sc: TrafficScene, port: string): boolean {
  const st = g.powers;
  if (!sc.ports.includes(port)) return false;
  const stage = stageOf(st);
  if (sc.stages && (stage < sc.stages[0] || stage > sc.stages[1])) return false;
  const doneAt = st.seen[sc.id];
  if (doneAt !== undefined && !sc.repeatDays) return false;
  if (doneAt !== undefined && sc.repeatDays && g.clock.t - doneAt < sc.repeatDays * DAY) return false;
  const laterAt = st.seen[`later:${sc.id}`];
  if (laterAt !== undefined && g.clock.t - laterAt < (sc.repeatDays ?? 1) * DAY) return false;
  if (sc.after && !sc.after.every((a) => st.seen[a] !== undefined)) return false;
  return sc.needs(g, st);
}

/** The next Traffic scene due at this port, if any. Marks it put; it is had when answered. */
export function dueTrafficScene(g: Game, port: string | null): SeaEvent | null {
  if (!port) return null;
  const st = g.powers;
  for (const sc of TRAFFIC_SCENES) {
    if (!sc.ports.includes(port)) continue;
    const id = sid(sc.id);
    const fired = st.seen[`fired:${sc.id}`];
    if (fired !== undefined) {
      // Put and not answered: still on its way, or lost from the queue and to be put again.
      if (g.pendingEvent?.id === id || g.pendingScenes.some((x) => x.id === id)) continue;
      delete st.seen[`fired:${sc.id}`];
    }
    if (!sceneOffered(g, sc, port)) continue;
    st.seen[`fired:${sc.id}`] = g.clock.t;
    return sc.build(g, st);
  }
  return null;
}
