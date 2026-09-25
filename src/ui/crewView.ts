import { clamp } from '../core/math';
import { GOOD_BY_ID } from '../economy/goods';
import {
  OFFICER_ROLES, ableHands, enduranceDays, healthWord, moraleWord,
} from '../crew/crew';
import {
  PRACTICE, SCHOOLS, SKILLS, blockedReason, costFor, nodesOf, rankOf, schoolOf, skill,
  type CaptainSkills, type SkillNode, type SkillSet,
} from '../crew/skills';
import { BONDS, ARC_BY_ID } from '../progression/arcs';
import type { Officer } from '../crew/crew';
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
                  el('span', {}, `${o.name} — ${def.english}`),
                  el('span', { class: o.bonded ? 'tag good' : 'tag' },
                    !o.alive ? 'dead' : o.ashoreAt ? 'ashore' : o.bonded ? 'yours' : rankOf(o.ability * 100)),
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
                arcLine(o),
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

    const bonds = [...g.bonds].map((b) => BONDS[b]);
    if (bonds.length > 0) {
      right.append(card('What they have given you',
        el('p', { style: { fontStyle: 'italic', color: 'var(--ink-soft)' } },
          'Earned by carrying one man\u2019s story to its end rather than by spending anything on '
          + 'yourself. It stays with you after he is gone.'),
        el('ul', { class: 'list' }, ...bonds.map((b) => el('li', {},
          el('div', {}, b.name),
          el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '3px', lineHeight: '1.5' } }, b.effect),
        ))),
      ));
    }

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
      kv('Class', `${hull.english} (${hull.name})`),
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

  /**
   * The captain's own book: six trees, and points enough for two of them.
   *
   * Laid out as trees rather than a list of upgrades because the shape *is* the
   * decision — a player needs to see that taking the fifth node of Navigation
   * costs him the whole of Diplomacy, and a flat list hides exactly that.
   */
  private renderSkills(host: HTMLElement, g: Game): void {
    const eff = g.effectiveSkill;
    const c = g.captain;

    host.append(el('div', { class: 'card', style: { marginBottom: '12px' } },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' } },
        el('h2', { style: { margin: '0' } }, c.points > 0
          ? `${c.points} point${c.points === 1 ? '' : 's'} to spend`
          : 'Nothing left to spend'),
        el('span', { style: { fontSize: '12.5px', color: 'var(--ink-soft)' } },
          'Earned by discharging commissions, and by practice at each art.'),
      ),
      el('p', { style: { fontStyle: 'italic', color: 'var(--ink-soft)', margin: '8px 0 0' } },
        'Each discipline has a trunk, then two schools. The first school node you learn is your school: '
        + 'its three nodes and its capstone are yours to take. Two nodes of the other school may be learned '
        + 'at twice the price; its capstone never. A school from the trunk to the capstone is fifteen points, '
        + 'and a career is forty-odd.'),
      g.dockedAt === 'lisboa' && !c.respecUsed && c.taken.length > 0
        ? el('div', { class: 'row' }, button('Unlearn it all — once, for 100 renown', () => {
          g.pushAlert(g.respecSkills(), 'note');
          this.render();
        }, { disabled: g.crown.standing < 100 }))
        : null,
    ));

    host.append(el('div', { class: 'cols two' },
      el('div', {}, ...SKILLS.slice(0, 3).map((s) => this.treeCard(g, eff, s))),
      el('div', {}, ...SKILLS.slice(3).map((s) => this.treeCard(g, eff, s))),
    ));
  }

  private treeCard(g: Game, eff: SkillSet, s: typeof SKILLS[number]): HTMLElement {
    const c = g.captain;
    const own = g.skills[s.id];
    const withOfficers = eff[s.id];
    const bonus = withOfficers - own;
    const rule = PRACTICE[s.id];
    const earned = c.earned?.[s.id] ?? 0;
    const prog = c.practice?.[s.id] ?? 0;
    const nodes = nodesOf(s.id);
    const trunk = nodes.filter((n) => !n.school && n.tier <= 2);
    const crown = nodes.filter((n) => n.tier === 7);
    const mine = schoolOf(c, s.id);
    const school = (k: 'a' | 'b') => el('div', { class: `skill-school${mine === k ? ' mine' : mine ? ' other' : ''}` },
      el('div', { class: 'skill-school-head' }, SCHOOLS[s.id][k], mine === k ? el('em', {}, ' your school') : null),
      ...nodes.filter((n) => n.school === k).map((n) => this.nodeRow(g, c, n)));

    return card(`${s.english} (${s.name})`,
      el('p', { style: { fontStyle: 'italic', color: 'var(--ink-soft)' } }, s.blurb),
      kv('Your own', `${own.toFixed(0)} — ${rankOf(own)}`),
      bonus > 0.5 ? kv('With your officers', `${withOfficers.toFixed(0)}`) : null,
      meter(skill(eff, s.id)),
      kv('Practice', earned >= rule.cap
        ? `all ${rule.cap} points earned`
        : `${Math.floor(prog)} of ${rule.per} ${rule.unit} toward a point (${earned} of ${rule.cap})`),
      el('ul', { class: 'list', style: { marginTop: '9px' } }, ...trunk.map((n) => this.nodeRow(g, c, n))),
      el('div', { class: 'skill-fork' }, school('a'), school('b')),
      crown.length ? el('ul', { class: 'list', style: { marginTop: '9px' } }, ...crown.map((n) => this.nodeRow(g, c, n))) : null,
    );
  }

  private nodeRow(g: Game, c: CaptainSkills, n: SkillNode): HTMLElement {
    const held = c.taken.includes(n.id);
    const why = blockedReason(c, n);
    const price = costFor(c, n);
    const poor = !!why && why.endsWith(`you have ${c.points}.`);
    const shut = !held && !!why && /not for you|as far as/.test(why);
    const dim = held ? '1' : shut ? '0.35' : why && !poor ? '0.55' : '0.9';

    const row = el('li', { class: `skill-node${held ? ' held' : ''}${n.tier >= 6 ? ' cap' : ''}`, style: { opacity: dim } },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline' } },
        el('span', {}, n.name),
        el('span', { class: held ? 'tag good' : 'tag' },
          held ? 'held' : shut ? 'shut' : `${price} pt${price === 1 ? '' : 's'}${price > n.cost ? ', doubled' : ''}`),
      ),
      el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', margin: '3px 0 0', lineHeight: '1.5' } }, n.effect),
    );

    if (held || shut) return row;
    if (!why) {
      row.append(button(`Learn it — ${price} ${price === 1 ? 'point' : 'points'}`, () => {
        if (g.buySkill(n.id)) this.render();
      }, { ghost: true }));
    } else {
      row.append(el('div', { style: { fontSize: '12px', color: 'var(--ink-soft)', marginTop: '4px' } }, why));
    }
    return row;
  }
}

function GOODS_BY_ID(id: string): { name: string; unit: string } {
  return GOOD_BY_ID.get(id) ?? { name: id, unit: 'unit' };
}

/**
 * Where this man's story has got to.
 *
 * Deliberately vague about what comes next — a list of remaining beats would
 * turn a character into a quest log — but never silent about whether the thread
 * is live, finished, or cut.
 */
function arcLine(o: Officer): HTMLElement | null {
  if (!o.arc) return null;
  const arc = ARC_BY_ID.get(o.arc);
  if (!arc) return null;
  const stage = o.arcStage ?? 0;
  const text = o.bonded
    ? `${BONDS[arc.bond].name} \u2014 he is yours.`
    : stage >= 99
      ? 'Whatever there was between you is finished. He does his work.'
      : stage === 0
        ? 'You have not sailed far enough with him to know him.'
        : `You are ${stage} of the way into whatever this is.`;
  return el('div', {
    style: { fontSize: '12px', marginTop: '4px', color: o.bonded ? 'var(--green)' : 'var(--ink-soft)' },
  }, text);
}
