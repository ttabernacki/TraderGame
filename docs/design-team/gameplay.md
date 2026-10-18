# Gameplay design pass: Carreira da Índia

Author: Gameplay designer. Basis: CLAUDE.md, DESIGN.md, ROADMAP.md, `road.ts`, and the header
contracts plus selected bodies of `game/`, `navigation/`, `economy/`, `crew/`, `ship/`,
`progression/`, `fleet/`. I have not played a full career, so every "thin" claim below is read off
the code and flagged where it needs a playtest to confirm. The Xiyang campaign is ignored.

## 1. Assessment of the loop as it stands

**What is already excellent and must not be touched:** the three-frame navigation model
(reckoning / chart / truth), polars-driven chases and lee-shore sums (`encounter.ts`, `gale.ts`),
period-correct market information (stale price sheets, `trade.ts`), the finance instruments
(`finance.ts`: câmbio, letra, shares), named hands and mutiny-as-scene (`hands.ts`, `mutiny.ts`),
and the Book of Courtesies. The simulation is deeper than the game wrapped around it.

**Where it is thin:**

1. **Skill is never scored.** You can be a superb navigator (`navigator.ts`, `soundings.ts`,
   `charts.ts`) or a sloppy one and the game only notices when you hit something. Mastery has no
   visible curve: no moment where the game says "you called that landfall to nine miles". The
   best-built system in the repo has the weakest feedback loop.
2. **The ship is a single hull, forever.** `PlayerFleet` and the whole formation engine
   (`fleet/formation.ts`, `game/fleet.ts`) are only instantiated for the shelved Xiyang campaign.
   The Carreira was *armadas*: Dias, Cabral and da Gama all lost ships out of a fleet, and DESIGN.md
   itself cites it. Your own Lines run hulls, but you never sail with one.
3. **Failure is binary.** `wreckHer()` and foundering call `endGame()`; the only softener is the
   `neverLose` perk's one reprieve (`reprieve()`), and the epilogue/heir path is a post-mortem. The
   most dramatic event in the genre ends the session instead of starting a different one.
4. **Combat is a menu and a die.** `boardingOdds()` in `hailing.ts` settles it; the chase is
   physical, the fight is not. That is defensible tonally (the game is about not fighting), but it
   leaves "my ship's guns and trim" nearly irrelevant.
5. **The late game automates itself away.** Factories "run themselves", Houses and Lines are
   "managed from the Orders book", estate income "piles up". Good for the one-road spine, but the
   player's verbs in Acts IV-V shrink to the same sailing plus a spreadsheet. The risk is a
   captain who is rich and idle.
6. **No downtime verb.** There is a yard and a careening mention in `portView.ts`, but no decision
   about *when and where to stop*: no wintering, no careening to fight weed and shipworm
   (`upgrades.ts` has the multipliers but nothing makes the player pay the time), no waiting for
   the monsoon as a planned act. The calendar (`monsoon.ts` is a rich timetable) is information, not
   a constraint with a price.
7. **Session shape is invisible.** Three-month passages are interleaved with rare interrupts
   ("deliberately rare", `seaEvents.ts`) by design. That is right, but nothing frames a leg as a
   unit: no plan going in, no accounting coming out. A player who quits mid-passage has no sense of
   having *finished* something.
8. **Replay is origin x seed.** Four origins (`origins.ts`), an heir (`inheritFrom`), randomised
   shocks. Good bones, but no reason to replay the *same* road and compare yourself with anything.

## 2. Proposals, ranked by impact/effort

Build sizes: S = days, M = 1-3 weeks, L = a month or more. Every proposal states how it respects
the one-road spine; none adds a destination off the trunk or a reason to sail back.

### P1. The Leg Report (pacing, session structure, legible mastery) — **S**
- **Fantasy:** the master's day-book. Every leg ends with a signed account, like the Casa's
  escrivão would write it.
- **Loop/verbs:** On entering a port after a leg of N days, one card (log-first, no alert spam, per
  roadmap rules): days vs the `scripts/routes.ts` benchmark for that season and hull; made-good vs
  rhumb; reckoning error at landfall (distance between `Navigator` reckoning and truth, and between
  charted and true town); men lost and why; cargo spoiled; margin left on water and fresh food;
  profit per day. Two lines of "what the pilot would have done". Autosave here (`save.ts`) so a
  session has a natural last beat.
- **Touches:** `game/state.ts` (arrival hook near the existing Casa/escrivão report), `navigator.ts`
  (expose error at fix), `scripts/routes.ts` benchmark table baked to data, new `ui/legView.ts`,
  `progression/milestones.ts` for best-leg records.
