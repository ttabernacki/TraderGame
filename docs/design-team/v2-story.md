# Story v2: from threads to systems

Author: Story designer, second pass. v1 (`story.md`) is untouched; it proposed scenes and features and was rightly rejected as insignificant. This pass starts from what makes the classics compelling, audits what the code does now, and proposes whole systems. Where v1 had a good idea it survives only as a part of a system (the Ledger, the Companion, the Cartaz, the Traffic, letters, the heir).

Method: I read `chronicle.ts` (acts and history), `quests.ts` structure and the full Gold of Çofala / Count / Embassy / King's Offer scenes, `arcs.ts`, `officers.ts`, `crew.ts`, `hands.ts`, `skills.ts`, `counsel.ts`, `mutiny.ts`, `polities.ts`, `courts.ts`, `marks.ts`, `leads.ts`, `inland.ts`, `portCharacter.ts`, `estate.ts`, `rival.ts`, `seaEvents.ts`, `log.ts`, `hailing.ts` and `epilogueView.ts`, and I counted things with grep/awk. Numbers below are measured, not remembered. Where I judge a quest by its shape rather than having read every line, I say so.

---

## 1. What makes the classics work, and what this game has of it

| Classic | The thing that hooks | Present here? |
|---|---|---|
| Pirates! | A named character who *becomes* something (rank, titles, a nation that loves or hunts you); every port has a governor with a daughter and a mood; the world has four powers whose wars you read in the tavern and exploit. | Rank: renown only. Powers: static. Governors: absent. |
| Port Royale / Patrician | Cities have standing orders, guild ranks, council politics, contracts that appear *because* something happened. | Contracts appear from price gluts only (`ventures.ts`). No ranks, no councils. |
| Uncharted Waters | Several protagonists across a world, each with a story; patrons in every port; a discovery log that feels like a collection. | One unnamed protagonist; lead/discovery system is good. |
| Sunless Sea | Storylets keyed to *qualities*: what you are, what you have done and where you are decide what the world offers; officers with their own stories; terror and debts; a world that remembers by state, not by scripts. | Scenes are good; they are scripted rails keyed to act number. |
| Sea of Thieves | Emergent social stories off a small verb set. | The sailing is the best in the genre; nothing emergent sits on top of it. |
| Classic CRPGs (Baldur's Gate 2, Mass Effect, Dragon Age, Disco Elysium) | A protagonist with a build and a conviction; companions with wants, approval, conflicts and exits; a world that remembers through flags; factions with stakes; a quest web, not a rail; endings assembled from state. | Pieces of each, not joined. |

The game's engine layer (navigation, ships, economy, diplomacy pieces) is of a class most of these titles do not reach. The story layer sits on top of it *like a book on a table*: well written, loosely attached.

---

## 2. Audit (what the code does, with verdicts)

Measured facts first. They drive most of the verdicts.

- `quests.ts` is 3,858 lines, **25 threads, averaging 2.9 steps and ~7 choices each**; seven threads have two steps, two (`kingsOffer`, `pepperHouse`) have one. Threads are gated almost entirely by `g.chronicle.act >= N` (and three by `lifetimeStanding`), i.e. by *time*, not by what the player is or has done.
- **Cross-thread dependencies: three** (`leak` outcome read by `zamorin` and by `chronicle.ts`; that is all, found by grep). The outcome of a thread is a string read by the epilogue (`LATE_ENDINGS`, `originEnding`) and by `callbackAt`, which prints one remembered line at the place. Nothing a thread decides changes what other threads offer.
- **6 officer arcs** (Correia, Sousa, Gaspar Vaz, Dinis, Sintra, Anselmo), 3 beats each; v1 said seven, it is six. The Escrivão and the Língua, two of the eight roles, have **no arc**. 8 named hands with `regard`. Officers do not speak to each other; no arc reads another arc.
- **27 polities, ~80 faction records** (`polities.ts`), each with `allies` and `feuds`. Factions are used in two places: the audience's acceptance score (`courts.ts` ~209-265) and `crisisFor` (succession/other crisis). Allies and feuds are **data nobody simulates**.
- **52 ports, 17 hand-written `CHARACTER` entries** (`portCharacter.ts`), each a signature, a duty, a price tweak, a danger, and optionally one goods-delivery `PortQuest`. No named person lives in any port.
- The captain has **no name, no portrait, no voice** (grep found no captain name field). Identity is: origin (4), 72 skill nodes, renown.
- **15 sea events** (`seaEvents.ts`): weather, ship and luck; almost none involve a person.
- Logbook: 1,200 line ring buffer by kind; a ship's diary, not a life story.

### System verdicts

| System | What the player does | What persists | Verdict and reason |
|---|---|---|---|
| **Acts / Chronicle** (`chronicle.ts` 893) | Reach a place; a letter arrives; a one-button scene pays gold+renown. | `act`, `history` strings. | **REWORK.** The dated `HISTORY` (Cão, Columbus, Dias, the King's death) is the best idea in the file: a world clock that happens on its date. KEEP that. CUT the five act-opening/closing one-button scenes as the *driver*: an act is five times "King wants X, you reach X, gold". Make eras a *result of world state* (section 4). |
| **Crown commissions** (`crown.ts` 690, `ACT_CHARGE`) | Take a patent with objectives; get paid at any quay. | `crown.patent`, standing. | **REWORK** into patron-issued, state-generated orders (Pillar 6). One patron (the King) for 5 acts is the flatness. |
| **Quest threads** (`quests.ts` 3,858) | Walk a rail of 2-7 scenes. | `outcome` string, a few flags. | **REWORK into a storylet web** (Pillar 4). Scenes are good and are all reusable. The *structure* is the problem. |
| **Origins** (`origins.ts` + 4 threads) | Pick at start; one private 3-step thread. | Starting stats; `originEnding`. | **KEEP the idea, REWORK:** origin should seed a Patron, a Network, a Conviction slot, a family. Today it is a start bonus and a sentence at the end. |
| **Skills** (`skills.ts` 448, 72 nodes, perks) | Spend ~40 points; perks that change what you can do. | Perks. | **KEEP.** The best-designed build system here ("a node that lets you fix your longitude changes which voyages exist"). REWORK only to surface perks as *options inside scenes* ([Diplomacia] speak in his tongue), so the build shows in the story. |
| **Officers + arcs** (`officers.ts`, `arcs.ts`, `counsel.ts`) | Hire at crimp; 6 get arcs; counsel at hard decisions. | Traits, `memory`, `bonded`. | **KEEP and make the centre of the game.** `counsel.ts` (the wardroom speaks, sometimes wrongly, with temperament) is the strongest RPG-facing mechanism in the repo. REWORK into a real party (Pillar 2). CUT random hired officers with no story. |
| **Hands** (`hands.ts` 284) | Eight named men; regard; die by proportion. | `regard`, fate. | **KEEP, REWORK** into the promotion pipeline (hand to mate to factor/master), the source of growth and of loss. |
| **Mutiny** (`mutiny.ts` 350) | Sides with names, not dice. | Fates on hands. | **KEEP.** Model for how a crisis should feel. Generalise from "mutiny" to "company crisis". |
| **Diplomacy pieces + Table** (12 pieces, `diplomacy/pieces/`) | Small games at courts. | Marks, Book entries. | **KEEP.** These are the verbs the Powers layer needs. Currently they are called from threads; they should be called by *situations* the world generates. |
| **Marks / Book of Courtesies** (`marks.ts` 67, `book.ts` 49) | Court remembers; three effects. | Serialised marks. | **KEEP and generalise** into the Ledger (Pillar 0). Marks are already "named, toned, remembered" facts; they are scoped to polities only. |
| **Polities / regard / factions** (`polities.ts`, `courts.ts`) | Trust/respect/interest; agreements. | Per-court state. | **REWORK (the biggest latent asset).** 80 factions, allies, feuds, rulers and crisis hooks, simulated by nothing. Pillar 3 turns them on. |
| **Leads / hearsay** (`leads.ts`) | Follow rumours of geography; wrong by N nm. | Followed/false. | **KEEP and widen** from geography to politics and prices (Pillar 3 rumour mill). The idea that rumour is *imperfect* is exactly right. |
| **Ports** (`portCharacter.ts`, `ports.ts`, `portView.ts` 1,971) | Trade, shipyard, tabs. | Regard, local memory. | **REWORK.** A port is a price sheet with 17 flavour rules. Give 14 of them people, quarters, a calendar and a memory; make the other 38 honest stops (Pillar 5). CUT the goods-delivery `PortQuest` (a duplicate of charters). |
| **Ventures / charters** (`ventures.ts`) | Deliver a good for a deadline. | Delivered/failed. | **REWORK** into generated Opportunities fed by world state; DESIGN.md already says "do not add more kinds". |
| **Houses / Lines / factories** (`network.ts`, `feitoria.ts`, `livingFactory.ts`) | Hold positions, run Lines. | A lot. | **KEEP.** It is the economy of position. REWORK: staffed by company members who can be loyal, skim or die (Pillar 2). |
| **Estate / Casa meters** (`estate.ts`, `casa.ts`) | Invest, buy land, keep the Casa sweet. | Holdings, regard. | **REWORK / CUT.** Passive investments are a money sink (`estate.ts` says so itself: "more cruzados than anything to spend on"). Fold into Patronage obligations; keep the lordship as a dynastic asset. CUT land/house as separate numbers. |
| **Rival** (`rival.ts`, `rivalEvents.ts`) | A frontier latitude that creeps south; some meetings. | `regard`, ending flags. | **REWORK.** A latitude is not a rival. Make the Race a Front with Castile and one nemesis who is a *person with a company* (Pillar 3). |
| **Inland missions** (`inland.ts`) | Send a man up a river. | Result years later. | **KEEP, generalise** to "dispatch a companion" (an RPG verb the game already has and under-uses). |
| **Sea events** (`seaEvents.ts`, 15) | Weather and luck cards. | Log. | **KEEP as texture;** ~5 should involve named people (see Pillar 2). |
| **Barks** (`barks.ts`, 26 lines) | Officers speak at places once. | Said-once flags. | **KEEP and make reactive** (they should react to the Ledger, not just the place). |
| **Logbook / journal** (`log.ts`, `logbookView.ts`) | Read it. | 1,200 entries. | **REWORK** into the Captain's Book: the Ledger rendered as an autobiography with the log as an appendix. |
| **Epilogue** (`epilogueView.ts`) | Read a card. | Nothing. | **REWORK** (v1's Two Chronicles, now built from the Ledger, with heir hand-off). |
| **Xiyang / Ming campaign** | | | **Ignored** (shelved). |

### Structural diagnosis (the five questions)

1. **Is there a protagonist with a build and an identity?** A build, yes (skills are good). An identity, no. The captain is a camera. The origin is a start bonus and a sentence at the end. Nobody calls him anything.
2. **Do crew and companions matter mechanically and emotionally?** Mechanically, yes: traits, counsel, mutiny. Emotionally, at the edge: six arcs of three beats, each in a silo, and eight hands. There is no *party*: no conflict between companions, no approval that decides who stays, no growth, no succession, no way for a companion to leave a mark on the world. The game's best asset.
3. **Is there a living faction/politics layer that changes the map of possibilities?** No. There is a very good *data model* of one, switched off. What is on offer in a port depends on the act number and the standing threshold, not on what happened in the world.
4. **Do quests form a web?** No: rails. Three cross-links in 25 threads; outcomes are strings read at the end.
5. **Does reputation change what the world offers?** Prices and the audience score yes (marks, regard). *Offers, people and doors* no. Reputation is a multiplier, not a key.

Duplication and drag: three overlapping "do an errand for pay" systems (commission objectives, charters, `PortQuest`); a money sink (estate) with no story; five identical act closers; a rival who is a number. Disconnection: diplomacy pieces are great, and only threads call them; the Book of Courtesies has no use in a scene except as a gate.

---

## 3. The target design in one paragraph

A named captain with a *conviction* and an earned reputation leads a **company of companions** (a real party) down one road repeatedly over a career and then a lineage. Behind the road runs a **simulation of Powers and Fronts** (Crown, Castile, Kilwa, Melinde, Calicut, Kongo, the Crescent league; the Traffic, the Rule, the Gold, the Race) that moves on a monthly tick and on the historical calendar. What it does reaches the player as **rumour** (imperfect, delayed, travelling down the road) and as **opportunity**. Players meet it in **deep ports with people in them**, through **storylets** that unlock by *state* (what you are, who is aboard, what you've done, what the world is doing) and write state back. Everything the player does is recorded in a **Ledger** with tags; the Ledger is what the Powers react to, what the companions judge, what the ports remember, what the heir inherits and what the final chronicles print. Patron houses at home give orders and take their cut. The player cannot stop the great processes; he can only choose his part in them, and the world visibly becomes the one he helped make.

Seven pillars (0-6). Each is a system; none is a scene.

---

## 4. The pillars

### Pillar 0 — The Ledger (foundation, replaces marks-as-silo)

**Core.** One append-only record of consequential acts, each an entry:

```
{ t, place, tag, actors[], target (polity|person|front), magnitude, witnesses[], note }
```

Tags are a controlled vocabulary of ~70 (e.g. `promise.kept`, `promise.broken`, `weights.false`, `parcel.carried`, `parcel.refused`, `parcel.redeemed`, `ship.stopped`, `ship.spared`, `town.bombarded`, `hand.flogged`, `hand.died`, `letter.kept`, `gift.great`, `gift.insult`, `chart.sold`, `patron.betrayed`, `companion.freed`, `companion.lied_to`). Marks (`marks.ts`) become Ledger entries with a polity target and an `echo`; the `echo` mechanism is kept as is.

**What the player decides.** Nothing directly; he *reads* it as the **Captain's Book** (autobiography view), and sees a one-line "what this did" whenever an entry lands (guardrail G4).

**Who reads it.** Everyone: Powers (deltas table, ~60 rows tag-to-front), Companions (approval table per companion), Ports (memory and Patron relationship), Titles (predicates), Storylets (preconditions), Epilogue (chronicles), Dynasty (heir inherits decayed entries).

**Numbers.** ~70 tags; typical career 600-1,500 entries; entries older than 8 years decay at heir hand-off. Pure data, no new meter; the only visible numbers are the ones already in play.

**Replaces/builds on.** `marks.ts`, `book.ts` (Book of Courtesies stays as the knowledge side, "how learned" unchanged), `LATE_ENDINGS`, `originEnding`, `callbackAt`, `Game.logEvent('crown')`. **Cuts:** the three separate "remember this" mechanisms.

**Size.** S/M. **Stage 0; ships alone and improves every later stage.** Verified by a headless script that plays N seeds and asserts every tag is read by at least one consumer (no dead tags; the thing that rots otherwise).

---

### Pillar 1 — The Captain (identity, conviction, reputation as keys)

**Core loop.** At the start the player makes a *person*: a name (a short generator by origin, overridable), an origin (exists), and a **Conviction** (new): a vow he keeps or breaks, which gives a power and an obligation, in the Disco Elysium / BG2 tradition of the build having a *soul*. Over the career the Ledger earns him up to three **Titles** (the epithets the world calls him), each of which is both a door and a wall.

**Convictions (6, one chosen):**

| Conviction | Gives | Costs / tests |
|---|---|---|
| **Honest Weights** | Credit and goodwill: courts accept your word without hostages; false-weight storylets reveal themselves | Cannot take the Count; the Casa distrusts a captain who will not shade; each broken instance is a *loud* Ledger entry |
| **The King's Hand** | Orders flow; Patron Crown at one rank up | Company members who disagree lose approval faster; you carry the cartaz in the end |
| **Free Hand** | Privateer offers, no Patron obligations, black-market doors | No Patron credit; risk of being named outlaw by two nations |
| **Faith** | Chaplain's arc deepens; baptisms, Prester John, the St Thomas Christians open | Muslim courts read you as hostile at first; moral questions are *louder* |
| **Curiosity** | Discovery renown +, leads more accurate, companions who draw/write approve | Slower trade; pressure from the Casa |
| **Mercy** | Hands and the vulnerable (stranded, captives, the sick) respond to you; ransom doors open | Margins thinner; the Traffic Front hits you hardest because you *see* it |

A conviction is a **promise to the player's own character**; the Ledger records when you act against it, and the company (Pillar 2) *notices*. Breaking it is allowed and expensive in approval, not blocked.

**Titles** (~30 authored, 3 worn), awarded by predicate over the Ledger, e.g. *O Justo* (≥8 promises kept, none broken in a polity: that polity gives you a seat); *the Pilot of the Cape*; *Mão Pesada* (parcels carried ≥ N, ships stopped ≥ M: some courts open, some close, hands are afraid); *Amigo de Melinde*; *the Redeemer*; *the Man Who Sold the Chart*. Titles are broadcast by **word** to the road ahead with delay, so at Calecute a title earned at Mina arrives a season late and is *distorted* (a mercy becomes weakness; a hard hand becomes a butcher) depending on who is telling it.

**Interconnection (at least four):**
1. **Web** — scene options are gated by conviction, title and skill ("[Mercy] Ask the factor to show you the register").
2. **Company** — approval of each companion is computed against the conviction and the Ledger tags.
3. **Powers** — titles and Ledger-driven reputation alter polities' *Attitude* (their intent toward you); rumour carries them.
4. **Dynasty** — the heir inherits a diluted title and must choose to keep or repudiate the conviction.
5. **Places** — Patrons greet you differently by title; doors (the Oba's palace, the vizier's court) open by title.

**Builds on / replaces.** `origins.ts` (blurb and epilogue stay; the four origin threads become first backstory storylets), `skills.ts` (untouched; options surface it), `milestones.ts` (milestones become Titles). **Cuts:** renown as the single prestige number is demoted to a currency for patron favours; titles carry meaning.

**Size.** M. 6 convictions (design+text), ~30 titles (predicates are data), name generator, a character-creation screen and a Captain's Book view.

---

### Pillar 2 — The Company (a party, with growth and exits)

**Core loop.** The ship carries a **party** of 5-7 companions out of a pool of ~20 authored characters (the six existing arcs plus 14 new), plus the eight named hands and the anonymous complement. Companions have:

- **Want / Fear / Line** (the one thing they want, the thing they fear, the thing they will not do). E.g. Correia: wants one more voyage without being replaced; fears the hand-shake; will not falsify a position. Anselmo: wants a mission; fears the sea of faiths he did not expect; will not baptise a person who cannot understand.
- **Approval** (-100..+100) computed from the Ledger through a per-companion tag table (~12 tags each, data). Approval thresholds unlock/lock *abilities*: at +40 he gives his bond effect (`BONDS` already exists); at -40 he argues in counsel; at -80 he leaves, sells your chart, or leads the sides in a crisis.
- **A personal arc** of 4-5 storylets (existing 3 beats extended), which can *end* in more than one state (bonded, estranged, ashore, dead, betrayed).
- **A role skill** used by the sim (the Pilot's reckoning, the Surgeon's mortality, the Língua's court access: already how `officers.ts` works).

**The pool gets people the current cast lacks.** The Língua and Escrivão get arcs. And the pool must include companions who are **not Portuguese**, with their own politics and agency, who *judge you by what you do to their people* and can leave you: a Kongo youth raised in Lisbon, a Swahili pilot, a Gujarati or Malabari shipwright, a converso factor, an Akan interpreter. They are not set-dressing; their approval gates **access to whole regions** of the game (a Swahili pilot makes the monsoon crossing accurate; losing him is a tangible loss, and he leaves if the Rule makes you a stopper of his cousins' ships). v1's Companion survives here as the best example.

**Growth.** Hands are promoted: a named hand with high regard and a skill becomes mate (a 2-year pipeline), then a **House factor** (`feitoria.ts`), **Line master** (`network.ts`) or **consort captain** (Gameplay's P5). A promoted hand has his own loyalty; a factor you neglected skims (the Count's mirror) and one you trusted covers for you when the Casa audits. Deaths are fed to the Ledger (`hand.died`) and bring the weight of v1's muster roll.

**Party in play.**
- *Counsel* (`counsel.ts`): the party talks at every hard decision (kept); now with conflict *between* companions (the Chaplain vs the Língua over a baptism; the Pilot vs the Master about the weather) so the player arbitrates.
- *Shore leave and Quarters* (Pillar 5): where companions have private storylets, each in a place that is on the road.
- *Dispatch* (`inland.ts` generalised): send a companion on an errand and get him back changed or not at all.
- *Crises* (generalising `mutiny.ts`): a bad mortality run, a captured parcel, a stopped ship, a lost conviction: companions form sides with names.

**Interconnection.** (1) **Ledger** supplies approval. (2) **Captain**: conviction sets who loves you. (3) **Web**: personal arcs are storylets; party membership unlocks options. (4) **Powers**: a companion from a polity is a back-channel (and a hostage-like liability if that polity goes to war with you). (5) **Houses/Lines** (economy): staffed by company. (6) **Dynasty**: companions age; the old pilot's apprentice becomes the pilot.

**Builds on / replaces.** `officers.ts`, `arcs.ts`, `crew.ts`, `hands.ts`, `counsel.ts`, `mutiny.ts`, `officerEvents.ts` (417, becomes the engine for companion beats), `barks.ts`. **Cuts:** the random-hire officer generator (an unnamed hired man with a trait and no story is the least interesting person in the game); recruiting becomes courting a named candidate at a Patron's table. The crimp keeps hands only.

**Size.** L (content). Stage by approvals first (S: table of tags per existing six), then pool expansion (M each region), then promotion pipeline (M).

---

### Pillar 3 — The Powers (a living world: Fronts, Powers and the Rumour Mill)

**Core loop.** A monthly world tick advances **Powers** and **Fronts**. The player experiences it as *rumour* he can act on or ignore, and as *changes in what the road offers*.

**Powers (8):** the Crown's court (with 3 home factions: the throne, the Order of Christ and the Church, the Rua Nova money), Castile, the Mamluk-Venetian axis (the Crescent's patron), Kilwa, Melinde, Calicut and its Mappila merchants, Cochin and the Kolathiri, Kongo (with Soyo). Each has `intent` (what it wants in the next 24 months), `means` (gold, ships), `attitude` toward the player (from the Ledger), and `relations` to the other Powers, seeded by the **`allies`/`feuds` data that already exists** in `polities.ts`. Each tick, a Power may declare an embargo, make a truce, attack a neighbour, hold a succession fight (`crisisFor` already models one kind), or ask for a favour.

**Fronts (6)**, in the Apocalypse World sense: a clock with stages, each stage changing the world:

| Front | Drives | Stage effects (examples) |
|---|---|---|
| **The Gold** (Mina) | The fort, fever mortality, relations with the Akan kingdoms | S2: fort strained, garrison discipline events; S4: revolt or collapse; gold price at Lisbon follows |
| **The Traffic** | People carried from Arguim, Mina, Benin, Kongo to Lisbon, São Tomé, later the Atlantic | S1 ransom economy; S2 regular and routine; S3 plantations and a Casa quota; S4 "the system" (cheap sugar, Kongo court split, heirs live inside it) |
| **The Claim / the Race** | Castile, Columbus, Tordesillas, padrões as claims | S3: line drawn; rival captain's company arrives first at places |
| **The Crescent** | Reaction of the Indian Ocean powers: Mamluk, Gujarat, Calicut's Mappila | S2 diplomatic notes; S3 convoys; S4 league; pepper price in Lisbon moves (Venice) |
| **The Rule** (the cartaz) | Free sea to licensed sea | S1 free sea; S2 "friends have passes"; S3 stopping unlicensed ships; S4 blockade; your own conduct *sets* the stage |
| **The Court** (home) | Succession, favourites, the Edict, Manuel's accession | Patrons rise or fall; the converso networks face the Edict |

**How the player enters it.**
- **Rumours.** Every event creates a rumour with `truth` (true, stale or false) and `source` and it *travels down the road* at a port-per-month with fidelity loss; taverns (Pillar 5) sell it; the existing `leads.ts` principle (*wrong by N nm*) is extended to politics. A captain who sails into Mombasa on a three-month-old rumour of friendship arrives in a war. Information is the currency of navigation of the *politics*, as the chart is of the sea.
- **Opportunities.** The tick spawns **offers** with deadlines (replacing charters' only source, price gluts): carry powder to Melinde (Mombasa is attacking), take a hostage's letters, broker a truce, evacuate a factor, redeem a ransomed pilot.
- **Decisions at the three levers** per Front: *push* (accelerate; profit), *brake* (cost; sometimes pointless), or *contest* (take it to a court and be told no). No lever stops a great process (see below); each leaves a Ledger entry the world reads.

**The moral weight as a system (Traffic and Rule fronts).**
- *The Traffic baseline* advances by the Portuguese enterprise as a whole (~0.5 stage-points a year under the history schedule). A parcel the player carries adds ~+0.1; refusing at cost removes ~-0.05; a contested hearing at court removes ~-0.15 *and* costs Casa regard; redeeming a named person is a Ledger entry with no front effect at all, deliberately: it matters to the person and to the Book, not to the machine. Even a perfect refusal career changes the end stage by about one tick: the player is inside something larger and gets to choose what he was in it. The *stages are shown* and the stage-3 shifts are felt in play (the Kongo court splits: elders vs traders vs a pretender; São Tomé's sugar floods Lisbon and your sugar lines pay less; an Anselmo-type chaplain asks you about the register).
- *Agency of the others.* The Traffic is not a Portuguese-only Front: the Akan, Benin, Kongo, Jolof, Arab and Swahili traders are *Powers inside it* with their own interests (Kongo's elders and traders want different things; Benin sets terms; Kilwa's slave and gold markets predate you). A polity can use the Portuguese to topple a rival, refuse a market, or break with you over what you did. Dignity is agency: they have moves.
- *The Rule.* The player's own conduct at Calecute and Kilwa in Act IV sets the Rule's stage for Act V (v1's "precedent"). Dhows are met as people (Pillar 5's strangers), their masters recur, word of each stop runs ahead on the road to the next court. Whether the Rule is a licensing regime of friends or a blockade is a player-authored fact that the heir lives in.
- *Presentation.* Aftermath and ledger lines, not spectacle; the Ledger and the Captain's Book print what happened in the plain voice.

**Interconnection.** (1) **Ledger** is its input (tag-to-front delta table). (2) **Web** — each Front stage unlocks 6-10 storylets (new world content *because the state is different*). (3) **Company** — companions from affected peoples judge; the Front's stage changes what the chaplain asks. (4) **Places** — a port's Fort/Market/Court quarters show Front state (closed market, garrison on edge). (5) **Economy (Gameplay)** — wars and embargoes feed prices, charters, Lines' risk. (6) **Dynasty** — Fronts persist; they are the "inheritance" of the world.

**Builds on / replaces.** `polities.ts` (allies, feuds, factions: used as the tick's data), `courts.ts` (`crisisFor` and `word` become event types in the tick; the `word` queue already moves news ahead of the ship), `chronicle.ts` `HISTORY` (stays as the *scheduled shocks*: Cão, Columbus, Dias, the King's death, the Edict, which Fronts then react to), `leads.ts`, `rival.ts`/`rivalEvents.ts` (become the Race front's agent). **Cuts:** `chronicle.ts` act-openers as quest dispensers; `ventures.ts` as only a price-glut generator; the `rival.frontierLat` model.

**Size.** L. **Stage:** (a) one Front (Traffic) with 4 stages, rumours, 10 storylets; (b) Powers tick on the Swahili coast and Malabar using existing feuds data; (c) the rest.

**Verification.** A headless script runs 200 seeds of 20 years with a random-player policy and asserts: no Front is pinned at an extreme in >80% of seeds; every Power has a non-trivial history; every rumour eventually resolves true, stale or false; no storylet unlockable only by sailing back along the road.

---

### Pillar 4 — The Web (a storylet engine that replaces the rails)

**Core.** A **storylet** is `{id, place (port | road span | season), requires (query over qualities), priority, scene, writes (qualities), hooks (new storylets unlocked)}`. *Qualities* are the world-state: Ledger tags, marks, companion approvals/states, Front stages, titles, skills, location along the road, season, flags. Arcs ("The Gold of Çofala", "The Zamorin's Pepper") become **named sets of storylets** that share qualities rather than step pointers. The current ~175 choices across 25 threads port over with their text; the link between them becomes state.

**What this fixes, concretely.**
- Cross-thread consequences are ordinary: the Kilwa promise made for Çofala (`q.flags.promise`) is a quality (`promise.kilwa.first_call`) read by the Rule's Kilwa storylets, by Yusuf's companion arc, and by the epilogue.
- Availability by state: the Embassy of Kongo is offered *to a captain with Kongo regard*, not to everyone in Act II; the Prester thread opens to a Faith conviction first; a title opens the Zamorin's door.
- Doors close: storylets expire when a Front moves on (the Bemoim window, the Pepper Race clock); the world does not wait for the player.
- Surfacing is controlled: at most one scene per port call (plus one at sea per leg) by priority (deadline > companion > front > texture). Lands as a *person at the Quarter you can speak to*, not as an alert (DESIGN: no alert spam).

**Thread verdicts** (judged by shape: steps/choices measured; text sampled, not all read):

| Thread(s) | Verdict |
|---|---|
| `leak`, `kongo`, `zamorin`, `prester`, `sofala`, `count`, `galeao`, `caravel` (4-7 steps, 9-20 choices, the real stories) | **KEEP and port**, most intact. These have places, people and choices. |
| `nome`, `ficheiro`, `roteiro`, `escudeiro` (origin threads) | **REWORK** as the backstory arc of each origin, each written to read and write companions and Patrons, not to end in one sentence. |
| `adrift`, `pesos`, `padrao`, `mercador` (2 steps, 4-6 choices, ~90 lines each) | **MERGE into Front texture:** `pesos` -> Gold, `padrao` -> Claim/Rule, `mercador` -> Crescent, `adrift` -> Traffic/Barbary. A two-step thread with a gold reward is a storylet, not an arc. |
| `malay` (2 steps, "the one optional push beyond the road") | **REWORK as the Race/Crescent hook or CUT.** It has no state-link. |
| `feverFleet` (2 steps) | **MERGE into company crises** (the dying fleet ship is a companion's moment). |
| `feitorCalecute`, `mappila`, `pepperRace`, `monsoon`, `aprendiz` | **KEEP, tie to Fronts** (Crescent, Rule, Race, Company). |
| `pepperHouse` (1 step, 2 choices) | **CUT as a thread.** It is a Casa contract menu: it belongs on the Houses screen. |
| `kingsOffer` (1 step, 4 choices) | **REWORK** into ending *evaluation* (Pillar 6): the offers depend on which patron you stand with and what Fronts are at; the choice is the last of many, not a menu. |

**Interconnection.** Everything reads and writes qualities, which are the Ledger plus the state of Pillars 1-3, 5, 6.

**Builds on / replaces.** `quests.ts` (`QuestDef`, `offersAt`, `dueScene`, `callbackAt`, `LATE_ENDINGS`, `rumoursHeard`), `crown.ts` objectives for generated orders. Keeps `scene()`, `go()`, `end()` helpers as authoring sugar.

**Size.** L, but staged as **dual-run**: Stage 0 introduces the quality store alongside the existing threads; 5 threads begin writing qualities, 3 read them; port one thread per week thereafter.

---

### Pillar 5 — The Places (ports with people, calendars and memory)

**Core.** Concentrate. Of 52 ports, **14 become Deep ports** on the road (Lisboa, Lagos, Funchal, Las Palmas, Arguim, Mina, Mpinda, Benguela, Moçambique, Quíloa/Sofala, Melinde, Calecute, Cochim, plus Goa/Cananor when the era arrives). The other 38 become **Stops** generated from a template (water, a market, a rumour, a danger): honest, cheap, not pretending.

A Deep port has:
- **A Patron**: a named person (factor, shaikh's secretary, pilot-guild master, friar), with a **relationship track** (stranger, acquaintance, trusted, partner) built from the Ledger and visits, with perks (credit, rumour, pilot candidates, Houses cheaper, hosting) and a **personal arc** when trust is deep (a problem that becomes a storylet).
- **Quarters** that are *what you do there*: *Waterfront* (shore leave, hands' regard, desertion/marriage), *Tavern* (rumours, recruits, crimp), *Yard*, *Market*, *Fort/Court* (the Power layer: audiences, pieces), *Faith* (church, mosque, temple, mission), each showing the state of the Fronts here.
- **A calendar:** festivals, fever season, monsoon fair, Lent, the arrival of the fleet. The port you come back to in March is not the port you left in October. (This is also how a one-road game earns its return visits.)
- **A memory:** Ledger tags with this place as `place` generalise `callbackAt` into dialogue lines and price effects (already half-there: `Relations.local` ±0.6).

**On the spine.** The road is walked many times; a career is round trips (outward in the right season, home with the pepper). v2 depends on this reading: the spine forbids *story-driven* backtracking (a clue/letter/reward behind you); it does not and cannot forbid revisiting the same ports on the next voyage, which the Carreira *is*. I flag this as a **reinterpretation** (not a change): DESIGN.md should say so in a sentence so no future thread is built as a "come back to X for the third beat".

**Interconnection.** (1) **Powers**: the Quarters show Front state, and embargoes close the Market. (2) **Company**: Tavern gives candidates; Waterfront is where hands are lost and found; companions have private storylets here. (3) **Web**: storylets are anchored to Quarters. (4) **Captain**: titles change the Patron's greeting. (5) **Economy (Gameplay)**: specialties (Mina's gold weighing; Melinde's pilot guild; Funchal's sugar credit) are services only available there.

**Builds on / replaces.** `portCharacter.ts` (17 entries: signature, duty, danger become part of Quarters), `portView.ts` (1,971 lines; the tab sprawl is the DA's complaint: Quarters are a *navigation reduction*: 6 verbs instead of 7 tabs). **Cuts:** the goods-delivery `PortQuest` (duplicates charters), 38 hand-flavoured port blurbs.

**Size.** M-L. Stage by one Deep port end to end (Mina), then Arguim, then the rest.

---

### Pillar 6 — Patronage and Dynasty (home politics and the career as a line)

**Core loop (patronage).** The King is not the only patron. Each voyage the player sails for a **Patron of record**: the **Crown** (orders, renown, the cartaz), the **Order of Christ / the Church** (mission funds, baptism policy, Prester), or **the Rua Nova money** (Genoese/Florentine/converso credit, Lines). Each issues *generated orders* (replacing `crown.patent`/`ACT_CHARGE` and `casa.ts` meter), takes a cut, and has an **agenda that moves with the Court Front** (a favourite falls, a patron is arrested in 1483, a converso patron faces the 1496-97 Edict, the King dies in 1495 and the new one has favourites). The player chooses which obligations he accepts; a patron he betrays may ruin him; a patron who falls pulls his clients down unless he moves early.

**Dynasty.** `Game.inheritFrom` already carries purse, renown, chart, rutter and stations to an heir. Promote it from "continue" to **the structure of the career**: 2-3 lives of ~12-15 years across ~1482-1520s, because the era's decisive consequences (Traffic stage 3, the Rule, Cabral, Diu) fall *after* a single career.
- The **heir** is a person (name, conviction chosen *with* the inherited one in view; may repudiate), and **inherits the world**: Front stages persist, the Ledger decays (older than 8 years fades), Patrons transfer as obligations, titles dilute.
- **Companions age, die and are succeeded:** the old pilot's apprentice (a promoted hand) is the new pilot; a freed companion's child may be the new Língua; a companion you wronged remains an enemy, or a ruler.
- **Endings** are assembled from state, not chosen from a menu: the King's Offer becomes a final evaluation of Patron favour, Fronts and Ledger, producing a small set of authored endings per generation (lordship, command, exile, the Book, the repudiation) and the Two Chronicles.

**Interconnection.** (1) **Ledger** (decay and inheritance). (2) **Powers** (Court front is the patron engine; Fronts persist). (3) **Company** (succession). (4) **Captain** (conviction repudiated or kept). (5) **Places** (Patrons in Lisbon and Funchal). (6) **Economy** (Houses/Lines pass on; Lines under a patron).

**Builds on / replaces.** `crown.ts` patents, `casa.ts`, `estate.ts`, `kingsOffer`, `Game.inheritFrom`, `epilogueView.ts`. **Cuts:** `estate.ts` passive investments and the land/house meters; the single-King commission string; the pure-score epilogue.

**Size.** M for the patron layer; M for dynasty (builds on `inheritFrom`).

---

## 5. Interconnection matrix (target)

Cell = how the row feeds the column. **Bold** cells are load-bearing: the target fails without them.

| Feeds → / From ↓ | Ledger | Captain | Company | Powers | Web | Places | Patronage/Dynasty |
|---|---|---|---|---|---|---|---|
| **Ledger** | — | titles from tags | **approval table** | **delta table** | **qualities** | memory per place | decay at hand-off |
| **Captain** | writes entries | — | conviction vs companions | titles change Attitude | **options gated by skills/titles** | Patron greeting | repudiate/keep |
| **Company** | **hand.died, companion.* tags** | conflicts test conviction | — | back-channel to polities | **companion arcs = storylets** | shore leave, recruits | succession of crew |
| **Powers** | news entries | reputation distorted by word | peoples judge | — | **stage unlocks storylets** | **Quarters show state** | **Court front drives patrons** |
| **Web** | **writes tags** | builds titles | moves approval | moves Fronts | — | anchored to Quarters | ending evaluation |
| **Places** | place-tagged memory | Patron by title | candidates | embargo/market state | **people to speak to** | — | Lisbon/Funchal patrons |
| **Patronage/Dynasty** | inheritance | heir creation | roster continuity | Court front input | orders as generated storylets | home patrons | — |

### Where I need Gameplay's systems (alignment with `v2-gameplay.md`, not yet written when I finished; to be reconciled)

I read the v1 `gameplay.md` and `devils-advocate.md` and align to them; I will diff against `v2-gameplay.md` when it lands and revise this section.

1. **Economy → Powers.** Needs: prices, gluts and charters to accept *political multipliers* (embargo, war, cartaz status, Front stage) via one function `marketModifiers(port, t)`; and Houses/Lines to be exposed to Power state (risk of capture, tolls). I own the state; they own how it turns into numbers. Charters and `PortQuest` merge into one Opportunities generator whose inputs are theirs (prices) and mine (events).
2. **Encounters/Prizes → Ledger and Rule.** Their "terms" model (refuse, parley, run) and prize crews/ransom (v1 gameplay P8, P3's rescue) emit Ledger entries and read Rule stage; strangers get `master, owner, passengers, flag-people` (I specify, they implement in `hailing.ts`/`encounter.ts`). We agree on one `Stranger` schema.
3. **Leg Report (P1) = Ledger view.** One schema, two views; same voice (the escrivão, Correia).
4. **Wreck Chain (P3) = company crisis.** A wreck is the worst day for the party; I author the rescue beats and the roll of the lost; they own the survival ledger.
5. **Consorts (P5) = promoted hands.** Consort captains are companions/promoted hands with loyalty; a consort captain who disagrees with an order is a Company crisis.
6. **Lay-up/Manning (P4, P9) = Places.** Wintering and manning from the road happen in Quarters (Waterfront, Tavern).
7. **Leg-level stakes.** The DA's complaint (no visible stakes on a leg) is answered partly from my side: rumours make *where you go* a risk-weighted decision, and the party's approval makes *how* you sail a character question.

---

## 6. What this CUTS (net deletions, per G2)

- Five single-button act openers/closers as drivers (`chronicle.ts`), keeping the history clock.
- `PortQuest` goods errands (`portCharacter.ts`); `ventures.ts` as a standalone system.
- `estate.ts` passive investments; the Casa regard as a standalone meter.
- Random-hire officers with no story (`officers.ts` generator).
- `rival.frontierLat` model, `LATE_ENDINGS` / `originEnding` / `callbackAt` / marks as four separate memories (now one Ledger).
- Threads: `pepperHouse` (cut), `kingsOffer` (replaced by evaluation), `malay` (rework or cut), `adrift`/`pesos`/`padrao`/`mercador`/`feverFleet` (merged into Front texture).
- 38 hand-written port blurbs (generated Stops).
- Adding no tab; Quarters reduce portView's tab sprawl.

Net: more state, fewer systems.

---

## 7. How the moral weight shows up as systems (not text)

- **The Traffic is a Front** with stages the player lives in, a baseline he cannot stop, small levers he can pull at cost, an economy that rewards complicity, and companions who judge it differently.
- **The Rule is a Front the player authors**, felt in dhow masters who recur, in word that runs ahead, and in the pepper price the Crescent moves.
- **African, Swahili, Arab, Malabari and Indian polities are Powers**, with intents, means, relations and moves, not reaction scripts; they can trade with you, use you, refuse you, break with you; some of them are *in* the Traffic and the Front shows it.
- **Companions from those peoples** hold the player to account in the mechanics (access, approval, exits) as well as in dialogue.
- **The Ledger records, the Chronicles remember.** No karma meter; the epilogue prints names and counts.
- **The heir lives in it.** The strongest moral statement the game can make is structural: the world your grandfather's choices produced is the one you now sail in.

Source discipline stays (DESIGN.md A6 style): every dated or attributed event gets an A7 source note; invented specifics are marked.

---

## 8. Roadmap (each stage shippable on its own)

| Stage | Contents | Why here | Size |
|---|---|---|---|
| **0. Foundation** | Ledger + tags + Captain's Book view; quality store (dual-run with current threads); captain name + Conviction at start; Two Chronicles epilogue built from the Ledger; delete the act-closer one-buttons (convert to two-panel scenes); a headless "dead-tag" check | Everything reads it; improves every run immediately; cheapest high-value | M |
| **1. Company** | Approval tables for the 6 existing arcs; arcs for Escrivão and Língua; counsel conflicts between companions; promotion of hands to mate; the first non-Portuguese companion end to end (Language and a region gate) | Biggest emotional lever per line of code; pillars 2 and 1 needed for any other story to land | M-L |
| **2. The first Front** | The Traffic Front at Arguim to Mina to Mpinda: 4 stages, rumours, 10 storylets, Kongo split, companions' reactions, epilogue | Proves Powers + Web + Company + Ledger together on one stretch of road | L |
| **3. Powers tick** | Swahili coast (Kilwa/Melinde/Mombasa) and Malabar (Calicut/Cochin/Kolathiri) using existing `allies`/`feuds`; the Rule front; strangers as people (with Gameplay) | The Act IV-V content that now has a world under it | L |
| **4. Places** | Deep ports one at a time: Mina, Arguim, Melinde, Calecute, Lisbon; Patrons; Quarters replacing tab sprawl | Return value; makes the map memorable | M-L |
| **5. Web migration** | Port the remaining threads; merge/cut per verdict table | Mop-up, once the engine and state exist | M |
| **6. Patronage and Dynasty** | Patron layer; Court front; heir hand-off with Front persistence; assembled endings | The career-scale structure and the strongest ending | M |

Dependencies: 1 needs 0 (Ledger); 2 needs 0, 1; 3 needs 2; 4 and 5 run in parallel after 3; 6 last. **A minimum viable "different game" is stages 0-2** (a named captain with a conviction, a party that judges him, and one living moral Front on the Guinea road).

### Risks and my answers

- **Scope (G8).** Mostly authored text and data on rails that exist. No unique art. Each stage is cut so that the game ships after it.
- **Opaque systems (G4, DA 9).** Every Ledger entry prints one line of cause and effect; Front stages are shown; rumours show source and age. A system that cannot be summarised in one line is not shipped.
- **Verification (G9).** Each stage has a falsifying headless script (dead tags, Front distribution over 200 seeds, road-order check for every storylet, approval table closure, Ledger/save round-trip).
- **The spine (G1).** Preserved as "no story-driven backtracking"; revisits of ports on the next voyage are explicitly allowed (flagged above as a reinterpretation to be written into DESIGN.md).
- **Save compatibility (G7).** The Ledger and qualities are additive; dual-run means old saves load with an empty Ledger and the old threads continue.

---

## 9. Alignment notes (read after drafting)

`v2-gameplay.md` did not exist when this was finished; I read `v2-devils-advocate.md`, which ranks missing pillars A-H. Mapping, so the three docs do not duplicate:

- **DA C (politics/faction sim) = my Pillar 3.** Same idea; I add Fronts (clocks that change the world), the rumour mill and the moral Fronts. I own the state and event generation; whoever owns the economy plugs prices into it through `marketModifiers(port, t)`.
- **DA B (living economy)** is a Gameplay-side system that Pillar 3 needs as a consumer and a producer: its ports that "produce and consume" are what an embargo, a war or the Traffic's stage 3 (sugar glut) act on. Needed from them: a per-port supply/demand state that can be shocked by name.
- **DA E (multiple career paths)** is covered without a new system: Convictions (Pillar 1) x Patron of record (Pillar 6) give merchant house (Rua Nova), Crown captain (Crown), mission captain (Order/Church), privateer (Free Hand), explorer (Curiosity). The win states are the assembled endings in Pillar 6.
- **DA F + G (strategic layer, officers command)** = Pillar 2's promotion pipeline (hand to mate to factor, Line master, consort captain). One roster, one loyalty model; I author who they are, Gameplay builds the commands and the fleet use (the finished `fleet/formation.ts` engine has no Carreira use today: consorts are its first).
- **DA A (encounters with depth)** is the Gameplay designer's; my requirements on it are the `Stranger` schema (master, owner, passengers, people), terms (parley, search, ransom, stop under the Rule) and Ledger emission.
- **DA's cuts** (finance to one instrument, Xiyang out of the bundle) are compatible; I add the cuts in section 6.
- **Disagreement to settle:** DA calls the diplomacy pieces "sidecars" and suggests they stay modal minigames. I agree they have been sidecars *because only threads call them*; in this design a Power's situation (an embargo, a succession, a hostage) calls the piece, and its marks/Ledger entries change a Front. That is the cheapest way to make twelve finished pieces matter. If Gameplay wants fewer, I would keep Silent Trade, Gift Table, the Case, Go-Between, Envoy, Informer, Refusal and Hostage's Letters, and fold Meal/Hall into the Gift Table.
