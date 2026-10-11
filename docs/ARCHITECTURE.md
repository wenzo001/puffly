# Architecture

One rule explains the whole layout (SPEC.md §86): **any future platform must be able to reuse the
game, and only re-implement input, rendering and platform integration.** Everything below exists to
keep that sentence true, rather than merely written down.

```
                    apps/web  (Vue shell: input, chrome, sheets, PWA)
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
   game-scene      game-audio     game-storage      ← adapters (may touch the platform)
        └──────────────┼──────────────┘
                       ↓
                  game-core                          ← pure TypeScript, no platform APIs
                       │
              game-content (data only)
                       │
                  shared (math, rng, clock, colour)
```

## The direction of dependence is enforced, not decorated

`tests/architecture.test.ts` reads the shipped source of every package and fails on
`window`, `document`, `indexedDB`, `AudioContext`, `requestAnimationFrame`, `canvas` types,
`fetch`, `crypto`, `Math.random()`, `Date.now()`, `new Date(`, plus imports of `vue`,
`@tauri-apps/*`, or any adapter package from inside the pure layer. It also fails if an adapter
imports `createEngine` — an adapter observes, it does not drive (SPEC.md §48).

Two details are deliberate, because both have produced fake green before:

- **Comments are stripped before matching.** The pure layer's own doc comments contain the words
  "Vue", "DOM" and "Canvas". Without stripping, the guard would have forced those explanations to
  be deleted to get a green run — the documentation sacrificed to the metric.
- **String literals are not stripped, and every matcher has a positive control.** Import
  specifiers live in strings; an earlier version blanked string literals while removing comments,
  which made all twelve import checks pass *nothing*. A guard that cannot fail is decoration, so
  `the scanner itself reports every shape it claims to catch` feeds each matcher text it must
  report — including the `canvas type` control, which hands the scanner a bare
  `CanvasRenderingContext2D` and must be reported — so platform usage cannot pass unseen.

`eslint.config.mjs` enforces the same boundary while writing code (`no-restricted-globals`,
`no-restricted-imports`, `no-restricted-syntax` on the pure packages), so the failure arrives at
save time rather than at test time. The linter is the early warning; the test is the door.

## State is continuous, happenings are discrete

SPEC.md §11 names eleven lifecycle states. Game Core splits them in two kinds, because the
alternative — letting a handler decide what "burning" means — produces four slightly different
definitions of the same word:

- **interaction-driven** (`IDLE`, `PICKED_UP`, `LIGHTING`, `PUFFING`, `EXTINGUISHING`,
  `EXTINGUISHED`, `DISCARDED`) are entered and left by input handlers; they last exactly as long as
  the player is doing the thing;
- **derived** (`NEAR_END` → `ASH_READY` → `RESTING` → `BURNING`, in that priority order) are
  recomputed from the simulation every step by `deriveAmbientState`.

The legal edges live in one table, `stateMachine.ts:TRANSITIONS`, and `setState` refuses an
illegal edge instead of throwing: a stranded cigarette is a worse user experience than a missed
transition, and the exhaustive table test is what keeps the table honest.

Adapters therefore consume two different things and never mix them:

| | what it is | who reads it |
| --- | --- | --- |
| `GameState` | continuous fields, read every frame | scene, audio (beds), shell chrome |
| `EngineEvent` | discrete `burst` / `world` / `session` / `transition` / `unlock` | scene (particles), audio (cues), storage (log) |

`GameStateView = DeepReadonly<GameState>` is what the core hands out, so the §48 rule "the scene
must not modify game state" is a compile error rather than a convention. rendering.test.ts（2026-10-10 随 2D 光栅套件退役） then
proves it at runtime by handing the scene's reader a **deep-frozen live snapshot** and driving a whole
break through it: any write would throw a TypeError instead of corrupting the simulation.

## One copy of every fact

- Geometry lives in the core: `stage.ts` owns the stage box (`stageBoxFor`), the prop table for
  each shape (`StageLayout`, `layoutFor`) and the one distance metric (`stageDistance`) that both
  hit-testing and drawing use, so they cannot drift apart on a phone any more than they can on a
  desktop (SPEC.md §55, §79). The renderer's `createViewport` calls the same `stageBoxFor` rather
  than keeping its own letterbox maths, and `engine.setStageAspect` is the only way the core learns
  the shape — which is also why `LAYOUT` is now just the regular table inside that file.
