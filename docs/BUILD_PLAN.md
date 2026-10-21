# Carreira da Índia — Structural Build Plan

> **Status (build plan):** phases A–D are built (A1–A5, B1–B4, C1–C5, D1–D7) plus the India lot depth and the renderer upgrade (R0–R5, water filtering). Open: phase E (storylet web, dynasty-lite, remaining Fronts), a Court-Front tick, the Rua Nova Lines side, and real-browser/real-GPU verification of everything.

Status: approved direction, ready to delegate. Synthesised from the design-team round 2
(`docs/design-team/v2-gameplay.md`, `v2-story.md`, `v2-devils-advocate.md`; v1 files are superseded).
Read those for rationale and numbers; this document is the **single source of truth for what to build,
in what order, by whom, and how to know it works**.

The game is about **exploration and discovery**. Combat is not a pillar.

---

## 0. Scope

### 0.1 Out of scope (decided, do not build)

| Item | Decision |
|---|---|
| **Armada** (consorts, detached hulls, standing orders, rank caps by hull count) | Not built. `fleet/formation.ts`, `game/fleet.ts` stay in the repo, unused. |
| **Wreck Chain** | Not built. Wreck/foundering behaviour stays as it is today, including `neverLose` / `reprieve()` (do **not** delete them; the earlier cut proposal depended on the Wreck Chain). |
| **Sea combat** (engagement mode, ammunition, broadsides, boarding minigame, prize menu) | Not built. `hailing.ts` / `boardingOdds` stay as they are. |
| Privateer career, ship zones (five-zone damage), consort captains, Governor-of-a-captured-quay, multi-life dynasty as a structure, 12-seat company beyond six | Dropped or deferred (see §7 "Later"). |
| Xiyang / Zheng He campaign | Stays shelved (`docs/SHELVED.md`). Not deleted from the repo. |

Consequences to keep in mind: nothing in this plan may *depend* on a second ship under the player's
command, or on a fight. Where a design doc used one (Lines as visible hulls, survey hulls, consort
captains, raiding lanes), §3–§6 give the replacement.

### 0.2 In scope: the pillars, as built here

1. **Ledger** — one record of consequential acts; one Captain's Book UI over it.
2. **Information** — prices, rumours, chart grade and hearsay as one `{claim, source, age, confidence}` object.
3. **Living Market** — prosperity, NPC lanes, hold that binds, contracts, contraband, the rival as a house.
4. **Ship stores & refit** — stores in tons, loading screen, slot fittings. (No zones.)
5. **Charts, Discovery and Fame** — chart grade, sheets as goods, phantom coasts, claims, fame map. *The headline pillar.*
6. **The Powers** — world simulation: Fronts, Powers, rumour mill, treaty clauses, patrons.
7. **The Company** — companions as the seat-holders: approval, exits, promotion, non-Portuguese companions.
8. **The Captain** — Calling (mechanical build), Titles (earned), Patron of record (political career).
9. **The Year** — winter quarters / sailing season / homecoming as the loop cadence.
10. **Places** — five Deep ports, Quarters UI replacing the 7-tab port screen.
11. **Web** — storylet engine; the 25 quest threads migrate to it.

### 0.3 The spine, as reinterpreted (write into `docs/DESIGN.md` in task A5)

