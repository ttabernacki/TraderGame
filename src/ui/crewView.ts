import { clamp } from '../core/math';
import { GOOD_BY_ID } from '../economy/goods';
import {
  OFFICER_ROLES, ableHands, enduranceDays, healthWord, moraleWord,
} from '../crew/crew';
import { SKILLS, rankOf, skill, type SkillSet } from '../crew/skills';
import { UPGRADE_BY_ID } from '../ship/upgrades';
import { sailHandRate } from '../ship/physics';
import { loyaltyWord, traitDef } from '../progression/officers';
import { DIFFICULTIES, difficultyDef } from '../game/difficulty';
import type { Game } from '../game/state';
import { button, card, clear, el, kv, meter } from './dom';

type Tab = 'company' | 'stores' | 'ship' | 'skills';

/** The ship's company, her stores, her condition, and the captain's own abilities. */
export class CrewView {
  root = el('div', { class: 'screen' });
  private body = el('div', { class: 'screen-body' });
  private tab: Tab = 'company';
  private game: Game | null = null;

  constructor(private onClose: () => void) {
    this.root.append(
      el('div', { class: 'screen-head' },
        el('h1', {}, 'The ship'),
        el('div', { class: 'sub' }, 'Her company, her stores, and her condition'),
      ),
      this.body,
      el('div', { class: 'screen-foot' }, button('Shut the book  (Esc)', () => this.onClose())),
    );
  }

  open(g: Game): void {
    this.game = g;
    this.render();
  }

  private render(): void {
    const g = this.game;
    if (!g) return;
    clear(this.body);

    const tabs = el('div', { class: 'tabs' },
      ...(['company', 'stores', 'ship', 'skills'] as Tab[]).map((t) =>
        el('button', {
          class: this.tab === t ? 'active' : '',
          onclick: () => { this.tab = t; this.render(); },
        }, { company: 'Company', stores: 'Stores', ship: 'Condition', skills: 'Captain' }[t])),
    );

    const inner = el('div', {});
    switch (this.tab) {
      case 'company': this.renderCompany(inner, g); break;
      case 'stores': this.renderStores(inner, g); break;
      case 'ship': this.renderShip(inner, g); break;
      case 'skills': this.renderSkills(inner, g); break;
    }
    this.body.append(tabs, inner);
  }

