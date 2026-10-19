import { candidatesAt } from '../../company/candidates';
import { OFFICER_ROLES } from '../../crew/crew';
import { pendingHomecoming } from '../../game/year';
import type { Game } from '../../game/state';
import { deepPort } from '../../places';
import { outstanding, errandsAt, candidates } from '../../progression/inland';
import { hullPrice } from '../../progression/network';
import { people } from '../../world/peoples';
import { frontsAt, type FrontLine } from './fronts';

/**
 * Quarters: the verbs available in a place, not tabs (BUILD_PLAN C4).
 *
 * Six quarters; each has a few sections, one of which is open on entering. Every function the old seven-tab port screen
 * had is a `Verb` here with the quarter and section it now lives in, and `scripts/quarters.ts` checks the list against the
 * old one by id, so nothing is dropped silently. The model is a pure function of the game: node can build it for any port
 * and any save without a DOM, and the views render from it.
 *
 * Reaching a verb costs: one click to the quarter, one more to its section if it is not the open one; a verb behind a
 * folded card in a section that is not open is opened for you (the shell opens every fold in a section you went to).
 * `clicks` is therefore 1 or 2, and the falsifier asserts it.
 */

export type QuarterId = 'waterfront' | 'tavern' | 'yard' | 'market' | 'court' | 'faith';
export const QUARTER_IDS: QuarterId[] = ['waterfront', 'tavern', 'yard', 'market', 'court', 'faith'];

export interface SectionSpec { id: string; title: string }
export interface QuarterSpec { label: string; blurb: string; sections: SectionSpec[] }

export const QUARTERS: Record<QuarterId, QuarterSpec> = {
  waterfront: {
    label: 'Waterfront', blurb: 'The quay, the company and the men who stand on it.',
    sections: [{ id: 'quay', title: 'The quay' }, { id: 'company', title: 'The company' }, { id: 'men', title: 'Men on the quay' }],
  },
  tavern: {
    label: 'Tavern', blurb: 'What is being said, and who is for hire.',
    sections: [{ id: 'board', title: 'The board' }, { id: 'recruits', title: 'Recruits' }],
  },
  yard: {
    label: 'Yard', blurb: 'The hull, the fittings and the stores.',
    sections: [{ id: 'refit', title: 'Refit' }, { id: 'fittings', title: 'Fittings' }, { id: 'stores', title: 'Stores' }, { id: 'instruments', title: 'Instruments' }],
  },
  market: {
    label: 'Market', blurb: 'Trade, barter, freight and money.',
    sections: [{ id: 'trade', title: 'Trade' }, { id: 'freight', title: 'Freight' }, { id: 'money', title: 'Money' }],
  },
  court: {
    label: 'Fort & Court', blurb: 'Audiences, standing, a House and a Line.',
    sections: [{ id: 'audience', title: 'Audience' }, { id: 'house', title: 'The House' }, { id: 'lines', title: 'Lines' }],
  },
  faith: {
    label: 'Faith', blurb: 'The worship of the place, and your own.',
    sections: [{ id: 'faith', title: 'The faith' }],
  },
};

/** The verb ids the old port screen is sorted by; `foot` is the strip at the bottom of every quarter. */
export type Home = QuarterId | 'foot';

export interface Verb {
  id: string;
  /** Where it lives now. */
  quarter: Home;
  section: string;
  label: string;
  /** Which tab or card it was on before (the new ones say 'new'). */
  was: string;
  /** Whether it is present for this game at this port. Absent: always. */
  when?: (g: Game) => boolean;
}

const here = (g: Game) => g.portHere!;
const unknown = (g: Game): boolean => { const d = here(g); return !g.peopleKnown(d) && !g.relationsFor(d.id).met; };
const portuguese = (g: Game): boolean => here(g).people === 'portuguese';

const couldBuyLine = (g: Game): boolean =>
  g.crown.gold + g.creditFree >= hullPrice('caravela-latina') * 0.8 || g.lines.some((l) => !l.lost);

