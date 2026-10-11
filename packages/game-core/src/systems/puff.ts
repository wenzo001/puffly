/**
 * Puff interaction — SPEC.md §14.
 *
 * `hold` is a draw: intensity, ember, smoke density and sound all rise together and
 * `release` lets the smoke expand. `tap` is a short sip. The tuning numbers behind them stay
 * in content (§4) — what reaches the player is the reading of the draw they just took (§14, S4).
 */

import { clamp, clamp01, lerp } from '@puffly/shared';
import { PUFF, TIMING } from '../constants';
import { emit, record, setState } from '../emit';
import { SessionEventType } from '../types/events';
import { pickLipAction, puffTierFor } from '../puffTier';
import { exhaleBurst, puffBurst } from './emissions';
import type { EngineRuntime } from '../runtime';

export function beginPuff(rt: EngineRuntime): void {
  const puff = rt.state.cigarette.puff;
  if (puff.active) return;
  const profile = rt.cigarette.puffProfile;

  puff.active = true;
  puff.progress = 0;
  puff.heldMs = 0;
  // Cleared here rather than left for the release to overwrite: a draw in progress must never be
  // read as the one before it, and the exhale screen is the only reader of this field.
  puff.lastDraw = 0;
  // §puffAnimations: the mouth has nine shapes, three to a tier, and a draw opens in the
  // shallow one — the tier walks up below as the hold grows. Rolled every single time,
  // including for a 品鉴型 that will never be shown a lip line, for the same reason the
  // planned window is rolled: a kind or a preference must not fork the stream §71 replays.
  puff.lipAction = pickLipAction(rt.rng, 'S', puff.lipAction).id;
  puff.intensity = clamp01(profile.intensityMin);
  rt.timers.puffMs = 0;
  // The rod's own window is rolled every single time, whether or not the player overrode it: the
  // number is spent either way, so a preference cannot shift the deterministic stream §71 pins.
  const authored = rt.rng.range(profile.durationMin, profile.durationMax);
  const own = rt.settings.puffDurationSec;
  rt.timers.puffPlannedMs = own === undefined ? authored : Math.round(own * 1000);
  setState(rt, 'PUFFING');
}

export function tickPuff(rt: EngineRuntime, dtMs: number): void {
  const puff = rt.state.cigarette.puff;
  const profile = rt.cigarette.puffProfile;

  if (!puff.active) {
    puff.sinceReleaseMs += dtMs;
    puff.progress = lerp(puff.progress, 0, clamp01(dtMs / 220));
    puff.intensity = lerp(puff.intensity, 0, clamp01(dtMs / 320));
    puff.heldMs = 0;
    puff.load = Math.max(0, puff.load - PUFF.loadDecayPerSecond * (dtMs / 1000));
    return;
  }

  rt.timers.puffMs += dtMs;
  puff.heldMs += dtMs;
  // The tier is the held time and nothing else, so a longer press escalates in front of the
  // player. The roll belongs to the crossing, not the tick: `heldMs - dtMs` is this tick's own
  // input, so a replay of the same presses crosses the same lines and spends the same draws.
  const tier = puffTierFor(puff.heldMs);
  if (tier !== puffTierFor(puff.heldMs - dtMs)) {
    puff.lipAction = pickLipAction(rt.rng, tier, puff.lipAction).id;
  }
  const planned = Math.max(1, rt.timers.puffPlannedMs);
  // Two families of draw, both authored in content rather than branched on here: an inhaled one
  // keeps filling for as long as the hand holds it, sub-linearly, so a 2s hold is not twice a 1s
  // hold (§14). A mouthed one fills on its own fixed rhythm and then holds — 含住两秒 — and
  // `progress` carries that shape so the ring draws the mouth rather than the clock.
  const shaped =
    profile.savourMs > 0
      ? clamp01(puff.heldMs / profile.savourMs)
      : Math.pow(clamp01(rt.timers.puffMs / planned), PUFF.intensityCurve);
  puff.progress = shaped;
  puff.intensity = clamp(lerp(profile.intensityMin, profile.intensityMax, shaped), 0, 1);

  // The ceiling. `progress` has been at 1 since the planned length, so this is the stretch where the
  // player can see the draw is done and is holding on anyway: the mouth comes off the rod by itself
  // there, and the exhale that follows is the one the release would have produced.
  const ceiling = Math.max(rt.timers.puffPlannedMs, profile.savourMs) * PUFF.maxHoldFactor;
  if (puff.heldMs >= ceiling) {
    endPuff(rt);
    return;
  }

  // A held draw leaks at the cherry the whole time it is held — and it leaks *continuously*.
  // Four times the rate at a quarter of the particles per burst is the same smoke per second,
  // but spread over time instead of dropped in clumps: the design's ribbon is one unbroken line,
  // and clumps are what made it read as a string of puffs.
  if (rt.rng.bool(clamp01(dtMs / 1000) * 26 * (0.3 + puff.intensity))) {
    emit(rt, { kind: 'burst', atMs: rt.state.nowMs, burst: puffBurst(rt) });
  }
}

export function endPuff(rt: EngineRuntime): void {
  const puff = rt.state.cigarette.puff;
  if (!puff.active) return;
  const intensity = puff.intensity;
  const profile = rt.cigarette.puffProfile;

  puff.active = false;
  puff.sinceReleaseMs = 0;
  // The exhale's shape is the tier the press's own clock landed on, measured before `heldMs`
  // resets. §puffAnimations: the breath is never random — the tier decides volume, layers, spread
  // and rise time, and this is the only moment that tier is settled.
  puff.lastTier = puffTierFor(puff.heldMs);
  // The one figure the exhale is read by, kept at the release: `intensity` starts fading on the next
  // step, and a reading of a draw that has ended must not move while its smoke is still on screen.
  puff.lastDraw = intensity;
  puff.count += 1;
  puff.load = clamp01(puff.load + intensity * profile.loadPerPuff);
  rt.state.cigarette.ember.flare = Math.max(rt.state.cigarette.ember.flare, intensity * 0.55);

  emit(rt, { kind: 'burst', atMs: rt.state.nowMs, burst: exhaleBurst(rt, intensity) });
  record(rt, SessionEventType.PUFF, {
    intensity: Math.round(intensity * 1000) / 1000,
    heldMs: Math.round(puff.heldMs),
    plannedMs: Math.round(rt.timers.puffPlannedMs),
    count: puff.count,
  });
  rt.progress.puffs += 1;
}

/** A tap is a sip: a short draw that ends immediately (§14 tap vs hold). */
export function tapPuff(rt: EngineRuntime): void {
  beginPuff(rt);
  const puff = rt.state.cigarette.puff;
  const profile = rt.cigarette.puffProfile;
  puff.progress = clamp01(TIMING.microPuffMs / Math.max(1, rt.timers.puffPlannedMs));
  puff.intensity = clamp01(profile.intensityMin * 0.9);
  puff.heldMs = TIMING.microPuffMs;
  endPuff(rt);
}

export function isPuffing(rt: EngineRuntime): boolean {
  return rt.state.cigarette.puff.active;
}
