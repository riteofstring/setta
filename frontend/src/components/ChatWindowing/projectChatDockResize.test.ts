import { describe, expect, it } from "vitest";
import {
  pruneDockResizePreviewEntries,
  resolveDockResizePreview,
  resolveDockResizeSession,
} from "./projectChatDockResize";

describe("pruneDockResizePreviewEntries", () => {
  it("removes stale preview entries once docked windows disappear", () => {
    const previewById = {
      "dock-1": 460,
      "dock-2": 520,
    };

    // Dock preview state should only keep entries for windows that still exist in the dock.
    expect(
      pruneDockResizePreviewEntries(previewById, new Set(["dock-2"])),
    ).toEqual({
      "dock-2": 520,
    });
  });

  it("reuses the current object when every preview entry is still valid", () => {
    const previewById = {
      "dock-1": 460,
    };

    // Reusing the same object avoids extra rerenders while a resize is in flight.
    expect(
      pruneDockResizePreviewEntries(previewById, new Set(["dock-1"])),
    ).toBe(previewById);
  });
});

describe("resolveDockResizeSession", () => {
  it("clamps the maximum height to the current dock viewport", () => {
    const session = resolveDockResizeSession({
      pointerId: 1,
      instanceId: "dock-1",
      direction: "bottom_right",
      clientX: 400,
      clientY: 300,
      startWidthPx: 460,
      startHeightPx: 430,
      viewportHeightPx: 772,
      workspaceTopInsetPx: 40,
      dockBottomOffsetPx: 0,
      dockAvailableHeightPx: 900,
    });

    // The dock should never allow a resize above the remaining viewport height.
    expect(session.maxHeightPx).toBe(732);
    expect(session.minWidthPx).toBe(280);
    expect(session.minHeightPx).toBe(220);
  });
});

describe("resolveDockResizePreview", () => {
  it("clamps a bottom-right drag to the minimum supported dock size", () => {
    const session = resolveDockResizeSession({
      pointerId: 1,
      instanceId: "dock-1",
      direction: "bottom_right",
      clientX: 400,
      clientY: 300,
      startWidthPx: 460,
      startHeightPx: 430,
      viewportHeightPx: 772,
      workspaceTopInsetPx: 40,
      dockBottomOffsetPx: 0,
      dockAvailableHeightPx: 732,
    });

    // Large negative drags should stop at the dock minimum instead of collapsing the panel.
    expect(
      resolveDockResizePreview(session, {
        clientX: -600,
        clientY: -700,
      }),
    ).toEqual({
      widthPx: 280,
      heightPx: 220,
    });
  });

  it("shrinks a top-left drag from the opposite corner", () => {
    const session = resolveDockResizeSession({
      pointerId: 1,
      instanceId: "dock-1",
      direction: "top_left",
      clientX: 400,
      clientY: 300,
      startWidthPx: 460,
      startHeightPx: 430,
      viewportHeightPx: 772,
      workspaceTopInsetPx: 40,
      dockBottomOffsetPx: 0,
      dockAvailableHeightPx: 732,
    });

    // Top-left handles invert the pointer deltas, so moving inward should reduce both dimensions.
    expect(
      resolveDockResizePreview(session, {
        clientX: 480,
        clientY: 340,
      }),
    ).toEqual({
      widthPx: 380,
      heightPx: 390,
    });
  });
});
