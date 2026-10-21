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

## 3. Quarters and the Deep ports — `scripts/quarters.ts`

The port screen is six quarters (Waterfront, Tavern, Yard, Market, Fort & Court, Faith), each a pure view model
(`ui/quarters/model.ts`) rendered by small files in `ui/quarters/`. The script runs in node with a 90-line fake DOM
(`scripts/lib/fakeDom.ts`): the old screen's 67 functions, listed by hand, must each be a verb of a quarter at <= 2 clicks;
every port in several states, and every golden save at every port, renders every section with every available verb found
in the DOM by `data-verb`; the Fronts show at the place (an embargo shuts the Market's strip and stock); Mina's Patron
tracks the Ledger, reacts in a played career, and tells a four-beat arc in order whose reward lies ahead on the road; a
Ledger entry becomes a line, said once, and moves dues, price and the town's regard; every non-Deep port is a four-line Stop. D6 adds Arguim, Melinde, Calecute and Lisboa (Lisbon with three Patrons): each Patron's regard follows the Ledger and
reaches the log in a played career (careerCore seeds), every calendar entry shows on the quay in its months, a deed becomes a town line said once and moves dues,
the four-beat arcs run in order, and **every choice of every beat is checked for deeds or regard that land behind the port on the road** (`road.ts: along()`).

```
npx esbuild scripts/quarters.ts --bundle --platform=node --format=cjs --outfile=/tmp/quarters.cjs && node /tmp/quarters.cjs
```

About 65 s. Pixels are not checked here; for those, bundle `ui/portView` and screenshot it (see `scripts/render`).

## 4. Lanes, contracts, the weigh-house, dues, the rival's house — `scripts/lanes.ts`, `econ.ts --world`

`lanes.ts` (about 60 s): the lane table (about 150 lanes, 6 goods at most, the five trunks); goods conserved, counted at the
`Markets` door (units out of the quays = units in); determinism and a long catch-up equal to stepping; trend arrows;
the player's weight crowds a lane out and six hulls on one lane earn under four times one; prosperity reaches `thriving`;
the contract life (post, offered only behind it on the road, sign, deliver, restock, miss and forfeit, cooldown); old
ventures migrate; the run price, heat, inspection at Lisbon, no cooling by waiting; dues; the rival's house moves a price
and is bought out or allied with; the save round trip and every golden save through two years of lanes.
`econ.ts --world` adds the 24-month lane world: stock floor, price band, spread, thriving reachable, a war at two Malabar
ports closing and reopening the lanes through `marketModifiers`, heat not laundered by waiting, dues scaled by tonnage.
`econ.ts --india-hulls` prints the small-hull table (docs/BALANCE.md).

```
npx esbuild scripts/lanes.ts --bundle --platform=node --format=cjs --outfile=/tmp/lanes.cjs && node /tmp/lanes.cjs
node /tmp/econ.cjs --world        # after bundling scripts/econ.ts
```

## 5. Strangers as people — `scripts/strangers.ts`

Schema of every generated stranger over many seeds and ten waters (Atlantic, Algarve, Guinea, Kilwa, Melinde, the Arabian sea, the crossing, Gujarat, Calecute and Cochim;
the roster is a pure function of the seed, unique, invented and clear of real names; no new mesh; terms gate by Rule stage (stop only
from stage 3) and by the cartaz clause or a pass written for the master; a master spoken at Kilwa is met again at Melinde and Calecute with an
attitude that differs by what the Ledger says was done to him (two games from one seed, one stopping and one sparing); word reaches a fellow
master of his court only after the road allows, and reaches the courts through the diplomacy queue and the rumour mill (a rumour Fact with the
master as source); each term writes the right tags; no term sets a destination, scene, quest or obligation; people survive a save; old saves'
strangers (no `masterInfo`) are hailed as before; the hail card shows name, home, errand and temper through a fake DOM.

```
npx esbuild scripts/strangers.ts --bundle --platform=node --format=cjs --outfile=/tmp/strangers.cjs && node /tmp/strangers.cjs [seeds=40]
```

About 30 s.

## Others

`scripts/*.ts` (pieces, silent, hall, ...) are single-system checks; run each with the same esbuild pattern.
