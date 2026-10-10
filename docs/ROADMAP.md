# Dev roadmap

Order of work. Each stage ships on its own (build, bundle, publish) and has an exit check
that is measured, not eyeballed. Resume from the first unchecked stage. Design lives in
the published pages "The Audience" (Table engine) and "Twelve Set Pieces" (pieces, marks,
Book of Courtesies); campaign design in "Down the Western Ocean".

Rules for every stage: one road (nothing requires sailing back); no new alert spam
(log first); content as templates + a few hand-written memorable lines; every piece
has win / half-win / fail-forward; saves round-trip.

## Track A — Diplomacy (do first)

- [x] **A1 Frame.** `src/diplomacy/table.ts` (days at court, moves, session), `marks.ts`
  (named marks with callbacks, serialised), `book.ts` (Book of Courtesies, learned-how
  provenance, tradeable). Court form picked from the court's polity. Piece interface:
  `start(ctx)`, serialisable state, `step(input)`, `resolve()` -> marks/effects/closing line.
  Replaces the one-click gift/audience; regard still flows through `Game.bindRegard`.
  *Check:* a stub piece writes a mark; a later scene reads it; save/load keeps it; ledger shows it.
- [x] **A2 UI shell.** One modal for any piece (phone width first), voice cards, ledger tab for
  marks and the Book. *Check:* screenshots at 400px and 1200px, no overflow.
- [ ] **A3 First six** (done: Silent Trade, Gift Table, The Case, Go-Between; left: Envoy Aboard, Informer) (the cut-down set): Silent Trade, Gift Table, The Case, The Go-Between,
  Envoy Aboard, Informer. Port the two toys from the design page onto the real engine.
  *Check:* bots (perfect / reader / random) win ~100% / 70-80% / ~33%; no ruling right for
  >50% of generated cases; straight split fails the tension issue.
- [ ] **A4 Remaining six:** Meal, Through the Linguist, The Hall, The Refusal, Pilot's Test,
  Hostage's Letters. Passages run by dispatch on the clock. *Check:* none needs a return;
  mid-piece save/load; a skipped month at fast clock still resolves.
- [ ] **A5 Arcs.** Per-court chains (Melinde first) with cast, marks, callbacks, epilogues,
  wired to Casa, houses and Lines (marks change prices, footing, who will host a House).
  *Check:* every arc plays in road order; each mark alters at least one later scene.
- [ ] **A6 Source pass.** Verify † dates and customs; mark honest inventions in the text.

## Track B — Fleet sailing

- [ ] **B1 Formation.** Followers hold slots off the flagship, speed-matched, eased pose,
  no orbiting. *Check:* sim shows no follower exceeds 1.15x flagship speed and turn rate <=30 deg/s.
- [ ] **B2 Orders.** Close up / spread / line ahead; ships shorten to the slowest hull.

## Track C — Zheng He campaign ("Down the Western Ocean")

- [ ] **C1 World:** Indian Ocean ports and peoples loaded only for `xiyang` (never leak into Carreira).
- [ ] **C2 Hulls and fleet:** treasure ship, escorts, water ships, junk sail model.
- [ ] **C3 Court of the Yongle emperor:** voyages as acts, tribute loop, set pieces from Track A reused.
- [ ] **C4 Seven voyages 1405-1433** in order. *Check:* each voyage completable headless.

## Checkpoint

Objective: Track A. Completed: A1, A2, A3 Silent Trade, Gift Table, The Case, Go-Between (scripts/silent.ts, gifts.ts, case.ts, between.ts bots ok; marks, Book, piece engine, Table; scripts/pieces.ts passes). Next: A3 Envoy Aboard, Informer.
