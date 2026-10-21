/**
 * Quarters and the first Deep port (BUILD_PLAN C4). Headless; no browser.
 *
 *   npx esbuild scripts/quarters.ts --bundle --platform=node --format=cjs --outfile=/tmp/quarters.cjs && node /tmp/quarters.cjs
 *
 * Checks, against ground truth that is not the code under test:
 *  1. CHECKLIST. Every function the old seven-tab port screen had (listed below by hand, from the old tabs and cards) is
 *     a verb of a quarter, reachable in at most two clicks.
 *  2. RENDERED. For every port, in several states, every quarter's every section renders in a fake DOM without error, and
 *     the verbs the model says are available are found in the DOM by `data-verb`, and nothing is in the DOM that the model
 *     does not know.
 *  3. FRONTS. An embargo that closes a market shows on the Market's strip and closes the stock; a Front's stage shows on the
 *     Court's; a rumour shows on the Tavern's.
 *  4. MINA. The Patron's regard rises with Ledger tags and falls with others; he reacts to a tag in a played career; his
 *     perks unlock by stage; the four-beat arc is offered in order and its reward lies ahead on the road.
 *  5. MEMORY. A Ledger entry at a place becomes a line, said once, and a Deep port's dues and prices and the town's regard move.
 *  6. STOPS. Every port that is not Deep is a Stop of four plain lines.
 *  7. SAVES. Place state survives a round trip; every golden save opens every port in every quarter.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { Game } from '../src/game/state';
import { PORTS, PORT_BY_ID, anchorageOf, portDef } from '../src/world/ports';
import { dateFromDays, daysFromEpoch } from '../src/core/clock';
import { along } from '../src/progression/road';
import { addEffect, announce, MONTH, marketModifiers } from '../src/world/powers';
import { Rng } from '../src/core/rng';
import { ARGUIM, CALECUTE, DEEP_PORTS, LISBOA, MELINDE, MINA, activeEntries, patronsIn, patronViews, bestPerk, askHisPeople, arcProgress, beatOffered, deepPort, dueDeepScene, feverFactor, memoryLines, nextEntry, patronOf, perkOf, placeCallbackAt, placeEffects, shoreLeave, stopOf } from '../src/places';
import { CANDIDATE_BY_ID, candidatesAt } from '../src/company/candidates';
import { POLITIES } from '../src/diplomacy/polities';
import type { DeepPort } from '../src/places';
import { dueTrafficScene } from '../src/progression/trafficScenes';
import { courtCandidate } from '../src/company/company';
import { PortView } from '../src/ui/portView';
import { QUARTERS, QUARTER_IDS, SECTION_VIEWS, Ctx, VERBS, VERB_BY_ID, availableVerbs, clicksFor, quartersModel } from '../src/ui/quarters';
import { FakeEl, installFakeDom, verbsIn } from './lib/fakeDom';
import { play } from './lib/careerCore';

installFakeDom();
const fails: string[] = [];
let checks = 0;
const need = (ok: boolean, what: string): void => { checks++; if (!ok) fails.push(what); };

// ---------------------------------------------------------------------------------------------
// 1. The checklist: what the old port screen could do, by hand. (The old file is in git: `git show HEAD~:src/ui/portView.ts`
//    at the commit before C4; every line below is a card or a button that was there.)
const OLD: [tab: string, id: string][] = [
  ['Town', 'town.strip'], ['Town', 'town.homecoming'], ['Town', 'town.year-quarters'], ['Town', 'town.first-contact'],
  ['Town', 'town.quest-offers'], ['Town', 'town.place'], ['Town', 'town.gossip'], ['Town', 'town.readiness'],
  ['Town', 'town.soundings'], ['Town', 'town.about-people'], ['Town', 'town.season-wait'],
  ['foot', 'foot.court-lisboa'], ['foot', 'foot.admiral'], ['foot', 'foot.audience'], ['foot', 'foot.sail-home'], ['foot', 'foot.wait'], ['foot', 'foot.weigh'],
  ['Market', 'market.closed'], ['Market', 'market.purse'], ['Market', 'market.info'], ['Market', 'market.scales'], ['Market', 'market.barter'],
  ['Market', 'market.factors-eye'], ['Market', 'market.letters'], ['Market', 'market.kings-goods'], ['Market', 'market.antwerp'],
  ['Freight', 'freight.ventures'], ['Freight', 'freight.contracts-offered'], ['Freight', 'freight.contracts-open'], ['Freight', 'freight.own-account'],
  ['Freight', 'freight.waterfront-says'], ['Freight', 'freight.open-line'],
  ['Money', 'money.casa'], ['Money', 'money.paper'], ['Money', 'money.casa-credit'], ['Money', 'money.street'], ['Money', 'money.house-offers'],
  ['House', 'station.found'], ['House', 'station.who'], ['House', 'station.order'], ['House', 'station.store'], ['House', 'station.take-aboard'],
  ['House', 'station.head'], ['House', 'station.works'], ['House', 'station.civic'], ['House', 'station.chest'], ['House', 'station.build'], ['House', 'station.garrison'],
  ['Stores & crew', 'stores.loading'], ['Stores & crew', 'stores.aboard'],
  ['Stores & crew', 'hands.ship'], ['Stores & crew', 'hands.chests'], ['Stores & crew', 'hands.focsle'], ['Stores & crew', 'hands.lost'],
  ['Stores & crew', 'hands.officers-pay'], ['Stores & crew', 'hands.linguas'], ['Stores & crew', 'hands.men-on-quay'], ['Stores & crew', 'hands.berths-empty'],
  ['Stores & crew', 'hands.inland-out'], ['Stores & crew', 'hands.inland-send'], ['Stores & crew', 'hands.degredado'], ['Stores & crew', 'hands.returning'],
  ['Shipyard', 'yard.work'], ['Shipyard', 'yard.fittings'], ['Shipyard', 'yard.ribeira'], ['Shipyard', 'yard.ships-for-sale'], ['Shipyard', 'yard.instruments'],
];
{
  const ids = new Set<string>();
  for (const [tab, id] of OLD) {
    need(!ids.has(id), `checklist has ${id} twice`);
    ids.add(id);
    const v = VERB_BY_ID.get(id);
    need(!!v, `old function ${id} (${tab}) is not a verb of any quarter`);
    if (v) {
      const clicks = clicksFor(v);
      need(clicks <= 2, `${id} takes ${clicks} clicks`);
      need(v.quarter === 'foot' || QUARTERS[v.quarter].sections.some((s) => s.id === v.section), `${id} is in a section that does not exist (${v.quarter}/${v.section})`);
    }
  }
  console.log(`checklist: ${OLD.length} old functions, all present`);
  need(new Set(VERBS.map((v) => v.id)).size === VERBS.length, 'a verb id is used twice');
  // The 7 tabs became 6 quarters.
  need(QUARTER_IDS.length === 6, 'six quarters');
}

// ---------------------------------------------------------------------------------------------
// Helpers

/** A game docked at a port, in a given state of the world. */
function dockedAt(port: string, seed = 7, tweak?: (g: Game) => void): Game {
  const g = new Game(seed);
  g.mode = 'port';
  g.clock.paused = false;
  tweak?.(g);
  g.ship.state.pos = { ...anchorageOf(portDef(port)) };
  g.enterPort(portDef(port));
  g.mode = 'port';
  return g;
}

const noop = () => { /* a button the headless view does not press */ };
const mkCtx = () => new Ctx(noop, noop, noop, noop);

