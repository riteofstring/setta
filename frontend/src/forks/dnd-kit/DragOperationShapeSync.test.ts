import type { BoundingRectangle } from "@dnd-kit/geometry";
import { describe, expect, it, vi } from "vitest";

import {
  resolveDragBaseRect,
  resolveSelectionBoundingRect,
} from "./DragOperationShapeSync";

function rect({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): BoundingRectangle {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

describe("resolveDragBaseRect", () => {
  it("stores the live multi-selection rect when a new drag starts", () => {
    const selectionRect = rect({
      left: 10,
      top: 20,
      width: 60,
      height: 30,
    });

    expect(
      resolveDragBaseRect({
        activeId: "section-2",
        previousActiveId: "section-1",
        previousBaseRect: rect({
          left: 1,
          top: 2,
          width: 3,
          height: 4,
        }),
        selectionRect,
        droppable: undefined,
        fallbackRect: null,
      }),
    ).toEqual({
      baseRect: selectionRect,
      refreshedBaseRect: selectionRect,
    });
  });

  it("prefers a refreshed droppable shape over stale shape and fallback rects", () => {
    const refreshedRect = rect({
      left: 50,
      top: 60,
      width: 70,
      height: 80,
    });
    const refreshShape = vi.fn(() => ({
      boundingRectangle: refreshedRect,
    }));

    expect(
      resolveDragBaseRect({
        activeId: "section-2",
        previousActiveId: "section-1",
        previousBaseRect: null,
        selectionRect: null,
        droppable: {
          refreshShape,
          shape: {
            boundingRectangle: rect({
              left: 1,
              top: 2,
              width: 3,
              height: 4,
            }),
          },
        },
        fallbackRect: rect({
          left: 100,
          top: 100,
          width: 10,
          height: 10,
        }),
      }),
    ).toEqual({
      baseRect: refreshedRect,
      refreshedBaseRect: refreshedRect,
    });
    expect(refreshShape).toHaveBeenCalledTimes(1);
  });
});

describe("resolveSelectionBoundingRect", () => {
  it("combines all dragged section rects for free-move multi-selection", () => {
    expect(
      resolveSelectionBoundingRect({
        draggingIds: ["a", "b"],
        draggingRectsById: {
          a: {
            left: 10,
            top: 20,
            right: 40,
            bottom: 60,
            width: 30,
            height: 40,
          },
          b: {
            left: -5,
            top: 15,
            right: 25,
            bottom: 45,
            width: 30,
            height: 30,
          },
        },
        isMovingFree: true,
        isParamDrag: false,
      }),
    ).toEqual({
      left: -5,
      top: 15,
      right: 40,
      bottom: 60,
      width: 45,
      height: 45,
    });
  });
});
