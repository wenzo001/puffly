<script setup lang="ts">
/**
 * The break panel: the §32 craving control, the §36 visual trigger tags, and the §34 journey
 * as a line of stops. Everything is a face, an icon or a dot — there is nothing to read.
 *
 * What the player has already submitted *during this live break* is tracked here, because the
 * statistics layer only sees saved sessions (§70): the current break is still in the engine.
 */
import { computed, nextTick, ref, watch } from 'vue';
import type { Puffly } from '../composables/usePuffly';
import ReductionPanel from './ReductionPanel.vue';
import type { CopyKey } from '../i18n';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { nextRodGate } from '../shelf';
import { useJustLit } from '../reveal';
import { achievementsFor, reachedCount } from '@puffly/game-core';

const props = defineProps<{
  open: boolean;
  game: Puffly;
  /** `reduction` lands the player on the day's numbers instead of at the top of the sheet (S10). */
  section?: string | null;
}>();
const emit = defineEmits<{ close: [] }>();

const copy = computed(() => props.game.copy.value);

const TRIGGER_GLYPHS: readonly { tag: string; glyph: string; key: CopyKey }[] = [
  { tag: 'coffee', glyph: '☕', key: 'a11y.trigger.coffee' },
  { tag: 'drink', glyph: '🍺', key: 'a11y.trigger.drink' },
  { tag: 'work', glyph: '💼', key: 'a11y.trigger.work' },
  { tag: 'angry', glyph: '😤', key: 'a11y.trigger.angry' },
  { tag: 'night', glyph: '🌙', key: 'a11y.trigger.night' },
  { tag: 'people', glyph: '🧑‍🤝‍🧑', key: 'a11y.trigger.people' },
  { tag: 'drive', glyph: '🚗', key: 'a11y.trigger.drive' },
  { tag: 'meal', glyph: '🍽️', key: 'a11y.trigger.meal' },
];

const summary = computed(() => props.game.summary.value);
const stats = computed(() => props.game.stats.value);
const today = computed(() => props.game.today.value);
const journey = computed(() => props.game.journey.value);

type Submitted = 'none' | 'before' | 'both';
const submitted = ref<Submitted>('none');

/**
 * One slider, three faces (§32). The first drag means "before", the second means "after". The
 * player never picks which one they are recording, so there is no sentence to explain it.
 */
const cravingPhase = computed<'before' | 'after'>(() =>
  submitted.value === 'none' ? 'before' : 'after',
);
const filled = computed(() => submitted.value === 'both');

function setCraving(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  props.game.setCraving(value, cravingPhase.value);
  submitted.value = submitted.value === 'none' ? 'before' : 'both';
}

const savedTags = computed(() => new Set(props.game.triggers.value.map((entry) => entry.tag)));
const tappedTags = ref<Set<string>>(new Set());

function toggleTrigger(tag: string): void {
  props.game.addTrigger(tag);
  tappedTags.value = new Set([...tappedTags.value, tag]);
}

function isTagged(tag: string): boolean {
  return tappedTags.value.has(tag) || savedTags.value.has(tag);
}

/** §34 asks for a trajectory, not a table: the last stretch of stops, newest at the right. */
const stops = computed(() => journey.value.slice(-24));
const lastStop = computed(() => stops.value[stops.value.length - 1]);

/**
 * S13's four local dimensions, plus the one line S11 puts on the desk: 累计 42 支 · 下一支解锁 75 支.
 * `at` is the ladder's own threshold — the same number the cabinet's ladder line reads, so the two
 * screens cannot disagree about what the next rod costs.
 */
const sticksKept = computed(() => props.game.summary.value.state?.progress.sessionCount ?? 0);
const nextRod = computed(() => nextRodGate(DEFAULT_CONTENT.cigarettes, sticksKept.value));
/** Minutes, rounded: a lifetime of seconds is not a number anybody can read at a glance. */
const hoursSmoked = computed(() => Math.round(stats.value.totalDurationMs / 60000));

/**
 * The achievement ladder (2026-10-08 拍板 ⑤): four axes the log already counts — 支 / 口 / 克 /
 * 分钟 — and the three rare moments read off the hardest gust it recorded. Nothing here is stored a
 * second time: the rungs are derived from the same ledger the rows above print, so the two can never
 * disagree about what happened.
 */
