// The Western Ocean roads, measured: days, made-good speed, share of road within 55° of the wind.
// CAMPAIGN=xiyang npx esbuild scripts/xiyangRoutes.ts --bundle --platform=node --format=cjs --outfile=/tmp/xr.cjs && CAMPAIGN=xiyang node /tmp/xr.cjs [hullId]
import { prevailingWind } from '../src/world/wind';
import { currentAt } from '../src/world/currents';
import { polarAt } from '../src/ship/polars';
import { isLand } from '../src/world/landmass';
type P = { lat: number; lon: number };
const R: { name: string; pts: P[]; months: number[]; expect: 'fair' | 'hard' }[] = [
  { name: 'Changle→Champa (NE monsoon)', pts: [{ lat: 25.9, lon: 119.9 }, { lat: 22, lon: 116.3 }, { lat: 18, lon: 112.8 }, { lat: 14, lon: 109.6 }], months: [11, 12, 1, 2], expect: 'fair' },
  { name: 'Changle→Champa in the SW monsoon (should be hard)', pts: [{ lat: 25.9, lon: 119.9 }, { lat: 22, lon: 116.3 }, { lat: 18, lon: 112.8 }, { lat: 14, lon: 109.6 }], months: [7], expect: 'hard' },
  { name: 'Champa→Java', pts: [{ lat: 13.8, lon: 109.5 }, { lat: 8, lon: 108.5 }, { lat: 3, lon: 108 }, { lat: -2.5, lon: 108.2 }, { lat: -5.5, lon: 110 }, { lat: -6.4, lon: 112.2 }], months: [1, 2, 3], expect: 'fair' },
  { name: 'Java→Malacca by the strait', pts: [{ lat: -6.2, lon: 111.5 }, { lat: -4, lon: 107 }, { lat: -1.5, lon: 105.3 }, { lat: 1.2, lon: 104.4 }, { lat: 1.8, lon: 102.3 }], months: [5, 6, 8], expect: 'fair' },
  { name: 'Malacca→Pasai (up the strait)', pts: [{ lat: 2.2, lon: 102 }, { lat: 3.8, lon: 100.2 }, { lat: 5.1, lon: 97.9 }], months: [11, 12], expect: 'fair' },
  { name: 'Lambri→Galle across the Bay (NE monsoon)', pts: [{ lat: 5.7, lon: 95 }, { lat: 5.8, lon: 88 }, { lat: 6, lon: 81.4 }], months: [11, 12, 1, 2], expect: 'fair' },
  { name: 'Galle→Calicut', pts: [{ lat: 5.8, lon: 80.2 }, { lat: 7.5, lon: 77 }, { lat: 11, lon: 75.5 }], months: [11, 12, 1, 2], expect: 'fair' },
  { name: 'Lambri→Galle in the SW monsoon (should be hard)', pts: [{ lat: 5.7, lon: 95 }, { lat: 5.8, lon: 88 }, { lat: 6, lon: 81.4 }], months: [7], expect: 'hard' },
  { name: 'Galle→Lambri (SW monsoon)', pts: [{ lat: 6, lon: 81.4 }, { lat: 5.8, lon: 88 }, { lat: 5.7, lon: 95 }], months: [5, 6, 7, 8], expect: 'fair' },
  { name: 'Malacca→Champa (SW monsoon, north)', pts: [{ lat: 1.9, lon: 102.3 }, { lat: 1.1, lon: 103.4 }, { lat: 1.0, lon: 104.5 }, { lat: 3, lon: 107.5 }, { lat: 8, lon: 109 }, { lat: 13.8, lon: 109.6 }], months: [5, 6, 7], expect: 'fair' },
  { name: 'Champa→Changle (SW monsoon, north)', pts: [{ lat: 13.8, lon: 109.6 }, { lat: 18, lon: 112.8 }, { lat: 22, lon: 116.3 }, { lat: 25.9, lon: 119.9 }], months: [5, 6, 7, 8], expect: 'fair' },
];
const brg = (a: P, b: P) => { const dy = b.lat - a.lat, dx = (b.lon - a.lon) * Math.cos(a.lat * Math.PI / 180); return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360; };
const nm = (a: P, b: P) => { const dy = b.lat - a.lat, dx = (b.lon - a.lon) * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180); return Math.hypot(dx, dy) * 60; };
const hull = process.argv[2] ?? 'zuochuan';
let bad = 0;
for (const r of R) {
  // The road must be sea.
  for (const p of r.pts) if (isLand(p)) { console.log(`LAND at ${p.lat},${p.lon} on ${r.name}`); bad++; }
  for (const m of r.months) {
    const doy = Math.round((m - 1) * 30.4 + 15);
    let days = 0, foulNm = 0, total = 0, calmNm = 0;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1], c = brg(a, b), d = nm(a, b); const steps = Math.max(2, Math.round(d / 60));
      for (let k = 0; k < steps; k++) {
        const p = { lat: a.lat + (b.lat - a.lat) * (k + 0.5) / steps, lon: a.lon + (b.lon - a.lon) * (k + 0.5) / steps }; const seg = d / steps;
        let vSum = 0, offSum = 0, spdSum = 0; const N = 12;
        for (let j = 0; j < N; j++) {
          const w = prevailingWind(p, doy, 1e9 + j * 3600 * 29);
          let best = 0;
          for (let h = -90; h <= 90; h += 5) { const head = c + h; const twa = Math.abs((((w.from - head) % 360) + 540) % 360 - 180); const v = polarAt(hull, w.speed, twa) * Math.cos(h * Math.PI / 180) * (twa < 75 ? 0.7 : 1) * (Math.abs(h) > 25 ? 0.9 : 1); if (v > best) best = v; }
          const cur = currentAt(p, doy); const along = cur.knots * Math.cos((cur.toward - c) * Math.PI / 180);
          vSum += Math.max(0.3, best + along); offSum += Math.abs((((w.from - c) % 360) + 540) % 360 - 180); spdSum += w.speed;
        }
        const v = vSum / N, off = offSum / N;
        days += seg / (v * 24); total += seg; if (off < 55) foulNm += seg; if (spdSum / N < 5) calmNm += seg;
      }
    }
    const kn = total / days / 24;
    const foul = foulNm / total;
    const ok = r.expect === 'hard' ? foul > 0.3 || kn < 3.2 : foul < 0.25 && kn > 3.5;
    if (!ok) bad++;
    console.log(`${ok ? ' ' : '!'}${r.expect === 'hard' ? '*' : ' '} ${r.name.padEnd(52)} m${String(m).padStart(2)} ${String(Math.round(total)).padStart(5)}nm ${days.toFixed(0).padStart(4)}d (${kn.toFixed(1)}kn) foul ${Math.round(foul * 100)}% calm ${Math.round(calmNm / total * 100)}%`);
  }
}
process.exit(bad ? 1 : 0);
