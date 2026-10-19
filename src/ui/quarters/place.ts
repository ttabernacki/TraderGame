import { characterOf } from '../../world/portCharacter';
import { people } from '../../world/peoples';
import type { PortDef } from '../../world/ports';
import type { Game } from '../../game/state';
import {
  activeEntries, arcProgress, memoryLines, nextEntry, patronOf, stageWord, stopOf, type DeepPort,
} from '../../places';
import { STAGES } from '../../places/types';
import { card, el, fold, kv } from '../dom';
import { verb } from './verb';

/**
 * The place itself, as cards: a Stop (water, a market, a rumour, a danger, generated), or a Deep port (its Patron, its
 * calendar, what it remembers). All of it reads from `places/` and `portCharacter`; none of it is written per port.
 */

/** A Stop: every port that is not a Deep port, in four lines. */
export function stopCard(g: Game, def: PortDef): HTMLElement {
  const ch = characterOf(def.id);
  const s = stopOf(g, def);
  const row = (k: string, v: string, cls = '') => el('div', { class: `stop-row ${cls}`.trim() }, el('b', {}, k), el('span', {}, v));
  return verb('town.place', el('div', { class: 'port-character stop' },
    el('div', { class: 'port-character-eyebrow' }, 'A stop'),
    el('h2', {}, ch?.signature ?? def.name),
    row('Water', s.water),
    row('Market', s.market),
    row('Said here', s.rumour),
    row('Danger', s.danger, ch?.danger ? 'danger' : ''),
    ch?.custom ? el('p', { class: 'stop-custom' }, ch.custom) : null,
  ));
}

/** What the place is known for, for a Deep port: the signature, the custom and the danger, then its calendar. */
export function deepPlaceCard(g: Game, def: PortDef, deep: DeepPort): HTMLElement {
  const ch = characterOf(def.id);
  const now = activeEntries(deep, g.clock.t);
  const next = nextEntry(deep, g.clock.t);
  return verb('town.place', el('div', { class: 'port-character deep' },
    el('div', { class: 'port-character-eyebrow' }, 'Known for'),
    el('h2', {}, ch?.signature ?? def.name),
    el('p', {}, def.blurb),
    ch?.custom ? el('p', {}, ch.custom) : null,
    ch?.danger ? el('p', { class: 'port-character-danger' }, ch.danger) : null,
    el('div', { class: 'calendar' },
      el('div', { class: 'calendar-head' }, 'The calendar'),
      ...(now.length
        ? now.map((e) => el('p', { class: `calendar-now ${e.kind}` }, el('b', {}, e.name), ` — ${e.text}`))
        : [el('p', { class: 'calendar-now' }, 'Nothing in particular is running; the beach is as it is.')]),
      next ? el('p', { class: 'calendar-next' }, `Next: ${next.entry.name}, in about ${next.days} days.`) : null,
    ),
  ));
}

/** The Patron: who he is, what he thinks of you and why, what he gives, and where his story stands. */
export function patronCard(g: Game, deep: DeepPort): HTMLElement {
  const v = patronOf(g, deep);
  const p = deep.patron;
  const arc = arcProgress(g, deep);
  const dots = STAGES.map((s) => el('span', { class: `patron-stage${s === v.stage ? ' now' : STAGES.indexOf(s) < STAGES.indexOf(v.stage) ? ' past' : ''}` }, stageWord(s)));
  return verb('place.patron', card(`${p.name}, ${p.title}`,
    el('p', { class: 'flavour' }, p.of.charAt(0).toUpperCase() + p.of.slice(1) + '.'),
    el('p', { class: 'patron-says' }, p.greet[v.stage]),
    el('div', { class: 'patron-track' }, ...dots),
    kv('To you, he is', stageWord(v.stage)),
    v.reasons.length
      ? el('ul', { class: 'list patron-reasons' }, ...v.reasons.slice(0, 4).map((r) => el('li', { class: r.delta < 0 ? 'bad' : 'good' }, `${r.delta < 0 ? '−' : '+'} ${r.why}`)))
      : el('p', { class: 'flavour' }, 'Nothing you have done on this coast has been weighed yet. Come ashore, and deal.'),
    ...v.unlocked.map((k) => el('p', { class: 'perk on' }, el('b', {}, '✓ '), k.text)),
    ...v.locked.map((k) => el('p', { class: 'perk off' }, el('b', {}, `(${stageWord(k.stage)}) `), k.text)),
    fold('Who he is', '', false, ...p.bio.map((b) => el('p', {}, b))),
    arc.total > 0
      ? el('p', { class: 'flavour' }, arc.done === arc.total
        ? 'His story with you is told.'
        : arc.next ? `His own matter (${arc.done} of ${arc.total}): it will come up on a call, when he trusts you enough to raise it.` : '')
      : null,
  ));
}

/** What the place says of what the captain did here. */
export function memoryCard(g: Game, def: PortDef): HTMLElement {
  const lines = memoryLines(g, def.id, 4);
  const pe = people(def.people);
  return verb('place.memory', card('What is remembered here',
    lines.length
      ? el('ul', { class: 'list memory' }, ...lines.map((l) => el('li', { class: l.tone < 0 ? 'bad' : l.tone > 0.2 ? 'good' : '' }, l.text)))
      : el('p', { class: 'flavour' }, `The ${pe.name} have not yet had cause to remember anything of you.`)));
}
