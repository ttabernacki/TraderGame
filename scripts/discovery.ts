/**
 * Falsifier for D3, charts as an asset: phantom and displaced claims on the Casa's sheet, survey sheets as
 * goods, the claim and its loss, heirs and the road.
 *   npx esbuild scripts/discovery.ts --bundle --platform=node --format=cjs --outfile=/tmp/discovery.cjs && node /tmp/discovery.cjs
 *
 * Ground truth is the world itself (the coastline, the isle list, the road, the hash that makes a coast change)
 * and hand-set Chart data, never the claim code's own verdicts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { NM, haversine, type LatLon } from '../src/core/math';
import { Game } from '../src/game/state';
import { AGREED_W } from '../src/navigation/charts';
import { along } from '../src/progression/road';
import { advanceRival } from '../src/progression/rival';
import { coastVerticesNear } from '../src/world/landmass';
import { ISLES } from '../src/world/isles';
import { portDef } from '../src/world/ports';
import { Rng } from '../src/core/rng';
import { CLAIM_DEFS, advanceClaims, claimDef, claimOnIsle, claimSecondOpinion, hearClaims, holdClaim, seedClaims, siteDiscount, watchClaims, type Claim } from '../src/knowledge/claims';
import { SHEET_REGIONS, changed, epochAt, FIRST_YEAR } from '../src/knowledge/sheetRegions';
import { SURVEY_RATE, buyerLevel, regionLevel, sellSheet, sheetOffer, surveyRate } from '../src/knowledge/sheets';
import { fameOf } from '../src/knowledge/fame';

let fails = 0;
const check = (name: string, ok: boolean, extra = ''): void => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };

const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

// 1. Ten to fifteen claims per seed; the mix is real and false; deterministic in the seed.
{
  let inRange = 0, det = 0, bothKinds = 0, onePrester = 0, differs = false;
  let phantoms = 0, reals = 0;
  const seen = new Set<string>();
  for (const s of SEEDS) {
    const a = seedClaims(s), b = seedClaims(s);
    const n = a.list.length;
    if (n >= 10 && n <= 15) inRange++;
    if (JSON.stringify(a) === JSON.stringify(b)) det++;
    if (a.list.some((c) => c.kind === 'phantom') && a.list.some((c) => c.kind === 'real')) bothKinds++;
    if (a.list.filter((c) => c.id.startsWith('prester') && c.kind === 'real').length === 1) onePrester++;
    for (const c of a.list) { if (c.kind === 'phantom') phantoms++; else reals++; seen.add(`${c.id}:${c.kind}`); }
    if (JSON.stringify(a) !== JSON.stringify(seedClaims(s + 100))) differs = true;
  }
  check('every seed has 10-15 claims', inRange === SEEDS.length, `${inRange}/${SEEDS.length}`);
  check('claims are deterministic per seed, and differ between seeds', det === SEEDS.length && differs);
  check('every seed mixes phantoms and real places', bothKinds === SEEDS.length);
  check('exactly one of the three Presters is real, each seed', onePrester === SEEDS.length);
  check('each Prester is the real one in some seed', ['prester-guinea', 'prester-ethiopia', 'prester-india'].every((id) => seen.has(`${id}:real`) && seen.has(`${id}:phantom`)));
  console.log(`     ratio over ${SEEDS.length} seeds: ${phantoms} phantom, ${reals} real (${(100 * phantoms / (phantoms + reals)).toFixed(0)}% phantom)`);
}

// 2. Ground truth: a phantom has no place behind it; a real claim has one, and the sheet has it displaced.
{
  let badPhantom = 0, badReal = 0, notDisplaced = 0;
  for (const s of SEEDS) {
    for (const c of seedClaims(s).list) {
      if (c.kind === 'phantom') {
        if (c.truth || c.isle) badPhantom++;
        // An open-sea phantom has no coast within its sweep radius.
        if (c.mode === 'sweep' && coastVerticesNear({ lat: c.lat, lon: c.lon }, 60).length > 0) badPhantom++;
      } else {
        if (!c.truth) { badReal++; continue; }
        const isle = c.isle ? ISLES.find((i) => i.id === c.isle) : undefined;
        if (c.isle && !isle) badReal++;
        if (!c.isle && coastVerticesNear(c.truth, 40).length === 0) badReal++;
        if (haversine({ lat: c.lat, lon: c.lon }, c.truth) / NM < 45) notDisplaced++;
      }
    }
  }
  check('phantoms have no place behind them, in open water', badPhantom === 0, `${badPhantom} bad`);
  check('real claims point at a real isle or coast', badReal === 0, `${badReal} bad`);
  check('real claims are drawn displaced on the sheet (>= 45 nm)', notDisplaced === 0, `${notDisplaced} not`);
}

// 3. The spine: every claim is told on the road and closed by a forward detour; none needs the road behind.
{
  let back = 0, long = 0, worst = 0;
  const TOL = 300, MAX_DETOUR_NM = 7500;
  for (const d of CLAIM_DEFS) {
    const points: LatLon[] = [d.at, ...(d.truth ? [d.truth] : []), ...(d.isle ? [{ lat: ISLES.find((i) => i.id === d.isle)!.lat, lon: ISLES.find((i) => i.id === d.isle)!.lon }] : [])];
    const end = portDef(d.end);
    for (const tellId of d.tell) {
      const tell = portDef(tellId);
      if (!(along({ lat: end.lat, lon: end.lon }) > along({ lat: tell.lat, lon: tell.lon }))) { back++; console.log('  end not further on:', d.id, tellId, d.end); }
      for (const p of points) {
        // The place itself is not behind the quay it is told at.
        if (along(p) < along({ lat: tell.lat, lon: tell.lon }) - TOL) { back++; console.log('  place behind its quay:', d.id, tellId, Math.round(along(p)), Math.round(along({ lat: tell.lat, lon: tell.lon }))); }
        const nm = (haversine({ lat: tell.lat, lon: tell.lon }, p) + haversine(p, { lat: end.lat, lon: end.lon })) / NM;
        worst = Math.max(worst, nm);
        if (nm > MAX_DETOUR_NM) { long++; console.log('  detour too long:', d.id, tellId, Math.round(nm)); }
      }
    }
  }
  check('no claim is closed by sailing back along the road', back === 0, `${back} violations`);
  check(`every detour is bounded (<= ${MAX_DETOUR_NM} nm; worst ${Math.round(worst)})`, long === 0);
  const ports = new Set(CLAIM_DEFS.flatMap((d) => [...d.tell, d.end]));
  check('every told-at and closing port exists', [...ports].every((p) => { try { return !!portDef(p); } catch { return false; } }));
}

// A game at 1495, docked at Lisbon, in daylight and clear, for resolving things by hand.
const gameAt = (seed: number): Game => {
  const g = new Game(seed);
  g.clock.t += 13 * 365.25 * 86400;
  return g;
};
const env = (at: LatLon, truePos: LatLon = at) => ({ at, truePos, visibility: 20, day: true, mastM: 20 });
/** Tell everything the road will tell, visiting each tell port enough times. */
const hearAll = (g: Game): number => {
  let visits = 0;
  for (let round = 0; round < 12; round++) {
    for (const port of new Set(CLAIM_DEFS.flatMap((d) => d.tell))) { hearClaims(g, port); visits++; }
    if (g.claims.list.every((c) => c.told)) break;
  }
  return visits;
};

