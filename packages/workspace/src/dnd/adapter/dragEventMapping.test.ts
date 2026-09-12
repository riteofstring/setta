import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { CollisionPriority, CollisionType } from "@dnd-kit/abstract";
import { beforeEach, describe, expect, it } from "vitest";
import { useDndChildren } from "../dndChildren";
import { updateItemChildren, useItemDndChildren } from "../itemDndChildren";
import {
  getItemDndId,
  setItemDndState,
  useItemDndState,
} from "../itemDndState";
import { mapDragEvent, mapDragStartEvent } from "./dragEventMapping";
import type { DragEndEvent, SettaCollision } from "./types";

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
    testWorkspace.dndChildren.getState().reset();
    testWorkspace.itemDndChildren.getState().reset();
    testWorkspace.itemDndState.getState().reset();
  });

  it("returns null on drag start when source is missing", () => {
    const result = mapDragStartEvent(testWorkspace.host, {
      operation: {
        source: null,
      },
    });

    expect(result).toBeNull();
  });

  it("prefers manager drag-operation shape for active rect", () => {
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
      testWorkspace.host,
      {
        operation: {
          source: active as never,
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
      testWorkspace.host,
      {
        operation: {
          source: active as never,
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
      testWorkspace.host,
      {
        operation: {
          source: active as never,
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
    const manager = {
      collisionObserver: {
        collisions: [],
      },
    };

    const result = mapDragEvent(
      testWorkspace.host,
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
      testWorkspace.host,
      {
        operation: {
          source: active as never,
          target: over as never,
          activatorEvent: null,
          transform: { x: 11, y: 13 },
        },
      },
      manager as never,
      true,
    ) as DragEndEvent | null;

    expect(mapped?.active).toBe(active);
    expect(mapped?.over).toBe(over);
    expect(mapped?.delta).toEqual({ x: 11, y: 13 });
    expect(mapped?.canceled).toBe(true);
    expect(mapped?.collisions?.map((entry) => entry.id)).toEqual(["over-1"]);
  });

  it("promotes best item collision using list-key parent mapping", () => {
    const listKey = "pinned";
    const parentId = "parent";
    const childId = "child";

    updateItemChildren(testWorkspace.host, {
      [parentId]: [childId],
    });
    setItemDndState(testWorkspace.host, { listKey });

    const parentDndId = getItemDndId(parentId, listKey);
    const childDndId = getItemDndId(childId, listKey);

    const active = {
      id: childDndId,
      data: {
        current: {
          type: "item",
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
      testWorkspace.host,
      {
        operation: {
          source: active as never,
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
