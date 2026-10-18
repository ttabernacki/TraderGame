# Render upgrade: scope and plan

Status: scoping only. No `src/` change. Author: graphics scoping pass, branch `claude/repo-wipe-kbyvad`.
Anything marked **UNVERIFIED** was not, or could not be, tested in this sandbox.

---

## 1. Inventory of the current stack

Three.js 0.170, `THREE.WebGLRenderer` (WebGL2). `src/render/*.ts` is 10,495 lines, 349 of them sound (out of scope).

| File | Lines | What it does | How it is drawn |
|---|---|---|---|
| `renderer.ts` | 1227 | Scene, camera modes, lighting rig, fog, shadows, env cube, quality/auto-step-down, `RenderFrame` contract | `NeutralToneMapping`, exposure 1.42, `FogExp2`, one sun `DirectionalLight` shadow map (1024/2048, tight on the ship only), hemisphere light |
| `ocean.ts` | 1280 | Radial-grid sea, 8 Gerstner waves, Kelvin wake from 20 track points, foam, shoal colour from soundings, sun glitter, moon road | `ShaderMaterial` (GLSL, ~540 lines of it), samples a **128px cube map** of the sky (`CubeCamera`, refreshed every 8 to 40 frames, cross-faded) for reflection |
| `sky.ts` | 609 | Sky dome, procedural fbm cloud deck (3 to 6 octaves), sun disc, 900 filler stars + named stars, moon | `ShaderMaterial` dome + star points; clouds are a 2D noise lookup on the dome, not volumetric |
| `land.ts` | 928 | Coast terrain from the real height field | Standard-family materials, vertex colour, fog uniform patched in |
| `settlement.ts` | 1136 | Towns, quays, buildings | Merged geometry, standard-family materials |
| `coastScenery.ts` | 444 | Trees, rocks, surf line | Standard-family |
| `shipMesh.ts` | 2209 | Caravel/nau/etc. hulls, rig, sails (CPU-animated cloth belly), crew | ~32 `Mesh*Material` uses, merged geometries, `castShadow` |
| `junkMesh.ts` | 1317 | Chinese junk hulls (campaign shelved) | 23 standard material uses |
| `shipLook.ts` | 313 | Hull/sail colour, wear, flags | Data and texture helpers |
| `spray.ts` | 156 | Bow spray particles | `ShaderMaterial` points |
| `life.ts` | 412 | Birds, dolphins, rain | Standard/basic, scaled by `QUALITY.life` |
| `finish.ts` | 56 | Vignette and sun glare | **Two CSS divs over the canvas**, not post-processing |
| `quality.ts` | 59 | low/medium/high, `auto` steps down at <32 fps over 12 s | pixelRatio 1.25/2/2.75, shadow 1024/2048, soft shadows, env refresh, cloud octaves, life |

Only 4 files use custom GLSL (ocean, sky, spray, plus patched fog in land/settlement). There is **no post-processing pipeline** (no `EffectComposer`, no render targets besides the env cube), no SSR, no bloom, no depth texture, no cascaded shadows.

### Measured budget (headless, swiftshader, title-screen demo ship at sea)

Method: a temp esbuild bundle of `main.ts` with an init script wrapping `drawElements/drawArrays` on the WebGL2 context, counting per framebuffer-switch pass. Harness in the scratchpad (`m.js`, `inj.js`, `meas2.cjs`; not in the repo).

- Desktop 1280x800: a main colour pass is about **120 draws / 137k triangles**; a second class of pass (env cube face or shadow, I could not cleanly attribute them) shows 103 draws / 9k tris and 8 / 11k; a "216 draws / 135k" pass repeats in bursts (env refresh). So roughly **120 to 220 draws and ~135k triangles per frame**.
- Phone-sized viewport (390x780, DPR 1 in emulation): **~66k triangles**, same 216-draw pattern (life/LOD scaling). Real phones run DPR up to 2, so fill cost is 4x what I measured.
- Frame time: **not measurable here** (swiftshader ~1.6 fps). I have no real-GPU number. The existing auto-step-down at 32 fps is the only field evidence of cost, and it is not reported anywhere.
- JS bundle: 1.98 MB raw, 637 KB gzip.