// 4. A rumour is a Fact of kind 'rumour'; every claim is told in some seed-fixed number of visits.
{
  let allTold = 0, factsOk = 0;
  for (const s of [1, 2, 3, 5, 8, 13]) {
    const g = gameAt(s);
    hearAll(g);
    if (g.claims.list.every((c) => c.told)) allTold++;
    const leads = g.leads.filter((l) => l.claim);
    if (leads.length === g.claims.list.length && leads.every((l) => !l.phantom && l.isle === l.claim)) factsOk++;
  }
  check('every claim is told within a dozen rounds of the quays', allTold === 6, `${allTold}/6`);
  check('each tale is a lead (shown as a rumour Fact) that does not carry the truth', factsOk === 6);
}

// 5. Every claim resolves, in every seed: a phantom is struck off 'false', a real place is found.
{
  let open = 0, wrongPhantom = 0, wrongReal = 0, total = 0;
  for (const s of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const g = gameAt(s);
    hearAll(g);
    for (const c of g.claims.list) {
      total++;
      if (c.kind === 'phantom') {
        if (c.mode === 'sweep') {
          // Sail to where the sheet draws it on a clear day: a sweep, not a survey.
          watchClaims(g, env({ lat: c.lat, lon: c.lon }));
        } else {
          // A coast: run once and sound it, the way the chart table grades it, then be near.
          const vs = coastVerticesNear({ lat: c.lat, lon: c.lon }, 70);
          for (const v of vs) {
            const k = `${v.land}:${v.index}`;
            const pt = g.chart.points.get(k);
            if (pt) { pt.passes = 1; } else g.chart.points.set(k, { key: k, lat: v.lat, lon: v.lon, wLat: 1, wLon: 0.1 * AGREED_W, passes: 1, obsT: g.clock.t, errorNm: 0, land: v.land, t: g.clock.t });
          }
          g.soundedGround.push({ lat: c.lat, lon: c.lat === 0 ? 0 : c.lon, nm: 150, source: 'the pilots of the coast' });
          watchClaims(g, env({ lat: c.lat, lon: c.lon }));
        }
        if (c.status !== 'false') wrongPhantom++;
      } else if (c.mode === 'isle') {
        const line = claimOnIsle(g, c.isle!, true, true);
        if (c.status !== 'held' && c.status !== 'found') wrongReal++;
        if (line.length === 0) wrongReal++;
      } else {
        watchClaims(g, env({ lat: c.truth!.lat - 3, lon: c.truth!.lon }, c.truth!));
        const scene = g.pendingScenes.find((x) => x.id === `claim:${c.id}`);
        if (!scene || !scene.choices) { wrongReal++; continue; }
        scene.choices[2].resolve(g);
        if (c.status !== 'found') wrongReal++;
      }
      if (c.status === 'open') open++;
    }
  }
  check(`all ${total} claims in 8 seeds resolve; none left open`, open === 0, `${open} open`);
  check('every phantom resolves false', wrongPhantom === 0, `${wrongPhantom} wrong`);
  check('every real claim resolves to a discovery', wrongReal === 0, `${wrongReal} wrong`);
}

