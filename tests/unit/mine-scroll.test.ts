import { describe, expect, it } from 'vitest';

import {
  calculateMineContentHeight,
  calculateMineLayout,
  type LayoutRegion,
} from '../../src/game/layout';
import {
  beginMineScrollGesture,
  createMineScrollState,
  describeMineScroll,
  dragMineScroll,
  endMineScrollGesture,
  resizeMineScrollContent,
  scrollMineByWheel,
  MINE_SCROLL_DRAG_THRESHOLD_PX,
  type MineScrollPointer,
  type MineScrollState,
} from '../../src/game/view-model';

const MINE_REGION: LayoutRegion = calculateMineLayout().mine;
/** Above the drag threshold, so a single move is unambiguously a scroll. */
const LONG_DRAG_PX = MINE_SCROLL_DRAG_THRESHOLD_PX + 40;

/** The initial five-floor group, which is taller than the region drawing it. */
function createState(
  overrides: Partial<{ region: LayoutRegion; contentHeight: number }> = {},
): MineScrollState {
  return createMineScrollState({
    region: overrides.region ?? MINE_REGION,
    contentHeight: overrides.contentHeight ?? calculateMineContentHeight(),
  });
}

/** A pointer over the middle of the mine at the given height. */
function pointerAt(y: number, id = 0): MineScrollPointer {
  return { id, x: MINE_REGION.x + MINE_REGION.width / 2, y };
}

/** Presses at `fromY`, drags to `toY`, and releases. */
function drag(
  state: MineScrollState,
  fromY: number,
  toY: number,
  id = 0,
): MineScrollState {
  const pressed = beginMineScrollGesture(state, pointerAt(fromY, id));
  const dragged = dragMineScroll(pressed, pointerAt(toY, id));

  return endMineScrollGesture(dragged, id);
}

describe('mine scroll range', () => {
  it('can scroll exactly the content that does not fit the region', () => {
    const state = createState();

    expect(state.scrollY).toBe(0);
    expect(state.maxScrollY).toBe(
      calculateMineContentHeight() - MINE_REGION.height,
    );
    expect(state.maxScrollY).toBeGreaterThan(0);
  });

  it('does not scroll content that already fits', () => {
    const state = createState({ contentHeight: MINE_REGION.height - 1 });

    expect(state.maxScrollY).toBe(0);
    expect(drag(state, 400, 200).scrollY).toBe(0);
  });

  it('preserves position when a newly revealed floor group expands the mine', () => {
    const fiveFloors = createState({ contentHeight: calculateMineContentHeight(5) });
    const scrolled = drag(fiveFloors, 400, 300);
    const tenFloors = resizeMineScrollContent(
      scrolled,
      calculateMineContentHeight(10),
    );

    expect(tenFloors.scrollY).toBe(scrolled.scrollY);
    expect(tenFloors.maxScrollY).toBeGreaterThan(scrolled.maxScrollY);
    expect(tenFloors.contentHeight).toBe(calculateMineContentHeight(10));
  });

  it('rejects a region or content size it could not scroll', () => {
    expect(() => createState({ contentHeight: -1 })).toThrow(
      /content height must be a finite non-negative number/,
    );
    expect(() =>
      createState({ region: { ...MINE_REGION, height: 0 } }),
    ).toThrow(/must have a finite positive height/);
  });
});

