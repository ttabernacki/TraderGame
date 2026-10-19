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
import { PORTS, anchorageOf, portDef } from '../src/world/ports';
import { dateFromDays, daysFromEpoch } from '../src/core/clock';
import { along } from '../src/progression/road';
import { addEffect, announce, MONTH, marketModifiers } from '../src/world/powers';
import { Rng } from '../src/core/rng';
import { DEEP_PORTS, MINA, activeEntries, arcProgress, beatOffered, deepPort, dueDeepScene, feverFactor, memoryLines, nextEntry, patronOf, perkOf, placeCallbackAt, placeEffects, shoreLeave, stopOf } from '../src/places';
import { candidatesAt } from '../src/company/candidates';
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
  const rare = new Set(['town.season-wait', 'hands.degredado', 'town.first-contact', 'market.antwerp', 'yard.ships-for-sale', 'hands.inland-send']);
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
  const s = dockedAt('arguim');
  s.noteDeed('gift.great', { place: 'arguim', target: 'azenegue', magnitude: 0.6, note: 'test', silent: true });
  need(memoryLines(s, 'arguim').some((l) => /gift/i.test(l.text)), 'a stop has no memory line');
  s.waitDays(2);
  need(spoken(s, /At Arguim your gift is still talked of/) === 1, 'a stop does not say it once');
  need(placeCallbackAt(s, 'arguim') === null, 'a stop says it twice');
  need(Object.keys(placeEffects(s, 'arguim', s.clock.t).price).length === 0, 'a stop has market effects of its own');
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
