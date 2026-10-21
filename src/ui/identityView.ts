import type { Game } from '../game/state';
import {
  CALLINGS, CALLING_IDS, CLAUSES, PATRONS, PATRON_IDS, TITLES, activeClauses, callingPending, choosePatron, chooseCalling,
  clausePrice, clausesOf, daysLeft, drawBill, favourOf, favourWord, isFallen, is as isCalling, parallelRefit, patronBlocked, putOff,
  renewClause, sendBill, strengthOf, wear, churchPolicy, cutOf, type Clause,
} from '../identity';
import { POLITY_BY_ID } from '../diplomacy/polities';
import { portDef } from '../world/ports';
import { button, card, el, kv, meter } from './dom';

type Notice = (text: string, grave?: boolean) => void;

const clauseRow = (g: Game, c: Clause, renew?: () => void): HTMLElement => {
  const pol = POLITY_BY_ID.get(c.polity);
  const def = CLAUSES[c.kind];
  const left = daysLeft(c, g.clock.t);
  return el('div', { class: 'clause-row' },
    el('div', {}, el('b', {}, def.name), ` — ${pol?.name ?? c.polity}${c.poisoned ? ' (with strings)' : ''}`),
    el('div', { class: 'gift-sub' }, c.poisoned ? def.strings : def.gives),
    el('div', { class: 'gift-sub' }, `${left > 400 ? `${(left / 365).toFixed(1)} years` : `${left} days`} to run · held against you: ${(c.offences / c.limit * 100).toFixed(0)}% of what it takes to lose it`),
    meter(Math.min(1, c.offences / c.limit), c.offences / c.limit > 0.6 ? 'bad' : c.offences / c.limit > 0.3 ? 'warn' : ''),
    renew ? button(`Renew — ${Math.round(clausePrice(pol!, c.kind) * 0.6)} cruzados in gifts`, renew) : null);
};

/** Treaty clauses in force and the recent ends of them: Orders > Courts, and the Fort & Court quarter. */
export function clauseCard(g: Game, rerender: () => void, say: Notice, polityId?: string): HTMLElement {
  const now = g.clock.t;
  const live = activeClauses(g.ledger, now, polityId);
  const ended = clausesOf(g.ledger, now).filter((c) => (!polityId || c.polity === polityId) && !live.includes(c)).slice(-4).reverse();
  return card(polityId ? 'Grants in force here' : 'Treaty clauses',
    live.length === 0
      ? el('p', { class: 'flavour' }, 'No court holds a grant with you. A set piece at a court, or the terms of an audience, can end in one: free dues, berth and watering, first call on its goods, a licence to wall a House, a pilot, the letter honoured, men for hire.')
      : null,
    ...live.map((c) => clauseRow(g, c, () => { const r = renewClause(g, c.id); say(r.text, !r.ok); rerender(); })),
    ended.length > 0 ? el('div', { class: 'terms-head' }, 'Ended') : null,
    ...ended.map((c) => el('p', { class: 'gift-sub' }, `${CLAUSES[c.kind].name}, ${POLITY_BY_ID.get(c.polity)?.name ?? c.polity}: ${c.status === 'revoked' ? 'withdrawn — too much held against you' : c.status === 'renewed' ? 'renewed' : 'ran its term'}.`)));
}

/** The patron of record, as a pick at Lisbon before sailing. */
export function patronCard(g: Game, rerender: () => void, say: Notice): HTMLElement {
  const here = g.dockedAt === 'lisboa';
  return card('Who you sail for',
    el('p', { class: 'flavour' }, 'Each voyage is made for a patron of record: it puts its orders on the table, keeps a cut of the pay, and has an agenda of its own. A patron that falls pulls its clients down; leave it in time and you are spared.'),
    ...PATRON_IDS.map((id) => {
      const d = PATRONS[id];
      const why = patronBlocked(g, id);
      const mine = g.identity.patron === id;
      const fallen = isFallen(g, id);
      return el('div', { class: `patron-row${mine ? ' on' : ''}` },
        el('div', {}, el('b', {}, d.name), mine ? ' — yours this voyage' : '', fallen ? ' — fallen, for now' : ''),
        el('div', { class: 'gift-sub' }, `${d.gives} Keeps ${Math.round(cutOf(g, id) * 100)}% of the pay.${id === 'church' ? ` Its policy: ${churchPolicy(g.clock.t) === 'press' ? 'the font for every people' : 'patience with other rites'}.` : ''}`),
        el('div', { class: 'gift-sub' }, `It thinks of you: ${favourWord(favourOf(g, id))} · at court: ${strengthOf(g, id) > 0.7 ? 'strong' : strengthOf(g, id) > 0.35 ? 'holding' : 'weak'}${g.identity.patrons[id].ruined !== null ? ' · it ruined you' : ''}`),
        why ? el('p', { class: 'gift-sub bad' }, why) : null,
        !mine ? button(`Sail for ${d.short}`, () => { const r = choosePatron(g, id); say(r.text, !r.ok); rerender(); }, { disabled: !here || !!why, title: !here ? 'Chosen at Lisbon' : undefined }) : null);
    }));
}

