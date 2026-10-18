# v2 Devil's Advocate: first-principles audit, missing pillars, stress test, roadmap

v1 (`devils-advocate.md`) was a brake. This is not. The user is right that round one was insignificant:
every proposal polished a stage that has no play on it. Evidence below is from the code as it stands.

## 0. First principles: what makes this genre fun

Every classic in the genre (Uncharted Waters, Pirates!, Port Royale, Patrician, Sunless Sea) is the same
machine, and fun comes from three properties of it, not from realism or content volume:

1. **A loop with a rhythm and a payoff**: leave, a risky stretch, arrive, *spend the winnings on becoming
   more able*, leave again, stronger. Uncharted Waters: ~10 minutes. Pirates!: ~10 minutes. Sunless Sea: ~20.
2. **The player's power compounds and is visible.** A bigger ship, a fleet, a rank, a city that grew because
   you traded in it. You can *point* at what you built.
3. **Many viable careers from one world.** Merchant, explorer, privateer, courtier, colonist; each reads
   the same map differently and the world remembers which you were.

Carreira has the best simulation of the *sailing* in the genre and almost none of 2 and 3. It is a
superb physics model attached to a quest-reader. The rest of this doc is organised around that gap.

## 1. System-by-system audit

Verdict key: KEEP / REWORK / CUT / BUILD-NEW. "Connected" = how many other systems read its output in a way
the player can feel.

