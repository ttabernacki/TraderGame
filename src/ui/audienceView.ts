import { clamp } from '../core/math';
import { good } from '../economy/goods';
import { people } from '../world/peoples';
import {
  applyMove, applyOutcome, audienceReading, availableMoves, beginAudience, concludeAudience,
  expectedGiftValue, giftCandidates, type AudienceContext, type AudienceState, type GiftOffer,
} from '../diplomacy/contact';
import { skill, train } from '../crew/skills';
import type { Game } from '../game/state';
import { button, card, clear, el, kv, meter } from './dom';

/** An audience with whoever governs the place you have just anchored off. */
export class AudienceView {
  root = el('div', { class: 'screen' });
  private body = el('div', { class: 'screen-body' });
  private head = el('div', { class: 'screen-head' });
  private foot = el('div', { class: 'screen-foot' });
  private game: Game | null = null;
  private state: AudienceState | null = null;
  private giftMode = false;
  private giftPicks = new Map<string, number>();

  constructor(private onClose: () => void) {
    this.root.append(this.head, this.body, this.foot);
  }

  open(g: Game): void {
    this.game = g;
    const def = g.portHere;
    if (!def) return;
    this.giftMode = false;
    this.giftPicks.clear();
    this.state = beginAudience(def, this.context(g));
    this.render();
  }

  private context(g: Game): AudienceContext {
    return {
      crew: g.crew,
      diplomacy: skill(g.effectiveSkill, 'diplomacia'),
      hasKingsLetter: g.crown.hasKingsLetter,
      hasPadraoAboard: g.ship.upgrades.includes('padroes'),
      standing: g.crown.lifetimeStanding,
      relations: g.relationsFor(g.dockedAt!),
      rng: g.rng,
    };
  }

