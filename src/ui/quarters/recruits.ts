import { people } from '../../world/peoples';
import type { Game } from '../../game/state';
import { append, button, card, el, kv } from '../dom';
import { tagLast } from './verb';
import type { Ctx } from './ctx';

export function recruitsSection(ctx: Ctx, host: HTMLElement, g: Game): void {
  const def = g.portHere!;
  const shortfall = g.crew.complement - g.crew.count;
  const wage = g.handWage();
  const cost = shortfall * wage;
  const known = g.hands.filter((h) => h.alive && h.aboard).length;
  host.append(card('Hands',
    kv('Aboard', `${g.crew.count} of ${g.crew.complement}`),
    kv('Wage here', `${wage} cruzados a man`),
    shortfall > 0
      ? el('div', { style: { marginTop: '10px' } },
          el('p', {}, def.people === 'portuguese'
            ? 'There are men on the quay who will ship for the Guinea voyage, and a few who know what that means and want more.'
            : 'A few men can be found here who will take service, though how they will fare in a Portuguese ship is anyone\'s guess.'),
          known < 8
            ? el('p', { class: 'quote' },
                'Some of them will have to be come to know, there being fewer names forward '
                + 'than there were when she sailed.')
            : el('span', {}),
          button(`Ship ${shortfall} hands — ${cost} cruzados`, () => {
            const r = g.shipHands(shortfall);
            ctx.notice = { text: r.message, grave: !r.ok };
            ctx.render();
          }, { primary: true, disabled: g.crown.gold < cost }))
      : el('p', {}, 'She is fully manned.'),
  ));
  tagLast(host, 'hands.ship');
}