### Where the ceiling is (what looks dated, and why)

1. **Flat lighting, no post.** Tone map plus CSS vignette. No bloom (the sun is a sprite that "the tone curve holds below white", so `finish.ts` fakes the glare with a gradient div), no grading, no depth cue beyond exponential fog. This is the single biggest "2012 WebGL" tell.
2. **Sea reflects a 128px cube of the sky**, so it can never reflect the ship, land or clouds' fine structure. No planar or screen-space reflection, no subsurface scatter in wave crests, no foam persistence (foam is a function of crest height, not advected).
3. **Clouds are 2D noise on a dome.** They do not parallax, have no volume, no crepuscular rays, and never cast shade on the sea.
4. **Sky is hand-coloured gradients**, not scattering, so dawn/dusk and haze colour are hand-tuned per hour instead of physical (aerial perspective on land is the fog uniform only).
5. **Shadows only for the ship** in a tight frustum; the sea, land and towns receive none, and sails cast no translucent light.
6. **Ships**: MeshStandard hulls with merged geometry; sails are lit as opaque cloth (no translucency, no back-lit glow, no cloth normal detail); rigging is thin lines with no sag shading.
7. **Land**: vertex-coloured terrain with no texture detail, no slope/aspect shading variety, no surf-foam intersect with the shore.
8. **Weather**: rain is billboard-ish particles; no wet-deck, no sea-surface rain ripples, no lightning light, fog is global not volumetric.

The ocean math is not the weakness (8 Gerstner waves with spectral spread, shoal tint, wake). The weakness is everything *around* it: reflection, post, light transport.

---

## 2. The GPU question

**"GPU acceleration" is already on.** `WebGLRenderer` is WebGL2 on the GPU (ANGLE/Metal/D3D/Vulkan). What WebGPU would add is:

- **Compute shaders** (real FFT ocean spectra, GPU particles, clustered effects),
- lower driver/CPU overhead per draw (not our bottleneck at ~200 draws),
- Three's `WebGPURenderer` + **TSL** node materials (one shader source for WebGPU and WebGL2 backends),
- storage buffers, better texture formats, more render-target flexibility.

What it does **not** give for free: any visual change. Every effect in section 3 is achievable in WebGL2, at ~0 to +30% more cost than WebGPU for fragment-bound work. Only the FFT ocean and big particle counts genuinely want compute, and 8 Gerstner waves plus a good normal-map layer get ~80% of the look.

### Support status (as of my knowledge, mid-2026; **verify before committing**)

- Chrome/Edge desktop since 113; Chrome Android since 121 (Android 12+, Qualcomm/ARM GPUs, with a blocklist); Safari 26 (macOS/iOS/iPadOS 26) shipped WebGPU; Firefox shipped on Windows in 2025, other platforms later. So roughly "most current desktop, a growing minority of phones, older iPhones and many Android devices not".
- Phones are exactly where we are tightest on budget, and exactly where WebGPU is least deployed. A WebGPU-only game would lock out a large part of the phone audience.

### Three's `WebGPURenderer` (r170, `three/webgpu`)

- **It does auto-fall-back to a WebGL2 backend** if `navigator.gpu` or the adapter is missing (`forceWebGL` forces it). Cost of that fallback: the fallback path is a re-implementation inside the WebGPU renderer (node-based), so it is **not** the mature `WebGLRenderer` path and has had more bugs and lower perf; and the build is bigger (`three.webgpu.min.js` 822 KB vs `three.module.min.js` 692 KB, +130 KB raw, before TSL).
- **`ShaderMaterial` / raw GLSL does not work in `WebGPURenderer`.** Ocean, sky, spray, and the fog patches in land/settlement (≈1,500 lines of GLSL and `onBeforeCompile`) must be rewritten as TSL node materials. That is a port of the visual identity with no visual gain on its own, and every one of those shaders carries hand-tuned physical decisions recorded in comments.
- r170 WebGPURenderer is not API-stable across Three releases; pinning is required.
- Async init (`await renderer.init()`) changes the Renderer constructor contract in `main.ts`.

### Artifact host and CSP

