# Carreira da Índia

## How to report back — this is not optional

Be terse. Say what was broken and that it is fixed, in a few lines. That is all.

- No essays. No progress narration. No "here's what I did along the way".
- No tables of measurements unless asked for them. Measure as much as you like —
  just do not publish the workings.
- No restating the user's problem back at them.
- One short paragraph, or a few bullets. Then stop.

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
