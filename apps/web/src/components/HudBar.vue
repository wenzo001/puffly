<script setup lang="ts">
/**
 * The head-up row from S1–S5: one ring, and the two numbers that belong to whatever the rod is
 * doing right now.
 *
 * Icons and Arabic digits only (§9.2): the numbers are the same in every language, and the nouns
 * they need live in `aria-label`, because a screen reader is allowed a sentence and an eye on a
 * phone at 2am is not. Every figure here is a measurement the simulation already makes — nothing
 * is rounded up into a claim.
 */
import { computed } from 'vue';
import type { CopyKey } from '../i18n';
import type { Puffly } from '../composables/usePuffly';
import { useLongPress } from '../composables/useLongPress';
import { forceReading } from '../forceArt';
import DemoGlyph from './DemoGlyph.vue';

const props = defineProps<{ game: Puffly }>();
const emit = defineEmits<{ shelf: []; break: []; archive: []; archiveClose: [] }>();

/** The stick mark is a tap and a hold at once: the shelf, or S17's card about this rod. */
const mark = useLongPress(
  () => emit('archive'),
  () => emit('shelf'),
  () => emit('archiveClose'),
);

const copy = computed(() => props.game.copy.value);
const summary = computed(() => props.game.summary.value);
const fresh = computed(() => summary.value.fresh.length);

/** The ring's arc: §2's ring is a circle of radius 17 in a 40×40 box, 106.81 units around. */
const CIRCUMFERENCE = 106.81;

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

/**
 * The symbol the ring wears on each screen, as the Demo names them: the rod on 待机, the flame on
 * 点燃, the three airflow lines while a draw runs, the swirl with its dot on 吐烟, the three fading
 * ash lines on 磕灰. `text` is the escape hatch for the two states the five screens do not draw
 * (out / over limit), which keep their old quiet mark.
 */
type RingGlyph = 'rod' | 'flame' | 'airflow' | 'swirl-dot' | 'tray-lines';

/**
 * One figure in the row: a measurement the simulation already makes, the copy key that names it to a
 * screen reader, whether it is the button into the break's own sheet, and whether it wears the accent.
 */
interface Figure {
  key: CopyKey;
  value: string;
  press: boolean;
  accent: boolean;
}

/**
 * The head-up row in the anatomy §2 of the Demo fixes for all five core-loop screens: one ring
 * wearing *that screen's own symbol* — never a number — and beside it only the figures that screen
 * asks for. Three on 待机 (`4 02:14 78%`), two on 点燃 (`0.4s 78%`) and on 吸入
 * (`6 / 12 3.2s`), one on 吐烟 (`62`), two on 磕灰 (`9mm 2.1g`).
 *
 * Icons and Arabic digits only (§9.2): the numbers are the same in every language, and the nouns
 * they need live in `aria-label`, because a screen reader is allowed a sentence and an eye on a
 * phone at 2am is not. Nothing here is rounded up into a claim.
 */
