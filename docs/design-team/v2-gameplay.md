# Gameplay v2: from simulator to game

Author: Gameplay designer. Replaces nothing; `gameplay.md` (v1) is untouched and should be read as the
rejected, feature-level pass. This one works at the level of whole systems.

Method: I read the code (module headers and bodies for market, trade, network, hailing, encounter,
ship, upgrades, crew, skills, polities, chronicle, quests) and **measured the economy headless**
(`scratchpad/s/econ.ts`, `econ2.ts`: bundle with esbuild, query `Markets.listings` for every port pair
and good). Measurements are marked (M). Where I only read a header and did not verify behaviour, I say so.

---

## 0. The one-paragraph verdict

Carreira da Índia is the best sailing simulator I can imagine a solo developer building and a thin game.
The sea is real (polars, reckoning-vs-chart, lee shores). Everything the sea is *for* is either
abstract (one ship, a scalar hull, a roll for combat, a market that is a set of static pools) or
authored on rails (acts, 24 hand-written threads, 12 diplomacy pieces). The player has one
ship, one purse and one road, and the world does not move unless the Chronicle says so. The classics
that this game is measured against (Pirates!, Port Royale, Patrician, Uncharted Waters, Sunless Sea,
Sea of Thieves) all share three things it lacks: **a strategic layer above the sailing** (a fleet, a
city, a patron), **a world that has its own momentum** (rival merchants, wars, growing ports), and
**a short, tactile verb that is not a menu** (the duel, the boarding, the raid). The sailing model is
the engine; these three are the drivetrain, and v1 proposed trim.

---

## 1. Where the game is now (honest)

**What the player does minute to minute.** Sets a queue of up to 12 marks, sails, watches the reckoning
ellipse grow, takes a sight or casts the lead when it matters, and winds the clock to x300 or "Full
day" to get through the empty stretch. Reads a card (15 sea events, 4 of them log-only notes), hails or
avoids a stranger, then enters a port and works a 7-tab screen (town, market, freight, money,
station, stores, yard) and a 7-tab Orders book (chronicle, missions, trade, courts, reports, network,
wardroom). Every ~10 legs a scripted Chronicle beat or one of 24 threads fires.

**What is excellent (do not touch):** `ship/physics.ts`, `rig.ts`, `polars.ts`; `navigation/*` and the
three-frame model; `game/gale.ts` (a lee-shore sum that costs something to answer); `economy/trade.ts`
information model (stale sheets, shocks, fairs, payment terms, competition); `economy/finance.ts`
(three instruments that put risk in three places); `crew/hands.ts`/`mutiny.ts` (a named man with a
true grievance); the diplomacy *engine* (`diplomacy/table.ts`, `marks.ts`, `book.ts`); 10k lines of
renderer that nobody should be asked to rewrite.

**What the measurements say (M).**