- **Risks:** becoming a scorecard that induces min-maxing the sail slider; mitigate by reporting
  *margins* and *surprises* rather than a letter grade. The benchmark must be the same polar the
  game sails, not an invented par (CLAUDE.md: independent ground truth).
- **Spine:** it is read at the port you are already in. Nothing sends you back.
- **Why first:** it is the instrumentation that makes P2, P3 and P4 legible, and it is the cheapest
  fix for "sessions have no shape".

### P2. The Landfall Wager and aiming off (navigation mastery) — **S/M**
- **Fantasy:** the Atlantic-crossing pilot's gamble: "I say we raise Santiago at dawn on the fourth,
  a day's run north of the Ilha do Sal."
- **Loop/verbs:** Before or during a long open-sea leg (the volta, Cape-to-Moçambique, the Arabian
  crossing, Melinde-Calecute) the player may *call* a landfall: a mark on the chart plus a
  window, with the reckoning ellipse shown as the cost of calling it tight. Calling it right pays
  renown and Casa trust (Tinoco is a bookkeeper who loves a prediction that came true). Calling it
  loose is free but pays nothing. The real skill taught is **aiming off**: deliberately
  steering up-current or upwind of the target so the last leg is a known direction, which the
  ellipse and set-and-drift (`nav-set`) already model but nothing rewards. Failure is mild: a bad
  call costs a day and a pilot's grumble (barks), not the ship.
- **Touches:** `navigation/navigator.ts` (ellipse and `corrected`), `navigation/charts.ts`,
  `game/soundings.ts`, `progression/milestones.ts`, `progression/casa.ts` (Tinoco reaction),
  `crew/skills.ts` (`nav-instinct`, `nav-set`, `nav-homeward` become *multipliers on the payoff*
  and on how tight the wager can be, not only on error).
- **Risks:** a second UI for something the chart already shows; keep it to one button on the chart
  view. Do not make the payoff large enough that it dwarfs trade income.
- **Spine:** forward-only; the wager resolves at the landfall you were making anyway.

### P3. The Wreck Chain: failure that continues the career — **M**
- **Fantasy:** Vasco's contemporaries who lost the ship and came home on someone else's keel with
  half the story. Bartolomeu Dias drowned; Cabral's survivors straggled in.
- **Loop/verbs:** Replace `endGame()` on wreck/foundering with a short three-beat chain, played
  *where she was lost* (so it is on the road by construction): (1) **the beach**: the existing
  `shore.ts` yields (water, wood, food, people) become a survival ledger for the survivors; a
  few turns of real decisions, names drawn from `hands.ts`; (2) **the rescue**: who finds you is a
  function of position and standing: a Line hull of your own (`network.ts`) if one is within
  range (big reward for having built Lines), the local polity's boat (regard, marks, the Book),
  the rival, or a passing Casa ship; (3) **the reckoning**: you reach the next Portuguese port (or
  Lisbon) with no ship, `finance.shipLost()` already settles the sea loans, the Casa gives you a
  *smaller* ship with a debt and a mark on your file ("Lost her at X, 1487"). The career goes on at
  a lower rung; the Chronicle notes the loss; the epilogue prints it. Genuine game over stays for
  death of the captain (rare, scene-driven) or if no survivors and no Line anywhere.
- **Touches:** `Game.wreckHer`, `endGame`, `reprieve` in `state.ts`; `game/shore.ts`;
  `game/mutiny.ts` (survivors turn on each other); `economy/finance.ts` (`shipLost`);
  `progression/network.ts`, `progression/casa.ts`, `progression/chronicle.ts` (act dispatch must not
  break if the captain loses the ship mid-act), `game/save.ts`.
- **Risks:** it must not become a free pass: the cost (ship, cargo, crew, a debt, standing) has to
  hurt more than the perk reprieve does today. Needs tuning so that a wreck on the Saharan coast is
  grim (the coast gives nothing, per `shore.ts`) and one off Mpinda is survivable. Save-format
  change.
- **Spine:** the rescue pushes you *down* the road to the next port by definition; nobody sends
  you back for the lost cargo. Salvage can be rolled into the rescue scene, not a return trip.

### P4. Lay-up, wintering and careening (the calendar gets a price) — **M**
- **Fantasy:** the Moçambique winter, waiting for the SW monsoon with the ship hauled down on the
  beach and the carpenter swearing at the shipworm.
