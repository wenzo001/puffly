<script setup lang="ts">
/**
 * S20's numbers, as one block: the day's count against the ceiling the player set, the last seven
 * days as bars, and the difference against the same span a week ago. That is the whole of it — the
 * block is compared to last week and to nothing else, and the three alternatives are one tap and a
 * count rather than instructions.
 *
 * It is a component because the phone puts it behind the break and the PC keeps it on screen at all
 * times (S10's 常驻数据栏), and a second copy of the delta line would be two facts to keep true.
 */
import { computed } from 'vue';
import type { Puffly } from '../composables/usePuffly';

const props = defineProps<{ game: Puffly }>();

const copy = computed(() => props.game.copy.value);
const summary = computed(() => props.game.summary.value);

const reduction = computed(() => props.game.reduction.value);
const limit = computed(() => props.game.settings.value.dailyLimitSticks);
const tallest = computed(() => Math.max(1, ...reduction.value.week.map((day) => day.sticks)));
/** With no words the comparison is still a direction and a number — the tier three fallback. */
const deltaLine = computed(() => {
  const delta = reduction.value.deltaSticks;
  if (delta === 0) return copy.value.t('reduction.deltaSame') ?? '—';
  const count = String(Math.abs(delta));
  if (delta > 0) {
    return copy.value.t('reduction.deltaMore', { count }) ?? `▲ ${count}`;
  }
  return copy.value.t('reduction.deltaFewer', { count }) ?? `▼ ${count}`;
});
/** Only ever shown when the ring has no cap to read against. */
const noLimitLine = computed(() =>
  limit.value === undefined ? copy.value.t('reduction.noLimit') : null,
);
/**
 * The bars are one image to a screen reader, so the text alternative has to carry all seven
 * counts rather than only saying that a week exists.
 */
const trendLabel = computed(() =>
  reduction.value.week
    .map((day) =>
      copy.value.say('a11y.reduction.bar', { day: day.dayKey, count: String(day.sticks) }),
    )
    .join(', '),
);
/**
 * The bars' caption: what they are, what they average to, and the unit they count — S20's
 * 「近 7 天 日均 14 支」 on one line. The average is the statistic's own (§26: derived once), so there
 * is no second division here that could round differently from the first.
 *
 * The words fall away on the icons tier and the digit does not: 日均 and 支 are words, `1.7` is not,
 * and the average is the one figure on this block a player can act on. So the caption is never
 * empty once a number exists to show, which is also why it stays a `.digits` span.
 */
const averageText = computed(() => {
  const count = String(reduction.value.dailyAverage);
  return copy.value.t('reduction.average', { count }) ?? count;
});
const trendCaption = computed(() => {
  const parts = [
    copy.value.t('reduction.week'),
    averageText.value,
    copy.value.t('reduction.sticks'),
  ];
  const said = parts.filter((part) => part !== null);
  return said.length === 0 ? null : said.join(' · ');
});
const ringArc = computed(() => {
  const cap = limit.value ?? Math.max(1, reduction.value.todaySticks);
  return (Math.min(1, reduction.value.todaySticks / cap) * 119.4).toFixed(2);
});
/**
 * S23's three 替代动作. They used to be a row of marks the player could look at and do nothing with;
 * now tapping one is the mechanic, and the only consequence is a count on that day (§ S23's 计次).
 * Nothing is rewarded and nothing is streaked, because the brief's redline under this page is that
 * it must not read as a lesson (§10) — the number is so the player can see the evening, not so the
 * game can grade it.
 */
const ALTERNATIVES = [
  { id: 'breathe', key: 'reduction.alt.breathe', glyph: '〜' },
  { id: 'water', key: 'reduction.alt.water', glyph: '◍' },
  { id: 'walk', key: 'reduction.alt.walk', glyph: '⌇' },
] as const;
/** Today's counts, keyed by the action rather than by position, so the rows cannot drift apart. */
const altCount = (id: string): number =>
  reduction.value.substitutes.find((row) => row.id === id)?.count ?? 0;
</script>