| System (code) | What the player actually does | State | Connected | Verdict |
|---|---|---|---|---|
| Wind, currents, weather, tides (`world/wind.ts`, 590; `currents`, `weather`, `tides`, `monsoon`) | Reads the season; plans the volta and the monsoon window | Deep, correct, and the single best moat. Routes differ 23 vs 130 days by week (`monsoon.ts`) | Ship, nav, provisions | **KEEP, make it the strategic currency.** Seasonal windows should be what the whole campaign is *scheduled* by |
| Ship physics, polars, rig, trim (`ship/*`, 2,000 lines + 2,200 of mesh) | Sets canvas, trims yards, tacks. Difficulty 'watch' automates all of it | Excellent simulation. Skippable by design at x300+; 'watch' mode removes the verbs | Speed, chases, gale | **KEEP, but a captain must be rewarded for being at the helm** (pursuit, weather gauge, tight windows). Right now helming earns nothing the autopilot doesn't |
| Hull, damage, upgrades (`hull.ts`, `upgrades.ts` 745) | Buys yard services, perks; damage is a number from storm/grounding | Shallow. One hull forever, `damage()` is a scalar, upgrades are stat bumps | Speed, strength, guns | **REWORK into a ship ladder** (caravel -> nau -> galleon, plus specialised hulls) with parts that break (masts exist: `damageMast`) |
| Navigation: reckoning / chart / truth (`navigator.ts` 967, `charts.ts` 1109, `chartView` 1625, `soundings` 587, `celestial`, `instruments`) | Sights stars, casts lead, corrects reckoning; sails a chart that is wrong | Technically superb; ~5,000 lines. As a *game* it is a hidden-information puzzle with a thin payoff: when wrong you hit a reef, when right nothing happens | Charts, lead, landfall, wrecks | **REWORK: keep the engine, change what it *produces*.** The product of good navigation must be *knowledge as an asset*: surveyed coasts that you sell/gift/withhold, safe harbours only you can find, shortcut passages only you can thread. Today good nav just means no wreck |
| Chart as a *product* (`Chart.copyFrom`, `rutter.ts` 528) | Copies a stranger's coast; keeps a rutter | Closest thing to exploration-as-progression; underused | Heir inherits chart | **BUILD-NEW on top: Charts become tradeable/sellable/stealable goods, the Casa pays for them** |
| Exploration / discovery (`discovery.ts`, `farLand.ts`, `LANDMARKS`) | Claim / look / press on at pre-placed headlands | The world is a *fixed real map*; "discovery" is a scripted scene at ~10 landmarks. No emptiness to fill | Renown | **REWORK: the unknown must be un-known.** See pillar D |
| Provisions, scurvy, flux, water (`crew.ts`, `seaEvents.ts`) | Tops up water/food; scurvy rolls | Real tension, but it is a **clock with a refill button** at every port. Solved by "buy more" | Crew, speed of leg | **REWORK: make supplies a *logistics network*** (victualling stations, biscuit contracts, spoilage by climate) instead of a gauge |
| Crew & officers (`crew.ts` 524, `hands.ts`, `officers.ts`, `arcs.ts` 881, `skills.ts` 448, 72 skill nodes) | Hires, reads officer arc cards, spends skill points in 5 trees | Strong *writing*; mechanically a passive-bonus tree. Seven officer arcs = cards. Skill trees are +x% nodes, tier 7 "crowns" | Mutiny, barks, bonds | **REWORK: skills must unlock *verbs and options*, not percentages.** A 72-node percentage tree is fat. Officers should be *assignable to roles on ships/stations* (Uncharted Waters' lieutenants) |
| Mutiny (`mutiny.ts` 350) | A scene with sides | Good, rare | Hands regard | KEEP |
| Markets (`market.ts`, `goods.ts` 40 goods, `portCharacter.ts`) | Buys cheap, sells dear; price climbs as you empty a shed | **The economy is a static table with a decaying glut/stock.** `baseStock(def, good, abundance)` is a function of a port's *size and wealth constants*. Nothing grows, nothing produces for another port, no convoy is ever *in the world* | Prices, shocks, Houses | **REWORK, deepest in the game: living economy.** See pillar B |
| Trade info (`trade.ts`: stale price sheets, SHOCKS, FAIRS, PAYMENT, COMPETITION, licences) | Reads old sheets, sometimes barters | **Clever and unseen**: 544 lines of period-correct detail that the player experiences as "prices were off a bit" | Prices | **KEEP the idea, fold it into the new economy**: sheets become *intelligence the player pays for and sells* |
| Finance (`finance.ts`: câmbio, letra, quinhão, 5 Houses) | Borrows when short | Three debt instruments, five lenders. Players will pick one and ignore the rest. A side-quest in a menu | Ship loss, Houses | **CUT to one instrument and one lender character**; keep câmbio (loss-contingent) because it's the one with a decision. Quinhão -> partnership shares (the investor system, see pillar F) |
| Estate, legacy/heir | End-state sink | The late-game "what do I do with money" answer is a menu | Heir | **REWORK into the strategic layer** (pillar F) or cut |
| Houses & Lines, factories (`network.ts`, `livingFactory.ts`, `feitoria.ts` 451) | Sets a posture per House, buys a hull per Line, gets one payday card per voyage | **The most "game-like" late system and it is built to need no attention.** Automation without a player decision = a spreadsheet that mails you money | Casa share, marks | **REWORK: this IS the strategic layer; stop making it passive.** Make it the thing that creates convoys, supply, city growth |
| Diplomacy set-pieces (12 pieces in `diplomacy/pieces/`, ~1,700 lines; Book of Courtesies; marks) | A small modal puzzle at an audience | **Sidecars.** Each is a self-contained 2-5 minute minigame with a solver bot, whose outputs (a mark) affect a regard number and a House price discount (6%/kind mark, max 3). Play-wise: "pick the right gift/phrase". They do not change *what you can do next* in a way the player reasons about | Regard, House price | **REWORK into a *politics sim***: marks become standing, treaties, ports you can/can't use, wars you are dragged into. Keep 4-5 pieces (Silent Trade, Gift Table, Go-Between, Refusal, Envoy). **CUT or fold the other 7** into one parameterised "audience" scene. The bots are good engineering for the wrong thing |
| Polities & regard (`polities.ts`, `courts.ts`, 27 polities, 3-part trust/respect/interest) | Number goes up/down | A hidden number with a lot of formula. Polities don't act on each other or on the player unprompted (no wars, alliances, embargos) | Regard, prices | **BUILD-NEW: factions that act** (pillar C) |
| Acts / commissions / quests (`chronicle.ts`, `crown.ts` 690, `quests.ts` 3,858; 36 threads) | Takes commission, sails to X, reads cards | The strongest authored content and the **only** goal structure. A single linear road of ~5 acts with side threads. No branching careers | Everything feeds *it* | **REWORK into career paths** (pillar E). Keep the content as a library; stop making the road the *only* way to play |
| Ventures/charters, Casa (`ventures.ts`, `casa.ts` 519) | Optional contracts | Redundant with trade + commissions (DESIGN.md already says "do not add more kinds") | Prices | **FOLD into the new contract/economy layer** |
| Rival (`rival.ts`, `rivalEvents.ts`) | A story, shows in prices | A ghost; never contested on the water | Prices | **REWORK into a real competitor with ships on the map** |
| Encounters & combat (`encounter.ts`, `hailing.ts` 584; `boardingOdds` = one roll) | Hail, chase, board by a roll | **Hollow centre of the game.** Chase is physical (polars), the fight is a coin flip with text. Not one tactical decision in a fight | Prizes, nation regard | **BUILD-NEW (pillar A). The most important single gap.** |
| Fleet engine (`fleet/formation.ts` 232, `game/fleet.ts` 151) | Used only by shelved Xiyang; a Carreira player never has a second ship | Finished engine, zero use. Sunk cost | None in Carreira | **USE IT or CUT it.** It is the foundation of pillars A and F |
| Sea events (15 in `seaEvents.ts`) | Occasional card | 15 events over thousands of hours; four are "note" severity log lines | Provisions | **REWORK: events should be consequences of the sim (a ship you crossed, a harbour you neglected), not a die table** |
| UI loops (portView 7 tabs + barter, Orders 7 tabs, pilot panel, chart, rutter, book, logbook, crew) | Navigates menus | 6,000+ lines of UI for a game with a thin loop. UI mass is high **because** the loop lacks a centre | All | **REWORK around the new loop**; set a hard menu-budget |
| Tutorial (13 steps) | Reads pilot lectures | A wall | None | REWORK as 6 verbs |
| Time acceleration | x1 ... x14400 | The game's pacing is "skip to the next card" | All | **REWORK: the watch bell + decisions at sea (rhythm)** |
| Xiyang campaign (787 lines in `campaigns/` + 1,317 `junkMesh.ts` + admiral/skin UI + 5 scripts) | Shelved | Dead weight in the repo | none | **CUT from the shipping bundle** (keep in a branch); keep only the fleet engine |
| Render (ocean 1,280, shipMesh 2,209, sky, settlement, land) | Looks | Gorgeous; beyond what the loop deserves | n/a | KEEP; stop adding |

### Brutal answers to the "pride" questions

**The three-frame navigation model.** It is a *brilliant mechanism* that currently has no *game around it*.
The player hears "your chart is wrong, here's an ellipse", does the correct drill (star sight, lead), and
the reward is *not being surprised*. That is a tax, not a joy. It earns its place only if (a) knowledge
produced by doing it well is a **thing you own and can trade** (charts, harbour approaches, tidal windows),
(b) it creates **opportunities others can't take** (a night entry to a port past a patrol; a shortcut that
needs a good fix), and (c) its error is **dramatic** (the cheapest drama in the game: the island not where
the chart said). Keep the engine; rewire the output. Do not touch the internals.

