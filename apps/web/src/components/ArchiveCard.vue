<script setup lang="ts">
/**
 * S17: the archive card, at the density the hand asked for.
 *
 * Three tiers, none of which interrupts the burn — the rod keeps going behind this because the
 * burn timer is not a child of the interface (§ coreLoop.criticalRule). A short hold opens tier
 * two, the three numbers that describe the stick; pinning it opens tier three, the softer facts
 * that need sentences and therefore need the ≈ mark (§ dataHonesty).
 */
import { computed } from 'vue';
import type { CopyKey } from '../i18n';
import type { ArchiveFacts, Puffly, RodArchiveFacts } from '../composables/usePuffly';

const props = defineProps<{
  game: Puffly;
  /** Whichever rod the hand asked about: the one burning, or one in the cabinet. */
  facts: ArchiveFacts | null;
  pinned: boolean;
}>();
const emit = defineEmits<{ close: []; pin: [pinned: boolean] }>();

const copy = computed(() => props.game.copy.value);
const facts = computed(() => props.facts);

/** The card's rod half, or null when the hand asked about a box. */
const rod = computed<RodArchiveFacts | null>(() =>
  facts.value?.subject === 'rod' ? facts.value : null,
);
const box = computed(() => (facts.value?.subject === 'box' ? facts.value : null));

/**
 * S18's five fields in the deck's own order, with the reference range first because the tier line
 * is what it belongs to. Fields the archive does not carry are dropped rather than filled in: the
 * deck gives text for nine brands and none for the tenth, and a sentence invented to keep a row
 * even is the fabrication §10 rules out.
 */
const boxFields = computed(() => {
  const opened = box.value;
  if (!opened) return [];
  const rows: { key: CopyKey; text: string | undefined }[] = [
    { key: 'archive.price', text: opened.price },
    { key: 'archive.history', text: opened.history },
    { key: 'archive.occasion', text: opened.occasion },
    { key: 'archive.crowd', text: opened.crowd },
    { key: 'archive.gender', text: opened.gender },
    { key: 'archive.daily', text: opened.daily },
  ];
  return rows
    .filter((row) => typeof row.text === 'string' && row.text !== '')
    .map((row) => ({ key: row.key, text: row.text as string }));
});

/** Tier two: the three measurements, in the order the brief lists them. */
const cells = computed(() => {
  const rodFacts = rod.value;
  if (!rodFacts) return [];
  return [
    {
      key: 'archive.duration' as const,
      value: `${rodFacts.minutes}${copy.value.t('archive.unitMin') ?? ''}`,
    },
    { key: 'archive.puffs' as const, value: `${rodFacts.puffs}` },
    {
      key: 'archive.temp' as const,
      value: `${String(rodFacts.tempLow)}–${String(rodFacts.tempHigh)}${
        copy.value.t('archive.unitTemp') ?? ''
      }`,
    },
  ];
});
</script>

