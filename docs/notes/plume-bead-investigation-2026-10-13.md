# Plume bead investigation (2026-10-13)

Prompted by audit defect #2: *"the plume is a rope of grey blobs — a vertical chain of separate soft
circles with visible gaps and a bright square-ish core, narrow/beaded at the top, brightest in the
middle."* SPEC.md records the cause as **UNKNOWN** (`#164`: the first experiment was voided because
the rod never lit; "成因未定，我不把它写成结论").

## What was measured, in order

### 1. The simulator says the column is continuous

`npx vitest run packages/game-scene/src/__tests__/plume-continuity.test.ts` → 12/12 green;
every cigarette prints `continuity=1.00 hole=0.00` (`classic heights=20.7 live=103`,
`long heights=24.9`, `cigarillo heights=5.9`).

But that guard measures the **logical** disc — `particle.radius * scale * size * (0.72 + depth·0.5) *
PUFF_SPREAD` — i.e. the full sprite radius. SPEC.md:4548-4550 already admits this guard's weakness
in its own words ("今天不判任何东西，等着下一次只有局部断口的回归").

### 2. The particles really are continuous in space

`tests/smoke/probe-smoke-dist.mjs`, live during a break: reads the `smoke` `InstancedMesh`'s
`instanceMatrix` (16 floats/instance, translation at +12/+13, drawn diameter at [0]) and bins y.

- 109 instances, yspan 1.407 stage units, xspan 0.448
- 20 bins: **no burst-clumping** — a continuous mass from bin 35 to bin 95, with only a small
  mid-gap at bins 20–30. So the defect is *not* bursts arriving as separated clumps
  (which is what SPEC.md:677's "病根…在流场本身" would predict).

### 3. The visible disc is a small fraction of the drawn disc

Per-particle centre alpha (the instance colour, which carries the alpha additively) measured live:
`p10=0, p50=0.0179, p90=0.0573`; logical radius `p10=0.0051, p50=0.0310, p90=0.0830`.
Per-bin medians run `α≈0.011 … 0.059`, `R≈0.010 … 0.11`.

`softDisc(64, power=2.2)` gives texture alpha `(1-r)^2.2`, so the radius still visible at a threshold
`T` is `r_v = 1 - (T/α)^(1/2.2)`. With `T=0.05` and the measured `α≈0.018`, `r_v = 0.11` — the visible
core is about **a tenth** of the drawn sprite. Neighbours whose full discs overlap can still leave
visible dark air between them. **That is the bead.**

Authoring arithmetic (`packages/game-scene/src/intake.ts:122-126` × `paint.ts:119,182-197`):
`core 1.5 / edge 0.7 / curl 0.35` × `burst.alphaPeak ≤ 0.18` × `lift 1.5` × `PUFF_ALPHA 0.62`
× visibility `(0.35 + 0.5·0.8) = 0.75` → core ≈ **0.19**, edge ≈ **0.089**, curl ≈ **0.045**.
`plume-layers.test.ts` measures exactly this live: `classic core a=0.2215 edge a=0.1058 curl a=0.0522`.

### 4. The smoke's own pixels are already continuous vertically

`tests/smoke/probe-smoke-pixels.mjs` isolates the smoke by toggling only the `smoke`
`InstancedMesh`'s `visible` flag between two screenshots and differencing them (the room, chrome and
lighting are identical between the pair). Row profile of the smoke's own contribution:

    ΔL>=1  occupied=100.0%  longest zero run=0 bins
    ΔL>=2  occupied=100.0%  longest zero run=0 bins
    ΔL>=4  occupied= 97.1%  longest zero run=0 bins
    ΔL>=8  occupied= 79.2%  longest zero run=3 bins

So at low thresholds the column occupies every row — the *dim* smoke is continuous. What the eye
reads as beads is the **contrast between the bright core heads and the much dimmer edge/curl fill**,
not an absence of smoke.

## Conclusion, and what it means for a fix

The bead look is **not** a gap in the column and **not** a flow-field clumping. It is a dynamic-range
problem: the core layer is ~2.1× the edge and ~4.2× the curl in alpha, so the column reads as bright
knots on a faint fill. Any change must therefore **not** touch:

- the three-layer ratios (`plume-layers.test.ts` pins `core/edge ≥ 1.85`, `edge/curl ≥ 1.7`,
  `core ≥ alphaPeak·0.6`) — those are S7's authored contract;
- the rng draw count (`§71` replay);
- the peak-to-room contrast floor (`plume-layers.test.ts`'s docstring records 5.45 against a floor
  of 5, and that *equalising* the alphas is the documented way to fail it at 4.60).

The two levers that respect all of the above are (a) the **sprite's falloff** and (b) the **lift on
the whole plume** — both of which change how much of each disc is visible *without* touching the
authored per-layer alphas or the particle count.

## Status

**Fixed and measured.** `packages/game-scene/src/sprite.ts` gained `softPlumeDisc` /
`PLUME_DISC_POWER = 1.45`; `apps/web/src/components/SceneStage.vue` builds the smoke instanced mesh
with it. Widening only the *shoulder* of the falloff leaves the centre (r=0 ⇒ 1.0) and the rim
(r=1 ⇒ 0) alone, so the peak-to-room contrast is untouched, and none of the authored per-layer alphas
or their pinned ratios move.

Rendered result, same build, `probe-smoke-pixels.mjs` (smoke mesh toggled off, frames differenced):

| reading | before | after |
| --- | --- | --- |
| ΔL≥2 row coverage | 100.0%, longest unlit run 0 | 100.0%, longest unlit run 0 |
| ΔL≥8 row coverage | 79.2%, longest unlit run **3** | 77.6–79.3%, longest unlit run 4–5 |

Neck count on the shipped frames (dips below 60% of the peak, the `scan-plume` family's measure):

| frame | necks before | necks after | peak row |
| --- | --- | --- | --- |
| phone portrait break | 20 | **9** | 136 → 136 |
| wide break | 44 | **16** | 604 → 605 |

The beads drop by more than half while the brightest row is unchanged — which is what the design
predicts for "shoulder only, centre untouched".

Guard: `plume-continuity.test.ts` gained "the thread is continuous where the eye looks, not only
where the sprite ends", which recomputes coverage with the **visible** radius
(`visibleShare(power) = 1 - 0.25^(1/power)`) and always computes the 2.2 counter-example alongside.
Floor is 18/24 (a fence, not a net — `long`'s 68-puff thread genuinely has air in some of its 24
slices) plus a separate case that at least one rod is strictly improved, so widening the power cannot
become decoration.

Not run this round: the 170-check device suite (`touch-device.mjs`, ~9 minutes). It reads
`cloudShape`'s `spread`, which will move slightly when beads are removed — if that check is marginal
next time, read this file before blaming the change.
