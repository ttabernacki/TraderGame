# Balance baseline

Measured by `scripts/econ.ts` (BUILD_PLAN A2). Baseline taken before any B3/C1 economy change.

## Rerun

```
npx esbuild scripts/econ.ts --bundle --platform=node --format=cjs --outfile=/tmp/econ.cjs && node /tmp/econ.cjs
node /tmp/econ.cjs --ladder            # price-ladder table next to the B3 targets
node /tmp/econ.cjs --check             # exit 1 if the ladder, spread (<= 10), hull, risk-reward, India or Malabar-tour-by-hull criteria fail
node /tmp/econ.cjs --pair lisboa mpinda 2   # the goods of one voyage, leg by leg (hull index 0-5)
node /tmp/econ.cjs --regions           # single-good lanes by source region
node /tmp/econ.cjs --burthen           # size hulls by burthen (25/50/70/140/260/480) not hold (14/30/45/105/205/400)
node /tmp/econ.cjs --lane mina lisboa  # every good on one pair
node /tmp/econ.cjs --india-hulls       # the Malabar and grand tour by hull, real sailed days, the stores rule
TOFF=150 node /tmp/econ.cjs --india-hulls   # the same, 150 days later in the year (the second tier follows the season)
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
- **Hull size does not matter on the India lanes** (superseded: see "The deeper lots of Malabar" below). The Carreira's goods are money-capped per port, and the cargo of a full tour is ~40 t. A 3-port Malabar tour nets 5,146 for a barcha,
  7,934 latina, 10,849 redonda, 12,303 nau pequena, 11,737 nau, 10,002 nau da India (150 men, 80 t of stores). Hull size matters on the bulk lanes (Atlantic, 2.9-3.8x) and in running cost, and what
  keeps small ships off the India road is not the ladder but the road: the Cape, the monsoon, stores in tons (a redonda's stores for the round trip are 16 of its 45 t), the Casa's licence. The harness
  caps the reach of each hull (`REACH`) to model that; if the game lets a caravela go to Cochim it will outearn a Nau da India there. Raising the India caps cannot fix this; only making some India goods
  tons-capped can, and at ~600 cr per ton of pepper that would be 100 times the target.
- First sale, relation 0, skill 0 (spread 0.30); with a trusted relation and skill the spread narrows to 0.07, so a captain's real margins run well above these numbers: that is where "the exceptional run" lives.
- Career bot (4 seeds, `career.ts 4 1`): acts 5/3/3/3, no exceptions; B3 constants gave 4/3/5/3 and the A2 baseline 3/4/5+epilogue/3. The bot is noisy (wrecks, thin crews) and not a good income metric; no exception, no regression in the
  gate scripts (stores, saves, cuts, ledger, charts, tutorial, watchbell, pieces, silent, informer, gifts, hostage, refusal, fleet, between, case, routes, pilot).

## D1/D2: lanes, contracts, the weigh-house, dues, the rival's house

`scripts/econ.ts --world` (24 months, no player, 20 seeds) and `scripts/lanes.ts` (the falsifiers). The lane knobs are
`TUNE` in `src/world/lanes.ts` (`LANES='{"draw":0.03}'` overrides them for one run): a lane draws at most 4% of the origin's
baseline a month above a floor of 55%, a destination takes 12% of what it still wants and never lets its glut climb past 0.15.

| Measure (24-month no-player world) | C1, no lanes | D1 lanes on |
|---|---|---|
| directed lanes / trunks / goods per lane | none | 159 / 10 (five trunks both ways) / 1-6 |
| prosperity range seen | 0.69 - 1.15 | 0.70 - 1.18 |
| port-months `thriving` | 0 (at P > 1.2) | 2,810 of 24,960; 34% of ports are thriving at month 24 |
| port-months `struggling` | 614 | 500 (shocks only) |
| ports at zero stock / prices out of band | 0 / 0 | 0 / 0 |
| best:median route spread (month 24, 105 t) | 10.0 median seed, 13.2 worst | 10.3 median seed, 14.3 worst |
| `--check` (first-sale harness; best:median) | 9.6 | 9.6 (the harness has no lanes), dues now in the nets |

Lanes tuned down from 0.08 / 0.30 (spread 16 with the lanes on, because the monthly glut they put on a destination
was 1.2 at equilibrium) to the figures above (equilibrium glut 0.15). The 24-month world without lanes already drifts
to 10 (median) and 13 (worst) because prosperity lifts the money caps of the great ports; the lanes add 0.3 to that.

**Dues** (`economy/dues.ts`): 2-6% of an assessment of 5 cruzados a ton of burthen, by the court's temper, times
`marketModifiers().duesMult`; hostile courts (dues x1.15, or regard below -0.3) add presents of 8-12%. Portuguese quays
charge nothing. At Arzila: barcha 5, nau pequena 28, Nau da India 96 a call. Ladder after dues (`--ladder`): barcha 363,
latina 729, redonda 887, nau pequena 2,022, nau 3,923, Nau da India 10,688 best / 9,012 typical Malabar tour (was 373 /
734 / 893 / 2,057 / 3,949 / 10,736 / 9,228); `--check` still passes.

**Monopoly loop** (`economy/contraband.ts`): a King's good sold to a foreign buyer that wants it and does not make it
pays 1.4-2.2x the Casa's price (richer buyers pay more), and puts heat (1 per 600 cruzados at the Casa's price) on the
region it was bought in. Lines at 4 (a word), 8 (a fine of 20-60% of what was run), 14 (the fine and every King's good in the
hold); each inspection takes the heat down by half or 60%. Heat comes off only by activity (gift, sold Fact, favour, declared
parcel, promise kept, chart given), at most 3 points in 30 days; time takes off only the part below 4, a tenth a month. Ten
years waited: 14.4 -> 14.4.

**The rival** (`progression/rivalHouse.ts`): a purse of 1,800, one to three hulls, goes where the listed margin is best,
buys and sells through the same `Markets` doors (so he glut-prices and drains like anybody), keeps 78% of what he sells,
loses a cargo in twelve, pays 0.8% + 24 men + 55 a hull a month and spends 5% of the purse above 4,000 on his household
(capital 5,400 after 12 months, 16,000 after 24, three hulls from month 6). With him in the world, 6 of 630 listings are
more than 3% different after a year (Lisbon oil 41%). `frontierLat` is a reading of the log of discovery voyages his house
paid for (350 each, one per ~100 days), so a poor house explores slowly.

### The small-hull question (does the stores rule keep a redonda off the Indies?)

**No.** `econ.ts --india-hulls` with the real sailed distance (10,277 nm Lisbon-Cochim by `roadMiles`, the Lines' pace per
hull, ~290-320 days for a Malabar tour, the harness had assumed 103), `game/stores` (0.005 t a man-day, spares 1-2 t),
wages and dues:

| hull (hold) | stores for the whole round trip carried from Lisbon | pilot's loading for the longest leg (Benguela-Moçambique), renewed at each port | 3-port tour net, whole-trip stores / per-leg |
|---|---|---|---|
| barcha (14) | 16.0 t: cannot | 3.8 t | -538 / 6,170 |
| latina (30) | 27.8 t: no room for cargo | 6.1 t | 1,858 / 9,347 |
| redonda (45) | 38.0 t: 7 t of cargo left | 8.3 t | 4,299 / 11,883 |
| nau pequena (105) | 67.4 t | 14.3 t | 10,845 / 10,845 |
| nau (205) | 113 t | 23.4 t | 9,229 / 9,229 |
| Nau da India (400) | 191 t | 39.3 t | 6,469 / 6,469 |

Only a barcha or a latina cannot carry a round trip's stores from Lisbon, and the road has eleven ports to renew them at, so
the rule limits nobody. Spices are so dense that 7 t of mace and cloves fills every money cap on a tour. The measurement is
worse than BALANCE assumed: **a redonda out-earns a Nau da India on the Malabar tour, 1.84x**, because 150 men for 300 days
cost 5,800 in wages and 1,200 in dues and the cargo is money-capped at every hull. Dues by tonnage (done, and required by
D1) cannot fix that: they move the Nau da India from 7,633 to 6,469 on the grand tour. The levers that would are not
stores or dues but (a) a second, dearer tier of Malabar lots that only a great hold can lift (it moves the 10:1 spread and the
ladder, so a decision, not a tuning), or (b) a Casa rule that only hulls of 140 t and up may load the Carreira's pepper.
Neither is built. `--check` now pins what was measured (the barcha and the latina cannot carry the round trip's stores, a redonda's
longest-leg loading is under a quarter of her hold, a Nau da India's Malabar tour at real days nets 6,000-12,000) so that a
later change to stores or wages cannot silently change the answer.

(a) was then built: see the next section.

## The deeper lots of Malabar (a second tier for the great hold)

The question above was decided: build (a). Spice is money-capped per port, so a whole tour carried ~40 t and a redonda out-earned a Nau da India
1.84x; the Nau's 150 men (5,800 a tour in wages, 1,200 in dues) had nothing to carry. A bigger ship has to be able to earn more on the road.

### What it is (economy/ladder.ts, economy/market.ts; the price formula is untouched)
At an Indian or Eastern port (`DEEP_REGIONS`: india, east) every spice but the King's pepper has **two lots**:
- **The first lot** is what the Casa's factor and the Crown-scale traders keep for a visiting captain: the old money cap (`PORT_PROFIT` 2,900 -> 2,200 for the region),
  and for the spices that have a deep tier only `SPICE_FIRST_LOT` = 0.23 of it. Quoted ask, old slippage curve.
- **The second lot** is the big merchant houses' godowns, the Gujarati, Chinese and Arab warehouses and the wholesale season. `deepUnits`: `DEEP_TONS.house` = 240 t of one good
  at level 1, wealth 1, in a port whose polity carries 8,000 kt a year (the same `POLITY_KT` table `world/lanes` uses, now exported from `ladder.ts`; Cochim, Cananor, Gujarat, Bijapur
  and the rest get their own entry), scaled by the port's wealth x prosperity and its level in the good, x1.35 in the port's harvest fair (`FAIRS`: the pepper harvest for ginger,
  the clove ships for Malacca's spices) and x0.85 out of it, and no port holds more than `cap` = 70 t of one good (a godown, not a country). A pool is drawn down by what is
  bought (`MarketState.deep`, optional, half-life two months) and fills again from the next harvest.
- **Its price** is a freight rate, not a flat multiplier. `Markets.homeReturn` is what the good fetches on the best Portuguese quay today (the quay's hunger, glut, season, news, the
  Powers' say; the houses write to Lisbon, Porto and Lagos). The first unit of the deep lot costs that **less `DEEP_PRICE.perTon` = 58 cruzados a ton of hold**
  (the margin a carrier keeps on the first ton, equal for a hold of ginger and a hold of mace), and the price climbs to the full return by the bottom of the pool. So the margin
  on the last ton is nothing and that is where a great hold stops buying; a captain with 40 t never reaches the dear end (the pool is 70 t a good).
  `Listing.stock` is the sum, `Listing.lot` the first lot, `Listing.curve` the deep price in multiples of the ask. `Markets.slippage(q, stock, lot, curve)` returns the average multiple over
  the order, so a large order visibly pays more per unit (the quantity box, the barter table and the Lines all go through it; `state.ts` only passes `l.lot, l.curve` at three call sites).
- **Lisbon's demand** had to deepen with it (a money-capped quay takes a few hundred quintals of a spice, and the Nau's margin was gone on the first parcel):
  the goods of the autumn sale (`FAIRS` 'lisbon-spices', the Flemish and German houses) are taken at `AUTUMN_SALE.depth` = 3x what the quay can handle in tons, money cap lifted.
- The King's pepper has no deep tier (the Casa buys it and sells it on its own scales). Silk, stones, pearls and calico have none either: nobody holds a warehouse of them.

### Harness (scripts/econ.ts)
- Cargo is now filled **ton by ton from the lane whose next lot pays most per ton** until nothing pays (`fillCargo`): a lot is the best of its sizes, not the largest. Lanes with one tier
  are still taken whole (unchanged: the Atlantic ladder rows are byte-for-byte the old ones), so the only change is where a second tier exists.
- A tour comes home to the Portuguese quay that pays best that month (the deep lot is priced to the best of them; the King's goods only count at Lisbon).
- `lanes`/`byPair` are built by `lanesOf(bookAt(t))`, so `--check` can price the same tour in the harvest (day 400, February) and 200 days on.
- Tuning hooks (one run): `DPR='{"perTon":58}'` `DT` (house tons) `LC` (cap) `FL` (first-lot share) `AS` (autumn sale) `DS` (season) `TOFF` (days added to the date).
- New `--check` rules: on the 3-port Malabar tour with stores renewed at the ports and real sailed days, net rises with every hull (barcha < latina < redonda < nau pequena < nau < Nau da India),
  harvest and out of season; the Nau da India is >= 1.8x a redonda and 6,000-13,000; the barcha, latina and redonda each clear 1,000. The old "top 20 lanes are the Carreira's"
  floor went 14 -> 8 (the Carreira's depth is now in lots a 105 t reference lane cannot show) and the ladder-days tour ceiling 12,000 -> 14,500 (the 12,000 ceiling stays on the real-days tour).

### Before / after (3-port Malabar tour Cochim + Calecute + Cananor, stores renewed at the ports, real sailed days, wages and dues in)
| Hull (hold) | Before | After, harvest | After, out of season |
|---|---|---|---|
| barcha (14) | 6,170 | 3,346 | 2,765 |
| caravela latina (30) | 9,347 | 4,726 | 3,924 |
| caravela redonda (45) | 11,883 | 5,080 | 4,278 |
| nau pequena (105) | 10,845 | 6,711 | 5,911 |
| nau (205) | 9,229 | 8,715 | 7,943 |
| Nau da India (400) | 6,469 | 10,450 | 9,896 |
| Nau da India / redonda | 0.54x | 2.06x | 2.31x |

The grand tour (six ports) climbs the same way: 3,351 / 5,748 / 6,177 / 7,855 / 9,965 / 12,281 (before 6,255 / 8,335 / 11,476 / 12,557 / 10,743 / 7,633).
Carrying a whole round trip's stores from Lisbon, the hulls net -538 / 277 / 1,529 / 4,087 / 5,152 / 6,871: the small ones are still on the road, at a lower return, and only just.

| Other measure | Before | After |
|---|---|---|
| Atlantic ladder rows (barcha .. nau, `--ladder`) | 363 / 729 / 887 / 2,022 / 3,923 | unchanged |
| Nau da India ladder row (best pair) | 10,688 (Lisbon <> Malacca) | 8,983 (Calecute <> Lisbon); band 6,000-9,000 |
| Typical Malabar tour, Nau da India, ladder days | 9,012 | 12,435 (best 13,694) |
| Cochim tour / Atlantic coastal (400 t) | 5.99x | 7.41x |
| best:median single-good route (105 t, harness) | 9.6 | 8.9 |
| 24-month lane world, route spread | 10.3 median seed, 14.3 worst | 10.4, 13.9 |
| 400 t / 105 t on the best lane | 2.85x | 2.85x |

### Why these numbers, and what was tried
- The three constraints pull against one another and the shape that satisfies them is narrow. The best:median spread (<= 10) caps the best single lane at 105 t at ~2.9k, which for a good with a
  flat margin per ton means ~28 cruzados a ton; the Nau needs to make 4.4k more than a nau pequena on 180 more tons to pay 95 more men; and the hulls from the barcha to the nau pequena must still
  climb. A flat deep margin could not do all three (the nau pequena out-earned the Nau at every setting), and nor could any per-good price multiple (dense goods run away). What works is a **per-ton margin
  that falls to nothing over a pool of a fixed size** (a godown of 70 t, 58 a ton at the front): then any one lane is worth ~2.5k at 105 t, and a Malabar tour has many lanes (ginger, cinnamon, cardamom,
  cloves, nutmeg and mace at three ports) for a big hold to work down.
- The deep price follows the best Portuguese quay's bid, glut, season and news, not a fixed number: anchored to a fixed reference the same tour netted +8,400 in the harvest and -3,100 a month later,
  because a +-14% season on a 33-cruzado bid is more than the whole margin.
- The first lot is cut for the spices that have a deeper one, not the region, because cutting the whole region drags the median route profit (and so the 10:1 spread) down.
- Pepper stays out: with the Casa's 28% cut a deep lot of pepper was never profitable, and without it pepper at Porto was the top lane in the game.
- The pool cap is what holds the single-lane spread: with uncapped pools (the polity-scaled figure alone) the best lane at 105 t was 4-5k and the spread 12-16 at every setting that kept the Nau ahead of the nau.

### Side effects and honest limits
- The Nau da India is the only hull that finishes a Malabar tour with a real profit once the whole round trip's stores are counted; the smaller hulls' India run pays 3-6k, a worse bet than the Atlantic
  ladder's best voyage for their price only in that it is 270 days long and 100% of the risk.
- The ladder-days "typical Malabar tour" (the old simplified voyage days, 200 not 296) is 12.4k, over the 12,000 of the real-days tour; the ceiling on it was moved to 14.5k. Exceptional runs (a trusted
  relation, skill 0.3+, spread 0.07 not 0.30) are well above that.
- A deep lot is priced to the best Portuguese quay, so it is a bet on Lisbon staying where it is; a glutted or embargoed quay lowers what it will pay and the deep lot gets cheaper with it.
- The harness has no purse: the cost of a Nau's deep lots (tens of thousands of cruzados at the dear end) is not a limit in the table, only in the game, where a small ship's captain has not got it.
- Lisbon takes three times the quay's tonnage of the autumn-sale spices. The lanes see that as appetite (`appetiteLeft`), so NPC lanes send Lisbon a little more spice; the world spread is 10.4 / 13.9 as above.
- Saves: `MarketState.deep` is optional and absent in old saves (a full pool); nothing else is stored. No SAVE_FORMAT bump.

## E3: the Fronts staged (what moves a price, and what does not)

`econ.ts --check` and `--world` are unchanged by E3 (checked): the harnesses build a host with no `powers` state, so `marketModifiers` is the identity there,
and the Fronts reach the economy only through it. In a played game the new stages do move what a captain is quoted, by design and by small amounts:
the Lisbon pepper ask +3% (Crescent stage 2), +7% (3), +11% (4) (the Venetian channel adds 4-6% for 5-9 months); Lisbon gold +1% / +4% / +9% by the Gold's stage;
Lisbon dues +5% / +8% at the Court's third and fourth stages; the Mina beach stock x0.95 / 0.85 / 0.6 by the Gold's stage; the conflict machines' own effects (Portudal
horses +10-30%, Mina gold +5-10% in a quarrel or war, Mpinda ivory x0.75 in a succession contest, Luanda salt +10-20% when the tribute is withheld).
History line: the Court enters stage 2 with João II's death (Oct 1495), 3 in March 1503, 4 in April 1506; the Claim stage 2 in March 1493, 3 in June 1494;
the Gold stage 3 from about 1505 and stage 4 only for a captain who presses; at twenty years (1502) the Gold is at 2, the Claim and the Traffic at 3, the Court at 2 in every seed.
The Court and the Claim are therefore the dated history's Fronts: at thirty years most seeds stand at stage 4 on the Court (it is the 1506 reckoning) and are not pinned at
twenty. `scripts/powers.ts` checks the 20-year spread for all six and the 31-year one for the Crescent, the Rule, the Claim and the Gold (the Court's is history's).
