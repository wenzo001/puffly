# Visual and CI review, 2026-10-15

Scope: the five complaints handed in by the player (scroll area leaks above the panel, the skins panel
flickers at the bottom, the lighter/pack/ashtray read black, the screen whitens and flickers while
inhaling, the rod is too thick and thins when drawn), plus "is the code, the picture and the goal still
the same document", plus the one red CI job.

Everything below was measured on this machine against `apps/web/dist` built with
`PUBLIC_BASE=/puffly/ npm run build`. Re-run commands are printed with each claim, because a number
without its ruler is a story.

## 1. CI: the one red job, and where it actually breaks

`origin/main` is `31d0461`. Its five check-runs: **Lint/types/tests success, Build success, Publish
success, the device suite failure, Device job report neutral.** So there is exactly one red job, not
four, and the report that job publishes says where it dies:

```
scene {"backend":"webgl2","frames":13, … "gpuAdapter":null, …}
### suite: 67
FAIL  the rail, the head-up row and the sheet stay tappable together — {"missing":["close"],"blocked":["rail","head"]}
FAIL  a press on the scene puts the open sheet away — sheets 0 then 0
FAIL  the head-up row carries the digits … — {"inRow":0,"outside":0}
FAIL  单口时长 leaves the rod in charge … — {"pressed":"missing", …}
```

`missing:["close"]` is `document.querySelector('.sheet[data-open="true"] .close')` answering *null*:
the sheet never opened. `blocked:["rail","head"]` is reported by the same evaluate for a control whose
`elementFromPoint` is not itself — the two readings that produce it are a control that has folded to
`display:none` (rect zero, so the probe hits whatever sits at the origin) and a control genuinely
covered by an open panel. §10's fold is the one that fits a page that never opened a sheet, but the
report does not carry the rect, so **which of the two it was on the runner is not measured — it is the
shape the fold has**. Every FAIL after that first one reads a sheet, a row or a track that only exists
while a sheet is open. **One cause, fifteen reds** — that part is not in doubt, because all fifteen
disappear together in the local reproduction below.

Reproduce (this machine has no Chrome.app and no GPU-forced runner; the flags below make the local
page behave like the runner):

```
PUBLIC_BASE=/puffly/ npm run build
node tests/smoke/serve.mjs apps/web/dist 4182 127.0.0.1 /puffly/ &
PUFFLY_CHROME_ARGS="--use-angle=swiftshader --enable-unsafe-swiftshader --disable-gpu" \
  node tests/smoke/touch-device.mjs http://127.0.0.1:4182/puffly/
```

Under that command, with the working-tree changes in this branch's pending commits, the sheet cascade
**disappears whole**: run one `170/172`, run two `167/172`. The fifteen sheet/row/track reds are gone in
both, which is the claim worth making; the survivors are not the same list, and the numbers should be
read as a range, not as a score. Two runs of the identical build and identical flags:

```
run A  ignition (S2) · cap hinge
run B  ignition (S2) · cap hinge · RTL burn · "default landing path renders frames" (3→7) · paper pinch
```

The rotating part is the starved page itself — this machine under those flags is a ~2–4 fps renderer, and
`frames 3→7` in run B says the page was still holding its first few frames at the moment that check
measured — so local software rendering is a proxy for *the sheet cascade's cause*, not a scoreboard that
can predict CI's exact red count. The two ignition reds, however, are not rotation: they are §2, and they
reproduce in both runs.

## 2. The last two reds were the ruler, and the ruler was sampling

`tests/smoke/touch-device.mjs` retries the strike until the rod is lit. Its exit predicate accepted
`affordance === 'lighter'` as evidence of a *lit* rod. `lighter` is the affordance the scene shows
while the rod is **still unlit** — `CtaPill.vue:262` styles `pick` and `lighter` together as the two
pre-ignition states — so on a slow page the first poll always read `lighter`, the loop quit after
`strikes=1`, and the checks reported a shut cap. That half was wrong and is fixed (the predicate now
waits for `puff` alone). A dud strike is *by design*: every real lighter carries `failureChance`
0.02–0.10 (`packages/game-content/src/props.ts`), so "press again until it catches" is a requirement,
not a safety margin.