<template>
  <div class="reduction group" data-hook="reduction" :data-over="summary.overLimit">
    <span
      class="ring"
      role="img"
      :aria-label="
        limit === undefined
          ? copy.say('a11y.reduction.ringNoLimit', { count: String(reduction.todaySticks) })
          : copy.say('a11y.reduction.ring', {
              count: String(reduction.todaySticks),
              limit: String(limit),
            })
      "
    >
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle class="track" cx="22" cy="22" r="19" />
        <circle class="run" cx="22" cy="22" r="19" :stroke-dasharray="`${ringArc} 119.4`" />
      </svg>
      <b class="digits">
        {{ summary.overLimit ? '◇' : reduction.todaySticks
        }}<template v-if="limit !== undefined && !summary.overLimit"> / {{ limit }}</template>
      </b>
    </span>

    <span class="trend-wrap">
      <svg class="trend" viewBox="0 0 148 44" role="img" :aria-label="trendLabel">
        <rect
          v-for="(day, index) in reduction.week"
          :key="day.dayKey"
          :x="6 + index * 20"
          :y="40 - Math.max(2, (day.sticks / tallest) * 34)"
          width="13"
          :height="Math.max(2, (day.sticks / tallest) * 34)"
          :class="{ today: day.isToday }"
        />
      </svg>
      <span v-if="trendCaption !== null" class="cap digits">{{ trendCaption }}</span>
    </span>

    <p class="delta digits">{{ deltaLine }}</p>
    <p v-if="noLimitLine !== null" class="delta foot">{{ noLimitLine }}</p>

    <div class="alts">
      <button
        v-for="alt in ALTERNATIVES"
        :key="alt.id"
        class="alt"
        :data-alt="alt.id"
        :data-count="altCount(alt.id)"
        :aria-label="
          copy.say('a11y.alternative', {
            word: copy.say(alt.key),
            count: String(altCount(alt.id)),
          })
        "
        @click="game.takeSubstitute(alt.id)"
      >
        <i aria-hidden="true">{{ alt.glyph }}</i>
        <span v-if="copy.t(alt.key) !== null">{{ copy.t(alt.key) }}</span>
        <b class="digits" aria-hidden="true">{{ altCount(alt.id) }}</b>
      </button>
    </div>
    <p v-if="copy.t('reduction.footer') !== null" class="foot">
      {{ copy.t('reduction.footer') }}
    </p>
  </div>
</template>

<style scoped>
.reduction {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--chrome-line);
}

.ring {
  position: relative;
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  flex: none;
}

.ring svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring .track {
  fill: none;
  stroke: color-mix(in oklab, var(--soft-white) 14%, transparent);
  stroke-width: 2.4;
}

.ring .run {
  fill: none;
  stroke: var(--cool-blue);
  stroke-width: 2.4;
  stroke-linecap: round;
}

.ring b {
  position: relative;
  font-size: calc(15px * var(--text-scale));
  font-variant-numeric: tabular-nums;
}

.reduction[data-over='true'] .ring b,
.reduction[data-over='true'] .run {
  color: var(--smoke-gray);
  stroke: var(--smoke-gray);
}

.trend-wrap {
  display: flex;
  flex: 1;
  min-width: 120px;
  flex-direction: column;
  gap: 3px;
}

.trend {
  width: 100%;
  height: 44px;
}

.cap {
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
}

.trend rect {
  fill: color-mix(in oklab, var(--soft-white) 22%, transparent);
}

.trend rect.today {
  fill: var(--cool-blue);
}

.delta {
  margin: 0;
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
}

.alts {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.alt {
  display: flex;
  align-items: center;
  gap: 5px;
  /* It is a control now, so it takes a finger: the pill grows to the target floor rather than the
     mark it carries shrinking to fit the old label's height. */
  min-height: var(--tap-target);
  padding: 3px 12px;
  border: 1px solid var(--chrome-line);
  border-radius: 999px;
  background: none;
  color: var(--smoke-gray);
  font: inherit;
  font-size: calc(15px * var(--text-scale));
  text-align: start;
}

.alt .digits {
  color: var(--soft-white);
  font-variant-numeric: tabular-nums;
}

.alt:active {
  border-color: var(--ember-orange);
}

.foot {
  width: 100%;
  margin: 0;
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
  opacity: 0.8;
}
</style>
