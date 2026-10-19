import { good, unitOf } from '../../economy/goods';
import { formatDateAt } from '../../core/clock';
import { daysLeft, ventureLine, ventureTons } from '../../progression/ventures';
import type { Game } from '../../game/state';
import { button, card, el, kv } from '../dom';
import type { Ctx } from './ctx';
import { verb } from './verb';

/**
 * The counting house.
 *
 * Charters on offer here, and the hearsay of the waterfront. The two belong
 * together because they are the same thing from the captain's side: the
 * reasons to go somewhere that are not the King's orders.
 */
export function freightSection(ctx: Ctx, host: HTMLElement, g: Game): void {
  const rel = g.relationsFor(g.portHere!.id);
  const left = el('div', {});
  const right = el('div', {});
  const ventures = verb('freight.ventures', el('div', {}));
  left.append(ventures);

  if (!rel.mayTrade) {
    ventures.append(el('div', { class: 'notice' },
      'No merchant here will sign anything with a man who has no leave to trade.'));
  } else if (g.ventureOffers.length === 0) {
    ventures.append(card('No freight offering',
      el('p', {}, 'Nothing is waiting for a bottom. Come back when the market has turned over, '
        + 'or when there is a ship expected that does not arrive.')));
  } else {
    for (const v of g.ventureOffers) {
      const days = Math.round(daysLeft(v, g.clock.t));
      // The hold is measured in tons, not in casks: room is what the cargo
      // stows, not how many of it there are.
      const tons = ventureTons(v);
      const room = g.ship.holdFree >= tons - 0.01;
      ventures.append(card(v.patron,
        el('p', { class: 'flavour' }, ventureLine(v)),
        kv('Freight paid on delivery', `${v.fee} cruzados`),
        kv('Advance in hand', `${v.advance} cruzados`),
        kv('Time allowed', `${days} days`),
        kv('Forfeit if she is late', `${v.penalty} cruzados`),
        kv('It will stow', `${tons.toFixed(1)} tons of ${g.ship.holdFree.toFixed(1)} free`,
          room ? '' : 'bad'),
        el('div', { class: 'row' },
          button('Sign for it', () => {
            ctx.notice = { text: g.acceptVenture(v.id) };
            ctx.render();
          }, { primary: true, disabled: !room }),
        ),
      ));
    }
  }

  // Forward contracts: the Lisbon houses buying a cargo before it exists.
  const offered = verb('freight.contracts-offered', el('div', {}));
  for (const c of g.contractOffers()) {
    const gd = good(c.goodId);
    offered.append(card(`${c.houseName} \u2014 a contract`,
      el('p', { class: 'flavour' }, `${c.qty} ${unitOf(gd, c.qty)} of ${gd.english.toLowerCase()}, delivered on the Tagus by ${formatDateAt(c.due)}, at ${c.price} the ${gd.unit} whatever the market is paying that day.`),
      kv('Worth on delivery', `${Math.round(c.qty * c.price)} cruzados`),
      kv('Advance now', `${c.advance} cruzados`),
      kv('If you fail', `the advance and half as much again, and their good opinion`),
      el('div', { class: 'row' }, button('Sign', () => { ctx.notice = { text: g.signContract(c.id) }; ctx.render(); }, { primary: true })),
    ));
  }
  if (offered.childNodes.length) left.append(offered);
  const open = g.trade.contracts.filter((c) => c.status === 'open');
  if (open.length > 0) {
    right.append(verb('freight.contracts-open', card('Contracts to deliver',
      ...open.map((c) => el('div', { class: 'court-agreement' },
        el('span', {}, `${c.qty} ${good(c.goodId).english.toLowerCase()} for ${c.houseName} (${g.ship.quantityOf(c.goodId).toFixed(0)} aboard)`),
        el('span', { class: 'due' }, `${Math.round((c.due - g.clock.t) / 86400)} days`))))));
  }

  const active = g.activeVentures;
  right.append(verb('freight.own-account', card('Carried on your own account',
    active.length === 0
      ? el('p', {}, 'Nothing consigned.')
      : el('div', {}, ...active.map((v) => {
          const left2 = Math.round(daysLeft(v, g.clock.t));
          return el('p', { class: left2 < 10 ? 'bad' : '' },
            `${ventureLine(v)} for ${v.patron} — ${left2 < 0 ? `${-left2} days overdue` : `${left2} days`}.`);
        })),
  )));

  host.append(el('div', { class: 'cols two' }, left, right));
}
