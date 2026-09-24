# Carreira da Índia

## How to report back — this is not optional

Laconic. The final report after a commit is **3–5 bullets, one line each**, plus
the artifact link. Nothing else.

- No mid-task narration or status updates ("now doing X", "checking Y"). Work silently.
- No essays, no headers, no tables, no per-item breakdowns unless asked.
- No explaining how something was verified or what was tried. Just what changed.
- No restating the user's request. No closing offers or suggestions unless asked.
- Only flag a problem if the user must act on it — one line.

The user's words: *"I dont need you to tell me every single thing you do along
the way. you are a tool. a calculator doesnt tell me what its thinking along the
way. just output saying when youve fixed it."*

## Persistent Work Mode

Operate as a persistent agent throughout this project.

When working on a multi-step task, continue making useful progress toward the user's objective rather than treating each response as an independent completion.

When the user says "continue", "keep going", "resume", or "continue working":

1. Review the existing conversation and project state.
2. Determine what has already been completed.
3. Identify the highest-value unfinished step.
4. Execute that step immediately.
5. Continue through additional steps when they can be completed without user input.
6. Do not repeat completed work.
7. Stop only when the objective is complete or genuine user input is required.

Do not merely tell the user what you could do next. When authorized and technically able, do it.

For complex tasks, maintain a concise checkpoint of:
- Objective
- Completed work
- Current state
- Outstanding issues
- Next action

Do not claim to work in the background or continue autonomously after the current invocation ends. "Persistent" means that successive invocations should resume intelligently from the existing project and conversation state.

## Working rules

- Measure, don't guess. Headless node sims (`npx esbuild x.ts --bundle
  --platform=node --format=cjs`) are much faster than browser runs here.
- **Verify against an independent ground truth, never against the expression
  under test.** This was learned the hard way: the sail-belly direction was
  "verified" twice by measuring the cloth against the same formula that set it,
  which could only ever agree with itself and hid a 90°-plus-reflection error
  for two rounds.
- Playwright + `/opt/pw-browsers/chromium` for visual checks. Headless runs at
  ~1.6 fps, so anything timing-sensitive needs sampling in ship-time, not
  frames.
- All work goes on branch `claude/repo-wipe-kbyvad`.
- Ship each change: `npx vite build`, then `node bundle.mjs` and
  `node check-bundle.mjs` in the scratchpad, then republish the artifact at
  https://claude.ai/code/artifact/f550a78d-278e-4790-9a9b-4ed78495ff3a

## Geometry conventions (ship frame)

Bow is **+Z**, port is **+X**, up is +Y. `beta` is the bearing of the apparent
wind's *source* off the bow, positive to starboard. So the wind blows toward
`(sin β, −cos β)` in (x, z). `downwindInShip()` in `src/render/shipMesh.ts` is
the single source of truth — pennant, telltales and sail belly all read it.

## Navigation model — three frames, never mixed

- **Ground truth** (`world/landmass`, `world/ports`, `ship.state.pos`): the real
  coast, towns and ship. Never changes except by the ship physically moving.
- **Reckoning** (`navigation/navigator`): where the pilot believes the ship is,
  with a growing ellipse of doubt. Sights, the lead, the book and landfalls
  correct *only this*; every correction goes through `Navigator.corrected`.
- **Chart** (`navigation/charts`): where the pilot believes the coast and towns
  are. Starts from the Casa's sheet (`seededError`), laid down at
  `truth + (reckoned − truePos)` when sighted, amended back along the leg on
  every fix (`Chart.amend`), fixed exactly at a town entered and bent to meet it
  (`settleAround`), issued hearsay relaxed toward surveyed coast
  (`relaxHearsay`). It converges on the truth; it never starts there.
- The lead reads soundings in the frame of whoever took them
  (`Game.soundingFrame`): Casa roteiros on the Casa's sheet, local pilots on the
  real shore, your own book on your chart.
- Steering and planning use reckoning + chart. Only the lookout (a town within
  sight) and arrival checks use the truth.
