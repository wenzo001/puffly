<script setup lang="ts">
/**
 * The big pill from S1–S5, and the little diagram under it that says what the hand should do.
 *
 * It is a handle on the real gesture, not a picture of one: pressing it sends exactly what the
 * space bar sends (§65), aimed at exactly the anchor the engine is nudging, so the scene never
 * has two sources of truth about what "held" means. The label stays in every tier but `icons`
 * because §9.2 keeps a button's short label as the anchor a translation hangs on.
 *
 * The icon is the Demo's own 26×26 SVG and there is deliberately no ring around it: §4.2 of the
 * Demo forbids the ring inside a button — the ring is the header's language. The pill keeps two
 * visual states, also the Demo's: orange gradient for the two actions that begin a break
 * (取烟 / 点燃), dark gradient with the orange hairline for the three inside it
 * (吐烟 / 收烟 / 磕灰).
 */
import { computed, ref } from 'vue';
import type { Puffly } from '../composables/usePuffly';
import { ctaKeyFor } from '../i18n';
import { isSustained } from '../phase';
import { FORCE_BAR, forceFillWidth, forceReading } from '../forceArt';
import DemoGlyph from './DemoGlyph.vue';

const props = defineProps<{ game: Puffly }>();

const copy = computed(() => props.game.copy.value);
const summary = computed(() => props.game.summary.value);
const affordance = computed(() => summary.value.affordance);
const sustained = computed(() => isSustained(affordance.value));
const held = ref(false);

/**
 * Which verb the handle shows is the rod's own measurement, not a category the interface keeps a
 * list of: `ctaKeyFor` is the one place that knows a mouthed draw is not an inhalation.
 */
const savourMs = computed(() => summary.value.state?.cigarette.readouts.savourMs ?? 0);

const label = computed(() => {
  const key = ctaKeyFor(affordance.value, savourMs.value);
  return key === undefined ? null : copy.value.t(key);
});

/** The Demo icon each action wears. */
const glyph = computed(() => {
  switch (affordance.value) {
    case 'pick':
      return 'rod';
    case 'lighter':
      return 'flame';
    case 'puff':
      return 'exhale-arrow';
    case 'flick':
      return 'flick';
    case 'extinguish':
      return 'extinguish';
    case 'discard':
      return 'ashtray';
    default:
      return 'rod';
  }
});

/** §4.2's two tiers: the two starters are orange, everything in the break is dark. */
const tone = computed<'start' | 'cont'>(() =>
  affordance.value === 'pick' || affordance.value === 'lighter' ? 'start' : 'cont',
);

function down(): void {
  if (!sustained.value) return;
  held.value = true;
  props.game.gesture('hold');
}

function up(): void {
  if (!sustained.value || !held.value) return;
  held.value = false;
  props.game.gesture('release');
}

function tap(): void {
  if (sustained.value) return;
  props.game.gesture('tap');
}

/**
 * S4's 力度读数: the draw the finger just took, or `null` outside the window the smoke is leaving.
 * The ring wears the same call, and the Demo bar's fill is that figure's own share of 342 px.
 */
const force = computed(() => {
  const state = summary.value.state;
  return state ? forceReading(state.cigarette) : null;
});
const fillWidth = computed(() => forceFillWidth(force.value ?? 0));
const fillRadius = computed(() => Math.min(FORCE_BAR.fill.radius, fillWidth.value / 2));

/** The 品鉴型 have no lung resistance on this design — the wave is theirs to lose, the bar is not. */
const lungKind = computed(() =>
  props.game.archive.value?.subject === 'rod' ? props.game.archive.value.kind : 'inhale',
);
</script>

