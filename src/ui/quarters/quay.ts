import { people } from '../../world/peoples';
import type { Game } from '../../game/state';
import { dismissHomecoming, pendingHomecoming } from '../../game/year';
import { deepPort, homecomingWord } from '../../places';
import { button, card, el, fold } from '../dom';
import type { Ctx } from './ctx';
import { deepPlaceCard, memoryCard, patronCard, stopCard } from './place';
import { personAt } from './person';
import { verb } from './verb';

/** The quay: who is here, what the place is, and what is wrong with her before she sails. */
export function quaySection(ctx: Ctx, host: HTMLElement, g: Game): void {
  const def = g.portHere!;
  const rel = g.relationsFor(def.id);
  const pe = people(def.people);
  const unknown = !g.peopleKnown(def) && !rel.met;
  const deep = deepPort(def.id);

  // The facts of the place, in one line: who they are, how they take you, and what the harbour is.
  const faith = { catholic: 'Catholic', muslim: 'Muslim', hindu: 'Hindu', traditional: 'their own gods', buddhist: 'Buddhist', confucian: 'of the Ming order' }[pe.faith];
  const chip = (k: string, v: string, cls = '') => el('span', { class: cls }, el('b', {}, k), v);
  host.append(verb('town.strip', el('div', { class: 'port-strip' },
    chip('', `${pe.name} · ${pe.language} · ${faith}`),
    def.people === 'portuguese' ? null : chip('Regard', regardWord(rel.regard), rel.regard > 0.2 ? 'good' : rel.regard < -0.2 ? 'bad' : ''),
    def.people === 'portuguese' ? null : chip('Trade', rel.mayTrade ? 'leave granted' : 'no leave yet', rel.mayTrade ? 'good' : 'bad'),
    rel.exclusive ? chip('', 'exclusive terms', 'good') : null,
    rel.factory ? chip('', 'ground for a House', 'good') : null,
    chip('Shelter', qualityWord(def.anchorage)),
    chip('Victuals', qualityWord(def.refit)),
    chip('', { anchorage: 'a bare roadstead', village: 'a village', town: 'a town', city: 'a city', emporium: 'a great emporium' }[def.size]),
  )));

  const left = el('div', {});
  const right = el('div', {});

  // The Year (game/year.ts): the homecoming card, once, with the Lisbon patrons' answers to it. The quarters panel is the Fort & Court's.
  const home = pendingHomecoming(g);
  if (home) {
    left.append(verb('town.homecoming', card(`Home from the sea: year ${home.year}`,
      ...home.lines.map((l, i) => el('p', i === 0 ? { class: 'epilogue-lede' } : {}, l)),
      ...homecomingWord(g, home).map((l) => el('p', { class: 'flavour' }, l)),
      el('div', { class: 'row' }, button('Lay it by', () => { dismissHomecoming(g); ctx.render(); }, { primary: true })))));
  }
  // Coming among a people nobody from Europe has met is the single most dramatic thing in the game.
  if (unknown) {
    left.append(verb('town.first-contact', el('div', { class: 'first-contact' },
      el('div', { class: 'first-contact-eyebrow' }, 'No Portuguese has stood here before'),
      el('h2', {}, `The ${pe.name}`),
      el('p', {}, firstContactLine(pe)),
      el('p', { class: 'first-contact-do' },
        'Nothing may be bought or sold until whoever governs the place has seen you '
        + 'and decided what you are. Seek an audience.'),
    )));
  } else if (!rel.mayTrade && def.people !== 'portuguese') {
    left.append(el('div', { class: 'notice' },
      'You have no leave to trade here. Seek an audience with whoever governs the place before you open the hold.'));
  }

  // A person with something to put to the captain this call (storylets/engine), then anybody with a story to take up.
  personAt(ctx, left, g, 'waterfront');
  // Somebody on the quay with a story. See progression/quests.
  const offers = g.questOffersHere();
  if (offers.length) {
    const box = verb('town.quest-offers', el('div', {}));
    for (const offer of offers) {
      const o = offer.offer(g);
      box.append(el('div', { class: 'quest-offer' },
        el('div', { class: 'quest-offer-eyebrow' }, o.who),
        el('h2', {}, offer.title),
        el('p', {}, o.text),
        el('div', { class: 'row' },
          button(o.accept, () => {
            ctx.notice = { text: g.acceptQuest(offer.id) };
            ctx.render();
          }, { primary: true }),
        ),
      ));
    }
    left.append(box);
  }

  // The place itself: a Deep port, with a Patron and a calendar, or a Stop in four lines.
  left.append(deep ? deepPlaceCard(g, def, deep) : stopCard(g, def));
  left.append(memoryCard(g, def));

  // A Deep port's Patron sits at the head of the right-hand column, where a call begins.
  if (deep) right.append(patronCard(g, deep));

  // Before you sail: what is wrong with her, first and alone.
  const checks = g.readiness();
  const wrong = checks.filter((c) => c.state !== 'good');
  const row = (c: typeof checks[number]) => el('div', { class: `ready-row ${c.state}` },
    el('div', { class: 'ready-line' }, el('span', {}, c.label), el('em', {}, c.value)),
    c.note ? el('div', { class: 'ready-note' }, c.note) : null);
  right.append(verb('town.readiness', wrong.length
    ? card(wrong.some((c) => c.state === 'bad') ? 'Before you sail — she is not ready' : 'Before you sail',
      ...wrong.map(row),
      checks.length > wrong.length
        ? el('div', { class: 'ready-note', style: { marginTop: '6px' } },
          `${checks.filter((c) => c.state === 'good').map((c) => c.label.toLowerCase()).join(', ')}: all well.`)
        : null)
    : fold('Before you sail', 'She is ready for sea.', false, ...checks.map(row))));

  // Soundings, which are what make the lead line worth heaving on a coast nobody from Lisbon has sounded.
  const soundPrice = g.localSoundingsPrice();
  if (soundPrice !== null) {
    right.append(verb('town.soundings', card('The local pilots',
      el('p', {}, 'A pilot here knows the bottom for a hundred and fifty miles each way. With it in the '
        + 'book, the lead tells you how far off the land you are, not just how deep the water is.'),
      button(`Buy his soundings — ${soundPrice} cruzados`, () => {
        ctx.notice = { text: g.buyLocalSoundings() };
        ctx.render();
      }, { disabled: g.crown.gold < soundPrice }),
    )));
  }

  // The people at length, for a captain who wants to read about them.
  if (!unknown) right.append(verb('town.about-people', fold(`About the ${pe.name}`, '', false, el('p', {}, pe.blurb))));

  const monsoon = g.monsoonNow();
  if (monsoon) {
    right.append(verb('town.season-wait', card('The season',
      el('p', { style: { fontSize: '13.5px' } }, `${monsoon.name}. ${monsoon.carries}`),
      el('p', { style: { fontSize: '13px', fontStyle: 'italic', color: 'var(--ink-soft)' } }, monsoon.against),
      el('div', { class: 'row', style: { alignItems: 'center' } },
        el('span', { style: { fontSize: '12.5px', color: 'var(--ink-soft)' } },
          `${Math.round(monsoon.daysToTurn)} days to the turn`),
        button('Lie here until the wind comes round', () => {
          ctx.notice = { text: g.waitForTheMonsoon() };
          ctx.render();
        }),
      ),
    )));
  }

  host.append(el('div', { class: 'cols side' }, left, right));
}

