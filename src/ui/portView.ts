import { enduranceDays } from '../crew/crew';
import { people } from '../world/peoples';
import { prosperityText } from './networkView';
import { recommendedPlan } from '../game/stores';
import type { Game } from '../game/state';
import { append, button, clear, el } from './dom';
import { Ctx, QUARTERS, QUARTER_IDS, quartersModel, renderQuarter, type QuarterId } from './quarters';

/**
 * Everything that happens at anchor, as Quarters (BUILD_PLAN C4): six verbs of a place, not seven tabs.
 *
 * This file is only the frame: the head, the row of quarters, the notice, the waiting row and the foot (audience,
 * sailing home, weighing). What each quarter shows, and the state of the Fronts at this place, is in `ui/quarters/`,
 * built from a model that is a pure function of the game (`quartersModel`), so it can be read in node.
 */
export class PortView {
  root = el('div', { class: 'screen' });
  private body = el('div', { class: 'screen-body' });
  private head = el('div', { class: 'screen-head' });
  private foot = el('div', { class: 'screen-foot' });
  private quarter: QuarterId = 'waterfront';
  private section = 'quay';
  private game: Game | null = null;
  /** The waiting row, opened from the foot of the page in any quarter. */
  private waitOpen = false;
  /** Sail her home asks twice: the page may not show a browser dialog. */
  private homeArmed = false;
  private ctx: Ctx;

  constructor(
    private onClose: () => void,
    private onAudience: () => void,
    private onCourt: () => void,
  ) {
    this.ctx = new Ctx(() => this.render(), onAudience, onCourt, (q, s) => this.go(q, s));
    this.root.append(this.head, this.body, this.foot);
  }

  open(g: Game): void {
    this.game = g;
    this.waitOpen = false;
    this.homeArmed = false;
    // The story waits for the port screen: the King's summons at the start of a career, and whatever is due on arrival.
    g.checkStory();
    this.quarter = 'waterfront';
    this.section = 'quay';
    this.ctx.reset();
    if (g.dockedAt) g.markets.refresh(g.dockedAt, g.clock.t);
    this.render();
  }

  private go(q: QuarterId, section?: string): void {
    this.quarter = q;
    this.section = section ?? QUARTERS[q].sections[0].id;
    this.ctx.notice = null;
    this.ctx.confirmSale = null;
    this.render();
  }