**The diplomacy minigames (12 pieces + Book of Courtesies + marks).** Sidecars. Each has a solver bot
proving it is a balanced puzzle, which is exactly the problem: they are *puzzles with a solution*, and their
only output is a mark that nudges a number the player doesn't track. Players will meet each piece two or
three times in a career. Twelve bespoke pieces (~1,700 lines + 12 solver scripts) is the least efficient
content in the repo. Keep the **Silent Trade, Gift Table, Go-Between, Hostage, Envoy** (the ones that
move people or goods that stay on the ship) and fold the rest into a single "audience" frame where the
ruler's *wants* (a faction-sim state, see C) set the options. The Book of Courtesies is the right idea
(learned *how*) if it gates options; if not, it's a codex.

**The ~40 set pieces.** (~12 pieces + 15 sea events + 36 threads + 4 origin arcs + 7 officer arcs.) Not
too many in absolute terms; too many *disconnected* ones. The test for every one: *what state did it
change that a later scene reads?* DESIGN.md says "each mark alters at least one later scene". That is a
low bar: altering one later scene is a branch, not a system. A set piece earns its place when it changes the
**map of options** (a port closes, a channel opens, a rival forms, a ship is lost).

## 2. Missing pillars, ranked by leverage

A genre-classic player expects these. Rated by (value to fun) x (reuses what exists) / (cost).

| # | Pillar | Exists? | What it would be | Leverage |
|---|---|---|---|---|
| **A** | **Encounters & combat with tactical depth** | A chase (polars) + a die roll | A real encounter *as sailing*: weather gauge, range, rake, board, flee, strike colours, parley. Uses the physics you already have | **Highest.** The hollow centre; the physics make it unique rather than another Pirates! clone |
| **B** | **A living economy** | Static base stocks + glut + stale sheets + shocks | Ports **produce and consume**, grow/shrink with trade, ships on the map move goods between them (the rival, NPC merchants, convoys), supply chains (grain->ships; copper->guns), piracy disrupts it. Every voyage *changes* a port | **Very high**, and the most reusable: prices, Houses, Lines, regard, politics all plug into it |
| **C** | **Politics / faction sim** | Regard numbers and marks | Polities with goals, treaties, wars, embargos; the player's acts shift the balance (Kilwa vs Melinde; Calicut vs Cochim; Kongo's succession). Output: **access** (ports, licences, pilots, allies) | **High.** Turns diplomacy from sidecar into the strategic skin of the whole map |
| **D** | **Exploration as progression** | Fixed map, ~10 scripted landmarks | Partial fog on a *knowable* map: unsurveyed coasts, rumoured places, charts as goods, prize for filling blanks, a Casa that pays per sheet. Reuses chart engine | **High**, cheap, high-synergy with navigation |
| **E** | **Multiple career paths & goal structure** | One road, 5 acts | Merchant house / Crown captain / privateer-corsair (the Moorish/Castilian war) / explorer-cartographer / (late) colonial factor. Same world, different win states and different parts of the economy lit up | **High** and mostly authored on top of A-D |
| **F** | **Strategic layer above the single ship** | Houses, Lines, estate (passive) | The captain becomes an owner: ships under officers (fleet engine), routes, stations, convoys, a fleet to command in Act V. Choices about who sails what and where | **High**, uses existing Houses/Lines/officers/fleet |
| **G** | **Character/crew RPG progression** | % trees, officer arcs | Skills that unlock verbs, officers who **command** ships and stations and have loyalties; a company that is a *roster of capability* | Medium (needs F) |
| **H** | **Ship ladder / shipbuilding** | One hull, upgrades | Ship classes and parts that matter in combat and trade; a yard with a real economic role | Medium (needs A, B) |

