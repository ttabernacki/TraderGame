/**
 * Falsifier for the Powers engine, the rumour mill, marketModifiers and the Traffic (BUILD_PLAN C2, stage 1).
 *   npx esbuild scripts/powers.ts --bundle --platform=node --format=cjs --outfile=/tmp/powers.cjs && node /tmp/powers.cjs [seeds=200] [years=20]
 *
 * Ground truth, not the expression under test: the tables are checked against the Ledger vocabulary; the Fronts are checked
 * against what a random player does to them over twenty years; the "forward only" test uses road.ts `along()`, which the
 * scenes do not use; identity is checked against the Markets a harness builds without the hook at all.
 */
import { Game } from '../src/game/state';
import { Rng } from '../src/core/rng';
import { GOODS } from '../src/economy/goods';
import { Markets } from '../src/economy/market';
import { PORTS, anchorageOf, portDef } from '../src/world/ports';
import { MONTH as WMONTH, tickWorld, tickWorldDue } from '../src/world/tick';
import { ALL_TAGS, isTag } from '../src/ledger/tags';
import { knownFacts } from '../src/knowledge/information';
import { checkFact } from '../src/knowledge/informers';
import { along, TRUNK } from '../src/progression/road';
import { HISTORY } from '../src/progression/chronicle';
import { TRAFFIC_SCENES, dueTrafficScene, sceneOffered } from '../src/progression/trafficScenes';
import { FRONT_SCENES, dueFrontScene } from '../src/progression/frontScenes';
import { tickLines, canFundLine, openFundedLine, closeLine } from '../src/progression/network';
import { daysFromEpoch } from '../src/core/clock';
import { PATRON_IDS, choosePatron, eventsOf, favouriteEvents, patronOffers, reignAt, ruaNovaTerms, tickPatrons, type PatronId } from '../src/identity';
import { ERA, MACHINES, goldFever, machinePhase, racePace, reaches, relay } from '../src/world/powers';
import { POWER_SCENES, duePowerScene, powerSceneOffered } from '../src/progression/powerScenes';
import { CONDUCT, ruleReading } from '../src/world/powers/rule';
import { lanesAt, laneStateOf } from '../src/world/lanes';
import { activeEffects } from '../src/world/powers';
import {
  ATTITUDES, FRONTS, FRONT_DELTAS, FRONT_IDS, IDENTITY, type FrontId, POWERS, POWER_IDS, READERS, SCHEDULE,
  addEffect, arriveAt, declaredReaders, foldEntry, hops, marketModifiers, migratePowers, newPowers, pointsOf, seedRelations,
  setHistorySource, shockTime, type PowersHost,
} from '../src/world/powers';
import type { Entry } from '../src/ledger/ledger';
import { makeHost } from './lib/worldHost';

setHistorySource(() => HISTORY);
const SEEDS = Number(process.argv[2] ?? 200);
const YEARS = Number(process.argv[3] ?? 20);
let fails = 0;
const check = (name: string, ok: boolean, extra = ''): void => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!ok) fails++; };
const DAY = 86400;

const entry = (tag: string, over: Partial<Entry> = {}): Entry => ({
  t: 0, place: '', tag: tag as Entry['tag'], actors: ['captain'], target: '', magnitude: 0.5, witnesses: [], note: '', ...over,
});

// ---- 1. The tables ------------------------------------------------------------------------------------
{
  check('front-delta table is of the order of eighty rows', FRONT_DELTAS.length >= 55 && FRONT_DELTAS.length <= 95, `${FRONT_DELTAS.length} rows`);
  check('attitude table is data of the same order', ATTITUDES.length >= 40, `${ATTITUDES.length} rows`);
  const badTag = [...FRONT_DELTAS, ...ATTITUDES].filter((r) => !isTag(r.tag)).map((r) => r.tag);
  check('every row names a real Ledger tag', badTag.length === 0, badTag.join(','));
  const declared = new Set(declaredReaders());
  const badReader = [...FRONT_DELTAS, ...ATTITUDES].filter((r) => !(r.reader in READERS) || !declared.has(r.reader)).map((r) => `${r.tag}:${r.reader}`);
  check('every row cites a reader that is registered where it lives', badReader.length === 0, badReader.slice(0, 5).join(' '));
  const unused = Object.keys(READERS).filter((r) => ![...FRONT_DELTAS, ...ATTITUDES].some((x) => x.reader === r));
  check('every reader is cited by some row', unused.length === 0, unused.join(','));

  // Each row, applied alone, moves what it says it moves (and the one row that must not, does not).
  const dead: string[] = [];
  for (const r of FRONT_DELTAS) {
    const st = newPowers();
    st.fronts[r.front].offset = 0;
    const place = r.where?.[0] ?? '';
    const target = r.about?.[0] ?? r.where?.[0] ?? '';
    const out = foldEntry(st, entry(r.tag, { place, target, magnitude: 1 }));
    const moved = out.fronts[r.front] ?? 0;
    if (r.delta === 0 ? moved !== 0 : Math.sign(moved) !== Math.sign(r.delta)) dead.push(`${r.tag}>${r.front}(${moved})`);
  }
  check('every front row moves its front by its sign (redeeming moves nothing)', dead.length === 0, dead.slice(0, 6).join(' '));
  const deadA: string[] = [];
  for (const r of ATTITUDES) {
    const st = newPowers();
    const target = r.power === 'target' ? 'kongo' : r.power;
    const out = foldEntry(st, entry(r.tag, { target, place: '', magnitude: 1 }));
    const moved = r.power === 'target' ? out.powers.kongo ?? 0 : out.powers[r.power] ?? 0;
    if (Math.sign(moved) !== Math.sign(r.w)) deadA.push(`${r.tag}>${r.power}`);
  }
  check('every attitude row moves its Power', deadA.length === 0, deadA.slice(0, 6).join(' '));
  const tr = (t: string) => FRONT_DELTAS.find((r) => r.tag === t && r.front === 'traffic')!;
  check('the Traffic numbers are the plan’s', tr('traffic.carried').delta === 0.1 && tr('traffic.refused').delta === -0.05 && tr('hearing.contested').delta === -0.15 && tr('person.redeemed').delta === 0);
  check('the Traffic is not a good', !GOODS.some((g) => /escrav|slave|captiv|pessoa|people|peca|traffic/i.test(g.id + g.name + g.english)));
  const fxGoods = new Set<string>();
  for (const f of FRONT_IDS) for (const e of FRONTS[f].effects) for (const m of [e.price, e.stock, e.appetite]) for (const k of Object.keys(m ?? {})) fxGoods.add(k);
  check('stage effects name only real goods', [...fxGoods].every((g) => GOODS.some((x) => x.id === g)));
  check('all six Fronts defined, and all six tick (the Court was dormant before E3)', FRONT_IDS.length === 6 && FRONT_IDS.filter((f) => FRONTS[f].ticks).length === 6);
  check('thirteen Powers; every one but the Crown moves', POWERS.length === 13 && POWERS.filter((p) => !p.ticks).map((p) => p.id).join() === 'crown');
  check('Kilwa, Mombaça and Melinde are three Powers, and Gujarat is its own', ['kilwa', 'mombasa', 'melinde', 'gujarat'].every((id) => POWERS.some((p) => p.id === id)));
  const rel = seedRelations();
  check('relations are seeded from allies and feuds', (rel.mombasa.melinde ?? 0) < 0 && (rel.kilwa.mombasa ?? 0) > 0 && (rel.gujarat.calicut ?? 0) > 0 && (rel.calicut.cochin ?? 0) < 0 && (rel.aden?.calicut ?? 0) === 0, `mombasa-melinde ${rel.mombasa.melinde} gujarat-calicut ${rel.gujarat.calicut}`);
  const noDate = SCHEDULE.filter((s) => shockTime(s.id) === null).map((s) => s.id);
  check('every dated shock resolves a date (history ones from chronicle HISTORY)', noDate.length === 0, noDate.join(','));
  check('every dated shock carries a source note', SCHEDULE.every((s) => s.source.length > 20));
}

