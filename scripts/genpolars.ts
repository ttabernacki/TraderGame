import { writeFileSync } from 'node:fs';
import { polarSpeed, deriveHull } from '../src/ship/physics';
import { HULL_CLASSES } from '../src/ship/hull';
import { Game } from '../src/game/state';

const WINDS = [4, 8, 12, 16, 20, 26, 34, 44];
const BETA_STEP = 10; // 0..180 inclusive -> 19 columns

const g = new Game(1);
const tune = (g as any).tuning;

const rows: string[] = [];
for (const h of HULL_CLASSES) {
  const d = deriveHull(h);
  const table: string[] = [];
  for (const w of WINDS) {
    const line: number[] = [];
    for (let beta = 0; beta <= 180; beta += BETA_STEP) {
      line.push(Number(polarSpeed(h, d, w, beta, tune).toFixed(2)));
    }
    table.push(`    [${line.join(', ')}],`);
  }
  rows.push(`  '${h.id}': [\n${table.join('\n')}\n  ],`);
  process.stderr.write(`${h.id} done\n`);
}

const src = `import { clamp } from '../core/math';

/**
 * What every hull in the game will actually do, on every point of sail, in
 * every strength of wind.
 *
 * Generated from \`polarSpeed()\` — the same integrator the player's own ship is
 * sailed with — because a second ship on the horizon has to be sailed by the
 * same physics as the first one or the chase is a lie. Running the integrator
 * live costs about four milliseconds a call, which is a frame, so it is run
 * once here instead and the answers are baked. \`scripts/genpolars.ts\` rebuilds
 * this file; \`polars.test\` re-derives it and fails if it has drifted.
 *
 * Read it and the whole tactical shape of the period falls out. A caravela
 * latina makes four knots at thirty degrees off the wind; a nau makes nothing
 * at all until sixty. Running square before it the nau is the faster ship. So
 * a caravel escapes a carrack by hauling her wind and a carrack escapes a
 * caravel by squaring away, and neither of those is a rule anybody had to
 * write down — it is what the sails do.
 */

/** Wind speeds the table is sampled at, knots. */
export const POLAR_WINDS = [${WINDS.join(', ')}];
/** Degrees between columns. Column i is the apparent wind \`i * 10\` off the bow. */
export const POLAR_BETA_STEP = ${BETA_STEP};

/** hull id -> [wind index][beta index] -> knots. */
export const POLARS: Record<string, number[][]> = {
${rows.join('\n')}
};

/**
 * Best speed this hull will make with the wind \`beta\` degrees off her bow,
 * bilinearly interpolated out of the table.
 *
 * \`beta\` is the bearing of the wind's *source* off the bow, so 0 is in irons
 * and 180 is dead before it, and the sign does not matter.
 */
export function polarAt(hullId: string, windKnots: number, beta: number): number {
  const table = POLARS[hullId];
  if (!table) return 0;
  const b = clamp(Math.abs(((beta % 360) + 360) % 360 > 180
    ? 360 - (((beta % 360) + 360) % 360)
    : ((beta % 360) + 360) % 360), 0, 180);
  const bi = b / POLAR_BETA_STEP;
  const b0 = Math.floor(bi);
  const b1 = Math.min(b0 + 1, table[0].length - 1);
  const bf = bi - b0;

  let wi = 0;
  while (wi < POLAR_WINDS.length - 2 && windKnots > POLAR_WINDS[wi + 1]) wi++;
  const w0 = POLAR_WINDS[wi];
  const w1 = POLAR_WINDS[wi + 1];
  const wf = clamp((windKnots - w0) / (w1 - w0), 0, 1);

  const lo = table[wi][b0] + (table[wi][b1] - table[wi][b0]) * bf;
  const hi = table[wi + 1][b0] + (table[wi + 1][b1] - table[wi + 1][b0]) * bf;
  return Math.max(0, lo + (hi - lo) * wf);
}

/**
 * The closest she will lie to the wind and still go anywhere.
 *
 * Read off the same table rather than from the rig profiles, so it is the angle
 * she actually sails at rather than the one the aerofoil says she could.
 */
export function polarNoGo(hullId: string, windKnots: number): number {
  for (let beta = 0; beta <= 180; beta += 2) {
    if (polarAt(hullId, windKnots, beta) > 1.2) return beta;
  }
  return 180;
}
`;
writeFileSync('../src/ship/polars.ts', src);
console.log('wrote src/ship/polars.ts');
