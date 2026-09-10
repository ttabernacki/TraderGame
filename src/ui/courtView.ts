import { monarchAt, nextTitle, type Patent } from '../progression/crown';
import type { Game } from '../game/state';
import { button, card, clear, el, kv, meter } from './dom';

/** The court at Lisbon: report the voyage, collect what you are owed, take the next commission. */
export class CourtView {
  root = el('div', { class: 'screen' });
  private body = el('div', { class: 'screen-body' });
  private head = el('div', { class: 'screen-head' });
  private foot = el('div', { class: 'screen-foot' });
  private game: Game | null = null;
  private offers: Patent[] = [];
  private settlement: { gold: number; standing: number; lines: string[] } | null = null;

  constructor(private onClose: () => void) {
    this.root.append(this.head, this.body, this.foot);
  }

  open(g: Game): void {
    this.game = g;
    this.settlement = null;
    g.crown.syncCargoObjectives((id) => g.ship.quantityOf(id));
    this.offers = g.crown.patent ? [] : g.crown.offers(g.clock.date.year);
    this.render();
  }

  private render(): void {
    const g = this.game;
    if (!g) return;
    const monarch = monarchAt(g.clock.date.year);
    const title = g.crown.title;
    const next = nextTitle(g.crown.lifetimeStanding);

    clear(this.head);
    this.head.append(
      el('h1', {}, 'The court'),
      el('div', { class: 'sub' }, `${monarch.name} · ${g.clock.formatDate()}`),
    );

    clear(this.foot);
    this.foot.append(button('Withdraw', () => this.onClose(), { primary: true }));

    clear(this.body);
    const left = el('div', {});
    const right = el('div', {});

    left.append(card(monarch.name, el('p', {}, monarch.blurb)));

    left.append(card('Your standing',
      kv('Title', `${title.name} — ${title.english}`),
      el('p', { style: { fontSize: '13px', fontStyle: 'italic', color: 'var(--ink-soft)' } }, title.blurb),
      kv('Renown', String(g.crown.lifetimeStanding)),
      next ? kv('Next honour at', `${next.standing} — ${next.name}`) : kv('Next honour', 'There is nothing above this.'),
      next ? meter(g.crown.lifetimeStanding / next.standing) : null,
      kv('Your share of a cargo', `${(title.share * 100).toFixed(0)}%`),
      kv('In the purse', `${g.crown.gold.toFixed(0)} cruzados`),
    ));

    if (this.settlement) {
      right.append(card('The accounting',
        ...this.settlement.lines.map((l) => el('p', { style: { fontSize: '13.5px' } }, l)),
        el('div', { style: { marginTop: '11px', borderTop: '1px solid rgba(90,74,55,0.3)', paddingTop: '9px' } },
          kv('Paid', `${this.settlement.gold} cruzados`),
          kv('Renown', `${this.settlement.standing}`),
        ),
      ));
    }

    // --- Reporting ---------------------------------------------------------
    const unreported = g.crown.unreportedValue();
    const patent = g.crown.patent;
    if (unreported > 0 || (patent && g.crown.patentReady)) {
      right.append(card('Report the voyage',
        el('p', {}, unreported > 0
          ? `You have ${g.crown.discoveries.filter((d) => !d.reported).length} discoveries not yet entered on the padrão real, worth ${unreported} renown.`
          : 'Your commission is discharged and wants only reporting.'),
        button('Present your discoveries', () => {
          const s = g.crown.settle(g.clock.t);
          this.settlement = s;
          g.logEvent('crown',
            `Reported at court. ${s.gold} cruzados and ${s.standing} renown. ${g.crown.title.name}.`, true);
          this.offers = g.crown.patent ? [] : g.crown.offers(g.clock.date.year);
          this.render();
        }, { primary: true }),
      ));
    }

    // --- Current commission ------------------------------------------------
    if (patent) {
      right.append(card('Your commission',
        el('div', { style: { fontSize: '16px', marginBottom: '7px' } }, patent.title),
        el('p', { class: 'quote' }, patent.narrative),
        el('ul', { class: 'list' }, ...patent.objectives.map((o) => el('li', {},
          el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } },
            el('span', { style: { opacity: o.complete ? '0.6' : '1' } }, o.description),
            el('span', { class: o.complete ? 'tag good' : 'tag' },
              o.complete ? 'done' : o.amount ? `${Math.floor(o.progress)}/${o.amount}` : 'open'),
          ),
        ))),
        el('div', { style: { marginTop: '11px' } },
          kv('On completion', `${patent.reward} cruzados, ${patent.standingReward} renown`)),
      ));
    } else if (this.offers.length > 0) {
      right.append(card('Commissions the Crown will grant',
        ...this.offers.map((p) => el('div', {
          style: { marginBottom: '17px', paddingBottom: '15px', borderBottom: '1px solid rgba(90,74,55,0.2)' },
        },
          el('div', { style: { fontSize: '16px', marginBottom: '6px' } }, p.title),
          el('p', { class: 'quote' }, p.narrative),
          el('ul', { class: 'list' }, ...p.objectives.map((o) => el('li', { style: { fontSize: '13.5px' } }, o.description))),
          el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', gap: '12px' } },
            el('span', { style: { fontSize: '13px', color: 'var(--ink-soft)' } },
              `${p.advance} in advance · ${p.reward} on completion · ${p.standingReward} renown`),
            button('Take it', () => {
              g.crown.accept(p, g.clock.t);
              g.crown.hasKingsLetter = true;
              g.logEvent('crown',
                `Received the King's commission: "${p.title}". ${p.advance} cruzados advanced, and a sealed letter for any Christian prince who may be found.`, true);
              this.offers = [];
              this.render();
            }, { primary: true }),
          ),
        )),
      ));
    } else if (!patent) {
      right.append(card('Commissions',
        el('p', {}, 'Nothing is offered. Come back when you have something to show, or take a cargo on your own account.')));
    }

    this.body.append(el('div', { class: 'cols side' }, left, right));
  }
}
