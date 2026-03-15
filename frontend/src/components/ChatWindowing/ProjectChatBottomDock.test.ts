import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  MIN_DOCK_CHAT_WIDTH_PX,
  resolveCycleVisibleCount,
  resolveDockStripReservedWidthPx,
  resolveDockWindowWidthsToFit,
  resolveDockedWindowLayout,
  resolvePillDisplayMode,
} from "./projectChatBottomDockLayout";
import {
  resolveDockCycleOffsetForOpenedWindow,
  resolveNextVisibleWindowFocusTarget,
} from "./projectChatBottomDockWindowLifecycle";

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

describe("resolveNextVisibleWindowFocusTarget", () => {
  it("skips the closing, closed, and minimized windows when picking the next focus target", () => {
    const nextFocusTarget = resolveNextVisibleWindowFocusTarget({
      closingInstanceId: "closing-window",
      orderedPills: [
        {
          instanceId: "closing-window",
          title: "Closing Window",
          mode: ChatWindowModeEnum.chat_mode,
          isClosed: false,
          isMinimized: false,
          placement: ChatWindowPlacementEnum.bottom_docked,
          zIndex: 3,
          bounds: { x: 0, y: 0, width: 460, height: 430 },
          dockWidthFraction: 1,
          dockPreferredWidthPx: 460,
          sectionId: null,
          chatId: null,
        },
        {
          instanceId: "closed-window",
          title: "Closed Window",
          mode: ChatWindowModeEnum.chat_mode,
          isClosed: true,
          isMinimized: false,
          placement: ChatWindowPlacementEnum.bottom_docked,
          zIndex: 2,
          bounds: { x: 0, y: 0, width: 460, height: 430 },
          dockWidthFraction: 1,
          dockPreferredWidthPx: 460,
          sectionId: null,
          chatId: null,
        },
        {
          instanceId: "minimized-window",
          title: "Minimized Window",
          mode: ChatWindowModeEnum.chat_mode,
          isClosed: false,
          isMinimized: true,
          placement: ChatWindowPlacementEnum.bottom_docked,
          zIndex: 1,
          bounds: { x: 0, y: 0, width: 460, height: 430 },
          dockWidthFraction: 1,
          dockPreferredWidthPx: 460,
          sectionId: null,
          chatId: null,
        },
        {
          instanceId: "next-window",
          title: "Next Window",
          mode: ChatWindowModeEnum.chat_mode,
          isClosed: false,
          isMinimized: false,
          placement: ChatWindowPlacementEnum.floating,
          zIndex: 0,
          bounds: { x: 0, y: 0, width: 460, height: 430 },
          dockWidthFraction: 1,
          dockPreferredWidthPx: 460,
          sectionId: null,
          chatId: null,
        },
      ],
    });

    expect(nextFocusTarget).toBe("next-window");
  });
});

describe("resolveDockCycleOffsetForOpenedWindow", () => {
  it("shifts the dock cycle offset so a restored docked window becomes visible", () => {
    const nextDockCycleOffset = resolveDockCycleOffsetForOpenedWindow({
      dockVisibleStartIndex: 1,
      instanceId: "dock-1",
      instanceIsMinimized: true,
      instancePlacement: ChatWindowPlacementEnum.bottom_docked,
      maxVisibleDockedCount: 2,
      openDockedPillsCount: 2,
      orderedPills: [
        {
          instanceId: "dock-1",
          title: "Chat Window 1",
          mode: ChatWindowModeEnum.chat_mode,
          isClosed: false,
          isMinimized: true,
          placement: ChatWindowPlacementEnum.bottom_docked,
          zIndex: 1,
          bounds: { x: 0, y: 0, width: 460, height: 430 },
          dockWidthFraction: 1,
          dockPreferredWidthPx: 460,
          sectionId: null,
          chatId: null,
        },
        {
          instanceId: "dock-2",
          title: "Chat Window 2",
          mode: ChatWindowModeEnum.chat_mode,
          isClosed: false,
          isMinimized: false,
          placement: ChatWindowPlacementEnum.bottom_docked,
          zIndex: 2,
          bounds: { x: 0, y: 0, width: 460, height: 430 },
          dockWidthFraction: 1,
          dockPreferredWidthPx: 460,
          sectionId: null,
          chatId: null,
        },
        {
          instanceId: "dock-3",
          title: "Chat Window 3",
          mode: ChatWindowModeEnum.chat_mode,
          isClosed: false,
          isMinimized: false,
          placement: ChatWindowPlacementEnum.bottom_docked,
          zIndex: 3,
          bounds: { x: 0, y: 0, width: 460, height: 430 },
          dockWidthFraction: 1,
          dockPreferredWidthPx: 460,
          sectionId: null,
          chatId: null,
        },
      ],
    });

    expect(nextDockCycleOffset).toBe(1);
  });

  it("returns null when the opened window is not docked", () => {
    const nextDockCycleOffset = resolveDockCycleOffsetForOpenedWindow({
      dockVisibleStartIndex: 0,
      instanceId: "floating-1",
      instanceIsMinimized: false,
      instancePlacement: ChatWindowPlacementEnum.floating,
      maxVisibleDockedCount: 2,
      openDockedPillsCount: 2,
      orderedPills: [],
    });

    expect(nextDockCycleOffset).toBeNull();
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