1. *The economy is solved by one lane and ship size is cosmetic.* Best Atlantic route for a caravel
   (140 t, 3,200 cr cap): Mina -> Lisbon gold, 146 marcos, cost 2,980, profit ~10,090. The *same* route is
   the best for a 260 t and a 480 t hull (cap 6,800 / 15,000): the town's stock (146) is the limit, so
   the 15,000-cruzado Nau da Índia earns exactly what the 3,200-cruzado Nau Pequena does. The hold
   "never binds" problem that `market.ts` documents fixing is still true on the lane that matters.
   (Caveat: the sim ignores the Crown's share on monopoly goods, relation and skill = 0.)
2. *One hop pays four hulls.* Ormuz -> Cambay pearls, 940 nm, 534 units, cost 12,845, profit 66,175: 4.4x the
   price of the most expensive hull in the game, in a single leg. Silk Cambay -> Goa (378 nm): ~37,000.
   Money stops being a constraint the moment a captain reaches the Indian Ocean.
3. *Route choice is a power law, not a decision.* Across 1,979 profitable single-good routes: median
   profit 507, 90th percentile 9,767, 99th 42,476, top 66,175. Gold alone accounts for 54 of the top
   200 and 94 of the routes above 3,000; silk 39. There are about four good ideas in the whole
   economy and a player finds them on the first trip.
4. *The world is static.* `PortDef.wealth` is a constant (no write to it anywhere outside the
   definition; checked by grep). A port cannot grow, starve, be burned or be favoured. Stocks
   regenerate toward fixed baselines "over a season" (`refresh`, 90-day lerp). No NPC merchant moves
   goods: price movement comes from `SHOCKS` and `FAIRS` tables and from you.
5. *There is no ship ladder worth climbing.* Seven stock hulls (25 t to 480 t, 380 to 15,000 cr) plus a
   design tool (`ship/design.ts`) that is genuinely lovely, but with no economic reason to want
   a bigger ship (point 1) and a hull modelled as one scalar (`ship.condition.hull`) plus per-mast sail
   condition, so damage has one flavour.
6. *Combat is one function.* `hailing.ts: boardingOdds()` = men weighted by morale + 0.06 x tons + 4 x guns vs
   the same for the enemy, then `rng.next() < odds`. The chase is a physics problem; the fight is a
   roll. Strangers (`encounter.ts: Stranger`) have a hull id, a nation, an intent and a name from a
   list of 4-8; none persists.
7. *Failure is binary.* `wreckHer()` and foundering end the game (`endGame()`), softened by a
   perk-gated one-time `reprieve()`. Elsewhere failure is a small delta (regard -0.1, morale -0.06).
8. *Passive income swallows the late game.* "Factories run themselves" (`livingFactory.ts`), Lines
   "pay out once per voyage" with nothing to manage, estate shares "paid when you enter a Portuguese port".
   The doc itself says: "so nothing needs a visit".
9. *The Chronicle is a rail.* Five acts, the King's answer "arrives 14 days later at the next port,
   wherever it is". 24 threads in `quests.ts` (3,858 lines) are mostly authored one-offs. The player
   has one patron and no way to be anyone else's man.

---

## 2. System inventory and verdicts

Columns: what the player does; decisions it forces; what it connects to; verdict with blunt reason.
KEEP = leave alone. REWORK = keep the asset, change what it is for. CUT = remove from the shipped
game. NEW = does not exist.

| # | System (files) | Player does | Decisions | Connects to | Verdict |
|---|---|---|---|---|---|
| 1 | Helm, sails, polars (`ship/physics.ts`, `rig.ts`, `polars.ts`, `game/difficulty.ts`) | Steers, trims, tacks (100 s lateen dip), or lets "the watch" do it | Course vs wind, canvas vs strain | Weather, damage, chases, gales | **KEEP.** The crown jewel. Its only flaw is that nothing downstream raises the stakes (hull is a scalar). |
| 2 | Wind, currents, tides, monsoon (`world/wind.ts`, `weather.ts`, `currents.ts`, `navigation/tides.ts`, `monsoon.ts`) | Reads the pilot's timetable; plans around seasons | When to leave, which side of the gyre | Nav, provisions, trade timing | **KEEP.** Make the *calendar* bind (see Pillar 2, stores; Pillar 6, wars). |
| 3 | Reckoning, chart, sights, lead (`navigation/navigator.ts`, `charts.ts`, `celestial.ts`, `instruments.ts`, `game/soundings.ts`, `ui/sightView.ts`) | Takes sights, casts the lead, amends the chart | Where to spend time/attention to cut doubt | Landfalls, shoals, Lines (none yet), cartography skills | **KEEP the model, REWORK the payoff.** Skill is invisible to every other system; chart quality should price lane risk (Pillar 7). |
| 4 | Ship condition and upgrades (`ship/ship.ts` `condition`, `upgrades.ts` ~80 entries, `ui/shipyard.ts`) | Pays a flat fee to "make her sound" (`portView.ts`: `(1-hull)*900/refit`); buys bolt-ons | Which upgrade, once | Cargo, speed, scurvy rate | **REWORK.** A shopping list of multipliers with no consequences. Replace with zones, stores in tonnage, fittings in slots (Pillar 2). |
| 5 | Provisions, scurvy, morale (`crew/crew.ts`) | Buys days of water/biscuit/meat/wine/fresh; sets ration | How much margin | Upgrades, shore watering (`shore.ts`), mutiny | **REWORK.** Good model; but stores are *days*, not tons, so they never compete with cargo. Make them cost hold (Pillar 2). |
| 6 | Named hands, mutiny, flogging (`crew/hands.ts`, `game/mutiny.ts`) | Settles a grievance; chooses punishment | Justice vs order | Morale, officers | **KEEP and extend** into a company (Pillar 5). Best writing-in-mechanics in the repo. |
| 7 | Officers, arcs, counsel (`crew/crew.ts` roles, `progression/officers.ts`, `arcs.ts`, `game/counsel.ts`, `officerEvents.ts`) | Hires, listens, decides on arc beats | Who to trust | Skills, Houses (a factor is a man you leave), mutiny | **KEEP; wire to fleet.** A bonded officer should be able to command a consort. |
| 8 | Captain skill trees (`crew/skills.ts`, 6 trees, ~72 nodes, ~40 points per career, trunk-to-capstone 15) | Buys perks | Which perk | Everything | **REWORK.** Nodes change routes (good). But 40 points buys almost 3 capstones, so every captain ends up the same hero. No identity: add a Calling that prices the trees (Pillar 5). |
| 9 | Markets (`economy/market.ts`, `goods.ts` 42 goods, 52 ports) | Buys low, sells high | What to carry, how much | Trade intel, Casa, Houses | **REWORK, most urgent.** Static pools with a power-law profit surface (section 1). Replace pools with flows (Pillar 1). |
| 10 | Trade intelligence (`economy/trade.ts`: sheets, `SHOCKS`, `FAIRS`, `PAYMENT`, `COMPETITION`, news delay by region) | Reads old prices, guesses | Trust a rumour or not | Markets, Lines | **KEEP.** Genuinely good; it becomes the *visible face* of the new lane simulation. |
| 11 | Monopoly, licences, Casa share (`trade.ts: MONOPOLY, CASA_SHARE 0.72, LICENCE_YEARS`; `progression/casa.ts`) | Sells Crown goods to the Casa or buys a licence | Official vs unofficial | Tinoco, rival, regard | **REWORK into a real smuggling loop** (Pillar 1). Right now it is a tax, not a risk. |
| 12 | Finance (`economy/finance.ts`; `game/financeEvents.ts`) | Takes câmbio / letra / shares | Where risk sits | Ship loss, standing | **KEEP.** Needs a fleet to insure (Pillar 3), otherwise one hull's insurance is a rounding error. |
| 13 | Houses, Works, Lines, factories (`progression/network.ts`, `feitoria.ts`, `livingFactory.ts`) | Sets posture; collects a payday card | Which posture, which Works | Markets, Casa 15%/8% | **REWORK / merge.** Four overlapping objects ("a House is stored as a Feitoria"; Works; Lines; livingFactory). One owned asset type: the Feitoria node (Pillar 1) and detached hulls (Pillar 3). |
| 14 | Estate (`progression/estate.ts`) | Buys shares, a house, land in Lisbon | None that matter | Purse | **CUT.** Its own header admits there was nothing to spend money on; fix the sinks, not the sink of a sink. |
| 15 | Ventures / charters (`progression/ventures.ts`) | Takes a merchant's contract with a date | Press or not | Purse, regard | **REWORK into generated Contracts** off real shortages (Pillar 1). Standalone it is a decoration on top of a solved economy. |
| 16 | Diplomacy engine and 12 pieces (`diplomacy/table.ts`, `marks.ts`, `book.ts`, `pieces/*`, bots in `scripts/*.ts`) | Plays an audience (gift table, case, meal, linguist, ...) | Reads a court | Marks, Book, House prices | **KEEP the engine. REWORK the outputs.** Pieces end in marks that move three hidden numbers. They should end in a *treaty clause* you can see and use (Pillar 6). Audit the 12: any that do not change a treaty, a lane or a person are cut. |
| 17 | Polities, regard, marks (`diplomacy/polities.ts`, `courts.ts`, `Game.bindRegard`; regard = .5 trust + .2 respect + .3 interest + local) | Gifts, audiences | Which faction to court | Prices, House footing | **REWORK.** 41 factions of weighted voices feeding one derived number. The world never *does* anything with it. Add a world clock (Pillar 6). |
| 18 | Acts, Chronicle, commissions, dispatch (`progression/chronicle.ts`, `crown.ts`) | Takes the King's commission, completes, waits for dispatch | Little: the goal is given | Rewards, Casa | **REWORK from rail to patronage.** One patron is a to-do list; three are a politics. |
| 19 | Quest threads (`progression/quests.ts`, 24 titles incl. *The Lost Caravel*, *The Leak in the Casa*, *The Manikongo's Embassy*, *The Zamorin's Pepper*) | Follows steps in road order | Dilemma at the end | Epilogue, regard | **Split.** KEEP ~12 set pieces that grant a ship, a treaty, a person or a chart (*The Biscayan's Ship* gives the galeão design). CUT / convert to generated contract templates: *A Passenger for Melinde*, *A Pilot for Calecute*, *False Weights*, *The Fallen Padrão*, *The Ship Adrift*, *The Stowaway*, *The Count*. Same beats as a template with a roll, not 100 lines of authored text each. |
| 20 | Encounters, hails, boarding (`game/encounter.ts`, `hailing.ts`) | Hails, flees, chases; boards by menu | Mostly: run / parley / board | Nation regard, prize value | **REWORK; combat is NEW** (Pillar 4). Keep the chase and the hail; replace `boardingOdds`. |
| 21 | Sea events (`game/seaEvents.ts`, 15 events; `gale.ts`) | Reads a card; rare choices | Rarely | Provisions, hull | **REWORK.** `birds`, `weed`, `fish`, `rainwater`, `ambergris` are note-severity logs. Move to ambient barks; spend the slot on 12 events that hang off the new systems (stores, zones, lanes, wars). Keep `gale.ts` as is. |
| 22 | Discovery, landmarks, shore parties (`game/discovery.ts`, `farLand.ts`, `shore.ts`) | Claims, looks, or presses on; waters | Time vs knowledge | Chart, renown | **KEEP and extend** with charts-as-assets (Pillar 7). |
| 23 | Rival (`progression/rival.ts`, `rivalEvents.ts`) | Reads gossip; loses firsts | None directly | Renown | **REWORK.** A latitude number that falls southward is a clock, not an opponent. Make him a house with a fleet in the lane sim (Pillar 1/3). |
| 24 | Fleet engine (`fleet/formation.ts`, `game/fleet.ts`, `scripts/fleet.ts`) | Nothing (Xiyang only) | n/a | Gale scatter | **BUILD-NEW use.** The most under-used asset in the repo (Pillar 3). |
| 25 | Xiyang campaign (`campaigns/`, `render/junkMesh.ts`, `scripts/xiyang*.ts`) | Shelved | n/a | Fleet engine | **CUT from the shipped build.** ~800 lines plus a mesh generator that cost effort and ships nothing. Keep in git history. Keep `fleet/formation.ts`. |
| 26 | Legacy / heir (`Game.inheritFrom`) | Plays on as heir | Which heir bonuses | Purse, chart, stations | **KEEP; extend** to inherit the company and fleet (Pillars 3, 5). |
| 27 | UI loops (`ui/portView.ts` 1,971 lines, `ordersView.ts` 665, `chartView.ts` 1,625, `rutterView.ts`, `logbookView.ts`, `bookView.ts`) | Navigates seven tab sets | Which screen holds which fact | Everything | **REWORK.** Six knowledge surfaces (Chronicle, Hearsay, Rutter, Logbook, Book of Courtesies, Chart). Collapse to one Captain's Book. Agrees with the DA (Obra Dinn principle). |
| 28 | Tutorial (`game/tutorial.ts`, 13 steps) | Reads | n/a | n/a | **REWORK.** First-hour rule (DA G6). |
| 29 | Render, sound (`render/*` 10.5k lines, `sound.ts`) | Looks | n/a | n/a | **KEEP.** Do not spend feature budget here except for combat and fleet visuals. |

Net effect of the verdicts: 2 CUT (estate, Xiyang), 7-ish quest threads converted to templates,
Ventures folded into Contracts, four owned-asset objects folded into two. That is the fat.

---

## 3. Structural diagnosis against the classics

Yardstick: for each genre classic, the loop that the player is *chasing*.

| Classic | The hook | What Carreira has | What is missing |
|---|---|---|---|
| Sid Meier's Pirates! | A 3-minute tactile ship duel; allegiance among four nations; ports whose governors like or hate you | Chase physics; nation regard; ports' courts | Duel; nations that war each other; a reason to take sides |
| Port Royale / Patrician | A city you grew, convoys on set routes, rivals who undercut you | Houses, Lines, rival caravels in prices | Growth (ports are static); route design; competition that is physical |
| Uncharted Waters | Discovery you sell, guilds, ship upgrades that unlock places, a roster of named captains | Discovery scenes, chart, Padrão | Chart as a commodity; a roster; ships that unlock reach |
| Sunless Sea | Resource dread (fuel, supplies, terror), a hold you tetris, writing | Provisions, scurvy, prose | Stores that compete with cargo; damage that bites; a lost ship that is a *story* |
| Sea of Thieves | Roles and moments aboard; the weather and the sail *are* the game | Weather and sails | Roles aboard that matter; moments at sea that change state |
| RPG baseline (build identity, party, gear, a reactive world) | You are a particular kind of hero with a party and a kit | 72-node tree, 8 named hands, 5 officer arcs | Identity (everyone ends the same), party (hands are decoration), gear (80 bolt-ons), reactive world (static) |

**Seven structural holes, in priority order:**

1. **No strategic layer above the sailing.** One ship, one purse. A game is "do the thing, then decide
   what to do with what the thing made". Here the thing made nothing to decide about.
2. **Economy has no tradeoffs** (section 1, points 1-3). No hold binding, no capital binding after Act II, no risk
   on the best lane, no competition on it.
3. **No mastery curve outside navigation, and navigation does not pay.** Sailing skill is real and
   unscored; nothing downstream (lane risk, insurance, rivals) notices it.
4. **No build identity.** Six trees, forty points, every captain a polymath by the epilogue.
5. **No emergent stories.** The stories are authored (24 threads). The systems (market, hull, crew) emit
   no events of their own that name a person, a ship or a port. "Remember the *Santa Clara* that went
   down off Benguela with Rui aboard" cannot happen, because nothing persists.
6. **No reason to care about a port.** A port is a row in a table with a constant wealth. You cannot make
   Mpinda grow, nor watch it starve when the Kongo succession turns.
7. **No reason to care about a ship or a crew member.** One hull, replaced when you buy a bigger one;
   officers who ride the road for free.

---

## 4. The pillars

Seven pillars. They are ordered by *dependency*, not by glamour; section 7 gives the shipping order.
Each is a system, has a loop, touches at least three others, names its cuts and ships in stages that
each leave the game playable and saves loadable (additive fields, `SAVE_FORMAT` 3 house style).

### Pillar 1. The Living Market (economy, ports, competition, contraband)

**Fantasy.** You are a merchant in a world that trades without you. A port is a *place with momentum*:
Mpinda's ivory shed fills in the dry season; Melinde's price for horses doubles when Mombasa closes
her road; the Venetian galleys come home half empty and Lisbon pays double for pepper. You find the
gap before the other man does.

**Core loop.**
1. Read the lanes: the Captain's Book shows each port's stock, appetite and *rate of change*, with
   the age of each number (reuse `trade.ts: sheetAgeWord`, `sheetConfidence`).
2. Choose a cargo against a *hold budget* (Pillar 2) and a *capital budget* (credit via `finance.ts`).
3. Run it. Prices at the far end have moved by the time you arrive because NPC lanes moved them.
4. Sell into the market or to a contract; reinvest or build the port.

**What changes in the code.**
- `Markets` stops being isolated pools. A monthly tick (`Game.tickWorld`, new) updates all 52 x 42 cells
  (2,184 cells, microseconds) in three passes: **production** (as today: `baseStock`, scaled by
  prosperity), **lanes** (new), **consumption** (appetite, scaled by prosperity).
- **Prosperity** `P` per port, `0.5..1.6`, replaces the constant in `PortDef.wealth` as `wealth0 * P`.
  Monthly: `P += 0.015` if lane traffic >= baseline and no war/embargo; `-= 0.03` under blockade,
  war, plague or a month of famine; `+= 0.10` of the cap when the player funds a quay or a fortress
  (`worksCost` formula is already `26 x monthlyValue`, reuse it). Stock cap and appetite cap both scale with `P`.
- **NPC lanes.** ~150 directed lanes (neighbouring ports within a `Network` from `polities.ts`, plus
  the long trunks Lisbon-Mina, Kilwa-Cambay, Cambay-Malabar, Malabar-Malacca, Aden-Cambay). Each
  lane carries up to six goods. Monthly flow `F = min(surplus_A, need_B, cap_lane) x (1 - risk)`.
  `cap_lane` comes from polity tonnage (`T_polity`: Gujarat 12 kt, Calicut 8 kt, Kilwa 2 kt, Melinde 1 kt, the Lisbon-Mina
  shuttle 600 t, ... order-of-magnitude figures to be tuned by the sim script below).
  A lane that is raided or blockaded has `risk` up and stops carrying; prices at both ends move on
  the next tick. About 900 flows a month; trivial.
- **Hold-binding fix.** Cap each port's stock at `4 x` the load of the next-bigger hull class of the
  lane's top good, not at the town's own consumption. Target (verify with `econ.ts`): a 480 t hull earns
  >= 2.2x a 140 t hull on the best lane and >= 1.4x on the median lane; best:median profit ratio
  <= 8:1 rather than 130:1.
- **Sinks that scale with the fleet.** Port dues 2-6% per call (by polity temper, `trade.ts: PAYMENT`);
  presents 8-12% in a hostile polity; upkeep 0.8% of hull price per hull per month; insurance via
  câmbio 18-60% (already in `finance.ts`); spoilage as is; wages (verify unit in `Game.handWage`).
- **Contracts, not charters.** A port whose stock of good `g` is under 30% of base for 2+ months posts a
  contract (deliver `q` of `g`, price 1.3-1.8x ask, deadline 60-120 days). The merchants' contracts
  and the generic thread errands (*A Passenger for Melinde*, *A Pilot for Calecute*, *False
  Weights*) become templates in the same generator. Replaces `ventures.ts`.
- **Monopoly as a loop.** Crown goods (pepper, gold, malagueta, ivory) sell to the Casa at
  `1 - CASA_SHARE` or you run them elsewhere at 1.4-2.2x the Casa price, with `heat` per origin:
  `+1` per unofficial unit-load, `-1` per month, thresholds trigger a Casa inspection at Lisbon
  (fine 20-60% of cargo value, cargo forfeit, standing -) or a Tinoco tip-off scene. Interlopers
  (Genoese, Castilians, the rival) trade against you in the same lane sim and make the Mina price move.
- **The rival becomes a house** in the lane sim: a fleet of 1-3 hulls, a starting capital, goes where
  margin is highest, sells into the same markets, can be raided, bought out, or allied with. Replaces
  `rival.ts`'s latitude counter; his discovery frontier stays as flavour on top.

**Numbers: the price ladder (design targets; the sim script confirms).**

| Tier | Hull (price) | Typical hold | Net per voyage | Voyages to buy next |
|---|---|---|---|---|
| 1 | Barcha 380 | 25 t | 120-220 | 3 |
| 2 | Caravela latina 900 | 50 t | 300-500 | 3 |
| 3 | Caravela redonda 1,500 | 70 t | 500-800 | 3-4 |
| 4 | Nau pequena 3,200 | 140 t | 1,200-1,800 | 3-4 |
| 5 | Nau 6,800 | 260 t | 2,500-3,500 | 4 |
| 6 | Nau da Índia 15,000 | 480 t | 6,000-9,000 on India lanes | 4-6 |

Compare with (M): Lisbon/Las Palmas espelhos run already yields 1,350-1,990 for a 25-50 t hull on
a 380-900 cr purse. Tier 1-3 profits are too high by ~4x and tier 5-6 too low-ish once the Casa share is in;
the ladder flattens at both ends. Commission rewards (Crown) should be ~30-35% of income through Act III, not 100%.

**Interconnections.** Feeds *Armada* (a fleet is an economic engine with upkeep), *World that Answers*
(wars close lanes), *Discovery* (a new anchorage is a new lane endpoint), *Combat* (raiding a lane has
a price effect you can see), *Company* (purser skill is a real discount; factor quality sets a House's
yield). Is fed by *Ship* (hold budget), *Charts* (lane risk by chart grade).

**Replaces / cuts.** `Markets` pools -> flows. `ventures.ts` -> contracts. `estate.ts` removed.
`livingFactory.ts` silent monthly loop deleted (Houses are nodes in the prosperity system, no
background buying for years). `Works` kept as the quay/harbour investments.

**Size.** L overall. Stages:
- **S1 (S, 1 week):** `scripts/econ.ts` committed as a regression harness (the two scripts above);
  stock caps rescaled so hull size matters; ladder table as the pass criterion. Ships alone.
- **S2 (M):** prosperity + monthly tick; ports can grow and shrink; Quay/Fort investments. No NPC
  lanes yet, so growth comes from the player and shocks.
- **S3 (M):** NPC lanes for the Atlantic and Swahili networks, then India; price sheets show trend arrows.
- **S4 (M):** Contracts replace ventures; heat and the Casa inspection loop.
- **S5 (S/M):** The rival as a house in the lane sim.

**Risks.** Tuning a coupled system by hand. Mitigation: the harness runs 24 simulated months headless
with no player and asserts price bands, that no port goes to zero stock, and that best:median profit
stays under the target. Another risk is *too much to read*; the Book shows only deltas worth acting on
(top 5 gaps within a leg of your position).

**Spine.** Lanes are the world, not the captain; the captain only ever moves forward. News travels back
as hearsay (`newsDelayDays`).

---

### Pillar 2. The Ship as a Machine (zones, stores, fittings, refit)

**Fantasy.** The ship is a character that you maintain. The nau that carried you through the Agulhas
gale has a patched strake and a new foremast, and you know what each part costs you.

**Core loop.** Provision a leg (tons), sail it (wear accrues by zone), arrive, repair what you can
(parts, time, a yard), decide what to carry on the next leg given what is broken.

**Design.**
- **Five damage zones**, each 0..1, replacing `condition.hull` scalar and extending the existing mast
  and sail condition (`ship.ts: damageMast`, `sails[].condition`): *lower hull* (leak rate: today's
  `leak`), *topsides* (crew exposure and boarding), *rigging* (polar penalty, reuses `rig.ts` sail
  condition), *rudder* (turn rate), *armament* (guns serviceable).
- **Hold as a tonnage budget.** Stores cost tons: design target 0.005 t per man-day (3 litres of water
  is 0.003 t; biscuit, meat, wine and fresh the rest). A 24-man crew for 150 days = 18 t:
  26% of a 70 t caravela, 13% of a 140 t, 7% of a 260 t. That *alone* gives small hulls a coast-hopping
  identity and big hulls an ocean one, and it makes the hold bind. Spare parts: timber, cordage,
  canvas at ~1-2 t per full set. Powder and shot as tons (Pillar 4). (Verify first against
  `crew.ts` days-based `provisions` and `provisioningCost`; I read the type, not every consumer.)
- **Fittings by slot, not by shopping list.** Collapse ~80 upgrade entries to ~24 in six slots (hull
  treatment, rig, boats, armament, cabin/stores, instruments) with *one* per slot at a time, each with
  an upside and a cost in tons, wear or morale. Slot replacement takes a yard and days.
- **Refit is a place and a time.** Careening (exists as an upgrade service), re-masting, re-rigging, and
  armament each need a yard of a given class (`PortDef.refit`, already read in `portView.ts`) or a
  beach (`shore.ts`). Repair cost = parts consumed + days, not a flat `(1-hull)*900/refit` fee.
- **Ship history.** Name, voyages, scars, "the *São Cristóvão* that carried the gold in '87". Stored
  per hull, shown on the Captain's Book, carried into the epilogue, and into fleet rosters.
- **Ribeira design tool stays** (`ship/design.ts`): designed hulls unlock when the yard is a shipyard,
  priced in tons and days; the 7 stock hulls seed the catalogue.

**Interconnections.** Feeds *Combat* (zones are what shot lands on), *Armada* (every hull is a full
state object), *Market* (the hold binds), *Navigation* (a rigging-damaged ship points worse, so
the pilot's chart of an approach changes). Fed by *Weather* (gales cause zone wear), *Company* (carpenter
repairs 0.04 per day of the zone he is on; gunner raises serviceable guns), *Economy* (parts and yards cost).

**Cuts.** The flat `makeHerSound` fee; ~55 upgrade entries that are pure multipliers; the per-day
`provisions` counters as a stand-alone.

**Size.** M/L. Stages: **S1** stores in tons + loading screen (hold binds); **S2** zones + parts +
refit; **S3** fittings consolidation + ship history.

**Risks.** Over-detailing; keep the loading screen to three sliders (water, victuals, spares) with a
"same as last leg" and a pilot-recommended default computed from the leg's expected days (the Leg
Report in v1 gives the data source). Save migration: old saves map `hull` onto all five zones.

**Spine.** Refit happens where you are. Nothing is a reason to sail back.

---

### Pillar 3. The Armada (fleet as the strategic layer; loss is a ship, not a career)

**Fantasy.** You are the captain-major. Dias lost the *Bartolomeu*, Cabral lost half his fleet: your
career is also the story of who sailed with you and who did not come back.

**Core loop.**
1. At a yard, buy, commission or take as prize up to *N* hulls (rank cap: Act I 1, II 2, III 3, IV 4, V 6;
   the patent title, `crown.ts`).
2. Assign each: a captain from the company (Pillar 5) or a hire, a crew, stores (Pillar 2), cargo.
3. Sail together (`fleet/formation.ts`, `game/fleet.ts`, existing: formation, keep-together cap,
   signal latency, tack ripples; "the master holds the flagship to 95% of the slowest") or *detach*.
4. A detached hull runs a **standing order**: a Line (lane + cargo policy), a survey (a coast + offing,
   which is the existing `coasting` perk applied to a subordinate), a blockade station, or an escort.
5. Hulls out of sight resolve by the same polars on a coarse step (the code already does "only the
   flagship runs the full physics"); events resolve through `seaEvents`/`encounter` tables
   weighted by lane risk.

**Numbers.**
- Upkeep per hull per month: 0.8% of price (nau 260 t = ~54 cr/month for the hull + crew wages at the
  handWage rate for the complement; verify units). A six-hull fleet of mixed value ~30,000 costs ~240/month hull + ~600/month wages; a
  profitable India round trip must clear ~4,000 per hull to be worth running (`≈ 12-16 months` upkeep + risk).
- Loss per round trip (design table, tuned by sim): Atlantic 3-5%, Guinea 6-9% (fevers), Cape 8-12%,
  Swahili/India 10-15%, x2.5 if the monsoon window is missed (`monsoon.ts`), x(1 - 0.5 x chartGrade) from
  Pillar 7, x0.6 if escorted. Historical Carreira outbound losses were far worse (the sources put a
  fifth or more of ships lost in the 16th century); we are deliberately gentler because loss here
  is a *story*, not a restart.
- A lost hull triggers the **Wreck Chain** (v1 P3, now the rule): the hull's captain, a few named
  hands and the cargo are in the log. If it was the flagship, the captain is aboard a
  consort or on a beach; `endGame()` fires only if there is no hull, no House and no
  Line anywhere on the road. Rescue comes forward down the road (a Line hull, a local boat, the rival).
  Ship loss = debt (sea loans die with her, `finance.shipLost()`), a mark on the file, and a smaller
  ship. Delete the `neverLose` perk's `reprieve()` special case.

**Interconnections.** Feeds *Market* (volume), *World* (a fleet is a political fact; Melinde is more
generous to a captain with eight sails), *Combat* (consort broadsides), *Discovery* (surveys). Fed by
*Company* (captains are your officers), *Ship* (each hull's zones), *Finance* (insure each hull),
*Charts* (lane risk).

**Replaces.** `network.ts` Lines (black-box payday) become visible detached hulls on the chart with ETAs;
Houses stay as ports with a man. `fleet/formation.ts` already exists; no new physics.

**Cuts.** The "Line payout card" as the only event; `Xiyang`'s fleet content; estate "outfit a voyage".

**Size.** L. Stages: **S1 (M):** one consort in Carreira (a Line hull for one voyage) with
`keepTogether`, gale scatter and rejoin; loss of the *flagship* no longer ends the game. **S2 (M):** detach
with standing orders (Line/survey/escort), visible on chart. **S3 (M):** crews/captains, rosters, insurance,
rank caps, the fleet UI (one panel: ship, captain, orders, ETA).

**Risks.** UI sprawl and state-size multipliers (scurvy per hull). Mitigation: consort health is
reduced to four numbers and an officer; simulation is aggregate off-screen. Save-compat: additive
`fleet` field defaulting to `null`.

**Spine.** Detached hulls are the only things that travel back up the road, because the captain does not.
That is the reinterpretation (section 6): the *captain's person* is one-way; his *assets* are two-way.

---

### Pillar 4. Sea Combat and the Law of the Sea

**Fantasy.** The weather gauge. Your caravel, lighter and faster, cannot match her broadside but
can out-point her: you work to windward, get under her stern, rake her rigging and she cannot
turn. Or you refuse, and run.

**Core loop (2-4 minutes, rare: ~1 engagement per two voyages).**
1. A hail fails or you choose to engage (`hailing.ts` options stay; add *Engage*).
2. The clock drops to ship-time x4 and the screen shows the existing sail view plus range, arcs,
   zone bars for both ships. Everything runs on the real physics (`stepShip`).
3. Each ship has a battery; a broadside may fire when the target is inside a 30-degree arc off the
   beam and a range of 1-3 cables (185-555 m). Reload ~100 s heavy / ~60 s light.
4. Decisions per pass: **ammunition** (round shot into the hull, chain into the rigging, grape into
   the deck; limited by stores), **target zone**, **intent** (disable, sink, take), and **tack/wear
   timing** (a lateen caravel loses ~100 s dipping; a nau wears in about 60).
5. Disengage conditions: strike, flee (win by polars), boarding, magazine/rigging collapse.

**Boarding** is a 3-round contest: each round pick Press / Hold / Break, with the existing
`mine/(mine+hers)` odds as the *base* and a variance reduction, modified by topsides zone, the
soldier captain (Pillar 5) and morale. Hands are lost in proportion. It is a minigame in the
`diplomacy/pieces` mould with `step()`, a perfect bot vs a random bot, and a headless test.

**After the fight (the part that matters).** Prize options: *sink*, *strip cargo*, *take as prize*
(crews split off, Pillar 3), *ransom* (`finance.ts` letter), *let go with a toll*. The nation
(`Nation`), the polity (Pillar 6) and the Casa (Tinoco reads the escrivão) react: attacking a
Castilian in the Mina monopoly water is lawful; attacking a Gujarati dhow with a Portuguese *cartaz*
is a breach and costs standing with Cambay and Calicut. Damage persists in zones, so the next port's
refit is a real decision (parts, days, yard).

**Numbers.** Light caravel broadside 4 guns, nau 12-20, galeão 20-30; reload 60-100 s; to-hit by
range band (1 cable 70%, 2 cables 40%, 3 cables 15%) and sea state; one hit = 0.01-0.04 of a zone.
These are design targets, to be fixed by a headless duel sim with the same pattern as `scripts/fleet.ts`:
a perfect bot should win a fair duel ~75%, a reader ~55%, a random bot <25%.

**Interconnections.** Needs *Ship* (zones, stores of powder and shot), *Company* (gunner, soldier
captain, surgeon), *Armada* (consorts firing), *World* (legality, reprisals), *Market* (prizes feed it, raiding
lanes moves prices), *Navigation* (night action, shoal water).

**Replaces.** `boardingOdds` as the final arbiter, `takeHer` single-roll, most `hailing.ts` option
text outcomes that are rolls. The hail text and the nation-regard hooks stay.

**Cuts.** Nothing. `ship/upgrades.ts` ordnance entries become concrete (calibre, count).

**Size.** L. **S1 (M):** engagement mode with fire arcs, one ammo type, strike/flee, no boarding
change. **S2 (M):** zones/ammo, boarding piece, prize menu. **S3 (S):** consorts firing, coastal blockade.

**Risks.** The design must stay rare and avoidable (the game is about the road, not Pirates! 2).
Use it as a *tax on carelessness and a spice on opportunity*: engagements are triggered by trade
route risk and by the player's choices, never by a timer. If playtests show combat becoming the loop,
cut spawn rates, not the system.

**Spine.** An event at sea; no pursuit back along the road.

---

### Pillar 5. The Company and the Calling (crew as party, captain as build)

**Fantasy.** A particular kind of captain with particular people. Not "a 72-node tree": a *life*.

**Calling.** At the end of Act I a captain chooses a **Calling**: **Pilot** (Navegação +
Cartografia + Marinharia), **Factor** (Comércio + Diplomacia), **Capitão-mor** (Liderança + Marinharia
combat nodes + the new gunnery/boarding nodes), **Master-builder** (Marinharia + ship design + refit).
Nodes inside the Calling cost x1.0, nodes outside x1.6, capstones (tier 7) only inside it.
With ~40 points, the pilot can't be a Prince of the Rua Nova; the factor can't have
`nav-homeward`. The Calling also grants one signature verb: Pilot - the **Landfall Wager** (v1 P2),
Factor - **bills on Houses**, Capitão-mor - **the engagement terms**, Master-builder - **dock the
fleet** (parallel refit). Two captains now play different games.

**The Company.** Twelve named seats: master, pilot, gunner, carpenter, surgeon, purser (escrivão),
soldier-captain, chaplain/interpreter, and four consort captains. Each person: three stats (ability,
nerve, loyalty), two traits, a past (home, a debt, a grievance), and **advancement by deed**
(the existing `practice` counters in `skills.ts` already count; reuse for officers). They get hurt
(a wound stays), can be posted to a consort or a House (`feitoria.ts` already leaves an officer
behind), and their arc beats (`officerEvents.ts`, `arcs.ts`) change what the seat does.
Hands (`hands.ts`) stay as a deeper bench: named hands that distinguish themselves are promoted.
Everyone who survives goes to the heir (`inheritFrom`): "old hands" as a legacy asset.

**Interconnections.** Feeds *Ship* (the carpenter's repair rate, the pilot's reckoning drift),
*Combat* (gunner accuracy, soldier-captain boarding), *Armada* (captains), *Market* (purser discount
1-3%, factor yield), *World* (interpreter opens audiences, `book.ts` languages). Fed by *Combat*
(wounds, deeds), *Armada* (promotions), *Economy* (wages, shares), *Stories* (arcs).

**Replaces.** The flat tree cost; the sense that officers are interchangeable. **Cuts.** Nothing from
the tree, but cost curves change, and any node whose effect is a plain multiplier is converted
into a perk that unlocks a verb or removed.

**Size.** M. **S1 (S):** Calling choice + cost multipliers + 4 signature verbs hooks. **S2 (M):** the 12 seats,
wounds, promotions by deed. **S3 (M):** consort captains, heir inheritance.

**Risks.** Content tax for seat-specific dialogue. Mitigation: bark templates by seat and trait, not
bespoke text per man; keep the 5 authored arcs.

**Spine.** None. People travel with you.

---

### Pillar 6. A World That Answers (wars, treaties, patrons)

**Fantasy.** The coast is a political map, not a menu of ports. Kilwa and Mombasa are at war because
they were before you came; what you do decides who wins. The King is one patron among three.

**World clock.** A monthly tick over the ~41 polities (`diplomacy/polities.ts`), driven by a table of
~10 **conflicts** anchored in the real chronology (`chronicle.ts` already carries dated history) with
a stochastic perturbation window of +/- 18 months so that replay differs: Kilwa-Mombasa-Melinde,
Calicut-Cochin, Cambay-Calicut, Kongo succession, Ndongo, the Mina coast, Songhai-Wolof on the
Senegal. Each is a small state machine: *Tension -> War -> Settled*, with three player stances:
**arm one side** (gifts of guns/men; lane to that side gets cheaper, rival's side pays), **mediate**
(needs a treaty clause and an audience, a `diplomacy/pieces` play), **abstain**. Consequences feed
the lane simulation: a polity at war has its lanes closed (`F = 0`), prices at its ports +15-40%,
prosperity -3% per month, a port may change hands; a victor gets the ceded port as a House site.

**Treaties as objects.** Replace "regard is a weighted blend" with **named, visible clauses** a court
grants: *free dues* (-50% port dues), *berth and watering rights*, *exclusive buyer* (the court
sells you a good first), *fortress licence*, *pilot loan*, *cartaz recognised*, *men and guns for hire*.
Each clause has a term (2-5 years), a price in gifts, and a way to lose it (marks accumulate offences
as today). The pieces keep their exact structure but end by naming a clause granted, refused or
poisoned. Regard stays internally as the derived "mood" (5 words) for readability.

**Patrons.** The King stays the senior patron (`crown.ts` commissions, rank caps, cartaz), but the
Rua Nova bankers (a Lines/estate sponsor, `finance.ts`), the Casa (Tinoco), and in later acts a
foreign court each issue **charters** with different pay, risk and consequence. Taking the
bankers' charter to sell spice outside the Casa is the contraband loop of Pillar 1 with a name. A
captain can end Act V as the King's man, a banker's man, or a free power with a fortress at Cochim.
`ACTS` stay as the historical clock (what the King wants, what happens in the world), but
the player's goal list is no longer the King's alone. The 5 endings (`lateEndings`, `originEnding`)
read the patron, not just the renown.

**Interconnections.** Feeds *Market* (closures, prices, prosperity), *Combat* (legality, reprisal,
mercenaries), *Armada* (blockade orders, escort), *Company* (interpreters, hostages), *Discovery*
(who knows what you have charted). Fed by *Diplomacy pieces* (clauses), *Combat* (reprisal),
*Market* (a House raises a court's interest, as `DESIGN.md` already says).

**Replaces.** `Game.bindRegard`'s role as the only output; the rail character of Acts. **Cuts.**
Any piece that cannot end in a clause/lane/person (audit of the 12; the Book of Courtesies stays
as the record of *how you learned each custom*). Seven small threads become contract templates.

**Size.** L. **S1 (M):** treaty clauses over the existing marks (no world clock yet); the pieces
end in a visible clause; Orders > Courts shows clauses and terms. **S2 (M):** conflict state machines
for the Swahili coast and Malabar (the most dramatic lanes), feeding Pillar 1's lane closures.
**S3 (M):** patrons and charters; endings read the patron. **S4 (S):** the remaining conflicts.

**Risks.** Wars that make the one road impassable; guard by letting a closed lane still be sailed
at a cost (dues, risk) and never closing the *trunk* ports to the flagship. Also the historical
accuracy burden (`DESIGN.md` source pass applies); stage-gate with Story.

**Spine.** Patrons and wars do not require a return; news arrives at the port you are in.

---

### Pillar 7. Charts, Surveys and Fame (exploration as an asset, not a log entry)

**Fantasy.** Knowledge is the thing you trade. A surveyed coast is cheaper to sail, a sounded
anchorage is a place to build, and your pilot's book is worth a King's ransom.

**Chart grade.** Every coastal segment and every approach has a **grade**: *Rumour -> Sketch ->
Surveyed -> Sounded* (four states, derived from `Chart` data: survey passes at an offing,
lead soundings, sights). It is computed from what `charts.ts` already holds; no new data capture.

**What the grade does.**
- **Lane risk** multiplier `(1 - 0.5 x grade/3)` on Line, detached-hull and NPC-escort losses (Pillar 3).
- **Passage time** (a pilot who knows the coast saves ~5-10% days on survey grade).
- **Lead and sight reliability** (`soundings.ts` already reads soundings in the frame of whoever took them).
- **A sale price:** the Casa buys survey sheets (standing and money), the Genoese and the rival buy
  them (money, but `heat`), and a published sheet raises *everyone's* grade, including the rival's, so
  secrecy has a price. `cart-sheets`, `cart-copy`, `cart-secret` skills already name this; make it the actual economy.
- **Padrão claims** (the discovery scene, `discovery.ts`) become title to a place: a claim
  gives a House site at a discount and a fame score; a lost claim (the rival takes it first) is a
  real loss.

**Surveys as the fleet's work.** A detached survey hull (Pillar 3) runs a coast at an offing
(`coasting`) and raises its grade; a captain with a Pilot Calling does it ~2x faster. Unknown stretches
(the interior shoals of the Bight of Benin, the Mozambique channel, the Maldives, the Strait of Malacca)
are real jeopardy for a survey, and a lead-and-sight loop is what lets the flagship do it.

**Fame** replaces the scalar renown at the top of the epilogue: a *padrão map* of claims, discoveries,
sheets sold or kept, and "first" markers against the rival.

**Interconnections.** Feeds *Armada* (lane risk), *Market* (new endpoints, a quay site), *Navigation*
(skill payoff, v1 P2's landfall wager scored on grade), *World* (secrecy as policy). Fed by *Company*
(pilot, clerks), *Combat* (a surveyed bay is a battle you choose), *Armada* (survey hulls).

**Replaces.** The six knowledge surfaces (Rutter, Logbook, Chart, hearsay, Orders > Reports) with
one **Captain's Book** that lists what you know, how you know it (`rutter.ts` provenance already
exists), and what it is worth.

**Size.** M. **S1 (S):** grade computation + chart view overlay + lane risk hook. **S2 (M):** sell/give
sheets; claims as House sites. **S3 (M):** survey hulls; fame map; Captain's Book consolidation.

**Risks.** Grade must be legible: a colored coast stripe on the chart, one word on the sea HUD.

**Spine reinterpretation here.** Allowed: forward-closing variants (the volta do largo, the
Brazil swing, a Maldives passage, the channel inside Madagascar). Rule: *a detour is legal if its end is
farther along the road than its start.* A survey is something a hull does, not a reason for the
captain to turn around.

---

## 5. Cuts, consolidated

| Cut / merge | Why | Replacement |
|---|---|---|
| `campaigns/xiyang`, `render/junkMesh.ts`, `scripts/xiyang*.ts` | Shelved; ships nothing; costs regression surface | Keep `fleet/formation.ts`; history stays in git |
| `progression/estate.ts` | A sink for money that had no use | Fleet upkeep, quays, bribery (Pillars 1, 3) |
| `progression/ventures.ts` standalone | Decoration on a solved economy | Generated Contracts (Pillar 1) |
| `progression/livingFactory.ts` silent loop | "Nothing needs a visit" | Prosperity tick; Houses are nodes with a man |
| `Line` payout card as sole event | Black box | Visible detached hulls (Pillar 3) |
| `neverLose` perk / `reprieve()` | A game-over band-aid | Wreck Chain (Pillar 3) |
| ~55 pure-multiplier upgrade entries | Shopping list | ~24 slot fittings (Pillar 2) |
| Note-severity sea events (birds, weed, fish, rainwater, ambergris) | No decision | Ambient barks (`barks.ts`) |
| 7 minor threads (*Passenger*, *Pilot*, *False Weights*, *Fallen Padrão*, *Ship Adrift*, *Stowaway*, *The Count*) | Hand-written text for a templated beat | Contract templates with a roll and a callback |
| Pieces that don't end in a clause/lane/person | Marks nobody can use | Audit of the 12; keep what changes a treaty |
| Rutter / Logbook / hearsay / Reports as separate surfaces | Six places for the same facts | One Captain's Book |
| Tutorial as 13 speeches | First-hour rule | One verb at a time, unlocked by success |

Not cut, deliberately: the render (10.5k lines), the weather, the navigation model, the finance
instruments, the diplomacy engine, the five officer arcs, the legacy system, the Book of Courtesies.

---

## 6. The spine, reinterpreted

`docs/DESIGN.md`: "Nothing may require sailing back." Keep the intent, sharpen the rule:

1. **The captain's person is one-way.** He never has to return for a clue, a letter or a reward.
2. **His assets are two-way.** Detached hulls (Lines), letters, bills, price sheets, dispatches
   travel back and forth. This is the one permitted reinterpretation, and Pillar 3 depends on it.
3. **Detours must close forward.** A variant leg is legal if its end lies further down the road than its start
   (volta do largo, Brazil swing, Madagascar channel). Test with `road.ts: along()`.
4. **Waits are paid by the voyage** (rule 3 stands), so a forced wintering is a consequence of a
   missed window, not a gate.
5. **A new pillar adds a `road.ts` entry** for any place it makes meaningful.

---

## 7. Interconnection map (target web)

Cell = what the row system *gives* the column system. `-` none.

| gives -> | Ship | Company | Armada | Combat | Market | World/Politics | Charts/Fame | Navigation | Finance |
|---|---|---|---|---|---|---|---|---|---|
| **Ship** | | repair rate, quarters, morale | hull state per unit | zones, battery, powder | hold tons bind | a ship is a visit card | survey endurance | rigging affects points | hull value, insurance |
| **Company** | repairs, gunnery, sickness | | captains, rosters | accuracy, boarding | purser discount, factor yield | interpreters, hostages | pilot, clerks | pilot drift | wages |
| **Armada** | per-hull wear | promotions, wounds | | consort broadsides | lane volume | political fact | survey work | formation constraints | upkeep, insurance |
| **Combat** | damage, loss | wounds, deeds | losses, prizes | | raids move prices | legality, reprisal | a charted bay | night/shoal action | prizes, ransom |
| **Market** | parts, stores cost | wages, shares | cargo flow | prize value | | closures, dues | new endpoints | what a leg is worth | capital, credit |
| **World/Politics** | yards, berth rights | hires, languages | blockades, escorts | targets, legality | war closes lanes | | who sees your sheet | pilots offered | charters, dues |
| **Charts/Fame** | - | pilot value | lane risk | known waters | lane endpoints | secrecy | | landfall score | sheet sale price |
| **Navigation** | weather wear | pilot stat | rejoin after scatter | night action | passage time | - | grade of what you sail | | - |
| **Finance** | refit funding | wages | fleet capital | ammo | credit | patron charters | - | - | |

Test of tight interconnection: **delete any pillar and at least four others lose a verb.** Delete
Ship zones and combat is a roll again and the fleet is a count. Delete Market flows and fleet orders have no
price to chase. Delete Charts and lane risk has no skill input. Delete Company and the fleet has no
captains. Delete World and the market is static again.

---

## 8. Prioritised roadmap (each stage ships)

**Phase 0: foundation, ~2 weeks, ships with no new UI.**
0.1 Commit `scripts/econ.ts` (the harness) and fix stock caps so hull size matters (Pillar 1 S1).
0.2 Cut list: Xiyang out of the build, estate deleted, `reprieve` deleted behind the Wreck Chain stub
    (a single-hull loss still ends the game until Pillar 3 S1, but with the new text).
0.3 Stores in tons and the loading screen (Pillar 2 S1).
0.4 Tutorial: one verb at a time (DA constraint). The watch-bell / leg ledger from v1 is the cheap
    sea-cadence piece and should be part of this phase.

**Phase 1: the strategic layer, 2-3 months, the biggest change in how the game feels.**
1.1 Armada S1: one consort, Wreck Chain live (Pillar 3).
1.2 Ship zones + refit (Pillar 2 S2).
1.3 Combat S1-S2: the engagement mode and the prize menu (Pillar 4).
1.4 Armada S2: detach with standing orders.
*Exit test:* a headless full-career bot plays Lisbon-Cochim-Lisbon with a 3-hull fleet and loses at
least one hull on 40-60% of runs without ending the career; a perfect duel bot wins ~75% of fair duels.

**Phase 2: the living world, 2-3 months.**
2.1 Prosperity + monthly tick + quay investments (Pillar 1 S2).
2.2 NPC lanes + contracts (Pillar 1 S3-S4).
2.3 Treaty clauses (Pillar 6 S1) and Swahili/Malabar conflicts (S2).
2.4 Charts as asset: grade, lane risk, sell sheets (Pillar 7 S1-S2).
*Exit test:* 24-month no-player sim keeps all ports above stock floor, best:median profit <= 8:1,
a war closes and reopens lanes; replay seeds differ in outcome.

**Phase 3: identity and endgame, ~2 months.**
3.1 Calling + Company seats (Pillar 5).
3.2 Patrons and charters; endings read the patron (Pillar 6 S3).
3.3 Surveys, fame map, Captain's Book (Pillar 7 S3).
3.4 Smuggling/heat loop and the rival as a house (Pillar 1 S4-S5).

**If only two pillars ship:** Pillar 3 (Armada) with Pillar 2 stage 1-2. Everything the classics are
loved for (a fleet, a hold you tetris, a loss that is a story) hangs off those two, and the
engine for the first is already in the repo.

**If only one fix ships tomorrow:** Phase 0.1. Until hull size matters on the best lane, no ship upgrade,
no Line, no estate, no charter in the game has a reason to exist.

---

## 9. Conflicts with the Devil's Advocate and what I take from it

- *Accepted guardrails:* G1 (spine; sharpened above), G2 (each pillar names what it cuts), G6 (all of
  this lives after the first Funchal landing; the Calling is chosen at the end of Act I), G7 (additive saves),
  G9 (every pillar names a headless falsifier: the econ harness, the duel bots, the 24-month world sim,
  the full-career bot).
- *Disagreement:* DA "do not build naval combat". The Pirates! hook is the tactile short verb;
  the DA wants one ("a tactile ship-vs-ship minigame, see weather gauge, 3 min, no cannon physics").
  Pillar 4 *is* that, with arcs and range bands only. No ballistics. It stays rare.
- *Disagreement:* "freeze new kinds of thing". I agree for content (threads, pieces, goods) and
  disagree for systems: the game has too few verbs, not too many. The pillars each cost a kind
  (section 5) and together delete more surface area than they add.
- *Open item for Story:* Pillar 6's patrons and wars need authored shape (who the bankers are, three
  conflicts' causes), and Pillar 3's Wreck Chain needs 3-4 rescue beats.

## 10. What I did not verify

- Whether provisions already occupy hold tonnage anywhere (I read `crew.ts` provisions as days).
- The unit of `Game.handWage()` (per hand, per month?).
- The 12 diplomacy pieces individually; the "audit" is a recommendation, not a verdict per piece.
- The 24 quest threads individually; the cut list is by title and header, not by reading each thread.
- The econ numbers are first-sale, single-good, relation 0, skill 0, no Casa share, 400-day refresh;
  they show the *shape* (power law, stock-capped), not exact in-game income.
