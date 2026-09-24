import { ACTS, ACT_CHARGE, HISTORY, actGoal, roman } from '../progression/chronicle';
import { QUESTS, goalOf, markerOf } from '../progression/quests';
import { NM, compassPoint, formatLat, formatLon, haversine } from '../core/math';
import { OFFICER_ROLES } from '../crew/crew';
import { rivalStanding } from '../progression/rival';
import { daysLeft, ventureLine } from '../progression/ventures';
import { loyaltyWord, officerTitle, traitDef } from '../progression/officers';
import { officerOpinion } from '../game/officerEvents';
import type { Game } from '../game/state';
import { button, card, clear, el, kv, meter } from './dom';
import { good } from '../economy/goods';
import { FAIRS, bookTotals, currentBook, sheetAgeWord } from '../economy/trade';
import { formatDateAt } from '../core/clock';
import { POLITY_BY_ID, TEMPER_WORD } from '../diplomacy/polities';
import { measureWord, rulerName, standingWord } from '../diplomacy/courts';
import { house, kindName } from '../economy/finance';
import { portDef } from '../world/ports';
import {
  capacityOf, regardWordF, stockTons, stockValue, troubleWord,
} from '../progression/feitoria';

type Tab = 'chronicle' | 'missions' | 'trade' | 'courts' | 'reports' | 'stations' | 'wardroom' | 'rival';

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
  private tab: Tab = 'chronicle';
  private tradeGood = '';
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
      chronicle: 0,
      missions: (g.crown.patent ? g.crown.patent.objectives.filter((o) => !o.complete).length : 0)
        + g.quests.filter((q) => !q.outcome).length + g.activeVentures.length,
      trade: g.trade.contracts.filter((c) => c.status === 'open').length,
      courts: g.diplomacy.agreements.filter((a) => a.status === 'open').length,
      reports: g.openLeads.length,
      stations: g.liveFactories.length,
      wardroom: g.crew.officers.filter((o) => o.alive && !o.ashoreAt).length,
      rival: 0,
    };
    const names: Record<Tab, string> = {
      chronicle: 'Chronicle', missions: 'Missions', trade: 'Trade', courts: 'Courts', reports: 'Hearsay',
      stations: 'Factories', wardroom: 'Wardroom', rival: 'Rival',
    };

    const tabs = (Object.keys(names) as Tab[])
      .filter((t) => t !== 'stations' || g.liveFactories.length > 0);
    if (this.tab === 'stations' && g.liveFactories.length === 0) this.tab = 'missions';

    this.body.append(el('div', { class: 'tabs' },
      ...tabs.map((t) => el('button', {
        class: this.tab === t ? 'active' : '',
        onclick: () => { this.tab = t; this.render(); },
      }, counts[t] > 0 ? `${names[t]} (${counts[t]})` : names[t])),
    ));

    if (this.tab === 'chronicle') this.renderChronicle(g);
    else if (this.tab === 'missions') {
      // Everything the ship is bound to, on one page: the King's commission,
      // the long stories, and the merchants' charters.
      this.body.append(el('h2', { class: 'fit-head' }, 'The King\u2019s commission'));
      this.renderCommission(g);
      const pc = this.pilotCard(g);
      if (pc) this.body.append(pc);
      this.body.append(el('h2', { class: 'fit-head' }, 'Stories'));
      this.renderMissions(g);
      this.body.append(el('h2', { class: 'fit-head' }, 'Charters'));
      this.renderCharters(g);
    }
    else if (this.tab === 'trade') this.renderTrade(g);
    else if (this.tab === 'courts') this.renderCourts(g);
    else if (this.tab === 'reports') this.renderLeads(g);
    else if (this.tab === 'stations') this.renderStations(g);
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

  /**
   * The stations, from a thousand miles away.
   *
   * The only screen in the game about places the ship is not. It exists
   * because `trouble` is the one number a player must be able to watch without
   * being there — a factory that can only be inspected by sailing to it is a
   * factory that gets burned while you are doing something else, and the
   * decision it is supposed to create (is it worth breaking the voyage to go
   * and show the flag?) cannot be made blind.
   */
  private renderStations(g: Game): void {
    for (const f of g.liveFactories) {
      const def = portDef(f.portId);
      const away = Math.round((g.clock.t - f.settled) / 86400);
      this.body.append(card(`${def.name} — ${f.factor}`,
        kv('In the shed', `${stockTons(f).toFixed(1)} of ${capacityOf(f).toFixed(0)} tons`),
        kv('Worth at Lisbon', `${stockValue(f)} cruzados`),
        kv('In the chest', `${Math.round(f.chest)} cruzados`, f.chest < 40 ? 'warn' : ''),
        kv('Men in it', `${f.garrison}`),
        kv('The town', regardWordF(f.regard)),
        kv('How it stands', troubleWord(f.trouble),
          f.trouble > 0.55 ? 'bad' : f.trouble > 0.32 ? 'warn' : ''),
        kv('Since you were there', `${away} days`, away > 500 ? 'bad' : away > 300 ? 'warn' : ''),
        f.trouble > 0.55
          ? el('p', {}, 'The arithmetic here only gets worse while you are elsewhere. A ship in '
              + 'the road is most of the answer and it is the only part of it that does not cost '
              + 'money.')
          : null,
      ));
    }
    this.body.append(card('What a station is for',
      el('p', { class: 'flavour' },
        'A ship buying a cargo has to buy it in a fortnight, in front of everybody, at whatever '
        + 'the town decides a man in a hurry should pay. A factor buys the same cargo a barrel at '
        + 'a time across a year at what a resident pays, and it is stacked on the floor waiting '
        + 'when you come. That is the whole of it, and the price of it is a man of yours living '
        + 'on that beach.'),
    ));
  }

  /**
   * The merchant's book: the news, the prices he knows and how old they are,
   * the seasons of the markets, what he has promised, and what the voyage has
   * made so far.
   */
  private renderTrade(g: Game): void {
    const t = g.trade;
    const now = g.clock.t;
    const left = el('div', {}), right = el('div', {});

    // Prices, one good at a time across every port in the book.
    const goods = new Set<string>();
    for (const sh of Object.values(t.sheets)) for (const id of Object.keys(sh.quotes)) goods.add(id);
    const list = [...goods].sort((a, b) => good(b).lisbon - good(a).lisbon);
    if (!this.tradeGood || !goods.has(this.tradeGood)) this.tradeGood = g.ship.cargo.find((c) => goods.has(c.goodId))?.goodId ?? list[0] ?? '';
    const quotes = this.tradeGood ? g.knownQuotes(this.tradeGood).sort((a, b) => (b.wanted ? b.bid : 0) - (a.wanted ? a.bid : 0) || a.ask - b.ask) : [];
    left.append(card('Prices in your book',
      list.length === 0 ? el('p', {}, 'You have no prices yet. Every market you trade in goes into the book, dated.') : el('select', {
        'aria-label': 'Good', class: 'trade-select',
        onchange: (e: Event) => { this.tradeGood = (e.target as HTMLSelectElement).value; this.render(); },
      }, ...list.map((id) => el('option', { value: id, selected: id === this.tradeGood }, good(id).english))),
      quotes.length > 0 ? el('div', { class: 'price-book' },
        el('div', { class: 'price-row head' }, el('span', {}, 'Port'), el('span', { class: 'num' }, 'Ask'), el('span', { class: 'num' }, 'Offer'), el('span', { class: 'num' }, 'Seen')),
        ...quotes.map((q) => el('div', { class: `price-row${q.days > 180 ? ' stale' : ''}` },
          el('span', {}, q.port, q.source !== 'seen' ? el('em', {}, q.source === 'broker' ? ' (broker)' : ' (letter)') : null),
          el('span', { class: 'num' }, q.local && q.ask > 0 ? q.ask.toFixed(1) : '\u2014'),
          el('span', { class: 'num' }, q.bid > 0 ? `${q.bid.toFixed(1)}${q.wanted ? '' : '*'}` : '\u2014'),
          el('span', { class: 'num' }, sheetAgeWord(q.days))))) : null,
      quotes.some((q) => !q.wanted) ? el('p', { class: 'gift-sub' }, '* a middleman\u2019s price: nobody there wants it.') : null,
    ));

    // News.
    const news = g.newsHeard;
    left.append(card('News of the markets',
      news.length === 0 ? el('p', {}, 'Nothing you have heard. News reaches you in port, as late as the last ship.') : null,
      ...news.map((n) => el('div', { class: 'market-news' },
        el('b', {}, n.def.title), ` \u2014 heard ${formatDateAt(n.heard)}. `, n.def.text,
        n.shock.end < now ? el('em', {}, ' It may be over by now.') : null)),
    ));

    // Seasons.
    const m = g.clock.date.month;
    const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    left.append(card('The seasons of the markets',
      ...FAIRS.map((f) => {
        const known = f.ports.filter((id) => g.chart.ports.has(id)).map((id) => portDef(id).name);
        const on = f.months.includes(m);
        return el('div', { class: `fair-row${on ? ' on' : ''}` },
          el('span', {}, el('b', {}, f.name), ` \u2014 ${known.length ? known.join(', ') : 'a coast you have not found'}`),
          el('span', { class: 'due' }, on ? 'now' : f.months.map((x) => MONTH[x - 1]).join(' ')));
      }),
    ));

    // Promises and the Crown.
    const open = t.contracts.filter((c) => c.status === 'open');
    right.append(card('Contracts',
      open.length === 0 ? el('p', {}, 'None signed. The houses in Lisbon offer them at the Freight table.') : null,
      ...open.map((c) => el('div', { class: `court-agreement${c.due - now < 60 * 86400 ? ' late' : ''}` },
        el('span', {}, `${c.qty} ${good(c.goodId).english.toLowerCase()} to ${c.houseName} at ${c.price} (${g.ship.quantityOf(c.goodId).toFixed(0)} aboard)`),
        el('span', { class: 'due' }, `${Math.round((c.due - now) / 86400)} days`))),
    ));
    const lic = Object.entries(t.licences).filter(([, u]) => u > now);
    const ant = t.antwerp.reduce((s2, a) => s2 + a.amount, 0);
    right.append(card('The Crown and the hold',
      kv('Licences', lic.length ? lic.map(([id, u]) => `${good(id).english} to ${formatDateAt(u)}`).join('; ') : 'None: the Casa takes the King\u2019s goods at his price'),
      kv('Officers\u2019 chests', t.quintaladas ? 'Granted' : 'Refused'),
      ant > 0 ? kv('Owed from Antwerp', `${ant.toFixed(0)} cruzados`) : null,
    ));

    // The books.
    const book = currentBook(t);
    const tot = bookTotals(book);
    right.append(card(`This voyage's books \u2014 voyage ${book.n}`,
      kv('Laid out', `${tot.spent.toFixed(0)} cruzados`),
      kv('Taken in', `${tot.taken.toFixed(0)} cruzados`),
      tot.lost > 0 ? kv('Spoiled in the hold', `${tot.lost.toFixed(0)} cruzados of cost`, 'warn') : null,
      kv('In hand on the voyage', `${tot.net >= 0 ? '' : '\u2212'}${Math.abs(tot.net).toFixed(0)} cruzados`, tot.net < 0 ? 'bad' : ''),
      kv('Cargo aboard, at cost', `${g.ship.cargo.reduce((s2, c) => s2 + c.cost * c.quantity, 0).toFixed(0)} cruzados`),
      el('div', { class: 'ledger-lines' },
        ...book.entries.slice(-14).reverse().map((e) => el('div', { class: 'court-agreement' },
          el('span', {}, e.text),
          el('span', { class: `due${e.amount < 0 ? ' neg' : ''}` }, e.amount === 0 ? '' : `${e.amount > 0 ? '+' : '\u2212'}${Math.abs(e.amount).toFixed(0)}`)))),
    ));
    const past = t.books.slice(0, -1).reverse();
    if (past.length > 0) {
      right.append(card('Voyages past',
        ...past.map((b) => {
          const bt = bookTotals(b);
          return el('div', { class: 'court-agreement' },
            el('span', {}, `Voyage ${b.n}: ${formatDateAt(b.start)} \u2013 ${b.end ? formatDateAt(b.end) : ''}`),
            el('span', { class: `due${bt.net < 0 ? ' neg' : ''}` }, `${bt.net >= 0 ? '+' : '\u2212'}${Math.abs(bt.net).toFixed(0)}`));
        })));
    }
    this.body.append(el('div', { class: 'cols two' }, left, right));
  }

  /** Every state you have dealt with: who rules, where you stand, what you owe. */
  private renderCourts(g: Game): void {
    const known = g.knownPolities;
    if (known.length === 0) {
      this.body.append(card('No courts yet',
        el('p', { class: 'flavour' }, 'Every coast beyond Portugal belongs to somebody. The first time you are brought before a ruler, his court goes into this book: who he is, what his people want, and what you have promised him.')));
      return;
    }
    const now = g.clock.t;
    const order = [...known].sort((a, b) => {
      const oa = g.diplomacy.agreements.some((x) => x.polity === a.id && x.status === 'open') ? 1 : 0;
      const ob = g.diplomacy.agreements.some((x) => x.polity === b.id && x.status === 'open') ? 1 : 0;
      return ob - oa || g.polityState(b.id).trust - g.polityState(a.id).trust;
    });
    const grid = el('div', { class: 'cols two' });
    for (const p of order) {
      const st = g.polityState(p.id);
      const agreements = g.diplomacy.agreements.filter((a) => a.polity === p.id);
      const open = agreements.filter((a) => a.status === 'open');
      const kept = agreements.filter((a) => a.status === 'kept').length;
      const broken = agreements.filter((a) => a.status === 'broken').length;
      const coming = g.diplomacy.word.filter((w) => w.polity === p.id).length;
      const feuds = p.feuds.map((f) => POLITY_BY_ID.get(f)?.name).filter(Boolean).join(', ');
      grid.append(card(p.name,
        kv(p.title, `${rulerName(p, st)}${st.knowledge >= 0.2 ? ` \u2014 ${TEMPER_WORD[st.temper]}` : ''}`),
        kv('Where you stand', standingWord(st), st.trust < -0.2 ? 'bad' : st.trust < 0.1 ? 'warn' : ''),
        el('div', { class: 'measures' },
          el('span', {}, `Trust: ${measureWord(st.trust)}`),
          el('span', {}, `Respect: ${measureWord(st.respect)}`),
          el('span', {}, `Interest: ${measureWord(st.interest)}`)),
        kv('What you know of them', st.knowledge < 0.2 ? 'Very little' : st.knowledge < 0.45 ? 'Something' : st.knowledge < 0.7 ? 'A good deal' : 'As much as any stranger can'),
        st.knowledge >= 0.2 ? kv('They want', p.wants.map((w) => good(w).english).join(', ')) : null,
        feuds ? kv('At odds with', feuds) : null,
        st.knowledge >= 0.35
          ? el('div', { class: 'court-factions' },
            el('div', { class: 'court-factions-head' }, 'The court'),
            ...p.factions.map((f) => el('div', { class: 'court-faction' },
              el('span', {}, f.name),
              el('span', { class: 'court-weight' }, `${Math.round(f.weight * 100)}%`),
              meter(((st.factions[f.id] ?? 0) + 1) / 2, (st.factions[f.id] ?? 0) < -0.1 ? 'bad' : (st.factions[f.id] ?? 0) < 0.15 ? 'warn' : ''))))
          : null,
        open.length > 0 ? el('div', { class: 'terms-head' }, 'What you have promised') : null,
        ...open.map((a) => {
          const days = a.due !== undefined ? Math.round((a.due - now) / 86400) : null;
          return el('div', { class: `court-agreement${days !== null && days < 60 ? ' late' : ''}` },
            el('span', {}, a.text),
            el('span', { class: 'due' }, days === null ? 'standing' : `${days} days`));
        }),
        kept + broken > 0 ? kv('Your word', `${kept} kept, ${broken} broken`, broken > kept ? 'bad' : '') : null,
        (st.news ?? []).length > 0 ? el('div', { class: 'terms-head' }, 'Lately') : null,
        ...(st.news ?? []).slice().reverse().map((n) => el('div', { class: 'court-news' }, n.text)),
        coming > 0 ? el('div', { class: 'court-news' }, `Word of your doings is on the road to them (${coming}).`) : null,
      ));
    }
    this.body.append(grid);
  }

  /** The career as five acts, and the history it is happening inside. */
  private renderChronicle(g: Game): void {
    const c = g.chronicle;
    this.body.append(el('div', { class: 'acts' },
      ...ACTS.map((a) => {
        const state = a.n < c.act ? 'past' : a.n === c.act ? 'now' : 'future';
        return el('div', { class: `act ${state}` },
          el('div', { class: 'act-num' }, `Act ${roman(a.n)}`),
          el('div', { class: 'act-title' }, state === 'future' ? '\u2026' : a.english),
          el('div', { class: 'act-sub' }, state === 'future' ? '' : `${a.title} \u00b7 ${a.years}`),
          state === 'now'
            ? el('div', { class: 'act-goal' },
              c.goalMet ? 'Done. Carry the news to the King in Lisbon.' : actGoal(g, a.n))
            : null,
          state === 'now' && a.n >= 2 && ACT_CHARGE[a.n]
            ? el('div', { class: 'act-changes' }, `The King\u2019s commission for it: \u201c${ACT_CHARGE[a.n]}\u201d${g.crown.completedPatents.includes(ACT_CHARGE[a.n]) ? ' \u2014 discharged' : g.crown.patent?.title === ACT_CHARGE[a.n] ? ' \u2014 yours' : ', at court in Lisbon'}.`)
            : null,
          state === 'past' ? el('div', { class: 'act-changes' }, a.changes) : null,
        );
      }),
    ));
    const d = g.clock.date;
    this.body.append(el('h2', { class: 'fit-head' }, `The years \u2014 ${d.year}`));
    this.body.append(el('ol', { class: 'history' },
      ...HISTORY.map((h) => {
        const past = c.history[h.id] !== undefined;
        const due = !past && (d.year > h.year || (d.year === h.year && d.month >= h.month));
        return el('li', { class: past ? 'past' : due ? 'due' : 'future' },
          el('span', { class: 'history-year' }, String(h.year)),
          el('span', { class: 'history-text' },
            past ? h.summary(c)
              : due ? `${h.title} \u2014 ${h.court ? 'the court is waiting for you in Lisbon.' : 'news is waiting in port.'}`
                : '\u2026'),
        );
      }),
    ));
  }

  /** The long stories: where each stands, and what has been done in it. */
  private renderMissions(g: Game): void {
    if (g.quests.length === 0) {
      this.body.append(card('No missions',
        el('p', {}, 'Nobody has asked you for anything beyond the King\u2019s business yet. '
          + 'People with errands wait on the quays — at Funchal and Lagos, on the Guinea '
          + 'coast, at the Kongo river, and at court once your name means something.'),
      ));
      return;
    }
    const open = g.quests.filter((q) => !q.outcome);
    const done = g.quests.filter((q) => q.outcome);
    for (const q of [...open, ...done]) {
      const def = QUESTS[q.id];
      const mark = markerOf(g, q);
      this.body.append(el('div', { class: `mission${q.outcome ? ' done' : ''}` },
        el('div', { class: 'mission-head' },
          el('h3', {}, def.title),
          el('span', {}, q.outcome ? 'Finished' : 'Under way'),
        ),
        q.outcome ? null : el('div', { class: 'mission-goal' },
          el('b', {}, 'Now: '), goalOf(g, q),
          mark ? el('div', { class: 'mission-where' }, `Marked on the chart: ${mark.label}`) : null),
        el('ol', { class: 'mission-log' },
          ...q.journal.map((j) => el('li', {}, j.text))),
      ));
    }
  }

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

