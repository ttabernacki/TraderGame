# Shelved: the Xiyang campaign (Zheng He, 1405)

The Ming treasure-fleet campaign is built but shelved. The shipped game is the
Portuguese Carreira da Índia only.

**Switch:** `XIYANG_SHELVED` in `src/campaigns/active.ts`. While `true` the page
always loads the Carreira world, the title screen has no campaign picker, and
`?campaign=` / the kept choice are ignored. Saves from the campaign are refused
with a message. Node scripts can still pass `CAMPAIGN=xiyang` (the `xiyang*`
scripts and `fleet` keep passing). Set it to `false` to bring it back.

**What is kept (all still in the repo):**
- `src/campaigns/xiyang/` — coast, 11 ports, 4 peoples, 6 polities, 6 hulls, polars, imperial voyages 1–7 and deed scenes.
- `src/render/junkMesh.ts` — the six junk models (war, troop, grain, water, horse, treasure); picked by `makeHullModel`, only ever for Xiyang hulls.
- `src/ui/admiralView.ts`, `src/ui/skin.ts` (Ming wording), fleet orders UI; `src/game/fleet.ts` and `src/fleet/formation.ts` (the fleet engine; also usable for Portuguese armadas).
- Design notes: `docs/ROADMAP.md` (Track C, Xiyang), `docs/DESIGN.md`.

**Not shelved:** the diplomacy set-pieces (Track A), marks and the Book of Courtesies — they are Portuguese-game content.

**Ideas still open for the campaign:** Ming officer arcs, squadrons, junk sail drawing polish, Casa/chart legend in Ming skin, further terminology.
