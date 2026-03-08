import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  addProjectChatWindowInstanceInState,
  closeProjectChatWindowInState,
  focusProjectChatWindowInState,
  getOpenExternalProjectChatWindowInstanceForSectionInState,
  getProjectChatWindowModeForSectionInState,
  getVisibleProjectChatWindowInstances,
  maximizeProjectChatWindowInState,
  minimizeProjectChatWindowInState,
  moveProjectChatWindowToCanvasSectionInState,
  reopenProjectChatWindowInState,
  resolveDefaultDockedChatHeightPx,
  resolveDefaultFloatingChatBounds,
  setProjectChatWindowBoundsByIdInState,
  setProjectChatWindowBoundsInState,
  setProjectChatWindowDockFractionsInState,
  setProjectChatWindowModeForSectionInState,
  setProjectChatWindowPlacementInState,
  setProjectChatWindowTitleInState,
  showSectionInProjectChatWindowInState,
  undockProjectChatWindowFromCanvasSectionInState,
  unmaximizeProjectChatWindowInState,
} from "./projectChatWindowing";

describe("project chat windowing reducer helpers", () => {
  it("creates an open bottom-docked chat window instance by default", () => {
    // New instances should open docked so the dock owns the initial layout.
    const initial = createProjectChatWindowingState();

    const { state, instanceId } = addProjectChatWindowInstanceInState(initial);

    expect(instanceId).toBe("project-chat-window-1");
    const created = state.instancesById[instanceId];
    if (!created) {
      throw new Error("Expected a created project chat window instance.");
    }
    expect(created.placement).toBe(ChatWindowPlacementEnum.bottom_docked);
    expect(created.isClosed).toBe(false);
    expect(created.isMinimized).toBe(false);
    expect(state.order).toEqual([instanceId]);
  });

  it("resolves default docked chat height from the viewport height", () => {
    // Default docked windows should take seventy percent of the viewport, clamped to the dock space.
    expect(
      resolveDefaultDockedChatHeightPx({
        viewportHeightPx: 900,
        workspaceTopInsetPx: 40,
        bottomInsetPx: 36,
      }),
    ).toBe(630);
  });

  it("resolves default floating chat bounds on the right at seventy percent viewport height", () => {
    // Explicit floating windows still use the right-aligned seventy percent viewport default.
    const bounds = resolveDefaultFloatingChatBounds({
      viewportWidthPx: 1440,
      viewportHeightPx: 900,
      workspaceTopInsetPx: 40,
      bottomInsetPx: 0,
    });

    expect(bounds).toEqual({
      x: 580,
      y: 155,
      width: 820,
      height: 630,
    });
  });

  it("maximizes and restores the previous placement", () => {
    // Unmaximize should return the instance to the exact prior placement.
    const baseInstance = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
      placement: ChatWindowPlacementEnum.floating,
      bounds: {
        x: 240,
        y: 180,
        width: 900,
        height: 560,
      },
    });
    const initial = createProjectChatWindowingState({
      instancesById: { [baseInstance.instanceId]: baseInstance },
      order: [baseInstance.instanceId],
      nextInstanceNumber: 2,
    });

    const maximized = maximizeProjectChatWindowInState(
      initial,
      baseInstance.instanceId,
    );
    const maximizedInstance = maximized.instancesById[baseInstance.instanceId];
    if (!maximizedInstance) {
      throw new Error("Expected maximized instance.");
    }
    expect(maximizedInstance.isMaximized).toBe(true);
    expect(maximizedInstance.placement).toBe(ChatWindowPlacementEnum.maximized);
    expect(maximizedInstance.lastPlacementBeforeMaximize).toBe(
      ChatWindowPlacementEnum.floating,
    );

    const restored = unmaximizeProjectChatWindowInState(
      maximized,
      baseInstance.instanceId,
    );
    const restoredInstance = restored.instancesById[baseInstance.instanceId];
    if (!restoredInstance) {
      throw new Error("Expected restored instance.");
    }
    expect(restoredInstance.isMaximized).toBe(false);
    expect(restoredInstance.placement).toBe(ChatWindowPlacementEnum.floating);
    expect(restoredInstance.lastPlacementBeforeMaximize).toBeNull();
    expect(restoredInstance.bounds).toEqual({
      x: 240,
      y: 180,
      width: 900,
      height: 560,
    });
  });

  it("treats close as a true close and allows reopen", () => {
    // Close should hide the window without also leaving it in the minimized tray.
    const baseInstance = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
    });
    const initial = createProjectChatWindowingState({
      instancesById: { [baseInstance.instanceId]: baseInstance },
      order: [baseInstance.instanceId],
      nextInstanceNumber: 2,
    });

    const closed = closeProjectChatWindowInState(
      initial,
      baseInstance.instanceId,
    );
    const closedInstance = closed.instancesById[baseInstance.instanceId];
    if (!closedInstance) {
      throw new Error("Expected closed instance.");
    }
    expect(closedInstance.isClosed).toBe(true);
    expect(closedInstance.isMinimized).toBe(false);

    const reopened = reopenProjectChatWindowInState(
      closed,
      baseInstance.instanceId,
    );
    const reopenedInstance = reopened.instancesById[baseInstance.instanceId];
    if (!reopenedInstance) {
      throw new Error("Expected reopened instance.");
    }
    expect(reopenedInstance.isClosed).toBe(false);
    expect(reopenedInstance.isMinimized).toBe(false);
  });

  it("minimizes without closing and allows reopen", () => {
    // Minimize should keep the window in the tray instead of treating it as closed.
    const baseInstance = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
    });
    const initial = createProjectChatWindowingState({
      instancesById: { [baseInstance.instanceId]: baseInstance },
      order: [baseInstance.instanceId],
      nextInstanceNumber: 2,
    });

    const minimized = minimizeProjectChatWindowInState(
      initial,
      baseInstance.instanceId,
    );
    const minimizedInstance = minimized.instancesById[baseInstance.instanceId];
    if (!minimizedInstance) {
      throw new Error("Expected minimized instance.");
    }
    expect(minimizedInstance.isClosed).toBe(false);
    expect(minimizedInstance.isMinimized).toBe(true);

    const reopened = reopenProjectChatWindowInState(
      minimized,
      baseInstance.instanceId,
    );
    expect(reopened.instancesById[baseInstance.instanceId]?.isClosed).toBe(
      false,
    );
    expect(reopened.instancesById[baseInstance.instanceId]?.isMinimized).toBe(
      false,
    );
  });

  it("focuses windows by assigning increasing z-index", () => {
    // Bringing a window to front should bump z-index above all others.
    const first = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
      zIndex: 1,
    });
    const second = createProjectChatWindowInstance({
      instanceId: "chat-window-b",
      zIndex: 2,
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [first.instanceId]: first,
        [second.instanceId]: second,
      },
      order: [first.instanceId, second.instanceId],
      nextInstanceNumber: 3,
    });

    const focused = focusProjectChatWindowInState(
      initial,
      first.instanceId,
      1234,
    );
    const focusedInstance = focused.instancesById[first.instanceId];
    if (!focusedInstance) {
      throw new Error("Expected focused instance.");
    }
    expect(focusedInstance.zIndex).toBe(3);
    expect(focusedInstance.lastFocusedAt).toBe(1234);
  });

  it("updates multiple floating windows in a single reducer pass", () => {
    // Shared snap split drags should commit every affected snapped window together.
    const first = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
      placement: ChatWindowPlacementEnum.floating,
      bounds: {
        x: 40,
        y: 40,
        width: 480,
        height: 320,
      },
    });
    const second = createProjectChatWindowInstance({
      instanceId: "chat-window-b",
      placement: ChatWindowPlacementEnum.floating,
      bounds: {
        x: 520,
        y: 40,
        width: 880,
        height: 320,
      },
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [first.instanceId]: first,
        [second.instanceId]: second,
      },
      order: [first.instanceId, second.instanceId],
      nextInstanceNumber: 3,
    });

    const updated = setProjectChatWindowBoundsByIdInState(initial, {
      [first.instanceId]: {
        width: 560,
      },
      [second.instanceId]: {
        x: 600,
        width: 800,
      },
    });

    expect(updated.instancesById[first.instanceId]?.bounds.width).toBe(560);
    expect(updated.instancesById[second.instanceId]?.bounds.x).toBe(600);
    expect(updated.instancesById[second.instanceId]?.bounds.width).toBe(800);
  });

  it("returns only visible windows in normalized order", () => {
    // Visibility list should ignore closed and minimized windows and normalize duplicate order ids.
    const first = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
      isClosed: false,
    });
    const second = createProjectChatWindowInstance({
      instanceId: "chat-window-b",
      isClosed: true,
    });
    const third = createProjectChatWindowInstance({
      instanceId: "chat-window-c",
      isMinimized: true,
      isClosed: false,
    });
    const fourth = createProjectChatWindowInstance({
      instanceId: "chat-window-d",
      isClosed: false,
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [first.instanceId]: first,
        [second.instanceId]: second,
        [third.instanceId]: third,
        [fourth.instanceId]: fourth,
      },
      order: [first.instanceId, first.instanceId, second.instanceId],
      nextInstanceNumber: 5,
    });

    const visible = getVisibleProjectChatWindowInstances(initial);

    expect(visible.map((instance) => instance.instanceId)).toEqual([
      first.instanceId,
      fourth.instanceId,
    ]);
  });

  it("tracks previous placement when setting maximized placement directly", () => {
    // Direct placement updates to maximized should still preserve restore target.
    const baseInstance = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
      placement: ChatWindowPlacementEnum.canvas_section,
    });
    const initial = createProjectChatWindowingState({
      instancesById: { [baseInstance.instanceId]: baseInstance },
      order: [baseInstance.instanceId],
      nextInstanceNumber: 2,
    });

    const next = setProjectChatWindowPlacementInState(
      initial,
      baseInstance.instanceId,
      ChatWindowPlacementEnum.maximized,
    );
    const updated = next.instancesById[baseInstance.instanceId];
    if (!updated) {
      throw new Error("Expected updated instance.");
    }
    expect(updated.lastPlacementBeforeMaximize).toBe(
      ChatWindowPlacementEnum.canvas_section,
    );
  });

  it("stores a custom title for a plain project chat window", () => {
    // Plain project chats need a persisted title so their headers can rename like sections.
    const baseInstance = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
      title: null,
    });
    const initial = createProjectChatWindowingState({
      instancesById: { [baseInstance.instanceId]: baseInstance },
      order: [baseInstance.instanceId],
      nextInstanceNumber: 2,
    });

    const next = setProjectChatWindowTitleInState(
      initial,
      baseInstance.instanceId,
      "Coast Bear",
    );
    const updated = next.instancesById[baseInstance.instanceId];
    if (!updated) {
      throw new Error("Expected updated project chat window.");
    }
    expect(updated.title).toBe("Coast Bear");
  });

  it("updates dock width fractions and preferred widths for known instances", () => {
    // Resizing dock splits should persist normalized fractions for subsequent renders.
    const first = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
    });
    const second = createProjectChatWindowInstance({
      instanceId: "chat-window-b",
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [first.instanceId]: first,
        [second.instanceId]: second,
      },
      order: [first.instanceId, second.instanceId],
      nextInstanceNumber: 3,
    });

    const next = setProjectChatWindowDockFractionsInState(initial, {
      widthFractionsByInstanceId: {
        [first.instanceId]: 0.6,
        [second.instanceId]: 0.4,
      },
      dockContainerWidthPx: 1000,
    });

    const nextFirst = next.instancesById[first.instanceId];
    const nextSecond = next.instancesById[second.instanceId];
    if (!nextFirst || !nextSecond) {
      throw new Error("Expected docked windows after dock metrics update.");
    }
    expect(nextFirst.dockMetrics.widthFraction).toBe(0.6);
    expect(nextSecond.dockMetrics.widthFraction).toBe(0.4);
    expect(nextFirst.dockMetrics.preferredWidthPx).toBe(600);
    expect(nextSecond.dockMetrics.preferredWidthPx).toBe(400);
  });

  it("ignores invalid dock metric updates and returns original state", () => {
    // Invalid fractions and unknown ids must not mutate project chat windowing state.
    const first = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [first.instanceId]: first,
      },
      order: [first.instanceId],
      nextInstanceNumber: 2,
    });

    const next = setProjectChatWindowDockFractionsInState(initial, {
      widthFractionsByInstanceId: {
        "missing-window": 0.4,
        [first.instanceId]: 0,
      },
      dockContainerWidthPx: 1000,
    });

    expect(next).toBe(initial);
  });

  it("updates chat window bounds for valid values", () => {
    // Floating drags/resizes should persist in the window manager state.
    const baseInstance = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
      bounds: {
        x: 120,
        y: 120,
        width: 820,
        height: 520,
      },
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [baseInstance.instanceId]: baseInstance,
      },
      order: [baseInstance.instanceId],
      nextInstanceNumber: 2,
    });

    const next = setProjectChatWindowBoundsInState(
      initial,
      baseInstance.instanceId,
      {
        x: 340,
        y: 260,
        width: 960,
        height: 610,
      },
    );
    const updated = next.instancesById[baseInstance.instanceId];
    if (!updated) {
      throw new Error("Expected updated instance bounds.");
    }
    expect(updated.bounds).toEqual({
      x: 340,
      y: 260,
      width: 960,
      height: 610,
    });
  });

  it("ignores invalid bounds updates and returns original state", () => {
    // Non-finite numbers and non-positive size values must not mutate bounds.
    const baseInstance = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [baseInstance.instanceId]: baseInstance,
      },
      order: [baseInstance.instanceId],
      nextInstanceNumber: 2,
    });

    const next = setProjectChatWindowBoundsInState(
      initial,
      baseInstance.instanceId,
      {
        x: Number.NaN,
        y: Number.POSITIVE_INFINITY,
        width: 0,
        height: -1,
      },
    );

    expect(next).toBe(initial);
  });

  it("moves a chat window to canvas placement as a section-backed chat and reopens it", () => {
    // Booting to canvas should convert the window to real section mode before binding it.
    const target = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
      placement: ChatWindowPlacementEnum.floating,
      isClosed: true,
      isMinimized: true,
      mode: ChatWindowModeEnum.section_mode,
      zIndex: 2,
    });
    const peer = createProjectChatWindowInstance({
      instanceId: "chat-window-b",
      zIndex: 3,
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [target.instanceId]: target,
        [peer.instanceId]: peer,
      },
      order: [target.instanceId, peer.instanceId],
      nextInstanceNumber: 3,
    });

    const next = moveProjectChatWindowToCanvasSectionInState(
      initial,
      target.instanceId,
      {
        sectionId: "section-1",
        nowMs: 4321,
      },
    );
    const updated = next.instancesById[target.instanceId];
    if (!updated) {
      throw new Error("Expected updated canvas-section instance.");
    }
    expect(updated.placement).toBe(ChatWindowPlacementEnum.canvas_section);
    expect(updated.sectionIdOrNull).toBe("section-1");
    expect(updated.mode).toBe(ChatWindowModeEnum.section_mode);
    expect(updated.isClosed).toBe(false);
    expect(updated.isMinimized).toBe(false);
    expect(updated.zIndex).toBe(4);
    expect(updated.lastFocusedAt).toBe(4321);
  });

  it("moves a project-ai chat window to canvas without forcing section mode", () => {
    // Plain project chat windows should keep their project-ai surface when moved into a canvas section.
    const target = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
      placement: ChatWindowPlacementEnum.bottom_docked,
      isClosed: true,
      isMinimized: true,
      mode: ChatWindowModeEnum.project_ai_mode,
      zIndex: 2,
    });
    const peer = createProjectChatWindowInstance({
      instanceId: "chat-window-b",
      zIndex: 3,
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [target.instanceId]: target,
        [peer.instanceId]: peer,
      },
      order: [target.instanceId, peer.instanceId],
      nextInstanceNumber: 3,
    });

    const next = moveProjectChatWindowToCanvasSectionInState(
      initial,
      target.instanceId,
      {
        sectionId: "section-1",
        nowMs: 6789,
        mode: ChatWindowModeEnum.project_ai_mode,
      },
    );
    const updated = next.instancesById[target.instanceId];
    if (!updated) {
      throw new Error("Expected updated project-ai canvas-section instance.");
    }
    expect(updated.placement).toBe(ChatWindowPlacementEnum.canvas_section);
    expect(updated.sectionIdOrNull).toBe("section-1");
    expect(updated.mode).toBe(ChatWindowModeEnum.project_ai_mode);
    expect(updated.isClosed).toBe(false);
    expect(updated.isMinimized).toBe(false);
    expect(updated.zIndex).toBe(4);
    expect(updated.lastFocusedAt).toBe(6789);
  });

  it("returns original state when moving an unknown window to canvas", () => {
    // Unknown ids must not mutate state.
    const initial = createProjectChatWindowingState();

    const next = moveProjectChatWindowToCanvasSectionInState(
      initial,
      "missing-window",
      {
        sectionId: "section-1",
      },
    );

    expect(next).toBe(initial);
  });

  it("resolves section chat mode from the preferred section-bound window", () => {
    // Canvas/floating bindings should win over docked bindings for section render mode.
    const docked = createProjectChatWindowInstance({
      instanceId: "chat-window-docked",
      placement: ChatWindowPlacementEnum.bottom_docked,
      sectionIdOrNull: "section-1",
      mode: ChatWindowModeEnum.project_ai_mode,
      zIndex: 1,
    });
    const canvas = createProjectChatWindowInstance({
      instanceId: "chat-window-canvas",
      placement: ChatWindowPlacementEnum.canvas_section,
      sectionIdOrNull: "section-1",
      mode: ChatWindowModeEnum.section_mode,
      zIndex: 2,
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [docked.instanceId]: docked,
        [canvas.instanceId]: canvas,
      },
      order: [docked.instanceId, canvas.instanceId],
      nextInstanceNumber: 3,
    });

    expect(
      getProjectChatWindowModeForSectionInState(initial, "section-1"),
    ).toBe(ChatWindowModeEnum.section_mode);
    expect(getProjectChatWindowModeForSectionInState(initial, "missing")).toBe(
      ChatWindowModeEnum.section_mode,
    );
  });

  it("updates the bound section window mode when switching chat mode", () => {
    // Mode switches should persist through the section-bound project chat window instance.
    const target = createProjectChatWindowInstance({
      instanceId: "chat-window-canvas",
      placement: ChatWindowPlacementEnum.canvas_section,
      sectionIdOrNull: "section-1",
      mode: ChatWindowModeEnum.section_mode,
    });
    const peer = createProjectChatWindowInstance({
      instanceId: "chat-window-peer",
      mode: ChatWindowModeEnum.section_mode,
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [target.instanceId]: target,
        [peer.instanceId]: peer,
      },
      order: [target.instanceId, peer.instanceId],
      nextInstanceNumber: 3,
    });

    const next = setProjectChatWindowModeForSectionInState(
      initial,
      "section-1",
      ChatWindowModeEnum.project_ai_mode,
    );
    expect(next.instancesById[target.instanceId]?.mode).toBe(
      ChatWindowModeEnum.project_ai_mode,
    );
    expect(next.instancesById[peer.instanceId]?.mode).toBe(
      ChatWindowModeEnum.section_mode,
    );
  });

  it("returns original state when switching mode for unbound section", () => {
    // Mode updates should be no-ops when no project chat window is bound to the section.
    const initial = createProjectChatWindowingState();

    const next = setProjectChatWindowModeForSectionInState(
      initial,
      "missing-section",
      ChatWindowModeEnum.project_ai_mode,
    );

    expect(next).toBe(initial);
  });

  it("undocks a canvas-section window back to floating and focuses it", () => {
    // Canvas undock should restore floating placement and keep the section binding.
    const target = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
      placement: ChatWindowPlacementEnum.canvas_section,
      sectionIdOrNull: "section-1",
      isClosed: false,
      isMinimized: false,
      zIndex: 2,
    });
    const peer = createProjectChatWindowInstance({
      instanceId: "chat-window-b",
      zIndex: 3,
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [target.instanceId]: target,
        [peer.instanceId]: peer,
      },
      order: [target.instanceId, peer.instanceId],
      nextInstanceNumber: 3,
    });

    const next = undockProjectChatWindowFromCanvasSectionInState(
      initial,
      target.instanceId,
      {
        nowMs: 9876,
      },
    );
    const updated = next.instancesById[target.instanceId];
    if (!updated) {
      throw new Error("Expected updated floating instance after undock.");
    }
    expect(updated.placement).toBe(ChatWindowPlacementEnum.floating);
    expect(updated.sectionIdOrNull).toBe("section-1");
    expect(updated.isClosed).toBe(false);
    expect(updated.isMinimized).toBe(false);
    expect(updated.zIndex).toBe(4);
    expect(updated.lastFocusedAt).toBe(9876);
  });

  it("finds the visible external section window even when a canvas binding also exists", () => {
    const canvas = createProjectChatWindowInstance({
      instanceId: "chat-window-canvas",
      placement: ChatWindowPlacementEnum.canvas_section,
      sectionIdOrNull: "section-1",
      zIndex: 1,
    });
    const docked = createProjectChatWindowInstance({
      instanceId: "chat-window-docked",
      placement: ChatWindowPlacementEnum.bottom_docked,
      sectionIdOrNull: "section-1",
      zIndex: 3,
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [canvas.instanceId]: canvas,
        [docked.instanceId]: docked,
      },
      order: [canvas.instanceId, docked.instanceId],
      nextInstanceNumber: 3,
    });

    expect(
      getOpenExternalProjectChatWindowInstanceForSectionInState(
        initial,
        "section-1",
      )?.instanceId,
    ).toBe(docked.instanceId);
  });

  it("shows an existing section binding in a docked window without resetting its mode", () => {
    const canvas = createProjectChatWindowInstance({
      instanceId: "chat-window-canvas",
      placement: ChatWindowPlacementEnum.canvas_section,
      sectionIdOrNull: "section-1",
      mode: ChatWindowModeEnum.project_ai_mode,
      zIndex: 1,
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [canvas.instanceId]: canvas,
      },
      order: [canvas.instanceId],
      nextInstanceNumber: 2,
    });

    const next = showSectionInProjectChatWindowInState(initial, "section-1");

    expect(next.instancesById[canvas.instanceId]?.placement).toBe(
      ChatWindowPlacementEnum.bottom_docked,
    );
    expect(next.instancesById[canvas.instanceId]?.mode).toBe(
      ChatWindowModeEnum.project_ai_mode,
    );
    expect(next.instancesById[canvas.instanceId]?.isClosed).toBe(false);
    expect(next.instancesById[canvas.instanceId]?.isMinimized).toBe(false);
  });

  it("creates a new docked section window when a section has not been externalized yet", () => {
    const initial = createProjectChatWindowingState();

    const next = showSectionInProjectChatWindowInState(initial, "section-7");

    const created = next.instancesById["project-chat-window-1"];
    if (!created) {
      throw new Error("Expected a newly created section window.");
    }
    expect(created.sectionIdOrNull).toBe("section-7");
    expect(created.placement).toBe(ChatWindowPlacementEnum.bottom_docked);
    expect(created.mode).toBe(ChatWindowModeEnum.section_mode);
  });
});
