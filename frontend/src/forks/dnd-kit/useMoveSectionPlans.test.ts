import { describe, expect, it } from "vitest";
import type { DragEndEvent } from "./adapter";
import {
  planFreeMove,
  planSortingMove,
  type DndRect,
} from "./useMoveSectionPlans";

function over(id: string): NonNullable<DragEndEvent["over"]> {
  return { id } as NonNullable<DragEndEvent["over"]>;
}

function collision(
  id: string,
  pastHalfway?: boolean,
): NonNullable<DragEndEvent["collisions"]>[number] {
  return {
    id,
    pastHalfway,
  } as NonNullable<DragEndEvent["collisions"]>[number];
}

function rect(left: number, top: number): DndRect {
  return {
    top,
    left,
    right: left + 100,
    bottom: top + 100,
    width: 100,
    height: 100,
  };
}

describe("useMoveSectionPlans", () => {
  it("skips sort plans that keep the child order unchanged", () => {
    const plan = planSortingMove({
      children: ["a", "b", "c"],
      collisions: [collision("c")],
      draggingIds: ["b"],
      draggingSet: new Set(["b"]),
      fallbackOverId: null,
      fallbackPastHalfway: false,
      isInvalidTarget: false,
      over: over("c"),
      parentId: "parent",
    });

    expect(plan).toBeNull();
  });

  it("builds a sort plan when the drop crosses halfway", () => {
    const plan = planSortingMove({
      children: ["a", "b", "c"],
      collisions: [collision("c", true)],
      draggingIds: ["b"],
      draggingSet: new Set(["b"]),
      fallbackOverId: null,
      fallbackPastHalfway: null,
      isInvalidTarget: false,
      over: over("c"),
      parentId: "parent",
    });

    expect(plan).toEqual({
      sectionIds: ["b"],
      newParentId: "parent",
      newIndex: 2,
      positionsById: null,
    });
  });

  it("skips free moves that resolve back to the same parent order", () => {
    const plan = planFreeMove({
      behaviorDropType: null,
      collisions: [collision("b")],
      delta: null,
      dndChildrenState: {
        x: {
          parent: ["a-TempDND", "b"],
        },
        y: {
          "a-TempDND": "parent",
        },
      },
      dndSectionId: "a-TempDND",
      draggingIds: ["a"],
      draggingRectsById: null,
      draggingSet: new Set(["a"]),
      isInvalidParent: () => false,
      overId: "b",
      parentSectionMap: {
        a: "parent",
        b: "parent",
      },
      sharedParentChildren: ["a", "b"],
      sharedParentId: "parent",
      topLevelSections: {},
      toFlowPosition: (position) => position,
    });

    expect(plan).toBeNull();
  });

  it("skips top-level pane drops that preserve current positions", () => {
    const plan = planFreeMove({
      behaviorDropType: null,
      collisions: null,
      delta: { x: 0, y: 0 },
      dndChildrenState: {
        x: {},
        y: {},
      },
      dndSectionId: "a-TempDND",
      draggingIds: ["a"],
      draggingRectsById: {
        a: rect(10, 20),
      },
      draggingSet: new Set(["a"]),
      isInvalidParent: () => false,
      overId: null,
      parentSectionMap: {
        a: null,
      },
      sharedParentChildren: null,
      sharedParentId: null,
      topLevelSections: {
        a: { x: 10, y: 20, zIndex: 1 },
      },
      toFlowPosition: (position) => position,
    });

    expect(plan).toBeNull();
  });

  it("builds a free-move plan when dropping into a new parent", () => {
    const plan = planFreeMove({
      behaviorDropType: null,
      collisions: [collision("target", true)],
      delta: null,
      dndChildrenState: {
        x: {
          parent: ["target"],
        },
        y: {
          "a-TempDND": "parent",
        },
      },
      dndSectionId: "a-TempDND",
      draggingIds: ["a"],
      draggingRectsById: null,
      draggingSet: new Set(["a"]),
      isInvalidParent: () => false,
      overId: "target",
      parentSectionMap: {
        a: "source",
        target: "parent",
      },
      sharedParentChildren: ["a"],
      sharedParentId: "source",
      topLevelSections: {},
      toFlowPosition: (position) => position,
    });

    expect(plan).toEqual({
      sectionIds: ["a"],
      newParentId: "parent",
      newIndex: 1,
      positionsById: null,
    });
  });
});
