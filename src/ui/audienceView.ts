import { clamp } from '../core/math';
import { good, GIFT_GOODS } from '../economy/goods';
import { people } from '../world/peoples';
import { hasInterpreterFor } from '../crew/crew';
import {
  ASK_LABEL, evaluate, expectedGift, measureWord, offerLabel, rulerName, standingWord,
  type Ask, type Deal, type Offer, type PolityState, type Verdict,
} from '../diplomacy/courts';
import { TEMPER_WORD, polityOfPort, type PolityDef } from '../diplomacy/polities';
import type { Game } from '../game/state';
import { button, card, clear, el, kv, meter } from './dom';

type Phase = 'protocol' | 'gifts' | 'terms' | 'verdict' | 'done';

/**
 * An audience: a negotiation with a ruler and his court.
 *
 * Four beats, as it went. The protocol of the place, which a man who knows
 * these people gets right and a stranger gets wrong. The presents, which say
 * who you are before you have said anything. The terms — what you ask, what
 * you offer — weighed by every voice in the court, which you can watch lean as
 * you build the deal if you know the court well enough to read it. And the
 * answer, which may be a counter-offer. What is agreed is written down, and
 * what is promised must be kept.
 */
export class AudienceView {
  root = el('div', { class: 'screen' });
  private body = el('div', { class: 'screen-body' });
  private head = el('div', { class: 'screen-head' });
  private foot = el('div', { class: 'screen-foot' });
  private game: Game | null = null;
  private pol: PolityDef | null = null;
  private phase: Phase = 'protocol';
  private customIdx = 0;
  private log: { who: 'them' | 'you' | 'narrator'; text: string }[] = [];
  private giftPicks = new Map<string, number>();
  private deal: Deal = this.blankDeal();
  private verdict: Verdict | null = null;
  private pressed = false;
  private result = '';

  constructor(private onClose: () => void) {
    this.root.append(this.head, this.body, this.foot);
  }

  private blankDeal(): Deal {
    return { asks: [], offers: [], giftValue: 0, giftLoved: false, giftScorned: false, protocol: 'none', comprehension: 0.3 };
  }

  open(g: Game): void {
    this.game = g;
    const def = g.portHere;
    if (!def) return;
    this.pol = polityOfPort(def.id);
    if (!this.pol) { this.onClose(); return; }
    const st = g.polityState(this.pol.id);
    st.met = true;
    this.phase = 'protocol';
    this.deal = this.blankDeal();
    this.deal.comprehension = this.comprehension(g);
    this.giftPicks.clear();
    this.verdict = null;
    this.pressed = false;
    this.result = '';
    this.customIdx = Math.floor(g.rng.next() * this.pol.customs.length);
    const rel = g.relationsFor(def.id);
    if (!rel.mayTrade) this.deal.asks = ['trade'];
    this.log = [{
      who: 'narrator',
      text: `You are brought before ${rulerName(this.pol, st)}, ${this.pol.title} of ${def.name}. `
        + (this.deal.comprehension < 0.3
          ? 'Nobody aboard has their tongue, and whatever passes will pass by signs.'
          : this.deal.comprehension < 0.6 ? 'There is a language in common, of a sort.' : 'Your interpreter stands at your shoulder.'),
    }];
    this.render();
  }

  private comprehension(g: Game): number {
    const def = g.portHere!;
    const p = people(def.people);
    const interp = hasInterpreterFor(g.crew, p.language);
    if (interp) return clamp(0.55 + interp.ability * 0.45, 0, 1);
    const st = g.polityState(this.pol!.id);
    const arabic = p.rivalNetwork && hasInterpreterFor(g.crew, 'Árabe') ? 0.55 : 0;
    return Math.max(arabic, 0.12 + st.knowledge * 0.5);
  }

  private get st(): PolityState {
    return this.game!.polityState(this.pol!.id);
  }

