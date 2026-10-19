import { HOUSES, creditWord, house, kindBlurb, kindName, quinhaoPrice, standingLine, type DebtKind, type House } from '../../economy/finance';
import { portName } from '../../progression/crown';
import type { Game } from '../../game/state';
import { append, button, card, el, fold, kv } from '../dom';
import type { Ctx } from './ctx';
import { regardWord } from './quay';
import { tagLast, verb } from './verb';

/**
 * The Rua Nova.
 *
 * Three instruments, four or five houses, and one screen that has to make the
 * difference between them obvious without a paragraph of explanation, because
 * the whole decision *is* the difference between them. So each card leads
 * with the one sentence that matters — the sea loan dies with the ship, the
 * letra does not, the sixteenths are never repaid — and the number underneath
 * is the price of that sentence.
 */
export function moneySection(ctx: Ctx, host: HTMLElement, g: Game): void {
  const def = g.portHere!;
  const left = el('div', {});
  const right = el('div', {});

  const live = g.finance.live;
  const loans = live.filter((d) => d.kind !== 'quinhao');
  const shares = live.filter((d) => d.kind === 'quinhao');

  // Everybody with money in this voyage, and what each of them is doing to
  // it, on one card. The Casa's arrangement used to be a multiplier nobody
  // could see; it is written down here in figures, because it is in figures.
  const c = g.casa;
  const bias = g.settlementBias;
  const pct = (k: number) => (k === 1 ? 'as reported' : `${k > 1 ? '+' : ''}${Math.round((k - 1) * 100)}%`);
  left.append(card('The Casa da Mina',
    el('div', { class: 'backer' },
      kv('Aires Tinoco, contador', regardWord(c.regard)),
      el('div', { class: 'backer-terms' },
        c.pact ? `His arrangement: your private returns entered generously, for ${c.pactFee ?? 0} cruzados at every settlement. There is a paper.`
          : c.patron ? 'He has decided you are worth protecting, and works your account himself.'
            : c.broke ? 'You went to the King about him. A new clerk keeps your books, and trusts nothing.'
              : c.regard < -0.3 ? 'Every figure exact, and none of them generous.'
                : 'Your account is kept like any other captain\u2019s.'),
      el('div', { class: 'backer-terms' },
        `At settlement: coin ${pct(bias.gold)}, renown ${pct(bias.standing)}.`),
    ),
    g.finance.shareOut > 0
      ? el('p', { style: { fontSize: '13px' } },
        `${Math.round(g.finance.shareOut * 100)}% of everything this voyage lands belongs to the sharers.`)
      : null,
  ));
  tagLast(left, 'money.casa');

  // What is owed, first, because a man walking into a counting house knows
  // what he owes before he knows what he wants.
  right.append(card('Paper outstanding',
    loans.length === 0 && shares.length === 0
      ? el('p', {}, 'Nothing out. Your name is your own and so is the voyage.')
      : el('div', {}, ...loans.map((d) => {
          const h = house(d.house);
          const over = Math.round(g.finance.daysOverdue(d, g.clock.t));
          const due = Math.round(d.owed - d.seized);
          return el('div', { style: { marginBottom: '12px' } },
            kv(`${h.short} — ${kindName(d.kind).toLowerCase()}`, `${due} cruzados`,
              over > 0 ? 'bad' : ''),
            el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)' } },
              over > 0
                ? `${over} days overdue, drawn at ${portName(d.atPort)}.`
                  + (d.kind === 'letra' ? ' It is compounding weekly.' : '')
                : `Due in ${Math.round((d.dueBy - g.clock.t) / 86400)} days, drawn at ${portName(d.atPort)}.`),
            el('div', { class: 'row', style: { marginTop: '4px' } },
              button(`Pay ${due}`, () => {
                ctx.notice = { text: g.repayDebt(d.id) };
                ctx.render();
              }, { disabled: g.crown.gold + g.creditFree < 1 }),
              button('Pay half', () => {
                ctx.notice = { text: g.repayDebt(d.id, Math.round(due / 2)) };
                ctx.render();
              }, { disabled: g.crown.gold + g.creditFree < 1 || due < 4 }),
            ),
          );
        }),
        ...shares.map((d) => {
          const h = house(d.house);
          return el('div', { style: { marginBottom: '10px' } },
            kv(`${h.short} — ${d.sixteenths}/16 of the voyage`,
              `${(d.share * 100).toFixed(0)}% of everything landed`),
            el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)' } },
              `He put in ${Math.round(d.principal)} and has taken ${Math.round(d.drawn)} so far. `
              + `Discharged in ${Math.max(0, Math.round((d.dueBy - g.clock.t) / 86400))} days.`),
          );
        }),
      ),
    g.finance.shareOut > 0
      ? el('p', { class: 'notice' },
          `${(g.finance.shareOut * 100).toFixed(0)} per cent of every cargo you land and every `
          + 'settlement you are paid goes to the men holding sixteenths, off the top, before you '
          + 'see it.')
      : null,
  ));
  tagLast(right, 'money.paper');

  right.append(fold('The Casa’s own credit',
    `${g.creditFree.toFixed(0)} left to draw${g.crown.debt > 0 ? `, ${g.crown.debt.toFixed(0)} drawn` : ''}`, false,
    kv('Left to draw', `${g.creditFree.toFixed(0)} cruzados`),
    g.crown.debt > 0 ? kv('Already drawn', `${g.crown.debt.toFixed(0)} cruzados`) : null,
    el('p', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: '1.55' } },
      'Not the same thing as the street below. This is an advance against the commission you '
      + 'are already carrying — no premium, no date, and it comes straight off what the '
      + 'Casa pays you when the voyage is reckoned. It is small, it is only ever as large as '
      + 'the commission, and it is gone the moment that is discharged. The houses lend against '
      + 'you, which is why they can lend so much more.'),
  ));
  tagLast(right, 'money.casa-credit');

  right.append(fold('Your name on this street', '', false,
    ...HOUSES.map((h) => el('div', { style: { marginBottom: '5px' } },
      kv(h.short, creditWord(g.finance.credit[h.id]),
        g.finance.credit[h.id] < h.floor ? 'bad' : ''))),
    el('p', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '8px' } },
      `Borrowed in a career: ${Math.round(g.finance.borrowed)}. Repaid: `
      + `${Math.round(g.finance.repaid)}. Taken by sharers: ${Math.round(g.finance.sharedOut)}.`
      + (g.finance.defaults > 0 ? ` Bad debts against your name: ${g.finance.defaults}.` : '')),
  ));
  tagLast(right, 'money.street');

  // And the offers. One card per house that has a man in this town.
  const here = HOUSES.filter((h) => g.houseReaches(h, def));
  const offers = verb('money.house-offers', el('div', {}));
  left.append(offers);
  if (here.length === 0) {
    offers.append(card('No money in this town',
      el('p', {}, 'The Rua Nova reaches a long way and it does not reach here. Whatever you are '
        + 'going to do next, you are going to do it on what is in the ship.')));
  } else {
    offers.append(el('p', { class: 'fit-blurb', style: { marginBottom: '10px' } },
      'A sea loan is insurance with a loan’s face on it: it costs three times what an '
      + 'ordinary bill costs, and if she never comes home nobody ever asks you for it. A letra '
      + 'is cheap and is owed by you whatever happens to her. Sixteenths are never repaid at '
      + 'all — they simply take their share of everything you land, for as long as the '
      + 'voyage runs.'));
    for (const h of here) offers.append(houseCard(ctx, g, h));
  }

  host.append(el('div', { class: 'cols two' }, left, right));
}

