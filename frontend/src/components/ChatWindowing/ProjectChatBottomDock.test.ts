import { describe, expect, it } from "vitest";
import {
  MIN_DOCK_CHAT_WIDTH_PX,
  resolveCycleVisibleCount,
  resolveDockStripReservedWidthPx,
  resolveDockWindowWidthsToFit,
  resolveDockedWindowLayout,
  resolvePillDisplayMode,
} from "./projectChatBottomDockLayout";

const dockedPills = [
  {
    instanceId: "dock-1",
    dockPreferredWidthPx: 460,
    bounds: { height: 430 },
  },
  {
    instanceId: "dock-2",
    dockPreferredWidthPx: 520,
    bounds: { height: 470 },
  },
  {
    instanceId: "dock-3",
    dockPreferredWidthPx: 500,
    bounds: { height: 450 },
  },
];

describe("resolveDockStripReservedWidthPx", () => {
  it("reserves menu-trigger width for a single visible chat when the manager menu is shown", () => {
    const withManagerMenu = resolveDockStripReservedWidthPx({
      nonClosedChatCount: 1,
      showManagerMenu: true,
    });
    const withoutManagerMenu = resolveDockStripReservedWidthPx({
      nonClosedChatCount: 1,
      showManagerMenu: false,
    });

    expect(withManagerMenu).toBeGreaterThan(withoutManagerMenu);
  });

  it("keeps the wider multi-chat reservation when multiple chats remain visible", () => {
    const multiChatWidth = resolveDockStripReservedWidthPx({
      nonClosedChatCount: 2,
      showManagerMenu: true,
    });
    const singleChatWidth = resolveDockStripReservedWidthPx({
      nonClosedChatCount: 1,
      showManagerMenu: true,
    });

    expect(multiChatWidth).toBeGreaterThan(singleChatWidth);
  });
});

describe("resolveDockWindowWidthsToFit", () => {
  it("shrinks visible dock windows while preserving ordering and minimum width", () => {
    const resolvedWidths = resolveDockWindowWidthsToFit(
      dockedPills.slice(0, 2),
      {
        "dock-1": 460,
        "dock-2": 620,
      },
      700,
    );

    // The fitted widths should share the reduction instead of pinning both windows to the minimum.
    expect(resolvedWidths["dock-1"]).toBeCloseTo(321.54, 2);
    expect(resolvedWidths["dock-2"]).toBeCloseTo(358.46, 2);
    expect(resolvedWidths["dock-1"]).toBeGreaterThan(MIN_DOCK_CHAT_WIDTH_PX);
    expect(resolvedWidths["dock-2"]).toBeGreaterThan(resolvedWidths["dock-1"]);
  });
});

describe("resolveDockedWindowLayout", () => {
  it("shows the newest dock windows first when the dock can only fit two panels", () => {
    const layout = resolveDockedWindowLayout({
      dockedPills,
      previewWidthsById: {},
      previewHeightsById: {},
      viewportWidthPx: 900,
      viewportHeightPx: 772,
      workspaceTopInsetPx: 40,
      dockBottomOffsetPx: 0,
      sideRailWidthPx: 40,
      nonClosedChatCount: 3,
      showManagerMenu: true,
      dockCycleOffsetFromEnd: 0,
    });

    // A medium-width viewport should keep the two rightmost windows visible and move the oldest into the tray.
    expect(layout.maxVisibleDockedCount).toBe(2);
    expect(layout.visibleDockedPills.map((pill) => pill.instanceId)).toEqual([
      "dock-2",
      "dock-3",
    ]);
    expect(layout.responsiveHiddenDockedIds.has("dock-1")).toBe(true);
    expect(layout.dockSurfaceWidthCss).not.toBe("0px");
  });

  it("collapses all dock windows into the tray when the viewport becomes too narrow", () => {
    const layout = resolveDockedWindowLayout({
      dockedPills,
      previewWidthsById: {},
      previewHeightsById: {},
      viewportWidthPx: 520,
      viewportHeightPx: 772,
      workspaceTopInsetPx: 40,
      dockBottomOffsetPx: 0,
      sideRailWidthPx: 40,
      nonClosedChatCount: 3,
      showManagerMenu: true,
      dockCycleOffsetFromEnd: 0,
    });

    // The overflow menu should take over once even a single dock panel can no longer fit.
    expect(layout.maxVisibleDockedCount).toBe(0);
    expect(layout.visibleDockedPills).toEqual([]);
    expect(layout.responsiveHiddenDockedIds).toEqual(
      new Set(["dock-1", "dock-2", "dock-3"]),
    );
    expect(layout.resolvedVisibleDockWindowWidthsById).toEqual({});
  });
});

describe("pill layout helpers", () => {
  it("switches to menu mode for multiple pills on the narrow breakpoint", () => {
    const pillDisplayMode = resolvePillDisplayMode({
      stripPillCount: 3,
      availableWidthPx: 120,
      fullWidthPx: 240,
      compactWidthPx: 140,
      viewportWidthPx: 500,
    });

    // Narrow viewports should skip compact cycling and go straight to the overflow menu.
    expect(pillDisplayMode).toBe("menu");
  });

  it("limits the visible compact pills when cycling is active", () => {
    const cycleVisibleCount = resolveCycleVisibleCount({
      pillDisplayMode: "cycle",
      pillViewportWidthPx: 172,
      stripPillCount: 5,
    });

    // The cycle row should only expose the slots that fit between the two arrow buttons.
    expect(cycleVisibleCount).toBe(2);
  });
});
