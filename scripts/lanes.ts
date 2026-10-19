/**
 * Falsifiers for the NPC lanes, contracts, the weigh-house loop, port dues and the rival's house (BUILD_PLAN D1, D2).
 *
 *   npx esbuild scripts/lanes.ts --bundle --platform=node --format=cjs --outfile=/tmp/lanes.cjs && node /tmp/lanes.cjs
 *
 * Ground truth is not the expression under test: goods are counted at the Markets door (every unit a lane takes from a
 * quay is counted as it leaves and again as it lands), dues are checked against the purse, the weigh-house against the
 * Ledger and the cargo in the hold, and a save is checked against a second, independent load of the same JSON.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { Game } from '../src/game/state';
import { Markets } from '../src/economy/market';
import { GOODS, good } from '../src/economy/goods';
import { isStaple } from '../src/economy/ladder';
import { CASA_SHARE, MONOPOLY, quoteTrend } from '../src/economy/trade';
import { PORTS, anchorageOf, portDef } from '../src/world/ports';
import { tickWorld, MONTH } from '../src/world/tick';
import { lanes, laneStateOf, laneTrend, laneModel } from '../src/world/lanes';
import { COOLDOWN, DAYS, LOW_MONTHS, PRICE_MULT, contractOffersAt } from '../src/world/contracts';
import { duesFor } from '../src/economy/dues';
import { FINE, FORFEIT, NOTICE, addHeat, totalHeat } from '../src/economy/contraband';
import { along } from '../src/progression/road';
import { ally, bindRival, buyOut, buyOutPrice, canAlly, frontierOf, houseOf, setFrontier } from '../src/progression/rivalHouse';
import { newRival } from '../src/progression/rival';
import { Rng } from '../src/core/rng';
import { makeHost } from './lib/worldHost';

let fails = 0;
const check = (name: string, ok: boolean, extra = ''): void => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };
const load = (f: string): any => JSON.parse(readFileSync(`fixtures/saves/${f}`, 'utf8'));
const slip = (q: number, avail: number) => Markets.slippage(q, avail);

// ---------------------------------------------------------------------------
// 1. The table
{
  const L = lanes();
  const trunks = L.filter((l) => l.trunk);
  check('about 150 directed lanes', L.length >= 120 && L.length <= 200, `${L.length}`);
  check('no lane carries more than 6 goods, none carries none', L.every((l) => l.goods.length >= 1 && l.goods.length <= 6));
  check('every good on a lane is made at its origin and wanted or short at its end', L.every((l) => l.goods.every((g) => (portDef(l.from).produces[g] ?? 0) > 0
    && ((portDef(l.to).wants[g] ?? 0) > 0 || (portDef(l.to).produces[g] ?? 0) > 0))));
  const has = (a: string, b: string) => trunks.some((l) => l.from === a && l.to === b);
  check('the five trunks run both ways', [['lisboa', 'mina'], ['quiloa', 'cambaia'], ['cambaia', 'calecute'], ['calecute', 'malaca'], ['adem', 'cambaia']].every(([a, b]) => has(a, b) && has(b, a)));
  const lm = trunks.find((l) => l.from === 'lisboa' && l.to === 'mina')!;
  check('Lisbon-Mina is 600 tons a year, 50 a month', Math.abs(lm.capT - 50) < 1e-9, `${lm.capT}`);
  check('two trade worlds, the Atlantic and the Indian Ocean (the Cape is a gap no NPC ship crosses), and no port without a lane but the uninhabited island', (() => {
    const parent = new Map<string, string>();
    const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
    for (const l of L) for (const p of [l.from, l.to]) if (!parent.has(p)) parent.set(p, p);
    for (const l of L) parent.set(find(l.from), find(l.to));
    const sizes = new Map<string, number>();
    for (const p of parent.keys()) sizes.set(find(p), (sizes.get(find(p)) ?? 0) + 1);
    const laneless = PORTS.filter((p) => !parent.has(p.id)).map((p) => p.id);
    return sizes.size <= 3 && [...sizes.values()].filter((x) => x >= 8).length >= 2 && laneless.length <= 1;
  })(), '');
}

// ---------------------------------------------------------------------------
// 2. Flows conserve goods: counted at the Markets door
{
  const h = makeHost(3, { rival: false });
  let out = 0, inn = 0, back = 0;
  const addStock = h.markets.addStock.bind(h.markets);
  const receive = h.markets.receive.bind(h.markets);
  let phase: 'off' | 'on' = 'off';
  let inside = false;
  h.markets.addStock = (p, g, u) => { const r = addStock(p, g, u); if (phase === 'on' && !inside) { if (u < 0) out += -r; else back += r; } return r; };
  h.markets.receive = (p, g, u) => { inside = true; const r = receive(p, g, u); inside = false; if (phase === 'on') inn += r; return r; };
  for (const p of PORTS) h.markets.refresh(p.id, h.worldT! + MONTH);
  h.worldT! += MONTH;
  phase = 'on';
  laneModel({ host: h, t: h.worldT!, months: 1 });
  phase = 'off';
  const moved = out - back;
  check('a month of lanes moves goods', moved > 50, `${moved.toFixed(0)} units`);
  check('what leaves the quays lands somewhere (units out less units handed back = units in)', Math.abs(moved - inn) < 1e-6, `${moved.toFixed(3)} vs ${inn.toFixed(3)}`);
  const st = laneStateOf(h);
  check('every port with a lane has a traffic reading', lanes().every((l) => st.traffic[l.from] !== undefined && st.traffic[l.to] !== undefined));
}

// ---------------------------------------------------------------------------
// 3. Determinism, and a long catch-up equals stepping
{
  const snap = (h: ReturnType<typeof makeHost>): string => JSON.stringify([h.markets.serialize(), h.lanes, h.ports, h.postings, h.rival?.house, h.worldT]);
  const a = makeHost(11), b = makeHost(11), c = makeHost(12);
  tickWorld(a, 18); tickWorld(b, 18); tickWorld(c, 18);
  check('same seed, same world', snap(a) === snap(b));
  check('another seed, another world', snap(a) !== snap(c));
  const s = makeHost(5), l = makeHost(5);
  tickWorld(s, 14);
  for (let i = 0; i < 14; i++) tickWorld(l, 1);
  check('fourteen months at once equal fourteen months stepped', snap(s) === snap(l));
}

// ---------------------------------------------------------------------------
// 4. A war closes the lanes at its ports (through marketModifiers) and they reopen; the trend arrows follow
{
  const h = makeHost(5, { rival: false });
  tickWorld(h, 3);
  const st = laneStateOf(h);
  const flowing = lanes().filter((l) => (st.flow[l.id] ?? 0) > 0);
  check('lanes carry value in a quiet month', flowing.length > 20, `${flowing.length} of ${lanes().length}`);
  // The trend: a quay that lanes drain shows a rising price, one they glut a falling one.
  let up = 0, down = 0, wrong = 0;
  for (const key of Object.keys(st.net)) {
    const [p, g] = key.split(':');
    const t = laneTrend(h, p, g);
    if (t === 1) up++; else if (t === -1) down++;
    if ((st.net[key] < 0 && t === -1) || (st.net[key] > 0 && t === 1)) wrong++;
  }
  check('trend arrows: some quays rising, some falling, none the wrong way', up > 0 && down > 0 && wrong === 0, `${up} up, ${down} down`);
  check('a quote with no earlier sheet takes the lane trend; one with a sheet takes the move', quoteTrend(undefined, 10, 12, 1) === 1
    && quoteTrend({ ask: 12, bid: 10, stock: 5, wanted: true, local: false }, 14, 16, 0) === 1
    && quoteTrend({ ask: 12, bid: 10, stock: 5, wanted: true, local: false }, 8, 10, 1) === -1
    && quoteTrend({ ask: 12, bid: 10, stock: 5, wanted: true, local: false }, 10.1, 12.1, 0) === 0);
}

// ---------------------------------------------------------------------------
// 5. The player's weight saturates a lane, and the lane cannot be farmed
{
  // The best staple route at month 0: a lane with real depth at both ends.
  const probe = makeHost(2, { rival: false });
  for (const p of PORTS) probe.markets.refresh(p.id, probe.worldT! + 400 * 86400);
  const t0 = probe.worldT! + 400 * 86400;
  let best: { a: string; b: string; g: string; profit: number } | null = null;
  const inLane = new Set(lanes().flatMap((l) => l.goods.map((g) => `${l.from}>${l.to}:${g}`)));
  for (const l of lanes()) for (const gid of l.goods) {
    const gd = good(gid);
    if (!isStaple(gd)) continue;
    const la = probe.markets.listings(l.from, t0, 0, 0).find((x) => x.goodId === gid), lb = probe.markets.listings(l.to, t0, 0, 0).find((x) => x.goodId === gid);
    if (!la || !lb || !la.local || lb.appetite < 30 || la.stock < 60) continue;
    const m = lb.bid - la.ask;
    if (m <= 0) continue;
    const profit = Math.min(la.stock, lb.appetite, 105 / gd.bulk) * m;
    if (!best || profit > best.profit) best = { a: l.from, b: l.to, g: gid, profit };
  }
  check('found a staple lane to work', !!best && inLane.has(`${best.a}>${best.b}:${best.g}`), best ? `${best.g} ${best.a}>${best.b}` : '');
  if (best) {
    const gd = good(best.g);
    // (a) The same month, with and without the player's weight on the quays: the lane carries less with him.
    const mk = (weight: number) => {
      const h = makeHost(2, { rival: false });
      for (const p of PORTS) h.markets.refresh(p.id, h.worldT! + MONTH);
      h.worldT! += MONTH;
      if (weight > 0) {
        h.markets.buy(best!.a, best!.g, weight);
        h.markets.sell(best!.b, best!.g, weight);
      }
      laneModel({ host: h, t: h.worldT!, months: 1 });
      return h;
    };
    const quiet = mk(0), busy = mk(60);
    const id = `${best.a}>${best.b}`;
    const fq = laneStateOf(quiet).flow[id] ?? 0, fb = laneStateOf(busy).flow[id] ?? 0;
    check('the player on both quays crowds the NPC ships out of the lane', fb < fq * 0.75, `${Math.round(fq)} cr a month without him, ${Math.round(fb)} with`);
    // (b) His selling moves the price against him.
    const h = makeHost(2, { rival: false });
    h.markets.refresh(best.b, h.worldT! + MONTH);
    const bidBefore = h.markets.listings(best.b, h.worldT! + MONTH, 0, 0).find((x) => x.goodId === best!.g)!.bid;
    h.markets.sell(best.b, best.g, 40);
    const bidAfter = h.markets.listings(best.b, h.worldT! + MONTH, 0, 0).find((x) => x.goodId === best!.g)!.bid;
    check('his sales move the price', bidAfter < bidBefore * 0.97, `${bidBefore.toFixed(2)} -> ${bidAfter.toFixed(2)}`);
    // (c) Fleet autopilot: n hulls working the one lane earn well under n times what one does, and a single hull
    // working it every month does not earn more in the sixth month than in the first.
    const run = (hulls: number, months: number): number[] => {
      const g2 = makeHost(2, { rival: false });
      tickWorld(g2, 1);
      const profits: number[] = [];
      for (let m = 0; m < months; m++) {
        let total = 0;
        for (let k = 0; k < hulls; k++) {
          const t = g2.worldT!;
          const la = g2.markets.listings(best!.a, t, 0, 0).find((x) => x.goodId === best!.g)!;
          const lb = g2.markets.listings(best!.b, t, 0, 0).find((x) => x.goodId === best!.g)!;
          const q = Math.floor(Math.min(105 / gd.bulk, la.stock, lb.appetite));
          if (q < 1) continue;
          const cost = q * la.ask * slip(q, la.stock);
          const rev = q * (lb.bid / slip(q, lb.appetite));
          g2.markets.buy(best!.a, best!.g, q);
          g2.markets.sell(best!.b, best!.g, q);
          total += rev - cost;
        }
        profits.push(total);
        tickWorld(g2, 1);
      }
      return profits;
    };
    const one = run(1, 6), six = run(6, 6);
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    check('six hulls on one lane earn less than four times one', sum(six) < 4 * sum(one), `one ${Math.round(sum(one))}, six ${Math.round(sum(six))}`);
    check('one hull every month does not grow richer on the lane', one[5] <= one[0] * 1.05, `month 1 ${Math.round(one[0])}, month 6 ${Math.round(one[5])}`);
  }
}

// ---------------------------------------------------------------------------
// 6. Prosperity: with traffic a port can be thriving, and it is not pumped
{
  let thriving = 0, runs = 0, struggling = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const h = makeHost(seed);
    tickWorld(h, 24);
    for (const p of PORTS) { runs++; const b = h.ports[p.id]?.band; if (b === 'thriving') thriving++; if (b === 'struggling') struggling++; }
  }
  check('ports reach thriving on traffic alone, and not all of them', thriving > runs * 0.1 && thriving < runs * 0.7, `${thriving} of ${runs}`);
  check('ports struggle only under the world\'s shocks, far less often than they thrive', struggling < thriving / 4, `${struggling} struggling`);
}

// ---------------------------------------------------------------------------
// 7. Contracts: a short quay posts, the captain signs upstream, delivers, is paid; or misses and pays
{
  const g = new Game(1);
  g.worldT = g.clock.t;
  g.markets.refresh('lisboa', g.clock.t);
  // Strip Mina of its cloth and drain it each month so that it stays under 30% for two months.
  const N = 'mina';
  const gid = Object.keys(portDef(N).produces).sort((a, b) => g.markets.baseOf(N, b) * good(b).lisbon - g.markets.baseOf(N, a) * good(a).lisbon)[0];
  const drain = () => { const left = g.markets.supply(N, gid).stock; if (left > 0) g.markets.buy(N, gid, left * 0.95); };
  drain();
  tickWorld(g, 1);
  check('a single short month posts nothing', g.postings.length === 0);
  drain(); tickWorld(g, 1);
  for (let i = 1; i < LOW_MONTHS; i++) { drain(); tickWorld(g, 1); }
  const post = g.postings.find((c) => c.toPort === N && c.goodId === gid);
  check(`a quay under 30% for ${LOW_MONTHS}+ months posts a contract`, !!post, `${g.postings.length} on the board`);
  if (post) {
    const ask = g.markets.listings(N, post.postedT!, 0, 0.3).find((l) => l.goodId === gid)!.ask;
    const mult = post.price! / ask;
    check('price 1.3-1.8 times the ask', mult >= PRICE_MULT[0] - 0.02 && mult <= PRICE_MULT[1] + 0.02, `${mult.toFixed(2)}x`);
    check('60-120 days', post.days! >= DAYS[0] && post.days! <= DAYS[1], `${post.days}`);
    check('the fee is the quantity at that price', Math.abs(post.fee - Math.round(post.quantity * post.price!)) <= 1);
    // Offered upstream on the road, and never from a place further on.
    const upstream = PORTS.filter((p) => (p.produces[gid] ?? 0) > 0 && p.id !== N && along(anchorageOf(p)) + 40 < along(anchorageOf(portDef(N)))).sort((a, b) => g.markets.baseOf(b.id, gid) - g.markets.baseOf(a.id, gid))[0];
    const downstream = PORTS.find((p) => (p.produces[gid] ?? 0) > 0 && p.id !== N && along(anchorageOf(p)) > along(anchorageOf(portDef(N))) + 40);
    const known = new Set(PORTS.map((p) => p.id));
    const sup = (p: string, q: string) => g.markets.supply(p, q);
    if (upstream) {
      g.markets.refresh(upstream.id, g.clock.t + 10 * 86400 * 30);
      const offers = contractOffersAt(g.postings, upstream, known, (p) => along(anchorageOf(p)), sup, g.clock.t);
      check('offered at a port behind it on the road', offers.some((o) => o.id === post.id), upstream.id);
    }
    if (downstream) {
      const offers = contractOffersAt(g.postings, downstream, known, (p) => along(anchorageOf(p)), sup, g.clock.t);
      check('never offered at a port past it (no reason to sail back)', !offers.some((o) => o.id === post.id), downstream.id);
    }
    check('no second post for the same quay and good while one is open', (() => {
      const n = g.postings.length; drain(); tickWorld(g, 1); return g.postings.filter((c) => c.toPort === N && c.goodId === gid).length === 1 && g.postings.length >= n - 1;
    })());

    // Sign it at a port it is offered at, carry the goods, deliver.
    const src = upstream ?? PORTS.find((p) => p.id === 'lisboa')!;
    g.dockedAt = src.id;
    g.ventureOffers = [{ ...post, fromPort: src.id }];
    const gold0 = g.crown.gold;
    const said = g.acceptVenture(post.id);
    const mine = g.contracts.find((c) => c.id === post.id)!;
    check('signing pays the advance and starts the clock; nothing is loaded', !!mine && mine.taken && !mine.loaded && g.crown.gold === gold0 + mine.advance && mine.dueBy > g.clock.t && /Signed/.test(said), said);
    check('the board no longer carries it', !g.postings.some((c) => c.id === post.id));
    check('a posted contract leaves no cargo consigned', g.consignedVentures.length === 0);
    // Arriving without the goods is not a failure.
    g.dockedAt = null;
    g.enterPort(portDef(N));
    check('arriving without the goods is a call too early, not a failure', !mine.failed && !mine.delivered);
    const stock0 = g.markets.supply(N, gid).stock;
    g.ship.addCargo(gid, mine.quantity, 1, 0.5);
    const gold1 = g.crown.gold;
    const dues = duesFor(portDef(N), g.ship.baseHull.tons, g.markets.modifiers?.(N, g.clock.t)?.duesMult ?? 1, g.relationsFor(N).regard);
    g.enterPort(portDef(N));
    check('delivered: paid the rest, goods off the ship, the quay restocked', mine.delivered && Math.abs(g.crown.gold - (gold1 + mine.fee - mine.advance - dues.dues - dues.present)) < 1.5 && g.ship.quantityOf(gid) < 0.01
      && g.markets.supply(N, gid).stock > stock0, `+${(g.crown.gold - gold1).toFixed(0)} cr`);
    check('the Ledger says contract.filled', g.ledger.some((e) => e.tag === 'contract.filled' && e.place === N));
    const opened = g.postings.filter((c) => c.toPort === N && c.goodId === gid).length;
    drain(); tickWorld(g, LOW_MONTHS);
    check(`the quay does not post the same good again for ${COOLDOWN} months`, g.postings.filter((c) => c.toPort === N && c.goodId === gid).length === opened);

    // A missed one: signed, out at sea, past its date.
    const second = { ...post, id: 'c-test-miss', taken: false, fromPort: src.id };
    g.ventureOffers = [second];
    g.acceptVenture(second.id);
    const late = g.contracts.find((c) => c.id === second.id)!;
    const gold2 = g.crown.gold, st2 = g.crown.standing;
    g.dockedAt = null;
    g.clock.t = late.dueBy + 86400;
    (g as any).checkVentures(0);
    check('missed: failed, the forfeit paid, standing down', late.failed && g.crown.gold === gold2 - late.penalty && g.crown.standing < st2 + 1e-9);
    check('the Ledger says contract.lapsed', g.ledger.some((e) => e.tag === 'contract.lapsed'));
  }
}

// ---------------------------------------------------------------------------
// 8. Ventures in a save become contracts, none dropped
{
  const d = load('05-venture.json');
  const oldActive = (d.ventures as any[]).filter((v) => !v.delivered && !v.failed);
  const g = Game.deserialize(JSON.stringify(d));
  const active = g.contracts.filter((c) => !c.delivered && !c.failed);
  check('the fixture has a charter in flight', oldActive.length >= 1, `${oldActive.length}`);
  check('every charter in the save is a contract, in flight or not', g.contracts.length === d.ventures.length && active.length === oldActive.length);
  check('the active ones keep their date, fee, advance, quantity and consigned cargo', oldActive.every((o) => {
    const c = g.contracts.find((x) => x.id === o.id)!;
    return c && c.kind === 'venture' && c.dueBy === o.dueBy && c.fee === o.fee && c.advance === o.advance && c.quantity === o.quantity && c.loaded === !!o.loaded && c.toPort === o.toPort;
  }));
  check('one log line says what happened', g.log.entries.filter((e: any) => /now written up as/.test(e.text)).length === 1);
  check('the old name still reads the same record', g.ventures === g.contracts && g.activeVentures.length === active.length && g.consignedVentures.length === oldActive.filter((o) => o.loaded).length);
  const g2 = Game.deserialize(g.serialize());
  check('a second load changes nothing and says nothing more', g2.contracts.length === g.contracts.length && g2.log.entries.filter((e: any) => /now written up as/.test(e.text)).length === g.log.entries.filter((e: any) => /now written up as/.test(e.text)).length);
  check('the save no longer carries the old list', !('ventures' in JSON.parse(g.serialize())) && 'contracts' in JSON.parse(g.serialize()));
  // The old path still pays: deliver the charter.
  const c = active[0];
  g.dockedAt = null;
  if (g.ship.quantityOf(c.goodId) < c.quantity) g.ship.addCargo(c.goodId, c.quantity - g.ship.quantityOf(c.goodId), 1, 0.5);
  const gold = g.crown.gold;
  g.enterPort(portDef(c.toPort));
  check('an old charter is delivered as it always was (fee in full, commission.delivered)', c.delivered && g.crown.gold >= gold + c.fee - 400 && g.ledger.some((e) => e.tag === 'commission.delivered'), `${c.fee}`);
}

// ---------------------------------------------------------------------------
// 9. The King's goods: runs, heat, the weigh-house, and no laundering by waiting
{
  const g = Game.deserialize(JSON.stringify(load('03-docked-cargo.json')));
  // A foreign port that wants pepper and does not grow it.
  const buyer = PORTS.find((p) => p.people !== 'portuguese' && (p.wants.pimenta ?? 0) > 0.5 && !(p.produces.pimenta > 0))!;
  g.dockedAt = buyer.id;
  g.markets.refresh(buyer.id, g.clock.t);
  g.ship.cargo = [];
  g.ship.addCargo('pimenta', 40, 3, 0.5);
  g.heat.origin.pimenta = 'cochim';
  const l = g.marketHere().find((x) => x.goodId === 'pimenta')!;
  const casaEquivalent = good('pimenta').lisbon * CASA_SHARE;
  check('pepper sold to a buyer who is not the King is a run', !!l.run);
  check(`and pays 1.4-2.2 times the Casa's price`, l.rawBid >= casaEquivalent * 1.39 && l.rawBid <= casaEquivalent * 2.21, `${(l.rawBid / casaEquivalent).toFixed(2)}x`);
  const h0 = totalHeat(g.heat);
  const r = g.tradeSell('pimenta', 40);
  check('the sale puts heat on the road it came by', r.ok && totalHeat(g.heat) > h0 && (g.heat.byOrigin.india ?? 0) > 0, `+${(totalHeat(g.heat) - h0).toFixed(1)} on ${Object.keys(g.heat.byOrigin).join(',')}`);
  // Under the notice line nothing happens at Lisbon.
  g.heat.byOrigin = { india: 2 };
  g.dockedAt = null;
  const gold0 = g.crown.gold;
  g.enterPort(portDef('lisboa'));
  check('under the notice line the weigh-house is silent', g.crown.gold >= gold0 - 1);
  // Past the fine line: a fine.
  const fine = (heat: number, over: (g2: Game) => void = () => {}) => {
    const g2 = Game.deserialize(JSON.stringify(load('03-docked-cargo.json')));
    g2.heat.byOrigin = { india: heat }; g2.heat.value = 4000;
    g2.ship.addCargo('pimenta', 10, 3, 0.5);
    g2.crown.gold = 5000;
    over(g2);
    g2.dockedAt = null;
    g2.enterPort(portDef('lisboa'));
    return g2;
  };
  const f1 = fine(FINE + 1);
  check('past the fine line: fined 20-60% of what was run, standing down, the Ledger says so', f1.crown.gold < 5000 && 5000 - f1.crown.gold >= 4000 * 0.2 - 1 && 5000 - f1.crown.gold <= 4000 * 0.62 + 1
    && f1.ledger.some((e) => e.tag === 'smuggle.caught'), `fined ${(5000 - f1.crown.gold).toFixed(0)}`);
  check('and the pepper aboard is not seized', f1.ship.quantityOf('pimenta') >= 10);
  const f2 = fine(FORFEIT + 1);
  check('past the forfeit line: the King\'s goods in the hold are taken as well', f2.ship.quantityOf('pimenta') === 0 && f2.crown.gold < 5000);
  check('the matter settled: heat is down by half or more', totalHeat(f2.heat) <= (FORFEIT + 1) * 0.5 + 1e-6 && totalHeat(f1.heat) <= (FINE + 1) * 0.5 + 1e-6);
  // Waiting does not cool it; a gift does.
  const w = Game.deserialize(JSON.stringify(load('03-docked-cargo.json')));
  w.heat.byOrigin = { india: 9 };
  w.worldT = w.clock.t;
  tickWorld(w, 120);
  check('ten years waited: the heat is what it was', Math.abs(totalHeat(w.heat) - 9) < 1e-6, `${totalHeat(w.heat)}`);
  w.noteDeed('gift.great', { target: 'calicut', magnitude: 0.8, note: 'A gift praised.' });
  const cooled = 9 - totalHeat(w.heat);
  check('a gift presented cools it (a point or two)', cooled > 0.9 && cooled <= 3.01, `${cooled.toFixed(2)}`);
  w.noteDeed('fact.sold', { target: 'cochim', magnitude: 0.3, note: 'Sold a sheet.' });
  w.noteDeed('parcel.carried', { target: 'portugal', magnitude: 0.3, note: 'A favour.' });
  w.noteDeed('gift.great', { target: 'calicut', magnitude: 1, note: 'Another.' });
  check('and no more than three points a month can be had that way', 9 - totalHeat(w.heat) <= 3.01, `${(9 - totalHeat(w.heat)).toFixed(2)}`);
  check('the heat is not on the clock: a month later the window is open again', (() => {
    w.clock.t += 31 * 86400;
    const before = totalHeat(w.heat);
    w.noteDeed('promise.kept', { target: 'calicut', magnitude: 0.6, note: 'Kept my word.' });
    return totalHeat(w.heat) < before;
  })());
  void NOTICE; void addHeat;
}

// ---------------------------------------------------------------------------
// 10. Port dues
{
  const g = Game.deserialize(JSON.stringify(load('03-docked-cargo.json')));
  const foreign = PORTS.find((p) => p.people === 'castilian' || (p.people !== 'portuguese' && portDef(p.id).size === 'town'))!;
  g.dockedAt = null;
  g.crown.gold = 3000;
  const expect = duesFor(foreign, g.ship.baseHull.tons, g.markets.modifiers?.(foreign.id, g.clock.t)?.duesMult ?? 1, g.relationsFor(foreign.id).regard);
  g.enterPort(foreign);
  const paid = 3000 - g.crown.gold;
  check('a foreign quay charges dues by the hull\'s tonnage', expect.dues > 0 && Math.abs(paid - (expect.dues + expect.present)) <= 1, `${paid} (expected ${expect.dues} + ${expect.present})`);
  check('dues are a book entry and a log line', g.trade.books.some((b) => b.entries.some((e) => e.kind === 'dues')) && g.log.entries.some((e: any) => /Port dues at/.test(e.text)));
  const g2 = Game.deserialize(JSON.stringify(load('03-docked-cargo.json')));
  g2.dockedAt = null; g2.crown.gold = 3000;
  g2.enterPort(portDef('lagos'));
  check('the King\'s own quays charge nothing', g2.crown.gold === 3000);
  const g3 = Game.deserialize(JSON.stringify(load('03-docked-cargo.json')));
  g3.dockedAt = null; g3.crown.gold = 5;
  g3.enterPort(foreign);
  check('an empty purse pays what it holds and goes no lower', g3.crown.gold >= 0);
}

// ---------------------------------------------------------------------------
// 11. The rival's house
{
  // He is felt in the prices: the same world, with and without him.
  const a = makeHost(8), b = makeHost(8, { rival: false });
  tickWorld(a, 12); tickWorld(b, 12);
  let cells = 0, moved = 0, worst = 0, where = '';
  for (const p of PORTS) {
    const la = new Map(a.markets.listings(p.id, a.worldT!, 0, 0).map((l) => [l.goodId, l]));
    for (const lb of b.markets.listings(p.id, b.worldT!, 0, 0)) {
      const x = la.get(lb.goodId);
      if (!x) continue;
      cells++;
      const d = Math.max(Math.abs(x.ask / lb.ask - 1), Math.abs(x.bid / lb.bid - 1));
      if (d > 0.03) moved++;
      if (d > worst) { worst = d; where = `${p.id}:${lb.goodId}`; }
    }
  }
  check('the rival measurably moves at least one price', moved >= 1, `${moved} of ${cells} cells over 3%, the worst ${(worst * 100).toFixed(0)}% at ${where}`);
  const house = houseOf(a.rival!);
  check('his house trades (capital grows, hulls 1-3, voyages in flight) and is not unbounded', house.profit > 0 && house.hulls >= 1 && house.hulls <= 3 && house.capital < 60000, `capital ${Math.round(house.capital)}, ${house.hulls} hulls`);

  // The frontier is a reading, not a counter.
  const r = newRival(new Rng(4));
  check('the frontier starts at 6 south and is not an own data property', frontierOf(r) === -6 && r.frontierLat === -6 && Object.getOwnPropertyDescriptor(r, 'frontierLat')!.enumerable === false);
  r.frontierLat -= 2.5;
  check('writing to it records a voyage', r.frontierLat === -8.5 && houseOf(r).explored.length === 1);
  r.frontierLat = -3;
  check('a set-back strikes the voyages beyond it out', r.frontierLat === -6 && houseOf(r).explored.length === 0);
  setFrontier(r, -12);
  check('it does not travel in a save as a number', !('frontierLat' in JSON.parse(JSON.stringify(r))) && JSON.parse(JSON.stringify(r)).house.explored.length === 1);
  const legacy = JSON.parse(JSON.stringify({ ...r, frontierLat: -15, house: undefined }));
  bindRival(legacy);
  check('a legacy save\'s number becomes the first voyage of the house', legacy.frontierLat === -15 && legacy.house.explored.length === 1 && !Object.getOwnPropertyDescriptor(legacy, 'frontierLat')!.enumerable);

  // Bought out, allied.
  const c = makeHost(9);
  tickWorld(c, 6);
  const price = buyOutPrice(c.rival!);
  check('the Casa\'s price is dear: more than the house holds', price > houseOf(c.rival!).capital);
  buyOut(c.rival!);
  const cap = houseOf(c.rival!).capital;
  tickWorld(c, 6);
  check('bought out: his house trades no more', houseOf(c.rival!).bought === true && houseOf(c.rival!).voyages.length === 0 && houseOf(c.rival!).capital === cap);
  const d = makeHost(9);
  check('an understanding is possible with a man who does not hate you', canAlly(d.rival!));
  ally(d.rival!);
  check('and once made cannot be made twice', !canAlly(d.rival!) && d.rival!.compact === true);
}

// ---------------------------------------------------------------------------
// 12. Saves: a round trip, and every golden save steps two years of lanes
{
  const g = new Game(21);
  g.worldT = g.clock.t;
  tickWorld(g, 8);
  g.heat.byOrigin = { guinea: 5 };
  g.heat.origin.ouro = 'mina';
  const gold = g.postings.length;
  const json = g.serialize();
  const g2 = Game.deserialize(json);
  check('lane memory survives', JSON.stringify(g2.lanes) === JSON.stringify(g.lanes) && Object.keys(g.lanes!.flow).length > 50);
  check('heat survives', JSON.stringify(g2.heat) === JSON.stringify(g.heat));
  check('the board survives', JSON.stringify(g2.postings) === JSON.stringify(g.postings) && g2.postings.length === gold);
  check('the rival\'s house survives and the frontier reads the same', JSON.stringify(houseOf(g2.rival)) === JSON.stringify(houseOf(g.rival)) && g2.rival.frontierLat === g.rival.frontierLat);
  check('the market volume record survives', JSON.stringify(g2.markets.serialize()) === JSON.stringify(g.markets.serialize()));
  check('and the world goes on from a loaded game as it would from the original', (() => {
    tickWorld(g, 3); tickWorld(g2, 3);
    return JSON.stringify(g.lanes) === JSON.stringify(g2.lanes) && JSON.stringify(g.markets.serialize()) === JSON.stringify(g2.markets.serialize());
  })());

  for (const f of readdirSync('fixtures/saves').filter((x) => x.endsWith('.json')).sort()) {
    const gg = Game.deserialize(JSON.stringify(load(f)));
    gg.worldT ??= gg.clock.t;
    let ok = true, why = '';
    try {
      tickWorld(gg, 24);
      for (const p of PORTS) for (const l of gg.markets.listings(p.id, gg.worldT!, 0, 0)) {
        if (!Number.isFinite(l.ask) || !Number.isFinite(l.bid) || l.ask <= 0 || l.bid <= 0) { ok = false; why = `${p.id}:${l.goodId} price ${l.ask}/${l.bid}`; }
        if (l.local && l.stock < 0) { ok = false; why = `${p.id}:${l.goodId} stock ${l.stock}`; }
      }
      const again = Game.deserialize(gg.serialize());
      if (JSON.stringify(again.lanes) !== JSON.stringify(gg.lanes)) { ok = false; why = 'lane state changed in a round trip'; }
      if (again.contracts.length !== gg.contracts.length) { ok = false; why = 'contracts changed in a round trip'; }
    } catch (e) { ok = false; why = String(e); }
    check(`golden save ${f}: two years of lanes, still sane, round-trips`, ok, why);
  }
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
void GOODS; void MONOPOLY;
