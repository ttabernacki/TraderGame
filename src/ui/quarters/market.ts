import { good, unitOf } from '../../economy/goods';
import { ANTWERP, ANTWERP_DAYS, CASA_SHARE, COMPETITION, MONOPOLY, REGION_NAME, antwerpBid, fairsAt, gradeWord, paymentAt } from '../../economy/trade';
import { formatDateAt } from '../../core/clock';
import { type PortDef } from '../../world/ports';
import type { Game, TradeListing } from '../../game/state';
import { append, button, card, el, fold, foldCard, kv } from '../dom';
import { renderBarter } from './barter';
import type { Ctx } from './ctx';
import { tagLast, verb } from './verb';

/** The Market's open section: trade at the scales or the barter table. */
export function tradeSection(ctx: Ctx, host: HTMLElement, g: Game): void {
  const def = g.portHere!;
  const rel = g.relationsFor(def.id);
  if (!rel.mayTrade) {
    host.append(verb('market.closed', el('div', { class: 'notice grave' },
      'The market is closed to you. Nobody will deal until the governor says they may.',
      el('div', { style: { marginTop: '9px' } },
        button('Seek an audience', () => ctx.onAudience(), {
          primary: true,
          disabled: def.people === 'portuguese',
        })))));
    return;
  }
  const listings = g.marketHere();

  append(host,
    verb('market.purse', el('div', { class: 'card' },
      el('div', { class: 'purse-row' },
        el('div', {}, kv('Purse', `${g.crown.gold.toFixed(0)} cruzados`)),
        el('div', {}, kv('Hold free', `${g.ship.holdFree.toFixed(1)} of ${g.ship.holdCapacity} tons`
          + (g.ship.reservedTons > 0 ? ` (${g.ship.reservedTons.toFixed(1)} in the officers’ chests)` : ''))),
        el('div', {}, kv('Your bargaining', `${g.skills.comercio.toFixed(0)}`)),
        g.creditLimit > 0
          ? el('div', {}, kv('Credit',
              `${g.creditFree.toFixed(0)} to draw` + (g.crown.debt > 0 ? ` · ${g.crown.debt.toFixed(0)} owed` : '')))
          : null,
      ),
    )),
    verb('market.info', marketCard(ctx, g, def)),
    el('div', { class: 'tabs market-mode' },
      el('button', { class: ctx.marketMode === 'scales' ? 'active' : '', onclick: () => { ctx.marketMode = 'scales'; ctx.render(); } }, 'At the scales, for coin'),
      el('button', { class: ctx.marketMode === 'barter' ? 'active' : '', onclick: () => { ctx.marketMode = 'barter'; ctx.render(); } }, 'The barter table'),
    ),
  );

  if (ctx.marketMode === 'barter') { renderBarter(ctx, host, g, listings); tagLast(host, 'market.barter'); }
  else { renderScales(ctx, host, g, listings); tagLast(host, 'market.scales'); }

  const extras = el('div', { class: 'cols two' });
  const l2 = el('div', {}), r2 = el('div', {});
  const eye = factorsEye(ctx, g);
  if (eye) l2.append(verb('market.factors-eye', eye));
  const letters = lettersCard(ctx, g);
  if (letters) l2.append(verb('market.letters', foldCard(letters)));
  if (def.id === 'lisboa') {
    r2.append(verb('market.kings-goods', foldCard(kingsGoodsCard(ctx, g))));
    const ant = antwerpCard(ctx, g);
    if (ant) r2.append(verb('market.antwerp', foldCard(ant)));
  }
  extras.append(l2, r2);
  host.append(extras);
}

