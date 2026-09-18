import { clamp } from '../core/math';
import { good, unitOf } from '../economy/goods';
import { Markets, provisioningCost, type Listing } from '../economy/market';
import { people } from '../world/peoples';
import type { PortDef } from '../world/ports';
import { availableUpgrades, UPGRADE_BY_ID } from '../ship/upgrades';
import { hullClass } from '../ship/hull';
import { ALMANACS, ALTITUDE_INSTRUMENTS, COMPASSES, SPEED_INSTRUMENTS } from '../navigation/instruments';
import { OFFICER_ROLES } from '../crew/crew';
import { skill } from '../crew/skills';
import { loyaltyWord, officerTitle, traitDef } from '../progression/officers';
import { RATING_LABEL, TEMPER, regardWord as handRegardWord } from '../crew/hands';
import { ARC_BY_ID } from '../progression/arcs';
import {
  backingFor, candidates, errandsAt, journeyWord, outfitCost, outstanding,
} from '../progression/inland';
import { daysLeft, ventureLine, ventureTons } from '../progression/ventures';
import {
  HOUSES, creditWord, house, kindBlurb, kindName, quinhaoPrice, standingLine,
  type DebtKind, type House,
} from '../economy/finance';
import { portName } from '../progression/crown';
import {
  WORKS, buyable, capacityOf, regardWordF, residentPrice, stockTons, stockValue,
  troubleWord, type Feitoria,
} from '../progression/feitoria';
import type { Game } from '../game/state';
import { append, button, card, clear, el, kv, plural } from './dom';

type Tab = 'town' | 'market' | 'freight' | 'money' | 'station' | 'stores' | 'yard' | 'hands';

/** Everything that happens at anchor: the market, the yard, and the wardroom. */
export class PortView {
  root = el('div', { class: 'screen' });
  private body = el('div', { class: 'screen-body' });
  private head = el('div', { class: 'screen-head' });
  private foot = el('div', { class: 'screen-foot' });
  private tab: Tab = 'town';
  /** Goods the player has been warned about selling out from under a charter. */
  private confirmSale: string | null = null;
  private game: Game | null = null;
  private quantities = new Map<string, number>();
  private notice: { text: string; grave?: boolean } | null = null;
  /** Which officer the inland card has selected, until one is sent. */
  private inlandMan: string | null = null;
  /** The standing order being composed before a station exists to carry it. */
  private stationOrder: string[] = [];

  constructor(
    private onClose: () => void,
    private onAudience: () => void,
    private onCourt: () => void,
  ) {
    this.root.append(this.head, this.body, this.foot);
  }

  open(g: Game): void {
    this.game = g;
    this.tab = 'town';
    this.notice = null;
    this.quantities.clear();
    if (g.dockedAt) g.markets.refresh(g.dockedAt, g.clock.t);
    this.render();
  }

  private render(): void {
    const g = this.game;
    const def = g?.portHere;
    if (!g || !def) return;

    const pe = people(def.people);
    const rel = g.relationsFor(def.id);

    clear(this.head);
    this.head.append(
      el('h1', {}, def.name),
      el('div', { class: 'sub' },
        `${pe.name}${def.modern ? ` · ${def.modern}` : ''} · ${g.clock.formatDate()}`),
    );

    clear(this.foot);
    append(this.foot,
      el('div', { style: { marginRight: 'auto', fontSize: '13.5px' } },
        `${g.crown.gold.toFixed(0)} cruzados · ${g.crown.title.name} · ${g.crown.lifetimeStanding} renown`),
      def.id === 'lisboa' ? button('To court', () => this.onCourt()) : null,
      button('Seek an audience', () => this.onAudience(), {
        disabled: def.people === 'portuguese',
        title: def.people === 'portuguese' ? 'These are your own people.' : undefined,
        // Until you have leave to trade, the audience is the only thing at this
        // anchorage worth doing, and a player who does not know that wanders
        // into the market and is told no.
        primary: def.people !== 'portuguese' && !rel.mayTrade,
      }),
      button('Weigh anchor  (Space)', () => { g.weighAnchor(); this.onClose(); },
        { primary: def.people === 'portuguese' || rel.mayTrade }),
    );

    clear(this.body);
    const tabs: [Tab, string][] = [
      ['town', 'Town'],
      ['market', 'Market'],
      ['freight', g.ventureOffers.length > 0 ? `Freight (${g.ventureOffers.length})` : 'Freight'],
      ['money', g.finance.owedTo() > 0 ? `Counting house (${g.finance.owedTo().toFixed(0)})` : 'Counting house'],
      ['stores', 'Stores'],
      ['yard', 'Shipwrights'],
      ['hands', 'Hands'],
    ];
    // Only where there is one or where there could be: the tab is not a
    // permanent reminder of an article most captains never buy.
    if (g.factoryHere || g.canFoundFactory(def) === null) {
      const f = g.factoryHere;
      tabs.splice(4, 0, ['station',
        f ? `Feitoria (${stockTons(f).toFixed(1)}t)` : 'Found a feitoria']);
    }
    this.body.append(el('div', { class: 'tabs' },
      ...tabs.map(([t, label]) => el('button', {
        class: this.tab === t ? 'active' : '',
        onclick: () => { this.tab = t; this.notice = null; this.confirmSale = null; this.render(); },
      }, label)),
    ));

    if (this.notice) {
      this.body.append(el('div', { class: `notice${this.notice.grave ? ' grave' : ''}` }, this.notice.text));
    }

    const inner = el('div', {});
    switch (this.tab) {
      case 'town': this.renderTown(inner, g, rel); break;
      case 'market': this.renderMarket(inner, g, rel); break;
      case 'freight': this.renderFreight(inner, g, rel); break;
      case 'money': this.renderMoney(inner, g); break;
      case 'station': this.renderStation(inner, g); break;
      case 'stores': this.renderStores(inner, g); break;
      case 'yard': this.renderYard(inner, g); break;
      case 'hands': this.renderHands(inner, g); break;
    }
    this.body.append(inner);
  }

