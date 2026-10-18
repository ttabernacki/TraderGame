# Devil's Advocate: audit, gap list, guardrails, critique

Author: the Devil's Advocate. Evidence is from the repo as read (CLAUDE.md, docs/DESIGN.md, ROADMAP.md,
SHELVED.md, src/progression/road.ts, src/game/tutorial.ts, src/core/clock.ts, src/game/hailing.ts,
src/ui/ordersView.ts, src/ui/portView.ts). Section 4 is at the bottom.

## 0. The shape of the problem

67,000 lines of TypeScript, one 9,866-line `Game` class, 36 long quest threads, 15 sea events, 12 diplomacy
pieces with solver bots, two lenders, Houses, Lines, estates, legacy heirs, tier-7 skill crowns. The
simulation is startlingly deep for a solo project. The risk is not "not enough systems". The risk is:

1. Depth that the player cannot see, feel or steer (the three-frame nav model, marks, footing, regard).
2. A moment-to-moment loop that is "wind the clock, wait, read a card", with the lovely sailing model
   mostly skipped by the very time scales that make the game bearable.
3. A design process that answers every gap with another system. DESIGN.md is a changelog of added meters
   (and "One economy, fewer meters" is the rare honest retreat). More of that makes the game worse.

Everything below pushes toward: fewer, louder, more legible decisions, and a loop that makes the player
want to be at the helm.

---

## 1. Ruthless audit: top 10 reasons a player quits or gets bored

### 1. The sailing is the best system and the loop encourages skipping it
Evidence: `clock.ts` has nine rates up to "Full day" (14,400x). The tutorial *teaches* "Wind the clock on"
at step 4 of 13 (`tutorial.ts`, id `clock`). The route is a queue of up to 12 marks (`state.ts` ~8851) which
the ship follows. So the optimal strategy for a Lisbon-Mina leg is: set marks, press the right arrow, read
cards. The physics, polars, sail trim, tack timing (100 s lateen dips), and the rendering (2,200-line
shipMesh, 1,280-line ocean) are watched by nobody in the long stretches.
Fix: give the open sea something to *decide* on a cadence rather than something to watch. Cheap version:
the "watch bell" (see Proposal W below): at x300+ the clock auto-stops at each dawn/dusk watch change with
one line of state ("wind veered 2 points, 41 days water") and one yes/no/default decision (stand on / lay
her closer / tack now). Not a new system: the existing `seaEvents`/`gale`/`soundings` data, surfaced on a
beat. The ship also needs a "make this leg count" payoff (see 2).

### 2. No visible stakes on a leg; consequence arrives late and as text
Evidence: a 15-event table (`seaEvents.ts`), of which `birds`, `weed`, `fish`, `rainwater` are "note"
severity, i.e. log lines. Combat (`hailing.ts`) is a single roll: `boardingOdds` -> `rng.next() < odds` ->
"carried in about four minutes". No tactical choice, no seamanship, no gun drill, no sight of the enemy's
trim. For a game whose fantasy includes caravels, corsairs, Moorish raiders and a prize cargo, the one
violent verb is a coin flip with prose. That is a *wasted* set-piece slot, not a missing feature.
Fix: do not build naval combat. Make the pre-roll interesting with what already exists: wind gauge,
polar speed of both hulls (`describeStranger`, `strangerIntentText` exist), and let the player *choose
the terms* (refuse, parley, run, close at dawn) where the sail model decides who can actually do it.
The weather gauge IS the combat.

### 3. First ten minutes: the opening is a lecture wearing a quest
Evidence: 13 tutorial steps, each with 60-120 words of period-voice speech (`tutorial.ts`). Step 1 is
"Take the commission at court", before the player has sailed. Step 6 is "take the North Star after dark"
-- which requires waiting for night, then using a quadrant, then understanding why the reckoning is
wrong. The rest is bound to `Brás de Sousa, master` and `Rui Correia, pilot` and a Contador. The prose is
excellent and is also a wall. A new player who skips the text (most will) hits W, C, arrows, and has no
idea why the tutorial pane keeps talking.
Fix: a hard rule for the first 10 minutes: one verb at a time, each under 25 words, each *unlocked by the
previous one's success*, and the first minute is sailing a ship in open water with no UI chrome at all.
Move "take the commission" to after the player has felt the ship. Do the dialogue in barks; keep the long
text in a pilot's Rutter the player can open.

