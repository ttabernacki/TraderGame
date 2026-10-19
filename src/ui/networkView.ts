import { GOOD_BY_ID } from '../economy/goods';
import { HULL_BY_ID } from '../ship/hull';
import { portDef } from '../world/ports';
import type { Game } from '../game/state';
import { capacityOf, policyOf, stockTons, stockValue, type Feitoria } from '../progression/feitoria';
import {
  CIVIC, civicCost, fundCivic, POSTURES, amendLine, bestCargo, buildWorks, closeLine, footingOf, footingWord, hullPrice, inSeason, legCost,
  legDays, lineDestinations, lineHulls, openLine, canOpenLine, postureOf, worksChoices, worksCost, worksName,
  worksOutput, worksUpkeep, sellShare, shareWord, type Line, type Posture,
} from '../progression/network';
import { civicGain, civicLevel, prosperityOf, seenProsperity, MAX_CIVIC_LEVEL, type Civic } from '../world/tick';
import { button, card, el, kv, meter } from './dom';

/**
 * The network: every House and every Line, from wherever the ship is.
 */

const YEAR = 365 * 86400;

function select(label: string, value: string, options: [string, string][], onChange: (v: string) => void): HTMLElement {
  return el('label', { class: 'net-field' }, el('span', {}, label),
    el('select', { 'aria-label': label, onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value) },
      ...options.map(([v, t]) => el('option', { value: v, selected: v === value }, t))));
}

const hullName = (id: string) => HULL_BY_ID.get(id)?.english ?? id;
const portName = (id: string) => portDef(id).name;

/** The posture picker and footing line, shared by the network and the port's House tab. */
export function houseHead(f: Feitoria, rerender: () => void): HTMLElement[] {
  const v = footingOf(f);
  return [
    el('div', { class: 'net-footing' }, el('span', {}, `Footing: ${footingWord(v)}`), meter(v, v < 0.4 ? 'bad' : v < 0.55 ? 'warn' : '')),
    select('Set to', postureOf(f), POSTURES.map((p) => [p.id, p.name]), (val) => { f.posture = val as Posture; rerender(); }),
    el('p', { class: 'gift-sub' }, POSTURES.find((p) => p.id === postureOf(f))!.blurb),
  ];
}

/** What the Works are, or could be. `here` lets them be built. */
export function worksBlock(g: Game, f: Feitoria, rerender: () => void, notify?: (t: string) => void): HTMLElement {
  const def = portDef(f.portId);
  if (f.make) {
    const gd = GOOD_BY_ID.get(f.make);
    const lvl = f.makeLevel ?? 1;
    return el('div', { class: 'net-works' },
      kv(`${worksName(f.make)}${lvl > 1 ? ` (${['', '', 'enlarged', 'great'][lvl]})` : ''}`,
        `${Math.round(worksOutput(f, prosperityOf(g, f.portId)))} ${gd?.unit ?? 'unit'}s a month, ${worksUpkeep(f)} in wages`),
      notify && lvl < 3
        ? button(`Enlarge — ${worksCost(def, f.make, lvl + 1)} cruzados`, () => { notify(buildWorks(g, f, f.make!)); rerender(); })
        : null);
  }
  const choices = worksChoices(def);
  if (!notify) return el('p', { class: 'gift-sub' }, choices.length ? 'No Works. They are built in the town.' : 'Nothing here worth working.');
  return el('div', { class: 'net-works' },
    el('p', { class: 'gift-sub' }, 'Works turn the town’s own goods out every month, into the store, for wages out of the chest.'),
    ...choices.map((id) => button(`${worksName(id)} — ${worksCost(def, id)} cruzados`,
      () => { notify(buildWorks(g, f, id)); rerender(); })));
}

/** The town's fortunes as the captain last saw them, one line; null if he has not been. */
export function prosperityText(g: Game, portId: string): string | null {
  return seenProsperity(g, portId)?.line ?? null;
}

/** A quay or a fort, paid for out of the House's town: the one place the captain can put money into a port itself. */
export function civicBlock(g: Game, portId: string, rerender: () => void, notify: (t: string) => void): HTMLElement {
  const def = portDef(portId);
  return el('div', { class: 'net-works' },
    el('p', { class: 'gift-sub' }, 'Money put into the town itself. It does not last without upkeep of its own: the town drifts back unless trade keeps coming.'),
    ...(['quay', 'fort'] as Civic[]).map((k) => {
      const lvl = civicLevel(g, portId, k);
      const done = lvl >= MAX_CIVIC_LEVEL;
      const small = civicGain(g, portId, k) < 0.01;
      return button(done ? `${CIVIC[k].name} — complete` : `${lvl ? 'Enlarge the' : 'Fund a'} ${CIVIC[k].name.toLowerCase()} — ${civicCost(def, k, lvl)} cruzados${small ? ' (the town can hardly be made richer)' : ''}`,
        () => { notify(fundCivic(g, portId, k)); rerender(); }, { disabled: done, title: CIVIC[k].blurb });
    }));
}