/**
 * What a captain would actually want to know, standing on the poop looking at a
 * shore nobody has described to him: what they speak, what they believe, and
 * whether his hold full of brass is treasure or an insult.
 */
function firstContactLine(pe: ReturnType<typeof people>): string {
  const tongue = `They speak ${pe.language}, and no one aboard has a word of it.`;
  const faith = {
    catholic: 'They are Christians.',
    muslim: 'They are Muslims, and have been for six hundred years.',
    hindu: 'Their faith has no name in any book in Lisbon.',
    buddhist: 'Their faith has no name in any book in Lisbon.',
    confucian: 'They keep the rites of the Son of Heaven.',
    traditional: 'They keep their own gods.',
  }[pe.faith];
  const world = pe.sophistication > 0.7
    ? 'They have traded with the whole of the known world for longer than Portugal has existed; '
      + 'what is in your hold will not impress them.'
    : pe.sophistication > 0.35
      ? 'They know the sea, and the peoples on either side of them, and they will drive a hard bargain.'
      : 'Nothing like this ship has ever come here.';
  const rival = pe.rivalNetwork
    ? ' There are Arab merchants ashore who understood what you are before you did.'
    : '';
  return `${pe.blurb} ${tongue} ${faith} ${world}${rival}`;
}

export function qualityWord(q: number): string {
  if (q > 0.8) return 'Excellent';
  if (q > 0.6) return 'Good';
  if (q > 0.4) return 'Fair';
  if (q > 0.2) return 'Poor';
  return 'Wretched';
}

export function regardWord(r: number): string {
  if (r > 0.6) return 'Warm';
  if (r > 0.25) return 'Friendly';
  if (r > -0.1) return 'Neutral';
  if (r > -0.45) return 'Cool';
  return 'Hostile';
}
