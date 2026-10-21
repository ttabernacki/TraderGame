# Phase A3 cuts

Each cut has a load-time resolver in `src/game/saveResolvers.ts` (called from `Game.deserialize`), and
`scripts/cuts.ts` plants the old state in golden saves and checks the resolver settled it. Gate after every
cut: `scripts/saves.ts` (9 golden saves), `tsc --noEmit`; at the end also `scripts/tutorial.ts`,
`scripts/watchbell.ts`, `vite build`, and the surviving piece scripts. All passed after each cut.
Net: about 1,236 lines deleted, 601 added (resolvers, ambient barks, the folded manners, tests), against 3defcef.

## 1. Estate (`progression/estate.ts`, 206 lines, deleted)
- Removed: the file; `Game.estate`, `tickEstate`, `settleEstate`, `outfitVoyage`, `buyHolding` and friends (~130 lines in
  `state.ts`); the "Your holdings" block of the Money tab (`portView.renderEstate`, ~100 lines); `.estate-*` CSS.
  Quests that wrote to it now pay the purse directly (commenda +1500; the Madeira cane land is a free flag).
- Kept: `Game.lordship?: string`, written by the King's Offer quest and read by its ending text. Nothing else depends on it.
- Resolver `migrateEstate`: holdings convert to purse at the full price of each level paid (casa 3000/5500/9500, quinta 4200,
  engenho 6500, senhorio 15000), plus accrued unpaid income, plus the stake of any outfitted voyage not yet home; unread
  letters go to the log; one log line states the sum. `estate` is no longer serialised, so a second load pays nothing.
- Note: shares already bought as Lines stay Lines (they are `network.ts`, not estate). `buyShare` is now unused and left in place.

## 2. Living factory background loop (`progression/livingFactory.ts`)
- Removed: the per-frame `tickFactories` call in `Game.checkWorld`. The file is kept: letters, remittances, `noteSightings`.
- Houses keep all data, works, chest and yield. `tickFactories` now runs only from `settleFeitoria` (when the captain puts in
  at his House), playing the months since the last visit forward in one lump (capped at 36), as the file's own history did.
  Remittances and letters already in flight are still delivered at Portuguese ports.
- Resolver: none needed (no state removed). A save with a long-neglected House catches up on the next visit.
- Verification: `cuts.ts` advances 90 days with a House and checks its ledger does not tick.

## 3. Note-severity sea events (`game/seaEvents.ts`, ~130 lines)
- Removed as events: `birds`, `weed`, `fish`, `rainwater`, `ambergris`.
- Their lines live on as `ambientAtSea` in `progression/barks.ts`: one log line, no card, at most one every 1.5 days.
  Two keep a small mechanical edge so food and water do not vanish: fish still feed the scurvy clock (same numbers as the old
  base effect), rain still tops up water (3-8 days, no time cost, no choice). The ambergris windfall (up to 420 cruzados,
  once in ~130 days, a choice) is now a line only.
- Resolver: none (`recentEvents` ids are cosmetic).

## 4. PortQuest goods errands (`world/portCharacter.ts`, ~50 lines)
- Removed: the `PortQuest` type and the four quests (Funchal wheat, Benin coral, Kongo tools, Melinde horses); `Game.questHere`,
  `doQuestHere`, `portQuestsDone`; the errand block in the port card. Signature / custom / duty / prices / danger / arrive stay.
- Resolver `cancelPortQuests`: the field is dropped. If the captain is docked at one of those four ports with its errand still
  open, one log line says the errand is withdrawn. Nothing is refunded (goods were only taken at delivery).