const rungs = computed(() =>
  achievementsFor(
    {
      sticks: sticksKept.value,
      puffs: stats.value.totalPuffs,
      ashGrams: summary.value.state?.progress.ashGrams ?? 0,
      minutes: hoursSmoked.value,
    },
    stats.value.strongestGust,
  ),
);

/**
 * The same four figures again, as one lookup, so the row can say how far into its rung the player is.
 *
 * Deliberately a second *read* and not a second source: `achievementsFor` is handed this object one
 * line above, so a figure that disagreed with the ladder would be a figure this function already
 * gave it. Writing `13` next to `0/5` is what the block used to do, and it left the player unable to
 * tell a rung they are one puff short of from one they have not begun.
 */
function currentFor(axis: 'sticks' | 'puffs' | 'ash' | 'time'): number {
  switch (axis) {
    case 'sticks':
      return sticksKept.value;
    case 'puffs':
      return stats.value.totalPuffs;
    case 'ash':
      return summary.value.state?.progress.ashGrams ?? 0;
    case 'time':
      return hoursSmoked.value;
  }
}

// §39 asks the moment to say so by itself — 它自己亮一下, no dialog and no sentence — and the 图鉴
// already does it with `collection.fresh`. That channel cannot be reused here: it is a field of the
// persisted state, and giving the ladder its own "previously lit" field would be exactly the second
// account §70 forbids. So the reveal reads a display-only cache (`reveal.ts`): nothing persisted,
// nothing a read-out can quote, emptied when the sheet closes.
const reachedIds = computed(() =>
  rungs.value.filter((rung) => rung.reached).map((rung) => rung.achievement.id),
);
const fresh = useJustLit(
  () => reachedIds.value,
  () => props.open,
);

// One name per subject, and the ledger's rows above already say three of them: the ladder reuses
// those keys rather than inventing parallel words, so the two cannot disagree about what 累计支数
// means on the same screen. The ash axis is the odd one out — the row above counts 磕灰 (flicks),
// this one counts grams — so it gets its own key, and neither number borrows the other's name.
//
// `unit` is the eighth of §H.8's 度量单位预算: four axis words, 风力, 完成度, and the two the moment
// rows wear. Each is a *unit name*, never a sentence — the template decides the order, so
// `13 支` follows the numeral that way in every language (copy-tiers.test.ts is what counts them).
const AXES: ReadonlyArray<{
  axis: 'sticks' | 'puffs' | 'ash' | 'time';
  key: CopyKey;
  unit: CopyKey;
}> = [
  { axis: 'sticks', key: 'stats.sticks', unit: 'ach.unit.sticks' },
  { axis: 'puffs', key: 'stats.draws', unit: 'ach.unit.puffs' },
  { axis: 'ash', key: 'ach.axis.ash', unit: 'ach.unit.grams' },
  { axis: 'time', key: 'stats.time', unit: 'ach.unit.minutes' },
];
const ladder = computed(() =>
  AXES.map((row) => {
    const mine = rungs.value.filter((rung) => rung.achievement.axis === row.axis);
    const next = mine.find((rung) => !rung.reached) ?? mine[mine.length - 1];
    const reached = mine.filter((rung) => rung.reached).length;
    // The rung the player is standing in: the next one they have not met, against its own goal.
    // That is the whole figure — 2/13 支 is two of the thirteen this step costs, so a player one
    // puff short of a rung sees a different row from a player at zero.
    const at = currentFor(row.axis);
    const ratio = next?.ratio ?? 1;
    return {
      axis: row.axis,
      key: row.key,
      unit: row.unit,
      reached,
      total: mine.length,
      value: Math.min(at, next?.achievement.goal ?? at),
      goal: next?.achievement.goal ?? 0,
      /** 0..1 through the rung in hand. The one channel that survives the icons tier: no words. */
      ratio,
      percent: Math.round(ratio * 100),
      // The row is a whole axis, so it lights when any rung on it lights — and the figures it prints
      // (met/goal) are the thing that just changed, which is why the row has no per-rung id to hang
      // the flag on.
      fresh: mine.some((rung) => fresh.value.has(rung.achievement.id)),
    };
  }),
);
// The three rare moments by name (拍板 ⑥). Keys are written out rather than built from the id, so
// the copy table stays the compiler's check: an achievement without a name is a type error, not a
// row that renders blank.
const MOMENT_KEYS: ReadonlyArray<{ id: string; key: CopyKey }> = [
  { id: 'moment.gust', key: 'ach.moment.gust' },
  { id: 'moment.squall', key: 'ach.moment.squall' },
  { id: 'moment.freak', key: 'ach.moment.freak' },
];
// Two things were wrong with filtering the moments by their own name (`row.name !== null`): a
// moment is not only a name — it has the gust figure and two states, and those survive the icons
// tier — and the filter made the row count depend on the language. The moment *names* still drop out
// in ∅ by themselves, one `t()` at a time.
const momentRows = computed(() =>
  MOMENT_KEYS.map((row) => {
    const rung = rungs.value.find((entry) => entry.achievement.id === row.id);
    return {
      ...row,
      name: copy.value.t(row.key),
      minGust: rung?.achievement.minGust ?? 0,
      reached: rung?.reached ?? false,
      ratio: rung?.ratio ?? 0,
      fresh: fresh.value.has(row.id),
    };
  }),
);
const achieved = computed(() => reachedCount(rungs.value));

