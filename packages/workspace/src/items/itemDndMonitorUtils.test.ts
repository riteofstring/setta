import { describe, expect, it } from "vitest";
import type { SettaCollision } from "../dnd/adapter/types";
import {
  filterCollisionsForListKey,
  isItemOverlayVisible,
  resolveItemPlaceholderMovePlan,
} from "./itemDndMonitorUtils";

describe("isItemOverlayVisible", () => {
  it("requires an active, unsuppressed item drag with overlay metrics", () => {
    expect(
      isItemOverlayVisible({
        shouldRenderOverlay: true,
        isItemDragActive: true,
        hasOverlayMetrics: true,
        suppressOverlay: false,
        isDropped: false,
        isDragging: true,
        isInitializing: false,
      }),
    ).toBe(true);

    expect(
      isItemOverlayVisible({
        shouldRenderOverlay: true,
        isItemDragActive: true,
        hasOverlayMetrics: true,
        suppressOverlay: true,
        isDropped: false,
        isDragging: true,
        isInitializing: false,
      }),
    ).toBe(false);

    expect(
      isItemOverlayVisible({
        shouldRenderOverlay: true,
        isItemDragActive: true,
        hasOverlayMetrics: false,
        suppressOverlay: false,
        isDropped: false,
        isDragging: false,
        isInitializing: true,
      }),
    ).toBe(false);
  });
});

describe("resolveItemPlaceholderMovePlan", () => {
  it("inserts into a new parent after the hovered child when past halfway", () => {
    expect(
      resolveItemPlaceholderMovePlan({
        tempId: "temp",
        overId: "child-b",
        oldParentId: "old-parent",
        newParentId: "new-parent",
        pastHalfway: true,
        newParentChildren: ["child-a", "child-b", "child-c"],
      }),
    ).toEqual({
      type: "move-parent",
      index: 2,
      overIndex: 1,
    });
  });

  it("uses the parent boundary when hovering the parent container itself", () => {
    expect(
      resolveItemPlaceholderMovePlan({
        tempId: "temp",
        overId: "parent",
        oldParentId: "old-parent",
        newParentId: "parent",
        pastHalfway: false,
        newParentChildren: ["child-a", "child-b"],
      }),
    ).toEqual({
      type: "move-parent",
      index: 0,
      overIndex: -1,
    });
  });

  it("returns a reorder plan only when the placeholder actually moves", () => {
    expect(
      resolveItemPlaceholderMovePlan({
        tempId: "temp",
        overId: "child-b",
        oldParentId: "parent",
        newParentId: "parent",
        pastHalfway: true,
        newParentChildren: ["child-a", "temp", "child-b", "child-c"],
      }),
    ).toEqual({
      type: "reorder",
      index: 2,
      overIndex: 2,
      activeIndex: 1,
    });

    expect(
      resolveItemPlaceholderMovePlan({
        tempId: "temp",
        overId: "temp",
        oldParentId: "parent",
        newParentId: "parent",
        pastHalfway: false,
        newParentChildren: ["child-a", "temp", "child-b"],
      }),
    ).toBeNull();
  });
});

function makeCollision(id: string, listKey: string | null): SettaCollision {
  return {
    id,
    data: {
      droppable: { data: { current: { listKey } } },
    },
  } as unknown as SettaCollision;
}

describe("filterCollisionsForListKey", () => {
  it("keeps only collisions whose droppable belongs to the active list", () => {
    const collisions = [
      makeCollision("a", "pinned"),
      makeCollision("b", "main"),
      makeCollision("c", null),
    ];
    expect(filterCollisionsForListKey(collisions, "main")).toEqual([
      collisions[1],
    ]);
  });

  it("passes collisions through without an active list key", () => {
    const collisions = [makeCollision("a", "pinned")];
    expect(filterCollisionsForListKey(collisions, null)).toBe(collisions);
    expect(filterCollisionsForListKey(null, "main")).toBeNull();
  });
});
