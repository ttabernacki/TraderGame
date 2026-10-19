import { good, unitOf } from '../../economy/goods';
import { type PortDef } from '../../world/ports';
import { civicBlock, houseHead, worksBlock } from '../networkView';
import { footingOf, footingWord, postureOf } from '../../progression/network';
import { loyaltyWord, officerTitle } from '../../progression/officers';
import { type House } from '../../economy/finance';
import { WORKS, buyable, capacityOf, residentPrice, stockTons, stockValue, type Feitoria } from '../../progression/feitoria';
import type { Game } from '../../game/state';
import { append, button, card, el, kv, plural } from '../dom';
import type { Ctx } from './ctx';
import { verb } from './verb';

/**
 * The station.
 *
 * Two completely different screens under one tab, because they are two
 * completely different moments: the one where you are deciding whether to
 * leave a man of yours on this beach for years, and the one where you are
 * standing in his store reading his books. The first wants the price said
 * plainly. The second wants the shed, the chest and the trouble in that
 * order, because that is the order a captain would ask about them.
 */
export function houseSection(ctx: Ctx, host: HTMLElement, g: Game): void {
  const def = g.portHere!;
  const f = g.factoryHere;
  const left = el('div', {});
  const right = el('div', {});

  if (!f) {
    const why = g.canFoundFactory(def);
    const spare = g.crew.count - g.ship.baseHull.crewMin;
    const men = g.crew.officers.filter((o) => o.alive && !o.ashoreAt);
    left.append(verb('station.found', card('A House here',
      el('p', { class: 'flavour' },
        'A walled shed, a clerk, six men and an agreement with whoever owns the beach. It is '
        + 'not a colony and it is not a conquest; it is a man of yours who is here all year '
        + 'buying at the price a resident pays, so that when you come back the cargo is '
        + 'already on the floor.'),
      kv('It will cost', `${g.foundingCost(def)} cruzados and six men`),
      g.foundingCost(def) > 320 ? el('p', { class: 'gift-sub' }, 'Ground granted at an audience halves the price.') : null,
      kv('Men she can spare', `${Math.max(0, spare)}`, spare < 6 ? 'bad' : ''),
      why ? el('p', { class: 'notice grave' }, why) : null,
    )));

    if (!why) {
      left.append(verb('station.who', card('Who is to have it',
        el('p', { style: { fontSize: '13px' } },
          'He comes off the muster and out of his berth for years, and she will work worse '
          + 'without him from the moment the boat pulls back. What he is decides what the '
          + 'House is: an able man fills the shed, a loyal one hands you the books, and '
          + 'those are not the same virtue.'),
        ...men.map((o) => el('div', {
          style: {
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: '10px', padding: '6px 0',
          },
        },
          el('div', {},
            el('div', {}, `${o.name} — ${officerTitle(o).toLowerCase()}`),
            el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)' } },
              `Ability ${(o.ability * 100).toFixed(0)} · ${loyaltyWord(o.loyalty)}`
              + (o.bonded ? ' · bonded to you' : '')),
          ),
          button('Leave him here', () => {
            ctx.notice = { text: g.foundFactory(o.id, ctx.stationOrder) };
            ctx.show('court', 'house');
            ctx.render();
          }, { primary: true }),
        )),
        men.length === 0 ? el('p', { class: 'bad' }, 'There is nobody aft to leave.') : null,
      )));

      right.append(verb('station.order', orderCard(ctx, g, def, null)));
    }

    host.append(el('div', { class: 'cols two' }, left, right));
    return;
  }

  // And the station as it stands.
  const wanted = g.garrisonWantedAt(f);
  left.append(verb('station.store', card(`${f.factor}’s store`,
    kv('In the shed', `${stockTons(f).toFixed(1)} of ${capacityOf(f).toFixed(0)} tons`
      + `, ${g.shedRoom(f).toFixed(1)} free`),
    kv('Worth at Lisbon', `${stockValue(f)} cruzados`),
    kv('In the chest', `${Math.round(f.chest)} cruzados`, f.chest < 40 ? 'bad' : ''),
    kv('Men in it', `${f.garrison} of ${wanted} the works want`, f.garrison < wanted ? 'bad' : ''),
    kv('Footing', footingWord(footingOf(f)), footingOf(f) < 0.4 ? 'bad' : footingOf(f) < 0.55 ? 'warn' : ''),
    f.chest < 40
      ? el('p', { class: 'notice' },
          'He has nothing to buy with. A factor with an empty chest is a man sitting in a shed '
          + 'for a year watching the trade go past him.')
      : null,
    f.trouble > 0.55
      ? el('p', { class: 'notice grave' },
          'This will not survive another long absence. A ship in the road, a present to the '
          + 'town, or men and walls — one of the three, and soon.')
      : null,
  )));

  // The reward, and the reason the whole thing exists.
  const stock = Object.entries(f.stock).filter(([, q]) => q >= 1);
  left.append(verb('station.take-aboard', card('Take it aboard',
    stock.length === 0
      ? el('p', {}, 'The shed is empty. Whatever he has been doing, it has not been buying.')
      : el('div', {}, ...stock.map(([id, q]) => {
          const gd = good(id);
          const per = (f.paid[id] ?? gd.lisbon * 0.2) * 1.08;
          const fits = Math.floor(Math.min(q, g.ship.holdFree / Math.max(gd.bulk, 1e-6)));
          return el('div', {
            style: {
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: '10px', padding: '6px 0',
            },
          },
            el('div', {},
              el('div', {}, `${gd.name} — ${q.toFixed(0)} ${unitOf(gd, q)}`),
              el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)' } },
                `${per.toFixed(1)} the ${gd.unit} with his commission, against ${gd.lisbon} at Lisbon`),
            ),
            button(fits >= 1 ? `Take ${fits}` : 'No room', () => {
              ctx.notice = { text: g.loadFromShed(id, fits) };
              ctx.render();
            }, { disabled: fits < 1, primary: fits >= 1 }),
          );
        })),
    el('p', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '8px' } },
      'Bought in small parcels all year at what a resident pays, and it does not glut the quay '
      + 'on the way into your hold, because it was bought a barrel at a time by somebody who '
      + 'lives here.'),
  )));

  right.append(verb('station.head', card('What the House does', ...houseHead(f, () => ctx.render()))));
  right.append(verb('station.works', card('Works', worksBlock(g, f, () => ctx.render(), (t) => { ctx.notice = { text: t }; }))));
  right.append(verb('station.civic', card('The town', civicBlock(g, f.portId, () => ctx.render(), (t) => { ctx.notice = { text: t }; }))));
  if (postureOf(f) === 'buy') right.append(verb('station.order', orderCard(ctx, g, def, f)));

  right.append(verb('station.chest', card('The chest',
    el('div', { class: 'row' },
      ...[100, 250, 600].map((n) => button(`Put in ${n}`, () => {
        ctx.notice = { text: g.fundChest(n) };
        ctx.render();
      }, { disabled: g.crown.gold + g.creditFree < n })),
    ),
    el('div', { class: 'row', style: { marginTop: '6px' } },
      button(`Draw out ${Math.floor(f.chest)}`, () => {
        ctx.notice = { text: g.drawChest() };
        ctx.render();
      }, { disabled: f.chest < 1 }),
    ),
    el('p', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '7px' } },
      'What is in the chest is what he can buy with, and what he buys with it is what is '
      + 'waiting for you next time. Emptying it is taking your profit now instead of next year.'),
  )));

  right.append(verb('station.build', card('Build',
    ...WORKS.map((w) => {
      const has = f.works.includes(w.id);
      return el('div', { style: { padding: '6px 0' } },
        el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } },
          el('span', {}, `${w.name} — ${w.english.toLowerCase()}`),
          has
            ? el('em', { style: { color: 'var(--ink-soft)', fontSize: '12.5px' } }, 'built')
            : button(`${w.cost}${w.hands > 0 ? ` \u00b7 ${w.hands} ${plural(w.hands, 'man', 'men')}` : ''}`, () => {
                ctx.notice = { text: g.buildWork(w.id) };
                ctx.render();
              }, { disabled: g.crown.gold + g.creditFree < w.cost }),
        ),
        el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: '1.5' } },
          w.blurb),
      );
    }),
  )));

  right.append(verb('station.garrison', card('The garrison',
    el('div', { class: 'row' },
      ...[2, 5, 10].map((n) => button(`Leave ${n} more`, () => {
        ctx.notice = { text: g.reinforceFactory(n) };
        ctx.render();
      }, { disabled: g.crew.count - g.ship.baseHull.crewMin < n })),
      button('Shut it up and bring them away', () => {
        ctx.notice = {
          text: g.closeFactory(f, 'Given up while there was still something in it to bring away.'),
          grave: true,
        };
        ctx.show('waterfront', 'quay');
        ctx.render();
      }),
    ),
  )));

  host.append(el('div', { class: 'cols two' }, left, right));
}

