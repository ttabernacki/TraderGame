import { clamp } from '../core/math';
import { good, unitOf } from '../economy/goods';
import { Markets, provisioningCost, type Listing } from '../economy/market';
import { people } from '../world/peoples';
import { availableUpgrades, UPGRADE_BY_ID } from '../ship/upgrades';
import { hullClass } from '../ship/hull';
import { ALMANACS, ALTITUDE_INSTRUMENTS, COMPASSES, SPEED_INSTRUMENTS } from '../navigation/instruments';
import { OFFICER_ROLES } from '../crew/crew';
import { skill } from '../crew/skills';
import { loyaltyWord, officerTitle, traitDef } from '../progression/officers';
import { RATING_LABEL, TEMPER, regardWord as handRegardWord } from '../crew/hands';
import { ARC_BY_ID } from '../progression/arcs';
import { daysLeft, ventureLine, ventureTons } from '../progression/ventures';
import type { Game } from '../game/state';
import { append, button, card, clear, el, kv } from './dom';

type Tab = 'town' | 'market' | 'freight' | 'stores' | 'yard' | 'hands';

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
      ['stores', 'Stores'],
      ['yard', 'Shipwrights'],
      ['hands', 'Hands'],
    ];
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

    right.append(card('Pass the time',
      el('p', {}, 'Lying at anchor rests the crew, mends their spirits, and lets fresh food do its work — and it also lets the weather change, and the season turn.'),
      el('div', { style: { display: 'flex', gap: '7px', flexWrap: 'wrap' } },
        ...[1, 3, 7, 14, 30].map((d) => button(`${d} ${d === 1 ? 'day' : 'days'}`, () => {
          g.waitDays(d);
          this.notice = { text: `${d} days pass at anchor.` };
          this.render();
        })),
      ),
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
    g.markets.sell(g.portHere!.id, l.goodId, take);
    g.crown.syncCargoObjectives((id) => g.ship.quantityOf(id));

    const profit = revenue - paid * take;
    g.logEvent('trade',
      `Sold ${take.toFixed(0)} ${gd.unit} of ${gd.name.toLowerCase()} at ${got.toFixed(1)}, ${revenue.toFixed(0)} cruzados` +
      (paid > 0 ? `, against ${(paid * take).toFixed(0)} paid — ${profit >= 0 ? 'a gain' : 'a loss'} of ${Math.abs(profit).toFixed(0)}.` : '.'));
    this.notice = {
      text: `Sold for ${revenue.toFixed(0)} cruzados`
        + (paid > 0 ? ` — ${profit >= 0 ? 'profit' : 'loss'} ${Math.abs(profit).toFixed(0)}.` : '.')
        + (edge > 0.01 ? ` Your book was worth ${(edge * 100).toFixed(0)}% of it.` : ''),
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

    const section = (label: string, items: { id: string; name: string; cost: number; standing: number; blurb: string }[], current: string, apply: (id: string) => void) => {
      rows.push(el('div', { style: { fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginTop: '11px', marginBottom: '5px' } }, label));
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
    section('Tables', ALMANACS, g.nav.kit.almanac, (id) => { g.nav.kit.almanac = id; });
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
    const wagePerMan = 6;
    const cost = shortfall * wagePerMan;
    left.append(card('Hands',
      kv('Aboard', `${g.crew.count} of ${g.crew.complement}`),
      shortfall > 0
        ? el('div', { style: { marginTop: '10px' } },
            el('p', {}, def.people === 'portuguese'
              ? 'There are men on the quay who will ship for the Guinea voyage, and a few who know what that means and want more.'
              : 'A few men can be found here who will take service, though how they will fare in a Portuguese ship is anyone\'s guess.'),
            button(`Ship ${shortfall} hands — ${cost} cruzados`, () => {
              if (g.crown.gold < cost) { this.notice = { text: 'Not enough in the purse.', grave: true }; this.render(); return; }
              g.crown.gold -= cost;
              g.crew.count = g.crew.complement;
              g.logEvent('crew', `Shipped ${shortfall} hands at ${def.name}.`);
              this.notice = { text: 'The muster is full again.' };
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