- WebGPU needs no network and no `unsafe-eval`; WGSL is compiled by the browser. No new script origin. Inlined module bundle still works. Size grows by the webgpu build (~+130 to 300 KB raw).
- **UNVERIFIED**: whether the artifact host embeds the page in a sandboxed `iframe` that withholds WebGPU (no `allow` attribute needed in Chrome, but Safari/Firefox policy differs). Test the real host before any WebGPU commitment. WebGL2 already works there.
- WebGPU only exists in **secure contexts**: confirmed here that `navigator.gpu` is `undefined` on `file://` and `about:blank` but defined on `http://localhost`. Our existing harness loads `file://`; a WebGPU harness must serve over localhost.

### What this sandbox can and cannot do (tested)

- Headless Chromium with `--use-gl=swiftshader --enable-unsafe-swiftshader` gives WebGL2 on `SwiftShader Device (Subzero)`, `EXT_color_buffer_float` present, max texture 8192.
- Adding `--enable-unsafe-webgpu --enable-features=Vulkan,WebGPU --use-angle=swiftshader` on a localhost page: `navigator.gpu.requestAdapter()` **succeeds** (vendor google, architecture swiftshader). So a WebGPU adapter exists in software. **UNVERIFIED**: that Three's WebGPURenderer, compute pipelines and the real game render correctly on it, and at what speed (expect slower than the 1.6 fps WebGL path).
- Neither path says anything about real GPU performance, mobile thermal behaviour, Safari, or tile-based GPU quirks (precision, half-float render targets, MSAA cost). **No claim in this document about frame time on real hardware has been measured.**

### Recommendation

**Stay on WebGL2 (`WebGLRenderer`). Do not migrate to `WebGPURenderer`.** Reasons: all the visual wins in section 3 are WebGL2-feasible; the port rewrites every shader for no gain; phone coverage of WebGPU is incomplete; the WebGL2 fallback inside WebGPURenderer is the less mature path; and this sandbox cannot validate a GPU path visually. Re-evaluate **one optional tier**, `ultra` on WebGPU-capable desktops with a compute FFT ocean (package P9), only after R1 to R6 ship, behind a hard feature detect, with the WebGL2 ocean kept as the default and the fallback. Do not make WebGPU a prerequisite of anything else.

### Testing consequence (design tests around not having a GPU)

1. **Deterministic screenshot harness under swiftshader**: fixed seed, fixed `simTime`, fixed camera, fixed viewport, wind/cloud/time-of-day matrix (e.g. dawn, noon, dusk, night x calm, gale, rain x chase, deck, masthead cams). Drive `Renderer.render(frame, 0, 0)` directly from a test page, not the whole game. Compare to golden PNGs with a perceptual tolerance (pixel diff % plus mean colour delta), software-GL results only. Goldens are *regression* goldens (did it change), not *quality* approval.
2. **Structural metrics** that are GPU-independent: draw calls, triangles, programs, texture memory, render-target bytes, shader compile count, bundle size. Assert budgets per quality tier.
3. **Shader compile check**: instantiate each tier headless and fail on any GL/shader error (`gl.getShaderInfoLog`).
4. **Manual-check checklist for the user** (the only real-GPU evidence): frame time on their devices per tier (the game should expose an FPS/frame-ms overlay behind a key, plus an `info.render` readout), phone thermal check after 10 minutes, Safari iOS and Android Chrome rendering, HDR/bloom not blowing out on OLED, no flicker in shadows/foam at the horizon. This list is a deliverable of R0.

---

## 3. Upgrade packages (ranked by visual impact per effort)

Cost: S under 2 days, M 3 to 7, L over 1 week. All packages stay on `WebGLRenderer`.

