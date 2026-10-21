import { regionOf } from '../../economy/trade';
import type { Game } from '../../game/state';
import type { Fact } from '../../knowledge/information';
import { askHisPeople, canAskHisPeople, deepPort, patronViews, perkOf } from '../../places';
import { FRONTS } from '../../world/powers';
import { arriveAt, rumourFacts } from '../../world/powers';
import { button, card, el, fold } from '../dom';
import { factCard } from '../factCard';
import type { Ctx } from './ctx';
import { personAt } from './person';
import { verb } from './verb';

const ROUND = 3;

/** The tavern's board: gossip, the rumour mill as the captain has heard it, the Patron's word, and the waterfront's leads. */
export function boardSection(ctx: Ctx, host: HTMLElement, g: Game): void {
  const def = g.portHere!;
  const deep = deepPort(def.id);
  const hooks = { changed: () => ctx.render(), goTo: () => { /* the tavern has no chart in it */ } };

  personAt(ctx, host, g, 'tavern');
  if (g.portGossip) {
    host.append(verb('town.gossip', card('What they say ashore',
      el('p', { style: { fontStyle: 'italic', lineHeight: '1.7' } }, g.portGossip))));
  }

  // The rumour mill (world/powers/rumours): every tale the captain has heard, as a claim, a teller, an age and a doubt.
  const all = rumourFacts(g.powers, g.clock.t);
  const mine = new Set(g.powers.rumours.filter((r) => r.heard?.port === def.id).map((r) => `rumour:${r.id}`));
  const local = all.filter((f) => mine.has(f.id));
  const carried = all.filter((f) => !mine.has(f.id)).sort((a, b) => b.confidence - a.confidence).slice(0, 4);
  const list = (title: string, fs: Fact[]): HTMLElement[] => (fs.length === 0 ? [] : [
    el('h4', { class: 'board-head' }, title),
    ...fs.map((f) => factCard(g, f, hooks)),
  ]);
  host.append(verb('tavern.rumours', card('The board',
    el('p', { class: 'flavour' }, 'Every tale here is a man’s word, from further up the road, and worn by every mouth it came through. Nobody will say which are true; the quay will know when you arrive.'),
    ...list('Heard on this quay', local),
    ...list('Brought with you', carried),
    local.length + carried.length === 0 ? el('p', {}, 'Nothing is being said that you have not heard.') : null,
  )));

  // A round: a day for the tongues to loosen, and whatever has reached the quay in it.
  host.append(verb('tavern.listen', card('Buy a round and listen',
    el('p', { class: 'flavour' }, 'A day with the pilots and the brokers, and a round to keep them talking. Tales come down the road at a port a month; this is only for the ones that have come since you landed.'),
    button(`Buy a round — ${ROUND} cruzados, a day`, () => {
      g.crown.gold -= ROUND;
      const heardBefore = g.powers.rumours.filter((r) => r.heard).length;
      g.waitDays(1);
      arriveAt(g, def.id, g.clock.t);
      const n = g.powers.rumours.filter((r) => r.heard).length - heardBefore;
      ctx.say(n > 0 ? `A day passes. ${n} new tale${n === 1 ? '' : 's'} on the board.` : 'A day passes, and a round of wine. Nothing new is said.');
      ctx.render();
    }, { disabled: g.crown.gold < ROUND }))));

  // The Patron's word, where there is one: each patron of the port reports the Front he knows best.
  if (deep) {
    const views = patronViews(g, deep);
    const speaking = views.filter((v) => perkOf(v, 'rumour'));
    if (speaking.length === 0) {
      host.append(verb('tavern.patron-word', card(`${deep.patron.name}’s word`,
        el('p', { class: 'flavour' }, `${deep.patron.name} says nothing to a stranger. That changes when he has weighed you.`))));
    }
    speaking.forEach((v, i) => {
      const p = v.patron;
      const fid = p.front ?? 'gold';
      const front = g.powers.fronts[fid];
      const stage = FRONTS[fid].stages[front.stage - 1];
      const fact: Fact = {
        id: `patron:${deep.port}:${p.id}`, kind: 'politics',
        claim: `${FRONTS[fid].name}: ${stage.name}. ${stage.line}`,
        source: `${p.name}, ${p.title}, at ${def.name}`,
        age: 0, confidence: 0.8, place: def.id, ref: { store: 'chart', port: def.id },
      };
      const card1 = card(`${p.name}’s word`,
        ...v.unlocked.filter((k) => k.kind === 'rumour').map((k) => el('p', { class: 'flavour' }, k.text)),
        factCard(g, fact, hooks),
        v.unlocked.some((k) => k.id === 'second')
          ? button('Ask his people about the tales you have heard', () => {
            ctx.say(askHisPeople(g, deep, regionOf));
            ctx.render();
          }, { disabled: !canAskHisPeople(g, deep), title: 'A free second opinion on every tale of this coast you have heard' })
          : null);
      host.append(i === 0 ? verb('tavern.patron-word', card1) : card1);
    });
  }

  const heard = g.openLeads;
  host.append(verb('freight.waterfront-says', fold('What the waterfront says', '', false,
    heard.length === 0
      ? el('p', {}, 'Nothing you have not heard before. Buy a pilot a drink and wait.')
      : el('div', {}, ...heard.slice(0, 4).map((l) =>
        el('p', { class: 'flavour', style: { marginBottom: '9px' } }, l.text))),
    el('p', { style: { fontSize: '13px', opacity: '0.75' } },
      'Every one of these is a man’s word, and a man’s word is worth what the man is worth. '
      + 'The chart will show you where they point, which is not the same as where the thing is.'),
  )));
}