  private render(): void {
    const g = this.game;
    const def = g?.portHere;
    if (!g || !def) return;
    const ctx = this.ctx;

    const pe = people(def.people);
    const rel = g.relationsFor(def.id);

    clear(this.head);
    this.head.append(
      el('h1', {}, def.name),
      el('div', { class: 'sub' },
        `${pe.name}${def.modern ? ` · ${def.modern}` : ''} · ${g.clock.formatDate()}`),
    );
    // How the town is doing, in a word, and why: as it stands as the captain comes in.
    const fortunes = prosperityText(g, def.id);
    if (fortunes) this.head.append(el('div', { class: 'sub' }, fortunes));

    clear(this.foot);
    append(this.foot,
      el('div', { style: { marginRight: 'auto', fontSize: '13.5px' } },
        `${g.crown.gold.toFixed(0)} cruzados · ${g.crown.title.name} · ${g.crown.lifetimeStanding} renown`),
      def.id === 'lisboa' ? button('To court', () => this.onCourt()) : null,
      def.people === 'han' ? button('To the Admiral', () => this.onCourt()) : null,
      button('Seek an audience', () => this.onAudience(), {
        disabled: def.people === 'portuguese',
        title: def.people === 'portuguese' ? 'These are your own people.' : undefined,
        // Until you have leave to trade, the audience is the only thing at this anchorage worth doing.
        primary: def.people !== 'portuguese' && !rel.mayTrade,
      }),
      g.can('homeward') && def.id !== 'lisboa'
        ? button(this.homeArmed
          ? `Sail home: ${g.homewardPassage()?.miles ?? 0} miles, ${g.homewardPassage()?.days ?? 0} days — confirm`
          : 'Sail her home', () => {
          const road = g.homewardPassage();
          if (!road) return;
          if (!this.homeArmed) { this.homeArmed = true; this.render(); return; }
          this.homeArmed = false;
          const res = g.sailHome();
          // A refusal is said loudly: a button that seems to do nothing is the worst kind.
          if (!res.ok) g.pushAlert(res.text, 'warning');
          ctx.notice = { text: res.text, grave: !res.ok };
          this.quarter = 'waterfront'; this.section = 'quay';
          this.render();
        }, { primary: this.homeArmed, title: 'The road home: skip the passage and come into Lisbon in the days it takes' })
        : null,
      button(this.waitOpen ? 'Close' : 'Wait…', () => { this.waitOpen = !this.waitOpen; this.render(); }),
      button('Weigh anchor  (Space)', () => {
        const why = g.cannotWeigh();
        if (why) { ctx.notice = { text: why, grave: true }; this.render(); return; }
        // The pilot's word on the stores comes once, before she weighs, and only if he has one.
        if (!ctx.storesAdvised) {
          ctx.storesAdvised = true;
          const rec = recommendedPlan(g);
          if (enduranceDays(g.crew, g.ration) < rec.victuals * 0.8 || g.crew.provisions.water < rec.water * 0.8) {
            ctx.storesPlan = rec;
            this.quarter = 'yard'; this.section = 'stores';
            ctx.notice = { text: `The pilot would load ${rec.water} days of water and ${rec.victuals} of victuals for the leg ahead. Set the sliders and load, or weigh again to go as she is.` };
            this.render();
            return;
          }
        }
        g.weighAnchor(); this.onClose();
      },
        { primary: def.people === 'portuguese' || rel.mayTrade }),
    );

    clear(this.body);
    // Six quarters, in the order a captain does them in port: the quay, the tavern, the yard, the market, the fort and
    // the church. Each shows the state of the Fronts here before it shows its verbs.
    const model = quartersModel(g);
    this.body.append(el('div', { class: 'tabs quarters' },
      ...QUARTER_IDS.map((q) => {
        const m = model.find((x) => x.id === q)!;
        return el('button', {
          class: `${this.quarter === q ? 'active' : ''}${m.shut ? ' shut' : ''}`.trim(),
          'data-quarter': q,
          onclick: () => this.go(q),
        }, m.label, m.badge ? el('span', { class: 'quarter-badge' }, ` · ${m.badge}`) : null);
      })));

    if (ctx.notice) {
      this.body.append(el('div', { class: `notice${ctx.notice.grave ? ' grave' : ''}` }, ctx.notice.text));
    }
    if (this.waitOpen) this.body.append(this.waitCard(g));

    const inner = el('div', {});
    renderQuarter(ctx, g, this.quarter, this.section, inner);
    this.body.append(inner);
  }

  private waitCard(g: Game): HTMLElement {
    const monsoon = g.monsoonNow();
    return el('div', { class: 'card' },
      el('h3', {}, 'Lie at anchor'),
      el('p', {}, 'The crew rest, the fresh food does its work, the market turns over, and the '
        + 'weather and the season go on without you. The stores are eaten all the same.'),
      el('div', { style: { display: 'flex', gap: '7px', flexWrap: 'wrap' } },
        ...[1, 3, 7, 14, 30].map((d) => button(`${d} ${d === 1 ? 'day' : 'days'}`, () => {
          g.waitDays(d);
          this.ctx.notice = { text: `${d} ${d === 1 ? 'day passes' : 'days pass'} at anchor. It is ${g.clock.formatDate()}.` };
          this.render();
        })),
        monsoon
          ? button('Until the monsoon turns', () => { this.ctx.notice = { text: g.waitForTheMonsoon() }; this.render(); })
          : null,
      ));
  }
}