/**
 * What the factor is to buy while you are elsewhere.
 *
 * It was a list of every good the town made with an Order button on each and
 * a paragraph explaining weights. There is really one decision in it: a shed
 * full of everything, or a corner of the hold of the one dear thing.
 */
export function orderCard(ctx: Ctx, g: Game, def: PortDef, f: Feitoria | null): HTMLElement {
  const options = buyable(def);
  const current: string[] = f ? f.buying : ctx.stationOrder;
  const dearest = [...options].sort((a, b) => good(b).lisbon - good(a).lisbon)[0];
  const set = (next: string[]) => {
    if (f) ctx.notice = { text: g.setStandingOrder(next) };
    else ctx.stationOrder = next;
    ctx.render();
  };
  if (!dearest) {
    return card('What he buys', el('p', {}, 'This place produces nothing anybody has a name for.'));
  }
  const focused = current.length === 1 && current[0] === dearest;
  const pick = (on: boolean, title: string, detail: string, next: string[]) =>
    el('button', {
      class: `shore-action${on ? ' done' : ''}`, type: 'button',
      onclick: () => set(next),
    }, el('b', {}, `${on ? '\u2713 ' : ''}${title}`), el('span', {}, detail));
  return card('What he buys',
    el('p', { style: { fontSize: '13px' } },
      'He puts the same money through the town either way. What changes is how much of your '
      + 'hold it takes to carry home.'),
    el('div', { class: 'shore-actions' },
      pick(!focused, 'Whatever the town offers',
        'A full shed, and half your hold to bring it away.', []),
      pick(focused, `Only ${good(dearest).english.toLowerCase()}`,
        `About ${residentPrice(dearest, def).toFixed(1)} here and ${good(dearest).lisbon} at Lisbon. `
        + 'The same money in a corner of the hold.', [dearest]),
    ),
  );
}
