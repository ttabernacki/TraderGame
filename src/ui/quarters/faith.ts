import type { Game } from '../../game/state';
import { activeEntries, canKeepDay, deepPort, keepTheDay, memoryLines } from '../../places';
import { people } from '../../world/peoples';
import { button, card, el, kv } from '../dom';
import type { Ctx } from './ctx';
import { faithOf } from './faithData';
import { verb } from './verb';

const WHAT: Record<string, string> = {
  catholic: 'They are Christians, and the church on the hill is the same church. A priest ashore will say mass for the company.',
  muslim: 'They are Muslims, and the call to prayer is the clock of the town. A Christian is tolerated in the road and not in the mosque.',
  hindu: 'Their faith has no name in any book in Lisbon. The temples are open to those who take off their shoes, and closed to those who will not.',
  buddhist: 'Their faith has no name in any book in Lisbon. The monasteries keep the calendar of the place.',
  confucian: 'They keep the rites of the Son of Heaven, and they are particular about who kneels to whom.',
  traditional: 'They keep their own gods, and the rites are not shown to strangers. The ground has its days, and a ship that lands on one is remembered.',
};

/** The worship of the place, and your own aboard. */
export function faithSection(ctx: Ctx, host: HTMLElement, g: Game): void {
  const def = g.portHere!;
  const pe = people(def.people);
  const deep = deepPort(def.id);
  const chaplain = g.crew.officers.find((o) => o.alive && !o.ashoreAt && o.role === 'capelao');
  const feast = deep ? activeEntries(deep, g.clock.t).find((e) => e.kind === 'feast') : undefined;
  const record = memoryLines(g, def.id, 8).filter((l) => l.tag === 'faith.pressed' || l.tag === 'faith.respected');

  host.append(verb('faith.people', card(`Their worship: ${faithOf(g, def.id)}`,
    el('p', {}, WHAT[pe.faith] ?? ''),
    ...record.map((l) => el('p', { class: l.tone < 0 ? 'bad' : 'good' }, l.text)),
    record.length === 0 ? el('p', { class: 'flavour' }, 'You have done nothing here that touched their worship, for good or ill.') : null)));

  host.append(verb('faith.chaplain', card('Your chaplain',
    chaplain
      ? el('p', {}, `${chaplain.name} is aboard. He will say mass on a quay that allows it, and he will have an opinion on any font you are asked to carry a people to.`)
      : el('p', {}, 'No priest is aboard. The company keeps the day as well as men can without one; a chaplain is to be had at Lisbon and Lagos.'))));

  const why = canKeepDay(g);
  host.append(verb('faith.keep-day', card(feast ? feast.name : 'Hear mass, or keep the day',
    el('p', {}, feast ? feast.text : 'A day given to the company’s devotions: a little heart for the men, more if there is a priest, and more again on the place’s own feast.'),
    kv('Morale', `${Math.round(g.crew.morale * 100)}%`),
    el('div', { class: 'row', style: { marginTop: '8px' } },
      button(feast ? `Keep ${feast.name}` : 'Keep the day', () => { ctx.say(keepTheDay(g)); ctx.render(); }, { disabled: !!why, title: why ?? undefined })),
    why ? el('p', { class: 'gift-sub' }, why) : null)));
}
