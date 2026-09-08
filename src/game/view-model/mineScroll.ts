/**
 * Pure vertical-scroll and tap-versus-drag model for the mine area.
 *
 * The mine content is taller than the region it is drawn through, so the
 * player reaches the lower floors by dragging or wheeling. All of that is
 * decided here, from pointer coordinates and one region, and the scene only
 * applies the resulting `scrollY` to the camera that clips the mine. Keeping it
 * renderer-free means the awkward part — telling a tap from a scroll — is
 * exercised in Node rather than only through a browser drag.
 *
 * Every function returns the state unchanged, by identity, when nothing about
 * it moved. Pointer moves arrive once a frame during a drag, and a scroll that
 * changed nothing must not cost a camera write or a republished diagnostic.
 */

import { regionContainsPoint, type LayoutRegion } from '../layout';

/**
 * Movement past this many logical pixels turns a press into a scroll.
 *
 * Small enough that a deliberate swipe is recognized almost immediately, large
 * enough to absorb the wobble of a thumb on a button. Crossing it scrolls by
 * the whole travel so far, including these first pixels: the alternative is to
 * re-anchor and lose them, and six pixels is below what the eye catches while
 * one-to-one tracking is not.
 */
export const MINE_SCROLL_DRAG_THRESHOLD_PX = 6;

