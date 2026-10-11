<script setup lang="ts">
/**
 * Settings — §44, §64, §65.
 *
 * Every row is a word and a control. It used to be a row of glyphs with the words hidden in
 * `aria-label`, which was honest about the product being wordless and unhelpful to a person
 * holding a phone: nine marks, no idea what any of them did. The scene still owns the game —
 * this sheet is not required to play it, and nothing here is a sentence.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { hexToRgb, rgbToHex, type Rgb } from '@puffly/shared';
import type { ScenePalette } from '@puffly/game-core';
import type { QualityMode } from '@puffly/game-core';
import type { Puffly } from '../composables/usePuffly';
import { coverageOf, LANGUAGES, type CopyKey } from '../i18n';
import { hapticBars } from '../haptics';

const props = defineProps<{ open: boolean; game: Puffly }>();
const emit = defineEmits<{ close: [] }>();

const settings = computed(() => props.game.settings.value);

/**
 * S6's 震动波形: the bars this row draws, one per rung of the player's own 触觉 level. The icon is the
 * carrier a wordless tier can still read, so it is never gated on a word (§9.2, and 稿子 S6 那句
 * 「滑块两侧只用图标……档位靠刻度点数量表达」).
 */
const vibrationBars = computed(() => hapticBars(settings.value.haptics));

/**
 * The four layers of the player's own room. Seeded from the place they are standing in the moment
 * they take it over, so the first thing the picker shows is the room they chose rather than four
 * black squares, and the change they make is a nudge away from something they already liked.
 */
const SCENE_LAYERS = ['skyTop', 'skyBottom', 'horizon', 'silhouette'] as const;
type SceneLayer = (typeof SCENE_LAYERS)[number];

const sceneOf = (layer: SceneLayer): Rgb => {
  const custom = settings.value.customBackground;
  if (custom) return custom[layer];
  // The sheet can be open before the first frame has been drawn, and a picker with nothing to
  // copy still has to show four usable squares rather than four black ones.
  const FALLBACK: Record<SceneLayer, Rgb> = {
    skyTop: [34, 33, 36],
    skyBottom: [52, 48, 44],
    horizon: [66, 60, 56],
    silhouette: [24, 23, 25],
  };
  return props.game.sceneColours()?.[layer] ?? FALLBACK[layer];
};

/** Taking the room over starts from the room, so the first edit is a nudge and not a blank. */
const emptyScene = (): ScenePalette => ({
  skyTop: sceneOf('skyTop'),
  skyBottom: sceneOf('skyBottom'),
  horizon: sceneOf('horizon'),
  silhouette: sceneOf('silhouette'),
});

const setLayer = (layer: SceneLayer, hex: string): void => {
  const next: ScenePalette = {
    skyTop: sceneOf('skyTop'),
    skyBottom: sceneOf('skyBottom'),
    horizon: sceneOf('horizon'),
    silhouette: sceneOf('silhouette'),
  };
  next[layer] = hexToRgb(hex);
  props.game.setSettings({ customBackground: next });
};
/** One resolved table for the whole sheet, so a row can never show a different language. */
const copy = computed(() => props.game.copy.value);
const fileInput = ref<HTMLInputElement | null>(null);
const importState = ref<'idle' | 'ok' | 'bad'>('idle');
const root = ref<HTMLElement | null>(null);

/** A row's word, or nothing at all on the icons tier (§9's third tier). */
const word = (key: CopyKey): string | null => copy.value.t(key);

function mark(state: 'idle' | 'ok' | 'bad'): void {
  importState.value = state;
  window.setTimeout(() => {
    importState.value = 'idle';
  }, 2400);
}

async function download(): Promise<void> {
  const json = await props.game.exportJson();
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'puffly.json';
  link.click();
  URL.revokeObjectURL(url);
}

async function readFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const text = await file.text();
  const result = await props.game.importJson(text);
  mark(result.ok ? 'ok' : 'bad');
  input.value = '';
}

/**
 * Erasing every record is the one thing here that cannot be undone, so it asks for the same tap
 * twice instead of putting up a dialog (§64: no modal, no technical wording). Six seconds, or
 * closing the sheet, and the button forgets that it was ever armed.
 */