- **Loop/verbs:** At any anchorage with a beach (`shore.ts`) or yard, *lay her up* for N days:
  careen (resets weed and shipworm, `upgrades.ts` multipliers finally matter), refit by the
  carpenter's skill, trade ashore at resident prices, work a House (`network.ts`), recover the
  sick; costs are provisions, fever risk (Guinea, Zambezi coast), the local polity's patience
  (marks), and the clock. The strategic content: leaving Melinde in the wrong week is the
  difference between 23 and 130 days (`monsoon.ts`), so *when to stop* becomes a decision with a
  visible price on both sides. A "wintering" ends cleanly at the next sailing window and plays
  through the existing dispatch clock, so it cannot trigger a "come back in 90 days" gate.
- **Touches:** `ship/upgrades.ts`, `ship/hull.ts` condition, `game/shore.ts`, `ui/portView.ts` (the
  careening line already exists), `navigation/monsoon.ts`, `crew/crew.ts` (sickness), `game/passage.ts`.
- **Risks:** a "wait" button players use too much; must carry real risk and cost. Fast clock must
  skip it safely (the roadmap already demands that of passages).
- **Spine:** it is a stop at a port on the road; the wait is paid by the voyage, satisfying
  DESIGN.md rule 3.

### P5. Consorts: a small armada, staged — **L (stage 1 is M)**
- **Fantasy:** command of a fleet, and the dread of watching a sail fall astern in the night.
- **Loop/verbs:** Stage 1 (Act II-III): one consort, a hull you own (a Line hull taken off its
  run for one voyage, or a Crown-lent caravel). Stage 2 (Act IV-V): up to four, a "captain-major"
  with the King's armada. Verbs: assign hulls to roles (scout ahead on the lookout, supply ship
  with the water, prize crew), split cargo and stores across hulls (a lost ship loses its share:
  that is the real tradeoff), set `keepTogether` (the existing master trade-off: fleet speed = slowest
  hull), signal formation, detach to explore a bay. Gales scatter and the rejoin is a navigation
  problem solved by the existing chart/reckoning (consorts have their own reckoning drift).
- **Touches:** `game/fleet.ts`, `fleet/formation.ts` (already has formation, keep-together, signal
  latency, `scripts/fleet.ts` sim tests), `game/state.ts` (`fleet` field currently null for
  Carreira), `game/gale.ts` (scatter exists for Xiyang), `ship/design.ts`, `progression/network.ts`
  (Line hulls), `progression/officers.ts` (officers as consort captains), `render/shipMesh.ts`.
- **Risks:** biggest scope in this list; UI for many ships; per-consort provisions and scurvy are a
  state-size multiplier. Stage 1 with one consort tests the whole architecture cheaply.
- **Spine:** the fleet travels the road with you. The "ship falls behind" problem is solved by
  rejoin at the next port, never by sailing back. A lost consort is lost, not a quest.

### P6. The Hold Plan: margin against cargo — **M** (confirm first)
- **Fantasy:** the master's arithmetic: every ton of biscuit is a ton of pepper not carried.
- **Loop/verbs:** Before leaving a port, a loading screen where **victuals, water, ordnance and
  trade cargo compete for tonnage** (`hull.ts` capacity, `goods.ts` `bulk`, `provisioningCost()` in
  `market.ts`, `water` days in `crew.ts`). The pilot recommends days of margin from the leg's
  expected duration (the same benchmark as P1). Deck cargo (horses, hides) spoil faster but fit
  when the hold is full. Cargo spoilage per month (`goods.ts` `spoilage`) matters more on
  slow legs, so the decision is real: ride the full hold on a monsoon-window leg, light on a
  Cape beat. **Verify first:** I did not find whether provisions occupy hold tonnage today;
  if they already do, this collapses to a better loading UI and pilot advice (S).
- **Touches:** `economy/goods.ts`, `economy/market.ts`, `crew/crew.ts`, `ship/ship.ts` (`holdCapacity`),
  `ui/portView.ts` / `deckBar.ts`.
- **Risks:** tedious if it is a puzzle every port; make it a one-time default plan with a "same as
  last leg" button and only surprise the player when the next leg is unusual.
- **Spine:** a port-side decision; nothing off the trunk.

### P7. Bills on the Houses (money you do not have to carry) — **S/M**
- **Fantasy:** the Italian bankers' real trick: you hand over gold in Lisbon and draw it as pepper
  in Cochim.
