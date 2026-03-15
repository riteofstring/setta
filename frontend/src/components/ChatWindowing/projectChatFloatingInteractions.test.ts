import { describe, expect, it } from "vitest";
import {
  clampFloatingBoundsToViewport,
  pruneFloatingPreviewBounds,
  resolveFloatingDragPreview,
  resolveFloatingResizePreview,
  resolveFloatingSnapResizePreview,
  resolveFloatingSnapResizeSession,
  type FloatingDragSession,
  type FloatingResizeSession,
} from "./projectChatFloatingInteractions";
import { buildFloatingSnapBounds } from "./projectChatSnapLayout";

const FLOATING_VIEWPORT = {
  width: 1280,
  height: 800,
};

const FLOATING_INSETS = {
  left: 40,
  right: 40,
  top: 40,
  bottom: 0,
};

const clampBounds = (bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}) =>
  clampFloatingBoundsToViewport(
    bounds,
    FLOATING_VIEWPORT.width,
    FLOATING_VIEWPORT.height,
    FLOATING_INSETS,
  );

describe("pruneFloatingPreviewBounds", () => {
  it("removes stale preview entries while preserving the active ones", () => {
    const previewBoundsById = {
      alpha: { x: 40, y: 40, width: 600, height: 360 },
      bravo: { x: 640, y: 40, width: 600, height: 360 },
    };

    const nextPreviewBoundsById = pruneFloatingPreviewBounds(
      previewBoundsById,
      new Set(["bravo"]),
    );

    expect(nextPreviewBoundsById).toEqual({
      bravo: { x: 640, y: 40, width: 600, height: 360 },
    });
  });

  it("returns the existing object when nothing needs pruning", () => {
    const previewBoundsById = {
      alpha: { x: 120, y: 80, width: 420, height: 320 },
    };

    const nextPreviewBoundsById = pruneFloatingPreviewBounds(
      previewBoundsById,
      new Set(["alpha"]),
    );

    expect(nextPreviewBoundsById).toBe(previewBoundsById);
  });
});

describe("resolveFloatingDragPreview", () => {
  it("activates snapped-window unsnap drag and surfaces the matching snap preview", () => {
    const activeDrag: FloatingDragSession = {
      pointerId: 1,
      instanceId: "alpha",
      startX: 250,
      startY: 120,
      startBounds: buildFloatingSnapBounds(
        "right",
        FLOATING_VIEWPORT.width,
        FLOATING_VIEWPORT.height,
        FLOATING_INSETS,
      ),
      dragBoundsStart: {
        x: 760,
        y: 96,
        width: 420,
        height: 320,
      },
      lastBounds: buildFloatingSnapBounds(
        "right",
        FLOATING_VIEWPORT.width,
        FLOATING_VIEWPORT.height,
        FLOATING_INSETS,
      ),
      restoreBoundsOnUnsnap: {
        x: 760,
        y: 96,
        width: 420,
        height: 320,
      },
      hasActivatedUnsnap: false,
    };

    const nextPreview = resolveFloatingDragPreview({
      activeDrag,
      pointerPosition: {
        clientX: 10,
        clientY: 10,
      },
      clampBounds,
      viewport: FLOATING_VIEWPORT,
      floatingWindowBoundaryInsets: FLOATING_INSETS,
    });

    expect(nextPreview.hasActivatedUnsnap).toBe(true);
    expect(nextPreview.nextBounds).toEqual({
      x: 520,
      y: 40,
      width: 420,
      height: 320,
    });
    expect(nextPreview.nextSnapPreview).toEqual({
      instanceId: "alpha",
      preset: "top_left",
      bounds: buildFloatingSnapBounds(
        "top_left",
        FLOATING_VIEWPORT.width,
        FLOATING_VIEWPORT.height,
        FLOATING_INSETS,
      ),
    });
  });
});

describe("resolveFloatingResizePreview", () => {
  it("clamps free-floating resize drags to the minimum window size", () => {
    const activeResize: FloatingResizeSession = {
      pointerId: 1,
      instanceId: "alpha",
      direction: "bottom_right",
      startX: 540,
      startY: 400,
      startBounds: {
        x: 120,
        y: 80,
        width: 420,
        height: 320,
      },
      lastBounds: {
        x: 120,
        y: 80,
        width: 420,
        height: 320,
      },
    };

    const nextBounds = resolveFloatingResizePreview({
      activeResize,
      pointerPosition: {
        clientX: 140,
        clientY: 140,
      },
      clampBounds,
    });

    expect(nextBounds).toEqual({
      x: 120,
      y: 80,
      width: 380,
      height: 240,
    });
  });
});

describe("snap-resize helpers", () => {
  it("derives a vertical snap-resize session and updates snapped widths in lockstep", () => {
    const boundsByInstanceId = {
      topLeft: buildFloatingSnapBounds(
        "top_left",
        FLOATING_VIEWPORT.width,
        FLOATING_VIEWPORT.height,
        FLOATING_INSETS,
      ),
      topRight: buildFloatingSnapBounds(
        "top_right",
        FLOATING_VIEWPORT.width,
        FLOATING_VIEWPORT.height,
        FLOATING_INSETS,
      ),
      bottomLeft: buildFloatingSnapBounds(
        "bottom_left",
        FLOATING_VIEWPORT.width,
        FLOATING_VIEWPORT.height,
        FLOATING_INSETS,
      ),
      bottomRight: buildFloatingSnapBounds(
        "bottom_right",
        FLOATING_VIEWPORT.width,
        FLOATING_VIEWPORT.height,
        FLOATING_INSETS,
      ),
    };

    const activeResize = resolveFloatingSnapResizeSession({
      pointerId: 7,
      pointerPosition: {
        clientX: 640,
        clientY: 400,
      },
      handle: {
        axis: "vertical",
        coordinate: 640,
        start: 40,
        end: 800,
        leadingInstanceIds: ["topLeft", "bottomLeft"],
        trailingInstanceIds: ["topRight", "bottomRight"],
      },
      boundsByInstanceId,
    });

    expect(activeResize).not.toBeNull();
    expect(activeResize?.minCoordinate).toBe(420);
    expect(activeResize?.maxCoordinate).toBe(860);

    const nextBoundsByInstanceId = resolveFloatingSnapResizePreview({
      activeResize: activeResize!,
      pointerPosition: {
        clientX: 700,
        clientY: 400,
      },
    });

    expect(nextBoundsByInstanceId).toEqual({
      topLeft: { x: 40, y: 40, width: 660, height: 380 },
      topRight: { x: 700, y: 40, width: 540, height: 380 },
      bottomLeft: { x: 40, y: 420, width: 660, height: 380 },
      bottomRight: { x: 700, y: 420, width: 540, height: 380 },
    });
  });
});