Fixing the predicate did not clear the two reds, and the second run rotated in three more
(`167/172`). So the trace was taken instead of the theory
(`tests/smoke/probe-lighter-subtree.mjs`, one read per 250 ms across the strike, software renderer):

```
f 50 phase=light lid=-0.789 flame=true
f 60 phase=light lid=-1.361 flame=true      <- the cap reaches its full throw
f 72 phase=light lid=-1.034 flame=true
f 90 phase=puff  lid=-0.017 flame=false     <- the frame the rod is "burning", the lighter is away
f308 phase=puff  lid=  0.000 flame=false
```

**The flame and the open cap exist only inside the ~1 s LIGHTING window.** The frame the state becomes
`puff`, the cap is shut and the flame is hidden while the rod keeps burning — which is the choreography
the design draws (S2 shows the lighter at the flame; S3 has the lighter put away), not a defect. What
was a defect is the instrument: the check *samples*. On a healthy page the poll happens to land inside
a window two or three frames wide; on a starved one every sample lands after it, and a working scene
answers `lit=false lid=-0.00`.

So both checks now read a **per-frame recorder** rather than a chosen moment: the same `request-
AnimationFrame` pass that already carries §S7's 420 ms punch now also records "was the flame on in any
frame" and "the widest cap angle with the shell's corners from that frame". The assertions are
unchanged in strength — the flame still has to be drawn and the cap still has to reach its open angle,
and the hinge still compares the closed corners against the *widest* frame's corners — but the claim is
now judged over the frames that carried it instead of over the one frame the timer happened to reach.

Sampling-at-a-moment is the shape of this whole failure family, and the trace of it is in this file's
own history: 2026-10-11 replaced a fixed 220 ms wait with "read the frame the flame appears in" and got
a lid caught mid-throw; 2026-10-11 again replaced that with "wait until the lid stops moving" and got a
cap that had already shut; both were honest about the moment they chose and neither was a reading of the
picture. A recorder is the third version, and it is the first one that answers the sentence as written.


## 3. The two bright bars on the wall (#132, "the clutter reads as bars")

The player did not name these; the review found them. They are the brightest marks in the frame after
the pill, and they are not part of any design.

Ownership was settled from the scene graph, not from the picture
(`tests/smoke/probe-bar-owner.mjs`): exactly two instances of one `InstancedMesh`, depth 3, both
`rgb(58,61,66)` at α 0.3, both **102.2 px tall**, at 17.4 × 102.3 and 14.4 × 102.2 CSS px. Wall next to
them L 49.7, the bars L 63.5 / 67.6.

