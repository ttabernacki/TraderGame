import { clamp } from '../../core/math';
import { people } from '../../world/peoples';
import { type PortDef } from '../../world/ports';
import { OFFICER_ROLES } from '../../crew/crew';
import { loyaltyWord } from '../../progression/officers';
import { candidatesAt, linguaCandidate } from '../../company/candidates';
import { courtCandidate } from '../../company/company';
import { backingFor, candidates, errandsAt, journeyWord, outfitCost, outstanding } from '../../progression/inland';
import type { Game } from '../../game/state';
import { button, card, el, fold, kv } from '../dom';
import { tagLast } from './verb';
import type { Ctx } from './ctx';

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

export function menSection(ctx: Ctx, host: HTMLElement, g: Game): void {
  const def = g.portHere!;
  const pe = people(def.people);
  host.append(linguaCard(ctx, g, def));
  tagLast(host, 'hands.linguas');
  const quay = courtCard(ctx, g, def);
  host.append(...quay);
  if (quay.length) tagLast(host, 'hands.men-on-quay');
  renderInland(ctx, host, g, def);

  if (g.crew.officers.some((o) => o.role === 'degredado' && o.alive && !o.ashoreAt) && def.people !== 'portuguese') {
    host.append(card('Put a man ashore',
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
  tagLast(host, 'hands.degredado');

  // A written officer's return is a scene of its own — he comes off in a canoe
  // as you stand in — so he is not collected off a list here.
  const returning = g.crew.officers.filter(
    (o) => o.ashoreAt === def.id && o.alive && !o.arc
      && o.ashoreSince !== undefined && g.clock.t - o.ashoreSince > 300 * 86400,
  );
  for (const o of returning) {
    host.append(el('div', { class: 'notice' },
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
}