- Content→visual conversion lives in the core too: `state.style` (`SceneStyle`) is assembled from
  content by the engine, so a renderer stays a pure function of state and never imports content.
- Counters live in one place. `Progress` is owned by the engine and exposed as
  `engine.progressSnapshot()`; the shell mirrors it into storage and does not keep a second tally.
  `Statistics` is **derived from the session log** on demand (SPEC.md §70), so no counter can
  disagree with the events that produced it.
- A flare is produced by one function (`ember.forceFlare`), reached both by the ember's own
  `flareChance` and by a pooled `ember_flare` world event; `dropAsh` likewise. The `lighter_failure`
  rule keeps weight `0` in the scheduler precisely so it cannot become a second coin flip competing
  with `LighterContent.failureChance`.
- The ashtray catch radius, the flick threshold and the particle budget are each named once and
  read from there.
- A fact that is derived from something else is not also stored. `LighterSnapshot` carried an `at`
  point copied from the default layout at construction; the hit anchor was recomputed from the live
  layout every time the stage changed shape, so on a phone the lighter was drawn 63px from where a
  tap would land and on top of the pack. The field is gone and both sides read
  `state.stage.layout.lighter`. A stored copy is only safe with a writer, and this one had none —
  which is also why no test failed: nothing read the field, so nothing could notice it was stale.
  The guard reads the draw call's emitted coordinates back rather than asking the layout where the
  prop is (prop-placement.test.ts（2026-10-10 随 2D 光栅套件退役）), because the weaker version of that test passed on the broken
  build.
- A rebuild-by-hand drops every field it does not name, so it may only drop one it has a replacement
  for. Two instances, one shape: `readSettings` and `cloneSettings` both rebuild `Settings` from a
  typed-out list of keys, which is how a player's chosen item and their chosen language came to
  vanish on the next reload while the memory fallback — which hands back the object it was given —
  kept both; the two adapters are now pinned to the same fixture (`makeChosenSettings`), so a field
  that is not listed in both places is a failing test rather than a silent loss. And
  `BedController.sync` rebuilt a `BedTarget` as `{ gain, cutoff }`, which computed, wired and then
  discarded the draw bed's `formant` one step before it reached the graph — no type error, no red
  test, just a filter nobody was driving. It spreads the target now and overrides only the field the
  trim touches. Where a rebuild has to enumerate (validation, where every field needs a bound), the
  enumeration is pinned by a fixture; where it does not, spread it.
- A clearance written as a fraction cannot bound a thing measured in pixels. `CHROME_CLEAR_Y = 0.72`
  held every prop *anchor* above the line and every layout passed, while on a phone turned sideways
  the pill started at 0.66 of the stage and the rod lay at 0.695 — drawn behind the button that picks
  it up, which is the complaint the constant was written to prevent. The rule was not wrong so much as
  dimensionally wrong: the chrome is 132 CSS pixels, so the line it implies moves with the height of
  the window. Where a constant has to meet a fixed-pixel neighbour, derive it from that neighbour at
  the size it actually is — and keep the identity case intact, so a layout that already clears the
  line comes back unchanged and nothing else in the scene, or in §71's replay, moves.
- A colour layer that reaches only a nearly transparent gradient is a layer nobody can see.
  The old `applySkin` wrote a skin's 烟羽 into `view.smoke.tint`, and the only reader of that field
  was the density veil, whose alpha tops out at 0.033; the plume's colour had already been decided in
  the core and frozen into each particle when it was born. The raster suite of the day (`skin.test.ts`)
  said "the four layers land" and was right — about the view — and no test could tell the difference
  between that and a picture that never changed. What measured it instead (`plume-palette.test.ts`,
  retired with the raster suites on 2026-10-10): hand the renderer a palette
  whose only non-default layer is the one under test (the other three are copied back from the
  unskinned view), record every colour the renderer asks a sprite for, and compare two runs of the
  same seeded puff index-aligned. Then a difference can only have come from that layer, and "0 of 60
  sprites changed" is a number rather than an impression.