| # | Package | Visual win | Technique | Cost | Replaces |
|---|---|---|---|---|---|
| P1 | **Post stack** (bloom, grading, better AA) | Sun and lantern glow, sea glitter blooming, cohesive filmic look, dusk/dawn colour; removes the "flat render" feel. Biggest single jump. | `EffectComposer` (three/examples) or pmndrs `postprocessing` (smaller passes, merged effects): HDR half-float target, selective-threshold bloom (mip-chain, dual-kawase for phones), colour grade LUT/curve per time of day and weather, SMAA or FXAA on phones (MSAA is currently off there), keep Neutral tone map as final pass | M | `finish.ts` CSS vignette/glare (keep as low-tier fallback), `antialias: !phone`, the sun sprite hack |
| P2 | **Sky and atmosphere** | Physical dawn/dusk, aerial perspective on land and ships, correct haze colour, horizon glow, real twilight | Analytic Hosek-Wilkie or Preetham sky in the dome shader (cheap), or a small precomputed transmittance/multi-scatter LUT (Hillaire) drawn once per sun move; aerial-perspective fog from the same LUT replacing `FogExp2` colour; keep the existing star/moon system | M | sky gradients in `sky.ts`, global `FogExp2`, per-hour hand colours in `renderer.ts` lighting |
| P3 | **Ocean light transport** | Ships and coast reflected in the sea, crest subsurface glow, wind-driven whitecaps, persistent foam streaks, wet-look at hull | (a) screen-space reflection of the **ship and land only** at high tiers, or a cheap planar mirror of the ship layer into a half-res target, blended over the env cube; (b) fake SSS: crest-thickness x sun-behind term in the fragment shader; (c) whitecaps via a foam target advected by wave velocity (a small ping-pong texture, WebGL2-ok) plus detail normal map tiles; (d) wake and hull foam stamped into the same foam target; raise env cube to 256 on high | L | `ocean.ts` fragment shader foam/reflection sections, 128px env cube |
| P4 | **Volumetric-ish clouds and god rays** | Clouds with depth and parallax, sun shafts through gaps, cloud shadows drifting on the sea | Raymarched 2-layer cumulus slab at half-res into a render target (6 to 12 steps, blue-noise jitter, temporal reprojection), upscaled; radial-blur / depth-aware god-ray pass off the sun mask; cloud shadow as a scrolling mask in the sea shader | L | fbm cloud function in `sky.ts`; `cloudOctaves` quality knob |
| P5 | **PBR ships and cloth** | Sails glow when sun is behind, hulls with grain and weathering, believable rigging | `MeshPhysicalMaterial` with transmission off but a custom translucency term (`onBeforeCompile`) for sails (thin-surface back-light); cloth normal/weave detail map (procedural, tiny); hull albedo/roughness/AO atlases generated procedurally in `shipLook.ts` (no external assets, keeps single-file); rope sag shading via vertex AO; per-ship contact shadow on sea | M | standard materials in `shipMesh.ts` (and `junkMesh.ts` if the campaign returns) |
| P6 | **Lighting and shadows** | Ship shadow on sea, soft sail shadows on deck, land and towns shadowed at dusk, correct ambient | Stable cascaded shadow map (2 cascades: ship, near land) with texel snapping; sky-derived hemisphere + env irradiance (SH from the existing cube) instead of hand hemi colours; sea receives ship shadow only at high tiers; keep `PCFShadowMap` on phone | M | single tight shadow frustum in `renderer.ts` |
| P7 | **Land and coast** | Believable coastlines: slope/height/biome shading, surf line, foam at the shore, wet sand, distance haze, silhouettes at dawn | Triplanar procedural detail (noise in shader, no textures), slope and aspect blended colours, shore-intersect foam via depth or distance-to-coast baked into the shoal texture the ocean already reads (`uShoal`), LOD rings for far coast, merged instanced vegetation | M | land/settlement materials, flat vertex colours |
| P8 | **Weather** | Rain that reads (streaks, sea-surface ripples, wet deck sheen), lightning flash lighting the scene, squall wall, fog banks | GPU-instanced rain streaks in view space, ripple layer in ocean normal under rain, lightning as a light + sky flash driven by `storm`, height-fog bank with the P2 LUT; bow/hull spray upgraded to soft sprites with lit alpha | M | `life.ts` rain, `spray.ts` points |
| P9 | **WebGPU FFT ocean (optional ultra tier)** | Tessendorf spectrum sea, real Beaufort-scaled swell/chop, no visible tiling | Separate WebGPU context/renderer only for compute, readback-free into the main path is not possible across APIs, so this implies WebGPURenderer for the whole scene on that tier | L, risky | nothing: parallel path. Defer until after R6; may be dropped |

