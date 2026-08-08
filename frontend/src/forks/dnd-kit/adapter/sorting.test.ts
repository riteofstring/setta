import { describe, expect, it } from "vitest";
import {
  computeNewIndex,
  getSortedRects,
  horizontalListSortingStrategy,
  isValidIndex,
  itemsEqual,
  normalizeDisabled,
  rectSortingStrategy,
  resolveStrategyResult,
  verticalListSortingStrategy,
} from "./sorting";
import type { ClientRect } from "./types";

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): ClientRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

describe("sorting adapter utilities", () => {
  it("treats identical item arrays as equal", () => {
    // Validates the fast-path and element-by-element comparison behavior.
    const items = ["a", "b", "c"];
    expect(itemsEqual(items, items)).toBe(true);
    expect(itemsEqual(["a", "b"], ["a", "b"])).toBe(true);
    expect(itemsEqual(["a", "b"], ["b", "a"])).toBe(false);
    expect(itemsEqual(["a"], ["a", "b"])).toBe(false);
  });

  it("accepts only non-negative indexes", () => {
    // Validates the index guard used by sortable bookkeeping.
    expect(isValidIndex(0)).toBe(true);
    expect(isValidIndex(3)).toBe(true);
    expect(isValidIndex(-1)).toBe(false);
    expect(isValidIndex(null)).toBe(false);
  });

  it("normalizes boolean disabled values to object shape", () => {
    // Validates boolean inputs expand into draggable/droppable flags.
    expect(normalizeDisabled(true)).toEqual({
      draggable: true,
      droppable: true,
    });
    expect(normalizeDisabled(false)).toEqual({
      draggable: false,
      droppable: false,
    });

    const explicit = { draggable: true, droppable: false };
    expect(normalizeDisabled(explicit)).toBe(explicit);
  });

  it("resolves rects in item order", () => {
    // Validates that sparse maps still align rects to item indices.
    const rects = new Map<string, ClientRect>([
      ["b", rect(0, 20, 20, 10)],
      ["a", rect(0, 0, 20, 10)],
    ]);

    expect(getSortedRects(["a", "b", "c"], rects)).toEqual([
      rect(0, 0, 20, 10),
      rect(0, 20, 20, 10),
      undefined,
    ]);
  });

  it("computes stable destination indexes at list boundaries", () => {
    // Validates edge behavior for first and last active items.
    expect(computeNewIndex(0, 0, false, 3)).toBe(0);
    expect(computeNewIndex(0, 2, false, 3)).toBe(1);
    expect(computeNewIndex(0, 2, true, 3)).toBe(2);

    expect(computeNewIndex(3, 3, true, 3)).toBe(3);
    expect(computeNewIndex(3, 1, false, 3)).toBe(1);
    expect(computeNewIndex(3, 1, true, 3)).toBe(2);
  });

  it("computes destination indexes for middle items", () => {
    // Validates midpoint logic when moving upward or downward.
    expect(computeNewIndex(2, 0, false, 5)).toBe(0);
    expect(computeNewIndex(2, 0, true, 5)).toBe(1);

    expect(computeNewIndex(2, 4, false, 5)).toBe(3);
    expect(computeNewIndex(2, 4, true, 5)).toBe(4);

    expect(computeNewIndex(2, 2, false, 5)).toBe(2);
  });

  it("builds rect-based transforms for layout sorting", () => {
    // Validates transform deltas are derived from moved rect positions.
    const rects = [rect(0, 0, 10, 10), rect(20, 0, 10, 10)];

    expect(
      rectSortingStrategy({
        rects,
        activeIndex: 0,
        overIndex: 1,
        index: 0,
      }),
    ).toEqual({ x: 20, y: 0, scaleX: 1, scaleY: 1 });

    expect(
      rectSortingStrategy({
        rects,
        activeIndex: 0,
        overIndex: 1,
        index: 5,
      }),
    ).toBeNull();
  });

  it("calculates vertical transforms and effective over index", () => {
    // Validates vertical list movement math and over-index adjustment.
    const rects = [
      rect(0, 0, 100, 10),
      rect(0, 20, 100, 10),
      rect(0, 40, 100, 10),
    ];

    const [activeTransform, overIndex] = verticalListSortingStrategy({
      rects,
      activeIndex: 0,
      overIndex: 1,
      index: 0,
      pastHalfway: true,
    });

    expect(overIndex).toBe(1);
    expect(activeTransform).toEqual({ x: 0, y: 20, scaleX: 1, scaleY: 1 });

    const [siblingTransform] = verticalListSortingStrategy({
      rects,
      activeIndex: 0,
      overIndex: 1,
      index: 1,
      pastHalfway: true,
    });
    expect(siblingTransform).toEqual({ x: 0, y: -20, scaleX: 1, scaleY: 1 });
  });

  it("calculates horizontal transforms and effective over index", () => {
    // Validates horizontal list movement math and over-index adjustment.
    const rects = [
      rect(0, 0, 10, 100),
      rect(20, 0, 10, 100),
      rect(40, 0, 10, 100),
    ];

    const [activeTransform, overIndex] = horizontalListSortingStrategy({
      rects,
      activeIndex: 0,
      overIndex: 1,
      index: 0,
      pastHalfway: true,
    });

    expect(overIndex).toBe(1);
    expect(activeTransform).toEqual({ x: 20, y: 0, scaleX: 1, scaleY: 1 });

    const [siblingTransform] = horizontalListSortingStrategy({
      rects,
      activeIndex: 0,
      overIndex: 1,
      index: 1,
      pastHalfway: true,
    });
    expect(siblingTransform).toEqual({ x: -20, y: 0, scaleX: 1, scaleY: 1 });
  });

  it("normalizes strategy results for callers", () => {
    // Validates compatibility with null, tuple, and transform return shapes.
    expect(resolveStrategyResult(null, 4)).toEqual({
      transform: null,
      overIndex: 4,
    });

    expect(resolveStrategyResult([null, 3], 4)).toEqual({
      transform: null,
      overIndex: 3,
    });

    expect(
      resolveStrategyResult({ x: 1, y: 2, scaleX: 1, scaleY: 1 }, 4),
    ).toEqual({
      transform: { x: 1, y: 2, scaleX: 1, scaleY: 1 },
      overIndex: 4,
    });
  });
});
