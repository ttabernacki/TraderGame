import { characterOf } from '../world/portCharacter';
import { clamp } from '../core/math';
import { good, unitOf } from '../economy/goods';
import { provisioningCost } from '../economy/market';
import {
  ANTWERP, ANTWERP_DAYS, CASA_SHARE, CHEST_TONS, COMPETITION, MONOPOLY, REGION_NAME, antwerpBid, fairsAt, gradeWord,
  paymentAt,
} from '../economy/trade';
import { formatDateAt } from '../core/clock';
import { people } from '../world/peoples';
import type { PortDef } from '../world/ports';
import {
  SYSTEMS, UPGRADES, UPGRADE_BY_ID, describeEffects, nodeStatus, systemNodes, tierCap, yardLevel, type Upgrade,
} from '../ship/upgrades';
import { hullClass } from '../ship/hull';
import { ALMANACS, ALTITUDE_INSTRUMENTS, COMPASSES, SPEED_INSTRUMENTS } from '../navigation/instruments';
import { OFFICER_ROLES } from '../crew/crew';
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
import type { Game, TradeListing } from '../game/state';
import { append, button, card, clear, el, kv, plural } from './dom';

type Tab = 'town' | 'market' | 'freight' | 'money' | 'station' | 'fit';

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
  private marketMode: 'scales' | 'barter' = 'scales';
  private barterGive = new Map<string, number>();
  private barterTake = new Map<string, number>();
  private barterCoin = 0;
  /** How his face reads this time, which changes each time you put it to him. */
  private faceNoise = 0;
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
    // The story waits for the port screen: the King's summons at the start of
    // a career, and whatever is due on arrival.
    g.checkStory();
    this.tab = 'town';
    this.notice = null;
    this.quantities.clear();
    this.barterGive.clear(); this.barterTake.clear(); this.barterCoin = 0;
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
      button('Weigh anchor  (Space)', () => {
        const why = g.cannotWeigh();
        if (why) { this.notice = { text: why, grave: true }; this.render(); return; }
        g.weighAnchor(); this.onClose();
      },
        { primary: def.people === 'portuguese' || rel.mayTrade }),
    );

    clear(this.body);
    const tabs: [Tab, string][] = [
      ['town', 'Town'],
      ['market', 'Market'],
      ['freight', g.ventureOffers.length > 0 ? `Freight (${g.ventureOffers.length})` : 'Freight'],
      ['money', g.finance.owedTo() > 0 ? `Backers (${g.finance.owedTo().toFixed(0)} owed)` : 'Backers'],
      // Stores, the yard and the hiring were three tabs for one errand: getting
      // her ready for sea. They are one page now, in the order it is done.
      ['fit', 'Fitting out'],
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
      case 'fit': {
        const part = (title: string, fill: (h: HTMLElement) => void) => {
          const h = el('div', {});
          fill(h);
          inner.append(el('h2', { class: 'fit-head' }, title), h);
        };
        part('Stores', (h) => this.renderStores(h, g));
        part('The company', (h) => this.renderHands(h, g));
        part('Shipwrights', (h) => this.renderYard(h, g));
        break;
      }
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

    // Somebody on the quay with a story. See progression/quests.
    for (const offer of g.questOffersHere()) {
      const o = offer.offer(g);
      left.append(el('div', { class: 'quest-offer' },
        el('div', { class: 'quest-offer-eyebrow' }, o.who),
        el('h2', {}, offer.title),
        el('p', {}, o.text),
        el('div', { class: 'row' },
          button(o.accept, () => {
            this.notice = { text: g.acceptQuest(offer.id) };
            this.render();
          }, { primary: true }),
        ),
      ));
    }

    left.append(card('', el('p', { style: { fontSize: '15px', lineHeight: '1.7' } }, def.blurb)));

    // What makes this place itself. See world/portCharacter.
    const ch = characterOf(def.id);
    if (ch) {
      const quest = g.questHere();
      left.append(el('div', { class: 'port-character' },
        el('div', { class: 'port-character-eyebrow' }, 'Known for'),
        el('h2', {}, ch.signature),
        ch.custom ? el('p', {}, ch.custom) : null,
        ch.danger ? el('p', { class: 'port-character-danger' }, ch.danger) : null,
        quest ? el('div', { class: 'port-character-quest' },
          el('p', {}, quest.ask),
          el('div', { class: 'row' },
            button(`Give ${quest.qty} ${good(quest.good).english.toLowerCase()}`, () => {
              this.notice = { text: g.doQuestHere() };
              this.render();
            }, { disabled: g.ship.quantityOf(quest.good) < quest.qty }),
            el('span', { style: { fontSize: '12.5px', color: 'var(--ink-soft)', alignSelf: 'center' } },
              `${g.ship.quantityOf(quest.good).toFixed(0)} aboard`),
          ),
        ) : null,
      ));
    }

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

    // Soundings, which are what make the lead line worth heaving on a coast
    // nobody from Lisbon has sounded. See Game.knowsGroundAt.
    const soundPrice = g.localSoundingsPrice();
    if (soundPrice !== null) {
      right.append(card('The local pilots',
        el('p', {}, 'A pilot here knows how the bottom lies for a hundred and fifty miles each way: '
          + 'where it shoals, where the sand turns to mud, where the rocks are. With it in the '
          + 'book, the lead tells you how far off the land you are, not just how deep the water is.'),
        button(`Buy his soundings \u2014 ${soundPrice} cruzados`, () => {
          this.notice = { text: g.buyLocalSoundings() };
          this.render();
        }, { disabled: g.crown.gold < soundPrice }),
      ));
    }

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
    const listings = g.marketHere();

    append(host,
      el('div', { class: 'card' },
        el('div', { class: 'purse-row' },
          el('div', {}, kv('Purse', `${g.crown.gold.toFixed(0)} cruzados`)),
          el('div', {}, kv('Hold free', `${g.ship.holdFree.toFixed(1)} of ${g.ship.holdCapacity} tons`
            + (g.ship.reservedTons > 0 ? ` (${g.ship.reservedTons.toFixed(1)} in the officers’ chests)` : ''))),
          el('div', {}, kv('Your bargaining', `${g.skills.comercio.toFixed(0)}`)),
          g.creditLimit > 0
            ? el('div', {}, kv('Credit',
                `${g.creditFree.toFixed(0)} to draw` + (g.crown.debt > 0 ? ` · ${g.crown.debt.toFixed(0)} owed` : '')))
            : null,
        ),
      ),
      this.marketCard(g, def),
      el('div', { class: 'tabs market-mode' },
        el('button', { class: this.marketMode === 'scales' ? 'active' : '', onclick: () => { this.marketMode = 'scales'; this.render(); } }, 'At the scales, for coin'),
        el('button', { class: this.marketMode === 'barter' ? 'active' : '', onclick: () => { this.marketMode = 'barter'; this.render(); } }, 'The barter table'),
      ),
    );

    if (this.marketMode === 'barter') this.renderBarter(host, g, listings);
    else this.renderScales(host, g, listings);

    const extras = el('div', { class: 'cols two' });
    const l2 = el('div', {}), r2 = el('div', {});
    const eye = this.factorsEye(g);
    if (eye) l2.append(eye);
    const letters = this.lettersCard(g);
    if (letters) l2.append(letters);
    if (def.id === 'lisboa') {
      r2.append(this.kingsGoodsCard(g));
      const ant = this.antwerpCard(g);
      if (ant) r2.append(ant);
    }
    extras.append(l2, r2);
    host.append(extras);
  }

  /** What kind of market this is: what it takes, who else is buying, what is happening to it. */
  private marketCard(g: Game, def: PortDef): HTMLElement {
    const pay = paymentAt(def.id);
    const comp = COMPETITION[def.id];
    const level = g.competitionAt(def.id);
    const fairs = fairsAt(def.id, g.clock.date.month);
    const news = g.newsHeard.filter((n) => n.def.ports.includes(def.id) && n.shock.end > g.clock.t);
    const takes = Object.entries(pay.takes).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, m]) => `${good(id).english.toLowerCase()} (+${Math.round((m - 1) * 100)}%)`);
    return card('This market',
      kv('What they take', pay.line),
      pay.coin > 1.02 ? kv('Coin', `buys about ${Math.round((1 - 1 / pay.coin) * 100)}% less than its face`, 'warn') : null,
      takes.length ? kv('In barter they prize', takes.join(', ')) : null,
      comp ? kv('Also buying', level < comp.level * 0.5 ? `${comp.who}, kept out by your treaty` : comp.who, level > 0.4 ? 'warn' : '') : null,
      ...fairs.map((f) => el('div', { class: 'market-fair' }, el('b', {}, f.name), ' — ', f.text)),
      ...news.map((n) => el('div', { class: 'market-news' }, el('b', {}, n.def.title), ' — ', n.def.text)),
    );
  }

  private renderScales(host: HTMLElement, g: Game, listings: TradeListing[]): void {
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
      const lot = g.ship.cargo.find((c) => c.goodId === l.goodId);
      const held = lot?.quantity ?? 0;
      const qty = this.quantities.get(l.goodId) ?? 10;
      const margin = gd.lisbon / Math.max(l.ask, 0.01);
      const onCharter = consignedOf(g, l.goodId);
      const forCrown = commissionNeed(g, l.goodId);
      const grade = lot ? gradeWord(lot.q ?? 0.5) : '';

      grid.append(el('div', { class: 'trade-row' },
        el('div', { class: 'trade-name' },
          el('b', {}, gd.english, l.casa ? el('span', { class: 'tag warn', title: 'A royal monopoly: the Casa buys it at the King’s price.' }, 'the King’s') : null),
          el('span', {}, `${gd.name} · per ${gd.unit}${l.barter > 1 ? ` · prized in barter` : ''}`),
        ),
        el('div', { class: 'trade-fig', 'data-k': 'They ask' },
          l.stock > 0 ? l.ask.toFixed(1) : '—'),
        el('div', {
          class: 'trade-fig', 'data-k': 'They offer',
          style: l.appetite > 0 && !l.wanted ? { opacity: '0.62', fontStyle: 'italic' } : undefined,
          title: l.casa ? 'What the Casa pays: the King keeps the rest.'
            : l.wanted ? undefined
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
            : forCrown > 0 ? 'The King is expecting this cargo' : grade ? `${grade} quality` : undefined,
          style: forCrown > 0 && held < forCrown ? { color: 'var(--warn)' } : undefined,
        },
          held > 0 || forCrown > 0
            ? onCharter > 0 ? `${held.toFixed(0)} (${onCharter} on charter)`
              : forCrown > 0 ? `${held.toFixed(0)} of ${forCrown} for the King`
                : `${held.toFixed(0)} · ${grade.toLowerCase()}`
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
          button(l.casa ? 'To the Casa' : 'Sell', () => this.sell(g, l, this.quantities.get(l.goodId) ?? qty), {
            disabled: held <= 0 || l.appetite <= 0,
          }),
          l.casa && held > 0
            ? button('On the quay', () => this.sell(g, l, this.quantities.get(l.goodId) ?? qty, true), {
              title: 'Sell it privately at the full price, past the King’s scales. If the officers are on the quay, it is seized.',
            })
            : null,
        ),
      ));
    }
    host.append(grid);
  }

  /** Goods across a cloth: yours on one side, his on the other, until he nods. */
  private renderBarter(host: HTMLElement, g: Game, listings: TradeListing[]): void {
    const pat = g.barterPatience;
    if (pat.closed) {
      host.append(el('div', { class: 'notice grave' }, 'The merchants will not sit down with you again for a few days.'));
      return;
    }
    const give = [...this.barterGive.entries()].map(([goodId, qty]) => ({ goodId, qty }));
    const take = [...this.barterTake.entries()].map(([goodId, qty]) => ({ goodId, qty }));
    const v = g.barterValue(give, this.barterCoin, take);
    const fuzz = g.barterFuzz;
    // What you can read in his face: the true ratio against what he will settle
    // for, blurred by how well you know the trade and the tongue.
    const r = v.theirs > 0 ? v.yours / (v.theirs * g.barterReservation()) : 0;
    const seen = r * (1 + this.faceNoise * fuzz);
    const lean = v.theirs <= 0 ? 'Lay out what you want from him.'
      : seen > 1 + fuzz ? 'He is trying not to look pleased.'
        : seen > 1 - fuzz ? 'He is thinking about it.'
          : seen > 0.8 ? 'He is not there yet.'
            : 'He looks at your side of the cloth as if it were an insult.';
    const pay = paymentAt(g.dockedAt!);
    const qtyInput = (map: Map<string, number>, id: string, max: number, label: string) => el('input', {
      type: 'number', min: '0', max: String(Math.floor(max)), inputmode: 'numeric', value: String(map.get(id) ?? 0),
      'aria-label': label,
      onchange: (e: Event) => {
        const n = clamp(Math.floor(Number((e.target as HTMLInputElement).value) || 0), 0, Math.floor(max));
        if (n > 0) map.set(id, n); else map.delete(id);
        // Deferred: a change fires on blur, and blur fires while render is
        // tearing the old input out of the page.
        setTimeout(() => this.render(), 0);
      },
    });

    const mine = listings.filter((l) => g.ship.quantityOf(l.goodId) >= 1 && l.appetite > 0)
      .sort((a, b) => b.barter - a.barter);
    const his = listings.filter((l) => l.stock > 0);
    const yourSide = card('Your side of the cloth',
      ...mine.map((l) => {
        const lot = g.ship.cargo.find((c) => c.goodId === l.goodId)!;
        return el('div', { class: 'barter-row' },
          el('div', {},
            el('div', {}, good(l.goodId).english,
              l.barter > 1 ? el('span', { class: 'tag good' }, `prized +${Math.round((l.barter - 1) * 100)}%`) : null),
            el('div', { class: 'gift-sub' }, `${lot.quantity.toFixed(0)} aboard · ${gradeWord(lot.q ?? 0.5).toLowerCase()}`)),
          qtyInput(this.barterGive, l.goodId, Math.min(lot.quantity, l.appetite), `Offer ${good(l.goodId).english}`));
      }),
      mine.length === 0 ? el('p', {}, 'Nothing in the hold they will take.') : null,
      el('div', { class: 'barter-row' },
        el('div', {}, el('div', {}, 'Coin'), el('div', { class: 'gift-sub' }, pay.coin > 1.02 ? `worth about ${Math.round(100 / pay.coin)}% of its face here` : 'taken at its face')),
        el('input', {
          type: 'number', min: '0', max: String(Math.floor(g.crown.gold)), inputmode: 'numeric', value: String(this.barterCoin),
          'aria-label': 'Coin',
          onchange: (e: Event) => { this.barterCoin = clamp(Math.floor(Number((e.target as HTMLInputElement).value) || 0), 0, Math.floor(g.crown.gold)); setTimeout(() => this.render(), 0); },
        })),
    );
    const hisSide = card('His side',
      ...his.map((l) => el('div', { class: 'barter-row' },
        el('div', {},
          el('div', {}, good(l.goodId).english),
          el('div', { class: 'gift-sub' }, `${l.stock.toFixed(0)} to be had · about ${l.rawAsk.toFixed(1)} each in trade goods`)),
        qtyInput(this.barterTake, l.goodId, Math.min(l.stock, g.ship.holdFree / good(l.goodId).bulk + (this.barterTake.get(l.goodId) ?? 0)), `Take ${good(l.goodId).english}`))),
      his.length === 0 ? el('p', {}, 'He has nothing to trade today.') : null,
    );
    host.append(el('div', { class: 'cols two' }, yourSide, hisSide));
    host.append(el('div', { class: `audience-reading ${v.theirs <= 0 ? '' : seen > 1 ? 'good' : seen > 0.85 ? 'warn' : 'bad'}` },
      el('b', {}, 'Across the cloth'),
      el('span', {}, lean),
      el('span', { class: 'gift-sub' }, `His patience: ${'●'.repeat(Math.max(0, pat.patience))}${'○'.repeat(Math.max(0, 4 - pat.patience))}`)));
    host.append(el('div', { class: 'row' },
      button('Put it to him', () => {
        const res = g.barter(give, this.barterCoin, take);
        this.notice = { text: res.text, grave: !res.accepted };
        if (res.accepted) { this.barterGive.clear(); this.barterTake.clear(); this.barterCoin = 0; }
        this.faceNoise = g.rng.range(-1, 1);
        this.render();
      }, { primary: true, disabled: v.theirs <= 0 }),
      button('Get up and walk away', () => {
        this.notice = { text: g.walkAway() };
        this.render();
      }, { disabled: pat.walked }),
      button('Clear the cloth', () => { this.barterGive.clear(); this.barterTake.clear(); this.barterCoin = 0; this.render(); }),
    ));
  }

  /**
   * What the same goods fetch at the other ports you know.
   *
   * Out of your own book, not an oracle: the prices you saw with your own eyes,
   * the letters your factors wrote, and whatever a broker sold you. All of them
   * as old as they are.
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
            quotes.map((q) => `${q.port} ${q.bid.toFixed(1)} (${Math.round(q.days)}d)`).join('  ·  ')),
        ),
      ));
    }
    if (rows.length === 0) return null;
    return card('What they pay elsewhere',
      el('p', { style: { fontStyle: 'italic', color: 'var(--ink-soft)' } },
        'From your own book: what you saw, and what was written to you. The days are how old each price is.'),
      el('ul', { class: 'list' }, ...rows),
    );
  }

  private lettersCard(g: Game): HTMLElement | null {
    const offers = g.reportOffers();
    if (offers.length === 0) return null;
    return card('Brokers’ letters',
      el('p', { class: 'flavour' }, 'A broker here will sell you what his correspondents write about the prices on another coast. Most of them are honest. Not all.'),
      el('div', { class: 'row wrap' }, ...offers.map((o) => button(`${REGION_NAME[o.region]} — ${o.price}`, () => {
        this.notice = { text: g.buyReport(o.region) };
        this.render();
      }, { disabled: g.crown.gold < o.price, title: `${o.ports} ports you have charted` }))),
    );
  }

  private kingsGoodsCard(g: Game): HTMLElement {
    return card('The King’s goods',
      el('p', { class: 'flavour' }, `Pepper, gold, malagueta and ivory are the King's. Landed here, the Casa takes them at ${Math.round(CASA_SHARE * 100)}% of what the market would pay — unless you hold his licence to trade them on your own account.`),
      ...MONOPOLY.map((id) => {
        const until = g.trade.licences[id] ?? 0;
        const held = until > g.clock.t;
        return el('div', { class: 'court-agreement' },
          el('span', {}, good(id).english),
          held
            ? el('span', { class: 'due' }, `licensed until ${formatDateAt(until)}`)
            : button(`Licence — ${g.licencePrice(id)}`, () => { this.notice = { text: g.buyLicence(id) }; this.render(); },
              { disabled: g.crown.gold < g.licencePrice(id) }));
      }),
    );
  }

  private antwerpCard(g: Game): HTMLElement | null {
    if (!g.antwerpOpen) return null;
    const rows = g.ship.cargo.filter((c) => ANTWERP[c.goodId] && (!MONOPOLY.includes(c.goodId) || g.hasLicence(c.goodId)));
    const owed = g.trade.antwerp.reduce((s, a) => s + a.amount, 0);
    return card('The Casa’s factor at Antwerp',
      el('p', { class: 'flavour' }, `Antwerp is where Europe buys its spice. The Casa will ship yours there and sell it, less a tenth for the freight, and the money comes back in about ${ANTWERP_DAYS} days. Lisbon's price falls with every cargo landed on it; Antwerp's falls more slowly.`),
      ...rows.map((c) => el('div', { class: 'court-agreement' },
        el('span', {}, `${good(c.goodId).english} — ${antwerpBid(g.trade, c.goodId).toFixed(1)} each`),
        button(`Send ${c.quantity.toFixed(0)}`, () => { this.notice = { text: g.sellAntwerp(c.goodId, c.quantity) }; this.render(); }))),
      rows.length === 0 ? el('p', {}, 'Nothing in the hold Antwerp wants.') : null,
      owed > 0 ? kv('Owed from Antwerp', `${owed.toFixed(0)} cruzados`) : null,
    );
  }

  private buy(g: Game, l: TradeListing, qty: number): void {
    const r = g.tradeBuy(l.goodId, qty);
    this.notice = { text: r.text, grave: !r.ok };
    this.render();
  }

  private sell(g: Game, l: TradeListing, qty: number, quay = false): void {
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

    // And cargo the King is expecting, which is worse: a cargo objective is
    // checked against the hold at court, and selling it on the Tagus quay is
    // the single most natural thing to do with it.
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

    const r = g.tradeSell(l.goodId, take, quay);
    this.notice = {
      text: r.text
        + (r.edge > 0.01 ? ` Your book was worth ${(r.edge * 100).toFixed(0)}% of it.` : '')
        + (r.shared > 0.5 ? ` The sharers took ${r.shared.toFixed(0)} off the top.` : ''),
      grave: !r.ok,
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

    // Forward contracts: the Lisbon houses buying a cargo before it exists.
    for (const c of g.contractOffers()) {
      const gd = good(c.goodId);
      left.append(card(`${c.houseName} \u2014 a contract`,
        el('p', { class: 'flavour' }, `${c.qty} ${unitOf(gd, c.qty)} of ${gd.english.toLowerCase()}, delivered on the Tagus by ${formatDateAt(c.due)}, at ${c.price} the ${gd.unit} whatever the market is paying that day.`),
        kv('Worth on delivery', `${Math.round(c.qty * c.price)} cruzados`),
        kv('Advance now', `${c.advance} cruzados`),
        kv('If you fail', `the advance and half as much again, and their good opinion`),
        el('div', { class: 'row' }, button('Sign', () => { this.notice = { text: g.signContract(c.id) }; this.render(); }, { primary: true })),
      ));
    }
    const open = g.trade.contracts.filter((c) => c.status === 'open');
    if (open.length > 0) {
      right.append(card('Contracts to deliver',
        ...open.map((c) => el('div', { class: 'court-agreement' },
          el('span', {}, `${c.qty} ${good(c.goodId).english.toLowerCase()} for ${c.houseName} (${g.ship.quantityOf(c.goodId).toFixed(0)} aboard)`),
          el('span', { class: 'due' }, `${Math.round((c.due - g.clock.t) / 86400)} days`)))));
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

    // Everybody with money in this voyage, and what each of them is doing to
    // it, on one card. The Casa's arrangement used to be a multiplier nobody
    // could see; it is written down here in figures, because it is in figures.
    const c = g.casa;
    const bias = g.settlementBias;
    const pct = (k: number) => (k === 1 ? 'as reported' : `${k > 1 ? '+' : ''}${Math.round((k - 1) * 100)}%`);
    left.append(card('The Casa da Mina',
      el('div', { class: 'backer' },
        kv('Aires Tinoco, contador', regardWord(c.regard)),
        el('div', { class: 'backer-terms' },
          c.pact ? `His arrangement: your private returns entered generously, for ${c.pactFee ?? 0} cruzados at every settlement. There is a paper.`
            : c.patron ? 'He has decided you are worth protecting, and works your account himself.'
              : c.broke ? 'You went to the King about him. A new clerk keeps your books, and trusts nothing.'
                : c.regard < -0.3 ? 'Every figure exact, and none of them generous.'
                  : 'Your account is kept like any other captain\u2019s.'),
        el('div', { class: 'backer-terms' },
          `At settlement: coin ${pct(bias.gold)}, renown ${pct(bias.standing)}.`),
      ),
      g.finance.shareOut > 0
        ? el('p', { style: { fontSize: '13px' } },
          `${Math.round(g.finance.shareOut * 100)}% of everything this voyage lands belongs to the sharers.`)
        : null,
    ));

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

  /**
   * What the factor is to buy while you are elsewhere.
   *
   * It was a list of every good the town made with an Order button on each and
   * a paragraph explaining weights. There is really one decision in it: a shed
   * full of everything, or a corner of the hold of the one dear thing.
   */
  private orderCard(g: Game, def: PortDef, f: Feitoria | null): HTMLElement {
    const options = buyable(def);
    const current: string[] = f ? f.buying : this.stationOrder;
    const dearest = [...options].sort((a, b) => good(b).lisbon - good(a).lisbon)[0];
    const set = (next: string[]) => {
      if (f) this.notice = { text: g.setStandingOrder(next) };
      else this.stationOrder = next;
      this.render();
    };
    if (!dearest) {
      return card('What he buys', el('p', {}, 'This place produces nothing anybody has a name for.'));
    }
    const focused = current.length === 1 && current[0] === dearest;
    const pick = (on: boolean, title: string, detail: string, next: string[]) =>
      el('button', {
        class: `shore-action${on ? ' done' : ''}`, type: 'button',
        onclick: () => set(next),
      }, el('b', {}, `${on ? '\u2713 ' : ''}${title}`), el('span', {}, detail));
    return card('What he buys',
      el('p', { style: { fontSize: '13px' } },
        'He puts the same money through the town either way. What changes is how much of your '
        + 'hold it takes to carry home.'),
      el('div', { class: 'shore-actions' },
        pick(!focused, 'Whatever the town offers',
          'A full shed, and half your hold to bring it away.', []),
        pick(focused, `Only ${good(dearest).english.toLowerCase()}`,
          `About ${residentPrice(dearest, def).toFixed(1)} here and ${good(dearest).lisbon} at Lisbon. `
          + 'The same money in a corner of the hold.', [dearest]),
      ),
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

    // The ship's systems, each a tree. See ship/upgrades.
    const yard = yardLevel(def);
    const cap = tierCap(g.ship.hullId);
    const effectLines = (u: Upgrade) => {
      const d = describeEffects(u.effects);
      return el('div', { class: 'fit-effects' },
        ...d.good.map((t) => el('span', { class: 'fit-good' }, t)),
        ...d.bad.map((t) => el('span', { class: 'fit-bad' }, t)),
        u.tons > 0 ? el('span', { class: 'fit-bad' }, `${u.tons} t`) : null,
      );
    };
    const node = (u: Upgrade) => {
      const st = nodeStatus(u, g.ship.upgrades, g.ship.hullId, g.crown.lifetimeStanding, yard);
      return el('div', { class: `sys-node ${st.state}`, title: u.blurb },
        el('div', { class: 'fit-title' },
          el('b', {}, u.english), el('span', {}, u.name),
          st.state === 'built'
            ? el('em', { class: 'sys-built' }, 'built')
            : st.state === 'open'
              ? button(`${u.cost} cr \u00b7 ${u.days}d`, () => this.fitUpgrade(g, u.id), {
                disabled: g.crown.gold < u.cost,
                title: st.replaces.length ? `Replaces ${st.replaces.map((id) => UPGRADE_BY_ID.get(id)?.english).join(', ')}` : u.blurb,
              })
              : el('em', { class: 'sys-why' }, st.why),
        ),
        effectLines(u),
      );
    };
    const fx = g.ship.effects;
    const right = el('div', {});
    right.append(card(`Her systems \u2014 the yard here can do ${['nothing', 'the simple work', 'a real refit', 'anything'][yard]}`,
      el('div', { class: 'sys-profile' },
        el('span', {}, `Points ${Math.round(g.noGoAngle)}\u00b0 off the wind`),
        el('span', {}, `Canvas ${Math.round(fx.sailArea * 100)}%`),
        el('span', {}, `Strength ${Math.round(fx.strength * 100)}%`),
        el('span', {}, `Hold ${g.ship.holdCapacity.toFixed(0)} t`),
        el('span', {}, `Fittings weigh ${fx.tons} t`),
        fx.guns ? el('span', {}, `${fx.guns} guns`) : null),
      el('p', { style: { fontSize: '13px' } },
        `A ${hullClass(g.ship.hullId).name} can be taken ${cap === 1 ? 'no further than the first work' : cap === 2 ? 'as far as the fork in each tree' : 'to the top of every tree'}. `
        + 'At the fork she is fitted for one purpose or the other; changing branch is work for Lisbon. Everything built into her weighs something, and weight is room and speed.'),
    ));
    for (const sys of SYSTEMS) {
      const nodes = systemNodes(sys.id).filter((u) => !u.hulls || u.hulls.includes(g.ship.hullId));
      const plan = nodes.filter((u) => u.tier === 0);
      const trunk = nodes.filter((u) => u.tier === 1);
      const a = nodes.filter((u) => u.branch === 'a');
      const b = nodes.filter((u) => u.branch === 'b');
      right.append(card(sys.english,
        el('p', { class: 'fit-blurb' }, sys.blurb),
        plan.length ? el('div', { class: 'fit-cat-head' }, 'Rig plan') : null,
        ...plan.map(node),
        ...trunk.map(node),
        cap >= 2 ? el('div', { class: 'sys-fork' },
          el('div', {}, el('div', { class: 'fit-cat-head' }, sys.a), ...a.filter((u) => u.tier <= cap).map(node)),
          el('div', {}, el('div', { class: 'fit-cat-head' }, sys.b), ...b.filter((u) => u.tier <= cap).map(node)),
        ) : null,
      ));
    }
    const services = UPGRADES.filter((u) => u.service);
    right.append(card('The yard\u2019s own work', ...services.map(node)));

    // A larger ship, once the Crown thinks you are worth one.
    const hulls = g.hullsForSale().filter((h) => h.id !== g.ship.hullId);
    if (def.id === 'lisboa' && hulls.length > 0) {
      const tradeIn = g.tradeInValue();
      const tons = g.ship.cargoTons;
      right.append(card('Ships lying in the river',
        el('p', { class: 'quote' },
          `The yard will allow ${tradeIn} cruzados against the ${hullClass(g.ship.hullId).name} `
          + 'and her hull and keel work. Her rig, stores, quarters, instruments and arms come across '
          + 'into the new ship if it can take them, at half what they cost to fit.'),
        el('ul', { class: 'list' }, ...hulls.map((h) => {
          const price = Math.max(0, h.cost - tradeIn) + g.carryCost(h.id);
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
    const st = nodeStatus(u, g.ship.upgrades, g.ship.hullId, g.crown.lifetimeStanding, yardLevel(g.portHere!));
    if (st.state !== 'open') { this.notice = { text: st.why || 'Already done.', grave: true }; this.render(); return; }
    if (g.crown.gold < u.cost) { this.notice = { text: 'Not enough in the purse.', grave: true }; this.render(); return; }
    g.crown.gold -= u.cost;
    if (id === 'breame') {
      g.ship.condition.fouling = 0;
    } else {
      // Taking the other branch, or another rig plan, strips out what it replaces.
      const out = new Set(st.replaces);
      if (u.tier === 2 && out.size > 0) {
        for (const x of g.ship.upgrades) {
          const v = UPGRADE_BY_ID.get(x);
          if (v && v.system === u.system && v.tier === 3 && v.branch !== u.branch) out.add(x);
        }
      }
      g.ship.upgrades = g.ship.upgrades.filter((x) => !out.has(x));
      if (!g.ship.upgrades.includes(id)) g.ship.upgrades.push(id);
    }
    g.ship.applyRigConversion();
    g.ship.refreshDerived();
    g.waitDays(u.days);
    const gone = st.replaces.map((x) => UPGRADE_BY_ID.get(x)?.english).filter(Boolean);
    g.logEvent('note', `${u.english} \u2014 ${u.days} days in the yard, ${u.cost} cruzados.${gone.length ? ` Out came ${gone.join(', ')}.` : ''}`);
    this.notice = { text: `${u.english} done. ${u.blurb}` };
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

    // The officers' chests: a share of the hold for their own trade.
    const officers = g.crew.officers.filter((o) => o.alive && !o.ashoreAt).length;
    left.append(card('The officers\u2019 chests',
      el('p', { class: 'flavour' }, 'Every officer of a Portuguese ship expected room in the hold for a chest of his own, to trade on his own account. It was most of what the voyage paid him, and he took it as his right. Refuse it and you have the room, and every officer remembers it at every port.'),
      kv('Room it takes', `${(officers * CHEST_TONS).toFixed(1)} tons, for ${officers} officers`),
      el('div', { class: 'row' },
        g.trade.quintaladas
          ? button('Take the room back', () => { g.setQuintaladas(false); this.notice = { text: 'The chests are struck below. The wardroom says nothing, which is worse.' }; this.render(); })
          : button('Grant them their chests', () => { g.setQuintaladas(true); this.notice = { text: 'The officers\u2019 chests are stowed again, as they should have been.' }; this.render(); }, { primary: true })),
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