describe('drag scrolling', () => {
  it('moves the content with the pointer, one pixel per pixel', () => {
    const state = createState();
    const scrolled = drag(state, 400, 400 - LONG_DRAG_PX);

    expect(scrolled.scrollY).toBe(LONG_DRAG_PX);

    // Dragging back down returns exactly what dragging up took.
    const restored = drag(scrolled, 300, 300 + LONG_DRAG_PX);

    expect(restored.scrollY).toBe(0);
  });

  it('clamps at the top and the bottom of the mine', () => {
    const state = createState();
    const startY = MINE_REGION.y + MINE_REGION.height - 10;
    const atBottom = drag(state, startY, startY - state.maxScrollY * 4);

    expect(atBottom.scrollY).toBe(state.maxScrollY);
    expect(drag(atBottom, 300, 300 + state.maxScrollY * 4).scrollY).toBe(0);
  });

  it('ignores movement below the drag threshold', () => {
    const state = createState();
    const pressed = beginMineScrollGesture(state, pointerAt(400));
    const jittered = dragMineScroll(
      pressed,
      pointerAt(400 - (MINE_SCROLL_DRAG_THRESHOLD_PX - 1)),
    );

    // Identity, not merely an equal value: an unchanged scroll must not cost a
    // camera write on every frame of a held press.
    expect(jittered).toBe(pressed);
    expect(jittered.scrollY).toBe(0);
    expect(jittered.hasDragged).toBe(false);
  });

  it('scrolls the whole travel once the threshold is crossed', () => {
    const state = createState();
    const pressed = beginMineScrollGesture(state, pointerAt(400));
    const dragged = dragMineScroll(
      pressed,
      pointerAt(400 - MINE_SCROLL_DRAG_THRESHOLD_PX),
    );

    expect(dragged.scrollY).toBe(MINE_SCROLL_DRAG_THRESHOLD_PX);
    expect(dragged.hasDragged).toBe(true);
  });

  it('keeps following a pointer that wanders outside the mine', () => {
    const state = createState();
    const pressed = beginMineScrollGesture(state, pointerAt(400));
    const dragged = dragMineScroll(pressed, {
      id: 0,
      // Above the mine region and off its left edge, which a thumb crossing the
      // surface strip mid-swipe does routinely.
      x: -20,
      y: 400 - LONG_DRAG_PX,
    });

    expect(dragged.scrollY).toBe(LONG_DRAG_PX);
  });

  it('scrolls nothing from a swipe that began on a fixed layer', () => {
    const state = createState();
    const pressed = beginMineScrollGesture(state, {
      id: 0,
      x: 180,
      y: MINE_REGION.y - 1,
    });
    const swiped = dragMineScroll(pressed, pointerAt(MINE_REGION.y + 200));

    expect(swiped.scrollY).toBe(0);
    // It is still a swipe, so the release that ends it over a floor's button
    // is not a tap on that button.
    expect(swiped.hasDragged).toBe(true);
  });

  it('ignores a second finger that did not start the gesture', () => {
    const state = createState();
    const pressed = beginMineScrollGesture(state, pointerAt(400, 0));
    const other = dragMineScroll(pressed, pointerAt(400 - LONG_DRAG_PX, 1));

    expect(other).toBe(pressed);
    expect(endMineScrollGesture(pressed, 1)).toBe(pressed);
  });

  it('keeps following the first finger when a second one taps', () => {
    // A second pointer used to take the gesture over: the finger still
    // swiping had every remaining move dropped, and its lift ended nothing,
    // so the mine froze mid-drag until it was raised and pressed again.
    const state = createState();
    const pressed = beginMineScrollGesture(state, pointerAt(400, 0));
    const dragged = dragMineScroll(pressed, pointerAt(400 - LONG_DRAG_PX, 0));
    const tapped = beginMineScrollGesture(dragged, pointerAt(300, 1));

    expect(tapped).toBe(dragged);
    expect(tapped.gesture?.pointerId).toBe(0);
    // The live swipe keeps its tap suppression, so the second finger's
    // release cannot buy the button it happens to be over.
    expect(tapped.hasDragged).toBe(true);

    // The first finger still owns the scroll, and still ends it.
    const moved = dragMineScroll(
      endMineScrollGesture(tapped, 1),
      pointerAt(400 - LONG_DRAG_PX * 2, 0),
    );

    expect(moved.scrollY).toBe(LONG_DRAG_PX * 2);
    expect(endMineScrollGesture(moved, 0).gesture).toBeNull();
  });

  it('ignores a move with no gesture and a non-finite position', () => {
    const state = createState();

    expect(dragMineScroll(state, pointerAt(400))).toBe(state);
    expect(
      dragMineScroll(
        beginMineScrollGesture(state, pointerAt(400)),
        pointerAt(Number.NaN),
      ).scrollY,
    ).toBe(0);
  });
});

