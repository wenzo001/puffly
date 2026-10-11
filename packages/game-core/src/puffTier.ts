/**
 * The three inhale tiers and the nine lip actions — `SmokeRitual-SPEC.json` §puffAnimations, which
 * is the one place in this design where a random choice is allowed, and therefore the one place
 * that needs its bounds written down rather than improvised at a call site.
 *
 * Four rules, all of them the source's own redlines rather than decisions made here:
 *  - the tier comes from the press's measured duration and nothing else (`puffTierFor`);
 *  - the dice only ever pick *within* the tier that duration landed on;
 *  - a pick never returns the action the previous pick returned;
 *  - the exhale is not random at all. Its layer count, rise time and spread radius are read off the
 *    tier, which is why they live on the tier record rather than behind a second lookup.
 */

import type { Rng } from '@puffly/shared';

export type PuffTierId = 'S' | 'M' | 'L';

/** One tier's own numbers, in the units §puffAnimations writes them in. */
export interface PuffTier {
  readonly id: PuffTierId;
  /** The source's words: 浅吸 / 中吸 / 深吸. */
  readonly label: string;
  /** The top of this tier's held-seconds band, exclusive — except at L, see below. */
  readonly maxSeconds: number;
  readonly volumeMl: number;
  readonly smokeLayers: readonly [number, number];
  readonly spreadRadiusPx: number;
  readonly riseSeconds: number;
  /** What the smoke does with those numbers. `random: false` is the source's own field. */
  readonly exhale: { readonly name: string; readonly desc: string };
}

export const PUFF_TIERS: Record<PuffTierId, PuffTier> = {
  S: {
    id: 'S',
    label: '浅吸',
    maxSeconds: 1,
    volumeMl: 8,
    smokeLayers: [1, 2],
    spreadRadiusPx: 24,
    riseSeconds: 0.6,
    exhale: { name: '细线', desc: '一到两道细丝，0.6s 内散完，扩散半径最小' },
  },
  M: {
    id: 'M',
    label: '中吸',
    maxSeconds: 2,
    volumeMl: 24,
    smokeLayers: [3, 4],
    spreadRadiusPx: 52,
    riseSeconds: 1.2,
    exhale: { name: '团', desc: '两到三层云团，1.2s 上升到半空开始散开' },
  },
  L: {
    id: 'L',
    label: '深吸',
    // The source's own range for this tier is [2.0, 2.0]: ISO 3308 puts a single draw at 2.0 s /
    // 35 ml and the deep tier sits exactly on that ceiling, so a longer hold is still L rather than
    // a fourth tier nobody drew.
    maxSeconds: 2,
    volumeMl: 35,
    smokeLayers: [5, 6],
    spreadRadiusPx: 86,
    riseSeconds: 2.5,
    exhale: { name: '柱', desc: '五层烟团成柱上升，2.5s 才散到顶，扩散半径最大' },
  },
};

/** Which tier a press of this many milliseconds is in — held time, not intent and not a setting. */
export function puffTierFor(heldMs: number): PuffTierId {
  const seconds = Math.max(0, heldMs) / 1000;
  if (seconds < PUFF_TIERS.S.maxSeconds) return 'S';
  if (seconds < PUFF_TIERS.M.maxSeconds) return 'M';
  return 'L';
}

export type LipActionId = 'S1' | 'S2' | 'S3' | 'M1' | 'M2' | 'M3' | 'L1' | 'L2' | 'L3';

/**
 * The lip line on its own. §redlines.abstractMouthOnly allows nothing else on the face — no teeth,
 * no tongue, no eye — and §puffAnimations.hardConstraints forbids a large deformation, so the
 * numbers here are all single-digit pixels and four degrees.
 */
export interface LipShape {
  /** 唇线内收 (S1). */
  readonly tuckPx?: number;
  /** 唇线拉平 (S2). */
  readonly flat?: boolean;
  /** 唇珠鼓起 (S2). */
  readonly beadPx?: number;
  /** 唇线一高一低 (S3). */
  readonly tiltDeg?: number;
  /** 唇线收窄 (M1, M3). */
  readonly narrowPx?: number;
  /** 下唇前突 (M2). */
  readonly lowerLipOutPx?: number;
  /** 唇线压扁 (L1). */
  readonly flattenPx?: number;
  /** 唇珠前突 (L2). */
  readonly beadOutPx?: number;
  /** 唇线分段收 (L3). */
  readonly segments?: number;
}

