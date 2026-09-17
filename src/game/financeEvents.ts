import { clamp } from '../core/math';
import { GOOD_BY_ID, good } from '../economy/goods';
import { portName } from '../progression/crown';
import { house, kindName, type Debt, type House } from '../economy/finance';
import type { SeaEvent } from './seaEvents';
import type { Game } from './state';

/**
 * What happens when you owe money and are not where the money is.
 *
 * A debt with no consequence is a discount, and that is what the old Casa
 * credit line was: you drew on it, it sat there, and the next settlement paid
 * it off without anybody ever mentioning it. Borrowing has to be able to go
 * wrong or there is no decision in it.
 *
 * It goes wrong in three stages, and all three are things that actually
 * happened to captains who came home late. First a letter overtakes you at a
 * port — the house has correspondents and they write to each other, and the
 * letter is always more polite than the situation. Then the factor stops
 * writing and attaches your cargo on the quay, which he could do and did. Then,
 * if you keep sailing away from it, the house gives you up, tells the street,
 * and sends a word to the Casa that costs you the King's good opinion as well
 * as theirs.
 *
 * The one mercy in the system is that you can always talk to them. Every one of
 * these scenes has a way out that costs money, a way out that costs standing,
 * and a way out that costs nothing now and a great deal later — which is the
 * same shape as every other decision in the game and is why debt belongs in it.
 */

/** Days past the date before each stage. */
const LETTER = 12;
const ATTACH = 45;
const RUIN = 120;

/**
 * The letter that catches up with you.
 *
 * Deliberately offered in port rather than at sea: a bill is a thing that
 * happens on land, and a dunning letter arriving in the middle of the Atlantic
 * would be very atmospheric and completely wrong.
 */
export function dunningScene(g: Game, d: Debt): SeaEvent {
  const h = house(d.house);
  const over = Math.round(g.finance.daysOverdue(d, g.clock.t));
  const owed = Math.round(d.owed - d.seized);
  const purse = g.crown.gold;
  // He would rather have most of it now than all of it in a year, and both of
  // you know it. The discount is the only cheap money in the whole system.
  const compound = Math.round(owed * 0.88);
  const half = Math.round(owed * 0.5);

  return {
    id: `dun:${d.id}:${Math.floor(over / 30)}`,
    title: `A letter from ${h.short}`,
    severity: over > ATTACH ? 'grave' : 'warning',
    text: `The factor here has a letter for you, and has plainly read it. `
      + `${h.name} observes that the ${kindName(d.kind).toLowerCase()} drawn at `
      + `${portName(d.atPort)} fell due ${over} days ago, that ${owed} cruzados stand against `
      + `your name, and that he has every confidence the delay is the sea’s doing rather `
      + `than yours.\n\nHe would be obliged if it were settled here. The factor is authorised `
      + `to take ${compound} in discharge of the whole if it is paid on the spot.`,
    choices: [
      {
        label: `Pay it here — ${compound} cruzados`,
        detail: purse >= compound
          ? 'Settled in full at his own discount, and the account closes clean.'
          : `You have ${Math.round(purse)}. The rest would come out of the Casa’s credit.`,
        resolve: (game) => {
          const paid = Math.min(compound, game.crown.gold + game.creditFree);
          if (game.crown.gold < paid) game.drawCredit(paid);
          game.crown.gold -= paid;
          game.finance.repaid += paid;
          if (paid >= compound - 1) {
            d.settled = true;
            d.outcome = 'paid';
            game.finance.regard(d.house, 9);
            return `Paid ${paid} cruzados to ${h.short}’s factor and had the paper back with `
              + 'his seal cut off it. Late is not the same as bad, and he has written as much.';
          }
          d.owed -= paid;
          game.finance.regard(d.house, 2, 0);
          return `Paid ${paid} cruzados on account. ${Math.round(d.owed)} still stands, and the `
            + 'discount is off the table.';
        },
      },
      {
        label: `Pay half and give him a new date — ${half}`,
        detail: 'Half now, the rest at a stiffer premium, and the clock starts again.',
        resolve: (game) => {
          const paid = Math.min(half, game.crown.gold + game.creditFree);
          if (game.crown.gold < paid) game.drawCredit(paid);
          game.crown.gold -= paid;
          game.finance.repaid += paid;
          d.owed = (d.owed - paid) * 1.14;
          d.dueBy = game.clock.t + 120 * 86400;
          d.dunned = over;
          game.finance.regard(d.house, 1, 0);
          return `Paid ${paid} on account and signed for ${Math.round(d.owed)} at a hundred and `
            + `twenty days. ${h.short} has taken a further fourteen per cent for the `
            + 'accommodation and did not pretend otherwise.';
        },
      },
      {
        label: 'Tell him the voyage is not finished',
        detail: 'Nothing paid. He will write again, and the next letter will not be a letter.',
        resolve: (game) => {
          d.dunned = over;
          game.finance.regard(d.house, -6, 0.4);
          return `Sent the factor away with a civil account of where the money is, which is at `
            + `sea in a hold that has not been sold yet. He wrote it all down, which is what `
            + 'worries you.';
        },
      },
    ],
  };
}