## What does *not* get a pillar
Realism items (finer wind, more instruments) and any new "kind of authored thing". The sim is already past
the point of returns. The next win is *consequence*, not fidelity.


---

## 3. Stress test of the v2 proposals

Read: `v2-gameplay.md` (7 pillars) and `v2-story.md` (7 pillars, 0-6). Both are a real step up and both did
the work the user asked for: they name systems, cut things, and draw interconnection matrices. Gameplay also
*measured* the economy (best:median profit 130:1 on the first sale, so hull size and hold are irrelevant today:
that single finding justifies the whole economy pillar). The criticism below is aimed at making the combined
plan survivable, not at slowing it.

### 3.1 Pillars that are real vs. features in disguise

A pillar is real if (a) it has state that changes by itself, (b) at least three other systems read that
state in a way the player feels, and (c) deleting it makes at least four others lose a verb.

| Pillar | Verdict | Why |
|---|---|---|
| G1 Living Market | **Real, the best one.** | Autonomous state (prosperity, lanes), read by war, fleet, combat, charts, contracts. Measured baseline. |
| G3 Armada | **Real** | Fleet engine exists; makes Lines visible, loss survivable, officers useful. Needs the anti-AFK fix below. |
| G4 Sea Combat | **Real if it stays a pillar, a feature if "rare and avoidable"** | See 3.3: rarity makes it a 3-stage L cost for ~1 encounter per two voyages. Must be the core loop of at least one career path. |
| G2 Ship as Machine | **Half.** Stores-in-tons is a real constraint (feeds market + armada + combat). Five zones + 24 fittings + ship history is a maintenance chore plus a shopping list | Ship history is a flavour field. Keep S1 (tons) and zones only where combat reads them. |
| G5 Company + Calling | **Disguised feature** | "Nodes outside Calling cost x1.6, capstones only inside" is a cost multiplier on the same 72-node percentage tree I called fat. The four signature verbs are v1 proposals I cut (landfall wager, bills). Redo or cut. |
| G6 World That Answers | **Real but duplicated** | See 3.2: it is the same pillar as Story P3. |
| G7 Charts/Surveys/Fame | **Real, cheap, under-ambitious** | 4-state grade derived from existing chart data is the best cost/benefit item in either doc. Timid on the unknown (3.5). |
| S0 Ledger | **Real, foundation** | Append-only, ~70 tags, read by everything; includes the dead-tag test. Correct to ship first. |
| S1 Captain: Conviction + Titles | **Feature in disguise, high content tax** | Six convictions each gate options in *every* scene = a 6x authoring matrix. Titles by predicate over the Ledger are cheap and good. Cut convictions to the three that change economy/combat rules; keep titles. |
| S2 Company (approval, exits) | **Real** | Approval tables are the Baldur's Gate 2 trick and cheap. Merge with G5. |
| S3 Powers + Fronts + Rumour | **Real, the best story pillar** | Autonomous clocks, rumours with truth/age/source, consumed by prices, offers, storylets. |
| S4 Web (storylets) | **Infrastructure, not a pillar** | It's the authoring format that lets S0-S3 produce content. Necessary, but "port 25 threads, one a week" is a 6-month rewrite of the largest file (3,858 lines) with zero player-visible change until done. See 3.6. |
| S5 Places: 14 Deep ports with Patron + Quarters + calendar | **Real but dilute** | 14 patrons with personal arcs is ~14 mini-threads. Ship 5. The Quarters-as-navigation reduction of the 7-tab port UI is the real prize and should go first. |
| S6 Patronage and Dynasty | **Mixed** | Patron of record (Crown / Church / Rua Nova) = career paths: real, and it answers the missing "multiple career paths" pillar cheaply. Multi-life dynasty (2-3 lives, 12-15 years each) is a second game; the content for generations 2-3 does not exist. Keep `inheritFrom` + decayed Ledger. |

### 3.2 Collisions and duplicates (must be resolved before anyone builds)

