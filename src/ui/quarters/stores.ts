import { clamp } from '../../core/math';
import { postureOf } from '../../progression/network';
import type { Game } from '../../game/state';
import { MAX_VICTUAL_DAYS, MAX_WATER_DAYS, STORE_TONS, fitPlan, loadPlan, planCost, planOf, planTons, recommendedPlan, roomForStores, sparesSetTons, type StoresPlan } from '../../game/stores';
import { button, card, el, kv } from '../dom';
import type { Ctx } from './ctx';
import { verb } from './verb';

export function storesSection(ctx: Ctx, host: HTMLElement, g: Game): void {
  const def = g.portHere!;
  const house = g.factoryHere;
  const discount = house && postureOf(house) === 'stores' ? 0.5 : 1;
  const fx = g.ship.effects;
  const hold = g.ship.holdCapacity;
  const complement = g.crew.complement;
  if (!ctx.storesPlan) ctx.storesPlan = planOf(g.crew);
  const plan = ctx.storesPlan;

  const left = el('div', {});
  const summary = el('div', {});
  const goBtn = button('Load', () => {}, { primary: true });
  const rows: { key: keyof StoresPlan; label: string; unit: string; min: number; max: number; step: number; tons: (v: number) => number; input?: HTMLInputElement; out?: HTMLElement }[] = [
    { key: 'water', label: 'Water', unit: 'days', min: 0, max: MAX_WATER_DAYS + fx.water, step: 5,
      tons: (v) => v * STORE_TONS.water * complement * fx.storage },
    { key: 'victuals', label: 'Victuals', unit: 'days', min: 0, max: MAX_VICTUAL_DAYS, step: 5,
      tons: (v) => v * (STORE_TONS.biscuit + STORE_TONS.saltMeat * 0.9 + STORE_TONS.wine * 0.7) * complement * fx.storage },
    { key: 'spares', label: 'Spares', unit: '%', min: 0, max: 100, step: 5,
      tons: (v) => (v / 100) * sparesSetTons(hold) },
  ];
  const valueOf = (key: keyof StoresPlan) => (key === 'spares' ? Math.round(plan.spares * 100) : plan[key]);

  const refresh = () => {
    const fit = fitPlan(g, plan);
    let clamped = false;
    for (const r of rows) {
      const want = r.key === 'spares' ? plan.spares : plan[r.key];
      if (fit[r.key] < want - 1e-6) clamped = true;
    }
    Object.assign(plan, fit);
    const total = planTons(plan, complement, hold, fx.storage);
    const cost = Math.round(planCost(def, g, plan) * discount);
    const room = roomForStores(g);
    for (const r of rows) {
      const v = valueOf(r.key);
      if (r.input && Number(r.input.value) !== v) r.input.value = String(v);
      if (r.out) r.out.textContent = `${v}${r.unit === '%' ? '%' : ` ${r.unit}`} · ${r.tons(v).toFixed(1)} t`;
    }
    summary.textContent = `${total.toFixed(1)} t of stores of ${room.toFixed(1)} t the cargo leaves free`
      + `${clamped ? ' — the hold is full' : ''} · ${cost} cruzados`;
    (goBtn as HTMLButtonElement).disabled = cost > 0 && g.crown.gold + g.creditFree < cost;
    (goBtn as HTMLButtonElement).textContent = cost > 0 ? `Load for ${cost} cruzados` : 'Load';
  };
  const sliders = rows.map((r) => {
    const input = el('input', {
      type: 'range', min: String(r.min), max: String(r.max), step: String(r.step), value: String(valueOf(r.key)),
      oninput: (e: Event) => {
        const v = Number((e.target as HTMLInputElement).value);
        if (r.key === 'spares') plan.spares = v / 100; else plan[r.key] = v;
        refresh();
      },
    }) as HTMLInputElement;
    const out = el('span', { class: 'stores-out' });
    r.input = input; r.out = out;
    return el('div', { class: 'stores-row', style: { padding: '6px 0' } },
      el('div', { style: { display: 'flex', justifyContent: 'space-between' } }, el('b', {}, r.label), out),
      input,
    );
  });
  (goBtn as HTMLButtonElement).onclick = () => {
    const cost = Math.round(planCost(def, g, plan) * discount);
    // Draw on the Casa if the purse is short, as the market does: water and
    // victuals were always to be had on the Crown's account.
    if (g.crown.gold < cost) g.drawCredit(cost);
    if (g.crown.gold < cost) {
      ctx.notice = { text: 'Not enough in the purse, and nothing left to draw on. Sell something out of the hold.', grave: true };
      ctx.render();
      return;
    }
    const days = Math.max(plan.water, plan.victuals);
    const got = loadPlan(g, plan, discount);
    g.logEvent('note', `Loaded stores at ${def.name}: ${got.plan.water} days of water, ${got.plan.victuals} of victuals, ${(got.plan.spares * 100).toFixed(0)}% of a set of spares. ${got.cost} cruzados.`);
    g.clock.t += 86400 * clamp(days / 90, 0.5, 3);
    ctx.storesPlan = null;
    ctx.notice = { text: `Stores aboard: ${got.tons.toFixed(1)} tons.` };
    ctx.render();
  };

  const rec = recommendedPlan(g);
  const last = g.crew.lastStores;
  left.append(verb('stores.loading', card('Loading — before she weighs',
    el('p', {}, def.refit > 0.6
      ? 'There is good water here, and a market for stock and greens.'
      : def.refit > 0.3
        ? 'Water can be had, though it is a labour to get it aboard, and there is not much else.'
        : 'Little enough to be had here. Take what you can and do not count on it.'),
    ...sliders,
    summary,
    el('div', { style: { display: 'flex', gap: '7px', flexWrap: 'wrap', marginTop: '9px' } },
      button('Pilot\u2019s advice', () => { Object.assign(plan, rec); ctx.render(); },
        { title: `${rec.water} days of water, ${rec.victuals} of victuals, ${(rec.spares * 100).toFixed(0)}% spares, for the leg as the pilot reckons it` }),
      last ? button('Same as last leg', () => { Object.assign(plan, fitPlan(g, last)); ctx.render(); }) : null,
      goBtn),
  )));
  refresh();

  const right = el('div', {});
  right.append(verb('stores.aboard', card('Aboard now',
    kv('Water', `${g.crew.provisions.water.toFixed(0)} days`),
    kv('Victuals', `${Math.min(g.crew.provisions.biscuit, g.crew.provisions.saltMeat / 0.9).toFixed(0)} days`),
    kv('Fresh provisions', `${g.crew.provisions.fresh.toFixed(0)} days`),
    kv('Spares', `${((g.crew.spares ?? 0) * 100).toFixed(0)}% of a set`),
    kv('Stores in the hold', `${g.ship.storesTons.toFixed(1)} t of ${hold.toFixed(0)}`),
    kv('Days since fresh food', `${g.crew.daysWithoutFresh.toFixed(0)}`),
  )));
  host.append(el('div', { class: 'cols two' }, left, right));
}