### 4. The three-frame navigation model is a literacy test, not a game
Evidence: CLAUDE.md "three frames, never mixed" (truth / reckoning / chart), ellipse of doubt, chart
seededError, `Chart.amend`, `settleAround`, `relaxHearsay`, `Game.soundingFrame`. This is a beautiful
simulator. As a player experience it reduces to: "my map is wrong and I don't know by how much". The
player needs a *felt* and *actionable* version: where am I doubtful, what do I do about it (sight, lead,
hug the coast, follow a ship), what do I gain. If the answer is hidden behind the pilot panel and the
chart view (1,625 lines), then it is invisible depth.
Fix: one rule - the ellipse and "what to do about it" must be on the main sea view at all times as a
single stripe or glyph ("doubt: 28 nm, N-S worse; sight tonight, or lead at 40 fathoms"), and every
correction must *announce itself* in the same place with a before/after. Keep the model; make its output a
two-second read. Do not add a fourth frame.

### 5. Menu depth: 7 port tabs x 7 Orders tabs, plus pilot panel, book, chart, rutter, logbook, crew, deck bar
Evidence: `portView.ts` tabs `town|market|freight|money|station|stores|yard` + barter mode, 1,971 lines;
`ordersView.ts` tabs `chronicle|missions|trade|courts|reports|network|wardroom`. Orders has two lists of
"things you owe" (missions, trade contracts), plus courts, plus hearsay, plus Houses & Lines. DESIGN.md
itself cut the Road tab as redundant, then added Houses & Lines. A veteran managing four Houses, three Lines,
a heir and an estate is running a spreadsheet in period dress.
Fix: a "Today" card on arrival at every port, one screen, three or fewer actions, sorted by consequence
(Collect, Sell, Decide, Go). Everything else stays in tabs for the player who wants them. Cap simultaneous
live obligations visible at once (see guardrails).

### 6. Trade is a solved arbitrage with no personality, and the strongest income is passive
Evidence: `GOODS` has ~40 commodities with Lisbon reference prices, bulk, spoilage. Price climbs as you empty
a warehouse (tutorial says so). Factories "run themselves" monthly (`livingFactory.ts`), Lines "pay out once
per voyage", Houses "need no visit". The late-game capital engine is *not sailing*. Fix the incentive:
the passive income must be capped below active income and its upside must depend on a thing only the
captain on the spot can do (open a market, win a mark, spend a sight).
Also: trade needs *named, memorable cargo problems* (the spoiling cargo, the contraband, the
shared hold with a passenger) more than 40 SKUs.

### 7. The campaign spine runs on waits and letters, not on drive
Evidence: acts advance "by dispatch": goal met, the King's answer arrives 14 days later at the next port
(`chronicle.ts: dispatch`). Waiting is "paid by the voyage". Good for one-road. But it also means the
reward for finishing Act II is a letter that arrives somewhere unspecified. There is no *climax you drive
toward*. Compare Sunless Sea's zee-bound destinations, or Pirates!'s map-fragment hunts: the player always
has one thing in the horizon line with a name and a face.
Fix: each act needs a single *place-and-face* the HUD points at ("Dom João's man waits at Mina; carry the
brass; 32 days in hand") and ONE per act is a spectacle (the Bojador passage, the Cape rounding, the
Malabar landfall), authored as a full scene with a bespoke weather/visual treatment.

### 8. Failure is soft, and soft failure is boring
Evidence: "Losing her used to end the game, which on this route was never how it went" (`state.ts` ~8558).
Heirs inherit 40% of purse, a quarter of renown, +4 skill points, the chart and rutter. Lenders cancel
câmbio marítimo on loss. Sea events: 'grave' exists for 'overboard' only. Hearsay, regard, marks all
produce small deltas.
Fix: not harder failure -- *readable* failure. Name the three ways a voyage can go wrong (water, scurvy,
reef), show each as a gauge-with-ETA ("water: 19 days; Cape in 31"), and let one of them genuinely
sink the voyage if ignored. Sunless Sea's terror, FTL's dread, are fed by clear numbers.