const SECTION_HOOKS: Readonly<Record<string, string>> = { reduction: 'reduction', stats: 'stats' };
const root = ref<HTMLElement | null>(null);

// One writer, and it scrolls the sheet rather than the world. Two watchers used to race (land on
// the section / reset to the top) and the reset won, and `scrollIntoView` walked up into the stage —
// which is a scroll container because the closed sheets hang below its edge — pushing the scene out
// of view for good. See `CollectionSheet.vue` for the same fix and the measured numbers.
watch(
  () => [props.open, props.section] as const,
  ([open, section]) => {
    if (!open) return;
    void nextTick(() => {
      const sheet = root.value;
      if (!sheet) return;
      const hook = section ? (SECTION_HOOKS[section] ?? null) : null;
      const wanted = hook === null ? null : sheet.querySelector(`[data-hook="${hook}"]`);
      if (!wanted) {
        sheet.scrollTo({ top: 0 });
        return;
      }
      const top = wanted.getBoundingClientRect().top - sheet.getBoundingClientRect().top;
      sheet.scrollTo({ top: Math.max(0, sheet.scrollTop + top), behavior: 'smooth' });
    });
  },
);
</script>

<template>
  <section
    ref="root"
    class="sheet"
    data-sheet="break"
    :data-open="open"
    :aria-label="copy.say('a11y.sheetBreak')"
  >
    <header class="row">
      <!-- The break's own clock lives in here now: the stage shows no numbers, and the time a
           player has spent is still worth seeing when they go looking for it (§31). -->
      <span class="count big" :class="{ reached: summary.targetReached }">{{ summary.clock }}</span>
      <span class="count">{{ today?.puffs ?? summary.puffs }}</span>
      <span class="count">☀ {{ today?.daylightHours ?? 0 }}h</span>
      <span class="count">🌙 {{ today?.nightHours ?? 0 }}h</span>
      <span class="count">🔥 {{ summary.puffs }}</span>
      <span class="count">🌫️ {{ today?.smokeEvents ?? 0 }}</span>
      <button class="icon-button close" :aria-label="copy.say('a11y.close')" @click="emit('close')">
        ×
      </button>
    </header>

    <div class="mood group">
      <span class="face" :class="{ lit: cravingPhase === 'before' }" aria-hidden="true">😌</span>
      <input
        class="slider"
        type="range"
        min="0"
        max="10"
        step="1"
        :aria-label="
          copy.say(cravingPhase === 'before' ? 'a11y.cravingBefore' : 'a11y.cravingAfter')
        "
        @change="setCraving"
      />
      <span class="face" :class="{ lit: cravingPhase === 'after' }" aria-hidden="true">😣</span>
      <span v-if="filled" class="dot" aria-hidden="true">✦</span>
    </div>

    <div class="tags group">
      <button
        v-for="item in TRIGGER_GLYPHS"
        :key="item.tag"
        class="icon-button tag"
        :aria-label="copy.say(item.key)"
        :aria-pressed="isTagged(item.tag)"
        @click="toggleTrigger(item.tag)"
      >
        {{ item.glyph }}
      </button>
    </div>

    <svg
      class="journey group"
      viewBox="0 0 320 44"
      :aria-label="copy.say('a11y.journey')"
      role="img"
    >
      <line
        x1="10"
        y1="24"
        x2="310"
        y2="24"
        stroke="currentColor"
        stroke-opacity="0.22"
        stroke-width="1"
      />
      <template v-for="(stop, index) in stops" :key="stop.dayKey">
        <circle
          :cx="stops.length === 1 ? 160 : 10 + (index * 300) / (stops.length - 1)"
          cy="24"
          :r="stop.isMilestone ? 6 : 3.5"
          :fill="stop.isMilestone ? 'var(--ember-orange)' : 'var(--smoke-gray)'"
          :fill-opacity="stop.isMilestone ? 0.95 : 0.66"
        />
        <text
          v-if="stop.isMilestone"
          :x="stops.length === 1 ? 160 : 10 + (index * 300) / (stops.length - 1)"
          y="10"
          text-anchor="middle"
          font-size="9"
          fill="var(--ember-core)"
          aria-hidden="true"
        >
          ✦
        </text>
      </template>
    </svg>

    <!-- S13's dimensions — the deck's own list, 全部本地累计: the four numbers and the ladder line
         S11 puts on the desk. Nothing here is estimated, so nothing here carries a ≈; and the
         "next rod" figure is the threshold itself rather than a countdown, because that is the
         number the cabinet's ladder already prints, and two screens may not cost a rod differently. -->
    <div class="stats group" data-hook="stats" role="group" :aria-label="copy.say('rail.stats')">
      <p class="line">
        <span v-if="copy.t('stats.sticks') !== null" class="name">{{
          copy.t('stats.sticks')
        }}</span>
        <span class="count digits">{{ sticksKept }}</span>
      </p>
      <p class="line">
        <span v-if="copy.t('stats.streak') !== null" class="name">{{
          copy.t('stats.streak')
        }}</span>
        <span class="count digits">{{ stats.currentStreakDays }}</span>
      </p>
      <p class="line">
        <span v-if="copy.t('stats.time') !== null" class="name">{{ copy.t('stats.time') }}</span>
        <span class="count digits">{{ hoursSmoked }}</span>
      </p>
      <p class="line">
        <span v-if="copy.t('stats.draws') !== null" class="name">{{ copy.t('stats.draws') }}</span>
        <span class="count digits">{{ stats.totalPuffs }}</span>
      </p>
      <p class="line">
        <span v-if="copy.t('stats.ash') !== null" class="name">{{ copy.t('stats.ash') }}</span>
        <span class="count digits">{{ summary.ashDropped }}</span>
      </p>
      <p v-if="nextRod !== null" class="line">
        <span v-if="copy.t('stats.next') !== null" class="name">{{ copy.t('stats.next') }}</span>
        <span class="count digits">{{ nextRod.at }}</span>
      </p>
    </div>

    <!-- 成就 (拍板 ⑤): the same four local numbers, read as a ladder. Every figure is the core's own
         — `achievementsFor`'s rung ratio and its goal are the whole arithmetic — and each one is
         followed by its unit word (`ach.unit.*`). The unit vanishes in the icons tier, exactly like
         every other label, which is why the channel that tells a met rung from a locked one is not a
         word: see `.track` below. -->
    <div
      class="stats group"
      data-hook="achievements"
      role="group"
      :aria-label="copy.say('ach.title')"
    >
      <p class="line">
        <span v-if="copy.t('ach.title') !== null" class="name">{{ copy.t('ach.title') }}</span>
        <span class="count digits">
          <span class="cell"
            ><span class="digits">{{ achieved }}</span> /
            <span class="digits">{{ rungs.length }}</span></span
          >
        </span>
      </p>
      <!-- One row per axis: the rung in hand as `at / goal` with its unit, the rungs already met out
           of five, and the bar that says the same thing without a word. A full axis (5/5) prints no
           goal — there is nothing left to count towards — and its bar is the met state. -->
      <p
        v-for="row in ladder"
        :key="row.axis"
        class="line"
        :data-met="row.ratio >= 1 || row.reached >= row.total"
        :data-fresh="row.fresh"
      >
        <span class="track" aria-hidden="true"
          ><i :style="{ transform: `scaleX(${row.ratio})` }"></i
        ></span>
        <span v-if="copy.t(row.key) !== null" class="name">{{ copy.t(row.key) }}</span>
        <span class="count digits">
          <span class="cell"
            ><span class="digits">{{ row.value }}</span>
            <span v-if="copy.t(row.unit) !== null" class="unit">{{ copy.t(row.unit) }}</span></span
          ><span class="cell"
            ><span class="digits">{{ row.reached }}</span
            >/{{ row.total }}</span
          >
        </span>
      </p>
      <!-- A moment is not only a name: it has the reading it is met at and two states, so the row is
           drawn in every tier and only the name disappears. The goal comes from `minGust` on the rung
           itself, so the three thresholds cannot drift from core's own. -->
      <p class="line">
        <span v-if="copy.t('ach.gust') !== null" class="name">{{ copy.t('ach.gust') }}</span>
        <span class="count digits">
          <span class="digits">{{ stats.strongestGust }}</span>
          <span v-if="copy.t('ach.unit.strength') !== null" class="unit">{{
            copy.t('ach.unit.strength')
          }}</span>
        </span>
      </p>
      <p
        v-for="row in momentRows"
        :key="row.id"
        class="line moment"
        :data-reached="row.reached"
        :data-fresh="row.fresh"
      >
        <span class="track" aria-hidden="true"
          ><i :style="{ transform: `scaleX(${row.ratio})` }"></i
        ></span>
        <span v-if="row.name !== null" class="name">{{ row.name }}</span>
        <span class="count digits">
          <span class="cell"
            ><span class="digits">{{ row.minGust }}</span>
            <span v-if="copy.t('ach.unit.strength') !== null" class="unit">{{
              copy.t('ach.unit.strength')
            }}</span></span
          ><span
            v-if="copy.t(row.reached ? 'ach.unit.caught' : 'ach.unit.locked') !== null"
            class="unit"
            >{{ copy.t(row.reached ? 'ach.unit.caught' : 'ach.unit.locked') }}</span
          >
        </span>
      </p>
    </div>

    <ReductionPanel :game="game" />
    <div class="row numbers">
      <span class="count">✧ {{ stats.smokeFreeDays }}</span>
      <span class="count">▲ {{ stats.longestStreakDays }}</span>
      <span v-if="lastStop?.isMilestone" class="mark" aria-hidden="true">◆</span>
      <button class="icon-button" :aria-label="copy.say('a11y.endBreak')" @click="game.endBreak()">
        ◌
      </button>
    </div>
  </section>
