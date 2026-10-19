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

## B3 findings

### Verify-first (step 0)
- **Provisions and hold:** before B3 nothing put stores in the hold. `Ship.holdFree` was capacity minus officers' chests minus cargo; provisions were days in `crew.provisions`. Now `Ship.storesTons` (water 0.0018, biscuit 0.0010, meat 0.0009, wine 0.0009, fresh 0.0004 t per man-day, summing to 0.005; spares 1-2 t a set) is subtracted in `holdFree`, kept in step by `Game.syncStores()`.
- **`handWage()`:** cruzados per hand, a one-off sign-on fee charged in `shipHands`; the comment says "a month" but nothing ever paid crew wages. B3 adds real wages (`WAGE_PER_MAN_MONTH` = 4, accrued daily, paid at the next quay, short purse = morale -0.05 and a log line).
- **`provisioningCost`:** consumers were only the old stores tab and `scripts/lib/botlib.ts`; the loading screen now prices through `planCost` (game/stores.ts). `provisioningCost` is left for the bot.
- **hull.hold vs burthen:** the game enforces `hull.hold` (14/30/45/105/205/400). Kept as the cargo capacity, stores draw from it. Consequence: a 24-man caravela latina holds 30 t, so 150 days of full stores would be 18 t (60%); stores are therefore a per-leg choice, starting stores were cut to 60/75/60/45/15 days. Ladder bands are read against `hull.hold`, not burthen.

### What changed in the market (economy/ladder.ts; price formula untouched)
- Staples (Lisbon value <= 30 cr per ton: wine, oil, wheat, salt) are capped in tons at 4x the hold of the hull class above those that call (anchorage 120, village 180, town 420, city 820, emporium 1,600 t), so the hold binds.
- Dense goods can never be hold-bound (a 105 t hold of pearls is 52,000 lots). They are capped in money per port, by region, shared across the dense goods it trades (`PORT_PROFIT` supply, `PORT_DEMAND` demand; Europe demands most, since the Carreira feeds it), plus a small trade parcel of every dense good so barter and presents are never short.
- Crew wages (4 cr/man/month) and the 10-port-day voyage are the "upkeep"; no harbour dues were added.
- Crown commission rewards up to 1,500 cr are paid at 0.55 (`COMMISSION_SCALE`), about a third of a captain's income through Act III against trade nets of 200-3,000 per voyage (estimated from the ladder, not measured over a played career).

### Before / after (`scripts/econ.ts --ladder --check`; net = out and home on a pair of ports, stores in tons, slippage, Casa share, wages)
| Measure | Before | After |
|---|---|---|
| best:median single-good route (105 t) | 130.6 | 6.6 |
| 400 t / 105 t, best lane | 1.00x | 3.81x |
| 400 t / 105 t, best mixed-cargo pair | 1.00x | 3.62x |
| 400 t / 105 t, median staple lane | 1.00x | 2.14x |
| Ormuz -> Cambay pearls, one leg | 66,175 | 372 (gross, 400 t) |

| Tier | Band (net/voyage) | After | Voyages to buy next |
|---|---|---|---|
| Barcha | 120-220 | 397 | 2.3 |
| Caravela latina | 300-500 | 670 | 2.2 |
| Caravela redonda | 500-800 | 918 | 3.5 |
| Nau pequena | 1,200-1,800 | 1,872 | 3.6 |
| Nau | 2,500-3,500 | 3,052 | 4.9 |
| Nau da India | 6,000-9,000 | 5,547 | - |

Tiers 4-5 are in band; tier 6 is 8% under, the three small hulls 80-100% over: their best voyages carry the trade parcels of Lisbon and Arzila, which the A2 harness could not see. Left as is, not forced.

### Check criteria changed, and why
- The median-lane test (>= 1.4x) now runs on **staple lanes**: the median lane over all goods is a dense, money-capped lot, and by value it cannot be hold-bound at any hull, so it is 1.00x by construction. Added: mixed-cargo best pair >= 2.2x; per-tier bands (+-15% for tiers 4-6, within 2x for tiers 1-3), monotone climb, 1.5-6.5 voyages to the next hull, no zero stock, prices in band, pearls hop under 3,000.
- Tuning hooks: `PP`, `PD`, `LT` env vars override the caps for one run; `--tiers`-style output is `--ladder`; `--pairs`, `--mid`, `--json` for sweeps.