  private render(): void {
    const g = this.game!;
    const pol = this.pol!;
    const def = g.portHere!;
    const st = this.st;

    clear(this.head);
    this.head.append(
      el('h1', {}, `Audience with ${rulerName(pol, st)}`),
      el('div', { class: 'sub' }, `${pol.title} · ${pol.name}`),
    );
    clear(this.foot);
    this.foot.append(
      this.phase === 'done'
        ? button('Return aboard', () => this.onClose(), { primary: true })
        : button('Withdraw', () => {
          this.result = g.concludeTreaty(def, this.deal, { ...(this.verdict ?? this.preview()), accepted: false });
          this.phase = 'done';
          this.render();
        }),
    );

    clear(this.body);
    const left = el('div', {});
    left.append(this.courtCard(pol, st));
    left.append(card('', el('div', { class: 'audience-log' },
      ...this.log.map((l) => el('div', { class: `audience-line ${l.who}` }, l.text)))));

    const right = el('div', {});
    if (this.phase === 'protocol') right.append(this.protocolPanel(g, pol, st));
    else if (this.phase === 'gifts') right.append(this.giftPanel(g, pol));
    else if (this.phase === 'terms') right.append(this.termsPanel(g, pol, st));
    else if (this.phase === 'verdict') right.append(this.verdictPanel(g, pol));
    else right.append(card('It is settled', el('p', {}, this.result)));

    this.body.append(el('div', { class: 'cols side' }, left, right));
  }

  // -------------------------------------------------------------------------

  private courtCard(pol: PolityDef, st: PolityState): HTMLElement {
    const know = st.knowledge;
    const v = this.preview();
    return card(pol.name,
      el('p', { class: 'flavour' }, pol.blurb),
      kv(pol.title, rulerName(pol, st)),
      kv('His nature', know >= 0.2 ? TEMPER_WORD[st.temper] : 'You do not know him yet'),
      kv('He wants', know >= 0.2 ? pol.wants.map((w) => good(w).english).join(', ') : '…'),
      kv('Where you stand', standingWord(st)),
      el('div', { class: 'measures' },
        el('span', {}, `Trust: ${measureWord(st.trust)}`),
        el('span', {}, `Respect: ${measureWord(st.respect)}`),
        el('span', {}, `Interest: ${measureWord(st.interest)}`)),
      kv('Understood', `${Math.round(this.deal.comprehension * 100)}%`),
      meter(this.deal.comprehension, this.deal.comprehension < 0.3 ? 'warn' : ''),
      el('div', { class: 'court-factions' },
        el('div', { class: 'court-factions-head' }, know >= 0.35 ? 'The court, on what you propose' : 'The court (you cannot read it well yet)'),
        ...v.factions.map((f, i) => el('div', { class: 'court-faction' },
          el('span', {}, f.name),
          el('span', { class: 'court-weight' }, `${Math.round(pol.factions[i].weight * 100)}% of the voice`),
          know >= 0.35
            ? meter((f.approval + 1) / 2, f.approval < -0.1 ? 'bad' : f.approval < 0.15 ? 'warn' : '')
            : el('em', {}, f.approval > 0.2 ? 'seems warm' : f.approval < -0.2 ? 'seems cold' : 'hard to read'),
        ))),
    );
  }

  private preview(): Verdict {
    return evaluate(this.game!, this.pol!, this.st, this.deal);
  }

  private protocolPanel(g: Game, pol: PolityDef, st: PolityState): HTMLElement {
    const c = pol.customs[this.customIdx];
    const knows = st.knowledge >= 0.3 || st.customsLearned.includes(this.customIdx)
      || !!hasInterpreterFor(g.crew, people(pol.people).language);
    return card('The custom of the court',
      el('p', {}, c.scene),
      knows ? el('p', { class: 'audience-hint' }, `“${c.hint}” — somebody who knows these people`) : null,
      el('div', { class: 'shore-actions' },
        ...c.options.map((o, i) => el('button', {
          class: 'shore-action', type: 'button',
          onclick: () => {
            const right = i === c.right;
            this.deal.protocol = right ? 'right' : 'wrong';
            if (right && !st.customsLearned.includes(this.customIdx)) st.customsLearned.push(this.customIdx);
            this.log.push({ who: 'you', text: o });
            this.log.push({ who: 'narrator', text: right ? 'It is noticed, and it is approved of.' : 'There is a silence that goes on slightly too long.' });
            if (!right) g.adjustPolity(pol.id, { respect: -0.03 });
            this.phase = 'gifts';
            this.render();
          },
        }, el('b', {}, o))),
      ),
    );
  }

