# Render manual checklist (real hardware)

Switches: `F8` cycles auto / ultra / high / medium / low / previous look. `?render=legacy` or `?render=new` in the URL forces and remembers the path. `F7` or `?perf=1` shows frame ms, GPU ms (where the browser exposes it), draws, triangles, post passes and render-target MB.

Harness (software GL, regression only): `NODE_PATH=/tmp/sc/vis/node_modules node scripts/render/shots.cjs <outDir> <label> scenes=noon,dusk tier=high [legacy=1]`.

Per device and tier, record: frame ms mean and p95 at sea and in a port; GPU ms; phone temperature after 10 minutes at medium.
Check: no flicker on sea at the horizon; bloom on the sun and lamps not blown out on OLED; sunset and dawn gradients smooth (no bands); backlit sails glow, not white-out; night still steerable; Safari iOS and Chrome Android load with no console errors; legacy switch returns the old picture.
Targets (unmeasured): post on minus off at most 2.5 ms desktop-mid, 4 ms phone-mid at medium.
