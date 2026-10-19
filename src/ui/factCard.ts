import { NM, compassPoint, haversine } from '../core/math';
import type { Game, GameMode } from '../game/state';
import { checkFact, checkOffer, sellFact, sellOffer } from '../knowledge/informers';
import { ageWord, confidenceWord, isStale, type Fact } from '../knowledge/information';
import { button, el } from './dom';

/**
 * The one component that shows anything the captain holds: a price sheet, a
 * piece of hearsay, a page of the rutter, a town as the chart draws it.
 *
 * It prints the claim, who made it, how old it is and how far it is worth
 * believing, and nothing else about the world: there is no truth to print.
 * A stale fact is dimmed and says so. Under it are the few things that can be
 * done with that kind of fact, and no more.
 */

export interface FactHooks {
  /** Re-render after something changed. */
  changed(): void;
  /** Open another page of the book, or the chart. */
  goTo(mode: GameMode): void;
}

const bearingTo = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number =>
  (((Math.atan2((b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat) * 180) / Math.PI) % 360 + 360) % 360;

/** The teller's place out of "a pilot at Malindi", for a chart label. */
const reportLabel = (source: string): string => {
  const at = source.lastIndexOf(' at ');
  return at > 0 ? `Report from ${source.slice(at + 4)}` : 'Reported place';
};

export function factCard(g: Game, f: Fact, hooks: FactHooks): HTMLElement {
  const stale = isStale(f);
  const meta = [
    `from ${f.source}`,
    ageWord(f.age),
    `${confidenceWord(f.confidence)}`,
  ];
  const root = el('div', { class: `fact kind-${f.kind}${stale ? ' stale' : ''}` },
    el('p', { class: 'fact-claim' }, f.claim),
    el('div', { class: 'life-meta fact-meta' }, meta.join('  ·  '), stale ? el('b', { class: 'fact-stale' }, '  stale') : null),
  );
  if (f.settled) {
    root.append(el('div', { class: `fact-note ${f.settled === 'borne out' ? 'good' : 'bad'}` },
      f.settled === 'borne out' ? 'Run down: it was where he said.' : 'Run down: nothing there.'));
  }
  if (f.checked) {
    root.append(el('div', { class: 'fact-note' },
      f.checked === 'agrees' ? 'A second informer tells it the same way.' : 'A second informer would not stand behind it.'));
  }

  const row = el('div', { class: 'row fact-actions' });
  if (f.ref.store === 'lead' && !f.settled) {
    const ref = f.ref;
    const l = g.leads.find((x) => x.id === ref.id);
    if (l) {
      const from = g.nav.estimated;
      const d = haversine(from, { lat: l.lat, lon: l.lon }) / NM;
      root.append(el('div', { class: 'life-meta' },
        `${d.toFixed(0)} miles ${compassPoint(bearingTo(from, l))} of your reckoning, and he may be out by ${Math.round(l.errorNm)}. ${l.value} renown if it is true.`));
      row.append(
        button('Lay a course for it', () => {
          g.setDestination(reportLabel(l.source), l.lat, l.lon);
          hooks.goTo('chart');
        }),
        button('Forget it', () => { l.followed = true; l.false = true; hooks.changed(); }, { ghost: true }),
      );
    }
  }
  const check = checkOffer(g, f);
  if (check.ok) {
    row.append(button(`Ask a second informer \u2014 ${check.price} cr`, () => {
      g.pushAlert(checkFact(g, f), 'note'); hooks.changed();
    }, { ghost: true, title: check.why }));
  }
  const sell = sellOffer(g, f);
  if (sell.ok) {
    row.append(button(`Sell a copy — ${sell.price} cr`, () => {
      g.pushAlert(sellFact(g, f), 'note'); hooks.changed();
    }, { ghost: true, title: sell.why }));
  }
  if (f.ref.store === 'rutter') row.append(button('The page', () => hooks.goTo('rutter'), { ghost: true }));
  if (row.childNodes.length > 0) root.append(row);
  return root;
}