/** What kind of market this is: what it takes, who else is buying, what is happening to it. */
export function marketCard(_ctx: Ctx, g: Game, def: PortDef): HTMLElement {
  const pay = paymentAt(def.id);
  const comp = COMPETITION[def.id];
  const level = g.competitionAt(def.id);
  const fairs = fairsAt(def.id, g.clock.date.month);
  const news = g.newsHeard.filter((n) => n.def.ports.includes(def.id) && n.shock.end > g.clock.t);
  const takes = Object.entries(pay.takes).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([id, m]) => `${good(id).english.toLowerCase()} (+${Math.round((m - 1) * 100)}%)`);
  return fold('This market', pay.line, fairs.length + news.length > 0,
    kv('What they take', pay.line),
    pay.coin > 1.02 ? kv('Coin', `buys about ${Math.round((1 - 1 / pay.coin) * 100)}% less than its face`, 'warn') : null,
    takes.length ? kv('In barter they prize', takes.join(', ')) : null,
    comp ? kv('Also buying', level < comp.level * 0.5 ? `${comp.who}, kept out by your treaty` : comp.who, level > 0.4 ? 'warn' : '') : null,
    ...fairs.map((f) => el('div', { class: 'market-fair' }, el('b', {}, f.name), ' — ', f.text)),
    ...news.map((n) => el('div', { class: 'market-news' }, el('b', {}, n.def.title), ' — ', n.def.text)),
  );
}

export function renderScales(ctx: Ctx, host: HTMLElement, g: Game, listings: TradeListing[]): void {
  const grid = el('div', { class: 'trade-grid' },
    el('div', { class: 'trade-head' },
      el('div', {}, 'Goods'),
      el('div', { class: 'num' }, 'They ask'),
      el('div', { class: 'num' }, 'They offer'),
      el('div', { class: 'num' }, 'Lisbon'),
      el('div', { class: 'num' }, 'Available'),
      el('div', { class: 'num' }, 'In hold'),
      el('div', {}, ''),
    ),
  );

  for (const l of listings) {
    const gd = good(l.goodId);
    const lot = g.ship.cargo.find((c) => c.goodId === l.goodId);
    const held = lot?.quantity ?? 0;
    const qty = ctx.quantities.get(l.goodId) ?? 10;
    const margin = gd.lisbon / Math.max(l.ask, 0.01);
    const onCharter = consignedOf(g, l.goodId);
    const forCrown = commissionNeed(g, l.goodId);
    const grade = lot ? gradeWord(lot.q ?? 0.5) : '';

    grid.append(el('div', { class: 'trade-row' },
      el('div', { class: 'trade-name' },
        el('b', {}, gd.english, l.casa ? el('span', { class: 'tag warn', title: 'A royal monopoly: the Casa buys it at the King’s price.' }, 'the King’s') : null),
        el('span', {}, `${gd.name} · per ${gd.unit}${l.barter > 1 ? ` · prized in barter` : ''}`),
      ),
      el('div', { class: 'trade-fig', 'data-k': 'They ask' },
        l.stock > 0 ? l.ask.toFixed(1) : '—'),
      el('div', {
        class: 'trade-fig', 'data-k': 'They offer',
        style: l.appetite > 0 && !l.wanted ? { opacity: '0.62', fontStyle: 'italic' } : undefined,
        title: l.casa ? 'What the Casa pays: the King keeps the rest.'
          : l.wanted ? undefined
            : 'Nobody here wants it. One merchant will take a parcel off your hands to '
              + 'move on elsewhere, and prices it accordingly.',
      }, l.appetite > 0 ? l.bid.toFixed(1) : '—'),
      el('div', {
        class: 'trade-fig', 'data-k': 'At Lisbon',
        style: { color: margin > 3 ? 'var(--green)' : 'inherit' },
      }, gd.lisbon.toFixed(0)),
      el('div', { class: 'trade-fig', 'data-k': 'Available' },
        l.stock > 0 ? l.stock.toFixed(0) : '—'),
      el('div', {
        class: 'trade-fig', 'data-k': 'In hold',
        title: onCharter > 0 ? 'Part of this is on charter'
          : forCrown > 0 ? 'The King is expecting this cargo' : grade ? `${grade} quality` : undefined,
        style: forCrown > 0 && held < forCrown ? { color: 'var(--warn)' } : undefined,
      },
        held > 0 || forCrown > 0
          ? onCharter > 0 ? `${held.toFixed(0)} (${onCharter} on charter)`
            : forCrown > 0 ? `${held.toFixed(0)} of ${forCrown} for the King`
              : `${held.toFixed(0)} · ${grade.toLowerCase()}`
          : '—'),
      el('div', { class: 'trade-act' },
        el('input', {
          type: 'number', min: '1', inputmode: 'numeric', value: String(qty),
          'aria-label': `Quantity of ${gd.name}`,
          oninput: (e: Event) => ctx.quantities.set(
            l.goodId, Math.max(1, Number((e.target as HTMLInputElement).value))),
        }),
        button('Buy', () => buy(ctx, g, l, ctx.quantities.get(l.goodId) ?? qty), {
          disabled: l.stock <= 0 || g.crown.gold + g.creditFree < l.ask,
        }),
        button(l.casa ? 'To the Casa' : 'Sell', () => sell(ctx, g, l, ctx.quantities.get(l.goodId) ?? qty), {
          disabled: held <= 0 || l.appetite <= 0,
        }),
        l.casa && held > 0
          ? button('On the quay', () => sell(ctx, g, l, ctx.quantities.get(l.goodId) ?? qty, true), {
            title: 'Sell it privately at the full price, past the King’s scales. If the officers are on the quay, it is seized.',
          })
          : null,
      ),
    ));
  }
  host.append(grid);
}

