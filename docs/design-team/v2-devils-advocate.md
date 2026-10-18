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
| Xiyang campaign (≈4,000 lines + 1,300-line junk meshes) | Shelved | Dead weight in the repo | none | **CUT from the shipping bundle** (keep in a branch); keep only the fleet engine |
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

