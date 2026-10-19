import type { Game } from '../../game/state';
import { el } from '../dom';
import { boardSection } from './tavern';
import { companySection } from './company';
import { audienceSection, linesSection } from './court';
import type { Ctx } from './ctx';
import { faithSection } from './faith';
import { freightSection } from './freight';
import { houseSection } from './house';
import { menSection } from './men';
import { QUARTERS, quartersModel, type QuarterId } from './model';
import { moneySection } from './money';
import { quaySection } from './quay';
import { recruitsSection } from './recruits';
import { storesSection } from './stores';
import { tradeSection } from './market';
import { fittingsSection, instrumentsSection, refitSection } from './yard';

export { Ctx } from './ctx';
export { QUARTERS, QUARTER_IDS, VERBS, VERB_BY_ID, availableVerbs, clicksFor, quartersModel, type QuarterId, type QuarterModel } from './model';
export { frontsAt, type FrontLine } from './fronts';

type SectionView = (ctx: Ctx, host: HTMLElement, g: Game) => void;

/** Each quarter's sections, by id. The first of each quarter (see `QUARTERS`) is the one that opens. */
export const SECTION_VIEWS: Record<QuarterId, Record<string, SectionView>> = {
  waterfront: { quay: quaySection, company: companySection, men: menSection },
  tavern: { board: boardSection, recruits: recruitsSection },
  yard: { refit: refitSection, fittings: fittingsSection, stores: storesSection, instruments: instrumentsSection },
  market: { trade: tradeSection, freight: freightSection, money: moneySection },
  court: { audience: audienceSection, house: houseSection, lines: linesSection },
  faith: { faith: faithSection },
};

/**
 * A quarter on the page: the state of the Fronts at this place, the sections as chips (when there is more than one),
 * and the section itself. A section that is not the one that opens has every fold in it opened, so no verb is more than
 * two clicks from the port screen.
 */
export function renderQuarter(ctx: Ctx, g: Game, q: QuarterId, section: string, host: HTMLElement): void {
  const model = quartersModel(g).find((m) => m.id === q);
  if (!model) return;
  const spec = QUARTERS[q];
  const sid = SECTION_VIEWS[q][section] ? section : spec.sections[0].id;

  host.append(el('div', { class: 'fronts-strip' },
    el('div', { class: 'fronts-head' }, spec.blurb),
    ...model.fronts.map((f) => el('div', { class: `front-line ${f.tone}${f.front ? ` front-${f.front}` : ''}` }, f.text))));

  if (spec.sections.length > 1) {
    host.append(el('div', { class: 'tabs sections' },
      ...spec.sections.map((s) => el('button', {
        class: s.id === sid ? 'active' : '',
        'data-section': s.id,
        onclick: () => ctx.show(q, s.id),
      }, s.title))));
  }

  const body = el('div', { class: 'section-body', 'data-quarter': q, 'data-section-id': sid });
  SECTION_VIEWS[q][sid](ctx, body, g);
  if (sid !== spec.sections[0].id) body.querySelectorAll('details.fold').forEach((d) => { (d as HTMLDetailsElement).open = true; });
  host.append(body);
}
