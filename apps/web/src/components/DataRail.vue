<script setup lang="ts">
/**
 * S10's column: the eight destinations and the day's own numbers, standing where the phone keeps
 * them behind a tab, a button and a scroll.
 *
 * It is a second density of the same facts, not a second source — the panel is the very component
 * the break sheet renders, and every entry opens the very same sheet the chrome would have. The
 * column appears by width, not by device: a phone held sideways and a 1440px window disagree about
 * nothing except how much room there is.
 */
import { computed } from 'vue';
import type { Puffly } from '../composables/usePuffly';
import { RAIL_ENTRIES, entryFor, type Destination } from '../rail';
import ReductionPanel from './ReductionPanel.vue';

const props = defineProps<{
  game: Puffly;
  sheet: Destination | 'none';
  section: string | null;
}>();

const emit = defineEmits<{ go: [sheet: Destination, section: string | null] }>();

const copy = computed(() => props.game.copy.value);
const active = computed(() => entryFor(props.sheet, props.section));
</script>

<template>
  <aside class="data-rail">
    <nav class="entries" :aria-label="copy.say('a11y.dataRail')">
      <button
        v-for="entry in RAIL_ENTRIES"
        :key="entry.id"
        class="entry"
        :data-entry="entry.id"
        :aria-current="active?.id === entry.id ? 'true' : undefined"
        @click="emit('go', entry.sheet, entry.section)"
      >
        <span class="glyph" aria-hidden="true">{{ entry.glyph }}</span>
        <span v-if="copy.t(entry.key) !== null" class="word">{{ copy.t(entry.key) }}</span>
      </button>
    </nav>

    <ReductionPanel class="panel" :game="game" />
  </aside>
</template>

<style scoped>
/* By width, not by device: a sideways phone and a 1440px window disagree about room only. */
.data-rail {
  position: fixed;
  inset-block: 0;
  inset-inline-end: 0;
  z-index: 3;
  display: none;
  flex-direction: column;
  gap: 14px;
  width: 260px;
  flex: 0 0 260px;
  padding: 14px;
  padding-block-start: max(14px, env(safe-area-inset-top));
  overflow-y: auto;
  /* A mouse wheel reaches this box on its own; a finger does not. §66 puts `touch-action: none` on
     `body` to hand the gestures to the scene, and a pan is judged along the chain up to the scroll
     container — so an `overflow: auto` that names nothing is exactly a rail that scrolls under a
     trackpad and not under a thumb on a touch laptop in wide layout. */
  touch-action: pan-y;
  background: color-mix(in oklab, var(--deep-charcoal) 92%, black);
  border-inline-start: 1px solid var(--chrome-line);
}

@media (min-width: 860px) {
  .data-rail {
    display: flex;
  }
}

.entries {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.entry {
  display: flex;
  min-height: var(--tap-target);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--chrome-line);
  border-radius: 12px;
  color: var(--soft-white);
  background: transparent;
  font-family: inherit;
  cursor: pointer;
}

.entry[aria-current='true'] {
  border-color: var(--ember-orange);
  color: var(--ember-core);
}

.glyph {
  font-size: calc(15px * var(--text-scale));
  line-height: 1;
}

.word {
  font-size: calc(15px * var(--text-scale));
  line-height: 1.15;
  text-align: center;
  color: var(--smoke-gray);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-block-start: 12px;
  border-block-start: 1px solid var(--chrome-line);
}
</style>
