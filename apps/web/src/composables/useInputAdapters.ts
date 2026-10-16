/**
 * Input adapters — SPEC.md §49, §55, §65, §66.
 *
 * Pointer events and the keyboard are reduced to `GameInput` here and nowhere else, so
 * Game Core never sees a browser event. Tap vs hold is decided *before* anything is sent:
 * a short press is one tap, a long press becomes a hold while the finger is still down.
 * That discrimination is what stops a tap from meaning "a sip and then another sip".
 */

import { isSustained } from '../phase';
import {
  TIMING,
  type GameEngine,
  type GameInput,
  type InputTarget,
  type GameStateView,
} from '@puffly/game-core';

export interface InputAdapter {
  attach(): void;
  detach(): void;
}

/** The browser gestures that compete with the scene: menus, drags and selection handles. */
const REFUSED_EVENTS = ['contextmenu', 'dragstart', 'selectstart'] as const;

/**
 * A game surface owns its gestures (SPEC.md §66): a right-click, a long press, a dragged
 * canvas or a selection handle is the browser answering instead of the scene. Refusing them
 * here keeps the whole app one surface, and keeps the refusal out of every component.
 *
 * The iOS text callout is the CSS half of the same rule — see `-webkit-touch-callout` in
 * `styles/global.css`.
 */
export function createSurfaceGuard(target: EventTarget = document): InputAdapter {
  const refuse = (event: Event): void => {
    event.preventDefault();
  };
  /**
   * A wheel over a range input changes *that input's value* in Chromium, so on a settings sheet that
   * is mostly slider rows the player's scroll lands on a row and the panel never moves — which reads
   * as "this menu cannot be scrolled" (#162, measured on the open sheet: the wheel's target was
   * `input.grow`, nothing was prevented, `scrollTop` stayed 0). The value still answers the wheel
   * when the player is actually on the control; otherwise the scroll is handed to the nearest box
   * that can scroll. Not passive: the default is replaced, not merely watched.
   */
  const handWheelToPanel = (event: Event): void => {
    const wheel = event as WheelEvent;
    const el = wheel.target;
    if (!(el instanceof HTMLInputElement) || el.type !== 'range' || el === document.activeElement)
      return;
    let panel: HTMLElement | null = el.parentElement;
    while (panel !== null && !/auto|scroll/.test(getComputedStyle(panel).overflowY)) {
      panel = panel.parentElement;
    }
    if (panel === null) return;
    wheel.preventDefault();
    panel.scrollTop += wheel.deltaY;
  };
  return {
    attach() {
      for (const type of REFUSED_EVENTS) target.addEventListener(type, refuse);
      target.addEventListener('wheel', handWheelToPanel, { passive: false });
    },
    detach() {
      for (const type of REFUSED_EVENTS) target.removeEventListener(type, refuse);
      target.removeEventListener('wheel', handWheelToPanel);
    },
  };
}

/**
 * A pinch is two fingers arriving apart and closing. The starting distance has to be wide
 * enough that resting a thumb on the glass is not one, and the close has to be most of the
 * way in before it counts.
 */
const PINCH_MIN_SPREAD_PX = 48;
const PINCH_CLOSE_RATIO = 0.62;

interface PressState {
  id: number;
  startedAtMs: number;
  start: { x: number; y: number };
  last: { x: number; y: number };
  holdSent: boolean;
  moved: boolean;
}

/** Stage box: the renderer letterboxes the stage, so raw canvas pixels must be mapped back. */
export function toStagePoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  viewport: {
    cssWidth: number;
    cssHeight: number;
    stage: { x: number; y: number; width: number; height: number };
  },
): { x: number; y: number } {
  const scaleX = viewport.cssWidth > 0 ? rect.width / viewport.cssWidth : 1;
  const scaleY = viewport.cssHeight > 0 ? rect.height / viewport.cssHeight : 1;
  const canvasX = (clientX - rect.left) / scaleX;
  const canvasY = (clientY - rect.top) / scaleY;
  return {
    x: (canvasX - viewport.stage.x) / Math.max(1, viewport.stage.width),
    y: (canvasY - viewport.stage.y) / Math.max(1, viewport.stage.height),
  };
}

/**
 * The same mapping run backwards: a stage point becomes a fraction of the canvas element itself.
 *
 * It lives next to `toStagePoint` because the two are one rule. Anything that has to aim at a prop
 * from outside the page (the browser layer, through `.stage[data-aim]`) reads via here, and a second
 * copy of the letterbox arithmetic would drift the first time the box moved.
 */
