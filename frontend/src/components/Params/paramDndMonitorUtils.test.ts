import { describe, expect, it } from "vitest";
import {
  isParamOverlayVisible,
  resolveParamPlaceholderMovePlan,
} from "./paramDndMonitorUtils";

describe("isParamOverlayVisible", () => {
  it("requires an active, unsuppressed param drag with overlay metrics", () => {
    expect(
      isParamOverlayVisible({
        shouldRenderOverlay: true,
        isParamDragActive: true,
        hasOverlayMetrics: true,
        suppressOverlay: false,
        isDropped: false,
        isDragging: true,
        isInitializing: false,
      }),
    ).toBe(true);

    expect(
      isParamOverlayVisible({
        shouldRenderOverlay: true,
        isParamDragActive: true,
        hasOverlayMetrics: true,
        suppressOverlay: true,
        isDropped: false,
        isDragging: true,
        isInitializing: false,
      }),
    ).toBe(false);

    expect(
      isParamOverlayVisible({
        shouldRenderOverlay: true,
        isParamDragActive: true,
        hasOverlayMetrics: false,
        suppressOverlay: false,
        isDropped: false,
        isDragging: false,
        isInitializing: true,
      }),
    ).toBe(false);
  });
});

describe("resolveParamPlaceholderMovePlan", () => {
  it("inserts into a new parent after the hovered child when past halfway", () => {
    expect(
      resolveParamPlaceholderMovePlan({
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
      resolveParamPlaceholderMovePlan({
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
      resolveParamPlaceholderMovePlan({
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
      resolveParamPlaceholderMovePlan({
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