  private render(): void {
    const g = this.game;
    const s = this.state;
    if (!g || !s) return;
    const def = g.portHere!;
    const pe = people(s.peopleId);

    clear(this.head);
    this.head.append(
      el('h1', {}, `Audience at ${def.name}`),
      el('div', { class: 'sub' }, pe.name),
    );

    clear(this.foot);
    this.foot.append(
      s.concluded
        ? button('Return aboard', () => this.finish(), { primary: true })
        // Once the room has given you enough, leaving is the move.
        : button('Take your leave', () => { applyMove(s, 'depart', this.context(g)); this.render(); },
          { primary: audienceReading(s).state === 'good' }),
    );

    clear(this.body);

    const log = el('div', { class: 'audience-log' });
    for (const line of s.log) {
      log.append(el('div', { class: `audience-line ${line.speaker}` }, line.text));
    }

    const left = el('div', {}, card('', log));

    const right = el('div', {});
    right.append(card('How it stands',
      el('div', { class: 'gauge-pair' },
        el('div', {},
          kv('Their interest', `${s.interest.toFixed(0)}`),
          meter(s.interest / 100),
        ),
        el('div', {},
          kv('Their suspicion', `${s.suspicion.toFixed(0)}`),
          meter(s.suspicion / 100, 'bad'),
        ),
      ),
      kv('Understood', `${(s.comprehension * 100).toFixed(0)}%`),
      meter(s.comprehension, s.comprehension < 0.3 ? 'warn' : ''),
      s.comprehension < 0.3
        ? el('p', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '8px', lineHeight: '1.55' } },
            'Almost nothing you say is arriving. Find a man who has their tongue, or one who has Arabic if these are people of the Indian Ocean trade, or put a degredado ashore and come back in a year.')
        : null,
      // What the two bars actually add up to, which is the only thing the
      // outcome depends on and was nowhere on the screen.
      s.concluded ? null : (() => {
        const r = audienceReading(s);
        return el('div', { class: `audience-reading ${r.state}` },
          el('b', {}, 'How it is going'), el('span', {}, r.text));
      })(),
    ));

    if (!s.concluded) {
      if (this.giftMode) {
        right.append(this.giftPanel(g, s));
      } else {
        const moves = availableMoves(s, this.context(g));
        right.append(card('What you may do',
          el('div', { class: 'move-grid' },
            ...moves.filter((m) => m.id !== 'depart').map((m) =>
              el('button', {
                class: 'move',
                onclick: () => {
                  if (m.id === 'gift') { this.giftMode = true; this.render(); return; }
                  applyMove(s, m.id, this.context(g));
                  train(g.skills, 'diplomacia', 0.35);
                  this.render();
                },
              }, el('b', {}, m.label), el('span', {}, m.description)),
            ),
          ),
        ));
      }
    }

    this.body.append(el('div', { class: 'cols side' }, left, right));
    log.scrollTop = log.scrollHeight;
  }

  private giftPanel(g: Game, _s: AudienceState): HTMLElement {
    const def = g.portHere!;
    const pe = people(def.people);
    const candidates = giftCandidates(g.ship.cargo);
    const expected = expectedGiftValue(def);

    let offered = 0;
    for (const [id, qty] of this.giftPicks) offered += good(id).lisbon * qty;

    const rows = candidates.map((c) => {
      const gd = good(c.goodId);
      const picked = this.giftPicks.get(c.goodId) ?? 0;
      const loved = pe.gifts.loves.includes(c.goodId);
      const scorned = pe.gifts.scorns.includes(c.goodId);
      return el('div', { style: { display: 'flex', alignItems: 'center', gap: '9px', padding: '5px 0' } },
        el('div', { style: { flex: '1' } },
          el('div', {}, gd.name,
            loved ? el('span', { class: 'tag good', style: { marginLeft: '7px' } }, 'prized here') : null,
            scorned ? el('span', { class: 'tag bad', style: { marginLeft: '7px' } }, 'beneath them') : null),
          el('div', { style: { fontSize: '11.5px', color: 'var(--ink-soft)' } },
            `${c.quantity.toFixed(0)} in the hold · ${gd.lisbon} cruzados the ${gd.unit}`),
        ),
        el('input', {
          type: 'number', min: '0', max: String(Math.floor(c.quantity)), value: String(picked),
          style: { width: '70px', fontFamily: 'inherit', fontSize: '13px', padding: '2px 4px' },
          oninput: (e: Event) => {
            const v = clamp(Number((e.target as HTMLInputElement).value), 0, Math.floor(c.quantity));
            if (v <= 0) this.giftPicks.delete(c.goodId);
            else this.giftPicks.set(c.goodId, v);
            this.render();
          },
        }),
      );
    });

    const ratio = offered / expected;
    return card('Choose the present',
      el('p', { class: 'quote' },
        pe.sophistication > 0.7
          ? 'Take care. This is a wealthy court that has received embassies from places you have not heard of. A present that would delight a village on the Guinea coast will be read here as an insult, and read correctly.'
          : 'Something useful and something bright. Iron, copper, and cloth carry more weight here than gold does.'),
      candidates.length === 0
        ? el('p', {}, 'You have nothing aboard fit to give.')
        : el('div', {}, ...rows),
      el('div', { style: { marginTop: '13px', borderTop: '1px solid rgba(90,74,55,0.25)', paddingTop: '10px' } },
        kv('Value of your offer', `${offered.toFixed(0)} cruzados`),
        kv('What this court expects', `${expected} cruzados`),
        meter(clamp(ratio, 0, 1.5) / 1.5, ratio < 0.4 ? 'bad' : ratio < 0.8 ? 'warn' : ''),
        el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '5px' } },
          ratio < 0.25 ? 'They will take this as a slight.'
            : ratio < 0.6 ? 'Adequate. It will not move them.'
              : ratio < 1.5 ? 'A proper present.'
                : 'Handsome, and more than you needed to give.'),
      ),
      el('div', { style: { display: 'flex', gap: '8px', marginTop: '13px' } },
        button('Present it', () => {
          const gifts: GiftOffer[] = [...this.giftPicks.entries()].map(([goodId, quantity]) => ({ goodId, quantity }));
          for (const gift of gifts) g.ship.removeCargo(gift.goodId, gift.quantity);
          applyMove(this.state!, 'gift', this.context(g), gifts);
          train(g.skills, 'diplomacia', 0.6);
          this.giftPicks.clear();
          this.giftMode = false;
          this.render();
        }, { primary: true, disabled: this.giftPicks.size === 0 }),
        button('Not now', () => { this.giftMode = false; this.giftPicks.clear(); this.render(); }),
      ),
    );
  }

  private finish(): void {
    const g = this.game;
    const s = this.state;
    if (!g || !s) { this.onClose(); return; }

    concludeAudience(s, this.context(g));
    const outcome = s.outcome!;
    const rel = g.relationsFor(s.portId);
    applyOutcome(rel, outcome);

    const def = g.portHere!;
    const pe = people(def.people);

    g.logEvent('contact', `Audience at ${def.name}. ${outcome.summary}`, true);
    train(g.skills, 'diplomacia', outcome.mayTrade ? 3.5 : 1.2);

    if (outcome.mayTrade && !g.visitedPorts.has(`${def.id}:traded`)) {
      const charted = g.chart.ports.get(def.id);
      if (charted) charted.traded = true;
      g.crown.progressObjective('contact', pe.id);
      const value = Math.round(def.discovery * 0.5);
      if (value > 0) {
        g.crown.record('people', `Contact with the ${pe.name} at ${def.name}`, g.nav.estimated, value, g.clock.t);
      }
    }

    if (outcome.padrao) {
      g.crown.padroesRaised += 1;
      g.crown.progressObjective('padrao', undefined, 1);
      g.crown.record('padrao', `Padrão at ${def.name}`, g.nav.estimated, 12, g.clock.t);
      g.logEvent('discovery', `Set up a padrão on the headland above ${def.name}, with the arms of Portugal and the date cut into it.`);
    }

    if (outcome.factory) {
      g.crown.record('port', `Feitoria at ${def.name}`, g.nav.estimated, 45, g.clock.t);
    }

    if (outcome.hostile) {
      g.pushAlert('You are no longer welcome here.', 'grave');
    }

    this.state = null;
    this.onClose();
  }
}