  private renderTown(host: HTMLElement, g: Game, rel: ReturnType<Game['relationsFor']>): void {
    const def = g.portHere!;
    const pe = people(def.people);

    const left = el('div', {});
    const right = el('div', {});
    // Coming among a people nobody from Europe has met is the single most
    // dramatic thing in the game, and it used to be one line of prose in the
    // same grey box as the harbour's holding ground.
    const unknown = !g.peopleKnown(def) && !rel.met;

    if (unknown) {
      left.append(el('div', { class: 'first-contact' },
        el('div', { class: 'first-contact-eyebrow' }, 'No Portuguese has stood here before'),
        el('h2', {}, `The ${pe.name}`),
        el('p', {}, firstContactLine(pe)),
        el('p', { class: 'first-contact-do' },
          'Nothing may be bought or sold until whoever governs the place has seen you '
          + 'and decided what you are. Seek an audience.'),
      ));
    }

    left.append(card('', el('p', { style: { fontSize: '15px', lineHeight: '1.7' } }, def.blurb)));

    // Voyages are lost in port, a fortnight before anybody notices. Every one
    // of these numbers already existed; every one was on a different screen.
    const checks = g.readiness();
    const bad = checks.filter((c) => c.state === 'bad').length;
    left.append(card(bad > 0 ? 'Before you sail — she is not ready' : 'Before you sail',
      ...checks.map((c) => el('div', { class: `ready-row ${c.state}` },
        el('div', { class: 'ready-line' },
          el('span', {}, c.label),
          el('em', {}, c.value)),
        c.note ? el('div', { class: 'ready-note' }, c.note) : null,
      )),
    ));

    if (g.portGossip) {
      left.append(card('What they say ashore',
        el('p', { style: { fontStyle: 'italic', lineHeight: '1.7' } }, g.portGossip)));
    }

    // The people, in the sidebar. When the card above has just introduced them
    // at length, this is the reference table and not a second introduction.
    right.append(card(pe.name,
      unknown ? null : el('p', {}, pe.blurb),
      kv('Language', pe.language),
      kv('Faith', { catholic: 'Catholic', muslim: 'Muslim', hindu: 'Hindu', traditional: 'Their own', buddhist: 'Buddhist' }[pe.faith]),
      kv('Regard for you', regardWord(rel.regard)),
      kv('Leave to trade', rel.mayTrade ? 'Granted' : 'Not granted'),
      rel.exclusive ? kv('Exclusive terms', 'Agreed') : null,
      rel.factory ? kv('Factory', 'Established') : null,
    ));

    // Said once. The hero card above already says it better.
    if (!rel.mayTrade && def.people !== 'portuguese' && !unknown) {
      right.append(el('div', { class: 'notice' },
        'You have no leave to trade here. Seek an audience with whoever governs the place before you open the hold.'));
    }

    right.append(card('The anchorage',
      kv('Shelter', qualityWord(def.anchorage)),
      kv('Water and provisions', qualityWord(def.refit)),
      kv('Size', { anchorage: 'A bare roadstead', village: 'A village', town: 'A town', city: 'A city', emporium: 'A great emporium' }[def.size]),
      kv('Wealth', qualityWord(def.wealth)),
    ));

    const monsoon = g.monsoonNow();
    right.append(card('Pass the time',
      el('p', {}, 'Lying at anchor rests the crew, mends their spirits, and lets fresh food do its work — and it also lets the weather change, and the season turn.'),
      el('div', { style: { display: 'flex', gap: '7px', flexWrap: 'wrap' } },
        ...[1, 3, 7, 14, 30].map((d) => button(`${d} ${d === 1 ? 'day' : 'days'}`, () => {
          g.waitDays(d);
          this.notice = { text: `${d} days pass at anchor.` };
          this.render();
        })),
      ),
      // The thing every hull in this ocean actually did, and the reason its
      // harbours were full: lie here until the wind comes round.
      monsoon
        ? el('div', { style: { marginTop: '13px', paddingTop: '11px', borderTop: '1px solid rgba(90,74,55,0.2)' } },
            kv('The season', monsoon.name),
            el('p', { style: { fontSize: '13px' } }, monsoon.carries),
            el('p', { style: { fontSize: '13px', fontStyle: 'italic', color: 'var(--ink-soft)' } },
              monsoon.against),
            el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '8px' } },
              el('span', { style: { fontSize: '13px', color: 'var(--ink-soft)' } },
                `${Math.round(monsoon.daysToTurn)} days to the turn, and a month of calms after it`),
              button('Lie here until the wind comes round', () => {
                this.notice = { text: g.waitForTheMonsoon() };
                this.render();
              }),
            ),
          )
        : null,
    ));

    host.append(el('div', { class: 'cols two' }, left, right));
  }

  private renderMarket(host: HTMLElement, g: Game, rel: ReturnType<Game['relationsFor']>): void {
    const def = g.portHere!;
    if (!rel.mayTrade) {
      host.append(el('div', { class: 'notice grave' },
        'The market is closed to you. Nobody will deal until the governor says they may.'));
      return;
    }

    const eff = g.effectiveSkill;
    const tradeSkill = skill(eff, 'comercio');
    // Standing with a people you have written up is standing you have earned:
    // the page has their language, what they will take, who their king is, and
    // a man who has all that is not a stranger on the beach.
    const known = g.diplomaticEdge(def.people);
    // Whatever is in the hold is on the counter too, even where the town never
    // asked for it — otherwise a cargo bought for one market is dead weight
    // everywhere else in the world and the captain cannot even see that it is.
    const listings = g.markets.listings(
      def.id, g.clock.t, rel.regard + known, tradeSkill,
      g.ship.cargo.map((c) => c.goodId),
    );

    // Not a table.
    //
    // The market had seven columns, the last of them a quantity box and two
    // buttons, and on a phone the whole right-hand half of it was off the side
    // of the screen — which meant the trading half of a trading game could not
    // be played on a phone at all. This is a grid whose rows are laid out
    // across on a wide screen and stacked into a card on a narrow one, with
    // `display: contents` doing the switching, so the figures still line up in
    // columns where there is room for columns and the controls are always
    // reachable where there is not.
    const grid = el('div', { class: 'trade-grid' },
      el('div', { class: 'trade-head' },
        el('div', {}, 'Goods'),
        el('div', { class: 'num' }, 'They ask'),
        el('div', { class: 'num' }, 'They offer'),
        el('div', { class: 'num' }, 'Lisbon'),
        el('div', { class: 'num' }, 'Available'),
        el('div', { class: 'num' }, 'In hold'),
        el('div', {}, ''),
      ),
    );

    for (const l of listings) {
      const gd = good(l.goodId);
      const held = g.ship.quantityOf(l.goodId);
      const qty = this.quantities.get(l.goodId) ?? 10;
      const margin = gd.lisbon / Math.max(l.ask, 0.01);
      const onCharter = consignedOf(g, l.goodId);
      const forCrown = commissionNeed(g, l.goodId);

      grid.append(el('div', { class: 'trade-row' },
        el('div', { class: 'trade-name' },
          el('b', {}, gd.english),
          el('span', {}, `${gd.name} · per ${gd.unit}`),
        ),
        el('div', { class: 'trade-fig', 'data-k': 'They ask' },
          l.stock > 0 ? l.ask.toFixed(1) : '—'),
        el('div', {
          class: 'trade-fig', 'data-k': 'They offer',
          style: l.appetite > 0 && !l.wanted ? { opacity: '0.62', fontStyle: 'italic' } : undefined,
          title: l.wanted ? undefined
            : 'Nobody here wants it. One merchant will take a parcel off your hands to '
              + 'move on elsewhere, and prices it accordingly.',
        }, l.appetite > 0 ? l.bid.toFixed(1) : '—'),
        el('div', {
          class: 'trade-fig', 'data-k': 'At Lisbon',
          style: { color: margin > 3 ? 'var(--green)' : 'inherit' },
        }, gd.lisbon.toFixed(0)),
        el('div', { class: 'trade-fig', 'data-k': 'Available' },
          l.stock > 0 ? l.stock.toFixed(0) : '—'),
        el('div', {
          class: 'trade-fig', 'data-k': 'In hold',
          title: onCharter > 0 ? 'Part of this is on charter'
            : forCrown > 0 ? 'The King is expecting this cargo' : undefined,
          style: forCrown > 0 && held < forCrown ? { color: 'var(--warn)' } : undefined,
        },
          held > 0 || forCrown > 0
            ? onCharter > 0 ? `${held.toFixed(0)} (${onCharter} on charter)`
              : forCrown > 0 ? `${held.toFixed(0)} of ${forCrown} for the King`
                : held.toFixed(0)
            : '—'),
        el('div', { class: 'trade-act' },
          el('input', {
            type: 'number', min: '1', inputmode: 'numeric', value: String(qty),
            'aria-label': `Quantity of ${gd.name}`,
            oninput: (e: Event) => this.quantities.set(
              l.goodId, Math.max(1, Number((e.target as HTMLInputElement).value))),
          }),
          button('Buy', () => this.buy(g, l, this.quantities.get(l.goodId) ?? qty), {
            disabled: l.stock <= 0 || g.crown.gold + g.creditFree < l.ask,
          }),
          button('Sell', () => this.sell(g, l, this.quantities.get(l.goodId) ?? qty), {
            disabled: held <= 0 || l.appetite <= 0,
          }),
        ),
      ));
    }

    append(host,
      el('div', { class: 'card' },
        el('div', { class: 'purse-row' },
          el('div', {}, kv('Purse', `${g.crown.gold.toFixed(0)} cruzados`)),
          el('div', {}, kv('Hold free', `${g.ship.holdFree.toFixed(1)} of ${g.ship.holdCapacity} tons`)),
          el('div', {}, kv('Your bargaining', `${g.skills.comercio.toFixed(0)}`)),
          g.creditLimit > 0
            ? el('div', {}, kv('Credit',
                `${g.creditFree.toFixed(0)} to draw` + (g.crown.debt > 0 ? ` · ${g.crown.debt.toFixed(0)} owed` : '')))
            : null,
        ),
      ),
      grid,
      this.factorsEye(g),
      el('p', { class: 'quote', style: { marginTop: '16px' } },
        'The Lisbon column is what a quintal fetches on the Tagus. The whole enterprise rests on the difference between that number and what they are asking here — pepper bought at Calicut for two cruzados sold at home for thirty, and one cargo paid for the voyage several times over.'),
    );
  }

  /**
   * What the same goods fetch at the other ports you know.
   *
   * The whole of the trade game was previously played against one number — the
   * Lisbon column — so every cargo decision was the same decision. A captain
   * who has taken the factor's eye is buying for a market he can name, which is
   * what actually made these voyages pay.
   */
  private factorsEye(g: Game): HTMLElement | null {
    const here = g.portHere!.id;
    const rows: HTMLElement[] = [];
    for (const lot of g.ship.cargo) {
      const quotes = g.distantQuotes(lot.goodId, here);
      if (quotes.length === 0) continue;
      rows.push(el('li', {},
        el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } },
          el('span', {}, good(lot.goodId).english),
          el('span', { style: { color: 'var(--ink-soft)', fontSize: '12.5px' } },
            quotes.map((q) => `${q.port} ${q.bid.toFixed(1)}`).join('  ·  ')),
        ),
      ));
    }
    if (rows.length === 0) return null;
    return card('What they pay elsewhere',
      el('p', { style: { fontStyle: 'italic', color: 'var(--ink-soft)' } },
        'From your correspondence, and as stale as the last ship to come this way.'),
      el('ul', { class: 'list' }, ...rows),
    );
  }

  private buy(g: Game, l: Listing, qty: number): void {
    const gd = good(l.goodId);
    const affordable = Math.floor((g.crown.gold + g.creditFree) / l.ask);
    const roomFor = Math.floor(g.ship.holdFree / gd.bulk);
    const take = Math.min(qty, l.stock, affordable, roomFor);
    if (take <= 0) {
      this.notice = {
        text: roomFor <= 0 ? 'No room in the hold.' : affordable <= 0 ? 'Not enough in the purse.' : 'None to be had.',
        grave: true,
      };
      this.render();
      return;
    }
    // A quote is for a reasonable parcel. Sweeping the town moves the price
    // against you while you are doing it.
    const paid = l.ask * Markets.slippage(take, l.stock);
    const cost = take * paid;
    // A captain with credit draws on it without being asked; the debt is
    // reported in the log and stands over him until the voyage is settled.
    if (cost > g.crown.gold) g.drawCredit(cost);
    if (cost > g.crown.gold) {
      const canAfford = Math.floor(g.crown.gold / paid);
      if (canAfford <= 0) {
        this.notice = { text: 'Not enough in the purse, once they see how much you want.', grave: true };
        this.render();
        return;
      }
      return this.buy(g, l, canAfford);
    }
    g.ship.addCargo(l.goodId, take, paid);
    g.crown.gold -= cost;
    g.markets.buy(g.portHere!.id, l.goodId, take);
    g.crown.syncCargoObjectives((id) => g.ship.quantityOf(id));
    g.logEvent('trade', `Bought ${take.toFixed(0)} ${gd.unit} of ${gd.name.toLowerCase()} at ${paid.toFixed(1)} the ${gd.unit}, ${cost.toFixed(0)} cruzados in all.`);
    this.notice = { text: `Took aboard ${take.toFixed(0)} ${gd.unit} of ${gd.name.toLowerCase()} for ${cost.toFixed(0)} cruzados.` };
    this.render();
  }

  private sell(g: Game, l: Listing, qty: number): void {
    const gd = good(l.goodId);
    const held = g.ship.quantityOf(l.goodId);
    const take = Math.min(qty, held, l.appetite);
    if (take <= 0) { this.notice = { text: 'They will not take any more of that.', grave: true }; this.render(); return; }

    // Cargo signed for on charter is somebody else's. Selling it out from under
    // a merchant is a real option — it is money now against a forfeit later —
    // but it must never happen because the player did not know it was aboard.
    const consigned = g.activeVentures
      .filter((v) => v.loaded && v.goodId === l.goodId)
      .reduce((sum, v) => sum + v.quantity, 0);
    if (consigned > 0 && held - take < consigned - 0.01) {
      const short = Math.ceil(consigned - (held - take));
      if (!this.confirmSale) {
        this.confirmSale = l.goodId;
        this.notice = {
          text: `${short} of that is consigned on charter. Sell it and the charter is broken, `
            + 'the advance is forfeit and the penalty falls due. Press Sell again to do it.',
          grave: true,
        };
        this.render();
        return;
      }
    }

    // And cargo the King is expecting, which is worse.
    //
    // A cargo objective is checked against what is actually in the hold when
    // you walk into court, so selling it puts the commission back to nought —
    // and the most obvious thing in the world to do with a hold full of Madeira
    // sugar is to sell it in the Lisbon market, which is the room you are
    // standing in. The charter had a warning and this had none, so a player
    // could lose a commission, its reward, its renown and its skill point by
    // doing the single most natural thing available to him, and nothing on the
    // screen would connect the two. Selling it anyway is still allowed: there
    // are voyages where the coin now is worth more than the King's good
    // opinion, and that is the captain's call to make knowingly.
    const owed = commissionNeed(g, l.goodId);
    if (owed > 0 && held - take < owed - 0.01) {
      const short = Math.ceil(owed - (held - take));
      if (this.confirmSale !== l.goodId) {
        this.confirmSale = l.goodId;
        this.notice = {
          text: `The King is expecting ${owed.toFixed(0)} ${unitOf(gd, owed)} of this, and selling would `
            + `leave you ${short} short. Your commission cannot be discharged until it is made `
            + 'good. Press Sell again to do it anyway.',
          grave: true,
        };
        this.render();
        return;
      }
    }
    this.confirmSale = null;

    const lot = g.ship.cargo.find((c) => c.goodId === l.goodId);
    const paid = lot ? lot.cost : 0;
    // Landing a great parcel at once gluts the quay and the price falls under
    // you as you sell.
    // A captain with the page open knows what the stuff cost where it grew,
    // and a merchant who can see he knows does not try it on. Small on purpose:
    // an edge, not a cheat.
    const edge = g.tradeEdge(l.goodId);
    const got = (l.bid / Markets.slippage(take, l.appetite)) * (1 + edge);
    const revenue = take * got;
    g.ship.removeCargo(l.goodId, take);
    g.crown.gold += revenue;
    // The sharers' man is standing at the scale. Taken here rather than at a
    // reckoning in Lisbon because that is where it was taken, and because
    // watching it come off the top of the best cargo of your life is the whole
    // cost of having sold sixteenths.
    const shared = g.takeShares(revenue);
    g.markets.sell(g.portHere!.id, l.goodId, take);
    g.crown.syncCargoObjectives((id) => g.ship.quantityOf(id));

    const profit = revenue - paid * take;
    g.logEvent('trade',
      `Sold ${take.toFixed(0)} ${gd.unit} of ${gd.name.toLowerCase()} at ${got.toFixed(1)}, ${revenue.toFixed(0)} cruzados` +
      (paid > 0 ? `, against ${(paid * take).toFixed(0)} paid — ${profit >= 0 ? 'a gain' : 'a loss'} of ${Math.abs(profit).toFixed(0)}.` : '.'));
    if (shared > 0.5) {
      g.logEvent('trade',
        `${shared.toFixed(0)} cruzados of that went straight off the scale to the men who hold `
        + 'sixteenths of this voyage. Nobody had to ask you for it.');
    }
    this.notice = {
      text: `Sold for ${revenue.toFixed(0)} cruzados`
        + (paid > 0 ? ` — ${profit >= 0 ? 'profit' : 'loss'} ${Math.abs(profit).toFixed(0)}.` : '.')
        + (edge > 0.01 ? ` Your book was worth ${(edge * 100).toFixed(0)}% of it.` : '')
        + (shared > 0.5 ? ` The sharers took ${shared.toFixed(0)} off the top.` : ''),
    };
    this.render();
  }

  /**
   * The counting house.
   *
   * Charters on offer here, and the hearsay of the waterfront. The two belong
   * together because they are the same thing from the captain's side: the
   * reasons to go somewhere that are not the King's orders.
   */
  private renderFreight(host: HTMLElement, g: Game, rel: ReturnType<Game['relationsFor']>): void {
    const left = el('div', {});
    const right = el('div', {});

    if (!rel.mayTrade) {
      left.append(el('div', { class: 'notice' },
        'No merchant here will sign anything with a man who has no leave to trade.'));
    } else if (g.ventureOffers.length === 0) {
      left.append(card('No freight offering',
        el('p', {}, 'Nothing is waiting for a bottom. Come back when the market has turned over, '
          + 'or when there is a ship expected that does not arrive.')));
    } else {
      for (const v of g.ventureOffers) {
        const days = Math.round(daysLeft(v, g.clock.t));
        // The hold is measured in tons, not in casks: room is what the cargo
        // stows, not how many of it there are.
        const tons = ventureTons(v);
        const room = g.ship.holdFree >= tons - 0.01;
        left.append(card(v.patron,
          el('p', { class: 'flavour' }, ventureLine(v)),
          kv('Freight paid on delivery', `${v.fee} cruzados`),
          kv('Advance in hand', `${v.advance} cruzados`),
          kv('Time allowed', `${days} days`),
          kv('Forfeit if she is late', `${v.penalty} cruzados`),
          kv('It will stow', `${tons.toFixed(1)} tons of ${g.ship.holdFree.toFixed(1)} free`,
            room ? '' : 'bad'),
          el('div', { class: 'row' },
            button('Sign for it', () => {
              this.notice = { text: g.acceptVenture(v.id) };
              this.render();
            }, { primary: true, disabled: !room }),
          ),
        ));
      }
    }

    const active = g.activeVentures;
    right.append(card('Carried on your own account',
      active.length === 0
        ? el('p', {}, 'Nothing consigned.')
        : el('div', {}, ...active.map((v) => {
            const left2 = Math.round(daysLeft(v, g.clock.t));
            return el('p', { class: left2 < 10 ? 'bad' : '' },
              `${ventureLine(v)} for ${v.patron} — ${left2 < 0 ? `${-left2} days overdue` : `${left2} days`}.`);
          })),
    ));

    const heard = g.openLeads;
    right.append(card('What the waterfront says',
      heard.length === 0
        ? el('p', {}, 'Nothing you have not heard before. Buy a pilot a drink and wait.')
        : el('div', {}, ...heard.slice(0, 4).map((l) =>
            el('p', { class: 'flavour', style: { marginBottom: '9px' } }, l.text))),
      el('p', { style: { fontSize: '13px', opacity: '0.75' } },
        'Every one of these is a man\u2019s word, and a man\u2019s word is worth what the man is worth. '
        + 'The chart will show you where they point, which is not the same as where the thing is.'),
    ));

    host.append(el('div', { class: 'cols two' }, left, right));
  }

  /**
   * The Rua Nova.
   *
   * Three instruments, four or five houses, and one screen that has to make the
   * difference between them obvious without a paragraph of explanation, because
   * the whole decision *is* the difference between them. So each card leads
   * with the one sentence that matters — the sea loan dies with the ship, the
   * letra does not, the sixteenths are never repaid — and the number underneath
   * is the price of that sentence.
   */
  private renderMoney(host: HTMLElement, g: Game): void {
    const def = g.portHere!;
    const left = el('div', {});
    const right = el('div', {});

    const live = g.finance.live;
    const loans = live.filter((d) => d.kind !== 'quinhao');
    const shares = live.filter((d) => d.kind === 'quinhao');

    // What is owed, first, because a man walking into a counting house knows
    // what he owes before he knows what he wants.
    right.append(card('Paper outstanding',
      loans.length === 0 && shares.length === 0
        ? el('p', {}, 'Nothing out. Your name is your own and so is the voyage.')
        : el('div', {}, ...loans.map((d) => {
            const h = house(d.house);
            const over = Math.round(g.finance.daysOverdue(d, g.clock.t));
            const due = Math.round(d.owed - d.seized);
            return el('div', { style: { marginBottom: '12px' } },
              kv(`${h.short} — ${kindName(d.kind).toLowerCase()}`, `${due} cruzados`,
                over > 0 ? 'bad' : ''),
              el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)' } },
                over > 0
                  ? `${over} days overdue, drawn at ${portName(d.atPort)}.`
                    + (d.kind === 'letra' ? ' It is compounding weekly.' : '')
                  : `Due in ${Math.round((d.dueBy - g.clock.t) / 86400)} days, drawn at ${portName(d.atPort)}.`),
              el('div', { class: 'row', style: { marginTop: '4px' } },
                button(`Pay ${due}`, () => {
                  this.notice = { text: g.repayDebt(d.id) };
                  this.render();
                }, { disabled: g.crown.gold + g.creditFree < 1 }),
                button('Pay half', () => {
                  this.notice = { text: g.repayDebt(d.id, Math.round(due / 2)) };
                  this.render();
                }, { disabled: g.crown.gold + g.creditFree < 1 || due < 4 }),
              ),
            );
          }),
          ...shares.map((d) => {
            const h = house(d.house);
            return el('div', { style: { marginBottom: '10px' } },
              kv(`${h.short} — ${d.sixteenths}/16 of the voyage`,
                `${(d.share * 100).toFixed(0)}% of everything landed`),
              el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)' } },
                `He put in ${Math.round(d.principal)} and has taken ${Math.round(d.drawn)} so far. `
                + `Discharged in ${Math.max(0, Math.round((d.dueBy - g.clock.t) / 86400))} days.`),
            );
          }),
        ),
      g.finance.shareOut > 0
        ? el('p', { class: 'notice' },
            `${(g.finance.shareOut * 100).toFixed(0)} per cent of every cargo you land and every `
            + 'settlement you are paid goes to the men holding sixteenths, off the top, before you '
            + 'see it.')
        : null,
    ));

    right.append(card('The Casa’s own credit',
      kv('Left to draw', `${g.creditFree.toFixed(0)} cruzados`),
      g.crown.debt > 0 ? kv('Already drawn', `${g.crown.debt.toFixed(0)} cruzados`) : null,
      el('p', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: '1.55' } },
        'Not the same thing as the street below. This is an advance against the commission you '
        + 'are already carrying — no premium, no date, and it comes straight off what the '
        + 'Casa pays you when the voyage is reckoned. It is small, it is only ever as large as '
        + 'the commission, and it is gone the moment that is discharged. The houses lend against '
        + 'you, which is why they can lend so much more.'),
    ));

    right.append(card('Your name on this street',
      ...HOUSES.map((h) => el('div', { style: { marginBottom: '5px' } },
        kv(h.short, creditWord(g.finance.credit[h.id]),
          g.finance.credit[h.id] < h.floor ? 'bad' : ''))),
      el('p', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '8px' } },
        `Borrowed in a career: ${Math.round(g.finance.borrowed)}. Repaid: `
        + `${Math.round(g.finance.repaid)}. Taken by sharers: ${Math.round(g.finance.sharedOut)}.`
        + (g.finance.defaults > 0 ? ` Bad debts against your name: ${g.finance.defaults}.` : '')),
    ));

    // And the offers. One card per house that has a man in this town.
    const here = HOUSES.filter((h) => g.houseReaches(h, def));
    if (here.length === 0) {
      left.append(card('No money in this town',
        el('p', {}, 'The Rua Nova reaches a long way and it does not reach here. Whatever you are '
          + 'going to do next, you are going to do it on what is in the ship.')));
    } else {
      left.append(el('p', { class: 'quote', style: { marginBottom: '14px' } },
        'A sea loan is insurance with a loan’s face on it: it costs three times what an '
        + 'ordinary bill costs, and if she never comes home nobody ever asks you for it. A letra '
        + 'is cheap and is owed by you whatever happens to her. Sixteenths are never repaid at '
        + 'all — they simply take their share of everything you land, for as long as the '
        + 'voyage runs.'));
      for (const h of here) left.append(this.houseCard(g, h));
    }

    host.append(el('div', { class: 'cols two' }, left, right));
  }

  private houseCard(g: Game, h: House): HTMLElement {
    const credit = g.finance.credit[h.id];
    const body: (Node | null)[] = [
      el('p', { class: 'flavour' }, h.blurb),
      el('p', { style: { fontSize: '13px' } }, standingLine(h, credit)),
    ];

    // A house that will not deal at all says so once. Listing its instruments
    // underneath and repeating the same refusal against each of them read as a
    // bug: the same sentence three times in one card.
    if (credit < h.floor) return card(h.name, ...body);

    for (const kind of h.writes) {
      const t = g.termsFor(h, kind as DebtKind);
      if (kind === 'quinhao') {
        const held = g.finance.live.reduce((s, d) => s + d.sixteenths, 0);
        const offers = [2, 4, 6].filter((n) => n + held <= 12);
        body.push(el('div', { style: { marginTop: '10px' } },
          kv(kindName('quinhao'), t.barred ? '—' : 'no repayment, ever'),
          el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: '1.5' } },
            t.barred ?? kindBlurb('quinhao')),
          t.barred ? null : el('div', { class: 'row', style: { marginTop: '5px' } },
            ...offers.map((n) => button(
              `Sell ${n}/16 for ${quinhaoAsk(g, h, n)}`,
              () => { this.notice = { text: g.sellSixteenths(h.id, n) }; this.render(); },
            )),
          ),
        ));
        continue;
      }
      const sums = [0.25, 0.5, 1].map((f) => Math.round(t.max * f)).filter((x) => x >= 25);
      body.push(el('div', { style: { marginTop: '10px' } },
        kv(kindName(kind as DebtKind),
          t.barred ? '—' : `${(t.rate * 100).toFixed(0)}% over ${t.days} days`),
        el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: '1.5' } },
          t.barred ?? kindBlurb(kind as DebtKind)),
        t.barred ? null : el('div', { class: 'row', style: { marginTop: '5px' } },
          ...sums.map((sum) => button(
            `${sum} → repay ${Math.round(sum * (1 + t.rate))}`,
            () => { this.notice = { text: g.borrow(h.id, kind as DebtKind, sum) }; this.render(); },
          )),
        ),
      ));
    }

    return card(h.name, ...body);
  }

  /**
   * The station.
   *
   * Two completely different screens under one tab, because they are two
   * completely different moments: the one where you are deciding whether to
   * leave a man of yours on this beach for years, and the one where you are
   * standing in his store reading his books. The first wants the price said
   * plainly. The second wants the shed, the chest and the trouble in that
   * order, because that is the order a captain would ask about them.
   */
  private renderStation(host: HTMLElement, g: Game): void {
    const def = g.portHere!;
    const f = g.factoryHere;
    const left = el('div', {});
    const right = el('div', {});

    if (!f) {
      const why = g.canFoundFactory(def);
      const spare = g.crew.count - g.ship.baseHull.crewMin;
      const men = g.crew.officers.filter((o) => o.alive && !o.ashoreAt);
      left.append(card('Ground for a factory',
        el('p', { class: 'flavour' },
          'A walled shed, a clerk, six men and an agreement with whoever owns the beach. It is '
          + 'not a colony and it is not a conquest; it is a man of yours who is here all year '
          + 'buying at the price a resident pays, so that when you come back the cargo is '
          + 'already on the floor.'),
        kv('It will cost', `${g.foundingCost()} cruzados and six men`),
        kv('Men she can spare', `${Math.max(0, spare)}`, spare < 6 ? 'bad' : ''),
        why ? el('p', { class: 'notice grave' }, why) : null,
      ));

      if (!why) {
        left.append(card('Who is to have it',
          el('p', { style: { fontSize: '13px' } },
            'He comes off the muster and out of his berth for years, and she will work worse '
            + 'without him from the moment the boat pulls back. What he is decides what the '
            + 'station is: an able man fills the shed, a loyal one hands you the books, and '
            + 'those are not the same virtue.'),
          ...men.map((o) => el('div', {
            style: {
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: '10px', padding: '6px 0',
            },
          },
            el('div', {},
              el('div', {}, `${o.name} — ${officerTitle(o).toLowerCase()}`),
              el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)' } },
                `Ability ${(o.ability * 100).toFixed(0)} · ${loyaltyWord(o.loyalty)}`
                + (o.bonded ? ' · bonded to you' : '')),
            ),
            button('Leave him here', () => {
              this.notice = { text: g.foundFactory(o.id, this.stationOrder) };
              this.tab = 'station';
              this.render();
            }, { primary: true }),
          )),
          men.length === 0 ? el('p', { class: 'bad' }, 'There is nobody aft to leave.') : null,
        ));

        right.append(this.orderCard(g, def, null));
      }

      host.append(el('div', { class: 'cols two' }, left, right));
      return;
    }

    // And the station as it stands.
    const wanted = g.garrisonWantedAt(f);
    left.append(card(`${f.factor}’s store`,
      kv('In the shed', `${stockTons(f).toFixed(1)} of ${capacityOf(f).toFixed(0)} tons`
        + `, ${g.shedRoom(f).toFixed(1)} free`),
      kv('Worth at Lisbon', `${stockValue(f)} cruzados`),
      kv('In the chest', `${Math.round(f.chest)} cruzados`, f.chest < 40 ? 'bad' : ''),
      kv('Men in it', `${f.garrison} of ${wanted} the works want`, f.garrison < wanted ? 'bad' : ''),
      kv('The town', regardWordF(f.regard)),
      kv('How it stands', troubleWord(f.trouble),
        f.trouble > 0.55 ? 'bad' : f.trouble > 0.32 ? 'warn' : ''),
      f.chest < 40
        ? el('p', { class: 'notice' },
            'He has nothing to buy with. A factor with an empty chest is a man sitting in a shed '
            + 'for a year watching the trade go past him.')
        : null,
      f.trouble > 0.55
        ? el('p', { class: 'notice grave' },
            'This will not survive another long absence. A ship in the road, a present to the '
            + 'town, or men and walls — one of the three, and soon.')
        : null,
    ));

    // The reward, and the reason the whole thing exists.
    const stock = Object.entries(f.stock).filter(([, q]) => q >= 1);
    left.append(card('Take it aboard',
      stock.length === 0
        ? el('p', {}, 'The shed is empty. Whatever he has been doing, it has not been buying.')
        : el('div', {}, ...stock.map(([id, q]) => {
            const gd = good(id);
            const per = (f.paid[id] ?? gd.lisbon * 0.2) * 1.08;
            const fits = Math.floor(Math.min(q, g.ship.holdFree / Math.max(gd.bulk, 1e-6)));
            return el('div', {
              style: {
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: '10px', padding: '6px 0',
              },
            },
              el('div', {},
                el('div', {}, `${gd.name} — ${q.toFixed(0)} ${unitOf(gd, q)}`),
                el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)' } },
                  `${per.toFixed(1)} the ${gd.unit} with his commission, against ${gd.lisbon} at Lisbon`),
              ),
              button(fits >= 1 ? `Take ${fits}` : 'No room', () => {
                this.notice = { text: g.loadFromShed(id, fits) };
                this.render();
              }, { disabled: fits < 1, primary: fits >= 1 }),
            );
          })),
      el('p', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '8px' } },
        'Bought in small parcels all year at what a resident pays, and it does not glut the quay '
        + 'on the way into your hold, because it was bought a barrel at a time by somebody who '
        + 'lives here.'),
    ));

    right.append(this.orderCard(g, def, f));

    right.append(card('The chest',
      el('div', { class: 'row' },
        ...[100, 250, 600].map((n) => button(`Put in ${n}`, () => {
          this.notice = { text: g.fundChest(n) };
          this.render();
        }, { disabled: g.crown.gold + g.creditFree < n })),
      ),
      el('div', { class: 'row', style: { marginTop: '6px' } },
        button(`Draw out ${Math.floor(f.chest)}`, () => {
          this.notice = { text: g.drawChest() };
          this.render();
        }, { disabled: f.chest < 1 }),
      ),
      el('p', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '7px' } },
        'What is in the chest is what he can buy with, and what he buys with it is what is '
        + 'waiting for you next time. Emptying it is taking your profit now instead of next year.'),
    ));

    right.append(card('Build',
      ...WORKS.map((w) => {
        const has = f.works.includes(w.id);
        return el('div', { style: { padding: '6px 0' } },
          el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } },
            el('span', {}, `${w.name} — ${w.english.toLowerCase()}`),
            has
              ? el('em', { style: { color: 'var(--ink-soft)', fontSize: '12.5px' } }, 'built')
              : button(`${w.cost}${w.hands > 0 ? ` \u00b7 ${w.hands} ${plural(w.hands, 'man', 'men')}` : ''}`, () => {
                  this.notice = { text: g.buildWork(w.id) };
                  this.render();
                }, { disabled: g.crown.gold + g.creditFree < w.cost }),
          ),
          el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: '1.5' } },
            w.blurb),
        );
      }),
    ));

    right.append(card('The garrison',
      el('div', { class: 'row' },
        ...[2, 5, 10].map((n) => button(`Leave ${n} more`, () => {
          this.notice = { text: g.reinforceFactory(n) };
          this.render();
        }, { disabled: g.crew.count - g.ship.baseHull.crewMin < n })),
        button('Shut it up and bring them away', () => {
          this.notice = {
            text: g.closeFactory(f, 'Given up while there was still something in it to bring away.'),
            grave: true,
          };
          this.tab = 'town';
          this.render();
        }),
      ),
    ));

    host.append(el('div', { class: 'cols two' }, left, right));
  }

  /** What the factor is to buy while you are elsewhere. */
  private orderCard(g: Game, def: PortDef, f: Feitoria | null): HTMLElement {
    const options = buyable(def);
    const current: string[] = f ? f.buying : this.stationOrder;
    return card('Standing orders',
      el('p', { style: { fontSize: '13px' } },
        'What he is to buy, in preference. A town can only put so much trade through one man in '
        + 'a year whatever it is worth by weight, so the value he accumulates is much the same '
        + 'either way \u2014 what changes is how much of your hold it takes to carry it home. '
        + 'Leave it empty and he buys whatever the place offers and fills the shed; name the '
        + 'dearest thing here and the same money comes aboard in a corner of the hold, with the '
        + 'rest of her free for something else.'),
      ...options.map((id) => {
        const gd = good(id);
        const on = current.includes(id);
        return el('div', {
          style: {
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: '10px', padding: '4px 0',
          },
        },
          el('div', {},
            el('span', {}, gd.name),
            el('span', { style: { fontSize: '12.5px', color: 'var(--ink-soft)' } },
              ` — about ${residentPrice(id, def).toFixed(1)} here, ${gd.lisbon} at Lisbon`),
          ),
          button(on ? 'Ordered' : 'Order', () => {
            const next = on ? current.filter((x) => x !== id) : [...current, id].slice(0, 3);
            if (f) this.notice = { text: g.setStandingOrder(next) };
            else this.stationOrder = next;
            this.render();
          }, { primary: on }),
        );
      }),
      options.length === 0
        ? el('p', {}, 'This place produces nothing anybody has a name for.')
        : null,
    );
  }

  private renderStores(host: HTMLElement, g: Game): void {
    const def = g.portHere!;
    const options = [30, 60, 90, 150, 240];

    const left = el('div', {});
    left.append(card('Water and victuals',
      el('p', {}, def.refit > 0.6
        ? 'There is good water here, and a market for stock and greens.'
        : def.refit > 0.3
          ? 'Water can be had, though it is a labour to get it aboard, and there is not much else.'
          : 'Little enough to be had here. Take what you can and do not count on it.'),
      ...options.map((d) => {
        const cost = provisioningCost(def, d, g.crew.count);
        return el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' } },
          el('span', {}, `${d} days for ${g.crew.count} men`),
          button(`${cost} cruzados`, () => {
            // Draw on the Casa if the purse is short, exactly as the market
            // does. Water and victuals were the one thing a captain could
            // always get on the Crown's account, and refusing him credit here
            // while extending it for a cargo of pepper had it precisely the
            // wrong way round — a man who had spent his purse could buy trade
            // goods and could not buy the water to carry them anywhere.
            if (g.crown.gold < cost) g.drawCredit(cost);
            if (g.crown.gold < cost) {
              this.notice = {
                text: 'Not enough in the purse, and nothing left to draw on. '
                  + 'Sell something out of the hold.',
                grave: true,
              };
              this.render();
              return;
            }
            g.provision(d, cost);
            g.clock.t += 86400 * clamp(d / 90, 0.5, 3);
            this.notice = { text: `Watered and victualled for ${d} days.` };
            this.render();
          }, { disabled: g.crown.gold + g.creditFree < cost }),
        );
      }),
    ));

    const right = el('div', {});
    right.append(card('Why it matters',
      el('p', { class: 'quote' },
        'Water is the hard limit on every passage, and fresh food is the only thing standing between your company and the scurvy. Vasco da Gama went ninety-three days from the Cape Verde islands to the coast of Africa without sighting land, and by the time he reached India and came home again he had buried a hundred men out of a hundred and seventy, and burned one of his three ships because he had not enough left alive to sail her.'),
      kv('Water aboard', `${g.crew.provisions.water.toFixed(0)} days`),
      kv('Fresh provisions', `${g.crew.provisions.fresh.toFixed(0)} days`),
      kv('Days since fresh food', `${g.crew.daysWithoutFresh.toFixed(0)}`),
    ));

    host.append(el('div', { class: 'cols two' }, left, right));
  }

  private renderYard(host: HTMLElement, g: Game): void {
    const def = g.portHere!;
    if (def.refit < 0.5) {
      host.append(el('div', { class: 'notice grave' },
        'There is no yard here worth the name. You can careen on the beach if you must, and nothing more.'));
    }

    const left = el('div', {});
    const repairCost = Math.ceil((1 - g.ship.condition.hull) * 900 / clamp(def.refit, 0.15, 1));
    left.append(card('Repairs',
      kv('Hull', `${(g.ship.condition.hull * 100).toFixed(0)}%`),
      kv('Fouling', `${(g.ship.condition.fouling * 100).toFixed(0)}%`),
      g.ship.condition.hull < 0.99
        ? el('div', { style: { marginTop: '10px' } },
            button(`Make her sound — ${repairCost} cruzados`, () => {
              if (g.crown.gold < repairCost) { this.notice = { text: 'Not enough in the purse.', grave: true }; this.render(); return; }
              g.crown.gold -= repairCost;
              g.ship.repair(1);
              for (const s of g.ship.state.sails) s.condition = 1;
              g.clock.t += 86400 * 8;
              g.logEvent('note', 'Hauled out, seams caulked, and new canvas bent. She is as good as she was.');
              this.notice = { text: 'She is sound again.' };
              this.render();
            }, { primary: true, disabled: g.crown.gold < repairCost }))
        : el('p', {}, 'She wants nothing.'),
    ));

    const upgrades = availableUpgrades(g.ship.upgrades, g.ship.hullId, g.crown.lifetimeStanding);
    const right = el('div', {});
    right.append(card('Work the yard will undertake',
      upgrades.length === 0
        ? el('p', {}, 'Nothing they can do for you that has not been done.')
        : el('ul', { class: 'list' }, ...upgrades.map((u) => el('li', {},
            el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline' } },
              el('span', {}, u.english, el('span', { style: { color: 'var(--ink-soft)', fontSize: '12px' } }, ` — ${u.name}`)),
              button(`${u.cost} cr · ${u.days}d`, () => this.fitUpgrade(g, u.id), {
                disabled: g.crown.gold < u.cost || def.refit < 0.4,
              }),
            ),
            el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '4px', lineHeight: '1.55' } }, u.blurb),
          ))),
    ));

    // A larger ship, once the Crown thinks you are worth one.
    const hulls = g.crown.availableHulls().filter((h) => h.id !== g.ship.hullId);
    if (def.id === 'lisboa' && hulls.length > 0) {
      const tradeIn = g.tradeInValue();
      const tons = g.ship.cargoTons;
      right.append(card('Ships lying in the river',
        el('p', { class: 'quote' },
          `The yard will allow ${tradeIn} cruzados against the ${hullClass(g.ship.hullId).name} `
          + 'and everything fitted into her. What is bolted to this hull stays with it — you are '
          + 'buying a ship, not moving one.'),
        el('ul', { class: 'list' }, ...hulls.map((h) => {
          const price = Math.max(0, h.cost - tradeIn);
          const tooFull = tons > h.hold + 0.001;
          return el('li', {},
            el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline' } },
              el('span', {}, `${h.name} — ${h.tons} tonéis, ${h.hold}t hold`),
              button(price > 0 ? `${price} cruzados` : 'no more to pay', () => this.buyShip(g, h.id), {
                disabled: g.crown.gold + g.creditFree < price || tooFull,
                title: tooFull
                  ? `She has ${tons.toFixed(1)} tons in her and this one holds ${h.hold}.`
                  : `${h.cost} less ${tradeIn} allowed for the old ship`,
              }),
            ),
            el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '4px', lineHeight: '1.55' } }, h.blurb),
            tooFull
              ? el('div', { style: { fontSize: '12.5px', color: 'var(--warn)', marginTop: '3px' } },
                  `Your hold has ${tons.toFixed(1)} tons in it and hers holds ${h.hold}. Sell down first.`)
              : null,
          );
        })),
      ));
    }

    // Instruments.
    right.append(this.instrumentCard(g));

    host.append(el('div', { class: 'cols two' }, left, right));
  }

  private instrumentCard(g: Game): HTMLElement {
    const rows: Node[] = [];
    const standing = g.crown.lifetimeStanding;

    const section = (label: string, items: { id: string; name: string; cost: number; standing: number; blurb: string }[], current: string, apply: (id: string) => void, note?: Node | null) => {
      rows.push(el('div', { style: { fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginTop: '11px', marginBottom: '5px' } }, label));
      if (note) rows.push(note);
      for (const it of items) {
        const owned = current === it.id;
        const locked = it.standing > standing;
        rows.push(el('div', { style: { padding: '5px 0', opacity: locked ? '0.45' : '1' } },
          el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline' } },
            el('span', {}, it.name),
            owned ? el('span', { class: 'tag good' }, 'aboard')
              : button(locked ? `needs ${it.standing} renown` : `${it.cost} cr`, () => {
                  if (g.crown.gold < it.cost) { this.notice = { text: 'Not enough in the purse.', grave: true }; this.render(); return; }
                  g.crown.gold -= it.cost;
                  apply(it.id);
                  this.notice = { text: `${it.name} taken aboard.` };
                  this.render();
                }, { disabled: locked || g.crown.gold < it.cost }),
          ),
          el('div', { style: { fontSize: '12px', color: 'var(--ink-soft)', marginTop: '3px', lineHeight: '1.5' } }, it.blurb),
        ));
      }
    };

    section('For altitudes', ALTITUDE_INSTRUMENTS, g.nav.kit.altitude, (id) => { g.nav.kit.altitude = id; });
    // Why there are two kinds of book, said at the counter.
    //
    // A rule for the pole star and a table of solar declination are different
    // things and were different books, and a captain who does not know that
    // sails south with the wrong one — the pole star sets astern of him at the
    // line and he loses his latitude altogether, which is the single worst
    // thing that can happen to a voyage in this game.
    section('Tables', ALMANACS, g.nav.kit.almanac, (id) => { g.nav.kit.almanac = id; },
      el('p', {
        class: g.nav.almanac.solarError === null ? 'notice' : '',
        style: { fontSize: '12.5px', lineHeight: '1.55', marginBottom: '7px' },
      },
      g.nav.almanac.solarError === null
        ? 'You carry a rule for the pole star and no table of the sun, so a meridian '
          + 'altitude is only a number to you. That is enough while the pole star is up — '
          + 'but it sets astern of you at the equator and does not come back, and south of '
          + 'the line a ship without solar tables has no latitude at all.'
        : g.nav.almanac.southern
          ? 'Your tables give you the sun as well as the pole star, north of the line and '
            + 'south of it.'
          : 'Your tables give you the sun, but they stop at the equator. South of the line '
            + 'they are no more use than the pole star is.'));
    section('For the log', SPEED_INSTRUMENTS, g.nav.kit.speed, (id) => { g.nav.kit.speed = id; });
    section('Compasses', COMPASSES.map((c) => ({ ...c, standing: 0 })), g.nav.kit.compass, (id) => { g.nav.kit.compass = id; });

    return card('Instruments', ...rows);
  }

  private fitUpgrade(g: Game, id: string): void {
    const u = UPGRADE_BY_ID.get(id)!;
    if (g.crown.gold < u.cost) { this.notice = { text: 'Not enough in the purse.', grave: true }; this.render(); return; }
    g.crown.gold -= u.cost;
    if (id === 'breame') {
      g.ship.condition.fouling = 0;
    } else {
      g.ship.upgrades.push(id);
    }
    // Pillars are consumed. Fitting them again re-stocks the hold, which is what
    // a captain came back to Lisbon for between voyages.
    if (id === 'padroes') g.crown.padraoStock += 6;
    g.ship.applyRigConversion();
    g.ship.refreshDerived();
    g.waitDays(u.days);
    g.logEvent('note', `${u.name} — ${u.days} days in the yard, ${u.cost} cruzados.`);
    this.notice = { text: `${u.name} done. ${u.blurb}` };
    this.render();
  }

  private buyShip(g: Game, hullId: string): void {
    const refused = g.shiftFlag(hullId);
    if (refused) { this.notice = { text: refused, grave: true }; this.render(); return; }
    this.notice = { text: `She is yours. ${hullClass(hullId).blurb}` };
    this.render();
  }

  private renderHands(host: HTMLElement, g: Game): void {
    const def = g.portHere!;
    const pe = people(def.people);

    const left = el('div', {});
    const shortfall = g.crew.complement - g.crew.count;
    const wage = g.handWage();
    const cost = shortfall * wage;
    const known = g.hands.filter((h) => h.alive && h.aboard).length;
    left.append(card('Hands',
      kv('Aboard', `${g.crew.count} of ${g.crew.complement}`),
      kv('Wage here', `${wage} cruzados a man`),
      shortfall > 0
        ? el('div', { style: { marginTop: '10px' } },
            el('p', {}, def.people === 'portuguese'
              ? 'There are men on the quay who will ship for the Guinea voyage, and a few who know what that means and want more.'
              : 'A few men can be found here who will take service, though how they will fare in a Portuguese ship is anyone\'s guess.'),
            known < 8
              ? el('p', { class: 'quote' },
                  'Some of them will have to be come to know, there being fewer names forward '
                  + 'than there were when she sailed.')
              : el('span', {}),
            button(`Ship ${shortfall} hands — ${cost} cruzados`, () => {
              const r = g.shipHands(shortfall);
              this.notice = { text: r.message, grave: !r.ok };
              this.render();
            }, { primary: true, disabled: g.crown.gold < cost }))
        : el('p', {}, 'She is fully manned.'),
    ));

    // The men forward the captain actually knows. Not the whole company — a
    // captain did not know every hand on a nau by name and this should not
    // pretend he did — but these are the ones who get named when somebody dies
    // and the ones who decide, between them, whether there is a mutiny.
    const fo = g.hands.filter((h) => h.alive && h.aboard);
    if (fo.length > 0) {
      left.append(card('The fo’c’sle',
        el('p', { class: 'quote' },
          'The men you know by name. There are others.'),
        ...fo.map((h) => el('div', { style: { marginBottom: '8px' } },
          el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } },
            el('span', {}, `${h.name} — ${RATING_LABEL[h.rating].english.toLowerCase()}, of ${h.from}`),
            el('span', {
              style: {
                fontSize: '12.5px',
                color: h.regard < 0.3 ? 'var(--red)' : h.regard > 0.7 ? 'var(--green)' : 'var(--ink-soft)',
              },
            }, handRegardWord(h.regard)),
          ),
          el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: '1.5' } },
            TEMPER[h.temper].line),
          (h.memory?.length ?? 0) > 0
            ? el('div', { style: { fontSize: '12px', color: 'var(--ink-faint)', fontStyle: 'italic', marginTop: '2px' } },
                h.memory![0])
            : null,
        )),
      ));
    }

    const lost = g.hands.filter((h) => !h.alive);
    if (lost.length > 0) {
      left.append(card('Not coming home',
        el('ul', { class: 'list' }, ...lost.map((h) => el('li', {},
          el('div', {}, `${h.name}, of ${h.from}`),
          el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)' } }, h.fate ?? 'Lost.'),
        ))),
      ));
    }

    // Who you already have, and what they are. A captain knows his own officers.
    const aboard = g.crew.officers.filter((o) => o.alive && !o.ashoreAt);
    left.append(card('Your officers',
      ...aboard.map((o) => {
        // A written man is described by what was written for him. Falling back
        // to the trait blurb put the same sentence under two different officers
        // — Gaspar and Sintra are both curious men, and the wardroom read as
        // though somebody had pasted the line twice.
        const arc = o.arc ? ARC_BY_ID.get(o.arc) : undefined;
        const line = arc?.hook ?? traitDef(o.trait)?.blurb;
        return el('div', { style: { marginBottom: '9px' } },
          el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } },
            el('span', {}, `${o.name} — ${officerTitle(o).toLowerCase()}`),
            el('span', { style: { color: 'var(--ink-soft)', fontSize: '12.5px' } }, loyaltyWord(o.loyalty)),
          ),
          line
            ? el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: '1.5' } }, line)
            : null,
        );
      }),
      el('div', { style: { marginTop: '8px' } },
        button('Pay the wardroom a month\u2019s wages', () => {
          const owed = aboard.reduce((sum, o) => sum + o.wage, 0);
          if (g.crown.gold < owed) {
            this.notice = { text: 'Not enough in the purse. They will remember it.', grave: true };
            for (const o of aboard) o.loyalty = clamp(o.loyalty - 0.06, 0, 1);
            this.render();
            return;
          }
          g.crown.gold -= owed;
          for (const o of aboard) o.loyalty = clamp(o.loyalty + 0.07, 0, 1);
          g.logEvent('crew', `Paid the officers ${owed} cruzados at ${def.name}, in coin, on the table.`);
          this.notice = { text: `${owed} cruzados paid out. Money on the table aft is worth more than a speech.` };
          this.render();
        }, { disabled: aboard.length === 0 }),
      ),
    ));

    const right = el('div', {});

    // Berths standing empty.
    //
    // There is no list of officers for sale here any more. The company is the
    // one she sailed with out of the Tagus, and when one of them is gone the
    // berth is simply empty — which is worth saying plainly, because the ship
    // then works slightly worse in a way the captain ought to be able to
    // account for.
    // The one berth that can still be filled off a quay. See Game.linguaOffer:
    // nobody carried a fixed interpreter down that coast, they picked men up,
    // and a captain who cannot do that is reduced to shouting at strangers.
    right.append(this.linguaCard(g, def));

    const empty = OFFICER_ROLES.filter(
      (r) => r.role !== 'lingua' && r.role !== 'degredado'
        && !g.crew.officers.some((o) => o.alive && o.role === r.role));
    if (empty.length > 0) {
      right.append(card('Berths standing empty',
        el('p', { class: 'quote' },
          'These men were not engaged off a list and cannot be replaced off one. What they knew '
          + 'has gone with them.'),
        el('ul', { class: 'list' }, ...empty.map((r) => el('li', {},
          el('div', {}, `${r.english} \u2014 ${r.title}`),
          el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '4px', lineHeight: '1.55' } },
            r.blurb),
        ))),
      ));
    }

    this.renderInland(right, g, def);

    if (g.crew.officers.some((o) => o.role === 'degredado' && o.alive && !o.ashoreAt) && def.people !== 'portuguese') {
      right.append(card('Put a man ashore',
        el('p', { class: 'quote' },
          'The practice was to land a condemned man among strangers and come back for him. If he lived he had the language and his pardon; if not, the Crown had lost nothing it valued. Several of the men who made the Portuguese empire possible began as convicts left on a beach.'),
        button('Land the degredado here', () => {
          const d = g.crew.officers.find((o) => o.role === 'degredado' && o.alive && !o.ashoreAt)!;
          d.ashoreAt = def.id;
          d.ashoreSince = g.clock.t;
          g.logEvent('contact', `Put ${d.name} ashore at ${def.name} to learn the tongue. He was told he would be collected. He did not appear to believe it.`, true);
          this.notice = { text: `${d.name} is ashore. Return in a year and he may be worth a great deal.` };
          this.render();
        }),
      ));
    }

    // A written officer's return is a scene of its own — he comes off in a canoe
    // as you stand in — so he is not collected off a list here.
    const returning = g.crew.officers.filter(
      (o) => o.ashoreAt === def.id && o.alive && !o.arc
        && o.ashoreSince !== undefined && g.clock.t - o.ashoreSince > 300 * 86400,
    );
    for (const o of returning) {
      right.append(el('div', { class: 'notice' },
        `${o.name} is on the beach, thinner and browner and speaking ${pe.language}. `,
        button('Take him back aboard', () => {
          o.ashoreAt = undefined;
          if (!o.languages.includes(pe.language)) o.languages.push(pe.language);
          o.role = 'lingua';
          o.ability = clamp(o.ability + 0.25, 0, 0.95);
          g.logEvent('contact', `${o.name} came off in a canoe, having lived a year among the people of ${def.name}. He has their language, and a good deal else besides.`, true);
          this.notice = { text: `${o.name} is aboard again, and is now your interpreter.` };
          this.render();
        })));
    }

    host.append(el('div', { class: 'cols two' }, left, right));
  }

  /** Interpreters: the ones aboard, and the one this quay can supply. */
  private linguaCard(g: Game, def: PortDef): HTMLElement {
    const aboard = g.linguas();
    const offer = g.linguaOffer(def);
    const langs = g.linguaLanguagesAt(def);
    const portuguese = def.people === 'portuguese';

    return card('Línguas',
      el('p', { class: 'quote' },
        'An audience with a people whose tongue nobody aboard has is conducted in signs, and '
        + 'goes about as well as that sounds. An interpreter is the difference between being '
        + 'received and being tolerated.'),
      aboard.length > 0
        ? el('div', { style: { marginBottom: '10px' } },
            ...aboard.map((o) => kv(o.name,
              `${o.languages.join(', ')} · ${(o.ability * 100).toFixed(0)} · ${loyaltyWord(o.loyalty)}`)))
        : el('p', { style: { fontSize: '13px' } },
            'Nobody aboard speaks anything but Portuguese.'),

      portuguese
        ? (langs.length > 0
            ? el('div', {},
                el('p', { style: { fontSize: '13px' } },
                  'There are men on this waterfront who were brought home off that coast and have '
                  + 'been here long enough to be useful in both directions.'),
                el('div', { class: 'row', style: { flexWrap: 'wrap' } },
                  ...langs.slice(0, 5).map((lang) => button(
                    `${lang} — ${offer.cost}`,
                    () => { this.notice = { text: g.engageLingua(def, lang) }; this.render(); },
                    { disabled: g.crown.gold + g.creditFree < offer.cost },
                  )),
                ),
              )
            : el('p', { style: { fontSize: '13px', color: 'var(--ink-soft)' } },
                'Nobody here has a tongue you have any use for yet. Go and meet somebody, and '
                + 'there will be a man on this quay who can talk to them.'))
        : offer.can
          ? el('p', { class: 'notice' }, offer.can)
          : el('div', {},
              el('p', { style: { fontSize: '13px' } },
                `A man of this place will take service and has ${offer.language}. What else he is `
                + 'will be found out in front of somebody who matters.'),
              el('div', { class: 'row' },
                button(`Engage him — ${offer.cost} cruzados`, () => {
                  this.notice = { text: g.engageLingua(def, offer.language) };
                  this.render();
                }, { primary: true }),
              ),
            ),
    );
  }

  /**
   * The one thing in this game you can do that is not on the water.
   *
   * Two cards, and the second is the more important of them: the men who are
   * already out there. A captain who sent somebody up a river in 1484 and has
   * been at sea since needs to be told, every time he makes a port on this
   * coast, that there is a man of his inland and roughly how long he has been
   * there — otherwise the three years are not felt, they are merely elapsed.
   */
  private renderInland(right: HTMLElement, g: Game, def: PortDef): void {
    const out = outstanding(g);
    if (out.length > 0) {
      right.append(card('Men inland',
        ...out.map((j) => el('p', {}, journeyWord(g, j))),
      ));
    }

    const errands = errandsAt(def);
    const men = candidates(g);
    if (errands.length === 0 || men.length === 0) return;

    const chosen = this.inlandMan && men.some((m) => m.id === this.inlandMan)
      ? men.find((m) => m.id === this.inlandMan)!
      : men[0];
    const backing = backingFor(g, def, chosen);

    right.append(card('Send a man inland',
      el('p', { class: 'quote' },
        'The Crown did this for sixty years and it was never once a small thing. A man walks '
        + 'away from the coast with a letter and a bag of goods, and either he comes back with '
        + 'something nobody in Europe knows, or he does not come back. Pêro da Covilhã went out '
        + 'in 1487, reached Calicut, sent word that the ocean was open, and was never allowed '
        + 'home.'),
      el('div', { class: 'hud-row', style: { marginBottom: '8px' } },
        el('span', { class: 'k' }, 'Who goes'),
        el('span', { class: 'v' },
          ...men.map((m) => button(m.name, () => {
            this.inlandMan = m.id;
            this.render();
          }, { primary: m.id === chosen.id }))),
      ),
      kv('His chances', backing > 0.6 ? 'Good — he has the tongue and they know you here'
        : backing > 0.38 ? 'Fair. He will be passed from hand to hand and it will be slow.'
          : 'Poor. He has no language and no friends on this coast.'),
      el('p', { style: { fontSize: '13px', fontStyle: 'italic', color: 'var(--ink-soft)' } },
        'Chances turn on his own quality, on whether he speaks their language, and on what '
        + 'they think of you here. Nothing else.'),
      ...errands.map((e) => el('div', {
        style: { marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(90,74,55,0.2)' },
      },
        el('div', { style: { fontSize: '15px', marginBottom: '5px' } }, e.name),
        el('p', { class: 'quote' }, e.brief),
        el('p', { style: { fontSize: '13px' } }, e.hope),
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '8px' } },
          el('span', { style: { fontSize: '13px', color: 'var(--ink-soft)' } },
            `${outfitCost(e)} cruzados of goods · ${e.years.toFixed(1)} years at best`),
          button(`Send ${chosen.name}`, () => {
            this.notice = { text: g.sendInland(def, chosen.id, e.id) };
            this.inlandMan = null;
            this.render();
          }, { primary: g.crown.gold >= outfitCost(e) }),
        ),
      )),
    ));
  }
}

