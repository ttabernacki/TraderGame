import { clamp } from '../../core/math';
import { good } from '../../economy/goods';
import { gradeWord, paymentAt } from '../../economy/trade';
import type { Game, TradeListing } from '../../game/state';
import { button, card, el } from '../dom';
import type { Ctx } from './ctx';

/** Goods across a cloth: yours on one side, his on the other, until he nods. */
export function renderBarter(ctx: Ctx, host: HTMLElement, g: Game, listings: TradeListing[]): void {
  const pat = g.barterPatience;
  if (pat.closed) {
    host.append(el('div', { class: 'notice grave' }, 'The merchants will not sit down with you again for a few days.'));
    return;
  }
  const give = [...ctx.barterGive.entries()].map(([goodId, qty]) => ({ goodId, qty }));
  const take = [...ctx.barterTake.entries()].map(([goodId, qty]) => ({ goodId, qty }));
  const v = g.barterValue(give, ctx.barterCoin, take);
  const fuzz = g.barterFuzz;
  // What you can read in his face: the true ratio against what he will settle
  // for, blurred by how well you know the trade and the tongue.
  const r = v.theirs > 0 ? v.yours / (v.theirs * g.barterReservation()) : 0;
  const seen = r * (1 + ctx.faceNoise * fuzz);
  const lean = v.theirs <= 0 ? 'Lay out what you want from him.'
    : seen > 1 + fuzz ? 'He is trying not to look pleased.'
      : seen > 1 - fuzz ? 'He is thinking about it.'
        : seen > 0.8 ? 'He is not there yet.'
          : 'He looks at your side of the cloth as if it were an insult.';
  const pay = paymentAt(g.dockedAt!);
  const qtyInput = (map: Map<string, number>, id: string, max: number, label: string) => el('input', {
    type: 'number', min: '0', max: String(Math.floor(max)), inputmode: 'numeric', value: String(map.get(id) ?? 0),
    'aria-label': label,
    onchange: (e: Event) => {
      const n = clamp(Math.floor(Number((e.target as HTMLInputElement).value) || 0), 0, Math.floor(max));
      if (n > 0) map.set(id, n); else map.delete(id);
      // Deferred: a change fires on blur, and blur fires while render is
      // tearing the old input out of the page.
      setTimeout(() => ctx.render(), 0);
    },
  });

  const mine = listings.filter((l) => g.ship.quantityOf(l.goodId) >= 1 && l.appetite > 0)
    .sort((a, b) => b.barter - a.barter);
  const his = listings.filter((l) => l.stock > 0);
  const yourSide = card('Your side of the cloth',
    ...mine.map((l) => {
      const lot = g.ship.cargo.find((c) => c.goodId === l.goodId)!;
      return el('div', { class: 'barter-row' },
        el('div', {},
          el('div', {}, good(l.goodId).english,
            l.barter > 1 ? el('span', { class: 'tag good' }, `prized +${Math.round((l.barter - 1) * 100)}%`) : null),
          el('div', { class: 'gift-sub' }, `${lot.quantity.toFixed(0)} aboard · ${gradeWord(lot.q ?? 0.5).toLowerCase()}`)),
        qtyInput(ctx.barterGive, l.goodId, Math.min(lot.quantity, l.appetite), `Offer ${good(l.goodId).english}`));
    }),
    mine.length === 0 ? el('p', {}, 'Nothing in the hold they will take.') : null,
    el('div', { class: 'barter-row' },
      el('div', {}, el('div', {}, 'Coin'), el('div', { class: 'gift-sub' }, pay.coin > 1.02 ? `worth about ${Math.round(100 / pay.coin)}% of its face here` : 'taken at its face')),
      el('input', {
        type: 'number', min: '0', max: String(Math.floor(g.crown.gold)), inputmode: 'numeric', value: String(ctx.barterCoin),
        'aria-label': 'Coin',
        onchange: (e: Event) => { ctx.barterCoin = clamp(Math.floor(Number((e.target as HTMLInputElement).value) || 0), 0, Math.floor(g.crown.gold)); setTimeout(() => ctx.render(), 0); },
      })),
  );
  const hisSide = card('His side',
    ...his.map((l) => el('div', { class: 'barter-row' },
      el('div', {},
        el('div', {}, good(l.goodId).english),
        el('div', { class: 'gift-sub' }, `${l.stock.toFixed(0)} to be had · about ${l.rawAsk.toFixed(1)} each in trade goods`)),
      qtyInput(ctx.barterTake, l.goodId, Math.min(l.stock, g.ship.holdFree / good(l.goodId).bulk + (ctx.barterTake.get(l.goodId) ?? 0)), `Take ${good(l.goodId).english}`))),
    his.length === 0 ? el('p', {}, 'He has nothing to trade today.') : null,
  );
  host.append(el('div', { class: 'cols two' }, yourSide, hisSide));
  host.append(el('div', { class: `audience-reading ${v.theirs <= 0 ? '' : seen > 1 ? 'good' : seen > 0.85 ? 'warn' : 'bad'}` },
    el('b', {}, 'Across the cloth'),
    el('span', {}, lean),
    el('span', { class: 'gift-sub' }, `His patience: ${'●'.repeat(Math.max(0, pat.patience))}${'○'.repeat(Math.max(0, 4 - pat.patience))}`)));
  host.append(el('div', { class: 'row' },
    button('Put it to him', () => {
      const res = g.barter(give, ctx.barterCoin, take);
      ctx.notice = { text: res.text, grave: !res.accepted };
      if (res.accepted) { ctx.barterGive.clear(); ctx.barterTake.clear(); ctx.barterCoin = 0; }
      ctx.faceNoise = g.rng.range(-1, 1);
      ctx.render();
    }, { primary: true, disabled: v.theirs <= 0 }),
    button('Get up and walk away', () => {
      ctx.notice = { text: g.walkAway() };
      ctx.render();
    }, { disabled: pat.walked }),
    button('Clear the cloth', () => { ctx.barterGive.clear(); ctx.barterTake.clear(); ctx.barterCoin = 0; ctx.render(); }),
  ));
}
