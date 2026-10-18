# Balance baseline

Measured by `scripts/econ.ts` (BUILD_PLAN A2). Baseline taken before any B3/C1 economy change.

## Rerun

```
npx esbuild scripts/econ.ts --bundle --platform=node --format=cjs --outfile=/tmp/econ.cjs && node /tmp/econ.cjs
node /tmp/econ.cjs --ladder            # price-ladder table next to the B3 targets
node /tmp/econ.cjs --check             # exit 1 if best:median > 8 or 480 t earns < 2.2x the 140 t on the best lane
node /tmp/econ.cjs --burthen           # size hulls by burthen (25/50/70/140/260/480) not hold (14/30/45/105/205/400)
node /tmp/econ.cjs --lane mina lisboa  # every good on one pair
```

Exit code is 0 unless `--check` fails. `--check` fails today; that is expected. It is the pass gate for B3.

## Method

`Markets(1)`, every port refreshed to day 400, `listings(port, t, relation 0, skill 0)` for all 52 ports.
For every ordered port pair and good: the origin must produce it (`local`, stock > 0), the destination must have
appetite, and `bid - ask > 0`. Units = `min(origin stock, destination appetite, hold / bulk)`; profit = units x margin.
Distance is the haversine between anchorages (great-circle, not sailed).

## Baseline (hold 140 t, the design team's reference; `--burthen`)

| Measure | Value |
|---|---|
| profitable single-good routes | 1,979 |
| median route profit | 507 |
| p90 | 9,767 |
| p99 | 42,477 |
| top (Ormuz -> Cambay, pearls) | 66,175 |
| best:median | 130.6 : 1 (target <= 8) |

With the real hold (105 t for the 140 t hull) p90 is 9,748; the rest is identical.

**Hull size does not matter.** The best lane (pearls, Ormuz, 534 units) is capped by town stock, not hold, for every
hull including the barcha; profit is 66,175 for all six. The median lane (panos, Magadoxo -> Malacca, 53 units) is
507 for all six. 480 t / 140 t on the best lane = 1.00x (target >= 2.2x).

Mina -> Lisbon gold: 10,093 for both the 140 t and the 480 t hull (146 units, stock-capped). Confirms the design team.
The same pair's other goods are small (ivory 1,115, malagueta 424).

## Ladder today vs B3 targets (`--ladder --burthen`)

| Hull | Price | Hold | Best | Median | Target net | Target voyages |
|---|---|---|---|---|---|---|
| barcha | 380 | 25 | 66,175 | 476 | 120-220 | 3 |
| caravela latina | 900 | 50 | 66,175 | 503 | 300-500 | 3 |
| caravela redonda | 1,500 | 70 | 66,175 | 507 | 500-800 | 3-4 |
| nau pequena | 3,200 | 140 | 66,175 | 507 | 1,200-1,800 | 3-4 |
| nau | 6,800 | 260 | 66,175 | 507 | 2,500-3,500 | 4 |
| nau da India | 15,000 | 480 | 66,175 | 507 | 6,000-9,000 | 4-6 |

Best lanes buy the next hull in under one voyage; median lanes need 2 to 30 voyages and flatten at the smallest hulls.

## Caveats

- Shape, not in-game income: first sale, one good, relation 0, skill 0, no Crown share, no dues, wages, stores,
  upkeep, spoilage or risk. Distance is great-circle.
- Not modelled: price impact of large orders (`Markets` prices big orders above quote), cash limits (the 66k pearls
  load costs 12,845 to buy), and the player's market `adjust` hook (world events).
- Stock is the 400-day-refreshed `baseStock`, the state of an untouched port. A port the player has drained is lower.
- The route set contains the stock-capped lanes only; stock-capped means more hold earns nothing, so "median" and
  "best" per hull barely move until B3 raises the caps.
- Hull sizing: the game enforces `hull.hold`, not burthen (`tons`). `--burthen` reproduces the design team's 140/260/480
  convention. The galleon (standing 1e9) is excluded.
- Seed: `Markets(1)`. Other seeds not swept.