/** At the end of Act I: the Calling, once. */
export function callingPickCard(g: Game, rerender: () => void, say: Notice): HTMLElement | null {
  if (!callingPending(g)) return null;
  return card('A calling',
    el('p', { class: 'flavour' }, 'The first act is behind you. A captain is known for one thing he can do that others cannot. Chosen once; it unlocks a verb, and costs nothing.'),
    ...CALLING_IDS.map((id) => {
      const d = CALLINGS[id];
      return el('div', { class: 'patron-row' },
        el('div', {}, el('b', {}, `${d.english}`), ` — ${d.verb}`), el('div', { class: 'gift-sub' }, d.blurb),
        button(`Be a ${d.english}`, () => { const r = chooseCalling(g, id); say(r.text, !r.ok); rerender(); }));
    }));
}

/** The captain: name, titles worn and earned, patrons, Calling and its verbs. Orders > Captain. */
export function captainCards(g: Game, rerender: () => void, say: Notice): HTMLElement[] {
  const out: HTMLElement[] = [];
  const id = g.identity;
  out.push(card(id.name || 'The captain',
    kv('Rank', g.crown.title.english),
    kv('Calling', id.calling ? CALLINGS[id.calling].english : g.chronicle.act >= 2 ? 'not yet chosen' : 'chosen at the end of the first act'),
    id.calling ? el('p', { class: 'flavour' }, `${CALLINGS[id.calling].verb}. ${CALLINGS[id.calling].blurb}`) : null));
  const pick = callingPickCard(g, rerender, say);
  if (pick) out.push(pick);

  const earned = TITLES.filter((t) => id.titles[t.id]);
  out.push(card(`Titles (${id.worn.length} of 3 worn)`,
    earned.length === 0 ? el('p', { class: 'flavour' }, 'None yet. A title is earned by what the Book says you did, never picked; word of it runs down the road ahead of you, and is changed in the telling.') : null,
    ...earned.map((t) => {
      const worn = id.worn.includes(t.id);
      return el('div', { class: `patron-row${worn ? ' on' : ''}` },
        el('div', {}, el('b', {}, t.name), ` — ${t.english}`),
        el('div', { class: 'gift-sub' }, t.hint),
        el('div', { class: 'gift-sub' }, `Opens: ${t.opens} Shuts: ${t.shut}`),
        worn ? button('Put off', () => { putOff(g, t.id); rerender(); }, { ghost: true })
          : button('Wear', () => { const r = wear(g, t.id); say(r.text, !r.ok); rerender(); }, { disabled: id.worn.length >= 3 }));
    }),
    TITLES.length > earned.length ? el('p', { class: 'gift-sub' }, `${TITLES.length - earned.length} more are still to be earned.`) : null));

  out.push(patronCard(g, rerender, say));

  if (id.calling) {
    const rows: (HTMLElement | null)[] = [];
    if (isCalling(g, 'factor')) {
      for (const f of g.liveFactories) {
        rows.push(el('div', { class: 'row' }, el('span', {}, `${portDef(f.portId).name}: ${Math.floor(f.chest)} cruzados in the chest`),
          button('Draw a bill', () => { const r = drawBill(g, f.portId); say(r.text, !r.ok); rerender(); }, { disabled: !g.dockedAt || Math.floor(f.chest) < 10 }),
          button('Send 100', () => { const r = sendBill(g, f.portId, 100); say(r.text, !r.ok); rerender(); }, { ghost: true, disabled: g.crown.gold < 100 })));
      }
      if (g.liveFactories.length === 0) rows.push(el('p', { class: 'gift-sub' }, 'No House yet. You may found one where no court has given leave.'));
    }
    if (isCalling(g, 'builder')) {
      rows.push(button('Have the yard do every job at once', () => { const r = parallelRefit(g); say(r.text, !r.ok); rerender(); }, { disabled: !g.dockedAt }));
      rows.push(el('p', { class: 'gift-sub' }, 'Lines of your own are drawn at the Ribeira, under Yard.'));
    }
    if (isCalling(g, 'pilot')) rows.push(el('p', { class: 'gift-sub' }, 'Let go in a harbour from fourteen miles off at night or in fog, and survey the offing at twice the rate. Nothing to press: it is there when you need it.'));
    if (isCalling(g, 'master')) rows.push(el('p', { class: 'gift-sub' }, `Court a second man for any seat; his voice is heard in counsel. Second seats kept: ${id.seats}.`));
    out.push(card(`The ${CALLINGS[id.calling].english}’s verbs`, ...rows));
  }
  return out;
}
