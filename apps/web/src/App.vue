<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import { createPuffly } from './composables/usePuffly';
import { isScenePress } from './dismiss';
import { ANCHOR_LOCALE, STATE_KEYS } from './i18n';
import type { Destination } from './rail';
import type { ArchiveFacts } from './composables/usePuffly';
// The scene is the interface, and it is still a lazy chunk: three + TresJS are ~420 KB gzip and
// the first paint must not carry them (`defineAsyncComponent` is what keeps that promise —
// importing the component statically put all of it in the entry chunk).
const SceneStage = defineAsyncComponent(() => import('./components/SceneStage.vue'));
import HudBar from './components/HudBar.vue';
import CtaPill from './components/CtaPill.vue';
import TabRail from './components/TabRail.vue';
import ArchiveCard from './components/ArchiveCard.vue';
import SettingsSheet from './components/SettingsSheet.vue';
import SessionSheet from './components/SessionSheet.vue';
import CollectionSheet from './components/CollectionSheet.vue';
import DataRail from './components/DataRail.vue';
import { dimplePath } from './hintArt';

/** The strip's own size in CSS pixels; the diagram is generated at it, never scaled into it. */
const DIMPLE = { width: 44, height: 13, d: dimplePath(44, 13) };

/** The scene's hit surface: the whole bare stage, under the chrome. The scene canvas above it is
 * deaf to pointers (the mask in global.css), so a press on the scene reports this element. */
const surface = ref<HTMLDivElement | null>(null);
const game = createPuffly();
/** The three sheets the rail and the head-up row can call up. The menu is gone: the rail is the menu. */
type SheetName = 'none' | Destination;
const sheet = ref<SheetName>('none');
/** Which part of a sheet the player asked for — S10's sidebar entries land on a section, not just a sheet. */
const section = ref<string | null>(null);

/**
 * S17's card, and whether the player pinned it. The deck's own sentence is 「松手只收卡片、不掐灭烟」:
 * the card follows the finger while it is held and goes away when the finger leaves, and pinning is
 * what makes it stay. That is also the only reason tier three — the long prose — exists, because a
 * reader has to be able to put the phone down with the card still open.
 */
const archiveFacts = ref<ArchiveFacts | null>(null);
const archivePinned = ref(false);

/** Lifting the finger off the mark closes the card, unless it was pinned. Never touches the rod. */
const dismissArchive = (): void => {
  if (archivePinned.value) return;
  archiveFacts.value = null;
};

// A swipe down folds the interface, and a sheet left open is the loudest part of it.
watch(
  () => game.summary.value.state?.ui.chromeFolded ?? false,
  (folded) => {
    if (!folded) return;
    sheet.value = 'none';
    section.value = null;
    archivePinned.value = false;
    archiveFacts.value = null;
  },
);

const summary = computed(() => game.summary.value);

/**
 * Whether the chrome is on screen. The core decides this once (`ui.controlsVisible`) so the head-up
 * row, the pill and the rail all fold together and none of them can invent its own timer (§10).
 */
const chrome = computed(() => summary.value.controlsVisible || sheet.value !== 'none');
/**
 * A sheet is the interaction while it is open, and the pill sits exactly where its rows are — it
 * covered two settings rows on a phone. The rail stays: it is how the sheet is closed and how
 * another is reached. The archive card is not a sheet, so a rod held mid-draw keeps its handle.
 */
const pill = computed(() => chrome.value && sheet.value === 'none');

/**
 * Screen-reader prose lives here and nowhere else (§4, §64): a blind user hears the state, a
 * sighted user sees a scene. The one word a sighted player may read is the hint over the object
 * the engine is nudging (§28) — a verb, never a sentence, and it is off for screen readers
 * because the label below already says the same thing out loud.
 */
const announced = computed(() => {
  const copy = game.copy.value;
  const state = summary.value.state;
  const name = copy.say('app.name');
  if (!state) return name;
  const key = STATE_KEYS[state.cigarette.state];
  return `${name} — ${key === undefined ? state.cigarette.state : copy.say(key)}`;
});

/**
 * §9's third tier is a whole interface, not a colour: the document itself has to say which
 * language it is in and which way it reads, or a screen reader spells Arabic as Latin and a
 * sheet lays itself out in the wrong direction. The scene never follows — only the chrome does.
 */
watch(
  game.locale,
  (locale) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.lang = locale === 'icons' ? ANCHOR_LOCALE : locale;
    root.dir = game.copy.value.rtl ? 'rtl' : 'ltr';
  },
  { immediate: true },
);

onMounted(() => {
  if (surface.value) void game.attach(surface.value);
});

function openSheet(next: SheetName, nextSection: string | null = null): void {
  const same = sheet.value === next && section.value === nextSection;
  sheet.value = same ? 'none' : next;
  section.value = same ? null : nextSection;
}

/**
 * Asking the shelf for another group is a selection, not a toggle: `openSheet` closes what is
 * already open, so a player tapping the group they are already looking at would be thrown out of
 * the sheet. One sheet, one requested group, no surprise exit.
 */
function jumpToSection(next: string): void {
  sheet.value = 'shelf';
  section.value = next;
}

/**
 * 点内容区域之外就收起. Captured on the stage, so a press that lands on the scene steps the panel
 * aside. The press is deliberately **not** swallowed: a scene press is also how the break is driven
 * (hold to draw, swipe down to fold the chrome, tap the lighter), and eating it turned this
 * convenience into a broken gesture behind the panel. One press may therefore do both jobs — the
 * panel steps away and the scene answers as it always has.
 */
