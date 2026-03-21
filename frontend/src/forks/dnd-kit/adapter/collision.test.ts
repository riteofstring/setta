import { beforeEach, describe, expect, it } from "vitest";
import { useDndState } from "../dndState";
import {
  createCollisionTracker,
  type CollisionTracker,
} from "./collision";
import type { ClientRect, SettaCollision } from "./types";

type SortingCollisionArgs = Parameters<
  CollisionTracker["sortingCollisionDetector"]
>[0];

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

function buildSortingCollisionArgs({
  droppableId,
  activeRect,
  droppableRect,
  pointerY,
}: {
  droppableId: string;
  activeRect: ClientRect;
  droppableRect: ClientRect;
  pointerY: number;
}): SortingCollisionArgs {
  return {
    droppable: {
      id: droppableId,
      shape: {
        boundingRectangle: droppableRect,
      },
      data: {
        current: {
          sortable: {
            containerId: "container-1",
          },
        },
      },
    },
    dragOperation: {
      source: {
        id: "active-row",
        data: {
          current: {
            sortable: {
              containerId: "container-1",
            },
          },
        },
      },
      shape: {
        current: {
          boundingRectangle: activeRect,
        },
      },
      position: {
        current: {
          x: activeRect.left + activeRect.width / 2,
          y: pointerY,
        },
      },
    },
  } as SortingCollisionArgs;
}

function detectSortingCollision(
  tracker: CollisionTracker,
  args: {
    droppableId: string;
    activeRect: ClientRect;
    droppableRect: ClientRect;
    pointerY: number;
  },
): SettaCollision {
  const collision = tracker.sortingCollisionDetector(
    buildSortingCollisionArgs(args),
  );

  if (!collision) {
    throw new Error("Expected a sorting collision.");
  }

  return collision;
}

describe("collision adapter hysteresis", () => {
  beforeEach(() => {
    useDndState.setState({ draggingIds: [] });
  });

  it("lets compact param rows clear the repeated same-row true state before a fixed ten-pixel shift", () => {
    // Validates compact rows do not spend their whole half-height budget on same-row stickiness.
    const tracker = createCollisionTracker({
      mode: "param",
      getParentByChild: () => ({}),
    });
    const droppableRect = rect(0, 0, 120, 20);

    const initialCollision = detectSortingCollision(tracker, {
      droppableId: "row-a",
      activeRect: rect(0, 0, 120, 20),
      droppableRect,
      pointerY: 15,
    });
    expect(initialCollision.pastHalfway).toBe(true);
    tracker.update([initialCollision]);

    const repeatedCollision = detectSortingCollision(tracker, {
      droppableId: "row-a",
      activeRect: rect(0, 5, 120, 20),
      droppableRect,
      pointerY: 5,
    });
    expect(repeatedCollision.pastHalfway).toBe(false);
  });

  it("lets compact param rows re-enter the repeated same-row true state before a fixed ten-pixel shift", () => {
    // Validates the false-state hysteresis also scales down on compact rows.
    const tracker = createCollisionTracker({
      mode: "param",
      getParentByChild: () => ({}),
    });
    const droppableRect = rect(0, 0, 120, 20);

    const initialCollision = detectSortingCollision(tracker, {
      droppableId: "row-a",
      activeRect: rect(0, 18, 120, 20),
      droppableRect,
      pointerY: 8,
    });
    expect(initialCollision.pastHalfway).toBe(false);
    tracker.update([initialCollision]);

    const repeatedCollision = detectSortingCollision(tracker, {
      droppableId: "row-a",
      activeRect: rect(0, 16, 120, 20),
      droppableRect,
      pointerY: 4,
    });
    expect(repeatedCollision.pastHalfway).toBe(true);
  });

  it("does not carry same-row hysteresis over to a new collision id", () => {
    // Validates the sticky buffer only applies when the collision stays on the same row.
    const tracker = createCollisionTracker({
      mode: "param",
      getParentByChild: () => ({}),
    });

    const initialCollision = detectSortingCollision(tracker, {
      droppableId: "row-a",
      activeRect: rect(0, 0, 120, 20),
      droppableRect: rect(0, 0, 120, 20),
      pointerY: 15,
    });
    expect(initialCollision.pastHalfway).toBe(true);
    tracker.update([initialCollision]);

    const nextCollision = detectSortingCollision(tracker, {
      droppableId: "row-b",
      activeRect: rect(0, 9, 120, 20),
      droppableRect: rect(0, 0, 120, 20),
      pointerY: 9,
    });
    expect(nextCollision.pastHalfway).toBe(false);
  });

  it("keeps the full hysteresis window for larger sortable targets", () => {
    // Validates larger rows keep the existing 10px buffer instead of dropping to zero.
    const tracker = createCollisionTracker({
      mode: "param",
      getParentByChild: () => ({}),
    });
    const droppableRect = rect(0, 0, 120, 80);

    const initialCollision = detectSortingCollision(tracker, {
      droppableId: "row-a",
      activeRect: rect(0, 0, 120, 80),
      droppableRect,
      pointerY: 60,
    });
    expect(initialCollision.pastHalfway).toBe(true);
    tracker.update([initialCollision]);

    const repeatedCollision = detectSortingCollision(tracker, {
      droppableId: "row-a",
      activeRect: rect(0, 31, 120, 80),
      droppableRect,
      pointerY: 31,
    });
    expect(repeatedCollision.pastHalfway).toBe(true);
  });
});