// ---- 2. Two hundred seeds, twenty years, a random player ------------------------------------------------------
const POOL = ALL_TAGS.filter((t) => FRONT_DELTAS.some((r) => r.tag === t) || ATTITUDES.some((r) => r.tag === t));
const TARGETS = ['kongo', 'eguafo', 'castile', 'kilwa', 'calicut', 'portugal', 'malindi', 'mpinda', 'mina', 'arguim', 'benin', 'mombasa', 'cochin', 'gujarat', 'aden', 'kolathiri', 'melinde'];
const PLACES = ['', 'arguim', 'mina', 'mpinda', 'lisboa', 'melinde', 'calecute', 'axim', 'quiloa', 'mombaca', 'cochim', 'cananor'];
interface Tel {
  /** Wars begun, months with the lane shut, and whether the lane sim carried goods through the port again afterwards. */
  sw: { wars: number; shut: number; zeroFlowShut: number; flowAfter: boolean; starts: number[] };
  mb: { wars: number; shut: number; zeroFlowShut: number; flowAfter: boolean; starts: number[] };
  staleIntoWar: number;
}
interface Run { host: PowersHost; seen: number; wrong: number; ledger: Entry[]; tel: Tel; peak: Record<FrontId, number> }
type Policy = 'random' | 'carry' | 'refuse' | 'stop' | 'spare' | 'press';
const flowAt = (h: PowersHost, port: string): number => lanesAt(port).reduce((sum, l) => sum + (laneStateOf(h).flow[l.id] ?? 0), 0);
function playSeed(seed: number, years: number, policy: Policy): Run {
  const h = makeHost(seed) as PowersHost;
  h.powers = newPowers();
  h.ledger = [];
  // The game wires this in state.ts; the lane sim reads the Powers through it.
  h.markets.modifiers = (p, t) => marketModifiers(p, t, h.powers);
  const rng = new Rng(seed * 7919 + 13);
  let seen = 0, wrong = 0;
  const tel: Tel = {
    sw: { wars: 0, shut: 0, zeroFlowShut: 0, flowAfter: false, starts: [] },
    mb: { wars: 0, shut: 0, zeroFlowShut: 0, flowAfter: false, starts: [] },
    staleIntoWar: 0,
  };
  const was = { sw: false, mb: false };
  const peak = { gold: 1, traffic: 1, claim: 1, crescent: 1, rule: 1, court: 1 } as Record<FrontId, number>;
  for (let m = 0; m < years * 12; m++) {
    tickWorld(h, 1);
    const t = h.worldT!;
    const st = h.powers!;
    for (const f of FRONT_IDS) peak[f] = Math.max(peak[f], st.fronts[f].stage);
    // The wars, and what the lane sim does at the shut quays: Mombaça-Melinde at Mombaça, Calicut-Cochim at Cochim.
    for (const [k, power, port] of [['sw', 'mombasa', 'mombaca'], ['mb', 'calicut', 'cochim']] as const) {
      const on = activeEffects(st, t).some((e) => e.power === power && e.kind === 'war');
      const x = tel[k];
      if (on && !was[k]) { x.wars++; x.starts.push(m); }
      // The first month of a war is the month the lane pass ran before the war was declared; count from the second.
      if (on && was[k]) {
        x.shut++;
        if (marketModifiers(port, t, st).laneClosed && flowAt(h, port) === 0) x.zeroFlowShut++;
      } else if (!on && x.wars > 0 && flowAt(h, port) > 0) x.flowAfter = true;
      was[k] = on;
    }
    if (policy === 'press') {
      // The hostile captain of the Gold, the Claim and the Crescent: shaded scales and a broken word on the beach, stones raised and sheets sold, ships stopped in the east.
      h.ledger.push(entry('weights.false', { t, place: 'mina', target: 'eguafo', magnitude: 1 }));
      h.ledger.push(entry('promise.broken', { t, place: 'mina', target: 'eguafo', magnitude: 1 }));
      h.ledger.push(entry('claim.made', { t, place: 'lisboa', target: 'mpinda', magnitude: 1 }));
      h.ledger.push(entry('chart.sold', { t, place: 'lisboa', target: 'castile', magnitude: 1 }));
      h.ledger.push(entry('ship.stopped', { t, place: 'calecute', target: 'calicut', magnitude: 1 }));
    } else if (policy === 'stop' || policy === 'spare') {
      // Act IV, spring 1498 to autumn 1501: every few months, at Calecute and Kilwa, the same conduct.
      const y = 1482 + 6.5 / 12 + m / 12;
      if (y >= 1498.3 && y < 1501.8 && m % 3 === 0) {
        const place = (m / 3) % 2 === 0 ? 'calecute' : 'quiloa';
        const target = place === 'calecute' ? 'calicut' : 'kilwa';
        if (policy === 'stop') h.ledger.push(entry('ship.stopped', { t, place, target, magnitude: 0.6 }));
        else { h.ledger.push(entry('ship.spared', { t, place, target, magnitude: 0.5 })); h.ledger.push(entry('pass.granted', { t, place, target, magnitude: 0.5 })); }
      }
    } else if (rng.chance(0.5)) {
      // a random captain: a few deeds a year, and a call at some port every month
      const tag = policy === 'carry' && rng.chance(0.6) ? 'traffic.carried' : policy === 'refuse' && rng.chance(0.6) ? 'hearing.contested' : rng.pick(POOL);
      h.ledger.push(entry(tag, { t, place: rng.pick(PLACES), target: rng.pick(TARGETS), magnitude: rng.range(0.2, 1) }));
    }
    const port = rng.pick(['arguim', 'mina', 'mpinda', 'benguela', 'lagos', 'funchal', 'lisboa', 'mocambique', 'melinde', 'calecute', 'cochim', 'quiloa', 'mombaca']);
    const a = arriveAt(h, port, t);
    seen += a.heard.length;
    wrong += a.settled.filter((r) => r.settled === 'not borne out').length;
    // A tale that was true once, heard after it stopped being so, about a quay that is shut now.
    for (const { rumour: r } of a.heard) {
      const id = /^effect:(\d+)$/.exec(r.event)?.[1];
      if (r.truth !== 'stale' || !id) continue;
      const e = st.effects.find((x) => x.id === Number(id));
      if (e && (e.kind === 'war' || e.kind === 'embargo' || e.kind === 'blockade') && e.start <= t && t < e.end && marketModifiers(r.place, t, st).laneClosed) tel.staleIntoWar++;
    }
  }
  return { host: h, seen, wrong, ledger: h.ledger, tel, peak };
}
{
  const t0 = Date.now();
  const endStage: Record<string, number[]> = { traffic: [], gold: [], claim: [], crescent: [], rule: [], court: [] };
  const swSeeds: number[] = [], mbSeeds: number[] = [], swStarts = new Set<number>(), mbStarts = new Set<number>();
  let swReopen = 0, mbReopen = 0, swZero = 0, mbZero = 0, swShut = 0, mbShut = 0, staleWar = 0, staleWarSeeds = 0, powerMoves = 0;
  let kongoMoves = 0, kongoSeeds = 0, rumours = 0, unresolved = 0, wrongSeeds = 0, staleOrFalse = 0, heardTotal = 0;
  const kinds = new Map<string, number>();
  const offsetBreach: string[] = [];
  for (let s = 1; s <= SEEDS; s++) {
    const run = playSeed(s, YEARS, 'random');
    const st = run.host.powers!;
    for (const f of ['traffic', 'gold', 'claim', 'crescent', 'rule', 'court'] as const) endStage[f].push(st.fronts[f].stage);
    const tl = run.tel;
    if (tl.sw.wars > 0) swSeeds.push(s);
    if (tl.mb.wars > 0) mbSeeds.push(s);
    tl.sw.starts.forEach((m) => swStarts.add(m)); tl.mb.starts.forEach((m) => mbStarts.add(m));
    if (tl.sw.flowAfter) swReopen++;
    if (tl.mb.flowAfter) mbReopen++;
    swZero += tl.sw.zeroFlowShut; mbZero += tl.mb.zeroFlowShut; swShut += tl.sw.shut; mbShut += tl.mb.shut;
    staleWar += tl.staleIntoWar; if (tl.staleIntoWar > 0) staleWarSeeds++;
    for (const id of ['kilwa', 'mombasa', 'melinde', 'calicut', 'cochin', 'gujarat', 'mamluk'] as const) powerMoves += st.powers[id].moves.length;
    kongoMoves += st.powers.kongo.moves.length;
    if (st.powers.kongo.moves.length >= 1) kongoSeeds++;
    for (const mv of st.powers.kongo.moves) kinds.set(mv.kind, (kinds.get(mv.kind) ?? 0) + 1);
    rumours += st.rumours.length;
    heardTotal += run.seen;
    if (run.wrong > 0) wrongSeeds++;
    staleOrFalse += st.rumours.filter((r) => r.truth !== 'true').length;
    for (const f of FRONT_IDS) {
      const o = st.fronts[f].offset;
      if (o < FRONTS[f].offsetMin - 1e-9 || o > FRONTS[f].offsetMax + 1e-9) offsetBreach.push(`${f}@${s}`);
    }
    // let the world run on for three more years with nobody in it: every rumour settles to what it was
    const tPlayed = run.host.worldT!;
    tickWorld(run.host, 36);
    unresolved += run.host.powers!.rumours.filter((r) => r.born < tPlayed && r.resolved === undefined).length;
  }
  const share = (f: string, pred: (n: number) => boolean): number => endStage[f].filter(pred).length / SEEDS;
  console.log(`  ${SEEDS} seeds x ${YEARS} years in ${((Date.now() - t0) / 1000).toFixed(1)} s; traffic end stages ${[1, 2, 3, 4].map((k) => `${k}:${endStage.traffic.filter((x) => x === k).length}`).join(' ')}; gold ${[1, 2, 3, 4].map((k) => `${k}:${endStage.gold.filter((x) => x === k).length}`).join(' ')}; court ${[1, 2, 3, 4].map((k) => `${k}:${endStage.court.filter((x) => x === k).length}`).join(' ')}`);
  console.log(`  Kongo: ${(kongoMoves / SEEDS).toFixed(1)} moves a run (${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')}); ${rumours} rumours made, ${heardTotal} heard`);
  console.log(`  claim ${[1, 2, 3, 4].map((k) => `${k}:${endStage.claim.filter((x) => x === k).length}`).join(' ')}; crescent ${[1, 2, 3, 4].map((k) => `${k}:${endStage.crescent.filter((x) => x === k).length}`).join(' ')}; rule ${[1, 2, 3, 4].map((k) => `${k}:${endStage.rule.filter((x) => x === k).length}`).join(' ')}`);
  console.log(`  Swahili war in ${swSeeds.length}/${SEEDS} seeds (${swStarts.size} distinct start months), Malabar war in ${mbSeeds.length}/${SEEDS} (${mbStarts.size}); ${(powerMoves / SEEDS).toFixed(1)} moves a run across the seven ticking courts`);
  for (const f of ['traffic', 'gold', 'claim', 'crescent', 'rule', 'court']) check(`${f}: not pinned at an extreme (stage 1 or 4) in more than 80% of seeds`, share(f, (n) => n === 1 || n === 4) <= 0.8, `${(share(f, (n) => n === 1 || n === 4) * 100).toFixed(0)}% at an extreme`);
  check('the Crescent and the Rule have moved by the end of the twenty years in most seeds', share('crescent', (n) => n >= 2) > 0.5 && share('rule', (n) => n >= 2) > 0.5);
  check('a Swahili war begins in some seeds and not others, and at different months', swSeeds.length >= SEEDS * 0.1 && swSeeds.length < SEEDS && swStarts.size >= 6, `${swSeeds.length} seeds, ${swStarts.size} start months`);
  check('a Malabar war begins in some seeds and not others, and at different months', mbSeeds.length >= SEEDS * 0.1 && mbSeeds.length < SEEDS && mbStarts.size >= 6, `${mbSeeds.length} seeds, ${mbStarts.size} start months`);
  check('the Swahili war shuts the lane (the lane sim carries nothing through Mombaça) and the lane reopens (it carries again) in some seeds', swZero > 0 && swZero === swShut - (swShut - swZero) && swReopen >= 3, `${swZero}/${swShut} war months with the lane shut and no flow; reopened in ${swReopen} seeds`);
  check('the Malabar war shuts the lane at Cochim and the lane reopens, in some seeds', mbZero > 0 && mbReopen >= 3, `${mbZero}/${mbShut} war months with the lane shut and no flow; reopened in ${mbReopen} seeds`);
  check('while a war is on, the lane is shut in every month of it (trunk or not)', swZero === swShut && mbZero === mbShut, `sw ${swZero}/${swShut}, mb ${mbZero}/${mbShut}`);
  check('a captain relying on a stale tale can arrive at a shut quay', staleWar > 0, `${staleWar} such tales heard in ${staleWarSeeds} seeds`);
  check('the Traffic moves: most seeds end beyond stage 1', share('traffic', (n) => n >= 2) > 0.8);
  check('Kongo has a non-trivial history in nearly every run', kongoSeeds / SEEDS >= 0.95 && kongoMoves / SEEDS >= 2, `${kongoSeeds}/${SEEDS} runs, ${(kongoMoves / SEEDS).toFixed(1)} moves`);
  check('every Power has an attitude that the Ledger can move (non-ticking ones included)', POWER_IDS.every((p) => ATTITUDES.some((r) => r.power === p || r.power === 'target') || p === 'crown'));
  check('every rumour resolves (true, stale or false) once its window is past', unresolved === 0, `${unresolved} unresolved of ${rumours}`);
  check('some rumours are false or stale', staleOrFalse > 0, `${staleOrFalse} of ${rumours}`);
  check('a rumour is demonstrably wrong at least once in most runs', wrongSeeds / SEEDS >= 0.5, `${wrongSeeds}/${SEEDS} runs settled one as not borne out`);
  check('no Front is dormant: every Front has a history line that moves it', FRONT_IDS.every((f) => FRONTS[f].ticks && FRONTS[f].perYear + SCHEDULE.filter((x) => x.front === f).length > 0));
  check('no lever pushes a Front past its bounds', offsetBreach.length === 0, offsetBreach.slice(0, 3).join(' '));

  // No lever stops a great process.
  const refuser = playSeed(1, YEARS, 'refuse'), carrier = playSeed(1, YEARS, 'carry'), idle = (() => {
    const h = makeHost(1) as PowersHost; h.powers = newPowers(); h.ledger = [];
    tickWorld(h, YEARS * 12); return { host: h };
  })();
  const p = (r: { host: PowersHost }) => pointsOf(r.host.powers!.fronts.traffic);
  console.log(`  traffic points after ${YEARS} years: idle ${p(idle).toFixed(2)}, a hearing-heavy captain ${p(refuser).toFixed(2)}, a carrying one ${p(carrier).toFixed(2)}`);
  check('the Traffic rises on the history line however he acts', p(refuser) > 4 && p(idle) - p(refuser) <= 1.3 + 1e-9, `${(p(idle) - p(refuser)).toFixed(2)} points of difference at most`);
  check('a carrying captain makes it worse, within bounds', p(carrier) >= p(idle) - 0.5 && p(carrier) - p(idle) <= 2.4 + 0.8, 'the Powers’ own moves (Kongo’s curb and push) add up to 0.8 either way');

  // Determinism: twelve months at once are twelve months one by one.
  const a = makeHost(5) as PowersHost, b = makeHost(5) as PowersHost;
  for (const h of [a, b]) { h.powers = newPowers(); h.ledger = []; }
  tickWorld(a, 144); for (let i = 0; i < 144; i++) tickWorld(b, 1);
  check('tickWorld(n) equals n single ticks, Powers included', JSON.stringify(a.powers) === JSON.stringify(b.powers));
}

