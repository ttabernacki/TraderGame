/**
 * The Year (C3) falsifiers.
 *
 *   npx esbuild scripts/year.ts --bundle --platform=node --format=cjs --outfile=/tmp/year.cjs \
 *     && node /tmp/year.cjs [seeds=6] [firstSeed=1] [maxVoyages=5]
 *
 * 1. The season window against an independent ground truth: for every departure day of a
 *    year, the month the clock itself reads on the arrival day (Casa days to Melinde) is April..September
 *    exactly when `inWindow` says the window is open.
 * 2. A multi-year loop with the career bot: at each Lisbon quay the phase is homecoming iff a card is
 *    pending, otherwise quarters iff the window is shut; cards are read and dismissed; at most one card
 *    per career year; the year number never goes backward; half the seeds winter until the window opens
 *    (and then sailing is `on-time`), half sail at once (always allowed).
 * 3. No step requires backward travel: away from Lisbon the phase is always `season`, the quarters
 *    panel is null, no card is pending, and three years' waiting at Funchal changes nothing but the year number.
 * 4. Fixtures: every saved game resolves to a valid phase and a well-formed year; round trip is exact.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { Clock, daysFromEpoch } from '../src/core/clock';
import { Game } from '../src/game/state';
import { play } from './lib/careerCore';
import { consequenceOf, daysToOpen, dismissHomecoming, inWindow, quartersView, seasonWindow, yearNumber, yearPhase } from '../src/game/year';

let fails = 0;
const fail = (m: string) => { fails++; if (fails < 40) console.log('FAIL', m); };
const need = (ok: boolean, m: string) => { if (!ok) fail(m); };
const DAY = 86400;

// --- 1. the window, against the clock's own calendar
for (const hull of ['caravela-latina', 'nau']) {
  const w = seasonWindow(hull);
  const base = daysFromEpoch(1485, 1, 1);
  let open = 0;
  for (let d = 0; d < 365; d++) {
    const t0 = (base + d) * DAY + 6 * 3600;
    const c = new Clock(); c.t = t0;
    const arrive = new Clock(); arrive.t = t0 + w.passage * DAY;
    const m = arrive.date.month;
    const truth = m >= 4 && m <= 9;
    const mine = inWindow(w, c.dayOfYear);
    if (truth !== mine) fail(`${hull}: day ${d} (${c.formatDate()}) arrival month ${m} but window ${mine}`);
    if (mine) open++;
    const k = consequenceOf(w, t0);
    if ((k.kind === 'on-time') !== truth) fail(`${hull}: consequence ${k.kind} disagrees with arrival month ${m}`);
    if (k.kind === 'early' && !(m < 4)) fail(`${hull}: early but month ${m}`);
    if (!mine && daysToOpen(w, c.dayOfYear) <= 0) fail(`${hull}: shut window but daysToOpen 0 on ${c.formatDate()}`);
    if (mine && daysToOpen(w, c.dayOfYear) !== 0) fail(`${hull}: open window but daysToOpen > 0`);
  }
  // six months of the year, give or take the month lengths
  need(open >= 175 && open <= 190, `${hull}: window open ${open} days`);
  console.log(`window ${hull}: ${w.passage} days to Melinde, open ${open} days/yr`);
}

// --- 2. the multi-year bot loop
const nSeeds = Number(process.argv[2] ?? 6);
const first = Number(process.argv[3] ?? 1);
const maxVoyages = Number(process.argv[4] ?? 5);
let cards = 0, wintered = 0, maxYear = 0, multiYear = 0;
for (let s = first; s < first + nSeeds; s++) {
  const winter = s % 2 === 1;
  let lastYear = 0;
  const shown = new Map<number, number>();
  const r = play(s, {
    maxVoyages, maxYears: 12, debug: false,
    onVoyage: (g: Game) => {
      const y = yearNumber(g);
      need(y >= lastYear && y >= 1, `seed ${s}: year ${y} after ${lastYear}`);
      lastYear = y;
      const p = yearPhase(g);
      if (g.year.pending) {
        need(p === 'homecoming', `seed ${s}: pending card but phase ${p}`);
        const card = g.year.pending;
        need(card.lines.length >= 1 && card.lines.length <= 8, `seed ${s}: card has ${card.lines.length} lines`);
        need(card.lines.every((l) => l.length > 0 && !/NaN|undefined/.test(l)), `seed ${s}: card text ${card.lines.join(' | ')}`);
        if (process.env.SHOW_CARD && cards === 0) console.log(card.lines.join('\n'));
        shown.set(card.year, (shown.get(card.year) ?? 0) + 1);
        cards++;
        dismissHomecoming(g);
        need(yearPhase(g) !== 'homecoming', `seed ${s}: still homecoming after dismissal`);
      }
      const ph = yearPhase(g);
      const open = inWindow(seasonWindow(g.ship.baseHull.id), g.clock.dayOfYear);
      need(ph === (open ? 'season' : 'quarters'), `seed ${s}: phase ${ph} but window open=${open}`);
      need(!!quartersView(g), `seed ${s}: no quarters view at Lisbon`);
      if (winter && ph === 'quarters') {
        const w = seasonWindow(g.ship.baseHull.id);
        g.waitDays(daysToOpen(w, g.clock.dayOfYear) + 1);
        wintered++;
        need(yearPhase(g) === 'season', `seed ${s}: wintered but phase ${yearPhase(g)}`);
        if (g.chronicle.act >= 3) need(consequenceOf(w, g.clock.t).kind === 'on-time', 'wintered to the window yet not on-time');
      }
    },
  });
  maxYear = Math.max(maxYear, lastYear);
  if (lastYear >= 2) multiYear++;
  for (const [yr, n] of shown) need(n <= 1, `seed ${s}: ${n} cards in year ${yr}`);
  // And the bot's final state after arrival at Lisbon.
  const g = r.game;
  if (g.dockedAt === 'lisboa' && g.year.pending) {
    need(yearPhase(g) === 'homecoming', `seed ${s}: ended home with a card but phase ${yearPhase(g)}`);
    cards++;
  }
  need(!r.exception, `seed ${s}: exception ${r.exception}`);
  console.log(`seed ${s}${winter ? ' (winters)' : ''}: ${r.voyages} voyages, year ${lastYear}, ${r.days} days, ended [${r.ended}]`);
}
console.log(`loop: ${cards} cards, ${wintered} winterings, ${multiYear}/${nSeeds} seeds past year 1, max year ${maxYear}`);
need(cards > 0, 'no homecoming card appeared in any seed');

// --- 3. a captain who never goes back
{
  const g = new Game(3);
  g.mode = 'port';
  g.dockedAt = 'funchal';
  const y0 = yearNumber(g);
  for (let i = 0; i < 36; i++) g.waitDays(30);
  need(g.dockedAt === 'funchal', 'wait moved the ship');
  need(yearPhase(g) === 'season', `away from Lisbon phase ${yearPhase(g)}`);
  need(quartersView(g) === null, 'quarters panel away from Lisbon');
  need(g.year.pending === null, 'card pending away from Lisbon');
  need(yearNumber(g) >= y0 + 2, `year did not roll: ${y0} -> ${yearNumber(g)}`);
  console.log(`away: funchal for three years, year ${y0} -> ${yearNumber(g)}, phase season, no card`);
}

// --- 4. fixtures: phase, shape, round trip
const DIR = 'fixtures/saves';
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
  const g = Game.deserialize(readFileSync(`${DIR}/${f}`, 'utf8'));
  const ph = yearPhase(g);
  need(['quarters', 'season', 'homecoming'].includes(ph), `${f}: phase ${ph}`);
  need(g.dockedAt === 'lisboa' || ph === 'season', `${f}: away from Lisbon but phase ${ph}`);
  need(g.year && g.year.pending === null && Number.isFinite(g.year.lastHomeYear), `${f}: year state malformed`);
  need(yearNumber(g) >= 1, `${f}: year ${yearNumber(g)}`);
  const qv = quartersView(g);
  need((g.dockedAt === 'lisboa') === (qv !== null), `${f}: quarters view presence`);
  if (qv) need(qv.items.length >= 4 && qv.consequence.length > 0 && !/NaN|undefined/.test(qv.season + qv.consequence), `${f}: quarters text`);
  // Give her a baseline and a card, then round-trip.
  g.year.baseline = { t: g.clock.t - 40 * DAY, year: 1, purse: g.crown.gold - 100, deaths: 0, grades: [0, 0, 0, 0], coverage: 0, ledgerLen: 0, discoveries: 0 };
  g.year.lastHomeYear = 1;
  const g2 = Game.deserialize(g.serialize());
  need(JSON.stringify(g2.year) === JSON.stringify(g.year), `${f}: year round trip`);
  need(yearPhase(g2) === ph, `${f}: phase changed on round trip`);
  console.log(`fixture ${f}: ${ph}, year ${yearNumber(g)}`);
}

console.log(fails ? `${fails} FAILURES` : 'year: ok');
process.exit(fails ? 1 : 0);