const armed = ref(false);

async function eraseAll(): Promise<void> {
  if (!armed.value) {
    armed.value = true;
    window.setTimeout(() => {
      armed.value = false;
    }, 6000);
    return;
  }
  armed.value = false;
  await props.game.resetData();
}

/**
 * Three steps rather than a dial (§14 of the mobile brief): enough, a little, none. The ambient
 * bed keeps its own slider because wind and a room are the two sounds a player may want apart.
 */
const SOUND_STEPS: readonly { glyph: string; key: CopyKey; volume: number; muted: boolean }[] = [
  { glyph: '🔊', key: 'settings.sound.enough', volume: 0.7, muted: false },
  { glyph: '🔉', key: 'settings.sound.little', volume: 0.25, muted: false },
  { glyph: '🔇', key: 'settings.sound.none', volume: 0.7, muted: true },
];

const soundStep = computed(() => (settings.value.muted ? 2 : settings.value.volume > 0.45 ? 0 : 1));
/** The current step's own mark and word, resolved here so the template never indexes at all. */
const soundGlyph = computed(() => SOUND_STEPS[soundStep.value]?.glyph ?? '');
const soundWord = computed(() => {
  const key = SOUND_STEPS[soundStep.value]?.key;
  return key === undefined ? null : copy.value.t(key);
});

function cycleSound(): void {
  const next = SOUND_STEPS[(soundStep.value + 1) % SOUND_STEPS.length];
  if (next) props.game.setSettings({ volume: next.volume, muted: next.muted });
}

/** The particle budget, named for what it changes on the screen instead of how it works. */
const SMOKE_STEPS: readonly { mode: QualityMode; glyph: string; key: CopyKey }[] = [
  { mode: 'light', glyph: '·', key: 'settings.smoke.soft' },
  { mode: 'balanced', glyph: '••', key: 'settings.smoke.normal' },
  { mode: 'high', glyph: '✦', key: 'settings.smoke.dense' },
];

const AUTO: { mode: QualityMode; glyph: string; key: CopyKey } = {
  mode: 'auto',
  glyph: '◌',
  key: 'settings.smoke.auto',
};

/** `auto` is what an absent preference means, so the chip lights up for the unset case too. */
const languageCode = computed(() => settings.value.language ?? 'auto');

function setLanguage(code: string): void {
  props.game.setSettings({ language: code === 'auto' ? undefined : code });
}

function minutesToMs(minutes: number): number {
  return Math.round(minutes * 60_000);
}

/**
 * S14's 「单口时长」 — the third custom dial the deck names. `—` means the rod decides: every one of
 * them was authored around its own row of S9's 单口吸入 column, and that column is one of the few
 * ways six cigarettes differ, so there is no default number here on purpose. Tapping the dial takes
 * the deck's own machine figure (2.0 s, the ISO 3308 draw its table is headed with), and the track
 * then carries it across the deck's 1.0 – 4.0 s 吸入 window.
 */
const puffOwn = computed(() => settings.value.puffDurationSec === undefined);
/** The seconds the row shows, or the mark that says the rod's own window is in force. */
const puffSeconds = computed(() =>
  puffOwn.value ? '—' : String(settings.value.puffDurationSec?.toFixed(1)),
);
function togglePuff(): void {
  props.game.setSettings({ puffDurationSec: puffOwn.value ? 2 : undefined });
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      armed.value = false;
      return;
    }
    void nextTick(() => root.value?.scrollTo({ top: 0 }));
  },
);
</script>