  private giftPanel(g: Game, pol: PolityDef): HTMLElement {
    const pe = people(pol.people);
    const expected = expectedGift(pol);
    const candidates = g.ship.cargo.filter((c) => c.quantity >= 1
      && (GIFT_GOODS.includes(c.goodId) || pol.wants.includes(c.goodId) || pe.gifts.loves.includes(c.goodId)));
    let offered = 0;
    for (const [id, qty] of this.giftPicks) offered += good(id).lisbon * qty;
    const ratio = offered / expected;
    const know = this.st.knowledge;
    return card('Presents',
      el('p', { class: 'quote' }, pe.sophistication > 0.7
        ? 'This court has received embassies from places you have never heard of. Trinkets will be read as an insult.'
        : 'Something useful and something bright.'),
      candidates.length === 0 ? el('p', {}, 'Nothing aboard is fit to give.') : null,
      ...candidates.map((c) => {
        const gd = good(c.goodId);
        const picked = this.giftPicks.get(c.goodId) ?? 0;
        const wanted = pol.wants.includes(c.goodId) && know >= 0.2;
        const loved = pe.gifts.loves.includes(c.goodId) && know >= 0.1;
        const scorned = pe.gifts.scorns.includes(c.goodId) && know >= 0.1;
        return el('div', { class: 'gift-row' },
          el('div', { style: { flex: '1' } },
            el('div', {}, gd.english,
              wanted ? el('span', { class: 'tag good' }, 'he wants this') : null,
              loved ? el('span', { class: 'tag good' }, 'prized here') : null,
              scorned ? el('span', { class: 'tag bad' }, 'beneath them') : null),
            el('div', { class: 'gift-sub' }, `${c.quantity.toFixed(0)} aboard · ${gd.lisbon} each at Lisbon`)),
          el('input', {
            type: 'number', min: '0', max: String(Math.floor(c.quantity)), value: String(picked),
            'aria-label': `Give ${gd.english}`,
            oninput: (e: Event) => {
              const v = clamp(Number((e.target as HTMLInputElement).value), 0, Math.floor(c.quantity));
              if (v <= 0) this.giftPicks.delete(c.goodId); else this.giftPicks.set(c.goodId, v);
              this.render();
            },
          }));
      }),
      kv('Your present', `${offered.toFixed(0)} cruzados`),
      kv('What this court expects', know >= 0.15 ? `about ${expected}` : '…'),
      meter(clamp(ratio, 0, 1.5) / 1.5, ratio < 0.4 ? 'bad' : ratio < 0.8 ? 'warn' : ''),
      el('div', { class: 'row' },
        button('Lay them before him', () => {
          let loved = false, scorned = false;
          for (const [id, qty] of this.giftPicks) {
            g.ship.removeCargo(id, qty);
            if (pe.gifts.loves.includes(id) || pol.wants.includes(id)) loved = true;
            if (pe.gifts.scorns.includes(id)) scorned = true;
          }
          this.deal.giftValue = offered;
          this.deal.giftLoved = loved;
          this.deal.giftScorned = scorned;
          this.log.push({ who: 'you', text: `Presents worth ${offered.toFixed(0)} cruzados are laid out.` });
          this.log.push({ who: 'them', text: scorned ? 'Somebody laughs, and is not rebuked.' : loved ? 'The ruler leans forward.' : ratio < 0.3 ? 'They are received without comment.' : 'They are received with courtesy.' });
          this.giftPicks.clear();
          this.phase = 'terms';
          this.render();
        }, { primary: true, disabled: this.giftPicks.size === 0 }),
        button('Give nothing', () => { this.phase = 'terms'; this.render(); }),
      ),
    );
  }