export const VERBS: Verb[] = [
  // ---- Waterfront: the quay
  { id: 'town.strip', quarter: 'waterfront', section: 'quay', label: 'Who they are, and how they take you', was: 'Town' },
  { id: 'town.homecoming', quarter: 'waterfront', section: 'quay', label: 'Home from the sea', was: 'Town', when: (g) => !!pendingHomecoming(g) },
  { id: 'town.year-quarters', quarter: 'waterfront', section: 'quay', label: 'Winter quarters', was: 'Town', when: (g) => g.dockedAt === 'lisboa' },
  { id: 'town.first-contact', quarter: 'waterfront', section: 'quay', label: 'First contact', was: 'Town', when: unknown },
  { id: 'town.quest-offers', quarter: 'waterfront', section: 'quay', label: 'Somebody on the quay with a story', was: 'Town', when: (g) => g.questOffersHere().length > 0 },
  { id: 'town.place', quarter: 'waterfront', section: 'quay', label: 'The place', was: 'Town' },
  { id: 'town.readiness', quarter: 'waterfront', section: 'quay', label: 'Before you sail', was: 'Town' },
  { id: 'town.soundings', quarter: 'waterfront', section: 'quay', label: 'The local pilots: buy his soundings', was: 'Town', when: (g) => g.localSoundingsPrice() !== null },
  { id: 'town.about-people', quarter: 'waterfront', section: 'quay', label: 'About the people', was: 'Town', when: (g) => !unknown(g) },
  { id: 'town.season-wait', quarter: 'waterfront', section: 'quay', label: 'Lie here until the wind comes round', was: 'Town', when: (g) => !!g.monsoonNow() },
  { id: 'place.patron', quarter: 'waterfront', section: 'quay', label: 'The Patron', was: 'new', when: (g) => !!deepPort(g.dockedAt) },
  { id: 'place.memory', quarter: 'waterfront', section: 'quay', label: 'What the place remembers', was: 'new' },
  // ---- Waterfront: the company
  { id: 'waterfront.shore-leave', quarter: 'waterfront', section: 'company', label: 'Shore leave', was: 'new' },
  { id: 'hands.focsle', quarter: 'waterfront', section: 'company', label: 'The fo’c’sle', was: 'Stores & crew', when: (g) => g.hands.some((h) => h.alive && h.aboard) },
  { id: 'hands.lost', quarter: 'waterfront', section: 'company', label: 'Not coming home', was: 'Stores & crew', when: (g) => g.hands.some((h) => !h.alive) },
  { id: 'hands.officers-pay', quarter: 'waterfront', section: 'company', label: 'Your officers, and the wardroom’s wages', was: 'Stores & crew' },
  { id: 'hands.chests', quarter: 'waterfront', section: 'company', label: 'The officers’ chests', was: 'Stores & crew' },
  {
    id: 'hands.berths-empty', quarter: 'waterfront', section: 'company', label: 'Berths standing empty', was: 'Stores & crew',
    when: (g) => OFFICER_ROLES.some((r) => r.role !== 'lingua' && r.role !== 'degredado' && !g.crew.officers.some((o) => o.alive && o.role === r.role)),
  },
  // ---- Waterfront: men on the quay
  { id: 'hands.men-on-quay', quarter: 'waterfront', section: 'men', label: 'Men on the quay', was: 'Stores & crew', when: (g) => candidatesAt(g, here(g).id).length > 0 },
  { id: 'hands.linguas', quarter: 'waterfront', section: 'men', label: 'Línguas', was: 'Stores & crew' },
  { id: 'hands.inland-out', quarter: 'waterfront', section: 'men', label: 'Men inland', was: 'Stores & crew', when: (g) => outstanding(g).length > 0 },
  { id: 'hands.inland-send', quarter: 'waterfront', section: 'men', label: 'Send a man inland', was: 'Stores & crew', when: (g) => errandsAt(here(g)).length > 0 && candidates(g).length > 0 },
  {
    id: 'hands.degredado', quarter: 'waterfront', section: 'men', label: 'Put a man ashore', was: 'Stores & crew',
    when: (g) => g.crew.officers.some((o) => o.role === 'degredado' && o.alive && !o.ashoreAt) && !portuguese(g),
  },
  {
    id: 'hands.returning', quarter: 'waterfront', section: 'men', label: 'A man come back off the beach', was: 'Stores & crew',
    when: (g) => g.crew.officers.some((o) => o.ashoreAt === here(g).id && o.alive && !o.arc && o.ashoreSince !== undefined && g.clock.t - o.ashoreSince > 300 * 86400),
  },
  // ---- Tavern
  { id: 'town.gossip', quarter: 'tavern', section: 'board', label: 'What they say ashore', was: 'Town', when: (g) => !!g.portGossip },
  { id: 'tavern.rumours', quarter: 'tavern', section: 'board', label: 'The rumour board', was: 'new' },
  { id: 'tavern.listen', quarter: 'tavern', section: 'board', label: 'Buy a round and listen', was: 'new' },
  { id: 'freight.waterfront-says', quarter: 'tavern', section: 'board', label: 'What the waterfront says', was: 'Freight' },
  { id: 'tavern.patron-word', quarter: 'tavern', section: 'board', label: 'The Patron’s word', was: 'new', when: (g) => !!deepPort(g.dockedAt) },
  { id: 'hands.ship', quarter: 'tavern', section: 'recruits', label: 'Ship hands (the crimp)', was: 'Stores & crew' },
  // ---- Yard
  { id: 'yard.work', quarter: 'yard', section: 'refit', label: 'The yard’s work: careen, hull, rig', was: 'Shipyard' },
  { id: 'yard.ribeira', quarter: 'yard', section: 'refit', label: 'The Ribeira das Naus', was: 'Shipyard', when: (g) => g.dockedAt === 'lisboa' },
  { id: 'yard.ships-for-sale', quarter: 'yard', section: 'refit', label: 'Ships lying in the river', was: 'Shipyard', when: (g) => g.dockedAt === 'lisboa' && g.hullsForSale().some((h) => h.id !== g.ship.hullId) },
  { id: 'yard.fittings', quarter: 'yard', section: 'fittings', label: 'Her fittings, slot by slot', was: 'Shipyard' },
  { id: 'stores.loading', quarter: 'yard', section: 'stores', label: 'Loading before she weighs', was: 'Stores & crew' },
  { id: 'stores.aboard', quarter: 'yard', section: 'stores', label: 'Aboard now', was: 'Stores & crew' },
  { id: 'yard.instruments', quarter: 'yard', section: 'instruments', label: 'Instruments', was: 'Shipyard' },
  // ---- Market: trade
  { id: 'market.closed', quarter: 'market', section: 'trade', label: 'The market is closed to you (seek an audience)', was: 'Market', when: (g) => !g.relationsFor(here(g).id).mayTrade },
  { id: 'market.purse', quarter: 'market', section: 'trade', label: 'Purse, hold and credit', was: 'Market', when: (g) => g.relationsFor(here(g).id).mayTrade },
  { id: 'market.info', quarter: 'market', section: 'trade', label: 'This market', was: 'Market', when: (g) => g.relationsFor(here(g).id).mayTrade },
  { id: 'market.scales', quarter: 'market', section: 'trade', label: 'Buy and sell at the scales', was: 'Market', when: (g) => g.relationsFor(here(g).id).mayTrade },
  { id: 'market.barter', quarter: 'market', section: 'trade', label: 'The barter table', was: 'Market', when: (g) => g.relationsFor(here(g).id).mayTrade },
  { id: 'market.factors-eye', quarter: 'market', section: 'trade', label: 'What they pay elsewhere', was: 'Market', when: (g) => g.relationsFor(here(g).id).mayTrade && g.ship.cargo.some((l) => g.distantQuotes(l.goodId, here(g).id).length > 0) },
  { id: 'market.letters', quarter: 'market', section: 'trade', label: 'Brokers’ letters', was: 'Market', when: (g) => g.relationsFor(here(g).id).mayTrade && g.reportOffers().length > 0 },
  { id: 'market.kings-goods', quarter: 'market', section: 'trade', label: 'The King’s goods: licences', was: 'Market', when: (g) => g.relationsFor(here(g).id).mayTrade && g.dockedAt === 'lisboa' },
  { id: 'market.antwerp', quarter: 'market', section: 'trade', label: 'The Casa’s factor at Antwerp', was: 'Market', when: (g) => g.relationsFor(here(g).id).mayTrade && g.dockedAt === 'lisboa' && g.antwerpOpen },
  // ---- Market: freight
  { id: 'freight.ventures', quarter: 'market', section: 'freight', label: 'Charters on offer', was: 'Freight' },
  { id: 'freight.contracts-offered', quarter: 'market', section: 'freight', label: 'A contract on offer', was: 'Freight', when: (g) => g.contractOffers().length > 0 },
  { id: 'freight.contracts-open', quarter: 'market', section: 'freight', label: 'Contracts to deliver', was: 'Freight', when: (g) => g.trade.contracts.some((c) => c.status === 'open') },
  { id: 'freight.own-account', quarter: 'market', section: 'freight', label: 'Carried on your own account', was: 'Freight' },
  // ---- Market: money
  { id: 'money.casa', quarter: 'market', section: 'money', label: 'The Casa da Mina’s account', was: 'Money' },
  { id: 'money.paper', quarter: 'market', section: 'money', label: 'Paper outstanding, and repaying it', was: 'Money' },
  { id: 'money.casa-credit', quarter: 'market', section: 'money', label: 'The Casa’s own credit', was: 'Money' },
  { id: 'money.street', quarter: 'market', section: 'money', label: 'Your name on this street', was: 'Money' },
  { id: 'money.house-offers', quarter: 'market', section: 'money', label: 'Borrow, or sell sixteenths', was: 'Money' },
  // ---- Fort and Court
  { id: 'court.standing', quarter: 'court', section: 'audience', label: 'Standing: regard, leave and marks', was: 'new' },
  { id: 'court.audience', quarter: 'court', section: 'audience', label: 'Seek an audience', was: 'foot', when: (g) => !portuguese(g) },
  { id: 'court.patron', quarter: 'court', section: 'audience', label: 'The Patron’s perks here', was: 'new', when: (g) => !!deepPort(g.dockedAt) },
  { id: 'station.found', quarter: 'court', section: 'house', label: 'A House here: the price', was: 'House', when: (g) => !g.factoryHere },
  { id: 'station.who', quarter: 'court', section: 'house', label: 'Who is to have it', was: 'House', when: (g) => !g.factoryHere && g.canFoundFactory(here(g)) === null },
  { id: 'station.order', quarter: 'court', section: 'house', label: 'What he buys', was: 'House', when: (g) => !g.factoryHere ? g.canFoundFactory(here(g)) === null : true },
  { id: 'station.store', quarter: 'court', section: 'house', label: 'The factor’s store', was: 'House', when: (g) => !!g.factoryHere },
  { id: 'station.take-aboard', quarter: 'court', section: 'house', label: 'Take it aboard', was: 'House', when: (g) => !!g.factoryHere },
  { id: 'station.head', quarter: 'court', section: 'house', label: 'What the House does', was: 'House', when: (g) => !!g.factoryHere },
  { id: 'station.works', quarter: 'court', section: 'house', label: 'Works', was: 'House', when: (g) => !!g.factoryHere },
  { id: 'station.civic', quarter: 'court', section: 'house', label: 'The town', was: 'House', when: (g) => !!g.factoryHere },
  { id: 'station.chest', quarter: 'court', section: 'house', label: 'The chest', was: 'House', when: (g) => !!g.factoryHere },
  { id: 'station.build', quarter: 'court', section: 'house', label: 'Build', was: 'House', when: (g) => !!g.factoryHere },
  { id: 'station.garrison', quarter: 'court', section: 'house', label: 'The garrison, and shutting it up', was: 'House', when: (g) => !!g.factoryHere },
  { id: 'freight.open-line', quarter: 'court', section: 'lines', label: 'A Line from this port', was: 'Freight', when: (g) => (!!g.factoryHere || g.dockedAt === 'lisboa') && couldBuyLine(g) },
  { id: 'court.no-lines', quarter: 'court', section: 'lines', label: 'No Line is yet within your means', was: 'new', when: (g) => !((!!g.factoryHere || g.dockedAt === 'lisboa') && couldBuyLine(g)) },
  // ---- Faith
  { id: 'faith.people', quarter: 'faith', section: 'faith', label: 'Their worship', was: 'new' },
  { id: 'faith.chaplain', quarter: 'faith', section: 'faith', label: 'Your chaplain', was: 'new' },
  { id: 'faith.keep-day', quarter: 'faith', section: 'faith', label: 'Hear mass, or keep the day', was: 'new' },
  // ---- The foot of every quarter
  { id: 'foot.court-lisboa', quarter: 'foot', section: 'foot', label: 'To court', was: 'foot', when: (g) => g.dockedAt === 'lisboa' },
  { id: 'foot.admiral', quarter: 'foot', section: 'foot', label: 'To the Admiral', was: 'foot', when: (g) => here(g).people === 'han' },
  { id: 'foot.audience', quarter: 'foot', section: 'foot', label: 'Seek an audience', was: 'foot' },
  { id: 'foot.sail-home', quarter: 'foot', section: 'foot', label: 'Sail her home', was: 'foot', when: (g) => g.can('homeward') && g.dockedAt !== 'lisboa' },
  { id: 'foot.wait', quarter: 'foot', section: 'foot', label: 'Wait…', was: 'foot' },
  { id: 'foot.weigh', quarter: 'foot', section: 'foot', label: 'Weigh anchor', was: 'foot' },
];

