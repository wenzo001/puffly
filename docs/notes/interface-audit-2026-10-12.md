# Audit: what the shipped interface actually looks like (2026-10-12)

Captured from the built artefact (`PUBLIC_BASE=/puffly/ npm run build` → `serve.mjs`),
at the four shapes the product ships on, with `tests/smoke/audit-shots.mjs`.
Frames in `/tmp/puffly-audit/`. Baseline before any change: **129 test files / 1074 tests green**,
`npm run build` green.

## What is visibly wrong

### 1. The rod is a flat untextured slab — the single biggest problem

In every frame, at every shape, the cigarette is a **plain grey parallelogram** with a hard,
machined edge. There is no paper grain, no burn line, no lit end shape, no ash, no taper. It reads
as a debug proxy, not as an object. It is the object the whole product is about, it is the thing the
player looks at for the entire break, and it is the least finished thing on screen.

The cherry is a **soft orange glow blob floating over the slab's top-right corner** — it is not
attached to an end, because the slab has no end to attach to.

### 2. The plume is a rope of grey blobs, not smoke

The smoke is a vertical chain of separate soft circles with visible gaps and a bright square-ish
core, brightest in the middle of the streak. Real smoke: the source is a thin thread at the cherry,
it widens as it rises, curls, and thins out. Here it is the opposite — narrow and beaded at the top,
bright and wide at the bottom, disconnected from the cherry by a gap.

### 3. The floor is a hard horizontal seam, and half the stage is empty black

