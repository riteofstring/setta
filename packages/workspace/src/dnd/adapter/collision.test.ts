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

function createDroppable(
  id: string,
  rect: ClientRect,
  data?: Record<string, unknown>,
) {
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
    testWorkspace.dndState.getState().reset();
    testWorkspace.dndState.setState({ draggingIds: [] });
    testWorkspace.reactFlow.setState({ transform: [0, 0, 1] });
  });

  it("keeps item row collisions alive via vertical overlap when horizontal overlap is gone", () => {
    // The reference's param-mode intersection fallback: a row dragged horizontally off its list
    // still collides through vertical overlap x active width.
    const tracker = createCollisionTracker({
      host: testWorkspace.host,
      mode: "item",
      getParentByChild: () => ({}),
    });
    const activeRect = createRect({
      top: 0,
      left: 120,
      width: 10,
      height: 10,
    });
    const droppableRect = createRect({
      top: 2,
      left: 0,
      width: 100,
      height: 10,
    });

    const collision = tracker.collisionDetector({
      droppable: createDroppable("drop", droppableRect, {
        sortable: { containerId: "items" },
        sortableOrientation: "vertical",
      }),
      dragOperation: createDragOperation({
        id: "active",
        rect: activeRect,
        data: {
          type: "item",
        },
        pointerCoordinates: { x: 125, y: 5 },
      }),
    } as never);

    expect(collision?.priority).toBe(CollisionPriority.High);
    expect(collision?.data?.intersectionRatio).toBe(80);
  });

  it("boosts the previously resolved child collision and clears that state on reset", () => {
    const tracker = createCollisionTracker({
      host: testWorkspace.host,
      mode: "section",
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

    tracker.update([
      createCollision("parent", rect),
      createCollision("child", rect),
    ]);

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

  it("uses the pointer with a symmetric dead band for cross-parent insertion", () => {
    const tracker = createCollisionTracker({
      host: testWorkspace.host,
      mode: "section",
      getParentByChild: () => ({}),
    });
    const droppableRect = createRect({
      top: 100,
      left: 200,
      width: 200,
      height: 200,
    });
    const activeRect = createRect({
      top: 150,
      left: 0,
      width: 210,
      height: 200,
    });
    const droppable = createDroppable("child", droppableRect, {
      sortable: { containerId: "target-group" },
    });

    function detect(pointerY: number) {
      return tracker.collisionDetector({
        droppable,
        dragOperation: createDragOperation({
          id: "active",
          rect: activeRect,
          pointerCoordinates: { x: 190, y: pointerY },
        }),
      } as never) as SettaCollision;
    }

    let collision = detect(190);
    expect(collision.pastHalfway).toBe(false);
    tracker.update([collision]);

    collision = detect(209);
    expect(collision.pastHalfway).toBe(false);
    tracker.update([collision]);

    collision = detect(211);
    expect(collision.pastHalfway).toBe(true);
    tracker.update([collision]);

    collision = detect(191);
    expect(collision.pastHalfway).toBe(true);
    tracker.update([collision]);

    collision = detect(189);
    expect(collision.pastHalfway).toBe(false);
  });

  it("uses the pointer on the horizontal axis for cross-parent insertion", () => {
    const tracker = createCollisionTracker({
      host: testWorkspace.host,
      mode: "section",
      getParentByChild: () => ({}),
    });
    const droppableRect = createRect({
      top: 200,
      left: 100,
      width: 200,
      height: 200,
    });
    const activeRect = createRect({
      top: 0,
      left: 150,
      width: 200,
      height: 210,
    });
    const droppable = createDroppable("child", droppableRect, {
      sortable: { containerId: "target-group" },
      sortableOrientation: "horizontal",
    });

    function detect(pointerX: number) {
      return tracker.collisionDetector({
        droppable,
        dragOperation: createDragOperation({
          id: "active",
          rect: activeRect,
          pointerCoordinates: { x: pointerX, y: 190 },
        }),
      } as never) as SettaCollision;
    }

    let collision = detect(190);
    expect(collision.pastHalfway).toBe(false);
    tracker.update([collision]);

    collision = detect(211);
    expect(collision.pastHalfway).toBe(true);
  });

  it("keeps each target's hysteresis snapshot when the resolved collision alternates", () => {
    const tracker = createCollisionTracker({
      host: testWorkspace.host,
      mode: "section",
      getParentByChild: () => ({}),
    });
    const originalChildRect = createRect({
      top: 100,
      left: 200,
      width: 200,
      height: 200,
    });
    const shiftedChildRect = createRect({
      top: 300,
      left: 200,
      width: 200,
      height: 200,
    });
    const activeRect = createRect({
      top: 150,
      left: 0,
      width: 210,
      height: 250,
    });
    const childData = { sortable: { containerId: "target-group" } };

    const initialChildCollision = tracker.collisionDetector({
      droppable: createDroppable("child", originalChildRect, childData),
      dragOperation: createDragOperation({
        id: "active",
        rect: activeRect,
        pointerCoordinates: { x: 190, y: 190 },
      }),
    } as never) as SettaCollision;
    expect(initialChildCollision.pastHalfway).toBe(false);
    tracker.update([initialChildCollision]);

    tracker.update([
      {
        ...createCollision(
          "target-group",
          createRect({ top: 0, left: 100, width: 400, height: 600 }),
        ),
        pastHalfway: false,
      },
    ]);

    const afterPlaceholderShift = tracker.collisionDetector({
      droppable: createDroppable("child", shiftedChildRect, childData),
      dragOperation: createDragOperation({
        id: "active",
        rect: activeRect,
        pointerCoordinates: { x: 190, y: 211 },
      }),
    } as never) as SettaCollision;

    expect(afterPlaceholderShift.pastHalfway).toBe(true);
  });

  it("keeps direction-aware edges for sorting within the same parent", () => {
    const tracker = createCollisionTracker({
      host: testWorkspace.host,
      mode: "section",
      getParentByChild: () => ({}),
    });
    const droppableRect = createRect({
      top: 100,
      left: 200,
      width: 200,
      height: 200,
    });
    const activeRect = createRect({
      top: 150,
      left: 0,
      width: 210,
      height: 200,
    });
    const sortableData = { sortable: { containerId: "shared-group" } };
    const droppable = createDroppable("child", droppableRect, sortableData);

    const firstCollision = tracker.collisionDetector({
      droppable,
      dragOperation: createDragOperation({
        id: "active",
        rect: activeRect,
        data: sortableData,
        pointerCoordinates: { x: 190, y: 190 },
      }),
    } as never) as SettaCollision;
    tracker.update([firstCollision]);

    const afterDownwardMotion = tracker.collisionDetector({
      droppable,
      dragOperation: createDragOperation({
        id: "active",
        rect: activeRect,
        data: sortableData,
        pointerCoordinates: { x: 191, y: 191 },
      }),
    } as never) as SettaCollision;

    expect(afterDownwardMotion.pastHalfway).toBe(true);
  });
});