- A shared field with a per-entity seed is not a shared field. The smoke pool sampled its curl noise
  with each particle's own `noiseSeed`, and that argument selects a *different lattice*, not another
  place in the same one — so two neighbours were pushed in unrelated directions, no puff ever had a
  body, and the picture read as out-of-focus fog while every per-particle number looked correct. The
  field still looked alive, which is why it survived: the thing to ask of a flow field is whether
  nearby particles move *together*, so what is now measured is the plume's shape where the player
  actually sees it — every burst the scene has aired, in one pool, narrowed and stretched — rather
  than one burst's own tally, and not particle count (`plume-shape.test.ts`).
- A shape metric can measure travel and call it shape. The elongation that "proved" the shared field
  worked was really measuring how far the cloud had gone: anything that moves fast is stretched. The
  plume passed it while the rendered frame showed something else entirely. What found that was not a
  better metric but a picture — the raster technique of that era recorded every sprite the renderer
  asked to blit (`sprites.ts` baked them then; both retired on 2026-10-10), composited the discs
  off-screen, and looked. One frame said it: 698 sprites asked for, 50 of them on screen.
- One constant shared by two materials is wrong for one of them. Air drag in the particle pool was a
  single 0.9/s, which is about right for a flake of ash and an order of magnitude too gentle for an
  aerosol; terminal velocity is rise/drag, so smoke crossed the whole stage in under two seconds and
  left every breath off-screen. The fix moved the constant onto the particle, chosen from the burst
  kind — not onto the eleven recipes, and not onto the content table, so the styles stayed
  distinguishable. When a number is shared, ask first which kind of thing it was actually measured
  on (`intake.ts:SMOKE_DRAG`, `plume-on-stage.test.ts`).

## Determinism and replay

All randomness flows through `shared/rng.ts` (sfc32, integer-only). `Math.random()` is forbidden by
the guard, and `Date.now()` / `new Date()` are forbidden in the core: the shell supplies wall-clock
time and the UTC offset, so a save replays identically on another machine.

`GameEngine.send()` does not apply an input immediately. It resolves the target — a keyboard or
shortcut input names an anchor and borrows its position, a pointer keeps the pixel it was pressed
at (§65) — then
**snaps the input to the next fixed step** (`STEP_MS = 1000/60`) and queues it. That is what makes
§71 real rather than aspirational: `replaySession(session, content)` rebuilds an engine from
`seed`, `engineStartWallClockMs` and the content ids, advances to each recorded step, and reproduces
the event stream — `replay.test.ts` asserts the replayed `SessionEvent` sequence equals the recorded
one, including `SESSION_START`/`SESSION_END`, which replay re-issues at the same steps.

rendering.test.ts（2026-10-10 随 2D 光栅套件退役） adds the visual half of the same promise: the same `Burst` seed expands into the
same particle layout, so a reproduced bug looks like the bug.

The other half of that promise is a *counting* rule, and it constrains how the world may be made
calmer: a per-frame dice roll is allowed to stop being read as a value, but not to stop being
drawn. `tickWorld` still samples `wind.variance` every frame and `tickSmoke` still rolls its ±0.3
turbulence jitter — the sample is now the *target* of an `approach()` rather than the field itself,
which is what removes the shiver (§22) without touching how many draws a frame consumes. Note what
guards this and what it does not: `replay.test.ts` compares the replayed event **type sequence and
length**, not the rng call count, so it catches a shifted sequence only because shifted draws pick
different events. Removing a draw is the mistake the rule forbids precisely because nothing would
say so loudly.

A break the app never got to watch is the one place the wall clock is allowed to overrule the
simulation. `openBreakSnapshot()` writes down the burn position and the moment the cherry caught;
the next boot hands that record back and `restoreOpenBreak(record, now)` spends
`now - litAtWallMs` on the rod (§81 4). It is a restore, not a replay: nothing that happened during
the unseen gap is invented, so the resumed session's `inputs` hold only what the player did after the
page came back. The clock is put back by the same arithmetic, which is why a resumed break shows the
minute it is really in instead of a fresh `03:00`, and why a break that would have ended in a pocket
comes back ended.