There is a straight, perfectly flat line across the whole width at ~y 1108/1704 on the phone and
~y 1000/1600 on desktop. Below it is a featureless near-black band taking **~35% of the stage**, with
only a thin dashed ellipse (the tray's far rim) floating in it. The table has no surface, no depth,
no falloff — it is a scissor line. The tray is essentially invisible: an outline arc with nothing in
it.

### 4. Two black rectangles are just floating in the void

At the left edge, around (78, 888) and (124, 1100) in the phone frame, there are two **solid black
rectangles** — one roughly 55×55, one 55×95 — sitting on nothing. They are axis-aligned, they have a
hard edge and a slight lighter halo, and they are the only pure-black things on screen. The second
one crosses the table seam. On desktop the same two blocks appear at (143, 640) and (240, 715). They
look like untextured/placeholder meshes. **This is the most obviously broken thing on screen.**

### 5. ~~The HUD clock reads `0` while the break is at 100%~~ — RETRACTED, not a bug

I nearly filed this. The right-hand ring on desktop reads `0` while the top row says `100%`, and I
read it as two views of one break disagreeing. **They are not the same fact.** The top row's `100%`
is *this breath's strength*; the panel ring is `ReductionPanel.vue`'s `reduction.todaySticks` — the
**day's** stick count, which is legitimately `0` before the break ends. `ringArc` reads
`todaySticks / cap`, so an empty arc at session start is correct.

The real, smaller complaint is presentational: the two rings look identical (same 44px circle, same
track colour, same arc treatment) while measuring unrelated things, and they sit in different
containers with no shared label. Recorded here as a polish item, **not** as a defect to fix this
round — the two readings being different facts is the design, and changing the ring's meaning would
be a product decision, not a bug fix.

### 6. The strength bar under the pill is nearly invisible

A 3px dark track with an orange fill at the far left. On the phone it is a hairline; on desktop it
spans the whole 393px pill width as a 3px line. It is the readout for "how hard did you just draw",
which S7 makes the core feedback, and it is the *least* visible element of the frame — while a
100%-strength breath at 5/12 should read as a strong signal.

### 7. The tray is empty and unreadable

The ashtray is one dashed arc with a black lens under it. There is no bowl, no wall, no ash, no
material. `docs/SPEC.md` records this exact open item (the tray's base has no reader, the rim is a
far-side-only half ring). On screen it reads as a scribble.

### 8. The desk column is a different-looking product

The right column (desktop) is 8 light-grey rounded buttons in 4 rows, then a large empty ring, then
a block of text, then three pill chips. It is visually disconnected from the scene: different
material, different weight, different rhythm, and it occupies 260px of a 1280px window with a hard
vertical seam. The buttons are `#2a2a2a`-ish plates on pure black while the scene is a soft
gradient — the two halves do not look like one app.

## What is *not* a defect (checked, so nobody "fixes" it)

- `visibility` on `.sheet` in the 3D tier is deliberate and was recently corrected to
  paint-withdrawal only (`global.css:530-545`) — it keeps hit-testing.
- The scene's own mirroring (`data-scene-surface`, `-webkit-text-fill-color: transparent`) is why
  DOM text is invisible in the 3D tier; the scene paints it. Reading the DOM will mislead.
- The two black rectangles were the one thing I had *not* proven. They are now identified as the
  pack and the lighter (see below) — an intentionally dark prop standing in a light too dark to show
  it, which is a defect of *lighting*, not of the props' own colours.

## The black rectangles: identified — and my first diagnosis was WRONG

**Correction (this section replaces an earlier `details`/wall-clutter claim, which was wrong).**
I first attributed the plates to the room's seeded wall clutter (`backdrop.ts:92-101`). `clutter-fix`
refuted it with measurements, and I have now confirmed the refutation independently. The plate
positions land on the **prop anchors**, read live from `.stage[data-aim]` on a 393×852 phone
(`probe-anchors.mjs`):

| plate | measured centre (CSS px) | prop anchor | anchor (CSS px) |
| --- | --- | --- | --- |
| a (24.5,414.5,26,30.5) | 37.5, 429.8 | `lighter` | 37.3, 417.5 |
| b (45.5,513.5,30.5,46.5) | 60.8, 536.8 | **`pack`** | **60.9, 536.8** — exact to 0.1 px |

The plates are the **pack body and the lighter**. The room's clutter is not involved.

### The actual mechanism: the room's light cannot show a near-black prop

Every backdrop surface is an **unlit** `MeshBasicMaterial` painted at its final colour (wall
`45,42,41`). The props are **lit** `MeshStandardMaterial`s, and the key light's colour is the *sky
itself* (`SceneStage.vue:409`, `colour: skyColour.value`). For `quiet-room` that sky stop is
`rgb(46,44,43)` — linear ≈ `0.027`. The prop inks are already near-black
(`PROP_INK.pack = #191612`). So:

    out_linear = base_linear × (ambient + intensity × N·L) × key_linear

with `intensity = 0.6 + 0.42 × 1.6 = 1.272` and `ambient = 0.35`:

| N·L | `#191612` renders as |
| --- | --- |
| 1.0 | `rgb(1,1,1)` |
| 0.7 | `rgb(1,1,1)` |
| 0.4 | `rgb(1,1,0)` |

Measured on the shipped frame: `rgb(2,2,1)` and `rgb(4,3,3)`. **Exact match**, the residual being the
`packEdge` plane behind it. An unlit mid-grey wall with lit near-black props standing on it *is* a
hard black plate punched out of the wall. `clutter-fix` also computed all 21 rooms: every one renders
the pack at `rgb(1..6)`, a 13×–29× luminance ratio against its own wall.

The two faults are therefore:

1. **The props are invisible** because the room's key light is as dark as the props. This is the real
   defect, and it is the one the eye reads as "broken mesh". *(owned by `clutter-fix`)*
2. **`featureToneColours.ink` mixes *toward black*.** `mixRgb(silhouette, [0,0,0], 0.45)` = `13,13,14`
   on `quiet-room`. It is a genuine but *separate* bug in the furniture palette which would go green
   without the plates moving a pixel. *(also owned by `clutter-fix`, fixed independently)*

**`packages/game-scene/src/__tests__/furniture-visibility.test.ts` (which I wrote) pins fault 2, not
fault 1.** Recorded here so nobody reads that test's green as proof about the plates.

### The refutation of my `details` claim, in the painter's own numbers

I ran `geometryFor` + `backgroundStructure` for `quiet-room` at 393×852 (a throwaway probe, deleted
after use). `quiet-room` has `features: []`, and its five seeded details land at:

| detail | CSS x | CSS y | CSS w | CSS h |
| --- | --- | --- | --- | --- |
| kind2 | 222.1 | 253.9 | 17.4 | 124.5 |
| kind1 | 257.1 | 365.1 | 31.5 | 90.6 |
| kind2 | 222.9 | 366.4 | 14.4 | 109.0 |
| kind1 | 263.6 | 219.3 | 28.1 | 78.1 |
| kind1 | 187.2 | 255.9 | 24.3 | 86.5 |

The plates are at **x 24–75, y 414–536**. Nothing in the clutter list is within 140 px. My original
attribution was wrong on the geometry as well as on the mechanism; the anchor probe above is what
identified them.

## The rod: confirmed at the source
`SceneStage.vue:4255-4267` — the rod is a bare `CylinderGeometry(0.05, 0.05, 0.1, 12, 16)` with one
flat `TresMeshStandardMaterial color="#f0e8da"`. No burn line, no paper, no ash, no lit end. This is
the object the player watches for the whole break.

## 3. The table seam: quantified

The hard horizontal line across the stage is `nosingMesh` (`SceneStage.vue:1376-1390`), a strip at
`table.edgeY` that is **4px tall** (`viewportHeightPx * 0.004`). Everything below it is the table
mesh from the template (line 4155): a `TresBoxGeometry` of `frame.width * 1.2 × WORLD_HEIGHT * 0.6`
coloured `tableInk`.

For `quiet-room` the tones are:

| surface | value | note |
| --- | --- | --- |
| wall (`interiorWall`) | `45,42,41` | above the seam |
| sky bottom stop | `52,48,44` | above the seam |
| **table face** (`interiorEdgeInk`) | **`18,17,19`** | below the seam — 60% darker than the wall |
| nosing line | `89,83,80` @ alpha 0.5 | the 4px highlight that draws the seam |

So the seam is not a bug in the sense of a broken value — it is a **design that has no middle**:
the table jumps from `52,48,44` to `18,17,19` across a 4px line, and then holds that near-black for
the remaining ~35% of the stage. On a phone that is ~300 CSS px of featureless dark. There is
nothing on the table surface: no falloff, no grain, no gradient toward the viewer.

The one light that lands there is `glows[1]` (the table pool, z −0.245) — visible in the frames as a
soft warm ellipse, but it is centred and small relative to the empty area.

**This is a real defect against the brief** ("表上其余" is supposed to be a *place*, and §2 asks for a
lit table). It is the largest single area on screen and it is the emptiest.

Measured with `tests/smoke/scan-table.mjs` on the shipped frames — the seam is found as the row with
the largest vertical luminance jump:

| frame | seam at | jump | band below | mean luminance | share in the darkest bucket (0–16) |
| --- | --- | --- | --- | --- | --- |
| phone 786×1704 | y 1129 = **66.3%** | 10142 | 567px = **33.3%** of the stage | 22.2 | **60%** |
| desktop 2560×1600 | y 1028 = **64.2%** | 22552 | 564px = **35.2%** of the stage | 11.2 | **87%** |

And the seam's own position matches the model: measured 0.650 of the frame vs `tableEdgeY` 0.64 from
`packages/game-core/src/stage.ts:128` (the 4px nosing strip straddles it).

So on a desktop **87% of a third of the screen is in the darkest histogram bucket**. That is not a
shading choice; it is an empty region the size of a phone.

## The plume: a beaded rope

The smoke is a vertical chain of **separate soft discs with visible gaps** and a bright core in the
middle of the streak, brightest where a real plume is thinnest. Real smoke: a thin thread at the
cherry, widening and curling as it rises, thinning and dispersing at the top. Here it is inverted —
narrow and beaded at the top, bright and wide at the bottom, and there is a **visible gap between the
cherry and the first particle**.

Likely causes to check (NOT yet proven — do not fix on this evidence alone):
- emission rate too low / lifetime too short relative to rise speed, so particles are spatially
  separated rather than overlapping (the spec records a related open item: `authored == spawned`
  vs the measured peak, #139);
- particle size as a constant rather than growing with age;
- alpha ramping the wrong way (the core looks brighter mid-life than at birth).

`packages/game-scene/src/intake.ts` (`SMOKE_DRAG`) and `plume.ts` are where the lifetime/drag/size
curve live. **Anyone touching this must first measure the emission arithmetic** (`emissionRate ×
lifetime` vs the observed particle count), because SPEC.md records two earlier attempts to "fix the
plume look" that were both withdrawn after the arithmetic did not support them.

## The achievements block: the second half of the brief is the weakest area on screen

The goal for this session names two things: 「界面的爽感」 and 「成就」. The achievement ladder
(`packages/game-core/src/achievements.ts`) is *well built* — four axes, 23 rungs, pacing cited from
the deck, no extra rng draw, no health claim, a pure function of the ledger. The problem is that
**none of that is visible**. Photographed at 393×852 (`sheet-shots.mjs`, `phone-break.png`):

```
成就                    0 / 23
累计支数          0/5 ·  13
总口数          0/5 · 150
灰重             0/5 ·  4
总时长          0/5 · 125
最大阵风                0
一阵风
妖风
邪风
```

Four separate defects, all of them in how a reached/locked rung is *shown*:

1. **There is no progress.** `achievementsFor` returns a `ratio` per rung (0..1 through its goal) and
   **the sheet never renders it**. `SessionSheet.vue:333-339` prints `row.reached/row.total` — the
   *count of rungs met* — plus the next goal as a bare digit. So the one number that would make a
   ladder feel like a ladder (`ratio`) is computed and thrown away. A player 12 puffs from the next
   rung sees exactly what a player at 0 sees.

2. **The figures have no units.** `0/5 · 13` is sticks, `0/5 · 150` is puffs, `0/5 · 4` is grams,
   `0/5 · 125` is minutes. The `·` digit is ambiguous across four rows that are visually identical,
   and the copy table has the unit words (`支`/`口`/`克`/分钟) but they are not used on this row.

3. **The reached state is barely distinguishable.** The only difference between a met rung and an
   unmet one is amber `--ember-core` on `.count.reached` — one text colour change on a digit, no
   mark, no fill, no motion beyond the 1400 ms `rung-lit` fade that fires *once* when the sheet
   happens to be open.

4. **The moment rows are worse: they show nothing at all.** `一阵风` / `妖风` / `邪风` are rendered as
   a name and nothing else (`:353`); the only state is the CSS at `:483`, which greys the name until
   `data-reached='true'`. So all three look like unlit words in every screenshot, and there is no way
   for a player to tell a rung they *might* reach from one they already did. Their backing number
   (`最大阵风 0`) sits above them as a separate row, with no stated relation to the three names.

**Why this matters more than it looks:** this is the only place in a deliberately wordless product
where the player's accumulated effort is *reported back*. §39 says a newly unlocked thing lights up
by itself — but the lighting-up is the only feedback, and everything else is static text. The
"achievement feel" the goal asks for is exactly what is missing, and it is missing in the shell
(`SessionSheet.vue`), not in the well-built pure layer.

## Ordered plan

**Revised after `clutter-fix` corrected the black-plate root cause.**

1. **The props are invisible** (task-1, `clutter-fix`) — the room's key light is as dark as the props,
   so the pack and the lighter render at `rgb(1,1,1)`. This is the defect that reads as "broken
   mesh", and it is the highest-priority fix. Do NOT lift `PROP_INK`; fix the light.
   *(also carries the separate `featureToneColours` / `detailTone` palette bug)*
2. **The rod** (task-2, `rod-craft`) — paper, burn line, lit end, ash. The object the player watches
   for the whole break is a bare cylinder.
3. **The achievements block** (task-3, unassigned) — render the `ratio` that is already computed,
   give the four axis rows their units, and give the three moment rows a visible state. This is the
   "成就" half of the brief and it is currently static text.
4. **The table seam** — the bottom ~35% of the stage is a featureless `18,17,19` band under a 4px
   line. (Not yet tasked.)
5. ~~HUD `0` while the break reads 100%~~ — **retracted**, they are different facts.


