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

## Not cut
`neverLose` / `reprieve`, `fleet/*`, finance, upgrades (B3), Xiyang. `progression/ventures.ts` carries a deprecation comment
(replaced by contracts in D1) and is otherwise untouched.