</template>

<style scoped>
/* The break's own clock, which used to sit on the stage: amber once the target is reached. */
.count.reached {
  color: var(--ember-core);
}

.row {
  display: flex;
  align-items: center;
  gap: calc(12px * var(--text-scale));
  flex-wrap: wrap;
}

.count {
  font-variant-numeric: tabular-nums;
  opacity: 0.78;
  font-size: 0.95rem;
}

.big {
  font-size: 2rem;
  opacity: 0.95;
  margin-right: 6px;
}

.close {
  margin-inline-start: auto;
}

.mood {
  margin-top: 18px;
}

.face {
  opacity: 0.45;
  transition:
    opacity 260ms var(--ease-out),
    transform 260ms var(--ease-out);
}

.face.lit {
  opacity: 1;
  transform: scale(1.12);
}

.slider {
  flex: 1;
}

.dot {
  color: var(--ember-core);
}

.tags {
  justify-content: flex-start;
  display: flex;
  flex-wrap: wrap;
}

.tag {
  font-size: 1.2rem;
  opacity: 0.6;
}

.tag[aria-pressed='true'] {
  opacity: 1;
}

.journey {
  height: 44px;
  color: var(--smoke-gray);
}

.numbers {
  margin-top: 10px;
}

/* The reduction page: cool for today, amber only for the ceiling, and no colour that praises. */
.mark {
  color: var(--ember-orange);
}