1. **Two world simulations over the same polities.** Gameplay P6 (monthly tick, ~10 conflict state machines,
   treaty clauses, patrons) and Story P3 (monthly tick, 8 Powers with `intent`, 6 Fronts, rumours, offers,
   `marketModifiers`). Same table (`polities.ts`), same tick, same outputs (lane closures, prices, offers).
   **Decision: one engine, owned by Story's Powers/Fronts; Gameplay's conflicts become Fronts and its treaty
   clauses become the *output vocabulary* of the diplomacy audience.** Gameplay consumes through the one function
   both proposed: `marketModifiers(port, t)`.
2. **Three memory systems proposed on top of four existing ones.** Marks (kept by Gameplay, now ending in
   "clauses"), Story's Ledger, and the Captain's Book (both docs define one: Gameplay as the knowledge
   surface replacing Rutter/Logbook/Reports, Story as the autobiography view of the Ledger). **Decision: Ledger =
   the data; Captain's Book = the single UI over {Ledger, Chart grade, Rumours, Book of Courtesies}.** Clauses
   are Ledger entries with a term. Marks are deleted as a separate store.
3. **Two identity layers.** Gameplay's Calling (Pilot/Factor/Capitão-mor/Master-builder) and Story's Conviction
   (6) plus Titles (30) plus Patron of record (3). A captain would choose a Calling, a Conviction and a Patron:
   three orthogonal pick-lists at a character screen before the first sail. Violates the first-hour rule and
   is fat. **Decision: Calling = the mechanical build (what you are good at), Patron = the political career
   (who you work for), Titles = earned, never picked. Cut Conviction as a start-of-game choice; let it be
   a Title earned from the first act's choices (Disco Elysium style: you become the thing you did).**
4. **Two Company models.** Gameplay P5: 12 seats with stats, wounds, promotions. Story P2: companions with
   wants, approval, conflicts, exits. These are the same people. **Decision: companions are the seat-holders.
   Seats and stats from Gameplay; approval and exits from Story; one table.**
5. **Two things called "Wreck Chain/Dynasty/heir".** Gameplay: wrecked captain continues with a smaller ship.
   Story: the heir inherits Fronts and decayed Ledger. They must share one "career continues" state machine.
6. **The `Stranger` schema is specified by both** (Gameplay: terms/prizes/legality; Story: master, owner, passengers,
   people). One struct, two authors; assign it to whoever writes `hailing.ts` changes first (Gameplay) with Story
   filling named-master data.
7. **Duplicate cut lists agree** on estate, ventures, livingFactory, Xiyang, `reprieve`. Good. They disagree
   about `finance.ts`: Gameplay keeps all three instruments; Story is silent. See 3.4.

### 3.3 Where the interconnection matrices are hand-wavy

Gameplay's 9x9 grid is mostly well specified (quote: "delete any pillar and four others lose a verb"). Soft cells:
"Ship -> World: a ship is a visit card", "Navigation -> Armada: formation constraints", "Charts -> World: secrecy"
(no rule says what a rival does with a leaked sheet). Story's matrix is thinner: "Company -> Powers: back-channel",
"Places -> Captain: Patron greeting by title" are flavour, not a computed dependency.

The real load-bearing artefacts do not exist yet, and both designs rest on them:
- **The Ledger-tag -> Front-delta table (~60 rows)** and **tag -> companion-approval table.** Until these are
  written, "interconnection" is a promise. Write the 60 rows before writing any code; if you cannot fill the
  table in an afternoon, the tag vocabulary is wrong.
- **The `marketModifiers(port, t)` signature**, in code, with the Front/lane inputs enumerated. Both docs
  depend on it; neither defines it.
- **The Traffic Front vs the economy.** Story's Traffic stage 3 is "plantations and a Casa quota; cheap sugar".
  Gameplay's lane sim lists the trunks but not São Tomé/Madeira sugar supply, and people are explicitly "not a
  good". So which lane carries the Traffic, and what does the player see in a price? Not defined. Either the lane
  sim gets a typed non-priced cargo, or the Front acts only by shocking sugar and labour-dependent ports. Decide.
- **A Front with no player lever is not a game.** Story: "no lever stops a great process"; the player's best
  action moves the Traffic -0.15 against a +0.5 baseline. Honest to history, but the game risks making the
  morally heaviest system the one where the player has the least agency, which reads as a lecture. Fix: pair
  every unstoppable Front with one *winnable local fight* (the Rule is one; give the Traffic one too: a
  named port whose practice the player can actually change, at cost, once).

### 3.4 Degenerate loops and dominant strategies (find these before building, not after)