export function toCanvasFraction(
  nx: number,
  ny: number,
  viewport: {
    cssWidth: number;
    cssHeight: number;
    stage: { x: number; y: number; width: number; height: number };
  },
): { x: number; y: number } {
  return {
    x: (viewport.stage.x + nx * Math.max(1, viewport.stage.width)) / Math.max(1, viewport.cssWidth),
    y:
      (viewport.stage.y + ny * Math.max(1, viewport.stage.height)) /
      Math.max(1, viewport.cssHeight),
  };
}

const clampUnit = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export function createPointerAdapter(
  surface: HTMLElement,
  engine: GameEngine,
  readViewport: () => {
    cssWidth: number;
    cssHeight: number;
    stage: { x: number; y: number; width: number; height: number };
  },
): InputAdapter {
  let press: PressState | null = null;
  /**
   * The one armed hold timer, for the one live press. A mouse keeps the same `pointerId` for every
   * click, so an old timer cannot be told apart by id alone: without clearing it, a second press
   * that lands inside the first one's threshold is read as a hold the player never made.
   */
  let holdTimer = 0;
  /**
   * Fingers currently down, by pointer id. Consulted for one thing only: recognising the
   * close of two fingers on the cherry (§9 of the mobile brief). A single finger is
   * already `press` above, and nothing else in the game cares how many hands there are.
   */
  const fingers = new Map<number, { x: number; y: number }>();
  /** The distance the two fingers started at; 0 once a pinch has fired or lifted. */
  let spreadAt = 0;

  const send = (input: GameInput) => engine.send(input);

  /**
   * A finger is not a cursor and the core widens hit targets for one (§66) — so the
   * adapter has to say which it is. Reporting every touch as a mouse quietly cost a phone
   * its wider targets on every drag.
   */
  const sourceOf = (event: PointerEvent): 'touch' | 'mouse' =>
    event.pointerType === 'mouse' ? 'mouse' : 'touch';

  const onDown = (event: PointerEvent): void => {
    if (event.button !== undefined && event.button > 0) return;
    const point = toStagePoint(
      event.clientX,
      event.clientY,
      surface.getBoundingClientRect(),
      readViewport(),
    );
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (fingers.size === 2) {
      const [first, second] = [...fingers.values()];
      const start =
        first !== undefined && second !== undefined
          ? Math.hypot(first.x - second.x, first.y - second.y)
          : 0;
      // Two digits already touching are not a deliberate close on anything.
      spreadAt = start > PINCH_MIN_SPREAD_PX ? start : 0;
    }
    // A second finger does not take the rod away from the first. Without this the stray lands,
    // `press` is replaced, and the burning end jumps to whatever brushed the glass — while the
    // first finger's own lift is then swallowed by the id guard below. Fingers still records the
    // newcomer, because the pinch above has to see two digits to know about them.
    if (press !== null) return;
    press = {
      id: event.pointerId,
      startedAtMs: performance.now(),
      start: point,
      last: point,
      holdSent: false,
      moved: false,
    };
    // A capture the browser refuses (an id it no longer considers active) is not a reason to
    // lose the press: without it the pointer still reports its moves.
    try {
      surface.setPointerCapture?.(event.pointerId);
    } catch {
      /* uncaptured, and still playing */
    }
    // Long-press threshold: past it, the press *is* a hold and the app reacts while held.
    window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
      if (press && press.id === event.pointerId && !press.holdSent) {
        press.holdSent = true;
        send({
          type: 'hold',
          x: clampUnit(press.last.x),
          y: clampUnit(press.last.y),
          timestamp: engine.getState().nowMs,
          source: sourceOf(event),
        });
      }
    }, TIMING.tapMaxMs);
  };

  const onMove = (event: PointerEvent): void => {
    const live = fingers.get(event.pointerId);
    if (live) {
      live.x = event.clientX;
      live.y = event.clientY;
    }
    if (spreadAt > 0 && fingers.size >= 2) {
      const [first, second] = [...fingers.values()];
      if (first !== undefined && second !== undefined) {
        const spread = Math.hypot(first.x - second.x, first.y - second.y);
        if (spread < spreadAt * PINCH_CLOSE_RATIO) {
          const middle = toStagePoint(
            (first.x + second.x) / 2,
            (first.y + second.y) / 2,
            surface.getBoundingClientRect(),
            readViewport(),
          );
          spreadAt = 0;
          send({
            type: 'pinch',
            x: clampUnit(middle.x),
            y: clampUnit(middle.y),
            timestamp: engine.getState().nowMs,
            source: sourceOf(event),
          });
        }
      }
    }
    if (!press || press.id !== event.pointerId) return;
    const point = toStagePoint(
      event.clientX,
      event.clientY,
      surface.getBoundingClientRect(),
      readViewport(),
    );
    const travelled = Math.hypot(point.x - press.start.x, point.y - press.start.y);
    if (!press.holdSent && travelled > 0.02) {
      // A drag is a hold with motion; the rod must follow the finger from here on (§20).
      press.holdSent = true;
      press.moved = true;
      send({
        type: 'hold',
        x: clampUnit(point.x),
        y: clampUnit(point.y),
        timestamp: engine.getState().nowMs,
        source: sourceOf(event),
      });
    }
    if (press.holdSent) {
      if (travelled > 0.004) press.moved = true;
      send({
        type: 'drag',
        x: clampUnit(point.x),
        y: clampUnit(point.y),
        timestamp: engine.getState().nowMs,
        source: sourceOf(event),
      });
    }
    press.last = point;
  };

  const onUp = (event: PointerEvent): void => {
    // Lifted fingers leave the map whether or not one of them owned the rod: a stale entry would
    // make the next two-finger gesture read as a third finger still resting on the glass.
    fingers.delete(event.pointerId);
    if (fingers.size < 2) spreadAt = 0;
    if (!press || press.id !== event.pointerId) return;
    window.clearTimeout(holdTimer);
    const heldMs = performance.now() - press.startedAtMs;
    const point = toStagePoint(
      event.clientX,
      event.clientY,
      surface.getBoundingClientRect(),
      readViewport(),
    );
    const velocity = {
      vx: (point.x - press.start.x) / Math.max(0.05, heldMs / 1000),
      vy: (point.y - press.start.y) / Math.max(0.05, heldMs / 1000),
    };
    const speed = Math.hypot(velocity.vx, velocity.vy);

    if (!press.holdSent) {
      // Never reached the hold threshold: one input, and the rod sees a tap or a flick.
      send({
        type: press.moved && speed > 0.3 ? 'swipe' : 'tap',
        x: clampUnit(point.x),
        y: clampUnit(point.y),
        timestamp: engine.getState().nowMs,
        source: event.pointerType === 'touch' ? 'touch' : 'mouse',
        ...(press.moved ? { velocity } : {}),
      });
    } else if (press.moved && speed > 0.6) {
      // A flick out of a drag *is* the §20 gesture: swipe, and no separate release. Game Core
      // ends the drag when it sees a swipe, so sending both would be the same action twice.
      send({
        type: 'swipe',
        x: clampUnit(point.x),
        y: clampUnit(point.y),
        timestamp: engine.getState().nowMs,
        source: sourceOf(event),
        velocity,
      });
    } else {
      send({
        type: 'release',
        x: clampUnit(point.x),
        y: clampUnit(point.y),
        timestamp: engine.getState().nowMs,
        source: sourceOf(event),
      });
    }

    try {
      surface.releasePointerCapture?.(event.pointerId);
    } catch {
      /* nothing to give back */
    }
    press = null;
  };

  const onCancel = (event: PointerEvent): void => {
    fingers.delete(event.pointerId);
    spreadAt = 0;
    if (!press || press.id !== event.pointerId) return;
    window.clearTimeout(holdTimer);
    send({
      type: 'release',
      x: clampUnit(press.last.x),
      y: clampUnit(press.last.y),
      timestamp: engine.getState().nowMs,
      source: sourceOf(event),
    });
    press = null;
  };

  return {
    attach() {
      surface.addEventListener('pointerdown', onDown);
      surface.addEventListener('pointermove', onMove);
      surface.addEventListener('pointerup', onUp);
      surface.addEventListener('pointercancel', onCancel);
    },
    detach() {
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerup', onUp);
      surface.removeEventListener('pointercancel', onCancel);
      fingers.clear();
      spreadAt = 0;
      window.clearTimeout(holdTimer);
      press = null;
    },
  };
}