const reading = computed(
  (): { glyph: RingGlyph; label: CopyKey; fraction: number; figures: Figure[] } => {
    const state = summary.value.state;
    const clock: Figure = {
      key: 'a11y.hud.clock',
      value: summary.value.clock,
      press: true,
      accent: false,
    };
    if (!state) return { glyph: 'rod', label: 'a11y.hud.rail', fraction: 0, figures: [clock] };
    const rod = state.cigarette;
    const remaining: Figure = {
      key: 'a11y.hud.remaining',
      value: `${Math.round(rod.rodRemaining * 100)}%`,
      press: false,
      accent: true,
    };
    switch (summary.value.phase) {
      case 'light': {
        if (rod.state === 'LIGHTING') {
          return {
            glyph: 'flame',
            label: 'a11y.hud.hold',
            fraction: state.lighter.flame,
            figures: [
              {
                key: 'a11y.hud.hold',
                value: seconds(state.lighter.heldMs),
                press: true,
                accent: false,
              },
              remaining,
            ],
          };
        }
        // Which stick of the day this is — 1 before the first one has been saved, not 0. The ring
        // wears the rod here, so the count has to stand in the row with the other two.
        const sticks = (props.game.today.value?.sessionCount ?? 0) + 1;
        return {
          glyph: 'rod',
          label: 'a11y.hud.sticks',
          fraction: rod.rodRemaining,
          figures: [
            { key: 'a11y.hud.sticks', value: String(sticks), press: false, accent: false },
            {
              key: 'a11y.hud.burned',
              value: summary.value.burned,
              press: true,
              accent: false,
            },
            remaining,
          ],
        };
      }
      case 'puff': {
        // 吐烟那一相 (S4): the row carries the strength of the draw that just ended and nothing
        // else — 「62」 with no unit and no word — because that figure is the answer to 「这一口抽了
        // 多久」 and a second number next to it competes with it. Both surfaces call the same
        // `forceReading`, so the digits and the bar under the pill cannot drift apart.
        const exhale = forceReading(rod);
        if (exhale !== null) {
          return {
            glyph: 'swirl-dot',
            label: 'a11y.hud.force',
            fraction: rod.lengthRemaining,
            figures: [{ key: 'a11y.hud.force', value: String(exhale), press: true, accent: false }],
          };
        }
        return {
          glyph: 'airflow',
          label: 'a11y.hud.puffs',
          fraction: rod.puff.active ? rod.puff.progress : rod.lengthRemaining,
          figures: [
            {
              key: 'a11y.hud.puffs',
              value: `${rod.puff.count} / ${rod.readouts.puffsTarget}`,
              press: true,
              accent: false,
            },
            rod.puff.active
              ? {
                  key: 'a11y.hud.hold',
                  value: seconds(rod.puff.heldMs),
                  press: false,
                  accent: true,
                }
              : remaining,
          ],
        };
      }
      case 'tray':
        return {
          glyph: 'tray-lines',
          label: 'a11y.hud.ash',
          fraction: rod.ash.ratio,
          figures: [
            {
              key: 'a11y.hud.ash',
              value: `${rod.readouts.ashMm}mm`,
              press: true,
              accent: false,
            },
            {
              // 拍板 ②: the gram figure that belongs on the ashtray is what the ashtray is holding
              // (稿子 S5 的 2.1 g), not what this stick has made. One column of a real stick is
              // hundredths of a gram, so this reads to two decimals rather than rounding a live
              // number away to `0g`.
              key: 'a11y.hud.trayMass',
              value: `${Math.round(state.ashtray.grams * 100) / 100}g`,
              press: false,
              accent: true,
            },
          ],
        };
      default:
        return { glyph: 'rod', label: 'a11y.hud.clock', fraction: 0, figures: [clock] };
    }
  },
);

/**
 * S11's desk row: the five figures a window has room to keep standing at once. The phone reveals
 * two of them at a time, chosen by what the rod is doing (`reading`) — which is right for a thumb
 * and wrong for a monitor, where "how much ash" should not be hidden behind a phase you are not in.
 *
 * The fifth is the rod's own name and the only word in the row, so it follows the hint word's rule
 * (§28): with hint words off — and in the icons tier, where there are none to show — it is absent,
 * and the row is still complete on digits alone (§9.2).
 */
const desk = computed((): Array<{ key: CopyKey; value: string; press: boolean }> => {
  const state = summary.value.state;
  if (!state) return [];
  const rod = state.cigarette;
  const facts = props.game.archive.value;
  const name = facts?.subject === 'rod' ? facts.name : '';
  const rows = [
    { key: 'a11y.hud.clock' as CopyKey, value: summary.value.clock, press: true },
    {
      key: 'a11y.hud.puffs' as CopyKey,
      value: `${rod.puff.count} / ${rod.readouts.puffsTarget}`,
      press: true,
    },
    {
      key: 'a11y.hud.remaining' as CopyKey,
      value: `${Math.round(rod.rodRemaining * 100)}%`,
      press: true,
    },
    {
      key: 'a11y.hud.ashMass' as CopyKey,
      value: `${rod.readouts.ashGrams}g`,
      press: true,
    },
  ];
  if (name !== '' && props.game.settings.value.hints) {
    rows.push({ key: 'a11y.hud.category', value: name, press: false });
  }
  return rows;
});
</script>

