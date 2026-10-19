import { good } from '../../economy/goods';
import { SLOTS, UPGRADE_BY_ID, describeEffects, nodeStatus, ordnanceResale, slotFittings, type Upgrade } from '../../ship/upgrades';
import { hullClass } from '../../ship/hull';
import { shipyardCard } from '../shipyard';
import { ALMANACS, ALTITUDE_INSTRUMENTS, COMPASSES, SPEED_INSTRUMENTS } from '../../navigation/instruments';
import type { Game } from '../../game/state';
import { doRefit, fitFitting, quoteRefit, refitPlace, removeFitting, type RefitJob } from '../../game/refit';
import { append, button, card, el, fold, foldCard, kv } from '../dom';
import type { Ctx } from './ctx';

export function renderYard(ctx: Ctx, host: HTMLElement, g: Game): void {
  const def = g.portHere!;
  if (def.refit < 0.5) {
    host.append(el('div', { class: 'notice grave' },
      'There is no yard here worth the name. You can careen on a beach if you must, and mend what the spares in the hold will mend, and nothing more.'));
  }

  const left = el('div', {});
  const place = refitPlace(g);
  const jobRow = (job: RefitJob, label: string) => {
    const q = quoteRefit(g, job);
    return el('div', { style: { padding: '6px 0', borderBottom: '1px solid rgba(90,74,55,.12)' } },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline' } },
        el('b', {}, label),
        q.ok
          ? button(`${q.gold} cr \u00b7 ${q.days}d`, () => {
              const r = doRefit(g, job);
              ctx.notice = { text: r.text, grave: !r.ok };
              ctx.render();
            }, { disabled: g.crown.gold < q.gold, title: q.does })
          : el('em', { class: 'sys-why' }, q.days ? '' : '\u2014')),
      el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '3px', lineHeight: '1.5' } },
        q.ok
          ? `${q.does} ${q.days} days${q.fromHold > 0 ? `, ${(q.fromHold * 100).toFixed(0)}% of a set of spares from the hold` : ''}${q.bought > 0.001 ? `, ${(q.bought * 100).toFixed(0)}% bought here` : ''}.`
          : q.why));
  };
  left.append(card('The yard\u2019s work',
    kv('Hull', `${(g.ship.condition.hull * 100).toFixed(0)}%`),
    kv('Fouling', `${(g.ship.condition.fouling * 100).toFixed(0)}%`),
    kv('Spares in the hold', `${((g.crew.spares ?? 0) * 100).toFixed(0)}% of a set`),
    jobRow('careen', 'Careen and breame'),
    jobRow('hull', 'Work the hull'),
    jobRow('rig', 'Re-mast and re-canvas'),
    el('p', { style: { fontSize: '12.5px', marginTop: '8px' } },
      'Parts come out of the spares in the hold first; what is short is bought here. The work takes days, and she eats nothing from the sea stores while she lies alongside.'),
  ));

  // Six slots, one fitting in each. See ship/upgrades.
  const yard = place.kind === 'yard' ? place.level : 0;
  const effectLines = (u: Upgrade) => {
    const d = describeEffects(u.effects);
    return el('div', { class: 'fit-effects' },
      ...d.good.map((t) => el('span', { class: 'fit-good' }, t)),
      ...d.bad.map((t) => el('span', { class: 'fit-bad' }, t)),
      u.tons > 0 ? el('span', { class: 'fit-bad' }, `${u.tons} t`) : null,
      el('span', { class: 'fit-bad' }, u.price),
    );
  };
  const node = (u: Upgrade) => {
    const st = nodeStatus(u, g.ship.upgrades, g.ship.hullId, g.crown.lifetimeStanding, yard);
    return el('div', { class: `sys-node ${st.state}`, title: u.blurb },
      el('div', { class: 'fit-title' },
        el('b', {}, u.english), el('span', {}, u.name),
        st.state === 'built'
          ? el('em', { class: 'sys-built' }, 'fitted')
          : st.state === 'open'
            ? button(`${u.cost} cr \u00b7 ${u.days}d`, () => {
                const r = fitFitting(g, u.id);
                ctx.notice = { text: r.text, grave: !r.ok };
                ctx.render();
              }, {
                disabled: g.crown.gold < u.cost,
                title: st.replaces.length ? `Replaces ${st.replaces.map((id) => UPGRADE_BY_ID.get(id)?.english).join(', ')}` : u.blurb,
              })
            : el('em', { class: 'sys-why' }, st.why),
      ),
      effectLines(u),
    );
  };
  const fx = g.ship.effects;
  const right = el('div', {});
  right.append(card(`Her fittings \u2014 the yard here can do ${['nothing', 'the simple work', 'a real refit', 'anything'][yard]}`,
    el('div', { class: 'sys-profile' },
      el('span', {}, `Points ${Math.round(g.noGoAngle)}\u00b0 off the wind`),
      el('span', {}, `Canvas ${Math.round(fx.sailArea * 100)}%`),
      el('span', {}, `Strength ${Math.round(fx.strength * 100)}%`),
      el('span', {}, `Hold ${g.ship.holdCapacity.toFixed(0)} t`),
      el('span', {}, `Fittings weigh ${fx.tons} t`),
      fx.pieces ? el('span', {}, `${fx.pieces} pieces of ordnance`) : null),
    el('p', { style: { fontSize: '13px' } },
      'One fitting to a slot, each with its price in tons, wear or the temper of the company. Taking another out of the same slot replaces it.'),
  ));
  for (const slot of SLOTS) {
    const options = slotFittings(slot.id).filter((u) => !u.hulls || u.hulls.includes(g.ship.hullId));
    const fitted = options.find((u) => g.ship.upgrades.includes(u.id));
    right.append(fold(slot.english,
      fitted ? fitted.english : 'nothing fitted',
      false,
      el('p', { class: 'fit-blurb' }, slot.blurb),
      ...options.map(node),
      fitted && yard >= 1
        ? button(slot.id === 'ordnance'
            ? `Sell the ordnance \u2014 ${ordnanceResale(fitted, def)} cr`
            : 'Take it out', () => {
              const r = removeFitting(g, fitted.id);
              ctx.notice = { text: r.text, grave: !r.ok };
              ctx.render();
            })
        : null,
    ));
  }

  // A ship to your own lines, at the Ribeira: folded until wanted, open
  // while one is on the stocks.
  if (def.id === 'lisboa') {
    left.append(fold('The Ribeira das Naus',
      g.building ? 'a ship of yours on the stocks' : 'a ship built to your own lines',
      !!g.building || ctx.ribeiraOpen,
      shipyardCard(g, (text, grave) => { ctx.ribeiraOpen = true; ctx.notice = { text, grave }; ctx.render(); })));
  }

  // A larger ship, once the Crown thinks you are worth one.
  const hulls = g.hullsForSale().filter((h) => h.id !== g.ship.hullId);
  if (def.id === 'lisboa' && hulls.length > 0) {
    const tradeIn = g.tradeInValue();
    const tons = g.ship.cargoTons;
    left.append(fold('Ships lying in the river', `${hulls.length} for sale, ${tradeIn} allowed for yours`, false,
      el('p', { class: 'quote' },
        `The yard will allow ${tradeIn} cruzados against the ${hullClass(g.ship.hullId).name} `
        + 'and her hull and keel work. Her rig, stores, quarters, instruments and arms come across '
        + 'into the new ship if it can take them, at half what they cost to fit.'),
      el('ul', { class: 'list' }, ...hulls.map((h) => {
        const price = Math.max(0, h.cost - tradeIn) + g.carryCost(h.id);
        const tooFull = tons > h.hold + 0.001;
        return el('li', {},
          el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline' } },
            el('span', {}, `${h.name} — ${h.tons} tonéis, ${h.hold}t hold`),
            button(price > 0 ? `${price} cruzados` : 'no more to pay', () => buyShip(ctx, g, h.id), {
              disabled: g.crown.gold + g.creditFree < price || tooFull,
              title: tooFull
                ? `She has ${tons.toFixed(1)} tons in her and this one holds ${h.hold}.`
                : `${h.cost} less ${tradeIn} allowed for the old ship`,
            }),
          ),
          el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '4px', lineHeight: '1.55' } }, h.blurb),
          tooFull
            ? el('div', { style: { fontSize: '12.5px', color: 'var(--warn)', marginTop: '3px' } },
                `Your hold has ${tons.toFixed(1)} tons in it and hers holds ${h.hold}. Sell down first.`)
            : null,
        );
      })),
    ));
  }

  // Instruments.
  left.append(foldCard(instrumentCard(ctx, g), 'what is aboard, and what may be bought'));

  host.append(el('div', { class: 'cols two' }, left, right));
}

