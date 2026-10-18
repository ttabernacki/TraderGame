# Story design pass: Carreira da Índia

Author: Story designer. Scope: narrative, characters, moral weight, career arc. The Ming/Zheng He campaign is shelved and ignored. Nothing here is built; every proposal names the real files it would touch and holds to the one-road spine (`docs/DESIGN.md`): news comes to the captain, nothing is fetched from behind him, waits are paid by the voyage.

Confidence note: I read `DESIGN.md`, `ROADMAP.md`, `road.ts`, all of `chronicle.ts`'s acts and the opening of its history, the officer/arc/hands/rival/origin/barks/marks/courts/hailing code, the epilogue view, and a sample of `quests.ts` (3,858 lines; I read the Mannikongo's Embassy, Gold of Çofala, Count, Zamorin, and King's Offer in full and skimmed the rest). Where I say "does not exist" I grepped for it.

---

## 1. Honest assessment of the narrative as built

### What is genuinely good (keep, do not touch)

- **The voice.** Dry, concrete, quarterdeck-level, never purple. "He has written the first one in, scratched it out, written the second, and gone below without saying anything to anybody" (Correia arc) and "I have counted the gold twice. It has never once been less than I was told, and never more" (Mina bark) are the house style and it is a good one: understatement that lets the reader do the feeling. Everything I propose should be written in it.
- **Specific, deniable cruelty of institutions.** The Count (forty quintals under the spare sails, the clerk standing very still), the Casa's watch on a New Christian, the factor "only saying". The game already knows that the Carreira's evil is paperwork and appetite, not villainy.
- **The company.** Seven officer arcs with bonds that change numbers, eight named hands with their own `regard`, mutinies with sides. This is the best-realised emotional layer in the game: people who remember what you did.
- **Courts as people.** Marks with `echo` lines, felt in regard, House prices and gating; the Book of Courtesies; the Kilwa vizier who wants a promise the King may not thank you for. The diplomacy layer treats Kilwa, Calicut, Kongo as polities with interests, which is the right baseline.
- **Origins with a private thread and an ending** (`originEnding`). The captain has a *why*.

### Where it falls short

1. **The central story is a triumph with no cost on the other side.** The five acts are one shape repeated: the King wants X, you reach X, he is moved, you get gold and renown, one button ("Ask to be sent south", "Ask for the Indies"). The act closings are single-choice scenes: they are cutscenes in a game whose strength is choice. The King is wise and generous throughout. The epilogue lede says: "Nobody in this country will ever again have to buy an eastern spice from a man who bought it from a man who bought it in Alexandria. That is what the voyage was for." That sentence is the game's thesis, and nothing in the game ever argues with it. The Mamluk, Gujarati, Kilwan, Mappila merchants who *were* the man who bought it from the man are, in the epilogue's grammar, an inefficiency removed.
2. **Slavery is close to absent.** I grepped. It is one escrivão bark at Arguim ("gum and slaves and whatever the Azenegue choose to sell"), two polity blurbs (Jolof, the Mali horse-for-captives line), a lead-type word, and a line about Madagascar. The goods list has no people, no scene has a captive, the Guinea run that Act I celebrates *was* in large part this trade, and São Tomé (named in passage decisions) was the sugar-and-forced-labour experiment. A game that prints the line "the garrison's gold is gum and slaves" and then lets the player run the Arguim market for hours without once being asked about it is not neutral; it is looking away in the Portuguese voice's own idiom, and unlike the voice, the game does not know it is doing so.
3. **Conquest is one dialogue option.** The only "bombarded the town" is a Zamorin branch. The Kilwa/Mombasa/Moçambique reality (a seaborne empire built on cannon and the cartaz licence) has no moment. Boarding in `hailing.ts` is bloodless and anonymous: "carried in about four minutes", nations are European and Barbary. There are no dhows with pilgrims, no nakhudas, no Mappila shipowners as people on the water.
4. **Non-Portuguese characters are single-use.** Yusuf of Kilwa, Hasan ibn Salim, the Mani Soyo, the Gujarati pilot: each is a good scene, then gone. The Portuguese cast persists for a whole career (officers, rival, hands); the people the career is *about* do not. This is the single biggest source of the "tourist" feel.
5. **Stakes are mechanical, not personal.** Men die as integers or as the eight named hands, but nobody is *waiting*. There is no home. Estate, Casa, Rua Nova are money-politics. A career is eight to thirteen years away from Lisbon and the game never lets that cost anything emotional.
6. **Act V and the King's Offer are about the captain, not the world.** Armada / lordship / gold / "just the ship" is a good retirement scene, but it is the fourth time the player is asked what *he* wants. The armada branch, the one that should decide what Portugal does in the East, is a flag and a line of epilogue.
7. **Consequences print, they do not carry.** `lateEndings` and `originEnding` are one sentence each. A choice at Calecute does not change what the Act V voyage meets at Calecute in a way the player must live through.
8. **Nothing is irreversible except death.** No door closes. Marks fade or are bought back. A game with this much craft needs two or three things the player can never undo and will remember.

The net feel across a career: *competence, wry fatalism, mild awe*, with a warm-gold close. What is missing is **complicity, intimacy, and loss.** Those three words are the brief for everything below.