## 5. Diplomacy pieces
- Removed: `pieces/meal.ts`, `hall.ts`, `linguist.ts`, their three scripts, their entries in `PIECES` and the audience invite chain.
- Meal and Hall folded into the Gift Table (`giftTable.ts`). Carrying the tray in at a Swahili/Gulf court begins with a short
  meal (seat, dates, then fast-or-feast); at a Malabar court with the hall (the escort recites all four rules, the captain
  places himself and the gifts). A good table adds trust and a faith/custom voice; a bad one costs respect and drops a winning
  tray one grade. Once per court, skipped if the Book or an old finished run already holds it. Book entries `guest-right`,
  `hall-you`, `hall-interp`, `hall-gifts`, `hall-retinue` are still written, on every grade (before: Meal only on a win).
  Cost of the fold: it needs a gift in the hold (the tray's own condition); the hall's retry and the meal's two other steps are gone.
- Linguist folded into the Case (`theCase.ts`). Guinea/Kongo courts (jolof, eguafo, benin, kaabu, kongo, temne, ndongo) now offer
  the Case, heard by the king's linguist with a local name pool; after the ruling a proverb closes it, the linguist letting
  slip what the king has been speaking of. Win needs both; the right proverb writes `proverb-*` to the Book.
- Resolver `settleFoldedPieces`: an open meal / hall / linguist run is settled `half`, "let drop", with no marks, measures or
  Book entries; one log line. Finished runs stay in the ledger as history.
- Verification: `gifts`, `case` (now including the linguist court), `silent`, `between`, `informer`, `refusal`, `pilot`,
  `hostage`, `pieces` all pass.

## 6. Ventures (`progression/ventures.ts`), replaced by contracts in D1
- Removed: the charter generator `offerVentures` and its helpers. `ventures.ts` is a shim of the names the screens import
  (`Venture` = `PortContract`, `ventureLine`, `daysLeft`, `charterDays`). `Game.ventures` is a getter over `Game.contracts`; the save carries `contracts`.
- A quay that stands under 30% of its stock of a good for two months posts a contract (`world/contracts`); the captain brings the goods himself, nothing is loaded for him.
- Resolver `migrateVentures`: every charter in an old save, in flight or finished, becomes a contract with `kind: 'venture'`,
  keeping its date, advance, fee, penalty and any cargo loaded for the merchant (still consigned, still reclaimed when it lapses, paid as it always was and still
  written to the Ledger as `commission.delivered` / `commission.failed`). One log line. Charters merely on offer at a quay are not carried over. `scripts/lanes.ts` runs it on `05-venture.json`.

## Not cut
`neverLose` / `reprieve`, `fleet/*`, finance, upgrades (B3), Xiyang.

## 7. The pieces, audited against clauses (D5)

Rule (BUILD_PLAN D5): a kept piece must end by naming a **clause granted, refused or poisoned**, or it is cut or folded.
`identity/clauses.ts` (`PIECE_CLAUSE`) is the table; `diplomacy/table.ts` `resolve` applies it when a piece ends, whether by a
choice or by a passage's beat, and the UI prints the line (`Outcome.clauseLine`, `PieceRun.outcome.clause`). Win grants, half
grants **with strings** (poisoned: half the benefit, two years, lost at the first offence), fail is refused. A grant already in
force is not granted twice; it is renewed for gifts from the Book (`renewClause`).

| Piece | Before D5 ended in | Now ends in | Verdict |
|---|---|---|---|
| Silent Trade (`silent`) | marks only (`silent.fair/blood/none`) | **Berth and watering rights** at the beach | kept, reworked |
| Gift Table (`gifts`) | marks, the deal's gift value | **Free dues** (the presents are the dues) | kept, reworked |
| The Case (`case`) | marks (`judgement.*`) | **Fortress licence** (a court that finds you just lets you wall a House) | kept, reworked |
| Go-Between (`between`) | marks at two courts | **Cartaz recognised**, at both courts | kept, reworked |
| Envoy (`envoy`) | an agreement and marks | **Exclusive buyer** | kept, reworked |
| Informer (`informer`) | marks, a person only in the text | **Cartaz recognised** (the rival's letter is not honoured beside yours) | kept, reworked |
| Refusal (`refusal`) | marks (`refusal.honest/curt`), a friend only in the text | **Men for hire** (the friend lends boatmen and porters, as trade) | kept, reworked |
| Pilot's Test (`pilot`) | marks, days lost | **Pilot loan** | kept, reworked |
| Hostage's Letters (`hostage`) | marks, a boy who becomes a person in the text | **Exclusive buyer** (the father's trade); the boy stays the person | kept, reworked |
| Bow (`bow`) | the custom of the court, marks | nothing: the greeting is not a piece in the sense of the rule; it leads to the terms, where clauses are asked for by name | kept as the greeting |

Nothing was folded or deleted in D5: no kept piece was found that could not honestly end in a clause. The audit's finding is that
**Refusal** and **Informer** were the two that ended in nothing the game could use (a friend, a clerk, a mark); both now end in a
grant. If playtests find either dishonest to its piece (a refused friend does not lend men), they are the first to fold into the
Envoy. The pairing of piece to clause is **invented** (the design docs name the rule, not the pairs).

The audience's own terms (`audienceView`) now ask for the same seven clauses by name, each with its price in gifts
(`clausePrice`, a share of `expectedGift`) and its term in years; `concludeTreaty` grants, poisons or refuses each by the gifts
laid down. The old "pilot" ask is the Pilot loan clause. `marks.ts` stays as it was migrated (Ledger entries with the echo); the
clause is the only new store, and it is the Ledger.