/**
 * Keyboard, mouse-only shells and future global shortcuts (SPEC.md §65, §67). The player is
 * never told these keys exist: the affordance the engine suggests is what the keys act on.
 */
export function createKeyboardAdapter(
  target: EventTarget,
  engine: GameEngine,
  affordanceTarget: () => InputTarget,
): InputAdapter {
  const keysDown = new Set<string>();
  /** Which keys are currently holding something, so their `keyup` releases and nothing else does. */
  const heldKeys = new Set<string>();

  const send = (
    type: GameInput['type'],
    aim: InputTarget,
    velocity?: { vx: number; vy: number },
  ) => {
    engine.send({
      type,
      x: 0,
      y: 0,
      timestamp: engine.getState().nowMs,
      target: aim,
      source: 'keyboard',
      ...(velocity ? { velocity } : {}),
    });
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    // A field or a button with the caret in it answers first; the game only hears the keys nobody
    // else is holding.
    if (yieldsToFocus(event)) return;
    const state: GameStateView = engine.getState();
    switch (event.key) {
      case ' ':
      case 'Enter': {
        event.preventDefault();
        keysDown.add(event.key);
        // Space is the sustained action and Enter the decisive tap, both aimed at what the engine
        // says the player is most likely about to do (§28). "Sustained" is not the keyboard's own
        // list to keep: `phase.ts` promises the pill and the keyboard never disagree about what
        // pressing means, and Game Core's hold has no row for the ash or for putting an out rod
        // away — so sending a hold at 磕灰 or 收烟 used to make the main key answer with nothing.
        const sustained = event.key === ' ' && isSustained(state.ui.affordance ?? 'none');
        if (sustained) heldKeys.add(event.key);
        send(sustained ? 'hold' : 'tap', affordanceTarget());
        break;
      }
      case 'Escape': {
        event.preventDefault();
        keysDown.add(event.key);
        // Escape always means "put it out", from any state (§65).
        if (state.cigarette.state === 'IDLE' || state.cigarette.state === 'PICKED_UP')
          send('tap', 'cigarette');
        else send('hold', 'ashtray');
        break;
      }
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        event.preventDefault();
        const stepX = event.key === 'ArrowLeft' ? -0.05 : event.key === 'ArrowRight' ? 0.05 : 0;
        const stepY = event.key === 'ArrowUp' ? -0.05 : event.key === 'ArrowDown' ? 0.05 : 0;
        const pivot = state.cigarette.pose.pivot;
        engine.send({
          type: 'drag',
          x: clampUnit(pivot.x + stepX),
          y: clampUnit(pivot.y + stepY),
          timestamp: state.nowMs,
          source: 'keyboard',
        });
        break;
      }
      case 'Tab': {
        // Cycling never blocks the game; the browser's own focus ring does the talking.
        break;
      }
      default:
        break;
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    if (!keysDown.delete(event.key)) return;
    // Only a key that actually started a hold may end one.
    if (event.key === ' ' && heldKeys.delete(' ')) send('release', affordanceTarget());
    if (event.key === 'Escape') send('release', 'ashtray');
  };

  const node = target;
  return {
    attach() {
      node.addEventListener('keydown', onKeyDown as EventListener);
      node.addEventListener('keyup', onKeyUp as EventListener);
    },
    detach() {
      node.removeEventListener('keydown', onKeyDown as EventListener);
      node.removeEventListener('keyup', onKeyUp as EventListener);
      keysDown.clear();
      heldKeys.clear();
    },
  };
}

