# Design spine

The career is **one road**, not a star. Lisbon → Lagos/Funchal/Las Palmas →
Arguim → Mina → Mpinda (Congo) → Benguela → the Cape → Moçambique → Melinde →
Calecute → Cochim, and home. Every commission, act, story, charter and errand
lies at a point on that road (`src/progression/road.ts`). A voyage does all the
business at a place in one call and goes on. **Nothing may require sailing back
along the road for a clue, a letter, or a reward.** Lisbon is where a voyage
begins and ends, and where the Casa, the court and the shipyard are — not a
checkpoint between acts.

## Rules for new content

1. A story's steps run in road order. If step N+1 is behind step N, it is
   wrong: change the step, not the sailing.
2. News comes to the captain. Letters, succession, rewards and the King's
   answer arrive at the port he is in (or at Lisbon if the story is *about*
   Lisbon, and only if he is going there anyway).
3. Waits are paid by the voyage, not by the player. A "come back in 90 days"
   gate is a bug; a gate that the rest of the voyage satisfies is fine
   (`prester.wait`, 300 days, is satisfied by the India run).
4. Gifts, cargo and papers a story hands the captain are stowed for him
   (`stowTools`), not left for him to shop for.
5. Two beats at one port are fine and expected: a scene answered at once
   surfaces the next due beat.

## What is done

- **Acts advance by dispatch.** When an act's goal is met, the King's answer
  (closing reward, the next act's opening and its commission) arrives 14 days
  later at the next port, wherever it is. The court scenes still play if the
  captain happens to be in Lisbon. (`chronicle.ts: dispatch`)
- **Act commissions settle at any quay.** A finished act commission is paid
  by the King's factor at the next port and the next act's is issued with the
  letter (`Game.dischargeAtDispatch`, `takeChargeByDispatch`). Only the
  ordinary coast work still waits for court. `reach` objectives already true
  count when a commission is taken (Cape for Act IV).
- **The Leak** runs home along the coast: Mina → Arguim → Lagos → Lisbon
  (Rua Nova and the reckoning in one visit). Was Mina → Lisbon → Lagos →
  Arguim → Lisbon.
- **The Manikongo's Embassy**: gifts are stowed at court; the succession is
  settled on arrival at Mpinda; the king's letter is answered at Lisbon. Was
  three separate returns to the Congo with 90- and 60-day waits.
- **The Biscayan's Ship**: the Casa's purse and letter are had from the
  Casa's man at Las Palmas, not by sailing to Lisbon and back.
- **Prester John's letter** arrives with the Act III dispatch (the two envoys
  come out with it), instead of being given only at court in Lisbon.
- **The chart** marks the act's goal and the commission's places in gold, beside
  the stories' violet.
- **The Lost Caravel** is also offered at Mpinda (a degredado with Soeiro da
  Costa's letter), and Prester's envoy can go inland from any port of the
  Kongo/Angola coast, because an act's letter arrives a port or two down the
  road from where its goal was met.
- ~~The Road tab / port road card / HUD next-stop~~ were tried and cut: Missions
  (Orders, first tab) is the one list. `road.ts` remains for the chart's gold marks
  and for placing threads in order.

- **Origins have a thread each** (`quests.ts`, ids `nome`, `ficheiro`, `roteiro`,
  `escudeiro`): offered at Lisbon, Lagos or Funchal to the matching origin only;
  second beat on the Guinea coast (or Arguim), last at the far end of the road
  (the Swahili coast, Cochim, or the bay south of Benguela). Each ends on a
  choice that changes the epilogue (`originEnding`); The File can close the
  Casa's watch (`isWatched`).

- **Six road threads** (`adrift` off the Barbary shore, `pesos` at Mina/Axim,
  `padrao` east of the Cape, `mercador` Moçambique→Mombaça→Melinde, `monsoon`
  Melinde→open sea→Calecute, `aprendiz` the stowaway, Lagos→south coast→home
  port). Every step is further down the road than the last, except the two
  that end at a Portuguese port the ship is bound for anyway.

- **The road answers back.** Passage decisions now also at Bojador, São Tomé and the
  Arabian crossing (`passage.ts`); finished threads print what they changed and are
  remembered at the places they touched (`callbackAt`); officers remark at places
  (`barks.ts`); the captain's own milestones and the rival sit under the Road
  (`milestones.ts`); a harbour bell, gulls and a thread cue in `sound.ts`.

- **Factories run themselves** (`livingFactory.ts`): a station is ticked monthly in
  the background — buys, pays the town, builds stockade/warehouse from its own chest,
  sends surplus home (36% to the Casa, a few per cent lost at sea). Coin and letters
  arrive at the next Portuguese port. Policy toggles live on the Orders > Factories tab,
  so nothing needs a visit; a ship merely passing within 150 nm keeps a station calm.
  Visiting still gets the whole shed at resident prices. Unattended for years, a
  station can still burn.

- **Legacy**: the epilogue offers "Send your heir to sea" (`Game.inheritFrom`): 40%
  of the purse (cap 2,500), a quarter of lifetime renown, up to +4 skill points,
  the old captain's chart and rutter, and surviving stations (same factor, stock
  and chest; town regard reduced). Heir is a fidalgo if the line reached 400 renown.