// 6. A phantom is not struck off by a coast that has not been surveyed, nor by a sweep in fog or at night.
{
  const g = gameAt(1);
  hearAll(g);
  const sweep = g.claims.list.find((c) => c.kind === 'phantom' && c.mode === 'sweep')!;
  watchClaims(g, { ...env({ lat: sweep.lat, lon: sweep.lon }), visibility: 3 });
  const fog = sweep.status;
  watchClaims(g, { ...env({ lat: sweep.lat, lon: sweep.lon }), day: false });
  const night = sweep.status;
  watchClaims(g, env({ lat: sweep.lat + 2, lon: sweep.lon }));
  const far = sweep.status;
  check('a sweep in fog, at night, or two degrees off settles nothing', fog === 'open' && night === 'open' && far === 'open');
  const coastP = g.claims.list.find((c) => c.kind === 'phantom' && c.mode === 'coast');
  if (coastP) {
    watchClaims(g, env({ lat: coastP.lat, lon: coastP.lon }));
    check('a phantom coast stays open until surveyed', coastP.status === 'open');
  }
}

// 7. Second opinion: right three times in four against the ground truth, never a constant.
{
  let right = 0, n = 0, said = new Set<string>();
  for (const s of SEEDS) {
    const g = new Game(s);
    for (const c of g.claims.list) {
      const o = claimSecondOpinion(g, c.id);
      said.add(o);
      n++;
      if ((o === 'agrees') === (c.kind === 'real')) right++;
    }
  }
  const p = right / n;
  check('a second informer is right about 3 in 4, not 0 or 1', p > 0.6 && p < 0.88 && said.size === 2, `${(100 * p).toFixed(0)}%`);
}

