import { good, unitOf } from '../../economy/goods';
import { formatDateAt } from '../../core/clock';
import { openLineCard } from '../networkView';
import { hullPrice } from '../../progression/network';
import { daysLeft, ventureLine, ventureTons } from '../../progression/ventures';
import { house } from '../../economy/finance';
import type { Game } from '../../game/state';
import { append, button, card, el, fold, kv } from '../dom';
import type { Ctx } from './ctx';

/**
 * The counting house.
 *
 * Charters on offer here, and the hearsay of the waterfront. The two belong
 * together because they are the same thing from the captain's side: the
 * reasons to go somewhere that are not the King's orders.
 */
export function renderFreight(ctx: Ctx, host: HTMLElement, g: Game, rel: ReturnType<Game['relationsFor']>): void {
  const left = el('div', {});
  const right = el('div', {});

  if (!rel.mayTrade) {
    left.append(el('div', { class: 'notice' },
      'No merchant here will sign anything with a man who has no leave to trade.'));
  } else if (g.ventureOffers.length === 0) {
    left.append(card('No freight offering',
      el('p', {}, 'Nothing is waiting for a bottom. Come back when the market has turned over, '
        + 'or when there is a ship expected that does not arrive.')));
  } else {
    for (const v of g.ventureOffers) {
      const days = Math.round(daysLeft(v, g.clock.t));
      // The hold is measured in tons, not in casks: room is what the cargo
      // stows, not how many of it there are.
      const tons = ventureTons(v);
      const room = g.ship.holdFree >= tons - 0.01;
      left.append(card(v.patron,
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
  for (const c of g.contractOffers()) {
    const gd = good(c.goodId);
    left.append(card(`${c.houseName} \u2014 a contract`,
      el('p', { class: 'flavour' }, `${c.qty} ${unitOf(gd, c.qty)} of ${gd.english.toLowerCase()}, delivered on the Tagus by ${formatDateAt(c.due)}, at ${c.price} the ${gd.unit} whatever the market is paying that day.`),
      kv('Worth on delivery', `${Math.round(c.qty * c.price)} cruzados`),
      kv('Advance now', `${c.advance} cruzados`),
      kv('If you fail', `the advance and half as much again, and their good opinion`),
      el('div', { class: 'row' }, button('Sign', () => { ctx.notice = { text: g.signContract(c.id) }; ctx.render(); }, { primary: true })),
    ));
  }
  const open = g.trade.contracts.filter((c) => c.status === 'open');
  if (open.length > 0) {
    right.append(card('Contracts to deliver',
      ...open.map((c) => el('div', { class: 'court-agreement' },
        el('span', {}, `${c.qty} ${good(c.goodId).english.toLowerCase()} for ${c.houseName} (${g.ship.quantityOf(c.goodId).toFixed(0)} aboard)`),
        el('span', { class: 'due' }, `${Math.round((c.due - g.clock.t) / 86400)} days`)))));
  }

  const active = g.activeVentures;
  right.append(card('Carried on your own account',
    active.length === 0
      ? el('p', {}, 'Nothing consigned.')
      : el('div', {}, ...active.map((v) => {
          const left2 = Math.round(daysLeft(v, g.clock.t));
          return el('p', { class: left2 < 10 ? 'bad' : '' },
            `${ventureLine(v)} for ${v.patron} — ${left2 < 0 ? `${-left2} days overdue` : `${left2} days`}.`);
        })),
  ));

  const heard = g.openLeads;
  right.append(fold('What the waterfront says', '', false,
    heard.length === 0
      ? el('p', {}, 'Nothing you have not heard before. Buy a pilot a drink and wait.')
      : el('div', {}, ...heard.slice(0, 4).map((l) =>
          el('p', { class: 'flavour', style: { marginBottom: '9px' } }, l.text))),
    el('p', { style: { fontSize: '13px', opacity: '0.75' } },
      'Every one of these is a man\u2019s word, and a man\u2019s word is worth what the man is worth. '
      + 'The chart will show you where they point, which is not the same as where the thing is.'),
  ));

  // And what you own in this town, and what could be bought.
  // Shown once a Line is a thing she could afford, or already has.
  const couldBuy = g.crown.gold + g.creditFree >= hullPrice('caravela-latina') * 0.8 || g.lines.some((l) => !l.lost);
  if ((g.factoryHere || g.portHere!.id === 'lisboa') && couldBuy) {
    right.append(openLineCard(g, () => ctx.render(), (t) => { ctx.notice = { text: t }; }, g.portHere!.id));
  }

  host.append(el('div', { class: 'cols two' }, left, right));
}