/** One pointer, in the same logical coordinates the layout regions use. */
export interface MineScrollPointer {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

/** A pointer held down, with the anchor its travel is measured from. */
export interface MineScrollGesture {
  readonly pointerId: number;
  readonly originY: number;
  readonly originScrollY: number;
  /**
   * True when the press began over the mine, which is what makes it able to
   * scroll. A swipe that began on a fixed layer still counts as a swipe — it
   * just moves nothing.
   */
  readonly scrollsMine: boolean;
}

export interface MineScrollState {
  /** Screen-space region the mine content is drawn through. */
  readonly region: LayoutRegion;
  readonly contentHeight: number;
  readonly scrollY: number;
  readonly maxScrollY: number;
  readonly gesture: MineScrollGesture | null;
  /**
   * True once the live gesture has travelled past the drag threshold, and it
   * stays true until the next pointer-down.
   *
   * A control's press fires while the pointer is still up-ing, so the flag has
   * to outlive the gesture that set it: the release that ends a swipe must not
   * also buy the button underneath it. Every pointer-down that starts a
   * gesture clears it again, so the next press begins from a clean slate.
   */
  readonly hasDragged: boolean;
}

export interface MineScrollOptions {
  readonly region: LayoutRegion;
  readonly contentHeight: number;
}

/** The scroll state as a browser test reads it off the canvas. */
export interface MineScrollReadBack {
  readonly scrollY: number;
  readonly maxScrollY: number;
  readonly contentHeight: number;
  readonly viewportHeight: number;
  /** True while a pointer is down and has already become a scroll. */
  readonly isDragging: boolean;
  /** True while a press would be discarded as the tail of a scroll. */
  readonly isTapSuppressed: boolean;
}

export function createMineScrollState(
  options: MineScrollOptions,
): MineScrollState {
  const { region, contentHeight } = options;

  if (!Number.isFinite(contentHeight) || contentHeight < 0) {
    throw new Error('Mine content height must be a finite non-negative number.');
  }

  if (!Number.isFinite(region.height) || region.height <= 0) {
    throw new Error('Mine scroll region must have a finite positive height.');
  }

  return {
    region,
    contentHeight,
    scrollY: 0,
    // Content that already fits cannot scroll at all, rather than scrolling
    // backwards into empty space above it.
    maxScrollY: Math.max(0, contentHeight - region.height),
    gesture: null,
    hasDragged: false,
  };
}

/**
 * Changes the revealed mine depth while retaining the player's current place.
 * Unlocking floors 5 and 10 expands the content after the release that bought
 * them, so no live gesture needs to survive the resize.
 */
export function resizeMineScrollContent(
  state: MineScrollState,
  contentHeight: number,
): MineScrollState {
  const resized = createMineScrollState({
    region: state.region,
    contentHeight,
  });

  if (contentHeight === state.contentHeight) {
    return state;
  }

  return {
    ...resized,
    scrollY: clampScrollY(state.scrollY, resized.maxScrollY),
    hasDragged: state.hasDragged,
  };
}

/**
 * Starts tracking a pointer, and clears the previous gesture's tap suppression.
 *
 * Every press is tracked, not only one that landed on the mine, because the two
 * things a gesture decides are separate: whether the mine scrolls, which needs
 * the press to have started over it, and whether the release is still a tap,
 * which is about how far the pointer travelled wherever it began. A swipe that
 * starts on the surface strip and lifts on a floor's button is not a tap on
 * that button.
 *
 * A press arriving while another pointer is already down is ignored. Taking it
 * would hand the gesture to the new finger and drop every remaining move of
 * the one still swiping, freezing the mine mid-drag until that finger lifts
 * and presses again; it would also clear the tap suppression the live swipe
 * had already earned. The first finger down owns the gesture until it ends.
 */
export function beginMineScrollGesture(
  state: MineScrollState,
  pointer: MineScrollPointer,
): MineScrollState {
  if (state.gesture !== null && state.gesture.pointerId !== pointer.id) {
    return state;
  }

  return {
    ...state,
    gesture: {
      pointerId: pointer.id,
      originY: pointer.y,
      originScrollY: state.scrollY,
      scrollsMine: regionContainsPoint(state.region, pointer.x, pointer.y),
    },
    hasDragged: false,
  };
}

/**
 * Moves the mine with the pointer, once the pointer has earned it.
 *
 * Below the threshold nothing moves and nothing is suppressed: a press that
 * wobbles by a pixel or two must leave the screen exactly where the player
 * aimed and still buy what they aimed at. Horizontal position is deliberately
 * not checked — a drag that started in the mine keeps scrolling it however far
 * sideways the thumb wanders.
 */
export function dragMineScroll(
  state: MineScrollState,
  pointer: MineScrollPointer,
): MineScrollState {
  const { gesture } = state;

  if (gesture === null || gesture.pointerId !== pointer.id) {
    return state;
  }

  if (!Number.isFinite(pointer.y)) {
    return state;
  }

  // Dragging up pulls the content up, which is a larger scroll offset.
  const travelY = gesture.originY - pointer.y;
  const hasDragged =
    state.hasDragged || Math.abs(travelY) >= MINE_SCROLL_DRAG_THRESHOLD_PX;

  if (!hasDragged) {
    return state;
  }

  const scrollY = gesture.scrollsMine
    ? clampScrollY(gesture.originScrollY + travelY, state.maxScrollY)
    : state.scrollY;

  if (scrollY === state.scrollY && hasDragged === state.hasDragged) {
    return state;
  }

  return { ...state, scrollY, hasDragged };
}

/** Stops tracking the pointer, leaving any tap suppression in place. */
export function endMineScrollGesture(
  state: MineScrollState,
  pointerId: number,
): MineScrollState {
  if (state.gesture === null || state.gesture.pointerId !== pointerId) {
    return state;
  }

  return { ...state, gesture: null };
}

/**
 * Scrolls by a wheel delta over the mine.
 *
 * A wheel is never a press, so it leaves tap suppression alone: a notch of
 * scroll followed by a click is two separate intentions. The delta arrives in
 * host pixels rather than logical ones, which differ by the fitted canvas
 * scale; for a wheel that difference is not worth carrying the scale factor
 * into a pure module.
 */
export function scrollMineByWheel(
  state: MineScrollState,
  pointer: MineScrollPointer,
  deltaY: number,
): MineScrollState {
  if (!regionContainsPoint(state.region, pointer.x, pointer.y)) {
    return state;
  }

  if (!Number.isFinite(deltaY) || deltaY === 0) {
    return state;
  }

  const scrollY = clampScrollY(state.scrollY + deltaY, state.maxScrollY);

  if (scrollY === state.scrollY) {
    return state;
  }

  return { ...state, scrollY };
}

export function describeMineScroll(state: MineScrollState): MineScrollReadBack {
  return {
    scrollY: state.scrollY,
    maxScrollY: state.maxScrollY,
    contentHeight: state.contentHeight,
    viewportHeight: state.region.height,
    isDragging: state.gesture !== null && state.hasDragged,
    isTapSuppressed: state.hasDragged,
  };
}

function clampScrollY(value: number, maxScrollY: number): number {
  return Math.min(Math.max(value, 0), maxScrollY);
}