/**
 * What the same goods fetch at the other ports you know.
 *
 * Out of your own book, not an oracle: the prices you saw with your own eyes,
 * the letters your factors wrote, and whatever a broker sold you. All of them
 * as old as they are.
 */
export function factorsEye(_ctx: Ctx, g: Game): HTMLElement | null {
  const here = g.portHere!.id;
  const rows: HTMLElement[] = [];
  for (const lot of g.ship.cargo) {
    const quotes = g.distantQuotes(lot.goodId, here);
    if (quotes.length === 0) continue;
    rows.push(el('li', {},
      el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } },
        el('span', {}, good(lot.goodId).english),
        el('span', { style: { color: 'var(--ink-soft)', fontSize: '12.5px' } },
          quotes.map((q) => `${q.port} ${q.bid.toFixed(1)} (${Math.round(q.days)}d)`).join('  ·  ')),
      ),
    ));
  }
  if (rows.length === 0) return null;
  return card('What they pay elsewhere',
    el('p', { style: { fontStyle: 'italic', color: 'var(--ink-soft)' } },
      'From your own book: what you saw, and what was written to you. The days are how old each price is.'),
    el('ul', { class: 'list' }, ...rows),
  );
}

export function lettersCard(ctx: Ctx, g: Game): HTMLElement | null {
  const offers = g.reportOffers();
  if (offers.length === 0) return null;
  return card('Brokers’ letters',
    el('p', { class: 'flavour' }, 'A broker here will sell you what his correspondents write about the prices on another coast. Most of them are honest. Not all.'),
    el('div', { class: 'row wrap' }, ...offers.map((o) => button(`${REGION_NAME[o.region]} — ${o.price}`, () => {
      ctx.notice = { text: g.buyReport(o.region) };
      ctx.render();
    }, { disabled: g.crown.gold < o.price, title: `${o.ports} ports you have charted` }))),
  );
}

export function kingsGoodsCard(ctx: Ctx, g: Game): HTMLElement {
  return card('The King’s goods',
    el('p', { class: 'flavour' }, `Pepper, gold, malagueta and ivory are the King's. Landed here, the Casa takes them at ${Math.round(CASA_SHARE * 100)}% of what the market would pay — unless you hold his licence to trade them on your own account.`),
    ...MONOPOLY.map((id) => {
      const until = g.trade.licences[id] ?? 0;
      const held = until > g.clock.t;
      return el('div', { class: 'court-agreement' },
        el('span', {}, good(id).english),
        held
          ? el('span', { class: 'due' }, `licensed until ${formatDateAt(until)}`)
          : button(`Licence — ${g.licencePrice(id)}`, () => { ctx.notice = { text: g.buyLicence(id) }; ctx.render(); },
            { disabled: g.crown.gold < g.licencePrice(id) }));
    }),
  );
}

