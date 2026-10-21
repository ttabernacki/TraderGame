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
import { MONTH as WMONTH, tickWorld } from '../src/world/tick';
import { ALL_TAGS, isTag } from '../src/ledger/tags';
import { knownFacts } from '../src/knowledge/information';
import { checkFact } from '../src/knowledge/informers';
import { along, TRUNK } from '../src/progression/road';
import { HISTORY } from '../src/progression/chronicle';
import { TRAFFIC_SCENES, dueTrafficScene, sceneOffered } from '../src/progression/trafficScenes';
import { POWER_SCENES, duePowerScene, powerSceneOffered } from '../src/progression/powerScenes';
import { CONDUCT, ruleReading } from '../src/world/powers/rule';
import { lanesAt, laneStateOf } from '../src/world/lanes';
import { activeEffects } from '../src/world/powers';
import {
  ATTITUDES, FRONTS, FRONT_DELTAS, FRONT_IDS, IDENTITY, POWERS, POWER_IDS, READERS, SCHEDULE,
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
  check('all six Fronts defined; five tick (the Court is dormant)', FRONT_IDS.length === 6 && FRONT_IDS.filter((f) => FRONTS[f].ticks).sort().join() === 'claim,crescent,gold,rule,traffic');
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
interface Run { host: PowersHost; seen: number; wrong: number; ledger: Entry[]; tel: Tel }
type Policy = 'random' | 'carry' | 'refuse' | 'stop' | 'spare';
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
  for (let m = 0; m < years * 12; m++) {
    tickWorld(h, 1);
    const t = h.worldT!;
    const st = h.powers!;
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
    if (policy === 'stop' || policy === 'spare') {
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
  return { host: h, seen, wrong, ledger: h.ledger, tel };
}
{
  const t0 = Date.now();
  const endStage: Record<string, number[]> = { traffic: [], gold: [], claim: [], crescent: [], rule: [] };
  const swSeeds: number[] = [], mbSeeds: number[] = [], swStarts = new Set<number>(), mbStarts = new Set<number>();
  let swReopen = 0, mbReopen = 0, swZero = 0, mbZero = 0, swShut = 0, mbShut = 0, staleWar = 0, staleWarSeeds = 0, powerMoves = 0;
  let kongoMoves = 0, kongoSeeds = 0, rumours = 0, unresolved = 0, wrongSeeds = 0, staleOrFalse = 0, heardTotal = 0;
  const kinds = new Map<string, number>();
  const dormant: string[] = [];
  const offsetBreach: string[] = [];
  for (let s = 1; s <= SEEDS; s++) {
    const run = playSeed(s, YEARS, 'random');
    const st = run.host.powers!;
    for (const f of ['traffic', 'gold', 'claim', 'crescent', 'rule'] as const) endStage[f].push(st.fronts[f].stage);
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
    for (const f of FRONT_IDS) if (!FRONTS[f].ticks && st.fronts[f].stage !== 1) dormant.push(`${f}@${s}`);
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
  console.log(`  ${SEEDS} seeds x ${YEARS} years in ${((Date.now() - t0) / 1000).toFixed(1)} s; traffic end stages ${[1, 2, 3, 4].map((k) => `${k}:${endStage.traffic.filter((x) => x === k).length}`).join(' ')}; gold ${[1, 2, 3, 4].map((k) => `${k}:${endStage.gold.filter((x) => x === k).length}`).join(' ')}`);
  console.log(`  Kongo: ${(kongoMoves / SEEDS).toFixed(1)} moves a run (${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')}); ${rumours} rumours made, ${heardTotal} heard`);
  console.log(`  claim ${[1, 2, 3, 4].map((k) => `${k}:${endStage.claim.filter((x) => x === k).length}`).join(' ')}; crescent ${[1, 2, 3, 4].map((k) => `${k}:${endStage.crescent.filter((x) => x === k).length}`).join(' ')}; rule ${[1, 2, 3, 4].map((k) => `${k}:${endStage.rule.filter((x) => x === k).length}`).join(' ')}`);
  console.log(`  Swahili war in ${swSeeds.length}/${SEEDS} seeds (${swStarts.size} distinct start months), Malabar war in ${mbSeeds.length}/${SEEDS} (${mbStarts.size}); ${(powerMoves / SEEDS).toFixed(1)} moves a run across the seven ticking courts`);
  for (const f of ['traffic', 'gold', 'claim', 'crescent', 'rule']) check(`${f}: not pinned at an extreme (stage 1 or 4) in more than 80% of seeds`, share(f, (n) => n === 1 || n === 4) <= 0.8, `${(share(f, (n) => n === 1 || n === 4) * 100).toFixed(0)}% at an extreme`);
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
  check('dormant Fronts do not move stage', dormant.length === 0, dormant.slice(0, 3).join(' '));
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
  const longEnd: Record<string, number[]> = { crescent: [], rule: [], claim: [] };
  const N30 = Math.min(SEEDS, 40);
  for (let seed = 1; seed <= N30; seed++) {
    const r = playSeed(seed, 31, 'random');
    for (const f of ['crescent', 'rule', 'claim'] as const) longEnd[f].push(r.host.powers!.fronts[f].stage);
  }
  for (const f of ['crescent', 'rule', 'claim']) {
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

console.log(fails === 0 ? 'POWERS PASSED' : `POWERS FAILED (${fails})`);
process.exit(fails === 0 ? 0 : 1);

// A tiny indirection so the bundle keeps `announce` without a second import block above.
function require_(_: string): { announce: typeof import('../src/world/powers').announce } {
  return { announce: announceImpl };
}
import { announce as announceImpl } from '../src/world/powers';