| # | Loop | Where | Why it breaks | Guard |
|---|---|---|---|---|
| 1 | **Fleet autopilot.** Buy hulls, assign standing orders, sit in a House; 6 hulls on the best lane | G3 + G1 | Upkeep is 0.8%/month of price (a 6,800 nau costs ~54/month and earns 2,500-3,500 a voyage). The "Lines are a spreadsheet that mails you money" critique applies unchanged; hulls are just visible now | Make lane capacity finite and shared with NPCs (player's share saturates the lane: Gameplay already has `cap_lane`; enforce price impact of *your own* volume per lane), cap hulls by seats (companions), give each detached hull a decision at each port (events needing your seal) |
| 2 | **Prosperity pump.** `+0.10` of the cap per quay/fort funded; funded port grows, grows its lane flows, grows your House yield | G1 | A compounding loop with only the player funding it | Diminishing returns by port size; prosperity decays; rival + war shocks aim at your favourite port |
| 3 | **Heat laundering.** Contraband heat is `+1`/unit-load, `-1`/month: skip the clock | G1 | The clock is free (x14400); heat decays by waiting | Heat decays only through activity (a presented gift, a sold mark, a favour), not time; or inspections scale with *distinct* uninspected voyages |
| 4 | **Scuttling for debt relief.** Sea loans (câmbio) die with the ship; Wreck Chain makes loss survivable and mild | G3 + finance.ts | Borrow max on câmbio, run onto a lee shore at low value, keep cargo funds | Casa investigates ship loss with an insurance-fraud predicate (cargo declared vs aboard, route deviation); standing hit |
| 5 | **Weather-gauge kiting.** Lateen caravel out-points a nau forever, shoots rigging at range 3 | G4 | AI that does not use the same polars will be kited by a human | AI uses `bestCourse` (exists in `encounter.ts`) and the same trim; reload/range bands so kiting costs ammunition tons; AI gets support from shore guns near ports |
| 6 | **Prize farming.** Sail the lane, take prizes, sell cargo at 70% + 30% coin | G4 | Currently capped by a coin flip and cargo glut; once combat is skillful it is the best income per hour | Price effect of raiding (Gameplay says lane price moves); legality and Rule consequences must cost *economically* (lane closures, Port dues) not only standing |
| 7 | **Chart sheet farming.** Survey, sell sheet to Casa, Genoese, rival | G7 | Fixed map = finite sheet supply (good: a natural cap) but replays with heirs refill it | Heir inherits chart at a grade discount; sheets age and are re-sold only after storm/silting change |
| 8 | **Rumour trading.** Buy tavern rumours, read their `truth` | S3 | If truth/source/age are all visible there is no uncertainty | Show source and age, never truth; truth emerges from a second source or arrival |
| 9 | **Conviction ratchet.** *Honest Weights* "courts accept your word, no hostages" vs. "cannot take the Count" | S1 | Cost is one thread; benefit is on every court | Costs must be economic and continuous (e.g. -3% buy-side haggling everywhere), not a single refused scene |
| 10 | **Idle-the-clock.** Monthly tick + x14400 + monthly rumour spawn | S3 + G1 | Time skipping to harvest offers; offers have deadlines but the world also decays | Offers cost standing if missed; the world doesn't pause at the port; fine if tuned, a grind if not |

### 3.5 Where the proposals are timid (the user asked for bold)

1. **Both docs treat the map as a given.** The strongest idea from Sunless Sea and Uncharted Waters is
   that the *unknown* is a place the player is afraid of, and a second playthrough is not a replay. Carreira's map
   is real and fixed, but the *Casa's chart already has seeded error* (`seededError` in the three-frame
   model). Extend that, cheaply: per run, seed **phantom coasts and mislocated places** the Casa's sheet shows
   (the Island of Brasil, Antillia, a Rio de Ouro a day off, the Kingdom of Prester John at three
   latitudes). Some are real discoveries displaced; some are phantoms. A rumour/hearsay ("a man at Funchal swears to
   the Brazil island 200 leagues west") is an exploration offer, resolved by sailing. The chart grade pillar
   (G7) then has something to *find*. Cost: a seeded list of 10-15 "claims" per run, resolved by existing
   `discovery.ts`. Neither doc proposes it.
2. **The unit of play is still "a voyage", with no season structure.** The Carreira was a *year*: March departure,
   September monsoon arrival, January return. That is the rhythm principle (1) hands you for free:
   **winter quarters at Lisbon** (hire, refit, politics, dynasty, letters, the Casa's auction) -> **sailing season**
   -> **homecoming** with a payoff screen. Gameplay's phases and Story's Places both need this. Make the
   year the loop: it fixes pacing, gives Lisbon a function without making it a checkpoint (the voyage still
   begins and ends there, which DESIGN.md allows), and gives the world tick a natural cadence.
3. **Combat "rare, avoidable" is the old safe answer.** In Pirates! and Uncharted Waters combat is a core loop
   for the whole career; here the physics (the one thing no competitor has) is the combat engine, and the
   doc shackles it to one fight per two voyages. Give it a *career* where it is the loop: the privateer path
   (Patron: Free Hand / a Crown *carta de corso* in the war with Castile, or the Barbary/Moorish raiders on the
   Algarve and Atlantic coast), with hunting and escort lanes, so players who want the Pirates! loop have
   it and the merchant player can still avoid it.
4. **No pillar owns Information as a currency.** The game already has price sheets with age/confidence
   (`trade.ts`), `leads.ts` (hearsay wrong by N nm), chart grade (G7), rumours (S3), the Book of Courtesies. Four
   docs, four mechanisms for "what you know and how old it is". **Unify:** every fact the player holds is
   `{claim, source, age, confidence}`; prices, politics, hazards and charts are all the same object; the
   Captain's Book is a list of them; spies/informers (a piece that exists) sell and verify them. This is the
   single most interconnecting move on the table, and it turns three of the existing systems (stale price
   sheets, hearsay leads, chart amend) into one, deleting code.
5. **The player never owns a place.** House/Factory/fortress are nodes the player buys. No one proposes the
   Port Royale/Patrician move of a *home port with a council seat* or a captured town the player governs.
   Late-game: take Cochim's fortress or a Malabar quay and become a Governor with a budget, a garrison and a
   Front to manage. That is the strategic layer (principle 2: power compounds *visibly*).
6. **Calling's x1.6 cost multiplier is timid.** Make the Calling unlock *verbs and ships* (a Pilot may take a night
   entry past a blockade because the fix is tight; a Capitão-mor commands a consort squadron; a Factor
   opens a House without a court; a Master-builder lays down hulls). Not a price on the same tree.
7. **Hold tetris is unambitious.** Stores-in-tons is a good constraint, but classic fun is the *tradeoff*
   screen, not the fill bar. Add cargo with consequences: livestock (horses for India), passengers (envoys,
   missionaries, convicts), powder (also a bomb), sacred things. Consequence-bearing cargo is what makes
   the hold an RPG.

### 3.6 Minimum shippable slice of each pillar (exit criterion = a player-visible difference)

| Pillar | Minimum slice | Player-visible effect |
|---|---|---|
| G1 Market | Stores/hold caps so hull size matters + `econ.ts` harness + prosperity on 5 ports | A bigger ship earns more; a port you funded grows |
| G2 Ship | Stores in tons + loading screen | You choose what not to carry |
| G3 Armada | One consort, Wreck Chain, `reprieve` deleted | You can lose a ship and keep a career |
| G4 Combat | Engagement mode: arcs, ranges, one ammo, strike/flee, prize menu; no boarding minigame | The weather gauge decides a fight |
| G5/S2 Company | Approval table for the six existing arcs + two new companion arcs (Escrivão, Língua) | Companions react to what you did |
| G6/S3 Powers | One Front (Traffic) + Kilwa-Mombasa-Melinde conflict; rumours; `marketModifiers` | A war closes a lane; a rumour is wrong |
| G7 Charts | Grade overlay + lane risk hook + sell a sheet | Surveyed coasts are cheaper to sail and worth money |
| S0 Ledger | Ledger + Captain's Book + Two Chronicles epilogue | Every run ends differently |
| S4 Web | Quality store in dual-run; 3 threads read it | Offers depend on who you are |
| S5 Places | Mina as a Deep port end to end + Quarters replacing tabs | The port UI shrinks; one port has a person |
| S6 Patronage | Patron of record with three charters | Three different careers on the same road |

### 3.7 Scope reality check

Gameplay's phases total ~7-9 months of solo-dev time ("2 weeks + 2-3 months + 2-3 months + 2 months"); Story's
seven stages are of the same size, and they overlap by roughly 40% (3.2). Taken separately that is about
16 months; deduplicated about 10-11; the cut list below recovers about 2. **A combined first release should be
Phases 0-1 of Gameplay + Stages 0-2 of Story, with the Powers engine unified (3.2 #1), and everything else
is a later release.** Do not announce a roadmap whose Phase 3 depends on authoring volumes nobody has estimated
in hours.

---

## 4. Recommended structural roadmap

Principles for the order: (a) measurement before change; (b) additive state before anything that rewrites
state; (c) cut the dead weight early because it shrinks the regression surface; (d) every release is a
different *game*, not a longer one.

### Phase A: instrument and cut (2-3 weeks; no save change)

1. **A full-career headless bot and a golden-save corpus.** Today `scripts/` is 20 files, nearly all
   diplomacy and fleet solver bots; there is no end-to-end test and no unit-test directory. Before changing
   anything: a bot that plays Lisbon-Cochim-Lisbon, a set of 5-10 `SAVE_FORMAT 3` saves captured at
   different points (mid-piece, mid-venture, with Lines, with an heir), and a round-trip check that loads each.
   Every later phase must keep this corpus loading.
2. **Commit Gameplay's `econ.ts` harness** (the 130:1 finding) as a regression script.
3. **Cut, in this order** (each is a save-compat risk; migrate on load, never silently drop): Xiyang out of
   the bundle (saves already refuse them); `reprieve` (replace with stub text until Wreck Chain exists);
   `estate.ts` (convert holdings to purse on load); `ventures.ts` as a generator (convert active ventures to
   plain contracts); `livingFactory` silent loop (keep Feitoria data, stop background ticks); fold 7 of 12
   diplomacy pieces into one audience frame (resolve any in-progress piece on load); delete note-severity
   sea events (move to barks); reduce finance to câmbio + one lender + shares.
   Expected recovery: roughly 2,500 lines of Xiyang/junk plus 1,500-2,000 lines of estate, ventures, factory
   loop, fold-in pieces and finance.
4. **Tutorial rewrite** (6 verbs). First-hour rule. No state.

### Phase B: the spine of consequence (3-4 weeks; additive saves)

5. **The Ledger + Captain's Book** (Story S0). Additive; marks become Ledger entries with a migration;
   dead-tag script. Ship the Two Chronicles epilogue as the visible payoff.
6. **Information as a currency** (3.5 #4): unify price sheets, hearsay and chart grade into one `{claim, source,
   age, confidence}` model inside the Book. Chart grade overlay (G7 S1).
7. **Stores in tons, loading screen, hold caps** (G1 S1 + G2 S1). This changes balance, not state shape.

### Phase C: the first different game (2-3 months)

8. **Armada S1 + Wreck Chain** (G3). `fleet` is additive and defaults to `null`.
9. **Sea combat S1-S2** (G4): engagement mode and prize menu, with the privateer-lane hook (3.5 #3) and the AI
   using the player's physics (3.4 #5).
10. **Prosperity + monthly tick on 5 ports** (G1 S2), and the Powers engine with *one* Front (the Traffic)
    plus the Swahili conflict (unified S3/G6). This is the first change that reshapes `Markets`: put prosperity in
    a new `MarketState` field with a default, never reinterpret old fields.
11. **The Year** (3.5 #2): winter quarters at Lisbon as the cadence for refit, hiring, patron business, the Casa
    auction. Uses Places Quarters as the UI.

*Exit test (the "is it fun?" check):* a fresh playtester in 3 hours loses a ship and continues, wins or flees a
fight by wind, sees one price swing they can trace to a war, and reads their own epilogue chronicle. If any of
those four do not happen unprompted, Phase C failed.

### Phase D: depth and identity (2-3 months)

12. Companions (approval, seats, exits), titles from predicates, Patron of record (Crown / Church / Rua Nova),
    patron charters (G5+S2+S6).
13. NPC lanes and contracts replacing charters (G1 S3-S4); the rival as a house; heat and inspection (with the
    non-clock decay rule).
14. Deep ports, five of them (Mina, Arguim, Melinde, Calecute, Lisbon) with Patron and calendar.
15. Phantom coasts and chart sheet trade (3.5 #1, G7 S2).

### Phase E: later, only if the above lands

Web migration of the remaining threads (one per week, ending the 3,858-line file), Dynasty beyond `inheritFrom`,
Governor mode for a captured quay, the remaining conflicts and Fronts, ship zones beyond what combat reads,
12 company seats beyond the first six.

### What to cut to pay for it (summary)

Xiyang campaign, junk meshes and scripts; estate; standalone ventures; livingFactory background loop; 7 of 12
diplomacy pieces (keep Silent Trade, Gift Table, Go-Between, Hostage, Envoy); two of three debt instruments and
four of five lenders; ~55 pure-multiplier upgrades; note-severity sea events; the 13-speech tutorial; the Calling
x1.6 multiplier and the start-of-game Conviction; 14-patron Deep-port plan (do five); multi-life dynasty as a
structure (keep `inheritFrom`); the Rutter/Logbook/Reports/hearsay as separate screens (one Captain's Book).

### Order that avoids breaking saves and tests

1. Test corpus and harnesses first (A1-A2). 2. Cuts with load-time migrations (A3), each verified against the corpus.
3. Additive fields only (Ledger, fleet, prosperity, Powers) with `??=` defaults at the load boundary (the house
style at `state.ts` ~9702). 4. Only then change *semantics* of existing fields (market stock caps, câmbio
rules), behind a `SAVE_FORMAT` bump with a one-way migration and the corpus run before and after. 5. Never
delete a quest thread or piece type that can be mid-flight in a save without a resolver on load.
