/**
 * Ember engine — SPEC.md §17.
 *
 * Brightness, a "temperature illusion" ramp, flicker, occasional flares and decay. The
 * flare is the moment a player later describes as 「刚才那个火星还挺真实」 (§82), so it is
 * rare, sharp, and always followed by a slow recovery.
 */

import { approach, clamp, clamp01, lerp } from '@puffly/shared';
import { EMBER, THRESHOLDS, TIMING } from '../constants';
import { emit, record } from '../emit';
import { isLit } from '../stateMachine';
import { SessionEventType } from '../types/events';
import { flareBurst, sparkBurst } from './emissions';
import type { EngineRuntime } from '../runtime';
import type { EmberState } from '../types/state';

function emberTarget(rt: EngineRuntime): number {
  const cigarette = rt.state.cigarette;
  const profile = rt.cigarette.emberProfile;
  switch (cigarette.state) {
    case 'PUFFING':
      return profile.brightness * (0.9 + 0.55 * cigarette.puff.intensity);
    case 'LIGHTING':
      return profile.brightness * 0.5 * rt.state.lighter.flame;
    case 'EXTINGUISHING':
      // Pressed, it flares first and only then goes dark (§19).
      return profile.brightness * (1.1 + 0.85 * cigarette.extinguishProgress);
    case 'BURNING':
    case 'ASH_READY':
    case 'NEAR_END':
      return profile.brightness * (0.62 + 0.3 * cigarette.puff.load);
    case 'RESTING':
      return profile.brightness * (0.55 + 0.35 * cigarette.puff.load);
    case 'EXTINGUISHED':
    case 'DISCARDED':
    case 'IDLE':
    case 'PICKED_UP':
      return 0;
    default:
      return 0;
  }
}

function tickFlare(rt: EngineRuntime, dtMs: number): void {
  const ember = rt.state.cigarette.ember;
  ember.flare = Math.max(0, ember.flare - dtMs * TIMING.flareDecayPerMs);

  if (!isLit(rt.state.cigarette.state)) return;
  const profile = rt.cigarette.emberProfile;
  const boost = 1 + rt.environment.emberModifier.flareBoost;

  rt.timers.emberFlareCheckMs += dtMs;
  while (rt.timers.emberFlareCheckMs >= EMBER.flareCheckMs) {
    rt.timers.emberFlareCheckMs -= EMBER.flareCheckMs;
    if (!rt.rng.bool(profile.flareChance * boost)) continue;
    forceFlare(rt, 1);
  }
}

/**
 * The one place a flare is produced, so the ember's own chance and a scheduled
 * `ember_flare` world event cannot grow into two different behaviours (§21, §77).
 */
export function forceFlare(rt: EngineRuntime, strength: number, announce = true): void {
  const ember = rt.state.cigarette.ember;
  ember.flare = Math.max(ember.flare, clamp01(strength));
  emit(rt, { kind: 'burst', atMs: rt.state.nowMs, burst: flareBurst(rt) });
  if (announce) {
    record(rt, SessionEventType.EMBER_FLARE, { brightness: round(ember.brightness + ember.flare) });
  }
}

export function tickEmber(rt: EngineRuntime, dtMs: number): void {
  const cigarette = rt.state.cigarette;
  const ember = cigarette.ember;
  const profile = rt.cigarette.emberProfile;
  const modifier = rt.environment.emberModifier;

  const target = emberTarget(rt);
  // Brightens quickly while drawing, cools slowly — the asymmetry is the whole feel (§59). A rod that
  // is out cools faster still: `emberTarget` already answers 0 once the state says so, and the only
  // thing left to decide is how long the dark red takes to leave the table.
  const out = cigarette.state === 'EXTINGUISHED' || cigarette.state === 'DISCARDED';
  const rate = target > ember.brightness ? 9 : out ? EMBER.deathCoolRate : 2.4;
  ember.brightness = clamp01(approach(ember.brightness, target, rate, dtMs) * modifier.brightness);

  tickFlare(rt, dtMs);

  const phase = rt.timers.wobblePhaseMs / 1000;
  ember.flicker = clamp(
    Math.sin(phase * 11.3) * 0.5 * profile.flicker +
      Math.sin(phase * 26.7 + 1.7) * 0.28 * profile.flicker +
      rt.rng.gaussian(0, profile.flicker * 0.3),
    -1,
    1,
  );

  const total = clamp01(ember.brightness + ember.flare * 0.45);
  ember.temperature = clamp01(EMBER.temperatureFloor + EMBER.temperatureSpan * total);
  ember.glowRadius =
    lerp(EMBER.baselineGlow, EMBER.maxGlow, total) * (1 + cigarette.puff.intensity * 0.35);
  // A dying cherry is allowed to glow without being allowed to *burn*: the state machine owns the
  // difference, and `out` is its answer. Everything else — including LIGHTING, where `ignite()`
  // lights the tip before the state says the rod is burning — keeps reading the brightness, which is
  // what `emberTarget` and the sound of a catching cherry both key off.
  ember.lit = !out && total >= THRESHOLDS.litBrightness;
}

/**
 * The ember as it is *perceived*: its steady heat, breathed on by the flicker `tickEmber` just
 * drew. One home, because the cherry's glow and the burn's level have to wobble on the same number
 * — otherwise the player watches a flickering tip and hears a still picture (§4 声音跟画面连接).
 * Read by two sites in the 3D scene (`SceneStage`'s cherry and its halo) and two in the audio
 * engine (`beds`' level and `cues`' hiss).
 *
 * `tickEmber` itself does not use this for `lit` or `temperature`: those decide state, and an
 * ignition that depended on a random draw could not be replayed (§71).
 */
export const emberPresence = (
  ember: Pick<EmberState, 'brightness' | 'flare' | 'flicker'>,
): number => clamp01((ember.brightness + ember.flare * 0.5) * (1 + ember.flicker * 0.08));

/**
 * Where a cherry's temperature sits in the band the simulation can actually write, 0 at a dead one
 * and 1 at a full draw. The colour ramps are the renderer's own, but the *band* is the core's, so it
 * is derived here and value-imported (§48) — a ramp anchored to the raw number instead skips the
 * coolest 40% of its own range, and that is the 暗红 the deck's first 写实 item asks for.
 */
export const emberHeat = (temperature: number): number =>
  clamp01((temperature - EMBER.temperatureFloor) / EMBER.temperatureSpan);

/** Ignition is the one place the ember is lit before the state says it is (§11 LIGHTING). */
export function ignite(rt: EngineRuntime): void {
  // The one moment worth stamping: a break resumed hours later is measured from here.
  rt.litAtWallMs = rt.state.wallClockMs;
  const ember = rt.state.cigarette.ember;
  ember.brightness = Math.max(ember.brightness, 0.55);
  ember.flare = 0.8;
  ember.lit = true;
  const spark = sparkBurst(rt, 1);
  emit(rt, { kind: 'burst', atMs: rt.state.nowMs, burst: spark });
  record(rt, SessionEventType.LIGHT, {
    cigaretteId: rt.cigarette.id,
    lighterId: rt.lighter.id,
    burnMsTotal: round(rt.state.cigarette.burnMsTotal),
  });
}

const round = (value: number): number => Math.round(value * 1000) / 1000;