<template>
  <section
    ref="root"
    class="sheet"
    data-sheet="settings"
    :data-open="open"
    :aria-label="copy.say('a11y.sheetSettings')"
  >
    <header class="head">
      <span class="mark" aria-hidden="true">⚙</span>
      <span
        v-if="!game.audioAvailable.value"
        class="warn"
        :aria-label="copy.say('a11y.audioUnavailable')"
        >🔇</span
      >
      <span v-if="game.storageDegraded.value" class="warn" :aria-label="copy.say('a11y.memoryOnly')"
        >◍</span
      >
      <button class="icon-button close" :aria-label="copy.say('a11y.close')" @click="emit('close')">
        ×
      </button>
    </header>

    <div class="row">
      <span v-if="word('settings.sound') !== null" class="label">{{ word('settings.sound') }}</span>
      <button
        class="choice"
        data-setting="sound"
        :aria-label="copy.say('a11y.soundLevel')"
        @click="cycleSound"
      >
        <span class="glyph" aria-hidden="true">{{ soundGlyph }}</span>
        <span v-if="word('settings.sound') !== null" class="sub">{{ soundWord }}</span>
      </button>
      <input
        v-if="!settings.muted"
        class="grow"
        type="range"
        min="0"
        max="100"
        :value="Math.round(settings.ambientVolume * 100)"
        :aria-label="copy.say('a11y.ambient')"
        @input="
          game.setSettings({
            ambientVolume: Number(($event.target as HTMLInputElement).value) / 100,
          })
        "
      />
    </div>

    <!-- S6's 「混响 关」 row: the only sound control that is not a level, because a room is either
         heard or it is not. Off is the deck's default, and the glyph is the radiating arcs a mixer
         draws for a send. -->
    <div class="row">
      <span v-if="word('settings.tail') !== null" class="label">{{ word('settings.tail') }}</span>
      <button
        class="icon-button"
        data-setting="tail"
        :aria-pressed="settings.reverb"
        :aria-label="copy.say('a11y.reverbTail')"
        @click="game.setSettings({ reverb: !settings.reverb })"
      >
        )))
      </button>
    </div>

    <!-- S6's 写实度 row. The deck writes the axis as 写实 80% / 卡通 with a digit beside it, and this
         is the same shape its neighbour 触觉 already uses: a word, a stepped track, a number. The
         detents are the 档位 — S15's own note asks for levels read off tick marks rather than more
         words — and step 20 puts one exactly on the deck's 80/20. It is a look and nothing else:
         moving it cannot change how long the rod burns, how many puffs it has, or how much ash it
         makes (the Frozen Core rule, the same one a skin lives under), and realism-purity.test.ts runs
         a break at both ends of the track and compares the whole simulation to prove it. -->
    <div class="row" data-setting="realism">
      <span v-if="word('settings.realism') !== null" class="label">{{
        word('settings.realism')
      }}</span>
      <input
        class="grow"
        type="range"
        min="0"
        max="100"
        step="20"
        :value="Math.round(settings.realism * 100)"
        :aria-label="copy.say('a11y.realism')"
        @input="
          game.setSettings({
            realism: Number(($event.target as HTMLInputElement).value) / 100,
          })
        "
      />
      <span class="digits">{{ Math.round(settings.realism * 100) }}</span>
    </div>

    <div class="row">
      <span v-if="word('settings.smoke') !== null" class="label">{{ word('settings.smoke') }}</span>
      <button
        v-for="option in [AUTO, ...SMOKE_STEPS]"
        :key="option.mode"
        class="choice"
        :aria-pressed="settings.quality === option.mode"
        :aria-label="copy.say('a11y.smokeOption', { word: copy.say(option.key) })"
        @click="game.setSettings({ quality: option.mode })"
      >
        <span class="glyph" aria-hidden="true">{{ option.glyph }}</span>
        <span v-if="word('settings.smoke') !== null" class="sub">{{ word(option.key) }}</span>
      </button>
    </div>

    <div class="row">
      <span v-if="word('settings.break') !== null" class="label">{{ word('settings.break') }}</span>
      <input
        class="grow"
        type="range"
        data-setting="break"
        min="1"
        max="30"
        step="1"
        :value="settings.sessionTargetMs / 60000"
        :aria-label="copy.say('a11y.breakLength')"
        @input="
          game.setSettings({
            sessionTargetMs: minutesToMs(Number(($event.target as HTMLInputElement).value)),
          })
        "
      />
      <span class="digits">{{ Math.round(settings.sessionTargetMs / 60000) }}</span>
    </div>

    <!-- S14's 三个自定义档, third one: the dial on the left is the choice itself (the rod's own, or
         the deck's 2.0 s), and the track only appears once a number has been picked — the same way
         the ambient bed appears only once the mix is not muted. -->
    <div class="row">
      <span v-if="word('settings.puff') !== null" class="label">{{ word('settings.puff') }}</span>
      <button
        class="choice"
        data-setting="puff"
        :aria-pressed="puffOwn"
        :aria-label="copy.say('a11y.puffOwn')"
        @click="togglePuff"
      >
        <span class="glyph digits" aria-hidden="true">{{ puffSeconds }}</span>
        <span v-if="puffOwn && word('settings.smoke.auto') !== null" class="sub">
          {{ word('settings.smoke.auto') }}
        </span>
      </button>
      <input
        v-if="!puffOwn"
        class="grow"
        type="range"
        data-setting="puff-track"
        min="1"
        max="4"
        step="0.5"
        :value="settings.puffDurationSec"
        :aria-label="copy.say('a11y.puffLength')"
        @input="
          game.setSettings({
            puffDurationSec: Number(($event.target as HTMLInputElement).value),
          })
        "
      />
    </div>

    <div class="row">
      <span v-if="word('settings.scene') !== null" class="label">{{ word('settings.scene') }}</span>
      <button
        class="icon-button"
        data-setting="scene"
        :aria-pressed="settings.customBackground !== null"
        :aria-label="copy.say('a11y.sceneColours')"
        @click="
          game.setSettings({
            customBackground: settings.customBackground ? null : emptyScene(),
          })
        "
      >
        ▨
      </button>
    </div>
    <div v-if="settings.customBackground" class="row row-swatches" data-setting="scene-swatches">
      <label v-for="layer in SCENE_LAYERS" :key="layer" class="swatch">
        <input
          type="color"
          :value="rgbToHex(sceneOf(layer))"
          :aria-label="copy.say(`a11y.sceneLayer.${layer}`)"
          @input="setLayer(layer, ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>

    <div class="row">
      <span v-if="word('settings.fidget') !== null" class="label">{{
        word('settings.fidget')
      }}</span>
      <button
        class="icon-button"
        data-setting="fidget"
        :aria-pressed="settings.idleFlourishes"
        :aria-label="copy.say('a11y.fidget')"
        @click="game.setSettings({ idleFlourishes: !settings.idleFlourishes })"
      >
        ↻
      </button>
    </div>

    <div class="row">
      <span v-if="word('settings.word') !== null" class="label">{{ word('settings.word') }}</span>
      <button
        class="icon-button"
        data-setting="hints"
        :aria-pressed="settings.hints"
        :aria-label="copy.say('a11y.hintWords')"
        @click="game.setSettings({ hints: !settings.hints })"
      >
        ✎
      </button>
      <span class="hint-preview" aria-hidden="true">{{
        settings.hints ? word('hint.pick') : ''
      }}</span>
    </div>

    <div class="row">
      <span v-if="word('settings.language') !== null" class="label">{{
        word('settings.language')
      }}</span>
      <button
        v-for="choice in LANGUAGES"
        :key="choice.code"
        class="choice"
        :data-language="choice.code"
        :aria-pressed="languageCode === choice.code"
        :aria-label="`${copy.say('a11y.language')}: ${choice.endonym}${
          coverageOf(choice.code) === null ? '' : ` (${coverageOf(choice.code)})`
        }`"
        @click="setLanguage(choice.code)"
      >
        <span class="glyph" aria-hidden="true">{{ choice.glyph }}</span>
        <!-- A language names itself; only `auto` and `icons` are things the current language says. -->
        <span v-if="word('settings.language') !== null" class="sub">{{
          choice.copyKey === undefined ? choice.endonym : word(choice.copyKey)
        }}</span>
        <span v-if="coverageOf(choice.code) !== null" class="part">{{
          coverageOf(choice.code)
        }}</span>
      </button>
    </div>

    <div class="row">
      <span v-if="word('settings.look') !== null" class="label">{{ word('settings.look') }}</span>
      <button
        class="icon-button"
        :aria-pressed="settings.reducedMotion"
        :aria-label="copy.say('a11y.motion')"
        @click="game.setSettings({ reducedMotion: !settings.reducedMotion })"
      >
        ◌
      </button>
      <button
        class="icon-button"
        :aria-pressed="settings.contrast === 'high'"
        :aria-label="copy.say('a11y.contrast')"
        @click="game.setSettings({ contrast: settings.contrast === 'high' ? 'normal' : 'high' })"
      >
        ◑
      </button>
      <input
        class="grow"
        type="range"
        min="90"
        max="150"
        step="5"
        :value="Math.round(settings.textScale * 100)"
        :aria-label="copy.say('a11y.textSize')"
        @input="
          game.setSettings({
            textScale: Number(($event.target as HTMLInputElement).value) / 100,
          })
        "
      />
    </div>

    <div v-if="game.canVibrate.value" class="row">
      <span v-if="word('settings.vibration') !== null" class="label">{{
        word('settings.vibration')
      }}</span>
      <!-- The waveform is this row's own name: one bar per rung the hand will actually get, and a flat
           line for off. It carries no word, so the third tier reads the row exactly as the first does. -->
      <svg class="wave-icon" viewBox="0 0 26 14" aria-hidden="true" data-hook="haptic-wave">
        <line v-if="vibrationBars.length === 0" class="flat" x1="1" y1="7" x2="25" y2="7" />
        <rect
          v-for="(bar, index) in vibrationBars"
          :key="index"
          class="bar"
          :x="1 + index * 6"
          :y="14 - bar"
          width="4"
          :height="bar"
          rx="1.6"
        />
      </svg>
      <!-- S6's 触觉 is a number (the deck's own save schema writes 0.7), and `navigator.vibrate`
           has no amplitude — only durations — so this level is how long and how many pulses the hand
           gets. Zero is off, and off is the default: nobody asked for a motor by installing this. -->
      <input
        class="grow"
        type="range"
        min="0"
        max="100"
        step="5"
        :value="Math.round(settings.haptics * 100)"
        :aria-label="copy.say('a11y.haptics')"
        @input="
          game.setSettings({
            haptics: Number(($event.target as HTMLInputElement).value) / 100,
          })
        "
      />
      <span class="digits">{{ Math.round(settings.haptics * 100) }}</span>
    </div>
    <div v-if="game.canVibrate.value" class="row row-shapes" data-hook="haptic-shapes">
      <!-- The three shapes S6 names, spelled out so the slider is not a mystery dial: what the hand
           is told, per beat. They are words about one control, not three controls. -->
      <span v-if="word('settings.haptic.spark') !== null" class="shape">{{
        word('settings.haptic.spark')
      }}</span>
      <span v-if="word('settings.haptic.swell') !== null" class="shape">{{
        word('settings.haptic.swell')
      }}</span>
      <span v-if="word('settings.haptic.grit') !== null" class="shape">{{
        word('settings.haptic.grit')
      }}</span>
    </div>

    <div class="row">
      <span v-if="word('settings.limit') !== null" class="label">{{ word('settings.limit') }}</span>
      <!-- S20's ceiling is the player's own number. Zero means "I did not pick one", and raising
           it costs nothing: the brief forbids turning a limit into a punishment. -->
      <input
        class="grow"
        type="range"
        min="0"
        max="40"
        step="1"
        :value="settings.dailyLimitSticks ?? 0"
        :aria-label="copy.say('settings.limit')"
        @input="
          {
            const sticks = Number(($event.target as HTMLInputElement).value);
            game.setSettings({ dailyLimitSticks: sticks > 0 ? sticks : undefined });
          }
        "
      />
      <span class="digits">{{ settings.dailyLimitSticks ?? '—' }}</span>
    </div>

    <div class="row">
      <span v-if="word('settings.anchor') !== null" class="label">{{
        word('settings.anchor')
      }}</span>
      <input
        class="date grow"
        type="date"
        :value="
          settings.quitAnchorTimestamp
            ? new Date(settings.quitAnchorTimestamp).toISOString().slice(0, 10)
            : ''
        "
        :aria-label="copy.say('a11y.anchorDate')"
        @change="
          {
            const raw = ($event.target as HTMLInputElement).value;
            game.setSettings({
              quitAnchorTimestamp: raw ? Date.parse(`${raw}T00:00:00Z`) : undefined,
            });
          }
        "
      />
    </div>

    <div class="row">
      <span v-if="word('settings.data') !== null" class="label">{{ word('settings.data') }}</span>
      <button class="icon-button" :aria-label="copy.say('a11y.export')" @click="download()">
        ⤓
      </button>
      <button class="icon-button" :aria-label="copy.say('a11y.import')" @click="fileInput?.click()">
        ⤒
      </button>
      <button
        class="icon-button"
        data-hook="erase"
        :data-armed="armed"
        :aria-label="copy.say(armed ? 'a11y.resetArm' : 'a11y.reset')"
        @click="eraseAll()"
      >
        ⌫
      </button>
      <span class="arm" aria-live="polite">{{
        word(armed ? 'settings.resetArm' : 'settings.reset')
      }}</span>
      <span v-if="importState !== 'idle'" class="state" :class="importState" aria-hidden="true">
        {{ importState === 'ok' ? '✓' : '!' }}
      </span>
      <input
        ref="fileInput"
        type="file"
        accept="application/json,.json"
        hidden
        @change="readFile"
      />
    </div>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.mark {
  color: var(--smoke-gray);
}

.close {
  margin-inline-start: auto;
}

.warn {
  opacity: 0.6;
}

/* One row per decision: the word on the left, the control on the right of it. */
.row {
  display: flex;
  /* A row of choices that will not fit a phone has to flow onto a second line: a sheet pans
     vertically by finger and refuses horizontal panning on purpose, so anything wider than the
     sheet is content a player can never reach. */
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: var(--tap-target, 44px);
  margin: 2px 0;
}

/* The three shape words name what the slider above them does, so they are quieter than a control
   row and are not tappable. */
.row-shapes {
  min-height: 20px;
  gap: 10px;
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
}

.label {
  width: 88px;
  flex: none;
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
  letter-spacing: 0.06em;
}

.grow {
  flex: 1;
  min-width: 0;
}

.digits {
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
  min-width: 3ch;
  text-align: end;
}

/* The 震动波形 icon: this row's wordless name. The bars are the 档位, so a player who reads no words
   still sees how many pulses the hand is going to get — and off is a flat line, not an empty gap. */
.wave-icon {
  width: 26px;
  height: 14px;
  flex: none;
}

.wave-icon .bar {
  fill: var(--soft-white);
}

.wave-icon .flat {
  stroke: color-mix(in oklab, var(--soft-white) 55%, transparent);
  stroke-width: 1.6;
  stroke-linecap: round;
}

/* A control you have to guess at is the thing this sheet used to be. */
.choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: var(--tap-target, 44px);
  min-height: var(--tap-target, 44px);
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--soft-white);
  font: inherit;
  transition:
    border-color 180ms var(--ease-out),
    background-color 180ms var(--ease-out);
}

.choice[aria-pressed='true'] {
  border-color: var(--ember-orange);
  background: color-mix(in oklab, var(--ember-orange) 14%, transparent);
}

.choice .glyph {
  font-size: calc(15px * var(--text-scale));
  line-height: 1;
}

.choice .sub {
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
  letter-spacing: 0.08em;
}

/* Same size as the name it qualifies — this is a number about the label, not a third voice in the
   row. Digits carry their own meaning, so it reads in every tier including icons-only. */
.choice .part {
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
  letter-spacing: 0.08em;
  opacity: 0.62;
}

/* The one control that cannot be undone asks twice, in a colour and a word, instead of putting
   up a dialog on top of a sheet that is already a dialog-shaped thing. */
.arm {
  min-width: 5ch;
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
  letter-spacing: 0.08em;
}

.icon-button[data-armed='true'] {
  color: var(--ember-orange);
}

.hint-preview {
  min-width: 4ch;
  color: var(--soft-white);
  font-size: calc(15px * var(--text-scale));
  letter-spacing: 0.26em;
  text-transform: uppercase;
  opacity: 0.7;
}

.date {
  background: transparent;
  border: 1px solid var(--chrome-line);
  border-radius: var(--radius);
  color: var(--soft-white);
  padding: 8px 10px;
  font: inherit;
}

.state {
  color: var(--ember-core);
}

.state.bad {
  color: #e2604a;
}
</style>
