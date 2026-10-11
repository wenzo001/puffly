/**
 * One whole break, on the shipped content — the test my fixture-based core tests cannot be.
 *
 * Everything in `packages/game-core/src/__tests__` runs against a 4-second synthetic rod,
 * which is the right trade-off for unit speed but proves nothing about `DEFAULT_CONTENT`: a Classic
 * that burns for a full ten minutes, a real environment pool, real ash thresholds, a real unlock
 * ladder. This file lights the thing a player will actually see, plays a whole break of it through
 * the renderer, closes the session, and then asks `@puffly/game-statistics` whether the numbers that
 * reach the screen match what happened (§70).
 *
 * Which is also why the waits below are written in the rod's own burn rather than in a fixed number
 * of milliseconds: a rod that burns three times as long asks for three times as much sim time to
 * grow the same column of ash, and a magic 180 s is a claim about the content that nothing checks.
 */

import { describe, expect, it } from 'vitest';
import {
  SessionEventType,
  createDefaultSettings,
  createEngine,
  type EngineEvent,
  type GameInput,
  type GameStateView,
  type InputTarget,
} from '@puffly/game-core';
import {
  DEFAULT_CONTENT,
  DEFAULT_IDS,
  buildCollectionItems,
  createDefaultLookup,
} from '@puffly/game-content';
import {
  deriveJourney,
  deriveStatistics,
  deriveTodayView,
  deriveTriggerBreakdown,
} from '@puffly/game-statistics';

const WALL_CLOCK = Date.UTC(2026, 8, 29, 22, 15, 0);
const STEP = Math.ceil(1000 / 60);

interface Driver {
  engine: ReturnType<typeof createEngine>;
  events: EngineEvent[];
  state: () => GameStateView;
  run: (ms: number, render?: boolean) => void;
  until: (predicate: () => boolean, limitMs: number, label: string) => void;
  aim: (target: InputTarget, type: GameInput['type']) => void;
}

function driver(): Driver {
  const content = createDefaultLookup();
  const engine = createEngine({
    content,
    seed: 20260929,
    wallClockMs: WALL_CLOCK,
    settings: createDefaultSettings(),
    ...DEFAULT_IDS,
  });

  const events: EngineEvent[] = [];
  engine.on((event) => events.push(event));

  /**
   * Simulated in fixed steps. This file's claim used to be "the whole loop works and the renderer
   * never corrupts it"; since the painted layer retired (2026-10-10) the renderer half is gone and
   * what remains is the loop itself — a session opened, drawn out, closed and counted, with the
   * statistics layer reading it back.
   */
  const run = (ms: number): void => {
    let left = ms;
    while (left > 0) {
      engine.advance(STEP);
      left -= STEP;
    }
  };

  const aim = (target: InputTarget, type: GameInput['type']): void => {
    const state = engine.getState();
    const anchors = state.anchors;
    const point =
      target === 'lighter'
        ? anchors.lighter
        : target === 'ash'
          ? anchors.ash
          : target === 'ashtray'
            ? anchors.ashtray
            : target === 'ember'
              ? anchors.ember
              : anchors.body;
    engine.send({
      type,
      x: point.x,
      y: point.y,
      timestamp: state.nowMs,
      target,
      source: 'pointer',
    });
  };

  const until = (predicate: () => boolean, limitMs: number, label: string): void => {
    let waited = 0;
    while (!predicate() && waited < limitMs) {
      run(STEP * 3);
      waited += STEP * 3;
    }
    if (!predicate()) throw new Error(`never reached: ${label} (waited ${limitMs}ms of sim time)`);
  };

  return { engine, events, state: () => engine.getState(), run, until, aim };
}