/**
 * The factor with a writ and four men.
 *
 * Attachment of a cargo on the quay is the point at which the money system
 * reaches into the hold, and it deliberately takes the *cargo* rather than the
 * coin: a captain with an empty purse and a full hold has been getting away
 * with it, and this is what stops him.
 */
export function attachmentScene(g: Game, d: Debt): SeaEvent {
  const h = house(d.house);
  const owed = Math.round(d.owed - d.seized);
  const manifest = g.ship.manifestValue();
  const take = Math.min(owed, manifest);

  return {
    id: `attach:${d.id}`,
    title: `${h.short}’s factor is on the quay`,
    severity: 'grave',
    text: `He has a writ from the corregedor and four men who are not clerks, and he is standing `
      + `at the foot of your gangway reading it aloud. ${owed} cruzados, and he is entitled to `
      + `take it out of what is in the hold.\n\n`
      + (manifest > 0
        ? `There is ${Math.round(manifest)} cruzados of cargo down there at what this town would `
          + 'pay for it. He is welcome to look at it, and he will.'
        : 'The hold is empty. He can see that it is empty, and it has not improved his temper.'),
    choices: [
      {
        label: 'Let him have the cargo',
        detail: manifest > 0
          ? `About ${Math.round(take)} cruzados of it, valued as this quay values it.`
          : 'There is nothing to take, which he will have to put in his letter.',
        resolve: (game) => {
          const got = game.attachCargo(take);
          d.seized += got;
          if (d.seized >= d.owed - 1) {
            d.settled = true;
            d.outcome = 'paid';
            game.finance.repaid += got;
            game.finance.regard(d.house, 2, 0);
            return `They carried it up the quay in front of the whole town and the debt is `
              + 'discharged. Nobody is pretending this was a payment.';
          }
          game.finance.repaid += got;
          game.finance.regard(d.house, -2, 0.2);
          return got > 0
            ? `They took ${Math.round(got)} cruzados of cargo. ${Math.round(d.owed - d.seized)} `
              + 'still stands against you.'
            : 'There was nothing in her worth the carrying. He has written that down too.';
        },
      },
      {
        label: 'Settle it in coin instead',
        detail: `${owed} cruzados out of the purse and the credit, and the cargo stays aboard.`,
        resolve: (game) => {
          const paid = Math.min(owed, game.crown.gold + game.creditFree);
          if (game.crown.gold < paid) game.drawCredit(paid);
          game.crown.gold -= paid;
          game.finance.repaid += paid;
          d.seized += paid;
          if (d.seized >= d.owed - 1) {
            d.settled = true;
            d.outcome = 'paid';
            game.finance.regard(d.house, 6);
            return `Paid ${paid} cruzados on the quay and kept the cargo, which is the only part `
              + 'of this that mattered.';
          }
          game.finance.regard(d.house, -1, 0.2);
          return `Paid ${paid}, which is what there was. He has taken it and will be back for `
            + `${Math.round(d.owed - d.seized)}.`;
        },
      },
      {
        label: 'Put to sea tonight',
        detail: 'The cargo is yours and so is the quarrel. The house will give you up.',
        resolve: (game) => {
          game.finance.regard(d.house, -22, 0.6);
          d.dueBy = game.clock.t - RUIN * 0.6 * 86400;
          game.crown.standing = Math.max(0, game.crown.standing - 12);
          return 'Slipped the cable in the middle watch with his writ still in your cabin. The '
            + 'whole street will know inside a month, and the Casa will know the month after.';
        },
      },
    ],
  };
}