export function antwerpCard(ctx: Ctx, g: Game): HTMLElement | null {
  if (!g.antwerpOpen) return null;
  const rows = g.ship.cargo.filter((c) => ANTWERP[c.goodId] && (!MONOPOLY.includes(c.goodId) || g.hasLicence(c.goodId)));
  const owed = g.trade.antwerp.reduce((s, a) => s + a.amount, 0);
  return card('The Casa’s factor at Antwerp',
    el('p', { class: 'flavour' }, `Antwerp is where Europe buys its spice. The Casa will ship yours there and sell it, less a tenth for the freight, and the money comes back in about ${ANTWERP_DAYS} days. Lisbon's price falls with every cargo landed on it; Antwerp's falls more slowly.`),
    ...rows.map((c) => el('div', { class: 'court-agreement' },
      el('span', {}, `${good(c.goodId).english} — ${antwerpBid(g.trade, c.goodId).toFixed(1)} each`),
      button(`Send ${c.quantity.toFixed(0)}`, () => { ctx.notice = { text: g.sellAntwerp(c.goodId, c.quantity) }; ctx.render(); }))),
    rows.length === 0 ? el('p', {}, 'Nothing in the hold Antwerp wants.') : null,
    owed > 0 ? kv('Owed from Antwerp', `${owed.toFixed(0)} cruzados`) : null,
  );
}

export function buy(ctx: Ctx, g: Game, l: TradeListing, qty: number): void {
  const r = g.tradeBuy(l.goodId, qty);
  ctx.notice = { text: r.text, grave: !r.ok };
  ctx.render();
}

export function sell(ctx: Ctx, g: Game, l: TradeListing, qty: number, quay = false): void {
  const gd = good(l.goodId);
  const held = g.ship.quantityOf(l.goodId);
  const take = Math.min(qty, held, l.appetite);
  if (take <= 0) { ctx.notice = { text: 'They will not take any more of that.', grave: true }; ctx.render(); return; }

  // Cargo signed for on charter is somebody else's. Selling it out from under
  // a merchant is a real option — it is money now against a forfeit later —
  // but it must never happen because the player did not know it was aboard.
  const consigned = g.activeVentures
    .filter((v) => v.loaded && v.goodId === l.goodId)
    .reduce((sum, v) => sum + v.quantity, 0);
  if (consigned > 0 && held - take < consigned - 0.01) {
    const short = Math.ceil(consigned - (held - take));
    if (!ctx.confirmSale) {
      ctx.confirmSale = l.goodId;
      ctx.notice = {
        text: `${short} of that is consigned on charter. Sell it and the charter is broken, `
          + 'the advance is forfeit and the penalty falls due. Press Sell again to do it.',
        grave: true,
      };
      ctx.render();
      return;
    }
  }

  // And cargo the King is expecting, which is worse: a cargo objective is
  // checked against the hold at court, and selling it on the Tagus quay is
  // the single most natural thing to do with it.
  const owed = commissionNeed(g, l.goodId);
  if (owed > 0 && held - take < owed - 0.01) {
    const short = Math.ceil(owed - (held - take));
    if (ctx.confirmSale !== l.goodId) {
      ctx.confirmSale = l.goodId;
      ctx.notice = {
        text: `The King is expecting ${owed.toFixed(0)} ${unitOf(gd, owed)} of this, and selling would `
          + `leave you ${short} short. Your commission cannot be discharged until it is made `
          + 'good. Press Sell again to do it anyway.',
        grave: true,
      };
      ctx.render();
      return;
    }
  }
  ctx.confirmSale = null;

  const r = g.tradeSell(l.goodId, take, quay);
  ctx.notice = {
    text: r.text
      + (r.edge > 0.01 ? ` Your book was worth ${(r.edge * 100).toFixed(0)}% of it.` : '')
      + (r.shared > 0.5 ? ` The sharers took ${r.shared.toFixed(0)} off the top.` : ''),
    grave: !r.ok,
  };
  ctx.render();
}

/** How much of a good the commission in hand requires you to bring home. */
function commissionNeed(g: Game, goodId: string): number {
  const p = g.crown.patent;
  if (!p || p.complete || p.failed) return 0;
  return p.objectives
    .filter((o) => o.kind === 'cargo' && o.target === goodId)
    .reduce((sum, o) => sum + (o.amount ?? 0), 0);
}

/** How much of a good in the hold belongs to a merchant rather than to you. */
function consignedOf(g: Game, goodId: string): number {
  return g.consignedVentures
    .filter((v) => v.loaded && v.goodId === goodId)
    .reduce((sum, v) => sum + v.quantity, 0);
}