function houseCard(g: Game, f: Feitoria, rerender: () => void): HTMLElement {
  const def = portDef(f.portId);
  const p = policyOf(f);
  return card(`${def.name} — ${f.factor}`,
    ...houseHead(f, rerender),
    kv('In the store', `${stockTons(f).toFixed(1)} of ${capacityOf(f).toFixed(0)} tons, ${stockValue(f)} at Lisbon`),
    kv('In the chest', `${Math.round(f.chest)} cruzados`, f.chest < 40 ? 'warn' : ''),
    worksBlock(g, f, rerender),
    el('div', { class: 'row', style: { marginTop: '6px', flexWrap: 'wrap', gap: '6px' } },
      ...([
        ['home', 'Sends spare coin home', 'Keeps its coin'],
        ['peace', 'Pays the town to keep the peace', 'Pays nothing unasked'],
        ['build', 'Builds walls from its own chest', 'Builds nothing'],
      ] as const).map(([key, on, off]) => button(p[key] ? on : off, () => {
        f.policy = { ...policyOf(f), [key]: !p[key] }; rerender();
      }, { ghost: !p[key], primary: p[key] }))),
  );
}

function lineStatus(g: Game, l: Line): string {
  const days = Math.max(0, Math.round((l.at - g.clock.t) / 86400));
  if (l.phase === 'out') {
    const c = l.cargo ? GOOD_BY_ID.get(l.cargo.goodId) : null;
    return `Bound for ${portName(l.to)}${c ? ` with ${c.english.toLowerCase()}` : ''}, ${days} days out`;
  }
  if (l.phase === 'back') return `Homeward to ${portName(l.home)}, ${days} days`;
  if (l.waiting === 'season') return `At ${portName(l.home)}, waiting on the monsoon`;
  if (l.waiting === 'cargo') return `At ${portName(l.home)}, waiting for a cargo worth the voyage`;
  return `At ${portName(l.home)}, loading`;
}

function lineCard(g: Game, l: Line, rerender: () => void, notify: (t: string) => void): HTMLElement {
  if (l.share) {
    return card(`The ${l.name} — a ${shareWord(l.share)} share`,
      kv('Owner', `${l.partner ?? 'A Rua Nova house'}, who runs her`),
      kv('Runs', `${portName(l.home)} — ${portName(l.to)}`),
      kv('Now', lineStatus(g, l)),
      kv('Your part', `${l.trips} voyages, ${Math.round(l.earned)} cruzados${l.lastNet !== undefined ? `, last ${l.lastNet}` : ''}`,
        (l.lastNet ?? 0) < 0 ? 'warn' : ''),
      l.phase === 'home' ? button(`Sell the share — ${Math.round(hullPrice(l.hullId) * l.share * 0.8)}`,
        () => { notify(sellShare(g, l)); rerender(); }, { ghost: true }) : null);
  }
  const dests = lineDestinations(g, l.home);
  return card(`The ${l.name}`,
    kv('Runs', `${portName(l.home)} — ${portName(l.nextTo ?? l.to)}`),
    kv('Now', lineStatus(g, l)),
    kv('Voyages', `${l.trips}, ${Math.round(l.earned)} cruzados all told${l.lastNet !== undefined ? `, last ${l.lastNet}` : ''}`,
      (l.lastNet ?? 0) < 0 ? 'warn' : ''),
    el('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } },
      select('Hull', l.nextHull ?? l.hullId, lineHulls(g).map((h) => [h, `${hullName(h)} (${HULL_BY_ID.get(h)!.hold} t)`]),
        (v) => { notify(amendLine(g, l, { hullId: v })); rerender(); }),
      select('Runs to', l.nextTo ?? l.to, dests.map((d) => [d, portName(d)]),
        (v) => { notify(amendLine(g, l, { to: v })); rerender(); }),
      l.phase === 'home' ? button(`Sell her — ${Math.round(hullPrice(l.hullId) * 0.6)}`, () => { notify(closeLine(g, l)); rerender(); }, { ghost: true }) : null),
  );
}

/** The form for a new Line: from a House (or Lisbon), to a market, in a hull. */
class OpenForm {
  home = '';
  to = '';
  hull = '';
}
const form = new OpenForm();

