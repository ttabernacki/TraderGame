/**
 * Falsifier for chart grade (B4): grade is monotone with the data, all four states exist and have a distinct word and
 * colour, lane risk reads the grade, and every golden save computes a grade.
 *   npx esbuild scripts/charts.ts --bundle --platform=node --format=cjs --outfile=/tmp/charts.cjs && node /tmp/charts.cjs
 *
 * Ground truth is the Chart's own data (passes, standing, the soundings book) set by hand, not the grade function.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { Game } from '../src/game/state';
import { AGREED_W } from '../src/navigation/charts';
import { GRADE_COLOUR, GRADE_WORD, gradeOf, riskMultiplier, type Grade } from '../src/navigation/chartGrade';
import { coastVerticesNear } from '../src/world/landmass';
import { portDef } from '../src/world/ports';

let fails = 0;
const check = (name: string, ok: boolean, extra = ''): void => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };

// 1. Monotone over the whole data lattice: more passes, more standing, soundings in the book: never a lower grade.
{
  const ws = [0, 0.2, 0.6, 1, 1.5, 4].map((k) => k * AGREED_W);
  let bad = 0;
  for (let p = 0; p <= 4; p++) for (let wi = 0; wi < ws.length; wi++) for (const s of [false, true]) {
    const g0 = gradeOf(p, ws[wi], s);
    if (p < 4 && gradeOf(p + 1, ws[wi], s) < g0) bad++;
    if (wi < ws.length - 1 && gradeOf(p, ws[wi + 1], s) < g0) bad++;
    if (!s && gradeOf(p, ws[wi], true) < g0) bad++;
  }
  check('grade never falls as passes, standing or soundings grow', bad === 0, `${bad} violations`);
  const seen = new Set<number>();
  for (let p = 0; p <= 1; p++) for (const w of ws) for (const s of [false, true]) seen.add(gradeOf(p, w, s));
  check('all four grades are reachable from data', [0, 1, 2, 3].every((x) => seen.has(x)));
  check('four distinct words and colours', new Set(Object.values(GRADE_WORD)).size === 4 && new Set(Object.values(GRADE_COLOUR)).size === 4
    && GRADE_WORD[0] === 'Rumour' && GRADE_WORD[3] === 'Sounded');
  check('risk multiplier is (1 - 0.5 * grade / 3)', riskMultiplier(0) === 1 && riskMultiplier(3) === 0.5 && Math.abs(riskMultiplier(1) - (1 - 0.5 / 3)) < 1e-12);
}

// 2. In a real chart: the grade read at a coast follows the data held there.
{
  const g = new Game(1);
  const at = portDef('arguim');
  const v = coastVerticesNear({ lat: at.lat, lon: at.lon }, 40)[0];
  const key = `${v.land}:${v.index}`;
  const here = { lat: v.lat, lon: v.lon };
  const p = g.chart.points.get(key) ?? (() => { g.chart.seedLand(v.land); return g.chart.points.get(key)!; })();
  g.soundedGround.length = 0;
  p.passes = 0; p.wLon = 0.1 * AGREED_W;
  const g0 = g.gradeAt(here);
  p.passes = 1;
  const g1 = g.gradeAt(here);
  p.wLon = 1.2 * AGREED_W;
  const g2 = g.gradeAt(here);
  g.soundedGround.push({ lat: v.lat, lon: v.lon, nm: 100, source: 'the pilots of Arguim' });
  const g3 = g.gradeAt(here);
  check('rumour -> sketch -> surveyed -> sounded as data accrues', g0 === 0 && g1 === 1 && g2 === 2 && g3 === 3, `${g0}${g1}${g2}${g3}`);
  // A chart survey pass really does raise it.
  const g4 = new Game(2);
  const before = g4.gradeAt(here);
  g4.chart.survey(here, here, 25, g4.clock.t, 0.8, 4, 8);
  check('a survey pass at an offing never lowers the grade', g4.gradeAt(here) >= before, `${before} -> ${g4.gradeAt(here)}`);
  // An open sea has no coast to grade.
  check('open ocean is not a coast', (() => { const w = new Game(1); return w.gradeAt({ lat: 10, lon: -40 }) === 0; })());

  // 3. Lane risk reads the grade.
  const from = { lat: at.lat + 1, lon: at.lon - 1 }, to = { lat: at.lat - 3, lon: at.lon + 1 };
  const g5 = new Game(1);
  const r0 = g5.laneRisk(from, to);
  for (const w of coastVerticesNear({ lat: at.lat - 1, lon: at.lon }, 400)) {
    const k = `${w.land}:${w.index}`;
    const pt = g5.chart.points.get(k);
    if (pt) { pt.passes = Math.max(pt.passes, 2); pt.wLon = Math.max(pt.wLon, 3 * AGREED_W); }
  }
  const r1 = g5.laneRisk(from, to);
  g5.soundedGround.push({ lat: at.lat - 1, lon: at.lon, nm: 600, source: 'the pilots of Arguim' });
  const r2 = g5.laneRisk(from, to);
  check('lane risk falls as the coast is surveyed and sounded, within [0.5, 1]', r0 >= r1 && r1 >= r2 && r2 < r0 && r0 <= 1 && r2 >= 0.5, `${r0.toFixed(3)} ${r1.toFixed(3)} ${r2.toFixed(3)}`);
}

// 4. Golden saves compute a grade and a lane risk.
{
  let ok = 0;
  const all = readdirSync('fixtures/saves').filter((f) => f.endsWith('.json'));
  for (const f of all) {
    try {
      const g = Game.deserialize(readFileSync(`fixtures/saves/${f}`, 'utf8'));
      const gr: Grade = g.gradeAt(g.ship.state.pos);
      const r = g.laneRisk({ lat: 38.7, lon: -9.1 }, { lat: 5.1, lon: -1.9 });
      if (gr >= 0 && gr <= 3 && r >= 0.5 && r <= 1) ok++;
    } catch (e) { console.log(f, String(e)); }
  }
  check('every golden save computes a grade and a lane risk', ok === all.length, `${ok}/${all.length}`);
}

console.log(fails === 0 ? '\ncharts: all ok' : `\ncharts: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
