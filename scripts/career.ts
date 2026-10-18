/**
 * Full-career bot. Plays Lisbon -> (the road) -> Lisbon, voyage after voyage, headlessly,
 * through the Game's own API, until the epilogue (Crown.routeOpened), the game ends, or a budget runs out.
 *
 *   npx esbuild scripts/career.ts --bundle --platform=node --format=cjs --outfile=/tmp/career.cjs \
 *     && node /tmp/career.cjs [seeds=3] [firstSeed=1] [maxVoyages=12] [maxYears=40]
 *
 * Per seed it prints: acts reached, days, final purse, epilogue yes/no, snaps (times the bot had to
 * lift the ship past something that held her), exception text. Exit code non-zero on any exception.
 */
import { play, type Result } from './lib/careerCore';

const nSeeds = Number(process.argv[2] ?? 3);
const first = Number(process.argv[3] ?? 1);
const maxVoyages = Number(process.argv[4] ?? 12);
const maxYears = Number(process.argv[5] ?? 40);
const DEBUG = !!process.env.BOT_DEBUG;

let bad = 0;
const rows: Result[] = [];
for (let s = first; s < first + nSeeds; s++) {
  const r = play(s, { maxVoyages, maxYears, debug: DEBUG });
  rows.push(r);
  const failed = !!r.exception;
  if (failed) bad++;
  console.log(`${failed ? 'FAIL' : 'ok  '} seed ${r.seed}: act ${r.act}/5  days ${r.days}  purse ${r.gold}  epilogue ${r.epilogue ? 'YES' : 'no'}  `
    + `voyages ${r.voyages}  snaps ${r.snaps}  trades ${r.trades}  audiences ${r.audiences}  ${(r.wallMs / 1000).toFixed(1)}s  [${r.ended}]`
    + (r.exception ? `\n     EXCEPTION ${r.exception}` : ''));
}
const eps = rows.filter((r) => r.epilogue).length;
console.log(`-- ${rows.length} seeds, ${eps} epilogues, max act ${Math.max(...rows.map((r) => r.act))}, ${bad} exceptions`);
process.exit(bad ? 1 : 0);
