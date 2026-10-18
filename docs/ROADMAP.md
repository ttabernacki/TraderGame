# Dev roadmap


> **Superseded for forward work by `docs/BUILD_PLAN.md`** (structural plan; no Armada, Wreck Chain or combat).
> **Track C (Xiyang / Zheng He) is shelved** — see `docs/SHELVED.md`.

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
- [x] **A3 First six** (the cut-down set): Silent Trade, Gift Table, The Case, The Go-Between,
  Envoy Aboard, Informer. Port the two toys from the design page onto the real engine.
  *Check:* bots (perfect / reader / random) win ~100% / 70-80% / ~33%; no ruling right for
  >50% of generated cases; straight split fails the tension issue.
- [x] **A4 Remaining six:** Meal, Linguist, Hall, Refusal, Pilot's Test, Hostage's Letters (all built; scripts/*.ts bots pass)
  Hostage's Letters. Passages run by dispatch on the clock. *Check:* none needs a return;
  mid-piece save/load; a skipped month at fast clock still resolves.
- [x] **A5 Arcs (marks felt: regard, House price, gating, epilogue).** Per-court chains (Melinde first) with cast, marks, callbacks, epilogues,
  wired to Casa, houses and Lines (marks change prices, footing, who will host a House).
  *Check:* every arc plays in road order; each mark alters at least one later scene.
- [x] **A6 Source pass.** Verify † dates and customs; mark honest inventions in the text.

## Track B — Fleet sailing

- [x] **B1 Formation** (engine `src/fleet/formation.ts`, `scripts/fleet.ts`: every ship within a cable at dt 1/60 to 60 s, relative speed <= 1.5 m/s, tack ripples in 53 s, 40 ships cost 60 us). Followers hold slots off the flagship, speed-matched, eased pose,
  no orbiting. *Check:* sim shows no follower exceeds 1.15x flagship speed and turn rate <=30 deg/s.
- [x] **B2 Orders (engine side: shape, spacing, keep-together cap).** In-game commands and drawing wait for the campaign's fleet (C2). Close up / spread / line ahead; ships shorten to the slowest hull.

## Track C — Zheng He campaign ("Down the Western Ocean")

- [x] **C1 World (first cut):** `src/campaigns/` — world chosen once at load (`?campaign=xiyang` or the title's campaign row, which reloads); China coast, Sumatra, Java, Borneo, Hainan, Taiwan; 11 ports, 4 peoples, 6 courts; monsoon mask widened to the South China Sea; calendar works before 1430. Carreira world verified unchanged (52 ports, 20 peoples, 27 polities, 53 landmasses). Still to do: Ming names for shared ports, Chinese chart skin, ports marked known on the chart.
- [x] **C2 Hulls and fleet (first cut):** six Ming hulls (`src/campaigns/xiyang/hulls.ts`, baked polars), the flagship starts in a zuochuan with nine consorts (`src/game/fleet.ts`): each consort's speed is its own hull's polar on her own point of sail, the master holds the flagship to a shade under the slowest, consorts drawn as full models when near (nearest 14). Verified headless at 4x/300x/passage rates (settled error under a cable). Commands on the deck (u/e/q, deck row) and gale scatter + rejoin (engine and game, tested) done. Still to do: squadrons, junk sail drawing.
- [x] Junk models: six Ming hulls drawn by `src/render/junkMesh.ts` (war, troop, grain, water, horse, treasure), chosen by `makeHullModel`
- [~] **C3 Court of the Yongle emperor (first cut):** `campaigns/xiyang/imperial.ts` — the first voyage as orders (five courts to accept the calendar, the pirate of Palembang as a scene), the Admiral's hall at Ming ports (report, pay, favour), saved with the voyage; courts are taken through the Track A audiences. Still to do: tribute/envoys carried home (reuse the Envoy piece), the Casa/Crown parts of the UI skinned for Ming, typhoon.
- [x] **C4 Voyages 2-7, 1407-1433 (orders and deeds; scripts/xiyangImperial.ts runs all seven)** in order. *Check:* each voyage completable headless.

## Checkpoint

Objective: Track A. Completed: A1, A2, A3 Silent Trade, Gift Table, The Case, Go-Between, Envoy, Informer (scripts/silent.ts, gifts.ts, case.ts, between.ts bots ok; marks, Book, piece engine, Table; scripts/pieces.ts passes). A6 source pass done (see docs/DESIGN.md sources). Next: ask the user whether to continue to Track B (fleet) or C.