- **Loop/verbs:** In port, the captain can *remit* coin to a House or a Rua Nova house and *draw*
  at another port further down the road (not back), at a discount that depends on route risk,
  months in transit and the regard of the receiving court (marks already move House prices). A
  bill can be lost with the carrying ship (the sea-loan logic already exists), taken to a rival's
  advantage, or protested. It lets a lean-coin player buy a pepper cargo in Cochim without hauling
  silver for 10,000 nm, and gives the late-game purse something to *do* besides pile up (Assessment 5).
- **Touches:** `economy/finance.ts`, `progression/network.ts` (Houses), `progression/estate.ts`,
  `diplomacy/marks.ts`, `economy/trade.ts` (Payment/COMPETITION tables).
- **Risks:** a trivial arbitrage if the discount is not driven by `trade.ts` sheet confidence;
  tune against the Lines' 15% Casa cut so bills cannot dominate Lines.
- **Spine:** bills run *outward* with the voyage, never as a reason to return; redemption of a
  "home" bill is at Lisbon only if the captain is going there anyway (DESIGN.md rule 2).

### P8. Ship-to-ship action as a sailing duel — **L**
- **Fantasy:** the weather gauge. A carrack's broadside against a lateen caravel that can out-point
  her, in a seaway, with the clock running.
- **Loop/verbs:** Replace the single-roll `boardingOdds()` for committed fights with a short
  tactical phase on the *real* physics: range bands, angle off the bow for a broadside, damaged
  rigging cuts the polar (`rig.ts`), reload cycle, powder and shot as tonnage (P6), choice to
  rake, grapple (men, `hands.ts`), or break off. Rare by design; most hails stay diplomatic
  (`hailing.ts`). Prizes bring a prize-crew decision (split your hands, lower your own handling),
  and a failed fight can end in ransom/tribute, never an instant loss (see P3). `dip-gunboat`,
  `dip-force`, `dip-tribute` become verbs, not stat bumps.
- **Touches:** `game/encounter.ts`, `game/hailing.ts`, `ship/physics.ts` and `rig.ts`,
  `ship/upgrades.ts` (ordnance), `crew/hands.ts`, `render/shipMesh.ts` (damage and smoke),
  `diplomacy/courts.ts` (reputation for violence is a mark).
- **Risks:** high. It could dominate a game whose identity is navigation and trade; keep it rare,
  optional and fail-forward. Do after P5 so consorts have somewhere to matter.
- **Spine:** an encounter at sea; no pursuit back along the road.

### P9. Manning from the road — **M**
- **Fantasy:** a crew that is a cross-section of the voyage, not a number that shrinks.
- **Loop/verbs:** The company starts Portuguese and loses men to scurvy and flux. Replacement is
  the real strategic choice: convicts and degredados at Lisbon/Lagos (cheap, mutiny risk), lançados
  and Guinea hands (know the coast, fever-tolerant), Swahili and Gujarati pilots and Lascar seamen
  further down the road (language, monsoon knowledge, regard fallout with Crown officers).
  Each source carries a skill, a loyalty curve and a friction tag; a mixed crew makes `mutiny.ts`
  grievances more varied and `hands.ts` named men more interesting.
- **Touches:** `crew/crew.ts`, `crew/hands.ts`, `game/mutiny.ts`, `progression/officers.ts`,
  `world/ports.ts` (peoples), `diplomacy/book.ts` (languages), `ui/crewView.ts`.
- **Risks:** historical handling of conscripted and enslaved labour needs the Story designer; keep
  tone grounded and avoid a "buy a crew" shop feel.
- **Spine:** crews are hired where you stand and carried forward; no sourcing trips.

### P10. The Annual Armada: a shared seed to replay against — **S/M**
- **Fantasy:** "everyone gets the same March 1497. Who is first to the Tagus with the best pepper?"
- **Loop/verbs:** A fixed-seed career segment (weather, shocks, rival) with a ranked board for
  time Lisbon-Calecute-Lisbon, profit, men alive, and *landfall error* (from P1/P2). Replayable
  with different hulls, origins and skill builds; the heir system supplies a "same captain, new
  era" variant. Because `core/rng.ts` is already seeded and headless sims exist, determinism is
  mostly a test, not a build.
- **Touches:** `core/rng.ts`, `world/weather.ts`, `economy/trade.ts` (`SHOCKS`), `game/save.ts`,
  `progression/rival.ts`, `ui/titleView.ts`; the leaderboard needs a host the artifact page may not
  have (local board and exportable seed code is the S version).
- **Risks:** floating-point drift across browsers breaking determinism; local-only boards feel
  empty. Needs the Devil's Advocate's view on whether a leaderboard fits the tone.