### 9. Systems that need a manual: hearsay, marks, regard, footing, câmbio vs letra vs sixteenths, estate, legacy
Evidence: `regard = 0.5 trust + 0.2 respect + 0.3 interest + local ±0.6`; marks have three simultaneous effects
(echo, local regard shift, House price: -6% per kind mark up to 3, +10% per offence up to 2). The Book of
Courtesies tracks how each fact was learned (told, seen, bought, taught, blundered). This is
extraordinary research-grade authoring. A player who can't predict the effect of a gift will treat it as
a slot machine and stop caring.
Fix: every mark/regard change must show its *cause and effect in one sentence at the moment it happens*
("Mansa laughed at the basins. Mali prices +10% for 2 seasons."). If a mark cannot be summarised that way,
delete the mark.

### 10. Content-to-player ratio is upside down and the pipeline is solo
Evidence: 36 threads, 12 pieces, 5 acts, 4 origin arcs, 6 road threads, rival, 5 skill trees with tier-7
crowns, yard services, estate, legacy. A player on first playthrough sees maybe 40% of it. 67k lines, with
`state.ts` 9.9k lines and `quests.ts` 3.9k. Every addition costs regression risk (save format 3, scripts
for bots only for diplomacy, nothing for economy balance or quest ordering other than `routes.ts`).
Fix: freeze new *kinds* of thing. Spend the next effort on the three things a first-time player *will*
touch: the first hour, the open-sea loop, and the Cape/India climax. Add an automated "headless full-
career bot" that plays the road end to end and reports time, money, deaths, stuck states - one such
script catches more bad design than another 12 threads.

Ranked "bounce" risk: 3 (first ten minutes) > 1 (sailing is skipped) > 5 (menus) > 4 (nav opacity) >
2 (no violence/stakes) > rest.

---

## 2. The "AAA" gap list

What strong titles in or near the genre do that this does not, and what that means for scope.

| Reference | What they do | Carreira today | Verdict |
|---|---|---|---|
| Sid Meier's Pirates! | Short, authored, *skill-based* encounters in 2-5 min (duel, ship fight, dance, fort raid). Always a quest-flag on the horizon. Map is small; the loop is 10 min. | Encounter = text + coin flip; 12 diplomacy "pieces" are the real mini-games but they are courts, not action. | Need ONE tactile ship-vs-ship minigame (see weather gauge, 3 min, no cannons physics) |
| Port Royale / Patrician | A trade screen whose *numbers go up in a way you can feel*; routes; automation of convoys; visible rival competition on the same prices. | Done well on paper (Lines, Houses, rival caravels shown in prices). Opaque to see. | Need a one-glance "profit per day per route" row on the quay, and a visible rival on the map |
| Sea of Thieves | The sea *is* the content: weather, fog, a moving world with events at the horizon. Co-op with *roles* aboard. | Sea is beautiful and lonely. Crew exist as rosters/officers, not as people on deck during play. | Officers should *speak on the deck at moments* with a choice; the deck bar is where the crew lives |
| Sunless Sea | A tiny verb-set; resource dread (fuel/terror); short, dense, potent prose, ONE new strange place per session. | Prose quality is on par (maybe better), but pacing is diluted by time acceleration and by the quantity of threads. | Narrative cards are strong. Fewer, denser, scheduled |
| Return of the Obra Dinn | A single clean investigative interface where all knowledge accrues into one page, and the player does the inference. | Knowledge is spread across Chronicle, Hearsay, Rutter, Logbook, Book of Courtesies, Chart, Orders. | One "Captain's Book" that fills in as you learn, as the *only* knowledge surface |
| Death Stranding traversal | Each journey is a planning puzzle whose terrain you re-read; tools unlock new routes; a feeling of making the world better by passing through. | The road is fixed; routes differ by season/hull; polars exist. But the *same* Lisbon-Mina-Congo-Cape is repeated. | Make the first transit planning puzzle, make the later transits different (monsoon timing, new Lines, a charted shortcut) |
| Hades / modern strong indies | A fast first reward, a clear meta-progress shown at the end of each run. | End of a voyage: payday card, renown, nothing to point at. | A one-screen voyage ledger (days, nm, risks survived, what you learned) every time you reach Lisbon |
| Anything AAA | Audio direction, feedback, "juice": spray, creak, voices. | Sound exists (`sound.ts`, gulls, bell). Not a headline system. | Spend effort on sound + camera framing during key moments, not menus |