<template>
  <header class="hud" :data-phase="summary.phase" :data-over="summary.overLimit">
    <button
      class="cat"
      data-hook="category"
      :aria-label="copy.say('a11y.hud.category')"
      @pointerdown="mark.onPointerDown"
      @pointerup="mark.onPointerUp"
      @pointerleave="mark.onPointerLeave"
      @pointercancel="mark.onPointerCancel"
      @pointerenter="mark.onPointerEnter"
      @click="mark.onClick"
    >
      <DemoGlyph tone="hud" :size="20" name="rod" />
      <!-- Unread unlocks: the only reason this row ever asks for attention. -->
      <span v-if="fresh > 0" class="badge" aria-hidden="true" />
    </button>

    <span class="ring" role="img" :aria-label="copy.say(reading.label)">
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle class="track" cx="20" cy="20" r="17" />
        <circle
          class="arc"
          cx="20"
          cy="20"
          r="17"
          :stroke-dasharray="`${(reading.fraction * CIRCUMFERENCE).toFixed(2)} ${String(CIRCUMFERENCE)}`"
        />
      </svg>
      <!-- The screen's own §2 symbol; the over-limit diamond is the one mark the five screens
           do not draw, so it stays text. -->
      <span v-if="summary.overLimit" class="mark" aria-hidden="true">◇</span>
      <DemoGlyph v-else class="mark" :name="reading.glyph" tone="hud" :size="26" />
    </span>

    <!-- The numbers are the way into the break's own sheet: the count you can see is the
         button, so there is no fourth tab that only duplicates it. Which figures are on show is
         the screen's own set — §2 keeps three on 待机 and one on 吐烟. -->
    <template v-for="figure in reading.figures" :key="figure.key">
      <button
        v-if="figure.press"
        class="num"
        data-hook="break"
        :class="{ alt: figure.accent }"
        :aria-label="copy.say(figure.key)"
        @click="emit('break')"
      >
        {{ figure.value }}
      </button>
      <span
        v-else
        class="num"
        :class="{ alt: figure.accent }"
        role="img"
        :aria-label="copy.say(figure.key)"
        >{{ figure.value }}</span
      >
    </template>

    <!-- S11's five, on a width that has room for them. Each figure opens the break's own sheet,
         because a number you cannot ask about is decoration. -->
    <div v-if="desk.length > 0" class="desk" data-hook="hud-desk">
      <template v-for="row in desk" :key="row.key">
        <button
          v-if="row.press"
          class="read"
          :aria-label="copy.say(row.key)"
          @click="emit('break')"
        >
          {{ row.value }}
        </button>
        <span v-else class="read" role="img" :aria-label="copy.say(row.key)">{{ row.value }}</span>
      </template>
    </div>
  </header>
</template>

<style scoped>
.hud {
  position: absolute;
  top: max(10px, env(safe-area-inset-top));
  display: flex;
  align-items: center;
  gap: 10px;
  /* Logical edges: the row mirrors with the document, the scene under it does not (§9.3). */
  inset-inline: 14px;
  justify-content: flex-start;
  z-index: 2;
  pointer-events: none;
}

.hud > * {
  pointer-events: auto;
}

.cat {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid var(--chrome-line);
  border-radius: 50%;
  background: color-mix(in oklab, var(--deep-charcoal) 55%, transparent);
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
}

.cat {
  position: relative;
}

.badge {
  position: absolute;
  top: 3px;
  inset-inline-end: 3px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ember-orange);
}

.ring {
  position: relative;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  flex: none;
}

.ring svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* The arc starts at the top and runs the way the rod burns. */
  transform: rotate(-90deg);
}

/* 22%, not one shade less: below it the player cannot see how much of the break is left. */
.track {
  fill: none;
  stroke: color-mix(in oklab, var(--soft-white) 22%, transparent);
  stroke-width: 3;
}

.arc {
  fill: none;
  stroke: var(--ember-orange);
  stroke-width: 3;
  stroke-linecap: round;
  transition: stroke-dasharray 120ms linear;
}

.ring .mark,
.ring .digits {
  position: relative;
  color: var(--soft-white);
  font-size: calc(15px * var(--text-scale));
  font-weight: 500;
  line-height: 1;
}

/* §1.2's 页头读数 is 14/22 at weight 600, and the same design's `accessibility.minFontSize` says no
   digit below 15 — the two documents disagree by one pixel, so the floor wins and the weight is
   taken. The 14 is left on record rather than quietly applied: see the ledger in §12 of the design. */
.num {
  color: var(--soft-white);
  font-size: calc(15px * var(--text-scale));
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  /* The cell is a button as often as it is a label, so it must look like neither. */
  padding: 0 2px;
  border: 0;
  background: transparent;
  font-family: inherit;
}

/* The amber figure is the one that changes fastest, so it is the one allowed to shout. */
.alt {
  color: var(--ember-core);
}

[data-phase='out'] .arc,
[data-over='true'] .arc {
  stroke: var(--smoke-gray);
}

/* S11's desk row. Below the width where all five figures fit it is neither in the layout nor in the
   screen reader's way — the phase pair above carries those numbers instead — and at that width the
   pair steps aside, so no figure is ever said twice on one screen. The 860px is the same boundary the
   side column appears on (`App.vue`, `DataRail.vue`). */
.desk {
  display: none;
  margin-inline-start: auto;
  align-items: center;
  gap: 14px;
}

@media (min-width: 860px) {
  .desk {
    display: flex;
  }

  .hud > .num {
    display: none;
  }
}

.read {
  color: var(--soft-white);
  font-size: calc(15px * var(--text-scale));
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  padding: 0 2px;
  border: 0;
  background: transparent;
  font-family: inherit;
}

button.read {
  cursor: pointer;
}

/* S20's `onReach`: the ring goes quiet and the number becomes a mark. Nothing is blocked. */
[data-over='true'] .num,
[data-over='true'] .read,
[data-over='true'] .ring .mark {
  color: var(--smoke-gray);
}
</style>
