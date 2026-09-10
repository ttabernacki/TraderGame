import { NM, compassPoint, formatLat, formatLon, haversine } from '../core/math';
import { OFFICER_ROLES } from '../crew/crew';
import { rivalStanding } from '../progression/rival';
import { daysLeft, ventureLine } from '../progression/ventures';
import { loyaltyWord, officerTitle, traitDef } from '../progression/officers';
import { officerOpinion } from '../game/officerEvents';
import type { Game } from '../game/state';
import { button, card, clear, el, kv } from './dom';

type Tab = 'orders' | 'charters' | 'reports' | 'wardroom' | 'rival';

/**
 * The captain's orders.
 *
 * Everything the ship is under obligation to do, in one place, because the
 * alternative is a player three weeks into a passage who has forgotten what he
 * is at sea for. The Crown's commission at the top, the charters he signed for
 * his own account under it, and the hearsay he is chasing under that.
 *
 * The distinction between the three is the point of the screen. The commission
 * is what the King wants. The charters are what pays. The rumours are what a
 * captain actually sails on, and none of them is reliable.
 */
export class OrdersView {
  root = el('div', { class: 'screen' });
  private body = el('div', { class: 'screen-body' });
  private tab: Tab = 'orders';
  private game: Game | null = null;

  constructor(private onClose: () => void, private onLayCourse: () => void) {
    this.root.append(
      el('div', { class: 'screen-head' },
        el('h1', {}, 'Orders'),
        el('div', { class: 'sub' }, 'What the ship is bound to, and by whom'),
      ),
      this.body,
      el('div', { class: 'screen-foot' },
        button('The chart  (C)', () => this.onLayCourse()),
        button('Close  (O)', () => this.onClose()),
      ),
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

    const counts: Record<Tab, number> = {
      orders: g.crown.patent ? g.crown.patent.objectives.filter((o) => !o.complete).length : 0,
      charters: g.activeVentures.length,
      reports: g.openLeads.length,
      wardroom: g.crew.officers.filter((o) => o.alive && !o.ashoreAt).length,
      rival: 0,
    };
    const names: Record<Tab, string> = {
      orders: 'The commission', charters: 'Charters', reports: 'Hearsay',
      wardroom: 'The wardroom', rival: 'The other man',
    };

    this.body.append(el('div', { class: 'tabs' },
      ...(Object.keys(names) as Tab[]).map((t) => el('button', {
        class: this.tab === t ? 'active' : '',
        onclick: () => { this.tab = t; this.render(); },
      }, counts[t] > 0 ? `${names[t]} (${counts[t]})` : names[t])),
    ));

    if (this.tab === 'orders') this.renderCommission(g);
    else if (this.tab === 'charters') this.renderCharters(g);
    else if (this.tab === 'reports') this.renderLeads(g);
    else if (this.tab === 'wardroom') this.renderWardroom(g);
    else this.renderRival(g);
  }

  // -------------------------------------------------------------------------

  private renderCommission(g: Game): void {
    const p = g.crown.patent;
    if (!p) {
      this.body.append(card('No commission',
        el('p', {},
          'You sail on your own account. The Crown has given you nothing to do and will pay '
          + 'you for nothing you find. Go to Lisbon and ask for a patent.'),
      ));
      this.renderStanding(g);
      return;
    }

    const done = p.objectives.filter((o) => o.complete).length;
    const rows = p.objectives.map((o) => {
      const want = o.amount ?? 1;
      const at = Math.min(o.progress, want);
      return el('div', { class: `objective${o.complete ? ' done' : ''}` },
        el('span', { class: 'objective-mark' }, o.complete ? '✓' : '·'),
        el('div', { class: 'objective-body' },
          el('div', { class: 'objective-text' }, o.description),
          want > 1
            ? el('div', { class: 'objective-bar' },
                el('i', { style: { width: `${(at / want) * 100}%` } }),
                el('span', {}, `${at} of ${want}`))
            : null,
        ),
      );
    });

    this.body.append(card(p.title,
      el('p', { class: 'flavour' }, p.narrative),
      el('div', { class: 'objective-list' }, ...rows),
      kv('Completed', `${done} of ${p.objectives.length}`),
      kv('Reward', `${p.reward} cruzados and ${p.standingReward} renown`),
      g.crown.patentReady
        ? el('p', { class: 'good' },
            'Every article but the return is discharged. Bring her home to Lisbon and present '
            + 'yourself at court.')
        : null,
    ));

    this.renderStanding(g);
  }

  private renderStanding(g: Game): void {
    const unreported = g.crown.discoveries.filter((d) => !d.reported);
    this.body.append(card('Standing',
      kv('Title', g.crown.title.name),
      kv('Renown', `${Math.round(g.crown.lifetimeStanding)}`),
      kv('In the purse', `${Math.round(g.crown.gold)} cruzados`),
      kv('Pillars raised', `${g.crown.padroesRaised}`),
      kv('Pillars in the hold', `${g.crown.padraoStock}`),
      unreported.length > 0
        ? el('p', {},
            `${unreported.length} discoveries are in your book and not yet on the padrão real. `
            + `They are worth ${unreported.reduce((s, d) => s + d.value, 0)} renown when reported, `
            + 'and nothing at all if the ship does not come home.')
        : null,
    ));
  }

  // -------------------------------------------------------------------------

  private renderCharters(g: Game): void {
    const active = g.activeVentures;
    if (active.length === 0) {
      this.body.append(card('No charters',
        el('p', {}, 'Nothing is consigned aboard on private account. Merchants offer freight in '
          + 'every port of any size; taking it is how a captain pays for his own ship.'),
      ));
    }

    for (const v of active) {
      const left = daysLeft(v, g.clock.t);
      const urgent = left < 14;
      this.body.append(card(v.patron,
        el('p', { class: 'flavour' }, ventureLine(v)),
        kv('Aboard', v.loaded ? 'loaded and stowed' : 'NOT ABOARD'),
        kv('Due', left < 0
          ? `overdue by ${Math.abs(left).toFixed(0)} days`
          : `${left.toFixed(0)} days`, urgent ? 'bad' : ''),
        kv('On delivery', `${v.fee} cruzados`),
        kv('Forfeit if not', `${v.penalty} cruzados and his good opinion`),
        el('div', { class: 'row' },
          button('Lay a course for it', () => {
            g.setDestinationPort(v.toPort);
            this.onLayCourse();
          }),
        ),
      ));
    }

    const failed = g.ventures.filter((v) => v.failed);
    if (failed.length > 0) {
      this.body.append(card('Broken charters',
        ...failed.map((v) => el('p', {},
          `${v.patron} — ${ventureLine(v)}. Not delivered.`)),
        el('p', { class: 'flavour' },
          'The Rua Nova dos Mercadores is one street and everybody on it talks.'),
      ));
    }
  }

  // -------------------------------------------------------------------------

  private renderLeads(g: Game): void {
    const open = g.openLeads;
    if (open.length === 0) {
      this.body.append(card('Nothing to go on',
        el('p', {}, 'You have heard nothing worth writing down. Lie in a port a while and talk '
          + 'to pilots, and to men who have talked to pilots.'),
      ));
    }

    const from = g.nav.estimated;
    for (const l of open) {
      const distNm = haversine(from, { lat: l.lat, lon: l.lon }) / NM;
      const bearing = bearingTo(from, l);
      this.body.append(card(kindTitle(l.kind),
        el('p', { class: 'flavour' }, l.text),
        kv('Told you', l.source),
        kv('The position named', `${formatLat(l.lat)}, ${formatLon(l.lon)}`),
        kv('From your reckoning', `${distNm.toFixed(0)} miles, ${compassPoint(bearing)}`),
        kv('How far he may be out', `${l.errorNm.toFixed(0)} miles`),
        kv('Worth', `${l.value} renown if it is true`),
        el('div', { class: 'row' },
          button('Lay a course for it', () => {
            g.setDestination(shortName(l.source), l.lat, l.lon);
            this.onLayCourse();
          }),
          button('Forget it', () => { l.followed = true; l.false = true; this.render(); }, { ghost: true }),
        ),
      ));
    }

    const run = g.leads.filter((l) => l.followed);
    if (run.length > 0) {
      this.body.append(card('Run down',
        ...run.map((l) => el('p', { class: l.false ? 'bad' : 'good' },
          `${l.source} — ${l.false ? 'nothing there.' : 'it was where he said.'}`)),
      ));
    }
  }

  // -------------------------------------------------------------------------

  private renderWardroom(g: Game): void {
    // Said in words, not in percentages. A captain does not know that his
    // boatswain is worth fourteen per cent; he knows the sail comes in faster
    // with him than without him.
    const w = g.wardroom;
    this.body.append(card('What they are worth to the ship',
      kv('The men’s heart', scale(w.morale, 0.002, ['worn down', 'unaffected', 'steadied'])),
      kv('Working the ship', scale(w.handling - 1, 0.04, ['slow', 'ordinary', 'smart'])),
      kv('The reckoning', scale(w.reckoning, 0.05, ['carelessly kept', 'ordinary', 'exactly kept'])),
      kv('Discipline', scale(1 - w.unrest, 0.05, ['strained', 'ordinary', 'sound'])),
      kv('Nerve in strange water', scale(1 - w.fear, 0.05, ['poor', 'ordinary', 'good'])),
      kv('Prices got in trade', scale(w.trade, 0.03, ['poor', 'ordinary', 'sharp'])),
    ));

    for (const o of g.crew.officers) {
      const def = OFFICER_ROLES.find((r) => r.role === o.role);
      const t = traitDef(o.trait);
      this.body.append(card(o.name,
        el('div', { class: 'sub' },
          `${officerTitle(o)}${def ? ` — ${def.english}` : ''}${t ? `, ${t.name.toLowerCase()}` : ''}`),
        !o.alive
          ? el('p', { class: 'bad' }, 'Dead, and buried at sea.')
          : o.ashoreAt
            ? el('p', {}, 'Put ashore, and whether he is alive is not known.')
            : el('div', {},
                el('p', { class: 'flavour' }, officerOpinion(o)),
                kv('Ability', abilityWord(o.ability)),
                kv('Toward you', loyaltyWord(o.loyalty)),
                o.languages.length > 0 ? kv('Has the language', o.languages.join(', ')) : null,
                kv('Wage', `${o.wage} cruzados the month`),
              ),
      ));
    }
  }

  // -------------------------------------------------------------------------

  private renderRival(g: Game): void {
    const r = g.rival;
    this.body.append(card(r.name,
      el('div', { class: 'sub' }, r.ship),
      el('p', { class: 'flavour' }, rivalStanding(r, g.crown.lifetimeStanding)),
      kv('His furthest south', `${formatLat(r.frontierLat)}`),
      kv('Your furthest south', `${formatLat(g.furthestSouth)}`),
      kv('Coasts entered under his name', `${r.claimed.length}`),
      kv('His standing at court', `${Math.round(r.standing)} against your ${Math.round(g.crown.lifetimeStanding)}`),
      r.frontierLat < g.ship.state.pos.lat
        ? el('p', { class: 'bad' },
            'He is further down the coast than you are. Every headland between him and the '
            + 'end of Africa is his to name unless you get there first.')
        : el('p', { class: 'good' },
            'You are ahead of him, and every mile you make while he refits is a mile he will '
            + 'have to be told about.'),
    ));
  }
}

/** A signed quantity said in three words rather than a percentage. */
function scale(v: number, threshold: number, words: [string, string, string] | string[]): string {
  if (v > threshold) return words[2];
  if (v < -threshold) return words[0];
  return words[1];
}

function abilityWord(a: number): string {
  if (a > 0.82) return 'as good as any in Portugal';
  if (a > 0.65) return 'thoroughly capable';
  if (a > 0.45) return 'competent';
  if (a > 0.28) return 'adequate at a pinch';
  return 'not much use';
}

function kindTitle(kind: string): string {
  switch (kind) {
    case 'goods': return 'A report of trade';
    case 'water': return 'A report of an anchorage';
    case 'passage': return 'A report of a passage';
    case 'peril': return 'A warning';
    default: return 'A report of a place';
  }
}

/** The teller's name out of "a pilot at Malindi", for a chart label. */
function shortName(source: string): string {
  const at = source.lastIndexOf(' at ');
  return at > 0 ? `Report from ${source.slice(at + 4)}` : 'Reported place';
}

function bearingTo(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const dLat = to.lat - from.lat;
  const dLon = (to.lon - from.lon) * Math.cos((from.lat * Math.PI) / 180);
  return (((Math.atan2(dLon, dLat) * 180) / Math.PI) % 360 + 360) % 360;
}