<template>
  <aside
    v-if="facts !== null"
    class="archive"
    data-hook="archive"
    :data-pinned="pinned"
    :aria-label="copy.say('a11y.archive')"
  >
    <header class="head">
      <span class="name">{{ facts.name }}</span>
      <span v-if="rod && copy.t('archive.duration') !== null" class="zh">{{ rod.zhName }}</span>
      <!-- S18: a box is filed by tier, and the tier is the only ranking-free thing it can say. -->
      <span v-else-if="box" class="zh">{{
        copy.t(`archive.tier.${box.tier}` as 'archive.tier.low')
      }}</span>
      <button
        class="icon-button close"
        data-reach
        :aria-label="copy.say('a11y.close')"
        @click="emit('close')"
      >
        ×
      </button>
    </header>

    <!-- S18's five fields, in the deck's order, and only the ones the archive actually has. A
         brand the deck gives no text for shows no row for it rather than a sentence nobody wrote. -->
    <dl v-if="box" class="fields">
      <template v-for="field in boxFields" :key="field.key">
        <dt>{{ copy.t(field.key) }}</dt>
        <dd>{{ field.text }}</dd>
      </template>
    </dl>

    <dl v-else class="cells">
      <template v-for="cell in cells" :key="cell.key">
        <dt v-if="copy.t(cell.key) !== null">{{ copy.t(cell.key) }}</dt>
        <dd class="digits">{{ cell.value }}</dd>
      </template>
    </dl>

    <!-- Tier three: the parts that can only be said, and the one figure that must be marked as
         an estimate. It is a range with a source, never a percentage nobody published. -->
    <template v-if="pinned">
      <p v-if="box !== null && copy.t('archive.disclaimer') !== null" class="range">
        {{ copy.t('archive.disclaimer') }}
      </p>
      <p v-if="rod !== null && rod.scenes.length > 0" class="scenes">
        <span v-if="copy.t('archive.scenes') !== null" class="label">{{
          copy.t('archive.scenes')
        }}</span>
        <span v-for="scene in rod.scenes" :key="scene" class="chip">{{ scene }}</span>
      </p>
      <!-- S19 asks the three tier-two figures to name where they come from, and this build's answer
           is not the real world's: a rod here lasts the length its own content says. Without the
           line, 「3.2 分钟」 and the design table's 「10.0 分钟」 look like a contradiction between two
           claims about a stick, when they are one claim about a game and one about life. -->
      <p v-if="rod !== null && copy.t('archive.basis') !== null" class="basis">
        {{ copy.t('archive.basis') }}
      </p>
      <p v-if="rod !== null && copy.t('archive.range') !== null" class="range">
        {{ copy.t('archive.range') }}
      </p>
    </template>

    <button
      v-if="copy.t('archive.pin') !== null || !pinned"
      class="pin"
      data-reach
      data-hook="pin"
      :aria-pressed="pinned"
      :aria-label="copy.say('archive.pin')"
      @click="emit('pin', !pinned)"
    >
      <span aria-hidden="true">{{ pinned ? '◆' : '◇' }}</span>
      <span v-if="copy.t('archive.pin') !== null" class="word">{{ copy.t('archive.pin') }}</span>
    </button>
  </aside>
</template>

<style scoped>
.archive {
  position: absolute;
  top: calc(58px + env(safe-area-inset-top));
  inset-inline-end: 14px;
  width: min(58vw, 240px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--chrome-line);
  border-radius: var(--radius);
  background: var(--chrome-bg);
  color: var(--soft-white);
  z-index: 3;
  /* S19: 「右栏档案区从下方滑出」. The card is already docked to the right edge, so the half the
     deck still asks for is the arrival — it comes up from under where it lands rather than blinking
     in. One line of travel, because this card opens over a burning rod the player is watching. */
  animation: archive-rise 220ms var(--ease-out) both;
}

@keyframes archive-rise {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* The same arrival the pill's invitation defers to: a card that flies in at reduced motion is the
   one thing this screen would be asked to turn off. */
@media (prefers-reduced-motion: reduce) {
  .archive {
    animation: none;
  }
}

.head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.name {
  font-size: calc(15px * var(--text-scale));
  letter-spacing: 0.04em;
}

.zh {
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
}

.close {
  margin-inline-start: auto;
  width: 28px;
  min-width: 28px;
  min-height: 28px;
  font-size: calc(16px * var(--text-scale));
}

.cells {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 0;
}

.cells dt {
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
  letter-spacing: 0.08em;
}

.cells dd {
  margin: 2px 0 0;
  font-size: calc(15px * var(--text-scale));
  color: var(--ember-core);
}

/* The box's fields are sentences rather than measurements: one label per row, and the text wraps
   under it instead of squeezing into a third of the card. */
.fields {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 10px;
  margin: 0;
}

.fields dt {
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.fields dd {
  margin: 0;
  font-size: calc(15px * var(--text-scale));
  line-height: 1.45;
}

.digits {
  font-variant-numeric: tabular-nums;
}

.scenes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin: 0;
}

.scenes .label {
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
  letter-spacing: 0.08em;
}

.chip {
  padding: 2px 7px;
  border: 1px solid var(--chrome-line);
  border-radius: 999px;
  font-size: calc(15px * var(--text-scale));
}

/* Shared with .basis: a line that quotes where a figure came from is typeset like one whatever the
   source was — a published range or this game's own table. */
.range,
.basis {
  margin: 0;
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
  /* The ≈ figure is a quote of a published range, so it is typeset like one. */
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.pin {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--chrome-line);
  border-radius: 999px;
  background: transparent;
  color: var(--smoke-gray);
  font: inherit;
  font-size: calc(15px * var(--text-scale));
}

.pin[aria-pressed='true'] {
  color: var(--ember-core);
  border-color: color-mix(in oklab, var(--ember-orange) 55%, transparent);
}
</style>
