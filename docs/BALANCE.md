# Balance baseline

Measured by `scripts/econ.ts` (BUILD_PLAN A2). Baseline taken before any B3/C1 economy change.

## Rerun

```
npx esbuild scripts/econ.ts --bundle --platform=node --format=cjs --outfile=/tmp/econ.cjs && node /tmp/econ.cjs
node /tmp/econ.cjs --ladder            # price-ladder table next to the B3 targets
node /tmp/econ.cjs --check             # exit 1 if the ladder, spread (<= 10), hull, risk-reward or India criteria fail (see the India pass)
node /tmp/econ.cjs --pair lisboa mpinda 2   # the goods of one voyage, leg by leg (hull index 0-5)
node /tmp/econ.cjs --regions           # single-good lanes by source region
node /tmp/econ.cjs --burthen           # size hulls by burthen (25/50/70/140/260/480) not hold (14/30/45/105/205/400)
node /tmp/econ.cjs --lane mina lisboa  # every good on one pair
```

Exit code is 0 unless `--check` fails. `--check` passes after the B3 and India passes.

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

## India pass (reward arc restored)

B3 fixed the 130:1 spread by over-correcting. Measured before touching anything (`scripts/econ.ts --ladder --pairs`, new India/tour lines
run against the B3 constants):

### Why the Carreira collapsed (the cause, not the numbers)
1. **Money was shared out, not given.** `lotUnits` divided a port's money (`PORT_PROFIT`, `PORT_DEMAND`) by the sum of the levels of every dense good it trades.
   Calecute (8 dense goods) gave each about a sixth; Cochim (pepper, ginger, cinnamon, cardamom) about a third. Cochim held **39 quintals of pepper (2.3 t)**,
   and Lisbon *wanted* 20 of it: the market for the whole point of the road was one small cask.
2. **Lisbon's demand was the same sharing, 9,000 over ~11 goods:** 20 quintals of pepper, 7 of mace. The best home leg of a full Nau was 929 cruzados.
3. **The best thing a Nau could carry to India was Lisbon oil.** Staples are tons-capped, and 11 towns (India among them) "want" oil by the spread-demand layer, so
   400 t of olive oil Lisbon -> Diu netted 7,600 while the pepper leg was 929. The top 20 routes were all `azeite`.
4. **Small-hull tiers 1-3 were inflated** by trade parcels and cheap-staple margins (Lisbon/Arzila: oil out, cloth/copper/wax parcels back).
Before: a Malabar tour (Cochim + Calecute, home) netted **-1,230** (a loss), a Lisbon <> Calecute round trip 4,659 only thanks to oil.

### What changed (economy/ladder.ts; price formula untouched)
- **Per-good money caps, not shared** (`PORT_PROFIT`, `PORT_DEMAND` are now per dense good, at wealth 1 and level 1). A port with six spices is six times the market of one with one.
- **PORT_PROFIT** (per good): europe/atlantic/maghreb 70, guinea 300, brazil/kongo/cape 550, swahili 900, arabia 1,300, india/east 2,900. The ladder is the distance from home;
  arabia and swahili are deliberately low so tiers 4-5 stay in band, India/East carry the Carreira. One India lane tops out near 3,000 (that is what holds best:median under 10:1).