Biggest gaps, in order:
1. **A tactile short-form verb** that is not a menu (Pirates!'s fencing, Sea of Thieves' sailing-as-a-team). The
   closest thing is sail trim; it is currently fully automatable ("The watch has her").
2. **A voyage-sized goal with a face** visible at all times (Section 1, #7).
3. **A single knowledge surface** (Obra Dinn principle).
4. **Visible stakes during passages** (gauges with ETAs, a close call with a sight, not a log line).
5. **Spectacle beats** at the Cape, Bojador, Malabar - authored cameras, weather, music.
6. **Social proof of the world**: other ships doing things at the horizon (the rival exists as a story; there
   is no Port Royale-style traffic you could chase).

---

## 3. Standing design principles / guardrails

Every proposal must pass these. A proposal that fails one needs a written justification or gets cut.

**G1. One road, no backtracking.** Per CLAUDE.md. Test: draw the proposal's steps on `TRUNK`. If any step's
`along()` is lower than the previous step's (and the destination is not Lisbon-on-the-way-home), fail.
New content must include a `road.ts` entry and a waiver-free ordering check.

**G2. Net-new kinds of thing cost a kind of thing.** DESIGN.md already admits "do not add more kinds" of
ventures. Extend: any new *meter, tab, currency, or resolution minigame* must name an existing one it deletes
or folds. Adding is never free: save-format, UI, tutorial, balance, bot.

**G3. No grind, no waiting for the player.** If the content rewards doing the same action N times, it fails.
If it requires real-time waiting, it fails (the clock is already the wait). Passive systems cap at
a fraction of active ones.

**G4. Readable in two seconds.** Every decision shows: what it costs, what it risks, what it changes, in one
line, before commit. Every consequence prints a one-sentence cause and effect after. If the designer cannot
write both lines, the system is too opaque.

**G5. The sea is the content.** A proposal that adds activity *only in port or in menus* must be
weighed against one that adds a decision *during sailing*. Port/menu work wins only if it feeds the sea.

**G6. First hour is sacred.** No proposal may lengthen the first 10 minutes, add a tab visible before the
first Funchal landing, or add a prerequisite concept. Anything unlocked after hour 1 is fine to be deep.

**G7. Save-compat.** `SAVE_FORMAT = 3`. Additive fields with defaults only (`d.scaleIndex ?? 1` is the
house style). No proposal may require a migration that touches `Feitoria`, `Line`, `Chart`, or `Navigator`
serialisation without a roundtrip script.

**G8. Solo-dev capacity.** Budget = what one person can ship and *verify headless*. Anything that needs
bespoke art per instance (unique ship models, unique NPC portraits, unique set-piece geometry) is capped at
3 for the whole game. Data-driven + one template beats hand-built.

**G9. Verifiability.** Per CLAUDE.md: "measure, don't guess; verify against independent ground truth". Any
mechanic must come with a headless script that can falsify it (pattern: the diplomacy pieces' perfect /
reader / random bots). No script, no merge. In particular: a full-career bot for pacing.

**G10. Realism serves feel, never the reverse.** Fidelity (period, nav, ship physics) is the brand, and is
protected where it creates *decisions* (volta do mar, monsoon timing). Where it creates only waiting
(100 s lateen dips with nothing to do, hundreds of nm of featureless sea at 1x), the realism gets a
compression, not an apology.

**G11. History honest, fiction marked.** Per DESIGN.md source pass: invented scenes are labelled invented;
disputed dates are not stated. Story proposals must carry a sources line.

**G12. Opposing proposals tested together.** Gameplay and story docs must each name the beat they depend on
in the other; contradictions are resolved before either is built.

Scope sanity check: if the three combined proposals exceed ~3 person-months of focused work, cut to the
three best ones (see section 4 for my selection).

---

## 4. Critique of the proposals

(pending: written after docs/design-team/gameplay.md and story.md exist)
