import { NM, compassPoint, formatLat, formatLon, haversine } from '../core/math';
import { OFFICER_ROLES } from '../crew/crew';
import { rivalStanding } from '../progression/rival';
import { daysLeft, ventureLine } from '../progression/ventures';
import { loyaltyWord, officerTitle, traitDef } from '../progression/officers';
import { officerOpinion } from '../game/officerEvents';
import type { Game } from '../game/state';
import { button, card, clear, el, kv } from './dom';
import { TEMPERS as CONSORT_TEMPERS, orderedOffing, signalRangeNm } from '../game/consort';
import { portName } from '../progression/crown';
import { house, kindName } from '../economy/finance';

type Tab = 'orders' | 'charters' | 'reports' | 'wardroom' | 'consort' | 'rival';

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
        button('The chart', () => this.onLayCourse()),
        button('Shut the book  (Esc)', () => this.onClose()),
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
      consort: 0,
      rival: 0,
    };
    const names: Record<Tab, string> = {
      orders: 'Commission', charters: 'Charters', reports: 'Hearsay',
      wardroom: 'Wardroom', consort: 'In company', rival: 'Rival',
    };

    // The consort's tab is only there when there is a consort. A row of tabs
    // that includes a permanently empty one teaches the player to skip it.
    const tabs = (Object.keys(names) as Tab[]).filter((t) => t !== 'consort' || g.consort);
    if (this.tab === 'consort' && !g.consort) this.tab = 'orders';

    this.body.append(el('div', { class: 'tabs' },
      ...tabs.map((t) => el('button', {
        class: this.tab === t ? 'active' : '',
        onclick: () => { this.tab = t; this.render(); },
      }, counts[t] > 0 ? `${names[t]} (${counts[t]})` : names[t])),
    ));

    if (this.tab === 'orders') {
      this.renderCommission(g);
      const pc = this.pilotCard(g);
      if (pc) this.body.append(pc);
    }
    else if (this.tab === 'charters') this.renderCharters(g);
    else if (this.tab === 'reports') this.renderLeads(g);
    else if (this.tab === 'wardroom') this.renderWardroom(g);
    else if (this.tab === 'consort') this.renderConsort(g);
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
      const at = Math.round(Math.min(o.progress, want));
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

  /**
   * How close the watch may take her to the land.
   *
   * The one order in the game that the player could not give, and the one he
   * most needed: without it the watch keep three and a half miles of water
   * under her lee whatever he wants, which is correct on a long passage and
   * makes surveying a coast, closing an anchorage or looking at an island
   * impossible — they haul her off and announce it, over and over.
   */
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

    // What is owed, at sea, where it is worth knowing. A bill falling due in
    // forty days is a reason to turn for home, and a captain who only sees it
    // on the counting-house screen in port sees it a month too late.
    const bills = g.finance.live.filter((d) => d.kind !== 'quinhao');
    const shares = g.finance.live.filter((d) => d.kind === 'quinhao');
    if (bills.length > 0 || shares.length > 0) {
      this.body.append(card('What is owed',
        ...bills.map((d) => {
          const days = Math.round((d.dueBy - g.clock.t) / 86400);
          return kv(`${house(d.house).short} — ${kindName(d.kind).toLowerCase()}`,
            `${Math.round(d.owed - d.seized)} cruzados, `
            + (days < 0 ? `${-days} days overdue` : `due in ${days} days`),
            days < 0 ? 'bad' : days < 45 ? 'warn' : '');
        }),
        ...shares.map((d) => kv(`${house(d.house).short} — ${d.sixteenths}/16`,
          `${(d.share * 100).toFixed(0)}% of everything landed`)),
        bills.some((d) => d.kind === 'cambio')
          ? el('p', {}, 'The câmbios are the ones that die with her. Whatever else happens on '
              + 'this passage, that money is not owed by a man at the bottom of the sea.')
          : null,
        bills.some((d) => g.clock.t > d.dueBy)
          ? el('p', {}, 'Paper past its date compounds every week and the factors have written '
              + 'to each other. Making a port where the house has a man is how this gets settled, '
              + 'and it is also how they find you.')
          : null,
      ));
    }
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
          `${officerTitle(o)}${def ? ` (${def.title})` : ''}${t ? `, ${t.name.toLowerCase()}` : ''}`),
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

  /**
   * The second ship: where she is, who has her, and what she is to do.
   *
   * Written as orders rather than as a control panel, because that is what they
   * are. Every one of them is a signal made to another captain who may or may
   * not be in a position to read it, and the screen says so — an order given to
   * a ship beyond signalling distance is not given at all.
   */
  /** Bring the pilot back, for a captain who shut him and wants the next word. */
  private pilotCard(g: Game): HTMLElement | null {
    if (!g.pilotAvailable) return null;
    if (g.tutorial.on) return null;
    return card('The pilot',
      el('p', {},
        'Rui Correia has stopped offering advice because you told him to. He has not '
        + 'finished the first voyage with you and would take it up again if asked.'),
      button('Ask him what he would do', () => {
        g.recallTutorial();
        this.render();
      }));
  }

  private renderConsort(g: Game): void {
    const c = g.consort;
    if (!c) return;
    const r = g.consortLine()!;
    const t = CONSORT_TEMPERS[c.temper];
    const inSignal = r.distNm <= signalRangeNm(g) && !c.lost && c.station !== 'detached';

    this.body.append(card(`${c.name}`,
      el('p', { class: 'quote' }, `${c.captain} — ${t.label.toLowerCase()}. ${t.line}`),
      kv('Where she is', r.line),
      kv('Station', c.station === 'detached'
        ? `Detached for ${c.boundFor ?? 'Lisbon'}`
        : c.station === 'scout' ? `Ranging ${orderedOffing(c).toFixed(0)} miles ahead`
          : c.station === 'alongside' ? 'Alongside'
            : `${orderedOffing(c).toFixed(1)} miles on the quarter`),
      kv('Her people', `${c.crew} aboard`),
      kv('Her water', `${c.water.toFixed(0)} days`),
      kv('Her lading', `${c.cargoTons.toFixed(0)} tons`),
      kv('Her state', `${Math.round(c.condition * 100)} in a hundred`),
      kv('What he thinks of you', consortRegardWord(c.regard)),
      el('p', {}, r.state),
    ));

    if (!inSignal) {
      this.body.append(card('Out of signal',
        el('p', {}, c.station === 'detached'
          ? 'She is on her own errand. Nothing you decide here reaches her.'
          : 'Nothing can be signalled to her at this distance. Close her, or wait '
            + 'for her to close you, before giving an order.')));
      return;
    }

    const order = (label: string, detail: string, run: () => string) =>
      el('div', { style: { marginBottom: '10px' } },
        button(label, () => {
          this.notice = run();
          this.render();
        }),
        el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '3px' } },
          detail));

    this.body.append(card('Signals',
      this.notice ? el('p', { class: 'quote' }, this.notice) : el('span', {}),
      order('Keep close company', 'A mile on the quarter. Slower, and you will not lose her.',
        () => g.orderConsort('company', 1)),
      order('Keep loose company', 'Four miles. Faster, and the signal still carries.',
        () => g.orderConsort('company', 4)),
      order('Range ahead', 'Twelve miles up to windward. She sees things first and alone.',
        () => g.orderConsort('scout', 12)),
      order('Close and heave to', 'Both ships stopped, the boats out, and an hour or a day gone.',
        () => g.orderConsort('alongside')),
    ));

    this.body.append(card('Detach her',
      el('p', {},
        'Send her away on her own passage. She is out of the voyage from that moment, and '
        + 'whatever she is carrying goes with her — which is either the safest thing you can '
        + 'do with the King\'s pepper or the last you will see of it.'),
      ...['lisboa', 'mina', 'funchal'].map((id) => order(
        `Send her to ${portName(id)}`,
        'You will hear when she arrives, and not before.',
        () => g.detachConsort(id),
      )),
    ));
  }

  private notice = '';


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

/**
 * What the consort's captain makes of you.
 *
 * Deliberately not the same words as the fo'c'sle's regard: a hand's opinion is
 * about whether he trusts you with his life, and another captain's is about
 * whether he thinks you are fit to command him, which is a different and in
 * some ways a colder question.
 */
function consortRegardWord(r: number): string {
  if (r > 0.8) return 'would follow you anywhere, and has said so';
  if (r > 0.62) return 'thinks you know your business';
  if (r > 0.45) return 'is reserving his judgement';
  if (r > 0.28) return 'has begun to answer signals slowly';
  return 'obeys you because of the commission and for no other reason';
}