export function instrumentCard(ctx: Ctx, g: Game): HTMLElement {
  const rows: Node[] = [];
  const standing = g.crown.lifetimeStanding;

  const section = (label: string, items: { id: string; name: string; cost: number; standing: number; blurb: string }[], current: string, apply: (id: string) => void, note?: Node | null) => {
    rows.push(el('div', { style: { fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginTop: '11px', marginBottom: '5px' } }, label));
    if (note) rows.push(note);
    for (const it of items) {
      const owned = current === it.id;
      const locked = it.standing > standing;
      rows.push(el('div', { style: { padding: '5px 0', opacity: locked ? '0.45' : '1' } },
        el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline' } },
          el('span', {}, it.name),
          owned ? el('span', { class: 'tag good' }, 'aboard')
            : button(locked ? `needs ${it.standing} renown` : `${it.cost} cr`, () => {
                if (g.crown.gold < it.cost) { ctx.notice = { text: 'Not enough in the purse.', grave: true }; ctx.render(); return; }
                g.crown.gold -= it.cost;
                apply(it.id);
                ctx.notice = { text: `${it.name} taken aboard.` };
                ctx.render();
              }, { disabled: locked || g.crown.gold < it.cost }),
        ),
        el('div', { style: { fontSize: '12px', color: 'var(--ink-soft)', marginTop: '3px', lineHeight: '1.5' } }, it.blurb),
      ));
    }
  };

  section('For altitudes', ALTITUDE_INSTRUMENTS, g.nav.kit.altitude, (id) => { g.nav.kit.altitude = id; });
  // Why there are two kinds of book, said at the counter.
  //
  // A rule for the pole star and a table of solar declination are different
  // things and were different books, and a captain who does not know that
  // sails south with the wrong one — the pole star sets astern of him at the
  // line and he loses his latitude altogether, which is the single worst
  // thing that can happen to a voyage in this game.
  section('Tables', ALMANACS, g.nav.kit.almanac, (id) => { g.nav.kit.almanac = id; },
    el('p', {
      class: g.nav.almanac.solarError === null ? 'notice' : '',
      style: { fontSize: '12.5px', lineHeight: '1.55', marginBottom: '7px' },
    },
    g.nav.almanac.solarError === null
      ? 'You carry a rule for the pole star and no table of the sun, so a meridian '
        + 'altitude is only a number to you. That is enough while the pole star is up — '
        + 'but it sets astern of you at the equator and does not come back, and south of '
        + 'the line a ship without solar tables has no latitude at all.'
      : g.nav.almanac.southern
        ? 'Your tables give you the sun as well as the pole star, north of the line and '
          + 'south of it.'
        : 'Your tables give you the sun, but they stop at the equator. South of the line '
          + 'they are no more use than the pole star is.'));
  section('For the log', SPEED_INSTRUMENTS, g.nav.kit.speed, (id) => { g.nav.kit.speed = id; });
  section('Compasses', COMPASSES.map((c) => ({ ...c, standing: 0 })), g.nav.kit.compass, (id) => { g.nav.kit.compass = id; });

  return card('Instruments', ...rows);
}

export function buyShip(ctx: Ctx, g: Game, hullId: string): void {
  const refused = g.shiftFlag(hullId);
  if (refused) { ctx.notice = { text: refused, grave: true }; ctx.render(); return; }
  ctx.notice = { text: `She is yours. ${hullClass(hullId).blurb}` };
  ctx.render();
}
