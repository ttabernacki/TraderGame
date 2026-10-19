import { markCounts } from '../../diplomacy/marks';
import { polityOfPort } from '../../diplomacy/polities';
import type { Game } from '../../game/state';
import { deepPort, patronOf, stageWord } from '../../places';
import { hullPrice } from '../../progression/network';
import { people } from '../../world/peoples';
import { button, card, el, kv } from '../dom';
import { openLineCard } from '../networkView';
import type { Ctx } from './ctx';
import { regardWord } from './quay';
import { verb } from './verb';

/** Fort and Court: where you stand with whoever governs the place, and what the Patron's goodwill is worth here. */
export function audienceSection(ctx: Ctx, host: HTMLElement, g: Game): void {
  const def = g.portHere!;
  const rel = g.relationsFor(def.id);
  const pol = polityOfPort(def.id);
  const marks = pol ? markCounts(g.diplomacy.marks, pol.id, g.clock.t) : { for: 0, against: 0 };
  const pe = people(def.people);

  host.append(verb('court.standing', card(pol ? pol.name : `The ${pe.name}`,
    kv('Regard', regardWord(rel.regard), rel.regard > 0.2 ? '' : rel.regard < -0.2 ? 'bad' : ''),
    kv('Leave to trade', rel.mayTrade ? 'granted' : 'not yet', rel.mayTrade ? '' : 'bad'),
    rel.exclusive ? kv('Terms', 'exclusive') : null,
    rel.factory ? kv('Ground', 'granted for a House') : null,
    pol ? kv('Marks held in your favour', String(marks.for)) : null,
    pol ? kv('Marks held against you', String(marks.against), marks.against > 0 ? 'bad' : '') : null,
    el('p', { class: 'flavour' }, def.people === 'portuguese'
      ? 'These are your own people. The Casa and the Crown are reached through the court at Lisbon.'
      : 'What a court thinks of you is the sum of what you have done in its hearing, and it is told to the next court along the road.'))));

  if (def.people !== 'portuguese') {
    host.append(verb('court.audience', card('Seek an audience',
      el('p', {}, rel.mayTrade
        ? 'Whoever governs the place will hear a captain who has something to ask, or to give, or to put right.'
        : 'Nothing may be bought or sold here until whoever governs the place has seen you.'),
      el('div', { class: 'row' },
        button('Seek an audience', () => ctx.onAudience(), { primary: !rel.mayTrade }),
        def.id === 'lisboa' ? button('To court', () => ctx.onCourt()) : null,
        def.people === 'han' ? button('To the Admiral', () => ctx.onCourt()) : null))));
  }

  const deep = deepPort(def.id);
  if (deep) {
    const v = patronOf(g, deep);
    host.append(verb('court.patron', card(`What ${deep.patron.name}’s goodwill is worth here`,
      kv('To you, he is', stageWord(v.stage)),
      kv('A House here would cost', `${g.foundingCost(def)} cruzados`),
      kv('Credit while you lie here', v.unlocked.some((k) => k.kind === 'credit') ? `${g.creditLimit} cruzados` : 'none yet'),
      ...v.shown.map((k) => el('p', { class: 'perk on' }, el('b', {}, '✓ '), k.text)))));
  }
}

/** Lines: ships under your flag that run between ports, begun where you have a House or at Lisbon. */
export function linesSection(ctx: Ctx, host: HTMLElement, g: Game): void {
  const couldBuy = g.crown.gold + g.creditFree >= hullPrice('caravela-latina') * 0.8 || g.lines.some((l) => !l.lost);
  if ((g.factoryHere || g.portHere!.id === 'lisboa') && couldBuy) {
    host.append(verb('freight.open-line', openLineCard(g, () => ctx.render(), (t) => { ctx.notice = { text: t }; }, g.portHere!.id)));
  } else {
    host.append(verb('court.no-lines', card('Lines',
      el('p', {}, 'A Line is a ship that runs between two ports under a master of yours, and it wants a House at one end or the Tagus at the other, and a purse that can fit her out. Neither is yours yet.'))));
  }
}
