import { describe, expect, it } from 'vitest';
import { SessionEventType, THRESHOLDS } from '@puffly/game-core';
import { harness, lit, sessionTypes } from './harness';

/** The states a lit, still-eating rod can be read in — everything the flame has not finished. */
const BURNING_FAMILY = ['BURNING', 'PUFFING', 'RESTING', 'ASH_READY', 'NEAR_END'] as const;

describe('the break, end to end (§8, §11)', () => {
  it('starts on the table with nothing lit — no tutorial needed (§0)', () => {
    const h = harness();
    expect(h.state().cigarette.state).toBe('IDLE');
    expect(h.state().cigarette.ember.lit).toBe(false);
    expect(h.state().smoke.density).toBe(0);
  });

  it('a tap lifts the cigarette', () => {
    const h = harness();
    h.tap('cigarette');
    h.run(16);
    expect(h.state().cigarette.state).toBe('PICKED_UP');
    expect(sessionTypes(h)).toContain(SessionEventType.PICK_UP);
  });

  it('a tap on the lighter catches, and the cherry comes up on its own', () => {
    const h = harness();
    h.tap('cigarette');
    h.run(16);
    h.tap('lighter');
    h.run(200);
    expect(h.state().cigarette.state).toBe('LIGHTING');
    expect(h.state().lighter.flame).toBeGreaterThan(0.5);

    h.run(900);
    // The claim is "it is lit and burning", not which of the burning states it is standing in: the
    // fixture's rod burns in four seconds, so ash is worth flicking within a quarter of one and
    // ASH_READY outranks BURNING in the readout (stateMachine derives the news, not the mood).
    expect(BURNING_FAMILY).toContain(h.state().cigarette.state);
    expect(h.state().cigarette.ember.lit).toBe(true);
    expect(sessionTypes(h)).toContain(SessionEventType.LIGHT);
  });

  it('burning eats the rod over its own burn duration (§12)', () => {
    const h = harness();
    lit(h);
    const before = h.state().cigarette.rodRemaining;
    h.run(1000);
    const after = h.state().cigarette.rodRemaining;
    // 4000ms rod, give or take the per-rod smoulder jitter.
    expect(before - after).toBeGreaterThan(0.18);
    expect(before - after).toBeLessThan(0.32);
  });

  it('a hold draws: ember and intensity rise together, a release exhales (§14)', () => {
    const h = harness();
    lit(h);
    const emberBefore = h.state().cigarette.ember.brightness;

    h.press('cigarette');
    h.run(500);
    const held = h.state();
    expect(held.cigarette.state).toBe('PUFFING');
    expect(held.cigarette.puff.intensity).toBeGreaterThan(0.3);
    expect(held.cigarette.ember.brightness).toBeGreaterThan(emberBefore);

    h.release('cigarette');
    expect(sessionTypes(h)).toContain(SessionEventType.PUFF);
    expect(h.state().cigarette.puff.count).toBe(1);
    const exhale = h.bursts.filter(
      (event) => event.kind === 'burst' && event.burst.kind === 'exhale',
    );
    expect(exhale.length).toBe(1);

    h.run(300);
    // Resting *is* the release; whether the interface is showing the ash instead is the same burn
    // read a different way, so the family is what this can honestly claim.
    expect(['RESTING', 'ASH_READY']).toContain(h.state().cigarette.state);
    expect(h.state().cigarette.puff.active).toBe(false);
    h.run(900);
    expect(BURNING_FAMILY).toContain(h.state().cigarette.state);
  });

  it('a tap is only a sip (§14)', () => {
    const h = harness();
    lit(h, 1200);
    h.tap('cigarette');
    h.run(16);
    const puff = h.sessionEvents.find((event) => event.type === SessionEventType.PUFF);
    expect(puff?.payload?.['intensity']).toBeLessThan(0.4);
    expect(h.state().cigarette.puff.active).toBe(false);
  });

  it('ash grows, asks to be flicked, and comes off when flicked (§18)', () => {
    const h = harness();
    lit(h);
    expect(h.state().cigarette.ash.length).toBeGreaterThan(0);

    h.until(() => h.state().cigarette.ash.ready, 3000);
    expect(h.state().cigarette.state).toBe('ASH_READY');
    expect(h.state().cigarette.ash.bend).toBeGreaterThan(0);

    const before = h.state().cigarette.ash.dropped;
    h.tap('ash');
    const after = h.state().cigarette.ash;
    // One step of burning has already started a new column; it is the *ask* that ended.
    expect(after.length).toBeLessThan(after.criticalLength);
    expect(after.ready).toBe(false);
    expect(after.dropped).toBe(before + 1);
    expect(after.falling.length).toBeGreaterThan(0);
    expect(sessionTypes(h)).toContain(SessionEventType.ASH);
  });

  it('a column nobody flicks falls on its own (§18)', () => {
    const h = harness();
    lit(h, 1200);
    expect(h.state().cigarette.ash.dropped).toBeGreaterThanOrEqual(1);
    expect(sessionTypes(h)).toContain(SessionEventType.ASH_FALL);
  });

  it('falling ash obeys gravity rather than a canned loop (§18)', () => {
    const h = harness();
    lit(h);
    h.until(() => h.state().cigarette.ash.ready, 3000);
    h.tap('ash');
    const fragment = h.state().cigarette.ash.falling[0];
    expect(fragment).toBeDefined();
    const startY = fragment?.origin.y ?? 0;
    h.run(600);
    const later = h.state().cigarette.ash.falling.find((item) => item.id === fragment?.id);
    if (later) expect(later.origin.y).toBeGreaterThan(startY);
    h.run(4000);
    // The piece this case is following, not whatever the rod has since dropped: on a four-second
    // stick a second column is already standing by now, and it is mid-fall.
    const watched = h.state().cigarette.ash.falling.find((item) => item.id === fragment?.id);
    expect(watched === undefined || watched.settledAtMs > 0).toBe(true);
  });

  it('pressing it into the tray puts it out with a burst (§19)', () => {
    const h = harness();
    lit(h, 400);
    h.press('ashtray');
    h.run(400);
    expect(h.state().cigarette.state).toBe('EXTINGUISHING');
    expect(
      h.bursts.some((event) => event.kind === 'burst' && event.burst.kind === 'extinguish'),
    ).toBe(true);

    h.run(700);
    expect(h.state().cigarette.state).toBe('EXTINGUISHED');
    expect(h.state().cigarette.ember.lit).toBe(false);
    expect(sessionTypes(h)).toContain(SessionEventType.EXTINGUISH);
  });

  it('letting go early does not put it out (§19: pressure, not a button)', () => {
    const h = harness();
    lit(h, 400);
    h.press('ashtray');
    h.run(150);
    h.release('ashtray');
    h.run(300);
    expect(h.state().cigarette.state).not.toBe('EXTINGUISHED');
    expect(h.state().cigarette.ember.lit).toBe(true);
  });

  it('a rod that burns to the end goes out by itself (§11)', () => {
    const h = harness();
    lit(h);
    h.run(5200);
    expect(h.state().cigarette.rodRemaining).toBe(0);
    expect(h.state().cigarette.state).toBe('EXTINGUISHED');
  });

  it('a dead cherry may still give light, and is still not burning (§11)', () => {
    // The state machine owns the difference the deck draws between 熄灭前辉光收敛 and a rod that is
    // eating: `out` takes the burn away and leaves the glow. Without this, the picture of a cherry
    // going out is either still burning or suddenly black.
    const h = harness();
    lit(h);
    h.run(5200);
    const ember = h.state().cigarette.ember;
    expect(ember.lit, 'the tip is out').toBe(false);
    expect(ember.brightness, 'the tip is out').toBeLessThan(THRESHOLDS.litBrightness);
    expect(ember.glowRadius, `glow at the moment it went out`).toBeGreaterThan(0);
  });

  it('stubbing out in the tray, then letting go, discards it and turns up a fresh rod (§20)', () => {
    const h = harness();
    lit(h, 400);
    h.tap('ashtray');
    h.until(() => h.state().cigarette.state === 'EXTINGUISHED', 2000);
    expect(sessionTypes(h)).toContain(SessionEventType.EXTINGUISH);

    h.tap('ashtray');
    h.until(() => h.state().cigarette.state === 'DISCARDED', 500);
    expect(h.state().cigarette.pose.inTray).toBe(true);
    expect(sessionTypes(h)).toContain(SessionEventType.DISCARD);

    h.run(2600);
    expect(h.state().cigarette.state).toBe('IDLE');
    expect(h.state().cigarette.rodRemaining).toBe(1);
  });

  it('a lit rod dragged over the tray is smothered first, never tossed burning (§20, §84)', () => {
    const h = harness();
    lit(h);
    const body = h.state().anchors.body;
    const tray = h.state().anchors.ashtray;

    h.pointerDown(body.x, body.y);
    h.dragTo(tray.x, tray.y);
    h.pointerUp(tray.x, tray.y);
    h.run(1200);

    expect(h.state().cigarette.state).toBe('DISCARDED');
    expect(h.state().cigarette.ember.lit).toBe(false);
    expect(sessionTypes(h)).toContain(SessionEventType.EXTINGUISH);
    expect(sessionTypes(h)).toContain(SessionEventType.DISCARD);

    // And then, without being asked, a fresh rod turns up on the table (§42).
    h.run(2000);
    expect(h.state().cigarette.state).toBe('IDLE');
    expect(h.state().cigarette.rodRemaining).toBe(1);
  });

  it('dragging lifts the rod toward the finger, so movement feels held (§14 drag)', () => {
    const h = harness();
    h.tap('cigarette');
    const body = h.state().anchors.body;
    const before = h.state().cigarette.pose.pivot.y;
    h.pointerDown(body.x, body.y);
    h.dragTo(0.4, 0.3);
    h.run(200);
    expect(h.state().cigarette.pose.pivot.y).toBeLessThan(before);
    h.pointerUp(0.4, 0.3);
    h.run(400);
    expect(h.state().cigarette.pose.dragged).toBe(false);
  });

  it('a dead stub is not re-lit — it has to be thrown away', () => {
    const h = harness();
    lit(h, 400);
    h.tap('ashtray');
    h.run(1000);
    h.tap('ashtray');
    h.run(600);
    expect(h.state().cigarette.state).toBe('DISCARDED');
  });

  it('a lighter that will not catch just makes you try again (§21)', () => {
    const h = harness({ lighterId: 'test-flaky' });
    h.tap('cigarette');
    h.run(16);
    h.tap('lighter');
    h.run(900);
    expect(sessionTypes(h)).toContain(SessionEventType.LIGHT_FAIL);
    expect(sessionTypes(h)).not.toContain(SessionEventType.LIGHT);
    expect(h.state().cigarette.state).toBe('PICKED_UP');
    expect(h.state().lighter.sputter).toBeGreaterThan(0);
  });

  it('chrome fades out once the player stops touching it (§10)', () => {
    const h = harness();
    h.tap('cigarette');
    h.run(100);
    expect(h.state().ui.controlsVisible).toBe(true);
    h.run(4000);
    expect(h.state().ui.controlsVisible).toBe(false);
    h.tap('lighter');
    h.run(50);
    expect(h.state().ui.controlsVisible).toBe(true);
  });

  it('chrome stays awake until the player has touched something at all (§10, §28)', () => {
    // The fade exists so a break can be looked at. Before the first touch there is no break to
    // look at — only a dark table with one small object on it — and fading the nudge away from
    // that is how a player ends up never finding the rod.
    const h = harness();
    h.run(30_000);
    expect(h.state().ui.controlsVisible).toBe(true);
    expect(h.state().ui.idleMs).toBeGreaterThan(29_000);

    // One touch is all it takes to hand the rule back to the timer.
    h.tap('cigarette');
    h.run(4000);
    expect(h.state().ui.controlsVisible).toBe(false);
  });

  it('a swipe ends whatever was in progress, so a gesture is never counted twice (§20)', () => {
    const h = harness();
    lit(h);

    // Draw and flick at the same time: the release must come from the swipe, not after it.
    h.press('cigarette');
    h.run(400);
    expect(h.state().cigarette.puff.active).toBe(true);
    h.swipe('cigarette', 0.8, 0.1);
    expect(h.state().cigarette.puff.active).toBe(false);
    expect(sessionTypes(h)).toContain(SessionEventType.PUFF);

    // A flick toward the tray is the §20 discard, and it happens once.
    h.run(60);
    const before = sessionTypes(h).filter((type) => type === SessionEventType.DISCARD).length;
    h.swipe('cigarette', 1.2, 0.2);
    h.run(900);
    const after = sessionTypes(h).filter((type) => type === SessionEventType.DISCARD).length;
    expect(after).toBe(before + 1);
    expect(h.state().cigarette.state).toBe('DISCARDED');

    // And a fresh rod turns up without being asked, which is what keeps the loop closed (§42).
    h.run(1500);
    expect(h.state().cigarette.state).toBe('IDLE');
  });

  it('suggests one next affordance at a time (§28)', () => {
    const h = harness();
    // A rod lying on the table is a suggestion, not a blank: picking it up is what comes next,
    // and `none` used to mean the scene had nothing to say at the one moment it had to.
    expect(h.state().ui.affordance).toBe('pick');
    h.tap('cigarette');
    expect(h.state().ui.affordance).toBe('lighter');
    lit(h);
    h.until(() => h.state().cigarette.state === 'ASH_READY', 3000);
    expect(h.state().ui.affordance).toBe('flick');
  });
});

