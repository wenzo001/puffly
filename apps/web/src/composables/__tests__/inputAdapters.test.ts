// @vitest-environment jsdom
/**
 * The shell's promise to the player: a tap is one action, a hold is another (§14, §49).
 *
 * This matters more than it looks. If a short press sent `hold` and then `tap`, tapping the rod
 * would draw a sip *and* queue a second sip, and tapping the lighter would start an ignition and
 * then cancel it. That discrimination happens here, before Game Core sees anything, so it is
 * tested here against a stand-in engine that records exactly what was sent.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMING } from '@puffly/game-core';
import type { GameEngine, GameInput } from '@puffly/game-core';
import {
  createKeyboardAdapter,
  createPointerAdapter,
  createSurfaceGuard,
  targetForAffordance,
} from '../useInputAdapters';

const VIEWPORT = () => ({
  cssWidth: 400,
  cssHeight: 600,
  stage: { x: 0, y: 0, width: 400, height: 600 },
});

interface PointerRig {
  sent: GameInput[];
  down(x?: number, y?: number): void;
  move(x: number, y: number): void;
  up(x?: number, y?: number): void;
  downAt(x: number, y: number, id: number, type?: string): void;
  moveAt(x: number, y: number, id: number, type?: string): void;
  upAt(x: number, y: number, id: number): void;
  cancel(): void;
  fireCancel(event: Event): void;
  dispose(): void;
}

/**
 * A canvas whose event listeners are captured, plus a clock the test controls. `performance.now`
 * is what the adapter measures press duration with, so a fake timer plus a mocked clock is what
 * makes "short press" and "long press" testable without waiting in real time.
 */
function pointerRig(nowMs = 1000): PointerRig {
  const sent: GameInput[] = [];
  const handlers = new Map<string, EventListener>();
  const engine = {
    send: (input: GameInput) => sent.push(input),
    getState: () => ({ nowMs }) as never,
  } as unknown as GameEngine;

  const canvas = {
    addEventListener: (type: string, handler: EventListener) => handlers.set(type, handler),
    removeEventListener: (type: string) => handlers.delete(type),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 600 }) as DOMRect,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  } as unknown as HTMLCanvasElement;

  const adapter = createPointerAdapter(canvas, engine, VIEWPORT);
  adapter.attach();

  const fire = (type: string, x: number, y: number, pointerId = 1, pointerType = 'touch'): void => {
    const event = new Event(type) as Event & Record<string, unknown>;
    Object.assign(event, { pointerId, button: 0, pointerType, clientX: x, clientY: y });
    handlers.get(type)?.(event);
  };

  return {
    sent,
    down: (x = 200, y = 300) => fire('pointerdown', x, y),
    move: (x, y) => fire('pointermove', x, y),
    up: (x = 200, y = 300) => fire('pointerup', x, y),
    downAt: (x, y, id, pointerType = 'touch') => fire('pointerdown', x, y, id, pointerType),
    moveAt: (x, y, id, pointerType = 'touch') => fire('pointermove', x, y, id, pointerType),
    upAt: (x, y, id) => fire('pointerup', x, y, id),
    cancel: () => fire('pointercancel', 200, 300),
    fireCancel: (event: Event) => handlers.get('pointercancel')?.(event as never),
    dispose: () => adapter.detach(),
  };
}

let clock = 0;