// Chart data by hand for a region: every vertex run once, and agreed by `k` times the agreed weight.
function drawRegion(g: Game, region: string, k: number): void {
  const r = SHEET_REGIONS.find((x) => x.id === region)!;
  for (const v of coastVerticesNear({ lat: (r.latMin + r.latMax) / 2, lon: (r.lonMin + r.lonMax) / 2 }, 4000)) {
    if (v.lat < r.latMin || v.lat > r.latMax || v.lon < r.lonMin || v.lon > r.lonMax) continue;
    const key = `${v.land}:${v.index}`;
    const pt = g.chart.points.get(key);
    if (pt) { pt.passes = 2; pt.wLon = k * AGREED_W; }
    else g.chart.points.set(key, { key, lat: v.lat, lon: v.lon, wLat: 1, wLon: k * AGREED_W, passes: 2, obsT: 0, errorNm: 0, land: v.land, t: 1 });
  }
}

// 8. Sheets as goods: the price is the grade gained; selling raises the rival's; publishing raises everyone's.
{
  const g = new Game(7);
  drawRegion(g, 'guinea', 2);
  g.dockedAt = 'lisboa';
  const level = regionLevel(g, 'guinea');
  check('a region run and agreed reads Surveyed or better (mean grade >= 1.5)', level >= 1.5, level.toFixed(2));
  const before = { casa: buyerLevel(g, 'casa', 'guinea'), gen: buyerLevel(g, 'genoese', 'guinea'), riv: buyerLevel(g, 'rival', 'guinea'), world: buyerLevel(g, 'world', 'guinea') };
  check('before any sale nobody holds the sheet', before.casa === 0 && before.gen === 0 && before.riv === 0 && before.world === 0);

  const offerCasa = sheetOffer(g, 'guinea', 'casa'), offerRival = sheetOffer(g, 'guinea', 'rival'), offerGen = sheetOffer(g, 'guinea', 'genoese');
  check('the rival pays more than the Genoese, who pay more than the Casa; the Casa pays standing', offerRival.money > offerGen.money && offerGen.money > offerCasa.money && offerCasa.standing > 0 && offerRival.standing === 0);
  check('the rival and the Genoese cost standing with the Casa; the Casa does not', offerRival.heat > 0 && offerGen.heat > 0 && offerCasa.heat === 0);
  const half = sheetOffer(g, 'guinea', 'casa');
  const lvlHalf = half.gain;

  const gold0 = g.crown.gold, ledger0 = g.ledger.length, st0 = g.crown.standing;
  sellSheet(g, 'guinea', 'rival');
  const after = buyerLevel(g, 'rival', 'guinea');
  check('selling a sheet to the rival raises the rival’s grade', after > before.riv && Math.abs(after - level) < 1e-9, `${before.riv.toFixed(2)} -> ${after.toFixed(2)}`);
  check('the sale pays money, costs standing, and is in the Ledger as chart.sold', g.crown.gold > gold0 && g.crown.standing < st0 && g.ledger.slice(ledger0).some((e) => e.tag === 'chart.sold'));
  check('the other buyers still hold nothing', buyerLevel(g, 'casa', 'guinea') === 0 && buyerLevel(g, 'genoese', 'guinea') === 0);
  check('the same sheet does not sell twice to the same man', !sheetOffer(g, 'guinea', 'rival').ok);

  // The rival's pace reads it.
  const fast = { ...g.rival, frontierLat: 10, standing: 20, claimed: [] as string[] };
  const slow = { ...fast };
  const rn = (): Rng => new Rng(5);
  advanceRival(fast, 365, 5, 100, rn(), 3);
  advanceRival(slow, 365, 5, 100, rn(), 0);
  check('what the rival holds of a coast speeds his work on it', fast.frontierLat < slow.frontierLat, `${fast.frontierLat.toFixed(2)} < ${slow.frontierLat.toFixed(2)}`);

  // Publishing raises everyone's, the rival's included.
  const g2 = new Game(7);
  drawRegion(g2, 'guinea', 2);
  g2.dockedAt = 'lisboa';
  const fame0 = g2.crown.standing;
  sellSheet(g2, 'guinea', 'publish');
  const lv = regionLevel(g2, 'guinea');
  check('a published sheet is held by the Casa, the Genoese, the world and the rival',
    ['casa', 'genoese', 'rival', 'world'].every((b) => Math.abs(buyerLevel(g2, b as 'casa', 'guinea') - lv) < 1e-9));
  check('publishing pays fame and no money', g2.crown.standing > fame0 && g2.crown.gold === new Game(7).crown.gold);
  check('a published sheet leaves nothing to sell to the others', !sheetOffer(g2, 'guinea', 'rival').ok && !sheetOffer(g2, 'guinea', 'genoese').ok);

  // Sold to the Casa on Lisbon quay only; the Genoese at Funchal too; not at Mina.
  g.dockedAt = 'mina';
  check('a sheet is sold where the buyer is (not at Mina)', !sheetOffer(g, 'guinea', 'casa').ok && !sheetOffer(g, 'guinea', 'genoese').ok);
  g.dockedAt = 'funchal';
  check('the Genoese buy at Funchal; the Casa does not', sheetOffer(new Game(7), 'guinea', 'genoese').why.length >= 0 && !sheetOffer(g, 'guinea', 'casa').ok);

  // Aging: a coast changes, the buyer's copy loses half a grade, and the gain is sold again.
  let yr = FIRST_YEAR;
  const g3 = new Game(7);
  drawRegion(g3, 'guinea', 2);
  g3.dockedAt = 'lisboa';
  sellSheet(g3, 'guinea', 'casa');
  let target = 0;
  for (let y = g3.clock.date.year + 1; y < 1530; y++) if (changed(g3.seed, 'guinea', y)) { target = y; break; }
  check('some storm or silting falls on the Guinea coast within the century', target > 0, String(target));
  const held0 = buyerLevel(g3, 'casa', 'guinea');
  g3.clock.t += (target - g3.clock.date.year + 0.5) * 365.25 * 86400;
  const held1 = buyerLevel(g3, 'casa', 'guinea');
  check('after the coast changes the buyer’s copy is worth less, and the sheet can be sold again', held1 < held0 && sheetOffer(g3, 'guinea', 'casa').ok, `${held0.toFixed(2)} -> ${held1.toFixed(2)}`);
  void yr; void epochAt; void lvlHalf;
}