  private termsPanel(g: Game, pol: PolityDef, st: PolityState): HTMLElement {
    const def = g.portHere!;
    const rel = g.relationsFor(def.id);
    const complex = this.deal.comprehension >= 0.5;
    const asks: [Ask, boolean, string | null][] = [
      ['trade', !rel.mayTrade, null],
      ['factory', !rel.factory && g.can('feitoria'), complex ? null : 'Needs an interpreter'],
      ['exclusive', !rel.exclusive, complex ? null : 'Needs an interpreter'],
      ['padrao', !rel.padrao, null],
      ['pilot', true, null],
    ];
    const offers: [Offer, boolean, string | null][] = [
      ['return', true, null],
      ['deliver', true, null],
      ['ally', pol.feuds.length > 0, complex ? null : 'Needs an interpreter'],
      ['envoy', true, null],
      ['tribute', true, g.crown.gold < 150 ? 'Not enough in the purse' : null],
    ];
    const toggle = <T extends string>(list: T[], v: T) => {
      const i = list.indexOf(v);
      if (i >= 0) list.splice(i, 1); else list.push(v);
      this.render();
    };
    const v = this.preview();
    const readable = st.knowledge >= 0.35;
    return card('The terms',
      el('div', { class: 'terms-head' }, 'What you ask'),
      ...asks.filter(([, show]) => show).map(([a, , why]) => el('label', { class: `term${why ? ' off' : ''}` },
        el('input', { type: 'checkbox', checked: this.deal.asks.includes(a), disabled: !!why, onchange: () => toggle(this.deal.asks, a) }),
        el('span', {}, ASK_LABEL[a]), why ? el('em', {}, why) : null)),
      el('div', { class: 'terms-head' }, 'What you offer'),
      ...offers.filter(([, show]) => show).map(([o, , why]) => el('label', { class: `term${why ? ' off' : ''}` },
        el('input', { type: 'checkbox', checked: this.deal.offers.includes(o), disabled: !!why, onchange: () => toggle(this.deal.offers, o) }),
        el('span', {}, offerLabel(pol, o)), why ? el('em', {}, why) : null)),
      el('div', { class: `audience-reading ${v.accepted ? 'good' : v.score > 0 ? 'warn' : 'bad'}` },
        el('b', {}, 'How the court leans'),
        el('span', {}, readable
          ? (v.accepted ? 'As it stands, they would agree.' : v.score > 0 ? 'Close. Ask less, or offer more.' : 'They will refuse this.')
          : 'You cannot read this court well enough to know.')),
      el('div', { class: 'row' },
        button(`Put it to the ${pol.title}`, () => {
          this.log.push({ who: 'you', text: `You ask for ${this.deal.asks.map((a) => ASK_LABEL[a].toLowerCase()).join(', ') || 'friendship'}${this.deal.offers.length ? `, and offer to ${this.deal.offers.map((o) => offerLabel(pol, o).toLowerCase()).join('; ')}` : ''}.` });
          this.put();
        }, { primary: true, disabled: this.deal.asks.length === 0 }),
        g.can('force')
          ? button('Run out the guns', () => {
            this.log.push({ who: 'you', text: 'The ship is laid broadside to the town, and the ports are opened.' });
            this.result = g.concludeTreaty(def, this.deal, v, true);
            this.phase = 'done';
            this.render();
          })
          : null,
      ),
    );
  }

  /** Put the deal as it stands, and hear the answer. */
  private put(): void {
    const g = this.game!;
    this.verdict = this.preview();
    if (this.verdict.accepted) {
      this.log.push({ who: 'them', text: `${rulerName(this.pol!, this.st)} agrees.` });
      this.result = g.concludeTreaty(g.portHere!, this.deal, this.verdict);
      this.phase = 'done';
    } else {
      this.log.push({ who: 'them', text: 'He does not agree.' });
      this.phase = 'verdict';
    }
    this.render();
  }

  private verdictPanel(g: Game, pol: PolityDef): HTMLElement {
    const v = this.verdict!;
    const ruler = rulerName(pol, this.st);
    const c = v.counter;
    return card('He will not agree to that',
      el('p', {}, c?.add === 'deliver'
        ? `${ruler} says he would consider it — if you undertake to ${offerLabel(pol, 'deliver').toLowerCase()}.`
        : c?.drop ? `${ruler} will not grant ${ASK_LABEL[c.drop].toLowerCase()}. Without it, perhaps.`
          : `${ruler} hears you out and says nothing at all, which is an answer.`),
      el('div', { class: 'row' },
        c ? button('Accept his terms', () => {
          if (c.add) this.deal.offers.push(c.add);
          if (c.drop) this.deal.asks = this.deal.asks.filter((a) => a !== c.drop);
          this.put();
        }, { primary: true }) : null,
        !this.pressed ? button('Press him', () => {
          this.pressed = true;
          g.adjustPolity(pol.id, { trust: -0.04 });
          this.deal.giftValue += 25;
          this.log.push({ who: 'you', text: 'You press the point, and then press it again.' });
          this.put();
        }) : null,
        button('Change the terms', () => { this.phase = 'terms'; this.render(); }),
      ),
    );
  }
}