- **The far end** (act IV+): `feitorcal` (the factory at Calecute: fortify, withdraw or trust
  the Zamorin; maybe a riot, maybe Cochim as ally), `mappila` (off-book pepper, the dhow
  lane, the Kolathiri's treaty), `malay` (Cochim → Columbo → Malacca: cinnamon, cloves, the
  strait; the one optional push beyond the road, for renown and the Malacca milestone).

- **Act V** gets its own threads: `pepperrace` (outbid, divide or delay the rival; chase at
  the Cape; who lands first at the Tagus), `feverfleet` (a dying fleet ship; Mocambique →
  Aguada de São Brás), `kingsoffer` (Lisbon finale: armada command / lordship / gold / just the
  ship; captain-major raises the heir's inheritance). `lateEndings` feed the epilogue.

- **Late-game upgrades**: every skill tree now has a tier-7 crown (Master of the Carreira,
  The Padrão Real, A name the men would die for, The King's voice, Prince of the Rua Nova),
  each wired to a real effect; four yard services for captains of name (Zacuto's astrolabe,
  Flemish sailcloth, the great cabin, the King's ordnance).

- **Houses and Lines** (`network.ts`, Orders > Houses & Lines, the House tab in port). A
  House (stored as a `Feitoria`) is a node: it buys the town's goods out of the real market,
  holds them, may have Works that make one town good monthly, and is set to one posture (buy
  and hold / keep stores: half-price victuals / work: doubled Works, no buying). Its one meter
  is footing. A Line is an edge: a bought hull that runs a House (or Lisbon) to a market and
  back, picks the best cargo each way, sells into the real market, waits for the monsoon past
  the Cape, and pays out once per voyage (Casa 15%, 8% with Rua Nova) as a single payday card
  at the next Portuguese port. Lines carry fresh price sheets home. Letters that need an answer
  (send out of season; gift/stockade) come as scenes. Old businesses migrate into Works +
  Lines. Act V `pepperhouse` at Lisbon: Casa contract (fixed 26) or corner the market (×1.4).
  Never require sailing back: every House and Line is managed from the Orders book.

- **One economy, fewer meters.** Charters buy their cargo off the origin's quay and land it
  on the destination's market; offers follow gluts out and shortages in. The estate's
  "outfit a voyage" is now a quarter or half share in a Rua Nova owner's Line from Lisbon
  (paid per voyage, owner runs her; act+1 shares at most). A port's regard is its court's
  opinion (0.5 trust + 0.2 respect + 0.3 interest) plus the town's own memory (±0.6,
  `Relations.local`); merchant standing is renown. Sea events are 15; those without a
  choice go to the log only (grave ones excepted). Noon and routine sight prompts no longer
  alert.

- **Joins.** Prizes bring their cargo into the hold (by sea and business). The volta home
  from Guinea is a passage question. The rival's caravels load on his stretch of the road and
  land at Lisbon (`rivalTrade`), so he shows in prices and factors mention him. Tinoco reviews
  the Lines once (`casa:lines` → `casa.linesRate`). Lines and Houses raise their court's
  interest, and so the ports' regard. True hearsay pays its kind (water, a price sheet).
  Inland men no longer need fetching: past due + letter time they find the ship at any
  Portuguese port or House. Errands: + Where the cloves grow, + Monomotapa.

## Verdicts

Keep and deepen:
- Sailing/navigation core, the reckoning-vs-chart model, weather and currents.
- Officer arcs (the company): they ride the road for free.
- Acts as the spine; the five-act chronicle and dated history.
- Feitorias: the only thing that turns voyages into a position.

Keep, but they are not the game:
- Ventures/charters: the reason to trade between commissions. They now show
  on the Road with days left; do not add more kinds.
- Estate, Casa: Lisbon-side money and politics. Leave alone.

Cut or fold (candidates, in order):
- Orders tabs: Rival folded into Chronicle (a rival is a story, not a page).
- Anything that asks for the same errand twice (a commission objective and a
  story step that want the same place should be one step).

## Winds and currents: the roads

`scripts/routes.ts` measures the key roads (days, made good, share within 55° of the wind) by
season and hull. The oceans are drawn round their highs: Azores (clockwise), St Helena and
Mascarene (anticlockwise), plus coastal regimes: Portuguese nortada, Saharan NNE trade (strong,
with an inshore Canary set), Guinea-coast and Gulf-of-Guinea south-westerlies, Benguela
southerly, and the Cape's summer south-easter. Intended shape: the volta and the Brazil swing are
the fast roads; up the Saharan coast, down the Angolan coast, and Melinde→India in the NE monsoon
are slogs; outward round the Cape is easy in the austral winter and hard in summer (wide is
better), homeward round it easy in Feb–Apr with the Natal north-easter and the Agulhas.

## Set pieces, marks and the Book of Courtesies

A court is met through small games (`src/diplomacy/pieces/`), each with the same
shape: `available`, `start`, `view`, `step`, and for passages `beat`. They run
on the road and never ask for a return: audience pieces play where you stand
(the greeting, the meal, the hall, the case, the tray, the refusal, the
linguist, the mat, the informer, the go-between); passages (envoy aboard,
pilot's test, hostage's letters) are carried by the clock and put a scene to the
captain a few weeks apart, wherever he is.

A piece ends in **marks**, not numbers: named, toned entries a court keeps of
you. Every mark is felt in three places: the court says its `echo` when it next
sees you; its ports' local regard shifts by tone (`feelMark`); and the price of
a House there moves (friends are let off 6% per kind mark, up to three; each
offence adds 10%, up to two). Some marks gate later pieces: the go-between is
offered only to a court that already has a reason to like you.

What a piece teaches goes into the **Book of Courtesies** with how it was
learned (told, seen, bought, taught, or blundered), and the epilogue prints
what the courts said of you. Solver bots in `scripts/*.ts` hold each piece to
its targets: a perfect bot always wins, one that reads only the view wins most,
a random one rarely, and no single policy dominates.

Sources checked for the pieces (A6). The Mali request: Mansa Mahmud II asked
João II for an alliance and guns against the Fula, and Portugal stayed out; the
sources differ on the year (c. 1490-95), so no scene states one. The Calicut
audience of 1498: da Gama's gifts (striped cloth, hoods, hats, coral, basins,
sugar, oil, honey) were judged poor by local standards and the Muslim
merchants were hostile; accounts differ on whether they were mocked, so the
Gift Table says "received without comment" and "laughed at" only as outcomes
of play. The Tupi do not herd cattle: the silent trade there is baskets of
fruit, feathers and dye-wood.

## Sailing a fleet (engine)

`src/fleet/formation.ts`: slots in the flagship's frame (column, line, crescent;
close or open; at most sixteen to a row so a big fleet is deep, not wide); each
consort steers parallel to the signalled heading, bow turned at most 8 degrees
toward its place; corrections relax exponentially so the same code holds at a
frame and at a day's step; orders reach ships by signal, nearest first (3 s
plus 12 ms a metre); each hull class has a speed share and a turn rate, so a
slow class falls astern unless the flagship's master holds her to 95% of the
slowest (`keepTogether`). Nothing here is drawn yet: that is the campaign's job.

Xiyang sources (checked): Chen Zuyi taken at Palembang on the first voyage with the
headman Shi Jinqing's help (about 5,000 of his men killed); Alakeshvara of Ceylon
taken on the third; the usurper Sekandar of Samudera on the fourth; Malindi sent
giraffes to the Ming (the year and route are disputed, so the scene claims neither).
The Admiral's death on or after the seventh voyage is uncertain and not stated.