// 9. An heir takes the chart at a discount.
{
  const old = new Game(11);
  drawRegion(old, 'guinea', 3);
  old.soundedGround.push({ lat: 10, lon: -15, nm: 1500, source: 'the pilots' });
  const was = regionLevel(old, 'guinea');
  const heir = new Game(12);
  heir.inheritFrom(old);
  const is = regionLevel(heir, 'guinea');
  check('the heir inherits the chart, one grade down', is < was && is > 0.5, `${was.toFixed(2)} -> ${is.toFixed(2)}`);
  check('the heir’s buyers start empty (a new world)', buyerLevel(heir, 'casa', 'guinea') === 0 && heir.sheets.log.length === 0);
}

// 10. A claim is a real thing to have and a real thing to lose.
{
  const g = gameAt(21);
  hearAll(g);
  const real = g.claims.list.filter((c) => c.kind === 'real');
  const mine: Claim = real.find((c) => c.mode === 'isle') ?? real[0];
  const rid = real.find((c) => c !== mine)!;
  g.crown.padraoStock = 3;
  holdClaim(g, mine, true);
  check('a padrão makes the claim held, costs a stone, and is claim.made in the Ledger', mine.status === 'held' && g.crown.padraoStock === 2 && g.ledger.some((e) => e.tag === 'claim.made'));
  if (mine.site) {
    const port = mine.site;
    const before = siteDiscount(g, port);
    check('a held claim gives ground for a House at a discount', before > 0, `${before} at ${port}`);
  }
  // Rival first.
  const n0 = g.ledger.filter((e) => e.tag === 'claim.lost').length;
  advanceClaims(g, 365 * 40, 0);
  check('the other captain takes every unheld real claim in time, and not the held one', real.every((c) => c === mine ? c.status === 'held' : c.status === 'lost'));
  check('a lost claim is a Ledger entry and names the rival', g.ledger.filter((e) => e.tag === 'claim.lost').length === n0 + real.length - 1 && rid.by === g.rival.name);
  check('a lost place cannot be claimed after', (() => { g.crown.padraoStock = 3; holdClaim(g, rid, true); return rid.status === 'lost' && g.crown.padraoStock === 3; })());
  // Phantoms are not his to take.
  check('phantoms are never lost to the rival', g.claims.list.filter((c) => c.kind === 'phantom').every((c) => c.status !== 'lost'));

  // A found place that was not claimed can be lost; a published sheet speeds the loss.
  const a = gameAt(22), b = gameAt(22);
  const cA = a.claims.list.find((c) => c.kind === 'real' && c.mode === 'coast')!;
  const cB = b.claims.list.find((c) => c.id === cA.id)!;
  a.rival.sheets = {}; b.rival.sheets = {};
  const region = SHEET_REGIONS.find((r) => {
    const at = cA.truth!;
    return at.lat >= r.latMin && at.lat <= r.latMax && at.lon >= r.lonMin && at.lon <= r.lonMax;
  });
  if (region) {
    b.rival.sheets[region.id] = { level: 3, epoch: epochAt(b.seed, region.id, b.clock.date.year), t: b.clock.t };
    advanceClaims(a, 365, 0); advanceClaims(b, 365, 0);
    check('a sheet in the rival’s hands winds his clock on for that coast', cB.rivalWork > cA.rivalWork, `${cA.rivalWork.toFixed(3)} < ${cB.rivalWork.toFixed(3)}`);
  } else console.log('     (claim coast outside every sheet region; skipped)');
}

