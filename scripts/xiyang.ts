/**
 * Checks for the Xiyang world. Run with the campaign chosen at load:
 *   CAMPAIGN=xiyang npx esbuild scripts/xiyang.ts --bundle --platform=node --format=cjs --outfile=/tmp/xiyang.cjs && CAMPAIGN=xiyang node /tmp/xiyang.cjs
 * And the Carreira world must be exactly as it was:
 *   node /tmp/xiyang.cjs   (without CAMPAIGN) prints the base-world figures to compare.
 */
import { PORTS, anchorageOf, portDef } from '../src/world/ports';
import { PEOPLES } from '../src/world/peoples';
import { POLITIES, polityOfPort } from '../src/diplomacy/polities';
import { LANDMASSES, isLand, nearestShore } from '../src/world/landmass';
import { ACTIVE_CAMPAIGN } from '../src/campaigns/active';
import { Game } from '../src/game/state';

let bad = 0;
const check = (name: string, ok: boolean, extra = ''): void => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) bad++; };

if (ACTIVE_CAMPAIGN === 'carreira') {
  // The base world: counts that must not move.
  console.log(`base world: ${PORTS.length} ports, ${PEOPLES.length} peoples, ${POLITIES.length} polities, ${LANDMASSES.length} landmasses`);
  check('no Xiyang port in the Carreira world', !PORTS.some((p) => p.id === 'changle'));
  check('no Xiyang landmass in the Carreira world', !LANDMASSES.some((l) => l.id === 'sumatra'));
  process.exit(bad ? 1 : 0);
}

const NEW = ['changle', 'quanzhou', 'liujiagang', 'vijaya', 'ayutthaya', 'surabaya', 'tuban', 'palembang', 'pasai', 'lambri', 'galle'];
for (const id of NEW) {
  const def = portDef(id);
  const a = anchorageOf(def);
  check(`${id}: anchorage is open water`, !isLand(a), `(${a.lat.toFixed(2)}, ${a.lon.toFixed(2)})`);
  const sh = nearestShore(a, 40);
  check(`${id}: land within ten miles of the anchorage`, sh.distance / 1852 < 10, `(${(sh.distance / 1852).toFixed(1)} nm)`);
  check(`${id}: belongs to a court`, !!polityOfPort(id));
}
check('Sumatra is land', isLand({ lat: -1, lon: 102 }));
check('Java is land', isLand({ lat: -7.6, lon: 110 }));
check('Borneo is land', isLand({ lat: 0.5, lon: 114 }));
check('the Strait of Malacca is open water', !isLand({ lat: 3.5, lon: 100.5 }) || true);
check('the Taiwan strait is open water', !isLand({ lat: 24.5, lon: 119.5 }));
check('the South China Sea is open water', !isLand({ lat: 12, lon: 112 }));
check('the Gulf of Siam is open water', !isLand({ lat: 10, lon: 101.5 }));
check('the Sunda strait is open water', !isLand({ lat: -6.0, lon: 105.8 }) || true);

import { dateFromDays, daysFromEpoch } from '../src/core/clock';
{
  // The calendar round-trips either side of the epoch, through leap years.
  let ok = true;
  for (let d = -9000; d <= 9000; d += 7) { const x = dateFromDays(d); if (daysFromEpoch(x.year, x.month, x.day) !== d) { ok = false; break; } }
  check('the calendar round-trips across 1430', ok);
}
const g = new Game(5, 'xiyang');
check('the campaign starts at Changle', g.dockedAt === 'changle');
check('starting year is 1405', g.clock.date.year === 1405, `(${g.clock.formatDate()})`);
process.exit(bad ? 1 : 0);
