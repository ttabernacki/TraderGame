import { clamp } from '../../core/math';
import { CHEST_TONS } from '../../economy/trade';
import { OFFICER_ROLES } from '../../crew/crew';
import { loyaltyWord, officerTitle, traitDef } from '../../progression/officers';
import { RATING_LABEL, TEMPER } from '../../crew/hands';
import { ARC_BY_ID } from '../../progression/arcs';
import type { Game } from '../../game/state';
import { append, button, card, el, fold, kv } from '../dom';
import { tagLast } from './verb';
import type { Ctx } from './ctx';

export function companySection(ctx: Ctx, host: HTMLElement, g: Game): void {
  const def = g.portHere!;
  // The officers' chests: a share of the hold for their own trade.
  const officers = g.crew.officers.filter((o) => o.alive && !o.ashoreAt).length;
  host.append(fold('The officers\u2019 chests', '', false,
    el('p', { class: 'flavour' }, 'Every officer of a Portuguese ship expected room in the hold for a chest of his own, to trade on his own account. It was most of what the voyage paid him, and he took it as his right. Refuse it and you have the room, and every officer remembers it at every port.'),
    kv('Room it takes', `${(officers * CHEST_TONS).toFixed(1)} tons, for ${officers} officers`),
    el('div', { class: 'row' },
      g.trade.quintaladas
        ? button('Take the room back', () => { g.setQuintaladas(false); ctx.notice = { text: 'The chests are struck below. The wardroom says nothing, which is worse.' }; ctx.render(); })
        : button('Grant them their chests', () => { g.setQuintaladas(true); ctx.notice = { text: 'The officers\u2019 chests are stowed again, as they should have been.' }; ctx.render(); }, { primary: true })),
  ));
  tagLast(host, 'hands.chests');

  // The men forward the captain actually knows. Not the whole company — a
  // captain did not know every hand on a nau by name and this should not
  // pretend he did — but these are the ones who get named when somebody dies
  // and the ones who decide, between them, whether there is a mutiny.
  const fo = g.hands.filter((h) => h.alive && h.aboard);
  if (fo.length > 0) {
    host.append(fold('The fo’c’sle', '', false,
      el('p', { class: 'quote' },
        'The men you know by name. There are others.'),
      ...fo.map((h) => el('div', { style: { marginBottom: '8px' } },
        el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } },
          el('span', {}, `${h.name} — ${RATING_LABEL[h.rating].english.toLowerCase()}, of ${h.from}`),
          el('span', {
            style: {
              fontSize: '12.5px',
              color: h.regard < 0.3 ? 'var(--red)' : h.regard > 0.7 ? 'var(--green)' : 'var(--ink-soft)',
            },
          }, handRegardWord(h.regard)),
        ),
        el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: '1.5' } },
          TEMPER[h.temper].line),
        (h.memory?.length ?? 0) > 0
          ? el('div', { style: { fontSize: '12px', color: 'var(--ink-faint)', fontStyle: 'italic', marginTop: '2px' } },
              h.memory![0])
          : null,
      )),
    ));
  }
  tagLast(host, 'hands.focsle');

  const lost = g.hands.filter((h) => !h.alive);
  if (lost.length > 0) {
    host.append(card('Not coming home',
      el('ul', { class: 'list' }, ...lost.map((h) => el('li', {},
        el('div', {}, `${h.name}, of ${h.from}`),
        el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)' } }, h.fate ?? 'Lost.'),
      ))),
    ));
  }
  tagLast(host, 'hands.lost');

  // Who you already have, and what they are. A captain knows his own officers.
  const aboard = g.crew.officers.filter((o) => o.alive && !o.ashoreAt);
  host.append(fold('Your officers', `${aboard.length} aboard`, false,
    ...aboard.map((o) => {
      // A written man is described by what was written for him. Falling back
      // to the trait blurb put the same sentence under two different officers
      // — Gaspar and Sintra are both curious men, and the wardroom read as
      // though somebody had pasted the line twice.
      const arc = o.arc ? ARC_BY_ID.get(o.arc) : undefined;
      const line = arc?.hook ?? traitDef(o.trait)?.blurb;
      return el('div', { style: { marginBottom: '9px' } },
        el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } },
          el('span', {}, `${o.name} — ${officerTitle(o).toLowerCase()}`),
          el('span', { style: { color: 'var(--ink-soft)', fontSize: '12.5px' } }, loyaltyWord(o.loyalty)),
        ),
        line
          ? el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: '1.5' } }, line)
          : null,
      );
    }),
    el('div', { style: { marginTop: '8px' } },
      button('Pay the wardroom a month\u2019s wages', () => {
        const owed = aboard.reduce((sum, o) => sum + o.wage, 0);
        if (g.crown.gold < owed) {
          ctx.notice = { text: 'Not enough in the purse. They will remember it.', grave: true };
          for (const o of aboard) o.loyalty = clamp(o.loyalty - 0.06, 0, 1);
          ctx.render();
          return;
        }
        g.crown.gold -= owed;
        for (const o of aboard) o.loyalty = clamp(o.loyalty + 0.07, 0, 1);
        g.logEvent('crew', `Paid the officers ${owed} cruzados at ${def.name}, in coin, on the table.`);
        ctx.notice = { text: `${owed} cruzados paid out. Money on the table aft is worth more than a speech.` };
        ctx.render();
      }, { disabled: aboard.length === 0 }),
    ),
  ));
  tagLast(host, 'hands.officers-pay');

  const empty = OFFICER_ROLES.filter(
    (r) => r.role !== 'lingua' && r.role !== 'degredado'
      && !g.crew.officers.some((o) => o.alive && o.role === r.role));
  if (empty.length > 0) {
    host.append(fold('Berths standing empty', `${empty.length}`, false,
      el('p', { class: 'quote' },
        'These men were not engaged off a list and cannot be replaced off one. What they knew '
        + 'has gone with them.'),
      el('ul', { class: 'list' }, ...empty.map((r) => el('li', {},
        el('div', {}, `${r.english} \u2014 ${r.title}`),
        el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '4px', lineHeight: '1.55' } },
          r.blurb),
      ))),
    ));
  }
  tagLast(host, 'hands.berths-empty');
}
