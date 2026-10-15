# Visual and CI review, 2026-10-15

Scope: the four complaints handed in by the player (scroll area leaks, the skins panel flickers at
the bottom, the lighter/pack/ashtray read black, the screen whitens and flickers while inhaling, the
rod is too thick and thins when drawn), plus "is the code, the picture and the goal still the same
document", plus the one red CI job.

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
the sheet never opened. `blocked:["rail","head"]` is the same fact wearing the other sign — those two
are `display:none` after §10's 2.6 s idle fold, so their rects are zero and their hit tests land
anywhere else. Every FAIL after that first one reads a sheet, a row or a track that only exists while
a sheet is open. **One cause, fifteen reds.**

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

Repaired and measured earlier in this same round, all still uncommitted here: the settings/skins panel
leaking content outside its scroll area (strict full-containment cull plus the missing clip planes on
`sheetSurfaces`), the flicker at the bottom of the skins list (surface pool 40 → 80, frame pool 36 →
48, and element-keyed ownership replacing index slots), the rod's thickness and its thinning when
drawn (`ROD_THICKNESS_SHARE`, `DIP_SHARE` in `packages/game-scene/src/props.ts`), and the props'
metalness (no environment map exists, so `metalness > 0` only subtracts diffuse light and takes the
lighter, pack and ashtray toward black).

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
