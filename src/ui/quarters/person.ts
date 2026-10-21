import type { Game } from '../../game/state';
import { waitingAt } from '../../storylets/engine';
import { button, el } from '../dom';
import type { Ctx } from './ctx';
import type { QuarterId } from './model';
import { verb } from './verb';

/**
 * A person at the Quarters (storylets/engine): whoever has something to put to the captain this call waits where he
 * would be found, and the scene is only played when he is heard. Never an alert; at most one a call.
 */
export function personAt(ctx: Ctx, host: HTMLElement, g: Game, quarter: QuarterId): void {
  const w = waitingAt(g, quarter as 'waterfront' | 'tavern' | 'court');
  if (!w) return;
  host.append(verb(`story.person.${quarter}`, el('div', { class: 'quest-offer' },
    el('div', { class: 'quest-offer-eyebrow' }, w.who),
    el('p', {}, w.line),
    el('div', { class: 'row' },
      button('Hear him out', () => { g.hearStorylet(); ctx.render(); }, { primary: true })))));
}