### Principles for the moral material (applies to every proposal)

- **No karma meter, no good/evil bar.** A ledger of *what happened to whom*, in names and numbers, read back at the end. The game does not grade; it remembers.
- **The system is bigger than the player.** Refusing the slave cargo costs the player margin and does not stop the trade (the rival, the Casa's next captain, the African and Swahili and Arab traders who were already doing it). That is *why* it is a moral problem and not a puzzle. Never write the refusal as a clean win.
- **Other polities act on their own interests.** Kongo wants iron, letters and a counterweight to its neighbours; Kilwa wants its gold tithe; the Zamorin wants revenue and neutral ports; Benin controls what it sells. They scheme, ally, and get hurt for reasons that are not the player. (Per the standing source discipline in `DESIGN.md`: a source pass, "A7", before anything is stated as fact; invented specifics are marked as such, as A6 did.)
- **Dignity is in the specifics.** Names, trades, grievances, a joke, a pilot's competence. Never "the natives". Never a Muslim character whose only function is hostility; the hostility at Calicut was a trade rivalry with real stakes and the game should say so.
- **The camera does not linger on atrocity.** Show the aftermath and the ledger line, not the spectacle. Brevity is respect.
- **The Portuguese voice stays Portuguese.** Narration is in the quarterdeck idiom; the *other chronicles* (proposal 1) are in theirs, and the contrast is the point.

---

## 2. Proposals, ranked by impact over effort

Build sizes: S = days, M = a week or two of content+code, L = multi-week. "Spine" states how it respects the one road.

### 1. Two Chronicles (and the Ledger behind them) — S/M — **do first**

**Beat/theme.** The thesis of the game is argued with. At the end, and at each act's close, the player reads what Portugal wrote of the voyage, and then what the others wrote.

**How it plays.** From the first day the game keeps a **Ledger of deeds**: a plain append-only list of consequential acts with who they touched (crew died and why, cargoes carried, people carried, prizes taken and what was aboard, promises made and broken, towns bombarded or spared, polities helped, hostages, refusals). Most of this data already exists as marks, agreements, `seaRecord`, hand deaths, quest outcomes; the work is giving it one sink and a voice. The act closings gain a second panel after the King's praise: the same period, as someone else would have it. The epilogue replaces its single triumphant lede with a two-column reading: the Casa's chronicler and the other side's.

Sample, Act I close (after the King's "go and write me one"):

> *The Chronicle of the Castle of Mina, by the Casa da Índia's scribe:* "...and the King's captain delivered the gold of the coast to the scale, and the scale was true."
> *What was said at Edina that season, as kept by the elders of the town:* "The strangers arrived with stone already cut and numbered. They asked politely for a hill that was not empty." (invented in the spirit of the sources; marked as such)

Sample, epilogue, for a captain who ran a clean career in Kilwa but took the Calecute Rule (proposal 6):

> *In Lisbon it was written that the road to the Indies was opened.* *At Kilwa, in the book of the sultans, a later hand wrote that in the year of the Franks' first cannon the tithe stopped being paid to anyone who could be asked about it.* (invented; marked)

Each polity gets 3-5 chronicle fragments keyed to marks and thread outcomes, in a register that fits the real genre where it exists: the *Kitab al-Sulwa* (Kilwa Chronicle) cadence; the *Keralolpathi* tone for Malabar; Kongo letters; Portuguese chroniclers (Barros, Pina) for the crown. All marked as inventions in the manner of the A6 source note.

**Characters/factions.** Every met polity in `diplomacy/polities.ts`; the Casa (`casa.ts`); the Crown.

**Touches.** `src/ui/epilogueView.ts` (lede and two-column card), `src/progression/chronicle.ts` (act closings gain `otherSide(g)`), `src/diplomacy/marks.ts` (`echo`-style `chronicle` text per mark key), `src/diplomacy/courts.ts` (per-polity fragment lookup), `src/progression/quests.ts` (`LATE_ENDINGS`, `originEnding` gain a counterpart), `src/game/save.ts` (new `deeds` array round-trips), new `src/progression/ledger.ts`.

**Spine.** Pure presentation of what already happened. Triggers are at the act dispatch and the epilogue; nothing requires a port.

**Why first.** It is cheap, it multiplies the value of everything else (every later proposal writes a ledger line and a fragment), and it fixes the thesis problem by itself.

---

### 2. Letters from the Tagus — M

**Beat/theme.** Absence has a cost. Someone is waiting, and the years happen to them without you.

**How it plays.** One **correspondent** per career, set by origin (`origins.ts`): the second son's mother; the converso's sister, who keeps the books at the house on the Rua Nova; the pilot's wife; the fidalgo's disapproving uncle. News comes to the captain, in the DESIGN.md manner, on the Casa's dispatch, at the next Portuguese port or House, in batches, always stale. The player answers by choosing a tone and one concrete thing (send money; promise a return date; confess; lie). Replies arrive on later dispatches; what they *say* depends on what the captain did, and on what he promised.

Sample (after eleven months, at Mina, tropics, fever season):

> *Your brother has let the north field. I am not telling you to come home. The girl from Alvor has had a boy; she says he is not yours; the whole street says he has your chin. I light the candle on Fridays and do not know what for. M.*
> — Answer: *Send forty cruzados and say nothing.* / *Write that he is mine.* / *Write nothing; there is a ship leaving.*

A promise ("I will be home for the feast of Saint James") is a thing the Ledger remembers and the ship's clock will probably break. Break it and the next letter is shorter. The letters are also where the world reaches the captain: the 1496-97 edict (proposal 8) is *felt* here before it is read in a court scene.

The epilogue then resolves who is at the quay. Not a score: a short list.

**Characters.** The correspondent (4 variants, each ~12 letters of authored text, ~6 reply branches); the `estate.ts` household; the converso sister doubles as the carrier of the Edict.

**Touches.** `src/progression/origins.ts` (correspondent per origin), new `src/progression/letters.ts` (a dispatch-delivered scene series on the same rails as `chronicle.dispatch`), `src/progression/estate.ts` (holdings gain a person), `src/game/seaEvents.ts`, `src/ui/epilogueView.ts`, `src/game/save.ts`.

**Spine.** News arrives at whatever Portuguese port or House the captain next makes (exactly the existing dispatch rule); replies go out with the next Casa bag. No sailing home to resolve anything.

---

### 3. The Other Cargo — L (staged; first slice is S/M)

**Beat/theme.** Complicity. The Guinea run that Act I calls "the gold of Mina" is a machine that also runs on people, and the game stops looking away.

**How it plays: not a trade good with a slider.** Four design commitments:

1. **It enters through the economy the player already depends on, not through a menu.** At Arguim the factor offers a better rate on gum and gold if the ship will carry a "parcel of resgatados" (the period's euphemism: *resgate*, ransom or redemption) to Lisbon or on to Mina. At Mina, the castle's factor pays the gold price in part against people brought from the Benin shore (this exchange is documented for the Mina trade from the later 15th century; to be confirmed in the A7 source pass). The Casa's commission letters assume the arrangement exists. The first time you meet it, you did not choose to go looking.
2. **People are specific.** The first parcels are *named*: three or four people with a single known fact each (a weaver; a boy of about ten who has already been sold twice; a woman from the Wolof coast who speaks to the hands and is understood by no one). The rest of the parcel is a count the escrivão keeps, and it is the escrivão's voice that carries the weight: *"Forty-one, sir. I have written forty-one. The Casa will want to know whether that is the number at Arguim or the number at Lisbon."*
3. **Mortality aboard is the surgeon's problem and the player's.** Water, space and the mortality curve in `crew.ts` apply. Mestre Dinis's arc (`arcs.ts`, "What to do with the book") and Padre Anselmo's ("A faith with books in it") gain beats that run through this cargo. The Gaspar Vaz arc (the condemned man, *degredado*) is the mirror: a man sentenced to the voyage, who has opinions about being cargo.
4. **Refusal is real, costly, and does not end it.** Carry nothing: you lose the margin, the factor's regard, the Casa's goodwill (a mark); the rival, or the next ship, carries them. *Redeem*: the Church's own logic of *resgate* can be turned: you can pay for freedom of named people at Arguim, a cost in gold and standing that the game treats as real and insufficient. *Contest*: at Mpinda, the Mani Soyo and the Manikongo ask what becomes of the ones who leave; the player can carry the Kongo letter (proposal 4). *Conceal / lie*: to the Casa, to the chaplain. The Ledger records all four.

**Dignity and agency.** The Azenegue, Jolof, Kaabu, Benin, Kongo, the Gold Coast kingdoms are not victims-by-default: they sell, they refuse, they set terms (Jolof's horse-for-captives economy is already in `polities.ts`), they send embassies and complain. Their regard shifts by what the player does (`feelMark`); Kongo marks in particular gate the Manikongo's Embassy outcome. The point of the scene is not that Africans suffered *at the hand of the player*; it is that the player is inside a system with Portuguese, African, and Arab hands in it, and cannot exit it by being tidy.

**Handled with seriousness.** No jokes at the point of sale; no bar to fill; no achievement for "freeing" anyone. The stealth-cargo option (the Count, but for people) exists because the Count already exists. The numbers the epilogue prints are a count, with the named few, in the same type size as the crew's dead.

**Touches.** `src/economy/goods.ts` and `economy/trade.ts` (a separate non-market *parcel* ledger, deliberately not a good with a price chart), `src/progression/casa.ts` (commission letters), `src/progression/quests.ts` (new `resgate` thread: Arguim → Mina → Mpinda, three beats, road order), `src/progression/arcs.ts` (Dinis, Anselmo, Gaspar beats), `src/diplomacy/polities.ts` (stance toward each seller), `src/progression/barks.ts` (the escrivão), `src/progression/livingFactory.ts` (a House at Arguim/Mina will take the parcel on its own if the posture says so: the player's passive complicity, with a ledger line each month), `src/progression/ledger.ts` (proposal 1).

**Spine.** The thread runs Arguim → Mina → Mpinda, in road order. People carried are delivered at the next Portuguese port on the way (Lagos/Lisbon, São Tomé), never fetched back.

**Staging.** Slice 1 (S/M): the Arguim and Mina offers, the escrivão line, ledger entries, the epilogue count. Slice 2: named people and the Dinis/Anselmo/Gaspar beats. Slice 3: the redeem and contest branches, the House passive-participation line, polity echoes.

**Source pass first (A7).** The scale, the dates for São Tomé's plantations (settled 1486-93, the real plantation scale being 16th century), Benin's controls on exports, the Church's use of *resgate*: all stated in `DESIGN.md` style as checked, with inventions marked.

---

### 4. The Companion — M

**Beat/theme.** Someone from the other side of the story stands next to the captain for the whole road. The interpreter is the person on whom every audience depends, and the person with the most to lose.

**How it plays.** One persistent character fills the existing `lingua` officer slot (the `linguist` piece and the languages field already exist) and does not die when a thread ends. *How the captain came by them is chosen by what he did earlier*, which is the point: there are four entry paths, one per route the road already offers:

- A **hostage** left with the ship by the Mani Soyo as a guarantee of the Embassy (the existing `hostage` piece, whose letters are carried by the clock): a young Kongo noble, literate by the end.
- A **captive** taken from the Arguim/Mina trade (proposal 3): someone who has been sold twice and learned three languages doing it.
- A **free pilot** from the Swahili coast (extend the Hasan ibn Salim thread, A Passenger for Melinde): an adult with his own boat and his own opinions about you.
- A **convert-interpreter** raised in Lisbon by the Crown's own practice of bringing Africans to learn Portuguese and sending them back as *línguas*: neither one thing nor the other.

The Companion has a thread across the whole road with a beat at each cultural frontier, written *from his side*. He translates Kongo to Portuguese at Mpinda and hears himself described; he translates Kilwa's vizier and decides what to soften; at Calecute he is asked by a Mappila merchant, in his own language, whose side he is on.

Sample (Calecute, after the audience):

> *Sambu has stopped translating. The merchant is still speaking, quietly, and Sambu is looking at the floor of the courtyard. "He says," Sambu says, "he says that he knows what you are. He says there was a man like you at Quilon, once, and then a ship with men like me." He looks up. "I did not tell him that part, Captain. I thought you should hear it from me first."* (invented; name a placeholder)

The Companion's choices carry into the end: at Lisbon, the player decides what is owed. He can be freed with papers and paid; given a ship's share and a place; kept; or, if the player has been careless over the whole road, he can simply be gone (an arc that ends badly is already a supported state in `arcs.ts: breakArc`). None of these is a reward button. Each is a conversation, and the Companion answers in his own voice. His chronicle fragment (proposal 1) is the last page of the epilogue.

**Mechanical effect.** Replaces the generic `lingua`'s bonus with a bond (`BONDS`) whose strength depends on how the player treated him: the "tongue of the coast" bond exists; this one is earned, not hired.

**Touches.** `src/crew/crew.ts` (officer with `companion` flag, cannot be dismissed with a click), `src/progression/arcs.ts` (a new arc with four entry beats), `src/diplomacy/pieces/linguist.ts` and `hostage.ts` (play the Companion's own line in the piece), `src/progression/quests.ts` (Hasan ibn Salim thread, Embassy), `src/progression/barks.ts`, `src/progression/officers.ts`, `src/ui/epilogueView.ts`.

**Spine.** He is *on the ship*. Every beat happens where the ship is. Nothing sends the ship back for him.

**Risk.** This is the most delicate character in the game: a person whose position is not freely chosen, written by people who are not him. Mitigation: authored with explicit consultation of the surviving first-person sources (the Kongo letters, Swahili and Malabari accounts), the Companion is never the instrument of the player's redemption, and he is allowed to be angry, ambitious, funny and wrong.

---

### 5. The Prize Has Passengers, and the Word Runs Ahead — M

**Beat/theme.** The ocean you are entering is already full of people with ships, and they talk to each other faster than you sail.

**How it plays.** From Act III onward, **strangers in the Indian Ocean are people.** Extend `encounter.ts` `Stranger` beyond European/Barbary nations to dhows, Gujarati and Mappila merchantmen, Kilwan and Melinde coasters, with a *master with a name, a cargo with an owner, passengers*. The boarding in `hailing.ts` (`takeHer`) stays bloody-minded and brief but stops being anonymous: you find the cargo, and you find who is aboard. A haj-bound ship of merchants' families. A pilot you spoke to at Melinde. A nakhuda who has paid the Zamorin's licence.

The decision: take her (profit, crew regard rising, `bold` hands cheering), ransom, search and release, or let her pass. Each costs what it costs. Each writes a mark. And the **word runs ahead**: `diplomacy/courts.ts` already has `word: WordItem[]`, news that reaches a court before the ship; so a ship sunk off Moçambique is a fact at Melinde in a month and at Calecute in three. The Zamorin's court, the Kolathiri, Gujarat's factors, each hear it in their own idiom, and the next audience *opens with it*, in the vizier's or the merchant's mouth, before the player says a word.

The recurring-faces rule (from the assessment): **people the player met earlier appear further down the road.** The Gujarati pilot from Melinde is, in Act V, the master of a dhow on the Malabar approach. The player stops her or does not. He remembers.

Sample line (the master, from the rail, after being stopped):

> "You were at Melinde. You sat at my table. I do not say you owe me a table, Captain. I say that the Zamorin's factor will ask me tomorrow who stopped my ship, and I would like to give him a name I do not have to hate."

**Characters/factions.** The Mappila merchants of Calicut (a deliberately different register from the Gujarati; the game has both), Melinde's court (the ally with its own agenda against Mombasa), Kilwa (a sea power losing ground), the Zamorin.

**Touches.** `src/game/encounter.ts` (extend `Stranger`/`NATION_PEOPLE`), `src/game/hailing.ts` (`takeHer` loses its anonymity; new "search and release", "ransom" branches), `src/diplomacy/courts.ts` (`word`), `src/diplomacy/marks.ts`, `src/progression/rivalEvents.ts` (the rival does the opposite, visibly), `src/crew/hands.ts` (`TEMPER` reactions: `devout`, `bold`, `sly`), `src/progression/ledger.ts`.

**Spine.** Encounters occur on the road; word travels ahead of the ship, down the road, to the next court.

---

### 6. What You Did at Calecute Becomes the Rule — M/L

**Beat/theme.** Precedent. The captain's early conduct hardens into policy, and the policy is what the next generation lives in.

**How it plays.** Today Act V is "bring a hundred quintals" and the East is a set of independent quest outcomes. Reframe Act V's opening so that **the King's Regimento is written from what the captain did in Act IV.** If he opened the pepper trade by gift and patience at Calecute (the `pepper` thread), the Regimento is a trading-posts charter. If he bombarded, it is a fortress charter. If he left Cochim an ally and the Zamorin an enemy, the armada is told which side of Malabar it is on. The sealed orders are opened *at the Cape on the outward leg* (already a place on the road with a bark and a decision slot) and they are binding unless the captain wants to be a man who disobeyed the Crown.

The central Act V question becomes: **the Cartaz.** The Crown's instruction is that every vessel in these waters carries a Portuguese pass, or is lawful prize. The captain commands part of the armada and must carry out, adapt, or refuse it, port by port, to Melinde (an ally, spared the licence in return for her support), Kilwa (whose gold tithe the licence ends), Mombasa (an enemy of Melinde), Calecute (where the licence is aimed at the Mappila's own ships). Every port has an authored dilemma with real, unequal interests:

> *At Melinde the sultan thanks you for his place under the Crown's protection, and asks, lightly, what protection costs when the Crown's captain in the next port has decided that Mombasa's ships carry no pass. You are, he reminds you, a long way down a road he can see the end of.*

Choices write marks that change the *same* port's later prices, House availability and the Act V voyage's own events (the Armada meets them again). The **armada branch of the King's Offer** stops being a one-liner and becomes the thing the player is accepting: the Rule, with its name on it.

The reveal at the end of Act V: the King's praise, and a second letter from the Casa's clerk, asking for the *Cartaz returns*, a number of ships stopped, a number of men.

**Touches.** `src/progression/chronicle.ts` (Act V opening reads the Act IV history), `src/progression/quests.ts` (new `regimento` thread across Melinde, Mombasa/Quíloa, Calecute, in road order; `feitorcal`, `mappila`, `pepperrace` read its state), `src/diplomacy/courts.ts` (agreements: new kind `cartaz`), `src/diplomacy/marks.ts`, `src/game/hailing.ts` (stopping ships becomes a standing order, per proposal 5), `src/progression/network.ts` (Houses/Lines pay or lose by cartaz status), `src/progression/casa.ts`.

**Spine.** Every beat is at a place further down the road than the last; the sealed orders are opened at the Cape, on the way; the clerk's second letter arrives at the next Portuguese port.

**Historical caution.** The cartaz system was formalised in the first decade of the 1500s, and the game's compressed timeline (the pepper fleet in the 1490s) is already an alternative history. State plainly in the source note that the game's captain *is* the one who sets the precedent; that is the premise, and it is a premise about responsibility.

---

### 7. The Rock at Mina, and the Prince of Jolof — M (Acts I-II rewrite of two beats)

**Beat/theme.** The first time the player meets the world on its terms, not the King's.

**How it plays.** Act I currently opens with the King's cheerful "write me a letter". Replace the *close* of Act I with a scene the player is **in**, not told about. The chroniclers report that when the Portuguese came to build São Jorge da Mina in 1482 the local ruler, whom they call Caramansa (Kwamena Ansah of Eguafo), received them unwillingly and spoke of the cost of friendship on unequal terms. The accounts are Portuguese and the speech is likely shaped by them (the game's source note should say so). Put the player at the table, as the ship's captain who brought the stone, and give them one move: stand with the Portuguese commander, stand apart, or speak (the `Table` engine and the Hall/Refusal pieces exist). It is an audience piece with a mark ("they heard you were not in a hurry"), not a cutscene.

In Act II or III, a second set-piece: **the prince of Jolof**. In history, an exiled Jolof prince (Bemoim) came to Portugal in 1488, was baptised and received honours, and was killed on the voyage home in 1489 by the Portuguese commander sent to restore him. Portuguese and later accounts differ on the details; the game should say so. As a thread: you carry the prince on the outward leg (Lisbon → Arguim, on the road); you are present at the council aboard where the King's promise meets the commander's orders; the player decides whether to stand beside the prince, remain neutral, or carry out the command. The Jolof polity (already in `polities.ts`) remembers. *Both outcomes cost.* If the player protects the prince the commander is not neutral and the Crown is displeased; if the player is silent, the Companion (if aboard) hears it.

**Touches.** `src/progression/chronicle.ts` (Act I close), `src/progression/quests.ts` (new `bemoim` thread, Lisbon → Arguim), `src/diplomacy/pieces/hall.ts`, `refusal.ts`, `polities.ts` (Eguafo, Jolof), `src/progression/barks.ts`.

**Spine.** The prince comes aboard at Lisbon or Lagos and is carried *outward*; the beat is at Arguim; the consequence arrives by word.

---

### 8. The Edict — S/M

**Beat/theme.** The state the captain serves does to its own people what it does abroad, and the same year.

**How it plays.** The dated history already has Columbus, the King's death, the arrival of a converso astronomer, and the yard service "Zacuto's astrolabe". Add the **expulsion and forced conversion of the Jews (1496-97)** as a `HISTORY` event. A scene, a mark, a letter (proposal 2), not a mini-game. The origin-sensitive layer: for the converso origin (`ficheiro`) the Casa's watch tightens, the Florentine and Genoese houses grow wary, and the thread's ending changes; for every origin, a named character the player knows (Zacuto's circle; a House factor; a pilot on the quay) is affected, and the player can do one small, costly thing.

Sample (the dispatch letter):

> *The Genoese have been to the house and want the lease. Our neighbour on the Rua Nova has had water poured over him in the church of São Domingos and now answers to Pedro, and bows to me in the street as to a stranger. Do not write about this in your letters. They are read. — your sister*

The same system that decides what the Casa will tolerate (`isWatched`) is the one that decides who is allowed to be on your ship; a Jewish or New Christian officer aboard (a line in `arcs.ts` for Dinis, whose arc is about forbidden medical knowledge, fits) becomes a risk the captain chooses to carry. The 1506 Lisbon massacre is outside the career's timeframe; note it in the epilogue of a heir.

**Touches.** `src/progression/chronicle.ts` (`HISTORY` entry), `src/progression/origins.ts`, `src/progression/casa.ts`, `src/progression/arcs.ts` (Dinis), `src/progression/letters.ts` (proposal 2), `src/progression/estate.ts`.

**Spine.** Lisbon's news; delivered by dispatch to the port the captain is at.

---

### 9. The Muster Roll — S

**Beat/theme.** The ordinary dead are named.

**How it plays.** The eight named hands (`hands.ts`) already die at the mortality rate. Make each death a short stand-alone log entry written in the escrivão's idiom, with one specific fact about the man (not generic), and a *letter to the family* that the Casa will forward only if the captain writes it, in two lines, at the next Portuguese port. The roll is kept in the Ledger. At the epilogue, the roll is read in order, sailing day to last, as in Álvaro Velho's roteiro (which the epilogue file already cites as its model). It is the shortest and, I expect, the most effective single addition per word.

> *Estêvão, grumete, of Tavira, aged about fifteen. Went over the side at four bells in the morning watch off Cabo Verde. He asked on the second day whether we would see Portugal again before his birthday. I said we would.*

Optionally: when a named hand's family writes (proposal 2), the captain's earlier letter is quoted back in it.

**Touches.** `src/crew/hands.ts` (a `fact` per hand, a `deathLine`), `src/game/state.ts` (`killHands`), `src/ui/epilogueView.ts`, `src/progression/letters.ts`, `src/progression/ledger.ts`.

**Spine.** Letters go on the next Casa bag from any Portuguese port or House.

---

### 10. The Heir Sails Into What You Made — M

**Beat/theme.** Consequences outlive the captain.

**How it plays.** `Game.inheritFrom` already carries renown, purse, chart, rutter and stations. Extend it to carry **the world's memory**: the marks, Ledger entries and Rule (proposal 6) pass to the heir in decaying form. Ports address him as the son/daughter of the captain; Kilwa's vizier begins with what the father promised, Calicut with what the father did. The Companion, if freed and living, may be a guest in the heir's story; the Companion's descendants may be a courtly presence in Kongo. The first beat of the heir's career is a short **inheritance scene**: the heir reads the father's Ledger (the player sees the same page twice, now as someone with a stake in it) and is asked what to do with the Rule: keep it, soften it, or break with it. The heir's career is, in effect, an Act VI: *O Estado*, the empire as a thing the player must live inside, which is more interesting than a second pepper run.

**Touches.** `src/game/state.ts` (`inheritFrom`), `src/diplomacy/marks.ts` (generation decay), `src/progression/chronicle.ts` (Act VI opening), `src/progression/ledger.ts`, `src/progression/origins.ts`.

**Spine.** The heir starts at Lisbon and sails the same road outward; the consequences are met in road order.

---

## 3. Proposed career arc

The five acts stay (they are correct historically and structurally), but each gets a **theme, a cost, and a carried consequence**, and the act closings become two-panel (proposal 1).

| Act | Years | King's ask (existing) | What the act is *about* | What it costs / what is carried |
|---|---|---|---|---|
| **Prologue** | Origin | the Casa's charter | *Why you are out here.* Correspondent chosen (proposal 2). | A person at home; a promise. |
| **I. The Gold of Mina** | 1482- | the Guinea run | *Witness.* You bring the stone. The Rock at Mina audience (7). First encounter with the other cargo (3). | The first ledger lines. |
| **II. The Pillars** | 1483- | the Congo, the padrões | *Claim.* A pillar is a statement about who owns a coast. Kongo as a partner with its own court, the Embassy, the Companion enters (4). The prince of Jolof (7). | A person aboard. A mark at Arguim/Kongo. |
| **III. The Cape** | 1486- | the end of Africa | *The dark.* Knowledge costs men; the Muster Roll (9). Cost of the Cape. The Edict arrives by letter late in the act (8). | Named dead; letters home. |
| **IV. The Sea of the Indies** | 1488- | India | *The door.* The ocean is already full: the Prize Has Passengers (5). Calecute: the precedent. Kilwa, Melinde, the Companion's best scene. | The Calecute precedent (6). Word has started to run ahead. |
| **V. The Armada** | 1495- | the pepper fleet | *The Rule.* The Regimento is written from Act IV. The Cartaz at each port. The two-panel close. | The Rule, with your name on it. |
| **Coda: What the King Offers** | | | Rewritten: armada / lordship / gold / the ship, each answered by the Companion's fate and the letters from home. | The weighing; the roll; the two chronicles. |
| **Act VI: O Estado** (optional, heir) | 1500s | | *Living inside what was made.* (10) | Everything above, decayed. |

### The ending

The existing "Write your chronicle" / "Sail on" fork at the close of Act V stays, but the *ending* is three beats, all assembled from the Ledger:

1. **The weighing.** The pepper on the scale at the Casa, as written. The clerk reads the tally; the King rides down to the Ribeira; the crowd. Warm, triumphant, and short. This is the scene the player came for and they should get it.
2. **The reading.** After the crowd goes, the clerk reads the *other* roll, in the same level voice: the muster roll (9), then the parcel count (3) with its named few, then the ships stopped (6), then the promises the captain made and kept or broke. No commentary, no music change. The player cannot skip it, only read it as fast as they like.
3. **The two chronicles.** The final screen (1). The captain's name, as Lisbon wrote it. Below, as someone else wrote it, in a hand that does not know him. The Companion's page last.

What the player should leave with is not guilt and not triumph but the particular feeling the game's own epilogue file already aims for: *a list of who came back*, widened to include who did not, on every side.

### What carries across (the through-lines)

- **The Ledger** (one append-only record) is the spine of consequence from Act I to the epilogue and into the heir.
- **The Companion** is the one person who is in every act.
- **Word** (existing) runs ahead of the ship at every frontier.
- **The Rule** (Act V) is the stated, ownable consequence of Act IV.
- **Home** (letters) is the thing that changes while the ship is gone.
- **Irreversible things**, an explicit list so the player can feel them: a named hand's death, a broken promise to a court, a person carried, a ship stopped, a letter unanswered. Marks may fade; the Ledger does not.

---

## 4. Recommended top-3 sequence

1. **Two Chronicles + the Ledger (proposal 1).** Ship the Ledger first and wire every existing thread's outcome into it, even before new content, so every run from then on is recorded and the epilogue is richer immediately. It is small, it fixes the thesis problem, and every later proposal plugs into it.
2. **The Other Cargo, slice 1, with the Companion (proposals 3 and 4), bundled as "the Arguim-Mina-Mpinda chapter".** These are one chapter of the road and make each other possible: the cargo is the Companion's way aboard and the Companion is the cargo's human face. Source pass (A7) first. This is the largest moral and emotional gain in the pass and the one that most changes how the early game feels.
3. **What You Did at Calecute Becomes the Rule (proposal 6),** with the Prize Has Passengers (5) as its supporting tissue. This gives Act V a shape and the ending a weight.

Then, in order of cost: Muster Roll (9) as filler between big pieces (it costs days); Letters from the Tagus (2); the Edict (8) once Letters exist; the Rock and the Prince (7); the heir (10).

---

## 5. Responses

Read: `gameplay.md` (P1-P10, its responses) and `devils-advocate.md` (audit, guardrails G1-G12; its section 4 critique was still pending). Strongest objections, answered.

1. **"New kinds of thing cost a kind of thing" (G2).** Fair, and it shapes the build. Nothing here adds a meter, tab or minigame. The Ledger is a log, not a meter: it has no number the player manages and no tab; it surfaces only at act closings, the epilogue and the Leg Report. Letters ride the existing dispatch rails and appear as scenes through the existing alert path, replacing nothing and adding no screen. The Other Cargo is deliberately *not* a good with a price chart (that would be a new market); it is a ledgered parcel inside Casa commissions and a quest thread. The Companion reuses the `lingua` officer slot. The one genuinely new thing is the Stranger's people (proposal 5); it folds into `hailing.ts`, which already owns the boarding choice.
2. **"Content-to-player ratio is upside down; freeze new kinds; first-time players see 40%" (DA 1.10).** The ranking already puts the cheapest, most widely seen items first: the Ledger and two-panel act closings are seen by *every* run, the Muster Roll fires on a death every run has, and the epilogue is the one screen every finisher reads. The big authored items (3, 4, 6) are early-road and Act V, which are on every path. I would cut 7 (the Rock and the Prince) before cutting any of the top three if the budget is tight, and 10 (heir) is last.
3. **"Every consequence prints one sentence of cause and effect" (G4, DA 1.9).** Agreed and adopted as a rule for the Ledger: each entry is `who / what / where / when`, one line, in the escrivão's voice, and each mark written by a new beat carries its chronicle fragment *and* its one-line mechanical cost ("Kilwa: +10% on Houses for two seasons"). A mark that cannot be said in one line is not written.
4. **"The sea is the content; no port-only work" (G5).** The two heaviest story proposals happen at sea or on the ship: the Companion is aboard, and Prize Has Passengers is a hailing decision during sailing. Letters and the Edict land as dispatch cards. Calecute's Rule is decided port by port but enforced at sea (the standing order to stop ships). Where the DA wants a "place-and-face" per act (DA 1.7), the Companion is the face and the Rule is the place.
5. **"No violence or stakes" (DA ranked-bounce #5, 1.2) versus the Gameplay doc's retreat from naval combat (its Response 1).** Agreed with the Gameplay designer: no gunnery sim. Stakes in this pass are *moral and personal*, not tactical, and they sit where Gameplay already left a hole: its "terms" (refuse, parley, run) and its prize-crew and ransom consequences are exactly the decision points of my proposal 5. Proposed contract: Gameplay owns the mechanics of the encounter (odds, terms, prize crews), Story owns who is aboard the stranger and what is written afterwards; one `Stranger` schema extension serves both.
6. **"Solo-dev capacity; no script, no merge" (G8, G9).** Story content is data on existing rails, not bespoke art: no portraits, no unique geometry. Falsifiers I commit to: (a) a road-order check that draws every new thread's steps on `TRUNK` and asserts `along()` is non-decreasing (G1), run over `bemoim`, `resgate`, `regimento`; (b) a full-career bot that records the Ledger and asserts the epilogue renders for every origin and every Companion path, including a ship lost mid-act; (c) a Ledger round-trip through `save.ts`. The DA's call for a headless full-career bot is the same tool; I would build it once and have both docs use it.
7. **"History honest, fiction marked; stories carry a sources line" (G11).** Adopted. Proposals 1, 3, 4, 6, 7, 8 each need an A7 source pass written into `DESIGN.md` in the A6 style before text is final. Sources I would start from, to be checked and not quoted from memory: the Portuguese chroniclers (Barros, Pina, Zurara) for Mina and the Jolof prince, with their bias stated; the *Kitab al-Sulwa* for Kilwa; the *Keralolpathi* and Malabari sources for Calicut; the Kongo royal correspondence for what Kongo said about the trade (the surviving letters are from later reigns, so the game must not put them in the 1480s unchanged); scholarship on *resgate* at Arguim and Mina. Everything the game states beyond them is marked invented.
8. **"First hour is sacred" (G6).** Nothing here appears before Act I's close except the Prologue's correspondent and the Ledger, which are invisible until the first letter and first act close. The Other Cargo's first offer sits at Arguim, well after the first Funchal landing.
9. **"Slavery in a game is a minefield" / "it will be bleak."** Answered in the body of proposal 3 and in the principles in section 1: the structural commitments (no slider, named people, refusal costs and does not end the trade, no reward for virtue) are the answer to the minefield, and the weighing is kept as a triumphant scene so the tone does not collapse. If, after the source pass, the design cannot be done with that seriousness, the fallback is not to omit it silently but to keep the escrivão's line and the epilogue count only, which is still more honest than today.

**Gameplay/story coupling (named, per G12).**
- *Gameplay P1 (Leg Report) <-> Ledger.* Same event vocabulary. Proposal: one `src/progression/ledger.ts` schema; the Leg Report is the per-leg view of it, the epilogue the whole-career view. Gameplay owns the leg report's numbers; Story owns the voice of the lines. The report must use the escrivão's voice, and per Gameplay's note Rui Correia's for "what the pilot would have done".
- *Gameplay P3 (Wreck Chain) <-> Muster Roll, Companion, Letters.* A wreck is the single scene where all three bite: named hands lost on the beach go on the roll; the Companion's fate in a wreck must be authored (he survives, is separated, or is rescued by his own people: a legitimate and powerful outcome); the letter home after "lost her at X" is the hardest letter in the game. I will author the two or three rescue beats and the Chronicle wording Gameplay asked for: (a) rescued by a Line hull of your own, (b) by the local polity's boat, whose regard is read from the marks, (c) by the rival. The polity-rescue beat only works if the player has treated that polity well, which makes Prize Has Passengers and the Cargo choices pay off in survival rather than in a number.
- *Gameplay P5 (Consorts) <-> the Rule.* If the player commands an armada in Act V the consorts are the instruments of the Cartaz. A consort captain who disagrees with an order to stop a ship is the cheapest possible way to dramatise the Rule's cost (a hand with `regard` and a temper, already in `hands.ts`). Sequence P5 stage 1 before proposal 6's enforcement layer, or build 6 first with the player's own ship only.
- *Gameplay P4 (Lay-up) and P9 (Manning from the road).* Wintering at a port is where the Companion and the correspondent's letters land; manning from the road is where the Companion's origin choice is made. No change in order, but these should reserve the beats.
- *Gameplay P10 (Annual Armada seed) <-> the Ledger.* A shared seed will be compared; the Ledger should be hashable and the epilogue shareable without personal letters.
