import { CollisionPriority, CollisionType } from "@dnd-kit/abstract";
import { beforeEach, describe, expect, it } from "vitest";
import { useReactFlow } from "../../canvas/store";
import { useDndState } from "../dndState";
import { createCollisionTracker } from "./collision";
import type { ClientRect, SettaCollision } from "./types";

function createRect({
  top,
  left,
  width,
  height,
}: {
  top: number;
  left: number;
  width: number;
  height: number;
}): ClientRect {
  return {
    top,
    left,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

function createDroppable(id: string, rect: ClientRect, data?: Record<string, unknown>) {
  return {
    id,
    shape: {
      boundingRectangle: rect,
    },
    data: {
      current: data ?? {},
    },
  } as never;
}

function createDragOperation({
  id,
  rect,
  data,
  pointerCoordinates,
}: {
  id: string;
  rect: ClientRect;
  data?: Record<string, unknown>;
  pointerCoordinates?: { x: number; y: number } | null;
}) {
  return {
    source: {
      id,
      data: {
        current: data ?? {},
      },
    },
    shape: {
      current: {
        boundingRectangle: rect,
      },
    },
    position: {
      current: pointerCoordinates ?? null,
    },
  } as never;
}

function createCollision(id: string, rect: ClientRect): SettaCollision {
  return {
    id,
    priority: CollisionPriority.Normal,
    type: CollisionType.Collision,
    value: 1,
    data: {
      droppable: createDroppable(id, rect),
      intersectionRatio: 1,
    },
  };
}

describe("collision tracker", () => {
  beforeEach(() => {
    useDndState.getState().reset();
    useDndState.setState({ draggingIds: [] });
    useReactFlow.setState({ transform: [0, 0, 1] });
  });

  it("boosts the previously resolved child collision and clears that state on reset", () => {
    const tracker = createCollisionTracker({
      getParentByChild: () => ({ child: "parent" }),
    });
    const rect = createRect({
      top: 0,
      left: 0,
      width: 10,
      height: 10,
    });
    const dragOperation = createDragOperation({
      id: "active",
      rect,
      pointerCoordinates: { x: 5, y: 5 },
    });

    tracker.update([createCollision("parent", rect), createCollision("child", rect)]);

    const boostedCollision = tracker.collisionDetector({
      droppable: createDroppable("child", rect),
      dragOperation,
    } as never);

    expect(boostedCollision?.data?.intersectionRatio).toBeCloseTo(110);

    tracker.reset();

    const resetCollision = tracker.collisionDetector({
      droppable: createDroppable("child", rect),
      dragOperation,
    } as never);

    expect(resetCollision?.data?.intersectionRatio).toBe(100);
  });
});