- **PORT_DEMAND** europe 12,000 (above anything a hold can supply, so supply binds: Lisbon now takes 55-200 units of each spice), atlantic/maghreb 350, others ~1,800-4,000.
- **`STAPLE_DEMAND`**: far markets take a fraction of the tons their size would suggest of Portuguese bulk (swahili 0.4, arabia 0.12, india/east 0.08). Oil to Cambay is a curiosity, not a cargo.
- **Trade parcel** 10 units / 60 cr -> 6 units / 36 cr (barter and presents still never short; tier 1-3 parcels were the over-band part).
- **`GOLD_LOT` 1.6** on Guinea gold (the Mina trade is the Atlantic's prize; without it the career bot went bankrupt on the first Guinea voyages and the median lane was too thin).
- Not touched: Casa share (0.72), commission scale (0.55), wages, dues. Nothing needed them; wages (4 cr/man/month; 150 men on a Nau da India is ~2,000 a round trip) are a real brake on the big hull already.

### Harness changes
- **Tours.** A Nau da India is not loaded at one yard: `tourNet` models Lisbon -> stops on one coast (5 port days each) -> Lisbon with one cargo, the destination's appetite shared across stops. Cochim alone
  has four spices and cannot fill 400 t; Cochim + Calecute does. "Typical India round trip" is the median of four Malabar tours; the eight Lisbon <> port pairs are listed as well.
- New checks: typical India tour in 6,000-12,000; median Cochim tour >= 3x median Atlantic coastal pair (same 400 t hull); >= 14 of the 20 best single lanes are Indian Ocean spice/silk/pearls/gems;
  pearls hop 800-6,000 (was 66,175, then 372); spread <= 10; tier 6 is a floor (the exceptional voyage is above the band); tiers 1-3 capped at 2x / 1.5x / 1.15x of their bands.
- The mixed-cargo scale test now picks the best pair that carries bulk (a pair of dense goods is money-bound by design, 1.00x at every hull from a caravela up); the median-staple-lane test excludes far markets (deliberately small).

### Before / after (`--ladder --check`, 105 t reference)
| Measure | B3 | India pass |
|---|---|---|
| best single route | 2,344 (Lisbon -> Angra oil) | 3,058 (Calecute -> Lisbon pepper); top 20 = 14 Carreira, rest calico/anil/oil |
| median / p90 / p99 | 334 / 1,171 / 1,806 | 318 / 1,674 / 2,674 |
| best:median | 7.0 | 9.6 |
| 400 t / 105 t, best lane | 3.81x | 2.85x (best bulk pair 3.40x) |
| Ormuz -> Cambay pearls, 400 t | 372 | 1,363 |
| typical Malabar tour, Nau da India | -1,230 | 9,228 (4,511 to 10,766; best Lisbon pair 10,736 Malacca) |
| Cochim tour / Atlantic coastal (400 t) | -1.06x | 6.87x |
| Lisbon <> Cochim pair alone | -1,484 | 1,855 |

| Tier | Band | B3 | India pass |
|---|---|---|---|
| Barcha | 120-220 | 397 | 373 |
| Caravela latina | 300-500 | 670 | 734 |
| Caravela redonda | 500-800 | 918 | 893 |
| Nau pequena | 1,200-1,800 | 1,872 | 2,057 |
| Nau | 2,500-3,500 | 3,052 | 3,949 |
| Nau da India | 6,000-9,000 | 5,547 | 10,736 best; typical tour 9,228 |

### Honest limits (read these before trusting the ladder)
- **Tiers 1-3 are still over band** (373 / 734 / 893 against 220 / 500 / 800). What is left is the staple margin: oil Lisbon -> Arzila earns ~22 cr per ton of hold at any ship, 200 of the barcha's 373.
  The price formula sets that and was not touched; parcels were already cut. Fixing it needs harbour dues or a staple spread change, not a stock cap.
- **Hull size does not matter on the India lanes.** The Carreira's goods are money-capped per port, and the cargo of a full tour is ~40 t. A 3-port Malabar tour nets 5,146 for a barcha,
  7,934 latina, 10,849 redonda, 12,303 nau pequena, 11,737 nau, 10,002 nau da India (150 men, 80 t of stores). Hull size matters on the bulk lanes (Atlantic, 2.9-3.8x) and in running cost, and what
  keeps small ships off the India road is not the ladder but the road: the Cape, the monsoon, stores in tons (a redonda's stores for the round trip are 16 of its 45 t), the Casa's licence. The harness
  caps the reach of each hull (`REACH`) to model that; if the game lets a caravela go to Cochim it will outearn a Nau da India there. Raising the India caps cannot fix this; only making some India goods
  tons-capped can, and at ~600 cr per ton of pepper that would be 100 times the target.
- First sale, relation 0, skill 0 (spread 0.30); with a trusted relation and skill the spread narrows to 0.07, so a captain's real margins run well above these numbers: that is where "the exceptional run" lives.
- Career bot (4 seeds, `career.ts 4 1`): acts 5/3/3/3, no exceptions; B3 constants gave 4/3/5/3 and the A2 baseline 3/4/5+epilogue/3. The bot is noisy (wrecks, thin crews) and not a good income metric; no exception, no regression in the
  gate scripts (stores, saves, cuts, ledger, charts, tutorial, watchbell, pieces, silent, informer, gifts, hostage, refusal, fleet, between, case, routes, pilot).
