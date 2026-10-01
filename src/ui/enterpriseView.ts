import { HULL_BY_ID } from '../ship/hull';
import { GOOD_BY_ID } from '../economy/goods';
import { PORTS, type PortDef } from '../world/ports';
import {
  canFound, destinationsFor, dismiss, estimate, found, forSale, hire, hireable, kindOf, legDays,
  maxBusinesses, monthlyValue, outputUnits, priceOf, redirect, sell, upkeepOf, upgrade, upgradeCost,
  voyageFee, warehouseCap, type Enterprise,
} from '../progression/enterprise';
import type { Game } from '../game/state';
import { button, card, el, kv } from './dom';

const portName = (id: string): string => PORTS.find((p) => p.id === id)?.name ?? id;
const hullPick = new Map<number, string>();
const confirmSell = new Set<number>();

/** The state of the ship, in a sentence. */
function shipLine(e: Enterprise): string {
  const t = e.trader;
  if (!t) return 'No vessel on contract.';
  const h = HULL_BY_ID.get(t.hullId)!;
  const base = `The ${h.english.toLowerCase()} ${t.name}, for ${portName(t.toPort)}`;
  if (t.phase === 'out') return `${base}: at sea with ${Math.round(t.load)} ${GOOD_BY_ID.get(e.goodId)!.unit}s.`;
  if (t.phase === 'back') return `${base}: homeward, ${t.proceeds > 0 ? 'with the money' : 'empty'}.`;
  return `${base}: ${t.idleNote ?? 'in the roads, waiting for a load.'}`;
}

/** What it costs and what it fetches, in a row of buttons the owner can choose between. */
function routes(g: Game, e: Enterprise, hullId: string, onPick: (toPort: string) => void, rerender: () => void): HTMLElement {
  const est = destinationsFor(g, e, hullId);
  if (est.length === 0) {
    return el('p', { class: 'flavour' }, 'No port you know would pay for it, at the freight that vessel charges. Visit more ports, or send it from a place nearer a market.');
  }
  return el('div', {}, ...est.map((x) => el('div', { class: 'row', style: { alignItems: 'center', gap: '8px', margin: '3px 0' } },
    button(`${portName(x.toPort)}`, () => { onPick(x.toPort); rerender(); }, { ghost: true }),
    el('span', { style: { fontSize: '13px' } },
      `${x.days} days round, about ${x.unit.toFixed(1)} a unit${x.wanted ? '' : ' (a middleman’s price)'}, ≈ ${x.net} cruzados a voyage`))));
}

/** The management card for one business. */
function enterpriseCard(g: Game, e: Enterprise, rerender: () => void, say: (t: string) => void, here: boolean): HTMLElement {
  const gd = GOOD_BY_ID.get(e.goodId)!;
  const def = PORTS.find((p) => p.id === e.portId)!;
  const up = upgradeCost(g, e);
  const hullId = e.trader?.hullId ?? hullPick.get(e.id) ?? hireable(g)[0];
  const rows: (HTMLElement | null)[] = [
    kv('Making', `${Math.round(outputUnits(e))} ${gd.unit}s of ${gd.english.toLowerCase()} a month`),
    kv('Warehouse', `${Math.round(e.stock)} of ${warehouseCap(e)} ${gd.unit}s${e.ailing > 0 ? ' — short-handed after trouble' : ''}`),
    kv('The business’s own account', `${Math.round(e.cash)} cruzados, wages ${upkeepOf(e)} a month`, e.cash < 0 ? 'warn' : ''),
    kv('Taken so far', `${Math.round(e.earned)} cruzados clear of freight and wages`),
    kv('Vessel', shipLine(e)),
  ];
  if (e.trader?.lastNet !== undefined) rows.push(kv('Her last voyage netted', `${e.trader.lastNet} cruzados`, e.trader.lastNet < 0 ? 'bad' : ''));

  const body: HTMLElement[] = [];
  if (!e.trader) {
    const pick = el('select', {
      'aria-label': 'Vessel', class: 'trade-select',
      onchange: (ev: Event) => { hullPick.set(e.id, (ev.target as HTMLSelectElement).value); rerender(); },
    }, ...hireable(g).map((id) => {
      const h = HULL_BY_ID.get(id)!;
      return el('option', { value: id, selected: id === hullId }, `${h.english} — ${h.hold} tons`);
    }));
    body.push(el('p', { style: { marginTop: '8px' } }, el('b', {}, 'Hire a trading vessel: '), pick));
    body.push(routes(g, e, hullId, (to) => say(hire(g, e, hullId, to)), rerender));
  } else {
    body.push(el('p', { style: { marginTop: '8px' } }, el('b', {}, 'Send her next to:')));
    body.push(routes(g, e, e.trader.hullId, (to) => say(redirect(g, e, to)), rerender));
    body.push(el('div', { class: 'row' }, button('Pay her off', () => { say(dismiss(g, e)); rerender(); }, { ghost: true })));
  }

  const actions = el('div', { class: 'row', style: { marginTop: '8px', flexWrap: 'wrap', gap: '6px' } },
    up !== null ? button(`Enlarge it — ${up}`, () => { say(upgrade(g, e)); rerender(); }, { disabled: up > g.crown.gold + g.creditFree }) : null,
    button(confirmSell.has(e.id) ? 'Sell it — sure?' : 'Sell it', () => {
      if (!confirmSell.has(e.id)) { confirmSell.add(e.id); rerender(); return; }
      confirmSell.delete(e.id); say(sell(g, e)); rerender();
    }, { ghost: true }),
  );
  void here;
  return card(`${def.name} — ${kindOf(e.goodId)}${e.level > 1 ? ` (${['', 'a going concern', 'the great house of the place'][e.level - 1]})` : ''}`,
    ...(rows.filter(Boolean) as HTMLElement[]), ...body, actions);
}