/**
 * The end of it.
 *
 * A house that has given up on you does not simply stop lending. It tells the
 * others, it tells the Casa, and in Lisbon the Casa is the King. This is the
 * one place in the money system where the loss is permanent: the door does not
 * open again.
 */
export function ruinScene(g: Game, d: Debt): SeaEvent {
  const h = house(d.house);
  const owed = Math.round(d.owed - d.seized);
  const ship = g.tradeInValue();

  return {
    id: `ruin:${d.id}`,
    title: `${h.name} has written you off`,
    severity: 'grave',
    text: `The letter is to the Casa and you are being shown it as a courtesy. ${h.name} declares `
      + `${owed} cruzados a bad debt, gives the dates, and asks that it be recorded against your `
      + `name in the King’s house as well as his own.\n\nThere is one thing he will still `
      + `entertain. He will take the ship against it — she is worth about ${ship} to a yard `
      + `— and you may keep whatever is in her and walk away owing nothing.`,
    choices: [
      {
        label: 'Sell the ship out from under yourself',
        detail: ship >= owed
          ? 'The debt goes, the hull goes, and you begin again in whatever the yard will sell you.'
          : `She will not cover it. ${Math.round(owed - ship)} would still stand.`,
        resolve: (game) => game.surrenderShip(d),
      },
      {
        label: 'Let him record it',
        detail: 'The door closes for good and the Casa hears. Nothing is paid.',
        resolve: (game) => {
          d.settled = true;
          d.outcome = 'defaulted';
          game.finance.defaults += 1;
          game.finance.credit[d.house] = 0;
          game.finance.regard(d.house, 0, 0);
          for (const other of Object.keys(game.finance.credit) as (keyof typeof game.finance.credit)[]) {
            if (other === d.house) continue;
            game.finance.credit[other] = Math.round(clamp(game.finance.credit[other] - 16, 0, 100));
          }
          game.crown.standing = Math.max(0, game.crown.standing - 40);
          return `${h.name} has entered you in his bad book and sent a copy to the Rua Nova and `
            + 'another to the Casa. It is not a thing that is ever taken out again.';
        },
      },
    ],
  };
}

/**
 * A house that likes you comes looking.
 *
 * The reward for a clean record, and the only part of the money system the
 * player does not have to go and ask for. Marchionni funded voyages he
 * proposed himself, and being the man he proposes them to is worth more than
 * any rate.
 */