beforeEach(() => {
  vi.useFakeTimers();
  clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('pointer → GameInput (§49)', () => {
  it('a finger drag is reported as a finger, so it keeps its wider target (§66)', () => {
    const rig = pointerRig();
    rig.downAt(100, 300, 1);
    rig.moveAt(150, 320, 1);
    expect(rig.sent.map((input) => input.source)).toEqual(['touch', 'touch']);
    rig.dispose();
  });

  it('two fingers closing send one pinch, aimed between them', () => {
    const rig = pointerRig();
    rig.downAt(180, 280, 1);
    rig.downAt(220, 320, 2);
    rig.moveAt(196, 296, 2);
    const pinches = rig.sent.filter((input) => input.type === 'pinch');
    expect(pinches).toHaveLength(1);
    expect(pinches[0]?.x).toBeCloseTo(0.47, 2);
    expect(pinches[0]?.y).toBeCloseTo(0.48, 2);
    // One gesture, one pinch: it does not fire again on every pixel of the close.
    rig.moveAt(190, 290, 2);
    expect(rig.sent.filter((input) => input.type === 'pinch')).toHaveLength(1);
    rig.dispose();
  });

  it('two fingers that do not close are not a pinch', () => {
    const rig = pointerRig();
    rig.downAt(150, 300, 1);
    rig.downAt(250, 300, 2);
    rig.moveAt(270, 300, 2);
    expect(rig.sent.filter((input) => input.type === 'pinch')).toHaveLength(0);
    rig.dispose();
  });

  it('a thumb resting beside a finger is not a pinch, and lifting disarms the close', () => {
    const rig = pointerRig();
    rig.downAt(150, 300, 1);
    rig.downAt(160, 305, 2);
    rig.moveAt(152, 301, 2);
    expect(rig.sent.filter((input) => input.type === 'pinch')).toHaveLength(0);

    // Lift the stray finger. A real close afterwards still counts: disarming is not a lockout.
    rig.upAt(160, 305, 2);
    rig.downAt(260, 300, 3);
    rig.moveAt(200, 300, 3);
    expect(rig.sent.filter((input) => input.type === 'pinch')).toHaveLength(1);
    rig.dispose();
  });

  it('a cancelled stray finger leaves no ghost on the glass', () => {
    // The mirror of the thumb case, arrived at by `pointercancel` instead of `pointerup`: the
    // interrupted finger is not the one holding the rod, and a bookkeeping skip there would make
    // every later pinch count three digits and never fire.
    const rig = pointerRig();
    rig.downAt(150, 300, 1);
    rig.downAt(160, 305, 2);
    rig.moveAt(152, 301, 2);
    expect(rig.sent.filter((input) => input.type === 'pinch')).toHaveLength(0);

    const stray = new Event('pointercancel') as Event & Record<string, unknown>;
    Object.assign(stray, {
      pointerId: 2,
      button: 0,
      pointerType: 'touch',
      clientX: 160,
      clientY: 305,
    });
    rig.fireCancel(stray);

    rig.downAt(260, 300, 3);
    rig.moveAt(200, 300, 3);
    expect(rig.sent.filter((input) => input.type === 'pinch')).toHaveLength(1);
    rig.dispose();
  });

  it('a quick press is exactly one tap, and never also a hold', () => {
    const rig = pointerRig();
    rig.down();
    clock += 60;
    rig.up();
    expect(rig.sent.map((input) => input.type)).toEqual(['tap']);
    rig.dispose();
  });

  it('a long press becomes a hold while the finger is still down, then one release', () => {
    const rig = pointerRig();
    rig.down();
    vi.advanceTimersByTime(200);
    expect(rig.sent.map((input) => input.type)).toEqual(['hold']);

    clock += 900;
    rig.up();
    expect(rig.sent.map((input) => input.type)).toEqual(['hold', 'release']);
    rig.dispose();
  });

  it('a second mouse press does not inherit the first press hold timer', () => {
    // A mouse reports the same `pointerId` for every click, so the timer's own id check cannot tell
    // this press from the previous one: lifted and re-pressed inside the first press's threshold, the
    // second click used to be read as a hold the player never made.
    const rig = pointerRig();
    rig.downAt(100, 300, 1, 'mouse');
    vi.advanceTimersByTime(10);
    rig.upAt(100, 300, 1);
    rig.downAt(100, 300, 1, 'mouse');
    // 140 ms into this press: the *previous* press's deadline has passed, this one's has not.
    vi.advanceTimersByTime(TIMING.tapMaxMs - 10);
    expect(rig.sent.map((input) => input.type)).toEqual(['tap']);
    rig.upAt(100, 300, 1);
    expect(rig.sent.map((input) => input.type)).toEqual(['tap', 'tap']);
    rig.dispose();
  });

  it('a cancelled press does not stay armed over the next one', () => {
    const rig = pointerRig();
    rig.downAt(100, 300, 1, 'mouse');
    vi.advanceTimersByTime(10);
    rig.cancel();
    rig.downAt(100, 300, 1, 'mouse');
    vi.advanceTimersByTime(TIMING.tapMaxMs - 10);
    expect(rig.sent.map((input) => input.type)).toEqual(['release']);
    rig.dispose();
  });

  it('a slow drag releases, and is never reported as a flick too', () => {
    const rig = pointerRig();
    rig.down(100, 300);
    rig.move(140, 300);
    clock += 800;
    rig.up(140, 300);
    expect(rig.sent.map((input) => input.type)).toEqual(['hold', 'drag', 'release']);
    rig.dispose();
  });

  it('a fast flick out of a drag is one swipe, with velocity — not a swipe and a release (§20)', () => {
    const rig = pointerRig();
    rig.down(100, 300);
    rig.move(260, 300);
    clock += 60;
    rig.up(340, 300);

    expect(rig.sent.map((input) => input.type)).toEqual(['hold', 'drag', 'swipe']);
    const swipe = rig.sent.find((input) => input.type === 'swipe');
    expect(swipe?.velocity?.vx).toBeGreaterThan(0.5);
    rig.dispose();
  });

  it('ignores a second pointer, so two fingers cannot fight over the rod', () => {
    // The name of this case used to promise more than it measured: it fired one pointer and counted
    // a tap, which also passes on a code base where a stray finger steals the rod. What the player
    // would feel is that — a thumb brushing the glass mid-drag makes the burning end jump to it.
    const rig = pointerRig();
    rig.downAt(100, 300, 1);
    vi.advanceTimersByTime(200);
    expect(rig.sent.map((input) => input.type)).toEqual(['hold']);

    rig.downAt(300, 300, 2);
    vi.advanceTimersByTime(200);
    rig.moveAt(320, 300, 2);

    // Every movement the scene was told about is still finger 1's: x 100 of 400 is 0.25, and the
    // stray sits at 0.75. A takeover shows up here as a drag nobody aimed.
    const aimed = rig.sent.filter((input) => input.type === 'hold' || input.type === 'drag');
    expect(aimed.map((input) => Number(input.x.toFixed(2)))).toEqual(aimed.map(() => 0.25));

    // The stray lifting is not the draw ending: finger 1 still owns the rod and still gets released.
    rig.upAt(300, 300, 2);
    expect(rig.sent.map((input) => input.type)).toEqual(['hold']);
    rig.moveAt(140, 300, 1);
    expect(rig.sent.at(-1)?.type).toBe('drag');
    expect(Number(rig.sent.at(-1)?.x.toFixed(2))).toBe(0.35);
    rig.upAt(100, 300, 1);
    expect(rig.sent.at(-1)?.type).toBe('release');
    rig.dispose();
  });

  it('clamps a pointer outside the stage instead of sending NaN', () => {
    const rig = pointerRig();
    rig.down(0, 0);
    rig.move(-500, 4000);
    clock += 60;
    rig.up(-500, 4000);

    expect(rig.sent.length).toBeGreaterThan(1);
    for (const input of rig.sent) {
      expect(Number.isFinite(input.x)).toBe(true);
      expect(Number.isFinite(input.y)).toBe(true);
      expect(input.x).toBeGreaterThanOrEqual(0);
      expect(input.x).toBeLessThanOrEqual(1);
      expect(input.y).toBeGreaterThanOrEqual(0);
      expect(input.y).toBeLessThanOrEqual(1);
    }
    rig.dispose();
  });

  it('stays silent after detach', () => {
    const rig = pointerRig();
    rig.dispose();
    rig.down();
    rig.up();
    expect(rig.sent).toEqual([]);
  });
});

describe('keyboard → GameInput (§65)', () => {
  function keyRig(affordance: string, cigaretteState = 'BURNING') {
    const sent: GameInput[] = [];
    const engine = {
      send: (input: GameInput) => sent.push(input),
      getState: () =>
        ({
          nowMs: 500,
          ui: { affordance },
          cigarette: { state: cigaretteState, pose: { pivot: { x: 0.5, y: 0.6 } } },
        }) as never,
    } as unknown as GameEngine;
    const target = new EventTarget();
    const adapter = createKeyboardAdapter(target, engine, () =>
      targetForAffordance(engine.getState()),
    );
    adapter.attach();
    return { sent, target, adapter };
  }

  it('space is a hold while down and a release when up', () => {
    const rig = keyRig('puff');
    rig.target.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    rig.target.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));

    expect(rig.sent.map((input) => input.type)).toEqual(['hold', 'release']);
    expect(rig.sent[0]?.source).toBe('keyboard');
    expect(rig.sent[0]?.target).toBe('cigarette');
    rig.adapter.detach();
  });

  /**
   * The keys are heard on `window`, so "who is focused" is the whole question. This fires a real
   * KeyboardEvent whose `target` is a stand-in control, which is exactly what the browser does when
   * the caret or the focus ring is inside a form field.
   */
  function keyOver(
    rig: { target: EventTarget; sent: GameInput[] },
    key: string,
    control: Element | null,
  ) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    if (control !== null) {
      Object.defineProperty(event, 'target', { value: control, configurable: true });
    }
    const spy = vi.spyOn(event, 'preventDefault');
    rig.target.dispatchEvent(event);
    return spy;
  }

  // Real nodes, not stand-ins: the question is what the browser actually has focused. These two are
  // the whole list of controls the app renders.
  const dateField = document.createElement('input');
  dateField.type = 'date';
  const pill = document.createElement('button');
  const stage = document.createElement('div');
  stage.className = 'hit';
  stage.setAttribute('tabindex', '0');

  it('yields space, Enter and the arrows to the control that actually has focus', () => {
    const cases: readonly [string, Element][] = [
      [' ', dateField],
      ['Enter', dateField],
      ['Enter', pill],
      ['ArrowLeft', dateField],
      ['Escape', dateField],
    ];
    for (const [key, control] of cases) {
      const rig = keyRig('puff');
      const prevented = keyOver(rig, key, control);
      expect(
        rig.sent,
        `focus was in <${control.tagName.toLowerCase()}>, so "${key}" is that control's key`,
      ).toEqual([]);
      expect(prevented, `"${key}" belongs to the focused control`).not.toHaveBeenCalled();
      rig.adapter.detach();
    }
  });

  it('keeps Space as the draw even when a button holds the focus', () => {
    // A click focuses the button it pressed, so this is the ordinary desktop state after touching
    // the pill. §65's sustained action cannot be handed to the chrome for the rest of the session.
    const rig = keyRig('puff');
    const prevented = keyOver(rig, ' ', pill);
    expect(rig.sent.map((input) => input.type)).toEqual(['hold']);
    expect(prevented).toHaveBeenCalled();
    rig.adapter.detach();
  });

  it('still owns the same keys while focus is the stage or nothing', () => {
    const rig = keyRig('puff');
    keyOver(rig, ' ', stage);
    expect(rig.sent.map((input2) => input2.type)).toEqual(['hold']);
    keyOver(rig, 'Enter', null);
    expect(rig.sent.map((input2) => input2.type)).toEqual(['hold', 'tap']);
    rig.adapter.detach();
  });

  it('auto-repeat from a held key does not stack into extra puffs', () => {
    const rig = keyRig('puff');
    rig.target.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    rig.target.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true }));
    rig.target.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true }));

    expect(rig.sent.length).toBe(1);
    rig.adapter.detach();
  });

  it('enter taps what the engine suggests; escape always means put it out', () => {
    const rig = keyRig('flick');
    rig.target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    rig.target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    rig.target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));

    expect(rig.sent.map((input) => `${input.type}:${input.target}`)).toEqual([
      'tap:ash',
      'hold:ashtray',
      'release:ashtray',
    ]);
    rig.adapter.detach();
  });

  it('arrows nudge the rod by a fixed, finite amount', () => {
    const rig = keyRig('puff');
    rig.target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));

    const drag = rig.sent[0];
    expect(drag?.type).toBe('drag');
    expect(Number.isFinite(drag?.x)).toBe(true);
    expect(drag?.x).toBeGreaterThan(0.5);
    rig.adapter.detach();
  });
});

