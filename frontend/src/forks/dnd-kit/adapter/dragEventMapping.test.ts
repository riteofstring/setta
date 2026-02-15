import { CollisionPriority, CollisionType } from "@dnd-kit/abstract";
import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it } from "vitest";
import { updateParamChildren } from "../paramDndChildren";
import { getParamDndItemId, setParamDndState } from "../paramDndState";
import { mapDragEvent, mapDragStartEvent } from "./dragEventMapping";
import type { SettaCollision } from "./types";

type RectInput = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function boundingRectangle({ top, left, width, height }: RectInput) {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
  };
}

function collision(id: string, intersectionRatio: number): SettaCollision {
  return {
    id,
    priority: CollisionPriority.Normal,
    type: CollisionType.Collision,
    value: intersectionRatio,
    data: {
      intersectionRatio,
    },
  };
}

describe("dragEventMapping", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  it("returns null on drag start when source is missing", () => {
    // Validates null-safe handling for malformed drag-start operations.
    const result = mapDragStartEvent({
      operation: {
        source: null,
      },
    });

    expect(result).toBeNull();
  });

  it("prefers manager drag-operation shape for active rect", () => {
    // Validates primary active rect source from live drag operation geometry.
    const active = { id: "active-1" };
    const manager = {
      dragOperation: {
        shape: {
          current: {
            boundingRectangle: boundingRectangle({
              top: 10,
              left: 20,
              width: 50,
              height: 30,
            }),
          },
        },
      },
      registry: {
        droppables: new Map(),
      },
    };

    const result = mapDragStartEvent(
      {
        operation: {
          source: active,
        },
      },
      manager as never,
    );

    expect(result?.active).toBe(active);
    expect(result?.activeRect).toEqual({
      top: 10,
      left: 20,
      right: 70,
      bottom: 40,
      width: 50,
      height: 30,
    });
  });

  it("falls back to active droppable shape then active.rect", () => {
    // Validates fallback order for active rect resolution.
    const active = {
      id: "active-1",
      rect: {
        current: {
          translated: {
            x: 2,
            y: 4,
            width: 10,
            height: 12,
          },
        },
      },
    };

    const managerUsingDroppable = {
      dragOperation: {
        shape: {
          current: null,
        },
      },
      registry: {
        droppables: new Map([
          [
            "active-1",
            {
              shape: {
                boundingRectangle: boundingRectangle({
                  top: 1,
                  left: 2,
                  width: 30,
                  height: 40,
                }),
              },
            },
          ],
        ]),
      },
    };

    const resultFromDroppable = mapDragStartEvent(
      {
        operation: {
          source: active,
        },
      },
      managerUsingDroppable as never,
    );

    expect(resultFromDroppable?.activeRect).toEqual({
      top: 1,
      left: 2,
      right: 32,
      bottom: 41,
      width: 30,
      height: 40,
    });

    const managerUsingRectFallback = {
      dragOperation: {
        shape: {
          current: null,
        },
      },
      registry: {
        droppables: new Map(),
      },
    };

    const resultFromActiveRect = mapDragStartEvent(
      {
        operation: {
          source: active,
        },
      },
      managerUsingRectFallback as never,
    );

    expect(resultFromActiveRect?.activeRect).toEqual({
      top: 4,
      left: 2,
      right: 12,
      bottom: 16,
      width: 10,
      height: 12,
    });
  });

  it("returns null on drag events when active source is missing", () => {
    // Validates null-safe handling for malformed drag move/over/end events.
    const manager = {
      collisionObserver: {
        collisions: [],
      },
    };

    const result = mapDragEvent(
      {
        operation: {
          source: null,
          target: null,
          activatorEvent: null,
          transform: { x: 0, y: 0 },
        },
      },
      manager as never,
    );

    expect(result).toBeNull();
  });

  it("maps drag events and preserves operation payload", () => {
    // Validates baseline drag mapping for active/over/delta/collisions.
    const active = {
      id: "active-1",
      data: { current: { type: "section" } },
    };
    const over = { id: "over-1" };
    const manager = {
      collisionObserver: {
        collisions: [collision("over-1", 3)],
      },
    };

    const mapped = mapDragEvent(
      {
        operation: {
          source: active,
          target: over,
          activatorEvent: null,
          transform: { x: 11, y: 13 },
        },
      },
      manager as never,
      true,
    );

    expect(mapped?.active).toBe(active);
    expect(mapped?.over).toBe(over);
    expect(mapped?.delta).toEqual({ x: 11, y: 13 });
    expect(mapped?.canceled).toBe(true);
    expect(mapped?.collisions?.map((entry) => entry.id)).toEqual(["over-1"]);
  });

  it("promotes best param collision using list-key parent mapping", () => {
    // Validates param drag collision ordering uses list-key aware parentByChild mapping.
    const listKey = "pinned";
    const parentId = "parent";
    const childId = "child";

    updateParamChildren({
      [parentId]: [childId],
    });
    setParamDndState({ listKey });

    const parentDndId = getParamDndItemId(parentId, listKey);
    const childDndId = getParamDndItemId(childId, listKey);

    const active = {
      id: childDndId,
      data: {
        current: {
          type: "param",
        },
      },
    };

    const manager = {
      collisionObserver: {
        collisions: [
          collision(parentDndId, 20),
          collision(childDndId, 1),
          collision("outside", 10),
        ],
      },
    };

    const mapped = mapDragEvent(
      {
        operation: {
          source: active,
          target: null,
          activatorEvent: null,
          transform: { x: 0, y: 0 },
        },
      },
      manager as never,
    );

    expect(mapped?.collisions?.[0]?.id).toBe(childDndId);
  });
});