Rank by impact per effort: **P1, P2, P5, P6, P7, P3, P8, P4, P9.** (P3 and P4 are L but P3 should move up if screenshots show the sea as the weakest element after P1/P2.)

### Package risks and acceptance (per package)

Reference classes: **Desktop-mid** (integrated GPU, 1080p, target 60 fps, 16.6 ms), **Phone-mid** (2021 mid-range Android / iPhone 12, DPR 2, target 30 to 60 fps with auto-step-down). Numbers are targets, not measurements; real GPU timing is **UNVERIFIED** and is the user's to supply.

| # | Risks | Acceptance test |
|---|---|---|
| P1 | Half-float RT and MSAA cost on tile GPUs; bloom blowing out OLED; bundle +30 to 60 KB; phone fill-rate doubling | Frame ms delta (post on minus off) <= 2.5 ms Desktop-mid, <= 4 ms Phone-mid at tier medium; golden shots match "off" tier within tolerance when `post=false`; no GL errors |
| P2 | Precomputed LUT must regenerate when sun moves (cost spike); colour discontinuity at the day/night handoff | Hourly time-lapse (24 shots) has no luminance jump > 8% between adjacent hours; horizon colour matches fog colour within delta E 5 at 0.9 distance |
| P3 | Reflection pass doubles ship draw; foam target ping-pong bandwidth; swiftshader cannot judge look | Reflection layer <= 0.3 ms desktop (ship layer is ~1 to 3k tris per ship); foam persists 3 to 6 s after wake pass in a deterministic sequence; no seam at the radial grid LOD rings |
| P4 | Most expensive effect; phones will not afford it above `low` quality | Half-res raymarch <= 3 ms Desktop-mid, disabled below `high` on phone; god rays vanish smoothly when sun behind camera |
| P5 | Procedural textures cost startup time and memory; translucency hack looks wrong at some beta angles | Sail translucency shot at beta 0/90/180 is monotone in brightness vs sun angle; texture memory <= 16 MB total |
| P6 | Cascade flicker, shadow cost on phone | Zero shimmer: pixel diff between frames with a 1 cm camera nudge < 0.5% of pixels; shadow pass <= 1.5 ms |
| P7 | Triplanar noise ALU cost on phone | Coastal shot golden; land fragment <= 1 ms |
| P8 | Overdraw from rain on phone | Rain on => <= +1.5 ms phone; lightning does not trigger photosensitivity flashes (flash rate <= 3 Hz, capped, with a setting) |
| P9 | Not validatable here; two renderers to maintain | Only adopt if the user can measure a real-GPU win and Safari/Chrome Android pass the manual checklist |

---

## 4. Phased plan (the game is never broken)

Rule for every phase: a `?render=legacy` / settings switch keeps the old path (current `finish.ts`, current sea reflection) until the next phase's golden shots are approved. Each phase ends with the normal ship procedure (`vite build`, fold, `check-bundle`, republish).

- **R0 Instrumentation (S).** Frame-ms overlay, `info.render` readout, per-tier budgets in `quality.ts`, the deterministic screenshot harness (served over localhost), golden baseline of today's look, manual-check checklist. Nothing visual changes. This is the gate for everything.
- **R1 Post stack (P1) (M).** Composer with bloom + grade, behind quality tiers; AA on phone via FXAA/SMAA.
- **R2 Atmosphere (P2) (M).** New sky model and aerial-perspective fog; remove hand-tuned hourly colours as the LUT proves out.
- **R3 Ships (P5) (M)** and **R4 Lighting/shadows (P6) (M)**: independent, can interleave.
- **R5 Land and coast (P7) (M).**
- **R6 Ocean light transport (P3) (L).** Reflection, SSS, foam target, shore foam.
- **R7 Weather (P8) (M)** then **R8 Clouds and god rays (P4) (L).**
- **R9 Decision point**: WebGPU ultra tier (P9) only if the user wants it and has real-device numbers.

### Quality tiers