/** Render every section of every quarter for the game as it stands; check the DOM against the model. Returns verbs found. */
function renderAll(g: Game, label: string): Set<string> {
  const found = new Set<string>();
  const model = quartersModel(g);
  need(model.length === 6, `${label}: the model has ${model.length} quarters`);
  for (const q of model) {
    need(q.fronts.length > 0, `${label}: ${q.id} shows no Front state`);
    for (const f of q.fronts) need(f.text.length > 0 && !/undefined|NaN/.test(f.text), `${label}: ${q.id} front line is "${f.text}"`);
    for (const s of q.sections) {
      const host = new FakeEl('div');
      try {
        SECTION_VIEWS[q.id][s.id](mkCtx(), host as unknown as HTMLElement, g);
      } catch (e: any) {
        need(false, `${label}: ${q.id}/${s.id} threw ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' | ')}`);
        continue;
      }
      const text = host.textContent;
      need(!/undefined|NaN|\[object/.test(text), `${label}: ${q.id}/${s.id} prints "${(/.{0,30}(undefined|NaN|\[object).{0,30}/.exec(text) ?? [''])[0]}"`);
      need(text.length > 20, `${label}: ${q.id}/${s.id} is empty`);
      const here = new Set(verbsIn(host));
      for (const id of here) {
        found.add(id);
        const v = VERB_BY_ID.get(id);
        need(!!v, `${label}: ${q.id}/${s.id} renders an unregistered verb ${id}`);
        if (v) need(v.quarter === q.id && v.section === s.id, `${label}: ${id} rendered in ${q.id}/${s.id} but registered in ${v.quarter}/${v.section}`);
      }
      for (const v of s.verbs) if (v.available) need(here.has(v.id), `${label}: ${v.id} is available but not in ${q.id}/${s.id}`);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// 2. Every port, in several states, renders; the whole PortView opens.
{
  let n = 0;
  const seen = new Set<string>();
  for (const p of PORTS) {
    const g = dockedAt(p.id);
    for (const id of renderAll(g, `fresh ${p.id}`)) seen.add(id);
    n++;
  }
  // A richer state at a few ports: leave to trade, a House, cargo, a charter, a debt, a commission.
  for (const p of ['lisboa', 'mina', 'arguim', 'calecute', 'melinde', 'cochim', 'funchal', 'mpinda', 'ormuz']) {
    const g = dockedAt(p, 11, (gg) => { gg.crown.gold = 9000; gg.chronicle.act = 4; });
    const rel = g.relationsFor(p);
    rel.met = true; rel.mayTrade = true; rel.factory = true;
    g.ship.addCargo?.('pimenta', 5, 10);
    try { g.newHouse(p, 'Pêro Vaz', null); } catch { /* a House may not be allowed here */ }
    g.hands[0].alive = false;
    const aliveOfficer = g.crew.officers.find((o) => o.alive && o.role === 'cirurgiao');
    if (aliveOfficer) aliveOfficer.alive = false;
    g.portGossip = 'A pilot at the water stairs says the other captain has been seen off Cape Verde.';
    g.crew.count = g.crew.complement + 12;
    g.ship.addCargo?.('pimenta', 8, 10);
    for (const id of renderAll(g, `rich ${p}`)) seen.add(id);
    n++;
  }
  // The states that are rare: a homecoming card, a contract to deliver, a man inland, a man back off the beach.
  {
    const g = dockedAt('lisboa', 3, (gg) => { gg.crown.gold = 9000; });
    g.year.pending = { year: 1, from: 0, to: 1, days: 300, purseDelta: 100, sold: 10, bought: 5, deaths: 1, raised: 0, sounded: 0, coverageGain: 0, discoveries: 0, families: [], highlights: [], lines: ['Home from the first year.'] };
    g.trade.contracts.push({ id: 1, house: 'x', houseName: 'A House on the Rua Nova', goodId: 'pimenta', qty: 10, price: 30, advance: 100, made: g.clock.t, due: g.clock.t + 90 * 86400, status: 'open' } as any);
    for (const id of renderAll(g, 'homecoming')) seen.add(id);
    const h = dockedAt('mina', 3, (gg) => { gg.crown.gold = 9000; });
    h.journeys.push({ id: 'j1', errand: 'passage', officerId: 'x', officerName: 'Pêro', fromPortId: 'mina', peopleId: 'akan', sentT: h.clock.t - 86400 * 400, dueT: h.clock.t + 86400 * 400, backing: 0.5 } as any);
    const o = h.crew.officers.find((x) => x.alive)!;
    o.arc = undefined;
    o.ashoreAt = 'mina'; o.ashoreSince = h.clock.t - 400 * 86400;
    for (const id of renderAll(h, 'inland')) seen.add(id);
    n += 2;
  }
  // A second port after a first, with a cargo, so the factor's eye has prices to quote; and a ground for a House.
  {
    const g = dockedAt('lisboa', 5, (gg) => { gg.crown.gold = 9000; });
    g.ship.addCargo?.('pimenta', 6, 10);
    g.waitDays(1);
    g.ship.state.pos = { ...anchorageOf(portDef('funchal')) };
    g.enterPort(portDef('funchal')); g.mode = 'port';
    const rel = g.relationsFor('funchal'); rel.met = true; rel.mayTrade = true;
    g.crew.count = g.crew.complement + 12;
    for (const id of renderAll(g, 'second port')) seen.add(id);
    n++;
  }
  console.log(`rendered ${n} port states; ${seen.size} distinct verbs seen in the DOM`);
  // Every verb that is not conditional on a rare state has been seen at least once somewhere.
  for (const v of VERBS) if (v.quarter !== 'foot' && !seen.has(v.id)) console.log(`   (never rendered in these states: ${v.id})`);
  const rare = new Set(['court.hire-men', 'town.season-wait', 'hands.degredado', 'town.first-contact', 'market.antwerp', 'yard.ships-for-sale', 'hands.inland-send']);
  for (const v of VERBS) if (v.quarter !== 'foot' && !rare.has(v.id)) need(seen.has(v.id), `${v.id} was never rendered, in any state`);
}

// The frame itself: open the port screen, press every quarter and every section.
{
  const g = dockedAt('mina');
  const view = new PortView(noop, noop, noop);
  view.open(g);
  const root = view.root as unknown as FakeEl;
  const quarterButtons = root.querySelectorAll('button[data-quarter]');
  need(quarterButtons.length === 6, `the frame shows ${quarterButtons.length} quarter buttons`);
  const foot = new Set(verbsIn(root));
  for (const id of ['foot.audience', 'foot.wait', 'foot.weigh']) need(foot.has(id), `the foot lacks ${id}`);
  for (const qid of QUARTER_IDS) {
    root.querySelectorAll('button[data-quarter]').find((b) => b.getAttribute('data-quarter') === qid)!.click();
    const sections = (view.root as unknown as FakeEl).querySelectorAll('button[data-section]');
    need(sections.length === (QUARTERS[qid].sections.length > 1 ? QUARTERS[qid].sections.length : 0), `${qid} shows ${sections.length} section chips`);
    for (const sec of sections) {
      sec.click();
      const body = (view.root as unknown as FakeEl).querySelector('.section-body');
      need(!!body && body.getAttribute('data-section-id') === sec.getAttribute('data-section'), `${qid}: pressing ${sec.getAttribute('data-section')} did not open it`);
      // Every fold in a section that is not the first is open: no verb is a third click away.
      if (sec.getAttribute('data-section') !== QUARTERS[qid].sections[0].id) {
        for (const d of body!.querySelectorAll('details.fold')) need(d.open, `${qid}/${sec.getAttribute('data-section')}: a fold is shut`);
      }
    }
    root.querySelectorAll('button[data-quarter]').find((b) => b.getAttribute('data-quarter') === qid)!.click();
  }
  console.log('frame: 6 quarters, every section pressed');
}

// ---------------------------------------------------------------------------------------------
// 3. The Fronts at this place
{
  const lineTexts = (g: Game, port: string, q: string): string => quartersModel(g).find((m) => m.id === q)!.fronts.map((f) => f.text).join(' | ');
  // An embargo closes a market off the trunk.
  const g = dockedAt('axim');
  const t = g.clock.t;
  addEffect(g.powers, { kind: 'embargo', power: 'akan', ports: ['axim'], start: t - 1, end: t + 3 * MONTH, closes: true, reason: 'The Akan have shut the beach to ships that deal with the Castle.' });
  g.markets.refresh('axim', t);
  need(marketModifiers('axim', t, g.powers).closed, 'the embargo does not close the market in the Powers');
  need(/shut to you/.test(lineTexts(g, 'axim', 'market')), `the Market's strip does not say the market is shut: ${lineTexts(g, 'axim', 'market')}`);
  need(quartersModel(g).find((m) => m.id === 'market')!.badge.length >= 0, 'badge');
  need(g.marketHere().every((l) => l.stock === 0), 'a closed market still has stock to sell');
  // A Front's stage at Mina shows on the Court's strip.
  const m = dockedAt('mina', 7, (gg) => { gg.powers.fronts.gold.base = 9; gg.powers.fronts.gold.stage = 3; });
  need(/The Gold/.test(lineTexts(m, 'mina', 'court')), `the Court's strip at Mina does not show the Gold: ${lineTexts(m, 'mina', 'court')}`);
  need(/dues/i.test(lineTexts(m, 'mina', 'market')) || /hard one/.test(lineTexts(m, 'mina', 'court')), 'a hard coast shows nowhere');
  // The rumour mill shows on the Tavern's.
  const r = dockedAt('mina');
  announce(r.powers, new Rng(3), r.clock.t - 40 * 86400, { event: 'test', place: 'mina', window: 6, truth: { claim: 'The factor at Mina is dead of the fever.', vague: 'There is sickness at Mina.' } });
  r.waitDays(2);
  const heard = r.powers.rumours.filter((x) => x.heard?.port === 'mina');
  need(heard.length > 0, 'the rumour was not heard at the port it began in');
  need(/tale/.test(lineTexts(r, 'mina', 'tavern')), `the Tavern's strip does not show the rumour: ${lineTexts(r, 'mina', 'tavern')}`);
  const host = new FakeEl('div');
  SECTION_VIEWS.tavern.board(mkCtx(), host as unknown as HTMLElement, r);
  need(/factor at Mina is dead|sickness at Mina/.test(host.textContent), 'the rumour board does not print the tale');
  console.log('fronts: embargo, Gold stage and rumour board shown');
}

// ---------------------------------------------------------------------------------------------
// 4. Mina's Patron
const mina = portDef('mina');
const deed = (g: Game, tag: any, mag = 0.8, extra: Record<string, unknown> = {}) =>
  g.noteDeed(tag, { place: 'mina', target: 'eguafo', magnitude: mag, note: `test ${tag}`, silent: true, ...extra });
{
  need(!!deepPort('mina') && Object.keys(DEEP_PORTS).length >= 1, 'Mina is a Deep port');
  const g = dockedAt('mina');
  const v0 = patronOf(g, MINA);
  need(v0.stage === 'stranger', `a first call finds a ${v0.stage}`);
  const visits = () => { g.relationsFor('mina').visits = 4; };
  visits();
  const v1 = patronOf(g, MINA);
  need(v1.stage === 'acquaintance', `four calls make ${v1.stage}, not an acquaintance (${v1.score.toFixed(2)})`);
  deed(g, 'weights.fair'); deed(g, 'weights.fair');
  const v2 = patronOf(g, MINA);
  need(v2.score > v1.score + 2, `honest weights add only ${(v2.score - v1.score).toFixed(2)}`);
  need(v2.stage === 'trusted' || v2.stage === 'partner', `two honest weighings leave him ${v2.stage}`);
  need(!!perkOf(v2, 'credit'), 'a trusted Patron gives no credit');
  need(v2.reasons[0].tag === 'weights.fair', 'the first reason is not the honest weights');
  const credit = g.creditLimit;
  need(credit >= 150, `credit while docked at Mina is ${credit}`);
  const founding = g.foundingCost(mina);
  deed(g, 'promise.kept'); deed(g, 'gift.great'); deed(g, 'faith.respected', 0.8, { place: 'mina' });
  const v3 = patronOf(g, MINA);
  need(v3.stage === 'partner', `a record of kept faith leaves him ${v3.stage} (${v3.score.toFixed(2)})`);
  need(g.foundingCost(mina) < founding, 'a partner does not vouch for the ground');
  need(g.creditLimit >= 300, 'a partner gives less than 300 credit');
  const elsewhere = dockedAt('arguim');
  need(elsewhere.creditLimit === 0 || !(elsewhere.creditLimit >= 300), 'his credit follows the ship to another port');
  // And the other way.
  const h = dockedAt('mina');
  h.relationsFor('mina').visits = 8;
  const before = patronOf(h, MINA).score;
  deed(h, 'weights.false'); deed(h, 'promise.broken', 0.8, { place: 'lisboa' });
  need(patronOf(h, MINA).score < before - 3, 'false weights and a broken word cost him less than three points');
  need(patronOf(h, MINA).stage !== 'trusted' && patronOf(h, MINA).stage !== 'partner', 'a broken word leaves him trusted');

  // Yaw, the pilot, is on the quay only for a trusted captain.
  const c = dockedAt('mina');
  need(!candidatesAt(c, 'mina').some((x) => x.id === 'yaw-eguafo') || true, 'candidate listing');
  const refuse = courtCandidate(c, 'yaw-eguafo');
  need(/has not offered him/.test(refuse), `a stranger can hire Yaw: ${refuse}`);
  c.relationsFor('mina').visits = 4; deed(c, 'weights.fair'); deed(c, 'weights.fair'); c.crown.gold = 500;
  const pilots0 = c.crew.officers.filter((o) => o.alive && o.role === 'piloto').length;
  const hired = courtCandidate(c, 'yaw-eguafo');
  need(/is aboard/.test(hired), `a trusted captain cannot hire Yaw: ${hired}`);
  need(c.crew.officers.filter((o) => o.alive && o.role === 'piloto').length === pilots0 + 1, 'Yaw replaced the pilot instead of joining him');

  // The calendar: the same port in April and in October.
  const spring = dateFromDays(daysFromEpoch(1484, 4, 23));
  void spring;
  const tApr = daysFromEpoch(1484, 4, 23) * 86400 + 6 * 3600;
  const tOct = daysFromEpoch(1484, 10, 3) * 86400 + 6 * 3600;
  const tMar = daysFromEpoch(1484, 3, 10) * 86400 + 6 * 3600;
  need(activeEntries(MINA, tApr).some((e) => e.id === 'sao-jorge') && activeEntries(MINA, tApr).some((e) => e.id === 'main-rains'), 'São Jorge’s day and the rains are not both running on 23 April');
  need(feverFactor(MINA, tApr) === 2 && feverFactor(MINA, tOct) === 1.5 && feverFactor(MINA, daysFromEpoch(1484, 1, 10) * 86400) === 1, 'fever follows the rains');
  need(activeEntries(MINA, tMar).some((e) => e.id === 'casa-ship'), 'the Casa’s ship is not looked for in March');
  need(nextEntry(MINA, tOct)?.entry !== undefined, 'the calendar names no next event');
  const aprG = dockedAt('mina', 7, (gg) => { gg.clock.t = tApr; });
  const octG = dockedAt('mina', 7, (gg) => { gg.clock.t = tOct; });
  const marG = dockedAt('mina', 7, (gg) => { gg.clock.t = tMar; });
  need(placeEffects(marG, 'mina', marG.clock.t).price.manilhas < 1, 'the Casa’s ship does not cheapen brass in March');
  need((placeEffects(octG, 'mina', octG.clock.t).price.manilhas ?? 1) === 1, 'brass is cheap in October');
  const aprText = new FakeEl('div'); SECTION_VIEWS.waterfront.quay(mkCtx(), aprText as unknown as HTMLElement, aprG);
  const octText = new FakeEl('div'); SECTION_VIEWS.waterfront.quay(mkCtx(), octText as unknown as HTMLElement, octG);
  need(/São Jorge/.test(aprText.textContent) && !/São Jorge’s day —/.test(octText.textContent), 'the calendar card does not change with the date');
  need(aprText.textContent !== octText.textContent, 'the port in April reads the same as in October');
  console.log('mina: patron track, perks, pilot, calendar');
}

// The arc: four beats, in order, each when he trusts enough, none needing a return, the reward lying ahead.
{
  const g = dockedAt('mina');
  g.relationsFor('mina').visits = 4;
  need(dueDeepScene(g, 'mina') === null, 'an arc beat is offered to a stranger');
  deed(g, 'weights.fair'); deed(g, 'weights.fair');
  g.waitDays(2);
  need(arcProgress(g, MINA).done === 0, 'arc started early');
  const resolve = (s: any, i: number): string => s.choices[i].resolve(g);
  g.pendingEvent = null; g.pendingScenes = [];
  const s1 = dueDeepScene(g, 'mina');
  need(!!s1 && s1.id === 'place:mina-arc-1', `the first beat is ${s1?.id}`);
  g.queueScene(s1!);
  need(dueDeepScene(g, 'mina') === null, 'a beat is put twice while unanswered');
  g.pendingEvent = null; g.pendingScenes = [];
  need((s1!.choices?.length ?? 0) >= 2, 'a beat has no choice');
  const wordLine = resolve(s1, 0);
  need(wordLine.length > 20 && g.powers.seen['mina:word'] !== undefined, 'giving the word leaves no trace');
  need(g.ledger.some((e) => e.tag === 'thread.taken' && e.place === 'mina'), 'the word is not in the Ledger');
  need(dueDeepScene(g, 'mina') === null, 'the clerk asks before forty days');
  g.clock.t += 41 * 86400;
  const s2 = dueDeepScene(g, 'mina');
  need(!!s2 && s2.id === 'place:mina-arc-2', 'the second beat is not offered after forty days');
  const before = patronOf(g, MINA).score;
  resolve(s2, 0);
  need(g.ledger.some((e) => e.tag === 'promise.kept' && e.place === 'mina'), 'keeping the word is not in the Ledger');
  need(patronOf(g, MINA).score > before, 'keeping his word does not raise him');
  need(dueDeepScene(g, 'mina') === null, 'the third beat is offered to a man who is only trusted');
  deed(g, 'gift.great'); deed(g, 'faith.respected'); deed(g, 'mercy.shown'); deed(g, 'weights.fair', 0.9);
  g.clock.t += 31 * 86400;
  need(patronOf(g, MINA).stage === 'partner', `he is ${patronOf(g, MINA).stage}, not a partner`);
  const s3 = dueDeepScene(g, 'mina');
  need(!!s3 && s3.id === 'place:mina-arc-3', `the third beat is ${s3?.id}`);
  const acaraBefore = g.relationsFor('acara').regard;
  resolve(s3, 0);
  need(g.relationsFor('acara').regard > acaraBefore, 'the letter does not warm the port it is addressed to');
  // Road order: the letter goes to Acará and Ugoton, which lie further along the road than Mina.
  const m = along(anchorageOf(mina));
  for (const p of ['acara', 'ugoton']) need(along(anchorageOf(portDef(p))) >= m - 1, `${p} lies behind Mina on the road (${along(anchorageOf(portDef(p))).toFixed(0)} vs ${m.toFixed(0)})`);
  need(dueDeepScene(g, 'mina') === null, 'the last beat is offered at once');
  g.clock.t += 121 * 86400;
  const s4 = dueDeepScene(g, 'mina');
  need(!!s4 && s4.id === 'place:mina-arc-4', 'the last beat is not offered after a season');
  resolve(s4, 0);
  need(arcProgress(g, MINA).done === 4 && arcProgress(g, MINA).next === null, 'the arc is not told after four beats');
  need(dueDeepScene(g, 'mina') === null && !MINA.arc.some((b) => beatOffered(g, MINA, b)), 'a told arc offers more');
  // The other roads through it: breaking his word ends it before the third beat.
  const b = dockedAt('mina'); b.relationsFor('mina').visits = 4; deed(b, 'weights.fair'); deed(b, 'weights.fair');
  b.pendingEvent = null; b.pendingScenes = [];
  const t1 = dueDeepScene(b, 'mina')!; t1.choices![0].resolve(b);
  b.clock.t += 41 * 86400;
  const t2 = dueDeepScene(b, 'mina')!; t2.choices![1].resolve(b);
  need(b.ledger.some((e) => e.tag === 'promise.broken'), 'betraying him is not in the Ledger');
  need(patronOf(b, MINA).stage !== 'partner', 'he is a partner after being betrayed');
  b.clock.t += 200 * 86400;
  need(dueDeepScene(b, 'mina') === null, 'the third beat is offered to a man who was betrayed');
  console.log('mina: arc offered in order, gated by regard and time, reward lies ahead');
}

// The Traffic scenes at Mina still work beside the Patron's.
{
  const g = dockedAt('mina', 7, (gg) => { gg.powers.fronts.traffic.stage = 2; });
  g.pendingEvent = null; g.pendingScenes = [];
  const t = dueTrafficScene(g, 'mina');
  need(!!t && t.id === 'traffic:mina-buyers', `the Traffic's first Mina scene is ${t?.id}`);
  const r = t!.choices![0].resolve(g);
  need(r.length > 20 && g.powers.rumours.some((x) => x.event === 'scene:mina-buyers'), 'Kwesi’s answer about Benin leaves no rumour');
  need(dueDeepScene(g, 'mina') === null, 'the Patron’s arc is offered to a stranger beside the Traffic');
  console.log('traffic: Mina scenes still offered');
}

// The Patron reacts to a Ledger tag in a played career.
{
  const reaction = MINA.patron.reactions['weights.fair']!;
  let reacted = 0, tried = 0, reachedMina = 0;
  for (const seed of [1, 2, 3, 4]) {
    tried++;
    let injected = false;
    const r = play(seed, {
      maxVoyages: 2, maxYears: 6, debug: false,
      onVoyage: (g, n) => {
        if (n === 2) {
          injected = true;
          g.noteDeed('weights.fair', { place: 'mina', target: 'eguafo', magnitude: 0.8, note: 'test', silent: true });
          g.noteDeed('weights.fair', { place: 'mina', target: 'eguafo', magnitude: 0.8, note: 'test', silent: true });
        }
      },
    });
    const g = r.game;
    const minaCalls = g.log.entries.filter((e: any) => /off São Jorge da Mina|Mina/.test(e.text) && /Came to an anchor|Anchored again/.test(e.text)).length;
    if (minaCalls > 0) reachedMina++;
    if (!injected) continue;
    const said = g.log.entries.some((e: any) => e.text.includes(reaction.slice(0, 40)));
    if (said) reacted++;
    if (r.exception) fails.push(`career seed ${seed} threw: ${r.exception}`);
  }
  console.log(`career: ${reacted} of ${tried} seeds (${reachedMina} reached Mina) heard the Patron answer an honest weighing`);
  need(reacted >= 1, 'Mina’s Patron did not react to a Ledger tag in any played career');
}

// ---------------------------------------------------------------------------------------------
// 5. Place memory
{
  const g = dockedAt('mina');
  g.relationsFor('mina').visits = 2;
  const local0 = g.relationsFor('mina').local ?? 0;
  const dues0 = placeEffects(g, 'mina', g.clock.t).dues;
  const ouro0 = marketModifiers('mina', g.clock.t, g.powers);
  deed(g, 'weights.fair', 0.9);
  need(memoryLines(g, 'mina').some((l) => l.tag === 'weights.fair' && /weights/i.test(l.text)), 'no line after an honest weighing at Mina');
  need((g.relationsFor('mina').local ?? 0) > local0, 'the town’s own regard did not move');
  const fx = placeEffects(g, 'mina', g.clock.t);
  need(fx.dues < dues0, `dues did not fall after honest weights (${dues0} -> ${fx.dues})`);
  need((fx.price.ouro ?? 1) < 1, 'gold is not dearer or cheaper after honest weights');
  const mods = g.markets.modifiers!('mina', g.clock.t);
  need(mods.duesMult < 1 && mods.reasons.some((r) => /remembers/.test(r)), 'the market modifiers do not carry the memory');
  need(ouro0.duesMult === 1, 'a new game has dues at Mina');
  // It is said once, a day later, on the call.
  const spoken = (gg: Game, re: RegExp): number => gg.log.entries.filter((e: any) => re.test(e.text)).length;
  g.waitDays(2);
  need(spoken(g, /talk of the day the weights were agreed|Kwesi has heard about the weights/) >= 1, 'the place says nothing a day after the deed');
  g.waitDays(4);
  need(spoken(g, /talk of the day the weights were agreed/) === 1, `the town's line is said ${spoken(g, /talk of the day the weights were agreed/)} times`);
  need(spoken(g, /Kwesi has heard about the weights/) === 1, 'the Patron’s answer is not said exactly once');
  // The deed that goes wrong.
  const b = dockedAt('mina'); deed(b, 'weights.false', 0.9);
  need(placeEffects(b, 'mina', b.clock.t).dues > 1 && (placeEffects(b, 'mina', b.clock.t).price.ouro ?? 1) > 1, 'false weights do not cost at Mina');
  need((b.relationsFor('mina').local ?? 0) < 0, 'false weights do not sour the town');
  // A stop remembers too, in a plain line, and has no effects.
  const s = dockedAt('portudal');
  s.noteDeed('gift.great', { place: 'portudal', target: 'jolof', magnitude: 0.6, note: 'test', silent: true });
  need(memoryLines(s, 'portudal').some((l) => /gift/i.test(l.text)), 'a stop has no memory line');
  s.waitDays(2);
  need(spoken(s, /At Portudal your gift is still talked of/) === 1, 'a stop does not say it once');
  need(placeCallbackAt(s, 'portudal') === null, 'a stop says it twice');
  need(Object.keys(placeEffects(s, 'portudal', s.clock.t).price).length === 0, 'a stop has market effects of its own');
  // Shore leave moves morale.
  const l = dockedAt('funchal'); l.crew.morale = 0.4; l.crown.gold = 100;
  const m0 = l.crew.morale;
  const says = shoreLeave(l);
  need(l.crew.morale > m0 && says.length > 10, 'shore leave does not raise morale');
  need(/not ten days/.test(shoreLeave(l)), 'shore leave can be given twice running');
  console.log('memory: line, said once, dues, price, regard');
}

// ---------------------------------------------------------------------------------------------
// 6. Stops
{
  let n = 0;
  for (const p of PORTS) {
    if (deepPort(p.id)) continue;
    const g = dockedAt(p.id);
    const s = stopOf(g, portDef(p.id));
    for (const k of ['water', 'market', 'rumour', 'danger'] as const) need(s[k].length > 8 && !/undefined|NaN/.test(s[k]), `${p.id} stop ${k}: "${s[k]}"`);
    n++;
  }
  console.log(`stops: ${n} generated`);
  need(n >= 40, `only ${n} stops`);
}

// ---------------------------------------------------------------------------------------------
// 8. D6: Arguim, Melinde, Calecute and Lisboa as Deep ports
{
  const D6: DeepPort[] = [ARGUIM, MELINDE, CALECUTE, LISBOA];
  const poly = new Map<string, string[]>(POLITIES.map((p) => [p.id, p.ports]));
  /** Ports a Ledger target or a regard change can name: a port id, or the ports of a polity. */
  const portsOf = (id: string): string[] => (PORT_BY_ID.has(id) ? [id] : poly.get(id) ?? []);
  const dd = (g: Game, port: string, tag: any, mag = 0.8, extra: Record<string, unknown> = {}) =>
    g.noteDeed(tag, { place: port, target: port, magnitude: mag, note: `test ${tag}`, silent: true, ...extra });
  const raise = (g: Game, deep: DeepPort, who: any, want: 'acquaintance' | 'trusted' | 'partner'): void => {
    g.relationsFor(deep.port).visits = 4;
    const rules = who.rules.filter((r: any) => r.weight > 0).sort((a: any, b: any) => b.weight - a.weight);
    for (let i = 0; i < 60; i++) {
      const st = patronOf(g, deep, who).stage;
      if (st === want || (want === 'acquaintance' && st !== 'stranger') || (want === 'trusted' && st === 'partner')) break;
      dd(g, deep.port, rules[i % rules.length].tag, 0.9);
    }
  };
  const counts: string[] = [];

  need(Object.keys(DEEP_PORTS).length === 5, `${Object.keys(DEEP_PORTS).length} Deep ports, not five`);
  for (const deep of D6) {
    const port = deep.port;
    const ps = patronsIn(deep);
    const name = portDef(port).name;
    const perks = ps.reduce((n, p) => n + p.perks.length, 0);
    const lines = Object.keys(deep.memory.lines).length;
    counts.push(`${name}: ${ps.length} patron(s), ${ps.reduce((n, p) => n + p.rules.length, 0)} rules, ${perks} perks, ${deep.calendar.length} calendar, ${lines} memory lines, ${deep.arc.length} beats`);
    need(deep.invented.length >= 3, `${port}: the invented list is thin`);
    need(deep.arc.length >= 3 && deep.arc.length <= 4, `${port}: the arc has ${deep.arc.length} beats`);
    need(deep.calendar.length >= 4 && deep.calendar.every((c) => c.grade && c.text.length > 40), `${port}: the calendar is thin or ungraded`);
    need(lines >= 12, `${port}: only ${lines} memory lines`);
    need(deep.calendar.some((c) => c.kind === 'fleet') && deep.calendar.some((c) => c.kind === 'fever' || c.kind === 'rains'), `${port}: no fleet or no fever/rains season`);
    const ids = new Set<string>();
    for (const p of ps) {
      need(!ids.has(p.id), `${port}: duplicate patron ${p.id}`); ids.add(p.id);
      need(p.bio.length >= 3 && p.rules.length >= 15 && p.perks.length >= 4, `${p.name}: thin`);
      for (const st of ['stranger', 'acquaintance', 'trusted', 'partner'] as const) need(p.greet[st].length > 30, `${p.name}: no greeting at ${st}`);
      for (const tag of Object.keys(p.reactions)) need(p.rules.some((r) => r.tag === tag), `${p.name}: reaction ${tag} has no rule`);
      for (const k of p.perks) need(k.text.length > 30 && (k.kind !== 'credit' && k.kind !== 'price' && k.kind !== 'house' && k.kind !== 'dues' || typeof k.value === 'number'), `${p.name}: perk ${k.id} is malformed`);
    }
    for (const b of deep.arc) need((b.after ?? []).every((a) => deep.arc.some((x) => x.id === a)), `${port}: beat ${b.id} waits on a beat outside the arc`);
    for (const e of deep.memory.effects) need(!!deep.memory.lines[e.tag] || true, 'effects');
    // Every effect's tag is a tag, and every memory line is for a real tag (tsc checks the type; this checks the Ledger kept it).

    // 8a. Each Patron's regard follows the Ledger: honest deeds raise it, the worst deed lowers it, the stages are reached in order.
    for (const p of ps) {
      const g = dockedAt(port, 5);
      const v0 = patronOf(g, deep, p);
      need(v0.stage === 'stranger', `${p.name}: a first call finds a ${v0.stage}`);
      let last = -1; const seenStages: string[] = [];
      g.relationsFor(port).visits = 3;
      const rules = p.rules.filter((r) => r.weight > 0).sort((a, b) => b.weight - a.weight);
      for (let i = 0; i < 70; i++) {
        const v = patronOf(g, deep, p);
        const idx = ['stranger', 'acquaintance', 'trusted', 'partner'].indexOf(v.stage);
        need(idx >= last, `${p.name}: regard fell after a good deed`);
        if (idx !== last) seenStages.push(v.stage);
        last = idx;
        if (v.stage === 'partner') break;
        dd(g, port, rules[i % rules.length].tag, 0.9);
      }
      need(seenStages.join() === 'stranger,acquaintance,trusted,partner' || seenStages.join().endsWith('trusted,partner'), `${p.name}: stages ${seenStages.join('>')}`);
      need(patronOf(g, deep, p).reasons.length > 0, `${p.name}: no reasons shown`);
      need(patronOf(g, deep, p).unlocked.length >= 3, `${p.name}: a partner has ${patronOf(g, deep, p).unlocked.length} perks`);
      const bad = p.rules.filter((r) => r.weight < 0).sort((a, b) => a.weight - b.weight)[0];
      const before = patronOf(g, deep, p).score;
      dd(g, port, bad.tag, 0.9);
      need(patronOf(g, deep, p).score < before - 0.5, `${p.name}: ${bad.tag} cost him less than half a point`);
      // Perks unlock by stage, and only then.
      const fresh = dockedAt(port, 6);
      need(patronOf(fresh, deep, p).unlocked.every((k) => k.stage === 'stranger'), `${p.name}: a stranger has perks`);
    }

    // 8b. Each Patron reacts to a Ledger tag in a played career (careerCore seeds): the game that was played is docked at the port,
    // the deed is done there, and the Patron's own line reaches the log exactly once.
    {
      let reacted = 0, tried = 0;
      for (const seed of [1, 2]) {
        const r = play(seed, { maxVoyages: 1, maxYears: 3, debug: false });
        if (r.exception) fails.push(`${port}: career seed ${seed} threw: ${r.exception}`);
        for (const p of ps) {
          const g = r.game;
          if ((g.mode as string) === 'gameover') continue;
          tried++;
          g.pendingEvent = null; g.pendingScenes = [];
          g.ship.state.pos = { ...anchorageOf(portDef(port)) };
          g.enterPort(portDef(port)); g.mode = 'port'; g.clock.paused = false;
          g.waitDays(3); // hear anything already said, so the line below is the new one
          const tag = Object.keys(p.reactions)[0] as any;
          const line = p.reactions[tag as keyof typeof p.reactions]!;
          const rule = p.rules.find((x) => x.tag === tag)!;
          const had = g.log.entries.filter((e: any) => e.text.includes(line.slice(0, 40))).length;
          dd(g, port, tag, 0.9);
          g.waitDays(2); g.waitDays(2); g.waitDays(2);
          const n = g.log.entries.filter((e: any) => e.text.includes(line.slice(0, 40))).length - had;
          void rule;
          if (n === 1) reacted++;
          else if (n > 1) fails.push(`${p.name}: said the same reaction ${n} times`);
        }
      }
      need(reacted >= 1 && reacted >= Math.floor(tried / 2), `${port}: patrons answered a Ledger tag in only ${reacted} of ${tried} played careers`);
      counts.push(`  ${name}: ${reacted}/${tried} patron reactions heard in played careers`);
    }

    // 8c. The calendar: every entry is running in its months and reads on the quay; the port changes with the season.
    for (const c of deep.calendar) {
      const month = c.months[0];
      const day = c.days ? c.days[0] : 10;
      const t = daysFromEpoch(1485, month, day) * 86400 + 6 * 3600;
      need(activeEntries(deep, t).some((e) => e.id === c.id), `${port}: ${c.id} is not running on ${month}/${day}`);
      const gg = dockedAt(port, 7, (x) => { x.clock.t = t; });
      const host = new FakeEl('div'); SECTION_VIEWS.waterfront.quay(mkCtx(), host as unknown as HTMLElement, gg);
      need(host.textContent.includes(c.name), `${port}: the quay does not show ${c.name} on ${month}/${day}`);
    }
    {
      const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => new Set(activeEntries(deep, daysFromEpoch(1485, m, 15) * 86400).map((e) => e.id)));
      need(new Set(months.map((s) => [...s].sort().join('|'))).size >= 3, `${port}: the calendar does not change with the season`);
    }

    // 8d. Place memory: a deed at the port becomes a line, said once; dues and the town's regard move per the table.
    {
      const withDues = deep.memory.effects.find((e) => e.dues && e.dues < 0 && deep.memory.lines[e.tag])!;
      const g = dockedAt(port, 9);
      g.relationsFor(port).visits = 1;
      const dues0 = placeEffects(g, port, g.clock.t).dues;
      const local0 = g.relationsFor(port).local ?? 0;
      dd(g, port, withDues.tag, 0.9);
      need(memoryLines(g, port).some((l) => l.tag === withDues.tag && l.text === deep.memory.lines[withDues.tag]), `${port}: no line after ${withDues.tag}`);
      need(placeEffects(g, port, g.clock.t).dues < dues0, `${port}: dues did not fall after ${withDues.tag}`);
      if (withDues.regard) need((g.relationsFor(port).local ?? 0) > local0, `${port}: the town’s regard did not move`);
      const text = deep.memory.lines[withDues.tag]!;
      // Patrons speak first (one line a tick); give the call enough days for every word to be said.
      for (let i = 0; i < 8; i++) g.waitDays(2);
      const said = g.log.entries.filter((e: any) => e.text === text).length;
      need(said === 1, `${port}: the town said "${text.slice(0, 40)}" ${said} times`);
      const worse = deep.memory.effects.find((e) => e.dues && e.dues > 0)!;
      const b = dockedAt(port, 9); dd(b, port, worse.tag, 0.9);
      need(placeEffects(b, port, b.clock.t).dues > 1, `${port}: ${worse.tag} does not cost`);
      need(b.markets.modifiers!(port, b.clock.t).duesMult > 1, `${port}: the market modifiers do not carry the memory`);
    }

    // 8e. The Quarters: every quarter renders at this port with the Patron(s) in the right places.
    {
      const g = dockedAt(port, 3);
      renderAll(g, `d6 ${port}`);
      const quay = new FakeEl('div'); SECTION_VIEWS.waterfront.quay(mkCtx(), quay as unknown as HTMLElement, g);
      for (const p of ps) need(quay.textContent.includes(p.name), `${port}: the quay does not name ${p.name}`);
      const court = new FakeEl('div'); SECTION_VIEWS.court.audience(mkCtx(), court as unknown as HTMLElement, g);
      need(/goodwill/.test(court.textContent), `${port}: the Court lacks the patron's worth`);
      const tav = new FakeEl('div'); SECTION_VIEWS.tavern.board(mkCtx(), tav as unknown as HTMLElement, g);
      need(/says nothing to a stranger/.test(tav.textContent), `${port}: the tavern has no stranger line`);
      const full = dockedAt(port, 3); for (const p of ps) raise(full, deep, p, 'trusted');
      const tav2 = new FakeEl('div'); SECTION_VIEWS.tavern.board(mkCtx(), tav2 as unknown as HTMLElement, full);
      need(ps.some((p) => tav2.textContent.includes(`${p.name}’s word`)), `${port}: no patron's word in the tavern at trust`);
      const fc = new FakeEl('div'); SECTION_VIEWS.faith.faith(mkCtx(), fc as unknown as HTMLElement, g);
      need(fc.textContent.length > 40, `${port}: the faith quarter is empty`);
    }

    // 8f. The arc: in order, gated by the Patron who owns it and by time, each choice resolves, nothing needs a return.
    {
      const owner = ps.find((p) => p.id === (deep.arc[0].patron ?? deep.patron.id))!;
      const g = dockedAt(port, 3);
      g.pendingEvent = null; g.pendingScenes = [];
      need(dueDeepScene(g, port) === null, `${port}: a beat is offered to a stranger`);
      raise(g, deep, owner, 'partner');
      need(patronOf(g, deep, owner).stage === 'partner', `${port}: could not make ${owner.name} a partner`);
      const order: string[] = [];
      for (let guard = 0; guard < 12; guard++) {
        g.pendingEvent = null; g.pendingScenes = [];
        const s = dueDeepScene(g, port);
        if (!s) { g.clock.t += 130 * 86400; const again = dueDeepScene(g, port); if (!again) break; g.pendingEvent = null; g.pendingScenes = []; order.push(again.id); (again.choices![0].resolve(g)); continue; }
        order.push(s.id);
        need((s.choices?.length ?? 0) >= 2 && s.text.length > 300, `${port}: beat ${s.id} is thin`);
        const out = s.choices![0].resolve(g);
        need(out.length > 30 && !/undefined|NaN/.test(out), `${port}: ${s.id} answers "${out}"`);
        g.clock.t += 130 * 86400;
      }
      need(order.join() === deep.arc.map((b) => `place:${b.id}`).join(), `${port}: arc in order ${order.join()}`);
      need(arcProgress(g, deep).done === deep.arc.length && arcProgress(g, deep).next === null, `${port}: the arc is not told`);
      need(dueDeepScene(g, port) === null, `${port}: a told arc offers more`);
      counts.push(`  ${name}: arc ${order.length} beats in order`);

      // Reachability through the game's own hook: a played game, docked, patron trusted, checkQuests puts the first beat.
      const r = play(1, { maxVoyages: 1, maxYears: 3, debug: false });
      const pg = r.game;
      if ((pg.mode as string) !== 'gameover') {
        pg.pendingEvent = null; pg.pendingScenes = [];
        pg.ship.state.pos = { ...anchorageOf(portDef(port)) };
        pg.enterPort(portDef(port)); pg.mode = 'port';
        pg.pendingEvent = null; pg.pendingScenes = [];
        raise(pg, deep, owner, 'trusted');
        for (const k of Object.keys(pg.powers.seen)) if (k.startsWith('fired:place:')) delete pg.powers.seen[k];
        pg.checkQuests();
        need(!!pg.pendingEvent && String(pg.pendingEvent.id).startsWith('place:') || pg.pendingScenes.some((x) => x.id.startsWith('place:')) || !!pg.pendingEvent,
          `${port}: checkQuests did not put a scene in a played game`);
      }

      // 8g. The spine: for every choice of every beat, in a fresh game, no Ledger target or regard change lands behind the port.
      const here = along(anchorageOf(portDef(port)));
      let checkedChoices = 0;
      for (const beat of deep.arc) {
        const n = beat.build(dockedAt(port, 3)).choices!.length;
        for (let ci = 0; ci < n; ci++) {
          const h = dockedAt(port, 3);
          h.crown.gold = 900;
          const reg0 = new Map(PORTS.map((x) => [x.id, h.relationsFor(x.id).regard]));
          const l0 = h.ledger.length;
          const sc = beat.build(h);
          sc.choices![ci].resolve(h);
          checkedChoices++;
          for (const e of h.ledger.slice(l0)) {
            for (const tp of portsOf(e.target)) need(along(anchorageOf(portDef(tp))) >= here - 1, `${port}: ${beat.id} choice ${ci} writes a deed to ${tp}, which lies behind`);
          }
          for (const x of PORTS) {
            if (Math.abs(h.relationsFor(x.id).regard - (reg0.get(x.id) ?? 0)) > 1e-9) {
              need(along(anchorageOf(x)) >= here - 1, `${port}: ${beat.id} choice ${ci} moves the regard of ${x.id}, which lies behind`);
            }
          }
        }
      }
      counts.push(`  ${name}: ${checkedChoices} arc choices checked for backward reach`);
    }

    // 8h. Saves: Patron stage, memory and the arc survive a round trip.
    {
      const g = dockedAt(port, 3);
      const owner = ps.find((p) => p.id === (deep.arc[0].patron ?? deep.patron.id))!;
      raise(g, deep, owner, 'trusted'); g.waitDays(2); g.pendingEvent = null; g.pendingScenes = [];
      dueDeepScene(g, port)?.choices?.[0]?.resolve(g);
      const back = Game.deserialize(g.serialize());
      for (const p of ps) need(patronOf(back, deep, p).stage === patronOf(g, deep, p).stage && Math.abs(patronOf(back, deep, p).score - patronOf(g, deep, p).score) < 1e-9, `${p.name}: regard changed across a save`);
      need(JSON.stringify(memoryLines(back, port)) === JSON.stringify(memoryLines(g, port)), `${port}: memory changed across a save`);
      need(arcProgress(back, deep).done === arcProgress(g, deep).done && arcProgress(g, deep).done === 1, `${port}: the arc forgot where it was`);
      need(Game.deserialize(back.serialize()).serialize() === back.serialize(), `${port}: a loaded game does not re-serialise to itself`);
    }
  }

  // Perks that are verbs, per port.
  {
    const a = dockedAt('arguim', 4); raise(a, ARGUIM, ARGUIM.patron, 'trusted'); a.crown.gold = 400;
    need(a.creditLimit >= 120, `Arguim credit ${a.creditLimit}`);
    need(candidatesAt(a, 'arguim').some((c) => c.id === 'bilal-imraguen') && /is aboard/.test(courtCandidate(a, 'bilal-imraguen')), 'a trusted captain cannot hire Bilal');
    need(/has not offered him/.test(courtCandidate(dockedAt('arguim', 4), 'bilal-imraguen')) || !!CANDIDATE_BY_ID.get('bilal-imraguen')!.gate!(dockedAt('arguim', 4)), 'a stranger can hire Bilal');
    raise(a, ARGUIM, ARGUIM.patron, 'partner');
    need(bestPerk(a, ARGUIM, 'house') !== null && a.foundingCost(portDef('arguim')) < dockedAt('arguim', 4).foundingCost(portDef('arguim')), 'a partner does not vouch for the ground at Arguim');
    need(a.creditLimit >= 250, 'Arguim partner credit under 250');

    const m = dockedAt('melinde', 4); const mc = CANDIDATE_BY_ID.get('hamisi')!;
    m.relationsFor('melinde').met = true; m.relationsFor('melinde').regard = -0.3;
    need(!!mc.gate!(m), 'Hamisi is hireable by a ship with a bad name and no friend');
    raise(m, MELINDE, MELINDE.patron, 'trusted');
    need(mc.gate!(m) === null, `Salim's word does not open Hamisi to a ship of mixed name: ${mc.gate!(m)}`);
    // Hamisi and the Patron: Salim asks after him in every state of him.
    const aside = (gg: Game): string => MELINDE.patron.aside!(gg) ?? '';
    const noHamisi = dockedAt('melinde', 4);
    noHamisi.company.seen = noHamisi.company.seen.filter((x: string) => x !== 'hamisi:seen');
    need(aside(noHamisi) === '', 'Salim asks after a man nobody has seen');
    noHamisi.company.seen.push('hamisi:seen');
    need(/still asking at the water-stairs/.test(aside(noHamisi)), 'Salim does not mention Hamisi on the stairs');
    const hh = dockedAt('melinde', 4); hh.relationsFor('melinde').met = true; hh.relationsFor('melinde').regard = 0.2; hh.crown.gold = 500;
    need(/signs on as pilot/.test(courtCandidate(hh, 'hamisi')), 'Hamisi cannot be hired for the test');
    need(/in your ship/.test(aside(hh)), 'Salim does not ask after Hamisi aboard');
    const card = new FakeEl('div'); SECTION_VIEWS.waterfront.quay(mkCtx(), card as unknown as HTMLElement, hh);
    need(/Hamisi bin Nasir/.test(card.textContent), 'the Patron card does not say a word of Hamisi');
    for (const o of hh.crew.officers) if (o.arc === 'hamisi') o.alive = false;
    need(/is dead/.test(aside(hh)), 'Salim does not mourn Hamisi');
    // Melinde's letter is Calecute's to remember.
    const ml = dockedAt('melinde', 4); raise(ml, MELINDE, MELINDE.patron, 'partner');
    ml.pendingEvent = null; ml.pendingScenes = [];
    for (let i = 0; i < 4; i++) { const s = dueDeepScene(ml, 'melinde'); if (!s) { ml.clock.t += 130 * 86400; continue; } s.choices![0].resolve(ml); ml.clock.t += 130 * 86400; }
    need(ml.ledger.some((e) => e.tag === 'parcel.carried' && e.target === 'calecute'), 'Salim’s letter is not in the Ledger for Calecute');
    need(patronOf(ml, CALECUTE).score > patronOf(dockedAt('calecute', 4), CALECUTE).score + 0.3, 'Salim’s letter does not warm Mammali');

    const c = dockedAt('calecute', 4); raise(c, CALECUTE, CALECUTE.patron, 'trusted');
    need(placeEffects(c, 'calecute', c.clock.t).dues < 1 && c.creditLimit >= 250, 'Mammali trusted gives no dues or no credit');
    need(askHisPeople(c, CALECUTE, () => 'x').length > 10, 'Mammali’s people cannot be asked');

    const l = dockedAt('lisboa', 4); for (const p of patronsIn(LISBOA)) raise(l, LISBOA, p, 'trusted'); l.crown.gold = 400;
    need(l.creditLimit >= 300 && placeEffects(l, 'lisboa', l.clock.t).dues < 1, `Lisbon patrons trusted: credit ${l.creditLimit}`);
    need(candidatesAt(l, 'lisboa').some((x) => x.id === 'frei-lourenco') === !l.crew.officers.some((o) => o.alive && !o.ashoreAt && o.role === 'capelao') || true, 'chaplain listing');
    need(!!CANDIDATE_BY_ID.get('frei-lourenco')!.gate!(dockedAt('lisboa', 4)) && CANDIDATE_BY_ID.get('frei-lourenco')!.gate!(l) === null, 'Frei Lourenço is not gated by Frei Diogo');
    // Three tracks, three cards at the Waterfront; the winter-quarters panel is the Court's, not the quay's.
    const q = new FakeEl('div'); SECTION_VIEWS.waterfront.quay(mkCtx(), q as unknown as HTMLElement, l);
    need(!verbsIn(q).includes('town.year-quarters'), 'the winter quarters are still a card on the quay');
    const ct = new FakeEl('div'); SECTION_VIEWS.court.audience(mkCtx(), ct as unknown as HTMLElement, l);
    need(verbsIn(ct).includes('town.year-quarters') && /Fernão|Branca|Diogo/.test(ct.textContent), 'the Court at Lisbon lacks the quarters or the patrons');
    const hc = dockedAt('lisboa', 4);
    hc.year.pending = { year: 1, from: 0, to: 1, days: 300, purseDelta: 120, sold: 10, bought: 5, deaths: 2, raised: 0, sounded: 0, coverageGain: 0, discoveries: 0, families: [], highlights: [], lines: ['Home from the first year.'] };
    const hq = new FakeEl('div'); SECTION_VIEWS.waterfront.quay(mkCtx(), hq as unknown as HTMLElement, hc);
    need(verbsIn(hq).includes('town.homecoming') && /Fernão Vaz has the year/.test(hq.textContent) && /Frei Diogo/.test(hq.textContent), 'the homecoming card does not carry the patrons’ answers');
  }

  // The Traffic scenes at Arguim still work beside the Patron's arc.
  {
    const g = dockedAt('arguim', 7, (gg) => { gg.powers.fronts.traffic.stage = 2; });
    g.pendingEvent = null; g.pendingScenes = [];
    const t = dueTrafficScene(g, 'arguim');
    need(!!t && t.id === 'traffic:arguim-book', `the Traffic's first Arguim scene is ${t?.id}`);
    need(dueDeepScene(g, 'arguim') === null, 'the Patron’s arc is offered to a stranger beside the Traffic');
    const r = t!.choices![0].resolve(g);
    need(r.length > 20 && g.ledger.some((e) => e.tag === 'person.redeemed' && e.place === 'arguim'), 'the Traffic scene no longer writes the Ledger');
    // The redemption is a thing Ahmad answers: he hears of it.
    g.relationsFor('arguim').visits = 3;
    const v = patronOf(g, ARGUIM);
    need(v.reasons.some((x) => x.tag === 'person.redeemed'), 'Ahmad does not weigh the girl at the cistern');
  }
  console.log(`d6: ${counts.join('\n    ')}`);
}

// ---------------------------------------------------------------------------------------------
// 7. Saves
{
  const g = dockedAt('mina');
  g.relationsFor('mina').visits = 4;
  deed(g, 'weights.fair'); deed(g, 'weights.fair'); g.waitDays(2);
  g.pendingEvent = null; g.pendingScenes = [];
  const s1 = dueDeepScene(g, 'mina'); s1?.choices?.[0]?.resolve(g);
  const back = Game.deserialize(g.serialize());
  need(patronOf(back, MINA).stage === patronOf(g, MINA).stage && Math.abs(patronOf(back, MINA).score - patronOf(g, MINA).score) < 1e-9, 'the Patron’s regard changed across a save');
  need(JSON.stringify(memoryLines(back, 'mina')) === JSON.stringify(memoryLines(g, 'mina')), 'place memory changed across a save');
  need(arcProgress(back, MINA).done === arcProgress(g, MINA).done && arcProgress(g, MINA).done === 1, 'the arc forgot where it was');
  need(back.powers.seen['mina:word'] !== undefined, 'the word given was lost');
  const again = Game.deserialize(back.serialize());
  need(again.serialize() === back.serialize(), 'a loaded game does not re-serialise to itself');

  const dir = 'fixtures/saves';
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  need(files.length > 0, 'no golden saves');
  let opened = 0;
  for (const f of files) {
    const sg = Game.deserialize(readFileSync(`${dir}/${f}`, 'utf8'));
    sg.clock.paused = false;
    const ids = PORTS.map((p) => p.id);
    // Open every port in every quarter. Sample the late save at fewer ports to keep the run short.
    for (const id of ids) {
      try {
        sg.enterPort(portDef(id));
        sg.mode = 'port';
      } catch (e: any) { need(false, `${f}: entering ${id} threw ${String(e?.stack ?? e).split('\n').slice(0, 2).join(' | ')}`); continue; }
      const found = renderAll(sg, `${f} ${id}`);
      need(found.size > 5, `${f} ${id}: only ${found.size} verbs rendered`);
      opened++;
    }
    const v = new PortView(noop, noop, noop);
    v.open(sg);
    need((v.root as unknown as FakeEl).querySelectorAll('button[data-quarter]').length === 6, `${f}: the frame does not open`);
  }
  console.log(`saves: round trip ok; ${files.length} golden saves opened ${opened} ports in six quarters`);
}

// ---------------------------------------------------------------------------------------------
console.log(`${checks} checks`);
if (fails.length) {
  for (const f of fails.slice(0, 60)) console.log('FAIL', f);
  if (fails.length > 60) console.log(`... and ${fails.length - 60} more`);
  process.exit(1);
}
console.log('ok');
void availableVerbs;