export function houseCard(ctx: Ctx, g: Game, h: House): HTMLElement {
  const credit = g.finance.credit[h.id];
  const body: (Node | null)[] = [
    el('p', { class: 'flavour' }, h.blurb),
    el('p', { style: { fontSize: '13px' } }, standingLine(h, credit)),
  ];

  // A house that will not deal at all says so once. Listing its instruments
  // underneath and repeating the same refusal against each of them read as a
  // bug: the same sentence three times in one card.
  const owed = g.finance.live.filter((d) => d.house === h.id && !d.settled).reduce((a, d) => a + d.owed, 0);
  // Each house folded to a line: what you owe it, or whether it will deal.
  // Six houses' worth of instruments laid open was most of this page.
  const summary = owed > 0 ? `${Math.round(owed)} owed` : credit < h.floor ? 'will not deal with you' : 'will lend';
  if (credit < h.floor) return fold(h.name, summary, false, ...body);

  for (const kind of h.writes) {
    const t = g.termsFor(h, kind as DebtKind);
    if (kind === 'quinhao') {
      const held = g.finance.live.reduce((s, d) => s + d.sixteenths, 0);
      const offers = [2, 4, 6].filter((n) => n + held <= 12);
      body.push(el('div', { style: { marginTop: '10px' } },
        kv(kindName('quinhao'), t.barred ? '—' : 'no repayment, ever'),
        el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: '1.5' } },
          t.barred ?? kindBlurb('quinhao')),
        t.barred ? null : el('div', { class: 'row', style: { marginTop: '5px' } },
          ...offers.map((n) => button(
            `Sell ${n}/16 for ${quinhaoAsk(g, h, n)}`,
            () => { ctx.notice = { text: g.sellSixteenths(h.id, n) }; ctx.render(); },
          )),
        ),
      ));
      continue;
    }
    const sums = [0.25, 0.5, 1].map((f) => Math.round(t.max * f)).filter((x) => x >= 25);
    body.push(el('div', { style: { marginTop: '10px' } },
      kv(kindName(kind as DebtKind),
        t.barred ? '—' : `${(t.rate * 100).toFixed(0)}% over ${t.days} days`),
      el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: '1.5' } },
        t.barred ?? kindBlurb(kind as DebtKind)),
      t.barred ? null : el('div', { class: 'row', style: { marginTop: '5px' } },
        ...sums.map((sum) => button(
          `${sum} → repay ${Math.round(sum * (1 + t.rate))}`,
          () => { ctx.notice = { text: g.borrow(h.id, kind as DebtKind, sum) }; ctx.render(); },
        )),
      ),
    ));
  }

  return fold(h.name, summary, owed > 0, ...body);
}

/** What a house would pay for n sixteenths of the voyage in hand. */
function quinhaoAsk(g: Game, h: House, n: number): number {
  return quinhaoPrice(h, n, g.voyageValue(), g.finance.credit[h.id]);
}