| Tier | Target | Pixel ratio | Post | Sky/clouds | Ocean | Shadows | Notes |
|---|---|---|---|---|---|---|---|
| low (phone-safe default for weak phones) | 30 fps | 1.25 | none (CSS finish kept), FXAA | gradient + 3-octave clouds | no reflection pass, 128 env | 1024 PCF, ship only | `life` 0.4 |
| medium (**phone default**) | 30 to 60 | 1.5 to 2 | bloom half-res, grade, FXAA | analytic sky, 5 octaves | foam target, SSS fake, 128 env | 1024 PCF, 1 cascade | no god rays |
| high (**desktop default**) | 60 | up to 2.5 | full bloom, grade, SMAA | + god rays, cloud raymarch half-res | + ship/land reflection, 256 env | 2048, 2 cascades, soft | |
| ultra (opt-in only) | 60 on strong GPU | 2.75 | + heavier bloom, motion-neutral | full-res clouds, cloud shadows | (+ WebGPU FFT if P9) | 4096 | never auto-selected; manual |

`auto` keeps today's behaviour: start phone at medium, desktop at high, step down on <32 fps over 12 s. Add: step-down also drops individual features first (clouds, reflection, post) before dropping pixel ratio. Persist the result as now.

### Decisions the user must make

1. **WebGL2 only, or also allow a WebGPU ultra tier later** (recommended: WebGL2 only until R9).
2. **Phone policy**: is phone a first-class target (default medium tier, 30 fps) or best-effort (low only)? This sets how much of R6/R8 reaches phones.
3. **Look target**: painterly/period (muted grade, soft bloom) or photoreal? Drives P1 grade and P2 sky tuning; pick reference images before R1.
4. **Bundle ceiling**: current 637 KB gzip; post and sky should add well under 100 KB gzip; accept a number, because the host has a size threshold (CLAUDE.md terser note).
5. **Real-device evidence**: will the user run the manual checklist and report frame ms per device? Without it, tier budgets stay guesses.
6. **Is the shelved Xiyang campaign coming back?** If not, skip `junkMesh.ts` in P5 (1,317 lines saved).
7. **Photosensitivity setting** for lightning and bloom (cap and toggle).

---

## 5. Parallel work with the gameplay build (BUILD_PLAN.md)

Yes, they can run in parallel with a small number of rules.

- **File ownership.** Renderer work owns `src/render/*` (plus new `src/render/post/*`, `src/render/atmosphere.ts`). The gameplay build (`BUILD_PLAN.md`: Ledger, Information, Market, Charts, Powers, Company, Year, Places UI) lives in `src/game`, `src/economy`, `src/diplomacy`, `src/crew`, `src/progression`, `src/ui`. They do not overlap.
- **Contract: `RenderFrame` in `renderer.ts`.** Gameplay produces it (`src/main.ts`) and render consumes it. Rules: render may only **add optional fields**; gameplay may only add optional fields; neither renames or retypes existing ones without the other side's sign-off. Any new weather/atmosphere input (e.g. cloud coverage layers, lightning) goes in as an optional field with a default.
- **Shared touch points** (merge-conflict risk): `src/main.ts` (constructs `Renderer`, builds `RenderFrame`, photo mode, quality button) and `src/ui` (quality toggle, new FPS overlay). Keep render changes in these to a few lines; land them in small separate commits.
- **`style.css`** has `#finish-vignette` / `#finish-glare` rules; R1 touches them.
- **Hull data** (`src/ship`) feeds `shipMesh.ts`: new hull classes from the gameplay plan need a render pass (P5), so coordinate on hull ids only.
- No renderer package changes game rules, save format or RNG; all effects must be time-of-day/weather-driven from existing `RenderFrame` fields, deterministic for the harness.

---

## 6. What I did not verify

- Any real-GPU frame time, any phone behaviour, any Safari behaviour, any WebGPU rendering (only that a software WebGPU adapter is obtainable in this sandbox on a secure-context page with the flags above).
- Whether the artifact host's iframe/CSP permits WebGPU.
- Exact draw-call attribution per pass (counts are real GL draws, but I could not cleanly label env-cube vs shadow vs main passes).
- WebGPU browser-support figures and Three r170 WebGPURenderer behaviour are from my knowledge, not tested; check current release notes before relying on them.
- Bundle-size deltas for each package are estimates.