1. The captain's **person** is one-way: nothing requires him to sail back for a clue, a letter or a reward.
2. His **assets** (letters, bills, price sheets, dispatches, Lines' payouts) may travel both ways.
3. **Revisiting ports on the next voyage is allowed** (the Carreira is round trips). Forbidden: a *story step* that
   requires returning to a place behind you.
4. A detour is legal if it **ends further along the road than it begins** (volta do largo, Brazil swing,
   Madagascar channel). Test with `road.ts: along()`.
5. Any new place a pillar makes meaningful gets a `road.ts` entry.

---

## 1. Design decisions that resolve the collisions

These were open between the designers; they are now fixed. Builders must not reopen them.

| # | Decision |
|---|---|
| D1 | **One world simulation**: Story's Powers/Fronts. Gameplay's "conflicts" become Fronts; its "treaty clauses" are the *output vocabulary* of audiences. The only interface to the economy is `marketModifiers(port, t)` (§4 C2). |
| D2 | **One memory**: the **Ledger** is the data. `marks.ts` entries become Ledger entries (migrated). The **Captain's Book** is the single UI over {Ledger, Information, Book of Courtesies}. Rutter / Logbook / hearsay / Orders>Reports collapse into it. Book of Courtesies stays as the *knowledge* of customs, not a second event log. |
| D3 | **One information object.** Every fact the player holds is `{claim, source, age, confidence}`; truth is **never displayed**, only inferred from sources and arrival. Price sheets (`trade.ts`), `leads.ts` hearsay, chart grade and rumours all use it. |
| D4 | **Identity = Calling + Patron + Titles.** Calling (mechanical, chosen at end of Act I, **unlocks verbs**, not a cost multiplier). Patron of record (political career, per voyage). Titles are **earned from the Ledger, never picked**. There is **no start-of-game Conviction**; a conviction is just a Title you grew into. The player still names the captain at start (generator by origin, overridable). |
| D5 | **One company**: companions *are* the seat-holders. Seats and role stats (Gameplay) + want/fear/line, approval, exits (Story) in one table. Six seats at first (master, pilot, surgeon, escrivão, língua, chaplain) mapped onto the existing roles; the hands pipeline feeds mates/factors/Line masters. No consorts. |
| D6 | **Lines stay black-box-with-decisions.** Without the Armada a Line is a House-posted asset; to stop it being a "spreadsheet that mails you money" it (a) saturates its lane (your own volume moves the price), (b) raises a decision card at its port when something needs the captain's seal (escrow, a bribe, a famine contract), (c) is staffed by a named company member who can skim or cover for you. |
| D7 | **`Stranger` schema** (for strangers met at sea; no combat): `{hullId, nation/people, master {name, regard}, owner, passengers[], cargo, intent}` and **terms**: parley, search, let-pass, stop-under-the-Rule. Existing hail/chase physics unchanged. Writing named masters is Story's; the struct lives in `game/encounter.ts`. |
| D8 | **Failure stays binary** as today (wreck ends the career). Exploration-first design means chart grade, stores and the Year give the player the tools to avoid it; softening it is a post-release decision, not part of this plan. |
| D9 | **Every pillar names a headless falsifier** (§2.4) and ships in stages that leave the game playable and saves loadable. |

---

## 2. How the build runs

### 2.1 Team shape (for the builder agent team)

| Role | Owns | Does not touch |
|---|---|---|
| **Integrator / lead** | `game/state.ts` hooks, save format/migrations, merge order, `docs/DESIGN.md`, release shipping (`/tmp/sc/ship.sh`, commit, republish) | feature internals |
| **Systems builder: Economy** | `economy/*`, new `world/tick.ts` (prosperity, lanes), contracts, `scripts/econ.ts` | narrative text |
| **Systems builder: World** | new `world/powers/*` (Powers, Fronts, rumours, clauses), `marketModifiers` | economy internals |
| **Systems builder: Knowledge** | Ledger, Information object, chart grade/sheets/claims, Captain's Book data | UI layout |
| **UI builder** | `ui/*` (Captain's Book, loading screen, Quarters, character creation, fame map) | simulation |
| **Narrative builder** | storylets, companion arcs, Fronts' storylets, Titles' predicates & text, endings, barks | engine code |
| **QA / sim builder** | `scripts/*` falsifiers, career bot, golden saves, balance sweeps | feature code |

Rules:
- **Hooks into `game/state.ts` are small and additive** (one call into a new module, new optional field with `??=` default at the
  load boundary). New logic goes in new modules. `state.ts` is huge; nobody refactors it in this plan.
- **Ownership by directory** to avoid merge fights. Cross-owner changes go through the integrator.
- **One work order = one task ID below**, with its acceptance criteria. A task is done only when its falsifier passes
  *and* the golden-save corpus (A1) still loads.
- Branch: all work lands on `claude/repo-wipe-kbyvad` (CLAUDE.md). Parallel agents use `isolation: worktree` and
  the integrator merges onto the branch in the dependency order of §3.
- Reporting follows CLAUDE.md: laconic, 3–5 bullets, nothing about how it was verified.

### 2.2 Save compatibility (non-negotiable)

- Current format is `SAVE_FORMAT 3`. New state is **additive**: optional fields, defaults applied at load.
- Anything cut that can be mid-flight in a save (an active venture, a piece in progress, a thread step) needs a
  **resolver on load** (convert to the new equivalent or settle it), never a silent drop.
- Changing the *meaning* of an existing field (market stock caps, câmbio rules) happens only behind a `SAVE_FORMAT`
  bump with a one-way migration, and the golden-save corpus is run before and after.
- Saves from the shelved Xiyang campaign keep being refused with the existing message.

### 2.3 Definition of done (every task)

1. Acceptance criteria met. 2. Its headless falsifier committed in `scripts/` and passing. 3. Golden-save corpus loads.
4. `npx tsc --noEmit` clean. 5. `npx vite build` + `/tmp/sc/ship.sh` load check `[]`. 6. Committed and pushed.
7. For player-visible changes: one line of "what this did" shown to the player when it triggers (G4: no opaque systems).

### 2.4 Falsifiers

| Pillar | Headless script (new unless noted) | Passes when |
|---|---|---|
| Economy | `scripts/econ.ts` (24-month no-player sim + route sweep) | best:median route profit ≤ 8:1 (today ≈ 130:1); 480 t hull earns ≥ 2.2× a 140 t on the best lane and ≥ 1.4× on the median; no port at zero stock; prices stay in band |
| Ledger | `scripts/ledger.ts` | every tag is read by ≥ 1 consumer (no dead tags); Ledger round-trips through save/load; marks migrate |
| Powers | `scripts/powers.ts` (200 seeds × 20 years, random-player policy) | no Front pinned at an extreme in > 80% of seeds; every rumour resolves true/stale/false; no storylet is reachable only by sailing backwards (checked with `road.ts`) |
| Charts | `scripts/charts.ts` | grade is monotone with data; sheet value non-negative; phantom coasts resolve to found or false in every seed |
| Company | `scripts/company.ts` | approval tables closed over the tag vocabulary; every companion has ≥ 1 reachable exit and ≥ 1 reachable bond |
| Whole game | `scripts/career.ts` (full-career bot, Lisbon→Cochim→Lisbon) | completes without exceptions, N seeds; reaches each Act; produces an epilogue |
| Saves | `scripts/saves.ts` over `fixtures/saves/*.json` | every golden save loads, steps 1 simulated month, re-serialises |

---

## 3. Phases and dependency order

```
A  Instrument & cut ──► B  Spine of consequence ──► C  The first different game ──► D  Depth & identity ──► E  Later
```

Each phase ships a game that is different to play. A phase may start before the previous finishes only
where §3.1's table says so.

### 3.1 Dependency table

| Task | Needs | Can run in parallel with |
|---|---|---|
| A1 corpus + career bot | — | A2, A4 |
| A2 econ harness | — | A1 |
| A3 cuts | A1 | A4 |
| A4 tutorial + watch bell | — | A1–A3 |
| A5 spine text | — | anything |
| B1 Ledger + Book | A1 | B3 |
| B2 Information object | B1 | B3 |
| B3 Stores in tons + hold caps + ladder | A2 | B1 |
| B4 Chart grade | B2 | — |
| C1 Prosperity + tick | A2, B3 | C5 |
| C2 Powers + Traffic Front + `marketModifiers` | B1, B2, C1 | C5 |
| C3 The Year | B1 | C1 |
| C4 Quarters + Mina deep port | B1, C2 | C5 |
| C5 Companions: approval | B1 | C1–C4 |
| D1 NPC lanes + contracts | C1, C2 | D3 |
| D2 Rival as a house | D1 | D3 |
| D3 Charts as asset (sheets, phantom coasts, claims, fame) | B4 | D1 |
| D4 Swahili + Malabar Powers; the Rule | C2 | D3 |
| D5 Clauses, patrons, Titles, Calling | B1, C2, C5 | D3 |
| D6 Deep ports ×4 | C4 | D1–D5 |
| D7 Strangers as people | C2, D4 | — |
| E* | all above | — |

---

## 4. Phase A — Instrument and cut (≈ 2–3 weeks)

Purpose: measure before changing; shrink the regression surface; fix the first hour.

### A1. Golden-save corpus and full-career bot  [M] — QA
- Capture 8–10 `SAVE_FORMAT 3` saves at different states into `fixtures/saves/`: new game; mid-voyage at sea; docked with
  cargo; mid-audience (a piece in progress); with an active venture; with a Line and a House; late-game with a patent;
  an heir game; a mid-quest-thread save.
- `scripts/saves.ts`: load each, step one simulated month, re-serialise, load again, assert key invariants.
- `scripts/career.ts`: a bot that sails Lisbon→Cochim→Lisbon using the existing queue/auto-sail, trades by a simple
  rule, takes commissions, plays pieces with the existing solver bots, and reaches an epilogue; run over N seeds.
- **Accept:** both scripts run in CI-style (`npx esbuild … --platform=node` pattern in CLAUDE.md) and are the gate for everything after.

### A2. Economy harness  [S] — Economy/QA
- Port the design team's `scratchpad/s/econ.ts` / `econ2.ts` into `scripts/econ.ts` (query `Markets.listings` for every
  port pair and good; first-sale, single-good, relation 0, skill 0, 400-day refresh).
- Emit: best/median/p90/p99 route profit, best:median ratio, per-hull earnings on the best lane and median lane,
  top-20 routes. Add a `--ladder` mode that prints the price ladder (§5 B3).
- **Accept:** baseline numbers recorded in `docs/BALANCE.md` (today: median ≈ 507, p90 ≈ 9.8k, p99 ≈ 42k, top ≈ 66k;
  Mina→Lisbon gold ≈ 10k for both a 140 t and a 480 t hull).

### A3. Cuts with load-time migration  [M] — Integrator
Cut in this order; each needs a resolver for saves that contain it. **Not cut:** `neverLose`/`reprieve`, `fleet/*`, finance instruments
(the DA proposed trimming finance to one instrument — **deferred**: without the Armada the Wreck-Chain-scuttling exploit
does not exist, and the three instruments are good).

| Cut | Migration |
|---|---|
| `progression/estate.ts` (passive investments, land/house meters) | convert holdings to purse at load; keep the lordship as a dynastic title in B1 |
| `progression/ventures.ts` as a standalone system | active ventures convert to plain dated contracts (D1 absorbs them); until D1 ships, keep ventures but mark deprecated |
| `progression/livingFactory.ts` silent background loop | keep Feitoria data; stop background ticks; Houses become prosperity nodes in C1 |
| Note-severity sea events (`birds`, `weed`, `fish`, `rainwater`, `ambergris`) | move to `barks.ts` ambient lines |
| `portCharacter.ts` goods-delivery `PortQuest` | cancel in-flight quests, refund nothing, one log line |
| Diplomacy pieces: **fold Meal and Hall into Gift Table; fold Linguist into the Case**. Keep Silent Trade, Gift Table, Case, Go-Between, Envoy, Informer, Refusal, Pilot's Test, Hostage's Letters (the design team's own recommendation was to keep ≥ 5 and fold the rest; this plan folds 3 and defers any further cut until D5 shows which pieces never end in a clause) | resolve any in-progress Meal/Hall/Linguist piece on load |
| ~55 pure-multiplier entries in `ship/upgrades.ts` | deferred to B3 (slot fittings) |

- **Accept:** corpus loads; `tsc` clean; bundle size and `scripts/` count reduced; a short `docs/CUTS.md` listing what was removed and its save resolver.

### A4. First hour: tutorial and the watch bell  [M] — UI + Systems (Knowledge)
- Replace the 13-step tutorial (`game/tutorial.ts`) with **six verbs unlocked by success**, one at a time (steer, trim,
  read the wind, take a sight, enter a port, trade). No lectures.
- **The watch bell:** while time is accelerated, the clock stops only at **dawn and dusk if something changed**
  (new landfall, drift in the ellipse, a stranger, a change in wind, stores crossing a threshold). A one-line **Leg
  Report** appears at arrival (days vs the `routes.ts` benchmark, reckoning error at landfall, men lost, spoilage,
  margin). The Leg Report is a **Ledger view** (B1) once B1 lands; until then it reads the log.
- **Accept:** a fresh-player script walks the six unlocks; the watch bell never stops the clock on an empty day (sim over 30 voyages); `Leg Report` has ≤ 5 lines.

### A5. Write the spine into `docs/DESIGN.md`  [S] — Integrator
- Paste §0.3 verbatim; add the rule that a *storylet* may not require backward travel (checked by `scripts/powers.ts` later).

---

## 5. Phase B — The spine of consequence (≈ 3–4 weeks)

### B1. Ledger, Captain's Book, Two Chronicles  [M] — Knowledge + UI + Narrative
**Data.** `Ledger = Entry[]`, append-only:
`{ t, place, tag, actors[], target (polity|person|front|place), magnitude, witnesses[], note }`.
~70 tags in a controlled vocabulary, e.g. `promise.kept/broken`, `weights.false`, `gift.great/insult`, `chart.sold`, `chart.shared`,
`parcel.carried/refused/redeemed`, `hand.flogged/died`, `letter.kept`, `patron.betrayed`, `companion.freed/lied_to`,
`landfall.exact/lost`, `claim.made/lost`, `lane.opened`, `port.funded`. (Tags relating to ship-stopping are kept for the
Rule front in D4 and are emitted from `hailing.ts` outcomes that already exist.)

**Code.**
- New `src/ledger/ledger.ts` (types, `record()`, queries, decay), `src/ledger/tags.ts` (vocabulary + doc string per tag +
  `readers` list for the dead-tag check).
- `diplomacy/marks.ts` becomes a thin wrapper that records Ledger entries; keep the `echo` mechanism and `feelMark` as is.
- `Game` gets `ledger` (additive, default `[]`); `Game.logEvent` call sites for consequential acts emit entries.
- **Captain's Book** (`src/ui/bookView.ts` becomes the single knowledge screen): tabs = *Life* (Ledger as an autobiography,
  grouped by voyage), *Known* (Information, B2), *Courtesies* (existing Book), *Log* (raw ring buffer as appendix). Retire
  Rutter/Hearsay/Reports tabs as they are absorbed (B2 finishes this).
- **Two Chronicles epilogue**: `epilogueView.ts` prints Lisbon's account beside each polity's own account of the career, both generated from the Ledger; also
  prints the muster roll (names and counts of the dead). Replaces `LATE_ENDINGS` text selection only where the Ledger can say it; keep the rest.
- Every landed entry shows a one-line "what this did" (G4).
- **Accept:** `scripts/ledger.ts` passes the dead-tag check; marks migrated; a played career produces a non-empty Book; epilogue differs between two different `career.ts` seeds.

### B2. The Information object  [M] — Knowledge
- `src/knowledge/information.ts`: `Fact = {claim, source, age, confidence, kind: price|politics|hazard|chart|rumour}`.
- Convert: `economy/trade.ts` sheets (keep `sheetAgeWord`, `sheetConfidence`), `game/leads.ts` hearsay, `Chart` amend provenance (`rutter.ts`
  provenance already exists), and the rumour feed C2 will add. **Delete** the now-duplicate stores once converted (net code reduction).
- UI rule: show **source and age, never truth**; truth resolves on arrival or via a second source.
- Informers (existing piece) sell and verify Facts; selling a Fact you hold is a Ledger entry.
- **Accept:** price sheet, hearsay and a chart fact all render through one component in the Book *Known* tab; a stale fact is visibly stale; `scripts/ledger.ts` covers the new tags.

### B3. Stores in tons, hold caps, price ladder  [M] — Economy + UI
- **Verify first** (design team did not): whether provisions already occupy hold tonnage; units of `Game.handWage()`; the `provisioningCost` consumers in `crew.ts`.
- Stores cost tonnage: ≈ 0.005 t per man-day (water, biscuit, meat, wine, fresh); spares (timber, cordage, canvas) ≈ 1–2 t per full set. A 24-man crew for 150 days ≈ 18 t (26% of a 70 t caravela, 7% of a 260 t nau).
- **Loading screen** with three sliders (water, victuals, spares) plus "same as last leg" and a pilot-recommended default computed from the leg's expected days.
- **Hold caps:** cap each port's stock of the lane's top good at 4× the load of the next-bigger hull class, not at the town's own consumption, so **hull size matters on the best lane**.
- **Ladder targets** (verify with `scripts/econ.ts --ladder`; tune stock caps, dues, upkeep and commission rewards, not the price formula):

| Tier | Hull (price cr) | Typical hold | Net per voyage | Voyages to buy next |
|---|---|---|---|---|
| 1 | Barcha 380 | 25 t | 120–220 | 3 |
| 2 | Caravela latina 900 | 50 t | 300–500 | 3 |
| 3 | Caravela redonda 1,500 | 70 t | 500–800 | 3–4 |
| 4 | Nau pequena 3,200 | 140 t | 1,200–1,800 | 3–4 |
| 5 | Nau 6,800 | 260 t | 2,500–3,500 | 4 |
| 6 | Nau da Índia 15,000 | 480 t | 6,000–9,000 on India lanes | 4–6 |

  Crown commission rewards ≈ 30–35% of income through Act III (not 100%). The Ormuz→Cambay pearls hop (~66k in one leg) must be brought into band.
- **Slot fittings:** collapse ~80 upgrades to ~24 in six slots (hull treatment, rig, boats, cabin/stores, instruments, ordnance-as-trade-good only), one per slot at a time, each with an upside and a cost in tons, wear or morale. (No zones; hull stays a scalar plus the existing per-mast condition.)
- **Refit** becomes a place and time: careening, re-masting, re-rigging need a yard class (`PortDef.refit`) or a beach (`shore.ts`); cost = parts consumed + days, replacing the flat `(1-hull) × 900 / refit` fee.
- Old saves: provisions in days convert to tons at load; hold overflow is resolved by selling the surplus at the nearest port on first load (one log line).
- **Accept:** `scripts/econ.ts` meets the ladder and the 8:1 spread; loading screen never exceeds three controls; golden saves load with hold ≤ capacity.

### B4. Chart grade  [S/M] — Knowledge + UI
- Every coastal segment and approach has a **grade**: Rumour → Sketch → Surveyed → Sounded, **derived** from data `Chart` already holds (survey passes at an offing, lead soundings, sights); no new capture.
- Chart overlay: a coloured coast stripe; HUD shows one word for the water you are in.
- Hooks (effects land incrementally): passage time (pilot who knows the coast saves 5–10%), lead/sight reliability, **lane risk multiplier** `(1 − 0.5 × grade/3)` that C1/D1 read, and landfall scoring in the Leg Report ("silent" scoring of landfall error, no wager UI).
- **Accept:** `scripts/charts.ts`: grade is monotone with data; overlay renders for all four states; golden saves compute a grade without error.

---

## 6. Phase C — The first different game (≈ 2–3 months)

### C1. Prosperity and the monthly world tick  [M] — Economy
- New `src/world/tick.ts` (`Game.tickWorld`, monthly): updates all 52 ports × 42 goods (≈ 2,200 cells) in three passes: production (as today, scaled by `P`), lanes (stub until D1), consumption (appetite scaled by `P`).
- **Prosperity** `P ∈ [0.5, 1.6]` per port, stored additively (`ports[id].prosperity`, default 1.0) replacing the constant `PortDef.wealth` as `wealth0 × P`. Monthly: `+0.015` if traffic ≥ baseline and no war/embargo; `−0.03` under blockade, war, plague or a month of famine; `+0.10 × cap` when the player funds a quay or fort (reuse `worksCost = 26 × monthlyValue`). **Diminishing returns** by port size and decay toward baseline, so the player cannot pump a favourite port (DA loop #2).
- Houses and Works (`network.ts`, `feitoria.ts`) become nodes whose yield depends on `P` and on the factor's quality (replaces the silent loop cut in A3).
- **Accept:** 24-month no-player sim keeps all ports above stock floor; a funded quay raises `P` with diminishing returns; ports can shrink under shocks.

### C2. The Powers engine, the Traffic Front, rumours and `marketModifiers`  [L] — World + Narrative
**Engine (`src/world/powers/`).**
- **Powers (8):** the Crown's court (throne / Order of Christ / Rua Nova money as three home factions), Castile, the Mamluk–Venetian axis, Kilwa, Melinde, Calicut (+ Mappila merchants), Cochin/Kolathiri, Kongo (+ Soyo). Each: `intent` (next 24 months), `means`, `attitude` toward the player (from the Ledger), `relations` seeded from the existing `allies`/`feuds` in `polities.ts`. A monthly tick may declare embargo, truce, attack, succession fight (extends `crisisFor`), or ask a favour.
- **Fronts (6):** The Gold (Mina), **The Traffic**, The Claim/Race, The Crescent, **The Rule** (the cartaz), The Court. Each is a clock with stages; stage changes alter the world. Scheduled history (`chronicle.ts HISTORY`: Cão, Columbus, Dias, the King's death, the Edict) stays as dated shocks the Fronts react to.
- **Ledger → Front deltas** table (≈ 60 rows) and **Ledger → Power attitude** table, written as data in `src/world/powers/deltas.ts` **before any engine code** (if the table cannot be filled in an afternoon the tag vocabulary is wrong — go back to B1).
- **`marketModifiers(port, t)`** (the *only* economy interface): returns `{priceMult[good], stockMult[good], appetiteMult[good], duesMult, closed: boolean, reason}` from war, embargo, cartaz status, Front stage. The Economy tick (C1/D1) calls it; Powers never edit prices directly.
- **Rumour mill:** every event creates a rumour `{truth: true|stale|false, source, fidelity}` that travels **down the road at a port per month** with fidelity loss (extends `newsDelayDays`, `courts.ts word` queue, `leads.ts` principle). Taverns sell it (C4). A captain on a three-month-old "friendly" rumour can arrive in a war.
- **Offers:** the tick spawns dated opportunities (carry powder to Melinde, broker a truce, evacuate a factor, redeem a ransomed pilot). They replace price-glut-only ventures and feed D1's contract generator.
- **Three levers per Front:** *push* (profit), *brake* (cost), *contest* (take it to a court, usually refused). No lever stops a great process, **and each unstoppable Front is paired with one winnable local fight** (the Rule is one; the Traffic gets one: a named port whose practice the player can change once, at cost) — DA's agency rule.

**The Traffic Front (first Front built).** 4 stages (ransom economy → routine → plantations and a Casa quota → "the system": cheap sugar, Kongo court split, the heirs live inside it). Baseline advances ~0.5 stage-points/year on the history schedule; a parcel carried adds ≈ +0.1; refusing at cost ≈ −0.05; a contested hearing ≈ −0.15 and costs Casa regard; redeeming a named person is a Ledger entry with **no** front effect. **It acts on the economy only through typed non-priced cargo and by shocking sugar and labour-dependent ports** (decision for the open question in the DA's §3.3): the Traffic is never a good in `goods.ts`. African, Arab and Swahili traders are **Powers inside it** with their own moves (Kongo's elders vs traders; Benin sets terms; Kilwa's markets predate you). Presentation is aftermath and Ledger lines in the plain voice; no spectacle. **Every dated or attributed event gets an A7-style source note**; invented specifics are marked as such.

**Stage 1 deliverable** = Traffic Front on Arguim → Mina → Mpinda with 10 storylets and one Power (Kongo) ticking.
- **Accept:** `scripts/powers.ts` (200 seeds × 20 years) per §2.4; a war on the Swahili coast (stub conflict) closes a lane and moves a price a player can trace in the Book; a rumour is demonstrably wrong at least once per run.

### C3. The Year  [M] — UI + Systems (Knowledge)
- The career is a sequence of **years**: winter quarters at Lisbon (hire, refit, politics, letters, the Casa's auction, the heir's business) → **sailing season** (March departure, monsoon-timed) → **homecoming** with a payoff screen (the Leg Report scaled up: profit, men lost, charts earned, Fronts moved).
- Lisbon gains a function without being a checkpoint (the voyage still starts and ends there, which `DESIGN.md` allows). The monthly world tick (C1) gains a natural cadence; offers and rumours batch at quarters.
- Missed monsoon windows cost: wintering at a foreign port is a **consequence, not a gate**.
- **Accept:** `scripts/career.ts` plays ≥ 3 years in a row; homecoming screen appears each year; no step requires sailing backwards.

### C4. Quarters UI and the first Deep port (Mina)  [M] — UI + Narrative
- Replace the 7-tab `portView.ts` with **Quarters** (the verbs available in a place, not tabs): *Waterfront* (shore leave, hands' regard), *Tavern* (rumours, recruits, crimp), *Yard*, *Market*, *Fort/Court* (audiences, pieces, clauses), *Faith*. Each shows Front state for the place.
- **Mina as the first Deep port** end to end: a named Patron (factor/secretary/pilot-guild master/friar) with a relationship track (stranger → acquaintance → trusted → partner) built from the Ledger and visits; a **calendar** (fever season, fair, arrival of the fleet); **place memory** (Ledger entries with this `place` become dialogue lines and price effects; generalises `callbackAt` and the `Relations.local ±0.6` already there). The other ports stay as **Stops** generated from a template (water, market, a rumour, a danger).
- **Accept:** portView line count drops; every old port function is reachable in ≤ 2 clicks; Mina's Patron reacts to a Ledger tag in `career.ts`.

### C5. Companions: approval and exits  [M] — Narrative + Systems (Knowledge)
- Each of the six seats (existing officers with arcs: Correia, Sousa, Gaspar Vaz, Dinis, Sintra, Anselmo) gets **want / fear / line**, an **approval** score `−100..+100` computed from the Ledger through a per-companion tag table (~12 tags each, data), threshold effects (≥ +40 bond effect (`BONDS` exists); ≤ −40 argues in counsel; ≤ −80 leaves / sells your chart / leads a crisis).
- Add arcs for the **Escrivão** and **Língua** (the two roles with none). Extend each arc from 3 to 4–5 storylets with more than one ending state (bonded, estranged, ashore, dead, betrayed).
- `counsel.ts` gains **conflict between companions** (the Chaplain vs the Língua over a baptism; the Pilot vs the Master about weather) so the player arbitrates.
- The random-hire officer generator is retired; recruiting becomes **courting a named candidate** at a Patron's table (hands stay at the crimp).
- **Hands pipeline:** a named hand with high regard and skill becomes mate, then **House factor** or **Line master** (not consort captain). A neglected factor skims; a trusted one covers for you in a Casa audit.
- **Accept:** `scripts/company.ts` per §2.4; approval visibly changes counsel text in two `career.ts` seeds.

---

## 7. Phase D — Depth and identity (≈ 2–3 months)

### D1. NPC lanes and contracts  [M] — Economy
- ~150 directed lanes (neighbouring ports within a `Network` from `polities.ts` plus long trunks Lisbon–Mina, Kilwa–Cambay, Cambay–Malabar, Malabar–Malacca, Aden–Cambay), each carrying ≤ 6 goods. Monthly flow `F = min(surplus_A, need_B, cap_lane) × (1 − risk)`; `cap_lane` from polity tonnage (order-of-magnitude: Gujarat 12 kt, Calicut 8 kt, Kilwa 2 kt, Melinde 1 kt, Lisbon–Mina 600 t; tune with `econ.ts`). Risk = base × `(1 − 0.5 × grade/3)` (B4) × war/embargo from `marketModifiers`. **Player's volume saturates the lane and moves the price** (loop guard #1). Price sheets show **trend arrows**.
- **Contracts replace ventures/charters:** a port whose stock of good `g` is < 30% of base for 2+ months posts a contract (deliver `q`, price 1.3–1.8× ask, 60–120 days). The 7 minor quest threads (*Passenger*, *Pilot*, *False Weights*, *Fallen Padrão*, *Ship Adrift*, *Stowaway*, *The Count* as an errand) become **templates in the same generator** — merged per the verdict table (Story §Thread verdicts) where they carry Front texture.
- **Monopoly as a loop:** Crown goods (pepper, gold, malagueta, ivory) sell to the Casa at `1 − CASA_SHARE`, or run elsewhere at 1.4–2.2× with **heat per origin**; inspections at Lisbon (fine, forfeit, standing −). **Heat decays through activity** (a presented gift, a sold Fact, a favour), **not through time** (loop guard #3).
- Dues 2–6% per call; presents 8–12% in hostile polities; upkeep as today for Lines; no fleet upkeep.
- **Accept:** `scripts/econ.ts` with lanes on: spread ≤ 8:1 holds, lanes close and reopen with a war, contraband loop cannot be laundered by waiting.

### D2. The rival as a house  [S/M] — Economy + Narrative
- The rival (`rival.ts`) becomes a **house in the lane sim**: starting capital, goes where margin is highest, sells into the same markets, can be undercut, bought out (the Casa mediates) or allied with. His discovery frontier stays as flavour; no ship-to-ship contact (consistent with no combat).
- **Accept:** rival measurably affects at least one price in a `career.ts` run; his `frontierLat` counter is removed.

### D3. Charts as an asset (the exploration headline)  [L] — Knowledge + Narrative + UI
- **Sheets as goods:** the Casa buys survey sheets (standing + money); the Genoese and the rival buy them (money, but heat); a **published** sheet raises *everyone's* grade including the rival's, so secrecy has a price. Sheets **age** and are re-sold only after storm/silting change. Heirs inherit charts at a grade discount (loop guard #7).
- **Phantom coasts:** each run seeds 10–15 **claims** on the Casa's sheet (Island of Brasil, Antillia, a Rio de Ouro a day off, Prester John at three latitudes). Some are real discoveries displaced; some are phantoms. A rumour ("a man at Funchal swears to the Brazil island 200 leagues west") is an exploration offer resolved by sailing, through the existing `discovery.ts`. The Casa's `seededError` model is extended, not replaced.
- **Claims (padrão):** a claim gives a House site at a discount and a Fame point; a lost claim (the rival takes it first) is a real loss.
- **Fame map** replaces scalar renown at the top of the epilogue: claims, discoveries, sheets sold or kept, "first" markers against the rival.
- **Surveys:** run by the flagship (an offing pass, `coasting`); a Pilot Calling roughly doubles speed. (No survey hulls.)
- **Accept:** `scripts/charts.ts`: every phantom resolves in every seed; selling a sheet raises the rival's grade; heir game inherits a discounted chart.

### D4. Swahili coast + Malabar Powers; the Rule  [L] — World + Narrative
- Powers tick on Kilwa/Melinde/Mombasa and Calicut/Cochin/Kolathiri using the existing `allies`/`feuds`; Kongo succession; Mina coast; Songhai–Wolof.
- **The Rule (cartaz)** Front: free sea → friends have passes → stopping unlicensed ships → blockade. The player's own conduct at Calecute and Kilwa in Act IV **sets** the Rule's stage for Act V. Wars may close lanes but **never close trunk ports to the flagship** (a closed lane can still be sailed at a cost).
- Strangers: see D7.
- **Accept:** `scripts/powers.ts` extended; a Swahili war and a Malabar war both close and reopen lanes in different seeds.

### D5. Clauses, patrons, Titles, Calling  [L] — World + Knowledge + UI + Narrative
- **Treaty clauses:** named, visible grants courts make — *free dues* (−50% port dues), *berth and watering rights*, *exclusive buyer*, *fortress licence*, *pilot loan*, *cartaz recognised*, *men and guns for hire* (as trade, not combat). Term 2–5 years, price in gifts, lost via accumulated offences. Diplomacy pieces end by **naming a clause granted, refused or poisoned**; regard stays internally as a five-word mood. **Audit** which kept pieces still never end in a clause/lane/person and cut or fold those.
- **Patrons (3):** Crown (orders, cartaz), Order of Christ/Church (mission funds, baptism policy, Prester), Rua Nova money (credit, Lines). Each issues **generated orders** (replacing `crown.patent`/`ACT_CHARGE` and the Casa meter), takes a cut, and has an agenda that moves with the Court Front (a favourite falls; a converso patron faces the Edict; the King dies in 1495). A betrayed patron can ruin you; a falling patron pulls clients down unless you move early. Patron of record is chosen **per voyage**.
- **Titles (~30 authored, 3 worn)** by predicate over the Ledger (*O Justo*, *Pilot of the Cape*, *Mão Pesada*, *Amigo de Melinde*, *The Man Who Sold the Chart*…). Titles are announced by **word** with delay and **distortion** (a mercy becomes weakness; a hard hand becomes a butcher) depending on who tells it. Milestones become Titles.
- **Calling** (chosen at the end of Act I): **Pilot**, **Factor**, **Master-builder**, **Master** (generalist). Each **unlocks a verb**, not a cost: Pilot — night/tight-fix entries and doubled survey speed; Factor — open a House without a court, bills on Houses; Master-builder — design and lay down hulls (`ship/design.ts`) and parallel refit; Master — extra company seat and better counsel. (Capitão-mor is dropped with combat.)
- Persistent **conviction** is not a start choice; it is the Title you grew into (D4 decision).
- **Accept:** three careers (Crown / Church / Rua Nova) playable on the same road in `career.ts`; every kept piece ends in a clause or is cut; endings read the patron.

### D6. Deep ports ×4  [M] — Narrative + UI
- Arguim, Melinde, Calecute, Lisbon (Mina done in C4): each with a Patron, Quarters, a calendar, place memory. Others stay Stops.
- **Accept:** each Deep port has ≥ 1 Patron arc storylet reachable in `career.ts`.

### D7. Strangers as people  [M] — Narrative + UI
- Implement the D7-decision `Stranger` schema in `encounter.ts` (master, owner, passengers) and **terms** (parley, search, let-pass, stop-under-the-Rule); masters recur; word of each stop runs ahead on the road. Each term emits Ledger entries and reads the Rule stage.
- **Open asset decision:** the renderer has no dhow mesh. Reuse existing hull meshes for the first release; a dhow/baghla mesh is a separate S task for the UI builder only if budget allows.
- **Accept:** a master met at Kilwa recurs later with a different attitude derived from the Ledger.

---

## 8. Phase E — Later (only if A–D land)

- **E1 Web migration** — storylet engine (`{id, place, requires, priority, scene, writes, hooks}`) over **qualities** (Ledger, approvals, Front stages, Titles, skills, location, season); dual-run with existing threads; port one thread per week (≈ 25 threads, ~3,858 lines in `quests.ts`). Keep intact: `leak`, `kongo`, `zamorin`, `prester`, `sofala`, `count`, `galeao`, `caravel`, `feitorCalecute`, `mappila`, `pepperRace`, `monsoon`, `aprendiz`; rework origin threads as backstory arcs; merge `adrift`, `pesos`, `padrao`, `mercador`, `feverFleet` into Front texture; rework or cut `malay`; cut `pepperHouse` as a thread; turn `kingsOffer` into an ending *evaluation*. One scene per port call (plus one at sea per leg) by priority.
- **E2 Dynasty-lite** — extend `inheritFrom`: Ledger decays (> 8 years fades), Fronts persist, companions age and are succeeded, titles dilute, heir may repudiate. Assembled endings per Patron/Fronts; no multi-life structure.
- **E3 Remaining Fronts and conflicts** — The Crescent, The Claim/Race, The Gold, The Court fully staged; remaining conflicts.
- **E4** More Deep ports; the optional 7th–12th company seats.

---

## 9. Verify first (things the design team did **not** confirm)

Builders must check these in the code before the task that depends on them:

1. Whether provisions already occupy hold tonnage anywhere (B3).
2. The unit of `Game.handWage()` (per hand, per month?) (B3, C5).
3. Whether `PortDef.wealth` is truly never written outside definition (C1; the design team grepped once).
4. How many of the 12 diplomacy pieces already end in something a clause could replace (A3/D5).
5. `quests.ts` thread contents individually (only shape/headers were audited) before E1 (verdict table is a recommendation).
6. The econ numbers are first-sale, single-good, no Casa share, relation 0, skill 0: they show *shape*, not in-game income (A2).

---

## 10. Risks and guardrails

| Risk | Guard |
|---|---|
| Authoring volume (storylets, companion arcs, Front text, Titles) is the largest unestimated cost | Each stage ships a **minimum slice**; every Narrative task lists the number of authored items; stop adding content kinds ("net: more state, fewer systems"). |
| Opaque systems | Every Ledger entry prints one line of cause and effect; Front stages are shown; rumours show source and age; a system that cannot be summarised in one line is not shipped. |
| Hand-tuned coupled economy | Everything gated by `scripts/econ.ts`; tune stock caps/dues/upkeep, not formulas. |
| Dominant strategies | The DA's ten loops are guards: lane saturation (#1), prosperity diminishing returns (#2), heat decays by activity (#3), rumour truth hidden (#8), conviction costs economic (#9), offers cost standing if missed (#10). |
| Save breakage | §2.2; corpus gate; migrations never silent. |
| Moral weight handled as text only | Traffic and Rule are Fronts with stages the player lives in; non-Portuguese Powers and companions have agency (moves, approval, exits); the epilogue prints names and counts; source discipline applies. |
| Scope creep toward combat/fleet | §0.1 is binding; `fleet/*` stays unused; no task may depend on a second hull or a fight. |
| The spine | §0.3; `powers.ts` checks storylets for backward-only reachability. |

---

## 11. Release sequence

| Release | Contains | The player-visible difference |
|---|---|---|
| **R1 "A different first hour"** | A1–A5, B1–B4 | Six-verb start, watch bell, Leg Report, Captain's Book, Two Chronicles epilogue, hull size matters, stores in tons, chart grade on the map |
| **R2 "The world moves"** | C1–C5 | Ports grow and starve; a rumour sends you into a war; the Traffic is a Front you live in; winter quarters; companions judge you; Mina is a place |
| **R3 "Exploration pays"** | D1, D2, D3 | Lanes and a rival move prices; charts are goods; phantom coasts to chase; fame map |
| **R4 "A career"** | D4–D7 | Treaty clauses, patrons, Titles, Calling verbs, the Rule, Deep ports, strangers who recur |
| **R5** | E1–E4 | Storylet web, dynasty-lite, remaining Fronts |

Fun check at R2 (DA's exit test, adapted for no combat): a fresh playtester in three hours **(1)** is surprised by a price swing they can trace to a war, **(2)** is wrong about a rumour, **(3)** makes a stores decision that costs them cargo, **(4)** reads their own epilogue chronicle. If any does not happen unprompted, R2 failed.

*Minimum viable "different game": R1 + C1 + C2 (Traffic) + C5.*