/* S13's dimensions: one label and one digit per row. A grid rather than a sentence, because under
   the icons tier the labels are gone and the digits have to stand alone in the same order. */
.stats {
  display: grid;
  gap: 3px;
  margin-top: 12px;
  padding-block-start: 10px;
  border-block-start: 1px solid var(--chrome-line);
}

.stats .line {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: 10px;
  margin: 0;
}

.stats .name {
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
  letter-spacing: 0.06em;
}

.digits {
  font-variant-numeric: tabular-nums;
}

/* The ladder's two states, both read from an attribute rather than invented per row. A rung the
   player has not met goes to the declared 次级色 `--ash-gray` (4.89 on the sheet floor, judged by
   `text-contrast.test.ts`) — not to an opacity: `--smoke-gray` at 0.3 measures 1.98:1, which is the
   same trick the 图鉴 used to pull on its room names and their 差几支 digits. */
.line.moment:not([data-reached='true']) .name {
  color: var(--ash-gray);
}

/* ------------------------------------------------------------------ the rung's progress channel

   The one thing on this block that survives the tier with no words at all. Colour, fill, a mark and
   motion all end up as something a player has to learn; a bar the length of the player's own
   progress needs no legend in any language, and it is the same measurement §39's 力度对照图 already
   puts under the pill. So every rung carries one, and the two states are drawn rather than named:

     · met      — a full bar, filled in --ember-core, the same amber `.count.reached` above uses;
     · locked   — a bar as long as the player's way into that rung, on a track they can see.

   It is aria-hidden and carries no figure of its own: the width is the core's `ratio` and the digits
   beside it are the core's own `at / goal`, so a screen reader hears one answer, not two. */