describe('affordance targeting (§66)', () => {
  const state = (affordance: string, cigarette = 'BURNING') =>
    ({ ui: { affordance }, cigarette: { state: cigarette } }) as never;

  it('routes each suggestion to the anchor a touch user would hit', () => {
    expect(targetForAffordance(state('lighter'))).toBe('lighter');
    expect(targetForAffordance(state('flick'))).toBe('ash');
    expect(targetForAffordance(state('extinguish'))).toBe('ashtray');
    expect(targetForAffordance(state('discard'))).toBe('ashtray');
    expect(targetForAffordance(state('puff'))).toBe('cigarette');
  });

  it('with nothing suggested, the rod is still the only thing worth touching', () => {
    expect(targetForAffordance(state('none', 'IDLE'))).toBe('cigarette');
    expect(targetForAffordance(state('none', 'DISCARDED'))).toBe('cigarette');
  });
});

describe('the surface refuses the browser’s own gestures (§66)', () => {
  for (const type of ['contextmenu', 'dragstart', 'selectstart']) {
    it(`${type} is prevented while the guard is attached`, () => {
      const guard = createSurfaceGuard(document);
      guard.attach();
      const held = new Event(type, { bubbles: true, cancelable: true });
      document.body.dispatchEvent(held);
      expect(held.defaultPrevented).toBe(true);

      // The refusal is the guard's, not a permanent change to the page: detached, the default stands.
      guard.detach();
      const free = new Event(type, { bubbles: true, cancelable: true });
      document.body.dispatchEvent(free);
      expect(free.defaultPrevented).toBe(false);
    });
  }
});
