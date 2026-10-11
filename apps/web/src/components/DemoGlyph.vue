<script setup lang="ts">
/**
 * The icons §2 and §4 of `SmokeRitual-UI-Demo.html` draw, as one component.
 *
 * Every path, rect and circle below is the Demo's own SVG — same viewBox, same coordinates — so the
 * header symbol, the button icon and the rail mark can never disagree about what, say, the ashtray
 * looks like. Only the *ink* changes with the surface the icon sits on (`tone`):
 *
 * - `hud`   the 40×40 header ring's 26×26 symbol, on the dark stage;
 * - `start` the two orange start buttons (取烟 / 点燃), where the ink is #2A1408 with a #F5C08A
 *           filter;
 * - `cont`  the dark continue buttons (吐烟 / 收烟 / 磕灰), ink #EDE5DA / #C89A5E / #FF8A3D;
 * - `tab`   the bottom rail, which inherits `currentColor` so the lit tab's orange capsule carries
 *           #2A1204 automatically.
 *
 * The component carries no ring of its own anywhere: §4.2 forbids the ring inside a button.
 */
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    name:
      | 'rod'
      | 'flame'
      | 'airflow'
      | 'swirl-dot'
      | 'tray-lines'
      | 'exhale-arrow'
      | 'extinguish'
      | 'flick'
      | 'ashtray'
      | 'gear';
    tone?: 'hud' | 'start' | 'cont' | 'tab';
    size?: number;
  }>(),
  { tone: 'hud', size: 26 },
);

/** The HUD tone's three Demo inks, named on one line so the spec-grep test can cite them. */
const HUD_INK = { paper: '#EDE5DA', filter: '#C89A5E', ember: '#FF8A3D' };

/** The three inks every rod icon composes, per surface. */
const palette = computed(() => {
  switch (props.tone) {
    case 'start':
      // §4.2 起始级： on #FF8533→#DE5719 the icon is #2A1408 with the filter in #F5C08A.
      return {
        paper: '#2A1408',
        filter: '#F5C08A',
        ember: '#2A1408',
        flameOuter: '#2A1408',
        flameInner: '#F5C08A',
        accent: '#2A1408',
        soft: '#2A1408',
      };
    case 'cont':
      return {
        paper: '#EDE5DA',
        filter: '#C89A5E',
        ember: '#FF8A3D',
        flameOuter: '#EDE5DA',
        flameInner: '#FF8A3D',
        accent: '#FF8A3D',
        soft: '#EDE5DA',
      };
    case 'tab':
      return {
        paper: 'currentColor',
        filter: 'currentColor',
        ember: 'currentColor',
        flameOuter: 'currentColor',
        flameInner: 'currentColor',
        accent: 'currentColor',
        soft: 'currentColor',
      };
    case 'hud':
    default:
      return {
        ...HUD_INK,
        flameOuter: '#FFD9A0',
        flameInner: '#FFD9A0',
        accent: '#FF8A3D',
        soft: '#FFD9A0',
      };
  }
});

/** S5's three stacked ash lines fade as they do in the Demo (.85 / .6 / .35). */
const TRAY_OPACITIES = [0.85, 0.6, 0.35] as const;
</script>