function dismissOnScene(event: PointerEvent): void {
  if (sheet.value === 'none') return;
  if (!isScenePress(surface.value, event.target)) return;
  sheet.value = 'none';
  section.value = null;
}
</script>

<template>
  <!--
    The four facts a break is made of, mirrored onto the stage as machine values. The worded hint
    below says the same thing the `data-affordance` does, but it says it in whatever language the
    player asked for, so anything that has to *know* which gesture is being nudged reads the
    attribute: a check that compares words only ever passes in one language.
  -->
  <main
    class="stage"
    :data-cues="summary.cueChannel"
    :data-break="summary.clock"
    :data-phase="summary.phase"
    :data-aim="summary.aim"
    :data-stage-box="summary.stageBox"
    :data-prop-scale="summary.propScale"
    :data-affordance="summary.affordance"
    @pointerdown.capture="dismissOnScene"
  >
    <!-- The scene's hit surface, under everything: a press that lands on the bare stage reports
         this element, which is what every gesture and the sheet dismissal aim at. -->
    <div ref="surface" class="hit" tabindex="0" :aria-label="announced" />
    <SceneStage
      :aim="summary.aim"
      :stage-box="summary.stageBox"
      :prop-scale="summary.propScale"
      :state="summary.state"
      :game="game"
    />

    <p
      v-if="summary.hint !== null && sheet === 'none'"
      class="hint"
      aria-hidden="true"
      :style="{ left: `${summary.hint?.x ?? 0}px`, top: `${summary.hint?.y ?? 0}px` }"
    >
      <!-- The wordless tier's half of S15: 提示条换成纸面塌陷示意图. Same shape the rod is drawn with,
           read off the same two numbers, so the diagram cannot drift away from the thing it diagrams. -->
      <svg
        v-if="summary.hint?.picture === 'dimple'"
        class="dimple"
        :width="DIMPLE.width"
        :height="DIMPLE.height"
        :viewBox="`0 0 ${DIMPLE.width} ${DIMPLE.height}`"
        focusable="false"
      >
        <path :d="DIMPLE.d" />
      </svg>
      <template v-else>{{ summary.hint?.word }}</template>
    </p>

    <HudBar
      v-show="chrome"
      :game="game"
      @shelf="openSheet('shelf')"
      @break="openSheet('break')"
      @archive="archiveFacts = game.archive.value"
      @archive-close="dismissArchive"
    />

    <ArchiveCard
      v-if="archiveFacts !== null"
      :game="game"
      :facts="archiveFacts"
      :pinned="archivePinned"
      @close="
        () => {
          archiveFacts = null;
          archivePinned = false;
        }
      "
      @pin="archivePinned = $event"
    />

    <CtaPill v-show="pill" :game="game" />

    <TabRail
      v-show="chrome"
      :game="game"
      :settings-open="sheet === 'settings'"
      @settings="openSheet('settings')"
    />

    <DataRail :game="game" :sheet="sheet" :section="section" @go="openSheet" />

    <SessionSheet
      :open="sheet === 'break'"
      :section="section"
      :game="game"
      @close="sheet = 'none'"
    />
    <CollectionSheet
      :open="sheet === 'shelf'"
      :section="section"
      :game="game"
      @archive="archiveFacts = game.archiveOf($event)"
      @jump="jumpToSection"
      @close="sheet = 'none'"
    />
    <SettingsSheet :open="sheet === 'settings'" :game="game" @close="sheet = 'none'" />
  </main>
</template>

<style scoped>
.stage {
  position: fixed;
  inset: 0;
  /*
   * `hidden` still leaves the box a *scroll container*, and a closed sheet hanging below the edge
   * gives it 620 px of scrollable overflow — so any descendant that asks to be scrolled into view
   * (a sheet's section jump, a focus landing inside one) could push the canvas up and leave it
   * there. `clip` is the same paint with no scroll box at all: the scene cannot be scrolled away.
   * Listed second so an engine without it keeps `hidden`.
   */
  overflow: hidden;
  overflow: clip;
}

/* The desk: the column takes its 260px out of the scene rather than over it (S10). */
@media (min-width: 860px) {
  .stage {
    inset-inline-end: 260px;
  }
}

/*
 * The scene's hit surface: fills the stage, sits under the chrome (later siblings paint above it),
 * and above nothing at all — the scene canvas is deaf to pointers, so every bare-stage press lands
 * here. It keeps the keyboard focus ring off the scene's own paint.
 */
.hit {
  position: absolute;
  inset: 0;
  outline: none;
}

/*
 * One word, naming the gesture the halo is asking for (§28). It is deliberately not a button
 * and takes no taps: `pointer-events: none` keeps the object underneath it reachable, which is
 * the whole point of putting the word on the scene rather than on the bar.
 */
/* The picture the wordless strip carries is a line drawing on the same dark floor the word sat on, so
   it inherits the strip's own opacity rather than getting a colour of its own. */
.hint .dimple path {
  fill: none;
  stroke: var(--soft-white);
  stroke-width: 1.6;
  stroke-linecap: round;
}

.hint {
  position: absolute;
  transform: translate(-50%, -50%);
  margin: 0;
  color: var(--soft-white);
  font-size: calc(15px * var(--text-scale));
  letter-spacing: 0.26em;
  text-transform: uppercase;
  white-space: nowrap;
  opacity: 0.66;
  pointer-events: none;
  text-shadow: 0 1px 8px rgb(0 0 0 / 0.85);
  animation: hint-in 420ms var(--ease-out);
  transition: opacity 260ms var(--ease-out);
}

@keyframes hint-in {
  from {
    opacity: 0;
    transform: translate(-50%, -42%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hint {
    animation: none;
  }
}
</style>