.track {
  display: block;
  height: 3px;
  border-radius: 2px;
  overflow: hidden;
  background: color-mix(in oklab, var(--warm-gray) 32%, transparent);
}

.track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ember-core);
  /* `scaleX` and not `width`: a percentage width would be one more number to keep in step with the
     ratio, and the transform is the ratio itself. `transform-origin` is written out because the
     sheets mirror under a right-to-left language (logical properties elsewhere in this file) while
     a transform does not follow the writing direction on its own — the fill grows from the reading
     edge in every language. */
  transform-origin: left center;
  transition: transform 420ms var(--ease-out);
}

:global(html[dir='rtl']) .track i {
  transform-origin: right center;
}

/* The axis rows became two columns of two cells each, so a 393px sheet has room for the bar without
   pushing the digits onto a second line. `auto auto` and not `repeat(2, auto)`: the first cell is
   the rung in hand and the second is the rungs met, and the pair sits at the far edge as one unit. */
.line:has(.track) {
  grid-template-columns: 1fr auto 1fr;
}

/* The value that sits under the bar, and the met count, hold one reading each rather than drifting
   apart at the sheet's own width. This is also what keeps the `.count` contract: the block's
   scanner reads the digits out of this element. */
.cell {
  display: inline-block;
  min-width: 52px;
  text-align: end;
}

/* The unit word after a figure (`ach.unit.*`, §H.8's 度量单位预算). Words, so the icons tier drops
   them and 13 / 0/5 stand in the same order the four rows always used; a step under the reading
   floor only while a translation is present, because a unit that is on the glass is text. */
.unit {
  color: var(--smoke-gray);
  font-size: 0.85em;
}

/* A met rung's digits go amber — the same one-line statement the break's own clock makes — and the
   bar above them is full. Nothing here praises and nothing here locks: it says what happened.
   Two selectors and not one: the axis rows have *progress* (`data-met`, and a bar that is full) while
   a moment row is only ever caught or not (`data-reached`, and a bar that is 0 or 1). Giving a row
   the attribute its reader actually means is what keeps a marker from being written with no reader
   — the hole `stats-block.test.ts` was written after. */
.line[data-met='true'] .count,
.line[data-reached='true'] .count {
  color: var(--ember-core);
}

/* And the row that just lit plays once, by itself (§39: no dialog, no sentence). The flag only ever
   comes from a rung that changed while this sheet was already looking, so the fade needs no saved
   "what was lit before" record — nothing here is a second account of anything. */
.line[data-fresh='true'] {
  animation: rung-lit 1400ms var(--ease-out);
}

@keyframes rung-lit {
  0% {
    opacity: 0;
    transform: translateY(6px);
  }

  35% {
    opacity: 1;
    transform: translateY(0);
  }
}

/* §39's 「它自己亮一下」 is not only a fade: the rung's own bar sweeps out from the reading edge
   when it is crossed, once, by itself. The transition above covers the ordinary case (the ledger
   moved 40% while nobody was looking at the ladder); this is the crossing itself. Gated with the
   fade, because §39 is a flourish and not information — everything the bar says is still on the
   screen in the digits beside it and in the width it settles at. */
.line[data-fresh='true'] .track i {
  animation: rung-fill 1400ms var(--ease-out);
}

@keyframes rung-fill {
  0% {
    transform: scaleX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .line[data-fresh='true'] {
    animation: none;
  }

  .line[data-fresh='true'] .track i {
    animation: none;
  }

  .track i {
    transition: none;
  }
}
</style>