Cause: `Geometry.details` kind 2 is 「远处一扇亮着的窗」 and `backgroundStructure` took *both* axes from
the seed — `w = min(0.09, detail.w)` against `h = min(0.12, detail.h)`. Those are two units (a fraction
of the box's width, a fraction of its height), so on a portrait stage 0.044 × 0.12 is 17 × 102 px: a
bar six times taller than wide, and a bar of *light* on a windowless wall reads as a fault, not as a
window. Fixed by seeding only the width and deriving the height at `LIT_WINDOW_ASPECT`.

Guarded by `packages/game-scene/src/__tests__/lit-window-shape.test.ts`. The pairing was run, not
assumed: with the old `h` restored, that test prints
`quiet-room day 0: 17.4 × 102.2 px: expected 0.1704 to be greater than 1.25` — the same 17.4 × 102.2
that the scene-graph probe measured off the served build days earlier. Two independent rulers agreeing
to a tenth of a pixel is what makes the attribution a fact.

## 4. Code versus the written goal: one live inconsistency

`docs/SPEC.md:3113` (§22.z) says the seeded clutter is **five** things — 横管、吊线、远处一扇亮着的窗、
一块污渍、**一段墙缝**. The code rolls four (`kind = floor(… * 4) % 4`,
`packages/game-scene/src/backdrop.ts:99`) and draws four arms
(`backgroundStructure`'s kind 0/1/2/else). `place-shape.test.ts:117` pins the reachable vocabulary as
exactly `[0, 1, 2, 3]`, so the fifth shape is not "temporarily unreachable" — it does not exist, and
the spec still promises it. Not fixed here: adding a fifth shape to every room is the player's call,
not a repair. Either SPEC §22.z goes down to four, or `wall seam` gets an arm and the vocabulary test
goes to five.

Adjacent, and worth knowing before someone reads §3 above as "gate the clutter away": `details` is
seeded for **every** background kind, but `backgroundStructure` returns before the clutter for the
outdoor family — 7 of the 21 places pay the seed and paint nothing (the kinds, counted from
`packages/game-content/src/environments.ts`: room 7, corner 5, street 3, city 2, window 1, stairwell 1,
mountain 1, desk 1; the interior family is room + corner + stairwell + desk = 14). That is why a
colour-based attribution probe (`detailTone`'s rgb) can return zero matches: the painter reads the live
`state.world.light`, not `environment.lighting`, so a recomputed tone is a second ruler, not the same
one. The shape test therefore matches on the seeded `(x, y)` plus the layer's own α 0.3.

## 5. The complaints that were already repaired, and the one that is not

Repaired and measured earlier in this same round, now committed, each with the place to look: the
settings/skins panel leaking content outside its scroll area (strict full-containment cull at
`SceneStage.vue:3836` and `:3899`, plus the clip planes `sheetSurfaces` was missing while runs, frames
and sliders all had them), the flicker at the bottom of the skins list (surface pool 80 and frame pool
48 at `SceneStage.vue:3669-3670`, raised from 40 and 36 to the measured demand — 60 nodes inside the
viewport wanted a plate in that panel — and ownership keyed by element rather than by index slot; 20
cards that were not being drawn at all now are), the rod's thickness and its thinning when drawn
(`props.ts:52` `ROD_THICKNESS_SHARE = 7.8 / 84`, `props.ts:161` `DIP_SHARE = 0.06`), and the props' metalness (there is no environment map, so `metalness > 0` only subtracts diffuse light
and returns nothing). **That last one is a partial repair, not a fix, and the re-shot
`docs/images/phone-smoke.jpg` is the proof**: with the metalness at zero the lighter, the pack and the
ashtray are still flat black rectangles against a lit wall, and the wall still carries stray thin lines
and grey dashes (clutter kinds 0/1/3). So the player's complaint 「打火机 烟盒 烟灰缸都是黑的」 stands
after this round, and §5's next paragraph is about why.

**Still open, and it is not a bug I can measure shut:** the lighter, pack and ashtray keep reading as
dark holes because the room's *ground* is roughly twice as bright (linear) as the design's. Reaching
the wall's luminance from the props' own ink needs 4.4–9.2× the light the scene is allowed to deliver,
and at that intensity the rod `#f0e8da` clips to pure white — the arithmetic is written into
`keyLightInk`'s own comment. Two routes were tried and both reverted on measurement: darkening the
quiet room's ground (its silhouette is not warm enough — the mix needs `t > 1` in G and B) and lifting
the prop inks (15.1 → 24.1 against a ground of 52–59.6, i.e. still a hole). What closes it is a
palette decision across the 21 rooms, which is the player's eye, not a ruler. The white-out during
inhaling has the same root: `pool-bloom` rises 0.259 → 0.44 with the plume while §2 hides the DOM
chrome, so the frame brightens and its darkest object goes away at the same moment.

**Two rulers re-run against the committed build, to keep §5's numbers from being memory:** the leak
acceptance (`node tests/smoke/probe-band-20261015.mjs`) reports the band above the panel identical to
the closed-sheet band at three scroll positions — `delta_vs_closed=0.0` at scroll 0 / 120 / 300; the
per-frame flicker acceptance (`node tests/smoke/probe-sheet-frames.mjs`) reports `frames sampled 90`,
`per-frame changed: max 0 mean 0.00 nonzero 0 / 89`, `distinct placements 70 of 70 slots` — STABLE.

**One instrument in this round was wrong and was caught by its own reading.** The frame-rate floor was
first gated on `navigator.gpu.requestAdapter()`, on the theory that it is the runner's own GPU signal.
The normal-path run printed the refutation: `backend=webgpu, frames 141→184 (+43 in 700 ms)` — 61 fps —
alongside `gpuAdapter=null`. The probe could not see the adapter the app had just obtained, so the floor
would have relaxed itself on hardware that could meet it: a silent relaxation, which is the failure mode
this whole file is a catalogue of. The gate is now the backend the app itself chose (`webgpu` is
positive proof of a GPU; `webgl2` proves nothing either way, and the detail line says which branch ran).

## 6. After the first five commits: three more, one still open

Verified by re-running both paths against the committed tree (`173` checks — the guard below added one
named check, which is why the denominator moved from 172 to 173):

- **The last unguarded dereference of the #114 family was still in the file.** Under `--disable-gpu` the
  run died at check 60 of 172 with `TypeError: Cannot read properties of null (reading 'x')` on
  `ceilingBox.x` — `.pill` folded away and the `box` fallback read before the fold, so both were null at
  once. Now it wakes once, re-reads, and reports a named miss instead of ending the run. That run then
  completed: **171/173**, no `TypeError`.
- **`right-to-left: the burning end stays on the same side` was a fixed constant standing in for a
  quantity the page measures better.** The canvas half asserted `|ΔmeanX| ≤ 3` between two reads of a
  rod that is burning; it reddened four times including once on the *normal* path (`x 225.7→214.4`,
  `227.7→216.7`, tilt drifting 45–57 over the same span). The tolerance is now `3 + (drift measured on
  the same rod, same language, one more window) × windows`, printed in the detail. Re-run: **173/173**,
  and that check passed on `x 214.6→214.6 (budget 3.8 = 3 + 0.2px/window × 5)` — a true zero delta, not a
  widened gate.
- **The flint's sparks were the last sampler in the block, and the recorder caught it.** With the flame
  and cap finally reading `lit=true lid=-1.36` on the starved page, `sparks` still answered false: the
  burst lives ~1 s of sim and the 14 s poll could sit either side of it. It rides the same rAF recorder
  now.
- **A bug in my own previous commit, found by reading the line back**: the DPR gate's *else* branch was
  `TIER_DPR_CAP.balanced` (2) — the else branch is the page running **fine**, so every healthy 3×
  desktop was being painted at 2×, which is the exact "tapping 少一点烟 blurs the screen" harm the gate
  exists to prevent. Now `TIER_DPR_CAP.high`.

**Still open, named so it does not get lost:** `the breath has light and dark inside it` reddened once on
the normal path — `relative spread 0.214 over 5969 cloud pixels (9.0% of the band, 295 discs, painted at
2x)` against a documented 0.66–1.03 floor. Two candidates, not yet separated: Two candidates, and reading the check's own escape hatch narrows it: the escape
`ratio > 0 && ratio < 2` only excuses a low spread when the frame is painted at 1×, and this reading
came back at **2×** — so the DPR branch of the ladder is ruled out by the number itself. What is left is
that the cloud genuinely was an even haze (295 discs over 9.0% of the band is a full footprint with no
internal light-versus-dark), which is the very shape the check was written to catch. So the question is
not "is the ruler wrong" but "what flattened the plume": either the ladder spends per-disc variation
before it spends resolution, or the exhale's structure regressed since the 2026-10-11 baseline
(0.66–1.03). The separating experiment, in order of cost: sample `cloudShape` ~6 times on one build and
look for bimodality (a haze-versus-structure split, which points at the ladder intervening mid-breath),
then read the same sample with the rung pinned to its top through the settings row (`button.choice`,
re-read `aria-pressed` after the tap — settings are persisted in IndexedDB, so a seeded profile is only
needed if the UI route is unavailable). Not run this round; recorded so it is not lost.

## 7. The plume red is a true positive, and it is the white-out

The separating experiment ran (`tests/smoke/probe-plume-spread.mjs` — the check's own `cloudShape`
ruler, copied verbatim, driven by a *held* draw; the first version clicked instead of holding and fed
16–36 discs where the check's failing reading carried 295, i.e. it measured a breath that never
happened, which is why that run is discarded rather than quoted). Eight held breaths on a healthy page,
three samples each, and the answer inverts the check's own comment:

| what the sample is | lifted share of the band | cloudPx | spread |
| --- | --- | --- | --- |
| a real exhale, mid-flight | 36.5% | 10 708 | **0.264** |
| the same breath, one moment later | 9.2% | 2 685 | **0.190** |
| the tail, a few discs left | 0.05–0.1% | 16–131 | 0.41–0.54 |

So `spread` does not sit at 0.66–1.03 for every state of the breath — that baseline was read while the
footprint was small. The bigger the breath, the more uniform the lift, and the lower the spread: at a
third of the band lifted, the cloud is **an even veil**, which is exactly the shape
`the breath has light and dark inside it` was written to catch. The check is right and the plume is
wrong.

This is the same fact the player reported as 「按空格吸烟的时候那个界面会有变白」: a held draw covers
roughly a third of the frame with a near-uniform lift. It is not the warm bloom's alpha and not the
DOM chrome hiding — those were the earlier candidates — it is that the exhale's own painting has no
internal structure at the size where it matters. Fixing it means giving the discs per-particle
variation in alpha/size (the artwork), not tuning a threshold, and it is a decision about how a breath
should look rather than a measurement I can settle alone.

Reproduce: `node tests/smoke/probe-plume-spread.mjs http://127.0.0.1:4183/puffly/`.

## 8. Correction to the commit that preceded this note: the last family is a covering layer, not a slide

The commit message on `5974040` attributed the remaining software-render reds to *"the aim is read
before the sheet finishes sliding"*. The numbers in the same log refute that, so the attribution is
withdrawn here rather than left standing:

- `the phone dismissal presses the scene, not the panel — point 197,180`. The aim is computed as
  `max(canvas.top + 12, panelTop - 24)`, so a press at y = 180 means the open sheet's top edge was at
  **204** — the press was 24 px *above* the panel, exactly where it is meant to be. The aim was not
  stale.
- What failed is the assertion attached to that point: `elementFromPoint(197, 180)` did not answer the
  stage's own hit surface (`.hit`).
- The same run reports `missing:[]` with `blocked:["close"]` — the sheet's close button exists, but its
  own centre hits some other element too.

Two independent points on the frame (the stage above the drawer, and the close button inside the drawer)
are both covered while a sheet is open. That is one object, not two races: **something is sitting on top
of the stage while a sheet is open on a starved page.** It is also the shape of what the player reported
as 「滚动区域以外的地方有时候会漏出来一些东西」, which this round closed only for *painting* (the leak
ruler reads `delta_vs_closed=0.0`) — a layer that is invisible but still hit-testable would pass that
ruler and produce exactly these reds.

The measurement that names it, next time: with a sheet open on the `--disable-gpu` page, walk
`document.elementFromPoint` over a grid and print the top-most element chain at each point, then hide
candidates one at a time (`pointer-events`, then `visibility`) and re-read the same point. The
suspects, in the order the code makes them plausible: the sheet's own root (it spans the frame while
its drawer does not), the scene's DOM-mirror mask layer, and the wide-layout sidebar that shares the
`.sheet` machinery.

**Not a product conclusion yet** — on the normal path all of these checks are green (173/173 twice), so
whatever covers the stage is either only present while the page is starved, or it is present always and
only *moves into the way of a tap* when frames are slow. That distinction is the first thing the grid
above will settle.
