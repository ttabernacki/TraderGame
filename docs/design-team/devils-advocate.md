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
the "watch bell" (the "watch bell", see 4.6): at x300+ the clock auto-stops at each dawn/dusk watch change with
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

Read: gameplay.md (P1-P10 plus responses) and story.md (10 proposals, career arc, responses). Both are
good and both answered my audit honestly, which is rare. Both also share one habit: they pass G2 by
saying "no new meter" while adding a *new authored corpus* (letters, chronicles, fragments, rescue
beats, a Companion with four entry paths). Authored text is the scarcest solo-dev resource, and neither
doc budgets it. Each verdict below is Build / Build smaller / Cut / Defer.

### 4.1 Gameplay proposals

**P1 Leg Report: BUILD (smaller).** Right instinct, wrong scope. "Days vs benchmark, made-good vs
rhumb, reckoning error, men lost, cargo spoiled, margin, profit/day, plus what the pilot would have done"
is a scorecard of eight numbers. Nobody reads eight numbers. Cheaper variant: three lines, chosen by
surprise: (1) the one thing that cost you most time/men/money this leg, with its cause; (2) the one
thing you did well (landfall within X nm); (3) the margin that matters (water/victuals days left vs
the next leg's benchmark). Everything else behind a "more" fold. It must *replace* the payday card and
the arrival alert pile, not join them. The benchmark must be measured by `scripts/routes.ts` from the
same polars (Gameplay already says this; hold them to it). Also: the Leg Report and Story's Ledger are the
same event stream. One schema, one file. Agreed with Story's coupling note.

**P2 Landfall Wager: BUILD, but only as aiming-off feedback; cut the wager.** The skill is real (aim
off up-current is exactly what the model supports) and the doc is right that nothing rewards it. But a
player-declared prediction with a renown/Casa payoff is a *new minigame with a payoff table*, i.e. G2
fails, and it invites the "call it loose, collect nothing, call it tight, reload" cycle. Cheaper variant
with 80% of the value: no declaration. When the player makes a landfall, the game *scores it silently*
(distance of reckoning from truth at first sighting) and the Leg Report line says "Raised Santiago 9 nm
from your reckoning; the set would have put you 40 nm south had you not aimed north." Add one plan-time
affordance on the chart: draw the ellipse at the *predicted* landfall for the current course so the player
can see the aiming-off need. That is a rendering of an existing quantity, not a system. Tinoco's
reaction then becomes a Casa bark on a very good run, no tracking.

**P3 Wreck Chain: BUILD, and it is the best gameplay proposal.** It converts the game's biggest cliff into
a story, and it uses things already present (`shore.ts`, `finance.shipLost`, `inheritFrom`, Line hulls).
Cautions: (a) it removes the only real fear in the game unless the cost genuinely bites; set the
penalty so a wreck is worse than a lost Act, not just a lost ship (lose cargo, lose half the named hands,
debt to the Casa that comes off *every* later payday, a standing mark). (b) Three authored rescue branches
x every polity x every point on the trunk is a combinatorial trap. Cap authored text to *three rescuers
x two terrains* (coast with people / empty coast) and reuse. (c) The Saharan coast gives nothing, so
the rescue there must be "walked to Arguim", not "found by a Line hull". (d) Act dispatch must survive
mid-act loss; the full-career bot must wreck at 30 points and assert a legal state, as Gameplay says.
Keep it, but build it *after* the Leg Report because the Leg Report is how the player learns why they
lost her.

**P4 Lay-up / careening: BUILD smaller, or fold into P1.** The problem it fixes (the calendar is
information, not a constraint) is real. But "a wait button" is the exact grind I warned about in G3 and the
roadmap forbids (a wait that the player causes). Cheaper variant: no new verb. Make the existing monsoon
timetable a *forecast cost on the departure screen* ("Leave now: 130 days. Leave in 40: 23 days.") and
let the existing "waiting row" at the foot of the port page do the waiting (it already exists in
`portView.ts`). Careening: make fouling a visible, slowly growing speed penalty that the yard or any
beach clears for a few days of the clock. Do not model the lay-up as a mini-session.

**P5 Consorts: CUT from this cycle.** It is the largest item on either list (the author says L). It
adds per-ship provisions, scurvy, reckoning drift, orders UI, rendering, save state: the exact "state-size
multiplier" the doc names, for a game whose strength is one ship and one captain with an ellipse of doubt.
The engine exists only because Xiyang was built first; that is a sunk cost, not a reason. The fantasy
(watching a sail fall astern in the night) can be had cheaply as an *event*: in Act IV-V, one named
consort captain (an existing officer) is lost in a gale, found again at the next port, or not. It
hits the same emotional beat with zero fleet UI. Defer true consorts until playtest shows the lone-ship
loop is solved.

**P6 Hold Plan: VERIFY, then probably CUT.** The doc itself says it did not confirm provisions occupy
tonnage. If they do not, a trade-off between tonnage of biscuit and pepper is an *entirely new constraint*
and a new loading screen in the port page, which already has seven tabs and a barter mode. If they do,
the work is a better layout. Either way, "make the pilot recommend days of margin" (from the shared
benchmark) is the 80% version and is a Leg Report line. Do not add a loading puzzle.

**P7 Bills on the Houses: CUT.** It exists to give a rich late-game captain something to do with money,
which is a symptom of the passive-income problem (audit #6). Treating a symptom with another financial
instrument (the game already has câmbio, letra, sixteenths, Lines, Houses, estate) is the opposite of G2.
Fix the cause: cap passive income, and give the late captain a reason to sail. The real fantasy (draw
pepper at Cochim against coin paid at Lisbon) is already what a Line does.

**P8 Ship-to-ship duel: CUT, as the doc now concedes.** Keep only its replacement: terms (refuse,
parley, run, close at dawn) resolved by the *wind gauge and polar speeds* with a one-line preview of each
outcome. That is a UI over `describeStranger`/`strangerIntentText` and `boardingOdds`, and is the highest
value-per-day item in the combat space. It should be listed as its own small item, not a footnote.

**P9 Manning from the road: DEFER, and merge into Story's Companion.** It is a shop for crews, which the
doc itself flags as a tone risk, and it overlaps the Companion (4 entry paths) and Other Cargo (people as
cargo). Two different proposals independently writing "how enslaved or conscripted people end up aboard"
will not agree. One owner: Story. Gameplay's mechanical hook (language, local knowledge, friction tag on
a hand) can ride the Companion and existing `hands.ts` fields.

**P10 Annual Armada / leaderboard: CUT, and it contradicts Story.** A ranked board for "profit, time,
men alive" rewards the single most profitable action in the game, which Story proposal 3 deliberately
makes morally costly. A leaderboard that pays out for carrying more people to Mina directly undermines the
game's thesis. There is no host for a board, floating-point drift breaks determinism across browsers, and
the audience for a speedrun board in a 1,000-hour-of-reading period sim is tiny. If you want replay value,
use what already exists: origins x heir. A shareable *seed code* with no ranking is a free S-size add later.

### 4.2 Story proposals

**S1 Two Chronicles + Ledger: BUILD (first).** This is the best single proposal in either file. It is
cheap, it is seen by every finisher, and it argues with the thesis. Constraints: (a) the Ledger is one
log file shared with the Leg Report; (b) cap at 3 fragments per polity for v1; the doc says 3-5 per
polity x ~27 polities is ~100 pieces of invented-in-the-spirit prose, each marked invented. Start with the
six polities on the trunk that have courts you actually visit (Mina/Eguafo, Kongo, Kilwa, Melinde,
Calicut, Cochim); (c) the two-panel act closing needs Story to *not* rewrite all five acts, only append
the second panel.

**S2 Letters from the Tagus: BUILD smaller.** Strong emotionally, but it is ~48 authored letters and ~24
reply branches across four origins, plus a promise ledger. First version: one correspondent for all
origins, eight letters total across the career, no promise tracking, one reply tone each. See if
players read them. Make the answer a single pick-one with no compound mechanics (G4). The promise
mechanic ("home for St James") is the part likely to be broken by the clock and should wait.

**S3 The Other Cargo: BUILD, but staged and with the author's own fallback as the default.** It is the
most important gap in the narrative and the most dangerous thing to ship badly. Cautions: (a) Slice 1
(the escrivão line, ledger entries, the epilogue count, a Casa commission offer you can refuse) is the
right size and correct to ship first; (b) the commit to "named people with single known facts" is good
writing practice but it is also the most expensive authoring in the doc; do not start slice 2 until
slice 1 has been played; (c) the opt-out must not become the dominant strategy. If refusal is free, it is
a flavour dialog; if it costs margin the player cannot afford, it is a punishment. Playtest the
margin with the headless career bot: the refusal path should lose ~10-15% of a leg's profit and the
Casa's goodwill, not decide a run. (d) The source pass (A7) is a precondition, not a task to do
alongside.

**S4 The Companion: BUILD smaller.** The most distinctive character idea in either doc, and the most
fragile. Four entry paths x a thread with a beat at each frontier x a decision at Lisbon = four
separate arcs. Build *one* path first (the Kongo hostage, which already has a piece and clock-carried
letters), with the same three beats and the Lisbon decision. Then see whether a second path earns its
cost. Also: the doc's own risk note (a person whose position is not freely chosen, written by outsiders)
argues for fewer words, not more.

**S5 The Prize Has Passengers: BUILD smaller, and watch the art cost.** The `Stranger` schema extension
(named master, owner, passengers) is cheap. But "dhows, Gujarati and Mappila merchantmen, Kilwan coasters"
implies *hulls*: I grepped `src/render` and `encounter.ts` and there is no dhow model; only European
hulls and the shelved Xiyang junks exist. A named master on a ship drawn as a caravel is a continuity
error the player will see. Either budget one dhow model (G8's cap of three bespoke assets) or draw all
Indian Ocean traffic as a single "dhow" template in the same way Xiyang junks were built. Without it,
S5 is text on the wrong picture.

**S6 What You Did at Calecute Becomes the Rule: BUILD, but cut the scope in half.** Great act structure:
Act V reads what Act IV did. The cartaz enforcement per port ("stopping ships becomes a standing order")
is the expensive part and depends on S5's schema and Gameplay's consorts. Cut to: the Regimento is written
from three Act IV flags; two or three cartaz *decisions* in Act V (Melinde, Mombasa, Calecute); the
Clerk's second letter. No standing-order mechanic. If S6 needs P5 consorts to make sense, it has failed
the dependency test. It does not; the doc itself says to build 6 first with the player's own ship.

**S7 Rock at Mina and Jolof prince: DEFER.** The Mina audience scene is good and cheap, and should
replace the Act I close (it is a rewrite of a beat, not an addition). The Jolof prince thread (carry him
outward, killed on the voyage home in history) breaks G1: the historical beat happens on the return
voyage, while the game's rule is nothing happens behind the captain. The doc says "the consequence arrives
by word", which is fine, but it is a whole thread for one scene; fold the prince into one beat of the
Other Cargo chapter instead.

**S8 The Edict: BUILD, tiny.** Add as a HISTORY event plus one letter and one origin-gated beat. It is
the correct size when it is not a system. Do after S2 exists, otherwise it has no vehicle.

**S9 The Muster Roll: BUILD. Best value per word in the whole pass.** Death lines for the eight named
hands plus the roll read at the end. Add one design rule: deaths must *never* be grind (the player should
not be rewarded or punished mechanically for a named man's death beyond what exists). It also makes the
Leg Report's "men lost and why" land.

**S10 The Heir Sails Into What You Made: DEFER.** Needs everything else to exist first. Nothing in it
is cheap, and it multiplies the replay value of content most players will see once.

### 4.3 The three most worth building, in order

1. **The Ledger, the Leg Report and the Muster Roll as one stream (Story S1 + S9 + Gameplay P1).** One
   `ledger.ts`, written by every consequential event, read by (a) the Leg Report on arrival, (b) the
   Muster Roll on a named death, (c) the two-panel act close and epilogue. Cost: S/M. It is the only
   proposal that improves both gameplay legibility and story weight with one piece of plumbing. It also
   fixes audit #2, #4, #8 and #9 (readable consequence). Make it first.
2. **The Wreck Chain (Gameplay P3), with Story writing 3 rescuers.** Turns the one cliff into a
   story and gives Lines and goodwill a reason to exist. Cost: M. Do the full-career bot and the 30-
   point wreck test.
3. **The Other Cargo slice 1 + the Companion's single Kongo path (Story S3 + S4),** as one chapter.
   This is where the game gets a spine of meaning, and where its "triumphalism" is argued with. The DA
   caution: the quality bar is the whole point. If the source pass or authoring bar cannot be met, take
   Story's own fallback (escrivão line and epilogue count) and move on. A close fourth is S6 at half scope.

Also build the unlisted item both docs need: **the headless full-career bot** (audit #10, both docs'
G9 response). Without it no one can check pacing, wreck legality, ledger round-trip or refusal-path
profit loss. It is the multiplier on everything above.

### 4.4 Cut or defer list

Cut: P5 consorts (this cycle), P7 bills, P8 duel (keep terms-preview), P10 leaderboard, P6 hold plan (unless
verification is trivial), S7 Jolof prince thread (fold to a beat).
Defer: P4 as a mini-session (do the departure forecast), P9 (merge into Companion), S10 heir act, S2's
promise tracking and 4-correspondent variants, S4's other three entry paths, the 100-fragment chronicle
corpus beyond the six trunk polities.

### 4.5 Contradictions between the two documents

1. **Profit leaderboard vs. complicity (P10 vs S3).** A ranking that rewards profit and speed
   makes the slave-parcel the dominant strategy. Resolved by cutting P10.
2. **Binary failure vs. no punishment (P3 vs S2/S9).** P3 makes a loss survivable; S2/S9 make loss
   *emotionally* heavier (the hardest letter in the game, the roll). Those are compatible only if the
   mechanical cost of a wreck stays high. Settle this with numbers from the bot, not by taste.
3. **Consorts as instruments (P5 vs S6).** Story hangs the Cartaz's moral cost on consort captains who
   disagree; Gameplay hangs the whole armada on a month-plus build. Story's own fallback (player ship only)
   is correct; adopt it.
4. **Crew sourcing owned twice (P9 vs S3/S4).** Gameplay P9 invents a crew shop with convicts, lascars
   and Guinea hands; Story's Other Cargo and Companion place enslaved and hostage people aboard. These
   cannot be authored independently. One owner (Story).
5. **Combat tone (P8 vs S5).** Gameplay now wants terms and ransom; Story wants a boarding that finds named
   people. Both are satisfied by one `Stranger` extension. The merge works; keep the contract Story
   proposed (Gameplay owns odds and terms, Story owns who is aboard).
6. **Passive vs active income (P7 vs the audit).** Gameplay wants a financial verb for the rich
   captain; Story's Rule/cartaz proposals imply a captain *at sea* with a decision to make. The second
   is the better answer to the same hole.
7. **Wait gates.** Gameplay P4's wintering and Story's letters ("home by St James") both introduce soft
   timers. The clock will break the second as often as it keeps it, which is the story's point, but it
   must not read as a bug (DESIGN.md rule 3).
8. **First-hour discipline.** Both say nothing lands before Funchal. But the Prologue correspondent
   (S2) lands in the first minutes, in the same window as 13 tutorial steps. Delay the first letter until
   after the first discharge.

### 4.6 What neither document addresses (my asks)

1. **The first ten minutes.** The audit's top bounce risk (tutorial wall) is untouched by 20 proposals.
   Fixing it is worth more than P5, P7 and P10 together.
2. **The sailing loop between decisions** (audit #1). P2/P4 touch it, but the watch-bell concept (a clock
   that stops at dawn and dusk when something changed, one default decision) is what both docs endorse in
   passing and neither owns. Assign it. It is the highest-leverage UI change in the whole review.
3. **Menu reduction.** Seven port tabs and seven Orders tabs. Every proposal adds a card or a letter;
   none removes a tab. Set a budget: net tab count may not increase; the "Today" card (audit #5) is the
   price of entry for new content.
4. **Audio and spectacle** at the Cape, Bojador and Malabar. Cheap, and where AAA games earn their
   memory of a voyage.
5. **A pacing target.** Neither doc says how long a full career should take. State one (suggest 12-18 hours
   for a first career, 90 minutes for a first act) and let the bot check it.