describe('the hand is the interface (§66, "touch the world")', () => {
  /** The direction the released breath takes, for a draw let go while the hand drifts `dx`. */
  function exhaleDirection(dx: number): number {
    const h = harness({ seed: 77 });
    lit(h);
    const body = h.state().anchors.body;
    h.pointerDown(body.x, body.y);
    h.run(420);
    h.dragTo(body.x + dx * 0.5, body.y);
    h.dragTo(body.x + dx, body.y);
    h.pointerUp(body.x + dx, body.y);
    const exhaled = h.bursts.filter(
      (event) => event.kind === 'burst' && event.burst.kind === 'exhale',
    );
    const last = exhaled[exhaled.length - 1];
    if (last === undefined || last.kind !== 'burst') throw new Error('nothing was exhaled');
    return last.burst.directionDeg;
  }

  it('the way the hand travels when it lets go lays the smoke that way (§7 of the brief)', () => {
    const straight = exhaleDirection(0);
    // Capped at 24 degrees each way: the world answers the gesture, it is not steered by it.
    expect(exhaleDirection(0.05)).toBeGreaterThan(straight + 8);
    expect(exhaleDirection(-0.05)).toBeLessThan(straight - 8);
    expect(exhaleDirection(0.05) - exhaleDirection(-0.05)).toBeLessThan(52);
  });

  it('two fingers closing on a lit cherry puts it out, and over nothing they do not', () => {
    const h = harness();
    lit(h);
    const pinch = (x: number, y: number) => {
      h.engine.send({ type: 'pinch', x, y, timestamp: h.state().nowMs, source: 'touch' });
      h.flush();
    };

    // A close in empty air is two fingers, nothing more.
    pinch(0.5, 0.2);
    expect(h.state().cigarette.ember.lit).toBe(true);

    // Closed on the cherry it is the same request as pressing the rod into the tray (§19).
    const ember = h.state().anchors.ember;
    pinch(ember.x, ember.y);
    h.run(900);
    expect(h.state().cigarette.ember.lit).toBe(false);
    expect(h.state().cigarette.state).toBe('EXTINGUISHED');
  });

  it('a swipe down over nothing puts the interface away and leaves the break burning', () => {
    const h = harness();
    lit(h);
    h.run(100);
    expect(h.state().ui.controlsVisible).toBe(true);

    h.engine.send({
      type: 'swipe',
      x: 0.5,
      y: 0.2,
      timestamp: h.state().nowMs,
      source: 'touch',
      velocity: { vx: 0, vy: 1.2 },
    });
    h.flush();
    expect(h.state().ui.chromeFolded).toBe(true);
    expect(h.state().ui.controlsVisible).toBe(false);

    // The fold is the interface, not the cigarette: the rod goes on being a rod.
    const before = h.state().cigarette.rodRemaining;
    h.run(1200);
    expect(h.state().cigarette.rodRemaining).toBeLessThan(before);
    expect(h.state().cigarette.ember.lit).toBe(true);
    expect(h.state().ui.controlsVisible).toBe(false);

    // Touching a thing is the only way back — not a timer.
    h.tap('cigarette');
    expect(h.state().ui.chromeFolded).toBe(false);
    expect(h.state().ui.controlsVisible).toBe(true);
  });

  it('the fold does not swallow the gestures that were already there', () => {
    const h = harness();
    lit(h);
    h.run(100);

    // Sideways over nothing: a hand moving, not a hand dismissing.
    h.engine.send({
      type: 'swipe',
      x: 0.5,
      y: 0.2,
      timestamp: h.state().nowMs,
      source: 'touch',
      velocity: { vx: 1.2, vy: 0.1 },
    });
    h.flush();
    expect(h.state().ui.chromeFolded).toBe(false);

    // Down over the tray: that is a gesture aimed at a thing, and the thing answers.
    h.engine.send({
      type: 'swipe',
      x: h.state().anchors.ashtray.x,
      y: h.state().anchors.ashtray.y,
      timestamp: h.state().nowMs,
      source: 'touch',
      velocity: { vx: 0, vy: 1.2 },
    });
    h.flush();
    expect(h.state().ui.chromeFolded).toBe(false);
  });

  // 点了不抽也行，按照计次 (S23): a stick is spent when the cherry catches, not when the rod is
  // smoked down. The same predicate decides the cabinet's gates, the level ladder and the 减量
  // page's day tally, so both edges of it have to be pinned here rather than left to reading.
  it('counts a rod that was lit and then put down (§ S23)', () => {
    const h = harness({ settings: { sessionTargetMs: 60_000 } });
    const before = h.engine.progressSnapshot().sessions;
    h.engine.startSession();
    h.tap('cigarette');
    h.run(16);
    h.tap('lighter');
    h.run(900);
    h.engine.endSession();
    expect(h.engine.progressSnapshot().sessions - before).toBe(1);
  });

  it('does not count a break that never caught a rod (§ S23)', () => {
    const h = harness({ settings: { sessionTargetMs: 60_000 } });
    const before = h.engine.progressSnapshot().sessions;
    h.engine.startSession();
    h.tap('cigarette');
    h.run(2_000);
    h.engine.endSession();
    expect(h.engine.progressSnapshot().sessions).toBe(before);
  });
});