/** On the quay: what you own here, and what could be bought. */
export function businessesHere(g: Game, def: PortDef, rerender: () => void, say: (t: string) => void): HTMLElement[] {
  const out: HTMLElement[] = [];
  const mine = g.enterprises.filter((e) => e.portId === def.id && !e.lost);
  for (const e of mine) out.push(enterpriseCard(g, e, rerender, say, true));
  const sale = forSale(g, def);
  const total = g.enterprises.filter((e) => !e.lost).length;
  out.push(card(`Businesses at ${def.name}`,
    el('p', { class: 'flavour' },
      'A mill, a vineyard, a tannery, bought in a town that makes the thing well and run by a manager of the '
      + 'town’s own. It makes goods every month whether or not you are here, and a hired vessel carries them '
      + 'to a market that wants them. The money comes home on the Casa’s ships. '
      + `You keep ${total} of ${maxBusinesses(g)} that a captain of your standing can manage.`),
    sale.length === 0
      ? el('p', {}, mine.length > 0 ? 'Nothing else here that is for sale.' : 'The town has nothing worth buying into.')
      : el('div', {}, ...sale.map((id) => {
        const gd = GOOD_BY_ID.get(id)!;
        const why = canFound(g, def, id);
        const cost = priceOf(g, def, id, 1);
        const out1 = Math.round(monthlyValue(def, id) / (0.9 * gd.lisbon));
        return el('div', { class: 'row', style: { alignItems: 'center', gap: '10px', margin: '6px 0' } },
          button(`${kindOf(id)} — ${cost}`, () => { say(found(g, def, id)); rerender(); }, { primary: !why, disabled: !!why, title: why ?? undefined }),
          el('span', { style: { fontSize: '13px' } }, `about ${out1} ${gd.unit}s of ${gd.english.toLowerCase()} a month`
            + (why ? ` — ${why}` : '')));
      }))));
  return out;
}

/** Every business you own, from anywhere: the Orders page. */
export function enterpriseCards(g: Game, rerender: () => void): HTMLElement[] {
  const out: HTMLElement[] = [];
  const say = (t: string) => g.pushAlert(t, 'note');
  const mine = g.enterprises.filter((e) => !e.lost);
  for (const e of mine) out.push(enterpriseCard(g, e, rerender, say, false));
  const lost = g.enterprises.filter((e) => e.lost && e.lostWhy && e.lostWhy !== 'Sold.');
  if (lost.length) {
    out.push(card('Lost', ...lost.map((e) => el('p', { class: 'bad' }, `${portName(e.portId)} — ${kindOf(e.goodId)}: ${e.lostWhy}`))));
  }
  out.push(card('How a business pays',
    el('p', { class: 'flavour' },
      'Output goes into the warehouse. A vessel on contract carries a load to the port you name whenever there is enough '
      + 'to be worth the freight, sells it there at that day’s price less the town’s commission, and brings the money back. '
      + 'Selling over and over into one port glut it and the price falls, so move the vessel between markets. '
      + 'Whatever the business’s account holds beyond its float is sent home on the Casa’s ships and paid out at the next '
      + 'Portuguese port you make.'),
    kv('Businesses kept', `${mine.length} of ${maxBusinesses(g)}`)));
  void legDays; void voyageFee; void estimate;
  return out;
}