/**
 * The keys are heard on `window`, so every one of them is borrowed unless the focus says otherwise.
 *
 * Without this the game swallows what a form field needs: space and Enter in the anchor's date input,
 * the arrows that move a date or a `select`, and — the one no test could see — Enter and Space on a
 * chrome button, which the keyboard user has just tabbed to. The button lights its own focus ring and
 * then does nothing, while the rod takes the draw instead.
 */
/** The focused node, when the event carries one. `window` and `document` own no keystroke. */
function elementOf(event: KeyboardEvent): Element | null {
  const { target } = event;
  return target instanceof Element ? target : null;
}

/**
 * True when the focused element owns this keystroke, so the game must not answer it — per key, not
 * per control, because the two things a focused element can be want different keys:
 *
 * - An `input` is a text entry (the anchor's date, a range slider), so it keeps every key the switch
 *   below handles: space and Enter would submit, the arrows are how a date and a slider move.
 * - A `button` keeps only Enter, which is how a keyboard user presses the thing they just tabbed to.
 *   Space stays the game's: §65 promises it means "breathe in", and a click has just focused a
 *   button, so yielding it would take the draw away from the player who is not looking at the chrome.
 *
 * The two tags are the whole set the app renders (measured: 33 `<button>`, 11 `<input>`, no textarea,
 * select or content surface). A third kind belongs here only once it exists.
 */
function yieldsToFocus(event: KeyboardEvent): boolean {
  const el = elementOf(event);
  if (el === null) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === 'INPUT') return true;
  if (tag === 'BUTTON') return event.key === 'Enter';
  return false;
}

/** Where each suggested affordance lives, so keyboard and touch hit the same thing (§66). */
export function targetForAffordance(state: GameStateView): InputTarget {
  switch (state.ui.affordance) {
    case 'lighter':
      return 'lighter';
    case 'flick':
      return 'ash';
    case 'extinguish':
    case 'discard':
      return 'ashtray';
    case 'puff':
      return 'cigarette';
    default:
      // Even with nothing suggested, the rod is the only object worth aiming at first: it is
      // what the player has to be holding before a lighter means anything (§0).
      return 'cigarette';
  }
}