- **Spine:** the same single road; it just fixes the dice.

## 3. Recommended top-3 sequence

1. **P1 The Leg Report** (S). Cheap, makes every later system legible, gives sessions a shape and
   the first real mastery feedback. Do it first because P2, P3, P4 and P10 all reuse its numbers.
2. **P2 The Landfall Wager** (S/M). Turns the best-built system in the repo (the reckoning /
   chart model) into a skill the player can *see* improve, and gives the navigation tree a payoff
   beyond error bars. It is the most distinctive thing this game can offer a navigator-minded player.
3. **P3 The Wreck Chain** (M). Converts the genre's most dramatic moment from a dead end into a
   second act, makes Lines and Houses matter as a safety net, and fixes the "punishing failure"
   problem. Sequence it after P1/P2 so a lost career segment is scored and remembered.

Next: P4 (lay-up) and P6 (hold plan, if confirmed) as one "voyage preparation and calendar" pass;
then P5 stage 1 (one consort), which unlocks P8 later. P7, P9, P10 can slot in as palate cleansers.

## 4. Responses

Read: `devils-advocate.md` (no `story.md` yet). The strongest objections, answered.

1. **"Don't build naval combat; the weather gauge is the combat" (DA 1.2, gap list).** Conceded in
   part. P8 is deferred until after P5 (kept in the list at 8 only for numbering) and re-scoped: no gunnery sim. What survives is choosing
   *terms* (refuse, parley, run, close at dawn) on top of `describeStranger` and the polars, plus
   prize-crew and ransom consequences. The full duel stays in the pile until P5 exists and a playtest
   shows the encounter slot is wasted.
2. **"New kinds of thing cost a kind of thing" (G2).** Tested each proposal. P1 folds into the
   existing escrivão/Casa arrival report and replaces nothing but adds no tab, and should *replace*
   the payday card rather than sit beside it. P3 deletes the hard `endGame()` branch and reuses
   `finance.shipLost`, `shore.ts` and the heir path (`inheritFrom`) instead of adding a meter. P4 gives
   the existing weed/shipworm multipliers a purpose rather than a new stat. P7 and P10 add no new
   resolution minigame. P6 is the weakest on G2 and is conditional on the verify step.
3. **"Fewer, louder, more legible decisions; readable in two seconds" (G4, DA 1.4, 1.9).**
   Agreed, and it reorders P2: the landfall wager must live as *one glyph on the sea view* showing
   called landfall, doubt and the next remedy (sight tonight, lead at 40 fathoms), not a chart-view
   feature. Every P1 line carries its cause ("reckoning off by 31 nm, set uncorrected from the
   Canary current").
4. **"The sailing is skipped by the clock" (DA 1.1).** The most serious objection to the whole
   list. P2 and P4 are the answer from my side: both make the *open sea* the place where a
   decision is paid for. I endorse the DA's dawn/dusk watch-bell as the delivery mechanism for the
   wager and lay-up decisions at x300 and above. I would add one hard rule: the bell never fires
   when nothing has changed.
5. **"Failure is soft, make it readable" (DA 1.8).** Partly disagree. The DA is right that gauges
   with ETAs (water, scurvy, reef) are missing, and P1/P6 supply them. But binary game-over on a
   wreck is *also* soft failure in disguise: it punishes without teaching. P3 keeps stakes high
   (ship, cargo, men, a debt, a mark on the file) while turning the loss into play. A genuine run-ender
   remains for a dead captain with no Line afloat.
6. **"Solo-dev capacity, verify headless" (G8, G9).** Each of the top three comes with a falsifier:
   P1 compares to `scripts/routes.ts` output; P2 is a Monte Carlo of called vs true landfall by skill;
   P3 is a script that wrecks a ship at 30 points along the trunk and asserts a legal state and a
   non-dead career at each. P5 is the only item I cannot cheaply verify, which is why it is staged.
7. **"First hour is sacred" (G6).** All top-3 items unlock after the first Funchal landing and
   after the first long leg; P2 should be unlocked by the existing `nav-` skill nodes rather than
   introduced in the tutorial.
8. **"The late game is passive income" (DA 1.6).** Agreed with the diagnosis; P7 (bills) and P5
   (consorts) give a rich captain active verbs. I would also back the DA's cap: passive income
   from Houses and Lines should stay below what an active voyage earns at the same stage.

Open point for the Story designer: P3 needs two or three authored rescue beats and the Chronicle
wording for "ship lost, career continues"; P1's "what the pilot would have done" lines need
Rui Correia's voice.