export const VERB_BY_ID = new Map(VERBS.map((v) => [v.id, v]));

export interface VerbState { id: string; label: string; section: string; available: boolean; clicks: number; was: string }
export interface SectionModel { id: string; title: string; open: boolean; verbs: VerbState[] }
export interface QuarterModel {
  id: QuarterId;
  label: string;
  blurb: string;
  /** A word on the quarter's button: what is waiting there. */
  badge: string;
  fronts: FrontLine[];
  /** True when the Market is shut to the ship. */
  shut: boolean;
  sections: SectionModel[];
}

/** Clicks to reach a verb: the quarter, and its section if it is not the one that opens. */
export function clicksFor(v: Verb): number {
  if (v.quarter === 'foot') return 1;
  return QUARTERS[v.quarter].sections[0].id === v.section ? 1 : 2;
}

/** Badges: small words on the quarter buttons, from what is actually waiting. */
function badgeOf(g: Game, q: QuarterId): string {
  switch (q) {
    case 'waterfront': return g.questOffersHere().length > 0 ? 'a story' : '';
    case 'tavern': {
      const n = g.powers.rumours.filter((r) => r.heard?.port === g.dockedAt).length;
      return n > 0 ? `${n} tale${n === 1 ? '' : 's'}` : '';
    }
    case 'yard': return g.readiness().some((c) => c.state === 'bad') ? 'wants work' : '';
    case 'market': {
      const owed = g.finance.owedTo();
      if (!g.relationsFor(g.dockedAt!).mayTrade && !portuguese(g)) return 'closed';
      return g.ventureOffers.length > 0 ? `${g.ventureOffers.length} freight` : owed > 0 ? `${owed.toFixed(0)} owed` : '';
    }
    case 'court': return g.factoryHere ? 'a House' : '';
    case 'faith': return '';
  }
}

/** The whole Quarters model for the port the ship lies in. Pure. */
export function quartersModel(g: Game): QuarterModel[] {
  const def = g.portHere;
  if (!def) return [];
  const fronts = frontsAt(g, def.id);
  const rel = g.relationsFor(def.id);
  return QUARTER_IDS.map((q) => {
    const spec = QUARTERS[q];
    return {
      id: q, label: spec.label, blurb: spec.blurb, badge: badgeOf(g, q), fronts: fronts[q],
      shut: q === 'market' && !rel.mayTrade && people(def.people) !== undefined && def.people !== 'portuguese',
      sections: spec.sections.map((s, i) => ({
        id: s.id, title: s.title, open: i === 0,
        verbs: VERBS.filter((v) => v.quarter === q && v.section === s.id).map((v) => ({
          id: v.id, label: v.label, section: s.id, was: v.was, clicks: clicksFor(v), available: v.when ? v.when(g) : true,
        })),
      })),
    };
  });
}

/** The ids of the verbs available now, over the whole screen (the foot included). */
export function availableVerbs(g: Game): string[] {
  return VERBS.filter((v) => (v.when ? v.when(g) : true)).map((v) => v.id);
}
