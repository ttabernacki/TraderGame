import { clamp } from '../../core/math';
import { good } from '../../economy/goods';
import { CHEST_TONS } from '../../economy/trade';
import { people } from '../../world/peoples';
import { type PortDef } from '../../world/ports';
import { OFFICER_ROLES } from '../../crew/crew';
import { loyaltyWord, officerTitle, traitDef } from '../../progression/officers';
import { RATING_LABEL, TEMPER } from '../../crew/hands';
import { ARC_BY_ID } from '../../progression/arcs';
import { candidatesAt, linguaCandidate } from '../../company/candidates';
import { courtCandidate } from '../../company/company';
import { backingFor, candidates, errandsAt, journeyWord, outfitCost, outstanding } from '../../progression/inland';
import type { Game } from '../../game/state';
import { append, button, card, el, fold, kv } from '../dom';
import type { Ctx } from './ctx';

export function renderHands(ctx: Ctx, host: HTMLElement, g: Game): void {
  const def = g.portHere!;
  const pe = people(def.people);

  const left = el('div', {});
  const shortfall = g.crew.complement - g.crew.count;
  const wage = g.handWage();
  const cost = shortfall * wage;
  const known = g.hands.filter((h) => h.alive && h.aboard).length;
  left.append(card('Hands',
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

  // The officers' chests: a share of the hold for their own trade.
  const officers = g.crew.officers.filter((o) => o.alive && !o.ashoreAt).length;
  left.append(fold('The officers\u2019 chests', '', false,
    el('p', { class: 'flavour' }, 'Every officer of a Portuguese ship expected room in the hold for a chest of his own, to trade on his own account. It was most of what the voyage paid him, and he took it as his right. Refuse it and you have the room, and every officer remembers it at every port.'),
    kv('Room it takes', `${(officers * CHEST_TONS).toFixed(1)} tons, for ${officers} officers`),
    el('div', { class: 'row' },
      g.trade.quintaladas
        ? button('Take the room back', () => { g.setQuintaladas(false); ctx.notice = { text: 'The chests are struck below. The wardroom says nothing, which is worse.' }; ctx.render(); })
        : button('Grant them their chests', () => { g.setQuintaladas(true); ctx.notice = { text: 'The officers\u2019 chests are stowed again, as they should have been.' }; ctx.render(); }, { primary: true })),
  ));

  // The men forward the captain actually knows. Not the whole company — a
  // captain did not know every hand on a nau by name and this should not
  // pretend he did — but these are the ones who get named when somebody dies
  // and the ones who decide, between them, whether there is a mutiny.
  const fo = g.hands.filter((h) => h.alive && h.aboard);
  if (fo.length > 0) {
    left.append(fold('The fo’c’sle', '', false,
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

  const lost = g.hands.filter((h) => !h.alive);
  if (lost.length > 0) {
    left.append(card('Not coming home',
      el('ul', { class: 'list' }, ...lost.map((h) => el('li', {},
        el('div', {}, `${h.name}, of ${h.from}`),
        el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)' } }, h.fate ?? 'Lost.'),
      ))),
    ));
  }

  // Who you already have, and what they are. A captain knows his own officers.
  const aboard = g.crew.officers.filter((o) => o.alive && !o.ashoreAt);
  left.append(fold('Your officers', `${aboard.length} aboard`, false,
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

  const right = el('div', {});

  // Berths standing empty.
  //
  // There is no list of officers for sale here any more. The company is the
  // one she sailed with out of the Tagus, and when one of them is gone the
  // berth is simply empty — which is worth saying plainly, because the ship
  // then works slightly worse in a way the captain ought to be able to
  // account for.
  // The one berth that can still be filled off a quay. See Game.linguaOffer:
  // nobody carried a fixed interpreter down that coast, they picked men up,
  // and a captain who cannot do that is reduced to shouting at strangers.
  right.append(linguaCard(ctx, g, def));
  right.append(...courtCard(ctx, g, def));

  const empty = OFFICER_ROLES.filter(
    (r) => r.role !== 'lingua' && r.role !== 'degredado'
      && !g.crew.officers.some((o) => o.alive && o.role === r.role));
  if (empty.length > 0) {
    right.append(fold('Berths standing empty', `${empty.length}`, false,
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

  renderInland(ctx, right, g, def);

  if (g.crew.officers.some((o) => o.role === 'degredado' && o.alive && !o.ashoreAt) && def.people !== 'portuguese') {
    right.append(card('Put a man ashore',
      el('p', { class: 'quote' },
        'The practice was to land a condemned man among strangers and come back for him. If he lived he had the language and his pardon; if not, the Crown had lost nothing it valued. Several of the men who made the Portuguese empire possible began as convicts left on a beach.'),
      button('Land the degredado here', () => {
        const d = g.crew.officers.find((o) => o.role === 'degredado' && o.alive && !o.ashoreAt)!;
        d.ashoreAt = def.id;
        d.ashoreSince = g.clock.t;
        g.logEvent('contact', `Put ${d.name} ashore at ${def.name} to learn the tongue. He was told he would be collected. He did not appear to believe it.`, true);
        ctx.notice = { text: `${d.name} is ashore. Return in a year and he may be worth a great deal.` };
        ctx.render();
      }),
    ));
  }

  // A written officer's return is a scene of its own — he comes off in a canoe
  // as you stand in — so he is not collected off a list here.
  const returning = g.crew.officers.filter(
    (o) => o.ashoreAt === def.id && o.alive && !o.arc
      && o.ashoreSince !== undefined && g.clock.t - o.ashoreSince > 300 * 86400,
  );
  for (const o of returning) {
    right.append(el('div', { class: 'notice' },
      `${o.name} is on the beach, thinner and browner and speaking ${pe.language}. `,
      button('Take him back aboard', () => {
        o.ashoreAt = undefined;
        if (!o.languages.includes(pe.language)) o.languages.push(pe.language);
        o.role = 'lingua';
        o.ability = clamp(o.ability + 0.25, 0, 0.95);
        g.logEvent('contact', `${o.name} came off in a canoe, having lived a year among the people of ${def.name}. He has their language, and a good deal else besides.`, true);
        ctx.notice = { text: `${o.name} is aboard again, and is now your interpreter.` };
        ctx.render();
      })));
  }

  host.append(el('div', { class: 'cols two' }, left, right));
}

/**
 * Named men on this quay for a berth that stands empty (and the Melinde pilot, who is asked, not
 * hired). The random-hire generator is gone: each of them has a name and a line of where he is from.
 */
export function courtCard(ctx: Ctx, g: Game, def: PortDef): HTMLElement[] {
  const here = candidatesAt(g, def.id);
  if (here.length === 0) return [];
  return [card('Men on the quay',
    el('p', { class: 'quote' },
      'Nobody is engaged off a list. Each of these has a name, and a reason for being on this quay, '
      + 'and will tell you what he thinks of the ship before he takes service in her.'),
    el('ul', { class: 'list' }, ...here.map((c) => {
      const why = c.gate?.(g) ?? null;
      const role = OFFICER_ROLES.find((r) => r.role === c.role);
      return el('li', {},
        el('div', { style: { display: 'flex', justifyContent: 'space-between' } },
          el('span', {}, `${c.name} \u2014 ${role?.english ?? c.role}`),
          el('span', { class: 'tag' }, `${c.cost} cruzados, ${c.wage} a month`)),
        el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', margin: '4px 0', lineHeight: '1.55' } }, c.backstory),
        why ? el('div', { class: 'notice', style: { fontSize: '12.5px' } }, why) : null,
        button(c.id === 'hamisi' ? 'Ask him to take service' : 'Court him',
          () => { ctx.notice = { text: courtCandidate(g, c.id) }; ctx.render(); },
          { disabled: !!why || g.crown.gold + g.creditFree < c.cost, ghost: true }),
      );
    })),
  )];
}

/** Interpreters: the ones aboard, and the one this quay can supply. */
export function linguaCard(ctx: Ctx, g: Game, def: PortDef): HTMLElement {
  const aboard = g.linguas();
  const offer = g.linguaOffer(def);
  const langs = g.linguaLanguagesAt(def);
  const portuguese = def.people === 'portuguese';

  return fold('Línguas', '', false,
    el('p', { class: 'quote' },
      'An audience with a people whose tongue nobody aboard has is conducted in signs, and '
      + 'goes about as well as that sounds. An interpreter is the difference between being '
      + 'received and being tolerated.'),
    aboard.length > 0
      ? el('div', { style: { marginBottom: '10px' } },
          ...aboard.map((o) => kv(o.name,
            `${o.languages.join(', ')} · ${(o.ability * 100).toFixed(0)} · ${loyaltyWord(o.loyalty)}`)))
      : el('p', { style: { fontSize: '13px' } },
          'Nobody aboard speaks anything but Portuguese.'),

    portuguese
      ? (langs.length > 0
          ? el('div', {},
              el('p', { style: { fontSize: '13px' } },
                'There are men on this waterfront who were brought home off that coast and have '
                + 'been here long enough to be useful in both directions.'),
              el('div', { class: 'row', style: { flexWrap: 'wrap' } },
                ...langs.filter((lang) => linguaCandidate(g, lang, true)).slice(0, 5).map((lang) => button(
                  `${lang} (${linguaCandidate(g, lang, true)!.name}) — ${offer.cost}`,
                  () => { ctx.notice = { text: g.engageLingua(def, lang) }; ctx.render(); },
                  { disabled: g.crown.gold + g.creditFree < offer.cost },
                )),
              ),
            )
          : el('p', { style: { fontSize: '13px', color: 'var(--ink-soft)' } },
              'Nobody here has a tongue you have any use for yet. Go and meet somebody, and '
              + 'there will be a man on this quay who can talk to them.'))
      : offer.can
        ? el('p', { class: 'notice' }, offer.can)
        : el('div', {},
            el('p', { style: { fontSize: '13px' } },
              (() => {
                const cand = linguaCandidate(g, offer.language, false);
                return cand
                  ? `${cand.name} will take service and has ${cand.languages.join(', ')}. ${cand.backstory}`
                  : `A man of this place has ${offer.language}.`;
              })()),
            el('div', { class: 'row' },
              button(`Engage him — ${offer.cost} cruzados`, () => {
                ctx.notice = { text: g.engageLingua(def, offer.language) };
                ctx.render();
              }, { primary: true }),
            ),
          ),
  );
}

/**
 * The one thing in this game you can do that is not on the water.
 *
 * Two cards, and the second is the more important of them: the men who are
 * already out there. A captain who sent somebody up a river in 1484 and has
 * been at sea since needs to be told, every time he makes a port on this
 * coast, that there is a man of his inland and roughly how long he has been
 * there — otherwise the three years are not felt, they are merely elapsed.
 */
export function renderInland(ctx: Ctx, right: HTMLElement, g: Game, def: PortDef): void {
  const out = outstanding(g);
  if (out.length > 0) {
    right.append(card('Men inland',
      ...out.map((j) => el('p', {}, journeyWord(g, j))),
    ));
  }

  const errands = errandsAt(def);
  const men = candidates(g);
  if (errands.length === 0 || men.length === 0) return;

  const chosen = ctx.inlandMan && men.some((m) => m.id === ctx.inlandMan)
    ? men.find((m) => m.id === ctx.inlandMan)!
    : men[0];
  const backing = backingFor(g, def, chosen);

  right.append(fold('Send a man inland', '', false,
    el('p', { class: 'quote' },
      'The Crown did this for sixty years and it was never once a small thing. A man walks '
      + 'away from the coast with a letter and a bag of goods, and either he comes back with '
      + 'something nobody in Europe knows, or he does not come back. Pêro da Covilhã went out '
      + 'in 1487, reached Calicut, sent word that the ocean was open, and was never allowed '
      + 'home.'),
    el('div', { class: 'hud-row', style: { marginBottom: '8px' } },
      el('span', { class: 'k' }, 'Who goes'),
      el('span', { class: 'v' },
        ...men.map((m) => button(m.name, () => {
          ctx.inlandMan = m.id;
          ctx.render();
        }, { primary: m.id === chosen.id }))),
    ),
    kv('His chances', backing > 0.6 ? 'Good — he has the tongue and they know you here'
      : backing > 0.38 ? 'Fair. He will be passed from hand to hand and it will be slow.'
        : 'Poor. He has no language and no friends on this coast.'),
    el('p', { style: { fontSize: '13px', fontStyle: 'italic', color: 'var(--ink-soft)' } },
      'Chances turn on his own quality, on whether he speaks their language, and on what '
      + 'they think of you here. Nothing else.'),
    ...errands.map((e) => el('div', {
      style: { marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(90,74,55,0.2)' },
    },
      el('div', { style: { fontSize: '15px', marginBottom: '5px' } }, e.name),
      el('p', { class: 'quote' }, e.brief),
      el('p', { style: { fontSize: '13px' } }, e.hope),
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '8px' } },
        el('span', { style: { fontSize: '13px', color: 'var(--ink-soft)' } },
          `${outfitCost(e)} cruzados of goods · ${e.years.toFixed(1)} years at best`),
        button(`Send ${chosen.name}`, () => {
          ctx.notice = { text: g.sendInland(def, chosen.id, e.id) };
          ctx.inlandMan = null;
          ctx.render();
        }, { primary: g.crown.gold >= outfitCost(e) }),
      ),
    )),
  ));
}
