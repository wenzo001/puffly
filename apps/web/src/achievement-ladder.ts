/**
 * The parts of the 成就 block that are decisions rather than markup.
 *
 * `SessionSheet.vue` draws four axis rows, three moment rows and the two whole-device figures, and
 * the arithmetic that turns a ledger into those rows is the one thing about the block worth testing
 * on its own: the *bar* is the block's only wordless channel (a met rung is a full one, an unlit rung
 * is as long as the player's way in), so `rungFillStyle` is the exact string the template renders and
 * not a description of it. Same for the units: the axis→unit table is here rather than inline, so
 * `achievement-units.test.ts` can check that all four exist in both spoken tiers without rendering a
 * component that would drag the scene, the audio graph and a storage adapter behind it.
 *
 * Nothing in this file invents a fact. `ratio`, `goal` and `minGust` are read off the rungs
 * `achievementsFor` already returned; the only thing computed here is a CSS transform argument.
 */
import { achievementsFor, type AchievementAxis, type AchievementRung } from '@puffly/game-core';
import { createI18n, COPY, type CopyKey, type LocaleCode } from './i18n';

/** The four accumulating axes, in the order the ladder reads them: 支 · 口 · 灰 · 时长. */
export type LadderAxis = Exclude<AchievementAxis, 'moment'>;

export interface AxisBar {
  axis: LadderAxis;
  /** The row's own name — the ledger row above it already uses three of these keys. */
  key: CopyKey;
  /** §H.8's 度量单位预算: the word that says what the figure is measured in. */
  unit: CopyKey;
}

/**
 * The ladder's four rows. The units are 支 / 口 / 克 / 分钟 — the deck's own words, not a fifth
 * spelling of them — and the ash row keeps its own key because the ledger above counts 磕灰 while
 * this row counts grams.
 */
export const ACHIEVEMENT_BARS: readonly AxisBar[] = [
  { axis: 'sticks', key: 'stats.sticks', unit: 'ach.unit.sticks' },
  { axis: 'puffs', key: 'stats.draws', unit: 'ach.unit.puffs' },
  { axis: 'ash', key: 'ach.axis.ash', unit: 'ach.unit.grams' },
  { axis: 'time', key: 'stats.time', unit: 'ach.unit.minutes' },
];

/** What each axis's figure is measured in, for the callers that only have the axis name. */
export const ACHIEVEMENT_UNITS: Readonly<Record<LadderAxis, CopyKey>> = {
  sticks: 'ach.unit.sticks',
  puffs: 'ach.unit.puffs',
  ash: 'ach.unit.grams',
  time: 'ach.unit.minutes',
};

/**
 * The bar's fill, as the one declaration the template writes.
 *
 * `scaleX` and not `width: N%`: the transform *is* the ratio, so the bar cannot drift from the digits
 * beside it, and it costs no layout pass when the ledger ticks. Clamped because a ratio is a number
 * from core and a bar that overflows its track is a claim about progress that is not true.
 */
export function rungFillStyle(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  return `scaleX(${String(clamped)})`;
}

/** The four accumulating figures, as the ledger the ladder is read against. */
export interface Ledger {
  sticks: number;
  puffs: number;
  ashGrams: number;
  minutes: number;
}

/** One rung row, as this module's readers need it — no DOM, no styles, just the four parts. */
export interface AxisRow extends AxisBar {
  ratio: number;
  value: number;
  goal: number;
  reached: number;
  total: number;
  fresh: boolean;
}

/**
 * The four rows the sheet's `ladder` computed draws, from the ledger alone.
 *
 * This is the arithmetic the feature rests on: the row shows the rung *in hand* — the next one not
 * yet met — as `value / goal`, where `value` is the player's own figure clamped to that rung's goal
 * and `ratio` is the core's fraction of the way in. A player one puff short of a rung therefore
 * renders differently from a player at zero, which is the defect this whole block was fixed for.
 */