// ---- 3. marketModifiers ----------------------------------------------------------------------------------------
{
  const st = newPowers();
  const ids = PORTS.map((p) => p.id);
  check('with no state, or none in force, marketModifiers is the identity', ids.every((p) => marketModifiers(p, 1e9, null) === IDENTITY && marketModifiers(p, 1e9, st) === IDENTITY));
  const T = 86400 * 400;
  const plain = new Markets(3), hooked = new Markets(3);
  hooked.modifiers = (p, t) => marketModifiers(p, t, st);
  let same = true;
  for (const p of ids) {
    plain.refresh(p, T); hooked.refresh(p, T);
    if (JSON.stringify(plain.listings(p, T, 0, 0)) !== JSON.stringify(hooked.listings(p, T, 0, 0))) same = false;
  }
  check('Markets with the hook but nothing in force list exactly what they listed without it', same);

  // A war on the Mina road: closes the lane, moves a price, and the toll is paid on the trunk.
  const t = T + 10 * DAY;
  addEffect(st, { kind: 'war', power: 'kongo', ports: ['arguim', 'luanda'], start: t - DAY, end: t + 200 * DAY, closes: true, price: { trigo: 1.3 }, reason: 'A stub war on the Arguim road.' });
  const m = marketModifiers('arguim', t, st), l = marketModifiers('luanda', t, st);
  check('a war closes the lane at a trunk port without shutting the flagship out', m.laneClosed && !m.closed && m.duesMult >= 2 && m.reason.includes('stub war'));
  check('and shuts a port off the trunk', l.laneClosed && l.closed);
  const base = plain.listings('arguim', t, 0, 0).find((x) => x.goodId === 'trigo')!;
  const goma0 = plain.listings('arguim', t, 0, 0).find((x) => x.goodId === 'goma')!;
  const war = (() => { hooked.refresh('arguim', t); return hooked.listings('arguim', t, 0, 0).find((x) => x.goodId === 'trigo')!; })();
  const gomaWar = hooked.listings('arguim', t, 0, 0).find((x) => x.goodId === 'goma')!;
  check('and moves a price, a stock and an appetite', war.ask / base.ask > 1.5 && gomaWar.stock < goma0.stock && war.appetite < base.appetite, `trigo ask ${base.ask.toFixed(1)} -> ${war.ask.toFixed(1)}`);
  check('Luanda lists nothing for sale or purchase while closed', hooked.listings('luanda', t, 0, 0).every((x) => x.stock === 0 && x.appetite === 0));
  check('closed ports are never trunk ports', ids.every((p) => !TRUNK.includes(p) || !marketModifiers(p, t, st).closed));
}

// ---- 4. In a Game: the Book, the scenes, the save ---------------------------------------------------------------------
{
  const g = new Game(11);
  g.worldT = g.clock.t;
  const t = g.clock.t;
  // Mina war: closes the lane, the price moves, the rumour travels to Arguim and the Book can show it.
  addEffect(g.powers, { kind: 'war', power: 'akan', ports: ['mina'], start: t, end: t + 400 * DAY, closes: true, price: { ouro: 1.15 }, reason: 'A stub war on the Gold Coast.' });
  const before = (() => { const sav = g.powers.effects.splice(0); const x = g.marketHere('mina').find((l) => l.goodId === 'ouro')!.ask; g.powers.effects.push(...sav); return x; })();
  const after = g.marketHere('mina').find((l) => l.goodId === 'ouro')!.ask;
  check('a Mina war moves the price the player is quoted', after > before * 1.2, `ouro ask ${before.toFixed(1)} -> ${after.toFixed(1)}`);
  const rng = new Rng(3);
  const { announce } = require_('../src/world/powers/rumours');
  announce(g.powers, rng, t, { event: 'stub:mina-war', place: 'mina', power: 'akan', window: 12, truth: { claim: 'There is war on the Gold Coast, and Mina is shut to the lanes.', vague: 'Trouble at Mina.' } });
  const r = g.powers.rumours[0];
  r.born = t - 70 * DAY;
  g.clock.t = t + 5 * DAY;
  arriveAt(g, 'arguim', g.clock.t);
  const facts = knownFacts(g).filter((f) => f.ref.store === 'rumour');
  check('the rumour reaches a port a month away and appears in the Book with source and age, and no truth', facts.length === 1 && facts[0].source.length > 0 && facts[0].age > 60 && !('truth' in facts[0]), facts[0]?.source ?? '');
  g.dockedAt = 'mina';
  const a = arriveAt(g, 'mina', g.clock.t + 3 * DAY);
  check('arriving at the place settles it', a.settled.length === 1 && knownFacts(g).find((f) => f.ref.store === 'rumour')?.settled === 'borne out');
  // second source
  g.dockedAt = 'mina';
  g.crown.gold = 500;
  const fact2 = { ...facts[0] } as typeof facts[0];
  g.powers.rumours[0].settled = undefined;
  const said = checkFact(g, fact2);
  check('a second informer answers without saying what is true', /tells it the same way|will not stand behind it/.test(said), said);

  // The Traffic scenes, forward only.
  const along_ = (p: string): number => along(anchorageOf(portDef(p)));
  const bad: string[] = [];
  for (const sc of TRAFFIC_SCENES) {
    const first = Math.min(...sc.ports.map(along_)), last = Math.max(...sc.ports.map(along_));
    for (const a of sc.after ?? []) {
      const pre = TRAFFIC_SCENES.find((x) => x.id === a);
      if (!pre) { bad.push(`${sc.id}: unknown after ${a}`); continue; }
      if (Math.min(...pre.ports.map(along_)) > last) bad.push(`${sc.id} needs ${a}, which is only further along`);
    }
    if (!sc.ports.every((p) => TRUNK.includes(p))) bad.push(`${sc.id}: off the trunk`);
    void first;
  }
  check('no scene needs one that lies only further down the road (road.ts along())', bad.length === 0, bad.join('; '));
  check('about a dozen Traffic scenes, all on Arguim, Mina or Mpinda', TRAFFIC_SCENES.length >= 10 && TRAFFIC_SCENES.every((s) => s.ports.every((p) => ['arguim', 'mina', 'mpinda'].includes(p))), `${TRAFFIC_SCENES.length} scenes`);

  // Play the road forward, answering every scene at random, many times: every scene is reached on the forward road alone.
  const reached = new Set<string>();
  let crashes = 0, tonsBad = 0, backward = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const gg = new Game(seed);
    gg.worldT = gg.clock.t;
    const r2 = new Rng(seed);
    gg.crown.gold = 5000;
    gg.casa.regard = 0.2;
    const stage = 1 + (seed % 4);
    gg.powers.fronts.traffic.base = (stage - 1) * 4 + 0.5;
    gg.powers.fronts.traffic.stage = stage as 1;
    if (seed % 3 === 0) gg.generation = 2;
    let at = -1;
    for (let lap = 0; lap < 14; lap++) {
      for (const port of ['arguim', 'mina', 'mpinda']) {
        const idx = along_(port);
        if (idx < at && lap === 0) backward++;
        gg.dockedAt = port;
        gg.clock.t += 30 * DAY;
        gg.powers.fronts.traffic.stage = stage as 1;
        for (let k = 0; k < 6; k++) {
          let ev;
          try { ev = dueTrafficScene(gg, port); } catch (e) { crashes++; console.log(String(e)); break; }
          if (!ev) break;
          reached.add(ev.id);
          const ch = ev.choices![r2.int(0, ev.choices!.length - 1)];
          try { ch.resolve(gg); } catch (e) { crashes++; console.log(String(e)); }
          if (gg.ship.passengerTons < -1e-9 || gg.ship.holdFree < 0) tonsBad++;
        }
      }
    }
  }
  const ids = TRAFFIC_SCENES.map((s) => s.id);
  const missing = ids.filter((id) => ![...reached].includes(`traffic:${id}`));
  check('every scene is reached by sailing forward, Arguim then Mina then Mpinda, and answers without error', crashes === 0 && missing.length === 0, `missing: ${missing.join(',') || 'none'}; crashes ${crashes}`);
  check('the hold never goes negative with people aboard', tonsBad === 0);
  void sceneOffered; void backward;

  // Levers, and what does not move the machine.
  const g2 = new Game(2); g2.worldT = g2.clock.t;
  const off = () => g2.powers.fronts.traffic.offset;
  g2.noteDeed('traffic.carried', { magnitude: 0.5 });
  check('a parcel carried: +0.10', Math.abs(off() - 0.1) < 1e-9);
  g2.noteDeed('traffic.refused', { magnitude: 0.5 });
  check('refusing at cost: -0.05', Math.abs(off() - 0.05) < 1e-9);
  g2.noteDeed('hearing.contested', { magnitude: 0.5 });
  check('a contested hearing: -0.15', Math.abs(off() - (-0.10)) < 1e-9);
  const o3 = off(); g2.noteDeed('person.redeemed', { magnitude: 0.9, actors: ['captain', 'Kojo'] });
  check('redeeming a named person is in the Ledger and moves nothing', Math.abs(off() - o3) < 1e-12 && g2.ledger[g2.ledger.length - 1].tag === 'person.redeemed');

  // The Mpinda register: winnable once, at a cost, by preparing.
  const g3 = new Game(4); g3.worldT = g3.clock.t; g3.dockedAt = 'mpinda'; g3.crown.gold = 1000;
  g3.powers.fronts.traffic.stage = 2; g3.powers.fronts.traffic.base = 5;
  const elders = dueTrafficScene(g3, 'mpinda')!;
  elders.choices![0].resolve(g3);
  g3.clock.t += 30 * DAY;
  const reg = dueTrafficScene(g3, 'mpinda')!;
  const gold0 = g3.crown.gold, casa0 = g3.casa.regard;
  g3.diplomacy.polities.kongo.trust = 0.3;
  reg.choices![0].resolve(g3);
  check('the Mpinda register can be won, once, at real cost', g3.powers.local.state === 'won' && g3.crown.gold === gold0 - 200 && g3.casa.regard < casa0 && g3.powers.fronts.traffic.offset < 0
    && g3.ledger.some((e) => e.tag === 'practice.changed'));
  check('and it stands in the Book for years', marketModifiers('mpinda', g3.clock.t + 365 * DAY, g3.powers).reason.includes('officer'));
  g3.clock.t += 90 * DAY;
  check('it is not offered a second time', dueTrafficScene(g3, 'mpinda')?.id !== 'traffic:mpinda-register');

  // The people carried take room, are landed with a count, and the dead reach the muster.
  const g4 = new Game(5); g4.worldT = g4.clock.t; g4.dockedAt = 'arguim'; g4.crown.gold = 500;
  const sc1 = dueTrafficScene(g4, 'arguim')!; sc1.choices![2].resolve(g4);
  g4.clock.t += 60 * DAY;
  const pe = dueTrafficScene(g4, 'arguim')!;
  const free0 = g4.ship.holdFree;
  pe.choices![0].resolve(g4);
  check('people carried take room in the hold, off the price list', g4.ship.holdFree < free0 && g4.ship.passengerTons > 0 && g4.powers.parcels.length === 1);
  g4.dockedAt = 'mina'; g4.clock.t += 40 * DAY;
  const land = dueTrafficScene(g4, 'mina')!;
  const gold1 = g4.crown.gold;
  land.choices![land.choices!.length - 1].resolve(g4);
  check('landing pays the freight, frees the hold, and writes the dead into the muster', g4.crown.gold > gold1 && g4.ship.passengerTons === 0 && g4.powers.parcels[0].status === 'landed');

  // Save round trip.
  const g5 = new Game(8); g5.worldT = g5.clock.t;
  tickWorld(g5, 30);
  g5.noteDeed('traffic.carried', { magnitude: 0.4 });
  addEffect(g5.powers, { kind: 'embargo', power: 'kongo', ports: ['mpinda'], start: g5.clock.t, end: g5.clock.t + 100 * DAY, closes: true, reason: 'x' });
  announce(g5.powers, new Rng(1), g5.clock.t, { event: 'x', place: 'mpinda', window: 5, truth: { claim: 'c', vague: 'v' } });
  const s1 = g5.serialize();
  const g6 = Game.deserialize(s1);
  check('the Powers survive a save and a load, exactly', JSON.stringify(g6.powers) === JSON.stringify(g5.powers));
  check('and a save without them loads with the Fronts on the history line', (() => {
    const d = JSON.parse(s1); delete d.powers;
    const old = Game.deserialize(JSON.stringify(d));
    old.clock.t += 15 * 365 * DAY; old.worldT = old.clock.t; tickWorld(old, 1);
    return old.powers.fronts.traffic.base > 1 && old.powers.shocksDone.length > 0;
  })());
  check('migratePowers tolerates rubbish', migratePowers({ fronts: 5, rumours: 'x' }).fronts.traffic.stage === 1);
  void hops; void WMONTH;
}

