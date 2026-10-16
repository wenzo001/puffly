<script setup lang="ts">
/**
 * One rod in the 图鉴 (S8). A card is a chip of its own paper colour, the two names it goes by, the
 * word for what it is like to smoke, and the rung that opens it — with two gestures: tap to put it in
 * the hand, hold for its archive. A rod that has not been met yet is shown rather than hidden: the
 * ladder is the point of the screen, and an empty grid teaches nothing.
 *
 * The rung is digits on the card and a spoken axis in the label, exactly as the room cards do it,
 * because a bare number has no axis and the wordless tier cannot carry one.
 */
import { computed } from 'vue';
import type { UnlockRule } from '@puffly/game-core';
import { cardLabel } from '../scenes';
import { rodNoteKey, type I18n } from '../i18n';
import { useLongPress } from '../composables/useLongPress';

const props = defineProps<{
  id: string;
  name: string;
  zhName: string;
  swatch: string;
  locked: boolean;
  selected: boolean;
  /** This rod's own rung, already marked: `◷14`, `65`, or empty for the one that is free. */
  rung: string;
  unlock: UnlockRule;
  /** S8's third line: this rod's own minutes, already to a tenth. Digits, so no tier drops it. */
  minutes: string;
  copy: I18n;
}>();

const emit = defineEmits<{ use: [id: string]; archive: [id: string] }>();

const hold = useLongPress(
  () => emit('archive', props.id),
  () => {
    if (!props.locked) emit('use', props.id);
  },
);

/** S8's second line: what this rod is like to smoke. A word, so the icons tier drops it. */
const note = computed(() => {
  const key = rodNoteKey(props.id);
  return key === undefined ? null : props.copy.t(key);
});
/** The unit is a word, so the icons tier drops it and the number has to stand on its own. */
const unit = computed(() => props.copy.t('archive.unitMin'));
/**
 * Spoken, the number needs its axis even where the picture cannot show one — a bare "10.0" on a
 * screen reader is a figure with no unit, which is the thing §26's readouts exist to prevent.
 */
const named = computed(() =>
  props.minutes === ''
    ? props.name
    : `${props.name} ${props.minutes} ${props.copy.say('archive.unitMin')}`,
);
/** The dot that marks a card as unreadable is decoration; the name has to carry it instead. */
const label = computed(() =>
  cardLabel(
    props.copy,
    props.copy.say('a11y.tile', { name: named.value, zhName: props.zhName }),
    props.unlock,
    props.locked,
  ),
);
</script>

<template>
  <button
    class="tile"
    :data-rod="id"
    :data-locked="locked"
    :data-selected="selected"
    :aria-pressed="selected"
    :aria-label="label"
    @pointerdown="hold.onPointerDown"
    @pointerup="hold.onPointerUp"
    @pointerleave="hold.onPointerLeave"
    @pointercancel="hold.onPointerCancel"
    @pointerenter="hold.onPointerEnter"
    @click="hold.onClick"
  >
    <span class="chip" :style="{ background: swatch }" aria-hidden="true" />
    <span v-if="locked" class="lock" aria-hidden="true">·</span>
    <span v-if="locked && rung !== ''" class="rung digits" aria-hidden="true">{{ rung }}</span>
    <span v-if="copy.t('shelf.rods') !== null" class="names">
      <span class="name">{{ name }}</span>
      <span class="zh">{{ zhName }}</span>
      <span v-if="note !== null" class="note">{{ note }}</span>
    </span>
    <span v-if="minutes !== ''" class="length">
      <span class="digits">{{ minutes }}</span>
      <span v-if="unit !== null" class="unit">{{ unit }}</span>
    </span>
  </button>
</template>

<style scoped>
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 92px;
  min-height: var(--tap-target, 44px);
  padding: 8px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: color-mix(in oklab, var(--soft-white) 4%, transparent);
  color: var(--soft-white);
  font: inherit;
  text-align: start;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  transition:
    border-color 180ms var(--ease-out),
    background-color 180ms var(--ease-out);
}

.chip {
  width: 100%;
  height: 22px;
  border-radius: 5px;
}

.names {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.name {
  font-size: calc(15px * var(--text-scale));
  letter-spacing: 0.03em;
}

.zh {
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
}

/* The number a locked card is waiting for. In the flow rather than the sheet's corner position,
   because the dot that says "locked" already owns this card's corner. */
.rung {
  color: var(--soft-white);
  font-size: calc(15px * var(--text-scale));
  font-weight: 500;
}

.note {
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
}

/* S8's third line, outside the names block: the icons tier drops the words and keeps this number. */
.length {
  display: flex;
  gap: 3px;
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
  line-height: 1.2;
}

.lock {
  position: absolute;
  top: 6px;
  inset-inline-end: 10px;
  color: var(--soft-white);
  opacity: 0.7;
}

.tile[data-locked='true'] {
  opacity: 0.42;
}

.tile[data-locked='false']:active {
  background: color-mix(in oklab, var(--soft-white) 9%, transparent);
}

/* The hover half is gated: a lift that leaves `:hover` behind would otherwise keep an unselected
   tile looking pressed. */
@media (hover: hover) {
  .tile[data-locked='false']:hover {
    background: color-mix(in oklab, var(--soft-white) 9%, transparent);
  }
}

.tile[data-selected='true'] {
  border-color: var(--ember-orange);
  background: color-mix(in oklab, var(--ember-orange) 14%, transparent);
}
</style>