## Where the interface ends and the scene begins

The stage owns everything a player touches. The shell owns three readings of the same state
machine — the head-up row, the pill, and a rail whose first three cells are indicators, not
buttons — and all three fold together on the core's word (`ui.controlsVisible`). Two rules keep
that split from rotting back into an app:

- **the core decides visibility, once.** `ui.controlsVisible` folds together "has the player ever
  touched anything", "how long since they did", "are they mid-draw" and "did they just swipe the
  interface away". The shell renders a boolean; it never invents its own fade, so a desktop pet
  gets the same behaviour for free (§10);
- **the scene's numbers live inside the scene's sheets.** The break's clock is a row in `this
  break`, not an overlay, and the stage mirrors it as `data-break` for the same reason the cue
  channel is mirrored as `data-cues`: a fact nothing can read is a fact nothing can check. The
  mirror list is `data-cues`, `data-break`, `data-phase`, `data-affordance` and `data-aim` — the
  last of them because the props' positions are a function of the window (the table lifts, the
  canvas letterboxes), so anything aiming from outside the page has to read them rather than carry
  a copy. `apps/web/src/__tests__/stage-mirrors.test.ts` pins each attribute to the summary field it
  mirrors, and the browser layer reads these and never a word: an `aria-label` is translated, so a
  check against its text passes in one language and fails in the next;
- **a language is a preference the core carries and never reads.** `Settings.language` travels with
  the save so a phone and a desktop agree after a sync, and every word is chosen in
  `apps/web/src/i18n` — target language, then English, then no visible word at all. Two things
  follow, and both are enforced: a test scans the pure layer for any read of a language, because a
  simulation that picked words could burn differently on two machines and would break §71's replay;
  and right-to-left mirrors the sheets (logical CSS properties only) and never the stage, because
  the rod burns the same way whichever way you read;
- **the stage's box sizes the canvas, not the window.** `resize()` reads the stage element's own
  rect and lets `visualViewport` only take space away (the mobile chrome case), so the desk column
  can take 260px out of the scene without the canvas sliding underneath it — hit-testing, the stage
  aspect and the renderer all keep agreeing on one box;
- **a sheet takes the handle's place.** The pill is the scene's gesture handle, and it sits exactly
  where a sheet's rows are: opening any sheet folds the pill away (the rail stays, because it is
  how the sheet closes). The archive card is not a sheet, so a rod held mid-draw keeps its handle;
- **the type floor is a source rule.** Nothing the shell can put on screen is declared below 15px
  (Smoke Ritual `accessibility.minFontSize`), in any of the three shapes the styles write sizes in —
  `apps/web/src/styles/__tests__/font-floor.test.ts` scans every shipped `.vue`/`.css` for it, and
  the scan carries its own positive control so it cannot pass by matching nothing;
- **a ceiling is a number the page obeys and the break does not.** `Settings.dailyLimitSticks` is
  set in the settings sheet and read in exactly one shell function, `isOverLimit`: reaching it
  greys the ring and swaps its digit for `◇`, and the next break starts as easily as the first.
  The scan that watches the language watches this field through the pure layer too, because a
  simulation that obeyed a ceiling would be a lock wearing a statistic's clothes — and the copy
  table is scanned for the sentences that would praise or threaten;
- **the tray's answer to a carried rod is back (§20, task #134).** The 2D layer drew three readings
  of it — a lit rim while the rod is being carried toward the tray, a rock when ash lands, a mound
  that grows with the load — and the 3D scene had inherited only the mound's *box* (the Demo's
  126 × 22, gated on the tray's grams). The retirement counted that loss: of the deleted package's
  24 exports with no name left in the tree, all but one are canvas entry points, and the one that is
  not — `TrayFeedback` — had its guard in the suites retired with it. The model now lives here
  (`props.ts`: `TRAY_FEEDBACK`, `stepTrayFeedback`, `trayRock`, transcribed from
  `git show <退役那一笔>^:packages/game-renderer/src/props.ts`), the scene steps it every frame
  (`SceneStage.placeTray`), and the two device checks read the answer off the meshes: the invitation
  on the halo's and the rim's own materials, the rock on the bowl's `rotation.z` after a real 磕灰.
  Each of those two has been reddened by muting exactly the output it reads.

## Performance

SPEC.md §54 and §81 (6/9) are why the interface is kept cheap (the painted layer's own answers
retired with it on 2026-10-10; the scene inherited the constraints):

- no DOM particles, and Vue never drives a particle: the scene's own frame loop (`SceneStage`) reads
  the state each frame, while the shell republishes a summary to the component tree at 5 Hz so
  components re-render on a human timescale;
- a single fixed-capacity `ParticlePool` with ring-buffer allocation and zero per-frame allocation;
  over budget, the oldest slot is recycled rather than the frame stalling;
- the scene draws the pool from one instanced mesh fed by a fixed particle budget — geometry and
  materials are built once, never per frame;
- quality tiers set the budget (1400 / 800 / 380, and 160 under `reducedMotion`) — SPEC.md §64;
- `quality: 'auto'` is measured, not guessed: the shell keeps an exponential average of its own
  frame times and walks the tier down twice as eagerly as it climbs back, and a coarse pointer
  caps the canvas at 2× DPR instead of 3× (§54, §66);
- `dt` is clamped to 250 ms per frame and 50 ms per render step, so a backgrounded tab neither
  fast-forwards the burn nor teleports smoke.

## Extension seams

The interfaces a new platform implements are declared in the pure layer, so the seam is part of the
contract rather than an afterthought: `RendererAdapter`, `AudioAdapter`, `InputSink`, `ClockSource`,
and `StorageAdapter` (`game-storage`).

- **Desktop pet (SPEC.md §40-44, §78)**: `apps/desktop` would create a transparent, frameless,
  always-on-top window, mount the *same* `SceneStage` (TresJS draws whatever surface it is given),
  convert native mouse events into `GameInput`, and reuse `game-storage` with a filesystem
  `StorageAdapter`. No game logic is copied; `game-core` is imported once — it has never known which
  surface was asking.
- **Renderer swap (§79)**: only if a transparent-window or GPU requirement actually appears does a
  `DesktopRenderer` get added; the core does not change, because it never knew which renderer existed.
- **New content (§77)**: adding a cigarette, room, lighter, tray, smoke style or sound bed is an
  entry in `game-content` plus an `UnlockRule`. Nothing in `game-core` is edited — the pools,
  weights, and effects are looked up by id.
- **New world event**: the id is listed in SPEC.md §21, so it already has a rule in
  `WORLD_EVENT_RULES`; adding one means a rule plus an `applyStart` case, not a new protocol.
- **Haptics (§30, S6)**: `Settings.haptics` is a 0..1 level — it used to be a boolean, and the deck's
  save schema writes a number, so `readSettings` maps a legacy `true`/`false` to 1/0 instead of
  refusing the record. The web shell is the reader: `haptics.ts` holds the shape table and the
  patterns, and `navigator.vibrate` is called from exactly one place. A native shell may map the same
  number to a real amplitude. Nothing in `game-core` reads it.
- **Realism (§S6 「写实度 80 / 20」)**: `Settings.realism` is the second 0..1 knob and shares
  `readSettings`' one level reader with `haptics`, so the two cannot disagree about what a lying field
  means. It is read by exactly one thing — `cartoonScale` in `game-scene` — which governs the five
  feedback surfaces S7 lists: the ignition push-in, its edge vignette, the tray's rock when ash lands,
  how much of a spark's fall the table gives back, and how far the exhaled plume is lifted above the
  alpha Game Core authored for it. The last one goes through `intakeBurst`'s `plumeLift` rather than
  through the draw, because the lift has to land on the breath and on nothing else — and a particle
  carries no kind for the draw to ask about (`drawSmoke` was the 2D entry that used to ask; it retired
  on 2026-10-10, and the rule it enforced is now the reason `plumeLift` exists at all). `0.8` multiplies
  by exactly 1, so the deck's default is
  the shipped look rather than a change to it, and the ramp is written so each of the row's six detents
  is a different frame (a capped `(1 - realism) / 0.2` left four of them identical). Nothing in
  `game-core` reads it either — **and that half is currently true by inspection, not by test**: the
  guard that pinned it, realism.test.ts（2026-10-10 随 2D 光栅套件退役）, ran one session at `0` and at `1`
  and compared
  the whole state plus every event, which is the Frozen Core rule a skin already lives under, applied to
  a look — and it retired with the raster suites without a successor. Today `grep -rn realism
  packages/game-core/src` answers only the field declaration and its default. Restoring that red line as
  a live judgement is #140; until then this sentence is the guard, which is the weaker thing.

## Verification layers

Each layer proves something the one below it cannot. Layers 1-4 run on every push and pull request
through `.github/workflows/ci.yml`; layer 5 needs a real browser, so it is run by hand against
whatever URL you point it at:

1. **Per-package unit tests** — the state machine, the systems, the particle pool, the cue planner.
2. **`tests/architecture.test.ts`** — the dependency rule, with positive controls so a guard cannot
   pass by matching nothing.
3. **`tests/sessionLoop.test.ts`** — one whole break on the shipped content, through the real
   renderer, and then the statistics that reach the screen are checked against the log (§70).
4. **`tests/smoke/served-build.sh`** — the built artefact served the way Pages will serve it. A wrong
   base path is invisible to every layer above and is a blank page in production.
5. **`tests/smoke/touch-device.mjs`** — a real browser, on the shapes the product ships on: phone
   portrait, phone landscape, and a desktop window driven with a mouse (the only pass where the hit
   radii are not widened for a finger, so it is the only one that can see a rod whose far half has
   gone untappable). A break completed with pointers, targets that fit a finger, no double-tap zoom,
   no prose and no digits on the stage — at most the one gesture word, which is checked to change
   with the affordance and to disappear when settings say so — a drawn breath that measurably
   changes the pixels, the interface folding under a swipe down over nothing while the rod keeps
   burning, and the two ways the operating system takes a phone away: frames that stop (it wakes to
   a rod that kept burning) and a page that is reloaded (it comes back to the same break, at the
   minute the clock says). **104 checks** as of this writing, and the readings it makes are of the
   chrome agreeing with the state rather than of pixels that look nice: the digits inside the ring
   against the knob position of the 力度对照图 under the pill, the wordless tier's hint strip
   carrying a drawing rather than a word, the vibration row's waveform bar count against the number
   the same row prints, and the fact that wearing a skin which names a room never leaves a locked
   room selected. It runs on a developer machine too (`PUFFLY_PLAYWRIGHT` + `PUFFLY_CHROME`, headless
   Brave here), and against the build the gate produced rather than the dev server, so what it
   measures is what ships.

## Deliberately not built

Not every idea in the spec is a feature to ship on day one, and pretending otherwise would add
complexity for hypothetical futures (SPEC.md §89, 9-10):

- **no desktop or mobile shell yet** — only the seams above, which is why `apps/` holds `web` alone;
- **no accounts, sync or telemetry** (§52) — there is no network code in the repository;
- **no i18n in the game core** (§5) — the core is language independent by construction. What the
  scene itself puts over the picture is one gesture verb, drawn over the object the core is already
  nudging (`state.ui.affordance`: `pick` / `lighter` / `puff` / `flick` / `extinguish` / `discard`);
  the design also names its chrome — the bottom rail's tabs, the main button's word, the desk
  column's rows and the sheets — and every one of those words comes out of the copy table in
  `apps/web/src/i18n` with the same three-tier fallback, never as a string in a component. `aria-label`
  and the PWA manifest are where prose is allowed to live. The core never sees a word: it publishes
  an affordance, and the shell decides what language, if any, that affordance wears;
- ~~**no game engine dependency** (§76) — Canvas 2D and `requestAnimationFrame` only~~ — overturned
  by the 3D rewrite: the interface is TresJS + `three/webgpu` in `game-scene` (Canvas 2D retired
  2026-10-10), and the rule that still holds is the one below it: the *pure* layer names no engine;
- **no medical claims or recovery percentages** (§84) — `smokeFreeDays` is a count of days on an
  anchor the player sets themselves, and nothing in the UI turns it into a health statement.