/** How much of a good the commission in hand requires you to bring home. */
function commissionNeed(g: Game, goodId: string): number {
  const p = g.crown.patent;
  if (!p || p.complete || p.failed) return 0;
  return p.objectives
    .filter((o) => o.kind === 'cargo' && o.target === goodId)
    .reduce((sum, o) => sum + (o.amount ?? 0), 0);
}

/** How much of a good in the hold belongs to a merchant rather than to you. */
function consignedOf(g: Game, goodId: string): number {
  return g.consignedVentures
    .filter((v) => v.loaded && v.goodId === goodId)
    .reduce((sum, v) => sum + v.quantity, 0);
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

function regardWord(r: number): string {
  if (r > 0.6) return 'Warm';
  if (r > 0.25) return 'Friendly';
  if (r > -0.1) return 'Neutral';
  if (r > -0.45) return 'Cool';
  return 'Hostile';
}

function qualityWord(q: number): string {
  if (q > 0.8) return 'Excellent';
  if (q > 0.6) return 'Good';
  if (q > 0.4) return 'Fair';
  if (q > 0.2) return 'Poor';
  return 'Wretched';
}

/** What a house would pay for n sixteenths of the voyage in hand. */
function quinhaoAsk(g: Game, h: House, n: number): number {
  return quinhaoPrice(h, n, g.voyageValue(), g.finance.credit[h.id]);
}
