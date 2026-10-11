// Bake polars for the Ming hulls: npx esbuild scripts/genXiyangPolars.ts --bundle --platform=node --format=cjs --outfile=/tmp/gxp.cjs && node /tmp/gxp.cjs
import { writeFileSync } from 'node:fs';
import { polarSpeed, deriveHull } from '../src/ship/physics';
import { XIYANG_HULLS } from '../src/campaigns/xiyang/hulls';
import { Game } from '../src/game/state';

const WINDS = [4, 8, 12, 16, 20, 26, 34, 44];
const g = new Game(1);
const tune = (g as any).tuning;
const rows: string[] = [];
for (const h of XIYANG_HULLS) {
  const d = deriveHull(h);
  const table: string[] = [];
  for (const w of WINDS) {
    const line: number[] = [];
    for (let beta = 0; beta <= 180; beta += 10) line.push(Number(polarSpeed(h, d, w, beta, tune).toFixed(2)));
    table.push(`    [${line.join(', ')}],`);
  }
  rows.push(`  '${h.id}': [\n${table.join('\n')}\n  ],`);
}
writeFileSync('src/campaigns/xiyang/polars.ts', `/** Baked by scripts/genXiyangPolars.ts, in the same layout as ship/polars. */\nexport const XIYANG_POLARS: Record<string, number[][]> = {\n${rows.join('\n')}\n};\n`);
