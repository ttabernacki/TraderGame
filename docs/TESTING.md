# Testing

Two headless gates sit over the whole game. Both bundle with esbuild and run in Node; no browser.
(`/tmp/x.cjs` below is any scratch path.)

## 1. Golden saves — `scripts/saves.ts`

Loads every `fixtures/saves/*.json` with `Game.deserialize`, steps one simulated month with the game's own
clock (`waitDays(30)` if docked, the `update()` loop at the top clock rate if at sea, scenes answered), re-serialises,
loads again, steps another month, and asserts invariants (finite sane purse / clock / position / hull / hold,
act 1..5, key fields identical across the round trip, ledger well-formed once it exists). Prints `ok` / `FAIL`
per save; exit code 1 if any fail.

```
npx esbuild scripts/saves.ts --bundle --platform=node --format=cjs --outfile=/tmp/saves.cjs && node /tmp/saves.cjs
```

Runtime about 7 s. Optional argument: another fixture directory.

### The corpus

`fixtures/saves/` holds nine `SAVE_FORMAT 3` saves, each the raw string `Game.serialize()` wrote:
new game; at sea; docked with cargo; mid-audience (Silent Trade piece open); active venture; a House and a Line;
late game (act IV, patent in hand, ~750 KB because the log and chart are long); heir (generation 2); quest thread.

Regenerate (only after a `SAVE_FORMAT` bump or when adding a state; seeds are fixed, ~20 s):

```
npx esbuild scripts/genSaves.ts --bundle --platform=node --format=cjs --outfile=/tmp/genSaves.cjs && node /tmp/genSaves.cjs
```

Do not regenerate to make a failing `saves.ts` pass: the old files are what migrations are tested against.
Fixture 06 tops the purse up by 3000 to afford a House and a hull; everything else is reached by play.

## 2. Full-career bot — `scripts/career.ts`

Plays Lisbon -> Funchal -> Arguim -> Mina -> ... -> Lisbon voyage after voyage through the Game API:
real sailing (`weighAnchor`, laid marks, `update`), a bot-local sea router for open-water marks, the game's own
`homewardPassage` marks for the volta, `tradeBuy`/`tradeSell` by "buy what the next port's bid beats by 20%",
the King's act commission at Lisbon, a diplomacy piece (first available, solver-style choices) at any court
that offers one, repairs, careening and victualling, and every sea scene answered by a label heuristic.
It stops at the epilogue (`Crown.routeOpened`), a lost ship, a leg it cannot finish, or a voyage / year budget.

```
npx esbuild scripts/career.ts --bundle --platform=node --format=cjs --outfile=/tmp/career.cjs \
  && node /tmp/career.cjs [seeds=3] [firstSeed=1] [maxVoyages=12] [maxYears=40]
BOT_DEBUG=1 node /tmp/career.cjs 1 3     # per-leg trace, log tail on failure
```

One line per seed: acts reached, days, purse, epilogue yes/no, voyages, `snaps`, trades, audiences, wall time and
why it stopped; any exception is printed and makes the exit code 1. **Only exceptions fail the run**: the bot
losing its ship is not a game bug. Treat a drop in the number of epilogues / acts reached across a fixed seed set as
the regression signal (baseline at time of writing: seeds 1-4 reach act 3, 4, **5 + epilogue**, 3).

Runtime: 10-25 s per seed (a full round trip to Cochim and back is several minutes of game-time per hour of
play, ~4 s of CPU per voyage).

### Limits, honestly

- The bot is a mediocre seaman. Most seeds end by wreck, plague or a crew too thin to weigh somewhere between the
  Cape and home; roughly one seed in four completes all five acts and the epilogue.
- **`snaps`**: when the ship makes < 25 nm toward its mark in six days, or takes the ground twice, the bot
  lifts her onto the next mark. This is the one place it steps outside the game's rules; a rising snap count
  means navigation got worse, not that the bot got worse.
- The bot reads true prices at the next port (`Markets.listings`), not the player's price sheets, and sails marks
  from its own coarse land mask. It does not exercise the Casa's information model or the chart.
- Act V needs 100 quintals of pepper bought at Cochim on a voyage begun in act V; the bot buys it at the far end.
- Not covered: ventures, Lines, Houses, finance instruments, shipbuilding, heirs. `genSaves.ts` builds those
  states and `saves.ts` covers them.

## Others

`scripts/*.ts` (pieces, silent, hall, ...) are single-system checks; run each with the same esbuild pattern.