  private renderCompany(host: HTMLElement, g: Game): void {
    const c = g.crew;
    const able = ableHands(c);

    const left = el('div', {});
    left.append(card('Muster',
      kv('Aboard', `${c.count} of ${c.complement}`),
      kv('Fit for duty', `${able}`),
      kv('Dead this voyage', `${c.deaths}`),
      kv('Health', healthWord(c)),
      kv('Spirits', moraleWord(c.morale)),
      el('div', { style: { marginTop: '11px' } },
        el('div', { style: { fontSize: '12px', color: 'var(--ink-soft)' } }, 'Morale'),
        meter(c.morale, c.morale < 0.3 ? 'bad' : c.morale < 0.55 ? 'warn' : ''),
      ),
      el('div', { style: { marginTop: '8px' } },
        el('div', { style: { fontSize: '12px', color: 'var(--ink-soft)' } }, 'Scurvy through the company'),
        meter(c.scurvy, 'bad'),
      ),
      el('div', { style: { marginTop: '8px' } },
        el('div', { style: { fontSize: '12px', color: 'var(--ink-soft)' } }, 'Fatigue'),
        meter(c.fatigue, 'warn'),
      ),
      c.unrest > 0.3
        ? el('div', { class: 'notice grave', style: { marginTop: '12px' } },
            'There is unrest forward. If it goes much further they will come aft in a body.')
        : null,
    ));

    if (c.daysWithoutFresh > 25) {
      left.append(el('div', { class: c.daysWithoutFresh > 40 ? 'notice grave' : 'notice' },
        `${c.daysWithoutFresh.toFixed(0)} days without fresh provisions. ` +
        (c.daysWithoutFresh > 40
          ? 'The surgeon is already treating swollen gums and legs that will not carry a man up a ladder. Nothing in his chest touches it. The only remedy is a shore with something green growing on it.'
          : 'Nobody knows why, but a company that has been six weeks on biscuit and salt meat begins to fall sick, and stays sick until it can be landed somewhere with fruit.')));
    }

    const right = el('div', {});
    right.append(card('Officers',
      c.officers.length === 0
        ? el('p', {}, 'You have no officers. Everything falls to you.')
        : el('ul', { class: 'list' },
            ...c.officers.map((o) => {
              const def = OFFICER_ROLES.find((r) => r.role === o.role)!;
              return el('li', { style: { opacity: o.alive ? '1' : '0.42' } },
                el('div', { style: { display: 'flex', justifyContent: 'space-between' } },
                  el('span', {}, `${o.name} — ${def.title}`),
                  el('span', { class: 'tag' }, o.alive ? (o.ashoreAt ? 'ashore' : rankOf(o.ability * 100)) : 'dead'),
                ),
                el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '3px', lineHeight: '1.5' } },
                  traitDef(o.trait)?.blurb ?? def.blurb),
                o.alive && !o.ashoreAt
                  ? el('div', { style: { fontSize: '12px', marginTop: '3px', color: 'var(--ink-soft)' } },
                      `Toward you: ${loyaltyWord(o.loyalty)}.`)
                  : null,
                o.languages.length > 0
                  ? el('div', { style: { fontSize: '12px', marginTop: '3px' } }, `Speaks: ${o.languages.join(', ')}`)
                  : null,
              );
            }),
          ),
    ));

    right.append(card('Ration',
      el('p', {}, 'Cutting the ration extends the stores and costs you the crew\'s goodwill. Increasing it does the reverse.'),
      el('input', {
        type: 'range', min: '0.5', max: '1.25', step: '0.05', value: String(g.ration),
        oninput: (e: Event) => {
          g.ration = Number((e.target as HTMLInputElement).value);
          this.render();
        },
      }),
      kv('Issuing', `${(g.ration * 100).toFixed(0)}% of full allowance`),
      kv('Stores will last', `${enduranceDays(g.crew, g.ration).toFixed(0)} days`),
    ));

    host.append(el('div', { class: 'cols two' }, left, right));
  }

  private renderStores(host: HTMLElement, g: Game): void {
    const p = g.crew.provisions;
    const rows: [string, number, string][] = [
      ['Water', p.water, 'Everything else is negotiable. This is not.'],
      ['Biscuit', p.biscuit, 'Weevilled within a month of sailing and eaten regardless.'],
      ['Salt meat', p.saltMeat, 'Beef and pork in brine, in casks that leak.'],
      ['Wine', p.wine, 'A ration a day. Worth more to the men\'s temper than to their health.'],
      ['Fresh provisions', p.fresh, 'Fruit, greens, and live animals. The only thing that keeps the scurvy off, though nobody knows it.'],
    ];

    const left = el('div', {});
    left.append(card('The stores',
      ...rows.map(([name, days, note]) => el('div', { style: { marginBottom: '13px' } },
        kv(name, `${Math.max(0, days).toFixed(0)} days`),
        meter(clamp(days / 120, 0, 1), days < 12 ? 'bad' : days < 30 ? 'warn' : ''),
        el('div', { style: { fontSize: '12px', color: 'var(--ink-soft)', marginTop: '3px' } }, note),
      )),
    ));

    const right = el('div', {});
    right.append(card('The hold',
      kv('Capacity', `${g.ship.holdCapacity} tons`),
      kv('In her now', `${g.ship.cargoTons.toFixed(1)} tons`),
      kv('Free', `${g.ship.holdFree.toFixed(1)} tons`),
      kv('Value at Lisbon prices', `${g.ship.manifestValue().toFixed(0)} cruzados`),
      g.ship.cargo.length === 0
        ? el('p', { style: { marginTop: '10px' } }, 'The hold is empty.')
        : el('table', { class: 'ledger', style: { marginTop: '10px' } },
            el('thead', {}, el('tr', {},
              el('th', {}, 'Goods'), el('th', { class: 'num' }, 'Quantity'), el('th', { class: 'num' }, 'Paid'))),
            el('tbody', {}, ...g.ship.cargo.map((lot) => {
              const good = GOODS_BY_ID(lot.goodId);
              return el('tr', {},
                el('td', {}, good.name),
                el('td', { class: 'num' }, `${lot.quantity.toFixed(0)} ${good.unit}`),
                el('td', { class: 'num' }, `${lot.cost.toFixed(1)} ea.`),
              );
            })),
          ),
    ));

    host.append(el('div', { class: 'cols two' }, left, right));
  }

  private renderShip(host: HTMLElement, g: Game): void {
    const s = g.ship;
    const hull = s.baseHull;

    const left = el('div', {});
    left.append(card(s.name,
      el('p', {}, hull.blurb),
      kv('Class', `${hull.name} (${hull.english})`),
      kv('Burthen', `${hull.tons} tonéis`),
      kv('Length on the waterline', `${hull.lwl} m`),
      kv('Draft', `${hull.draft} m`),
      kv('Sail area', `${s.sailArea.toFixed(0)} m²`),
      kv('Full complement', `${hull.crewFull}`),
    ));

    left.append(card('Condition',
      el('div', { style: { marginBottom: '11px' } },
        kv('Hull', `${(s.condition.hull * 100).toFixed(0)}%`),
        meter(s.condition.hull, s.condition.hull < 0.4 ? 'bad' : s.condition.hull < 0.7 ? 'warn' : ''),
      ),
      el('div', { style: { marginBottom: '11px' } },
        kv('Fouling', `${(s.condition.fouling * 100).toFixed(0)}%`),
        meter(1 - s.condition.fouling, s.condition.fouling > 0.6 ? 'bad' : s.condition.fouling > 0.35 ? 'warn' : ''),
        el('div', { style: { fontSize: '12px', color: 'var(--ink-soft)', marginTop: '3px' } },
          'Weed and the worm. In warm water a clean bottom lasts about four months, and a foul one costs a third of her speed.'),
      ),
      kv('Water in the hold', `${s.condition.bilge.toFixed(1)} tons`),
      kv('Making water', `${s.condition.leak.toFixed(2)} tons a day`),
      el('div', { style: { marginTop: '11px' } },
        el('div', { style: { fontSize: '12px', color: 'var(--ink-soft)' } }, 'Hands at the pumps'),
        el('input', {
          type: 'range', min: '0', max: '0.6', step: '0.05', value: String(g.pumpEffort),
          oninput: (e: Event) => { g.pumpEffort = Number((e.target as HTMLInputElement).value); this.render(); },
        }),
        el('div', { style: { fontSize: '12px' } }, `${(g.pumpEffort * 100).toFixed(0)}% of the watch`),
      ),
    ));

    const right = el('div', {});

    // Who works her. Changeable at any point in a voyage, because a player who
    // finds out on the tenth day that he does not enjoy trimming yards should
    // not have to start again to stop doing it.
    const rules = difficultyDef(g.difficulty);
    right.append(card('Working the ship',
      el('div', { class: 'difficulty inline' },
        ...DIFFICULTIES.map((d) => el('button', {
          class: `difficulty-btn${g.difficulty === d.id ? ' active' : ''}`,
          onclick: () => {
            g.difficulty = d.id;
            if (d.autoTrim) g.autoTrim = true;
            // The watch need to know what canvas to work back up to.
            g.orderedCanvas = Math.max(g.orderedCanvas, g.ship.canvasSet);
            g.pushAlert(d.id === 'watch'
              ? 'The mestre has the working of her.'
              : 'You have the sheets.', 'note');
            this.render();
          },
        },
          el('span', { class: 'difficulty-name' }, d.name),
          el('span', { class: 'difficulty-english' }, d.english),
        )),
      ),
      el('p', { class: 'flavour', style: { marginTop: '10px' } }, rules.blurb),
      kv('The sheets', g.autoTrim ? 'with the watch' : 'yours (T to hand them over)'),
      kv('Shortening sail', rules.autoCanvas ? 'the watch see to it' : 'your affair'),
      kv('Canvas ordered', `${(g.orderedCanvas * 100).toFixed(0)}%`),
    ));

    right.append(card('Masts and canvas',
      ...s.state.sails.map((sail, i) => {
        const m = s.hull.masts[i];
        return el('div', { style: { marginBottom: '11px' } },
          kv(m.name, `${m.rig === 'lateen' ? 'Lateen' : 'Square'}, ${m.area.toFixed(0)} m²`),
          meter(sail.condition, sail.condition < 0.35 ? 'bad' : sail.condition < 0.7 ? 'warn' : ''),
          el('div', { style: { fontSize: '12px', color: 'var(--ink-soft)' } },
            sail.condition <= 0
              ? 'Gone by the board.'
              : `Set ${(sail.set * 100).toFixed(0)}%, trimmed ${sail.trim.toFixed(0)}° from the centreline` +
                // The shift counter is in nominal seconds; how long it actually
                // takes depends on how many hands are on it.
                (sail.shifting > 0
                  ? ` — shifting across, ${(sail.shifting / sailHandRate(g.tuning)).toFixed(0)}s`
                  : '')),
        );
      }),
    ));

    if (s.upgrades.length > 0) {
      right.append(card('Fitted',
        el('ul', { class: 'list' },
          ...s.upgrades.map((id) => {
            const u = UPGRADE_BY_ID.get(id);
            return u ? el('li', {}, el('div', {}, u.name),
              el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '3px', lineHeight: '1.5' } }, u.blurb)) : null;
          }).filter(Boolean) as Node[],
        ),
      ));
    }

    host.append(el('div', { class: 'cols two' }, left, right));
  }

  private renderSkills(host: HTMLElement, g: Game): void {
    const eff = g.effectiveSkill;
    host.append(el('div', { class: 'cols two' },
      el('div', {}, ...SKILLS.slice(0, 3).map((s) => this.skillCard(g, eff, s))),
      el('div', {}, ...SKILLS.slice(3).map((s) => this.skillCard(g, eff, s))),
    ));
  }

  private skillCard(g: Game, eff: SkillSet, s: typeof SKILLS[number]): HTMLElement {
    const own = g.skills[s.id];
    const withOfficers = eff[s.id];
    const bonus = withOfficers - own;
    return card(`${s.name} — ${s.english}`,
      el('p', { style: { fontStyle: 'italic', color: 'var(--ink-soft)' } }, s.blurb),
      kv('Your own', `${own.toFixed(0)} — ${rankOf(own)}`),
      bonus > 0.5 ? kv('With your officers', `${withOfficers.toFixed(0)}`) : null,
      meter(skill(eff, s.id)),
      el('ul', { class: 'list', style: { marginTop: '9px' } },
        ...s.milestones.map((m) => {
          const got = own >= m.at;
          return el('li', { style: { opacity: got ? '1' : '0.42', fontSize: '13px' } },
            el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } },
              el('span', {}, m.title),
              el('span', { class: got ? 'tag good' : 'tag' }, got ? 'held' : `at ${m.at}`)),
            el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '3px', lineHeight: '1.5' } }, m.effect),
          );
        }),
      ),
    );
  }
}

function GOODS_BY_ID(id: string): { name: string; unit: string } {
  return GOOD_BY_ID.get(id) ?? { name: id, unit: 'unit' };
}