<template>
  <svg
    class="demo-glyph"
    :data-name="name"
    :width="size"
    :height="size"
    viewBox="0 0 26 26"
    aria-hidden="true"
    focusable="false"
  >
    <!-- 取烟 / 烟支： paper tube, filter band, ember. -->
    <template v-if="name === 'rod'">
      <rect x="3" y="11" width="15" height="3.4" rx="1.7" :fill="palette.paper" />
      <rect x="3" y="11" width="5" height="3.4" rx="1.7" :fill="palette.filter" />
      <circle cx="21" cy="12.7" r="2" :fill="palette.ember" />
    </template>

    <!-- 点燃： the Demo's teardrop. -->
    <path
      v-else-if="name === 'flame'"
      d="M13 4C9 9 6.6 11.2 6.6 14.4c0 3.8 2.9 6.6 6.4 6.6s6.4-2.8 6.4-6.6c0-3.2-2.4-5.4-6.4-10.4Z"
      :fill="palette.flameOuter"
    />

    <!-- 吸入： three airflow lines. -->
    <template v-else-if="name === 'airflow'">
      <rect x="7.5" y="5.5" width="11" height="2.8" rx="1.4" :fill="palette.soft" />
      <rect x="7.5" y="11.6" width="11" height="2.8" rx="1.4" :fill="palette.soft" />
      <rect x="7.5" y="17.7" width="11" height="2.8" rx="1.4" :fill="palette.soft" />
    </template>

    <!-- 吐烟 (header S4): swirl with an ember dot. -->
    <template v-else-if="name === 'swirl-dot'">
      <path
        d="M9 17C11 12 16 10.5 13.6 13c-2 2.5-1 5.5 5 5"
        fill="none"
        :stroke="palette.accent"
        stroke-width="2"
        stroke-linecap="round"
      />
      <circle cx="13.6" cy="13.6" r="1.8" :fill="palette.soft" />
    </template>

    <!-- 磕灰 (header S5): three stacked ash lines, fading. -->
    <template v-else-if="name === 'tray-lines'">
      <rect
        v-for="(opacity, i) in TRAY_OPACITIES"
        :key="i"
        x="7"
        :y="7 + i * 5"
        width="12"
        height="3"
        rx="1.5"
        :fill="palette.paper"
        :fill-opacity="opacity"
      />
    </template>

    <!-- 吐烟 (S3 button): the rising swirl with the arrowhead up. -->
    <template v-else-if="name === 'exhale-arrow'">
      <path
        d="M13 22C10 18.5 16 16 13 12.5 10.5 9.8 15.5 8 13 4.5"
        fill="none"
        :stroke="palette.paper"
        stroke-width="2.2"
        stroke-linecap="round"
      />
      <path
        d="M10 7.5 13 4l3 3.5"
        fill="none"
        :stroke="palette.accent"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </template>

    <!-- 收烟： the rod with the cross at its ember end. -->
    <template v-else-if="name === 'extinguish'">
      <rect x="2.5" y="11.3" width="15" height="3.4" rx="1.7" :fill="palette.paper" />
      <rect x="2.5" y="11.3" width="4.4" height="3.4" rx="1.7" :fill="palette.filter" />
      <path
        d="M19 8.5 24 17.5M24 8.5 19 17.5"
        fill="none"
        :stroke="palette.accent"
        stroke-width="2"
        stroke-linecap="round"
      />
    </template>

    <!-- 磕灰 (S5 button): the rod with the three ash dots falling. -->
    <template v-else-if="name === 'flick'">
      <rect x="3" y="5.6" width="15" height="3.4" rx="1.7" :fill="palette.paper" />
      <rect x="3" y="5.6" width="4.4" height="3.4" rx="1.7" :fill="palette.filter" />
      <circle cx="19.4" cy="11.6" r="1.7" fill="#CFC6BC" />
      <circle cx="22.4" cy="16.4" r="1.3" fill="#9C948A" />
      <circle cx="19" cy="21" r="1" fill="#6E6862" />
    </template>

    <!-- Rail: the ashtray (path + rim). -->
    <template v-else-if="name === 'ashtray'">
      <path d="M4 6h10v5.2c0 1-.8 1.8-1.8 1.8H5.8C4.8 13 4 12.2 4 11.2Z" :fill="palette.paper" />
      <rect x="6.5" y="3.2" width="5" height="1.6" rx="0.8" :fill="palette.paper" opacity="0.6" />
    </template>

    <!-- Rail: the gear. -->
    <template v-else-if="name === 'gear'">
      <circle cx="9" cy="9" r="3.1" fill="none" :stroke="palette.paper" stroke-width="1.6" />
      <g :stroke="palette.paper" stroke-width="1.6" stroke-linecap="round">
        <path
          d="M9 1.6v2M9 14.4v2M1.6 9h2M14.4 9h2M3.8 3.8l1.4 1.4M12.8 12.8l1.4 1.4M14.2 3.8l-1.4 1.4M5.2 12.8l-1.4 1.4"
        />
      </g>
    </template>
  </svg>
</template>