// ---- 5. The Rule, the Crescent, the courts of the Indian Ocean (D4) ------------------------------------------------------
{
  // The conduct table agrees with the delta table about which way each deed pushes the Rule.
  const disagree: string[] = [];
  for (const c of CONDUCT) {
    const rows = FRONT_DELTAS.filter((r) => r.front === 'rule' && r.tag === c.tag);
    if (rows.length === 0) { disagree.push(`${c.tag}: no rule row`); continue; }
    for (const r of rows) if (Math.sign(r.delta) !== c.lean) disagree.push(`${c.tag}:${r.delta}`);
  }
  check('the Book’s reading of the Rule agrees with the Front’s delta table, tag by tag', disagree.length === 0, disagree.join(' '));

  // A stop-everyone captain and a spare-everyone captain, Calecute and Kilwa, Act IV, the same seeds.
  let differ = 0, stopHigher = 0, n = 0;
  const stages = { stop: [] as number[], spare: [] as number[] };
  for (let seed = 1; seed <= Math.min(SEEDS, 40); seed++) {
    const a = playSeed(seed, 20, 'stop'), b = playSeed(seed, 20, 'spare');
    const sa = a.host.powers!.fronts.rule.stage, sb = b.host.powers!.fronts.rule.stage;
    stages.stop.push(sa); stages.spare.push(sb);
    n++; if (sa !== sb) differ++; if (sa > sb) stopHigher++;
    const ra = ruleReading(a.host.powers, a.ledger), rb = ruleReading(b.host.powers, b.ledger);
    if (seed === 1) {
      console.log(`  Rule, stop-everyone: ${ra.line}`);
      console.log(`  Rule, spare-everyone: ${rb.line}`);
      check('the Book’s line says what the captain did, at the two places', /At Calecute you stopped/.test(ra.line) && /At Kilwa you stopped/.test(ra.line) && /let .* go/.test(rb.line) && /wrote .* passes?/.test(rb.line) && ra.conductStage > rb.conductStage);
    }
  }
  check('the Rule’s stage differs between a stop-everyone and a spare-everyone policy in every seed, stopping the higher', differ === n && stopHigher === n, `stop ${[1, 2, 3, 4].map((k) => `${k}:${stages.stop.filter((x) => x === k).length}`).join(' ')} | spare ${[1, 2, 3, 4].map((k) => `${k}:${stages.spare.filter((x) => x === k).length}`).join(' ')}`);
  check('stopping everyone reaches the stopping of ships; sparing everyone leaves a free sea', stages.stop.every((x) => x >= 3) && stages.spare.every((x) => x <= 2));

  // A longer horizon for the Crescent and the Rule, where the dated shocks of 1505-15 are in force.
  const longEnd: Record<string, number[]> = { crescent: [], rule: [], claim: [], gold: [] };
  const N30 = Math.min(SEEDS, 40);
  for (let seed = 1; seed <= N30; seed++) {
    const r = playSeed(seed, 31, 'random');
    for (const f of ['crescent', 'rule', 'claim', 'gold'] as const) longEnd[f].push(r.host.powers!.fronts[f].stage);
  }
  for (const f of ['crescent', 'rule', 'claim', 'gold']) {
    const ex = longEnd[f].filter((x) => x === 1 || x === 4).length / N30;
    check(`${f}: not pinned at an extreme after thirty years either`, ex <= 0.8, `${(ex * 100).toFixed(0)}% at an extreme; ${[1, 2, 3, 4].map((k) => `${k}:${longEnd[f].filter((x) => x === k).length}`).join(' ')}`);
  }

  // The scenes.
  const along_ = (p: string): number => along(anchorageOf(portDef(p)));
  const ROAD = ['mocambique', 'quiloa', 'mombaca', 'melinde', 'calecute', 'cananor', 'cochim'];
  check('the road order used by the scenes is the order along the road', ROAD.every((p, i) => i === 0 || along_(p) >= along_(ROAD[i - 1]) - 30), ROAD.map((p) => `${p}:${Math.round(along_(p))}`).join(' '));
  const bad: string[] = [];
  for (const sc of POWER_SCENES) {
    if (!sc.ports.every((p) => ROAD.includes(p))) bad.push(`${sc.id}: off the Indian Ocean road`);
    const last = Math.max(...sc.ports.map(along_));
    for (const a of sc.after ?? []) {
      const pre = POWER_SCENES.find((x) => x.id === a);
      if (!pre) { bad.push(`${sc.id}: unknown after ${a}`); continue; }
      if (Math.min(...pre.ports.map(along_)) > last + 1) bad.push(`${sc.id} needs ${a}, which is only further along`);
    }
  }
  check('no court scene needs one that lies only further along the road (road.ts along())', bad.length === 0, bad.join('; '));
  check('about a dozen court scenes at Melinde, Kilwa, Mombaça, Calecute, Cananor and Cochim', POWER_SCENES.length >= 12 && POWER_SCENES.length <= 14 && new Set(POWER_SCENES.flatMap((x) => x.ports)).size === 6, `${POWER_SCENES.length} scenes`);
  check('scene ids do not collide with the Traffic’s', POWER_SCENES.every((x) => !TRAFFIC_SCENES.some((y) => y.id === x.id)));
  const textBad: string[] = [];

  // Sail the road forward, answering at random; every scene is reached on the forward road alone.
  const reached = new Set<string>();
  let crashes = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const gg = new Game(seed);
    gg.worldT = gg.clock.t;
    gg.chronicle.act = 4;
    gg.crown.gold = 8000;
    gg.casa.regard = 0.3;
    gg.powers.fronts.rule.base = 4.5; gg.powers.fronts.rule.stage = 2;
    const r2 = new Rng(seed * 31);
    for (let lap = 0; lap < 16; lap++) {
      for (const port of ROAD) {
        gg.dockedAt = port;
        gg.clock.t += 30 * DAY;
        // Mombaça is at war with Melinde some of the time; the stages vary by seed.
        if (lap === 2 && port === 'mombaca' && seed % 2 === 0) addEffect(gg.powers, { kind: 'war', power: 'mombasa', ports: ['mombaca', 'melinde'], start: gg.clock.t, end: gg.clock.t + 90 * DAY, closes: true, reason: 'A stub war.' });
        if (seed % 3 === 0) gg.powers.fronts.rule.stage = (2 + (lap % 3)) as 2;
        for (let k = 0; k < 6; k++) {
          let ev;
          try { ev = duePowerScene(gg, port); } catch (e) { crashes++; console.log(String(e)); break; }
          if (!ev) break;
          reached.add(ev.id);
          if (!ev.text || ev.text.length < 200 || ev.choices!.length < 2 || ev.choices!.some((c) => !c.label || !c.detail)) textBad.push(ev.id);
          try { ev.choices![r2.int(0, ev.choices!.length - 1)].resolve(gg); } catch (e) { crashes++; console.log(String(e)); }
        }
      }
    }
  }
  const missing = POWER_SCENES.map((x) => `power:${x.id}`).filter((id) => !reached.has(id));
  check('every court scene is reached by sailing forward and answers without error', crashes === 0 && missing.length === 0, `missing: ${missing.join(',') || 'none'}; crashes ${crashes}`);
  check('every scene has a body, two choices at least, and a stated cost on each', textBad.length === 0, [...new Set(textBad)].join(','));

  // The Rule's winnable local fight, at Melinde.
  {
    const g = new Game(21); g.worldT = g.clock.t; g.dockedAt = 'melinde'; g.chronicle.act = 4; g.crown.gold = 1000; g.casa.regard = 0.2;
    g.powers.fronts.rule.base = 5; g.powers.fronts.rule.stage = 2;
    const take = (id: string, pick: number): void => {
      g.clock.t += 40 * DAY;
      let ev = duePowerScene(g, 'melinde');
      for (let i = 0; i < 6 && ev && ev.id !== `power:${id}`; i++) { ev.choices![ev.choices!.length - 1].resolve(g); g.clock.t += DAY; ev = duePowerScene(g, 'melinde'); }
      if (!ev || ev.id !== `power:${id}`) throw new Error(`scene ${id} not offered`);
      ev.choices![pick].resolve(g);
    };
    take('melinde-welcome', 1); // trades with both coasts
    take('melinde-harbourmaster', 0);
    // Unprepared: no surety, no tongue, no regard: the stand is refused and the chance stays.
    g.clock.t += 40 * DAY;
    const early = duePowerScene(g, 'melinde')!;
    check('the stand is offered once the Rule is a stage-two fact and the sultan’s seal is held', early.id === 'power:melinde-banyan' || early.id === 'power:melinde-list');
    if (early.id === 'power:melinde-banyan') { g.powers.seen['fired:melinde-banyan'] = g.clock.t; delete g.powers.seen['fired:melinde-banyan']; }
    g.powers.localRule!.state = 'offered';
    const gold0 = g.crown.gold, pts0 = pointsOf(g.powers.fronts.rule);
    const listSc = POWER_SCENES.find((x) => x.id === 'melinde-list')!;
    const ev0 = listSc.build(g, g.powers);
    const refused = ev0.choices![0].resolve(g);
    check('without a surety, a tongue or the court’s regard the stand is refused and costs nothing', g.powers.localRule!.state === 'offered' && g.crown.gold === gold0 && /somebody he knows|speak his tongue/.test(refused), refused.slice(0, 60));
    g.powers.localRule!.trust = true;
    g.crown.gold = 100;
    const poor = listSc.build(g, g.powers).choices![0].resolve(g);
    check('and without the money it is refused', g.powers.localRule!.state === 'offered' && g.crown.gold === 100 && /two hundred and fifty/.test(poor));
    g.crown.gold = 1000;
    const casa0 = g.casa.regard;
    listSc.build(g, g.powers).choices![0].resolve(g);
    check('the Rule’s stand at Melinde can be won, once, at real cost', g.powers.localRule!.state === 'won' && g.crown.gold === 750 && g.casa.regard < casa0 && g.ledger.some((e) => e.tag === 'compact.made'));
    check('it lowers the Rule by about a stage’s third, and stands in the Book for years', pointsOf(g.powers.fronts.rule) <= pts0 - 1.0 && marketModifiers('melinde', g.clock.t + 365 * DAY, g.powers).reason.includes('roll'));
    check('it is not offered a second time', !powerSceneOffered(g, listSc, 'melinde'));
    g.clock.t += 70 * DAY;
    check('and its first page is read to the captain two months on', duePowerScene(g, 'melinde')?.id === 'power:melinde-after');
  }

  // The Rule is fixed when Act V opens; conduct after that counts a third.
  {
    const g = new Game(31); g.worldT = g.clock.t;
    g.noteDeed('ship.stopped', { target: 'kilwa', place: 'quiloa', magnitude: 0.5 });
    const o1 = g.powers.fronts.rule.offset;
    g.chronicle.act = 5;
    g.clock.t += 40 * DAY; g.worldT = g.clock.t - 31 * DAY; tickWorld(g, 1);
    check('Act V’s opening fixes the Rule at the stage it had reached', g.powers.rule?.lockedAt !== undefined && g.powers.rule.stage === g.powers.fronts.rule.stage);
    g.noteDeed('ship.stopped', { target: 'kilwa', place: 'quiloa', magnitude: 0.5 });
    const d2 = g.powers.fronts.rule.offset - o1;
    check('conduct after that counts a third as much', Math.abs(d2 - o1 * 0.35) < 1e-9 && d2 > 0, `${o1.toFixed(3)} then ${d2.toFixed(3)}`);
  }

  // The Powers' moves are driven by the Ledger and deterministic per seed.
  {
    const run = (att: number) => {
      const h = makeHost(9) as PowersHost; h.powers = newPowers(); h.ledger = [];
      h.powers.powers.cochin.attitude = att; h.powers.powers.melinde.attitude = att; h.powers.powers.kilwa.attitude = att; h.powers.powers.calicut.attitude = att;
      let welcomes = 0, evicts = 0;
      for (let m = 0; m < 120; m++) {
        for (const id of ['cochin', 'melinde', 'kilwa', 'calicut'] as const) h.powers!.powers[id].attitude = att;
        tickWorld(h, 1);
      }
      for (const e of h.powers!.effects) { if (e.kind === 'welcome') welcomes++; if (e.kind === 'embargo' && ['kilwa', 'melinde', 'calicut'].includes(e.power)) evicts++; }
      return { welcomes, evicts, json: JSON.stringify(h.powers) };
    };
    const friend = run(0.6), foe = run(-0.6), again_ = run(0.6);
    check('a friendly court welcomes the factor; a hostile one sends him away or shuts the quay', friend.welcomes > foe.welcomes && foe.evicts > friend.evicts, `welcomed ${friend.welcomes}/${foe.welcomes}, shut ${friend.evicts}/${foe.evicts}`);
    check('the same seed and the same Ledger give the same history', friend.json === again_.json);
  }
  void textBad;
}

