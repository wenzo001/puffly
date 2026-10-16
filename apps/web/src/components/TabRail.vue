<script setup lang="ts">
/**
 * The rail from S1–S6: three phases and a way to settings.
 *
 * The three phases are indicators, not buttons — the cigarette decides which one you are on, and
 * nothing about the scene can be reached from here that a finger on the scene cannot reach
 * faster. Only `settings` is a control, because that is the one place the interface is allowed to
 * be an interface (§10).
 */
import { computed } from 'vue';
import type { Puffly } from '../composables/usePuffly';
import type { CopyKey } from '../i18n';
import type { Phase } from '../phase';
import DemoGlyph from './DemoGlyph.vue';

const props = defineProps<{ game: Puffly; settingsOpen: boolean }>();
const emit = defineEmits<{ settings: [] }>();

const copy = computed(() => props.game.copy.value);
const phase = computed(() => props.game.summary.value.phase);

/** The rail's four 18 px icons, the Demo’s own: flame / smoke / ashtray / gear. */
const TABS: readonly {
  id: Phase;
  icon: 'flame' | 'rod' | 'ashtray';
  key: CopyKey;
}[] = [
  { id: 'light', icon: 'flame', key: 'tab.light' },
  { id: 'puff', icon: 'rod', key: 'tab.puff' },
  { id: 'tray', icon: 'ashtray', key: 'tab.tray' },
];

const on = (id: Phase): boolean => !props.settingsOpen && phase.value === id;
</script>

<template>
  <nav class="rail" :aria-label="copy.say('a11y.hud.rail')">
    <span
      v-for="tab in TABS"
      :key="tab.id"
      class="tab"
      :data-tab="tab.id"
      :data-on="on(tab.id)"
      :aria-current="on(tab.id) ? 'step' : undefined"
    >
      <DemoGlyph class="glyph" :name="tab.icon" tone="tab" :size="18" aria-hidden="true" />
      <span v-if="copy.t(tab.key) !== null" class="word">{{ copy.t(tab.key) }}</span>
    </span>

    <button
      class="tab"
      data-tab="settings"
      :data-on="settingsOpen"
      :aria-label="copy.say('tab.settings')"
      @click="emit('settings')"
    >
      <DemoGlyph class="glyph" name="gear" tone="tab" :size="18" aria-hidden="true" />
      <span v-if="copy.t('tab.settings') !== null" class="word">{{ copy.t('tab.settings') }}</span>
    </button>
  </nav>
</template>

<style scoped>
.rail {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: stretch;
  gap: 0;
  margin-bottom: calc(8px + env(safe-area-inset-bottom));
  padding: 4px;
  border: 1px solid var(--chrome-line);
  /* §1.3's 导航胶囊: 32–36 radius on a 62-tall bar. */
  border-radius: 32px;
  height: 62px;
  /* §1's --capsule, and the 20px blur the Demo puts under it. */
  background: rgba(26, 24, 23, 0.86);
  backdrop-filter: blur(20px);
  /* §2's `.tabbar` is `padding: 14px 20px`, so the capsule is 350 wide in a 390 phone. The cap keeps
     a phone's capsule from becoming a desktop's bar; §2 defines the phone and nothing wider. */
  width: calc(100% - 40px);
  max-width: 350px;
  z-index: 3;
}

.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  /* §2's `.item` is `flex: 1` — the four share the capsule, they do not size themselves. */
  flex: 1;
  min-width: 0;
  /* The capsule is 62 with 4 of padding on each face; the item fills what is left. */
  min-height: 54px;
  padding: 0 8px;
  /* A caption under a mark, not body text — and it must never wrap onto the mark's line. */
  white-space: nowrap;
  border: 1px solid transparent;
  /* §2 puts `--r-capsule` on the item as well as the capsule; on a 54-tall item the browser clamps
     it to half the height, and the Demo ships that clamp, so the number here is its own. */
  border-radius: 32px;
  background: transparent;
  /* §1's --text-2: the Demo's own colour for a tab label, judged at 5.1:1 on the floor. */
  color: var(--text-2);
  font: inherit;
  font-size: var(--label-size);
  letter-spacing: 0.02em;
  transition:
    color 200ms var(--ease-out),
    background-color 200ms var(--ease-out),
    border-color 200ms var(--ease-out);
}

/* The lit tab is the only filled thing down here: it says where the cigarette is, not what to tap. */
.tab[data-on='true'] {
  /* §1's --on-ember, the same ink the Demo puts on the orange pill. */
  color: #2a1408;
  background: linear-gradient(
    100deg,
    color-mix(in oklab, var(--ember-orange) 88%, var(--deep-charcoal)),
    var(--ember-orange)
  );
  border-color: transparent;
}

.tab .glyph {
  display: block;
  line-height: 1;
}

button.tab[data-on='false']:active {
  color: var(--soft-white);
  border-color: var(--chrome-line);
}

/* A finger keeps `:hover` set after it lifts, so the hover half stays gated on hardware that can
   actually hover — otherwise the tab stays lit once the tap is over. */
@media (hover: hover) {
  button.tab[data-on='false']:hover {
    color: var(--soft-white);
    border-color: var(--chrome-line);
  }
}
</style>