describe('tap suppression', () => {
  it('suppresses the press that ends a scroll', () => {
    const state = createState();
    const pressed = beginMineScrollGesture(state, pointerAt(400));
    const dragged = dragMineScroll(pressed, pointerAt(400 - LONG_DRAG_PX));

    expect(dragged.hasDragged).toBe(true);
    // A control's press fires while the pointer is coming up, so the flag has
    // to survive the release that raised it.
    expect(endMineScrollGesture(dragged, 0).hasDragged).toBe(true);
  });

  it('accepts a press that never became a drag', () => {
    const state = createState();
    const tapped = drag(state, 400, 400 - (MINE_SCROLL_DRAG_THRESHOLD_PX - 1));

    expect(tapped.hasDragged).toBe(false);
    expect(tapped.scrollY).toBe(0);
  });

  it('clears the suppression on the next press, wherever it lands', () => {
    const scrolled = drag(createState(), 400, 400 - LONG_DRAG_PX);

    expect(scrolled.hasDragged).toBe(true);
    expect(beginMineScrollGesture(scrolled, pointerAt(400)).hasDragged).toBe(
      false,
    );
    // A press on a fixed surface control scrolls nothing, but must still not
    // inherit the suppression from the last drag in the mine.
    expect(
      beginMineScrollGesture(scrolled, { id: 0, x: 180, y: MINE_REGION.y - 1 })
        .hasDragged,
    ).toBe(false);
  });

  it('suppresses a tap after a swipe that scrolled nothing', () => {
    // Content that already fits cannot move, but a swipe across it is still a
    // swipe rather than a press on whatever it ended over.
    const state = createState({ contentHeight: MINE_REGION.height - 1 });
    const swiped = drag(state, 400, 400 - LONG_DRAG_PX);

    expect(swiped.scrollY).toBe(0);
    expect(swiped.hasDragged).toBe(true);
  });

  it('leaves a press alone after a wheel', () => {
    const state = createState();
    const wheeled = scrollMineByWheel(state, pointerAt(400), 40);

    expect(wheeled.scrollY).toBe(40);
    expect(wheeled.hasDragged).toBe(false);
  });
});

describe('wheel scrolling', () => {
  it('scrolls down on a positive delta and clamps at both ends', () => {
    const state = createState();
    const down = scrollMineByWheel(state, pointerAt(400), state.maxScrollY * 4);

    expect(down.scrollY).toBe(state.maxScrollY);
    expect(scrollMineByWheel(down, pointerAt(400), -state.maxScrollY * 4).scrollY).toBe(
      0,
    );
  });

  it('ignores a wheel outside the mine, so the fixed layers never scroll it', () => {
    const state = createState();

    expect(
      scrollMineByWheel(state, { id: 0, x: 180, y: MINE_REGION.y - 1 }, 120),
    ).toBe(state);
  });

  it('ignores an empty or invalid delta', () => {
    const state = createState();

    expect(scrollMineByWheel(state, pointerAt(400), 0)).toBe(state);
    expect(scrollMineByWheel(state, pointerAt(400), Number.NaN)).toBe(state);
    // Already at the top: a further scroll up changes nothing.
    expect(scrollMineByWheel(state, pointerAt(400), -50)).toBe(state);
  });
});

describe('scroll read-back', () => {
  it('reports what the browser test needs to see', () => {
    const state = createState();
    const pressed = beginMineScrollGesture(state, pointerAt(400));
    const dragged = dragMineScroll(pressed, pointerAt(400 - LONG_DRAG_PX));

    expect(describeMineScroll(state)).toEqual({
      scrollY: 0,
      maxScrollY: state.maxScrollY,
      contentHeight: calculateMineContentHeight(),
      viewportHeight: MINE_REGION.height,
      isDragging: false,
      isTapSuppressed: false,
    });
    expect(describeMineScroll(dragged).isDragging).toBe(true);
    // The gesture is over, but the press it ends is still not a tap.
    expect(describeMineScroll(endMineScrollGesture(dragged, 0))).toMatchObject({
      scrollY: LONG_DRAG_PX,
      isDragging: false,
      isTapSuppressed: true,
    });
  });
});