export function openLineCard(g: Game, rerender: () => void, notify: (t: string) => void, fixedHome?: string): HTMLElement {
  const busy = new Set(g.lines.filter((l) => !l.lost && !l.share).map((l) => l.home));
  const homes = [...new Set([...g.liveFactories.map((f) => f.portId), 'lisboa'])].filter((h) => !busy.has(h));
  if (fixedHome) form.home = fixedHome;
  else if (!homes.includes(form.home)) form.home = homes[0] ?? '';
  if (!form.home) {
    return card('Open a Line', el('p', { class: 'gift-sub' }, 'Every House you have, and Lisbon, already keeps a Line. One ship to a House: open another House for another Line.'));
  }
  const dests = lineDestinations(g, form.home);
  const hulls = lineHulls(g);
  if (!hulls.includes(form.hull)) form.hull = hulls[0] ?? '';
  // Start on the run that pays best today, not the first name in the list.
  if (!dests.includes(form.to)) {
    const cash = Math.max(0, g.liveFactories.find((f) => f.portId === form.home)?.chest ?? 0) + (form.home === 'lisboa' ? 600 : 0);
    let best = -Infinity;
    form.to = dests[0] ?? '';
    for (const d of dests) {
      const m = (bestCargo(g, form.home, d, form.hull, cash)?.margin ?? -1) - legCost(form.home, d, form.hull) * 2;
      if (m > best) { best = m; form.to = d; }
    }
  }
  const why = form.to ? canOpenLine(g, form.home, form.to, form.hull) : 'Nowhere to send her yet.';
  const house = g.liveFactories.find((f) => f.portId === form.home);
  const pick = form.to ? bestCargo(g, form.home, form.to, form.hull, Math.max(0, house?.chest ?? 0) + (form.home === 'lisboa' ? 600 : 0)) : null;
  const month = g.clock.date.month;
  return card('Open a Line',
    el('p', { class: 'gift-sub' }, 'A ship of your own, running from a House to a market and back on her own: '
      + 'she takes what pays best there, sells it into the market, and brings home what pays best the other way.'),
    el('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } },
      fixedHome ? null : select('From', form.home, homes.map((h) => [h, portName(h)]), (v) => { form.home = v; rerender(); }),
      select('To', form.to, dests.map((d) => [d, portName(d)]), (v) => { form.to = v; rerender(); }),
      select('Hull', form.hull, hulls.map((h) => [h, `${hullName(h)} (${HULL_BY_ID.get(h)!.hold} t)`]), (v) => { form.hull = v; rerender(); })),
    form.to ? kv('A round voyage', `${legDays(form.home, form.to, form.hull) * 2} days, ${legCost(form.home, form.to, form.hull) * 2} in costs`) : null,
    form.to ? kv('Today she would take', pick
      ? `${pick.qty} ${GOOD_BY_ID.get(pick.goodId)!.unit}s of ${GOOD_BY_ID.get(pick.goodId)!.english.toLowerCase()}, about ${Math.round(pick.margin)} over cost`
      : 'Nothing that pays', pick ? '' : 'warn') : null,
    form.to && !inSeason(form.home, form.to, month) ? el('p', { class: 'gift-sub' }, 'Out of the monsoon: she will lie at home until the wind serves.') : null,
    button(`Buy her — ${hullPrice(form.hull)} cruzados`, () => { notify(openLine(g, form.home, form.to, form.hull)); rerender(); },
      { primary: true, disabled: !!why, title: why ?? '' }),
    why ? el('p', { class: 'gift-sub' }, why) : null,
  );
}

/** The whole network, for the Orders book. */
export function networkCards(g: Game, rerender: () => void, notify: (t: string) => void): HTMLElement[] {
  const lines = g.lines.filter((l) => !l.lost);
  const year = lines.map((l) => ({ l, net: l.history.filter((h) => h.t > g.clock.t - YEAR).reduce((s, h) => s + h.net, 0) }));
  const total = year.reduce((s, x) => s + x.net, 0);
  const out: HTMLElement[] = [];
  out.push(card('The year',
    lines.length === 0 ? el('p', {}, 'No Lines running. A Line pays out in one card when her voyage is done, at the next Portuguese port you make.') : null,
    ...year.map(({ l, net }) => kv(`The ${l.name}`, `${net} cruzados`, net < 0 ? 'warn' : '')),
    lines.length > 0 ? kv('All told', `${total} cruzados`) : null,
  ));
  if (g.liveFactories.length) out.push(el('h2', { class: 'fit-head' }, 'Houses'));
  for (const f of g.liveFactories) out.push(houseCard(g, f, rerender));
  out.push(el('h2', { class: 'fit-head' }, 'Lines'));
  for (const l of lines) out.push(lineCard(g, l, rerender, notify));
  out.push(openLineCard(g, rerender, notify));
  return out;
}