<template>
  <div class="cta" :data-affordance="affordance" :data-held="held">
    <button
      class="pill"
      data-hook="pill"
      :aria-label="
        label === null
          ? copy.say('a11y.pill', { word: affordance })
          : copy.say('a11y.pill', { word: label })
      "
      :aria-pressed="sustained ? held : undefined"
      @pointerdown.prevent="down"
      @pointerup="up"
      @pointercancel="up"
      @pointerleave="up"
      @click="tap"
    >
      <DemoGlyph class="glyph" :name="glyph" :tone="tone" :size="26" aria-hidden="true" />
      <span v-if="label !== null" class="word">{{ label }}</span>
    </button>

    <!-- 阻力波形条 (S3): the two pulses that have passed, and the dashed beat still coming. The
         品鉴型 have no lungs in this design’s vocabulary, so they never get this strip. -->
    <svg
      v-if="summary.phase === 'puff' && force === null && lungKind !== 'savor'"
      class="art wave"
      viewBox="0 0 342 30"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x="0" y="14" width="342" height="2" rx="1" fill="rgba(255,255,255,0.07)" />
      <path
        d="M4 15 L30 15 L40 8 L52 22 L62 15 L96 15"
        fill="none"
        stroke="rgba(255,138,61,0.85)"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M104 15 L130 15 L140 8 L152 22 L162 15 L196 15"
        fill="none"
        stroke="rgba(255,138,61,0.5)"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M204 15 L338 15"
        fill="none"
        stroke="rgba(255,138,61,0.22)"
        stroke-width="2"
        stroke-linecap="round"
        stroke-dasharray="3 7"
      />
    </svg>

    <!-- 力度条 (S4): the Demo’s 342×12 fill bar. The fill is the draw just released, 0–100, and
         nothing here is a control — the press already decided it. -->
    <svg
      v-else-if="force !== null"
      class="art force"
      viewBox="0 0 342 12"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x="0" y="2" width="342" height="8" rx="4" :fill="FORCE_BAR.track.fill" />
      <rect y="2" :width="fillWidth" height="8" :rx="fillRadius" :fill="FORCE_BAR.fill.colour" />
      <rect
        y="2"
        :width="fillWidth"
        height="3"
        :rx="Math.min(FORCE_BAR.crest.radius, fillWidth / 2)"
        :fill="FORCE_BAR.crest.colour"
      />
    </svg>

    <!-- 磕灰演示条 (S5): the standing column, the piece that just broke away, the arc it travels,
         and the mound with two grains where it lands. -->
    <svg
      v-else-if="summary.phase === 'tray'"
      class="art flick"
      viewBox="0 0 342 26"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x="8" y="4" width="46" height="7" rx="3.5" fill="rgba(240,230,214,0.75)" />
      <rect x="54" y="4" width="12" height="7" rx="2" fill="#8A8078" />
      <path
        d="M84 8q10-10 20 0"
        fill="none"
        stroke="rgba(255,138,61,0.7)"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-dasharray="2 4"
      />
      <ellipse cx="152" cy="9" rx="34" ry="4" fill="rgba(207,198,188,0.18)" />
      <circle cx="146" cy="6" r="1.8" fill="rgba(207,198,188,0.7)" />
      <circle cx="158" cy="5" r="1.4" fill="rgba(207,198,188,0.55)" />
    </svg>
  </div>
</template>

<style scoped>
.cta {
  position: absolute;
  bottom: calc(74px + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  /* §2's `.btn` is `calc(100% - 48px)` inside a 390-wide phone, which is 342 — the same number the
     Demo writes out itself as the three strips' viewBox. The cap is what keeps a phone's button
     from becoming a desktop's banner: §2 defines the phone and nothing wider. */
  width: calc(100% - 48px);
  max-width: 342px;
  z-index: 2;
}

.pill {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  min-height: 62px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 31px;
  /* §1's --grad-start, and --on-ember for everything drawn on it. */
  background: linear-gradient(90deg, #ff8533, #de5719);
  color: #2a1408;
  font: inherit;
  font-size: calc(17px * var(--text-scale));
  font-weight: 600;
  letter-spacing: 0.04em;
  box-shadow: 0 10px 28px -6px rgba(217, 87, 25, 0.42);
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  /* The Demo's own press curve, scoped to this press: the global ease stays the rest of the UI's. */
  transition:
    transform 180ms cubic-bezier(0.22, 0.61, 0.36, 1),
    box-shadow 200ms var(--ease-out);
}

.pill:active,
.cta[data-held='true'] .pill {
  /* §1.3's 按钮按下: scale .98 / 180ms. */
  transform: scale(0.98);
  box-shadow: 0 4px 16px -8px color-mix(in oklab, var(--ember-orange) 70%, transparent);
}

/**
 * §2's two states: the orange gradient begins a break (S1 取烟， S2 点燃）, and the dark one with the
 * orange hairline carries the three actions inside a break already running (S3 吐烟， S4 收烟，
 * S5 磕灰）.
 */
.cta:not([data-affordance='pick']):not([data-affordance='lighter']) .pill {
  background: linear-gradient(180deg, #3d3b38, #1f1d1c);
  border-color: rgba(255, 153, 71, 0.42);
  color: #e4dcd2;
  box-shadow: 0 10px 24px -6px rgba(0, 0, 0, 0.5);
}

.glyph {
  display: block;
  flex: none;
}

.word {
  font-variant-numeric: tabular-nums;
}

/* The three Demo strips are all 342 wide; their heights arrive with their own viewBoxes. */
.art {
  display: block;
  width: 100%;
  height: auto;
  opacity: 0.85;
}
</style>