describe('a real break on real content (§8, §82)', () => {
  it(
    'lights, draws, ashes, cools and is thrown away — with nothing stuck',
    { timeout: 40_000 },
    () => {
      const d = driver();

      expect(d.state().cigarette.state).toBe('IDLE');
      expect(d.state().environment.id).toBe(DEFAULT_IDS.environment);

      d.aim('cigarette', 'tap');
      d.run(60);
      expect(d.state().cigarette.state).toBe('PICKED_UP');

      d.aim('lighter', 'tap');
      d.until(() => d.state().cigarette.state === 'BURNING', 4000, 'lit');
      expect(d.state().cigarette.ember.lit).toBe(true);

      // Three draws, each with a real hold, and the smoke field must respond every time.
      for (let i = 0; i < 3; i++) {
        d.aim('cigarette', 'hold');
        d.run(700);
        expect(d.state().cigarette.state).toBe('PUFFING');
        d.aim('cigarette', 'release');
        d.run(400);
      }
      expect(d.state().cigarette.puff.count).toBe(3);
      expect(d.state().smoke.density).toBeGreaterThan(0.1);

      // The ash column on a Classic is long enough to ask for a flick within the rod's life.
      // Long enough to outlast the room. §22 lets a gust knock the column off before it is ever
      // critical, and how often that happens is drawn from the same stream as everything else, so
      // the wait has to be several ash cycles rather than one — and a cycle is a share of *this*
      // rod's burn, not a number of seconds.
      const oneRod = d.state().cigarette.burnMsTotal;
      d.until(() => d.state().cigarette.ash.ready, oneRod, 'ash asking to be flicked');
      d.aim('ash', 'tap');
      d.run(80);
      expect(d.state().cigarette.ash.dropped).toBeGreaterThan(0);

      // Wind, light and shadow keep happening without being asked (§22).
      const worldEvents = d.events.filter((event) => event.kind === 'world').length;
      expect(worldEvents).toBeGreaterThan(2);

      d.aim('ashtray', 'hold');
      d.until(() => d.state().cigarette.state === 'EXTINGUISHED', 3000, 'put out');
      expect(d.state().cigarette.ember.lit).toBe(false);

      d.aim('ashtray', 'release');
      d.aim('ashtray', 'tap');
      d.until(() => d.state().cigarette.state === 'DISCARDED', 3000, 'discarded');

      // A fresh rod turns up on its own; the loop can start again without a menu (§42).
      d.until(() => d.state().cigarette.state === 'IDLE', 4000, 'a new rod appears');
      expect(d.state().cigarette.rodRemaining).toBe(1);

      // Nothing in the live model went non-finite on the way there — including the §51 export,
      // which would silently turn `Infinity` into `null`.
      const nonFinite: string[] = [];
      const walk = (value: unknown, path: string): void => {
        if (typeof value === 'number' && !Number.isFinite(value))
          nonFinite.push(`${path}: ${String(value)}`);
        else if (Array.isArray(value))
          value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
        else if (value && typeof value === 'object') {
          for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            walk(entry, `${path}.${key}`);
          }
        }
      };
      walk(d.state(), 'state');
      expect(nonFinite).toEqual([]);
    },
  );

  it(
    'the session it leaves behind adds up to what happened (§33, §70)',
    { timeout: 40_000 },
    () => {
      const d = driver();
      d.engine.startSession();

      d.aim('cigarette', 'tap');
      d.run(60);
      d.aim('lighter', 'tap');
      d.until(() => d.state().cigarette.state === 'BURNING', 4000, 'lit');
      for (let i = 0; i < 2; i++) {
        d.aim('cigarette', 'hold');
        d.run(600);
        d.aim('cigarette', 'release');
        d.run(300);
      }
      d.engine.setCraving(8, 'before');
      d.engine.addTrigger('work');
      d.engine.setCraving(4, 'after');
      d.aim('ashtray', 'tap');
      d.run(2000);
      d.aim('ashtray', 'tap');
      d.run(500);

      const session = d.engine.endSession();
      expect(session).not.toBeNull();
      if (!session) return;

      const stats = deriveStatistics([session], {
        nowMs: WALL_CLOCK + 60_000,
        utcOffsetMinutes: 0,
      });
      expect(stats.sessionCount).toBe(1);
      // Hand-computed from the log, not from a counter the engine kept (§70).
      const logged = session.events.filter((event) => event.type === SessionEventType.PUFF).length;
      expect(stats.totalPuffs).toBe(logged);
      expect(logged).toBe(2);
      expect(stats.averageCravingBefore).toBe(8);
      expect(stats.averageCravingAfter).toBe(4);
      // The denominator is per session, not per report: one break that said both numbers is 1.
      expect(stats.cravingReportCount).toBe(1);
      expect(stats.cravingsHandled).toBe(1);
      expect(stats.totalEvents).toBeGreaterThanOrEqual(session.events.length);
      expect(stats.eventCounts[SessionEventType.TRIGGER]).toBe(1);
      expect(stats.dayKeys.length).toBeGreaterThan(0);

      const today = deriveTodayView([session], {
        nowMs: session.startedAt + 1000,
        utcOffsetMinutes: 0,
      });
      expect(today.puffs).toBe(2);
      expect(today.sessionCount).toBe(1);
      expect(today.smokeEvents).toBeGreaterThanOrEqual(2);

      const tags = deriveTriggerBreakdown([session]);
      expect(tags.map((entry) => entry.tag)).toContain('work');

      const journey = deriveJourney([session], {
        version: 1,
        startedAt: session.startedAt,
        dayNumber: 1,
        sessions: 1,
        puffs: 2,
        ashDropped: 0,
        longestStreakDays: 1,
        unlocked: {
          cigarettes: [],
          lighters: [],
          environments: [],
          ashtrays: [],
          smoke: [],
          sounds: [],
        },
        acknowledgedUnlocks: [],
        lastActiveDayKey: '2026-09-29',
        activeDays: ['2026-09-29'],
      });
      expect(journey.length).toBeGreaterThan(0);
      expect(journey.some((stop) => stop.dayKey.length === 10)).toBe(true);
    },
  );

  it('the shipped content is internally consistent (§13, §77)', () => {
    const content = createDefaultLookup();
    const items = buildCollectionItems(content.bundle);

    expect(DEFAULT_CONTENT.environments.length).toBeGreaterThanOrEqual(7);
    // The ladder the brief fixes: eleven categories, unlocked by cumulative sticks at these exact
    // thresholds, split seven inhaled / three savoured / one filtered. Checked as a shape rather
    // than as a list of names, so adding a twelfth category has to move the ladder on purpose.
    const rods = DEFAULT_CONTENT.cigarettes;
    expect(rods).toHaveLength(11);
    expect(rods.map((rod) => rod.unlock).filter((rule) => rule.kind === 'default')).toHaveLength(1);
    expect(
      rods
        .map((rod) => (rod.unlock.kind === 'sessions' ? rod.unlock.count : 0))
        .sort((a, b) => a - b),
    ).toEqual([0, 8, 20, 40, 65, 95, 135, 190, 250, 320, 420]);
    const kinds = rods.reduce<Record<string, number>>((tally, rod) => {
      tally[rod.archive.kind] = (tally[rod.archive.kind] ?? 0) + 1;
      return tally;
    }, {});
    expect(kinds).toEqual({ inhale: 7, savor: 3, filter: 1 });
    // No real brand anywhere: every one of these is an original the spec names.
    for (const rod of rods)
      expect(rod.archive.zhName).not.toMatch(/中华|玉溪|芙蓉王|黄鹤楼|红塔山/);

    for (const rod of DEFAULT_CONTENT.cigarettes) {
      expect(() => content.smokeStyle(rod.smokeStyleId), rod.id).not.toThrow();
      expect(() => content.soundProfile(rod.soundProfileId), rod.id).not.toThrow();
      expect(rod.burnDuration.max).toBeGreaterThan(rod.burnDuration.min);
      expect(rod.ashProfile.maxLength).toBeGreaterThan(rod.ashProfile.minLength);
      // §21's ids only; a typo in an event pool would otherwise be a silent dead pool.
      for (const id of rod.eventPool) {
        expect([
          'wind',
          'rain',
          'ash_fall',
          'ember_flare',
          'smoke_swirl',
          'lighter_failure',
          'environment_noise',
          'light_change',
          'shadow_change',
          'ambient_event',
        ]).toContain(id);
      }
      // A rod that suits a room must name a room that exists.
      for (const environmentId of rod.environmentBias) {
        expect(
          () => content.environment(environmentId),
          `${rod.id} → ${environmentId}`,
        ).not.toThrow();
      }
    }

    for (const environment of DEFAULT_CONTENT.environments) {
      expect(
        () => content.soundProfile(environment.ambientAudio.profileId),
        environment.id,
      ).not.toThrow();
    }

    // Every selectable object appears in the cabinet, so nothing is unreachable (§38).
    const ids = new Set(items.map((item) => `${item.category}:${item.id}`));
    expect(ids.size).toBe(items.length);
    for (const rod of DEFAULT_CONTENT.cigarettes)
      expect(ids.has(`cigarettes:${rod.id}`)).toBe(true);
    for (const environment of DEFAULT_CONTENT.environments) {
      expect(ids.has(`environments:${environment.id}`)).toBe(true);
    }
  });
});