export function ladderRows(
  ledger: Ledger,
  strongestGust = 0,
  rungs: AchievementRung[] = achievementsFor(ledger, strongestGust),
): AxisRow[] {
  return ACHIEVEMENT_BARS.map((row) => {
    const mine = rungs.filter((rung) => rung.achievement.axis === row.axis);
    const next = mine.find((rung) => !rung.reached) ?? mine[mine.length - 1];
    const at =
      row.axis === 'sticks'
        ? ledger.sticks
        : row.axis === 'puffs'
          ? ledger.puffs
          : row.axis === 'ash'
            ? ledger.ashGrams
            : ledger.minutes;
    return {
      ...row,
      ratio: next?.ratio ?? 1,
      value: Math.min(at, next?.achievement.goal ?? at),
      goal: next?.achievement.goal ?? 0,
      reached: mine.filter((rung) => rung.reached).length,
      total: mine.length,
      fresh: false,
    };
  });
}

/** The four parts a rung row is made of, named so a test can ask which of them is a word. */
export type PartName = 'name' | 'track' | 'value' | 'unit' | 'met' | 'state';

export interface BlockParts {
  parts: Record<PartName, string[]>;
  rows: number;
}

/**
 * The block as *parts*, rendered through the same copy tier the sheet uses.
 *
 * This is the icons-tier check's reader: it answers "with no words on screen, which parts are still
 * there and do the two states still differ" without mounting a component whose siblings are the 3D
 * stage and the audio graph. It is the shape the sheet renders — a track whose transform is the
 * core's ratio, a name and a unit that vanish with the words, and two figures — and the tests beside
 * it check that shape against `SessionSheet.vue`'s own markup rather than trusting this file.
 */
export function renderBlock(
  locale: LocaleCode,
  ledger: Partial<Ledger> = {},
  strongestGust = 0,
): BlockParts {
  const i18n = createI18n(locale);
  const full: Ledger = { sticks: 0, puffs: 0, ashGrams: 0, minutes: 0, ...ledger };
  const parts: Record<PartName, string[]> = {
    name: [],
    track: [],
    value: [],
    unit: [],
    met: [],
    state: [],
  };
  const rows = ladderRows(full, strongestGust);
  for (const row of rows) {
    const name = i18n.t(row.key);
    if (name !== null) parts.name.push(name);
    parts.track.push(rungFillStyle(row.ratio));
    parts.value.push(String(row.value));
    const unit = i18n.t(row.unit);
    if (unit !== null) parts.unit.push(unit);
    parts.met.push(`${String(row.reached)}/${String(row.total)}`);
  }
  // The three moments: a name that is a word, a fill that is the core's 0 or 1, and a goal that is
  // core's own `minGust`. Their state is the only word on the block that is allowed to be a word —
  // and it is checked as a word, in the one place the two states are named.
  for (const rung of achievementsFor(full, strongestGust).filter(
    (entry) => entry.achievement.axis === 'moment',
  )) {
    const name = i18n.t(momentKey(rung.achievement.id));
    if (name !== null) parts.name.push(name);
    parts.track.push(rungFillStyle(rung.ratio));
    parts.value.push(String(rung.achievement.minGust ?? 0));
    const state = i18n.t(rung.reached ? 'ach.unit.caught' : 'ach.unit.locked');
    if (state !== null) parts.state.push(state);
  }
  return { parts, rows: rows.length };
}

/** The three rare moments, by id, in the order core declares them. */
export const MOMENT_IDS = ['moment.gust', 'moment.squall', 'moment.freak'] as const;

/** A moment's name, keyed off its id — written out so an unnamed moment is a type error. */
export function momentKey(id: string): CopyKey {
  const keyed = `ach.moment.${id.replace('moment.', '')}`;
  return keyed as CopyKey;
}

/** The copy table's own count of the unit budget, so a ninth word is a failing test. */
export const UNIT_KEYS: CopyKey[] = Object.keys(COPY.en ?? {}).filter((key) =>
  key.startsWith('ach.unit.'),
) as CopyKey[];