export function propositionScene(g: Game, h: House): SeaEvent {
  const credit = g.finance.credit[h.id];
  const sum = Math.round(h.ceiling * (0.4 + (credit / 100) * 0.5));
  const cut = 0.22;
  // What he would like to see coming out of her. An anchorage that produces
  // nothing named would otherwise hand good() an undefined id and throw in the
  // middle of the one scene that is supposed to be a reward.
  const produces = Object.keys(g.portHere?.produces ?? {});
  const gd = produces.map((id) => GOOD_BY_ID.get(id)).find((x) => !!x) ?? good('pimenta');

  return {
    id: `prop:${h.id}:${Math.floor(g.clock.t / 86400 / 200)}`,
    title: `${h.name} sends for you`,
    severity: 'note',
    text: `You are taken up a staircase behind the counting-house to a room with a chart on the `
      + `wall that is better than yours. ${h.short} has been following your account with the `
      + `interest of a man who has decided something.\n\nHe will put ${sum} cruzados into your `
      + `next voyage. Not a loan — he wants no paper and no date, and if she is lost he will `
      + `say nothing about it. He wants ${Math.round(cut * 100)} per cent of what you land, for `
      + `as long as it takes, and he wants it to be understood that ${gd.name.toLowerCase()} is `
      + `what he would like to see coming out of her.`,
    choices: [
      {
        label: `Take it — ${sum} now, ${Math.round(cut * 100)} per cent of everything landed`,
        detail: 'No repayment, ever. The cut runs until the sixteenths are discharged.',
        resolve: (game) => {
          game.crown.gold += sum;
          game.finance.strike({
            house: h.id, kind: 'quinhao', principal: sum, owed: 0, rate: 0,
            dueBy: game.clock.t + 540 * 86400, struck: game.clock.t,
            sixteenths: Math.round(cut * 16), share: cut,
            atPort: game.dockedAt ?? 'lisboa', voyage: 'his own proposal',
          });
          game.finance.regard(h.id, 6);
          return `${sum} cruzados counted out on the table without a scrap of paper signed. He `
            + `has ${Math.round(cut * 100)} per cent of everything that comes out of her from `
            + 'now until the account is closed, and he did not have to be asked twice.';
        },
      },
      {
        label: 'Thank him and keep the voyage whole',
        detail: 'Nothing taken. He will remember that you can say no, which is worth something.',
        resolve: (game) => {
          game.finance.regard(h.id, 3, 0);
          return 'Declined, politely, over his wine. He took it better than expected and said '
            + 'that a man who does not need money is the only kind worth offering it to.';
        },
      },
    ],
  };
}

/**
 * Whatever the counting-houses have to say to you, on making port.
 *
 * Checked at the quay rather than rolled at sea, and one at a time, worst
 * first: a captain who has let three bills run should be met by the angriest
 * of his creditors, not by all of them in a queue.
 */
export function rollFinanceScene(g: Game): SeaEvent | null {
  const def = g.portHere;
  if (!def) return null;

  let worst: Debt | null = null;
  let worstOver = 0;
  for (const d of g.finance.live) {
    if (d.kind === 'quinhao') continue;
    const h = house(d.house);
    if (!g.houseReaches(h, def)) continue;
    const over = g.finance.daysOverdue(d, g.clock.t);
    if (over < LETTER) continue;
    if (over > worstOver) { worstOver = over; worst = d; }
  }

  if (worst) {
    if (worstOver >= RUIN) return ruinScene(g, worst);
    if (worstOver >= ATTACH) return attachmentScene(g, worst);
    // One letter per month of lateness, so a captain who is a week later than
    // last time does not get the same letter again.
    if (Math.floor(worstOver / 30) > Math.floor(worst.dunned / 30) || worst.dunned === 0) {
      worst.dunned = worstOver;
      return dunningScene(g, worst);
    }
  }

  // And the good version. Rare, and only for a captain with a record and no
  // paper out with the house making the offer.
  if (g.finance.live.some((d) => d.kind === 'quinhao')) return null;
  for (const h of g.finance.byRegard()) {
    if (g.finance.credit[h.id] < 76) continue;
    if (!h.writes.includes('quinhao')) continue;
    if (!g.houseReaches(h, def)) continue;
    if (g.finance.owedTo(h.id) > 0) continue;
    if (g.crown.lifetimeStanding < 120) continue;
    if (g.propositionsSeen.includes(h.id)) continue;
    if (!g.rng.chance(0.5)) continue;
    g.propositionsSeen.push(h.id);
    return propositionScene(g, h);
  }
  return null;
}