// ---- 6. E3: the Court ticking, the Crescent, the Gold and the Claim staged; the remaining conflicts; the Rua Nova's Lines --------------
{
  const N = Math.min(SEEDS, 30);

  // 6a. Every Front's ladder is reachable (stage 4 in some run at the thirty-year horizon, by history or by a captain who presses), and none
  // sits at an extreme in most random seeds at twenty years (the section above). The Court's ladder is the dated history's.
  {
    const peaks: Record<FrontId, number[]> = { gold: [], traffic: [], claim: [], crescent: [], rule: [], court: [] };
    for (let s = 1; s <= N; s++) {
      const r = playSeed(s, 31, 'random');
      for (const f of FRONT_IDS) peaks[f].push(r.peak[f]);
    }
    const pressPeaks: Record<FrontId, number[]> = { gold: [], traffic: [], claim: [], crescent: [], rule: [], court: [] };
    for (let s = 1; s <= Math.min(N, 12); s++) {
      const r = playSeed(s, 31, 'press');
      for (const f of FRONT_IDS) pressPeaks[f].push(r.peak[f]);
    }
    const reach = (f: FrontId, k: number): boolean => peaks[f].some((x) => x >= k) || pressPeaks[f].some((x) => x >= k);
    for (const f of FRONT_IDS) console.log(`  ${f} peak stage over thirty-one years, random ${[1, 2, 3, 4].map((k) => `${k}:${peaks[f].filter((x) => x === k).length}`).join(' ')} | pressing ${[1, 2, 3, 4].map((k) => `${k}:${pressPeaks[f].filter((x) => x === k).length}`).join(' ')}`);
    check('every Front’s ladder is reachable to its fourth stage (history, or a captain who presses)', FRONT_IDS.every((f) => reach(f, 4)), FRONT_IDS.filter((f) => !reach(f, 4)).join(','));
    check('the Gold, the Claim and the Crescent are not at stage 4 for every random captain (the captain can keep them down)', (['gold', 'claim', 'crescent'] as const).every((f) => peaks[f].some((x) => x < 4)), (['gold', 'claim', 'crescent'] as const).map((f) => `${f}:${peaks[f].filter((x) => x === 4).length}/${N}`).join(' '));
    check('pressing moves the Gold and the Claim where a random captain does not (the levers are real)', pressPeaks.gold.filter((x) => x >= 4).length > peaks.gold.slice(0, 12).filter((x) => x >= 4).length && pressPeaks.claim.filter((x) => x >= 4).length >= peaks.claim.slice(0, 12).filter((x) => x >= 4).length);
  }

  // 6b. The Court Front ticks, in the real dated windows: João II’s death, the Edict, the favourites, Easter 1506.
  {
    const bootGame = (seed: number, y: number, mo: number, patron: PatronId, origin?: string): Game => {
      const g = new Game(seed);
      g.clock.t = daysFromEpoch(y, mo, 1) * DAY;
      g.worldT = g.clock.t;
      g.crown.patent = null;
      g.crown.standing = 1000;
      g.dockedAt = 'lisboa';
      g.identity.patron = patron;
      if (origin) g.origin = origin as Game['origin'];
      // What had already fallen or risen before the start is settled, not fallen on the first tick.
      g.identity.lastMonth = -1;
      for (const e of eventsOf(g)) { const at = e.at(); if (at !== null && at < g.clock.t) g.identity.applied.push(e.id); }
      return g;
    };
    const run = (g: Game, months: number, each?: (g: Game) => void): void => {
      for (let i = 0; i < months; i++) { g.clock.t += 30 * DAY; tickWorldDue(g, g.clock.t); tickPatrons(g); each?.(g); }
    };
    const near = (t: number | undefined, y: number, mo: number, days: number): boolean => t !== undefined && Math.abs(t - daysFromEpoch(y, mo, 1) * DAY) <= days * DAY;
    // The King’s death. An idle client of the Crown is pulled down with it; one who moves when warned is spared.
    let kdOk = 0, spared = 0, pulled = 0, standingSpared = 0, standingPulled = 0, warnedRight = 0, kdSeeds = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const idle = bootGame(seed, 1494, 6, 'crown'), early = bootGame(seed, 1494, 6, 'crown');
      const p2 = favouriteEvents(early)[0].patron;
      const away = PATRON_IDS.find((p) => p !== 'crown' && p !== p2)!;
      run(idle, 18);
      run(early, 18, (g) => { if (g.identity.warned['king-dies'] !== undefined && g.identity.patron === 'crown') { g.dockedAt = 'lisboa'; choosePatron(g, away); } });
      kdSeeds++;
      if (near(idle.identity.warned['king-dies'], 1495, 6, 45)) warnedRight++;
      const fell = idle.identity.patrons.crown.fell;
      if (near(fell ?? undefined, 1495, 10, 50)) kdOk++;
      if (idle.identity.patrons.crown.pulled) pulled++;
      if (!early.identity.patrons.crown.pulled && early.identity.moved.includes('king-dies')) spared++;
      standingPulled += idle.crown.standing; standingSpared += early.crown.standing;
    }
    check('the Court Front’s history warns of the King’s death four months ahead (June 1495) and the fall lands in October', warnedRight === kdSeeds && kdOk === kdSeeds, `warned in window ${warnedRight}/${kdSeeds}, fell in window ${kdOk}/${kdSeeds}`);
    check('a client of the Crown who sat still is pulled down with it; one who moved when warned is spared', pulled === kdSeeds && spared === kdSeeds && standingSpared > standingPulled, `pulled ${pulled}, spared ${spared}, standing ${Math.round(standingSpared / kdSeeds)} vs ${Math.round(standingPulled / kdSeeds)}`);
    // The Court’s stage and the favourite it makes fall.
    let favOk = 0, favEarlySpared = 0, favSeeds = 0, stageOk = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const probe = bootGame(seed, 1495, 6, 'crown');
      const p2 = favouriteEvents(probe)[0].patron;
      const away = PATRON_IDS.find((p) => p !== 'crown' && p !== p2)!;
      const idle = bootGame(seed, 1495, 6, p2), early = bootGame(seed, 1495, 6, p2);
      run(idle, 14);
      run(early, 14, (g) => { if (g.identity.warned['favourite-2'] !== undefined && g.identity.patron === p2) { g.dockedAt = 'lisboa'; choosePatron(g, away); } });
      favSeeds++;
      const entered = idle.powers.fronts.court.log.find((l) => l.stage === 2)?.t;
      if (near(entered, 1495, 10, 50)) stageOk++;
      const w = idle.identity.warned['favourite-2'], fell = idle.identity.patrons[p2].fell;
      if (w !== undefined && fell !== null && near(w, 1495, 10, 50) && fell - w >= 2 * 30 * DAY && fell - w <= 5 * 30 * DAY) favOk++;
      if (idle.identity.patrons[p2].pulled && !early.identity.patrons[p2].pulled && early.identity.moved.includes('favourite-2')) favEarlySpared++;
    }
    check('the Court reaches its second stage with the King’s death (October 1495)', stageOk === favSeeds, `${stageOk}/${favSeeds}`);
    check('the favourite falls three or four months after the stage, with the warning given at the stage', favOk === favSeeds, `${favOk}/${favSeeds}`);
    check('the favourite’s client who moves early is spared, and one who stays is pulled down', favEarlySpared === favSeeds, `${favEarlySpared}/${favSeeds}`);
    // The Edict. A converso captain sailing for the Rua Nova loses more with it than another would.
    let edictWindow = 0, convMore = 0, edictSeeds = 0, edictMoved = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const conv = bootGame(seed, 1496, 6, 'ruanova', 'converso'), other = bootGame(seed, 1496, 6, 'ruanova', 'tradesman'), mv = bootGame(seed, 1496, 6, 'ruanova', 'converso');
      for (const g of [conv, other, mv]) { g.identity.applied.push('favourite-2'); }
      run(conv, 9); run(other, 9);
      run(mv, 9, (g) => { if (g.identity.warned['edict'] !== undefined && g.identity.patron === 'ruanova') { g.dockedAt = 'lisboa'; choosePatron(g, 'church'); } });
      edictSeeds++;
      if (near(conv.identity.warned['edict'], 1496, 9, 45) && near(conv.identity.patrons.ruanova.fell ?? undefined, 1496, 12, 50)) edictWindow++;
      if (conv.crown.standing < other.crown.standing) convMore++;
      if (mv.crown.standing > conv.crown.standing && !mv.identity.patrons.ruanova.pulled) edictMoved++;
    }
    check('the Edict is warned of three months ahead and the Rua Nova falls in December 1496', edictWindow === edictSeeds, `${edictWindow}/${edictSeeds}`);
    check('a converso captain loses more with the Rua Nova than another would; one who moved early loses none of it', convMore === edictSeeds && edictMoved === edictSeeds, `converso loses more ${convMore}/${edictSeeds}, mover spared ${edictMoved}/${edictSeeds}`);
    // Easter 1506: the Court’s fourth stage; its favourite; the Rua Nova falls with the street.
    {
      const g = bootGame(3, 1505, 6, 'ruanova');
      run(g, 18);
      check('the Court reaches the reckoning with the massacre of April 1506, and the Rua Nova falls in that window', g.powers.fronts.court.stage === 4 && near(g.powers.fronts.court.log.find((l) => l.stage === 4)?.t, 1506, 4, 50) && g.identity.applied.includes('easter-1506'), `stage ${g.powers.fronts.court.stage}`);
      check('the favourite of the fourth stage is warned of, and falls, within the same window', g.identity.warned['favourite-4'] !== undefined && g.identity.applied.includes('favourite-4'));
    }
    // The new reign’s orders: Manuel’s Casa asks for letters, the old King’s for surveys.
    {
      const old = bootGame(2, 1494, 3, 'crown'), neu = bootGame(2, 1497, 3, 'crown');
      for (const g of [old, neu]) { g.identity.patrons.crown.favour = 0.6; g.chronicle.act = 3; }
      const offers = (g: Game) => patronOffers(g, []).map((p) => p.title);
      const a = offers(old), b = offers(neu);
      check('the Crown’s orders change with the reign: a survey under João II, the King’s letters under Manuel', reignAt(old.clock.t) === 'joao' && reignAt(neu.clock.t) === 'manuel' && a.some((t) => /survey/i.test(t)) && !a.some((t) => /letters/i.test(t)) && b.some((t) => /letters/i.test(t)) && !b.some((t) => /survey/i.test(t)), `${a.join(' | ')} || ${b.join(' | ')}`);
    }
    // A save from before the Court ticked is re-laid on the history line.
    {
      const g = bootGame(4, 1504, 1, 'crown');
      run(g, 2);
      const d = JSON.parse(g.serialize());
      d.powers.era = undefined; delete d.powers.era;
      d.powers.fronts.court.base = 0.5; d.powers.fronts.court.stage = 1; d.powers.fronts.court.log = [];
      d.powers.fronts.claim.base = 2; d.powers.fronts.claim.stage = 1;
      const old = Game.deserialize(JSON.stringify(d));
      check('an older save loads at era 1 …', (old.powers.era ?? 1) < ERA);
      old.clock.t += 40 * DAY; tickWorldDue(old, old.clock.t);
      check('… and is re-laid on the history line on its next tick (the Court at the Rua Nova’s stage, the Claim at the line drawn), the offset kept', old.powers.era === ERA && old.powers.fronts.court.stage === 3 && old.powers.fronts.claim.stage === 3, `court ${old.powers.fronts.court.stage}, claim ${old.powers.fronts.claim.stage}`);
      void relay;
    }
  }

  // 6c. The Crescent: notes, convoys, a league; and the Lisbon pepper price follows through the Venetian channel.
  {
    const st = newPowers();
    const T = 86400 * 400;
    const pep = (stage: 1 | 2 | 3 | 4): number => { st.fronts.crescent.stage = stage; return marketModifiers('lisboa', T, st).priceMult.pimenta ?? 1; };
    const p = [pep(1), pep(2), pep(3), pep(4)];
    check('the Crescent raises the Lisbon pepper price modifier from stage two, and more at each stage after', p[0] === 1 && p[1] > 1 && p[2] > p[1] && p[3] > p[2], p.map((x) => x.toFixed(3)).join(' '));
    st.fronts.crescent.stage = 2;
    check('and the Book can say why (the reason names the Venetian factors)', marketModifiers('lisboa', T, st).reasons.some((r) => /Venice/.test(r)));
    st.fronts.crescent.stage = 1;
    const traced: boolean[] = []; let venice = 0, leagues = 0, convoys = 0, notes = 0;
    for (let s = 1; s <= Math.min(N, 24); s++) {
      const r = playSeed(s, 31, 'random');
      const h = r.host, stt = h.powers!;
      const t = h.worldT!;
      const stage = stt.fronts.crescent.stage;
      if (stage >= 2) traced.push((marketModifiers('lisboa', t, stt).priceMult.pimenta ?? 1) > 1);
      for (const m of stt.powers.mamluk.moves) { if (m.kind === 'venice') venice++; if (m.kind === 'league') leagues++; if (m.kind === 'convoy') convoys++; if (m.kind === 'note') notes++; }
    }
    check('in played runs, a Crescent at stage two or more always has the Lisbon pepper price up', traced.length > 5 && traced.every(Boolean), `${traced.filter(Boolean).length}/${traced.length}`);
    check('the Mamluk court’s notes, convoys and league, and Venice’s bidding at Lisbon, all occur in played runs', notes > 0 && convoys > 0 && leagues > 0 && venice > 0, `notes ${notes}, convoys ${convoys}, league ${leagues}, Venice ${venice}`);
  }

  // 6d. The remaining conflicts: each is a small machine that reaches its phases, moves a price, shuts and reopens a lane where it should, and tells a rumour.
  {
    const PORTS_OF: Record<keyof typeof MACHINES, string[]> = { senegal: ['portudal', 'arguim'], akan: ['mina', 'axim', 'acara'], kongo: ['mpinda'], ndongo: ['luanda', 'benguela'] };
    const PAT: Record<keyof typeof MACHINES, RegExp> = { senegal: /riders|Damel|Wolof|river/i, akan: /kingdoms|beach/i, kongo: /Manikongo|sons|throne/i, ndongo: /Ngola/i };
    const names = Object.keys(MACHINES) as (keyof typeof MACHINES)[];
    const reached: Record<string, number> = {};
    const priced: Record<string, number> = {}, priceable: Record<string, number> = {};
    const rumoured: Record<string, number> = {}, heardAtOnce: Record<string, number> = {}, rumourTotal: Record<string, number> = {};
    let senWarShut = 0, senWar = 0, senReopen = 0, akWarShut = 0, akWar = 0, akReopen = 0;
    for (let s = 1; s <= Math.min(SEEDS, 40); s++) {
      const h = makeHost(s) as PowersHost; h.powers = newPowers(); h.ledger = [];
      h.markets.modifiers = (p, t) => marketModifiers(p, t, h.powers);
      let lastId = 0;
      const prev: Record<string, number> = {};
      const reopened = { sen: false, ak: false };
      for (let m = 0; m < 31 * 12; m++) {
        tickWorld(h, 1);
        const t = h.worldT!, st = h.powers!;
        for (const k of names) {
          const ph = machinePhase({ st }, k).phase;
          if (ph >= 1 && (prev[k] ?? 0) !== ph) {
            reached[`${k}${ph}:${s}`] = 1;
            // a phase in force moves a price, a stock or the dues somewhere it names
            priceable[`${k}${ph}`] = (priceable[`${k}${ph}`] ?? 0) + 1;
            if (PORTS_OF[k].some((p) => { const mm = marketModifiers(p, t, st); return Object.keys(mm.priceMult).length + Object.keys(mm.stockMult).length > 0 || mm.duesMult !== 1; })) priced[`${k}${ph}`] = (priced[`${k}${ph}`] ?? 0) + 1;
          }
          prev[k] = ph;
        }
        // the Wolof and the Akan wars shut their lanes and the lanes open again
        const senWarOn = activeEffects(st, t).some((e) => e.power === 'sahel' && e.kind === 'war');
        const akWarOn = activeEffects(st, t).some((e) => e.power === 'akan' && e.kind === 'war');
        if (senWarOn) { senWar++; if (marketModifiers('portudal', t, st).laneClosed) senWarShut++; reopened.sen = true; }
        else if (reopened.sen && !marketModifiers('portudal', t, st).laneClosed) { senReopen++; reopened.sen = false; }
        if (akWarOn) { akWar++; if (marketModifiers('axim', t, st).laneClosed) akWarShut++; reopened.ak = true; }
        else if (reopened.ak && !activeEffects(st, t).some((e) => e.power === 'akan' && e.closes) && !marketModifiers('axim', t, st).laneClosed) { akReopen++; reopened.ak = false; }
        for (const r of st.rumours) {
          if (r.id <= lastId) continue;
          for (const k of names) if (r.power === MACHINES[k].power && PORTS_OF[k].includes(r.place) && PAT[k].test(r.claim)) {
            rumourTotal[k] = (rumourTotal[k] ?? 0) + 1;
            if (r.truth === 'true') { rumoured[`${k}:${s}`] = 1; if (reaches(r, r.place, r.born)) heardAtOnce[k] = (heardAtOnce[k] ?? 0) + 1; }
          }
        }
        lastId = st.nextId - 1;
      }
    }
    const seedsReaching = (k: string, ph: number): number => Object.keys(reached).filter((x) => x.startsWith(`${k}${ph}:`)).length;
    for (const k of names) console.log(`  ${k}: seeds reaching phases 1/2/3 = ${[1, 2, 3].map((ph) => seedsReaching(k, ph)).join('/')} of ${Math.min(SEEDS, 40)}; ${rumourTotal[k] ?? 0} rumours`);
    check('every conflict machine reaches its last phase in a good share of seeds (a quarter at least)', names.every((k) => seedsReaching(k, 3) >= Math.min(SEEDS, 40) * 0.25), names.map((k) => `${k}:${seedsReaching(k, 3)}`).join(' '));
    check('Senegal and Akan wars are reached in some seeds; Kongo’s contest and Ndongo’s withheld tribute too', seedsReaching('senegal', 2) >= 2 && seedsReaching('akan', 2) >= 1 && seedsReaching('kongo', 2) >= 3 && seedsReaching('ndongo', 2) >= 3, `senegal ${seedsReaching('senegal', 2)}, akan ${seedsReaching('akan', 2)}, kongo ${seedsReaching('kongo', 2)}, ndongo ${seedsReaching('ndongo', 2)}`);
    check('every phase of every machine puts a price, a stock or the dues in force at its ports', Object.keys(priceable).every((k) => priced[k] === priceable[k]), Object.keys(priceable).filter((k) => priced[k] !== priceable[k]).join(','));
    check('every machine tells a plain rumour that is heard where it began', names.every((k) => (rumourTotal[k] ?? 0) > 0 && (heardAtOnce[k] ?? 0) > 0), names.map((k) => `${k}:${heardAtOnce[k] ?? 0}`).join(' '));
    check('the Wolof war shuts the lane at Portudal for every month of it, and the lane reopens', senWar > 0 && senWarShut === senWar && senReopen > 0, `shut ${senWarShut}/${senWar}, reopened ${senReopen} times`);
    check('the Akan war shuts the beach at Axim for every month of it, and it reopens', akWar > 0 && akWarShut === akWar && akReopen > 0, `shut ${akWarShut}/${akWar}, reopened ${akReopen} times`);
    // The succession of Kongo states no year: the machine begins from 1506 and is not a dated scene.
    const g = new Game(5); g.worldT = g.clock.t;
    check('the Kongo succession is a machine that begins no earlier than 1506 (and is not in the dated schedule)', !SCHEDULE.some((x) => x.id === 'kongo-succession') && g.powers.powers.kongo.flags.kscPhase === undefined);
  }

  // 6e. The Gold: fever is a danger to the company on the coast, the stage's price reaches Lisbon, and a collapse or a revolt shuts the beach.
  {
    const st = newPowers();
    const T = 86400 * 400;
    st.fronts.gold.stage = 2;
    check('fever pressure is nothing off the Gold Coast, and rises with the stage and with a fever season on it', goldFever(st, 'lisboa', T) === 0 && goldFever(st, 'mina', T) > 0 && (() => { const a = goldFever(st, 'mina', T); st.powers.akan.flags.feverUntil = T + 30 * DAY; const b = goldFever(st, 'mina', T); st.fronts.gold.stage = 4; const c = goldFever(st, 'mina', T); return b > a && c > b; })());
    const ouro = (stage: 1 | 2 | 3 | 4): number => { st.fronts.gold.stage = stage; return marketModifiers('lisboa', T, st).priceMult.ouro ?? 1; };
    const o = [ouro(1), ouro(2), ouro(3), ouro(4)];
    check('the Gold’s stage raises the price of gold at Lisbon as the beach hardens', o[0] === 1 && o[1] > 1 && o[2] > o[1] && o[3] > o[2], o.map((x) => x.toFixed(3)).join(' '));
    st.fronts.gold.stage = 4;
    const mm = marketModifiers('mina', T, st);
    check('at stage four the beach at Mina is let in at a toll and the gold stock is a little over half', mm.stockMult.ouro !== undefined && mm.stockMult.ouro < 0.7 && mm.duesMult > 1.4);
    let revolts = 0, collapses = 0, fevers = 0, strains = 0, welcomes = 0, hot = 0;
    for (let s = 1; s <= Math.min(N, 16); s++) {
      const r = playSeed(s, 31, 'press');
      for (const m of r.host.powers!.powers.akan.moves) { if (m.kind === 'revolt') revolts++; if (m.kind === 'collapse') collapses++; if (m.kind === 'fever') fevers++; if (m.kind === 'welcome') welcomes++; }
      strains += r.host.powers!.powers.crown.moves.filter((m) => m.kind === 'strain').length;
      hot++;
    }
    check('in runs of a captain who presses, the Gold has fever seasons, garrison strain, revolts and a closed beach', fevers > 0 && strains > 0 && revolts > 0 && collapses > 0, `fever ${fevers}, strain ${strains}, revolts ${revolts}, collapses ${collapses} over ${hot} runs`);
    void welcomes;
  }

  // 6f. The Claim: the stage sets the rival’s pace; Castile’s moves; Las Palmas.
  {
    const st = newPowers();
    const pace = ([1, 2, 3, 4] as const).map((k) => { st.fronts.claim.stage = k; return racePace(st); });
    check('the Race heats the rival’s house: pace 1 at stage one, then up with each stage; no Powers state, no change', pace[0] === 1 && pace[1] > 1 && pace[2] > pace[1] && pace[3] > pace[2] && racePace(null) === 1, pace.join(' '));
    const T = 86400 * 400;
    st.fronts.claim.stage = 3;
    check('at the line drawn, Las Palmas’s harbour dues rise (Castile’s harbour-master)', marketModifiers('las-palmas', T, st).duesMult > 1);
    let moves = 0, seedsWith = 0;
    for (let s = 1; s <= Math.min(N, 20); s++) {
      const r = playSeed(s, 31, 'random');
      const k = r.host.powers!.powers.castile.moves.filter((m) => ['note', 'interlopers', 'canaries', 'pilots', 'landing'].includes(m.kind)).length;
      moves += k; if (k > 0) seedsWith++;
    }
    check('Castile moves in nearly every played run (notes, interlopers, Las Palmas, hired pilots, a landing)', seedsWith >= Math.min(N, 20) * 0.8 && moves / Math.min(N, 20) >= 2, `${(moves / Math.min(N, 20)).toFixed(1)} moves a run, ${seedsWith} runs`);
  }

  // 6g. The scenes: forward only, every choice answers, the Ledger gets real tags, and the Fronts are what offers them.
  {
    const along_ = (p: string): number => along(anchorageOf(portDef(p)));
    const ROAD = ['lisboa', 'funchal', 'las-palmas', 'arguim', 'mina', 'mpinda', 'benguela', 'mocambique', 'melinde', 'calecute', 'cochim'];
    const bad: string[] = [];
    for (const sc of FRONT_SCENES) {
      if (!sc.ports.every((p) => ROAD.includes(p))) bad.push(`${sc.id}: off the road`);
      const last = Math.max(...sc.ports.map(along_));
      for (const a of sc.after ?? []) {
        const pre = FRONT_SCENES.find((x) => x.id === a);
        if (!pre) { bad.push(`${sc.id}: unknown after ${a}`); continue; }
        if (Math.min(...pre.ports.map(along_)) > last + 1) bad.push(`${sc.id} needs ${a}, which is only further along`);
      }
    }
    check('no Front scene needs one that lies only further along the road (road.ts along())', bad.length === 0, bad.join('; '));
    check('about twenty Front scenes: six at the Court, four each at the Crescent, the Gold and the Claim, and one each for Kongo and the Wolof edge', FRONT_SCENES.length === 20 && FRONT_SCENES.filter((s) => s.id.startsWith('court-')).length === 6 && FRONT_SCENES.filter((s) => s.id.startsWith('crescent-')).length === 4 && FRONT_SCENES.filter((s) => s.id.startsWith('gold-')).length === 4 && FRONT_SCENES.filter((s) => s.id.startsWith('claim-')).length === 4, `${FRONT_SCENES.length} scenes`);
    check('scene ids do not collide with the Traffic’s or the courts’', FRONT_SCENES.every((x) => !TRAFFIC_SCENES.some((y) => y.id === x.id) && !POWER_SCENES.some((y) => y.id === x.id)));

    // Prime a game so that every scene’s condition holds at once, then sail the road forward in laps, answering each in turn. The Court’s scenes
    // live in dated windows (the old King failing, the new reign’s first months, the Edict coming and come, Easter 1506), so three eras are primed.
    const prime = (seed: number, era: 'A' | 'B' | 'C'): Game => {
      const g = new Game(seed);
      g.clock.t = (era === 'A' ? daysFromEpoch(1496, 3, 1) : era === 'B' ? daysFromEpoch(1497, 6, 1) : daysFromEpoch(1507, 6, 1)) * DAY; g.worldT = g.clock.t;
      g.chronicle.act = 5; g.crown.gold = 9000; g.crown.patent = null; g.casa.regard = 0.3;
      const st = g.powers;
      for (const f of ['gold', 'claim', 'crescent', 'court'] as const) { st.fronts[f].stage = 4; st.fronts[f].base = 13; }
      st.powers.mamluk.flags.league = g.clock.t;
      st.powers.akan.flags.feverUntil = g.clock.t + 400 * DAY;
      st.powers.akan.flags.akqPhase = 1; st.powers.kongo.flags.kscPhase = 2; st.powers.sahel.flags.senPhase = 1;
      addEffect(st, { kind: 'stub', power: 'castile', ports: ['mina'], start: g.clock.t - DAY, end: g.clock.t + 900 * DAY, reason: 'Interlopers.' });
      addEffect(st, { kind: 'stub', power: 'mamluk', ports: ['lisboa'], start: g.clock.t - DAY, end: g.clock.t + 900 * DAY, reason: 'Venice.' });
      addEffect(st, { kind: 'convoy', power: 'mamluk', ports: ['adem'], start: g.clock.t - DAY, end: g.clock.t + 900 * DAY, reason: 'A convoy.' });
      g.rival.claimed.push('mpinda', 'benguela');
      if (era === 'A') { g.identity.warned['king-dies'] = g.clock.t - 200 * DAY; g.identity.warned['edict'] = g.clock.t - 20 * DAY; }
      if (era === 'B') g.identity.applied.push('edict');
      if (era === 'C') g.identity.applied.push('edict', 'easter-1506');
      g.identity.patron = favouriteEvents(g)[0].patron;
      g.identity.warned[favouriteEvents(g)[0].id] = g.clock.t - 20 * DAY;
      return g;
    };
    const ERAS = ['A', 'B', 'C'] as const;
    const reached = new Set<string>();
    let crashes = 0, tagBad = 0;
    const textBad: string[] = [];
    for (let seed = 1; seed <= 24; seed++) {
      const gg = prime(seed, ERAS[seed % 3]);
      const r2 = new Rng(seed * 17);
      for (let lap = 0; lap < 4; lap++) {
        for (const port of ROAD) {
          gg.dockedAt = port;
          gg.clock.t += 30 * DAY;
          for (let k = 0; k < 8; k++) {
            let ev;
            try { ev = dueFrontScene(gg, port); } catch (e) { crashes++; console.log(String(e)); break; }
            if (!ev) break;
            reached.add(ev.id);
            if (!ev.text || ev.text.length < 200 || ev.choices!.length < 2 || ev.choices!.some((c) => !c.label || !c.detail)) textBad.push(ev.id);
            const n0 = gg.ledger.length;
            try { const said = ev.choices![r2.int(0, ev.choices!.length - 1)].resolve(gg); if (typeof said !== 'string' || !said) crashes++; } catch (e) { crashes++; console.log(String(e)); }
            for (const e of gg.ledger.slice(n0)) if (!isTag(e.tag)) tagBad++;
          }
        }
      }
    }
    const missing = FRONT_SCENES.map((x) => `front:${x.id}`).filter((id) => !reached.has(id));
    check('every Front scene is reached by sailing the road forward (laps of the Carreira) and answers without error', crashes === 0 && missing.length === 0, `missing: ${missing.join(',') || 'none'}; crashes ${crashes}`);
    check('every scene has a body, two choices at least, and a stated cost on each; the Ledger gets only real tags', textBad.length === 0 && tagBad === 0, [...new Set(textBad)].join(','));

    // Every choice of every scene, from a fresh primed game each time.
    let choiceCrash = 0, choices = 0;
    for (const sc of FRONT_SCENES) {
      const eraOf = (id: string): 'A' | 'B' | 'C' => (id === 'court-new-king' || id === 'court-edict-warn' || id === 'court-old-king' ? 'A' : id === 'court-funchal' ? 'B' : 'C');
      const probe = prime(40, eraOf(sc.id));
      probe.dockedAt = sc.ports[0];
      probe.powers.seen = {};
      let n = 0;
      try { n = sc.build(probe, probe.powers).choices!.length; } catch (e) { choiceCrash++; console.log(`${sc.id}: ${String(e)}`); continue; }
      for (let i = 0; i < n; i++) {
        const g2 = prime(41 + i, eraOf(sc.id));
        g2.dockedAt = sc.ports[0];
        try { sc.build(g2, g2.powers).choices![i].resolve(g2); choices++; } catch (e) { choiceCrash++; console.log(`${sc.id}[${i}]: ${String(e)}`); }
      }
    }
    check('every choice of every Front scene resolves', choiceCrash === 0 && choices >= 50, `${choices} choices`);

    // Scenes are not offered unless the Front, the Effect or the warning is there.
    const quiet = new Game(7); quiet.worldT = quiet.clock.t; quiet.dockedAt = 'mina';
    check('with every Front at stage one and nothing in force, no Front scene is offered at Mina, Lisbon or Cochim', ['mina', 'lisboa', 'cochim', 'melinde', 'mpinda', 'arguim'].every((p) => dueFrontScene(quiet, p) === null));
  }

  // 6h. The Rua Nova’s Lines: it pays the hull against her output, with a visible cut; only its own captain, only while it stands.
  {
    const mk = (patron: PatronId): Game => {
      const g = new Game(12); g.worldT = g.clock.t; g.crown.gold = 50; g.crown.debt = 0; g.crown.patent = null; g.dockedAt = 'lisboa';
      g.identity.patron = patron; g.identity.patrons.ruanova.favour = 0.4; g.clock.t = daysFromEpoch(1500, 3, 1) * DAY;
      return g;
    };
    const ref = mk('crown');
    check('the Rua Nova funds no Line for a captain who sails for another patron', !ruaNovaTerms(ref).ok && canFundLine(ref, 'lisboa', 'funchal', 'caravela-latina') !== null);
    const g = mk('ruanova');
    const terms = ruaNovaTerms(g);
    const why0 = canFundLine(g, 'lisboa', 'funchal', 'caravela-latina');
    check('it funds one for its own captain, on terms that are printed (a cut of 12% and 8% on the advance)', terms.ok && why0 === null && Math.abs(terms.cut - 0.12) < 1e-9 && terms.interest === 0.08, `${why0 ?? 'ok'} ${terms.cut}`);
    const gold0 = g.crown.gold;
    const said = openFundedLine(g, 'lisboa', 'funchal', 'caravela-latina');
    const l = g.lines[g.lines.length - 1];
    check('the hull is paid by the Rua Nova and not out of the purse, and the advance is a loan in the Ledger', g.crown.gold === gold0 && !!l?.funded && l.funded.owed > l.funded.advanced && g.ledger.some((e) => e.tag === 'loan.taken'), said.slice(0, 80));
    let lastText = '';
    for (let i = 0; i < 40 && l.trips < 6 && !l.lost; i++) {
      g.clock.t += 20 * DAY; g.worldT = g.clock.t;
      tickLines(g);
      if (g.remittances.length) lastText = g.remittances[g.remittances.length - 1].voyage ?? '';
    }
    if (!l.lost) {
      check('every profitable voyage’s page names the Rua Nova’s cut and what is still owed', l.trips >= 1 && /The Rua Nova (kept|took)/.test(lastText), lastText.slice(-120));
      check('the cut is kept, and the debt falls, from the voyages’ own output', l.funded!.kept >= 0 && l.funded!.owed <= l.funded!.advanced * 1.08 + 1e-6);
    } else {
      check('a funded Line that is lost leaves its debt against the captain', g.crown.debt > 0);
    }
    const fallen = mk('ruanova'); fallen.identity.patrons.ruanova.fell = fallen.clock.t - DAY; fallen.identity.patrons.ruanova.recovers = fallen.clock.t + 200 * DAY;
    check('and not while the Rua Nova itself has fallen (the Edict, Easter 1506)', !ruaNovaTerms(fallen).ok);
    const sold = mk('ruanova'); openFundedLine(sold, 'lisboa', 'funchal', 'caravela-latina');
    const owed0 = sold.lines[sold.lines.length - 1].funded!.owed;
    const gold1 = sold.crown.gold;
    const sale = closeLine(sold, sold.lines[sold.lines.length - 1]);
    check('selling her pays the Rua Nova first, and says so', /Rua Nova/.test(sale) && sold.crown.gold - gold1 < owed0, sale);
  }
}

console.log(fails === 0 ? 'POWERS PASSED' : `POWERS FAILED (${fails})`);
process.exit(fails === 0 ? 0 : 1);

// A tiny indirection so the bundle keeps `announce` without a second import block above.
function require_(_: string): { announce: typeof import('../src/world/powers').announce } {
  return { announce: announceImpl };
}
import { announce as announceImpl } from '../src/world/powers';