/** The airflow column that answers the lip line, in the source's own units. */
export interface AirflowShape {
  /** 气流柱加粗 / 最粗 / 上升最快 — the multipliers the source actually writes. */
  readonly scale?: number;
  /** 气流柱偏移 (S3). */
  readonly offsetPx?: number;
  /** 气流柱带轻微旋转 (M2). */
  readonly spinDeg?: number;
  /** 0.3s 到顶 (S1). */
  readonly toTopSeconds?: number;
  /** 气流柱断续 (L3). */
  readonly segments?: number;
  /** 带侧向涡 (S3). */
  readonly sideVortex?: boolean;
  /** 两侧回吸纹 (M1), 回吸纹最强 (M3). */
  readonly wisps?: boolean | 'strongest';
  /** 鼻翼褶 (L1). */
  readonly noseWrinkles?: boolean;
  /** 末端开始发散 (L2). */
  readonly tipDiverges?: boolean;
  /**
   * 最细 / 略细 / 最粗 / 最宽. The source gives these as words and no number, so they stay words —
   * turning them into multipliers would be this file's arithmetic, not the design's.
   */
  readonly note?: string;
}

export interface LipAction {
  readonly id: LipActionId;
  readonly tier: PuffTierId;
  readonly name: string;
  readonly desc: string;
  readonly lip: LipShape;
  readonly column: AirflowShape;
}

const S1: LipAction = {
  id: 'S1',
  tier: 'S',
  name: '内收',
  desc: '唇线微收，气流直上',
  lip: { tuckPx: 2 },
  column: { note: '最细', toTopSeconds: 0.3 },
};
const S2: LipAction = {
  id: 'S2',
  tier: 'S',
  name: '抿唇',
  desc: '唇线拉平、唇珠微鼓',
  lip: { flat: true, beadPx: 1.5 },
  column: { note: '略细' },
};
const S3: LipAction = {
  id: 'S3',
  tier: 'S',
  name: '偏唇',
  desc: '唇线一高一低，气流向侧偏',
  lip: { tiltDeg: -4 },
  column: { offsetPx: 8, sideVortex: true },
};
const M1: LipAction = {
  id: 'M1',
  tier: 'M',
  name: '收唇',
  desc: '唇线明显收窄，口腔内收',
  lip: { narrowPx: 4 },
  column: { scale: 1.4, wisps: true },
};
const M2: LipAction = {
  id: 'M2',
  tier: 'M',
  name: '撅唇',
  desc: '下唇前撅、上唇微抬',
  lip: { lowerLipOutPx: 3 },
  column: { spinDeg: 8 },
};
const M3: LipAction = {
  id: 'M3',
  tier: 'M',
  name: '深吸',
  desc: '唇线最紧、口腔最深',
  lip: { narrowPx: 5 },
  column: { scale: 1.8, wisps: 'strongest' },
};
const L1: LipAction = {
  id: 'L1',
  tier: 'L',
  name: '尽吸',
  desc: '唇线压到最扁，两侧出现鼻翼褶',
  lip: { flattenPx: 6 },
  column: { scale: 2.2, noseWrinkles: true },
};
const L2: LipAction = {
  id: 'L2',
  tier: 'L',
  name: '长啸',
  desc: '唇线圆张、唇珠前突',
  lip: { beadOutPx: 4 },
  column: { note: '最宽', tipDiverges: true },
};
const L3: LipAction = {
  id: 'L3',
  tier: 'L',
  name: '顿口',
  desc: '唇线一顿一顿地收，气流断续',
  lip: { segments: 2 },
  column: { segments: 2 },
};

export const LIP_ACTIONS: readonly LipAction[] = [S1, S2, S3, M1, M2, M3, L1, L2, L3];

/** The three actions belonging to one tier. Never a pool to draw across. */
export function lipActionsFor(tier: PuffTierId): readonly LipAction[] {
  return LIP_ACTIONS.filter((action) => action.tier === tier);
}

/**
 * Whether this rod gets a lip line at all. The nine actions are how an *inhaled* draw is drawn —
 * 「雪茄、斗烟、水烟都不是往肺里吸的」 — and the core already measures that difference as
 * `readouts.savourMs`: how long a rod wants its smoke held in the mouth, `0` for one that is
 * inhaled. So this is a reading of the rod, not a category the interface has to be told, and the
 * same expression is what keeps the resistance bar off those rods today.
 */
export const showsLipLine = (savourMs: number): boolean => !(savourMs > 0);

/**
 * One of the tier's three actions, never the one just shown.
 *
 * Exactly one draw per call, and the excluded action is taken out of the pool before the draw
 * rather than re-rolled after it — a second `next()` would make the stream depend on what the last
 * draw happened to land on, and §71's replay cannot survive that. The caller rolls for every draw
 * including a 品鉴型's, so the stream cannot fork on which rod is in the hand either; whether the
 * line is *shown* is the interface's call, made from `readouts.savourMs`.
 */
export function pickLipAction(rng: Rng, tier: PuffTierId, previous: LipActionId | null): LipAction {
  const pool = lipActionsFor(tier).filter((action) => action.id !== previous);
  return pool[Math.floor(rng.next() * pool.length)] ?? S1;
}