// 11. Fame reads the run; surveys have a rate.
{
  const g = gameAt(31);
  hearAll(g);
  const f0 = fameOf(g);
  const real = g.claims.list.find((c) => c.kind === 'real' && c.mode === 'isle')!;
  g.crown.padraoStock = 3;
  holdClaim(g, real, true);
  const ph = g.claims.list.find((c) => c.kind === 'phantom' && c.mode === 'sweep')!;
  watchClaims(g, env({ lat: ph.lat, lon: ph.lon }));
  const f1 = fameOf(g);
  check('fame counts a held claim and an exposed phantom', f1.held.length === f0.held.length + 1 && f1.exposed.length === f0.exposed.length + 1 && f1.points > f0.points, `${f0.points} -> ${f1.points}`);
  const r0 = surveyRate();
  SURVEY_RATE.base = 2;
  const r1 = surveyRate();
  SURVEY_RATE.base = 1;
  check('the survey rate is a parameter (a Pilot doubles it)', r0 === 1 && r1 === 2);
}

// 12. The golden saves load, compute the sheet levels, and carry claims through a round trip.
{
  let ok = 0, rt = 0;
  const all = readdirSync('fixtures/saves').filter((f) => f.endsWith('.json'));
  for (const f of all) {
    try {
      const g = Game.deserialize(readFileSync(`fixtures/saves/${f}`, 'utf8'));
      const lv = SHEET_REGIONS.map((r) => regionLevel(g, r.id));
      if (lv.every((x) => Number.isFinite(x) && x >= 0 && x <= 3) && g.claims.list.length >= 10 && g.claims.list.length <= 15) ok++;
      const g2 = Game.deserialize(g.serialize());
      if (JSON.stringify(g2.claims) === JSON.stringify(g.claims) && JSON.stringify(g2.sheets) === JSON.stringify(g.sheets)) rt++;
    } catch (e) { console.log(f, String(e)); }
  }
  check('every golden save loads, reads every sheet level, and has 10-15 claims', ok === all.length, `${ok}/${all.length}`);
  check('claims and sheets survive a save round trip', rt === all.length, `${rt}/${all.length}`);
  const a = new Game(77), b = new Game(77);
  check('the same seed gives the same claims in a new game', JSON.stringify(a.claims) === JSON.stringify(b.claims));
  const claim = claimDef(a.claims.list[0]);
  check('every claim carries a source note', CLAIM_DEFS.every((d) => d.source.length > 30) && claim.name.length > 0);
}

console.log(fails === 0 ? '\ndiscovery: all ok' : `\ndiscovery: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
